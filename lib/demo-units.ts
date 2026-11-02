// Seeded judge-demo listings: every unit in the database on 2026-11-02.
// Edits, renders and pipeline retries on these are previewed for the visitor
// only and never written, so judges can try the owner flow without anyone
// changing what others see. Other units save for real only for their signed-in
// owner (lib/owner editMode); this list stays as a hard guard on top of that.
import { cookies } from "next/headers";
import { PREVIEW_COOKIE, PREVIEW_MAX_CHARS, validateSpecsEdit, type Preview, type SpecsEdit } from "./specs-edit";

export const DEMO_UNIT_SLUGS: readonly string[] = [
  "full",
  "empty1",
  "empty2",
  "gen-zamalek",
  "gen-heliopolis",
  "gen-new-cairo",
  "gen-downtown",
  "gen-sheikh-zayed",
  "gen-alex-smouha",
  "gen-alex-chatby",
  "gen-alex-louran",
  "gen-october",
  "gen-nasr-city",
];

const DEMO = new Set(DEMO_UNIT_SLUGS);
export function isDemoUnit(slug: string): boolean {
  return DEMO.has(slug);
}

// Server-only: this visitor's previewed spec edits, when they are for this
// unit and the visitor is previewing it (editMode "preview"; the cookie holds
// one unit at a time), else null.
export async function readSpecsPreview(slug: string, mode: "owner" | "preview"): Promise<SpecsEdit | null> {
  if (mode !== "preview") return null;
  const p = decodePreview((await cookies()).get(PREVIEW_COOKIE)?.value);
  return p && p.slug === slug ? p.specs : null;
}

// Preview cookie codec (server-only: Buffer). Base64url JSON {slug, specs},
// re-validated on every read.
// Null when the encoded value would be too large to store.
export function encodePreview(p: Preview): string | null {
  const raw = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  return raw.length > PREVIEW_MAX_CHARS ? null : raw;
}
export function decodePreview(raw: string | undefined): Preview | null {
  if (!raw || raw.length > PREVIEW_MAX_CHARS) return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { slug?: unknown; specs?: unknown };
    if (typeof p?.slug !== "string") return null;
    const r = validateSpecsEdit(p.specs);
    return r.ok ? { slug: p.slug, specs: r.specs } : null;
  } catch {
    return null;
  }
}
