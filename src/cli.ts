import { config, paths } from "./config.js";
import { sendDigest } from "./email.js";
import { writeReport } from "./report.js";
import { readSnapshot } from "./storage.js";
import { syncSteamEvents } from "./sync.js";
import type { EventSnapshot } from "./types.js";

type Command = "sync" | "report" | "email" | "daily";

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function requireSnapshot(): Promise<EventSnapshot> {
  const snapshot = await readSnapshot(paths.snapshot);
  if (!snapshot) {
    throw new Error("Henüz veri yok. Önce `npm run sync` komutunu çalıştırın.");
  }
  return snapshot;
}

async function run(): Promise<void> {
  const command = (process.argv[2] || "daily") as Command;
  const forceEmail = process.argv.includes("--force-email");

  if (!["sync", "report", "email", "daily"].includes(command)) {
    throw new Error(
      `Bilinmeyen komut: ${command}. Kullanılabilir: sync, report, email, daily`,
    );
  }

  if (command === "sync" || command === "daily") {
    print("Steamworks resmî takvimi güncelleniyor…");
    const result = await syncSteamEvents();
    print(
      `Tamam: ${result.snapshot.events.length} etkinlik · ${result.added.length} yeni · ${result.changed.length} değişen.`,
    );
    const reportPath = await writeReport(result.snapshot);
    print(`Liste hazır: ${reportPath}`);

    if (command === "sync") return;
    if (!config.emailDaily) {
      print("EMAIL_DAILY=false olduğu için e-posta adımı atlandı.");
      return;
    }
    const digest = await sendDigest(result.snapshot, { force: forceEmail });
    if (digest.sent) {
      print(`E-posta gönderildi (${digest.provider}, ${digest.messageId}).`);
    } else {
      print(`E-posta gönderilmedi: ${digest.skippedReason}`);
      print(`E-posta önizlemesi: ${digest.htmlPreview}`);
    }
    return;
  }

  const snapshot = await requireSnapshot();
  if (command === "report") {
    print(`Liste hazır: ${await writeReport(snapshot)}`);
    return;
  }

  const digest = await sendDigest(snapshot, { force: forceEmail });
  if (digest.sent) {
    print(`E-posta gönderildi (${digest.provider}, ${digest.messageId}).`);
  } else {
    print(`E-posta gönderilmedi: ${digest.skippedReason}`);
    print(`E-posta önizlemesi: ${digest.htmlPreview}`);
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Hata: ${message}\n`);
  process.exitCode = 1;
});
