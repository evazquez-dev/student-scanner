import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const scannerRoot=path.resolve(here,'..');
const root=path.resolve(scannerRoot,'..');
const svc=readFileSync(path.join(root,'cf-redcake/red-cake-77d5/src/services/mtss.js'),'utf8');

test('MTSS attendance metrics use only official PowerSchool rows',()=>{
  assert.match(svc,/school_year_code=\? AND school_date>=\? AND source=\?/);
  assert.match(svc,/OFFICIAL_ATTENDANCE_SOURCE/);
});

test('legacy Attendance Outreach rows are skipped after official reporting begins',()=>{
  assert.match(svc,/reason:'powerschool_official_source'/);
});

test('official PowerSchool sync removes legacy reporting-term attendance rows',()=>{
  assert.match(svc,/EAGLENEST_MTSS_OFFICIAL_SOURCE_CLEANUP_V1/);
  assert.match(svc,/DELETE FROM mtss_attendance_daily[\s\S]*source<>\?/);
});

test('manual re-evaluation selects latest official PowerSchool date',()=>{
  assert.match(svc,/MAX\(school_date\)[\s\S]*source=\?/);
});
