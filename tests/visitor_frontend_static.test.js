const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desk = fs.readFileSync(path.resolve(__dirname, '../admin/visitor_desk.js'), 'utf8');
const deskHtml = fs.readFileSync(path.resolve(__dirname, '../admin/visitor_desk.html'), 'utf8');
const deskCss = fs.readFileSync(path.resolve(__dirname, '../admin/visitor_desk.css'), 'utf8');
const kiosk = fs.readFileSync(path.resolve(__dirname, '../visitor/visitor.js'), 'utf8');
const kioskHtml = fs.readFileSync(path.resolve(__dirname, '../visitor/index.html'), 'utf8');
const kioskCss = fs.readFileSync(path.resolve(__dirname, '../visitor/visitor.css'), 'utf8');
const shared = fs.readFileSync(path.resolve(__dirname, '../visitor/visitor_shared.js'), 'utf8');

function sectionBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return src.slice(start, end);
}

{
  const visitorUi = [desk, deskHtml, kiosk, kioskHtml, shared].join('\n');
  [
    /student_pickup/,
    /Student Pickup/,
    /Complete Student Pickup/,
    /Link Student/,
    /studentDialog/,
    /studentSearch/,
    /student_name/,
    /student_osis/
  ].forEach((pattern) => assert.doesNotMatch(visitorUi, pattern, `Visitor UI must not expose ${pattern}`));
}

