/**
 * Airspace Restrictions Service
 * Fetches real-time warzones and no-fly zones from multiple data sources:
 * - FAA TFRs (Temporary Flight Restrictions)
 * - ICAO conflict zones
 * - EUROCONTROL airspace warnings
 * - Open data conflict databases
 */

import { toApiUrl } from '@/services/runtime';
import { getAviationWeather, weatherToHazards } from '@/services/aviation-weather';
// Use JS mapping helper (avoids importing runtime when tests run)
import { mapWeatherHazardsToRestrictions } from './mapWeatherHazardsToRestrictions';

export type RestrictionType = 
  | 'warzone'           // Active conflict zone - no commercial flights
  | 'no-fly'            // Permanent no-fly zone (military, govt)
  | 'tfr'               // Temporary Flight Restriction
  | 'danger'            // Danger area - military activity
  | 'restricted'        // Restricted airspace
  | 'prohibited'        // Prohibited airspace (P-zones)
  | 'conflict-advisory' // Conflict zone advisory
  | 'special-use';      // Special use airspace

export type RestrictionSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RestrictionSource = 
  | 'faa'         // FAA TFRs
  | 'icao'        // ICAO conflict zones
  | 'eurocontrol' // EUROCONTROL
  | 'notam'       // NOTAMs
  | 'acled'       // Armed Conflict Location & Event Data
  | 'safeairspace' // SafeAirspace.net
  | 'weather';     // Aviation weather hazards (SIGMET/AIRMET)

export interface AirspaceRestriction {
  id: string;
  name: string;
  type: RestrictionType;
  severity: RestrictionSeverity;
  source: RestrictionSource;
  
  // Geometry - either polygon or circle
  geometry: {
    type: 'polygon' | 'circle';
    coordinates?: [number, number][]; // For polygon: [lon, lat][]
    center?: [number, number];        // For circle: [lon, lat]
    radiusNm?: number;                // Nautical miles
  };
  
  // Altitude restrictions (in feet)
  altitudeLower?: number;
  altitudeUpper?: number;
  
  // Timing
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
  
  // Metadata
  country?: string;
  region?: string;
  reason?: string;
  notamId?: string;
  lastUpdated: Date;
  
  // For warzones
  parties?: string[];
  conflictIntensity?: 'high' | 'medium' | 'low';
}

export interface WarzoneData {
  id: string;
  name: string;
  country: string;
  region: string;
  intensity: 'high' | 'medium' | 'low';
  parties: string[];
  description: string;
  geometry: {
    type: 'polygon';
    coordinates: [number, number][];
  };
  startDate?: string;
  casualties?: number;
  displaced?: number;
  source: string;
  lastUpdated: Date;
}

export interface AirspaceRestrictionsData {
  fetchedAt: string;
  restrictions: AirspaceRestriction[];
  warzones: WarzoneData[];
  stats: {
    totalRestrictions: number;
    activeWarzones: number;
    tfrsActive: number;
    noFlyZones: number;
  };
}

