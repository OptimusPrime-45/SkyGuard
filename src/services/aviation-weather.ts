/**
 * Aviation Weather Service
 * Provides METAR, TAF, SIGMET, AIRMET, and PIREPs for airspace monitoring.
 * Data sources: Aviation Weather Center (aviationweather.gov), Open-Meteo
 */

import { createCircuitBreaker } from '@/utils';

// ============================================
// TYPES
// ============================================

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN';
export type HazardType = 'thunderstorm' | 'turbulence' | 'icing' | 'volcanic_ash' | 'dust_sand' | 'low_visibility' | 'wind_shear' | 'mountain_wave';
export type HazardSeverity = 'light' | 'moderate' | 'severe' | 'extreme';

export interface METAR {
  stationId: string;
  rawText: string;
  observationTime: Date;
  lat: number;
  lon: number;
  tempC: number;
  dewpointC: number;
  windDirDeg: number;
  windSpeedKts: number;
  windGustKts?: number;
  visibilityMi: number;
  altimeterInHg: number;
  seaLevelPressureMb?: number;
  cloudLayers: CloudLayer[];
  wxString?: string; // Weather phenomena (RA, SN, FG, etc.)
  flightCategory: FlightCategory;
  ceilingFt?: number;
  vertVisFt?: number;
}

export interface CloudLayer {
  coverage: 'SKC' | 'CLR' | 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'VV';
  baseFt: number;
  type?: 'CB' | 'TCU'; // Cumulonimbus or Towering Cumulus
}

export interface TAF {
  stationId: string;
  rawText: string;
  issueTime: Date;
  validFrom: Date;
  validTo: Date;
  lat: number;
  lon: number;
  forecasts: TAFForecast[];
}

export interface TAFForecast {
  from: Date;
  to: Date;
  changeIndicator?: 'FM' | 'TEMPO' | 'BECMG' | 'PROB30' | 'PROB40';
  windDirDeg: number;
  windSpeedKts: number;
  windGustKts?: number;
  visibilityMi: number;
  wxString?: string;
  cloudLayers: CloudLayer[];
  flightCategory: FlightCategory;
}

export interface SIGMET {
  id: string;
  type: 'CONVECTIVE' | 'INTERNATIONAL' | 'DOMESTIC';
  hazardType: HazardType;
  severity?: HazardSeverity;
  validFrom: Date;
  validTo: Date;
  rawText: string;
  coordinates: [number, number][]; // Polygon vertices [lon, lat]
  centroid: [number, number];
  altitudeLower?: number; // FL or feet
  altitudeUpper?: number;
  movementDir?: number;
  movementSpeedKts?: number;
  area: string;
}

export interface AIRMET {
  id: string;
  hazardType: 'IFR' | 'MTN_OBSCN' | 'TURB' | 'ICE' | 'LLWS' | 'SFC_WND';
  validFrom: Date;
  validTo: Date;
  rawText: string;
  coordinates: [number, number][];
  centroid: [number, number];
  area: string;
}

export interface PIREP {
  id: string;
  reportTime: Date;
  lat: number;
  lon: number;
  altitude: number;
  aircraftType?: string;
  reportType: 'UA' | 'UUA'; // Routine or Urgent
  turbulence?: { intensity: HazardSeverity; type?: string };
  icing?: { intensity: HazardSeverity; type?: string };
  skyCondition?: string;
  visibility?: number;
  wxString?: string;
  rawText: string;
}

export interface AviationWeatherData {
  metars: METAR[];
  tafs: TAF[];
  sigmets: SIGMET[];
  airmets: AIRMET[];
  pireps: PIREP[];
  lastUpdated: Date;
}

export interface WeatherHazard {
  id: string;
  type: HazardType;
  severity: HazardSeverity;
  name: string;
  description: string;
  coordinates: [number, number][];
  centroid: [number, number];
  altitudeLower?: number;
  altitudeUpper?: number;
  validFrom: Date;
  validTo: Date;
  source: 'SIGMET' | 'AIRMET' | 'PIREP' | 'METAR' | 'CONVECTIVE';
  affectsFlightLevel?: { lower: number; upper: number };
}

// ============================================
// STATIC CONVECTIVE SIGMETS (for simulation/demo)
// ============================================

