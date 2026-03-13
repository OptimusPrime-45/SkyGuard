import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWeatherHazardsToRestrictions } from '../src/services/airspace-restrictions';

// Simple unit tests for mapping hazards -> restrictions
const sampleHazards = [
  {
    id: 'H1',
    type: 'CONVECTIVE',
    severity: 'severe',
    name: 'Severe Thunderstorms',
    description: 'Severe convective activity',
    coordinates: [[-95.5, 35.2], [-94.2, 35.8], [-93.1, 34.9], [-95.5, 35.2]],
    validFrom: new Date('2026-03-13T00:00:00Z'),
    validTo: new Date('2026-03-13T04:00:00Z'),
  },
  {
    id: 'H2',
    type: 'TURBULENCE',
    severity: 'moderate',
    name: 'Mountain Wave Turbulence',
    description: 'Moderate turbulence over mountains',
    coordinates: [[-106.8, 37.0], [-105.0, 39.0], [-104.0, 36.0], [-106.8, 37.0]],
    validFrom: new Date('2026-03-13T01:00:00Z'),
    validTo: new Date('2026-03-13T07:00:00Z'),
  }
];

test('map weather hazards to restrictions', () => {
  const mapped = mapWeatherHazardsToRestrictions(sampleHazards as any);
  assert.equal(mapped.length, 2, 'Should map two hazards');

  assert.equal(mapped[0].id, 'weather-H1');
  assert.equal(mapped[0].name, 'Severe Thunderstorms');
  assert.equal(mapped[0].type, 'danger');
  assert.equal(mapped[0].severity, 'high');
  assert.equal(mapped[0].source, 'weather');
  assert.deepEqual(mapped[0].geometry.coordinates, sampleHazards[0].coordinates);

  assert.equal(mapped[1].id, 'weather-H2');
  assert.equal(mapped[1].severity, 'medium');
});
