# Searl Christmas Journey (concept)

A 3D, step-by-step map of the Christmas 2026 trip, meant as an add-on to the
itinerary page. Open `index.html` from a web server (GitHub Pages works; opening
the file directly from disk won't load the map data).

## What it does

- Globe view for the flights (Wichita → Chicago → Munich, and both routes home
  via Denver and via Chicago), with a plane flying each great-circle arc.
- A detailed terrain patch over Bavaria and Tyrol (Munich, Innsbruck, Nuremberg,
  Neuschwanstein): real satellite imagery draped over real elevation,
  1.6× vertical exaggeration.
- Winter look: snow placed by elevation, thinned on cliffs and under forest,
  plus a light frost on the lowlands. The "Winter snow" chip turns it off.
- Rivers (Inn, Isar, Salzach, Danube) drawn as flowing water, snapped to the
  valley floor using the elevation data.
- Train, private car and plane stand-ins that travel the actual routes, with a
  chase camera for the ground legs.
- Clouds: a cloud layer on the globe, puffs over the Alps, a cloud bank around
  the edge of the detailed patch, and a full-screen cloud pass during big
  zooms (globe ↔ valley) that hides the change in detail.
- Snowfall in Innsbruck on Christmas Eve.

## Linking from the itinerary

Each leg has an anchor that matches the day cards in the itinerary page
(`#day1` … `#day10`, plus `#overview` and `#home`). A "Show on map" link on a
day card can point to `journey-map/#day4`, for example.

## Data sources

- Imagery: contains modified Copernicus Sentinel-2 data (2022–2024, Sentinel-2
  L2A cloud-optimised GeoTIFFs on AWS). Summer scenes, winterised in the shader.
- Elevation: Mapzen / AWS Terrain Tiles (terrarium encoding).
- Globe: NASA Blue Marble.
- Rivers, rail and roads: Natural Earth 1:10m.

`tools/` has the Python scripts that built `assets/` (scene search, mosaic,
elevation, routing on the Natural Earth rail and road network, and valley
snapping). They expect a `data/` working folder and `rasterio`, `mgrs`,
`networkx`, `scipy`, `numpy` and `Pillow`.

## Next steps if we keep going

- Swap the code-built vehicles for Blender models: export `.glb` files and load
  them with three.js `GLTFLoader` in place of `makePlane`, `makeTrainCar` and
  `makeVan`.
- Sharper close-ups: stream map tiles (for example MapTiler or Cesium ion,
  both need a free API key) instead of the single baked image.
  Right now the image is about 95 m per pixel for the region and 30 m per
  pixel around Innsbruck.
- Day-of-trip details on tap (hotel, Mass times, reservations).
