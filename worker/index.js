const STEAM_SUGGEST_URL =
  "https://store.steampowered.com/search/suggest";
const CACHE_SECONDS = 30 * 60;
const DETAIL_CACHE_SECONDS = 6 * 60 * 60;
const DETAIL_SCHEMA_VERSION = 5;
const MAX_RESULTS = 8;
const MAX_TAGS = 20;
const MAX_NEXT_FEST_RECORDS = 5;
const TEAM_STATE_TYPES = new Set([
  "game",
  "task",
  "application",
  "preference",
]);
const MAX_TEAM_STATE_PAYLOAD_BYTES = 24 * 1024;

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

export function steamLibraryCapsuleUrl(appId, payload) {
  const capsule =
    payload?.data?.[appId]?.common?.library_assets_full?.library_capsule;
  const relativePath =
    capsule?.image2x?.english || capsule?.image?.english || "";
  if (
    !/^[a-f0-9]{40}\/library_(?:capsule|600x900)(?:_2x)?\.jpg$/i.test(
      relativePath,
    )
  ) {
    return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
  }
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/${relativePath}`;
}

function steamAppModel(
  appId,
  details,
  storeHtml,
  newsPayload,
  appInfoPayload,
) {
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
    capsuleImageUrl: steamLibraryCapsuleUrl(appId, appInfoPayload),
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

function configuredEmails(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
}

function requestIsAdmin(request, env) {
  const email = accessEmail(request).toLocaleLowerCase("en-US");
  return configuredEmails(
    env.ADMIN_EMAILS || "batuhan.ozmen@gaminginturkey.com",
  ).includes(email);
}

async function requestIsAuthorized(request, env) {
  const domain = env.ALLOWED_EMAIL_DOMAIN || "gaminginturkey.com";
  const email = accessEmail(request);
  const normalizedEmail = email.toLocaleLowerCase("en-US");
  const allowedEmails = configuredEmails(env.ALLOWED_EMAILS);
  const localBypass =
    env.ALLOW_LOCAL_DEV === "true" &&
    ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
  if (
    localBypass ||
    allowedEmail(email, domain) ||
    allowedEmails.includes(normalizedEmail)
  ) {
    return true;
  }
  if (!normalizedEmail || !env.DB) return false;
  const record = await env.DB
    .prepare("SELECT enabled FROM access_users WHERE email = ?")
    .bind(normalizedEmail)
    .first();
  return Number(record?.enabled || 0) === 1;
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

  if (!(await requestIsAuthorized(request, env))) {
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

  if (!(await requestIsAuthorized(request, env))) {
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
  const appInfoUrl = new URL(`https://api.steamcmd.net/v1/info/${appId}`);

  const [detailsResult, storeResult, newsResult, appInfoResult] =
    await Promise.allSettled([
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
      fetch(appInfoUrl, {
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
  let appInfoPayload = null;
  if (appInfoResult.status === "fulfilled" && appInfoResult.value.ok) {
    appInfoPayload = await appInfoResult.value.json();
  }
  if (!details && !storeHtml) {
    return json({ error: "steam_unavailable" }, 502, cors);
  }

  const response = json(
    steamAppModel(
      appId,
      details,
      storeHtml,
      newsPayload,
      appInfoPayload,
    ),
    200,
    {
      ...cors,
      "cache-control": `public, max-age=${DETAIL_CACHE_SECONDS}`,
    },
  );
  await cache?.put(cacheKey, response.clone());
  return response;
}

export async function getSteamStats(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  const appId = (new URL(request.url).searchParams.get("appid") || "").trim();
  if (!/^\d{1,12}$/.test(appId)) {
    return json({ error: "invalid_app_id" }, 400, cors);
  }
  const reviewsUrl = new URL(
    `https://store.steampowered.com/appreviews/${appId}`,
  );
  reviewsUrl.searchParams.set("json", "1");
  reviewsUrl.searchParams.set("language", "all");
  reviewsUrl.searchParams.set("purchase_type", "all");
  reviewsUrl.searchParams.set("num_per_page", "0");
  const playersUrl = new URL(
    "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
  );
  playersUrl.searchParams.set("appid", appId);
  const detailsUrl = new URL("https://store.steampowered.com/api/appdetails");
  detailsUrl.searchParams.set("appids", appId);
  detailsUrl.searchParams.set("cc", "TR");
  detailsUrl.searchParams.set("l", "turkish");
  const [reviewsResult, playersResult, detailsResult] =
    await Promise.allSettled([
      fetch(reviewsUrl, { headers: { accept: "application/json" } }),
      fetch(playersUrl, { headers: { accept: "application/json" } }),
      fetch(detailsUrl, { headers: { accept: "application/json" } }),
    ]);
  const reviews =
    reviewsResult.status === "fulfilled" && reviewsResult.value.ok
      ? await reviewsResult.value.json()
      : null;
  const players =
    playersResult.status === "fulfilled" && playersResult.value.ok
      ? await playersResult.value.json()
      : null;
  const details =
    detailsResult.status === "fulfilled" && detailsResult.value.ok
      ? await detailsResult.value.json()
      : null;
  const summary = reviews?.query_summary || {};
  const totalReviews = Number(summary.total_reviews || 0);
  const positiveReviews = Number(summary.total_positive || 0);
  const negativeReviews = Number(
    summary.total_negative || Math.max(0, totalReviews - positiveReviews),
  );
  const appDetails = details?.[appId]?.data || {};
  const price = appDetails.price_overview;
  return json(
    {
      appId,
      currentPlayers: Number(players?.response?.player_count || 0),
      totalReviews,
      positiveReviews,
      negativeReviews,
      positivePercent:
        totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0,
      negativePercent:
        totalReviews > 0 ? Math.round((negativeReviews / totalReviews) * 100) : 0,
      reviewScore: String(summary.review_score_desc || ""),
      price: price
        ? {
            currency: String(price.currency || ""),
            initial: Number(price.initial || 0),
            final: Number(price.final || 0),
            initialFormatted: String(
              price.initial_formatted || price.final_formatted || "",
            ),
            finalFormatted: String(price.final_formatted || ""),
            discountPercent: Number(price.discount_percent || 0),
          }
        : null,
      genres: Array.isArray(appDetails.genres)
        ? appDetails.genres
            .map((item) => String(item?.description || "").trim())
            .filter(Boolean)
            .slice(0, 12)
        : [],
      categories: Array.isArray(appDetails.categories)
        ? appDetails.categories
            .map((item) => String(item?.description || "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : [],
      curatorReviews: null,
      capturedAt: new Date().toISOString(),
    },
    200,
    { ...cors, "cache-control": "public, max-age=900" },
  );
}

export async function getGamalyticGame(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!env.GAMALYTIC_API_KEY) {
    return json({ error: "gamalytic_not_configured" }, 503, cors);
  }
  const appId = (new URL(request.url).searchParams.get("appid") || "").trim();
  if (!/^\d{1,12}$/.test(appId)) {
    return json({ error: "invalid_app_id" }, 400, cors);
  }
  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/gamalytic-game?appid=${appId}`,
  );
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const gamalyticUrl = new URL(`https://api.gamalytic.com/game/${appId}`);
  gamalyticUrl.searchParams.set(
    "fields",
    "steamId,name,copiesSold,owners,revenue,totalRevenue,wishlists,players,followers,avgPlaytime,reviewScore,releaseDate,unreleased,earlyAccess",
  );
  const upstream = await fetch(gamalyticUrl, {
    headers: {
      accept: "application/json",
      "api-key": env.GAMALYTIC_API_KEY,
    },
  });
  if (!upstream.ok) {
    return json(
      {
        error: upstream.status === 404 ? "game_not_found" : "gamalytic_unavailable",
      },
      upstream.status === 404 ? 404 : 502,
      cors,
    );
  }
  const source = await upstream.json();
  const result = {
    appId,
    copiesSold: Number(source?.copiesSold || 0),
    owners: Number(source?.owners || 0),
    revenue: Number(source?.revenue || 0),
    totalRevenue: Number(source?.totalRevenue || 0),
    wishlists: Number(source?.wishlists || 0),
    players: Number(source?.players || 0),
    followers: Number(source?.followers || 0),
    avgPlaytime: Number(source?.avgPlaytime || 0),
    reviewScore: Number(source?.reviewScore || 0),
    estimated: true,
    source: "Gamalytic",
    capturedAt: new Date().toISOString(),
  };
  const response = json(result, 200, {
    ...cors,
    "cache-control": `private, max-age=${DETAIL_CACHE_SECONDS}`,
  });
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
      "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, x-admin-password",
      "access-control-max-age": "86400",
    },
  });
}

function validStateKey(value) {
  return /^[a-z]+:[a-zA-Z0-9._:-]{1,180}$/.test(value);
}

function teamStateRecord(row) {
  let payload = {};
  try {
    const parsed = JSON.parse(String(row.payload || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed;
    }
  } catch {}
  return {
    key: String(row.state_key || ""),
    type: String(row.state_type || ""),
    payload,
    updatedBy: String(row.updated_by || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function getTeamState(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!env.DB) return json({ enabled: false, records: [] }, 200, cors);
  const result = await env.DB
    .prepare(
      "SELECT state_key, state_type, payload, updated_by, updated_at FROM team_state ORDER BY updated_at DESC LIMIT 1000",
    )
    .bind()
    .all();
  return json(
    {
      enabled: true,
      user: accessEmail(request),
      records: (result.results || []).map(teamStateRecord),
    },
    200,
    cors,
  );
}

export async function putTeamState(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!env.DB) return json({ error: "team_storage_unavailable" }, 503, cors);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }
  const key = String(body?.key || "");
  const type = String(body?.type || "");
  const payload = body?.payload;
  if (
    !validStateKey(key) ||
    !TEAM_STATE_TYPES.has(type) ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return json({ error: "invalid_state" }, 400, cors);
  }
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_TEAM_STATE_PAYLOAD_BYTES) {
    return json({ error: "payload_too_large" }, 413, cors);
  }
  const updatedAt = new Date().toISOString();
  const updatedBy = accessEmail(request).toLocaleLowerCase("en-US");
  await env.DB
    .prepare(
      `INSERT INTO team_state (state_key, state_type, payload, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         state_type = excluded.state_type,
         payload = excluded.payload,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    )
    .bind(key, type, serialized, updatedBy, updatedAt)
    .run();
  return json(
    { record: { key, type, payload, updatedBy, updatedAt } },
    200,
    cors,
  );
}

export async function deleteTeamState(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!env.DB) return json({ error: "team_storage_unavailable" }, 503, cors);
  const key = (new URL(request.url).searchParams.get("key") || "").trim();
  if (!validStateKey(key)) return json({ error: "invalid_state_key" }, 400, cors);
  await env.DB
    .prepare("DELETE FROM team_state WHERE state_key = ?")
    .bind(key)
    .run();
  return json({ deleted: key }, 200, cors);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function secretsMatch(left, right) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right || ""))),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function adminStatus(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!requestIsAdmin(request, env)) {
    return json({ error: "admin_required" }, 403, cors);
  }
  return json(
    {
      admin: true,
      passwordConfigured: Boolean(env.ADMIN_PANEL_PASSWORD),
    },
    200,
    cors,
  );
}

async function requireAdmin(request, env, cors) {
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!requestIsAdmin(request, env)) {
    return json({ error: "admin_required" }, 403, cors);
  }
  if (!env.ADMIN_PANEL_PASSWORD) {
    return json({ error: "admin_password_not_configured" }, 503, cors);
  }
  if (
    !(await secretsMatch(
      request.headers.get("x-admin-password") || "",
      env.ADMIN_PANEL_PASSWORD,
    ))
  ) {
    return json({ error: "admin_password_required" }, 401, cors);
  }
  return null;
}

export async function adminSnapshot(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  const denied = await requireAdmin(request, env, cors);
  if (denied) return denied;
  if (!env.DB) return json({ error: "admin_storage_unavailable" }, 503, cors);
  const [users, recipients, settings, totals, popular] = await Promise.all([
    env.DB.prepare(
      "SELECT email, role, enabled, created_at AS createdAt FROM access_users ORDER BY email",
    ).all(),
    env.DB.prepare(
      `SELECT email, recipient_type AS recipientType, enabled,
              created_at AS createdAt
       FROM email_delivery_recipients
       ORDER BY recipient_type DESC, email`,
    ).all(),
    env.DB.prepare(
      `SELECT enabled, send_time AS sendTime, timezone,
              sender_name AS senderName,
              subject_template AS subjectTemplate,
              last_sent_date AS lastSentDate, updated_at AS updatedAt
       FROM email_delivery_settings
       WHERE id = 1`,
    ).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS events,
              COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN user_email END) AS visitors,
              SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS pageViews
       FROM analytics_events
       WHERE occurred_at >= datetime('now', '-30 days')`,
    ).first(),
    env.DB.prepare(
      `SELECT event_name AS eventName, target, COUNT(*) AS count
       FROM analytics_events
       WHERE occurred_at >= datetime('now', '-30 days')
       GROUP BY event_name, target
       ORDER BY count DESC
       LIMIT 20`,
    ).all(),
  ]);
  return json(
    {
      users: users.results || [],
      recipients: recipients.results || [],
      accessRules: [
        {
          type: "domain",
          value: `@${env.ALLOWED_EMAIL_DOMAIN || "gaminginturkey.com"}`,
          source: "config",
        },
        ...configuredEmails(env.ALLOWED_EMAILS || "pinargulerrrr@gmail.com").map(
          (email) => ({ type: "email", value: email, source: "config" }),
        ),
        ...configuredEmails(
          env.ADMIN_EMAILS || "batuhan.ozmen@gaminginturkey.com",
        ).map((email) => ({
          type: "admin",
          value: email,
          source: "config",
        })),
      ],
      emailSettings: settings || {
        enabled: 1,
        sendTime: "09:30",
        timezone: "Europe/Istanbul",
        senderName: "Steam Etkinlik Radarı",
        subjectTemplate:
          "Steam Etkinlik Takibi · {{kritik}} kritik tarih · {{etkinlik}} etkinlik",
        lastSentDate: null,
      },
      analytics: {
        events: Number(totals?.events || 0),
        visitors: Number(totals?.visitors || 0),
        pageViews: Number(totals?.pageViews || 0),
        popular: popular.results || [],
      },
    },
    200,
    cors,
  );
}

