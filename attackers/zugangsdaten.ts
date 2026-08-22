/**
 * Angreifer: Zugangsdaten im Quelltext und im ausgelieferten Bündel.
 *
 * Zwei Prüfungen, eine Kategorie. Für den Nutzer ist es eine Protokollzeile
 * („Zugangsdaten"), für die Prüfung sind es zwei verschiedene Fragen:
 *
 * 1. Steht ein Schlüssel irgendwo im Quelltext?
 * 2. Steht er in einer Datei, die **im Browser landet**? Das ist der
 *    schlimmere Fall: dort liest ihn jeder Besucher, ohne Zugang zum Repo.
 *
 * Warum Muster und kein Sprachmodell: ein Schlüssel hat eine Form. Ein Modell
 * würde hier raten, langsamer sein und Geld kosten — und bei einer Frage, die
 * sich exakt beantworten lässt, ist Raten die schlechtere Antwort.
 */

import type { Angreifer, Datei, RoherBefund, Ziel } from "../core/schnittstellen.js";
import { zugangsdatenTreffer } from "./zugangsdaten-muster.js";

/**
 * Dateien, deren Inhalt im Browser landet.
 *
 * `NEXT_PUBLIC_` und `VITE_` sind der klassische Fall: die Variable heißt
 * harmlos, wird aber beim Bauen in das Bündel geschrieben. Wer dort einen
 * Server-Schlüssel hineinlegt, veröffentlicht ihn.
 */
const IM_BROWSER = /(^|\/)(app|pages|src|components|public|client)\//i;
const OEFFENTLICHE_VARIABLE = /\b(NEXT_PUBLIC_|VITE_|PUBLIC_)[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)\b/;

/** Testdateien und Beispiele sind kein Fund — dort stehen Attrappen. */
const NUR_BEISPIEL = /(^|\/)(.*\.(test|spec)\.[jt]sx?|.*\.example(\..*)?|.*\.sample(\..*)?)$/i;

function zeileVon(inhalt: string, treffer: number): number {
  return inhalt.slice(0, treffer).split("\n").length;
}

/** Nie den Fund selbst mitliefern — der Nachweis darf den Schlüssel nicht enthalten. */
function nachweis(datei: Datei, zeile: number, was: string): string {
  return `${datei.pfad}:${zeile}  ${was}`;
}

export const zugangsdatenImQuelltext: Angreifer = {
  klasse: "zugangsdaten-im-quelltext",
  kategorie: "zugangsdaten",
  brauchtLaufzeit: false,
  angreifen: (ziel: Ziel) => Promise.resolve(pruefen(ziel)),
};

function pruefen(ziel: Ziel): RoherBefund[] {
  const funde: RoherBefund[] = [];
  for (const datei of ziel.dateien) {
    if (NUR_BEISPIEL.test(datei.pfad)) continue;
    const oeffentlich = IM_BROWSER.test(datei.pfad);

    for (const treffer of zugangsdatenTreffer(datei.inhalt)) {
      const zeile = zeileVon(datei.inhalt, treffer.start);
      funde.push({
        schweregrad: oeffentlich ? "kritisch" : "hoch",
        klartext: oeffentlich
          ? `Ein ${treffer.regel.name} steht in einer Datei, die im Browser landet. Jeder Besucher `
            + `deiner Seite kann ihn auslesen und in deinem Namen verwenden.`
          : `Ein ${treffer.regel.name} steht im Quelltext. Jeder mit Zugriff auf das Repository `
            + `kann ihn lesen und in deinem Namen verwenden.`,
        nachweis: nachweis(datei, zeile, treffer.regel.name),
      });
    }

    const variable = OEFFENTLICHE_VARIABLE.exec(datei.inhalt);
    if (variable !== null) {
      const zeile = zeileVon(datei.inhalt, variable.index);
      funde.push({
        schweregrad: "hoch",
        klartext:
          `Eine Umgebungsvariable mit öffentlichem Präfix trägt einen Schlüssel im `
          + `Namen. Alles mit diesem Präfix wird beim Bauen in die Seite geschrieben `
          + `und ist für jeden Besucher lesbar.`,
        nachweis: nachweis(datei, zeile, variable[0]),
      });
    }
  }
  return funde;
}
