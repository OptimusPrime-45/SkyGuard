import { Panel } from './Panel';


export class ThreatAnalysisPanel extends Panel {
  private lastAnalysisText = '';
  private analyzeTimeout: any;

  constructor() {
    super({
      id: 'insights',
      title: 'AI Threat Analysis',
      showCount: false,
    });
    this.setContent('<div class="panel-empty">Waiting for radar data...</div>');
  }

  public updateThreatAnalysis(flights: any[]): void {
    const highRisk = flights.filter(f => f.is_anomaly === true || (f.anomaly_score && f.anomaly_score > 0.7));
    if (highRisk.length === 0) {
      if (!this.lastAnalysisText) {
        this.setContent('<div class="panel-empty">No high-risk flights to analyze.</div>');
      }
      return;
    }

    // Debounce the analysis to avoid spamming the AI
    clearTimeout(this.analyzeTimeout);
    this.analyzeTimeout = setTimeout(() => {
      this.runAnalysis(highRisk);
    }, 5000);
  }

  private async runAnalysis(highRisk: any[]): Promise<void> {
    this.setContent('<div class="panel-empty">Consulting SkyGuard AI Threat Models...</div>');
    this.setDataBadge('live');

    // Analyze the highest-risk flight via FastAPI agent
    const top = highRisk.sort((a: any, b: any) => (b.anomaly_score ?? 0) - (a.anomaly_score ?? 0))[0];
    if (!top) return;

    try {
      const res = await fetch('/api/agent/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callsign: top.callsign ?? top.flight_id ?? 'UNKNOWN',
          classification: top.ml_classification ?? 'Unknown',
          risk_score: Math.round((top.anomaly_score ?? 0) * 100),
          alt: top.altitude ?? 0,
          speed: top.speed ?? 0,
          dist_nm: top.dist_nm ?? 0,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const report = data.report ?? 'No analysis returned.';

      this.lastAnalysisText = report;
      const paragraphs = report.split('\n').filter((l: string) => l.trim()).map((p: string) => {
        const escaped = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<p style="margin-bottom: 8px;">${escaped}</p>`;
      }).join('');

      this.setContent(`
        <div style="padding: 12px; font-size: 13px; line-height: 1.5; color: #ddd">
          <div style="margin-bottom:10px;font-weight:600;color:#ff8800;">
            ⚡ Analysis for ${highRisk.length} high-risk object(s) — Top: ${top.callsign ?? top.flight_id}
          </div>
          ${paragraphs}
        </div>
      `);
    } catch (e) {
      console.warn('Threat analysis failed', e);
      this.setContent('<div class="panel-empty">Analysis failed — is FastAPI backend running?</div>');
    }
  }
}
