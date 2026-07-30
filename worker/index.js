const STEAM_SUGGEST_URL =
  "https://store.steampowered.com/search/suggest";
const CACHE_SECONDS = 30 * 60;
const DETAIL_CACHE_SECONDS = 6 * 60 * 60;
const DETAIL_SCHEMA_VERSION = 3;
const MAX_RESULTS = 8;
const MAX_TAGS = 20;
const MAX_NEXT_FEST_RECORDS = 5;

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

export function parseSteamTags(html) {
  const tags = [];
  const seen = new Set();
  const matches = html.matchAll(
    /<a\b[^>]*class="[^"]*\bapp_tag\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  );
  for (const match of matches) {
    const tag = textFromHtml(match[1]).replace(/\s+/g, " ").trim();
    const key = tag.toLocaleLowerCase("en-US");
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

export function parseNextFestHistory(appId, payload) {
  const items = Array.isArray(payload?.appnews?.newsitems)
    ? payload.appnews.newsitems
    : [];
  return items
    .filter((item) => {
      const searchable = `${item?.title || ""} ${textFromHtml(
        String(item?.contents || ""),
      )}`;
      return /\b(?:steam\s+)?next\s+fest\b/i.test(searchable);
    })
    .slice(0, MAX_NEXT_FEST_RECORDS)
    .map((item) => {
      const published = Number(item?.date);
      let url = String(item?.url || "");
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") url = "";
      } catch {
        url = "";
      }
      return {
        title: textFromHtml(String(item?.title || "Steam Next Fest")),
        publishedAt: Number.isFinite(published)
          ? new Date(published * 1000).toISOString()
          : "",
        url:
          url ||
          `https://store.steampowered.com/news/app/${appId}/view/${String(
            item?.gid || "",
          )}`,
      };
    });
}

function steamAppModel(appId, details, storeHtml, newsPayload) {
  const data = details?.[appId]?.success ? details[appId].data : null;
  const categories = Array.isArray(data?.categories)
    ? data.categories.map((item) => String(item?.description || ""))
    : [];
  const genres = Array.isArray(data?.genres)
    ? data.genres
        .map((item) => String(item?.description || "").trim())
        .filter(Boolean)
    : [];
  const storeTags = parseSteamTags(storeHtml || "");
  const tags = storeTags.length > 0 ? storeTags : genres;
  const earlyAccess = tags.some(
    (tag) => tag.toLocaleLowerCase("en-US") === "early access",
  );
  const localMultiplayer = categories.some((category) =>
    /local (?:co-op|multi-player)|shared\/split screen/i.test(category),
  );

  let releaseStatus = null;
  if (data) {
    releaseStatus = earlyAccess
      ? "early_access"
      : data.release_date?.coming_soon
        ? "unreleased"
        : "released";
  }

  return {
    appId,
    name: String(data?.name || "").trim(),
    tags,
    demoStatus: data
      ? Array.isArray(data.demos) && data.demos.length > 0
        ? "live"
        : "none"
      : null,
    releaseStatus,
    localMultiplayer: data ? localMultiplayer : null,
    storeUrl: `https://store.steampowered.com/app/${appId}/`,
    capsuleImageUrl: String(data?.header_image || "").trim(),
    nextFestHistory: parseNextFestHistory(appId, newsPayload),
  };
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
  const normalizedEmail = email.toLocaleLowerCase("en-US");
  const allowedEmails = String(env.ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
  const localBypass =
    env.ALLOW_LOCAL_DEV === "true" &&
    ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
  return (
    localBypass ||
    allowedEmail(email, domain) ||
    allowedEmails.includes(normalizedEmail)
  );
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

export async function getSteamApp(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);

  if (!requestIsAuthorized(request, env)) {
    return json({ error: "authentication_required" }, 401, cors);
  }

  const appId = (new URL(request.url).searchParams.get("appid") || "").trim();
  if (!/^\d{1,12}$/.test(appId)) {
    return json({ error: "invalid_app_id" }, 400, cors);
  }

  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/steam-app?appid=${appId}&schema=${DETAIL_SCHEMA_VERSION}`,
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

  const detailsUrl = new URL("https://store.steampowered.com/api/appdetails");
  detailsUrl.searchParams.set("appids", appId);
  detailsUrl.searchParams.set("cc", "TR");
  detailsUrl.searchParams.set("l", "english");
  const storeUrl = new URL(`https://store.steampowered.com/app/${appId}/`);
  storeUrl.searchParams.set("cc", "TR");
  storeUrl.searchParams.set("l", "english");
  const newsUrl = new URL(
    "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/",
  );
  newsUrl.searchParams.set("appid", appId);
  newsUrl.searchParams.set("count", "100");
  newsUrl.searchParams.set("maxlength", "1200");

  const [detailsResult, storeResult, newsResult] = await Promise.allSettled([
    fetch(detailsUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "Steam-Event-Radar/1.0",
      },
    }),
    fetch(storeUrl, {
      headers: {
        accept: "text/html",
        cookie: "birthtime=0; mature_content=1",
        "user-agent": "Steam-Event-Radar/1.0",
      },
    }),
    fetch(newsUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "Steam-Event-Radar/1.0",
      },
    }),
  ]);

  let details = null;
  if (detailsResult.status === "fulfilled" && detailsResult.value.ok) {
    details = await detailsResult.value.json();
  }
  const storeHtml =
    storeResult.status === "fulfilled" && storeResult.value.ok
      ? await storeResult.value.text()
      : "";
  let newsPayload = null;
  if (newsResult.status === "fulfilled" && newsResult.value.ok) {
    newsPayload = await newsResult.value.json();
  }
  if (!details && !storeHtml) {
    return json({ error: "steam_unavailable" }, 502, cors);
  }

  const response = json(
    steamAppModel(appId, details, storeHtml, newsPayload),
    200,
    {
      ...cors,
      "cache-control": `public, max-age=${DETAIL_CACHE_SECONDS}`,
    },
  );
  await cache?.put(cacheKey, response.clone());
  return response;
}

function optionsResponse(request, env) {
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname === "/api/steam-search" ||
      url.pathname === "/api/steam-app"
    ) {
      if (request.method === "OPTIONS") {
        return optionsResponse(request, env);
      }
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405, {
          allow: "GET, OPTIONS",
        });
      }
      return url.pathname === "/api/steam-search"
        ? searchSteam(request, env)
        : getSteamApp(request, env);
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
