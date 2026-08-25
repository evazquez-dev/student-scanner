const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const rootPackage = readJson('package.json');
const workerPackage = readJson('cf-redcake/red-cake-77d5/package.json');

test('deployment safety gate stays wired into root and Worker verification', () => {
  assert.equal(rootPackage.scripts?.['test:safety'], 'node --test student-scanner/safety/*.test.js');
  assert.equal(workerPackage.scripts?.['test:safety'], 'node --test ../../student-scanner/safety/*.test.js');

  assert.match(rootPackage.scripts?.verify || '', /npm run check:worker/);
  assert.match(rootPackage.scripts?.verify || '', /npm run test:safety/);
  assert.match(rootPackage.scripts?.verify || '', /npm test/);

  assert.match(workerPackage.scripts?.verify || '', /npm run check:worker/);
  assert.match(workerPackage.scripts?.verify || '', /npm run test:safety/);
  assert.match(workerPackage.scripts?.verify || '', /npm test/);

  assert.equal(fs.existsSync(path.join(ROOT, 'student-scanner/safety/deployment-safety.test.js')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'student-scanner/safety/access-management-safety.test.js')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'student-scanner/safety/README.md')), true);
});

test('normal Worker deploy is fail-closed behind the full verification command', () => {
  assert.equal(workerPackage.scripts?.predeploy, 'npm run verify');
  assert.equal(workerPackage.scripts?.deploy, 'wrangler deploy');
});
