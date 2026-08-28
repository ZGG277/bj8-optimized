/*
[INPUT]: 依赖 Scene3D、物理/规则 ref、瞄准与相机派生状态
[OUTPUT]: 建立/销毁 Three.js 场景，并以 world / aim / visibility / camera 四条去耦通道同步 React 事实
[POS]: React 与 Scene3D 之间的唯一桥接层；只做生命周期和渲染通道调度，不决定球局或相机迁移
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { cloneWorld, getCueBall, type BilliardsWorld, type CueSpin } from '../physics';
import { legalNumbers } from '../match/match-machine';
import type { MatchState } from '../match/types';
import { findPrecisionAim } from '../aim/aim-solution';
import { Scene3D } from '../Scene3D';
import type { CameraRenderState, CameraState } from '../camera-state';

type SceneBridgeOptions = {
  containerRef: RefObject<HTMLDivElement>;
  scene3DRef: MutableRefObject<Scene3D | null>;
  worldRef: MutableRefObject<BilliardsWorld>;
  worldView: BilliardsWorld;
  setWorldView: Dispatch<SetStateAction<BilliardsWorld>>;
  matchRef: MutableRefObject<MatchState>;
  setMatch: Dispatch<SetStateAction<MatchState>>;
  matchPhase: MatchState['phase'];
  aim: number;
  aimRef: MutableRefObject<number>;
  spin: CueSpin;
  previewPower: number;
  aimGhostDistRef: MutableRefObject<number | null>;
  aimAssistVisible: boolean;
  legalTargets: number[];
  cameraRender: CameraRenderState;
  cameraStateRef: MutableRefObject<CameraState>;
  cameraAzimuthRef: MutableRefObject<number>;
  cameraViewAzimuthRef: MutableRefObject<number>;
};

export function useSceneBridge({
  containerRef,
  scene3DRef,
  worldRef,
  worldView,
  setWorldView,
  matchRef,
  setMatch,
  matchPhase,
  aim,
  aimRef,
  spin,
  previewPower,
  aimGhostDistRef,
  aimAssistVisible,
  legalTargets,
  cameraRender,
  cameraStateRef,
  cameraAzimuthRef,
  cameraViewAzimuthRef,
}: SceneBridgeOptions) {
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const scene = new Scene3D(element);
    scene3DRef.current = scene;
    scene.start();

    if (import.meta.env.DEV) {
      (window as unknown as { __bj8: unknown }).__bj8 = {
        world: worldRef,
        scene: scene3DRef,
        aim: aimRef,
        match: matchRef,
        cameraState: cameraStateRef,
        cameraAzimuth: cameraAzimuthRef,
        cameraViewAzimuth: cameraViewAzimuthRef,
        precisionAt: (angle: number, multiplier?: number) => findPrecisionAim(
          worldRef.current,
          angle,
          legalNumbers(worldRef.current, 'player', matchRef.current.playerGroup),
          multiplier,
        ),
        sync: () => setWorldView(cloneWorld(worldRef.current)),
        setMatch: (patch: Partial<MatchState>) => setMatch(current => ({
          ...current,
          ...patch,
        })),
      };
    }

    return () => {
      scene.dispose();
      scene3DRef.current = null;
    };
  // 场景只按 DOM 容器生命周期建立；业务事实通过下方独立 effect 同步。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene3DRef.current?.sync(worldView);
  }, [scene3DRef, worldView]);

  useEffect(() => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const cue = getCueBall(worldRef.current);
    aimRef.current = aim;
    scene.setAim(aim);
    scene.setSpin(spin);
    scene.setAimGhostDist(aimGhostDistRef.current);
    scene.updateCue(cue?.x ?? 0, cue?.z ?? 0, previewPower, matchPhase);
  }, [
    aim,
    aimGhostDistRef,
    aimRef,
    matchPhase,
    previewPower,
    scene3DRef,
    spin,
    worldRef,
  ]);

  useEffect(() => {
    scene3DRef.current?.setAimAssistVisible(aimAssistVisible);
  }, [aimAssistVisible, scene3DRef]);

  useEffect(() => {
    scene3DRef.current?.setLegalTargets(legalTargets);
  }, [legalTargets, scene3DRef]);

  useEffect(() => {
    scene3DRef.current?.syncCamera(
      cameraRender.viewLevel,
      cameraRender.cameraAzimuth,
      cameraRender.cueX,
      cameraRender.cueZ,
      cameraRender.previewPower,
    );
  }, [
    cameraRender.cameraAzimuth,
    cameraRender.cueX,
    cameraRender.cueZ,
    cameraRender.previewPower,
    cameraRender.viewLevel,
    scene3DRef,
  ]);
}
