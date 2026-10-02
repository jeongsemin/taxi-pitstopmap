import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fetchRestaurants,
  type RestaurantResult,
} from "@/lib/kakao-restaurants";
import { EMPTY_PARKING_SCORE } from "@/lib/parking";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import type { Place, PlaceType } from "@/types/place";

const DEFAULT_RADIUS = 500;
const MAX_RADIUS = 3000; // 화면에서 고를 수 있는 최대 반경(2km)보다 조금 넉넉하게

// 서비스 지역(대한민국) 밖 좌표는 받지 않는다 (엉뚱한 좌표로 호출을 낭비하는 것을 막는다)
const KOREA_BOUNDS = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 };

// IP 하나당 허용하는 조회 수 (정상 사용은 지도를 옮길 때마다 1회 정도)
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60_000;

// 서버 인스턴스 하나가 1분에 처리하는 전체 조회 수. 한 조회가 카카오를 최대 20회 부르므로
// 여러 IP 로 흩어진 호출이 카카오 일일 한도를 한꺼번에 쓰지 못하게 하는 안전망이다.
const GLOBAL_LIMIT = 300;

// 같은 지역을 보는 사용자들이 CDN 캐시를 함께 쓰도록 좌표를 약 11m 단위로 맞춘다.
const roundCoord = (v: number) => Math.round(v * 1e4) / 1e4;

// 성공 응답은 CDN 에 잠깐 캐시해 같은 지역 조회가 서버와 카카오를 다시 부르지 않게 한다.
// 제보가 점수에 바로 반영되도록 짧게(30초) 두고, 화면은 제보 직후에 캐시를 우회해서 다시 조회한다.
const CACHE_OK = "public, s-maxage=30, stale-while-revalidate=60";
const NO_CACHE = "no-store";

function json(body: unknown, status = 200, cacheControl = NO_CACHE) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}

type ScoreRow = {
  id: string;
  score: number;
  nearest_lot_distance: number | null;
  nearest_lot_name: string | null;
  reasons: string[];
  store_parking: "reported" | "name_match" | "building" | "none";
  store_parking_name: string | null;
  roadside_distance: number | null;
  roadside_name: string | null;
  reports_store: number;
  reports_roadside: number;
  reports_enforced: number;
  reports_full: number;
  no_data: boolean;
};

type ToiletRow = {
  id: number;
  name: string;
  phone: string | null;
  open_hours: string | null;
  is_24h: boolean;
  lat: number;
  lng: number;
  address: string | null;
  distance: number;
};

async function fetchToilets(
  lat: number,
  lng: number,
  radius: number,
): Promise<Place[]> {
  const { data, error } = await supabase.rpc("nearby_places", {
    lat,
    lng,
    radius_m: radius,
    place_type: "toilet",
  });
  if (error) throw new Error(`화장실 조회 실패: ${error.message}`);

  return (data as ToiletRow[]).map((r) => ({
    id: `db-${r.id}`,
    type: "toilet",
    name: r.name,
    category: "화장실",
    address: r.address ?? "",
    phone: r.phone ?? "",
    openHours: r.open_hours,
    is24h: r.is_24h,
    lat: r.lat,
    lng: r.lng,
    distance: Math.round(r.distance),
    url: "",
    parking: EMPTY_PARKING_SCORE,
  }));
}

