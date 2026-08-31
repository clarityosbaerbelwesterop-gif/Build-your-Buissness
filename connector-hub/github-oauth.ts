import { z } from "zod";

import type { GitHubAppKonfiguration } from "./github-app.js";

const State = z.string().min(32).max(300).regex(/^[A-Za-z0-9_-]+$/);

export function githubBenutzerAutorisierungsUrl(
  konfiguration: Pick<GitHubAppKonfiguration, "clientId">,
  stateRoh: string,
  redirectUriRoh: string,
): string {
  const state = State.parse(stateRoh);
  const redirectUri = new URL(redirectUriRoh);
  if (redirectUri.protocol !== "https:") {
    throw new Error("GitHub OAuth Callback muss HTTPS verwenden.");
  }
  if (redirectUri.username !== "" || redirectUri.password !== "") {
    throw new Error("GitHub OAuth Callback darf keine Zugangsdaten enthalten.");
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", konfiguration.clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri.toString());
  return url.toString();
}
