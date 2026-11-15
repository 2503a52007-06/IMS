import React, { useEffect, useState } from 'react';
import { ArrowRight, Compass, Globe, MapPin, RefreshCw, Search } from 'lucide-react';
import type { Continent, Destination, ExchangeRatesInfo, WorldwidePlace } from '../types';
import { formatForeignOrigin, formatINR } from '../utils/currency';
import { getDestinationImage } from '../utils/media';
import { WorldMap } from './WorldMap';

interface DestinationExplorerProps {
  destinations: Destination[];
  exchangeRates: ExchangeRatesInfo | null;
  onRefreshRates: () => void;
  onSelectForPlan: (place: {
    name: string;
    country: string;
    lat: number;
    lng: number;
    continent?: Continent;
  }) => void;
  onBrowseBookings: (destinationName: string) => void;
}

const CONTINENTS: Array<'All' | Continent> = [
  'All',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Africa',
  'Oceania',
  'Antarctica',
];

export function DestinationExplorer({
  destinations,
  exchangeRates,
  onRefreshRates,
  onSelectForPlan,
  onBrowseBookings,
}: DestinationExplorerProps) {
  const [selectedContinent, setSelectedContinent] = useState<'All' | Continent>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [livePlaces, setLivePlaces] = useState<WorldwidePlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeDest, setActiveDest] = useState<Destination | null>(
    destinations[0] || null
  );
  const [customPinnedPlace, setCustomPinnedPlace] = useState<WorldwidePlace | null>(null);

  useEffect(() => {
    if (!activeDest && destinations.length > 0) {
      setActiveDest(destinations[0]);
    }
  }, [destinations, activeDest]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setLivePlaces([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as { places?: WorldwidePlace[] };
        setLivePlaces(data.places || []);
      } catch {
        setLivePlaces([]);
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredDestinations = destinations.filter((d) => {
    const matchesContinent =
      selectedContinent === 'All' || d.continent === selectedContinent;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.country.toLowerCase().includes(q) ||
      d.continent.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q);
    return matchesContinent && matchesQuery;
  });

  // Compute dynamic INR rate conversion for destination cards when live rates exist
  const getDisplayDailyInr = (dest: Destination) => {
    if (dest.localCurrency === 'INR') {
      return { amountInr: dest.estimatedDailyLocal, converted: false };
    }
    const rate = exchangeRates?.inrPerUnit?.[dest.localCurrency];
    if (rate) {
      return {
        amountInr: Math.round(dest.estimatedDailyLocal * rate),
        converted: true,
      };
    }
    return { amountInr: dest.estimatedDailyInr, converted: true };
  };

  const mapPoint = customPinnedPlace
    ? {
        name: customPinnedPlace.name,
        lat: customPinnedPlace.lat,
        lng: customPinnedPlace.lng,
        country: customPinnedPlace.country,
      }
    : activeDest
    ? {
        name: activeDest.name,
        lat: activeDest.lat,
        lng: activeDest.lng,
        country: activeDest.country,
      }
    : { name: 'Hyderabad', lat: 17.385, lng: 78.4867, country: 'India' };

  return (
    <div className="space-y-10">
      {/* Editorial Hero Split */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Worldwide Travel Intelligence · All 7 Continents · Priced in INR (₹)
              </p>
              <h1 className="mt-3 font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
                Plan any journey across the globe in Indian Rupees
              </h1>
              <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                Search any city, region, or landmark worldwide. Generate weather-adapted itineraries, compare live-converted ₹ estimates, and send stay or transit requests directly to partners.
              </p>

              {/* Dynamic Worldwide Search Bar */}
              <div className="mt-7">
                <label htmlFor="global-place-search" className="sr-only">
                  Search any destination worldwide
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="global-place-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any city, country, or destination (e.g. Kyoto, Reykjavik, Cape Town, Goa)..."
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                  />
                </div>
                {searching && (
                  <p className="mt-2 text-xs text-slate-500">Searching worldwide geocoder...</p>
                )}

                {livePlaces.length > 0 && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-64 overflow-y-auto shadow-sm">
                    {livePlaces.map((place) => (
                      <div
                        key={place.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {place.name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {place.country} · {place.continent} · {place.source === 'catalog' ? 'Curated Sample' : 'Worldwide Geocoder'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setCustomPinnedPlace(place);
                              setSearchQuery('');
                              setLivePlaces([]);
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          >
                            View on Map
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onSelectForPlan({
                                name: place.name,
                                country: place.country,
                                lat: place.lat,
                                lng: place.lng,
                                continent: place.continent,
                              })
                            }
                            className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                          >
                            Plan Trip
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  onSelectForPlan({
                    name: mapPoint.name,
                    country: mapPoint.country || 'Worldwide',
                    lat: mapPoint.lat,
                    lng: mapPoint.lng,
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap"
              >
                <span>Build Personalized Plan</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500">
                16 curated global highlights · Unlimited dynamic geocoded places
              </span>
            </div>
          </div>

          <div className="lg:col-span-6 relative min-h-[280px] lg:min-h-full bg-slate-900">
            <img
              src={getDestinationImage('hero')}
              alt="Sunlit coastal cliffside town overlooking turquoise Mediterranean waters at golden hour"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <p className="text-xs font-medium text-slate-200">
                Global Coverage · Live Weather Adaptation · OpenStreetMap Routing
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                Every hotel, flight estimate, and attraction priced cleanly in ₹ (INR)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Full-width Live INR Exchange Rate Strip */}
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Globe className="h-4 w-4 text-blue-700" />
              <span>Live INR Conversion Benchmarks</span>
            </div>
            {exchangeRates?.available ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 font-mono-tabular">
                <span>1 USD = ₹{(exchangeRates.inrPerUnit.USD ?? 85).toFixed(2)}</span>
                <span>1 EUR = ₹{(exchangeRates.inrPerUnit.EUR ?? 91).toFixed(2)}</span>
                <span>1 GBP = ₹{(exchangeRates.inrPerUnit.GBP ?? 108).toFixed(2)}</span>
                <span>1 AED = ₹{(exchangeRates.inrPerUnit.AED ?? 23).toFixed(2)}</span>
                <span>1 SGD = ₹{(exchangeRates.inrPerUnit.SGD ?? 63).toFixed(2)}</span>
                <span>100 JPY = ₹{((exchangeRates.inrPerUnit.JPY ?? 0.56) * 100).toFixed(2)}</span>
              </div>
            ) : (
              <p className="text-xs text-amber-700">
                {exchangeRates?.errorMessage || 'Exchange-rate API currently unavailable.'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              {exchangeRates?.isCachedFallback
                ? 'Cached fallback rate'
                : exchangeRates?.source || 'INR Reference'}
            </span>
            <button
              type="button"
              onClick={onRefreshRates}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </section>

      {/* Continent Filter & Interactive Map Split */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Worldwide Destinations
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Explore sample regional highlights across all continents or search any place globally above.
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Filter destinations by continent"
            className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1"
          >
            {CONTINENTS.map((cont) => (
              <button
                key={cont}
                type="button"
                role="tab"
                aria-selected={selectedContinent === cont}
                onClick={() => setSelectedContinent(cont)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedContinent === cont
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cont}
              </button>
            ))}
          </div>
        </div>

        {/* Active Map Explorer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <WorldMap
              destination={mapPoint}
              attractions={customPinnedPlace ? [] : activeDest?.attractions || []}
              heightClass="h-[360px]"
            />
          </div>
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            {customPinnedPlace ? (
              <>
                <div className="text-xs text-slate-500">
                  Geocoded Worldwide Place · {customPinnedPlace.continent} · {customPinnedPlace.country}
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900">
                  {customPinnedPlace.name}
                </h3>
                <p className="text-sm text-slate-600">
                  {customPinnedPlace.displayName}
                </p>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  Coordinates: {customPinnedPlace.lat.toFixed(4)}, {customPinnedPlace.lng.toFixed(4)}
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectForPlan({
                        name: customPinnedPlace.name,
                        country: customPinnedPlace.country,
                        lat: customPinnedPlace.lat,
                        lng: customPinnedPlace.lng,
                        continent: customPinnedPlace.continent,
                      })
                    }
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Generate AI Plan for {customPinnedPlace.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomPinnedPlace(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Reset to Catalog
                  </button>
                </div>
              </>
            ) : activeDest ? (
              <>
                <div className="text-xs text-slate-500">
                  {activeDest.continent} · {activeDest.country} · Best: {activeDest.bestSeason}
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    {activeDest.name}
                  </h3>
                  <div className="text-right">
                    <span className="font-mono-tabular text-base font-bold text-slate-900">
                      {formatINR(getDisplayDailyInr(activeDest).amountInr)}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      est. daily / person
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {activeDest.description}
                </p>
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    Popular Attractions on Map
                  </p>
                  <ul className="space-y-2">
                    {activeDest.attractions.map((attr) => (
                      <li
                        key={attr.name}
                        className="flex items-start justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-medium text-slate-900">{attr.name}</span>
                          <span className="text-slate-500"> · {attr.category}</span>
                        </div>
                        <span className="font-mono-tabular text-slate-700 shrink-0">
                          {attr.estimatedCostInr === 0 ? 'Free' : formatINR(attr.estimatedCostInr)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectForPlan({
                        name: activeDest.name,
                        country: activeDest.country,
                        lat: activeDest.lat,
                        lng: activeDest.lng,
                        continent: activeDest.continent,
                      })
                    }
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Plan Trip Here
                  </button>
                  <button
                    type="button"
                    onClick={() => onBrowseBookings(activeDest.name)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View Stays & Transit
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Curated Sample Destination Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDestinations.map((dest) => {
            const daily = getDisplayDailyInr(dest);
            const isSelected = !customPinnedPlace && activeDest?.id === dest.id;
            return (
              <article
                key={dest.id}
                className={`overflow-hidden rounded-xl border bg-white transition-colors flex flex-col justify-between ${
                  isSelected ? 'border-blue-700 ring-1 ring-blue-700/20' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 relative">
                    <img
                      src={getDestinationImage(dest.imageKey)}
                      alt={`${dest.name}, ${dest.country}`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-slate-500">
                      {dest.continent} · {dest.country} · Sample Guide
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {dest.name}
                      </h3>
                      <span className="font-mono-tabular text-sm font-semibold text-slate-900 shrink-0">
                        {formatINR(daily.amountInr)}/day
                      </span>
                    </div>
                    {daily.converted && (
                      <p className="text-[11px] text-slate-500 font-mono-tabular">
                        Converted est. from {formatForeignOrigin(dest.estimatedDailyLocal, dest.localCurrency)}
                      </p>
                    )}
                    <p className="mt-2.5 text-sm text-slate-600 line-clamp-2">
                      {dest.description}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      Highlights: {dest.highlights.slice(0, 3).join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPinnedPlace(null);
                      setActiveDest(dest);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
                  >
                    <MapPin className="h-3.5 w-3.5 text-slate-500" />
                    <span>Inspect Map</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectForPlan({
                        name: dest.name,
                        country: dest.country,
                        lat: dest.lat,
                        lng: dest.lng,
                        continent: dest.continent,
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>Plan in ₹</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
