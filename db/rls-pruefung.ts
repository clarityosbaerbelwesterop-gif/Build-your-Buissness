/**
 * Der Nachweis, dass Row Level Security im Betrieb greift.
 *
 * Bis hierher galt: das Schema ist fehlerfrei durchgelaufen. Das ist **nicht**
 * dasselbe wie wirksam. `ENABLE ROW LEVEL SECURITY` ohne `FORCE` sieht in der
 * Migration genauso aus wie mit — und wird vom Eigentümer der Tabelle
 * vollständig umgangen. Eine Anwendung meldet sich fast immer als Eigentümer
 * an. Die Migration wäre grün, die Daten offen.
 *
 * Deshalb prüft diese Datei nicht das SQL, sondern das **Verhalten**: zwei
 * Mandanten, dieselbe Tabelle, und die Frage, ob einer an die Zeilen des
 * anderen kommt. Lesend, schreibend, löschend — und beim Anlegen auf fremde
 * Kennung.
 *
 * Warum alle vier Wege: `USING` regelt, was man sieht. `WITH CHECK` regelt,
 * was man schreiben darf. Wer nur liest, findet eine fehlende `WITH
 * CHECK`-Klausel nie — und dann kann jeder Zeilen auf fremde Kennung legen,
 * ohne sie je zu sehen.
 *
 * Diese Datei redet nur mit einer übergebenen Verbindung. Wo die herkommt —
 * frischer Zweig, wieder gelöscht — steht in `db/rls-nachweis.ts`.
 */

/** Was diese Datei von einer Datenbankverbindung braucht. */
export interface Verbindung {
  query(sql: string, werte?: readonly unknown[]): Promise<{
    readonly rows: Record<string, unknown>[];
    readonly rowCount: number | null;
  }>;
}

export interface Verstoss {
  readonly tabelle: string;
  readonly weg: "lesen" | "aendern" | "loeschen" | "fremd_anlegen" | "eigenes_weg";
  readonly beschreibung: string;
}

/** Zwei Mandanten, die es im echten Betrieb nie zusammen gäbe. */
export const MANDANT_A = "rls-nachweis-mandant-a";
export const MANDANT_B = "rls-nachweis-mandant-b";

/**
 * Etwas als ein bestimmter Mandant tun.
 *
 * `set_config(..., true)` gilt **lokal zur Transaktion**. Ohne die Transaktion
 * bliebe die Kennung an der Verbindung hängen, und der nächste Abschnitt liefe
 * unbemerkt unter dem falschen Mandanten — ein Test, der dann grün wird, ohne
 * etwas zu beweisen.
 */
export async function alsMandant<T>(
  verbindung: Verbindung,
  mandant: string,
  tun: () => Promise<T>,
): Promise<T> {
  await verbindung.query("begin");
  try {
    await verbindung.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: mandant }),
    ]);
    const ergebnis = await tun();
    await verbindung.query("commit");
    return ergebnis;
  } catch (fehler) {
    await verbindung.query("rollback").catch(() => undefined);
    throw fehler;
  }
}

/**
 * Eine Zeile je Mandant anlegen und die vier Wege prüfen.
 *
 * `anlegen` bekommt die Kennung des Mandanten und liefert die id der neuen
 * Zeile. Je Tabelle sieht das anders aus (Fremdschlüssel, Pflichtfelder),
 * deshalb steht es beim Aufrufer und nicht hier.
 */
