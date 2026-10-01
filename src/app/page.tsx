"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed, MapPin, RefreshCw, X } from "lucide-react";
import BottomNav, { type Tab } from "@/components/BottomNav";
import FilterBar, { type Filter } from "@/components/FilterBar";
import PlaceCard, { reasonText } from "@/components/PlaceCard";
import PlaceDetail from "@/components/PlaceDetail";
import RadiusMenu, { radiusLabel } from "@/components/RadiusMenu";
import SettingsScreen from "@/components/SettingsScreen";
import {
  CategoryIcon,
  ErrorNotice,
  NoDataNotice,
  StatusPill,
  TruncationNotice,
  isOpen24h,
} from "@/components/ui";
import { distanceMeters } from "@/lib/geo";
import { parkingLevel } from "@/lib/parking";
import type { Place } from "@/types/place";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

// 위치 권한 거부 시 기본 위치: 서울 강남역
const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };

// API 응답의 식당 개수 정보 (카카오 검색 한도로 전부 받지 못할 수 있다)
type LatLng = { lat: number; lng: number };

// 지도를 옮긴 뒤 "이 위치에서 다시 검색" 버튼을 보여 주는 최소 이동 거리(m)
const SEARCH_HERE_MIN_METERS = 150;
// 내 위치와 검색 위치가 이 거리보다 멀면 "다른 곳을 검색 중"으로 본다
const ELSEWHERE_MIN_METERS = 100;

type RestaurantMeta = { total: number; shown: number; truncated: boolean };

