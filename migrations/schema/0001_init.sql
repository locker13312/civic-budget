-- схема з ER у spec.md; власник кожної таблиці — модуль у коментарі (R3)

-- identity
create table users (
  id            integer generated always as identity primary key,
  full_name     text not null check (length(trim(full_name)) > 0),
  role          text not null check (role in ('resident', 'moderator', 'admin')),
  tax_id_hash   text not null unique,
  verified_at   timestamptz
);

-- cycles
create table cycles (
  id               integer generated always as identity primary key,
  title            text not null check (length(trim(title)) > 0),
  submission_from  timestamptz not null,
  submission_to    timestamptz not null,
  voting_from      timestamptz not null,
  voting_to        timestamptz not null,
  max_votes        integer not null check (max_votes >= 1),
  min_votes        integer not null check (min_votes >= 0),
  check (submission_from < submission_to
     and submission_to < voting_from
     and voting_from < voting_to)
);

create table category_limits (
  cycle_id  integer not null references cycles (id),
  category  text not null check (category in ('small', 'large')),
  budget    bigint not null check (budget > 0),
  max_cost  bigint not null check (max_cost > 0),
  primary key (cycle_id, category),
  check (max_cost <= budget)
);

-- projects
create table projects (
  id               integer generated always as identity primary key,
  cycle_id         integer not null,
  author_id        integer not null references users (id),
  category         text not null,
  title            text not null check (length(trim(title)) > 0),
  cost             bigint not null check (cost > 0),
  status           text not null check (status in ('submitted', 'approved', 'rejected')),
  submitted_at     timestamptz not null,
  idempotency_key  text,
  request_hash     text,
  foreign key (cycle_id, category) references category_limits (cycle_id, category),
  unique (author_id, idempotency_key)
);
create index projects_cycle_idx on projects (cycle_id);

create table reviews (
  id            integer generated always as identity primary key,
  project_id    integer not null unique references projects (id),
  moderator_id  integer not null references users (id),
  decision      text not null check (decision in ('approve', 'reject')),
  reason        text not null default '',
  decided_at    timestamptz not null,
  check (decision = 'approve' or length(trim(reason)) > 0)
);

-- voting
create table votes (
  voter_id    integer not null references users (id),
  project_id  integer not null references projects (id),
  cycle_id    integer not null references cycles (id),
  cast_at     timestamptz not null,
  primary key (voter_id, project_id)
);
create index votes_voter_cycle_idx on votes (voter_id, cycle_id);
create index votes_cycle_idx on votes (cycle_id, project_id);

-- results
create table outcomes (
  project_id  integer primary key references projects (id),
  cycle_id    integer not null references cycles (id),
  votes       integer not null check (votes >= 0),
  rank        integer not null check (rank >= 1),
  funded      boolean not null,
  decided_at  timestamptz not null
);
create index outcomes_cycle_idx on outcomes (cycle_id, rank);

create table progress_reports (
  id               integer generated always as identity primary key,
  project_id       integer not null references outcomes (project_id),
  reporter_id      integer not null references users (id),
  spent            bigint not null check (spent > 0),
  note             text not null default '',
  reported_at      timestamptz not null,
  idempotency_key  text,
  request_hash     text,
  unique (reporter_id, idempotency_key)
);
create index progress_project_idx on progress_reports (project_id);
