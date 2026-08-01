# Cloudflare Access kurulumu

Hedef adres: `https://steamradar.gaminginturkey.com`

## 1. Worker ve alan adı

1. `gaminginturkey.com` alan adını Cloudflare hesabına ekleyin veya mevcut
   Cloudflare bölgesini kullanın.
2. `npm run report` ile statik çıktıyı üretin.
3. `npx wrangler deploy` ile Worker ve `out/` varlıklarını yayınlayın.
4. Worker ayarlarında **Settings → Domains & Routes → Add → Custom Domain**
   yolundan `steamradar.gaminginturkey.com` alanını ekleyin.

## 2. Kurumsal giriş

1. **Cloudflare Zero Trust → Settings → Authentication → Login methods**
   bölümünde Google kimlik sağlayıcısını bağlayın.
2. **Access controls → Applications → Add an application → Self-hosted**
   yolunu açın.
3. Uygulama alanı olarak `steamradar.gaminginturkey.com/*` girin.
4. `Allow Steam Radar team` adlı politika oluşturun:
   - Action: `Allow`
   - Include selector: `Emails ending in`
   - Value: `@gaminginturkey.com`
5. Varsayılan oturum süresini kurum politikasına göre belirleyin.
6. Gizli pencerede kurumsal ve kurum dışı iki adresle erişimi doğrulayın.

Access etkinleştirilmeden `CLOUDFLARE_ENABLED=true` depo değişkenini açmayın.
Worker API'si ayrıca Cloudflare Access'in doğruladığı
`Cf-Access-Authenticated-User-Email` başlığını kontrol eder.

## 3. GitHub Actions

GitHub deposunda aşağıdaki Actions secret değerlerini ekleyin:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Ardından Actions variable olarak `CLOUDFLARE_ENABLED=true` ekleyin. Günlük
`pages.yml` çalışması GitHub Pages çıktısını korurken aynı doğrulanmış `out/`
klasörünü Cloudflare Worker'a da yayınlar.
