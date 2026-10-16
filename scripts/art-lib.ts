// The art pipeline shared by item art (scripts/item-art.ts) and enemy art (scripts/enemy-art.ts).
// A set lists every image the game expects (key + prompt); this file generates them through
// OpenRouter onto a magenta background, cuts them off it and pixelizes them into the game's files:
//
//   list   writes <src>/<csv> (every image the game expects, committed), checks every entry has
//          its looks and prints progress per group
//   gen -- [group|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//          generates into <src>/raw/<key>.png (OPENROUTER_API_KEY in .env; default model
//          Nano Banana 2 Lite, google/gemini-3.1-flash-lite-image): no names = every entry with
//          neither a built image nor a raw one yet; a group or a key = those again. Replaced
//          images move to <src>/old/. --ref (or the set's env var): send those finished entries
//          along, so the new ones match their style.
//   cut    cuts each new raw image off its magenta background into the master <src>/<key>.png,
//          plus <src>/preview.html to compare them by group
//   build -- [group|key ...]
//          pixelizes each master into <out>/<key>.webp; names (like gen) build only those
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';

export interface Art { key: string; name: string; group: string; tier: number; subject: string }

export interface ArtSet {
  /** 'item art', 'enemy art': for messages and the preview page. */
  title: string;
  /** Work files (raw images, masters, preview): kept out of git, apart from the csv. */
  src: string;
  /** The committed list of every image the game expects, in src. */
  csv: string;
  /** Built images the game loads. */
  out: string;
  /** Pixel art grid: a master is pixelized onto pixels x pixels, then scaled up `scale` times with hard edges. */
  pixels: number;
  scale: number;
  /** Most colors in one image's palette. */
  colors: number;
  /** How much of the square the cut subject fills (the rest is padding). */
  fill: number;
  /** Every image the game expects; `missing` lists entries without a look. */
  arts(): { arts: Art[]; missing: string[] };
  /** The style and rules joined after every subject. */
  common: string;
  /** Sent before the prompt when style references go along. */
  refRules: string;
  /** Env var naming default style references. */
  refEnv: string;
  /** Extra checks for `list`: each string is a problem. */
  check?(all: Art[]): string[];
}

// ------------------------------------------------------------------ list

const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);
const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const groups = (all: Art[]) => [...new Set(all.map(a => a.group))].map(g => ({ name: g, arts: all.filter(a => a.group === g) }));

function paths(set: ArtSet) {
  const raw = join(set.src, 'raw');
  return {
    raw,
    master: (key: string) => join(set.src, `${key}.png`),
    rawOf: (key: string) => join(raw, `${key}.png`),
    built: (key: string) => join(set.out, `${key}.webp`),
  };
}

