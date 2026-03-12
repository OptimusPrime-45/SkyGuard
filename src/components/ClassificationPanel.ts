/**
 * ClassificationPanel — Shows ML classification breakdown (donut chart + table).
 * Objective 1: Aerial Object Classification
 */
import { Panel } from './Panel';
import type { RadarFlight } from '@/services/radar-stream';

export class ClassificationPanel extends Panel {
  constructor() {
    super({
      id: 'classification',
      title: 'Object Classification',
      showCount: true,
    });
    this.setContent('<div class="panel-empty">Waiting for radar data...</div>');
  }

  updateClassification(flights: RadarFlight[]): void {
    this.setCount(flights.length);

    const counts: Record<string, number> = {};
    for (const f of flights) {
      const cls = f.ml_classification ?? 'Unknown';
      counts[cls] = (counts[cls] ?? 0) + 1;
    }

    const total = flights.length || 1;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colorMap: Record<string, string> = {
      Civilian: '#4488ff',
      'Drone/UAV': '#ff4444',
      Military: '#ff8800',
      Unknown: '#888888',
    };

    // Build SVG donut
    const size = 120;
    const cx = size / 2;
    const cy = size / 2;
    const r = 44;
    const strokeW = 18;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    const arcs = entries.map(([cls, count]) => {
      const pct = count / total;
      const dashLen = pct * circumference;
      const color = colorMap[cls] ?? '#666';
      const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${color}" stroke-width="${strokeW}"
        stroke-dasharray="${dashLen} ${circumference - dashLen}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})" />`;
      offset += dashLen;
      return arc;
    }).join('');

    const donut = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1a1a1a" stroke-width="${strokeW}" />
      ${arcs}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#e5e5e5" font-size="18" font-weight="700">${total}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="#666" font-size="10">objects</text>
    </svg>`;

    const rows = entries.map(([cls, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      const color = colorMap[cls] ?? '#666';
      return `<div class="cls-row">
        <span class="cls-dot" style="background:${color}"></span>
        <span class="cls-name">${cls}</span>
        <span class="cls-count">${count}</span>
        <span class="cls-pct">${pct}%</span>
      </div>`;
    }).join('');

    this.setContent(`
      <div class="classification-body">
        <div class="cls-donut">${donut}</div>
        <div class="cls-table">${rows}</div>
      </div>
    `);
  }
}
