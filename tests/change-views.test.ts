import { describe, expect, it } from "vitest";
import { renderDigest } from "../src/email.js";
import { renderAdminPage } from "../src/admin.js";
import { renderReport } from "../src/report.js";
import type { ChangeRecord, EventSnapshot } from "../src/types.js";

const snapshot: EventSnapshot = {
  generatedAt: "2026-08-03T12:00:00.000Z",
  sourceUrl: "https://partner.steamgames.com/doc/marketing/upcoming_events",
  events: [],
};

const recentChange: ChangeRecord = {
  detectedAt: "2026-08-03T08:00:00.000Z",
  eventId: "test-fest",
  eventName: "Test Fest",
  kind: "date_shifted",
  field: "startAt",
  before: "2026-08-03T17:00:00.000Z",
  after: "2026-08-04T17:00:00.000Z",
};

describe("change log views", () => {
  it("uses Steam Radar branding across report, admin, and email views", () => {
    const report = renderReport(snapshot, []);
    const admin = renderAdminPage();
    const digest = renderDigest(snapshot, []);
    const rendered = [report, admin, digest.html, digest.text].join("\n");

    expect(report).toContain("<title>Steam Radar</title>");
    expect(admin).toContain("<title>Yönetim · Steam Radar</title>");
    expect(digest.subject).toMatch(/^Steam Radar ·/);
    expect(rendered).not.toMatch(/joy\s*game\s+select/i);
  });

  it("shows recent changes in a closed 90-day report section", () => {
    const html = renderReport(snapshot, [
      recentChange,
      {
        ...recentChange,
        field: "endAt",
        before: "2026-08-10T17:00:00.000Z",
        after: "2026-08-11T17:00:00.000Z",
      },
    ]);

    expect(html).toContain("Doğrulanmış takvim değişiklikleri · Son 90 gün");
    expect(html).toContain("Test Fest");
    expect(html).toContain("Festival");
    expect(html).toContain("Değişikliğin algılandığı tarih");
    expect(html).toContain("Değişiklikten önce");
    expect(html).toContain("Değişiklikten sonra");
    expect(html).toContain("Başlangıç");
    expect(html).toContain("Bitiş");
    expect(html).toContain('class="change-cell change-before"');
    expect(html).toContain('class="change-cell change-after"');
    expect(html.match(/class="change-row"/g)).toHaveLength(1);
    expect(html).toContain('class="change-count">1');
    expect(html).toContain("grid-template-columns:minmax(0,1fr)");
    expect(html).toContain("@media (min-width: 961px)");
    expect(html).toContain("3 Ağustos 2026, 20:00");
    expect(html).toContain("4 Ağustos 2026, 20:00");
    expect(html).toMatch(/<details class="change-log">/);
    expect(html).not.toMatch(/<details class="change-log" open/);
  });

  it("does not present one-sided parser observations as real changes", () => {
    const html = renderReport(snapshot, [
      {
        ...recentChange,
        eventName: "Incomplete Deadline Fest",
        kind: "deadline_changed",
        after: undefined,
      },
    ]);

    expect(html).not.toContain("Incomplete Deadline Fest");
    expect(html).toContain("Son 90 günde doğrulanmış bir tarih değişikliği yok.");
    expect(html).toContain('class="change-count">0');
  });

  it("keeps release category filtering and game-to-event navigation functional", () => {
    const html = renderReport(snapshot, []);

    expect(html).toContain(".news-card[hidden] { display:none; }");
    expect(html).toContain("gamesOnly = Boolean(focusedGameId);");
    expect(html).toContain('setView("events");');
    expect(html).not.toContain('data-dashboard-panel="admin"');
  });

  it("renders management as a dedicated password-protected page", () => {
    const html = renderAdminPage();

    expect(html).toContain("<title>Yönetim · Steam Radar</title>");
    expect(html).toContain('class="login-stage"');
    expect(html).toContain('class="login-logo"');
    expect(html).toContain("steam-radar-logo.png");
    expect(html).toContain("Cloudflare Access korumalı");
    expect(html).toContain('data-login-form');
    expect(html).toContain('data-password');
    expect(html).toContain('fetch("/api/admin/status"');
    expect(html).toContain('request("/api/admin")');

    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    scripts.forEach((script) => {
      expect(() => new Function(script[1])).not.toThrow();
    });
  });

  it("shows the email block only when the last 24 hours contain changes", () => {
    const withChanges = renderDigest(snapshot, [recentChange]);
    const withoutChanges = renderDigest(snapshot, [
      {
        ...recentChange,
        detectedAt: "2026-08-01T08:00:00.000Z",
      },
    ]);

    expect(withChanges.html).toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(withChanges.html).toContain("DEĞİŞİKLİĞİN ALGILANDIĞI TARİH");
    expect(withChanges.html).toContain("DEĞİŞİKLİKTEN ÖNCE");
    expect(withChanges.html).toContain("DEĞİŞİKLİKTEN SONRA");
    expect(withChanges.html).toContain('class="change-email-cell"');
    expect(withChanges.html).toContain(".change-email-cell { display: block !important;");
    expect(withChanges.html).toContain("3 Ağustos 2026, 20:00");
    expect(withChanges.html).toContain("4 Ağustos 2026, 20:00");
    expect(withChanges.text).toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(withChanges.text).toContain(
      "Değişiklikten önce: Başlangıç: 3 Ağustos 2026, 20:00",
    );
    expect(withChanges.text).toContain(
      "Değişiklikten sonra: Başlangıç: 4 Ağustos 2026, 20:00",
    );
    expect(withoutChanges.html).not.toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(withoutChanges.text).not.toContain("SON 24 SAATTE DEĞİŞENLER");
  });

  it("keeps one-sided deadline observations out of the email", () => {
    const digest = renderDigest(snapshot, [
      {
        ...recentChange,
        eventName: "Recovered Deadline Fest",
        kind: "deadline_changed",
        before: undefined,
      },
    ]);

    expect(digest.html).not.toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(digest.html).not.toContain("Recovered Deadline Fest");
    expect(digest.text).not.toContain("Recovered Deadline Fest");
  });

  it("applies managed email subject placeholders", () => {
    const digest = renderDigest(
      snapshot,
      [],
      "Radar · {{kritik}} kritik · {{etkinlik}} etkinlik · {{tarih}}",
    );

    expect(digest.subject).toContain("Radar · 0 kritik · 0 etkinlik");
    expect(digest.subject).not.toContain("{{");
  });
});
