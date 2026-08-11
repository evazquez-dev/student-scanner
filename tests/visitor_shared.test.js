const assert = require('node:assert/strict');
const Shared = require('../visitor/visitor_shared.js');
const IdScan = require('../visitor/id_scan_adapters.js');

(async () => {

function syntheticAamva(fields) {
  return [
    '@',
    'ANSI 636000000000DL00410288ZA03290015DLDAQSYNTHETIC123',
    ...fields
  ].join('\n');
}

function asciiBytes(text) {
  return new Uint8Array(Array.from(String(text || ''), (ch) => ch.charCodeAt(0) & 0xff));
}

function syntheticAamvaBytes(subfiles, options) {
  const opts = options || {};
  const bodies = subfiles.map((item) => `${item.type}${item.fields.join('\n')}\r`);
  let offset = 21 + (subfiles.length * 10);
  const descriptors = bodies.map((body, index) => {
    const type = subfiles[index].type;
    const descriptor = `${type}${String(offset).padStart(4, '0')}${String(body.length).padStart(4, '0')}`;
    offset += body.length;
    return descriptor;
  });
  const header = `@\n\x1e\rANSI 636000${opts.version || '10'}${opts.jurisdiction || '04'}${String(subfiles.length).padStart(2, '0')}${descriptors.join('')}`;
  assert.equal(header.length, 21 + (subfiles.length * 10), 'synthetic raw AAMVA offsets should be exact');
  return asciiBytes(header + bodies.join(''));
}

function assertNoForbidden(obj) {
  const blob = JSON.stringify(obj).toLowerCase();
  [
    'synthetic123',
    'dob',
    'main street',
    'dbb',
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
    date_of_birth: '1980-01-01',
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
    'DBB01021979',
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
  assert.equal(parsed.data.date_of_birth, '1979-01-02');
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
  const bytes = syntheticAamvaBytes([
    {
      type: 'DL',
      fields: [
        'DCSDOE',
        'DACJANE',
        'DADQ',
        'DBB01021980',
        'DBA12312030',
        'DAJNY',
        'DAQDO-NOT-STORE',
        'DAG123 Main Street'
      ]
    }
  ]);
  const parsed = Shared.parseAamva({ text: '@ANSI HRI TEXT WITHOUT DATA ELEMENTS', bytes, format: 'PDF417' }, { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.data.visitor_first_name, 'JANE');
  assert.equal(parsed.data.visitor_middle_name, 'Q');
  assert.equal(parsed.data.visitor_last_name, 'DOE');
  assert.equal(parsed.data.date_of_birth, '1980-01-02');
  assert.equal(parsed.data.id_issuing_jurisdiction, 'NY');
  assertNoForbidden(parsed);
}

{
  const bytes = syntheticAamvaBytes([
    {
      type: 'EN',
      fields: [
        'DCSENLAST',
        'DACENFIRST',
        'DADQ',
        'DBB01011990',
        'DAJNY'
      ]
    },
    {
      type: 'ZN',
      fields: [
        'DCSIGNOREME',
        'DACWRONG',
        'DBB12312001',
        'DAQJURISDICTION-ONLY'
      ]
    }
  ]);
  const parsed = Shared.parseAamva({ text: '@ANSI HRI TEXT WITHOUT EN FIELDS', bytes, format: 'PDF417' }, { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.data.visitor_first_name, 'ENFIRST');
  assert.equal(parsed.data.visitor_middle_name, 'Q');
  assert.equal(parsed.data.visitor_last_name, 'ENLAST');
  assert.equal(parsed.data.date_of_birth, '1990-01-01');
  assertNoForbidden(parsed);
  assert.equal(JSON.stringify(parsed).includes('IGNOREME'), false);
  assert.equal(JSON.stringify(parsed).includes('WRONG'), false);
}

{
  const bytes = syntheticAamvaBytes([
    {
      type: 'ID',
      fields: [
        'DCSROE',
        'DCTRICHARD ALLEN',
        'DBB19810203',
        'DAJCA'
      ]
    }
  ]);
  const parsed = Shared.parseAamva({ text: '@ANSI HRI TEXT WITHOUT ID FIELDS', bytes, format: 'PDF417' }, { now: '2026-08-10T12:00:00Z' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.data.visitor_first_name, 'RICHARD');
  assert.equal(parsed.data.visitor_middle_name, 'ALLEN');
  assert.equal(parsed.data.visitor_last_name, 'ROE');
  assert.equal(parsed.data.date_of_birth, '1981-02-03');
  assert.equal(parsed.data.id_issuing_jurisdiction, 'CA');
  assertNoForbidden(parsed);
}

{
  const raw = syntheticAamva([
    'DCSDOE',
    'DACJANE',
    'DBB19800101',
    'DBA12312030',
    'DAJNY'
  ]);
  assert.equal(IdScan.looksLikeAamvaPdf417(raw), true);
  assert.equal(IdScan.looksLikeAamvaPdf417('PDF417 payload from a shipping label'), false);
  assert.equal(IdScan.PDF417_READER_OPTIONS.formats.includes('PDF417'), true);
  assert.equal(IdScan.PDF417_READER_OPTIONS.binarizer, 'LocalAverage');
  assert.equal(IdScan.PDF417_READER_OPTIONS.tryDenoise, true);
  assert.equal(IdScan.PDF417_READER_OPTIONS.returnErrors, true);
  assert.equal(IdScan.STATE_ID_REQUIRED_MATCHES, 2);
  assert.equal(IdScan.looksLikeUsableIdnycText('DOB 01/02/1990'), false);
  assert.equal(IdScan.looksLikeUsableIdnycText('JANE Q DOE\nDOB 01/02/1990'), true);
}

{
  const redacted = Shared.redactForbidden({
    visitor_first_name: 'SAFE',
    date_of_birth: '1980-01-01',
    DAQ: 'DO-NOT-STORE',
    dob: '19800101',
    address: '123 Main Street',
    raw_pdf417: 'raw'
  });
  assert.deepEqual(redacted, { visitor_first_name: 'SAFE', date_of_birth: '1980-01-01' });
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
    'DBB19800101',
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
  assert.equal(parsed.data.date_of_birth, '1980-01-01');
  assert.equal(parsed.data.id_issuing_jurisdiction, 'NY');
}

{
  assert.equal(Shared.normalizeDateOfBirth('01/02/1980'), '1980-01-02');
  assert.equal(Shared.normalizeDateOfBirth('1980-02-31'), '');
  assert.equal(Shared.isFutureDate('2030-01-01', '2026-08-10T12:00:00'), true);
  assert.equal(Shared.isFutureDate('1980-01-01', '2026-08-10T12:00:00'), false);
}

{
  const parsed = Shared.parseIdnycOcrText([
    'IDNYC',
    'NAME: ERICK M VAZQUEZ',
    'DATE OF BIRTH 08/11/1980',
    'ID NUMBER 999999999',
    '123 HOME STREET'
  ].join('\n'));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, {
    visitor_first_name: 'ERICK',
    visitor_middle_name: 'M',
    visitor_last_name: 'VAZQUEZ',
    date_of_birth: '1980-08-11'
  });
  assertNoForbidden(parsed);
}

{
  const parsed = Shared.parseIdnycOcrText('IDNYC\nunclear text only');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data.date_of_birth || '', '');
}

console.log('visitor_shared tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
