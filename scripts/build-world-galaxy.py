"""Author the BJ8 galaxy world as deterministic, self-contained Blender geometry."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import math
from mathutils import Vector
from world_blender_common import game_xyz, material, mesh, group, beveled_box, finish_world

PROJECT_ROOT = Path(__file__).resolve().parents[1]
assert PROJECT_ROOT.name == 'bj8-world-shell-experiment'

for existing in list(bpy.data.objects):
    bpy.data.objects.remove(existing, do_unlink=True)

FLOOR_Y = -.82


def superellipse_outline(half_x, half_z, segments, exponent=.38, scale=1.0):
    points = []
    for index in range(segments):
        angle = math.tau * index / segments
        c, s = math.cos(angle), math.sin(angle)
        points.append((math.copysign(abs(c) ** exponent, c) * half_x * scale,
                       math.copysign(abs(s) ** exponent, s) * half_z * scale))
    return points


def quiet_platform(parent, mat):
    """A true 6x8 m flat playing surround with crafted, thick beveled edges."""
    segments = 96
    top = superellipse_outline(3, 4, segments, .36)
    shoulder = superellipse_outline(3, 4, segments, .36, 1.014)
    foot = superellipse_outline(3, 4, segments, .36, .995)
    vertices = [(0, FLOOR_Y, 0)]
    vertices += [(x, FLOOR_Y, z) for x, z in top]
    vertices += [(x, FLOOR_Y - .055, z) for x, z in shoulder]
    vertices += [(x, FLOOR_Y - .24, z) for x, z in foot]
    bottom_center = len(vertices)
    vertices.append((0, FLOOR_Y - .24, 0))
    faces = []
    top_start, shoulder_start, foot_start = 1, 1 + segments, 1 + segments * 2
    for i in range(segments):
        n = (i + 1) % segments
        faces.append((0, top_start + n, top_start + i))
        faces.append((top_start + i, top_start + n, shoulder_start + n, shoulder_start + i))
        faces.append((shoulder_start + i, shoulder_start + n, foot_start + n, foot_start + i))
        faces.append((bottom_center, foot_start + i, foot_start + n))
    obj = mesh('Galaxy_Quiet_Obsidian_Platform', vertices, faces, mat, parent)
    obj['semantic'] = '6x8m quiet platform; flat top at floorY=-0.82'
    obj['receive_shadow'] = True
    return obj


def basalt_mainland(parent, mat):
    """A continuous low island that physically supports the quiet platform."""
    segments, rings = 128, 12
    vertices = [(0, -1.04, 0)]
    for ring in range(1, rings + 1):
        t = ring / rings
        for index in range(segments):
            angle = math.tau * index / segments
            c, s = math.cos(angle), math.sin(angle)
            edge = 1 + t ** 2 * (.055 * math.sin(angle * 5 + .7) + .032 * math.sin(angle * 11 - .4))
            x = math.copysign(abs(c) ** .48, c) * 8.0 * t * edge
            z = math.copysign(abs(s) ** .48, s) * 9.7 * t * edge
            relief = (.045 * math.sin(x * 1.9 + z * .7) + .025 * math.sin(z * 3.1 - x)) * t ** 1.4
            y = -1.04 - .60 * t ** 1.75 + relief
            vertices.append((x, y, z))
    faces = []
    for i in range(segments):
        faces.append((0, 1 + (i + 1) % segments, 1 + i))
    for ring in range(1, rings):
        inner, outer = 1 + (ring - 1) * segments, 1 + ring * segments
        for i in range(segments):
            n = (i + 1) % segments
            faces.extend(((inner + i, inner + n, outer + n),
                          (inner + i, outer + n, outer + i)))
    outer_start = 1 + (rings - 1) * segments
    bottom_start = len(vertices)
    for i in range(segments):
        x, y, z = vertices[outer_start + i]
        vertices.append((x * .965, y - .76 - .08 * math.sin(i * .71), z * .965))
    bottom_center = len(vertices)
    vertices.append((0, -2.36, 0))
    for i in range(segments):
        n = (i + 1) % segments
        faces.extend(((outer_start + i, outer_start + n, bottom_start + n, bottom_start + i),
                      (bottom_center, bottom_start + i, bottom_start + n)))
    obj = mesh('Galaxy_Basalt_Mainland', vertices, faces, mat, parent)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj['semantic'] = 'continuous supporting basalt island with eroded perimeter'
    return obj


def connected_rock_shelves(parent, mat):
    """Thick grounded shelves overlap the mainland, then fragment toward space."""
    vertices, faces = [], []
    fragment_count = 10
    for fragment in range(fragment_count):
        center_angle = math.tau * fragment / fragment_count + .08 * math.sin(fragment * 2.1)
        width = .30 + .09 * (1 + math.sin(fragment * 1.7))
        steps = 5
        base = len(vertices)
        top_inner, top_outer, lower_inner, lower_outer = [], [], [], []
        for step in range(steps + 1):
            t = step / steps
            angle = center_angle + (t - .5) * width
            waviness = .055 * math.sin(fragment * 3.2 + step * 1.6)
            inner_factor = .79 + waviness
            outer_factor = 1.13 + .25 * (fragment % 3) / 2 + .07 * math.sin(step * 2.4 + fragment)
            c, s = math.cos(angle), math.sin(angle)
            top_y = -1.48 - .10 * math.sin(fragment * 1.3) - .07 * t
            thickness = .40 + .12 * ((fragment + 1) % 3)
            top_inner.append(len(vertices)); vertices.append((c * 8.0 * inner_factor, top_y + .08, s * 9.7 * inner_factor))
            top_outer.append(len(vertices)); vertices.append((c * 8.0 * outer_factor, top_y - .16, s * 9.7 * outer_factor))
            lower_inner.append(len(vertices)); vertices.append((c * 8.0 * inner_factor, top_y - thickness, s * 9.7 * inner_factor))
            lower_outer.append(len(vertices)); vertices.append((c * 8.0 * outer_factor * .985, top_y - thickness - .12, s * 9.7 * outer_factor * .985))
        for step in range(steps):
            n = step + 1
            faces.append((top_inner[step], top_inner[n], top_outer[n], top_outer[step]))
            faces.append((top_outer[step], top_outer[n], lower_outer[n], lower_outer[step]))
            faces.append((lower_inner[step], lower_outer[step], lower_outer[n], lower_inner[n]))
            faces.append((top_inner[n], top_inner[step], lower_inner[step], lower_inner[n]))
        faces.append((top_inner[0], top_outer[0], lower_outer[0], lower_inner[0]))
        faces.append((top_outer[-1], top_inner[-1], lower_inner[-1], lower_outer[-1]))
        assert len(vertices) > base
    obj = mesh('Galaxy_Connected_Rock_Shelves', vertices, faces, mat, parent)
    obj['semantic'] = 'grounded thick rock shelves overlapping the mainland; never floating'
    return obj


def distant_planet(parent, mat, center=(-10.0, .8, -42.0), radius=3.5):
    """A displaced UV sphere with stable ridges and crater-like depressions."""
    slices, stacks = 64, 30
    vertices = [(center[0], center[1] + radius, center[2])]
    for stack in range(1, stacks):
        latitude = math.pi * .5 - math.pi * stack / stacks
        for index in range(slices):
            longitude = math.tau * index / slices
            ridge = math.sin(longitude * 7 + latitude * 5) * math.sin(longitude * 3 - latitude * 11)
            fine = math.sin(longitude * 19 + latitude * 13) * .35
            crater = math.exp(-((longitude + .72) ** 2 + (latitude - .18) ** 2) / .045)
            displaced = radius * (1 + .020 * ridge + .006 * fine - .026 * crater)
            cos_lat = math.cos(latitude)
            vertices.append((center[0] + math.cos(longitude) * cos_lat * displaced,
                             center[1] + math.sin(latitude) * displaced,
                             center[2] + math.sin(longitude) * cos_lat * displaced))
    bottom = len(vertices)
    vertices.append((center[0], center[1] - radius, center[2]))
    faces = []
    first_ring = 1
    for index in range(slices):
        n = (index + 1) % slices
        faces.append((0, first_ring + index, first_ring + n))
    for stack in range(stacks - 2):
        upper = 1 + stack * slices
        lower = upper + slices
        for index in range(slices):
            n = (index + 1) % slices
            faces.append((upper + index, lower + index, lower + n, upper + n))
    last_ring = 1 + (stacks - 2) * slices
    for index in range(slices):
        n = (index + 1) % slices
        faces.append((last_ring + n, last_ring + index, bottom))
    obj = mesh('Galaxy_Distant_Ridged_Planet', vertices, faces, mat, parent)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj['semantic'] = 'distant displaced planet; landmark, not gameplay geometry'
    return obj, center, radius


def planet_ring(parent, mat, center, planet_radius):
    segments = 128
    normal = Vector((.13, .68, .72)).normalized()
    axis_u = normal.cross(Vector((0, 1, 0))).normalized()
    axis_v = normal.cross(axis_u).normalized()
    inner, outer, thickness = planet_radius * 1.25, planet_radius * 1.72, .075
    vertices = []
    for height in (thickness, -thickness):
        for radius in (inner, outer):
            for index in range(segments):
                angle = math.tau * index / segments
                point = Vector(center) + axis_u * (math.cos(angle) * radius) + axis_v * (math.sin(angle) * radius) + normal * height
                vertices.append(tuple(point))
    upper_inner, upper_outer = 0, segments
    lower_inner, lower_outer = segments * 2, segments * 3
    faces = []
    for i in range(segments):
        n = (i + 1) % segments
        faces.extend(((upper_inner + i, upper_inner + n, upper_outer + n, upper_outer + i),
                      (lower_outer + i, lower_outer + n, lower_inner + n, lower_inner + i),
                      (upper_outer + i, upper_outer + n, lower_outer + n, lower_outer + i),
                      (lower_inner + i, lower_inner + n, upper_inner + n, upper_inner + i)))
    obj = mesh('Galaxy_Distant_Planet_Ring', vertices, faces, mat, parent)
    obj['semantic'] = 'solid thin planetary ring with real thickness'
    return obj


shell_root = group('BJ8_World_Galaxy')
quiet_root = group('BJ8_Quiet_Galaxy')
shell_root['static_world'] = True
quiet_root['floor_y'] = FLOOR_Y
quiet_root['quiet_dimensions_m'] = '6x8'

obsidian = material('Galaxy_Obsidian_Stone', (.018, .021, .032), .90, .07)
basalt = material('Galaxy_Basalt_Rock', (.026, .031, .043), .94, .02)
planet_stone = material('Galaxy_Planet_Stone', (.052, .047, .082), .87, .04)
ring_stone = material('Galaxy_Ring_Rock', (.105, .112, .145), .82, .05)

quiet_platform(quiet_root, obsidian)
basalt_mainland(shell_root, basalt)
connected_rock_shelves(shell_root, basalt)
_, planet_center, planet_radius = distant_planet(shell_root, planet_stone)
planet_ring(shell_root, ring_stone, planet_center, planet_radius)

finish_world('galaxy', shell_root, quiet_root,
             preview_camera_game=(9.5, 5.6, 12.5), preview_target_game=(0, -.55, -.4))
