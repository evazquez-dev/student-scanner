const assert = require('node:assert/strict');
const Shared = require('../visitor/visitor_shared.js');

(async () => {

function syntheticAamva(fields) {
  return [
    '@',
    'ANSI 636000000000DL00410288ZA03290015DLDAQSYNTHETIC123',
    ...fields
  ].join('\n');
}

function assertNoForbidden(obj) {
  const blob = JSON.stringify(obj).toLowerCase();
  [
    'synthetic123',
    'date_of_birth',
    'dob',
    'main street',
    'document_number',
    'driver_license_number',
    'license_number',
    'raw_pdf417',
    'raw_aamva',
    'barcode'
  ].forEach((needle) => assert.equal(blob.includes(needle), false, `forbidden value leaked: ${needle}`));
}

{
  assert.equal(Object.prototype.hasOwnProperty.call(Shared.PURPOSES, 'student_pickup'), false);
  assert.equal(Shared.purposeLabel('meeting', 'es'), 'Reunión');
}

{
  const raw = syntheticAamva([
    'DCSDOE',
    'DACJANE',
    'DADQ',
    'DBA20301231',
    'DAJNY',
    'DBB19800101',
    'DAG123 Main Street',
    'DAQSYNTHETIC123'
  ]);
  const parsed = Shared.parseAamva(raw, { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, {
    visitor_first_name: 'JANE',
    visitor_middle_name: 'Q',
    visitor_last_name: 'DOE',
    id_document_type: 'Driver License / State ID',
    id_issuing_jurisdiction: 'NY',
    id_expired: false,
    id_verified: true
  });
  assertNoForbidden(parsed);
}

{
  const raw = syntheticAamva([
    'DAJCA',
    'DBA12312030',
    'DCSROE',
    'DCTRICHARD ALLEN',
    'DAQDO-NOT-STORE',
    'DAG456 Side Street'
  ]);
  const parsed = Shared.parseAamva(raw, { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.visitor_first_name, 'RICHARD');
  assert.equal(parsed.data.visitor_middle_name, 'ALLEN');
  assert.equal(parsed.data.visitor_last_name, 'ROE');
  assert.equal(parsed.data.id_issuing_jurisdiction, 'CA');
  assert.equal(parsed.data.id_expired, false);
  assertNoForbidden(parsed);
}

{
  const raw = syntheticAamva([
    'DCSMORALES',
    'DACANA',
    'DBA20200101',
    'DAJTX'
  ]);
  const parsed = Shared.parseAamva(raw, { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.visitor_middle_name, '');
  assert.equal(parsed.data.id_expired, true);
}

{
  const parsed = Shared.parseAamva('ordinary keyboard text');
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.data, {});
}

{
  const redacted = Shared.redactForbidden({
    visitor_first_name: 'SAFE',
    DAQ: 'DO-NOT-STORE',
    dob: '19800101',
    address: '123 Main Street',
    raw_pdf417: 'raw'
  });
  assert.deepEqual(redacted, { visitor_first_name: 'SAFE' });
}

{
  assert.equal(Shared.cleanText('<script>alert(1)</script>', 20).length, 20);
  assert.equal(Shared.escapeHtml('<script>').includes('&lt;script&gt;'), true);
}

{
  const token = 'A'.repeat(43);
  const parsed = Shared.parseVisitorBadgeScan(`ENVISIT:${token}`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.token, token);
  assert.equal(Shared.parseVisitorBadgeScan('ENVISIT:short').ok, false);
  assert.equal(Shared.parseVisitorBadgeScan('random unrelated scanner input').ok, false);
}

{
  const active = new Map([['B'.repeat(43), 'visit_1']]);
  const used = new Set();
  function checkout(scan) {
    const parsed = Shared.parseVisitorBadgeScan(scan);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (used.has(parsed.token)) return { ok: true, already: true };
    if (!active.has(parsed.token)) return { ok: false, error: 'invalid_token' };
    active.delete(parsed.token);
    used.add(parsed.token);
    return { ok: true, already: false };
  }
  assert.deepEqual(checkout(`ENVISIT:${'B'.repeat(43)}`), { ok: true, already: false });
  assert.deepEqual(checkout(`ENVISIT:${'B'.repeat(43)}`), { ok: true, already: true });
  assert.deepEqual(checkout(`ENVISIT:${'C'.repeat(43)}`), { ok: false, error: 'invalid_token' });
}

{
  const token = `ENVISIT:${'D'.repeat(43)}`;
  const svg = Shared.makeQrSvg(token);
  assert.equal(svg.startsWith('<svg'), true);
  assert.equal(svg.includes(token), false);
}

{
  const raw = syntheticAamva([
    'DCSDOE',
    'DACJANE',
    'DADQ',
    'DBA12312030',
    'DAJNY'
  ]);
  const scans = [];
  const scanner = Shared.createScannerBuffer((scan) => scans.push(scan), { multiline: true, settleMs: 25, minLength: 30 });
  for (const ch of raw) scanner.acceptChar(ch);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(scans.length, 1);
  assert.equal(scans[0], raw);
  const parsed = Shared.parseAamva(scans[0], { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.visitor_first_name, 'JANE');
  assert.equal(parsed.data.visitor_middle_name, 'Q');
  assert.equal(parsed.data.visitor_last_name, 'DOE');
  assert.equal(parsed.data.id_issuing_jurisdiction, 'NY');
}

console.log('visitor_shared tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
