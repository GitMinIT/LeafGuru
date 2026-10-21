#!/bin/sh
# LeafGuru start script.
#
# The data volume is created by Docker as root, so its ownership is
# fixed here (once) before the app drops to the unprivileged user.
#
# The migration runs as the APP USER, not as root: a root-owned
# database file cannot be written by the app, and every API call that
# touches the database would fail with a 500.
set -e

DATA_DIR="${LEAFGURU_DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    # the volume may hold a database created by an older image (root)
    chown -R leaf:leaf "$DATA_DIR" 2>/dev/null || true
    cd /app
    # migrate as the app user, so the database file is owned by it
    su-exec leaf:leaf python manage.py migrate --noinput
    exec su-exec leaf:leaf \
        gunicorn config.wsgi:application --bind 0.0.0.0:8090 --workers 2 \
        --access-logfile - --error-logfile -
fi

cd /app
python manage.py migrate --noinput
exec gunicorn config.wsgi:application --bind 0.0.0.0:8090 --workers 2 \
     --access-logfile - --error-logfile -
