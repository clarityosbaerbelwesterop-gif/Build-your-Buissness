export type AuthDienstErgebnis<T> =
  | { readonly status: "ok"; readonly wert: T }
  | { readonly status: "auth_fehler" }
  | { readonly status: "dienst_fehler" };

/**
 * Authentifizierung und nachgelagerte Dienst-/DB-Arbeit sind zwei getrennte
 * Fehlerdomänen. Ein Ausfall nach erfolgreich verifizierter Identität darf
 * niemals als 401 erscheinen, weil die UI sonst eine erneute Anmeldung fordert
 * und den eigentlichen Betriebsfehler versteckt.
 */
export async function authUndDienst<TIdentitaet, TWert>(
  authentifizieren: () => Promise<TIdentitaet>,
  dienst: (identitaet: TIdentitaet) => Promise<TWert>,
): Promise<AuthDienstErgebnis<TWert>> {
  let identitaet: TIdentitaet;
  try {
    identitaet = await authentifizieren();
  } catch {
    return { status: "auth_fehler" };
  }

  try {
    return { status: "ok", wert: await dienst(identitaet) };
  } catch {
    return { status: "dienst_fehler" };
  }
}
