#!/usr/bin/env node
/**
 * Fetch real-time airspace restrictions data from multiple sources:
 * - FAA TFRs (Temporary Flight Restrictions)
 * - SafeAirspace conflict zones
 * - ICAO conflict zone advisories
 * 
 * Output: JSON file with warzones and no-fly zones for the map
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, 'data');
const OUTPUT_FILE = path.resolve(DATA_DIR, 'airspace-restrictions.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

// Known active warzones (static data supplemented by real-time)
const STATIC_WARZONES = [
  {
    id: 'ukraine-war',
    name: 'Ukraine War Zone',
    country: 'UA',
    region: 'Europe',
    intensity: 'high',
    parties: ['Russia', 'Ukraine'],
    description: 'Active conflict zone - all commercial aviation prohibited over Ukraine',
    geometry: {
      type: 'polygon',
      coordinates: [
        [22.14, 52.38], [24.09, 51.89], [27.85, 52.18], [32.76, 52.32],
        [38.25, 49.92], [40.18, 49.6], [40.08, 47.77], [38.21, 47.1],
        [35.19, 46.1], [33.55, 44.39], [31.78, 45.2], [29.6, 45.38],
        [28.21, 45.45], [26.62, 48.26], [22.87, 47.95], [22.14, 52.38],
      ],
    },
    startDate: '2022-02-24',
    source: 'icao',
  },
  {
    id: 'gaza-conflict',
    name: 'Gaza Conflict Zone',
    country: 'PS',
    region: 'Middle East',
    intensity: 'high',
    parties: ['Israel', 'Hamas'],
    description: 'Active conflict - airspace closed',
    geometry: {
      type: 'polygon',
      coordinates: [
        [34.2, 31.6], [34.6, 31.6], [34.6, 31.2], [34.2, 31.2], [34.2, 31.6],
      ],
    },
    startDate: '2023-10-07',
    source: 'icao',
  },
  {
    id: 'sudan-civil-war',
    name: 'Sudan Civil War Zone',
    country: 'SD',
    region: 'Africa',
    intensity: 'high',
    parties: ['SAF', 'RSF'],
    description: 'Active civil war - commercial aviation suspended',
    geometry: {
      type: 'polygon',
      coordinates: [
        [21.8, 22.0], [31.4, 22.0], [38.6, 22.0], [38.6, 8.7],
        [35.9, 9.4], [33.9, 9.7], [27.4, 9.5], [24.0, 8.7],
        [21.8, 12.0], [21.8, 22.0],
      ],
    },
    startDate: '2023-04-15',
    source: 'icao',
  },
  {
    id: 'yemen-conflict',
    name: 'Yemen Conflict Zone',
    country: 'YE',
    region: 'Middle East',
    intensity: 'high',
    parties: ['Houthis', 'Saudi Coalition', 'Yemen Government'],
    description: 'Active conflict and Red Sea crisis',
    geometry: {
      type: 'polygon',
      coordinates: [
        [42.6, 17.0], [43.5, 17.0], [46.0, 17.2], [52.0, 15.0],
        [52.2, 12.5], [43.5, 12.4], [42.6, 16.5], [42.6, 17.0],
      ],
    },
    startDate: '2015-03-26',
    source: 'icao',
  },
  {
    id: 'syria-conflict',
    name: 'Syria Conflict Zone',
    country: 'SY',
    region: 'Middle East',
    intensity: 'medium',
    parties: ['Syrian Government', 'Various factions'],
    description: 'Ongoing conflict - restricted commercial aviation',
    geometry: {
      type: 'polygon',
      coordinates: [
        [35.7, 37.3], [42.4, 37.3], [42.4, 32.3], [35.5, 32.3], [35.7, 37.3],
      ],
    },
    startDate: '2011-03-15',
    source: 'icao',
  },
];

// Known permanent no-fly zones
const PERMANENT_NO_FLY_ZONES = [
  {
    id: 'p-56a',
    name: 'Washington DC FRZ (P-56A)',
    type: 'prohibited',
    severity: 'critical',
    source: 'faa',
    geometry: {
      type: 'circle',
      center: [-77.0369, 38.8977],
      radiusNm: 15,
    },
    country: 'US',
    region: 'Americas',
    reason: 'White House / National Security',
  },
  {
    id: 'p-40',
    name: 'Camp David (P-40)',
    type: 'prohibited',
    severity: 'critical',
    source: 'faa',
    geometry: {
      type: 'circle',
      center: [-77.4650, 39.6481],
      radiusNm: 3,
    },
    country: 'US',
    region: 'Americas',
    reason: 'Presidential Retreat',
  },
  {
    id: 'ind-delhi-parliament',
    name: 'New Delhi Parliament Complex',
    type: 'prohibited',
    severity: 'critical',
    source: 'notam',
    geometry: {
      type: 'circle',
      center: [77.2090, 28.6173],
      radiusNm: 1.5,
    },
    country: 'IN',
    region: 'Asia',
    reason: 'Government Complex / VVIP Security',
  },
  {
    id: 'rus-kremlin',
    name: 'Moscow Kremlin Zone',
    type: 'prohibited',
    severity: 'critical',
    source: 'notam',
    geometry: {
      type: 'circle',
      center: [37.6176, 55.7520],
      radiusNm: 5,
    },
    country: 'RU',
    region: 'Europe',
    reason: 'Government Complex',
  },
  {
    id: 'korea-dmz',
    name: 'Korean DMZ',
    type: 'danger',
    severity: 'critical',
    source: 'icao',
    geometry: {
      type: 'polygon',
      coordinates: [
        [124.5, 38.5], [131.0, 38.5], [131.0, 37.8], [124.5, 37.8], [124.5, 38.5],
      ],
    },
    country: 'KR',
    region: 'Asia',
    reason: 'Military Demarcation Line',
  },
  {
    id: 'r-4808n',
    name: 'Nevada Test Site (R-4808N)',
    type: 'restricted',
    severity: 'critical',
    source: 'faa',
    geometry: {
      type: 'polygon',
      coordinates: [
        [-116.05, 37.35], [-115.75, 37.35], [-115.75, 37.15], [-116.05, 37.15], [-116.05, 37.35],
      ],
    },
    country: 'US',
    region: 'Americas',
    reason: 'Military Test Range',
  },
];

/**
 * Fetch FAA TFRs
 */
