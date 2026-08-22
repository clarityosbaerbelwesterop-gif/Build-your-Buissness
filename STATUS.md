# STATUS.md — Stand und offene Fragen

Stand: **M0.8 ist in PR #10 gebaut und nachgewiesen.**

- M0.5 / PR #7 ist in `main` (`234dbe33`).
- M0.6 / PR #8 ist in `main` (`8776c66d`).
- M0.7 / PR #9 ist in `main` (`c5a7336a`).
- M0.8 liegt auf `m08-control-plane`; PR #10 ist noch nicht gemergt.
- Auf dem geprüften M0.8-Code-Head `2498cf21` sind CI, Geheimnisse, Sprache und
  Backend-Nachweis grün.
- CI: **17 Testdateien / 226 Tests**, Lint und TypeScript grün,
  `npm audit --audit-level=high`: **0 bekannte Schwachstellen**.

## Produktdefinition — korrigiert

BYB ist nicht mehr als reines Prüfprodukt beschrieben.

**Build your Buissness ist ein autonomer AI-Business-Operator.**

Merksatz:

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Systeme und wählt die Ressourcen, auf denen BYB arbeiten
darf. Danach soll BYB Ziele in einen Aktionsgraph übersetzen und möglichst
selbstständig bauen, verbinden, testen, veröffentlichen, beobachten und später
optimieren.

Das Prüfprotokoll bleibt wichtig, ist aber die **Audit-/Trust-Schicht** für
Debug-/Security-Prüfungen und nicht das gesamte Produkt.

`CLAUDE.md`, `CHATHUB.md` und `DESIGN-UI.md` bilden dieses Produktbild jetzt ab.
Die ältere, widersprüchliche `Chathub.md` ist ausdrücklich als Legacy markiert.

## Was technisch steht

| Bereich | Stand |
|---|---|
| `models/` | NVIDIA-Modellzugriff mit Rollen, Zeitgrenzen und Retry-Verhalten. |
| `core/orchestrator.ts` | Angreifen → fixen → Änderungen übernehmen → erneut prüfen. |
| `attackers/` | Statische Prüfklassen für Zugangsdaten, RLS und Auth an Route-Handlern. |
| `db/001_grundschema.sql` | BYB-Protokolltabellen mit RLS. |
| `db/002_protokoll_inhalt.sql` | Kanonisches Protokoll-JSON und eingeschränkte Laufzeitrolle `byb_app`. |
| `db/protokoll-speicher.ts` | Atomare, validierte Protokoll-Persistenz. |
| `auth/neon-jwt.ts` | Kryptografische Neon-Auth-JWT-Prüfung über JWKS. |
| `auth/protokoll-zugriff.ts` | Verifizierte Identität → RLS-gebundener Datenpfad. |
| `control-plane/v1.ts` | Versionierter Vertrag für Ressourcen, Projekte, Aufträge, Aktionen, Freigaben, Credits und Activity Log. |

## M0.8 — Control Plane v1

M0.8 bildet erstmals den eigentlichen BYB-Auftrag ab.

### Verbindungen und Projekte

Der Vertrag kennt aktuell:

- GitHub
- Vercel
- Neon
- Supabase
- Stripe
- Google Search Console
- Higgsfield
- Meta Ads
- TikTok Ads

Eine Verbindung speichert nur Konto-/Ressourcenreferenzen. Unbekannte Felder
werden durch den strikten Zod-Vertrag abgelehnt; rohe Tokens oder Keys gehören
nicht in den Control-Plane-Datensatz.

Ein Projekt wählt GitHub, Vercel und genau einen Backend-Anbieter: **Neon oder
Supabase**. Das ist der Backend-Anbieter der vom Nutzer gebauten Anwendung; die
interne BYB-Control-Plane-Persistenz darf davon unabhängig sein.

### Aufträge und Aktionen

Ein Auftrag hat:

- Ziel
- Aktionsgraph mit Abhängigkeiten
- Aktionszustände
- Verbindungsreferenzen je Aktion
- geschätzte und tatsächliche Credits
- Credit-Deckel
- verständliches Activity Log

Unterstützte Aktionsarten reichen bereits im Vertrag von Planung, Repo, Code,
Backend, Auth, Payments und Tests bis Sandbox, Security, Fix, Deploy, Domain,
Indexierung, Werbemittel, Ads und Monitoring. **Das bedeutet noch nicht, dass
alle diese Connectoren implementiert sind.** Der Vertrag reserviert die Form,
ohne Verfügbarkeit vorzutäuschen.

### Autonomie und Freigaben

Drei Klassen sind festgelegt:

1. `intern` — keine Nutzerfreigabe nötig; z. B. Code/Tests innerhalb der
   verbundenen Arbeitsressourcen.
2. `extern` — z. B. Deploy/Domain; braucht Einzel- oder Dauerfreigabe.
3. `finanziell` — z. B. Ads/Budget; braucht eine explizite Freigabe-/Budgetregel.

Eine Aktion startet nur, wenn:

- sie geplant ist,
- alle Abhängigkeiten erfolgreich sind,
- ihre Freigabegrenze erfüllt ist,
- die Credit-Schätzung in den Auftragsrahmen passt.