function list(set: ArtSet) {
  const { arts: all, missing } = set.arts();
  const p = paths(set);
  const problems = [...missing.map(m => `MISSING  ${m}`), ...(set.check?.(all) ?? [])];
  for (const m of problems) console.log(m);
  // Committed: it holds only what comes from the game data, never what this machine has
  // generated (that is printed below instead).
  mkdirSync(p.raw, { recursive: true });
  writeFileSync(join(set.src, set.csv), ['key,name,group,tier', ...all.map(a => [a.key, a.name, a.group, a.tier].map(csvCell).join(','))].join('\n') + '\n');

  // Progress on this machine: per started group, then the total.
  let done = 0;
  for (const g of groups(all)) {
    const n = g.arts.filter(a => existsSync(p.built(a.key))).length;
    const m = g.arts.filter(a => existsSync(p.master(a.key)) && mtime(p.master(a.key)) > mtime(p.built(a.key))).length;
    const r = g.arts.filter(a => existsSync(p.rawOf(a.key)) && mtime(p.rawOf(a.key)) > mtime(p.master(a.key))).length;
    done += n;
    if (n || m || r) console.log(`${g.name.padEnd(22)} ${n}/${g.arts.length} built${m ? `, ${m} cut not built` : ''}${r ? `, ${r} raw not cut` : ''}`);
  }
  console.log(`${done}/${all.length} images built in ${groups(all).length} groups; see ${join(set.src, set.csv)}`);
  if (problems.length) process.exit(1);
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
/** Below this magenta-ness a pixel is subject. */
const KEY_LO = 0.15;
/** At this share of the background's own magenta-ness a pixel is background. */
const KEY_HI = 0.8;
/** Pixels darker than this are subject (the outline), whatever their tint. */
const KEY_DARK = 48;

interface Box { x0: number; y0: number; x1: number; y1: number; area: number }

/** Cuts one generated image off its background into a transparent square master. */
async function cutOne(file: string, out: string, fill: number): Promise<boolean> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x: number, y: number) => (y * W + x) * 4;

  // Background: the corners' color (the magenta the prompt asks for).
  const corners = [px(2, 2), px(W - 3, 2), px(2, H - 3), px(W - 3, H - 3)];
  const bg = [0, 1, 2].map(c => corners.map(i => data[i + c]).sort((a, b) => a - b)[1]);

  // How much of each pixel is subject, from its magenta-ness: 0 at the background's, 1 below KEY_LO.
  const hi = KEY_HI * magenta(bg[0], bg[1], bg[2]);
  const key = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    key[p] = Math.max(0, Math.min(1, 1 - (magenta(data[i], data[i + 1], data[i + 2]) - KEY_LO) / (hi - KEY_LO)));
  }
  // Only what joins the background without crossing a subject pixel (the dark outline) is keyed:
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
  /** 0 = background, 1 = subject. */
  const alpha = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = edge[p] ? key[p] : 1;

  // Shapes: connected subject pixels. The subject is the big ones (a pair of boots is two) and the
  // small ones close to them (a floating gem); small ones far off are noise.
  const labels = new Int32Array(W * H);
  const shapes: Box[] = [];
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (labels[p] || alpha[p] < 0.5) continue;
    const box: Box = { x0: W, y0: H, x1: 0, y1: 0, area: 0 };
    shapes.push(box);
    labels[p] = shapes.length;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W, y = (q - x) / W;
      box.area++;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
        if (n >= 0 && !labels[n] && alpha[n] >= 0.5) (labels[n] = shapes.length), stack.push(n);
      }
    }
  }
  const big = shapes.filter(s => s.area >= W * H * 0.002);
  if (!big.length) {
    console.log(`FAIL  ${file}: nothing found on the background`);
    return false;
  }
  const kept = new Set<number>();
  const b = { x0: W, y0: H, x1: 0, y1: 0 };
  const near = Math.max(W, H) * 0.05;
  const dist = (s: Box) => Math.min(...big.map(h => Math.hypot(Math.max(0, s.x0 - h.x1, h.x0 - s.x1), Math.max(0, s.y0 - h.y1, h.y0 - s.y1))));
  for (const [i, s] of shapes.entries()) {
    if (!big.includes(s) && dist(s) > near) continue;
    kept.add(i + 1);
    b.x0 = Math.min(b.x0, s.x0); b.y0 = Math.min(b.y0, s.y0);
    b.x1 = Math.max(b.x1, s.x1); b.y1 = Math.max(b.y1, s.y1);
  }

  // Its own pixels only, background removed (and its tint taken back out of soft edges),
  // centered on a transparent square with some padding.
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const side = Math.ceil(Math.max(w, h) / fill);
  const ox = (side - w) >> 1, oy = (side - h) >> 1;
  const img = Buffer.alloc(side * side * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (b.y0 + y) * W + b.x0 + x;
      if (labels[p] && !kept.has(labels[p])) continue; // noise
      const a = alpha[p];
      if (a <= 0) continue;
      const i = p * 4, o = ((oy + y) * side + ox + x) * 4;
      // A keyed edge loses its magenta tint: red and blue down to green, at most.
      const spill = edge[p] ? Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1]) : 0;
      img[o] = data[i] - spill;
      img[o + 1] = data[i + 1];
      img[o + 2] = data[i + 2] - spill;
      img[o + 3] = Math.round(a * 255);
    }
  }
  await sharp(img, { raw: { width: side, height: side, channels: 4 } }).png().toFile(out);
  return true;
}

