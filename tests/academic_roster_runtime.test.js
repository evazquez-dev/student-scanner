const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/services/academic-roster.js')).href;
const routeUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/academic-roster.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [String(key), typeof value === 'string' ? value : JSON.stringify(value)]));
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
  async delete(key) { this.map.delete(String(key)); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const names = Array.from(this.map.keys()).filter((key) => key.startsWith(String(prefix))).sort();
    const start = cursor ? Number(cursor) || 0 : 0;
    const slice = names.slice(start, start + limit);
    const next = start + slice.length;
    return { keys: slice.map((name) => ({ name })), list_complete: next >= names.length, cursor: next < names.length ? String(next) : undefined };
  }
}

async function modules() {
  const nonce = `${Date.now()}-${Math.random()}`;
  return {
    service: await import(`${serviceUrl}?v=${nonce}`),
    route: await import(`${routeUrl}?v=${nonce}`)
  };
}

function validSource(overrides = {}) {
  return {
    generated_at_iso: '2026-08-24T12:00:00-04:00',
    date: '2026-08-24',
    students: [{ ps_id: '1', osis: '100000001', name: 'Student One', grade: '9', email: 's1@school.org' }],
    staff: [{ email: 'teacher1@school.org', name: 'Teacher One', teacher_assignment_match: 'TeacherOne' }],
    teacher_assignments: [{ teacher_assignment_match: 'TeacherOne', section_code: 'SCI100.1' }],
    course_requests: [{ student_ps_id: '1', course_code: 'SCI100', section_code: 'SCI100.1', grade: '9' }],
    course_names: [{ course_code: 'SCI100', name: 'Science' }],
    section_names: [{ section_code: 'SCI100.1', section_name: 'Science 1', course_name: 'Science' }],
    ...overrides
  };
}

test('course dictionary supports base and exact-section aliases', async () => {
  const { service } = await modules();
  const map = service.academicCourseMapIndex([
    { source_code: 'PE1001', target_code: 'PE' },
    { source_code: 'ABC.9', target_code: 'LOCAL.9' }
  ]);
  assert.equal(service.mapAcademicCode('PE1001.6A', map), 'PE.6A');
  assert.equal(service.mapAcademicCode('ABC.9', map), 'LOCAL.9');

  const roster = service.buildAcademicRoster({
    ...validSource(),
    teacher_assignments: [{ teacher_assignment_match: 'TeacherOne', section_code: 'PE.6A' }],
    course_requests: [{ student_ps_id: '1', course_code: 'PE1001', section_code: 'PE1001.6A', grade: '9' }],
    course_names: [{ course_code: 'PE1001', name: 'Physical Education' }],
    section_names: []
  }, [{ source_code: 'PE1001', target_code: 'PE', note: 'PowerSchool to local' }]);

  assert.ok(roster.courses.PE);
  assert.deepEqual(roster.teachers_by_email['teacher1@school.org'].courses.PE.students, ['100000001']);
  assert.equal(roster.health.error_count, 0);
});

