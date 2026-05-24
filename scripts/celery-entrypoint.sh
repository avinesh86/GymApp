#!/bin/sh
set -e

echo "Waiting for MySQL..."
while ! python -c "import MySQLdb; MySQLdb.connect(host='${MYSQL_HOST:-mysql}', user='${MYSQL_USER}', passwd='${MYSQL_PASSWORD}', db='${MYSQL_DATABASE}')" 2>/dev/null; do
    sleep 1
done
echo "MySQL is ready."

MODE=${1:-worker}

if [ "$MODE" = "worker" ]; then
    echo "Starting Celery worker..."
    exec celery -A fitops worker -l info --concurrency 4
elif [ "$MODE" = "beat" ]; then
    echo "Starting Celery beat..."
    exec celery -A fitops beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
else
    echo "Unknown mode: $MODE. Use 'worker' or 'beat'."
    exit 1
fi
