/**
 * ThreatCenterPanel — "High-Risk Objects" sidebar panel.
 * Displays flights where is_anomaly === true or anomaly_score > 0.7.
 */
import { Panel } from "./Panel";
import type { RadarFlight } from "@/services/radar-stream";
import { getHighRiskFlights, onRadarUpdate } from "@/services/radar-stream";
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

    if (this._flights.length === 0) {
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
    const items = sorted.map((f) => this.renderFlightItem(f));
    replaceChildren(body, ...items);
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
              className: `threat-value ${flight.squawk === "7700" ? "squawk-emergency" : ""}`,
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
