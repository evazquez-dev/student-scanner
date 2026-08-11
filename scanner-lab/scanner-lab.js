(function () {
  'use strict';

  const LAB_BUILD = '2026-08-11-1';
  const LIVE_SCAN_INTERVAL_MS = 240;
  const REQUIRED_MATCHES = 2;
  const MAX_CANVAS_WIDTH = 1280;
  const Shared = window.EagleNestVisitor;
  const IdScan = window.EagleNestVisitorIdScan;

  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const camera = {
    stream: null,
    updateTimer: 0
  };

  const live = {
    stream: null,
    running: false,
    decodeBusy: false,
    timer: 0,
    frameCallback: 0,
    startedAt: 0,
    attempts: 0,
    successes: 0,
    lastDecodeMs: 0,
    lastFormat: 'none',
    lastVariant: 'none',
    lastRaw: '',
    lastError: '',
    lastPayload: '',
    matchingReads: 0,
    aamvaDetected: false
  };

  const photo = {
    objectUrl: '',
    dimensions: '-',
    detected: false,
    aamvaDetected: false,
    decodeMs: 0,
    variant: 'none',
    lastError: ''
  };

  function yesNo(value) {
    return value ? 'YES' : 'NO';
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value == null ? '' : value);
  }

  function errorText(err) {
    if (!err) return '';
    const name = err.name ? `${err.name}: ` : '';
    return `${name}${err.message || String(err)}`.slice(0, 900);
  }

  function safePageUrl() {
    return `${location.origin}${location.pathname}`;
  }

  function setError(id, err) {
    setText(id, err ? errorText(err) : '');
  }

  function selectedValues(name) {
    const values = $$(`input[name="${name}"]:checked`).map((input) => input.value);
    return values.length ? values : [name === 'processing' ? 'original' : '0'];
  }

  function selectedRegionMode() {
    return document.querySelector('input[name="regionMode"]:checked')?.value || 'full';
  }

  function stopStream(stream, video) {
    try { IdScan?.stopStream?.(stream, video); } catch {
      try {
        stream?.getTracks?.().forEach((track) => track.stop());
      } catch {}
      if (video) video.srcObject = null;
    }
  }

  async function startRearCamera(video) {
    if (!IdScan?.startRearCamera) throw new Error('ZXing camera adapter is unavailable');
    return IdScan.startRearCamera(video);
  }

  function stopCameraTest() {
    if (camera.updateTimer) clearInterval(camera.updateTimer);
    camera.updateTimer = 0;
    stopStream(camera.stream, $('cameraVideo'));
    camera.stream = null;
    updateCameraMetrics();
  }

  function updateCameraMetrics() {
    const video = $('cameraVideo');
    const track = camera.stream?.getVideoTracks?.()[0] || null;
    const settings = track?.getSettings?.() || {};
    setText('cameraActive', yesNo(!!camera.stream));
    setText('cameraWidth', video?.videoWidth || 0);
    setText('cameraHeight', video?.videoHeight || 0);
    setText('cameraReadyState', video?.readyState || 0);
    setText('cameraFacingMode', settings.facingMode || 'unknown');
    setText('cameraDeviceLabel', track?.label || 'unknown');
    setText('cameraFrameCallback', yesNo(!!video?.requestVideoFrameCallback));
    setText('cameraTimestamp', new Date().toLocaleTimeString());
  }

  async function startCameraTest() {
    stopAll({ keepPhoto: true });
    setError('cameraError', '');
    try {
      camera.stream = await startRearCamera($('cameraVideo'));
      updateCameraMetrics();
      camera.updateTimer = setInterval(updateCameraMetrics, 400);
    } catch (err) {
      stopCameraTest();
      setError('cameraError', err);
    }
  }

  function sourceCanvasFromVideo(video, regionMode) {
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    if (regionMode === 'guide') return IdScan?.drawVideoGuideCanvas?.(video, 'pdf417') || null;

    const scale = Math.min(1, MAX_CANVAS_WIDTH / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, width, height);
    if (IdScan?.canvasLooksEmptyBlack?.(canvas)) return null;
    return canvas;
  }

  function copyCanvas(canvas) {
    const next = document.createElement('canvas');
    next.width = canvas.width;
    next.height = canvas.height;
    const ctx = next.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, next.width, next.height);
    ctx.drawImage(canvas, 0, 0);
    return next;
  }

  function processedCanvas(source, mode) {
    if (mode === 'resize2x') {
      const next = document.createElement('canvas');
      next.width = Math.min(2400, source.width * 2);
      next.height = Math.min(1800, source.height * 2);
      const ctx = next.getContext('2d', { alpha: false, willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, next.width, next.height);
      ctx.drawImage(source, 0, 0, next.width, next.height);
      return next;
    }

    const next = copyCanvas(source);
    if (mode === 'original') return next;

    const ctx = next.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, next.width, next.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
      let value = lum;
      if (mode === 'contrast') value = Math.max(0, Math.min(255, (lum - 128) * 1.45 + 128));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return next;
  }

  function rotatedCanvas(source, degrees) {
    const angle = Number(degrees || 0);
    if (!angle) return copyCanvas(source);
    const swap = angle === 90 || angle === 270;
    const next = document.createElement('canvas');
    next.width = swap ? source.height : source.width;
    next.height = swap ? source.width : source.height;
    const ctx = next.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, next.width, next.height);
    ctx.translate(next.width / 2, next.height / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return next;
  }

  async function decodeCanvasWithSelections(source) {
    if (!IdScan?.readPdf417Candidates) throw new Error('PDF417 decoder unavailable');
    const processingModes = selectedValues('processing');
    const rotations = selectedValues('rotation');

    for (const mode of processingModes) {
      const processed = processedCanvas(source, mode);
      for (const rotation of rotations) {
        const rotated = rotatedCanvas(processed, Number(rotation));
        if (!rotated.width || !rotated.height || IdScan.canvasLooksEmptyBlack?.(rotated)) continue;
        const ctx = rotated.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, rotated.width, rotated.height);
        const candidates = await IdScan.readPdf417Candidates(imageData, { tryRotate: false });
        if (candidates.length) {
          return {
            candidate: candidates[0],
            variant: `${mode}, ${rotation} deg`
          };
        }
      }
    }
    return null;
  }

  function renderDecodedText() {
    const pre = $('decodedText');
    const show = $('showDecodedText')?.checked;
    if (!pre) return;
    pre.hidden = !show || !live.lastRaw;
    pre.textContent = show && live.lastRaw ? live.lastRaw : '';
  }

  function clearParsed(prefix) {
    setText(`${prefix}ValidAamva`, 'NO');
    setText(`${prefix}FirstName`, '-');
    setText(`${prefix}MiddleName`, '-');
    setText(`${prefix}LastName`, '-');
    setText(`${prefix}Dob`, '-');
    setText(`${prefix}Jurisdiction`, '-');
  }

  function renderParsed(prefix, decodedText) {
    const parsed = Shared?.parseAamva?.(decodedText) || { ok: false, data: {} };
    const data = parsed.data || {};
    if (prefix === 'live') setText('liveValidAamva', yesNo(parsed.ok));
    setText(`${prefix}FirstName`, data.visitor_first_name || '-');
    setText(`${prefix}MiddleName`, data.visitor_middle_name || '-');
    setText(`${prefix}LastName`, data.visitor_last_name || '-');
    setText(`${prefix}Dob`, data.date_of_birth || '-');
    setText(`${prefix}Jurisdiction`, data.id_issuing_jurisdiction || '-');
    return parsed.ok;
  }

  function clearLiveResults() {
    live.attempts = 0;
    live.successes = 0;
    live.lastDecodeMs = 0;
    live.lastFormat = 'none';
    live.lastVariant = 'none';
    live.lastRaw = '';
    live.lastError = '';
    live.lastPayload = '';
    live.matchingReads = 0;
    live.aamvaDetected = false;
    $('liveValidBanner').hidden = true;
    clearParsed('live');
    renderDecodedText();
    updateLiveMetrics('Idle');
    setError('liveError', '');
  }

  function updateLiveMetrics(status) {
    const video = $('liveVideo');
    const elapsedSec = live.startedAt ? Math.max(0.001, (performance.now() - live.startedAt) / 1000) : 0;
    const rate = elapsedSec ? live.attempts / elapsedSec : 0;
    setText('liveCameraState', live.running ? 'ACTIVE' : 'OFF');
    setText('liveFrameSize', `${video?.videoWidth || 0} x ${video?.videoHeight || 0}`);
    setText('liveAttempts', live.attempts);
    setText('liveSuccesses', live.successes);
    setText('liveScanRate', `${rate.toFixed(1)}/sec`);
    setText('liveDecodeMs', live.lastDecodeMs ? `${live.lastDecodeMs} ms` : '-');
    setText('liveFormat', live.lastFormat || 'none');
    setText('liveAamva', yesNo(live.aamvaDetected));
    setText('liveMatches', `${live.matchingReads} / ${REQUIRED_MATCHES}`);
    setText('liveVariant', live.lastVariant || 'none');
    setText('liveStatus', status || (live.running ? 'Searching...' : 'Idle'));
  }

  function scheduleLiveScan() {
    if (!live.running) return;
    if (live.timer) clearTimeout(live.timer);
    live.timer = setTimeout(() => {
      if (!live.running) return;
      const video = $('liveVideo');
      if (video?.requestVideoFrameCallback) {
        live.frameCallback = video.requestVideoFrameCallback(() => scanLiveFrame());
      } else {
        scanLiveFrame();
      }
    }, LIVE_SCAN_INTERVAL_MS);
  }

  async function scanLiveFrame() {
    if (!live.running) return;
    if (live.decodeBusy) {
      scheduleLiveScan();
      return;
    }

    const source = sourceCanvasFromVideo($('liveVideo'), selectedRegionMode());
    if (!source) {
      updateLiveMetrics('Canvas dimensions invalid or frame blank');
      scheduleLiveScan();
      return;
    }

    live.decodeBusy = true;
    live.attempts += 1;
    const started = performance.now();
    try {
      const hit = await decodeCanvasWithSelections(source);
      live.lastDecodeMs = Math.round(performance.now() - started);
      if (!hit) {
        live.lastFormat = 'none';
        live.aamvaDetected = false;
        live.matchingReads = 0;
        updateLiveMetrics('Searching...');
        return;
      }

      const format = String(hit.candidate.format || hit.candidate.symbology || 'PDF417');
      const payload = String(hit.candidate.text || '');
      const isAamva = !!IdScan?.looksLikeAamvaPdf417?.(payload);
      live.successes += 1;
      live.lastFormat = format || 'PDF417';
      live.lastVariant = hit.variant;
      live.aamvaDetected = isAamva;
      live.lastRaw = payload;
      if (isAamva && payload === live.lastPayload) live.matchingReads += 1;
      else live.matchingReads = isAamva ? 1 : 0;
      live.lastPayload = isAamva ? payload : '';
      if (isAamva) {
        renderParsed('live', payload);
        $('liveValidBanner').hidden = false;
        if (navigator.vibrate) {
          try { navigator.vibrate(60); } catch {}
        }
      } else {
        clearParsed('live');
        $('liveValidBanner').hidden = true;
      }
      renderDecodedText();
      updateLiveMetrics(isAamva ? 'Valid AAMVA' : 'Barcode detected');
    } catch (err) {
      live.lastError = errorText(err);
      setError('liveError', err);
      updateLiveMetrics('Decoder error');
    } finally {
      live.decodeBusy = false;
      scheduleLiveScan();
      updateDiagnostics();
    }
  }

  async function startLiveScan() {
    stopAll({ keepPhoto: true });
    clearLiveResults();
    setError('liveError', '');
    live.running = true;
    live.startedAt = performance.now();
    updateLiveMetrics('Starting camera...');
    try {
      live.stream = await startRearCamera($('liveVideo'));
      updateLiveMetrics('Searching...');
      scheduleLiveScan();
    } catch (err) {
      stopLiveScan();
      live.lastError = errorText(err);
      setError('liveError', err);
    }
  }

  function stopLiveScan() {
    live.running = false;
    if (live.timer) clearTimeout(live.timer);
    live.timer = 0;
    if (live.frameCallback && $('liveVideo')?.cancelVideoFrameCallback) {
      try { $('liveVideo').cancelVideoFrameCallback(live.frameCallback); } catch {}
    }
    live.frameCallback = 0;
    stopStream(live.stream, $('liveVideo'));
    live.stream = null;
    live.decodeBusy = false;
    live.lastRaw = '';
    renderDecodedText();
    updateLiveMetrics('Stopped');
  }

  function revokePhotoUrl() {
    if (!photo.objectUrl) return;
    URL.revokeObjectURL(photo.objectUrl);
    photo.objectUrl = '';
  }

  function clearPhotoResult() {
    revokePhotoUrl();
    const img = $('photoPreview');
    const input = $('barcodePhotoInput');
    if (img) {
      img.hidden = true;
      img.removeAttribute('src');
    }
    if (input) input.value = '';
    $('photoPlaceholder').hidden = false;
    photo.dimensions = '-';
    photo.detected = false;
    photo.aamvaDetected = false;
    photo.decodeMs = 0;
    photo.variant = 'none';
    photo.lastError = '';
    setText('photoDimensions', '-');
    setText('photoDetected', 'NO');
    setText('photoAamva', 'NO');
    setText('photoDecodeMs', '-');
    setText('photoVariant', 'none');
    setText('photoStatus', 'Idle');
    clearParsed('photo');
    setError('photoError', '');
  }

  async function imageFileToCanvas(file) {
    if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) throw new Error('Image file required');
    if (window.createImageBitmap) {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        return canvas;
      } finally {
        try { bitmap.close(); } catch {}
      }
    }

    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error('Image decode failed'));
        node.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handlePhotoSelected(ev) {
    const file = ev?.target?.files?.[0] || null;
    if (!file) return;
    clearPhotoResult();
    try {
      photo.objectUrl = URL.createObjectURL(file);
      $('photoPreview').src = photo.objectUrl;
      $('photoPreview').hidden = false;
      $('photoPlaceholder').hidden = true;
      setText('photoStatus', 'Decoding...');

      const source = await imageFileToCanvas(file);
      photo.dimensions = `${source.width} x ${source.height}`;
      setText('photoDimensions', photo.dimensions);
      if (!source.width || !source.height || IdScan?.canvasLooksEmptyBlack?.(source)) throw new Error('Image decode failed or frame is blank');

      const started = performance.now();
      const hit = await decodeCanvasWithSelections(source);
      photo.decodeMs = Math.round(performance.now() - started);
      setText('photoDecodeMs', `${photo.decodeMs} ms`);

      if (!hit) {
        setText('photoStatus', 'PDF417 decode returned no result');
        return;
      }

      const payload = String(hit.candidate.text || '');
      photo.detected = true;
      photo.variant = hit.variant;
      photo.aamvaDetected = !!IdScan?.looksLikeAamvaPdf417?.(payload);
      setText('photoDetected', 'YES');
      setText('photoVariant', photo.variant);
      setText('photoAamva', yesNo(photo.aamvaDetected));
      if (photo.aamvaDetected) renderParsed('photo', payload);
      setText('photoStatus', photo.aamvaDetected ? 'Valid AAMVA' : 'PDF417 detected');
    } catch (err) {
      photo.lastError = errorText(err);
      setText('photoStatus', 'Error');
      setError('photoError', err);
    } finally {
      updateDiagnostics();
    }
  }

  function stopAll(options) {
    const opts = options || {};
    stopCameraTest();
    stopLiveScan();
    if (!opts.keepPhoto) clearPhotoResult();
  }

  function selectTab(name) {
    stopAll({ keepPhoto: false });
    $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
    $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
    updateDiagnostics();
  }

  function updateDiagnostics() {
    const liveVideo = $('liveVideo');
    setText('diagMediaDevices', yesNo(!!navigator.mediaDevices));
    setText('diagGetUserMedia', yesNo(!!navigator.mediaDevices?.getUserMedia));
    setText('diagFrameCallback', yesNo(!!liveVideo?.requestVideoFrameCallback));
    setText('diagImageBitmap', yesNo(!!window.createImageBitmap));
    setText('diagOffscreenCanvas', yesNo(!!window.OffscreenCanvas));
    setText('diagBarcodeDetector', yesNo(!!window.BarcodeDetector));
    setText('diagTextDetector', yesNo(!!window.TextDetector));
    setText('diagWebAssembly', yesNo(!!window.WebAssembly));
    setText('diagUserAgent', navigator.userAgent || '-');
    setText('diagScreenSize', `${screen.width} x ${screen.height}`);
    setText('diagDpr', window.devicePixelRatio || 1);
    setText('diagPageUrl', safePageUrl());
    setText('diagZxingLoaded', yesNo(!!window.ZXingWASM));
    setText('diagZxingVersion', window.ZXingWASM?.ZXING_WASM_VERSION || IdScan?.VERSIONS?.zxingWasm || '3.1.2');
    setText('diagPdf417Support', yesNo(!!IdScan?.PDF417_READER_OPTIONS?.formats?.includes('PDF417')));
  }

  function buildDiagnosticReport() {
    return [
      'EagleNEST Scanner Lab',
      `Build: ${LAB_BUILD}`,
      `User Agent: ${navigator.userAgent || '-'}`,
      `Screen: ${screen.width} x ${screen.height}`,
      `Device pixel ratio: ${window.devicePixelRatio || 1}`,
      `Page URL: ${safePageUrl()}`,
      `getUserMedia: ${yesNo(!!navigator.mediaDevices?.getUserMedia).toLowerCase()}`,
      `requestVideoFrameCallback: ${yesNo(!!$('liveVideo')?.requestVideoFrameCallback).toLowerCase()}`,
      `createImageBitmap: ${yesNo(!!window.createImageBitmap).toLowerCase()}`,
      `WebAssembly: ${yesNo(!!window.WebAssembly).toLowerCase()}`,
      `Camera dimensions: ${$('liveVideo')?.videoWidth || $('cameraVideo')?.videoWidth || 0} x ${$('liveVideo')?.videoHeight || $('cameraVideo')?.videoHeight || 0}`,
      `ZXing loaded: ${yesNo(!!window.ZXingWASM).toLowerCase()}`,
      `ZXing version: ${window.ZXingWASM?.ZXING_WASM_VERSION || IdScan?.VERSIONS?.zxingWasm || '3.1.2'}`,
      `PDF417 support: ${yesNo(!!IdScan?.PDF417_READER_OPTIONS?.formats?.includes('PDF417')).toLowerCase()}`,
      `Decode region: ${selectedRegionMode()}`,
      `Processing: ${selectedValues('processing').join(', ')}`,
      `Rotations: ${selectedValues('rotation').join(', ')}`,
      `Live attempts: ${live.attempts}`,
      `Live PDF417 successes: ${live.successes}`,
      `Live AAMVA detected: ${yesNo(live.aamvaDetected).toLowerCase()}`,
      `Live consecutive matches: ${live.matchingReads} / ${REQUIRED_MATCHES}`,
      `Photo PDF417 success: ${yesNo(photo.detected).toLowerCase()}`,
      `Photo AAMVA detected: ${yesNo(photo.aamvaDetected).toLowerCase()}`,
      `Last decode ms: ${live.lastDecodeMs || photo.decodeMs || '-'}`,
      `Last format: ${live.lastFormat || 'none'}`,
      `Last successful variant: ${live.lastVariant !== 'none' ? live.lastVariant : photo.variant}`,
      `Last error: ${live.lastError || photo.lastError || '-'}`
    ].join('\n');
  }

  async function copyDiagnosticReport() {
    const report = buildDiagnosticReport();
    setText('diagnosticReport', report);
    try {
      await navigator.clipboard.writeText(report);
      setText('diagnosticReport', `${report}\n\nCopied.`);
    } catch {
      const text = document.createElement('textarea');
      text.value = report;
      text.setAttribute('readonly', '');
      text.style.position = 'fixed';
      text.style.left = '-1000px';
      document.body.appendChild(text);
      text.select();
      try { document.execCommand('copy'); } catch {}
      text.remove();
      setText('diagnosticReport', `${report}\n\nCopy attempted.`);
    }
  }

  function bindEvents() {
    setText('buildLabel', `Scanner Lab build: ${LAB_BUILD}`);
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    });
    $('startCameraBtn')?.addEventListener('click', startCameraTest);
    $('stopCameraBtn')?.addEventListener('click', stopCameraTest);
    $('startLiveBtn')?.addEventListener('click', startLiveScan);
    $('stopLiveBtn')?.addEventListener('click', stopLiveScan);
    $('clearLiveBtn')?.addEventListener('click', clearLiveResults);
    $('showDecodedText')?.addEventListener('change', renderDecodedText);
    $('takePhotoBtn')?.addEventListener('click', () => $('barcodePhotoInput')?.click());
    $('takeAnotherPhotoBtn')?.addEventListener('click', () => {
      clearPhotoResult();
      $('barcodePhotoInput')?.click();
    });
    $('clearPhotoBtn')?.addEventListener('click', clearPhotoResult);
    $('barcodePhotoInput')?.addEventListener('change', handlePhotoSelected);
    $('refreshDiagnosticsBtn')?.addEventListener('click', updateDiagnostics);
    $('copyDiagnosticsBtn')?.addEventListener('click', copyDiagnosticReport);
    window.addEventListener('pagehide', () => stopAll({ keepPhoto: false }));
    window.addEventListener('beforeunload', () => stopAll({ keepPhoto: false }));
    updateDiagnostics();
    updateCameraMetrics();
    updateLiveMetrics('Idle');
    clearParsed('live');
    clearParsed('photo');
  }

  bindEvents();
})();
