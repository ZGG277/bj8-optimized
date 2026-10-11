"""Round the supplied table's upper caps and build physical gold/shell inlays.

Positions are authored in runtime metres, then mapped back to the supplied GLB.
The cushion nose, cloth, pocket centres and collision code stay in the baseline.
All new artwork consists of locally authored geometry, without new image assets.
"""
import json
import math
import struct
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load_glb(path):
    raw = path.read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 8)[0] == len(raw)
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    return doc, bytearray(raw[28 + size:])

def accessor(doc, blob, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    fmt = {5126:'f', 5125:'I', 5123:'H', 5121:'B'}[a['componentType']]
    count = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}[a['type']]
    stride = v.get('byteStride', struct.calcsize('<'+fmt)*count)
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<'+fmt*count, blob, offset+i*stride) for i in range(a['count'])]

def add_accessor(doc, blob, values, kind, integer=False):
    while len(blob) % 4: blob.append(0)
    offset = len(blob)
    flat = [x for value in values for x in value]
    blob.extend(struct.pack('<'+('I' if integer else 'f')*len(flat), *flat))
    view = len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':len(blob)-offset, 'target':34963 if integer else 34962})
    a = {'bufferView':view, 'componentType':5125 if integer else 5126, 'count':len(values), 'type':kind}
    if kind == 'VEC3':
        a['min'] = [min(v[i] for v in values) for i in range(3)]
        a['max'] = [max(v[i] for v in values) for i in range(3)]
    doc['accessors'].append(a)
    return len(doc['accessors'])-1

def world(p): return (-p[2]-.81006, p[1]-.718, p[0]-1.44506)
def local(p): return (p[2]+1.44506, p[1]+.718, -p[0]-.81006)
def local_normal(p): return (p[2], p[1], -p[0])

