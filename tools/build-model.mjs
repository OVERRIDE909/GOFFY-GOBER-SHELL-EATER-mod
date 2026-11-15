// Builds the model data embedded in shell-goose-mod.user.js.
//
//   cd tools && npm install
//   node build-model.mjs <model.glb> goose   [triangles]   # turkey-face egg replacement
//   node build-model.mjs <model.glb> grenade [triangles]   # grenade replacement
//
// (.usdz models: convert first with `python usd_to_glb.py model.usdz model.glb`)
//
// What it does:
//  1. loads the .glb, drops normals/UVs (recomputed in-game) and welds shared vertices
//  2. simplifies it (meshoptimizer) down to ~triangles so it can't lag the game. Each part
//     is simplified on its own: small parts (eyes...) are left untouched, and colour edges
//     (like a pupil on an eyeball) are kept sharp.
//  3. converts glTF (right-handed) -> Babylon (left-handed), stands it on y=0, centres it,
//     and scales it to the target height
//  4. colours: "goose" tags each vertex with a colour slot from its material name
//     (body/feet/beak/eyes -> CONFIG.gooseColors); "grenade" keeps the model's own
//     vertex colours (COLOR_0, e.g. baked from textures by usd_to_glb.py)
//  5. writes the compressed data between that target's markers in the userscript
import { NodeIO } from '@gltf-transform/core';
import { weld, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = {
  // in the source goose one eye is buried inside the head, so slide eyes out onto the surface
  goose: { marker: 'MODEL', height: 1.35, tris: 4000, colours: 'slots' },
  grenade: { marker: 'GRENADE', height: 1.0, tris: 3000, colours: 'rgb' },
};
const KEEP_SMALL_PARTS = 400; // parts with fewer triangles than this are never simplified
const MIN_PART_TRIS = 150;    // never squash a part below this
const SLOTS = ['body', 'feet', 'beak', 'eyes']; // same order as CONFIG.gooseColors

const here = path.dirname(fileURLToPath(import.meta.url));
const [SRC, targetName = 'goose', trisArg] = process.argv.slice(2);
const T = TARGETS[targetName];
if (!SRC || !T) {
  console.error('usage: node build-model.mjs <model.glb> <goose|grenade> [triangles]');
  process.exit(1);
}
const TARGET_TRIS = Number(trisArg || T.tris);
const USERSCRIPT = path.join(here, '../shell-goose-mod.user.js');

const io = new NodeIO();
const doc = await io.read(SRC);
const before = countTris(doc);

// Remember each vertex's colour by exact position. Simplification only ever keeps
// original vertices, so colours can be looked up again afterwards. Then drop every
// attribute except POSITION so seams don't block welding/simplifying.
const colourAt = new Map();
let primNo = 0, flipped = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  prim.setExtras({ primNo });
  const p = prim.getAttribute('POSITION'), c = prim.getAttribute('COLOR_0');
  flipped += fixWinding(prim);
  if (c) {
    const v = [], col = [];
    for (let i = 0; i < p.getCount(); i++) {
      p.getElement(i, v); c.getElement(i, col);
      const key = primNo + ':' + v.join(',');
      if (!colourAt.has(key)) colourAt.set(key, col.slice(0, 3));
    }
  }
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
  primNo++;
}
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true; // for simplifyWithAttributes
if (flipped) console.log(`fixed ${flipped} inside-out triangles`);
await doc.transform(dedup(), weld());

// ---- simplify each part on its own ------------------------------------------------
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
const trisOf = (p) => p.getIndices().getCount() / 3;
const small = prims.filter((p) => trisOf(p) < KEEP_SMALL_PARTS);
const big = prims.filter((p) => trisOf(p) >= KEEP_SMALL_PARTS);
const smallTris = small.reduce((t, p) => t + trisOf(p), 0);
const bigTris = big.reduce((t, p) => t + trisOf(p), 0);
const ratio = Math.min(1, Math.max(0, TARGET_TRIS - smallTris) / (bigTris || 1));
for (const prim of big) {
  const posArr = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const ind = Uint32Array.from(prim.getIndices().getArray());
  const target = Math.min(ind.length, Math.max(MIN_PART_TRIS, Math.round(trisOf(prim) * ratio)) * 3);
  const pn = prim.getExtras().primNo, n = posArr.length / 3;
  const cols = new Float32Array(n * 3);
  let hasCols = false;
  for (let i = 0; i < n; i++) {
    const c = colourAt.get(pn + ':' + [posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]].join(','));
    if (c) { cols.set(c, i * 3); hasCols = true; }
  }
  const [out] = hasCols
    ? MeshoptSimplifier.simplifyWithAttributes(ind, posArr, 3, cols, 3, [1, 1, 1], null, target, 0.05)
    : MeshoptSimplifier.simplify(ind, posArr, 3, target, 0.05);
  prim.getIndices().setArray(out);
}