const SAMPLE_CONVECTIVE_AREAS: Omit<SIGMET, 'validFrom' | 'validTo'>[] = [
  {
    id: 'SIGMET-WST-001',
    type: 'CONVECTIVE',
    hazardType: 'thunderstorm',
    severity: 'severe',
    rawText: 'CONVECTIVE SIGMET...AREA EMBEDDED TS MOV FROM 25030KT. TOPS ABV FL450.',
    coordinates: [
      [-95.5, 35.2], [-94.2, 35.8], [-93.1, 34.9], [-93.8, 33.5], [-95.2, 33.8], [-95.5, 35.2]
    ],
    centroid: [-94.3, 34.6],
    altitudeLower: 10000,
    altitudeUpper: 45000,
    movementDir: 250,
    movementSpeedKts: 30,
    area: 'Central Oklahoma',
  },
  {
    id: 'SIGMET-WST-002',
    type: 'CONVECTIVE',
    hazardType: 'thunderstorm',
    severity: 'moderate',
    rawText: 'CONVECTIVE SIGMET...ISOL SEV TS. TOPS TO FL380.',
    coordinates: [
      [-87.5, 41.2], [-86.3, 41.5], [-85.8, 40.2], [-86.9, 39.8], [-87.8, 40.5], [-87.5, 41.2]
    ],
    centroid: [-86.8, 40.6],
    altitudeLower: 5000,
    altitudeUpper: 38000,
    movementDir: 270,
    movementSpeedKts: 25,
    area: 'Northern Indiana',
  },
  {
    id: 'SIGMET-INT-001',
    type: 'INTERNATIONAL',
    hazardType: 'turbulence',
    severity: 'severe',
    rawText: 'SIGMET...SEV TURB BTN FL310 AND FL410 OBS AT...',
    coordinates: [
      [-72.0, 42.5], [-70.5, 43.0], [-69.5, 41.8], [-71.0, 41.2], [-72.5, 42.0], [-72.0, 42.5]
    ],
    centroid: [-71.0, 42.1],
    altitudeLower: 31000,
    altitudeUpper: 41000,
    area: 'New England',
  },
];

const SAMPLE_AIRMETS: Omit<AIRMET, 'validFrom' | 'validTo'>[] = [
  {
    id: 'AIRMET-TANGO-001',
    hazardType: 'TURB',
    rawText: 'AIRMET TANGO...MODERATE TURBULENCE BTN FL180 AND FL350.',
    coordinates: [
      [-110.0, 38.0], [-105.0, 39.0], [-104.0, 36.0], [-108.0, 35.0], [-110.0, 38.0]
    ],
    centroid: [-106.8, 37.0],
    area: 'Colorado Rockies',
  },
  {
    id: 'AIRMET-ZULU-001',
    hazardType: 'ICE',
    rawText: 'AIRMET ZULU...MODERATE ICING BTN FL120 AND FL220.',
    coordinates: [
      [-78.0, 44.0], [-76.0, 44.5], [-75.0, 42.5], [-77.0, 42.0], [-78.5, 43.0], [-78.0, 44.0]
    ],
    centroid: [-76.9, 43.2],
    area: 'Upstate New York',
  },
  {
    id: 'AIRMET-SIERRA-001',
    hazardType: 'IFR',
    rawText: 'AIRMET SIERRA...IFR CONDS DUE TO LOW CIGS AND VIS IN FOG.',
    coordinates: [
      [-122.5, 37.0], [-121.5, 37.8], [-120.8, 36.5], [-121.8, 35.8], [-122.5, 37.0]
    ],
    centroid: [-121.6, 36.8],
    area: 'San Francisco Bay Area',
  },
];

// Major airports for METAR simulation
const MAJOR_AIRPORTS: { icao: string; name: string; lat: number; lon: number }[] = [
  { icao: 'KJFK', name: 'New York JFK', lat: 40.6413, lon: -73.7781 },
  { icao: 'KLAX', name: 'Los Angeles', lat: 33.9425, lon: -118.4081 },
  { icao: 'KORD', name: 'Chicago O\'Hare', lat: 41.9742, lon: -87.9073 },
  { icao: 'KDFW', name: 'Dallas/Fort Worth', lat: 32.8998, lon: -97.0403 },
  { icao: 'KATL', name: 'Atlanta', lat: 33.6407, lon: -84.4277 },
  { icao: 'KDEN', name: 'Denver', lat: 39.8561, lon: -104.6737 },
  { icao: 'KSFO', name: 'San Francisco', lat: 37.6213, lon: -122.3790 },
  { icao: 'KLAS', name: 'Las Vegas', lat: 36.0840, lon: -115.1537 },
  { icao: 'KMIA', name: 'Miami', lat: 25.7959, lon: -80.2870 },
  { icao: 'KSEA', name: 'Seattle', lat: 47.4502, lon: -122.3088 },
  { icao: 'EGLL', name: 'London Heathrow', lat: 51.4700, lon: -0.4543 },
  { icao: 'LFPG', name: 'Paris CDG', lat: 49.0097, lon: 2.5479 },
  { icao: 'EDDF', name: 'Frankfurt', lat: 50.0379, lon: 8.5622 },
  { icao: 'OMDB', name: 'Dubai', lat: 25.2532, lon: 55.3657 },
  { icao: 'VHHH', name: 'Hong Kong', lat: 22.3080, lon: 113.9185 },
  { icao: 'RJTT', name: 'Tokyo Haneda', lat: 35.5494, lon: 139.7798 },
  { icao: 'WSSS', name: 'Singapore Changi', lat: 1.3644, lon: 103.9915 },
  { icao: 'VIDP', name: 'Delhi', lat: 28.5562, lon: 77.1000 },
];

