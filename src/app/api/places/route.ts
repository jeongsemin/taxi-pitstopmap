import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fetchRestaurants,
  type RestaurantResult,
} from "@/lib/kakao-restaurants";
import { EMPTY_PARKING_SCORE } from "@/lib/parking";
import type { Place, PlaceType } from "@/types/place";

const DEFAULT_RADIUS = 500;
const MAX_RADIUS = 20000; // 카카오 로컬 API 반경 상한(m)

type ScoreRow = {
  id: string;
  score: number;
  nearest_lot_distance: number | null;
  nearest_lot_name: string | null;
  reasons: string[];
  reports_parkable: number;
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
    points: places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
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
      reports: {
        parkable: r.reports_parkable,
        enforced: r.reports_enforced,
        full: r.reports_full,
      },
    };
  }
  return true;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radiusParam = Number(params.get("radius") ?? 500);
  const radius = Number.isFinite(radiusParam)
    ? Math.min(Math.max(Math.round(radiusParam), 1), MAX_RADIUS)
    : DEFAULT_RADIUS;

  if (
    !params.get("lat") ||
    !params.get("lng") ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return Response.json({ error: "lat, lng가 필요합니다." }, { status: 400 });
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return Response.json(
      { error: "KAKAO_REST_API_KEY 미설정" },
      { status: 500 },
    );
  }

  const typeParam = params.get("type");
  const types: PlaceType[] =
    typeParam === "restaurant" || typeParam === "toilet"
      ? [typeParam]
      : ["restaurant", "toilet"];

  const noRestaurants: RestaurantResult = { places: [], total: 0 };

  try {
    const [restaurants, toilets] = await Promise.all([
      types.includes("restaurant")
        ? fetchRestaurants(lat, lng, radius, key)
        : noRestaurants,
      types.includes("toilet") ? fetchToilets(lat, lng, radius) : [],
    ]);
    const places = [...restaurants.places, ...toilets].sort(
      (a, b) => a.distance - b.distance,
    );
    const scored = await attachParkingScores(places);
    return Response.json({
      places,
      scored,
      // 식당은 카카오 검색 한도 때문에 반경 안 전부를 받지 못할 수 있다. 실제 개수를 함께 알려준다.
      restaurants: {
        total: restaurants.total,
        shown: restaurants.places.length,
        truncated: restaurants.total > restaurants.places.length,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
