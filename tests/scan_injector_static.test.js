const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('Scan Injector page supports batch location/time selection and result reporting', () => {
  const html = read('student-scanner/admin/scan_injector.html');
  const js = read('student-scanner/admin/scan_injector.js');
  assert.match(html, /Inject at location/);
  assert.match(html, /Simulated scan time/);
  assert.match(html, /Seconds apart/);
  assert.match(html, /Select visible/);
  assert.match(html, /Paste OSIS list/);
  assert.match(html, /Add OSIS to selection/);
  assert.match(html, /Injection results/);
  assert.match(js, /\/admin\/scan_injector\/options/);
  assert.match(js, /\/admin\/scan_injector\/inject/);
  assert.match(js, /osisList:Array\.from\(state\.selected\)/);
  assert.match(js, /function addPastedOsis/);
  assert.match(js, /not found/);
  assert.match(js, /\\d\{6,12\}/);
});
