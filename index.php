<?php
$DaktyliosVersion = 'v.1.0.1';

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    exit('Missing config.php. Copy config.example.php to config.php and add your Google Maps API key.');
}

$config = require $configFile;
$googleMapsApiKey = $config['google_maps_api_key'] ?? '';
$googleMapsMapId  = $config['google_maps_map_id'] ?? '';   // προαιρετικό — για advanced markers

if ($googleMapsApiKey === '' || $googleMapsApiKey === 'PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    http_response_code(500);
    exit('Google Maps API key is not configured in config.php.');
}

$v = rawurlencode($DaktyliosVersion);
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

<body>
<div class="app">

  <!-- ═══ Ο χάρτης γεμίζει την οθόνη· τα υπόλοιπα επιπλέουν πάνω του ═══ -->
  <div class="stage">
    <div id="map" role="application" aria-label="Χάρτης Μικρού Δακτυλίου Αθηνών"></div>

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
