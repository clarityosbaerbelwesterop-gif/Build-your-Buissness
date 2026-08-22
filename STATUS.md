# STATUS.md — Stand und offene Fragen

Stand: **M1.1 ist in PR #13 gebaut und nachgewiesen.**

- M0.5 / PR #7 ist in `main` (`234dbe33`).
- M0.6 / PR #8 ist in `main` (`8776c66d`).
- M0.7 / PR #9 ist in `main` (`c5a7336a`).
- M0.8 / PR #10 ist in `main` (`95015e15`).
- M0.9 / PR #11 ist in `main` (`197fc981`).
- M1.0 / PR #12 ist in `main` (`72b25de1`).
- M1.1 liegt auf `m11-connector-persistence-write-proof`; PR #13 ist noch nicht gemergt.
- Auf dem sauberen M1.1-Code-Head `ddd121ca` sind CI, Geheimnisse, Sprache,
  RLS-Nachweis, Backend-Nachweis, Control-Plane-Nachweis,
  GitHub-Connector-Nachweis und Connector-Persistenz-Nachweis grün.
- CI: **25 Testdateien / 260 Tests**, Lint und TypeScript grün,
  `npm audit --audit-level=high`: **0 bekannte Schwachstellen**.

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet seine Unternehmenssysteme und wählt die konkreten
Ressourcen, auf denen BYB arbeiten darf. Der interne Auftrag bleibt reine
Ausführungs- und Wiederaufnahme-Infrastruktur; er ist nicht die primäre
Nutzeroberfläche.

## Connector Hub — Zielbild

Aktuell modelliert sind:

- GitHub → Repository
- Neon oder Supabase → Backend-Projekt
- Vercel → Projekt
- Stripe → Payment-Konto
- Higgsfield → Creative-Workspace
- Meta Ads → Werbekonto
- TikTok Ads → Werbekonto
- YouTube → Kanal
- Google Ads → Werbekonto
- Google Search Console → Property
- Wix → Site

Der Datenvertrag enthält ausschließlich stabile Konto-/Ressourcenreferenzen,
Status und Scopes. OAuth-Tokens, Refresh-Tokens, API-Keys oder Provider-Secrets
werden dort nicht gespeichert.

## M1.1 — persistente Connector-Auswahl

Migration `004_connector_hub.sql` führt zwei neue RLS-geschützte Tabellen ein:

### `connector_verbindungen`

Speichert pro Nutzer die validierten Connector-Referenzen und die verfügbaren,
vom Adapter gemeldeten Ressourcen als kanonisches Connector-Hub-v1-JSON.

### `connector_projekt_werkzeuge`

Speichert pro Nutzer und Projekt den konkreten Resource Pick, also zum Beispiel:

- genau dieses GitHub-Repo,
- genau dieses Neon- oder Supabase-Projekt,
- genau dieses Vercel-Projekt,
- später Stripe, Wix, Higgsfield, Ads-Accounts und Search-Property.

`projektWerkzeugeSpeichern()` persistiert einen Pick erst, nachdem
`werkzeugeAufloesen()` bestätigt hat, dass Anbieter, Verbindung, Status und
Ressourcen-ID zusammenpassen.

Alle Connector-Tabellen haben `ENABLE ROW LEVEL SECURITY` und
`FORCE ROW LEVEL SECURITY`.

`byb_app` darf nur Daten des verifizierten Nutzers lesen und verändern.
`byb_worker` erhält auf Connector-Daten **ausschließlich SELECT**. Damit kann ein
Worker die freigegebenen Ressourcen eines Auftrags auflösen, aber nicht selbst
Connectoren oder Resource Picks umschreiben.

## Worker-Lease-Filter

M1.0 hatte noch eine reale Queue-Grenze: Ein Worker konnte theoretisch eine
startbare Aktion leasen, obwohl er für deren Typ keinen Executor registriert
hatte. Dann wäre die Aktion unnötig blockiert gewesen.

M1.1 behebt das vor der Lease:

- `worker/runtime.ts` übergibt die tatsächlich registrierten Aktionstypen an die
  Queue.
