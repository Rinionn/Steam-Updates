# Steam Etkinlik Radarı

Valve’ın resmî Steamworks takvimini günlük kontrol eden, festivalleri ve sezon
indirimlerini listeleyen, bilinen başvuru/inceleme tarihlerini İstanbul saatine
çeviren ve e-posta özeti gönderebilen yerel bot.

## Çevrim içi dashboard

**https://rinionn.github.io/Steam-Updates/**

GitHub Actions, Steam takvimini her gün Türkiye saatiyle yaklaşık 09:00’da
yeniler ve `out/index.html` çıktısını GitHub Pages’e yayınlar. `main` dalına
gönderilen her değişiklikte de site yeniden oluşturulur. Depo kökündeki
`index.html`, branch tabanlı Pages ayarı için aynı dashboard’un yedek çıktısıdır.

## Neler yapar?

- Resmî `Upcoming Steam Events` sayfasını okur.
- Temalı festivalleri, Next Fest tarihlerini ve sezon indirimlerini birleştirir.
- Etkinlik detaylarında yayınlanan kayıt, demo inceleme ve pazarlama tarihlerini
  çıkarır.
- `out/steam-etkinlikleri.html` ve GitHub Pages için `out/index.html` içinde
  aranabilir Türkçe liste üretir.
- Resend API veya standart SMTP üzerinden günlük e-posta gönderebilir.
- Aynı yerel günde ikinci kez e-posta göndermez.
- Steam hesabında kayıt, opt-in veya başka bir değişiklik yapmaz.

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

`.github/workflows/daily-email.yml`, GitHub Actions üzerinde her gün Türkiye
saatiyle yaklaşık 09:30’da çalışır. Depoda **Settings → Secrets and variables
→ Actions → New repository secret** yolunu açın ve şu gizli değeri ekleyin:

- Ad: `GMAIL_APP_PASSWORD`
- Değer: `batuhan.ozmen@gaminginturkey.com` hesabı için üretilen 16 karakterlik
  Google uygulama şifresi (boşluksuz)

Normal Google hesap şifresini kullanmayın ve uygulama şifresini Git’e
eklemeyin. Kurulumdan sonra **Actions → Steam Event Radar - Daily Email → Run
workflow** ile bir defalık test gönderimi yapılabilir.

## Komutlar

- `npm run sync` — Steam’i günceller ve HTML listeyi üretir.
- `npm run report` — kayıtlı veriden HTML listeyi yeniden üretir.
- `npm run email` — kayıtlı veriden e-posta/önizleme üretir.
- `npm run daily` — senkronizasyon + liste + günlük e-posta.
- `npm run test` — çevrimdışı ayrıştırıcı testleri.

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
