export function renderAnalyticsPage(): string {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="noindex,nofollow">
  <title>Pazar Analizi · Steam Etkinlik Radarı</title>
  <style>
    :root {
      --bg:#090511;
      --panel:#150b20;
      --panel-2:#1d1129;
      --control:#100818;
      --line:#3c2949;
      --line-strong:#664071;
      --ink:#fffaf6;
      --muted:#bcaac7;
      --pink:#f33391;
      --purple:#9b2bd4;
      --blue:#71b8ff;
      --green:#69dcaa;
      --amber:#ffc857;
      --danger:#ff7196;
      --on-brand:#fffaf6;
      --on-brand-strong:#ffffff;
      --sidebar-muted:#cbb8d4;
      --sidebar-nav:#d8c9df;
      --sidebar-line:#4b325a;
      --sidebar-label:#8f789b;
      --overlay-end:#100817;
      --transparent:transparent;
      --shadow:rgba(0,0,0,.32);
      --glow:rgba(243,51,145,.14);
      --sidebar:linear-gradient(180deg,#12071c,#0b0612);
      --brand:linear-gradient(110deg,var(--purple),var(--pink));
    }
    @media (prefers-color-scheme:light) {
      :root {
        --bg:#fbf7fd;
        --panel:#ffffff;
        --panel-2:#f5edf8;
        --control:#ffffff;
        --line:#dfd0e5;
        --line-strong:#b698c1;
        --ink:#23162b;
        --muted:#705f78;
        --shadow:rgba(53,26,66,.14);
        --glow:rgba(243,51,145,.09);
        --sidebar:linear-gradient(180deg,#23122e,#12091a);
      }
    }
    * { box-sizing:border-box; }
    html { min-width:320px; background:var(--bg); color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    body { margin:0; background:radial-gradient(circle at 88% 0,var(--glow),var(--transparent) 32rem),var(--bg); }
    button,input,select { font:inherit; }
    button,a,input,select { -webkit-tap-highlight-color:var(--transparent); }
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible { outline:3px solid var(--pink); outline-offset:2px; }
    [hidden] { display:none !important; }
    .app { min-height:100vh; }
    .sidebar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:8px; width:100%; padding:10px; overflow-x:auto; color:var(--on-brand); background:var(--sidebar); box-shadow:0 8px 26px var(--shadow); scrollbar-width:thin; }
    .brand { display:flex; align-items:center; flex:0 0 auto; gap:9px; min-width:max-content; margin-right:5px; color:var(--on-brand); text-decoration:none; }
    .brand-mark { display:grid; width:38px; height:38px; place-items:center; border-radius:11px; background:var(--brand); font-weight:950; }
    .brand-copy strong,.brand-copy small { display:block; }
    .brand-copy strong { font-size:12px; }
    .brand-copy small { margin-top:2px; color:var(--sidebar-muted); font-size:8px; }
    .nav-label { display:none; }
    .nav { display:flex; gap:6px; }
    .nav button { flex:0 0 auto; min-height:42px; padding:9px 12px; border:1px solid var(--sidebar-line); border-radius:11px; color:var(--sidebar-nav); background:transparent; cursor:pointer; font-size:10px; font-weight:850; white-space:nowrap; }
    .nav button.active { color:var(--on-brand-strong); border-color:transparent; background:var(--brand); }
    .sidebar-foot { display:flex; margin-left:auto; }
    .sidebar-foot a { display:flex; align-items:center; min-height:42px; padding:9px 12px; border:1px solid var(--sidebar-line); border-radius:11px; color:var(--on-brand-strong); text-decoration:none; font-size:10px; font-weight:850; white-space:nowrap; }
    .main { width:min(100%,1440px); margin:0 auto; padding:18px 12px 54px; }
    .page-head { display:flex; align-items:flex-start; flex-direction:column; gap:10px; margin-bottom:18px; }
    .eyebrow { margin:0 0 6px; color:var(--pink); font-size:10px; font-weight:900; letter-spacing:.13em; text-transform:uppercase; }
    h1 { margin:0; font-size:clamp(28px,8vw,48px); letter-spacing:-.045em; }
    .page-head p { max-width:760px; margin:8px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }
    .source-badge { display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:7px 10px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:var(--panel); font-size:9px; font-weight:800; }
    .source-badge::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--green); }
    .view { display:grid; gap:14px; }
    .card { min-width:0; padding:15px; border:1px solid var(--line); border-radius:17px; background:var(--panel); box-shadow:0 12px 36px var(--shadow); }
    .card h2,.card h3 { margin:0; }
    .card h2 { font-size:20px; }
    .card h3 { font-size:15px; }
    .card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:13px; }
    .card-head p { margin:5px 0 0; color:var(--muted); font-size:10px; line-height:1.45; }
    .metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .metric { min-width:0; padding:13px; border:1px solid var(--line); border-radius:13px; background:var(--panel-2); }
    .metric strong,.metric span { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .metric strong { font-size:clamp(19px,6vw,28px); }
    .metric span { margin-top:5px; color:var(--muted); font-size:9px; font-weight:800; text-transform:uppercase; }
    .filters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    .filters label { display:grid; gap:5px; min-width:0; color:var(--muted); font-size:9px; font-weight:800; }
    .filters .wide { grid-column:1 / -1; }
    input,select { width:100%; min-width:0; min-height:42px; padding:9px 10px; border:1px solid var(--line); border-radius:10px; color:var(--ink); background:var(--control); }
    .actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; grid-column:1 / -1; }
    button { min-height:40px; padding:8px 12px; border:1px solid var(--line); border-radius:10px; color:var(--ink); background:var(--panel-2); cursor:pointer; font-weight:800; }
    button.primary { color:var(--on-brand-strong); border-color:transparent; background:var(--brand); }
    button:disabled { cursor:not-allowed; opacity:.5; }
    .status { min-height:1.5em; color:var(--muted); font-size:10px; }
    .status.error { color:var(--danger); }
    .table-wrap { width:100%; overflow:auto; border:1px solid var(--line); border-radius:14px; scrollbar-color:var(--pink) var(--panel-2); }
    table { width:100%; min-width:840px; border-collapse:collapse; background:var(--panel); }
    th,td { padding:10px; border-right:1px solid var(--line); border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:10px; }
    th:last-child,td:last-child { border-right:0; }
    tbody tr:last-child td { border-bottom:0; }
    thead th { position:sticky; top:0; z-index:2; color:var(--muted); background:var(--panel-2); font-size:9px; text-transform:uppercase; }
    td strong,td small { display:block; }
    td small { margin-top:3px; color:var(--muted); }
    .game-name { display:grid; grid-template-columns:34px minmax(120px,1fr); align-items:center; gap:8px; min-width:170px; }
    .game-name img { width:34px; aspect-ratio:2/3; object-fit:cover; border-radius:5px; background:var(--panel-2); }
    .game-name a { color:var(--ink); font-weight:850; text-decoration:none; }
    .game-name a:hover { color:var(--pink); }
    .tag-list { display:flex; flex-wrap:wrap; gap:4px; max-width:260px; }
    .tag { padding:3px 6px; border-radius:999px; color:var(--muted); background:var(--panel-2); font-size:8px; }
    .pagination { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:10px; }
    .pagination span { color:var(--muted); font-size:10px; }
    .charts { display:grid; grid-template-columns:1fr; gap:10px; }
    .chart { padding:13px; border:1px solid var(--line); border-radius:13px; background:var(--panel-2); }
    .chart h3 { margin-bottom:10px; }
    .bar-row { display:grid; grid-template-columns:minmax(80px,1fr) 2fr auto; align-items:center; gap:8px; margin-top:7px; color:var(--muted); font-size:9px; }
    .bar-track { height:8px; overflow:hidden; border-radius:999px; background:var(--control); }
    .bar-fill { height:100%; border-radius:inherit; background:var(--brand); }
    .empty { padding:24px; border:1px dashed var(--line); border-radius:14px; color:var(--muted); text-align:center; font-size:11px; line-height:1.6; }
    .loading { position:relative; overflow:hidden; min-height:100px; }
    .loading::after { content:""; position:absolute; inset:0; background:linear-gradient(100deg,var(--transparent),var(--glow),var(--transparent)); animation:loading 1.2s infinite; }
    .notice { padding:11px 12px; border-left:3px solid var(--amber); border-radius:9px; color:var(--muted); background:var(--panel-2); font-size:10px; line-height:1.55; }
    .home-games { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(190px,75%); gap:10px; overflow-x:auto; scroll-snap-type:inline mandatory; }
    .home-game { position:relative; min-height:290px; overflow:hidden; scroll-snap-align:start; border:1px solid var(--line); border-radius:15px; background:var(--panel-2); }
    .home-game img { width:100%; aspect-ratio:2/3; object-fit:cover; }
    .home-game-copy { position:absolute; inset:auto 0 0; padding:42px 12px 12px; color:var(--on-brand-strong); background:linear-gradient(transparent,var(--overlay-end) 56%); }
    .home-game-copy strong,.home-game-copy span { display:block; }
    .home-game-copy span { margin-top:5px; color:var(--sidebar-nav); font-size:9px; }
    @keyframes loading { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
    @media (min-width:760px) {
      .app { display:grid; grid-template-columns:238px minmax(0,1fr); }
      .sidebar { position:sticky; top:0; align-self:start; display:flex; flex-direction:column; align-items:stretch; width:238px; height:100vh; padding:20px 14px; overflow-y:auto; overflow-x:hidden; box-shadow:8px 0 30px var(--shadow); }
      .brand { margin:0 0 22px; }
      .nav-label { display:block; margin:9px 9px 6px; color:var(--sidebar-label); font-size:8px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
      .nav { display:grid; gap:5px; }
      .nav button { width:100%; min-height:44px; text-align:left; }
      .sidebar-foot { width:100%; margin:auto 0 0; }
      .sidebar-foot a { width:100%; justify-content:center; }
      .main { padding:28px 24px 64px; }
      .page-head { align-items:center; flex-direction:row; justify-content:space-between; }
      .metrics { grid-template-columns:repeat(4,minmax(0,1fr)); }
      .filters { grid-template-columns:repeat(4,minmax(0,1fr)); }
      .filters .wide { grid-column:span 2; }
      .charts { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .home-games { grid-auto-flow:initial; grid-template-columns:repeat(4,minmax(0,1fr)); overflow:visible; }
    }
    @media (min-width:1180px) {
      .main { padding-inline:34px; }
      .filters { grid-template-columns:repeat(6,minmax(0,1fr)); }
      .home-games { grid-template-columns:repeat(5,minmax(0,1fr)); }
    }
    @media (prefers-reduced-motion:reduce) { .loading::after { animation:none; } }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar" aria-label="Pazar analizi menüsü">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">S</span>
        <span class="brand-copy"><strong>Steam Radar</strong><small>Joygame Select Analytics</small></span>
      </a>
      <span class="nav-label">Pazar analizi</span>
      <nav class="nav">
        <button class="active" type="button" data-route="home">⌂ Ana Sayfa</button>
        <button type="button" data-route="steam-analytics">◫ Steam Analitiği</button>
        <button type="button" data-route="games">▦ Oyunlar</button>
        <button type="button" data-route="publishers">◎ Yayıncılar</button>
        <button type="button" data-route="genres-tags">◇ Türler & Etiketler</button>
        <button type="button" data-route="years">↗ Yıllar</button>
      </nav>
      <div class="sidebar-foot"><a href="/">← Etkinlik Radarı</a></div>
    </aside>

    <main class="main">
      <header class="page-head">
        <div><p class="eyebrow">Steam pazar istihbaratı</p><h1 data-page-title tabindex="-1">Pazar Ana Sayfası</h1><p data-page-description>Steam pazarını tahmini satış, gelir, wishlist ve performans verileriyle inceleyin.</p></div>
        <span class="source-badge">Gamalytic API · tahmini veri</span>
      </header>

      <section class="view" data-view="home">
        <div class="metrics" data-home-metrics></div>
        <article class="card">
          <div class="card-head"><div><h2>Öne çıkan yeni oyunlar</h2><p>Son 90 günde çıkan ve tahmini gelire göre öne çıkan Steam oyunları.</p></div></div>
          <div class="home-games" data-home-games></div>
          <div class="status" data-home-status role="status" aria-live="polite"></div>
        </article>
        <p class="notice">Satış, gelir ve wishlist değerleri Gamalytic tahminidir; Valve veya Steamworks finansal raporu değildir.</p>
      </section>

      <section class="view" data-view="steam-analytics" hidden>
        <article class="card">
          <div class="card-head"><div><h2>Steam Analitiği</h2><p>Fiyat, tür, etiket, çıkış ve performans aralıklarıyla pazarı filtreleyin.</p></div></div>
          ${filterForm("analytics", false, false)}
        </article>
        <div class="metrics" data-analytics-metrics></div>
        <div class="charts" data-analytics-charts></div>
        <article class="card"><div class="card-head"><h2>Filtrelenmiş oyunlar</h2></div><div data-analytics-games></div></article>
      </section>

      <section class="view" data-view="games" hidden>
        <article class="card">
          <div class="card-head"><div><h2>Oyunlar Listesi</h2><p>Sonuçları filtreleyin, sıralayın ve CSV olarak dışa aktarın.</p></div><button type="button" data-export-games>Bu sayfayı CSV indir</button></div>
          ${filterForm("games", true)}
        </article>
        <article class="card"><div class="card-head"><div><h2 data-games-count>Oyunlar</h2><p>Tablo yatay kaydırılabilir.</p></div></div><div data-games-table></div><div class="pagination"><button type="button" data-page-prev>← Önceki</button><span data-page-label>Sayfa 1</span><button type="button" data-page-next>Sonraki →</button></div></article>
      </section>

      <section class="view" data-view="publishers" hidden>
        <article class="card">
          <div class="card-head"><div><h2>Yayıncılar Listesi</h2><p>Aktif Steam yayıncılarını portföy ve tahmini performanslarıyla inceleyin.</p></div></div>
          <form class="filters" data-publisher-form>
            <label class="wide">Bu sayfada yayıncı ara<input type="search" name="name" placeholder="Yayıncı ara…"></label>
            <label>Min. toplam gelir<input type="number" min="0" name="revenueMin"></label>
            <label>Min. oyun<input type="number" min="0" name="gamesMin"></label>
            <label>Yayıncı sınıfı<input type="text" name="class" placeholder="Indie, AA…"></label>
            <div class="actions"><button class="primary" type="submit">Filtrele</button><button type="reset">Temizle</button></div>
          </form>
        </article>
        <article class="card"><div data-publishers-table></div><div class="pagination"><button type="button" data-publisher-prev>← Önceki</button><span data-publisher-page>Sayfa 1</span><button type="button" data-publisher-next>Sonraki →</button></div></article>
      </section>

      <section class="view" data-view="genres-tags" hidden>
        <article class="card"><div class="card-head"><div><h2>Türler & Etiketler</h2><p>Pazar büyüklüğünü, rekabeti ve gelir performansını kategori bazında karşılaştırın.</p></div><select data-group-key aria-label="Gruplama türü"><option value="genres">Ana türler</option><option value="tags">Steam etiketleri</option></select></div><div data-groups-table></div></article>
      </section>

      <section class="view" data-view="years" hidden>
        <article class="card"><div class="card-head"><div><h2>Yıllara Göre Steam</h2><p>Oyun sayısı, gelir ve fiyat eğilimlerini yıllara göre görün.</p></div></div><div data-years-chart></div><div data-years-table></div></article>
      </section>
    </main>
  </div>
  <script>
    const routes = {
      home:["Pazar Ana Sayfası","Steam pazarını tahmini satış, gelir, wishlist ve performans verileriyle inceleyin."],
      "steam-analytics":["Steam Analitiği","Gelişmiş filtrelerle pazar büyüklüğünü ve performans dağılımlarını analiz edin."],
      games:["Oyunlar Listesi","Steam oyunlarını satış, gelir, inceleme ve kategori verileriyle tarayın."],
      publishers:["Yayıncılar Listesi","Steam yayıncılarını portföy büyüklüğü ve tahmini ticari performanslarıyla karşılaştırın."],
      "genres-tags":["Türler & Etiketler","Tür ve etiketlerde arz, rekabet ve tahmini gelir fırsatlarını görün."],
      years:["Yıllar","Steam pazarının yıllar içindeki değişimini karşılaştırın."],
    };
    const views = [...document.querySelectorAll("[data-view]")];
    const navButtons = [...document.querySelectorAll("[data-route]")];
    let currentRoute = location.hash.slice(1);
    if (!routes[currentRoute]) currentRoute = "home";
    let gamesPage = 0;
    let publisherPage = 0;
    let lastGames = [];
    let publisherPayload = null;

    function setRoute(route, updateHash) {
      currentRoute = routes[route] ? route : "home";
      views.forEach((view) => { view.hidden = view.dataset.view !== currentRoute; });
      navButtons.forEach((button) => {
        const active = button.dataset.route === currentRoute;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      const pageTitle = document.querySelector("[data-page-title]");
      pageTitle.textContent = routes[currentRoute][0];
      document.querySelector("[data-page-description]").textContent = routes[currentRoute][1];
      if (updateHash) { history.replaceState(null,"",location.pathname + "#" + currentRoute); pageTitle.focus(); }
      loadRoute(currentRoute);
    }

    navButtons.forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route,true)));
    window.addEventListener("hashchange", () => setRoute(location.hash.slice(1),false));

    function numeric(value) {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    function number(value) {
      const parsed = numeric(value);
      return parsed === null ? "—" : new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(parsed);
    }
    function money(value) {
      const parsed = numeric(value);
      return parsed === null ? "—" : new Intl.NumberFormat("tr-TR",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(parsed);
    }
    function date(value) {
      const numeric = Number(value);
      const parsed = numeric > 0 ? new Date(numeric) : new Date(value);
      return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",year:"numeric"}).format(parsed);
    }
    function list(payload) {
      if (Array.isArray(payload)) return payload;
      for (const key of ["result","results","items","data"]) if (Array.isArray(payload?.[key])) return payload[key];
      return [];
    }
    function errorMessage(error) {
      if (error.message === "gamalytic_not_configured") return "Gamalytic API anahtarı henüz Worker secret olarak tanımlanmamış.";
      if (error.message === "gamalytic_plan_or_key_denied") return "API anahtarı veya Gamalytic planı bu veriye erişemiyor.";
      if (error.message === "gamalytic_rate_limited") return "Gamalytic istek kotası doldu. Biraz sonra tekrar deneyin.";
      return "Gamalytic verisi şu anda alınamadı.";
    }
    async function api(resource, params) {
      const url = new URL("/api/gamalytic/" + resource,location.origin);
      if (params) Object.entries(params).forEach(([key,value]) => { if (value !== "" && value !== null && value !== undefined) url.searchParams.set(key,String(value)); });
      const response = await fetch(url,{headers:{accept:"application/json"}});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "request_failed");
      return payload;
    }
    function metric(value,label) {
      const card = document.createElement("div"); card.className="metric";
      const strong=document.createElement("strong"); strong.textContent=value;
      const span=document.createElement("span"); span.textContent=label;
      card.append(strong,span); return card;
    }
    function empty(message,isError) {
      const box=document.createElement("div"); box.className="empty" + (isError ? " status error" : ""); box.textContent=message; return box;
    }
    function loading(container) { container.replaceChildren(empty("Veriler yükleniyor…")); container.firstElementChild.classList.add("loading"); }
    function capsule(appId,name) {
      const image=document.createElement("img"); image.loading="lazy"; image.alt=name + " kapak görseli"; image.src="https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/" + appId + "/library_600x900.jpg"; image.addEventListener("error",()=>image.hidden=true); return image;
    }
    function tags(items) {
      const box=document.createElement("div"); box.className="tag-list";
      (Array.isArray(items)?items:[]).slice(0,4).forEach((item)=>{ const tag=document.createElement("span"); tag.className="tag"; tag.textContent=String(item); box.append(tag); });
      return box;
    }
    function td(value) { const cell=document.createElement("td"); cell.textContent=value; return cell; }
    function gameTable(items) {
      if (!items.length) return empty("Bu filtrelerle eşleşen oyun bulunamadı.");
      const wrap=document.createElement("div"); wrap.className="table-wrap"; wrap.tabIndex=0; wrap.setAttribute("aria-label","Oyun listesi; yatay kaydırılabilir");
      const table=document.createElement("table");
      const head=document.createElement("thead"); const header=document.createElement("tr");
      ["Oyun","Çıkış","Fiyat","Satış*","Gelir*","Wishlist*","İnceleme","Skor","Yayıncı","Tür / etiket"].forEach((label)=>{ const th=document.createElement("th"); th.textContent=label; header.append(th); });
      head.append(header); const body=document.createElement("tbody");
      items.forEach((game)=>{
        const row=document.createElement("tr"); const nameCell=document.createElement("td"); const nameBox=document.createElement("div"); nameBox.className="game-name";
        nameBox.append(capsule(game.steamId,game.name || "Steam oyunu")); const copy=document.createElement("div"); const link=document.createElement("a"); link.href="https://store.steampowered.com/app/" + game.steamId; link.target="_blank"; link.rel="noreferrer"; link.textContent=game.name || "İsimsiz oyun"; const app=document.createElement("small"); app.textContent="Steam " + (game.steamId || "—"); copy.append(link,app); nameBox.append(copy); nameCell.append(nameBox); row.append(nameCell);
        row.append(td(date(game.firstReleaseDate || game.releaseDate)),td(game.price === 0 ? "Ücretsiz" : money(game.price)),td(number(game.copiesSold)),td(money(game.totalRevenue || game.revenue)),td(number(game.wishlists)),td(number(game.reviews)),td(number(game.reviewScore)),td((game.publishers || []).join(", ") || "—"));
        const tagCell=document.createElement("td"); tagCell.append(tags([...(game.genres || []),...(game.tags || [])])); row.append(tagCell); body.append(row);
      });
      table.append(head,body); wrap.append(table); return wrap;
    }
    function formParams(form,forList) {
      const data=new FormData(form); const params={};
      for (const [key,value] of data.entries()) {
        if (!String(value).trim()) continue;
        if (key === "first_release_date_min" || key === "first_release_date_max") params[key]=new Date(String(value) + "T00:00:00Z").getTime();
        else if (key !== "release_status" || forList) params[key]=String(value).trim();
      }
      return params;
    }
    function renderDistribution(container,title,data,preserveOrder) {
      if (!data || typeof data !== "object") return;
      let entries=Object.entries(data).filter(([,value])=>Number.isFinite(Number(value)));
      entries=preserveOrder ? entries.slice(-12) : entries.sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,12);
      if (!entries.length) return;
      const max=Math.max(...entries.map(([,value])=>Number(value)),1); const chart=document.createElement("div"); chart.className="chart"; const heading=document.createElement("h3"); heading.textContent=title; chart.append(heading);
      entries.forEach(([label,value])=>{ const row=document.createElement("div"); row.className="bar-row"; const name=document.createElement("span"); name.textContent=label; const track=document.createElement("div"); track.className="bar-track"; const fill=document.createElement("div"); fill.className="bar-fill"; fill.style.width=Math.max(2,Number(value)/max*100) + "%"; track.append(fill); const count=document.createElement("strong"); count.textContent=number(value); row.append(name,track,count); chart.append(row); }); container.append(chart);
    }
    async function loadHome() {
      const metrics=document.querySelector("[data-home-metrics]"); const gamesBox=document.querySelector("[data-home-games]"); const status=document.querySelector("[data-home-status]"); loading(metrics); loading(gamesBox); status.textContent="";
      try {
        const since=Date.now()-90*86400000; const [stats,gamesPayload]=await Promise.all([api("stats"),api("games",{limit:20,sort:"revenue",sort_mode:"desc",release_status:"released",first_release_date_min:since})]); const games=list(gamesPayload); metrics.replaceChildren(metric(number(stats.numberOfGames || stats.globalStats?.gamesInDatabase),"İzlenen oyun"),metric(money(stats.totalRevenue || stats.globalStats?.totalRevenue),"Toplam tahmini gelir"),metric(money(stats.averageRevenue),"Ortalama gelir"),metric(number(stats.averagePrice),"Ortalama fiyat ($)")); gamesBox.replaceChildren(); games.slice(0,10).forEach((game)=>{ const card=document.createElement("article"); card.className="home-game"; card.append(capsule(game.steamId,game.name)); const copy=document.createElement("div"); copy.className="home-game-copy"; const strong=document.createElement("strong"); strong.textContent=game.name || "Steam oyunu"; const meta=document.createElement("span"); meta.textContent=date(game.firstReleaseDate || game.releaseDate) + " · " + money(game.totalRevenue || game.revenue); copy.append(strong,meta); card.append(copy); gamesBox.append(card); }); if(!games.length) gamesBox.append(empty("Yeni oyun verisi bulunamadı.")); status.textContent="Son API güncellemesi: " + date(stats.globalStats?.lastUpdated || Date.now());
      } catch(error) { metrics.replaceChildren(empty(errorMessage(error),true)); gamesBox.replaceChildren(); }
    }
    async function runAnalytics() {
      const form=document.querySelector('[data-filter-form="analytics"]'); const params=formParams(form,false); const metrics=document.querySelector("[data-analytics-metrics]"); const charts=document.querySelector("[data-analytics-charts]"); const gamesBox=document.querySelector("[data-analytics-games]"); loading(metrics); loading(charts); loading(gamesBox);
      try { const [stats,gamesPayload]=await Promise.all([api("stats",params),api("games",{...params,limit:50,sort:"revenue",sort_mode:"desc"})]); const games=list(gamesPayload); metrics.replaceChildren(metric(number(stats.numberOfGames),"Eşleşen oyun"),metric(money(stats.totalRevenue),"Toplam tahmini gelir"),metric(money(stats.averageRevenue),"Ortalama gelir"),metric(number(stats.averagePlaytime),"Ort. oynama süresi")); charts.replaceChildren(); renderDistribution(charts,"Gelir dağılımı",stats.revenueDistribution); renderDistribution(charts,"Fiyat dağılımı",stats.priceDistribution); renderDistribution(charts,"Satış dağılımı",stats.salesDistribution); renderDistribution(charts,"İnceleme dağılımı",stats.reviewsDistribution); if(!charts.children.length) charts.append(empty("Dağılım verisi bu API planında sunulmuyor.")); gamesBox.replaceChildren(gameTable(games)); } catch(error) { metrics.replaceChildren(empty(errorMessage(error),true)); charts.replaceChildren(); gamesBox.replaceChildren(); }
    }
    async function loadGames() {
      const form=document.querySelector('[data-filter-form="games"]'); const container=document.querySelector("[data-games-table]"); loading(container);
      try { const payload=await api("games",{...formParams(form,true),page:gamesPage,limit:50}); lastGames=list(payload); container.replaceChildren(gameTable(lastGames)); document.querySelector("[data-games-count]").textContent=number(payload.total || lastGames.length) + " oyun"; document.querySelector("[data-page-label]").textContent="Sayfa " + (gamesPage+1) + " / " + number(payload.pages || 1); document.querySelector("[data-page-prev]").disabled=gamesPage<=0; document.querySelector("[data-page-next]").disabled=payload.pages ? gamesPage>=payload.pages-1 : !payload.next; } catch(error) { container.replaceChildren(empty(errorMessage(error),true)); }
    }
    function publisherTable(items) {
      if(!items.length) return empty("Bu sayfada yayıncı bulunamadı."); const wrap=document.createElement("div"); wrap.className="table-wrap"; wrap.tabIndex=0; wrap.setAttribute("aria-label","Yayıncı listesi; yatay kaydırılabilir"); const table=document.createElement("table"); const head=document.createElement("thead"); const hr=document.createElement("tr"); ["Yayıncı","Sınıf","Oyun","Toplam gelir*","Ort. gelir*","Medyan gelir*","İlk oyun","Son oyun","Öne çıkan türler"].forEach((label)=>{const th=document.createElement("th");th.textContent=label;hr.append(th);}); head.append(hr); const body=document.createElement("tbody"); items.forEach((publisher)=>{const row=document.createElement("tr");row.append(td(publisher.name||"—"),td(publisher.class||"—"),td(number(publisher.numberOfGames)),td(money(publisher.totalRevenue)),td(money(publisher.averageRevenue)),td(money(publisher.medianRevenue)),td(date(publisher.firstGameDate)),td(date(publisher.lastGameDate)));const genres=document.createElement("td");genres.append(tags(Object.entries(publisher.genres||{}).sort((a,b)=>Number(b[1])-Number(a[1])).map(([name])=>name)));row.append(genres);body.append(row);}); table.append(head,body);wrap.append(table);return wrap;
    }
    async function loadPublishers(force) {
      const container=document.querySelector("[data-publishers-table]"); loading(container);
      try { if(!publisherPayload||force) publisherPayload=await api("publishers",{page:publisherPage,limit:100,fields:"id,name,class,numberOfGames,totalRevenue,averageRevenue,medianRevenue,firstGameDate,lastGameDate,inHouse,genres"}); let items=list(publisherPayload); const data=new FormData(document.querySelector("[data-publisher-form]")); const query=String(data.get("name")||"").toLocaleLowerCase("tr"); const revenue=Number(data.get("revenueMin")||0); const games=Number(data.get("gamesMin")||0); const publisherClass=String(data.get("class")||"").toLocaleLowerCase("tr"); items=items.filter((item)=>(!query||String(item.name||"").toLocaleLowerCase("tr").includes(query))&&Number(item.totalRevenue||0)>=revenue&&Number(item.numberOfGames||0)>=games&&(!publisherClass||String(item.class||"").toLocaleLowerCase("tr").includes(publisherClass))); container.replaceChildren(publisherTable(items)); const pages=Number(publisherPayload.pages||1); document.querySelector("[data-publisher-page]").textContent="Sayfa " + (publisherPage+1) + " / " + number(pages); document.querySelector("[data-publisher-prev]").disabled=publisherPage<=0; document.querySelector("[data-publisher-next]").disabled=pages ? publisherPage>=pages-1 : !publisherPayload.next; } catch(error) { container.replaceChildren(empty(errorMessage(error),true)); }
    }
    function groupTable(items,labelTitle) {
      if(!items.length) return empty("Gruplandırılmış veri bulunamadı."); const wrap=document.createElement("div");wrap.className="table-wrap";wrap.tabIndex=0;wrap.setAttribute("aria-label",labelTitle + " analizi; yatay kaydırılabilir");const table=document.createElement("table");const head=document.createElement("thead");const hr=document.createElement("tr");[labelTitle,"Oyun","Toplam gelir*","Ort. gelir*","Medyan gelir*","Ort. fiyat","Ort. oynama","Top %5 eşiği*"].forEach((label)=>{const th=document.createElement("th");th.textContent=label;hr.append(th);});head.append(hr);const body=document.createElement("tbody");items.forEach((item)=>{const row=document.createElement("tr");row.append(td(String(item.label??item.id??"—")),td(number(item.numberOfGames)),td(money(item.totalRevenue)),td(money(item.averageRevenue)),td(money(item.medianRevenue)),td(money(item.averagePrice)),td(number(item.averagePlayTime)),td(money(item.top5)));body.append(row);});table.append(head,body);wrap.append(table);return wrap;
    }
    async function loadGroups() { const key=document.querySelector("[data-group-key]").value; const container=document.querySelector("[data-groups-table]"); loading(container); try { const payload=await api("groups",key==="tags"?{key,n_tags:20}:{key}); container.replaceChildren(groupTable(list(payload),key==="tags"?"Etiket":"Tür")); } catch(error) { container.replaceChildren(empty(errorMessage(error),true)); } }
    async function loadYears() { const chart=document.querySelector("[data-years-chart]");const table=document.querySelector("[data-years-table]");loading(chart);loading(table);try{const items=list(await api("groups",{key:"releaseDate"})).filter((item)=>/^\\d{4}$/.test(String(item.label))).sort((a,b)=>Number(a.label)-Number(b.label));chart.replaceChildren();renderDistribution(chart,"Yıllara göre oyun sayısı",Object.fromEntries(items.map((item)=>[item.label,item.numberOfGames])),true);table.replaceChildren(groupTable(items,"Yıl"));}catch(error){chart.replaceChildren(empty(errorMessage(error),true));table.replaceChildren();}}
    function loadRoute(route) { if(route==="home") loadHome(); else if(route==="steam-analytics") runAnalytics(); else if(route==="games") loadGames(); else if(route==="publishers") loadPublishers(false); else if(route==="genres-tags") loadGroups(); else if(route==="years") loadYears(); }
    document.querySelectorAll("[data-filter-form]").forEach((form)=>{ form.addEventListener("submit",(event)=>{event.preventDefault();if(form.dataset.filterForm==="analytics")runAnalytics();else{gamesPage=0;loadGames();}}); form.addEventListener("reset",()=>setTimeout(()=>{if(form.dataset.filterForm==="analytics")runAnalytics();else{gamesPage=0;loadGames();}},0)); });
    document.querySelector("[data-publisher-form]").addEventListener("submit",(event)=>{event.preventDefault();loadPublishers(false);});document.querySelector("[data-publisher-form]").addEventListener("reset",()=>setTimeout(()=>loadPublishers(false),0));
    document.querySelector("[data-publisher-prev]").addEventListener("click",()=>{if(publisherPage>0){publisherPage--;publisherPayload=null;loadPublishers(true);}});document.querySelector("[data-publisher-next]").addEventListener("click",()=>{publisherPage++;publisherPayload=null;loadPublishers(true);});
    document.querySelector("[data-group-key]").addEventListener("change",loadGroups);
    document.querySelector("[data-page-prev]").addEventListener("click",()=>{if(gamesPage>0){gamesPage--;loadGames();}}); document.querySelector("[data-page-next]").addEventListener("click",()=>{gamesPage++;loadGames();});
    document.querySelector("[data-export-games]").addEventListener("click",()=>{if(!lastGames.length)return;const columns=["steamId","name","price","copiesSold","totalRevenue","wishlists","reviews","reviewScore","firstReleaseDate"];const csv=[columns.join(","),...lastGames.map((game)=>columns.map((key)=>'"'+String(game[key]??"").replaceAll('"','""')+'"').join(","))].join("\\r\\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="steam-oyunlari.csv";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});
    setRoute(currentRoute,false);
  </script>
</body>
</html>`;
}

function filterForm(
  name: string,
  includeSort = false,
  includeReleaseStatus = true,
): string {
  return `<form class="filters" data-filter-form="${name}">
    <label class="wide">Oyun adı<input type="search" name="title" placeholder="Steam oyun adı…"></label>
    ${includeReleaseStatus ? `<label>Yayın durumu<select name="release_status"><option value="released">Yayınlandı</option><option value="all">Tümü</option><option value="unreleased">Yakında</option><option value="early_access">Erken erişim</option><option value="full_release">Tam sürüm</option></select></label>` : ""}
    <label>Türler<input type="text" name="genres" placeholder="Action, RPG"></label>
    <label>Etiketler<input type="text" name="tags" placeholder="Co-op, Strategy"></label>
    <label>Hariç etiketler<input type="text" name="tags_exclude" placeholder="Horror"></label>
    <label>Min. fiyat ($)<input type="number" min="0" step="1" name="price_min"></label>
    <label>Maks. fiyat ($)<input type="number" min="0" step="1" name="price_max"></label>
    <label>İlk çıkış sonrası<input type="date" name="first_release_date_min"></label>
    <label>İlk çıkış öncesi<input type="date" name="first_release_date_max"></label>
    <label>Min. gelir ($)<input type="number" min="0" name="revenue_min"></label>
    <label>Min. satış<input type="number" min="0" name="sold_min"></label>
    <label>Min. wishlist<input type="number" min="0" name="wishlists_min"></label>
    <label>Min. inceleme<input type="number" min="0" name="reviews_min"></label>
    <label>Min. skor<input type="number" min="0" max="100" name="score_min"></label>
    ${includeSort ? `<label>Sıralama<select name="sort"><option value="revenue">Gelir</option><option value="id">Steam ID</option><option value="reviews">İnceleme</option><option value="copiesSold">Satış</option><option value="wishlists">Wishlist</option></select></label><label>Yön<select name="sort_mode"><option value="desc">Azalan</option><option value="asc">Artan</option></select></label>` : ""}
    <div class="actions"><button class="primary" type="submit">Filtreleri uygula</button><button type="reset">Temizle</button></div>
  </form>`;
}
