// EAGLENEST_CAMPAIGN_LOG_PREFILL_V1
// Regression tests for Parent & Family Communications -> Student Contacts Log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const dashboard = read('admin/communications.js');
const contacts = read('admin/student_contacts.js');
const pickerScript = read('admin/communication_requirements_picker.js');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
  }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML || ''; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.events[name] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function makePicker(options = {}) {
  const button = new FakeElement('button');
  const panel = new FakeElement('div');
  panel.hidden = true;
  const help = new FakeElement('div');
  const host = new FakeElement('div');
  host.querySelector = (selector) => ({ button, '.enReqPanel': panel, '.enReqHelp': help })[selector];
  const window = {};
  const document = { createElement: (tag) => new FakeElement(tag) };
  vm.runInNewContext(pickerScript, { window, document });
  const campaigns = options.campaigns || [
    { campaign_id: 'readiness_campaign', name: 'College Readiness', category: 'Academic', due_date: '2026-12-01' },
    { campaign_id: 'attendance_campaign', name: 'Attendance', category: 'Attendance', due_date: '2026-12-01' },
    { campaign_id: 'fasc_123', fasc_event_id: '123', name: 'FaSC — Fall Conference', event_date: '2026-11-17' }
  ];
  const picker = window.EagleNESTRequirementPicker.create({
    host, fetchData: async () => ({campaigns, practice: options.practice === true})
  });
  return { picker, button, panel, help };
}

function checkFor(panel, campaignName) {
  const labels = panel.children.filter((node) => node.tagName === 'label');
  const label = labels.find((node) => node.children[1]?.children?.[0]?.textContent === campaignName);
  assert.ok(label, `Expected checkbox row for ${campaignName}`);
  return label.children[0];
}

test('campaign Log URL carries a stable campaign ID, not just its category', () => {
  assert.match(dashboard, /campaignId:campaign\.campaign_id/);
  const start = dashboard.indexOf('function studentUrl(');
  const end = dashboard.indexOf('function studentLink(', start);
  assert.ok(start >= 0 && end > start);
  const makeUrl = vm.runInNewContext(`${dashboard.slice(start,end)}\nstudentUrl`, {
    URL, location: {href: 'https://school.example/admin/communications.html'}
  });
  const url = new URL(makeUrl({student_number:'247212533',student_name:'Student Test'}, {
    category:'Academic',campaignId:'readiness_campaign',proxy:true
  }));
  assert.equal(url.searchParams.get('osis'), '247212533');
  assert.equal(url.searchParams.get('category'), 'Academic');
  assert.equal(url.searchParams.get('campaign_id'), 'readiness_campaign');
  assert.equal(url.searchParams.get('proxy'), '1');
  assert.equal(url.searchParams.get('source'), 'communications');
  assert.equal(url.searchParams.get('action'), null); // Contact selection remains staff-controlled.
});

test('campaign prefill is confined to originating student and communications page', () => {
  assert.match(contacts, /campaignPrefillOptions\(\)/);
  assert.match(contacts, /commRequirements\?\.load\(currentStudent\.osis, \(commAt\.value \|\| ''\)\.slice\(0,10\), campaignPrefillOptions\(\)\)/);
  assert.match(contacts, /commAt\.addEventListener\('change', \(\) => commRequirements\?\.load\(currentStudent\?\.osis \|\| '', \(commAt\.value \|\| ''\)\.slice\(0,10\), campaignPrefillOptions\(\)\)\)/);
  const start = contacts.indexOf('function campaignPrefillOptions()');
  const end = contacts.indexOf('function openCommunication(', start);
  assert.ok(start >= 0 && end > start);
  const getOptions = (osis, source = 'communications') => vm.runInNewContext(
    `${contacts.slice(start,end)}\nJSON.stringify(campaignPrefillOptions())`, {
      PAGE_SOURCE: source,
      PAGE_PREFILL_CAMPAIGN_ID: 'readiness_campaign',
      PAGE_PREFILL_CAMPAIGN_STUDENT: '247212533',
      currentStudent: {osis}
    });
  assert.equal(getOptions('247212533'), '{"autoCampaignId":"readiness_campaign"}');
  assert.equal(getOptions('999999999'), '{}');
  assert.equal(getOptions('247212533','student_contacts'), '{}');
});

test('specific eligible campaign is selected, but unrelated campaigns and FaSC are not', async () => {
  const {picker, panel} = makePicker();
  await picker.load('247212533', '2026-11-17', {autoCampaignId: 'readiness_campaign'});
  assert.deepEqual(Array.from(picker.selected()), ['readiness_campaign']);
  assert.equal(panel.hidden, false, 'Auto-selected campaign should be visible when Log opens');
  assert.equal(checkFor(panel,'College Readiness').checked, true);
  assert.equal(checkFor(panel,'Attendance').checked, false);
  assert.equal(checkFor(panel,'FaSC — Fall Conference').checked, false);
});

test('staff may manually uncheck the automatically selected campaign', async () => {
  const {picker, panel} = makePicker();
  await picker.load('247212533','2026-11-17',{autoCampaignId:'readiness_campaign'});
  const check = checkFor(panel,'College Readiness');
  assert.equal(check.disabled, false);
  check.checked = false;
  check.events.change();
  assert.deepEqual(Array.from(picker.selected()), []);
  picker.setOutcome('Spoke/Connected'); // redraw must not reselect after an explicit opt-out
  assert.deepEqual(Array.from(picker.selected()), []);
});

test('No Answer and Practice Mode never fulfill the automatic campaign', async () => {
  const first = makePicker();
  await first.picker.load('247212533','2026-11-17',{autoCampaignId:'readiness_campaign'});
  first.picker.setOutcome('No Answer');
  assert.deepEqual(Array.from(first.picker.selected()), []);
  assert.equal(checkFor(first.panel,'College Readiness').disabled, true);
  first.picker.setOutcome('Spoke/Connected');
  assert.deepEqual(Array.from(first.picker.selected()), ['readiness_campaign']);
  const practice = makePicker({practice:true});
  await practice.picker.load('247212533','2026-11-17',{autoCampaignId:'readiness_campaign'});
  assert.deepEqual(Array.from(practice.picker.selected()), []);
});

test('non-eligible campaign ID is not silently forged into selected requirement list', async () => {
  const {picker, help} = makePicker();
  await picker.load('247212533','2026-11-17',{autoCampaignId:'other_campaign'});
  assert.deepEqual(Array.from(picker.selected()), []);
  assert.match(help.textContent, /not available/);
});

test('modified scripts have cache-busting query params', () => {
  const dashHtml = read('admin/communications.html');
  const contactsHtml = read('admin/student_contacts.html');
  assert.match(dashHtml,/communications\.js\?v=[^"\n]+campaign_prefill=20261117-v1/);
  assert.match(contactsHtml,/student_contacts\.js\?v=[^"\n]+campaign_prefill=20261117-v1/);
  assert.match(contactsHtml,/communication_requirements_picker\.js\?v=[^"\n]+campaign_prefill=20261117-v1/);
});
