// EAGLENEST_MY_ROSTERS_COLLAB_V2
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(ROOT,'admin/my_rosters.html'),'utf8');
const js=fs.readFileSync(path.join(ROOT,'admin/my_rosters.js'),'utf8');
const reflection=fs.readFileSync(path.join(ROOT,'admin/reflection_saved_rosters.js'),'utf8');
const lunch=fs.readFileSync(path.join(ROOT,'admin/supervised_lunch_saved_rosters.js'),'utf8');

test('My Rosters UI exposes owned, shared, hidden-shared and read-only system rosters',()=>{
  assert.match(html,/My saved rosters/);assert.match(html,/Shared with me/);assert.match(html,/Hidden shared rosters/);assert.match(html,/Current class & advisory rosters/);
  assert.match(js,/hidden_shared_rosters/);assert.match(js,/data-hide-roster/);assert.match(js,/Hide/);assert.match(js,/Unhide/);
});

test('collaboration UI has Viewer Suggester Editor Roster Admin and owner/admin suggestion review',()=>{
  for(const word of ['Viewer','Suggester','Editor','Roster Admin'])assert.match(html,new RegExp(word));
  assert.match(js,/data-add-share/);assert.match(js,/data-update-share/);assert.match(js,/data-remove-share/);assert.match(js,/data-review-suggestion/);
  assert.match(js,/Submit suggestion/);assert.match(js,/Someone else changed this roster/);
});

test('copy tools and paste/search builder continue to work for unsaved and aggregated rosters',()=>{
  assert.match(html,/Paste OSIS numbers/);assert.match(html,/Copy emails/);assert.match(html,/Copy OSIS column/);assert.match(html,/Copy combined emails/);
  assert.match(js,/\/admin\/my_rosters\/aggregate/);assert.match(js,/\/admin\/my_rosters\/resolve/);assert.match(js,/\/admin\/my_rosters\/student_search/);
});

test('Reflection and Supervised Lunch include visible shared rosters but never mutate source rosters',()=>{
  assert.match(reflection,/shared_rosters/);assert.match(lunch,/shared_rosters/);
  assert.match(reflection,/source roster can only be changed from My Rosters/);assert.match(lunch,/saved roster will not change/);
  assert.doesNotMatch(reflection,/action:\s*'save'|action:\s*'delete'/);assert.doesNotMatch(lunch,/action:\s*'save'|action:\s*'delete'/);
});
