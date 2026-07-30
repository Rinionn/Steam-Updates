export const eventDescriptionsTr: Record<string, string> = {
  "social-deduction-fest-803b5a882": "Etkinlik sona erdi.",
  "train-fest-a5c61577c": "Etkinlik sona erdi.",
  "cyberpunk-fest-51562f576":
    "Neon, ileri teknoloji ve diğer bilim kurgu öğeleri içeren siberpunk dünyalardaki oyunlar.",
  "pins-pegs-fest-2624f7168":
    "Pinball ve bowling gibi lobutları ya da pachinko ve bagatelle gibi çivileri merkeze alan oyunlar.",
  "pve-survival-crafting-fest-8bb6de2ec":
    "Hayatta kalma, üretim ve PvE odaklı ana oynanış döngüsü içeren oyunlar.",
  "programming-fest-d92cade24":
    "Programlama veya mantık bulmacaları gibi programlama görevlerini konu alan oyunlar.",
  "party-based-rpg-fest-55771f151":
    "RPG yapısı içinde aynı ekipte birden fazla oynanabilir karakter sunan oyunlar.",
  "cooking-fest-424f50fb9":
    "Yemek pişirme, insanları doyurma ve bunların arasındaki her şeyi konu alan oyunlar.",
  "steam-scream-v-4b0a8f227":
    "Korku kategorisine giren ve özellikle Cadılar Bayramı temasını kullanan oyunlar.",
  "auto-battler-rpg-fest-92a2e84b8":
    "Savaşların otomatik ilerlediği, kazanmak için birimleri geliştirmeniz gereken oyunlar.",
  "desktop-companion-fest-5bc08adee":
    "Başka işler yaparken masaüstünüzde duran ve size eşlik eden oyunlar.",
  "shop-keeper-fest-0d64f4666":
    "Bir mağazayı yönetmeyi konu alan oyunlar.",
  "sheep-fest-6ec302116":
    "Koyunları, keçileri veya Caprinae alt familyasındaki diğer hayvanları konu alan oyunlar.",
  "couch-co-op-fest-8b489c8ca":
    "Aynı cihazda birlikte oynanabilen ve yerel eşli oyun desteği sunan oyunlar.",
  "rhythm-fest-b3b4ca682":
    "Nota, ok, mermi veya benzeri öğeleri ritme uygun yakalamayı ödüllendiren oyunlar.",
  "dinos-vs-robots-fest-e4c058c85":
    "Dinozorları, robotları veya ikisini birden içeren oyunlar; robot dinozorlar da dahil.",
  "racing-fest-9bb5cb332":
    "Rakiplerden, bilgisayardan veya dünkü performansınızdan daha hızlı olmayı konu alan oyunlar.",
  "witch-fest-34647039a":
    "Cadılar ve cadılık temasını merkeze alan oyunlar.",
  "fighting-fest-997e98a30":
    "Yalnızca dövüş içeren değil, doğrudan dövüş oyunu topluluğunun oynadığı türdeki oyunlar.",
  "real-time-strategy-fest-96b41f8e6":
    "İnşa ve araştırma planlama, düşman hareketlerini öngörme ve kaynak yönetimi gibi yoğun stratejik kararları gerçek zamanlı sunan oyunlar.",
  "mountaineering-fest-e94606dd4":
    "Dağlara tırmanmayı konu alan oyunlar.",
};

export function descriptionTrForEvent(eventId: string): string | undefined {
  return eventDescriptionsTr[eventId];
}
