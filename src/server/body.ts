import type { NextRequest } from "next/server";

/** Read a JSON body with a size cap. Returns undefined on error. */
export async function readJson(req: NextRequest, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return undefined;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
