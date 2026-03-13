import type { Monitor, MapLayers } from "@/types";
import type { AppContext } from "@/app/app-context";
import {
  DEFAULT_PANELS,
  DEFAULT_MAP_LAYERS,
  MOBILE_DEFAULT_MAP_LAYERS,
  STORAGE_KEYS,
  SITE_VARIANT,
} from "@/config";
import { sanitizeLayersForVariant } from "@/config/map-layer-definitions";
import type { MapVariant } from "@/config/map-layer-definitions";
import { initDB } from "@/services/storage";
import { loadFromStorage, isMobileDevice } from "@/utils";
import { isDesktopRuntime, waitForSidecarReady } from "@/services/runtime";
import { trackEvent } from "@/services/analytics";
import { initI18n } from "@/services/i18n";
import { resolveUserRegion } from "@/utils/user-location";
import { PanelLayoutManager } from "@/app/panel-layout";
import { EventHandlerManager } from "@/app/event-handlers";
import {
  startRadarStream,
  stopRadarStream,
  onRadarUpdate,
} from "@/services/radar-stream";
import {
  mergeWithSimulation,
  onSimulationUpdate,
} from "@/services/simulation";

export type { CountryBriefSignals } from "@/app/app-context";

export class App {
  private state: AppContext;

  private panelLayout: PanelLayoutManager;
  private eventHandlers: EventHandlerManager;

