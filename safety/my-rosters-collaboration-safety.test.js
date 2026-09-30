const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const service=fs.readFileSync(path.join(ROOT,'cf-redcake/red-cake-77d5/src/services/personal-rosters.js'),'utf8');
const route=fs.readFileSync(path.join(ROOT,'cf-redcake/red-cake-77d5/src/routes/personal-rosters.js'),'utf8');

test('SAFETY: shared roster membership never grants delete or ownership transfer',()=>{
  assert.match(service,/can_delete:owner/);
  assert.match(service,/roster_owner_required/);
  assert.doesNotMatch(route,/transfer_owner|change_owner/);
});

test('SAFETY: hide is recipient-specific and does not delete or unshare',()=>{
  assert.match(service,/UPDATE custom_roster_shares SET hidden=/);
  assert.doesNotMatch(service,/setSharedRosterHidden[\s\S]{0,800}DELETE FROM custom_roster_shares/);
});

test('SAFETY: Reflection and Lunch context filters remain read-only transformations',()=>{
  const start=service.indexOf("async function applyOperationalContext");
  const end=service.indexOf("\nasync function loadLegacyDefinitions",start);
  assert.ok(start>=0&&end>start,'applyOperationalContext function block must be identifiable');
  const operationalContext=service.slice(start,end);

  assert.match(operationalContext,/reflection_hold/);
  assert.match(operationalContext,/supervised_lunch/);
  assert.match(service,/context_counts/);

  // Check only the operational-context function itself. Mutating roster functions
  // legitimately appear later in the same service file and must not cause a
  // false-positive merely because they are nearby in character distance.
  assert.doesNotMatch(operationalContext,/requireEagleNestDb|runD1Batch|db\.prepare\(/);
  assert.doesNotMatch(operationalContext,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?custom_roster/i);
});
