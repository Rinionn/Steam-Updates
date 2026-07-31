import {
  renderAppHeader,
  renderAppShellStyles,
  renderAppSidebar,
} from "./app-shell.js";

export function renderAnalyticsPage(): string {
  const appHeader = renderAppHeader({
    surface: "analytics",
    centerHtml:
      '<form class="global-search" data-global-search role="search"><span aria-hidden="true">⌕</span><input type="search" name="query" aria-label="Steam oyunlarında ara" placeholder="Steam oyunlarında ara"></form>',
    actionsHtml:
      '<a href="/">Etkinlik Takvimi</a><a href="/admin">Yönetim</a><button class="theme-toggle" type="button" data-theme-toggle aria-label="Temayı değiştir">◐</button>',
  });
  const appSidebar = renderAppSidebar({ surface: "analytics" });
  return `<!doctype html>
<html lang="tr" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex,nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&amp;display=swap" rel="stylesheet">
  <title>Steam Pazar Analizi</title>
  <style>
    :root {
      --topbar:#14091f;
      --topbar-control:#2a1738;
      --topbar-text:#fffafc;
      --topbar-muted:#c8bdd4;
      --bg:#f7f3fa;
      --surface:#ffffff;
      --surface-soft:#fbf8fc;
      --sidebar:#ffffff;
      --active:#fae8f4;
      --active-text:#871e82;
      --text:#281a32;
      --muted:#6d6076;
      --line:#ded5e4;
      --line-soft:#eee7f1;
      --link:#71218f;
      --primary:#ff3e96;
      --primary-hover:#d52bb6;
      --brand-start:#6f1688;
      --brand-end:#a51656;
      --gradient-brand:linear-gradient(90deg,var(--brand-start),var(--brand-end));
      --success:#2f9a71;
      --warning:#f6b94a;
      --danger:#ad124c;
      --shadow:rgba(37,12,55,.16);
      --transparent:transparent;
      --glow-purple:rgba(176,43,242,.12);
      --glow-pink:rgba(255,62,150,.08);
      --chart-1:#6f1688;
      --chart-2:#b02bf2;
      --chart-3:#d631ce;
      --chart-4:#ff3e96;
      --chart-5:#f6b94a;
      --placeholder:linear-gradient(135deg,#eadff0,#fbf8fc);
      --app-header-bg:var(--topbar);
      --app-header-text:var(--topbar-text);
      --app-header-muted:var(--topbar-muted);
      --app-surface:var(--sidebar);
      --app-surface-soft:var(--surface-soft);
      --app-text:var(--text);
      --app-muted:var(--muted);
      --app-line:var(--line);
      --app-gradient:var(--gradient-brand);
      --app-shadow:var(--shadow);
      --app-transparent:var(--transparent);
      --app-brand-start:var(--brand-start);
      --app-brand-end:var(--brand-end);
      --app-brand-target:var(--warning);
      --app-logo-ink:var(--topbar-text);
    }
    html[data-theme="dark"] {
      --bg:#090512;
      --surface:#130a1f;
      --surface-soft:#1a1026;
      --sidebar:#100719;
      --active:#32142e;
      --active-text:#ff82bc;
      --text:#ffffff;
      --muted:#aaa0b9;
      --line:#3c2a49;
      --line-soft:#2b1c36;
      --link:#dc9aff;
      --shadow:rgba(0,0,0,.42);
      --glow-purple:rgba(176,43,242,.24);
      --glow-pink:rgba(255,62,150,.16);
      --placeholder:linear-gradient(135deg,#2c1b38,#1a1026);
    }
    ${renderAppShellStyles()}
    * { box-sizing:border-box; }
    html { min-width:320px; background:var(--bg); color:var(--text); font-family:Montserrat,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    body { margin:0; background:radial-gradient(circle at 12% 3%,var(--glow-purple),var(--transparent) 34rem),radial-gradient(circle at 88% 18%,var(--glow-pink),var(--transparent) 30rem),var(--bg); }
    button,input,select { font:inherit; }
    button,a,input,select,summary { -webkit-tap-highlight-color:var(--transparent); }
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible { outline:3px solid var(--primary); outline-offset:2px; }
    [hidden] { display:none !important; }
    .topbar { position:sticky; top:0; z-index:40; display:grid; grid-template-columns:215px minmax(220px,320px) 1fr; align-items:center; gap:16px; min-height:64px; padding:8px 22px; color:var(--topbar-text); background:var(--topbar); box-shadow:0 2px 8px var(--shadow); }
    .brand { display:flex; align-items:center; gap:10px; color:var(--topbar-text); text-decoration:none; font-size:21px; font-weight:800; }
    .brand-mark { display:grid; width:40px; height:40px; place-items:center; border-radius:50%; color:var(--topbar-text); background:var(--gradient-brand); font-size:17px; }
    .global-search { position:relative; min-width:0; }
    .global-search span { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--topbar-text); }
    .global-search input { width:100%; min-height:40px; padding:8px 12px 8px 36px; border:0; border-radius:3px; color:var(--topbar-text); background:var(--topbar-control); }
    .global-search input::placeholder { color:var(--topbar-text); opacity:.72; }
    .top-actions { display:flex; justify-content:flex-end; gap:8px; min-width:0; }
    .top-actions a,.theme-toggle { display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:7px 12px; border:0; border-radius:3px; color:var(--topbar-text); background:var(--gradient-brand); text-decoration:none; font-size:12px; font-weight:700; cursor:pointer; }
    .top-actions a:hover,.theme-toggle:hover { filter:brightness(1.12); }
    .theme-toggle { width:38px; padding:0; background:var(--topbar-control); }
    .app-shell { display:grid; grid-template-columns:240px minmax(0,1fr); min-height:calc(100vh - 64px); }
    .sidebar { position:sticky; top:64px; align-self:start; height:calc(100vh - 64px); overflow-y:auto; border-right:1px solid var(--line); background:var(--sidebar); }
    .sidebar nav { display:grid; padding-top:8px; }
    .sidebar-label { padding:12px 16px 7px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; }
    .sidebar button,.sidebar a { display:grid; grid-template-columns:38px minmax(0,1fr); align-items:center; width:100%; min-height:48px; padding:8px 16px; border:0; color:var(--text); background:var(--transparent); text-align:left; text-decoration:none; cursor:pointer; font-size:14px; }
    .sidebar button:hover,.sidebar a:hover { background:var(--surface-soft); }
    .sidebar button.active { color:var(--topbar-text); background:var(--gradient-brand); font-weight:700; }
    .nav-icon { color:var(--muted); font-size:18px; text-align:center; }
    .sidebar button.active .nav-icon { color:var(--topbar-text); }
    .sidebar-separator { height:1px; margin:8px 0; background:var(--line); }
    .main { min-width:0; padding:27px 24px 60px; }
    .page-intro { margin:0 0 12px; }
    .page-intro h1 { margin:0; font-size:clamp(34px,5vw,49px); font-weight:400; letter-spacing:-.025em; }
    .page-intro p { max-width:880px; margin:18px 0 0; color:var(--muted); font-size:18px; line-height:1.5; }
    .view { min-width:0; }
    .analysis-grid { display:grid; grid-template-columns:230px minmax(0,1fr); align-items:start; gap:14px; margin-top:8px; }
    .stack { display:grid; min-width:0; gap:14px; }
    .card,.filter-card { min-width:0; border:1px solid var(--line-soft); border-radius:3px; background:var(--surface); box-shadow:0 1px 3px var(--shadow); }
    .card { padding:15px; }
    .filter-card { position:sticky; top:78px; padding:15px; }
    .card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:34px; margin-bottom:12px; }
    .card-head h2,.card-head h3,.filter-card h2 { margin:0; font-weight:400; }
    .card-head h2,.filter-card h2 { font-size:21px; }
    .card-head h3 { font-size:18px; }
    .card-head p { margin:4px 0 0; color:var(--muted); font-size:12px; }
    .source-note { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; }
    .source-note::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--success); }
    .filter-form { display:grid; gap:16px; margin-top:13px; }
    .filter-group { display:grid; gap:10px; padding-top:12px; border-top:1px solid var(--line-soft); }
    .filter-group:first-of-type { padding-top:0; border-top:0; }
    .filter-group h3 { margin:0 0 2px; font-size:15px; font-weight:600; }
    .filter-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .field { display:grid; min-width:0; gap:4px; color:var(--muted); font-size:11px; }
    .field input,.field select { width:100%; min-width:0; min-height:34px; padding:6px 3px; border:0; border-bottom:1px dotted var(--muted); border-radius:0; color:var(--text); background:var(--transparent); }
    .field input:disabled,.field select:disabled { cursor:not-allowed; opacity:.5; }
    .form-actions { display:grid; gap:8px; }
    .primary,.secondary { min-height:38px; padding:8px 12px; border:0; border-radius:3px; cursor:pointer; font-size:12px; font-weight:700; text-transform:uppercase; }
    .primary { color:var(--topbar-text); background:var(--gradient-brand); }
    .secondary { color:var(--text); background:var(--surface-soft); box-shadow:inset 0 0 0 1px var(--line); }
    .summary-card { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 24px; }
    .summary-card h2 { grid-column:1 / -1; margin:0 0 5px; font-size:20px; font-weight:400; }
    .summary-row { color:var(--text); font-size:14px; line-height:1.45; }
    .summary-row strong { font-weight:700; }
    .summary-link { grid-column:1 / -1; width:max-content; color:var(--link); border:0; background:var(--transparent); cursor:pointer; padding:2px 0; font-size:14px; }
    .charts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .chart-card { min-height:255px; }
    .chart-body { display:grid; grid-template-columns:minmax(120px,1fr) minmax(120px,1fr); align-items:center; gap:12px; min-height:190px; }
    .donut { width:min(170px,100%); aspect-ratio:1; margin:auto; border-radius:50%; background:var(--surface-soft); box-shadow:inset 0 0 0 28px var(--surface); }
    .legend { display:grid; gap:7px; }
    .legend-row { display:grid; grid-template-columns:10px minmax(0,1fr) auto; align-items:center; gap:6px; color:var(--muted); font-size:11px; }
    .legend-color { width:9px; height:9px; background:var(--chart-color); }
    .table-wrap { width:100%; overflow:auto; border:1px solid var(--line); background:var(--surface); scrollbar-color:var(--primary) var(--surface-soft); }
    table { width:100%; min-width:900px; border-collapse:collapse; }
    th,td { padding:10px; border-bottom:1px solid var(--line); color:var(--text); text-align:left; vertical-align:middle; font-size:12px; white-space:nowrap; }
    th { position:sticky; top:0; z-index:2; color:var(--muted); background:var(--surface); font-weight:500; }
    tbody tr:nth-child(even) { background:var(--surface-soft); }
    tbody tr:hover { background:var(--active); }
    tbody tr:last-child td { border-bottom:0; }
    .rank { width:42px; text-align:center; }
    .game-cell { display:grid; grid-template-columns:96px minmax(150px,1fr); align-items:center; gap:9px; }
    .game-artwork { position:relative; display:grid; width:96px; aspect-ratio:460/215; place-items:center; overflow:hidden; border-radius:2px; color:var(--muted); background:var(--placeholder); font-size:10px; font-weight:800; }
    .game-artwork img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .game-copy a { color:var(--link); font-size:13px; text-decoration:underline; text-underline-offset:2px; }
    .game-copy small { display:block; margin-top:4px; color:var(--muted); font-size:10px; }
    .data-tools { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
    .column-picker { position:relative; }
    .column-picker summary { display:inline-flex; align-items:center; min-height:34px; padding:6px 9px; color:var(--link); cursor:pointer; font-size:11px; font-weight:700; text-transform:uppercase; list-style:none; }
    .column-picker summary::-webkit-details-marker { display:none; }
    .column-menu { position:absolute; top:100%; left:0; z-index:10; display:grid; width:220px; max-height:310px; padding:10px; overflow:auto; border:1px solid var(--line); background:var(--surface); box-shadow:0 5px 18px var(--shadow); }
    .column-menu label { display:flex; align-items:center; gap:8px; min-height:32px; color:var(--text); font-size:12px; }
    .pagination { display:flex; align-items:center; justify-content:center; gap:8px; margin-top:12px; }
    .pagination button { min-width:38px; min-height:34px; border:1px solid var(--line); color:var(--text); background:var(--surface); cursor:pointer; }
    .pagination button:disabled { cursor:not-allowed; opacity:.45; }
    .pagination span { color:var(--muted); font-size:12px; }
    .status { min-height:18px; margin-top:8px; color:var(--muted); font-size:12px; }
    .status.error,.empty.error { color:var(--danger); }
    .empty { display:grid; min-height:120px; place-items:center; padding:20px; color:var(--muted); text-align:center; }
    .loading { position:relative; overflow:hidden; }
    .loading::after { content:""; position:absolute; inset:0; background:linear-gradient(100deg,var(--transparent),var(--active),var(--transparent)); animation:loading 1.15s infinite; }
    .group-toggle { display:flex; gap:6px; }
    .group-toggle button { min-height:34px; border:1px solid var(--line); color:var(--text); background:var(--surface); cursor:pointer; }
    .group-toggle button.active { color:var(--topbar-text); border-color:var(--primary); background:var(--gradient-brand); }
    .game-detail-layout { display:grid; grid-template-columns:minmax(0,1.08fr) minmax(320px,.92fr); gap:14px; }
    .game-detail-layout > .card { min-height:100%; }
    .game-header-frame { position:relative; display:grid; min-height:260px; place-items:center; overflow:hidden; border:1px solid var(--line); border-radius:3px; color:var(--muted); background:var(--placeholder); font-size:13px; font-weight:800; letter-spacing:.08em; }
    .game-header-frame img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .overview-list { display:grid; margin:0; }
    .overview-row { display:grid; grid-template-columns:135px minmax(0,1fr); gap:12px; padding:9px 0; border-bottom:1px solid var(--line-soft); }
    .overview-row:last-child { border-bottom:0; }
    .overview-row dt { color:var(--muted); font-size:11px; }
    .overview-row dd { min-width:0; margin:0; color:var(--text); font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
    .detail-description { margin:12px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }
    .detail-actions,.detail-tabs { display:flex; flex-wrap:wrap; gap:7px; margin-top:13px; }
    .detail-actions a,.detail-tabs button { display:inline-flex; min-height:36px; align-items:center; justify-content:center; padding:7px 11px; border:1px solid var(--line); border-radius:3px; color:var(--link); background:var(--surface); text-decoration:none; font-size:11px; font-weight:750; }
    .detail-tabs button { color:var(--text); cursor:default; }
    .detail-tabs button:first-child { color:var(--topbar-text); border-color:var(--primary); background:var(--gradient-brand); }
    .detail-tag-list { display:flex; flex-wrap:wrap; gap:5px; }
    .detail-tag { display:inline-flex; padding:4px 7px; border:1px solid var(--line-soft); border-radius:999px; color:var(--muted); background:var(--surface-soft); font-size:10px; }
    .detail-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    .detail-metric { min-width:0; padding:13px; border:1px solid var(--line-soft); background:var(--surface-soft); }
    .detail-metric span { display:block; min-height:28px; color:var(--muted); font-size:10px; line-height:1.35; }
    .detail-metric strong { display:block; margin-top:4px; color:var(--text); font-size:18px; font-weight:650; overflow-wrap:anywhere; }
    .detail-metric small { display:block; margin-top:4px; color:var(--muted); font-size:9px; }
    .detail-note { margin:12px 0 0; color:var(--muted); font-size:10px; line-height:1.5; }
    .detail-two-column { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .history-chart { width:100%; min-height:210px; overflow:hidden; border:1px solid var(--line-soft); background:var(--surface-soft); }
    .history-chart svg { display:block; width:100%; min-height:210px; }
    .history-chart .axis { stroke:var(--line); stroke-width:1; }
    .history-chart .series { fill:none; stroke:var(--primary); stroke-width:3; vector-effect:non-scaling-stroke; }
    .history-chart .area { fill:var(--glow-pink); }
    .mini-bars { display:grid; gap:8px; }
    .mini-bar { display:grid; grid-template-columns:minmax(90px,1fr) 2fr auto; align-items:center; gap:8px; color:var(--muted); font-size:10px; }
    .mini-bar-track { height:8px; overflow:hidden; border-radius:999px; background:var(--line-soft); }
    .mini-bar-fill { display:block; height:100%; border-radius:inherit; background:var(--gradient-brand); }
    .detail-back { display:inline-flex; width:max-content; margin-bottom:2px; color:var(--link); text-decoration:none; font-size:12px; font-weight:700; }
    @keyframes loading { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
    @media (max-width:920px) {
      .topbar { grid-template-columns:auto minmax(180px,1fr) auto; padding-inline:12px; }
      .brand { font-size:16px; }
      .brand-mark { width:34px; height:34px; }
      .top-actions a { display:none; }
      .app-shell { grid-template-columns:190px minmax(0,1fr); }
      .sidebar button,.sidebar a { padding-inline:10px; }
      .analysis-grid { grid-template-columns:210px minmax(0,1fr); }
      .charts { grid-template-columns:1fr; }
      .detail-stats { grid-template-columns:repeat(3,minmax(0,1fr)); }
    }
    @media (max-width:720px) {
      .topbar { position:relative; grid-template-columns:auto minmax(0,1fr) auto; min-height:58px; }
      .brand span:last-child { display:none; }
      .global-search input { min-height:38px; }
      .app-shell { display:block; min-height:0; }
      .sidebar { position:sticky; top:0; z-index:30; display:block; width:100%; height:auto; overflow-x:auto; overflow-y:hidden; border-right:0; border-bottom:1px solid var(--line); }
      .sidebar nav { display:flex; width:max-content; padding:0; }
      .sidebar-label { display:flex; align-items:center; padding:8px 11px; white-space:nowrap; }
      .sidebar button,.sidebar a { display:flex; width:auto; min-height:48px; padding:8px 11px; white-space:nowrap; }
      .nav-icon { width:24px; font-size:15px; }
      .sidebar-separator { width:1px; height:32px; margin:8px 2px; flex:0 0 auto; }
      .main { padding:20px 12px 50px; }
      .page-intro h1 { font-size:34px; }
      .page-intro p { margin-top:10px; font-size:14px; }
      .analysis-grid { display:block; }
      .filter-card { position:static; margin-bottom:12px; }
      .filter-form { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .filter-group,.form-actions { grid-column:1 / -1; }
      .filter-group { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .filter-group h3 { grid-column:1 / -1; }
      .summary-card { grid-template-columns:1fr; }
      .summary-card h2,.summary-link { grid-column:auto; }
      .chart-body { grid-template-columns:1fr 1fr; }
      .game-detail-layout,.detail-two-column { grid-template-columns:1fr; }
      .game-header-frame { min-height:0; aspect-ratio:460/215; }
      .detail-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
    @media (max-width:420px) {
      .topbar { gap:8px; padding-inline:8px; }
      .global-search input { padding-left:30px; font-size:12px; }
      .theme-toggle { width:34px; }
      .filter-form,.filter-group { grid-template-columns:1fr; }
      .filter-group h3 { grid-column:auto; }
      .filter-pair { grid-template-columns:1fr 1fr; }
      .chart-body { grid-template-columns:1fr; }
      .donut { width:145px; }
      .overview-row { grid-template-columns:105px minmax(0,1fr); }
      .detail-stats { grid-template-columns:1fr 1fr; }
    }
    @media (prefers-reduced-motion:reduce) { .loading::after { animation:none; } }
  </style>
</head>
<body>
  ${appHeader}
  <div class="app-layout" data-app-shell>
    ${appSidebar}
    <main class="app-main main">
      <header class="page-intro"><h1 data-page-title tabindex="-1">Steam Pazar Analizi</h1><p data-page-description>Steam oyunlarının tahmini satış, gelir, oyuncu ve fiyat verilerini inceleyin.</p></header>

      <section class="view" data-view="home">
        <article class="card">
          <div class="card-head"><div><h2>Steam'deki en iyi yeni oyunlar</h2><p>Bu ay çıkan oyunlar, tahmini gelire göre sıralanır.</p></div><span class="source-note">Gamalytic API · tahmini veri</span></div>
          <div data-home-table></div><div class="status" data-home-status role="status" aria-live="polite"></div><button class="summary-link" type="button" data-see-games>Tüm oyunları gör</button>
        </article>
      </section>

      <section class="view" data-view="steam-analytics" hidden>
        <div class="analysis-grid">
          <aside class="filter-card"><h2>Oyunları Filtrele</h2>${filterForm("analytics", false)}</aside>
          <div class="stack"><article class="card summary-card" data-summary></article><div class="charts" data-analytics-charts></div></div>
        </div>
      </section>

      <section class="view" data-view="games" hidden>
        <div class="analysis-grid">
          <aside class="filter-card"><h2>Oyunları Filtrele</h2>${filterForm("games", true)}</aside>
          <article class="card">
            <div class="card-head"><h2>Oyunlar listesi</h2><span class="source-note">Gamalytic API · tahmini veri</span></div>
            <p class="status">İpucu: filtre, kolon ve sıralama seçiminizi bu sayfayı yer imlerine ekleyerek saklayabilirsiniz.</p>
            <div class="data-tools"><details class="column-picker"><summary>▥ Kolonlar</summary>${columnMenu()}</details><button class="secondary" type="button" data-export-games>Bu sayfayı CSV indir</button></div>
            <div data-games-table></div><div class="pagination"><button type="button" data-page-prev aria-label="Önceki sayfa">←</button><span data-page-label>Sayfa 1</span><button type="button" data-page-next aria-label="Sonraki sayfa">→</button></div>
          </article>
        </div>
      </section>

      <section class="view" data-view="publishers" hidden>
        <div class="analysis-grid">
          <aside class="filter-card"><h2>Yayıncıları Filtrele</h2>${publisherForm()}</aside>
          <article class="card"><div class="card-head"><h2>Yayıncılar listesi</h2><span class="source-note">Gamalytic API · tahmini veri</span></div><div data-publishers-table></div><div class="pagination"><button type="button" data-publisher-prev aria-label="Önceki sayfa">←</button><span data-publisher-page>Sayfa 1</span><button type="button" data-publisher-next aria-label="Sonraki sayfa">→</button></div></article>
        </div>
      </section>

      <section class="view" data-view="genres-tags" hidden>
        <div class="analysis-grid">
          <aside class="filter-card"><h2>Oyunları Filtrele</h2>${filterForm("groups", false)}</aside>
          <div class="stack">
            <article class="card"><div class="card-head"><h2>Türler</h2><span class="source-note">Gamalytic API · tahmini veri</span></div><div data-genres-table></div></article>
            <article class="card"><div class="card-head"><h2>Alt türler ve etiketler</h2><div class="group-toggle"><button class="active" type="button" data-tag-count="25">İlk 25</button><button type="button" data-tag-count="100">İlk 100</button></div></div><div data-tags-table></div></article>
          </div>
        </div>
      </section>

      <section class="view" data-view="years" hidden>
        <div class="analysis-grid">
          <aside class="filter-card"><h2>Oyunları Filtrele</h2>${filterForm("years", false)}</aside>
          <article class="card"><div class="card-head"><h2>Yıllar</h2><span class="source-note">Gamalytic API · tahmini veri</span></div><div data-years-table></div></article>
        </div>
      </section>

      <section class="view" data-view="game-detail" hidden>
        <div class="stack" data-game-detail>
          <div class="empty loading">Oyun detayları yükleniyor…</div>
        </div>
      </section>
    </main>
  </div>
  <script>
    const routes={home:["Steam Pazar Analizi","Steam oyunlarının tahmini satış, gelir, oyuncu ve fiyat verilerini inceleyin."],"steam-analytics":["Steam Analitiği","Steam oyun fiyatları, satışları, puanları ve pazar dağılımlarına genel bakış."],games:["Oyunlar Listesi","Steam oyunlarını tahmini satış, gelir ve performans metrikleriyle listeleyin."],publishers:["Yayıncılar Listesi","Steam'deki aktif yayıncıları portföy ve tahmini gelir performansıyla karşılaştırın."],"genres-tags":["Türler ve Etiketler","Steam tür ve etiketlerinin oyun sayısı, gelir ve fiyat dağılımlarını inceleyin."],years:["Yıllar","Steam oyun pazarının yıllar içindeki değişimini analiz edin."],"game-detail":["Oyun İstatistikleri","Satış, gelir, oyuncu ve mağaza verilerini tek oyun özelinde inceleyin."]};
    const gameDetailMatch=location.pathname.match(/^\\/game\\/(\\d{1,12})\\/?$/);const gameDetailId=gameDetailMatch?gameDetailMatch[1]:"";const views=[...document.querySelectorAll("[data-view]")];const navButtons=[...document.querySelectorAll("[data-route]")];let currentRoute=gameDetailId?"game-detail":location.hash.slice(1);if(!routes[currentRoute])currentRoute="home";let gamesPage=0;let publisherPage=0;let lastGames=[];let tagCount=25;let globalStatsPromise=null;let gameDetailPromise=null;const imageMap=new Map();
    const pageTitle=document.querySelector("[data-page-title]");const pageDescription=document.querySelector("[data-page-description]");
    function setRoute(route,updateHash){currentRoute=routes[route]?route:"home";views.forEach(view=>{view.hidden=view.dataset.view!==currentRoute;});navButtons.forEach(button=>{const active=button.dataset.route===currentRoute;button.classList.toggle("active",active);if(active)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");});pageTitle.textContent=routes[currentRoute][0];pageDescription.textContent=routes[currentRoute][1];if(updateHash){history.replaceState(null,"",(gameDetailId?"/analytics":location.pathname)+"#"+currentRoute);pageTitle.focus();}loadRoute(currentRoute);}
    navButtons.forEach(button=>button.addEventListener("click",()=>setRoute(button.dataset.route,true)));window.addEventListener("hashchange",()=>setRoute(location.hash.slice(1),false));
    const themeToggle=document.querySelector("[data-theme-toggle]");function updateThemeLabel(){themeToggle.setAttribute("aria-label",document.documentElement.dataset.theme==="dark"?"Açık temaya geç":"Koyu temaya geç");}const storedTheme=localStorage.getItem("steam-radar-analytics-theme");if(storedTheme==="dark")document.documentElement.dataset.theme="dark";updateThemeLabel();themeToggle.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("steam-radar-analytics-theme",next);updateThemeLabel();});
    function numeric(value){if(value===null||value===undefined||value==="")return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
    function compact(value){const parsed=numeric(value);if(parsed===null)return"—";const abs=Math.abs(parsed);const format=(number,suffix)=>new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(number)+suffix;if(abs>=1e9)return format(parsed/1e9,"b");if(abs>=1e6)return format(parsed/1e6,"m");if(abs>=1e3)return format(parsed/1e3,"k");return new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(parsed);}
    function money(value,decimals=1){const parsed=numeric(value);if(parsed===null)return"—";if(parsed===0)return"$0";const abs=Math.abs(parsed);if(abs>=1e9)return"$"+new Intl.NumberFormat("tr-TR",{maximumFractionDigits:decimals}).format(parsed/1e9)+"b";if(abs>=1e6)return"$"+new Intl.NumberFormat("tr-TR",{maximumFractionDigits:decimals}).format(parsed/1e6)+"m";if(abs>=1e3)return"$"+new Intl.NumberFormat("tr-TR",{maximumFractionDigits:decimals}).format(parsed/1e3)+"k";return"$"+new Intl.NumberFormat("tr-TR",{minimumFractionDigits:0,maximumFractionDigits:2}).format(parsed);}
    function percent(value){const parsed=numeric(value);if(parsed===null)return"—";const normalized=parsed>=0&&parsed<=1?parsed*100:parsed;return new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(normalized)+"%";}
    function date(value){if(value===null||value===undefined||value==="")return"—";const numericValue=Number(value);const parsed=numericValue>0?new Date(numericValue<1e12?numericValue*1000:numericValue):new Date(value);return Number.isNaN(parsed.getTime())?String(value):new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"short",year:"numeric"}).format(parsed);}
    function list(payload){if(Array.isArray(payload))return payload;for(const key of["result","results","items","data"])if(Array.isArray(payload?.[key]))return payload[key];return[];}
    function errorMessage(error){if(error.message==="gamalytic_not_configured")return"Gamalytic API anahtarı Worker secret olarak tanımlanmamış.";if(error.message==="gamalytic_plan_or_key_denied")return"Gamalytic API anahtarı veya planı bu veriye erişemiyor.";if(error.message==="gamalytic_rate_limited")return"Gamalytic API kotası doldu. Biraz sonra tekrar deneyin.";return"Gamalytic verisi şu anda alınamadı.";}
    async function api(resource,params){const url=new URL("/api/gamalytic/"+resource,location.origin);if(params)Object.entries(params).forEach(([key,value])=>{if(value!==""&&value!==null&&value!==undefined)url.searchParams.set(key,String(value));});const response=await fetch(url,{headers:{accept:"application/json"}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"request_failed");return payload;}
    function empty(message,isError=false){const box=document.createElement("div");box.className="empty"+(isError?" error":"");box.textContent=message;return box;}
    function loading(container){container.replaceChildren(empty("Veriler yükleniyor…"));container.firstElementChild.classList.add("loading");}
    async function primeSteamImages(items){const ids=[...new Set(items.map(item=>String(item.steamId||"")).filter(id=>/^\\d{1,12}$/.test(id)&&!imageMap.has(id)))].slice(0,50);if(!ids.length)return;try{const response=await fetch("/api/steam-image?appids="+encodeURIComponent(ids.join(",")),{headers:{accept:"application/json"}});const payload=await response.json().catch(()=>({}));if(!response.ok)return;Object.entries(payload.images||{}).forEach(([appId,url])=>{if(typeof url==="string"&&url.startsWith("https://"))imageMap.set(appId,url);});}catch{}}
    function artwork(appId,name){const id=String(appId||"");const box=document.createElement("span");box.className="game-artwork";box.textContent="STEAM";const image=document.createElement("img");image.loading="lazy";image.decoding="async";image.alt=name+" Steam görseli";image.src=imageMap.get(id)||"https://cdn.cloudflare.steamstatic.com/steam/apps/"+id+"/header.jpg";image.addEventListener("error",()=>image.remove(),{once:true});box.append(image);return box;}
    async function jsonRequest(path){const response=await fetch(path,{headers:{accept:"application/json"}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"request_failed");return payload;}
    function textValue(value){if(value===null||value===undefined||value==="")return"—";return String(value);}
    function textList(value){return Array.isArray(value)?value.filter(Boolean).join(", "):"";}
    function detailCard(title){const card=document.createElement("article");card.className="card";const head=document.createElement("div");head.className="card-head";const heading=document.createElement("h2");heading.textContent=title;head.append(heading);card.append(head);return card;}
    function overviewRow(label,value){const row=document.createElement("div");row.className="overview-row";const term=document.createElement("dt");term.textContent=label;const detail=document.createElement("dd");detail.textContent=textValue(value);row.append(term,detail);return row;}
    function detailTags(items){const listElement=document.createElement("span");listElement.className="detail-tag-list";const values=Array.isArray(items)?items.filter(Boolean):[];if(!values.length){listElement.textContent="—";return listElement;}values.forEach(value=>{const chip=document.createElement("span");chip.className="detail-tag";chip.textContent=String(value);listElement.append(chip);});return listElement;}
    function metric(label,value,note){const item=document.createElement("div");item.className="detail-metric";const name=document.createElement("span");name.textContent=label;const amount=document.createElement("strong");amount.textContent=value;item.append(name,amount);if(note){const small=document.createElement("small");small.textContent=note;item.append(small);}return item;}
    function priceText(steam,stats,gamalytic){const price=stats?.price||steam?.price;if(price){if(price.finalFormatted)return price.discountPercent?price.finalFormatted+" · %"+price.discountPercent+" indirim":price.finalFormatted;if(Number(price.final)===0)return"Ücretsiz";}return numeric(gamalytic?.price)===null?"—":money(gamalytic.price,2);}
    function detailTable(items,label){if(!items.length)return empty("Bu veri bağlı Gamalytic API planında sunulmuyor.");const wrap=tableWrap(label);const table=document.createElement("table");table.style.minWidth="760px";const head=document.createElement("thead");const header=document.createElement("tr");["Oyun","Oran","Satış*","Gelir*","Fiyat","Türler","Çıkış"].forEach(value=>{const th=document.createElement("th");th.textContent=value;header.append(th);});head.append(header);const body=document.createElement("tbody");items.forEach(game=>{const row=document.createElement("tr");const nameCell=document.createElement("td");const link=document.createElement("a");link.href="/game/"+game.steamId;link.textContent=game.name||"Steam App "+game.steamId;nameCell.append(link);row.append(nameCell,td(numeric(game.overlap)===null?"—":percent(game.overlap)),td(compact(game.copiesSold)),td(money(game.revenue)),td(money(game.price,2)),td(textList(game.genres)||"—"),td(date(game.releaseDate)));body.append(row);});table.append(head,body);wrap.append(table);return wrap;}
    function detailBars(items,label){const valid=(Array.isArray(items)?items:[]).filter(item=>numeric(item?.value)!==null).sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,12);if(!valid.length)return empty("Bu dağılım API planında sunulmuyor.");const maximum=Math.max(...valid.map(item=>Number(item.value)),1);const listElement=document.createElement("div");listElement.className="mini-bars";listElement.setAttribute("aria-label",label);valid.forEach(item=>{const row=document.createElement("div");row.className="mini-bar";const name=document.createElement("span");name.textContent=item.country||item.label||"—";const track=document.createElement("span");track.className="mini-bar-track";const fill=document.createElement("span");fill.className="mini-bar-fill";fill.style.width=Math.max(2,Number(item.value)/maximum*100)+"%";track.append(fill);const value=document.createElement("strong");value.textContent=compact(item.value);row.append(name,track,value);listElement.append(row);});return listElement;}
    function detailHistory(history){const card=detailCard("Historic data");const values=(Array.isArray(history)?history:[]).filter(item=>numeric(item?.revenue)!==null||numeric(item?.sales)!==null||numeric(item?.reviews)!==null);if(values.length<2){card.append(empty("Tarihsel seri bu oyun veya bağlı API planı için sunulmuyor."));return card;}const metricKey=values.some(item=>numeric(item.revenue)!==null)?"revenue":values.some(item=>numeric(item.sales)!==null)?"sales":"reviews";const metricLabel=metricKey==="revenue"?"Gelir*":metricKey==="sales"?"Satış*":"İnceleme";const note=document.createElement("p");note.className="status";note.textContent="Tüm dönem · "+metricLabel;const chart=document.createElement("div");chart.className="history-chart";chart.setAttribute("role","img");chart.setAttribute("aria-label",metricLabel+" tarihsel grafiği");const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 900 210");svg.setAttribute("preserveAspectRatio","none");const numericValues=values.map(item=>Number(item[metricKey]||0));const maximum=Math.max(...numericValues,1);const points=numericValues.map((value,index)=>{const x=values.length===1?0:index/(values.length-1)*900;const y=190-value/maximum*165;return[x,y];});const axis=document.createElementNS("http://www.w3.org/2000/svg","path");axis.setAttribute("class","axis");axis.setAttribute("d","M0 190 H900");const area=document.createElementNS("http://www.w3.org/2000/svg","path");area.setAttribute("class","area");area.setAttribute("d","M0 190 L"+points.map(point=>point.join(" ")).join(" L")+" L900 190 Z");const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");line.setAttribute("class","series");line.setAttribute("points",points.map(point=>point.join(",")).join(" "));svg.append(axis,area,line);chart.append(svg);card.append(note,chart);return card;}
    function detailDlc(items){if(!Array.isArray(items)||!items.length)return null;const card=detailCard("DLCs");card.append(detailTable(items,"DLC tablosu"));return card;}
    function renderGameDetail(steam,stats,gamalytic,gamalyticError){const container=document.querySelector("[data-game-detail]");container.replaceChildren();const name=steam?.name||gamalytic?.name||"Steam App "+gameDetailId;pageTitle.textContent=name+" - Steam Stats";pageDescription.textContent="Revenue, player data and other stats on "+name;document.title=name+" · Steam İstatistikleri";const back=document.createElement("a");back.className="detail-back";back.href="/analytics#games";back.textContent="← Oyunlar listesine dön";container.append(back);const top=document.createElement("div");top.className="game-detail-layout";const header=detailCard("Steam Header");const frame=document.createElement("div");frame.className="game-header-frame";frame.textContent="STEAM HEADER";const image=document.createElement("img");image.alt=name+" Steam header görseli";image.src=steam?.headerImageUrl||"https://cdn.cloudflare.steamstatic.com/steam/apps/"+gameDetailId+"/header.jpg";image.addEventListener("error",()=>image.remove(),{once:true});frame.append(image);const caption=document.createElement("p");caption.className="detail-note";caption.textContent="Görsel Steam mağaza varlığından alınır.";header.append(frame,caption);const overview=detailCard("Overview");const listElement=document.createElement("dl");listElement.className="overview-list";listElement.append(overviewRow("Developers",textList(steam?.developers)||textList(gamalytic?.developers)),overviewRow("Publishers",textList(steam?.publishers)||textList(gamalytic?.publishers)),overviewRow("First release date",date(gamalytic?.firstReleaseDate||gamalytic?.releaseDate||steam?.releaseDate)),overviewRow("1.0 release date",date(gamalytic?.earlyAccessExitDate)),overviewRow("Price",priceText(steam,stats,gamalytic)));const genreRow=overviewRow("Genres","");genreRow.querySelector("dd").replaceChildren(detailTags(steam?.genres?.length?steam.genres:gamalytic?.genres));const languageRow=overviewRow("Languages","");languageRow.querySelector("dd").replaceChildren(detailTags(steam?.languages?.length?steam.languages:gamalytic?.languages));const tagRow=overviewRow("Tags","");tagRow.querySelector("dd").replaceChildren(detailTags(steam?.tags?.length?steam.tags:gamalytic?.tags));const featureRow=overviewRow("Features","");featureRow.querySelector("dd").replaceChildren(detailTags(steam?.features?.length?steam.features:gamalytic?.features));listElement.append(genreRow,languageRow,tagRow,featureRow);overview.append(listElement);const description=document.createElement("p");description.className="detail-description";description.textContent=steam?.description||gamalytic?.description||"Açıklama verisi bulunamadı.";const actions=document.createElement("div");actions.className="detail-actions";[[steam?.storeUrl||"https://store.steampowered.com/app/"+gameDetailId+"/","Steam ↗"],[steam?.steamDbUrl||"https://steamdb.info/app/"+gameDetailId+"/","SteamDB ↗"]].forEach(([href,label])=>{const link=document.createElement("a");link.href=href;link.target="_blank";link.rel="noreferrer";link.textContent=label;actions.append(link);});overview.append(description,actions);top.append(header,overview);container.append(top);const statsCard=detailCard("Stats");const statsGrid=document.createElement("div");statsGrid.className="detail-stats";const reviewCount=gamalytic?.reviews??stats?.totalReviews;[["Copies sold*",compact(gamalytic?.copiesSold),"Tahmini"],["Gross revenue*",money(gamalytic?.revenue),"Tahmini"],["Gross revenue total*",money(gamalytic?.totalRevenue),"DLC/IAP dahil tahmini"],["Outstanding wishlists*",compact(gamalytic?.wishlists),"Tahmini"],["Players total*",compact(gamalytic?.players),"Tahmini"],["Owners*",compact(gamalytic?.owners),"Tahmini"],["Reviews",compact(reviewCount),stats?.reviewScore||"Steam"],["Review score",numeric(gamalytic?.reviewScore)===null?(numeric(stats?.positivePercent)===null?"—":compact(stats.positivePercent)+"%"):compact(gamalytic.reviewScore)+"%",""],["Average playtime",numeric(gamalytic?.avgPlaytime)===null?"—":compact(gamalytic.avgPlaytime)+" sa",""],["Current players",compact(stats?.currentPlayers),"Steam canlı"],["Followers",compact(gamalytic?.followers),""],["Price",priceText(steam,stats,gamalytic),""]].forEach(item=>statsGrid.append(metric(item[0],item[1],item[2])));statsCard.append(statsGrid);const statsNote=document.createElement("p");statsNote.className="detail-note";statsNote.textContent="* Satış, gelir, sahiplik ve wishlist alanları Gamalytic tahminidir; Steam tarafından doğrulanmış kesin rakam değildir.";statsCard.append(statsNote);if(gamalyticError){const warning=document.createElement("p");warning.className="status error";warning.textContent=errorMessage(gamalyticError);statsCard.append(warning);}container.append(statsCard);const related=[...(gamalytic?.audienceOverlap||[]),...(gamalytic?.alsoPlayed||[])].filter((game,index,array)=>array.findIndex(item=>item.steamId===game.steamId)===index);const insights=detailCard("Player Insights");const tabs=document.createElement("div");tabs.className="detail-tabs";["Overlapping games","Playtime breakdown","Review Sentiment","Wishlist Insights","Regional Active Players"].forEach((label,index)=>{const button=document.createElement("button");button.type="button";button.textContent=label;if(index>0)button.disabled=true;tabs.append(button);});insights.append(tabs,detailTable(related,"Benzer oyuncu kitlesine sahip oyunlar"));container.append(insights);const dlc=detailDlc(gamalytic?.dlc||[]);if(dlc)container.append(dlc);container.append(detailHistory(gamalytic?.history));const storeInsights=detailCard("Store Page Insights");const storeTabs=document.createElement("div");storeTabs.className="detail-tabs";["Tags & Features","Regional Active Players","Likes Count History"].forEach((label,index)=>{const button=document.createElement("button");button.type="button";button.textContent=label;if(index>1)button.disabled=true;storeTabs.append(button);});const storeGrid=document.createElement("div");storeGrid.className="detail-two-column";const attributes=document.createElement("div");const attributeTitle=document.createElement("h3");attributeTitle.textContent="Mağaza özellikleri";attributes.append(attributeTitle,detailTags([...(steam?.genres||gamalytic?.genres||[]),...(steam?.tags||gamalytic?.tags||[]),...(steam?.features||gamalytic?.features||[])]));const regions=document.createElement("div");const regionTitle=document.createElement("h3");regionTitle.textContent="Oyuncuların ülkelere göre dağılımı";regions.append(regionTitle,detailBars(gamalytic?.countryData,"Ülke dağılımı"));storeGrid.append(attributes,regions);storeInsights.append(storeTabs,storeGrid);container.append(storeInsights);}
    async function loadGameDetail(){if(!gameDetailId)return;if(gameDetailPromise)return gameDetailPromise;const container=document.querySelector("[data-game-detail]");loading(container);gameDetailPromise=(async()=>{const results=await Promise.allSettled([jsonRequest("/api/steam-app?appid="+gameDetailId+"&v=7"),jsonRequest("/api/steam-stats?appid="+gameDetailId),jsonRequest("/api/gamalytic-game?appid="+gameDetailId)]);const steam=results[0].status==="fulfilled"?results[0].value:null;const stats=results[1].status==="fulfilled"?results[1].value:null;const gamalytic=results[2].status==="fulfilled"?results[2].value:null;const gamalyticError=results[2].status==="rejected"?results[2].reason:null;if(!steam&&!stats&&!gamalytic)throw new Error("game_not_found");renderGameDetail(steam,stats,gamalytic,gamalyticError);})().catch(error=>{container.replaceChildren(empty(error.message==="game_not_found"?"Oyun bulunamadı.":"Oyun detayları şu anda yüklenemedi.",true));});return gameDetailPromise;}
    function td(value,column){const cell=document.createElement("td");if(column)cell.dataset.col=column;cell.textContent=value;return cell;}
    function tableWrap(label){const wrap=document.createElement("div");wrap.className="table-wrap";wrap.tabIndex=0;wrap.setAttribute("aria-label",label+"; yatay kaydırılabilir");return wrap;}
    function gameIdentity(game,showDate=false,showArtwork=true){const cell=document.createElement("td");cell.dataset.col="name";const box=document.createElement("div");box.className="game-cell";if(showArtwork)box.append(artwork(game.steamId,game.name||"Steam oyunu"));else box.style.gridTemplateColumns="minmax(150px,1fr)";const copy=document.createElement("span");copy.className="game-copy";const link=document.createElement("a");const id=String(game.steamId||"");link.href=/^\\d{1,12}$/.test(id)?"/game/"+id:"/analytics#games";link.textContent=game.name||"İsimsiz oyun";copy.append(link);if(showDate){const small=document.createElement("small");small.textContent=date(game.firstReleaseDate||game.releaseDate);copy.append(small);}box.append(copy);cell.append(box);return cell;}
    function homeTable(items){if(!items.length)return empty("Bu ay için oyun verisi bulunamadı.");const wrap=tableWrap("Yeni oyunlar tablosu");const table=document.createElement("table");table.style.minWidth="700px";const head=document.createElement("thead");const row=document.createElement("tr");["#","Oyun","Satış*","Gelir*","Fiyat"].forEach(label=>{const th=document.createElement("th");th.textContent=label;row.append(th);});head.append(row);const body=document.createElement("tbody");items.forEach((game,index)=>{const tr=document.createElement("tr");const rank=td(String(index+1));rank.className="rank";tr.append(rank,gameIdentity(game,true),td(compact(game.copiesSold)),td(money(game.totalRevenue??game.revenue)),td(game.price===0?"$0":money(game.price,2)));body.append(tr);});table.append(head,body);wrap.append(table);return wrap;}
    const gameColumns=[{key:"capsule",label:"Görsel"},{key:"name",label:"Ad"},{key:"release",label:"İlk çıkış"},{key:"sold",label:"Satış*"},{key:"price",label:"Fiyat"},{key:"revenue",label:"Gelir*"},{key:"playtime",label:"Ort. oynama"},{key:"score",label:"İnceleme skoru"},{key:"reviews",label:"İnceleme"},{key:"followers",label:"Takipçi"},{key:"wishlists",label:"Wishlist*"}];
    function gameTable(items){if(!items.length)return empty("Bu filtrelerle eşleşen oyun bulunamadı.");const wrap=tableWrap("Oyunlar tablosu");const table=document.createElement("table");table.dataset.gameTable="";const head=document.createElement("thead");const header=document.createElement("tr");gameColumns.forEach(column=>{const th=document.createElement("th");th.dataset.col=column.key;th.textContent=column.label;header.append(th);});head.append(header);const body=document.createElement("tbody");items.forEach(game=>{const row=document.createElement("tr");const imageCell=document.createElement("td");imageCell.dataset.col="capsule";imageCell.append(artwork(game.steamId,game.name||"Steam oyunu"));row.append(imageCell,gameIdentity(game,false,false),td(date(game.firstReleaseDate||game.releaseDate),"release"),td(compact(game.copiesSold),"sold"),td(game.price===0?"$0":money(game.price,2),"price"),td(money(game.totalRevenue??game.revenue),"revenue"),td(numeric(game.avgPlaytime)===null?"—":compact(game.avgPlaytime)+" sa","playtime"),td(numeric(game.reviewScore)===null?"—":compact(game.reviewScore)+"%","score"),td(compact(game.reviews),"reviews"),td(compact(game.followers),"followers"),td(compact(game.wishlists),"wishlists"));body.append(row);});table.append(head,body);wrap.append(table);applyColumnVisibility(table);return wrap;}
    function selectedColumns(){try{return new Set(JSON.parse(localStorage.getItem("steam-radar-analytics-columns")||"[]"));}catch{return new Set();}}
    function applyColumnVisibility(table){const selected=selectedColumns();if(!selected.size)return;table.querySelectorAll("[data-col]").forEach(cell=>{cell.hidden=!selected.has(cell.dataset.col);});}
    document.querySelectorAll("[data-column-toggle]").forEach(input=>{const selected=selectedColumns();if(selected.size)input.checked=selected.has(input.value);input.addEventListener("change",()=>{const values=[...document.querySelectorAll("[data-column-toggle]:checked")].map(item=>item.value);localStorage.setItem("steam-radar-analytics-columns",JSON.stringify(values));document.querySelectorAll("[data-game-table]").forEach(applyColumnVisibility);});});
    function formParams(form){const data=new FormData(form);const params={};for(const[key,value]of data.entries()){const text=String(value).trim();if(!text)continue;if(key==="first_release_date_min"||key==="first_release_date_max")params[key]=new Date(text+"T00:00:00Z").getTime();else if(key==="tags"&&params.tags)params.tags+=","+text;else params[key]=text;}return params;}
    function summaryView(stats,globalStats){const container=document.querySelector("[data-summary]");const matching=numeric(stats.numberOfGames);const total=numeric(globalStats?.numberOfGames);const revenue=numeric(stats.totalRevenue);const totalRevenue=numeric(globalStats?.totalRevenue);const ratio=(value,base)=>value!==null&&base?" ("+Math.round(value/base*100)+"%)":"";container.replaceChildren();const heading=document.createElement("h2");heading.textContent="Özet";container.append(heading);const rows=[["Filtreyle eşleşen oyun",compact(matching)+" / "+compact(total)+ratio(matching,total)],["Toplam tahmini gelir",money(revenue)+" / "+money(totalRevenue)+ratio(revenue,totalRevenue)],["Medyan gelir",money(stats.medianRevenue??stats.revenueQuartals?.median??stats.revenueQuartals?.q2)],["Ortalama fiyat",money(stats.averagePrice,2)],["Ortalama oynama",numeric(stats.averagePlaytime)===null?"—":compact(stats.averagePlaytime)+" sa"]];rows.forEach(([label,value])=>{const row=document.createElement("div");row.className="summary-row";const strong=document.createElement("strong");strong.textContent=label+": ";row.append(strong,document.createTextNode(value));container.append(row);});const link=document.createElement("button");link.className="summary-link";link.type="button";link.textContent="Oyunları gör";link.addEventListener("click",()=>setRoute("games",true));container.append(link);}
    function distributionCard(title,data){const card=document.createElement("article");card.className="card chart-card";const head=document.createElement("div");head.className="card-head";const heading=document.createElement("h3");heading.textContent=title;head.append(heading);card.append(head);const entries=data&&typeof data==="object"?Object.entries(data).filter(([,value])=>Number.isFinite(Number(value))&&Number(value)>=0).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,5):[];if(!entries.length){card.append(empty("Bu dağılım API planında sunulmuyor."));return card;}const total=entries.reduce((sum,[,value])=>sum+Number(value),0)||1;let cursor=0;const segments=entries.map(([,value],index)=>{const start=cursor;cursor+=Number(value)/total*100;return"var(--chart-"+(index+1)+") "+start+"% "+cursor+"%";});const body=document.createElement("div");body.className="chart-body";const donut=document.createElement("div");donut.className="donut";donut.style.background="conic-gradient("+segments.join(",")+")";donut.setAttribute("role","img");donut.setAttribute("aria-label",title+" pasta grafiği");const legend=document.createElement("div");legend.className="legend";entries.forEach(([label,value],index)=>{const row=document.createElement("div");row.className="legend-row";const color=document.createElement("span");color.className="legend-color";color.style.setProperty("--chart-color","var(--chart-"+(index+1)+")");const name=document.createElement("span");name.textContent=label;const amount=document.createElement("strong");amount.textContent=Math.round(Number(value)/total*100)+"%";row.append(color,name,amount);legend.append(row);});body.append(legend,donut);card.append(body);return card;}
    async function loadHome(){const table=document.querySelector("[data-home-table]");const status=document.querySelector("[data-home-status]");loading(table);status.textContent="";try{const start=new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);const payload=await api("games",{limit:50,page:0,sort:"revenue",sort_mode:"desc",release_status:"released",first_release_date_min:start.getTime()});const games=list(payload).slice(0,30);await primeSteamImages(games);table.replaceChildren(homeTable(games));status.textContent=compact(payload.total??games.length)+" yeni oyun · Satış ve gelir değerleri tahminidir.";}catch(error){table.replaceChildren(empty(errorMessage(error),true));}}
    async function runAnalytics(){const form=document.querySelector('[data-filter-form="analytics"]');const container=document.querySelector("[data-summary]");const charts=document.querySelector("[data-analytics-charts]");loading(container);loading(charts);try{if(!globalStatsPromise)globalStatsPromise=api("stats").catch(error=>{globalStatsPromise=null;throw error;});const[stats,globalStats]=await Promise.all([api("stats",formParams(form)),globalStatsPromise]);summaryView(stats,globalStats);charts.replaceChildren(distributionCard("Gelir Dağılımı",stats.revenueDistribution),distributionCard("Fiyat Dağılımı",stats.priceDistribution),distributionCard("Satış Dağılımı",stats.salesDistribution),distributionCard("İnceleme Skoru Dağılımı",stats.reviewsDistribution),distributionCard("Yıllara Göre Gelir",stats.timeDistribution),distributionCard("Platform Dağılımı",stats.platformDistribution));}catch(error){container.replaceChildren(empty(errorMessage(error),true));charts.replaceChildren();}}
    async function loadGames(){const form=document.querySelector('[data-filter-form="games"]');const container=document.querySelector("[data-games-table]");loading(container);try{const payload=await api("games",{...formParams(form),page:gamesPage,limit:50,sort:form.elements.sort.value,sort_mode:form.elements.sort_mode.value});lastGames=list(payload);await primeSteamImages(lastGames);container.replaceChildren(gameTable(lastGames));const pages=Number(payload.pages||1);document.querySelector("[data-page-label]").textContent="Sayfa "+(gamesPage+1)+" / "+compact(pages);document.querySelector("[data-page-prev]").disabled=gamesPage<=0;document.querySelector("[data-page-next]").disabled=pages?gamesPage>=pages-1:!payload.next;}catch(error){container.replaceChildren(empty(errorMessage(error),true));}}
    function publisherTable(items){if(!items.length)return empty("Bu sayfada yayıncı bulunamadı.");const wrap=tableWrap("Yayıncılar tablosu");const table=document.createElement("table");const head=document.createElement("thead");const header=document.createElement("tr");["Ad","Toplam gelir*","Medyan gelir*","Ortalama gelir*","Sınıf","Yayınlanan oyun","% Şirket içi","% Aksiyon"].forEach(label=>{const th=document.createElement("th");th.textContent=label;header.append(th);});head.append(header);const body=document.createElement("tbody");items.forEach(publisher=>{const actionCount=Number(publisher.genres?.Action||0);const games=Number(publisher.numberOfGames||0);const row=document.createElement("tr");row.append(td(publisher.name||"—"),td(money(publisher.totalRevenue)),td(money(publisher.medianRevenue)),td(money(publisher.averageRevenue)),td(publisher.class||"—"),td(compact(publisher.numberOfGames)),td(numeric(publisher.inHouse)===null?"—":Math.round(Number(publisher.inHouse)*(Number(publisher.inHouse)<=1?100:1))+"%"),td(actionCount?compact(actionCount)+" ("+Math.round(actionCount/Math.max(games,1)*100)+"%)":"—"));body.append(row);});table.append(head,body);wrap.append(table);return wrap;}
    async function loadPublishers(){const form=document.querySelector("[data-publisher-form]");const container=document.querySelector("[data-publishers-table]");loading(container);try{const payload=await api("publishers",{page:publisherPage,limit:100});let items=list(payload);const data=new FormData(form);const name=String(data.get("name")||"").toLocaleLowerCase("tr");const revenueMin=Number(data.get("revenueMin")||0);const revenueMax=Number(data.get("revenueMax")||Infinity);const gamesMin=Number(data.get("gamesMin")||0);const gamesMax=Number(data.get("gamesMax")||Infinity);const publisherClass=String(data.get("class")||"").toLocaleLowerCase("tr");items=items.filter(item=>(!name||String(item.name||"").toLocaleLowerCase("tr").includes(name))&&Number(item.totalRevenue||0)>=revenueMin&&Number(item.totalRevenue||0)<=revenueMax&&Number(item.numberOfGames||0)>=gamesMin&&Number(item.numberOfGames||0)<=gamesMax&&(!publisherClass||String(item.class||"").toLocaleLowerCase("tr").includes(publisherClass)));container.replaceChildren(publisherTable(items));const pages=Number(payload.pages||1);document.querySelector("[data-publisher-page]").textContent="Sayfa "+(publisherPage+1)+" / "+compact(pages);document.querySelector("[data-publisher-prev]").disabled=publisherPage<=0;document.querySelector("[data-publisher-next]").disabled=pages?publisherPage>=pages-1:!payload.next;}catch(error){container.replaceChildren(empty(errorMessage(error),true));}}
    function groupTable(items,label){if(!items.length)return empty("Gruplandırılmış veri bulunamadı.");const wrap=tableWrap(label+" tablosu");const table=document.createElement("table");const head=document.createElement("thead");const header=document.createElement("tr");[label,"Oyun","Toplam gelir*","Ortalama gelir*","Alt %30 gelir*","Medyan gelir*","Üst %25 gelir*","Üst %5 gelir*","Ortalama fiyat"].forEach(value=>{const th=document.createElement("th");th.textContent=value;header.append(th);});head.append(header);const body=document.createElement("tbody");items.forEach(item=>{const row=document.createElement("tr");row.append(td(String(item.label??item.id??"—")),td(compact(item.numberOfGames)),td(money(item.totalRevenue)),td(money(item.averageRevenue)),td(money(item.bottom30)),td(money(item.medianRevenue)),td(money(item.top25)),td(money(item.top5)),td(money(item.averagePrice,2)));body.append(row);});table.append(head,body);wrap.append(table);return wrap;}
    async function loadGroups(){const form=document.querySelector('[data-filter-form="groups"]');const genres=document.querySelector("[data-genres-table]");const tags=document.querySelector("[data-tags-table]");loading(genres);loading(tags);try{const params=formParams(form);const[genrePayload,tagPayload]=await Promise.all([api("groups",{...params,key:"genres"}),api("groups",{...params,key:"tags",n_tags:tagCount})]);genres.replaceChildren(groupTable(list(genrePayload),"Tür"));tags.replaceChildren(groupTable(list(tagPayload),"Etiket"));}catch(error){genres.replaceChildren(empty(errorMessage(error),true));tags.replaceChildren();}}
    async function loadYears(){const form=document.querySelector('[data-filter-form="years"]');const container=document.querySelector("[data-years-table]");loading(container);try{const items=list(await api("groups",{...formParams(form),key:"releaseDate"})).filter(item=>/^\\d{4}$/.test(String(item.label))).sort((a,b)=>Number(a.label)-Number(b.label));container.replaceChildren(groupTable(items,"Yıl"));}catch(error){container.replaceChildren(empty(errorMessage(error),true));}}
    function loadRoute(route){if(route==="home")loadHome();else if(route==="steam-analytics")runAnalytics();else if(route==="games")loadGames();else if(route==="publishers")loadPublishers();else if(route==="genres-tags")loadGroups();else if(route==="years")loadYears();else if(route==="game-detail")loadGameDetail();}
    document.querySelectorAll("[data-filter-form]").forEach(form=>{form.addEventListener("submit",event=>{event.preventDefault();if(form.dataset.filterForm==="analytics")runAnalytics();else if(form.dataset.filterForm==="games"){gamesPage=0;loadGames();}else if(form.dataset.filterForm==="groups")loadGroups();else loadYears();});form.addEventListener("reset",()=>setTimeout(()=>{if(form.dataset.filterForm==="analytics")runAnalytics();else if(form.dataset.filterForm==="games"){gamesPage=0;loadGames();}else if(form.dataset.filterForm==="groups")loadGroups();else loadYears();},0));});
    document.querySelector("[data-publisher-form]").addEventListener("submit",event=>{event.preventDefault();publisherPage=0;loadPublishers();});document.querySelector("[data-publisher-form]").addEventListener("reset",()=>setTimeout(()=>{publisherPage=0;loadPublishers();},0));
    document.querySelector("[data-page-prev]").addEventListener("click",()=>{if(gamesPage>0){gamesPage--;loadGames();}});document.querySelector("[data-page-next]").addEventListener("click",()=>{gamesPage++;loadGames();});document.querySelector("[data-publisher-prev]").addEventListener("click",()=>{if(publisherPage>0){publisherPage--;loadPublishers();}});document.querySelector("[data-publisher-next]").addEventListener("click",()=>{publisherPage++;loadPublishers();});
    document.querySelectorAll("[data-tag-count]").forEach(button=>{button.setAttribute("aria-pressed",button.classList.contains("active")?"true":"false");button.addEventListener("click",()=>{tagCount=Number(button.dataset.tagCount);document.querySelectorAll("[data-tag-count]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",active?"true":"false");});loadGroups();});});
    document.querySelector("[data-global-search]").addEventListener("submit",event=>{event.preventDefault();const query=String(new FormData(event.currentTarget).get("query")||"").trim();if(!query)return;const titleInput=document.querySelector('[data-filter-form="games"] [name="title"]');titleInput.value=query;gamesPage=0;setRoute("games",true);});
    document.querySelector("[data-see-games]").addEventListener("click",()=>setRoute("games",true));
    document.querySelector("[data-export-games]").addEventListener("click",()=>{if(!lastGames.length)return;const columns=["steamId","name","firstReleaseDate","copiesSold","price","totalRevenue","avgPlaytime","reviewScore","reviews","followers","wishlists"];const csv=[columns.join(","),...lastGames.map(game=>columns.map(key=>'"'+String(game[key]??"").replaceAll('"','""')+'"').join(","))].join("\\r\\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="steam-oyunlari.csv";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});
    setRoute(currentRoute,false);
  </script>
</body>
</html>`;
}

