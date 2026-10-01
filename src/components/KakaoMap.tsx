"use client";

import { useEffect, useRef, useState } from "react";
import { Toilet, Utensils, type IconNode } from "lucide";
import { LEVEL_STYLE, parkingLevel, type ParkingLevel } from "@/lib/parking";
import { useTheme, type ResolvedTheme } from "@/lib/theme";
import type { Place, PlaceType } from "@/types/place";

type Props = {
  // 검색 기준 위치: 반경 원의 중심이고, 이 값이 바뀌면 지도도 그곳으로 옮긴다
  center: { lat: number; lng: number };
  // 내 위치(파란 점). 없으면 center 에 표시한다
  myLocation?: { lat: number; lng: number };
  places: Place[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  // 사용자가 지도를 직접 끌기 시작할 때 (코드로 움직인 경우는 호출되지 않는다)
  onMapMove?: () => void;
  // 사용자가 지도를 끌어서 옮긴 뒤의 중심 (끌기가 끝났을 때)
  onMapMoved?: (center: { lat: number; lng: number }) => void;
  // 탐색 화면: 반경 원과 내 위치 표시 / 상세 화면: 장소 하나만 보여준다
  variant?: "explore" | "detail";
  radius?: number;
  level?: number;
};

const INK = "#070b12";

// 마커 테두리는 지도 배경과 구분되도록 테마별로 다르게 둔다
const MARKER_BORDER: Record<ResolvedTheme, string> = {
  dark: "#070b12",
  light: "#ffffff",
};

// 검색 반경 원 색
const RADIUS_STYLE: Record<
  ResolvedTheme,
  { stroke: string; strokeOpacity: number; fill: string; fillOpacity: number }
> = {
  dark: {
    stroke: "#35e2a2",
    strokeOpacity: 0.55,
    fill: "#35e2a2",
    fillOpacity: 0.06,
  },
  light: {
    stroke: "#191919",
    strokeOpacity: 0.45,
    fill: "#fee500",
    fillOpacity: 0.12,
  },
};

// 묶음(클러스터) 표시. 마커의 상태 색(초록/주황/빨강)과 헷갈리지 않게 무채색으로 그린다.
const CLUSTER_MIN_LEVEL = 4; // 이 지도 레벨 이상(멀리서 볼 때)에서만 묶는다. 더 확대하면 개별 마커로 보인다.
const CLUSTER_SIZES = [34, 42, 50]; // 묶인 개수 구간(10 미만 / 50 미만 / 그 이상)별 크기

function clusterStyles(theme: ResolvedTheme): object[] {
  const dark = theme === "dark";
  return CLUSTER_SIZES.map((px) => ({
    width: `${px}px`,
    height: `${px}px`,
    lineHeight: `${px - 4}px`,
    boxSizing: "border-box",
    borderRadius: "50%",
    border: `2px solid ${dark ? "#9eacbc" : "#191919"}`,
    background: dark ? "#202c3b" : "#ffffff",
    color: dark ? "#f7fafc" : "#191919",
    textAlign: "center",
    fontWeight: "800",
    fontSize: px > 40 ? "14px" : "13px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
  }));
}

const MARKER_ICON: Record<PlaceType, IconNode> = {
  restaurant: Utensils,
  toilet: Toilet,
};

function iconToSvg(nodes: IconNode) {
  return nodes
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}/>`,
    )
    .join("");
}

// 마커 색은 주정차 점수, 아이콘은 장소 종류. 선택된 마커는 더 크게 그린다.
const imageCache = new Map<string, kakao.maps.MarkerImage>();

function markerImage(
  type: PlaceType,
  level: ParkingLevel,
  selected: boolean,
  theme: ResolvedTheme,
) {
  const cacheKey = `${type}-${level}-${selected}-${theme}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  // 보이는 크기는 작게(기본 23px, 선택 28px) 유지해 겹침을 줄이고,
  // 투명 여백을 둬서 손가락으로 누를 수 있는 영역은 넓힌다 (기본 40px, 선택 44px).
  const size = selected ? 28 : 23;
  const hit = selected ? 44 : 40;
  const c = hit / 2;
  const icon = Math.round(size * 0.5);
  const border = 2;
  const offset = c - icon / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${hit}" height="${hit}" viewBox="0 0 ${hit} ${hit}">` +
    `<circle cx="${c}" cy="${c}" r="${size / 2 - border / 2}" fill="${LEVEL_STYLE[level].color}" stroke="${MARKER_BORDER[theme]}" stroke-width="${border}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${icon / 24})" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${iconToSvg(MARKER_ICON[type])}</g>` +
    `</svg>`;
  const image = new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(hit, hit),
    {
      offset: new kakao.maps.Point(c, c),
      shape: "circle",
      coords: `${c},${c},${c}`,
    },
  );
  imageCache.set(cacheKey, image);
  return image;
}

