// EAGLENEST_CONFERENCE_OUTREACH_DATETIME_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const html=read('admin/conferences.html');
const js=read('admin/conferences-required.js');

test('Conference outreach exposes an editable communication date and time',()=>{
  assert.match(js,/id="reqContactAt" type="datetime-local"/);
  assert.match(js,/Defaults to now\. Edit this when logging a conversation later\./);
  assert.match(js,/reqLocalDateTimeValue/);
  assert.match(js,/document\.getElementById\('reqContactAt'\)\.value=reqLocalDateTimeValue\(\)/);
});

test('Conference outreach submits the actual communication timestamp instead of silently using log time',()=>{
  assert.match(js,/const contactAtIso=reqContactAtIso\(\)/);
  assert.match(js,/contact_at_iso:contactAtIso/);
  assert.match(js,/Choose a valid communication date and time/);
});

test('Conference page cache-busts the modified outreach script',()=>{
  assert.match(html,/conferences-required\.js\?v=20261001-outreach-datetime-v1/);
});
