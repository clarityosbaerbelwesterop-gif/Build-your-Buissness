import { z } from "zod";

import {
  githubAppJwt,
  type GitHubAppKonfiguration,
} from "./github-app.js";

const InstallationId = z.number().int().positive().safe();
const InstallationAntwort = z.object({
  id: InstallationId,
  app_id: z.number().int().positive().safe(),
  account: z.object({ login: z.string().min(1).max(200) }).passthrough(),
  permissions: z.record(z.string(), z.enum(["read", "write"])),
}).passthrough();

export interface GitHubInstallationStand {
  readonly id: number;
  readonly konto: string;
  readonly permissions: Readonly<Record<string, "read" | "write">>;
}

export async function githubInstallationPruefen(
  konfiguration: GitHubAppKonfiguration,
  installationIdRoh: number,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubInstallationStand> {
  const installationId = InstallationId.parse(installationIdRoh);
  const jwt = await githubAppJwt(konfiguration);
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2026-03-10",
        "user-agent": "BYB-Connector-Hub",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub Installation konnte nicht geprüft werden (HTTP ${response.status}).`);
  }
  const daten = InstallationAntwort.parse(await response.json());
  if (daten.app_id !== konfiguration.appId) {
    throw new Error("GitHub Installation gehört nicht zur BYB GitHub App.");
  }
  if (daten.permissions.contents !== "write" || daten.permissions.pull_requests !== "write") {
    throw new Error("GitHub Installation besitzt nicht die für BYB benötigten Schreibrechte.");
  }
  return { id: daten.id, konto: daten.account.login, permissions: daten.permissions };
}
