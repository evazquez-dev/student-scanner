const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadWorker() {
  const workerPath = path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/worker.js');
  const src = fs.readFileSync(workerPath, 'utf8')
    .replace('export {\n', 'export {\n  allowedCorsOrigin_,\n  badAdminMutationOrigin_,\n  handleVisitorAdminRoute_,\n  sanitizeVisitorPatch_,\n  sanitizeVisitorVerification_,\n  visitorCanonicalStudentLink_,\n');
  return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
}

class FakeStorage {
  constructor() {
    this.map = new Map();
    this.alarmAt = 0;
  }
  async get(key) {
    return this.map.get(key);
  }
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
  async setAlarm(ms) {
    this.alarmAt = ms;
  }
}

class FakeState {
  constructor() {
    this.storage = new FakeStorage();
  }
  blockConcurrencyWhile(fn) {
    return fn();
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

(async () => {
  const mod = await loadWorker();

  {
    const patch = mod.sanitizeVisitorPatch_({ visitor_first_name: 'Maria' });
    assert.deepEqual(patch, { visitor_first_name: 'Maria' });
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'student_osis'), false);

    const clear = mod.sanitizeVisitorPatch_({ destination: null });
    assert.deepEqual(clear, { destination: '' });

    const verification = mod.sanitizeVisitorVerification_({ id_verified: false }, 'security@example.org');
    assert.equal(verification.id_verified, false);
    assert.equal(verification.id_verified_at, '');
    assert.equal(verification.id_verified_by, '');
    assert.equal(verification.id_document_type, '');
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
    const instance = new mod.VisitorDeskDO(new FakeState(), {
      VISITOR_GAS_URL: 'https://visitor-gas.invalid/exec',
      VISITOR_GAS_SHARED_SECRET: 'test-secret'
    });
    await instance.ready;
    const first = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      visitor: {
        visitor_first_name: 'Jane',
        visitor_last_name: 'Doe',
        visitor_type: 'parent_guardian',
        purpose: 'student_pickup',
        student_osis: '123456789',
        student_name: 'Test Student'
      }
    });
    assert.equal(first.data.ok, true);
    assert.equal((await instance.state.storage.list({ prefix: 'persist:' })).size, 1);
    const visitId = first.data.visit.visit_id;
    const edit = await doJson(instance, '/update', { op: 'edit', visit_id: visitId, patch: { visitor_first_name: 'Maria' } });
    assert.equal(edit.data.ok, true);
    assert.equal(edit.data.visit.visitor_first_name, 'Maria');
    assert.equal(edit.data.visit.student_osis, '123456789');
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
        visitor_type: 'vendor_contractor',
        purpose: 'meeting'
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
    global.fetch = async () => {
      throw new Error('network detail must not leak');
    };
    const created = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      visitor: {
        visitor_first_name: 'Network',
        visitor_last_name: 'Failure',
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
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const wrongPurpose = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'Wrong',
        visitor_last_name: 'Purpose',
        visitor_type: 'parent_guardian',
        purpose: 'meeting',
        student_osis: '123456789',
        student_name: 'Test Student'
      }
    });
    const rejectWrongPurpose = await doJson(instance, '/pickup_begin', { visit_id: wrongPurpose.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(rejectWrongPurpose.resp.status, 409);
    assert.equal(rejectWrongPurpose.data.error, 'visit_not_student_pickup');

    const noStudent = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'No',
        visitor_last_name: 'Student',
        visitor_type: 'parent_guardian',
        purpose: 'student_pickup'
      }
    });
    const rejectNoStudent = await doJson(instance, '/pickup_begin', { visit_id: noStudent.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(rejectNoStudent.resp.status, 400);

    const good = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      direct_admit: true,
      visitor: {
        visitor_first_name: 'Pickup',
        visitor_last_name: 'Parent',
        visitor_type: 'parent_guardian',
        purpose: 'student_pickup',
        student_osis: '123456789',
        student_name: 'Test Student'
      }
    });
    const begin = await doJson(instance, '/pickup_begin', { visit_id: good.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(begin.data.ok, true);
    assert.equal(begin.data.visit.student_pickup_status, 'pending');
    assert.equal(!!begin.data.pickup_operation_id, true);
    const doubleBegin = await doJson(instance, '/pickup_begin', { visit_id: good.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(doubleBegin.resp.status, 409);
    const visitKey = instance._visitKey(good.data.visit.visit_id);
    const staleRec = await instance.state.storage.get(visitKey);
    staleRec.student_pickup_started_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await instance.state.storage.put(visitKey, staleRec);
    const recovered = await doJson(instance, '/pickup_begin', { visit_id: good.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(recovered.data.ok, true);
    assert.equal(recovered.data.recovered, true);
    assert.notEqual(recovered.data.pickup_operation_id, begin.data.pickup_operation_id);
    const complete = await doJson(instance, '/pickup_complete', { visit_id: good.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(complete.data.ok, true);
    assert.equal(complete.data.visit.student_pickup_status, 'completed');
    const completeAgain = await doJson(instance, '/pickup_complete', { visit_id: good.data.visit.visit_id, actor_email: 'security@example.org' });
    assert.equal(completeAgain.data.ok, true);
    assert.equal(completeAgain.data.already, true);
  }

  {
    const instance = new mod.VisitorDeskDO(new FakeState(), {});
    await instance.ready;
    const env = {
      ADMIN_TOKEN: 'admin-token',
      ROSTER: {
        async get(key) {
          if (key === 'roster_v1') {
            return JSON.stringify({
              ts: '2026-08-10T12:00:00Z',
              rows: [{ o: '123456789', n: 'Canonical Student', g: '9' }]
            });
          }
          return null;
        }
      },
      VISITOR_DESK_DO: {
        idFromName() { return 'visitor-global'; },
        get() {
          return {
            fetch(url, init) {
              return instance.fetch(new Request(url, init));
            }
          };
        }
      }
    };
    const created = await doJson(instance, '/staff_create', {
      actor_email: 'security@example.org',
      visitor: {
        visitor_first_name: 'Pickup',
        visitor_last_name: 'Guardian',
        visitor_type: 'parent_guardian',
        purpose: 'student_pickup'
      }
    });
    const request = new Request('https://worker.example/admin/visitor/link_student', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': 'admin-token' },
      body: JSON.stringify({
        visit_id: created.data.visit.visit_id,
        student_osis: '123456789',
        student_name: 'Fake Mismatch'
      })
    });
    const ctx = { waitUntil(p) { if (p && typeof p.catch === 'function') p.catch(() => {}); } };
    const resp = await mod.handleVisitorAdminRoute_(request, env, ctx, '/admin/visitor/link_student');
    const data = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.visit.student_osis, '123456789');
    assert.equal(data.visit.student_name, 'Canonical Student');

    const missing = await mod.visitorCanonicalStudentLink_(env, '999999999');
    assert.equal(missing.ok, false);
    assert.equal(missing.error, 'student_not_found');
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
    const code = await doJson(instance, '/create_pair_code', { actor_email: 'security@example.org', label: 'iPad' });
    assert.equal(code.data.ok, true);
    const pair = await doJson(instance, '/pair', { code: code.data.code, label: 'iPad', ip: '192.0.2.10' });
    assert.equal(pair.data.ok, true);
    const visitor = {
      visitor_first_name: 'Retry',
      visitor_last_name: 'Guest',
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
