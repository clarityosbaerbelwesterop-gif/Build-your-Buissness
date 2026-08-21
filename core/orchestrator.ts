/**
 * Die Angriffs-und-Fix-Schleife.
 *
 * Eine Runde ist: alle Angreifer laufen lassen → Fixer auf die offenen Befunde
 * → nächste Runde prüft **alles noch einmal**, nicht nur das Neue.
 *
 * Warum alles noch einmal
 * -----------------------
 * Ein Fix kann einen früheren Fix zerstören. Wer in Runde 2 nur die neuen
 * Befunde prüft, sieht das nicht — der alte Fund gilt weiter als behoben, und
 * das Protokoll behauptet etwas, das nicht mehr stimmt. Genau dafür gibt es
 * den Zustand `wieder_aufgetreten`.
 *
 * Warum ein Fix keinen Erfolg bedeutet
 * ------------------------------------
 * Ein Fixer meldet einen **Versuch**. Ob der Fund weg ist, entscheidet allein
 * die erneute Prüfung. Deshalb wird ein Befund nach dem Fix auf `fix_versucht`
 * gesetzt und erst dann auf `behoben`, wenn ihn in der nächsten Runde kein
 * Angreifer mehr findet.
 *
 * Der Abbruchgrund steht im Protokoll
 * -----------------------------------
 * „Fertig" und „Rundenlimit erreicht" bedeuten für einen Nutzer völlig
 * verschiedene Dinge. Ein Protokoll ohne Abbruchgrund lässt beides gleich
 * aussehen — und das wäre die bequeme Lesart, nicht die wahre.
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
  Fixer,
  Kostenzaehler,
  RoherBefund,
  Ziel,
} from "./schnittstellen.js";
import { Zeitzaehler } from "./schnittstellen.js";

export interface Grenzen {
  /** Wie viele Runden höchstens. Standard 3. */
  readonly maxRunden: number;
  /** Kostendeckel in Tokens (ein und aus zusammen). 0 heißt: kein Deckel. */
  readonly maxTokens: number;
  /** Kostendeckel in Millisekunden Laufzeit. 0 heißt: kein Deckel. */
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
  /** Für Tests: feste Zeit statt `Date.now()`. */
  readonly jetzt?: () => number;
}

/** Ein Befund ohne die Felder, die der Orchestrator vergibt. */
interface Fundstelle {
  readonly klasse: string;
  readonly kategorie: Befund["kategorie"];
  readonly roh: RoherBefund;
}

/**
 * Zwei Funde sind derselbe, wenn Klasse und Nachweis übereinstimmen.
 *
 * Der Nachweis gehört dazu: „secret-im-quelltext" in zwei verschiedenen Dateien
 * sind zwei Funde, nicht einer. Der Klartext gehört **nicht** dazu — er darf
 * sich zwischen Läufen im Wortlaut unterscheiden, ohne dass daraus ein neuer
 * Fund wird.
 */
function kennung(klasse: string, nachweis: string): string {
  return `${klasse}::${nachweis}`;
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

  const gesamt: Kosten = { tokens_ein: 0, tokens_aus: 0, laufzeit_ms: 0 };

  for (let runde = 1; runde <= grenzen.maxRunden; runde++) {
    zaehler.beginnen();
    const klassenDieserRunde: string[] = [];

    // --- 1. Alle Angreifer laufen lassen ---------------------------------- #
    const gefunden: Fundstelle[] = [];
    for (const angreifer of optionen.angreifer) {
      // Ein Angreifer, der eine laufende App braucht, wird ohne Sandbox
      // uebersprungen — und taucht dann NICHT in den gelaufenen Klassen auf.
      // Sonst stuende im Protokoll „geprueft auf X", wo nichts geprueft wurde.
      if (angreifer.brauchtLaufzeit && optionen.ziel.laufzeit === undefined) {
        continue;
      }
      klassenDieserRunde.push(angreifer.klasse);
      gelaufeneKlassen.add(angreifer.klasse);
      const rohe = await angreifer.angreifen(optionen.ziel, {
        runde,
        bisherige: [...befunde.values()],
      });
      for (const roh of rohe) {
        gefunden.push({ klasse: angreifer.klasse, kategorie: angreifer.kategorie, roh });
      }
    }

    // --- 2. Befunde einordnen --------------------------------------------- #
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
      // Wieder da. Ob das ein zerstoerter Fix ist oder ein Fix, der nie
      // gegriffen hat, unterscheidet der Zustand von vorher.
      befunde.set(schluessel, {
        ...vorher,
        zustand:
          vorher.zustand === "behoben" || vorher.zustand === "fix_versucht"
            ? "wieder_aufgetreten"
            : vorher.zustand,
      });
    }

    // Was in dieser Runde nicht mehr gefunden wurde und vorher angefasst war,
    // gilt jetzt als behoben — die erneute Pruefung ist der einzige Beleg.
    for (const [schluessel, befund] of befunde) {
      if (jetztGefunden.has(schluessel)) continue;
      if (befund.zustand === "fix_versucht" || befund.zustand === "wieder_aufgetreten") {
        befunde.set(schluessel, { ...befund, zustand: "behoben" });
      }
    }

    // --- 3. Fixer auf alles Offene ---------------------------------------- #
    for (const [schluessel, befund] of befunde) {
      if (!istOffen(befund)) continue;
      const versuch = await optionen.fixer.fixen(befund, optionen.ziel);
      befunde.set(schluessel, {
        ...befund,
        // `wieder_aufgetreten` ueberlebt den Fixer. Sonst ueberschriebe der
        // Versuch in derselben Runde genau die Information, wegen der es den
        // Zustand gibt: dass ein Fix einen frueheren Fix zerstoert hat. Der
        // Fix wird trotzdem versucht; verschwindet der Fund danach, wird er
        // wie jeder andere auf `behoben` gesetzt.
        //
        // Ohne Aenderung bleibt der Fund offen: ein Fixer, der nicht weiss
        // wie, darf den Zustand nicht verbessern.
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

    // --- 4. Abbruch pruefen ------------------------------------------------ #
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

  // Ein Lauf ohne Runde ist kein Erfolg: maxRunden 0 heisst, es wurde nichts
  // geprueft. Das darf nicht als „keine offenen Befunde" durchgehen.
  if (laufendeNummer === 0) {
    abbruchgrund = "rundenlimit";
  }

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
