"""Author the Aurora Lake world with only local Blender bpy geometry and materials."""
import math
import random
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from world_blender_common import finish_world, group, material, mesh


ROOT = Path(__file__).resolve().parents[1]
assert ROOT.name == 'bj8-world-shell-experiment'
random.seed(0xA0A0A)
FLOOR_Y = -.82

# This script runs in a fresh disposable Blender process; do not consume any source scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

shell = group('BJ8_World_Aurora')
quiet = group('BJ8_Quiet_Aurora')
shell['static_world'] = True
quiet['floor_y'] = FLOOR_Y
quiet['quiet_dimensions_m'] = '6x8'

ice = material('Aurora_Ice_Deep_Blue', (.025, .085, .145), .78, .04)
frost = material('Aurora_Ice_Frost_Filaments', (.42, .66, .72), .88, .0)
snow = material('Aurora_Ice_Snow_Crust', (.42, .55, .62), .96, .0)
rock = material('Aurora_Shore_Rock_BlueGrey', (.075, .105, .13), .91, .0)
rock_far = material('Aurora_Mountain_Rock_Muted', (.11, .145, .17), .95, .0)
aurora_green = material('Aurora_Green_Emission', (.09, .88, .61), .42, .0, 1.25)
aurora_cyan = material('Aurora_Cyan_Emission', (.13, .66, .92), .46, .0, .8)
aurora_violet = material('Aurora_Violet_Emission', (.48, .23, .76), .52, .0, .45)
for glow, alpha in ((aurora_green, .43), (aurora_cyan, .27), (aurora_violet, .16)):
    glow.diffuse_color = (*glow.diffuse_color[:3], alpha)
    glow.surface_render_method = 'DITHERED'
    glow.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = alpha


def lake_height(x, z):
    """Absolutely flat 6x8 quiet zone, then one continuous, subdued frozen lake."""
    u, v = abs(x) / 3.0, abs(z) / 4.0
    core = max(u, v)
    if core <= 1:
        return FLOOR_Y
    distance = min(1.0, (core - 1.0) / 4.6)
    broad = -.055 * distance - .14 * distance ** 1.8
    grain = (.017 * math.sin(x * .58 + z * .23) + .012 * math.sin(z * 1.37 - x * .31)) * distance ** 2
    return FLOOR_Y + broad + grain


def continuous_lake(parent):
    """A single large, thick water-ice sheet: there is no isolated board or perimeter gap."""
    half_x, half_z = 27.0, 31.0
    # Exact quiet-zone boundaries prevent an interpolated slope under the 6x8 table envelope.
    xs = sorted({-half_x + 2 * half_x * i / 64 for i in range(65)} | {-3.0, 3.0})
    zs = sorted({-half_z + 2 * half_z * i / 72 for i in range(73)} | {-4.0, 4.0})
    nx, nz = len(xs), len(zs)
    vertices, faces = [], []
    for z in zs:
        for x in xs:
            vertices.append((x, lake_height(x, z), z))
    for iz in range(nz - 1):
        for ix in range(nx - 1):
            a = iz * nx + ix
            faces.extend(((a, a + nx + 1, a + 1), (a, a + nx, a + nx + 1)))
    # Real, dark ice thickness only at the natural distant lake boundary.
    perimeter = ([i for i in range(nx)] + [iz * nx + nx - 1 for iz in range(1, nz)] +
                 [(nz - 1) * nx + ix for ix in range(nx - 2, -1, -1)] +
                 [iz * nx for iz in range(nz - 2, 0, -1)])
    bottom = len(vertices)
    for index in perimeter:
        x, y, z = vertices[index]
        vertices.append((x * .996, y - .36, z * .996))
    for i, top in enumerate(perimeter):
        nxt = (i + 1) % len(perimeter)
        faces.extend(((top, perimeter[nxt], bottom + nxt), (top, bottom + nxt, bottom + i)))
    obj = mesh('Aurora_Continuous_Thick_Ice_Lake', vertices, faces, ice, parent)
    obj['semantic'] = 'continuous dark-blue lake; 6x8m floor is flat at y=-0.82; no board seam'
    return obj


