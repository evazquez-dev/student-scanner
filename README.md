# Student Scanner (PWA)

RFID/Keypad student lookup PWA for Chromebooks & Android tablets.
Backed by a Google Sheets Apps Script API.

## Configure

Edit `index.html`:
- `API_BASE` = your Apps Script `/exec` URL
- `SHARED_SECRET` = value from `setupSecret()` in Apps Script

## Deploy (GitHub Pages)

1. Push to `main`.
2. Repo Settings → Pages → Source: **Deploy from a branch**, Branch: **main**, Folder: **/**.
3. Visit `https://<your-username>.github.io/student-scanner/`.

## Notes
- Service worker caches app shell only; API calls are never cached.
- Use relative paths (`./…`) so the app works under the `/student-scanner/` subpath.
