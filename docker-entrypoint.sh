#!/bin/sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

CURRENT_UID="$(id -u node)"
CURRENT_GID="$(id -g node)"

if [ "$CURRENT_UID" != "$PUID" ] || [ "$CURRENT_GID" != "$PGID" ]; then
    CONFLICT_USER="$(awk -F: -v uid="$PUID" '$3==uid{print $1}' /etc/passwd)"
    CONFLICT_GROUP="$(awk -F: -v gid="$PGID" '$3==gid{print $1}' /etc/group)"

    [ -n "$CONFLICT_USER" ] && deluser "$CONFLICT_USER" >/dev/null 2>&1 || true
    deluser node >/dev/null 2>&1 || true
    [ -n "$CONFLICT_GROUP" ] && delgroup "$CONFLICT_GROUP" >/dev/null 2>&1 || true
    delgroup node >/dev/null 2>&1 || true

    addgroup -g "$PGID" node
    adduser -D -u "$PUID" -G node node
fi

if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
    cp "/usr/share/zoneinfo/$TZ" /etc/localtime
    echo "$TZ" > /etc/timezone
fi

chown -R node:node /app/.cache /app/logs

exec su-exec node:node "$@"
