const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

const comm=read('admin/communications.js');
const html=read('admin/communications.html');
const contacts=read('admin/student_contacts.js');
const studentView=read('admin/student_view.js');
const engagement=read('admin/student_lookup_engagement.js');
const studentHtml=read('admin/student_view.html');

assert.match(comm,/communications_proxy/);
assert.match(comm,/searchParams\.set\('proxy','1'\)/);
assert.match(comm,/Family Communications Proxy/);
assert.match(html,/proxyBanner/);

assert.match(contacts,/PAGE_PROXY_MODE/);
assert.match(contacts,/proxy_mode:/);
assert.match(contacts,/communication_log/);
assert.match(contacts,/Proxy mode/);

assert.match(studentView,/communications_proxy/);
assert.match(studentView,/action','log-communication/);
assert.match(studentView,/searchParams\.set\('proxy','1'\)/);

assert.match(engagement,/communications_proxy/);
assert.match(engagement,/searchParams\.set\('proxy','1'\)/);
assert.match(engagement,/Family Communications Proxy/);

assert.match(studentHtml,/family-communications-proxy-v2/);

console.log('frontend communications_proxy_static ok');
