/**
 * Die Angriffs-und-Fix-Schleife.
 *
 * Eine Runde ist: alle Angreifer laufen lassen → Fixer auf die offenen Befunde
 * → geänderte Dateien übernehmen → nächste Runde prüft **alles noch einmal**.
 */

import type {
  Abbruchgrund,
  Befund,
  Kosten,
  Protokoll,
  Runde,
} from "../protocol/v1.js";
import { PROTOKOLL_VERSION, endzustandAus, istOffen } from "../protocol/v1.js";
import type {
  Angreifer,
  Datei,
  Fixer,
  Kostenzaehler,
  RoherBefund,
  Ziel,
} from "./schnittstellen.js";
import { Zeitzaehler } from "./schnittstellen.js";

export interface Grenzen {
  readonly maxRunden: number;
  readonly maxTokens: number;
  readonly maxLaufzeitMs: number;
}

export const STANDARD_GRENZEN: Grenzen = {
  maxRunden: 3,
  maxTokens: 0,
  maxLaufzeitMs: 0,
};

export interface LaufOptionen {
  readonly ziel: Ziel;
  readonly angreifer: readonly Angreifer[];
  readonly fixer: Fixer;
  readonly grenzen?: Partial<Grenzen>;
  readonly kostenzaehler?: Kostenzaehler;
  readonly jetzt?: () => number;
}

interface Fundstelle {
  readonly klasse: string;
  readonly kategorie: Befund["kategorie"];
  readonly roh: RoherBefund;
}

function kennung(klasse: string, nachweis: string): string {
  return `${klasse}::${nachweis}`;
}

/**
 * Fix-Dateien in das aktuelle Ziel übernehmen.
 *
 * Der Fixer schreibt nicht ins Dateisystem. Er liefert eine neue Fassung der
 * betroffenen Dateien. Erst hier wird daraus der Zustand, den die nächste
 * Prüfrunde sieht. Ohne diesen Schritt würde Runde 2 immer wieder den alten
 * Quelltext angreifen und jeder echte Fix als „wieder aufgetreten" erscheinen.
 */
function dateienAnwenden(ziel: Ziel, geaendert: readonly Datei[]): Ziel {
  if (geaendert.length === 0) return ziel;
  const karte = new Map(ziel.dateien.map((datei) => [datei.pfad, datei]));
  for (const datei of geaendert) karte.set(datei.pfad, datei);
  return { ...ziel, dateien: [...karte.values()] };
}

export async function schleifeLaufen(optionen: LaufOptionen): Promise<Protokoll> {
  const grenzen: Grenzen = { ...STANDARD_GRENZEN, ...optionen.grenzen };
  const jetzt = optionen.jetzt ?? (() => Date.now());
  const zaehler = optionen.kostenzaehler ?? new Zeitzaehler(jetzt);
  const begonnen = jetzt();

  const befunde = new Map<string, Befund>();
  const runden: Runde[] = [];
  const gelaufeneKlassen = new Set<string>();
  let laufendeNummer = 0;
  let abbruchgrund: Abbruchgrund = "rundenlimit";
  let aktuellesZiel: Ziel = { ...optionen.ziel, dateien: [...optionen.ziel.dateien] };

  const gesamt: Kosten = { tokens_ein: 0, tokens_aus: 0, laufzeit_ms: 0 };

  for (let runde = 1; runde <= grenzen.maxRunden; runde++) {
    zaehler.beginnen();
    const klassenDieserRunde: string[] = [];

    const gefunden: Fundstelle[] = [];
    for (const angreifer of optionen.angreifer) {
      if (angreifer.brauchtLaufzeit && aktuellesZiel.laufzeit === undefined) continue;
      klassenDieserRunde.push(angreifer.klasse);
      gelaufeneKlassen.add(angreifer.klasse);
      const rohe = await angreifer.angreifen(aktuellesZiel, {
        runde,
        bisherige: [...befunde.values()],
      });
      for (const roh of rohe) {
        gefunden.push({ klasse: angreifer.klasse, kategorie: angreifer.kategorie, roh });
      }
    }

    const jetztGefunden = new Set<string>();
    for (const stelle of gefunden) {
      const schluessel = kennung(stelle.klasse, stelle.roh.nachweis);
      jetztGefunden.add(schluessel);
      const vorher = befunde.get(schluessel);
      if (vorher === undefined) {
        befunde.set(schluessel, {
          id: `${optionen.ziel.lauf_id}-${befunde.size + 1}`,
          kategorie: stelle.kategorie,
          angriffsklasse: stelle.klasse,
          schweregrad: stelle.roh.schweregrad,
          klartext: stelle.roh.klartext,
          nachweis: stelle.roh.nachweis,
          zustand: "gefunden",
          runde,
          zeitstempel: jetzt(),
        });
        continue;
      }
      befunde.set(schluessel, {
        ...vorher,
        zustand:
          vorher.zustand === "behoben" || vorher.zustand === "fix_versucht"
            ? "wieder_aufgetreten"
            : vorher.zustand,
      });
    }

    for (const [schluessel, befund] of befunde) {
      if (jetztGefunden.has(schluessel)) continue;
      if (befund.zustand === "fix_versucht" || befund.zustand === "wieder_aufgetreten") {
        befunde.set(schluessel, { ...befund, zustand: "behoben" });
      }
    }

    for (const [schluessel, befund] of befunde) {
      if (!istOffen(befund)) continue;
      const versuch = await optionen.fixer.fixen(befund, aktuellesZiel);
      if (versuch.geaendert) aktuellesZiel = dateienAnwenden(aktuellesZiel, versuch.dateien);
      befunde.set(schluessel, {
        ...befund,
        zustand:
          befund.zustand === "wieder_aufgetreten"
            ? "wieder_aufgetreten"
            : versuch.geaendert
              ? "fix_versucht"
              : "offen",
      });
    }

    const kosten = zaehler.beenden();
    gesamt.tokens_ein += kosten.tokens_ein;
    gesamt.tokens_aus += kosten.tokens_aus;
    gesamt.laufzeit_ms += kosten.laufzeit_ms;
    laufendeNummer = runde;

    runden.push({
      nummer: runde,
      gelaufene_klassen: klassenDieserRunde,
      befunde: [...befunde.values()],
      kosten,
    });

    const offeneDa = [...befunde.values()].some(istOffen);
    if (!offeneDa) {
      abbruchgrund = "keine_offenen_befunde";
      break;
    }
    if (deckelErreicht(gesamt, grenzen)) {
      abbruchgrund = "kostendeckel";
      break;
    }
    abbruchgrund = "rundenlimit";
  }

  if (laufendeNummer === 0) abbruchgrund = "rundenlimit";

  const alle = [...befunde.values()];
  return {
    version: PROTOKOLL_VERSION,
    lauf_id: optionen.ziel.lauf_id,
    begonnen,
    beendet: jetzt(),
    gelaufene_klassen: [...gelaufeneKlassen],
    runden,
    befunde: alle,
    endzustand: endzustandAus(alle),
    abbruchgrund,
    kosten_gesamt: gesamt,
  };
}

function deckelErreicht(gesamt: Kosten, grenzen: Grenzen): boolean {
  const tokens = gesamt.tokens_ein + gesamt.tokens_aus;
  if (grenzen.maxTokens > 0 && tokens >= grenzen.maxTokens) return true;
  if (grenzen.maxLaufzeitMs > 0 && gesamt.laufzeit_ms >= grenzen.maxLaufzeitMs) return true;
  return false;
}
