/*
[INPUT]: 当前物理球/袋尺寸与运行时皮壳站点
[OUTPUT]: Blender制作脚本和资产回归共用的确定性 surface-contract.json
[POS]: 只读几何导出；不修改物理参数或渲染输入
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { TABLE, POCKETS } from '../src/physics';
import { pocketSeamContract } from '../src/pocket-render/seam-contract';
import { pocketRenderProfile } from '../src/pocket-render/profile';

const directory = new URL('../assets/blender/table-craft-v2/', import.meta.url);
mkdirSync(directory, { recursive: true });
const contract = { table: TABLE, pockets: POCKETS.map(p => ({ index: p.index,
  kind: p.kind, x: p.x, z: p.z, outward: p.outward, tangent: p.tangent,
  profile: pocketRenderProfile(p), seam: pocketSeamContract(p, pocketRenderProfile(p)) })) };
writeFileSync(new URL('surface-contract.json', directory), JSON.stringify(contract, null, 2));
console.log('Exported current ball/pocket surface contract');
