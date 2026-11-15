// Builds the embedded goose model for shell-goose-mod.user.js.
//
//   cd tools && npm install
//   node build-model.mjs ../models/goose-source.glb [targetTriangles]
//
// What it does:
//  1. loads the .glb, drops normals/UVs (recomputed in-game) and welds shared vertices
//  2. simplifies it (meshoptimizer) down to ~targetTriangles so it can't lag the game
//  3. converts glTF (right-handed) -> Babylon (left-handed), stands it on y=0, centres it,
//     and scales it to MODEL_HEIGHT
//  4. tags each vertex with a colour slot from its material name (body/feet/beak/eyes)
//  5. writes the compressed data between the MODEL_DATA markers in the userscript
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || path.join(here, '../models/goose-source.glb');
const TARGET_TRIS = Number(process.argv[3] || 4000);
const USERSCRIPT = path.join(here, '../shell-goose-mod.user.js');
const MODEL_HEIGHT = 1.35;
// material name -> colour slot (the userscript's CONFIG.gooseColors uses the same order)
const SLOTS = ['body', 'feet', 'beak', 'eyes'];

const io = new NodeIO();
const doc = await io.read(SRC);
const before = countTris(doc);
// Normals are recomputed in the browser, and per-face normals stop vertices from being
// shared (so nothing could be simplified). Drop everything except POSITION.
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
}
await MeshoptSimplifier.ready;
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TARGET_TRIS / before), error: 0.02, lockBorder: false }),
);

// ---- gather every primitive in world space -------------------------------------
const pos = []; const slot = []; const idx = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const p = prim.getAttribute('POSITION');
    const ind = prim.getIndices();
    const matName = (prim.getMaterial() && prim.getMaterial().getName() || 'body').toLowerCase();
    const s = Math.max(0, SLOTS.indexOf(matName));
    const base = pos.length / 3;
    const v = [0, 0, 0];
    for (let i = 0; i < p.getCount(); i++) {
      p.getElement(i, v);
      const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
      const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
      const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
      pos.push(-x, y, z); // mirror X: right-handed glTF -> left-handed Babylon
      slot.push(s);
    }
    const n = ind ? ind.getCount() : p.getCount();
    for (let i = 0; i < n; i += 3) {
      const a = ind ? ind.getScalar(i) : i, b = ind ? ind.getScalar(i + 1) : i + 1, c = ind ? ind.getScalar(i + 2) : i + 2;
      idx.push(base + a, base + c, base + b); // mirroring flips winding, so swap b/c
    }
  }
}

// ---- normalise: feet on y=0, centred on x/z, fixed height ----------------------
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i++) { const k = i % 3; min[k] = Math.min(min[k], pos[i]); max[k] = Math.max(max[k], pos[i]); }
const scale = MODEL_HEIGHT / (max[1] - min[1]);
const centre = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - centre[i % 3]) * scale;
const half = [0, 0, 0].map((_, k) => Math.max(Math.abs((min[k] - centre[k]) * scale), Math.abs((max[k] - centre[k]) * scale)));

// ---- quantise + base64 ------------------------------------------------------------
const verts = pos.length / 3;
if (verts > 65535) throw new Error(`too many vertices (${verts}); lower the target triangle count`);
const q = new Int16Array(pos.length);
for (let i = 0; i < pos.length; i++) q[i] = Math.round((pos[i] / (half[i % 3] || 1)) * 32767);
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
const data = {
  extent: half.map((h) => +h.toFixed(5)),
  pos: b64(q),
  slot: b64(Uint8Array.from(slot)),
  idx: b64(Uint16Array.from(idx)),
};
const tris = idx.length / 3;

let js = fs.readFileSync(USERSCRIPT, 'utf8');
const START = '/* MODEL_DATA_START */', END = '/* MODEL_DATA_END */';
const a = js.indexOf(START), b = js.indexOf(END);
if (a < 0 || b < 0) throw new Error('MODEL_DATA markers not found in userscript');
js = js.slice(0, a + START.length) + ' ' + JSON.stringify(data) + ' ' + js.slice(b);
fs.writeFileSync(USERSCRIPT, js);
console.log(`source ${before} tris -> ${tris} tris, ${verts} verts, ~${Math.round(JSON.stringify(data).length / 1024)} KB embedded`);

function countTris(d) {
  let t = 0;
  for (const mesh of d.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const ind = p.getIndices(); t += (ind ? ind.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}