Unbekannte, selbstreferenzielle und **zyklische** Abhängigkeiten werden
abgelehnt. Nach Abschluss einer internen Aktion wechselt der Auftrag auf
`wartet_freigabe`, wenn als Nächstes nur eine noch nicht freigegebene externe
oder finanzielle Aktion möglich ist. Nach Freigabe kann die Control Plane
weiterarbeiten.

### Nachweis auf PR #10, Head `2498cf21`

- CI: grün
- Lint: grün
- TypeScript: grün
- Vitest: **17 Dateien / 226 Tests grün**
- davon `control-plane/v1.test.ts`: **11 Tests**
- `npm audit --audit-level=high`: **0 bekannte Schwachstellen**
- Geheimnisse: grün
- Sprache: grün
- Backend-Nachweis: grün

Die neuen Tests decken insbesondere ab:

- Neon/Supabase-Auswahl
- keine unbekannten/Token-Felder in Verbindungen
- autonome interne Aktionen
- Abhängigkeiten vor Ausführung
- explizites Warten auf Freigabe
- externe/finanzielle Freigabegrenzen
- Credit-Deckel
- Activity-Log und tatsächlichen Verbrauch
- unbekannte, selbstreferenzielle und zyklische Aktionsabhängigkeiten
- doppelte Aktions-IDs

## Neon `production` — unverändert

Projekt: `damp-dream-67070160` (`Build your Buissness`), Default-Branch
`production` (`br-patient-snow-b11ksdc8`).

M0.8 hat **keine Produktionsänderung** ausgeführt.

Bekannter Stand:

- `neon_auth` ist auf `production` bereits provisioniert.
- Migration `002_protokoll_inhalt.sql` ist dort noch nicht angewendet.
- Rolle `byb_app` existiert dort noch nicht.
- Der M0.6/M0.7-Protokollpfad wird deshalb noch nicht produktiv verwendet.

Vor einer späteren Migration 002 wird erneut read-only geprüft, ob bestehende
Protokollzeilen die bewusst verlustfreie Migration blockieren würden.

## Zugangsdaten und historischer Vorfall

Der aktuelle Baum enthält keine versionierte `.env`; Secret-Gates sind grün.

Am 21.08.2026 lagen echte NVIDIA-Schlüssel in drei früheren `main`-Commits. Die
heute verwendeten Secrets sind andere Werte. Die alten Werte bleiben im
Git-Verlauf; **ob sie beim Anbieter widerrufen wurden, ist weiterhin nicht
verifiziert**. Eine History-Rewrite-Aktion bleibt separat und destruktiv.

Keine Secret-Werte werden in Repo, Protokoll oder CI-Ausgabe übernommen.

## Noch offen

### 1. Persistenz der Control Plane

M0.8 ist zunächst der versionierte Vertrag und seine Zustandslogik. Aufträge,
Aktionen, Freigaben, Verbindungsreferenzen und Ereignisse werden noch nicht in
der BYB-Datenbank gespeichert. Ohne persistente Zustände kann BYB noch nicht das
Kernversprechen „Fenster schließen, BYB arbeitet weiter" erfüllen.

### 2. Connector-Ausführung

Die Anbieter sind modelliert, aber M0.8 führt noch keine GitHub-, Vercel-,
Neon/Supabase-, Stripe-, Google-, Higgsfield- oder Ads-Aktion aus. Externe
Writes kommen erst hinter dem Control-Plane-Vertrag und seinen Freigabegrenzen.

### 3. Harte Credits/Billing

M0.8 führt Credit-Schätzung, tatsächlichen Verbrauch und einen Auftragsdeckel.
Ein echtes Abo-/Wallet-/Top-up-System sowie atomare Reservierung/Abbuchung sind
noch nicht gebaut.

### 4. Sandbox-Laufzeit

Weiter offen. Bis zur Entscheidung laufen keine dynamischen Angriffe gegen eine
echte isolierte App-Instanz.

### 5. CI-Wartung

Die Gates sind grün, aber GitHub warnt weiterhin, dass `actions/checkout@v4` und
`actions/setup-node@v4` Node 20 targeten und vom Runner auf Node 24 gehoben
werden. ESLint 9.39.5 meldet ebenfalls eine Support-Warnung. Das sind aktuell
keine Gate-Fehler, aber ein späterer Wartungsschritt.

## Nächster Schritt nach Merge von PR #10

**M0.9: persistente Control Plane für Hintergrundarbeit.**

Ziel: die M0.8-Verträge in einer RLS-geschützten BYB-Persistenz ablegen und
atomare Zustandsübergänge/Leases schaffen, damit ein Auftrag nach einem Request
weitergeführt, wieder aufgenommen und im Chathub als Activity Stream gelesen
werden kann.

Erst darauf sollte der erste echte Connector-Executor folgen, beginnend mit der
Kernkette **GitHub → Backend (Neon/Supabase) → Vercel**. So sitzt jeder externe
Write von Anfang an hinter einem persistenten Auftrag, einer Freigabegrenze und
einem nachvollziehbaren Ereignis.