class Mesh:
    def __init__(self): self.positions=[]; self.normals=[]; self.uv=[]
    def tri(self, a, b, c, normals=None):
        ab=[b[i]-a[i] for i in range(3)]; ac=[c[i]-a[i] for i in range(3)]
        n=[ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
        length=math.sqrt(sum(v*v for v in n))
        if length < 1e-12: return
        n=tuple(v/length for v in n)
        for i,p in enumerate([a,b,c]):
            self.positions.append(local(p)); self.normals.append(local_normal(normals[i] if normals else n))
            self.uv.append((p[0]*3,p[2]*3))
    def quad(self, a,b,c,d,normals=None):
        self.tri(a,b,c,[normals[i] for i in [0,1,2]] if normals else None)
        self.tri(a,c,d,[normals[i] for i in [0,2,3]] if normals else None)
    def tube(self, points, radius, sides=6, closed=False):
        if closed: points=points+[points[0]]
        rings=[]; norms=[]
        for i,p in enumerate(points):
            before=points[max(0,i-1)]; after=points[min(len(points)-1,i+1)]
            if closed and i in (0,len(points)-1): before=points[-2]; after=points[1]
            dx,dz=after[0]-before[0],after[2]-before[2]
            ln=math.hypot(dx,dz); dx/=ln; dz/=ln
            normals=[(-dz*math.cos(j*math.tau/sides),math.sin(j*math.tau/sides),dx*math.cos(j*math.tau/sides)) for j in range(sides)]
            rings.append([tuple(p[k]+radius*n[k] for k in range(3)) for n in normals]);norms.append(normals)
        for i in range(len(rings)-1):
            for j in range(sides):
                k=(j+1)%sides
                self.quad(rings[i][j],rings[i+1][j],rings[i+1][k],rings[i][k],[norms[i][j],norms[i+1][j],norms[i+1][k],norms[i][k]])
    def primitive(self, doc, blob, material):
        # Share tube and bevel vertices instead of exporting triangle soup.
        keys={}; positions=[]; normals=[]; uv=[]; indices=[]
        for p,n,t in zip(self.positions,self.normals,self.uv):
            key=tuple(round(v,7) for v in (*p,*n,*t))
            if key not in keys:
                keys[key]=len(positions);positions.append(p);normals.append(n);uv.append(t)
            indices.append((keys[key],))
        return {'attributes':{'POSITION':add_accessor(doc,blob,positions,'VEC3'), 'NORMAL':add_accessor(doc,blob,normals,'VEC3'), 'TEXCOORD_0':add_accessor(doc,blob,uv,'VEC2')}, 'indices':add_accessor(doc,blob,indices,'SCALAR',True), 'material':material, 'mode':4}

def round_rect(width, length, radius, steps=8):
    points=[]
    for cx,cz,start in [(width/2-radius,length/2-radius,0),(-width/2+radius,length/2-radius,math.pi/2),(-width/2+radius,-length/2+radius,math.pi),(width/2-radius,-length/2+radius,math.pi*1.5)]:
        for k in range(steps+1):
            a=start+k/steps*math.pi/2
            points.append((cx+radius*math.cos(a),cz+radius*math.sin(a)))
    return points

def transform(cap, u,v,y):
    x,z,angle=cap
    return (x+u*math.cos(angle)-v*math.sin(angle),y,z+u*math.sin(angle)+v*math.cos(angle))

def cap_body(mesh, cap, length):
    # A 28 mm plan fillet and a 4 mm crown bevel replace the straight cuts.
    rings=[]
    for y,inset in [(.036, .003),(.041,0),(.062,0),(.066,.002),(.0675,.004)]:
        rings.append([transform(cap,u,v,y) for u,v in round_rect(.139-2*inset,length-2*inset,.028-inset)])
    for lower,upper in zip(rings,rings[1:]):
        for i in range(len(lower)):
            j=(i+1)%len(lower)
            mesh.quad(lower[i],upper[i],upper[j],lower[j])
    center=transform(cap,0,0,.0675)
    bottom=transform(cap,0,0,.036)
    for i in range(len(rings[-1])):
        j=(i+1)%len(rings[-1])
        mesh.tri(center,rings[-1][j],rings[-1][i])
        mesh.tri(bottom,rings[0][i],rings[0][j])

def leaf(mesh, cap, u,v,direction, scale=1):
    # A lens-shaped shell tessera with a shallow convex polish.
    edge=[]
    for i in range(13):
        a=i*math.tau/12
        pu=.014*math.sin(a)*scale; pv=.030*math.cos(a)*scale
        edge.append(transform(cap,u+pu*math.cos(direction)-pv*math.sin(direction),v+pu*math.sin(direction)+pv*math.cos(direction),.0681))
    center=transform(cap,u,v,.0703)
    for i in range(12): mesh.tri(center,edge[i],edge[i+1])
    return edge[:-1]

def pearl(mesh, p, radius=.0036):
    for i in range(4):
        for j in range(8):
            def q(a,b):
                return (p[0]+radius*math.sin(a)*math.cos(b),p[1]+radius*.62*math.cos(a),p[2]+radius*math.sin(a)*math.sin(b))
            a=i*math.pi/4;b=j*math.tau/8
            mesh.quad(q(a,b),q(a,b+math.tau/8),q(a+math.pi/4,b+math.tau/8),q(a+math.pi/4,b))

def on_cap(p):
    x,y,z=p
    side=.669<abs(x)<.817 and .117<abs(z)<1.234
    end=1.309<abs(z)<1.449 and abs(x)<.601
    return y>.014 and (side or end)

def boundary_loops(points, indices, select_triangle, select_vertex):
    edges=Counter()
    for i in range(0,len(indices),3):
        tri=[points[j] for j in indices[i:i+3]]
        if select_triangle(tri):
            for a,b in zip(tri,tri[1:]+tri[:1]):
                if select_vertex(a) and select_vertex(b): edges[tuple(sorted([a,b]))]+=1
    adj=defaultdict(list)
    for (a,b),count in edges.items():
        if count==1:adj[a].append(b);adj[b].append(a)
    assert all(len(v)==2 for v in adj.values())
    visited=set();loops=[]
    for first in adj:
        if first in visited:continue
        loop=[first];prev=None;cur=first
        while True:
            visited.add(cur);nxt=next(v for v in adj[cur] if v!=prev)
            if nxt==first:break
            loop.append(nxt);prev,cur=cur,nxt
        loops.append(loop)
    return loops

def triangulate_top(mesh, polygon):
    # Ear clipping retains concave jaw outlines; a centre fan would bridge a pocket.
    p=list(polygon)
    area=sum(p[i][0]*p[(i+1)%len(p)][2]-p[(i+1)%len(p)][0]*p[i][2] for i in range(len(p)))
    if area<0:p.reverse()
    def cross(a,b,c):return (b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])
    def inside(q,a,b,c):return min(cross(a,b,q),cross(b,c,q),cross(c,a,q))>=-1e-10
    while len(p)>3:
        for i in range(len(p)):
            a,b,c=p[i-1],p[i],p[(i+1)%len(p)]
            if cross(a,b,c)>1e-11 and not any(inside(q,a,b,c) for j,q in enumerate(p) if j not in [(i-1)%len(p),i,(i+1)%len(p)]):
                mesh.tri(a,c,b);p.pop(i);break
        else:raise ValueError('Upper jaw polygon cannot be triangulated')
    mesh.tri(p[0],p[2],p[1])

