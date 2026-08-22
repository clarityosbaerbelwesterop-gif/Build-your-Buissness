# STATUS.md — Stand und offene Fragen

Stand: **M0.5 ist gebaut und im PR #7 in Prüfung.**
194 Tests, Lint und Typprüfung laufen grün. Der RLS-Verhaltenstest gegen einen
kurzlebigen Neon-Zweig läuft grün. `npm audit` meldet nach dem Dependency-Refresh
**0 bekannte Schwachstellen**.

## Was steht

| Bereich | Stand |
|---|---|
| `protocol/v1.ts` | Versionierter Datenvertrag für Befunde, Runden, Protokoll, Kosten und Abbruchgrund. |
| `core/orchestrator.ts` | Angreifen → fixen → geänderte Dateien übernehmen → alles erneut prüfen. |
| `attackers/` | Drei statische Klassen: Zugangsdaten, RLS, Auth an Route-Handlern. |
| `fixers/regeln.ts` | Drei konservative Regel-Fixer. Sie ändern nur Fälle, die ohne Raten ableitbar sind. |
| `db/001_grundschema.sql` | Vier BYB-Tabellen mit `ENABLE`, `FORCE` und Mandanten-Policy. |
| `db/rls-pruefung.ts` | Verhaltenstest für Lesen, Ändern, Löschen und Schreiben auf fremde Kennung. |
| `db/rls-nachweis.ts` | Legt einen Neon-Testzweig und eine NOLOGIN-Testrolle ohne `BYPASSRLS` an, prüft und räumt beides wieder auf. |
| CI | Lint, Typen, 194 Tests, Dependency-Audit, Zugangsübersicht, Secret-Wächter und Sprach-Wächter. |

## Was M0.5 konkret geändert hat

- Der Orchestrator prüft nach einem Fix jetzt wirklich den **geänderten**
  Quelltext. Vorher lieferte der Fixer Dateien zurück, die nächste Runde sah
  trotzdem die alte Fassung.
- Zugangsdaten-Muster leben an einer Stelle. Produkt-Angreifer und GitHub-CI
  benutzen dieselbe Erkennungslogik.
- Die Fixer können bekannte deterministische Fälle bearbeiten:
  - eigenständiges Secret-Stringliteral → Laufzeitvariable,
  - fehlendes RLS/FORCE bzw. eine eindeutig ableitbare `nutzer_id`-Policy,
  - fehlende Auth-Prüfung nur dann, wenn im Projekt bereits ein passender
    `requireAuth()`-Helper existiert.
- Fehlt der nötige Kontext, bleibt der Befund offen. Es wird keine Auth- oder
  Mandantenlogik erfunden.

## Neon — verifizierter Stand

Projekt: `damp-dream-67070160` (`Build your Buissness`), PostgreSQL 18,
Default-Branch `production` (`br-patient-snow-b11ksdc8`).

Am 22.08.2026 direkt über den Neon-Connector geprüft:

- `laeufe`, `protokolle`, `befunde`, `runden` existieren.
- Auf allen vier Tabellen ist RLS aktiviert und erzwungen.
- Jede Tabelle hat ihre `*_eigene`-Policy.
- Jede Policy prüft `nutzer_id = auth.nutzer_kennung()` sowohl für vorhandene
  Zeilen als auch für neue/änderte Zeilen.
- Der PR-Nachweis erzeugt einen eigenen Neon-Zweig, prüft dort die
  Mandantentrennung und löscht den Zweig danach wieder.

**Noch nicht eingerichtet:** ein produktiver Auth-/API-Pfad, der echte
Nutzer-JWTs in `request.jwt.claims` überführt und Protokolle über das Backend
schreibt/liest. Deshalb wird Neon Auth nicht vorab auf Produktion provisioniert;
der Codepfad dafür kommt zuerst in einen eigenen, getesteten Schritt.

## Zugangsdaten und historischer Vorfall

Der aktuelle Baum enthält keine versionierte `.env`; der GitHub-Wächter prüft
jeden Push darauf. PR-Diffs werden zusätzlich mit dem Produkt-Angreifer auf
konkrete Zugangsdaten-Muster geprüft.

Am 21.08.2026 lagen echte NVIDIA-Schlüssel in drei Commits auf `main`:

- `e4d1115`
- `ff005de`
- `da2d9ca`

Die heute verwendeten `NV_API_KEY_1/2/3` sind andere Werte. Die alten Werte
stehen aber weiterhin im Git-Verlauf. **Ob die alten Werte beim Anbieter
widerrufen wurden, ist nicht verifiziert.** Ein normales Löschen im aktuellen
Baum entfernt sie nicht aus der Historie; eine History-Rewrite-Aktion wäre ein
eigener destruktiver Schritt und wird nicht in PR #7 versteckt.

Aktuell durch CI als gesetzt nachgewiesen:

- `NV_API_KEY_1`
- `NV_API_KEY_2`
- `NV_API_KEY_3`
- `NEON_API_KEY`

Nicht gesetzt und derzeit nicht für M0.5 nötig:

- `NVIDIA_BASE_URL` — der Code hat eine Vorgabe.
- `DATABASE_URL` — die Neon-Anbindung kann die Verbindung über die Neon-API
  beziehen.

Keine Secret-Werte werden in CI ausgegeben.

## Dependencies

Vitest wurde auf `4.1.10` aktualisiert und das Lockfile unter Node 22 erneut
installiert. Danach: Lint grün, Typprüfung grün, 194 Tests grün und
`npm audit`: **0 vulnerabilities**.

Die normale CI enthält jetzt dauerhaft `npm audit --audit-level=high`; neue
hohe oder kritische bekannte Dependency-Funde blockieren den PR.

## Offene Produktfragen

### 1. Sandbox-Laufzeit — blockiert M1

Noch offen. Kandidaten aus `CLAUDE.md`: Fly Machines, E2B, Modal, Render
Background Worker. Entscheidend sind Kosten je Lauf, Startzeit und kontrollierbarer
ausgehender Netzwerkzugriff. Bis zur Entscheidung bleiben Angriffe statisch.

### 2. Laufzeit-Fixer

M0.5 deckt nur deterministische statische Funde ab. Funde, die erst in einer
laufenden Sandbox sichtbar werden, brauchen später einen eigenen Fixer-Pfad.

### 3. Grenzen der statischen Prüfung

Noch nicht abgedeckt sind unter anderem:

- vorhandene, aber fachlich falsche Auth-Prüfungen,
- Policies mit der falschen Mandantenspalte,
- Rechteausweitung über mehrere Routen,
- Laufzeit-Fehlerseiten und Datenabfluss über die Anwendung.

Diese Grenzen müssen im späteren Prüfprotokoll sichtbar bleiben.

## Nächster Schritt nach PR #7

**M0.6 Backend-Persistenz und Auth-Brücke zuerst.**

Ziel: einen kleinen, getesteten Backend-Pfad bauen, der ein gültiges
`Protokoll v1` in Neon schreibt und mandantengebunden wieder liest. Dazu kommt
die Auth-Brücke, die eine echte Nutzerkennung in den Datenbank-Kontext setzt.
Erst wenn dieser Pfad in einem isolierten Neon-Zweig nachgewiesen ist, wird eine
produktive Auth-Integration provisioniert.

Danach kann die Protokoll-Oberfläche aus `CHATHUB.md` gegen echte Daten statt
gegen ein Beispielobjekt gebaut werden.
