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
const idScan = fs.readFileSync(path.resolve(__dirname, '../visitor/id_scan_adapters.js'), 'utf8');
const kioskManifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../visitor/manifest.webmanifest'), 'utf8'));

function sectionBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return src.slice(start, end);
}

{
  assert.equal(kioskManifest.name, 'EagleNEST Visitor', 'Visitor kiosk should have its own installable app name');
  assert.equal(kioskManifest.start_url, '/student-scanner/visitor/', 'Visitor app should launch directly into the visitor kiosk');
  assert.equal(kioskManifest.scope, '/student-scanner/visitor/', 'Visitor app should be scoped to visitor routes only');
  assert.equal(kioskManifest.display, 'standalone', 'Visitor app should launch without normal Safari browser chrome');
  assert.equal(kioskManifest.orientation, 'portrait', 'Visitor kiosk should prefer portrait orientation on iPad');
  assert.match(kioskHtml, /rel="manifest"\s+href="\.\/manifest\.webmanifest"/, 'Visitor kiosk should link its dedicated manifest');
  assert.match(kioskHtml, /name="apple-mobile-web-app-capable"\s+content="yes"/, 'Visitor kiosk should opt into iOS Home Screen app mode');
  assert.match(kioskHtml, /name="apple-mobile-web-app-title"\s+content="EagleNEST Visitor"/, 'Visitor kiosk should have a dedicated iOS app title');
  assert.match(kiosk, /navigator\.wakeLock\.request\('screen'\)/, 'Visitor kiosk should request a screen wake lock when supported');
  assert.match(kiosk, /visibilitychange/, 'Visitor kiosk should reacquire wake lock after returning to the foreground');
  assert.match(kiosk, /releaseScreenWakeLock\(\)/, 'Visitor kiosk should release wake lock on page exit');
}

