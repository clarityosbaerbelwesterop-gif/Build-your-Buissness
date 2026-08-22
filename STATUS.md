# STATUS.md — Stand und offene Fragen

Stand: **M0.7 ist in PR #9 gebaut und nachgewiesen.**

- M0.5 / PR #7 ist in `main` (`234dbe33`).
- M0.6 / PR #8 ist in `main` (`8776c66d`).
- M0.7 liegt auf `m07-neon-auth-jwt`.
- Auf dem M0.7-Code-Head `18c6a080` sind CI, Geheimnisse, Sprache und der
  bestehende Backend-Nachweis grün.
- Die normale CI meldet **16 Testdateien / 215 Tests**, Lint und Typprüfung grün
  sowie `npm audit --audit-level=high`: **0 bekannte Schwachstellen**.
- Ein echtes, auf einem isolierten Neon-Auth-Zweig ausgestelltes JWT wurde vom
  M0.7-Prüfer akzeptiert. Der Testzweig wurde danach gelöscht.

## Was steht

| Bereich | Stand |
|---|---|
| `protocol/v1.ts` | Versionierter Datenvertrag für Befunde, Runden, Protokoll, Kosten und Abbruchgrund. |
| `core/orchestrator.ts` | Angreifen → fixen → geänderte Dateien übernehmen → alles erneut prüfen. |
| `attackers/` | Drei statische Klassen: Zugangsdaten, RLS, Auth an Route-Handlern. |
| `fixers/regeln.ts` | Drei konservative Regel-Fixer; unbekannter Kontext bleibt offen statt geraten zu werden. |
| `db/001_grundschema.sql` | Vier BYB-Tabellen mit `ENABLE`, `FORCE` und Mandanten-Policy. |
| `db/002_protokoll_inhalt.sql` | Kanonisches Protokoll-JSON plus eingeschränkte Laufzeitrolle `byb_app`. |
| `db/auth-kontext.ts` | Setzt nur eine bereits verifizierte Nutzerkennung transaktional in den DB-Kontext. |
| `db/protokoll-speicher.ts` | Speichert ein validiertes `Protokoll v1` atomar und liest die kanonische Fassung wieder über den v1-Vertrag. |
| `auth/neon-jwt.ts` | Prüft Bearer-JWTs kryptografisch über JWKS, Issuer, Audience, Ablaufzeit und `sub`. |
| `auth/protokoll-zugriff.ts` | Verbindet die Tokenprüfung mit dem vorhandenen M0.6-Schreib-/Lesepfad. |
| `auth/neon-auth-nachweis.ts` | Kleiner Livenachweis für ein vom Provider ausgestelltes JWT; gibt weder Token noch Nutzerkennung aus. |
| CI | Lint, Typen, 215 Tests, Dependency-Audit, Zugangsübersicht, Secret-Wächter, Sprach-Wächter und Backend-Nachweis. |

## M0.6 — Persistenz und DB-Kontext

M0.6 hält das vollständige `Protokoll v1` in `protokolle.inhalt` als kanonische
JSONB-Fassung. Die Tabellen `laeufe`, `protokolle`, `runden` und `befunde`
bleiben die relationale Projektion für Suche und spätere Auswertungen. Beide
Darstellungen entstehen aus derselben validierten Eingabe und werden in einer
Transaktion geschrieben.

Für Nutzerdatenzugriffe beginnt `db/auth-kontext.ts` eine Transaktion, wechselt
lokal auf `byb_app`, setzt `request.jwt.claims` mit der bereits verifizierten
`sub`-Kennung und überlässt die Zeilenfilterung den bestehenden RLS-Policies.
`byb_app` ist als NOLOGIN/NOBYPASSRLS-Rolle in Migration 002 definiert.

Der Backend-Nachweis speichert auf einem kurzlebigen Neon-Zweig Protokolle für
zwei Nutzer, liest sie verlustfrei zurück und prüft, dass jeder Nutzer beim
Lesen des fremden Laufs keine Zeile erhält. Der Zweig wird danach entfernt.

## M0.7 — Provider-JWT vor dem DB-Kontext

M0.6 begann absichtlich erst **nach** der Tokenprüfung. M0.7 schließt diese
Lücke mit einer eigenen Auth-Grenze:

1. Aus `Authorization` wird genau ein Bearer-Token angenommen.
2. Das Token wird mit `jose` gegen den konfigurierten JWKS-Endpunkt geprüft.
3. Zugelassen ist für den aktuellen Neon-Auth-Pfad `EdDSA` / Ed25519.
4. `iss`, `aud`, `exp` und `sub` sind Pflicht; ein vorhandenes `nbf` wird
   ebenfalls ausgewertet.
5. Erst nach erfolgreicher Prüfung wird aus `sub` eine `VerifizierteIdentitaet`.
6. Das rohe JWT gelangt nicht in den DB-Kontext; dort landet nur die
   Nutzerkennung.

Negative Tests decken unter anderem fremde Signatur, falschen Issuer, falsche
Audience, abgelaufene und noch nicht gültige Tokens, fehlendes `sub` und ein
falsches Authorization-Schema ab. Bei einer Auth-Ablehnung wird der
Nutzerdatenzugriff nicht begonnen.

### Echter Provider-Nachweis

Am 22.08.2026 wurde Neon Auth nur auf dem isolierten Zweig
`br-polished-violet-b1iuqhwo` für den M0.7-Nachweis verwendet. Email/Passwort war
dort aktiviert. Der Nachweis hat:

- einen kurzlebigen Testnutzer registriert,
- eine Session aufgebaut,
- über Better Auth `/token` ein echtes JWT bezogen,
- das JWT mit dem M0.7-Code gegen den von Neon gelieferten JWKS-Endpunkt geprüft,
- danach den gesamten Neon-Zweig samt Testkonten gelöscht.

