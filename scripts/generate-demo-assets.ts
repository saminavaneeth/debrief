/**
 * Generate the demo media under `public/demo-assets/` and the app icons under `public/icons/`.
 *
 *   npm run demo-assets
 *
 * Photos and video keyframes are SVG illustrations whose key elements are drawn inside the
 * bounding boxes of the fixture findings, so evidence regions line up with the picture. The
 * extinguisher checklist is a real PDF built from the fixture's document text (Phase 4 reads it
 * with pdfjs). Demo voice notes and the S5 video have no media file; the app plays the transcript
 * and the keyframes instead. Drop real files at the same paths to replace any of these.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { type BoundingBox, type ScenarioFixture, ScenarioFixture as FixtureSchema } from "@/domain";
import { dataPath, listFiles, readJson } from "@/lib/data-files";
import { encodePng, type Rgba, rasterize } from "./lib/png";

const OUT = dataPath("public", "demo-assets");
const ICONS = dataPath("public", "icons");

const fixtures = new Map<string, ScenarioFixture>(
  listFiles(dataPath("fixtures", "scenarios"), ".json").map((f) => {
    const fx = FixtureSchema.parse(readJson(f));
    return [fx.id, fx];
  }),
);

function write(rel: string, data: string | Uint8Array) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`  ${path.relative(dataPath(), file).replaceAll("\\", "/")}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Pixel rectangle for a normalized box. */
const px = (b: BoundingBox, w: number, h: number) => ({
  x: b.x * w,
  y: b.y * h,
  w: b.w * w,
  h: b.h * h,
  cx: (b.x + b.w / 2) * w,
  cy: (b.y + b.h / 2) * h,
});

