FROM python:3.12-alpine

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The app runs as the unprivileged `leaf` user, so the tree it has to
# read must be readable by it. A fresh clone can carry any file modes
# (git only tracks the executable bit), so the build normalises them
# instead of depending on them.
RUN chmod -R a+rX /app

# Static files are served by whitenoise in production mode (LEAFGURU_DEBUG=0)
RUN python manage.py collectstatic --noinput

ENV LEAFGURU_DEBUG=0 \
    DJANGO_SETTINGS_MODULE=config.settings \
    PYTHONUNBUFFERED=1

# su-exec is Alpine's setuid helper: the start script runs as root
# long enough to fix the data volume's ownership, then drops to the
# unprivileged app user.
RUN apk add --no-cache su-exec \
 && addgroup -g 1000 leaf \
 && adduser -D -u 1000 -G leaf leaf \
 && mkdir -p /data \
 && chown leaf:leaf /data

EXPOSE 8090

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

CMD ["/usr/local/bin/docker-entrypoint.sh"]