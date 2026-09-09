"""Author the exported rain-soaked bamboo world; run only in the isolated factory Blender process."""
from pathlib import Path
import math
import random
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from world_blender_common import finish_world, game_xyz, group, material, mesh


SEED = 0x517CC1B7
CORE_X, CORE_Z, FLOOR_Y, SAFE = 3.0, 4.0, -.82, 1.8
random.seed(SEED)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

shell = group('BJ8_World_Bamboo')
quiet = group('BJ8_Quiet_Bamboo')

bamboo_near = material('bamboo_rain_deep', (.085, .175, .125), .72, .02)
bamboo_far = material('bamboo_mist_muted', (.16, .26, .21), .86, 0)
bamboo_node = material('bamboo_node_dark', (.045, .10, .070), .82, 0)
leaf_near = material('bamboo_leaf_wet', (.14, .29, .175), .86, 0)
leaf_far = material('bamboo_leaf_mist', (.22, .33, .29), .95, 0)
leaf_near.use_backface_culling = False
leaf_far.use_backface_culling = False
slate = material('slate_wet_black', (.055, .080, .078), .66, .08)
slate_edge = material('stone_slate_edge', (.075, .105, .100), .91, 0)
moss = material('stone_moss_rain', (.095, .145, .112), .97, 0)


def rounded_outline(hx, hz, radius, count=24, wobble=0.0):
    points = []
    corners = [(-hx + radius, -hz + radius, math.pi), (hx - radius, -hz + radius, math.pi * 1.5),
               (hx - radius, hz - radius, 0), (-hx + radius, hz - radius, math.pi * .5)]
    steps = count // 4
    for cx, cz, start in corners:
        for step in range(steps):
            angle = start + step * (math.pi * .5 / steps)
            points.append((cx + math.cos(angle) * radius + math.sin(angle * 7.0) * wobble,
                           cz + math.sin(angle) * radius + math.cos(angle * 5.0) * wobble))
    return points


def tube_mesh(name, centers, radii, sides, mat, parent):
    vertices, faces = [], []
    for index, (center, radius) in enumerate(zip(centers, radii)):
        tangent = (centers[min(index + 1, len(centers) - 1)][0] - centers[max(index - 1, 0)][0],
                   centers[min(index + 1, len(centers) - 1)][1] - centers[max(index - 1, 0)][1],
                   centers[min(index + 1, len(centers) - 1)][2] - centers[max(index - 1, 0)][2])
        length = max(.001, math.sqrt(sum(value * value for value in tangent)))
        up = (tangent[0] / length, tangent[1] / length, tangent[2] / length)
        side = (up[2], 0, -up[0])
        side_length = math.sqrt(side[0] * side[0] + side[2] * side[2])
        # A mostly vertical culm has no horizontal perpendicular from this formula.
        # Pin its frame to world X instead of collapsing the ring to a line.
        side = (1, 0, 0) if side_length < .0001 else (side[0] / side_length, 0, side[2] / side_length)
        cross = (up[1] * side[2], up[2] * side[0] - up[0] * side[2], -up[1] * side[0])
        for step in range(sides):
            angle = math.tau * step / sides
            vertices.append((center[0] + radius * (side[0] * math.cos(angle) + cross[0] * math.sin(angle)),
                             center[1] + radius * (side[1] * math.cos(angle) + cross[1] * math.sin(angle)),
                             center[2] + radius * (side[2] * math.cos(angle) + cross[2] * math.sin(angle))))
    for ring in range(len(centers) - 1):
        for step in range(sides):
            nxt = (step + 1) % sides
            a, b = ring * sides + step, ring * sides + nxt
            faces.extend(((a, b, b + sides), (a, b + sides, a + sides)))
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple((len(centers) - 1) * sides + i for i in range(sides)))
    result = mesh(name, vertices, faces, mat, parent)
    for polygon in result.data.polygons:
        polygon.use_smooth = True
    return result


def make_leaf_cluster(name, origin, direction, mat, parent):
    vertices, faces = [], []
    for blade in range(8):
        turn = math.atan2(direction[2], direction[0]) + (blade - 1) * .65
        turn += (blade - 3.5) * .22 + (random.random() - .5) * .20
        length, width = .56 + random.random() * .40, .055 + random.random() * .030
        dx, dz = math.cos(turn), math.sin(turn)
        start = len(vertices)
        pitch, droop = .14 + random.random() * .20, .24 + random.random() * .15
        twist = (.48 + random.random() * .55) * (-1 if random.random() < .5 else 1)
        twist_rate, side_curve = (random.random() - .5) * .75, (random.random() - .5) * .14
        for step in range(4):
            t = step / 3
            bend = math.sin(t * math.pi) * side_curve
            center = (origin[0] + dx * length * t, origin[1] + .045 + pitch * t - droop * t * t,
                      origin[2] + dz * length * t + bend)
            taper = width * (1 - t * .85)
            slope = (pitch - droop * 2 * t) / length
            tangent_length = math.sqrt(1 + slope * slope)
            forward = (dx / tangent_length, slope / tangent_length, dz / tangent_length)
            lateral = (-dz, 0, dx)
            normal = (forward[1] * lateral[2], forward[2] * lateral[0] - forward[0] * lateral[2], -forward[1] * lateral[0])
            normal_length = math.sqrt(sum(value * value for value in normal))
            normal = tuple(value / normal_length for value in normal)
            roll = twist + (t - .5) * twist_rate
            width_dir = tuple(lateral[i] * math.cos(roll) + normal[i] * math.sin(roll) for i in range(3))
            vertices.extend((tuple(center[i] - width_dir[i] * taper for i in range(3)),
                             tuple(center[i] + width_dir[i] * taper for i in range(3))))
        for step in range(3):
            a = start + step * 2
            faces.extend(((a, a + 1, a + 3), (a, a + 3, a + 2)))
    result = mesh(name, vertices, faces, mat, parent)
    for polygon in result.data.polygons:
        polygon.use_smooth = True
    return result