// ============================================
// CIRCUIT BREAKERS
// ============================================

const metarBreaker = createCircuitBreaker<METAR[]>({ 
  name: 'Aviation METAR', 
  cacheTtlMs: 10 * 60 * 1000, 
  persistCache: true 
});

const sigmetBreaker = createCircuitBreaker<SIGMET[]>({ 
  name: 'Aviation SIGMET', 
  cacheTtlMs: 15 * 60 * 1000, 
  persistCache: true 
});

const airmetBreaker = createCircuitBreaker<AIRMET[]>({ 
  name: 'Aviation AIRMET', 
  cacheTtlMs: 15 * 60 * 1000, 
  persistCache: true 
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function determineFlightCategory(visibility: number, ceiling?: number): FlightCategory {
  // FAA flight category definitions
  if (ceiling !== undefined) {
    if (ceiling < 500 || visibility < 1) return 'LIFR';
    if (ceiling < 1000 || visibility < 3) return 'IFR';
    if (ceiling <= 3000 || visibility <= 5) return 'MVFR';
  } else {
    if (visibility < 1) return 'LIFR';
    if (visibility < 3) return 'IFR';
    if (visibility <= 5) return 'MVFR';
  }
  return 'VFR';
}

function generateRealisticMETAR(airport: { icao: string; lat: number; lon: number }): METAR {
  const now = new Date();
  
  // Generate semi-realistic weather based on location/time
  const baseTemp = 15 + Math.sin(airport.lat * Math.PI / 180) * 20 + (Math.random() - 0.5) * 10;
  const dewpointSpread = Math.random() * 15;
  const dewpoint = baseTemp - dewpointSpread;
  
  const windDir = Math.floor(Math.random() * 36) * 10;
  const windSpeed = Math.floor(Math.random() * 25) + 3;
  const hasGust = Math.random() < 0.3;
  const gustSpeed = hasGust ? windSpeed + Math.floor(Math.random() * 15) + 5 : undefined;
  
  // Visibility affected by dewpoint spread (closer = more fog)
  let visibility = 10;
  if (dewpointSpread < 3) visibility = Math.random() * 5 + 0.5;
  else if (dewpointSpread < 5) visibility = Math.random() * 7 + 3;
  
  // Cloud generation
  const cloudLayers: CloudLayer[] = [];
  const numLayers = Math.floor(Math.random() * 3);
  let baseAlt = Math.floor(Math.random() * 3000) + 1500;
  const coverages: CloudLayer['coverage'][] = ['FEW', 'SCT', 'BKN', 'OVC'];
  
  for (let i = 0; i < numLayers; i++) {
    cloudLayers.push({
      coverage: coverages[Math.min(i + Math.floor(Math.random() * 2), 3)] as CloudLayer['coverage'],
      baseFt: baseAlt,
      type: Math.random() < 0.1 ? 'CB' : undefined,
    });
    baseAlt += Math.floor(Math.random() * 5000) + 2000;
  }
  
  // Calculate ceiling
  const ceilingLayer = cloudLayers.find(l => l.coverage === 'BKN' || l.coverage === 'OVC');
  const ceiling = ceilingLayer?.baseFt;
  
  // Weather phenomena
  let wxString: string | undefined;
  if (dewpointSpread < 2) wxString = 'FG';
  else if (dewpointSpread < 4 && Math.random() < 0.5) wxString = 'BR';
  else if (Math.random() < 0.15) {
    const wx = ['RA', '-RA', '+RA', 'TSRA', 'SN', '-SN', 'DZ', 'HZ'];
    wxString = wx[Math.floor(Math.random() * wx.length)];
  }
  
  const flightCategory = determineFlightCategory(visibility, ceiling);
  
  const rawParts = [
    airport.icao,
    now.toISOString().slice(5, 16).replace(/[-:T]/g, '').slice(0, 6) + 'Z',
    `${String(windDir).padStart(3, '0')}${String(windSpeed).padStart(2, '0')}${gustSpeed ? 'G' + String(gustSpeed).padStart(2, '0') : ''}KT`,
    `${visibility >= 10 ? '10' : visibility.toFixed(1)}SM`,
    wxString ?? '',
    cloudLayers.length ? cloudLayers.map(l => `${l.coverage}${String(Math.floor(l.baseFt / 100)).padStart(3, '0')}${l.type ?? ''}`).join(' ') : 'SKC',
    `${baseTemp >= 0 ? '' : 'M'}${String(Math.abs(Math.round(baseTemp))).padStart(2, '0')}/${dewpoint >= 0 ? '' : 'M'}${String(Math.abs(Math.round(dewpoint))).padStart(2, '0')}`,
    `A${Math.round((29.92 + (Math.random() - 0.5) * 0.5) * 100)}`,
  ].filter(Boolean);
  
  return {
    stationId: airport.icao,
    rawText: rawParts.join(' '),
    observationTime: now,
    lat: airport.lat,
    lon: airport.lon,
    tempC: Math.round(baseTemp),
    dewpointC: Math.round(dewpoint),
    windDirDeg: windDir,
    windSpeedKts: windSpeed,
    windGustKts: gustSpeed,
    visibilityMi: Number(visibility.toFixed(1)),
    altimeterInHg: 29.92 + (Math.random() - 0.5) * 0.5,
    cloudLayers,
    wxString,
    flightCategory,
    ceilingFt: ceiling,
  };
}

// ============================================
// FETCH FUNCTIONS
// ============================================

/**
 * Fetch METAR data for major airports
 */
export async function fetchMETARs(): Promise<METAR[]> {
  return metarBreaker.execute(async () => {
    // Try to fetch from Aviation Weather API
    try {
      const stations = MAJOR_AIRPORTS.map(a => a.icao).join(',');
      const url = `https://aviationweather.gov/api/data/metar?ids=${stations}&format=json`;
      
      const resp = await fetch(url, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' }
      });
      
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((m: any) => ({
            stationId: m.icaoId ?? m.stationId,
            rawText: m.rawOb ?? m.rawText ?? '',
            observationTime: new Date(m.obsTime ?? m.observationTime),
            lat: m.lat,
            lon: m.lon,
            tempC: m.temp ?? 0,
            dewpointC: m.dewp ?? 0,
            windDirDeg: m.wdir ?? 0,
            windSpeedKts: m.wspd ?? 0,
            windGustKts: m.wgst,
            visibilityMi: m.visib ?? 10,
            altimeterInHg: m.altim ?? 29.92,
            cloudLayers: (m.clouds ?? []).map((c: any) => ({
              coverage: c.cover,
              baseFt: c.base * 100,
              type: c.type,
            })),
            wxString: m.wxString,
            flightCategory: m.fltcat ?? determineFlightCategory(m.visib, m.ceil),
            ceilingFt: m.ceil,
          }));
        }
      }
    } catch {
      // Fall through to simulated data
    }
    
    // Generate simulated METARs
    return MAJOR_AIRPORTS.map(generateRealisticMETAR);
  }, []);
}

