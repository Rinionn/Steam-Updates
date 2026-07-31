import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("scheduled data refresh", () => {
  it("takvimi 10 dakikada bir kontrol eder ve değişmeyen veriyi yayınlamaz", async () => {
    const workflow = await readFile(
      ".github/workflows/pages.yml",
      "utf8",
    );

    expect(workflow).toContain('cron: "5,15,25,35,45,55 * * * *"');
    expect(workflow).toContain('echo "changed=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain(
      'git commit -m "chore(data): steam takvimi guncellendi [skip ci]"',
    );
    expect(workflow).toContain(
      "if: needs.build.outputs.should_deploy == 'true'",
    );
  });
});