function svg(w: number, h: number, body: string, caption: string) {
  const bar = Math.round(h * 0.045);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Segoe UI, Helvetica, Arial, sans-serif">
${body}
<rect x="0" y="${h - bar}" width="${w}" height="${bar}" fill="#0f172a" opacity="0.72"/>
<text x="${bar * 0.5}" y="${h - bar * 0.32}" font-size="${bar * 0.52}" fill="#f8fafc">Demo illustration · ${esc(caption)}</text>
</svg>
`;
}

function findings(fx: ScenarioFixture, artifactId: string) {
  const p = fx.perception[artifactId];
  if (!p || p.kind !== "image") throw new Error(`${artifactId} has no image perception`);
  return new Map(p.findings.map((f) => [f.label, f.box]));
}

/* ------------------------------------------------------------------ S1: cracked mirror on FL-07 */
function s1Mirror() {
  const fx = fixtures.get("S1")!;
  const art = fx.artifacts.find((a) => a.id === "S1-A2")!;
  const [w, h] = [art.media!.width!, art.media!.height!];
  const f = findings(fx, "S1-A2");
  const mirror = px(f.get("powered_industrial_trucks")!, w, h);
  const tag = px(f.get("asset_tag")!, w, h);
  const tagOut = px(f.get("tag_out")!, w, h);
  const cracks = [
    [0.5, 0.5, 0.12, 0.18],
    [0.5, 0.5, 0.86, 0.12],
    [0.5, 0.5, 0.92, 0.7],
    [0.5, 0.5, 0.3, 0.92],
    [0.5, 0.5, 0.08, 0.6],
  ]
    .map(([x1, y1, x2, y2]) => {
      const mx = mirror.x + mirror.w * ((x1 + x2) / 2 + 0.04);
      const my = mirror.y + mirror.h * ((y1 + y2) / 2 - 0.05);
      return `M${mirror.x + mirror.w * x1} ${mirror.y + mirror.h * y1} L${mx} ${my} L${mirror.x + mirror.w * x2} ${mirror.y + mirror.h * y2}`;
    })
    .join(" ");
  const body = `
<rect width="${w}" height="${h}" fill="#cbd5e1"/>
<rect y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="#94a3b8"/>
<rect y="${h * 0.8}" width="${w}" height="${h * 0.04}" fill="#facc15"/>
<rect x="${w * 0.05}" y="${h * 0.05}" width="${w * 0.4}" height="${h * 0.5}" fill="#e2e8f0" stroke="#64748b" stroke-width="6"/>
<text x="${w * 0.25}" y="${h * 0.32}" font-size="${h * 0.06}" text-anchor="middle" fill="#475569">DOOR 2</text>
<rect x="${w * 0.04}" y="${h * 0.42}" width="${w * 0.5}" height="${h * 0.36}" rx="30" fill="#f59e0b" stroke="#78350f" stroke-width="8"/>
<rect x="${w * 0.08}" y="${h * 0.22}" width="${w * 0.03}" height="${h * 0.56}" fill="#334155"/>
<rect x="${w * 0.46}" y="${h * 0.22}" width="${w * 0.03}" height="${h * 0.56}" fill="#334155"/>
<rect x="${w * 0.08}" y="${h * 0.2}" width="${w * 0.41}" height="${h * 0.03}" fill="#334155"/>
<circle cx="${w * 0.14}" cy="${h * 0.8}" r="${h * 0.07}" fill="#1e293b"/>
<circle cx="${w * 0.44}" cy="${h * 0.8}" r="${h * 0.07}" fill="#1e293b"/>
<line x1="${w * 0.49}" y1="${h * 0.26}" x2="${mirror.x}" y2="${mirror.cy}" stroke="#1e293b" stroke-width="14"/>
<rect x="${mirror.x}" y="${mirror.y}" width="${mirror.w}" height="${mirror.h}" rx="28" fill="#1e293b"/>
<rect x="${mirror.x + 16}" y="${mirror.y + 16}" width="${mirror.w - 32}" height="${mirror.h - 32}" rx="18" fill="#93c5fd"/>
<path d="${cracks}" stroke="#f8fafc" stroke-width="5" fill="none" stroke-linejoin="bevel"/>
<rect x="${tag.x}" y="${tag.y}" width="${tag.w}" height="${tag.h}" rx="6" fill="#f8fafc" stroke="#0f172a" stroke-width="4"/>
<text x="${tag.cx}" y="${tag.cy + tag.h * 0.22}" font-size="${tag.h * 0.62}" font-weight="700" text-anchor="middle" fill="#0f172a">FL-07</text>
<rect x="${tagOut.x}" y="${tagOut.y}" width="${tagOut.w}" height="${tagOut.h}" rx="6" fill="#dc2626"/>
<text x="${tagOut.cx}" y="${tagOut.y + tagOut.h * 0.4}" font-size="${tagOut.h * 0.17}" font-weight="700" text-anchor="middle" fill="#fff">DO NOT</text>
<text x="${tagOut.cx}" y="${tagOut.y + tagOut.h * 0.68}" font-size="${tagOut.h * 0.17}" font-weight="700" text-anchor="middle" fill="#fff">OPERATE</text>`;
  write("s1/mirror.svg", svg(w, h, body, "S1 · FL-07 right-side mirror, Dock 3"));
}

/* ------------------------------------------------------------------ S2: puddle by the ice machine */
function s2Puddle() {
  const fx = fixtures.get("S2")!;
  const art = fx.artifacts.find((a) => a.id === "S2-A2")!;
  const [w, h] = [art.media!.width!, art.media!.height!];
  const f = findings(fx, "S2-A2");
  const puddle = px(f.get("slips_trips")!, w, h);
  const trail = px(f.get("spills_releases")!, w, h);
  const tiles = Array.from(
    { length: 9 },
    (_, i) =>
      `<line x1="${(i * w) / 8}" y1="${h * 0.45}" x2="${(i * w) / 8 - w * 0.05}" y2="${h}" stroke="#d6d3d1" stroke-width="4"/>`,
  ).join("");
  const body = `
<rect width="${w}" height="${h}" fill="#e7e5e4"/>
<rect y="${h * 0.45}" width="${w}" height="${h * 0.55}" fill="#f5f5f4"/>
${tiles}
<rect x="${w * 0.35}" y="${h * 0.05}" width="${w * 0.3}" height="${h * 0.4}" rx="12" fill="#cbd5e1" stroke="#64748b" stroke-width="6"/>
<rect x="${w * 0.39}" y="${h * 0.1}" width="${w * 0.22}" height="${h * 0.12}" rx="8" fill="#94a3b8"/>
<rect x="${w * 0.46}" y="${h * 0.3}" width="${w * 0.08}" height="${h * 0.045}" rx="4" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
<text x="${w * 0.5}" y="${h * 0.335}" font-size="${h * 0.032}" font-weight="700" text-anchor="middle" fill="#0f172a">IM-01</text>
<path d="M${trail.cx} ${trail.y} C ${trail.cx + trail.w * 0.4} ${trail.cy}, ${trail.cx - trail.w * 0.4} ${trail.cy}, ${trail.cx} ${trail.y + trail.h}" stroke="#60a5fa" stroke-width="${trail.w * 0.18}" fill="none" opacity="0.6" stroke-linecap="round"/>
<ellipse cx="${puddle.cx}" cy="${puddle.cy}" rx="${puddle.w / 2}" ry="${puddle.h / 2.4}" fill="#93c5fd" opacity="0.55"/>
<ellipse cx="${puddle.cx - puddle.w * 0.1}" cy="${puddle.cy - puddle.h * 0.05}" rx="${puddle.w * 0.18}" ry="${puddle.h * 0.08}" fill="#eff6ff" opacity="0.7"/>`;
  write("s2/puddle.svg", svg(w, h, body, "S2 · water by ice machine IM-01, Break Room"));
}

/* ------------------------------------------------------------------ S3: paper sign-in sheet */
function s3SignIn() {
  const fx = fixtures.get("S3")!;
  const art = fx.artifacts.find((a) => a.id === "S3-A1")!;
  const [w, h] = [art.media!.width!, art.media!.height!];
  const doc = fx.perception["S3-A1"];
  if (doc.kind !== "document") throw new Error("S3-A1 must be a document");
  const lines = doc.text.split("\n");
  const header = lines.slice(0, 5);
  const rows = lines
    .slice(6)
    .map((l) => /^(\d+)\s+(.+?)\s{2,}(.+)$/.exec(l))
    .filter(Boolean) as RegExpExecArray[];
  const top = h * 0.36;
  const rowH = h * 0.065;
  const left = w * 0.1;
  const rowsSvg = rows
    .map(([, n, name, sig], i) => {
      const y = top + (i + 1) * rowH;
      return `<line x1="${left}" y1="${y}" x2="${w * 0.9}" y2="${y}" stroke="#94a3b8" stroke-width="3"/>
<text x="${left + 10}" y="${y - rowH * 0.25}" font-size="${rowH * 0.38}" fill="#334155">${n}</text>
<text x="${left + w * 0.08}" y="${y - rowH * 0.22}" font-size="${rowH * 0.5}" fill="#1d4ed8" font-family="Segoe Print, Bradley Hand, Comic Sans MS, cursive">${esc(name)}</text>
<text x="${w * 0.58}" y="${y - rowH * 0.2}" font-size="${rowH * 0.55}" fill="#1e3a8a" font-style="italic" font-family="Segoe Script, Brush Script MT, cursive">${esc(sig)}</text>`;
    })
    .join("\n");
  const body = `
<rect width="${w}" height="${h}" fill="#78716c"/>
<g transform="rotate(-1.6 ${w / 2} ${h / 2})">
<rect x="${w * 0.05}" y="${h * 0.04}" width="${w * 0.9}" height="${h * 0.9}" fill="#fffdf7" stroke="#d6d3d1" stroke-width="4"/>
<text x="${w / 2}" y="${h * 0.1}" font-size="${h * 0.026}" font-weight="700" text-anchor="middle" fill="#0f172a">${esc(header[0])}</text>
<text x="${w / 2}" y="${h * 0.14}" font-size="${h * 0.03}" font-weight="700" text-anchor="middle" fill="#0f172a">${esc(header[1])}</text>
${header
  .slice(2)
  .map(
    (l, i) =>
      `<text x="${left}" y="${h * (0.2 + i * 0.045)}" font-size="${h * 0.02}" fill="#0f172a">${esc(l)}</text>`,
  )
  .join("\n")}
<text x="${left + 10}" y="${top - 8}" font-size="${h * 0.017}" font-weight="700" fill="#475569">#</text>
<text x="${left + w * 0.08}" y="${top - 8}" font-size="${h * 0.017}" font-weight="700" fill="#475569">PRINT NAME</text>
<text x="${w * 0.58}" y="${top - 8}" font-size="${h * 0.017}" font-weight="700" fill="#475569">SIGNATURE</text>
<line x1="${left}" y1="${top}" x2="${w * 0.9}" y2="${top}" stroke="#334155" stroke-width="4"/>
${rowsSvg}
</g>`;
  write("s3/sign-in-sheet.svg", svg(w, h, body, "S3 · toolbox talk sign-in sheet"));
}

/* ------------------------------------------------------------------ S4: extinguisher photos + checklist PDF */
function extinguisher(cx: number, top: number, height: number) {
  const bw = height * 0.32;
  return `<rect x="${cx - bw / 2}" y="${top + height * 0.18}" width="${bw}" height="${height * 0.82}" rx="${bw * 0.4}" fill="#dc2626" stroke="#7f1d1d" stroke-width="6"/>
<rect x="${cx - bw * 0.18}" y="${top + height * 0.06}" width="${bw * 0.36}" height="${height * 0.14}" fill="#1f2937"/>
<path d="M${cx + bw * 0.18} ${top + height * 0.1} q ${bw * 0.6} 0 ${bw * 0.55} ${height * 0.35}" stroke="#111827" stroke-width="${bw * 0.08}" fill="none"/>`;
}

function s4Photos() {
  const fx = fixtures.get("S4")!;
  for (const [artifactId, file, tagLabel] of [
    ["S4-A2", "s4/fe-115-gauge.svg", "FE-115"],
    ["S4-A3", "s4/fe-119-blocked.svg", "FE-119"],
  ] as const) {
    const art = fx.artifacts.find((a) => a.id === artifactId)!;
    const [w, h] = [art.media!.width!, art.media!.height!];
    const f = findings(fx, artifactId);
    const main = px(f.get("fire_protection")!, w, h);
    const tag = px(f.get("asset_tag")!, w, h);
    let body = `<rect width="${w}" height="${h}" fill="#e2e8f0"/><rect y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="#a8a29e"/>`;
    if (artifactId === "S4-A2") {
      const r = Math.min(main.w, main.h) / 2;
      const arc = (a0: number, a1: number, color: string) => {
        const p = (a: number) =>
          `${main.cx + r * 0.8 * Math.cos(a)} ${main.cy + r * 0.8 * Math.sin(a)}`;
        return `<path d="M${p(a0)} A ${r * 0.8} ${r * 0.8} 0 0 1 ${p(a1)}" stroke="${color}" stroke-width="${r * 0.22}" fill="none"/>`;
      };
      const needle = Math.PI * 1.08;
      body += `${extinguisher(w / 2, h * 0.16, h * 0.62)}
<circle cx="${main.cx}" cy="${main.cy}" r="${r}" fill="#f8fafc" stroke="#111827" stroke-width="8"/>
${arc(Math.PI, Math.PI * 1.3, "#dc2626")}${arc(Math.PI * 1.3, Math.PI * 1.7, "#16a34a")}${arc(Math.PI * 1.7, Math.PI * 2, "#dc2626")}
<line x1="${main.cx}" y1="${main.cy}" x2="${main.cx + r * 0.75 * Math.cos(needle)}" y2="${main.cy + r * 0.75 * Math.sin(needle)}" stroke="#111827" stroke-width="8" stroke-linecap="round"/>
<circle cx="${main.cx}" cy="${main.cy}" r="${r * 0.08}" fill="#111827"/>`;
    } else {
      const pallet = (y: number) =>
        `<rect x="${main.x}" y="${y}" width="${main.w}" height="${main.h * 0.28}" fill="#d97706" opacity="0.85"/><rect x="${main.x}" y="${y + main.h * 0.28}" width="${main.w}" height="${main.h * 0.05}" fill="#92400e"/>`;
      body += `${extinguisher(w * 0.5, h * 0.22, h * 0.4)}
${pallet(main.y + main.h * 0.02)}${pallet(main.y + main.h * 0.34)}${pallet(main.y + main.h * 0.66)}
<rect x="${main.x}" y="${main.y}" width="${main.w}" height="${main.h}" fill="#e0f2fe" opacity="0.35" stroke="#bae6fd" stroke-width="4"/>`;
    }
    body += `<rect x="${tag.x}" y="${tag.y}" width="${tag.w}" height="${tag.h}" rx="6" fill="${artifactId === "S4-A3" ? "#dc2626" : "#f8fafc"}" stroke="#0f172a" stroke-width="4"/>
<text x="${tag.cx}" y="${tag.cy + tag.h * 0.2}" font-size="${Math.min(tag.h * 0.55, tag.w / (tagLabel.length * 0.68))}" font-weight="700" text-anchor="middle" fill="${artifactId === "S4-A3" ? "#fff" : "#0f172a"}">${tagLabel}</text>`;
    write(file, svg(w, h, body, `S4 · ${tagLabel}, Building A warehouse`));
  }
}