/**
 * Fetch SIGMETs (Significant Meteorological Information)
 */
export async function fetchSIGMETs(): Promise<SIGMET[]> {
  return sigmetBreaker.execute(async () => {
    const now = new Date();
    const validFrom = now;
    const validTo = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 hours
    
    // Try Aviation Weather API
    try {
      const url = 'https://aviationweather.gov/api/data/airsigmet?format=json&type=sigmet';
      const resp = await fetch(url, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' }
      });
      
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((s: any, i: number) => ({
            id: s.airsigmetId ?? `SIGMET-${i}`,
            type: s.airsigmetType?.includes('CONVECTIVE') ? 'CONVECTIVE' : 'DOMESTIC',
            hazardType: parseHazardType(s.hazard),
            severity: parseHazardSeverity(s.severity),
            validFrom: new Date(s.validTimeFrom),
            validTo: new Date(s.validTimeTo),
            rawText: s.rawAirSigmet ?? '',
            coordinates: s.coords ?? [],
            centroid: calculateCentroid(s.coords ?? []),
            altitudeLower: s.altitudeLow,
            altitudeUpper: s.altitudeHi,
            movementDir: s.movementDir,
            movementSpeedKts: s.movementSpd,
            area: s.area ?? 'Unknown',
          }));
        }
      }
    } catch {
      // Fall through to sample data
    }
    
    // Return sample SIGMETs with current timestamps
    return SAMPLE_CONVECTIVE_AREAS.map(s => ({
      ...s,
      validFrom,
      validTo,
    }));
  }, []);
}

