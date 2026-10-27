# Frontends on GitHub Pages; backend through ngrok

The combined backend proxy exposes `https://YOUR-ASSIGNED-DOMAIN.ngrok-free.app/clinic/api/...`.

Configure the repository variable `VITE_API_BASE_URL` as:

```text
https://YOUR-ASSIGNED-DOMAIN.ngrok-free.app/clinic
```

Never use the ngrok authtoken, JWT signing keys or database password as a frontend variable. `VITE_` values are embedded in browser JavaScript.

After source review and an authorized push, set Settings → Pages → Source to GitHub Actions. Run **Deploy Pages (manual)** only when publication is intended. The workflow is not triggered by push. It builds both applications and places frontdesk under `/frontdesk/`.

For a project site, the workflow sets the base from the repository name and enables hash routing. Example navigation becomes `/clinic-portfolio/#/clients`, which survives direct links and refreshes on Pages. The frontdesk links back to that main application base.

The combined Mac proxy must allow the exact website origin, such as `https://stoem21.github.io`. The proxy already handles CORS for its API routes. This source package does not embed a specific ngrok account URL.

For a local Pages-style build:

```bash
cd frontend
VITE_API_BASE_URL=https://YOUR-ASSIGNED-DOMAIN.ngrok-free.app/clinic VITE_SITE_BASE=/clinic-portfolio/ VITE_PAGES=true npm run build
VITE_API_BASE_URL=https://YOUR-ASSIGNED-DOMAIN.ngrok-free.app/clinic VITE_SITE_BASE=/clinic-portfolio/ VITE_PAGES=true npm run build:frontdesk
```

Before sharing, manually verify demo login, session expiry, navigation, evidence downloads, receipts and frontdesk links against the actual backend. The API URL's `/clinic` prefix belongs to the combined proxy, not a native Express route.

Demo visitor auto-login defaults to `true` in Compose, `.env.example` and the setup script. An existing `.env` is preserved; change `DEMO_AUTO_LOGIN=true` locally and recreate the `clinic-demo` service for an existing installation. This applies to the isolated demo database.
