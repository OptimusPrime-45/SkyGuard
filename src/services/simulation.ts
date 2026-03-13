/**
 * Simulation Mode — Generates realistic emergency/anomaly scenarios
 * for demonstration and testing when live data is nominal.
 */
import type { RadarFlight } from './radar-stream';

export interface SimulatedAlert {
  id: string;
  type: 'intrusion' | 'emergency' | 'squawk' | 'anomaly' | 'drone' | 'restricted_zone' | 'intercept';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  flightId: string;
  timestamp: Date;
  location: { lat: number; lon: number };
}

// Simulated scenario templates
const EMERGENCY_SCENARIOS = [
  {
    type: 'squawk' as const,
    severity: 'critical' as const,
    title: 'SQUAWK 7700 - Emergency',
    description: 'Aircraft declaring general emergency. Possible engine failure.',
    squawk: '7700',
    class: 'Civilian' as const,
    riskBoost: 0.95,
  },
  {
    type: 'squawk' as const,
    severity: 'critical' as const,
    title: 'SQUAWK 7500 - Hijack',
    description: 'Aircraft transmitting hijack code. Authorities notified.',
    squawk: '7500',
    class: 'Civilian' as const,
    riskBoost: 0.99,
  },
  {
    type: 'squawk' as const,
    severity: 'high' as const,
    title: 'SQUAWK 7600 - Radio Failure',
    description: 'Aircraft reporting communication failure via transponder.',
    squawk: '7600',
    class: 'Civilian' as const,
    riskBoost: 0.78,
  },
  {
    type: 'drone' as const,
    severity: 'critical' as const,
    title: 'Unauthorized Drone - Critical Zone',
    description: 'Unidentified UAV detected near restricted airspace. Possible security threat.',
    squawk: '0000',
    class: 'Drone/UAV' as const,
    riskBoost: 0.92,
  },
  {
    type: 'intrusion' as const,
    severity: 'high' as const,
    title: 'Airspace Intrusion',
    description: 'Aircraft entered restricted zone without clearance.',
    squawk: '1200',
    class: 'Unknown' as const,
    riskBoost: 0.85,
  },
  {
    type: 'anomaly' as const,
    severity: 'high' as const,
    title: 'Anomalous Flight Pattern',
    description: 'Irregular trajectory detected. Possible evasive maneuvers.',
    squawk: '1200',
    class: 'Unknown' as const,
    riskBoost: 0.88,
  },
  {
    type: 'restricted_zone' as const,
    severity: 'critical' as const,
    title: 'No-Fly Zone Violation',
    description: 'Aircraft detected in prohibited airspace over sensitive area.',
    squawk: '7777',
    class: 'Military' as const,
    riskBoost: 0.94,
  },
  {
    type: 'intercept' as const,
    severity: 'high' as const,
    title: 'Military Intercept Active',
    description: 'Military aircraft scrambled to intercept unresponsive target.',
    squawk: '7777',
    class: 'Military' as const,
    riskBoost: 0.87,
  },
];

// Realistic coordinates for simulation (major airspace regions)
const SIMULATION_REGIONS = [
  { name: 'North Atlantic', lat: 45.0, lon: -40.0, variance: 10 },
  { name: 'European Airspace', lat: 48.5, lon: 10.0, variance: 8 },
  { name: 'Middle East', lat: 33.0, lon: 44.0, variance: 6 },
  { name: 'South Asia', lat: 28.5, lon: 77.0, variance: 5 },
  { name: 'East Asia', lat: 35.0, lon: 135.0, variance: 8 },
  { name: 'South China Sea', lat: 15.0, lon: 115.0, variance: 5 },
  { name: 'North America', lat: 40.0, lon: -100.0, variance: 15 },
];

// Simulation state
let _simulationActive = false;
let _simulatedFlights: RadarFlight[] = [];
let _simulatedAlerts: SimulatedAlert[] = [];
let _listeners: Set<(flights: RadarFlight[], alerts: SimulatedAlert[]) => void> = new Set();
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _blinkState = false;
let _blinkIntervalId: ReturnType<typeof setInterval> | null = null;