def soften_upper_jaws(doc, blob):
    primitive=next(p for p in doc['meshes'][0]['primitives'] if p['material']==7)
    points=[tuple(round(v,6) for v in world(p)) for p in accessor(doc,blob,primitive['attributes']['POSITION'])]
    ix=[p[0] for p in accessor(doc,blob,primitive['indices'])]
    top=lambda p:abs(p[1]-.06004)<1e-5
    high=lambda tri:all(p[1]>.0555 for p in tri)
    top_loops=boundary_loops(points,ix,lambda t:all(top(p) for p in t),top)
    # The rear seam stays at crown height where the pearl cap covers it;
    # the front seam is lower. Preserve the actual mixed-height boundary.
    lower_loops=boundary_loops(points,ix,high,lambda p:True)
    assert len(top_loops)==len(lower_loops)==6
    keep=[]
    for i in range(0,len(ix),3):
        # Retain the cloth and its wrap. Rebuild the cushion bodies so the
        # rounded mouth is visible down the cheek, rather than only on its crown.
        if all(points[j][1]<=.000001 for j in ix[i:i+3]):keep.extend(ix[i:i+3])
    primitive['indices']=add_accessor(doc,blob,[(i,) for i in keep],'SCALAR',True)
    result=Mesh()
    for loop in top_loops:
        lower_loop=min(lower_loops,key=lambda ring:min(math.dist(loop[0],p) for p in ring))
        base=[min(lower_loop,key=lambda q:math.dist(p,q)) for p in loop]
        contour=[];seam=[]
        for i,v in enumerate(loop):
            before,after=loop[i-1],loop[(i+1)%len(loop)]
            d1=math.dist(before,v);d2=math.dist(v,after)
            distance=min(.016,d1*.28,d2*.28)
            a=distance/d1;b=distance/d2
            start=tuple(v[k]*(1-a)+before[k]*a for k in range(3))
            end=tuple(v[k]*(1-b)+after[k]*b for k in range(3))
            bstart=tuple(base[i][k]*(1-a)+base[i-1][k]*a for k in range(3))
            bend=tuple(base[i][k]*(1-b)+base[(i+1)%len(base)][k]*b for k in range(3))
            for j in range(7):
                t=j/6
                contour.append(tuple((1-t)**2*start[k]+2*t*(1-t)*v[k]+t*t*end[k] for k in range(3)))
                seam.append(tuple((1-t)**2*bstart[k]+2*t*(1-t)*base[i][k]+t*t*bend[k] for k in range(3)))
        area=sum(contour[i][0]*contour[(i+1)%len(contour)][2]-contour[(i+1)%len(contour)][0]*contour[i][2] for i in range(len(contour)))
        if area<0:contour.reverse();seam.reverse()
        triangulate_top(result,contour)
        floor=[(p[0],0,p[2]) for p in seam]
        for i in range(len(contour)):
            j=(i+1)%len(contour)
            result.quad(seam[i],contour[i],contour[j],seam[j])
            def side_normal(k):
                prev,seam_next=seam[k-1],seam[(k+1)%len(seam)]
                dx,dz=seam_next[0]-prev[0],seam_next[2]-prev[2]
                length=math.hypot(dx,dz)
                return (dz/length,0,-dx/length)
            ni,nj=side_normal(i),side_normal(j)
            result.quad(floor[i],seam[i],seam[j],floor[j],[ni,ni,nj,nj])
    doc['meshes'][0]['primitives'].append(result.primitive(doc,blob,7))
    return len(result.positions)//3

