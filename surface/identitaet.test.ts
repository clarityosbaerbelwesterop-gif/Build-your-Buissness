import { describe, expect, it } from "vitest";

import { AuthTokenFehler } from "../auth/neon-jwt.js";
import {
  UNPAID_SURFACE_FLAG,
  UNPAID_SURFACE_NUTZER_ID,
  surfaceIdentitaetAus,
  unpaidSurfaceErlaubt,
} from "./identitaet.js";

function anfrage(authorization?: string): Request {
  if (authorization === undefined) {
    return new Request("https://build-your-buissness.vercel.app/api/surface");
  }
  return new Request("https://build-your-buissness.vercel.app/api/surface", {
    headers: { authorization },
  });
}

describe("Unbezahlte Surface-Identität", () => {
  it("ist nur bei genau 1 aktiv", () => {
    expect(unpaidSurfaceErlaubt({})).toBe(false);
    expect(unpaidSurfaceErlaubt({ [UNPAID_SURFACE_FLAG]: "" })).toBe(false);
    expect(unpaidSurfaceErlaubt({ [UNPAID_SURFACE_FLAG]: "true" })).toBe(false);
    expect(unpaidSurfaceErlaubt({ [UNPAID_SURFACE_FLAG]: "0" })).toBe(false);
    expect(unpaidSurfaceErlaubt({ [UNPAID_SURFACE_FLAG]: "1" })).toBe(true);
    expect(unpaidSurfaceErlaubt({ [UNPAID_SURFACE_FLAG]: " 1 " })).toBe(true);
  });

  it("lehnt fehlendes Token ab, wenn das Flag nicht gesetzt ist", async () => {
    await expect(surfaceIdentitaetAus(anfrage(), {})).rejects.toBeInstanceOf(AuthTokenFehler);
  });

  it("verwendet die Gastkennung ohne Token, wenn das Flag gesetzt ist", async () => {
    await expect(surfaceIdentitaetAus(anfrage(), { [UNPAID_SURFACE_FLAG]: "1" }))
      .resolves.toEqual({ nutzerId: UNPAID_SURFACE_NUTZER_ID });
  });

  it("deutet einen ungültigen Bearer nicht zum Gast um", async () => {
    await expect(
      surfaceIdentitaetAus(anfrage("Bearer nicht-gueltig-und-zu-kurz"), {
        [UNPAID_SURFACE_FLAG]: "1",
      }),
    ).rejects.toBeInstanceOf(AuthTokenFehler);
  });
});
