<?php
/* Ο server τρέχει σε UTC. Χωρίς αυτό, το data/log.txt γράφει ώρα 3 ώρες
   πίσω (ή 2 τον χειμώνα) και οι ειδοποιήσεις δείχνουν λάθος ώρα. */
date_default_timezone_set('Europe/Athens');

session_start();
$DaktyliosVersion = 'v.2.1.0';

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    exit('Missing config.php. Copy config.example.php to config.php and add your Google Maps API key.');
}

$config = require $configFile;
$googleMapsApiKey = $config['google_maps_api_key'] ?? '';
$googleMapsMapId  = $config['google_maps_map_id'] ?? '';   // προαιρετικό — για advanced markers
$sitePassword     = (string)($config['site_password'] ?? '');

/* Προαιρετικό: προεπιλεγμένο τελευταίο ψηφίο πινακίδας για την κάρτα μονά/ζυγά.
   Δεκτό μόνο ΕΝΑ ψηφίο 0-9. Οτιδήποτε άλλο (κενό, γράμμα, '12', true) γίνεται
   null — η κάρτα ξεκινά με «—», χωρίς μήνυμα λάθους. Σκόπιμα σιωπηλό: το
   config δεν είναι φόρμα χρήστη, και ένα λάθος εδώ δεν πρέπει να σπάει σελίδα. */
$plateRaw   = (isset($config['plate_last_digit'])
               && (is_string($config['plate_last_digit']) || is_int($config['plate_last_digit'])))
            ? trim((string)$config['plate_last_digit'])
            : '';   // το true θα γινόταν '1' με σκέτο (string) — γι' αυτό ρητοί τύποι
$plateDigit = preg_match('/^[0-9]$/', $plateRaw) ? (int)$plateRaw : null;

if ($googleMapsApiKey === '' || $googleMapsApiKey === 'PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    http_response_code(500);
    exit('Google Maps API key is not configured in config.php.');
}

/* ═══ ΚΛΕΙΔΩΜΑ ΣΕΛΙΔΑΣ ══════════════════════════════════════════════════
   Ζητάει κωδικό σε ΚΑΘΕ φόρτωση. Το session flag είναι μιας χρήσης:
   καταναλώνεται μόλις εμφανιστεί η σελίδα, οπότε ένα F5 ξαναζητάει κωδικό.
   Η σελίδα τερματίζει πριν σταλεί το API key — δεν διαρρέει στο κλειδωμένο HTML.
   ══════════════════════════════════════════════════════════════════════ */

function daktylios_client_ip(): string {
    $keys = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];

    // 1η προτεραιότητα: IPv4 — αυτό περιμένουμε πάντα.
    foreach ($keys as $key) {
        if (empty($_SERVER[$key])) continue;
        foreach (explode(',', $_SERVER[$key]) as $candidate) {
            $ip = trim($candidate);
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return $ip;
        }
    }

    // Εφεδρικά: οτιδήποτε έγκυρο, ώστε να μη χαθεί η καταγραφή σε σπάνια IPv6 επίσκεψη.
    foreach ($keys as $key) {
        if (empty($_SERVER[$key])) continue;
        $ip = trim(explode(',', $_SERVER[$key])[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
    }

    return 'unknown';
}

/* Πάνω από αυτό το μέγεθος το log κάνει rotate. Χωρίς όριο, κάποιος που
   σφυροκοπά τη σελίδα γεμίζει τον δίσκο και μετά η καταγραφή σταματά σιωπηλά. */
const DAKTYLIOS_LOG_MAX = 2097152;   // 2 MB

function daktylios_log(string $status): void {
    $dir  = __DIR__ . '/data';
    $file = $dir . '/log.txt';

    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        error_log('daktylios: αδυναμία δημιουργίας του φακέλου data/');
        return;
    }

    // Rotate πριν γράψουμε, ώστε το log.txt να μη μεγαλώνει ανεξέλεγκτα.
    if (is_file($file) && filesize($file) >= DAKTYLIOS_LOG_MAX) {
        if (!@rename($file, $dir . '/log.old.txt')) {
            error_log('daktylios: αποτυχία rotate του log.txt');
        }
    }

    $line = sprintf("%s, %s, %s\n", $status, date('Y-m-d H:i:s'), daktylios_client_ip());

    // Χωρίς @: αν δεν γράφεται το log θέλουμε να το μάθουμε, όχι να το χάσουμε.
    $written = file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
    if ($written === false) {
        error_log('daktylios: ΑΠΟΤΥΧΙΑ ΚΑΤΑΓΡΑΦΗΣ στο data/log.txt — ' . trim($line));
    }
}