def strip_mesh(name, points, width, mat, parent, vertical=False):
    vertices, faces = [], []
    for i, point in enumerate(points):
        x, y, z = point
        prev, nxt = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
        dx, dz = nxt[0] - prev[0], nxt[2] - prev[2]
        length = max(math.hypot(dx, dz), .001)
        # For ice filaments this offsets across the plane; for aurora it offsets vertically.
        if vertical:
            side = (0, width * (.55 + .45 * math.sin(i * .71) ** 2), 0)
        else:
            side = (-dz / length * width, .002, dx / length * width)
        vertices.extend(((x - side[0], y - side[1], z - side[2]),
                         (x + side[0], y + side[1], z + side[2])))
    for i in range(len(points) - 1):
        a = i * 2
        faces.extend(((a, a + 1, a + 3), (a, a + 3, a + 2)))
    return mesh(name, vertices, faces, mat, parent)


def frost_filaments(parent):
    """Fine fracture and hoar patterns follow ice topology without making a circular border."""
    for line in range(44):
        angle = random.random() * math.tau
        start = 5.0 + random.random() * 9.0
        length = 1.4 + random.random() * 5.4
        points = []
        for step in range(7):
            t = step / 6
            radius = start + length * t
            bend = math.sin(t * math.pi * 2 + line * 1.9) * .22
            x = math.cos(angle) * radius - math.sin(angle) * bend
            z = math.sin(angle) * radius + math.cos(angle) * bend
            points.append((x, lake_height(x, z) + .006, z))
        strip_mesh('Ice_Fracture_%02d' % line, points, .008 + random.random() * .014, frost, parent)
    for line in range(22):
        x = random.choice((-1, 1)) * (13 + random.random() * 10)
        z = -25 + random.random() * 50
        points = []
        for step in range(8):
            px = x + math.sin(step * .9 + line) * .35
            pz = z + step * (.32 + random.random() * .13)
            points.append((px, lake_height(px, pz) + .009, pz))
        strip_mesh('Outer_Hoar_%02d' % line, points, .025 + random.random() * .03, snow, parent)


def boulder(name, center, radius, height, mat, parent, sides=9):
    vertices = [(center[0], center[1] + height, center[2])]
    for ring, scale in ((.56, .70), (1.0, .18), (.82, -.10)):
        for i in range(sides):
            a = math.tau * i / sides
            wobble = 1 + .16 * math.sin(i * 5.7 + center[0])
            vertices.append((center[0] + math.cos(a) * radius * ring * wobble,
                             center[1] + height * scale + height * math.sin(i * 3.3) * .025,
                             center[2] + math.sin(a) * radius * ring * wobble))
    bottom = len(vertices)
    vertices.append((center[0], center[1] - height * .12, center[2]))
    faces = []
    for i in range(sides):
        n = (i + 1) % sides
        faces.append((0, 1 + i, 1 + n))
        faces.extend(((1 + i, 1 + sides + i, 1 + sides + n, 1 + n),
                      (1 + sides + i, 1 + 2 * sides + i, 1 + 2 * sides + n, 1 + sides + n),
                      (bottom, 1 + 2 * sides + n, 1 + 2 * sides + i)))
    obj = mesh(name, vertices, faces, mat, parent)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def mountain(name, center, width, depth, height, mat, parent):
    """Layered irregular topography, planted beyond the 8m quiet-zone clearance."""
    sides, rings = 26, 5
    vertices = [(center[0], center[1] + height, center[2])]
    for ring in range(1, rings + 1):
        t = ring / rings
        for i in range(sides):
            a = math.tau * i / sides
            ripple = 1 + .12 * math.sin(a * 4 + center[0] * .31) + .06 * math.sin(a * 9 - center[2])
            ridge = height * (1 - t) ** 1.45 + .12 * math.sin(a * 3 + t * 5) * (1 - t)
            vertices.append((center[0] + math.cos(a) * width * t * ripple,
                             center[1] + ridge,
                             center[2] + math.sin(a) * depth * t * ripple))
    faces = []
    for i in range(sides):
        faces.append((0, 1 + i, 1 + (i + 1) % sides))
    for ring in range(1, rings):
        inner, outer = 1 + (ring - 1) * sides, 1 + ring * sides
        for i in range(sides):
            n = (i + 1) % sides
            faces.extend(((inner + i, outer + i, outer + n), (inner + i, outer + n, inner + n)))
    obj = mesh(name, vertices, [tuple(reversed(face)) for face in faces], mat, parent)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def shore_and_mountains(parent):
    # Tall forms are behind the far shore; side banks remain low and leave low camera angles open.
    mountains = [((-18, -.98, -24), 7.5, 4.4, 1.4), ((-8, -.99, -29), 8.2, 4.8, 1.8),
                 ((4, -1.0, -30), 9.0, 4.3, 1.6), ((15, -.99, -26), 7.1, 4.8, 1.2),
                 ((-25, -1.08, -5), 5.0, 4.0, .8), ((25, -1.07, 4), 5.2, 4.2, .7)]
    for i, (center, width, depth, height) in enumerate(mountains):
        mountain('Aurora_Distant_Ridge_%02d' % i, center, width, depth, height, rock_far, parent)
    for i in range(42):
        a = math.tau * i / 42 + .14 * math.sin(i * 2.4)
        distance = 12.0 + (i % 6) * 1.55 + random.random() * 2.2
        x, z = math.cos(a) * distance, math.sin(a) * distance
        if z > 12:
            continue
        h = .18 + random.random() * .65
        radius = .22 + random.random() * .6
        base_y = lake_height(x, z) - .04
        boulder('Aurora_Shore_Rock_%02d' % i, (x, base_y, z), radius, h, rock, parent)
        if i % 3 == 0:
            boulder('Aurora_Snowcap_%02d' % i, (x, base_y + h * .68, z), radius * .62, h * .32, snow, parent, 9)