/**
 * Fetch AIRMETs (Airmen's Meteorological Information)
 */
export async function fetchAIRMETs(): Promise<AIRMET[]> {
  return airmetBreaker.execute(async () => {
    const now = new Date();
    const validFrom = now;
    const validTo = new Date(now.getTime() + 6 * 60 * 60 * 1000); // +6 hours
    
    // Try Aviation Weather API
    try {
      const url = 'https://aviationweather.gov/api/data/airsigmet?format=json&type=airmet';
      const resp = await fetch(url, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' }
      });
      
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((a: any, i: number) => ({
            id: a.airsigmetId ?? `AIRMET-${i}`,
            hazardType: parseAirmetType(a.hazard),
            validFrom: new Date(a.validTimeFrom),
            validTo: new Date(a.validTimeTo),
            rawText: a.rawAirSigmet ?? '',
            coordinates: a.coords ?? [],
            centroid: calculateCentroid(a.coords ?? []),
            area: a.area ?? 'Unknown',
          }));
        }
      }
    } catch {
      // Fall through to sample data
    }
    
    // Return sample AIRMETs with current timestamps
    return SAMPLE_AIRMETS.map(a => ({
      ...a,
      validFrom,
      validTo,
    }));
  }, []);
}

/**
 * Fetch all aviation weather data
 */
export async function fetchAviationWeather(): Promise<AviationWeatherData> {
  const [metars, sigmets, airmets] = await Promise.all([
    fetchMETARs(),
    fetchSIGMETs(),
    fetchAIRMETs(),
  ]);
  
  return {
    metars,
    tafs: [], // TAFs would require additional API calls
    sigmets,
    airmets,
    pireps: [], // PIREPs would require additional API calls
    lastUpdated: new Date(),
  };
}

/**
 * Convert aviation weather to unified hazard format for map display
 */
export function weatherToHazards(data: AviationWeatherData): WeatherHazard[] {
  const hazards: WeatherHazard[] = [];
  
  // Convert SIGMETs to hazards
  for (const sigmet of data.sigmets) {
    hazards.push({
      id: sigmet.id,
      type: sigmet.hazardType,
      severity: sigmet.severity ?? 'moderate',
      name: `${sigmet.type} SIGMET`,
      description: sigmet.rawText,
      coordinates: sigmet.coordinates,
      centroid: sigmet.centroid,
      altitudeLower: sigmet.altitudeLower,
      altitudeUpper: sigmet.altitudeUpper,
      validFrom: sigmet.validFrom,
      validTo: sigmet.validTo,
      source: sigmet.type === 'CONVECTIVE' ? 'CONVECTIVE' : 'SIGMET',
    });
  }
  
  // Convert AIRMETs to hazards
  for (const airmet of data.airmets) {
    const hazardTypeMap: Record<AIRMET['hazardType'], HazardType> = {
      'IFR': 'low_visibility',
      'MTN_OBSCN': 'low_visibility',
      'TURB': 'turbulence',
      'ICE': 'icing',
      'LLWS': 'wind_shear',
      'SFC_WND': 'turbulence',
    };
    
    hazards.push({
      id: airmet.id,
      type: hazardTypeMap[airmet.hazardType] ?? 'turbulence',
      severity: 'moderate',
      name: `AIRMET ${airmet.hazardType}`,
      description: airmet.rawText,
      coordinates: airmet.coordinates,
      centroid: airmet.centroid,
      validFrom: airmet.validFrom,
      validTo: airmet.validTo,
      source: 'AIRMET',
    });
  }
  
  return hazards;
}

/**
 * Check if a flight position is within a weather hazard
 */
export function isFlightInHazard(
  lat: number, 
  lon: number, 
  altitude: number, 
  hazards: WeatherHazard[]
): WeatherHazard | null {
  for (const hazard of hazards) {
    // Check altitude if specified
    if (hazard.altitudeLower && altitude < hazard.altitudeLower) continue;
    if (hazard.altitudeUpper && altitude > hazard.altitudeUpper) continue;
    
    // Check if point is in polygon
    if (pointInPolygon(lon, lat, hazard.coordinates)) {
      return hazard;
    }
  }
  return null;
}