$gateEnabled = ($sitePassword !== '');

/* ═══ ΚΛΕΙΔΩΜΑ ΜΕΤΑ ΑΠΟ ΑΠΟΤΥΧΗΜΕΝΕΣ ΠΡΟΣΠΑΘΕΙΕΣ ══════════════════════
   Ο μετρητής είναι ΚΑΘΟΛΙΚΟΣ, όχι ανά IP ή ανά browser. Γι' αυτό δεν
   παρακάμπτεται: δεν έχει νόημα να αλλάξει κάποιος IP ή να ανοίξει νέο
   tab, αφού το όριο μετράει συνολικά. Με το που συμπληρωθεί, δημιουργείται
   το data/deny.txt και η σελίδα κλειδώνει για όλους μέχρι να το σβήσεις
   χειροκίνητα από τον server.
   ══════════════════════════════════════════════════════════════════════ */
const DAKTYLIOS_MAX_TRIES = 4;

function daktylios_deny_file(): string  { return __DIR__ . '/data/deny.txt'; }
function daktylios_tries_file(): string { return __DIR__ . '/data/attempts.txt'; }

function daktylios_is_denied(): bool {
    return is_file(daktylios_deny_file());
}

function daktylios_tries(): int {
    $f = daktylios_tries_file();
    return is_file($f) ? (int)trim((string)@file_get_contents($f)) : 0;
}

function daktylios_reset_tries(): void {
    @unlink(daktylios_tries_file());
}

/** Καταγράφει αποτυχία. Επιστρέφει true αν μόλις κλείδωσε η σελίδα.
 *
 *  ΠΡΟΣΟΧΗ: το κλείδωμα κρατιέται από το ΔΙΑΒΑΣΜΑ μέχρι την ΕΓΓΡΑΦΗ.
 *  Με file_put_contents(LOCK_EX) το κλείδωμα ισχύει μόνο κατά την εγγραφή,
 *  οπότε δεκάδες ταυτόχρονα requests διάβαζαν την ίδια τιμή και ο μετρητής
 *  προχωρούσε ελάχιστα — ένα παράλληλο script έπαιρνε πολλαπλάσιες δοκιμές.
 */
function daktylios_register_fail(): bool {
    $file = daktylios_tries_file();

    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        error_log('daktylios: αδυναμία ανοίγματος attempts.txt');
        return false;
    }

    // Αποκλειστικό κλείδωμα για ΟΛΗ τη διαδικασία read-modify-write.
    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        error_log('daktylios: αδυναμία flock στο attempts.txt');
        return false;
    }

    $n = (int)trim((string)stream_get_contents($fh)) + 1;

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, (string)$n);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    if ($n >= DAKTYLIOS_MAX_TRIES) {
        if (file_put_contents(daktylios_deny_file(), date('Y-m-d H:i:s') . "\n", LOCK_EX) === false) {
            error_log('daktylios: ΑΔΥΝΑΜΙΑ δημιουργίας deny.txt');
        }
        return true;
    }
    return false;
}

/* Αν λείπει το deny.txt, καθάρισε και τον μετρητή: αλλιώς μετά το
   χειροκίνητο ξεκλείδωμα η πρώτη λάθος προσπάθεια θα ξανακλείδωνε αμέσως. */
if ($gateEnabled && !daktylios_is_denied() && daktylios_tries() >= DAKTYLIOS_MAX_TRIES) {
    daktylios_reset_tries();
}

// AJAX έλεγχος κωδικού
if ($gateEnabled && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pw'])) {
    header('Content-Type: application/json; charset=utf-8');

    // Κλειδωμένη: καμία δοκιμή, καμία καταγραφή.
    if (daktylios_is_denied()) {
        echo json_encode(['ok' => false, 'denied' => true]); exit;
    }

    sleep(1);   // ΠΡΙΝ από κάθε έλεγχο, ώστε να μη γλιτώνει ούτε ο κενός κωδικός

    $given = (string)$_POST['pw'];
    if ($given === '') { echo json_encode(['ok' => false]); exit; }

    if (hash_equals($sitePassword, $given)) {
        daktylios_reset_tries();              // καθαρό ξεκίνημα
        $_SESSION['daktylios_pass'] = true;   // μιας χρήσης
        daktylios_log('pass');
        echo json_encode(['ok' => true]); exit;
    }

    daktylios_log('fail');
    $justLocked = daktylios_register_fail();
    echo json_encode(['ok' => false, 'denied' => $justLocked]); exit;
}

