export type AppSurface = "radar" | "analytics";

interface HeaderOptions {
  surface: AppSurface;
  centerHtml?: string;
  actionsHtml?: string;
}

interface SidebarOptions {
  surface: AppSurface;
  analyticsUrl?: string;
}

interface NavItem {
  id: string;
  icon: string;
  label: string;
  i18n: string;
}

const radarNavigation: NavItem[] = [
  { id: "events", icon: "◫", label: "Etkinlik Takvimi", i18n: "eventsTab" },
  { id: "games", icon: "▣", label: "Oyunlarım", i18n: "myGames" },
  { id: "steamworks", icon: "◉", label: "Steam Haberleri", i18n: "steamNews" },
  { id: "releases", icon: "◷", label: "Yeni Çıkan / Çıkacak", i18n: "releasesTab" },
];

const analyticsNavigation: NavItem[] = [
  { id: "home", icon: "⌂", label: "Ana Sayfa", i18n: "analyticsHome" },
  { id: "steam-analytics", icon: "◔", label: "Steam Analitiği", i18n: "steamAnalytics" },
  { id: "games", icon: "▣", label: "Oyunlar Listesi", i18n: "gamesList" },
  { id: "publishers", icon: "▰", label: "Yayıncılar Listesi", i18n: "publishersList" },
  { id: "genres-tags", icon: "◆", label: "Türler ve Etiketler", i18n: "genresTags" },
  { id: "years", icon: "▦", label: "Yıllar", i18n: "years" },
];

export function renderSteamRadarLogo(instance = "steam-radar"): string {
  return `<img class="app-brand-logo" data-steam-radar-logo data-logo-instance="${instance}" src="https://rinionn.github.io/Steam-Updates/assets/steam-radar-logo.png" width="1086" height="362" alt="" loading="eager" decoding="async">`;
}

export function renderAppHeader(options: HeaderOptions): string {
  return `<header class="app-topbar" data-app-header data-app-surface="${options.surface}">
    <a class="app-brand" href="/" aria-label="Steam Radar ana sayfası">
      ${renderSteamRadarLogo(`${options.surface}-header`)}
    </a>
    <div class="app-topbar-center">${options.centerHtml || ""}</div>
    <div class="app-topbar-actions">${options.actionsHtml || ""}</div>
  </header>`;
}

function navLabel(item: NavItem): string {
  return `<span class="app-nav-icon" aria-hidden="true">${item.icon}</span><span data-i18n="${item.i18n}">${item.label}</span>`;
}

function radarItem(item: NavItem, surface: AppSurface): string {
  if (surface === "radar") {
    const active = item.id === "events";
    return `<button class="${active ? "active" : ""}" type="button" data-app-nav-id="radar:${item.id}" data-view-tab="${item.id}" aria-pressed="${active}"${active ? ' aria-current="page"' : ""}>${navLabel(item)}</button>`;
  }
  return `<a href="/#view=${item.id}" data-app-nav-id="radar:${item.id}">${navLabel(item)}</a>`;
}

function analyticsItem(
  item: NavItem,
  surface: AppSurface,
  analyticsUrl: string,
): string {
  if (surface === "analytics") {
    const active = item.id === "home";
    return `<button class="${active ? "active" : ""}" type="button" data-app-nav-id="analytics:${item.id}" data-route="${item.id}"${active ? ' aria-current="page"' : ""}>${navLabel(item)}</button>`;
  }
  return `<a href="${analyticsUrl}#${item.id}" data-app-nav-id="analytics:${item.id}">${navLabel(item)}</a>`;
}

export function renderAppSidebar(options: SidebarOptions): string {
  const analyticsUrl = options.analyticsUrl || "/analytics";
  return `<aside class="app-sidebar" aria-label="Ana menü" data-i18n-aria-label="mainMenu" data-app-sidebar>
    <nav>
      <span class="app-sidebar-label">Steam Radar</span>
      ${radarNavigation.map((item) => radarItem(item, options.surface)).join("\n      ")}
      <span class="app-sidebar-separator" aria-hidden="true"></span>
      <span class="app-sidebar-label" data-i18n="marketAnalysis">Pazar Analizi</span>
      ${analyticsNavigation
        .map((item) => analyticsItem(item, options.surface, analyticsUrl))
        .join("\n      ")}
      <span class="app-sidebar-separator" aria-hidden="true"></span>
      <a href="/admin" data-app-nav-id="admin"><span class="app-nav-icon" aria-hidden="true">⚙</span><span data-i18n="admin">Yönetim</span></a>
    </nav>
  </aside>`;
}

