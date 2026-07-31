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

export interface SteamPublicStats {
  appId: string;
  currentPlayers: number;
  totalReviews: number;
  positiveReviews: number;
  negativeReviews: number;
  positivePercent: number;
  negativePercent: number;
  reviewScore: string;
  price: {
    currency: string;
    initial: number;
    final: number;
    initialFormatted: string;
    finalFormatted: string;
    discountPercent: number;
  } | null;
  genres: string[];
  categories: string[];
  curatorReviews: null;
  capturedAt: string;
}

export interface WorkerEnvironment {
  ALLOWED_EMAIL_DOMAIN?: string;
  ALLOWED_EMAILS?: string;
  ADMIN_EMAILS?: string;
  ADMIN_PANEL_PASSWORD?: string;
  GAMALYTIC_API_KEY?: string;
  EMAIL_AUTOMATION_SECRET?: string;
  DASHBOARD_ORIGIN?: string;
  ALLOW_LOCAL_DEV?: string;
  DB?: {
    prepare(query: string): {
      first?(): Promise<Record<string, unknown> | null>;
      bind(...values: unknown[]): {
        all(): Promise<{ results?: unknown[] }>;
        first?(): Promise<Record<string, unknown> | null>;
        run(): Promise<unknown>;
      };
    };
  };
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}

export interface TeamStateRecord {
  key: string;
  type: "game" | "task" | "application" | "preference";
  payload: Record<string, unknown>;
  updatedBy: string;
  updatedAt: string;
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
export function getSteamStats(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function getGamalyticAnalytics(
  request: Request,
  env: WorkerEnvironment,
  resource: "games" | "stats" | "groups" | "publishers",
): Promise<Response>;
export function getTeamState(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function putTeamState(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function deleteTeamState(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function adminStatus(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function adminSnapshot(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;
export function updateEmailSettings(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;

declare const worker: {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response>;
};

export default worker;
