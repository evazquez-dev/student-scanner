const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'student-scanner', 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js'), 'utf8');

function between(src, start, end) {
  const a = src.indexOf(start);
  assert.notEqual(a, -1, `missing start marker: ${start}`);
  const b = src.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `missing end marker: ${end}`);
  return src.slice(a, b);
}

test('scanner uses one immutable scan_event path instead of client-side lookup/toggle decisions', () => {
  const flow = between(html, 'async function onScanAsync(scanned)', 'function onScan(scanned)');
  assert.match(flow, /const eventId = makeScanEventId\(\)/);
  assert.match(flow, /event_id:\s*eventId/);
  assert.match(flow, /processAuthoritativeScan_/);
  assert.doesNotMatch(flow, /await\s+apiLookup\(/);
  assert.doesNotMatch(flow, /varied_next_action|gym_outin_was_out|senior_outin_was_out|refreshBathState\(true\)/);
});

test('accepted scans use a non-expiring IndexedDB journal before any network work and replay immutable metadata', () => {
  assert.match(html, /const QUEUE_DB_NAME = 'EagleNESTScanJournalV3'/);
  assert.match(html, /indexedDB\.open\(QUEUE_DB_NAME, QUEUE_DB_VERSION\)/);
  assert.match(html, /createObjectStore\(QUEUE_STORE_NAME, \{ keyPath:'event_id' \}\)/);
  assert.doesNotMatch(html, /QUEUE_MAX_AGE_MS/);
  assert.doesNotMatch(html, /slice\(-250\)/);

  const flow = between(html, 'async function onScanAsync(scanned)', 'function onScan(scanned)');
  assert.match(flow, /device_id:\s*DEVICE_ID/);
  assert.ok(flow.indexOf('await upsertScanEventQueue(event)') < flow.indexOf('selfHealLockedDeviceModeOnScan_().catch'), 'durable journal write must precede any self-heal network work');

  const submit = between(html, 'async function submitScanEvent(event)', 'function isLatestScanEvent_');
  assert.ok(submit.indexOf('await upsertScanEventQueue(event)') < submit.indexOf('apiScanEvent(event)'), 'journal write must precede scan send');
  const apiScan = between(html, 'async function apiScanEvent(event)', 'let __SCAN_QUEUE_FLUSHING');
  assert.match(apiScan, /body\.set\('event_id', event\.event_id\)/);
  assert.match(apiScan, /body\.set\('whenISO', event\.whenISO/);
  assert.match(apiScan, /body\.set\('device_id', event\.device_id \|\| DEVICE_ID\)/);
  assert.match(apiScan, /body\.set\('device_whenISO', event\.device_whenISO/);
  assert.match(html, /window\.addEventListener\('online', \(\) => flushScanEventQueue/);
  assert.match(html, /Unsynced \$\{count\}/);
});

test('Worker is authoritative for scan interpretation and protects stale/duplicate state transitions', () => {
  assert.match(worker, /if \(action === "scan_event"\)/);
  const doEvent = between(worker, 'if (path === "/scan_event")', 'if (path === "/update")');
  assert.match(doEvent, /scan_event_cache/);
  assert.match(doEvent, /cached\?\.result/);
  assert.match(doEvent, /action: "superseded"/);
  assert.match(doEvent, /mode === "bathroom"/);
  assert.match(doEvent, /mode === "senior_outin"/);
  assert.match(doEvent, /mode === "gymoutin"/);
  assert.match(doEvent, /mode === "class"/);
  assert.match(doEvent, /mode === "after_school_class"/);
});

test('attendance replay is one-way: earlier Present may improve Late but cannot worsen Present', () => {
  const record = between(worker, 'if (path === "/record" && req.method === "POST")', 'if (path === "/override"');
  assert.match(record, /isEarlierEvidence/);
  assert.match(record, /incomingCode === "P" && \(effectiveCode === "L" \|\| effectiveCode === "EL"\)/);
  assert.doesNotMatch(record, /effectiveCode === "P"[^\n]*incomingCode === "L"/);
  assert.match(worker, /strict:\s*true/);
});

test('log replay is idempotent and queue row plus dedupe marker are stored atomically', () => {
  const enqueue = between(worker, 'if (path === "/enqueue")', 'if (path === "/flush")');
  assert.match(enqueue, /dedupeKey/);
  assert.match(enqueue, /const writes = \{/);
  assert.match(enqueue, /writes\[dedupeKey\] = \{ at: now \}/);
  assert.match(enqueue, /await this\.state\.storage\.put\(writes\)/);
});


test('kiosk gives immediate non-authoritative CARD READ feedback, journals it, and does not await self-heal', () => {
  const flow = between(html, 'async function onScanAsync(scanned)', 'function onScan(scanned)');
  assert.match(flow, /const inputMethod = PENDING_INPUT_METHOD/);
  assert.ok(flow.indexOf('resetInputSession()') < flow.indexOf('await upsertScanEventQueue(event)'), 'input wedge must release before durable journal work');
  assert.ok(flow.indexOf('showCardReadChecking_') < flow.indexOf('await upsertScanEventQueue(event)'), 'CARD READ feedback must appear before durable journal await');
  assert.doesNotMatch(flow, /await selfHealLockedDeviceModeOnScan_\(\)/);
  assert.match(flow, /selfHealLockedDeviceModeOnScan_\(\)\.catch/);
  assert.match(html, /CARD READ — CHECKING…/);
  assert.match(html, /SAVED LOCALLY — SYNCING/);
  assert.match(html, /beepCardRead/);
});

test('out-of-order confirmations update their own history rows without stealing the foreground panel', () => {
  assert.match(html, /let LATEST_SCAN_EVENT_ID = ''/);
  assert.match(html, /function isLatestScanEvent_/);
  assert.match(html, /SCAN_EVENT_ROWS = new Map/);
  const render = between(html, 'async function renderAuthoritativeScanResult_(ctx, data)', 'async function processAuthoritativeScan_(ctx)');
  assert.match(render, /__SCAN_RESULT_FOREGROUND = !ctx\.backgroundReplay && isLatestScanEvent_/);
  const flush = between(html, 'async function flushScanEventQueue()', 'async function submitScanEvent(event)');
  assert.match(flush, /scanRowForEvent_\(event\.event_id\)/);
  assert.match(flush, /backgroundReplay:true/);
});


test('physical classroom routing uses one supervised-lunch-aware effective room resolver for active and Arrival Window scans', () => {
  const resolver = between(worker, 'function effectivePhysicalScheduleSlotForOsis_', '__name(effectivePhysicalScheduleSlotForOsis_');
  assert.match(resolver, /findSupervisedLunchAssignmentForOsisPeriod_/);
  assert.match(resolver, /supervised\.room/);

  const kiosk = between(worker, 'async function kioskAccessForOsis(', '__name(kioskAccessForOsis');
  assert.match(kiosk, /effectivePhysicalScheduleSlotForOsis_/);
  assert.match(kiosk, /const nextSlot = effectiveSlot\(nextId\)/);
  assert.match(kiosk, /shouldRoom:\s*nextRoom/);
  assert.match(kiosk, /course:\s*slot\?\.course/);
  assert.doesNotMatch(kiosk, /perStudent\[nextId\]/);

  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  assert.match(handler, /applyEffectiveKioskContextToResolved_\(resolved, kioskInfo\)/);
  assert.doesNotMatch(handler, /resolved\.current_period = resolved\.current_period \|\| periodId/);
});

test('first correct-room evidence outranks pre-first-IN OUT state in ClassSessionDO', () => {
  const classDoEvent = between(
    worker,
    'if (path === "/scan_event" && req.method === "POST")',
    'if (path === "/mark_first_in" && req.method === "POST")'
  );
  const firstInPos = classDoEvent.indexOf('if (!rec.firstInISO)');
  const backPos = classDoEvent.indexOf('if (rec.out?.isOut)');
  assert.ok(firstInPos >= 0, 'missing first-IN branch');
  assert.ok(backPos >= 0, 'missing BACK branch');
  assert.ok(firstInPos < backPos, 'first-IN must be resolved before BACK');
  assert.match(classDoEvent, /cleared_pre_first_out/);
  assert.match(classDoEvent, /rec\.out\.isOut = false/);
});

test('after-school first-home choice is made inside StudentLocationDO and canceled class prompts are finalized', () => {
  const locationDoEvent = between(worker, 'if (path === "/scan_event")', 'if (path === "/update")');
  assert.match(locationDoEvent, /mode === "after_school_class"/);
  assert.match(locationDoEvent, /const existingHome = prevDate === date/);
  assert.match(locationDoEvent, /after_school_home_established/);

  const classDoEvent = between(
    worker,
    'if (path === "/scan_event" && req.method === "POST")',
    'if (path === "/mark_first_in" && req.method === "POST")'
  );
  assert.match(classDoEvent, /reason === "__CANCEL__"/);
  assert.match(classDoEvent, /action: "class_cancelled"/);
  assert.match(classDoEvent, /await remember\(result, true\)/);

  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  const after = handler.indexOf('mode: "after_school_class"');
  assert.notEqual(after, -1);
  const nearby = handler.slice(Math.max(0, after - 700), after + 500);
  assert.doesNotMatch(nearby, /firstHome\s*=|existingHome\s*=/);
});


test('kiosk detects device clock skew, corrects canonical event time, and reports skew in heartbeat telemetry', () => {
  assert.match(html, /const CLOCK_SKEW_WARN_MS = 2 \* 60 \* 1000/);
  assert.match(html, /function applyServerClockSample_/);
  assert.match(html, /function canonicalScanWhenISO_/);
  assert.match(html, /clock_skew_warning:/);
  assert.match(html, /id="clockPill"/);

  const flow = between(html, 'async function onScanAsync(scanned)', 'function onScan(scanned)');
  assert.match(flow, /whenISO:\s*canonicalScanWhenISO_\(when\)/);
  assert.match(flow, /device_whenISO:\s*when\.toISOString\(\)/);
  assert.match(flow, /clock_offset_ms:/);

  const handler = between(worker, 'async function handleAuthoritativeScanEvent_', '__name(handleAuthoritativeScanEvent_');
  assert.match(handler, /deviceWhenISO/);
  assert.match(handler, /clockOffsetMsRaw/);
  assert.match(handler, /scan_device_when_iso/);
  assert.match(worker, /server_time_iso:/);
});
