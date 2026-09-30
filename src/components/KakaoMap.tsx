"use client";

import { useEffect, useRef, useState } from "react";
import { Toilet, Utensils, type IconNode } from "lucide";
import { LEVEL_STYLE, parkingLevel, type ParkingLevel } from "@/lib/parking";
import type { Place, PlaceType } from "@/types/place";

type Props = {
  center: { lat: number; lng: number };
  places: Place[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  // 사용자가 지도를 직접 끌기 시작할 때 (코드로 움직인 경우는 호출되지 않는다)
  onMapMove?: () => void;
  // 탐색 화면: 반경 원과 내 위치 표시 / 상세 화면: 장소 하나만 보여준다
  variant?: "explore" | "detail";
  radius?: number;
  level?: number;
};

const INK = "#070b12";

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

function markerImage(type: PlaceType, level: ParkingLevel, selected: boolean) {
  const cacheKey = `${type}-${level}-${selected}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  // 마커는 지도 위에 많이 겹치므로 작게 그린다 (기본 23px, 선택 28px)
  const size = selected ? 28 : 23;
  const icon = Math.round(size * 0.5);
  const border = 2;
  const offset = (size - icon) / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - border / 2}" fill="${LEVEL_STYLE[level].color}" stroke="${INK}" stroke-width="${border}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${icon / 24})" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${iconToSvg(MARKER_ICON[type])}</g>` +
    `</svg>`;
  const image = new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(size, size),
    { offset: new kakao.maps.Point(size / 2, size / 2) },
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

const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;

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
  variant = "explore",
  radius = 500,
  level = 4,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<(kakao.maps.Marker | kakao.maps.Circle)[]>([]);
  const onMapMoveRef = useRef(onMapMove);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onMapMoveRef.current = onMapMove;
  }, [onMapMove]);
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
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    // 지도 인스턴스는 한 번만 생성
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const centerLatLng = new kakao.maps.LatLng(center.lat, center.lng);
    map.setCenter(centerLatLng);

    if (variant === "explore") {
      const circle = new kakao.maps.Circle({
        center: centerLatLng,
        radius,
        strokeWeight: 2,
        strokeColor: "#35e2a2",
        strokeOpacity: 0.55,
        fillColor: "#35e2a2",
        fillOpacity: 0.06,
      });
      circle.setMap(map);
      overlaysRef.current.push(circle);

      const me = new kakao.maps.Marker({
        position: centerLatLng,
        image: myLocationImage(),
        title: "내 위치",
        zIndex: 10,
        map,
      });
      overlaysRef.current.push(me);
    }

    places.forEach((p) => {
      const selected = variant === "detail" || p.id === selectedId;
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        title: p.name,
        image: markerImage(p.type, parkingLevel(p.parking.score), selected),
        zIndex: selected ? 5 : 1,
        map,
      });
      if (onSelect) {
        kakao.maps.event.addListener(marker, "click", () => onSelect(p.id));
      }
      overlaysRef.current.push(marker);
    });
  }, [ready, center, places, radius, selectedId, onSelect, variant]);

  useEffect(() => {
    const map = mapRef.current;
    const p = places.find((x) => x.id === selectedId);
    if (ready && map && p && variant === "explore") {
      map.panTo(new kakao.maps.LatLng(p.lat, p.lng));
    }
  }, [ready, selectedId, places, variant]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-bad">
        {error}
      </div>
    );
  }
  return <div ref={containerRef} className="map-dark h-full w-full" />;
}
