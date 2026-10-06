"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { LOCATION_CONSENT_VERSION } from "@/lib/legal";

// 위치정보 이용 동의 상태를 이 브라우저에 저장한다. (계정이 없어서 기기마다 따로 받는다)
//  loading: 아직 읽지 못함(서버 렌더링 중) / none: 아직 답하지 않았거나 동의 문구가 바뀌어 다시 받아야 함
//  granted: 동의함 / declined: 동의하지 않음 또는 철회함
export type ConsentStatus = "loading" | "none" | "granted" | "declined";

const STORAGE_KEY = "location-consent";
const ID_KEY = "location-consent-id";

type Stored = { version: string; status: "granted" | "declined"; at: string };

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function notify() {
  listeners.forEach((cb) => cb());
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function snapshot(): ConsentStatus {
  const stored = read();
  // 동의 문구(버전)가 바뀌었으면 이전 답은 무효이고 다시 받는다
  if (!stored || stored.version !== LOCATION_CONSENT_VERSION) return "none";
  return stored.status;
}

// 동의 기록을 특정 개인과 연결하지 않기 위해, 이 브라우저에서 만든 무작위 번호만 쓴다.
function consentId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function record(action: "granted" | "declined" | "withdrawn") {
  // 동의 기록 저장에 실패해도 사용자의 선택은 그대로 적용한다
  try {
    void fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentId: consentId(),
        version: LOCATION_CONSENT_VERSION,
        action,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 무시
  }
}

function save(status: "granted" | "declined") {
  const value: Stored = {
    version: LOCATION_CONSENT_VERSION,
    status,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰면 이번 방문에서만 유효하다
  }
  notify();
}

export function useLocationConsent() {
  const status = useSyncExternalStore<ConsentStatus>(
    subscribe,
    snapshot,
    () => "loading",
  );

  const grant = useCallback(() => {
    save("granted");
    record("granted");
  }, []);
  const decline = useCallback(() => {
    save("declined");
    record("declined");
  }, []);
  const withdraw = useCallback(() => {
    save("declined");
    record("withdrawn");
  }, []);

  return useMemo(
    () => ({ status, grant, decline, withdraw }),
    [status, grant, decline, withdraw],
  );
}
