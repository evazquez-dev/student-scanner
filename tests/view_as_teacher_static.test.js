const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workerPath = path.resolve(root, '..', 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js');
const worker = fs.readFileSync(workerPath, 'utf8');
const adminSessionService = fs.readFileSync(path.resolve(root, '..', 'cf-redcake', 'red-cake-77d5', 'src', 'services', 'admin-session.js'), 'utf8');
const adminSessionRoute = fs.readFileSync(path.resolve(root, '..', 'cf-redcake', 'red-cake-77d5', 'src', 'routes', 'admin-session.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'admin', 'nav.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'admin', 'admin.js'), 'utf8');
const navCss = fs.readFileSync(path.join(root, 'admin', 'nav.css'), 'utf8');

test('View as Teacher keeps actor identity and evaluates selected staff as effective session identity', () => {
  assert.match(adminSessionService, /actor_email:\s*actorEmail/);
  assert.match(adminSessionService, /view_as_email:\s*viewAsMode \? effectiveEmail/);
  assert.match(adminSessionService, /effectiveRole = viewAsMode \? await emailRole\(env, effectiveEmail\)/);
  assert.match(adminSessionRoute, /'\/admin\/session\/view_as'/);
  assert.match(adminSessionRoute, /'\/admin\/view_as\/staff'/);
});

test('View as Teacher is centrally read-only with only session controls exempted', () => {
  assert.match(worker, /view_as_read_only/);
  assert.match(worker, /adminMutation && !viewAsControlWrite/);
  assert.match(worker, /View as Teacher is read-only\. Exit View as Teacher to make changes\./);
  assert.match(adminSessionRoute, /view_as_teacher_start/);
  assert.match(adminSessionRoute, /view_as_teacher_end/);
});

test('Super Admin can choose All HS Staff by person or email and shared nav shows persistent exit banner', () => {
  assert.match(html, /id="viewAsTeacherCard"/);
  assert.match(html, /id="viewAsStaffSelect"/);
  assert.match(html, /id="viewAsEmail"/);
  assert.match(adminJs, /\/admin\/view_as\/staff/);
  assert.match(adminJs, /\/admin\/session\/view_as/);
  assert.match(nav, /VIEWING AS:/);
  assert.match(nav, /READ ONLY/);
  assert.match(nav, /Exit View/);
  assert.match(navCss, /--eaglenest-view-as-banner-height/);
});
