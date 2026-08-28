# 📝 Ιστορικό Εκδόσεων

Όλες οι αξιοσημείωτες αλλαγές του project καταγράφονται εδώ.
Ακολουθεί τη λογική του [Semantic Versioning](https://semver.org/lang/el/).

---

## [v1.0.1] — 28 Αυγούστου 2026

### 🎨 Διορθώσεις εμφάνισης
- Το input της αναζήτησης πλέον αφήνει κάθετο κενό μέσα στο pill, ώστε να φαίνεται το περίγραμμα και να μην ακουμπάει στις γωνίες

---

## [v1.0.0] — 27 Αυγούστου 2026 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 🟢 Release

🎉 **Πρώτη επίσημη δημόσια έκδοση.** Πλήρως λειτουργικό, δοκιμασμένο, στο τελευταίο Google Maps API.

### ✨ Λειτουργίες
- Έλεγχος διεύθυνσης: **ΜΕΣΑ / ΕΚΤΟΣ / ΠΑΝΩ ΣΤΟ ΟΡΙΟ** του Μικρού Δακτυλίου
- Απόσταση από το όριο με **ακρίβεια χιλιοστού** (κλειστού τύπου προβολή + haversine)
- Autocomplete διευθύνσεων (Google Places New API)
- Drop pin με click οπουδήποτε στον χάρτη + reverse geocoding
- Parking **εκτός** Δακτυλίου, ταξινομημένα κατά απόσταση
- Link σε κάθε parking για **Google Maps directions** έτοιμο για πλοήγηση
- Street View
- Πλήρως responsive για κινητά (iPhone / iPad / Android) με bottom sheet

### 🔧 Τεχνικά
- Μετάβαση σε **AdvancedMarkerElement** (τέλος στα deprecation warnings), με αυτόματο fallback σε κλασικά markers όταν δεν υπάρχει Map ID
- Όλα τα γεωμετρικά τοπικά στον browser — **καμία** κλήση στη βιβλιοθήκη geometry της Google μέσα σε βρόχο
- Προαιρετικό `map_id` μέσω `config.php`
- `.gitignore` που κρατάει `config.php` και `.htaccess` εκτός repo
- MIT License

