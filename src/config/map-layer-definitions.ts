import type { MapLayers } from '@/types';
import { isDesktopRuntime } from '@/services/runtime';

export type MapRenderer = 'flat' | 'globe';
export type MapVariant = 'full';

const _desktop: boolean = isDesktopRuntime();
void _desktop;

export interface LayerDefinition {
  key: keyof MapLayers;
  icon: string;
  i18nSuffix: string;
  fallbackLabel: string;
  renderers: MapRenderer[];
  premium?: 'locked' | 'enhanced';
}

const def = (
  key: keyof MapLayers,
  icon: string,
  i18nSuffix: string,
  fallbackLabel: string,
  renderers: MapRenderer[] = ['flat', 'globe'],
  premium?: 'locked' | 'enhanced',
): LayerDefinition => ({ key, icon, i18nSuffix, fallbackLabel, renderers, ...(premium && { premium }) });

// Only airspace-relevant layers
export const LAYER_REGISTRY: Partial<Record<keyof MapLayers, LayerDefinition>> = {
  flights:    def('flights',    '&#9992;',   'flightDelays',       'Aviation'),
  weather:    def('weather',    '&#9928;',   'weatherAlerts',      'Weather Alerts'),
  warzones:   def('warzones',   '&#9888;',   'warzones',           'Warzones'),
  noFlyZones: def('noFlyZones', '&#128683;', 'noFlyZones',         'No-Fly Zones'),
  dayNight:   def('dayNight',   '&#127763;', 'dayNight',           'Day/Night', ['flat']),
};

const VARIANT_LAYER_ORDER: Record<MapVariant, Array<keyof MapLayers>> = {
  full: ['warzones', 'noFlyZones', 'flights', 'weather', 'dayNight'],
};

const I18N_PREFIX = 'components.deckgl.layers.';

export function getLayersForVariant(variant: MapVariant, renderer: MapRenderer): LayerDefinition[] {
  const keys = VARIANT_LAYER_ORDER[variant] ?? VARIANT_LAYER_ORDER.full;
  return keys
    .map(k => LAYER_REGISTRY[k])
    .filter((d): d is LayerDefinition => !!d && d.renderers.includes(renderer));
}

export function getAllowedLayerKeys(variant: MapVariant): Set<keyof MapLayers> {
  return new Set(VARIANT_LAYER_ORDER[variant] ?? VARIANT_LAYER_ORDER.full);
}

export function sanitizeLayersForVariant(layers: MapLayers, variant: MapVariant): MapLayers {
  const allowed = getAllowedLayerKeys(variant);
  const sanitized = { ...layers };
  for (const key of Object.keys(sanitized) as Array<keyof MapLayers>) {
    if (!allowed.has(key)) sanitized[key] = false;
  }
  return sanitized;
}

export const LAYER_SYNONYMS: Record<string, Array<keyof MapLayers>> = {
  aviation: ['flights'],
  flight: ['flights'],
  airplane: ['flights'],
  plane: ['flights'],
  aircraft: ['flights'],
  drone: ['flights'],
  storm: ['weather'],
  hurricane: ['weather'],
  night: ['dayNight'],
  sun: ['dayNight'],
  war: ['warzones'],
  conflict: ['warzones'],
  combat: ['warzones'],
  battle: ['warzones'],
  restricted: ['noFlyZones'],
  prohibited: ['noFlyZones'],
  tfr: ['noFlyZones'],
  notam: ['noFlyZones'],
  airspace: ['noFlyZones', 'warzones'],
};

export function resolveLayerLabel(def: LayerDefinition, tFn?: (key: string) => string): string {
  if (tFn) {
    const translated = tFn(I18N_PREFIX + def.i18nSuffix);
    if (translated && translated !== I18N_PREFIX + def.i18nSuffix) return translated;
  }
  return def.fallbackLabel;
}

export function bindLayerSearch(container: HTMLElement): void {
  const searchInput = container.querySelector('.layer-search') as HTMLInputElement | null;
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const synonymHits = new Set<string>();
    if (q) {
      for (const [alias, keys] of Object.entries(LAYER_SYNONYMS)) {
        if (alias.includes(q)) keys.forEach(k => synonymHits.add(k));
      }
    }
    container.querySelectorAll('.layer-toggle').forEach(label => {
      const el = label as HTMLElement;
      if (el.hasAttribute('data-layer-hidden')) return;
      if (!q) { el.style.display = ''; return; }
      const key = label.getAttribute('data-layer') || '';
      const text = label.textContent?.toLowerCase() || '';
      const match = text.includes(q) || key.toLowerCase().includes(q) || synonymHits.has(key);
      el.style.display = match ? '' : 'none';
    });
  });
}
