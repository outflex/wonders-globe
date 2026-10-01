import { createGlobe } from './globe.js';
import { findArticle, getWeather, searchCities, safeURL, weatherDescription } from './api.js';
import { loadPreference, storePreference, loadPlaces, validCoordinates, placeKey, coordinates } from './storage.js';
import { collections, places, dailyPlace, randomPlace } from './data/places.js';
import { sponsor } from './config.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let globe, currentLocation = null, timeFormatter = null;
let activeRequest = null, searchRequest = null, journeyId = 0, toastTimer, clockTimer;
let picking = false, eco = loadPreference('terra-eco', true) !== false;
let savedPlaces = loadPlaces('terra-places');
let visitedPlaces = loadPlaces('terra-visited', 500);
let activeCollection = collections[0];
const milestones = [
  { count:1, title:'Первый горизонт' },
  { count:5, title:'Любопытный путник' },
  { count:15, title:'Коллекционер историй' },
  { count:30, title:'Исследователь Земли' },
];

function toast(message, duration = 4500) {
  clearTimeout(toastTimer);
  $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}
function announce(message) { $('announcement').textContent = message; }
function applyTheme(theme) {
  const light = theme === 'light';
  document.body.dataset.theme = light ? 'light' : 'dark';
  $('themeButton').textContent = light ? '☾ Тёмная' : '☀ Светлая';
  $('themeButton').setAttribute('aria-label', light ? 'Включить тёмную тему' : 'Включить светлую тему');
  document.querySelector('meta[name="theme-color"]').content = light ? '#eaf1f1' : '#080e14';
  globe?.setTheme(light);
}
function updateQuality() {
  globe?.setQuality(eco);
  $('qualityButton').setAttribute('aria-pressed', String(eco));
  $('qualityButton').title = eco ? 'Экономичный режим. Нажмите для высокого качества' : 'Высокое качество. Нажмите для экономичного режима';
  $('qualityButton').setAttribute('aria-label', $('qualityButton').title);
  $('renderStatus').textContent = eco ? '♧ Экономичный режим' : '◈ Высокое качество';
}
function setPicking(value) {
  picking = value;
  $('pickButton').setAttribute('aria-pressed', String(value));
  $('pickButton').textContent = value ? '× Отменить выбор' : '⌖ Точка на карте';
  globe?.setPicking(value);
}
function syncClock() {
  clearInterval(clockTimer); clockTimer = null;
  if (!document.hidden && !$('info').hidden) {
    updateTime(); clockTimer = setInterval(updateTime, 30000);
  }
}
function closeInfo() { $('info').hidden = true; document.body.classList.remove('has-info'); syncClock(); }
function setBusy(value) {
  $('exploreLabel').textContent = value ? 'Выбираем новый горизонт…' : 'Открыть случайное место';
  $('exploreButton').setAttribute('aria-busy', String(value));
}
function openDialog(id) { globe?.setRotating(false); $(id).showModal(); }
function updateSaveButton() {
  const saved = currentLocation && savedPlaces.some(p => placeKey(p) === placeKey(currentLocation));
  $('saveButton').textContent = saved ? '♥ Сохранено' : '♡ Сохранить';
  $('saveButton').setAttribute('aria-pressed', String(Boolean(saved)));
}
function renderSaved() {
  $('savedList').replaceChildren();
  if (!savedPlaces.length) {
    const message = document.createElement('p');
    message.textContent = 'Пока здесь пусто. Откройте место и нажмите «Сохранить».';
    $('savedList').append(message);
  }
  savedPlaces.forEach(place => {
    const row = document.createElement('div'); row.className = 'saved-row';
    const open = document.createElement('button'); open.className = 'result'; open.textContent = place.title;
    const note = document.createElement('small'); note.textContent = coordinates(place.lat,place.lon); open.append(note);
    open.addEventListener('click', () => { $('savedDialog').close(); travel(place.lat,place.lon,place); });
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Удалить ${place.title}`);
    remove.addEventListener('click', () => {
      const next = savedPlaces.filter(p => placeKey(p) !== placeKey(place));
      if (!storePreference('terra-places', next)) { toast('Не удалось сохранить изменения в браузере.'); return; }
      savedPlaces = next; renderSaved(); updateSaveButton(); renderPassport();
    });
    row.append(open,remove); $('savedList').append(row);
  });
}

function renderPassport() {
  const count = visitedPlaces.length;
  $('passportCount').textContent = count;
  $('visitedCount').textContent = count;
  $('savedCount').textContent = savedPlaces.length;
  const next = milestones.find(m => count < m.count);
  $('passportGoal').textContent = next ? `До отметки «${next.title}» — ещё ${next.count - count} открытий.` : 'Ваш атлас уже полон историй. Следующий горизонт ждёт!';
  $('passportProgress').max = next?.count || 30;
  $('passportProgress').value = Math.min(count, next?.count || 30);
  $('passportBadges').replaceChildren();
  milestones.forEach(m => {
    const badge = document.createElement('span');
    badge.className = 'badge' + (count >= m.count ? ' unlocked' : '');
    badge.textContent = `${count >= m.count ? '✦' : '◇'} ${m.title} · ${m.count}`;
    $('passportBadges').append(badge);
  });
}
function recordVisit() {
  if (visitedPlaces.some(p => placeKey(p) === placeKey(currentLocation))) return;
  const next = [{ ...currentLocation, title:$('placeTitle').textContent }, ...visitedPlaces].slice(0,500);
  if (!storePreference('terra-visited', next)) return;
  visitedPlaces = next; renderPassport();
  const milestone = milestones.find(m => m.count === visitedPlaces.length);
  if (milestone) toast(`✦ ${milestone.title}! Открытий: ${visitedPlaces.length}.`);
}
function renderCollections() {
  $('collectionTabs').replaceChildren(); $('collectionList').replaceChildren();
  collections.forEach(collection => {
    const button = document.createElement('button'); button.className = 'chip'; button.textContent = collection.title;
    button.setAttribute('aria-pressed', String(collection.id === activeCollection.id));
    button.addEventListener('click', () => { activeCollection = collection; renderCollections(); });
    $('collectionTabs').append(button);
  });
  activeCollection.places.forEach((place, index) => {
    const button = document.createElement('button'); button.className = 'collection-card';
    const number = document.createElement('span'); number.className = 'collection-number'; number.textContent = `0${index + 1}`;
    const text = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = place.title;
    const note = document.createElement('small'); note.textContent = place.note;
    text.append(title,note); button.append(number,text);
    button.addEventListener('click', () => { $('collectionsDialog').close(); travel(place.lat,place.lon,place); });
    $('collectionList').append(button);
  });
}
function exploreNext() {
  const place = randomPlace(currentLocation?.id);
  travel(place.lat,place.lon,place);
}

function updateTime() {
  if (!currentLocation || document.hidden || $('info').hidden) return;
  const now = new Date();
  const text = timeFormatter ? timeFormatter.format(now) : '≈ ' + new Date(now.getTime() + currentLocation.lon * 240000).toISOString().slice(11,16);
  if ($('localTime').textContent !== text) $('localTime').textContent = text;
}
function renderArticle(result, curated) {
  $('photoWrap').hidden = true; $('wikiLink').hidden = true;
  $('placePhoto').onload = null; $('placePhoto').onerror = null; $('placePhoto').removeAttribute('src');
  $('curatedNote').hidden = !curated?.note;
  $('curatedNote').textContent = curated?.note || '';
  const article = result.status === 'fulfilled' ? result.value : null;
  $('placeTitle').textContent = curated?.title || article?.title || 'Неизведанная Земля';
  currentLocation.title = $('placeTitle').textContent;
  if (!article) {
    $('placeTag').textContent = curated ? 'Выбор Terra' : 'За пределами путеводителей';
    $('placeDistance').textContent = coordinates(currentLocation.lat,currentLocation.lon);
    $('placeDescription').textContent = result.status === 'rejected'
      ? 'Википедия сейчас недоступна. Можно исследовать карту, сохранить точку или открыть следующее место.'
      : 'В радиусе 10 км не нашлось географических статей Википедии. Перед вами может быть открытый океан или удалённый уголок суши.';
    return;
  }
  $('placeTag').textContent = article.language === 'ru' ? 'Место рядом · Википедия' : 'Место рядом · Wikipedia / EN';
  $('placeDistance').textContent = `${article.title} · ${(article.distance / 1000).toLocaleString('ru-RU', { maximumFractionDigits:1 })} км от точки`;
  $('placeDescription').textContent = article.extract?.trim() || 'Краткое описание недоступно. Откройте Википедию, чтобы узнать больше.';
  const pageURL = safeURL(article.fullurl);
  if (pageURL) { $('wikiLink').href = pageURL; $('wikiLink').hidden = false; }
  const photoURL = safeURL(article.thumbnail?.source);
  if (photoURL && article.pageimage) {
    const id = journeyId;
    $('placePhoto').alt = article.title;
    $('placePhoto').onload = () => { if (id === journeyId) $('photoWrap').hidden = false; };
    $('placePhoto').onerror = () => { if (id === journeyId) $('photoWrap').hidden = true; };
    $('photoCredit').href = `https://${article.language}.wikipedia.org/wiki/File:${encodeURIComponent(article.pageimage)}`;
    $('placePhoto').src = photoURL;
  }
}
function renderWeather(result) {
  timeFormatter = null;
  $('timezoneNote').textContent = 'Солнечное время · приблизительно';
  if (result.status === 'fulfilled') {
    const data = result.value;
    if (typeof data.timezone === 'string') {
      try {
        timeFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone:data.timezone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
        $('timezoneNote').textContent = data.timezone.replaceAll('_',' ');
      } catch { /* Fall back to labelled solar time. */ }
    }
    const temperature = data.current.temperature_2m;
    $('weatherValue').textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°C` : '—';
    $('weatherNote').textContent = Number.isFinite(temperature) ? weatherDescription(data.current.weather_code) : 'Нет данных для этой точки';
    $('infoFooter').textContent = 'Погода по модели Open-Meteo · для выбранной точки';
  } else {
    $('weatherValue').textContent = '—'; $('weatherNote').textContent = 'Сервис временно недоступен';
    $('infoFooter').textContent = 'Погода недоступна · время рассчитано по долготе';
  }
}

async function travel(lat, lon, curated = null) {
  if (!globe || !validCoordinates(lat,lon) || document.hidden) return;
  setPicking(false); $('searchResults').hidden = true; $('shareField').hidden = true;
  const id = ++journeyId;
  activeRequest?.abort(); activeRequest = new AbortController();
  const signal = activeRequest.signal;
  closeInfo(); setBusy(true); timeFormatter = null;
  currentLocation = { lat, lon, ...(curated ? { id:curated.id, title:curated.title, note:curated.note } : {}) };
  announce('Перелёт к новой точке. Получаем информацию.');
  const data = Promise.allSettled([findArticle(lat,lon,signal), getWeather(lat,lon,signal)]);
  const landed = await globe.flyTo(lat,lon);
  if (id !== journeyId) return;
  if (!landed) { activeRequest.abort(); setBusy(false); toast('Перелёт остановлен. Выберите новое место.'); return; }
  toast('Вы на месте. Собираем историю этой точки…', 25000);
  const [article, weather] = await data;
  if (id !== journeyId) return;
  clearTimeout(toastTimer); $('toast').hidden = true;
  renderArticle(article,curated); renderWeather(weather); updateSaveButton();
  $('info').hidden = false; document.body.classList.add('has-info'); syncClock();
  setBusy(false); recordVisit();
  announce(`Вы на месте. ${$('placeTitle').textContent}. Информация доступна в панели.`);
}

function openSharedLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has('lat') || !params.has('lon')) return;
  const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
  if (params.get('lat').trim() && params.get('lon').trim() && validCoordinates(lat,lon)) {
    const curated = Object.values(places).find(p => Math.abs(p.lat - lat) < .00001 && Math.abs(p.lon - lon) < .00001);
    travel(lat,lon,curated);
  } else toast('В ссылке указаны некорректные координаты.');
}

function initializeSponsor() {
  const url = safeURL(sponsor.url);
  if (!sponsor.enabled || !url) return;
  $('sponsorLink').href = url; $('sponsorTitle').textContent = sponsor.title;
  $('sponsorDescription').textContent = sponsor.description; $('sponsor').hidden = false;
}

$('themeButton').addEventListener('click', () => {
  const theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme); storePreference('terra-theme',theme);
});
$('qualityButton').addEventListener('click', () => {
  eco = !eco; updateQuality(); storePreference('terra-eco',eco);
  toast(eco ? 'Экономичный режим: меньше разрешение и нагрузка на GPU.' : 'Высокое качество включено. Глобус по-прежнему отдыхает, когда вы не взаимодействуете с ним.');
});
$('bordersButton').addEventListener('click', () => $('bordersButton').setAttribute('aria-pressed',String(globe.toggleBorders())));
$('lightButton').addEventListener('click', () => $('lightButton').setAttribute('aria-pressed',String(globe.toggleLighting())));
$('rotateButton').addEventListener('click', () => { globe.cancelFlight(); globe.setRotating(!globe.rotating); });
$('zoomIn').addEventListener('click', () => globe.zoom(1));
$('zoomOut').addEventListener('click', () => globe.zoom(-1));
$('homeButton').addEventListener('click', () => {
  ++journeyId; activeRequest?.abort(); closeInfo(); setBusy(false); setPicking(false);
  clearTimeout(toastTimer); $('toast').hidden = true; globe.home();
});
$('pickButton').addEventListener('click', () => {
  setPicking(!picking); globe.setRotating(false);
  if (picking) { closeInfo(); toast('Нажмите на любое место на глобусе. Для отмены — Escape.',7000); }
});
$('coordinateButton').addEventListener('click', () => openDialog('coordinateDialog'));
$('coordinateForm').addEventListener('submit', event => {
  event.preventDefault(); const lat = $('latitudeInput').valueAsNumber, lon = $('longitudeInput').valueAsNumber;
  if (!validCoordinates(lat,lon)) return;
  $('coordinateDialog').close(); travel(lat,lon);
});
$('savedButton').addEventListener('click', () => { renderSaved(); openDialog('savedDialog'); });
$('passportButton').addEventListener('click', () => { renderPassport(); openDialog('passportDialog'); });
$('collectionsButton').addEventListener('click', () => { renderCollections(); openDialog('collectionsDialog'); });
$('aboutButton').addEventListener('click', () => openDialog('aboutDialog'));
$('dailyButton').addEventListener('click', () => { const place = dailyPlace(); travel(place.lat,place.lon,place); });
$('exploreButton').addEventListener('click', exploreNext);
$('nextButton').addEventListener('click', exploreNext);
document.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => {
  const place = places[button.dataset.place]; travel(place.lat,place.lon,place);
}));
$('saveButton').addEventListener('click', () => {
  if (!currentLocation) return;
  if (savedPlaces.some(p => placeKey(p) === placeKey(currentLocation))) { toast('Это место уже в вашем атласе.'); return; }
  if (savedPlaces.length >= 100) { toast('В атласе уже 100 мест. Удалите одно, чтобы добавить новое.'); return; }
  const next = [{ ...currentLocation, title:$('placeTitle').textContent }, ...savedPlaces];
  if (!storePreference('terra-places',next)) { toast('Хранилище браузера недоступно. Место не сохранено.'); return; }
  savedPlaces = next; updateSaveButton(); renderPassport(); toast('Место сохранено в личном атласе.');
});
$('shareButton').addEventListener('click', async () => {
  if (!currentLocation) return;
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ lat:currentLocation.lat.toFixed(5), lon:currentLocation.lon.toFixed(5) }).toString();
  try { await navigator.clipboard.writeText(url.href); toast('Ссылка на точку скопирована.'); }
  catch { $('shareField').value = url.href; $('shareField').hidden = false; $('shareField').focus(); $('shareField').select(); toast('Скопируйте выделенную ссылку.'); }
});
$('searchInput').addEventListener('input', () => { searchRequest?.abort(); $('searchResults').hidden = true; $('searchButton').textContent = '↗'; });
$('searchForm').addEventListener('submit', async event => {
  event.preventDefault(); const query = $('searchInput').value.trim(); if (query.length < 2) return;
  searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
  $('searchButton').textContent = '…'; $('searchResults').hidden = true;
  try {
    const results = (await searchCities(query,controller.signal)).filter(p => validCoordinates(p.latitude,p.longitude));
    if (controller.signal.aborted) return;
    $('searchResults').replaceChildren();
    if (!results.length) {
      const message = document.createElement('p'); message.className = 'result'; message.textContent = 'Ничего не найдено. Попробуйте другое название.';
      $('searchResults').append(message);
    }
    results.forEach(place => {
      const button = document.createElement('button'); button.className = 'result'; button.textContent = place.name;
      const note = document.createElement('small'); note.textContent = [place.admin1,place.country].filter(Boolean).join(' · '); button.append(note);
      button.addEventListener('click', () => travel(place.latitude,place.longitude)); $('searchResults').append(button);
    });
    $('searchResults').hidden = false;
  } catch { if (!controller.signal.aborted) toast('Поиск временно недоступен. Выберите точку на карте или введите координаты.'); }
  finally { if (searchRequest === controller) $('searchButton').textContent = '↗'; }
});
$('closeInfo').addEventListener('click', () => { closeInfo(); $('exploreButton').focus(); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
}));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  setPicking(false); $('searchResults').hidden = true;
  if (!$('info').hidden) { closeInfo(); $('exploreButton').focus(); }
});
document.addEventListener('visibilitychange', syncClock);
window.addEventListener('hashchange',openSharedLocation);
$('retryButton').addEventListener('click', () => location.reload());

applyTheme(loadPreference('terra-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
renderPassport(); initializeSponsor();
try {
  globe = await createGlobe({
    eco, reducedMotion, onPick:travel,
    onCoordinates:text => { if ($('coordinates').textContent !== text) $('coordinates').textContent = text; },
    onRotation:value => $('rotateButton').setAttribute('aria-pressed',String(value)),
    onError:toast,
  });
  applyTheme(document.body.dataset.theme); updateQuality();
  document.querySelectorAll('button:disabled').forEach(button => { button.disabled = false; });
  $('loading').hidden = true; openSharedLocation();
} catch (error) {
  console.error(error); $('spinner').hidden = true;
  $('loadingTitle').textContent = 'Земля пока вне зоны доступа';
  $('loadingText').textContent = `${error.message} Для 3D-глобуса нужен браузер с WebGL и аппаратным ускорением.`;
  $('retryButton').hidden = false;
}
