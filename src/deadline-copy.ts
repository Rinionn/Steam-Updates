import type { SteamDeadline } from "./types.js";
import { stableId } from "./utils.js";

export interface DeadlineCopy {
  category: "Başvuru" | "Demo & Mağaza" | "Tanıtım" | "Yayın";
  categoryEn: "Registration" | "Demo & Store" | "Promotion" | "Publishing";
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
}

export function deadlineCopy(deadline: SteamDeadline): DeadlineCopy {
  const text = deadline.label.toLowerCase();

  if (deadline.kind === "registration") {
    return {
      category: "Başvuru",
      categoryEn: "Registration",
      title: "Festivale kayıt için son gün",
      titleEn: "Festival registration deadline",
      description:
        "Steamworks kayıt sayfasından uygun oyununuzun katılımını onaylayın.",
      descriptionEn:
        "Confirm the participation of your eligible game on the Steamworks registration page.",
    };
  }

  if (/press preview starts/.test(text)) {
    return {
      category: "Yayın",
      categoryEn: "Publishing",
      title: "Basın önizlemesi başlıyor",
      titleEn: "Press preview begins",
      description:
        "Bu tarihten önce hazır ve yayında olan demolar basın önizlemesinde yer alabilir.",
      descriptionEn:
        "Demos that are ready and live before this date may be included in the press preview.",
    };
  }

  if (/demo build.*store page.*review|press preview.*submitted/.test(text)) {
    return {
      category: "Demo & Mağaza",
      categoryEn: "Demo & Store",
      title: "Basın önizlemesi için incelemeye gönder",
      titleEn: "Submit for press preview review",
      description:
        "Demo yapısını ve mağaza sayfasını Valve incelemesine gönderin.",
      descriptionEn:
        "Submit the demo build and store page for Valve review.",
    };
  }

  if (/all required items must be submitted for review/.test(text)) {
    return {
      category: "Demo & Mağaza",
      categoryEn: "Demo & Store",
      title: "Tüm içerikler incelemeye gönderilmiş olmalı",
      titleEn: "All required content must be submitted for review",
      description:
        "Demo, mağaza sayfası ve zorunlu materyaller festival hazırlığı için incelemede olmalı.",
      descriptionEn:
        "The demo, store page, and required assets should be under review for festival readiness.",
    };
  }

  if (/pulls trailers/.test(text)) {
    return {
      category: "Tanıtım",
      categoryEn: "Promotion",
      title: "Resmî fragman için içerik alınacak",
      titleEn: "Content will be collected for the official trailer",
      description:
        "Mağaza sayfanızdaki en güncel fragmanın hazır olduğundan emin olun.",
      descriptionEn:
        "Make sure the latest trailer on your store page is ready.",
    };
  }

  if (/opt out.*trailer|deadline to opt out.*trailer/.test(text)) {
    return {
      category: "Tanıtım",
      categoryEn: "Promotion",
      title: "Fragman kullanımından çıkış için son gün",
      titleEn: "Deadline to opt out of trailer use",
      description:
        "Resmî tanıtımda yer almak istemiyorsanız fragman iznini bu tarihe kadar kapatın.",
      descriptionEn:
        "Disable trailer permission by this date if you do not want to appear in official promotion.",
    };
  }

  if (/set your demo live|festival.*begins|next fest.*begins/.test(text)) {
    return {
      category: "Yayın",
      categoryEn: "Publishing",
      title: "Demo yayında olmalı",
      titleEn: "Demo must be live",
      description:
        "Festival başlamadan önce demoyu yayınlayın veya plan değiştiyse katılımdan çıkın.",
      descriptionEn:
        "Publish the demo before the festival begins, or withdraw if your plans have changed.",
    };
  }

  if (deadline.kind === "review") {
    return {
      category: "Demo & Mağaza",
      categoryEn: "Demo & Store",
      title: "Valve inceleme tarihi",
      titleEn: "Valve review deadline",
      description:
        "İlgili demo, mağaza sayfası veya materyali bu tarihten önce incelemeye gönderin.",
      descriptionEn:
        "Submit the relevant demo, store page, or asset for review before this date.",
    };
  }

  if (deadline.kind === "marketing") {
    return {
      category: "Tanıtım",
      categoryEn: "Promotion",
      title: "Tanıtım materyali tarihi",
      titleEn: "Promotional asset deadline",
      description:
        "Fragman ve tanıtım materyallerinizin güncel ve kullanıma hazır olduğunu kontrol edin.",
      descriptionEn:
        "Confirm that your trailer and promotional assets are current and ready to use.",
    };
  }

  return {
    category: "Yayın",
    categoryEn: "Publishing",
    title: "Etkinlik hazırlık tarihi",
    titleEn: "Event preparation deadline",
    description:
      "Festival hazırlıklarının bu tarihten önce tamamlandığını kontrol edin.",
    descriptionEn:
      "Confirm that festival preparations are complete before this date.",
  };
}

export function stableDeadlineId(
  eventId: string,
  deadline: SteamDeadline,
  categoryOccurrence: number,
): string {
  return stableId(
    eventId,
    "deadline",
    deadlineCopy(deadline).category,
    String(categoryOccurrence),
  );
}
