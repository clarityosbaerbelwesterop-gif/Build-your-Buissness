-- M1.2: Stripe-Billing + BYB-Credit-Ledger.
--
-- Stripe-Webhook-Payloads oder Secrets werden nicht gespeichert. Persistiert werden
-- ausschließlich stabile IDs, normalisierte Zustände und buchhalterische Credit-
-- Bewegungen. `byb_billing` ist NOLOGIN/NOBYPASSRLS und darf nur diese Billing-
-- Tabellen verändern. Nutzer lesen ausschließlich ihren eigenen Billing-Stand.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'byb_app') then
    raise exception 'M1.2 benötigt zuerst Migration 002 mit Rolle byb_app';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'byb_worker') then
    raise exception 'M1.2 benötigt zuerst Migration 003 mit Rolle byb_worker';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'byb_billing') then
    create role byb_billing
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
end
$$;

grant byb_billing to current_user;
grant usage on schema public, auth to byb_billing;
grant execute on function auth.nutzer_kennung() to byb_billing;

create table if not exists billing_konten (
  nutzer_id          text primary key check (length(nutzer_id) between 1 and 300),
  stripe_customer_id text unique check (stripe_customer_id is null or length(stripe_customer_id) between 1 and 120),
  erstellt           timestamptz not null default now(),
  aktualisiert       timestamptz not null default now()
);

alter table billing_konten enable row level security;
alter table billing_konten force row level security;
drop policy if exists billing_konten_eigene on billing_konten;
create policy billing_konten_eigene on billing_konten for select to byb_app
  using (nutzer_id = auth.nutzer_kennung());
drop policy if exists billing_konten_billing on billing_konten;
create policy billing_konten_billing on billing_konten for all to byb_billing
  using (true) with check (true);

create table if not exists billing_abos (
  nutzer_id               text primary key references billing_konten (nutzer_id) on delete cascade,
  stripe_subscription_id  text unique check (stripe_subscription_id is null or length(stripe_subscription_id) between 1 and 120),
  stripe_price_id         text check (stripe_price_id is null or length(stripe_price_id) between 1 and 120),
  plan_key                text check (plan_key is null or plan_key in ('starter', 'pro', 'scale')),
  monatliche_credits      integer not null default 0 check (monatliche_credits >= 0),
  status                  text not null default 'inaktiv'
                          check (status in ('inaktiv', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused')),
  periode_start           timestamptz,
  periode_ende            timestamptz,
  aktualisiert            timestamptz not null default now()
);

alter table billing_abos enable row level security;
alter table billing_abos force row level security;
drop policy if exists billing_abos_eigene on billing_abos;
create policy billing_abos_eigene on billing_abos for select to byb_app
  using (nutzer_id = auth.nutzer_kennung());
drop policy if exists billing_abos_billing on billing_abos;
create policy billing_abos_billing on billing_abos for all to byb_billing
  using (true) with check (true);

create table if not exists credit_konten (
  nutzer_id    text primary key references billing_konten (nutzer_id) on delete cascade,
  saldo        integer not null default 0 check (saldo >= 0),
  reserviert   integer not null default 0 check (reserviert >= 0 and reserviert <= saldo),
  revision     bigint not null default 0 check (revision >= 0),
  aktualisiert timestamptz not null default now()
);

alter table credit_konten enable row level security;
alter table credit_konten force row level security;
drop policy if exists credit_konten_eigene on credit_konten;
create policy credit_konten_eigene on credit_konten for select to byb_app
  using (nutzer_id = auth.nutzer_kennung());
drop policy if exists credit_konten_billing on credit_konten;
create policy credit_konten_billing on credit_konten for all to byb_billing
  using (true) with check (true);
drop policy if exists credit_konten_worker on credit_konten;
create policy credit_konten_worker on credit_konten for select to byb_worker
  using (true);

create table if not exists credit_buchungen (
  id               text primary key check (length(id) between 1 and 180),
  nutzer_id        text not null references credit_konten (nutzer_id) on delete cascade,
  credits_delta    integer not null check (credits_delta <> 0),
  grund            text not null check (grund in ('abo_monat', 'topup', 'verbrauch', 'erstattung', 'korrektur')),
  stripe_event_id  text unique check (stripe_event_id is null or length(stripe_event_id) between 1 and 180),
  referenz         text check (referenz is null or length(referenz) between 1 and 240),
  erstellt         timestamptz not null default now()
);

alter table credit_buchungen enable row level security;
alter table credit_buchungen force row level security;
drop policy if exists credit_buchungen_eigene on credit_buchungen;
create policy credit_buchungen_eigene on credit_buchungen for select to byb_app
  using (nutzer_id = auth.nutzer_kennung());
drop policy if exists credit_buchungen_billing on credit_buchungen;
create policy credit_buchungen_billing on credit_buchungen for all to byb_billing
  using (true) with check (true);

create index if not exists credit_buchungen_nach_nutzer
  on credit_buchungen (nutzer_id, erstellt desc);

create table if not exists stripe_webhook_ereignisse (
  stripe_event_id text primary key check (length(stripe_event_id) between 1 and 180),
  typ             text not null check (length(typ) between 1 and 180),
  objekt_id       text check (objekt_id is null or length(objekt_id) between 1 and 180),
  zustand         text not null check (zustand in ('empfangen', 'verarbeitet', 'ignoriert', 'fehlgeschlagen')),
  fehler_code     text check (fehler_code is null or length(fehler_code) between 1 and 120),
  erstellt        timestamptz not null default now(),
  verarbeitet     timestamptz
);

alter table stripe_webhook_ereignisse enable row level security;
alter table stripe_webhook_ereignisse force row level security;
drop policy if exists stripe_webhook_ereignisse_billing on stripe_webhook_ereignisse;
create policy stripe_webhook_ereignisse_billing on stripe_webhook_ereignisse for all to byb_billing
  using (true) with check (true);

-- Der Nutzer sieht keine globalen Webhook-Event-IDs. Das vermeidet unnötige
-- Mandanten-Metadaten-Leaks. `byb_worker` bekommt nur die Leserechte, die er für
-- Credit-Grenzen benötigt.
grant select on billing_konten, billing_abos, credit_konten, credit_buchungen to byb_app;
grant select on billing_abos, credit_konten to byb_worker;
grant select, insert, update on billing_konten, billing_abos, credit_konten to byb_billing;
grant select, insert on credit_buchungen to byb_billing;
grant select, insert, update on stripe_webhook_ereignisse to byb_billing;

commit;
