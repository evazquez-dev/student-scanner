const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('canonical contact layer preserves raw source and defaults to preview', () => {
  const gas = read('Google Apps Script/clasp-projects/powerschool-nightly-sync/ContactCanonical.js');
  assert.match(gas, /canonicalSheet:\s*'PS_Contact_Canonical'/);
  assert.match(gas, /reviewSheet:\s*'PS_Contact_Duplicate_Review'/);
  assert.match(gas, /defaultMode:\s*'preview'/);
  assert.match(gas, /return CONTACTS_SHEET\.name;/);
  assert.match(gas, /ACTION = MERGE or KEEP_SEPARATE/);
});

test('nightly sync rebuilds canonical layer and operational pushes honor mode', () => {
  const code = read('Google Apps Script/clasp-projects/powerschool-nightly-sync/code.js');
  assert.match(code, /rebuildCanonicalContacts_\(\{ interactive: false \}\)/);
  assert.match(code, /contactOperationalSheetName_\(\)/);
  assert.match(code, /const identityAliases = contactIdentityAliasesFromRows_\(contactRows\)/);
  assert.match(code, /identity_aliases:\s*identityAliases/);
  assert.match(code, /canonical_mode:\s*getContactCanonicalMode_\(\)/);
  assert.match(code, /canonicalAssocMap/);
  assert.match(code, /ALIAS_CONTACT_ASSOC_IDS_JSON/);
});

test('D1 identity alias bridge is fail-safe and contact language is canonical-aware', () => {
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  const language = read('cf-redcake/red-cake-77d5/src/services/contact-language.js');
  const migration = read('cf-redcake/red-cake-77d5/migrations/0006_contact_identity_aliases.sql');

  assert.match(index, /__EAGLENEST_CONTACT_IDENTITY_D1__/);
  assert.match(worker, /contact_identity_d1_runtime_hook_unavailable/);
  assert.match(worker, /identity_alias_sync/);
  assert.match(language, /syncContactIdentityAliases/);
  assert.match(language, /resolveCanonicalContactKey/);
  assert.match(language, /preferenceForIdentity/);
  assert.match(language, /active=0/);
  assert.match(language, /active=1/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS contact_identity_aliases/);
});