- `naechsteAktionLeasen()` berücksichtigt nur diese Typen.
- Auch abgelaufene Leases werden nur von einem Worker übernommen, der den
  Aktionstyp ausführen kann.
- Ein leeres Executor-Register öffnet gar keine Worker-Transaktion.
- `AktionsLease` enthält zusätzlich `projektId`, damit ein Executor die exakt
  zum Auftrag gehörenden Connector-Picks laden kann.

Retry-/Dead-Letter-Logik ist damit noch nicht gelöst; M1.1 verhindert zunächst
die falsche Zuteilung.

## Echter Connector-Persistenz-Nachweis gegen Neon

Der finale Nachweis auf dem M1.1-Code-Head lief mit dem vorhandenen
`NEON_API_KEY` gegen einen eigens erzeugten kurzlebigen Neon-Zweig:

- Zweig: `connector-hub-nachweis-1787424292910`
- Zweig-ID: `br-morning-glade-b1tpgkrj`
- Migrationen 002 → 003 → 004 wurden nur dort angewendet.
- Der Zweig wurde anschließend wieder gelöscht.

Nachgewiesen wurde konkret:

1. Die Connector-Tabellen enthalten keine Spalten für Token/Secret/API-Key/
   Refresh-Token.
2. Zwei Nutzer können dieselben Connector-IDs und dieselbe Projekt-ID verwenden,
   ohne gegenseitig ihre Ressourcen zu sehen.
3. Resource Picks werden gegen die eigenen verbundenen Ressourcen aufgelöst.
4. `byb_worker` kann die adressierten Picks lesen.
5. `byb_worker` kann Connector-Konfiguration nicht verändern.

`production` wurde dabei nicht verändert.

## Echter isolierter GitHub-Write-Proof

Der Write-Pfad wurde zusätzlich einmal real gegen dieses Repository ausgeführt.
Dafür gab es auf dem Feature-Branch vorübergehend einen eng begrenzten
Push-Workflow mit `contents: write`. Dieser Workflow und sein temporärer
Erfolgsmarker wurden danach wieder aus dem PR-Diff entfernt.

GitHub-Actions-Run: `32591589595`.

Nachgewiesen wurde:

- Branch-Regeltests: **4 Tests grün**.
- Temporärer Branch wurde erstellt:
  `byb/live-nachweis-repo-write-32591589595`.
- Basis war exakt `main` auf `72b25de1`.
- Der Branch-SHA wurde nach dem Anlegen erneut gelesen und mit der Basis
  verglichen.
- Der temporäre Branch wurde anschließend gelöscht.
- Die Löschung gilt im Proof nur dann als erfolgreich, wenn GitHub beim erneuten
  Lesen tatsächlich `404` liefert; Auth-/Netzwerkfehler zählen nicht als
  erfolgreiche Löschung.

`BYB_GITHUB_LIVE_TOKEN` war weiterhin nicht gesetzt. Dieser einmalige isolierte
Repository-Proof lief daher mit dem kurzlebigen GitHub-Actions-Token. Für echte
Nutzer-Connectoren bleibt das Ziel eine explizite OAuth-/Provider-Credential-
Verbindung; es wird kein allgemeiner CI-Token als Produktcredential verwendet.

## Verifikation auf M1.1-Code-Head `ddd121ca`

- CI: grün
- Lint: grün
- TypeScript: grün
- Vitest: **25 Dateien / 260 Tests grün**
- `npm audit --audit-level=high`: **0 bekannte Schwachstellen**
- Geheimnisse: grün
- Sprache: grün
- RLS-Nachweis: grün
- Backend-Nachweis: grün
- Control-Plane-Nachweis: grün
- GitHub-Connector-Nachweis: grün
- Connector-Persistenz-Nachweis inkl. echtem kurzlebigem Neon-Zweig: grün
- isolierter GitHub-Write-Proof inkl. Create → Verify → Delete: grün

