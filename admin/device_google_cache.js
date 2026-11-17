// Google Admin reference cache controller.
// The user starts/resumes each run. Work is not claimed to continue
// in the background when the page is closed.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('dmGoogleCache');
  if (!root) return;

  const API_BASE = (
    document.querySelector('meta[name="api-base"]')?.content || ''
  ).replace(/\/+$/,'')+'/';

  let busy = false;

  async function api(path,method='GET') {
    const headers = new Headers();
    const sid = window.EAGLENEST_AUTH?.getSid?.();
    if (sid) headers.set('x-admin-session',sid);
    if (method==='POST') headers.set('content-type','application/json');

    const response = await fetch(
      new URL(path.replace(/^\//,''),API_BASE),{
        method,headers,credentials:'include',cache:'no-store',
        ...(method==='POST' ? {body:'{}'} : {})
      }
    );
    const next = response.headers.get('x-admin-session');
    if (next) window.EAGLENEST_AUTH?.setSid?.(next);
    const data = await response.json().catch(()=>null);
    if (!response.ok || !data?.ok)
      throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  root.innerHTML = `
    <div class="dmCacheHeader">
      <div>
        <h2>Google Admin Reference Cache</h2>
        <p class="dmSmall dmMuted">
          Import Google-managed and retained deprovisioned records for
          faster serial-number searches. No student assignments are created.
        </p>
      </div>
      <div class="dmActions">
        <button type="button" class="dmButton" id="dmCacheRefresh">
          Check status
        </button>
        <button type="button" class="dmButton dmPrimary"
          id="dmCacheStart">Build / Resume Snapshot</button>
      </div>
    </div>
    <p class="dmSmall" id="dmCacheProgress" role="status">
      Sign in to check the Google reference cache.
    </p>
    <p class="dmSmall dmMuted" id="dmCacheHelp">
      A run can be resumed after closing this page. The sync only makes
      progress while its batch requests are being sent.
    </p>`;

  function render(data) {
    const c = data.cache || {};
    const parts = [
      `Status: ${c.status || 'idle'}`,
      `Cached devices: ${Number(data.total_cached || 0)}`,
      `Records scanned: ${Number(c.scanned_count || 0)}`,
      `Pages: ${Number(c.page_count || 0)}`
    ];
    if (c.phase && c.phase !== 'done')
      parts.push(`Stage: ${c.phase}`);
    if (c.completed_at)
      parts.push(`Completed: ${new Date(c.completed_at).toLocaleString()}`);
    if (c.last_error)
      parts.push(`Last error: ${c.last_error}`);

    $('dmCacheProgress').textContent = parts.join(' · ');
    $('dmCacheStart').textContent =
      c.status === 'complete' ? 'Refresh Snapshot' :
      c.status === 'running' || c.status === 'failed'
        ? 'Resume Snapshot' : 'Build Snapshot';
  }

  async function checkStatus() {
    try {
      render(await api('/admin/device-management/google/cache/status'));
    } catch (error) {
      $('dmCacheProgress').textContent =
        'Cache status unavailable: ' + error.message;
    }
  }

  async function run() {
    if (busy) return;
    busy = true;
    $('dmCacheStart').disabled = true;
    $('dmCacheRefresh').disabled = true;
    try {
      render(await api('/admin/device-management/google/cache/start','POST'));
      // Each invocation retrieves a single page and commits it to D1.
      // No page cursor is stored in the browser.
      for (let i=0; i<10000; i++) {
        const result = await api(
          '/admin/device-management/google/cache/step','POST'
        );
        render(result);
        if (result.cache?.status === 'complete') break;
        await new Promise(resolve=>setTimeout(resolve,150));
      }
    } catch (error) {
      $('dmCacheProgress').textContent =
        'Snapshot stopped: ' + error.message +
        '. Check status and use Resume Snapshot.';
    } finally {
      busy = false;
      $('dmCacheStart').disabled = false;
      $('dmCacheRefresh').disabled = false;
    }
  }

  $('dmCacheRefresh').addEventListener('click',checkStatus);
  $('dmCacheStart').addEventListener('click',run);
  void checkStatus();
})();
