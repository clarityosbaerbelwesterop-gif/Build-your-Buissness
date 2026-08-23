# STATUS.md — Stand und offene Fragen

Stand: **M1.4 ist auf `main`; M1.5 ist in PR #17 gebaut und auf dem Code-Head `53a10f6e` grün geprüft.**

- M0.5 / PR #7: `main` (`234dbe33`)
- M0.6 / PR #8: `main` (`8776c66d`)
- M0.7 / PR #9: `main` (`c5a7336a`)
- M0.8 / PR #10: `main` (`95015e15`)
- M0.9 / PR #11: `main` (`197fc981`)
- M1.0 / PR #12: `main` (`72b25de1`)
- M1.1 / PR #13: `main` (`407a8713`)
- M1.2 / PR #14: `main` (`8bc733ce`)
- M1.3 / PR #15: `main` (`c3be3765`)
- M1.4 / PR #16: `main` (`7fac6491`)
- M1.5: Branch `m15-worker-retry-deadletter`, PR #17.

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Unternehmenssysteme und wählt die konkreten Ressourcen,
auf denen BYB arbeiten darf. Der interne Auftrag ist Ausführungs- und
Wiederaufnahme-Infrastruktur, nicht die primäre Nutzeroberfläche.

## Produktionsbasis

### Neon

- Projekt `damp-dream-67070160`, Branch `production`
- Migrationen 002–005 produktiv angewendet
- Control Plane, Connector-Persistenz, Billing-/Credit-Ledger vorhanden
- Rollen `byb_app`, `byb_worker`, `byb_billing` getrennt
- FORCE RLS auf mandantenbezogenen BYB-Tabellen
- Managed Neon Auth aktiv
- `https://build-your-buissness.vercel.app` als Trusted Origin
- E-Mail/Passwort aktiv; Google Shared OAuth vorhanden

### Stripe

Der BYB-Katalog ist vom Altbestand über `application=byb` und
`namespace=byb_preview_v1` getrennt.

- Starter: 20 EUR/Monat, 100 Credits
- Pro: 200 EUR/Monat, 750 Credits
- Scale: 250 EUR/Monat, 1.500 Credits
- Top-up: 25 EUR einmalig, 100 Credits

Produktiver BYB-Webhook:
`https://build-your-buissness.vercel.app/api/stripe-webhook`

Er verarbeitet nur die für BYB benötigten Checkout-/Invoice-/Subscription-
Ereignisse. Fremde Stripe-Produkte werden vom Billing-Pfad ignoriert.

### Vercel

- Projekt `build-your-buissness`
- ID `prj_VB7ToSJE6spWofEKZRjVyC0d6rOL`
- stabile Systemdomain `https://build-your-buissness.vercel.app`
- Production-Deploy aus M1.4-Commit `7fac6491` ist READY
- `/login.html` ist auf Production mit HTTP 200 erreichbar
- `/api/auth?aktion=token` liefert ohne Session kontrolliert HTTP 401

Custom Domain bleibt bis nach dem Nutzer-Live-Test unangetastet.

## M1.4 — First-Party Auth und Billing-Testoberfläche

PR #16 ist gemergt.

`/api/auth` ist eine Same-Origin-Grenze vor Managed Neon Auth und erlaubt nur:

- Registrierung
- Anmeldung
- Sitzung
- JWT
- Abmeldung

Die Aktionen sind fest auf Neon-Auth-Pfade und HTTP-Methoden abgebildet. Fremde
Browser-Origins werden abgelehnt. Neon-Session-Cookies werden ohne fremde
Domain und mit `Path=/api/auth` an BYB zurückgegeben.

`/login.html` bietet:

- Registrieren / Anmelden / Abmelden
- kurzlebiges JWT erneuern
- RLS-geschützten Billing-Stand lesen
- Starter-/Pro-/Scale-Checkout öffnen
- Top-up-Checkout öffnen

Die Landingpage führt ohne Session zum Login statt in einen toten Checkout.

