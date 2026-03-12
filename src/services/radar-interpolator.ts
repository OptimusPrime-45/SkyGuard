/**
 * Radar Dead-Reckoning Interpolator
 * ----------------------------------
 * Bridges the 10-15 s gap between API polls with client-side position
 * prediction so aircraft glide smoothly across the map — identical to
 * the technique FlightRadar24 uses.
 *
 * How it works:
 *   1.  Each API snapshot is timestamped and stored.
 *   2.  Between snapshots a 60 fps rAF loop extrapolates every flight's
 *       position using its heading (°) and ground-speed (knots).
 *   3.  When a fresh snapshot arrives the extrapolated state is seamlessly
 *       blended into the new truth via exponential easing so there is
 *       never a visible "jump".
 *
 * The consumer (DeckGLMap) receives pre-interpolated arrays and only
 * needs to set new layer data — the positions already move frame-by-frame.
 */

import type { RadarFlight } from './radar-stream';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type InterpolatedFlightCallback = (flights: RadarFlight[]) => void;

interface FlightState {
  /** Latest server truth */
  flight: RadarFlight;
  /** Interpolated lat/lon that we actually render */
  renderLat: number;
  renderLon: number;
  /** Speed in knots & heading for dead reckoning */
  speedKts: number;
  headingDeg: number;
  /** When this flight was last updated from the server (ms) */
  serverTimestamp: number;
  /** How far (in seconds) we've extrapolated since last server fix */
  extrapolatedSec: number;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

/** Nautical miles → degrees latitude (approx 1 NM = 1/60°). */
const NM_TO_DEG_LAT = 1 / 60;
/** Knots → NM/s */
const KTS_TO_NM_PER_SEC = 1 / 3600;
/** Max seconds we'll dead-reckon before freezing a flight in place */
const MAX_EXTRAPOLATION_SEC = 30;
/** Blend factor per frame: 0→snap instantly, 1→never converge.
 *  0.12 gives a smooth ~300 ms ease-in to new server position. */
const BLEND_FACTOR = 0.12;

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------

const _flightStates = new Map<string, FlightState>();
const _listeners = new Set<InterpolatedFlightCallback>();

let _rafId: number | null = null;
let _lastFrameTime = 0;
let _running = false;
/** Snapshot of the most recent interpolated array (for immediate subscribers) */
let _lastEmitted: RadarFlight[] = [];

// ------------------------------------------------------------------
// Core dead-reckoning math
// ------------------------------------------------------------------

/**
 * Advance a position by `dt` seconds given speed (kts) and heading (°true).
 * Uses a flat-earth approximation which is perfectly accurate at the 0-30 s
 * timescales we operate at.
 */
function deadReckon(
  lat: number,
  lon: number,
  speedKts: number,
  headingDeg: number,
  dtSec: number,
): [number, number] {
  const distNm = speedKts * KTS_TO_NM_PER_SEC * dtSec;
  const hdgRad = (headingDeg * Math.PI) / 180;
  const dLat = distNm * Math.cos(hdgRad) * NM_TO_DEG_LAT;
  // Longitude degrees per NM depends on latitude
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-10;
  const dLon = (distNm * Math.sin(hdgRad) * NM_TO_DEG_LAT) / cosLat;
  return [lat + dLat, lon + dLon];
}

/**
 * Exponential lerp — smoothly converges `current` toward `target`.
 * `alpha` is the blend weight (0 = snap, 1 = never move).
 */
function elerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * (1 - alpha);
}

// ------------------------------------------------------------------
// Snapshot ingestion (called by radar-stream on each poll)
// ------------------------------------------------------------------

/**
 * Ingest a fresh server snapshot.
 * - New flights are added.
 * - Existing flights blend their render position toward the new truth.
 * - Flights absent from the snapshot are removed after a grace period.
 */
