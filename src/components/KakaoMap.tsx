"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/types/place";

type Props = {
  center: { lat: number; lng: number };
  places: Place[];
  radius: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const MARKER_STYLE = {
  restaurant: { color: "#ea580c", emoji: "🍴" },
  toilet: { color: "#2563eb", emoji: "🚻" },
} as const;

function markerImage(type: keyof typeof MARKER_STYLE) {
  const { color, emoji } = MARKER_STYLE[type];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">` +
    `<path d="M18 43C18 43 33 28 33 17A15 15 0 0 0 3 17C3 28 18 43 18 43Z" fill="${color}" stroke="white" stroke-width="2"/>` +
    `<text x="18" y="23" font-size="14" text-anchor="middle">${emoji}</text></svg>`;
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(36, 44),
    { offset: new kakao.maps.Point(18, 44) },
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
  radius,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<(kakao.maps.Marker | kakao.maps.Circle)[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSdk()
      .then(() => {
        if (!containerRef.current) return;
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 4,
        });
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

    const circle = new kakao.maps.Circle({
      center: centerLatLng,
      radius,
      strokeWeight: 2,
      strokeColor: "#2563eb",
      strokeOpacity: 0.7,
      fillColor: "#3b82f6",
      fillOpacity: 0.08,
    });
    circle.setMap(map);
    overlaysRef.current.push(circle);

    const me = new kakao.maps.Marker({ position: centerLatLng, map });
    overlaysRef.current.push(me);

    const images = {
      restaurant: markerImage("restaurant"),
      toilet: markerImage("toilet"),
    };
    places.forEach((p) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        title: p.name,
        image: images[p.type],
        map,
      });
      kakao.maps.event.addListener(marker, "click", () => onSelect(p.id));
      overlaysRef.current.push(marker);
    });
  }, [ready, center, places, radius, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    const p = places.find((x) => x.id === selectedId);
    if (ready && map && p) map.panTo(new kakao.maps.LatLng(p.lat, p.lng));
  }, [ready, selectedId, places]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-red-600">
        {error}
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}
