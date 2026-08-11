const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const labHtml = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/index.html'), 'utf8');
const labCss = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/scanner-lab.css'), 'utf8');
const labJs = fs.readFileSync(path.resolve(__dirname, '../scanner-lab/scanner-lab.js'), 'utf8');
const adapter = fs.readFileSync(path.resolve(__dirname, '../visitor/id_scan_adapters.js'), 'utf8');
const sw = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8');

function sectionBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return src.slice(start, end);
}

const labSource = [labHtml, labCss, labJs].join('\n');

{
  assert.match(labHtml, /EagleNEST Scanner Lab/);
  assert.match(labHtml, /iPad Camera \+ PDF417 Test/);
  assert.match(labHtml, /Nothing scanned on this page is saved or uploaded/);
  assert.match(labJs, /LAB_BUILD\s*=\s*'2026-08-11-1'/, 'Scanner Lab should expose a visible build string');
}

{
  assert.doesNotMatch(labSource, /fetch\s*\(|XMLHttpRequest|sendBeacon|analytics|gtag|dataLayer/i, 'Scanner Lab must not make backend or analytics calls');
  assert.doesNotMatch(labSource, /workers\.dev|script\.google\.com|\/admin\/|\/visitor\/kiosk|VisitorDeskDO|VISITOR_PHOTOS|R2|GAS_URL|GAS/i, 'Scanner Lab must not call EagleNEST backend systems');
  assert.doesNotMatch(labSource, /localStorage|sessionStorage|indexedDB|caches\.open/i, 'Scanner Lab must not persist scan data locally');
  assert.doesNotMatch(labSource, /console\.log|console\.debug|console\.info/i, 'Scanner Lab must not log decoded payloads');
}

{
  assert.match(sw, /url\.pathname\.includes\('\/scanner-lab\/'\)/, 'Service worker must bypass scanner-lab sources');
  assert.match(sw, /fetch\(req,\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Scanner Lab bypass should fetch normally without service-worker cache');
}

{
  assert.match(labHtml, /\.\.\/visitor\/visitor_shared\.js/, 'Scanner Lab should reuse shared AAMVA parser');
  assert.match(labHtml, /\.\.\/visitor\/id_scan_adapters\.js/, 'Scanner Lab should reuse Visitor PDF417 adapter');
  assert.match(adapter, /new URL\('\.\/',\s*document\.currentScript\.src\)/, 'Adapter assets should resolve relative to the adapter script path');
  assert.match(adapter, /vendor\/zxing-wasm\/\$\{VERSIONS\.zxingWasm\}\/reader\/index\.js/, 'Adapter should load local ZXing JS');
  assert.match(adapter, /vendor\/zxing-wasm\/\$\{VERSIONS\.zxingWasm\}\/reader\/zxing_reader\.wasm/, 'Adapter should load local ZXing WASM');
  assert.match(adapter, /formats:\s*\[\s*'PDF417'\s*\]/, 'PDF417 must be explicitly enabled');
  assert.match(adapter, /function\s+readPdf417Candidates/, 'Lab should have diagnostic access to PDF417 candidates');
  assert.match(adapter, /facingMode:\s*\{\s*ideal:\s*'environment'\s*\}/, 'Rear camera should be requested for scanner tests');
}

{
  assert.match(labJs, /startRearCamera\(\$\(\'liveVideo\'\)\)/, 'Live scanner should use rear-camera video');
  assert.match(labJs, /LIVE_SCAN_INTERVAL_MS\s*=\s*240/, 'Live scanner should throttle decode cadence');
  assert.match(labJs, /decodeBusy/, 'Live scanner should prevent overlapping decode operations');
  assert.match(labJs, /selectedRegionMode/, 'Live scanner should support full-frame vs guide-only regions');
  assert.match(labHtml, /name="regionMode" value="full" checked/, 'Full-frame mode should be available by default');
  assert.match(labHtml, /name="regionMode" value="guide"/, 'Guide-only mode should be available');
  assert.match(labHtml, /name="rotation" value="0" checked/, '0-degree rotation should be enabled by default');
  assert.match(labHtml, /name="rotation" value="90" checked/, '90-degree rotation should be enabled by default');
  assert.match(labHtml, /name="processing" value="original" checked/, 'Original processing should be enabled by default');
  assert.match(labHtml, /name="processing" value="grayscale"/, 'Grayscale test option should exist');
  assert.match(labHtml, /name="processing" value="contrast"/, 'Contrast test option should exist');
  assert.match(labHtml, /name="processing" value="resize2x"/, '2x resize test option should exist');
}

{
  assert.match(labHtml, /id="barcodePhotoInput"[^>]+type="file"[^>]+accept="image\/\*"[^>]+capture="environment"/, 'Photo PDF417 test should use native rear-camera capture fallback');
  assert.match(labJs, /URL\.createObjectURL\(file\)/, 'Photo test should show a temporary object URL preview');
  assert.match(labJs, /URL\.revokeObjectURL/, 'Photo test should revoke temporary object URLs');
  assert.match(labJs, /decodeCanvasWithSelections\(source\)/, 'Photo test should decode with the same local PDF417 path/options');
}

{
  assert.match(labHtml, /id="showDecodedText"/, 'Raw decoded text should be explicitly opt-in');
  assert.doesNotMatch(labHtml, /id="showDecodedText"[^>]+checked/, 'Decoded text checkbox should default OFF');
  assert.match(labJs, /live\.lastRaw\s*=\s*''/, 'Raw decoded text should be clearable from memory');
  const reportSection = sectionBetween(labJs, 'function buildDiagnosticReport()', 'async function copyDiagnosticReport()');
  assert.match(reportSection, /safePageUrl\(\)/, 'Diagnostic report should avoid copying URL query/hash content');
  [
    /lastRaw/,
    /decodedText/,
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
}

console.log('scanner_lab_static tests passed');