def build_table():
    doc,blob=load_glb(ROOT/'assets/source/jewelry-table.glb')
    mesh=doc['meshes'][0]; removed={}
    for primitive in mesh['primitives']:
        if primitive['material'] not in [0,2]: continue
        p=accessor(doc,blob,primitive['attributes']['POSITION'])
        ix=[v[0] for v in accessor(doc,blob,primitive['indices'])]
        keep=[]; count=0
        for i in range(0,len(ix),3):
            triangle=ix[i:i+3]
            if all(on_cap(world(p[v])) for v in triangle): count+=1
            else: keep.extend(triangle)
        primitive['indices']=add_accessor(doc,blob,[(i,) for i in keep],'SCALAR',True)
        removed[primitive['material']]=count
    assert removed[2] > 100, removed
    jaw_triangles=soften_upper_jaws(doc,blob)
    gold=Mesh(); shell=Mesh(); pearl_mesh=Mesh(); inlays=[Mesh(),Mesh(),Mesh()]
    caps=[((x,z,0),1.10406) for x in [-.74306,.74306] for z in [-.67503,.67503]]
    caps += [((0,z,math.pi/2),1.18212) for z in [-1.37806,1.37806]]
    for cap,length in caps:
        cap_body(shell,cap,length)
        for inset,r in [(.0032,.0019),(.010,.00115)]:
            gold.tube([transform(cap,u,v,.0680) for u,v in round_rect(.139-2*inset,length-2*inset,.028-inset,8)],r,6,True)
        # Flowing stems, paired shell leaves, and bead setting on the top-facing plane.
        stem=[transform(cap,.010*math.sin(t*math.tau*4), (t-.5)*(length-.14),.0684) for t in [i/64 for i in range(65)]]
        gold.tube(stem,.0016,5)
        # The reference favours large quiet nacre panels and restrained gold
        # filigree. Leave room for their sheen rather than coloured leaf inserts.
    # Subtle coloured nacre changes angle with the clearcoat/iridescence at runtime.
    material_ids=[]
    for name,color in [('rose',[.56,.20,.23,1]),('seafoam',[.12,.52,.32,1]),('lilac',[.33,.23,.57,1])]:
        material_ids.append(len(doc['materials']))
        doc['materials'].append({'name':'Pearl shell '+name+' inlay','pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':.12,'roughnessFactor':.24},'extensions':{'KHR_materials_clearcoat':{'clearcoatFactor':.9,'clearcoatRoughnessFactor':.12}}})
    doc['materials'].append({'name':'Pearl seed bead inlay','pbrMetallicRoughness':{'baseColorFactor':[.96,.94,.84,1],'metallicFactor':.06,'roughnessFactor':.18},'extensions':{'KHR_materials_clearcoat':{'clearcoatFactor':1,'clearcoatRoughnessFactor':.10}}})
    for geometry,material in [(gold,0),(shell,2)]:
        mesh['primitives'].append(geometry.primitive(doc,blob,material))
    doc['asset']['extras']={'source':'user-supplied 1009 ZIP','revision':'royal-daylight-1009-v1','units':'metres','collisionChange':False}
    doc['buffers'][0]['byteLength']=len(blob)
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    encoded+=b' '*((-len(encoded))%4);blob+=b'\0'*((-len(blob))%4)
    raw=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(blob))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    dest=ROOT/'assets/jewelry-table-daylight.glb';dest.write_bytes(raw)
    report={'removedStraightCapTriangles':removed,'newTriangles':sum(len(g.positions)//3 for g in [gold,shell,pearl_mesh,*inlays])+jaw_triangles,'roundedUpperJawTriangles':jaw_triangles,'sizeBytes':len(raw),'planFilletMm':28,'crownBevelMm':4,'upperJawFilletMm':16,'physicsModified':False}
    (ROOT/'evidence/model-build.json').write_text(json.dumps(report,indent=2)+'\n')
    return raw,report

if __name__=='__main__': print(build_table()[1])
