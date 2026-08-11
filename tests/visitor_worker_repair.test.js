const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/worker.js');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const wrangler = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/wrangler.jsonc'), 'utf8'));

async function loadWorker() {
  const src = workerSource
    .replace('export {\n', 'export {\n  allowedCorsOrigin_,\n  badAdminMutationOrigin_,\n  handleVisitorAdminRoute_,\n  handleVisitorKioskRoute_,\n  newVisitorPhotoId_,\n  readVisitorPhotoUpload_,\n  sanitizeVisitorPatch_,\n  sanitizeVisitorVerification_,\n  visitorGasVisitPayload_,\n  visitorPhotoKey_,\n');
  return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
}

class FakeStorage {
  constructor() {
    this.map = new Map();
    this.alarmAt = 0;
  }
  async get(key) { return this.map.get(key); }
  async put(key, value) {
    if (key && typeof key === 'object' && !(key instanceof String)) {
      Object.entries(key).forEach(([k, v]) => this.map.set(k, v));
      return;
    }
    this.map.set(key, value);
  }
  async delete(key) {
    if (Array.isArray(key)) {
      key.forEach((k) => this.map.delete(k));
      return;
    }
    this.map.delete(key);
  }
  async list(opts = {}) {
    const prefix = opts.prefix || '';
    const out = new Map();
    for (const [k, v] of this.map.entries()) {
      if (!prefix || k.startsWith(prefix)) out.set(k, v);
      if (opts.limit && out.size >= opts.limit) break;
    }
    return out;
  }
  async setAlarm(ms) { this.alarmAt = ms; }
}

class FakeState {
  constructor() { this.storage = new FakeStorage(); }
  blockConcurrencyWhile(fn) { return fn(); }
}

class FakeR2 {
  constructor({ failPut = false } = {}) {
    this.failPut = failPut;
    this.map = new Map();
    this.deleted = [];
  }
  async put(key, body, opts) {
    if (this.failPut) throw new Error('r2 down');
    this.map.set(key, { body, opts });
  }
  async get(key) {
    const rec = this.map.get(key);
    return rec ? { body: new Blob([rec.body]), httpMetadata: { contentType: 'image/jpeg' } } : null;
  }
  async delete(key) {
    this.deleted.push(key);
    this.map.delete(key);
  }
}

