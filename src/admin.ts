import { renderSteamRadarLogo } from "./app-shell.js";

export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="robots" content="noindex,nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&amp;display=swap" rel="stylesheet">
  <title>Yönetim · Steam Etkinlik Radarı</title>
  <style>
    :root {
      --bg:#08040f;
      --panel:#13091e;
      --soft:#1c1028;
      --control:#0f0718;
      --line:#392546;
      --ink:#fffaf5;
      --muted:#bca9c8;
      --pink:#f33391;
      --purple:#9823d7;
      --danger:#ff6c93;
      --success:#6fe3af;
      --amber:#f6b94a;
      --shadow:0 24px 70px rgba(0,0,0,.34);
      --gradient:linear-gradient(110deg,var(--purple),var(--pink));
    }
    * { box-sizing:border-box; }
    html { background:var(--bg); color:var(--ink); font-family:"Space Grotesk",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    body { margin:0; min-width:320px; background:
      radial-gradient(circle at 8% -5%,rgba(152,35,215,.18),transparent 34rem),
      radial-gradient(circle at 92% 15%,rgba(243,51,145,.12),transparent 32rem),
      var(--bg);
    }
    button,input,select { font:inherit; }
    button,a { -webkit-tap-highlight-color:transparent; }
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible {
      outline:3px solid color-mix(in srgb,var(--pink) 68%,transparent);
      outline-offset:2px;
    }
    [hidden] { display:none !important; }
    .shell { width:min(1180px,calc(100% - 28px)); margin:0 auto; padding:20px 0 54px; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:24px; }
    .brand { display:flex; align-items:center; gap:11px; color:var(--ink); text-decoration:none; }
    .brand-mark { display:block; width:42px; height:42px; flex:0 0 auto; }
    .brand-mark .app-brand-logo { display:block; width:42px; height:42px; }
    .brand-mark .app-logo-stop-start { stop-color:var(--purple); }
    .brand-mark .app-logo-stop-end { stop-color:var(--pink); }
    .brand-mark .app-logo-line { stroke:var(--ink); }
    .brand-mark .app-logo-origin { fill:var(--ink); }
    .brand-mark .app-logo-target { fill:var(--amber); }
    .brand-copy strong,.brand-copy span { display:block; }
    .brand-copy strong { font-size:15px; }
    .brand-copy span { margin-top:2px; color:var(--muted); font-size:10px; }
    .back { min-height:40px; padding:10px 14px; border:1px solid var(--line); border-radius:999px; color:var(--ink); text-decoration:none; font-size:12px; font-weight:800; background:var(--panel); }
    .hero { margin-bottom:20px; padding:26px; border:1px solid var(--line); border-radius:22px; background:linear-gradient(130deg,rgba(152,35,215,.18),rgba(243,51,145,.08)); box-shadow:var(--shadow); }
    .eyebrow { margin:0 0 8px; color:var(--pink); font-size:11px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:0; font-size:clamp(28px,6vw,48px); letter-spacing:-.04em; }
    .hero p { max-width:720px; margin:10px 0 0; color:var(--muted); line-height:1.6; }
    .login { max-width:480px; margin:56px auto; padding:22px; border:1px solid var(--line); border-radius:18px; background:var(--panel); box-shadow:var(--shadow); }
    .login h2,.card h2 { margin:0 0 8px; font-size:19px; }
    .login p,.card-intro { margin:0 0 15px; color:var(--muted); font-size:12px; line-height:1.55; }
    form { margin:0; }
    .login form,.settings-form { display:grid; gap:10px; }
    input,select { width:100%; min-height:44px; padding:10px 12px; border:1px solid var(--line); border-radius:11px; color:var(--ink); background:var(--control); }
    button { min-height:42px; padding:9px 14px; border:1px solid var(--line); border-radius:11px; color:var(--ink); background:var(--soft); cursor:pointer; font-weight:800; }
    button.primary { border-color:transparent; background:var(--gradient); }
    button.danger { color:var(--danger); }
    .status { min-height:1.5em; margin-top:9px; color:var(--muted); font-size:11px; }
    .status.error { color:var(--danger); }
    .status.success { color:var(--success); }
    .toolbar { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
    .toolbar p { margin:0; color:var(--muted); font-size:11px; }
    .grid { display:grid; grid-template-columns:1fr; gap:14px; }
    .card { min-width:0; padding:18px; border:1px solid var(--line); border-radius:18px; background:var(--panel); box-shadow:var(--shadow); }
    .inline-form { display:grid; grid-template-columns:1fr; gap:8px; margin-top:14px; }
    .settings-form label { display:grid; gap:6px; color:var(--muted); font-size:11px; font-weight:800; }
    .settings-form .check { display:flex; align-items:center; gap:9px; }
    .settings-form .check input { width:18px; min-height:18px; height:18px; }
    .help { margin:0; color:var(--muted); font-size:10px; line-height:1.5; }
    .list { display:grid; gap:7px; margin-top:12px; }
    .row { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; padding:10px; border-radius:11px; background:var(--soft); font-size:11px; }
    .row span { min-width:0; overflow-wrap:anywhere; }
    .row button { min-height:34px; padding:6px 10px; flex:0 0 auto; }
    .metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .metric { min-width:0; padding:13px; border-radius:12px; background:var(--soft); }
    .metric strong,.metric span { display:block; }
    .metric strong { font-size:clamp(20px,5vw,28px); }
    .metric span { margin-top:4px; color:var(--muted); font-size:9px; }
    .activity-title { margin:18px 0 8px; font-size:14px; }
    .empty { padding:10px; color:var(--muted); font-size:11px; }
    @media (min-width:700px) {
      .shell { padding-top:28px; }
      .grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .inline-form { grid-template-columns:minmax(0,1fr) auto; }
      .recipient-form { grid-template-columns:minmax(0,1fr) 150px auto; }
      .wide { grid-column:1 / -1; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="Steam Etkinlik Radarı ana sayfasına dön">
        <span class="brand-mark">${renderSteamRadarLogo("admin-header")}</span>
        <span class="brand-copy"><strong>Steam Etkinlik Radarı</strong><span>Joygame Select</span></span>
      </a>
      <a class="back" href="/">← Panele dön</a>
    </header>

    <section class="hero">
      <p class="eyebrow">Özel yönetim alanı</p>
      <h1>Yönetim Paneli</h1>
      <p>Panel erişimlerini, günlük e-posta operasyonunu ve son 30 günlük kullanım verilerini tek ekrandan yönetin.</p>
    </section>

    <section class="login" data-login>
      <h2>Yönetici doğrulaması</h2>
      <p>Cloudflare Access oturumuna ek olarak yönetici şifrenizi girin. Şifre tarayıcıda kalıcı olarak saklanmaz.</p>
      <form data-login-form>
        <input type="password" required autocomplete="current-password" placeholder="Yönetici şifresi" aria-label="Yönetici şifresi" data-password>
        <button class="primary" type="submit">Yönetim paneline gir</button>
      </form>
      <div class="status" data-login-status role="status" aria-live="polite"></div>
    </section>

    <section data-content hidden>
      <div class="toolbar">
        <p data-session-status>Yönetici oturumu açık.</p>
        <button type="button" data-lock>Paneli kilitle</button>
      </div>
      <div class="grid">
        <article class="card">
          <h2>Uygulama erişimi</h2>
          <p class="card-intro">Bu liste Cloudflare Access girişini geçen kullanıcıların uygulama yetkisini yönetir. Kurum dışı yeni adreslerin Cloudflare Access politikasında da izinli olması gerekir.</p>
          <div class="list" data-access-rules></div>
          <form class="inline-form" data-user-form>
            <input type="email" required placeholder="kullanici@ornek.com" aria-label="Erişim verilecek e-posta" data-user-email>
            <button class="primary" type="submit">Erişim ver</button>
          </form>
          <div class="status" data-user-status role="status" aria-live="polite"></div>
          <div class="list" data-users></div>
        </article>

        <article class="card">
          <h2>Günlük e-posta alıcıları</h2>
          <p class="card-intro">Ana alıcıları ve gizli kopya alıcılarını ayrı yönetin.</p>
          <form class="inline-form recipient-form" data-recipient-form>
            <input type="email" required placeholder="alici@ornek.com" aria-label="E-posta alıcısı" data-recipient-email>
            <select data-recipient-type aria-label="Alıcı türü">
              <option value="to">Ana alıcı (To)</option>
              <option value="bcc">Gizli kopya (BCC)</option>
            </select>
            <button class="primary" type="submit">Alıcı ekle</button>
          </form>
          <div class="status" data-recipient-status role="status" aria-live="polite"></div>
          <div class="list" data-recipients></div>
        </article>

        <article class="card">
          <h2>Gönderim ayarları</h2>
          <p class="card-intro">Günlük gönderimin saatini, görünen adını ve konu şablonunu düzenleyin.</p>
          <form class="settings-form" data-email-settings-form>
            <label class="check">
              <input type="checkbox" data-email-enabled>
              <span>Günlük otomatik gönderim aktif</span>
            </label>
            <label>Gönderim saati · Europe/Istanbul
              <input type="time" required step="1800" data-email-time>
            </label>
            <label>Gönderici adı
              <input type="text" required maxlength="80" data-email-sender>
            </label>
            <label>Mail konu başlığı
              <input type="text" required maxlength="180" data-email-subject>
            </label>
            <p class="help">Kullanılabilir alanlar: {{kritik}}, {{etkinlik}}, {{tarih}}. Gönderim yarım saatlik kontrol aralığında ilk uygun çalışmada yapılır.</p>
            <button class="primary" type="submit">Mail ayarlarını kaydet</button>
            <div class="status" data-settings-status role="status" aria-live="polite"></div>
          </form>
        </article>

        <article class="card">
          <h2>Son 30 gün</h2>
          <p class="card-intro">Panel görüntülemeleri, tekil kullanıcılar ve kayıtlı etkileşimler.</p>
          <div class="metrics" data-metrics></div>
          <div class="list" data-popular></div>
          <h3 class="activity-title">Son kullanıcı hareketleri</h3>
          <div class="list" data-recent></div>
        </article>
      </div>
    </section>
  </main>
  <script>
    const login = document.querySelector("[data-login]");
    const content = document.querySelector("[data-content]");
    const passwordInput = document.querySelector("[data-password]");
    const loginStatus = document.querySelector("[data-login-status]");
    const settingsStatus = document.querySelector("[data-settings-status]");
    const userStatus = document.querySelector("[data-user-status]");
    const recipientStatus = document.querySelector("[data-recipient-status]");
    let adminPassword = "";

    function setStatus(element, message, kind) {
      element.textContent = message;
      element.className = "status" + (kind ? " " + kind : "");
    }

    function number(value) {
      return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
    }

    function row(item, collection) {
      const element = document.createElement("div");
      element.className = "row";
      const text = document.createElement("span");
      const value = item.email || item.value || "";
      const prefix =
        item.recipientType === "to" ? "TO · " :
        item.recipientType === "bcc" ? "BCC · " :
        item.type === "domain" ? "ALAN ADI · " :
        item.type === "admin" ? "YÖNETİCİ · " : "";
      text.textContent = prefix + value;
      element.append(text);
      if (!collection || item.source === "config") return element;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.dataset.remove = collection;
      remove.dataset.email = value;
      remove.textContent = "Kaldır";
      element.append(remove);
      return element;
    }

    async function request(path, options) {
      const response = await fetch(path, {
        ...options,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-admin-password": adminPassword,
          ...(options && options.headers ? options.headers : {}),
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload.error || "request_failed");
        error.status = response.status;
        throw error;
      }
      return response.json();
    }

    async function loadAdmin() {
      try {
        const payload = await request("/api/admin");
        login.hidden = true;
        content.hidden = false;
        setStatus(loginStatus, "");
        document.querySelector("[data-access-rules]").replaceChildren(
          ...(payload.accessRules || []).map((item) => row(item)),
        );
        document.querySelector("[data-users]").replaceChildren(
          ...(payload.users || []).map((item) => row(item, "users")),
        );
        const recipients = payload.recipients || [];
        document.querySelector("[data-recipients]").replaceChildren(
          ...recipients.map((item) => row(item, "recipients")),
        );
        document.querySelector("[data-email-enabled]").checked =
          payload.emailSettings?.enabled !== 0 &&
          payload.emailSettings?.enabled !== false;
        document.querySelector("[data-email-time]").value =
          payload.emailSettings?.sendTime || "09:30";
        document.querySelector("[data-email-sender]").value =
          payload.emailSettings?.senderName || "Steam Etkinlik Radarı";
        document.querySelector("[data-email-subject]").value =
          payload.emailSettings?.subjectTemplate ||
          "Steam Etkinlik Takibi · {{kritik}} kritik tarih · {{etkinlik}} etkinlik";
        const emailEnabled = payload.emailSettings?.enabled !== 0 &&
          payload.emailSettings?.enabled !== false;
        const hasPrimaryRecipient = recipients.some(
          (item) => item.enabled !== 0 && item.recipientType === "to",
        );
        setStatus(
          settingsStatus,
          emailEnabled && !hasPrimaryRecipient
            ? "Günlük gönderim aktif fakat ana alıcı (To) yok. Gönderim saatinde iş akışı hata verir."
            : payload.emailSettings?.lastSentDate
              ? "D1 ayarları bağlı · Son gönderim: " + payload.emailSettings.lastSentDate
              : "D1 ayarları bağlı · Henüz merkezi gönderim kaydı yok.",
          emailEnabled && !hasPrimaryRecipient ? "error" : "",
        );
        const metrics = [
          [payload.analytics?.pageViews || 0, "Sayfa görüntüleme"],
          [payload.analytics?.visitors || 0, "Tekil kullanıcı"],
          [payload.analytics?.events || 0, "Toplam etkileşim"],
        ];
        document.querySelector("[data-metrics]").replaceChildren(
          ...metrics.map(([value, label]) => {
            const card = document.createElement("div");
            card.className = "metric";
            const strong = document.createElement("strong");
            strong.textContent = number(value);
            const caption = document.createElement("span");
            caption.textContent = label;
            card.append(strong, caption);
            return card;
          }),
        );
        const popular = (payload.analytics?.popular || []).map((item) => {
          const element = document.createElement("div");
          element.className = "row";
          element.textContent =
            item.eventName + (item.target ? " · " + item.target : "") +
            " · " + item.count;
          return element;
        });
        if (!popular.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Henüz etkileşim kaydı yok.";
          popular.push(empty);
        }
        document.querySelector("[data-popular]").replaceChildren(...popular);
        const recent = (payload.analytics?.recent || []).map((item) => {
          const element = document.createElement("div");
          element.className = "row";
          const date = item.occurredAt
            ? new Intl.DateTimeFormat("tr-TR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(item.occurredAt))
            : "";
          element.textContent =
            (item.userEmail || "anonim") + " · " +
            item.eventName + (item.target ? " · " + item.target : "") +
            (date ? " · " + date : "");
          return element;
        });
        if (!recent.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Henüz kullanıcı hareketi yok.";
          recent.push(empty);
        }
        document.querySelector("[data-recent]").replaceChildren(...recent);
        return true;
      } catch (error) {
        content.hidden = true;
        login.hidden = false;
        setStatus(
          loginStatus,
          error.message === "admin_password_not_configured"
            ? "Yönetici şifresi henüz Worker secret olarak tanımlanmamış."
            : error.status === 403
              ? "Bu hesap yönetim paneline yetkili değil."
              : "Yönetici şifresi hatalı.",
          "error",
        );
        return false;
      }
    }

    async function updateCollection(collection, email, method, recipientType) {
      const suffix = method === "DELETE"
        ? "?email=" + encodeURIComponent(email)
        : "";
      const result = await request("/api/admin/" + collection + suffix, {
        method,
        body: method === "POST"
          ? JSON.stringify({ email, recipientType: recipientType || "bcc" })
          : undefined,
      });
      await loadAdmin();
      return result;
    }

    document.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      adminPassword = passwordInput.value;
      setStatus(loginStatus, "Doğrulanıyor…");
      const success = await loadAdmin();
      if (success) passwordInput.value = "";
    });

    document.querySelector("[data-lock]").addEventListener("click", () => {
      adminPassword = "";
      content.hidden = true;
      login.hidden = false;
      passwordInput.value = "";
      passwordInput.focus();
      setStatus(loginStatus, "Panel kilitlendi.", "success");
    });

    document.querySelector("[data-user-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.querySelector("[data-user-email]");
      setStatus(userStatus, "Kaydediliyor…");
      try {
        const result = await updateCollection("users", input.value.trim(), "POST");
        setStatus(
          userStatus,
          result.requiresCloudflareAccess
            ? "Worker izni kaydedildi. Bu kurum dışı adresi Cloudflare Access politikasına da eklemelisiniz."
            : result.coveredByStaticRule
              ? "Adres zaten kurumsal alan adı veya sabit izin kuralı kapsamındaydı; ekip listesine kaydedildi."
              : "Uygulama izni kaydedildi.",
          result.requiresCloudflareAccess ? "" : "success",
        );
        input.value = "";
      } catch (error) {
        setStatus(userStatus, "Erişim kaydedilemedi: " + error.message, "error");
      }
    });

    document.querySelector("[data-recipient-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.querySelector("[data-recipient-email]");
      const type = document.querySelector("[data-recipient-type]").value;
      setStatus(recipientStatus, "Kaydediliyor…");
      try {
        await updateCollection("recipients", input.value.trim(), "POST", type);
        input.value = "";
        setStatus(recipientStatus, "Mail alıcısı kaydedildi.", "success");
      } catch (error) {
        setStatus(recipientStatus, "Mail alıcısı kaydedilemedi: " + error.message, "error");
      }
    });

    document.querySelector("[data-email-settings-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(settingsStatus, "Kaydediliyor…");
      try {
        await request("/api/admin/email-settings", {
          method: "PUT",
          body: JSON.stringify({
            enabled: document.querySelector("[data-email-enabled]").checked,
            sendTime: document.querySelector("[data-email-time]").value,
            timezone: "Europe/Istanbul",
            senderName: document.querySelector("[data-email-sender]").value.trim(),
            subjectTemplate: document.querySelector("[data-email-subject]").value.trim(),
          }),
        });
        await loadAdmin();
        setStatus(settingsStatus, "Mail ayarları kaydedildi.", "success");
      } catch {
        setStatus(settingsStatus, "Mail ayarları kaydedilemedi.", "error");
      }
    });

    content.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-remove]");
      if (!button) return;
      if (!window.confirm(button.dataset.email + " kaldırılsın mı?")) return;
      const status = button.dataset.remove === "users"
        ? userStatus
        : recipientStatus;
      setStatus(status, "Kaldırılıyor…");
      try {
        const result = await updateCollection(
          button.dataset.remove,
          button.dataset.email,
          "DELETE",
        );
        setStatus(
          status,
          result.coveredByStaticRule
            ? "Kayıt silindi; ancak adres sabit alan adı/izin kuralı kapsamında olduğu için erişimi devam eder."
            : "Kayıt kaldırıldı.",
          result.coveredByStaticRule ? "" : "success",
        );
      } catch (error) {
        setStatus(status, "Kayıt kaldırılamadı: " + error.message, "error");
      }
    });

    fetch("/api/admin/status", { headers: { accept:"application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 403 || payload.admin !== true) {
          setStatus(loginStatus, "Bu hesap yönetim paneline yetkili değil.", "error");
          passwordInput.disabled = true;
          document.querySelector("[data-login-form] button").disabled = true;
        } else if (!payload.passwordConfigured) {
          setStatus(loginStatus, "ADMIN_PANEL_PASSWORD Worker secret henüz tanımlanmamış.", "error");
        }
      })
      .catch(() => setStatus(loginStatus, "Yönetim servisine ulaşılamadı.", "error"));
  </script>
</body>
</html>`;
}
