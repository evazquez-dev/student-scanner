(function () {
  'use strict';

  const LAB_BUILD = '2026-08-11-3';
  const SELFTEST_TEXT = 'EAGLENEST-PDF417-SELFTEST-12345';
  const SELFTEST_FIXTURE = './fixtures/pdf417-selftest.png';
  const LIVE_SCAN_INTERVAL_MS = 240;
  const REQUIRED_MATCHES = 2;
  const MAX_LIVE_CANVAS_WIDTH = 1280;
  const Shared = window.EagleNestVisitor;
  const IdScan = window.EagleNestVisitorIdScan;

  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const camera = {
    stream: null,
    updateTimer: 0,
    lastActiveWidth: 0,
    lastActiveHeight: 0
  };

  const live = {
    stream: null,
    running: false,
    decodeBusy: false,
    timer: 0,
    frameCallback: 0,
    startedAt: 0,
    attempts: 0,
    pdf417Successes: 0,
    aamvaSuccesses: 0,
    lastDecodeMs: 0,
    lastFormat: 'none',
    lastVariant: 'none',
    lastRaw: '',
    lastError: '',
    lastPdf417Payload: '',
    lastAamvaPayload: '',
    lastCandidateInfo: '-',
    matchingPdf417Reads: 0,
    matchingAamvaReads: 0,
    pdf417Detected: false,
    aamvaDetected: false,
    selfTestDetected: false
  };

  function emptyDecodeState() {
    return {
      success: false,
      ms: 0,
      count: 0,
      format: '-',
      candidateInfo: '-',
      dimensions: '-',
      variant: 'none'
    };
  }

  const photo = {
    file: null,
    objectUrl: '',
    sourceCanvas: null,
    dimensions: '-',
    detected: false,
    aamvaDetected: false,
    directSuccess: false,
    directMs: 0,
    directCount: 0,
    directFormat: '-',
    directCandidateInfo: '-',
    allFormatsSuccess: false,
    allFormatsFormat: '-',
    allFormatsMs: 0,
    manualCropSuccess: false,
    manualCropMs: 0,
    manualCropDimensions: '-',
    manualCropVariant: 'none',
    decodeMs: 0,
    variant: 'none',
    lastError: '',
    directPhotoResult: emptyDecodeState(),
    allFormatsResult: emptyDecodeState(),
    manualCropResult: emptyDecodeState()
  };

  const selfTest = {
    success: false,
    hasRun: false,
    ms: 0,
    count: 0,
    format: '-',
    lastError: ''
  };

  const crop = {
    rect: { x: 0.1, y: 0.55, w: 0.8, h: 0.3 },
    dragging: false,
    mode: '',
    startX: 0,
    startY: 0,
    startRect: null,
    lastMapping: null
  };

  let wasmInfo = null;
  let wasmInfoPromise = null;

  const yesNo = (value) => (value ? 'YES' : 'NO');

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

  function selectedTestTarget() {
    return document.querySelector('input[name="testTarget"]:checked')?.value || 'selftest';
  }

  function diagnosticPdf417Options(extra) {
    return {
      ...(IdScan?.DIAGNOSTIC_PDF417_OPTIONS || {}),
      formats: ['PDF417'],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      tryDenoise: true,
      binarizer: 'LocalAverage',
      maxNumberOfSymbols: 1,
      returnErrors: true,
      ...(extra || {})
    };
  }

  function allFormatsOptions() {
    return {
      ...diagnosticPdf417Options(),
      formats: []
    };
  }

  function renderDecodeOptions() {
    const opts = diagnosticPdf417Options();
    setText('decodeOptions', [
      `Formats: ${opts.formats.join(', ') || 'all readable formats'}`,
      `Try harder: ${opts.tryHarder}`,
      `Try rotate: ${opts.tryRotate}`,
      `Try invert: ${opts.tryInvert}`,
      `Try downscale: ${opts.tryDownscale}`,
      `Try denoise: ${opts.tryDenoise}`,
      `Binarizer: ${opts.binarizer}`,
      `Max symbols: ${opts.maxNumberOfSymbols}`,
      `Return errors: ${opts.returnErrors}`
    ].join('\n'));
  }

  function resultFormat(result) {
    return String(result?.format || result?.symbology || 'none') || 'none';
  }

  function resultDiagnosticSummary(result) {
    if (!result) return 'Candidate found: NO';
    const position = result.position ? `; position ${JSON.stringify(result.position).slice(0, 180)}` : '';
    return [
      'Candidate found: YES',
      `format ${resultFormat(result)}`,
      `valid ${yesNo(result.valid)}`,
      `error ${result.error || 'none'}${position}`
    ].join('; ');
  }

  async function runBarcodeRead(input, options) {
    if (!IdScan?.readBarcodeResults) throw new Error('PDF417 decoder unavailable');
    const started = performance.now();
    const results = await IdScan.readBarcodeResults(input, options);
    return {
      results,
      ms: Math.round(performance.now() - started),
      first: results[0] || null
    };
  }

  function isPdf417(result) {
    return /PDF417/i.test(`${result?.format || ''} ${result?.symbology || ''}`);
  }

  function hasDecodedText(result) {
    return !!String(result?.text || '').trim();
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

  function rememberActiveDimensions(video) {
    const width = Number(video?.videoWidth || 0);
    const height = Number(video?.videoHeight || 0);
    if (width > 0 && height > 0) {
      camera.lastActiveWidth = width;
      camera.lastActiveHeight = height;
    }
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
    rememberActiveDimensions(video);
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
    rememberActiveDimensions(video);
    if (regionMode === 'guide') return IdScan?.drawVideoGuideCanvas?.(video, 'pdf417') || null;

    const scale = Math.min(1, MAX_LIVE_CANVAS_WIDTH / video.videoWidth);
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

  function downscaleCanvas(source, maxLongEdge) {
    const longEdge = Math.max(source.width, source.height);
    if (longEdge <= maxLongEdge) return copyCanvas(source);
    const scale = maxLongEdge / longEdge;
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(source.width * scale));
    next.height = Math.max(1, Math.round(source.height * scale));
    const ctx = next.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, next.width, next.height);
    ctx.drawImage(source, 0, 0, next.width, next.height);
    return next;
  }

  function processedCanvas(source, mode) {
    if (mode === 'downscale2000') return downscaleCanvas(source, 2000);
    if (mode === 'downscale1400') return downscaleCanvas(source, 1400);
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

  function qualityMetrics(canvas) {
    const ctx = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!ctx || !canvas.width || !canvas.height) return null;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) / 90));
    let count = 0;
    let sum = 0;
    let min = 255;
    let max = 0;
    let edge = 0;
    for (let y = step; y < canvas.height - step; y += step) {
      for (let x = step; x < canvas.width - step; x += step) {
        const idx = (y * canvas.width + x) * 4;
        const lum = (data[idx] * 0.299) + (data[idx + 1] * 0.587) + (data[idx + 2] * 0.114);
        const idxRight = (y * canvas.width + Math.min(canvas.width - 1, x + step)) * 4;
        const idxDown = (Math.min(canvas.height - 1, y + step) * canvas.width + x) * 4;
        const lumRight = (data[idxRight] * 0.299) + (data[idxRight + 1] * 0.587) + (data[idxRight + 2] * 0.114);
        const lumDown = (data[idxDown] * 0.299) + (data[idxDown + 1] * 0.587) + (data[idxDown + 2] * 0.114);
        count += 1;
        sum += lum;
        min = Math.min(min, lum);
        max = Math.max(max, lum);
        edge += Math.abs(lum - lumRight) + Math.abs(lum - lumDown);
      }
    }
    return {
      brightness: count ? sum / count : 0,
      sharpness: count ? edge / (count * 2) : 0,
      contrast: max - min
    };
  }

  function renderQuality(prefix, canvas) {
    const metrics = qualityMetrics(canvas);
    if (!metrics) return;
    setText(`${prefix}Brightness`, metrics.brightness.toFixed(1));
    setText(`${prefix}Sharpness`, metrics.sharpness.toFixed(1));
    setText(`${prefix}Contrast`, metrics.contrast.toFixed(1));
  }

  function drawDecoderInputPreview(canvas, meta) {
    const preview = $('decoderInputCanvas');
    if (!preview || !canvas) return;
    const max = 420;
    const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
    preview.width = Math.max(1, Math.round(canvas.width * scale));
    preview.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = preview.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, preview.width, preview.height);
    ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
    setText('decoderInputWidth', canvas.width);
    setText('decoderInputHeight', canvas.height);
    setText('decoderInputCrop', meta?.crop || '-');
    setText('decoderInputRotation', meta?.rotation || '0');
    setText('decoderInputProcessing', meta?.processing || 'original');
    setText('decoderInputBarcodePixels', meta?.barcodePixels || `${canvas.width} x ${canvas.height}`);
  }

  async function decodeCanvasWithSelections(source, metaBase) {
    const processingModes = selectedValues('processing');
    const rotations = selectedValues('rotation');
    let lastResult = null;

    for (const mode of processingModes) {
      const processed = processedCanvas(source, mode);
      for (const rotation of rotations) {
        const rotated = rotatedCanvas(processed, Number(rotation));
        if (!rotated.width || !rotated.height || IdScan?.canvasLooksEmptyBlack?.(rotated)) continue;
        drawDecoderInputPreview(rotated, {
          ...(metaBase || {}),
          rotation: `${rotation} deg`,
          processing: mode
        });
        const ctx = rotated.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, rotated.width, rotated.height);
        const read = await runBarcodeRead(imageData, diagnosticPdf417Options({ tryRotate: false }));
        lastResult = read.first || lastResult;
        const decoded = read.results.find((result) => isPdf417(result) && hasDecodedText(result));
        if (decoded) {
          return {
            candidate: decoded,
            variant: `${mode}, ${rotation} deg`,
            ms: read.ms,
            resultCount: read.results.length,
            lastResult: read.first || decoded
          };
        }
      }
    }
    return { candidate: null, variant: 'none', ms: 0, resultCount: 0, lastResult };
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
    live.pdf417Successes = 0;
    live.aamvaSuccesses = 0;
    live.lastDecodeMs = 0;
    live.lastFormat = 'none';
    live.lastVariant = 'none';
    live.lastRaw = '';
    live.lastError = '';
    live.startedAt = live.running ? performance.now() : 0;
    live.lastPdf417Payload = '';
    live.lastAamvaPayload = '';
    live.lastCandidateInfo = '-';
    live.matchingPdf417Reads = 0;
    live.matchingAamvaReads = 0;
    live.pdf417Detected = false;
    live.aamvaDetected = false;
    live.selfTestDetected = false;
    $('livePdf417Banner').hidden = true;
    $('liveSelfTestBanner').hidden = true;
    $('liveNonAamvaNote').hidden = true;
    $('liveValidBanner').hidden = true;
    clearParsed('live');
    renderDecodedText();
    updateLiveMetrics('Idle');
    setError('liveError', '');
    updateInterpretation();
  }

  function updateLiveMetrics(status) {
    const video = $('liveVideo');
    rememberActiveDimensions(video);
    const elapsedSec = live.startedAt ? Math.max(0.001, (performance.now() - live.startedAt) / 1000) : 0;
    const rate = elapsedSec ? live.attempts / elapsedSec : 0;
    const target = selectedTestTarget() === 'state_id' ? 'State ID / Driver License' : 'Scanner Self-Test';
    setText('liveCameraState', live.running ? 'ACTIVE' : 'OFF');
    setText('liveFrameSize', `${video?.videoWidth || 0} x ${video?.videoHeight || 0}`);
    setText('liveTarget', target);
    setText('liveAttempts', live.attempts);
    setText('livePdf417Successes', live.pdf417Successes);
    setText('liveScanRate', `${rate.toFixed(1)}/sec`);
    setText('liveDecodeMs', live.lastDecodeMs ? `${live.lastDecodeMs} ms` : '-');
    setText('liveFormat', live.lastFormat || 'none');
    setText('livePdf417Detected', yesNo(live.pdf417Detected));
    setText('livePdf417Matches', `${live.matchingPdf417Reads} / ${REQUIRED_MATCHES}`);
    setText('liveAamva', yesNo(live.aamvaDetected));
    setText('liveAamvaSuccesses', live.aamvaSuccesses);
    setText('liveAamvaMatches', `${live.matchingAamvaReads} / ${REQUIRED_MATCHES}`);
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
    try {
      const hit = await decodeCanvasWithSelections(source, {
        crop: selectedRegionMode(),
        barcodePixels: selectedRegionMode() === 'guide' ? `${source.width} x ${source.height}` : '-'
      });
      live.lastDecodeMs = hit.ms || 0;
      live.lastCandidateInfo = resultDiagnosticSummary(hit.lastResult);
      if (!hit.candidate) {
        live.lastFormat = resultFormat(hit.lastResult);
        live.aamvaDetected = false;
        updateLiveMetrics(hit.lastResult ? 'Candidate rejected' : 'Searching...');
        return;
      }

      const payload = String(hit.candidate.text || '');
      const isAamva = !!IdScan?.looksLikeAamvaPdf417?.(payload);
      const isSelfTest = payload === SELFTEST_TEXT;
      live.pdf417Successes += 1;
      live.lastFormat = resultFormat(hit.candidate);
      live.lastVariant = hit.variant;
      live.pdf417Detected = true;
      live.aamvaDetected = isAamva;
      live.selfTestDetected = isSelfTest;
      live.lastRaw = payload;
      if (payload === live.lastPdf417Payload) live.matchingPdf417Reads += 1;
      else live.matchingPdf417Reads = 1;
      live.lastPdf417Payload = payload;
      if (isAamva) {
        live.aamvaSuccesses += 1;
        if (payload === live.lastAamvaPayload) live.matchingAamvaReads += 1;
        else live.matchingAamvaReads = 1;
        live.lastAamvaPayload = payload;
        renderParsed('live', payload);
        $('liveValidBanner').hidden = live.matchingAamvaReads < REQUIRED_MATCHES;
        if (navigator.vibrate) {
          try { navigator.vibrate(60); } catch {}
        }
      } else {
        clearParsed('live');
        $('liveValidBanner').hidden = true;
        live.matchingAamvaReads = 0;
        live.lastAamvaPayload = '';
      }
      $('livePdf417Banner').hidden = false;
      $('liveSelfTestBanner').hidden = !(selectedTestTarget() === 'selftest' && isSelfTest && live.matchingPdf417Reads >= REQUIRED_MATCHES);
      $('liveNonAamvaNote').hidden = isAamva;
      renderDecodedText();
      const target = selectedTestTarget();
      let status = isAamva ? 'PDF417 detected; valid AAMVA State ID' : 'PDF417 detected, but not AAMVA';
      if (isSelfTest && target === 'selftest' && live.matchingPdf417Reads >= REQUIRED_MATCHES) {
        status = 'Live iPad PDF417 scanning works; self-test barcode is not AAMVA';
      } else if (isSelfTest) {
        status = 'PDF417 self-test detected; waiting for matching read';
      } else if (target === 'state_id' && isAamva && live.matchingAamvaReads >= REQUIRED_MATCHES) {
        status = 'Valid AAMVA State ID';
      }
      updateLiveMetrics(status);
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
    photo.file = null;
    photo.sourceCanvas = null;
    photo.dimensions = '-';
    photo.detected = false;
    photo.aamvaDetected = false;
    photo.directSuccess = false;
    photo.directMs = 0;
    photo.directCount = 0;
    photo.directFormat = '-';
    photo.directCandidateInfo = '-';
    photo.allFormatsSuccess = false;
    photo.allFormatsFormat = '-';
    photo.allFormatsMs = 0;
    photo.manualCropSuccess = false;
    photo.manualCropMs = 0;
    photo.manualCropDimensions = '-';
    photo.manualCropVariant = 'none';
    photo.decodeMs = 0;
    photo.variant = 'none';
    photo.lastError = '';
    photo.directPhotoResult = emptyDecodeState();
    photo.allFormatsResult = emptyDecodeState();
    photo.manualCropResult = emptyDecodeState();
    crop.lastMapping = null;
    setText('photoDimensions', '-');
    setText('directResultCount', '-');
    setText('directFormat', '-');
    setText('directError', '-');
    setText('directDecodeMs', '-');
    setText('photoDetected', 'NO');
    setText('photoAamva', 'NO');
    setText('photoDecodeMs', '-');
    setText('photoVariant', 'none');
    setText('allFormatsDetected', 'NO');
    setText('allFormatsFormat', '-');
    setText('photoStatus', 'Idle');
    setText('photoBrightness', '-');
    setText('photoSharpness', '-');
    setText('photoContrast', '-');
    setText('manualCropDimensions', '-');
    setText('manualCropDetected', 'NO');
    setText('manualCropMs', '-');
    setText('manualCropVariant', 'none');
    clearParsed('photo');
    setError('photoError', '');
    setCropToolVisible(false);
    clearDecoderInputPreview();
    clearCropMappingDiagnostics();
    updateInterpretation();
  }

  function clearDecoderInputPreview() {
    const canvas = $('decoderInputCanvas');
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 1, 1);
    }
    setText('decoderInputWidth', '-');
    setText('decoderInputHeight', '-');
    setText('decoderInputCrop', '-');
    setText('decoderInputRotation', '-');
    setText('decoderInputProcessing', '-');
    setText('decoderInputBarcodePixels', '-');
  }

  function clearCropMappingDiagnostics() {
    crop.lastMapping = null;
    const canvas = $('cropMappingCanvas');
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 1, 1);
    }
    setText('cropElementSize', '-');
    setText('cropNaturalSize', '-');
    setText('cropRenderedRect', '-');
    setText('cropDisplaySelection', '-');
    setText('cropNaturalSelection', '-');
    setText('cropMappingValid', 'NO');
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

  async function decodeDirectOriginalFile(file) {
    setText('directResultCount', 'running');
    const read = await runBarcodeRead(file, diagnosticPdf417Options());
    const decoded = read.results.find((result) => isPdf417(result) && hasDecodedText(result));
    const resultState = {
      ...emptyDecodeState(),
      success: !!decoded,
      ms: read.ms,
      count: read.results.length,
      format: resultFormat(decoded || read.first),
      candidateInfo: resultDiagnosticSummary(decoded || read.first),
      variant: 'direct original File'
    };
    photo.directPhotoResult = resultState;
    photo.directCount = read.results.length;
    photo.directMs = read.ms;
    photo.directSuccess = !!decoded;
    photo.directFormat = resultState.format;
    photo.directCandidateInfo = resultState.candidateInfo;
    setText('directResultCount', read.results.length);
    setText('directFormat', resultState.format);
    setText('directError', resultState.candidateInfo);
    setText('directDecodeMs', `${read.ms} ms`);
    return decoded || null;
  }

  async function handlePhotoSelected(ev) {
    const file = ev?.target?.files?.[0] || null;
    if (!file) return;
    clearPhotoResult();
    photo.file = file;
    try {
      photo.objectUrl = URL.createObjectURL(file);
      $('photoPreview').src = photo.objectUrl;
      $('photoPreview').hidden = false;
      $('photoPlaceholder').hidden = true;
      setText('photoStatus', 'Direct original File decode...');

      const directDecoded = await decodeDirectOriginalFile(file);
      if (directDecoded) {
        const payload = String(directDecoded.text || '');
        photo.detected = true;
        photo.variant = 'direct original File';
        photo.aamvaDetected = !!IdScan?.looksLikeAamvaPdf417?.(payload);
        setText('photoDetected', 'YES');
        setText('photoVariant', photo.variant);
        setText('photoAamva', yesNo(photo.aamvaDetected));
        if (photo.aamvaDetected) renderParsed('photo', payload);
      }

      setText('photoStatus', 'Preparing canvas diagnostics...');
      const source = await imageFileToCanvas(file);
      photo.sourceCanvas = source;
      photo.dimensions = `${source.width} x ${source.height}`;
      setText('photoDimensions', photo.dimensions);
      if (!source.width || !source.height || IdScan?.canvasLooksEmptyBlack?.(source)) throw new Error('Image decode failed or frame is blank');
      renderQuality('photo', source);
      setCropRect({ x: 0.1, y: 0.55, w: 0.8, h: 0.3 });

      const hit = await decodeCanvasWithSelections(source, {
        crop: 'full image canvas',
        barcodePixels: '-'
      });
      photo.decodeMs = hit.ms || 0;
      setText('photoDecodeMs', photo.decodeMs ? `${photo.decodeMs} ms` : '-');
      if (hit.candidate) {
        const payload = String(hit.candidate.text || '');
        photo.detected = true;
        photo.variant = hit.variant;
        photo.aamvaDetected = !!IdScan?.looksLikeAamvaPdf417?.(payload);
        setText('photoDetected', 'YES');
        setText('photoVariant', photo.variant);
        setText('photoAamva', yesNo(photo.aamvaDetected));
        if (photo.aamvaDetected) renderParsed('photo', payload);
        setText('photoStatus', photo.aamvaDetected ? 'Valid AAMVA' : 'PDF417 detected');
      } else {
        setText('photoStatus', directDecoded ? 'Direct original File decoded; canvas variants did not' : 'PDF417 decode returned no result');
      }
    } catch (err) {
      photo.lastError = errorText(err);
      setText('photoStatus', 'Error');
      setError('photoError', err);
    } finally {
      updateDiagnostics();
      updateInterpretation();
    }
  }

  async function tryAllFormats() {
    if (!photo.file) {
      setError('photoError', new Error('Take a barcode photo first'));
      return;
    }
    try {
      setText('allFormatsDetected', 'running');
      const read = await runBarcodeRead(photo.file, allFormatsOptions());
      const decoded = read.results.find(hasDecodedText);
      const resultState = {
        ...emptyDecodeState(),
        success: !!decoded,
        ms: read.ms,
        count: read.results.length,
        format: resultFormat(decoded || read.first),
        candidateInfo: resultDiagnosticSummary(decoded || read.first),
        variant: 'all formats original File'
      };
      photo.allFormatsResult = resultState;
      photo.allFormatsSuccess = resultState.success;
      photo.allFormatsFormat = resultState.format;
      photo.allFormatsMs = resultState.ms;
      setText('allFormatsDetected', yesNo(resultState.success));
      setText('allFormatsFormat', `${resultState.format}; ${resultState.ms} ms; ${resultState.candidateInfo}`);
      setText('photoStatus', resultState.success ? 'All-formats barcode detected' : 'All-formats found no barcode');
    } catch (err) {
      photo.lastError = errorText(err);
      setError('photoError', err);
    } finally {
      updateInterpretation();
    }
  }

  function setCropToolVisible(show) {
    const stage = $('cropStage');
    if (!stage) return;
    stage.hidden = !show || !photo.objectUrl;
    if (!stage.hidden && $('cropImage')?.src !== photo.objectUrl) {
      const img = $('cropImage');
      img.onload = () => renderCropBox();
      img.src = photo.objectUrl;
    }
    renderCropBox();
  }

  function setCropRect(next) {
    const x = Math.max(0, Math.min(0.98, Number(next.x)));
    const y = Math.max(0, Math.min(0.98, Number(next.y)));
    const w = Math.max(0.04, Math.min(1 - x, Number(next.w)));
    const h = Math.max(0.04, Math.min(1 - y, Number(next.h)));
    crop.rect = { x, y, w, h };
    renderCropBox();
  }

  function renderCropBox() {
    const box = $('cropBox');
    if (!box) return;
    const stage = $('cropStage');
    const rendered = getRenderedImageRect($('cropImage'));
    if (!stage || !rendered || rendered.width <= 0 || rendered.height <= 0) {
      box.style.left = `${crop.rect.x * 100}%`;
      box.style.top = `${crop.rect.y * 100}%`;
      box.style.width = `${crop.rect.w * 100}%`;
      box.style.height = `${crop.rect.h * 100}%`;
      clearCropMappingDiagnostics();
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const left = (rendered.left - stageRect.left) + stage.scrollLeft + (crop.rect.x * rendered.width);
    const top = (rendered.top - stageRect.top) + stage.scrollTop + (crop.rect.y * rendered.height);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${crop.rect.w * rendered.width}px`;
    box.style.height = `${crop.rect.h * rendered.height}px`;
    try {
      renderCropMappingDiagnostics(displayCropToNaturalPixels(crop.rect, 0));
    } catch {
      clearCropMappingDiagnostics();
    }
  }

  function getRenderedImageRect(img) {
    if (!img) return null;
    const elementRect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || photo.sourceCanvas?.width || 0;
    const naturalHeight = img.naturalHeight || photo.sourceCanvas?.height || 0;
    if (!elementRect.width || !elementRect.height || !naturalWidth || !naturalHeight) {
      return {
        left: elementRect.left,
        top: elementRect.top,
        width: elementRect.width,
        height: elementRect.height,
        elementRect,
        naturalWidth,
        naturalHeight
      };
    }

    const fit = getComputedStyle(img).objectFit || 'fill';
    if (fit !== 'contain' && fit !== 'scale-down') {
      return {
        left: elementRect.left,
        top: elementRect.top,
        width: elementRect.width,
        height: elementRect.height,
        elementRect,
        naturalWidth,
        naturalHeight
      };
    }

    const scale = Math.min(elementRect.width / naturalWidth, elementRect.height / naturalHeight);
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    return {
      left: elementRect.left + ((elementRect.width - renderedWidth) / 2),
      top: elementRect.top + ((elementRect.height - renderedHeight) / 2),
      width: renderedWidth,
      height: renderedHeight,
      elementRect,
      naturalWidth,
      naturalHeight
    };
  }

  function displayCropToNaturalPixels(rect, margin) {
    if (!photo.sourceCanvas) throw new Error('Take a barcode photo first');
    const img = $('cropImage');
    const rendered = getRenderedImageRect(img);
    const sourceWidth = photo.sourceCanvas.width;
    const sourceHeight = photo.sourceCanvas.height;
    const pad = Number(margin || 0);
    const x = Math.max(0, Math.min(1, rect.x - pad));
    const y = Math.max(0, Math.min(1, rect.y - pad));
    const right = Math.max(x, Math.min(1, rect.x + rect.w + pad));
    const bottom = Math.max(y, Math.min(1, rect.y + rect.h + pad));
    const sx = Math.max(0, Math.min(sourceWidth - 1, Math.round(x * sourceWidth)));
    const sy = Math.max(0, Math.min(sourceHeight - 1, Math.round(y * sourceHeight)));
    const sw = Math.max(1, Math.min(sourceWidth - sx, Math.round((right - x) * sourceWidth)));
    const sh = Math.max(1, Math.min(sourceHeight - sy, Math.round((bottom - y) * sourceHeight)));
    const displaySelection = rendered ? {
      x: rect.x * rendered.width,
      y: rect.y * rendered.height,
      w: rect.w * rendered.width,
      h: rect.h * rendered.height
    } : null;
    return {
      valid: !!rendered && rendered.width > 0 && rendered.height > 0 && sw > 0 && sh > 0,
      rendered,
      sourceWidth,
      sourceHeight,
      displaySelection,
      sx,
      sy,
      sw,
      sh,
      coords: `x=${sx}, y=${sy}, w=${sw}, h=${sh}`
    };
  }

  function formatRect(rect) {
    if (!rect) return '-';
    const parts = ['left', 'top', 'width', 'height'].filter((key) => rect[key] != null);
    if (!parts.length) return '-';
    return parts.map((key) => `${key}=${Math.round(Number(rect[key]) * 10) / 10}`).join(', ');
  }

  function renderCropMappingDiagnostics(mapping) {
    if (!mapping) {
      clearCropMappingDiagnostics();
      return;
    }
    const elementRect = mapping.rendered?.elementRect || null;
    const rendered = mapping.rendered ? {
      left: mapping.rendered.left - (elementRect?.left || 0),
      top: mapping.rendered.top - (elementRect?.top || 0),
      width: mapping.rendered.width,
      height: mapping.rendered.height
    } : null;
    setText('cropElementSize', elementRect ? `${Math.round(elementRect.width)} x ${Math.round(elementRect.height)}` : '-');
    setText('cropNaturalSize', `${mapping.sourceWidth} x ${mapping.sourceHeight}`);
    setText('cropRenderedRect', formatRect(rendered));
    setText('cropDisplaySelection', mapping.displaySelection ? formatRect({
      left: mapping.displaySelection.x,
      top: mapping.displaySelection.y,
      width: mapping.displaySelection.w,
      height: mapping.displaySelection.h
    }) : '-');
    setText('cropNaturalSelection', mapping.coords);
    setText('cropMappingValid', yesNo(mapping.valid));
    crop.lastMapping = mapping;
    drawCropMappingCheck(mapping);
  }

  function drawCropMappingCheck(mapping) {
    const canvas = $('cropMappingCanvas');
    if (!canvas || !mapping || !photo.sourceCanvas) return;
    const max = 420;
    const scale = Math.min(1, max / Math.max(photo.sourceCanvas.width, photo.sourceCanvas.height));
    canvas.width = Math.max(1, Math.round(photo.sourceCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(photo.sourceCanvas.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo.sourceCanvas, 0, 0, canvas.width, canvas.height);
    ctx.lineWidth = Math.max(3, Math.round(5 * scale));
    ctx.strokeStyle = '#ffca28';
    ctx.fillStyle = 'rgb(255 202 40 / 0.12)';
    ctx.fillRect(mapping.sx * scale, mapping.sy * scale, mapping.sw * scale, mapping.sh * scale);
    ctx.strokeRect(mapping.sx * scale, mapping.sy * scale, mapping.sw * scale, mapping.sh * scale);
  }

  function cropCanvasFromRect() {
    const mapping = displayCropToNaturalPixels(crop.rect, 0.025);
    if (!mapping.valid) throw new Error('Crop coordinates are outside the rendered image');
    renderCropMappingDiagnostics(mapping);
    const { sx, sy, sw, sh } = mapping;
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(photo.sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return { canvas, coords: mapping.coords, mapping };
  }

  async function decodeManualCrop() {
    try {
      const cropped = cropCanvasFromRect();
      photo.manualCropDimensions = `${cropped.canvas.width} x ${cropped.canvas.height}`;
      setText('manualCropDimensions', photo.manualCropDimensions);
      renderQuality('photo', cropped.canvas);
      const variants = ['original', 'grayscale', 'contrast'];
      let lastResult = null;
      const started = performance.now();
      for (const variant of variants) {
        const canvas = processedCanvas(cropped.canvas, variant);
        drawDecoderInputPreview(canvas, {
          crop: cropped.coords,
          rotation: 'library native',
          processing: variant,
          barcodePixels: `${canvas.width} x ${canvas.height}`
        });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const read = await runBarcodeRead(ctx.getImageData(0, 0, canvas.width, canvas.height), diagnosticPdf417Options());
        lastResult = read.first || lastResult;
        const decoded = read.results.find((result) => isPdf417(result) && hasDecodedText(result));
        if (decoded) {
          const resultState = {
            ...emptyDecodeState(),
            success: true,
            ms: Math.round(performance.now() - started),
            count: read.results.length,
            format: resultFormat(decoded),
            candidateInfo: resultDiagnosticSummary(decoded),
            dimensions: photo.manualCropDimensions,
            variant
          };
          photo.manualCropResult = resultState;
          photo.manualCropSuccess = true;
          photo.manualCropMs = resultState.ms;
          photo.manualCropVariant = variant;
          photo.detected = true;
          photo.variant = `manual crop, ${variant}`;
          const payload = String(decoded.text || '');
          photo.aamvaDetected = !!IdScan?.looksLikeAamvaPdf417?.(payload);
          setText('manualCropDetected', 'YES');
          setText('manualCropMs', `${photo.manualCropMs} ms`);
          setText('manualCropVariant', variant);
          setText('photoDetected', 'YES');
          setText('photoVariant', photo.variant);
          setText('photoAamva', yesNo(photo.aamvaDetected));
          if (photo.aamvaDetected) renderParsed('photo', payload);
          setText('photoStatus', photo.aamvaDetected ? 'Manual crop valid AAMVA' : 'Manual crop PDF417 detected');
          updateInterpretation();
          return;
        }
      }
      photo.manualCropSuccess = false;
      photo.manualCropMs = Math.round(performance.now() - started);
      photo.manualCropResult = {
        ...emptyDecodeState(),
        success: false,
        ms: photo.manualCropMs,
        dimensions: photo.manualCropDimensions,
        variant: 'manual crop',
        candidateInfo: resultDiagnosticSummary(lastResult),
        format: resultFormat(lastResult)
      };
      setText('manualCropDetected', 'NO');
      setText('manualCropMs', `${photo.manualCropMs} ms`);
      setText('manualCropVariant', resultDiagnosticSummary(lastResult));
      setText('photoStatus', 'Manual crop did not decode');
    } catch (err) {
      photo.lastError = errorText(err);
      setError('photoError', err);
    } finally {
      updateInterpretation();
    }
  }

  function applyCropPreset(name) {
    if (!photo.objectUrl) {
      setError('photoError', new Error('Take a barcode photo first'));
      return;
    }
    setCropToolVisible(true);
    if (name === 'bottom50') setCropRect({ x: 0, y: 0.5, w: 1, h: 0.5 });
    else if (name === 'bottom35') setCropRect({ x: 0, y: 0.65, w: 1, h: 0.35 });
    else if (name === 'center50') setCropRect({ x: 0.1, y: 0.25, w: 0.8, h: 0.5 });
    else setCropRect({ x: 0, y: 0, w: 1, h: 1 });
  }

  function pointerToCropPoint(ev) {
    const rect = getRenderedImageRect($('cropImage'));
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
    };
  }

  function cropPointerDown(ev) {
    if (!photo.objectUrl) return;
    ev.preventDefault();
    const p = pointerToCropPoint(ev);
    const r = crop.rect;
    const nearHandle = Math.abs(p.x - (r.x + r.w)) < 0.08 && Math.abs(p.y - (r.y + r.h)) < 0.08;
    const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    crop.dragging = true;
    crop.mode = nearHandle ? 'resize' : inside ? 'move' : 'draw';
    crop.startX = p.x;
    crop.startY = p.y;
    crop.startRect = { ...crop.rect };
    if (crop.mode === 'draw') setCropRect({ x: p.x, y: p.y, w: 0.08, h: 0.08 });
    $('cropStage').setPointerCapture?.(ev.pointerId);
  }

  function cropPointerMove(ev) {
    if (!crop.dragging) return;
    ev.preventDefault();
    const p = pointerToCropPoint(ev);
    const r = crop.startRect;
    if (crop.mode === 'move') {
      setCropRect({
        x: r.x + (p.x - crop.startX),
        y: r.y + (p.y - crop.startY),
        w: r.w,
        h: r.h
      });
    } else if (crop.mode === 'resize') {
      setCropRect({
        x: r.x,
        y: r.y,
        w: p.x - r.x,
        h: p.y - r.y
      });
    } else {
      setCropRect({
        x: Math.min(crop.startX, p.x),
        y: Math.min(crop.startY, p.y),
        w: Math.abs(p.x - crop.startX),
        h: Math.abs(p.y - crop.startY)
      });
    }
  }

  function cropPointerUp(ev) {
    crop.dragging = false;
    crop.mode = '';
    try { $('cropStage').releasePointerCapture?.(ev.pointerId); } catch {}
  }

  async function runSelfTest() {
    setError('selfTestError', '');
    $('selfTestPass').hidden = true;
    $('selfTestFail').hidden = true;
    setText('selfTestStatus', 'Running...');
    try {
      const res = await fetch(SELFTEST_FIXTURE, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Self-test fixture fetch failed: HTTP ${res.status}`);
      const blob = await res.blob();
      const read = await runBarcodeRead(blob, diagnosticPdf417Options());
      const decoded = read.results.find((result) => isPdf417(result) && hasDecodedText(result));
      selfTest.hasRun = true;
      selfTest.success = !!decoded && String(decoded.text || '') === SELFTEST_TEXT;
      selfTest.ms = read.ms;
      selfTest.count = read.results.length;
      selfTest.format = resultFormat(decoded || read.first);
      setText('selfTestCount', read.results.length);
      setText('selfTestFormat', selfTest.format);
      setText('selfTestMatches', yesNo(selfTest.success));
      setText('selfTestMs', `${read.ms} ms`);
      setText('selfTestStatus', selfTest.success ? 'PDF417 decoder working' : 'DECODER PIPELINE FAILURE');
      $('selfTestPass').hidden = !selfTest.success;
      $('selfTestFail').hidden = selfTest.success;
    } catch (err) {
      selfTest.hasRun = true;
      selfTest.success = false;
      selfTest.lastError = errorText(err);
      $('selfTestFail').hidden = false;
      setText('selfTestStatus', 'DECODER PIPELINE FAILURE');
      setError('selfTestError', err);
    } finally {
      await refreshWasmDiagnostics();
      updateInterpretation();
    }
  }

  async function refreshWasmDiagnostics() {
    const meta = IdScan?.zxingMetadata?.() || {};
    setText('diagZxingVersion', meta.jsVersion || '3.1.2');
    setText('diagZxingWasmVersion', meta.wasmVersion || '-');
    setText('diagZxingCppCommit', meta.cppCommit || '-');
    setText('diagZxingSha', meta.wasmSha256 || '-');
    setText('diagWasmUrl', meta.readerWasmUrl || '-');
    setText('diagWasmPath', meta.expectedWasmPath || '-');
    if (!IdScan?.fetchZxingWasmInfo) return;
    try {
      wasmInfoPromise = wasmInfoPromise || IdScan.fetchZxingWasmInfo();
      wasmInfo = await wasmInfoPromise;
      setText('diagWasmFetch', yesNo(wasmInfo.ok));
      setText('diagWasmContentType', wasmInfo.contentType || '-');
      setText('diagWasmBytes', wasmInfo.byteSize || '-');
      if (!meta.wasmSha256 && wasmInfo.sha256) setText('diagZxingSha', wasmInfo.sha256);
    } catch (err) {
      setText('diagWasmFetch', `NO: ${errorText(err)}`);
    }
  }

  function updateInterpretation() {
    let text = 'Run the decoder self-test and photo tests.';
    const directSuccess = photo.directPhotoResult.success;
    const allFormatsSuccess = photo.allFormatsResult.success;
    const manualCropSuccess = photo.manualCropResult.success;
    if (selfTest.hasRun && !selfTest.success) {
      text = 'CASE A: Self-test FAILS -> ZXing integration/WASM problem. Do not spend time tuning the iPad camera until the decoder pipeline is fixed.';
    } else if (selfTest.success && live.selfTestDetected && live.matchingPdf417Reads >= REQUIRED_MATCHES && !live.aamvaDetected) {
      text = 'LIVE SELF-TEST: iPad rear camera and local PDF417 decoding are working. This barcode is intentionally not an AAMVA State ID.';
    } else if (selfTest.success && !directSuccess && manualCropSuccess) {
      text = 'CASE B: Self-test PASSES, direct original photo FAILS, manual tight crop PASSES -> image framing/crop problem.';
    } else if (selfTest.success && directSuccess) {
      text = 'CASE C: Self-test PASSES and direct original photo PASSES -> custom preprocessing/live path is the likely problem.';
    } else if (selfTest.success && photo.file && !directSuccess && !manualCropSuccess && !allFormatsSuccess) {
      text = 'CASE D: Self-test PASSES, direct original photo FAILS, manual crop FAILS, all-formats FAILS -> investigate real barcode image quality or alternate decoder.';
    }
    setText('interpretation', text);
  }

  function stopAll(options) {
    const opts = options || {};
    stopCameraTest();
    stopLiveScan();
    if (!opts.keepPhoto) clearPhotoResult();
  }

  function selectTab(name) {
    stopAll({ keepPhoto: name === 'photo' });
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
    setText('diagPdf417Support', yesNo(!!IdScan?.DIAGNOSTIC_PDF417_OPTIONS?.formats?.includes('PDF417')));
    refreshWasmDiagnostics();
  }

  function buildDiagnosticReport() {
    const options = diagnosticPdf417Options();
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
      `Last active camera dimensions: ${camera.lastActiveWidth} x ${camera.lastActiveHeight}`,
      `ZXing JS version: ${IdScan?.zxingMetadata?.().jsVersion || '3.1.2'}`,
      `ZXING_WASM_VERSION: ${IdScan?.zxingMetadata?.().wasmVersion || '-'}`,
      `ZXING_CPP_COMMIT: ${IdScan?.zxingMetadata?.().cppCommit || '-'}`,
      `ZXING_WASM_SHA256: ${IdScan?.zxingMetadata?.().wasmSha256 || wasmInfo?.sha256 || '-'}`,
      `WASM URL: ${IdScan?.zxingReaderWasmUrl?.() || '-'}`,
      `WASM expected path: ${IdScan?.zxingMetadata?.().expectedWasmPath || '-'}`,
      `WASM loaded: ${wasmInfo ? yesNo(wasmInfo.ok).toLowerCase() : 'not checked'}`,
      `WASM content type: ${wasmInfo?.contentType || '-'}`,
      `WASM byte size: ${wasmInfo?.byteSize || '-'}`,
      `Self-test success: ${yesNo(selfTest.success).toLowerCase()}`,
      `Self-test decode ms: ${selfTest.ms || '-'}`,
      `Test Target: ${selectedTestTarget() === 'state_id' ? 'State ID / Driver License' : 'Scanner Self-Test'}`,
      `Direct photo result: success=${yesNo(photo.directPhotoResult.success).toLowerCase()}; count=${photo.directPhotoResult.count}; format=${photo.directPhotoResult.format}; ms=${photo.directPhotoResult.ms || '-'}; candidate=${photo.directPhotoResult.candidateInfo}`,
      `All-formats result: success=${yesNo(photo.allFormatsResult.success).toLowerCase()}; count=${photo.allFormatsResult.count}; format=${photo.allFormatsResult.format}; ms=${photo.allFormatsResult.ms || '-'}; candidate=${photo.allFormatsResult.candidateInfo}`,
      `Manual crop result: success=${yesNo(photo.manualCropResult.success).toLowerCase()}; dimensions=${photo.manualCropResult.dimensions || photo.manualCropDimensions}; variant=${photo.manualCropResult.variant}; ms=${photo.manualCropResult.ms || '-'}; candidate=${photo.manualCropResult.candidateInfo}`,
      `Manual crop mapping valid: ${yesNo(!!crop.lastMapping?.valid).toLowerCase()}`,
      `Natural image dimensions: ${crop.lastMapping ? `${crop.lastMapping.sourceWidth} x ${crop.lastMapping.sourceHeight}` : photo.dimensions}`,
      `Rendered image dimensions: ${crop.lastMapping?.rendered ? `${Math.round(crop.lastMapping.rendered.width)} x ${Math.round(crop.lastMapping.rendered.height)}` : '-'}`,
      `Mapped crop dimensions: ${crop.lastMapping ? `${crop.lastMapping.sw} x ${crop.lastMapping.sh}` : '-'}`,
      `Live attempts: ${live.attempts}`,
      `Live PDF417 total successes: ${live.pdf417Successes}`,
      `Live matching PDF417 reads: ${live.matchingPdf417Reads} / ${REQUIRED_MATCHES}`,
      `Live AAMVA successes: ${live.aamvaSuccesses}`,
      `Live matching AAMVA reads: ${live.matchingAamvaReads} / ${REQUIRED_MATCHES}`,
      `Live candidate/error: ${live.lastCandidateInfo}`,
      `Decode options: formats=${options.formats.join(',')}; tryHarder=${options.tryHarder}; tryRotate=${options.tryRotate}; tryInvert=${options.tryInvert}; tryDownscale=${options.tryDownscale}; tryDenoise=${options.tryDenoise}; binarizer=${options.binarizer}; returnErrors=${options.returnErrors}`,
      `Interpretation: ${$('interpretation')?.textContent || '-'}`
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
    renderDecodeOptions();
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    });
    $('startCameraBtn')?.addEventListener('click', startCameraTest);
    $('stopCameraBtn')?.addEventListener('click', stopCameraTest);
    $('runSelfTestBtn')?.addEventListener('click', runSelfTest);
    $('startLiveBtn')?.addEventListener('click', startLiveScan);
    $('stopLiveBtn')?.addEventListener('click', stopLiveScan);
    $('clearLiveBtn')?.addEventListener('click', clearLiveResults);
    $('showDecodedText')?.addEventListener('change', renderDecodedText);
    $$('input[name="testTarget"]').forEach((input) => {
      input.addEventListener('change', () => clearLiveResults());
    });
    $('takePhotoBtn')?.addEventListener('click', () => $('barcodePhotoInput')?.click());
    $('takeAnotherPhotoBtn')?.addEventListener('click', () => {
      clearPhotoResult();
      $('barcodePhotoInput')?.click();
    });
    $('tryAllFormatsBtn')?.addEventListener('click', tryAllFormats);
    $('clearPhotoBtn')?.addEventListener('click', clearPhotoResult);
    $('barcodePhotoInput')?.addEventListener('change', handlePhotoSelected);
    $('showCropToolBtn')?.addEventListener('click', () => setCropToolVisible(true));
    $('decodeCropBtn')?.addEventListener('click', decodeManualCrop);
    $$('.cropPreset').forEach((button) => {
      button.addEventListener('click', () => applyCropPreset(button.dataset.preset));
    });
    $('cropStage')?.addEventListener('pointerdown', cropPointerDown);
    $('cropStage')?.addEventListener('pointermove', cropPointerMove);
    $('cropStage')?.addEventListener('pointerup', cropPointerUp);
    $('cropStage')?.addEventListener('pointercancel', cropPointerUp);
    $('refreshDiagnosticsBtn')?.addEventListener('click', updateDiagnostics);
    $('copyDiagnosticsBtn')?.addEventListener('click', copyDiagnosticReport);
    window.addEventListener('pagehide', () => stopAll({ keepPhoto: false }));
    window.addEventListener('beforeunload', () => stopAll({ keepPhoto: false }));
    updateDiagnostics();
    updateCameraMetrics();
    updateLiveMetrics('Idle');
    clearParsed('live');
    clearParsed('photo');
    clearDecoderInputPreview();
    clearCropMappingDiagnostics();
    updateInterpretation();
  }

  bindEvents();
})();