function filterForm(name: string, includeReleaseStatus: boolean): string {
  return `<form class="filter-form" data-filter-form="${name}">
    <section class="filter-group"><h3>İş Modeli</h3><div class="filter-pair"><label class="field">Min. fiyat ($)<input type="number" min="0" step="1" name="price_min"></label><label class="field">Maks. fiyat ($)<input type="number" min="0" step="1" name="price_max"></label></div></section>
    <section class="filter-group"><h3>Oyun Özellikleri</h3><label class="field">Ana türler<input type="text" name="genres" placeholder="Action, RPG"></label><label class="field">Alt türler<input type="text" name="tags" placeholder="Roguelike, Strategy"></label><label class="field">Etiketler<input type="text" name="tags" placeholder="Co-op, Multiplayer"></label><label class="field">Hariç etiketler<input type="text" name="tags_exclude" placeholder="Horror"></label><label class="field">Steam özellikleri<input type="text" name="features" placeholder="Workshop, Cards"></label></section>
    <section class="filter-group"><h3>Çıkış ve Performans</h3><label class="field">Yayın durumu<select name="release_status" ${includeReleaseStatus ? "" : 'disabled title="Bu toplu API uç noktasında desteklenmiyor"'}><option value="released">Yayınlandı</option><option value="all">Tümü</option><option value="unreleased">Yakında</option><option value="early_access">Erken erişim</option><option value="full_release">Tam sürüm</option></select></label><div class="filter-pair"><label class="field">İlk çıkış sonrası<input type="date" name="first_release_date_min"></label><label class="field">İlk çıkış öncesi<input type="date" name="first_release_date_max"></label></div><div class="filter-pair"><label class="field">Min. gelir<input type="number" min="0" name="revenue_min"></label><label class="field">Maks. gelir<input type="number" min="0" name="revenue_max"></label></div><div class="filter-pair"><label class="field">Min. inceleme<input type="number" min="0" name="reviews_min"></label><label class="field">Maks. inceleme<input type="number" min="0" name="reviews_max"></label></div><div class="filter-pair"><label class="field">Min. satış<input type="number" min="0" name="sold_min"></label><label class="field">Maks. satış<input type="number" min="0" name="sold_max"></label></div><div class="filter-pair"><label class="field">Min. skor<input type="number" min="0" max="100" name="score_min"></label><label class="field">Maks. skor<input type="number" min="0" max="100" name="score_max"></label></div><div class="filter-pair"><label class="field">Min. takipçi<input type="number" min="0" name="followers_min"></label><label class="field">Maks. takipçi<input type="number" min="0" name="followers_max"></label></div><div class="filter-pair"><label class="field">Min. wishlist<input type="number" min="0" name="wishlists_min"></label><label class="field">Maks. wishlist<input type="number" min="0" name="wishlists_max"></label></div><div class="filter-pair"><label class="field">Min. oynama<input type="number" min="0" name="avg_playtime_min"></label><label class="field">Maks. oynama<input type="number" min="0" name="avg_playtime_max"></label></div></section>
    <section class="filter-group"><h3>Yayıncı Özeti</h3><label class="field">Yayıncı sınıfı<input type="text" disabled placeholder="API planında sunulmuyor"></label><label class="field">Yayınlama modeli<select disabled><option>Tümü</option></select></label></section>
    <section class="filter-group"><h3>Arama</h3><label class="field">Oyun adı<input type="search" name="title"></label></section>
    ${name === "games" ? '<section class="filter-group"><h3>Sıralama</h3><label class="field">Sırala<select name="sort"><option value="revenue">Gelir</option><option value="copiesSold">Satış</option><option value="reviews">İnceleme</option><option value="wishlists">Wishlist</option><option value="firstReleaseDate">Çıkış tarihi</option></select></label><label class="field">Yön<select name="sort_mode"><option value="desc">Azalan</option><option value="asc">Artan</option></select></label></section>' : ""}
    <div class="form-actions"><button class="primary" type="submit">Filtreleri uygula</button><button class="secondary" type="reset">Temizle</button></div>
  </form>`;
}