async function cut(set: ArtSet) {
  const all = set.arts().arts;
  const p = paths(set);
  let n = 0, failed = 0;
  // Every raw image newer than its master: a hand-edited master is kept until it is generated again.
  for (const a of all) {
    if (!existsSync(p.rawOf(a.key)) || mtime(p.rawOf(a.key)) <= mtime(p.master(a.key))) continue;
    if (await cutOne(p.rawOf(a.key), p.master(a.key), set.fill)) n++;
    else failed++;
  }
  // Preview: every entry with art, its new master or else its built image, by group on a checkerboard,
  // to check the entries of a group match before building.
  const toOut = join(...set.src.split('/').map(() => '..'), set.out).replace(/\\/g, '/');
  const cell = (a: Art) => {
    const src = existsSync(p.master(a.key)) ? `${a.key}.png` : existsSync(p.built(a.key)) ? `${toOut}/${a.key}.webp` : '';
    return src && `<figure><img src="${src}"><figcaption>${a.name}<br><small>${a.key}${src.endsWith('.png') ? '' : ' (built)'}</small></figcaption></figure>`;
  };
  const sections = groups(all).map(g => ({ name: g.name, cells: g.arts.map(cell).join('') })).filter(g => g.cells);
  writeFileSync(
    join(set.src, 'preview.html'),
    `<!doctype html><meta charset="utf-8"><title>${set.title}</title><style>
body{font:13px system-ui;background:#1a1d24;color:#ddd;margin:16px}h2{margin:24px 0 8px}
.g{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:140px;text-align:center}
img{width:128px;height:128px;image-rendering:pixelated;background:conic-gradient(#333 25%,#444 0 50%,#333 0 75%,#444 0) 0 0/16px 16px;border-radius:6px}
small{color:#888}</style>${sections.map(g => `<h2>${g.name}</h2><div class="g">${g.cells}</div>`).join('')}`
  );
  console.log(`${n} cut, ${failed} failed; check them in ${set.src}/preview.html, then build`);
  if (failed) process.exit(1);
}

// ------------------------------------------------------------------ gen

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-image';
const API = 'https://openrouter.ai/api/v1';
const GEN_CONCURRENCY = 4;
const GEN_TRIES = 3;
/** Errors that retrying won't fix: bad request, wrong key, no credits, unknown model. */
const FATAL = /^HTTP 4(0[01234]|22)\b/;

interface Job {
  label: string;
  prompt: string;
  out: string;
  /** Finished images (data URLs) whose style this image copies. */
  refs: string[];
}

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

