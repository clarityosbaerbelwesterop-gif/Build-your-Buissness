import {
  GitHubRestApi,
  githubArbeitszweigAnlegen,
  githubArbeitszweigLoeschen,
  githubRepoNachweis,
  type GitHubArbeitszweig,
} from "./github-executor.js";

function env(name: string): string | undefined {
  const wert = process.env[name]?.trim();
  return wert === "" ? undefined : wert;
}

function istGitHubNichtGefunden(fehler: unknown): boolean {
  return fehler instanceof Error && /GitHub-Anfrage fehlgeschlagen \(404\)/.test(fehler.message);
}

const repo = env("GITHUB_REPOSITORY");
const dauerhaft = env("BYB_GITHUB_LIVE_TOKEN");
const kurzlebig = env("GITHUB_TOKEN");
const token = dauerhaft ?? kurzlebig;

if (repo === undefined) {
  throw new Error("Für den GitHub-Write-Nachweis fehlt GITHUB_REPOSITORY.");
}
if (token === undefined) {
  throw new Error("Für den GitHub-Write-Nachweis fehlt ein GitHub-Credential.");
}

const api = new GitHubRestApi(token);
const vorher = await githubRepoNachweis(api, repo);
const suffix = env("GITHUB_RUN_ID") ?? String(Date.now());
let zweig: GitHubArbeitszweig | undefined;
let ausfuehrungsFehler: unknown;

try {
  zweig = await githubArbeitszweigAnlegen(
    api,
    repo,
    "live-nachweis",
    "repo-write",
    suffix,
  );

  if (zweig.branch === vorher.standardBranch || !zweig.branch.startsWith("byb/")) {
    throw new Error("Der Write-Nachweis hat keinen isolierten BYB-Arbeitsbranch erzeugt.");
  }

  const geschrieben = await api.ref(repo, zweig.branch);
  if (geschrieben !== zweig.basisSha || geschrieben !== vorher.standardSha) {
    throw new Error("Der temporäre Arbeitsbranch zeigt nicht exakt auf den geprüften Basis-Commit.");
  }

  console.error(`GitHub Write geprüft: ${repo}`);
  console.error(`Temporärer Branch: ${zweig.branch}`);
  console.error(`Basis-Commit: ${zweig.basisSha.slice(0, 8)}`);
  console.error(
    `Credential: ${dauerhaft === undefined ? "kurzlebiger GitHub-Actions-Token" : "BYB_GITHUB_LIVE_TOKEN"}`,
  );
} catch (fehler) {
  ausfuehrungsFehler = fehler;
}

let cleanupFehler: unknown;
if (zweig !== undefined) {
  try {
    await githubArbeitszweigLoeschen(api, zweig);
    try {
      await api.ref(repo, zweig.branch);
      throw new Error("Der temporäre BYB-Arbeitsbranch konnte nicht vollständig entfernt werden.");
    } catch (fehler) {
      if (!istGitHubNichtGefunden(fehler)) throw fehler;
    }
    console.error(`Temporärer Branch gelöscht: ${zweig.branch}`);
  } catch (fehler) {
    cleanupFehler = fehler;
  }
}

if (ausfuehrungsFehler !== undefined && cleanupFehler !== undefined) {
  throw new AggregateError(
    [ausfuehrungsFehler, cleanupFehler],
    "GitHub-Write-Nachweis und anschließender Cleanup sind fehlgeschlagen.",
  );
}
if (cleanupFehler !== undefined) throw cleanupFehler;
if (ausfuehrungsFehler !== undefined) throw ausfuehrungsFehler;