function publisherForm(): string {
  return `<form class="filter-form" data-publisher-form><section class="filter-group"><div class="filter-pair"><label class="field">Min. gelir ($)<input type="number" min="0" name="revenueMin"></label><label class="field">Maks. gelir ($)<input type="number" min="0" name="revenueMax"></label></div><div class="filter-pair"><label class="field">Min. oyun<input type="number" min="0" name="gamesMin"></label><label class="field">Maks. oyun<input type="number" min="0" name="gamesMax"></label></div><label class="field">Yayıncı sınıfı<input type="text" name="class" placeholder="Indie, AA, AAA"></label><label class="field">Yayıncı adı<input type="search" name="name"></label></section><div class="form-actions"><button class="primary" type="submit">Filtreleri uygula</button><button class="secondary" type="reset">Temizle</button></div></form>`;
}

function columnMenu(): string {
  const columns = [
    ["capsule", "Görsel"],
    ["name", "Ad"],
    ["release", "İlk çıkış"],
    ["sold", "Satış"],
    ["price", "Fiyat"],
    ["revenue", "Gelir"],
    ["playtime", "Ortalama oynama"],
    ["score", "İnceleme skoru"],
    ["reviews", "İnceleme sayısı"],
    ["followers", "Takipçi"],
    ["wishlists", "Wishlist"],
  ];
  return `<span class="column-menu">${columns.map(([key, label]) => `<label><input type="checkbox" value="${key}" data-column-toggle checked>${label}</label>`).join("")}</span>`;
}
