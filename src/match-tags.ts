import type { SteamEvent } from "./types.js";

// Steam does not expose personal festival eligibility through a documented API.
// Keep this list intentionally conservative: unknown events must not be guessed.
export const eventMatchTags: Record<string, string[]> = {
  "social-deduction-fest-803b5a882": ["Social Deduction"],
  "train-fest-a5c61577c": ["Trains"],
  "cyberpunk-fest-51562f576": ["Cyberpunk", "Sci-fi"],
  "pins-pegs-fest-2624f7168": ["Pinball", "Bowling"],
  "pve-survival-crafting-fest-8bb6de2ec": [
    "Survival",
    "Crafting",
    "Open World Survival Craft",
  ],
  "programming-fest-d92cade24": ["Programming", "Logic"],
  "party-based-rpg-fest-55771f151": ["Party-Based RPG", "RPG"],
  "cooking-fest-424f50fb9": ["Cooking"],
  "steam-scream-v-4b0a8f227": ["Horror"],
  "auto-battler-rpg-fest-92a2e84b8": ["Auto Battler", "RPG"],
  "desktop-companion-fest-5bc08adee": ["Desktop Companion"],
  "shop-keeper-fest-0d64f4666": ["Shop Keeper", "Management"],
  "sheep-fest-6ec302116": ["Animals"],
  "couch-co-op-fest-8b489c8ca": [
    "Local Co-Op",
    "Shared/Split Screen",
  ],
  "rhythm-fest-b3b4ca682": ["Rhythm", "Music"],
  "dinos-vs-robots-fest-e4c058c85": ["Dinosaurs", "Robots"],
  "racing-fest-9bb5cb332": ["Racing"],
  "witch-fest-34647039a": ["Magic"],
  "fighting-fest-997e98a30": ["Fighting"],
  "real-time-strategy-fest-96b41f8e6": ["Real-Time Strategy", "Strategy"],
  "mountaineering-fest-e94606dd4": ["Climbing"],
};

export function matchTagsForEvent(
  event: Pick<SteamEvent, "id" | "kind">,
): string[] {
  if (event.kind !== "themed_fest") return [];
  return [...(eventMatchTags[event.id] || [])];
}
