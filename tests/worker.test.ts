import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminSnapshot,
  adminStatus,
  default as worker,
  deleteTeamState,
  getSteamApp,
  getSteamImage,
  getSteamStats,
  getGamalyticGame,
  getGamalyticAnalytics,
  getTeamState,
  parseNextFestHistory,
  parseSteamSuggestions,
  parseSteamTags,
  searchSteam,
  steamLibraryCapsuleUrl,
  steamStoreBrowseImages,
  steamStoreBrowsePortraitImages,
  updateAdminCollection,
  putTeamState,
} from "../worker/index.js";

const steamHtml = `
  <a class="match" data-ds-appid="1091500" href="https://store.steampowered.com/app/1091500/Cyberpunk_2077/">
    <div class="match_name">Cyberpunk 2077</div>
    <div class="match_img"><img src="https://cdn.example/cyberpunk.jpg"></div>
  </a>
  <a class="match" data-ds-appid="2138330" href="https://store.steampowered.com/app/2138330/Phantom_Liberty/">
    <div class="match_name">Cyberpunk 2077: Phantom Liberty</div>
  </a>`;

const storeHtml = `
  <a class="app_tag" href="/tags/en/Cyberpunk/">Cyberpunk</a>
  <a class="app_tag" href="/tags/en/RPG/">RPG</a>
  <a class="app_tag" href="/tags/en/Cyberpunk/">Cyberpunk</a>`;

const appDetails = {
  "1091500": {
    success: true,
    data: {
      name: "Cyberpunk 2077",
      demos: [{ appid: 123 }],
      release_date: { coming_soon: false },
      genres: [{ description: "RPG" }],
      categories: [{ description: "Shared/Split Screen Co-op" }],
      developers: ["CD PROJEKT RED"],
      publishers: ["CD PROJEKT RED"],
      short_description: "An open-world action adventure.",
      supported_languages: "English, Turkish",
      price_overview: {
        currency: "TRY",
        initial: 159900,
        final: 79950,
        initial_formatted: "1.599,00 TL",
        final_formatted: "799,50 TL",
        discount_percent: 50,
      },
      header_image:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg",
    },
  },
};

const appNews = {
  appnews: {
    newsitems: [
      {
        gid: "123",
        title: "We are joining Steam Next Fest!",
        contents: "Play our demo during the festival.",
        date: 1717200000,
        url: "https://store.steampowered.com/news/app/1091500/view/123",
      },
      {
        gid: "456",
        title: "Regular update",
        contents: "Patch notes",
        date: 1717100000,
        url: "https://store.steampowered.com/news/app/1091500/view/456",
      },
    ],
  },
};

const appInfo = {
  data: {
    "1091500": {
      common: {
        library_assets_full: {
          library_capsule: {
            image2x: {
              english:
                "0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg",
            },
          },
        },
      },
    },
  },
};

