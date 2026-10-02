-- 점수 가중치 조정 (서울 전역 주차장 데이터 적재 후).
--
-- 서울 전역 데이터로 12개 지역의 식당 약 2,800곳을 대조해 보니 기존 규칙은 구분력이 부족했다.
--   · 민영주차장은 거의 모든 장소 100m 안(87%)에 있어서 "민영 100m 이내 +30"이 사실상 기본 점수였다.
--   · 그 결과 🔴가 4%뿐이었고, 공영주차장이 있으면 곧바로 🟢가 되었다.
-- 조정:
--   · 민영주차장 가점을 줄인다: 100m +30 -> +20, 200m +15 -> +10
--   · 주변 주차장 수는 구간으로 나눈다: 3곳 이상 +5, 10곳 이상 +10 (기존 3곳 이상 +10)
--   · 공영주차장 가점은 그대로 (택시가 잠깐 세우기에 가장 믿을 만한 신호): 100m +50, 200m +30
--   · 이름에 '거주자'가 들어간 주차장(거주자우선·전용)은 외부 차량이 쓸 수 없어 점수에서 뺀다.
--   · 제보 가감과 데이터 없는 지역 처리(0005)는 그대로.
-- 같은 12개 지역 기준 분포: 🟢 42% / 🟡 53% / 🔴 4%  ->  🟢 36% / 🟡 40% / 🔴 24%
-- 가중치는 여전히 가정값이다. 실제 기사 피드백으로 검증되지 않았다.
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
    left join parking_spots s
      on st_dwithin(pts.geo, s.location, 200) and s.name not like '%거주자%'
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
      + (case when a.priv_min <= 100 then 20 when a.priv_min <= 200 then 10 else 0 end)
      + (case when a.lots_200m >= 10 then 10 when a.lots_200m >= 3 then 5 else 0 end)
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
        and s.name not like '%거주자%'
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
