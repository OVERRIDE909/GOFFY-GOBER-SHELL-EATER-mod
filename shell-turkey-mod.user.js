// ==UserScript==
// @name         Goffy Gober Shell Eater - Turkey Egg Mod
// @namespace    https://github.com/override909/goffy-gober-shell-eater-mod
// @version      0.1.0-placeholder
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
    // Size/offset tweaks applied to the turkey (placeholder or custom model).
    scale: 1.0,
    offset: { x: 0, y: 0, z: 0 },
    // How often (ms) to scan the scene for newly-spawned turkey eggs.
    scanIntervalMs: 500,
    debug: false,
  };

  const log = (...a) => CONFIG.debug && console.log('[TurkeyMod]', ...a);

  // ---- Build the placeholder turkey out of basic Babylon shapes ----------------
  function buildPlaceholderTurkey(B, scene) {
    const root = new B.TransformNode('turkeyMod_root', scene);
    const mat = (name, hex) => {
      const m = new B.StandardMaterial('turkeyMod_' + name, scene);
      m.diffuseColor = B.Color3.FromHexString(hex);
      m.specularColor = new B.Color3(0.05, 0.05, 0.05);
      return m;
    };
    const brown = mat('brown', '#7b4a21');
    const tan = mat('tan', '#c9985a');
    const red = mat('red', '#c0281e');
    const yellow = mat('yellow', '#f2b705');
    const black = mat('black', '#111111');

    const add = (mesh, material, x, y, z) => {
      mesh.material = material;
      mesh.parent = root;
      mesh.position.set(x, y, z);
      mesh.isPickable = false;
      return mesh;
    };

    // body
    const body = add(B.MeshBuilder.CreateSphere('tm_body', { diameter: 0.9 }, scene), brown, 0, 0.45, 0);
    body.scaling.set(1, 0.95, 1.2);
    // head + neck
    add(B.MeshBuilder.CreateSphere('tm_head', { diameter: 0.34 }, scene), tan, 0, 1.0, 0.42);
    add(B.MeshBuilder.CreateCylinder('tm_neck', { height: 0.4, diameter: 0.18 }, scene), tan, 0, 0.8, 0.38);
    // beak, wattle, eyes
    const beak = add(B.MeshBuilder.CreateCylinder('tm_beak', { height: 0.2, diameterTop: 0, diameterBottom: 0.12 }, scene), yellow, 0, 1.0, 0.64);
    beak.rotation.x = Math.PI / 2;
    add(B.MeshBuilder.CreateSphere('tm_wattle', { diameter: 0.12 }, scene), red, 0, 0.88, 0.58).scaling.y = 1.6;
    add(B.MeshBuilder.CreateSphere('tm_eyeL', { diameter: 0.06 }, scene), black, -0.1, 1.06, 0.55);
    add(B.MeshBuilder.CreateSphere('tm_eyeR', { diameter: 0.06 }, scene), black, 0.1, 1.06, 0.55);
    // tail fan (5 feathers)
    for (let i = -2; i <= 2; i++) {
      const f = add(B.MeshBuilder.CreateBox('tm_feather' + i, { width: 0.16, height: 0.7, depth: 0.04 }, scene),
        i % 2 ? tan : brown, i * 0.22, 0.75, -0.5);
      f.rotation.z = -i * 0.28;
      f.rotation.x = -0.25;
    }
    // feet
    add(B.MeshBuilder.CreateBox('tm_footL', { width: 0.14, height: 0.3, depth: 0.14 }, scene), yellow, -0.2, 0.0, 0.1);
    add(B.MeshBuilder.CreateBox('tm_footR', { width: 0.14, height: 0.3, depth: 0.14 }, scene), yellow, 0.2, 0.0, 0.1);
    return root;
  }

  async function makeTurkey(B, scene) {
    if (CONFIG.modelUrl && B.SceneLoader) {
      try {
        const res = await B.SceneLoader.ImportMeshAsync('', '', CONFIG.modelUrl, scene);
        const root = new B.TransformNode('turkeyMod_root', scene);
        res.meshes.forEach((m) => { if (!m.parent) m.parent = root; m.isPickable = false; });
        return root;
      } catch (e) {
        console.warn('[TurkeyMod] custom model failed, using placeholder', e);
      }
    }
    return buildPlaceholderTurkey(B, scene);
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
