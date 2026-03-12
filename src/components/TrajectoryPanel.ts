/**
 * TrajectoryPanel — Shows predicted trajectories for tracked flights.
 * Objective 2: Trajectory Prediction (Dead Reckoning)
 */
import { Panel } from './Panel';
import type { RadarFlight } from '@/services/radar-stream';

export class TrajectoryPanel extends Panel {
  private _onFlightClick?: (flight: RadarFlight) => void;

  constructor() {
    super({
      id: 'trajectory',
      title: 'Trajectory Prediction',
      showCount: true,
    });
    this.setContent('<div class="panel-empty">Waiting for radar data...</div>');
  }

  setFlightClickHandler(handler: (flight: RadarFlight) => void): void {
    this._onFlightClick = handler;
  }

  updateTrajectories(flights: RadarFlight[]): void {
    // Show flights that have trajectory predictions
    const withPath = flights.filter(f => f.path && f.path.length > 0);
    this.setCount(withPath.length);

    if (withPath.length === 0) {
      this.setContent('<div class="panel-empty">No trajectory predictions available.</div>');
      return;
    }

    // Sort by risk descending
    const sorted = [...withPath].sort((a, b) => (b.anomaly_score ?? 0) - (a.anomaly_score ?? 0));
    const top = sorted.slice(0, 20);

    const rows = top.map(f => {
      const riskColor = f.anomaly_score > 0.75 ? '#ff4444' : f.anomaly_score > 0.5 ? '#ff8800' : '#44cc44';
      const pathStr = (f.path ?? []).map(p =>
        `<span class="traj-wp">T+${p.min}m: ${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}°</span>`
      ).join('');

      return `<div class="traj-item" data-fid="${f.flight_id}">
        <div class="traj-header">
          <span class="traj-callsign">${f.callsign ?? f.flight_id}</span>
          <span class="traj-class">${f.ml_classification}</span>
          <span class="traj-risk" style="color:${riskColor}">${Math.round((f.anomaly_score ?? 0) * 100)}%</span>
        </div>
        <div class="traj-info">
          <span>Alt: ${(f.altitude ?? 0).toLocaleString()} ft</span>
          <span>Spd: ${f.speed ?? 0} kts</span>
          <span>Hdg: ${(f.heading ?? 0).toFixed(0)}°</span>
        </div>
        <div class="traj-waypoints">${pathStr}</div>
      </div>`;
    }).join('');

    this.setContent(`<div class="trajectory-body">${rows}</div>`);

    // Wire click handlers
    const body = this.content;
    if (body) {
      body.querySelectorAll('.traj-item').forEach(el => {
        el.addEventListener('click', () => {
          const fid = (el as HTMLElement).dataset.fid;
          const flight = flights.find(f => f.flight_id === fid);
          if (flight && this._onFlightClick) this._onFlightClick(flight);
        });
      });
    }
  }
}
