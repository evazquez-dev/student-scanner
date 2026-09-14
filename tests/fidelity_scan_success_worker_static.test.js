const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'services', 'fidelity-d1.js'), 'utf8');
const kiosk = fs.readFileSync(path.join(root, 'student-scanner', 'index.html'), 'utf8');
const fidelityUi = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'fidelity.js'), 'utf8');

test('successful physical scan Fidelity is owned by the authoritative Worker path', () => {
  assert.match(worker, /async function captureAuthoritativeScanSuccessFidelity_/);
  assert.match(worker, /event_id:\s*`scan:\$\{eventId\}`/);
  assert.match(worker, /event_type:\s*"kiosk_scan_success"/);
  assert.match(worker, /event_at_iso:\s*whenISO/);
  assert.match(worker, /ny_date:\s*date/);
  assert.match(worker, /authoritative_source:\s*"worker_scan_event"/);

  const calls = worker.match(/captureAuthoritativeScanSuccessFidelity_\(/g) || [];
  assert.ok(calls.length >= 3, 'expected helper definition plus class-needs-reason and final-success calls');
});

test('successful scan Fidelity uses the immutable scan event identity for retry dedupe', () => {
  assert.match(service, /const scanEventId = d1Clean\(meta\?\.scan_event_id,\s*160\)/);
  assert.match(service, /eventType === 'kiosk_scan_success' && scanEventId/);
  assert.match(service, /return `scan:\$\{scanEventId\}`/);
  assert.match(worker, /const explicitSchoolDate = cleanFidelityStr_\(merged\.ny_date \|\| merged\.school_date,\s*10\)/);
  assert.match(worker, /ny_date:\s*schoolDate/);
});

test('current kiosk shell no longer owns successful-scan Fidelity delivery', () => {
  assert.doesNotMatch(kiosk, /emitKioskFidelityEvent\('kiosk_scan_success'/);
  assert.match(kiosk, /Successful physical-scan Fidelity is Worker-owned/);
  assert.match(kiosk, /emitKioskFidelityEvent\('kiosk_scan_error'/);
});

test('historical Fidelity view describes observations rather than current activity', () => {
  assert.match(fidelityUi, /Devices observed/);
  assert.match(fidelityUi, /seen on selected date/);
  assert.match(fidelityUi, /last seen that day/);
  assert.match(fidelityUi, /Reported online/);
  assert.match(fidelityUi, /observed on selected date/);
});
