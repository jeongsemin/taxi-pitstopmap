-- 주정차 단속 카메라(고정형 CCTV) 위치를 도로변 주차 판단에 연결한다.
--
-- 데이터: 서울시 불법주정차/전용차로 위반 단속 CCTV 위치정보 (서울 열린데이터광장 OA-20471,
-- 서울시·25개 자치구 고정형 CCTV 약 4,700곳, 공공누리 1유형 출처표시). 분기마다 갱신된다.
-- 적재: python data/scripts/load_enforcement_cameras.py
--
-- 쓰는 방법: 장소 60m 안에 단속 카메라가 있으면 화면에 "근처에 단속 카메라가 있어요"를 보여 준다.
-- 점수는 바꾸지 않는다. 카메라는 이동식 단속과 달리 일부 지점(어린이보호구역 등)에만 있어서
-- "카메라가 없다 = 세워도 된다"가 아니고, 점수에 넣으면 건물 주차장이 있는 곳까지 깎이기 때문이다.
-- 0008 에서 하위 호환으로 남겨 둔 reports_parkable 도 새 화면이 배포됐으므로 이 함수에서 뺀다.

create table if not exists enforcement_cameras (
  id bigint generated always as identity primary key,
  location geography(Point, 4326) not null,
  address text,
  district text,
  point_name text,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists enforcement_cameras_location_idx
  on enforcement_cameras using gist (location);

-- 앱은 score_places() 를 통해서만 읽는다 (RLS 켜고 정책은 두지 않는다)
alter table enforcement_cameras enable row level security;

drop function if exists score_places(jsonb);

create function score_places(points jsonb)
returns table (
  id text,
  score integer,
  nearest_lot_distance integer,
  nearest_lot_name text,
  reasons text[],
  store_parking text,
  store_parking_name text,
  roadside_distance integer,
  roadside_name text,
  reports_store integer,
  reports_roadside integer,
  reports_enforced integer,
  reports_full integer,
  no_data boolean,
  camera_distance integer,
  camera_name text
)
language sql stable
security definer
set search_path = public
as $$
  with pts as (
    select
      p->>'id' as id,
      st_point((p->>'lng')::float8, (p->>'lat')::float8)::geography as geo,
      norm_name(p->>'name') as nm,
      addr_tail(p->>'address') as ad
    from jsonb_array_elements(points) as p
  ),
  -- 거주자우선·전용 주차장은 외부 차량이 쓸 수 없어 뺀다
  near as (
    select
      p.id, p.nm, p.ad,
      s.name as sname, s.type as stype, s.address as saddr,
      st_distance(p.geo, s.location) as d,
      norm_name(s.name) as snm
    from pts p
    left join parking_spots s
      on st_dwithin(p.geo, s.location, 200) and s.name not like '%거주자%'
  ),
  agg as (
    select
      n.id,
      min(n.d) filter (where n.stype = 'public_lot' and n.sname not like '%노상%') as pub_min,
      min(n.d) filter (where n.stype = 'private_lot' and n.sname not like '%노상%') as priv_min,
      min(n.d) filter (where n.sname like '%노상%') as road_min,
      (array_agg(n.sname order by n.d) filter (where n.sname like '%노상%'))[1] as road_name,
      count(n.sname) as lots_200m,
      min(n.d) as nearest,
      -- 가게 이름과 이름이 겹치는 민영주차장 (150m 이내, 너무 짧은 이름은 제외)
      bool_or(
        n.stype = 'private_lot' and n.sname not like '%노상%' and n.d <= 150
        and length(n.snm) >= 3 and n.nm <> ''
        and (position(n.snm in n.nm) > 0 or (length(n.nm) >= 3 and position(n.nm in n.snm) > 0))
      ) as name_match,
      (array_agg(n.sname order by n.d) filter (
        where n.stype = 'private_lot' and n.sname not like '%노상%' and n.d <= 150
          and length(n.snm) >= 3 and n.nm <> ''
          and (position(n.snm in n.nm) > 0 or (length(n.nm) >= 3 and position(n.nm in n.snm) > 0))
      ))[1] as match_name,
      -- 같은 건물(주소 끝이 같음)이거나 바로 옆(30m)의 민영주차장
      bool_or(
        n.stype = 'private_lot' and n.sname not like '%노상%'
        and ((n.ad <> '' and addr_tail(n.saddr) = n.ad) or n.d <= 30)
      ) as building,
      (array_agg(n.sname order by n.d) filter (
        where n.stype = 'private_lot' and n.sname not like '%노상%'
          and ((n.ad <> '' and addr_tail(n.saddr) = n.ad) or n.d <= 30)
      ))[1] as building_name
    from near n
    group by n.id
  ),
  cov as (
    select
      pts.id,
      exists (
        select 1 from parking_spots s where st_dwithin(pts.geo, s.location, 500)
      ) as covered
    from pts
  ),
  -- 60m 안의 단속 카메라 (가장 가까운 것)
  cam as (
    select
      p.id,
      min(st_distance(p.geo, c.location)) as cam_min,
      (array_agg(c.point_name order by st_distance(p.geo, c.location)))[1] as cam_name
    from pts p
    join enforcement_cameras c on st_dwithin(p.geo, c.location, 60)
    group by p.id
  ),
  rep as (
    select
      r.place_key as id,
      count(distinct r.user_id) filter (where r.report_type = 'store_parking') as n_store,
      count(distinct r.user_id) filter (where r.report_type in ('roadside_ok', 'parkable')) as n_road,
      count(distinct r.user_id) filter (where r.report_type = 'enforced') as n_enforced,
      count(distinct r.user_id) filter (where r.report_type = 'full') as n_full
    from reports r
    where r.created_at > now() - interval '30 days'
      and r.place_key in (select id from pts)
    group by r.place_key
  ),
  scored as (
    select
      a.id, c.covered, cm.cam_min, cm.cam_name,
      a.pub_min, a.priv_min, a.road_min, a.road_name, a.lots_200m, a.nearest,
      a.name_match, a.match_name, a.building, a.building_name,
      coalesce(rp.n_store, 0) as n_store,
      coalesce(rp.n_road, 0) as n_road,
      coalesce(rp.n_enforced, 0) as n_enforced,
      coalesce(rp.n_full, 0) as n_full,
      -- 가게 주차 (가장 강한 근거 하나)
      (case
        when coalesce(rp.n_store, 0) >= 2 then 60
        when coalesce(rp.n_store, 0) = 1 then 50
        when a.name_match then 40
        when a.building then 30
        else 0 end) as own_score,
      -- 도로변 (노상주차장 + 제보, 최대 45)
      least(
        (case when a.road_min <= 100 then 30 else 0 end)
        + (case when coalesce(rp.n_road, 0) >= 2 then 30 when coalesce(rp.n_road, 0) = 1 then 15 else 0 end),
        45) as road_score,
      -- 보조 (공영주차장은 택시가 잘 쓰지 않아 약하게)
      (case when a.pub_min <= 200 then 5 else 0 end)
      + (case when a.priv_min <= 100 then 5 else 0 end)
      + (case when a.lots_200m >= 10 then 5 else 0 end) as minor_score
    from agg a
    join cov c on c.id = a.id
    left join cam cm on cm.id = a.id
    left join rep rp on rp.id = a.id
  )
  select
    sc.id,
    case
      when not sc.covered and sc.n_store + sc.n_road + sc.n_enforced + sc.n_full = 0 then null
      else greatest(least(
        sc.own_score + sc.road_score + sc.minor_score
        - (case when sc.n_enforced >= 2 then 40 when sc.n_enforced = 1 then 20 else 0 end)
        - (case when sc.n_full >= 2 then 15 when sc.n_full = 1 then 10 else 0 end)
        + (case when sc.covered then 0 else 30 end),
        100), 0)::integer
    end,
    round(sc.nearest)::integer,
    (
      select n.sname from near n
      where n.id = sc.id and n.sname is not null
      order by n.d limit 1
    ),
    array_remove(array[
      case when sc.n_enforced > 0 then '단속 제보 ' || sc.n_enforced || '명' end,
      case when sc.n_store > 0 then '가게 주차장 이용 제보 ' || sc.n_store || '명' end,
      case when sc.n_road > 0 then '도로변 주차 가능 제보 ' || sc.n_road || '명' end,
      case when sc.n_full > 0 then '자리 없음 제보 ' || sc.n_full || '명' end,
      case when sc.n_store = 0 and sc.name_match then '가게·건물 주차장 추정 (' || sc.match_name || ')' end,
      case when sc.n_store = 0 and not coalesce(sc.name_match, false) and sc.building
        then '같은 건물·바로 옆 주차장 추정 (' || sc.building_name || ')' end,
      case when sc.road_min <= 100 then '도로변 노상주차장 ' || round(sc.road_min) || 'm' end,
      case when sc.pub_min <= 200 then '공영주차장 ' || round(sc.pub_min) || 'm (택시는 잘 안 써요)' end,
      case when not sc.covered then '주차장 데이터가 없는 지역' end
    ], null),
    case
      when sc.n_store > 0 then 'reported'
      when sc.name_match then 'name_match'
      when sc.building then 'building'
      else 'none'
    end,
    case when sc.n_store = 0 then coalesce(sc.match_name, sc.building_name) end,
    case when sc.road_min <= 100 then round(sc.road_min)::integer end,
    case when sc.road_min <= 100 then sc.road_name end,
    sc.n_store::integer,
    sc.n_road::integer,
    sc.n_enforced::integer,
    sc.n_full::integer,
    (not sc.covered and sc.n_store + sc.n_road + sc.n_enforced + sc.n_full = 0),
    round(sc.cam_min)::integer,
    sc.cam_name
  from scored sc;
$$;
