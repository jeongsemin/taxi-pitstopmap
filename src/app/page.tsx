"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { Place } from "@/types/place";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

// 위치 권한 거부 시 기본 위치: 서울 강남역
const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };
const RADIUS_OPTIONS = [500, 1000, 1500, 2000];

export default function Home() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [locMessage, setLocMessage] = useState("현재 위치 확인 중…");
  const [radius, setRadius] = useState(500);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      // 브라우저 API 지원 여부는 마운트 후에만 알 수 있음
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocMessage("위치 미지원 – 강남역 기준");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocMessage("현재 위치 기준");
      },
      () => setLocMessage("위치 권한 없음 – 강남역 기준"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/places?lat=${center.lat}&lng=${center.lng}&radius=${radius}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "검색 실패");
        setPlaces(data.places);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [center, radius]);

  const changeRadius = (r: number) => {
    setLoading(true);
    setRadius(r);
  };

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-bold">🚕 taxi-pitstopmap</h1>
          <p className="text-xs text-zinc-500">{locMessage}</p>
        </div>
        <div className="flex gap-1">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => changeRadius(r)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                r === radius
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {r >= 1000 ? `${r / 1000}km` : `${r}m`}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 basis-1/2">
        <KakaoMap
          center={center}
          places={places}
          radius={radius}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      <section className="min-h-0 flex-1 basis-1/2 overflow-y-auto border-t">
        <div className="sticky top-0 bg-white px-4 py-2 text-sm font-semibold dark:bg-black">
          주변 식당 {loading ? "검색 중…" : `${places.length}곳`}
        </div>
        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
        <ul>
          {places.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={`w-full border-b px-4 py-3 text-left ${
                  p.id === selectedId ? "bg-blue-50 dark:bg-zinc-900" : ""
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="shrink-0 text-sm text-zinc-500">
                    {p.distance}m
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  {p.category} · {p.address}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
