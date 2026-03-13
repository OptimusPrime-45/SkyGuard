import type { PanelConfig, MapLayers } from "@/types";
import type { DataSourceId } from "@/services/data-freshness";

// ============================================
// AIRSPACE MONITORING PANELS
// ============================================
// Panel order matters! First panels appear at top of grid.
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  map: { name: "Airspace Map", enabled: true, priority: 1 },
  "high-risk": { name: "High-Risk Objects", enabled: true, priority: 1 },
  classification: { name: "Object Classification", enabled: true, priority: 2 },
  anomaly: { name: "Anomaly Detection", enabled: true, priority: 2 },
  trajectory: { name: "Trajectory Prediction", enabled: true, priority: 3 },
  insights: { name: "AI Threat Analysis", enabled: true, priority: 3 },
};

// ============================================
// MAP LAYERS — only airspace-relevant layers enabled
// ============================================
const AIRSPACE_MAP_LAYERS: MapLayers = {
  flights: true,
  military: true,
  weather: false,
  dayNight: false,
  warzones: true,
  noFlyZones: true,
  // All non-airspace layers disabled
  iranAttacks: false,
  gpsJamming: false,
  satellites: false,
  conflicts: false,
  bases: false,
  cables: false,
  pipelines: false,
  hotspots: false,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  economic: false,
  waterways: false,
  outages: false,
  cyberThreats: false,
  datacenters: false,
  protests: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  ciiChoropleth: false,
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
};

export const DEFAULT_MAP_LAYERS: MapLayers = { ...AIRSPACE_MAP_LAYERS };
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = { ...AIRSPACE_MAP_LAYERS };

/** Maps map-layer toggle keys to their data-freshness source IDs. */
export const LAYER_TO_SOURCE: Partial<Record<keyof MapLayers, DataSourceId[]>> =
  {
    military: ["opensky", "wingbits"],
    flights: ["opensky"],
  };

// ============================================
// PANEL CATEGORY MAP (simplified for airspace)
// ============================================
export const PANEL_CATEGORY_MAP: Record<
  string,
  { labelKey: string; panelKeys: string[]; variants?: string[] }
> = {
  core: {
    labelKey: "header.panelCatCore",
    panelKeys: ["map", "high-risk", "insights"],
  },
};

// Monitor palette
export const MONITOR_COLORS = [
  "#44ff88",
  "#ff8844",
  "#4488ff",
  "#ff44ff",
  "#ffff44",
  "#ff4444",
  "#44ffff",
  "#88ff44",
  "#ff88ff",
  "#88ffff",
];

export const STORAGE_KEYS = {
  panels: "skyguard-panels",
  monitors: "skyguard-monitors",
  mapLayers: "skyguard-layers",
  disabledFeeds: "skyguard-disabled-feeds",
} as const;