// Cache
let cachedData: AirspaceRestrictionsData | null = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Known permanent no-fly zones (static data supplemented by real-time)
const PERMANENT_NO_FLY_ZONES: AirspaceRestriction[] = [
  // Washington DC
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
    isActive: true,
    effectiveFrom: new Date('1950-01-01'),
    lastUpdated: new Date(),
  },
  // Camp David
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
    isActive: true,
    effectiveFrom: new Date('1950-01-01'),
    lastUpdated: new Date(),
  },
  // New Delhi Parliament
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
    isActive: true,
    effectiveFrom: new Date('2000-01-01'),
    lastUpdated: new Date(),
  },
  // Kremlin
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
    isActive: true,
    effectiveFrom: new Date('1991-01-01'),
    lastUpdated: new Date(),
  },
  // Beijing Forbidden City / Zhongnanhai
  {
    id: 'chn-beijing-central',
    name: 'Beijing Central Government Zone',
    type: 'prohibited',
    severity: 'critical',
    source: 'notam',
    geometry: {
      type: 'circle',
      center: [116.3912, 39.9139],
      radiusNm: 10,
    },
    country: 'CN',
    region: 'Asia',
    reason: 'Central Government Complex',
    isActive: true,
    effectiveFrom: new Date('1949-01-01'),
    lastUpdated: new Date(),
  },
  // Buckingham Palace
  {
    id: 'gbr-buckingham',
    name: 'Central London Restricted Zone',
    type: 'restricted',
    severity: 'high',
    source: 'notam',
    geometry: {
      type: 'circle',
      center: [-0.1419, 51.5014],
      radiusNm: 2,
    },
    country: 'GB',
    region: 'Europe',
    reason: 'Royal Residence / Government',
    isActive: true,
    effectiveFrom: new Date('2000-01-01'),
    lastUpdated: new Date(),
  },
  // Area 51
  {
    id: 'r-4808n',
    name: 'Nevada Test Site / Groom Lake (R-4808N)',
    type: 'restricted',
    severity: 'critical',
    source: 'faa',
    geometry: {
      type: 'polygon',
      coordinates: [
        [-116.05, 37.35],
        [-115.75, 37.35],
        [-115.75, 37.15],
        [-116.05, 37.15],
        [-116.05, 37.35],
      ],
    },
    country: 'US',
    region: 'Americas',
    reason: 'Military Test Range',
    isActive: true,
    effectiveFrom: new Date('1950-01-01'),
    lastUpdated: new Date(),
  },
  // Korean DMZ
  {
    id: 'korea-dmz',
    name: 'Korean DMZ',
    type: 'danger',
    severity: 'critical',
    source: 'icao',
    geometry: {
      type: 'polygon',
      coordinates: [
        [124.61, 38.65],  // West coast DMZ
        [126.10, 37.97],  // Near Kaesong
        [127.00, 38.30],  // Central DMZ
        [128.35, 38.62],  // East central
        [129.35, 38.65],  // Near coast
        [130.78, 38.90],  // East coast
        [130.78, 37.70],  // South buffer
        [124.61, 37.70],  // West buffer
        [124.61, 38.65],  // Close polygon
      ],
    },
    country: 'KR',
    region: 'Asia',
    reason: 'Military Demarcation Line - 4km wide buffer zone',
    isActive: true,
    effectiveFrom: new Date('1953-07-27'),
    lastUpdated: new Date(),
  },
  // North Korea - entire country is restricted airspace
  {
    id: 'north-korea-airspace',
    name: 'North Korea Restricted Airspace',
    type: 'prohibited',
    severity: 'critical',
    source: 'icao',
    geometry: {
      type: 'polygon',
      coordinates: [
        // North Korea actual boundaries
        [124.21, 39.80],  // Northwest coast
        [124.36, 40.00],
        [124.89, 40.47],
        [125.76, 40.87],
        [126.90, 41.77],
        [127.52, 41.48],
        [128.20, 41.40],
        [128.11, 42.00],
        [128.50, 42.04],
        [129.36, 42.44],
        [129.70, 42.43],
        [129.90, 42.99],
        [130.20, 42.92],
        [130.64, 42.42],  // Northeast corner (Tumen River)
        [130.78, 42.30],
        [130.78, 38.65],  // East coast down to DMZ
        [129.35, 38.65],
        [128.35, 38.62],
        [127.00, 38.30],
        [126.10, 37.97],
        [124.61, 38.65],  // West coast at DMZ
        [124.21, 39.80],  // Close polygon
      ],
    },
    country: 'KP',
    region: 'Asia',
    reason: 'DPRK - No commercial overflight permitted. Missile/nuclear test zone.',
    isActive: true,
    effectiveFrom: new Date('1950-06-25'),
    lastUpdated: new Date(),
  },
];