export async function tabellePruefen(
  verbindung: Verbindung,
  tabelle: string,
  anlegen: (mandant: string) => Promise<string>,
): Promise<Verstoss[]> {
  const verstoesse: Verstoss[] = [];
  const idA = await alsMandant(verbindung, MANDANT_A, () => anlegen(MANDANT_A));
  const idB = await alsMandant(verbindung, MANDANT_B, () => anlegen(MANDANT_B));

  await alsMandant(verbindung, MANDANT_A, async () => {
    // --- lesen ---------------------------------------------------------- #
    const gelesen = await verbindung.query(
      `select count(*)::int as anzahl from ${tabelle} where id = $1`,
      [idB],
    );
    const anzahl = gelesen.rows[0]?.["anzahl"];
    if (anzahl !== 0) {
      verstoesse.push({
        tabelle,
        weg: "lesen",
        beschreibung:
          `Mandant A sieht die Zeile von Mandant B (${String(anzahl)} Treffer). `
          + `USING greift nicht — entweder fehlt die Policy oder FORCE.`,
      });
    }

    // --- ändern --------------------------------------------------------- #
    const geaendert = await verbindung.query(
      `update ${tabelle} set nutzer_id = nutzer_id where id = $1`,
      [idB],
    );
    if ((geaendert.rowCount ?? 0) !== 0) {
      verstoesse.push({
        tabelle,
        weg: "aendern",
        beschreibung:
          `Mandant A kann die Zeile von Mandant B ändern `
          + `(${String(geaendert.rowCount)} Zeile(n) betroffen).`,
      });
    }

    // --- löschen -------------------------------------------------------- #
    const geloescht = await verbindung.query(
      `delete from ${tabelle} where id = $1`,
      [idB],
    );
    if ((geloescht.rowCount ?? 0) !== 0) {
      verstoesse.push({
        tabelle,
        weg: "loeschen",
        beschreibung:
          `Mandant A kann die Zeile von Mandant B löschen `
          + `(${String(geloescht.rowCount)} Zeile(n) betroffen).`,
      });
    }

    // --- auf fremde Kennung schreiben ------------------------------------ #
    //
    // Der Weg, den eine reine Lesepruefung nie findet: ohne WITH CHECK darf
    // jeder Zeilen auf eine fremde Kennung legen, ohne sie je zu sehen.
    const umgeschrieben = await verbindung.query(
      `update ${tabelle} set nutzer_id = $1 where id = $2`,
      [MANDANT_B, idA],
    ).catch(() => ({ rows: [], rowCount: -1 }));
    if ((umgeschrieben.rowCount ?? 0) > 0) {
      verstoesse.push({
        tabelle,
        weg: "fremd_anlegen",
        beschreibung:
          `Mandant A kann die eigene Zeile auf Mandant B umschreiben. `
          + `WITH CHECK fehlt — die Policy prüft nur beim Lesen.`,
      });
    }
  });

  // --- ist die Zeile von B noch da? ------------------------------------- #
  //
  // Die Gegenprobe zum Loeschen. `rowCount 0` beim DELETE koennte auch heissen,
  // dass die Zeile nie existiert hat — dann waere der Test gruen, ohne etwas
  // geprueft zu haben.
  await alsMandant(verbindung, MANDANT_B, async () => {
    const noch = await verbindung.query(
      `select count(*)::int as anzahl from ${tabelle} where id = $1`,
      [idB],
    );
    if (noch.rows[0]?.["anzahl"] !== 1) {
      verstoesse.push({
        tabelle,
        weg: "eigenes_weg",
        beschreibung:
          `Die Zeile von Mandant B ist verschwunden oder war nie da. Damit ist `
          + `keine der Prüfungen oben aussagekräftig.`,
      });
    }
  });

  return verstoesse;
}

/** Was die Prüfung am Ende ausgibt — ohne Werte, nur Wege und Tabellen. */
export function bericht(verstoesse: readonly Verstoss[], tabellen: readonly string[]): string {
  if (verstoesse.length === 0) {
    return `Geprüft auf Mandantentrennung in ${tabellen.length} Tabellen `
      + `(${tabellen.join(", ")}), lesend, ändernd, löschend und beim Schreiben `
      + `auf fremde Kennung. Gefunden: nichts.`;
  }
  const zeilen = verstoesse.map((v) => `  ${v.tabelle} [${v.weg}] ${v.beschreibung}`);
  return `Geprüft auf Mandantentrennung, gefunden ${verstoesse.length} `
    + `Verstoß(e):\n${zeilen.join("\n")}`;
}
