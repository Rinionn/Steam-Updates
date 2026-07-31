# Cloudflare Access giriş markası

Cloudflare Access e-posta/OTP ekranı Worker'dan önce gösterildiği için uygulamanın
HTML ve CSS dosyaları bu ilk ekranı değiştiremez. Logo ve renkler Cloudflare Zero
Trust organizasyonunun giriş tasarımından uygulanır ve aynı organizasyondaki tüm
Access uygulamalarını etkiler.

## Uygulanacak değerler

- Organization name: `Steam Radar`
- Logo URL: `https://rinionn.github.io/Steam-Updates/assets/steam-radar-logo.png`
- Background color: `#08040f`
- Text color: `#fffaf5`
- Header text: `Steam Radar'a güvenli giriş yapın`
- Footer text: `Yalnızca yetkilendirilmiş ekip hesapları erişebilir.`

## Cloudflare yolu

1. Zero Trust panelini açın.
2. `Reusable components` → `Custom pages` bölümüne gidin.
3. `Access login page` satırında `Manage` seçeneğini açın.
4. Yukarıdaki değerleri girip kaydedin.
5. `Access controls` → `Applications` içinden uygulama adını `Steam Radar` yapın.

Cloudflare formunun yerleşimi ve buton bileşeni özel HTML/CSS ile değiştirilemez;
desteklenen alanlar logo, organizasyon adı, başlık, alt metin, arka plan ve metin
rengidir.

Kaynak: https://developers.cloudflare.com/cloudflare-one/reusable-components/custom-pages/access-login-page/