// Known active warzones (supplemented by real-time ACLED data)
const STATIC_WARZONES: WarzoneData[] = [
  {
    id: 'ukraine-war',
    name: 'Ukraine War Zone',
    country: 'UA',
    region: 'Europe',
    intensity: 'high',
    parties: ['Russia', 'Ukraine'],
    description: 'Active conflict zone - all commercial aviation prohibited over Ukraine and parts of western Russia',
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
    casualties: 500000,
    displaced: 6500000,
    source: 'icao',
    lastUpdated: new Date(),
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
    lastUpdated: new Date(),
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
    lastUpdated: new Date(),
  },
  {
    id: 'yemen-conflict',
    name: 'Yemen Conflict Zone',
    country: 'YE',
    region: 'Middle East',
    intensity: 'high',
    parties: ['Houthis', 'Saudi Coalition', 'Yemen Government'],
    description: 'Active conflict and Red Sea crisis - significant aviation restrictions',
    geometry: {
      type: 'polygon',
      coordinates: [
        [42.6, 17.0], [43.5, 17.0], [46.0, 17.2], [52.0, 15.0],
        [52.2, 12.5], [43.5, 12.4], [42.6, 16.5], [42.6, 17.0],
      ],
    },
    startDate: '2015-03-26',
    source: 'icao',
    lastUpdated: new Date(),
  },
  {
    id: 'myanmar-conflict',
    name: 'Myanmar Civil Conflict',
    country: 'MM',
    region: 'Asia',
    intensity: 'medium',
    parties: ['Military Junta (SAC)', 'NUG/PDF', 'Ethnic Armed Organizations (KIA, KNLA, AA, TNLA)'],
    description: 'Civil conflict since 2021 coup - portions of airspace affected, especially border regions',
    geometry: {
      type: 'polygon',
      coordinates: [
        // Myanmar actual boundaries (simplified)
        [92.19, 28.21],   // Northwest corner (near India)
        [94.67, 29.27],   // North (Kachin)
        [96.17, 28.83],
        [97.34, 28.23],
        [97.79, 28.33],
        [98.15, 27.29],   // Northeast (China border)
        [98.50, 27.65],
        [98.70, 25.57],
        [98.88, 25.29],
        [99.54, 23.08],
        [99.24, 22.12],
        [100.12, 21.43],
        [100.55, 21.47],  // East (Laos/Thailand border)
        [100.09, 20.35],
        [99.99, 19.46],
        [98.93, 19.74],
        [98.50, 18.63],
        [98.19, 17.96],
        [98.57, 16.05],
        [98.82, 15.19],
        [98.58, 14.36],
        [98.20, 13.98],
        [98.41, 12.29],
        [98.68, 11.82],
        [98.57, 10.47],
        [98.76, 10.00],   // South (Tanintharyi)
        [98.56, 9.93],
        [98.15, 10.77],
        [97.79, 10.66],
        [96.33, 12.95],
        [95.30, 15.74],
        [94.58, 16.13],   // Southwest coast
        [94.19, 16.04],
        [94.27, 18.21],
        [93.11, 19.43],
        [92.57, 20.40],
        [92.24, 20.92],
        [92.17, 21.50],   // West coast (Rakhine)
        [92.33, 22.66],
        [93.17, 23.97],
        [93.37, 24.07],
        [94.11, 23.88],
        [94.55, 24.68],
        [94.60, 25.16],
        [94.21, 25.79],
        [93.83, 26.95],
        [92.67, 27.93],
        [92.19, 28.21],   // Close polygon
      ],
    },
    startDate: '2021-02-01',
    source: 'icao',
    lastUpdated: new Date(),
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
    lastUpdated: new Date(),
  },
  {
    id: 'north-korea-warzone',
    name: 'North Korea (DPRK)',
    country: 'KP',
    region: 'Asia',
    intensity: 'high',
    parties: ['DPRK Military', 'KPA'],
    description: 'Closed airspace - No commercial overflight permitted. Active missile testing, nuclear program. All flights prohibited.',
    geometry: {
      type: 'polygon',
      coordinates: [
        // North Korea actual boundaries
        [124.21, 39.80],
        [124.36, 40.00],
        [124.89, 40.47],
        [125.76, 40.87],
        [126.90, 41.77],
        [127.52, 41.48],
        [128.20, 41.40],
        [128.11, 42.00],
        [128.50, 42.04],
        [129.36, 42.44],
        [129.70, 42.43],
        [129.90, 42.99],
        [130.20, 42.92],
        [130.64, 42.42],
        [130.78, 42.30],
        [130.78, 38.65],
        [129.35, 38.65],
        [128.35, 38.62],
        [127.00, 38.30],
        [126.10, 37.97],
        [124.61, 38.65],
        [124.21, 39.80],
      ],
    },
    startDate: '1950-06-25',
    source: 'icao',
    lastUpdated: new Date(),
  },
  {
    id: 'iran-war-theater',
    name: 'Iran Theater / Persian Gulf Crisis',
    country: 'IR',
    region: 'Middle East',
    intensity: 'high',
    parties: ['United States', 'Israel', 'Iran', 'IRGC'],
    description: 'Active military operations - US Operation Epic Fury / Israel Operation Roaring Lion',
    geometry: {
      type: 'polygon',
      coordinates: [
        [44, 39.7], [48.5, 38.5], [55.5, 38], [61, 36.5], [63.5, 31.5],
        [61, 28], [56.5, 25.5], [52.5, 27.5], [47.5, 30], [45.8, 35.5],
        [44, 39.7],
      ],
    },
    startDate: '2026-02-28',
    source: 'icao',
    lastUpdated: new Date(),
  },
];

