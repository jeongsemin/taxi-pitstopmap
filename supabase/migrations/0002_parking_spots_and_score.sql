-- 주차장 지점과 주정차 점수. 설계서 6장 참고.

create table if not exists parking_spots (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null check (type in ('public_lot', 'private_lot', 'allowed_zone', 'report')),
  location geography(Point, 4326) not null,
  address text,
  source text not null,
  source_id text not null,
  verified_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists parking_spots_location_idx
  on parking_spots using gist (location);

alter table parking_spots enable row level security;

drop policy if exists "parking spots are readable by everyone" on parking_spots;
create policy "parking spots are readable by everyone"
  on parking_spots for select using (true);

-- 점수 규칙 (1차, 사용자 제보 전):
--   공영주차장  100m 이내 +50 / 200m 이내 +30
--   민영주차장  100m 이내 +30 / 200m 이내 +15
--   200m 이내 주차장 3곳 이상 +10
--   합계 상한 100. 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만
-- 입력: [{"id": "...", "lat": 37.5, "lng": 127.0}, ...]
create or replace function score_places(points jsonb)
returns table (
  id text,
  score integer,
  nearest_lot_distance integer,
  nearest_lot_name text,
  reasons text[]
)
language sql stable
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
  scored as (
    select
      a.id,
      a.pub_min, a.priv_min, a.lots_200m, a.nearest,
      (case when a.pub_min <= 100 then 50 when a.pub_min <= 200 then 30 else 0 end)
      + (case when a.priv_min <= 100 then 30 when a.priv_min <= 200 then 15 else 0 end)
      + (case when a.lots_200m >= 3 then 10 else 0 end) as raw_score
    from agg a
  )
  select
    sc.id,
    least(sc.raw_score, 100)::integer,
    round(sc.nearest)::integer,
    (
      select s.name from parking_spots s, pts
      where pts.id = sc.id and st_dwithin(pts.geo, s.location, 200)
      order by st_distance(pts.geo, s.location) limit 1
    ),
    array_remove(array[
      case when sc.pub_min <= 200 then '공영주차장 ' || round(sc.pub_min) || 'm' end,
      case when sc.priv_min <= 200 then '민영주차장 ' || round(sc.priv_min) || 'm' end,
      case when sc.lots_200m >= 3 then '주변 주차장 ' || sc.lots_200m || '곳' end
    ], null)
  from scored sc;
$$;
