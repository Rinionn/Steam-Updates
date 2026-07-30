export interface SteamSuggestion {
  appId: string;
  name: string;
  imageUrl: string;
  storeUrl: string;
}

export interface WorkerEnvironment {
  ALLOWED_EMAIL_DOMAIN?: string;
  DASHBOARD_ORIGIN?: string;
  ALLOW_LOCAL_DEV?: string;
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}

export function parseSteamSuggestions(html: string): SteamSuggestion[];

export function searchSteam(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response>;

declare const worker: {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response>;
};

export default worker;
