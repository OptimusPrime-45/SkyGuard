import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWeatherHazardsToRestrictions } from '../src/services/mapWeatherHazardsToRestrictions.js';

const sampleHazards = [
  {
    id: 'H1',
    name: 'Severe Thunderstorms',
    hazard: 'convective',
    severity: 'severe',
    coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]],
    effective_from: '2024-03-01T00:00:00Z',
    effective_to: '2024-03-01T06:00:00Z',
  },
  {
    id: 'H2',
    name: 'Moderate Turbulence',
    hazard: 'turbulence',
    severity: 'moderate',
    coordinates: [[[2,2],[3,2],[3,3],[2,3],[2,2]]],
    effective_from: '2024-03-01T01:00:00Z',
    effective_to: '2024-03-01T02:00:00Z',
  }
];

test('map weather hazards to restrictions', () => {
  const mapped = mapWeatherHazardsToRestrictions(sampleHazards);
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
