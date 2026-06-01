# Deploying FitOps to PythonAnywhere (Hacker Plan)

## Architecture on PythonAnywhere

```
Browser → PA Reverse Proxy (HTTPS)
           ↓
    Django WSGI app
    ├── /api/v1/*    → DRF API views
    ├── /static/*    → WhiteNoise (CSS/JS/React assets)
    ├── /media/*     → PA static file mapping
    └── /*           → React SPA (index.html catch-all)
```

**Key differences from Docker deployment:**
- No Redis → Celery tasks run **synchronously** (CELERY_TASK_ALWAYS_EAGER)
- No Celery workers → Periodic tasks run via PA's **scheduled task** (hourly)
- No Nginx → Django + WhiteNoise serve static files
- No separate frontend container → React is built and served by Django

---

## Step-by-step Setup

### 1. Create PythonAnywhere Account

Sign up at [pythonanywhere.com](https://www.pythonanywhere.com) → Hacker plan ($5/mo).

### 2. Clone the Repo

Open a **Bash console** from the PA Dashboard:

```bash
cd ~
git clone https://github.com/avinesh86/GymApp.git
cd GymApp
```

### 3. Create a Virtualenv

```bash
mkvirtualenv fitops --python=python3.12
pip install -r requirements/pythonanywhere.txt
```

### 4. Create the MySQL Database

1. Go to **Databases** tab in PA dashboard
2. Set a MySQL password (save it!)
3. Create a database: `yourusername$fitops`
4. Note the database host: `yourusername.mysql.pythonanywhere-services.com`

### 5. Configure Environment Variables

```bash
cd ~/GymApp
cp .env.pythonanywhere .env
nano .env  # or use PA's file editor
```

Fill in all values — especially:
- `PA_USERNAME` → your PA username
- `DJANGO_SECRET_KEY` → generate one:
  ```bash
  python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
  ```
- `MYSQL_PASSWORD` → the password from step 4
- `FIELD_ENCRYPTION_KEY` → generate one:
  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```

### 6. Build the React Frontend

```bash
cd ~/GymApp/frontend
npm ci
npm run build
cd ~/GymApp
```

### 7. Run Migrations and Collect Static Files

```bash
export DJANGO_SETTINGS_MODULE=fitops.settings.pythonanywhere
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

### 8. (Optional) Seed Demo Data

```bash
python manage.py seed_data
```

### 9. Create the Web App

1. Go to **Web** tab → **Add a new web app**
2. Select **Manual configuration** (not Django)
3. Select **Python 3.12**

### 10. Configure the Web App

In the **Web** tab, set these fields:

| Field | Value |
|-------|-------|
| **Source code** | `/home/yourusername/GymApp` |
| **Working directory** | `/home/yourusername/GymApp` |
| **Virtualenv** | `/home/yourusername/.virtualenvs/fitops` |

#### WSGI Configuration

Click the WSGI configuration file link (e.g. `/var/www/yourusername_pythonanywhere_com_wsgi.py`).

**Replace the entire contents** with:

```python
import sys
import os

# Add project to path
project_home = '/home/yourusername/GymApp'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.environ['DJANGO_SETTINGS_MODULE'] = 'fitops.settings.pythonanywhere'

# Load .env
from pathlib import Path
from decouple import Config, RepositoryEnv
env_file = Path(project_home) / '.env'
if env_file.exists():
    env_config = Config(RepositoryEnv(str(env_file)))
    for key in [
        'DJANGO_SECRET_KEY', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD',
        'MYSQL_HOST', 'PA_USERNAME', 'ALLOWED_HOSTS', 'FIELD_ENCRYPTION_KEY',
        'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET',
        'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_HOST_USER', 'EMAIL_HOST_PASSWORD',
        'DEFAULT_FROM_EMAIL', 'META_APP_SECRET', 'SENTRY_DSN',
        'CORS_ALLOWED_ORIGINS', 'FRONTEND_URL',
    ]:
        try:
            val = env_config(key, default='')
            if val:
                os.environ[key] = val
        except Exception:
            pass

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
```

> **Replace `yourusername`** with your actual PA username in both places.

### 11. Configure Static File Mappings

In the **Web** tab → **Static files** section, add:

| URL | Directory |
|-----|-----------|
| `/static/` | `/home/yourusername/GymApp/staticfiles` |
| `/media/` | `/home/yourusername/GymApp/media` |

### 12. Set Up the Scheduled Task

Go to **Tasks** tab → **Scheduled tasks** → set to run **hourly**:

```
cd /home/yourusername/GymApp && /home/yourusername/.virtualenvs/fitops/bin/python manage.py run_scheduled_tasks
```

This replaces Celery Beat and runs all periodic tasks:
- Generate recurring timetable events
- Check unfilled classes
- Expire stale cover offers
- Send cover reminders
- Process pending notifications
- Auto-generate invoices
- Send invoice reminders

### 13. Reload and Test

1. Click **Reload** on the Web tab
2. Visit `https://yourusername.pythonanywhere.com`
3. You should see the FitOps login page

---

## Updating (Redeployment)

SSH into PA and run:

```bash
cd ~/GymApp
bash scripts/pa_deploy.sh
```

Or do it manually:

```bash
cd ~/GymApp
git pull origin main
workon fitops
pip install -r requirements/pythonanywhere.txt
cd frontend && npm ci && npm run build && cd ..
python manage.py migrate --noinput
python manage.py collectstatic --noinput
touch /var/www/yourusername_pythonanywhere_com_wsgi.py
```

---

## Troubleshooting

### "Tenant not found" on login
The tenant middleware needs a TenantDomain record. Create one via Django admin or shell:
```bash
python manage.py shell
```
```python
from apps.tenants.models import Tenant, TenantDomain
t = Tenant.objects.first()  # or create one
TenantDomain.objects.create(tenant=t, domain='yourusername.pythonanywhere.com', is_primary=True)
```

### Static files not loading (404)
- Verify the static file mapping in Web tab points to `/home/yourusername/GymApp/staticfiles`
- Re-run `python manage.py collectstatic --noinput`
- Check that `frontend/dist/` exists (run `npm run build` in `frontend/`)

### MySQL connection errors
- Verify `MYSQL_HOST` is `yourusername.mysql.pythonanywhere-services.com`
- Verify the database name uses `$` separator: `yourusername$fitops`
- Check the password matches what you set in the Databases tab

### WeasyPrint PDF generation fails
PythonAnywhere has the required system libraries pre-installed. If PDFs fail:
```bash
python -c "from weasyprint import HTML; HTML(string='<h1>test</h1>').write_pdf('/tmp/test.pdf')"
```

### Celery tasks not running
On PA, tasks run synchronously via `CELERY_TASK_ALWAYS_EAGER=True`. If you see
Redis connection errors in the error log, verify `fitops/settings/pythonanywhere.py`
is being used (check `DJANGO_SETTINGS_MODULE` in the WSGI file).

### Custom domain
1. Add a CNAME record pointing to `webapp-yourusername.pythonanywhere.com`
2. In PA Web tab, add the custom domain
3. Update `.env`: `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`
4. Create a `TenantDomain` record for the custom domain
5. Reload the web app
