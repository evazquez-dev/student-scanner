const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const admin=path.join(root,'admin');
const WORKER='https://red-cake-77d5.evazquez-3e0.workers.dev/';
const CLIENT='690302076971-cmclpgcqko4lhuaetbeacu00ptl9jc4m.apps.googleusercontent.com';
function jsFor(p){const q=p.replace(/\.html$/i,'.js');return fs.existsSync(q)?fs.readFileSync(q,'utf8'):'';}
function needsGoogle(h,j){const x=h+'\n'+j;return ['g_id_signin','google.accounts.id','window.google?.accounts?.id','/admin/session/login_google','waitForGoogle'].some(s=>x.includes(s));}
test('all admin pages share auth and canonical Worker base',()=>{for(const n of fs.readdirSync(admin).filter(x=>x.endsWith('.html'))){const h=fs.readFileSync(path.join(admin,n),'utf8');assert.match(h,/src=["']\.\/shared_auth\.js["']/,n+' missing shared_auth');assert.ok(h.includes(`name="api-base" content="${WORKER}"`)||h.includes(`name='api-base' content='${WORKER}'`),n+' bad api-base');}});
test('direct Google-login pages have canonical client and GSI',()=>{for(const n of fs.readdirSync(admin).filter(x=>x.endsWith('.html'))){const p=path.join(admin,n),h=fs.readFileSync(p,'utf8'),j=jsFor(p);if(!needsGoogle(h,j))continue;assert.ok(h.includes(CLIENT),n+' bad Google client');assert.ok(h.includes('https://accounts.google.com/gsi/client'),n+' missing GSI');}});
test('shared auth bridges canonical and page-specific keys',()=>{const j=fs.readFileSync(path.join(admin,'shared_auth.js'),'utf8');for(const s of ['EAGLENEST_SHARED_AUTH_V1','ss_admin_session_sid_v1','admin_session_v1','teacher_att_admin_session_v1','grades_admin_session_v1','EAGLENEST_AUTH'])assert.ok(j.includes(s),s+' missing');});
