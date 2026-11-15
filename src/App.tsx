/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { BookingMarketplace } from './components/BookingMarketplace';
import { DestinationExplorer } from './components/DestinationExplorer';
import { Navbar } from './components/Navbar';
import { PartnerPortal } from './components/PartnerPortal';
import { TravelChatbot } from './components/TravelChatbot';
import { TripPlanner } from './components/TripPlanner';
import { AuthProvider } from './context/AuthContext';
import type {
  AppSection,
  Continent,
  Destination,
  ExchangeRatesInfo,
  Listing,
  WeatherForecast,
} from './types';

function VoyageShell() {
  const [activeSection, setActiveSection] = useState<AppSection>('explore');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRatesInfo | null>(null);

  const [selectedPlanDest, setSelectedPlanDest] = useState<{
    name: string;
    country: string;
    lat: number;
    lng: number;
    continent?: Continent;
  } | null>(null);

  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [activeWeather, setActiveWeather] = useState<WeatherForecast | null>(null);
  const [planContext, setPlanContext] = useState({
    destination: 'Tokyo',
    country: 'Japan',
    budgetInr: 150000,
  });

  const loadListings = useCallback(async () => {
    try {
      const res = await fetch('/api/listings');
      if (res.ok) {
        const data = (await res.json()) as { listings: Listing[] };
        setListings(data.listings || []);
      }
    } catch {
      // Ignore transient network errors on initial hydration
    }
  }, []);

  const loadExchangeRates = useCallback(async (forceRefresh = false) => {
    try {
      const res = await fetch(`/api/currency/rates${forceRefresh ? '?refresh=true' : ''}`);
      if (res.ok) {
        setExchangeRates((await res.json()) as ExchangeRatesInfo);
      }
    } catch {
      // Handled gracefully in UI
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const destRes = await fetch('/api/destinations');
        if (destRes.ok) {
          const data = (await destRes.json()) as { destinations: Destination[] };
          setDestinations(data.destinations || []);
        }
      } catch {
        // Ignore
      }
      await Promise.all([loadListings(), loadExchangeRates(false)]);
    }
    bootstrap();
  }, [loadListings, loadExchangeRates]);

  const handleSelectForPlan = (place: {
    name: string;
    country: string;
    lat: number;
    lng: number;
    continent?: Continent;
  }) => {
    setSelectedPlanDest(place);
    setPlanContext((prev) => ({
      ...prev,
      destination: place.name,
      country: place.country,
    }));
    setActiveSection('planner');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBrowseBookings = (destinationName: string) => {
    setBookingSearchQuery(destinationName);
    setActiveSection('bookings');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        activeSection={activeSection}
        onNavigate={(sec) => {
          setActiveSection(sec);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {activeSection === 'explore' && (
          <DestinationExplorer
            destinations={destinations}
            exchangeRates={exchangeRates}
            onRefreshRates={() => loadExchangeRates(true)}
            onSelectForPlan={handleSelectForPlan}
            onBrowseBookings={handleBrowseBookings}
          />
        )}

        {activeSection === 'planner' && (
          <TripPlanner
            initialDestination={selectedPlanDest}
            listings={listings}
            onWeatherUpdated={setActiveWeather}
            onPlanContextUpdated={setPlanContext}
            onGoToBookings={handleBrowseBookings}
          />
        )}

        {activeSection === 'bookings' && (
          <BookingMarketplace
            listings={listings}
            initialFilterQuery={bookingSearchQuery}
            onOpenAuth={() => setAuthModalOpen(true)}
            onListingsChanged={loadListings}
          />
        )}

        {activeSection === 'concierge' && (
          <TravelChatbot
            activeContext={planContext}
            activeWeather={activeWeather}
          />
        )}

        {activeSection === 'partner' && (
          <PartnerPortal onListingsChanged={loadListings} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8">
          <p>VoyageINR · Worldwide Travel Intelligence priced in Indian Rupees (₹)</p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveSection('explore')}
              className="hover:text-slate-900"
            >
              Destinations
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('planner')}
              className="hover:text-slate-900"
            >
              Weather Planner
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('partner')}
              className="hover:text-slate-900"
            >
              Partner & Admin Portal
            </button>
          </div>
        </div>
      </footer>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <VoyageShell />
    </AuthProvider>
  );
}
