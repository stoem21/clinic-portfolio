# Validation of this prepared source copy

Validation recorded during portfolio preparation, 23–27 October 2026. GitHub Actions supplies the validation status for published revisions.

| Check | Result |
| --- | --- |
| Backend TypeScript check | Passed |
| Main frontend TypeScript and Vite production build | Passed, using Pages base and a placeholder combined-proxy API URL |
| Frontdesk TypeScript and Vite production build | Passed, using Pages base and the same API base |
| Frontdesk operational status | Not yet used in live clinic operations; end-to-end workflow validation is pending |
| Socket-free backend unit tests | 101 passed in 13 suites |
| Full backend test suite, including HTTP routes | Passed: 296 tests in 23 suites after local network access was enabled |
| Fresh dependency installation from the lockfiles | Not executed; available local dependencies were reused for validation |
| Docker build, migrations and fresh synthetic seed | Not executed in this sandbox |
| Demo auto-login and dashboard | Passed in browser against the existing isolated demo runtime; public tunnel API login also passed |
| Receipt rendering, evidence download and full interactive flows | Owner runtime review required |

The first test pass exposed two differences between the demo snapshot and current source: lab-period deductions and OneDrive folder creation. Their current source fixes were copied into this public snapshot; the socket-free suite then passed.

The legacy CSV-import scripts and their three import-specific suites are excluded because patient-data migration is outside this public demo's scope. HTTP tests remain present in the repository and are included in CI. They passed locally once the environment allowed sockets.

Do not describe the complete backend or Docker setup as verified until those checks pass in a normal runtime. No actual cloud backup, patient import or destructive reset was executed during preparation.

Live checks on 27 October 2026: both backend health routes, actual demo auto-login, GitHub Pages CORS/preflight and rejection of an unapproved origin passed through the combined proxy and a temporary public ngrok route. A Pages-style frontend build opened the demo dashboard automatically in a browser. The existing runtime was used; this does not verify a fresh Docker build or migrations. The complete backend test suite passed separately afterward. The old standalone tunnel route was restored after checking and temporary preview services were stopped.
