const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const labHtml = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/index.html'), 'utf8');
const labCss = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/scanner-lab.css'), 'utf8');
const labJs = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/scanner-lab.js'), 'utf8');
const labAamvaDiagJs = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/aamva_diagnostics.js'), 'utf8');
const adapter = fs.readFileSync(path.resolve(__dirname, '../visitor/id_scan_adapters.js'), 'utf8');
const visitorJs = fs.readFileSync(path.resolve(__dirname, '../visitor/visitor.js'), 'utf8');
const sw = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8');
const AamvaDiag = require('../scanner-lab/aamva_diagnostics.js');
const IdnycDiag = require('../scanner-lab/idnyc_diagnostics.js');
const selfTestFixture = path.resolve(__dirname, '../scanner-lab/fixtures/pdf417-selftest.png');

function sectionBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return src.slice(start, end);
}

const labSource = [labHtml, labCss, labJs, labAamvaDiagJs].join('\n');

{
  assert.match(labHtml, /EagleNEST Scanner Lab/);
  assert.match(labHtml, /iPad Camera \+ PDF417 Test/);
  assert.match(labHtml, /Raw scanned ID data and images are not saved or uploaded/);
  assert.match(labJs, /LAB_BUILD\s*=\s*'2026-09-03-12'/, 'Scanner Lab should expose Build 12');
}

function asciiBytes(text) {
  return Uint8Array.from(Buffer.from(text, 'latin1'));
}

function syntheticAamvaBytes(subfile, fields, options) {
  const opts = options || {};
  const type = subfile || 'DL';
  const body = `${type}${fields.join('\n')}\r`;
  const offset = 21 + 10;
  const length = body.length;
  const header = `@\n\x1e\rANSI 636000${opts.version || '10'}${opts.jurisdiction || '04'}01${type}${String(offset).padStart(4, '0')}${String(length).padStart(4, '0')}`;
  assert.equal(header.length, offset, 'synthetic AAMVA descriptor offset should be exact');
  return asciiBytes(header + body);
}

function syntheticAamvaResult(subfile, fields, options) {
  const bytes = syntheticAamvaBytes(subfile, fields, options);
  const hriText = '@ANSI 636000100401; HRI text intentionally lacks control separators and fields';
  return {
    text: hriText,
    bytes,
    format: 'PDF417',
    valid: true
  };
}

function syntheticMultiAamvaResult(subfiles, options) {
  const opts = options || {};
  const bodies = subfiles.map((item) => `${item.type}${item.fields.join('\n')}\r`);
  let offset = 21 + (subfiles.length * 10);
  const descriptors = bodies.map((body, index) => {
    const type = subfiles[index].type;
    const descriptor = `${type}${String(offset).padStart(4, '0')}${String(body.length).padStart(4, '0')}`;
    offset += body.length;
    return descriptor;
  });
  const header = `@\n\x1e\rANSI 636000${opts.version || '10'}${opts.jurisdiction || '04'}${String(subfiles.length).padStart(2, '0')}${descriptors.join('')}`;
  assert.equal(header.length, 21 + (subfiles.length * 10), 'synthetic multi-subfile descriptor offsets should be exact');
  return {
    text: '@ANSI 636000100402; HRI text intentionally lacks control separators and fields',
    bytes: asciiBytes(header + bodies.join('')),
    format: 'PDF417',
    valid: true,
    bodyLengths: bodies.map((body) => body.length)
  };
}

{
  const result = syntheticAamvaResult('DL', [
    'DCSDOE',
    'DACJANE',
    'DADQ',
    'DBB01021980',
    'DAQDO-NOT-COPY',
    'DAJNY'
  ]);
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.parserSource, 'RAW BYTES');
  assert.equal(diag.rawBytesAvailable, true);
  assert.equal(diag.rawByteLength, result.bytes.length);
  assert.equal(diag.rawHeaderAt, true);
  assert.equal(diag.rawHeaderLf, true);
  assert.equal(diag.rawHeaderRs, true);
  assert.equal(diag.rawHeaderCr, true);
  assert.equal(diag.rawHeaderAnsi, true);
  assert.equal(diag.complianceIndicator, true);
  assert.equal(diag.ansiHeader, true);
  assert.equal(diag.iinPresent, true);
  assert.equal(diag.aamvaVersion, '10');
  assert.equal(diag.jurisdictionVersion, '4');
  assert.equal(diag.subfileCount, 1);
  assert.equal(diag.descriptorTableParseable, true);
  assert.equal(diag.descriptors[0].type, 'DL');
  assert.equal(diag.descriptors[0].offset, 31);
  assert.equal(diag.descriptors[0].length, result.bytes.length - 31);
  assert.equal(diag.descriptors[0].offsetWithinBounds, true);
  assert.equal(diag.descriptors[0].lengthWithinBounds, true);
  assert.equal(diag.descriptors[0].prefixMatches, true);
  assert.equal(diag.primarySubfileType, 'DL');
  assert.equal(diag.dlSubfile, true);
  assert.equal(diag.enSubfile, false);
  assert.equal(diag.idSubfile, false);
  assert.equal(diag.dcsTag, true);
  assert.equal(diag.dacTag, true);
  assert.equal(diag.dadTag, true);
  assert.equal(diag.dbbTag, true);
  assert.equal(diag.daqTag, true);
  assert.equal(diag.recordSeparator, true);
  assert.equal(diag.segmentTerminator, true);
  assert.equal(diag.lineFeedSeparators, true);
  assert.equal(diag.strictParserPass, true);
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.dobParsed, true);
  assert.equal(diag.zxing.containsAsciiControlChars, true);
  assert.equal(diag.recoveredData.visitor_first_name, 'JANE');
  assert.equal(diag.recoveredData.visitor_middle_name, 'Q');
  assert.equal(diag.recoveredData.visitor_last_name, 'DOE');
  assert.equal(diag.recoveredData.date_of_birth, '1980-01-02');
}

{
  const result = syntheticAamvaResult('ID', [
    'DCSROE',
    'DACRICHARD',
    'DBB19800102'
  ]);
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.idSubfile, true);
  assert.equal(diag.dlSubfile, false);
  assert.equal(diag.enSubfile, false);
  assert.equal(diag.primarySubfileType, 'ID');
  assert.equal(diag.descriptors[0].type, 'ID');
  assert.equal(diag.descriptors[0].offset, 31);
  assert.equal(diag.descriptors[0].prefixMatches, true);
  assert.equal(diag.strictParserPass, true);
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.recoveredData.date_of_birth, '1980-01-02');
}

