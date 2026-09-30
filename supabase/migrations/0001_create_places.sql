-- 장소(식당/화장실) 테이블. 설계서 6장 참고.
create extension if not exists postgis;

create table if not exists places (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null check (type in ('restaurant', 'toilet')),
  location geography(Point, 4326) not null,
  address text,
  phone text,
  open_hours text,
  is_24h boolean not null default false,
  source text not null check (source in ('kakao', 'public', 'osm', 'user')),
  source_id text not null,
  has_own_parking boolean,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists places_location_idx on places using gist (location);
create index if not exists places_type_idx on places (type);

-- 읽기는 누구나, 쓰기는 service role / DB 직접 접속만 허용
alter table places enable row level security;

drop policy if exists "places are readable by everyone" on places;
create policy "places are readable by everyone"
  on places for select using (true);

-- 반경 검색 함수: 지도 화면에서 supabase.rpc('nearby_places', ...)로 호출
create or replace function nearby_places(
  lat double precision,
  lng double precision,
  radius_m integer,
  place_type text default null
)
returns table (
  id bigint,
  name text,
  type text,
  lat double precision,
  lng double precision,
  address text,
  is_24h boolean,
  source text,
  distance double precision
)
language sql stable
as $$
  select
    p.id, p.name, p.type,
    st_y(p.location::geometry), st_x(p.location::geometry),
    p.address, p.is_24h, p.source,
    st_distance(p.location, st_point(lng, lat)::geography) as distance
  from places p
  where st_dwithin(p.location, st_point(lng, lat)::geography, radius_m)
    and (place_type is null or p.type = place_type)
  order by distance;
$$;
