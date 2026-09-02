const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'student-scanner', 'index.html'), 'utf8');

function between(src, start, end) {
  const a = src.indexOf(start);
  assert.notEqual(a, -1, `missing start marker: ${start}`);
  const b = src.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `missing end marker: ${end}`);
  return src.slice(a, b);
}

test('attendance config is cached in-isolate and late-minute lookup reuses it', () => {
  assert.match(worker, /ATT_CFG_CACHE_TTL_MS = 15e3/);
  const cfg = between(worker, 'async function getAttendanceCfg(env, kv)', '__name(getAttendanceCfg');
  assert.match(cfg, /ATT_CFG_CACHE\.value/);
  assert.match(cfg, /now - ATT_CFG_CACHE\.ts < ATT_CFG_CACHE_TTL_MS/);
  assert.match(cfg, /ATT_CFG_CACHE = \{ ts: now, value \}/);

  const late = between(worker, 'async function getLateMinutes(env, kv)', '__name(getLateMinutes');
  assert.match(late, /await getAttendanceCfg\(env, kv\)/);
  assert.doesNotMatch(late, /kv\.get\(ATT_CFG_KEY/);
});

test('common kiosk scans use lazy LiveLocation reads instead of a mandatory global DO GET', () => {
  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  assert.match(handler, /const ensureLive = async \(\) =>/);
  assert.doesNotMatch(handler, /let live = null;\s*try \{ live = await getStudentLocState_/);
  assert.match(handler, /normalizeSeniorOutInState\(await ensureLive\(\), date\)/);
  assert.match(handler, /normalizeGymOutInState\(await ensureLive\(\), date\)/);
  assert.match(handler, /computeSuperLunchGateAccess_\(osis, cls, await ensureLive\(\), date\)/);
  assert.match(handler, /afterSchoolExitHoldFor_\(rec, await ensureLive\(\), date/);
});

test('authoritative class scans do not re-read/rewrite ClassSession and post-state work runs in parallel', () => {
  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  assert.match(handler, /classSessionAlreadyAuthoritative/);
  assert.match(handler, /"class_first", "class_repeat", "class_back", "class_out", "class_cancelled", "class_superseded"/);
  assert.match(handler, /if \(!classSessionAlreadyAuthoritative\)/);
  assert.match(handler, /markClassSession: false/);
  assert.match(handler, /Promise\.all\(\[projectionTask, attendanceTask, logTask\]\)/);
});

test('confirmed logging keeps durable acknowledgement on the critical path but defers enrichment to LogBuffer flush', () => {
  const enqueue = between(worker, 'async function enqueueLogRowConfirmed_', '__name(enqueueLogRowConfirmed_');
  assert.match(enqueue, /deferEnrichment = false/);
  assert.match(enqueue, /if \(!deferEnrichment \|\| isPracticeMode_\(env\)\)/);

  const logDo = between(worker, 'var LogBufferDO = class', 'var FidelityEventBufferDO = class');
  assert.match(logDo, /const preparedRows = \[\]/);
  assert.match(logDo, /await enrichLogPayload_\(this\.env, prepared\)/);

  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  assert.match(handler, /\{ deferEnrichment: true \}/);
});

test('Worker and kiosk expose performance timings without adding a per-scan telemetry request', () => {
  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  assert.match(handler, /student_location_ms/);
  assert.match(handler, /class_session_ms/);
  assert.match(handler, /attendance_ms/);
  assert.match(handler, /log_enqueue_ms/);
  assert.match(handler, /worker_total_ms/);
  assert.match(handler, /performance: \{ \.\.\.perf \}/);

  const api = between(html, 'async function apiScanEvent(event)', 'let __SCAN_QUEUE_FLUSHING');
  assert.match(api, /client_round_trip_ms/);
  assert.match(api, /recordScanPerformance_/);
  assert.doesNotMatch(api, /action:\s*['"]fidelity['"]/);

  assert.match(html, /scan_rtt_p50_ms/);
  assert.match(html, /scan_rtt_p95_ms/);
  assert.match(html, /worker_p95_ms/);
  assert.match(html, /\.\.\.scanPerfHeartbeatMeta_\(\)/);
});


test('non-class physical projection uses one ClassSession physical_evidence call instead of read then set', () => {
  const projection = between(worker, 'async function projectClassSessionFromScanEvidence_', '__name(projectClassSessionFromScanEvidence_');
  assert.match(projection, /classSessionApplyPhysicalEvidence_/);
  assert.doesNotMatch(projection, /classSessionGetRecord_/);
  assert.doesNotMatch(projection, /classSessionMarkFirstIn/);
  assert.doesNotMatch(projection, /classSessionSetOutIn/);

  const doBlock = between(worker, 'if (path === "/physical_evidence"', 'if (path === "/set"');
  assert.match(doBlock, /defaultOutSinceISO/);
  assert.match(doBlock, /awayRequiresFirstIn/);
  assert.match(doBlock, /first_in_improved/);
});
