(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../visitor/visitor_shared.js'));
  } else {
    root.EagleNestScannerLabAamva = factory(root.EagleNestVisitor);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Shared) {
  'use strict';

  const EXPECTED_TAGS = ['DCS', 'DAC', 'DAD', 'DCT', 'DBB', 'DAJ', 'DAQ'];

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

  function controlCounts(raw) {
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

  function escapedControlCounts(raw) {
    return {
      cr: countLiteral(raw, '\\r'),
      lf: countLiteral(raw, '\\n'),
      rsHex: countLiteral(String(raw || '').toLowerCase(), '\\x1e'),
      rsUnicode: countLiteral(String(raw || '').toLowerCase(), '\\u001e')
    };
  }

  function byteLength(value) {
    if (!value) return 0;
    if (typeof value === 'string') return value.length;
    if (typeof value.byteLength === 'number') return value.byteLength;
    if (typeof value.length === 'number') return value.length;
    return 0;
  }

  function zxingShape(raw, zxingResult) {
    const result = zxingResult || {};
    const byteSource = result.rawBytes || result.bytes || result.contentBytes || result.byteSegments || null;
    return {
      textAvailable: typeof result.text === 'string' ? result.text.length > 0 : String(raw || '').length > 0,
      rawBytesAvailable: !!byteSource,
      decodedTextCodeUnitLength: String(raw || '').length,
      decodedByteLength: byteLength(byteSource),
      containsAsciiControlChars: /[\x00-\x1f]/.test(String(raw || ''))
    };
  }

  function parseDescriptor(raw, cursor, index) {
    const chunk = String(raw || '').slice(cursor, cursor + 10);
    const match = chunk.match(/^(DL|ID)(\d{4})(\d{4})/i);
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
    const lengthWithinBounds = offsetWithinBounds && length >= 0 && offset + length <= raw.length;
    return {
      index,
      type,
      offset,
      length,
      parseable: true,
      offsetWithinBounds,
      lengthWithinBounds,
      prefixMatches: offsetWithinBounds && raw.slice(offset, offset + 2).toUpperCase() === type
    };
  }

  function headerInfo(rawInput) {
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
        descriptors.push(parseDescriptor(raw, descriptorStart + (i * 10), i + 1));
      }
      descriptorTableParseable = descriptors.length === subfileCount && descriptors.every((descriptor) => descriptor.parseable);
    }
    if (!descriptors.length) {
      const fallback = raw.match(/(DL|ID)(\d{4})(\d{4})/ig) || [];
      fallback.slice(0, 6).forEach((text, index) => {
        const cursor = raw.indexOf(text);
        descriptors.push(parseDescriptor(raw, cursor, index + 1));
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
    const idDescriptor = validDescriptors.find((descriptor) => descriptor.type === 'ID');
    const fallbackDl = /(?:^|[^A-Z0-9])DL\d{8}/i.test(normalized) || /ANSI[\s\S]*DL\d{8}/i.test(normalized);
    const fallbackId = /(?:^|[^A-Z0-9])ID\d{8}/i.test(normalized) || /ANSI[\s\S]*ID\d{8}/i.test(normalized);
    const useLegacySubfileFallback = !descriptors.length;

    return {
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
      idSubfile: !!idDescriptor || (useLegacySubfileFallback && fallbackId),
      dlDescriptor,
      idDescriptor
    };
  }

  function fieldPattern(tag) {
    return new RegExp(`(?:^|[\\r\\n\\x1e]|(?:DL|ID))${tag}([^\\r\\n\\x1e]*)`, 'i');
  }

  function findField(raw, tag) {
    const text = String(raw || '');
    const match = text.match(fieldPattern(tag));
    if (!match) return '';
    return clean(match[1], 180);
  }

  function tagPresent(raw, tag) {
    return fieldPattern(tag).test(String(raw || ''));
  }

  function splitDct(value) {
    const parts = clean(value, 160).split(/[,\s]+/).filter(Boolean);
    return {
      first: parts[0] || '',
      middle: parts.slice(1).join(' ')
    };
  }

  function descriptorSubfiles(raw, header) {
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

  function boundedFieldSource(raw, header) {
    const subfiles = descriptorSubfiles(raw, header);
    if (subfiles.length) return subfiles.map((subfile) => subfile.text).join('\n');
    return String(raw || '');
  }

  function recoverPermittedFields(raw, header) {
    const source = boundedFieldSource(raw, header || headerInfo(raw));
    const dct = splitDct(findField(source, 'DCT'));
    const first = clean(findField(source, 'DAC') || dct.first, 80);
    const middle = clean(findField(source, 'DAD') || dct.middle, 80);
    const last = clean(findField(source, 'DCS'), 100);
    const dob = normalizeDob(findField(source, 'DBB'));
    const jurisdiction = clean(findField(source, 'DAJ'), 40);
    return {
      visitor_first_name: first,
      visitor_middle_name: middle,
      visitor_last_name: last,
      date_of_birth: dob,
      id_issuing_jurisdiction: jurisdiction
    };
  }

  function countStandardTags(raw) {
    return EXPECTED_TAGS.reduce((count, tag) => count + (tagPresent(raw, tag) ? 1 : 0), 0);
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

  function analyzeAamvaPayload(rawInput, zxingResult) {
    const raw = String(rawInput == null ? '' : rawInput);
    const header = headerInfo(raw);
    const boundedSource = boundedFieldSource(raw, header);
    const hasDescriptorSubfile = descriptorSubfiles(raw, header).length > 0;
    const rawHeaderEvidence = header.ansiHeader && header.iinPresent;
    const tagSource = hasDescriptorSubfile || rawHeaderEvidence ? boundedSource : '';
    const dcsTag = tagPresent(tagSource, 'DCS');
    const dacTag = tagPresent(tagSource, 'DAC');
    const dctTag = tagPresent(tagSource, 'DCT');
    const dadTag = tagPresent(tagSource, 'DAD');
    const dbbTag = tagPresent(tagSource, 'DBB');
    const daqTag = tagPresent(tagSource, 'DAQ');
    const standardTagCount = countStandardTags(tagSource);
    const recoveredData = recoverPermittedFields(raw, header);
    const dobTagFoundButInvalid = dbbTag && !recoveredData.date_of_birth;
    const hasSubfile = header.dlSubfile || header.idSubfile;
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
      else if (!hasSubfile) parserFailureReason = 'DL/ID subfile not found';
      else if (!hasRequiredTags) parserFailureReason = 'Required permitted field tags not found';
      else if (dobTagFoundButInvalid) parserFailureReason = 'DOB tag found but date parser failed';
      else if (!sharedParsed.ok) parserFailureReason = 'Required field tags found but parser rejected separators';
      else parserFailureReason = 'Unsupported AAMVA structure';
    }

    return {
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
      idSubfile: header.idSubfile,
      dcsTag,
      dacTag,
      dadTag,
      dbbTag,
      daqTag,
      recordSeparator: /\x1e/.test(raw),
      segmentTerminator: /\r/.test(raw),
      lineFeedSeparators: /\n/.test(raw),
      controlCounts: controlCounts(raw),
      escapedControlCounts: escapedControlCounts(raw),
      zxing: zxingShape(raw, zxingResult),
      decodedTextLength: raw.length,
      aamvaIndicators: hasAamvaEvidence,
      strictParserPass,
      fieldRecoveryPass,
      parserResult: strictParserPass || fieldRecoveryPass ? 'VALID' : 'INVALID',
      parserFailureReason,
      recoveredData,
      strictData: sharedParsed.ok ? sharedParsed.data || {} : {},
      sharedParserError: sharedParsed.ok ? '' : clean(sharedParsed.error || '', 80),
      fingerprint: fingerprintPayload(raw)
    };
  }

  return {
    analyzeAamvaPayload,
    fingerprintPayload,
    normalizeDob
  };
});
