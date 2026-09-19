-- M1.8: BYB Surface v1 — Anfragen zur Idee.
--
-- Die Control Plane bleibt die Quelle für Auftrag, Aktionen und Credits.
-- Diese Tabelle speichert nur die vom Surface-Formular aufgenommenen
-- Interessenten. Keine Schemaübernahme fremder Systeme, keine Tokens.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'byb_app') then
    raise exception 'M1.8 benötigt zuerst Migration 002 mit Rolle byb_app';
  end if;
  if to_regclass('public.steuer_auftraege') is null then
    raise exception 'M1.8 benötigt zuerst Migration 003 mit steuer_auftraege';
  end if;
end
$$;

create table if not exists surface_leads (
  id          text primary key check (length(id) between 1 and 160),
  nutzer_id   text not null check (length(nutzer_id) between 1 and 300),
  auftrag_id  text not null references steuer_auftraege (id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  email       text not null check (length(email) between 3 and 254),
  nachricht   text not null check (length(nachricht) between 1 and 2000),
  erstellt    timestamptz not null default now()
);

alter table surface_leads enable row level security;
alter table surface_leads force row level security;
drop policy if exists surface_leads_eigene on surface_leads;
create policy surface_leads_eigene on surface_leads for all to byb_app
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());

create index if not exists surface_leads_nach_auftrag
  on surface_leads (nutzer_id, auftrag_id, erstellt desc);

grant select, insert on surface_leads to byb_app;

commit;
