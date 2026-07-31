# Steam Etkinlik Radarı

Valve’ın resmî Steamworks takvimini 10 dakikada bir kontrol eden, festivalleri ve sezon
indirimlerini listeleyen, bilinen başvuru/inceleme tarihlerini İstanbul saatine
çeviren ve e-posta özeti gönderebilen yerel bot.

## Çevrim içi dashboard

**https://steam-etkinlik-radari.batuhan-ozmen.workers.dev/**

Bu adres kurumsal giriş, Steam oyun araması, ekip verisi, yönetim ve analitik
özelliklerini sunan ana yayındır. GitHub Pages çıktısı yalnız statik yedektir.
Kurulum adımları `docs/cloudflare-access.md` dosyasındadır.

GitHub Actions, Steam takvimini ve haber kaynaklarını 10 dakikada bir kontrol
eder; yalnız gerçek içerik değiştiğinde `out/index.html` çıktısını yeniden
yayınlar. Zamanlanmış işler GitHub yoğunluğunda birkaç dakika gecikebilir.
`main` dalına gönderilen her değişiklikte de site yeniden oluşturulur. Depo kökündeki
`index.html`, branch tabanlı Pages ayarı için aynı dashboard’un yedek çıktısıdır
ve veri commitine otomatik olarak dahil edilir.

Steam arama, canlı oyuncu, inceleme, fiyat ve Gamalytic toplu yanıtları en fazla 10 dakika
önbellekte tutulur. Çok sayıda üst kaynak isteği gerektiren Steamworks etkinlik
detayları ile oyun mağaza metadatası 6 saat, görseller ise 7 gün önbellekte
tutulur. Etkinliğin ana tarihi değişirse detay önbelleği beklenmeden yenilenir.

## Neler yapar?

- Resmî `Upcoming Steam Events` sayfasını okur.
- Temalı festivalleri, Next Fest tarihlerini ve sezon indirimlerini birleştirir.
- Etkinlik detaylarında yayınlanan kayıt, demo inceleme ve pazarlama tarihlerini
  çıkarır.
- Detay sayfalarını en fazla yedi günde bir ve istekler arasında bekleyerek
  kontrol eder; etkinlik tarihleri değişirse önbelleği beklemeden yeniler.
- `out/steam-etkinlikleri.html` ve GitHub Pages için `out/index.html` içinde
  aranabilir Türkçe liste üretir.
- Resend API veya standart SMTP üzerinden günlük e-posta gönderebilir.
- Aynı yerel günde ikinci kez e-posta göndermez.
- Steam hesabında kayıt, opt-in veya başka bir değişiklik yapmaz.
- Oyun adı yazılırken korumalı Worker üzerinden Steam Store sonuçlarını arar ve
  seçimde App ID, etiket, demo/çıkış durumu ve kapak görselini otomatik doldurur.
- Bir ana oyunu en fazla beş rakiple karşılaştırır; Steam’den inceleme, fiyat,
  oyuncu ve kategori verilerini, Gamalytic bağlandığında da tahmini wishlist,
  satış ve gelir verilerini gösterir.
- `/analytics` altında sol menülü pazar analizi alanı sunar: ana sayfa, Steam
  analitiği, oyunlar, yayıncılar, türler ve etiketler ile yıllık kırılımlar.
  Gamalytic API anahtarı yalnız Cloudflare Worker secret olarak tutulur ve
  tarayıcıya gönderilmez.
- Yeni çıkan/yaklaşan oyunları ve resmî Steamworks duyurularını düzenli yenilenen
  ayrı bir haber görünümünde toplar.
- Şifre korumalı yönetim panelinden erişim kullanıcılarını, e-posta alıcılarını
  ve son 30 günlük kullanım analitiğini yönetir.

## Gamalytic ve yönetim secret’ları

GitHub’da **Settings → Secrets and variables → Actions → New repository
secret** yolundan aşağıdaki değerleri ekleyin:

- `GAMALYTIC_API_KEY`: Gamalytic profilindeki **API keys** bölümünden üretilen
  anahtar.
- `ADMIN_PANEL_PASSWORD`: yalnız yönetim panelinde kullanılacak güçlü ve benzersiz
  parola.
- `EMAIL_AUTOMATION_SECRET`: yönetim panelindeki e-posta alıcılarını günlük
  workflow’a güvenli biçimde aktaran rastgele servis anahtarı.

Bu değerler kaynak koda veya statik HTML’e yazılmaz. Sonraki Pages workflow
çalışmasında Cloudflare Worker secret olarak aktarılır.

