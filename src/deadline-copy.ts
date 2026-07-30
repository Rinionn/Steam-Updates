import type { SteamDeadline } from "./types.js";

export interface DeadlineCopy {
  category: "Başvuru" | "Demo & Mağaza" | "Tanıtım" | "Yayın";
  title: string;
  description: string;
}

export function deadlineCopy(deadline: SteamDeadline): DeadlineCopy {
  const text = deadline.label.toLowerCase();

  if (deadline.kind === "registration") {
    return {
      category: "Başvuru",
      title: "Festivale kayıt için son gün",
      description:
        "Steamworks kayıt sayfasından uygun oyununuzun katılımını onaylayın.",
    };
  }

  if (/press preview starts/.test(text)) {
    return {
      category: "Yayın",
      title: "Basın önizlemesi başlıyor",
      description:
        "Bu tarihten önce hazır ve yayında olan demolar basın önizlemesinde yer alabilir.",
    };
  }

  if (/demo build.*store page.*review|press preview.*submitted/.test(text)) {
    return {
      category: "Demo & Mağaza",
      title: "Basın önizlemesi için incelemeye gönder",
      description:
        "Demo yapısını ve mağaza sayfasını Valve incelemesine gönderin.",
    };
  }

  if (/all required items must be submitted for review/.test(text)) {
    return {
      category: "Demo & Mağaza",
      title: "Tüm içerikler incelemeye gönderilmiş olmalı",
      description:
        "Demo, mağaza sayfası ve zorunlu materyaller festival hazırlığı için incelemede olmalı.",
    };
  }

  if (/pulls trailers/.test(text)) {
    return {
      category: "Tanıtım",
      title: "Resmî fragman için içerik alınacak",
      description:
        "Mağaza sayfanızdaki en güncel fragmanın hazır olduğundan emin olun.",
    };
  }

  if (/opt out.*trailer|deadline to opt out.*trailer/.test(text)) {
    return {
      category: "Tanıtım",
      title: "Fragman kullanımından çıkış için son gün",
      description:
        "Resmî tanıtımda yer almak istemiyorsanız fragman iznini bu tarihe kadar kapatın.",
    };
  }

  if (/set your demo live|festival.*begins|next fest.*begins/.test(text)) {
    return {
      category: "Yayın",
      title: "Demo yayında olmalı",
      description:
        "Festival başlamadan önce demoyu yayınlayın veya plan değiştiyse katılımdan çıkın.",
    };
  }

  if (deadline.kind === "review") {
    return {
      category: "Demo & Mağaza",
      title: "Valve inceleme tarihi",
      description:
        "İlgili demo, mağaza sayfası veya materyali bu tarihten önce incelemeye gönderin.",
    };
  }

  if (deadline.kind === "marketing") {
    return {
      category: "Tanıtım",
      title: "Tanıtım materyali tarihi",
      description:
        "Fragman ve tanıtım materyallerinizin güncel ve kullanıma hazır olduğunu kontrol edin.",
    };
  }

  return {
    category: "Yayın",
    title: "Etkinlik hazırlık tarihi",
    description:
      "Festival hazırlıklarının bu tarihten önce tamamlandığını kontrol edin.",
  };
}