export function renderAppShellStyles(): string {
  return `
    .app-topbar { position:sticky; top:0; z-index:50; display:grid; grid-template-columns:240px minmax(220px,1fr) auto; align-items:center; gap:16px; min-height:64px; padding:8px 22px; color:var(--app-header-text); background:var(--app-header-bg); box-shadow:0 2px 12px var(--app-shadow); }
    .app-brand { display:flex; min-width:0; align-items:center; color:var(--app-header-text); text-decoration:none; }
    .app-brand-logo { display:block; width:198px; max-width:100%; height:44px; flex:0 1 auto; border-radius:9px; object-fit:cover; object-position:center; }
    .app-topbar-center { min-width:0; overflow:hidden; color:var(--app-header-muted); font-size:12px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
    .app-topbar-actions { display:flex; min-width:0; align-items:center; justify-content:flex-end; gap:8px; }
    .app-topbar-actions > a,.app-topbar-actions > button { display:inline-flex; min-height:38px; align-items:center; justify-content:center; padding:7px 12px; border:0; border-radius:8px; color:var(--app-header-text); background:var(--app-gradient); text-decoration:none; font-size:11px; font-weight:850; cursor:pointer; }
    .app-topbar-actions > a:hover,.app-topbar-actions > button:hover { filter:brightness(1.12); }
    .app-layout { display:grid; grid-template-columns:240px minmax(0,1fr); min-height:calc(100vh - 64px); }
    .app-main { min-width:0; }
    .app-sidebar { position:sticky; top:64px; align-self:start; height:calc(100vh - 64px); overflow-y:auto; border-right:1px solid var(--app-line); background:var(--app-surface); }
    .app-sidebar nav { display:grid; padding:8px 0; }
    .app-sidebar-label { padding:12px 16px 7px; color:var(--app-muted); font-size:10px; font-weight:850; letter-spacing:.09em; text-transform:uppercase; }
    .app-sidebar button,.app-sidebar a { display:grid; grid-template-columns:38px minmax(0,1fr); align-items:center; width:100%; min-height:48px; padding:8px 16px; border:0; border-radius:0; color:var(--app-text); background:var(--app-transparent); text-align:left; text-decoration:none; cursor:pointer; font-size:13px; font-weight:700; }
    .app-sidebar button:hover,.app-sidebar a:hover { background:var(--app-surface-soft); }
    .app-sidebar button.active { color:var(--app-header-text); background:var(--app-gradient); }
    .app-nav-icon { color:var(--app-muted); font-size:17px; text-align:center; }
    .app-sidebar button.active .app-nav-icon { color:var(--app-header-text); }
    .app-sidebar-separator { height:1px; margin:8px 0; background:var(--app-line); }
    @media (max-width:920px) {
      .app-topbar { grid-template-columns:auto minmax(180px,1fr) auto; padding-inline:12px; }
      .app-topbar[data-app-surface="analytics"] .app-topbar-actions a { display:none; }
      .app-layout { grid-template-columns:190px minmax(0,1fr); }
      .app-sidebar button,.app-sidebar a { padding-inline:10px; }
    }
    @media (max-width:760px) {
      .app-topbar { position:relative; grid-template-columns:auto minmax(0,1fr) auto; min-height:58px; gap:8px; padding-inline:10px; }
      .app-brand-logo { width:138px; height:36px; }
      .app-topbar[data-app-surface="radar"] .app-topbar-center { display:none; }
      .app-layout { display:block; min-height:0; }
      .app-sidebar { position:sticky; top:0; z-index:40; width:100%; height:auto; overflow-x:auto; overflow-y:hidden; border-right:0; border-bottom:1px solid var(--app-line); }
      .app-sidebar nav { display:flex; width:max-content; padding:0; }
      .app-sidebar-label { display:flex; align-items:center; padding:8px 11px; white-space:nowrap; }
      .app-sidebar button,.app-sidebar a { display:flex; width:auto; min-height:48px; padding:8px 11px; white-space:nowrap; }
      .app-nav-icon { width:24px; font-size:15px; }
      .app-sidebar-separator { width:1px; height:32px; margin:8px 2px; flex:0 0 auto; }
    }`;
}
