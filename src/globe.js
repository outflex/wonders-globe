import { coordinates } from './storage.js';

const CESIUM_BASE = 'https://cesium.com/downloads/cesiumjs/releases/1.121/Build/Cesium/';

async function loadCesium() {
  if (window.Cesium) return window.Cesium;
  window.CESIUM_BASE_URL = CESIUM_BASE;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => reject(new Error('Загрузка глобуса заняла слишком много времени. Попробуйте снова.')), 20000);
    script.src = CESIUM_BASE + 'Cesium.js';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Не удалось загрузить CesiumJS. Проверьте интернет.')); };
    document.head.append(script);
  });
  return window.Cesium;
}

export async function createGlobe({ eco, reducedMotion, onPick, onCoordinates, onRotation, onError }) {
  const C = await loadCesium();
  const imagery = new C.UrlTemplateImageryProvider({
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel:18,
    credit:new C.Credit('Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
  });
  const viewer = new C.Viewer('globe', {
    baseLayer:new C.ImageryLayer(imagery), terrainProvider:new C.EllipsoidTerrainProvider(),
    animation:false, timeline:false, baseLayerPicker:false, geocoder:false, homeButton:false,
    sceneModePicker:false, navigationHelpButton:false, fullscreenButton:false, selectionIndicator:false, infoBox:false,
    shouldAnimate:false, scene3DOnly:true, shadows:false,
    requestRenderMode:true, maximumRenderTimeChange:Infinity,
    contextOptions:{ webgl:{ alpha:false, antialias:false } },
  });
  const scene = viewer.scene;
  let marker, rotationTimer = null, rotating = false, lastRotation = 0, lastCoordinates = 0;
  const requestRender = () => { if (!document.hidden) scene.requestRender(); };

  function setQuality(value) {
    eco = value;
    // Recommended resolution ignores Retina DPR: 1x in eco, max 1.5x in quality.
    viewer.useBrowserRecommendedResolution = true;
    viewer.resolutionScale = eco ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    viewer.targetFrameRate = eco ? 30 : 45;
    scene.postProcessStages.fxaa.enabled = !eco;
    scene.msaaSamples = 1;
    scene.globe.maximumScreenSpaceError = eco ? 2.5 : 1.5;
    scene.globe.tileCacheSize = eco ? 100 : 180;
    requestRender();
  }
  setQuality(eco);

  const bordersProvider = new C.UrlTemplateImageryProvider({
    url:'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    maximumLevel:18, credit:new C.Credit('Boundaries and places © Esri'),
  });
  const bordersLayer = viewer.imageryLayers.addImageryProvider(bordersProvider);
  let boundaryErrorShown = false;
  bordersProvider.errorEvent.addEventListener(() => {
    if (!boundaryErrorShown) { boundaryErrorShown = true; onError('Слой границ временно недоступен. Остальная карта работает.'); }
  });
  scene.globe.baseColor = C.Color.fromCssColorString('#163243');
  scene.globe.enableLighting = true;
  scene.globe.dynamicAtmosphereLighting = true;
  scene.globe.dynamicAtmosphereLightingFromSun = true;
  scene.globe.showGroundAtmosphere = true;
  const cameraController = scene.screenSpaceCameraController;
  cameraController.minimumZoomDistance = 300;
  cameraController.maximumZoomDistance = 40000000;
  cameraController.enableTilt = false;
  cameraController.enableLook = false;
  viewer.clock.currentTime = C.JulianDate.now();
  viewer.camera.setView({ destination:C.Cartesian3.fromDegrees(15,48,18000000) });

  function stopRotation() {
    rotating = false;
    clearInterval(rotationTimer); rotationTimer = null;
    onRotation(false);
  }
  function setRotating(value) {
    stopRotation();
    if (!value || document.hidden) return;
    rotating = true; lastRotation = performance.now(); onRotation(true);
    rotationTimer = setInterval(() => {
      const now = performance.now();
      const delta = Math.min((now - lastRotation) / 1000, .1); lastRotation = now;
      viewer.camera.rotate(C.Cartesian3.UNIT_Z, -.022 * delta);
      requestRender();
    }, 1000 / 30);
  }
  function updateCoordinates(force = false) {
    const now = performance.now();
    if (!force && now - lastCoordinates < 150) return;
    lastCoordinates = now;
    const center = new C.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
    const hit = viewer.camera.pickEllipsoid(center, scene.globe.ellipsoid);
    const position = hit ? C.Cartographic.fromCartesian(hit) : viewer.camera.positionCartographic;
    onCoordinates(coordinates(C.Math.toDegrees(position.latitude), C.Math.toDegrees(position.longitude)));
  }
  viewer.camera.percentageChanged = .002;
  viewer.camera.changed.addEventListener(() => updateCoordinates());
  viewer.camera.moveEnd.addEventListener(() => updateCoordinates(true));
  updateCoordinates(true);

  for (const event of ['pointerdown','wheel','touchstart']) viewer.canvas.addEventListener(event, stopRotation, { passive:true });
  viewer.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.screenSpaceEventHandler.setInputAction(event => {
    const hit = viewer.camera.pickEllipsoid(event.position, scene.globe.ellipsoid);
    if (!hit) return;
    const point = C.Cartographic.fromCartesian(hit);
    onPick(C.Math.toDegrees(point.latitude), C.Math.toDegrees(point.longitude));
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  viewer.canvas.style.cursor = 'grab';
  viewer.canvas.setAttribute('aria-label', 'Глобус Земли. Вращайте мышью или касанием; масштабируйте скроллом или кнопками.');

  let fallbackStarted = false;
  imagery.errorEvent.addEventListener(async () => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    onError('Спутниковые снимки недоступны. Загружаем резервную карту.');
    try {
      const fallback = await C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII'));
      viewer.imageryLayers.remove(viewer.imageryLayers.get(0));
      viewer.imageryLayers.addImageryProvider(fallback, 0); requestRender();
    } catch { onError('Карта недоступна. Поиск и координаты продолжают работать.'); }
  });

  function refreshSun() { viewer.clock.currentTime = C.JulianDate.now(); requestRender(); }
  let sunTimer = null;
  function syncVisibility() {
    clearInterval(sunTimer); sunTimer = null;
    viewer.useDefaultRenderLoop = !document.hidden;
    if (document.hidden) { stopRotation(); viewer.camera.cancelFlight(); }
    else { refreshSun(); sunTimer = setInterval(refreshSun, 60000); }
  }
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
  window.addEventListener('resize', () => setQuality(eco));
  scene.renderError.addEventListener(() => onError('Ошибка 3D-рендеринга. Попробуйте перезагрузить страницу.'));

  return {
    viewer,
    setQuality,
    setRotating,
    get rotating() { return rotating; },
    setPicking(value) { viewer.canvas.style.cursor = value ? 'crosshair' : 'grab'; },
    setTheme(light) {
      scene.backgroundColor = C.Color.fromCssColorString(light ? '#eaf1f1' : '#080e14');
      if (scene.skyBox) scene.skyBox.show = !light;
      requestRender();
    },
    toggleBorders() { bordersLayer.show = !bordersLayer.show; requestRender(); return bordersLayer.show; },
    toggleLighting() { scene.globe.enableLighting = !scene.globe.enableLighting; requestRender(); return scene.globe.enableLighting; },
    cancelFlight() { viewer.camera.cancelFlight(); },
    zoom(direction) {
      stopRotation(); viewer.camera.cancelFlight();
      const height = viewer.camera.positionCartographic.height;
      if (direction > 0) viewer.camera.zoomIn(height * .35);
      else viewer.camera.zoomOut(Math.min(height * .5, 40000000 - height));
      requestRender();
    },
    home() {
      stopRotation(); viewer.camera.cancelFlight();
      viewer.camera.flyTo({ destination:C.Cartesian3.fromDegrees(15,48,18000000), orientation:{ heading:0, pitch:-Math.PI/2, roll:0 }, duration:reducedMotion ? 0 : 2 });
      requestRender();
    },
    flyTo(lat, lon) {
      stopRotation(); viewer.camera.cancelFlight();
      if (marker) viewer.entities.remove(marker);
      // A static point avoids ground ellipse geometry and extra draw calls.
      marker = viewer.entities.add({
        position:C.Cartesian3.fromDegrees(lon,lat,100),
        point:{ pixelSize:10, color:C.Color.fromCssColorString('#b8f1d2'), outlineColor:C.Color.fromCssColorString('#183e32'), outlineWidth:3 },
      });
      requestRender();
      return new Promise(resolve => viewer.camera.flyTo({
        destination:C.Cartesian3.fromDegrees(lon,lat,1100000),
        orientation:{ heading:0, pitch:-Math.PI/2, roll:0 }, duration:reducedMotion ? 0 : 2.4,
        complete:() => resolve(true), cancel:() => resolve(false),
      }));
    },
  };
}
