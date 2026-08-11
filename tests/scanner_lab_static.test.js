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
  assert.match(labHtml, /Nothing scanned on this page is saved or uploaded/);
  assert.match(labJs, /LAB_BUILD\s*=\s*'2026-08-11-4'/, 'Scanner Lab should expose Build 4');
}

function syntheticAamva(subfile, fields, header) {
  return [
    '@',
    '\x1e',
    '\r',
    header || `ANSI 636000080102${subfile || 'DL'}00410288`,
    ...fields
  ].join('\n');
}

{
  const raw = syntheticAamva('DL', [
    'DCSDOE',
    'DACJANE',
    'DADQ',
    'DBB01021980',
    'DAQDO-NOT-COPY',
    'DAJNY'
  ]);
  const diag = AamvaDiag.analyzeAamvaPayload(raw);
  assert.equal(diag.complianceIndicator, true);
  assert.equal(diag.ansiHeader, true);
  assert.equal(diag.iinPresent, true);
  assert.equal(diag.aamvaVersion, '8');
  assert.equal(diag.jurisdictionVersion, '1');
  assert.equal(diag.dlSubfile, true);
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
  assert.equal(diag.recoveredData.visitor_first_name, 'JANE');
  assert.equal(diag.recoveredData.visitor_middle_name, 'Q');
  assert.equal(diag.recoveredData.visitor_last_name, 'DOE');
  assert.equal(diag.recoveredData.date_of_birth, '1980-01-02');
}

{
  const raw = syntheticAamva('ID', [
    'DCSROE',
    'DACRICHARD',
    'DBB19800102'
  ]);
  const diag = AamvaDiag.analyzeAamvaPayload(raw);
  assert.equal(diag.idSubfile, true);
  assert.equal(diag.dlSubfile, false);
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.recoveredData.date_of_birth, '1980-01-02');
}

{
  const raw = syntheticAamva('DL', [
    'DCSALT',
    'DCTMORGAN LEE',
    'DBB02031981'
  ], 'ANSI 636000010702DL00410288');
  const diag = AamvaDiag.analyzeAamvaPayload(raw);
  assert.equal(diag.aamvaVersion, '1');
  assert.equal(diag.jurisdictionVersion, '7');
  assert.equal(diag.fieldRecoveryPass, true);
  assert.equal(diag.recoveredData.visitor_first_name, 'MORGAN');
  assert.equal(diag.recoveredData.visitor_middle_name, 'LEE');
  assert.equal(diag.recoveredData.date_of_birth, '1981-02-03');
}

{
  const raw = syntheticAamva('DL', [
    'DCSRECOVER',
    'DACCASEY',
    'DBB01021980'
  ], 'ANSI 636000DL00410288');
  const diag = AamvaDiag.analyzeAamvaPayload(raw);
  assert.equal(diag.ansiHeader, true);
  assert.equal(diag.strictParserPass, false);
  assert.equal(diag.fieldRecoveryPass, true);
}

{
  const diag = AamvaDiag.analyzeAamvaPayload('shipping PDF417 text with DCS and DAC and DBB01021980 but no AAMVA structure');
  assert.equal(diag.aamvaIndicators, false);
  assert.equal(diag.strictParserPass, false);
  assert.equal(diag.fieldRecoveryPass, false);
}

