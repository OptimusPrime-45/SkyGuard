/**
 * AirspaceStatsBar — Horizontal stats bar above the map showing
 * tracked objects, alerts, classification breakdown, avg risk.
 * Includes simulation toggle button.
 */
import type { RadarFlight } from '@/services/radar-stream';
import { 
  isSimulationActive, 
  toggleSimulation, 
  getSimulationState,
} from '@/services/simulation';

export class AirspaceStatsBar {
  private el: HTMLElement;
  private onSimulationToggle?: () => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'airspace-stats-bar';
    this.el.innerHTML = this.buildEmpty();
    this.setupSimulationButton();
  }

  getElement(): HTMLElement {
    return this.el;
  }

  setOnSimulationToggle(cb: () => void): void {
    this.onSimulationToggle = cb;
  }

  private setupSimulationButton(): void {
    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.sim-btn')) {
        toggleSimulation();
        this.updateSimButtonState();
        this.onSimulationToggle?.();
      }
    });
  }

  private updateSimButtonState(): void {
    const btn = this.el.querySelector('.sim-btn') as HTMLElement;
    if (!btn) return;
    const active = isSimulationActive();
    btn.classList.toggle('active', active);
    btn.innerHTML = active 
      ? '<span class="sim-icon">⏹</span> STOP SIM' 
      : '<span class="sim-icon">▶</span> SIMULATE';
    btn.title = active ? 'Stop simulation mode' : 'Start emergency simulation mode';
  }

  update(flights: RadarFlight[]): void {
    const simActive = isSimulationActive();
    const simState = simActive ? getSimulationState() : null;
    
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
    const alertColor = alerts > 0 ? '#ff4444' : 'inherit';
    const anomalyColor = anomalies > 0 ? '#ff8800' : 'inherit';
    
    // Blinking effect for simulation mode
    const blinkClass = simActive && simState?.blinkOn ? 'blink-on' : '';

    this.el.innerHTML = `
      <div class="stats-item">
        <span class="stats-label">TRACKED</span>
        <span class="stats-value">${tracked}</span>
      </div>
      <div class="stats-item stats-alerts ${alerts > 0 ? blinkClass : ''}">
        <span class="stats-label">ALERTS</span>
        <span class="stats-value" style="color:${alertColor}">${alerts}</span>
      </div>
      <div class="stats-item ${anomalies > 0 ? blinkClass : ''}">
        <span class="stats-label">ANOMALIES</span>
        <span class="stats-value" style="color:${anomalyColor}">${anomalies}</span>
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
      <div class="stats-spacer"></div>
      <button class="sim-btn ${simActive ? 'active' : ''}" title="${simActive ? 'Stop simulation' : 'Start emergency simulation'}">
        <span class="sim-icon">${simActive ? '⏹' : '▶'}</span> ${simActive ? 'STOP SIM' : 'SIMULATE'}
      </button>
    `;
  }

  private buildEmpty(): string {
    const simActive = isSimulationActive();
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
      <div class="stats-spacer"></div>
      <button class="sim-btn ${simActive ? 'active' : ''}" title="${simActive ? 'Stop simulation' : 'Start emergency simulation'}">
        <span class="sim-icon">${simActive ? '⏹' : '▶'}</span> ${simActive ? 'STOP SIM' : 'SIMULATE'}
      </button>
    `;
  }
}
