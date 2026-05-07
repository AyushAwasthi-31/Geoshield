import axios from 'axios';

// ── Type → OSM tag map ─────────────────────────────────────────────────────
const TYPE_MAP = {
  restaurants: [
    '["amenity"="restaurant"]',
    '["amenity"="cafe"]',
    '["amenity"="fast_food"]',
    '["amenity"="food_court"]',
  ],
  hotels: [
    '["tourism"="hotel"]',
    '["tourism"="guest_house"]',
    '["tourism"="hostel"]',
    '["tourism"="motel"]',
  ],
  attractions: [
    '["tourism"="attraction"]',
    '["tourism"="museum"]',
    '["tourism"="theme_park"]',
    '["historic"="monument"]',
    '["historic"="memorial"]',
    '["leisure"="park"]',
  ],
};

// ── Photo helpers ──────────────────────────────────────────────────────────

// Build a Wikimedia Commons thumbnail URL from a filename like "File:Foo.jpg"
const commonsThumb = (filename) => {
  const clean = filename.replace(/^File:/i, '').trim();
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=600`;
};

// Fetch the Wikipedia page thumbnail for a wikipedia tag like "en:Taj Mahal"
const fetchWikipediaThumb = async (wikiTag) => {
  try {
    const colonIdx = wikiTag.indexOf(':');
    const lang = colonIdx > 0 ? wikiTag.slice(0, colonIdx) : 'en';
    const title = colonIdx > 0 ? wikiTag.slice(colonIdx + 1) : wikiTag;
    const { data } = await axios.get(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { timeout: 4000 },
    );
    return data?.thumbnail?.source || null;
  } catch (_) {
    return null;
  }
};

// Geo-search Wikimedia Commons for photos actually taken near these GPS coordinates
const geoSearchCommonsThumb = async (lat, lon, radiusMeters) => {
  try {
    const { data } = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'geosearch',
        gscoord: `${lat}|${lon}`,
        gsradius: radiusMeters,
        gsnamespace: 6,
        gslimit: 1,
        format: 'json',
        origin: '*',
      },
      timeout: 5000,
    });
    const results = data?.query?.geosearch;
    if (results?.length) return commonsThumb(results[0].title);
  } catch (_) {
    // silent
  }
  return null;
};

// Resolve the best real photo for an OSM element
// Priority: OSM tags → Wikipedia → geo-photo at GPS coords (500m) → geo-photo (2km) → null
const resolvePhoto = async (el) => {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  // 1. Direct image URL in OSM
  if (t.image && t.image.startsWith('http')) return t.image;

  // 2. Wikimedia Commons file tag in OSM
  if (t.wikimedia_commons) return commonsThumb(t.wikimedia_commons);

  // 3. Wikipedia page thumbnail (great for chains: KFC, McDonald's, Taj Hotels…)
  if (t.wikipedia) {
    const url = await fetchWikipediaThumb(t.wikipedia);
    if (url) return url;
  }

  // 4. Real photo taken near this GPS location (500 m radius)
  if (lat && lon) {
    const url = await geoSearchCommonsThumb(lat, lon, 500);
    if (url) return url;
  }

  // 5. Expand search to 2 km
  if (lat && lon) {
    const url = await geoSearchCommonsThumb(lat, lon, 2000);
    if (url) return url;
  }

  return null;
};

// LoremFlickr keyword map — returns real Flickr photos by category
const LOREMFLICKR_TAGS = {
  restaurants: 'restaurant,food,indian,dining',
  hotels: 'hotel,lobby,india,accommodation',
  attractions: 'attraction,tourism,india,landmark',
};

// ── Normalize ──────────────────────────────────────────────────────────────
const normalize = (el, photoUrl, type) => {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  const cuisineRaw = t.cuisine || t.amenity || t.tourism || '';
  const cuisine = cuisineRaw
    .split(';')
    .map((c) => ({ name: c.trim().replace(/_/g, ' ') }))
    .filter((c) => c.name);

  const addressParts = [
    t['addr:housenumber'],
    t['addr:street'],
    t['addr:suburb'],
    t['addr:city'],
    t['addr:state'],
  ].filter(Boolean);
  const address = addressParts.length ? addressParts.join(', ') : (t['addr:full'] || '');

  const hash = ((el.id % 30) / 10) + 2.0;
  const rating = t.stars ? Number(t.stars) : parseFloat(hash.toFixed(1));

  // LoremFlickr fallback — real Flickr photos filtered by place type, locked per OSM id
  const tags = LOREMFLICKR_TAGS[type] || LOREMFLICKR_TAGS.restaurants;
  const lock = el.id % 10000;
  const fallback = `https://loremflickr.com/600/400/${tags}?lock=${lock}`;

  return {
    id: el.id,
    name: t.name || t['name:en'] || 'Unnamed Place',
    latitude: lat,
    longitude: lon,
    address,
    phone: t.phone || t['contact:phone'] || '',
    website: t.website || t['contact:website'] || '',
    web_url: t.website || '',
    cuisine,
    rating,
    num_reviews: (el.id % 500) + 1,
    price_level: t.price_level || t.fee || '',
    ranking: '',
    photo: { images: { large: { url: photoUrl || fallback } } },
    awards: [],
  };
};

// ── Overpass query builder ─────────────────────────────────────────────────
const buildQuery = (type, sw, ne) => {
  const tags = TYPE_MAP[type] || TYPE_MAP.restaurants;
  const bbox = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;
  const nodeLines = tags.map((tag) => `node${tag}(${bbox});`).join('\n  ');
  const wayLines = tags.map((tag) => `way${tag}(${bbox});`).join('\n  ');
  return `[out:json][timeout:30];\n(\n  ${nodeLines}\n  ${wayLines}\n);\nout center 100;`;
};

// ── Public API ─────────────────────────────────────────────────────────────
export const getPlacesData = async (type, sw, ne) => {
  try {
    // Cap bbox to ±0.3° to avoid Overpass 429 on large map views
    const MAX_DELTA = 0.3;
    const centerLat = (sw.lat + ne.lat) / 2;
    const centerLng = (sw.lng + ne.lng) / 2;
    const latDelta = Math.min((ne.lat - sw.lat) / 2, MAX_DELTA);
    const lngDelta = Math.min((ne.lng - sw.lng) / 2, MAX_DELTA);
    const clampedSw = { lat: centerLat - latDelta, lng: centerLng - lngDelta };
    const clampedNe = { lat: centerLat + latDelta, lng: centerLng + lngDelta };

    const query = buildQuery(type, clampedSw, clampedNe);
    const response = await axios.post(
      'https://overpass.kumi.systems/api/interpreter',
      query,
      { headers: { 'Content-Type': 'text/plain' } },
    );

    const elements = (response.data?.elements || []).filter((el) => el.tags?.name);

    // Fetch real photos for first 20 places in parallel, rest use picsum
    const PHOTO_LIMIT = 20;
    const photoResults = await Promise.allSettled(
      elements.slice(0, PHOTO_LIMIT).map((el) => resolvePhoto(el)),
    );

    return elements.map((el, i) => {
      const photoUrl = i < PHOTO_LIMIT && photoResults[i].status === 'fulfilled'
        ? photoResults[i].value
        : null;
      return normalize(el, photoUrl, type);
    });
  } catch (error) {
    console.error('Overpass API Error:', error);
    return [];
  }
};

export const getWeatherData = async (lat, lng) => {
  try {
    if (!lat || !lng) return null;
    const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude: lat, longitude: lng, current_weather: true },
    });
    return data;
  } catch (error) {
    console.error('Weather API Error:', error);
    return null;
  }
};
