export interface DailyForecastItem {
  date: string;
  tempMinC: number;
  tempMaxC: number;
  condition: string;
  precipitationMm: number;
  isOutdoorFriendly: boolean;
}

export interface WeatherForecastResult {
  locationName: string;
  lat: number;
  lng: number;
  source: string;
  current: {
    tempC: number;
    feelsLikeC: number;
    humidity: number;
    windKmh: number;
    condition: string;
    isRainOrStorm: boolean;
    isExtremeHeat: boolean;
    isExtremeCold: boolean;
  };
  daily: DailyForecastItem[];
  indoorAlternativesRecommended: boolean;
  advisory: string;
  suggestedAdaptations: string[];
}

function wmoCodeToCondition(code: number): { label: string; rainOrStorm: boolean } {
  if (code === 0) return { label: 'Clear Sky', rainOrStorm: false };
  if (code <= 3) return { label: 'Partly Cloudy', rainOrStorm: false };
  if (code === 45 || code === 48) return { label: 'Fog & Mist', rainOrStorm: false };
  if (code >= 51 && code <= 67) return { label: 'Rain & Showers', rainOrStorm: true };
  if (code >= 71 && code <= 77) return { label: 'Snowfall', rainOrStorm: true };
  if (code >= 80 && code <= 82) return { label: 'Heavy Rain Showers', rainOrStorm: true };
  if (code >= 85 && code <= 86) return { label: 'Snow Showers', rainOrStorm: true };
  if (code >= 95) return { label: 'Thunderstorms', rainOrStorm: true };
  return { label: 'Variable Clouds', rainOrStorm: false };
}

function buildAdvisory(
  tempC: number,
  isRainOrStorm: boolean,
  daily: DailyForecastItem[]
): {
  indoorRecommended: boolean;
  advisory: string;
  adaptations: string[];
} {
  const rainyDays = daily.filter((d) => !d.isOutdoorFriendly).length;
  const extremeHeat = tempC >= 36 || daily.some((d) => d.tempMaxC >= 37);
  const extremeCold = tempC <= 2 || daily.some((d) => d.tempMinC <= 0);

  const adaptations: string[] = [];
  if (isRainOrStorm || rainyDays >= 2) {
    adaptations.push('Prioritize indoor museums, covered markets, art galleries, and heritage cafes during wet hours.');
    adaptations.push('Keep outdoor walking tours flexible for morning dry windows and carry waterproof layers.');
  }
  if (extremeHeat) {
    adaptations.push('Schedule outdoor monuments early morning (06:30–09:30) or after sunset.');
    adaptations.push('Reserve midday hours (12:00–16:00) for air-conditioned cultural centers, dining, and indoor galleries.');
  }
  if (extremeCold) {
    adaptations.push('Balance short scenic outdoor viewpoints with warm indoor culinary halls, thermal baths, or museums.');
  }
  if (adaptations.length === 0) {
    adaptations.push('Favorable outdoor conditions: ideal for walking districts, waterfront promenades, and open-air viewpoints.');
  }

  let advisory = 'Pleasant outdoor sightseeing conditions across the forecast window.';
  if (isRainOrStorm || rainyDays >= 2) {
    advisory = `Rain or precipitation expected (${rainyDays} of ${daily.length} days). Indoor cultural and culinary alternatives are prioritized.`;
  } else if (extremeHeat) {
    advisory = 'High temperatures expected during midday. Outdoor sightseeing is shifted to early morning and evening.';
  } else if (extremeCold) {
    advisory = 'Cold temperatures expected. Short outdoor stops are paired with heated indoor experiences.';
  }

  return {
    indoorRecommended: isRainOrStorm || rainyDays >= 2 || extremeHeat || extremeCold,
    advisory,
    adaptations,
  };
}

