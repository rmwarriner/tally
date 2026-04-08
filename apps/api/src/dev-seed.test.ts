import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ensureDemoBookFile } from "./dev-seed";

describe("demo book seeding", () => {
  it("creates the demo book file when it is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-seed-"));

    await ensureDemoBookFile({ dataDirectory: directory });

    const bookPath = join(directory, "workspace-household-demo.json");
    const contents = JSON.parse(await readFile(bookPath, "utf8")) as { id: string; name: string };

    expect(contents).toMatchObject({
      id: "workspace-household-demo",
      name: "Household Finance",
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("does not overwrite an existing book file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-seed-"));
    const bookPath = join(directory, "workspace-household-demo.json");

    await ensureDemoBookFile({ dataDirectory: directory });
    const original = await readFile(bookPath, "utf8");

    await ensureDemoBookFile({ dataDirectory: directory });
    const afterSecondSeed = await readFile(bookPath, "utf8");

    expect(afterSecondSeed).toBe(original);
    await access(bookPath);

    await rm(directory, { recursive: true, force: true });
  });
});
