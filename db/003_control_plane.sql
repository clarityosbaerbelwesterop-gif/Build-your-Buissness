-- M0.9: persistente BYB-Control-Plane mit eng begrenzter Worker-Rolle.
--
-- `steuer_auftraege.inhalt` ist die kanonische Fassung des Control-Plane-v1-
-- Vertrags. `steuer_aktionen` ist die relationale Projektion für Scheduling,
-- Freigaben und Leases; `steuer_ereignisse` ist das append-only Activity-Log.
--
-- `byb_app` bleibt der Nutzerpfad und sieht dank RLS nur eigene Zeilen.
-- `byb_worker` ist NOLOGIN/NOBYPASSRLS und bekommt ausschließlich auf diesen
-- drei Control-Plane-Tabellen eine explizite RLS-Policy über alle Mandanten.
-- Dadurch kann ein Hintergrundworker Arbeit finden, ohne pauschalen Zugriff
-- auf Protokolle, Auth-Tabellen oder Connector-Secrets zu erhalten.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'byb_app') then
    raise exception 'M0.9 benötigt zuerst Migration 002 mit Rolle byb_app';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'byb_worker') then
    create role byb_worker
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
end
$$;

grant byb_worker to current_user;

create table if not exists steuer_auftraege (
  id                 text primary key check (length(id) between 1 and 120),
  nutzer_id          text not null check (length(nutzer_id) between 1 and 300),
  projekt_id         text not null check (length(projekt_id) between 1 and 120),
  version            integer not null check (version = 1),
  zustand            text not null
                     check (zustand in (
                       'entwurf', 'plan_bereit', 'laeuft', 'wartet_freigabe',
                       'pausiert', 'abgeschlossen', 'fehlgeschlagen'
                     )),
  credit_deckel      integer not null check (credit_deckel >= 0),
  credits_verbraucht integer not null check (credits_verbraucht >= 0),
  inhalt             jsonb not null check (jsonb_typeof(inhalt) = 'object'),
  revision           bigint not null default 0 check (revision >= 0),
  erstellt           timestamptz not null default now(),
  aktualisiert       timestamptz not null default now()
);

alter table steuer_auftraege enable row level security;
alter table steuer_auftraege force row level security;
drop policy if exists steuer_auftraege_eigene on steuer_auftraege;
create policy steuer_auftraege_eigene on steuer_auftraege for all to byb_app
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());
drop policy if exists steuer_auftraege_worker on steuer_auftraege;
create policy steuer_auftraege_worker on steuer_auftraege for all to byb_worker
  using (true) with check (true);

create index if not exists steuer_auftraege_nach_nutzer
  on steuer_auftraege (nutzer_id, aktualisiert desc);
create index if not exists steuer_auftraege_queue
  on steuer_auftraege (zustand, aktualisiert asc)
  where zustand in ('plan_bereit', 'laeuft');

create table if not exists steuer_aktionen (
  auftrag_id          text not null references steuer_auftraege (id) on delete cascade,
  aktion_id           text not null check (length(aktion_id) between 1 and 120),
  nutzer_id           text not null check (length(nutzer_id) between 1 and 300),
  typ                 text not null
                      check (typ in (
                        'planen', 'repo', 'code', 'backend', 'auth', 'payments',
                        'test', 'sandbox', 'security', 'fix', 'deploy', 'domain',
                        'indexierung', 'werbemittel', 'ads', 'monitoring'
                      )),
  zustand             text not null
                      check (zustand in (
                        'geplant', 'laeuft', 'erfolgreich', 'fehlgeschlagen',
                        'uebersprungen'
                      )),
  freigabe_klasse     text not null
                      check (freigabe_klasse in ('intern', 'extern', 'finanziell')),
  freigabe_status     text not null
                      check (freigabe_status in (
                        'nicht_erforderlich', 'offen', 'erteilt', 'widerrufen'
                      )),
  credits_geschaetzt  integer not null check (credits_geschaetzt >= 0),
  credits_verbraucht  integer not null check (credits_verbraucht >= 0),
  inhalt              jsonb not null check (jsonb_typeof(inhalt) = 'object'),
  lease_token         uuid,
  lease_bis           timestamptz,
  lease_owner         text check (lease_owner is null or length(lease_owner) between 1 and 200),
  versuche            integer not null default 0 check (versuche >= 0),
  aktualisiert        timestamptz not null default now(),
  primary key (auftrag_id, aktion_id),
  check (
    (lease_token is null and lease_bis is null and lease_owner is null)
    or
    (lease_token is not null and lease_bis is not null and lease_owner is not null)
  )
);

alter table steuer_aktionen enable row level security;
alter table steuer_aktionen force row level security;
drop policy if exists steuer_aktionen_eigene on steuer_aktionen;
create policy steuer_aktionen_eigene on steuer_aktionen for all to byb_app
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());
drop policy if exists steuer_aktionen_worker on steuer_aktionen;
create policy steuer_aktionen_worker on steuer_aktionen for all to byb_worker
  using (true) with check (true);

create index if not exists steuer_aktionen_queue
  on steuer_aktionen (zustand, lease_bis, aktualisiert asc);

create table if not exists steuer_ereignisse (
  auftrag_id    text not null references steuer_auftraege (id) on delete cascade,
  ereignis_id   text not null check (length(ereignis_id) between 1 and 160),
  nutzer_id     text not null check (length(nutzer_id) between 1 and 300),
  typ           text not null,
  aktion_id     text,
  zeitstempel   bigint not null check (zeitstempel >= 0),
  inhalt        jsonb not null check (jsonb_typeof(inhalt) = 'object'),
  erstellt      timestamptz not null default now(),
  primary key (auftrag_id, ereignis_id)
);

alter table steuer_ereignisse enable row level security;
alter table steuer_ereignisse force row level security;
drop policy if exists steuer_ereignisse_eigene on steuer_ereignisse;
create policy steuer_ereignisse_eigene on steuer_ereignisse for all to byb_app
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());
drop policy if exists steuer_ereignisse_worker on steuer_ereignisse;
create policy steuer_ereignisse_worker on steuer_ereignisse for all to byb_worker
  using (true) with check (true);

create index if not exists steuer_ereignisse_nach_auftrag
  on steuer_ereignisse (auftrag_id, zeitstempel asc);

grant select, insert, update on steuer_auftraege, steuer_aktionen to byb_app;
grant select, insert on steuer_ereignisse to byb_app;

grant select, update on steuer_auftraege to byb_worker;
grant select, insert, update on steuer_aktionen to byb_worker;
grant select, insert on steuer_ereignisse to byb_worker;

commit;
