const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/incident_creator.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin/incident_creator.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const brand = fs.readFileSync(path.join(root, 'admin/brand.js'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'admin/teacher_attendance.js'), 'utf8');
const worker = fs.readFileSync(path.resolve(root, '../cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const gas = fs.readFileSync(path.resolve(root, '../Google Apps Script/clasp-projects/behavioral-endpoint/Code.js'), 'utf8');

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
assert.match(worker, /path === "\/admin\/incident\/config"/, 'Worker should expose incident config route');
assert.match(worker, /path === "\/admin\/incident\/create"/, 'Worker should expose incident create route');
assert.match(worker, /normalizeIncidentStudentList_/, 'Worker should validate incident students against roster');
assert.match(worker, /INCIDENT_MAX_TOTAL_BYTES/, 'Worker should enforce evidence upload limits');
assert.match(gas, /function incidentHeaders_\(/, 'Behavioral Endpoint should define Incident_Log schema');
assert.match(gas, /function createIncident_\(/, 'Behavioral Endpoint should create incidents');
assert.match(gas, /IR-\$\{code\}-\$\{String\(counter\)\.padStart\(6, '0'\)\}/, 'Incident IDs should be sequential school-year IDs');
assert.match(gas, /ClientSubmissionID/, 'Incident store should support idempotent client submission IDs');
assert.match(gas, /INCIDENT_EVIDENCE_FOLDER_ID/, 'Incident evidence should use configured private Drive storage');

console.log('incident_creator_static.test.js: PASS');