def terrain_height(x, z):
    """Exact deterministic rain-eroded ground field used by both mesh vertices and supports."""
    core = max(abs(x) / CORE_X, abs(z) / CORE_Z)
    radial = min(1.0, max(0.0, (core - 1.0) / 5.0))
    settle = radial * radial * (3.0 - 2.0 * radial)
    # This stays .005m inside the slate foot through its whole outline, eliminating a visible perimeter crack.
    ripples = (math.sin(x * .37 + z * .19) * .055 + math.sin(z * .73 - x * .21) * .032) * radial
    return FLOOR_Y - .105 - settle * .62 + ripples


def make_bamboo(index, x, z, distance):
    height = 5.0 + random.random() * 7.8
    radius = .045 + random.random() * .032
    bend_x, bend_z = (random.random() - .5) * .42, (random.random() - .5) * .42
    centers, radii = [], []
    node_heights = [1.5, 2.6, 4.2] + ([5.55] if height > 8.8 else [])
    profile = [0.0]
    for node in node_heights:
        if node < height - .3:
            profile.extend((node - .045, node, node + .045))
    profile.append(height)
    for y in profile:
        t = y / height
        root_x, root_z = x + bend_x * t * t, z + bend_z * t * t
        centers.append((root_x, terrain_height(root_x, root_z) + height * t, root_z))
        at_node = any(abs(y - node) < .001 for node in node_heights)
        radii.append(radius * (1.23 if at_node else 1.0) * (1 - t * .20))
    near = distance < 13
    tube_mesh('Bamboo_Stem_%03d' % index, centers, radii, 12, bamboo_near if near else bamboo_far, shell)
    for branch_index, node in enumerate(node_heights):
        if node >= height - .3:
            continue
        t = node / height
        base = (x + bend_x * t * t, terrain_height(x + bend_x * t * t, z + bend_z * t * t) + node, z + bend_z * t * t)
        direction = (bend_x + (random.random() - .5) * 1.65, .28 + random.random() * .42, bend_z + (random.random() - .5) * 1.65)
        branch_tip = (base[0] + direction[0], base[1] + direction[1], base[2] + direction[2])
        stem_radius = radius * (1 - t * .20)
        tube_mesh('Bamboo_Branch_%03d_%d' % (index, branch_index), [base, branch_tip], [stem_radius * .58, stem_radius * .22], 6, bamboo_node, shell)
        make_leaf_cluster('Bamboo_LeafCluster_%03d_%d' % (index, branch_index), branch_tip, direction, leaf_near if near else leaf_far, shell)


def make_slate_and_terrain():
    # One rounded, beveled slate slab rather than a bright box; its irregular terrain uses the same contour.
    outline = rounded_outline(CORE_X, CORE_Z, .48, 32)
    vertices, faces = [], []
    for y, scale in ((FLOOR_Y, 1), (FLOOR_Y - .11, .985)):
        vertices.extend((x * scale, y, z * scale) for x, z in outline)
    vertices.append((0, FLOOR_Y, 0))
    center = len(vertices) - 1
    for i in range(len(outline)):
        nxt = (i + 1) % len(outline)
        faces.append((center, nxt, i))
        faces.extend(((i, len(outline) + i, len(outline) + nxt), (i, len(outline) + nxt, nxt)))
    mesh('Quiet_WetSlate_Rounded_6x8', vertices, faces, slate, quiet)

    # The field is shared verbatim by roots and stones, so no object is placed against guessed terrain height.
    terrain_v, terrain_f = [], []
    columns, rows, span_x, span_z = 49, 53, 29.0, 31.0
    for row in range(rows):
        z = -span_z + row * span_z * 2 / (rows - 1)
        for column in range(columns):
            x = -span_x + column * span_x * 2 / (columns - 1)
            terrain_v.append((x, terrain_height(x, z), z))
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            b, c, d = a + 1, a + columns, a + columns + 1
            terrain_f.extend(((a, c, b), (b, c, d)))
    terrain = mesh('Quiet_MossTerrain_Continuous', terrain_v, terrain_f, moss, quiet)
    for polygon in terrain.data.polygons:
        polygon.use_smooth = True
    for i in range(74):
        a = random.random() * math.tau
        margin = 5.0 / max(abs(math.cos(a)), .001) if abs(math.cos(a)) > abs(math.sin(a)) else 6.0 / max(abs(math.sin(a)), .001)
        distance = margin + .15 + random.random() * 12
        x, z = math.cos(a) * distance, math.sin(a) * distance
        r = .08 + random.random() * .22
        y = terrain_height(x, z)
        tube_mesh('Stone_Edge_%03d' % i, [(x, y + r * .22, z), (x + r * .15, y + r * .32, z + r * .12)], [r, r * .72], 6, slate_edge, quiet)


make_slate_and_terrain()
for index in range(90):
    angle = random.random() * math.tau
    axis_margin = 5.0 / max(abs(math.cos(angle)), .001) if abs(math.cos(angle)) > abs(math.sin(angle)) else 6.0 / max(abs(math.sin(angle)), .001)
    distance = axis_margin + (.3 + random.random() * 4.8 if index < 23 else 5.0 + random.random() ** .55 * 12)
    make_bamboo(index, math.cos(angle) * distance, math.sin(angle) * distance, distance)
finish_world('bamboo', shell, quiet, preview_camera_game=(8, 4.6, 11), preview_target_game=(0, -.5, 0))
