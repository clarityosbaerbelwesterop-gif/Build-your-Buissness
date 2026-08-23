# STATUS.md — Stand und offene Fragen

Stand: **M1.5 ist auf `main`. Der Owner-Live-Test ist nach dem realen UI-Test wieder blockiert; M1.6 baut die fehlende Produktoberfläche.**

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
- M1.5 / PR #17: `main` (`d643cca3`)
- Post-Merge-Status / PR #18: `main` (`3f3dc071`)
- M1.6: Branch `m16-product-shell-legal`

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Unternehmenssysteme und wählt die konkreten Ressourcen,
auf denen BYB arbeiten darf. Der interne Auftrag ist Ausführungs- und
Wiederaufnahme-Infrastruktur, nicht die primäre Nutzeroberfläche.

## Befund aus dem echten Owner-UI-Test

Der technische M1.5-Pre-Live-Proof war grün, aber der reale Browser-Test hat
Produktlücken sichtbar gemacht. Deshalb wird der Stand nicht mehr als
Owner-Live-Test-READY geführt.

Beobachtet:

1. E-Mail/Passwort-Login funktioniert.
2. Nach Login erschien nur die frühere Billing-/Checkout-Testfläche statt BYB.
3. Ein Nutzer ohne aktiven Tarif sah `null` als Billing-/Credit-Zustand.
4. Starter, Pro, Scale und Top-up dominierten die erste eingeloggte Ansicht.
5. Der Connector Hub war in der eingeloggten Produktoberfläche nicht sichtbar.
6. Die Landingpage zeigte Beispiel-Auftrags-ID, Zeitstempel und Statusbelege wie
   reale Aktivität, obwohl es Demo-Inhalt war.
7. Impressum, Datenschutz, AGB und EULA waren nicht sichtbar verlinkt.
8. Social Login ist noch nicht produktionsreif eingerichtet.

## M1.6 — Product Shell statt Billing-Testseite

M1.6 korrigiert die Produktoberfläche in einer kohärenten Scheibe:

- `/app.html` wird der eingeloggte BYB-Leitstand.
- Der Chathub steht wieder im Zentrum.
- Connectoren werden mit echten persistierten Zuständen aus einer geschützten
  `/api/connectors`-Leseschnittstelle angezeigt.
- Noch nicht verbundene Provider werden als nicht verbunden dargestellt; es
  werden keine ChatGPT-Connectoren als Produktcredentials ausgegeben.
- Activity Log startet ehrlich leer statt mit Demo-Aufträgen.
- Credits erscheinen als ruhiger Status im globalen Rahmen.
- Top-up bleibt aus dem Leitstand heraus und wird erst bei verbrauchtem
  bestehendem Credit-Konto in `/billing.html` angeboten.
- Nutzer ohne Tarif sehen eine verständliche Tarif-Auswahl statt `null`.
- Login leitet nach erfolgreicher Session in den Leitstand statt in Checkout.
- Öffentliche Landingpage enthält keine erfundenen Auftrag-IDs, Zeitstempel oder
  Abschlussstempel mehr.
- Impressum, Datenschutz, AGB und EULA werden auf den zentralen Oberflächen
  sichtbar verlinkt.

## Auth / Social Login

Managed Neon Auth ist aktiv. Der aktuelle Production-Auth-Stand enthält als
Social Provider nur den geteilten Google-Provider.

Aktuelle Neon-Dokumentation für Managed Better Auth unterstützt Social Login mit
Google, GitHub und Vercel. GitHub und Vercel benötigen für Produktion eigene
OAuth-App-Credentials. Apple wird von Managed Neon Auth derzeit nicht als
unterstützter Social Provider dokumentiert und wird deshalb nicht als
funktionierende BYB-Option vorgetäuscht.

Die bestehende BYB-Auth-Grenze proxyt heute E-Mail/Passwort-Sessions. Social OAuth
wird erst sichtbar freigeschaltet, wenn der unterstützte Flow mit produktiven
Provider-Credentials und BYB-Session-Verhalten nachgewiesen ist.

