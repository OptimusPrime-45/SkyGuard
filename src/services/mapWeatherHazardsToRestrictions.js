function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function mapWeatherHazardsToRestrictions(hazards) {
  if (!Array.isArray(hazards)) return [];
  return hazards
    .filter(Boolean)
    .map((h) => {
      const severity = (h.severity || '').toLowerCase();
      let s = 'medium';
      if (severity === 'extreme' || severity === 'critical') s = 'critical';
      else if (severity === 'severe' || severity === 'high') s = 'high';
      else if (severity === 'moderate') s = 'medium';

      const effectiveFrom = normalizeDate(h.effective_from || h.validFrom);
      const effectiveTo = normalizeDate(h.effective_to || h.validTo);

      const id = `weather-${h.id}`;
      return {
        id,
        name: h.name || `Weather ${h.id}`,
        type: 'danger',
        severity: s,
        source: 'weather',
        geometry: {
          type: Array.isArray(h.coordinates) && Array.isArray(h.coordinates[0]) ? 'MultiPolygon' : 'Polygon',
          coordinates: h.coordinates || [],
        },
        effectiveFrom,
        effectiveTo,
        isActive: true,
        reason: h.hazard || null,
        lastUpdated: h.last_updated || null,
      };
    });
}
