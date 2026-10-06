"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

// 화면을 그리다 오류가 나면 흰 화면 대신 안내와 다시 시도 버튼을 보여 주고, 오류를 기록한다.
// (이 Next.js 버전의 오류 화면은 reset 이 아니라 retry 를 받는다)
export default function Error({
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
    });
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
      <h1 className="text-xl font-extrabold text-fg">
        화면을 불러오지 못했어요
      </h1>
      <p className="text-sm font-medium text-muted">
        잠시 후 다시 시도해 주세요. 계속되면 앱을 완전히 닫았다가 다시 열어
        주세요.
      </p>
      <button
        onClick={() => retry()}
        className="h-12 rounded-2xl bg-brand px-6 text-base font-extrabold text-on-brand"
      >
        다시 시도
      </button>
    </main>
  );
}
