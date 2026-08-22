# STATUS.md — Stand und offene Fragen

Stand: **M0.6 ist in PR #8 gebaut und nachgewiesen.**
PR #7 wurde als M0.5 nach `main` gemergt (`234dbe33`). Auf dem M0.6-Code-Head
`fe6d2426` sind CI, RLS-Nachweis, Geheimnisse, Sprache und Backend-Nachweis grün.
Die normale CI meldet 14 Testdateien / **201 Tests**, Lint und Typprüfung grün
sowie `npm audit`: **0 bekannte Schwachstellen**.

## Was steht

| Bereich | Stand |
|---|---|
| `protocol/v1.ts` | Versionierter Datenvertrag für Befunde, Runden, Protokoll, Kosten und Abbruchgrund. |
| `core/orchestrator.ts` | Angreifen → fixen → geänderte Dateien übernehmen → alles erneut prüfen. |
| `attackers/` | Drei statische Klassen: Zugangsdaten, RLS, Auth an Route-Handlern. |
| `fixers/regeln.ts` | Drei konservative Regel-Fixer; unbekannter Kontext bleibt offen statt geraten zu werden. |
| `db/001_grundschema.sql` | Vier BYB-Tabellen mit `ENABLE`, `FORCE` und Mandanten-Policy. |
| `db/002_protokoll_inhalt.sql` | M0.6-Migration für kanonisches Protokoll-JSON und die eingeschränkte Laufzeitrolle `byb_app`. |
| `db/auth-kontext.ts` | Übernimmt nur eine bereits verifizierte Nutzerkennung und setzt sie transaktional in den DB-Kontext. |
| `db/protokoll-speicher.ts` | Speichert ein validiertes `Protokoll v1` atomar und liest die kanonische Fassung wieder über den v1-Vertrag. |
| `db/protokoll-nachweis.ts` | Prüft Schreiben, verlustfreies Lesen und Mandantentrennung auf einem kurzlebigen Neon-Zweig. |
| CI | Lint, Typen, 201 Tests, Dependency-Audit, Zugangsübersicht, Secret-Wächter, Sprach-Wächter, RLS- und Backend-Nachweis. |

## M0.6 — Backend-Persistenz und Auth-Brücke

Das bisherige relationale Schema konnte ein vollständiges `Protokoll v1` nicht
verlustfrei rekonstruieren: insbesondere die Befund-Snapshots je Runde sind im
Datenvertrag enthalten, aber nicht als vollständige historische Fassung in den
relationalen Tabellen abgelegt.

M0.6 verwendet deshalb zwei Darstellungen aus **derselben validierten Eingabe**:

- `protokolle.inhalt` hält das vollständige versionierte Protokoll als
  kanonische JSONB-Fassung.
- `laeufe`, `protokolle`, `runden` und `befunde` bleiben die relationale
  Projektion für Suche und spätere Auswertungen.
- Lesen erfolgt aus der kanonischen Fassung und durchläuft danach erneut
  `protocol/v1.ts`; fehlerhafte gespeicherte Daten werden nicht stillschweigend
  als gültiges Protokoll ausgegeben.
- Schreiben von Lauf, Protokoll, Runden und Befunden geschieht in einer
  Transaktion.

### Auth-/DB-Kontext

`db/auth-kontext.ts` prüft **keine JWT-Signatur**. Das ist Absicht: diese Grenze
nimmt eine Identität erst nach externer Token-Verifikation an und übernimmt nur
deren `sub`-Kennung.

Für jeden Nutzerdatenzugriff:

1. beginnt eine DB-Transaktion,
2. wechselt die Verbindung auf `byb_app`,
3. setzt `request.jwt.claims` mit der verifizierten `sub`-Kennung lokal für
   diese Transaktion,
4. lässt die bestehenden RLS-Policies lesen/schreiben filtern,
5. beendet oder verwirft die Transaktion.

`byb_app` ist NOLOGIN, nicht SUPERUSER und hat kein `BYPASSRLS`.

## Nachweise am 22.08.2026

### GitHub PR #8 — Code-Head `fe6d2426`

- CI: grün.
- Lint: grün.
- TypeScript: grün.
- Vitest: 14 Dateien, **201 Tests grün**.
- `npm audit --audit-level=high`: **0 vulnerabilities**.
- Geheimnisse: grün.
- Sprache: grün.
- RLS-Nachweis: grün.
- Backend-Nachweis: grün.

Der Backend-Nachweis erzeugt einen kurzlebigen Neon-Zweig, wendet dort M0.6 an,
speichert für zwei verschiedene Nutzer je ein Protokoll, liest beide
verlustfrei zurück, bestätigt die gegenseitige Nicht-Sichtbarkeit und löscht
den Zweig anschließend wieder.

