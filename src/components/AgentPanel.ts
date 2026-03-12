/**
 * AgentPanel — Slide-out overlay for Agentic AI analysis.
 * Objective 5: Agentic AI for Airspace Monitoring (Groq Llama 3)
 */
import type { RadarFlight } from '@/services/radar-stream';

export class AgentPanel {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private contentEl: HTMLElement;
  private currentFlight: RadarFlight | null = null;
  private chatFab?: HTMLElement;
  private chatHistory: { role: string; text: string }[] = [];

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'agent-overlay hidden';

    this.panel = document.createElement('div');
    this.panel.className = 'agent-panel hidden';
    this.panel.innerHTML = `
      <div class="agent-header">
        <div class="agent-header-left">
          <span class="agent-logo">🤖</span>
          <h3 class="agent-title">SkyGuard AI Agent</h3>
        </div>
        <button class="agent-close">&times;</button>
      </div>
      <div class="agent-content">
        <div class="agent-empty">
          <span class="agent-empty-icon">🛡️</span>
          <p>Select a flight and click "Ask AI Agent" to analyze.</p>
        </div>
      </div>
      <div class="agent-chat-input-area">
        <input class="agent-chat-input" type="text" placeholder="Ask about airspace, threats, flights…" />
        <button class="agent-chat-send">Send</button>
      </div>
    `;

    this.contentEl = this.panel.querySelector('.agent-content')!;

    // Create floating chat button
    this.chatFab = document.createElement('button');
    if (this.chatFab) {
      this.chatFab.className = 'agent-chat-fab';
      this.chatFab.innerHTML = '🤖';
      this.chatFab.title = 'Chat with SkyGuard AI';
    }
    this.chatFab?.addEventListener('click', () => this.toggle());

    // Wire close
    this.panel.querySelector('.agent-close')?.addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', () => this.hide());

    // Wire chat input
    const chatInput = this.panel.querySelector('.agent-chat-input') as HTMLInputElement;
    const chatSend = this.panel.querySelector('.agent-chat-send');
    const sendMessage = () => {
      const msg = chatInput?.value.trim();
      if (!msg) return;
      chatInput.value = '';
      this.sendChatMessage(msg);
    };
    chatSend?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  getOverlayElement(): HTMLElement {
    return this.overlay;
  }

  getPanelElement(): HTMLElement {
    return this.panel;
  }

  getFabElement(): HTMLElement {
    if (!this.chatFab) {
      const fallbackFab = document.createElement('button');
      fallbackFab.className = 'agent-chat-fab';
      fallbackFab.innerHTML = '🤖';
      fallbackFab.title = 'Chat with SkyGuard AI';
      fallbackFab.addEventListener('click', () => this.toggle());
      this.chatFab = fallbackFab;
    }
    return this.chatFab;
  }

  toggle(): void {
    if (this.panel.classList.contains('hidden')) {
      this.show();
    } else {
      this.hide();
    }
  }