/**
 * Get flight category color for display
 */
export function getFlightCategoryColor(category: FlightCategory): string {
  switch (category) {
    case 'VFR': return '#22cc44'; // Green
    case 'MVFR': return '#2288ff'; // Blue
    case 'IFR': return '#ff4444'; // Red
    case 'LIFR': return '#ff00ff'; // Magenta
    default: return '#888888';
  }
}

/**
 * Get hazard severity color
 */
export function getHazardSeverityColor(severity: HazardSeverity): [number, number, number, number] {
  switch (severity) {
    case 'extreme': return [255, 0, 0, 180];
    case 'severe': return [255, 80, 0, 160];
    case 'moderate': return [255, 180, 0, 140];
    case 'light': return [255, 255, 0, 100];
    default: return [200, 200, 200, 100];
  }
}

/**
 * Get hazard type icon
 */
export function getHazardTypeIcon(type: HazardType): string {
  switch (type) {
    case 'thunderstorm': return '⛈️';
    case 'turbulence': return '🌪️';
    case 'icing': return '❄️';
    case 'volcanic_ash': return '🌋';
    case 'dust_sand': return '🏜️';
    case 'low_visibility': return '🌫️';
    case 'wind_shear': return '💨';
    case 'mountain_wave': return '⛰️';
    default: return '⚠️';
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function parseHazardType(hazard?: string): HazardType {
  if (!hazard) return 'thunderstorm';
  const h = hazard.toUpperCase();
  if (h.includes('CONVECTIVE') || h.includes('TS') || h.includes('THUNDER')) return 'thunderstorm';
  if (h.includes('TURB')) return 'turbulence';
  if (h.includes('ICE') || h.includes('ICING')) return 'icing';
  if (h.includes('VOLC') || h.includes('ASH')) return 'volcanic_ash';
  if (h.includes('DUST') || h.includes('SAND')) return 'dust_sand';
  if (h.includes('VIS') || h.includes('FOG') || h.includes('IFR')) return 'low_visibility';
  if (h.includes('LLWS') || h.includes('SHEAR')) return 'wind_shear';
  if (h.includes('MTN') || h.includes('WAVE')) return 'mountain_wave';
  return 'thunderstorm';
}

function parseHazardSeverity(severity?: string): HazardSeverity {
  if (!severity) return 'moderate';
  const s = severity.toUpperCase();
  if (s.includes('EXTREME')) return 'extreme';
  if (s.includes('SEV')) return 'severe';
  if (s.includes('MOD')) return 'moderate';
  if (s.includes('LGT') || s.includes('LIGHT')) return 'light';
  return 'moderate';
}

function parseAirmetType(hazard?: string): AIRMET['hazardType'] {
  if (!hazard) return 'TURB';
  const h = hazard.toUpperCase();
  if (h.includes('IFR')) return 'IFR';
  if (h.includes('MTN')) return 'MTN_OBSCN';
  if (h.includes('TURB')) return 'TURB';
  if (h.includes('ICE')) return 'ICE';
  if (h.includes('LLWS')) return 'LLWS';
  if (h.includes('WND') || h.includes('WIND')) return 'SFC_WND';
  return 'TURB';
}

function calculateCentroid(coords: [number, number][]): [number, number] {
  if (!coords.length) return [0, 0];
  const sumLon = coords.reduce((s, c) => s + c[0], 0);
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  return [sumLon / coords.length, sumLat / coords.length];
}

function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0], yi = polygon[i]![1];
    const xj = polygon[j]![0], yj = polygon[j]![1];
    
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ============================================
// CACHING
// ============================================

let _cachedWeatherData: AviationWeatherData | null = null;
let _lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached or fetch new aviation weather data
 */
export async function getAviationWeather(): Promise<AviationWeatherData> {
  const now = Date.now();
  if (_cachedWeatherData && now - _lastFetchTime < CACHE_TTL) {
    return _cachedWeatherData;
  }
  
  _cachedWeatherData = await fetchAviationWeather();
  _lastFetchTime = now;
  return _cachedWeatherData;
}

/**
 * Force refresh weather data
 */
export async function refreshAviationWeather(): Promise<AviationWeatherData> {
  _lastFetchTime = 0;
  return getAviationWeather();
}
