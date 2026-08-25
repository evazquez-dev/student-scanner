const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/early-dismissal.js');
const service = read('cf-redcake/red-cake-77d5/src/services/early-dismissal.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

test('Early Dismissal routes are owned by the modular handler before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/early-dismissal\.js'/);
  const guardPos = index.indexOf('EARLY_DISMISSAL_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(guardPos >= 0, 'Early Dismissal route guard must exist');
  assert.ok(fallbackPos > guardPos, 'Early Dismissal must run before legacy fallback');
  assert.match(index, /handleEarlyDismissalRequest/);
});

test('Early Dismissal route paths and rollback implementation remain unchanged', () => {
  for (const pathname of [
    '/admin/early_dismissal_undo',
    '/admin/early_dismissals',
    '/admin/early_dismissals/undo',
    '/admin/early_dismissal'
  ]) {
    assert.ok(route.includes(pathname), `${pathname} must remain modular`);
    assert.ok(worker.includes(pathname), `${pathname} must remain in legacy rollback code`);
  }
});

test('Early Dismissal preserves legacy undo and operational state contracts', () => {
  assert.match(service, /EARLY_DISMISSAL_UNDO_PREFIX = 'early_dismissal:undo_v1:'/);
  assert.match(service, /EARLY_DISMISSAL_UNDO_TTL_SEC = 36 \* 60 \* 60/);
  assert.match(service, /SCAN_CORRECTION_PREFIX = 'scan:correction_v1:'/);
  assert.match(service, /source: 'early_dismissal_undo'/);
  assert.match(service, /zone: 'off_campus'/);
  assert.match(service, /loc: 'off_campus'/);
  assert.match(service, /Off Campus \(early dismissal\)/);
});

test('Practice Early Dismissal pins trusted submissions to the global practice day', () => {
  assert.match(route, /const requestedDate = String\(body\?\.date \|\| getNYCDate\(\)\)/);
  assert.match(route, /modeInfo\.practice[\s\S]{0,180}modeInfo\.practice_day[\s\S]{0,180}: requestedDate/);
});

test('Early Dismissal extraction does not import the legacy monolith directly', () => {
  assert.doesNotMatch(route, /from\s+['"]\.\.\/worker\.js['"]/);
  assert.doesNotMatch(service, /from\s+['"]\.\.\/worker\.js['"]/);
});