function friendlyError(e: unknown): string {
  if (e instanceof TypeError) return "네트워크 연결을 확인해 주세요.";
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("429")) return "요청이 많아 잠시 후 다시 시도해 주세요.";
  return `장소를 불러오지 못했어요. (${msg})`;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("map");
  // 내 위치(권한 거부 시 강남역)와, 장소를 검색하는 기준 위치는 다를 수 있다.
  const [origin, setOrigin] = useState<LatLng>(DEFAULT_CENTER);
  const [searchCenter, setSearchCenter] = useState<LatLng>(DEFAULT_CENTER);
  // 지도를 끌어서 옮긴 뒤의 중심. 검색 위치와 충분히 멀면 다시 검색 버튼을 보여 준다.
  const [pendingCenter, setPendingCenter] = useState<LatLng | null>(null);
  const originRef = useRef<LatLng>(DEFAULT_CENTER);
  const searchRef = useRef<LatLng>(DEFAULT_CENTER);
  const [locMessage, setLocMessage] = useState("현재 위치 확인 중…");
  const [radius, setRadius] = useState(500);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [parkableOnly, setParkableOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurantMeta, setRestaurantMeta] = useState<RestaurantMeta | null>(
    null,
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // 검색 기준 위치를 옮긴다. 같은 위치면 다시 불러오지 않는다.
  const moveSearchTo = useCallback((point: LatLng) => {
    setPendingCenter(null);
    if (searchRef.current === point) return;
    searchRef.current = point;
    setLoading(true);
    setSearchCenter(point);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocMessage("위치 미지원 – 강남역 기준");
      moveSearchTo(originRef.current);
      return;
    }
    setLocMessage("현재 위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        originRef.current = here;
        setOrigin(here);
        moveSearchTo(here);
        setLocMessage("현재 위치 기준");
      },
      () => {
        setLocMessage("위치 권한 없음 – 강남역 기준");
        moveSearchTo(originRef.current);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [moveSearchTo]);

  useEffect(() => {
    // 마운트 시 한 번 현재 위치를 요청한다 (브라우저 API 라 마운트 후에만 가능)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    locate();
  }, [locate]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/places?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius=${radius}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "검색 실패");
        setAllPlaces(data.places);
        setRestaurantMeta(data.restaurants ?? null);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(friendlyError(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [searchCenter, radius, refreshKey]);

  // 종류 필터와 주차 가능 필터는 함께 적용된다(AND).
  // 각 버튼의 개수는 "그 버튼을 눌렀을 때 보이게 될 장소 수"라서, 다른 쪽 필터 조건을 반영한다.
  const matchesParkable = useCallback(
    (p: Place) => !parkableOnly || parkingLevel(p.parking.score) === "good",
    [parkableOnly],
  );

  const places = useMemo(
    () =>
      allPlaces.filter(
        (p) => (filter === "all" || p.type === filter) && matchesParkable(p),
      ),
    [allPlaces, filter, matchesParkable],
  );

  const counts = useMemo(
    () => ({
      all: allPlaces.filter(matchesParkable).length,
      restaurant: allPlaces.filter(
        (p) => p.type === "restaurant" && matchesParkable(p),
      ).length,
      toilet: allPlaces.filter((p) => p.type === "toilet" && matchesParkable(p))
        .length,
      parkable: allPlaces.filter(
        (p) =>
          (filter === "all" || p.type === filter) &&
          parkingLevel(p.parking.score) === "good",
      ).length,
    }),
    [allPlaces, filter, matchesParkable],
  );

  const focused = places.find((p) => p.id === focusId) ?? null;
  // 하단 카드는 사용자가 마커를 직접 선택했을 때만 보인다 (자동 추천 없음)
  const card = focused;
  const detail = allPlaces.find((p) => p.id === detailId) ?? null;

  const changeRadius = (r: number) => {
    setLoading(true);
    setRadius(r);
  };

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  // 식당을 일부만 받은 경우의 안내 (화장실만 보고 있을 때는 필요 없다)
  const showTruncation =
    !loading && filter !== "toilet" && !!restaurantMeta?.truncated;

  const handleFocus = useCallback((id: string) => setFocusId(id), []);

  const closeCard = useCallback(() => setFocusId(null), []);

  const handleMapMoved = useCallback((c: LatLng) => setPendingCenter(c), []);

  const showSearchHere =
    !!pendingCenter &&
    distanceMeters(pendingCenter, searchCenter) > SEARCH_HERE_MIN_METERS;

  const searchHere = () => {
    if (!pendingCenter) return;
    moveSearchTo(pendingCenter);
    setFocusId(null);
  };

  // 내 위치가 아닌, 지도에서 고른 곳을 검색 중인지
  const searchingElsewhere =
    distanceMeters(origin, searchCenter) > ELSEWHERE_MIN_METERS;

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
          center={searchCenter}
          myLocation={origin}
          places={places}
          radius={radius}
          selectedId={focusId}
          onSelect={handleFocus}
          onMapMove={closeCard}
          onMapMoved={handleMapMoved}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 pt-4">
          <div className="pointer-events-auto mx-4 flex h-14 items-center gap-3 rounded-2xl bg-surface pr-1.5 pl-4 shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
            <MapPin size={23} className="shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-muted">
                {searchingElsewhere ? "지도에서 고른 위치 기준" : locMessage}
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
          {!loading && error && (
            <div className="pointer-events-auto mx-4">
              <ErrorNotice
                message={error}
                hasPlaces={allPlaces.length > 0}
                onRetry={retry}
              />
            </div>
          )}
          {!loading && (
            <div className="pointer-events-auto mx-4">
              <NoDataNotice places={allPlaces} />
            </div>
          )}
          {showTruncation && restaurantMeta && (
            <div className="pointer-events-auto mx-4">
              <TruncationNotice
                total={restaurantMeta.total}
                shown={restaurantMeta.shown}
                radiusText={radiusLabel(radius)}
              />
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-col items-end gap-3">
          {showSearchHere && (
            <button
              onClick={searchHere}
              className="pointer-events-auto flex h-11 items-center gap-2 self-center rounded-full bg-brand px-4 text-sm font-extrabold text-on-brand shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
            >
              <RefreshCw size={16} aria-hidden />이 위치에서 다시 검색
            </button>
          )}
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
            !error &&
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
                  {searchingElsewhere && " · 지도에서 고른 위치 기준"}
                </p>
              </div>
              <RadiusMenu radius={radius} onChange={changeRadius} />
            </div>
            <div className="shrink-0 py-1">{filterBar}</div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pt-2.5 pb-4">
              {!loading && error && (
                <ErrorNotice
                  message={error}
                  hasPlaces={allPlaces.length > 0}
                  onRetry={retry}
                />
              )}
              {!loading && <NoDataNotice places={allPlaces} />}
              {showTruncation && restaurantMeta && (
                <TruncationNotice
                  total={restaurantMeta.total}
                  shown={restaurantMeta.shown}
                  radiusText={radiusLabel(radius)}
                />
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
          distanceFrom={searchingElsewhere ? "search" : "me"}
        />
      )}
    </div>
  );
}
