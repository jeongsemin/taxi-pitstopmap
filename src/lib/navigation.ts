import type { Place } from "@/types/place";

// 카카오맵: 웹 링크라 PC/모바일 모두 열리고, 모바일에서는 앱이 설치돼 있으면 앱으로 연결된다.
export function kakaoMapRouteUrl(place: Pick<Place, "name" | "lat" | "lng">) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
}

// T맵: 앱 URL 스킴. 앱이 설치된 모바일에서만 동작한다.
export function tmapRouteUrl(place: Pick<Place, "name" | "lat" | "lng">) {
  const params = new URLSearchParams({
    goalname: place.name,
    goalx: String(place.lng),
    goaly: String(place.lat),
  });
  return `tmap://route?${params.toString()}`;
}
