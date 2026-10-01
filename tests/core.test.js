import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { collections, allPlaces, dailyPlace, randomPlace } from '../src/data/places.js';
import { validCoordinates, loadPlaces, storePreference } from '../src/storage.js';
import { fetchJSON, safeURL } from '../src/api.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.localStorage; });

test('all editorial destinations have unique IDs and usable coordinates', () => {
  assert.equal(collections.length,3);
  assert.equal(new Set(allPlaces.map(p => p.id)).size,allPlaces.length);
  for (const p of allPlaces) {
    assert.ok(validCoordinates(p.lat,p.lon)); assert.ok(p.title && p.note);
  }
});
test('daily destination is stable within a local day and changes the following day', () => {
  assert.equal(dailyPlace(new Date(2026,9,1,0)),dailyPlace(new Date(2026,9,1,23,59)));
  assert.notEqual(dailyPlace(new Date(2026,9,1)),dailyPlace(new Date(2026,9,2)));
});
test('random destination avoids immediately repeating the previous place', () => {
  for (const previous of allPlaces) {
    for (const random of [0, .5, .99999]) assert.notEqual(randomPlace(previous.id, () => random).id,previous.id);
  }
});
test('invalid coordinates and corrupt saved records cannot enter the atlas', () => {
  for (const [lat,lon] of [[NaN,0],[0,Infinity],[91,0],[0,181],['10',20]]) assert.equal(validCoordinates(lat,lon),false);
  globalThis.localStorage = { getItem:() => JSON.stringify([null, { title:'Bad',lat:95,lon:0 }, { title:'Kyoto',lat:35,lon:135 }]) };
  assert.equal(loadPlaces('test').length,1);
  globalThis.localStorage.getItem = () => '{broken';
  assert.deepEqual(loadPlaces('test'),[]);
});
test('unavailable storage never reports a successful save', () => {
  globalThis.localStorage = { setItem:() => { throw new Error('Quota exceeded'); } };
  assert.equal(storePreference('test',[]),false);
});
test('only absolute HTTPS links may be rendered as external destinations', () => {
  for (const url of ['javascript:alert(1)','http://example.org',undefined,'/relative']) assert.equal(safeURL(url),null);
  assert.equal(safeURL('https://example.org'),'https://example.org/');
});
test('successful API data is reused but failures are not cached', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok:true,json:async () => ({ value:42 }) }; };
  assert.deepEqual(await fetchJSON('https://test.invalid/cache'),{ value:42 });
  await fetchJSON('https://test.invalid/cache'); assert.equal(calls,1);
  globalThis.fetch = async () => { calls++; return { ok:false,status:503 }; };
  await assert.rejects(fetchJSON('https://test.invalid/failure'),/503/);
  await assert.rejects(fetchJSON('https://test.invalid/failure'),/503/);
  assert.equal(calls,3);
});
test('cancelling a journey aborts its active network request', async () => {
  globalThis.fetch = (_, { signal }) => new Promise((resolve,reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')), { once:true });
  });
  const controller = new AbortController();
  const result = fetchJSON('https://test.invalid/abort',controller.signal);
  controller.abort(); await assert.rejects(result,{ name:'AbortError' });
  await assert.rejects(fetchJSON('https://test.invalid/cache',controller.signal),{ name:'AbortError' });
});
