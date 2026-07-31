import { describe, expect, it } from "vitest";
import { renderAnalyticsPage } from "../src/analytics.js";
import { renderReport } from "../src/report.js";

describe("market analytics page", () => {
  it("renders the six requested sections in an accessible side navigation", () => {
    const html = renderAnalyticsPage();

    expect(html).toContain('aria-label="Pazar analizi menüsü"');
    expect(html).toContain('data-route="home"');
    expect(html).toContain('data-route="steam-analytics"');
    expect(html).toContain('data-route="games"');
    expect(html).toContain('data-route="publishers"');
    expect(html).toContain('data-route="genres-tags"');
    expect(html).toContain('data-route="years"');
    expect(html).toContain("/api/gamalytic/");
    expect(html).toContain("Gamalytic API · tahmini veri");
    expect(html).toContain("/^\\d{4}$/");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('setAttribute("aria-current","page")');
    expect(html).toContain('aria-label="Steam oyunlarında ara"');
    expect(html).toContain('data-filter-form="analytics"');
    expect(html).toContain('data-filter-form="games"');
    expect(html).toContain('data-filter-form="groups"');
    expect(html).toContain('data-filter-form="years"');
    expect(html).toContain("İş Modeli");
    expect(html).toContain("Oyun Özellikleri");
    expect(html).toContain("Çıkış ve Performans");
    expect(html).toContain("Yayıncı Özeti");
    expect(html).toContain("/api/steam-image?appids=");
    expect(html).toContain("payload.images");
  });

  it("links the primary dashboard to the dedicated analytics route", () => {
    const html = renderReport({
      generatedAt: "2026-07-31T06:00:00.000Z",
      sourceUrl: "https://example.com",
      events: [],
    });

    expect(html).toContain("/analytics");
    expect(html).toContain("Pazar Analizi");
  });

  it("embeds syntactically valid client-side JavaScript", () => {
    const html = renderAnalyticsPage();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => new Function(script[1])).not.toThrow();
    }
  });
});
