import { afterEach, describe, expect, it, vi } from "vitest";
import {
  default as worker,
  parseSteamSuggestions,
  searchSteam,
} from "../worker/index.js";

const steamHtml = `
  <a class="match" data-ds-appid="1091500" href="https://store.steampowered.com/app/1091500/Cyberpunk_2077/">
    <div class="match_name">Cyberpunk 2077</div>
    <div class="match_img"><img src="https://cdn.example/cyberpunk.jpg"></div>
  </a>
  <a class="match" data-ds-appid="2138330" href="https://store.steampowered.com/app/2138330/Phantom_Liberty/">
    <div class="match_name">Cyberpunk 2077: Phantom Liberty</div>
  </a>`;

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
});
