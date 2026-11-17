// EAGLENEST_FASC_REQUIRED_AUTO_SELECT_V1
// Run: node --test tests/fasc_required_auto_select.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const admin = path.resolve(__dirname, '../admin');
const pickerSource = fs.readFileSync(path.join(admin, 'communication_requirements_picker.js'), 'utf8');
const conferenceSource = fs.readFileSync(path.join(admin, 'conferences-required.js'), 'utf8');
const conferenceHtml = fs.readFileSync(path.join(admin, 'conferences.html'), 'utf8');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  setAttribute(key, value) { this.attrs[key] = value; }
}

function pickerHarness(fetchData) {
  const button = new FakeElement('button');
  const panel = new FakeElement('div');
  const help = new FakeElement('div');
  const host = {
    innerHTML: '',
    querySelector(selector) { return { button, '.enReqPanel': panel, '.enReqHelp': help }[selector]; }
  };
  const window = {};
  const document = { createElement: (tag) => new FakeElement(tag) };
  vm.runInNewContext(pickerSource, { window, document });
  const picker = window.EagleNESTRequirementPicker.create({ host, fetchData });
  return { picker, panel, help };
}

const campaignOptions = [
  { campaign_id: 'fasc_current', fasc_event_id: 'event-current', name: 'FaSC — Current Event', event_date: '2026-11-17' },
  { campaign_id: 'fasc_other', fasc_event_id: 'event-other', name: 'FaSC — Other Event', event_date: '2026-11-24' },
  { campaign_id: 'attendance_followup', name: 'Attendance outreach', category: 'Attendance', due_date: '2026-11-30' }
];

test('conference workflow passes its selected FaSC event on open and date change', () => {
  assert.match(conferenceSource, /ensureConferenceReqPicker\(\)\?\.load\(row\.student_number,[^\n]+autoFaSCEventId: String\(bundle\?\.event\?\.event_id/);
  assert.match(conferenceSource, /getElementById\('reqContactAt'\)\?\.addEventListener\('change',[^\n]+autoFaSCEventId: String\(bundle\?\.event\?\.event_id/);
  assert.match(conferenceHtml, /communication_requirements_picker\.js\?v=20261117-fasc-auto-select-v1/);
  assert.match(conferenceHtml, /conferences-required\.js\?v=20261117-fasc-auto-select-v1/);
});

test('automatically selects only the active event FaSC and locks that enforced checkbox', async () => {
  const { picker, panel, help } = pickerHarness(async () => ({campaigns: campaignOptions}));
  await picker.load('123456789','2026-11-17', {autoFaSCEventId:'event-current'});
  assert.deepEqual([...picker.selected()], ['fasc_current']);
  const checks = panel.children.map(label => label.children[0]);
  assert.equal(checks[0].checked, true);
  assert.equal(checks[0].disabled, true);
  assert.equal(checks[1].checked, false);
  assert.equal(checks[1].disabled, false);
  assert.equal(checks[2].checked, false);
  assert.equal(checks[2].disabled, false);
  assert.match(help.textContent, /linked automatically/);
});

test('nonconnected outcomes clear fulfillment; restoring connected outcome restores FaSC', async () => {
  const { picker, panel } = pickerHarness(async () => ({campaigns: campaignOptions}));
  await picker.load('123456789','2026-11-17',{autoFaSCEventId:'event-current'});
  picker.setOutcome('No Answer');
  assert.deepEqual([...picker.selected()], []);
  assert.equal(panel.children[0].children[0].disabled, true);
  picker.setOutcome('Resolved');
  assert.deepEqual([...picker.selected()], ['fasc_current']);
});

test('no automatic selection on other pages, missing event, or Practice Mode', async () => {
  const { picker } = pickerHarness(async () => ({campaigns: campaignOptions}));
  await picker.load('123456789','2026-11-17');
  assert.deepEqual([...picker.selected()], []);
  await picker.load('123456789','2026-11-17',{autoFaSCEventId:'not-an-eligible-event'});
  assert.deepEqual([...picker.selected()], []);
  const { picker: practicePicker } = pickerHarness(async () => ({campaigns: campaignOptions,practice:true}));
  await practicePicker.load('123456789','2026-11-17',{autoFaSCEventId:'event-current'});
  assert.deepEqual([...practicePicker.selected()], []);
});

test('changing contact date reloads eligibility, never persists stale FaSC selection', async () => {
  let response = {campaigns:campaignOptions};
  const { picker } = pickerHarness(async () => response);
  await picker.load('123456789','2026-11-17',{autoFaSCEventId:'event-current'});
  assert.deepEqual([...picker.selected()], ['fasc_current']);
  response = {campaigns:campaignOptions.filter(c => c.fasc_event_id !== 'event-current')};
  await picker.load('123456789','2026-11-18',{autoFaSCEventId:'event-current'});
  assert.deepEqual([...picker.selected()], []);
});
