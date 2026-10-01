import { services } from './config.js';

const cache = new Map();
const CACHE_LIMIT = 80;

// Cache successful responses only. Requests remain cancellable per journey.
export async function fetchJSON(url, parentSignal, ttl = 600000) {
  if (parentSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.data;
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once:true });
  const timeout = setTimeout(abort, 11000);
  try {
    const response = await fetch(url, { signal:controller.signal, headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.error) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(url, { data, expires:Date.now() + ttl });
    }
    return data;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abort);
  }
}

function wikiURL(language, params) {
  return `https://${language}.wikipedia.org/w/api.php?` + new URLSearchParams({ action:'query', format:'json', origin:'*', ...params });
}

export async function findArticle(lat, lon, signal) {
  let successfulSearch = false;
  for (const language of ['ru', 'en']) {
    try {
      const search = await fetchJSON(wikiURL(language, { list:'geosearch', gscoord:`${lat}|${lon}`, gsradius:'10000', gslimit:'1', gsnamespace:'0' }), signal, 3600000);
      if (search.error || !Array.isArray(search.query?.geosearch)) throw new Error('Invalid Wikipedia response');
      successfulSearch = true;
      const nearest = search.query.geosearch[0];
      if (!nearest) continue;
      const detail = await fetchJSON(wikiURL(language, { pageids:String(nearest.pageid), prop:'extracts|pageimages|info', exintro:'1', explaintext:'1', exsentences:'4', piprop:'thumbnail|name', pithumbsize:'640', inprop:'url' }), signal, 3600000);
      const article = detail.query?.pages?.[nearest.pageid];
      if (!article?.title) throw new Error('Missing Wikipedia article');
      return { ...article, distance:nearest.dist, language };
    } catch (error) { if (signal.aborted) throw error; }
  }
  if (!successfulSearch) throw new Error('Wikipedia unavailable');
  return null;
}

export async function getWeather(lat, lon, signal) {
  const params = new URLSearchParams({ latitude:lat.toFixed(5), longitude:lon.toFixed(5), current:'temperature_2m,weather_code,is_day', timezone:'auto', forecast_days:'1' });
  const data = await fetchJSON(`${services.weatherURL}?${params}`, signal);
  if (data.error || !data.current) throw new Error('Weather unavailable');
  return data;
}

export async function searchCities(query, signal) {
  const data = await fetchJSON(services.geocodingURL + '?' + new URLSearchParams({ name:query, count:'6', language:'ru', format:'json' }), signal, 3600000);
  if (data.error) throw new Error('Search unavailable');
  return data.results || [];
}

export function weatherDescription(code) {
  if (code === 0) return 'Ясно';
  if ([1,2].includes(code)) return 'Переменная облачность';
  if (code === 3) return 'Пасмурно';
  if ([45,48].includes(code)) return 'Туман';
  if ([51,53,55,56,57].includes(code)) return 'Морось';
  if ([61,63,65,66,67].includes(code)) return 'Дождь';
  if ([71,73,75,77,85,86].includes(code)) return 'Снег';
  if ([80,81,82].includes(code)) return 'Ливень';
  if ([95,96,99].includes(code)) return 'Гроза';
  return 'Данные погодной модели';
}

export function safeURL(value) {
  if (typeof value !== 'string' || !value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
