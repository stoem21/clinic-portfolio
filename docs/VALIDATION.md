# Validation status

Last reviewed **28 October 2026**. [GitHub Actions](https://github.com/stoem21/clinic-portfolio/actions/workflows/ci.yml) reports checks for each published revision.

| Check | Verified result |
| --- | --- |
| Backend TypeScript build | Passed locally and in GitHub Actions |
| Backend tests, including HTTP routes | 297 tests in 23 suites passed locally and in GitHub Actions |
| Main frontend and frontdesk production builds | Passed in GitHub Actions with fresh npm dependency installation |
| Pages routing and main demo auto-login | Verified in a browser against the existing isolated demo runtime |
| Fresh npm installation from lockfiles | Backend verified locally; backend and frontend verified in GitHub Actions |
| Public API access and CORS | Both health routes, demo login, allowed-origin preflight and rejection of an unapproved origin verified against the existing runtime |
| Fresh Docker build, migrations and database seed | Not executed as part of portfolio validation |
| Frontdesk operational status | Not yet used in live clinic operations; complete end-to-end validation is pending |
| Receipt rendering, evidence downloads and full interactive workflows | Further runtime review required |

Backend tests mock Prisma and external services. They exercise request handling and application rules without a production database; passing them does not verify fresh database initialization or external cloud integrations. Legacy patient-import scripts and their import-specific tests are excluded from this public demo.

The same-day treatment audit test uses fixed clock instants on both sides of Bangkok midnight. Clinical visit dates are calendar values stored at UTC midnight, while the current clinical day is defined in Asia/Bangkok.

Live demo checks were recorded on 27–28 October 2026. They used the existing isolated backend with synthetic records. No production patient import, actual cloud backup or destructive database reset was performed.
