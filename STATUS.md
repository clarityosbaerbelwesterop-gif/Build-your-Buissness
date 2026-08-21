# STATUS.md — Stand und offene Fragen

Stand: M0 abgeschlossen. 61 Tests, Lint und Typprüfung grün.

## Was steht

| Bereich | Was |
|---|---|
| `protocol/v1.ts` | Datenvertrag, Zod, ab v1 versioniert. Befund, Runde, Protokoll, Kosten, Abbruchgrund. |
| `core/schnittstellen.ts` | `Angreifer`, `Fixer`, `Ziel`, `Laufzeit`, `Kostenzaehler`. |
| `core/orchestrator.ts` | Die Schleife: angreifen → fixen → **alles** erneut prüfen. Abbruch bei keine offenen Befunde / Rundenlimit / Kostendeckel. Standard 3 Runden. |
| `attackers/` | Drei statische Angreifer: Zugangsdaten, RLS, Auth an Route Handlern. |
| CI | Lint, Typprüfung, Tests. Zweiter Lauf: keine Zugangsdaten in neuen Zeilen eines PR. |

## Was ein Nutzer davon merkt

Noch nichts. M0 ist der Motor, keine Oberfläche. Der erste sichtbare Schritt ist
das Prüfprotokoll aus CHATHUB.md Zustand 4 — es braucht das, was hier gebaut
wurde, als Datenquelle.

## Offene Fragen

### 1. Sandbox-Laufzeit (blockiert M1)

Unverändert offen, wie in CLAUDE.md §3. Kandidaten: Fly Machines, E2B, Modal,
Render Background Worker.

**Was M0 dazu beigetragen hat:** die Entscheidung ist nicht mehr dringend für
den Orchestrator. Die Angreifer-Schnittstelle nimmt ein `Ziel` mit optionaler
`laufzeit`; ein Angreifer, der eine laufende App braucht, meldet das über
`brauchtLaufzeit` und wird ohne Sandbox übersprungen. Der Orchestrator muss für
M1 **nicht** angefasst werden.

Was für die Entscheidung noch fehlt: Kosten je Lauf bei ~3 Runden, Startzeit
einer Instanz, ob ausgehender Netzverkehr abschaltbar ist (ein Angreifer darf
die Sandbox nicht als Sprungbrett benutzen können).

### 2. Wer schreibt die Fixes

`Fixer` ist als Schnittstelle da, umgesetzt ist keiner. In den Tests stehen
Attrappen. Für M1 muss entschieden werden, ob ein Fix aus einem Sprachmodell
kommt oder aus festen Regeln je Angriffsklasse.

**Empfehlung:** feste Regeln zuerst. Die drei Funde aus M0 haben je genau eine
richtige Antwort — Schlüssel in eine Umgebungsvariable, `FORCE ROW LEVEL
SECURITY` ergänzen, Sitzungsprüfung voranstellen. Ein Modell darauf anzusetzen
kostet Geld und Zeit für eine Frage, die keine Kreativität braucht. Modelle
später für Funde, die aus der Sandbox kommen.

### 3. Was die statischen Angreifer nicht sehen

Das gehört ins Protokoll, sobald es eine Oberfläche gibt — sonst hält jemand
„geprüft" für „vollständig geprüft":

- Eine Anmeldeprüfung, die vorhanden, aber falsch ist.
- Eine Policy, die dasteht, aber die falsche Spalte vergleicht.
- Alles, was erst zur Laufzeit auffällt: Rechteausweitung über die Anwendung,
  Zugriff über eine zweite Route, Fehlerseiten, die Daten preisgeben.

### 4. Fehlalarme messen

Die Muster in den Angreifern sind eng gehalten, damit der Bericht glaubwürdig
bleibt. Ob sie zu eng sind, lässt sich erst an echten Projekten sehen. Sobald
ein erster echter Lauf existiert: Trefferquote je Klasse festhalten und hier
eintragen.

## Was in den GitHub Secrets liegen muss

M0 ruft kein Modell auf — die Angreifer arbeiten statisch. Die CI reicht diese
beiden trotzdem schon durch, damit sie an einer Stelle stehen, wenn M1 sie
braucht:

| Secret | Wofür |
|---|---|
| `NVIDIA_API_KEY` | Modellzugang (CLAUDE.md §3) |
| `NVIDIA_BASE_URL` | Endpunkt der Modelle |

Noch nicht gebraucht, aber absehbar: `NEON_API_KEY` (Datenbank je Lauf),
`VERCEL_TOKEN` (Control Plane), `STRIPE_SECRET_KEY` (Zahlungen).

## Nächster Schritt

M1 ist blockiert, solange die Sandbox-Laufzeit offen ist. Zwei Schritte, die
davon unabhängig sind:

- **M0.5 Fixer für die drei bekannten Funde.** Macht die Schleife zum ersten
  Mal wirksam: gefunden → behoben → nachgeprüft, ohne Sandbox und ohne Modell.
- **M0.6 Protokoll anzeigen.** Der Bildschirm aus CHATHUB.md Zustand 4 gegen
  ein festes Beispielprotokoll. Zeigt, ob der Datenvertrag trägt, bevor echte
  Daten dranhängen.

Empfehlung: M0.5 zuerst. Eine Schleife, die findet aber nie behebt, erzeugt
Protokolle mit lauter offenen Punkten — das ist der schlechteste erste
Eindruck, den das Produkt machen kann.