test('exact Teacher Assignments Match supports shared labels but rejects duplicate rows for one email', async () => {
  const { service } = await modules();
  const shared = service.buildAcademicRoster({
    ...validSource(),
    students: [
      { ps_id: '1', osis: '100000001', name: 'Student One', grade: '11' },
      { ps_id: '2', osis: '100000002', name: 'Student Two', grade: '12' }
    ],
    staff: [
      { email: 'advisor1@school.org', name: 'Advisor One', teacher_assignment_match: 'CA' },
      { email: 'advisor2@school.org', name: 'Advisor Two', teacher_assignment_match: 'CA' }
    ],
    teacher_assignments: [{ teacher_assignment_match: 'CA', section_code: 'CA100.1' }],
    course_requests: [
      { student_ps_id: '1', course_code: 'CA100', section_code: 'CA100.1', grade: '11' },
      { student_ps_id: '2', course_code: 'CA100', section_code: 'CA100.1', grade: '12' }
    ],
    course_names: [], section_names: []
  }, []);

  assert.equal(shared.health.error_count, 0);
  assert.equal(shared.teacher_assignment_status.ca.status, 'shared_assignment');
  assert.deepEqual(shared.teacher_assignment_status.ca.emails.sort(), ['advisor1@school.org', 'advisor2@school.org']);
  assert.ok(shared.teachers_by_email['advisor1@school.org'].courses.CA100);
  assert.ok(shared.teachers_by_email['advisor2@school.org'].courses.CA100);

  const duplicate = service.buildAcademicRoster({
    ...validSource(),
    staff: [
      { email: 'advisor1@school.org', name: 'Advisor One', teacher_assignment_match: 'CA' },
      { email: 'advisor1@school.org', name: 'Advisor One Duplicate', teacher_assignment_match: 'CA' },
      { email: 'advisor2@school.org', name: 'Advisor Two', teacher_assignment_match: 'CA' }
    ],
    teacher_assignments: [{ teacher_assignment_match: 'CA', section_code: 'CA100.1' }],
    course_requests: [{ student_ps_id: '1', course_code: 'CA100', section_code: 'CA100.1', grade: '9' }],
    course_names: [], section_names: []
  }, []);

  assert.ok(duplicate.health.issues.some((issue) => issue.type === 'staff_teacher_match_duplicate_email' && issue.email === 'advisor1@school.org'));
  assert.equal(duplicate.teachers_by_email['advisor1@school.org'], undefined);
  assert.ok(duplicate.teachers_by_email['advisor2@school.org']);
});

test('source replacement preserves last-known-good roster when large-drop protection rejects a payload', async () => {
  const { service } = await modules();
  const oldCompiled = { v: 1, ts: 1, health: { status: 'ok', counts: { students: 100 } }, marker: 'last-good' };
  const kv = new FakeKV({
    [service.ACADEMIC_ROSTER_SOURCE_KEY]: { ...validSource(), counts: { students: 100, course_requests: 200 } },
    [service.ACADEMIC_ROSTER_KEY]: oldCompiled
  });

  await assert.rejects(() => service.saveAcademicRosterSource({ ROSTER: kv }, validSource()), /academic_roster_large_drop_rejected/);
  const retained = await kv.get(service.ACADEMIC_ROSTER_KEY, { type: 'json' });
  const retainedSource = await kv.get(service.ACADEMIC_ROSTER_SOURCE_KEY, { type: 'json' });
  assert.equal(retained.marker, 'last-good');
  assert.equal(retainedSource.counts.students, 100);
  assert.equal(retainedSource.counts.course_requests, 200);
});

test('course-map route persists valid mappings and rebuilds the stored source', async () => {
  const { service, route } = await modules();
  const exp = Date.now() + 60 * 60 * 1000;
  const kv = new FakeKV({
    'admin:sessions:super': { email: 'boss@school.org', role: 'super_admin', exp },
    [service.ACADEMIC_ROSTER_SOURCE_KEY]: service.normalizeAcademicRosterSource({
      ...validSource(),
      teacher_assignments: [{ teacher_assignment_match: 'TeacherOne', section_code: 'PE.6A' }],
      course_requests: [{ student_ps_id: '1', course_code: 'PE1001', section_code: 'PE1001.6A', grade: '9' }]
    })
  });
  const env = { ROSTER: kv, ADMIN_ALLOWLIST: 'boss@school.org', ORIGIN_OK: 'https://app.example' };

  const req = new Request('https://worker.example/admin/academic_course_map', {
    method: 'POST',
    headers: { 'x-admin-session': 'super', origin: 'https://app.example', 'content-type': 'application/json' },
    body: JSON.stringify({ mappings: [{ source_code: 'PE1001', target_code: 'PE', note: 'local code' }] })
  });
  const response = await route.handleAcademicRosterRequest(req, env, {});
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.rebuild_error, '');
  assert.equal(data.count, 1);
  const mapDoc = await kv.get(service.ACADEMIC_COURSE_MAP_KEY, { type: 'json' });
  assert.equal(mapDoc.mappings[0].source_code, 'PE1001');
  const compiled = await kv.get(service.ACADEMIC_ROSTER_KEY, { type: 'json' });
  assert.ok(compiled.courses.PE);
});

