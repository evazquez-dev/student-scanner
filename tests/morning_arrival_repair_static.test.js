// EAGLENEST_RAW_SCAN_VIEWER_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const scannerRoot=path.resolve(here,'..');
const repoRoot=path.resolve(scannerRoot,'..');

test('former morning arrival page is now a read-only super-admin raw scan viewer',()=>{
  const html=fs.readFileSync(path.join(scannerRoot,'admin/morning_arrival_repair.html'),'utf8');
  const js=fs.readFileSync(path.join(scannerRoot,'admin/morning_arrival_repair.js'),'utf8');
  const nav=fs.readFileSync(path.join(scannerRoot,'admin/nav.js'),'utf8');
  const index=fs.readFileSync(path.join(repoRoot,'cf-redcake/red-cake-77d5/src/index.js'),'utf8');
  const route=fs.readFileSync(path.join(repoRoot,'cf-redcake/red-cake-77d5/src/routes/morning-arrival-historical-repair.js'),'utf8');
  const service=fs.readFileSync(path.join(repoRoot,'cf-redcake/red-cake-77d5/src/services/raw-scan-viewer.js'),'utf8');

  assert.match(html,/Raw Scan Data/);
  assert.match(html,/Read-only D1 viewer/);
  assert.doesNotMatch(html,/Apply selected Late|writes to PowerSchool|Historical Audit & Repair/);
  assert.match(js,/\/admin\/raw_scans\/query/);
  assert.match(js,/\/admin\/raw_scans\/meta/);
  assert.match(js,/\/admin\/raw_scans\/detail/);
  assert.doesNotMatch(js,/morning_arrival_repair\/apply/);
  assert.match(nav,/Raw Scan Data/);
  assert.match(nav,/morning_arrival_repair\.html/);
  assert.match(index,/MORNING_ARRIVAL_REPAIR_PATHS/);
  assert.match(route,/super_admin_required/);
  assert.match(route,/req\.method !== 'GET'/);
  assert.match(service,/FROM scan_events/);
  assert.match(service,/student_name/);
  assert.match(service,/location = \?/);
  assert.match(service,/source = \?/);
  assert.match(service,/device_id = \?/);
  assert.match(service,/SELECT \*/);
  assert.doesNotMatch(route,/sendPowerSchool|mutationOriginAllowed|applyMorningArrival/);
});
