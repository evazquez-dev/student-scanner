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
    tryDenoise: true,
    binarizer: 'LocalAverage',
    maxNumberOfSymbols: 1,
    returnErrors: true,
    textMode: 'HRI'
  };

  const DIAGNOSTIC_PDF417_OPTIONS = {
    ...PDF417_READER_OPTIONS,
    tryDenoise: true,
    binarizer: 'LocalAverage',
    returnErrors: true
  };

  const QR_READER_OPTIONS = {
    formats: ['QRCode'],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 1,
    returnErrors: true
  };

  const STATE_ID_REQUIRED_MATCHES = 2;
  const STATE_ID_SCAN_INTERVAL_MS = 240;
  const RETURNING_QR_SCAN_INTERVAL_MS = 180;
  const STATE_ID_TIMEOUT_MS = 14000;
  const IDNYC_ANALYZE_INTERVAL_MS = 180;
  const IDNYC_STABLE_FRAMES = 4;
  const IDNYC_STABLE_MS = 650;
  const IDNYC_LIVE_MAX_CAPTURES = 3;
  const IDNYC_LIVE_TIMEOUT_MS = 26000;
  const IDNYC_CAPTURE_COOLDOWN_MS = 450;

  const scriptPromises = new Map();
  let zxingReadyPromise = null;
  let tesseractReadyPromise = null;

  function assetUrl(path) {
    return new URL(path, SCRIPT_BASE).toString();
  }

  function zxingReaderJsUrl() {
    return assetUrl(`vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/index.js`);
  }

  function zxingReaderWasmUrl() {
    return assetUrl(`vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/zxing_reader.wasm`);
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
        width: { ideal: 1920 },
        height: { ideal: 1080 }
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

  function getRenderedVideoRect(video) {
    if (!video) return null;
    const elementRect = video.getBoundingClientRect?.() || null;
    const naturalWidth = Number(video.videoWidth || 0);
    const naturalHeight = Number(video.videoHeight || 0);
    if (!elementRect || !elementRect.width || !elementRect.height || !naturalWidth || !naturalHeight) return null;
    const fit = root.getComputedStyle ? (root.getComputedStyle(video).objectFit || 'fill') : 'fill';
    if (fit !== 'cover' && fit !== 'contain' && fit !== 'scale-down') {
      return { left: elementRect.left, top: elementRect.top, width: elementRect.width, height: elementRect.height, elementRect, naturalWidth, naturalHeight };
    }
    const scale = fit === 'cover'
      ? Math.max(elementRect.width / naturalWidth, elementRect.height / naturalHeight)
      : Math.min(elementRect.width / naturalWidth, elementRect.height / naturalHeight);
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

  function guideToVideoPixels(video, guideEl) {
    const rendered = getRenderedVideoRect(video);
    const guideRect = guideEl?.getBoundingClientRect?.() || null;
    if (!rendered || !guideRect) return null;
    const left = Math.max(guideRect.left, rendered.left);
    const top = Math.max(guideRect.top, rendered.top);
    const right = Math.min(guideRect.right, rendered.left + rendered.width);
    const bottom = Math.min(guideRect.bottom, rendered.top + rendered.height);
    if (right <= left || bottom <= top) return null;
    const normalizedLeft = Math.max(0, Math.min(1, (left - rendered.left) / rendered.width));
    const normalizedTop = Math.max(0, Math.min(1, (top - rendered.top) / rendered.height));
    const normalizedRight = Math.max(normalizedLeft, Math.min(1, (right - rendered.left) / rendered.width));
    const normalizedBottom = Math.max(normalizedTop, Math.min(1, (bottom - rendered.top) / rendered.height));
    const sx = Math.max(0, Math.min(video.videoWidth - 1, Math.round(normalizedLeft * video.videoWidth)));
    const sy = Math.max(0, Math.min(video.videoHeight - 1, Math.round(normalizedTop * video.videoHeight)));
    const sw = Math.max(1, Math.min(video.videoWidth - sx, Math.round((normalizedRight - normalizedLeft) * video.videoWidth)));
    const sh = Math.max(1, Math.min(video.videoHeight - sy, Math.round((normalizedBottom - normalizedTop) * video.videoHeight)));
    return { sx, sy, sw, sh, valid: sw > 0 && sh > 0 };
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

  function drawVideoGuideCanvas(video, mode, guideEl) {
    const useGuide = (mode === 'pdf417' || mode === 'qr') && guideEl;
    const crop = useGuide ? guideToVideoPixels(video, guideEl) : frameCrop(video, mode);
    if (!crop || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = useGuide ? crop.sw : crop.dw;
    canvas.height = useGuide ? crop.sh : crop.dh;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
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

  function copyCanvas(canvas) {
    const next = document.createElement('canvas');
    next.width = canvas.width;
    next.height = canvas.height;
    const ctx = next.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return next;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, next.width, next.height);
    ctx.drawImage(canvas, 0, 0);
    return next;
  }

  function processedCanvas(source, mode) {
    const next = copyCanvas(source);
    if (mode === 'original') return next;
    const ctx = next.getContext('2d', { willReadFrequently: true });
    if (!ctx) return next;
    const image = ctx.getImageData(0, 0, next.width, next.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
      const value = mode === 'contrast' ? Math.max(0, Math.min(255, (lum - 128) * 1.45 + 128)) : lum;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return next;
  }

  async function imageBlobToCanvas(blob) {
    if (!blob || !String(blob.type || '').toLowerCase().startsWith('image/')) throw new Error('id_image_required');
    if (typeof document === 'undefined') throw new Error('canvas_unavailable');
    if (typeof root.createImageBitmap === 'function') {
      const bitmap = await root.createImageBitmap(blob, { imageOrientation: 'from-image' });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!ctx) throw new Error('canvas_unavailable');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        return canvas;
      } finally {
        try { bitmap.close(); } catch {}
      }
    }
    if (typeof root.Image === 'undefined' || typeof root.URL === 'undefined') throw new Error('image_decode_unavailable');
    const url = root.URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const node = new root.Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error('image_decode_failed'));
        node.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!ctx) throw new Error('canvas_unavailable');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      return canvas;
    } finally {
      try { root.URL.revokeObjectURL(url); } catch {}
    }
  }

  function cropCanvasByNormalized(source, rect) {
    const x = Math.max(0, Math.min(1, Number(rect.x)));
    const y = Math.max(0, Math.min(1, Number(rect.y)));
    const right = Math.max(x, Math.min(1, x + Number(rect.w)));
    const bottom = Math.max(y, Math.min(1, y + Number(rect.h)));
    const sx = Math.max(0, Math.min(source.width - 1, Math.round(x * source.width)));
    const sy = Math.max(0, Math.min(source.height - 1, Math.round(y * source.height)));
    const sw = Math.max(1, Math.min(source.width - sx, Math.round((right - x) * source.width)));
    const sh = Math.max(1, Math.min(source.height - sy, Math.round((bottom - y) * source.height)));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return canvas;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  }

  async function prepareZxing() {
    if (zxingReadyPromise) return zxingReadyPromise;
    zxingReadyPromise = (async () => {
      const wasmPath = zxingReaderWasmUrl();
      await loadScriptOnce(zxingReaderJsUrl(), 'ZXingWASM');
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

  function copyByteArray(value) {
    if (!value) return null;
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (ArrayBuffer.isView(value) && value.buffer) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (Array.isArray(value)) return new Uint8Array(value.filter((byte) => Number.isFinite(byte)).map((byte) => byte & 0xff));
    return null;
  }

  function latin1FromBytes(bytes) {
    const data = copyByteArray(bytes);
    if (!data) return '';
    let out = '';
    for (let i = 0; i < data.length; i += 1) out += String.fromCharCode(data[i]);
    return out;
  }

  function decodedText(result) {
    return String(result?.text || latin1FromBytes(result?.bytes || result?.rawBytes) || '').trim();
  }

  function resultPosition(result) {
    const pos = result?.position || result?.positionInImage || result?.boundingBox || null;
    if (!pos) return null;
    try {
      return JSON.parse(JSON.stringify(pos));
    } catch {
      return null;
    }
  }

  function normalizeReadResult(result) {
    const bytes = copyByteArray(result?.bytes || result?.rawBytes || null);
    return {
      text: decodedText(result),
      bytes,
      bytesECI: result?.bytesECI == null ? null : result.bytesECI,
      format: String(result?.format || '').trim(),
      symbology: String(result?.symbology || '').trim(),
      error: String(result?.error || result?.ecLevel || '').trim(),
      valid: result?.valid == null ? !!decodedText(result) : !!result.valid,
      position: resultPosition(result)
    };
  }

  async function readBarcodeResults(input, options) {
    const zxing = await prepareZxing();
    const readerOptions = {
      ...PDF417_READER_OPTIONS,
      ...(options || {})
    };
    if (!Array.isArray(readerOptions.formats)) readerOptions.formats = ['PDF417'];
    const results = await zxing.readBarcodes(input, readerOptions);
    return (results || []).map(normalizeReadResult);
  }

  async function readPdf417Candidates(input, options) {
    const readerOptions = {
      ...PDF417_READER_OPTIONS,
      ...(options || {}),
      formats: ['PDF417']
    };
    const results = await readBarcodeResults(input, readerOptions);
    return results.filter((result) => result.text || result.bytes?.length);
  }

  async function readQrCandidates(input, options) {
    const readerOptions = {
      ...QR_READER_OPTIONS,
      ...(options || {}),
      formats: ['QRCode']
    };
    const results = await readBarcodeResults(input, readerOptions);
    return results.filter((result) => result.text || result.bytes?.length);
  }

  async function fetchZxingWasmInfo() {
    const url = zxingReaderWasmUrl();
    const res = await fetch(url, { cache: 'no-store' });
    const bytes = await res.arrayBuffer();
    let sha256 = '';
    try {
      const digest = await root.crypto?.subtle?.digest?.('SHA-256', bytes);
      if (digest) sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
    return {
      ok: res.ok,
      url,
      expectedPath: `visitor/vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/zxing_reader.wasm`,
      contentType: res.headers.get('content-type') || '',
      byteSize: bytes.byteLength,
      sha256
    };
  }

  function zxingMetadata() {
    const zxing = root.ZXingWASM || {};
    return {
      jsVersion: VERSIONS.zxingWasm,
      wasmVersion: zxing.ZXING_WASM_VERSION || '',
      cppCommit: zxing.ZXING_CPP_COMMIT || '',
      wasmSha256: zxing.ZXING_WASM_SHA256 || '',
      readerJsUrl: zxingReaderJsUrl(),
      readerWasmUrl: zxingReaderWasmUrl(),
      expectedWasmPath: `visitor/vendor/zxing-wasm/${VERSIONS.zxingWasm}/reader/zxing_reader.wasm`
    };
  }

  function looksLikeAamvaPdf417(text) {
    const raw = String(text || '');
    if (raw.length < 35 || !/ANSI\s+\d{6}/.test(raw.replace(/\s+/g, ' '))) return false;
    return /(?:^|[\r\n\x1e])DCS[A-Z ,.'-]{1,120}/i.test(raw)
      && /(?:^|[\r\n\x1e])(?:DAC|DCT)[A-Z ,.'-]{1,120}/i.test(raw)
      && /(?:^|[\r\n\x1e])DBB\d{8}/i.test(raw);
  }

  function isPdf417Result(result) {
    const format = String(result?.format || result?.symbology || '').toUpperCase();
    return format.includes('PDF417');
  }

  function parseStateIdResult(result) {
    const parser = root.EagleNestVisitor?.parseAamva;
    if (typeof parser !== 'function') return { ok: false, complete: false, error: 'aamva_parser_unavailable', data: {} };
    return parser(result);
  }

  function isCompleteStateIdParse(parsed) {
    const data = parsed?.data || {};
    return !!(parsed?.ok && data.visitor_first_name && data.visitor_last_name && data.date_of_birth);
  }

  function stateIdFingerprint(result) {
    const bytes = copyByteArray(result?.bytes || result?.rawBytes || null);
    let hash = 2166136261;
    if (bytes) {
      for (let i = 0; i < bytes.length; i += 1) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 16777619);
      }
      return `${bytes.length}:${(hash >>> 0).toString(16)}`;
    }
    const text = decodedText(result);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
  }

  function pickStateIdResult(results) {
    let partial = null;
    (results || []).forEach((result) => {
      if (partial?.complete) return;
      const format = String(result?.format || result?.symbology || '').toUpperCase();
      if (!format.includes('PDF417')) return;
      const parsed = parseStateIdResult(result);
      if (!parsed?.ok) return;
      const candidate = {
        result,
        parsed,
        complete: isCompleteStateIdParse(parsed),
        fingerprint: stateIdFingerprint(result)
      };
      if (candidate.complete || !partial) partial = candidate;
    });
    return partial;
  }

  async function decodePdf417ImageData(imageData) {
    const results = await readPdf417Candidates(imageData);
    return pickStateIdResult(results);
  }

  async function decodeStateIdCanvas(canvas) {
    let bestPartial = null;
    for (const mode of ['original', 'contrast']) {
      const processed = processedCanvas(canvas, mode);
      if (!processed.width || !processed.height || canvasLooksEmptyBlack(processed)) continue;
      const ctx = processed.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      const candidate = await decodePdf417ImageData(ctx.getImageData(0, 0, processed.width, processed.height));
      if (!candidate) continue;
      candidate.processingVariant = mode;
      if (candidate.complete) return candidate;
      if (!bestPartial) bestPartial = candidate;
    }
    return bestPartial;
  }

  async function decodePdf417Blob(blob) {
    if (!blob || !String(blob.type || '').toLowerCase().startsWith('image/')) throw new Error('id_image_required');
    let bestPartial = null;
    const direct = pickStateIdResult(await readPdf417Candidates(blob));
    if (direct?.complete) return direct;
    if (direct) bestPartial = direct;

    const source = await imageBlobToCanvas(blob);
    if (!source.width || !source.height || canvasLooksEmptyBlack(source)) return bestPartial;
    const presets = [
      { x: 0, y: 0.55, w: 1, h: 0.45 },
      { x: 0, y: 0.65, w: 1, h: 0.35 },
      { x: 0.05, y: 0.48, w: 0.9, h: 0.28 },
      { x: 0, y: 0, w: 1, h: 1 }
    ];
    for (const rect of presets) {
      const canvas = cropCanvasByNormalized(source, rect);
      const candidate = await decodeStateIdCanvas(canvas);
      if (!candidate) continue;
      if (candidate.complete) return candidate;
      if (!bestPartial) bestPartial = candidate;
    }
    return bestPartial;
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
    const guide = opts.guide || opts.guideEl || null;
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
      const canvas = drawVideoGuideCanvas(video, 'pdf417', guide);
      if (!canvas) {
        state('scanning', { hint: 'moveCloser' });
        return;
      }
      decodeBusy = true;
      try {
        const candidate = await decodeStateIdCanvas(canvas);
        if (!candidate) {
          state('scanning', { hint: 'placeBarcode' });
          return;
        }
        if (candidate.fingerprint === lastPayload) matchingDecodes += 1;
        else {
          lastPayload = candidate.fingerprint;
          matchingDecodes = 1;
        }
        const complete = candidate.complete === true;
        state(matchingDecodes >= requiredMatches ? 'success' : 'confirming_candidate', { matches: matchingDecodes, complete });
        if (matchingDecodes >= requiredMatches) {
          const accepted = candidate.result;
          const parsed = candidate.parsed;
          stop();
          if (complete) opts.onSuccess?.(accepted, parsed);
          else opts.onPartial?.(accepted, parsed);
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
        if (!active) {
          stopStream(stream, video);
          stream = null;
          return;
        }
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

  function createReturningBadgeScanner(options) {
    const opts = options || {};
    const video = opts.video;
    const guide = opts.guide || opts.guideEl || null;
    const scanIntervalMs = Number(opts.scanIntervalMs || RETURNING_QR_SCAN_INTERVAL_MS);
    const timeoutMs = Number(opts.timeoutMs || STATE_ID_TIMEOUT_MS);
    let stream = null;
    let scheduler = null;
    let timeoutTimer = 0;
    let decodeBusy = false;
    let active = false;

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
      decodeBusy = false;
    }

    async function analyzeFrame() {
      if (!active || decodeBusy) return;
      const canvas = drawVideoGuideCanvas(video, 'qr', guide);
      if (!canvas) {
        state('scanning', { hint: 'placeQr' });
        return;
      }
      decodeBusy = true;
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        const results = await readQrCandidates(ctx.getImageData(0, 0, canvas.width, canvas.height));
        const found = (results || []).find((result) => decodedText(result).startsWith('ENVISITOR:') || decodedText(result).startsWith('ENVISIT:'));
        if (!found) {
          state('scanning', { hint: 'placeQr' });
          return;
        }
        const text = decodedText(found);
        state('success');
        stop();
        opts.onSuccess?.(text, found);
      } catch {
        state('scanning', { hint: 'placeQr' });
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
        if (!active) {
          stopStream(stream, video);
          stream = null;
          return;
        }
        state('scanning', { hint: 'placeQr' });
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

    return { start, stop };
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
    const maxCaptures = Math.max(1, Math.min(5, Number(opts.maxCaptures || IDNYC_LIVE_MAX_CAPTURES) || IDNYC_LIVE_MAX_CAPTURES));
    const timeoutMs = Math.max(5000, Math.min(60000, Number(opts.timeoutMs || IDNYC_LIVE_TIMEOUT_MS) || IDNYC_LIVE_TIMEOUT_MS));
    let stream = null;
    let scheduler = null;
    let timeoutHandle = null;
    let active = false;
    let stableFrames = 0;
    let stableStartedAt = 0;
    let previousMetrics = null;
    let capturing = false;
    let finishing = false;
    let timedOut = false;
    let startedAt = 0;
    let captureCount = 0;
    let cooldownUntil = 0;

    function state(name, detail) {
      try { opts.onState?.(name, detail || {}); } catch {}
    }

    function elapsedMs() {
      return startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    }

    function resetStability() {
      stableFrames = 0;
      stableStartedAt = 0;
      previousMetrics = null;
    }

    function haltCamera() {
      scheduler?.stop();
      scheduler = null;
      stopStream(stream, video);
      stream = null;
    }

    function stop() {
      active = false;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      timeoutHandle = null;
      haltCamera();
      resetStability();
      capturing = false;
    }

    function finish(kind, detail = {}) {
      if (finishing) return;
      finishing = true;
      const info = {
        captureCount,
        maxCaptures,
        elapsedMs: elapsedMs(),
        reason: detail.reason || kind
      };
      stop();
      if (kind === 'complete') {
        try { opts.onComplete?.(info); } catch {}
      } else {
        try { opts.onTimeout?.(info); } catch {}
      }
    }

    function markTimedOut() {
      if (finishing || timedOut) return;
      timedOut = true;
      active = false;
      haltCamera();
      if (!capturing) finish('timeout', { reason: 'timeout' });
    }

    async function captureGoodFrame(canvas) {
      if (capturing || !active || finishing || !canvas || canvasLooksEmptyBlack(canvas)) return;
      capturing = true;
      const attempt = captureCount + 1;
      state('capturing', { attempt, maxCaptures, elapsedMs: elapsedMs() });
      try {
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
        if (!blob || blob.size <= 0) throw new Error('idnyc_capture_failed');
        captureCount = attempt;
        const outcome = await opts.onCapture?.(blob, {
          width: Number(canvas.width || 0),
          height: Number(canvas.height || 0),
          source: 'auto_capture',
          attempt,
          maxCaptures,
          elapsedMs: elapsedMs()
        });
        if (finishing) return;
        if (outcome?.complete === true) {
          finish('complete', { reason: 'complete' });
          return;
        }
        if (timedOut) {
          finish('timeout', { reason: 'timeout' });
          return;
        }
        if (captureCount >= maxCaptures) {
          finish('timeout', { reason: 'max_captures' });
          return;
        }
        if (!active) return;
        capturing = false;
        resetStability();
        cooldownUntil = Date.now() + IDNYC_CAPTURE_COOLDOWN_MS;
        state('positioning', { hint: 'holdSteady', attempt: captureCount + 1, maxCaptures, elapsedMs: elapsedMs() });
      } catch {
        if (timedOut) {
          finish('timeout', { reason: 'timeout' });
          return;
        }
        capturing = false;
        resetStability();
        cooldownUntil = Date.now() + IDNYC_CAPTURE_COOLDOWN_MS;
        state('positioning', { hint: 'holdSteady', attempt: captureCount + 1, maxCaptures, elapsedMs: elapsedMs() });
      }
    }

    async function analyzeFrame() {
      if (!active || capturing || finishing || Date.now() < cooldownUntil) return;
      const canvas = drawVideoGuideCanvas(video, 'idnyc');
      if (!canvas) {
        resetStability();
        state('positioning', { hint: 'centerCard', attempt: captureCount + 1, maxCaptures, elapsedMs: elapsedMs() });
        return;
      }
      const metrics = frameQuality(canvas);
      const stable = metrics.ok && metricsStable(previousMetrics, metrics);
      previousMetrics = metrics;
      if (!metrics.ok) {
        stableFrames = 0;
        stableStartedAt = 0;
        state('positioning', { hint: metrics.reason, attempt: captureCount + 1, maxCaptures, elapsedMs: elapsedMs() });
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
      state('stable', { stableFrames, stableMs, hint: 'holdSteady', attempt: captureCount + 1, maxCaptures, elapsedMs: elapsedMs() });
      if (stableFrames >= IDNYC_STABLE_FRAMES && stableMs >= IDNYC_STABLE_MS) {
        await captureGoodFrame(canvas);
      }
    }

    async function start() {
      if (active || finishing) return;
      active = true;
      startedAt = Date.now();
      timeoutHandle = setTimeout(markTimedOut, timeoutMs);
      state('camera_starting', { attempt: 1, maxCaptures, elapsedMs: 0 });
      try {
        stream = await startRearCamera(video);
        if (!active) {
          stopStream(stream, video);
          stream = null;
          return;
        }
        state('positioning', { hint: 'centerCard', attempt: 1, maxCaptures, elapsedMs: elapsedMs() });
        scheduler = createFrameScheduler(video, analyzeFrame, IDNYC_ANALYZE_INTERVAL_MS);
        scheduler.start();
      } catch {
        stop();
        finishing = true;
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
    const lines = raw.replace(/\r/g, '\n').split('\n').map((line) => String(line || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const birthLabel = /^(?:D[O0]B|D\.?\s*[O0]\.?\s*B\.?|DATE\s*[O0]F\s*B[I1]RTH|FECHA\s+DE\s+NACIMIENTO)\b\s*[:\-]?\s*(.*)$/i;
    const blockingLabel = /^(?:EXPIRATION\s*DATE|EXPIRES?|ISSUANCE\s*DATE|ISSUED|ID\s*(?:NUMBER|NO\.?|#)|NAME|NOMBRE|ADDRESS|DIRECCI[ÓO]N|HEIGHT|EYE\s*COLOR|GENDER|SEX)\b/i;
    const dateToken = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{8})\b/;
    let hasAnchoredBirthDate = false;
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(birthLabel);
      if (!match) continue;
      if (dateToken.test(String(match[1] || ''))) {
        hasAnchoredBirthDate = true;
        break;
      }
      for (let j = i + 1; j < lines.length && j <= i + 2; j += 1) {
        if (blockingLabel.test(lines[j])) break;
        if (dateToken.test(lines[j])) {
          hasAnchoredBirthDate = true;
          break;
        }
      }
      break;
    }
    const hasNameLine = lines.some((line) => {
      const cleaned = line.replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length < 4 || cleaned.length > 60) return false;
      if (/IDNYC|NEW YORK|CARD|DATE|BIRTH|ADDRESS|HEIGHT|EYES|SEX|EXPIR|ISSU/i.test(cleaned)) return false;
      return /^[A-Za-z][A-Za-z .'-]+$/.test(cleaned) && cleaned.split(/\s+/).length <= 5;
    });
    return hasAnchoredBirthDate && hasNameLine;
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

  function idnycOcrStructureScore(text) {
    const raw = String(text || '');
    if (!raw.trim()) return 0;
    const lines = raw.replace(/\r/g, '\n').split('\n').map((line) => String(line || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    let score = 0;
    if (lines.some((line) => /^(?:N\s*A\s*M\s*E|N4ME|NANE|NAMF|NOMBRE)\b/i.test(line))) score += 7;
    if (lines.some((line) => /^(?:D[O0]B|D\.?\s*[O0]\.?\s*B\.?|DATE\s*[O0]F\s*B[I1]RTH|FECHA\s+DE\s+NACIMIENTO)\b/i.test(line))) score += 7;
    if (lines.some((line) => /^(?:EXPIRATION\s*DATE|EXPIRAT[I1][O0]N\s*DATE|EXPIRES?|EXP\.?\s*DATE)\b/i.test(line))) score += 4;
    if (lines.some((line) => /^(?:ID\s*(?:NUMBER|NUM8ER|N[O0]\.?|#))\b/i.test(line))) score += 3;
    if (lines.some((line) => /^(?:NYC\s*IDENTIFICATION\s*CARD|IDNYC)\b/i.test(line))) score += 2;
    const dateLike = /(?:[0-9OQDILSZGB|]{1,4}\s*[\/\.\-]\s*[0-9OQDILSZGB|]{1,2}\s*[\/\.\-]\s*[0-9OQDILSZGB|]{2,4}|[0-9OQDILSZGB|]{8})/i;
    const dateCount = lines.reduce((n, line) => n + (dateLike.test(line) ? 1 : 0), 0);
    score += Math.min(6, dateCount * 3);
    const alphaCount = lines.reduce((n, line) => {
      const cleaned = line.replace(/[^A-Za-z .,'’\-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length < 2 || cleaned.length > 80) return n;
      if (/IDNYC|NEW YORK|CARD|DATE|BIRTH|ADDRESS|HEIGHT|EYES|SEX|EXPIR|ISSU|NUMBER/i.test(cleaned)) return n;
      return /^[A-Za-z][A-Za-z .,'’\-]+$/.test(cleaned) ? n + 1 : n;
    }, 0);
    score += Math.min(4, alphaCount);
    if (looksLikeUsableIdnycText(raw)) score += 6;
    return score;
  }

  async function createIdnycTesseractWorker() {
    const tesseract = await prepareTesseract();
    const worker = await tesseract.createWorker('eng', 1, {
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
    return worker;
  }

  async function readTextWithTesseract(blob) {
    let worker = null;
    try {
      worker = await createIdnycTesseractWorker();
      const result = await worker.recognize(blob);
      return String(result?.data?.text || '');
    } finally {
      try { await worker?.terminate?.(); } catch {}
    }
  }

  function idnycCenteredCardCropCanvas(source) {
    if (!source?.width || !source?.height || typeof document === 'undefined') return null;
    const cardAspect = 1.586;
    const sw = Math.max(1, Math.round(source.width * 0.94));
    const sh = Math.max(1, Math.min(source.height, Math.round(sw / cardAspect)));
    const sx = Math.max(0, Math.round((source.width - sw) / 2));
    const sy = Math.max(0, Math.round((source.height - sh) / 2));
    const outW = 1800;
    const outH = Math.max(1, Math.round(outW / cardAspect));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
    return canvasLooksEmptyBlack(canvas) ? null : canvas;
  }

  async function idnycTesseractEnsemble(blob) {
    const worker = await createIdnycTesseractWorker();
    const candidates = [];
    try {
      async function run(input, variant) {
        const result = await worker.recognize(input);
        const text = String(result?.data?.text || '');
        const score = idnycOcrStructureScore(text);
        candidates.push({ text, variant, score });
        return { text, variant, score };
      }

      let best = await run(blob, 'original');
      if (best.score >= 22) return { ...best, pass_count: 1 };

      let source = null;
      try { source = await imageBlobToCanvas(blob); } catch {}
      if (source) {
        const crop = idnycCenteredCardCropCanvas(source);
        if (crop) {
          const cropContrast = processedCanvas(crop, 'contrast');
          const cropBlob = await canvasToBlob(cropContrast, 'image/jpeg', 0.92);
          const candidate = await run(cropBlob, 'center_card_contrast');
          if (candidate.score > best.score) best = candidate;
          if (best.score >= 22) return { ...best, pass_count: candidates.length };
        }

        const fullContrast = processedCanvas(source, 'contrast');
        const fullBlob = await canvasToBlob(fullContrast, 'image/jpeg', 0.92);
        const candidate = await run(fullBlob, 'full_contrast');
        if (candidate.score > best.score) best = candidate;
      }
      return { ...best, pass_count: candidates.length };
    } finally {
      try { await worker?.terminate?.(); } catch {}
    }
  }

  async function recognizeIdnycImageDetailed(blob) {
    if (!blob || !String(blob.type || '').toLowerCase().startsWith('image/')) throw new Error('idnyc_image_required');
    const started = Date.now();
    let text = await readTextWithTextDetector(blob);
    if (looksLikeUsableIdnycText(text)) {
      return { text, engine: 'text_detector', variant: 'text_detector', pass_count: 1, structure_score: idnycOcrStructureScore(text), duration_ms: Date.now() - started, text_detector_available: !!root.TextDetector };
    }
    text = '';
    const ensemble = await idnycTesseractEnsemble(blob);
    return {
      text: ensemble.text,
      engine: 'tesseract',
      variant: ensemble.variant || 'original',
      pass_count: Number(ensemble.pass_count || 1),
      structure_score: Number(ensemble.score || 0),
      duration_ms: Date.now() - started,
      text_detector_available: !!root.TextDetector
    };
  }

  async function recognizeIdnycImage(blob) {
    const result = await recognizeIdnycImageDetailed(blob);
    return result.text;
  }

  return {
    VERSIONS,
    PDF417_READER_OPTIONS,
    DIAGNOSTIC_PDF417_OPTIONS,
    QR_READER_OPTIONS,
    STATE_ID_REQUIRED_MATCHES,
    STATE_ID_SCAN_INTERVAL_MS,
    RETURNING_QR_SCAN_INTERVAL_MS,
    STATE_ID_TIMEOUT_MS,
    IDNYC_ANALYZE_INTERVAL_MS,
    IDNYC_STABLE_FRAMES,
    IDNYC_STABLE_MS,
    IDNYC_LIVE_MAX_CAPTURES,
    IDNYC_LIVE_TIMEOUT_MS,
    assetUrl,
    zxingReaderJsUrl,
    zxingReaderWasmUrl,
    zxingMetadata,
    fetchZxingWasmInfo,
    startRearCamera,
    stopStream,
    getRenderedVideoRect,
    guideToVideoPixels,
    drawVideoGuideCanvas,
    processedCanvas,
    canvasLooksEmptyBlack,
    looksLikeAamvaPdf417,
    readBarcodeResults,
    readPdf417Candidates,
    readQrCandidates,
    decodePdf417ImageData,
    decodePdf417Blob,
    createStateIdAutoScanner,
    createReturningBadgeScanner,
    createIdnycAutoCapture,
    frameQuality,
    looksLikeUsableIdnycText,
    idnycOcrStructureScore,
    recognizeIdnycImage,
    recognizeIdnycImageDetailed
  };
});
