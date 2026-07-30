const STEAM_SUGGEST_URL =
  "https://store.steampowered.com/search/suggest";
const CACHE_SECONDS = 30 * 60;
const MAX_RESULTS = 8;

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function textFromHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, "").trim());
}

export function parseSteamSuggestions(html) {
  const results = [];
  const matches = html.matchAll(
    /<a\b([^>]*\bdata-ds-appid="(\d+)"[^>]*)>([\s\S]*?)<\/a>/gi,
  );

  for (const match of matches) {
    const attributes = match[1];
    const body = match[3];
    const nameMatch = body.match(
      /<div\b[^>]*class="[^"]*\bmatch_name\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    if (!nameMatch) continue;
    const imageMatch = body.match(/<img\b[^>]*\bsrc="([^"]+)"/i);
    const hrefMatch = attributes.match(/\bhref="([^"]+)"/i);
    results.push({
      appId: match[2],
      name: textFromHtml(nameMatch[1]),
      imageUrl: imageMatch ? decodeHtml(imageMatch[1]) : "",
      storeUrl: hrefMatch ? decodeHtml(hrefMatch[1]) : "",
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function accessEmail(request) {
  return (
    request.headers.get("cf-access-authenticated-user-email") || ""
  ).trim();
}

function allowedEmail(email, domain) {
  return email.toLocaleLowerCase("en-US").endsWith(
    `@${domain.toLocaleLowerCase("en-US")}`,
  );
}

function requestIsAuthorized(request, env) {
  const domain = env.ALLOWED_EMAIL_DOMAIN || "gaminginturkey.com";
  const email = accessEmail(request);
  const localBypass =
    env.ALLOW_LOCAL_DEV === "true" &&
    ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
  return localBypass || allowedEmail(email, domain);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = env.DASHBOARD_ORIGIN || requestOrigin;
  if (origin !== requestOrigin && origin !== configuredOrigin) return null;
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

export async function searchSteam(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);

  if (!requestIsAuthorized(request, env)) {
    return json({ error: "authentication_required" }, 401, cors);
  }

  const query = (new URL(request.url).searchParams.get("q") || "").trim();
  if (query.length < 2 || query.length > 80) {
    return json(
      { error: "query_length", results: [] },
      400,
      cors,
    );
  }

  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/steam-search?q=${encodeURIComponent(
      query.toLocaleLowerCase("tr"),
    )}`,
  );
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    Object.entries(cors).forEach(([key, value]) =>
      response.headers.set(key, value),
    );
    return response;
  }

  const steamUrl = new URL(STEAM_SUGGEST_URL);
  steamUrl.searchParams.set("term", query);
  steamUrl.searchParams.set("f", "games");
  steamUrl.searchParams.set("cc", "TR");
  steamUrl.searchParams.set("l", "turkish");
  steamUrl.searchParams.set("v", "1");
  const steamResponse = await fetch(steamUrl, {
    headers: {
      accept: "text/html",
      "user-agent": "Steam-Event-Radar/1.0",
    },
  });
  if (!steamResponse.ok) {
    return json({ error: "steam_unavailable", results: [] }, 502, cors);
  }

  const response = json(
    { results: parseSteamSuggestions(await steamResponse.text()) },
    200,
    {
      ...cors,
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  );
  await cache?.put(cacheKey, response.clone());
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/steam-search") {
      if (request.method === "OPTIONS") {
        const cors = corsHeaders(request, env);
        if (cors === null) return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-methods": "GET, OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "86400",
          },
        });
      }
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405, {
          allow: "GET, OPTIONS",
        });
      }
      return searchSteam(request, env);
    }
    if (!requestIsAuthorized(request, env)) {
      return new Response("Kurumsal giriş gerekli.", {
        status: 401,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
