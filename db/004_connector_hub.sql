-- M1.1: persistente Connector-Referenzen und Resource Picks.
--
-- Diese Tabellen enthalten bewusst keine OAuth-Tokens, API-Keys oder
-- Refresh-Tokens. Gespeichert werden nur validierte Konto-/Ressourcenreferenzen
-- aus dem Connector-Hub-v1-Vertrag.
--
-- `byb_app` darf nur eigene Connector-Daten lesen/schreiben.
-- `byb_worker` darf die Referenzen ausschließlich lesen, um eine bereits
-- freigegebene Aktion auf genau den ausgewählten Ressourcen auszuführen.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'byb_app') then
    raise exception 'M1.1 benötigt zuerst Migration 002 mit Rolle byb_app';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'byb_worker') then
    raise exception 'M1.1 benötigt zuerst Migration 003 mit Rolle byb_worker';
  end if;
end
$$;

create table if not exists connector_verbindungen (
  nutzer_id    text not null check (length(nutzer_id) between 1 and 300),
  id           text not null check (length(id) between 1 and 120),
  version      integer not null check (version = 1),
  anbieter     text not null
               check (anbieter in (
                 'github', 'neon', 'supabase', 'vercel', 'stripe', 'higgsfield',
                 'meta_ads', 'tiktok_ads', 'youtube', 'google_search_console',
                 'google_ads', 'wix'
               )),
  konto_ref    text not null check (length(konto_ref) between 1 and 300),
  status       text not null check (status in ('verbunden', 'erneut_anmelden', 'getrennt')),
  inhalt       jsonb not null check (jsonb_typeof(inhalt) = 'object'),
  erstellt     timestamptz not null default now(),
  aktualisiert timestamptz not null default now(),
  primary key (nutzer_id, id)
);

alter table connector_verbindungen enable row level security;
alter table connector_verbindungen force row level security;
drop policy if exists connector_verbindungen_eigene on connector_verbindungen;
create policy connector_verbindungen_eigene on connector_verbindungen for all to byb_app
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());
drop policy if exists connector_verbindungen_worker on connector_verbindungen;
create policy connector_verbindungen_worker on connector_verbindungen for select to byb_worker
  using (true);

create index if not exists connector_verbindungen_nach_anbieter
  on connector_verbindungen (nutzer_id, anbieter, aktualisiert desc);

create table if not exists connector_projekt_werkzeuge (
  nutzer_id    text not null check (length(nutzer_id) between 1 and 300),
  projekt_id   text not null check (length(projekt_id) between 1 and 120),
  version      integer not null check (version = 1),
  inhalt       jsonb not null check (jsonb_typeof(inhalt) = 'object'),
  revision     bigint not null default 0 check (revision >= 0),
  erstellt     timestamptz not null default now(),
  aktualisiert timestamptz not null default now(),
  primary key (nutzer_id, projekt_id)
);

alter table connector_projekt_werkzeuge enable row level security;
alter table connector_projekt_werkzeuge force row level security;
drop policy if exists connector_projekt_werkzeuge_eigene on connector_projekt_werkzeuge;
create policy connector_projekt_werkzeuge_eigene on connector_projekt_werkzeuge for all to byb_app
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());
drop policy if exists connector_projekt_werkzeuge_worker on connector_projekt_werkzeuge;
create policy connector_projekt_werkzeuge_worker on connector_projekt_werkzeuge for select to byb_worker
  using (true);

create index if not exists connector_projekt_werkzeuge_nach_projekt
  on connector_projekt_werkzeuge (projekt_id, aktualisiert desc);

grant select, insert, update on connector_verbindungen to byb_app;
grant select, insert, update on connector_projekt_werkzeuge to byb_app;
grant select on connector_verbindungen, connector_projekt_werkzeuge to byb_worker;

commit;
