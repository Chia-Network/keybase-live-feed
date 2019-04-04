# build command: docker build --tag keybaselivefeed .
# run command: docker run -i -t keybaselivefeed:latest

FROM debian:stretch

# install dependencies
RUN apt-get -y update && \
    apt-get -y install curl fuse libappindicator-dev && \
    curl -L https://deb.nodesource.com/setup_11.x | bash && \
    apt-get -y update && apt-get install -y nodejs && \
    curl -O https://prerelease.keybase.io/keybase_amd64.deb && \
    dpkg -i keybase_amd64.deb; \
    rm -r keybase_amd64.deb && \
    apt-get install -f -y

COPY . /app
WORKDIR /app

# builds the frontend
RUN cd /app/frontend && npm install
RUN cd /app/frontend && npm run build && cp -r /app/frontend/build/. /app/backend/src/static

# builds the backend
RUN cd /app/backend && npm install

EXPOSE 4000

# set user as non-root in order to avoid Keybase warning
RUN useradd -ms /bin/bash keybaselivefeed
USER keybaselivefeed

ENTRYPOINT [ "bash", "/app/backend/start-docker.sh" ]