import { toApiUrl } from '@/services/runtime';

export interface ImageryScene {
  id: string;
  satellite: string;
  datetime: string;
  resolutionM: number;
  mode: string;
  geometryGeojson: string;
  previewUrl: string;
  assetUrl: string;
}

export interface ImagerySearchParams {
  bbox: string;
  datetime?: string;
  source?: string;
  limit?: number;
}

export async function fetchImageryScenes(params: ImagerySearchParams): Promise<ImageryScene[]> {
  const url = new URL(toApiUrl('/api/imagery/v1/search-imagery'), window.location.origin);
  url.searchParams.set('bbox', params.bbox);
  if (params.datetime) url.searchParams.set('datetime', params.datetime);
  if (params.source) url.searchParams.set('source', params.source);
  if (params.limit) url.searchParams.set('limit', String(params.limit));

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.scenes ?? [];
}