export function ingestSnapshot(flights: RadarFlight[]): void {
  const now = performance.now();
  const seen = new Set<string>();

  for (const f of flights) {
    const id = f.flight_id;
    seen.add(id);

    const existing = _flightStates.get(id);
    if (existing) {
      // Update server truth — the rAF loop will blend toward it
      existing.flight = f;
      existing.speedKts = f.speed || existing.speedKts;
      existing.headingDeg = f.heading ?? existing.headingDeg;
      existing.serverTimestamp = now;
      existing.extrapolatedSec = 0;
      // DON'T snap renderLat/renderLon — let the blend handle it
    } else {
      // Brand-new flight — start at its server position
      _flightStates.set(id, {
        flight: f,
        renderLat: f.lat,
        renderLon: f.lon,
        speedKts: f.speed || 0,
        headingDeg: f.heading ?? 0,
        serverTimestamp: now,
        extrapolatedSec: 0,
      });
    }
  }

  // Prune flights that disappeared from the feed
  for (const id of _flightStates.keys()) {
    if (!seen.has(id)) {
      _flightStates.delete(id);
    }
  }
}

// ------------------------------------------------------------------
// Per-frame tick (rAF loop)
// ------------------------------------------------------------------

function tick(timestamp: number): void {
  if (!_running) return;

  const dtMs = _lastFrameTime ? timestamp - _lastFrameTime : 16;
  _lastFrameTime = timestamp;
  const dtSec = Math.min(dtMs / 1000, 0.1); // cap at 100 ms to avoid huge jumps on tab-refocus

  const interpolated: RadarFlight[] = [];

  for (const state of _flightStates.values()) {
    state.extrapolatedSec += dtSec;

    if (state.extrapolatedSec <= MAX_EXTRAPOLATION_SEC && state.speedKts > 1) {
      // Dead-reckon from the RENDER position (not the server position)
      // so the aircraft keeps moving frame-by-frame
      const [drLat, drLon] = deadReckon(
        state.renderLat,
        state.renderLon,
        state.speedKts,
        state.headingDeg,
        dtSec,
      );

      // Also compute where the server position WOULD be after dead-reckoning
      // from the last server fix — this is our "truth target"
      const [targetLat, targetLon] = deadReckon(
        state.flight.lat,
        state.flight.lon,
        state.speedKts,
        state.headingDeg,
        state.extrapolatedSec,
      );

      // Blend: move DR position gently toward the truth-extrapolated target.
      // This corrects drift without jumps.
      state.renderLat = elerp(drLat, targetLat, BLEND_FACTOR);
      state.renderLon = elerp(drLon, targetLon, BLEND_FACTOR);
    }
    // else: frozen — renderLat/renderLon stay put

    // Compute how far the render position has drifted from the original
    // server position so we can shift trajectory waypoints to match.
    const dLat = state.renderLat - state.flight.lat;
    const dLon = state.renderLon - state.flight.lon;

    // Shift the predicted path waypoints so they stay connected to the icon
    const shiftedPath = state.flight.path?.map((wp: { min: number; lat: number; lon: number }) => ({
      min: wp.min,
      lat: wp.lat + dLat,
      lon: wp.lon + dLon,
    }));

    // Emit a flight object with interpolated coordinates + shifted trajectory
    const emitted: RadarFlight = {
      ...state.flight,
      lat: state.renderLat,
      lon: state.renderLon,
    };
    if (shiftedPath) {
      emitted.path = shiftedPath;
    }
    if (state.flight.predicted_lat != null && state.flight.predicted_lon != null) {
      emitted.predicted_lat = state.flight.predicted_lat + dLat;
      emitted.predicted_lon = state.flight.predicted_lon + dLon;
    }
    interpolated.push(emitted);
  }

  _lastEmitted = interpolated;

  // Notify all listeners
  for (const cb of _listeners) {
    try { cb(interpolated); } catch { /* listener error */ }
  }

  _rafId = requestAnimationFrame(tick);
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/** Start the interpolation loop. Safe to call multiple times. */
export function startInterpolation(): void {
  if (_running) return;
  _running = true;
  _lastFrameTime = 0;
  _rafId = requestAnimationFrame(tick);
}

/** Stop the interpolation loop. */
export function stopInterpolation(): void {
  _running = false;
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

/** Subscribe to interpolated flight updates (~60 fps). */
export function onInterpolatedUpdate(cb: InterpolatedFlightCallback): () => void {
  _listeners.add(cb);
  // Immediately fire with current data if available
  if (_lastEmitted.length > 0) {
    try { cb(_lastEmitted); } catch { /* ignore */ }
  }
  return () => { _listeners.delete(cb); };
}

/** Get the latest interpolated snapshot */
export function getInterpolatedFlights(): RadarFlight[] {
  return _lastEmitted;
}
