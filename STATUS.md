# STATUS.md — Stand und offene Fragen

Stand: **M0.9 ist in PR #11 gebaut und gegen einen kurzlebigen Neon-Zweig nachgewiesen.**

- M0.5 / PR #7 ist in `main` (`234dbe33`).
- M0.6 / PR #8 ist in `main` (`8776c66d`).
- M0.7 / PR #9 ist in `main` (`c5a7336a`).
- M0.8 / PR #10 ist in `main` (`95015e15`).
- M0.9 liegt auf `m09-persistent-control-plane`.
- Auf dem geprüften M0.9-Code-Head `54cab274` sind CI, Geheimnisse, Sprache,
  RLS-Nachweis, Backend-Nachweis und der neue Control-Plane-Nachweis grün.
- CI: **20 Testdateien / 237 Tests**, Lint und TypeScript grün,
  `npm audit --audit-level=high`: **0 bekannte Schwachstellen**.

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Systeme und wählt die Ressourcen, auf denen BYB arbeiten
darf. BYB übersetzt ein Ziel in einen Aktionsgraph, führt freigegebene Arbeit
möglichst autonom aus und dokumentiert Zustände, Ergebnisse, Kosten und
Blockaden. Das Prüfprotokoll ist dabei Audit-/Trust-Layer, nicht das gesamte
Produkt.

## Was technisch steht

| Bereich | Stand |
|---|---|
| `control-plane/v1.ts` | Vertrag für Projekte, Verbindungen, Aufträge, Aktionen, Freigaben, Credits und Activity Log. |
| `control-plane/speicher.ts` | Persistiert den kanonischen Auftrag, projiziert Aktionen/Ereignisse und verwaltet Worker-Leases. |
| `db/003_control_plane.sql` | RLS-geschützte Control-Plane-Tabellen plus eng begrenzte Worker-Rolle. |
| `db/worker-kontext.ts` | Führt Hintergrundarbeit transaktional als `byb_worker` aus. |
| `db/control-plane-nachweis.ts` | Echter Persistenz-/Lease-Nachweis auf einem kurzlebigen Neon-Zweig. |
| `auth/neon-jwt.ts` | Kryptografische Neon-Auth-JWT-Prüfung über JWKS. |
| `db/protokoll-speicher.ts` | Atomare Persistenz des Debug-/Security-Protokolls. |
| `core/orchestrator.ts` | Angreifen → fixen → Änderungen übernehmen → erneut prüfen. |
| `models/` | NVIDIA-Modellzugriff mit Rollen, Zeitgrenzen und Retry-Verhalten. |

## M0.9 — persistente Control Plane

### Kanonischer Auftrag und Projektionen

`steuer_auftraege.inhalt` speichert den vollständigen Control-Plane-v1-Auftrag
als kanonisches JSON. `steuer_aktionen` ist die relationale Projektion für
Scheduling, Freigaben, Credits und Leases. `steuer_ereignisse` hält den
Activity-Stream.

Alle drei Tabellen haben `ENABLE ROW LEVEL SECURITY` und `FORCE ROW LEVEL
SECURITY`.

Der Nutzerpfad läuft als `byb_app` und bleibt über
`nutzer_id = auth.nutzer_kennung()` mandantengebunden.

### Hintergrundworker

Migration 003 führt `byb_worker` ein als:

- `NOLOGIN`
- `NOSUPERUSER`
- `NOCREATEDB`
- `NOCREATEROLE`
- `NOINHERIT`
- `NOBYPASSRLS`

Die Rolle erhält ausschließlich auf den neuen Control-Plane-Tabellen die für
Scheduling nötigen Rechte und eigene explizite RLS-Policies. Sie erhält keine
Rechte auf `laeufe`, `protokolle`, `befunde` oder `runden` und ist kein
allgemeiner Service-Role-Ersatz.

### Leases und Wiederaufnahme

`naechsteAktionLeasen()` sucht Aufträge mit `FOR UPDATE SKIP LOCKED`. Eine
interne oder bereits freigegebene startbare Aktion wird atomar auf `laeuft`
gesetzt und bekommt ein zufälliges Lease-Token, Ablaufzeit, Worker-ID und einen
Versuchszähler.

- Eine aktive Lease wird nicht doppelt vergeben.
- Ein Worker kann seine Lease nur mit passendem, noch aktivem Token erneuern.
- Nach Lease-Ablauf darf ein anderer Worker die laufende Aktion mit neuem Token
  übernehmen.
- Ein alter Worker kann mit seinem inzwischen ungültigen Token nicht mehr
  abschließen.
- Abschluss, tatsächliche Credits, Auftrag, Aktionsprojektion und Activity-Log
  werden gemeinsam in einer Transaktion aktualisiert.
- Freigaben werden ebenfalls unter Auftrags-Sperre persistent angewendet.

Damit ist die **Persistenz- und Koordinationsgrundlage** für „Fenster schließen
und später weiterarbeiten“ vorhanden. Noch nicht vorhanden ist ein dauerhaft
laufender Worker/Scheduler, der diese Leases selbstständig abholt und echte
Connector-Aktionen ausführt.

