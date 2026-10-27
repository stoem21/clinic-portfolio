# Dental Clinic — Full-stack Portfolio

A React and Express application for fictional dental-clinic workflows: patient records, treatment history, appointments, receipts, lab work and role-based access. The portfolio copy uses generic branding and an isolated PostgreSQL demo database.

## Live demo

[Open the Clinic demo](https://stoem21.github.io/clinic-portfolio/)

The public demo signs visitors in automatically and uses fictional patient and financial records in an isolated database. The backend runs on a Mac through an HTTPS tunnel, so interactive features are available while the host and tunnel are online.

![Clinic dashboard with fictional demo records](docs/images/clinic-demo.jpg)

*Screenshot of the demo dashboard; all patient and financial figures are synthetic.*

> **Frontdesk status:** The frontdesk module has not yet been used in live clinic operations. It is included for demonstration; end-to-end workflow validation is still pending.

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS, Radix UI |
| Application state and forms | Zustand, React Router, React Hook Form, Zod, Axios |
| Backend | Node.js 22, Express 5, TypeScript, JWT, optional TOTP |
| Persistence | PostgreSQL 16, Prisma 6, migrations |
| Delivery | Docker Compose; optional GitHub Pages frontends and ngrok-hosted APIs |

## Features to explore

- Patient and dentist management, treatment records and payment categories.
- Frontdesk demo: appointment scheduling, follow-up calls and lab jobs (not yet used in live clinic operations).
- Receipts and printable documents using a fictional demo letterhead.
- Role checks, audit events, soft deletion and restoration.
- Thai/English interface support.

## Run a fresh local demo

Requires Docker Desktop. From this repository root:

```bash
python3 scripts/setup-demo.py
docker compose up -d --build
```

Open `http://localhost:4101`; the frontdesk is `http://localhost:4101/frontdesk/`. The username is `demo`; read `DEMO_PASSWORD` locally in the generated `.env`. The setup helper creates random local secrets and refuses to overwrite an existing `.env`.

The Compose project is `clinic-portfolio`, with its own database volume. Initialization accepts only `DEMO_MODE=true` and `clinic-db/clinic_demo`; it refuses an existing unmarked database. Restarting retains demo edits. Automatic visitor login is enabled by default (`DEMO_AUTO_LOGIN=true`), as requested for the portfolio. Visitors receive the demo account permissions in the isolated demo database. Daily fixture generation remains disabled. The setup script preserves an existing `.env`; set `DEMO_AUTO_LOGIN=true` there if it was created earlier, then recreate the demo app container.

```bash
docker compose stop
```

## Architecture

```mermaid
flowchart LR
  UI[React clinic and frontdesk] --> API[Express REST API]
  API --> ORM[Prisma]
  ORM --> DB[(PostgreSQL demo database)]
```

## GitHub Pages with a backend on a Mac

See [deployment configuration](docs/DEPLOYMENT.md). The frontend build supports `VITE_API_BASE_URL`, a project-site base path and hash routing for Pages. Backend runtime configuration, credentials, patient imports and database dumps are excluded.

## Validate

```bash
cd backend
npm ci
npx prisma generate
npm run build
npm test
```

In a separate terminal:

```bash
cd frontend
npm ci
npm run build
npm run build:frontdesk
```

See [validation scope](docs/VALIDATION.md) for checks actually completed on this prepared copy and checks still requiring a normal local runtime.

## Source and attribution

The snapshot derives from the isolated demo version of the application. Its public copy has generic branding, safe fixture entrypoints, Pages routing and API configuration. Current lab-period and OneDrive folder-creation fixes were carried into this copy. Imports of legacy patient data are not part of this repository.

The address picker includes geographic reference data derived from `geothai`; check its attribution and redistribution terms before publication. Third-party packages retain their own licenses. No open-source license or personal authorship claim is inferred by this preparation; those choices await the owner's review.