// 점수 계산이 실패해도 장소 자체는 보여준다. 성공 여부를 반환한다.
async function attachParkingScores(places: Place[]): Promise<boolean> {
  if (places.length === 0) return true;
  const { data, error } = await supabase.rpc("score_places", {
    // 이름·주소는 주차 자리 제공 여부 추정에 쓴다
    points: places.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      name: p.name,
      address: p.address,
    })),
  });
  if (error) {
    console.error("주정차 점수 계산 실패:", error.message);
    return false;
  }

  const byId = new Map((data as ScoreRow[]).map((r) => [r.id, r]));
  for (const p of places) {
    const r = byId.get(p.id);
    if (!r) continue;
    p.parking = {
      score: r.score,
      noData: r.no_data ?? false,
      nearestLotDistance: r.nearest_lot_distance,
      nearestLotName: r.nearest_lot_name,
      reasons: r.reasons ?? [],
      storeParking: {
        kind: r.store_parking ?? "none",
        lotName: r.store_parking_name ?? null,
      },
      roadside:
        r.roadside_distance === null || r.roadside_distance === undefined
          ? null
          : { distance: r.roadside_distance, name: r.roadside_name ?? null },
      reports: {
        store: r.reports_store ?? 0,
        roadside: r.reports_roadside ?? 0,
        enforced: r.reports_enforced,
        full: r.reports_full,
      },
    };
  }
  return true;
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(
    clientIp(request.headers),
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  // IP 한도에 걸린 요청은 전체 한도를 쓰지 않는다
  const globalLimited = limited.ok
    ? checkRateLimit("*", GLOBAL_LIMIT, RATE_WINDOW_MS)
    : limited;
  if (!limited.ok || !globalLimited.ok) {
    return Response.json(
      { error: "요청이 많아 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(limited.retryAfterSec, globalLimited.retryAfterSec),
          ),
          "Cache-Control": NO_CACHE,
        },
      },
    );
  }

  const params = request.nextUrl.searchParams;
  const rawLat = Number(params.get("lat"));
  const rawLng = Number(params.get("lng"));
  const radiusParam = Number(params.get("radius") ?? DEFAULT_RADIUS);
  const radius = Number.isFinite(radiusParam)
    ? Math.min(Math.max(Math.round(radiusParam), 1), MAX_RADIUS)
    : DEFAULT_RADIUS;

  if (
    !params.get("lat") ||
    !params.get("lng") ||
    !Number.isFinite(rawLat) ||
    !Number.isFinite(rawLng)
  ) {
    return json({ error: "lat, lng가 필요합니다." }, 400);
  }
  if (
    rawLat < KOREA_BOUNDS.minLat ||
    rawLat > KOREA_BOUNDS.maxLat ||
    rawLng < KOREA_BOUNDS.minLng ||
    rawLng > KOREA_BOUNDS.maxLng
  ) {
    return json({ error: "서비스 지역(대한민국) 밖의 위치예요." }, 400);
  }
  const lat = roundCoord(rawLat);
  const lng = roundCoord(rawLng);

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return json({ error: "KAKAO_REST_API_KEY 미설정" }, 500);
  }

  const typeParam = params.get("type");
  const types: PlaceType[] =
    typeParam === "restaurant" || typeParam === "toilet"
      ? [typeParam]
      : ["restaurant", "toilet"];

  const noRestaurants: RestaurantResult = { places: [], total: 0 };

  // 식당(카카오)과 화장실(DB) 중 한쪽이 실패해도 나머지는 보여 준다.
  const [restaurantsResult, toiletsResult] = await Promise.allSettled([
    types.includes("restaurant")
      ? fetchRestaurants(lat, lng, radius, key)
      : noRestaurants,
    types.includes("toilet") ? fetchToilets(lat, lng, radius) : [],
  ]);

  const failed: PlaceType[] = [];
  const errors: string[] = [];
  let restaurants = noRestaurants;
  let toilets: Place[] = [];

  if (restaurantsResult.status === "fulfilled") {
    restaurants = restaurantsResult.value;
  } else {
    failed.push("restaurant");
    errors.push((restaurantsResult.reason as Error).message);
  }
  if (toiletsResult.status === "fulfilled") {
    toilets = toiletsResult.value;
  } else {
    failed.push("toilet");
    errors.push((toiletsResult.reason as Error).message);
  }

  // 요청한 종류가 전부 실패하면 오류로 응답한다.
  if (failed.length === types.length) {
    return json({ error: errors[0] }, 502);
  }
  errors.forEach((message) => console.error("장소 조회 일부 실패:", message));

  const places = [...restaurants.places, ...toilets].sort(
    (a, b) => a.distance - b.distance,
  );
  const scored = await attachParkingScores(places);

  // 일부만 불러온 응답은 캐시하지 않는다 (복구된 뒤에도 잘못된 결과가 남지 않게)
  const degraded = failed.length > 0 || !scored;
  return json(
    {
      places,
      scored,
      // 일부 종류만 실패한 경우 어떤 종류인지 알려준다 (화면에서 안내)
      failed,
      // 식당은 카카오 검색 한도 때문에 반경 안 전부를 받지 못할 수 있다. 실제 개수를 함께 알려준다.
      restaurants: {
        total: restaurants.total,
        shown: restaurants.places.length,
        truncated: restaurants.total > restaurants.places.length,
      },
    },
    200,
    degraded ? NO_CACHE : CACHE_OK,
  );
}
