"use client";

import Link from "next/link";
import {
  ChevronRight,
  Moon,
  MonitorSmartphone,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";

const OPTIONS: {
  value: ThemePref;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    value: "system",
    label: "자동",
    description: "휴대폰의 화면 설정을 따라가요",
    icon: MonitorSmartphone,
  },
  {
    value: "light",
    label: "라이트",
    description: "밝은 화면. 햇빛이 강한 낮에 보기 편해요",
    icon: Sun,
  },
  {
    value: "dark",
    label: "다크",
    description: "어두운 화면. 밤 운행에 눈부심이 적어요",
    icon: Moon,
  },
];

export default function SettingsScreen() {
  const { pref, setPref } = useTheme();

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-ink">
      <div className="flex h-[84px] shrink-0 items-center px-4 pt-2">
        <h1 className="text-[30px] leading-tight">설정</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <section aria-labelledby="theme-heading">
          <h2 id="theme-heading" className="mb-2 text-sm font-bold text-muted">
            화면 테마
          </h2>
          <div role="radiogroup" className="space-y-2.5">
            {OPTIONS.map(({ value, label, description, icon: Icon }) => {
              const active = pref === value;
              return (
                <button
                  key={value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPref(value)}
                  className={`flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border p-4 text-left ${
                    active
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface"
                  }`}
                >
                  <div
                    className={`flex size-[46px] shrink-0 items-center justify-center rounded-[10px] ${
                      active ? "bg-brand text-on-brand" : "bg-chip text-muted"
                    }`}
                  >
                    <Icon size={24} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold text-fg">{label}</p>
                    <p className="text-sm font-medium text-muted">
                      {description}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? "border-accent" : "border-line"
                    }`}
                  >
                    {active && (
                      <span className="size-3 rounded-full bg-accent" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="info-heading" className="mt-6">
          <h2 id="info-heading" className="mb-2 text-sm font-bold text-muted">
            안내
          </h2>
          <Link
            href="/privacy"
            className="flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border border-line bg-surface p-4"
          >
            <div className="flex size-[46px] shrink-0 items-center justify-center rounded-[10px] bg-chip text-muted">
              <ShieldCheck size={24} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold text-fg">
                개인정보·위치정보 안내
              </p>
              <p className="text-sm font-medium text-muted">
                내 위치와 제보를 어떻게 쓰는지 알려 드려요
              </p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-faint" aria-hidden />
          </Link>
        </section>
      </div>
    </div>
  );
}
