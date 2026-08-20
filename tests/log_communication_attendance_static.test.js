const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', 'admin');
const ta = fs.readFileSync(path.join(root, 'teacher_attendance.js'), 'utf8');
const contacts = fs.readFileSync(path.join(root, 'student_contacts.js'), 'utf8');

assert(ta.includes("data-act=\"communication\""), 'Attendance menu must render Log Communication action');
assert(ta.includes("target.searchParams.set('action', 'log-communication')"), 'Attendance must deep-link with log-communication action');
assert(ta.includes("target.searchParams.set('source', 'teacher_attendance')"), 'Attendance must identify source');
assert(contacts.includes("PAGE_SOURCE"), 'Student Contacts must preserve launch source');
assert(contacts.includes("bootUrl.searchParams.get('action') === 'log-communication'"), 'Student Contacts must auto-open communication modal');
assert(contacts.includes("cleanUrl.searchParams.delete('action')"), 'One-time action must be consumed');
assert(contacts.includes("source: PAGE_SOURCE"), 'Saved communication must use launch source');
console.log('log communication attendance static test passed');