{
  const result = syntheticMultiAamvaResult([
    {
      type: 'EN',
      fields: [
        'DCSENLAST',
        'DACENFIRST',
        'DADQ',
        'DBB01011990',
        'DAJNY'
      ]
    },
    {
      type: 'ZN',
      fields: [
        'DCSIGNOREME',
        'DACWRONG',
        'DBB12312001'
      ]
    }
  ]);
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.parserSource, 'RAW BYTES');
  assert.equal(diag.aamvaVersion, '10');
  assert.equal(diag.jurisdictionVersion, '4');
  assert.equal(diag.subfileCount, 2);
  assert.equal(diag.descriptorTableParseable, true);
  assert.equal(diag.descriptors[0].type, 'EN');
  assert.equal(diag.descriptors[0].offset, 41);
  assert.equal(diag.descriptors[0].length, result.bodyLengths[0]);
  assert.equal(diag.descriptors[0].prefixMatches, true);
  assert.equal(diag.descriptors[1].type, 'ZN');
  assert.equal(diag.descriptors[1].offset, 41 + result.bodyLengths[0]);
  assert.equal(diag.descriptors[1].length, result.bodyLengths[1]);
  assert.equal(diag.descriptors[1].prefixMatches, true);
  assert.equal(diag.primarySubfileType, 'EN');
  assert.equal(diag.dlSubfile, false);
  assert.equal(diag.enSubfile, true);
  assert.equal(diag.idSubfile, false);
  assert.equal(diag.jurisdictionSpecificSubfile, true);
  assert.equal(diag.jurisdictionSpecificDescriptor.type, 'ZN');
  assert.equal(diag.dcsTag, true);
  assert.equal(diag.dacTag, true);
  assert.equal(diag.dadTag, true);
  assert.equal(diag.dbbTag, true);
  assert.equal(diag.dobParsed, true);
  assert.equal(diag.strictParserPass, true);
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.recoveredData.visitor_first_name, 'ENFIRST');
  assert.equal(diag.recoveredData.visitor_middle_name, 'Q');
  assert.equal(diag.recoveredData.visitor_last_name, 'ENLAST');
  assert.equal(diag.recoveredData.date_of_birth, '1990-01-01');
}

{
  const result = syntheticAamvaResult('DL', [
    'DCSALT',
    'DCTMORGAN LEE',
    'DBB02031981'
  ], { version: '01', jurisdiction: '07' });
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.parserSource, 'RAW BYTES');
  assert.equal(diag.aamvaVersion, '1');
  assert.equal(diag.jurisdictionVersion, '7');
  assert.equal(diag.strictParserPass, true);
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.recoveredData.visitor_first_name, 'MORGAN');
  assert.equal(diag.recoveredData.visitor_middle_name, 'LEE');
  assert.equal(diag.recoveredData.date_of_birth, '1981-02-03');
}

{
  const result = syntheticAamvaResult('DL', [
    'DCSRECOVER',
    'DACCASEY',
    'DBB01021980'
  ]);
  result.bytes = result.bytes.slice(0, result.bytes.length - 2);
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.rawBytesAvailable, true);
  assert.equal(diag.ansiHeader, true);
  assert.equal(diag.descriptorTableParseable, false);
  assert.equal(diag.strictParserPass, false);
  assert.equal(diag.fieldRecoveryPass, false);
}

{
  const diag = AamvaDiag.analyzeAamvaPayload('shipping PDF417 text with DCS and DAC and DBB01021980 but no AAMVA structure');
  assert.equal(diag.aamvaIndicators, false);
  assert.equal(diag.strictParserPass, false);
  assert.equal(diag.fieldRecoveryPass, false);
}

{
  const raw = [
    '@',
    '\x1e',
    '\r',
    'ANSI 636000080102DL00410288',
    'DCSDOE',
    'DACJANE',
    'DADQ',
    'DBB01021980',
    'DAQDO-NOT-COPY'
  ].join('\n');
  const diag = AamvaDiag.analyzeAamvaPayload(raw);
  assert.equal(diag.parserSource, 'PLAIN TEXT FALLBACK');
  assert.equal(diag.aamvaVersion, '8');
  assert.equal(diag.jurisdictionVersion, '1');
  assert.equal(diag.dlSubfile, false);
  assert.equal(diag.dcsTag, true);
  assert.equal(diag.dacTag, true);
  assert.equal(diag.dadTag, true);
  assert.equal(diag.dbbTag, true);
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.recoveredData.visitor_first_name, 'JANE');
  assert.equal(diag.recoveredData.visitor_middle_name, 'Q');
  assert.equal(diag.recoveredData.visitor_last_name, 'DOE');
  assert.equal(diag.recoveredData.date_of_birth, '1980-01-02');
}

{
  const result = syntheticAamvaResult('DL', [
    'DCSDOE',
    'DACJANE',
    'DBB01021980'
  ]);
  const hriOnlyDiag = AamvaDiag.analyzeAamvaPayload(result.text, { text: result.text, format: 'PDF417', valid: true });
  assert.equal(hriOnlyDiag.rawBytesAvailable, false);
  assert.equal(hriOnlyDiag.parserSource, 'NONE');
  assert.equal(hriOnlyDiag.strictParserPass, false);
  assert.equal(hriOnlyDiag.fieldRecoveryPass, false);
  assert.equal(hriOnlyDiag.parserFailureReason, 'Raw bytes unavailable; HRI text not used for AAMVA structural parsing');
}

{
  const result = syntheticAamvaResult('DL', [
    'DCSDOE',
    'DACJANE',
    'DBB01021980'
  ]);
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.controlCounts.rs > 0, true);
  assert.equal(diag.controlCounts.cr > 0, true);
  assert.equal(diag.controlCounts.lf > 0, true);
  assert.equal(diag.recordSeparator, true);
  assert.equal(diag.segmentTerminator, true);
}

{
  const result = syntheticAamvaResult('DL', [
    'DCSDOE',
    'DACJANE',
    'DBB01021980'
  ]);
  result.bytes[27] = 0x39;
  result.bytes[28] = 0x39;
  result.bytes[29] = 0x39;
  result.bytes[30] = 0x39;
  const diag = AamvaDiag.analyzeAamvaPayload(result.text, result);
  assert.equal(diag.descriptorTableParseable, false);
  assert.equal(diag.descriptors[0].lengthWithinBounds, false);
  assert.equal(diag.fieldRecoveryPass, false);
}

{
  const diag = AamvaDiag.analyzeAamvaPayload('EAGLENEST-PDF417-SELFTEST-12345');
  assert.equal(diag.aamvaIndicators, false);
  assert.equal(diag.parserResult, 'INVALID');
  assert.equal(diag.parserFailureReason, 'Compliance indicator missing');
}

