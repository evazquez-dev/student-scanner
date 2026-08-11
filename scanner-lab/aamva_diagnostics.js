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

  function headerInfo(raw) {
    const normalized = String(raw || '').replace(/[\r\n\x1e]+/g, ' ');
    const match = normalized.match(/ANSI\s*(\d{6})(\d{2})?(\d{2})?/i);
    return {
      ansiHeader: !!match,
      iinPresent: !!(match && match[1]),
      aamvaVersion: match && match[2] ? String(Number(match[2])) : '',
      jurisdictionVersion: match && match[3] ? String(Number(match[3])) : '',
      dlSubfile: /(?:^|[^A-Z0-9])DL\d{8}/i.test(normalized) || /ANSI[\s\S]*DL\d{8}/i.test(normalized),
      idSubfile: /(?:^|[^A-Z0-9])ID\d{8}/i.test(normalized) || /ANSI[\s\S]*ID\d{8}/i.test(normalized)
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

  function recoverPermittedFields(raw) {
    const dct = splitDct(findField(raw, 'DCT'));
    const first = clean(findField(raw, 'DAC') || dct.first, 80);
    const middle = clean(findField(raw, 'DAD') || dct.middle, 80);
    const last = clean(findField(raw, 'DCS'), 100);
    const dob = normalizeDob(findField(raw, 'DBB'));
    const jurisdiction = clean(findField(raw, 'DAJ'), 40);
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

  function analyzeAamvaPayload(rawInput) {
    const raw = String(rawInput == null ? '' : rawInput);
    const header = headerInfo(raw);
    const dcsTag = tagPresent(raw, 'DCS');
    const dacTag = tagPresent(raw, 'DAC');
    const dctTag = tagPresent(raw, 'DCT');
    const dadTag = tagPresent(raw, 'DAD');
    const dbbTag = tagPresent(raw, 'DBB');
    const daqTag = tagPresent(raw, 'DAQ');
    const standardTagCount = countStandardTags(raw);
    const recoveredData = recoverPermittedFields(raw);
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
      iinPresent: header.iinPresent,
      aamvaVersion: header.aamvaVersion,
      jurisdictionVersion: header.jurisdictionVersion,
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