## Connector Hub

Persistiert sind Connection- und Resource-Picks für unter anderem GitHub,
Neon/Supabase, Vercel, Stripe, Wix und spätere Growth-Provider. Tokens,
Refresh-Tokens und API-Keys werden nicht in der Control Plane gespeichert.

M1.6 macht diese Zustände erstmals in der eingeloggten App sichtbar. Für das
öffentliche Verbinden fehlen weiterhin BYB-eigene OAuth-/Provider-Apps und die
vollständige Resource Discovery. Das ist nach M1.6 der nächste Produktblock.

## Produktionsbasis

### Neon

- Projekt `damp-dream-67070160`, Branch `production`
- Migrationen 002–005 produktiv angewendet
- Control Plane, Connector-Persistenz, Billing-/Credit-Ledger vorhanden
- Rollen `byb_app`, `byb_worker`, `byb_billing` getrennt
- FORCE RLS auf den geprüften mandantenbezogenen BYB-Tabellen
- Managed Neon Auth aktiv

### Stripe

Der BYB-Katalog ist vom Altbestand über `application=byb` und
`namespace=byb_preview_v1` getrennt.

- Starter: 20 EUR/Monat, 100 Credits
- Pro: 200 EUR/Monat, 750 Credits
- Scale: 250 EUR/Monat, 1.500 Credits
- Top-up: 25 EUR einmalig, 100 Credits

Die vier Price-IDs und Checkout-Erzeugung wurden im M1.5-Pre-Live-Proof geprüft.
Eine Zahlung wurde dabei nicht bestätigt.

### Vercel

- Projekt `build-your-buissness`
- stabile Systemdomain `https://build-your-buissness.vercel.app`
- M1.5-Production-Deploy war READY
- Custom Domain bleibt bis nach dem erneuten erfolgreichen Owner-Live-Test
  unangetastet

## Rechtliche Oberfläche

M1.6 enthält erste sichtbare Fassungen für:

- Impressum
- Datenschutzhinweise
- AGB
- EULA / Nutzungsbedingungen

Verwendete Anbieterangaben:

Bärbel Westerop / ClarityCompassAi  
Drinhausstraße 22  
47447 Moers (Kapellen)  
clarityos.baerbelwesterop@gmail.com

Nicht bekannte Register-, Steuer-, Aufsichts- oder Unternehmensform-Angaben
werden nicht erfunden. Vor öffentlichem Launch bleiben eine rechtliche Prüfung
und der Abgleich mit den dann tatsächlich aktiven Providern, Datenflüssen,
Bestell- und Kündigungsprozessen offen.

## Definition für den nächsten Owner-Live-Test

Vor einer Freigabe müssen mindestens erfüllt sein:

1. Login führt in den BYB-Leitstand.
2. Kein Demo-Auftrag wird als reale Aktivität dargestellt.
3. Connector Hub ist sichtbar und zeigt echte Zustände.
4. Billing ist Nebenfunktion; `null` wird nie roh angezeigt.
5. Top-up erscheint nur bei aufgebrauchtem bestehendem Credit-Konto.
6. Rechtliche Links sind auf Landing, Login, App und Abrechnung erreichbar.
7. Finale CI-/Secret-/Sprach-/Runtime-Gates sind grün.
8. Vercel-Preview der M1.6-Fassung ist geprüft.

## Danach vor Custom Domain

1. Unterstützten Social Login produktionsreif schließen, mindestens GitHub.
2. BYB-eigene Provider-OAuth-Apps + Resource Discovery für den Connector Hub.
3. Chathub mit der persistenten Control Plane und dem Cloud-Worker verbinden.
4. Erneuter Owner-Live-Test des vollständigen Kernflusses.
5. Rechtstexte final juristisch prüfen und an produktive Datenflüsse angleichen.

Erst nach diesem Kernfluss folgen Custom Domain, Search Console / Indexierung,
Werbespots und anschließend Ads für BYB selbst.
