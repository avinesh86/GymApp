#!/bin/sh
set -e

echo "Waiting for MySQL..."
while ! python -c "import MySQLdb; MySQLdb.connect(host='${MYSQL_HOST:-mysql}', user='${MYSQL_USER}', passwd='${MYSQL_PASSWORD}', db='${MYSQL_DATABASE}')" 2>/dev/null; do
    sleep 1
done
echo "MySQL is ready."

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "Starting application..."
exec "$@"