{
  assert.doesNotMatch(labSource, /XMLHttpRequest|sendBeacon|analytics|gtag|dataLayer/i, 'Scanner Lab must not use analytics or alternate upload transports');
  assert.doesNotMatch(labSource, /script\.google\.com|\/admin\/|VisitorDeskDO|VISITOR_PHOTOS|R2Bucket|GAS_URL|GAS_ENDPOINT/i, 'Scanner Lab must not call privileged EagleNEST backend systems');
  assert.match(labHtml, /meta name="api-base" content="https:\/\/red-cake-77d5\.evazquez-3e0\.workers\.dev\/"/, 'Scanner Lab may know only the public Worker base used for safe diagnostics');
  assert.match(labJs, /new URL\('\/visitor\/kiosk\/idnyc_diagnostics', API_BASE\)/, 'Scanner Lab may send privacy-safe NYCID diagnostics through the paired kiosk route');
  assert.match(labJs, /localStorage\.getItem\(VISITOR_KIOSK_CRED_KEY\)/, 'Scanner Lab may read the existing Visitor Kiosk credential');
  assert.doesNotMatch(labJs, /localStorage\.(?:setItem|removeItem|clear)\(/, 'Scanner Lab must not persist or mutate scan data in localStorage');
  assert.doesNotMatch(labSource, /sessionStorage|indexedDB|caches\.open/i, 'Scanner Lab must not persist scan data in browser stores');
  assert.doesNotMatch(labSource, /console\.log|console\.debug|console\.info/i, 'Scanner Lab must not log decoded payloads');
  assert.match(labJs, /fetch\(SELFTEST_FIXTURE,\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Scanner Lab may fetch its static self-test fixture');
  const safeDiagSection = sectionBetween(labJs, 'function labSafeDiagnosticPayload', 'async function sendLabSafeIdnycDiagnostic');
  assert.doesNotMatch(safeDiagSection, /raw_ocr_text\s*:|ocr_text\s*:|visitor_first_name\s*:|visitor_last_name\s*:|date_of_birth\s*:|id_number_value\s*:/i, 'Safe diagnostic payload must not contain OCR text or identity values');
}

{
  assert.match(sw, /url\.pathname\.includes\('\/scanner-lab\/'\)/, 'Service worker must bypass scanner-lab sources');
  assert.match(sw, /fetch\(req,\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Scanner Lab bypass should fetch normally without service-worker cache');
}

{
  assert.match(labHtml, /\.\.\/visitor\/visitor_shared\.js/, 'Scanner Lab should reuse shared AAMVA parser');
  assert.match(labHtml, /\.\.\/visitor\/id_scan_adapters\.js/, 'Scanner Lab should reuse Visitor PDF417 adapter');
  assert.match(labHtml, /\.\/aamva_diagnostics\.js/, 'Scanner Lab should load lab-only AAMVA diagnostics');
  assert.match(adapter, /new URL\('\.\/',\s*document\.currentScript\.src\)/, 'Adapter assets should resolve relative to the adapter script path');
  assert.match(adapter, /vendor\/zxing-wasm\/\$\{VERSIONS\.zxingWasm\}\/reader\/index\.js/, 'Adapter should load local ZXing JS');
  assert.match(adapter, /vendor\/zxing-wasm\/\$\{VERSIONS\.zxingWasm\}\/reader\/zxing_reader\.wasm/, 'Adapter should load local ZXing WASM');
  assert.match(adapter, /formats:\s*\[\s*'PDF417'\s*\]/, 'PDF417 must be explicitly enabled');
  assert.match(adapter, /DIAGNOSTIC_PDF417_OPTIONS/, 'Adapter should expose diagnostic PDF417 reader options');
  assert.match(adapter, /returnErrors:\s*true/, 'Diagnostic reader options should request returnErrors');
  assert.match(adapter, /tryDenoise:\s*true/, 'Diagnostic reader options should enable denoise');
  assert.match(adapter, /binarizer:\s*'LocalAverage'/, 'Diagnostic reader options should expose LocalAverage binarizer');
  assert.match(adapter, /function\s+readBarcodeResults/, 'Lab should have raw diagnostic result access');
  assert.match(adapter, /function\s+readPdf417Candidates/, 'Lab should have diagnostic access to PDF417 candidates');
  assert.match(adapter, /function\s+copyByteArray/, 'Adapter should safely copy ZXing raw bytes');
  assert.match(adapter, /const bytes = copyByteArray\(result\?\.bytes \|\| result\?\.rawBytes \|\| null\)/, 'Adapter should preserve ReadResult.bytes');
  assert.match(adapter, /\bbytes,\n\s*bytesECI:/, 'Normalized decode result should carry bytes in memory for Scanner Lab diagnostics');
  assert.match(adapter, /function\s+fetchZxingWasmInfo/, 'Lab should be able to verify local WASM fetch metadata');
  assert.match(adapter, /ZXING_WASM_VERSION|ZXING_CPP_COMMIT|ZXING_WASM_SHA256/, 'Adapter should expose ZXing version/hash metadata where available');
  assert.match(adapter, /facingMode:\s*\{\s*ideal:\s*'environment'\s*\}/, 'Rear camera should be requested for scanner tests');
}

{
  assert.equal(fs.existsSync(selfTestFixture), true, 'Scanner Lab should include a local PDF417 self-test fixture');
  assert.match(labHtml, /Decoder Self-Test/, 'Scanner Lab should include a decoder self-test section');
  assert.match(labHtml, /Run Decoder Self-Test/, 'Scanner Lab should provide a self-test button');
  assert.match(labHtml, /pdf417-selftest\.png/, 'Self-test should use a local checked-in fixture');
  assert.match(labJs, /SELFTEST_TEXT\s*=\s*'EAGLENEST-PDF417-SELFTEST-12345'/, 'Self-test payload must be non-PII fixture text');
  assert.match(labJs, /runBarcodeRead\(blob,\s*diagnosticPdf417Options\(\)\)/, 'Self-test should use the same adapter read path');
  assert.match(labHtml, /DECODER PIPELINE FAILURE/, 'Self-test failure should be prominent');
}

{
  assert.match(labJs, /startRearCamera\(\$\(\'liveVideo\'\),\s*resolutionKey\)/, 'Live scanner should use rear-camera video with selected resolution');
  assert.match(labJs, /LIVE_SCAN_INTERVAL_MS\s*=\s*240/, 'Live scanner should throttle decode cadence');
  assert.match(labJs, /decodeBusy/, 'Live scanner should prevent overlapping decode operations');
  assert.match(labHtml, /name="testTarget" value="selftest" checked/, 'Scanner Lab should have explicit self-test target mode');
  assert.match(labHtml, /name="testTarget" value="state_id"/, 'Scanner Lab should have explicit State ID target mode');
  assert.match(labHtml, /PDF417 BARCODE DETECTED/, 'PDF417 success should be displayed separately from AAMVA success');
  assert.match(labHtml, /LIVE IPAD PDF417 SCANNING WORKS/, 'Self-test live PDF417 reads should prove iPad scanning works');
  assert.match(labHtml, /Barcode is not an AAMVA State ID/, 'Non-AAMVA PDF417 should be explained instead of treated as decoder failure');
  assert.match(labJs, /selectedTestTarget/, 'Live scan behavior should know whether it is testing self-test or State ID target');
  assert.match(labJs, /pdf417Successes/, 'PDF417 success counter should be independent');
  assert.match(labJs, /aamvaSuccesses/, 'AAMVA success counter should be independent');
  assert.match(labJs, /matchingPdf417Reads/, 'Matching PDF417 counter should exist');
  assert.match(labJs, /matchingAamvaReads/, 'Matching AAMVA counter should exist');
  assert.match(labJs, /payload === SELFTEST_TEXT/, 'Lab should recognize its own self-test PDF417 payload in live camera mode');
  assert.match(labJs, /Live iPad PDF417 scanning works/, 'Self-test PDF417 live success should not require AAMVA');
  assert.match(labHtml, /Camera Resolution/, 'Scanner Lab should expose camera resolution controls');
  assert.match(labHtml, /name="cameraResolution" value="default" checked/, 'Default camera resolution should be selectable');
  assert.match(labHtml, /name="cameraResolution" value="hd"/, 'HD camera resolution should be selectable');
  assert.match(labHtml, /name="cameraResolution" value="higher"/, 'Higher camera resolution should be selectable');
  assert.match(labJs, /width\s*=\s*\{\s*ideal:\s*1920\s*\}/, 'Higher resolution should request 1920 width');
  assert.match(labJs, /height\s*=\s*\{\s*ideal:\s*1080\s*\}/, 'Higher resolution should request 1080 height');
  assert.match(labJs, /getSettings\?\.\(\)/, 'Actual camera settings should be displayed');
  assert.match(labJs, /getCapabilities\?\.\(\)/, 'Camera capability ranges should be displayed when available');
  assert.match(labHtml, /liveActualResolution/, 'Actual camera resolution should appear in the UI');
  assert.match(labHtml, /liveCapabilities/, 'Camera capability range should appear in the UI');
  assert.match(labJs, /selectedRegionMode/, 'Live scanner should support full-frame vs guide-only regions');
  assert.match(labHtml, /name="regionMode" value="full" checked/, 'Full-frame mode should be available by default');
  assert.match(labHtml, /name="regionMode" value="guide"/, 'Guide-only mode should be available');
  assert.match(labHtml, /name="rotation" value="0" checked/, '0-degree rotation should be enabled by default');
  assert.match(labHtml, /name="rotation" value="90" checked/, '90-degree rotation should be enabled by default');
  assert.match(labHtml, /name="processing" value="original" checked/, 'Original processing should be enabled by default');
  assert.match(labHtml, /name="processing" value="downscale2000"/, 'Photo diagnostics should support 2000px long-edge downscale');
  assert.match(labHtml, /name="processing" value="downscale1400"/, 'Photo diagnostics should support 1400px long-edge downscale');
  assert.match(labHtml, /name="processing" value="grayscale"/, 'Grayscale test option should exist');
  assert.match(labHtml, /name="processing" value="contrast"/, 'Contrast test option should exist');
  assert.match(labHtml, /name="processing" value="resize2x"/, '2x resize test option should exist');
  assert.match(labHtml, /Hold the BACK of your ID close to the iPad and place ONLY the barcode inside this box/, 'State ID live mode should guide users to frame only the barcode');
  assert.match(labJs, /getRenderedVideoRect/, 'Live guide crop should account for rendered video bounds');
  assert.match(labJs, /guideToVideoPixels/, 'Live guide crop should map displayed guide to video pixels');
  assert.match(labJs, /sourceCanvasFromVideoGuide/, 'State ID live mode should decode the guide crop');
  assert.match(labJs, /drawImage\(video,\s*mapping\.sx,\s*mapping\.sy,\s*mapping\.sw,\s*mapping\.sh/, 'Guide crop should draw the mapped natural video pixels');
  assert.match(labHtml, /Live Guide Mapping/, 'Live guide mapping diagnostics should be visible');
  assert.match(labHtml, /Mapped video crop/, 'Mapped video crop should be visible');
  assert.match(labHtml, /Guide decoder input/, 'Guide decoder input dimensions should be visible');
  assert.match(labJs, /decodeStateIdGuideCanvas/, 'State ID live mode should use the simplified guide decoder pipeline');
  assert.match(labJs, /const modes = \['original', 'contrast'\]/, 'State ID live mode should try original then contrast');
  assert.match(labJs, /live\.originalAttemptSuccess/, 'Original attempt result should be tracked');
  assert.match(labJs, /live\.contrastAttemptSuccess/, 'Contrast attempt result should be tracked');
  assert.match(labJs, /lastAamvaFingerprint/, 'AAMVA matching should use a temporary fingerprint');
  assert.match(labJs, /fingerprintPayload/, 'Raw payload matching should use fingerprint helper');
}

{
  assert.match(labHtml, /id="barcodePhotoInput"[^>]+type="file"[^>]+accept="image\/\*"[^>]+capture="environment"/, 'Photo PDF417 test should use native rear-camera capture fallback');
  assert.match(labJs, /URL\.createObjectURL\(file\)/, 'Photo test should show a temporary object URL preview');
  assert.match(labJs, /URL\.revokeObjectURL/, 'Photo test should revoke temporary object URLs');
  const photoSection = sectionBetween(labJs, 'async function handlePhotoSelected', 'async function tryAllFormats');
  assert.match(photoSection, /decodeDirectOriginalFile\(file\)/, 'Photo path should direct-decode the original File first');
  assert.match(photoSection, /const source = await imageFileToCanvas\(file\)/, 'Canvas conversion should happen after direct File decode');
  const directSection = sectionBetween(labJs, 'async function decodeDirectOriginalFile', 'async function handlePhotoSelected');
  assert.match(directSection, /runBarcodeRead\(file,\s*diagnosticPdf417Options\(\)\)/, 'Direct original File should be passed to ZXing readBarcodes path');
  assert.match(labJs, /decodeCanvasWithSelections\(source,\s*\{/, 'Photo test should decode with the same local PDF417 path/options and metadata');
  assert.match(labHtml, /Try All Barcode Formats/, 'All-formats diagnostic button should exist');
  assert.match(labJs, /formats:\s*\[\]/, 'All-formats diagnostic should pass an empty formats list');
}

{
  assert.match(labHtml, /Crop Barcode Manually/, 'Manual crop tool should exist');
  assert.match(labHtml, /Decode This Crop/, 'Manual crop decode button should exist');
  assert.match(labHtml, /Bottom 50%/, 'Bottom 50% crop preset should exist');
  assert.match(labHtml, /Bottom 35%/, 'Bottom 35% crop preset should exist');
  assert.match(labHtml, /Center 50%/, 'Center 50% crop preset should exist');
  assert.match(labHtml, /Full Image/, 'Full Image crop preset should exist');
  assert.match(labJs, /pointerdown/, 'Manual crop should support touch/pointer interaction');
  assert.match(labJs, /cropCanvasFromRect/, 'Manual crop should create a real crop canvas');
  assert.match(labJs, /getRenderedImageRect/, 'Crop mapping should calculate the actual rendered image rectangle');
  assert.match(labJs, /getComputedStyle\(img\)\.objectFit/, 'Crop mapping should account for object-fit');
  assert.match(labJs, /displayCropToNaturalPixels/, 'Crop mapping should convert displayed crop to natural/source pixels');
  assert.match(labJs, /naturalWidth/, 'Crop mapping should use natural image dimensions');
  assert.match(labJs, /naturalHeight/, 'Crop mapping should use natural image dimensions');
  assert.match(labJs, /ev\.clientX/, 'Pointer mapping should use client coordinates');
  assert.match(labJs, /ev\.clientY/, 'Pointer mapping should use client coordinates');
  assert.doesNotMatch(labJs, /ev\.pageX|ev\.pageY|ev\.offsetX|ev\.offsetY/, 'Crop pointer mapping should not mix page/offset coordinates');
  assert.match(labHtml, /Crop Mapping Check/, 'Crop mapping preview should exist');
  assert.match(labHtml, /id="cropMappingCanvas"/, 'Crop mapping check should draw a round-trip source preview');
  assert.match(labHtml, /Mapped natural crop/, 'Crop debug should show mapped natural crop coordinates');
  assert.match(labHtml, /Exact Source Crop Sent To ZXing/, 'Exact decoder input preview should exist');
  assert.match(labHtml, /id="decoderInputCanvas"/, 'Decoder input preview should use a canvas, not Base64 data URLs');
  assert.match(labJs, /drawDecoderInputPreview/, 'Scanner Lab should draw exact canvas sent to ZXing');
  assert.match(labJs, /drawCropMappingCheck/, 'Scanner Lab should draw the mapped crop back onto the source image');
  assert.match(labJs, /qualityMetrics/, 'Photo/crop quality diagnostics should exist');
  assert.match(labHtml, /Photographing a barcode displayed on another screen may introduce moire/, 'Photo test should explain screen moire risk');
  assert.match(labJs, /directPhotoResult/, 'Direct photo result state should be separate');
  assert.match(labJs, /allFormatsResult/, 'All-formats result state should be separate');
  assert.match(labJs, /manualCropResult/, 'Manual crop result state should be separate');
  assert.match(labJs, /liveResult/, 'Live result state should be separate');
  assert.match(labJs, /autoCropResult/, 'Auto-crop result state should be separate');
  assert.match(labJs, /sessionResults/, 'Scanner Lab should keep a session result model');
  assert.match(labJs, /lastSuccessfulPdf417/, 'Scanner Lab should preserve the last successful PDF417 result');
  assert.match(labJs, /setSourceResult/, 'Scanner Lab should update result state by source');
  assert.match(labJs, /makeSourceResult/, 'Scanner Lab should create source-owned result objects');
  assert.match(labJs, /\baamva\b[\s\n]*\}/, 'AAMVA diagnostics should belong to the decode result object');
  assert.match(labHtml, /Auto-Crop Experiment/, 'Photo test should include bounded auto-crop experiment');
  assert.match(labJs, /Bottom 45%/, 'Auto-crop experiment should include bottom 45 percent preset');
  assert.match(labJs, /Center-lower wide/, 'Auto-crop experiment should include center-lower wide preset');
  assert.match(labJs, /runAutoCropExperiment/, 'Auto-crop experiment should be implemented');
  assert.match(labJs, /for \(const mode of \['original', 'contrast'\]\)/, 'Auto-crop experiment should try original then contrast');
}

{
  assert.match(labHtml, /AAMVA Structure &mdash; <span id="liveStructSourceLabel"/, 'Live safe AAMVA structure diagnostics should be source-labeled');
  assert.match(labHtml, /AAMVA Structure &mdash; <span id="photoStructSourceLabel"/, 'Photo safe AAMVA structure diagnostics should be source-labeled');
  assert.match(labHtml, /Last Successful PDF417/, 'Scanner Lab should summarize the last successful PDF417 result');
  assert.match(labHtml, /Session Result Table/, 'Scanner Lab should include a per-source result table');
  assert.match(labHtml, /id="clearAllResultsBtn"/, 'Scanner Lab should provide an explicit Clear All Test Results button');
  assert.match(labJs, /function\s+clearAllTestResults/, 'Clear All should be implemented explicitly');
  assert.match(labJs, /sessionResults\.lastSuccessfulPdf417\s*=\s*null/, 'Clear All should reset the last successful PDF417 result');
  assert.match(labJs, /renderSessionResults/, 'Session result table should be rendered from source result state');
  assert.match(labJs, /renderLastSuccessfulPdf417/, 'Last successful PDF417 summary should be rendered from source result state');
  assert.match(labHtml, /Compliance indicator @/, 'Compliance indicator should be shown safely');
  assert.match(labHtml, /ANSI header/, 'ANSI header presence should be shown safely');
  assert.match(labHtml, /IIN present/, 'IIN presence should be shown safely');
  assert.match(labHtml, /AAMVA version/, 'AAMVA version should be shown safely');
  assert.match(labHtml, /ZXing HRI text available/, 'ZXing HRI text availability should be shown safely');
  assert.match(labHtml, /not used for AAMVA structural parsing/, 'Scanner Lab should warn that HRI text is not canonical AAMVA input');
  assert.match(labHtml, /ZXing raw bytes available/, 'ZXing raw byte availability should be shown safely');
  assert.match(labHtml, /AAMVA parser input/, 'AAMVA parser input source should be displayed');
  assert.match(labHtml, /Raw byte length/, 'Raw byte length should be shown safely');
  assert.match(labHtml, /Byte 0 is @/, 'Raw byte header @ should be shown safely');
  assert.match(labHtml, /Byte 1 is LF/, 'Raw byte header LF should be shown safely');
  assert.match(labHtml, /Byte 2 is RS/, 'Raw byte header RS should be shown safely');
  assert.match(labHtml, /Byte 3 is CR/, 'Raw byte header CR should be shown safely');
  assert.match(labHtml, /Bytes 4-8 equal "ANSI "/, 'Raw ANSI byte header check should be shown safely');
  assert.match(labHtml, /ASCII 0x1C count/, 'Control-character counts should be shown safely');
  assert.match(labHtml, /Literal \\x1e count/, 'Escaped control sequence counts should be shown safely');
  assert.match(labHtml, /Subfile descriptor table parseable/, 'Descriptor table parseability should be shown safely');
  assert.match(labHtml, /Primary AAMVA subfile/, 'Primary AAMVA subfile should be shown safely');
  assert.match(labHtml, /DL descriptor found/, 'DL descriptor status should be shown safely');
  assert.match(labHtml, /EN descriptor found/, 'EN descriptor status should be shown safely');
  assert.match(labHtml, /ID descriptor found/, 'ID descriptor status should be shown safely');
  assert.match(labHtml, /Jurisdiction-specific descriptor/, 'Jurisdiction-specific descriptor status should be shown safely');
  assert.match(labHtml, /Descriptor 1 offset/, 'Descriptor offsets should be shown safely');
  assert.match(labHtml, /Descriptor 1 prefix matches/, 'Descriptor prefix checks should be shown safely');
  assert.match(labHtml, /DL subfile found/, 'DL subfile presence should be shown safely');
  assert.match(labHtml, /EN subfile found/, 'EN subfile presence should be shown safely');
  assert.match(labHtml, /ID subfile found/, 'ID subfile presence should be shown safely');
  assert.match(labHtml, /DCS field tag present/, 'DCS tag presence should be shown safely');
  assert.match(labHtml, /DAC field tag present/, 'DAC tag presence should be shown safely');
  assert.match(labHtml, /DAD field tag present/, 'DAD tag presence should be shown safely');
  assert.match(labHtml, /DBB field tag present/, 'DBB tag presence should be shown safely');
  assert.match(labHtml, /DOB parsed successfully/, 'DOB parsed status should be shown safely');
  assert.match(labHtml, /DAQ field tag present/, 'DAQ tag presence should be shown safely');
  assert.match(labHtml, /Parsed Visitor Fields/, 'Parsed visitor field panel should exist');
  assert.match(labHtml, /Show Parsed Fields/, 'Parsed fields must require an explicit button tap');
  assert.match(labHtml, /Field values stay hidden unless this button is explicitly tapped/, 'Parsed fields should be hidden by default');
  assert.match(labHtml, /Strict parser/, 'Strict parser result should be shown');
  assert.match(labHtml, /Permitted-field recovery/, 'Field recovery result should be shown');
  assert.match(labAamvaDiagJs, /analyzeAamvaPayload/, 'AAMVA structural analyzer should exist');
  assert.match(labAamvaDiagJs, /function\s+resultBytes/, 'AAMVA analyzer should inspect ReadResult.bytes');
  assert.match(labAamvaDiagJs, /function\s+parseHeaderBytes/, 'AAMVA analyzer should parse raw-byte fixed headers');
  assert.match(labAamvaDiagJs, /const HEADER_LENGTH = 21/, 'AAMVA byte parser should use the 21-byte fixed header');
  assert.match(labAamvaDiagJs, /const DESCRIPTOR_LENGTH = 10/, 'AAMVA byte parser should use 10-byte descriptors');
  assert.match(labAamvaDiagJs, /parseDescriptorBytes/, 'AAMVA analyzer should parse raw-byte subfile descriptors');
  assert.match(labAamvaDiagJs, /PRIMARY_SUBFILE_TYPES = \['DL', 'EN', 'ID'\]/, 'AAMVA analyzer should recognize DL, EN, and ID as primary subfiles');
  assert.match(labAamvaDiagJs, /primarySubfileType/, 'AAMVA analyzer should expose primary subfile type');
  assert.match(labAamvaDiagJs, /enDescriptor/, 'AAMVA analyzer should expose EN descriptor status');
  assert.match(labAamvaDiagJs, /jurisdictionSpecificDescriptor/, 'AAMVA analyzer should expose jurisdiction-specific descriptor status');
  assert.match(labAamvaDiagJs, /asciiFromBytes\(bytes,\s*4,\s*5\) === 'ANSI '/, 'AAMVA analyzer should verify ANSI by byte offset');
  assert.match(labAamvaDiagJs, /bytes\.subarray|descriptor\.offset/, 'AAMVA analyzer should apply descriptor offsets to bytes, not strings');
  assert.match(labAamvaDiagJs, /parserSource: 'RAW BYTES'/, 'AAMVA analyzer should mark raw bytes as canonical parser input');
  assert.match(labAamvaDiagJs, /HRI text not used for AAMVA structural parsing/, 'AAMVA analyzer should reject HRI-only ZXing diagnostics');
  assert.match(labAamvaDiagJs, /strictParserPass/, 'AAMVA analyzer should expose strict parser result');
  assert.match(labAamvaDiagJs, /fieldRecoveryPass/, 'AAMVA analyzer should expose field recovery result');
  assert.match(labAamvaDiagJs, /controlCounts/, 'AAMVA analyzer should expose safe control-character counts');
  assert.match(labAamvaDiagJs, /escapedControlCounts/, 'AAMVA analyzer should detect escaped control sequences safely');
  assert.match(labAamvaDiagJs, /zxingShape/, 'AAMVA analyzer should report text/raw-byte availability safely');
  assert.match(labAamvaDiagJs, /parseDescriptor/, 'AAMVA analyzer should parse subfile descriptors');
  assert.match(labAamvaDiagJs, /prefixMatches/, 'AAMVA analyzer should validate descriptor offset prefixes');
  assert.match(labAamvaDiagJs, /recordSeparator:\s*header\.rawHeaderRs/, 'AAMVA analyzer should preserve/check byte record separators');
  assert.match(labAamvaDiagJs, /segmentTerminator:\s*header\.rawHeaderCr/, 'AAMVA analyzer should preserve/check byte segment terminators');
  assert.match(labAamvaDiagJs, /lineFeedSeparators:\s*header\.rawHeaderLf/, 'AAMVA analyzer should preserve/check byte line-feed separators');
  assert.match(labAamvaDiagJs, /normalizeDob/, 'AAMVA analyzer should normalize DBB dates');
  assert.match(labAamvaDiagJs, /Subfile descriptor table invalid/, 'AAMVA analyzer should provide safe parser failure reasons');
}

{
  assert.match(labHtml, /id="showDecodedText"/, 'Raw decoded text should be explicitly opt-in');
  assert.doesNotMatch(labHtml, /id="showDecodedText"[^>]+checked/, 'Decoded text checkbox should default OFF');
  assert.match(labJs, /live\.lastRaw\s*=\s*''/, 'Raw decoded text should be clearable from memory');
  const reportSection = sectionBetween(labJs, 'function buildDiagnosticReport()', 'async function copyDiagnosticReport()');
  assert.match(reportSection, /const last = sessionResults\.lastSuccessfulPdf417/, 'Copied report should read from lastSuccessfulPdf417');
  assert.match(reportSection, /const diagnostic = last\?\.aamva \|\| \{\}/, 'Copied report should use the same result-owned AAMVA object');
  assert.doesNotMatch(reportSection, /live\.lastAamvaDiagnostic \|\| photo\.lastAamvaDiagnostic/, 'Copied report must not use stale shared/global AAMVA diagnostics');
  assert.match(reportSection, /CURRENT LIVE STATE/, 'Diagnostic report should include a current live state section');
  assert.match(reportSection, /LAST SUCCESSFUL PDF417 RESULT/, 'Diagnostic report should include a last successful PDF417 section');
  assert.match(reportSection, /SOURCE RESULT TABLE/, 'Diagnostic report should include per-source result status');
  assert.match(reportSection, /safePageUrl\(\)/, 'Diagnostic report should avoid copying URL query/hash content');
  assert.match(reportSection, /Last active camera dimensions/, 'Diagnostic report should preserve last active camera dimensions');
  assert.match(reportSection, /Self-test success/, 'Diagnostic report should include self-test status');
  assert.match(reportSection, /Live PDF417 total successes/, 'Diagnostic report should include live PDF417 total successes');
  assert.match(reportSection, /Live matching PDF417 reads/, 'Diagnostic report should include live matching PDF417 reads');
  assert.match(reportSection, /Live AAMVA successes/, 'Diagnostic report should include live AAMVA successes');
  assert.match(reportSection, /Live matching AAMVA reads/, 'Diagnostic report should include live matching AAMVA reads');
  assert.match(reportSection, /Test Target/, 'Diagnostic report should include selected test target');
  assert.match(reportSection, /Manual crop mapping valid/, 'Diagnostic report should include crop mapping validity');
  assert.match(reportSection, /Natural image dimensions/, 'Diagnostic report should include natural image dimensions');
  assert.match(reportSection, /Rendered image dimensions/, 'Diagnostic report should include rendered image dimensions');
  assert.match(reportSection, /Mapped crop dimensions/, 'Diagnostic report should include mapped crop dimensions');
  assert.match(reportSection, /Direct photo result/, 'Diagnostic report should include direct File status');
  assert.match(reportSection, /All-formats result/, 'Diagnostic report should include all-formats status');
  assert.match(reportSection, /Manual crop result/, 'Diagnostic report should include manual crop status');
  assert.match(reportSection, /Auto-crop result/, 'Diagnostic report should include auto-crop status');
  assert.match(reportSection, /Physical PDF417 decoded/, 'Diagnostic report should include physical PDF417 status');
  assert.match(reportSection, /Source:/, 'Diagnostic report should include successful source');
  assert.match(reportSection, /Processing:/, 'Diagnostic report should include successful processing');
  assert.match(reportSection, /AAMVA header indicator/, 'Diagnostic report should include safe AAMVA header indicator');
  assert.match(reportSection, /AAMVA compliance indicator/, 'Diagnostic report should include safe compliance indicator');
  assert.match(reportSection, /ANSI header/, 'Diagnostic report should include safe ANSI header status');
  assert.match(reportSection, /IIN present/, 'Diagnostic report should include safe IIN status');
  assert.match(reportSection, /AAMVA version/, 'Diagnostic report should include AAMVA version only');
  assert.match(reportSection, /Jurisdiction version/, 'Diagnostic report should include jurisdiction version only');
  assert.match(reportSection, /Primary subfile type/, 'Diagnostic report should include primary subfile type');
  assert.match(reportSection, /DL descriptor/, 'Diagnostic report should include DL descriptor status');
  assert.match(reportSection, /EN descriptor/, 'Diagnostic report should include EN descriptor status');
  assert.match(reportSection, /ID descriptor/, 'Diagnostic report should include ID descriptor status');
  assert.match(reportSection, /Jurisdiction-specific descriptor/, 'Diagnostic report should include jurisdiction-specific descriptor status');
  assert.match(reportSection, /DL subfile found/, 'Diagnostic report should include DL subfile status');
  assert.match(reportSection, /EN subfile found/, 'Diagnostic report should include EN subfile status');
  assert.match(reportSection, /ID subfile found/, 'Diagnostic report should include ID subfile status');
  assert.match(reportSection, /DCS tag present/, 'Diagnostic report should include DCS tag status');
  assert.match(reportSection, /DAC tag present/, 'Diagnostic report should include DAC tag status');
  assert.match(reportSection, /DAD tag present/, 'Diagnostic report should include DAD tag status');
  assert.match(reportSection, /DBB tag present/, 'Diagnostic report should include DBB tag status');
  assert.match(reportSection, /DOB parsed successfully/, 'Diagnostic report should include safe DOB parsed status');
  assert.match(reportSection, /ZXing HRI text available/, 'Diagnostic report should include HRI text availability only');
  assert.match(reportSection, /HRI text is not used for AAMVA structural parsing/, 'Diagnostic report should identify HRI as non-canonical');
  assert.match(reportSection, /ZXing raw bytes available/, 'Diagnostic report should include raw byte availability only');
  assert.match(reportSection, /Raw bytes available/, 'Diagnostic report should include canonical raw byte availability');
  assert.match(reportSection, /Raw byte length/, 'Diagnostic report should include safe raw byte length');
  assert.match(reportSection, /Raw header @/, 'Diagnostic report should include safe raw @ check');
  assert.match(reportSection, /Raw header LF/, 'Diagnostic report should include safe raw LF check');
  assert.match(reportSection, /Raw header RS/, 'Diagnostic report should include safe raw RS check');
  assert.match(reportSection, /Raw header CR/, 'Diagnostic report should include safe raw CR check');
  assert.match(reportSection, /Raw header ANSI/, 'Diagnostic report should include safe raw ANSI check');
  assert.match(reportSection, /Parser source/, 'Diagnostic report should include canonical parser source');
  assert.match(reportSection, /ASCII 0x1C count/, 'Diagnostic report should include safe control-character counts');
  assert.match(reportSection, /ASCII 0x1D count/, 'Diagnostic report should include safe control-character counts');
  assert.match(reportSection, /ASCII 0x1E count/, 'Diagnostic report should include safe control-character counts');
  assert.match(reportSection, /CR 0x0D count/, 'Diagnostic report should include CR count');
  assert.match(reportSection, /LF 0x0A count/, 'Diagnostic report should include LF count');
  assert.match(reportSection, /Literal escaped RS hex count/, 'Diagnostic report should include escaped-control counts');
  assert.match(reportSection, /Starts with @/, 'Diagnostic report should include safe prefix structure');
  assert.match(reportSection, /Contains ANSI marker/, 'Diagnostic report should include safe ANSI position context');
  assert.match(reportSection, /Subfile count from header/, 'Diagnostic report should include subfile count');
  assert.match(reportSection, /Subfile descriptor table parseable/, 'Diagnostic report should include descriptor table status');
  assert.match(reportSection, /Descriptor 1 type/, 'Diagnostic report should include safe descriptor type');
  assert.match(reportSection, /Descriptor 1 offset/, 'Diagnostic report should include safe descriptor offset');
  assert.match(reportSection, /Descriptor 1 length/, 'Diagnostic report should include safe descriptor length');
  assert.match(reportSection, /Descriptor 1 prefix matches/, 'Diagnostic report should include safe descriptor prefix status');
  assert.match(reportSection, /Strict parser/, 'Diagnostic report should include strict parser status');
  assert.match(reportSection, /Field recovery/, 'Diagnostic report should include field recovery status');
  assert.match(reportSection, /Safe parser failure reason/, 'Diagnostic report should include safe parser failure reason');
  assert.match(reportSection, /Requested camera resolution/, 'Diagnostic report should include requested camera resolution');
  assert.match(reportSection, /Actual camera resolution/, 'Diagnostic report should include actual camera resolution');
  assert.match(reportSection, /Guide decoder dimensions/, 'Diagnostic report should include guide decoder dimensions');
  [
    /lastRaw/,
    /decodedText[`'"]/,
    /SELFTEST_TEXT/,
    /First Name/,
    /Last Name/,
    /Middle Name/,
    /date_of_birth/,
    /visitor_first_name/,
    /visitor_last_name/,
    /result\.bytes/,
    /JSON\.stringify\(diagnostic\)/
  ].forEach((pattern) => assert.doesNotMatch(reportSection, pattern, `Diagnostic report must not include PII/raw data: ${pattern}`));
  const parsedSection = sectionBetween(labJs, 'function renderParsed', 'function showParsedFields');
  assert.match(parsedSection, /if \(!parsedFieldsVisible\)/, 'Parsed values should stay hidden until explicitly requested');
  assert.doesNotMatch(reportSection, /parsedFieldsVisible|showParsedFields|photoFirstName|liveFirstName/, 'Copied report must not include parsed visitor field UI state');
}

{
  assert.match(labJs, /window\.addEventListener\('pagehide'/, 'Scanner Lab should stop cameras on pagehide');
  assert.match(labJs, /window\.addEventListener\('beforeunload'/, 'Scanner Lab should stop cameras before unload');
  assert.match(labJs, /function\s+stopAll/, 'Scanner Lab should centralize cleanup');
  assert.match(labJs, /track\.stop\(\)/, 'Scanner Lab should stop MediaStream tracks');
  assert.match(labJs, /cancelVideoFrameCallback/, 'Scanner Lab should cancel frame callbacks');
  assert.match(labJs, /video\.srcObject\s*=\s*null/, 'Scanner Lab should clear video srcObject');
}

{
  const sampleLike = [
    'NYC IDENTIFICATION CARD',
    'ID NUMBER',
    '1234 567890 1234',
    'NAME',
    'SAMPLE',
    'WENDY, S',
    'ISSUANCE DATE',
    '03/11/2025',
    'EXPIRATION DATE',
    '03/11/2030',
    'DATE OF BIRTH',
    '12/24/2001',
    'ADDRESS'
  ].join('\n');
  const parsed = IdnycDiag.analyze(sampleLike);
  assert.equal(parsed.ok, true, 'Lab IDNYC parser should parse the anchored two-line NAME layout');
  assert.equal(parsed.data.visitor_first_name, 'WENDY');
  assert.equal(parsed.data.visitor_middle_name, 'S');
  assert.equal(parsed.data.visitor_last_name, 'SAMPLE');
  assert.equal(parsed.data.date_of_birth, '2001-12-24');
  assert.equal(parsed.diagnostics.nameAnchorFound, true);
  assert.equal(parsed.diagnostics.idNumberLabelSeenAndRejected, true, 'ID NUMBER must never become a visitor name');
  assert.equal(parsed.diagnostics.nameStrategy, 'name_label_two_line');
}

{
  const ocrDamagedDob = IdnycDiag.analyze([
    'NYC IDENTIFICATION CARD',
    'ID NUMBER',
    'NAME',
    'SAMPLE',
    'WENDY S',
    'DATF OF BIRTH',
    'O3 . 16 . 19B8',
    'EXPIRATION DATE',
    '03/16/2031'
  ].join('\n'));
  assert.equal(ocrDamagedDob.ok, true, 'Lab parser should recover a DOB with common OCR substitutions');
  assert.equal(ocrDamagedDob.data.date_of_birth, '1988-03-16');
  assert.equal(ocrDamagedDob.diagnostics.dobAnchorFuzzy, true);
  assert.equal(ocrDamagedDob.diagnostics.dobCandidateCorrected, true);
}

{
  const badLabelOnly = IdnycDiag.analyze('NYC IDENTIFICATION CARD\nID NUMBER\nNAME\nDATE OF BIRTH 12/24/2001');
  assert.equal(badLabelOnly.ok, false, 'Labels alone must not produce a false-success name');
  assert.notEqual(badLabelOnly.data.visitor_first_name, 'ID');
  assert.notEqual(badLabelOnly.data.visitor_last_name, 'NUMBER');
}

{
  assert.match(labHtml, /data-tab="idnyc"/, 'Scanner Lab should expose an IDNYC OCR tab');
  assert.match(labHtml, /id="idnycUploadInput"[^>]+type="file"[^>]+accept="image\/\*"/, 'IDNYC lab should allow existing image upload');
  assert.doesNotMatch(labHtml, /id="idnycUploadInput"[^>]+capture=/, 'Existing-image upload must not force the camera');
  assert.match(labHtml, /id="idnycPhotoInput"[^>]+capture="environment"/, 'IDNYC lab should also allow rear-camera capture');
  assert.match(labJs, /IdScan\.recognizeIdnycImage\(idnyc\.file\)/, 'IDNYC lab production test should call the production OCR adapter');
  assert.match(labJs, /Shared\.parseIdnycOcrText/, 'IDNYC lab should parse OCR through the production parser');
  assert.match(labJs, /forceTesseractIdnyc/, 'IDNYC lab should support a forced-Tesseract comparison');
  assert.match(labHtml, /idnyc_diagnostics\.js/, 'IDNYC Lab should load the lab-only layout-aware parser');
  assert.match(labJs, /IdnycDiag\?\.analyze/, 'IDNYC Lab should compare a lab-only parser against production without changing Visitor parsing');
  assert.match(labHtml, /ID NUMBER label rejected/, 'IDNYC Lab should expose safe label-rejection diagnostics');
  assert.match(labHtml, /id="idnycDiagnosticDelivery"/, 'IDNYC Lab should show whether safe diagnostics reached Visitor Desk');
  assert.match(labJs, /cacheMethod:\s*'none'/, 'Forced Tesseract lab path must disable OCR cache storage');
  assert.match(labJs, /PII\/raw OCR included: NO/, 'Safe IDNYC diagnostics should explicitly exclude PII/raw OCR');
  const safeReportSection = sectionBetween(labJs, 'function buildSafeIdnycReport', 'function updateSafeIdnycReport');
  [
    /visitor_first_name\s*\|\|/,
    /visitor_last_name\s*\|\|/,
    /date_of_birth\s*\|\|/,
    /productionText\s*\}/,
    /tesseractText\s*\}/
  ].forEach((pattern) => assert.doesNotMatch(safeReportSection, pattern, `Safe IDNYC report must not include actual field/OCR values: ${pattern}`));
  assert.match(visitorJs, /IdScan\.createStateIdAutoScanner/, 'Production Visitor state ID scanner should remain intact');
}

{
  const sourceModelSection = sectionBetween(labJs, 'const SOURCE_KEYS = {', 'const photo = {');
  assert.match(sourceModelSection, /liveResult/, 'Live source result should be declared independently');
  assert.match(sourceModelSection, /directPhotoResult/, 'Direct-photo source result should be declared independently');
  assert.match(sourceModelSection, /allFormatsResult/, 'All-formats source result should be declared independently');
  assert.match(sourceModelSection, /autoCropResult/, 'Auto-crop source result should be declared independently');
  assert.match(sourceModelSection, /manualCropResult/, 'Manual-crop source result should be declared independently');
  assert.match(sourceModelSection, /lastSuccessfulPdf417:\s*null/, 'Last successful PDF417 state should start empty');
  const setterSection = sectionBetween(labJs, 'function setSourceResult', 'function sourceResultStatus');
  assert.match(setterSection, /sessionResults\[key\]\s*=\s*result/, 'Source setter should update only the addressed source result');
  assert.match(setterSection, /lastSuccessfulPdf417\s*=\s*result/, 'Successful PDF417 should update lastSuccessfulPdf417');
  assert.match(setterSection, /result\?\.decodedSuccessfully && result\?\.isPdf417/, 'Failed attempts should not replace lastSuccessfulPdf417');
  const liveFailureSection = sectionBetween(labJs, 'if (!hit.candidate) {', 'const payload = String(hit.candidate.text || \'\');');
  assert.match(liveFailureSection, /setSourceResult\('liveResult'/, 'Failed live attempts should update only liveResult');
  assert.doesNotMatch(liveFailureSection, /lastSuccessfulPdf417\s*=/, 'Failed live attempts must not overwrite a successful manual result');
  const manualSection = sectionBetween(labJs, 'async function decodeManualCrop', 'function applyCropPreset');
  assert.match(manualSection, /setSourceResult\('manualCropResult'/, 'Manual crop should store its own result');
  assert.match(manualSection, /renderDecodedResult\('photo', resultState\)/, 'Manual crop panel should render from the manual result object');
  const clearAllSection = sectionBetween(labJs, 'function clearAllTestResults', 'async function imageFileToCanvas');
  assert.match(clearAllSection, /Object\.keys\(SOURCE_KEYS\)/, 'Clear All should reset each source result');
  assert.match(clearAllSection, /lastSuccessfulPdf417\s*=\s*null/, 'Clear All should reset lastSuccessfulPdf417');
}

{
  assert.match(labHtml, /id="barcodeUploadInput"[^>]+type="file"[^>]+accept="image\/\*"/, 'Photo PDF417 should allow existing-image upload');
  assert.doesNotMatch(labHtml, /id="barcodeUploadInput"[^>]+capture=/, 'Existing PDF417 upload must not force camera capture');
  assert.match(labJs, /barcodeUploadInput[^\n]*addEventListener\('change', handlePhotoSelected\)/, 'Uploaded PDF417 images should reuse the existing photo decode path');
}

console.log('scanner_lab_static tests passed');
