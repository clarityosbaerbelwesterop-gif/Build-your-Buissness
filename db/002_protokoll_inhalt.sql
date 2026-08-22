-- M0.6: kanonisches Protokoll v1 und engere Laufzeitrolle.
--
-- `protokolle.inhalt` ist die verlustfreie Fassung des versionierten
-- Datenvertrags. Die vorhandenen Tabellen bleiben die relationale Projektion
-- für Suche/Auswertung. Gelesen wird das kanonische JSON und danach erneut mit
-- `protocol/v1.ts` validiert.
--
-- `byb_app` ist NOLOGIN und darf RLS nicht umgehen. Der Backend-Prozess kann
-- sich weiterhin mit der Neon-Verwaltungsrolle verbinden, muss innerhalb jeder
-- Transaktion aber auf `byb_app` wechseln.

begin;

alter table protokolle
  add column if not exists inhalt jsonb;

-- Vorhandene Protokolle lassen sich aus dem alten Schema nicht verlustfrei
-- zurückrechnen: pro Runde fehlen dort die Befund-Snapshots. Lieber abbrechen
-- als Daten zu erfinden. Zum Zeitpunkt dieser Migration ist Produktion leer;
-- der Nachweis prüft diese Voraussetzung zusätzlich vor dem späteren Anwenden.
do $$
begin
  if exists (select 1 from protokolle where inhalt is null) then
    raise exception
      'M0.6 kann vorhandene Protokolle ohne kanonischen Inhalt nicht automatisch migrieren';
  end if;
end
$$;

alter table protokolle
  alter column inhalt set not null;

alter table protokolle
  drop constraint if exists protokolle_inhalt_objekt;
alter table protokolle
  add constraint protokolle_inhalt_objekt
  check (jsonb_typeof(inhalt) = 'object') not valid;
alter table protokolle
  validate constraint protokolle_inhalt_objekt;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'byb_app') then
    create role byb_app
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
end
$$;

grant byb_app to current_user;
grant usage on schema public, auth to byb_app;
grant execute on function auth.nutzer_kennung() to byb_app;
grant select, insert, update, delete
  on laeufe, protokolle, befunde, runden
  to byb_app;

commit;
