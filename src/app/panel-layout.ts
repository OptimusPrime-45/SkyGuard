import type { AppContext, AppModule } from "@/app/app-context";
import { clearAllPendingCalls } from "@/app/pending-panel-data";
import { MapContainer, ThreatAnalysisPanel } from "@/components";
import { ThreatCenterPanel } from "@/components/ThreatCenterPanel";
import { ClassificationPanel } from "@/components/ClassificationPanel";
import { TrajectoryPanel } from "@/components/TrajectoryPanel";
import { AnomalyDetectionPanel } from "@/components/AnomalyDetectionPanel";
import { AirspaceStatsBar } from "@/components/AirspaceStatsBar";
import { FlightDetailCard } from "@/components/FlightDetailCard";
import { AgentPanel } from "@/components/AgentPanel";
import { debounce, saveToStorage, loadFromStorage } from "@/utils";
import { DEFAULT_PANELS, STORAGE_KEYS } from "@/config";
import { t } from "@/services/i18n";
import { getCurrentTheme } from "@/utils";

export interface PanelLayoutCallbacks {
  openCountryStory: (code: string, name: string) => void;
  openCountryBrief: (code: string) => void;
  loadAllData: () => Promise<void>;
  updateMonitorResults: () => void;
  loadSecurityAdvisories?: () => Promise<void>;
}

export class PanelLayoutManager implements AppModule {
  private ctx: AppContext;
  private panelDragCleanupHandlers: Array<() => void> = [];
  private resolvedPanelOrder: string[] = [];
  private bottomSetMemory: Set<string> = new Set();
  private readonly applyTimeRangeFilterDebounced: (() => void) & {
    cancel(): void;
  };

  constructor(ctx: AppContext, _callbacks: PanelLayoutCallbacks) {
    this.ctx = ctx;
    this.applyTimeRangeFilterDebounced = debounce(() => {
      this.applyTimeRangeFilterToNewsPanels();
    }, 120);
  }

  init(): void {
    this.renderLayout();
  }

  destroy(): void {
    clearAllPendingCalls();
    this.applyTimeRangeFilterDebounced.cancel();
    this.panelDragCleanupHandlers.forEach((cleanup) => cleanup());
    this.panelDragCleanupHandlers = [];
    window.removeEventListener("resize", this.ensureCorrectZones);
  }

