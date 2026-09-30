import type { Place } from "@/types/place";

type Target = Pick<Place, "name" | "lat" | "lng">;

// 이 앱은 길안내를 직접 제공하지 않고, 목적지를 지도 앱으로 넘겨 그쪽에서 안내받게 한다.

// 카카오맵: 웹 링크라 PC/모바일 모두 열리고, 모바일에서는 앱이 설치돼 있으면 앱으로 연결된다.
export function kakaoMapUrl(place: Target) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
}

// 네이버 지도: 앱 URL 스킴(공식 문서의 자동차 길찾기 /route/car).
// appname 은 필수 식별 문자열이다. 출발지를 생략했을 때 현재 위치를 쓰는지는 문서에 없어 확인하지 못했다.
const NAVER_APP_NAME = "taxi-pitstopmap";

export function naverMapUrl(place: Target) {
  return (
    `nmap://route/car?dlat=${place.lat}&dlng=${place.lng}` +
    `&dname=${encodeURIComponent(place.name)}&appname=${NAVER_APP_NAME}`
  );
}

// 네이버 지도 앱이 열리지 않을 때 대신 여는 웹 주소 (이름 검색)
export function naverMapWebUrl(place: Target) {
  return `https://map.naver.com/p/search/${encodeURIComponent(place.name)}`;
}

// T맵: 앱 URL 스킴. 공식 문서 없이 커뮤니티에서 알려진 형식이라 기기·앱 버전에 따라 동작이 다를 수 있다.
export function tmapUrl(place: Target) {
  return (
    `tmap://route?goalname=${encodeURIComponent(place.name)}` +
    `&goalx=${place.lng}&goaly=${place.lat}`
  );
}

// 앱 URL 스킴을 열고, 잠시 뒤에도 화면이 그대로면 앱이 열리지 않은 것으로 판단해 알린다.
export function openMapApp(schemeUrl: string, onNotOpened: () => void) {
  let left = false;
  const mark = () => {
    left = true;
  };
  const onVisibility = () => {
    if (document.hidden) mark();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", mark, { once: true });

  window.location.href = schemeUrl;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", mark);
    if (!left) onNotOpened();
  }, 1500);
}
