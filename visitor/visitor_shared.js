(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EagleNestVisitor = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VISITOR_TYPES = {
    parent_guardian: { en: 'Parent / Guardian', es: 'Padre / Madre / Tutor' },
    family_member: { en: 'Family Member', es: 'Familiar' },
    vendor_contractor: { en: 'Vendor / Contractor', es: 'Proveedor / Contratista' },
    school_guest: { en: 'School Guest', es: 'Invitado escolar' },
    government_agency: { en: 'Government / Agency', es: 'Gobierno / Agencia' },
    delivery: { en: 'Delivery', es: 'Entrega' },
    other: { en: 'Other', es: 'Otro' }
  };

  const PURPOSES = {
    student_pickup: { en: 'Student Pickup', es: 'Recoger estudiante' },
    meeting: { en: 'Meeting', es: 'Reunión' },
    enrollment_registration: { en: 'Enrollment / Registration', es: 'Inscripción / Registro' },
    student_services: { en: 'Student Services', es: 'Servicios estudiantiles' },
    iep_special_education: { en: 'IEP / Special Education', es: 'IEP / Educación especial' },
    delivery: { en: 'Delivery', es: 'Entrega' },
    maintenance_facilities: { en: 'Maintenance / Facilities', es: 'Mantenimiento / Instalaciones' },
    school_event: { en: 'School Event', es: 'Evento escolar' },
    other: { en: 'Other', es: 'Otro' }
  };

  const FORBIDDEN_KEYS = [
    'DAQ', 'DBB', 'DAG', 'DAI', 'DAK', 'DBC', 'DAU', 'DAW', 'DAY',
    'document_number', 'driver_license_number', 'license_number', 'id_number',
    'date_of_birth', 'dob', 'address', 'home_address', 'zip', 'postal_code',
    'sex', 'gender', 'height', 'weight', 'eye_color', 'raw', 'raw_scan',
    'raw_pdf417', 'raw_aamva', 'barcode', 'barcode_raw', 'passport_number'
  ];

  function cleanText(value, maxLen) {
    const n = Number.isFinite(Number(maxLen)) ? Math.max(1, Number(maxLen)) : 160;
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch;
    });
  }

  function label(map, key, lang) {
    const rec = map[String(key || '')] || null;
    if (!rec) return cleanText(key || '', 80);
    return rec[String(lang || 'en')] || rec.en || '';
  }

  function parseAamvaDate(value) {
    const s = String(value || '').replace(/\D+/g, '');
    if (s.length !== 8) return null;
    let y, m, d;
    const first4 = Number(s.slice(0, 4));
    if (first4 >= 1900 && first4 <= 2100) {
      y = first4;
      m = Number(s.slice(4, 6));
      d = Number(s.slice(6, 8));
    } else {
      m = Number(s.slice(0, 2));
      d = Number(s.slice(2, 4));
      y = Number(s.slice(4, 8));
    }
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  }

  function parseAamva(rawInput, options) {
    let raw = String(rawInput == null ? '' : rawInput);
    const now = options && options.now ? new Date(options.now) : new Date();
    try {
      if (!raw || raw.length < 20 || !/(^|[\r\n\x1e])(DCS|DAC|DCT|DBA|DAJ)/.test(raw)) {
        raw = '';
        return { ok: false, error: 'unrecognized_id_barcode', data: {} };
      }

      const fields = {};
      const keep = { DCS: true, DAC: true, DAD: true, DCT: true, DBA: true, DAJ: true, DAB: true };
      raw
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split(/\n|\x1e/g)
        .forEach(function (line) {
          const s = String(line || '').trim();
          if (s.length < 4) return;
          const code = s.slice(0, 3).toUpperCase();
          if (!/^[A-Z0-9]{3}$/.test(code)) return;
          if (!keep[code]) return;
          fields[code] = cleanText(s.slice(3), 160);
        });

      const firstFromDct = cleanText(fields.DCT || '', 100).split(/[,\s]+/).filter(Boolean);
      const first = cleanText(fields.DAC || firstFromDct[0] || '', 80);
      const middle = cleanText(fields.DAD || firstFromDct.slice(1).join(' '), 80);
      const last = cleanText(fields.DCS || fields.DAB || '', 100);
      const expires = parseAamvaDate(fields.DBA || '');
      const idExpired = expires ? expires.getTime() < now.getTime() : false;

      raw = '';
      if (!first && !last) return { ok: false, error: 'name_fields_missing', data: {} };

      return {
        ok: true,
        data: redactForbidden({
          visitor_first_name: first,
          visitor_middle_name: middle,
          visitor_last_name: last,
          id_document_type: 'Driver License / State ID',
          id_issuing_jurisdiction: cleanText(fields.DAJ || '', 40),
          id_expired: !!idExpired,
          id_verified: true
        })
      };
    } catch (err) {
      raw = '';
      return { ok: false, error: 'parse_failed', data: {} };
    }
  }

  function redactForbidden(obj) {
    const out = {};
    Object.keys(obj || {}).forEach(function (key) {
      if (FORBIDDEN_KEYS.indexOf(key) !== -1) return;
      const lower = String(key).toLowerCase();
      if (FORBIDDEN_KEYS.indexOf(lower) !== -1) return;
      out[key] = obj[key];
    });
    return out;
  }

  function parseVisitorBadgeScan(value) {
    const s = cleanText(value, 260);
    const m = s.match(/^ENVISIT:([A-Za-z0-9_-]{32,120})$/);
    if (!m) return { ok: false, error: 'not_visitor_badge' };
    return { ok: true, token: m[1] };
  }

  function createScannerBuffer(onScan, options) {
    const opts = options || {};
    const minLength = opts.minLength || 18;
    const gapMs = opts.gapMs || 45;
    const settleMs = opts.settleMs || 100;
    const multiline = opts.multiline === true;
    const maxLength = opts.maxLength || 2400;
    let buffer = '';
    let lastAt = 0;
    let settleTimer = 0;
    function reset() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = 0;
      buffer = '';
      lastAt = 0;
    }
    function finish() {
      const scan = buffer;
      reset();
      if (scan.length >= minLength) onScan(scan);
    }
    function scheduleFinish() {
      if (!multiline) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, settleMs);
    }
    function acceptChar(ch) {
      const now = Date.now();
      if (lastAt && now - lastAt > gapMs) buffer = '';
      lastAt = now;
      if (multiline) {
        if (ch === '\r') ch = '\n';
        if (ch.length === 1) buffer += ch;
        if (buffer.length > maxLength) buffer = buffer.slice(-maxLength);
        scheduleFinish();
        return;
      }
      if (ch === '\r' || ch === '\n') {
        finish();
        return;
      }
      if (ch.length === 1) buffer += ch;
      if (buffer.length > maxLength) buffer = buffer.slice(-maxLength);
    }
    function keydown(ev) {
      if (!ev) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === 'Enter') {
        acceptChar('\n');
        ev.preventDefault();
      } else if (ev.key && ev.key.length === 1) {
        acceptChar(ev.key);
      }
    }
    return { keydown, acceptChar, reset, flush: finish };
  }

  const QR_VERSION = 4;
  const QR_SIZE = 33;
  const QR_DATA_CODEWORDS = 80;
  const QR_ECC_CODEWORDS = 20;
  const QR_FORMAT_L_MASK0 = 0x77c4;

  function initGf() {
    const exp = new Array(512);
    const log = new Array(256);
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      exp[i] = x;
      log[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];
    return { exp, log };
  }
  const GF = initGf();

  function gfMul(a, b) {
    if (!a || !b) return 0;
    return GF.exp[GF.log[a] + GF.log[b]];
  }

  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], GF.exp[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, degree) {
    const gen = rsGenerator(degree);
    const result = new Array(degree).fill(0);
    data.forEach(function (b) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < degree; i += 1) result[i] ^= gfMul(gen[i + 1], factor);
    });
    return result;
  }

  function encodeQrCodewords(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text || '')));
    if (bytes.length > 78) throw new Error('qr_payload_too_long');
    const bits = [];
    function append(value, len) {
      for (let i = len - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
    }
    append(0x4, 4);
    append(bytes.length, 8);
    bytes.forEach(function (b) { append(b, 8); });
    const capacityBits = QR_DATA_CODEWORDS * 8;
    const terminator = Math.min(4, capacityBits - bits.length);
    for (let i = 0; i < terminator; i += 1) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    for (let pad = 0xec; data.length < QR_DATA_CODEWORDS; pad = pad === 0xec ? 0x11 : 0xec) data.push(pad);
    return data.concat(rsRemainder(data, QR_ECC_CODEWORDS));
  }

  function makeQrMatrix(text) {
    const size = QR_SIZE;
    const modules = Array.from({ length: size }, function () { return new Array(size).fill(false); });
    const fixed = Array.from({ length: size }, function () { return new Array(size).fill(false); });
    function set(x, y, dark, isFixed) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = !!dark;
      if (isFixed) fixed[y][x] = true;
    }
    function finder(x, y) {
      for (let dy = -1; dy <= 7; dy += 1) {
        for (let dx = -1; dx <= 7; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          const inBox = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          const dark = inBox && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
          set(xx, yy, dark, true);
        }
      }
    }
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);
    for (let i = 8; i < size - 8; i += 1) {
      set(6, i, i % 2 === 0, true);
      set(i, 6, i % 2 === 0, true);
    }
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(26 + dx, 26 + dy, dist === 2 || dist === 0, true);
      }
    }
    set(8, 4 * QR_VERSION + 9, true, true);
    function format(bits) {
      for (let i = 0; i <= 5; i += 1) set(8, i, ((bits >>> i) & 1) !== 0, true);
      set(8, 7, ((bits >>> 6) & 1) !== 0, true);
      set(8, 8, ((bits >>> 7) & 1) !== 0, true);
      set(7, 8, ((bits >>> 8) & 1) !== 0, true);
      for (let i = 9; i < 15; i += 1) set(14 - i, 8, ((bits >>> i) & 1) !== 0, true);
      for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, ((bits >>> i) & 1) !== 0, true);
      for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, ((bits >>> i) & 1) !== 0, true);
      set(8, size - 8, true, true);
    }
    format(QR_FORMAT_L_MASK0);
    const codewords = encodeQrCodewords(text);
    const totalBits = codewords.length * 8;
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right -= 1;
      for (let vert = 0; vert < size; vert += 1) {
        const y = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          if (fixed[y][x]) continue;
          let dark = false;
          if (bitIndex < totalBits) dark = ((codewords[Math.floor(bitIndex / 8)] >>> (7 - (bitIndex % 8))) & 1) !== 0;
          bitIndex += 1;
          if ((x + y) % 2 === 0) dark = !dark;
          set(x, y, dark, false);
        }
      }
      upward = !upward;
    }
    format(QR_FORMAT_L_MASK0);
    return modules;
  }

  function makeQrSvg(text, options) {
    const opts = options || {};
    const border = Number.isFinite(Number(opts.border)) ? Math.max(0, Number(opts.border)) : 2;
    const modules = makeQrMatrix(text);
    const size = modules.length;
    let path = '';
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (modules[y][x]) path += 'M' + (x + border) + ' ' + (y + border) + 'h1v1h-1z';
      }
    }
    const vb = size + border * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vb + ' ' + vb + '" role="img" aria-label="Visitor badge QR code" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h' + vb + 'v' + vb + 'H0z"/><path fill="#000" d="' + path + '"/></svg>';
  }

  return {
    VISITOR_TYPES,
    PURPOSES,
    FORBIDDEN_KEYS,
    cleanText,
    escapeHtml,
    visitorTypeLabel: function (key, lang) { return label(VISITOR_TYPES, key, lang); },
    purposeLabel: function (key, lang) { return label(PURPOSES, key, lang); },
    parseAamva,
    parseAamvaDate,
    redactForbidden,
    parseVisitorBadgeScan,
    createScannerBuffer,
    makeQrMatrix,
    makeQrSvg
  };
});