export async function updateAdminCollection(request, env, collection) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  const denied = await requireAdmin(request, env, cors);
  if (denied) return denied;
  if (!env.DB) return json({ error: "admin_storage_unavailable" }, 503, cors);
  const body =
    request.method === "DELETE" ? {} : await request.json().catch(() => ({}));
  const email = (
    request.method === "DELETE"
      ? new URL(request.url).searchParams.get("email") || ""
      : String(body?.email || "")
  )
    .trim()
    .toLocaleLowerCase("en-US");
  if (!validEmail(email)) return json({ error: "invalid_email" }, 400, cors);
  const table =
    collection === "users" ? "access_users" : "email_delivery_recipients";
  if (request.method === "DELETE") {
    await env.DB.prepare(`DELETE FROM ${table} WHERE email = ?`).bind(email).run();
    return json({ deleted: email }, 200, cors);
  }
  const actor = accessEmail(request).toLocaleLowerCase("en-US");
  const now = new Date().toISOString();
  if (collection === "users") {
    await env.DB.prepare(
      `INSERT INTO access_users (email, role, enabled, created_by, created_at)
       VALUES (?, 'member', 1, ?, ?)
       ON CONFLICT(email) DO UPDATE SET enabled = 1`,
    )
      .bind(email, actor, now)
      .run();
  } else {
    const recipientType = body?.recipientType === "to" ? "to" : "bcc";
    await env.DB.prepare(
      `INSERT INTO email_delivery_recipients
         (email, recipient_type, enabled, created_by, created_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         recipient_type = excluded.recipient_type,
         enabled = 1`,
    )
      .bind(email, recipientType, actor, now)
      .run();
  }
  return json({ email }, 200, cors);
}

