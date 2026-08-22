import { randomBytes } from "node:crypto";

import { z } from "zod";

const RepoName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const Token = z.string().trim().min(1).max(1_000);

const RepoAntwort = z.object({
  full_name: RepoName,
  default_branch: z.string().min(1).max(255),
  private: z.boolean(),
});

const RefAntwort = z.object({
  ref: z.string().min(1),
  object: z.object({
    sha: z.string().regex(/^[0-9a-f]{40}$/i),
  }),
});

export interface GitHubRepoMetadaten {
  readonly repo: string;
  readonly standardBranch: string;
  readonly privat: boolean;
}

export interface GitHubArbeitszweig {
  readonly repo: string;
  readonly branch: string;
  readonly basisBranch: string;
  readonly basisSha: string;
}

export interface GitHubApi {
  repo(repo: string): Promise<GitHubRepoMetadaten>;
  ref(repo: string, branch: string): Promise<string>;
  refAnlegen(repo: string, branch: string, sha: string): Promise<void>;
  refLoeschen(repo: string, branch: string): Promise<void>;
}

type FetchFunktion = typeof fetch;

export class GitHubRestApi implements GitHubApi {
  readonly #token: string;
  readonly #fetch: FetchFunktion;

  constructor(tokenRoh: string, fetchFunktion: FetchFunktion = fetch) {
    this.#token = Token.parse(tokenRoh);
    this.#fetch = fetchFunktion;
  }

  async #request(repoRoh: string, pfad: string, init: RequestInit = {}): Promise<unknown> {
    const repo = RepoName.parse(repoRoh);
    const antwort = await this.#fetch(`https://api.github.com/repos/${repo}${pfad}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.#token}`,
        "x-github-api-version": "2022-11-28",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!antwort.ok) {
      throw new Error(`GitHub-Anfrage fehlgeschlagen (${antwort.status}) für ${pfad}.`);
    }
    if (antwort.status === 204) return undefined;
    return antwort.json();
  }

  async repo(repo: string): Promise<GitHubRepoMetadaten> {
    const roh = RepoAntwort.parse(await this.#request(repo, ""));
    return {
      repo: roh.full_name,
      standardBranch: roh.default_branch,
      privat: roh.private,
    };
  }

  async ref(repo: string, branch: string): Promise<string> {
    const roh = RefAntwort.parse(
      await this.#request(repo, `/git/ref/heads/${encodeURIComponent(branch)}`),
    );
    return roh.object.sha;
  }

  async refAnlegen(repo: string, branch: string, sha: string): Promise<void> {
    z.string().regex(/^[0-9a-f]{40}$/i).parse(sha);
    await this.#request(repo, "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
  }

  async refLoeschen(repo: string, branch: string): Promise<void> {
    await this.#request(repo, `/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "DELETE",
    });
  }
}

function branchTeil(wert: string): string {
  const normalisiert = wert
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  if (normalisiert.length === 0) throw new Error("Branch-Teil enthält keine nutzbaren Zeichen.");
  return normalisiert;
}

export async function githubRepoNachweis(
  api: GitHubApi,
  repoRoh: string,
): Promise<GitHubRepoMetadaten & { readonly standardSha: string }> {
  const repo = RepoName.parse(repoRoh);
  const metadaten = await api.repo(repo);
  const standardSha = await api.ref(repo, metadaten.standardBranch);
  return { ...metadaten, standardSha };
}

export async function githubArbeitszweigAnlegen(
  api: GitHubApi,
  repoRoh: string,
  auftragId: string,
  aktionId: string,
  suffix = randomBytes(4).toString("hex"),
): Promise<GitHubArbeitszweig> {
  const repo = RepoName.parse(repoRoh);
  const metadaten = await api.repo(repo);
  const basisSha = await api.ref(repo, metadaten.standardBranch);
  const branch = `byb/${branchTeil(auftragId)}-${branchTeil(aktionId)}-${branchTeil(suffix)}`;

  await api.refAnlegen(repo, branch, basisSha);
  return {
    repo,
    branch,
    basisBranch: metadaten.standardBranch,
    basisSha,
  };
}

export async function githubArbeitszweigLoeschen(
  api: GitHubApi,
  zweig: GitHubArbeitszweig,
): Promise<void> {
  if (!zweig.branch.startsWith("byb/")) {
    throw new Error("Nur isolierte BYB-Arbeitsbranches dürfen automatisch gelöscht werden.");
  }
  await api.refLoeschen(RepoName.parse(zweig.repo), zweig.branch);
}
