// EAGLENEST_MORNING_ARRIVAL_HISTORICAL_REPAIR_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const scannerRoot=path.resolve(here,'..');
const repoRoot=path.resolve(scannerRoot,'..');

test('temporary morning arrival repair page is super-admin wired and uses safe endpoints',()=>{
  const html=fs.readFileSync(path.join(scannerRoot,'admin/morning_arrival_repair.html'),'utf8');
  const js=fs.readFileSync(path.join(scannerRoot,'admin/morning_arrival_repair.js'),'utf8');
  const nav=fs.readFileSync(path.join(scannerRoot,'admin/nav.js'),'utf8');
  const index=fs.readFileSync(path.join(repoRoot,'cf-redcake/red-cake-77d5/src/index.js'),'utf8');
  const route=fs.readFileSync(path.join(repoRoot,'cf-redcake/red-cake-77d5/src/routes/morning-arrival-historical-repair.js'),'utf8');
  const service=fs.readFileSync(path.join(repoRoot,'cf-redcake/red-cake-77d5/src/services/morning-arrival-historical-repair.js'),'utf8');

  assert.match(html,/Morning Arrival Historical Audit & Repair/);
  assert.match(js,/\/admin\/morning_arrival_repair\/audit/);
  assert.match(js,/\/admin\/morning_arrival_repair\/apply/);
  assert.match(nav,/morning_arrival_repair\.html/);
  assert.match(index,/MORNING_ARRIVAL_REPAIR_PATHS/);
  assert.match(route,/super_admin_required/);
  assert.match(service,/Front Entrance \(Morning\)/);
  assert.match(service,/Rear Entrance \(Morning\)/);
  assert.match(service,/sendPowerSchoolDailyReconcile/);
  assert.match(service,/morning_arrival_historical_repair/);
  assert.doesNotMatch(service,/DELETE FROM scan_events|UPDATE scan_events/);
});
