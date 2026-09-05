import json, os
os.environ.setdefault('MPLCONFIGDIR','/private/tmp/pocket-trim-mpl')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
import numpy as np
base='shots/pocket-trim-research-20260905/'
data=json.load(open(base+'geometry-analysis.json'))
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,2,figsize=(11,8),layout='constrained')
for ax,index in zip(axes,[0,2]):
    p=data['pockets'][index]
    tris=[np.array(t)[:,:2] for t in p['topTriangles']]
    signs=[np.cross(t[1]-t[0],t[2]-t[0]) for t in tris]
    majority=np.sign(sum(signs))
    colors=['#d9534f' if np.sign(s)!=majority else '#ddb880' for s in signs]
    ax.add_collection(PolyCollection([np.array(t)[:,:2] for t in p['jawTop']],facecolors='#b6dcc9',edgecolors='#669a84',linewidths=.3,alpha=.75))
    ax.add_collection(PolyCollection(tris,facecolors=colors,edgecolors='#937847',linewidths=.25,alpha=.88))
    inner=np.array(p['inner']);outer=np.array(p['outer'])
    ax.plot(inner[:,0],inner[:,1],color='#202630',lw=1.5)
    ax.plot(outer[:,0],outer[:,1],color='#1b6bb0',lw=1.5)
    contour=np.array(p['woodContour'])
    for a,b in zip(contour[:-1],contour[1:]):
        if np.linalg.norm(a[:2]-b[:2])<50: ax.plot([a[0],b[0]],[a[1],b[1]],color='#9a65af',lw=2)
    ax.axvline(0,color='#c8c8c8',lw=.8,ls=':')
    ax.scatter([inner[0,0],inner[-1,0]],[inner[0,1],inner[-1,1]],marker='x',s=80,color='#8b1b16',zorder=9)
    for side in [-1,1]:
        ax.annotate('crossing',xy=(side*49,1),xytext=(side*83,42),ha='center',color='#8b1b16',arrowprops=dict(arrowstyle='->',color='#8b1b16'))
    if index==0:
        ax.annotate('',xy=(0,156),xytext=(0,129),arrowprops=dict(arrowstyle='<->',color='#a72a29',lw=1.5))
        ax.text(5,140,'~27 mm\nopen to floor',color='#a72a29')
    else:
        ax.text(5,110,'At rear axis:\ncap ends 97 mm;\nwood bevel starts ~97 mm',color='#684582',fontsize=9)
    ax.text(0,-27,'OPEN BALL ENTRY — KEEP OPEN',ha='center',color='#406656',fontsize=9)
    ax.set(xlim=(-118,118),ylim=(-34,180),aspect='equal',xlabel='Pocket lateral (mm)',ylabel='Depth outward from mouth (mm)',title=('Corner P0 (same defect at P1/P4/P5)' if index==0 else 'Middle P2 (same defect at P3)'))
    ax.grid(alpha=.15)
fig.suptitle('Current pocket geometry: disconnected wood cutout + folded trim ends',fontsize=15,fontweight='bold')
fig.legend(handles=[Patch(color='#ddb880',label='Trim top'),Patch(color='#d9534f',label='19 of 96 triangles reverse winding'),Patch(color='#b6dcc9',label='Jaw top'),Line2D([0],[0],color='#9a65af',lw=2,label='Wood cutout base path'),Line2D([0],[0],color='#1b6bb0',lw=2,label='Trim outer edge')],loc='outside lower center',ncol=3,fontsize=9)
fig.savefig(base+'geometry-plan.png',dpi=180)
fig.savefig(base+'geometry-plan.svg')