  renderLayout(): void {
    this.ctx.container.innerHTML = `
      ${this.ctx.isDesktopApp ? '<div class="tauri-titlebar" data-tauri-drag-region></div>' : ""}
      <div class="header">
        <div class="header-left">
          <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="variant-switcher"></div>
          <span class="logo">SkyGuard AI</span><span class="logo-mobile">SkyGuard AI Monitor</span>
          <button class="mobile-settings-btn" id="mobileSettingsBtn" title="${t("header.settings")}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>${t("header.live")}</span>
          </div>
          <div class="region-selector">
            <select id="regionSelect" class="region-select">
              <option value="global">${t("components.deckgl.views.global")}</option>
              <option value="america">${t("components.deckgl.views.americas")}</option>
              <option value="mena">${t("components.deckgl.views.mena")}</option>
              <option value="eu">${t("components.deckgl.views.europe")}</option>
              <option value="asia">${t("components.deckgl.views.asia")}</option>
              <option value="latam">${t("components.deckgl.views.latam")}</option>
              <option value="africa">${t("components.deckgl.views.africa")}</option>
              <option value="oceania">${t("components.deckgl.views.oceania")}</option>
            </select>
          </div>
          <button class="mobile-search-btn" id="mobileSearchBtn" aria-label="${t("header.search")}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div class="header-right">
          <button class="search-btn" id="searchBtn"><kbd>⌘K</kbd> ${t("header.search")}</button>
          ${this.ctx.isDesktopApp ? "" : `<button class="fullscreen-btn" id="fullscreenBtn" title="${t("header.fullscreen")}">⛶</button>`}
          <span id="unifiedSettingsMount"></span>
        </div>
      </div>
      <div class="mobile-menu-overlay" id="mobileMenuOverlay"></div>
      <nav class="mobile-menu" id="mobileMenu">
        <div class="mobile-menu-header">
          <span class="mobile-menu-title">SkyGuard AI MONITOR</span>
          <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuRegion">
          <span class="mobile-menu-item-icon">🌐</span>
          <span class="mobile-menu-item-label">${t("components.deckgl.views.global")}</span>
          <span class="mobile-menu-chevron">▸</span>
        </button>
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuSettings">
          <span class="mobile-menu-item-icon">⚙️</span>
          <span class="mobile-menu-item-label">${t("header.settings")}</span>
        </button>
        <button class="mobile-menu-item" id="mobileMenuTheme">
          <span class="mobile-menu-item-icon">${getCurrentTheme() === "dark" ? "☀️" : "🌙"}</span>
          <span class="mobile-menu-item-label">${getCurrentTheme() === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
        <div class="mobile-menu-divider"></div>
      </nav>
      <div class="region-sheet-backdrop" id="regionSheetBackdrop"></div>
      <div class="region-bottom-sheet" id="regionBottomSheet">
        <div class="region-sheet-header">${t("header.selectRegion")}</div>
        <div class="region-sheet-divider"></div>
        ${[
          { value: "global", label: t("components.deckgl.views.global") },
          { value: "america", label: t("components.deckgl.views.americas") },
          { value: "mena", label: t("components.deckgl.views.mena") },
          { value: "eu", label: t("components.deckgl.views.europe") },
          { value: "asia", label: t("components.deckgl.views.asia") },
          { value: "latam", label: t("components.deckgl.views.latam") },
          { value: "africa", label: t("components.deckgl.views.africa") },
          { value: "oceania", label: t("components.deckgl.views.oceania") },
        ]
          .map(
            (r) =>
              `<button class="region-sheet-option ${r.value === "global" ? "active" : ""}" data-region="${r.value}">
          <span>${r.label}</span>
          <span class="region-sheet-check">${r.value === "global" ? "✓" : ""}</span>
        </button>`,
          )
          .join("")}
      </div>
      <div class="main-content">
        <div class="map-section" id="mapSection">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-title">Airspace Monitor</span>
            </div>
            <span class="header-clock" id="headerClock" translate="no"></span>
            <div class="map-header-actions">
              <div class="map-dimension-toggle" id="mapDimensionToggle">
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, "flat") === "globe" ? "" : " active"}" data-mode="flat" title="2D Map">2D</button>
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, "flat") === "globe" ? " active" : ""}" data-mode="globe" title="3D Globe">3D</button>
              </div>
              <button class="map-pin-btn" id="mapFullscreenBtn" title="Fullscreen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              </button>
              <button class="map-pin-btn" id="mapPinBtn" title="${t("header.pinMap")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1 1 1 0 011 1v3.76z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="map-container" id="mapContainer"></div>
          <div class="map-resize-handle" id="mapResizeHandle"></div>
          <div class="map-bottom-grid" id="mapBottomGrid"></div>
        </div>
        <div class="panels-grid" id="panelsGrid"></div>
        <button class="search-mobile-fab" id="searchMobileFab" aria-label="Search">\u{1F50D}</button>
      </div>
      <footer class="site-footer">
        <div class="site-footer-brand">
          <div class="site-footer-brand-text">
            <span class="site-footer-name">SkyGuard AI MONITOR</span>
            <span class="site-footer-sub">Intelligent Airspace Monitoring System</span>
          </div>
        </div>
        <span class="site-footer-copy">&copy; ${new Date().getFullYear()} SkyGuard AI Monitor</span>
      </footer>
    `;

    this.createPanels();

    if (this.ctx.isMobile) {
      this.setupMobileMapToggle();
    }
  }

