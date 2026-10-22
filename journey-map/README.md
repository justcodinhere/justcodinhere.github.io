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
- The plane, trains and car travel the actual routes, with a chase camera for
  the ground legs (`js/vehicles.js`). A twin-engine long-haul jet (a narrowbody
  on the short US hops) in a plain white and navy livery: cabin windows, swept
  wings with raked tips, big fan engines, nav lights, strobes and a beacon, gear
  that drops for landing and folds after take-off, and faint contrails at cruise.
- Trains to match each leg: a Railjet-style set (a Taurus-style engine and dark
  red and grey coaches) to Innsbruck, a white ICE-style set with its red stripe
  to Nuremberg, and the S-Bahn from the airport, with lit window bands, doors,
  bogies, roof gear and a raised pantograph under masts and wires near the
  train. The car is a dark MPV with lit lamps, a little snow on the roof and
  slush spray from the wheels in winter.
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
- Streets in the stop towns (Munich, Innsbruck, Nuremberg, Füssen and
  Hohenschwangau, Kufstein, Rattenberg) from the Overture / OpenStreetMap
  street network: wet, snow-cleared asphalt with slush in the gutters and worn
  lane lines, granite kerbs and pavements out to the house fronts, pale granite
  setts in the pedestrian zones and squares (Kaufingerstraße and Marienplatz,
  Maria-Theresien-Straße, the Hauptmarkt), tram rails, snowy tracks at the
  stations and worn paths through the snow (`js/streets.js`,
  `tools/streets_pack.py`). Up close they make the ground between the houses
  crisp; a few kilometres out they fade back into the imagery.
- 20 m terrain relief along the routes (Mapzen/AWS terrarium, zoom 13) baked
  into per-leg relief maps, so ridges and gullies light correctly up close.
- Trees by species and place: slender Norway spruce and silver fir with snow
  on their tiers, Scots pine in the Nuremberg Reichswald, bare larches on sunny
  Alpine slopes, and bare lime, beech, oak, maple, chestnut, birch, poplar and
  willow in the towns, parks, avenues and along the rivers, each a trunk and
  limbs inside a fine, frosted twig crown. Forests come from ESA WorldCover tree
  cover, conifer or broadleaf from the summer near-infrared imagery, and the
  town and park trees from OpenStreetMap, at their real heights.
- Close to the camera each forest point grows into a small stand of trees;
  further out the trees get simpler, so the forests stay light on phones.
- Hand-built landmarks at their true size on their real footprints, in place of
  the plain blocks there: every stop of the Munich and Innsbruck walks (see
  below); Kaiserburg, St. Lorenz and the Frauenkirche in Nuremberg;
  Neuschwanstein, Hohenschwangau, the Wieskirche and Kufstein fortress. Brick,
  sandstone, plaster, copper, slate and tile surfaces with tracery windows and
  clocks, lit and shadowed like the other buildings; the castles stand on their
  rocks again (`tools/lm_footprints.py` picks the outlines).
- The Munich Frauenkirche in detail: the 109 m brick hall under its huge roof,
  tall lancet windows between flat strips, the polygonal choir, and the two
  99 m towers with clocks, octagonal belfries and green copper domes.
- Munich's old-town walk: the Neues Rathaus front on Marienplatz with its
  pointed gables, pinnacles, statues and dormers, the corner oriel and the
  85 m tower with the Glockenspiel bay and its figures; the white Altes Rathaus
  with its pinnacled gable and the gate tower's four corner turrets; Alter
  Peter's broad tower with its clocks, gallery and stacked copper lantern helm;
  Heilig-Geist, the Mariensäule with its gilded Virgin, St. Michael's show front
  of statue niches and scrolled gables, and the narrow Bürgersaal and
  Asamkirche fronts between the houses.
- Innsbruck's walk: the Goldenes Dachl with its open loggias and gilded roof
  on the Neuhof, the Rococo Helblinghaus, the Stadtturm with its gallery and
  onion, the Ottoburg's oriels and red-and-white shutters, Dom St. Jakob, the
  Hofkirche and the long Hofburg with its domed towers, and the Bergisel jump:
  Zaha Hadid's tower and head, the inrun, the snowy landing hill and the
  stands, on a wooded hill modelled back where the elevation data had smoothed
  it away.
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
- Tree cover: ESA WorldCover 2021 (10 m). Trees, tree rows, woods and parks:
  OpenStreetMap contributors, via Overture Maps.

`tools/` has the Python scripts that built `assets/` (scene search, mosaic,
elevation, routing on the Natural Earth rail and road network, and valley
snapping). They expect a `data/` working folder and `rasterio`, `mgrs`,
`networkx`, `scipy`, `numpy` and `Pillow`.

## Next steps if we keep going

- Swap the code-built vehicles for Blender models: export `.glb` files and load
  them with three.js `GLTFLoader` into the groups `js/vehicles.js` fills.
- Free government data (needs these hosts allowed in the session's network
  settings): Bavaria's LoD2 buildings with surveyed roofs, 40 cm aerial photos
  (DOP40) and 1 m terrain; basemap.at aerial photos and Tyrol terrain for
  Innsbruck.
- Day-of-trip details on tap (hotel, Mass times, reservations).
