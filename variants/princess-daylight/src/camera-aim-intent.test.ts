/*
[INPUT]: 薄切世界几何、当前杆向及袋口清路条件
[OUTPUT]: 锁定相机构图使用目标球真实出射方向选袋，拒绝反向袋与微扰跳袋
[POS]: 相机瞄准语义的纯回归，不改拨轮的既有袋口排序
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { TABLE, POCKETS, getPocketAimWindow, createInitialWorld, type BilliardsWorld } from './physics';
import { cameraFramingForAim, inferCameraAimIntent } from './camera-aim-intent';
import { findAimDialTarget, aimAngleForPocketOffset, aimSolutionForPocket, firstObjectHit } from './aim/aim-solution';
import { aimCameraPose, aimFramingPoints, projectFramingPoint, DEFAULT_CAMERA_SAFETY } from './camera-framing';

function thinCutWorld(): BilliardsWorld {
  const world = createInitialWorld();
  for (const ball of world.balls) {
    ball.active = ball.number === 0 || ball.number === 1;
    ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
  }
  const cue = world.balls.find(ball => ball.number === 0)!;
  const object = world.balls.find(ball => ball.number === 1)!;
  cue.x = 0;
  cue.z = 0.9;
  object.x = -0.4;
  object.z = -0.8;
  return world;
}

describe('camera aim intent', () => {
  // Preserve this thin-cut counterexample when the shared ball size changes.
  const centerAngle = Math.atan2(-0.4, 1.7);
  const angle = centerAngle + Math.asin(Math.sin(-0.2787 - centerAngle) * TABLE.ballRadius / 0.041576625);

  it('薄切按目标球真实出射方向选择右上袋 1，而不是拨轮的不同候选袋', () => {
    const world = thinCutWorld();
    expect(findAimDialTarget(world, angle, [1])?.pocket).not.toBe(1);
    expect(inferCameraAimIntent(world, angle, [1])).toMatchObject({ target: 1, pocket: 1 });
  });

  it.each([-0.003, 0, 0.003])('确认前的微小杆向扰动 %s 不会跳到反向袋', (delta) => {
    const intent = inferCameraAimIntent(thinCutWorld(), angle + delta, [1]);
    // 极薄切的一侧可能刚好失去首碰；此时显式回退也比跳到反向袋安全。
    expect(intent?.pocket).not.toBe(5);
    if (intent) expect(intent).toMatchObject({ target: 1, pocket: 1 });
  });

  it('非法首碰或没有首碰时回退，不猜测相机袋口', () => {
    expect(inferCameraAimIntent(thinCutWorld(), angle, [2])).toBeNull();
    expect(inferCameraAimIntent(thinCutWorld(), angle + Math.PI, [1])).toBeNull();
  });
  it('normal first-person aiming frames cue, object and the same forward pocket without ghost-ball placement', () => {
    const world = thinCutWorld();
    const frame = cameraFramingForAim(world, angle, [1], DEFAULT_CAMERA_SAFETY);
    expect(frame).toMatchObject({ targetNumber: 1, pocketIndex: 1 });
    expect(frame?.cue).toMatchObject({ x: 0, z: .9 });
    expect(frame?.object).toMatchObject({ x: -.4, z: -.8 });
    expect(frame?.pocket.left).not.toEqual(frame?.pocket.right);
    expect(cameraFramingForAim(world, angle + Math.PI, [1], DEFAULT_CAMERA_SAFETY)).toBeNull();
  });

});

describe('six pocket framing at near/far mouth boundaries',()=>{
 for(const pocket of POCKETS)for(const distance of [.16,.75])for(const offset of [-.95,0,.95]){
  it(`pocket ${pocket.index}, distance ${distance}, mouth offset ${offset}`,()=>{
   const world=thinCutWorld();const mouth=getPocketAimWindow(pocket);const cue=world.balls.find(b=>b.number===0)!,object=world.balls.find(b=>b.number===1)!;
   object.x=mouth.center.x-pocket.outward.x*distance;object.z=mouth.center.z-pocket.outward.z*distance;
   cue.x=object.x-pocket.outward.x*.28;cue.z=object.z-pocket.outward.z*.28;
   const angle=aimAngleForPocketOffset(world,1,pocket.index,offset);expect(angle).not.toBeNull();
   const frame=cameraFramingForAim(world,angle!,[1],DEFAULT_CAMERA_SAFETY);
   expect(frame).toMatchObject({targetNumber:1,pocketIndex:pocket.index});
   for(const aspect of [390/706,1280/662,844/296]) {
    const pose=aimCameraPose(frame!,angle!,aspect).pose;
    for(const point of aimFramingPoints(frame!)) {
     const projected=projectFramingPoint(point,pose,aspect)!;
     expect(projected.x).toBeGreaterThanOrEqual(-1+DEFAULT_CAMERA_SAFETY.left*2-.001);
     expect(projected.x).toBeLessThanOrEqual(1-DEFAULT_CAMERA_SAFETY.right*2+.001);
     expect(projected.y).toBeGreaterThanOrEqual(-1+DEFAULT_CAMERA_SAFETY.bottom*2-.001);
     expect(projected.y).toBeLessThanOrEqual(1-DEFAULT_CAMERA_SAFETY.top*2+.001);
    }
   }
  });
 }
});

describe('actual outgoing route does not depend on a different ideal cue route',()=>{
 it('keeps the indicated pocket when a blocker invalidates only the alternate ideal shot',()=>{
  const world=thinCutWorld(),angle=-.2787;
  const center=aimAngleForPocketOffset(world,1,1,0)!;
  const cue=world.balls.find(b=>b.number===0)!,blocker=world.balls.find(b=>b.number===2)!;blocker.active=true;
  const side=Math.sign(Math.sin(angle-center))||1;
  blocker.x=cue.x+Math.sin(center)*.8-Math.cos(center)*side*(TABLE.ballRadius*2-.00001);
  blocker.z=cue.z-Math.cos(center)*.8-Math.sin(center)*side*(TABLE.ballRadius*2-.00001);
  expect(firstObjectHit(world,angle)).toBe(1);
  expect(aimSolutionForPocket(world,1,1,angle)).toBeNull();
  expect(cameraFramingForAim(world,angle,[1],DEFAULT_CAMERA_SAFETY)).toMatchObject({targetNumber:1,pocketIndex:1});
 });
});
