import { describe, expect, it } from "vitest";

import {
  githubArbeitszweigAnlegen,
  githubArbeitszweigLoeschen,
  githubRepoNachweis,
  type GitHubApi,
} from "./github-executor.js";

function api(): { readonly api: GitHubApi; readonly aufrufe: string[] } {
  const aufrufe: string[] = [];
  return {
    aufrufe,
    api: {
      repo(repo) {
        aufrufe.push(`repo:${repo}`);
        return Promise.resolve({ repo, standardBranch: "main", privat: true });
      },
      ref(repo, branch) {
        aufrufe.push(`ref:${repo}:${branch}`);
        return Promise.resolve("1234567890abcdef1234567890abcdef12345678");
      },
      refAnlegen(repo, branch, sha) {
        aufrufe.push(`create:${repo}:${branch}:${sha}`);
        return Promise.resolve();
      },
      refLoeschen(repo, branch) {
        aufrufe.push(`delete:${repo}:${branch}`);
        return Promise.resolve();
      },
    },
  };
}

describe("GitHub-Executor", () => {
  it("prüft das ausgewählte Repo und löst den Standardbranch auf", async () => {
    const test = api();
    const ergebnis = await githubRepoNachweis(test.api, "firma/produkt");

    expect(ergebnis).toEqual({
      repo: "firma/produkt",
      standardBranch: "main",
      privat: true,
      standardSha: "1234567890abcdef1234567890abcdef12345678",
    });
    expect(test.aufrufe).toEqual([
      "repo:firma/produkt",
      "ref:firma/produkt:main",
    ]);
  });

  it("legt nie auf main, sondern nur auf einem isolierten byb-Branch los", async () => {
    const test = api();
    const zweig = await githubArbeitszweigAnlegen(
      test.api,
      "firma/produkt",
      "auftrag-123",
      "code bauen",
      "deadbeef",
    );

    expect(zweig.branch).toBe("byb/auftrag-123-code-bauen-deadbeef");
    expect(zweig.basisBranch).toBe("main");
    expect(test.aufrufe[2]).toBe(
      "create:firma/produkt:byb/auftrag-123-code-bauen-deadbeef:1234567890abcdef1234567890abcdef12345678",
    );
  });

  it("löscht nur Branches mit byb-Präfix automatisch", async () => {
    const test = api();
    await githubArbeitszweigLoeschen(test.api, {
      repo: "firma/produkt",
      branch: "byb/auftrag-code-deadbeef",
      basisBranch: "main",
      basisSha: "1234567890abcdef1234567890abcdef12345678",
    });
    expect(test.aufrufe).toEqual(["delete:firma/produkt:byb/auftrag-code-deadbeef"]);

    await expect(
      githubArbeitszweigLoeschen(test.api, {
        repo: "firma/produkt",
        branch: "main",
        basisBranch: "main",
        basisSha: "1234567890abcdef1234567890abcdef12345678",
      }),
    ).rejects.toThrow(/Nur isolierte BYB-Arbeitsbranches/);
  });

  it("weist ungültige Repo-Namen vor einem API-Aufruf zurück", async () => {
    const test = api();
    await expect(githubRepoNachweis(test.api, "kein-repo")).rejects.toThrow();
    expect(test.aufrufe).toEqual([]);
  });
});
