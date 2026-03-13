/**
 * ThreatCenterPanel — "High-Risk Objects" sidebar panel.
 * Displays flights where is_anomaly === true or anomaly_score > 0.7.
 * Also shows simulated alerts when simulation mode is active.
 */
import { Panel } from "./Panel";
import type { RadarFlight } from "@/services/radar-stream";
import { getHighRiskFlights, onRadarUpdate } from "@/services/radar-stream";
import { isSimulationActive, getSimulatedAlerts, type SimulatedAlert } from "@/services/simulation";
import { h, replaceChildren } from "@/utils/dom-utils";

export class ThreatCenterPanel extends Panel {
  private _flights: RadarFlight[] = [];
  private _unsub: (() => void) | null = null;
  private _onFlightClick?: (flight: RadarFlight) => void;

  constructor() {
    super({
      id: "high-risk",
      title: "High-Risk Objects",
      showCount: true,
      className: "threat-center-panel",
    });
  }

  setFlightClickHandler(handler: (flight: RadarFlight) => void): void {
    this._onFlightClick = handler;
  }

  init(): void {
    this._unsub = onRadarUpdate(() => {
      this._flights = getHighRiskFlights();
      this.setCount(this._flights.length);
      this.renderList();
    });
    // Initial render
    this._flights = getHighRiskFlights();
    this.setCount(this._flights.length);
    this.renderList();
  }

  updateFlights(allFlights: RadarFlight[]): void {
    this._flights = allFlights.filter(
      (f) => f.is_anomaly || f.anomaly_score > 0.7,
    );
    this.setCount(this._flights.length);
    this.renderList();
  }

  private renderList(): void {
    const body = this.content;
    if (!body) return;

    const elements: HTMLElement[] = [];
    
    // Check for simulation mode alerts
    if (isSimulationActive()) {
      const alerts = getSimulatedAlerts();
      if (alerts.length > 0) {
        elements.push(this.renderAlertsSection(alerts));
      }
    }

    if (this._flights.length === 0 && elements.length === 0) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "threat-empty" },
          "No high-risk objects detected",
        ),
      );
      return;
    }

    const sorted = [...this._flights].sort(
      (a, b) => b.anomaly_score - a.anomaly_score,
    );
    const flightItems = sorted.map((f) => this.renderFlightItem(f));
    elements.push(...flightItems);
    
    replaceChildren(body, ...elements);
  }

  private renderAlertsSection(alerts: SimulatedAlert[]): HTMLElement {
    const alertItems = alerts.slice(0, 5).map((alert) => {
      const severityColors: Record<string, string> = {
        critical: '#ff2222',
        high: '#ff6600',
        medium: '#ffaa00',
        low: '#88cc44',
      };
      const severityIcons: Record<string, string> = {
        critical: '🚨',
        high: '⚠️',
        medium: '⚡',
        low: 'ℹ️',
      };
      const typeIcons: Record<string, string> = {
        intrusion: '🛑',
        emergency: '🆘',
        squawk: '📡',
        anomaly: '❓',
        drone: '🛸',
        restricted_zone: '🚫',
        intercept: '🎯',
      };

      const color = severityColors[alert.severity] ?? '#ff6600';
      const icon = typeIcons[alert.type] ?? severityIcons[alert.severity] ?? '⚠️';
      const timeAgo = this.formatTimeAgo(alert.timestamp);

      return h(
        "div",
        { className: `alert-item severity-${alert.severity}`, "data-alert-id": alert.id },
        h(
          "div",
          { className: "alert-header" },
          h("span", { className: "alert-icon" }, icon),
          h("span", { className: "alert-title", style: `color:${color}` }, alert.title),
        ),
        h(
          "div",
          { className: "alert-body" },
          h("span", { className: "alert-desc" }, alert.description),
        ),
        h(
          "div",
          { className: "alert-footer" },
          h("span", { className: "alert-flight" }, `Flight: ${alert.flightId}`),
          h("span", { className: "alert-time" }, timeAgo),
        ),
      );
    });

    return h(
      "div",
      { className: "alerts-section" },
      h("div", { className: "alerts-header" }, "🚨 ACTIVE ALERTS"),
      ...alertItems,
    );
  }

  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  private renderFlightItem(flight: RadarFlight): HTMLElement {
    const scoreColor =
      flight.anomaly_score > 0.85
        ? "#ff4444"
        : flight.anomaly_score > 0.7
          ? "#ff8800"
          : "#ffcc00";
    const classLabel = flight.ml_classification ?? "Unknown";
    const isDrone = classLabel === "Drone/UAV";

    const item = h(
      "div",
      {
        className: `threat-item ${flight.is_anomaly ? "anomaly" : ""}`,
        "data-fid": flight.flight_id,
        onclick: () => this._onFlightClick?.(flight),
      },
      h(
        "div",
        { className: "threat-item-header" },
        h(
          "span",
          { className: `threat-icon ${isDrone ? "drone" : "aircraft"}` },
          isDrone ? "🛸" : "✈️",
        ),
        h("span", { className: "threat-id" }, flight.flight_id),
        h(
          "span",
          {
            className: "threat-class",
            style: `color:${isDrone ? "#ff4444" : "#888"}`,
          },
          classLabel,
        ),
      ),
      h(
        "div",
        { className: "threat-item-body" },
        h(
          "div",
          { className: "threat-metric" },
          h("span", { className: "threat-label" }, "Anomaly Score"),
          h(
            "span",
            { className: "threat-value", style: `color:${scoreColor}` },
            `${(flight.anomaly_score * 100).toFixed(1)}%`,
          ),
        ),
        h(
          "div",
          { className: "threat-metric" },
          h("span", { className: "threat-label" }, "Alt / Speed"),
          h(
            "span",
            { className: "threat-value" },
            `${(flight.altitude ?? 0).toLocaleString()} ft / ${flight.speed ?? 0} kts`,
          ),
        ),
        h(
          "div",
          { className: "threat-metric" },
          h("span", { className: "threat-label" }, "Squawk"),
          h(
            "span",
            {
              className: `threat-value ${flight.squawk === "7700" || flight.squawk === "7500" || flight.squawk === "7600" ? "squawk-emergency" : ""}`,
            },
            flight.squawk ?? "—",
          ),
        ),
      ),
      h(
        "div",
        { className: "threat-score-bar" },
        h("div", {
          className: "threat-score-fill",
          style: `width:${Math.round(flight.anomaly_score * 100)}%;background:${scoreColor}`,
        }),
      ),
    );
    return item;
  }

  destroy(): void {
    this._unsub?.();
    this._unsub = null;
    super.destroy();
  }
}
