#!/bin/sh
set -e

# If /data is writable as root, chown it to the node user (uid/gid 1000)
# so SQLite can create/open the database file on a root-owned bind mount.
if [ "$(id -u)" = "0" ] && [ -w /data ]; then
  chown -R 1000:1000 /data
fi

exec su-exec node tini -- "$@"
