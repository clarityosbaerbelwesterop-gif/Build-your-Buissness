# STATUS.md — Stand und offene Fragen

Stand: **M1.3 ist auf `main`; M1.4 ist in PR #16 gebaut und auf dem finalen Code-Stand grün geprüft.**

- M0.5 / PR #7: `main` (`234dbe33`)
- M0.6 / PR #8: `main` (`8776c66d`)
- M0.7 / PR #9: `main` (`c5a7336a`)
- M0.8 / PR #10: `main` (`95015e15`)
- M0.9 / PR #11: `main` (`197fc981`)
- M1.0 / PR #12: `main` (`72b25de1`)
- M1.1 / PR #13: `main` (`407a8713`)
- M1.2 / PR #14: `main` (`8bc733ce`)
- M1.3 / PR #15: `main` (`c3be3765`)
- M1.4: Branch `m14-user-auth-e2e`, PR #16; Code-Head `632409e1`.

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Unternehmenssysteme und wählt die konkreten Ressourcen,
auf denen BYB arbeiten darf. Der interne Auftrag ist Ausführungs- und
Wiederaufnahme-Infrastruktur, nicht die primäre Nutzeroberfläche.

## Auf `main` bereits vorhanden

### Control Plane und Worker

- persistente Aufträge, Aktionen und Activity Log
- Approval- und Credit-Grenzen
- Worker-Leases mit Ablauf, Erneuerung und kontrolliertem Abschluss
- Worker leasen nur Aktionstypen, für die ein Executor registriert ist
- isolierter realer GitHub-Branch-Write-Proof wurde erfolgreich ausgeführt

### Connector Hub

Modelliert sind unter anderem GitHub, Neon/Supabase, Vercel, Stripe,
Higgsfield, Meta Ads, TikTok Ads, YouTube, Google Ads, Search Console und Wix.

Persistiert werden ausschließlich Connection-/Resource-Referenzen. OAuth-
Tokens, Refresh-Tokens, API-Keys und Provider-Secrets gehören nicht in die
Control Plane.

Die Tabellen `connector_verbindungen` und `connector_projekt_werkzeuge` sind
RLS-geschützt. `byb_worker` darf Connector-Picks nur lesen, nicht umschreiben.

### Neon Production

Projekt: `damp-dream-67070160`, Branch `production`.

Migrationen 002–005 sind produktiv angewendet. Vorhanden sind unter anderem:

- Control-Plane-Tabellen
- Connector-Persistenz
- Billing-Konten und Abos
- Credit-Konten und Credit-Buchungen
- idempotente Stripe-Webhook-Ereignisse
- `byb_app`, `byb_worker`, `byb_billing` mit getrennten Rechten
- FORCE RLS auf den mandantenbezogenen BYB-Tabellen
- Managed Neon Auth

Neon Auth erlaubt die stabile BYB-Systemdomain
`https://build-your-buissness.vercel.app` als Trusted Origin. Google OAuth ist
über Neons Shared Provider vorhanden; E-Mail/Passwort-Anmeldung ist aktiviert.

### Stripe Billing und Credits

Der BYB-Katalog ist strikt von vorhandenen älteren Stripe-Produkten getrennt.
BYB-Objekte tragen den Namespace `byb_preview_v1` / `application=byb`.

Aktuelle Preise:

- Starter: 20 EUR/Monat, 100 Credits
- Pro: 200 EUR/Monat, 750 Credits
- Scale: 250 EUR/Monat, 1.500 Credits
- Top-up: 25 EUR einmalig, 100 Credits

Der Backend-Pfad verarbeitet BYB-Checkout-/Invoice-/Subscription-Events und
schreibt Credits idempotent nach Neon. Fremde Stripe-Produkte werden ignoriert.

Der produktive BYB-Webhook `we_1U7YtQEmDA2oLCportbRSUaX` zeigt auf:

`https://build-your-buissness.vercel.app/api/stripe-webhook`