{
  const visitorUi = [desk, deskHtml, kiosk, kioskHtml, shared, idScan].join('\n');
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
  assert.doesNotMatch(badgeSection, /date_of_birth|Date of Birth|DOB/, 'Badge must not print date of birth');
  const returningBadgeSection = sectionBetween(desk, 'async function printReturningPass', 'async function checkoutVisit');
  assert.match(returningBadgeSection, /ENVISITOR:/, 'Returning parent badge should use ENVISITOR reusable QR payloads');
  assert.match(returningBadgeSection, /@page\{size:2\.4in 3\.9in;margin:0\}/, 'Returning parent badge must preserve 2.4in x 3.9in print size');
  assert.doesNotMatch(returningBadgeSection, /date_of_birth|Date of Birth|DOB|qrText\}/, 'Returning parent badge must not print DOB or plaintext token text outside QR');
  assert.doesNotMatch(returningBadgeSection, /profile_id/, 'Returning parent badge must not print internal profile IDs');
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
  assert.match(kioskHtml, /name="date_of_birth"[^>]+type="date"[^>]+required/, 'Kiosk should require date of birth');
  assert.match(kioskHtml, /id="idPrefillToggleBtn"[^>]+aria-expanded="false"/, 'Initial kiosk DOM should show only the explicit Use ID to Fill Form action');
  assert.match(kioskHtml, /id="returningBadgeBtn"/, 'Initial kiosk DOM should offer Scan Previous Badge');
  assert.match(kioskHtml, /id="idPrefillActions"[^>]+hidden/, 'Initial kiosk DOM should hide State ID/IDNYC choices until Use ID is pressed');
  assert.match(kioskHtml, /id="stateIdPrefillBtn"/, 'Kiosk should offer state ID prefill');
  assert.match(kioskHtml, /id="idnycPrefillBtn"/, 'Kiosk should offer IDNYC prefill');
  assert.match(kioskHtml, /id="stateIdScanPanel"[^>]+data-id-entry-mode="manual"[^>]+hidden/, 'Initial kiosk DOM should hide the State ID scanner panel with no flash');
  assert.match(kioskHtml, /id="returningBadgeActions"[^>]+hidden/, 'Initial kiosk DOM should hide returning badge checkout controls');
  assert.match(kioskHtml, /id="idScanVideo"[^>]+autoplay[^>]+playsinline[^>]+muted/, 'ID prefill should use a live rear-camera video scanner');
  assert.match(kioskHtml, /id="idScanGuide"/, 'ID prefill should show a scanner guide');
  assert.match(kioskHtml, /id="idScanPhotoFallbackBtn"/, 'ID prefill should offer native camera photo fallback');
  assert.match(kioskHtml, /id="idnycCaptureInput"[^>]+capture="environment"/, 'IDNYC capture should use environment camera');
  assert.match(kioskHtml, /id="stateIdPhotoInput"[^>]+capture="environment"/, 'State ID fallback capture should use environment camera');
  assert.match(kioskHtml, /name="returning_opt_in"[^>]+type="checkbox"/, 'Returning Parent opt-in should be a real unchecked form checkbox');
  assert.match(kioskHtml, /id_scan_adapters\.js/, 'Kiosk should load the local ID scan adapter');
  assert.match(kioskHtml, /id="visitorPhotoInput"[^>]+type="file"[^>]+accept="image\/\*"[^>]+capture="environment"/, 'Kiosk visitor photo should use native rear-camera file capture');
  assert.match(kioskHtml, /id="cameraFrame"[^>]+data-photo-state="live"/, 'Kiosk camera frame should expose live/review photo state');
  assert.match(kioskHtml, /class="photoSilhouette"/, 'Kiosk photo step should include a silhouette overlay for visitor positioning');
  assert.match(kioskHtml, /id="cameraPreview"[^>]+class="mirrorSelfie"/, 'Optional live camera preview should remain mirrored if used');
  assert.match(kioskHtml, /id="photoPreview"[^>]+class="photoReview"/, 'Native captured-photo review should not blindly use live-preview mirroring');
  assert.match(kioskCss, /\.mirrorSelfie\s*\{[\s\S]*transform:\s*scaleX\(-1\)/, 'Kiosk mirror class should remain scoped to live selfie preview');
  assert.match(kioskCss, /\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important/, 'Hidden scanner panels must be hidden by CSS before JavaScript initializes');
  const reviewPhotoCss = sectionBetween(kioskCss, '.reviewPhoto', '.reviewDetails');
  assert.doesNotMatch(reviewPhotoCss, /scaleX|transform/i, 'Kiosk final review should show native captured image in natural orientation');
  const photoStateCss = sectionBetween(kioskCss, '.photoSilhouette', '.cameraActions');
  assert.match(photoStateCss, /\.cameraFrame\[data-photo-state="review"\]\s+\.photoSilhouette/, 'Photo silhouette should hide in captured review state');
  assert.match(photoStateCss, /\.cameraFrame\[data-photo-state="review"\]\s+\.faceGuide/, 'Photo guide should be included in captured review hide selector');
  assert.match(photoStateCss, /display:\s*none/, 'Photo silhouette and guide should hide in captured review state');
  assert.match(kioskCss, /\.invalidField/, 'Kiosk should have a red invalid required-field style');
  assert.match(kioskCss, /aria-live="polite"|validationSummary/, 'Kiosk validation summary should be present');
  assert.match(kiosk, /function\s+setPhotoCaptureState\s*\(state\)/, 'Kiosk should have a distinct live/review photo state helper');
  assert.match(kiosk, /photoCaptureFailed:\s*'Photo could not be captured\. Please try again\.'/, 'Kiosk should show a friendly English capture failure');
  assert.match(kiosk, /photoCaptureFailed:\s*'No se pudo tomar la foto\. Inténtelo de nuevo\.'/, 'Kiosk should show a friendly Spanish capture failure');
  assert.match(kiosk, /photoCaptureBad:\s*'Photo could not be captured correctly\. Please retake the photo\.'/, 'Kiosk should reject obviously black capture output');
  assert.doesNotMatch(kiosk, /navigator\.mediaDevices|getUserMedia|waitForUsableCameraFrame|capturePortraitPhoto\(cameraPreview/, 'Public kiosk primary iPad path must not capture stills from video frames');
  assert.match(kiosk, /function\s+waitForPhotoPreviewImage\s*\(url\)/, 'Kiosk should verify the captured review image loads');
  const takePhotoSection = sectionBetween(kiosk, 'function takePhoto()', 'async function retakePhoto');
  assert.match(takePhotoSection, /nativePhotoInput\.click\(\)/, 'Take Photo should invoke native file/camera capture');
  assert.doesNotMatch(takePhotoSection, /drawImage|capturePortraitPhoto|getUserMedia|cameraPreview/, 'Take Photo should not read from a video frame');
  const selectedSection = sectionBetween(kiosk, 'async function handleNativePhotoSelected', 'function usePhoto');
  assert.match(selectedSection, /Shared\.processVisitorPhotoFile\(file/, 'Kiosk should process the returned native image File/Blob');
  assert.match(selectedSection, /URL\.createObjectURL\(blob\)/, 'Kiosk should review the processed JPEG Blob');
  assert.match(selectedSection, /waitForPhotoPreviewImage\(nextUrl\)/, 'Kiosk should ensure the review image is displayable');
  assert.match(selectedSection, /setPhotoCaptureState\('review'\)/, 'Processed native photo should switch to captured-photo review state');
  assert.match(selectedSection, /photo_black_frame/, 'Kiosk should reject obvious black capture output');
  const retakeSection = sectionBetween(kiosk, 'async function retakePhoto', 'function usePhoto');
  assert.match(retakeSection, /clearPhoto\(\)/, 'Retake should clear the prior captured photo/blob state');
  assert.match(retakeSection, /takePhoto\(\)/, 'Retake should invoke native capture again');
  const clearPhotoSection = sectionBetween(kiosk, 'function clearPhoto()', 'function resetForm()');
  assert.match(clearPhotoSection, /photoBlob\s*=\s*null/, 'Clearing photo should discard prior captured Blob state');
  assert.match(clearPhotoSection, /revokePhotoUrl\(\)/, 'Clearing photo should revoke prior object URL');
  assert.match(clearPhotoSection, /setPhotoCaptureState\('live'\)/, 'Clearing photo should return UI to live preview state');
  const usePhotoSection = sectionBetween(kiosk, 'function usePhoto()', 'function handleKioskAuthFailure');
  assert.match(usePhotoSection, /if\s*\(!photoBlob\)/, 'Use Photo should require the existing captured Blob');
  assert.doesNotMatch(usePhotoSection, /capturePortraitPhoto|getUserMedia|cameraPreview/, 'Use Photo must not recapture from a stopped video stream');
  assert.match(kiosk, /date_of_birth:\s*Shared\.normalizeDateOfBirth/, 'Kiosk should normalize DOB into payload');
  assert.match(kiosk, /dobFuture/, 'Kiosk should reject future DOB');
  assert.match(kiosk, /aria-invalid/, 'Kiosk should mark invalid fields accessibly');
  assert.match(kiosk, /scrollIntoView\(\{ behavior:\s*'smooth'/, 'Kiosk should scroll to first invalid field');
  assert.match(kiosk, /let\s+idEntryMode\s*=\s*'manual'/, 'Kiosk should begin in explicit manual ID-entry mode');
  assert.match(kiosk, /function\s+setIdEntryMode\s*\(mode\)/, 'Kiosk should centralize ID-entry mode visibility');
  const setIdEntryModeSection = sectionBetween(kiosk, 'function setIdEntryMode(mode)', 'function showIdChoice');
  assert.match(setIdEntryModeSection, /nextMode\s*!==\s*'id_choice'/, 'ID type choices should only appear in id_choice mode');
  assert.match(setIdEntryModeSection, /'returning_badge'/, 'Returning badge should be an explicit mutually exclusive scanner mode');
  assert.match(setIdEntryModeSection, /nextMode\s*===\s*'state_id'\s*\|\|\s*nextMode\s*===\s*'idnyc'\s*\|\|\s*nextMode\s*===\s*'returning_badge'/, 'Scanner panel should be visible only in explicit scanner modes');
  assert.match(setIdEntryModeSection, /stateIdScanPanel\.hidden\s*=\s*!scanVisible/, 'Scanner panel should hide outside explicit scanner modes');
  assert.match(setIdEntryModeSection, /clearIdScanTransientState\(\)/, 'Leaving scanner modes should clear transient scanner UI state');
  assert.match(setIdEntryModeSection, /returningBadgeActions[\s\S]*hidden\s*=\s*true/, 'Leaving returning badge mode should hide checkout controls');
  const showIdChoiceSection = sectionBetween(kiosk, 'function showIdChoice()', 'function setIdScanFallbacks');
  assert.match(showIdChoiceSection, /setIdEntryMode\('id_choice'\)/, 'Use ID to Fill Form should show only ID type choices');
  assert.doesNotMatch(showIdChoiceSection, /configureIdScanPanel|createStateIdAutoScanner|idScanSession\.start|stateIdScanPanel\.hidden\s*=\s*false/, 'Use ID to Fill Form alone must not show or initialize the State ID scanner');
  const bootSection = sectionBetween(kiosk, 'function boot()', "window.addEventListener('DOMContentLoaded', boot);");
  assert.match(bootSection, /idPrefillToggleBtn\?\.addEventListener\('click',\s*showIdChoice\)/, 'Use ID action should enter ID choice mode');
  assert.match(bootSection, /setIdEntryMode\('manual'\)/, 'Kiosk boot should reset to manual ID-entry mode');
  assert.doesNotMatch(bootSection, /createStateIdAutoScanner|createIdnycAutoCapture|idScanSession\.start\(\)/, 'State ID/IDNYC camera must not start on page load');
  const closeScanSection = sectionBetween(kiosk, 'function closeStateIdScan(options = {})', 'function showIdScanFallbacks');
  assert.match(closeScanSection, /stopIdScanSession\(\)/, 'Leaving ID scan mode should stop the previous camera session');
  assert.match(closeScanSection, /setIdEntryMode\('manual'\)/, 'Manual/cancel/reset should hide all ID scanner UI');
  const startStateSection = sectionBetween(kiosk, 'async function startStateIdPrefill()', 'async function handleStateIdPhotoFallback');
  assert.match(startStateSection, /closeStateIdScan\(\)/, 'Selecting State ID should stop any previous scanner mode first');
  assert.match(startStateSection, /configureIdScanPanel\('state_id'\)/, 'Selecting State ID should explicitly show the State ID scanner');
  const startIdnycSection = sectionBetween(kiosk, 'async function startIdnycPrefill()', 'async function handleIdnycCapture');
  assert.match(startIdnycSection, /closeStateIdScan\(\)/, 'Selecting IDNYC should stop and hide State ID scanning first');
  assert.match(startIdnycSection, /configureIdScanPanel\('idnyc'\)/, 'Selecting IDNYC should explicitly enter IDNYC scanner mode');
  const startReturningSection = sectionBetween(kiosk, 'async function startReturningBadgeScan()', 'async function handleStateIdPhotoFallback');
  assert.match(startReturningSection, /configureIdScanPanel\('returning_badge'\)/, 'Selecting Scan Previous Badge should explicitly enter returning badge scanner mode');
  assert.match(startReturningSection, /IdScan\.createReturningBadgeScanner/, 'Returning badge flow should use local rear-camera QR scanning');
  assert.doesNotMatch(startReturningSection, /createStateIdAutoScanner|createIdnycAutoCapture/, 'Returning badge scanning must not start State ID or IDNYC scanners');
  const returningHandlerSection = sectionBetween(kiosk, 'async function handleReturningBadgeText', 'async function startReturningBadgeScan');
  assert.match(returningHandlerSection, /\/visitor\/kiosk\/badge_checkout/, 'Returning badge scanner should support existing ENVISIT checkout QR codes');
  assert.match(returningHandlerSection, /\/visitor\/kiosk\/returning_scan/, 'Returning badge scanner should resolve ENVISITOR reusable credentials');
  const applyStateSection = sectionBetween(kiosk, 'function applyStateIdResult', 'async function startStateIdPrefill');
  assert.match(applyStateSection, /closeStateIdScan\(\)/, 'Successful State ID scan should hide the scanner');
  assert.match(applyStateSection, /applyIdPrefill\(parsed\.data/, 'Successful State ID scan should preserve and populate visitor fields');
  assert.doesNotMatch(applyStateSection, /visitorForm\.reset|resetForm\(\)/, 'Successful State ID scan must not reset populated fields');
  const resetFormSection = sectionBetween(kiosk, 'function resetForm()', 'function formPayload()');
  assert.match(resetFormSection, /closeStateIdScan\(\)/, 'Kiosk reset should return the ID scanner to hidden/default state');
  assert.match(bootSection, /\$\('manualEntryBtn'\)\?\.addEventListener\('click'[\s\S]*closeStateIdScan\(\)/, 'Manual entry should hide State ID/IDNYC scanner UI');
  assert.doesNotMatch(kiosk, /stateIdScanner\s*=\s*Shared\.createScannerBuffer|stateIdKeydown|stateIdScanTarget|Scanner input active/, 'Public kiosk State ID prefill must not assume an external keyboard-wedge scanner');
  assert.match(kiosk, /IdScan\.createStateIdAutoScanner/, 'State ID prefill should use automatic rear-camera PDF417 scanning');
  assert.match(kiosk, /IdScan\.decodePdf417Blob\(file\)/, 'State ID prefill should keep native rear-camera photo fallback');
  assert.match(kiosk, /guide:\s*idScanGuide/, 'State ID live scanner should map the visible guide into video pixels');
  assert.match(kiosk, /function\s+applyStateIdResult/, 'State ID prefill should consume decoded scanner result objects');
  assert.match(kiosk, /Shared\.parseAamva\(scanResult\)/, 'State ID prefill should use the local AAMVA parser on ZXing results');
  assert.doesNotMatch(kiosk, /applyStateIdPayload|let raw = await IdScan\.decodePdf417Blob/, 'State ID prefill must not reduce PDF417 results to raw text payloads');
  assert.match(kiosk, /IdScan\.createIdnycAutoCapture/, 'IDNYC prefill should use automatic rear-camera document capture');
  assert.match(kiosk, /IdScan\.recognizeIdnycImage/, 'IDNYC prefill should call the local OCR adapter');
  assert.match(kiosk, /Shared\.parseIdnycOcrText/, 'IDNYC path should parse local OCR text only');
  assert.match(idScan, /facingMode:\s*\{\s*ideal:\s*'environment'\s*\}/, 'ID scanners should request the rear-facing camera');
  assert.match(idScan, /width:\s*\{\s*ideal:\s*1920\s*\}/, 'State ID scanner should request the higher rear-camera width proven in Scanner Lab');
  assert.match(idScan, /height:\s*\{\s*ideal:\s*1080\s*\}/, 'State ID scanner should request the higher rear-camera height proven in Scanner Lab');
  assert.match(idScan, /formats:\s*\[\s*'PDF417'\s*\]/, 'PDF417 must be explicitly enabled');
  assert.match(idScan, /formats:\s*\[\s*'QRCode'\s*\]/, 'Returning pass scan should explicitly enable QRCode decoding');
  assert.match(idScan, /binarizer:\s*'LocalAverage'/, 'State ID scanner should use the proven LocalAverage binarizer');
  assert.match(idScan, /tryDenoise:\s*true/, 'State ID scanner should use the proven denoise option');
  assert.match(idScan, /STATE_ID_REQUIRED_MATCHES\s*=\s*2/, 'State ID auto scan should require repeated matching reads');
  assert.match(idScan, /matchingDecodes/, 'State ID scanner should track matching decode confidence');
  assert.match(idScan, /decodeBusy/, 'State ID scanner should prevent concurrent barcode decodes');
  assert.match(idScan, /getRenderedVideoRect/, 'State ID scanner should account for video object-fit before cropping');
  assert.match(idScan, /guideToVideoPixels/, 'State ID scanner should map visible guide coordinates to natural video pixels');
  assert.match(idScan, /drawVideoGuideCanvas\(video,\s*'pdf417',\s*guide\)/, 'State ID scanner should crop/analyze the visible barcode guide area');
  assert.match(idScan, /decodeStateIdCanvas/, 'State ID scanner should decode the guide crop locally');
  assert.match(idScan, /\['original',\s*'contrast'\]/, 'State ID scanner should try original then contrast-enhanced guide crops');
  assert.match(idScan, /processedCanvas\(canvas,\s*mode\)/, 'State ID scanner should use the same contrast preprocessing path as Scanner Lab');
  assert.match(idScan, /parseStateIdResult/, 'State ID scanner should parse normalized ZXing results');
  assert.match(idScan, /root\.EagleNestVisitor\?\.parseAamva/, 'State ID scanner should use the shared local AAMVA parser');
  assert.match(idScan, /result\.bytes/, 'State ID scanner should preserve/read ZXing raw bytes');
  assert.match(idScan, /canvasLooksEmptyBlack\(canvas\)/, 'Scanner should ignore empty black frames');
  assert.match(idScan, /onTimeout/, 'State ID scanner should expose timeout/failure fallback');
  assert.match(idScan, /imageBlobToCanvas/, 'State ID native-photo fallback should process returned image locally');
  assert.match(idScan, /cropCanvasByNormalized/, 'State ID native-photo fallback should try bounded barcode crops');
  assert.match(idScan, /y:\s*0\.55,\s*w:\s*1,\s*h:\s*0\.45/, 'State ID native-photo fallback should include lower wide barcode crop candidates');
  assert.match(idScan, /zxing-wasm\/\$\{VERSIONS\.zxingWasm\}\/reader\/index\.js/, 'ZXing reader should be loaded from local vendor assets');
  assert.match(idScan, /zxing-wasm\/\$\{VERSIONS\.zxingWasm\}\/reader\/zxing_reader\.wasm/, 'ZXing WASM should be loaded locally');
  assert.doesNotMatch(idScan, /cdn\.jsdelivr|fastly\.jsdelivr|api\.qrserver|barcodeapi/i, 'ID scan adapter must not use runtime barcode CDNs/APIs');
  assert.match(idScan, /function\s+createReturningBadgeScanner/, 'Kiosk should have an isolated returning QR scanner');
  assert.match(idScan, /drawVideoGuideCanvas\(video,\s*'qr',\s*guide\)/, 'Returning QR scanner should crop the visible QR guide');
  assert.match(idScan, /decodeBusy/, 'Returning QR scanner should prevent overlapping decodes');
  assert.match(idScan, /startsWith\('ENVISITOR:'\)/, 'Returning QR scanner should recognize ENVISITOR credentials');
  assert.match(idScan, /startsWith\('ENVISIT:'\)/, 'QR scanner adapter should continue recognizing existing ENVISIT badges');
  assert.doesNotMatch(kioskHtml, /ZXing|WASM|descriptor|AAMVA version|Show Raw|Show Parsed Fields|decode ms|raw bytes/i, 'Production kiosk must not expose Scanner Lab debug UI');
  assert.doesNotMatch(kioskCss, /decoderInput|cropMapping|manualCrop|safeDiagnostic/i, 'Production kiosk CSS must not expose Scanner Lab debug controls');
  assert.match(kioskCss, /\.barcodeGuide\s*\{[\s\S]*top:\s*39%[\s\S]*bottom:\s*39%/, 'Production State ID guide should be wide and barcode-only');
  assert.match(idScan, /IDNYC_STABLE_FRAMES\s*=\s*4/, 'IDNYC capture should require several good frames');
  assert.match(idScan, /IDNYC_STABLE_MS\s*=\s*650/, 'IDNYC capture should require a stable time window');
  assert.match(idScan, /function\s+frameQuality/, 'IDNYC capture should assess document frame quality');
  assert.match(idScan, /metricsStable/, 'IDNYC capture should require stability before OCR');
  const idnycAutoSection = sectionBetween(idScan, 'function createIdnycAutoCapture', 'async function readTextWithTextDetector');
  assert.doesNotMatch(idnycAutoSection, /readTextWithTesseract|recognizeIdnycImage/, 'IDNYC OCR must not run continuously on live frames');
  const tesseractSection = sectionBetween(idScan, 'async function readTextWithTesseract', 'async function recognizeIdnycImage');
  assert.match(tesseractSection, /workerPath:\s*assetUrl\(`vendor\/tesseract\.js\/\$\{VERSIONS\.tesseract\}\/worker\.min\.js`\)/, 'Tesseract worker should be loaded locally');
  assert.match(tesseractSection, /corePath:\s*assetUrl\(`vendor\/tesseract\.js-core\/\$\{VERSIONS\.tesseractCore\}\/tesseract-core-lstm\.wasm\.js`\)/, 'Tesseract core should be loaded locally');
  assert.match(tesseractSection, /langPath:\s*assetUrl\(`vendor\/tesseract\.js-data\/eng\/\$\{VERSIONS\.tesseractEngData\}`\)/, 'Tesseract language data should be loaded locally');
  assert.match(tesseractSection, /cacheMethod:\s*'none'/, 'OCR should not store ID-specific OCR data in browser caches');
  assert.doesNotMatch(tesseractSection, /https?:\/\//, 'OCR adapter must not point to external OCR assets');
  assert.match(idScan, /TextDetector/, 'IDNYC path may use local browser text detection as a fast first pass');
  assert.match(idScan, /looksLikeUsableIdnycText/, 'TextDetector fast pass should require usable IDNYC text before skipping OCR fallback');
  assert.match(idScan, /readTextWithTesseract/, 'IDNYC path must include bundled local OCR fallback');
  assert.match(kiosk, /Shared\.processVisitorPhotoFile/, 'Kiosk should use shared local image crop/compression');
  assert.match(kiosk, /URL\.revokeObjectURL/, 'Kiosk retake/reset should revoke temporary photo URLs');
  assert.match(kiosk, /\/visitor\/kiosk\/photo/, 'Kiosk should upload photo through limited kiosk endpoint');
  assert.match(kiosk, /Scanning an ID is optional and is used only to help fill in your name and date of birth/, 'English kiosk privacy notice must disclose optional ID prefill scope');
  assert.match(kiosk, /Escanear una identificación es opcional y solo se usa para ayudar a completar su nombre y fecha de nacimiento/, 'Spanish kiosk privacy notice must disclose optional ID prefill scope');
  assert.match(kiosk, /A current visitor photo is securely stored for up to 30 days/, 'English kiosk privacy notice must disclose visitor photo retention');
  assert.match(kiosk, /Una foto actual del visitante se guarda de forma segura por hasta 30 días/, 'Spanish kiosk privacy notice must disclose visitor photo retention');
  assert.match(kiosk, /scanPreviousBadge:\s*'Escanear pase anterior'/, 'Spanish kiosk should translate Scan Previous Badge');
  assert.match(kiosk, /stateIdPrefill:\s*'Licencia de conducir \/ identificación estatal'/, 'Spanish State ID choice should be translated');
  assert.match(kiosk, /stateIdScanPrompt:\s*'Voltee su identificación y coloque el código de barras del REVERSO dentro del cuadro\.'/, 'Spanish State ID scanner prompt should be translated');
  assert.match(kiosk, /stateIdMoveCloser:\s*'Acérquelo'/, 'Spanish State ID move-closer status should be translated');
  assert.match(kiosk, /stateIdHoldSteady:\s*'Manténgalo firme'/, 'Spanish State ID hold-steady status should be translated');
  assert.match(kiosk, /returningPhotoCurrent:\s*'Su foto de visitante está vigente para este mes\.'/, 'Spanish returning photo-current status should be translated');
  assert.match(kiosk, /returningClaimExpired:\s*'La sesión del pase venció\. Vuelva a escanear el pase\.'/, 'Spanish returning claim expiry should be translated');
  assert.doesNotMatch(kiosk, /data:image|base64/i, 'Kiosk should not persist/send Base64 photo data');
}

{
  const captureSection = sectionBetween(shared, 'function capturePortraitPhoto', 'const QR_VERSION');
  assert.match(captureSection, /ctx\.drawImage\(video,/, 'Stored photo should be drawn from underlying video pixels');
  assert.doesNotMatch(captureSection, /scaleX|ctx\.scale|transform/i, 'Stored JPEG should remain non-mirrored; mirroring is CSS-only');
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
  assert.match(deskHtml, /name="date_of_birth"[^>]+type="date"[^>]+required/, 'Visitor Desk should capture DOB in review/staff form');
  assert.match(desk, /date_of_birth:\s*Shared\.normalizeDateOfBirth/, 'Visitor Desk should normalize DOB in staff edit payloads');
  assert.match(desk, /photo_id=\$\{encodeURIComponent\(photoId\)\}/, 'Visitor Desk should read photos by opaque photo_id when available');
  assert.match(desk, /\/admin\/visitor\/photo\?visit_id=/, 'Visitor Desk should keep visit_id photo upload path');
  assert.match(desk, /\/admin\/visitor\/photo_override/, 'Visitor Desk should support audited no-photo override');
  assert.match(desk, /fetchPhotoBlob/, 'Visitor Desk should load photos via authenticated fetch');
  assert.doesNotMatch(desk, /https?:\/\/[^'"]*visitor-photos|r2\.dev|public R2/i, 'Visitor Desk must not embed public R2 URLs');
}

console.log('visitor_frontend_static tests passed');
