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
    'dob', 'address', 'home_address', 'zip', 'postal_code',
    'sex', 'gender', 'height', 'weight', 'eye_color', 'raw', 'raw_scan',
    'raw_pdf417', 'raw_aamva', 'barcode', 'barcode_raw', 'passport_number'
  ];
  const AAMVA_PRIMARY_SUBFILES = ['DL', 'EN', 'ID'];
  const AAMVA_HEADER_LENGTH = 21;
  const AAMVA_DESCRIPTOR_LENGTH = 10;
  const ASCII_AT = 0x40;
  const ASCII_LF = 0x0a;
  const ASCII_RS = 0x1e;
  const ASCII_CR = 0x0d;

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
    const date = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
  }

  function validIsoDate(value) {
    const s = String(value || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return s;
  }

  function aamvaDateToIso(value) {
    const d = parseAamvaDate(value);
    return d ? d.toISOString().slice(0, 10) : '';
  }

  function normalizeDateOfBirth(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    const iso = validIsoDate(s);
    if (iso) return iso;
    return aamvaDateToIso(s);
  }

  function isFutureDate(value, now) {
    const iso = validIsoDate(value);
    if (!iso) return false;
    const today = now ? new Date(now) : new Date();
    if (!Number.isFinite(today.getTime())) return false;
    const todayIso = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');
    return iso > todayIso;
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

  function aamvaBytesFromInput(input) {
    const direct = copyByteArray(input);
    if (direct) return direct;
    if (input && typeof input === 'object') {
      return copyByteArray(input.bytes || input.rawBytes || input.contentBytes || input.byteSegments || null);
    }
    return null;
  }

  function asciiFromBytes(bytes, start, length) {
    if (!bytes || start < 0 || length <= 0 || start + length > bytes.length) return '';
    let out = '';
    for (let i = start; i < start + length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function parseAamvaDescriptor(bytes, cursor, index) {
    const type = asciiFromBytes(bytes, cursor, 2).toUpperCase();
    const offsetText = asciiFromBytes(bytes, cursor + 2, 4);
    const lengthText = asciiFromBytes(bytes, cursor + 6, 4);
    const parseable = /^[A-Z0-9]{2}$/.test(type) && /^\d{4}$/.test(offsetText) && /^\d{4}$/.test(lengthText);
    const offset = parseable ? Number(offsetText) : -1;
    const length = parseable ? Number(lengthText) : -1;
    const offsetWithinBounds = parseable && offset >= 0 && offset < bytes.length;
    const lengthWithinBounds = offsetWithinBounds && length > 0 && offset + length <= bytes.length;
    const prefixMatches = lengthWithinBounds && asciiFromBytes(bytes, offset, 2).toUpperCase() === type;
    return { index, type, offset, length, parseable, offsetWithinBounds, lengthWithinBounds, prefixMatches };
  }

  function parseAamvaByteHeader(bytes) {
    const rawByteLength = bytes ? bytes.length : 0;
    const rawHeaderAt = !!(bytes && bytes[0] === ASCII_AT);
    const rawHeaderLf = !!(bytes && bytes[1] === ASCII_LF);
    const rawHeaderRs = !!(bytes && bytes[2] === ASCII_RS);
    const rawHeaderCr = !!(bytes && bytes[3] === ASCII_CR);
    const rawHeaderAnsi = asciiFromBytes(bytes, 4, 5) === 'ANSI ';
    const iin = asciiFromBytes(bytes, 9, 6);
    const aamvaVersionText = asciiFromBytes(bytes, 15, 2);
    const jurisdictionVersionText = asciiFromBytes(bytes, 17, 2);
    const entryCountText = asciiFromBytes(bytes, 19, 2);
    const iinPresent = /^\d{6}$/.test(iin);
    const aamvaVersion = /^\d{2}$/.test(aamvaVersionText) ? String(Number(aamvaVersionText)) : '';
    const jurisdictionVersion = /^\d{2}$/.test(jurisdictionVersionText) ? String(Number(jurisdictionVersionText)) : '';
    const subfileCount = /^\d{2}$/.test(entryCountText) ? Number(entryCountText) : 0;
    const descriptors = [];

    if (
      rawByteLength >= AAMVA_HEADER_LENGTH
      && rawHeaderAt
      && rawHeaderLf
      && rawHeaderRs
      && rawHeaderCr
      && rawHeaderAnsi
      && iinPresent
      && aamvaVersion
      && jurisdictionVersion
      && subfileCount > 0
      && subfileCount <= 10
    ) {
      for (let i = 0; i < subfileCount; i += 1) {
        descriptors.push(parseAamvaDescriptor(bytes, AAMVA_HEADER_LENGTH + (i * AAMVA_DESCRIPTOR_LENGTH), i + 1));
      }
    }

    const descriptorTableParseable = descriptors.length === subfileCount
      && descriptors.every((descriptor) => descriptor.parseable && descriptor.offsetWithinBounds && descriptor.lengthWithinBounds);
    const validDescriptors = descriptors.filter((descriptor) => (
      descriptor.parseable
      && descriptor.offsetWithinBounds
      && descriptor.lengthWithinBounds
      && descriptor.prefixMatches
    ));
    const primaryDescriptor = validDescriptors.find((descriptor) => AAMVA_PRIMARY_SUBFILES.includes(descriptor.type)) || null;

    return {
      rawHeaderAt,
      rawHeaderLf,
      rawHeaderRs,
      rawHeaderCr,
      rawHeaderAnsi,
      iinPresent,
      aamvaVersion,
      jurisdictionVersion,
      subfileCount,
      descriptorTableParseable,
      descriptors,
      primaryDescriptor,
      dataElementSeparator: bytes ? bytes[1] : null,
      recordSeparatorByte: bytes ? bytes[2] : null,
      segmentTerminatorByte: bytes ? bytes[3] : null
    };
  }

  function isAamvaSeparatorByte(byte, header) {
    return byte === header.dataElementSeparator
      || byte === header.recordSeparatorByte
      || byte === header.segmentTerminatorByte
      || byte === ASCII_LF
      || byte === ASCII_RS
      || byte === ASCII_CR
      || byte === 0x00;
  }

  function tagBytes(tag) {
    return [tag.charCodeAt(0), tag.charCodeAt(1), tag.charCodeAt(2)];
  }

  function hasTagAt(bytes, index, tag) {
    const codes = tagBytes(tag);
    return bytes[index] === codes[0] && bytes[index + 1] === codes[1] && bytes[index + 2] === codes[2];
  }

  function hasTagBoundary(bytes, index, subfileStart, header) {
    if (index === subfileStart + 2) return true;
    if (index <= subfileStart) return false;
    return isAamvaSeparatorByte(bytes[index - 1], header);
  }

  function findAamvaFieldBytes(bytes, header, tag) {
    const descriptor = header.primaryDescriptor;
    if (!descriptor) return '';
    const subfileStart = descriptor.offset;
    const subfileEnd = descriptor.offset + descriptor.length;
    if (asciiFromBytes(bytes, subfileStart, 2).toUpperCase() !== descriptor.type) return '';
    for (let i = subfileStart + 2; i <= subfileEnd - 3; i += 1) {
      if (!hasTagAt(bytes, i, tag) || !hasTagBoundary(bytes, i, subfileStart, header)) continue;
      let end = i + 3;
      while (end < subfileEnd && !isAamvaSeparatorByte(bytes[end], header)) end += 1;
      return cleanText(asciiFromBytes(bytes, i + 3, end - (i + 3)), 180);
    }
    return '';
  }

  function splitDct(value) {
    const parts = cleanText(value, 160).split(/[,\s]+/).filter(Boolean);
    return { first: parts[0] || '', middle: parts.slice(1).join(' ') };
  }

  function aamvaDataFromFields(fields, now) {
    const firstFromDct = splitDct(fields.DCT || '');
    const first = cleanText(fields.DAC || firstFromDct.first || '', 80);
    const middle = cleanText(fields.DAD || firstFromDct.middle || '', 80);
    const last = cleanText(fields.DCS || fields.DAB || '', 100);
    const expires = parseAamvaDate(fields.DBA || '');
    const idExpired = expires ? expires.getTime() < now.getTime() : false;
    const dob = aamvaDateToIso(fields.DBB || '');
    return redactForbidden({
      visitor_first_name: first,
      visitor_middle_name: middle,
      visitor_last_name: last,
      date_of_birth: dob,
      id_document_type: 'Driver License / State ID',
      id_issuing_jurisdiction: cleanText(fields.DAJ || '', 40),
      id_expired: !!idExpired,
      id_verified: true
    });
  }

  function parseAamvaFromBytes(bytes, options) {
    const now = options && options.now ? new Date(options.now) : new Date();
    const header = parseAamvaByteHeader(bytes);
    const baseOk = !!(
      header.rawHeaderAt
      && header.rawHeaderLf
      && header.rawHeaderRs
      && header.rawHeaderCr
      && header.rawHeaderAnsi
      && header.iinPresent
      && header.aamvaVersion
      && header.jurisdictionVersion
      && header.descriptorTableParseable
      && header.primaryDescriptor
    );
    if (!baseOk) return { ok: false, complete: false, error: 'unrecognized_id_barcode', data: {} };

    const fields = {
      DCS: findAamvaFieldBytes(bytes, header, 'DCS'),
      DAC: findAamvaFieldBytes(bytes, header, 'DAC'),
      DAD: findAamvaFieldBytes(bytes, header, 'DAD'),
      DCT: findAamvaFieldBytes(bytes, header, 'DCT'),
      DBA: findAamvaFieldBytes(bytes, header, 'DBA'),
      DAJ: findAamvaFieldBytes(bytes, header, 'DAJ'),
      DAB: findAamvaFieldBytes(bytes, header, 'DAB'),
      DBB: findAamvaFieldBytes(bytes, header, 'DBB')
    };
    const data = aamvaDataFromFields(fields, now);
    if (!data.visitor_first_name && !data.visitor_last_name) return { ok: false, complete: false, error: 'name_fields_missing', data: {} };
    return {
      ok: true,
      complete: !!(data.visitor_first_name && data.visitor_last_name && data.date_of_birth),
      error: data.date_of_birth ? '' : 'date_of_birth_missing',
      data
    };
  }

  function parseAamva(rawInput, options) {
    const bytes = aamvaBytesFromInput(rawInput);
    if (bytes) return parseAamvaFromBytes(bytes, options);
    let raw = String(rawInput == null ? '' : rawInput);
    const now = options && options.now ? new Date(options.now) : new Date();
    try {
      if (!raw || raw.length < 20 || !/(^|[\r\n\x1e])(DCS|DAC|DCT|DBA|DAJ)/.test(raw)) {
        raw = '';
        return { ok: false, complete: false, error: 'unrecognized_id_barcode', data: {} };
      }

      const fields = {};
      const keep = { DCS: true, DAC: true, DAD: true, DCT: true, DBA: true, DAJ: true, DAB: true, DBB: true };
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

      const data = aamvaDataFromFields(fields, now);

      raw = '';
      if (!data.visitor_first_name && !data.visitor_last_name) return { ok: false, complete: false, error: 'name_fields_missing', data: {} };

      return {
        ok: true,
        complete: !!(data.visitor_first_name && data.visitor_last_name && data.date_of_birth),
        error: data.date_of_birth ? '' : 'date_of_birth_missing',
        data
      };
    } catch (err) {
      raw = '';
      return { ok: false, complete: false, error: 'parse_failed', data: {} };
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

  function splitPersonName(value) {
    const cleaned = cleanText(value, 160).replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return { first: '', middle: '', last: '' };
    const comma = cleaned.split(',').map((x) => cleanText(x, 100)).filter(Boolean);
    if (comma.length >= 2) {
      const given = comma.slice(1).join(' ').split(/\s+/).filter(Boolean);
      return { first: given[0] || '', middle: given.slice(1).join(' '), last: comma[0] || '' };
    }
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
    return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] };
  }

  const IDNYC_LABEL_ONLY = /^(?:NYC\s+IDENTIFICATION\s+CARD|IDNYC|ID\s*(?:NUMBER|NO\.?|#)|NAME|NOMBRE|ISSUANCE\s+DATE|ISSUED|EXPIRATION\s+DATE|EXPIRES?|ORGAN\s+DONOR|EYE\s+COLOR|HEIGHT|GENDER|SEX|DATE\s+OF\s+BIRTH|DOB|D\.O\.B\.?|FECHA\s+DE\s+NACIMIENTO|ADDRESS|DIRECCI[ÓO]N)$/i;
  const IDNYC_LABEL_PREFIX = /^(?:NYC\s+IDENTIFICATION\s+CARD|IDNYC|ID\s*(?:NUMBER|NO\.?|#)|ISSUANCE\s+DATE|ISSUED|EXPIRATION\s+DATE|EXPIRES?|ORGAN\s+DONOR|EYE\s+COLOR|HEIGHT|GENDER|SEX|DATE\s+OF\s+BIRTH|DOB|D\.O\.B\.?|FECHA\s+DE\s+NACIMIENTO|ADDRESS|DIRECCI[ÓO]N)\b/i;

  function idnycAsciiUpper(value) {
    return cleanText(value, 180)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function idnycEditDistanceWithin(a, b, maxDistance) {
    const left = String(a || '');
    const right = String(b || '');
    const max = Math.max(0, Number(maxDistance || 0));
    if (Math.abs(left.length - right.length) > max) return false;
    let prev = Array.from({ length: right.length + 1 }, (_, i) => i);
    for (let i = 1; i <= left.length; i += 1) {
      const next = [i];
      let rowMin = next[0];
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        const value = Math.min(
          prev[j] + 1,
          next[j - 1] + 1,
          prev[j - 1] + cost
        );
        next[j] = value;
        if (value < rowMin) rowMin = value;
      }
      if (rowMin > max) return false;
      prev = next;
    }
    return prev[right.length] <= max;
  }

  function idnycLabelInfo(value) {
    const raw = idnycAsciiUpper(value);
    if (!raw) return null;
    const defs = [
      ['title', /^(?:NYC\s*IDENTIFICATION\s*CARD|IDNYC)\b\s*[:\-]?\s*(.*)$/i],
      ['id_number', /^(?:ID\s*(?:NUMBER|NUM8ER|N[O0]\.?|#))\b\s*[:\-]?\s*(.*)$/i],
      ['name', /^(?:N\s*A\s*M\s*E|N4ME|NANE|NAMF|NOMBRE)\b\s*[:\-]?\s*(.*)$/i],
      ['birth', /^(?:D[O0]B|D\.?\s*[O0]\.?\s*B\.?|DATE\s*[O0]F\s*B[I1]RTH|FECHA\s*DE\s*NACIMIENTO)\b\s*[:\-]?\s*(.*)$/i],
      ['expiration', /^(?:EXPIRATION\s*DATE|EXPIRAT[I1][O0]N\s*DATE|EXPIRES?|EXP\.?\s*DATE)\b\s*[:\-]?\s*(.*)$/i],
      ['issuance', /^(?:ISSUANCE\s*DATE|ISSUED|ISSUE\s*DATE)\b\s*[:\-]?\s*(.*)$/i],
      ['address', /^(?:ADDRESS|DIRECCI[O0]N)\b\s*[:\-]?\s*(.*)$/i],
      ['sex', /^(?:GENDER|SEX)\b\s*[:\-]?\s*(.*)$/i],
      ['eyes', /^(?:EYE\s*COLOR|EYES?)\b\s*[:\-]?\s*(.*)$/i],
      ['height', /^(?:HEIGHT)\b\s*[:\-]?\s*(.*)$/i],
      ['organ_donor', /^(?:ORGAN\s*DONOR)\b\s*[:\-]?\s*(.*)$/i]
    ];
    for (const [type, re] of defs) {
      const m = raw.match(re);
      if (m) return { type, tail: cleanText(m[1] || '', 140), fuzzy: false };
    }
    const compact = raw.replace(/[^A-Z0-9]/g, '');
    const compactOnly = {
      NAME: 'name', N4ME: 'name', NANE: 'name', NAMF: 'name', NOMBRE: 'name',
      DOB: 'birth', D0B: 'birth', DATEOFBIRTH: 'birth', DATE0FBIRTH: 'birth', DATEOFB1RTH: 'birth', DATE0FB1RTH: 'birth', FECHADENACIMIENTO: 'birth',
      EXPIRATIONDATE: 'expiration', EXPIRAT10NDATE: 'expiration', EXPIRES: 'expiration',
      ISSUANCEDATE: 'issuance', ISSUED: 'issuance', ISSUEDATE: 'issuance',
      IDNUMBER: 'id_number', IDNUM8ER: 'id_number', IDNO: 'id_number',
      ADDRESS: 'address', DIRECCION: 'address',
      HEIGHT: 'height', GENDER: 'sex', SEX: 'sex', EYECOLOR: 'eyes', ORGANDONOR: 'organ_donor',
      NYCIDENTIFICATIONCARD: 'title', IDNYC: 'title'
    };
    if (compactOnly[compact]) return { type: compactOnly[compact], tail: '', fuzzy: false };

    // OCR can damage one or two characters in "DATE OF BIRTH" while preserving
    // the overall label. Accept a very tight fuzzy match only for the birth
    // anchor; this never supplies a date value by itself.
    if (compact.length >= 9 && compact.length <= 13 && idnycEditDistanceWithin(compact, 'DATEOFBIRTH', 2)) {
      return { type: 'birth', tail: '', fuzzy: true };
    }
    return null;
  }

  function idnycNameCandidate(value) {
    const line = cleanText(value, 100);
    if (!line || idnycLabelInfo(line) || IDNYC_LABEL_ONLY.test(line) || IDNYC_LABEL_PREFIX.test(line)) return false;
    if (/\d/.test(line)) return false;
    if (line.length < 2 || line.length > 80) return false;
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(line)) return false;
    if (/[^A-Za-zÀ-ÖØ-öø-ÿ .,'’\-]/.test(line)) return false;
    const words = line.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    return words.length >= 1 && words.length <= 6;
  }

  function parseIdnycGivenLine(value) {
    const line = cleanText(value, 100);
    if (!line) return { first: '', middle: '' };
    const comma = line.split(',').map((part) => cleanText(part, 80));
    if (comma.length >= 2) {
      return {
        first: comma[0] || '',
        middle: comma.slice(1).join(' ').trim()
      };
    }
    const parts = line.split(/\s+/).filter(Boolean);
    return {
      first: parts[0] || '',
      middle: parts.slice(1).join(' ')
    };
  }

  function parseIdnycAnchoredName(lines) {
    let anchorIndex = -1;
    let anchorTail = '';
    for (let i = 0; i < lines.length; i += 1) {
      const info = idnycLabelInfo(lines[i]);
      if (info?.type !== 'name') continue;
      anchorIndex = i;
      anchorTail = cleanText(info.tail || '', 100);
      break;
    }

    const after = [];
    if (anchorIndex >= 0) {
      for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + 6 && after.length < 3; i += 1) {
        const line = lines[i];
        const info = idnycLabelInfo(line);
        if (info) {
          if (after.length || info.type !== 'name') break;
          continue;
        }
        if (idnycNameCandidate(line)) after.push(line);
        else if (after.length) break;
      }

      // Current IDNYC layout: NAME, then surname, then given name + optional middle.
      if (anchorTail && idnycNameCandidate(anchorTail) && after.length >= 1) {
        const given = parseIdnycGivenLine(after[0]);
        return { first: given.first, middle: given.middle, last: anchorTail, strategy: 'name_tail_plus_given', anchorFound: true, candidateCount: after.length + 1 };
      }
      if (!anchorTail && after.length >= 2) {
        const given = parseIdnycGivenLine(after[1]);
        return { first: given.first, middle: given.middle, last: after[0], strategy: 'name_label_two_line', anchorFound: true, candidateCount: after.length };
      }
      if (anchorTail && idnycNameCandidate(anchorTail) && after.length === 0) {
        return { ...splitPersonName(anchorTail), strategy: 'name_single_line', anchorFound: true, candidateCount: 1 };
      }
      return { first: '', middle: '', last: '', strategy: 'name_anchor_insufficient', anchorFound: true, candidateCount: after.length + (anchorTail ? 1 : 0) };
    }

    // OCR sometimes drops the NAME label completely. On IDNYC the two name
    // lines immediately precede the birth-date block, so accept exactly that
    // strongly constrained layout instead of guessing from arbitrary text.
    let birthIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (idnycLabelInfo(lines[i])?.type === 'birth') { birthIndex = i; break; }
    }
    if (birthIndex > 1) {
      const preceding = [];
      for (let i = birthIndex - 1; i >= 0 && i >= birthIndex - 4 && preceding.length < 2; i -= 1) {
        const line = lines[i];
        if (idnycLabelInfo(line)) break;
        if (idnycNameCandidate(line)) preceding.push(line);
        else if (preceding.length) break;
      }
      if (preceding.length >= 2) {
        const given = parseIdnycGivenLine(preceding[0]);
        return { first: given.first, middle: given.middle, last: preceding[1], strategy: 'two_lines_before_birth', anchorFound: false, candidateCount: 2 };
      }
    }

    return { first: '', middle: '', last: '', strategy: 'none', anchorFound: false, candidateCount: 0 };
  }

  function idnycOcrDateCandidate(value) {
    const line = idnycAsciiUpper(value);
    if (!line) return { value: '', found: false, shape: '', corrected: false, rejection: 'no_candidate' };

    // Restrict OCR substitutions to date-shaped tokens. We never rewrite
    // arbitrary prose into numbers.
    const tokenMatch = line.match(/(?:[0-9OQDILSZGB|]{1,4}\s*[\/\.\-]\s*[0-9OQDILSZGB|]{1,2}\s*[\/\.\-]\s*[0-9OQDILSZGB|]{2,4}|[0-9OQDILSZGB|]{8})/);
    if (!tokenMatch) return { value: '', found: false, shape: '', corrected: false, rejection: 'no_candidate' };

    const rawToken = String(tokenMatch[0] || '');
    const shape = rawToken
      .replace(/[0-9OQDILSZGB|]/gi, 'D')
      .replace(/\s+/g, '')
      .replace(/\./g, '/')
      .replace(/-/g, '/')
      .slice(0, 16);
    const comparableRaw = rawToken.toUpperCase().replace(/\s+/g, '').replace(/[\.\-]/g, '/');
    const correctedToken = comparableRaw
      .replace(/[OQD]/g, '0')
      .replace(/[IL|]/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/G/g, '6')
      .replace(/B/g, '8');
    const normalized = normalizeDateOfBirth(correctedToken);
    if (!normalized) {
      return { value: '', found: true, shape, corrected: correctedToken !== comparableRaw, rejection: 'invalid_calendar' };
    }
    if (isFutureDate(normalized)) {
      return { value: '', found: true, shape, corrected: correctedToken !== comparableRaw, rejection: 'future_date' };
    }
    return { value: normalized, found: true, shape, corrected: correctedToken !== comparableRaw, rejection: '' };
  }

  function idnycDateToken(value) {
    const candidate = idnycOcrDateCandidate(value);
    return candidate.value ? candidate.value : '';
  }

  function findIdnycBirthDate(lines) {
    for (let i = 0; i < lines.length; i += 1) {
      const info = idnycLabelInfo(lines[i]);
      if (info?.type !== 'birth') continue;

      const sameLine = idnycOcrDateCandidate(info.tail || '');
      if (sameLine.value) {
        return {
          value: sameLine.value,
          anchorFound: true,
          strategy: 'birth_same_line',
          candidateFound: true,
          candidateShape: sameLine.shape,
          candidateCorrected: sameLine.corrected,
          rejection: '',
          fuzzyAnchor: info.fuzzy === true
        };
      }

      let observed = sameLine.found ? sameLine : null;
      let blockedBy = '';
      for (let j = i + 1; j < lines.length && j <= i + 2; j += 1) {
        const nextInfo = idnycLabelInfo(lines[j]);
        if (nextInfo) {
          blockedBy = nextInfo.type;
          break; // Never walk through EXPIRATION/ISSUANCE to steal their dates.
        }
        const candidate = idnycOcrDateCandidate(lines[j]);
        if (!observed && candidate.found) observed = candidate;
        if (candidate.value) {
          return {
            value: candidate.value,
            anchorFound: true,
            strategy: 'birth_next_line',
            candidateFound: true,
            candidateShape: candidate.shape,
            candidateCorrected: candidate.corrected,
            rejection: '',
            fuzzyAnchor: info.fuzzy === true
          };
        }
      }
      return {
        value: '',
        anchorFound: true,
        strategy: 'birth_anchor_no_date',
        candidateFound: !!observed,
        candidateShape: observed?.shape || '',
        candidateCorrected: observed?.corrected === true,
        rejection: observed?.rejection || (blockedBy ? `blocked_by_${blockedBy}` : 'no_candidate'),
        fuzzyAnchor: info.fuzzy === true
      };
    }
    return {
      value: '',
      anchorFound: false,
      strategy: 'no_birth_anchor',
      candidateFound: false,
      candidateShape: '',
      candidateCorrected: false,
      rejection: 'no_birth_anchor',
      fuzzyAnchor: false
    };
  }

  function classifyIdnycSafeLine(line) {
    const info = idnycLabelInfo(line);
    if (info) return info.type.toUpperCase();
    if (idnycDateToken(line)) return 'DATE_VALUE';
    if (/^\d[\d\s#\-./]+$/.test(cleanText(line, 180))) return 'NUMERIC';
    if (idnycNameCandidate(line)) return 'ALPHA_CANDIDATE';
    return 'OTHER';
  }

  function parseIdnycOcrText(text) {
    const rawText = String(text == null ? '' : text);
    const lines = rawText
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => cleanText(line, 180))
      .filter(Boolean);

    const name = parseIdnycAnchoredName(lines);
    const birth = findIdnycBirthDate(lines);
    const labels = { title: false, id_number: false, name: false, birth: false, expiration: false, issuance: false, address: false };
    for (const line of lines) {
      const info = idnycLabelInfo(line);
      if (info && Object.prototype.hasOwnProperty.call(labels, info.type)) labels[info.type] = true;
    }
    const dateCandidateCount = lines.reduce((count, line) => count + (idnycDateToken(line) ? 1 : 0), 0);
    const data = {
      visitor_first_name: cleanText(name.first, 80),
      visitor_middle_name: cleanText(name.middle, 80),
      visitor_last_name: cleanText(name.last, 100),
      date_of_birth: cleanText(birth.value, 10)
    };
    const ok = !!(data.visitor_first_name && data.visitor_last_name && data.date_of_birth);
    const diagnostics = {
      text_length: rawText.length,
      line_count: lines.length,
      parser_success: ok,
      name_anchor_found: name.anchorFound === true,
      name_strategy: String(name.strategy || 'none'),
      name_candidate_count: Number(name.candidateCount || 0),
      birth_anchor_found: birth.anchorFound === true,
      birth_strategy: String(birth.strategy || 'none'),
      birth_anchor_fuzzy: birth.fuzzyAnchor === true,
      birth_candidate_found: birth.candidateFound === true,
      birth_candidate_shape: String(birth.candidateShape || ''),
      birth_candidate_corrected: birth.candidateCorrected === true,
      birth_rejection: String(birth.rejection || ''),
      date_candidate_count: dateCandidateCount,
      labels,
      parsed_fields: {
        first_name: !!data.visitor_first_name,
        middle_name: !!data.visitor_middle_name,
        last_name: !!data.visitor_last_name,
        birth_date: !!data.date_of_birth
      },
      line_classes: lines.slice(0, 24).map(classifyIdnycSafeLine)
    };
    return { ok, data: redactForbidden(data), diagnostics, error: ok ? '' : 'idnyc_fields_missing' };
  }

  function parseVisitorBadgeScan(value) {
    const s = cleanText(value, 260);
    const visit = s.match(/^ENVISIT:([A-Za-z0-9_-]{32,120})$/);
    if (visit) return { ok: true, kind: 'visit_checkout', token: visit[1] };
    const returning = s.match(/^ENVISITOR:([A-Za-z0-9_-]{32,180})$/);
    if (returning) return { ok: true, kind: 'returning_parent', token: returning[1] };
    return { ok: false, error: 'not_visitor_badge' };
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

  function capturePortraitPhoto(video, options) {
    const opts = options || {};
    const width = Number.isFinite(Number(opts.width)) ? Math.max(160, Number(opts.width)) : 720;
    const height = Number.isFinite(Number(opts.height)) ? Math.max(200, Number(opts.height)) : 900;
    const quality = Number.isFinite(Number(opts.quality)) ? Math.max(0.5, Math.min(0.92, Number(opts.quality))) : 0.82;
    if (!video || !video.videoWidth || !video.videoHeight) return Promise.reject(new Error('camera_frame_unavailable'));
    if (typeof document === 'undefined') return Promise.reject(new Error('canvas_unavailable'));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return Promise.reject(new Error('canvas_unavailable'));
    const sourceRatio = video.videoWidth / video.videoHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (sourceRatio > targetRatio) {
      sw = Math.round(video.videoHeight * targetRatio);
      sx = Math.round((video.videoWidth - sw) / 2);
    } else {
      sh = Math.round(video.videoWidth / targetRatio);
      sy = Math.round((video.videoHeight - sh) / 2);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('photo_encode_failed'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    });
  }

  function sourceDimensions(source) {
    return {
      width: Number(source?.videoWidth || source?.naturalWidth || source?.width || 0),
      height: Number(source?.videoHeight || source?.naturalHeight || source?.height || 0)
    };
  }

  function drawPortraitCanvas(source, options) {
    const opts = options || {};
    const width = Number.isFinite(Number(opts.width)) ? Math.max(160, Number(opts.width)) : 720;
    const height = Number.isFinite(Number(opts.height)) ? Math.max(200, Number(opts.height)) : 900;
    if (typeof document === 'undefined') throw new Error('canvas_unavailable');
    const dims = sourceDimensions(source);
    if (!dims.width || !dims.height) throw new Error('photo_dimensions_unavailable');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas_unavailable');
    const sourceRatio = dims.width / dims.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = dims.width;
    let sh = dims.height;
    if (sourceRatio > targetRatio) {
      sw = Math.round(dims.height * targetRatio);
      sx = Math.round((dims.width - sw) / 2);
    } else {
      sh = Math.round(dims.width / targetRatio);
      sy = Math.round((dims.height - sh) / 2);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
    return canvas;
  }

  function canvasLooksEmptyBlack(canvas) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return true;
      let samples = 0;
      let black = 0;
      for (let y = 0; y < 9; y += 1) {
        for (let x = 0; x < 9; x += 1) {
          const px = Math.max(0, Math.min(w - 1, Math.round((x + 0.5) * w / 9)));
          const py = Math.max(0, Math.min(h - 1, Math.round((y + 0.5) * h / 9)));
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

  function canvasToJpegBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('photo_encode_failed'));
        else resolve(blob);
      }, 'image/jpeg', quality);
    });
  }

  async function decodeImageBlob(blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        return { image: bitmap, close: function () { try { bitmap.close(); } catch {} } };
      } catch {
        // Fall through to HTMLImageElement decode.
      }
    }
    if (typeof Image === 'undefined' || typeof URL === 'undefined') throw new Error('image_decode_unavailable');
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise(function (resolve, reject) {
      img.onload = function () { resolve(); };
      img.onerror = function () { reject(new Error('image_decode_failed')); };
    });
    img.src = url;
    await loaded;
    if (typeof img.decode === 'function') {
      try { await img.decode(); } catch {}
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      throw new Error('image_decode_failed');
    }
    return { image: img, close: function () { try { URL.revokeObjectURL(url); } catch {} } };
  }

  async function processVisitorPhotoFile(file, options) {
    const opts = options || {};
    if (!file || typeof file !== 'object') throw new Error('photo_file_required');
    const type = cleanText(file.type || '', 80).toLowerCase();
    if (!type || !/^image\/(jpeg|jpg|png|heic|heif|webp)$/.test(type)) throw new Error('photo_type_not_allowed');
    const decoded = await decodeImageBlob(file);
    try {
      const qualities = [Number(opts.quality || 0.82), 0.76, 0.7].map((q) => Math.max(0.5, Math.min(0.92, q)));
      let lastBlob = null;
      for (const q of qualities) {
        const canvas = drawPortraitCanvas(decoded.image, opts);
        if (canvasLooksEmptyBlack(canvas)) throw new Error('photo_black_frame');
        const blob = await canvasToJpegBlob(canvas, q);
        lastBlob = blob;
        if (!opts.maxBytes || blob.size <= Number(opts.maxBytes)) return blob;
      }
      if (lastBlob && (!opts.maxBytes || lastBlob.size <= Number(opts.maxBytes))) return lastBlob;
      throw new Error('photo_too_large');
    } finally {
      decoded.close();
    }
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
    normalizeDateOfBirth,
    isFutureDate,
    parseIdnycOcrText,
    redactForbidden,
    parseVisitorBadgeScan,
    createScannerBuffer,
    capturePortraitPhoto,
    processVisitorPhotoFile,
    canvasLooksEmptyBlack,
    makeQrMatrix,
    makeQrSvg
  };
});
