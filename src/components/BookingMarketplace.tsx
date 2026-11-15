import React, { useEffect, useState } from 'react';
import { Building2, Car, CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Booking, Listing, SavedItinerary } from '../types';
import { formatForeignOrigin, formatINR } from '../utils/currency';

interface BookingMarketplaceProps {
  listings: Listing[];
  initialFilterQuery?: string;
  onOpenAuth: () => void;
  onListingsChanged?: () => void;
}

export function BookingMarketplace({
  listings,
  initialFilterQuery = '',
  onOpenAuth,
}: BookingMarketplaceProps) {
  const { user, authHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState<'browse' | 'my-bookings' | 'saved-plans'>('browse');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'hotel' | 'transport'>('all');
  const [verificationFilter, setVerificationFilter] = useState<
    'all' | 'provider_verified' | 'sample_listing'
  >('all');
  const [query, setQuery] = useState(initialFilterQuery);

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [checkInDate, setCheckInDate] = useState(
    new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10)
  );
  const [checkOutDate, setCheckOutDate] = useState(
    new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10)
  );
  const [units, setUnits] = useState(3);
  const [travelersCount, setTravelersCount] = useState(2);
  const [travelerNotes, setTravelerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [savedPlans, setSavedPlans] = useState<SavedItinerary[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);

  useEffect(() => {
    if (initialFilterQuery) setQuery(initialFilterQuery);
  }, [initialFilterQuery]);

  const loadPersonalData = async () => {
    if (!user) return;
    setLoadingPersonal(true);
    try {
      const [bkRes, plansRes] = await Promise.all([
        fetch('/api/bookings', { headers: authHeaders() }),
        fetch('/api/ai/plans', { headers: authHeaders() }),
      ]);
      if (bkRes.ok) {
        const bkData = (await bkRes.json()) as { bookings: Booking[] };
        setMyBookings(bkData.bookings || []);
      }
      if (plansRes.ok) {
        const plData = (await plansRes.json()) as { plans: SavedItinerary[] };
        setSavedPlans(plData.plans || []);
      }
    } finally {
      setLoadingPersonal(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadPersonalData();
    } else {
      setMyBookings([]);
      setSavedPlans([]);
    }
  }, [user]);

  const filteredListings = listings.filter((item) => {
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
    const matchVer =
      verificationFilter === 'all' || item.verificationStatus === verificationFilter;
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.destinationName.toLowerCase().includes(q) ||
      item.country.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q);
    return matchCat && matchVer && matchQ;
  });

  const handleOpenBookingModal = (listing: Listing) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setSelectedListing(listing);
    setUnits(listing.category === 'hotel' ? 3 : 1);
    setBookingError(null);
    setBookingMessage(null);
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing) return;
    setSubmitting(true);
    setBookingError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          listingId: selectedListing.id,
          checkInDate,
          checkOutDate,
          travelersCount,
          units,
          travelerNotes,
        }),
      });
      const data = (await res.json()) as { booking?: Booking; error?: string };
      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Could not submit booking request.');
      }
      setBookingMessage(
        `Booking request ${data.booking.id} submitted for ${formatINR(data.booking.totalAmountInr)}.`
      );
      setSelectedListing(null);
      setTravelerNotes('');
      await loadPersonalData();
      setActiveTab('my-bookings');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    const res = await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (res.ok) {
      await loadPersonalData();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">
            Hotels, Transportation & Bookings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            All fares and stay totals are calculated in INR (₹). Sample catalog estimates and provider-verified availability are clearly separated.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'browse' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Browse Services
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my-bookings')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'my-bookings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            My Bookings {user ? `(${myBookings.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved-plans')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'saved-plans' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Saved AI Trips {user ? `(${savedPlans.length})` : ''}
          </button>
        </div>
      </div>

      {bookingMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center justify-between gap-3">
          <span>{bookingMessage}</span>
          <button
            type="button"
            onClick={() => setBookingMessage(null)}
            className="text-xs font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'browse' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by destination, country, or service title..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['all', 'hotel', 'transport'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                      categoryFilter === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {cat === 'all' ? 'All Services' : cat === 'hotel' ? 'Hotels' : 'Transport'}
                  </button>
                ))}
              </div>

              <select
                aria-label="Filter by verification status"
                value={verificationFilter}
                onChange={(e) =>
                  setVerificationFilter(
                    e.target.value as 'all' | 'provider_verified' | 'sample_listing'
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="all">All Sources (Verified & Sample)</option>
                <option value="provider_verified">Provider Verified Only</option>
                <option value="sample_listing">Sample Estimates Only</option>
              </select>
            </div>
          </div>

          {/* Listings Grid */}
          {filteredListings.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
              No matching stays or transport services found for "{query}". Try clearing the search filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredListings.map((item) => {
                const isVerified = item.verificationStatus === 'provider_verified';
                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          {item.category === 'hotel' ? (
                            <Building2 className="h-3.5 w-3.5 text-blue-700" />
                          ) : (
                            <Car className="h-3.5 w-3.5 text-blue-700" />
                          )}
                          <span>{item.category === 'hotel' ? 'Accommodation' : 'Transportation'}</span>
                        </span>
                        <span
                          className={
                            isVerified ? 'font-semibold text-emerald-700' : 'text-amber-700 font-medium'
                          }
                        >
                          {isVerified ? 'Provider Verified' : 'Sample Estimate'}
                        </span>
                      </div>

                      <h3 className="mt-2 font-display text-lg font-bold text-slate-900">
                        {item.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.destinationName}, {item.country} · {item.providerName}
                      </p>
                      <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                        {item.description}
                      </p>

                      {item.amenities.length > 0 && (
                        <p className="mt-3 text-xs text-slate-500">
                          Includes: {item.amenities.join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-mono-tabular text-xl font-bold text-slate-900">
                          {formatINR(item.priceInr)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.priceUnit}
                          {item.isConvertedEstimate
                            ? ` · Converted from ${formatForeignOrigin(item.originalAmount, item.originalCurrency)}`
                            : ' · Direct INR tariff'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={item.availabilityStatus === 'paused'}
                        onClick={() => handleOpenBookingModal(item)}
                        className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        {item.availabilityStatus === 'paused'
                          ? 'Unavailable'
                          : isVerified
                          ? 'Request Booking'
                          : 'Request Estimate'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'my-bookings' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {!user ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-slate-700 font-medium">
                Sign in to view your protected booking requests and confirmation updates.
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Sign In as Traveler
              </button>
            </div>
          ) : loadingPersonal ? (
            <div className="p-8 text-sm text-slate-500">Loading bookings...</div>
          ) : myBookings.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">No booking requests yet</p>
              <p className="text-xs text-slate-500">
                Select a hotel or transportation service from Browse Services to submit a request in INR.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {myBookings.map((bk) => (
                <div
                  key={bk.id}
                  className="p-5 flex flex-wrap items-start justify-between gap-4"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-semibold text-slate-700">
                        {bk.id}
                      </span>
                      <span>·</span>
                      <span>{bk.destinationName}</span>
                      <span>·</span>
                      <span>
                        {bk.checkInDate} to {bk.checkOutDate}
                      </span>
                      <span>·</span>
                      <span>{bk.travelersCount} travelers</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      {bk.listingTitle}
                    </h3>
                    <p className="text-xs text-slate-600">{bk.providerNotes}</p>
                    {bk.travelerNotes && (
                      <p className="text-xs text-slate-500">Your note: {bk.travelerNotes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      <p className="font-mono-tabular text-lg font-bold text-slate-900">
                        {formatINR(bk.totalAmountInr)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {bk.units} unit(s) · {bk.isEstimatedPrice ? 'Estimated INR' : 'Confirmed INR'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          bk.status === 'confirmed'
                            ? 'text-emerald-700'
                            : bk.status === 'rejected' || bk.status === 'cancelled'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {bk.status === 'confirmed' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : bk.status === 'rejected' || bk.status === 'cancelled' ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                        <span className="capitalize">{bk.status}</span>
                      </span>

                      {bk.status === 'pending' && user.role === 'traveler' && (
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(bk.id)}
                          className="text-xs font-medium text-slate-600 hover:text-red-700 underline"
                        >
                          Cancel Request
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'saved-plans' && (
        <div className="space-y-4">
          {!user ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
              <p className="text-sm text-slate-700 font-medium">
                Sign in to access itineraries generated and saved under your traveler profile.
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Sign In
              </button>
            </div>
          ) : savedPlans.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
              No saved AI itineraries yet. Generate a trip in the Plan Trip tab while signed in to save it here.
            </div>
          ) : (
            savedPlans.map((sp) => (
              <div
                key={sp.id}
                className="rounded-xl border border-slate-200 bg-white p-5 space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {sp.origin} &rarr; {sp.destination}, {sp.country}
                  </h3>
                  <span className="font-mono-tabular text-sm font-bold text-slate-900">
                    Budget: {formatINR(sp.budgetInr)} · Est. {formatINR(sp.plan.costBreakdownInr.totalEstimated)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {sp.departureDate} to {sp.returnDate} · {sp.days} days · {sp.travelers} travelers · {sp.travelStyle}
                </p>
                <p className="text-sm text-slate-600">{sp.plan.overview}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Booking Request Modal */}
      {selectedListing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Submit Booking Request
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {selectedListing.title} · {selectedListing.destinationName}, {selectedListing.country}
            </p>
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {selectedListing.verificationStatus === 'provider_verified'
                ? 'This is a provider-verified service. Your request goes directly to the partner dashboard for confirmation.'
                : 'This is a sample catalog estimate converted into INR. Confirmation is subject to partner availability.'}
            </p>

            <form onSubmit={handleSubmitBooking} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Check-in / Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Check-out / End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={checkInDate}
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Units ({selectedListing.priceUnit})
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={units}
                    onChange={(e) => setUnits(Math.max(1, Number(e.target.value)))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Travelers
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={travelersCount}
                    onChange={(e) => setTravelersCount(Math.max(1, Number(e.target.value)))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Special Requests / Pickup Notes
                </label>
                <textarea
                  rows={2}
                  value={travelerNotes}
                  onChange={(e) => setTravelerNotes(e.target.value)}
                  placeholder="Flight arrival time, dietary notes, or room preference..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div>
                  <span className="text-xs text-slate-500 block">Estimated Booking Total</span>
                  <span className="font-mono-tabular text-xl font-bold text-slate-900">
                    {formatINR(selectedListing.priceInr * units)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedListing(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {submitting ? 'Submitting...' : 'Confirm Request in ₹'}
                  </button>
                </div>
              </div>

              {bookingError && (
                <p className="text-xs text-red-600">{bookingError}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