function req(pathname, body) {
  return new Request(`https://visitor.local${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
}

async function doJson(instance, pathname, body) {
  const resp = await instance.fetch(req(pathname, body));
  const data = await resp.json();
  return { resp, data };
}

function doStub(instance) {
  return {
    idFromName() { return 'visitor-global'; },
    get() {
      return {
        fetch(url, init) {
          return instance.fetch(new Request(url, init));
        }
      };
    }
  };
}

function ctx() {
  return { waitUntil(p) { if (p && typeof p.catch === 'function') p.catch(() => {}); } };
}

function fakeJpeg(bytes = 64) {
  const arr = new Uint8Array(bytes);
  arr[0] = 0xff;
  arr[1] = 0xd8;
  arr[2] = 0xff;
  arr[3] = 0xe0;
  return arr;
}

async function pairedKioskVisit(mod, instance, visitor = {}) {
  const code = await doJson(instance, '/create_pair_code', { actor_email: 'security@example.org', label: 'iPad' });
  const pair = await doJson(instance, '/pair', { code: code.data.code, label: 'iPad', ip: '192.0.2.10' });
  assert.equal(pair.data.ok, true);
  const payload = {
    visitor_first_name: 'Retry',
    visitor_last_name: 'Guest',
    date_of_birth: '1980-01-01',
    visitor_type: 'school_guest',
    purpose: 'meeting',
    ...visitor
  };
  const submit = await doJson(instance, '/submit', { kiosk_credential: pair.data.kiosk_credential, dedupe_key: 'same-submit', visitor: payload });
  assert.equal(submit.data.ok, true);
  return { credential: pair.data.kiosk_credential, visit: submit.data.visit, dedupe: 'same-submit' };
}

(async () => {
  const mod = await loadWorker();

  {
    assert.equal(fs.existsSync(path.resolve(__dirname, '../../cf-redcake/.env.production')), false, 'local production secret file must not be packaged');
    const photoBinding = (wrangler.r2_buckets || []).find((b) => b.binding === 'VISITOR_PHOTOS');
    assert.ok(photoBinding, 'wrangler.jsonc should define VISITOR_PHOTOS R2 binding');
    assert.equal(photoBinding.bucket_name, 'eaglenest-visitor-photos');
  }

  {
    assert.doesNotMatch(workerSource, /student_pickup/, 'Visitor Worker must not expose Visitor Student Pickup behavior');
    assert.doesNotMatch(workerSource, /\/admin\/visitor\/link_student/, 'Visitor student-link route must be removed');
    assert.doesNotMatch(workerSource, /\/admin\/visitor\/student_search/, 'Visitor student search route must be removed');
    assert.doesNotMatch(workerSource, /\/admin\/visitor\/student_pickup_complete/, 'Visitor pickup route must be removed');
    assert.doesNotMatch(workerSource, /\/pickup_begin|\/pickup_complete|\/pickup_fail/, 'VisitorDeskDO pickup routes must be removed');
    assert.match(workerSource, /function\s+applyEarlyDismissalEntries_/, 'standalone Early Dismissal helper must remain');
  }

  {
    const patch = mod.sanitizeVisitorPatch_({ visitor_first_name: 'Maria' });
    assert.deepEqual(patch, { visitor_first_name: 'Maria' });
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'student_osis'), false);

    const clear = mod.sanitizeVisitorPatch_({ destination: null });
    assert.deepEqual(clear, { destination: '' });

    const dob = mod.sanitizeVisitorPatch_({ date_of_birth: '1980-01-02' });
    assert.deepEqual(dob, { date_of_birth: '1980-01-02' });

    const badDob = mod.sanitizeVisitorPatch_({ date_of_birth: '1980-02-31' });
    assert.deepEqual(badDob, { date_of_birth: '' });

    const verification = mod.sanitizeVisitorVerification_({ id_verified: false }, 'security@example.org');
    assert.equal(verification.id_verified, false);
    assert.equal(verification.id_verified_at, '');
    assert.equal(verification.id_verified_by, '');
    assert.equal(verification.id_document_type, '');
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const missingDob = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      visitor: {
        visitor_first_name: 'Missing',
        visitor_last_name: 'DOB',
        visitor_type: 'school_guest',
        purpose: 'meeting'
      }
    });
    assert.equal(missingDob.resp.status, 400);
    assert.equal(missingDob.data.missing.includes('date_of_birth'), true);

    const futureDob = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      visitor: {
        visitor_first_name: 'Future',
        visitor_last_name: 'DOB',
        date_of_birth: '2099-01-01',
        visitor_type: 'school_guest',
        purpose: 'meeting'
      }
    });
    assert.equal(futureDob.resp.status, 400);
    assert.equal(futureDob.data.missing.includes('date_of_birth_future'), true);
  }

  {
    const env = { ORIGIN_OK: 'https://eaglenest.example.org, https://other.example.org/' };
    const good = new Request('https://worker.example/admin/visitor/state', { headers: { origin: 'https://eaglenest.example.org' } });
    const bad = new Request('https://worker.example/admin/visitor/state', { method: 'POST', headers: { origin: 'https://evil.example.org' } });
    assert.equal(mod.allowedCorsOrigin_(good, env), 'https://eaglenest.example.org');
    assert.equal(mod.allowedCorsOrigin_(bad, env), '');
    assert.equal(mod.badAdminMutationOrigin_(bad, env, '/admin/visitor/state'), true);
  }

  {
    const photoId = mod.newVisitorPhotoId_();
    const key = mod.visitorPhotoKey_(photoId);
    assert.match(photoId, /^photo_[A-Za-z0-9_-]{40,}$/);
    assert.match(key, /^visitor-photos\/photo_[A-Za-z0-9_-]+\.jpg$/);
    assert.equal(key.includes('Maria'), false);
    assert.equal(key.includes('Rodriguez'), false);
    assert.equal(key.includes('visit_'), false);
  }

  {
    const payload = mod.visitorGasVisitPayload_({
      visit_id: 'vis_1',
      photo_id: 'photo_safe',
      photo_base64: 'data:image/jpeg;base64,abc',
      image_data: 'raw-bytes',
      image_base64: 'abc',
      date_of_birth: '1980-01-01',
      badge_checkout_token: 'secret'
    });
    assert.deepEqual(payload, { visit_id: 'vis_1', photo_id: 'photo_safe', date_of_birth: '1980-01-01' });
  }

  {
    const okReq = new Request('https://x/upload', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: fakeJpeg() });
    assert.equal((await mod.readVisitorPhotoUpload_(okReq)).ok, true);
    const htmlReq = new Request('https://x/upload', { method: 'POST', headers: { 'content-type': 'text/html' }, body: '<h1>x</h1>' });
    assert.equal((await mod.readVisitorPhotoUpload_(htmlReq)).error, 'photo_type_not_allowed');
    const svgReq = new Request('https://x/upload', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: '<svg></svg>' });
    assert.equal((await mod.readVisitorPhotoUpload_(svgReq)).error, 'photo_type_not_allowed');
    const hugeReq = new Request('https://x/upload', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: fakeJpeg(513 * 1024) });
    assert.equal((await mod.readVisitorPhotoUpload_(hugeReq)).error, 'photo_too_large');
  }

  {
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {
      VISITOR_GAS_URL: 'https://visitor-gas.invalid/exec',
      VISITOR_GAS_SHARED_SECRET: 'test-secret'
    });
    await instance.ready;
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'gas_down' }), { status: 503 });
    const created = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'John',
        visitor_last_name: 'Smith',
        date_of_birth: '1980-01-01',
        visitor_type: 'vendor_contractor',
        purpose: 'meeting',
        photo_required_override: true
      }
    });
    assert.equal(created.data.ok, true);
    await instance.alarm();
    let jobs = await state.storage.list({ prefix: 'persist:' });
    assert.equal(jobs.size, 1);
    assert.equal([...jobs.values()][0].attempts, 1);

    const checkedOut = await doJson(instance, '/checkout', { visit_id: created.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(checkedOut.data.ok, true);
    jobs = await state.storage.list({ prefix: 'persist:' });
    assert.equal(jobs.size, 1);
    assert.equal([...jobs.values()][0].action, 'updateVisitorCheckOut');
    assert.equal([...jobs.values()][0].visit.status, 'checked_out');

    const repeated = await doJson(instance, '/checkout', { visit_id: created.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(repeated.data.ok, true);
    assert.equal(repeated.data.already, true);
    assert.equal((await state.storage.list({ prefix: 'persist:' })).size, 1);

    global.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    await instance.alarm();
    assert.equal((await state.storage.list({ prefix: 'persist:' })).size, 0);
    global.fetch = originalFetch;
  }

  {
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {
      VISITOR_GAS_URL: 'https://visitor-gas.invalid/exec',
      VISITOR_GAS_SHARED_SECRET: 'test-secret'
    });
    await instance.ready;
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('network detail must not leak'); };
    const created = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      visitor: {
        visitor_first_name: 'Network',
        visitor_last_name: 'Failure',
        date_of_birth: '1980-01-01',
        visitor_type: 'school_guest',
        purpose: 'meeting'
      }
    });
    assert.equal(created.data.ok, true);
    await instance.alarm();
    let jobs = await state.storage.list({ prefix: 'persist:' });
    assert.equal(jobs.size, 1);
    let job = [...jobs.values()][0];
    assert.equal(job.attempts, 1);
    assert.equal(job.last_error, 'visitor_gas_network_error');
    assert.equal(Number.isFinite(Number(job.next_attempt_ms)) && Number(job.next_attempt_ms) > Date.now(), true);
    assert.equal(state.storage.alarmAt > 0, true);

    global.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    job = { ...job, next_attempt_ms: 0 };
    await state.storage.put([...jobs.keys()][0], job);
    await instance.alarm();
    assert.equal((await state.storage.list({ prefix: 'persist:' })).size, 0);
    global.fetch = originalFetch;
  }

  {
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {});
    await instance.ready;
    const now = Date.now();
    await state.storage.put('pair:111111', { expires_at_ms: now - 2 * 24 * 60 * 60 * 1000 });
    await state.storage.put('pair:222222', { expires_at_ms: now + 10 * 60 * 1000 });
    await state.storage.put('pair_attempt:192.0.2.1', { attempts: [now - 20 * 60 * 1000], locked_until_ms: now - 1 });
    await state.storage.put('dedupe:kiosk:old', { visit_id: 'visit_old', created_at_ms: now - 4 * 24 * 60 * 60 * 1000 });
    await state.storage.put('dedupe:kiosk:legacy', 'visit_legacy');
    await state.storage.put('checkout_used:oldhash', { visit_id: 'visit_old', used_at: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString() });
    await state.storage.put('checkout:activehash', { visit_id: 'visit_active', created_at: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString() });
    await state.storage.put('rate:kiosk', [now - 2 * 60 * 1000]);
    await instance._cleanupTemporaryKeys(now);
    assert.equal(await state.storage.get('pair:111111'), undefined);
    assert.notEqual(await state.storage.get('pair:222222'), undefined);
    assert.equal(await state.storage.get('pair_attempt:192.0.2.1'), undefined);
    assert.equal(await state.storage.get('dedupe:kiosk:old'), undefined);
    assert.deepEqual(await state.storage.get('dedupe:kiosk:legacy'), { visit_id: 'visit_legacy', created_at_ms: now });
    assert.equal(await state.storage.get('checkout_used:oldhash'), undefined);
    assert.notEqual(await state.storage.get('checkout:activehash'), undefined);
    assert.equal(await state.storage.get('rate:kiosk'), undefined);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const { credential, visit, dedupe } = await pairedKioskVisit(mod, instance, {
      visitor_first_name: 'Maria',
      visitor_last_name: 'Rodriguez'
    });
    const r2 = new FakeR2();
    const env = { VISITOR_DESK_DO: doStub(instance), VISITOR_PHOTOS: r2 };
    const uploadReq = new Request('https://worker.example/visitor/kiosk/photo', {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        'x-visitor-kiosk': credential,
        'x-visitor-visit': visit.visit_id,
        'x-visitor-dedupe': dedupe
      },
      body: fakeJpeg()
    });
    const resp = await mod.handleVisitorKioskRoute_(uploadReq, env, ctx(), '/visitor/kiosk/photo');
    const data = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.visit.photo_source, 'kiosk_camera');
    const keys = [...r2.map.keys()];
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^visitor-photos\/photo_[A-Za-z0-9_-]+\.jpg$/);
    assert.equal(keys[0].includes('Maria'), false);
    assert.equal(keys[0].includes('Rodriguez'), false);
    assert.equal(keys[0].includes(visit.visit_id), false);

    const replaceReq = new Request('https://worker.example/visitor/kiosk/photo', {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        'x-visitor-kiosk': credential,
        'x-visitor-visit': visit.visit_id,
        'x-visitor-dedupe': dedupe
      },
      body: fakeJpeg()
    });
    const replaced = await mod.handleVisitorKioskRoute_(replaceReq, env, ctx(), '/visitor/kiosk/photo');
    assert.equal(replaced.status, 200);
    assert.equal((await instance.state.storage.list({ prefix: 'visit:' })).size, 1);
    assert.equal(r2.deleted.length, 1);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const { credential, visit } = await pairedKioskVisit(mod, instance);
    const r2 = new FakeR2();
    const env = { VISITOR_DESK_DO: doStub(instance), VISITOR_PHOTOS: r2 };
    const missingDedupe = new Request('https://worker.example/visitor/kiosk/photo', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'x-visitor-kiosk': credential, 'x-visitor-visit': visit.visit_id },
      body: fakeJpeg()
    });
    const denied = await mod.handleVisitorKioskRoute_(missingDedupe, env, ctx(), '/visitor/kiosk/photo');
    assert.equal(denied.status, 403);
    assert.equal(r2.map.size, 0);

    const getDenied = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/photo'), env, ctx(), '/visitor/kiosk/photo');
    assert.equal(getDenied.status, 405);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const { credential, visit, dedupe } = await pairedKioskVisit(mod, instance);
    const r2 = new FakeR2();
    const env = { VISITOR_DESK_DO: doStub(instance), VISITOR_PHOTOS: r2 };
    const invalidMime = new Request('https://worker.example/visitor/kiosk/photo', {
      method: 'POST',
      headers: {
        'content-type': 'text/html',
        'x-visitor-kiosk': credential,
        'x-visitor-visit': visit.visit_id,
        'x-visitor-dedupe': dedupe
      },
      body: '<h1>not a photo</h1>'
    });
    const mimeResp = await mod.handleVisitorKioskRoute_(invalidMime, env, ctx(), '/visitor/kiosk/photo');
    assert.equal(mimeResp.status, 415);
    assert.equal(r2.map.size, 0);

    const svgAsJpeg = new Request('https://worker.example/visitor/kiosk/photo', {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        'x-visitor-kiosk': credential,
        'x-visitor-visit': visit.visit_id,
        'x-visitor-dedupe': dedupe
      },
      body: '<svg></svg>'
    });
    const svgResp = await mod.handleVisitorKioskRoute_(svgAsJpeg, env, ctx(), '/visitor/kiosk/photo');
    assert.equal(svgResp.status, 415);
    assert.equal(r2.map.size, 0);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const { credential, visit, dedupe } = await pairedKioskVisit(mod, instance);
    const env = { VISITOR_DESK_DO: doStub(instance), VISITOR_PHOTOS: new FakeR2({ failPut: true }) };
    const failReq = new Request('https://worker.example/visitor/kiosk/photo', {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        'x-visitor-kiosk': credential,
        'x-visitor-visit': visit.visit_id,
        'x-visitor-dedupe': dedupe
      },
      body: fakeJpeg()
    });
    const failed = await mod.handleVisitorKioskRoute_(failReq, env, ctx(), '/visitor/kiosk/photo');
    const data = await failed.json();
    assert.equal(failed.status, 503);
    assert.equal(data.error, 'photo_storage_failed');
    const current = await doJson(instance, `/visit?visit_id=${encodeURIComponent(visit.visit_id)}`);
    assert.equal(current.data.visit.photo_id, '');
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const env = {
      ADMIN_TOKEN: 'admin-token',
      VISITOR_DESK_DO: doStub(instance),
      VISITOR_PHOTOS: new FakeR2()
    };
    const noAuth = new Request('https://worker.example/admin/visitor/photo?visit_id=vis_1');
    const denied = await mod.handleVisitorAdminRoute_(noAuth, env, ctx(), '/admin/visitor/photo');
    assert.notEqual(denied.status, 200, 'photo reads require Visitor Desk auth');
  }

  {
    const photoId = mod.newVisitorPhotoId_();
    const r2 = new FakeR2();
    const key = mod.visitorPhotoKey_(photoId);
    await r2.put(key, fakeJpeg(), { httpMetadata: { contentType: 'image/jpeg' } });
    const env = { ADMIN_TOKEN: 'admin-token', VISITOR_PHOTOS: r2 };
    const authedHistoryPhoto = new Request(`https://worker.example/admin/visitor/photo?photo_id=${encodeURIComponent(photoId)}`, {
      headers: { 'x-admin-token': 'admin-token' }
    });
    const resp = await mod.handleVisitorAdminRoute_(authedHistoryPhoto, env, ctx(), '/admin/visitor/photo');
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('content-type'), 'image/jpeg');
    assert.equal(resp.headers.get('cache-control'), 'private, no-store');
    assert.equal(resp.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await resp.arrayBuffer()).byteLength > 0, true);

    const expired = new Request(`https://worker.example/admin/visitor/photo?photo_id=${encodeURIComponent(mod.newVisitorPhotoId_())}`, {
      headers: { 'x-admin-token': 'admin-token' }
    });
    const expiredResp = await mod.handleVisitorAdminRoute_(expired, env, ctx(), '/admin/visitor/photo');
    const expiredData = await expiredResp.json();
    assert.equal(expiredResp.status, 404);
    assert.equal(expiredData.error, 'photo_expired');

    const invalid = new Request('https://worker.example/admin/visitor/photo?photo_id=../photo_bad', {
      headers: { 'x-admin-token': 'admin-token' }
    });
    const invalidResp = await mod.handleVisitorAdminRoute_(invalid, env, ctx(), '/admin/visitor/photo');
    assert.equal(invalidResp.status, 400);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const created = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'No',
        visitor_last_name: 'Photo',
        date_of_birth: '1980-01-01',
        visitor_type: 'school_guest',
        purpose: 'meeting'
      }
    });
    assert.equal(created.resp.status, 409);
    assert.equal(created.data.error, 'photo_required');

    const overridden = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'Override',
        visitor_last_name: 'Guest',
        date_of_birth: '1980-01-01',
        visitor_type: 'school_guest',
        purpose: 'meeting',
        photo_required_override: true
      }
    });
    assert.equal(overridden.data.ok, true);
    assert.equal(overridden.data.visit.status, 'checked_in');
    assert.equal(overridden.data.visit.photo_required_override, true);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const code = await doJson(instance, '/create_pair_code', { actor_email: 'security@example.org', label: 'iPad' });
    assert.equal(code.data.ok, true);
    const pair = await doJson(instance, '/pair', { code: code.data.code, label: 'iPad', ip: '192.0.2.10' });
    assert.equal(pair.data.ok, true);
    const visitor = {
      visitor_first_name: 'Retry',
      visitor_last_name: 'Guest',
      date_of_birth: '1980-01-01',
      visitor_type: 'school_guest',
      purpose: 'meeting'
    };
    const one = await doJson(instance, '/submit', { kiosk_credential: pair.data.kiosk_credential, dedupe_key: 'same-submit', visitor });
    const two = await doJson(instance, '/submit', { kiosk_credential: pair.data.kiosk_credential, dedupe_key: 'same-submit', visitor });
    assert.equal(one.data.ok, true);
    assert.equal(two.data.ok, true);
    assert.equal(two.data.duplicate, true);
    assert.equal(one.data.visit.visit_id, two.data.visit.visit_id);
    const visits = await instance.state.storage.list({ prefix: 'visit:' });
    assert.equal(visits.size, 1);
  }

  console.log('visitor_worker_repair tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
