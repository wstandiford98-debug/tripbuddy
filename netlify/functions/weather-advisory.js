/**
 * weather-advisory.js
 * Combines OpenWeatherMap live data with OpenAI to generate
 * plain-English driving advisories for each city on a route.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const WEATHER_KEY = 'f7af3d698f31edf256d7c726c864b47b';
const OPENAI_KEY = process.env.OPENAI_API_KEY || 'sk-2K2GBE9BEQ5oDicc8QKXLc';
const OPENAI_BASE = 'https://openrouter.ai/api/v1'; // proxy-compatible

// ── Fetch live weather from OpenWeatherMap ─────────────────────────────────
async function fetchWeather(city) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},US&appid=${WEATHER_KEY}&units=imperial`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.cod !== 200) throw new Error(`Weather not found for ${city}`);
  return {
    city,
    temp: Math.round(data.main.temp),
    feels_like: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    wind_speed: Math.round(data.wind.speed),
    wind_gust: data.wind.gust ? Math.round(data.wind.gust) : null,
    visibility: data.visibility ? Math.round(data.visibility / 1609 * 10) / 10 : null,
    condition: data.weather[0].main,
    description: data.weather[0].description,
    alerts: data.alerts || []
  };
}

// ── Generate driving advisory via OpenAI ──────────────────────────────────
async function generateAdvisory(weatherList) {
  const weatherSummary = weatherList.map(w =>
    `${w.city}: ${w.temp}°F (feels ${w.feels_like}°F), ${w.description}, wind ${w.wind_speed}mph${w.wind_gust ? ` gusting to ${w.wind_gust}mph` : ''}, humidity ${w.humidity}%${w.visibility ? `, visibility ${w.visibility}mi` : ''}${w.alerts.length ? ', WEATHER ALERT ACTIVE' : ''}`
  ).join('\n');

  const prompt = `You are a road trip safety advisor. Based on the following live weather conditions along a driving route, provide a concise, practical driving advisory for each city. Focus on road safety, driving conditions, and any precautions travelers should take. Be direct and helpful — no fluff. Format as a JSON array with objects containing: city (string), advisory (1-2 sentence plain English driving tip), severity (one of: "clear", "caution", "warning"), and emoji (a single relevant emoji).

Weather data:
${weatherSummary}

Respond ONLY with valid JSON array, no markdown, no explanation.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3
    })
  });

  const data = await res.json();
  if (!data.choices || !data.choices[0]) throw new Error('OpenAI returned no response');

  const raw = data.choices[0].message.content.trim();
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

// ── Fallback advisory (no OpenAI) ─────────────────────────────────────────
function fallbackAdvisory(w) {
  const dangerous = ['Thunderstorm', 'Snow', 'Blizzard', 'Tornado', 'Hurricane'];
  const caution = ['Rain', 'Drizzle', 'Fog', 'Mist', 'Haze', 'Dust', 'Sand'];

  if (dangerous.some(c => w.condition.includes(c)) || w.wind_speed > 40) {
    return {
      city: w.city,
      advisory: `Hazardous conditions in ${w.city} — ${w.description} with ${w.wind_speed}mph winds. Consider delaying travel or use extreme caution.`,
      severity: 'warning',
      emoji: '⛈️'
    };
  } else if (caution.some(c => w.condition.includes(c)) || w.wind_speed > 25 || (w.visibility && w.visibility < 3)) {
    return {
      city: w.city,
      advisory: `Use caution near ${w.city} — ${w.description}. Reduce speed and increase following distance.`,
      severity: 'caution',
      emoji: '⚠️'
    };
  } else {
    return {
      city: w.city,
      advisory: `Clear driving conditions in ${w.city} — ${w.temp}°F and ${w.description}. No weather concerns.`,
      severity: 'clear',
      emoji: '✅'
    };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};
  const citiesParam = params.cities || '';
  const cities = citiesParam.split(',').map(c => c.trim()).filter(Boolean).slice(0, 10);

  if (cities.length === 0) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'No cities provided. Use ?cities=Portland,Seattle,Bend' })
    };
  }

  try {
    // Step 1: Fetch live weather for all cities in parallel
    const weatherResults = await Promise.allSettled(cities.map(fetchWeather));
    const weatherList = weatherResults
      .map((r, i) => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean);

    if (weatherList.length === 0) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Could not fetch weather data for any city' })
      };
    }

    // Step 2: Generate AI advisories (with fallback)
    let advisories;
    try {
      advisories = await generateAdvisory(weatherList);
    } catch (aiErr) {
      // Fallback to rule-based advisories if OpenAI fails
      advisories = weatherList.map(fallbackAdvisory);
    }

    // Step 3: Merge weather data with advisories
    const combined = weatherList.map(w => {
      const adv = advisories.find(a => a.city.toLowerCase().includes(w.city.toLowerCase().split(',')[0]) ||
        w.city.toLowerCase().includes(a.city.toLowerCase().split(',')[0])) ||
        fallbackAdvisory(w);
      return {
        city: w.city,
        temp: w.temp,
        feels_like: w.feels_like,
        humidity: w.humidity,
        wind_speed: w.wind_speed,
        wind_gust: w.wind_gust,
        visibility: w.visibility,
        condition: w.condition,
        description: w.description,
        advisory: adv.advisory,
        severity: adv.severity,
        emoji: adv.emoji
      };
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        advisories: combined,
        timestamp: new Date().toISOString(),
        cities_requested: cities.length,
        cities_returned: combined.length
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
