"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import {
  CONTACT_URL,
  LOCATION_CONSENT_ITEMS,
  SERVICE_NAME,
} from "@/lib/legal";

type Props = {
  onAgree: () => void;
  onDecline: () => void;
};

// 위치를 읽기 전에 보여 주는 동의 화면. 동의 버튼을 눌러야만 위치를 요청한다.
// 동의하지 않아도 강남역 기준으로 앱을 쓸 수 있다.
export default function LocationConsent({ onAgree, onDecline }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 break-keep"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col rounded-t-[24px] bg-surface shadow-[0_-12px_32px_rgba(0,0,0,0.35)]">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5">
          <div className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-accent">
            <MapPin size={22} aria-hidden />
          </div>
          <h2 id="consent-title" className="mt-3 text-[22px] leading-tight">
            위치정보 이용 동의
          </h2>
          <p className="mt-1.5 text-[15px] font-medium text-fg/90">
            {SERVICE_NAME}은 내 주변 식당·화장실을 찾으려고 현재 위치가
            필요해요. 아래 내용을 확인하고 동의해 주세요.
          </p>

          <dl className="mt-4 space-y-3">
            {LOCATION_CONSENT_ITEMS.map((item) => (
              <div key={item.label} className="rounded-xl bg-chip p-3">
                <dt className="text-xs font-extrabold text-muted">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-[14px] leading-relaxed text-fg">
                  {item.text}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-xs font-semibold text-muted">
            서비스: {SERVICE_NAME} · 문의:{" "}
            <a
              href={CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              GitHub
            </a>{" "}
            ·{" "}
            <Link href="/privacy" className="underline">
              개인정보·위치정보 안내 전체 보기
            </Link>
          </p>
          <div className="h-4" />
        </div>

        <div className="space-y-2 border-t border-line px-5 pt-3 pb-5">
          <button
            onClick={onAgree}
            className="h-14 w-full rounded-2xl bg-brand text-base font-extrabold text-on-brand"
          >
            동의하고 내 위치 사용
          </button>
          <button
            onClick={onDecline}
            className="h-12 w-full rounded-2xl bg-chip text-sm font-extrabold text-fg"
          >
            동의하지 않고 강남역 기준으로 보기
          </button>
        </div>
      </div>
    </div>
  );
}