Yönetim panelinde mevcut erişim kuralları ve tekil kullanıcılar birlikte
gösterilir. Günlük e-posta bölümünden To/BCC alıcıları, otomatik gönderimin
aktifliği, `Europe/Istanbul` gönderim saati, gönderici görünen adı ve konu
şablonu düzenlenebilir. Konu şablonu `{{kritik}}`, `{{etkinlik}}` ve `{{tarih}}`
alanlarını destekler. Yönetim ekranı ana panelden ayrıdır ve Worker alan
adının `/admin` yolundan açılır (örnek:
`https://steam-etkinlik-radari.batuhan-ozmen.workers.dev/admin`).

## Kurulum

```powershell
npm install
Copy-Item .env.example .env
npm run daily
```

İlk çalıştırmada e-posta ayarı yoksa gönderim yapılmaz; yine de
`out/son-email.html` önizlemesi oluşturulur.

## E-posta

`.env` içinde alıcı ve göndericiyi ayarlayın:

```dotenv
EMAIL_TO=alici@ornek.com
EMAIL_BCC=kisisel-kopya@ornek.com
EMAIL_FROM="Steam Etkinlik Radarı <bot@alanadiniz.com>"
```

En kolay sağlayıcı Resend’dir:

```dotenv
RESEND_API_KEY=re_xxxxxxxxx
```

Alternatif olarak SMTP alanlarını doldurabilirsiniz. Gerçek parola yerine
sağlayıcınızın uygulama parolası veya yalnız gönderim yetkili hesabı tercih
edilmelidir. `.env` Git tarafından yok sayılır.

### Bilgisayar kapalıyken günlük gönderim

.github/workflows/daily-email.yml`, GitHub Actions üzerinde yarım saatte bir
yönetim panelindeki planı kontrol eder ve o günün e-postasını ilk uygun
çalışmada yalnız bir kez gönderir. Depoda **Settings → Secrets and variables
→ Actions → New repository secret** yolunu açın ve şu gizli değeri ekleyin:

- Ad: `GMAIL_APP_PASSWORD`
- Değer: `batuhan.ozmen@gaminginturkey.com` hesabı için üretilen 16 karakterlik
  Google uygulama şifresi (boşluksuz)

Workflow, ana özeti `business.dev@gaminginturkey.com` grubuna gönderirken
`batuhan.ozmen@gaminginturkey.com` ve `pinargulerrrr@gmail.com` adreslerine
görünmeyen BCC kopyaları da teslim eder. Bu, Google Groups’un göndericinin
kendi grup postasını Inbox’a geri vermediği durumlarda doğrudan Inbox kopyası
sağlar.

Normal Google hesap şifresini kullanmayın ve uygulama şifresini Git’e
eklemeyin. Kurulumdan sonra **Actions → Steam Event Radar - Daily Email → Run
workflow** ile bir defalık test gönderimi yapılabilir.

## Komutlar

- `npm run sync` — Steam’i günceller ve HTML listeyi üretir.
- `npm run report` — kayıtlı veriden HTML listeyi yeniden üretir.
- `npm run email` — kayıtlı veriden e-posta/önizleme üretir.
- `npm run email -- --preview-only` — e-postayı göndermeden önizleme üretir.
- `npm run daily` — senkronizasyon + liste + günlük e-posta.
- `npm run test` — çevrimdışı ayrıştırıcı testleri.

## Ekip operasyon verisi

Cloudflare Worker, `DB` adlı D1 bağlantısı bulunduğunda oyun profillerini,
görev durumlarını ve başvuru statülerini ekip üyeleri arasında senkronize
eder. İlk dağıtım `steam-etkinlik-radari` veritabanını hazırlar ve
`db/schema.sql` şemasını uygular. D1 kullanılamazsa panel mevcut localStorage
verilerini koruyarak yerel çalışma moduna geçer. Başvuru sorumlusu ve serbest
notlar merkezi veritabanına gönderilmez; yalnız kullanıcının cihazında tutulur.

Aynı gün test e-postasını tekrar göndermek için:

```powershell
npm run email -- --force-email
```

## Windows’ta günlük çalıştırma

Codex otomasyonu kullanmıyorsanız Windows Görev Zamanlayıcı kurulumu:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-task.ps1 -Time "09:00"
```

Bilgisayar kapalıysa görev, bilgisayar yeniden açıldığında ilk fırsatta çalışır.
Kesintisiz 7/24 gönderim gerekiyorsa uygulamanın açık kalan bir bilgisayar veya
sunucuda çalıştırılması gerekir.

## Kişiselleştirilmiş Steamworks ekranı

Herkese açık resmî takvim giriş gerektirmez. Ekran görüntüsündeki “uygun
oyunlarım / kayıtlı” bilgisi ise Steamworks hesabına özeldir ve belgelenmiş bir
Web API’si yoktur. Bu sürüm genel resmî takvimi güvenilir biçimde izler.
Kişisel uygunluk katmanı eklenirse ayrı, en düşük yetkili Steamworks hesabı ve
kullanıcının kendisinin tamamladığı Steam Guard oturumu kullanılmalıdır; bot
Steam parolası veya 2FA anahtarı saklamamalıdır.