/** Generates one image into job.out (the old one moves to <src>/old/); returns its cost in USD. */
async function generate(set: ArtSet, job: Job, model: string, options: object, apiKey: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    let why: string;
    try {
      const res = await fetch(`${API}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': `mmo-idle-rpg ${set.title}` },
        body: JSON.stringify({
          model,
          prompt: job.prompt,
          n: 1,
          ...options,
          ...(job.refs.length && { input_references: job.refs.map(url => ({ type: 'image_url', image_url: { url } })) }),
        }),
        signal: AbortSignal.timeout(300_000),
      });
      const body: any = await res.json().catch(() => ({}));
      const b64: string | undefined = body?.data?.[0]?.b64_json;
      if (res.ok && b64) {
        if (existsSync(job.out)) {
          mkdirSync(`${set.src}/old`, { recursive: true });
          renameSync(job.out, `${set.src}/old/${parse(job.out).name}-${Date.now()}.png`);
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

async function gen(set: ArtSet, args: string[]) {
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
  const dry = flag('--dry-run');
  const thenCut = flag('--cut');
  const refKeys = (opt('--ref') ?? process.env[set.refEnv] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const p = paths(set);

  const { arts: all, missing } = set.arts();
  if (missing.length) throw new Error(`Entries without a look, see list:\n${missing.join('\n')}`);
  const byKey = new Map(all.map(a => [a.key, a]));
  const picked = new Set<Art>();
  for (const name of args) {
    const group = all.filter(a => a.group === name);
    const art = byKey.get(name);
    if (!group.length && !art) throw new Error(`Unknown group or key: ${name} (see ${join(set.src, set.csv)})`);
    for (const a of art ? [art] : group) picked.add(a);
  }
  // No names: every entry with no art at all yet.
  if (!args.length) for (const a of all) if (!existsSync(p.built(a.key)) && !existsSync(p.rawOf(a.key))) picked.add(a);

  // Style references: finished images sent along, so every new one matches them (not to themselves).
  const refs: { key: string; url: string }[] = [];
  for (const key of refKeys) {
    if (!byKey.has(key)) throw new Error(`--ref ${key}: not a key (see ${join(set.src, set.csv)})`);
    const file = [p.master(key), p.rawOf(key), p.built(key)].find(existsSync);
    if (!file) throw new Error(`--ref ${key}: no art for it yet`);
    refs.push({ key, url: `data:image/png;base64,${(await sharp(file).png().toBuffer()).toString('base64')}` });
  }
  const prompt = (a: Art) => `${a.subject}\n${set.common}`;
  const jobs: Job[] = [...picked].map(a => {
    const own = refs.filter(r => r.key !== a.key);
    return { label: a.key, prompt: own.length ? `${set.refRules}\n${prompt(a)}` : prompt(a), out: p.rawOf(a.key), refs: own.map(r => r.url) };
  });

  if (dry) {
    console.log(`${jobs.length} images to generate with ${model}${refs.length ? `, in the style of ${refKeys.join(', ')}` : ''}`);
    for (const j of jobs) console.log(`\n--- ${j.label} -> ${j.out}${j.refs.length ? ` (${j.refs.length} style refs)` : ''}\n${j.prompt}`);
    return;
  }
  const options = await imageOptions(model);
  console.log(`${jobs.length} images to generate with ${model} ${JSON.stringify(options)}${refs.length ? `, in the style of ${refKeys.join(', ')}` : ''}`);
  if (!jobs.length) return;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY in .env');

  let cost = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const c = await generate(set, job, model, options, apiKey);
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
  if (thenCut) await cut(set);
  if (failed) process.exit(1);
}

// ------------------------------------------------------------------ build

/**
 * A master as real pixel art: averaged onto the set's grid, every pixel fully opaque or fully
 * clear, a dark outline of its own colors along the edge, a limited palette, then each pixel a
 * scale x scale block. Whatever the model drew, every image gets the same grid and outline.
 */
async function pixelize(set: ArtSet, file: string): Promise<Buffer> {
  const px = set.pixels;
  const s = await sharp(file).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < s.length; i += 4) s[i] = s[i] >= 128 ? 255 : 0;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < px && y < px && s[(y * px + x) * 4 + 3] > 0;
  const edge: number[] = [];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) if (on(x, y) && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1))) edge.push((y * px + x) * 4);
  }
  for (const i of edge) for (let c = 0; c < 3; c++) s[i + c] = Math.round(s[i + c] * 0.25 + 8);
  const quantized = await sharp(s, { raw: { width: px, height: px, channels: 4 } }).png({ palette: true, colors: set.colors, dither: 0 }).toBuffer();
  return sharp(quantized).resize(px * set.scale, px * set.scale, { kernel: 'nearest' }).webp({ lossless: true }).toBuffer();
}

/** `build` with names (groups or keys, like `gen`) only builds those. */
async function build(set: ArtSet, names: string[]) {
  mkdirSync(set.out, { recursive: true });
  const all = set.arts().arts;
  const p = paths(set);
  for (const name of names) {
    if (!all.some(a => a.group === name || a.key === name)) throw new Error(`Unknown group or key: ${name} (see ${join(set.src, set.csv)})`);
  }
  let n = 0;
  for (const a of all) {
    if (names.length && !names.includes(a.group) && !names.includes(a.key)) continue;
    if (!existsSync(p.master(a.key))) continue;
    writeFileSync(p.built(a.key), await pixelize(set, p.master(a.key)));
    n++;
  }
  const known = new Set(all.map(a => a.key));
  for (const file of existsSync(set.src) ? readdirSync(set.src) : []) {
    const { name, ext } = parse(file);
    if (ext.toLowerCase() === '.png' && !known.has(name)) console.log(`SKIP  ${file}: not an expected key (see ${join(set.src, set.csv)})`);
  }
  console.log(`${n} images built into ${set.out}`);
}

// ------------------------------------------------------------------ cli

/** Runs `list|cut|build|gen` on a set from the command line. */
export async function runArt(set: ArtSet, script: string) {
  const cmd = process.argv[2];
  if (cmd === 'list') list(set);
  else if (cmd === 'cut') await cut(set);
  else if (cmd === 'build') await build(set, process.argv.slice(3));
  else if (cmd === 'gen') {
    try {
      process.loadEnvFile('.env');
    } catch {
      // no .env: the key may be in the environment
    }
    await gen(set, process.argv.slice(3));
  } else {
    console.log(`usage: tsx ${script} list|cut|build|gen`);
    process.exit(1);
  }
}
