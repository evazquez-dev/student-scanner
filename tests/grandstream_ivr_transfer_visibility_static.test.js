const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);

function sliceBetween(startNeedle,endNeedle){
  const start=worker.indexOf(startNeedle);
  const end=worker.indexOf(endNeedle,start);
  assert.ok(start>=0,`missing start anchor: ${startNeedle}`);
  assert.ok(end>start,`missing end anchor: ${endNeedle}`);
  return worker.slice(start,end);
}

test('incoming IVR endpoint 418 is treated as non-human routing',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_IVR_TRANSFER_VISIBILITY_V1/);
  assert.match(worker,/GRANDSTREAM_NON_HUMAN_ENDPOINTS = new Set\(\['418'\]\)/);

  const block=sliceBetween(
    '// EAGLENEST_GRANDSTREAM_INCOMING_RING_GROUP_STATE_V1',
    '// A direct internal call is one caller -> one destination'
  );
  assert.match(block,/call\.direction === 'incoming'/);
  assert.match(block,/call\.connected_endpoints = call\.connected_endpoints\.filter/);
  assert.match(block,/const noHumanAnswer = call\.connected_endpoints\.length === 0/);
  assert.match(block,/call\.state = 'ringing'/);
});

test('front-office origin campus is internal lineage only',()=>{
  assert.match(worker,/const originCampus = clean\(previousCall\?\._origin_campus, 80\) \|\| currentOriginCampus/);
  assert.match(worker,/_origin_campus: originCampus/);

  const publicList=sliceBetween('_activeCallList() {','_snapshotPayload() {');
  assert.match(publicList,/_origin_campus,/);
  assert.match(publicList,/_origin_campus_source,/);
  assert.doesNotMatch(publicList,/publicCall\._origin_campus/);
});

test('front-office visibility still uses current public campus, not hidden origin campus',()=>{
  const rebuild=sliceBetween('_rebuildCalls() {','async _stopEngine() {');
  assert.match(rebuild,/call\.front_office_call = call\.direction === 'incoming' && !!call\.campus/);
  assert.match(rebuild,/GRANDSTREAM_FRONT_OFFICE_CAMPUS_SOURCES\.has\(call\.campus_source\)/);
  assert.doesNotMatch(rebuild,/front_office_call[^\n]*_origin_campus/);
});

test('direct-extension incoming calls are not assigned a campus by this patch',()=>{
  const sanitize=sliceBetween('_sanitizeChannel(row) {','_applyEventRows(rows) {');
  assert.match(sanitize,/currentOriginCampus = direction === 'incoming'/);
  assert.match(sanitize,/GRANDSTREAM_FRONT_OFFICE_CAMPUS_SOURCES\.has/);
  assert.doesNotMatch(sanitize,/_origin_campus[^\n]*staff_extension/);
});
