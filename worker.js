/**
 * Cloudflare Worker — Intervals.icu API Proxy
 * JAT 80K Tekaški načrt 2026
 *
 * Nastavi Environment Variable v Cloudflare:
 *   INTERVALS_API_KEY = tvoj_api_ključ
 *   INTERVALS_ATHLETE_ID = tvoj_athlete_id  (npr. i12345)
 *
 * Worker URL bo npr.: https://jat-proxy.rokime.workers.dev
 */

const INTERVALS_BASE = "https://intervals.icu/api/v1";

// Dovoli samo zahteve iz tvojih domen
const ALLOWED_ORIGINS = [
  "null",                    // lokalne HTML datoteke (file://)
  "http://localhost",
  "http://127.0.0.1",
  // Ko daš HTML na GitHub Pages, dodaj:
  "https://rokmaroltapp-max.github.io",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin?.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname; // npr. /activities, /athlete

    // Varnost: dovoli samo GET na specifične poti
    const ALLOWED_PATHS = [
      /^\/activities$/,
      /^\/activities\/\d+$/,
      /^\/athlete$/,
      /^\/events$/,
    ];

    const isAllowed = ALLOWED_PATHS.some(re => re.test(path));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Pot ni dovoljena" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Preveri da sta API ključ in athlete ID nastavljena
    if (!env.INTERVALS_API_KEY || !env.INTERVALS_ATHLETE_ID) {
      return new Response(JSON.stringify({ error: "API ključ ali Athlete ID nista nastavljena v Cloudflare Environment Variables." }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Sestavi URL za intervals.icu
    const athleteId = env.INTERVALS_ATHLETE_ID;
    const queryString = url.search; // prenesi query parametre (?oldest=...&newest=...)

    let intervalsUrl;
    if (path === "/activities") {
      intervalsUrl = `${INTERVALS_BASE}/athlete/${athleteId}/activities${queryString}`;
    } else if (path.startsWith("/activities/")) {
      const actId = path.replace("/activities/", "");
      intervalsUrl = `${INTERVALS_BASE}/athlete/${athleteId}/activities/${actId}${queryString}`;
    } else if (path === "/athlete") {
      intervalsUrl = `${INTERVALS_BASE}/athlete/${athleteId}${queryString}`;
    } else if (path === "/events") {
      intervalsUrl = `${INTERVALS_BASE}/athlete/${athleteId}/events${queryString}`;
    }

    // Klic na intervals.icu
    const apiKey = env.INTERVALS_API_KEY;
    const credentials = btoa(`API_KEY:${apiKey}`);

    try {
      const response = await fetch(intervalsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json",
        },
      });

      const data = await response.text();

      return new Response(data, {
        status: response.status,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: `Napaka pri klicu intervals.icu: ${err.message}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  },
};
