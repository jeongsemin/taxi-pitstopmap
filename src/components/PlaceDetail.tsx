"use client";

import { useState } from "react";
import { REPORT_OPTIONS, submitReport, type ReportType } from "@/lib/reports";
import { LEVEL_STYLE, parkingLevel } from "@/lib/parking";
import { kakaoMapRouteUrl, tmapRouteUrl } from "@/lib/navigation";
import type { Place } from "@/types/place";

type Props = {
  place: Place;
  onClose: () => void;
  onReported: () => void;
};

export default function PlaceDetail({ place, onClose, onReported }: Props) {
  const [submitting, setSubmitting] = useState<ReportType | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const level = parkingLevel(place.parking.score);
  const style = LEVEL_STYLE[level];
  const { parking } = place;
  const { reports } = parking;
  const reportTotal = reports.parkable + reports.enforced + reports.full;

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

  return (
    <div
      role="dialog"
      aria-label={`${place.name} 상세`}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[65dvh] overflow-y-auto rounded-t-2xl border-t bg-white p-4 shadow-2xl dark:bg-zinc-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">
            {place.type === "toilet" ? "🚻" : "🍴"} {place.name}
          </h2>
          <p className="text-sm text-zinc-500">
            {place.category} · 현재 위치에서 {place.distance}m
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 rounded-lg bg-zinc-100 px-4 py-2 text-lg font-bold dark:bg-zinc-800"
        >
          ✕
        </button>
      </div>

      <div
        className="mt-3 rounded-xl p-3"
        style={{ backgroundColor: `${style.color}22` }}
      >
        <div className="text-lg font-bold">
          {style.dot} {style.label}
          {parking.score !== null && (
            <span className="ml-2 text-sm font-normal text-zinc-600 dark:text-zinc-400">
              {parking.score}점
            </span>
          )}
        </div>
        {parking.score === null ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            주정차 점수를 불러오지 못했어요.
          </p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm">
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
        <p className="mt-2 text-xs text-zinc-500">
          주변 주차장 위치로 추정한 값이며, 실제 단속 여부는 현장에서
          확인하세요.
        </p>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        {place.address && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-zinc-500">주소</dt>
            <dd>{place.address}</dd>
          </div>
        )}
        {(place.openHours || place.is24h) && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-zinc-500">이용시간</dt>
            <dd>
              {place.is24h && "🌙 24시간 "}
              {place.openHours &&
                place.openHours !== "24시간" &&
                place.openHours}
            </dd>
          </div>
        )}
        {place.phone && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-zinc-500">전화</dt>
            <dd>
              <a
                href={`tel:${place.phone}`}
                className="text-blue-600 underline"
              >
                {place.phone}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={kakaoMapRouteUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-yellow-400 px-3 py-4 text-center text-base font-bold text-black"
        >
          카카오맵 길찾기
        </a>
        <a
          href={tmapRouteUrl(place)}
          className="rounded-xl bg-blue-600 px-3 py-4 text-center text-base font-bold text-white"
        >
          T맵 길찾기
        </a>
      </div>
      <p className="mt-1 text-center text-xs text-zinc-500">
        T맵은 앱이 설치된 휴대폰에서만 열려요.
      </p>
      <section className="mt-5 border-t pt-4">
        <h3 className="text-base font-bold">여기에 차를 세워 보셨나요?</h3>
        <p className="text-xs text-zinc-500">
          {reportTotal > 0
            ? `최근 30일 제보 · 가능 ${reports.parkable} · 단속 ${reports.enforced} · 자리 없음 ${reports.full}`
            : "아직 제보가 없어요. 첫 제보를 남겨 주세요."}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {REPORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => handleReport(o.value)}
              disabled={submitting !== null}
              className={`min-h-14 rounded-xl px-1 text-sm font-bold disabled:opacity-50 ${o.className}`}
            >
              {submitting === o.value ? "전송 중…" : o.label}
            </button>
          ))}
        </div>
        {message && (
          <p
            role="status"
            className={`mt-2 text-sm font-semibold ${
              message.ok ? "text-green-700" : "text-red-600"
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
          className="mt-3 block text-center text-sm text-zinc-500 underline"
        >
          카카오맵에서 장소 정보 보기
        </a>
      )}
    </div>
  );
}