Während der Entwicklung waren zwei CI-Runden wegen ausschließlich lokaler
Lint-Regeln im temporären Write-Proof rot (`no-unsafe-finally` und
`only-throw-error`). Der Fehlerpfad wurde so umgebaut, dass Ausführungs- und
Cleanup-Fehler nicht überschrieben werden und unbekannte Fehlerwerte als echte
`Error`-Objekte mit Ursache weitergegeben werden. Der saubere Endstand ist grün.

## Neon `production`

M1.1 hat **keine Produktionsmigration** ausgeführt.

Migration 002, 003 und 004 wurden weiterhin nicht auf Neon `production`
angewendet. Der manuelle Neon-Workflow kennt jetzt bewusst alle vier
Migrationsdateien 001–004; Anwenden erfordert weiterhin eine separate manuelle
Ausführung mit der bestehenden Bestätigungsgrenze.

## Festgelegte Produktreihenfolge

1. Connector Hub + Resource Picker.
2. Connector-Persistenz + isolierte Provider-Proofs.
3. Tatsächliche OAuth/MCP-/Credential-Flows und Resource Discovery.
4. GitHub produktiv über die gewählte Repo-Ressource ausführen.
5. Neon/Supabase-Adapter und Executor.
6. Vercel-Adapter und Executor.
7. Stripe + Abo-/Credit-/Top-up-System vollständig vor Live.
8. Wix-Landingpage anbinden und in den kontrollierten BYB/Vercel-Codepfad
   übernehmen.
9. Higgsfield + Meta/TikTok/YouTube/Google Ads.
10. Vollständiger Pre-Live Produkt-/Payment-/Debug-/Security-Test.
11. Livegang; danach noch einmal echter Live-Pfad-Test **vor Indexierung**.
12. Erst danach Search Console, Indexierung und schrittweiser Growth-/Ads-Betrieb.

## Noch offen

### 1. Echte Provider-Verbindungen

Der Daten- und Persistenzvertrag steht. Noch fehlen die tatsächlichen
OAuth-Callbacks, MCP-/API-Adapter, Token-Rotation, Credential-Referenzen und die
Resource-Discovery je Anbieter.

### 2. Backend- und Deploy-Executor

GitHub-Branch-Schreiben ist als isolierter Proof nachgewiesen. Als nächstes
müssen Neon/Supabase und Vercel denselben Connector-/Resource-Pick-Vertrag
verwenden.

### 3. Dauerhafter Worker-Betrieb

Noch fehlen begrenzte Retries, Fehlerklassifikation, Dead-Letter-Zustand und
eine dauerhafte Cloud-Worker-Runtime.

### 4. Credits/Billing

Auftragsdeckel und tatsächlicher Verbrauch existieren. Vor Live fehlen Stripe-
Abo, Wallet, Top-ups und atomare Credit-Reservierung/Abbuchung.

### 5. Sandbox-Laufzeit

Die Runtime für dynamische Debug-/Security-Angriffe gegen eine isolierte
Kunden-App bleibt eine eigene Architekturentscheidung.

### 6. Wartung / historischer Secret-Vorfall

Frühere NVIDIA-Werte liegen weiterhin im Git-Verlauf; ihr Anbieter-Widerruf ist
nicht verifiziert. Zusätzlich bestehen Wartungswarnungen für GitHub Actions,
ESLint und die angekündigte Änderung der `pg`-SSL-Semantik. Aktuell ist davon
kein Gate rot.

## Nächster Schritt nach Merge von PR #13

**M1.2: echte Connector-Verbindungen + Resource Discovery für die Kernkette.**

Zuerst werden GitHub, Neon/Supabase und Vercel hinter einen gemeinsamen
Credential-/Adapter-Vertrag gesetzt. OAuth bzw. der passendste
anbieterunterstützte Verbindungsweg liefert nur eine Secret-Referenz; BYB lädt
danach die verfügbaren Repositories/Projekte und speichert weiterhin nur die
vom Nutzer gewählten Referenzen in der Control Plane.

Danach kann der Worker nicht nur einen Testbranch erzeugen, sondern einen
persistierten BYB-Auftrag vollständig über die ausgewählten Ressourcen entlang
**GitHub → Neon/Supabase → Vercel** ausführen — weiterhin ohne Production-Deploy
ohne explizite Freigabe.
