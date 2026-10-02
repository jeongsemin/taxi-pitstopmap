"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  Gauge,
  Navigation,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { StatusPill, isOpen24h } from "@/components/ui";
import MapAppButtons from "@/components/MapAppButtons";
import { LEVEL_STYLE, parkingLevel } from "@/lib/parking";
import { REPORT_OPTIONS, submitReport, type ReportType } from "@/lib/reports";
import type { Place } from "@/types/place";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

type Props = {
  place: Place;
  onClose: () => void;
  onReported: () => void;
  // 거리를 어디서부터 잰 값인지: 내 위치 / 지도에서 고른 검색 위치
  distanceFrom?: "me" | "search";
};

function openHoursText(place: Place) {
  if (isOpen24h(place)) return "24시간";
  return place.openHours ?? "정보 없음";
}

export default function PlaceDetail({
  place,
  onClose,
  onReported,
  distanceFrom = "me",
}: Props) {
  const [submitting, setSubmitting] = useState<ReportType | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const { parking } = place;
  const level = parkingLevel(parking.score);
  const style = LEVEL_STYLE[level];
  const { reports } = parking;
  const reportTotal =
    reports.store + reports.roadside + reports.enforced + reports.full;
  // 식당은 "가게", 화장실은 "시설"로 부른다
  const storeWord = place.type === "toilet" ? "시설" : "가게";

  const mapCenter = useMemo(
    () => ({ lat: place.lat, lng: place.lng }),
    [place.lat, place.lng],
  );
  const mapPlaces = useMemo(() => [place], [place]);

  const handleReport = async (type: ReportType) => {
    setSubmitting(type);
    setMessage(null);
    try {
      await submitReport(place, type);
      setMessage({ ok: true, text: "제보 감사합니다! 점수에 반영됐어요." });
      onReported();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSubmitting(null);
    }
  };

  const noteTone =
    level === "good"
      ? "bg-good/12"
      : level === "unsure"
        ? "bg-warn/12"
        : level === "hard"
          ? "bg-bad/12"
          : "bg-chip";

  return (
    <div
      role="dialog"
      aria-label={`${place.name} 상세`}
      className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-ink"
    >
      {/* 지도는 화면 높이에 맞춰 줄어든다 (낮은 화면에서도 정보가 들어갈 자리를 확보) */}
      <div className="relative h-[clamp(120px,24dvh,250px)] shrink-0">
        {/* 상세의 지도는 위치 확인용이라 움직이지 않게 해서 화면 스크롤과 겹치지 않게 한다 */}
        <div className="pointer-events-none h-full">
          <KakaoMap
            variant="detail"
            center={mapCenter}
            places={mapPlaces}
            selectedId={place.id}
            level={3}
          />
        </div>
        <button
          onClick={onClose}
          aria-label="뒤로"
          className="fixed top-3.5 left-4 z-40 flex size-[39px] items-center justify-center rounded-xl bg-raised shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
        >
          <ArrowLeft size={17} aria-hidden />
        </button>
        <div className="absolute bottom-3.5 left-4 z-10 flex items-center gap-[7px] rounded-full bg-surface px-3 py-2 text-sm font-extrabold shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
          <Navigation size={16} className="text-accent" aria-hidden />
          {distanceFrom === "search" ? "검색 위치" : "현재 위치"}에서{" "}
          {place.distance}m
        </div>
      </div>

      <div className="-mt-1 flex flex-1 flex-col rounded-t-[22px] bg-surface">
        <div className="space-y-4 px-5 pt-5 pb-4">
          <div className="flex flex-col items-start gap-2">
            <StatusPill score={parking.score} size="lg" />
            <h2 className="text-[26px] leading-tight text-fg">{place.name}</h2>
            <p className="text-sm font-medium text-muted">
              {[place.category, place.address].filter(Boolean).join(" · ")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Fact icon={Clock3} label="이용시간">
              <span className={isOpen24h(place) ? "text-good" : "text-fg"}>
                {openHoursText(place)}
              </span>
            </Fact>
            <Fact icon={Navigation} label="거리">
              {place.distance}m
            </Fact>
            <Fact icon={Gauge} label="점수">
              {parking.score === null ? (
                <span className="text-faint">없음</span>
              ) : (
                <span className={style.text}>{parking.score}점</span>
              )}
            </Fact>
          </div>

          <div className={`flex gap-3 rounded-2xl p-3.5 ${noteTone}`}>
            <div
              className={`flex size-[38px] shrink-0 items-center justify-center rounded-full bg-fg/10 ${style.text}`}
            >
              <ShieldCheck size={21} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-fg">
                {parking.score !== null
                  ? "주정차 판단 근거"
                  : parking.noData
                    ? "이 지역은 주정차 정보가 아직 없어요"
                    : "주정차 점수를 불러오지 못했어요"}
              </p>
              {parking.score === null && parking.noData && (
                <p className="mt-1 text-sm text-fg/90">
                  주차장 데이터가 있는 곳은 아직 서울뿐이에요. 이곳은
                  &quot;세울 수 없다&quot;는 뜻이 아니라 알 수 없다는 뜻이에요.
                  직접 세워 보셨다면 아래에서 제보해 주세요.
                </p>
              )}
              {parking.score !== null && (
                <div className="mt-2 space-y-2.5 text-sm text-fg/90">
                  <ParkingLine title="주차 자리 제공">
                    {storeParkingText(parking, reports.store, storeWord)}
                  </ParkingLine>
                  <ParkingLine title="도로변 주차">
                    {roadsideText(parking, reports)}
                  </ParkingLine>
                  {parking.nearestLotName && (
                    <p className="text-xs font-semibold text-muted">
                      참고 · 가장 가까운 주차장: {parking.nearestLotName}
                      {parking.nearestLotDistance !== null &&
                        ` (${parking.nearestLotDistance}m)`}
                    </p>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs font-semibold text-muted">
                주차장 위치·이름과 사용자 제보로 추정한 값이에요. 주차 자리를
                제공하는지, 그 도로에 세워도 되는지는 현장에서 확인하세요.
              </p>
            </div>
          </div>

          <section className="border-t border-line pt-4">
            <h3 className="text-base font-extrabold">
              여기에 차를 세워 보셨나요?
            </h3>
            <p className="text-xs font-semibold text-muted">
              {reportTotal > 0
                ? `최근 30일 제보 · 자리 제공 ${reports.store} · 도로변 ${reports.roadside} · 단속 ${reports.enforced} · 세울 곳 없음 ${reports.full}`
                : "아직 제보가 없어요. 첫 제보를 남겨 주세요."}
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {REPORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => handleReport(o.value)}
                  disabled={submitting !== null}
                  className={`min-h-14 rounded-2xl px-1 text-sm font-extrabold disabled:opacity-50 ${o.className}`}
                >
                  {submitting === o.value ? "전송 중…" : o.label}
                </button>
              ))}
            </div>
            {message && (
              <p
                role="status"
                className={`mt-2 text-sm font-bold ${
                  message.ok ? "text-good" : "text-bad"
                }`}
              >
                {message.text}
              </p>
            )}
          </section>

          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm font-semibold text-muted underline"
            >
              카카오맵에서 장소 정보 보기
            </a>
          )}
        </div>

        {/* 지도 앱 버튼: 화면 크기와 관계없이 항상 하단에 고정한다 (내용만 스크롤) */}
        <div className="sticky bottom-0 mt-auto flex items-end gap-2.5 border-t border-line bg-surface px-5 pt-2.5 pb-3">
          {place.phone && (
            <a
              href={`tel:${place.phone}`}
              aria-label="전화 걸기"
              className="flex size-[60px] shrink-0 items-center justify-center rounded-2xl bg-chip"
            >
              <Phone size={24} aria-hidden />
            </a>
          )}
          <MapAppButtons place={place} />
        </div>
      </div>
    </div>
  );
}