{
  const badgeSection = sectionBetween(desk, 'async function printBadge', 'async function checkoutVisit');
  assert.match(desk, /function\s+badgeVisitLine\s*\(/, 'Visitor Desk should centralize badge visit-line logic');
  assert.doesNotMatch(
    desk,
    /if\s*\(\s*v\?\.purpose\s*===\s*'student_pickup'/,
    'Badge code must not carry Student Pickup special cases'
  );
  assert.match(badgeSection, /@page\{size:2\.4in 3\.9in;margin:0\}/, 'Badge print CSS must use 2.4in x 3.9in');
  assert.match(badgeSection, /class="photo"/, 'Badge rendering should include a photo area');
  assert.match(badgeSection, /Shared\.makeQrSvg\(`ENVISIT:\$\{v\.badge_checkout_token\}`/, 'Badge QR must remain ENVISIT token based');
  assert.doesNotMatch(badgeSection, /makeQrSvg\([^)]*photo_id|makeQrSvg\([^)]*photoId/, 'Badge QR must not include photo metadata');
}

{
  const idScannerSection = sectionBetween(
    desk,
    'const idScanner = Shared.createScannerBuffer',
    'async function saveIdVerification'
  );
  assert.match(idScannerSection, /multiline:\s*true/, 'ID scanner should use multiline quiet-time buffering');
  assert.match(idScannerSection, /settleMs\s*:/, 'ID scanner should configure settleMs');
  assert.match(idScannerSection, /minLength\s*:/, 'ID scanner should configure minLength');
  assert.doesNotMatch(
    idScannerSection,
    /Shared\.createScannerBuffer\([\s\S]*\},\s*\{\s*minLength:\s*40\s*\}\s*\)\s*;/,
    'ID scanner must not remain single-line with only minLength: 40'
  );

  const saveIdSection = sectionBetween(desk, 'async function saveIdVerification', 'function resetStaffPhotoCapture');
  const editCallIndex = saveIdSection.indexOf("await api('/admin/visitor/edit'");
  assert.notEqual(editCallIndex, -1, 'missing visitor edit API call');
  const editCallEnd = saveIdSection.indexOf('});', editCallIndex);
  assert.notEqual(editCallEnd, -1, 'visitor edit API call should close normally');
  const editCallSection = saveIdSection.slice(editCallIndex, editCallEnd + 3);
  assert.doesNotMatch(editCallSection, /multiline|settleMs|minLength/, 'scanner configuration must not be passed to api()');
}

{
  const checkoutScannerSection = sectionBetween(desk, 'const checkoutScanner = Shared.createScannerBuffer', 'const idScannerKeydown');
  assert.doesNotMatch(checkoutScannerSection, /multiline:\s*true/, 'QR checkout scanner should remain single-line');
  assert.match(checkoutScannerSection, /minLength:\s*32/, 'QR checkout scanner should retain QR min length');
}

{
  assert.match(kioskHtml, /id="photoScreen"/, 'Kiosk should include visitor photo step');
  assert.match(kioskHtml, /id="reviewScreen"/, 'Kiosk should include review step');
  assert.match(kioskHtml, /id="cameraFrame"[^>]+data-photo-state="live"/, 'Kiosk camera frame should expose live/review photo state');
  assert.match(kioskHtml, /id="cameraPreview"[^>]+class="mirrorSelfie"/, 'Kiosk live camera preview should be mirrored');
  assert.match(kioskHtml, /id="photoPreview"[^>]+class="mirrorSelfie"/, 'Kiosk captured-photo review should be mirrored for the visitor');
  assert.match(kioskCss, /\.mirrorSelfie\s*\{[\s\S]*transform:\s*scaleX\(-1\)/, 'Kiosk mirror class should flip visitor-facing preview/review');
  assert.match(kioskCss, /\.reviewPhoto\s*\{[\s\S]*transform:\s*scaleX\(-1\)/, 'Kiosk submit review photo should match mirrored visitor preview');
  assert.match(kioskCss, /\.cameraFrame\[data-photo-state="review"\]\s+\.faceGuide\s*\{[\s\S]*display:\s*none/, 'Photo guide should hide in captured review state');
  assert.match(kiosk, /function\s+setPhotoCaptureState\s*\(state\)/, 'Kiosk should have a distinct live/review photo state helper');
  const takePhotoSection = sectionBetween(kiosk, 'async function takePhoto', 'async function retakePhoto');
  assert.match(takePhotoSection, /setPhotoCaptureState\('review'\)/, 'Taking a photo should switch to captured-photo review state');
  assert.match(takePhotoSection, /stopCamera\(\)/, 'Taking a photo should stop the live camera stream after capture');
  const retakeSection = sectionBetween(kiosk, 'async function retakePhoto', 'function usePhoto');
  assert.match(retakeSection, /clearPhoto\(\)/, 'Retake should clear the prior captured photo/blob state');
  assert.match(retakeSection, /startCamera\(\)/, 'Retake should return to live camera preview');
  assert.match(kiosk, /getUserMedia\(\{[\s\S]*facingMode:\s*'user'/, 'Kiosk should request visitor-facing camera');
  assert.match(kiosk, /Shared\.capturePortraitPhoto/, 'Kiosk should use shared local crop/compression');
  assert.match(kiosk, /URL\.revokeObjectURL/, 'Kiosk retake/reset should revoke temporary photo URLs');
  assert.match(kiosk, /track\.stop\(\)/, 'Kiosk should stop camera tracks');
  assert.match(kiosk, /\/visitor\/kiosk\/photo/, 'Kiosk should upload photo through limited kiosk endpoint');
  assert.match(kiosk, /A current visitor photo is securely stored for up to 30 days/, 'English kiosk privacy notice must disclose visitor photo retention');
  assert.match(kiosk, /Una foto actual del visitante se guarda de forma segura por hasta 30 días/, 'Spanish kiosk privacy notice must disclose visitor photo retention');
  assert.doesNotMatch(kiosk, /data:image|base64/i, 'Kiosk should not persist/send Base64 photo data');
}

{
  assert.match(deskHtml, /id="waitingSection"/, 'Visitor Desk should identify the Waiting Queue section for collapse');
  assert.match(deskHtml, /class="visitorSections"/, 'Visitor Desk queue/active sections should use full-width stacked layout');
  assert.match(deskHtml, /<h2>Currently in Building<\/h2>/, 'Visitor Desk should keep Currently In Building section');
  assert.match(deskCss, /\.visitorSections\s*\{[\s\S]*grid-template-columns:\s*1fr/, 'Visitor Desk sections should be single-column full-width');
  assert.doesNotMatch(deskHtml, /class="grid twoCols"/, 'Visitor Desk should not render waiting/active sections side-by-side');
  const renderStateSection = sectionBetween(desk, 'function renderState()', 'function renderSyncHealth()');
  assert.match(renderStateSection, /waitingSection\.hidden\s*=\s*waiting\.length\s*===\s*0/, 'Waiting Queue section should hide when empty');
  assert.match(renderStateSection, /waiting\.length\s*\?\s*waiting\.map\(waitingRow\)\.join\(''\)\s*:\s*''/, 'Waiting Queue table should reappear only when there are waiting visitors');
  assert.match(renderStateSection, /activeBody\.innerHTML/, 'Currently In Building rendering must remain');
}

{
  assert.match(deskHtml, /id="photoDialog"/, 'Visitor Desk should include staff photo dialog');
  assert.match(desk, /photo_id=\$\{encodeURIComponent\(photoId\)\}/, 'Visitor Desk should read photos by opaque photo_id when available');
  assert.match(desk, /\/admin\/visitor\/photo\?visit_id=/, 'Visitor Desk should keep visit_id photo upload path');
  assert.match(desk, /\/admin\/visitor\/photo_override/, 'Visitor Desk should support audited no-photo override');
  assert.match(desk, /fetchPhotoBlob/, 'Visitor Desk should load photos via authenticated fetch');
  assert.doesNotMatch(desk, /https?:\/\/[^'"]*visitor-photos|r2\.dev|public R2/i, 'Visitor Desk must not embed public R2 URLs');
}

console.log('visitor_frontend_static tests passed');