function myLocationImage() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">` +
    `<circle cx="15" cy="15" r="14" fill="#4da3ff" fill-opacity="0.25"/>` +
    `<circle cx="15" cy="15" r="7" fill="#4da3ff" stroke="white" stroke-width="3"/></svg>`;
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(30, 30),
    { offset: new kakao.maps.Point(15, 15) },
  );
}

const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=clusterer&autoload=false`;

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  });
}

export default function KakaoMap({
  center,
  places,
  selectedId,
  onSelect,
  onMapMove,
  onMapMoved,
  myLocation,
  variant = "explore",
  radius = 500,
  level = 4,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<(kakao.maps.Marker | kakao.maps.Circle)[]>([]);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const onMapMoveRef = useRef(onMapMove);
  const onMapMovedRef = useRef(onMapMoved);
  const { resolved: theme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onMapMoveRef.current = onMapMove;
    onMapMovedRef.current = onMapMoved;
  }, [onMapMove, onMapMoved]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSdk()
      .then(() => {
        if (!containerRef.current) return;
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        kakao.maps.event.addListener(mapRef.current, "dragstart", () =>
          onMapMoveRef.current?.(),
        );
        const map = mapRef.current;
        kakao.maps.event.addListener(map, "dragend", () => {
          const c = map.getCenter();
          onMapMovedRef.current?.({ lat: c.getLat(), lng: c.getLng() });
        });
        if (variant === "explore") {
          clustererRef.current = new kakao.maps.MarkerClusterer({
            map,
            averageCenter: true,
            minLevel: CLUSTER_MIN_LEVEL,
            minClusterSize: 3,
            gridSize: 50,
            styles: clusterStyles(theme),
            calculator: [10, 50],
          });
        }
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    // 지도 인스턴스는 한 번만 생성
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 지도 중심은 기준 위치(center)가 바뀔 때만 옮긴다.
  // 마커를 다시 그리는 효과와 분리하지 않으면 장소를 선택할 때마다 현재 위치로 튀었다가 이동한다.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
  }, [ready, center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    clustererRef.current?.clear();

    const centerLatLng = new kakao.maps.LatLng(center.lat, center.lng);

    if (variant === "explore") {
      const circle = new kakao.maps.Circle({
        center: centerLatLng,
        radius,
        strokeWeight: 2,
        strokeColor: RADIUS_STYLE[theme].stroke,
        strokeOpacity: RADIUS_STYLE[theme].strokeOpacity,
        fillColor: RADIUS_STYLE[theme].fill,
        fillOpacity: RADIUS_STYLE[theme].fillOpacity,
      });
      circle.setMap(map);
      overlaysRef.current.push(circle);

      const me = new kakao.maps.Marker({
        position: myLocation
          ? new kakao.maps.LatLng(myLocation.lat, myLocation.lng)
          : centerLatLng,
        image: myLocationImage(),
        title: "내 위치",
        zIndex: 10,
        map,
      });
      overlaysRef.current.push(me);
    }

    // 한눈에 봐야 하는 마커는 묶지 않고 항상 개별로 보인다:
    //  🟢 주차 가능, 화장실(급할 때 찾는 곳), 선택한 장소. 나머지 식당만 멀리서 볼 때 묶는다.
    const clustered: kakao.maps.Marker[] = [];

    places.forEach((p) => {
      const selected = variant === "detail" || p.id === selectedId;
      const level = parkingLevel(p.parking.score);
      const clusterable =
        variant === "explore" &&
        p.type === "restaurant" &&
        level !== "good" &&
        !selected;

      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        title: p.name,
        image: markerImage(p.type, level, selected, theme),
        zIndex: selected ? 5 : level === "good" ? 3 : 1,
        // 묶을 마커는 클러스터러가 지도에 올린다
        ...(clusterable ? {} : { map }),
      });
      if (onSelect) {
        kakao.maps.event.addListener(marker, "click", () => onSelect(p.id));
      }
      if (clusterable) clustered.push(marker);
      else overlaysRef.current.push(marker);
    });

    const clusterer = clustererRef.current;
    if (clusterer) {
      clusterer.setStyles(clusterStyles(theme));
      clusterer.addMarkers(clustered);
    }
  }, [
    ready,
    center,
    myLocation,
    places,
    radius,
    selectedId,
    onSelect,
    variant,
    theme,
  ]);

  // 장소를 선택해도 지도 시점은 바꾸지 않는다. 선택은 마커 크기와 하단 카드로만 표시한다.

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-bad">
        {error}
      </div>
    );
  }
  return <div ref={containerRef} className="map-dark h-full w-full" />;
}