{
  assert.doesNotMatch(labSource, /XMLHttpRequest|sendBeacon|analytics|gtag|dataLayer/i, 'Scanner Lab must not make backend or analytics calls');
  assert.doesNotMatch(labSource, /workers\.dev|script\.google\.com|\/admin\/|\/visitor\/kiosk|VisitorDeskDO|VISITOR_PHOTOS|R2|GAS_URL|GAS/i, 'Scanner Lab must not call EagleNEST backend systems');
  assert.doesNotMatch(labSource, /localStorage|sessionStorage|indexedDB|caches\.open/i, 'Scanner Lab must not persist scan data locally');
  assert.doesNotMatch(labSource, /console\.log|console\.debug|console\.info/i, 'Scanner Lab must not log decoded payloads');
  assert.match(labJs, /fetch\(SELFTEST_FIXTURE,\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Scanner Lab may fetch only its static self-test fixture');
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
  assert.match(labHtml, /Auto-Crop Experiment/, 'Photo test should include bounded auto-crop experiment');
  assert.match(labJs, /Bottom 45%/, 'Auto-crop experiment should include bottom 45 percent preset');
  assert.match(labJs, /Center-lower wide/, 'Auto-crop experiment should include center-lower wide preset');
  assert.match(labJs, /runAutoCropExperiment/, 'Auto-crop experiment should be implemented');
  assert.match(labJs, /for \(const mode of \['original', 'contrast'\]\)/, 'Auto-crop experiment should try original then contrast');
}

{
  assert.match(labHtml, /Live AAMVA Structure/, 'Live safe AAMVA structure diagnostics should exist');
  assert.match(labHtml, /Photo AAMVA Structure/, 'Photo safe AAMVA structure diagnostics should exist');
  assert.match(labHtml, /Compliance indicator @/, 'Compliance indicator should be shown safely');
  assert.match(labHtml, /ANSI header/, 'ANSI header presence should be shown safely');
  assert.match(labHtml, /IIN present/, 'IIN presence should be shown safely');
  assert.match(labHtml, /AAMVA version/, 'AAMVA version should be shown safely');
  assert.match(labHtml, /DL subfile found/, 'DL subfile presence should be shown safely');
  assert.match(labHtml, /ID subfile found/, 'ID subfile presence should be shown safely');
  assert.match(labHtml, /DCS field tag present/, 'DCS tag presence should be shown safely');
  assert.match(labHtml, /DAC field tag present/, 'DAC tag presence should be shown safely');
  assert.match(labHtml, /DAD field tag present/, 'DAD tag presence should be shown safely');
  assert.match(labHtml, /DBB field tag present/, 'DBB tag presence should be shown safely');
  assert.match(labHtml, /DAQ field tag present/, 'DAQ tag presence should be shown safely');
  assert.match(labHtml, /Strict parser/, 'Strict parser result should be shown');
  assert.match(labHtml, /Permitted-field recovery/, 'Field recovery result should be shown');
  assert.match(labAamvaDiagJs, /analyzeAamvaPayload/, 'AAMVA structural analyzer should exist');
  assert.match(labAamvaDiagJs, /strictParserPass/, 'AAMVA analyzer should expose strict parser result');
  assert.match(labAamvaDiagJs, /fieldRecoveryPass/, 'AAMVA analyzer should expose field recovery result');
  assert.match(labAamvaDiagJs, /recordSeparator:\s*\/\\x1e\/\.test\(raw\)/, 'AAMVA analyzer should preserve/check record separators');
  assert.match(labAamvaDiagJs, /segmentTerminator:\s*\/\\r\/\.test\(raw\)/, 'AAMVA analyzer should preserve/check segment terminators');
  assert.match(labAamvaDiagJs, /lineFeedSeparators:\s*\/\\n\/\.test\(raw\)/, 'AAMVA analyzer should preserve/check line-feed separators');
  assert.match(labAamvaDiagJs, /normalizeDob/, 'AAMVA analyzer should normalize DBB dates');
  assert.match(labAamvaDiagJs, /Required field tags found but parser rejected separators/, 'AAMVA analyzer should provide safe parser failure reasons');
}

{
  assert.match(labHtml, /id="showDecodedText"/, 'Raw decoded text should be explicitly opt-in');
  assert.doesNotMatch(labHtml, /id="showDecodedText"[^>]+checked/, 'Decoded text checkbox should default OFF');
  assert.match(labJs, /live\.lastRaw\s*=\s*''/, 'Raw decoded text should be clearable from memory');
  const reportSection = sectionBetween(labJs, 'function buildDiagnosticReport()', 'async function copyDiagnosticReport()');
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
  assert.match(reportSection, /Successful source/, 'Diagnostic report should include successful source');
  assert.match(reportSection, /Successful processing/, 'Diagnostic report should include successful processing');
  assert.match(reportSection, /AAMVA header indicator/, 'Diagnostic report should include safe AAMVA header indicator');
  assert.match(reportSection, /ANSI header/, 'Diagnostic report should include safe ANSI header status');
  assert.match(reportSection, /AAMVA version/, 'Diagnostic report should include AAMVA version only');
  assert.match(reportSection, /DL subfile/, 'Diagnostic report should include DL subfile status');
  assert.match(reportSection, /ID subfile/, 'Diagnostic report should include ID subfile status');
  assert.match(reportSection, /DCS tag/, 'Diagnostic report should include DCS tag status');
  assert.match(reportSection, /DAC tag/, 'Diagnostic report should include DAC tag status');
  assert.match(reportSection, /DAD tag/, 'Diagnostic report should include DAD tag status');
  assert.match(reportSection, /DBB tag/, 'Diagnostic report should include DBB tag status');
  assert.match(reportSection, /Strict parser/, 'Diagnostic report should include strict parser status');
  assert.match(reportSection, /Field recovery/, 'Diagnostic report should include field recovery status');
  assert.match(reportSection, /Safe parser failure reason/, 'Diagnostic report should include safe parser failure reason');
  assert.match(reportSection, /Requested camera resolution/, 'Diagnostic report should include requested camera resolution');
  assert.match(reportSection, /Actual camera resolution/, 'Diagnostic report should include actual camera resolution');
  assert.match(reportSection, /Guide decoder dimensions/, 'Diagnostic report should include guide decoder dimensions');
  [
    /lastRaw/,
    /decodedText/,
    /SELFTEST_TEXT/,
    /First Name/,
    /Last Name/,
    /Middle Name/,
    /\bDOB\b/,
    /date_of_birth/,
    /visitor_first_name/,
    /visitor_last_name/
  ].forEach((pattern) => assert.doesNotMatch(reportSection, pattern, `Diagnostic report must not include PII/raw data: ${pattern}`));
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
  assert.doesNotMatch(labSource, /IDNYC|Tesseract|tesseract|recognizeIdnycImage|TextDetector OCR/i, 'Scanner Lab should not add IDNYC/Tesseract OCR in this pass');
  assert.match(visitorJs, /IdScan\.createStateIdAutoScanner/, 'Production Visitor state ID scanner should remain intact');
}

console.log('scanner_lab_static tests passed');