Zusätzlich wurde über den Neon-Connector auf dem separaten Testzweig
`br-wild-bird-b1ve7uom` die Rollen-/RLS-Kette direkt gegengeprüft:

- `byb_app`: `rolcanlogin=false`, `rolbypassrls=false`, `rolsuper=false`.
- mit Nutzer A war das Testprotokoll sichtbar: 1 Zeile.
- nach Wechsel auf Nutzer B war dasselbe Testprotokoll nicht sichtbar: 0 Zeilen.
- die Testdaten wurden per Rollback verworfen.

## Produktion — unverändert

Neon-Projekt: `damp-dream-67070160` (`Build your Buissness`), PostgreSQL 18,
Default-Branch `production` (`br-patient-snow-b11ksdc8`).

M0.6 hat **keine** Produktionsmigration und **keine** Auth-Provisionierung
ausgeführt:

- `002_protokoll_inhalt.sql` ist noch nicht auf `production` angewendet.
- Neon Auth ist noch nicht auf `production` provisioniert.
- Ein vorhandenes altes Protokoll würde Migration 002 bewusst blockieren,
  statt aus unvollständigen Altspalten ein v1-Protokoll zu erfinden. Der
  Produktionsstand war beim letzten direkten Check in diesem Schritt leer;
  vor einem späteren Anwenden wird das erneut geprüft.

Der GitHub-Workflow `Neon` bleibt manuell und verlangt sowohl die konkrete
handgeschriebene Migrationsdatei als auch die Eingabe `anwenden`.

## Zugangsdaten und historischer Vorfall

Der aktuelle Baum enthält keine versionierte `.env`; der GitHub-Wächter prüft
jeden Push darauf. PR-Diffs werden zusätzlich mit dem Produkt-Angreifer auf
konkrete Zugangsdaten-Muster geprüft.

Am 21.08.2026 lagen echte NVIDIA-Schlüssel in drei Commits auf `main`:

- `e4d1115`
- `ff005de`
- `da2d9ca`

Die heute verwendeten `NV_API_KEY_1/2/3` sind andere Werte. Die alten Werte
stehen weiterhin im Git-Verlauf. **Ob sie beim Anbieter widerrufen wurden, ist
nicht verifiziert.** Eine History-Rewrite-Aktion bleibt ein separater,
destruktiver Schritt.

Aktuell durch CI als gesetzt nachgewiesen:

- `NV_API_KEY_1`
- `NV_API_KEY_2`
- `NV_API_KEY_3`
- `NEON_API_KEY`

Nicht gesetzt und für den aktuellen PR nicht erforderlich:

- `NVIDIA_BASE_URL` — der Code hat eine Vorgabe.
- `DATABASE_URL` — die Neon-Anbindung kann die Verbindung über die Neon-API
  beziehen.

Keine Secret-Werte werden in CI ausgegeben.

## Offene Produktfragen

### 1. Echte Auth-Verifikation

M0.6 beginnt **nach** der Token-Verifikation. Noch fehlt der Provider-Adapter,
der ein reales Nutzer-JWT kryptografisch prüft und erst danach die `sub`-Kennung
an `auth-kontext.ts` übergibt. Neon Auth ist dafür der nächste vorgesehene
Integrationsschritt; produktive Provisionierung erfolgt erst als eigener,
ausdrücklich freigegebener Zustandsschritt.

### 2. Sandbox-Laufzeit — blockiert M1

Noch offen. Kandidaten aus `CLAUDE.md`: Fly Machines, E2B, Modal, Render
Background Worker. Bis zur Entscheidung bleiben Angriffe statisch.

### 3. Laufzeit-Fixer und Grenzen der statischen Prüfung

Noch nicht abgedeckt sind unter anderem fachlich falsche vorhandene Auth-Prüfungen,
Policies mit falscher Mandantenspalte, Rechteausweitung über mehrere Routen und
Datenabfluss, der erst in einer laufenden Anwendung sichtbar wird. Diese Grenzen
müssen im späteren Prüfprotokoll sichtbar bleiben.

## Nächster Schritt nach PR #8

**M0.7: Auth-Provider/JWT-Verifikation auf einem isolierten Zweig.**

Ziel: ein reales Provider-Token validieren, daraus ausschließlich nach gültiger
Prüfung die `sub`-Kennung ableiten und den bereits nachgewiesenen M0.6-Pfad damit
aufrufen. Erst danach folgen — jeweils als eigener freigegebener Schritt —
Migration 002 auf `production` und produktive Auth-Provisionierung.

Die Protokoll-Oberfläche aus `CHATHUB.md` kann anschließend gegen den echten
Backend-Lesepfad statt gegen ein Beispielobjekt gebaut werden.
