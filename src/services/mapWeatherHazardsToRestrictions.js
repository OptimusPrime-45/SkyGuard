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
        effectiveFrom: h.effective_from || null,
        effectiveTo: h.effective_to || null,
        isActive: true,
        reason: h.hazard || null,
        lastUpdated: h.last_updated || null,
      };
    });
}