## M1.5 — begrenzte Worker-Retries und Dead Letter

Bisher konnte ein Executor-Fehler nur bis zum Lease-Ablauf hochlaufen. Dadurch
konnte dieselbe Aktion theoretisch unbegrenzt erneut übernommen werden.

PR #17 schließt diese Lücke:

- Executor-Fehler werden abgefangen und über `entschaerfen()` für das Activity
  Log gekürzt und von bekannten Secret-Mustern bereinigt.
- Standardgrenze: drei Versuche.
- Vor Erreichen der Grenze wird die laufende Aktion atomar auf `geplant`
  zurückgesetzt, das Lease entfernt und die Wiederholung protokolliert.
- Beim ausgeschöpften Versuch werden Aktion und Auftrag terminal auf
  `fehlgeschlagen` gesetzt.
- Der terminale `fehlgeschlagen`-Zustand ist das Dead Letter des Auftrags und
  bleibt mit Versuchszahl und Fehlerbeleg sichtbar.
- Fehlerübergang, Lease-Freigabe und Activity-Log laufen in derselben
  `byb_worker`-Transaktion.

### Verifikation auf Code-Head `53a10f6e`

- CI: grün
- Lint: grün
- TypeScript: grün
- Tests: grün
- Geheimnisse: grün
- Sprache: grün
- Control-Plane-Nachweis: grün
- GitHub-Connector-Nachweis: grün

Ein vorheriger CI-Lauf war nur wegen `exactOptionalPropertyTypes` in einem neuen
Test rot. Die Testtypisierung wurde korrigiert; der nachfolgende Stand ist grün.

## Connector Hub

Persistiert sind Connection- und Resource-Picks, unter anderem für GitHub,
Neon/Supabase, Vercel, Stripe, Wix und spätere Growth-Provider. Tokens,
Refresh-Tokens und API-Keys werden nicht in der Control Plane gespeichert.

Für **öffentliche Nutzer-OAuth-Flows** fehlen weiterhin die jeweiligen
Provider-App-Credentials bzw. installierbaren Provider-Apps. Die in ChatGPT
verbundenen Konten sind keine exportierbaren Produktcredentials und werden von
BYB nicht als solche behandelt.

Der isolierte echte GitHub-Branch-Write-Proof ist vorhanden. Ein dauerhaft
laufender Produkt-Worker kann GitHub erst mit einem expliziten BYB-GitHub-
Credential ausführen.

## Noch offen vor „Ready für deinen Live-Test“

1. PR #17 final grün prüfen und mergen.
2. Reale Production-Session/JWT-Kette mit einem kurzlebigen Testnutzer prüfen;
   Testnutzer danach aus Neon Auth entfernen.
3. Billing-RLS und mindestens eine Stripe-Checkout-Session ohne Zahlung real
   öffnen; BYB-Produkte nur soweit für diesen Test erforderlich aktivieren.
4. Einen echten Control-Plane-Fehlerpfad gegen Neon nachweisen: Retry → Retry →
   terminales Dead Letter.
5. Dauerhaften Cloud-Poll für Worker nur mit vorhandenen, expliziten
   Produktcredentials aktivieren; fehlende Provider-Credentials als äußere
   Voraussetzung benennen statt sie zu erfinden.
6. Debug-/Security-/Runtime-Gates gegen die BYB-Testumgebung ausführen.
7. Erst danach den Stand als bereit für den Nutzer-Live-Test melden.

## Bewusst danach

Nach dem Nutzer-Live-Test:

1. Custom Domain
2. Search Console / Indexierung
3. Werbespots und Creatives für **BYB selbst**
4. anschließend Meta/TikTok/YouTube/Google-Ads-Betrieb für BYB

Wix bleibt Design-/Vergleichswerkzeug und ist keine Production-Abhängigkeit.
Der Import der Vercel-Seite in Wix wurde versucht, von Wix aber als ungültige
Design-URL abgelehnt; bestehende fremde Wix-Sites wurden nicht verändert.
