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
import { kakaoMapRouteUrl, tmapRouteUrl } from "@/lib/navigation";
import { LEVEL_STYLE, parkingLevel } from "@/lib/parking";
import { REPORT_OPTIONS, submitReport, type ReportType } from "@/lib/reports";
import type { Place } from "@/types/place";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

type Props = {
  place: Place;
  onClose: () => void;
  onReported: () => void;
};

function openHoursText(place: Place) {
  if (isOpen24h(place)) return "24시간";
  return place.openHours ?? "정보 없음";
}

export default function PlaceDetail({ place, onClose, onReported }: Props) {
  const [submitting, setSubmitting] = useState<ReportType | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const { parking } = place;
  const level = parkingLevel(parking.score);
  const style = LEVEL_STYLE[level];
  const reportTotal =
    parking.reports.parkable + parking.reports.enforced + parking.reports.full;

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
      className="fixed inset-0 z-30 flex flex-col bg-ink"
    >
      <div className="relative h-[250px] shrink-0">
        <KakaoMap
          variant="detail"
          center={mapCenter}
          places={mapPlaces}
          selectedId={place.id}
          level={3}
        />
        <button
          onClick={onClose}
          aria-label="뒤로"
          className="absolute top-3.5 left-4 z-10 flex h-[52px] min-w-[52px] items-center justify-center rounded-2xl bg-raised shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
        >
          <ArrowLeft size={22} aria-hidden />
        </button>
        <div className="absolute bottom-3.5 left-4 z-10 flex items-center gap-[7px] rounded-full bg-surface px-3 py-2 text-sm font-extrabold shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
          <Navigation size={16} className="text-accent" aria-hidden />
          현재 위치에서 {place.distance}m
        </div>
      </div>

      <div className="-mt-1 flex min-h-0 flex-1 flex-col rounded-t-[22px] bg-surface">
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pt-5 pb-4">
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
                {parking.score === null
                  ? "주정차 점수를 불러오지 못했어요"
                  : "주정차 판단 근거"}
              </p>
              {parking.score !== null && (
                <ul className="mt-1 list-disc pl-4 text-sm text-fg/90">
                  {parking.reasons.length > 0 ? (
                    parking.reasons.map((r) => <li key={r}>{r}</li>)
                  ) : (
                    <li>근처 200m 안에 알려진 주차장이 없어요</li>
                  )}
                  {parking.nearestLotName && (
                    <li>
                      가장 가까운 주차장: {parking.nearestLotName}
                      {parking.nearestLotDistance !== null &&
                        ` (${parking.nearestLotDistance}m)`}
                    </li>
                  )}
                </ul>
              )}
              <p className="mt-2 text-xs font-semibold text-muted">
                주변 주차장 위치와 제보로 추정한 값이며, 실제 단속 여부는
                현장에서 확인하세요.
              </p>
            </div>
          </div>

          <section className="border-t border-line pt-4">
            <h3 className="text-base font-extrabold">
              여기에 차를 세워 보셨나요?
            </h3>
            <p className="text-xs font-semibold text-muted">
              {reportTotal > 0
                ? `최근 30일 제보 · 가능 ${parking.reports.parkable} · 단속 ${parking.reports.enforced} · 자리 없음 ${parking.reports.full}`
                : "아직 제보가 없어요. 첫 제보를 남겨 주세요."}
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
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

        <div className="flex shrink-0 items-start gap-2.5 border-t border-line px-5 pt-3 pb-4">
          {place.phone && (
            <a
              href={`tel:${place.phone}`}
              aria-label="전화 걸기"
              className="flex size-[60px] shrink-0 items-center justify-center rounded-2xl bg-chip"
            >
              <Phone size={24} aria-hidden />
            </a>
          )}
          <a
            href={tmapRouteUrl(place)}
            title="T맵 앱이 설치된 휴대폰에서만 열려요"
            className="flex h-[60px] shrink-0 items-center justify-center rounded-2xl bg-chip px-4 text-base font-extrabold"
          >
            T맵
          </a>
          <a
            href={kakaoMapRouteUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[60px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-brand text-lg font-extrabold whitespace-nowrap text-on-brand"
          >
            <Navigation size={24} aria-hidden />
            여기로 길안내
          </a>
        </div>
      </div>
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