async function s4ChecklistPdf() {
  const fx = fixtures.get("S4")!;
  const doc = fx.perception["S4-A1"];
  if (doc.kind !== "document") throw new Error("S4-A1 must be a document");
  const lines = doc.text.split("\n");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Monthly portable fire extinguisher inspection — Building A");
  pdf.setAuthor("Cedar Valley Manufacturing");
  pdf.setCreationDate(new Date("2026-10-21T14:30:00-05:00"));
  pdf.setModificationDate(new Date("2026-10-21T14:30:00-05:00"));
  const page = pdf.addPage([792, 612]); // letter, landscape
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.09, 0.16);
  let y = 570;
  page.drawText(lines[0], { x: 40, y, size: 11, font: bold, color: ink });
  y -= 20;
  page.drawText(lines[1], { x: 40, y, size: 15, font: bold, color: ink });
  y -= 22;
  page.drawText(lines[2], { x: 40, y, size: 10, font, color: ink });
  y -= 28;

  const cols = [40, 100, 245, 300, 365, 430, 470, 525];
  const tableRows = lines.slice(3).filter((l) => l.includes(" | "));
  for (const [i, row] of tableRows.entries()) {
    const cells = row.split(" | ");
    const isHeader = i === 0;
    const failed = cells[6] === "FAIL";
    if (failed)
      page.drawRectangle({ x: 36, y: y - 5, width: 720, height: 18, color: rgb(1, 0.92, 0.92) });
    cells.forEach((cell, c) =>
      page.drawText(cell, {
        x: cols[c],
        y,
        size: 9.5,
        font: isHeader || (failed && c === 6) ? bold : font,
        color: ink,
      }),
    );
    page.drawLine({
      start: { x: 36, y: y - 6 },
      end: { x: 756, y: y - 6 },
      thickness: isHeader ? 1.2 : 0.4,
      color: rgb(0.6, 0.64, 0.7),
    });
    y -= 22;
  }
  y -= 10;
  for (const l of lines.slice(3).filter((x) => !x.includes(" | "))) {
    page.drawText(l, { x: 40, y, size: 10, font, color: ink });
    y -= 16;
  }
  write("s4/extinguisher-checklist.pdf", await pdf.save({ useObjectStreams: false }));
}

