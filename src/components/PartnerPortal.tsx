import React, { useEffect, useState } from 'react';
import { Check, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  AvailabilityStatus,
  Booking,
  Continent,
  Listing,
  ListingCategory,
  SafeUser,
  UserRole,
} from '../types';
import { formatINR } from '../utils/currency';

interface PartnerPortalProps {
  onListingsChanged: () => void;
}

interface AdminOverviewData {
  metrics: {
    totalUsers: number;
    totalDestinations: number;
    totalListings: number;
    verifiedListings: number;
    totalBookings: number;
    confirmedVolumeInr: number;
    pendingVolumeInr: number;
  };
  users: SafeUser[];
  listings: Listing[];
  bookings: Booking[];
}

export function PartnerPortal({ onListingsChanged }: PartnerPortalProps) {
  const { user, login, logout, authHeaders } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Provider state
  const [providerListings, setProviderListings] = useState<Listing[]>([]);
  const [providerBookings, setProviderBookings] = useState<Booking[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // New listing form
  const [showAddForm, setShowAddForm] = useState(false);
  const [category, setCategory] = useState<ListingCategory>('hotel');
  const [title, setTitle] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [country, setCountry] = useState('');
  const [continent, setContinent] = useState<Continent>('Asia');
  const [originalCurrency, setOriginalCurrency] = useState('INR');
  const [originalAmount, setOriginalAmount] = useState(5500);
  const [priceUnit, setPriceUnit] = useState('per night');
  const [description, setDescription] = useState('');
  const [amenitiesText, setAmenitiesText] = useState('Wi-Fi, Breakfast Included');
  const [formError, setFormError] = useState<string | null>(null);

  // Admin state
  const [adminData, setAdminData] = useState<AdminOverviewData | null>(null);

  const loadRoleDashboard = async () => {
    if (!user) return;
    if (user.role === 'provider') {
      const [listRes, bkRes] = await Promise.all([
        fetch('/api/listings'),
        fetch('/api/bookings', { headers: authHeaders() }),
      ]);
      if (listRes.ok) {
        const lData = (await listRes.json()) as { listings: Listing[] };
        setProviderListings((lData.listings || []).filter((l) => l.providerId === user.id));
      }
      if (bkRes.ok) {
        const bData = (await bkRes.json()) as { bookings: Booking[] };
        setProviderBookings(bData.bookings || []);
      }
    } else if (user.role === 'admin') {
      const res = await fetch('/api/admin/overview', { headers: authHeaders() });
      if (res.ok) {
        setAdminData((await res.json()) as AdminOverviewData);
      }
    }
  };

  useEffect(() => {
    if (user && (user.role === 'provider' || user.role === 'admin')) {
      loadRoleDashboard();
    }
  }, [user]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    try {
      await login(email, password, 'staff');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          category,
          title,
          destinationName,
          country,
          continent,
          originalCurrency,
          originalAmount: Number(originalAmount),
          priceUnit,
          description,
          amenities: amenitiesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = (await res.json()) as { listing?: Listing; error?: string };
      if (!res.ok || !data.listing) {
        throw new Error(data.error || 'Could not add listing.');
      }
      setShowAddForm(false);
      setTitle('');
      setDescription('');
      onListingsChanged();
      await loadRoleDashboard();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create listing.');
    }
  };

  const handleToggleAvailability = async (listing: Listing, nextStatus: AvailabilityStatus) => {
    await fetch(`/api/listings/${listing.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ availabilityStatus: nextStatus }),
    });
    onListingsChanged();
    await loadRoleDashboard();
  };

  const handleDeleteListing = async (id: string) => {
    await fetch(`/api/listings/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    onListingsChanged();
    await loadRoleDashboard();
  };

  const handleBookingDecision = async (bookingId: string, status: 'confirmed' | 'rejected') => {
    await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        status,
        providerNotes: noteDrafts[bookingId] || undefined,
      }),
    });
    await loadRoleDashboard();
  };

  const handleAdminVerifyListing = async (
    id: string,
    verificationStatus: 'provider_verified' | 'sample_listing'
  ) => {
    await fetch(`/api/admin/listings/${id}/verify`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ verificationStatus }),
    });
    onListingsChanged();
    await loadRoleDashboard();
  };

  const handleAdminRoleChange = async (userId: string, role: UserRole) => {
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ role }),
    });
    await loadRoleDashboard();
  };

  // Restricted Login Gate when signed out or signed in as Traveler
  if (!user || user.role === 'traveler') {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Role-Protected Access · Providers & Administrators
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Partner & Admin Portal
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Manage verified hotel and transport listings in INR, review incoming booking requests, or administer platform operations.
          </p>
        </div>

        {user?.role === 'traveler' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>You are currently signed in with a Traveler account ({user.email}).</span>
            <button type="button" onClick={logout} className="font-semibold underline shrink-0">
              Sign Out
            </button>
          </div>
        )}

        <form onSubmit={handleStaffLogin} className="space-y-4">
          <div>
            <label htmlFor="staff-email" className="block text-xs font-semibold text-slate-700">
              Staff / Partner Email
            </label>
            <input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@voyageinr.in"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="staff-pass" className="block text-xs font-semibold text-slate-700">
              Password
            </label>
            <input
              id="staff-pass"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {authError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {signingIn ? 'Verifying Credentials...' : 'Sign In to Partner Portal'}
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Pre-provisioned Evaluation Accounts:</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail('partner@voyageinr.in');
                setPassword('Provider@2026');
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50"
            >
              Fill Provider Login
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('admin@voyageinr.in');
                setPassword('Admin@2026');
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50"
            >
              Fill Admin Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PROVIDER DASHBOARD
  if (user.role === 'provider') {
    const confirmedInr = providerBookings
      .filter((b) => b.status === 'confirmed')
      .reduce((acc, b) => acc + b.totalAmountInr, 0);
    const pendingCount = providerBookings.filter((b) => b.status === 'pending').length;

    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Provider Dashboard · {user.organization || user.name}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">
              Inventory & Booking Requests
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            <span>{showAddForm ? 'Close Form' : 'Add Service Listing'}</span>
          </button>
        </div>

        {/* Provider KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Active Listings</p>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
              {providerListings.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Pending Booking Requests</p>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700">
              {pendingCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Confirmed Revenue (INR)</p>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-emerald-700">
              {formatINR(confirmedInr)}
            </p>
          </div>
        </div>

        {/* Add Listing Form */}
        {showAddForm && (
          <form
            onSubmit={handleCreateListing}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-900">
              Publish New Hotel or Transport Listing
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const c = e.target.value as ListingCategory;
                    setCategory(c);
                    setPriceUnit(c === 'hotel' ? 'per night' : 'per trip');
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="hotel">Hotel / Accommodation</option>
                  <option value="transport">Transportation / Transfer</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Service Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Lake Brienz Chalet Suite or Private Airport Sedan"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Destination City</label>
                <input
                  type="text"
                  required
                  value={destinationName}
                  onChange={(e) => setDestinationName(e.target.value)}
                  placeholder="Tokyo / Goa / Paris"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Country</label>
                <input
                  type="text"
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="India / Japan / France"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Continent</label>
                <select
                  value={continent}
                  onChange={(e) => setContinent(e.target.value as Continent)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {(['Asia', 'Europe', 'North America', 'South America', 'Africa', 'Oceania', 'Antarctica'] as Continent[]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Source Currency (auto-converted to INR)
                </label>
                <select
                  value={originalCurrency}
                  onChange={(e) => setOriginalCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED</option>
                  <option value="SGD">SGD</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Tariff Amount ({originalCurrency})
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={originalAmount}
                  onChange={(e) => setOriginalAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Billing Unit</label>
                <input
                  type="text"
                  required
                  value={priceUnit}
                  onChange={(e) => setPriceUnit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Amenities (comma-separated)
              </label>
              <input
                type="text"
                value={amenitiesText}
                onChange={(e) => setAmenitiesText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Save & Convert Price to INR
            </button>
          </form>
        )}

        {/* Incoming Booking Requests */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Incoming Booking Requests
            </h2>
          </div>
          {providerBookings.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">No incoming booking requests yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {providerBookings.map((bk) => (
                <div key={bk.id} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {bk.id} · {bk.travelerName} ({bk.travelerEmail}) · {bk.checkInDate} to{' '}
                        {bk.checkOutDate}
                      </p>
                      <h3 className="font-display text-base font-bold text-slate-900">
                        {bk.listingTitle}
                      </h3>
                      {bk.travelerNotes && (
                        <p className="mt-1 text-xs text-slate-600">
                          Traveler note: {bk.travelerNotes}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono-tabular text-lg font-bold text-slate-900">
                        {formatINR(bk.totalAmountInr)}
                      </p>
                      <p className="text-xs capitalize font-semibold text-slate-600">
                        Status: {bk.status}
                      </p>
                    </div>
                  </div>

                  {bk.status === 'pending' && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <input
                        type="text"
                        value={noteDrafts[bk.id] || ''}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [bk.id]: e.target.value }))
                        }
                        placeholder="Optional confirmation or pickup instructions..."
                        className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleBookingDecision(bk.id, 'confirmed')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBookingDecision(bk.id, 'rejected')}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Provider Listings Table */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Your Published Listings (INR)
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {providerListings.map((item) => (
              <div
                key={item.id}
                className="p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-500">
                    {item.category.toUpperCase()} · {item.destinationName}, {item.country}
                  </p>
                  <p className="font-display text-base font-bold text-slate-900">{item.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-mono-tabular text-sm font-bold text-slate-900">
                    {formatINR(item.priceInr)} {item.priceUnit}
                  </span>
                  <select
                    aria-label="Availability status"
                    value={item.availabilityStatus}
                    onChange={(e) =>
                      handleToggleAvailability(item, e.target.value as AvailabilityStatus)
                    }
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                  >
                    <option value="available_on_request">Available on Request</option>
                    <option value="limited">Limited Slots</option>
                    <option value="paused">Paused</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleDeleteListing(item.id)}
                    aria-label="Delete listing"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ADMIN DASHBOARD
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-slate-500">
          Administrator Console · Platform Governance
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">
          Admin Operations & INR Ledger
        </h1>
      </div>

      {adminData && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Confirmed Volume (INR)</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
                {formatINR(adminData.metrics.confirmedVolumeInr)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Pending Pipeline (INR)</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700">
                {formatINR(adminData.metrics.pendingVolumeInr)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Verified / Total Listings</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
                {adminData.metrics.verifiedListings} / {adminData.metrics.totalListings}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Users / Destinations</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
                {adminData.metrics.totalUsers} / {adminData.metrics.totalDestinations}
              </p>
            </div>
          </div>

          {/* User Role Governance */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Accounts & Role Access Control
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminData.users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3 font-medium text-slate-900">{u.name}</td>
                      <td className="px-5 py-3 text-slate-600">{u.email}</td>
                      <td className="px-5 py-3">
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          onChange={(e) => handleAdminRoleChange(u.id, e.target.value as UserRole)}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs capitalize"
                        >
                          <option value="traveler">traveler</option>
                          <option value="provider">provider</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Listing Verification Queue */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Service Listings Verification (INR)
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {adminData.listings.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.destinationName}, {item.country} · {item.providerName}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono-tabular text-sm font-bold text-slate-900">
                      {formatINR(item.priceInr)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleAdminVerifyListing(
                          item.id,
                          item.verificationStatus === 'provider_verified'
                            ? 'sample_listing'
                            : 'provider_verified'
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold ${
                        item.verificationStatus === 'provider_verified'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>
                        {item.verificationStatus === 'provider_verified'
                          ? 'Verified'
                          : 'Mark Verified'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
