"use client";

import { createClient } from "@supabase/supabase-js";

// 브라우저 전용 클라이언트: 익명 로그인 세션을 localStorage 에 유지한다.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
