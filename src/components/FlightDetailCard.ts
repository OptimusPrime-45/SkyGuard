/**
 * FlightDetailCard — Fixed-position right sidebar for individual flight details.
 * Objective 4: Threat/Risk Assessment visualization + click-through from map/panels.
 */
import type { RadarFlight } from '@/services/radar-stream';

export class FlightDetailCard {
  private el: HTMLElement;
  private _onAgentClick?: (flight: RadarFlight) => void;
  private currentFlight: RadarFlight | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'flight-detail-card hidden';
    this.el.innerHTML = '';
  }

  getElement(): HTMLElement {
    return this.el;
  }

  setOnAgentClick(handler: (flight: RadarFlight) => void): void {
    this._onAgentClick = handler;
  }

  show(flight: RadarFlight): void {
    this.currentFlight = flight;
    window.dispatchEvent(new CustomEvent('skyguard-flight-selected', { detail: { flightId: flight.flight_id } }));
    const score = Math.round((flight.anomaly_score ?? 0) * 100);
    const riskColor = score > 85 ? '#ff4444' : score > 70 ? '#ff8800' : score > 50 ? '#ffcc00' : '#44cc44';
    const badgeClass = score > 85 ? 'critical' : score > 70 ? 'high' : score > 50 ? 'medium' : 'low';
    const isDrone = flight.ml_classification === 'Drone/UAV';
    const classColor = isDrone ? 'class-drone' : 'class-civilian';
    const icon = isDrone ? '🛸' : '✈️';

    const pathHtml = (flight.path ?? []).map(p =>
      `<div class="fdc-traj-point">T+${p.min}m: ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°E</div>`
    ).join('');

    this.el.innerHTML = `
      <div class="fdc-header">
        <div>
          <div class="fdc-title-row">
            <span class="fdc-icon ${flight.is_anomaly ? 'pulse-red' : ''}">${icon}</span>
            <h3 class="fdc-title">${flight.callsign ?? flight.flight_id}</h3>
          </div>
          <span class="fdc-badge fdc-badge-${badgeClass}">Risk: ${score}%</span>
        </div>
        <button class="fdc-close">&times;</button>
      </div>
      <div class="fdc-class-row">
        <span class="fdc-class-label">Classification</span>
        <span class="fdc-class-value ${classColor}">${flight.ml_classification}</span>
      </div>
      <div class="fdc-metrics">
        <div class="fdc-metric">
          <div class="fdc-metric-label">Altitude</div>
          <div class="fdc-metric-value">${(flight.altitude ?? 0).toLocaleString()} ft</div>
        </div>
        <div class="fdc-metric">
          <div class="fdc-metric-label">Speed</div>
          <div class="fdc-metric-value">${flight.speed ?? 0} kts</div>
        </div>
        <div class="fdc-metric">
          <div class="fdc-metric-label">Heading</div>
          <div class="fdc-metric-value">${(flight.heading ?? 0).toFixed(0)}°</div>
        </div>
        <div class="fdc-metric">
          <div class="fdc-metric-label">Dist to NFZ</div>
          <div class="fdc-metric-value">${flight.dist_nm != null ? flight.dist_nm.toFixed(1) + ' NM' : '—'}</div>
        </div>
      </div>
      <div class="fdc-anomaly-section">
        <div class="fdc-anomaly-label">Anomaly Score</div>
        <div class="fdc-anomaly-bar-bg">
          <div class="fdc-anomaly-bar-fill" style="width:${score}%;background:${riskColor}"></div>
        </div>
        <div class="fdc-anomaly-value" style="color:${riskColor}">${score}%</div>
      </div>
      <div class="fdc-position">
        <span>${flight.lat.toFixed(4)}°N, ${flight.lon.toFixed(4)}°E</span>
        <span>${new Date().toLocaleTimeString()}</span>
      </div>
      ${pathHtml ? `<div class="fdc-traj-section"><div class="fdc-traj-title">Predicted Trajectory (3 min)</div>${pathHtml}</div>` : ''}
      <button class="fdc-report-btn">
        <span class="fdc-report-icon">🤖</span>
        Ask AI Agent
      </button>
    `;

    this.el.classList.remove('hidden');

    // Wire close button
    this.el.querySelector('.fdc-close')?.addEventListener('click', () => this.hide());

    // Wire agent button
    this.el.querySelector('.fdc-report-btn')?.addEventListener('click', () => {
      if (this.currentFlight && this._onAgentClick) {
        this._onAgentClick(this.currentFlight);
      }
    });
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.currentFlight = null;
    window.dispatchEvent(new CustomEvent('skyguard-flight-selected', { detail: { flightId: null } }));
  }

  destroy(): void {
    this.el.remove();
  }
}