## Echter Neon-Nachweis

Der finale M0.9-Nachweis lief nur auf dem kurzlebigen Neon-Zweig
`control-plane-nachweis-1787421239780` (`br-tiny-hall-b1h962ll`). Der Zweig wurde
anschließend gelöscht.

Nachgewiesen wurden:

- zwei Nutzer speichern und lesen nur ihre eigenen Aufträge,
- `byb_worker` ist `NOLOGIN`/`NOBYPASSRLS`,
- `byb_worker` kann bestehende Protokolle nicht lesen,
- aktive Leases werden nicht doppelt vergeben,
- eine abgelaufene Lease wird mit neuem Token wieder aufgenommen,
- der alte Worker-Token kann danach nicht mehr abschließen,
- Lease-Erneuerung, Freigabe, Abschluss und tatsächliche Credits bleiben
  persistent.

Die Lease-Ablaufprüfung verwendet bewusst mehrere Sekunden statt eines
Millisekunden-Rennens, damit Netzwerklatenz zwischen GitHub Runner und Neon den
Nachweis nicht zufällig beeinflusst.

## Verifikation auf M0.9-Code-Head `54cab274`

- CI: grün
- Lint: grün
- TypeScript: grün
- Vitest: **20 Dateien / 237 Tests grün**
- davon Control-Plane-/Persistenz-Subset: **4 Dateien / 22 Tests grün**
- `npm audit --audit-level=high`: **0 bekannte Schwachstellen**
- Geheimnisse: grün
- Sprache: grün
- RLS-Nachweis: grün
- Backend-Nachweis: grün
- Control-Plane-Nachweis gegen echten kurzlebigen Neon-Zweig: grün

Eine frühere CI-Runde in PR #11 war nur wegen drei Lint-Funden rot
(`require-await` in zwei Test-Doubles und ein Type-only-Import). Diese Stellen
wurden korrigiert; der aktuelle Code-Head ist grün.

## Neon `production`

M0.9 hat **keine Produktionsänderung** ausgeführt.

Bekannter Stand vor M0.9:

- Neon Auth ist auf `production` bereits provisioniert.
- Migration `002_protokoll_inhalt.sql` war noch nicht angewendet.
- `byb_app` war dort noch nicht vorhanden.

Migration `003_control_plane.sql` wurde ebenfalls nicht auf `production`
ausgeführt. Da 003 absichtlich die Rolle `byb_app` voraussetzt, muss bei einer
späteren produktiven Freigabe zuerst der Zustand erneut read-only geprüft und
dann 002 vor 003 angewendet werden. Das bleibt ein eigener produktiver Schritt.

## Offen

### 1. Worker-Runtime + erster echter Executor

Die Queue kann Arbeit persistent koordinieren, aber noch kein dauerhaft
laufender BYB-Worker führt Aktionen aus. Der nächste Produktkern ist deshalb
ein Worker, der eine Lease nimmt, sie während langer Arbeit erneuert, genau
eine Aktion ausführt und Ergebnis/Fehler zurückschreibt.

Der erste Executor soll an der Kernkette beginnen:

**GitHub → Backend (Neon/Supabase) → Vercel.**

### 2. Fehlergrenzen des autonomen Workers

Für produktiven Dauerbetrieb fehlen noch begrenzte Retries, Klassifikation von
wiederholbaren/nicht wiederholbaren Fehlern und ein sichtbarer Dead-Letter-
Zustand statt endloser Wiederaufnahme.

### 3. Credits/Billing

Auftragsdeckel und tatsächlicher Verbrauch sind im Vertrag und persistenten
Zustand vorhanden. Ein echtes Abo-/Wallet-/Top-up-System sowie atomare
Reservierung/Abbuchung gegen parallele Worker fehlen noch.

### 4. Sandbox-Laufzeit

Weiter offen. Dynamische Debug-/Security-Angriffe gegen eine isoliert laufende
Kunden-App brauchen weiterhin eine Runtime-Entscheidung.

### 5. Historische Zugangsdaten und CI-Wartung

Frühere NVIDIA-Werte liegen weiterhin im Git-Verlauf; ihr Anbieter-Widerruf ist
nicht verifiziert. Zusätzlich bestehen nur Wartungswarnungen für
`actions/checkout@v4`, `actions/setup-node@v4`, ESLint 9.39.5 und eine angekündigte
Änderung der `pg`-SSL-Modus-Semantik. Aktuell ist davon kein Gate rot.

## Nächster Schritt nach Merge von PR #11

**M1.0: Worker-Runtime + erster GitHub-Executor.**

Ein Cloud-Worker soll eine persistierte Aktion leasen, einen GitHub-Arbeitsbranch
für ein ausgewähltes Repo bearbeiten, Lease-Erneuerung und Fehlergrenzen nutzen
und sein Ergebnis wieder in Auftrag/Activity-Log schreiben. Noch keine
Production-Deployments. Danach wird derselbe Executor-Rahmen um Backend
(Neon/Supabase) und Vercel erweitert.
