// ==UserScript==
// @name         Goffy Gober Shell Eater - Turkey Egg Mod
// @namespace    https://github.com/override909/goffy-gober-shell-eater-mod
// @version      0.2.0
// @description  Cosmetic only: eggs wearing the turkey face get a full turkey 3D model instead of the egg body + face.
// @match        *://shellshock.io/*
// @match        *://*.shellshock.io/*
// @match        *://*.shellshockers.*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * PLACEHOLDER VERSION
 * - Only touches how turkey-face eggs are drawn on YOUR screen. It reads nothing
 *   about other players that the game isn't already drawing, and sends nothing.
 * - Detection (which meshes are "the turkey face") is a best-effort name match.
 *   Shell Shockers' internal mesh names change between updates, so you may need to
 *   tweak CONFIG.turkeyMeshPattern. Set CONFIG.debug = true and check the console.
 */
(function () {
  'use strict';

  const CONFIG = {
    // Matches the name of the mesh/node that is the turkey face item.
    turkeyMeshPattern: /turkey/i,
    // Optional: URL of your own turkey model (.glb / .babylon). Leave '' to use the
    // built-in placeholder turkey made from simple shapes.
    modelUrl: '',
    // Built-in turkey style: 'normal' (live turkey) or 'roasted' (golden roast on a tray).
    style: 'normal',
    // Size/offset tweaks applied to the turkey (built-in or custom model).
    scale: 1.0,
    offset: { x: 0, y: 0, z: 0 },
    // How often (ms) to scan the scene for newly-spawned turkey eggs.
    scanIntervalMs: 500,
    debug: false,
  };

  const log = (...a) => CONFIG.debug && console.log('[TurkeyMod]', ...a);

  // ---- Build the built-in low-poly turkey --------------------------------------
  // Low segment counts + merged into ONE mesh (a few draw calls, a few hundred
  // triangles) so it will not lag the browser even with a full lobby of turkeys.
  let template = null;

  function buildTemplate(B, scene) {
    const roasted = CONFIG.style === 'roasted';
    const col = (hex) => {
      const m = new B.StandardMaterial('turkeyMod_mat_' + hex, scene);
      m.diffuseColor = B.Color3.FromHexString(hex);
      m.specularColor = new B.Color3(0.05, 0.05, 0.05);
      m.freeze();
      return m;
    };
    const skin = roasted ? col('#a85a1c') : col('#7b4a21');   // body
    const wing = roasted ? col('#8a4414') : col('#5a3416');
    const feather = roasted ? col('#c9772b') : col('#c9985a'); // tail / drumsticks
    const head = roasted ? col('#a85a1c') : col('#d9a58a');
    const red = col('#c0281e');
    const yellow = col('#f2b705');
    const black = col('#111111');
    const bone = col('#f3ead6');

    const parts = [];
    const add = (mesh, mat, x, y, z, rx, ry, rz, sx, sy, sz) => {
      mesh.material = mat;
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx || 0, ry || 0, rz || 0);
      mesh.scaling.set(sx || 1, sy || 1, sz || 1);
      parts.push(mesh);
      return mesh;
    };
    const sph = (d, seg) => B.MeshBuilder.CreateSphere('tm_s', { diameter: d, segments: seg || 6 }, scene);
    const cyl = (h, d, dt) => B.MeshBuilder.CreateCylinder('tm_c', { height: h, diameterBottom: d, diameterTop: dt === undefined ? d : dt, tessellation: 7 }, scene);

    // body (a plump oval; the main "roast" shape)
    add(sph(0.95, 8), skin, 0, 0.5, 0, 0, 0, 0, 1, 0.9, 1.25);
    // wings
    add(sph(0.5, 5), wing, -0.5, 0.55, 0.0, 0, 0, 0.3, 0.45, 0.9, 1.4);
    add(sph(0.5, 5), wing, 0.5, 0.55, 0.0, 0, 0, -0.3, 0.45, 0.9, 1.4);
    // drumsticks
    add(sph(0.38, 5), feather, -0.32, 0.18, 0.28, 0, 0, 0, 1, 1.15, 1);
    add(sph(0.38, 5), feather, 0.32, 0.18, 0.28, 0, 0, 0, 1, 1.15, 1);
    add(cyl(0.22, 0.07), bone, -0.32, 0.02, 0.5, Math.PI / 2.4, 0, 0);
    add(cyl(0.22, 0.07), bone, 0.32, 0.02, 0.5, Math.PI / 2.4, 0, 0);

    if (roasted) {
      // roasted turkey: little head is tucked/omitted, add a tray rim instead
      add(B.MeshBuilder.CreateCylinder('tm_tray', { height: 0.06, diameter: 1.6, tessellation: 14 }, scene), bone, 0, -0.05, 0.05);
    } else {
      // neck + head + beak + wattle + eyes
      add(cyl(0.45, 0.2, 0.15), head, 0, 0.95, 0.5, 0.35, 0, 0);
      add(sph(0.34, 6), head, 0, 1.2, 0.62);
      add(cyl(0.2, 0.12, 0), yellow, 0, 1.18, 0.82, Math.PI / 2);
      add(sph(0.13, 4), red, 0, 1.03, 0.76, 0, 0, 0, 1, 1.7, 1);
      add(sph(0.07, 4), black, -0.11, 1.26, 0.76);
      add(sph(0.07, 4), black, 0.11, 1.26, 0.76);
      // tail fan (5 feathers)
      for (let i = -2; i <= 2; i++) {
        add(B.MeshBuilder.CreateBox('tm_f', { width: 0.18, height: 0.8, depth: 0.04 }, scene),
          i % 2 ? feather : wing, i * 0.24, 0.95, -0.62, -0.3, 0, -i * 0.3);
      }
      // feet
      add(cyl(0.3, 0.1), yellow, -0.22, -0.02, 0.25);
      add(cyl(0.3, 0.1), yellow, 0.22, -0.02, 0.25);
    }

    // bake every part's transform and merge into a single multi-material mesh
    const merged = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    merged.name = 'turkeyMod_template';
    merged.isPickable = false;
    merged.setEnabled(false);
    log('turkey template built, triangles:', merged.getTotalIndices() / 3);
    return merged;
  }

  async function makeTurkey(B, scene) {
    if (CONFIG.modelUrl && B.SceneLoader) {
      try {
        const res = await B.SceneLoader.ImportMeshAsync('', '', CONFIG.modelUrl, scene);
        const root = new B.TransformNode('turkeyMod_root', scene);
        res.meshes.forEach((m) => { if (!m.parent) m.parent = root; m.isPickable = false; });
        return root;
      } catch (e) {
        console.warn('[TurkeyMod] custom model failed, using built-in turkey', e);
      }
    }
    if (!template) template = buildTemplate(B, scene);
    const inst = template.clone('turkeyMod_inst'); // shares geometry + materials
    inst.setEnabled(true);
    return inst;
  }

  // ---- Find the "player" a turkey-face mesh belongs to -------------------------
  function playerRootOf(node) {
    let n = node;
    while (n.parent) n = n.parent;
    return n;
  }

  async function dress(B, scene, faceMesh) {
    const player = playerRootOf(faceMesh);
    if (!player || (player.metadata && player.metadata.__turkeyMod)) return;
    player.metadata = Object.assign(player.metadata || {}, { __turkeyMod: true });

    // Hide egg body + face + everything else drawn on this player.
    player.getChildMeshes(false).forEach((m) => m.setEnabled(false));
    if (player.setEnabled && player.getChildMeshes) { /* keep node itself so it still moves */ }

    const turkey = await makeTurkey(B, scene);
    turkey.parent = player;
    turkey.scaling.setAll(CONFIG.scale);
    turkey.position.set(CONFIG.offset.x, CONFIG.offset.y, CONFIG.offset.z);
    log('turkey applied to', player.name);
  }

  function scan(B, scene) {
    const candidates = scene.meshes.concat(scene.transformNodes || []);
    for (const n of candidates) {
      if (CONFIG.turkeyMeshPattern.test(n.name || '') && !/^turkeyMod_|^tm_/.test(n.name)) {
        dress(B, scene, n).catch((e) => console.warn('[TurkeyMod]', e));
      }
    }
  }

  // ---- Wait for the game's Babylon scene, then start scanning ------------------
  const wait = setInterval(() => {
    const B = window.BABYLON;
    const scene = B && B.Engine && B.Engine.LastCreatedScene;
    if (!scene) return;
    clearInterval(wait);
    log('scene found, scanning every', CONFIG.scanIntervalMs, 'ms');
    setInterval(() => scan(B, scene), CONFIG.scanIntervalMs);
  }, 250);
})();
