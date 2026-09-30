"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed, MapPin, X } from "lucide-react";
import BottomNav, { type Tab } from "@/components/BottomNav";
import FilterBar, { type Filter } from "@/components/FilterBar";
import PlaceCard, { reasonText } from "@/components/PlaceCard";
import PlaceDetail from "@/components/PlaceDetail";
import RadiusMenu, { radiusLabel } from "@/components/RadiusMenu";
import SettingsScreen from "@/components/SettingsScreen";
import { CategoryIcon, StatusPill, isOpen24h } from "@/components/ui";
import { parkingLevel } from "@/lib/parking";
import type { Place } from "@/types/place";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

// 위치 권한 거부 시 기본 위치: 서울 강남역
const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };

export default function Home() {
  const [tab, setTab] = useState<Tab>("map");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [locMessage, setLocMessage] = useState("현재 위치 확인 중…");
  const [radius, setRadius] = useState(500);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [parkableOnly, setParkableOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocMessage("위치 미지원 – 강남역 기준");
      return;
    }
    setLocMessage("현재 위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(true);
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocMessage("현재 위치 기준");
      },
      () => setLocMessage("위치 권한 없음 – 강남역 기준"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    // 마운트 시 한 번 현재 위치를 요청한다 (브라우저 API 라 마운트 후에만 가능)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    locate();
  }, [locate]);

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
  }, [center, radius, refreshKey]);

  const counts = useMemo(
    () => ({
      all: allPlaces.length,
      restaurant: allPlaces.filter((p) => p.type === "restaurant").length,
      toilet: allPlaces.filter((p) => p.type === "toilet").length,
      parkable: allPlaces.filter(
        (p) => parkingLevel(p.parking.score) === "good",
      ).length,
    }),
    [allPlaces],
  );

  const places = useMemo(
    () =>
      allPlaces.filter(
        (p) =>
          (filter === "all" || p.type === filter) &&
          (!parkableOnly || parkingLevel(p.parking.score) === "good"),
      ),
    [allPlaces, filter, parkableOnly],
  );

  const focused = places.find((p) => p.id === focusId) ?? null;
  // 하단 카드는 사용자가 마커를 직접 선택했을 때만 보인다 (자동 추천 없음)
  const card = focused;
  const detail = allPlaces.find((p) => p.id === detailId) ?? null;

  const changeRadius = (r: number) => {
    setLoading(true);
    setRadius(r);
  };

  const handleFocus = useCallback((id: string) => setFocusId(id), []);

  const closeCard = useCallback(() => setFocusId(null), []);

  const filterBar = (
    <FilterBar
      counts={counts}
      filter={filter}
      onFilter={setFilter}
      parkableOnly={parkableOnly}
      onParkableOnly={setParkableOnly}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      <main className="relative min-h-0 flex-1">
        {/* 지도는 목록 탭에서도 유지해 두고, 목록 화면이 위를 덮는다 */}
        <KakaoMap
          center={center}
          places={places}
          radius={radius}
          selectedId={focusId}
          onSelect={handleFocus}
          onMapMove={closeCard}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 pt-4">
          <div className="pointer-events-auto mx-4 flex h-14 items-center gap-3 rounded-2xl bg-surface pr-1.5 pl-4 shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
            <MapPin size={23} className="shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-muted">
                {locMessage}
              </p>
              <p className="truncate text-base font-extrabold">
                주변 장소{" "}
                {loading ? (
                  <span className="animate-pulse text-muted">검색 중…</span>
                ) : (
                  `${places.length}곳`
                )}
              </p>
            </div>
            <RadiusMenu radius={radius} onChange={changeRadius} />
          </div>
          <div className="pointer-events-auto">{filterBar}</div>
        </div>

        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-col items-end gap-3">
          <button
            onClick={locate}
            aria-label="내 위치로 이동"
            className="pointer-events-auto flex h-[52px] min-w-[52px] items-center justify-center rounded-2xl bg-raised shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
          >
            <LocateFixed size={22} aria-hidden />
          </button>
          {card ? (
            <div className="pointer-events-auto relative w-full rounded-[22px] bg-surface shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
              <button
                onClick={() => setDetailId(card.id)}
                className="flex w-full flex-col gap-3.5 p-4 text-left"
              >
                <div className="flex items-center gap-2 pr-11">
                  <CategoryIcon place={card} size={38} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-accent">선택한 장소</p>
                    <p className="truncate text-[22px] leading-tight font-extrabold">
                      {card.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill score={card.parking.score} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted">
                    {[card.category, isOpen24h(card) ? "24시간" : null]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · {reasonText(card)}
                  </p>
                  <p className="shrink-0 text-lg font-extrabold">
                    {card.distance}m
                  </p>
                </div>
              </button>
              <button
                onClick={closeCard}
                aria-label="장소 정보 닫기"
                className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-raised text-muted"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          ) : (
            !loading &&
            places.length === 0 && (
              <p className="pointer-events-auto w-full rounded-[22px] bg-surface p-4 text-center text-sm font-semibold text-muted shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
                조건에 맞는 장소가 없어요. 반경을 넓히거나 필터를 바꿔 보세요.
              </p>
            )
          )}
        </div>

        {tab === "list" && (
          <div className="absolute inset-0 z-20 flex flex-col bg-ink">
            <div className="flex h-[84px] shrink-0 items-center justify-between px-4 pt-2">
              <div>
                <h1 className="text-[30px] leading-tight">주변 장소</h1>
                <p className="text-sm font-semibold text-muted">
                  반경 {radiusLabel(radius)} ·{" "}
                  {loading ? "검색 중…" : `${places.length}곳`}
                </p>
              </div>
              <RadiusMenu radius={radius} onChange={changeRadius} />
            </div>
            <div className="shrink-0 py-1">{filterBar}</div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pt-2.5 pb-4">
              {error && (
                <p className="text-sm font-semibold text-bad">{error}</p>
              )}
              {!loading && !error && places.length === 0 && (
                <p className="py-10 text-center text-sm font-semibold text-muted">
                  조건에 맞는 장소가 없어요.
                  <br />
                  반경을 넓히거나 필터를 바꿔 보세요.
                </p>
              )}
              {places.map((p) => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  onClick={() => setDetailId(p.id)}
                />
              ))}
            </div>
          </div>
        )}
        {tab === "settings" && <SettingsScreen />}
      </main>

      <BottomNav tab={tab} onChange={setTab} />

      {detail && (
        <PlaceDetail
          key={detail.id}
          place={detail}
          onClose={() => setDetailId(null)}
          onReported={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