/* ------------------------------------------------------------------ S5: video keyframes */
function worker(x: number, y: number, hgt: number, lanyard: "free" | "none") {
  const u = hgt / 10;
  return `<circle cx="${x}" cy="${y + u * 0.9}" r="${u * 0.8}" fill="#fcd34d" stroke="#92400e" stroke-width="3"/>
<path d="M${x - u * 0.9} ${y + u * 0.6} a ${u * 0.9} ${u * 0.7} 0 0 1 ${u * 1.8} 0 z" fill="#f8fafc" stroke="#475569" stroke-width="3"/>
<rect x="${x - u * 1.2}" y="${y + u * 1.8}" width="${u * 2.4}" height="${u * 3.6}" rx="${u * 0.4}" fill="#84cc16"/>
<rect x="${x - u * 1.2}" y="${y + u * 3.1}" width="${u * 2.4}" height="${u * 0.35}" fill="#e5e7eb"/>
<rect x="${x - u * 1}" y="${y + u * 5.4}" width="${u * 0.8}" height="${u * 4.6}" fill="#1e3a8a"/>
<rect x="${x + u * 0.2}" y="${y + u * 5.4}" width="${u * 0.8}" height="${u * 4.6}" fill="#1e3a8a"/>
<path d="M${x - u * 1.2} ${y + u * 2} L${x + u * 1.2} ${y + u * 5}" stroke="#ea580c" stroke-width="${u * 0.3}" opacity="0.9"/>
<rect x="${x - u * 1.15}" y="${y + u * 3.75}" width="${u * 2.3}" height="${u * 0.8}" fill="#84cc16"/>
<text x="${x}" y="${y + u * 4.35}" font-size="${u * 0.4}" font-weight="700" text-anchor="middle" fill="#14532d">RIDGELINE</text>
${lanyard === "free" ? `<path d="M${x + u * 0.2} ${y + u * 2.2} q ${u * 1.8} ${u * 2.5} ${u * 0.8} ${u * 5}" stroke="#f97316" stroke-width="${u * 0.25}" fill="none"/><circle cx="${x + u * 1}" cy="${y + u * 7.2}" r="${u * 0.35}" fill="none" stroke="#6b7280" stroke-width="${u * 0.18}"/>` : ""}`;
}