Er empfängt ausschließlich:

- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Alte Stripe-Webhooks anderer Projekte wurden nicht verändert.

## M1.3 — Live-Runtime und Secret-Sync

PR #15 korrigierte die Vercel-API-Routen auf Method-Handler (`GET`/`POST`) und
wurde als `c3be3765` nach `main` gemergt.

Der dauerhafte Workflow `.github/workflows/vercel-preview.yml` ist
**workflow_dispatch-only**. Er prüft Zielressourcen, leitet die Neon-Runtime-
Konfiguration kontrolliert ab und synchronisiert die benötigten Runtime-Secrets
nach Preview + Production des freigegebenen BYB-Vercel-Projekts.

`NEON_API_KEY` wird nicht in die Vercel-Web-Runtime kopiert. Der Stripe-
Repository-Secretname `STRIPE_SIGNATURE_SECRET` wird ausschließlich als
Runtime-Variable `STRIPE_WEBHOOK_SECRET` gespiegelt.

Der reale M1.3-Proof bestätigte:

- Lint, TypeScript und Vitest grün
- Secret- und Sprach-Gates grün
- Neon Runtime-Konfiguration aufgelöst
- Neon Auth Trusted Origin gesetzt
- Vercel Runtime-Secrets nach Preview + Production synchronisiert
- Preview READY
- Production-Deploy aus dem Merge READY
- Landingpage HTTP 200
- `/api/billing` ohne JWT kontrolliert HTTP 401
- `/api/stripe-webhook` auf GET HTTP 405
- im geprüften Zeitraum keine Vercel-Runtime-Fehler gefunden

## M1.4 — First-Party Auth und Billing-Live-Test

PR #16 schließt die bisher fehlende sichtbare E-Mail/Passwort-Anmeldung für den
Owner-/Pre-Live-Test.

### Auth-Grenze

`/api/auth` ist ein Same-Origin-Proxy vor Managed Neon Auth. Er ist kein freier
HTTP-Proxy, sondern erlaubt nur fünf feste Aktionen:

- Registrierung → `/sign-up/email`
- Anmeldung → `/sign-in/email`
- Sitzung → `/get-session`
- JWT → `/token`
- Abmeldung → `/sign-out`

Jede Aktion ist an ihre HTTP-Methode gebunden. Fremde Browser-Origins werden vor
dem Neon-Upstream abgelehnt. Session-Cookies werden ohne fremde Domain-Angabe
und mit `Path=/api/auth` an die BYB-Domain zurückgegeben. Dadurch läuft der
Browserpfad first-party über BYB statt über ein direktes Cross-Site-Cookie zum
Neon-Host.

Die Auth-Grenze akzeptiert absichtlich nur die stabile BYB-Systemdomain. Vercel-
Preview-Domains können deshalb den realen Login nicht benutzen; der echte
Session/JWT-Proof erfolgt erst nach Merge auf Production.

### Live-Test-Oberfläche

`/login.html` enthält:

- Registrieren
- Anmelden
- Sitzung/JWT erneuern
- Abmelden
- RLS-geschützten `/api/billing`-Stand lesen
- Starter-, Pro- und Scale-Checkout öffnen
- Top-up-Checkout öffnen

Die Landingpage verlinkt `Anmelden / Live-Test`. Ein Checkout-Klick ohne JWT
führt ebenfalls zur Anmeldung.

### M1.4 Verifikation auf Code-Head `632409e1`

- CI: grün
- Lint: grün
- TypeScript: grün
- Tests: grün
- Abhängigkeitsprüfung: grün
- Geheimnisse: grün
- Sprache: grün
- Vercel Preview: READY
- temporärer `contents: write`-Workflow wurde nach exakt zwei vorgesehenen
  `index.html`-Änderungen wieder aus dem Branch entfernt

