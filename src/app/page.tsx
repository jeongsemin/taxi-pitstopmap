"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LEVEL_STYLE, parkingLevel } from "@/lib/parking";
import type { Place, PlaceType } from "@/types/place";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

// 위치 권한 거부 시 기본 위치: 서울 강남역
const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };
const RADIUS_OPTIONS = [500, 1000, 1500, 2000];

type Filter = "all" | PlaceType;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "restaurant", label: "🍴 식당" },
  { value: "toilet", label: "🚻 화장실" },
];

export default function Home() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [locMessage, setLocMessage] = useState("현재 위치 확인 중…");
  const [radius, setRadius] = useState(500);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [parkableOnly, setParkableOnly] = useState(false);
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
        setAllPlaces(data.places);
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

  const places = useMemo(
    () =>
      allPlaces.filter(
        (p) =>
          (filter === "all" || p.type === filter) &&
          (!parkableOnly || parkingLevel(p.parking.score) === "good"),
      ),
    [allPlaces, filter, parkableOnly],
  );

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

      <div className="flex gap-2 border-b px-4 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-1 rounded-lg px-3 py-3 text-base font-bold ${
              f.value === filter
                ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setParkableOnly((v) => !v)}
          aria-pressed={parkableOnly}
          className={`flex-1 rounded-lg px-3 py-3 text-base font-bold ${
            parkableOnly
              ? "bg-green-600 text-white"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          🅿️ 주차 가능
        </button>
      </div>

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
          주변 장소 {loading ? "검색 중…" : `${places.length}곳`}
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
                  <span className="font-semibold">
                    {p.type === "toilet" ? "🚻" : "🍴"} {p.name}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-500">
                    {p.distance}m
                  </span>
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-semibold">
                    {LEVEL_STYLE[parkingLevel(p.parking.score)].dot}{" "}
                    {LEVEL_STYLE[parkingLevel(p.parking.score)].label}
                  </span>
                  <span className="text-zinc-500">
                    {" "}
                    ·{" "}
                    {p.parking.score === null
                      ? "점수를 불러오지 못했어요"
                      : p.parking.reasons.join(", ") || "근처 주차장 정보 없음"}
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
