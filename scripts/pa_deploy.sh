#!/bin/bash
# ─── PythonAnywhere deployment script ────────────────────────────────────────
# Run from the project root: bash scripts/pa_deploy.sh
#
# This script:
# 1. Pulls latest code from git
# 2. Installs Python dependencies
# 3. Builds the React frontend
# 4. Runs Django migrations
# 5. Collects static files
# 6. Touches the WSGI file to reload the web app
#
# Prerequisites:
# - virtualenv 'fitops' exists: mkvirtualenv fitops --python=python3.12
# - .env file configured at project root
# - MySQL database created via PA Databases tab
# - Web app configured in PA Web tab

set -e

# ─── Config ──────────────────────────────────────────────────────────────────
PA_USERNAME="${PA_USERNAME:-$(whoami)}"
PROJECT_DIR="/home/${PA_USERNAME}/GymApp"
VENV_DIR="/home/${PA_USERNAME}/.virtualenvs/fitops"
WSGI_FILE="/var/www/${PA_USERNAME}_pythonanywhere_com_wsgi.py"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "FitOps PythonAnywhere Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_DIR"

# ─── 1. Pull latest code ─────────────────────────────────────────────────────
echo ""
echo "▸ Pulling latest code..."
git pull origin main

# ─── 2. Activate virtualenv and install deps ─────────────────────────────────
echo ""
echo "▸ Installing Python dependencies..."
source "${VENV_DIR}/bin/activate"
pip install -r requirements/pythonanywhere.txt --quiet

# ─── 3. Build React frontend ────────────────────────────────────────────────
echo ""
echo "▸ Building React frontend..."
cd frontend
npm ci --silent
npm run build
cd "$PROJECT_DIR"

# ─── 4. Run migrations ──────────────────────────────────────────────────────
echo ""
echo "▸ Running database migrations..."
export DJANGO_SETTINGS_MODULE=fitops.settings.pythonanywhere
python manage.py migrate --noinput

# ─── 5. Collect static files ────────────────────────────────────────────────
echo ""
echo "▸ Collecting static files..."
python manage.py collectstatic --noinput --clear

# ─── 6. Reload web app ──────────────────────────────────────────────────────
echo ""
echo "▸ Reloading web app..."
if [ -f "$WSGI_FILE" ]; then
    touch "$WSGI_FILE"
    echo "  Touched ${WSGI_FILE}"
else
    echo "  WSGI file not found at ${WSGI_FILE}"
    echo "  Reload manually from the PA Web tab."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Deploy complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
