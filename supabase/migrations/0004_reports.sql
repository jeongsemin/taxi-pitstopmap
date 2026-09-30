-- 사용자 제보와 프로필. 설계서 6장 참고.
-- 인증은 Supabase 익명 로그인(Authentication > Sign In / Providers > Allow anonymous sign-ins)을 사용한다.

-- 프로필: auth.users 와 1:1. 닉네임/신뢰 등급은 이후 확장용.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  trust_level integer not null default 0,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles are readable by owner" on profiles;
create policy "profiles are readable by owner"
  on profiles for select using (id = auth.uid());

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, nickname)
  values (new.id, '기사님' || substr(new.id::text, 1, 4))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 제보. place_key 는 API 가 내려주는 장소 id ("kakao-123", "db-45")와 같다.
create table if not exists reports (
  id bigint generated always as identity primary key,
  place_key text not null,
  place_name text not null,
  lat double precision not null,
  lng double precision not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_type text not null check (report_type in ('parkable', 'enforced', 'full')),
  content text,
  created_at timestamptz not null default now()
);

create index if not exists reports_place_idx on reports (place_key, created_at desc);
create index if not exists reports_user_idx on reports (user_id, created_at desc);

alter table reports enable row level security;

-- 제보자 ID 보호: 본인 제보만 조회/삭제/작성 가능. 집계는 security definer 함수가 한다.
drop policy if exists "reports are readable by owner" on reports;
create policy "reports are readable by owner"
  on reports for select using (user_id = auth.uid());

drop policy if exists "reports are insertable by owner" on reports;
create policy "reports are insertable by owner"
  on reports for insert with check (user_id = auth.uid());

drop policy if exists "reports are deletable by owner" on reports;
create policy "reports are deletable by owner"
  on reports for delete using (user_id = auth.uid());

-- 어뷰징 방지: 같은 장소 10분 안 재제보 금지, 하루 30건 제한
create or replace function limit_reports()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from reports
    where user_id = new.user_id and place_key = new.place_key
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'duplicate_report';
  end if;

  if (
    select count(*) from reports
    where user_id = new.user_id and created_at > now() - interval '1 day'
  ) >= 30 then
    raise exception 'rate_limit';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_limit on reports;
create trigger reports_limit
  before insert on reports
  for each row execute function limit_reports();

-- 점수 규칙 (2차, 사용자 제보 반영):
--   주차장:  공영 100m +50 / 200m +30, 민영 100m +30 / 200m +15, 200m 내 3곳 이상 +10
--   제보(최근 30일, 서로 다른 사용자 수 기준):
--     '세울 수 있었음' 1명 +15 / 2명 이상 +30
--     '단속됨'        1명 -20 / 2명 이상 -40
--     '자리 없음'     1명 -10 / 2명 이상 -15
--   합계는 0~100 으로 제한. 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만
-- 입력: [{"id": "kakao-1", "lat": 37.5, "lng": 127.0}, ...]
drop function if exists score_places(jsonb);

create function score_places(points jsonb)
returns table (
  id text,
  score integer,
  nearest_lot_distance integer,
  nearest_lot_name text,
  reasons text[],
  reports_parkable integer,
  reports_enforced integer,
  reports_full integer
)
language sql stable
security definer
set search_path = public
as $$
  with pts as (
    select
      p->>'id' as id,
      st_point((p->>'lng')::float8, (p->>'lat')::float8)::geography as geo
    from jsonb_array_elements(points) as p
  ),
  agg as (
    select
      pts.id,
      min(st_distance(pts.geo, s.location)) filter (where s.type = 'public_lot') as pub_min,
      min(st_distance(pts.geo, s.location)) filter (where s.type = 'private_lot') as priv_min,
      count(s.id) as lots_200m,
      min(st_distance(pts.geo, s.location)) as nearest
    from pts
    left join parking_spots s on st_dwithin(pts.geo, s.location, 200)
    group by pts.id
  ),
  rep as (
    select
      r.place_key as id,
      count(distinct r.user_id) filter (where r.report_type = 'parkable') as n_parkable,
      count(distinct r.user_id) filter (where r.report_type = 'enforced') as n_enforced,
      count(distinct r.user_id) filter (where r.report_type = 'full') as n_full
    from reports r
    where r.created_at > now() - interval '30 days'
      and r.place_key in (select id from pts)
    group by r.place_key
  ),
  scored as (
    select
      a.id,
      a.pub_min, a.priv_min, a.lots_200m, a.nearest,
      coalesce(rp.n_parkable, 0) as n_parkable,
      coalesce(rp.n_enforced, 0) as n_enforced,
      coalesce(rp.n_full, 0) as n_full,
      (case when a.pub_min <= 100 then 50 when a.pub_min <= 200 then 30 else 0 end)
      + (case when a.priv_min <= 100 then 30 when a.priv_min <= 200 then 15 else 0 end)
      + (case when a.lots_200m >= 3 then 10 else 0 end)
      + (case when coalesce(rp.n_parkable, 0) >= 2 then 30 when coalesce(rp.n_parkable, 0) = 1 then 15 else 0 end)
      - (case when coalesce(rp.n_enforced, 0) >= 2 then 40 when coalesce(rp.n_enforced, 0) = 1 then 20 else 0 end)
      - (case when coalesce(rp.n_full, 0) >= 2 then 15 when coalesce(rp.n_full, 0) = 1 then 10 else 0 end)
      as raw_score
    from agg a
    left join rep rp on rp.id = a.id
  )
  select
    sc.id,
    greatest(least(sc.raw_score, 100), 0)::integer,
    round(sc.nearest)::integer,
    (
      select s.name from parking_spots s, pts
      where pts.id = sc.id and st_dwithin(pts.geo, s.location, 200)
      order by st_distance(pts.geo, s.location) limit 1
    ),
    array_remove(array[
      case when sc.n_enforced > 0 then '단속 제보 ' || sc.n_enforced || '명' end,
      case when sc.n_parkable > 0 then '주차 가능 제보 ' || sc.n_parkable || '명' end,
      case when sc.n_full > 0 then '자리 없음 제보 ' || sc.n_full || '명' end,
      case when sc.pub_min <= 200 then '공영주차장 ' || round(sc.pub_min) || 'm' end,
      case when sc.priv_min <= 200 then '민영주차장 ' || round(sc.priv_min) || 'm' end,
      case when sc.lots_200m >= 3 then '주변 주차장 ' || sc.lots_200m || '곳' end
    ], null),
    sc.n_parkable::integer,
    sc.n_enforced::integer,
    sc.n_full::integer
  from scored sc;
$$;
