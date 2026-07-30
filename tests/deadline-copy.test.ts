import { describe, expect, it } from "vitest";
import { deadlineCopy } from "../src/deadline-copy.js";
import type { SteamDeadline } from "../src/types.js";

function deadline(
  label: string,
  kind: SteamDeadline["kind"],
): SteamDeadline {
  return {
    id: "test",
    kind,
    label,
    dueAt: "2026-09-01T06:59:00Z",
    sourceUrl: "https://partner.steamgames.com/doc/example",
  };
}

describe("deadline copy", () => {
  it("kayıt tarihini açık Türkçe eyleme dönüştürür", () => {
    const copy = deadlineCopy(
      deadline("August 31 - Registration Deadline", "registration"),
    );
    expect(copy.category).toBe("Başvuru");
    expect(copy.title).toMatch(/kayıt için son gün/i);
  });

  it("demo ve mağaza incelemesini ayrı gösterir", () => {
    const copy = deadlineCopy(
      deadline(
        "September 21 - Submit your demo build and store page for review.",
        "review",
      ),
    );
    expect(copy.category).toBe("Demo & Mağaza");
    expect(copy.title).toMatch(/incelemeye gönder/i);
  });

  it("fragman tarihini tanıtım grubuna koyar", () => {
    const copy = deadlineCopy(
      deadline(
        "September 7 - Steam pulls trailers for the official Next Fest trailer.",
        "marketing",
      ),
    );
    expect(copy.category).toBe("Tanıtım");
  });
});
