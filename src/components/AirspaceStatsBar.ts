/**
 * AirspaceStatsBar — Horizontal stats bar above the map showing
 * tracked objects, alerts, classification breakdown, avg risk.
 */
import type { RadarFlight } from '@/services/radar-stream';

export class AirspaceStatsBar {
  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'airspace-stats-bar';
    this.el.innerHTML = this.buildEmpty();
  }

  getElement(): HTMLElement {
    return this.el;
  }

  update(flights: RadarFlight[]): void {
    const tracked = flights.length;
    const alerts = flights.filter(f => f.is_anomaly || f.anomaly_score > 0.75).length;
    const anomalies = flights.filter(f => f.is_anomaly).length;
    const avgRisk = tracked > 0
      ? Math.round(flights.reduce((s, f) => s + (f.anomaly_score ?? 0), 0) / tracked * 100)
      : 0;

    const classCounts: Record<string, number> = {};
    for (const f of flights) {
      const cls = f.ml_classification ?? 'Unknown';
      classCounts[cls] = (classCounts[cls] ?? 0) + 1;
    }

    const riskColor = avgRisk > 60 ? '#ff4444' : avgRisk > 30 ? '#ff8800' : '#44cc44';

    this.el.innerHTML = `
      <div class="stats-item">
        <span class="stats-label">TRACKED</span>
        <span class="stats-value">${tracked}</span>
      </div>
      <div class="stats-item stats-alerts">
        <span class="stats-label">ALERTS</span>
        <span class="stats-value" style="color:#ff4444">${alerts}</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">ANOMALIES</span>
        <span class="stats-value" style="color:#ff8800">${anomalies}</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">AVG RISK</span>
        <span class="stats-value" style="color:${riskColor}">${avgRisk}%</span>
      </div>
      <div class="stats-divider"></div>
      ${Object.entries(classCounts).map(([cls, count]) => `
        <div class="stats-item stats-class">
          <span class="stats-label">${cls.toUpperCase()}</span>
          <span class="stats-value">${count}</span>
        </div>
      `).join('')}
    `;
  }

  private buildEmpty(): string {
    return `
      <div class="stats-item">
        <span class="stats-label">TRACKED</span>
        <span class="stats-value">—</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">ALERTS</span>
        <span class="stats-value">—</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">ANOMALIES</span>
        <span class="stats-value">—</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">AVG RISK</span>
        <span class="stats-value">—</span>
      </div>
    `;
  }
}
