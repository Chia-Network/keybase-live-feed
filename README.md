Keybase Live Feed
=================

Overview
--------

Backend and frontend services for showing the contents of a Keybase team on your website. It looks like this:

![keybase screenshot](https://i.ibb.co/TMhJ8j7/keybase.png)

(from [Chia Network](https://www.chia.net/community/))

Backend built with Node.js, Socket.IO, and Keybase. Deployed on AWS EC2 Debian. Alternatively: Docker/Kubernetes on Google Cloud with Cloud Load Balancing.

Frontend built with React, React-Markdown, Bootstrap, Socket.IO, and Socket.IO.

Deployment on Debian on AWS EC2
-------------------------------

Set up an A record to make `dev.chia.net` to point to the static IP of the EC2 instance. Make sure its firewall rules are set to allow HTTP and HTTPS traffic.

```bash
# install Node.js and Keybase dependencies
sudo apt-get update && sudo apt-get upgrade -y && sudo apt-get -y install curl fuse vim libappindicator-dev unzip nginx
curl -L https://deb.nodesource.com/setup_11.x | sudo -E bash
sudo apt-get -y update && sudo apt-get install -y nodejs
curl -O https://prerelease.keybase.io/keybase_amd64.deb
sudo dpkg -i keybase_amd64.deb
sudo apt-get install -f -y

# get application onto server
sudo rm -rf /var/www/keybaselivefeed
sudo mkdir -p /var/www/keybaselivefeed
# MANUAL STEP: download code from https://github.com/Uberi/keybase-live-feed/archive/master.zip as `code.zip` to your local computer, then run `scp code.zip USERNAME@MACHINE_IP_ADDRESS:~` on your local computer
cd ~
sudo unzip code.zip -d /var/www/keybaselivefeed
sudo mv /var/www/keybaselivefeed/keybase-live-feed-master/* /var/www/keybaselivefeed/

# set up application
cd /var/www/keybaselivefeed/frontend
sudo npm install
sudo npm run build && sudo cp -r /var/www/keybaselivefeed/frontend/build/. /var/www/keybaselivefeed/backend/src/static
cd /var/www/keybaselivefeed/backend
sudo npm install

# set up restricted user and autostart on boot
sudo adduser --system --disabled-login --group keybaselivefeed
sudo tee /lib/systemd/system/keybaselivefeed.service << 'EOF'
[Unit]
Description=KeybaseLiveFeed

[Service]
Type=simple
PrivateTmp=yes
User=keybaselivefeed
Group=keybaselivefeed
ExecStart=/bin/bash /var/www/keybaselivefeed/backend/start-linux.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable keybaselivefeed.service

# set up Nginx for reverse proxying
sudo tee /etc/nginx/conf.d/keybaselivefeed.conf << 'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name ~.;

    # websockets support
    location /socket.io/ {
        proxy_pass "http://127.0.0.1:4000/socket.io/";
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        client_max_body_size 1000M;
    }
}
EOF

# set up HTTPS
cd /var/www/keybaselivefeed
sudo curl -O https://dl.eff.org/certbot-auto
sudo chmod a+x certbot-auto
sudo ./certbot-auto --nginx
# MANUAL STEP: set up Let's Encrypt cronjob by adding `19 0,12 * * * /var/www/keybaselivefeed/certbot-auto renew >> /var/www/keybaselivefeed/letsencrypt-renew-certificate.log 2>&1` in the root crontab with `sudo crontab -e`

# start keybase-live-feed and Nginx
sudo systemctl start keybaselivefeed.service
sudo service nginx restart
```

To view Keybase Live Feed logs, use:

```bash
sudo journalctl -u keybaselivefeed.service
```

To update with the latest changes:

```bash
# get application onto server
sudo rm -rf /var/www/keybaselivefeed
sudo mkdir -p /var/www/keybaselivefeed
# MANUAL STEP: download code from https://github.com/Uberi/keybase-live-feed/archive/master.zip as `code.zip` to your local computer, then run `scp code.zip USERNAME@MACHINE_IP_ADDRESS:~` on your local computer
cd ~
sudo unzip code.zip -d /var/www/keybaselivefeed
sudo mv /var/www/keybaselivefeed/keybase-live-feed-master/* /var/www/keybaselivefeed/

# set up application
cd /var/www/keybaselivefeed/frontend
sudo npm install
sudo npm run build && sudo cp -r /var/www/keybaselivefeed/frontend/build/. /var/www/keybaselivefeed/backend/src/static
cd /var/www/keybaselivefeed/backend
sudo npm install

# restart keybase-live-feed and Nginx
sudo systemctl restart keybaselivefeed.service
sudo service nginx restart
```

Deployment via Google Kubernetes Engine
---------------------------------------

This isn't used at the moment - we're using the Ubuntu deployment on an EC2 instance instead.

One-time setup:

```bash
gcloud auth login
gcloud auth configure-docker
```

Keybase live feed initial deployment:

```bash
export PROJECT_ID="opportune-bot-206722"
export NUM_NODES=1
export VERSION=v12

# configure current project
gcloud config set project "$PROJECT_ID"
gcloud config set compute/zone us-east1-b

# build Docker image for application
docker build -t gcr.io/${PROJECT_ID}/keybase-live-feed:${VERSION} .
docker push gcr.io/${PROJECT_ID}/keybase-live-feed:${VERSION}

# create a Kubernetes cluster with $NUM_NODES machines
gcloud container clusters create keybase-live-feed-cluster --num-nodes=$NUM_NODES

# run the Docker image on the Kubernetes cluster, with port 4000 exposed (the running instance of the image is known as a "deployment")
kubectl run keybase-live-feed --image=gcr.io/${PROJECT_ID}/keybase-live-feed:${VERSION} --port 4000

# create a NodePort service to expose the Docker image deployment on each node on a randomly selected high port number
kubectl expose deployment keybase-live-feed --target-port=4000 --type=NodePort

# create Ingress to load-balance and perform HTTS termination
kubectl apply -f keybase-live-feed-ingress.yaml

# create a DNS entry for keybase.chia.net pointing to the new Ingress's IP (get the IP from the `kubectl get ingress`)

# set up the new load balancer at https://console.cloud.google.com/net-services/loadbalancing/loadBalancers/list (it should have an HTTPS frontend with a Google-managed certificate for keybase.chia.net)

# promote the ephemeral IP to a static IP: https://cloud.google.com/compute/docs/ip-addresses/reserve-static-external-ip-address#promote_ephemeral_ip

# set up StackDriver for logging: https://cloud.google.com/monitoring/kubernetes-engine/installing (logs are then visible under https://console.cloud.google.com/logs/viewer, when you select the "GKE Container, keybase-live-feed, default" resource and perform a search)
```

Scaling up Keybase live feed:

```bash
# scale up to three running instances of the Docker image
kubectl scale deployment keybase-live-feed --replicas=3
```

Applying rolling update to Keybase live feed:

```bash
export PROJECT_ID="opportune-bot-206722"
export VERSION=v13

docker build -t gcr.io/${PROJECT_ID}/keybase-live-feed:${VERSION} .
docker push gcr.io/${PROJECT_ID}/keybase-live-feed:${VERSION}
kubectl set image deployment/keybase-live-feed keybase-live-feed=gcr.io/${PROJECT_ID}/keybase-live-feed:${VERSION}
```

Shutting down Keybase live feed:

```bash
kubectl delete ingress keybase-live-feed-ingress
gcloud container clusters delete keybase-live-feed

# turn off StackDriver for logging

# remove the load balancer at https://console.cloud.google.com/net-services/loadbalancing/loadBalancers/list

# release static IP addresses at https://console.cloud.google.com/networking/addresses/list

# remove DNS entry for keybase.chia.net
```
