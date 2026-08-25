import { generateKeyPairSync } from "node:crypto";

import { importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import {
  githubAppJwt,
  githubBenutzerTokenAusCode,
  githubInstallationRepos,
  githubInstallationenFuerBenutzer,
  githubInstallationsUrl,
  type GitHubAppKonfiguration,
} from "./github-app.js";

function schluessel() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function schluesselPkcs1() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
}

function konfiguration(privateKeyPem: string): GitHubAppKonfiguration {
  return {
    appId: 42,
    clientId: "Iv1.byb-test",
    clientSecret: "test-client-secret-value",
    appSlug: "byb-test-app",
    privateKeyPem,
  };
}

describe("GitHub App Connector", () => {
  it("baut eine Installation-URL mit korrelierendem State", () => {
    const state = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-";
    const url = new URL(githubInstallationsUrl("byb-test-app", state));
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/apps/byb-test-app/installations/new");
    expect(url.searchParams.get("state")).toBe(state);
  });

  it("signiert App-JWT als RS256 mit Client-ID und kurzer Laufzeit", async () => {
    const keys = schluessel();
    const jetzt = 2_000_000_000_000;
    const token = await githubAppJwt(konfiguration(keys.privateKey), jetzt);
    const publicKey = await importSPKI(keys.publicKey, "RS256");
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      issuer: "Iv1.byb-test",
    });

    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.iat).toBe(Math.floor(jetzt / 1000) - 60);
    expect(payload.exp).toBe(Math.floor(jetzt / 1000) + 9 * 60);
  });

  it("signiert auch einen von GitHub üblichen PKCS#1-RSA-Key", async () => {
    const keys = schluesselPkcs1();
    const token = await githubAppJwt(konfiguration(keys.privateKey), 2_000_000_000_000);
    const publicKey = await importSPKI(keys.publicKey, "RS256");

    await expect(jwtVerify(token, publicKey, { issuer: "Iv1.byb-test" })).resolves.toBeDefined();
  });

  it("tauscht einen OAuth-Code serverseitig und gibt nur das Benutzer-Token intern zurück", async () => {
    const keys = schluessel();
    const fetchImpl: typeof fetch = (input, init) => {
      expect(String(input)).toBe("https://github.com/login/oauth/access_token");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.client_id).toBe("Iv1.byb-test");
      expect(body.code).toBe("github-oauth-code-12345");
      return Promise.resolve(Response.json({ access_token: "ghu_test_access_token_123456789" }));
    };

    await expect(
      githubBenutzerTokenAusCode(konfiguration(keys.privateKey), "github-oauth-code-12345", fetchImpl),
    ).resolves.toBe("ghu_test_access_token_123456789");
  });

  it("liefert nur Installationen der eigenen App und deren Repositories", async () => {
    const keys = schluessel();
    let aufruf = 0;
    const fetchImpl: typeof fetch = (input) => {
      aufruf += 1;
      if (aufruf === 1) {
        expect(String(input)).toContain("/user/installations");
        return Promise.resolve(Response.json({
          installations: [
            { id: 7, app_id: 42, account: { login: "firma" } },
            { id: 8, app_id: 99, account: { login: "fremd" } },
          ],
        }));
      }
      expect(String(input)).toContain("/user/installations/7/repositories");
      return Promise.resolve(Response.json({
        total_count: 1,
        repositories: [{ id: 100, full_name: "firma/produkt", private: true }],
      }));
    };

    await expect(
      githubInstallationenFuerBenutzer(konfiguration(keys.privateKey), "ghu_user_token_123456789012", fetchImpl),
    ).resolves.toEqual([
      { id: 7, konto: "firma", repos: [{ id: 100, name: "firma/produkt", privat: true }] },
    ]);
  });

  it("erzeugt ein kurzlebiges Installationstoken und prüft die auswählbaren Repos erneut", async () => {
    const keys = schluessel();
    let aufruf = 0;
    const fetchImpl: typeof fetch = (input, init) => {
      aufruf += 1;
      if (aufruf === 1) {
        expect(String(input)).toContain("/app/installations/7/access_tokens");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("authorization")).toMatch(/^Bearer /);
        return Promise.resolve(Response.json({
          token: "ghs_installation_token_123456789",
          expires_at: "2026-08-24T12:00:00Z",
        }));
      }
      expect(String(input)).toBe("https://api.github.com/installation/repositories?per_page=100");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer ghs_installation_token_123456789",
      );
      return Promise.resolve(Response.json({
        total_count: 1,
        repositories: [{ id: 100, full_name: "firma/produkt", private: false }],
      }));
    };

    await expect(
      githubInstallationRepos(konfiguration(keys.privateKey), 7, fetchImpl),
    ).resolves.toEqual([{ id: 100, name: "firma/produkt", privat: false }]);
  });
});