function s5Keyframes() {
  const fx = fixtures.get("S5")!;
  const art = fx.artifacts.find((a) => a.id === "S5-A1")!;
  const [w, h] = [art.media!.width!, art.media!.height!];
  const video = fx.perception["S5-A1"];
  if (video.kind !== "video") throw new Error("S5-A1 must be a video");
  const scene = (extra: string) => `
<rect width="${w}" height="${h}" fill="#cbd5e1"/>
<rect x="0" y="${h * 0.05}" width="${w}" height="${h * 0.04}" fill="#64748b"/>
<rect x="${w * 0.08}" y="${h * 0.09}" width="${w * 0.02}" height="${h * 0.6}" fill="#64748b"/>
<rect x="${w * 0.9}" y="${h * 0.09}" width="${w * 0.02}" height="${h * 0.6}" fill="#64748b"/>
<rect x="0" y="${h * 0.7}" width="${w}" height="${h * 0.06}" fill="#57534e"/>
<rect x="0" y="${h * 0.76}" width="${w}" height="${h * 0.24}" fill="#e7e5e4"/>
<text x="${w * 0.5}" y="${h * 0.93}" font-size="${h * 0.035}" text-anchor="middle" fill="#78716c">floor below · approx. 12 ft</text>
<rect x="0" y="${h * 0.6}" width="${w * 0.32}" height="${h * 0.012}" fill="#facc15"/>
<rect x="${w * 0.02}" y="${h * 0.48}" width="${w * 0.01}" height="${h * 0.12}" fill="#facc15"/>
<rect x="${w * 0.3}" y="${h * 0.48}" width="${w * 0.01}" height="${h * 0.12}" fill="#facc15"/>
${extra}`;
  for (const kf of video.keyframes) {
    const f = kf.findings[0];
    const b = px(f.box, w, h);
    let extra = "";
    if (kf.atMs === 0) extra = worker(b.cx, b.y, b.h * 0.95, "free");
    if (kf.atMs === 4000) extra = worker(b.cx - b.w * 0.2, b.y - b.h * 0.25, b.h * 2.4, "free");
    if (kf.atMs === 9000) extra = worker(b.cx, b.y - b.h * 1.4, b.h * 6, "none");
    if (kf.atMs === 14000) {
      extra = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h * 0.25}" fill="#57534e"/>
<text x="${b.cx}" y="${b.y + b.h * 0.6}" font-size="${h * 0.04}" text-anchor="middle" fill="#7f1d1d" font-weight="700">no guardrail on this section</text>
${worker(w * 0.62, h * 0.2, h * 0.5, "free")}`;
    }
    write(
      kf.uri.replace("/demo-assets/", ""),
      svg(
        w,
        h,
        scene(extra),
        `S5 · keyframe ${(kf.atMs / 1000).toFixed(0)} s · mezzanine east edge`,
      ),
    );
  }
}

/* ------------------------------------------------------------------ S6: oil sheen under V-22 */
function s6Sheen() {
  const fx = fixtures.get("S6")!;
  const art = fx.artifacts.find((a) => a.id === "S6-A2")!;
  const [w, h] = [art.media!.width!, art.media!.height!];
  const f = new Map(
    (
      fx.perception["S6-A2"] as Extract<ScenarioFixture["perception"][string], { kind: "image" }>
    ).findings.map((x) => [x.id, x.box]),
  );
  const sheen = px(f.get("S6-A2-F1")!, w, h);
  const drip = px(f.get("S6-A2-F2")!, w, h);
  const tag = px(f.get("S6-A2-F3")!, w, h);
  const body = `
<defs><linearGradient id="sheen" x1="0" x2="1" y1="0" y2="1">
<stop offset="0" stop-color="#a78bfa" stop-opacity="0.55"/><stop offset="0.3" stop-color="#60a5fa" stop-opacity="0.45"/>
<stop offset="0.55" stop-color="#34d399" stop-opacity="0.45"/><stop offset="0.8" stop-color="#fbbf24" stop-opacity="0.5"/>
<stop offset="1" stop-color="#f472b6" stop-opacity="0.45"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="#9ca3af"/>
<rect y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="#78716c"/>
<rect x="0" y="${h * 0.28}" width="${w}" height="${h * 0.08}" fill="#475569"/>
<rect x="${drip.cx - w * 0.06}" y="${h * 0.22}" width="${w * 0.12}" height="${h * 0.2}" rx="14" fill="#1e3a8a" stroke="#0f172a" stroke-width="6"/>
<rect x="${drip.cx - w * 0.01}" y="${h * 0.12}" width="${w * 0.02}" height="${h * 0.1}" fill="#0f172a"/>
<ellipse cx="${drip.cx}" cy="${h * 0.12}" rx="${w * 0.07}" ry="${h * 0.02}" fill="#dc2626"/>
<path d="M${drip.cx} ${drip.y + drip.h * 0.4} q ${drip.w * 0.2} ${drip.h * 0.4} 0 ${drip.h * 0.6} q ${-drip.w * 0.2} ${-drip.h * 0.2} 0 ${-drip.h * 0.6}" fill="#713f12"/>
<ellipse cx="${sheen.cx}" cy="${sheen.cy}" rx="${sheen.w / 2}" ry="${sheen.h / 2.3}" fill="url(#sheen)"/>
<rect x="${tag.x}" y="${tag.y}" width="${tag.w}" height="${tag.h}" rx="5" fill="#fde047" stroke="#0f172a" stroke-width="4"/>
<text x="${tag.cx}" y="${tag.cy + tag.h * 0.22}" font-size="${tag.h * 0.6}" font-weight="700" text-anchor="middle" fill="#0f172a">V-22</text>`;
  write("s6/v22-sheen.svg", svg(w, h, body, "S6 · oil sheen under V-22, Tank Row"));
}

/* ------------------------------------------------------------------ app icons */
function icons() {
  const SLATE: Rgba = [15, 23, 42, 255];
  const WHITE: Rgba = [248, 250, 252, 255];
  const AMBER: Rgba = [245, 158, 11, 255];
  const roundRect = (
    u: number,
    v: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
  ) => {
    const qx = Math.max(x0 + r - u, 0, u - (x1 - r));
    const qy = Math.max(y0 + r - v, 0, v - (y1 - r));
    return Math.hypot(qx, qy) <= r;
  };
  const segment = (
    u: number,
    v: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    t: number,
  ) => {
    const [dx, dy] = [bx - ax, by - ay];
    const k = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(u - (ax + k * dx), v - (ay + k * dy)) <= t;
  };
  /** Clipboard with a check mark; `inset` shrinks the artwork into the maskable safe zone. */
  const shade =
    (full: boolean, inset: number) =>
    (u0: number, v0: number): Rgba | null => {
      const u = (u0 - 0.5) / inset + 0.5;
      const v = (v0 - 0.5) / inset + 0.5;
      const bg = full || roundRect(u0, v0, 0, 0, 1, 1, 0.2);
      if (!bg) return null;
      if (roundRect(u, v, 0.38, 0.12, 0.62, 0.24, 0.04)) return AMBER;
      if (roundRect(u, v, 0.22, 0.17, 0.78, 0.88, 0.07)) {
        if (
          segment(u, v, 0.33, 0.56, 0.46, 0.69, 0.045) ||
          segment(u, v, 0.46, 0.69, 0.68, 0.4, 0.045)
        )
          return AMBER;
        return WHITE;
      }
      return SLATE;
    };
  fs.mkdirSync(ICONS, { recursive: true });
  const out: [string, number, boolean, number][] = [
    ["icon-192.png", 192, false, 0.9],
    ["icon-512.png", 512, false, 0.9],
    ["maskable-512.png", 512, true, 0.72],
    ["apple-touch-icon.png", 180, true, 0.8],
  ];
  for (const [name, size, full, inset] of out) {
    fs.writeFileSync(
      path.join(ICONS, name),
      encodePng(size, size, rasterize(size, shade(full, inset))),
    );
    console.log(`  public/icons/${name}`);
  }
}

async function main() {
  console.log("Generating demo assets");
  s1Mirror();
  s2Puddle();
  s3SignIn();
  s4Photos();
  await s4ChecklistPdf();
  s5Keyframes();
  s6Sheen();
  icons();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
