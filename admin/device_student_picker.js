/* EAGLENEST_DEVICE_STUDENT_PICKER_V1
 * Reusable, roster-backed student selector for device issuance and repair intake.
 * Never treats a typed name as a student ID: selection is explicit.
 */
(() => {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const validOsis = value => /^\d{9}$/.test(String(value || ''));

  function field({required=false, osis='', name=''}={}) {
    const id = validOsis(osis) ? String(osis) : '';
    const label = required ? 'Student to receive device' : 'Student involved (optional)';
    const display = id ? (name ? `${name} · ${id}` : id) : '';
    return `<section class="dmStudentPicker" data-dm-student-picker data-required="${required ? '1' : '0'}">
      <label>${escapeHtml(label)}
        <input type="search" data-dm-student-query autocomplete="off" aria-autocomplete="list"
          aria-label="Search student by name or OSIS" placeholder="Search by student name or 9-digit OSIS"
          value="${escapeHtml(display)}">
      </label>
      <input type="hidden" name="student_osis" value="${escapeHtml(id)}">
      <div class="dmSearchSuggestions dmStudentPickerMatches" data-dm-student-matches
        aria-label="Student search matches"></div>
      <div class="dmStudentPickerFooter"><span data-dm-student-status class="dmSmall dmMuted" role="status">${
        id ? `Selected student: ${escapeHtml(display)}` :
        required ? 'Search the current student roster and select a match.' :
        'Leave blank to use the device’s current assignee, if any.'
      }</span><button type="button" class="dmButton dmSmall" data-dm-student-clear>Clear</button></div>
    </section>`;
  }

  function attach(form, api) {
    const root = form?.querySelector?.('[data-dm-student-picker]');
    if (!root) return;
    const input = root.querySelector('[data-dm-student-query]');
    const hidden = root.querySelector('[name="student_osis"]');
    const results = root.querySelector('[data-dm-student-matches]');
    const status = root.querySelector('[data-dm-student-status]');
    const clear = root.querySelector('[data-dm-student-clear]');
    const required = root.dataset.required === '1';
    let requestNumber = 0;
    let debounce = null;
    let matches = [];

    function clearResults() {
      results.replaceChildren();
      matches = [];
      input.setAttribute('aria-expanded','false');
    }
    function choose(osis, name, verified=true) {
      requestNumber++;
      if (debounce) clearTimeout(debounce);
      input.value = name ? `${name} · ${osis}` : osis;
      hidden.value = osis;
      status.textContent = verified ? `Selected: ${name} · ${osis}` :
        `Selected OSIS ${osis} (not found in the current roster)`;
      clearResults();
    }
    function clearSelection() {
      requestNumber++;
      if (debounce) clearTimeout(debounce);
      hidden.value = '';
      input.value = '';
      status.textContent = required ? 'Search and select a student.' :
        'No student selected. The current device assignee will be used, if any.';
      clearResults();
    }
    clear.addEventListener('click', () => { clearSelection(); input.focus(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') clearResults();
      if (event.key === 'ArrowDown') {
        const first = results.querySelector('button');
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    input.addEventListener('input', () => {
      // Changing a previously selected name MUST invalidate the saved OSIS.
      const seq = ++requestNumber;
      hidden.value = '';
      clearResults();
      if (debounce) clearTimeout(debounce);
      const typed = input.value.trim();
      if (typed.length < 2) {
        status.textContent = required ? 'Type at least 2 characters to find a student.' :
          'Select a student, or clear the field to leave it blank.';
        return;
      }
      status.textContent = 'Searching current student roster…';
      debounce = setTimeout(async () => {
        try {
          const data = await api('/admin/device-management/students?q='+encodeURIComponent(typed));
          if (seq !== requestNumber || !root.isConnected) return;
          matches = (Array.isArray(data.students) ? data.students : [])
            .filter(s => validOsis(s.osis)).slice(0, 25);
          clearResults(); // clears list only; chosen OSIS remains empty
          // clearResults() resets matches too; rebuild with the verified response.
          matches = (Array.isArray(data.students) ? data.students : [])
            .filter(s => validOsis(s.osis)).slice(0,25);
          for (const student of matches) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${student.name || 'Student'} · ${student.osis}`;
            button.addEventListener('click', () => choose(student.osis, student.name || 'Student'));
            results.appendChild(button);
          }
          // Historical/exited student OSIS can still be attached to a ticket,
          // but is never allowed as an unverified device assignment.
          if (!required && validOsis(typed) && !matches.some(s => s.osis === typed)) {
            const manual = document.createElement('button');
            manual.type = 'button';
            manual.textContent = `Use OSIS ${typed} (not in current roster)`;
            manual.addEventListener('click', () => choose(typed, '', false));
            results.appendChild(manual);
          }
          input.setAttribute('aria-expanded', results.childElementCount ? 'true' : 'false');
          status.textContent = matches.length
            ? 'Select the correct student below.'
            : (results.childElementCount ? 'Not in current roster; confirm the OSIS.' :
              'No current student found. Try another name or OSIS.');
        } catch(error) {
          if (seq === requestNumber && root.isConnected)
            status.textContent = 'Student lookup unavailable: '+(error?.message || String(error));
        }
      }, 180);
    });
  }

  function validate(form) {
    const root = form?.querySelector?.('[data-dm-student-picker]');
    if (!root) return '';
    const value = root.querySelector('[name="student_osis"]').value;
    const typed = root.querySelector('[data-dm-student-query]').value.trim();
    const required = root.dataset.required === '1';
    if (required && !validOsis(value)) return 'Search by student name or OSIS and select a student from the results.';
    if (typed && !validOsis(value)) return 'Select the student from the results, or clear the search field.';
    return '';
  }
  window.EAGLENEST_DEVICE_STUDENT_PICKER_V1 = Object.freeze({field,attach,validate});
})();
