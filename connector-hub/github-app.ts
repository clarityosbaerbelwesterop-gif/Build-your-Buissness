import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

import { pflicht } from "../config/umgebung.js";

const API_VERSION = "2026-03-10";
const InstallationId = z.number().int().positive().safe();
const Repo = z.object({
  id: z.number().int().positive().safe(),
  full_name: z.string().min(3).max(300),
  private: z.boolean(),
  permissions: z
    .object({
      admin: z.boolean().optional(),
      maintain: z.boolean().optional(),
      push: z.boolean().optional(),
      triage: z.boolean().optional(),
      pull: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

const InstallationsAntwort = z.object({
  installations: z.array(z.object({
    id: InstallationId,
    app_id: z.number().int().positive().safe(),
    account: z.object({ login: z.string().min(1).max(200) }).passthrough(),
  }).passthrough()).max(100),
}).passthrough();

const ReposAntwort = z.object({
  total_count: z.number().int().min(0),
  repositories: z.array(Repo).max(100),
}).passthrough();

const TokenAntwort = z.object({
  access_token: z.string().min(20),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

const InstallationTokenAntwort = z.object({
  token: z.string().min(20),
  expires_at: z.string().min(10),
});

export interface GitHubAppKonfiguration {
  readonly appId: number;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly appSlug: string;
  readonly privateKeyPem: string;
}

export interface GitHubInstallationOption {
  readonly id: number;
  readonly konto: string;
  readonly repos: readonly GitHubRepoOption[];
}

export interface GitHubRepoOption {
  readonly id: number;
  readonly name: string;
  readonly privat: boolean;
}

export function githubAppKonfigurationAusUmgebung(
  umgebung: Record<string, string | undefined> = process.env,
): GitHubAppKonfiguration {
  const appId = Number(pflicht("GITHUB_APP_ID", "GitHub App verbinden", umgebung));
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error("GITHUB_APP_ID ist ungültig.");
  const privateKey = pflicht("GITHUB_APP_PRIVATE_KEY", "GitHub App signieren", umgebung)
    .replace(/\\n/g, "\n");
  if (!privateKey.includes("BEGIN RSA PRIVATE KEY") && !privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("GITHUB_APP_PRIVATE_KEY ist kein PEM-Schlüssel.");
  }
  return {
    appId,
    clientId: pflicht("GITHUB_APP_CLIENT_ID", "GitHub App OAuth", umgebung),
    clientSecret: pflicht("GITHUB_APP_CLIENT_SECRET", "GitHub App OAuth", umgebung),
    appSlug: pflicht("GITHUB_APP_SLUG", "GitHub App installieren", umgebung),
    privateKeyPem: privateKey,
  };
}

export function githubInstallationsUrl(appSlug: string, state: string): string {
  const slug = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9-]+$/).parse(appSlug);
  const stateWert = z.string().min(32).max(300).regex(/^[A-Za-z0-9_-]+$/).parse(state);
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", stateWert);
  return url.toString();
}

function githubHeaders(token: string): Headers {
  return new Headers({
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": API_VERSION,
    "user-agent": "BYB-Connector-Hub",
  });
}

async function jsonAntwort(response: Response, kontext: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${kontext} wurde von GitHub abgelehnt (HTTP ${response.status}).`);
  return response.json() as Promise<unknown>;
}

export async function githubBenutzerTokenAusCode(
  konfiguration: GitHubAppKonfiguration,
  codeRoh: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const code = z.string().trim().min(10).max(500).parse(codeRoh);
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: konfiguration.clientId,
      client_secret: konfiguration.clientSecret,
      code,
    }),
  });
  const daten = TokenAntwort.parse(await jsonAntwort(response, "GitHub OAuth"));
  return daten.access_token;
}

export async function githubInstallationenFuerBenutzer(
  konfiguration: GitHubAppKonfiguration,
  benutzerToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly GitHubInstallationOption[]> {
  const response = await fetchImpl("https://api.github.com/user/installations?per_page=100", {
    headers: githubHeaders(benutzerToken),
  });
  const daten = InstallationsAntwort.parse(await jsonAntwort(response, "GitHub Installationen"));
  const eigene = daten.installations.filter((installation) => installation.app_id === konfiguration.appId);
  const ergebnis: GitHubInstallationOption[] = [];
  for (const installation of eigene) {
    const repoResponse = await fetchImpl(
      `https://api.github.com/user/installations/${installation.id}/repositories?per_page=100`,
      { headers: githubHeaders(benutzerToken) },
    );
    const repos = ReposAntwort.parse(await jsonAntwort(repoResponse, "GitHub Repository-Liste"));
    ergebnis.push({
      id: installation.id,
      konto: installation.account.login,
      repos: repos.repositories.map((repo) => ({
        id: repo.id,
        name: repo.full_name,
        privat: repo.private,
      })),
    });
  }
  return ergebnis;
}

export async function githubAppJwt(
  konfiguration: Pick<GitHubAppKonfiguration, "clientId" | "privateKeyPem">,
  jetztMs = Date.now(),
): Promise<string> {
  const schluessel = await importPKCS8(konfiguration.privateKeyPem, "RS256");
  const jetzt = Math.floor(jetztMs / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(jetzt - 60)
    .setExpirationTime(jetzt + 9 * 60)
    .setIssuer(konfiguration.clientId)
    .sign(schluessel);
}

async function installationsToken(
  konfiguration: GitHubAppKonfiguration,
  installationIdRoh: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const installationId = InstallationId.parse(installationIdRoh);
  const jwt = await githubAppJwt(konfiguration);
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    { method: "POST", headers: githubHeaders(jwt) },
  );
  const daten = InstallationTokenAntwort.parse(
    await jsonAntwort(response, "GitHub Installationstoken"),
  );
  return daten.token;
}

export async function githubInstallationRepos(
  konfiguration: GitHubAppKonfiguration,
  installationId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly GitHubRepoOption[]> {
  const token = await installationsToken(konfiguration, installationId, fetchImpl);
  const response = await fetchImpl("https://api.github.com/installation/repositories?per_page=100", {
    headers: githubHeaders(token),
  });
  const daten = ReposAntwort.parse(await jsonAntwort(response, "GitHub Installation-Repositories"));
  return daten.repositories.map((repo) => ({ id: repo.id, name: repo.full_name, privat: repo.private }));
}
