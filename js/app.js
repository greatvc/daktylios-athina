'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   Δακτύλιος Αθηνών — έλεγχος διεύθυνσης

   Όλα τα γεωμετρικά γίνονται τοπικά με κλειστού τύπου μαθηματικά.
   Καμία κλήση στη βιβλιοθήκη geometry της Google μέσα σε βρόχο.
   ═══════════════════════════════════════════════════════════════════════ */

const APP_VERSION = window.DAKTYLIOS_VERSION || 'v.0.1.3';
const RING_URL    = `data/daktylios.geojson?v=${encodeURIComponent(APP_VERSION)}`;

const RING_COLOR   = '#E76F51';
/* Ζώνη εξυπηρέτησης: μέσα στον Δακτύλιο, ή έως 1 km έξω από το όριό του.
   Μετριέται ως ΑΠΟΣΤΑΣΗ, όχι ως ορθογώνιο — έτσι το περιθώριο είναι ίδιο
   σε όλες τις πλευρές. Ένα κουτί δεν μπορεί να ξεχωρίσει τον Ν. Κόσμο
   (338 m) από την Καλλιθέα (1086 m): διαφέρουν 78 m σε γεωγρ. πλάτος. */
const AREA_LIMIT_M = 1000;

/* Χονδρικό κουτί μόνο για το autocomplete της Google (θέλει ορθογώνιο).
   Ο ακριβής έλεγχος γίνεται πάντα με την απόσταση. */
const SEARCH_BOX = { south: 37.949, north: 38.001, west: 23.688, east: 23.776 };

const EDGE_TOL_M   = 20;    // το polygon ακολουθεί τον άξονα του δρόμου
const GAUGE_IN_M   = 1400;  // πιο εσωτερικό σημείο του Δακτυλίου
const GAUGE_OUT_M  = 1000;

const PARK_RADIUS_M = 2200;  // πιο πλατιά αναζήτηση: με ΜΜΜ αξίζει και πιο μακρινό parking
const PARK_OFFSET_M = 500;  // πόσο έξω από το όριο ψάχνουμε όταν είμαστε μέσα
const PARK_MAX      = 20;
const PARK_CACHE_MAX = 30;

/* Χονδρική εκτίμηση περπατήματος. Η ευθεία απόσταση δεν είναι διαδρομή:
   ο συντελεστής καλύπτει στροφές και διαβάσεις, αλλά ΔΕΝ μπορεί να προβλέψει
   εμπόδια όπως η Συγγρού (εκεί το πραγματικό μπορεί να είναι 3x). Γι' αυτό
   εμφανίζεται πάντα με «~» και δίπλα υπάρχει link για τον ακριβή χρόνο. */
const WALK_DETOUR   = 1.45;   // πραγματική διαδρομή / ευθεία
const WALK_M_PER_MIN = 75;    // ~4,5 km/h με διαβάσεις

const PARK_DIAMETER = 36;   // px στον χάρτη
const MARKER_MAX_W = 46;
const MARKER_MAX_H = 54;

/* ── κατάσταση ────────────────────────────────────────────────────────── */
let map, geocoder, placesLib, autocompleteEl;
let markerLib = null, useAdvancedMarkers = false;
let ringPolygon = null, ringBounds = null;
let segs = null;              // Float64Array [lng1,lat1,lng2,lat2, …]
let polys = [];               // [[outerRing, hole, …], …] για point-in-polygon
let pinMarker = null;
let parkMarkers = [];
let infoWindow = null;
let openInfoKey = null;   // ποιο parking έχει ανοιχτό παράθυρο
let requestSeq = 0;           // φρουρός για out-of-order απαντήσεις
let currentPoint = null;      // το σημείο που ελέγχθηκε — προορισμός στις οδηγίες
let currentAddress = '';
let suppressMapClick = false; // αγνόησε το επόμενο map-click όταν πατιέται control
const parkCache = new Map();
const iconCache = new Map();

const $ = (id) => document.getElementById(id);

/* ═══ ΓΕΩΜΕΤΡΙΑ ═══════════════════════════════════════════════════════════
   Τοπική επίπεδη προβολή γύρω από το σημείο ερωτήματος. Σε τμήματα λίγων
   εκατοντάδων μέτρων η απόκλιση από τη σφαιρική λύση είναι < 1 εκατοστό,
   με 545 πράξεις αντί για ~45.000 κλήσεις API.
   ══════════════════════════════════════════════════════════════════════ */
