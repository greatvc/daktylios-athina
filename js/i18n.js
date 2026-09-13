/* ═══════════════════════════════════════════════════════════════════
   Μεταφράσεις — Δακτύλιος Αθηνών

   Η γλώσσα επιλέγεται ως εξής:
     1. cookie  daktylios_lang   (η τελευταία επιλογή του χρήστη)
     2. navigator.language        (η γλώσσα του browser)
     3. ελληνικά                  (προεπιλογή)

   Το ίδιο cookie διαβάζει και το index.php, για να φορτώσει το Google
   Maps στη σωστή γλώσσα. Η αλλαγή γλώσσας ΔΕΝ κάνει επαναφόρτωση —
   αλλιώς θα ξαναζητούσε κωδικό. Ο χάρτης έρχεται στη νέα γλώσσα την
   επόμενη φορά που θα ανοίξει η σελίδα.
   ═══════════════════════════════════════════════════════════════════ */

const I18N = {

  el: {
    locale:  'el-GR',
    htmlLang:'el',
    unitM:   'μ.',
    unitKm:  'χλμ.',

    /* ── κεφαλίδα ── */
    pageTitle:    'Δακτύλιος Αθηνών',
    brandTitle:   'Δακτύλιος Αθηνών',
    privateBadge: 'Ιδιωτική σελίδα',
    sheetToggle:  'Άνοιγμα λεπτομερειών',

    /* ── αναζήτηση ── */
    searchPlaceholder: 'Γράψε διεύθυνση για έλεγχο στον δακτύλιο…',
    resetTitle:        'Καθαρισμός και προβολή όλου του Δακτυλίου',
    resetLabel:        'Καθαρισμός',

    /* ── γλώσσα ── */
    switchToEl: 'Πάτα εδώ για Ελληνικά',
    switchToEn: 'Click here for English',

    /* ── μηνύματα ── */
    intro:        'Γράψε μια διεύθυνση ή πάτα οπουδήποτε στον χάρτη για να δεις αν είναι μέσα ή έξω από τον Δακτύλιο.',
    ringLoadFail: 'Δεν φόρτωσαν τα όρια:',
    badGeoJson:   'Το GeoJSON δεν περιέχει έγκυρο polygon.',
    noCoords:     'Δεν βρέθηκαν συντεταγμένες για αυτή τη διεύθυνση.',
    searchFailed: 'Η αναζήτηση απέτυχε. Δοκίμασε ξανά ή πάτα στον χάρτη.',

    /* ── ετυμηγορία ── */
    inside:       'ΜΕΣΑ ΣΤΟΝ ΔΑΚΤΥΛΙΟ',
    outside:      'ΕΚΤΟΣ ΔΑΚΤΥΛΙΟΥ',
    edge:         'ΠΑΝΩ ΣΤΟ ΟΡΙΟ',
    offArea:      'ΕΚΤΟΣ ΚΕΝΤΡΟΥ',
    whereEdge:    'πάνω στη γραμμή του ορίου',
    whereInside:  'μέσα από το όριο',
    whereOutside: 'έξω από το όριο',

    pickedAddress: 'Επιλεγμένη διεύθυνση',
    pickedPoint:   'Επιλεγμένο σημείο στον χάρτη',

    /* ── parking ── */
    parkingTitle: 'Parking εκτός Δακτυλίου',
    fromPoint:    'από το σημείο',
    driveHere:    'Οδηγίες με αυτοκίνητο προς το parking',
    walkLabel:    'Οδηγίες με τα πόδια',
    transitLabel: 'Οδηγίες με ΜΜΜ',
    closeLabel:   'Κλείσιμο',
    directions:   'Οδηγίες',
    directionsTip:'Οδηγίες με αυτοκίνητο προς αυτή τη διεύθυνση',

    /* ── Μονά / Ζυγά ── */
    mzBtn:        'Κυκλοφορώ στον δακτύλιο;',
    mzBtnLabel:   'Έλεγχος πινακίδας',
    mzTitle:      'Πότε κυκλοφορώ;',
    mzSubtitle:   'Διάλεξε το τελευταίο ψηφίο της πινακίδας και την ημέρα.',
    mzDigitLabel: 'Τελευταίο ψηφίο',
    mzDateLabel:  'Ημερομηνία',
    mzPrevMonth:  'Προηγούμενος μήνας',
    mzNextMonth:  'Επόμενος μήνας',
    mzPickDigit:  'Διάλεξε ψηφίο',
    mzGo:         'ΚΥΚΛΟΦΟΡΕΙΣ',
    mzStop:       'ΔΕΝ ΚΥΚΛΟΦΟΡΕΙΣ',
    mzWhySeason:  'Ο δακτύλιος δεν ισχύει αυτή την περίοδο.',
    mzWhyWeekend: 'Σαββατοκύριακο: ο δακτύλιος δεν ισχύει.',
    mzWhyHoliday: 'Αργία ({h}): ο δακτύλιος δεν ισχύει.',
    mzPlateAria:  'Πινακίδα',
    mzDays:       ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'],
    mzWeek:       ['Δε','Τρ','Τε','Πε','Πα','Σα','Κυ'],
    mzMonthsGen:  ['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου',
                   'Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'],
    mzMonthsNom:  ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
                   'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'],
    mzHolidays:   { 'Πρωτοχρονιά':'Πρωτοχρονιά', 'Θεοφάνεια':'Θεοφάνεια',
                    '25η Μαρτίου':'25η Μαρτίου', 'Πρωτομαγιά':'Πρωτομαγιά',
                    'Δεκαπενταύγουστος':'Δεκαπενταύγουστος', '28η Οκτωβρίου':'28η Οκτωβρίου',
                    'Χριστούγεννα':'Χριστούγεννα', 'Σύναξη της Θεοτόκου':'Σύναξη της Θεοτόκου',
                    'Καθαρά Δευτέρα':'Καθαρά Δευτέρα', 'Μεγάλη Παρασκευή':'Μεγάλη Παρασκευή',
                    'Δευτέρα του Πάσχα':'Δευτέρα του Πάσχα', 'Αγίου Πνεύματος':'Αγίου Πνεύματος' }
  },

  en: {
    locale:  'en-GB',
    htmlLang:'en',
    unitM:   'm',
    unitKm:  'km',

    pageTitle:    'Athens Ring',
    brandTitle:   'Athens Ring',
    privateBadge: 'Private page',
    sheetToggle:  'Open details',

    searchPlaceholder: 'Type an address to check the ring…',
    resetTitle:        'Clear and show the whole ring',
    resetLabel:        'Clear',

    switchToEl: 'Πάτα εδώ για Ελληνικά',
    switchToEn: 'Click here for English',

    intro:        'Type an address or tap anywhere on the map to see if it is inside or outside the ring.',
    ringLoadFail: 'Could not load the ring boundary:',
    badGeoJson:   'The GeoJSON contains no valid polygon.',
    noCoords:     'No coordinates found for this address.',
    searchFailed: 'Search failed. Try again or tap on the map.',

    inside:       'INSIDE THE RING',
    outside:      'OUTSIDE THE RING',
    edge:         'ON THE BOUNDARY',
    offArea:      'OUTSIDE CITY CENTRE',
    whereEdge:    'on the boundary line',
    whereInside:  'inside the boundary',
    whereOutside: 'outside the boundary',

    pickedAddress: 'Selected address',
    pickedPoint:   'Selected point on the map',

    parkingTitle: 'Parking outside the ring',
    fromPoint:    'from the point',
    driveHere:    'Driving directions to this car park',
    walkLabel:    'Walking directions',
    transitLabel: 'Public transport directions',
    closeLabel:   'Close',
    directions:   'Directions',
    directionsTip:'Driving directions to this address',

    /* ── Odd / Even ── */
    mzBtn:        'Can I drive in the ring today?',
    mzBtnLabel:   'Plate check',
    mzTitle:      'When can I drive in the ring?',
    mzSubtitle:   'Pick the last digit of your plate and the day.',
    mzDigitLabel: 'Last digit',
    mzDateLabel:  'Date',
    mzPrevMonth:  'Previous month',
    mzNextMonth:  'Next month',
    mzPickDigit:  'Pick a digit',
    mzGo:         'YOU CAN DRIVE',
    mzStop:       'YOU CANNOT DRIVE',
    mzWhySeason:  'The ring is not in force during this period.',
    mzWhyWeekend: 'Weekend: the ring does not apply.',
    mzWhyHoliday: 'Public holiday ({h}): the ring does not apply.',
    mzPlateAria:  'Licence plate',
    mzDays:       ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    mzWeek:       ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    mzMonthsGen:  ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'],
    mzMonthsNom:  ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'],
    mzHolidays:   { 'Πρωτοχρονιά':'New Year', 'Θεοφάνεια':'Epiphany',
                    '25η Μαρτίου':'25 March', 'Πρωτομαγιά':'Labour Day',
                    'Δεκαπενταύγουστος':'Assumption', '28η Οκτωβρίου':'28 October',
                    'Χριστούγεννα':'Christmas', 'Σύναξη της Θεοτόκου':'Boxing Day',
                    'Καθαρά Δευτέρα':'Clean Monday', 'Μεγάλη Παρασκευή':'Good Friday',
                    'Δευτέρα του Πάσχα':'Easter Monday', 'Αγίου Πνεύματος':'Holy Spirit' }
  }
};

/* ── επιλογή γλώσσας ─────────────────────────────────────────────── */
const LANG_COOKIE = 'daktylios_lang';

function readLangCookie() {
  const m = document.cookie.match(/(?:^|;\s*)daktylios_lang=(el|en)/);
  return m ? m[1] : null;
}

function writeLangCookie(lang) {
  const year = 365 * 24 * 60 * 60;
  document.cookie = `${LANG_COOKIE}=${lang}; max-age=${year}; path=/; SameSite=Lax`;
}

function detectLang() {
  const saved = readLangCookie();
  if (saved) return saved;
  const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  return nav.startsWith('el') ? 'el' : 'en';
}

let LANG = detectLang();

/* Μετάφραση ενός κλειδιού στην τρέχουσα γλώσσα. */
function t(key) {
  return (I18N[LANG] && I18N[LANG][key]) || I18N.el[key] || key;
}
