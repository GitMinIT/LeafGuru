FROM python:3.12-alpine

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Static files are served by whitenoise in production mode (LEAFGURU_DEBUG=0)
RUN python manage.py collectstatic --noinput

ENV LEAFGURU_DEBUG=0 \
    LEAFGURU_ALLOWED_HOSTS=* \
    DJANGO_SETTINGS_MODULE=config.settings \
    PYTHONUNBUFFERED=1

EXPOSE 8090

CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:8090 --workers 2"]