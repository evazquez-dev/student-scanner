const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const WORKER_REL = 'cf-redcake/red-cake-77d5/src/worker.js';
const INDEX_REL = 'cf-redcake/red-cake-77d5/src/index.js';
const SESSION_SERVICE_REL = 'cf-redcake/red-cake-77d5/src/services/admin-session.js';
const BRIDGE_REL = 'cf-redcake/red-cake-77d5/src/utils/admin-bridge.js';
const DIAGNOSTICS_REL = 'cf-redcake/red-cake-77d5/src/routes/attendance-diagnostics.js';
const INCIDENT_ROUTE_REL = 'cf-redcake/red-cake-77d5/src/routes/incidents.js';
const ACADEMIC_SERVICE_REL = 'cf-redcake/red-cake-77d5/src/services/academic-roster.js';
const DOW_SERVICE_REL = 'cf-redcake/red-cake-77d5/src/services/dreamer-of-week.js';

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(
      Object.entries(seed).map(([key, value]) => [
        String(key),
        typeof value === 'string' ? value : JSON.stringify(value)
      ])
    );
    this.puts = [];
  }

  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }

  async put(key, value, options) {
    this.map.set(String(key), String(value));
    this.puts.push({ key: String(key), value: String(value), options: options || null });
  }

  async delete(key) {
    this.map.delete(String(key));
  }

  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const names = Array.from(this.map.keys())
      .filter((key) => key.startsWith(String(prefix)))
      .sort();
    const start = cursor ? Number(cursor) || 0 : 0;
    const slice = names.slice(start, start + limit);
    const next = start + slice.length;
    return {
      keys: slice.map((name) => ({ name })),
      list_complete: next >= names.length,
      cursor: next < names.length ? String(next) : undefined
    };
  }
}

function moduleUrl(rel) {
  return pathToFileURL(path.join(ROOT, rel)).href;
}

async function importFresh(rel) {
  return import(`${moduleUrl(rel)}?safety=${Date.now()}-${Math.random()}`);
}

function assertRouteContract(rel, endpoints) {
  const source = read(rel);
  for (const endpoint of endpoints) {
    assert.ok(source.includes(endpoint), `${rel} must continue to expose ${endpoint}`);
  }
}

