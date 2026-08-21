# STATUS.md — Stand und offene Fragen

Stand: M0 abgeschlossen. 160 Tests, Lint und Typprüfung grün.
Drei Modelle antworten, Neon-Schema ist angewendet.

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

**Stand: entschärft.** Die Werte, die jetzt in `NV_API_KEY_1/2/3` liegen, sind
**andere** als die drei aus der `.env` — die im Verlauf stehenden sind nicht in
Gebrauch.

Was offen bleibt: die drei alten Schlüssel stehen weiterhin im Git-Verlauf, in
jedem Klon und in jedem CI-Protokoll, das die Datei gelesen hat. Sie zu löschen
macht sie nicht ungültig. Solange sie bei NVIDIA nicht widerrufen sind, kann
jeder mit Repo-Zugriff sie benutzen — auf Kosten desselben Kontos. Der Widerruf
in der NVIDIA-Console ist der einzige Weg, das zu beenden, und nur der
Kontoinhaber kann ihn auslösen.

**Warum der Wächter nichts gemeldet hat:** `geheimnisse.yml` lief nur bei
`pull_request`. Die drei Commits gingen direkt auf `main`, also hat er sie nie
gesehen. Ein Wächter, der nur den höflichen Weg bewacht, bewacht nichts.
Behoben: er läuft jetzt bei jedem Push und prüft zusätzlich den ganzen Baum auf
eine vorhandene `.env` — Muster können sich ändern, eine `.env` im Repo ist
immer falsch.

## Rauchtest: zwei Kennungen waren falsch, nicht zwei Schlüssel

Der erste Lauf auf `main` meldete zwei von drei Modellen als nicht vorhanden.
Nicht die Schlüssel waren das Problem, sondern der **Herausgeber vor dem
Schrägstrich**: ich hatte überall `nvidia/` geschrieben, abgeleitet aus dem
ersten Modell. NVIDIA betreibt aber nur den Endpunkt — die Modelle stammen von
verschiedenen Häusern.

| Rolle | vorher | richtig |
|---|---|---|
| schwer | `nvidia/nemotron-3-ultra-550b-a55b` | unverändert, antwortet |
| mittel | ~~`nvidia/laguna-xs-2.1`~~ | `poolside/laguna-xs-2.1` |
| schnell | ~~`nvidia/step-3.7-flash`~~ | `stepfun-ai/step-3.7-flash` |

Gefunden hat es der Rauchtest selbst: bei einem Fehlschlag fragt er seit
diesem Lauf das Verzeichnis des Anbieters ab und legt die ähnlichsten
vorhandenen Kennungen daneben. Beide richtigen Namen standen an erster Stelle.

**Nebenbei bewiesen: alle drei Schlüssel gelten.** Das Verzeichnis ließ sich
mit Schlüssel 2 und 3 abrufen — mit einem ungültigen Schlüssel wäre auch das
abgelehnt worden. Der 404 vorher hatte über die Schlüssel nichts ausgesagt.

Der Beleg steht im Protokoll des Laufs, nicht in diesem Absatz: `Actions → CI`,
Schritt „Rauchtest der Modelle".

### Und dann fiel das Modell aus, das vorher lief

Im selben Lauf, in dem die zwei korrigierten Kennungen zum ersten Mal
antworteten, gab **`nvidia/nemotron-3-ultra-550b-a55b` ein 503** — dasselbe
Modell, das sechs Minuten vorher in 1550 ms geantwortet hatte. Nichts an der
Anfrage war anders; der Anbieter war kurz nicht verfügbar.

Das ist der eigentliche Fund an diesem Lauf. Ohne Wiederholung entscheidet
eine Sekunde Fremdausfall über einen ganzen Auftrag — bei einem Produkt, das
„die KI macht es und du schaust zu" verspricht, sieht der Nutzer dann einen
abgebrochenen Lauf und kann nichts tun.

`fragen()` versucht es jetzt bis zu dreimal, bei 429, 500, 502, 503 und 504.
**Nicht** bei 400, 401, 403, 404: ein falscher Schlüssel bleibt falsch, und
einen Modellnamen, den es nicht gibt, erzeugt kein Warten. Die Zeitgrenze gilt
für den ganzen Vorgang, nicht je Versuch — sonst würden aus 120 s im
schlechtesten Fall 360 s, und der Kostendeckel der Schleife bucht erst nach
der Runde.

