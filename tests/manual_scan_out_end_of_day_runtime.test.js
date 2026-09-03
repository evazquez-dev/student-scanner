const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const workerUrl = pathToFileURL(path.join(ROOT, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js')).href;

async function loadWorkerFresh(){
  return import(workerUrl + `?campus_out_mode=${Date.now()}_${Math.random()}`);
}

test('manual_scan_out disables automatic end-of-day Off Campus reset before any reset marker or location mutation', async () => {
  const { maybeAfterSchoolOffCampusReset } = await loadWorkerFresh();
  const touched = [];
  const env = {
    ROSTER: {
      async get(key, opts){
        touched.push(['get', String(key)]);
        if (String(key) === 'att_cfg_v1') {
          const wantsJson = opts === 'json' || opts?.type === 'json';
          return wantsJson
            ? { campus_out_mode:'manual_scan_out', late_min:8 }
            : JSON.stringify({ campus_out_mode:'manual_scan_out', late_min:8 });
        }
        throw new Error(`unexpected ROSTER read after manual mode gate: ${key}`);
      },
      async put(key){
        touched.push(['put', String(key)]);
        throw new Error(`manual mode must not write reset marker: ${key}`);
      }
    },
    STUDENT_LOC: {
      idFromName(){
        throw new Error('manual mode must not touch StudentLocationDO');
      }
    }
  };

  const today = new Date().toLocaleDateString('en-US', {
    timeZone:'America/New_York',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2');

  const result = await maybeAfterSchoolOffCampusReset(env, today);
  assert.deepEqual(result, {
    ok:true,
    skipped:'manual_scan_out_enabled',
    campus_out_mode:'manual_scan_out'
  });
  assert.deepEqual(touched, [['get', 'att_cfg_v1']]);
});