const storeBrowseAssets = {
  response: {
    store_items: [
      {
        appid: 1091500,
        assets: {
          asset_url_format:
            "steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/${FILENAME}?t=1717200000",
          header_2x: "header_2x.jpg",
          header: "header.jpg",
          library_capsule_2x: "library_capsule_2x.jpg",
        },
      },
      {
        appid: 730,
        assets: {
          asset_url_format: "steam/apps/730/${FILENAME}",
          header: "header.jpg",
        },
      },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Steam search Worker", () => {
  it("Steam yatay kapak görselini güncel mağaza kaydından döndürür", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(storeBrowseAssets), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await getSteamImage(
      new Request(
        "https://steamradar.example.workers.dev/api/steam-image?appid=1091500",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      appId: "1091500",
      headerImageUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/header_2x.jpg?t=1717200000",
      images: {
        "1091500":
          "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/header_2x.jpg?t=1717200000",
      },
    });
  });

  it("Steam görsellerini tek istekte toplu çözer", () => {
    expect(
      steamStoreBrowseImages(["1091500", "730"], storeBrowseAssets),
    ).toEqual({
      "730":
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg",
      "1091500":
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/header_2x.jpg?t=1717200000",
    });
  });

  it("Oyunlarım kartları için gerçek dikey Steam kapsülünü çözer", () => {
    expect(
      steamStoreBrowsePortraitImages(["1091500"], storeBrowseAssets),
    ).toEqual({
      "1091500":
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg?t=1717200000",
    });
  });

  it("Steam görsel toplu isteğini 50 oyunla sınırlar", async () => {
    const response = await getSteamImage(
      new Request(
        `https://steamradar.example.workers.dev/api/steam-image?appids=${Array.from({ length: 51 }, (_, index) => index + 1).join(",")}`,
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_app_id" });
  });
  it("Gamalytic liste isteğini anahtarı sızdırmadan güvenli proxy eder", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          pages: 1,
          total: 1,
          result: [{ steamId: "1091500", name: "Cyberpunk 2077" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const response = await getGamalyticAnalytics(
      new Request(
        "https://steamradar.example.workers.dev/api/gamalytic/games?limit=500&title=cyber&evil=https://example.com",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        GAMALYTIC_API_KEY: "private-api-key",
      },
      "games",
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    const upstream = new URL(String(url));
    expect(upstream.origin).toBe("https://api.gamalytic.com");
    expect(upstream.pathname).toBe("/steam-games/list");
    expect(upstream.searchParams.get("limit")).toBe("100");
    expect(upstream.searchParams.get("title")).toBe("cyber");
    expect(upstream.searchParams.has("evil")).toBe(false);
    expect(new Headers(init?.headers).get("api-key")).toBe("private-api-key");
    expect(JSON.stringify(await response.json())).not.toContain("private-api-key");
  });

  it("Gamalytic anahtarı yoksa analitik proxy çağrısını reddeder", async () => {
    const response = await getGamalyticAnalytics(
      new Request(
        "https://steamradar.example.workers.dev/api/gamalytic/stats",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
      "stats",
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "gamalytic_not_configured" });
  });

  it("Gamalytic sayfalama ve sıralama parametrelerini güvenli değerlere çeker", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ pages: 0, total: 0, result: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await getGamalyticAnalytics(
      new Request(
        "https://steamradar.example.workers.dev/api/gamalytic/games?limit=abc&page=-5&sort=unknown&sort_mode=sideways",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        GAMALYTIC_API_KEY: "private-api-key",
      },
      "games",
    );

    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0];
    const upstream = new URL(String(url));
    expect(upstream.searchParams.get("limit")).toBe("50");
    expect(upstream.searchParams.get("page")).toBe("0");
    expect(upstream.searchParams.get("sort")).toBe("revenue");
    expect(upstream.searchParams.get("sort_mode")).toBe("desc");
  });
  it("Steam öneri HTML'ini güvenli sonuçlara dönüştürür", () => {
    expect(parseSteamSuggestions(steamHtml)).toEqual([
      {
        appId: "1091500",
        name: "Cyberpunk 2077",
        imageUrl: "https://cdn.example/cyberpunk.jpg",
        storeUrl:
          "https://store.steampowered.com/app/1091500/Cyberpunk_2077/",
      },
      {
        appId: "2138330",
        name: "Cyberpunk 2077: Phantom Liberty",
        imageUrl: "",
        storeUrl:
          "https://store.steampowered.com/app/2138330/Phantom_Liberty/",
      },
    ]);
  });

  it("Steam mağaza etiketlerini tekrar etmeden ayrıştırır", () => {
    expect(parseSteamTags(storeHtml)).toEqual(["Cyberpunk", "RPG"]);
  });

  it("Next Fest geçmişini yalnız kaynaklı Steam duyurularından çıkarır", () => {
    expect(parseNextFestHistory("1091500", appNews)).toEqual([
      expect.objectContaining({
        title: "We are joining Steam Next Fest!",
        url: "https://store.steampowered.com/news/app/1091500/view/123",
      }),
    ]);
  });

  it("Steam appinfo içinden gerçek dikey kapsül URL'sini üretir", () => {
    expect(steamLibraryCapsuleUrl("1091500", appInfo)).toBe(
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg",
    );
  });

  it("seçilen oyunun doğrulanabilir Steam alanlarını döndürür", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(appDetails), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(storeHtml, { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(appNews), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(appInfo), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(storeBrowseAssets), { status: 200 }),
        ),
    );
    const response = await getSteamApp(
      new Request(
        "https://steamradar.gaminginturkey.com/api/steam-app?appid=1091500",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      appId: "1091500",
      name: "Cyberpunk 2077",
      tags: ["Cyberpunk", "RPG"],
      demoStatus: "live",
      releaseStatus: "released",
      localMultiplayer: true,
      description: "An open-world action adventure.",
      developers: ["CD PROJEKT RED"],
      publishers: ["CD PROJEKT RED"],
      languages: ["English", "Turkish"],
      headerImageUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/header_2x.jpg?t=1717200000",
      steamDbUrl: "https://steamdb.info/app/1091500/",
      capsuleImageUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg?t=1717200000",
      nextFestHistory: [
        expect.objectContaining({
          title: "We are joining Steam Next Fest!",
        }),
      ],
    });
  });

  it("Gamalytic oyun detayını güvenli alanlarla ve eksikleri null bırakarak döndürür", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          steamId: 1623730,
          name: "Palworld",
          copiesSold: 12_000_000,
          tags: ["Open World", "Survival"],
          developers: ["Pocketpair"],
          history: [
            { timeStamp: 1_706_054_400_000, sales: 1_000_000 },
            { timeStamp: 1_706_140_800_000, sales: 2_000_000 },
          ],
          audienceOverlap: [
            {
              steamId: 892970,
              name: "Valheim",
              overlap: 0.42,
              copiesSold: 10_000_000,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", upstream);

    const response = await getGamalyticGame(
      new Request(
        "https://steamradar.example.workers.dev/api/gamalytic-game?appid=1623730",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        GAMALYTIC_API_KEY: "private-api-key",
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      appId: "1623730",
      name: "Palworld",
      copiesSold: 12_000_000,
      revenue: null,
      tags: ["Open World", "Survival"],
      history: [
        expect.objectContaining({ sales: 1_000_000 }),
        expect.objectContaining({ sales: 2_000_000 }),
      ],
      audienceOverlap: [
        expect.objectContaining({
          steamId: "892970",
          name: "Valheim",
          overlap: 0.42,
        }),
      ],
    });
    const upstreamRequest = upstream.mock.calls[0]?.[0];
    const upstreamUrl = new URL(String(upstreamRequest));
    expect(upstreamUrl.origin).toBe("https://api.gamalytic.com");
    expect(upstreamUrl.pathname).toBe("/game/1623730");
    expect(upstreamUrl.searchParams.get("fields")).toContain("history");
    expect(upstream.mock.calls[0]?.[1]?.headers["api-key"]).toBe(
      "private-api-key",
    );
  });

  it("ücretsiz karşılaştırma için yalnız herkese açık Steam verilerini döndürür", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              query_summary: {
                total_reviews: 200,
                total_positive: 150,
                total_negative: 50,
                review_score_desc: "Very Positive",
              },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: { player_count: 42 } }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              "1091500": {
                success: true,
                data: {
                  price_overview: {
                    currency: "USD",
                    initial: 2999,
                    final: 2699,
                    initial_formatted: "$29.99",
                    final_formatted: "$29.99",
                    discount_percent: 10,
                  },
                  genres: [{ description: "RPG" }],
                  categories: [{ description: "Single-player" }],
                },
              },
            }),
            { status: 200 },
          ),
        ),
    );
    const response = await getSteamStats(
      new Request(
        "https://steamradar.gaminginturkey.com/api/steam-stats?appid=1091500",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
    );
    expect(await response.json()).toMatchObject({
      currentPlayers: 42,
      totalReviews: 200,
      positiveReviews: 150,
      negativeReviews: 50,
      positivePercent: 75,
      negativePercent: 25,
      price: {
        currency: "USD",
        initial: 2999,
        final: 2699,
        initialFormatted: "$29.99",
        finalFormatted: "$29.99",
        discountPercent: 10,
      },
      genres: ["RPG"],
      categories: ["Single-player"],
      curatorReviews: null,
    });
  });

  it("yönetim panelini e-posta ve ayrı Worker secret şifresiyle korur", async () => {
    const headers = {
      "cf-access-authenticated-user-email":
        "batuhan.ozmen@gaminginturkey.com",
    };
    const env = {
      ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
      ADMIN_EMAILS: "batuhan.ozmen@gaminginturkey.com",
      ADMIN_PANEL_PASSWORD: "strong-admin-password",
    };
    const status = await adminStatus(
      new Request("https://steamradar.example.workers.dev/api/admin/status", {
        headers,
      }),
      env,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      admin: true,
      passwordConfigured: true,
    });

    const denied = await adminSnapshot(
      new Request("https://steamradar.example.workers.dev/api/admin", {
        headers: { ...headers, "x-admin-password": "wrong" },
      }),
      env,
    );
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({
      error: "admin_password_required",
    });
  });

  it("yalnız gaminginturkey.com Access kullanıcısına arama yaptırır", async () => {
    const unauthorized = await searchSteam(
      new Request("https://steamradar.gaminginturkey.com/api/steam-search?q=cyber"),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
    );
    expect(unauthorized.status).toBe(401);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(steamHtml, { status: 200 })),
    );
    const authorized = await searchSteam(
      new Request(
        "https://steamradar.gaminginturkey.com/api/steam-search?q=cyber",
        {
          headers: {
            "cf-access-authenticated-user-email":
              "editor@gaminginturkey.com",
          },
        },
      ),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        DASHBOARD_ORIGIN: "https://steamradar.gaminginturkey.com",
      },
    );
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({
      results: expect.arrayContaining([
        expect.objectContaining({
          appId: "1091500",
          name: "Cyberpunk 2077",
        }),
      ]),
    });
  });

  it("Access başlığı olmadan statik paneli de kapalı tutar", async () => {
    const response = await worker.fetch(
      new Request("https://steamradar.example.workers.dev/"),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        ASSETS: {
          fetch: vi.fn(async () => new Response("panel")),
        },
      },
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("Kurumsal giriş gerekli");
  });

  it("/admin yolunu ayrı yönetim dosyasına yönlendirir", async () => {
    const fetch = vi.fn(async (request: Request) => {
      return new Response(new URL(request.url).pathname);
    });
    const response = await worker.fetch(
      new Request("https://steamradar.example.workers.dev/admin", {
        headers: {
          "cf-access-authenticated-user-email":
            "batuhan.ozmen@gaminginturkey.com",
        },
      }),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        ADMIN_EMAILS: "batuhan.ozmen@gaminginturkey.com",
        ASSETS: { fetch },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("/admin-page.txt");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("/analytics yolunu ayrı pazar analizi dosyasından HTML olarak sunar", async () => {
    const fetch = vi.fn(async (request: Request) => {
      return new Response(new URL(request.url).pathname);
    });
    const response = await worker.fetch(
      new Request("https://steamradar.example.workers.dev/analytics", {
        headers: {
          "cf-access-authenticated-user-email":
            "editor@gaminginturkey.com",
        },
      }),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        ASSETS: { fetch },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("/analytics-page.txt");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("yönetim erişim kaydının statik kural kapsamını doğru bildirir", async () => {
    const statement = {
      bind: vi.fn(),
      run: vi.fn(async () => ({ success: true })),
    };
    statement.bind.mockReturnValue(statement);
    const env = {
      ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
      ADMIN_EMAILS: "batuhan.ozmen@gaminginturkey.com",
      ADMIN_PANEL_PASSWORD: "strong-admin-password",
      DB: { prepare: vi.fn(() => statement) },
    };
    const request = (email: string) =>
      new Request("https://steamradar.example.workers.dev/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-access-authenticated-user-email":
            "batuhan.ozmen@gaminginturkey.com",
          "x-admin-password": "strong-admin-password",
        },
        body: JSON.stringify({ email }),
      });

    const internal = await updateAdminCollection(
      request("editor@gaminginturkey.com"),
      env,
      "users",
    );
    await expect(internal.json()).resolves.toMatchObject({
      coveredByStaticRule: true,
      requiresCloudflareAccess: false,
    });

    const external = await updateAdminCollection(
      request("editor@gmail.com"),
      env,
      "users",
    );
    await expect(external.json()).resolves.toMatchObject({
      coveredByStaticRule: false,
      requiresCloudflareAccess: true,
    });
  });

  it("/game/:appid iç oyun sayfasını aynı korumalı analiz kabuğunda sunar", async () => {
    const fetch = vi.fn(async (request: Request) => {
      return new Response(new URL(request.url).pathname);
    });
    const response = await worker.fetch(
      new Request("https://steamradar.example.workers.dev/game/1623730", {
        headers: {
          "cf-access-authenticated-user-email":
            "editor@gaminginturkey.com",
        },
      }),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        ASSETS: { fetch },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("/analytics-page.txt");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("yalnız açıkça izin verilen Gmail adresini kabul eder", async () => {
    const assets = {
      fetch: vi.fn(async () => new Response("panel")),
    };
    const allowed = await worker.fetch(
      new Request("https://steamradar.example.workers.dev/", {
        headers: {
          "cf-access-authenticated-user-email": "pinargulerrrr@gmail.com",
        },
      }),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        ALLOWED_EMAILS: "pinargulerrrr@gmail.com",
        ASSETS: assets,
      },
    );
    const denied = await worker.fetch(
      new Request("https://steamradar.example.workers.dev/", {
        headers: {
          "cf-access-authenticated-user-email": "another@gmail.com",
        },
      }),
      {
        ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com",
        ALLOWED_EMAILS: "pinargulerrrr@gmail.com",
        ASSETS: assets,
      },
    );
    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(401);
  });

  it("D1 bağlı değilken ekip durumunu güvenli yerel modda bildirir", async () => {
    const response = await getTeamState(
      new Request("https://steamradar.example.workers.dev/api/team-state", {
        headers: {
          "cf-access-authenticated-user-email": "editor@gaminginturkey.com",
        },
      }),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, records: [] });
  });

  it("ekip durumunu D1 üzerinde kaydeder, listeler ve siler", async () => {
    const rows = new Map<string, Record<string, string>>();
    const DB = {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async all() {
                return { results: [...rows.values()] };
              },
              async run() {
                if (query.startsWith("INSERT")) {
                  const [stateKey, stateType, payload, updatedBy, updatedAt] =
                    values.map(String);
                  rows.set(stateKey, {
                    state_key: stateKey,
                    state_type: stateType,
                    payload,
                    updated_by: updatedBy,
                    updated_at: updatedAt,
                  });
                } else if (query.startsWith("DELETE")) {
                  rows.delete(String(values[0]));
                }
                return {};
              },
            };
          },
        };
      },
    };
    const headers = {
      "cf-access-authenticated-user-email": "editor@gaminginturkey.com",
      "content-type": "application/json",
    };
    const put = await putTeamState(
      new Request("https://steamradar.example.workers.dev/api/team-state", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          key: "task:festival-demo",
          type: "task",
          payload: { completed: true },
        }),
      }),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com", DB },
    );
    expect(put.status).toBe(200);

    const list = await getTeamState(
      new Request("https://steamradar.example.workers.dev/api/team-state", {
        headers,
      }),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com", DB },
    );
    expect(await list.json()).toMatchObject({
      enabled: true,
      user: "editor@gaminginturkey.com",
      records: [
        {
          key: "task:festival-demo",
          type: "task",
          payload: { completed: true },
        },
      ],
    });

    const remove = await deleteTeamState(
      new Request(
        "https://steamradar.example.workers.dev/api/team-state?key=task%3Afestival-demo",
        { method: "DELETE", headers },
      ),
      { ALLOWED_EMAIL_DOMAIN: "gaminginturkey.com", DB },
    );
    expect(remove.status).toBe(200);
    expect(rows.size).toBe(0);
  });
});