| Rolle | Kennung | Letzter Stand |
|---|---|---|
| schwer | `nvidia/nemotron-3-ultra-550b-a55b` | antwortet (1550 ms); einmal 503 gesehen |
| mittel | `poolside/laguna-xs-2.1` | antwortet — **32 s**, deutlich langsamer als die anderen |
| schnell | `stepfun-ai/step-3.7-flash` | antwortet (1735 ms) |

Die 32 Sekunden bei `mittel` sind notiert, nicht erklärt. Ein Wert aus einem
einzigen Lauf ist keine Messung. Sollte sich das halten, gehört die Rolle
„mittel" überdacht — sie ist als Alltagsrolle gedacht und wäre damit die
langsamste von dreien.

## Neon: Schema angewendet

**Stand: erledigt.** Die vier Tabellen liegen mit `ENABLE`, `FORCE` und Policy
im Projekt `damp-dream-67070160`. Beleg: `Actions → Neon`, Lauf vom 21.08.,
Schritt „Anwenden" grün.

Der Weg dahin hat fünf Anläufe gebraucht, und jeder hat etwas anderes gefunden:

| Antwort | Was sie hieß |
|---|---|
| `404 /projects` | Der Schlüssel ist nicht falsch — er ist **an ein Projekt gebunden** und darf gar keine Liste abrufen. Er nennt sein Projekt in der Absage. |
| `400 db_name (field required)` | Die Felder heißen `db_name`/`role_name`, nicht `database`/`role`. |
| `400 exactly one of endpoint_id or branch_id` | Ein Projekt hat mehrere Zweige. |
| `410 endpoint has been removed` | **Der ganze API-Weg ist abgeschafft.** Die zwei Korrekturen davor haben eine Schnittstelle repariert, die es nicht mehr gibt. |
| `400 unknown error` bei `?database_name=&role_name=` | Mein Fehler: GitHub setzt ein nicht hinterlegtes Secret als **leere Zeichenkette**, und `"" ?? "vorgabe"` greift nicht. |

Die ersten vier Antworten hat nur deshalb jemand lesen können, weil die
Fehlermeldung des Anbieters durchgereicht wird — gefiltert um alles, was nach
einem Schlüssel aussieht. Vorher stand dort „HTTP 404 bei /projects" und sonst
nichts. Das ist dieselbe Regel, die BYB seinen Kunden verkauft: „geprüft auf X,
gefunden Y" statt „geht nicht".

Die Migration läuft jetzt über eine direkte Postgres-Verbindung. Sie holt die
Verbindungszeichenfolge aus `DATABASE_URL`, und wenn die fehlt, über die
Neon-API. Ausgegeben wird sie nie — sie trägt das Passwort im Klartext.

**Was das noch nicht heißt:** dass die Policies im Betrieb greifen. Geprüft
ist, dass das Schema fehlerfrei durchgelaufen ist. Ein Test, der sich mit zwei
verschiedenen Kennungen anmeldet und nachweist, dass keiner die Zeilen des
anderen sieht, fehlt — und das ist die Prüfung, die zählt.

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

**Stand: `NEON_API_KEY` und `NV_API_KEY_1/2/3` sind hinterlegt** (deine
Angabe). Nachgeprüft ist es nicht von mir — ich kann Secrets weder lesen noch
setzen. Was nachprüft, ist `npm run zugaenge`: der Lauf gibt je Zugang
„gesetzt / nicht gesetzt" aus, nie einen Wert, und läuft in jedem CI-Lauf mit.
Die Zeile im Protokoll des letzten Laufs ist der Beleg, nicht dieser Absatz.

Rot färbt er den Lauf nicht, denn in M0 braucht kein Schritt einen Zugang.

| Secret | Wofür | Geheim |
|---|---|---|
| `NV_API_KEY_1` | nvidia/nemotron-3-ultra-550b-a55b (Rolle **schwer**) | ja |
| `NV_API_KEY_2` | poolside/laguna-xs-2.1 (Rolle **mittel**) | ja |
| `NV_API_KEY_3` | stepfun-ai/step-3.7-flash (Rolle **schnell**) | ja |
| `NVIDIA_BASE_URL` | Endpunkt; ohne Angabe `https://integrate.api.nvidia.com/v1` | nein |
| `NEON_API_KEY` | Neon-Projekt lesen und Migration anwenden | ja |
| `NEON_PROJECT_ID` | Nur nötig, wenn im Konto mehr als ein Projekt liegt | nein |
| `DATABASE_URL` | Verbindung zur Datenbank. Fehlt sie, holt die Migration sie über die Neon-API | ja |

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
