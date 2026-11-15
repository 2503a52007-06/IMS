import { GoogleGenAI, Type } from '@google/genai';
import type { GeneratedItinerary } from '../types.ts';
import type { WeatherForecastResult } from './weather.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface PlanRequestInput {
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
  weather: WeatherForecastResult | null;
}

export async function generatePersonalizedItinerary(
  input: PlanRequestInput
): Promise<GeneratedItinerary> {
  const ai = getAiClient();

  const weatherContext = input.weather
    ? `Live Weather at ${input.destination}: Current ${input.weather.current.tempC}°C (${input.weather.current.condition}), Advisory: ${input.weather.advisory}. Daily forecast: ${input.weather.daily
        .map((d) => `${d.date}: ${d.tempMinC}-${d.tempMaxC}°C, ${d.condition}, precip ${d.precipitationMm}mm`)
        .join('; ')}.`
    : 'Weather forecast unavailable; include balanced indoor and outdoor alternatives.';

  const prompt = `Design a realistic, detailed, personalized travel plan for an Indian traveler starting from ${input.origin} to ${input.destination}, ${input.country}.
Trip parameters:
- Dates: ${input.departureDate} to ${input.returnDate} (${input.days} days)
- Travelers: ${input.travelers}
- Total Budget: ₹${input.budgetInr.toLocaleString('en-IN')} INR
- Travel Style: ${input.travelStyle}
- Interests & Preferences: ${input.preferences.length ? input.preferences.join(', ') : 'Balanced sightseeing, local cuisine, culture'}
- ${weatherContext}

Mandatory instructions:
1. Express EVERY monetary figure strictly in Indian Rupees (INR, numeric integers) calibrated accurately to the destination's real-world cost level converted to INR.
2. Clearly note in currencyNote that international prices are converted estimates in INR.
3. Adapt daily activities directly to the forecast weather: if rain, storms, extreme heat (>=36°C), or cold (<=2°C) are forecast, schedule indoor museums, covered markets, cultural halls, or culinary experiences during those hours, and provide a concrete weatherAlternative for every activity.
4. Recommend 3 destination options (including the chosen one plus 2 complementary nearby or interest-matched alternatives worldwide) and practical budget-friendly alternatives if costs approach ₹${input.budgetInr.toLocaleString('en-IN')}.
5. Generate exactly ${Math.min(Math.max(input.days, 1), 7)} day plans (cover the full span succinctly if >7 days).`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are VoyageINR, a senior global travel strategist for travelers budgeting in Indian Rupees (INR). Produce grounded, practical itineraries with realistic Indian Rupee pricing and weather-adaptive backup plans.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overview: { type: Type.STRING },
          weatherAdaptationSummary: { type: Type.STRING },
          recommendedDestinations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                country: { type: Type.STRING },
                whyItFits: { type: Type.STRING },
                estimatedTotalInr: { type: Type.INTEGER },
              },
              required: ['name', 'country', 'whyItFits', 'estimatedTotalInr'],
            },
          },
          costBreakdownInr: {
            type: Type.OBJECT,
            properties: {
              accommodation: { type: Type.INTEGER },
              transportAndFlights: { type: Type.INTEGER },
              activitiesAndAttractions: { type: Type.INTEGER },
              diningAndLocal: { type: Type.INTEGER },
              totalEstimated: { type: Type.INTEGER },
              currencyNote: { type: Type.STRING },
            },
            required: [
              'accommodation',
              'transportAndFlights',
              'activitiesAndAttractions',
              'diningAndLocal',
              'totalEstimated',
              'currencyNote',
            ],
          },
          daysPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER },
                title: { type: Type.STRING },
                weatherFocus: { type: Type.STRING },
                activities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timeOfDay: { type: Type.STRING },
                      title: { type: Type.STRING },
                      location: { type: Type.STRING },
                      setting: { type: Type.STRING },
                      estimatedCostInr: { type: Type.INTEGER },
                      notes: { type: Type.STRING },
                      weatherAlternative: { type: Type.STRING },
                    },
                    required: [
                      'timeOfDay',
                      'title',
                      'location',
                      'setting',
                      'estimatedCostInr',
                      'notes',
                      'weatherAlternative',
                    ],
                  },
                },
              },
              required: ['day', 'title', 'weatherFocus', 'activities'],
            },
          },
          recommendedAccommodations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                tier: { type: Type.STRING },
                estimatedPerNightInr: { type: Type.INTEGER },
                rationale: { type: Type.STRING },
              },
              required: ['name', 'tier', 'estimatedPerNightInr', 'rationale'],
            },
          },
          budgetAlternatives: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          'overview',
          'weatherAdaptationSummary',
          'recommendedDestinations',
          'costBreakdownInr',
          'daysPlan',
          'recommendedAccommodations',
          'budgetAlternatives',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as GeneratedItinerary;

  // Normalize activity setting field cleanly
  parsed.daysPlan = (parsed.daysPlan || []).map((day) => ({
    ...day,
    activities: (day.activities || []).map((act) => ({
      ...act,
      setting: act.setting === 'indoor' ? 'indoor' : 'outdoor',
    })),
  }));

  return parsed;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export async function chatWithTravelConcierge(params: {
  message: string;
  history: ChatTurn[];
  context?: {
    destination?: string;
    country?: string;
    budgetInr?: number;
    weatherSummary?: string;
  };
}): Promise<string> {
  const ai = getAiClient();

  const ctxLines = [
    params.context?.destination
      ? `Active destination in user workspace: ${params.context.destination}${params.context.country ? `, ${params.context.country}` : ''}.`
      : null,
    params.context?.budgetInr
      ? `User budget in INR: ₹${params.context.budgetInr.toLocaleString('en-IN')}.`
      : null,
    params.context?.weatherSummary
      ? `Current weather context: ${params.context.weatherSummary}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const systemInstruction = `You are VoyageINR's expert worldwide travel advisor.
- Always quote all budgets, hotel prices, flights, transport fares, and activity costs in Indian Rupees (₹ / INR) using Indian comma formatting (e.g. ₹1,25,000), and clarify when international figures are converted estimates.
- Support destinations across all 7 continents including Asia, Europe, North America, South America, Africa, Oceania, and permitted Antarctica expeditions.
- Suggest indoor alternatives whenever rain, storms, extreme heat, or freezing weather is mentioned.
- Keep answers clear, well-structured, practical, and directly responsive to the user's question. ${ctxLines}`;

  const historyParts = (params.history || []).slice(-10).map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      ...historyParts,
      { role: 'user', parts: [{ text: params.message }] },
    ],
    config: {
      systemInstruction,
    },
  });

  return (
    response.text?.trim() ||
    'I could not generate a travel recommendation right now. Please refine your question and try again.'
  );
}
