/**
 * Die eine Quelle fuer konkrete Zugangsdaten-Muster.
 *
 * Angreifer, CI-Waechter und regelbasierter Fixer duerfen nicht je eine eigene
 * Liste pflegen. Sonst erkennt einer einen Fund, waehrend der andere ihn
 * durchlaesst oder nicht reparieren kann.
 */

export interface ZugangsdatenMuster {
  readonly name: string;
  readonly umgebungsvariable: string;
  readonly muster: RegExp;
}

export const ZUGANGSDATEN_MUSTER: readonly ZugangsdatenMuster[] = [
  {
    name: "OpenAI-Schlüssel",
    umgebungsvariable: "OPENAI_API_KEY",
    muster: /\bsk-[A-Za-z0-9]{20,}\b/,
  },
  {
    name: "NVIDIA-Schlüssel",
    umgebungsvariable: "NVIDIA_API_KEY",
    muster: /\bnvapi-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "Neon-Schlüssel",
    umgebungsvariable: "NEON_API_KEY",
    muster: /\bnapi_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: "GitHub-Token",
    umgebungsvariable: "GITHUB_TOKEN",
    muster: /\bghp_[A-Za-z0-9]{30,}\b/,
  },
  {
    name: "Stripe-Schlüssel",
    umgebungsvariable: "STRIPE_SECRET_KEY",
    muster: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: "privater Schlüssel",
    umgebungsvariable: "PRIVATE_KEY",
    muster: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    name: "Datenbank-Zugang mit Passwort",
    umgebungsvariable: "DATABASE_URL",
    muster: /\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/,
  },
];

export interface ZugangsdatenTreffer {
  readonly regel: ZugangsdatenMuster;
  readonly start: number;
  readonly ende: number;
}

/** Liefert Position und Regel, aber niemals den gefundenen Wert selbst. */
export function zugangsdatenTreffer(inhalt: string): readonly ZugangsdatenTreffer[] {
  const funde: ZugangsdatenTreffer[] = [];
  for (const regel of ZUGANGSDATEN_MUSTER) {
    const treffer = regel.muster.exec(inhalt);
    if (treffer === null) continue;
    funde.push({
      regel,
      start: treffer.index,
      ende: treffer.index + treffer[0].length,
    });
  }
  return funde;
}