Dabei wurde ein Integrationsdetail gefunden und behoben: Managed Neon Auth
liefert die API unter einem Pfad wie `/neondb/auth`, setzt `iss` und `aud` des
JWT aber auf den **HTTPS-Origin** des Endpunkts. Der erste Livenachweis lehnte
das echte Token deshalb korrekt ab, weil der Code zunächst den vollständigen
Auth-Pfad erwartet hatte. Der Default wird jetzt aus dem Origin abgeleitet;
explizite `NEON_AUTH_ISSUER`- und `NEON_AUTH_AUDIENCE`-Werte können ihn weiterhin
überschreiben.

Das im Livenachweis beobachtete Schlüsselformat war Ed25519 (`kty=OKP`,
`crv=Ed25519`); das ausgestellte JWT verwendete `alg=EdDSA` und enthielt `sub`
und `exp`. Token, Passwort und Nutzerkennung wurden nicht ausgegeben.

## Neon `production` — korrigierter Ist-Stand

Projekt: `damp-dream-67070160` (`Build your Buissness`), PostgreSQL 18,
Default-Branch `production` (`br-patient-snow-b11ksdc8`).

Eine frühere Fassung dieser Datei sagte, Neon Auth sei dort noch nicht
provisioniert. Der direkte Read-only-Check am 22.08.2026 zeigt dagegen:

- Schema `neon_auth` existiert bereits.
- `neon_auth.project_config` enthält eine Projektkonfiguration für
  `Build your Buissness`.
- Der Zeitpunkt und der ursprüngliche Auslöser dieser Provisionierung sind aus
  dem aktuellen Repo-Stand nicht dokumentiert.
- M0.7 hat an der produktiven Auth-Konfiguration **nichts geändert**.

Unverändert offen auf `production`:

- Migration `002_protokoll_inhalt.sql` ist dort noch **nicht** angewendet.
- Die Rolle `byb_app` existiert dort noch **nicht**.
- Deshalb ist der neue M0.6/M0.7-Pfad noch kein produktiv verwendeter
  Nutzerdatenpfad.

Vor einem späteren Anwenden von Migration 002 wird erneut geprüft, ob bereits
Protokollzeilen existieren. Vorhandene Protokolle ohne kanonischen v1-Inhalt
blockieren die Migration bewusst, statt unvollständige Daten zu erraten.

## Abhängigkeiten

M0.7 ergänzt `jose` **6.2.9** für JWT/JWKS-Verifikation. Das Lockfile wurde in
GitHub Actions erzeugt und anschließend unter Node 22 mit Lint, Typprüfung,
Tests und Dependency-Audit geprüft. Die temporäre Workflow-Datei für diesen
Lockfile-Schritt ist nicht Teil des finalen PR-Diffs.

Vitest bleibt auf `4.1.10`. Die normale CI blockiert weiterhin hohe und
kritische bekannte Dependency-Funde über `npm audit --audit-level=high`.

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

Nicht gesetzt und für M0.7 nicht erforderlich:

- `NVIDIA_BASE_URL` — der Code hat eine Vorgabe.
- `DATABASE_URL` — die Neon-Anbindung kann die Verbindung über die Neon-API
  beziehen.

Keine Secret-Werte werden in CI ausgegeben.

## Offene Produktfragen

### 1. Produktive Freigabe des neuen Datenpfads

Code und Nachweise für Persistenz, RLS-Kontext und Provider-JWT stehen. Auf
`production` fehlt aber noch Migration 002 mit `protokolle.inhalt` und
`byb_app`. Das Anwenden bleibt ein eigener produktiver Zustandsschritt und wird
nicht in PR #9 versteckt.

### 2. Anwendungsschicht und Produktfluss

Der Backend-Kern hat jetzt eine Auth-Grenze und einen mandantengebundenen
Protokollspeicher, aber noch keinen endgültigen HTTP-/UI-Produktfluss. Dieser
Schritt sollte an der tatsächlichen Nutzerreise ausgerichtet werden, statt eine
Route oder Oberfläche aus technischen Annahmen zu erfinden.

### 3. Sandbox-Laufzeit — blockiert M1

Noch offen. Kandidaten aus `CLAUDE.md`: Fly Machines, E2B, Modal, Render
Background Worker. Bis zur Entscheidung bleiben Angriffe statisch.

### 4. Laufzeit-Fixer und Grenzen der statischen Prüfung

Noch nicht abgedeckt sind unter anderem fachlich falsche vorhandene Auth-Prüfungen,
Policies mit falscher Mandantenspalte, Rechteausweitung über mehrere Routen und
Datenabfluss, der erst in einer laufenden Anwendung sichtbar wird. Diese Grenzen
müssen im späteren Prüfprotokoll sichtbar bleiben.

## Nächster Schritt nach PR #9

PR #9 zuerst mergen. Danach gibt es zwei getrennte Arten von Arbeit:

1. **Produktiver Zustandsschritt:** Migration 002 erst nach erneutem Read-only-
   Check und ausdrücklicher Freigabe auf `production` anwenden; anschließend
   `byb_app` und den kanonischen Protokollspeicher dort verifizieren.
2. **Produktarbeit:** den nächsten HTTP-/UI-Schritt aus der tatsächlichen
   BYB-Nutzerreise ableiten. Dafür ist zusätzlicher Produktkontext sinnvoll,
   bevor eine Oberfläche oder API-Struktur geraten wird.

M1 bleibt unabhängig davon durch die noch offene Sandbox-Laufzeit blockiert.
