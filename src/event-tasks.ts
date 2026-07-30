import {
  deadlineCopy,
  stableDeadlineId,
} from "./deadline-copy.js";
import type { SteamEvent } from "./types.js";
import { stableId } from "./utils.js";

export type EventTaskLevel = "Gerekli" | "İsteğe bağlı" | "Önerilen";

export interface EventTask {
  id: string;
  level: EventTaskLevel;
  title: string;
  description: string;
  href: string;
  dueAt?: string;
  legacyIds: string[];
}

const DISCOUNT_DASHBOARD =
  "https://partner.steamgames.com/promotion/discounts/dashboard/";
const THEMED_FEST_GUIDE =
  "https://partner.steamgames.com/doc/marketing/upcoming_events/themed_sales";

function task(
  event: SteamEvent,
  key: string,
  value: Omit<EventTask, "id" | "legacyIds">,
  legacyKeys: string[] = [],
): EventTask {
  const id = stableId(event.id, "task", key);
  return {
    id,
    legacyIds: [
      ...new Set(
        legacyKeys
          .map((legacyKey) => stableId(event.id, "task", legacyKey))
          .filter((legacyId) => legacyId !== id),
      ),
    ],
    ...value,
  };
}

export function buildEventTasks(event: SteamEvent): EventTask[] {
  const categoryTotals = new Map<string, number>();
  for (const deadline of event.deadlines) {
    const category = deadlineCopy(deadline).category;
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
  }
  const categoryOccurrences = new Map<string, number>();
  const tasks: EventTask[] = event.deadlines.map((deadline) => {
    const copy = deadlineCopy(deadline);
    const occurrence =
      (categoryOccurrences.get(copy.category) || 0) + 1;
    categoryOccurrences.set(copy.category, occurrence);
    const fallbackSemanticDeadlineId = stableDeadlineId(
      event.id,
      deadline,
      occurrence,
    );
    const semanticDeadlineId =
      Array.from(
        { length: categoryTotals.get(copy.category) || 1 },
        (_, index) => stableDeadlineId(event.id, deadline, index + 1),
      ).find((candidate) => candidate === deadline.id) ||
      fallbackSemanticDeadlineId;
    const legacyDeadlineId = stableId(
      event.id,
      deadline.kind,
      deadline.dueAt,
      deadline.label,
    );
    return task(
      event,
      semanticDeadlineId,
      {
        level:
          copy.category === "Başvuru" || copy.category === "Demo & Mağaza"
            ? "Gerekli"
            : "Önerilen",
        title: copy.title,
        description: copy.description,
        href:
          copy.category === "Başvuru" && event.registrationUrl
            ? event.registrationUrl
            : deadline.sourceUrl,
        dueAt: deadline.dueAt,
      },
      [deadline.id, legacyDeadlineId],
    );
  });

  const hasRegistrationDeadline = event.deadlines.some(
    (deadline) => deadline.kind === "registration",
  );

  if (event.kind === "themed_fest") {
    if (event.registrationUrl && !hasRegistrationDeadline) {
      tasks.push(
        task(event, "registration-check", {
          level: "Gerekli",
          title: "Uygunluğu ve kayıt durumunu kontrol et",
          description:
            "Steamworks’te uygun oyunları görüntüleyin ve katılacak oyunun kaydını tamamlayın.",
          href: event.registrationUrl,
        }),
      );
    }

    tasks.push(
      task(event, "discount", {
        level: "İsteğe bağlı",
        title: "İndirim planını kontrol et",
        description:
          "İndirim zorunlu değildir; ancak indirimli oyunlar festival sayfasında daha görünür olabilir.",
        href: DISCOUNT_DASHBOARD,
        dueAt: event.startAt,
      }),
      task(event, "store-readiness", {
        level: "Önerilen",
        title: "Mağaza sayfasını ve etiketleri gözden geçir",
        description:
          "Tema uygunluğunu gösteren mağaza etiketlerinin, açıklamanın, demonun ve yayımdaki fragmanın güncel olduğunu doğrulayın.",
        href: event.detailsUrl || THEMED_FEST_GUIDE,
      }),
    );
  }

  if (event.kind === "seasonal_sale") {
    tasks.push(
      task(event, "seasonal-discount", {
        level: "Gerekli",
        title: "Sezon indirimi teklifini gir",
        description:
          "Katılım için uygun paketlerin indirim oranlarını İndirim Yönetimi’nde girip kaydedin.",
        href: DISCOUNT_DASHBOARD,
        dueAt: event.startAt,
      }),
      task(event, "discount-eligibility", {
        level: "Önerilen",
        title: "İndirim uygunluğunu kontrol et",
        description:
          "Yeni çıkış veya fiyat değişikliği kaynaklı bekleme süresi bulunmadığını doğrulayın.",
        href: "https://partner.steamgames.com/doc/marketing/discounts",
      }),
    );
  }

  if (
    event.kind === "next_fest" &&
    tasks.length === 0 &&
    event.registrationUrl
  ) {
    tasks.push(
      task(event, "nextfest-registration", {
        level: "Gerekli",
        title: "Uygunluğu ve Next Fest kaydını kontrol et",
        description:
          "Uygun oyunun katılımını Steamworks kayıt sayfasından onaylayın.",
        href: event.registrationUrl,
      }),
      task(event, "nextfest-demo", {
        level: "Gerekli",
        title: "Demo ve mağaza sayfasını hazırla",
        description:
          "Festival başlamadan önce oynanabilir demo ve herkese açık mağaza sayfası hazır olmalı.",
        href: event.detailsUrl || event.sourceUrl,
        dueAt: event.startAt,
      }),
    );
  }

  return tasks;
}
