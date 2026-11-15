import type { Continent } from '../types.ts';

export interface WorldwidePlaceResult {
  id: string;
  name: string;
  displayName: string;
  country: string;
  countryCode: string;
  continent: Continent;
  lat: number;
  lng: number;
  type: string;
  source: 'nominatim' | 'open-meteo' | 'catalog';
}

function inferContinent(lat: number, lng: number, countryCode?: string, country?: string): Continent {
  const cc = (countryCode || '').toUpperCase();
  const cLower = (country || '').toLowerCase();

  if (cLower.includes('antarctica') || lat <= -60) return 'Antarctica';

  const oceaniaCodes = new Set(['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'PF', 'NC']);
  if (oceaniaCodes.has(cc)) return 'Oceania';

  const northAmericaCodes = new Set([
    'US', 'CA', 'MX', 'CR', 'PA', 'GT', 'BZ', 'HN', 'SV', 'NI', 'CU', 'JM', 'DO', 'HT', 'BS', 'BB', 'TT', 'PR',
  ]);
  if (northAmericaCodes.has(cc)) return 'North America';

  const southAmericaCodes = new Set([
    'BR', 'AR', 'CL', 'PE', 'CO', 'EC', 'VE', 'BO', 'PY', 'UY', 'GY', 'SR',
  ]);
  if (southAmericaCodes.has(cc)) return 'South America';

  const europeCodes = new Set([
    'GB', 'FR', 'DE', 'IT', 'ES', 'PT', 'CH', 'AT', 'NL', 'BE', 'LU', 'IE', 'NO', 'SE', 'FI', 'DK', 'IS',
    'PL', 'CZ', 'HU', 'GR', 'HR', 'RO', 'BG', 'SK', 'SI', 'RS', 'UA', 'EE', 'LV', 'LT', 'MT', 'CY', 'MC', 'VA',
  ]);
  if (europeCodes.has(cc)) return 'Europe';

  const africaCodes = new Set([
    'ZA', 'MA', 'EG', 'KE', 'TZ', 'NG', 'GH', 'ET', 'UG', 'RW', 'NA', 'BW', 'MU', 'SC', 'TN', 'DZ', 'SN', 'ZW', 'ZM',
  ]);
  if (africaCodes.has(cc)) return 'Africa';

  const asiaCodes = new Set([
    'IN', 'AE', 'SG', 'TH', 'JP', 'ID', 'MY', 'VN', 'CN', 'KR', 'HK', 'TW', 'PH', 'LK', 'NP', 'BT', 'MV',
    'QA', 'OM', 'SA', 'KW', 'BH', 'JO', 'IL', 'TR', 'KZ', 'UZ', 'KH', 'LA', 'MM',
  ]);
  if (asiaCodes.has(cc)) return 'Asia';

  // Geographic fallback
  if (lng < -30 && lat > 12) return 'North America';
  if (lng < -30 && lat <= 12) return 'South America';
  if (lat > 35 && lng >= -25 && lng <= 45) return 'Europe';
  if (lat <= 35 && lat >= -35 && lng >= -20 && lng <= 52) return 'Africa';
  if (lat < -10 && lng > 110) return 'Oceania';
  return 'Asia';
}

export async function searchWorldwidePlaces(query: string): Promise<WorldwidePlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 1. Query OpenStreetMap Nominatim for global cities, states, countries, and landmarks
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', trimmed);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('accept-language', 'en');

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'VoyageINR-TravelPlanner/1.0 (https://voyageinr.app)',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (res.ok) {
      const items = (await res.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        type?: string;
        name?: string;
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
          country?: string;
          country_code?: string;
        };
      }>;

      if (Array.isArray(items) && items.length > 0) {
        return items.map((item) => {
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          const country = item.address?.country || item.display_name.split(',').pop()?.trim() || 'International';
          const cc = (item.address?.country_code || '').toUpperCase();
          const primaryName =
            item.name ||
            item.address?.city ||
            item.address?.town ||
            item.address?.village ||
            item.address?.state ||
            item.display_name.split(',')[0].trim();

          return {
            id: `osm-${item.place_id}`,
            name: primaryName,
            displayName: item.display_name,
            country,
            countryCode: cc,
            continent: inferContinent(lat, lng, cc, country),
            lat,
            lng,
            type: item.type || 'destination',
            source: 'nominatim' as const,
          };
        });
      }
    }
  } catch {
    // Fall through to Open-Meteo geocoding
  }

  // 2. Fallback to Open-Meteo Global Geocoding API
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', trimmed);
    url.searchParams.set('count', '8');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5500) });
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{
          id: number;
          name: string;
          latitude: number;
          longitude: number;
          country?: string;
          country_code?: string;
          admin1?: string;
          feature_code?: string;
        }>;
      };
      if (data.results && data.results.length > 0) {
        return data.results.map((r) => {
          const country = r.country || 'International';
          const cc = (r.country_code || '').toUpperCase();
          return {
            id: `om-${r.id}`,
            name: r.name,
            displayName: [r.name, r.admin1, country].filter(Boolean).join(', '),
            country,
            countryCode: cc,
            continent: inferContinent(r.latitude, r.longitude, cc, country),
            lat: r.latitude,
            lng: r.longitude,
            type: r.feature_code || 'city',
            source: 'open-meteo' as const,
          };
        });
      }
    }
  } catch {
    // Return empty array if both external geocoders fail
  }

  return [];
}
