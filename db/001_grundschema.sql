-- BYB Grundschema.
--
-- Vier Tabellen: was ein Nutzer beauftragt hat, was dabei herauskam, und die
-- Befunde darin. Das Prüfprotokoll ist das Produkt (CLAUDE.md §1) — es muss
-- also haltbar liegen, nicht nur im Arbeitsspeicher eines Laufs entstehen.
--
-- Handgeschrieben und geprüft, wie CLAUDE.md §2.5 es verlangt. Kein Werkzeug
-- erzeugt diese Datei; ein erzeugtes Schema, das niemand liest, ist genau die
-- Sorte Migration, in der eine fehlende Policy übersehen wird.
--
-- ============================================================================
-- Die Absicherung, und warum sie so aussieht
-- ============================================================================
--
-- Jede Tabelle mit Mandantenbezug bekommt drei Zeilen, nicht eine:
--
--   1. ENABLE ROW LEVEL SECURITY  — schaltet die Prüfung ein.
--   2. FORCE  ROW LEVEL SECURITY  — lässt sie auch für den Eigentümer gelten.
--   3. CREATE POLICY              — sagt, wer welche Zeilen sehen darf.
--
-- ENABLE allein genügt nicht: der Eigentümer einer Tabelle umgeht seine
-- eigenen Regeln, solange FORCE fehlt — und eine Anwendung meldet sich fast
-- immer als Eigentümer an. Ohne die zweite Zeile liefert sie fremde Zeilen
-- aus, und niemand merkt es, weil die erste Zeile dasteht.
--
-- Die Policy prüft `USING` **und** `WITH CHECK`. Ohne `WITH CHECK` könnte
-- jemand Zeilen auf eine fremde Kennung schreiben, auch wenn er sie nicht
-- lesen kann.
--
-- Woher die Kennung kommt: aus dem JWT der Anwendung, über
-- `auth.nutzer_kennung()`. Die Funktion steht unten und ist die **einzige**
-- Stelle, an der das Format des Tokens interpretiert wird. Verstreut man das
-- über die Policies, ändert man beim nächsten Auth-Wechsel zwanzig Stellen und
-- vergisst eine.

begin;

-- ============================================================================
-- Auth
-- ============================================================================
--
-- Neon Auth legt `neon_auth.users_sync` selbst an und hält es synchron. Wir
-- legen dort nichts an und ändern dort nichts — eine Tabelle, die ein anderer
-- Dienst pflegt, ist für uns nur lesbar.
--
-- `auth.nutzer_kennung()` liest die Kennung aus dem JWT. `stable` statt
-- `volatile`, damit der Planer sie je Anfrage einmal auswertet statt je Zeile;
-- bei einer Policy auf einer großen Tabelle ist das der Unterschied zwischen
-- einer Anfrage und einer Wartezeit.

create schema if not exists auth;

create or replace function auth.nutzer_kennung()
returns text
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json ->> 'sub',
    ''
  );
$$;

comment on function auth.nutzer_kennung() is
  'Kennung des angemeldeten Nutzers aus dem JWT. Die einzige Stelle, an der '
  'das Tokenformat interpretiert wird — Policies rufen nur diese Funktion.';

-- ============================================================================
-- Läufe
-- ============================================================================

create table if not exists laeufe (
  id            uuid primary key default gen_random_uuid(),
  nutzer_id     text not null,
  beschreibung  text not null,
  zustand       text not null default 'geplant'
                check (zustand in ('geplant', 'baut', 'prueft', 'fertig', 'abgebrochen')),
  begonnen      timestamptz not null default now(),
  beendet       timestamptz
);

-- Ein Nutzer sieht seine Läufe, sonst niemand.
alter table laeufe enable row level security;
alter table laeufe force  row level security;

create policy laeufe_eigene on laeufe for all
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());

create index if not exists laeufe_nach_nutzer on laeufe (nutzer_id, begonnen desc);

-- ============================================================================
-- Prüfprotokolle
-- ============================================================================
--
-- Ein Protokoll je Lauf. `version` ist Pflicht und wird mitgespeichert: ein
-- gespeichertes Protokoll ohne Versionsangabe lässt sich nach der ersten
-- Schemaänderung nicht mehr zuverlässig lesen (siehe protocol/v1.ts).
--
-- `nutzer_id` steht auch hier, obwohl sie über `lauf_id` erreichbar wäre. Eine
-- Policy, die für jede Zeile einen Join macht, ist langsam — und schlimmer:
-- sie ist schwerer zu lesen, und eine Absicherung, die man nicht auf einen
-- Blick versteht, wird beim nächsten Umbau falsch geändert.

create table if not exists protokolle (
  id               uuid primary key default gen_random_uuid(),
  lauf_id          uuid not null references laeufe (id) on delete cascade,
  nutzer_id        text not null,
  version          integer not null,
  endzustand       text not null check (endzustand in ('sauber', 'offene_punkte')),
  abbruchgrund     text not null
                   check (abbruchgrund in ('keine_offenen_befunde', 'rundenlimit', 'kostendeckel')),
  gelaufene_klassen text[] not null default '{}',
  tokens_ein       integer not null default 0,
  tokens_aus       integer not null default 0,
  laufzeit_ms      integer not null default 0,
  erstellt         timestamptz not null default now()
);

alter table protokolle enable row level security;
alter table protokolle force  row level security;

create policy protokolle_eigene on protokolle for all
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());

create index if not exists protokolle_nach_lauf on protokolle (lauf_id);

-- ============================================================================
-- Befunde
-- ============================================================================
--
-- Die Zustände und Schweregrade sind dieselben wie in protocol/v1.ts. Sie hier
-- als CHECK zu wiederholen ist Absicht: die Datenbank ist die letzte Stelle,
-- an der ein falscher Wert noch auffällt, und ein Protokoll mit einem Zustand,
-- den die Anzeige nicht kennt, ist unbrauchbar.

create table if not exists befunde (
  id              uuid primary key default gen_random_uuid(),
  protokoll_id    uuid not null references protokolle (id) on delete cascade,
  nutzer_id       text not null,
  kategorie       text not null
                  check (kategorie in ('zugangsdaten', 'datenzugriff', 'authentifizierung')),
  angriffsklasse  text not null,
  schweregrad     text not null
                  check (schweregrad in ('kritisch', 'hoch', 'mittel', 'niedrig')),
  klartext        text not null check (length(klartext) between 20 and 400),
  nachweis        text not null check (length(nachweis) > 0),
  zustand         text not null
                  check (zustand in ('gefunden', 'fix_versucht', 'behoben', 'offen', 'wieder_aufgetreten')),
  runde           integer not null check (runde >= 1),
  erstellt        timestamptz not null default now()
);

alter table befunde enable row level security;
alter table befunde force  row level security;

create policy befunde_eigene on befunde for all
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());

create index if not exists befunde_nach_protokoll on befunde (protokoll_id);

-- ============================================================================
-- Runden
-- ============================================================================

create table if not exists runden (
  id               uuid primary key default gen_random_uuid(),
  protokoll_id     uuid not null references protokolle (id) on delete cascade,
  nutzer_id        text not null,
  nummer           integer not null check (nummer >= 1),
  gelaufene_klassen text[] not null default '{}',
  tokens_ein       integer not null default 0,
  tokens_aus       integer not null default 0,
  laufzeit_ms      integer not null default 0,
  unique (protokoll_id, nummer)
);

alter table runden enable row level security;
alter table runden force  row level security;

create policy runden_eigene on runden for all
  using      (nutzer_id = auth.nutzer_kennung())
  with check (nutzer_id = auth.nutzer_kennung());

commit;