test('SAFETY: canonical Worker entry, modular interception, and legacy fallback remain intact', () => {
  const wrangler = read('cf-redcake/red-cake-77d5/wrangler.jsonc');
  const index = read(INDEX_REL);

  assert.match(wrangler, /"main"\s*:\s*"src\/index\.js"/);
  assert.match(index, /import baseWorker,[\s\S]*from '\.\/worker\.js'/);

  const fallback = 'return baseWorker.fetch(req, env, ctx);';
  const fallbackPos = index.lastIndexOf(fallback);
  assert.ok(fallbackPos > 0, 'unmigrated routes must retain the legacy fallback');

  for (const guard of [
    'ADMIN_SESSION_PATHS.has(path)',
    'ACADEMIC_ROSTER_PATHS.has(path)',
    "path.startsWith('/admin/dow/')",
    "path === '/admin/user_external_links'",
    "path.startsWith('/admin/push/')",
    "path.startsWith('/admin/incident/')",
    "path === '/admin/teacher_att_trace_lookup'"
  ]) {
    const pos = index.indexOf(guard);
    assert.ok(pos >= 0, `missing modular route guard: ${guard}`);
    assert.ok(pos < fallbackPos, `modular route guard must run before legacy fallback: ${guard}`);
  }

  assert.match(index, /if \(typeof baseWorker\.scheduled === 'function'\)/);
  assert.match(index, /return baseWorker\.scheduled\(event, env, ctx\)/);

  for (const dirRel of [
    'cf-redcake/red-cake-77d5/src/routes',
    'cf-redcake/red-cake-77d5/src/services',
    'cf-redcake/red-cake-77d5/src/utils'
  ]) {
    const dir = path.join(ROOT, dirRel);
    for (const name of fs.readdirSync(dir).filter((value) => value.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      assert.doesNotMatch(source, /from\s+['"]\.\.\/worker\.js['"]/,
        `${dirRel}/${name} must not import legacy worker.js directly`);
    }
  }
});

test('SAFETY: critical modular endpoint contracts cannot silently move or disappear', () => {
  assertRouteContract('cf-redcake/red-cake-77d5/src/routes/admin-session.js', [
    '/admin/session/login_google',
    '/admin/session/logout',
    '/admin/session/check',
    '/admin/session/view_as',
    '/admin/view_as/staff',
    '/admin/access'
  ]);
  assertRouteContract('cf-redcake/red-cake-77d5/src/routes/academic-roster.js', [
    '/admin/academic_roster_source',
    '/admin/academic_roster_health',
    '/admin/academic_course_map',
    '/admin/academic_roster_rebuild'
  ]);
  assertRouteContract('cf-redcake/red-cake-77d5/src/routes/dreamer-of-week.js', [
    '/admin/dow/state',
    '/admin/dow/recipient',
    '/admin/dow/reset'
  ]);
  const index = read(INDEX_REL);
  const externalLinksRoute = read('cf-redcake/red-cake-77d5/src/routes/external-links.js');
  assert.ok(index.includes("path === '/admin/user_external_links'"),
    'index.js must continue to route /admin/user_external_links before legacy fallback');
  assert.match(externalLinksRoute, /export async function handleUserExternalLinksRequest\(/,
    'external-links.js must continue to export the routed handler');
  assertRouteContract('cf-redcake/red-cake-77d5/src/routes/push-notifications.js', [
    '/admin/push/config',
    '/admin/push/preferences',
    '/admin/push/subscribe',
    '/admin/push/unsubscribe',
    '/admin/push/test'
  ]);
  assertRouteContract(INCIDENT_ROUTE_REL, [
    '/admin/incident/config',
    '/admin/incident/create'
  ]);
  assertRouteContract(DIAGNOSTICS_REL, [
    '/admin/teacher_att_trace_lookup'
  ]);
});

test('SAFETY: session resolution preserves header/cookie fallback and internal-token semantics', async () => {
  const session = await importFresh(SESSION_SERVICE_REL);
  const exp = Date.now() + 60 * 60 * 1000;
  const kv = new FakeKV({
    'admin:sessions:good': { email: 'teacher@school.org', role: 'editor', exp }
  });
  const env = { ROSTER: kv, ADMIN_TOKEN: 'internal-secret' };

  let who = await session.resolveAdminRequest(
    new Request('https://worker.example/admin/access', { headers: { 'x-admin-session': 'good' } }),
    env
  );
  assert.equal(who.ok, true);
  assert.equal(who.via, 'header');
  assert.equal(who.email, 'teacher@school.org');

  who = await session.resolveAdminRequest(
    new Request('https://worker.example/admin/access', { headers: { cookie: 'adm_sess=good' } }),
    env
  );
  assert.equal(who.ok, true);
  assert.equal(who.via, 'session');

  who = await session.resolveAdminRequest(
    new Request('https://worker.example/admin/access', {
      headers: { 'x-admin-session': 'stale', cookie: 'adm_sess=good' }
    }),
    env
  );
  assert.equal(who.ok, true);
  assert.equal(who.via, 'session');
  assert.equal(who.email, 'teacher@school.org');

  who = await session.resolveAdminRequest(
    new Request('https://worker.example/admin/access', { headers: { 'x-admin-token': 'internal-secret' } }),
    env
  );
  assert.equal(who.ok, true);
  assert.equal(who.via, 'token');
  assert.equal(who.role, 'admin');
});

test('SAFETY: View-as uses the teacher effective identity and blocks mutations', async () => {
  const session = await importFresh(SESSION_SERVICE_REL);
  const bridge = await importFresh(BRIDGE_REL);
  const exp = Date.now() + 60 * 60 * 1000;
  const kv = new FakeKV({
    'admin:sessions:view': {
      email: 'boss@school.org',
      role: 'super_admin',
      view_as_email: 'teacher@school.org',
      exp
    },
    academic_roster_v1: {
      staff_mapping_by_email: {
        'teacher@school.org': {
          email: 'teacher@school.org',
          name: 'Teacher One',
          teacher_assignment_match: 'TeacherOne',
          status: 'ok'
        }
      }
    }
  });
  const env = {
    ROSTER: kv,
    ADMIN_ALLOWLIST: 'boss@school.org'
  };
  const req = new Request('https://worker.example/admin/access', {
    headers: { 'x-admin-session': 'view' }
  });

  const access = await session.buildAdminAccessData(req, env);
  assert.equal(access.ok, true);
  assert.equal(access.email, 'teacher@school.org');
  assert.equal(access.role, 'editor');
  assert.equal(access.actor_email, 'boss@school.org');
  assert.equal(access.actor_role, 'super_admin');
  assert.equal(access.view_as.active, true);
  assert.equal(access.view_as.read_only, true);
  assert.equal(access.can.admin, false);
  assert.equal(access.can.admin_dashboard, false);
  assert.equal(access.can.admin_roles, false);

  const blocked = bridge.viewAsReadOnlyResponse(
    new Response('{}', { headers: { 'content-type': 'application/json' } }),
    access
  );
  assert.ok(blocked);
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error, 'view_as_read_only');
});

test('SAFETY: Practice mode fails closed and Attendance Diagnostics cannot read live traces', async () => {
  const academic = await importFresh(ACADEMIC_SERVICE_REL);
  const dow = await importFresh(DOW_SERVICE_REL);
  const diagnostics = await importFresh(DIAGNOSTICS_REL);

  const throwingEnv = {
    ROSTER: {
      async get() { throw new Error('mode store unavailable'); }
    }
  };
  const academicMode = await academic.loadAcademicModeInfo(throwingEnv);
  const dowMode = await dow.loadDowModeInfo(throwingEnv);
  assert.equal(academicMode.practice, true);
  assert.equal(academicMode.fail_closed, true);
  assert.equal(dowMode.practice, true);
  assert.equal(dowMode.fail_closed, true);

  const date = '2026-08-24';
  const practiceKey = `practice:v1:${date}:TA_TRACE:${date}:practice-sub`;
  const liveKey = `TA_TRACE:${date}:live-sub`;
  const kv = new FakeKV({
    'admin:sessions:admin': { email: 'admin@school.org', role: 'admin', exp: Date.now() + 3600000 },
    [practiceKey]: {
      submissionId: 'practice-sub',
      route: '/admin/teacher_att/submit',
      date,
      room: '405',
      periodLocal: '2',
      actorEmail: 'teacher@school.org',
      events: [{ level: 'warn', osis: '100000001', ts: '2026-08-24T14:00:00.000Z' }]
    },
    [liveKey]: {
      submissionId: 'live-sub',
      route: '/admin/teacher_att/submit',
      date,
      room: '405',
      periodLocal: '2',
      actorEmail: 'teacher@school.org',
      events: []
    }
  });
  const legacyPaths = [];
  const baseWorker = {
    async fetch(req) {
      legacyPaths.push(new URL(req.url).pathname);
      throw new Error('legacy mode lookup unavailable');
    }
  };
  const response = await diagnostics.handleAttendanceDiagnosticsRequest(
    new Request(`https://worker.example/admin/teacher_att_trace_lookup?date=${date}`, {
      headers: { 'x-admin-session': 'admin' }
    }),
    { ROSTER: kv },
    {},
    baseWorker
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.practice, true);
  assert.equal(data.history_scope, 'practice_only');
  assert.deepEqual(data.results.map((row) => row.submissionId), ['practice-sub']);
  assert.equal(data.results.some((row) => row.submissionId === 'live-sub'), false);
  assert.deepEqual(legacyPaths, ['/system/mode']);
});

test('SAFETY: force-live helper stays restricted to approved Visitor/control-plane/live-only delivery contexts', () => {
  const worker = read(WORKER_REL);
  const needle = 'liveModeEnv_(env)';
  const positions = [];
  let at = 0;
  while ((at = worker.indexOf(needle, at)) >= 0) {
    positions.push(at);
    at += needle.length;
  }
  assert.ok(positions.length >= 3, 'expected the live-mode helper definition and approved call sites');

  const approvedPushRoutes = [
    '/admin/push/config',
    '/admin/push/preferences',
    '/admin/push/subscribe',
    '/admin/push/unsubscribe',
    '/admin/push/test'
  ];

  for (const pos of positions) {
    const nearestPathStart = worker.lastIndexOf('if (path', pos);
    const nearestPathBlock = nearestPathStart >= 0 ? worker.slice(nearestPathStart, pos) : '';
    const around = worker.slice(Math.max(0, pos - 1200), Math.min(worker.length, pos + 1200));
    const lineStart = worker.lastIndexOf('\n', pos) + 1;
    const lineEndRaw = worker.indexOf('\n', pos);
    const lineEnd = lineEndRaw >= 0 ? lineEndRaw : worker.length;
    const line = worker.slice(lineStart, lineEnd).trim();

    const approved =
      /function\s+liveModeEnv_/.test(line)
      || /handleVisitorKioskRoute_/.test(line)
      || /handleVisitorAdminRoute_/.test(line)
      || (line.includes('writeAudit(liveModeEnv_(env)') && around.includes('update_external_nav_links'))
      || (line.includes('const liveEnv = liveModeEnv_(env)') && approvedPushRoutes.some((route) => nearestPathBlock.includes(`path === "${route}"`)))
      || (line.includes('sendPushCategoryToEmail_(liveModeEnv_(env)') && around.includes('practice_mode'))
      || (line.includes('notifyPhoneReturnRequestedToOps_(liveModeEnv_(env)') && around.includes('isPracticeMode_(env)'));

    assert.equal(approved, true, `unapproved force-live usage: ${line}`);
  }

  assert.match(worker, /handleVisitorKioskRoute_\(req, liveModeEnv_\(env\), ctx, path\)/);
  assert.match(worker, /handleVisitorAdminRoute_\(req, liveModeEnv_\(env\), ctx, path\)/);
  assert.match(worker, /function operationalDoName_\(env, liveName, date = ""\)/);
  assert.match(worker, /function operationalKvKey_\(env, liveKey, date = ""\)/);
  assert.match(worker, /env\.STUDENT_LOC\.idFromName\(operationalDoName_\(env, "GLOBAL"\)\)/);
});

test('SAFETY: external operational side effects remain suppressed in Practice Mode', () => {
  const worker = read(WORKER_REL);
  const incident = read(INCIDENT_ROUTE_REL);

  assert.match(worker, /async function pushFinalToGAS[\s\S]{0,900}if \(isPracticeMode_\(env\)\)/);
  assert.match(worker, /rows\.some\(\(row\)\s*=>\s*row\?\.practice\s*===\s*true\)/);
  assert.match(worker, /events\.some\(\(ev\)\s*=>\s*ev\?\.practice\s*===\s*true\)/);
  assert.match(worker, /else if \(isPracticeMode_\(env\)\) \{\s*phoneReturnNotification = \{ queued: false, simulated: true,[^}]*reason: "practice_mode" \}/);
  assert.match(incident, /if \(practice\)[\s\S]{0,300}practice_discarded:\s*true/);
  assert.match(incident, /deanNotification = \{ ok: true, simulated: true,[^}]*reason: 'practice_mode' \}/);

  const guardedProjects = [
    'daily-attendance',
    'ps-meeting-attendance',
    'student-scanner-gas',
    'behavioral-endpoint',
    'fidelity-tracking',
    'early-dismissal'
  ];
  for (const project of guardedProjects) {
    const rel = `Google Apps Script/clasp-projects/${project}/PracticeModeGuard.js`;
    assert.equal(exists(rel), true, `${project} must keep its PracticeModeGuard.js`);
    const guard = read(rel);
    assert.match(guard, /\/system\/mode/);
    assert.match(guard, /mode:'practice', practice:true, fail_closed:true/);
  }
  assert.equal(exists('Google Apps Script/clasp-projects/visitor-management/PracticeModeGuard.js'), false,
    'Visitor Management is intentionally live and must not inherit the generic Practice guard');
});