$unlocked = !$gateEnabled;
if ($gateEnabled && !empty($_SESSION['daktylios_pass'])) {
    unset($_SESSION['daktylios_pass']);       // καταναλώνεται -> το F5 ξαναζητάει
    $unlocked = true;
}

/* ── Αλλαγή γλώσσας χωρίς νέο κωδικό ───────────────────────────────────
   Κάθε ξεκλειδωμένη σελίδα παράγει ένα token ΜΙΑΣ ΧΡΗΣΗΣ. Μόνο ένα reload
   που το κουβαλάει σωστά παρακάμπτει το κλείδωμα, και το token καίγεται
   αμέσως. Έτσι:
     · F5                          -> ζητάει κωδικό (το token έχει καεί)
     · νέο tab με το σκέτο link    -> ζητάει κωδικό
     · χειροκίνητο ?lang=en        -> ζητάει κωδικό (δεν έχει έγκυρο token)
   ──────────────────────────────────────────────────────────────────── */
$langSwitch = false;
if ($gateEnabled && !$unlocked
    && isset($_GET['lang'], $_GET['t'])
    && !empty($_SESSION['daktylios_langtok'])
    && hash_equals($_SESSION['daktylios_langtok'], (string)$_GET['t'])) {

    unset($_SESSION['daktylios_langtok']);    // μιας χρήσης
    $unlocked   = true;
    $langSwitch = true;
}

/* Γλώσσα για το Google Maps: παράμετρος -> cookie -> Accept-Language.
   Έτσι ακόμα και ο πρώτος ξένος επισκέπτης παίρνει αγγλικό χάρτη. */
$lang = '';
if (isset($_GET['lang']) && in_array($_GET['lang'], ['el', 'en'], true)
    && ($langSwitch || !$gateEnabled)) {     // με token, ή σε ανοιχτή σελίδα
    $lang = $_GET['lang'];
}
if ($lang === '') { $lang = $_COOKIE['daktylios_lang'] ?? ''; }
if ($lang !== 'el' && $lang !== 'en') {
    $accept = strtolower($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '');
    $lang = (strpos($accept, 'el') === 0 || strpos($accept, ',el') !== false) ? 'el' : 'en';
}

/* Νέο token για την επόμενη αλλαγή γλώσσας. */
$langToken = '';
if ($unlocked && $gateEnabled) {
    $langToken = bin2hex(random_bytes(16));
    $_SESSION['daktylios_langtok'] = $langToken;
}

/* Το query string των assets ΔΕΝ είναι υποχρεωτικά ίδιο με την έκδοση που
   δείχνει το footer. Το v.2.1.0 έχει ήδη σερβιριστεί live, οπότε μια διόρθωση
   σε css/ ή js/ χωρίς αλλαγή εδώ θα σέρβιρε cached αρχεία στα κινητά.
   Κρατάμε το v.2.1.0 ως δημόσια έκδοση και ανεβάζουμε ΜΟΝΟ το build.
   Κανόνας: κάθε αλλαγή σε css/ ή js/ → +1 στο build (ή νέο $DaktyliosVersion
   και build επιστροφή στο 1). */
$DaktyliosBuild = 3;

$v = rawurlencode($DaktyliosVersion . '-b' . $DaktyliosBuild);

/* ── ΟΛΙΚΟ ΚΛΕΙΔΩΜΑ: τερματίζουμε πριν από οτιδήποτε άλλο ──────────
   Ούτε φόρμα κωδικού, ούτε χάρτης, ούτε API key, ούτε καταγραφή. */
if ($gateEnabled && daktylios_is_denied()):
?>
<!doctype html>
<html lang="<?= $lang ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#14161A">
<title>Δακτύλιος Αθηνών</title>
<link rel="icon" href="images/favicon.ico?v=<?= $v ?>" sizes="any">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="css/style.css?v=<?= $v ?>">
</head>
<body class="locked denied">
  <div class="lock-bg" style="background-image:url('images/backdrop.jpg?v=<?= $v ?>')" aria-hidden="true"></div>
  <div class="lock-veil" aria-hidden="true"></div>

  <main class="lock-stage">
    <img class="deny-icon" src="images/deny.png?v=<?= $v ?>" alt="Access denied" role="alert">
  </main>
