
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const scannerRoot=path.resolve(here,'..');
const root=path.resolve(scannerRoot,'..');
const read=(rel)=>readFileSync(path.join(root,rel),'utf8');

test('automatic Attendance MTSS cases route to Social Work pool and preserve advisors',()=>{
  const svc=read('cf-redcake/red-cake-77d5/src/services/mtss.js');
  assert.match(svc,/resolveAutoAttendanceSocialWorkOwnership/);
  assert.match(svc,/social_work_pool/);
  assert.match(svc,/openedSource === 'auto'/);
  assert.match(svc,/collaborator_emails/);
});

test('Social Work can list and atomically claim automatic attendance cases',()=>{
  const svc=read('cf-redcake/red-cake-77d5/src/services/mtss.js');
  const route=read('cf-redcake/red-cake-77d5/src/routes/mtss.js');
  assert.match(svc,/listMtssSocialWorkQueue/);
  assert.match(svc,/claimMtssSocialWorkCase/);
  assert.match(svc,/social_work_claimed/);
  assert.match(svc,/owner_source<>'manual'/);
  assert.match(route,/\/admin\/mtss\/social_work_queue/);
  assert.match(route,/\/admin\/mtss\/case\/claim/);
  assert.match(route,/counselor_social_work/);
});

test('Social Work dashboard exposes unclaimed, mine, team and claim action',()=>{
  const js=read('student-scanner/admin/social_work_referrals.js');
  assert.match(js,/Attendance MTSS/);
  assert.match(js,/Unclaimed/);
  assert.match(js,/My cases/);
  assert.match(js,/Team claimed/);
  assert.match(js,/Claim case/);
  assert.match(js,/\/admin\/mtss\/case\/claim/);
  assert.match(js,/\/admin\/mtss\/social_work_queue/);
});
