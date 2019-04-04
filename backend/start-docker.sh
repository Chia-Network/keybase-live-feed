CHIA_KEYBASE_USERNAME=chiachatbot
CHIA_KEYBASE_PAPERKEY="margin occur hole flat judge ranch exhaust strong aim stuff busy empty patch"

# start Keybase service
keybase service &

# log into Keybase using paperkey
# (to get the paperkey, log into Keybase from another device, then run `keybase paperkey`)
keybase oneshot -u "$CHIA_KEYBASE_USERNAME" --paperkey "$CHIA_KEYBASE_PAPERKEY"

# this command would be used to join Chia's Keybase Chat public channel
# it should already be run as part of the Keybase bot's setup
# keybase team request-access chia_network.public

# start Express/Socket.IO server
cd /app/backend/src
export NODE_ENV=production # use production mode for Express
while true; do node index.js; sleep 3; done
