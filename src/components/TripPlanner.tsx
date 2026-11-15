import React, { useEffect, useState } from 'react';
import {
  CloudRain,
  Compass,
  Loader2,
  MapPin,
  Search,
  Sun,
  Thermometer,
  Umbrella,
  Wind,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  GeneratedItinerary,
  Listing,
  WeatherForecast,
  WorldwidePlace,
} from '../types';
import { readJsonResponse } from '../utils/api';
import { formatINR } from '../utils/currency';
import { WorldMap } from './WorldMap';

interface TripPlannerProps {
  initialDestination?: {
    name: string;
    country: string;
    lat: number;
    lng: number;
  } | null;
  listings: Listing[];
  onWeatherUpdated?: (weather: WeatherForecast | null) => void;
  onPlanContextUpdated?: (ctx: {
    destination: string;
    country: string;
    budgetInr: number;
  }) => void;
  onGoToBookings: (destinationName: string) => void;
}

const TRAVEL_STYLES = [
  { id: 'budget', label: 'Budget' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'family', label: 'Family' },
  { id: 'solo', label: 'Solo' },
  { id: 'honeymoon', label: 'Honeymoon' },
];

const PREFERENCE_OPTIONS = [
  'Culture & Heritage',
  'Nature & Scenic',
  'Local Culinary',
  'Museums & Indoor Art',
  'Beaches & Coast',
  'Shopping & Markets',
  'Wildlife & Outdoors',
];

