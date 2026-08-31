-- M1.8: kurzlebige OAuth-/Installationssitzungen des Connector Layers.
--
-- Es werden keine Provider-Tokens, Client-Secrets oder privaten Schlüssel in
-- dieser Tabelle gespeichert. `state_hash` ist ausschließlich ein SHA-256-Hash
-- des kurzlebigen Browser-State-Werts. Provider-Zugangsdaten bleiben in den
-- Runtime-Secret-Stores.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'byb_connector') then
    create role byb_connector
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
end
$$;

grant byb_connector to current_user;
grant usage on schema public, auth to byb_connector;
grant execute on function auth.nutzer_kennung() to byb_connector;

create table if not exists connector_oauth_sessions (
  state_hash               text primary key check (length(state_hash) = 64),
  nutzer_id                text not null check (length(nutzer_id) between 1 and 300),
  anbieter                 text not null
                           check (anbieter in (
                             'github', 'neon', 'supabase', 'vercel', 'stripe',
                             'higgsfield', 'meta_ads', 'tiktok_ads', 'youtube',
                             'google_search_console', 'google_ads', 'wix'
                           )),
  phase                    text not null
                           check (phase in ('gestartet', 'autorisiert')),
  erlaubte_installationen  jsonb not null default '[]'::jsonb
                           check (jsonb_typeof(erlaubte_installationen) = 'array'),
  erlaubte_ressourcen      jsonb not null default '[]'::jsonb
                           check (jsonb_typeof(erlaubte_ressourcen) = 'array'),
  laeuft_ab                timestamptz not null,
  erstellt                 timestamptz not null default now(),
  aktualisiert             timestamptz not null default now()
);

alter table connector_oauth_sessions enable row level security;
alter table connector_oauth_sessions force row level security;

drop policy if exists connector_oauth_sessions_eigene on connector_oauth_sessions;
create policy connector_oauth_sessions_eigene on connector_oauth_sessions
  for all to byb_connector
  using (
    nutzer_id = auth.nutzer_kennung()
    and laeuft_ab > now()
  )
  with check (
    nutzer_id = auth.nutzer_kennung()
    and laeuft_ab > now()
  );

create index if not exists connector_oauth_sessions_nutzer_ablauf
  on connector_oauth_sessions (nutzer_id, laeuft_ab);

revoke all on connector_oauth_sessions from public;
revoke all on connector_oauth_sessions from byb_app;
revoke all on connector_oauth_sessions from byb_worker;
grant select, insert, update, delete on connector_oauth_sessions to byb_connector;

commit;