export async function updateEmailSettings(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  const denied = await requireAdmin(request, env, cors);
  if (denied) return denied;
  if (!env.DB) return json({ error: "admin_storage_unavailable" }, 503, cors);
  const body = await request.json().catch(() => ({}));
  const enabled = body?.enabled === false ? 0 : 1;
  const sendTime = String(body?.sendTime || "").trim();
  const timezone = String(body?.timezone || "").trim();
  const senderName = String(body?.senderName || "")
    .replace(/[\r\n<>]+/g, " ")
    .trim()
    .slice(0, 80);
  const subjectTemplate = String(body?.subjectTemplate || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 180);
  if (!/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(sendTime)) {
    return json({ error: "invalid_send_time" }, 400, cors);
  }
  if (timezone !== "Europe/Istanbul") {
    return json({ error: "invalid_timezone" }, 400, cors);
  }
  if (!senderName || !subjectTemplate) {
    return json({ error: "invalid_subject" }, 400, cors);
  }
  const actor = accessEmail(request).toLocaleLowerCase("en-US");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO email_delivery_settings
       (id, enabled, send_time, timezone, sender_name, subject_template, updated_by, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       send_time = excluded.send_time,
       timezone = excluded.timezone,
       sender_name = excluded.sender_name,
       subject_template = excluded.subject_template,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  )
    .bind(enabled, sendTime, timezone, senderName, subjectTemplate, actor, now)
    .run();
  return json(
    {
      enabled: Boolean(enabled),
      sendTime,
      timezone,
      senderName,
      subjectTemplate,
      updatedAt: now,
    },
    200,
    cors,
  );
}

