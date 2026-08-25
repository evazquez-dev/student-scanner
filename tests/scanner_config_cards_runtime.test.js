const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/scanner-config-cards.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [
      String(key),
      typeof value === 'string' ? value : JSON.stringify(value)
    ]));
    this.puts = [];
    this.deletes = [];
  }
  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json' || options === 'json') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }
  async put(key, value, options = {}) {
    this.puts.push({ key: String(key), value: String(value), options: { ...options } });
    this.map.set(String(key), String(value));
  }
  async delete(key) {
    this.deletes.push(String(key));
    this.map.delete(String(key));
  }
}

async function service() {
  return import(`${serviceUrl}?v=${Date.now()}-${Math.random()}`);
}

function env(seed = {}) {
  return { ROSTER: new FakeKV(seed) };
}

test('Scanner config cards save distinct numeric tags and preserve their entered values', async () => {
  const mod = await service();
  const e = env({ roster_v1: { rows: [] } });
  const result = await mod.saveScannerConfigCards(e, { unlock_rfid: '001234', lock_rfid: '009876' }, 'boss@school.org');
  assert.equal(result.ok, true);
  assert.equal(result.unlock_rfid, '001234');
  assert.equal(result.lock_rfid, '009876');
  const stored = await e.ROSTER.get('scanner_config_cards_v1', { type: 'json' });
  assert.equal(stored.updated_by, 'boss@school.org');
  assert.equal(stored.v, 2);
});

test('Scanner config cards reject same-card and student OSIS/RFID collisions', async () => {
  const mod = await service();
  const e = env({
    roster_v1: {
      rows: [
        { o: '123456789', n: 'Student One', rf: '555001, 555002' }
      ]
    }
  });

  let result = await mod.saveScannerConfigCards(e, { unlock_rfid: '000123', lock_rfid: '123' }, 'boss');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'rfid_cards_must_be_different');

  result = await mod.saveScannerConfigCards(e, { unlock_rfid: '555001', lock_rfid: '777' }, 'boss');
  assert.equal(result.status, 409);
  assert.equal(result.error, 'rfid_already_assigned_to_student');
  assert.equal(result.collision.kind, 'rfid');

  result = await mod.saveScannerConfigCards(e, { unlock_rfid: '888', lock_rfid: '123456789' }, 'boss');
  assert.equal(result.status, 409);
  assert.equal(result.collision.kind, 'osis');
});

test('Either configured card toggles the current device between locked and unlocked', async () => {
  const mod = await service();
  const e = env({
    roster_v1: { rows: [] },
    scanner_config_cards_v1: { unlock_rfid: '111', lock_rfid: '222' }
  });

  // Card 1 locks an unlocked scanner to its selected location.
  let result = await mod.applyScannerConfigCard(e, { code: '000111', device_id: 'device-a', location: '306' });
  assert.equal(result.ok, true);
  assert.equal(result.matched, true);
  assert.equal(result.card, 'card_1');
  assert.equal(result.action, 'lock');
  assert.equal(result.locked, true);
  assert.equal(await e.ROSTER.get('bind:device-a'), '306');
  let bindPut = e.ROSTER.puts.find((x) => x.key === 'bind:device-a');
  assert.equal(bindPut.options.expirationTtl, 60 * 60 * 24 * 365 * 5);

  // Card 2 unlocks that same scanner because it is currently locked.
  result = await mod.applyScannerConfigCard(e, { code: '222', device_id: 'device-a', location: '306' });
  assert.equal(result.ok, true);
  assert.equal(result.card, 'card_2');
  assert.equal(result.action, 'unlock');
  assert.equal(result.locked, false);
  assert.equal(await e.ROSTER.get('bind:device-a'), null);

  // Card 2 can also lock when the scanner is currently unlocked.
  result = await mod.applyScannerConfigCard(e, { code: '222', device_id: 'device-a', location: '306' });
  assert.equal(result.ok, true);
  assert.equal(result.card, 'card_2');
  assert.equal(result.action, 'lock');
  assert.equal(result.locked, true);
  assert.equal(await e.ROSTER.get('bind:device-a'), '306');

  // And Card 1 can unlock when the scanner is currently locked.
  result = await mod.applyScannerConfigCard(e, { code: '111', device_id: 'device-a', location: '306' });
  assert.equal(result.ok, true);
  assert.equal(result.card, 'card_1');
  assert.equal(result.action, 'unlock');
  assert.equal(result.locked, false);
  assert.equal(await e.ROSTER.get('bind:device-a'), null);
  assert.ok(e.ROSTER.deletes.includes('bind:device-a'));
});

test('Unmatched scans do not mutate device bindings and toggle lock requires a selected location', async () => {
  const mod = await service();
  const e = env({
    roster_v1: { rows: [] },
    scanner_config_cards_v1: { unlock_rfid: '111', lock_rfid: '222' }
  });

  let result = await mod.applyScannerConfigCard(e, { code: '333', device_id: 'device-a', location: '306' });
  assert.equal(result.matched, false);
  assert.equal(await e.ROSTER.get('bind:device-a'), null);

  result = await mod.applyScannerConfigCard(e, { code: '222', device_id: 'device-a', location: '' });
  assert.equal(result.matched, true);
  assert.equal(result.card, 'card_2');
  assert.equal(result.action, 'lock');
  assert.equal(result.status, 409);
  assert.equal(result.error, 'location_required_before_lock');
  assert.equal(await e.ROSTER.get('bind:device-a'), null);
});
