// Item art pipeline (src/ui/itemArt.tsx): one image per item name.
//   npm run art:list   writes art-src/item-art.csv (every image the game expects and its sheet)
//                      and art-src/sheet-prompts.md (one prompt per sheet), both committed;
//                      checks names are one per image and prints what is generated and built
//   npm run art:cut    cuts the generated sheets art-src/sheets/<sheet>.png into one image per
//                      item, art-src/cut/<key>.png, plus art-src/cut/preview.html to check them
//   npm run art:build  downsizes each item's master to src/assets/items/<key>.webp (128 px,
//                      for tiles and lists). A single image art-src/<key>.png (e.g. one item
//                      regenerated alone) wins over the sheet's cut.
//   npm run art:gen -- [sheet|key ...] [--force] [--cut] [--dry-run] [--model <id>] [--ref <sheet>]
//                      generates sheets through OpenRouter (OPENROUTER_API_KEY in .env;
//                      default model Nano Banana 2 Lite, google/gemini-3.1-flash-lite-image):
//                      no names = every sheet not generated yet; a sheet name = that sheet
//                      again; an item key (b-2-t5, u-3) = that item alone, into
//                      art-src/singles/, which art:cut turns into its art-src/<key>.png.
//                      Replaced images move to art-src/old/.
//                      --ref <sheet> (or ART_STYLE_REF in .env): send that finished sheet
//                      along, so the new ones match its style.
// art-src/ is not in git, apart from item-art.csv and sheet-prompts.md.
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';
import { BASE_LIST, base } from '../spacetimedb/src/data/bases';
import { MAX_TIER } from '../spacetimedb/src/data/stats';
import { RAIDS_BY_ID } from '../spacetimedb/src/data/raids';
import { UNIQUES } from '../spacetimedb/src/data/uniques';

const SRC = 'art-src';
const SHEETS = `${SRC}/sheets`;
const CUT = `${SRC}/cut`;
const SINGLES = `${SRC}/singles`;
const OUT = 'src/assets/items';
const SIZE = 128;
const MASTER_EXT = ['.png', '.webp', '.jpg', '.jpeg'];
const STYLE =
  'high-resolution pixel art RPG inventory icon, 32-bit era with a modern indie touch (like PlayStation / Saturn era ' +
  'sprites or modern HD pixel art games), fine pixel density with small pixels, about 64 to 96 pixels across each item, ' +
  'crisp hard-edged pixels with no blur, dark outline, rich saturated palette with smooth multi-step shading and ' +
  'subtle highlights that show the material (metal sheen, wood grain, leather texture, cut gems), lit from the top left, ' +
  'three-quarter view, bold readable silhouette, no magenta or hot pink in the item. ' +
  'Same orientation for every item: long items (swords, daggers, staves, wands, bows) diagonal at 45 degrees, ' +
  'handle at the bottom left and tip at the top right; all other items (armor, shields, tomes, rings, amulets) ' +
  'upright and facing the viewer. ' +
  'No glow, halo, aura, bloom, light rays, sparkles or particles anywhere, even on magical or holy items: ' +
  'show their power through material, color and gems inside the dark outline, and nothing outside the outline';
const BACKGROUND =
  'Solid flat magenta background (#FF00FF) everywhere, no gradient, no floor, no cast shadows, no frames or grid lines.';
const SHEET_RULES =
  'Each item whole and separate, well spaced, none touching or overlapping another or the image edge. ' +
  'No text, names, labels or numbers anywhere. ' +
  BACKGROUND;
const SINGLE_RULES = `The item whole, not touching the image edge. No text, no labels, no numbers. ${BACKGROUND}`;
const UNIQUES_PER_SHEET = 4;