// Generate random flight ID
function generateFlightId(): string {
  const prefixes = ['UAV', 'UNK', 'SIM', 'THR', 'EMG', 'MIL'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}${num}`;
}

// Generate random callsign
function generateCallsign(type: string): string {
  if (type === 'Drone/UAV') return `DRONE${Math.floor(Math.random() * 99)}`;
  if (type === 'Military') {
    const prefixes = ['VIPER', 'HAWK', 'EAGLE', 'SHADOW', 'PHANTOM'];
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${Math.floor(Math.random() * 99)}`;
  }
  const airlines = ['UAL', 'DAL', 'AAL', 'SWA', 'BAW', 'AFR', 'DLH', 'UAE'];
  return `${airlines[Math.floor(Math.random() * airlines.length)]}${Math.floor(Math.random() * 9000) + 100}`;
}

// Generate realistic trajectory path
function generatePath(lat: number, lon: number, heading: number, speed: number): RadarFlight['path'] {
  const path: Array<{ min: number; lat: number; lon: number }> = [];
  const nmPerMin = speed / 60;
  
  for (let min = 1; min <= 3; min++) {
    const distNm = nmPerMin * min;
    const radians = (heading * Math.PI) / 180;
    const dLat = distNm * Math.cos(radians) / 60;
    const dLon = distNm * Math.sin(radians) / (60 * Math.cos(lat * Math.PI / 180));
    path.push({
      min,
      lat: lat + dLat + (Math.random() - 0.5) * 0.01,
      lon: lon + dLon + (Math.random() - 0.5) * 0.01,
    });
  }
  return path;
}

// Generate a simulated emergency flight
function generateEmergencyFlight(baseFlight?: RadarFlight): RadarFlight {
  const scenarioIdx = Math.floor(Math.random() * EMERGENCY_SCENARIOS.length);
  const scenario = EMERGENCY_SCENARIOS[scenarioIdx]!;
  const regionIdx = Math.floor(Math.random() * SIMULATION_REGIONS.length);
  const region = SIMULATION_REGIONS[regionIdx]!;
  
  const lat = baseFlight?.lat ?? (region.lat + (Math.random() - 0.5) * region.variance);
  const lon = baseFlight?.lon ?? (region.lon + (Math.random() - 0.5) * region.variance);
  const heading = Math.floor(Math.random() * 360);
  const speed = scenario.class === 'Drone/UAV' ? Math.floor(Math.random() * 80) + 20 : Math.floor(Math.random() * 400) + 200;
  const altitude = scenario.class === 'Drone/UAV' ? Math.floor(Math.random() * 3000) + 100 : Math.floor(Math.random() * 35000) + 5000;
  
  const flightId = baseFlight?.flight_id ?? generateFlightId();
  
  return {
    flight_id: flightId,
    callsign: baseFlight?.callsign ?? generateCallsign(scenario.class),
    lat,
    lon,
    altitude,
    speed,
    heading,
    vertical_rate: (Math.random() - 0.5) * 2000,
    squawk: scenario.squawk,
    aircraft_type: scenario.class === 'Drone/UAV' ? 'UAV' : scenario.class === 'Military' ? 'F16' : 'B738',
    origin: 'UNKNOWN',
    destination: 'UNKNOWN',
    ml_classification: scenario.class,
    is_anomaly: true,
    anomaly_score: scenario.riskBoost + (Math.random() * 0.05),
    predicted_lat: lat + 0.1,
    predicted_lon: lon + 0.1,
    timestamp: new Date().toISOString(),
    path: generatePath(lat, lon, heading, speed),
  };
}

// Generate a corresponding alert for a flight
function generateAlertForFlight(flight: RadarFlight): SimulatedAlert {
  const foundScenario = EMERGENCY_SCENARIOS.find(s => s.squawk === flight.squawk);
  const scenario = foundScenario ?? EMERGENCY_SCENARIOS[0]!;
  
  return {
    id: `alert-${flight.flight_id}-${Date.now()}`,
    type: scenario.type,
    severity: scenario.severity,
    title: scenario.title,
    description: scenario.description,
    flightId: flight.flight_id,
    timestamp: new Date(),
    location: { lat: flight.lat, lon: flight.lon },
  };
}

/**
 * Start simulation mode — generates fake emergencies
 */
