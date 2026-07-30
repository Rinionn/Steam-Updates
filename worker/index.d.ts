export interface SteamSuggestion {
  appId: string;
  name: string;
  imageUrl: string;
  storeUrl: string;
}

export interface SteamAppDetails {
  appId: string;
  name: string;
  tags: string[];
  demoStatus: "none" | "live" | null;
  releaseStatus: "unreleased" | "early_access" | "released" | null;
  localMultiplayer: boolean | null;
  storeUrl: string;
  capsuleImageUrl: string;
  nextFestHistory: Array<{
    title: string;
    publishedAt: string;
    url: string;
  }>;
}

export interface WorkerEnvironment {
  ALLOWED_EMAIL_DOMAIN?: string;
  ALLOWED_EMAILS?: string;
  DASHBOARD_ORIGIN?: string;
  ALLOW_LOCAL_DEV?: string;
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}

export function parseSteamSuggestions(html: string): SteamSuggestion[];
export function parseSteamTags(html: string): string[];
export function parseNextFestHistory(
  appId: string,
  payload: unknown,
): SteamAppDetails["nextFestHistory"];
export function steamLibraryCapsuleUrl(
  appId: string,
  payload: unknown,
): string;

export function searchSteam(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function getSteamApp(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;

declare const worker: {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response>;
};

export default worker;
