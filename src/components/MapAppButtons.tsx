"use client";

import { useState } from "react";
import {
  kakaoMapUrl,
  naverMapUrl,
  naverMapWebUrl,
  openMapApp,
  tmapUrl,
} from "@/lib/navigation";
import type { Place } from "@/types/place";

type Notice = { text: string; href?: string; linkLabel?: string };

const BUTTON =
  "flex min-h-14 min-w-0 items-center justify-center rounded-2xl bg-chip px-1 text-base font-extrabold whitespace-nowrap text-fg";

// 길안내는 직접 하지 않고, 목적지를 카카오맵·네이버 지도·T맵으로 넘긴다.
export default function MapAppButtons({ place }: { place: Place }) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const openNaver = () => {
    setNotice(null);
    openMapApp(naverMapUrl(place), () =>
      setNotice({
        text: "네이버 지도 앱이 열리지 않았어요. 앱이 설치된 휴대폰에서 열려요.",
        href: naverMapWebUrl(place),
        linkLabel: "웹에서 장소 검색하기",
      }),
    );
  };

  const openTmap = () => {
    setNotice(null);
    openMapApp(tmapUrl(place), () =>
      setNotice({
        text: "T맵 앱이 열리지 않았어요. 앱이 설치된 휴대폰에서 열려요.",
      }),
    );
  };

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-xs font-bold text-muted">
        지도 앱으로 열기 · 목적지가 자동으로 입력돼요
      </p>
      <div className="grid grid-cols-3 gap-2">
        <a
          href={kakaoMapUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className={BUTTON}
        >
          카카오맵
        </a>
        <button onClick={openNaver} className={BUTTON}>
          네이버 지도
        </button>
        <button onClick={openTmap} className={BUTTON}>
          T맵
        </button>
      </div>
      {notice && (
        <p role="status" className="mt-2 text-xs font-semibold text-bad">
          {notice.text}{" "}
          {notice.href && (
            <a
              href={notice.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {notice.linkLabel}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
