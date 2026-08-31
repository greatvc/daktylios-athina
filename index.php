<?php
session_start();
$DaktyliosVersion = 'v.1.2.0';

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    exit('Missing config.php. Copy config.example.php to config.php and add your Google Maps API key.');
}

$config = require $configFile;
$googleMapsApiKey = $config['google_maps_api_key'] ?? '';
$googleMapsMapId  = $config['google_maps_map_id'] ?? '';   // προαιρετικό — για advanced markers
$sitePassword     = (string)($config['site_password'] ?? '');

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

// AJAX έλεγχος κωδικού
if ($gateEnabled && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pw'])) {
    header('Content-Type: application/json; charset=utf-8');
    $given = (string)$_POST['pw'];

    if ($given === '') { echo json_encode(['ok' => false]); exit; }

    if (hash_equals($sitePassword, $given)) {
        $_SESSION['daktylios_pass'] = true;   // μιας χρήσης
        daktylios_log('pass');
        echo json_encode(['ok' => true]); exit;
    }
    daktylios_log('fail');
    echo json_encode(['ok' => false]); exit;
}

$unlocked = !$gateEnabled;
if ($gateEnabled && !empty($_SESSION['daktylios_pass'])) {
    unset($_SESSION['daktylios_pass']);       // καταναλώνεται -> το F5 ξαναζητάει
    $unlocked = true;
}

$v = rawurlencode($DaktyliosVersion);

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
<html lang="el">
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
        <div id="autocompleteMount" class="pill-field"></div>
      </div>

      <button id="resetBtn" class="icon-btn" type="button"
              title="Καθαρισμός και προβολή όλου του Δακτυλίου" aria-label="Καθαρισμός">
        <img class="btn-img" src="images/reset.png?v=<?= $v ?>" alt="" aria-hidden="true"
             onerror="this.hidden=true; this.nextElementSibling.hidden=false;">
        <svg class="btn-svg" viewBox="0 0 24 24" hidden aria-hidden="true"><path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.09A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>
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
        </p>

        <div class="parking" id="parking" hidden>
          <div class="parking-head">
            <h2>Parking εκτός Δακτυλίου</h2>
            <span class="count" id="parkingCount">—</span>
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
</script>
<script src="js/app.js?v=<?= $v ?>"></script>
<script async defer
  src="https://maps.googleapis.com/maps/api/js?key=<?= htmlspecialchars($googleMapsApiKey, ENT_QUOTES, 'UTF-8') ?>&callback=initMap&loading=async&libraries=places,marker&language=el&region=GR&v=weekly"></script>
</body>
</html>
