const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

const access=read('admin/access_control.js');
const conferences=read('admin/conferences.js');
const required=read('admin/conferences-required.js');
const lookup=read('admin/student_lookup_engagement.js');
const html=read('admin/conferences.html');

assert.match(access,/roleScopeLabel/);
assert.match(access,/scope_field/);
assert.match(access,/grade_team/);
assert.match(access,/department/);

assert.match(conferences,/conference_booking_proxy/);
assert.match(conferences,/conference_event_admin/);
assert.match(required,/conference_booking_proxy/);
assert.match(required,/conference_event_admin/);
assert.match(lookup,/booking_proxy_advisor_scoped/);
assert.match(html,/Conference Booking Proxy/);

console.log('frontend access_role_sources_v3_static ok');