const RAD = Math.PI / 180;
const EARTH_R = 6371008.8;
const M_PER_DEG_LAT = EARTH_R * RAD;
const mPerDegLng = (lat) => Math.cos(lat * RAD) * M_PER_DEG_LAT;

function buildRing(geojson) {
  polys = [];
  const flat = [];

  const takePolygon = (rings) => {
    const kept = [];
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) continue;
      kept.push(ring);
      for (let i = 0; i < ring.length - 1; i++) {
        flat.push(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
      }
    }
    if (kept.length) polys.push(kept);
  };

  for (const feature of geojson.features || []) {
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') takePolygon(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(takePolygon);
  }

  segs = new Float64Array(flat);
  return polys.length > 0 && segs.length > 0;
}

/** Πλησιέστερο σημείο του ορίου + απόσταση σε μέτρα. */
/** Ακριβής σφαιρική απόσταση — μία κλήση, όχι μέσα σε βρόχο. */
function haversine(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * RAD, φ2 = lat2 * RAD;
  const dφ = (lat2 - lat1) * RAD, dλ = (lng2 - lng1) * RAD;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nearestOnRing(lat, lng) {
  const kx = mPerDegLng(lat);
  const ky = M_PER_DEG_LAT;
  let best = Infinity, bestX = 0, bestY = 0;

  for (let i = 0; i < segs.length; i += 4) {
    const ax = (segs[i]     - lng) * kx, ay = (segs[i + 1] - lat) * ky;
    const bx = (segs[i + 2] - lng) * kx, by = (segs[i + 3] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;

    const px = ax + t * dx, py = ay + t * dy;
    const d2 = px * px + py * py;
    if (d2 < best) { best = d2; bestX = px; bestY = py; }
  }

  // Ο βρόχος εντοπίζει το σημείο· η τελική απόσταση μετριέται σφαιρικά,
  // ώστε να μην κουβαλάμε το σφάλμα της επίπεδης προβολής σε μεγάλες αποστάσεις.
  const nearLat = lat + bestY / ky;
  const nearLng = lng + bestX / kx;

  return {
    distance: haversine(lat, lng, nearLat, nearLng),
    lat: nearLat,
    lng: nearLng
  };
}

function inRing(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isInside(lat, lng) {
  for (const rings of polys) {
    if (!inRing(rings[0], lng, lat)) continue;
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (inRing(rings[h], lng, lat)) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

function inServiceArea(lat, lng) {
  if (isInside(lat, lng)) return true;                       // μέσα στον Δακτύλιο
  return nearestOnRing(lat, lng).distance <= AREA_LIMIT_M;   // ή κοντά στο όριο
}

function metresBetween(a, b) {
  return haversine(a.lat, a.lng, b.lat, b.lng);
}

/** Σημείο `extra` μέτρα πιο έξω από το όριο, στην ίδια κατεύθυνση. */
function pointBeyondBoundary(from, boundary, extra) {
  const kx = mPerDegLng(boundary.lat);
  let vx = (boundary.lng - from.lng) * kx;
  let vy = (boundary.lat - from.lat) * M_PER_DEG_LAT;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return boundary;
  vx /= len; vy /= len;
  return {
    lat: boundary.lat + (vy * extra) / M_PER_DEG_LAT,
    lng: boundary.lng + (vx * extra) / kx
  };
}

/* ═══ ΕΚΚΙΝΗΣΗ ════════════════════════════════════════════════════════ */
window.initMap = async function () {
  try {
    const mapId = window.DAKTYLIOS_MAP_ID || undefined;

    const mapOptions = {
      center: { lat: 37.9838, lng: 23.7275 },
      zoom: 13,
      mapTypeId: 'roadmap',
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      gestureHandling: 'greedy',
      clickableIcons: false
    };
    if (mapId) mapOptions.mapId = mapId;      // απαραίτητο για advanced markers

    map = new google.maps.Map($('map'), mapOptions);

    // Advanced markers ΜΟΝΟ αν υπάρχει mapId· αλλιώς μένουμε στα κλασικά (ίδια όψη).
    if (mapId) {
      try {
        markerLib = await google.maps.importLibrary('marker');
        useAdvancedMarkers = !!(markerLib && markerLib.AdvancedMarkerElement);
      } catch (_) {
        useAdvancedMarkers = false;
      }
    }

    geocoder = new google.maps.Geocoder();
    infoWindow = new google.maps.InfoWindow();
    infoWindow.addListener('closeclick', () => { openInfoKey = null; });

    const response = await fetch(RING_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`GeoJSON ${response.status}`);
    const geojson = await response.json();

    if (!buildRing(geojson)) throw new Error('Το GeoJSON δεν περιέχει έγκυρο polygon.');

    ringBounds = new google.maps.LatLngBounds();
    const paths = polys.flatMap((rings) =>
      rings.map((ring) => ring.map(([lng, lat]) => {
        const ll = { lat, lng };
        ringBounds.extend(ll);
        return ll;
      }))
    );

    ringPolygon = new google.maps.Polygon({
      map,
      paths,
      strokeColor: RING_COLOR,
      strokeOpacity: 0.96,
      strokeWeight: 5,
      fillOpacity: 0,
      clickable: false,          // αλλιώς τρώει τα clicks μέσα στον Δακτύλιο
      zIndex: 1
    });

    fitWholeRing();
    map.addListener('click', onMapClick);

    // Το Street View σκεπάζει τον χάρτη με δικά του controls· κρύβουμε τη μπάρα.
    const pano = map.getStreetView();
    pano.addListener('visible_changed', () => {
      document.querySelector('.app').classList.toggle('streetview', pano.getVisible());
    });

    await setupAutocomplete();
    setupChrome();

    $('lede').textContent = 'Γράψε μια διεύθυνση ή πάτα οπουδήποτε στον χάρτη για να δεις αν είναι μέσα ή έξω από τον Δακτύλιο.';
  } catch (error) {
    console.error(error);
    const lede = $('lede');
    lede.textContent = `Δεν φόρτωσαν τα όρια: ${error.message}`;
    lede.classList.add('error');
  }
};

/* ═══ ΑΝΑΖΗΤΗΣΗ ═══════════════════════════════════════════════════════ */
async function setupAutocomplete() {
  placesLib = placesLib || await google.maps.importLibrary('places');
  const { PlaceAutocompleteElement } = placesLib;

  autocompleteEl = new PlaceAutocompleteElement({
    includedRegionCodes: ['gr'],
    // Περιοχή αναζήτησης. Προσοχή: το locationRestriction φιλτράρει με
    // ΕΠΙΚΑΛΥΨΗ, οπότε ένας ολόκληρος δήμος (π.χ. Ίλιον) μπορεί να περάσει
    // επειδή η έκτασή του ακουμπά το κουτί.
    locationRestriction: {
      north: SEARCH_BOX.north, south: SEARCH_BOX.south,
      east:  SEARCH_BOX.east,  west:  SEARCH_BOX.west
    }
    // ΔΕΝ βάζουμε includedPrimaryTypes: το establishment δεν συνδυάζεται με
    // τους τύπους διευθύνσεων, και χρειαζόμαστε ΚΑΙ POI/εταιρείες.
    // Ό,τι ξεφύγει το πιάνει ο έλεγχος inServiceArea() στην επιλογή.
  });
  autocompleteEl.placeholder = 'Γράψε διεύθυνση για έλεγχο στον δακτύλιο…';
  $('autocompleteMount').replaceChildren(autocompleteEl);

  autocompleteEl.addEventListener('gmp-select', async ({ placePrediction }) => {
    if (!placePrediction) return;
    const seqAtStart = requestSeq;               // αν γίνει reset όσο περιμένουμε, ακυρώνεται
    try {
      const place = placePrediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      if (seqAtStart !== requestSeq) return;      // μεσολάβησε reset ή νέα ενέργεια
      if (!place.location) { setLede('Δεν βρέθηκαν συντεταγμένες για αυτή τη διεύθυνση.', true); return; }

      evaluate(
        { lat: place.location.lat(), lng: place.location.lng() },
        place.formattedAddress || place.displayName || 'Επιλεγμένη διεύθυνση'
      );
    } catch (error) {
      console.warn(error);
      setLede('Η αναζήτηση απέτυχε. Δοκίμασε ξανά ή πάτα στον χάρτη.', true);
    }
  });
}

/** Καθαρίζει το πεδίο χωρίς να ξαναχτίζει το στοιχείο (διαρροή listeners). */
function clearAutocomplete() {
  if (!autocompleteEl) return;
  try { autocompleteEl.value = ''; } catch (_) { /* δεν το εκθέτουν όλες οι εκδόσεις */ }
  const input = autocompleteEl.querySelector('input')
             || autocompleteEl.shadowRoot?.querySelector('input');
  if (input) input.value = '';
}

/* ═══ ΚΕΝΤΡΙΚΗ ΡΟΗ ════════════════════════════════════════════════════
   Το αποτέλεσμα εμφανίζεται αμέσως από τις συντεταγμένες. Το reverse
   geocoding τρέχει μετά και συμπληρώνει μόνο το κείμενο της διεύθυνσης.
   ══════════════════════════════════════════════════════════════════════ */
function onMapClick(event) {
  if (!event.latLng) return;
  if (suppressMapClick) return;                   // μόλις πατήθηκε control πάνω από τον χάρτη
  const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };

  clearAutocomplete();
  const token = evaluate(point, 'Επιλεγμένο σημείο στον χάρτη');

  // Εκτός ζώνης: ούτε reverse geocoding (θα έγραφε διεύθυνση πάνω από το
  // «ΕΚΤΟΣ ΑΤΤΙΚΗΣ») ούτε χρεώσιμη κλήση στο Geocoding API.
  if (!inServiceArea(point.lat, point.lng)) return;

  geocoder.geocode({ location: point })
    .then((res) => {
      if (token !== requestSeq) return;           // ήρθε νεότερο αίτημα
      const address = res.results?.[0]?.formatted_address;
      if (address) {
        currentAddress = address;
        $('verdictAddr').textContent = address;
        if (pinMarker) {
          if (useAdvancedMarkers) pinMarker.title = address;
          else pinMarker.setTitle(address);
        }
      }
    })
    .catch((error) => console.warn('Reverse geocoding failed:', error));
}

function evaluate(point, address) {
  const token = ++requestSeq;
  currentPoint   = point;
  currentAddress = address;

  // Εκτός λεκανοπεδίου: κανένα pin, καμία απόσταση, κανένα parking.
  if (!inServiceArea(point.lat, point.lng)) {
    clearPin();
    clearParking();
    const verdict = $('verdict');
    verdict.hidden = false;
    verdict.dataset.state = 'offarea';
    $('verdictTitle').textContent = 'ΕΚΤΟΣ ΑΤΤΙΚΗΣ';
    $('verdictAddr').textContent = '';
    $('metric').hidden  = true;
    $('parking').hidden = true;
    setLede('', false);
    openSheet();
    return token;
  }

  const nearest = nearestOnRing(point.lat, point.lng);
  const inside = isInside(point.lat, point.lng);
  const state = nearest.distance <= EDGE_TOL_M ? 'edge' : (inside ? 'inside' : 'outside');
  renderVerdict(state, address, nearest.distance, inside);
  dropPin(point, state, address, token);
  frameResult(point, nearest);
  loadParking(point, state, nearest, token);

  return token;
}

function renderVerdict(state, address, distance, inside) {
  const verdict = $('verdict');
  verdict.hidden = false;
  verdict.dataset.state = state;

  $('verdictTitle').textContent = {
    inside:  'ΜΕΣΑ ΣΤΟΝ ΔΑΚΤΥΛΙΟ',
    outside: 'ΕΚΤΟΣ ΔΑΚΤΥΛΙΟΥ',
    edge:    'ΠΑΝΩ ΣΤΟ ΟΡΙΟ'
  }[state];
  $('verdictAddr').textContent = address;

  const metric = $('metric');
  metric.hidden = false;
  let where;
  if (state === 'edge')      where = 'πάνω στη γραμμή του ορίου';
  else if (inside)           where = 'μέσα από το όριο';
  else                       where = 'έξω από το όριο';
  $('metricNum').textContent   = formatDistance(distance);
  $('metricWhere').textContent = where;

  setLede('', false);
  openSheet();
}

/* ═══ MARKERS ═════════════════════════════════════════════════════════ */
/* ═══ MARKERS ═════════════════════════════════════════════════════════
   Ενιαίο στρώμα: αν υπάρχει mapId, χρησιμοποιεί AdvancedMarkerElement·
   αλλιώς πέφτει στο κλασικό google.maps.Marker με πανομοιότυπη όψη.
   ══════════════════════════════════════════════════════════════════════ */
function removeMarker(marker) {
  if (!marker) return;
  if (useAdvancedMarkers) marker.map = null;
  else marker.setMap(null);
}

function markerPosition(marker) {
  if (!marker) return null;
  if (useAdvancedMarkers) {
    const p = marker.position;
    return { lat: typeof p.lat === 'function' ? p.lat() : p.lat,
             lng: typeof p.lng === 'function' ? p.lng() : p.lng };
  }
  const p = marker.getLatLng ? marker.getLatLng() : marker.getPosition();
  return { lat: p.lat(), lng: p.lng() };
}

function makeImageMarker({ position, title, zIndex, url, w, h, anchorY }) {
  if (useAdvancedMarkers) {
    const img = document.createElement('img');
    img.src = url; img.alt = ''; img.width = w; img.height = h;
    img.style.display = 'block';
    // Το advanced marker αγκυρώνεται στο κάτω-κέντρο του content εξ ορισμού.
    return new markerLib.AdvancedMarkerElement({ map, position, title, zIndex, content: img });
  }
  return new google.maps.Marker({
    map, position, title, zIndex,
    icon: {
      url,
      scaledSize: new google.maps.Size(w, h),
      anchor: new google.maps.Point(w / 2, anchorY != null ? anchorY : h)
    }
  });
}

function makeParkingMarker({ position, title, zIndex }) {
  const D = PARK_DIAMETER;
  if (useAdvancedMarkers) {
    const badge = document.createElement('div');
    badge.className = 'park-marker';
    badge.textContent = 'P';
    badge.style.cssText =
      `width:${D}px;height:${D}px;border-radius:50%;background:#1a73e8;` +
      `border:2.5px solid #fff;color:#fff;font:800 14px Inter,sans-serif;` +
      `display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);` +
      `transform:translateY(50%)`;   // κέντρο πάνω στο σημείο
    return new markerLib.AdvancedMarkerElement({ map, position, title, zIndex, content: badge });
  }
  return new google.maps.Marker({
    map, position, title, zIndex,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#1a73e8', fillOpacity: 0.96,
      strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 2.5,
      scale: D / 2
    },
    label: { text: 'P', color: '#ffffff', fontSize: '14px', fontWeight: '800' }
  });
}

function markerOnClick(marker, handler) {
  if (useAdvancedMarkers) marker.addListener('gmp-click', handler);
  else marker.addListener('click', handler);
}

async function dropPin(point, state, address, token) {
  const icon = await resolveIcon(state);
  if (token !== requestSeq) return;

  clearPin();

  if (icon) {
    const size = fitIcon(icon.width, icon.height);
    pinMarker = makeImageMarker({
      position: point, title: address, zIndex: 1000,
      url: icon.url, w: size.w, h: size.h, anchorY: size.h - 2
    });
  } else if (useAdvancedMarkers) {
    pinMarker = new markerLib.AdvancedMarkerElement({ map, position: point, title: address, zIndex: 1000 });
  } else {
    pinMarker = new google.maps.Marker({ map, position: point, title: address, zIndex: 1000 });
  }
}

async function resolveIcon(state) {
  const byState = { inside: 'images/redcar.png', outside: 'images/greencar.png', edge: 'images/yellowcar.png' };
  for (const url of [byState[state], 'images/car.png']) {
    if (!url) continue;
    if (iconCache.has(url)) {
      const cached = iconCache.get(url);
      if (cached) return cached;
      continue;
    }
    const meta = await loadImage(url);
    iconCache.set(url, meta);
    if (meta) return meta;
  }
  return null;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ url: image.src, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = `${url}?v=${encodeURIComponent(APP_VERSION)}`;
  });
}

function fitIcon(width, height) {
  if (!width || !height) return { w: 42, h: 42 };
  const scale = Math.min(MARKER_MAX_W / width, MARKER_MAX_H / height, 1);
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function clearPin() {
  if (pinMarker) { removeMarker(pinMarker); pinMarker = null; }
}

/* ═══ PARKING ═════════════════════════════════════════════════════════ */
async function loadParking(point, state, nearest, token) {
  clearParking();
  $('parking').hidden = true;

  /* Το parking έχει νόημα ΜΟΝΟ αν ο προορισμός είναι μέσα στον Δακτύλιο:
     τότε αφήνεις το αυτοκίνητο έξω και περπατάς. Αν είναι ήδη έξω — ή πάνω
     στο όριο, όπου τα μέτρα δεν ισχύουν — παρκάρεις κανονικά επί τόπου. */
  if (state !== 'inside') return;

  try {
    placesLib = placesLib || await google.maps.importLibrary('places');
    const { Place, SearchNearbyRankPreference } = placesLib;

    // Ψάχνουμε λίγο ΕΞΩ από το κοντινότερο όριο· αλλιώς τα 20 αποτελέσματα
    // γεμίζουν με parking που είναι κι αυτά μέσα στον Δακτύλιο.
    const center = pointBeyondBoundary(point, nearest, PARK_OFFSET_M);

    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
    let places = parkCache.get(key);

    if (!places) {
      const result = await Place.searchNearby({
        fields: ['displayName', 'location', 'formattedAddress'],
        locationRestriction: { center, radius: PARK_RADIUS_M },
        // Και οι τρεις τύποι parking της Google, όχι μόνο ο γενικός.
        // includedTypes (όχι includedPrimaryTypes): πιάνει και όσα έχουν το
        // parking ως δευτερεύοντα τύπο, π.χ. ξενοδοχείο με γκαράζ.
        includedTypes: ['parking', 'parking_garage', 'parking_lot'],
        maxResultCount: PARK_MAX,
        rankPreference: SearchNearbyRankPreference.DISTANCE,
        language: 'el',
        region: 'GR'
      });
      places = result.places || [];
      if (parkCache.size >= PARK_CACHE_MAX) parkCache.delete(parkCache.keys().next().value);
      parkCache.set(key, places);
    }

    if (token !== requestSeq) return;

    const usable = places
      .filter((place) => place.location)
      .map((place) => ({
        place,
        pos: { lat: place.location.lat(), lng: place.location.lng() }
      }))
      .filter(({ pos }) =>
        !isInside(pos.lat, pos.lng) && nearestOnRing(pos.lat, pos.lng).distance > EDGE_TOL_M)
      .map((item) => ({ ...item, distance: metresBetween(point, item.pos) }))
      .sort((a, b) => a.distance - b.distance);

    usable.forEach((item, index) => addParkingMarker(item, index + 1));
    renderParkingList(usable);
  } catch (error) {
    console.warn('Parking search failed:', error);
  }
}

function addParkingMarker(item, index) {
  const marker = makeParkingMarker({
    position: item.pos,
    title: item.place.displayName || 'Parking',
    zIndex: 500
  });

  markerOnClick(marker, () => openParkingInfo(item, marker));
  item.marker = marker;
  item.index = index;
  parkMarkers.push(marker);
}

/* Οδηγίες ΜΕ ΤΑ ΠΟΔΙΑ: από το parking (αφετηρία) προς το σημείο που έλεγξες.
   Δίνουμε συντεταγμένες, όχι κείμενο, ώστε να μη χαθεί τίποτα στη μετάφραση. */
/* Οδηγίες ΠΡΟΣ το parking με αυτοκίνητο. Χωρίς origin, ώστε το Google Maps
   να βάλει μόνο του την τοποθεσία σου (ή να την αφήσει κενή για να τη γράψεις). */
function mapsDriveToParkingUrl(item) {
  const dest = item.place.formattedAddress
            || item.place.displayName
            || `${item.pos.lat},${item.pos.lng}`;
  return 'https://www.google.com/maps/dir/?api=1'
       + '&destination=' + encodeURIComponent(dest)
       + '&travelmode=driving';
}

function mapsDirectionsUrl(item, mode) {
  const origin = `${item.pos.lat},${item.pos.lng}`;
  const dest   = currentPoint
    ? `${currentPoint.lat},${currentPoint.lng}`
    : (item.place.formattedAddress || item.place.displayName || origin);

  return 'https://www.google.com/maps/dir/?api=1'
       + '&origin='      + encodeURIComponent(origin)
       + '&destination=' + encodeURIComponent(dest)
       + '&travelmode='  + (mode || 'walking');
}

function closeParkingInfo() {
  if (infoWindow) infoWindow.close();
  openInfoKey = null;
}

function openParkingInfo(item, marker) {
  const key = `${item.pos.lat},${item.pos.lng}`;

  // Δεύτερο κλικ στο ίδιο parking κλείνει το παράθυρο.
  if (openInfoKey === key) { closeParkingInfo(); return; }

  const box = document.createElement('div');
  box.className = 'iw';

  // Δικό μας κουμπί κλεισίματος — το προεπιλεγμένο της Google δεν εμφανίζεται
  // αξιόπιστα όταν δίνουμε custom DOM περιεχόμενο.
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'iw-close';
  close.setAttribute('aria-label', 'Κλείσιμο');
  close.title = 'Κλείσιμο';
  close.textContent = '✕';
  close.addEventListener('click', (e) => { e.stopPropagation(); closeParkingInfo(); });
  box.appendChild(close);

  const name = document.createElement('strong');
  name.textContent = item.place.displayName || 'Parking';
  box.appendChild(name);

  if (item.place.formattedAddress) {
    const link = document.createElement('a');
    link.className = 'iw-addr';
    link.href = mapsDriveToParkingUrl(item);
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'Οδηγίες με αυτοκίνητο προς το parking';
    link.textContent = item.place.formattedAddress;
    box.appendChild(link);
  }

  const distance = document.createElement('div');
  distance.className = 'iw-dist';
  distance.textContent = `${formatDistance(item.distance)} από το σημείο`;
  box.appendChild(distance);

  infoWindow.setContent(box);
  infoWindow.open({ map, anchor: marker });
  openInfoKey = key;
}

function makeRouteLink(item, opts) {
  const a = document.createElement('a');
  a.className = 'p-route';
  a.href   = mapsDirectionsUrl(item, opts.mode);
  a.target = '_blank';
  a.rel    = 'noopener';
  a.title  = opts.label;
  a.setAttribute('aria-label', opts.label);

  const icon = document.createElement('img');
  icon.src = `${opts.icon}?v=${encodeURIComponent(APP_VERSION)}`;
  icon.alt = '';
  a.appendChild(icon);

  if (opts.time) {
    const t = document.createElement('span');
    t.className = 'p-route-time';
    t.textContent = opts.time;
    a.appendChild(t);
  }

  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function renderParkingList(items) {
  const list = $('parkingList');
  list.replaceChildren();

  $('parking').hidden = false;

  for (const item of items) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';

    const mark = document.createElement('img');
    mark.className = 'p-mark';
    mark.src = `images/parking.png?v=${encodeURIComponent(APP_VERSION)}`;
    mark.alt = '';

    const body = document.createElement('span');
    body.className = 'p-body';

    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = item.place.displayName || 'Parking';

    const dist = document.createElement('span');
    dist.className = 'p-dist';
    dist.textContent = `${formatDistance(item.distance)} από το σημείο`;

    body.append(name, dist);
    button.append(mark, body);
    button.addEventListener('click', () => {
      map.panTo(item.pos);
      if (map.getZoom() < 16) map.setZoom(16);
      openParkingInfo(item, item.marker);
      if (window.matchMedia('(max-width:899px)').matches) closeSheet();
    });

    // Οδηγίες προς το σημείο — ανοίγουν στο Google Maps με ακριβή χρόνο.
    const walk = makeRouteLink(item, {
      mode:  'walking',
      icon:  'images/walking1.png',
      label: 'Οδηγίες με τα πόδια',
      time:  `~${walkMinutes(item.distance)}′`
    });

    // Με ΜΜΜ δεν εκτιμάμε χρόνο: εξαρτάται από γραμμές, αναμονή και ώρα.
    const transit = makeRouteLink(item, {
      mode:  'transit',
      icon:  'images/bus.png',
      label: 'Οδηγίες με ΜΜΜ',
      time:  ''
    });

    li.append(button, walk, transit);
    list.appendChild(li);
  }
}

function clearParking() {
  parkMarkers.forEach((marker) => removeMarker(marker));
  parkMarkers = [];
  closeParkingInfo();
  $('parkingList').replaceChildren();
}

/* ═══ ΚΑΔΡΑΡΙΣΜΑ ══════════════════════════════════════════════════════
   Σε κινητό το bottom sheet σκεπάζει τον χάρτη, οπότε το padding δεν
   είναι συμμετρικό.
   ══════════════════════════════════════════════════════════════════════ */
function mapPadding() {
  const mobile = window.matchMedia('(max-width:899px)').matches;
  return mobile
    ? { top: 90, right: 30, bottom: Math.round(window.innerHeight * 0.34) + 20, left: 30 }
    : { top: 90, right: 60, bottom: 60, left: 60 };
}

function frameResult(point, nearest) {
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(point);
  bounds.extend({ lat: nearest.lat, lng: nearest.lng });
  map.fitBounds(bounds, mapPadding());

  google.maps.event.addListenerOnce(map, 'idle', () => {
    if (map.getZoom() > 17) map.setZoom(17);
  });
}

function fitWholeRing() {
  if (ringBounds && !ringBounds.isEmpty()) map.fitBounds(ringBounds, mapPadding());
}

/* ═══ CHROME: κουμπιά + bottom sheet ══════════════════════════════════ */
function setupChrome() {
  // Ό,τι click πέσει πάνω στη μπάρα δεν πρέπει να φτάσει στον χάρτη από κάτω.
  const bar = document.querySelector('.searchbar');
  ['click', 'pointerdown', 'mousedown'].forEach((type) =>
    bar.addEventListener(type, (e) => e.stopPropagation()));

  $('resetBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    suppressMapClick = true;
    setTimeout(() => { suppressMapClick = false; }, 350);
    reset();
  });

  const grabber = $('grabber');
  grabber.addEventListener('click', toggleSheet);

  // Σύρσιμο της λαβής σε κινητό.
  let startY = null;
  grabber.addEventListener('pointerdown', (event) => {
    startY = event.clientY;
    grabber.setPointerCapture(event.pointerId);
  });
  grabber.addEventListener('pointerup', (event) => {
    if (startY === null) return;
    const delta = event.clientY - startY;
    startY = null;
    if (delta > 24) closeSheet();
    else if (delta < -24) openSheet();
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width:899px)').matches) $('rail').dataset.state = 'expanded';
  });
  if (!window.matchMedia('(max-width:899px)').matches) $('rail').dataset.state = 'expanded';
}

