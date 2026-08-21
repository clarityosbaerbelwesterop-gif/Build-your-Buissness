# STATUS.md — Stand und offene Fragen

Stand: M0 abgeschlossen. 61 Tests, Lint und Typprüfung grün.

## Was steht

| Bereich | Was |
|---|---|
| `protocol/v1.ts` | Datenvertrag, Zod, ab v1 versioniert. Befund, Runde, Protokoll, Kosten, Abbruchgrund. |
| `core/schnittstellen.ts` | `Angreifer`, `Fixer`, `Ziel`, `Laufzeit`, `Kostenzaehler`. |
| `core/orchestrator.ts` | Die Schleife: angreifen → fixen → **alles** erneut prüfen. Abbruch bei keine offenen Befunde / Rundenlimit / Kostendeckel. Standard 3 Runden. |
| `attackers/` | Drei statische Angreifer: Zugangsdaten, RLS, Auth an Route Handlern. |
| `config/zugaenge.ts` | Eine Stelle, an der Zugänge gelesen werden. Wirft klar, wenn einer fehlt; gibt nie einen Wert in eine Meldung. |
| `models/nvidia.ts` | Drei Modelle mit getrennten Schlüsseln, angesprochen über eine Rolle (schwer/mittel/schnell). |
| `db/001_grundschema.sql` | Läufe, Protokolle, Befunde, Runden — jede Tabelle mit RLS enable **und** force **und** Policy. |
| CI | Drei Läufe: (1) Lint, Typprüfung, Tests, Zugangsübersicht. (2) Keine Zugangsdaten in neuen Zeilen eines PR. (3) Keine Sicherheitszusagen im Text. |

## Was ein Nutzer davon merkt

Noch nichts. M0 ist der Motor, keine Oberfläche. Der erste sichtbare Schritt ist
das Prüfprotokoll aus CHATHUB.md Zustand 4 — es braucht das, was hier gebaut
wurde, als Datenquelle.

## Vorfall: drei NVIDIA-Schlüssel lagen im Repository

Am 21.08. wurden drei Commits direkt auf `main` gelegt, jeder mit einem echten
NVIDIA-Schlüssel in einer `.env`:

- `e4d1115` GLM-5.2
- `ff005de` laguna-xs-2.1
- `da2d9ca` nemotron-3-ultra-550b

**Alle drei sind als kompromittiert zu behandeln.** Das Repository ist zwar
privat, aber die Schlüssel stehen im Verlauf, in jedem Klon und in jedem
CI-Protokoll, das die Datei gelesen hat. Sie zu löschen macht sie nicht
ungültig.

**Was zu tun ist — und nur der Kontoinhaber kann es:** die drei Schlüssel in
der NVIDIA-Console widerrufen und neu ausstellen. Die neuen Werte kommen in die
GitHub Secrets, nicht in eine Datei.

**Warum der Wächter nichts gemeldet hat:** `geheimnisse.yml` lief nur bei
`pull_request`. Die drei Commits gingen direkt auf `main`, also hat er sie nie
gesehen. Ein Wächter, der nur den höflichen Weg bewacht, bewacht nichts.
Behoben: er läuft jetzt bei jedem Push und prüft zusätzlich den ganzen Baum auf
eine vorhandene `.env` — Muster können sich ändern, eine `.env` im Repo ist
immer falsch.

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

**Stand: keines davon ist hinterlegt.** Nachprüfbar mit `npm run zugaenge` —
der Lauf gibt „gesetzt / nicht gesetzt" aus, nie einen Wert. Er läuft auch in
der CI mit und färbt den Lauf nicht rot, denn in M0 braucht kein Schritt einen
Zugang.

| Secret | Wofür | Geheim |
|---|---|---|
| `NV_API_KEY_1` | nemotron-3-ultra-550b-a55b (Rolle **schwer**) | ja |
| `NV_API_KEY_2` | laguna-xs-2.1 (Rolle **mittel**) | ja |
| `NV_API_KEY_3` | step-3.7-flash (Rolle **schnell**) | ja |
| `NVIDIA_BASE_URL` | Endpunkt; ohne Angabe `https://integrate.api.nvidia.com/v1` | nein |
| `NEON_API_KEY` | Neon-Projekt lesen und Migration anwenden | ja |
| `NEON_PROJECT_ID` | Nur nötig, wenn im Konto mehr als ein Projekt liegt | nein |
| `DATABASE_URL` | Verbindung zur Datenbank aus der Anwendung heraus | ja |

Hinterlegt werden sie unter **Settings → Secrets and variables → Actions →
New repository secret**. Die Namen stehen in `config/zugaenge.ts` und in
`.env.example`.

**Keine `.env` im Repo.** Sie steht in `.gitignore`, und `.env.example` enthält
nur Namen. Wer eine `.env` mit Werten anlegt, hat sie irgendwann versehentlich
committet — und dann greift §2.4 (Key im Diff = Abbruchgrund), nachdem der
Schlüssel bereits verbrannt ist.

Später absehbar: `VERCEL_TOKEN` (Control Plane), `STRIPE_SECRET_KEY` (Zahlungen).

## Was jetzt vom iPad aus geht

| Was | Wo |
|---|---|
| Prüfen, welche Zugänge liegen | läuft in jedem CI-Lauf mit |
| Modelle wirklich anfragen | Actions → **CI** → Run workflow |
| Migration trocken durchspielen | Actions → **Neon** → Run workflow, Eingabe leer lassen |
| Migration anwenden | Actions → **Neon** → Run workflow, `anwenden` eintippen |

Die Migration läuft **nicht** automatisch bei jedem Push. Eine Migration, die
bei jedem Commit gegen die Datenbank läuft, ist die Sorte Automatik, bei der
irgendwann ein `drop` durchrutscht und es niemand vorher gesehen hat.

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
