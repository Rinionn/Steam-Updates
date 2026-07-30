import { describe, expect, it } from "vitest";
import { matchTagsForEvent } from "../src/match-tags.js";

describe("event match tags", () => {
  it("returns only the curated tags for a known themed festival", () => {
    expect(
      matchTagsForEvent({
        id: "cyberpunk-fest-51562f576",
        kind: "themed_fest",
      }),
    ).toEqual(["Cyberpunk", "Sci-fi"]);
  });

  it("does not guess tags for unknown or non-themed events", () => {
    expect(
      matchTagsForEvent({ id: "unknown-fest", kind: "themed_fest" }),
    ).toEqual([]);
    expect(
      matchTagsForEvent({
        id: "steam-next-fest",
        kind: "next_fest",
      }),
    ).toEqual([]);
  });
});
