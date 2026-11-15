import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type {
  Booking,
  CurrencyRateCache,
  DatabaseState,
  Destination,
  Listing,
  SavedItinerary,
  User,
} from './types.ts';

const BUNDLED_DB_FILE = path.resolve(process.cwd(), 'data', 'voyageinr_db.json');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'voyageinr-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'voyageinr_db.json');

let state: DatabaseState | null = null;
let initPromise: Promise<DatabaseState> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function buildSeedDestinations(): Destination[] {
  return [
    {
      id: 'dest-hyderabad',
      name: 'Hyderabad',
      country: 'India',
      continent: 'Asia',
      lat: 17.385,
      lng: 78.4867,
      description: 'Deccan heritage capital blending Qutb Shahi monuments, Pearl City bazaars, and modern culinary districts.',
      bestSeason: 'October – March',
      localCurrency: 'INR',
      estimatedDailyLocal: 4800,
      estimatedDailyInr: 4800,
      imageKey: 'goa',
      highlights: ['Charminar & Laad Bazaar', 'Golconda Fort', 'Salar Jung Museum', 'Hussain Sagar'],
      attractions: [
        { name: 'Golconda Fort', category: 'outdoor', description: 'Acoustic stone citadel overlooking western Hyderabad.', lat: 17.3833, lng: 78.4011, estimatedCostLocal: 300, localCurrency: 'INR', estimatedCostInr: 300 },
        { name: 'Salar Jung Museum', category: 'indoor', description: 'Extensive fine arts and manuscript collection along the Musi.', lat: 17.3714, lng: 78.4804, estimatedCostLocal: 500, localCurrency: 'INR', estimatedCostInr: 500 },
        { name: 'Charminar Old Quarter', category: 'cultural', description: '1591 archway surrounded by bangle workshops and Irani cafes.', lat: 17.3616, lng: 78.4747, estimatedCostLocal: 250, localCurrency: 'INR', estimatedCostInr: 250 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-goa',
      name: 'Goa',
      country: 'India',
      continent: 'Asia',
      lat: 15.2993,
      lng: 74.124,
      description: 'Konkan coastline of palm-fringed coves, Indo-Portuguese quarters in Fontainhas, and spice plantations.',
      bestSeason: 'November – February',
      localCurrency: 'INR',
      estimatedDailyLocal: 6500,
      estimatedDailyInr: 6500,
      imageKey: 'goa',
      highlights: ['Fontainhas Latin Quarter', 'Palolem & Agonda', 'Basilica of Bom Jesus', 'Dudhsagar Falls'],
      attractions: [
        { name: 'Fontainhas Heritage Walk', category: 'cultural', description: 'Ochre-walled Portuguese lanes and bakeries in Panaji.', lat: 15.4968, lng: 73.8305, estimatedCostLocal: 400, localCurrency: 'INR', estimatedCostInr: 400 },
        { name: 'Goa Chitra Museum', category: 'indoor', description: 'Ethnographic museum celebrating coastal agrarian craft.', lat: 15.2615, lng: 73.9277, estimatedCostLocal: 350, localCurrency: 'INR', estimatedCostInr: 350 },
        { name: 'Agonda Beach Cove', category: 'outdoor', description: 'Quiet crescent shoreline ideal for morning swims.', lat: 15.0445, lng: 73.9875, estimatedCostLocal: 0, localCurrency: 'INR', estimatedCostInr: 0 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-dubai',
      name: 'Dubai',
      country: 'United Arab Emirates',
      continent: 'Asia',
      lat: 25.2048,
      lng: 55.2708,
      description: 'Persian Gulf crossroads pairing Al Fahidi wind-tower heritage with desert dunes and futuristic architecture.',
      bestSeason: 'November – March',
      localCurrency: 'AED',
      estimatedDailyLocal: 680,
      estimatedDailyInr: 15640,
      imageKey: 'hero',
      highlights: ['Al Fahidi Historic District', 'Museum of the Future', 'Dubai Creek Abra', 'Desert Conservation Reserve'],
      attractions: [
        { name: 'Museum of the Future', category: 'indoor', description: 'Calligraphy-clad interactive exhibition hall on Sheikh Zayed Road.', lat: 25.2192, lng: 55.2819, estimatedCostLocal: 149, localCurrency: 'AED', estimatedCostInr: 3427 },
        { name: 'Al Fahidi Cultural Quarter', category: 'cultural', description: 'Restored coral-stone courtyard houses and tea rooms.', lat: 25.2636, lng: 55.2972, estimatedCostLocal: 40, localCurrency: 'AED', estimatedCostInr: 920 },
        { name: 'Jumeirah Corniche Walk', category: 'outdoor', description: 'Coastal promenade overlooking the Arabian Gulf.', lat: 25.2084, lng: 55.2392, estimatedCostLocal: 0, localCurrency: 'AED', estimatedCostInr: 0 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-singapore',
      name: 'Singapore',
      country: 'Singapore',
      continent: 'Asia',
      lat: 1.3521,
      lng: 103.8198,
      description: 'Garden city-state uniting biophilic conservatories, Peranakan shophouses, and UNESCO hawker gastronomy.',
      bestSeason: 'Year-round (Feb – Apr driest)',
      localCurrency: 'SGD',
      estimatedDailyLocal: 240,
      estimatedDailyInr: 15120,
      imageKey: 'tokyo',
      highlights: ['Cloud Forest Conservatory', 'Kampong Glam', 'Maxwell Hawker Centre', 'National Gallery'],
      attractions: [
        { name: 'Cloud Forest & Flower Dome', category: 'indoor', description: 'Climate-controlled glass biomes ideal in tropical rain.', lat: 1.2839, lng: 103.8657, estimatedCostLocal: 53, localCurrency: 'SGD', estimatedCostInr: 3339 },
        { name: 'National Gallery Singapore', category: 'indoor', description: 'Southeast Asian modern art inside former City Hall.', lat: 1.2903, lng: 103.8515, estimatedCostLocal: 20, localCurrency: 'SGD', estimatedCostInr: 1260 },
        { name: 'MacRitchie Treetop Trail', category: 'outdoor', description: 'Rainforest reservoir boardwalk and suspension bridge.', lat: 1.3448, lng: 103.8224, estimatedCostLocal: 0, localCurrency: 'SGD', estimatedCostInr: 0 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-bangkok',
      name: 'Bangkok',
      country: 'Thailand',
      continent: 'Asia',
      lat: 13.7563,
      lng: 100.5018,
      description: 'Chao Phraya river metropolis of gilded riverside temples, canal ferries, and late-night street kitchens.',
      bestSeason: 'November – February',
      localCurrency: 'THB',
      estimatedDailyLocal: 3200,
      estimatedDailyInr: 7840,
      imageKey: 'tokyo',
      highlights: ['Wat Arun & Grand Palace', 'Jim Thompson House', 'Yaowarat Chinatown', 'Talat Noi Alleyways'],
      attractions: [
        { name: 'Wat Arun Riverside Temple', category: 'cultural', description: 'Porcelain-inlaid spire along the western bank of the Chao Phraya.', lat: 13.7437, lng: 100.4889, estimatedCostLocal: 200, localCurrency: 'THB', estimatedCostInr: 490 },
        { name: 'Bangkok Art & Culture Centre', category: 'indoor', description: 'Air-conditioned contemporary gallery hub at Pathum Wan.', lat: 13.7467, lng: 100.5303, estimatedCostLocal: 0, localCurrency: 'THB', estimatedCostInr: 0 },
        { name: 'Jim Thompson House Museum', category: 'indoor', description: 'Teakwood architectural complex and silk heritage collection.', lat: 13.7492, lng: 100.5283, estimatedCostLocal: 200, localCurrency: 'THB', estimatedCostInr: 490 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-tokyo',
      name: 'Tokyo',
      country: 'Japan',
      continent: 'Asia',
      lat: 35.6762,
      lng: 139.6503,
      description: 'Layered metropolis of tranquil Meiji forest shrines, Asakusa lantern lanes, and precision rail connectivity.',
      bestSeason: 'March – May & Oct – Nov',
      localCurrency: 'JPY',
      estimatedDailyLocal: 22000,
      estimatedDailyInr: 12320,
      imageKey: 'tokyo',
      highlights: ['Senso-ji & Asakusa', 'Mori Art Museum', 'Meiji Jingu Forest', 'Tsukiji Outer Market'],
      attractions: [
        { name: 'Senso-ji Temple & Nakamise', category: 'cultural', description: 'Historic Buddhist temple complex and craft arcade.', lat: 35.7148, lng: 139.7967, estimatedCostLocal: 0, localCurrency: 'JPY', estimatedCostInr: 0 },
        { name: 'Tokyo National Museum (Ueno)', category: 'indoor', description: 'Curated samurai armor, woodblock prints, and ceramics.', lat: 35.7188, lng: 139.7765, estimatedCostLocal: 1000, localCurrency: 'JPY', estimatedCostInr: 560 },
        { name: 'teamLab Planets', category: 'indoor', description: 'Immersive indoor digital art installations in Toyosu.', lat: 35.6491, lng: 139.7897, estimatedCostLocal: 4200, localCurrency: 'JPY', estimatedCostInr: 2352 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-bali',
      name: 'Bali (Ubud & Uluwatu)',
      country: 'Indonesia',
      continent: 'Asia',
      lat: -8.4095,
      lng: 115.1889,
      description: 'Volcanic island combining terraced emerald rice paddies in Ubud with limestone cliff temples in Uluwatu.',
      bestSeason: 'April – October',
      localCurrency: 'IDR',
      estimatedDailyLocal: 1350000,
      estimatedDailyInr: 7290,
      imageKey: 'goa',
      highlights: ['Tegallalang Terraces', 'Uluwatu Cliff Temple', 'Agung Rai Museum of Art', 'Nusa Penida'],
      attractions: [
        { name: 'Tegallalang Rice Terraces', category: 'outdoor', description: 'Traditional Subak irrigation terraces north of Ubud.', lat: -8.4312, lng: 115.2793, estimatedCostLocal: 50000, localCurrency: 'IDR', estimatedCostInr: 270 },
        { name: 'Agung Rai Museum of Art', category: 'indoor', description: 'Balinese paintings and covered pavilion workshops.', lat: -8.5219, lng: 115.2647, estimatedCostLocal: 120000, localCurrency: 'IDR', estimatedCostInr: 648 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-london',
      name: 'London',
      country: 'United Kingdom',
      continent: 'Europe',
      lat: 51.5072,
      lng: -0.1276,
      description: 'Thames-side global capital rich in free national museums, historic markets, and royal parks.',
      bestSeason: 'May – September',
      localCurrency: 'GBP',
      estimatedDailyLocal: 185,
      estimatedDailyInr: 19980,
      imageKey: 'paris',
      highlights: ['British Museum', 'Borough Market', 'Tate Modern', 'South Bank Walk'],
      attractions: [
        { name: 'British Museum', category: 'indoor', description: 'World antiquities beneath the glass-roofed Great Court.', lat: 51.5194, lng: -0.127, estimatedCostLocal: 0, localCurrency: 'GBP', estimatedCostInr: 0 },
        { name: 'Tate Modern', category: 'indoor', description: 'Modern and contemporary exhibitions inside Bankside Power Station.', lat: 51.5076, lng: -0.0994, estimatedCostLocal: 0, localCurrency: 'GBP', estimatedCostInr: 0 },
        { name: 'Kew Royal Botanic Gardens', category: 'outdoor', description: 'Historic glasshouses and arboretum by the Thames.', lat: 51.4787, lng: -0.2956, estimatedCostLocal: 22, localCurrency: 'GBP', estimatedCostInr: 2376 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-paris',
      name: 'Paris',
      country: 'France',
      continent: 'Europe',
      lat: 48.8566,
      lng: 2.3522,
      description: 'Haussmann boulevards, riverside bookstalls, world-renowned galleries, and neighborhood patisseries.',
      bestSeason: 'April – June & Sept – Oct',
      localCurrency: 'EUR',
      estimatedDailyLocal: 190,
      estimatedDailyInr: 17290,
      imageKey: 'paris',
      highlights: ['Musée d’Orsay', 'Le Marais', 'Seine Promenade', 'Louvre Galleries'],
      attractions: [
        { name: 'Musée d’Orsay', category: 'indoor', description: 'Impressionist masterworks inside a Beaux-Arts railway station.', lat: 48.86, lng: 2.3266, estimatedCostLocal: 16, localCurrency: 'EUR', estimatedCostInr: 1456 },
        { name: 'Jardin du Luxembourg', category: 'outdoor', description: 'Tree-lined avenues and Medici Fountain on the Left Bank.', lat: 48.8462, lng: 2.3372, estimatedCostLocal: 0, localCurrency: 'EUR', estimatedCostInr: 0 },
        { name: 'Sainte-Chapelle', category: 'indoor', description: '13th-century stained-glass chapel on Île de la Cité.', lat: 48.8554, lng: 2.345, estimatedCostLocal: 13, localCurrency: 'EUR', estimatedCostInr: 1183 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-switzerland',
      name: 'Interlaken & Lauterbrunnen',
      country: 'Switzerland',
      continent: 'Europe',
      lat: 46.6863,
      lng: 7.8632,
      description: 'Bernese Oberland alpine gateway connecting glacial Lake Brienz, waterfall valleys, and panoramic mountain rail.',
      bestSeason: 'June – Sept & Dec – Feb',
      localCurrency: 'CHF',
      estimatedDailyLocal: 245,
      estimatedDailyInr: 23520,
      imageKey: 'swiss',
      highlights: ['Lauterbrunnen Valley', 'Harder Kulm', 'Lake Brienz Cruise', 'Jungfraujoch Rail'],
      attractions: [
        { name: 'Lauterbrunnen Valley Trail', category: 'outdoor', description: 'Glacial valley flanked by 72 waterfalls and limestone cliffs.', lat: 46.5935, lng: 7.9091, estimatedCostLocal: 0, localCurrency: 'CHF', estimatedCostInr: 0 },
        { name: 'Trümmelbach Glacial Falls', category: 'indoor', description: 'Subterranean mountain-carved waterfall galleries.', lat: 46.5714, lng: 7.915, estimatedCostLocal: 15, localCurrency: 'CHF', estimatedCostInr: 1440 },
        { name: 'Swiss Open-Air Museum Ballenberg', category: 'cultural', description: 'Historic alpine timber farmhouses and craft demonstrations.', lat: 46.7524, lng: 8.0869, estimatedCostLocal: 32, localCurrency: 'CHF', estimatedCostInr: 3072 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-rome',
      name: 'Rome',
      country: 'Italy',
      continent: 'Europe',
      lat: 41.9028,
      lng: 12.4964,
      description: 'Layered millennia of Roman forums, Renaissance basilicas, travertine piazzas, and trattoria neighborhoods.',
      bestSeason: 'April – May & Sept – Oct',
      localCurrency: 'EUR',
      estimatedDailyLocal: 165,
      estimatedDailyInr: 15015,
      imageKey: 'hero',
      highlights: ['Colosseum & Roman Forum', 'Galleria Borghese', 'Trastevere', 'Pantheon'],
      attractions: [
        { name: 'Galleria Borghese', category: 'indoor', description: 'Bernini sculptures and Caravaggio canvases inside Villa Borghese.', lat: 41.9142, lng: 12.4922, estimatedCostLocal: 15, localCurrency: 'EUR', estimatedCostInr: 1365 },
        { name: 'Roman Forum & Palatine Hill', category: 'outdoor', description: 'Open-air archaeological heart of ancient Rome.', lat: 41.8925, lng: 12.4853, estimatedCostLocal: 18, localCurrency: 'EUR', estimatedCostInr: 1638 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-newyork',
      name: 'New York City',
      country: 'United States',
      continent: 'North America',
      lat: 40.7128,
      lng: -74.006,
      description: 'Five-borough cultural powerhouse with world-class museums, greenway promenades, and global neighborhood dining.',
      bestSeason: 'April – June & Sept – Nov',
      localCurrency: 'USD',
      estimatedDailyLocal: 260,
      estimatedDailyInr: 22100,
      imageKey: 'paris',
      highlights: ['Metropolitan Museum of Art', 'Central Park', 'Brooklyn Bridge Walk', 'High Line'],
      attractions: [
        { name: 'The Metropolitan Museum of Art', category: 'indoor', description: 'Encyclopedic art collections spanning five millennia.', lat: 40.7794, lng: -73.9632, estimatedCostLocal: 30, localCurrency: 'USD', estimatedCostInr: 2550 },
        { name: 'The High Line Elevated Park', category: 'outdoor', description: 'Landscaped rail viaduct walkway above Chelsea.', lat: 40.748, lng: -74.0048, estimatedCostLocal: 0, localCurrency: 'USD', estimatedCostInr: 0 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-cusco',
      name: 'Cusco & Machu Picchu',
      country: 'Peru',
      continent: 'South America',
      lat: -13.5319,
      lng: -71.9675,
      description: 'High-Andean Inca capital leading through the Sacred Valley to cloud-forest citadel terraces.',
      bestSeason: 'May – September',
      localCurrency: 'PEN',
      estimatedDailyLocal: 380,
      estimatedDailyInr: 8740,
      imageKey: 'swiss',
      highlights: ['Machu Picchu Citadel', 'Sacred Valley Markets', 'Qorikancha Temple', 'San Pedro Market'],
      attractions: [
        { name: 'Machu Picchu Sanctuary', category: 'outdoor', description: '15th-century Inca stone citadel above the Urubamba gorge.', lat: -13.1631, lng: -72.545, estimatedCostLocal: 152, localCurrency: 'PEN', estimatedCostInr: 3496 },
        { name: 'Museo Inka', category: 'indoor', description: 'Andean textiles, stonework, and ceramic collections in Cusco.', lat: -13.5157, lng: -71.9776, estimatedCostLocal: 20, localCurrency: 'PEN', estimatedCostInr: 460 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-capetown',
      name: 'Cape Town',
      country: 'South Africa',
      continent: 'Africa',
      lat: -33.9249,
      lng: 18.4241,
      description: 'Table Mountain amphitheater meeting Atlantic kelp coves, Kirstenbosch gardens, and Cape Winelands.',
      bestSeason: 'October – April',
      localCurrency: 'ZAR',
      estimatedDailyLocal: 2400,
      estimatedDailyInr: 11280,
      imageKey: 'hero',
      highlights: ['Table Mountain Aerial Cableway', 'Zeitz MOCAA', 'Kirstenbosch Gardens', 'Boulders Beach'],
      attractions: [
        { name: 'Zeitz MOCAA Contemporary Museum', category: 'indoor', description: 'Carved grain-silo museum of contemporary African art.', lat: -33.9085, lng: 18.4226, estimatedCostLocal: 250, localCurrency: 'ZAR', estimatedCostInr: 1175 },
        { name: 'Kirstenbosch Botanical Garden', category: 'outdoor', description: 'Fynbos flora and canopy walkway beneath Table Mountain.', lat: -33.9875, lng: 18.4327, estimatedCostLocal: 230, localCurrency: 'ZAR', estimatedCostInr: 1081 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-sydney',
      name: 'Sydney',
      country: 'Australia',
      continent: 'Oceania',
      lat: -33.8688,
      lng: 151.2093,
      description: 'Harbor city framed by the Opera House sails, coastal sandstone trails, and The Rocks heritage lanes.',
      bestSeason: 'September – November & Mar – May',
      localCurrency: 'AUD',
      estimatedDailyLocal: 240,
      estimatedDailyInr: 13440,
      imageKey: 'hero',
      highlights: ['Sydney Opera House', 'Bondi to Coogee Walk', 'Art Gallery of NSW', 'Manly Ferry'],
      attractions: [
        { name: 'Art Gallery of New South Wales', category: 'indoor', description: 'Aboriginal, Pacific, and international art in The Domain.', lat: -33.8688, lng: 151.2174, estimatedCostLocal: 0, localCurrency: 'AUD', estimatedCostInr: 0 },
        { name: 'Bondi to Coogee Coastal Walk', category: 'outdoor', description: 'Six-kilometer sandstone clifftop boardwalk above ocean pools.', lat: -33.8915, lng: 151.2767, estimatedCostLocal: 0, localCurrency: 'AUD', estimatedCostInr: 0 },
      ],
      isSampleData: true,
    },
    {
      id: 'dest-antarctica',
      name: 'Antarctic Peninsula (Ushuaia Gateway)',
      country: 'Antarctica (IAATO Permitted)',
      continent: 'Antarctica',
      lat: -64.8255,
      lng: -63.4938,
      description: 'Permitted expedition-vessel tourism through the Lemaire Channel, research stations, and penguin rookeries.',
      bestSeason: 'November – March (Austral Summer)',
      localCurrency: 'USD',
      estimatedDailyLocal: 950,
      estimatedDailyInr: 80750,
      imageKey: 'swiss',
      highlights: ['Port Lockroy Historic Base', 'Lemaire Channel', 'Neko Harbour', 'IAATO Conservation Briefings'],
      attractions: [
        { name: 'Port Lockroy Museum & Post Office', category: 'indoor', description: 'Restored 1944 British Antarctic heritage base on Goudier Island.', lat: -64.8253, lng: -63.4944, estimatedCostLocal: 0, localCurrency: 'USD', estimatedCostInr: 0 },
        { name: 'Lemaire Channel Ice Passage', category: 'outdoor', description: 'Glacier-lined navigable strait watched from expedition decks.', lat: -65.0833, lng: -63.95, estimatedCostLocal: 0, localCurrency: 'USD', estimatedCostInr: 0 },
      ],
      isSampleData: true,
    },
  ];
}

function buildSeedListings(): Listing[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'list-goa-villa',
      providerId: 'user-provider-1',
      providerName: 'Deccan & Coastal Stays Partner',
      category: 'hotel',
      title: 'Casa Fontainhas Heritage Boutique Hotel',
      destinationName: 'Goa',
      country: 'India',
      continent: 'Asia',
      lat: 15.497,
      lng: 73.831,
      description: 'Restored 19th-century courtyard residence in Panaji with breakfast and monsoon courtyard lounge.',
      originalCurrency: 'INR',
      originalAmount: 6400,
      priceInr: 6400,
      priceUnit: 'per night',
      isConvertedEstimate: false,
      verificationStatus: 'provider_verified',
      availabilityStatus: 'available_on_request',
      amenities: ['Breakfast Included', 'Airport Transfer Option', 'Courtyard Lounge', 'Wi-Fi'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'list-hyd-cab',
      providerId: 'user-provider-1',
      providerName: 'Deccan & Coastal Stays Partner',
      category: 'transport',
      title: 'Deccan Heritage Chauffeur Sedan (8h / 80km)',
      destinationName: 'Hyderabad',
      country: 'India',
      continent: 'Asia',
      lat: 17.385,
      lng: 78.4867,
      description: 'Air-conditioned electric sedan with bilingual driver for Old City, Golconda, and airport transfers.',
      originalCurrency: 'INR',
      originalAmount: 3200,
      priceInr: 3200,
      priceUnit: 'per day',
      isConvertedEstimate: false,
      verificationStatus: 'provider_verified',
      availabilityStatus: 'available_on_request',
      amenities: ['AC Electric Sedan', 'Bilingual Driver', 'Fuel & Tolls Included'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'list-tokyo-ryokan',
      providerId: 'user-provider-1',
      providerName: 'Deccan & Coastal Stays Partner',
      category: 'hotel',
      title: 'Asakusa Riverview Modern Ryokan',
      destinationName: 'Tokyo',
      country: 'Japan',
      continent: 'Asia',
      lat: 35.7115,
      lng: 139.798,
      description: 'Minimalist cedar-and-tatami suites three minutes from Asakusa Metro and Senso-ji.',
      originalCurrency: 'JPY',
      originalAmount: 24500,
      priceInr: 13720,
      priceUnit: 'per night',
      isConvertedEstimate: true,
      verificationStatus: 'provider_verified',
      availabilityStatus: 'available_on_request',
      amenities: ['Private Onsen Bath', 'Subway Access', 'Luggage Forwarding'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'list-paris-hotel',
      providerId: 'sample-partner',
      providerName: 'Sample Global Partner Catalog',
      category: 'hotel',
      title: 'Hôtel Saint-Germain Courtyard (Sample Listing)',
      destinationName: 'Paris',
      country: 'France',
      continent: 'Europe',
      lat: 48.854,
      lng: 2.333,
      description: 'Left Bank townhouse stay within walking distance of Musée d’Orsay and Seine bridges.',
      originalCurrency: 'EUR',
      originalAmount: 210,
      priceInr: 19110,
      priceUnit: 'per night',
      isConvertedEstimate: true,
      verificationStatus: 'sample_listing',
      availabilityStatus: 'available_on_request',
      amenities: ['Left Bank Location', '24h Reception', 'Espresso Bar'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'list-swiss-rail',
      providerId: 'sample-partner',
      providerName: 'Sample Global Partner Catalog',
      category: 'transport',
      title: 'Bernese Oberland Panoramic Rail & Lake Pass (Sample)',
      destinationName: 'Interlaken & Lauterbrunnen',
      country: 'Switzerland',
      continent: 'Europe',
      lat: 46.6863,
      lng: 7.8632,
      description: 'Point-to-point regional mountain rail and Lake Brienz steamer day estimate.',
      originalCurrency: 'CHF',
      originalAmount: 98,
      priceInr: 9408,
      priceUnit: 'per pass',
      isConvertedEstimate: true,
      verificationStatus: 'sample_listing',
      availabilityStatus: 'available_on_request',
      amenities: ['Panoramic Windows', 'Lake Steamer Access', 'Flexible Boarding'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'list-dubai-transfer',
      providerId: 'sample-partner',
      providerName: 'Sample Global Partner Catalog',
      category: 'transport',
      title: 'DXB Private Airport & City Transfer (Sample)',
      destinationName: 'Dubai',
      country: 'United Arab Emirates',
      continent: 'Asia',
      lat: 25.2532,
      lng: 55.3657,
      description: 'Direct terminal pickup to Downtown Dubai, Marina, or Al Fahidi.',
      originalCurrency: 'AED',
      originalAmount: 190,
      priceInr: 4370,
      priceUnit: 'per transfer',
      isConvertedEstimate: true,
      verificationStatus: 'sample_listing',
      availabilityStatus: 'available_on_request',
      amenities: ['Flight Tracking', 'Meet & Greet', 'Up to 4 Passengers'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'list-capetown-stay',
      providerId: 'sample-partner',
      providerName: 'Sample Global Partner Catalog',
      category: 'hotel',
      title: 'Kloof Street Mountain View Guesthouse (Sample)',
      destinationName: 'Cape Town',
      country: 'South Africa',
      continent: 'Africa',
      lat: -33.931,
      lng: 18.411,
      description: 'Gardens-district boutique stay facing Table Mountain with solar backup power.',
      originalCurrency: 'ZAR',
      originalAmount: 2800,
      priceInr: 13160,
      priceUnit: 'per night',
      isConvertedEstimate: true,
      verificationStatus: 'sample_listing',
      availabilityStatus: 'available_on_request',
      amenities: ['Table Mountain View', 'Solar Backup', 'Breakfast Terrace'],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function seedDatabase(): Promise<DatabaseState> {
  const now = new Date().toISOString();
  const [travelerHash, providerHash, adminHash] = await Promise.all([
    hashPassword('Traveler@2026'),
    hashPassword('Provider@2026'),
    hashPassword('Admin@2026'),
  ]);

  const users: User[] = [
    {
      id: 'user-traveler-1',
      name: 'Arjun Mehta',
      email: 'arjun@voyageinr.in',
      passwordHash: travelerHash,
      role: 'traveler',
      createdAt: now,
    },
    {
      id: 'user-provider-1',
      name: 'Kavya Nair',
      email: 'partner@voyageinr.in',
      passwordHash: providerHash,
      role: 'provider',
      organization: 'Deccan & Coastal Stays Partner',
      createdAt: now,
    },
    {
      id: 'user-admin-1',
      name: 'Vikram Rao',
      email: 'admin@voyageinr.in',
      passwordHash: adminHash,
      role: 'admin',
      organization: 'VoyageINR Operations',
      createdAt: now,
    },
  ];

  const bookings: Booking[] = [
    {
      id: 'bk-initial-101',
      travelerId: 'user-traveler-1',
      travelerName: 'Arjun Mehta',
      travelerEmail: 'arjun@voyageinr.in',
      listingId: 'list-goa-villa',
      listingTitle: 'Casa Fontainhas Heritage Boutique Hotel',
      listingCategory: 'hotel',
      providerId: 'user-provider-1',
      destinationName: 'Goa',
      checkInDate: '2026-12-18',
      checkOutDate: '2026-12-21',
      travelersCount: 2,
      units: 3,
      totalAmountInr: 19200,
      isEstimatedPrice: false,
      status: 'pending',
      travelerNotes: 'Requesting quiet garden-facing courtyard room and morning airport pickup.',
      providerNotes: 'Awaiting provider confirmation.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    users,
    destinations: buildSeedDestinations(),
    listings: buildSeedListings(),
    bookings,
    itineraries: [],
    currencyCache: {
      base: 'INR',
      ratesPerInr: {
        INR: 1,
        USD: 0.01176,
        EUR: 0.01099,
        GBP: 0.00926,
        AED: 0.04348,
        SGD: 0.01587,
        THB: 0.40816,
        JPY: 1.7857,
        AUD: 0.01786,
        CHF: 0.01042,
        ZAR: 0.21277,
        PEN: 0.04348,
        IDR: 185.185,
      },
      inrPerUnit: {
        INR: 1,
        USD: 85,
        EUR: 91,
        GBP: 108,
        AED: 23,
        SGD: 63,
        THB: 2.45,
        JPY: 0.56,
        AUD: 56,
        CHF: 96,
        ZAR: 4.7,
        PEN: 23,
        IDR: 0.0054,
      },
      fetchedAt: now,
      source: 'Bootstrap Reference Rates (Refreshes Live on Request)',
    },
  };
}

export async function initDb(): Promise<DatabaseState> {
  if (state) return state;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch {
      // Ignore directory creation errors on read-only filesystems
    }

    for (const candidate of [DB_FILE, BUNDLED_DB_FILE]) {
      if (fs.existsSync(candidate)) {
        try {
          const raw = fs.readFileSync(candidate, 'utf-8');
          state = JSON.parse(raw) as DatabaseState;
          return state;
        } catch {
          // Try next candidate or seed fresh
        }
      }
    }

    state = await seedDatabase();
    await persistDb();
    return state;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export function getDb(): DatabaseState {
  if (!state) {
    throw new Error('Database not initialized yet.');
  }
  return state;
}

export function persistDb(): Promise<void> {
  if (!state) return Promise.resolve();
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp`;
      await fs.promises.writeFile(tmpFile, snapshot, 'utf-8');
      await fs.promises.rename(tmpFile, DB_FILE);
    } catch (err) {
      console.warn('Database persistence skipped (non-writable storage):', err);
    }
  });
  return writeQueue;
}

export function getCurrencyCache(): CurrencyRateCache | null {
  return state?.currencyCache ?? null;
}

export async function saveCurrencyCache(cache: CurrencyRateCache): Promise<void> {
  if (!state) return;
  state.currencyCache = cache;
  await persistDb();
}

export function getSafeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization,
    createdAt: user.createdAt,
  };
}

export async function addItinerary(itinerary: SavedItinerary): Promise<void> {
  const db = getDb();
  db.itineraries.unshift(itinerary);
  await persistDb();
}
