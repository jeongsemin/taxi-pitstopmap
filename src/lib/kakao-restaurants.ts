import { EMPTY_PARKING_SCORE } from "@/lib/parking";
import type { Place } from "@/types/place";

// 카카오 로컬 API 의 카테고리 검색은 한 번에 최대 45건(15건 x 3페이지)만 준다.
// 반경 안 식당이 그보다 많으면(강남역 500m 만 해도 800곳 이상) 가까운 45곳만 보이게 되므로,
// 반경을 작은 칸(격자)으로 나눠 가까운 칸부터 더 받아 온다. 호출 수에는 상한이 있어서
// 전부 받지 못할 수 있고, 그 경우 전체 개수(total)와 함께 알려 준다.
const KAKAO_CATEGORY_URL =
  "https://dapi.kakao.com/v2/local/search/category.json";
const RESTAURANT_CODE = "FD6";
const PAGE_SIZE = 15;
const PAGES_PER_QUERY = 3;
const MAX_CALLS = 20; // 한 번의 조회에서 쓰는 카카오 호출 수 상한
const CONCURRENCY = 6;
const MIN_CELL_METERS = 200;
const MAX_RESULTS = 400;
const CACHE_TTL_MS = 5 * 60_000; // 식당 목록은 자주 바뀌지 않으므로 5분
const CACHE_MAX_ENTRIES = 100;

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
  meta: { is_end: boolean; total_count: number };
};

export type RestaurantResult = {
  places: Place[];
  // 반경 안 식당의 실제 전체 개수 (카카오 집계)
  total: number;
};

type Rect = { west: number; south: number; east: number; north: number };

async function query(
  params: Record<string, string>,
  key: string,
): Promise<KakaoResponse> {
  const url = new URL(KAKAO_CATEGORY_URL);
  url.search = new URLSearchParams({
    category_group_code: RESTAURANT_CODE,
    sort: "distance",
    size: String(PAGE_SIZE),
    ...params,
  }).toString();

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`카카오 API 호출 실패 (${res.status})`);
  return res.json();
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function toPlace(d: KakaoDocument, lat: number, lng: number): Place {
  const placeLat = Number(d.y);
  const placeLng = Number(d.x);
  const given = d.distance === "" ? NaN : Number(d.distance);
  return {
    id: `kakao-${d.id}`,
    type: "restaurant",
    name: d.place_name,
    category: d.category_name.split(" > ").pop() ?? d.category_name,
    address: d.road_address_name || d.address_name,
    phone: d.phone,
    openHours: null,
    is24h: false,
    lat: placeLat,
    lng: placeLng,
    distance: Number.isFinite(given)
      ? given
      : Math.round(distanceMeters(lat, lng, placeLat, placeLng)),
    url: d.place_url,
    parking: EMPTY_PARKING_SCORE,
  };
}

// 중심에서 가까운 칸부터 정렬한 격자. 반경이 커도 칸이 너무 많아지지 않게 칸 크기를 키운다.
function cellsAround(lat: number, lng: number, radius: number): Rect[] {
  const cell = Math.max(MIN_CELL_METERS, Math.ceil(radius / 10));
  const dLat = cell / 111320;
  const dLng = cell / (111320 * Math.cos((lat * Math.PI) / 180));
  const n = Math.ceil(radius / cell);

  const cells: { rect: Rect; dist: number }[] = [];
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const rect: Rect = {
        south: lat + i * dLat,
        north: lat + (i + 1) * dLat,
        west: lng + j * dLng,
        east: lng + (j + 1) * dLng,
      };
      const nearestLat = Math.min(Math.max(lat, rect.south), rect.north);
      const nearestLng = Math.min(Math.max(lng, rect.west), rect.east);
      const dist = distanceMeters(lat, lng, nearestLat, nearestLng);
      if (dist <= radius) cells.push({ rect, dist });
    }
  }
  return cells.sort((a, b) => a.dist - b.dist).map((c) => c.rect);
}

async function load(
  lat: number,
  lng: number,
  radius: number,
  key: string,
): Promise<RestaurantResult> {
  const found = new Map<string, Place>();
  const add = (docs: KakaoDocument[]) => {
    for (const d of docs) {
      const p = toPlace(d, lat, lng);
      if (p.distance <= radius) found.set(p.id, p);
    }
  };
  const finish = (total: number): RestaurantResult => ({
    places: [...found.values()]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RESULTS),
    total,
  });

  // 원 검색 첫 페이지: 전체 개수와 가장 가까운 식당을 얻는다.
  const circle = {
    x: String(lng),
    y: String(lat),
    radius: String(radius),
  };
  const first = await query({ ...circle, page: "1" }, key);
  add(first.documents);
  const total = first.meta.total_count;

  // 한 번의 검색(45건)으로 다 받을 수 있으면 나머지 페이지만 받는다.
  if (total <= PAGE_SIZE * PAGES_PER_QUERY) {
    const pages = Math.ceil(total / PAGE_SIZE);
    const rest = await Promise.all(
      Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
        query({ ...circle, page: String(i + 2) }, key),
      ),
    );
    rest.forEach((r) => add(r.documents));
    return finish(total);
  }

  // 그보다 많으면 격자 칸별로 검색한다. 일부 칸이 실패해도 받은 만큼은 보여준다.
  const cells = cellsAround(lat, lng, radius);
  let next = 0;
  let calls = 1;

  const worker = async () => {
    while (calls < MAX_CALLS) {
      const rect = cells[next++];
      if (!rect) return;
      const base = {
        rect: `${rect.west},${rect.south},${rect.east},${rect.north}`,
        x: String(lng),
        y: String(lat),
      };
      try {
        calls++;
        const r = await query({ ...base, page: "1" }, key);
        add(r.documents);
        const pages = Math.min(
          PAGES_PER_QUERY,
          Math.ceil(r.meta.total_count / PAGE_SIZE),
        );
        for (let page = 2; page <= pages && calls < MAX_CALLS; page++) {
          calls++;
          add((await query({ ...base, page: String(page) }, key)).documents);
        }
      } catch (e) {
        console.error("식당 격자 조회 일부 실패:", (e as Error).message);
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return finish(total);
}

// 같은 장소를 짧은 시간에 다시 조회할 때 카카오 호출을 아낀다 (서버 인스턴스 메모리, 5분).
const cache = new Map<string, { expires: number; value: RestaurantResult }>();

export async function fetchRestaurants(
  lat: number,
  lng: number,
  radius: number,
  key: string,
): Promise<RestaurantResult> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await load(lat, lng, radius, key);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
}
