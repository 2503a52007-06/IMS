import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import {
  hashPassword,
  optionalAuth,
  requireAuth,
  requireRole,
  signToken,
  verifyPassword,
} from './server/auth.ts';
import type { AuthRequest } from './server/auth.ts';
import {
  addItinerary,
  getDb,
  getSafeUser,
  initDb,
  persistDb,
} from './server/db.ts';
import { convertToInr, getExchangeRates } from './server/services/currency.ts';
import {
  chatWithTravelConcierge,
  generatePersonalizedItinerary,
} from './server/services/gemini.ts';
import type { ChatTurn } from './server/services/gemini.ts';
import { searchWorldwidePlaces } from './server/services/places.ts';
import type { WorldwidePlaceResult } from './server/services/places.ts';
import { fetchLiveWeather } from './server/services/weather.ts';
import type {
  AvailabilityStatus,
  Booking,
  Continent,
  Listing,
  ListingCategory,
  UserRole,
} from './server/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  await initDb();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, currency: 'INR', timestamp: new Date().toISOString() });
  });

  // =========================================================================
  // 1. Authentication (Traveler Public Signup + Role-Based Staff/Provider Login)
  // =========================================================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body as {
        name?: string;
        email?: string;
        password?: string;
      };

      if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
        res.status(400).json({
          error: 'Please provide your full name, a valid email address, and a password of at least 6 characters.',
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const db = getDb();
      if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const passwordHash = await hashPassword(password);
      // Public registration strictly creates 'traveler' accounts only
      const newUser = {
        id: `user-${crypto.randomUUID().slice(0, 8)}`,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'traveler' as UserRole,
        createdAt: new Date().toISOString(),
      };

      db.users.push(newUser);
      await persistDb();

      const token = signToken(newUser);
      res.status(201).json({ token, user: getSafeUser(newUser) });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Failed to create traveler account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, portalScope } = req.body as {
        email?: string;
        password?: string;
        portalScope?: 'traveler' | 'staff';
      };

      if (!email?.trim() || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const db = getDb();
      const user = db.users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (portalScope === 'staff' && user.role === 'traveler') {
        res.status(403).json({
          error: 'This portal is restricted to verified Providers and Administrators.',
        });
        return;
      }

      const token = signToken(user);
      res.json({ token, user: getSafeUser(user) });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Failed to sign in.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.user?.sub);
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }
    res.json({ user: getSafeUser(user) });
  });

  // =========================================================================
  // 2. Worldwide Destinations & Dynamic Geocoding
  // =========================================================================
  app.get('/api/destinations', (req, res) => {
    const continent = String(req.query.continent || 'All').trim();
    const q = String(req.query.q || '').trim().toLowerCase();
    const db = getDb();

    let results = db.destinations;
    if (continent && continent !== 'All') {
      results = results.filter((d) => d.continent === continent);
    }
    if (q) {
      results = results.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.country.toLowerCase().includes(q) ||
          d.continent.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q)
      );
    }
    res.json({ destinations: results });
  });

  app.get('/api/places/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      res.json({ places: [] });
      return;
    }

    const db = getDb();
    const lower = q.toLowerCase();
    const catalogMatches: WorldwidePlaceResult[] = db.destinations
      .filter(
        (d) =>
          d.name.toLowerCase().includes(lower) ||
          d.country.toLowerCase().includes(lower) ||
          d.continent.toLowerCase().includes(lower)
      )
      .map((d) => ({
        id: d.id,
        name: d.name,
        displayName: `${d.name}, ${d.country}`,
        country: d.country,
        countryCode: '',
        continent: d.continent,
        lat: d.lat,
        lng: d.lng,
        type: 'featured',
        source: 'catalog' as const,
      }));

    try {
      const livePlaces = await searchWorldwidePlaces(q);
      // Deduplicate by approximate name+country
      const seen = new Set(
        catalogMatches.map((p) => `${p.name.toLowerCase()}|${p.country.toLowerCase()}`)
      );
      const merged: WorldwidePlaceResult[] = [...catalogMatches];
      for (const lp of livePlaces) {
        const key = `${lp.name.toLowerCase()}|${lp.country.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(lp);
        }
      }
      res.json({ places: merged.slice(0, 10) });
    } catch {
      res.json({ places: catalogMatches });
    }
  });

  // =========================================================================
  // 3. Live INR Exchange Rates & Currency Conversion
  // =========================================================================
  app.get('/api/currency/rates', async (req, res) => {
    const refresh = req.query.refresh === 'true';
    const result = await getExchangeRates(refresh);
    res.json(result);
  });

  app.get('/api/currency/convert', async (req, res) => {
    const amount = Number(req.query.amount || 0);
    const from = String(req.query.from || 'USD');
    if (Number.isNaN(amount) || amount < 0) {
      res.status(400).json({ error: 'Invalid amount provided for conversion.' });
      return;
    }
    const conversion = await convertToInr(amount, from);
    res.json(conversion);
  });

  // =========================================================================
  // 4. Weather-Based Travel Planning
  // =========================================================================
  app.get('/api/weather', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const name = String(req.query.name || 'Selected Destination');

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
      return;
    }

    try {
      const forecast = await fetchLiveWeather(lat, lng, name);
      res.json(forecast);
    } catch (err) {
      console.error('Weather lookup error:', err);
      res.status(502).json({
        error: 'Unable to retrieve live weather forecast for this location right now.',
      });
    }
  });

  // =========================================================================
  // 5. Gemini AI Travel Planner & Contextual Travel Chatbot
  // =========================================================================
  app.post('/api/ai/plan', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const {
        origin,
        destination,
        country,
        lat,
        lng,
        departureDate,
        returnDate,
        days,
        travelers,
        budgetInr,
        travelStyle,
        preferences,
      } = req.body as {
        origin?: string;
        destination?: string;
        country?: string;
        lat?: number;
        lng?: number;
        departureDate?: string;
        returnDate?: string;
        days?: number;
        travelers?: number;
        budgetInr?: number;
        travelStyle?: string;
        preferences?: string[];
      };

      if (!origin?.trim() || !destination?.trim() || !budgetInr || budgetInr < 1000) {
        res.status(400).json({
          error: 'Origin, destination, and a realistic budget in INR (minimum ₹1,000) are required.',
        });
        return;
      }

      let weather = null;
      if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        try {
          weather = await fetchLiveWeather(lat, lng, destination.trim());
        } catch {
          weather = null;
        }
      }

      const plan = await generatePersonalizedItinerary({
        origin: origin.trim(),
        destination: destination.trim(),
        country: (country || 'Worldwide').trim(),
        departureDate: departureDate || new Date().toISOString().slice(0, 10),
        returnDate: returnDate || new Date(Date.now() + 86400000 * (days || 4)).toISOString().slice(0, 10),
        days: Math.max(1, Math.min(Number(days || 4), 14)),
        travelers: Math.max(1, Math.min(Number(travelers || 2), 20)),
        budgetInr: Math.round(Number(budgetInr)),
        travelStyle: travelStyle || 'balanced',
        preferences: Array.isArray(preferences) ? preferences : [],
        weather,
      });

      if (req.user) {
        await addItinerary({
          id: `itin-${crypto.randomUUID().slice(0, 8)}`,
          userId: req.user.sub,
          origin: origin.trim(),
          destination: destination.trim(),
          country: (country || 'Worldwide').trim(),
          departureDate: departureDate || new Date().toISOString().slice(0, 10),
          returnDate: returnDate || new Date(Date.now() + 86400000 * (days || 4)).toISOString().slice(0, 10),
          days: Math.max(1, Math.min(Number(days || 4), 14)),
          travelers: Math.max(1, Math.min(Number(travelers || 2), 20)),
          budgetInr: Math.round(Number(budgetInr)),
          travelStyle: travelStyle || 'balanced',
          preferences: Array.isArray(preferences) ? preferences : [],
          plan,
          createdAt: new Date().toISOString(),
        });
      }

      res.json({ plan, weather });
    } catch (err) {
      console.error('AI plan error:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate travel plan.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/ai/plans', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const plans = db.itineraries.filter((i) => i.userId === req.user?.sub);
    res.json({ plans });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message, history, context } = req.body as {
        message?: string;
        history?: ChatTurn[];
        context?: {
          destination?: string;
          country?: string;
          budgetInr?: number;
          weatherSummary?: string;
        };
      };

      if (!message?.trim()) {
        res.status(400).json({ error: 'Please enter a travel question.' });
        return;
      }

      const reply = await chatWithTravelConcierge({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        context,
      });

      res.json({ reply });
    } catch (err) {
      console.error('AI chat error:', err);
      const msg = err instanceof Error ? err.message : 'Unable to reach AI concierge.';
      res.status(500).json({ error: msg });
    }
  });

  // =========================================================================
  // 6. Hotel & Transportation Marketplace Listings
  // =========================================================================
  app.get('/api/listings', (req, res) => {
    const category = String(req.query.category || 'all');
    const q = String(req.query.q || '').trim().toLowerCase();
    const verification = String(req.query.verification || 'all');
    const db = getDb();

    let items = db.listings;
    if (category === 'hotel' || category === 'transport') {
      items = items.filter((l) => l.category === category);
    }
    if (verification === 'provider_verified' || verification === 'sample_listing') {
      items = items.filter((l) => l.verificationStatus === verification);
    }
    if (q) {
      items = items.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.destinationName.toLowerCase().includes(q) ||
          l.country.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q)
      );
    }

    res.json({ listings: items });
  });

  app.post(
    '/api/listings',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const body = req.body as {
          category?: ListingCategory;
          title?: string;
          destinationName?: string;
          country?: string;
          continent?: Continent;
          lat?: number;
          lng?: number;
          description?: string;
          originalCurrency?: string;
          originalAmount?: number;
          priceUnit?: string;
          availabilityStatus?: AvailabilityStatus;
          amenities?: string[];
        };

        if (
          !body.title?.trim() ||
          !body.destinationName?.trim() ||
          !body.country?.trim() ||
          !body.originalAmount ||
          body.originalAmount <= 0
        ) {
          res.status(400).json({
            error: 'Title, destination, country, and a valid positive price are required.',
          });
          return;
        }

        const currencyCode = (body.originalCurrency || 'INR').trim().toUpperCase();
        const conversion = await convertToInr(Number(body.originalAmount), currencyCode);
        if (!conversion.available || conversion.convertedInr === null) {
          res.status(400).json({
            error:
              conversion.errorMessage ||
              `Cannot convert ${currencyCode} to INR at this time. Please submit price directly in INR.`,
          });
          return;
        }

        const db = getDb();
        const user = db.users.find((u) => u.id === req.user?.sub);
        const now = new Date().toISOString();

        const listing: Listing = {
          id: `list-${crypto.randomUUID().slice(0, 8)}`,
          providerId: req.user!.sub,
          providerName: user?.organization || user?.name || 'Verified Partner',
          category: body.category === 'transport' ? 'transport' : 'hotel',
          title: body.title.trim(),
          destinationName: body.destinationName.trim(),
          country: body.country.trim(),
          continent: body.continent || 'Asia',
          lat: typeof body.lat === 'number' && !Number.isNaN(body.lat) ? body.lat : 17.385,
          lng: typeof body.lng === 'number' && !Number.isNaN(body.lng) ? body.lng : 78.4867,
          description: (body.description || '').trim() || 'Provider-submitted listing available on request.',
          originalCurrency: currencyCode,
          originalAmount: Number(body.originalAmount),
          priceInr: conversion.convertedInr,
          priceUnit: body.priceUnit || (body.category === 'transport' ? 'per trip' : 'per night'),
          isConvertedEstimate: currencyCode !== 'INR',
          verificationStatus: 'provider_verified',
          availabilityStatus: body.availabilityStatus || 'available_on_request',
          amenities: Array.isArray(body.amenities) ? body.amenities.filter(Boolean) : [],
          createdAt: now,
          updatedAt: now,
        };

        db.listings.unshift(listing);
        await persistDb();
        res.status(201).json({ listing });
      } catch (err) {
        console.error('Create listing error:', err);
        res.status(500).json({ error: 'Failed to create listing.' });
      }
    }
  );

  app.patch(
    '/api/listings/:id',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      const db = getDb();
      const listing = db.listings.find((l) => l.id === req.params.id);
      if (!listing) {
        res.status(404).json({ error: 'Listing not found.' });
        return;
      }

      if (req.user?.role !== 'admin' && listing.providerId !== req.user?.sub) {
        res.status(403).json({ error: 'You can only manage your own listings.' });
        return;
      }

      const updates = req.body as Partial<Listing>;
      if (updates.title) listing.title = updates.title.trim();
      if (updates.description) listing.description = updates.description.trim();
      if (updates.availabilityStatus) listing.availabilityStatus = updates.availabilityStatus;
      if (updates.priceUnit) listing.priceUnit = updates.priceUnit;
      if (typeof updates.originalAmount === 'number' && updates.originalAmount > 0) {
        const curr = (updates.originalCurrency || listing.originalCurrency || 'INR').toUpperCase();
        const conv = await convertToInr(updates.originalAmount, curr);
        if (conv.available && conv.convertedInr !== null) {
          listing.originalCurrency = curr;
          listing.originalAmount = updates.originalAmount;
          listing.priceInr = conv.convertedInr;
          listing.isConvertedEstimate = curr !== 'INR';
        }
      }
      listing.updatedAt = new Date().toISOString();

      await persistDb();
      res.json({ listing });
    }
  );

  app.delete(
    '/api/listings/:id',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      const db = getDb();
      const idx = db.listings.findIndex((l) => l.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Listing not found.' });
        return;
      }
      const listing = db.listings[idx];
      if (req.user?.role !== 'admin' && listing.providerId !== req.user?.sub) {
        res.status(403).json({ error: 'You can only delete your own listings.' });
        return;
      }

      db.listings.splice(idx, 1);
      await persistDb();
      res.json({ deleted: true });
    }
  );

  // =========================================================================
  // 7. Booking Workflow (Traveler Requests + Provider Confirmations)
  // =========================================================================
  app.get('/api/bookings', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    let bookings = db.bookings;
    if (req.user?.role === 'traveler') {
      bookings = bookings.filter((b) => b.travelerId === req.user?.sub);
    } else if (req.user?.role === 'provider') {
      bookings = bookings.filter((b) => b.providerId === req.user?.sub);
    }
    res.json({ bookings });
  });

  app.post('/api/bookings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        listingId,
        checkInDate,
        checkOutDate,
        travelersCount,
        units,
        travelerNotes,
      } = req.body as {
        listingId?: string;
        checkInDate?: string;
        checkOutDate?: string;
        travelersCount?: number;
        units?: number;
        travelerNotes?: string;
      };

      const db = getDb();
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) {
        res.status(404).json({ error: 'Selected service listing was not found.' });
        return;
      }

      const countUnits = Math.max(1, Number(units || 1));
      const pax = Math.max(1, Number(travelersCount || 1));
      const totalAmountInr = Math.round(listing.priceInr * countUnits);
      const now = new Date().toISOString();

      const booking: Booking = {
        id: `bk-${crypto.randomUUID().slice(0, 8)}`,
        travelerId: req.user!.sub,
        travelerName: req.user!.name,
        travelerEmail: req.user!.email,
        listingId: listing.id,
        listingTitle: listing.title,
        listingCategory: listing.category,
        providerId: listing.providerId,
        destinationName: listing.destinationName,
        checkInDate: checkInDate || now.slice(0, 10),
        checkOutDate: checkOutDate || now.slice(0, 10),
        travelersCount: pax,
        units: countUnits,
        totalAmountInr,
        isEstimatedPrice:
          listing.isConvertedEstimate || listing.verificationStatus === 'sample_listing',
        status: 'pending',
        travelerNotes: (travelerNotes || '').trim(),
        providerNotes:
          listing.verificationStatus === 'sample_listing'
            ? 'Sample catalog request recorded in INR — partner confirmation required.'
            : 'Request submitted to provider for confirmation.',
        createdAt: now,
        updatedAt: now,
      };

      db.bookings.unshift(booking);
      await persistDb();
      res.status(201).json({ booking });
    } catch (err) {
      console.error('Create booking error:', err);
      res.status(500).json({ error: 'Failed to submit booking request.' });
    }
  });

  app.patch('/api/bookings/:id/status', requireAuth, async (req: AuthRequest, res) => {
    const db = getDb();
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking request not found.' });
      return;
    }

    const { status, providerNotes } = req.body as {
      status?: 'confirmed' | 'rejected' | 'cancelled';
      providerNotes?: string;
    };

    if (req.user?.role === 'traveler') {
      if (booking.travelerId !== req.user.sub || status !== 'cancelled') {
        res.status(403).json({ error: 'Travelers may only cancel their own booking requests.' });
        return;
      }
      booking.status = 'cancelled';
      booking.providerNotes = 'Cancelled by traveler.';
    } else if (req.user?.role === 'provider') {
      if (booking.providerId !== req.user.sub) {
        res.status(403).json({ error: 'You can only update bookings for your own listings.' });
        return;
      }
      if (status !== 'confirmed' && status !== 'rejected') {
        res.status(400).json({ error: 'Provider must set status to confirmed or rejected.' });
        return;
      }
      booking.status = status;
      if (typeof providerNotes === 'string' && providerNotes.trim()) {
        booking.providerNotes = providerNotes.trim();
      } else {
        booking.providerNotes =
          status === 'confirmed'
            ? 'Confirmed by provider in INR.'
            : 'Request declined by provider.';
      }
    } else if (req.user?.role === 'admin') {
      if (status) booking.status = status;
      if (typeof providerNotes === 'string') booking.providerNotes = providerNotes.trim();
    }

    booking.updatedAt = new Date().toISOString();
    await persistDb();
    res.json({ booking });
  });

  // =========================================================================
  // 8. Admin Dashboard Endpoints
  // =========================================================================
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireRole('admin'),
    (_req, res) => {
      const db = getDb();
      const totalVolumeInr = db.bookings
        .filter((b) => b.status === 'confirmed')
        .reduce((acc, b) => acc + b.totalAmountInr, 0);
      const pendingVolumeInr = db.bookings
        .filter((b) => b.status === 'pending')
        .reduce((acc, b) => acc + b.totalAmountInr, 0);

      res.json({
        metrics: {
          totalUsers: db.users.length,
          totalDestinations: db.destinations.length,
          totalListings: db.listings.length,
          verifiedListings: db.listings.filter((l) => l.verificationStatus === 'provider_verified').length,
          totalBookings: db.bookings.length,
          confirmedVolumeInr: totalVolumeInr,
          pendingVolumeInr,
        },
        users: db.users.map(getSafeUser),
        listings: db.listings,
        bookings: db.bookings,
      });
    }
  );

  app.patch(
    '/api/admin/listings/:id/verify',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      const db = getDb();
      const listing = db.listings.find((l) => l.id === req.params.id);
      if (!listing) {
        res.status(404).json({ error: 'Listing not found.' });
        return;
      }
      const { verificationStatus } = req.body as {
        verificationStatus?: 'provider_verified' | 'sample_listing';
      };
      if (verificationStatus === 'provider_verified' || verificationStatus === 'sample_listing') {
        listing.verificationStatus = verificationStatus;
        listing.updatedAt = new Date().toISOString();
        await persistDb();
      }
      res.json({ listing });
    }
  );

  app.patch(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      const db = getDb();
      const target = db.users.find((u) => u.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      const { role } = req.body as { role?: UserRole };
      if (role !== 'traveler' && role !== 'provider' && role !== 'admin') {
        res.status(400).json({ error: 'Invalid role.' });
        return;
      }
      if (target.id === req.user?.sub && role !== 'admin') {
        res.status(400).json({ error: 'Cannot downgrade your own active admin account.' });
        return;
      }
      target.role = role;
      await persistDb();
      res.json({ user: getSafeUser(target) });
    }
  );

  // =========================================================================
  // 9. Frontend Delivery (Vite Middleware in Dev / Dist Static in Production)
  // =========================================================================
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoyageINR server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start VoyageINR server:', err);
  process.exit(1);
});
