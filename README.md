# EagleNEST Student Scanner Frontend

Static GitHub Pages/PWA frontend for EagleNEST student scanning, staff/admin tools, student status, Visitor Management, and scanner diagnostics.

## Architecture

The frontend talks to the **Cloudflare Worker API**, not directly to an Apps Script Web App.

```text
student-scanner frontend
        -> Cloudflare Worker
        -> KV / Durable Objects / GAS / PowerSchool integrations as appropriate
```

The main scanner currently uses the configured Worker `API_BASE` in `index.html`. Admin and Visitor pages use the same Worker API/origin configuration pattern.

**Never place backend shared secrets, Worker admin tokens, PowerSchool credentials, or Apps Script shared secrets in frontend HTML/JavaScript.** Browser code is public.

## Main surfaces

- `/` — student scanner/kiosk PWA
- `/admin/` — authenticated staff/admin tools
- `/student/` — student-facing status
- `/visitor/` — bilingual Visitor kiosk/PWA
- `/scanner-lab/` — scanner/ID diagnostics
- `/tests/` — static/regression tests

## Deploy with GitHub Pages

1. Review/test the intended frontend changes.
2. Push the `student-scanner` Git repository to the deployment branch (currently `main`).
3. GitHub Pages should deploy from the configured branch/root.
4. Verify the deployed frontend can reach the Worker and that protected admin pages still require normal authentication.

## Useful checks

From this repository, run the project tests available under `tests/` before release. Visitor scanner/OCR assets are vendored under `visitor/vendor/`; no runtime cloud OCR/barcode service is required for the local ID prefill paths.

## Related documentation

At the umbrella `Student Scanner Project/` level:

- `PROJECT_OVERVIEW.txt` — architecture and source-of-truth map
- `SECURITY_NOTES.md` — security/privacy rules
- `VISITOR_SETUP.md` — Visitor Management setup/operations
- `SCHOOL_YEAR_ROLLOVER_GUIDE.md` — annual rollover procedure
