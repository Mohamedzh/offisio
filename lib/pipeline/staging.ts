// Use-driven staging (docs/RUBRIC.md, plan/06 6.6): render fit-out concepts
// only for uses the rubric passed, on the frame of the space it assigned to each
// role. Furnished spaces are emptied first. Every edit is cached by base-image
// bytes + prompt text, so re-runs cost nothing.
import { createHash } from "node:crypto";
import { meta, MODELS } from "../meta/client";
import { EMPTY_PROMPT_V1, STAGE_VERSION, stagePrompt, type UnitKind } from "../meta/prompts";
import { putPublic } from "../blob";
import { cached } from "./cache";
import { area, T, type Role, type Use, type UseVerdict } from "./rubric";
import type { Survey } from "./survey";
import { addMedia, retireStaged, keyframesOf, stagedOf } from "../db/store";

export interface StageJob { style: string; use: Use; role: Role; spaceId: string; frame: number; n: number }

// Which renders a unit should have, from its verdicts.
export function planStaging(survey: Survey, uses: UseVerdict[], only?: Use[]): StageJob[] {
  const space = (id?: string) => survey.spaces.find((s) => s.id === id);
  const jobs: StageJob[] = [];
  const add = (style: string, u: UseVerdict, role: Role, n: (a: number) => number) => {
    const s = space(u.roles[role]); if (!s || jobs.some((j) => j.style === style)) return;
    jobs.push({ style, use: u.use, role, spaceId: s.id, frame: s.best_frame, n: Math.max(1, n(area(s) ?? 0)) });
  };
  for (const u of uses.filter((x) => x.verdict !== "not_suitable" && (!only || only.includes(x.use)))) {
    if (u.use === "office") add("office", u, "room", (a) => Math.floor(a / T.deskComfortM2));
    if (u.use === "open_plan") add("open_plan", u, "room", (a) => Math.floor(a / T.deskComfortM2));
    if (u.use === "meeting") add("meeting", u, "room", (a) => Math.floor(a / T.seatClassroomM2));
    if (u.use === "clinic") {
      if (u.roles.waiting && u.roles.waiting === u.roles.exam) add("clinic_split", u, "exam", (a) => Math.floor(a / 4));
      else { add("clinic_waiting", u, "waiting", (a) => Math.floor(a / 1.5)); add("clinic_exam", u, "exam", () => 1); }
    }
    // A clinic is waiting + exam together (owner 2026-10-30); dental adds the prep lab.
    // The waiting render is shared by both (deduped by style above).
    if (u.use === "dental") {
      if (u.roles.waiting && u.roles.waiting === u.roles.exam) add("dental_split", u, "exam", (a) => Math.floor(a / 4));
      else { add("clinic_waiting", u, "waiting", (a) => Math.floor(a / 1.5)); add("dental_exam", u, "exam", () => 1); add("dental_prep", u, "prep", () => 1); }
    }
    if (u.use === "legal") add("legal_office", u, "office", () => 1);
  }
  return jobs;
}

async function bytesOf(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// One image edit -> Blob URL, cached by (base bytes, prompt).
async function edit(slug: string, style: string, baseUrl: string, prompt: string): Promise<string> {
  const base = await bytesOf(baseUrl);
  const res = await cached("stage", MODELS.image, STAGE_VERSION, [prompt, base], async () => {
    const out = await meta.imageEdit({ imagePath: baseUrl, prompt });
    const d = out.data?.[0];
    const img = d?.b64_json ? Buffer.from(d.b64_json, "base64") : d?.url ? await bytesOf(d.url) : null;
    if (!img) throw new Error("image edit returned no image");
    const ext = img.subarray(8, 12).toString("ascii") === "WEBP" ? "webp" : img[0] === 0x89 ? "png" : "jpg";
    const hash = createHash("sha256").update(img).digest("hex").slice(0, 10);
    return { url: await putPublic(`staged/${slug}/${style}-${hash}.${ext}`, img, `image/${ext === "jpg" ? "jpeg" : ext}`) };
  });
  return res.url;
}

// Render one job (emptying the space first for furnished units); replaces any current render of that style.
// A render is current when it is the same style, on the same space, at the current prompt version.
export const isCurrent = (m: { style: string; meta: Record<string, unknown> }, job: StageJob) =>
  m.style === job.style && m.meta.prompt === STAGE_VERSION && m.meta.space_id === job.spaceId;

export async function stageOne(unit: { id: string; slug: string; kind: UnitKind }, job: StageJob): Promise<string> {
  const frames = await keyframesOf(unit.id);
  const baseFrame = frames.find((f) => f.frame === job.frame)?.url;
  if (!baseFrame) throw new Error(`no keyframe ${job.frame} for ${unit.slug}`);
  let base = baseFrame;
  if (unit.kind === "furnished") {
    const existing = (await stagedOf(unit.id)).find((m) => m.style === "empty" && m.meta.space_id === job.spaceId);
    base = existing?.url ?? await edit(unit.slug, `empty-${job.spaceId}`, baseFrame, EMPTY_PROMPT_V1);
    if (!existing) await addMedia(unit.id, "staged", base, "empty", { space_id: job.spaceId, source_frame: job.frame });
  }
  const prompt = stagePrompt(job.style, unit.kind, job.n);
  if (!prompt) throw new Error(`no prompt for style ${job.style}`);
  const url = await edit(unit.slug, job.style, base, prompt);
  await retireStaged(unit.id, job.style);
  await addMedia(unit.id, "staged", url, job.style, { use: job.use, role: job.role, space_id: job.spaceId, source_frame: job.frame, n: job.n, prompt: STAGE_VERSION });
  return url;
}