interface Art { key: string; name: string; what: string; tier: number }
interface Sheet { name: string; layout: string; intro: string; arts: Art[] }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every image the game expects, keyed as itemArtKey() does, grouped into sheets. */
function sheets(): Sheet[] {
  const out: Sheet[] = [];
  const variants = new Map<number, Art[]>();
  for (const b of BASE_LIST) {
    if (b.typeId === b.id) {
      const arts = Array.from({ length: MAX_TIER }, (_, i) => ({ key: `b-${b.id}-t${i + 1}`, name: b.name(i + 1), what: b.family, tier: i + 1 }));
      out.push({
        name: slug(b.family),
        layout: '3 rows of 3',
        intro: `The same item type (${b.family}) in ${MAX_TIER} tiers, worst to best: each made of a finer material and more ornate than the one before, the same silhouette family throughout.`,
        arts,
      });
    } else {
      const raid = b.raidId !== undefined ? RAIDS_BY_ID.get(b.raidId) : undefined;
      const tier = raid?.tier ?? 1;
      const arts = variants.get(b.raidId ?? 0) ?? [];
      arts.push({ key: `b-${b.id}`, name: b.name(tier), what: `${b.family} variant, tier ${tier}`, tier });
      variants.set(b.raidId ?? 0, arts);
    }
  }
  for (const [raidId, arts] of variants) {
    const raid = RAIDS_BY_ID.get(raidId);
    out.push({
      name: `variants-${slug(raid?.name ?? `raid-${raidId}`)}`,
      layout: `2 rows (${Math.ceil(arts.length / 2)} on top, ${Math.floor(arts.length / 2)} below)`,
      intro: `Raid gear from ${raid?.name ?? `raid ${raidId}`}, one matching set with a shared theme.`,
      arts,
    });
  }
  const uniques = UNIQUES.map(u => ({ key: `u-${u.id}`, name: u.name, what: `unique ${base(u.baseId).name(u.tier)}`, tier: u.tier }));
  for (let i = 0; i < uniques.length; i += UNIQUES_PER_SHEET) {
    const arts = uniques.slice(i, i + UNIQUES_PER_SHEET);
    out.push({
      name: `uniques-${i / UNIQUES_PER_SHEET + 1}`,
      layout: arts.length > 2 ? `2 rows (${Math.ceil(arts.length / 2)} on top, ${Math.floor(arts.length / 2)} below)` : `1 row of ${arts.length}`,
      intro: 'Legendary one-of-a-kind items, each with a distinct look true to its name.',
      arts,
    });
  }
  return out;
}

const firstFile = (dir: string, key: string) => MASTER_EXT.map(e => join(dir, key + e)).find(existsSync);
/** An item's master: a single image beats the sheet's cut. */
const master = (key: string) => firstFile(SRC, key) ?? firstFile(CUT, key);
const csv = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** An item as the prompt names it: "Rusted Sword", "Sackcloth Hood (Cloth · Head)". */
const promptName = (a: Art) => (a.name.endsWith(a.what) ? a.name : `${a.name} (${a.what})`);

/** What one sheet holds: the part of its prompt no other sheet shares. */
function sheetSubject(s: Sheet): string {
  const items = s.arts.map((a, i) => `${i + 1}. ${promptName(a)}`).join('\n');
  return `A sheet of ${s.arts.length} game item icons in ${s.layout}, read left to right, top to bottom. ${s.intro}\n${items}`;
}

/** The part of every sheet's prompt that is the same. */
const SHEET_COMMON = `Style: ${STYLE}. ${SHEET_RULES}`;

const sheetPrompt = (s: Sheet) => `${sheetSubject(s)}\n${SHEET_COMMON}`;

