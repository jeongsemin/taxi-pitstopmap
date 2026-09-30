-- 장소 상세 화면용: nearby_places 가 전화번호와 개방시간도 반환하도록 확장.
-- 반환 타입이 바뀌므로 기존 함수를 지우고 다시 만든다.
drop function if exists nearby_places(double precision, double precision, integer, text);

create function nearby_places(
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
  phone text,
  open_hours text,
  is_24h boolean,
  source text,
  distance double precision
)
language sql stable
as $$
  select
    p.id, p.name, p.type,
    st_y(p.location::geometry), st_x(p.location::geometry),
    p.address, p.phone, p.open_hours, p.is_24h, p.source,
    st_distance(p.location, st_point(lng, lat)::geography) as distance
  from places p
  where st_dwithin(p.location, st_point(lng, lat)::geography, radius_m)
    and (place_type is null or p.type = place_type)
  order by distance;
$$;