</body>
</html>
<?php
exit;
endif;

/* ── Κλειδωμένη σελίδα: σταματάμε ΕΔΩ, πριν φύγει οτιδήποτε του χάρτη ── */
if (!$unlocked):
?>
<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#14161A">
<title>Δακτύλιος Αθηνών</title>
<link rel="icon" href="images/favicon.ico?v=<?= $v ?>" sizes="any">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="css/style.css?v=<?= $v ?>">
</head>
<body class="locked">

  <div class="lock-bg" style="background-image:url('images/backdrop.jpg?v=<?= $v ?>')" aria-hidden="true"></div>
  <div class="lock-veil" aria-hidden="true"></div>

  <main class="lock-stage">
    <form id="gate" class="gate" autocomplete="off" novalidate>
      <img class="gate-lock" src="images/password.png?v=<?= $v ?>" alt="" aria-hidden="true">
      <input id="pwView" class="gate-input" type="text"
             inputmode="text" autocomplete="off" spellcheck="false"
             aria-label="Κωδικός πρόσβασης" maxlength="30">
    </form>
  </main>

<script>
(function () {
  const form = document.getElementById('gate');
  const view = document.getElementById('pwView');
  const MAX  = 30;
  let real = '', busy = false;

  const paint = () => { view.value = '✱'.repeat(real.length); };
  const focus = () => { view.focus({ preventScroll: true });
                        view.setSelectionRange(view.value.length, view.value.length); };

  // Μασκάρισμα: κρατάμε τον πραγματικό κωδικό, δείχνουμε αστερίσκους.
  view.addEventListener('beforeinput', (e) => {
    e.preventDefault();
    if (busy) return;
    if (e.inputType === 'deleteContentBackward') { real = real.slice(0, -1); paint(); return; }
    if (e.inputType === 'deleteContentForward')  { real = ''; paint(); return; }
    if (e.data) { for (const ch of e.data) { if (real.length < MAX) real += ch; } paint(); }
  });

  view.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  function reject() {
    form.classList.remove('shake');
    void form.offsetWidth;              // restart animation
    form.classList.add('shake');
    real = ''; paint(); focus();
  }

  async function submit() {
    if (busy || real.length === 0) { focus(); return; }   // κενό -> δεν κάνει τίποτα
    busy = true;
    try {
      const body = new URLSearchParams({ pw: real });
      const res  = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const data = await res.json();
      if (data.ok) {
        document.body.classList.add('unlocking');
        setTimeout(() => window.location.reload(), 620);
        return;
      }
      if (data.denied) {
        // Το κουτί φεύγει πρώτα, μετά φορτώνει η οθόνη DENY.
        document.body.classList.add('denying');
        setTimeout(() => window.location.reload(), 520);
        return;
      }
    } catch (_) { /* σφάλμα δικτύου -> το χειριζόμαστε σαν αποτυχία */ }
    busy = false;
    reject();
  }

  paint(); focus();
  window.addEventListener('pageshow', focus);
})();
</script>
</body>
</html>
<?php
exit;
endif;
?>
<!doctype html>
<html lang="<?= $lang ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#14161A">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Δακτύλιος Αθηνών</title>

<link rel="icon" href="images/favicon.ico?v=<?= $v ?>" sizes="any">
<link rel="apple-touch-icon" href="images/redcar.png?v=<?= $v ?>">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="css/style.css?v=<?= $v ?>">
<link rel="stylesheet" href="css/monazyga.css?v=<?= $v ?>">
<link rel="preload" href="fonts/manrope-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/gr-plate.woff2" as="font" type="font/woff2" crossorigin>
</head>

