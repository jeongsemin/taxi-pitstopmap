import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function withExtension(base) {
  if (path.extname(base) && existsSync(base)) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // "next/server" -> node_modules/next/server.js (Next.js 는 확장자 없는 이름을 CJS 방식으로만 제공한다)
  if (specifier.startsWith("next/") && !path.extname(specifier)) {
    const file = path.join(root, "node_modules", `${specifier}.js`);
    if (existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
  }
  // "@/lib/foo" -> src/lib/foo.ts
  if (specifier.startsWith("@/")) {
    const file = withExtension(path.join(root, "src", specifier.slice(2)));
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  // "./foo" (확장자 없음) -> ./foo.ts, 쿼리 문자열(?tag)은 유지한다
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const [bare, query] = specifier.split("?");
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const file = withExtension(path.resolve(parent, bare));
    if (file && !existsSync(path.resolve(parent, bare + "")))
      return nextResolve(pathToFileURL(file).href + (query ? `?${query}` : ""), context);
  }
  return nextResolve(specifier, context);
}