Zwei frühere CI-Runden waren ausschließlich wegen strenger Lint-/TypeScript-
Regeln im neuen Test bzw. Fetch-Init rot. Beide Ursachen wurden behoben; der
aktuelle Head ist grün.

## Vercel

Zielprojekt:

- Name: `build-your-buissness`
- ID: `prj_VB7ToSJE6spWofEKZRjVyC0d6rOL`
- GitHub: `clarityosbaerbelwesterop-gif/Build-your-Buissness`
- stabile System-/Vorschaudomain: `https://build-your-buissness.vercel.app`

Die Custom Domain bleibt bis nach dem vollständigen Nutzer-Live-Test
unangetastet.

## Noch offen vor „Ready für Live-Test“

### 1. M1.4 Production-Proof

Nach Merge von PR #16:

- `/login.html` öffentlich auf der stabilen BYB-Domain prüfen
- Auth-Whitelist und Origin-Grenze auf Production prüfen
- echte Neon-Session/JWT-Kette über die BYB-Domain prüfen
- Billing-RLS mit einem angemeldeten Nutzer prüfen
- Checkout-Session ohne Zahlung öffnen

### 2. Echte Nutzer-Connectoren

Connection-/Resource-Persistenz steht. Für öffentliche Nutzer fehlen weiterhin
die vollständigen Provider-OAuth-/Credential-Flows und Resource Discovery,
insbesondere GitHub, Vercel, Neon/Supabase und Stripe. Provider-App-Zugänge
werden nicht erfunden oder aus ChatGPT-Connector-Credentials exportiert.

### 3. Vollständiger Worker-Betrieb

Noch fehlen begrenzte Retries, Fehlerklassifikation, Dead-Letter-Zustand und
eine dauerhaft laufende Cloud-Worker-Runtime. Der GitHub-Write ist bisher ein
isolierter Proof, kein vollständiger autonomer Produktbetrieb.

### 4. Wix-Designquelle

Der Import der bestehenden BYB-Vercel-Seite in Wix wurde versucht, von Wix aber
als ungültige Design-URL abgelehnt. Bestehende fremde Wix-Sites wurden nicht
verändert. Wix bleibt gemäß `DESIGN-UI.md` Design-/Vergleichswerkzeug und ist
keine Production-Abhängigkeit.

### 5. Pre-Live-End-to-End-Test

Vor Custom Domain und Indexierung müssen mindestens diese Pfade geprüft sein:

- Sign-up/Login → gültiges Neon-JWT
- Nutzer-RLS und Billing-Read
- Starter/Pro/Scale Checkout
- einmaliger Top-up
- Stripe-Webhook → idempotentes Credit-Ledger
- Connector wählen → Auftrag → Worker → Ergebnis/Activity Log
- Vercel Production ohne beobachtete Runtime-5xx im Prüfzeitraum
- vollständiger Debug-/Security-Test gegen die freigegebene BYB-Testumgebung

### 6. Später, bewusst noch nicht

- Custom Domain
- Search Console / Indexierung
- Higgsfield-Werbemittel für BYB selbst
- Meta/TikTok/YouTube/Google-Ads-Betrieb für BYB selbst

Diese Schritte kommen erst nach dem Nutzer-Live-Test.

## Nächste Umsetzung

1. PR #16 mergen und Production-Auth/Billing prüfen.
2. Worker-Retry/Failure-/Dead-Letter-Semantik schließen.
3. Den echten Connector-/Auftrag-/Worker-Pfad soweit mit vorhandenen Provider-
   Berechtigungen möglich schließen und fehlende Provider-App-Credentials klar
   als externe Voraussetzung ausweisen.
4. Pre-Live Debug-/Security-/Runtime-Gates ausführen.
5. Erst wenn diese Gates grün bzw. externe Voraussetzungen eindeutig benannt
   sind, den Stand als bereit für den Nutzer-Live-Test melden.
6. Nach dem Nutzer-Live-Test: Custom Domain; danach Werbespots und Ads für BYB.
