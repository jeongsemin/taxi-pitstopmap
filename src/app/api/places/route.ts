import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ParkingScore } from "@/lib/parking";
import type { Place, PlaceType } from "@/types/place";

const KAKAO_CATEGORY_URL =
  "https://dapi.kakao.com/v2/local/search/category.json";
const RESTAURANT_CODE = "FD6";
const MAX_PAGES = 3;

type KakaoDocument = {
  id: string;
  place_name: string;
  category_name: string;
  road_address_name: string;
  address_name: string;
  phone: string;
  x: string;
  y: string;
  distance: string;
  place_url: string;
};

type KakaoResponse = {
  documents: KakaoDocument[];
  meta: { is_end: boolean };
};

type ScoreRow = {
  id: string;
  score: number;
  nearest_lot_distance: number | null;
  nearest_lot_name: string | null;
  reasons: string[];
};

const EMPTY_SCORE: ParkingScore = {
  score: 0,
  nearestLotDistance: null,
  nearestLotName: null,
  reasons: [],
};

type ToiletRow = {
  id: number;
  name: string;
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
    phone: "",
    lat: r.lat,
    lng: r.lng,
    distance: Math.round(r.distance),
    url: "",
    parking: EMPTY_SCORE,
  }));
}

async function fetchRestaurants(
  lat: number,
  lng: number,
  radius: number,
  key: string,
): Promise<Place[]> {
  const places: Place[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(KAKAO_CATEGORY_URL);
    url.search = new URLSearchParams({
      category_group_code: RESTAURANT_CODE,
      x: String(lng),
      y: String(lat),
      radius: String(radius),
      sort: "distance",
      size: "15",
      page: String(page),
    }).toString();

    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`카카오 API 호출 실패 (${res.status})`);

    const data: KakaoResponse = await res.json();
    for (const d of data.documents) {
      places.push({
        id: `kakao-${d.id}`,
        type: "restaurant",
        name: d.place_name,
        category: d.category_name.split(" > ").pop() ?? d.category_name,
        address: d.road_address_name || d.address_name,
        phone: d.phone,
        lat: Number(d.y),
        lng: Number(d.x),
        distance: Number(d.distance),
        url: d.place_url,
        parking: EMPTY_SCORE,
      });
    }
    if (data.meta.is_end) break;
  }
  return places;
}

async function attachParkingScores(places: Place[]) {
  if (places.length === 0) return;
  const { data, error } = await supabase.rpc("score_places", {
    points: places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
  });
  if (error) throw new Error(`주정차 점수 계산 실패: ${error.message}`);

  const byId = new Map((data as ScoreRow[]).map((r) => [r.id, r]));
  for (const p of places) {
    const r = byId.get(p.id);
    if (!r) continue;
    p.parking = {
      score: r.score,
      nearestLotDistance: r.nearest_lot_distance,
      nearestLotName: r.nearest_lot_name,
      reasons: r.reasons ?? [],
    };
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radius = Math.min(
    Math.max(Number(params.get("radius") ?? 500), 1),
    20000,
  );

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

  try {
    const results = await Promise.all([
      types.includes("restaurant")
        ? fetchRestaurants(lat, lng, radius, key)
        : [],
      types.includes("toilet") ? fetchToilets(lat, lng, radius) : [],
    ]);
    const places = results.flat().sort((a, b) => a.distance - b.distance);
    await attachParkingScores(places);
    return Response.json({ places });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
