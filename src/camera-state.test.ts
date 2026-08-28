/*
[INPUT]: 依赖 camera-state 纯相机状态机与 vitest
[OUTPUT]: 回归模式迁移、有效瞄准落位聚焦、完整临时快照、观战交棒、锁镜、冻结击球锚点与结果全景
[POS]: 相机领域层的确定性门禁，不创建 React、DOM 或 WebGL 上下文
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  cameraInteractionFor,
  cameraReducer,
  createCameraState,
  renderCameraState,
  snapshotCamera,
} from './camera-state';

describe('camera-state', () => {
  it('shot / tactical 往返各自恢复高度和方位，不改世界 aim', () => {
    let state = createCameraState({ mode: 'shot', level: 0.18, azimuth: 0.3 });
    state = cameraReducer(state, { type: 'ENTER_TACTICAL', level: 0.84, azimuth: -0.7 });
    state = cameraReducer(state, { type: 'SET_LEVEL', level: 0.72 });
    state = cameraReducer(state, { type: 'SET_AZIMUTH', azimuth: -1.1 });
    state = cameraReducer(state, { type: 'ENTER_SHOT', aim: 1.25 });

    expect(state.mode).toBe('shot');
    expect(state.poses.shot.level).toBeCloseTo(0.18);
    expect(state.poses.shot.azimuth).toBeCloseTo(1.25);
    expect(state.poses.tactical).toEqual({ level: 0.72, azimuth: -1.1 });

    const render = renderCameraState(state, {
      aim: 1.25,
      liveCue: { cueX: 0.1, cueZ: 0.2 },
      previewPower: 40,
    });
    expect(render.cameraAzimuth).toBeCloseTo(1.25);
  });

  it('幽灵球落位强制进入第一人称并对齐世界杆向', () => {
    let state = createCameraState({ mode: 'tactical', level: 0.86, azimuth: -0.8 });
    state = cameraReducer(state, { type: 'AIM_ESTABLISHED', aim: 1.35 });

    expect(state.mode).toBe('shot');
    expect(state.poses.shot).toEqual({ level: 0, azimuth: 1.35 });
    expect(state.orbitActive).toBe(false);
    expect(state.phase).toEqual({ kind: 'steady' });
  });

  it('幽灵球落位到击球观察形成第一人称→保持→全局的完整节奏', () => {
    let state = createCameraState({ mode: 'tactical', level: 1, azimuth: 0 });
    state = cameraReducer(state, { type: 'AIM_ESTABLISHED', aim: -0.72 });
    expect(state.mode).toBe('shot');
    expect(state.poses.shot.level).toBe(0);

    state = cameraReducer(state, {
      type: 'STRIKE_CONTACT',
      anchor: { cueX: 0.12, cueZ: 0.48 },
      level: state.poses.shot.level,
      azimuth: state.poses.shot.azimuth,
      previewPower: 64,
    });
    expect(state.phase.kind).toBe('strike-hold');

    state = cameraReducer(state, { type: 'STRIKE_HOLD_ELAPSED' });
    expect(state.mode).toBe('tactical');
    expect(state.poses.tactical.level).toBe(1);
    expect(state.phase.kind).toBe('outcome-overview');
  });

  it('临时规划完整恢复 mode / 三套 pose / orbit，错误 owner 不生效', () => {
    let state = createCameraState({ mode: 'tactical', level: 0.68, azimuth: 0.9 });
    state = cameraReducer(state, { type: 'TOGGLE_ORBIT' });
    const before = snapshotCamera(state);

    state = cameraReducer(state, {
      type: 'TEMP_ENTER',
      owner: 'plan',
      level: 1,
      azimuth: 0,
    });
    state = cameraReducer(state, { type: 'SET_LEVEL', level: 0.91 });
    const wrongOwner = cameraReducer(state, { type: 'TEMP_EXIT', owner: 'review' });
    expect(wrongOwner).toEqual(state);

    state = cameraReducer(state, { type: 'TEMP_EXIT', owner: 'plan' });
    expect(snapshotCamera(state)).toEqual(before);
    expect(state.phase).toEqual({ kind: 'steady' });
  });

  it('重复临时进入不覆盖首份快照，观战进入会清除陈旧快照', () => {
    let state = createCameraState({ mode: 'shot', level: 0.22, azimuth: 0.4 });
    state = cameraReducer(state, {
      type: 'TEMP_ENTER', owner: 'plan', level: 1, azimuth: 0,
    });
    const once = state;
    state = cameraReducer(state, {
      type: 'TEMP_ENTER', owner: 'review', level: 0.8, azimuth: 2,
    });
    expect(state).toEqual(once);

    state = cameraReducer(state, {
      type: 'SPECTATOR_ENTER', level: 0.82, azimuth: -0.5,
    });
    expect(state.phase).toEqual({ kind: 'steady' });
    expect(state.mode).toBe('spectator');
    expect(cameraReducer(state, { type: 'TEMP_EXIT', owner: 'plan' })).toEqual(state);
  });

  it('观战交棒继承全台高度和方位，随后仍可一键进入 shot', () => {
    let state = createCameraState();
    state = cameraReducer(state, {
      type: 'SPECTATOR_ENTER', level: 0.9, azimuth: -1.2,
    });
    state = cameraReducer(state, { type: 'SPECTATOR_EXIT' });
    expect(state.mode).toBe('tactical');
    expect(state.poses.tactical).toEqual({ level: 0.9, azimuth: -1.2 });

    state = cameraReducer(state, { type: 'ENTER_SHOT', aim: 0.75 });
    expect(state.mode).toBe('shot');
    expect(state.poses.shot.azimuth).toBeCloseTo(0.75);
  });

  it('观战期打开复盘后交棒，关闭临时视图不会恢复成过期 spectator', () => {
    let state = createCameraState();
    state = cameraReducer(state, {
      type: 'SPECTATOR_ENTER', level: 0.9, azimuth: -0.8,
    });
    state = cameraReducer(state, {
      type: 'TEMP_ENTER', owner: 'review', level: 1, azimuth: 0,
    });
    state = cameraReducer(state, { type: 'SPECTATOR_EXIT' });
    state = cameraReducer(state, { type: 'TEMP_EXIT', owner: 'review' });

    expect(state.mode).toBe('tactical');
    expect(state.poses.tactical).toEqual({ level: 0.9, azimuth: -0.8 });
    expect(state.phase).toEqual({ kind: 'steady' });
  });

  it('瞄准锁镜只冻结 shot 视觉方位，释放后重新跟随 aim', () => {
    let state = createCameraState({ mode: 'shot', level: 0.1, azimuth: 0.2 });
    state = cameraReducer(state, { type: 'AIM_LOCK', azimuth: 0.45 });
    const locked = renderCameraState(state, {
      aim: 1.1,
      liveCue: { cueX: 0, cueZ: 0.5 },
      previewPower: 0,
    });
    expect(locked.cameraAzimuth).toBeCloseTo(0.45);

    state = cameraReducer(state, { type: 'AIM_RELEASE' });
    const released = renderCameraState(state, {
      aim: 1.1,
      liveCue: { cueX: 0, cueZ: 0.5 },
      previewPower: 0,
    });
    expect(released.cameraAzimuth).toBeCloseTo(1.1);
  });

  it('出杆保持冻结母球锚点，计时后原方位抬升全台', () => {
    let state = createCameraState({ mode: 'shot', level: 0.12, azimuth: 0.6 });
    state = cameraReducer(state, {
      type: 'STRIKE_CONTACT',
      anchor: { cueX: 0.08, cueZ: 0.52 },
      level: 0.12,
      azimuth: 0.6,
      previewPower: 72,
    });
    const held = renderCameraState(state, {
      aim: -2,
      liveCue: { cueX: -0.4, cueZ: -0.9 },
      previewPower: 0,
    });
    expect(held).toMatchObject({
      phase: 'strike-hold',
      cueX: 0.08,
      cueZ: 0.52,
      viewLevel: 0.12,
      cameraAzimuth: 0.6,
    });

    state = cameraReducer(state, { type: 'STRIKE_HOLD_ELAPSED' });
    const overview = renderCameraState(state, {
      aim: -2,
      liveCue: { cueX: -0.4, cueZ: -0.9 },
      previewPower: 0,
    });
    expect(overview).toMatchObject({
      mode: 'tactical',
      phase: 'outcome-overview',
      cueX: 0.08,
      cueZ: 0.52,
      viewLevel: 1,
      cameraAzimuth: 0.6,
    });
  });

  it('摆球优先使用 aim，tactical 只有显式环绕时才消费 orbit', () => {
    let state = createCameraState({ mode: 'tactical' });
    expect(cameraInteractionFor(state, true)).toBe('aim');
    expect(cameraInteractionFor(state, false)).toBe('aim');
    state = cameraReducer(state, { type: 'TOGGLE_ORBIT' });
    expect(cameraInteractionFor(state, false)).toBe('orbit');
    state = cameraReducer(state, {
      type: 'SPECTATOR_ENTER', level: 0.82, azimuth: 0,
    });
    expect(cameraInteractionFor(state, false)).toBe('orbit');
  });

  it('reset 清理临时/锁镜/结果阶段与 orbit', () => {
    let state = createCameraState({ mode: 'tactical' });
    state = cameraReducer(state, { type: 'TOGGLE_ORBIT' });
    state = cameraReducer(state, {
      type: 'TEMP_ENTER', owner: 'review', level: 1, azimuth: 0,
    });
    state = cameraReducer(state, {
      type: 'RESET', mode: 'tactical', level: 1, azimuth: 0,
    });
    expect(state).toEqual(createCameraState({ mode: 'tactical', level: 1, azimuth: 0 }));
  });
});
