-- 주차 판단을 "가게 자체 주차"와 "도로변 주차"로 나눈다.
--
-- 배경: 택시 기사는 공영주차장을 잘 쓰지 않는다. 그래서 점수는
--   1) 가게가 주차 공간을 제공하는가 (제보로 확인됐거나, 이름·주소로 추정되는가)
--   2) 제공하지 않는다면 가까운 도로변에 세울 수 있는가 (노상주차장, 제보)
-- 순으로 본다. 공영주차장은 가점을 크게 낮춘다.
--
-- 데이터 한계: 가게가 주차를 제공하는지 알려 주는 공공데이터는 없다. 카카오 주차장(PK6) 데이터에서
-- 가게 이름과 같은 이름의 주차장, 같은 건물 주소의 주차장, 바로 옆(30m)의 민영주차장을 "추정"으로 쓰고,
-- 사용자 제보가 쌓이면 제보가 우선한다. 도로변 주정차 허용·금지 구간 데이터는 아직 없어서
-- 노상주차장(도로에 그어진 주차구획) 위치와 제보만 쓴다.
--
-- 점수 (합계 0~100, 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만):
--   가게 주차: 제보 2명 이상 60 / 1명 50 / 이름 일치 주차장 40 / 같은 건물·바로 옆 주차장 30 (가장 큰 값 하나)
--   도로변:   노상주차장 100m 이내 +30, '도로변에 세울 수 있었음' 제보 1명 +15 / 2명 이상 +30 (최대 45)
--   보조:     공영주차장 200m 이내 +5, 다른 민영주차장 100m 이내 +5, 200m 안 주차장 10곳 이상 +5
--   감점:     '단속됨' 1명 -20 / 2명 이상 -40, '자리 없음' 1명 -10 / 2명 이상 -15
--   그래서 🟡 이상이 되려면 가게 주차나 도로변 근거가 있어야 하고, 주차장이 주변에 많다는 것만으로는 안 된다.

-- 제보 종류: '가게 주차장 이용함'(store_parking), '도로변에 세울 수 있었음'(roadside_ok) 추가.
-- 이전 'parkable'(세울 수 있었음)은 도로변 제보와 같게 취급한다.
alter table reports drop constraint if exists reports_report_type_check;
alter table reports
  add constraint reports_report_type_check
  check (report_type in ('store_parking', 'roadside_ok', 'parkable', 'enforced', 'full'));

-- 이름 비교용: 괄호·공백·기호와 '주차장', '본점', 'OO점' 같은 흔한 꼬리표를 떼고 소문자로 맞춘다.
create or replace function norm_name(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(t, '')), '\(.*?\)', '', 'g'),
        '(주차장|전용|부설|공영|민영|노상|노외|본점|직영점|[0-9]+호점)', '', 'g'),
      '[^0-9a-z가-힣]', '', 'g'),
    '[가-힣]{1,3}점$', '')
$$;

-- 주소 끝 두 토큰("테헤란로 152")으로 같은 건물인지 본다.
create or replace function addr_tail(a text)
returns text
language sql
immutable
as $$
  select coalesce(substring(a from '(\S+ +\S+) *$'), '')
$$;

-- 입력: [{"id": "kakao-1", "lat": 37.5, "lng": 127.0, "name": "가게이름", "address": "서울 ... 테헤란로 152"}, ...]
-- name, address 는 선택이며 없으면 이름·주소 추정은 건너뛴다.
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
  -- 하위 호환: 이전에 배포된 화면이 이 이름으로 읽는다 (도로변 제보 수와 같다). 새 화면이 배포되면 이후 마이그레이션에서 지운다.
  reports_parkable integer
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
      a.id, c.covered,
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
    sc.n_road::integer
  from scored sc;
$$;
