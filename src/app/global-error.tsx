"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

// 루트 레이아웃 자체가 깨졌을 때의 마지막 안전망. 레이아웃과 전역 스타일을 쓸 수 없어서
// 이 파일 안에서 <html>, <body> 와 최소한의 스타일을 직접 정의한다.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("render_error", error.message, {
      digest: error.digest,
      stack: error.stack?.slice(0, 1000),
      global: true,
    });
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>앱을 불러오지 못했어요</h1>
        <p style={{ fontSize: 14, margin: 0, color: "#6b7280" }}>
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={() => retry()}
          style={{
            height: 48,
            padding: "0 24px",
            border: 0,
            borderRadius: 16,
            background: "#fee500",
            color: "#191919",
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
