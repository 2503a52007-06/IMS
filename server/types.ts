export type UserRole = 'traveler' | 'provider' | 'admin';

export type Continent =
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Africa'
  | 'Oceania'
  | 'Antarctica';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organization?: string;
  createdAt: string;
}

export interface Attraction {
  name: string;
  category: 'outdoor' | 'indoor' | 'cultural' | 'culinary';
  description: string;
  lat: number;
  lng: number;
  estimatedCostLocal: number;
  localCurrency: string;
  estimatedCostInr: number;
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  continent: Continent;
  lat: number;
  lng: number;
  description: string;
  bestSeason: string;
  localCurrency: string;
  estimatedDailyLocal: number;
  estimatedDailyInr: number;
  imageKey: 'hero' | 'tokyo' | 'swiss' | 'goa' | 'paris';
  highlights: string[];
  attractions: Attraction[];
  isSampleData: boolean;
}

export type ListingCategory = 'hotel' | 'transport';
export type VerificationStatus = 'provider_verified' | 'sample_listing';
export type AvailabilityStatus = 'available_on_request' | 'limited' | 'paused';

export interface Listing {
  id: string;
  providerId: string;
  providerName: string;
  category: ListingCategory;
  title: string;
  destinationName: string;
  country: string;
  continent: Continent;
  lat: number;
  lng: number;
  description: string;
  originalCurrency: string;
  originalAmount: number;
  priceInr: number;
  priceUnit: string;
  isConvertedEstimate: boolean;
  verificationStatus: VerificationStatus;
  availabilityStatus: AvailabilityStatus;
  amenities: string[];
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export interface Booking {
  id: string;
  travelerId: string;
  travelerName: string;
  travelerEmail: string;
  listingId: string;
  listingTitle: string;
  listingCategory: ListingCategory;
  providerId: string;
  destinationName: string;
  checkInDate: string;
  checkOutDate: string;
  travelersCount: number;
  units: number;
  totalAmountInr: number;
  isEstimatedPrice: boolean;
  status: BookingStatus;
  travelerNotes: string;
  providerNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedItinerary {
  id: string;
  userId: string;
  origin: string;
  destination: string;
  country: string;
  departureDate: string;
  returnDate: string;
  days: number;
  travelers: number;
  budgetInr: number;
  travelStyle: string;
  preferences: string[];
  plan: GeneratedItinerary;
  createdAt: string;
}

export interface GeneratedDayActivity {
  timeOfDay: string;
  title: string;
  location: string;
  setting: 'outdoor' | 'indoor';
  estimatedCostInr: number;
  notes: string;
  weatherAlternative: string;
}

export interface GeneratedDayPlan {
  day: number;
  title: string;
  weatherFocus: string;
  activities: GeneratedDayActivity[];
}

export interface GeneratedItinerary {
  overview: string;
  weatherAdaptationSummary: string;
  recommendedDestinations: Array<{
    name: string;
    country: string;
    whyItFits: string;
    estimatedTotalInr: number;
  }>;
  costBreakdownInr: {
    accommodation: number;
    transportAndFlights: number;
    activitiesAndAttractions: number;
    diningAndLocal: number;
    totalEstimated: number;
    currencyNote: string;
  };
  daysPlan: GeneratedDayPlan[];
  recommendedAccommodations: Array<{
    name: string;
    tier: string;
    estimatedPerNightInr: number;
    rationale: string;
  }>;
  budgetAlternatives: string[];
}

export interface CurrencyRateCache {
  base: 'INR';
  ratesPerInr: Record<string, number>;
  inrPerUnit: Record<string, number>;
  fetchedAt: string;
  source: string;
}

export interface DatabaseState {
  users: User[];
  destinations: Destination[];
  listings: Listing[];
  bookings: Booking[];
  itineraries: SavedItinerary[];
  currencyCache: CurrencyRateCache | null;
}
