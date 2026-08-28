const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../Google Apps Script/clasp-projects/visitor-management');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

{
  const sheets = read('VisitorSheets.js');
  assert.match(sheets, /SPREADSHEET_ID_PROP/);
  assert.match(sheets, /setProperty\(VISITOR_CFG\.SPREADSHEET_ID_PROP,\s*ss\.getId\(\)\)/);
  assert.match(sheets, /SpreadsheetApp\.openById\(id\)/);
  const activeMatches = sheets.match(/SpreadsheetApp\.getActiveSpreadsheet\(\)/g) || [];
  assert.equal(activeMatches.length, 1, 'getActiveSpreadsheet should only be used by setupVisitorSpreadsheet');
  assert.match(sheets, /insertColumnsAfter/);
  assert.match(sheets, /SHEET_PROFILES/);
  assert.match(sheets, /ensureVisitorProfileHeaders_/);
  assert.match(sheets, /visitorProfilesSheet_/);
}

{
  const records = read('VisitorRecords.js');
  assert.doesNotMatch(records, /getDocumentLock\s*\(/, 'Visitor web-app persistence must not use document locks');
  assert.match(records, /LockService\.getScriptLock\s*\(/, 'Visitor web-app persistence must use a script-wide lock');
  assert.match(records, /\.waitLock\s*\(\s*30000\s*\)/, 'Visitor persistence should wait for the script lock');
  assert.match(records, /SpreadsheetApp\.flush\s*\(\s*\)/, 'Visitor persistence should flush sheet writes before releasing the lock');
  assert.match(records, /function\s+visitorUpsertProfile_/, 'Visitor GAS should upsert Returning Parent profiles separately');
  assert.match(records, /'Credential Hash': safeSheetText_\(profile\.credential_hash/, 'Visitor_Profiles should mirror credential hash only');
  assert.doesNotMatch(records, /qr_text|plaintext|ENVISITOR/, 'Visitor GAS records must not persist plaintext reusable QR tokens');
}

{
  const manifest = JSON.parse(read('appsscript.json'));
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets']);
}

{
  const security = read('VisitorSecurity.js');
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
  const config = read('VisitorConfig.js');
  assert.match(config, /Photo ID/);
  assert.match(config, /Date of Birth/);
  assert.match(config, /Photo Captured At/);
  assert.match(config, /Photo Source/);
  assert.match(config, /Photo Required Override/);
  assert.match(config, /SHEET_PROFILES:\s*'Visitor_Profiles'/);
  assert.match(config, /Visitor Profile ID/);
  assert.match(config, /Credential Hash/);
  assert.match(config, /Latest Photo Month/);
  assert.match(config, /Deprecated Visitor-side student pickup columns/);
  assert.match(config, /Student Pickup Status/);
  assert.match(config, /Student Pickup Completed At/);
  assert.match(config, /Student Pickup Completed By/);
}

{
  const code = read('Code.js');
  assert.doesNotMatch(code, /updateVisitorStudentLink/, 'Visitor GAS should not expose student-link actions');
  assert.match(code, /upsertVisitorProfile/, 'Visitor GAS should expose profile upsert action');
}

{
  const records = read('VisitorRecords.js');
  assert.match(records, /'Date of Birth': safeSheetText_\(visit\.date_of_birth/);
  assert.match(records, /'Photo ID': safeSheetText_\(visit\.photo_id/);
  assert.match(records, /'Photo Captured At': visit\.photo_captured_at/);
  assert.match(records, /'Visitor Profile ID': safeSheetText_\(visit\.visitor_profile_id/);
  assert.match(records, /'Returning Parent Opt In': visit\.returning_parent_opt_in/);
  assert.doesNotMatch(records, /photo_base64|image_base64|image_data|data:image/i, 'Visitor GAS must not write image bytes/Base64');
  assert.doesNotMatch(records, /'Student OSIS': visit\.student_osis/, 'Visitor GAS should not actively populate deprecated student columns');
}

{
  const security = read('VisitorSecurity.js');
  assert.match(security, /date_of_birth: visitorCleanStr_\(v\.date_of_birth/);
  assert.match(security, /photo_id: visitorCleanStr_\(v\.photo_id/);
  assert.match(security, /function\s+visitorSanitizeProfile_/, 'Visitor GAS should sanitize Returning Parent profiles');
  assert.match(security, /credential_hash: visitorCleanStr_\(p\.credential_hash/, 'Visitor GAS should accept only hash metadata for reusable credential');
  assert.doesNotMatch(security, /photo_base64|image_base64|image_data|data:image/i, 'Visitor GAS sanitizer must not accept image bytes/Base64');
  assert.doesNotMatch(security, /qr_text|plaintext|ENVISITOR/, 'Visitor GAS sanitizer must not accept plaintext reusable QR tokens');
}

{
  const history = read('VisitorHistory.js');
  assert.match(history, /date_of_birth: visitorDateOnlyString_\(out\.date_of_birth\)/);
}

console.log('visitor_gas_static tests passed');