  private async sendChatMessage(message: string): Promise<void> {
    this.chatHistory.push({ role: 'user', text: message });
    this.renderChatHistory();
    this.show();

    // Show typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'agent-chat-typing';
    typingEl.textContent = 'SkyGuard AI is thinking...';
    this.contentEl.appendChild(typingEl);
    this.contentEl.scrollTop = this.contentEl.scrollHeight;

    try {
      // Build context from current flight or general query
      const flight = this.currentFlight;
      const res = await fetch('/api/agent/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callsign: flight?.callsign ?? message.slice(0, 20),
          classification: flight?.ml_classification ?? 'Unknown',
          risk_score: flight ? Math.round((flight.anomaly_score ?? 0) * 100) : 50,
          alt: flight?.altitude ?? 0,
          speed: flight?.speed ?? 0,
          dist_nm: flight?.dist_nm ?? 0,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const report = data.report ?? 'No response.';
      this.chatHistory.push({ role: 'agent', text: report });
    } catch {
      this.chatHistory.push({ role: 'agent', text: 'Failed to reach AI Agent. Is the backend running?' });
    }

    typingEl.remove();
    this.renderChatHistory();
  }

  private renderChatHistory(): void {
    const html = this.chatHistory.map(msg => {
      const cls = msg.role === 'user' ? 'agent-chat-msg-user' : 'agent-chat-msg-agent';
      const label = msg.role === 'user' ? 'You' : '🤖 SkyGuard AI';
      const escaped = msg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div class="agent-chat-msg ${cls}"><strong>${label}</strong><p>${escaped}</p></div>`;
    }).join('');
    this.contentEl.innerHTML = html || '<div class="agent-empty"><span class="agent-empty-icon">🛡️</span><p>Ask the AI agent about any airspace situation.</p></div>';
    this.contentEl.scrollTop = this.contentEl.scrollHeight;
  }

  async analyze(flight: RadarFlight): Promise<void> {
    this.currentFlight = flight;
    this.show();

    // Show loading
    this.contentEl.innerHTML = `
      <div class="agent-loading">
        <div class="agent-spinner"></div>
        <p>Analyzing ${flight.callsign ?? flight.flight_id}...</p>
        <p class="agent-loading-sub">Querying Llama 3 via Groq</p>
      </div>
    `;

    try {
      const res = await fetch('/api/agent/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callsign: flight.callsign ?? flight.flight_id ?? 'UNKNOWN',
          classification: flight.ml_classification ?? 'Unknown',
          risk_score: Math.round((flight.anomaly_score ?? 0) * 100),
          alt: flight.altitude ?? 0,
          speed: flight.speed ?? 0,
          dist_nm: flight.dist_nm ?? 0,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const report = data.report ?? 'No analysis returned.';

      const score = Math.round((flight.anomaly_score ?? 0) * 100);
      const sevColor = score > 85 ? '#ff4444' : score > 70 ? '#ff8800' : '#ffcc00';
      const sevLabel = score > 85 ? 'CRITICAL' : score > 70 ? 'HIGH' : score > 50 ? 'ELEVATED' : 'LOW';

      const paragraphs = report.split('\n').filter((l: string) => l.trim()).map((p: string) => {
        const escaped = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (escaped.startsWith('##')) return `<h3 class="agent-md-h3">${escaped.replace(/^#+\s*/, '')}</h3>`;
        if (escaped.startsWith('- ') || escaped.startsWith('* ')) return `<div class="agent-md-li">• ${escaped.slice(2)}</div>`;
        return `<p class="agent-md-p">${escaped}</p>`;
      }).join('');

      this.contentEl.innerHTML = `
        <div class="agent-threat-badge" style="border-color:${sevColor}">
          <span class="agent-threat-level" style="color:${sevColor}">${sevLabel} THREAT</span>
          <span class="agent-analyzed-at">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="agent-analysis">
          <h3 class="agent-md-h2">Analysis: ${flight.callsign ?? flight.flight_id}</h3>
          <div style="margin-bottom:8px;font-size:12px;color:#666">
            ${flight.ml_classification} | Alt: ${(flight.altitude ?? 0).toLocaleString()} ft | Risk: ${score}%
          </div>
          ${paragraphs}
        </div>
      `;
    } catch (e) {
      this.contentEl.innerHTML = `
        <div class="agent-error">
          <span class="agent-error-icon">⚠️</span>
          <p>Failed to connect to AI Agent. Ensure the FastAPI backend is running.</p>
          <button class="agent-retry-btn">Retry</button>
        </div>
      `;
      this.contentEl.querySelector('.agent-retry-btn')?.addEventListener('click', () => {
        if (this.currentFlight) this.analyze(this.currentFlight);
      });
    }
  }

  show(): void {
    this.overlay.classList.remove('hidden');
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.overlay.classList.add('hidden');
    this.panel.classList.add('hidden');
  }

  destroy(): void {
    this.overlay.remove();
    this.panel.remove();
    this.chatFab?.remove();
  }
}