// ---- gather every primitive in world space -------------------------------------
const pos = [], slot = [], rgb = [], idx = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const p = prim.getAttribute('POSITION');
    const ind = prim.getIndices();
    const mat = prim.getMaterial();
    const matName = (mat && mat.getName() || 'body').toLowerCase();
    const s = Math.max(0, SLOTS.indexOf(matName));
    const fallback = mat ? mat.getBaseColorFactor().slice(0, 3) : [0.8, 0.8, 0.8];
    const pn = prim.getExtras().primNo;
    const base = pos.length / 3;
    const n = ind ? ind.getCount() : p.getCount();
    // only keep vertices that are still used after simplifying
    const remap = new Int32Array(p.getCount()).fill(-1);
    const used = [];
    for (let i = 0; i < n; i++) {
      const vi = ind ? ind.getScalar(i) : i;
      if (remap[vi] < 0) { remap[vi] = used.length; used.push(vi); }
    }
    const v = [0, 0, 0];
    for (const i of used) {
      p.getElement(i, v);
      const col = colourAt.get(pn + ':' + v.join(',')) || fallback;
      const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
      const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
      const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
      pos.push(-x, y, z); // mirror X: right-handed glTF -> left-handed Babylon
      slot.push(s);
      rgb.push(...col.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)));
    }
    for (let i = 0; i < n; i += 3) {
      const g = (j) => remap[ind ? ind.getScalar(j) : j];
      // glTF front faces are counter-clockwise; mirroring X turns them clockwise, which is
      // exactly what Babylon (left-handed) treats as front-facing, so keep the order.
      idx.push(base + g(i), base + g(i + 1), base + g(i + 2));
    }
  }
}

// ---- normalise: feet on y=0, centred on x/z, fixed height ----------------------
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i++) { const k = i % 3; min[k] = Math.min(min[k], pos[i]); max[k] = Math.max(max[k], pos[i]); }
const scale = T.height / (max[1] - min[1]);
const centre = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - centre[i % 3]) * scale;
const half = [0, 1, 2].map((k) => Math.max(Math.abs((min[k] - centre[k]) * scale), Math.abs((max[k] - centre[k]) * scale)));

// ---- quantise + base64 ------------------------------------------------------------
const verts = pos.length / 3;
if (verts > 65535) throw new Error(`too many vertices (${verts}); lower the triangle count`);
const q = new Int16Array(pos.length);
for (let i = 0; i < pos.length; i++) q[i] = Math.round((pos[i] / (half[i % 3] || 1)) * 32767);
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
const data = { extent: half.map((h) => +h.toFixed(5)), pos: b64(q), idx: b64(Uint16Array.from(idx)) };
if (T.colours === 'slots') data.slot = b64(Uint8Array.from(slot));
else data.rgb = b64(Uint8Array.from(rgb));

let js = fs.readFileSync(USERSCRIPT, 'utf8');
const START = `/* ${T.marker}_DATA_START */`, END = `/* ${T.marker}_DATA_END */`;
const a = js.indexOf(START), b = js.indexOf(END);
if (a < 0 || b < 0) throw new Error(`${T.marker}_DATA markers not found in userscript`);
js = js.slice(0, a + START.length) + ' ' + JSON.stringify(data) + ' ' + js.slice(b);
fs.writeFileSync(USERSCRIPT, js);
console.log(`${targetName}: ${before} tris -> ${idx.length / 3} tris, ${verts} verts, ~${Math.round(JSON.stringify(data).length / 1024)} KB embedded`);

// Some models have triangles wound the wrong way (invisible with back-face culling).
// Where the file has normals, flip every triangle whose winding disagrees with them.
function fixWinding(prim) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), I = prim.getIndices();
  if (!N || !I) return 0;
  const a = [], b = [], c = [], na = [], nb = [], nc = [];
  let count = 0;
  for (let i = 0; i < I.getCount(); i += 3) {
    const ia = I.getScalar(i), ib = I.getScalar(i + 1), ic = I.getScalar(i + 2);
    P.getElement(ia, a); P.getElement(ib, b); P.getElement(ic, c);
    N.getElement(ia, na); N.getElement(ib, nb); N.getElement(ic, nc);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = f[0] * (na[0] + nb[0] + nc[0]) + f[1] * (na[1] + nb[1] + nc[1]) + f[2] * (na[2] + nb[2] + nc[2]);
    if (dot < 0) { I.setScalar(i + 1, ic); I.setScalar(i + 2, ib); count++; }
  }
  return count;
}

function countTris(d) {
  let t = 0;
  for (const mesh of d.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const ind = p.getIndices(); t += (ind ? ind.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}