  private setupMobileMapToggle(): void {
    const mapSection = document.getElementById("mapSection");
    const headerLeft = mapSection?.querySelector(".panel-header-left");
    if (!mapSection || !headerLeft) return;

    const stored = localStorage.getItem("mobile-map-collapsed");
    const collapsed = stored === "true";
    if (collapsed) mapSection.classList.add("collapsed");

    const updateBtn = (btn: HTMLButtonElement, isCollapsed: boolean) => {
      btn.textContent = isCollapsed
        ? `▶ ${t("components.map.showMap")}`
        : `▼ ${t("components.map.hideMap")}`;
    };

    const btn = document.createElement("button");
    btn.className = "map-collapse-btn";
    updateBtn(btn, collapsed);
    headerLeft.after(btn);

    btn.addEventListener("click", () => {
      const isCollapsed = mapSection.classList.toggle("collapsed");
      updateBtn(btn, isCollapsed);
      localStorage.setItem("mobile-map-collapsed", String(isCollapsed));
      if (!isCollapsed) window.dispatchEvent(new Event("resize"));
    });
  }

  renderCriticalBanner(_postures: unknown[]): void {
    // No-op in airspace monitoring mode
  }

  applyPanelSettings(): void {
    Object.entries(this.ctx.panelSettings).forEach(([key, config]) => {
      if (key === "map") {
        const mapSection = document.getElementById("mapSection");
        if (mapSection) {
          mapSection.classList.toggle("hidden", !config.enabled);
          const mainContent = document.querySelector(".main-content");
          if (mainContent) {
            mainContent.classList.toggle("map-hidden", !config.enabled);
          }
          this.ensureCorrectZones();
        }
        return;
      }
      const panel = this.ctx.panels[key];
      panel?.toggle(config.enabled);
    });
  }

  private shouldCreatePanel(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(DEFAULT_PANELS, key);
  }

  private createPanel<T extends import("@/components/Panel").Panel>(
    key: string,
    factory: () => T,
  ): T | null {
    if (!this.shouldCreatePanel(key)) return null;
    const panel = factory();
    this.ctx.panels[key] = panel;
    return panel;
  }

  private createPanels(): void {
    const panelsGrid = document.getElementById("panelsGrid")!;

    const mapContainer = document.getElementById("mapContainer") as HTMLElement;
    const preferGlobe =
      loadFromStorage<string>(STORAGE_KEYS.mapMode, "flat") === "globe";
    this.ctx.map = new MapContainer(
      mapContainer,
      {
        zoom: this.ctx.isMobile ? 2.5 : 4.0,
        pan: { x: 0, y: 0 },
        view: "asia",
        layers: this.ctx.mapLayers,
        timeRange: "all",
      },
      preferGlobe,
    );

    this.ctx.currentTimeRange = this.ctx.map.getTimeRange();

    // Create AirspaceStatsBar (above panels)
    const statsBar = new AirspaceStatsBar();
    (this.ctx as any).statsBar = statsBar;
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      const mapSection = document.getElementById('mapSection');
      if (mapSection) {
        mainContent.insertBefore(statsBar.getElement(), mapSection);
      }
    }

    // Create ThreatCenterPanel (High-Risk Objects sidebar)
    if (
      this.shouldCreatePanel("high-risk") ||
      this.shouldCreatePanel("live-news")
    ) {
      const threatPanel = new ThreatCenterPanel();
      this.ctx.panels["high-risk"] = threatPanel;
    }

    // Create Insights panel (AI Threat Analysis)
    this.createPanel("insights", () => new ThreatAnalysisPanel());

    // Create Classification panel (Objective 1)
    this.createPanel("classification", () => new ClassificationPanel());

    // Create Trajectory panel (Objective 2)
    this.createPanel("trajectory", () => new TrajectoryPanel());

