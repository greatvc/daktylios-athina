/* =========================================================
   Μονά – Ζυγά | δακτύλιος
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Ρυθμίσεις ---------- */
  const CONFIG = {
    plateText:    'IKX-123',  // ό,τι φαίνεται πριν το κόκκινο ψηφίο
    rangeDays:    15,         // από σήμερα έως +15 ημέρες
    weekendsFree: true,       // Σάββατο/Κυριακή ο δακτύλιος δεν ισχύει
    holidaysFree: true,       // αργίες: ο δακτύλιος δεν ισχύει
    season:       null,       // π.χ. { from: '2026-10-19', to: '2027-07-23' } όταν βγει η ΚΥΑ

    /* Προεπιλεγμένο τελευταίο ψηφίο πινακίδας. Έρχεται από το config.php μέσω
       του index.php (window.DAKTYLIOS_PLATE_DIGIT). Ο έλεγχος γίνεται και εδώ,
       όχι μόνο στην PHP: το component πρέπει να δουλεύει και σκέτο, χωρίς τη
       σελίδα. Οτιδήποτε δεν είναι ένα ψηφίο 0-9 → null → «—», χωρίς λάθος. */
    defaultDigit: (() => {
      const raw = (typeof window !== 'undefined') ? window.DAKTYLIOS_PLATE_DIGIT : null;
      if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
      const s = String(raw).trim();
      return /^[0-9]$/.test(s) ? Number(s) : null;
    })()
  };

  /* Οι μεταφράσεις έρχονται από το js/i18n.js (φορτώνει πριν από εμάς).
     Fallback στα ελληνικά, ώστε το component να δουλεύει και μόνο του. */
  const T = (k) => (typeof t === 'function' ? t(k) : k);

  /* Υπάρχει πραγματική μετάφραση; Το t() επιστρέφει το ΚΛΕΙΔΙ όταν λείπει,
     οπότε χωρίς αυτόν τον έλεγχο θα γράφαμε «mzTitle» πάνω στο σωστό κείμενο
     του HTML — ακριβώς ό,τι δεν θέλουμε αν λείπει το i18n.js ή είναι παλιό. */
  const has = (k) => {
    if (typeof t !== 'function') return false;
    const v = t(k);
    return v !== undefined && v !== null && v !== k;
  };
  const DAYS       = () => T('mzDays');
  const MONTHS_GEN = () => T('mzMonthsGen');
  const MONTHS_NOM = () => T('mzMonthsNom');
  const DIGITS     = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  /* ---------- Ημερομηνίες ---------- */
  const pad        = n => String(n).padStart(2, '0');
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays    = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const sameDay    = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const ymd        = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromYmd    = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtShort   = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const fmtLong    = d => `${DAYS()[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN()[d.getMonth()]}`;

  const TODAY = startOfDay(new Date());
  const MAX   = addDays(TODAY, CONFIG.rangeDays);
  const clamp = d => (d < TODAY ? TODAY : d > MAX ? MAX : d);

  // Σάββατο/Κυριακή δεν επιλέγονται
  const isWeekend  = d => d.getDay() === 0 || d.getDay() === 6;
  const selectable = d => d >= TODAY && d <= MAX && !isWeekend(d);

  // η πλησιέστερη επιλέξιμη μέρα προς μια κατεύθυνση (dir = +1 / -1)
  function nearestSelectable(d, dir) {
    for (let x = clamp(d); x >= TODAY && x <= MAX; x = addDays(x, dir)) {
      if (selectable(x)) return x;
    }
    return null;
  }
  const FIRST = nearestSelectable(TODAY, 1);
  const LAST  = nearestSelectable(MAX, -1);

  /* ---------- Αργίες (σταθερές + κινητές από το Ορθόδοξο Πάσχα) ---------- */
  function orthodoxEaster(year) {
    const a = year % 4, b = year % 7, c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31);
    const day = ((d + e + 114) % 31) + 1;
    return addDays(new Date(year, month - 1, day), 13); // Ιουλιανό → Γρηγοριανό (1900–2099)
  }

  const holidayCache = {};
  function holidaysOf(year) {
    if (holidayCache[year]) return holidayCache[year];
    const map = new Map();
    [
      [1, 1, 'Πρωτοχρονιά'], [1, 6, 'Θεοφάνεια'], [3, 25, '25η Μαρτίου'],
      [5, 1, 'Πρωτομαγιά'], [8, 15, 'Δεκαπενταύγουστος'], [10, 28, '28η Οκτωβρίου'],
      [12, 25, 'Χριστούγεννα'], [12, 26, 'Σύναξη της Θεοτόκου']
    ].forEach(([m, d, name]) => map.set(ymd(new Date(year, m - 1, d)), name));

    const easter = orthodoxEaster(year);
    [
      [-48, 'Καθαρά Δευτέρα'], [-2, 'Μεγάλη Παρασκευή'],
      [1, 'Δευτέρα του Πάσχα'], [50, 'Αγίου Πνεύματος']
    ].forEach(([offset, name]) => map.set(ymd(addDays(easter, offset)), name));

    return (holidayCache[year] = map);
  }

  /* ---------- Κανόνας μονά/ζυγά ---------- */
  function evaluate(digit, date) {
    const key = ymd(date);
    const dow = date.getDay();

    if (CONFIG.season && (key < CONFIG.season.from || key > CONFIG.season.to)) {
      return { go: true, why: T('mzWhySeason') };
    }
    if (CONFIG.weekendsFree && (dow === 0 || dow === 6)) {
      return { go: true, why: T('mzWhyWeekend') };
    }
    const holiday = CONFIG.holidaysFree && holidaysOf(date.getFullYear()).get(key);
    if (holiday) {
      return { go: true, why: T('mzWhyHoliday').replace('{h}', (T('mzHolidays')[holiday] || holiday)) };
    }

    const digitOdd = digit % 2 === 1;
    const dayOdd   = date.getDate() % 2 === 1;
    return { go: digitOdd === dayOdd, why: '' };
  }

  /* ---------- State ---------- */
  const state = {
    digit: null,
    date:  FIRST,
    view:  monthStart(FIRST),
    focus: FIRST
  };

  const $ = sel => document.querySelector(sel);

  const digitSelect = $('#digitSelect');
  const digitBtn    = $('#digitBtn');
  const digitList   = $('#digitList');
  const digitValue  = $('#digitValue');

  const datePick  = $('#datePick');
  const dateBtn   = $('#dateBtn');
  const dateValue = $('#dateValue');
  const cal       = $('#cal');
  const calTitle  = $('#calTitle');
  const calPrev   = $('#calPrev');
  const calNext   = $('#calNext');
  const calGrid   = $('#calGrid');

  const dayText      = $('#dayText');
  const plate        = $('#plate');
  const plateMain    = $('#plateMain');
  const plateDigit   = $('#plateDigit');
  const verdict      = $('#mzVerdict');
  const verdictTitle = $('#mzVerdictTitle');
  const verdictWhy   = $('#mzVerdictWhy');

  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* =========================================================
     Dropdown ψηφίων
     ========================================================= */
  let activeIndex = 0;

  digitList.innerHTML = DIGITS.map(d => `
    <li class="opt" role="option" id="opt-${d}" data-digit="${d}" aria-selected="false">
      <span class="opt__digit">${d}</span>
    </li>`).join('');

  const options = [...digitList.querySelectorAll('.opt')];

  function setActive(i) {
    activeIndex = Math.max(0, Math.min(DIGITS.length - 1, i));
    options.forEach((o, j) => o.classList.toggle('mz-is-active', j === activeIndex));
    const el = options[activeIndex];
    digitList.setAttribute('aria-activedescendant', el.id);

    // κράτα το ενεργό ψηφίο ορατό μέσα στη λίστα, χωρίς να κουνιέται η σελίδα
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    if (top < digitList.scrollTop + 6) digitList.scrollTop = top - 6;
    else if (bottom > digitList.scrollTop + digitList.clientHeight - 6) {
      digitList.scrollTop = bottom - digitList.clientHeight + 6;
    }
  }

  function openDigits() {
    closeCal(false);
    digitList.hidden = false;
    digitBtn.setAttribute('aria-expanded', 'true');
    setActive(state.digit === null ? 0 : DIGITS.indexOf(state.digit));
    digitList.focus({ preventScroll: true });
  }

  function closeDigits(returnFocus) {
    if (digitList.hidden) return;
    digitList.hidden = true;
    digitBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) digitBtn.focus();
  }

  /* Ένα σημείο για την εμφάνιση του ψηφίου — το χρησιμοποιούν και η επιλογή,
     και το reset, και η αρχικοποίηση από το config. null σημαίνει «—». */
  function showDigit(d) {
    state.digit = d;
    options.forEach(o => o.setAttribute(
      'aria-selected', String(d !== null && Number(o.dataset.digit) === d)
    ));
    digitValue.textContent = (d === null) ? '—' : d;
  }

  function chooseDigit(d) {
    const changed = d !== state.digit;
    showDigit(d);
    closeDigits(true);
    if (changed) render({ flip: true });
  }

  digitBtn.addEventListener('click', () => (digitList.hidden ? openDigits() : closeDigits(true)));

  digitBtn.addEventListener('keydown', e => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); chooseDigit(Number(e.key)); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openDigits(); }
  });

  digitList.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(activeIndex + 1); break;
      case 'ArrowUp':   e.preventDefault(); setActive(activeIndex - 1); break;
      case 'Home':      e.preventDefault(); setActive(0); break;
      case 'End':       e.preventDefault(); setActive(DIGITS.length - 1); break;
      case 'Enter':
      case ' ':         e.preventDefault(); chooseDigit(DIGITS[activeIndex]); break;
      case 'Escape':    e.preventDefault(); closeDigits(true); break;
      case 'Tab':       closeDigits(false); break;
      default:
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); chooseDigit(Number(e.key)); }
    }
  });

  digitList.addEventListener('mousemove', e => {
    const li = e.target.closest('.opt');
    if (li) { const i = options.indexOf(li); if (i !== activeIndex) setActive(i); }
  });

  digitList.addEventListener('click', e => {
    const li = e.target.closest('.opt');
    if (li) chooseDigit(Number(li.dataset.digit));
  });

  /* =========================================================
     Ημερολόγιο (μόνο από σήμερα έως +15 ημέρες)
     ========================================================= */
  function openCal() {
    closeDigits(false);
    state.view  = monthStart(state.date);
    state.focus = state.date;
    cal.hidden = false;
    dateBtn.setAttribute('aria-expanded', 'true');
    renderCal();
    focusDay(state.focus);
  }

  function closeCal(returnFocus) {
    if (cal.hidden) return;
    cal.hidden = true;
    dateBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) dateBtn.focus();
  }

  function focusDay(d) {
    const btn = calGrid.querySelector(`[data-date="${ymd(d)}"]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  function renderCal() {
    const y = state.view.getFullYear();
    const m = state.view.getMonth();

    calTitle.textContent = `${MONTHS_NOM()[m]} ${y}`;
    calPrev.disabled = state.view <= monthStart(TODAY);
    calNext.disabled = state.view >= monthStart(MAX);

    const lead   = (new Date(y, m, 1).getDay() + 6) % 7;  // Δευτέρα πρώτη
    const daysIn = new Date(y, m + 1, 0).getDate();
    let html = '<span aria-hidden="true"></span>'.repeat(lead);

    for (let d = 1; d <= daysIn; d++) {
      const date = new Date(y, m, d);
      const out  = !selectable(date);
      const cls  = ['cal__day'];
      if (sameDay(date, TODAY)) cls.push('is-today');

      html += `<button type="button" class="${cls.join(' ')}" data-date="${ymd(date)}"
        aria-label="${fmtLong(date)}" aria-pressed="${sameDay(date, state.date)}"
        ${sameDay(date, TODAY) ? 'aria-current="date"' : ''}
        tabindex="${sameDay(date, state.focus) ? 0 : -1}" ${out ? 'disabled' : ''}>${d}</button>`;
    }

    calGrid.innerHTML = html;
  }

  function moveMonth(step) {
    state.view = new Date(state.view.getFullYear(), state.view.getMonth() + step, 1);
    // η εστίαση πάει στη μέρα του νέου μήνα που επιτρέπεται
    const inView = d => d.getMonth() === state.view.getMonth() && d.getFullYear() === state.view.getFullYear();
    if (!inView(state.focus)) {
      state.focus = inView(state.date)
        ? state.date
        : (step > 0 ? nearestSelectable(state.view, 1) : nearestSelectable(new Date(state.view.getFullYear(), state.view.getMonth() + 1, 0), -1)) || state.focus;
    }
    renderCal();
  }

  function selectDate(d) {
    state.date = d;
    closeCal(true);
    render({ flip: false });
  }

  dateBtn.addEventListener('click', () => (cal.hidden ? openCal() : closeCal(true)));
  dateBtn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openCal(); }
  });

  /* Μετά την αλλαγή μήνα το πατημένο βελάκι μπορεί να γίνει disabled (π.χ.
     ο Οκτώβριος είναι ο τελευταίος επιτρεπτός μήνας). Ένα disabled κουμπί
     χάνει το focus, οπότε ο focusout handler έκλεινε το ημερολόγιο. Εδώ
     μεταφέρουμε το focus στο άλλο βελάκι ώστε να μείνει ανοιχτό. */
  function navMonth(step) {
    moveMonth(step);
    const pressed = step > 0 ? calNext : calPrev;
    const other   = step > 0 ? calPrev : calNext;
    const target  = pressed.disabled ? (other.disabled ? calGrid.querySelector('.cal__day:not([disabled])') : other) : pressed;
    if (target) target.focus({ preventScroll: true });
  }

  calPrev.addEventListener('click', () => navMonth(-1));
  calNext.addEventListener('click', () => navMonth(1));

  calGrid.addEventListener('click', e => {
    const btn = e.target.closest('.cal__day');
    if (btn && !btn.disabled) selectDate(fromYmd(btn.dataset.date));
  });

  calGrid.addEventListener('keydown', e => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in moves) && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();

    let next;
    if (e.key === 'Home')     next = FIRST;
    else if (e.key === 'End') next = LAST;
    else {
      // πηδάει πάνω από Σαββατοκύριακα προς την κατεύθυνση της κίνησης
      const step = moves[e.key], target = addDays(state.focus, step);
      next = nearestSelectable(target, Math.sign(step)) || nearestSelectable(target, -Math.sign(step));
    }
    if (!next) return;

    state.focus = next;
    if (next.getMonth() !== state.view.getMonth() || next.getFullYear() !== state.view.getFullYear()) {
      state.view = monthStart(next);
    }
    renderCal();
    focusDay(next);
  });

  cal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeCal(true); }
  });

  /* ---------- Κλείσιμο με κλικ έξω / Tab έξω ---------- */
  document.addEventListener('pointerdown', e => {
    if (!digitSelect.contains(e.target)) closeDigits(false);
    if (!datePick.contains(e.target))    closeCal(false);
  });

  // setTimeout: το grid ξαναχτίζεται με τα βελάκια, οπότε ελέγχουμε μετά
  datePick.addEventListener('focusout', () => {
    setTimeout(() => { if (!datePick.contains(document.activeElement)) closeCal(false); }, 0);
  });

  /* =========================================================
     Απόδοση
     ========================================================= */
  function render({ flip }) {
    dateValue.textContent = fmtShort(state.date);
    dayText.textContent   = fmtLong(state.date);

    // πινακίδα
    // κάθε κομμάτι ξεχωριστό span (η παύλα στενεύει), με data-text για το ανάγλυφο
    plateMain.innerHTML = CONFIG.plateText.split(/(-)/).filter(Boolean)
      .map(t => `<span class="pc${t === '-' ? ' pc--dash' : ''}" data-text="${t}">${t}</span>`).join('');
    const hasDigit = state.digit !== null;
    plateDigit.textContent = hasDigit ? state.digit : '?';
    plateDigit.dataset.text = plateDigit.textContent;
    plateDigit.classList.toggle('is-empty', !hasDigit);
    plate.setAttribute('aria-label', `${T('mzPlateAria')} ${CONFIG.plateText}${hasDigit ? state.digit : ''}`);
    if (flip) restart(plateDigit, 'flip');

    // αποτέλεσμα
    if (!hasDigit) {
      verdict.className = 'mz-verdict mz-verdict--idle';
      verdictTitle.textContent = T('mzPickDigit');
      verdictWhy.textContent = '';
    } else {
      const r = evaluate(state.digit, state.date);
      verdict.className = `mz-verdict mz-verdict--${r.go ? 'go' : 'stop'}`;
      verdictTitle.textContent = r.go ? T('mzGo') : T('mzStop');
      verdictWhy.textContent = r.why;
      restart(verdict, 'pop');
    }

    if (!cal.hidden) renderCal();
  }

  /* =========================================================
     Pop up (dialog)
     ========================================================= */
  const modal    = $('#mzModal');
  const closeBtn = $('#closeBtn');
  let lastPopoverEsc = 0;

  // το Escape μέσα σε dropdown/ημερολόγιο κλείνει μόνο αυτά, όχι το pop up
  [digitList, cal].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Escape') lastPopoverEsc = Date.now();
  }));

  function openModal() {
    if (modal.open) return;
    modal.classList.remove('is-closing');
    modal.showModal();
  }

  function closeModal() {
    if (!modal.open || modal.classList.contains('is-closing')) return;
    closeDigits(false);
    closeCal(false);

    modal.classList.add('is-closing');
    const done = () => {
      clearTimeout(fallback);
      modal.classList.remove('is-closing');
      modal.close();
    };
    const fallback = setTimeout(done, 400);
    modal.addEventListener('animationend', function onEnd(e) {
      if (e.target !== modal) return;
      modal.removeEventListener('animationend', onEnd);
      done();
    });
  }

  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('cancel', e => {
    e.preventDefault();
    if (Date.now() - lastPopoverEsc < 80) return;
    closeModal();
  });

  // κλικ στο σκούρο φόντο γύρω από την κάρτα
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  /* Αλλαγή γλώσσας: ενημερώνει τα στατικά κείμενα του dialog και ξαναχτίζει
     ό,τι εξαρτάται από τη γλώσσα (ημέρες, μήνες, ετυμηγορία). */
  function applyLang() {
    // Γράφουμε ΜΟΝΟ όταν υπάρχει μετάφραση· αλλιώς μένει το κείμενο του HTML.
    const set  = (sel, k) => { if (!has(k)) return; const e = $(sel); if (e) e.textContent = t(k); };
    const attr = (sel, a, k) => { if (!has(k)) return; const e = $(sel); if (e) e.setAttribute(a, t(k)); };

    set('#mzTitle', 'mzTitle');
    set('#mzSubtitleEl', 'mzSubtitle');
    set('#digitLabel', 'mzDigitLabel');
    set('#dateLabel', 'mzDateLabel');

    attr('#calPrev', 'aria-label', 'mzPrevMonth');
    attr('#calNext', 'aria-label', 'mzNextMonth');
    attr('#closeBtn', 'aria-label', 'closeLabel');
    attr('#plate', 'aria-label', 'mzPlateAria');

    // επικεφαλίδες ημερών στο ημερολόγιο
    if (has('mzWeek')) {
      const week = t('mzWeek');
      if (Array.isArray(week)) {
        document.querySelectorAll('.cal__week span')
          .forEach((c, i) => { if (week[i]) c.textContent = week[i]; });
      }
    }

    // κουμπί που ανοίγει το pop-up
    const btn = document.getElementById('plateBtn');
    if (btn && has('mzBtn'))      btn.title = t('mzBtn');
    if (btn && has('mzBtnLabel')) btn.setAttribute('aria-label', t('mzBtnLabel'));

    renderCal();              // μήνας/ημέρες στη νέα γλώσσα
    render({ flip: false });  // κίτρινη ημέρα + ετυμηγορία
  }

  /* Επαναφορά στην αρχική κατάσταση: ψηφίο του config (ή κανένα, αν δεν έχει
     οριστεί) και σημερινή ημερομηνία.
     Καλείται από το reset της εφαρμογής, ώστε να μη μένει παλιό αποτέλεσμα. */
  function resetAll() {
    state.date  = FIRST;
    state.view  = monthStart(FIRST);
    state.focus = FIRST;

    showDigit(CONFIG.defaultDigit);
    closeDigits(false);
    if (!cal.hidden) closeCal(false);

    renderCal();
    render({ flip: false });
  }

  // για το project: open / close / applyLang / reset
  window.MonaZyga = { open: openModal, close: closeModal, applyLang, reset: resetAll };

  /* Το κουμπί της μπάρας. Δένεται ΕΔΩ και όχι στο app.js, ώστε να δουλεύει
     ακόμα κι αν αποτύχει να φορτώσει ο χάρτης. */
  const plateBtn = document.getElementById('plateBtn');
  if (plateBtn) {
    plateBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  }

  showDigit(CONFIG.defaultDigit);   // πριν το πρώτο render, ώστε να βγει κατευθείαν η ετυμηγορία
  render({ flip: false });
  applyLang();
})();
