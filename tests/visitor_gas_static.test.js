const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../Google Apps Script/Visitor Management');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

{
  const sheets = read('VisitorSheets.gs');
  assert.match(sheets, /SPREADSHEET_ID_PROP/);
  assert.match(sheets, /setProperty\(VISITOR_CFG\.SPREADSHEET_ID_PROP,\s*ss\.getId\(\)\)/);
  assert.match(sheets, /SpreadsheetApp\.openById\(id\)/);
  const activeMatches = sheets.match(/SpreadsheetApp\.getActiveSpreadsheet\(\)/g) || [];
  assert.equal(activeMatches.length, 1, 'getActiveSpreadsheet should only be used by setupVisitorSpreadsheet');
  assert.match(sheets, /insertColumnsAfter/);
}

{
  const records = read('VisitorRecords.gs');
  assert.doesNotMatch(records, /getDocumentLock\s*\(/, 'Visitor web-app persistence must not use document locks');
  assert.match(records, /LockService\.getScriptLock\s*\(/, 'Visitor web-app persistence must use a script-wide lock');
  assert.match(records, /\.waitLock\s*\(\s*30000\s*\)/, 'Visitor persistence should wait for the script lock');
  assert.match(records, /SpreadsheetApp\.flush\s*\(\s*\)/, 'Visitor persistence should flush sheet writes before releasing the lock');
}

{
  const manifest = JSON.parse(read('appsscript.json'));
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets']);
}

{
  const security = read('VisitorSecurity.gs');
  const factory = new Function('VISITOR_CFG', `${security}; return { safeSheetText_, visitorCleanStr_, visitorParsePost_ };`);
  const helpers = factory({ SECRET_PROP: 'VISITOR_GAS_SHARED_SECRET' });
  assert.equal(helpers.safeSheetText_('=FORMULA', 80), "'=FORMULA");
  assert.equal(helpers.safeSheetText_('+FORMULA', 80), "'+FORMULA");
  assert.equal(helpers.safeSheetText_('-FORMULA', 80), "'-FORMULA");
  assert.equal(helpers.safeSheetText_('@FORMULA', 80), "'@FORMULA");
  assert.equal(helpers.safeSheetText_('*FORMULA', 80), "'*FORMULA");
  assert.equal(helpers.safeSheetText_(' \t=FORMULA', 80), "'=FORMULA");
  assert.equal(helpers.safeSheetText_(' Normal Name ', 80), 'Normal Name');
  const parsed = helpers.visitorParsePost_({ parameter: { secret: 'x', action: 'ping', payload: '{not-json' } });
  assert.equal(parsed.secret, 'x');
  assert.deepEqual(parsed.payload, {});
}

{
  const config = read('VisitorConfig.gs');
  assert.match(config, /Student Pickup Status/);
  assert.match(config, /Student Pickup Completed At/);
  assert.match(config, /Student Pickup Completed By/);
}

console.log('visitor_gas_static tests passed');
