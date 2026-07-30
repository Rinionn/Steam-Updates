import { afterEach, describe, expect, it, vi } from "vitest";
import {
  default as worker,
  deleteTeamState,
  getSteamApp,
  getSteamStats,
  getTeamState,
  parseNextFestHistory,
  parseSteamSuggestions,
  parseSteamTags,
  searchSteam,
  steamLibraryCapsuleUrl,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Steam search Worker", () => {
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
      capsuleImageUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg",
      nextFestHistory: [
        expect.objectContaining({
          title: "We are joining Steam Next Fest!",
        }),
      ],
    });
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
                    final_formatted: "$29.99",
                    discount_percent: 10,
                  },
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
      positivePercent: 75,
      price: { formatted: "$29.99", discountPercent: 10 },
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