/**
 * Fetch real-time FAA TFRs
 */
async function fetchFAATfrs(): Promise<AirspaceRestriction[]> {
  try {
    // FAA TFR GeoJSON endpoint
    const resp = await fetch('https://tfr.faa.gov/tfr2/list.json', {
      signal: AbortSignal.timeout(15_000),
      headers: { 'Accept': 'application/json' },
    });
    
    if (!resp.ok) return [];
    
    const data = await resp.json();
    const tfrs: AirspaceRestriction[] = [];
    
    for (const tfr of (data.features || data || [])) {
      const props = tfr.properties || tfr;
      if (!props) continue;
      
      const restriction: AirspaceRestriction = {
        id: `faa-tfr-${props.notamNumber || props.id || Math.random().toString(36).slice(2)}`,
        name: props.name || props.description || 'FAA TFR',
        type: props.type?.toLowerCase().includes('hazard') ? 'danger' : 'tfr',
        severity: classifyTfrSeverity(props),
        source: 'faa',
        geometry: extractGeometry(tfr.geometry || props),
        altitudeLower: props.floor || props.altLow || 0,
        altitudeUpper: props.ceiling || props.altHigh || 60000,
        effectiveFrom: new Date(props.effectiveStart || props.startDate || Date.now()),
        effectiveTo: props.effectiveEnd ? new Date(props.effectiveEnd) : undefined,
        isActive: true,
        country: 'US',
        region: 'Americas',
        reason: props.reason || props.type || 'Temporary Flight Restriction',
        notamId: props.notamNumber,
        lastUpdated: new Date(),
      };
      
      tfrs.push(restriction);
    }
    
    return tfrs;
  } catch (err) {
    console.warn('[airspace] FAA TFR fetch failed:', err);
    return [];
  }
}

/**
 * Fetch ICAO conflict zone warnings
 */
