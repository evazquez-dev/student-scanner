(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EagleNestScannerLabIdnyc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LABEL_ONLY = /^(?:NYC\s+IDENTIFICATION\s+CARD|ID\s*(?:NUMBER|NO\.?|#)|NAME|NOMBRE|ISSUANCE\s+DATE|ISSUED|EXPIRATION\s+DATE|EXPIRES?|ORGAN\s+DONOR|EYE\s+COLOR|HEIGHT|GENDER|SEX|DATE\s+OF\s+BIRTH|DOB|D\.O\.B\.?|FECHA\s+DE\s+NACIMIENTO|ADDRESS|DIRECCI[ÓO]N)$/i;
  const LABEL_PREFIX = /^(?:NYC\s+IDENTIFICATION\s+CARD|ID\s*(?:NUMBER|NO\.?|#)|ISSUANCE\s+DATE|ISSUED|EXPIRATION\s+DATE|EXPIRES?|ORGAN\s+DONOR|EYE\s+COLOR|HEIGHT|GENDER|SEX|DATE\s+OF\s+BIRTH|DOB|D\.O\.B\.?|FECHA\s+DE\s+NACIMIENTO|ADDRESS|DIRECCI[ÓO]N)\b/i;
  const NAME_ANCHOR = /^(?:NAME|NOMBRE)\b\s*[:\-]?\s*(.*)$/i;

  function cleanLine(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeLines(text) {
    return String(text == null ? '' : text)
      .replace(/\r/g, '\n')
      .split('\n')
      .map(cleanLine)
      .filter(Boolean);
  }

  function normalizeDob(raw) {
    const value = cleanLine(raw);
    let m = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) {
      const mm = String(Number(m[1])).padStart(2, '0');
      const dd = String(Number(m[2])).padStart(2, '0');
      const yyyy = m[3];
      const iso = `${yyyy}-${mm}-${dd}`;
      const dt = new Date(`${iso}T12:00:00Z`);
      if (dt.getUTCFullYear() === Number(yyyy) && dt.getUTCMonth() + 1 === Number(mm) && dt.getUTCDate() === Number(dd)) return iso;
      return '';
    }
    m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const dt = new Date(`${value}T12:00:00Z`);
      if (dt.getUTCFullYear() === Number(m[1]) && dt.getUTCMonth() + 1 === Number(m[2]) && dt.getUTCDate() === Number(m[3])) return value;
    }
    return '';
  }

  function findDob(lines) {
    const joined = lines.join('\n');
    const anchored = joined.match(/\b(?:DOB|D\.O\.B\.?|DATE\s+OF\s+BIRTH|FECHA\s+DE\s+NACIMIENTO)\b[^0-9]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/i);
    if (anchored) return { value: normalizeDob(anchored[1]), anchored: true };
    const loose = joined.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    return { value: loose ? normalizeDob(loose[1]) : '', anchored: false };
  }

  function isNameCandidate(line) {
    const value = cleanLine(line);
    if (!value || LABEL_ONLY.test(value) || LABEL_PREFIX.test(value)) return false;
    if (/\d/.test(value)) return false;
    if (value.length < 2 || value.length > 80) return false;
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) return false;
    if (/[^A-Za-zÀ-ÖØ-öø-ÿ .,'’\-]/.test(value)) return false;
    const words = value.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    return words.length >= 1 && words.length <= 6;
  }

  function parseGivenLine(line) {
    const value = cleanLine(line);
    if (!value) return { first: '', middle: '' };
    const comma = value.split(',').map(cleanLine);
    if (comma.length >= 2) {
      return {
        first: comma[0] || '',
        middle: comma.slice(1).join(' ').trim()
      };
    }
    const parts = value.split(/\s+/).filter(Boolean);
    return {
      first: parts[0] || '',
      middle: parts.slice(1).join(' ')
    };
  }

  function parseAnchoredName(lines) {
    let anchorIndex = -1;
    let anchorTail = '';
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(NAME_ANCHOR);
      if (!match) continue;
      anchorIndex = i;
      anchorTail = cleanLine(match[1] || '');
      break;
    }

    if (anchorIndex < 0) {
      return { anchorFound: false, candidates: [], first: '', middle: '', last: '', strategy: 'none' };
    }

    const candidates = [];
    if (anchorTail && isNameCandidate(anchorTail)) candidates.push(anchorTail);

    for (let i = anchorIndex + 1; i < lines.length && i <= anchorIndex + 6 && candidates.length < 3; i += 1) {
      const line = lines[i];
      if (LABEL_ONLY.test(line) || LABEL_PREFIX.test(line)) {
        if (candidates.length) break;
        continue;
      }
      if (isNameCandidate(line)) candidates.push(line);
    }

    if (candidates.length >= 2) {
      const given = parseGivenLine(candidates[1]);
      return {
        anchorFound: true,
        candidates,
        first: given.first,
        middle: given.middle,
        last: candidates[0],
        strategy: 'name_label_two_line'
      };
    }

    // Some OCR engines merge "NAME" and the surname onto one line, leaving the
    // given-name/middle line next. That is still safe to parse because NAME is
    // an explicit anchor and the two name components remain distinct.
    if (anchorTail && candidates.length === 1 && isNameCandidate(anchorTail)) {
      return { anchorFound: true, candidates, first: '', middle: '', last: '', strategy: 'insufficient_after_name_anchor' };
    }

    return { anchorFound: true, candidates, first: '', middle: '', last: '', strategy: 'insufficient_after_name_anchor' };
  }

  function analyze(text) {
    const lines = normalizeLines(text);
    const name = parseAnchoredName(lines);
    const dob = findDob(lines);
    const rejectedIdNumberLabel = lines.some((line) => /^ID\s*(?:NUMBER|NO\.?|#)\b/i.test(line));
    const data = {
      visitor_first_name: cleanLine(name.first),
      visitor_middle_name: cleanLine(name.middle),
      visitor_last_name: cleanLine(name.last),
      date_of_birth: dob.value
    };
    const ok = !!(data.visitor_first_name && data.visitor_last_name && data.date_of_birth);
    return {
      ok,
      data,
      diagnostics: {
        lineCount: lines.length,
        nameAnchorFound: name.anchorFound,
        nameCandidateCount: name.candidates.length,
        nameStrategy: name.strategy,
        dobFound: !!dob.value,
        dobAnchored: dob.anchored,
        idNumberLabelSeenAndRejected: rejectedIdNumberLabel
      }
    };
  }

  return { analyze, normalizeLines, isNameCandidate };
});
