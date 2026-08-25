# CONNECTOR-CHECKLIST.md — M1.8 Herstellerquellen und Integrationsgrenzen

Ziel dieses Schritts: Alle von BYB vorgesehenen Provider gegen öffentliche
**Hersteller-Repositories** prüfen, den vorgesehenen Integrationsweg festlegen
und Community-Code nicht ungeprüft in die Lieferkette übernehmen.

Regel: Ein öffentliches Repository ist nicht automatisch ein vertrauenswürdiger
Connector. Als Upstream gilt hier nur ein Repository der jeweiligen
Hersteller-/Produktorganisation. Tokens, Refresh-Tokens und private Schlüssel
werden nicht in diesem Repo oder in den Control-Plane-Tabellen gespeichert.

## Checkliste

| Provider | Offizieller Upstream | BYB-Weg | Stand M1.8 |
|---|---|---|---|
| GitHub | `github/github-mcp-server` | eigene GitHub App + optional offizieller Remote-MCP | GitHub-App-Grundlage und Repo-Discovery im Branch |
| Neon | `neondatabase/mcp-server-neon` | Production über Neon Management API; MCP nicht als Production-Executor | bestehender Neon-API-Pfad bleibt maßgeblich |
| Supabase | `supabase/mcp` | offizieller Remote-MCP, projektbezogen und minimal gescoped | Quelle/Endpoint verifiziert; Nutzer-OAuth noch zu schließen |
| Vercel | `vercel/sdk` | offizielles SDK / REST, Projekt-Pick | Quelle verifiziert; bestehende BYB-Vercel-REST-Pfade bleiben nutzbar |
| Stripe | `stripe/stripe-node` | offizielles SDK / API, Account-Pick | Quelle verifiziert; bestehendes BYB-Billing bleibt getrennt |
| Higgsfield | `higgsfield-ai/higgsfield-js` | `@higgsfield/client` serverseitig | offizielles SDK verifiziert; Community-MCPs ausgeschlossen |
| Meta Ads | `facebook/facebook-nodejs-business-sdk` | offizielles Marketing-API-SDK | Quelle verifiziert; OAuth/Ad-Account-Discovery noch zu schließen |
| TikTok Ads | `tiktok/tiktok-business-api-sdk` | offizielle Business API v1.3 / JS SDK | OAuth- und Advertiser-Discovery-Endpunkte verifiziert |
| YouTube | `googleapis/google-api-nodejs-client` | offizieller Google API Node Client | Quelle verifiziert; Kanal-OAuth/Discovery noch zu schließen |
| Search Console | `googleapis/google-api-nodejs-client` | offizieller Google API Node Client | Quelle verifiziert; Property-OAuth/Discovery noch zu schließen |
| Google Ads | `googleads/google-ads-mcp` | offizieller MCP + Google Ads Developer Token/OAuth | Quelle und Account-Discovery verifiziert; finanzielle Writes bleiben blockiert |
| Wix | `wix/wix-mcp` | offizieller Remote-MCP | Endpoint und Site-Tools verifiziert; Wix bleibt Design-/Landingpage-Werkzeug |

## Bewusst nicht übernommen

Die GitHub-Suche liefert mehrere öffentlich sichtbare Higgsfield-MCP-Projekte,
unter anderem `geopopos/higgsfield_ai_mcp`, `Hikhakk/higgsfield-mcp-unified`,
`jfikrat/higgsfield-mcp` und `PromptEngineer48/Higgsfield-MCP`. Diese Projekte
liegen **nicht** unter der Organisation `higgsfield-ai` und werden deshalb nicht
als BYB-Upstream installiert oder vendort.

Dasselbe Prinzip gilt für YouTube, Meta und TikTok: Wenn der Hersteller keinen
eigenen MCP veröffentlicht, verwendet BYB die offizielle API bzw. das offizielle
SDK statt eines beliebigen Community-MCP.

## Sicherheits-/Produktgrenzen

- GitHub: Nutzer wählt Installation und konkrete Repositories; keine breite PAT-
  Freigabe als Produktstandard.
- Neon: Der offizielle Neon-MCP warnt selbst vor Production-Einsatz. BYB nutzt
  dort die Management API und seine eigenen Freigabe-/Resource-Pick-Grenzen.
- Supabase/Wix/Google Ads: Remote-MCP wird nur mit Nutzer- und Ressourcenscope
  eingebunden; keine globale BYB-Serviceverbindung über alle Kundenkonten.
- Stripe/Meta/TikTok/Google Ads: kauf-, budget- oder veröffentlichungswirksame
  Aktionen bleiben `finanziell`/`extern` und brauchen den vorgesehenen
  Freigaberahmen.
- Higgsfield: Mediengenerierung ist eine kostenrelevante Aktion; kein
  automatischer Generationslauf ohne Credit-/Kostenrahmen.
- Wix: kein Wix-Code wird in die BYB-Runtime kopiert; Ergebnisse dienen als
  Design-/Landingpage-Quelle und werden als eigener BYB-Code ausgeliefert.

## Vor Merge dieses M1.8-PRs

- [x] alle 12 Connector-Anbieter gegen Hersteller-Repositories recherchiert
- [x] offizielle Quellen als maschinenprüfbare Allowlist hinterlegt
- [x] Community-Higgsfield-MCPs explizit ausgeschlossen
- [ ] sichtbare App auf alle Connectoren vervollständigen
- [ ] interne Fehler dürfen nicht als 401 maskiert werden
- [ ] GitHub-App/OAuth-Foundation mit Tests und Migration 006 vollständig prüfen
- [ ] Provider-Adapter-Vertrag für Resource Discovery vereinheitlichen
- [ ] Bug-Audit des gesamten PR-Diffs durchführen und Regressionstests ergänzen
- [ ] CI, Secret-, Sprach- und relevante Neon-Gates grün
- [ ] `STATUS.md` mit verifiziertem M1.8-Stand aktualisieren
- [ ] genau einen PR öffnen und **nicht mergen**, bis der Owner ausdrücklich freigibt