async function fetchICAOConflictZones(): Promise<AirspaceRestriction[]> {
  try {
    // Try our API endpoint first
    const resp = await fetch(toApiUrl('/api/icao-conflict-zones'), {
      signal: AbortSignal.timeout(15_000),
    });
    
    if (!resp.ok) return [];
    
    const data = await resp.json();
    return (data.zones || []).map((zone: any) => ({
      id: `icao-${zone.id}`,
      name: zone.name,
      type: 'conflict-advisory' as RestrictionType,
      severity: zone.risk === 'high' ? 'critical' : zone.risk === 'medium' ? 'high' : 'medium',
      source: 'icao' as RestrictionSource,
      geometry: zone.geometry,
      country: zone.country,
      region: zone.region,
      reason: zone.reason,
      isActive: true,
      effectiveFrom: new Date(zone.effectiveFrom || Date.now()),
      effectiveTo: zone.effectiveTo ? new Date(zone.effectiveTo) : undefined,
      lastUpdated: new Date(),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch ACLED conflict data for active warzones
 */
async function fetchACLEDConflicts(): Promise<WarzoneData[]> {
  try {
    const resp = await fetch(toApiUrl('/api/acled-conflicts'), {
      signal: AbortSignal.timeout(20_000),
    });
    
    if (!resp.ok) return [];
    
    const data = await resp.json();
    return (data.conflicts || []).map((conflict: any) => ({
      id: `acled-${conflict.id}`,
      name: conflict.name || conflict.location,
      country: conflict.country,
      region: conflict.region,
      intensity: conflict.fatalities > 1000 ? 'high' : conflict.fatalities > 100 ? 'medium' : 'low',
      parties: conflict.actors || [],
      description: conflict.notes || '',
      geometry: conflict.geometry || {
        type: 'polygon' as const,
        coordinates: createBoundingBox(conflict.latitude, conflict.longitude, 50), // 50km radius
      },
      startDate: conflict.event_date,
      casualties: conflict.fatalities,
      source: 'acled',
      lastUpdated: new Date(),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch SafeAirspace warnings
 */
async function fetchSafeAirspaceWarnings(): Promise<AirspaceRestriction[]> {
  try {
    const resp = await fetch(toApiUrl('/api/safeairspace'), {
      signal: AbortSignal.timeout(15_000),
    });
    
    if (!resp.ok) return [];
    
    const data = await resp.json();
    return (data.warnings || []).map((warning: any) => ({
      id: `safeairspace-${warning.id}`,
      name: warning.title || warning.country,
      type: warning.type === 'war' ? 'warzone' : 'conflict-advisory',
      severity: warning.risk === 'do_not_fly' ? 'critical' : warning.risk === 'avoid' ? 'high' : 'medium',
      source: 'safeairspace' as RestrictionSource,
      geometry: warning.geometry,
      country: warning.countryCode,
      region: warning.region,
      reason: warning.reason,
      isActive: true,
      effectiveFrom: new Date(warning.issued || Date.now()),
      lastUpdated: new Date(),
    }));
  } catch {
    return [];
  }
}

/**
 * Main fetch function - combines all data sources
 */
export async function fetchAirspaceRestrictions(): Promise<AirspaceRestrictionsData | null> {
  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_TTL) return cachedData;
  
  try {
    // Fetch from multiple sources in parallel
    const [faaTfrs, icaoZones, acledConflicts, safeAirspace, aviationWeatherData] = await Promise.all([
      fetchFAATfrs().catch(() => []),
      fetchICAOConflictZones().catch(() => []),
      fetchACLEDConflicts().catch(() => []),
      fetchSafeAirspaceWarnings().catch(() => []),
      getAviationWeather().catch(() => null),
    ]);
    
    // Combine with static data
    // Convert aviation weather hazards to restrictions (if available)
    let weatherRestrictions: AirspaceRestriction[] = [];
    try {
      if (aviationWeatherData) {
        const hazards = weatherToHazards(aviationWeatherData);
        weatherRestrictions = mapWeatherHazardsToRestrictions(hazards);
      }
    } catch (e) {
      // Swallow any errors converting weather data to avoid raising in main flow
      console.warn('[airspace] weather mapping failed', e);
    }

    const allRestrictions: AirspaceRestriction[] = [
      ...PERMANENT_NO_FLY_ZONES,
      ...faaTfrs,
      ...icaoZones,
      ...safeAirspace,
      ...weatherRestrictions,
    ];
    
    const allWarzones: WarzoneData[] = [
      ...STATIC_WARZONES,
      ...acledConflicts,
    ];
    
    // Deduplicate by id
    const restrictionMap = new Map<string, AirspaceRestriction>();
    for (const r of allRestrictions) {
      if (!restrictionMap.has(r.id) || r.lastUpdated > restrictionMap.get(r.id)!.lastUpdated) {
        restrictionMap.set(r.id, r);
      }
    }
    
    const warzoneMap = new Map<string, WarzoneData>();
    for (const w of allWarzones) {
      if (!warzoneMap.has(w.id) || w.lastUpdated > warzoneMap.get(w.id)!.lastUpdated) {
        warzoneMap.set(w.id, w);
      }
    }
    
    const restrictions = Array.from(restrictionMap.values());
    const warzones = Array.from(warzoneMap.values());
    
    cachedData = {
      fetchedAt: new Date().toISOString(),
      restrictions,
      warzones,
      stats: {
        totalRestrictions: restrictions.length,
        activeWarzones: warzones.filter(w => w.intensity === 'high').length,
        tfrsActive: restrictions.filter(r => r.type === 'tfr').length,
        noFlyZones: restrictions.filter(r => r.type === 'prohibited' || r.type === 'no-fly').length,
      },
    };
    cachedAt = now;
    
    return cachedData;
  } catch (err) {
    console.error('[airspace] Fetch failed:', err);
    // Return cached data if available, otherwise static data
    return cachedData || {
      fetchedAt: new Date().toISOString(),
      restrictions: PERMANENT_NO_FLY_ZONES,
      warzones: STATIC_WARZONES,
      stats: {
        totalRestrictions: PERMANENT_NO_FLY_ZONES.length,
        activeWarzones: STATIC_WARZONES.filter(w => w.intensity === 'high').length,
        tfrsActive: 0,
        noFlyZones: PERMANENT_NO_FLY_ZONES.filter(r => r.type === 'prohibited').length,
      },
    };
  }
}

/**
 * Get restrictions by region
 */
export function getRestrictionsByRegion(data: AirspaceRestrictionsData): Record<string, AirspaceRestriction[]> {
  const regions: Record<string, AirspaceRestriction[]> = {};
  for (const r of data.restrictions) {
    const region = r.region || 'Other';
    if (!regions[region]) regions[region] = [];
    regions[region].push(r);
  }
  return regions;
}

/**
 * Get active warzones only
 */
export function getActiveWarzones(data: AirspaceRestrictionsData): WarzoneData[] {
  return data.warzones.filter(w => w.intensity === 'high' || w.intensity === 'medium');
}

/**
 * Check if a point is within a restricted zone
 */
export function isPointRestricted(
  lat: number,
  lon: number,
  data: AirspaceRestrictionsData
): { restricted: boolean; zones: AirspaceRestriction[] } {
  const matchingZones: AirspaceRestriction[] = [];
  
  for (const r of data.restrictions) {
    if (!r.isActive) continue;
    
    if (r.geometry.type === 'circle' && r.geometry.center && r.geometry.radiusNm) {
      const dist = haversineNm(lat, lon, r.geometry.center[1], r.geometry.center[0]);
      if (dist <= r.geometry.radiusNm) {
        matchingZones.push(r);
      }
    } else if (r.geometry.type === 'polygon' && r.geometry.coordinates) {
      if (pointInPolygon(lon, lat, r.geometry.coordinates)) {
        matchingZones.push(r);
      }
    }
  }
  
  return {
    restricted: matchingZones.length > 0,
    zones: matchingZones,
  };
}

// Helper functions
function classifyTfrSeverity(props: any): RestrictionSeverity {
  const reason = (props.reason || props.type || '').toLowerCase();
  if (reason.includes('presidential') || reason.includes('vip')) return 'critical';
  if (reason.includes('hazard') || reason.includes('fire')) return 'high';
  if (reason.includes('stadium') || reason.includes('event')) return 'medium';
  return 'low';
}

function extractGeometry(geo: any): AirspaceRestriction['geometry'] {
  if (!geo) return { type: 'circle', center: [0, 0], radiusNm: 5 };
  
  if (geo.type === 'Point') {
    return {
      type: 'circle',
      center: geo.coordinates as [number, number],
      radiusNm: 5,
    };
  }
  
  if (geo.type === 'Polygon' && geo.coordinates?.[0]) {
    return {
      type: 'polygon',
      coordinates: geo.coordinates[0] as [number, number][],
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

function createBoundingBox(lat: number, lon: number, radiusKm: number): [number, number][] {
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  
  return [
    [lon - lonDelta, lat + latDelta],
    [lon + lonDelta, lat + latDelta],
    [lon + lonDelta, lat - latDelta],
    [lon - lonDelta, lat - latDelta],
    [lon - lonDelta, lat + latDelta],
  ];
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0], yi = polygon[i]![1];
    const xj = polygon[j]![0], yj = polygon[j]![1];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Convert restrictions to GeoJSON for map rendering
 */
export function restrictionsToGeoJSON(data: AirspaceRestrictionsData): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  
  // Add restrictions
  for (const r of data.restrictions) {
    if (r.geometry.type === 'polygon' && r.geometry.coordinates) {
      features.push({
        type: 'Feature',
        properties: {
          id: r.id,
          name: r.name,
          type: r.type,
          severity: r.severity,
          source: r.source,
          country: r.country,
          reason: r.reason,
          kind: 'restriction',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [r.geometry.coordinates],
        },
      });
    } else if (r.geometry.type === 'circle' && r.geometry.center) {
      // Convert circle to polygon approximation
      const center = r.geometry.center;
      const radiusNm = r.geometry.radiusNm || 5;
      const points = createCirclePolygon(center[1], center[0], radiusNm * 1.852); // Convert nm to km
      
      features.push({
        type: 'Feature',
        properties: {
          id: r.id,
          name: r.name,
          type: r.type,
          severity: r.severity,
          source: r.source,
          country: r.country,
          reason: r.reason,
          kind: 'restriction',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [points],
        },
      });
    }
  }
  
  // Add warzones
  for (const w of data.warzones) {
    if (w.geometry.coordinates) {
      features.push({
        type: 'Feature',
        properties: {
          id: w.id,
          name: w.name,
          type: 'warzone',
          severity: w.intensity === 'high' ? 'critical' : w.intensity === 'medium' ? 'high' : 'medium',
          country: w.country,
          parties: w.parties.join(', '),
          description: w.description,
          kind: 'warzone',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [w.geometry.coordinates],
        },
      });
    }
  }
  
  return {
    type: 'FeatureCollection',
    features,
  };
}

function createCirclePolygon(lat: number, lon: number, radiusKm: number, points = 32): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i * 360 / points) * Math.PI / 180;
    const dLat = radiusKm / 111 * Math.cos(angle);
    const dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180)) * Math.sin(angle);
    coords.push([lon + dLon, lat + dLat]);
  }
  return coords;
}

/**
 * Convert aviation weather hazards to AirspaceRestriction entries.
 * Exported for unit testing.
 */
// Note: actual implementation lives in src/services/mapWeatherHazardsToRestrictions.js
export interface AircraftViolation {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  zone: {
    id: string;
    name: string;
    type: RestrictionType | 'warzone';
    severity: RestrictionSeverity | 'critical';
    country?: string;
  };
  violationType: 'in_warzone' | 'in_no_fly' | 'in_restricted' | 'in_danger';
  timestamp: Date;
}

/**
 * Check multiple aircraft positions against all restricted zones
 */
export function checkAircraftViolations(
  aircraft: Array<{ icao24: string; callsign: string; lat: number; lon: number; altitude?: number }>,
  data: AirspaceRestrictionsData
): AircraftViolation[] {
  const violations: AircraftViolation[] = [];
  
  for (const ac of aircraft) {
    // Skip aircraft without valid positions
    if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
    
    // Check against warzones (most critical)
    for (const zone of data.warzones) {
      if (zone.geometry.coordinates && pointInPolygon(ac.lon, ac.lat, zone.geometry.coordinates)) {
        violations.push({
          icao24: ac.icao24,
          callsign: ac.callsign || '',
          lat: ac.lat,
          lon: ac.lon,
          altitude: ac.altitude || 0,
          zone: {
            id: zone.id,
            name: zone.name,
            type: 'warzone',
            severity: 'critical',
            country: zone.country,
          },
          violationType: 'in_warzone',
          timestamp: new Date(),
        });
      }
    }
    
    // Check against no-fly zones
    for (const restriction of data.restrictions) {
      if (!restriction.isActive) continue;
      
      let isInZone = false;
      
      if (restriction.geometry.type === 'polygon' && restriction.geometry.coordinates) {
        isInZone = pointInPolygon(ac.lon, ac.lat, restriction.geometry.coordinates);
      } else if (restriction.geometry.type === 'circle' && restriction.geometry.center && restriction.geometry.radiusNm) {
        const dist = haversineNm(ac.lat, ac.lon, restriction.geometry.center[1], restriction.geometry.center[0]);
        isInZone = dist <= restriction.geometry.radiusNm;
      }
      
      if (isInZone) {
        let violationType: AircraftViolation['violationType'];
        if (restriction.type === 'prohibited' || restriction.type === 'no-fly') {
          violationType = 'in_no_fly';
        } else if (restriction.type === 'danger') {
          violationType = 'in_danger';
        } else {
          violationType = 'in_restricted';
        }
        
        violations.push({
          icao24: ac.icao24,
          callsign: ac.callsign || '',
          lat: ac.lat,
          lon: ac.lon,
          altitude: ac.altitude || 0,
          zone: {
            id: restriction.id,
            name: restriction.name,
            type: restriction.type,
            severity: restriction.severity,
            country: restriction.country,
          },
          violationType,
          timestamp: new Date(),
        });
      }
    }
  }
  
  return violations;
}

/**
 * Get all critical no-fly zones (for quick aircraft filtering)
 */
export function getCriticalNoFlyZones(): Array<{
  id: string;
  name: string;
  polygon: [number, number][];
}> {
  const zones: Array<{ id: string; name: string; polygon: [number, number][] }> = [];
  
  // Add permanent no-fly zones
  for (const r of PERMANENT_NO_FLY_ZONES) {
    if (r.severity !== 'critical') continue;
    
    if (r.geometry.type === 'polygon' && r.geometry.coordinates) {
      zones.push({
        id: r.id,
        name: r.name,
        polygon: r.geometry.coordinates,
      });
    } else if (r.geometry.type === 'circle' && r.geometry.center && r.geometry.radiusNm) {
      zones.push({
        id: r.id,
        name: r.name,
        polygon: createCirclePolygon(r.geometry.center[1], r.geometry.center[0], r.geometry.radiusNm * 1.852),
      });
    }
  }
  
  // Add static warzones
  for (const w of STATIC_WARZONES) {
    if (w.intensity === 'high' && w.geometry.coordinates) {
      zones.push({
        id: w.id,
        name: w.name,
        polygon: w.geometry.coordinates,
      });
    }
  }
  
  return zones;
}

/**
 * Quick check if a single point is in any critical zone
 */
export function isInCriticalZone(lat: number, lon: number): { inZone: boolean; zoneName?: string; zoneId?: string } {
  // Check warzones first (most critical)
  for (const w of STATIC_WARZONES) {
    if (w.intensity === 'high' && w.geometry.coordinates && pointInPolygon(lon, lat, w.geometry.coordinates)) {
      return { inZone: true, zoneName: w.name, zoneId: w.id };
    }
  }
  
  // Check no-fly zones
  for (const r of PERMANENT_NO_FLY_ZONES) {
    if (r.severity !== 'critical') continue;
    
    if (r.geometry.type === 'polygon' && r.geometry.coordinates) {
      if (pointInPolygon(lon, lat, r.geometry.coordinates)) {
        return { inZone: true, zoneName: r.name, zoneId: r.id };
      }
    } else if (r.geometry.type === 'circle' && r.geometry.center && r.geometry.radiusNm) {
      const dist = haversineNm(lat, lon, r.geometry.center[1], r.geometry.center[0]);
      if (dist <= r.geometry.radiusNm) {
        return { inZone: true, zoneName: r.name, zoneId: r.id };
      }
    }
  }
  
  return { inZone: false };
}
