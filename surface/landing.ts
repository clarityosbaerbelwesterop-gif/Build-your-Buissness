import { fragen, rolleVerfuegbar, type Antwort } from "../models/nvidia.js";
import { LandingKopie, type LandingKopie as LandingKopieTyp } from "./v1.js";

type FragenFunktion = (
  rolle: "schnell",
  auftrag: { readonly system?: string; readonly prompt: string },
) => Promise<Antwort>;

export interface LandingOptionen {
  readonly fragenImpl?: FragenFunktion;
  readonly umgebung?: Record<string, string | undefined>;
}

function kuerzen(text: string, max: number): string {
  const geschnitten = text.replace(/\s+/g, " ").trim();
  if (geschnitten.length <= max) return geschnitten;
  const ende = geschnitten.lastIndexOf(" ", max - 1);
  return `${geschnitten.slice(0, ende > 20 ? ende : max - 1).trim()}…`;
}

function ersterSatz(idee: string): string {
  const treffer = idee.match(/[^.!?]+[.!?]?/);
  return (treffer?.[0] ?? idee).trim();
}

export function kopieAusIdee(idee: string): LandingKopieTyp {
  const text = idee.trim();
  const titel = kuerzen(ersterSatz(text), 80);
  const rest = text.slice(titel.endsWith("…") ? 0 : Math.min(titel.length, text.length)).trim();
  const untertitel = kuerzen(rest.length > 0 ? rest : text, 220);
  const absatz = kuerzen(
    rest.length > 0
      ? rest
      : "Hinterlasse deine Anfrage. BYB nimmt sie auf und der Agent folgt nach, sobald er verbunden ist.",
    400,
  );
  return LandingKopie.parse({
    titel,
    untertitel,
    cta: "Anfrage hinterlassen",
    absatz,
  });
}

function jsonAusText(text: string): unknown {
  const ohneFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = ohneFence.indexOf("{");
  const ende = ohneFence.lastIndexOf("}");
  if (start < 0 || ende <= start) throw new Error("Landing-Modell lieferte kein JSON-Objekt.");
  return JSON.parse(ohneFence.slice(start, ende + 1)) as unknown;
}

export function htmlText(wert: string): string {
  return wert
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function landingHtml(kopie: LandingKopieTyp): string {
  const titel = htmlText(kopie.titel);
  const untertitel = htmlText(kopie.untertitel);
  const cta = htmlText(kopie.cta);
  const absatz = htmlText(kopie.absatz);
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${titel}</title>
  <style>
    :root { --ink:#0F1720; --paper:#E6E4DD; --stahl:#5C6B7A; --cta:#17263A; }
    html,body { margin:0; background:var(--paper); color:var(--ink); font-family:Georgia,"Times New Roman",serif; }
    main { max-width:36rem; margin:0 auto; padding:48px 28px 56px; }
    p.kicker { font-family:system-ui,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--stahl); margin:0 0 18px; }
    h1 { font-size:clamp(28px,5vw,42px); line-height:1.12; letter-spacing:-.03em; margin:0 0 16px; font-weight:650; }
    .lead { font-size:18px; line-height:1.45; margin:0 0 22px; color:#243040; }
    .body { font-family:system-ui,sans-serif; font-size:15px; line-height:1.6; color:#334155; margin:0 0 28px; }
    .cta { display:inline-block; background:var(--cta); color:var(--paper); font-family:system-ui,sans-serif; font-size:14px; font-weight:700; padding:12px 18px; text-decoration:none; border-radius:3px; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Angebot</p>
    <h1>${titel}</h1>
    <p class="lead">${untertitel}</p>
    <p class="body">${absatz}</p>
    <a class="cta" href="#anfrage">${cta}</a>
  </main>
</body>
</html>`;
}

export async function landingKopieErzeugen(
  idee: string,
  optionen: LandingOptionen = {},
): Promise<LandingKopieTyp> {
  const fallback = kopieAusIdee(idee);
  const umgebung = optionen.umgebung ?? process.env;
  if (optionen.fragenImpl === undefined && !rolleVerfuegbar("schnell", umgebung)) {
    return fallback;
  }

  try {
    const frage = optionen.fragenImpl ?? ((rolle, auftrag) => fragen(rolle, auftrag, { umgebung }));
    const antwort = await frage("schnell", {
      system: [
        "Du schreibst die Texte einer einzelnen Angebotsseite.",
        "Antworte ausschließlich als JSON mit titel, untertitel, cta, absatz.",
        "Keine Zahlungsversprechen, keine technischen Anbieternamen, keine erfundenen Kennzahlen.",
        "Du-Form, Deutsch, ruhig und konkret.",
      ].join(" "),
      prompt: `Idee: ${idee}`,
    });
    return LandingKopie.parse(jsonAusText(antwort.text));
  } catch {
    return fallback;
  }
}