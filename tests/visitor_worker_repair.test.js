const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/worker.js');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const wrangler = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/wrangler.jsonc'), 'utf8'));

async function loadWorker() {
  const src = workerSource
    .replace('export {\n', 'export {\n  allowedCorsOrigin_,\n  badAdminMutationOrigin_,\n  handleVisitorAdminRoute_,\n  handleVisitorKioskRoute_,\n  newVisitorPhotoId_,\n  parseReturningPassScan_,\n  readVisitorPhotoUpload_,\n  returningPhotoCurrent_,\n  sanitizeVisitorPatch_,\n  sanitizeVisitorVerification_,\n  visitorGasProfilePayload_,\n  visitorGasVisitPayload_,\n  visitorNycMonth_,\n  visitorPhotoKey_,\n');
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
      badge_checkout_token: 'secret',
      returning_claim: 'claim_secret',
      returning_pass_token: 'ENVISITOR:secret'
    });
    assert.deepEqual(payload, { visit_id: 'vis_1', photo_id: 'photo_safe', date_of_birth: '1980-01-01' });

    const profilePayload = mod.visitorGasProfilePayload_({
      profile_id: 'vprof_1',
      visitor_first_name: 'Parent',
      visitor_last_name: 'Guest',
      date_of_birth: '1980-01-01',
      visitor_type: 'parent_guardian',
      credential_hash: 'hash_only',
      plaintext_token: 'ENVISITOR:do-not-store',
      qr_text: 'ENVISITOR:do-not-store',
      latest_photo_id: 'photo_abc',
      latest_photo_month: '2026-08'
    });
    assert.equal(profilePayload.credential_hash, 'hash_only');
    assert.equal(JSON.stringify(profilePayload).includes('ENVISITOR'), false, 'GAS profile payload must not include plaintext reusable token');
    assert.equal(JSON.stringify(profilePayload).includes('do-not-store'), false, 'GAS profile payload must strip transient QR text');
    assert.equal(mod.parseReturningPassScan_(`ENVISITOR:${'A'.repeat(64)}`).ok, true);
    assert.equal(mod.parseReturningPassScan_('ENVISIT:' + 'A'.repeat(43)).ok, false);
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
    const instance = new mod.VisitorDeskDO(state, {});
    await instance.ready;
    const code = await doJson(instance, '/create_pair_code', { actor_email: 'security@example.org', label: 'iPad' });
    const pair = await doJson(instance, '/pair', { code: code.data.code, label: 'iPad', ip: '192.0.2.10' });
    const direct = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'Temp',
        visitor_last_name: 'Badge',
        date_of_birth: '1980-01-01',
        visitor_type: 'school_guest',
        purpose: 'meeting',
        photo_required_override: true
      }
    });
    assert.equal(direct.data.visit.status, 'checked_in');
    assert.ok(direct.data.visit.badge_checkout_token);
    const env = { VISITOR_DESK_DO: doStub(instance) };
    const rejectedCheckout = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/badge_checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': 'not-a-paired-kiosk' },
      body: JSON.stringify({ qr_text: `ENVISIT:${direct.data.visit.badge_checkout_token}` })
    }), env, ctx(), '/visitor/kiosk/badge_checkout');
    assert.equal(rejectedCheckout.status, 403);
    const checkoutResp = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/badge_checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': pair.data.kiosk_credential },
      body: JSON.stringify({ qr_text: `ENVISIT:${direct.data.visit.badge_checkout_token}` })
    }), env, ctx(), '/visitor/kiosk/badge_checkout');
    const checkout = await checkoutResp.json();
    assert.equal(checkoutResp.status, 200);
    assert.equal(checkout.visit.status, 'checked_out');
    const repeated = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/badge_checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': pair.data.kiosk_credential },
      body: JSON.stringify({ qr_text: `ENVISIT:${direct.data.visit.badge_checkout_token}` })
    }), env, ctx(), '/visitor/kiosk/badge_checkout');
    const repeatedData = await repeated.json();
    assert.equal(repeatedData.already, true);
  }

  {
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {});
    await instance.ready;
    const { credential, visit, dedupe } = await pairedKioskVisit(mod, instance, {
      visitor_first_name: 'Returning',
      visitor_middle_name: 'Q',
      visitor_last_name: 'Parent',
      visitor_type: 'parent_guardian',
      purpose: 'meeting',
      returning_opt_in: true
    });
    const photoId = mod.newVisitorPhotoId_();
    const attached = await doJson(instance, '/attach_photo', {
      visit_id: visit.visit_id,
      kiosk_credential: credential,
      dedupe_key: dedupe,
      photo_id: photoId,
      source: 'kiosk_camera'
    });
    assert.equal(attached.data.ok, true);
    const admitted = await doJson(instance, '/admit', { visit_id: visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(admitted.data.ok, true);
    assert.match(admitted.data.returning_pass.qr_text, /^ENVISITOR:[A-Za-z0-9_-]{64,220}$/);
    assert.equal(admitted.data.profile.visitor_type, 'parent_guardian');
    assert.equal(admitted.data.profile.latest_photo_id, photoId);
    assert.equal(admitted.data.profile.latest_photo_month, mod.visitorNycMonth_(new Date().toISOString()));
    const plaintextToken = admitted.data.returning_pass.qr_text.slice('ENVISITOR:'.length);
    const storageJson = JSON.stringify([...state.storage.map.entries()]);
    assert.equal(storageJson.includes(admitted.data.returning_pass.qr_text), false, 'DO storage must not persist ENVISITOR plaintext');
    assert.equal(storageJson.includes(plaintextToken), false, 'DO storage must not persist reusable token plaintext');
    assert.equal(storageJson.includes('profile_cred:'), true, 'DO storage should index only a hashed credential');

    const r2 = new FakeR2();
    await r2.put(mod.visitorPhotoKey_(photoId), fakeJpeg(), { httpMetadata: { contentType: 'image/jpeg' } });
    const env = { VISITOR_DESK_DO: doStub(instance), VISITOR_PHOTOS: r2 };
    assert.equal((await mod.returningPhotoCurrent_(env, admitted.data.profile)).current, true);
    assert.equal((await mod.returningPhotoCurrent_({ VISITOR_PHOTOS: new FakeR2() }, admitted.data.profile)).reason, 'photo_expired');
    assert.equal((await mod.returningPhotoCurrent_(env, { ...admitted.data.profile, latest_photo_month: '2026-01' })).reason, 'photo_month_stale');
    await doJson(instance, '/checkout', { visit_id: admitted.data.visit.visit_id, actor_email: 'security@example.org' });

    const scanResp = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/returning_scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': credential },
      body: JSON.stringify({ qr_text: admitted.data.returning_pass.qr_text })
    }), env, ctx(), '/visitor/kiosk/returning_scan');
    const scan = await scanResp.json();
    assert.equal(scanResp.status, 200);
    assert.equal(scan.mode, 'checkin');
    assert.equal(scan.photo_current, true, 'current-month profile photo with live R2 object should be reusable');
    assert.equal(JSON.stringify(scan).includes(plaintextToken), false, 'kiosk scan response must not echo reusable token');

    const returningSubmit = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': credential },
      body: JSON.stringify({
        dedupe_key: 'returning-claim-submit',
        visitor: {
          visitor_first_name: scan.profile.visitor_first_name,
          visitor_middle_name: scan.profile.visitor_middle_name,
          visitor_last_name: scan.profile.visitor_last_name,
          date_of_birth: scan.profile.date_of_birth,
          visitor_type: 'parent_guardian',
          purpose: 'meeting',
          returning_claim: scan.claim
        }
      })
    }), env, ctx(), '/visitor/kiosk/submit');
    const returningData = await returningSubmit.json();
    assert.equal(returningSubmit.status, 200);
    assert.equal(returningData.visit.visitor_profile_id, admitted.data.profile.profile_id);
    assert.equal(returningData.visit.photo_id, photoId);
    assert.equal(returningData.visit.photo_source, 'returning_profile_reuse');
    assert.equal(r2.map.size, 1, 'reused monthly photo should not upload a duplicate JPEG');

    const reusedClaimAgain = await doJson(instance, '/submit', {
      kiosk_credential: credential,
      dedupe_key: 'returning-claim-reuse',
      returning_claim: scan.claim,
      visitor: {
        visitor_first_name: 'Duplicate',
        visitor_last_name: 'Parent',
        date_of_birth: '1980-01-01',
        visitor_type: 'parent_guardian',
        purpose: 'meeting'
      }
    });
    assert.equal(reusedClaimAgain.resp.status, 409, 'returning check-in claims should be single-use after successful submit');

    const secondAdmit = await doJson(instance, '/admit', { visit_id: returningData.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(secondAdmit.data.ok, true);
    const activeScanResp = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/returning_scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': credential },
      body: JSON.stringify({ qr_text: admitted.data.returning_pass.qr_text })
    }), env, ctx(), '/visitor/kiosk/returning_scan');
    const activeScan = await activeScanResp.json();
    assert.equal(activeScan.mode, 'active');
    assert.equal(activeScan.checkout_claim.startsWith('rclaim_'), true);
    const checkoutResp = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/returning_checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': credential },
      body: JSON.stringify({ checkout_claim: activeScan.checkout_claim })
    }), env, ctx(), '/visitor/kiosk/returning_checkout');
    const checkoutData = await checkoutResp.json();
    assert.equal(checkoutResp.status, 200);
    assert.equal(checkoutData.visit.status, 'checked_out');

    const replaced = await doJson(instance, '/returning_replace', { profile_id: admitted.data.profile.profile_id, actor_email: 'security@example.org' });
    assert.equal(replaced.data.ok, true);
    assert.notEqual(replaced.data.returning_pass.qr_text, admitted.data.returning_pass.qr_text);
    const oldAfterReplace = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/returning_scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': credential },
      body: JSON.stringify({ qr_text: admitted.data.returning_pass.qr_text })
    }), env, ctx(), '/visitor/kiosk/returning_scan');
    assert.notEqual(oldAfterReplace.status, 200, 'replaced reusable pass must invalidate old token');
    const revoked = await doJson(instance, '/returning_revoke', { profile_id: admitted.data.profile.profile_id, actor_email: 'security@example.org' });
    assert.equal(revoked.data.profile.status, 'revoked');
    const revokedScan = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/returning_scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': credential },
      body: JSON.stringify({ qr_text: replaced.data.returning_pass.qr_text })
    }), env, ctx(), '/visitor/kiosk/returning_scan');
    assert.notEqual(revokedScan.status, 200, 'revoked reusable pass must fail future scans');
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

  {
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {});
    await instance.ready;
    const created = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'Auto',
        visitor_last_name: 'Print',
        date_of_birth: '1980-01-01',
        visitor_type: 'school_guest',
        purpose: 'meeting',
        photo_required_override: true
      }
    });
    assert.equal(created.data.ok, true);
    assert.equal(created.data.print_job.status, 'queued');
    const claim = await doJson(instance, '/print_agent_claim', {
      agent_id: 'front-desk-test',
      printer_name: 'Brother QL-820NWBc',
      host_name: 'VISITOR-DESK',
      version: 'test'
    });
    assert.equal(claim.data.ok, true);
    assert.equal(claim.data.job.job_id, created.data.print_job.job_id);
    assert.equal(claim.data.visit.badge_checkout_token.length > 10, true);
    const done = await doJson(instance, '/print_agent_complete', {
      job_id: claim.data.job.job_id,
      agent_id: 'front-desk-test',
      success: true,
      printer_name: 'Brother QL-820NWBc'
    });
    assert.equal(done.data.ok, true);
    assert.equal(done.data.job.status, 'sent');
    const empty = await doJson(instance, '/print_agent_claim', { agent_id: 'front-desk-test' });
    assert.equal(empty.data.job, null);

    const reprint = await doJson(instance, '/reprint', { visit_id: created.data.visit.visit_id });
    assert.equal(reprint.data.ok, true);
    assert.equal(reprint.data.print_job.reprint, true);
    assert.notEqual(reprint.data.print_job.job_id, created.data.print_job.job_id);
  }

  {
    // Regression: the kiosk diagnostics route must not be swallowed by the
    // badge-checkout route before it reaches the diagnostics Durable Object API.
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {});
    await instance.ready;
    const code = await doJson(instance, '/create_pair_code', { actor_email: 'security@example.org', label: 'Lab iPad' });
    const pair = await doJson(instance, '/pair', { code: code.data.code, label: 'Lab iPad', ip: '192.0.2.45' });
    const env = { VISITOR_DESK_DO: doStub(instance) };
    const resp = await mod.handleVisitorKioskRoute_(new Request('https://worker.example/visitor/kiosk/idnyc_diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-visitor-kiosk': pair.data.kiosk_credential },
      body: JSON.stringify({ diagnostic: {
        source: 'scanner_lab_production',
        ocr_engine: 'tesseract',
        parser_success: false,
        birth_anchor_found: true,
        birth_candidate_found: true,
        birth_candidate_shape: 'DD/DD/DDDD',
        birth_candidate_corrected: true,
        birth_rejection: 'invalid_calendar'
      } })
    }), env, ctx(), '/visitor/kiosk/idnyc_diagnostics');
    const data = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    const listed = await doJson(instance, '/idnyc_diagnostics?limit=10');
    assert.equal(listed.data.diagnostics.length, 1);
    assert.equal(listed.data.diagnostics[0].birth_candidate_shape, 'DD/DD/DDDD');
  }

  {
    const state = new FakeState();
    const instance = new mod.VisitorDeskDO(state, {});
    await instance.ready;
    const code = await doJson(instance, '/create_pair_code', { actor_email: 'security@example.org', label: 'iPad' });
    const pair = await doJson(instance, '/pair', { code: code.data.code, label: 'iPad', ip: '192.0.2.44' });
    const saved = await doJson(instance, '/idnyc_diagnostic', {
      kiosk_credential: pair.data.kiosk_credential,
      diagnostic: {
        source: 'scanner_lab_production',
        ocr_engine: 'tesseract',
        text_length: 140,
        line_count: 11,
        parser_success: false,
        name_anchor_found: false,
        name_strategy: 'none',
        birth_anchor_found: true,
        birth_strategy: 'birth_anchor_no_date',
        birth_anchor_fuzzy: true,
        birth_candidate_found: true,
        birth_candidate_shape: 'DD/DD/DDDD',
        birth_candidate_corrected: true,
        birth_rejection: 'invalid_calendar',
        date_candidate_count: 2,
        labels: { name: false, birth: true, expiration: true, evil: true },
        parsed_fields: { first_name: false, last_name: false, birth_date: false },
        line_classes: ['TITLE', 'ID_NUMBER', 'ALPHA_CANDIDATE', 'DATE_VALUE', 'LEAK_ME'],
        raw_ocr_text: 'JANE DOE 01/02/1980',
        visitor_first_name: 'JANE',
        date_of_birth: '1980-01-02'
      }
    });
    assert.equal(saved.data.ok, true);
    const listed = await doJson(instance, '/idnyc_diagnostics?limit=10');
    assert.equal(listed.data.ok, true);
    assert.equal(listed.data.diagnostics.length, 1);
    const diag = listed.data.diagnostics[0];
    assert.equal(diag.labels.birth, true);
    assert.equal(diag.labels.expiration, true);
    assert.equal(diag.birth_candidate_shape, 'DD/DD/DDDD');
    assert.equal(diag.birth_candidate_corrected, true);
    assert.equal(diag.birth_rejection, 'invalid_calendar');
    assert.equal(diag.line_classes.includes('LEAK_ME'), false);
    const serialized = JSON.stringify(diag);
    assert.equal(serialized.includes('JANE'), false);
    assert.equal(serialized.includes('1980-01-02'), false);
    assert.equal(serialized.includes('raw_ocr_text'), false);
    const cleared = await doJson(instance, '/idnyc_diagnostics_clear', {});
    assert.equal(cleared.data.ok, true);
    assert.equal(cleared.data.deleted, 1);
  }

  {
    assert.match(workerSource, /\/visitor\/kiosk\/badge_checkout" \|\| path === "\/visitor\/kiosk\/idnyc_diagnostics"/, 'Top-level Worker dispatch must route NYCID diagnostics into the Visitor kiosk handler');
  }

  {
    assert.match(workerSource, /VISITOR_PRINT_AGENT_TOKEN/, 'Worker should require a dedicated print-agent secret');
    assert.match(workerSource, /\/visitor\/print-agent\/claim/, 'Worker should expose the print-agent claim route');
    assert.match(workerSource, /\/visitor\/print-agent\/complete/, 'Worker should expose the print-agent completion route');
    assert.match(workerSource, /\/visitor\/print-agent\/photo/, 'Worker should expose the token-scoped print-agent photo route');
  }

  console.log('visitor_worker_repair tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
