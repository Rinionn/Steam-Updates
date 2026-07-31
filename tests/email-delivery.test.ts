import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { resolvedEmailDelivery } from "../src/email.js";

const originalEmailConfig = { ...config.email };

function d1Response(results: Record<string, unknown>[]): Response {
  return new Response(
    JSON.stringify({
      success: true,
      result: [{ success: true, results }],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

afterEach(() => {
  Object.assign(config.email, originalEmailConfig);
  vi.unstubAllGlobals();
});

describe("managed email delivery", () => {
  it("reads panel recipients and settings directly from Cloudflare D1", async () => {
    Object.assign(config.email, {
      d1AccountId: "account-id",
      d1ApiToken: "api-token",
      d1DatabaseId: "database-id",
      recipientApiUrl: undefined,
      recipientApiSecret: undefined,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as { sql?: string };
        if (body.sql?.includes("email_delivery_recipients")) {
          return d1Response([
            {
              email: "team@example.com",
              recipientType: "to",
            },
            {
              email: "audit@example.com",
              recipientType: "bcc",
            },
          ]);
        }
        return d1Response([
          {
            enabled: 1,
            sendTime: "10:30",
            timezone: "Europe/Istanbul",
            senderName: "Steam Radar Ekibi",
            subjectTemplate: "Radar · {{etkinlik}}",
            lastSentDate: "2026-07-30",
          },
        ]);
      }),
    );

    await expect(resolvedEmailDelivery()).resolves.toMatchObject({
      to: ["team@example.com"],
      bcc: ["audit@example.com"],
      enabled: true,
      sendTime: "10:30",
      senderName: "Steam Radar Ekibi",
      subjectTemplate: "Radar · {{etkinlik}}",
      lastSentDate: "2026-07-30",
      managed: true,
    });
  });

  it("preserves an intentionally empty To list instead of restoring static recipients", async () => {
    Object.assign(config.email, {
      to: "fallback@example.com",
      d1AccountId: "account-id",
      d1ApiToken: "api-token",
      d1DatabaseId: "database-id",
      recipientApiUrl: undefined,
      recipientApiSecret: undefined,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as { sql?: string };
        return body.sql?.includes("email_delivery_recipients")
          ? d1Response([])
          : d1Response([
              {
                enabled: 1,
                sendTime: "09:30",
                timezone: "Europe/Istanbul",
              },
            ]);
      }),
    );

    const delivery = await resolvedEmailDelivery();
    expect(delivery.to).toEqual([]);
    expect(delivery.managed).toBe(true);
  });

  it("fails closed when managed D1 settings cannot be read", async () => {
    Object.assign(config.email, {
      d1AccountId: "account-id",
      d1ApiToken: "api-token",
      d1DatabaseId: "database-id",
      recipientApiUrl: undefined,
      recipientApiSecret: undefined,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false }), { status: 401 }),
      ),
    );

    await expect(resolvedEmailDelivery()).rejects.toThrow(
      "Cloudflare D1 e-posta ayarları okunamadı",
    );
  });

  it("fails closed when Cloudflare returns no query result envelope", async () => {
    Object.assign(config.email, {
      d1AccountId: "account-id",
      d1ApiToken: "api-token",
      d1DatabaseId: "database-id",
      recipientApiUrl: undefined,
      recipientApiSecret: undefined,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
        }),
      ),
    );

    await expect(resolvedEmailDelivery()).rejects.toThrow(
      "Cloudflare D1 e-posta ayarları okunamadı",
    );
  });

  it("fails closed when the managed delivery settings row is missing", async () => {
    Object.assign(config.email, {
      d1AccountId: "account-id",
      d1ApiToken: "api-token",
      d1DatabaseId: "database-id",
      recipientApiUrl: undefined,
      recipientApiSecret: undefined,
    });
    vi.stubGlobal("fetch", vi.fn(async () => d1Response([])));

    await expect(resolvedEmailDelivery()).rejects.toThrow(
      "Cloudflare D1 e-posta gönderim ayarı bulunamadı",
    );
  });
});
