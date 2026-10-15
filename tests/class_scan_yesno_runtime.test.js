// EAGLENEST_ATTENDANCE_AFTER_SCAN_BATCH3_YESNO_V3
// Runtime checks for the familiar prompted classroom second scan and teacher-first physical arrival.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'..','..','cf-redcake','red-cake-77d5','src','worker.js')).href;
let loadPromise;
const load=()=>loadPromise ||= import(url+'?yesno_v3_test='+Date.now());
class Storage {
  constructor(){this.m=new Map();}
  async get(k){return this.m.get(k);}
  async put(k,v){this.m.set(k,v);}
  async list({prefix=''}={}){return new Map([...this.m.entries()].filter(([k])=>k.startsWith(prefix)));}
  async delete(k){this.m.delete(k);}
  async deleteAll(){this.m.clear();}
  async setAlarm(){}
  async getAlarm(){return null;}
}
const mockState=()=>({storage:new Storage(),blockConcurrencyWhile:async fn=>fn()});
async function post(obj,path,body){
 const r=await obj.fetch(new Request('https://do'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const j=await r.json();assert.equal(r.ok,true,JSON.stringify(j));return j;
}
const t=(time)=>`2026-10-15T${time}:00.000Z`;

test('first student physical scan checks IN; second physical scan asks Yes/No; NO confirms class IN',async()=>{
 const {ClassSessionDO}=await load();const state=mockState();const obj=new ClassSessionDO(state,{});
 const first=await post(obj,'/scan_event',{osis:'10001',event_id:'v3-first',whenISO:t('14:00'),prompt_policy:'simple_auto'});
 assert.equal(first.result.action,'class_first');
 const original=state.storage.m.get('state').students['10001'].firstPhysicalInISO;
 assert.equal(original,t('14:00'));
 const second=await post(obj,'/scan_event',{osis:'10001',event_id:'v3-second',whenISO:t('14:05'),prompt_policy:'simple_auto'});
 assert.equal(second.result.action,'class_needs_reason');
 assert.equal(second.result.needs_checkin_choice,true);
 assert.equal(second.result.teacher_first_without_physical,false);
 const no=await post(obj,'/scan_event',{osis:'10001',event_id:'v3-second',whenISO:t('14:05'),reason:'__CHECK_IN__',prompt_policy:'simple_auto'});
 assert.equal(no.result.action,'class_repeat');
 assert.equal(no.result.label,'CHECK IN');
 assert.equal(state.storage.m.get('state').students['10001'].out.isOut,false);
 assert.equal(state.storage.m.get('state').students['10001'].firstPhysicalInISO,original);
 const duplicate=await post(obj,'/scan_event',{osis:'10001',event_id:'v3-second',whenISO:t('14:05'),reason:'__CHECK_IN__'});
 assert.equal(duplicate.duplicate,true);
 assert.equal(duplicate.result.action,'class_repeat');
});

test('YES leaves for Hallway; return scan is BACK not another departure',async()=>{
 const {ClassSessionDO}=await load();const st=mockState();const obj=new ClassSessionDO(st,{});
 await post(obj,'/scan_event',{osis:'10002',event_id:'first',whenISO:t('14:00'),prompt_policy:'simple_auto'});
 const prompt=await post(obj,'/scan_event',{osis:'10002',event_id:'next',whenISO:t('14:05'),prompt_policy:'simple_auto'});
 assert.equal(prompt.result.action,'class_needs_reason');
 const out=await post(obj,'/scan_event',{osis:'10002',event_id:'next',whenISO:t('14:05'),reason:'__GOING_OUT__',prompt_policy:'simple_auto'});
 assert.equal(out.result.action,'class_out');assert.equal(out.result.reason,'Hallway');
 assert.equal(st.storage.m.get('state').students['10002'].out.isOut,true);
 const ret=await post(obj,'/scan_event',{osis:'10002',event_id:'back',whenISO:t('14:10'),prompt_policy:'simple_auto'});
 assert.equal(ret.result.action,'class_back');
 assert.equal(st.storage.m.get('state').students['10002'].out.isOut,false);
});

test('teacher Present then first physical swipe prompts and NO preserves teacher first-IN provenance',async()=>{
 const {ClassSessionDO}=await load();const st=mockState();const obj=new ClassSessionDO(st,{});
 await post(obj,'/mark_first_in',{osis:'10003',whenISO:t('14:00'),source:'teacher_override',byEmail:'staff@example.edu'});
 const prompt=await post(obj,'/scan_event',{osis:'10003',event_id:'physical',whenISO:t('14:05'),prompt_policy:'simple_auto'});
 assert.equal(prompt.result.action,'class_needs_reason');
 assert.equal(prompt.result.teacher_first_without_physical,true);
 const accepted=await post(obj,'/scan_event',{osis:'10003',event_id:'physical',whenISO:t('14:05'),reason:'__CHECK_IN__',prompt_policy:'simple_auto'});
 assert.equal(accepted.result.action,'class_physical_checkin');
 assert.equal(accepted.result.attendance_preserved,true);
 const row=st.storage.m.get('state').students['10003'];
 assert.equal(row.firstInSource,'teacher_override');
 assert.equal(row.firstPhysicalInISO,t('14:05'));
});

test('detailed destination option remains and cancellation does not create hallway OUT',async()=>{
 const {ClassSessionDO}=await load();const st=mockState();const obj=new ClassSessionDO(st,{});
 await post(obj,'/scan_event',{osis:'10004',event_id:'d-first',whenISO:t('14:00'),prompt_policy:'detailed_destinations'});
 const prompt=await post(obj,'/scan_event',{osis:'10004',event_id:'d-second',whenISO:t('14:05'),prompt_policy:'detailed_destinations'});
 assert.equal(prompt.result.action,'class_needs_reason');
 assert.equal(prompt.result.needs_checkin_choice,false);
 const cancelled=await post(obj,'/scan_event',{osis:'10004',event_id:'d-second',whenISO:t('14:05'),reason:'__CANCEL__'});
 assert.equal(cancelled.result.action,'class_cancelled');
 assert.equal(st.storage.m.get('state').students['10004'].out.isOut,false);
 const again=await post(obj,'/scan_event',{osis:'10004',event_id:'d-third',whenISO:t('14:07'),prompt_policy:'detailed_destinations'});
 assert.equal(again.result.action,'class_needs_reason');
 const actual=await post(obj,'/scan_event',{osis:'10004',event_id:'d-third',whenISO:t('14:07'),reason:'Nurse'});
 assert.equal(actual.result.action,'class_out');
 assert.equal(actual.result.reason,'Nurse');
});
