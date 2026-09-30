// EAGLENEST_MY_ROSTERS_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(ROOT,'admin/my_rosters.html'),'utf8');
const js=fs.readFileSync(path.join(ROOT,'admin/my_rosters.js'),'utf8');
const reflection=fs.readFileSync(path.join(ROOT,'admin/reflection_saved_rosters.js'),'utf8');
const lunch=fs.readFileSync(path.join(ROOT,'admin/supervised_lunch_saved_rosters.js'),'utf8');
const nav=fs.readFileSync(path.join(ROOT,'admin/nav.js'),'utf8');

test('My Rosters UI has saved/system rosters, pasted OSIS builder, and copy tools',()=>{
  assert.match(html,/My saved rosters/);
  assert.match(html,/Current class & advisory rosters/);
  assert.match(html,/Paste OSIS numbers/);
  assert.match(html,/Copy emails/);
  assert.match(html,/Copy OSIS column/);
  assert.match(html,/Copy combined emails/);
  assert.match(js,/\/admin\/my_rosters\/aggregate/);
  assert.match(js,/\/admin\/my_rosters\/resolve/);
  assert.match(js,/\/admin\/roster\/search/);
});

test('Reflection and Supervised Lunch consume rosters without mutating them',()=>{
  assert.match(reflection,/source roster can only be changed from My Rosters/);
  assert.match(lunch,/saved roster will not change/);
  assert.doesNotMatch(reflection,/action:\s*'save'/);
  assert.doesNotMatch(reflection,/action:\s*'delete'/);
  assert.doesNotMatch(lunch,/action:\s*'save'/);
  assert.doesNotMatch(lunch,/action:\s*'delete'/);
  assert.match(reflection,/\/admin\/my_rosters\/detail/);
  assert.match(lunch,/\/admin\/my_rosters\/detail/);
  assert.match(reflection,/context=reflection_hold/);
  assert.match(lunch,/context=supervised_lunch/);
  assert.match(lunch,/period_local=/);
});

test('My Rosters is in shared navigation',()=>{
  assert.match(nav,/key:'my_rosters'/);
  assert.match(nav,/href:'\.\/my_rosters\.html'/);
});