function list() {
  const all = sheets();
  const arts = all.flatMap(s => s.arts);
  let bad = 0;
  // One image per name: two images sharing a name, or a variant whose name changes by tier, break the rule.
  const byName = new Map<string, string[]>();
  for (const a of arts) byName.set(a.name, [...(byName.get(a.name) ?? []), a.key]);
  for (const [name, keys] of byName) if (keys.length > 1) (bad++, console.log(`SAME NAME  ${name}: ${keys.join(', ')}`));
  for (const b of BASE_LIST) {
    if (b.typeId !== b.id && new Set(Array.from({ length: MAX_TIER }, (_, i) => b.name(i + 1))).size > 1)
      (bad++, console.log(`VARIANT NAME CHANGES BY TIER  b-${b.id}`));
  }
  // Both files are committed: they hold only what comes from the game data and the prompts,
  // never what this machine has generated (that is printed below instead).
  mkdirSync(SHEETS, { recursive: true });
  const rows = all.flatMap(s => s.arts.map(a => [a.key, a.name, a.what, a.tier, s.name].map(csv).join(',')));
  writeFileSync(join(SRC, 'item-art.csv'), ['key,name,what,tier,sheet', ...rows].join('\n') + '\n');
  const prompts = all.map(s => `## ${s.name}\nSave as: ${SHEETS}/${s.name}.png\n\n\`\`\`\n${sheetSubject(s)}\n\`\`\`\n`);
  writeFileSync(
    join(SRC, 'sheet-prompts.md'),
    `# Item art sheet prompts\n\n${all.length} sheets, ${arts.length} images. A sheet's prompt is its part below, then the ` +
      `common part on a new line (\`npm run art:gen\` sends both).\n\n## Common part\n\n\`\`\`\n${SHEET_COMMON}\n\`\`\`\n\n${prompts.join('\n')}`
  );

  // Progress on this machine: per started sheet, then the total.
  const built = (a: Art) => existsSync(join(OUT, `${a.key}.webp`));
  let done = 0;
  for (const s of all) {
    const n = s.arts.filter(built).length;
    const cut = s.arts.filter(a => !built(a) && master(a.key)).length;
    done += n;
    if (n || cut || firstFile(SHEETS, s.name))
      console.log(`${s.name.padEnd(22)} ${firstFile(SHEETS, s.name) ? 'sheet' : '-----'}  ${n}/${s.arts.length} built${cut ? `, ${cut} not built` : ''}`);
  }
  console.log(`${done}/${arts.length} images built in ${all.length} sheets; see ${SRC}/item-art.csv and ${SRC}/sheet-prompts.md`);
  if (bad) process.exit(1);
}

// ------------------------------------------------------------------ cut

/**
 * Magenta-ness of a pixel, whatever its brightness: how far red and blue both rise over green,
 * relative to the brightest channel. Pure magenta is 1, grey, silver and white are 0. Keyed on
 * this, the background goes whole even where the model shaded or speckled it darker, and a light
 * blade is never mistaken for background.
 */
const magenta = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  return max < KEY_DARK ? 0 : Math.max(0, Math.min(r, b) - g) / max;
};
/** Below this magenta-ness a pixel is item. */
const KEY_LO = 0.15;
/** At this share of the background's own magenta-ness a pixel is background. */
const KEY_HI = 0.8;
/** Pixels darker than this are item (the outline), whatever their tint. */
const KEY_DARK = 48;

interface Box { x0: number; y0: number; x1: number; y1: number; labels: Set<number> }