test('route preserves token/admin/super-admin authorization and View-as read-only rules', async () => {
  const { service, route } = await modules();
  const exp = Date.now() + 60 * 60 * 1000;
  const kv = new FakeKV({
    'admin:sessions:admin': { email: 'admin@school.org', role: 'admin', exp },
    'admin:sessions:super': { email: 'boss@school.org', role: 'super_admin', exp },
    'admin:sessions:view': { email: 'boss@school.org', role: 'super_admin', view_as_email: 'teacher1@school.org', exp },
    'admin_role_allowlist_v1': { emails: ['admin@school.org'] },
    [service.ACADEMIC_ROSTER_KEY]: service.buildAcademicRoster(validSource(), [])
  });
  const env = { ROSTER: kv, ADMIN_TOKEN: 'secret-token', ADMIN_ALLOWLIST: 'boss@school.org', ORIGIN_OK: 'https://app.example' };

  let response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_roster_health', { headers: { 'x-admin-session': 'admin', origin: 'https://app.example' } }), env, {});
  assert.equal(response.status, 200);

  response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_roster_source', {
    method: 'POST', headers: { 'x-admin-session': 'admin', origin: 'https://app.example', 'content-type': 'application/json' }, body: JSON.stringify(validSource())
  }), env, {});
  assert.equal(response.status, 403);

  response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_roster_source', {
    method: 'POST', headers: { 'x-admin-token': 'secret-token', 'content-type': 'application/json' }, body: JSON.stringify(validSource())
  }), env, {});
  assert.equal(response.status, 200);

  response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_course_map', { method: 'GET', headers: { 'x-admin-session': 'admin', origin: 'https://app.example' } }), env, {});
  assert.equal(response.status, 403);

  response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_course_map', {
    method: 'POST', headers: { 'x-admin-session': 'view', origin: 'https://app.example', 'content-type': 'application/json' }, body: JSON.stringify({ mappings: [] })
  }), env, {});
  let viewData = await response.json();
  assert.equal(response.status, 403);
  assert.equal(viewData.error, 'view_as_read_only');

  response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_roster_rebuild', {
    method: 'POST', headers: { 'x-admin-session': 'view', origin: 'https://app.example', 'content-type': 'application/json' }, body: '{}'
  }), env, {});
  viewData = await response.json();
  assert.equal(response.status, 403);
  assert.equal(viewData.error, 'view_as_read_only');
});

test('Practice mode keeps academic reference data live while scoping its audit record', async () => {
  const { service, route } = await modules();
  const kv = new FakeKV({ 'system:mode:v1': { mode: 'practice' } });
  const env = { ROSTER: kv, ADMIN_TOKEN: 'secret-token' };

  const response = await route.handleAcademicRosterRequest(new Request('https://worker.example/admin/academic_roster_source', {
    method: 'POST', headers: { 'x-admin-token': 'secret-token', 'content-type': 'application/json' }, body: JSON.stringify(validSource())
  }), env, {});
  assert.equal(response.status, 200);
  assert.ok(kv.map.has(service.ACADEMIC_ROSTER_SOURCE_KEY));
  assert.ok(kv.map.has(service.ACADEMIC_ROSTER_KEY));
  assert.equal(Array.from(kv.map.keys()).some((key) => key.startsWith('practice:v1:') && key.includes('academic_roster')), false);

  const auditKeys = Array.from(kv.map.keys()).filter((key) => key.includes(':audit:'));
  assert.equal(auditKeys.length, 1);
  assert.match(auditKeys[0], /^practice:v1:\d{4}-\d{2}-\d{2}:audit:/);
  const auditPut = kv.puts.find((put) => put.key === auditKeys[0]);
  assert.equal(auditPut.options.expirationTtl, 36 * 60 * 60);
});
