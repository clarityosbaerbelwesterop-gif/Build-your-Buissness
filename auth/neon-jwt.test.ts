import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { describe, expect, it } from "vitest";

import {
  AuthTokenFehler,
  bearerTokenAus,
  neonJwtKonfigurationAusUmgebung,
  neonJwtPruefer,
  type NeonJwtKonfiguration,
} from "./neon-jwt.js";

const ORIGIN = "https://auth.example.test";
const BASIS = `${ORIGIN}/neondb/auth`;
const KONFIGURATION: NeonJwtKonfiguration = {
  jwksUrl: `${BASIS}/.well-known/jwks.json`,
  issuer: ORIGIN,
  audience: ORIGIN,
};
const KID = "m07-test-key";

type PrivaterSchluessel = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

async function pruefumgebung(): Promise<{
  readonly pruefer: ReturnType<typeof neonJwtPruefer>;
  readonly privat: PrivaterSchluessel;
}> {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: KID,
    alg: "EdDSA",
    use: "sig",
  };
  const quelle = createLocalJWKSet({ keys: [jwk] });
  return {
    pruefer: neonJwtPruefer(KONFIGURATION, quelle),
    privat: privateKey,
  };
}

async function tokenBauen(
  privat: PrivaterSchluessel,
  optionen: {
    readonly issuer?: string;
    readonly audience?: string;
    readonly sub?: string | null;
    readonly exp?: number;
    readonly nbf?: number;
  } = {},
): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  let token = new SignJWT({ zweck: "m07-test" })
    .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
    .setIssuer(optionen.issuer ?? ORIGIN)
    .setAudience(optionen.audience ?? ORIGIN)
    .setIssuedAt(jetzt)
    .setExpirationTime(optionen.exp ?? jetzt + 300);

  if (optionen.sub !== null) token = token.setSubject(optionen.sub ?? "nutzer-123");
  if (optionen.nbf !== undefined) token = token.setNotBefore(optionen.nbf);
  return token.sign(privat);
}

describe("Neon-JWT-Verifikation", () => {
  it("übernimmt sub erst nach gültiger Signatur, Issuer und Audience", async () => {
    const { pruefer, privat } = await pruefumgebung();
    const identitaet = await pruefer(await tokenBauen(privat));
    expect(identitaet).toEqual({ nutzerId: "nutzer-123" });
  });

  it("lehnt ein Token mit fremder Signatur ab", async () => {
    const { pruefer } = await pruefumgebung();
    const fremd = await generateKeyPair("EdDSA");
    await expect(pruefer(await tokenBauen(fremd.privateKey))).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("lehnt einen falschen Issuer ab", async () => {
    const { pruefer, privat } = await pruefumgebung();
    const token = await tokenBauen(privat, { issuer: "https://fremd.example.test" });
    await expect(pruefer(token)).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("lehnt eine falsche Audience ab", async () => {
    const { pruefer, privat } = await pruefumgebung();
    const token = await tokenBauen(privat, { audience: "https://andere-app.example.test" });
    await expect(pruefer(token)).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("lehnt ein abgelaufenes Token ab", async () => {
    const { pruefer, privat } = await pruefumgebung();
    const token = await tokenBauen(privat, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(pruefer(token)).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("lehnt ein noch nicht gültiges Token ab", async () => {
    const { pruefer, privat } = await pruefumgebung();
    const token = await tokenBauen(privat, { nbf: Math.floor(Date.now() / 1000) + 60 });
    await expect(pruefer(token)).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("lehnt ein Token ohne sub ab", async () => {
    const { pruefer, privat } = await pruefumgebung();
    await expect(pruefer(await tokenBauen(privat, { sub: null }))).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("liest genau ein Bearer-Token aus dem Authorization-Header", () => {
    expect(bearerTokenAus("Bearer abc.def.ghi-0123456789")).toBe("abc.def.ghi-0123456789");
    expect(() => bearerTokenAus(undefined)).toThrow(AuthTokenFehler);
    expect(() => bearerTokenAus("Basic abc.def.ghi-0123456789")).toThrow(AuthTokenFehler);
    expect(() => bearerTokenAus("Bearer eins zwei")).toThrow(AuthTokenFehler);
  });

  it("nimmt Issuer und Audience standardmäßig aus dem Auth-Endpoint-Origin", () => {
    const config = neonJwtKonfigurationAusUmgebung({
      NEON_AUTH_BASE_URL: BASIS,
      NEON_AUTH_JWKS_URL: `${BASIS}/.well-known/jwks.json`,
    });
    expect(config).toEqual(KONFIGURATION);
  });

  it("verlangt HTTPS für Auth-Endpunkte", () => {
    expect(() => neonJwtKonfigurationAusUmgebung({
      NEON_AUTH_BASE_URL: "http://auth.example.test",
      NEON_AUTH_JWKS_URL: "http://auth.example.test/jwks",
    })).toThrow();
  });
});
