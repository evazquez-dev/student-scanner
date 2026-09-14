const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const gasPath = path.join(root, 'Google Apps Script', 'clasp-projects', 'powerschool-nightly-sync', 'ContactCanonical.js');
const workerPath = path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js');
const languagePath = path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'services', 'contact-language.js');

const gas = fs.readFileSync(gasPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');
const language = fs.readFileSync(languagePath, 'utf8');

function loadCanonicalRuntime() {
  const context = {
    console,
    PropertiesService: {
      getScriptProperties() {
        return { getProperty() { return 'live'; } };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(
    gas + `
      ;globalThis.__canonicalTest = {
        canonicalNameIdentityKey_,
        canonicalPairEvidence_,
        canonicalCandidateComponents_,
        canonicalNameValues_
      };
    `,
    context
  );
  return context.__canonicalTest;
}

function row({name, phone='', email='', relationship='Father', pid, assoc}) {
  return {
    CONTACT_NAME: name,
    CONTACT_DISPLAY_NAME: name,
    PRIMARY_PHONE: phone,
    PRIMARY_EMAIL: email,
    RELATIONSHIP: relationship,
    PERSON_ID: pid,
    CONTACT_ASSOC_ID: assoc,
    STUDENT_NUMBER: 'TEST-STUDENT'
  };
}

test('reversed two-token contact names produce the same identity key', () => {
  const { canonicalNameIdentityKey_ } = loadCanonicalRuntime();
  assert.equal(canonicalNameIdentityKey_('Victor Clemente'), 'clemente victor');
  assert.equal(canonicalNameIdentityKey_('Clemente Victor'), 'clemente victor');
  assert.equal(canonicalNameIdentityKey_('Víctor   Clemente'), 'clemente victor');
});

test('reversed name plus same phone is strong two-factor evidence and auto-groups', () => {
  const { canonicalPairEvidence_, canonicalCandidateComponents_, canonicalNameValues_ } = loadCanonicalRuntime();
  const a = row({name:'Victor Clemente', phone:'(917) 642-0122', pid:'100', assoc:'A'});
  const b = row({name:'Clemente Victor', phone:'917-642-0122', pid:'200', assoc:'B'});
  assert.deepEqual(Array.from(canonicalPairEvidence_(a,b)).sort(), ['name','phone']);
  assert.equal(canonicalCandidateComponents_([a,b]).length, 1);
  assert.equal(canonicalNameValues_([a,b]).length, 1, 'reversed forms must not create a name_conflict');
});

test('reversed name alone is not enough to merge different PowerSchool people', () => {
  const { canonicalPairEvidence_, canonicalCandidateComponents_ } = loadCanonicalRuntime();
  const a = row({name:'Victor Clemente', phone:'9176420122', pid:'100', assoc:'A'});
  const b = row({name:'Clemente Victor', phone:'6465550199', pid:'200', assoc:'B'});
  assert.deepEqual(Array.from(canonicalPairEvidence_(a,b)), ['name']);
  assert.equal(canonicalCandidateComponents_([a,b]).length, 2);
});

test('same phone alone still does not merge different names', () => {
  const { canonicalPairEvidence_, canonicalCandidateComponents_ } = loadCanonicalRuntime();
  const a = row({name:'Victor Clemente', phone:'9176420122', pid:'100', assoc:'A'});
  const b = row({name:'Layla Clemente', phone:'9176420122', relationship:'Sister', pid:'200', assoc:'B'});
  assert.deepEqual(Array.from(canonicalPairEvidence_(a,b)), ['phone']);
  assert.equal(canonicalCandidateComponents_([a,b]).length, 2);
});

test('reversed name plus same email is also strong evidence', () => {
  const { canonicalPairEvidence_, canonicalCandidateComponents_ } = loadCanonicalRuntime();
  const a = row({name:'Victor Clemente', email:'victor@example.org', pid:'100', assoc:'A'});
  const b = row({name:'Clemente Victor', email:'VICTOR@example.org', pid:'200', assoc:'B'});
  assert.deepEqual(Array.from(canonicalPairEvidence_(a,b)).sort(), ['email','name']);
  assert.equal(canonicalCandidateComponents_([a,b]).length, 1);
});

test('Worker contact response preserves canonical identity and alias context', () => {
  assert.match(worker, /canonical_key:\s*String\(base\?\.canonical_key/);
  assert.match(worker, /canonical_person_id:\s*String\(base\?\.canonical_person_id/);
  assert.match(worker, /alias_person_ids:\s*Array\.isArray\(base\?\.alias_person_ids\)/);
  assert.match(worker, /alias_contact_assoc_ids:\s*Array\.isArray\(base\?\.alias_contact_assoc_ids\)/);
  assert.match(worker, /canonical_source_count:\s*Number\(base\?\.canonical_source_count/);
  assert.match(worker, /canonical_reason:\s*String\(base\?\.canonical_reason/);
});

test('language preference strength continues to prefer explicit non-default ParentSquare data over defaults', () => {
  assert.match(language, /source_confidence.*parentsquare_nondefault/);
  assert.match(language, /preferenceStrength/);
  assert.match(language, /parentsquare_nondefault'\s*\?\s*100\s*:\s*0/);
  assert.match(language, /rows\.sort/);
});