function storeParkingText(
  parking: Place["parking"],
  reported: number,
  storeWord: string,
) {
  const { kind, lotName } = parking.storeParking;
  if (kind === "reported") {
    return `주차 자리를 제공해요 (제공받았다는 제보 ${reported}명)`;
  }
  if (kind === "name_match") {
    return `주차 자리를 제공할 가능성이 높아요 (추정: ${lotName})`;
  }
  if (kind === "building") {
    return `같은 건물이거나 바로 옆에 주차장이 있어요 (추정: ${lotName}). 손님에게 자리를 내주는지는 확인이 필요해요.`;
  }
  return `주차 자리 제공 여부를 확인하지 못했어요. ${storeWord}에 문의해 보세요.`;
}

function roadsideText(
  parking: Place["parking"],
  reports: Place["parking"]["reports"],
) {
  const parts: string[] = [];
  if (parking.roadside) {
    parts.push(
      `근처에 도로변 노상주차장이 있어요 (${parking.roadside.name ?? "노상주차장"}, ${parking.roadside.distance}m)`,
    );
  }
  if (reports.roadside > 0) {
    parts.push(`도로변에 세웠다는 제보 ${reports.roadside}명`);
  }
  if (reports.enforced > 0) {
    parts.push(`단속됐다는 제보 ${reports.enforced}명`);
  }
  if (parts.length === 0) {
    return "확인된 정보가 없어요. 도로변은 단속될 수 있으니 주정차 표지판을 꼭 확인하세요.";
  }
  return parts.join(" · ");
}

function ParkingLine({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-extrabold text-muted">{title}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock3;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[10px] bg-chip p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-muted">
        <Icon size={16} aria-hidden />
        {label}
      </div>
      <p className="text-base font-extrabold text-fg">{children}</p>
    </div>
  );
}
