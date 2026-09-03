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
    let m = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (m) {
      const mm = String(Number(m[1])).padStart(2, '0');
      const dd = String(Number(m[2])).padStart(2, '0');
      const yyyy = m[3];
      const iso = `${yyyy}-${mm}-${dd}`;
      const dt = new Date(`${iso}T12:00:00Z`);
      if (dt.getUTCFullYear() === Number(yyyy) && dt.getUTCMonth() + 1 === Number(mm) && dt.getUTCDate() === Number(dd)) return iso;
      return '';
    }
    m = value.match(/^(\d{4})[\/.-](\d{2})[\/.-](\d{2})$/);
    if (m) {
      const iso = `${m[1]}-${m[2]}-${m[3]}`;
      const dt = new Date(`${iso}T12:00:00Z`);
      if (dt.getUTCFullYear() === Number(m[1]) && dt.getUTCMonth() + 1 === Number(m[2]) && dt.getUTCDate() === Number(m[3])) return iso;
      return '';
    }
    m = value.match(/^(\d{8})$/);
    if (m) {
      const digits = m[1];
      const first4 = Number(digits.slice(0, 4));
      const yyyy = first4 >= 1900 && first4 <= 2100 ? digits.slice(0, 4) : digits.slice(4, 8);
      const mm = first4 >= 1900 && first4 <= 2100 ? digits.slice(4, 6) : digits.slice(0, 2);
      const dd = first4 >= 1900 && first4 <= 2100 ? digits.slice(6, 8) : digits.slice(2, 4);
      const iso = `${yyyy}-${mm}-${dd}`;
      const dt = new Date(`${iso}T12:00:00Z`);
      if (dt.getUTCFullYear() === Number(yyyy) && dt.getUTCMonth() + 1 === Number(mm) && dt.getUTCDate() === Number(dd)) return iso;
    }
    return '';
  }

  function editDistanceWithin(a, b, maxDistance) {
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
        const value = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + cost);
        next[j] = value;
        if (value < rowMin) rowMin = value;
      }
      if (rowMin > max) return false;
      prev = next;
    }
    return prev[right.length] <= max;
  }

  function birthLabelMatch(line) {
    const value = cleanLine(line).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const exact = value.match(/^(?:DOB|D[. ]?O[. ]?B\.?|D0B|DATE\s*[O0]F\s*B[I1]RTH|FECHA\s+DE\s+NACIMIENTO)\b\s*[:\-]?\s*(.*)$/i);
    if (exact) return { tail: cleanLine(exact[1] || ''), fuzzy: false };
    const compact = value.replace(/[^A-Z0-9]/g, '');
    if (compact.length >= 9 && compact.length <= 13 && editDistanceWithin(compact, 'DATEOFBIRTH', 2)) return { tail: '', fuzzy: true };
    return null;
  }

  function dateCandidate(value) {
    const line = cleanLine(value).toUpperCase();
    const m = line.match(/(?:[0-9OQDILSZGB|]{1,4}\s*[\/\.\-]\s*[0-9OQDILSZGB|]{1,2}\s*[\/\.\-]\s*[0-9OQDILSZGB|]{2,4}|[0-9OQDILSZGB|]{8})/);
    if (!m) return { value: '', found: false, shape: '', corrected: false, rejection: 'no_candidate' };
    const raw = String(m[0] || '');
    const shape = raw.replace(/[0-9OQDILSZGB|]/gi, 'D').replace(/\s+/g, '').replace(/[.\-]/g, '/').slice(0, 16);
    const comparable = raw.toUpperCase().replace(/\s+/g, '').replace(/[.\-]/g, '/');
    const corrected = comparable
      .replace(/[OQD]/g, '0')
      .replace(/[IL|]/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/G/g, '6')
      .replace(/B/g, '8');
    const normalized = normalizeDob(corrected);
    if (!normalized) return { value: '', found: true, shape, corrected: corrected !== comparable, rejection: 'invalid_calendar' };
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (normalized > todayIso) return { value: '', found: true, shape, corrected: corrected !== comparable, rejection: 'future_date' };
    return { value: normalized, found: true, shape, corrected: corrected !== comparable, rejection: '' };
  }

  function findDob(lines) {
    for (let i = 0; i < lines.length; i += 1) {
      const label = birthLabelMatch(lines[i]);
      if (!label) continue;
      const same = dateCandidate(label.tail || '');
      if (same.value) return { ...same, anchored: true, fuzzyAnchor: label.fuzzy === true };
      let observed = same.found ? same : null;
      let blocked = false;
      for (let j = i + 1; j < lines.length && j <= i + 2; j += 1) {
        if (LABEL_ONLY.test(lines[j]) || LABEL_PREFIX.test(lines[j])) { blocked = true; break; }
        const next = dateCandidate(lines[j]);
        if (!observed && next.found) observed = next;
        if (next.value) return { ...next, anchored: true, fuzzyAnchor: label.fuzzy === true };
      }
      return {
        value: '',
        anchored: true,
        fuzzyAnchor: label.fuzzy === true,
        found: !!observed,
        shape: observed?.shape || '',
        corrected: observed?.corrected === true,
        rejection: observed?.rejection || (blocked ? 'blocked_by_label' : 'no_candidate')
      };
    }
    return { value: '', anchored: false, fuzzyAnchor: false, found: false, shape: '', corrected: false, rejection: 'no_birth_anchor' };
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
        dobAnchorFuzzy: dob.fuzzyAnchor === true,
        dobCandidateFound: dob.found === true,
        dobCandidateShape: String(dob.shape || ''),
        dobCandidateCorrected: dob.corrected === true,
        dobRejection: String(dob.rejection || ''),
        idNumberLabelSeenAndRejected: rejectedIdNumberLabel
      }
    };
  }

  return { analyze, normalizeLines, isNameCandidate };
});