function setSheet(state) {
  const rail = $('rail');
  rail.dataset.state = state;
  $('grabber').setAttribute('aria-expanded', state === 'expanded' ? 'true' : 'false');
}
const openSheet   = () => setSheet('expanded');
const closeSheet  = () => setSheet('collapsed');
const toggleSheet = () => setSheet($('rail').dataset.state === 'expanded' ? 'collapsed' : 'expanded');

function reset() {
  requestSeq++;                          // ακυρώνει κάθε in-flight απάντηση
  clearPin();
  clearParking();
  clearAutocomplete();
  currentPoint = null;
  currentAddress = '';

  const verdict = $('verdict');
  verdict.hidden = true;
  delete verdict.dataset.state;          // χωρίς χρωματισμό υπολείμματος
  $('parking').hidden = true;
  $('metric').hidden = true;
  setLede('Γράψε μια διεύθυνση ή πάτα οπουδήποτε στον χάρτη για να δεις αν είναι μέσα ή έξω από τον Δακτύλιο.', false);
  fitWholeRing();
  if (window.matchMedia('(max-width:899px)').matches) closeSheet();
}


/* ═══ ΒΟΗΘΗΤΙΚΑ ═══════════════════════════════════════════════════════ */
function setLede(text, isError) {
  const lede = $('lede');
  lede.textContent = text;
  lede.hidden = !text;                       // κενό κείμενο = καθόλου κενός χώρος
  lede.classList.toggle('error', !!isError);
}

function walkMinutes(straightMetres) {
  const mins = (straightMetres * WALK_DETOUR) / WALK_M_PER_MIN;
  return Math.max(1, Math.round(mins));
}

function formatDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)} μ.`;
  return `${(metres / 1000).toLocaleString('el-GR', {
    minimumFractionDigits: 1, maximumFractionDigits: 2
  })} χλμ.`;
}
