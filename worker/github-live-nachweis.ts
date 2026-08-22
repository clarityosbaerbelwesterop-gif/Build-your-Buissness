import { GitHubRestApi, githubRepoNachweis } from "./github-executor.js";

function env(name: string): string | undefined {
  const wert = process.env[name]?.trim();
  return wert === "" ? undefined : wert;
}

const token = env("BYB_GITHUB_LIVE_TOKEN") ?? env("GITHUB_TOKEN");
const repo = env("GITHUB_REPOSITORY");

if (token === undefined) {
  throw new Error("Für den GitHub-Livenachweis fehlt ein GitHub-Credential.");
}
if (repo === undefined) {
  throw new Error("Für den GitHub-Livenachweis fehlt GITHUB_REPOSITORY.");
}

const ergebnis = await githubRepoNachweis(new GitHubRestApi(token), repo);
console.error(`GitHub live geprüft: ${ergebnis.repo}`);
console.error(`Standardbranch: ${ergebnis.standardBranch}`);
console.error(`Sichtbarkeit: ${ergebnis.privat ? "privat" : "öffentlich"}`);
console.error(`Basis-Commit: ${ergebnis.standardSha.slice(0, 8)}`);
console.error("Keine Schreibaktion ausgeführt.");