<body<?= $gateEnabled ? '' : ' class="no-badge"' ?>>
<div class="app">

  <!-- ═══ Ο χάρτης γεμίζει την οθόνη· τα υπόλοιπα επιπλέουν πάνω του ═══ -->
  <div class="stage">
    <div id="map" role="application" aria-label="Χάρτης Μικρού Δακτυλίου Αθηνών"></div>

    <?php if ($gateEnabled): /* το σήμα βγαίνει μόνο όταν υπάρχει όντως κωδικός */ ?>
    <img class="private-badge" src="images/private.png?v=<?= $v ?>" alt="Ιδιωτική σελίδα"
         title="Ιδιωτική σελίδα" onerror="this.style.display='none'">
    <?php endif; ?>

    <div class="searchbar">
      <div class="pill">
        <img class="pill-icon" src="images/map.png?v=<?= $v ?>" alt="" aria-hidden="true"
             onerror="this.style.display='none'">

        <!-- Το κουμπί «Η τοποθεσία μου» αφαιρέθηκε. Ο εντοπισμός σε κινητό
             δίνει σωστή πόλη αλλά όχι αξιόπιστη διεύθυνση, και μια λάθος
             ετυμηγορία ΜΕΣΑ/ΕΚΤΟΣ είναι χειρότερη από καθόλου ετυμηγορία.
             Μαζί έφυγε και το images/location.png. -->

        <div id="autocompleteMount" class="pill-field"></div>
      </div>

      <button id="resetBtn" class="icon-btn" type="button"
              title="Καθαρισμός και προβολή όλου του Δακτυλίου" aria-label="Καθαρισμός">
        <img class="btn-img" src="images/reset.png?v=<?= $v ?>" alt="" aria-hidden="true"
             onerror="this.hidden=true; this.nextElementSibling.hidden=false;">
        <svg class="btn-svg" viewBox="0 0 24 24" hidden aria-hidden="true"><path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.09A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>
      </button>

      <button id="plateBtn" class="icon-btn" type="button"
              title="Κυκλοφορώ στον δακτύλιο;" aria-label="Έλεγχος πινακίδας">
        <img class="btn-img" src="images/check.png?v=<?= $v ?>" alt="" aria-hidden="true">
      </button>
    </div>
  </div>

  <!-- ═══ Rail σε desktop / bottom sheet σε κινητό ═══ -->
  <aside class="rail" id="rail" data-state="collapsed">
    <button class="grabber" id="grabber" type="button" aria-expanded="false" aria-controls="railScroll">
      <span class="grabber-bar" aria-hidden="true"></span>
      <span class="sr-only">Άνοιγμα λεπτομερειών</span>
    </button>

    <div class="brand">
      <img class="brand-logo" src="images/daktylios.png?v=<?= $v ?>" alt="" aria-hidden="true"
           onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'brand-fallback',textContent:'Δ'}))">
      <span class="brand-text">
        <b>Δακτύλιος Αθηνών</b>
      </span>

      <span class="lang-switch">
        <button type="button" class="lang-btn" data-lang="el" aria-pressed="true">
          <img src="images/greek.png?v=<?= $v ?>" alt="Ελληνικά">
        </button>
        <button type="button" class="lang-btn" data-lang="en" aria-pressed="false">
          <img src="images/english.png?v=<?= $v ?>" alt="English">
        </button>
      </span>
    </div>

    <div class="rail-scroll" id="railScroll">

      <!-- κατάσταση: αρχική / φόρτωση / σφάλμα -->
      <p class="lede" id="lede">Φόρτωση ορίων…</p>

      <!-- κατάσταση: αποτέλεσμα -->
      <section class="verdict" id="verdict" hidden aria-live="polite">
        <div class="verdict-head">
          <span class="dot" aria-hidden="true"></span>
          <h1 id="verdictTitle">—</h1>
        </div>
        <p class="verdict-addr" id="verdictAddr">—</p>

        <p class="metric" id="metric" hidden>
          <span class="metric-num" id="metricNum">—</span>
          <span class="metric-where" id="metricWhere">—</span>

          <a class="dir-btn" id="dirBtn" href="#" target="_blank" rel="noopener">
            <img src="images/directions.png?v=<?= $v ?>" alt="">
          </a>
        </p>

        <div class="parking" id="parking" hidden>
          <div class="parking-head">
            <h2>Parking εκτός Δακτυλίου</h2>
          </div>
          <ul class="parking-list" id="parkingList"></ul>
        </div>
      </section>


      <footer class="credits">
        Idea, design, coded &amp; vibe coded by great_vc
        &nbsp;·&nbsp;&nbsp; 🏷️ &nbsp;&nbsp;
        <span class="tag"><?= htmlspecialchars($DaktyliosVersion, ENT_QUOTES, 'UTF-8') ?></span>
      </footer>
    </div>
  </aside>

</div>

