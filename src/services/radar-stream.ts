/**
 * Radar Firehose — polls GET /api/radar/stream every 10 seconds
 * and provides flight data to the map and panels.
 */

export interface RadarFlight {
  flight_id: string;
  callsign?: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  vertical_rate?: number;
  squawk?: string;
  aircraft_type?: string;
  origin?: string;
  destination?: string;
  ml_classification: "Civilian" | "Military" | "Drone/UAV" | "Unknown";
  is_anomaly: boolean;
  anomaly_score: number;
  predicted_lat?: number;
  predicted_lon?: number;
  timestamp: string;
  dist_nm?: number;
  path?: Array<{ min: number; lat: number; lon: number }>;
}

/** Classification mapping from FastAPI to frontend enum */
const CLASS_MAP: Record<string, RadarFlight["ml_classification"]> = {
  "Commercial Plane": "Civilian",
  "Drone": "Drone/UAV",
  "Bird": "Unknown",
};

/** Normalize a FastAPI flight object into the RadarFlight shape */
function normalizeFlight(raw: any): RadarFlight {
  // If the data already has 'altitude' it's already in frontend format
  if (typeof raw.altitude === 'number' && typeof raw.ml_classification === 'string') {
    return raw as RadarFlight;
  }
  // FastAPI format → RadarFlight
  const path: RadarFlight['path'] = Array.isArray(raw.path) ? raw.path : undefined;
  return {
    flight_id: raw.flight_id ?? 'UNKNOWN',
    callsign: raw.callsign ?? undefined,
    lat: raw.lat,
    lon: raw.lon,
    altitude: raw.alt ?? raw.altitude ?? 0,
    speed: raw.speed ?? 0,
    heading: raw.hdg ?? raw.heading ?? 0,
    vertical_rate: raw.vertical_rate ?? 0,
    squawk: raw.squawk ?? undefined,
    aircraft_type: raw.aircraft_type ?? undefined,
    origin: raw.origin ?? undefined,
    destination: raw.destination ?? undefined,
    ml_classification: CLASS_MAP[raw.class] ?? raw.ml_classification ?? 'Unknown',
    is_anomaly: raw.is_anomaly ?? false,
    anomaly_score: typeof raw.risk === 'number' ? raw.risk / 100 : (raw.anomaly_score ?? 0),
    predicted_lat: path?.[0]?.lat ?? raw.predicted_lat ?? undefined,
    predicted_lon: path?.[0]?.lon ?? raw.predicted_lon ?? undefined,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    dist_nm: raw.dist_nm ?? undefined,
    path,
  };
}

export type RadarFlightCallback = (flights: RadarFlight[]) => void;

let _flights: RadarFlight[] = [];
let _listeners: Set<RadarFlightCallback> = new Set();
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _fetching = false;

async function fetchRadarData(): Promise<void> {
  if (_fetching) return;
  _fetching = true;
  try {
    const res = await fetch("/api/radar/stream");
    if (!res.ok) return;
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data?.flights ?? []);
    const flights: RadarFlight[] = raw.map(normalizeFlight);
    _flights = flights;
    for (const cb of _listeners) {
      try {
        cb(flights);
      } catch {
        /* listener error */
      }
    }
  } catch {
    // Network error — keep last known state
  } finally {
    _fetching = false;
  }
}

/** Start polling radar data every 10s */
export function startRadarStream(): void {
  if (_intervalId) return;
  void fetchRadarData();
  _intervalId = setInterval(() => void fetchRadarData(), 10_000);
}

/** Stop polling */
export function stopRadarStream(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

/** Subscribe to flight updates */
export function onRadarUpdate(cb: RadarFlightCallback): () => void {
  _listeners.add(cb);
  // Immediately fire with current data
  if (_flights.length > 0) {
    try {
      cb(_flights);
    } catch {
      /* ignore */
    }
  }
  return () => {
    _listeners.delete(cb);
  };
}

/** Get current flights snapshot */
export function getRadarFlights(): RadarFlight[] {
  return _flights;
}

/** Get high-risk flights (anomaly detected or high anomaly_score) */
export function getHighRiskFlights(): RadarFlight[] {
  return _flights.filter((f) => f.is_anomaly || f.anomaly_score > 0.7);
}
