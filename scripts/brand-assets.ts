// Builds every logo lockup and app icon from the two hand-drawn sources in
// public/brand (offisio-mark.svg, offisio-wordmark.svg). Re-run after editing them:
//   pnpm brand-assets
// sharp is not a direct dependency; it is resolved through next (which ships it for image optimization).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Minimal surface we use (sharp has no types reachable from the project root).
type Sharp = (input: Buffer, opts?: { density?: number }) => { resize(w: number, h: number): { png(): { toBuffer(): Promise<Buffer> } } };
const sharp: Sharp = createRequire(createRequire(join(process.cwd(), "package.json")).resolve("next"))("sharp");

const BOARD = "#D8D3C6";
const INK = "#211D17";
const SHEET = "#EFEAE0";
const brand = (f: string) => join("public", "brand", f);

const inner = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
const markSrc = readFileSync(brand("offisio-mark.svg"), "utf8");
const wordSrc = readFileSync(brand("offisio-wordmark.svg"), "utf8");
const mark = inner(markSrc);
const word = inner(wordSrc);
const reverse = (s: string) => s.replaceAll(INK, SHEET);

const svg = (w: number, h: number, body: string, bg?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Offisio">` +
  (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : "") + body + `</svg>\n`;

// Mark is 64x64; wordmark is 194x64 with its baseline at y=58, matching the mark's lower sheet.
const horizontal = (w: string) => svg(274, 64, `<g>${mark}</g><g transform="translate(80 0)">${w}</g>`);
const stacked = (w: string) => svg(194, 170, `<g transform="translate(49 0) scale(1.5)">${mark}</g><g transform="translate(0 106)">${w}</g>`);

const lockups: Record<string, string> = {
  "offisio-logo.svg": horizontal(word),
  "offisio-logo-reverse.svg": horizontal(reverse(word)),
  "offisio-logo-stacked.svg": stacked(word),
  "offisio-wordmark-reverse.svg": svg(194, 64, reverse(word)),
};
for (const [file, content] of Object.entries(lockups)) writeFileSync(brand(file), content);

// Square icon on the paste-gray board; `scale` is the share of the canvas the mark fills.
const tile = (size: number, scale: number) => {
  const m = size * scale;
  const o = (size - m) / 2;
  return svg(size, size, `<g transform="translate(${o} ${o}) scale(${m / 64})">${mark}</g>`, BOARD);
};
const png = (src: string, size: number) => sharp(Buffer.from(src), { density: 72 * Math.max(1, size / 64) }).resize(size, size).png().toBuffer();

// favicon.ico: PNG-compressed entries (supported by every current browser) at 16/32/48.
async function ico(sizes: number[]) {
  const images = await Promise.all(sizes.map((s) => png(markSrc, s)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s % 256, e);
    header.writeUInt8(s % 256, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

async function main() {
  writeFileSync(join("app", "icon.svg"), markSrc);
  writeFileSync(join("app", "favicon.ico"), await ico([16, 32, 48]));
  writeFileSync(join("app", "apple-icon.png"), await png(tile(180, 0.78), 180));
  writeFileSync(join("public", "icon-192.png"), await png(tile(192, 0.8), 192));
  writeFileSync(join("public", "icon-512.png"), await png(tile(512, 0.8), 512));
  // Maskable: keep the mark inside the 80% safe circle.
  writeFileSync(join("public", "icon-maskable-512.png"), await png(tile(512, 0.56), 512));

  // Open Graph card: stacked logo centred on the board.
  const og = svg(1200, 630, `<g transform="translate(406 145) scale(2)">${inner(lockups["offisio-logo-stacked.svg"])}</g>`, BOARD);
  writeFileSync(join("app", "opengraph-image.png"), await sharp(Buffer.from(og), { density: 144 }).resize(1200, 630).png().toBuffer());
  console.log("brand assets written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