export function startSimulation(): void {
  if (_simulationActive) return;
  _simulationActive = true;
  
  // Generate initial batch of emergencies (3-5)
  const count = Math.floor(Math.random() * 3) + 3;
  _simulatedFlights = [];
  _simulatedAlerts = [];
  
  for (let i = 0; i < count; i++) {
    const flight = generateEmergencyFlight();
    _simulatedFlights.push(flight);
    _simulatedAlerts.push(generateAlertForFlight(flight));
  }
  
  // Start blinking animation state
  _blinkState = true;
  _blinkIntervalId = setInterval(() => {
    _blinkState = !_blinkState;
  }, 500);
  
  // Periodic updates — simulate movement + occasional new events
  _intervalId = setInterval(() => {
    // Update positions (simulate movement)
    _simulatedFlights = _simulatedFlights.map(f => {
      const nmPerSec = f.speed / 3600;
      const distNm = nmPerSec * 5; // 5 seconds of movement
      const radians = (f.heading * Math.PI) / 180;
      const dLat = distNm * Math.cos(radians) / 60;
      const dLon = distNm * Math.sin(radians) / (60 * Math.cos(f.lat * Math.PI / 180));
      
      // Slight heading variation
      const newHeading = (f.heading + (Math.random() - 0.5) * 5 + 360) % 360;
      
      return {
        ...f,
        lat: f.lat + dLat,
        lon: f.lon + dLon,
        heading: newHeading,
        altitude: f.altitude + (Math.random() - 0.5) * 100,
        anomaly_score: Math.min(1, Math.max(0.7, f.anomaly_score + (Math.random() - 0.5) * 0.05)),
        timestamp: new Date().toISOString(),
        path: generatePath(f.lat + dLat, f.lon + dLon, newHeading, f.speed),
      };
    });
    
    // Occasionally add new emergencies (10% chance)
    if (Math.random() < 0.1 && _simulatedFlights.length < 8) {
      const newFlight = generateEmergencyFlight();
      _simulatedFlights.push(newFlight);
      _simulatedAlerts.unshift(generateAlertForFlight(newFlight));
      // Keep alerts manageable
      if (_simulatedAlerts.length > 15) _simulatedAlerts.pop();
    }
    
    // Notify listeners
    notifyListeners();
  }, 5000);
  
  // Initial notification
  notifyListeners();
}

/**
 * Stop simulation mode
 */
export function stopSimulation(): void {
  _simulationActive = false;
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_blinkIntervalId) {
    clearInterval(_blinkIntervalId);
    _blinkIntervalId = null;
  }
  _simulatedFlights = [];
  _simulatedAlerts = [];
  notifyListeners();
}

/**
 * Check if simulation is active
 */
export function isSimulationActive(): boolean {
  return _simulationActive;
}

/**
 * Get current simulation state
 */
export function getSimulationState(): { flights: RadarFlight[]; alerts: SimulatedAlert[]; blinkOn: boolean } {
  return {
    flights: _simulatedFlights,
    alerts: _simulatedAlerts,
    blinkOn: _blinkState,
  };
}

/**
 * Merge real flights with simulated emergencies
 */
export function mergeWithSimulation(realFlights: RadarFlight[]): RadarFlight[] {
  if (!_simulationActive) return realFlights;
  
  // Filter out any real flights that might conflict with simulated IDs
  const simIds = new Set(_simulatedFlights.map(f => f.flight_id));
  const filtered = realFlights.filter(f => !simIds.has(f.flight_id));
  
  return [..._simulatedFlights, ...filtered];
}

/**
 * Get simulated alerts
 */
export function getSimulatedAlerts(): SimulatedAlert[] {
  return _simulatedAlerts;
}

/**
 * Subscribe to simulation updates
 */
export function onSimulationUpdate(cb: (flights: RadarFlight[], alerts: SimulatedAlert[]) => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function notifyListeners(): void {
  for (const cb of _listeners) {
    try {
      cb(_simulatedFlights, _simulatedAlerts);
    } catch { /* ignore */ }
  }
}

/**
 * Toggle simulation mode
 */
export function toggleSimulation(): boolean {
  if (_simulationActive) {
    stopSimulation();
  } else {
    startSimulation();
  }
  return _simulationActive;
}
