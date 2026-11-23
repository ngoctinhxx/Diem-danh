create table if not exists public.app_state (
  key text primary key,
  value jsonb not null
);

create table if not exists public.attendance (
  id uuid primary key,
  device_id text not null,
  student_key text not null,
  term text not null,
  attendance_date date not null,
  attendance_time text not null,
  record jsonb not null
);

create unique index if not exists attendance_one_per_device
  on public.attendance (device_id);

create unique index if not exists attendance_one_per_student_per_term_day
  on public.attendance (student_key, term, attendance_date);

alter table public.app_state enable row level security;
alter table public.attendance enable row level security;

grant all on public.app_state to service_role;
grant all on public.attendance to service_role;
