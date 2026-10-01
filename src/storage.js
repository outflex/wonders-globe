export function loadPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function storePreference(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function validCoordinates(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function placeKey(place) { return `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`; }

export function loadPlaces(key, limit = 100) {
  const data = loadPreference(key, []);
  return Array.isArray(data) ? data.filter(p => p && typeof p.title === 'string' && validCoordinates(p.lat, p.lon)).slice(0, limit) : [];
}

export function coordinates(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}   ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}