    // Create Anomaly Detection panel (Objective 3)
    this.createPanel("anomaly", () => new AnomalyDetectionPanel());

    // Create FlightDetailCard (fixed sidebar - not a grid panel)
    const flightDetailCard = new FlightDetailCard();
    (this.ctx as any).flightDetailCard = flightDetailCard;
    document.body.appendChild(flightDetailCard.getElement());

    // Create AgentPanel (slide-out overlay - not a grid panel)
    const agentPanel = new AgentPanel();
    (this.ctx as any).agentPanel = agentPanel;
    document.body.appendChild(agentPanel.getOverlayElement());
    document.body.appendChild(agentPanel.getPanelElement());
    document.body.appendChild(agentPanel.getFabElement());

    // Simple panel ordering
    const panelKeys = ["high-risk", "classification", "anomaly", "trajectory", "insights"];
    panelKeys.forEach((key) => {
      const panel = this.ctx.panels[key];
      if (panel) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });
    this.resolvedPanelOrder = panelKeys;

    window.addEventListener("resize", () => this.ensureCorrectZones());

    this.applyPanelSettings();
    this.applyInitialUrlState();
  }

  private applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      const panel = this.ctx.newsPanels[category];
      if (!panel) return;
      const filtered = this.filterItemsByTimeRange(items);
      if (filtered.length === 0 && items.length > 0) {
        panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
        return;
      }
      panel.renderNews(filtered);
    });
  }

  private filterItemsByTimeRange(
    items: import("@/types").NewsItem[],
    range: import("@/components").TimeRange = this.ctx.currentTimeRange,
  ): import("@/types").NewsItem[] {
    if (range === "all") return items;
    const ranges: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "48h": 48 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      all: Infinity,
    };
    const cutoff = Date.now() - (ranges[range] ?? Infinity);
    return items.filter((item) => {
      const ts =
        item.pubDate instanceof Date
          ? item.pubDate.getTime()
          : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  private getTimeRangeLabel(): string {
    const labels: Record<string, string> = {
      "1h": "the last hour",
      "6h": "the last 6 hours",
      "24h": "the last 24 hours",
      "48h": "the last 48 hours",
      "7d": "the last 7 days",
      all: "all time",
    };
    return labels[this.ctx.currentTimeRange] ?? "the last 7 days";
  }

  private applyInitialUrlState(): void {
    if (!this.ctx.initialUrlState || !this.ctx.map) return;

    const { view, zoom, lat, lon, timeRange, layers } =
      this.ctx.initialUrlState;

    if (view) {
      this.ctx.map.setView(view);
    }

    if (timeRange) {
      this.ctx.map.setTimeRange(timeRange);
    }

    if (layers) {
      this.ctx.mapLayers = layers;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.ctx.map.setLayers(layers);
    }

    if (lat !== undefined && lon !== undefined) {
      const effectiveZoom = zoom ?? this.ctx.map.getState().zoom;
      if (effectiveZoom > 2) this.ctx.map.setCenter(lat, lon, zoom);
    } else if (!view && zoom !== undefined) {
      this.ctx.map.setZoom(zoom);
    }

    const regionSelect = document.getElementById(
      "regionSelect",
    ) as HTMLSelectElement;
    const currentView = this.ctx.map.getState().view;
    if (regionSelect && currentView) {
      regionSelect.value = currentView;
    }
  }

  savePanelOrder(): void {
    const grid = document.getElementById("panelsGrid");
    const bottomGrid = document.getElementById("mapBottomGrid");
    if (!grid || !bottomGrid) return;

    const sidebarIds = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const bottomIds = Array.from(bottomGrid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const allOrder = this.buildUnifiedOrder(sidebarIds, bottomIds);
    this.resolvedPanelOrder = allOrder;
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(allOrder));
    localStorage.setItem(
      this.ctx.PANEL_ORDER_KEY + "-bottom-set",
      JSON.stringify(Array.from(this.bottomSetMemory)),
    );
  }

  private buildUnifiedOrder(
    sidebarIds: string[],
    bottomIds: string[],
  ): string[] {
    const presentIds = [...sidebarIds, ...bottomIds];
    const uniqueIds: string[] = [];
    const seen = new Set<string>();

    presentIds.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      uniqueIds.push(id);
    });

    const previousOrder = new Map<string, number>();
    this.resolvedPanelOrder.forEach((id, index) => {
      if (seen.has(id) && !previousOrder.has(id)) {
        previousOrder.set(id, index);
      }
    });
    uniqueIds.forEach((id, index) => {
      if (!previousOrder.has(id)) {
        previousOrder.set(id, this.resolvedPanelOrder.length + index);
      }
    });

    const edges = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    uniqueIds.forEach((id) => {
      edges.set(id, new Set());
      indegree.set(id, 0);
    });

    const addConstraints = (ids: string[]) => {
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1]!;
        const next = ids[i]!;
        if (prev === next || !seen.has(prev) || !seen.has(next)) continue;
        const nextIds = edges.get(prev);
        if (!nextIds || nextIds.has(next)) continue;
        nextIds.add(next);
        indegree.set(next, (indegree.get(next) ?? 0) + 1);
      }
    };

    addConstraints(sidebarIds);
    addConstraints(bottomIds);

    const compareIds = (a: string, b: string) =>
      (previousOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (previousOrder.get(b) ?? Number.MAX_SAFE_INTEGER);

    const available = uniqueIds
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .sort(compareIds);
    const merged: string[] = [];

    while (available.length > 0) {
      const current = available.shift()!;
      merged.push(current);

      edges.get(current)?.forEach((next) => {
        const nextIndegree = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextIndegree);
        if (nextIndegree === 0) {
          available.push(next);
        }
      });
      available.sort(compareIds);
    }

    return merged.length === uniqueIds.length
      ? merged
      : uniqueIds.sort(compareIds);
  }

  private getEffectiveUltraWide(): boolean {
    const mapSection = document.getElementById("mapSection");
    const mapEnabled = !mapSection?.classList.contains("hidden");
    return window.innerWidth >= 1600 && mapEnabled;
  }

  private insertByOrder(grid: HTMLElement, el: HTMLElement, key: string): void {
    const idx = this.resolvedPanelOrder.indexOf(key);
    if (idx === -1) {
      grid.appendChild(el);
      return;
    }
    for (let i = idx + 1; i < this.resolvedPanelOrder.length; i++) {
      const nextKey = this.resolvedPanelOrder[i]!;
      const nextEl = grid.querySelector(
        `[data-panel="${CSS.escape(nextKey)}"]`,
      );
      if (nextEl) {
        grid.insertBefore(el, nextEl);
        return;
      }
    }
    grid.appendChild(el);
  }

  private wasUltraWide = false;

  public ensureCorrectZones(): void {
    const effectiveUltraWide = this.getEffectiveUltraWide();

    if (effectiveUltraWide === this.wasUltraWide) return;
    this.wasUltraWide = effectiveUltraWide;

    const grid = document.getElementById("panelsGrid");
    const bottomGrid = document.getElementById("mapBottomGrid");
    if (!grid || !bottomGrid) return;

    if (!effectiveUltraWide) {
      const panelsInBottom = Array.from(
        bottomGrid.querySelectorAll(".panel"),
      ) as HTMLElement[];
      panelsInBottom.forEach((panelEl) => {
        const id = panelEl.dataset.panel;
        if (!id) return;
        this.insertByOrder(grid, panelEl, id);
      });
    } else {
      this.bottomSetMemory.forEach((id) => {
        const el = grid.querySelector(`[data-panel="${CSS.escape(id)}"]`);
        if (el) {
          this.insertByOrder(bottomGrid, el as HTMLElement, id);
        }
      });
    }
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.dataset.panel = key;
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let rafId = 0;
    const DRAG_THRESHOLD = 8;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (el.dataset.resizing === "true") return;
      if (
        target.classList?.contains("panel-resize-handle") ||
        target.closest?.(".panel-resize-handle") ||
        target.classList?.contains("panel-col-resize-handle") ||
        target.closest?.(".panel-col-resize-handle")
      )
        return;
      if (target.closest("button, a, input, select, textarea, .panel-content"))
        return;

      isDragging = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (!dragStarted) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        dragStarted = true;
        el.classList.add("dragging");
      }
      const cx = e.clientX;
      const cy = e.clientY;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this.handlePanelDragMove(el, cx, cy);
        rafId = 0;
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (dragStarted) {
        el.classList.remove("dragging");
        const isInBottom = !!el.closest(".map-bottom-grid");
        if (isInBottom) {
          this.bottomSetMemory.add(key);
        } else {
          this.bottomSetMemory.delete(key);
        }
        this.savePanelOrder();
      }
      dragStarted = false;
    };

    el.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    this.panelDragCleanupHandlers.push(() => {
      el.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      isDragging = false;
      dragStarted = false;
      el.classList.remove("dragging");
    });
  }

  private handlePanelDragMove(
    dragging: HTMLElement,
    clientX: number,
    clientY: number,
  ): void {
    const grid = document.getElementById("panelsGrid");
    const bottomGrid = document.getElementById("mapBottomGrid");
    if (!grid || !bottomGrid) return;

    dragging.style.pointerEvents = "none";
    const target = document.elementFromPoint(clientX, clientY);
    dragging.style.pointerEvents = "";

    if (!target) return;

    // Check if we are over a grid or a panel inside a grid
    const targetGrid = (target.closest(".panels-grid") ||
      target.closest(".map-bottom-grid")) as HTMLElement | null;
    const targetPanel = target.closest(".panel") as HTMLElement | null;

    if (!targetGrid && !targetPanel) return;

    const currentTargetGrid =
      targetGrid ||
      (targetPanel ? (targetPanel.parentElement as HTMLElement) : null);
    if (
      !currentTargetGrid ||
      (currentTargetGrid !== grid && currentTargetGrid !== bottomGrid)
    )
      return;

    if (
      targetPanel &&
      targetPanel !== dragging &&
      !targetPanel.classList.contains("hidden")
    ) {
      const targetRect = targetPanel.getBoundingClientRect();
      const draggingRect = dragging.getBoundingClientRect();

      const children = Array.from(currentTargetGrid.children);
      const dragIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(targetPanel);

      const sameRow = Math.abs(draggingRect.top - targetRect.top) < 30;
      const targetMid = sameRow
        ? targetRect.left + targetRect.width / 2
        : targetRect.top + targetRect.height / 2;
      const cursorPos = sameRow ? clientX : clientY;

      if (dragIdx === -1) {
        // Moving from one grid to another
        if (cursorPos < targetMid) {
          currentTargetGrid.insertBefore(dragging, targetPanel);
        } else {
          currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
        }
      } else {
        // Reordering within same grid
        if (dragIdx < targetIdx) {
          if (cursorPos > targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
          }
        } else {
          if (cursorPos < targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel);
          }
        }
      }
    } else if (currentTargetGrid !== dragging.parentElement) {
      // Dragging over an empty or near-empty grid zone
      currentTargetGrid.appendChild(dragging);
    }
  }

  getLocalizedPanelName(panelKey: string, fallback: string): string {
    if (panelKey === "runtime-config") {
      return t("modals.runtimeConfig.title");
    }
    const key = panelKey.replace(/-([a-z])/g, (_match, group: string) =>
      group.toUpperCase(),
    );
    const lookup = `panels.${key}`;
    const localized = t(lookup);
    return localized === lookup ? fallback : localized;
  }

  getAllSourceNames(): string[] {
    return [];
  }
}