<script>
  window.DAKTYLIOS_VERSION = <?= json_encode($DaktyliosVersion, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
  window.DAKTYLIOS_MAP_ID  = <?= json_encode($googleMapsMapId, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
  window.DAKTYLIOS_LANGTOK = <?= json_encode($langToken, JSON_UNESCAPED_SLASHES) ?>;
  /* null όταν δεν έχει οριστεί έγκυρο ψηφίο στο config.php — η κάρτα μονά/ζυγά
     τότε ξεκινά κενή, όπως πριν. */
  window.DAKTYLIOS_PLATE_DIGIT = <?= json_encode($plateDigit) ?>;
</script>
<script src="js/i18n.js?v=<?= $v ?>"></script>
<script src="js/app.js?v=<?= $v ?>"></script>
<script async defer
  src="https://maps.googleapis.com/maps/api/js?key=<?= htmlspecialchars($googleMapsApiKey, ENT_QUOTES, 'UTF-8') ?>&callback=initMap&loading=async&libraries=places,marker&language=<?= $lang ?>&region=GR&v=weekly"></script>
<dialog class="mz-modal" id="mzModal" aria-labelledby="mzTitle">
    <section class="mz-card" tabindex="-1" autofocus>

      <button type="button" class="card__close" id="closeBtn" aria-label="Κλείσιμο">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
      </button>

      <header class="card__head">
        <h1 id="mzTitle">Κυκλοφορώ στον δακτύλιο;</h1>
        <p class="card__sub" id="mzSubtitleEl">Διάλεξε το τελευταίο ψηφίο της πινακίδας και την ημέρα.</p>
      </header>

      <div class="controls">

        <!-- Τελευταίο ψηφίο -->
        <div class="field">
          <span class="field__label" id="digitLabel">Τελευταίο ψηφίο</span>
          <div class="select" id="digitSelect">
            <button type="button" class="control" id="digitBtn"
                    aria-haspopup="listbox" aria-expanded="false"
                    aria-labelledby="digitLabel digitValue">
              <span class="control__digit" id="digitValue">–</span>
              <svg class="control__chev" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <ul class="select__list" id="digitList" role="listbox" tabindex="-1"
                aria-labelledby="digitLabel" hidden></ul>
          </div>
        </div>

        <!-- Ημερομηνία -->
        <div class="field">
          <span class="field__label" id="dateLabel">Ημερομηνία</span>
          <div class="datepick" id="datePick">
            <button type="button" class="control" id="dateBtn"
                    aria-haspopup="dialog" aria-expanded="false"
                    aria-labelledby="dateLabel dateValue">
              <span class="control__date" id="dateValue"></span>
              <svg class="control__cal" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <rect x="7" y="13" width="3.2" height="3.2" rx=".8" fill="currentColor"/>
              </svg>
            </button>

            <div class="cal" id="cal" role="dialog" aria-modal="false" aria-labelledby="calTitle" tabindex="-1" hidden>
              <div class="cal__head">
                <button type="button" class="cal__nav" id="calPrev" aria-label="Προηγούμενος μήνας">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <span class="cal__title" id="calTitle"></span>
                <button type="button" class="cal__nav" id="calNext" aria-label="Επόμενος μήνας">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
              <div class="cal__week" aria-hidden="true">
                <span>Δε</span><span>Τρ</span><span>Τε</span><span>Πε</span><span>Πα</span><span class="is-wknd">Σα</span><span class="is-wknd">Κυ</span>
              </div>
              <div class="cal__grid" id="calGrid"></div>
            </div>
          </div>
        </div>

      </div>

      <p class="daytext" id="dayText" aria-live="polite"></p>

      <figure class="plate" id="plate">
        <img class="plate__img" src="images/plate.png?v=<?= $v ?>" alt="" width="2000" height="432">
        <div class="plate__text">
          <span class="plate__line"><span class="plate__main" id="plateMain"></span><span class="plate__digit is-empty" id="plateDigit">?</span></span>
        </div>
      </figure>

      <div class="mz-verdict mz-verdict--idle" id="mzVerdict" aria-live="polite">
        <span class="verdict__badge" aria-hidden="true">
          <img class="verdict__img verdict__img--go"   src="images/entry.webp?v=<?= $v ?>"   alt="" width="288" height="288">
          <img class="verdict__img verdict__img--stop" src="images/noentry.webp?v=<?= $v ?>" alt="" width="288" height="288">
          <span class="verdict__q">?</span>
        </span>
        <div class="verdict__text">
          <strong class="verdict__title" id="mzVerdictTitle"></strong>
          <span class="verdict__why" id="mzVerdictWhy"></span>
        </div>
      </div>

    </section>
  </dialog>


<script src="js/monazyga.js?v=<?= $v ?>" defer></script>

</body>
</html>
