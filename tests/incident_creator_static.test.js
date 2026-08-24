const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '..');
const html = fs.readFileSync(path.join(root, 'admin/incident_creator.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin/incident_creator.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const brand = fs.readFileSync(path.join(root, 'admin/brand.js'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'admin/teacher_attendance.js'), 'utf8');
const index = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const route = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/routes/incidents.js'), 'utf8');
const service = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/services/incidents.js'), 'utf8');
const pushService = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/services/push-notifications.js'), 'utf8');
const gas = fs.readFileSync(path.resolve(project, 'Google Apps Script/clasp-projects/behavioral-endpoint/Code.js'), 'utf8');

assert.match(html, /data-module="incident_creator"/, 'Incident page should identify its module');
assert.match(html, /id="peopleSearch"/, 'Incident page should include student picker');
assert.match(html, /id="witnessSearch"/, 'Incident page should include optional witness picker');
assert.match(html, /id="evidenceInput"[^>]+multiple/, 'Incident page should support multiple evidence files');
assert.match(js, /\/admin\/incident\/config/, 'Frontend should load incident configuration through Worker');
assert.match(js, /\/admin\/incident\/create/, 'Frontend should submit incidents through Worker');
assert.match(js, /\/admin\/roster\/search/, 'Frontend should resolve students through authenticated roster search');
assert.match(nav, /key:'incident_creator'/, 'Shared nav should expose Incident Creator');
assert.match(brand, /incident_creator:\s*'Incident Creator'/, 'Shared branding should name Incident Creator');
assert.match(teacher, /INCIDENT_CREATOR_FALLBACK_URL = '\.\/incident_creator\.html'/, 'Teacher Attendance should point to the real admin incident page');
assert.match(teacher, /target\.searchParams\.set\('osis'/, 'Teacher Attendance should pass selected student OSIS');
assert.match(teacher, /target\.searchParams\.set\('source', 'teacher_attendance'\)/, 'Teacher Attendance should mark source context');

assert.match(index, /handleIncidentRequest/, 'Canonical Worker entry should import the modular incident route');
assert.match(index, /path\.startsWith\('\/admin\/incident\/'\)/, 'Canonical Worker entry should route incident endpoints before legacy fallback');
assert.match(route, /'\/admin\/incident\/config'/, 'Modular route should expose incident config');
assert.match(route, /'\/admin\/incident\/create'/, 'Modular route should expose incident create');
assert.match(route, /\/admin\/roster\/all\?limit=5000/, 'Incident validation should use the authenticated canonical roster');
assert.match(route, /normalizeIncidentStudentList/, 'Incident route should validate selected students');
assert.match(route, /createPracticeIncident/, 'Incident route should preserve Practice Mode temporary incident storage');
assert.match(route, /sendPushCategoryToEmail/, 'Dean referral should use the extracted push service');
assert.match(route, /PUSH_CATEGORY_DEAN_REFERRALS/, 'Dean referral should respect notification-category preferences');
assert.match(route, /viewAsReadOnlyResponse/, 'Incident writes should remain blocked while viewing as another teacher');

assert.match(service, /INCIDENT_MAX_FILES = 5/, 'Incident service should enforce evidence file-count limit');
assert.match(service, /INCIDENT_MAX_FILE_BYTES = 8 \* 1024 \* 1024/, 'Incident service should enforce per-file limit');
assert.match(service, /INCIDENT_MAX_TOTAL_BYTES = 20 \* 1024 \* 1024/, 'Incident service should enforce total evidence limit');
assert.match(service, /function incidentFileAllowed/, 'Incident service should enforce evidence types');
assert.match(service, /practice_record:incident:/, 'Practice incidents should persist in practice-only KV storage');
assert.match(pushService, /export async function sendPushCategoryToEmail/, 'Shared push service should own category-aware delivery');

assert.match(gas, /function incidentHeaders_\(/, 'Behavioral Endpoint should define Incident_Log schema');
assert.match(gas, /function createIncident_\(/, 'Behavioral Endpoint should create incidents');
assert.match(gas, /IR-\$\{code\}-\$\{String\(counter\)\.padStart\(6, '0'\)\}/, 'Incident IDs should be sequential school-year IDs');
assert.match(gas, /ClientSubmissionID/, 'Incident store should support idempotent client submission IDs');
assert.match(gas, /INCIDENT_EVIDENCE_FOLDER_ID/, 'Incident evidence should use configured private Drive storage');

console.log('incident_creator_static.test.js: PASS');
