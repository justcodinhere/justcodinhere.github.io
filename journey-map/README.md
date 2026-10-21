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
- Waypoint stories: as the train or car passes something worth seeing, the
  vehicle slows, the camera turns toward it and a card says what it is and
  whether it's on your left or right. Stays (Munich, Innsbruck) and the day-trip
  stops (Nuremberg, Neuschwanstein) become short tours, one stop at a time.
  The "Stories" chip turns them off; the pause button freezes any leg.
- Detail near the routes: 10 m/pixel Sentinel-2 imagery along every rail and
  road corridor and around each stop, loaded one leg at a time (`assets/packs`).
  A second band of 20 m imagery reaches about 6 km either side of each route,
  so everything in view during a leg is sharp.
- 3D buildings for every town the routes pass and the stop cities (Overture
  Maps / OpenStreetMap footprints and heights). Roofs follow the real shape
  where it is tagged (gabled, hipped, pyramid, dome, onion, spire) and a
  sensible default elsewhere, built along each building's ridge line; tower
  and spire parts are drawn separately; tagged roof and wall colours are used.
  Snow sits on the pitched roofs in winter.
- 20 m terrain relief along the routes (Mapzen/AWS terrarium, zoom 13) baked
  into per-leg relief maps, so ridges and gullies light correctly up close.
- Snowy conifer forests: about 80,000 trees per leg, placed where the 10 m
  imagery shows forest below the tree line, densest along the track and around
  each stop.
- Hand-built landmark models: Frauenkirche, Neues Rathaus, Alter Peter and
  St. Michael in Munich; Dom St. Jakob, Hofkirche, Goldenes Dachl and Bergisel
  in Innsbruck; Kaiserburg, St. Lorenz and the Frauenkirche in Nuremberg;
  Neuschwanstein, Hohenschwangau, the Wieskirche and Kufstein fortress.
- Phone layout: the camera frames the action in the space between the header
  and the card, and wide shots pull back further on narrow screens.

## Photo-real cities (Google Photorealistic 3D Tiles)

During the city tours (Munich, Innsbruck, Nuremberg, Neuschwanstein) and the
major stops along the way (Kufstein, Rattenberg, the Wieskirche, family
towns), the map can switch under a bank of cloud to Google's photo-real 3D
city, then switch back when the camera leaves. While it shows, only Google's
3D content is on screen, with the trip's own pins, cards and labels on top.

It needs a Google Maps Platform API key:

1. In the Google Cloud console, create a project, attach a billing account and
   enable the **Map Tiles API**.
2. Create an API key. Under *Application restrictions* choose *Websites* and
   add `https://justcodinhere.github.io/*` (plus `http://localhost:8000/*` for
   testing). Under *API restrictions* allow only the Map Tiles API.
3. Optionally set a daily quota on the Map Tiles API so a surprise can't run
   up a bill.
4. Either paste the key into the page (the "3D cities" chip; it is saved in
   that browser only) or put it in `assets/config.json` as `googleMapsKey` so
   every visitor gets it. A key there is public, which is why the website
   restriction matters.

The tiles load only from a real web address such as GitHub Pages or
`python3 -m http.server` in this folder. The Claude artifact preview blocks
outside servers, so there the chip says it can't reach Google and the regular
map stays. Google's attribution line replaces the usual credits while the
tiles are on screen, as their terms require.

## Pacing and sub-steps

The train or car stops at each story. A bar on the story card counts down a
relaxed reading time (8–22 seconds by length); Continue moves on early, and
"Wait for me" keeps every story up until Continue is tapped (remembered in that
browser). Legs with more stories simply run longer.
Bigger sights get their own numbered sub-step that the leg runs straight
into: 4.1 Kufstein Fortress, 4.2 Rattenberg, 9.1 the Wieskirche. To promote any
other story to a sub-step, add `major: 1` to it in the `POI` list in
`index.html`.

## Family places

`assets/family.json` holds places from the family tree. Each entry needs
`name`, `lat` and `lon`; `people` and `note` are shown on its story card.
For example:

```json
{ "places": [
  { "name": "Rosenheim", "lat": 47.856, "lon": 12.129,
    "people": "Great-great-grandmother Anna, born 1871",
    "note": "Baptised at St. Nikolaus" }
] }
```

A place within about 8 km of a route becomes a stop on the closest leg, with a
red "Family history" card and dot. A place up to 60 km away still becomes a
sub-step that says how far off the route it is. All family places show as pins
on the opening globe view. This file is public once the site is published, so
keep anything private out of it.

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
- Free government data (needs these hosts allowed in the session's network
  settings): Bavaria's LoD2 buildings with surveyed roofs, 40 cm aerial photos
  (DOP40) and 1 m terrain; basemap.at aerial photos and Tyrol terrain for
  Innsbruck.
- Day-of-trip details on tap (hotel, Mass times, reservations).
