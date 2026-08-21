/**
 * Ausgabe für den CI-Lauf: welche Zugänge sind gesetzt?
 *
 * Beantwortet die Frage „liegen die Schlüssel richtig?", ohne einen davon
 * anzuzeigen. Das Protokoll eines CI-Laufs ist für jeden lesbar, der Zugriff
 * auf das Repository hat — ein Schlüssel darf dort nie landen, auch nicht in
 * einer Meldung, die es gut meint.
 */

import { zugangsUebersicht } from "./zugaenge.js";

const zeilen = zugangsUebersicht();
const breite = Math.max(...zeilen.map((z) => z.name.length));

for (const zeile of zeilen) {
  const zeichen = zeile.gesetzt ? "gesetzt      " : "nicht gesetzt";
  console.error(`${zeile.name.padEnd(breite)}  ${zeichen}  (ab ${zeile.abStufe})`);
}

const fehlend = zeilen.filter((z) => !z.gesetzt).map((z) => z.name);
console.error("");
if (fehlend.length === 0) {
  console.error("Alle bekannten Zugänge liegen in den Secrets.");
} else {
  // Kein Fehlschlag: in M0 braucht kein Schritt einen Zugang. Ein roter Lauf
  // dafür wäre ein Wächter, der bei jedem PR schreit, ohne dass jemand etwas
  // falsch gemacht hat — und so einer wird nach der dritten Meldung ignoriert.
  console.error(`Noch nicht hinterlegt: ${fehlend.join(", ")}`);
  console.error("In M0 wird keiner davon gebraucht.");
}
