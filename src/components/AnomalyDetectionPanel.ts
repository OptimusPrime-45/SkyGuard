/**
 * AnomalyDetectionPanel — Live anomaly feed with severity badges.
 * Objective 3: Anomaly Detection (Isolation Forest)
 */
import { Panel } from './Panel';
import type { RadarFlight } from '@/services/radar-stream';

export class AnomalyDetectionPanel extends Panel {
  private _onFlightClick?: (flight: RadarFlight) => void;

  constructor() {
    super({
      id: 'anomaly',
      title: 'Anomaly Detection',
      showCount: true,
    });
    this.setContent('<div class="panel-empty">No anomalies detected.</div>');
  }

  setFlightClickHandler(handler: (flight: RadarFlight) => void): void {
    this._onFlightClick = handler;
  }

  updateAnomalies(flights: RadarFlight[]): void {
    const anomalies = flights.filter(f => f.is_anomaly || f.anomaly_score > 0.7);
    this.setCount(anomalies.length);
    if (anomalies.length > 0) { this.setDataBadge('live'); }

    if (anomalies.length === 0) {
      this.setContent('<div class="panel-empty">No anomalies detected — airspace nominal.</div>');
      return;
    }

    const sorted = [...anomalies].sort((a, b) => (b.anomaly_score ?? 0) - (a.anomaly_score ?? 0));

    const items = sorted.map(f => {
      const score = Math.round((f.anomaly_score ?? 0) * 100);
      let severity = 'LOW';
      let sevColor = '#44cc44';
      if (score > 85) { severity = 'CRITICAL'; sevColor = '#ff4444'; }
      else if (score > 70) { severity = 'HIGH'; sevColor = '#ff8800'; }
      else if (score > 50) { severity = 'MEDIUM'; sevColor = '#ffcc00'; }

      const isDrone = f.ml_classification === 'Drone/UAV';
      const icon = isDrone ? '🛸' : '✈️';

      return `<div class="anomaly-item" data-fid="${f.flight_id}">
        <div class="anomaly-header">
          <span class="anomaly-icon">${icon}</span>
          <span class="anomaly-callsign">${f.callsign ?? f.flight_id}</span>
          <span class="anomaly-severity" style="background:${sevColor};color:${score > 70 ? '#fff' : '#000'}">${severity}</span>
        </div>
        <div class="anomaly-details">
          <span>Class: ${f.ml_classification}</span>
          <span>Score: <strong style="color:${sevColor}">${score}%</strong></span>
        </div>
        <div class="anomaly-details">
          <span>Alt: ${(f.altitude ?? 0).toLocaleString()} ft</span>
          <span>Speed: ${f.speed ?? 0} kts</span>
          ${f.dist_nm != null ? `<span>Dist: ${f.dist_nm.toFixed(1)} NM</span>` : ''}
        </div>
        <div class="anomaly-bar">
          <div class="anomaly-bar-fill" style="width:${score}%;background:${sevColor}"></div>
        </div>
      </div>`;
    }).join('');

    this.setContent(`<div class="anomaly-body">${items}</div>`);

    // Wire click handlers
    const body = this.content;
    if (body) {
      body.querySelectorAll('.anomaly-item').forEach(el => {
        el.addEventListener('click', () => {
          const fid = (el as HTMLElement).dataset.fid;
          const flight = flights.find(f => f.flight_id === fid);
          if (flight && this._onFlightClick) this._onFlightClick(flight);
        });
      });
    }
  }
}