def aurora_band(name, base_z, start_y, width, amplitude, mat, parent, phase):
    points = []
    for i in range(43):
        t = i / 42
        x = -25 + 50 * t
        y = start_y + math.sin(t * math.tau * 1.18 + phase) * amplitude + math.sin(t * math.tau * 3.1 + phase) * .42
        z = base_z + math.sin(t * math.tau * .68 + phase) * 2.2
        points.append((x, y, z))
    band = strip_mesh(name, points, width, mat, parent, vertical=True)
    # Packed alpha/emission texture survives GLB export; both ends and both vertical edges dissolve.
    image = bpy.data.images.new(name + '_SoftCurtain', width=256, height=64, alpha=True)
    pixels = []
    rgb = mat.diffuse_color[:3]
    for row in range(64):
        v = row / 63
        for column in range(256):
            u = column / 255
            filaments = .62 + .20 * math.sin(u * 157 + phase) + .18 * math.sin(u * 337 + phase)
            alpha = math.sin(math.pi * u) ** .7 * math.sin(math.pi * v) ** 1.7 * filaments * .6
            pixels.extend((*rgb, alpha))
    image.pixels.foreach_set(pixels)
    image.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    shader = mat.node_tree.nodes.get('Principled BSDF')
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Emission Color'])
    mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
    for polygon in band.data.polygons:
        for index in polygon.loop_indices:
            vertex = band.data.loops[index].vertex_index
            band.data.uv_layers.active.data[index].uv = ((vertex // 2) / (len(points) - 1), vertex % 2)
    band['semantic'] = 'distant translucent aurora curtain; runtime atmosphere may add fog only'
    return band


continuous_lake(quiet)
frost_filaments(shell)
shore_and_mountains(shell)
aurora_band('Aurora_Green_Long_Curtain', -31, 2.0, .85, .55, aurora_green, shell, .2)
aurora_band('Aurora_Cyan_Fading_Curtain', -33, 2.7, .7, .65, aurora_cyan, shell, 1.7)
aurora_band('Aurora_Violet_Distant_Curtain', -35, 3.4, .5, .5, aurora_violet, shell, 3.0)

finish_world('aurora-lake', shell, quiet,
             preview_camera_game=(9.5, 4.8, 12.5), preview_target_game=(0, -.62, -1.0))