async function fetchFAATfrs() {
  console.log('[airspace] Fetching FAA TFRs...');
  try {
    // FAA TFR feed
    const resp = await fetch('https://tfr.faa.gov/tfr2/list.json', {
      headers: {
        'User-Agent': 'SkyGuard/1.0 Airspace Monitor',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      console.warn(`[airspace] FAA TFR fetch failed: HTTP ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const tfrs = [];

    for (const tfr of (data.features || data || [])) {
      const props = tfr.properties || tfr;
      if (!props) continue;

      tfrs.push({
        id: `faa-tfr-${props.notamNumber || props.id || Math.random().toString(36).slice(2)}`,
        name: props.name || props.description || 'FAA TFR',
        type: 'tfr',
        severity: classifyTfrSeverity(props),
        source: 'faa',
        geometry: extractGeometry(tfr.geometry || props),
        country: 'US',
        region: 'Americas',
        reason: props.reason || props.type || 'Temporary Flight Restriction',
        notamId: props.notamNumber,
        effectiveFrom: props.effectiveStart || props.startDate,
        effectiveTo: props.effectiveEnd,
      });
    }

    console.log(`[airspace] Fetched ${tfrs.length} FAA TFRs`);
    return tfrs;
  } catch (err) {
    console.warn('[airspace] FAA TFR fetch error:', err.message);
    return [];
  }
}

/**
 * Fetch ACLED conflict data
 */
async function fetchACLEDConflicts() {
  console.log('[airspace] Fetching ACLED conflict data...');
  const acledKey = process.env.ACLED_API_KEY;
  
  if (!acledKey) {
    console.log('[airspace] No ACLED API key, using static warzone data');
    return [];
  }

  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const url = `https://api.acleddata.com/acled/read?key=${acledKey}&event_date=${startDate}|${endDate}&event_date_where=BETWEEN&limit=1000`;
    
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      console.warn(`[airspace] ACLED fetch failed: HTTP ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const conflicts = [];

    // Group events by country to create conflict zones
    const countryEvents = new Map();
    for (const event of (data.data || [])) {
      const country = event.country;
      if (!countryEvents.has(country)) {
        countryEvents.set(country, []);
      }
      countryEvents.get(country).push(event);
    }

    // Create warzone features for countries with significant conflict activity
    for (const [country, events] of countryEvents) {
      if (events.length < 10) continue; // Only significant conflicts
      
      const fatalities = events.reduce((sum, e) => sum + (parseInt(e.fatalities) || 0), 0);
      const intensity = fatalities > 1000 ? 'high' : fatalities > 100 ? 'medium' : 'low';
      
      // Calculate bounding box of events
      const lats = events.map(e => parseFloat(e.latitude));
      const lons = events.map(e => parseFloat(e.longitude));
      const minLat = Math.min(...lats) - 0.5;
      const maxLat = Math.max(...lats) + 0.5;
      const minLon = Math.min(...lons) - 0.5;
      const maxLon = Math.max(...lons) + 0.5;

      conflicts.push({
        id: `acled-${country.toLowerCase().replace(/\s+/g, '-')}`,
        name: `${country} Conflict Zone`,
        country: country,
        region: events[0]?.region || 'Unknown',
        intensity,
        parties: [...new Set(events.map(e => e.actor1).filter(Boolean))].slice(0, 5),
        description: `${events.length} conflict events in past 30 days`,
        geometry: {
          type: 'polygon',
          coordinates: [
            [minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat], [minLon, maxLat],
          ],
        },
        casualties: fatalities,
        source: 'acled',
      });
    }

    console.log(`[airspace] Created ${conflicts.length} ACLED conflict zones`);
    return conflicts;
  } catch (err) {
    console.warn('[airspace] ACLED fetch error:', err.message);
    return [];
  }
}

function classifyTfrSeverity(props) {
  const reason = (props.reason || props.type || '').toLowerCase();
  if (reason.includes('presidential') || reason.includes('vip')) return 'critical';
  if (reason.includes('hazard') || reason.includes('fire')) return 'high';
  if (reason.includes('stadium') || reason.includes('event')) return 'medium';
  return 'low';
}

function extractGeometry(geo) {
  if (!geo) return { type: 'circle', center: [0, 0], radiusNm: 5 };
  
  if (geo.type === 'Point') {
    return {
      type: 'circle',
      center: geo.coordinates,
      radiusNm: 5,
    };
  }
  
  if (geo.type === 'Polygon' && geo.coordinates?.[0]) {
    return {
      type: 'polygon',
      coordinates: geo.coordinates[0],
    };
  }
  
  if (geo.latitude && geo.longitude) {
    return {
      type: 'circle',
      center: [geo.longitude, geo.latitude],
      radiusNm: geo.radius || 5,
    };
  }
  
  return { type: 'circle', center: [0, 0], radiusNm: 5 };
}

async function main() {
  console.log('=== Airspace Restrictions Fetcher ===\n');

  // Fetch from external sources
  const [faaTfrs, acledConflicts] = await Promise.all([
    fetchFAATfrs(),
    fetchACLEDConflicts(),
  ]);

  // Combine all data
  const restrictions = [
    ...PERMANENT_NO_FLY_ZONES.map(r => ({
      ...r,
      isActive: true,
      effectiveFrom: new Date('2000-01-01').toISOString(),
      lastUpdated: new Date().toISOString(),
    })),
    ...faaTfrs.map(r => ({
      ...r,
      isActive: true,
      lastUpdated: new Date().toISOString(),
    })),
  ];

  const warzones = [
    ...STATIC_WARZONES.map(w => ({
      ...w,
      lastUpdated: new Date().toISOString(),
    })),
    ...acledConflicts.map(w => ({
      ...w,
      lastUpdated: new Date().toISOString(),
    })),
  ];

  // Deduplicate by id
  const restrictionMap = new Map();
  for (const r of restrictions) {
    restrictionMap.set(r.id, r);
  }

  const warzoneMap = new Map();
  for (const w of warzones) {
    warzoneMap.set(w.id, w);
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    restrictions: Array.from(restrictionMap.values()),
    warzones: Array.from(warzoneMap.values()),
    stats: {
      totalRestrictions: restrictionMap.size,
      activeWarzones: Array.from(warzoneMap.values()).filter(w => w.intensity === 'high').length,
      tfrsActive: faaTfrs.length,
      noFlyZones: restrictions.filter(r => r.type === 'prohibited').length,
    },
  };

  // Write output
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote ${OUTPUT_FILE}`);
  console.log(`   - ${output.stats.totalRestrictions} restrictions`);
  console.log(`   - ${output.warzones.length} warzones (${output.stats.activeWarzones} high intensity)`);
  console.log(`   - ${output.stats.tfrsActive} active TFRs`);
}

main().catch(console.error);
