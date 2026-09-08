const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const worker = read('../cf-redcake/red-cake-77d5/src/worker.js');
const adminHtml = read('admin/index.html');
const adminJs = read('admin/admin.js');
const contactsHtml = read('admin/student_contacts.html');
const contactsJs = read('admin/student_contacts.js');
const behaviorGas = read('../Google Apps Script/clasp-projects/behavioral-endpoint/Code.js');

test('communication categories are centrally stored with current defaults', () => {
  assert.match(worker, /COMMUNICATION_CATEGORIES_KEY = "communication_categories_v1"/);
  assert.match(worker, /DEFAULT_COMMUNICATION_CATEGORIES = \["Attendance", "Behavior", "Academic", "Enrollment", "Positive Contact", "General", "Other"\]/);
  assert.match(worker, /async function loadCommunicationCategories_/);
});

test('communication category endpoint is staff-readable and super-admin writable', () => {
  assert.match(worker, /path === "\/admin\/communication_categories"/);
  assert.match(worker, /const who = await requireAdminOrToken\(req, env\)/);
  assert.match(worker, /const who = await requireAdminOrRoles\(req, env, \[\]\)/);
  assert.match(worker, /update_communication_categories/);
});

test('new communication writes must use a currently configured category', () => {
  assert.match(worker, /configuredCategories = await loadCommunicationCategories_\(env\)/);
  assert.match(worker, /error: "invalid_category", allowed_categories: configuredCategories/);
  assert.match(worker, /body\.category = canonicalCategory/);
});

test('System Administration can add, remove, reorder, and save categories', () => {
  assert.match(adminHtml, /Parent Communication Categories/);
  assert.match(adminHtml, /btnAddCommunicationCategory/);
  assert.match(adminHtml, /btnSaveCommunicationCategories/);
  assert.match(adminJs, /addCommunicationCategoryRow/);
  assert.match(adminJs, /moveCommunicationCategoryRow/);
  assert.match(adminJs, /Duplicate category/);
  assert.match(adminJs, /\/admin\/communication_categories/);
});

test('Student Contacts loads category choices dynamically with safe defaults', () => {
  assert.match(contactsHtml, /Loading categories…/);
  assert.doesNotMatch(contactsHtml, /<option>Positive Contact<\/option>/);
  assert.match(contactsJs, /loadCommunicationCategories/);
  assert.match(contactsJs, /renderCommunicationCategoryOptions/);
  assert.match(contactsJs, /\/admin\/communication_categories/);
  assert.match(contactsJs, /DEFAULT_COMMUNICATION_CATEGORIES/);
});

test('Behavioral Endpoint accepts Worker-governed nonblank category values', () => {
  assert.doesNotMatch(behaviorGas, /categories:\s*\['Attendance','Behavior','Academic','Enrollment','Positive Contact','General','Other'\]/);
  assert.match(behaviorGas, /if \(!category\) throw new Error\('invalid_category'\)/);
});