export function TripPlanner({
  initialDestination,
  listings,
  onWeatherUpdated,
  onPlanContextUpdated,
  onGoToBookings,
}: TripPlannerProps) {
  const { authHeaders, user } = useAuth();

  const [originQuery, setOriginQuery] = useState('Hyderabad, India');
  const [originPoint, setOriginPoint] = useState({
    name: 'Hyderabad',
    country: 'India',
    lat: 17.385,
    lng: 78.4867,
  });
  const [originSuggestions, setOriginSuggestions] = useState<WorldwidePlace[]>([]);

  const [destQuery, setDestQuery] = useState(
    initialDestination ? `${initialDestination.name}, ${initialDestination.country}` : 'Tokyo, Japan'
  );
  const [destPoint, setDestPoint] = useState({
    name: initialDestination?.name || 'Tokyo',
    country: initialDestination?.country || 'Japan',
    lat: initialDestination?.lat ?? 35.6762,
    lng: initialDestination?.lng ?? 139.6503,
  });
  const [destSuggestions, setDestSuggestions] = useState<WorldwidePlace[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const defaultReturn = new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10);

  const [departureDate, setDepartureDate] = useState(today);
  const [returnDate, setReturnDate] = useState(defaultReturn);
  const [days, setDays] = useState(5);
  const [travelers, setTravelers] = useState(2);
  const [budgetInr, setBudgetInr] = useState(150000);
  const [travelStyle, setTravelStyle] = useState('family');
  const [preferences, setPreferences] = useState<string[]>([
    'Culture & Heritage',
    'Local Culinary',
  ]);

  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [itinerary, setItinerary] = useState<GeneratedItinerary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Sync incoming destination selection from Explore tab
  useEffect(() => {
    if (initialDestination) {
      setDestPoint({
        name: initialDestination.name,
        country: initialDestination.country,
        lat: initialDestination.lat,
        lng: initialDestination.lng,
      });
      setDestQuery(`${initialDestination.name}, ${initialDestination.country}`);
    }
  }, [initialDestination]);

  // Auto-calculate trip duration when dates change
  useEffect(() => {
    const start = new Date(departureDate).getTime();
    const end = new Date(returnDate).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      const diff = Math.max(1, Math.round((end - start) / 86400000) + 1);
      setDays(Math.min(diff, 30));
    }
  }, [departureDate, returnDate]);

  // Fetch live weather whenever destination coordinates change
  useEffect(() => {
    let active = true;
    async function loadWeather() {
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const res = await fetch(
          `/api/weather?lat=${destPoint.lat}&lng=${destPoint.lng}&name=${encodeURIComponent(destPoint.name)}`
        );
        const data = await readJsonResponse<WeatherForecast & { error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'Weather unavailable');
        if (active) {
          setWeather(data);
          onWeatherUpdated?.(data);
        }
      } catch (err) {
        if (active) {
          setWeather(null);
          setWeatherError(err instanceof Error ? err.message : 'Weather unavailable');
          onWeatherUpdated?.(null);
        }
      } finally {
        if (active) setWeatherLoading(false);
      }
    }
    loadWeather();
    onPlanContextUpdated?.({
      destination: destPoint.name,
      country: destPoint.country,
      budgetInr,
    });
    return () => {
      active = false;
    };
  }, [destPoint.lat, destPoint.lng, destPoint.name]);

  const searchPlace = async (
    query: string,
    setter: React.Dispatch<React.SetStateAction<WorldwidePlace[]>>
  ) => {
    if (query.trim().length < 2) {
      setter([]);
      return;
    }
    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(query.trim())}`);
      const data = await readJsonResponse<{ places?: WorldwidePlace[] }>(res);
      setter(data.places || []);
    } catch {
      setter([]);
    }
  };

  const togglePreference = (pref: string) => {
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setPlanError(null);
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          origin: originPoint.name,
          destination: destPoint.name,
          country: destPoint.country,
          lat: destPoint.lat,
          lng: destPoint.lng,
          departureDate,
          returnDate,
          days,
          travelers,
          budgetInr,
          travelStyle,
          preferences,
        }),
      });
      const data = await readJsonResponse<{
        plan?: GeneratedItinerary;
        weather?: WeatherForecast | null;
        error?: string;
      }>(res);
      if (!res.ok || !data.plan) {
        throw new Error(data.error || 'Could not generate personalized plan.');
      }
      setItinerary(data.plan);
      if (data.weather) {
        setWeather(data.weather);
        onWeatherUpdated?.(data.weather);
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to generate AI plan.');
    } finally {
      setGenerating(false);
    }
  };

  const matchingListings = listings.filter((l) =>
    l.destinationName.toLowerCase().includes(destPoint.name.toLowerCase()) ||
    destPoint.name.toLowerCase().includes(l.destinationName.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            AI Travel Planner & Weather Advisor
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure your global route and total INR budget. Weather forecasts automatically adapt outdoor plans with indoor alternatives.
          </p>
        </div>
        {user && (
          <p className="text-xs text-slate-500">
            Signed in as {user.name} · Generated plans are saved to your Bookings & Trips view
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Planning Form */}
        <form
          onSubmit={handleGeneratePlan}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          {/* Starting Location */}
          <div className="relative">
            <label htmlFor="plan-origin" className="block text-xs font-semibold text-slate-700">
              Starting Location
            </label>
            <div className="relative mt-1.5">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="plan-origin"
                type="text"
                value={originQuery}
                onChange={(e) => {
                  setOriginQuery(e.target.value);
                  searchPlace(e.target.value, setOriginSuggestions);
                }}
                placeholder="City or airport worldwide"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
            </div>
            {originSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                {originSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setOriginPoint({ name: p.name, country: p.country, lat: p.lat, lng: p.lng });
                      setOriginQuery(`${p.name}, ${p.country}`);
                      setOriginSuggestions([]);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    <span className="text-slate-500"> · {p.country} ({p.continent})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Destination Worldwide Search */}
          <div className="relative">
            <label htmlFor="plan-dest" className="block text-xs font-semibold text-slate-700">
              Destination (Worldwide Search)
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="plan-dest"
                type="text"
                value={destQuery}
                onChange={(e) => {
                  setDestQuery(e.target.value);
                  searchPlace(e.target.value, setDestSuggestions);
                }}
                placeholder="Search any city, state, or country worldwide..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
            </div>
            {destSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                {destSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDestPoint({ name: p.name, country: p.country, lat: p.lat, lng: p.lng });
                      setDestQuery(`${p.name}, ${p.country}`);
                      setDestSuggestions([]);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    <span className="text-slate-500"> · {p.country} · {p.continent}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dates & Days */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="plan-dep" className="block text-xs font-semibold text-slate-700">
                Departure Date
              </label>
              <input
                id="plan-dep"
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="plan-ret" className="block text-xs font-semibold text-slate-700">
                Return Date
              </label>
              <input
                id="plan-ret"
                type="date"
                value={returnDate}
                min={departureDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="plan-days" className="block text-xs font-semibold text-slate-700">
                Number of Days
              </label>
              <input
                id="plan-days"
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-tabular text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="plan-pax" className="block text-xs font-semibold text-slate-700">
                Travelers
              </label>
              <input
                id="plan-pax"
                type="number"
                min={1}
                max={20}
                value={travelers}
                onChange={(e) => setTravelers(Math.max(1, Number(e.target.value)))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-tabular text-slate-900"
              />
            </div>
          </div>

          {/* Total Budget in INR */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="plan-budget" className="block text-xs font-semibold text-slate-700">
                Total Budget (INR / ₹)
              </label>
              <span className="font-mono-tabular text-xs font-bold text-blue-700">
                {formatINR(budgetInr)}
              </span>
            </div>
            <input
              id="plan-budget"
              type="number"
              min={2000}
              step={1000}
              value={budgetInr}
              onChange={(e) => setBudgetInr(Math.max(0, Number(e.target.value)))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-tabular text-slate-900"
            />
          </div>

          {/* Travel Style */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Travel Style
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {TRAVEL_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setTravelStyle(style.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    travelStyle === style.id
                      ? 'border-blue-700 bg-blue-50 text-blue-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Travel Preferences */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Travel Preferences
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PREFERENCE_OPTIONS.map((pref) => {
                const selected = preferences.includes(pref);
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => togglePreference(pref)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
          </div>

          {planError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {planError}
            </div>
          )}

          <button
            type="submit"
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating Weather-Adapted Plan...</span>
              </>
            ) : (
              <>
                <Compass className="h-4 w-4" />
                <span>Generate AI Travel Plan in ₹</span>
              </>
            )}
          </button>
        </form>

        {/* Right: Live Weather + Interactive Map */}
        <div className="lg:col-span-7 space-y-6">
          {/* Weather Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Weather-Based Travel Advisory · {destPoint.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {weather ? `Live source: ${weather.source}` : 'Fetching live meteorology...'}
                </p>
              </div>
              {weather && (
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                    weather.indoorAlternativesRecommended
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {weather.indoorAlternativesRecommended
                    ? 'Indoor Alternatives Recommended'
                    : 'Outdoor Conditions Ideal'}
                </span>
              )}
            </div>

            {weatherLoading ? (
              <div className="py-6 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Detecting weather forecast for {destPoint.name}...</span>
              </div>
            ) : weatherError ? (
              <p className="py-4 text-xs text-amber-700">{weatherError}</p>
            ) : weather ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Thermometer className="h-3.5 w-3.5" />
                      <span>Temperature</span>
                    </div>
                    <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                      {weather.current.tempC}°C
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      {weather.current.isRainOrStorm ? (
                        <CloudRain className="h-3.5 w-3.5 text-blue-700" />
                      ) : (
                        <Sun className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      <span>Condition</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
                      {weather.current.condition}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Umbrella className="h-3.5 w-3.5" />
                      <span>Humidity</span>
                    </div>
                    <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                      {weather.current.humidity}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Wind className="h-3.5 w-3.5" />
                      <span>Wind</span>
                    </div>
                    <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                      {weather.current.windKmh} km/h
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-700">{weather.advisory}</p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {weather.daily.map((d) => (
                    <div
                      key={d.date}
                      className="rounded-lg border border-slate-200 p-2.5 text-xs"
                    >
                      <p className="font-semibold text-slate-900 font-mono-tabular">
                        {d.date.slice(5)}
                      </p>
                      <p className="mt-1 text-slate-600 truncate">{d.condition}</p>
                      <p className="mt-1 font-mono-tabular text-slate-900 font-medium">
                        {d.tempMinC}° / {d.tempMaxC}°C
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {d.isOutdoorFriendly ? 'Outdoor OK' : 'Prefer Indoor'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Interactive Map */}
          <WorldMap
            origin={originPoint}
            destination={destPoint}
            listings={matchingListings}
            heightClass="h-[340px]"
          />
        </div>
      </div>

      {/* Generated Personalized AI Itinerary */}
      {itinerary && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-slate-500">
                Personalized AI Travel Plan · {originPoint.name} to {destPoint.name}, {destPoint.country}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                {days}-Day {travelStyle.charAt(0).toUpperCase() + travelStyle.slice(1)} Itinerary
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{itinerary.overview}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-right">
              <p className="text-xs text-slate-500">Estimated Total Trip Cost</p>
              <p className="mt-0.5 font-mono-tabular text-2xl font-bold text-slate-900">
                {formatINR(itinerary.costBreakdownInr.totalEstimated)}
              </p>
              <p className="text-[11px] text-slate-500">
                Target budget: {formatINR(budgetInr)}
              </p>
            </div>
          </div>

          {/* Cost Breakdown & Weather Adaptation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl border border-slate-200 p-5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Estimated Expense Breakdown (INR)
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {itinerary.costBreakdownInr.currencyNote}
              </p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Stays</p>
                  <p className="mt-1 font-mono-tabular text-base font-bold text-slate-900">
                    {formatINR(itinerary.costBreakdownInr.accommodation)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Flights & Transit</p>
                  <p className="mt-1 font-mono-tabular text-base font-bold text-slate-900">
                    {formatINR(itinerary.costBreakdownInr.transportAndFlights)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Attractions</p>
                  <p className="mt-1 font-mono-tabular text-base font-bold text-slate-900">
                    {formatINR(itinerary.costBreakdownInr.activitiesAndAttractions)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Dining & Local</p>
                  <p className="mt-1 font-mono-tabular text-base font-bold text-slate-900">
                    {formatINR(itinerary.costBreakdownInr.diningAndLocal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Weather Adaptation Notes
              </h3>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {itinerary.weatherAdaptationSummary}
              </p>
            </div>
          </div>

          {/* Day-by-Day Schedule */}
          <div className="space-y-4">
            <h3 className="font-display text-xl font-bold text-slate-900">
              Day-by-Day Itinerary & Indoor Backups
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {itinerary.daysPlan.map((dayPlan) => (
                <div
                  key={dayPlan.day}
                  className="rounded-xl border border-slate-200 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
                    <h4 className="font-display text-base font-bold text-slate-900">
                      Day {dayPlan.day}: {dayPlan.title}
                    </h4>
                    <span className="text-xs text-slate-500">{dayPlan.weatherFocus}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {dayPlan.activities.map((act, idx) => (
                      <div key={`${dayPlan.day}-${idx}`} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">
                            <span className="text-blue-700 mr-2">{act.timeOfDay}</span>
                            {act.title}
                            <span className="text-xs font-normal text-slate-500">
                              {' '}
                              · {act.location} · {act.setting === 'indoor' ? 'Indoor' : 'Outdoor'}
                            </span>
                          </div>
                          <span className="font-mono-tabular text-xs font-semibold text-slate-900">
                            Est. {formatINR(act.estimatedCostInr)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{act.notes}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Weather backup: {act.weatherAlternative}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Stays & Budget Alternatives */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Recommended Accommodations (Est. INR)
                </h3>
                <button
                  type="button"
                  onClick={() => onGoToBookings(destPoint.name)}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Browse Bookable Stays &rarr;
                </button>
              </div>
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {itinerary.recommendedAccommodations.map((hotel, idx) => (
                  <div key={idx} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {hotel.name}{' '}
                        <span className="text-xs font-normal text-slate-500">· {hotel.tier}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{hotel.rationale}</p>
                    </div>
                    <span className="font-mono-tabular text-sm font-bold text-slate-900 shrink-0">
                      {formatINR(hotel.estimatedPerNightInr)}/night
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Budget-Friendly Alternatives & Destination Ideas
              </h3>
              <div className="rounded-xl border border-slate-200 p-4 space-y-4">
                <ul className="space-y-2 text-sm text-slate-700 list-disc pl-4">
                  {itinerary.budgetAlternatives.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">
                    Alternative Destinations Matching Your Budget
                  </p>
                  {itinerary.recommendedDestinations.map((rec, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {rec.name}, {rec.country}
                        </span>
                        <p className="text-slate-500">{rec.whyItFits}</p>
                      </div>
                      <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                        {formatINR(rec.estimatedTotalInr)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