  private modules: { destroy(): void }[] = [];
  private unsubRadar: (() => void) | null = null;
  private selectedFlightSyncHandler: ((event: Event) => void) | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);

    const PANEL_ORDER_KEY = "panel-order";
    const PANEL_SPANS_KEY = "skyguard-panel-spans";

    const isMobile = isMobileDevice();
    const isDesktopApp = isDesktopRuntime();
    const monitors = loadFromStorage<Monitor[]>(STORAGE_KEYS.monitors, []);
    const defaultLayers = isMobile
      ? MOBILE_DEFAULT_MAP_LAYERS
      : DEFAULT_MAP_LAYERS;

    const mapLayers = sanitizeLayersForVariant(
      loadFromStorage<MapLayers>(STORAGE_KEYS.mapLayers, defaultLayers),
      SITE_VARIANT as MapVariant,
    );
    const panelSettings = { ...DEFAULT_PANELS };

    const disabledSources = new Set(
      loadFromStorage<string[]>(STORAGE_KEYS.disabledFeeds, []),
    );

    this.state = {
      map: null,
      isMobile,
      isDesktopApp,
      container: el,
      panels: {},
      newsPanels: {},
      panelSettings,
      mapLayers,
      allNews: [],
      newsByCategory: {},
      latestMarkets: [],
      latestPredictions: [],
      latestClusters: [],
      intelligenceCache: {},
      cyberThreatsCache: null,
      disabledSources,
      currentTimeRange: "all",
      inFlight: new Set(),
      seenGeoAlerts: new Set(),
      monitors,
      signalModal: null,
      statusPanel: null,
      searchModal: null,
      findingsBadge: null,
      breakingBanner: null,
      playbackControl: null,
      exportPanel: null,
      unifiedSettings: null,
      pizzintIndicator: null,
      countryBriefPage: null,
      countryTimeline: null,
      positivePanel: null,
      countersPanel: null,
      progressPanel: null,
      breakthroughsPanel: null,
      heroPanel: null,
      digestPanel: null,
      speciesPanel: null,
      renewablePanel: null,
      tvMode: null,
      happyAllItems: [],
      isDestroyed: false,
      isPlaybackMode: false,
      isIdle: false,
      initialLoadComplete: false,
      resolvedLocation: "global",
      initialUrlState: null,
      PANEL_ORDER_KEY,
      PANEL_SPANS_KEY,
    };

    this.panelLayout = new PanelLayoutManager(this.state, {
      openCountryStory: () => {},
      openCountryBrief: () => {},
      loadAllData: () => Promise.resolve(),
      updateMonitorResults: () => {},
      loadSecurityAdvisories: () => Promise.resolve(),
    });

    this.eventHandlers = new EventHandlerManager(this.state, {
      updateSearchIndex: () => {},
      loadAllData: () => Promise.resolve(),
      flushStaleRefreshes: () => {},
      setHiddenSince: () => {},
      loadDataForLayer: (layer: string) => {
        // Only implement weather loading here; other layers handled elsewhere
        if (layer === 'weather') {
          // Dynamically import the weather service to avoid circular deps at module load
          void (async () => {
            try {
              // Indicate loading
              try { (this.state.map as any)?.setLayerLoading?.('weather', true); } catch {}

              const svc = await import('@/services/weather');
              const alerts = await svc.fetchWeatherAlerts().catch(() => []);
              const status = typeof svc.getWeatherStatus === 'function' ? svc.getWeatherStatus() : '';

              // Set on the active map if available (pass status for UI)
              try { (this.state.map as any)?.setWeatherAlerts(alerts, status); } catch (e) { /* swallow */ }

              // Mark layer ready
              try { (this.state.map as any)?.setLayerReady?.('weather', (alerts && alerts.length > 0) || false); } catch {}
            } catch (e) {
              console.warn('[App] Failed to load weather alerts', e);
              try { (this.state.map as any)?.setLayerReady?.('weather', false); } catch {}
            } finally {
              try { (this.state.map as any)?.setLayerLoading?.('weather', false); } catch {}
            }
          })();
        }
      },
      waitForAisData: () => Promise.resolve(),
      syncDataFreshnessWithLayers: () => {},
      ensureCorrectZones: () => this.panelLayout.ensureCorrectZones(),
      refreshOpenCountryBrief: () => {},
      stopLayerActivity: () => {},
    });

    this.modules = [
      this.panelLayout,
      this.eventHandlers,
    ];
  }

  public async init(): Promise<void> {
    const initStart = performance.now();
    await initDB();
    await initI18n();

    // Wait for sidecar readiness on desktop so backend hits a live server
    if (isDesktopRuntime()) {
      await waitForSidecarReady(3000);
    }

    const resolvedRegion = await resolveUserRegion();
    this.state.resolvedLocation = resolvedRegion;

    // Layout (creates map + panels)
    this.panelLayout.init();

    // Event listeners + URL sync
    this.eventHandlers.startHeaderClock();
    this.eventHandlers.setupMapLayerHandlers();
    this.eventHandlers.init();
    this.eventHandlers.setupUrlStateSync();

    // Helper to process flights through all panels
    const processFlights = (rawFlights: import("@/services/radar-stream").RadarFlight[]) => {
      // Merge with simulation if active
      const flights = mergeWithSimulation(rawFlights);
      
      (this.state as any).radarFlights = flights;
      if ((this.state.map as any)?.setRadarFlights) {
        (this.state.map as any).setRadarFlights(flights);
      }
      const hrPanel = this.state.panels["high-risk"];
      if (hrPanel && typeof (hrPanel as any).updateFlights === "function") {
        (hrPanel as any).updateFlights(flights);
      }
      // Also feed threat analysis panel
      const taPanel = this.state.panels["insights"];
      if (taPanel && typeof (taPanel as any).updateThreatAnalysis === "function") {
        (taPanel as any).updateThreatAnalysis(flights);
      }
      // Feed classification panel (Objective 1)
      const clsPanel = this.state.panels["classification"];
      if (clsPanel && typeof (clsPanel as any).updateClassification === "function") {
        (clsPanel as any).updateClassification(flights);
      }
      // Feed trajectory panel (Objective 2)
      const trajPanel = this.state.panels["trajectory"];
      if (trajPanel && typeof (trajPanel as any).updateTrajectories === "function") {
        (trajPanel as any).updateTrajectories(flights);
      }
      // Feed anomaly detection panel (Objective 3)
      const anomPanel = this.state.panels["anomaly"];
      if (anomPanel && typeof (anomPanel as any).updateAnomalies === "function") {
        (anomPanel as any).updateAnomalies(flights);
      }
      // Feed stats bar
      const statsBar = (this.state as any).statsBar;
      if (statsBar && typeof statsBar.update === "function") {
        statsBar.update(flights);
      }
    };

    // Start radar stream — polls FastAPI /api/radar/stream every 10s
    this.unsubRadar = onRadarUpdate((flights) => {
      // Always keep the latest real (non-simulated) radar flights
      (this as any)._latestRealRadarFlights = flights;
      processFlights(flights);
    });
    startRadarStream();

    // Subscribe to simulation updates to refresh UI when simulation state changes
    const statsBar = (this.state as any).statsBar;
    if (statsBar && typeof statsBar.setOnSimulationToggle === "function") {
      statsBar.setOnSimulationToggle(() => {
        // Re-process latest real flights with new simulation state
        const currentFlights =
          (this as any)._latestRealRadarFlights ?? [];
        processFlights(currentFlights);
      });
    }

    // Also listen to simulation updates directly for real-time updates
    onSimulationUpdate(() => {
      const currentFlights =
        (this as any)._latestRealRadarFlights ?? [];
      processFlights(currentFlights);
    });

    // Wire flight click handlers — map click → FlightDetailCard
    const flightDetailCard = (this.state as any).flightDetailCard;
    const agentPanel = (this.state as any).agentPanel;

    const showFlightDetail = (flight: any) => {
      if (flightDetailCard && typeof flightDetailCard.show === "function") {
        flightDetailCard.show(flight);
      }
    };

    this.selectedFlightSyncHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ flightId: string | null }>;
      const selectedId = customEvent.detail?.flightId ?? null;
      document.querySelectorAll<HTMLElement>('.threat-item, .traj-item, .anomaly-item').forEach((el) => {
        const fid = el.dataset.fid ?? null;
        el.classList.toggle('selected', !!selectedId && fid === selectedId);
      });
    };
    window.addEventListener('skyguard-flight-selected', this.selectedFlightSyncHandler as EventListener);

    // Map radar flight click
    if ((this.state.map as any)?.setOnRadarFlightClick) {
      (this.state.map as any).setOnRadarFlightClick(showFlightDetail);
    }

    // ThreatCenterPanel flight click
    const hrPanel = this.state.panels["high-risk"];
    if (hrPanel && typeof (hrPanel as any).setFlightClickHandler === "function") {
      (hrPanel as any).setFlightClickHandler(showFlightDetail);
    }

    // TrajectoryPanel flight click
    const trajPanel = this.state.panels["trajectory"];
    if (trajPanel && typeof (trajPanel as any).setFlightClickHandler === "function") {
      (trajPanel as any).setFlightClickHandler(showFlightDetail);
    }

    // AnomalyDetectionPanel flight click
    const anomPanel = this.state.panels["anomaly"];
    if (anomPanel && typeof (anomPanel as any).setFlightClickHandler === "function") {
      (anomPanel as any).setFlightClickHandler(showFlightDetail);
    }

    // FlightDetailCard → Agent Panel
    if (flightDetailCard && agentPanel) {
      flightDetailCard.setOnAgentClick((flight: any) => {
        agentPanel.analyze(flight);
      });
    }

    this.state.initialLoadComplete = true;
    trackEvent("wm_app_loaded", {
      load_time_ms: Math.round(performance.now() - initStart),
      panel_count: Object.keys(this.state.panels).length,
    });
  }

  public destroy(): void {
    this.state.isDestroyed = true;
    stopRadarStream();
    this.unsubRadar?.();
    if (this.selectedFlightSyncHandler) {
      window.removeEventListener('skyguard-flight-selected', this.selectedFlightSyncHandler as EventListener);
      this.selectedFlightSyncHandler = null;
    }

    // Destroy all modules in reverse order
    for (let i = this.modules.length - 1; i >= 0; i--) {
      this.modules[i]!.destroy();
    }

    this.state.map?.destroy();
  }
}
