import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DateTime } from "luxon";
import type { ChangeRecord } from "./types.js";

const MAX_RECORDS = 400;
const MAX_AGE_MONTHS = 18;

export async function readChangelog(
  changelogPath: string,
): Promise<ChangeRecord[]> {
  try {
    return JSON.parse(await readFile(changelogPath, "utf8")) as ChangeRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function pruneChangelog(
  records: ChangeRecord[],
  now = new Date(),
): ChangeRecord[] {
  const cutoff = DateTime.fromJSDate(now, { zone: "utc" })
    .minus({ months: MAX_AGE_MONTHS })
    .toMillis();
  return records
    .filter((record) => {
      const detectedAt = DateTime.fromISO(record.detectedAt, {
        zone: "utc",
      }).toMillis();
      return Number.isFinite(detectedAt) && detectedAt >= cutoff;
    })
    .sort((left, right) => left.detectedAt.localeCompare(right.detectedAt))
    .slice(-MAX_RECORDS);
}

export async function appendChangelog(
  changelogPath: string,
  additions: ChangeRecord[],
  now = new Date(),
): Promise<ChangeRecord[]> {
  const records = pruneChangelog(
    [...(await readChangelog(changelogPath)), ...additions],
    now,
  );
  await mkdir(path.dirname(changelogPath), { recursive: true });
  await writeFile(
    changelogPath,
    `${JSON.stringify(records, null, 2)}\n`,
    "utf8",
  );
  return records;
}
