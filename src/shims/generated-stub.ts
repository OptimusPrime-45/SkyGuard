/**
 * Stub module for deleted @/generated/* protobuf/RPC code.
 * Every exported class is a no-op: constructable, with every method
 * returning an empty/default value so callers don't crash at runtime.
 */

const methodProxy: ProxyHandler<Record<string, unknown>> = {
  get(_t, prop) {
    if (typeof prop === 'symbol') return undefined;
    // Return an async no-op for any method call
    return async () => ({});
  },
};

/** Base stub class — `new StubClient(...)` succeeds silently. */
class StubClient {
  constructor(..._args: any[]) {
    return new Proxy(this as any, methodProxy);
  }
}

export default {};

export class NewsServiceClient extends StubClient {}
export class MarketServiceClient extends StubClient {}
export class SeismologyServiceClient extends StubClient {}
export class IntelligenceServiceClient extends StubClient {}
export class ConflictServiceClient extends StubClient {}
export class MaritimeServiceClient extends StubClient {}
export class ResearchServiceClient extends StubClient {}
export class WildfireServiceClient extends StubClient {}
export class ClimateServiceClient extends StubClient {}
export class PredictionServiceClient extends StubClient {}
export class DisplacementServiceClient extends StubClient {}
export class AviationServiceClient extends StubClient {}
export class UnrestServiceClient extends StubClient {}
export class CyberServiceClient extends StubClient {}
export class EconomicServiceClient extends StubClient {}
export class InfrastructureServiceClient extends StubClient {}
export class MilitaryServiceClient extends StubClient {}
export class PositiveEventsServiceClient extends StubClient {}
export class GivingServiceClient extends StubClient {}
export class TradeServiceClient extends StubClient {}
export class SupplyChainServiceClient extends StubClient {}
export class NaturalServiceClient extends StubClient {}
export class ApiError extends Error { constructor(...a: any[]) { super('stub'); } }
export class NavigationalWarning {}
export class TemporalAnomalyProto {};

// Common type-like exports that code might reference
export type SummarizeArticleResponse = { summary: string; provider: string; model: string; fallback: boolean; tokens: number; error: string; errorType: string; status: string; statusDetail: string };
export type ImageryScene = { id: string; satellite: string; datetime: string; resolutionM: number; mode: string; geometryGeojson: string; previewUrl: string; assetUrl: string };
