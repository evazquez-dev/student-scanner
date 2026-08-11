(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../visitor/visitor_shared.js'));
  } else {
    root.EagleNestScannerLabAamva = factory(root.EagleNestVisitor);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Shared) {
  'use strict';

  const EXPECTED_TAGS = ['DCS', 'DAC', 'DAD', 'DCT', 'DBB', 'DAJ', 'DAQ'];
  const PRIMARY_SUBFILE_TYPES = ['DL', 'EN', 'ID'];
  const HEADER_LENGTH = 21;
  const DESCRIPTOR_LENGTH = 10;
  const ASCII_AT = 0x40;
  const ASCII_LF = 0x0a;
  const ASCII_RS = 0x1e;
  const ASCII_CR = 0x0d;

  function clean(value, maxLen) {
    if (Shared && typeof Shared.cleanText === 'function') return Shared.cleanText(value, maxLen || 160);
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen || 160);
  }

  function normalizeDob(value) {
    const digits = String(value || '').replace(/\D+/g, '');
    if (digits.length !== 8) return '';
    let year;
    let month;
    let day;
    const first4 = Number(digits.slice(0, 4));
    if (first4 >= 1900 && first4 <= 2100) {
      year = first4;
      month = Number(digits.slice(4, 6));
      day = Number(digits.slice(6, 8));
    } else {
      month = Number(digits.slice(0, 2));
      day = Number(digits.slice(2, 4));
      year = Number(digits.slice(4, 8));
    }
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '';
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');
  }

  function copyBytes(value) {
    if (!value) return null;
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (ArrayBuffer.isView(value) && value.buffer) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (Array.isArray(value)) {
      return new Uint8Array(value.filter((byte) => Number.isFinite(byte)).map((byte) => byte & 0xff));
    }
    return null;
  }

  function resultBytes(zxingResult) {
    const result = zxingResult || {};
    return copyBytes(result.bytes || result.rawBytes || result.contentBytes || result.byteSegments || null);
  }

  function asciiFromBytes(bytes, start, length) {
    if (!bytes || start < 0 || length <= 0 || start + length > bytes.length) return '';
    let out = '';
    for (let i = start; i < start + length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function countLiteral(raw, literal) {
    const text = String(raw || '');
    if (!literal) return 0;
    let count = 0;
    let index = text.indexOf(literal);
    while (index !== -1) {
      count += 1;
      index = text.indexOf(literal, index + literal.length);
    }
    return count;
  }

  function controlCountsFromString(raw) {
    const text = String(raw || '');
    const counts = {
      fs: 0,
      gs: 0,
      rs: 0,
      cr: 0,
      lf: 0,
      nul: 0,
      printable: 0,
      nonPrintable: 0
    };
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code === 0x1c) counts.fs += 1;
      if (code === 0x1d) counts.gs += 1;
      if (code === 0x1e) counts.rs += 1;
      if (code === 0x0d) counts.cr += 1;
      if (code === 0x0a) counts.lf += 1;
      if (code === 0x00) counts.nul += 1;
      if (code >= 0x20 && code <= 0x7e) counts.printable += 1;
      else counts.nonPrintable += 1;
    }
    return counts;
  }

  function controlCountsFromBytes(bytes) {
    if (!bytes) return controlCountsFromString('');
    const counts = controlCountsFromString('');
    for (let i = 0; i < bytes.length; i += 1) {
      const code = bytes[i];
      if (code === 0x1c) counts.fs += 1;
      if (code === 0x1d) counts.gs += 1;
      if (code === 0x1e) counts.rs += 1;
      if (code === 0x0d) counts.cr += 1;
      if (code === 0x0a) counts.lf += 1;
      if (code === 0x00) counts.nul += 1;
      if (code >= 0x20 && code <= 0x7e) counts.printable += 1;
      else counts.nonPrintable += 1;
    }
    return counts;
  }

  function escapedControlCounts(raw) {
    return {
      cr: countLiteral(raw, '\\r'),
      lf: countLiteral(raw, '\\n'),
      rsHex: countLiteral(String(raw || '').toLowerCase(), '\\x1e'),
      rsUnicode: countLiteral(String(raw || '').toLowerCase(), '\\u001e')
    };
  }

  function byteLength(value) {
    const bytes = copyBytes(value);
    if (bytes) return bytes.byteLength;
    if (!value) return 0;
    if (typeof value.byteLength === 'number') return value.byteLength;
    if (typeof value.length === 'number') return value.length;
    return 0;
  }

  function hasControlCounts(counts) {
    return !!(
      counts
      && (
        counts.fs > 0
        || counts.gs > 0
        || counts.rs > 0
        || counts.cr > 0
        || counts.lf > 0
        || counts.nul > 0
      )
    );
  }

  function zxingShape(raw, zxingResult, bytes) {
    const result = zxingResult || {};
    const text = typeof result.text === 'string' ? result.text : String(raw || '');
    const byteSource = bytes || result.bytes || result.rawBytes || result.contentBytes || result.byteSegments || null;
    const counts = bytes ? controlCountsFromBytes(bytes) : null;
    return {
      textAvailable: text.length > 0,
      hriTextAvailable: text.length > 0,
      rawBytesAvailable: !!bytes,
      decodedTextCodeUnitLength: text.length,
      decodedByteLength: byteLength(byteSource),
      containsAsciiControlChars: counts ? hasControlCounts(counts) : /[\x00-\x1f]/.test(text),
      bytesEciAvailable: result.bytesECI != null
    };
  }

  function parseDescriptorBytes(bytes, cursor, index) {
    const type = asciiFromBytes(bytes, cursor, 2).toUpperCase();
    const offsetText = asciiFromBytes(bytes, cursor + 2, 4);
    const lengthText = asciiFromBytes(bytes, cursor + 6, 4);
    const parseable = /^[A-Z0-9]{2}$/.test(type) && /^\d{4}$/.test(offsetText) && /^\d{4}$/.test(lengthText);
    const offset = parseable ? Number(offsetText) : '';
    const length = parseable ? Number(lengthText) : '';
    const offsetWithinBounds = parseable && offset >= 0 && offset < bytes.length;
    const lengthWithinBounds = offsetWithinBounds && length > 0 && offset + length <= bytes.length;
    return {
      index,
      type: parseable ? type : 'unknown',
      offset,
      length,
      parseable,
      offsetWithinBounds,
      lengthWithinBounds,
      prefixMatches: lengthWithinBounds && asciiFromBytes(bytes, offset, 2).toUpperCase() === type
    };
  }

  function parseHeaderBytes(bytes) {
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
    const subfileCount = /^\d{2}$/.test(entryCountText) ? Number(entryCountText) : null;
    const descriptors = [];
    let descriptorTableParseable = false;

    if (
      rawByteLength >= HEADER_LENGTH
      && rawHeaderAt
      && rawHeaderAnsi
      && iinPresent
      && aamvaVersion
      && jurisdictionVersion
      && Number.isFinite(subfileCount)
      && subfileCount > 0
      && subfileCount <= 10
    ) {
      for (let i = 0; i < subfileCount; i += 1) {
        descriptors.push(parseDescriptorBytes(bytes, HEADER_LENGTH + (i * DESCRIPTOR_LENGTH), i + 1));
      }
      descriptorTableParseable = descriptors.length === subfileCount
        && descriptors.every((descriptor) => descriptor.parseable && descriptor.offsetWithinBounds && descriptor.lengthWithinBounds);
    }

    const validDescriptors = descriptors.filter((descriptor) => (
      descriptor.parseable
      && descriptor.offsetWithinBounds
      && descriptor.lengthWithinBounds
      && descriptor.prefixMatches
    ));
    const dlDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'DL');
    const enDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'EN');
    const idDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'ID');
    const primaryDescriptor = validDescriptors.find((descriptor) => PRIMARY_SUBFILE_TYPES.includes(descriptor.type));
    const jurisdictionSpecificDescriptor = validDescriptors.find((descriptor) => /^Z[A-Z0-9]$/.test(descriptor.type));

    return {
      rawBytesAvailable: !!bytes,
      rawByteLength,
      rawHeaderAt,
      rawHeaderLf,
      rawHeaderRs,
      rawHeaderCr,
      rawHeaderAnsi,
      ansiHeader: rawHeaderAnsi,
      containsAnsi: rawHeaderAnsi,
      ansiPosition: rawHeaderAnsi ? 4 : -1,
      headerLengthParseable: !!(rawHeaderAt && rawHeaderAnsi && iinPresent && aamvaVersion && jurisdictionVersion && Number.isFinite(subfileCount)),
      iinPresent,
      aamvaVersion,
      jurisdictionVersion,
      subfileCount,
      descriptorTableParseable,
      descriptors,
      dlDescriptor,
      enDescriptor,
      idDescriptor,
      primaryDescriptor,
      jurisdictionSpecificDescriptor,
      dlSubfile: !!dlDescriptor,
      enSubfile: !!enDescriptor,
      idSubfile: !!idDescriptor,
      primarySubfileType: primaryDescriptor?.type || 'NONE',
      jurisdictionSpecificSubfile: !!jurisdictionSpecificDescriptor,
      dataElementSeparator: bytes ? bytes[1] : null,
      recordSeparatorByte: bytes ? bytes[2] : null,
      segmentTerminatorByte: bytes ? bytes[3] : null
    };
  }

  function isSeparatorByte(byte, header) {
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

  function tagAt(bytes, index, tag) {
    const codes = tagBytes(tag);
    return bytes[index] === codes[0] && bytes[index + 1] === codes[1] && bytes[index + 2] === codes[2];
  }

  function tagBoundary(bytes, index, subfileStart, header) {
    if (index === subfileStart + 2) return true;
    if (index <= subfileStart) return false;
    return isSeparatorByte(bytes[index - 1], header);
  }

  function findFieldBytes(bytes, subfileStart, subfileEnd, tag, header) {
    for (let i = subfileStart + 2; i <= subfileEnd - 3; i += 1) {
      if (!tagAt(bytes, i, tag) || !tagBoundary(bytes, i, subfileStart, header)) continue;
      let end = i + 3;
      while (end < subfileEnd && !isSeparatorByte(bytes[end], header)) end += 1;
      return clean(asciiFromBytes(bytes, i + 3, end - (i + 3)), 180);
    }
    return '';
  }

  function subfileRange(header) {
    const descriptor = header.primaryDescriptor || null;
    if (!descriptor) return null;
    return {
      type: descriptor.type,
      start: descriptor.offset,
      end: descriptor.offset + descriptor.length
    };
  }

  function recoverPermittedFieldsFromBytes(bytes, header) {
    const range = subfileRange(header);
    if (!range) {
      return {
        visitor_first_name: '',
        visitor_middle_name: '',
        visitor_last_name: '',
        date_of_birth: '',
        id_issuing_jurisdiction: ''
      };
    }
    const dct = splitDct(findFieldBytes(bytes, range.start, range.end, 'DCT', header));
    const first = clean(findFieldBytes(bytes, range.start, range.end, 'DAC', header) || dct.first, 80);
    const middle = clean(findFieldBytes(bytes, range.start, range.end, 'DAD', header) || dct.middle, 80);
    const last = clean(findFieldBytes(bytes, range.start, range.end, 'DCS', header), 100);
    const dob = normalizeDob(findFieldBytes(bytes, range.start, range.end, 'DBB', header));
    const jurisdiction = clean(findFieldBytes(bytes, range.start, range.end, 'DAJ', header), 40);
    return {
      visitor_first_name: first,
      visitor_middle_name: middle,
      visitor_last_name: last,
      date_of_birth: dob,
      id_issuing_jurisdiction: jurisdiction
    };
  }

  function tagPresentBytes(bytes, header, tag) {
    const range = subfileRange(header);
    if (!range) return false;
    return !!findFieldBytes(bytes, range.start, range.end, tag, header);
  }

  function countStandardTagsBytes(bytes, header) {
    return EXPECTED_TAGS.reduce((count, tag) => count + (tagPresentBytes(bytes, header, tag) ? 1 : 0), 0);
  }

  function splitDct(value) {
    const parts = clean(value, 160).split(/[,\s]+/).filter(Boolean);
    return {
      first: parts[0] || '',
      middle: parts.slice(1).join(' ')
    };
  }

  function fingerprintBytes(bytes) {
    let hash = 2166136261;
    const data = bytes || new Uint8Array();
    for (let i = 0; i < data.length; i += 1) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${data.length}:${(hash >>> 0).toString(16)}`;
  }

  function fingerprintPayload(raw) {
    const text = String(raw || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
  }

  function parseDescriptorText(raw, cursor, index) {
    const chunk = String(raw || '').slice(cursor, cursor + 10);
    const match = chunk.match(/^([A-Z0-9]{2})(\d{4})(\d{4})/i);
    if (!match) {
      return {
        index,
        type: 'unknown',
        offset: '',
        length: '',
        parseable: false,
        offsetWithinBounds: false,
        lengthWithinBounds: false,
        prefixMatches: false
      };
    }
    const type = match[1].toUpperCase();
    const offset = Number(match[2]);
    const length = Number(match[3]);
    const offsetWithinBounds = offset >= 0 && offset < raw.length;
    const lengthWithinBounds = offsetWithinBounds && length > 0 && offset + length <= raw.length;
    return {
      index,
      type,
      offset,
      length,
      parseable: true,
      offsetWithinBounds,
      lengthWithinBounds,
      prefixMatches: lengthWithinBounds && raw.slice(offset, offset + 2).toUpperCase() === type
    };
  }

  function headerInfoText(rawInput) {
    const raw = String(rawInput || '');
    const ansiPosition = raw.search(/ANSI ?\d{6}/i);
    const normalized = raw.replace(/[\r\n\x1e]+/g, ' ');
    const normalizedMatch = normalized.match(/ANSI\s*(\d{6})(\d{2})?(\d{2})?(\d{2})?/i);
    const directMatch = ansiPosition >= 0
      ? raw.slice(ansiPosition).match(/^ANSI ?(\d{6})(\d{2})?(\d{2})?(\d{2})?/i)
      : null;
    const match = directMatch || normalizedMatch;
    const descriptorStart = match && directMatch ? ansiPosition + match[0].length : -1;
    const subfileCount = match && match[4] ? Number(match[4]) : null;
    const descriptors = [];
    let descriptorTableParseable = false;
    if (descriptorStart >= 0 && Number.isFinite(subfileCount) && subfileCount > 0 && subfileCount <= 10) {
      for (let i = 0; i < subfileCount; i += 1) {
        descriptors.push(parseDescriptorText(raw, descriptorStart + (i * DESCRIPTOR_LENGTH), i + 1));
      }
      descriptorTableParseable = descriptors.length === subfileCount
        && descriptors.every((descriptor) => descriptor.parseable && descriptor.offsetWithinBounds && descriptor.lengthWithinBounds);
    }
    if (!descriptors.length) {
      const fallback = raw.match(/(DL|EN|ID)(\d{4})(\d{4})/ig) || [];
      fallback.slice(0, 6).forEach((text, index) => {
        const cursor = raw.indexOf(text);
        descriptors.push(parseDescriptorText(raw, cursor, index + 1));
      });
      descriptorTableParseable = descriptors.length > 0 && descriptors.every((descriptor) => descriptor.parseable);
    }
    const validDescriptors = descriptors.filter((descriptor) => (
      descriptor.parseable
      && descriptor.offsetWithinBounds
      && descriptor.lengthWithinBounds
      && descriptor.prefixMatches
    ));
    const dlDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'DL');
    const enDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'EN');
    const idDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'ID');
    const primaryDescriptor = validDescriptors.find((descriptor) => PRIMARY_SUBFILE_TYPES.includes(descriptor.type));
    const jurisdictionSpecificDescriptor = validDescriptors.find((descriptor) => /^Z[A-Z0-9]$/.test(descriptor.type));
    const fallbackDl = /(?:^|[^A-Z0-9])DL\d{8}/i.test(normalized) || /ANSI[\s\S]*DL\d{8}/i.test(normalized);
    const fallbackEn = /(?:^|[^A-Z0-9])EN\d{8}/i.test(normalized) || /ANSI[\s\S]*EN\d{8}/i.test(normalized);
    const fallbackId = /(?:^|[^A-Z0-9])ID\d{8}/i.test(normalized) || /ANSI[\s\S]*ID\d{8}/i.test(normalized);
    const useLegacySubfileFallback = !descriptors.length;

    return {
      rawBytesAvailable: false,
      rawByteLength: 0,
      rawHeaderAt: false,
      rawHeaderLf: false,
      rawHeaderRs: false,
      rawHeaderCr: false,
      rawHeaderAnsi: false,
      ansiHeader: !!match,
      containsAnsi: /ANSI/i.test(raw),
      ansiPosition,
      headerLengthParseable: !!(match && match[1] && match[2] && match[3]),
      iinPresent: !!(match && match[1]),
      aamvaVersion: match && match[2] ? String(Number(match[2])) : '',
      jurisdictionVersion: match && match[3] ? String(Number(match[3])) : '',
      subfileCount: Number.isFinite(subfileCount) ? subfileCount : null,
      descriptorTableParseable,
      descriptors,
      dlSubfile: !!dlDescriptor || (useLegacySubfileFallback && fallbackDl),
      enSubfile: !!enDescriptor || (useLegacySubfileFallback && fallbackEn),
      idSubfile: !!idDescriptor || (useLegacySubfileFallback && fallbackId),
      primarySubfileType: primaryDescriptor?.type || (useLegacySubfileFallback && fallbackDl ? 'DL' : useLegacySubfileFallback && fallbackEn ? 'EN' : useLegacySubfileFallback && fallbackId ? 'ID' : 'NONE'),
      jurisdictionSpecificSubfile: !!jurisdictionSpecificDescriptor,
      dlDescriptor,
      enDescriptor,
      primaryDescriptor,
      jurisdictionSpecificDescriptor,
      idDescriptor
    };
  }

  function fieldPattern(tag) {
    return new RegExp(`(?:^|[\\r\\n\\x1e]|(?:DL|EN|ID))${tag}([^\\r\\n\\x1e]*)`, 'i');
  }

  function findFieldText(raw, tag) {
    const text = String(raw || '');
    const match = text.match(fieldPattern(tag));
    if (!match) return '';
    return clean(match[1], 180);
  }

  function tagPresentText(raw, tag) {
    return fieldPattern(tag).test(String(raw || ''));
  }

  function descriptorSubfilesText(raw, header) {
    const ranges = [];
    (header.descriptors || []).forEach((descriptor) => {
      if (!descriptor.parseable || !descriptor.offsetWithinBounds || !descriptor.lengthWithinBounds || !descriptor.prefixMatches) return;
      ranges.push({
        type: descriptor.type,
        text: raw.slice(descriptor.offset, descriptor.offset + descriptor.length)
      });
    });
    return ranges;
  }

  function boundedFieldSourceText(raw, header) {
    const subfiles = descriptorSubfilesText(raw, header);
    if (subfiles.length) return subfiles.map((subfile) => subfile.text).join('\n');
    return String(raw || '');
  }

  function recoverPermittedFieldsText(raw, header) {
    const source = boundedFieldSourceText(raw, header || headerInfoText(raw));
    const dct = splitDct(findFieldText(source, 'DCT'));
    const first = clean(findFieldText(source, 'DAC') || dct.first, 80);
    const middle = clean(findFieldText(source, 'DAD') || dct.middle, 80);
    const last = clean(findFieldText(source, 'DCS'), 100);
    const dob = normalizeDob(findFieldText(source, 'DBB'));
    const jurisdiction = clean(findFieldText(source, 'DAJ'), 40);
    return {
      visitor_first_name: first,
      visitor_middle_name: middle,
      visitor_last_name: last,
      date_of_birth: dob,
      id_issuing_jurisdiction: jurisdiction
    };
  }

  function countStandardTagsText(raw) {
    return EXPECTED_TAGS.reduce((count, tag) => count + (tagPresentText(raw, tag) ? 1 : 0), 0);
  }

  function baseDiagnostic(raw, zxingResult, bytes) {
    return {
      complianceIndicator: false,
      ansiHeader: false,
      startsWithAt: false,
      containsAnsi: false,
      ansiPosition: -1,
      headerLengthParseable: false,
      iinPresent: false,
      aamvaVersion: '',
      jurisdictionVersion: '',
      subfileCount: null,
      descriptorTableParseable: false,
      descriptors: [],
      dlSubfile: false,
      enSubfile: false,
      idSubfile: false,
      dlDescriptor: null,
      enDescriptor: null,
      idDescriptor: null,
      primaryDescriptor: null,
      primarySubfileType: 'NONE',
      jurisdictionSpecificDescriptor: null,
      jurisdictionSpecificSubfile: false,
      dcsTag: false,
      dacTag: false,
      dadTag: false,
      dbbTag: false,
      daqTag: false,
      dobParsed: false,
      recordSeparator: false,
      segmentTerminator: false,
      lineFeedSeparators: false,
      controlCounts: bytes ? controlCountsFromBytes(bytes) : controlCountsFromString(raw),
      escapedControlCounts: escapedControlCounts(raw),
      zxing: zxingShape(raw, zxingResult, bytes),
      decodedTextLength: String(raw || '').length,
      aamvaIndicators: false,
      strictParserPass: false,
      fieldRecoveryPass: false,
      parserResult: 'INVALID',
      parserFailureReason: '',
      parserSource: 'NONE',
      rawBytesAvailable: !!bytes,
      rawByteLength: bytes ? bytes.length : 0,
      rawHeaderAt: false,
      rawHeaderLf: false,
      rawHeaderRs: false,
      rawHeaderCr: false,
      rawHeaderAnsi: false,
      recoveredData: {
        visitor_first_name: '',
        visitor_middle_name: '',
        visitor_last_name: '',
        date_of_birth: '',
        id_issuing_jurisdiction: ''
      },
      strictData: {},
      sharedParserError: '',
      fingerprint: bytes ? fingerprintBytes(bytes) : fingerprintPayload(raw)
    };
  }

  function analyzeBytes(rawText, zxingResult, bytes) {
    const raw = String(rawText || '');
    const header = parseHeaderBytes(bytes);
    const dcsTag = tagPresentBytes(bytes, header, 'DCS');
    const dacTag = tagPresentBytes(bytes, header, 'DAC');
    const dctTag = tagPresentBytes(bytes, header, 'DCT');
    const dadTag = tagPresentBytes(bytes, header, 'DAD');
    const dbbTag = tagPresentBytes(bytes, header, 'DBB');
    const daqTag = tagPresentBytes(bytes, header, 'DAQ');
    const standardTagCount = countStandardTagsBytes(bytes, header);
    const recoveredData = recoverPermittedFieldsFromBytes(bytes, header);
    const dobTagFoundButInvalid = dbbTag && !recoveredData.date_of_birth;
    const hasSubfile = header.primarySubfileType !== 'NONE';
    const hasRequiredTags = dcsTag && dbbTag && (dacTag || dctTag);
    const hasAamvaEvidence = header.rawHeaderAt
      && header.rawHeaderAnsi
      && header.iinPresent
      && !!header.aamvaVersion
      && Number.isFinite(header.subfileCount)
      && (hasSubfile || standardTagCount >= 3);
    const strictParserPass = !!(
      header.rawHeaderAt
      && header.rawHeaderLf
      && header.rawHeaderRs
      && header.rawHeaderCr
      && header.rawHeaderAnsi
      && header.iinPresent
      && !!header.aamvaVersion
      && !!header.jurisdictionVersion
      && header.descriptorTableParseable
      && hasSubfile
      && hasRequiredTags
      && !!recoveredData.date_of_birth
    );
    const fieldRecoveryPass = !!(
      hasAamvaEvidence
      && hasRequiredTags
      && recoveredData.visitor_first_name
      && recoveredData.visitor_last_name
      && recoveredData.date_of_birth
    );

    let parserFailureReason = '';
    if (!strictParserPass) {
      if (!header.rawHeaderAt) parserFailureReason = 'Compliance indicator missing';
      else if (!header.rawHeaderLf || !header.rawHeaderRs || !header.rawHeaderCr) parserFailureReason = 'AAMVA control header bytes not found';
      else if (!header.rawHeaderAnsi) parserFailureReason = 'ANSI header not recognized';
      else if (!header.iinPresent) parserFailureReason = 'IIN not found in ANSI header';
      else if (!Number.isFinite(header.subfileCount)) parserFailureReason = 'Subfile count not parseable';
      else if (!header.descriptorTableParseable) parserFailureReason = 'Subfile descriptor table invalid';
      else if (!hasSubfile) parserFailureReason = 'Primary DL/EN/ID subfile not found';
      else if (!hasRequiredTags) parserFailureReason = 'Required permitted field tags not found';
      else if (dobTagFoundButInvalid) parserFailureReason = 'DOB tag found but date parser failed';
      else parserFailureReason = 'Unsupported AAMVA structure';
    }

    return {
      ...baseDiagnostic(raw, zxingResult, bytes),
      complianceIndicator: header.rawHeaderAt,
      ansiHeader: header.ansiHeader,
      startsWithAt: header.rawHeaderAt,
      containsAnsi: header.containsAnsi,
      ansiPosition: header.ansiPosition,
      headerLengthParseable: header.headerLengthParseable,
      iinPresent: header.iinPresent,
      aamvaVersion: header.aamvaVersion,
      jurisdictionVersion: header.jurisdictionVersion,
      subfileCount: header.subfileCount,
      descriptorTableParseable: header.descriptorTableParseable,
      descriptors: header.descriptors,
      dlSubfile: header.dlSubfile,
      enSubfile: header.enSubfile,
      idSubfile: header.idSubfile,
      dlDescriptor: header.dlDescriptor,
      enDescriptor: header.enDescriptor,
      idDescriptor: header.idDescriptor,
      primaryDescriptor: header.primaryDescriptor,
      primarySubfileType: header.primarySubfileType,
      jurisdictionSpecificDescriptor: header.jurisdictionSpecificDescriptor,
      jurisdictionSpecificSubfile: header.jurisdictionSpecificSubfile,
      dcsTag,
      dacTag,
      dadTag,
      dbbTag,
      daqTag,
      dobParsed: !!recoveredData.date_of_birth,
      recordSeparator: header.rawHeaderRs || (controlCountsFromBytes(bytes).rs > 0),
      segmentTerminator: header.rawHeaderCr || (controlCountsFromBytes(bytes).cr > 0),
      lineFeedSeparators: header.rawHeaderLf || (controlCountsFromBytes(bytes).lf > 0),
      aamvaIndicators: hasAamvaEvidence,
      strictParserPass,
      fieldRecoveryPass,
      parserResult: strictParserPass || fieldRecoveryPass ? 'VALID' : 'INVALID',
      parserFailureReason,
      parserSource: 'RAW BYTES',
      rawBytesAvailable: true,
      rawByteLength: bytes.length,
      rawHeaderAt: header.rawHeaderAt,
      rawHeaderLf: header.rawHeaderLf,
      rawHeaderRs: header.rawHeaderRs,
      rawHeaderCr: header.rawHeaderCr,
      rawHeaderAnsi: header.rawHeaderAnsi,
      recoveredData,
      strictData: strictParserPass ? recoveredData : {},
      sharedParserError: ''
    };
  }

  function analyzeNoBytes(rawText, zxingResult) {
    const raw = String(rawText || '');
    const textCounts = controlCountsFromString(raw);
    const diagnostic = baseDiagnostic(raw, zxingResult, null);
    return {
      ...diagnostic,
      startsWithAt: raw.trim().startsWith('@'),
      complianceIndicator: raw.trim().startsWith('@'),
      containsAnsi: /ANSI/i.test(raw),
      ansiHeader: /ANSI/i.test(raw),
      ansiPosition: raw.search(/ANSI/i),
      recordSeparator: textCounts.rs > 0,
      segmentTerminator: textCounts.cr > 0,
      lineFeedSeparators: textCounts.lf > 0,
      parserFailureReason: 'Raw bytes unavailable; HRI text not used for AAMVA structural parsing',
      parserSource: 'NONE'
    };
  }

  function analyzeText(rawInput, zxingResult) {
    const raw = String(rawInput == null ? '' : rawInput);
    const header = headerInfoText(raw);
    const boundedSource = boundedFieldSourceText(raw, header);
    const hasDescriptorSubfile = descriptorSubfilesText(raw, header).length > 0;
    const rawHeaderEvidence = header.ansiHeader && header.iinPresent;
    const tagSource = hasDescriptorSubfile || rawHeaderEvidence ? boundedSource : '';
    const dcsTag = tagPresentText(tagSource, 'DCS');
    const dacTag = tagPresentText(tagSource, 'DAC');
    const dctTag = tagPresentText(tagSource, 'DCT');
    const dadTag = tagPresentText(tagSource, 'DAD');
    const dbbTag = tagPresentText(tagSource, 'DBB');
    const daqTag = tagPresentText(tagSource, 'DAQ');
    const standardTagCount = countStandardTagsText(tagSource);
    const recoveredData = recoverPermittedFieldsText(raw, header);
    const dobTagFoundButInvalid = dbbTag && !recoveredData.date_of_birth;
    const hasSubfile = header.primarySubfileType !== 'NONE';
    const hasRequiredTags = dcsTag && (dacTag || dctTag) && dbbTag;
    const hasAamvaEvidence = (header.ansiHeader && header.iinPresent && standardTagCount >= 3)
      || (hasSubfile && standardTagCount >= 3);
    const sharedParsed = Shared && typeof Shared.parseAamva === 'function'
      ? Shared.parseAamva(raw)
      : { ok: false, data: {}, error: 'shared_parser_unavailable' };
    const strictEligible = raw.trim().startsWith('@')
      && header.ansiHeader
      && header.iinPresent
      && !!header.aamvaVersion
      && !!header.jurisdictionVersion
      && hasSubfile
      && hasRequiredTags
      && !!recoveredData.date_of_birth;
    const strictParserPass = !!(strictEligible && sharedParsed.ok);
    const fieldRecoveryPass = !!(
      hasAamvaEvidence
      && hasRequiredTags
      && recoveredData.visitor_first_name
      && recoveredData.visitor_last_name
      && recoveredData.date_of_birth
    );

    let parserFailureReason = '';
    if (!strictParserPass) {
      if (!raw.trim().startsWith('@')) parserFailureReason = 'Compliance indicator missing';
      else if (!header.ansiHeader) parserFailureReason = 'ANSI header not recognized';
      else if (!header.iinPresent) parserFailureReason = 'IIN not found in ANSI header';
      else if (!hasSubfile) parserFailureReason = 'Primary DL/EN/ID subfile not found';
      else if (!hasRequiredTags) parserFailureReason = 'Required permitted field tags not found';
      else if (dobTagFoundButInvalid) parserFailureReason = 'DOB tag found but date parser failed';
      else if (!sharedParsed.ok) parserFailureReason = 'Required field tags found but parser rejected separators';
      else parserFailureReason = 'Unsupported AAMVA structure';
    }

    return {
      ...baseDiagnostic(raw, zxingResult, null),
      complianceIndicator: raw.trim().startsWith('@'),
      ansiHeader: header.ansiHeader,
      startsWithAt: raw.trim().startsWith('@'),
      containsAnsi: header.containsAnsi,
      ansiPosition: header.ansiPosition,
      headerLengthParseable: header.headerLengthParseable,
      iinPresent: header.iinPresent,
      aamvaVersion: header.aamvaVersion,
      jurisdictionVersion: header.jurisdictionVersion,
      subfileCount: header.subfileCount,
      descriptorTableParseable: header.descriptorTableParseable,
      descriptors: header.descriptors,
      dlSubfile: header.dlSubfile,
      enSubfile: header.enSubfile,
      idSubfile: header.idSubfile,
      dlDescriptor: header.dlDescriptor,
      enDescriptor: header.enDescriptor,
      idDescriptor: header.idDescriptor,
      primaryDescriptor: header.primaryDescriptor,
      primarySubfileType: header.primarySubfileType,
      jurisdictionSpecificDescriptor: header.jurisdictionSpecificDescriptor,
      jurisdictionSpecificSubfile: header.jurisdictionSpecificSubfile,
      dcsTag,
      dacTag,
      dadTag,
      dbbTag,
      daqTag,
      dobParsed: !!recoveredData.date_of_birth,
      recordSeparator: /\x1e/.test(raw),
      segmentTerminator: /\r/.test(raw),
      lineFeedSeparators: /\n/.test(raw),
      aamvaIndicators: hasAamvaEvidence,
      strictParserPass,
      fieldRecoveryPass,
      parserResult: strictParserPass || fieldRecoveryPass ? 'VALID' : 'INVALID',
      parserFailureReason,
      parserSource: 'PLAIN TEXT FALLBACK',
      recoveredData,
      strictData: sharedParsed.ok ? sharedParsed.data || {} : {},
      sharedParserError: sharedParsed.ok ? '' : clean(sharedParsed.error || '', 80)
    };
  }

  function analyzeAamvaPayload(rawInput, zxingResult) {
    const raw = String(rawInput == null ? '' : rawInput);
    const bytes = resultBytes(zxingResult);
    if (bytes) return analyzeBytes(raw, zxingResult, bytes);
    if (zxingResult) return analyzeNoBytes(raw, zxingResult);
    return analyzeText(raw, zxingResult);
  }

  return {
    analyzeAamvaPayload,
    fingerprintPayload,
    normalizeDob,
    copyBytes
  };
});