export async function recordAnalytics(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin_not_allowed" }, 403);
  if (!(await requestIsAuthorized(request, env))) {
    return json({ error: "authentication_required" }, 401, cors);
  }
  if (!env.DB) return json({ error: "analytics_unavailable" }, 503, cors);
  const body = await request.json();
  const eventName = String(body?.eventName || "").trim().slice(0, 60);
  const target = String(body?.target || "").trim().slice(0, 160);
  if (!/^[a-z][a-z0-9_]{1,59}$/.test(eventName)) {
    return json({ error: "invalid_event" }, 400, cors);
  }
  await env.DB.prepare(
    "INSERT INTO analytics_events (occurred_at, user_email, event_name, target) VALUES (?, ?, ?, ?)",
  )
    .bind(
      new Date().toISOString(),
      accessEmail(request).toLocaleLowerCase("en-US") || "anonymous",
      eventName,
      target,
    )
    .run();
  return json({ recorded: true }, 202, cors);
}

export async function automationRecipients(request, env) {
  const provided = request.headers.get("authorization") || "";
  if (
    !env.EMAIL_AUTOMATION_SECRET ||
    provided !== `Bearer ${env.EMAIL_AUTOMATION_SECRET}`
  ) {
    return json({ error: "authentication_required" }, 401);
  }
  if (!env.DB) return json({ error: "recipient_storage_unavailable" }, 503);
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const sentDate = String(body?.sentDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) {
      return json({ error: "invalid_sent_date" }, 400);
    }
    await env.DB.prepare(
      `UPDATE email_delivery_settings
       SET last_sent_date = ?, updated_at = ?
       WHERE id = 1`,
    )
      .bind(sentDate, new Date().toISOString())
      .run();
    return json({ lastSentDate: sentDate }, 200);
  }
  const [records, settings] = await Promise.all([
    env.DB.prepare(
      `SELECT email, recipient_type AS recipientType
       FROM email_delivery_recipients
       WHERE enabled = 1
       ORDER BY recipient_type DESC, email`,
    ).all(),
    env.DB.prepare(
      `SELECT enabled, send_time AS sendTime, timezone,
              sender_name AS senderName,
              subject_template AS subjectTemplate,
              last_sent_date AS lastSentDate
       FROM email_delivery_settings
       WHERE id = 1`,
    ).first(),
  ]);
  const recipients = records.results || [];
  return json({
    to: recipients
      .filter((item) => item.recipientType === "to")
      .map((item) => item.email),
    bcc: recipients
      .filter((item) => item.recipientType !== "to")
      .map((item) => item.email),
    settings: settings || {
      enabled: 1,
      sendTime: "09:30",
      timezone: "Europe/Istanbul",
      senderName: "Steam Etkinlik Radarı",
      subjectTemplate:
        "Steam Etkinlik Takibi · {{kritik}} kritik tarih · {{etkinlik}} etkinlik",
      lastSentDate: null,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/status") {
      if (request.method === "GET") return adminStatus(request, env);
      return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    }
    if (url.pathname === "/api/admin") {
      if (request.method === "GET") return adminSnapshot(request, env);
      return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    }
    if (
      url.pathname === "/api/admin/users" ||
      url.pathname === "/api/admin/recipients"
    ) {
      if (!["POST", "DELETE"].includes(request.method)) {
        return json({ error: "method_not_allowed" }, 405, {
          allow: "POST, DELETE",
        });
      }
      return updateAdminCollection(
        request,
        env,
        url.pathname.endsWith("/users") ? "users" : "recipients",
      );
    }
    if (url.pathname === "/api/admin/email-settings") {
      if (request.method !== "PUT") {
        return json({ error: "method_not_allowed" }, 405, { allow: "PUT" });
      }
      return updateEmailSettings(request, env);
    }
    if (url.pathname === "/api/analytics") {
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      }
      return recordAnalytics(request, env);
    }
    if (url.pathname === "/api/automation/email-recipients") {
      if (!["GET", "POST"].includes(request.method)) {
        return json({ error: "method_not_allowed" }, 405, {
          allow: "GET, POST",
        });
      }
      return automationRecipients(request, env);
    }
    if (url.pathname === "/api/team-state") {
      if (request.method === "OPTIONS") return optionsResponse(request, env);
      if (request.method === "GET") return getTeamState(request, env);
      if (request.method === "PUT") return putTeamState(request, env);
      if (request.method === "DELETE") return deleteTeamState(request, env);
      return json({ error: "method_not_allowed" }, 405, {
        allow: "GET, PUT, DELETE, OPTIONS",
      });
    }
    if (
      url.pathname === "/api/steam-search" ||
      url.pathname === "/api/steam-app" ||
      url.pathname === "/api/steam-stats" ||
      url.pathname === "/api/gamalytic-game"
    ) {
      if (request.method === "OPTIONS") {
        return optionsResponse(request, env);
      }
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405, {
          allow: "GET, OPTIONS",
        });
      }
      if (url.pathname === "/api/steam-search") return searchSteam(request, env);
      if (url.pathname === "/api/steam-stats") return getSteamStats(request, env);
      if (url.pathname === "/api/gamalytic-game") {
        return getGamalyticGame(request, env);
      }
      return getSteamApp(request, env);
    }
    if (!(await requestIsAuthorized(request, env))) {
      return new Response("Kurumsal giriş gerekli.", {
        status: 401,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      const adminUrl = new URL(request.url);
      adminUrl.pathname = "/admin-page.txt";
      const asset = await env.ASSETS.fetch(new Request(adminUrl, request));
      const headers = new Headers(asset.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store");
      headers.set("x-content-type-options", "nosniff");
      return new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
      });
    }
    return env.ASSETS.fetch(request);
  },
};
