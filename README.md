# SmartIntern-ET

An AI-powered internship recommendation, clearance, and assessment management system for Ethiopian higher education. Students receive ranked, explained recommendations based on their profile, skills, and CV across three distinct tracks (Campus Track, Official Company Track, and Direct Company Placement).

## Overview

The project combines a Django REST API backend, an AI recommendation engine, and a React + TypeScript frontend to support internship discovery, student profiling, CV parsing, and admin monitoring.

### Core capabilities

- Student registration, login, profile building, and CV upload
- AI-powered internship recommendation engine
- Saved internships and application tracking
- Admin dashboard with analytics, review queue, and data source health monitoring
- Production-ready Docker setup for backend, frontend, Postgres, Redis, and Celery

## Architecture

### Backend

- Django 6 + Django REST Framework
- JWT authentication and role-based access control
- Celery + Redis for async CV parsing and notifications
- PostgreSQL database
- AI engine with embeddings, semantic matching, and recommendation scoring

### Frontend

- React + TypeScript + Vite
- Tailwind CSS and component-based UI
- Protected and role-based routing for student and admin access
- API integration with JWT refresh flow and application tracking

### Infrastructure

- `docker-compose.yml` for local development
- `docker-compose.prod.yml` for production deployment
- `backend/Dockerfile` and `frontend/Dockerfile`
- Nginx serving the frontend and proxying API requests in production

## Repository structure

```text
SmartIntern-ET/
├── backend/
│   ├── ai_engine/
│   ├── apps/
│   ├── config/
│   ├── media/
│   ├── scripts/
│   ├── requirements/
│   ├── manage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── docker-compose.prod.yml
├── README.md
├── COMPONENT_AUDIT_REPORT.md
├── DESIGN_SYSTEM.md
├── FRONTEND_MODERNIZATION_PROGRESS.md
├── FRONTEND_UI_AUDIT_REPORT.md
├── PHASE_11_VERIFICATION_REPORT.md
├── TASK_11.6_BACKUP_RECOVERY_REPORT.md
└── ...
```

## Local development setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL
- Redis

### 1) Backend

```bash
cd backend

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### 2) Frontend

```bash
cd frontend

npm install
npm run dev
```

The frontend runs at http://localhost:5173 and the backend at http://localhost:8000.

### Frontend development

The frontend uses React 18, TypeScript, Vite, Redux Toolkit, React Router, Axios,
Tailwind CSS, and Vitest. Axios attaches JWT access tokens, retries once after a
token refresh, and logs the user out when refresh fails.

The frontend development server proxies `/api` and `/media` to the backend at
`http://127.0.0.1:8000`. The frontend environment variables are:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_BACKEND_URL=http://localhost:8000
```

Run frontend quality checks from `frontend/`:

```bash
npm run lint
npm test -- --run
npm run build
npm run preview
```

## Environment variables

Use secure values in your deployment environment. Essential examples include:

### Backend

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `DATABASE_URL`
- `REDIS_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `SITE_BASE_URL`
- `EMAIL_BACKEND`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`

### Frontend

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_BACKEND_URL=http://localhost:8000
```

Do not commit `.env`, API keys, JWT secrets, or production passwords.

## Application workflows

### Authentication and profiles

- Registration, email verification, login, password reset, and Google OAuth
- Protected, public, and role-based routes
- Student profile, education, skills, interests, and internship preferences
- PDF/DOCX CV upload with validation, background parsing, and extracted profile data

### Recommendations and applications

- Semantic and skill-based internship ranking with match explanations
- Search with debounced keywords and location, type, work mode, and skill filters
- Save/unsave internships with immediate UI synchronization
- Validated external application redirects with non-blocking application tracking

### Administration

- Student activation, activity logs, and role-protected administration routes
- Internship review queue for invalid links and duplicate listings
- Data-source health monitoring and recommendation analytics

## Frontend application flow

```text
Register or log in
    -> Build profile and upload CV
    -> CV parsing and skill extraction
    -> AI-ranked recommendations
    -> Search, save, or apply
    -> Application tracking and admin analytics
```

## Production deployment

### Production stack

The repository includes a production stack with:

- PostgreSQL database service
- Redis service
- Django backend running under Gunicorn
- Celery worker and scheduler
- Frontend app served via Nginx

### Deployment steps

1. Create the root Compose environment file from the checked-in template:

```bash
cp .env.prod.example .env
```

    Edit `.env` and replace every placeholder, especially `SECRET_KEY`, `POSTGRES_PASSWORD`, `ALLOWED_HOSTS`, `SITE_BASE_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS`.

2. Build and start the stack:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

3. Run database migrations:

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```

4. Create an admin account if needed:

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

5. Collect static files:

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput
```

6. Verify the health endpoint:

```bash
curl http://localhost:8000/api/health/
```

7. Enable HTTPS termination in front of the app and set secure cookies/CORS rules for production.

8. Review application logs:

```bash
docker compose -f docker-compose.prod.yml logs -f backend celery worker
```

## Verification summary

### Backend

- Django production settings load successfully after installing required runtime packages
- `python manage.py check --deploy --settings=config.settings.production` runs without fatal errors
- Remaining issues are warnings for HSTS, secure cookies, schema type hints, and naming collisions, which are production hardening recommendations rather than startup blockers

### Frontend

- Production build passes successfully:

```bash
cd frontend
npm run build
```

- Output is generated in `frontend/dist/` without TypeScript fail or broken bundle generation

## Production readiness verdict

The application is in a strong deployment-ready state for a properly configured production environment. The codebase and deployment structure are in place, the frontend build passes, and the backend production configuration loads successfully once the required runtime packages are installed.

The remaining deployment work is mostly operational: secure the environment variables, ensure HTTPS is terminated correctly, and harden cookie/CSRF settings in the production site configuration.

## Business logic flow

1. User registers and completes a profile
2. User uploads a CV and extracts skills/education information
3. Recommendation engine ranks internships based on skill and semantic match score
4. User saves or applies to internships
5. Admin reviews flagged or duplicate postings and monitors platform data
6. Analytics track recommendation quality and system health

## Recommended production checklist

- Set a strong unique `SECRET_KEY`
- Keep the app behind HTTPS-only ingress
- Restrict `ALLOWED_HOSTS`
- Use secure PostgreSQL and Redis credentials
- Configure email delivery with a real provider
- Enable Sentry or another error-monitoring system
- Run a hardened reverse proxy or load balancer in front of the app
