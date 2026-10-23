const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'student-scanner/admin/hallway.js'), 'utf8');
const helperCode = source.split('// EAGLENEST_HALLWAY_STAFF_FILTER_V1_BEGIN')[1]
  ?.split('// EAGLENEST_HALLWAY_STAFF_FILTER_V1_END')[0];
assert.ok(helperCode,'Hallway staff filter helper is installed');
const scope = {};
vm.runInNewContext(`${helperCode}\nthis.filter=hallwayStaffFilterState;`,scope);
const filter = scope.filter;

test('staff filter includes active class/bathroom/unknown physical zones', () => {
  for (const zone of ['class','bathroom','other','hallway','off_campus']) {
    const x=filter({zone,staff_hold_active:true,staff_pull_active:true},new Set(['with_staff']));
    assert.equal(x.show,true,zone);assert.equal(x.groupWithStaff,true,zone);
    assert.equal(x.showStaffBadge,true,zone);
  }
});
test('with-staff filter excludes stale raw holder when validated flags are absent/false', () => {
  assert.equal(filter({zone:'class',held_by_email:'old@example.org',staff_pull_active:false,staff_hold_active:false},new Set(['with_staff'])).show,false);
  assert.equal(filter({zone:'other',held_by_email:'old@example.org'},new Set(['with_staff'])).show,false);
});
test('physical bathroom filter retains a current staff-held student', () => {
  const x=filter({zone:'bathroom',staff_hold_active:true},new Set(['bathroom']));
  assert.equal(x.show,true);assert.equal(x.groupWithStaff,false);assert.equal(x.showStaffBadge,true);
});
test('when staff plus bathroom selected, show once in Staff section', () => {
  const x=filter({zone:'bathroom',staff_hold_active:true},new Set(['bathroom','with_staff']));
  assert.equal(x.show,true);assert.equal(x.groupWithStaff,true);
  assert.match(source,/const seenOsis = new Set\(\)/);
  assert.match(source,/if \(osis && seenOsis\.has\(osis\)\) continue/);
});
test('staff hold never rewrites physical zone or physical-location label', () => {
  assert.match(source,/locLabel: String\(s\.locLabel \|\| locLabel \|\| s\.loc \|\| ''\)\.trim\(\)/);
  assert.match(source,/chip\.textContent = String\(zone \|\| ''\)\.toUpperCase\(\)/);
  assert.match(source,/staffChip\.textContent = 'WITH STAFF'/);
  assert.match(source,/const SNAPSHOT_PATH = '\/admin\/hallway_state_monitor'/);
});
