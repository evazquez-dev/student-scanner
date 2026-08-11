(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.EagleNestVisitorIdScan = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCRIPT_BASE = (() => {
    if (typeof document !== 'undefined' && document.currentScript?.src) {
      return new URL('./', document.currentScript.src).toString();
    }
    if (typeof location !== 'undefined') return new URL('./visitor/', location.href).toString();
    return './';
  })();

  const VERSIONS = {
    zxingWasm: '3.1.2',
    tesseract: '7.0.0',
    tesseractCore: '7.0.0',
    tesseractEngData: '1.0.0'
  };

  const PDF417_READER_OPTIONS = {
    formats: ['PDF417'],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 1,
    textMode: 'HRI'
  };

  const STATE_ID_REQUIRED_MATCHES = 2;
  const STATE_ID_SCAN_INTERVAL_MS = 240;
  const STATE_ID_TIMEOUT_MS = 14000;
  const IDNYC_ANALYZE_INTERVAL_MS = 180;
  const IDNYC_STABLE_FRAMES = 4;
  const IDNYC_STABLE_MS = 650;

  const scriptPromises = new Map();
  let zxingReadyPromise = null;
  let tesseractReadyPromise = null;

  function assetUrl(path) {
    return new URL(path, SCRIPT_BASE).toString();
  }

  function loadScriptOnce(src, globalName) {
    if (globalName && root[globalName]) return Promise.resolve(root[globalName]);
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('browser_required'));
        return;
      }
      const existing = Array.from(document.scripts || []).find((node) => node.dataset?.envisitSrc === src);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? root[globalName] : true), { once: true });
        existing.addEventListener('error', () => reject(new Error('script_load_failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.envisitSrc = src;
      script.onload = () => resolve(globalName ? root[globalName] : true);
      script.onerror = () => reject(new Error('script_load_failed'));
      document.head.appendChild(script);
    });
    scriptPromises.set(src, promise);
    return promise;
  }

  function stopStream(stream, video) {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
    }
    if (video) {
      try { video.pause?.(); } catch {}
      video.srcObject = null;
    }
  }

  async function startRearCamera(video) {
    if (!video || !root.navigator?.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
    const stream = await root.navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;
    try { await video.play(); } catch {}
    await waitForVideoReady(video);
    return stream;
  }

  function waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 3500;
      function check() {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('camera_frame_unavailable'));
          return;
        }
        root.requestAnimationFrame ? root.requestAnimationFrame(check) : setTimeout(check, 35);
      }
      check();
    });
  }

  function frameCrop(video, mode) {
    const width = Number(video?.videoWidth || 0);
    const height = Number(video?.videoHeight || 0);
    if (!width || !height) return null;
    if (mode === 'idnyc') {
      return {
        sx: Math.round(width * 0.08),
        sy: Math.round(height * 0.18),
        sw: Math.round(width * 0.84),
        sh: Math.round(height * 0.64),
        dw: 1040,
        dh: 660
      };
    }
    return {
      sx: Math.round(width * 0.06),
      sy: Math.round(height * 0.31),
      sw: Math.round(width * 0.88),
      sh: Math.round(height * 0.38),
      dw: 960,
      dh: 420
    };
  }

  function canvasLooksEmptyBlack(canvas) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !canvas.width || !canvas.height) return true;
      let samples = 0;
      let black = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const px = Math.max(0, Math.min(canvas.width - 1, Math.round((x + 0.5) * canvas.width / 8)));
          const py = Math.max(0, Math.min(canvas.height - 1, Math.round((y + 0.5) * canvas.height / 8)));
          const data = ctx.getImageData(px, py, 1, 1).data;
          samples += 1;
          if (data[3] > 240 && data[0] <= 3 && data[1] <= 3 && data[2] <= 3) black += 1;
        }
      }
      return samples > 0 && black / samples > 0.98;
    } catch {
      return false;
    }
  }

  function drawVideoGuideCanvas(video, mode) {
    const crop = frameCrop(video, mode);
    if (!crop || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = crop.dw;
    canvas.height = crop.dh;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);
    if (canvasLooksEmptyBlack(canvas)) return null;
    return canvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('image_encode_failed'));
        else resolve(blob);
      }, type || 'image/jpeg', quality == null ? 0.86 : quality);
    });
  }

  async function prepareZxing() {
    if (zxingReadyPromise) return zxingReadyPromise;
    zxingReadyPromise = (async () => {
      const wasmPath = assetUrl(`vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/zxing_reader.wasm`);
      await loadScriptOnce(assetUrl(`vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/index.js`), 'ZXingWASM');
      const zxing = root.ZXingWASM;
      if (!zxing?.readBarcodes) throw new Error('pdf417_decoder_unavailable');
      const overrides = {
        locateFile(name) {
          return String(name || '').endsWith('.wasm') ? wasmPath : assetUrl(`vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/${name}`);
        }
      };
      if (typeof zxing.setZXingModuleOverrides === 'function') zxing.setZXingModuleOverrides(overrides);
      return zxing;
    })();
    return zxingReadyPromise;
  }

  function decodedText(result) {
    return String(result?.text || result?.bytes || result?.rawBytes || '').trim();
  }

  async function readPdf417Candidates(input, options) {
    const zxing = await prepareZxing();
    const readerOptions = {
      ...PDF417_READER_OPTIONS,
      ...(options || {}),
      formats: ['PDF417']
    };
    const results = await zxing.readBarcodes(input, readerOptions);
    return (results || []).map((result) => ({
      text: decodedText(result),
      format: String(result?.format || '').trim(),
      symbology: String(result?.symbology || '').trim()
    })).filter((result) => result.text);
  }

  function looksLikeAamvaPdf417(text) {
    const raw = String(text || '');
    if (raw.length < 35 || !/ANSI\s+\d{6}/.test(raw.replace(/\s+/g, ' '))) return false;
    return /(?:^|[\r\n\x1e])DCS[A-Z ,.'-]{1,120}/i.test(raw)
      && /(?:^|[\r\n\x1e])(?:DAC|DCT)[A-Z ,.'-]{1,120}/i.test(raw)
      && /(?:^|[\r\n\x1e])DBB\d{8}/i.test(raw);
  }

  async function decodePdf417ImageData(imageData) {
    const results = await readPdf417Candidates(imageData);
    const hit = (results || []).find((result) => {
      const format = String(result?.format || result?.symbology || '').toUpperCase();
      return format.includes('PDF417') && looksLikeAamvaPdf417(result.text);
    });
    return hit ? hit.text : '';
  }

  async function decodePdf417Blob(blob) {
    if (!blob || !String(blob.type || '').toLowerCase().startsWith('image/')) throw new Error('id_image_required');
    const results = await readPdf417Candidates(blob);
    const hit = (results || []).find((result) => {
      const format = String(result?.format || result?.symbology || '').toUpperCase();
      return format.includes('PDF417') && looksLikeAamvaPdf417(result.text);
    });
    return hit ? hit.text : '';
  }

  function createFrameScheduler(video, callback, intervalMs) {
    let active = false;
    let timer = 0;
    let videoCallback = 0;
    async function run() {
      if (!active) return;
      try {
        await callback();
      } catch {
        // Scanner loops must continue after transient frame/decoder failures.
      } finally {
        schedule();
      }
    }
    function schedule() {
      if (!active) return;
      if (video?.requestVideoFrameCallback) {
        videoCallback = video.requestVideoFrameCallback(() => {
          timer = setTimeout(run, intervalMs);
        });
      } else {
        timer = setTimeout(run, intervalMs);
      }
    }
    return {
      start() {
        active = true;
        schedule();
      },
      stop() {
        active = false;
        if (timer) clearTimeout(timer);
        timer = 0;
        if (videoCallback && video?.cancelVideoFrameCallback) {
          try { video.cancelVideoFrameCallback(videoCallback); } catch {}
        }
        videoCallback = 0;
      }
    };
  }

  function createStateIdAutoScanner(options) {
    const opts = options || {};
    const video = opts.video;
    const requiredMatches = Number(opts.requiredMatches || STATE_ID_REQUIRED_MATCHES);
    const scanIntervalMs = Number(opts.scanIntervalMs || STATE_ID_SCAN_INTERVAL_MS);
    const timeoutMs = Number(opts.timeoutMs || STATE_ID_TIMEOUT_MS);
    let stream = null;
    let scheduler = null;
    let timeoutTimer = 0;
    let decodeBusy = false;
    let active = false;
    let lastPayload = '';
    let matchingDecodes = 0;

    function state(name, detail) {
      try { opts.onState?.(name, detail || {}); } catch {}
    }

    function stop() {
      active = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = 0;
      scheduler?.stop();
      scheduler = null;
      stopStream(stream, video);
      stream = null;
      lastPayload = '';
      matchingDecodes = 0;
      decodeBusy = false;
    }

    async function analyzeFrame() {
      if (!active || decodeBusy) return;
      const canvas = drawVideoGuideCanvas(video, 'pdf417');
      if (!canvas) {
        state('scanning', { hint: 'moveCloser' });
        return;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      decodeBusy = true;
      try {
        const payload = await decodePdf417ImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (!payload) {
          state('scanning', { hint: 'placeBarcode' });
          return;
        }
        if (payload === lastPayload) matchingDecodes += 1;
        else {
          lastPayload = payload;
          matchingDecodes = 1;
        }
        state(matchingDecodes >= requiredMatches ? 'success' : 'confirming_candidate', { matches: matchingDecodes });
        if (matchingDecodes >= requiredMatches) {
          const accepted = payload;
          stop();
          opts.onSuccess?.(accepted);
        }
      } catch {
        state('scanning', { hint: 'placeBarcode' });
      } finally {
        decodeBusy = false;
      }
    }

    async function start() {
      if (active) return;
      active = true;
      state('camera_starting');
      try {
        stream = await startRearCamera(video);
        if (!active) return;
        state('scanning', { hint: 'placeBarcode' });
        timeoutTimer = setTimeout(() => {
          if (!active) return;
          state('failed', { reason: 'timeout' });
          stop();
          opts.onTimeout?.();
        }, timeoutMs);
        scheduler = createFrameScheduler(video, analyzeFrame, scanIntervalMs);
        scheduler.start();
      } catch {
        stop();
        state('failed', { reason: 'camera_unavailable' });
        opts.onFailure?.('camera_unavailable');
      }
    }

    return { start, stop, decodePdf417Blob };
  }

  function frameQuality(canvas) {
    const ctx = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!ctx || !canvas.width || !canvas.height) return { ok: false, reason: 'frame_unavailable' };
    if (canvasLooksEmptyBlack(canvas)) return { ok: false, reason: 'tooDark' };
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(Math.min(canvas.width, canvas.height) / 72));
    let count = 0;
    let sum = 0;
    let dark = 0;
    let bright = 0;
    let contrastSum = 0;
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
        if (lum < 28) dark += 1;
        if (lum > 244) bright += 1;
        contrastSum += Math.abs(lum - lumRight) + Math.abs(lum - lumDown);
      }
    }
    const average = count ? sum / count : 0;
    const darkRatio = count ? dark / count : 1;
    const brightRatio = count ? bright / count : 1;
    const sharpness = count ? contrastSum / (count * 2) : 0;
    const ok = average >= 42 && average <= 225 && darkRatio < 0.62 && brightRatio < 0.54 && sharpness >= 5.5;
    let reason = 'holdSteady';
    if (average < 42 || darkRatio >= 0.62) reason = 'tooDark';
    else if (average > 225 || brightRatio >= 0.54) reason = 'tooMuchGlare';
    else if (sharpness < 5.5) reason = 'moveCloser';
    return { ok, reason, average, darkRatio, brightRatio, sharpness };
  }

  function metricsStable(prev, next) {
    if (!prev || !next) return false;
    return Math.abs(prev.average - next.average) <= 12
      && Math.abs(prev.sharpness - next.sharpness) <= 7
      && Math.abs(prev.darkRatio - next.darkRatio) <= 0.08
      && Math.abs(prev.brightRatio - next.brightRatio) <= 0.08;
  }

  function createIdnycAutoCapture(options) {
    const opts = options || {};
    const video = opts.video;
    let stream = null;
    let scheduler = null;
    let active = false;
    let stableFrames = 0;
    let stableStartedAt = 0;
    let previousMetrics = null;
    let capturing = false;

    function state(name, detail) {
      try { opts.onState?.(name, detail || {}); } catch {}
    }

    function stop() {
      active = false;
      scheduler?.stop();
      scheduler = null;
      stopStream(stream, video);
      stream = null;
      stableFrames = 0;
      stableStartedAt = 0;
      previousMetrics = null;
      capturing = false;
    }

    async function captureGoodFrame(canvas) {
      if (capturing || !active || !canvas || canvasLooksEmptyBlack(canvas)) return;
      capturing = true;
      state('capturing');
      try {
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
        if (!blob || blob.size <= 0) throw new Error('idnyc_capture_failed');
        stop();
        opts.onCapture?.(blob);
      } catch {
        capturing = false;
        state('positioning', { hint: 'holdSteady' });
      }
    }

    async function analyzeFrame() {
      if (!active || capturing) return;
      const canvas = drawVideoGuideCanvas(video, 'idnyc');
      if (!canvas) {
        stableFrames = 0;
        previousMetrics = null;
        state('positioning', { hint: 'centerCard' });
        return;
      }
      const metrics = frameQuality(canvas);
      const stable = metrics.ok && metricsStable(previousMetrics, metrics);
      previousMetrics = metrics;
      if (!metrics.ok) {
        stableFrames = 0;
        stableStartedAt = 0;
        state('positioning', { hint: metrics.reason });
        return;
      }
      if (stable) {
        stableFrames += 1;
        if (!stableStartedAt) stableStartedAt = Date.now();
      } else {
        stableFrames = 1;
        stableStartedAt = Date.now();
      }
      const stableMs = Date.now() - stableStartedAt;
      state('stable', { stableFrames, stableMs, hint: 'holdSteady' });
      if (stableFrames >= IDNYC_STABLE_FRAMES && stableMs >= IDNYC_STABLE_MS) {
        await captureGoodFrame(canvas);
      }
    }

    async function start() {
      if (active) return;
      active = true;
      state('camera_starting');
      try {
        stream = await startRearCamera(video);
        if (!active) return;
        state('positioning', { hint: 'centerCard' });
        scheduler = createFrameScheduler(video, analyzeFrame, IDNYC_ANALYZE_INTERVAL_MS);
        scheduler.start();
      } catch {
        stop();
        state('failed', { reason: 'camera_unavailable' });
        opts.onFailure?.('camera_unavailable');
      }
    }

    return { start, stop };
  }

  async function readTextWithTextDetector(blob) {
    if (!root.TextDetector) return '';
    let bitmap = null;
    try {
      bitmap = await root.createImageBitmap(blob, { imageOrientation: 'from-image' });
      const detector = new root.TextDetector();
      const rows = await detector.detect(bitmap);
      return (rows || []).map((row) => String(row.rawValue || row.detectedText || '').trim()).filter(Boolean).join('\n');
    } catch {
      return '';
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }

  function looksLikeUsableIdnycText(text) {
    const raw = String(text || '');
    if (!raw.trim()) return false;
    const hasDob = /(?:DOB|DATE OF BIRTH|FECHA DE NACIMIENTO|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i.test(raw);
    const hasNameLine = raw.split(/\r?\n/).some((line) => {
      const cleaned = line.replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length < 4 || cleaned.length > 60) return false;
      if (/IDNYC|NEW YORK|CARD|DATE|BIRTH|ADDRESS|HEIGHT|EYES|SEX/i.test(cleaned)) return false;
      return /^[A-Za-z][A-Za-z .'-]+$/.test(cleaned) && cleaned.split(/\s+/).length <= 5;
    });
    return hasDob && hasNameLine;
  }

  async function prepareTesseract() {
    if (tesseractReadyPromise) return tesseractReadyPromise;
    tesseractReadyPromise = (async () => {
      await loadScriptOnce(assetUrl(`vendor/tesseract.js/${VERSIONS.tesseract}/tesseract.min.js`), 'Tesseract');
      if (!root.Tesseract?.createWorker) throw new Error('ocr_unavailable');
      return root.Tesseract;
    })();
    return tesseractReadyPromise;
  }

  async function readTextWithTesseract(blob) {
    const tesseract = await prepareTesseract();
    let worker = null;
    try {
      worker = await tesseract.createWorker('eng', 1, {
        workerPath: assetUrl(`vendor/tesseract.js/${VERSIONS.tesseract}/worker.min.js`),
        corePath: assetUrl(`vendor/tesseract.js-core/${VERSIONS.tesseractCore}/tesseract-core-lstm.wasm.js`),
        langPath: assetUrl(`vendor/tesseract.js-data/eng/${VERSIONS.tesseractEngData}`),
        cacheMethod: 'none',
        gzip: true,
        workerBlobURL: true,
        logger: function () {}
      });
      if (typeof worker.setParameters === 'function') {
        await worker.setParameters({
          tessedit_pageseg_mode: tesseract.PSM?.SPARSE_TEXT || '11',
          user_defined_dpi: '300'
        });
      }
      const result = await worker.recognize(blob);
      return String(result?.data?.text || '');
    } finally {
      try { await worker?.terminate?.(); } catch {}
    }
  }

  async function recognizeIdnycImage(blob) {
    if (!blob || !String(blob.type || '').toLowerCase().startsWith('image/')) throw new Error('idnyc_image_required');
    let text = await readTextWithTextDetector(blob);
    if (looksLikeUsableIdnycText(text)) {
      return text;
    }
    text = '';
    text = await readTextWithTesseract(blob);
    return text;
  }

  return {
    VERSIONS,
    PDF417_READER_OPTIONS,
    STATE_ID_REQUIRED_MATCHES,
    STATE_ID_SCAN_INTERVAL_MS,
    STATE_ID_TIMEOUT_MS,
    IDNYC_ANALYZE_INTERVAL_MS,
    IDNYC_STABLE_FRAMES,
    IDNYC_STABLE_MS,
    assetUrl,
    startRearCamera,
    stopStream,
    drawVideoGuideCanvas,
    canvasLooksEmptyBlack,
    looksLikeAamvaPdf417,
    readPdf417Candidates,
    decodePdf417ImageData,
    decodePdf417Blob,
    createStateIdAutoScanner,
    createIdnycAutoCapture,
    frameQuality,
    looksLikeUsableIdnycText,
    recognizeIdnycImage
  };
});
