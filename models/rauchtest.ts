/**
 * Rauchtest: antworten die drei Modelle wirklich?
 *
 * Läuft nur in der CI, wo die Schlüssel liegen — ein Test im normalen Lauf
 * dürfte kein Netz brauchen. Er fragt jedes Modell **einmal** mit einem
 * winzigen Auftrag; das ist der günstigste Beweis, dass ein Schlüssel gilt und
 * das Modell unter der eingetragenen Kennung erreichbar ist.
 *
 * Was er nie ausgibt: den Schlüssel, und den Text der Antwort. Das Protokoll
 * eines CI-Laufs ist für jeden lesbar, der Zugriff auf das Repository hat.
 */

import { MODELLE, fragen, rolleVerfuegbar, type Rolle } from "./nvidia.js";

interface Ergebnis {
  readonly rolle: Rolle;
  readonly kennung: string;
  readonly zustand: "antwortet" | "kein zugang" | "fehler";
  readonly hinweis: string;
}

async function pruefen(rolle: Rolle, kennung: string): Promise<Ergebnis> {
  if (!rolleVerfuegbar(rolle)) {
    return { rolle, kennung, zustand: "kein zugang",
             hinweis: "Schlüssel nicht hinterlegt" };
  }
  const begonnen = Date.now();
  try {
    const antwort = await fragen(rolle, {
      system: "Antworte mit genau einem Wort.",
      prompt: "Sag: bereit",
    }, { zeitgrenzeMs: 60_000 });
    const dauer = Date.now() - begonnen;
    // Nur Laenge und Tokenzahl, nie der Text: eine Modellantwort kann alles
    // enthalten, auch etwas aus dem Kontext des Anbieters.
    return {
      rolle, kennung, zustand: "antwortet",
      hinweis: `${dauer} ms, ${antwort.tokensEin}+${antwort.tokensAus} Tokens, `
        + `${antwort.text.length} Zeichen`,
    };
  } catch (fehler) {
    return { rolle, kennung, zustand: "fehler",
             hinweis: (fehler as Error).message };
  }
}

const ergebnisse = await Promise.all(
  MODELLE.map((m) => pruefen(m.rolle, m.kennung)),
);

const breite = Math.max(...ergebnisse.map((e) => e.kennung.length));
for (const e of ergebnisse) {
  console.error(`${e.rolle.padEnd(8)} ${e.kennung.padEnd(breite)}  ${e.zustand.padEnd(12)}  ${e.hinweis}`);
}

const kaputt = ergebnisse.filter((e) => e.zustand === "fehler");
const ohne = ergebnisse.filter((e) => e.zustand === "kein zugang");
console.error("");

if (kaputt.length > 0) {
  console.error(`${kaputt.length} Modell(e) antworten nicht. Siehe oben.`);
  process.exit(1);
}
if (ohne.length === MODELLE.length) {
  // Kein Fehlschlag: ohne Secrets ist das der erwartete Zustand, etwa in einem
  // PR aus einem Fork. Ein roter Lauf dafuer waere ein Waechter, der schreit,
  // ohne dass jemand etwas falsch gemacht hat.
  console.error("Kein einziger Schlüssel hinterlegt — nichts geprüft.");
} else {
  console.error(`${ergebnisse.length - ohne.length} von ${MODELLE.length} Modellen antworten.`);
}
