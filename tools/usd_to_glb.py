"""Convert a .usdz/.usdc/.usda model into a plain .glb that build-model.mjs can embed.

Texture colours are baked into per-vertex colours (COLOR_0), because the mod draws
models with vertex colours instead of loading textures.

    pip install usd-core pillow
    python usd_to_glb.py model.usdz out.glb
"""
import json
import os
import struct
import sys
import tempfile
import zipfile

from PIL import Image
from pxr import Gf, Usd, UsdGeom, UsdShade


def open_stage(path):
    if path.lower().endswith('.usdz'):
        tmp = tempfile.mkdtemp(prefix='usdz_')
        with zipfile.ZipFile(path) as z:
            z.extractall(tmp)
        roots = [f for f in os.listdir(tmp) if f.lower().endswith(('.usdc', '.usda', '.usd'))]
        if not roots:
            sys.exit('no .usd file inside the .usdz')
        path = os.path.join(tmp, roots[0])
    return Usd.Stage.Open(path)


def material_info(mesh_prim):
    """Returns (name, PIL image or None, fallback rgb)."""
    mat = UsdShade.MaterialBindingAPI(mesh_prim).ComputeBoundMaterial()[0]
    if not mat:
        return 'body', None, (0.8, 0.8, 0.8)
    image, rgb = None, (0.8, 0.8, 0.8)
    for p in Usd.PrimRange(mat.GetPrim()):
        if p.GetTypeName() != 'Shader':
            continue
        sh = UsdShade.Shader(p)
        sid = sh.GetIdAttr().Get()
        if sid == 'UsdUVTexture':
            f = sh.GetInput('file')
            if f and f.Get() and f.Get().resolvedPath:
                image = Image.open(f.Get().resolvedPath).convert('RGB')
        elif sid == 'UsdPreviewSurface':
            dc = sh.GetInput('diffuseColor')
            if dc and dc.Get() is not None:
                rgb = tuple(dc.Get())
    return mat.GetPrim().GetName(), image, rgb


def sample(image, u, v):
    w, h = image.size
    x = int((u % 1.0) * w) % w
    y = int((1.0 - (v % 1.0)) * h) % h  # USD st origin is bottom-left
    r, g, b = image.getpixel((x, y))
    return r / 255.0, g / 255.0, b / 255.0


def main(src, dst):
    stage = open_stage(src)
    if UsdGeom.GetStageUpAxis(stage) != 'Y':
        print('warning: stage is not Y-up; the model may need rotating')
    cache = UsdGeom.XformCache(Usd.TimeCode.Default())

    bin_parts, buffer_views, accessors, meshes, nodes, materials = [], [], [], [], [], []
    offset = 0

    def add_view(data, target):
        nonlocal offset
        pad = (-len(data)) % 4
        bin_parts.append(data + b'\0' * pad)
        buffer_views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data), 'target': target})
        offset += len(data) + pad
        return len(buffer_views) - 1

    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(prim)
        pts = mesh.GetPointsAttr().Get()
        counts = mesh.GetFaceVertexCountsAttr().Get()
        fvi = mesh.GetFaceVertexIndicesAttr().Get()
        if not pts or not counts:
            continue
        xf = cache.GetLocalToWorldTransform(prim)
        world = [xf.Transform(Gf.Vec3d(*p)) for p in pts]

        name, image, rgb = material_info(prim)
        pv = UsdGeom.PrimvarsAPI(prim)
        st = next((pv.GetPrimvar(n) for n in ('st0', 'st') if pv.GetPrimvar(n).IsDefined()), None)
        uvs = st.ComputeFlattened() if st else None
        per_vertex_uv = st is not None and st.GetInterpolation() in ('vertex', 'varying') and uvs is not None
        colours = [sample(image, *uvs[i]) if (image and per_vertex_uv) else rgb for i in range(len(pts))]

        tris, k = [], 0
        for c in counts:  # fan-triangulate polygons
            for j in range(1, c - 1):
                tris += [fvi[k], fvi[k + j], fvi[k + j + 1]]
            k += c

        pos_bytes = b''.join(struct.pack('<3f', *p) for p in world)
        col_bytes = b''.join(struct.pack('<3f', *c) for c in colours)
        idx_bytes = struct.pack('<%dI' % len(tris), *tris)
        mins = [min(p[i] for p in world) for i in range(3)]
        maxs = [max(p[i] for p in world) for i in range(3)]
        a_pos = len(accessors); accessors.append({'bufferView': add_view(pos_bytes, 34962), 'componentType': 5126, 'count': len(world), 'type': 'VEC3', 'min': mins, 'max': maxs})
        a_col = len(accessors); accessors.append({'bufferView': add_view(col_bytes, 34962), 'componentType': 5126, 'count': len(world), 'type': 'VEC3'})
        a_idx = len(accessors); accessors.append({'bufferView': add_view(idx_bytes, 34963), 'componentType': 5125, 'count': len(tris), 'type': 'SCALAR'})
        materials.append({'name': name})
        meshes.append({'name': prim.GetName(), 'primitives': [{'attributes': {'POSITION': a_pos, 'COLOR_0': a_col}, 'indices': a_idx, 'material': len(materials) - 1}]})
        nodes.append({'mesh': len(meshes) - 1, 'name': prim.GetName()})
        print(f'{prim.GetName()}: {len(world)} verts, {len(tris) // 3} tris, material {name}, texture {"yes" if image else "no"}')

    gltf = {
        'asset': {'version': '2.0', 'generator': 'goffy-mod usd_to_glb.py'},
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
        'materials': materials, 'accessors': accessors, 'bufferViews': buffer_views, 'buffers': [{'byteLength': offset}],
    }
    js = json.dumps(gltf).encode()
    js += b' ' * ((-len(js)) % 4)
    binary = b''.join(bin_parts)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    with open(dst, 'wb') as f:
        f.write(out)
    print('wrote', dst)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
