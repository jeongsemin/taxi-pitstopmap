import type { NextRequest } from "next/server";
import type { Place } from "@/types/place";

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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radius = Math.min(
    Math.max(Number(params.get("radius") ?? 500), 1),
    20000,
  );

  if (!params.get("lat") || !params.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat, lng가 필요합니다." }, { status: 400 });
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return Response.json(
      { error: "KAKAO_REST_API_KEY 미설정" },
      { status: 500 },
    );
  }

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
    if (!res.ok) {
      return Response.json(
        { error: "카카오 API 호출 실패", status: res.status },
        { status: 502 },
      );
    }

    const data: KakaoResponse = await res.json();
    for (const d of data.documents) {
      places.push({
        id: d.id,
        name: d.place_name,
        category: d.category_name.split(" > ").pop() ?? d.category_name,
        address: d.road_address_name || d.address_name,
        phone: d.phone,
        lat: Number(d.y),
        lng: Number(d.x),
        distance: Number(d.distance),
        url: d.place_url,
      });
    }
    if (data.meta.is_end) break;
  }

  return Response.json({ places });
}