export async function fetchLiveWeather(
  lat: number,
  lng: number,
  locationName = 'Selected Destination'
): Promise<WeatherForecastResult> {
  const openWeatherKey = process.env.OPENWEATHER_API_KEY?.trim();

  // 1. Use OpenWeather API when OPENWEATHER_API_KEY is configured
  if (openWeatherKey) {
    try {
      const [currRes, fcRes] = await Promise.all([
        fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${openWeatherKey}`,
          { signal: AbortSignal.timeout(5500) }
        ),
        fetch(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${openWeatherKey}`,
          { signal: AbortSignal.timeout(5500) }
        ),
      ]);

      if (currRes.ok && fcRes.ok) {
        const curr = (await currRes.json()) as {
          name?: string;
          main: { temp: number; feels_like: number; humidity: number };
          wind: { speed: number };
          weather: Array<{ main: string; description: string }>;
        };
        const fc = (await fcRes.json()) as {
          list: Array<{
            dt_txt: string;
            main: { temp_min: number; temp_max: number };
            weather: Array<{ main: string }>;
            rain?: { '3h'?: number };
          }>;
        };

        const byDate = new Map<
          string,
          { mins: number[]; maxs: number[]; conds: string[]; rain: number }
        >();
        for (const entry of fc.list) {
          const date = entry.dt_txt.slice(0, 10);
          const bucket = byDate.get(date) || { mins: [], maxs: [], conds: [], rain: 0 };
          bucket.mins.push(entry.main.temp_min);
          bucket.maxs.push(entry.main.temp_max);
          bucket.conds.push(entry.weather[0]?.main || 'Clear');
          bucket.rain += entry.rain?.['3h'] || 0;
          byDate.set(date, bucket);
        }

        const daily: DailyForecastItem[] = Array.from(byDate.entries())
          .slice(0, 5)
          .map(([date, b]) => {
            const hasStorm = b.conds.some((c) => /rain|storm|snow|drizzle/i.test(c));
            const maxC = Math.round(Math.max(...b.maxs));
            const minC = Math.round(Math.min(...b.mins));
            return {
              date,
              tempMinC: minC,
              tempMaxC: maxC,
              condition: b.conds[Math.floor(b.conds.length / 2)] || 'Clear',
              precipitationMm: Number(b.rain.toFixed(1)),
              isOutdoorFriendly: !hasStorm && b.rain < 3 && maxC < 37 && minC > 0,
            };
          });

        const condText = curr.weather[0]?.description || curr.weather[0]?.main || 'Clear';
        const isRainOrStorm = /rain|storm|drizzle|snow|thunder/i.test(condText);
        const tempC = Math.round(curr.main.temp);
        const adv = buildAdvisory(tempC, isRainOrStorm, daily);

        return {
          locationName: curr.name || locationName,
          lat,
          lng,
          source: 'OpenWeather API',
          current: {
            tempC,
            feelsLikeC: Math.round(curr.main.feels_like),
            humidity: curr.main.humidity,
            windKmh: Math.round((curr.wind.speed || 0) * 3.6),
            condition: condText.charAt(0).toUpperCase() + condText.slice(1),
            isRainOrStorm,
            isExtremeHeat: tempC >= 36,
            isExtremeCold: tempC <= 2,
          },
          daily,
          indoorAlternativesRecommended: adv.indoorRecommended,
          advisory: adv.advisory,
          suggestedAdaptations: adv.adaptations,
        };
      }
    } catch {
      // Fall through to Open-Meteo
    }
  }

  // 2. Live Open-Meteo Global Weather API (keyless, worldwide including Antarctica)
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'
  );
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '5');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    throw new Error(`Weather API unavailable (HTTP ${res.status})`);
  }
  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      weather_code: number;
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
    };
  };

  const currCond = wmoCodeToCondition(data.current.weather_code);
  const daily: DailyForecastItem[] = data.daily.time.map((date, idx) => {
    const c = wmoCodeToCondition(data.daily.weather_code[idx] ?? 0);
    const maxC = Math.round(data.daily.temperature_2m_max[idx] ?? 22);
    const minC = Math.round(data.daily.temperature_2m_min[idx] ?? 15);
    const precip = Number((data.daily.precipitation_sum[idx] ?? 0).toFixed(1));
    return {
      date,
      tempMinC: minC,
      tempMaxC: maxC,
      condition: c.label,
      precipitationMm: precip,
      isOutdoorFriendly: !c.rainOrStorm && precip < 3 && maxC < 37 && minC > 0,
    };
  });

  const tempC = Math.round(data.current.temperature_2m);
  const adv = buildAdvisory(tempC, currCond.rainOrStorm, daily);

  return {
    locationName,
    lat,
    lng,
    source: 'Open-Meteo Live Forecast (OpenWeather fallback)',
    current: {
      tempC,
      feelsLikeC: Math.round(data.current.apparent_temperature),
      humidity: Math.round(data.current.relative_humidity_2m),
      windKmh: Math.round(data.current.wind_speed_10m),
      condition: currCond.label,
      isRainOrStorm: currCond.rainOrStorm,
      isExtremeHeat: tempC >= 36,
      isExtremeCold: tempC <= 2,
    },
    daily,
    indoorAlternativesRecommended: adv.indoorRecommended,
    advisory: adv.advisory,
    suggestedAdaptations: adv.adaptations,
  };
}
