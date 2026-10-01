-- 주차장 데이터가 없는 지역은 "어려움(0점)"이 아니라 "점수 없음"으로 돌려준다.
--
-- 데이터가 없는 것(알 수 없음)과 세울 수 없는 것은 다르다. 현재 주차장 데이터는 강남구에만 있어서
-- 그 밖의 장소는 점수 재료가 없는데도 0점이 되어 모두 🔴로 보이는 문제가 있었다.
--
-- 규칙:
--   · 장소 반경 500m 안에 주차장 데이터가 하나라도 있으면 "데이터가 있는 지역"으로 본다.
--   · 데이터가 없는 지역이고 제보도 없으면 score = null, no_data = true
--   · 데이터가 없는 지역이지만 제보가 있으면 중립 기준(30점)에서 제보만큼 가감한다.
--     (제보 1명 '세울 수 있었음' = 45점 🟡, 2명 이상 = 60점 🟢, '단속됨' 1명 = 10점 🔴)
--   · 데이터가 있는 지역은 0004 와 같다.
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
  reports_full integer,
  no_data boolean
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
  cov as (
    select
      pts.id,
      exists (
        select 1 from parking_spots s where st_dwithin(pts.geo, s.location, 500)
      ) as covered
    from pts
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
      c.covered,
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
      + (case when c.covered then 0 else 30 end) as raw_score
    from agg a
    join cov c on c.id = a.id
    left join rep rp on rp.id = a.id
  )
  select
    sc.id,
    case
      when not sc.covered and sc.n_parkable + sc.n_enforced + sc.n_full = 0 then null
      else greatest(least(sc.raw_score, 100), 0)::integer
    end,
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
      case when sc.lots_200m >= 3 then '주변 주차장 ' || sc.lots_200m || '곳' end,
      case when not sc.covered then '주차장 데이터가 없는 지역' end
    ], null),
    sc.n_parkable::integer,
    sc.n_enforced::integer,
    sc.n_full::integer,
    (not sc.covered and sc.n_parkable + sc.n_enforced + sc.n_full = 0)
  from scored sc;
$$;