async function cutSheet(s: Sheet, file: string, outDir = CUT): Promise<boolean> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x: number, y: number) => (y * W + x) * 4;

  // Background: the corners' color (the magenta the prompt asks for).
  const corners = [px(2, 2), px(W - 3, 2), px(2, H - 3), px(W - 3, H - 3)];
  const bg = [0, 1, 2].map(c => corners.map(i => data[i + c]).sort((a, b) => a - b)[1]);

  // How much of each pixel is item, from its magenta-ness: 0 at the background's, 1 below KEY_LO.
  const hi = KEY_HI * magenta(bg[0], bg[1], bg[2]);
  const key = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    key[p] = Math.max(0, Math.min(1, 1 - (magenta(data[i], data[i + 1], data[i + 2]) - KEY_LO) / (hi - KEY_LO)));
  }
  // Only what joins the background without crossing an item pixel (the dark outline) is keyed:
  // inside the outline a purple gem or cloth stays solid.
  const edge = new Uint8Array(W * H);
  const queue: number[] = [];
  for (let p = 0; p < W * H; p++) if (key[p] === 0) (edge[p] = 1), queue.push(p);
  for (let k = 0; k < queue.length; k++) {
    const q = queue[k];
    const x = q % W, y = (q - x) / W;
    for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
      if (n >= 0 && !edge[n] && key[n] < 1) (edge[n] = 1), queue.push(n);
    }
  }
  /** 0 = background, 1 = item. */
  const alpha = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = edge[p] ? key[p] : 1;

  // Shapes: connected item pixels, then pieces close together merged into one item.
  const labels = new Int32Array(W * H);
  const boxes: Box[] = [];
  const small: Box[] = [];
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (labels[p] || alpha[p] < 0.5) continue;
    const label = boxes.length + small.length + 1;
    const box: Box = { x0: W, y0: H, x1: 0, y1: 0, labels: new Set([label]) };
    let area = 0;
    labels[p] = label;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W, y = (q - x) / W;
      area++;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
        if (n >= 0 && !labels[n] && alpha[n] >= 0.5) (labels[n] = label), stack.push(n);
      }
    }
    (area >= W * H * 0.0004 ? boxes : small).push(box);
  }
  // Small pieces (a floating gem, a spark) join the nearest item if close, else are noise.
  const near = Math.max(W, H) * 0.05;
  const dist = (a: Box, b: Box) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
  for (const piece of small) {
    const host = boxes.reduce<Box | undefined>((best, b) => (!best || dist(piece, b) < dist(piece, best) ? b : best), undefined);
    if (!host || dist(piece, host) > near) continue;
    host.x0 = Math.min(host.x0, piece.x0); host.y0 = Math.min(host.y0, piece.y0);
    host.x1 = Math.max(host.x1, piece.x1); host.y1 = Math.max(host.y1, piece.y1);
    for (const l of piece.labels) host.labels.add(l);
  }
  let items = boxes;
  const gap = Math.round(Math.max(W, H) * 0.015);
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < items.length && !merged; i++) {
      for (let j = i + 1; j < items.length && !merged; j++) {
        const a = items[i], b = items[j];
        if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
          items[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), labels: new Set([...a.labels, ...b.labels]) };
          items.splice(j, 1);
          merged = true;
        }
      }
    }
  }

  if (items.length !== s.arts.length) {
    const debug = `${SHEETS}/debug`;
    mkdirSync(debug, { recursive: true });
    const rects = items.map(b => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0 + 1}" height="${b.y1 - b.y0 + 1}" fill="none" stroke="#0f0" stroke-width="4"/>`).join('');
    await sharp(file).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`) }]).png().toFile(join(debug, `${s.name}.png`));
    console.log(`FAIL  ${s.name}: found ${items.length} items, expected ${s.arts.length} (boxes in ${debug}/${s.name}.png)`);
    return false;
  }

  // Reading order: rows by center height, then left to right.
  const cy = (b: Box) => (b.y0 + b.y1) / 2;
  const rowGap = [...items].map(b => b.y1 - b.y0).sort((a, b) => a - b)[items.length >> 1] / 2;
  items.sort((a, b) => cy(a) - cy(b));
  const rows: Box[][] = [];
  for (const b of items) {
    const row = rows[rows.length - 1];
    if (row && cy(b) - cy(row[0]) < rowGap) row.push(b);
    else rows.push([b]);
  }
  items = rows.flatMap(r => r.sort((a, b) => a.x0 - b.x0));

  // Each item: its own pixels only, background removed (and its tint taken back out of soft edges),
  // centered on a transparent square with some padding.
  mkdirSync(outDir, { recursive: true });
  for (const [n, b] of items.entries()) {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const side = Math.ceil(Math.max(w, h) / 0.84);
    const ox = (side - w) >> 1, oy = (side - h) >> 1;
    const out = Buffer.alloc(side * side * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (b.y0 + y) * W + b.x0 + x;
        if (labels[p] && !b.labels.has(labels[p])) continue; // a neighbor's pixels
        const a = alpha[p];
        if (a <= 0) continue;
        const i = p * 4, o = ((oy + y) * side + ox + x) * 4;
        // A keyed edge loses its magenta tint: red and blue down to green, at most.
        const spill = edge[p] ? Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1]) : 0;
        out[o] = data[i] - spill;
        out[o + 1] = data[i + 1];
        out[o + 2] = data[i + 2] - spill;
        out[o + 3] = Math.round(a * 255);
      }
    }
    await sharp(out, { raw: { width: side, height: side, channels: 4 } }).png().toFile(join(outDir, `${s.arts[n].key}.png`));
  }
  console.log(`ok    ${s.name}: ${items.length} items`);
  return true;
}

async function cut() {
  const all = sheets();
  let failed = 0;
  const cutSheets: Sheet[] = [];
  for (const s of all) {
    const file = firstFile(SHEETS, s.name);
    if (!file) continue;
    if (await cutSheet(s, file)) cutSheets.push(s);
    else failed++;
  }
  // Items generated alone: one-item sheets, cut into the single image that wins over the sheet's.
  const singles: Art[] = [];
  for (const a of all.flatMap(s => s.arts)) {
    const file = firstFile(SINGLES, a.key);
    if (!file) continue;
    if (await cutSheet({ name: a.key, layout: '', intro: '', arts: [a] }, file, SRC)) singles.push(a);
    else failed++;
  }
  // Preview: every cut item labeled, on a checkerboard, to check the order by eye before building.
  const cell = (a: Art, dir = '') => `<figure><img src="${dir}${a.key}.png"><figcaption>${a.name}<br><small>${a.key}</small></figcaption></figure>`;
  const cells = (s: Sheet) => s.arts.map(a => cell(a)).join('');
  mkdirSync(CUT, { recursive: true });
  writeFileSync(
    join(CUT, 'preview.html'),
    `<!doctype html><meta charset="utf-8"><title>Item art cuts</title><style>
body{font:13px system-ui;background:#1a1d24;color:#ddd;margin:16px}h2{margin:24px 0 8px}
.g{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:140px;text-align:center}
img{width:128px;height:128px;background:conic-gradient(#333 25%,#444 0 50%,#333 0 75%,#444 0) 0 0/16px 16px;border-radius:6px}
small{color:#888}</style>${singles.length ? `<h2>single items</h2><div class="g">${singles.map(a => cell(a, '../')).join('')}</div>` : ''}${cutSheets.map(s => `<h2>${s.name}</h2><div class="g">${cells(s)}</div>`).join('')}`
  );
  console.log(`${cutSheets.length} sheets and ${singles.length} single items cut, ${failed} failed; check the order in ${CUT}/preview.html, then npm run art:build`);
  if (failed) process.exit(1);
}

// ------------------------------------------------------------------ gen

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-image';
const API = 'https://openrouter.ai/api/v1';
const GEN_CONCURRENCY = 2;
const GEN_TRIES = 3;
/** Errors that retrying won't fix: bad request, wrong key, no credits, unknown model. */
const FATAL = /^HTTP 4(0[01234]|22)\b/;

function singlePrompt(a: Art): string {
  return `One game item icon: ${promptName(a)}, centered with about 10% padding on every side. Style: ${STYLE}. ${SINGLE_RULES}`;
}

interface Job {
  label: string;
  prompt: string;
  out: string;
  /** A finished sheet (data URL) whose style this image copies. */
  ref?: string;
}

const REF_RULES =
  'The attached image is a finished sheet from the same game: match its art style exactly (pixel size and density, ' +
  'outline, palette, shading, lighting, viewing angle, item size on the sheet, background). ' +
  'Do not copy its items: draw only the items listed below.';

/** The request options a model takes on OpenRouter's image endpoint (`supported_parameters`). */
async function imageOptions(model: string) {
  const res = await fetch(`${API}/images/models`);
  const m = ((await res.json())?.data ?? []).find((x: any) => x.id === model);
  if (!m) throw new Error(`${model} is not an image model on OpenRouter (see ${API}/images/models)`);
  const takes = (k: string, v: string) => m.supported_parameters?.[k]?.values?.includes(v);
  return {
    ...(takes('aspect_ratio', '1:1') && { aspect_ratio: '1:1' }),
    ...(takes('resolution', '1K') && { resolution: '1K' }),
  };
}

/** Generates one image into job.out (the old one moves to art-src/old/); returns its cost in USD. */
async function generate(job: Job, model: string, options: object, apiKey: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    let why: string;
    try {
      const res = await fetch(`${API}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'mmo-idle-rpg item art' },
        body: JSON.stringify({
          model,
          prompt: job.prompt,
          n: 1,
          ...options,
          ...(job.ref && { input_references: [{ type: 'image_url', image_url: { url: job.ref } }] }),
        }),
        signal: AbortSignal.timeout(300_000),
      });
      const body: any = await res.json().catch(() => ({}));
      const b64: string | undefined = body?.data?.[0]?.b64_json;
      if (res.ok && b64) {
        if (existsSync(job.out)) {
          mkdirSync(`${SRC}/old`, { recursive: true });
          renameSync(job.out, `${SRC}/old/${parse(job.out).name}-${Date.now()}.png`);
        }
        mkdirSync(parse(job.out).dir, { recursive: true });
        await sharp(Buffer.from(b64, 'base64')).png().toFile(job.out);
        return Number(body?.usage?.cost ?? 0);
      }
      why = res.ok ? 'no image in the reply' : `HTTP ${res.status} ${body?.error?.message ?? ''}`;
    } catch (e) {
      why = String(e); // network error or timeout
    }
    if (FATAL.test(why) || attempt >= GEN_TRIES) throw new Error(why);
    console.log(`retry ${job.label} (${why})`);
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
}

async function gen(args: string[]) {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };
  const model = opt('--model') ?? process.env.ART_MODEL ?? DEFAULT_MODEL;
  const force = flag('--force');
  const dry = flag('--dry-run');
  const thenCut = flag('--cut');
  const refName = opt('--ref') ?? process.env.ART_STYLE_REF;

  const all = sheets();
  const arts = new Map(all.flatMap(s => s.arts).map(a => [a.key, a]));
  const sheetJob = (s: Sheet): Job => ({ label: s.name, prompt: sheetPrompt(s), out: `${SHEETS}/${s.name}.png` });
  const jobs: Job[] = [];
  for (const name of args) {
    const sheet = all.find(s => s.name === name);
    const art = arts.get(name);
    if (sheet) jobs.push(sheetJob(sheet));
    else if (art) jobs.push({ label: art.key, prompt: singlePrompt(art), out: `${SINGLES}/${art.key}.png` });
    else throw new Error(`Unknown sheet or item key: ${name} (see ${SRC}/item-art.csv)`);
  }
  // No names: every sheet not generated yet (every sheet with --force).
  if (!args.length) for (const s of all) if (force || !firstFile(SHEETS, s.name)) jobs.push(sheetJob(s));

  // Style reference: a finished sheet sent along, so every sheet matches it (not to itself).
  if (refName && !all.some(s => s.name === refName)) throw new Error(`--ref ${refName}: not a sheet (see ${SRC}/sheet-prompts.md)`);
  const refFile = refName && firstFile(SHEETS, refName);
  if (refName && !refFile) throw new Error(`--ref ${refName}: no ${SHEETS}/${refName}.png yet`);
  const refUrl = refFile && `data:image/png;base64,${(await sharp(refFile).png().toBuffer()).toString('base64')}`;
  for (const j of jobs) {
    if (!refUrl || j.label === refName) continue;
    j.ref = refUrl;
    j.prompt = `${REF_RULES}\n${j.prompt}`;
  }

  const options = await imageOptions(model);
  console.log(`${jobs.length} images to generate with ${model} ${JSON.stringify(options)}${refFile ? `, in the style of ${refFile}` : ''}`);
  if (dry) {
    for (const j of jobs) console.log(`\n--- ${j.label} -> ${j.out}${j.ref ? ` (style of ${refFile})` : ''}\n${j.prompt}`);
    return;
  }
  if (!jobs.length) return;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY in .env');

  let cost = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const c = await generate(job, model, options, apiKey);
        cost += c;
        console.log(`ok    ${job.label} -> ${job.out}${c ? `  ($${c.toFixed(4)})` : ''}`);
      } catch (e) {
        failed++;
        const why = e instanceof Error ? e.message : String(e);
        console.log(`FAIL  ${job.label}: ${why}`);
        if (FATAL.test(why)) next = jobs.length; // the same for every job: stop
      }
    }
  };
  await Promise.all(Array.from({ length: GEN_CONCURRENCY }, worker));
  console.log(`${jobs.length - failed} generated, ${failed} failed${cost ? `, $${cost.toFixed(4)} spent` : ''}`);
  if (thenCut) await cut();
  if (failed) process.exit(1);
}

// ------------------------------------------------------------------ build

async function build() {
  mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const a of sheets().flatMap(s => s.arts)) {
    const file = master(a.key);
    if (!file) continue;
    await sharp(file)
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, alphaQuality: 90 })
      .toFile(join(OUT, `${a.key}.webp`));
    n++;
  }
  const known = new Set(sheets().flatMap(s => s.arts.map(a => a.key)));
  for (const file of existsSync(SRC) ? readdirSync(SRC) : []) {
    const { name, ext } = parse(file);
    if (MASTER_EXT.includes(ext.toLowerCase()) && !known.has(name)) console.log(`SKIP  ${file}: not an expected key (see ${SRC}/item-art.csv)`);
  }
  console.log(`${n} images built into ${OUT}`);
}

const cmd = process.argv[2];
if (cmd === 'list') list();
else if (cmd === 'cut') await cut();
else if (cmd === 'build') await build();
else if (cmd === 'gen') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env: the key may be in the environment
  }
  await gen(process.argv.slice(3));
} else {
  console.log('usage: tsx scripts/item-art.ts list|cut|build|gen');
  process.exit(1);
}
