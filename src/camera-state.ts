/*
[INPUT]: 依赖连续视角几何常量、世界瞄准角、实时/冻结母球锚点与显式相机事件
[OUTPUT]: 对外提供 shot/tactical/spectator 相机纯状态机、母球/点台/幽灵球有效落位聚焦、临时视图快照、击球结果阶段与唯一渲染状态
[POS]: 相机领域层；不依赖 React/DOM/Three.js，所有模式迁移先在此成为可测试事实
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  FIRST_PERSON_VIEW,
  FULL_TABLE_AZIMUTH,
  OVERHEAD_VIEW,
  SPECTATOR_VIEW_LEVEL,
  clampViewLevel,
  normalizeCameraAzimuth,
} from './camera-view';

export type CameraMode = 'shot' | 'tactical' | 'spectator';
export type TemporaryCameraOwner = 'plan' | 'review';

export type CameraPoseMemory = {
  level: number;
  azimuth: number;
};

export type CameraAnchor = {
  cueX: number;
  cueZ: number;
};

export type CameraSnapshot = {
  mode: CameraMode;
  poses: Record<CameraMode, CameraPoseMemory>;
  orbitActive: boolean;
};

export type CameraPhase =
  | { kind: 'steady' }
  | { kind: 'aim-lock' }
  | { kind: 'temporary'; owner: TemporaryCameraOwner; restore: CameraSnapshot }
  | {
      kind: 'strike-hold';
      anchor: CameraAnchor;
      level: number;
      azimuth: number;
      previewPower: number;
    }
  | {
      kind: 'outcome-overview';
      anchor: CameraAnchor;
      level: number;
      azimuth: number;
    };

export type CameraState = CameraSnapshot & {
  phase: CameraPhase;
};

export type CameraRenderState = {
  mode: CameraMode;
  phase: CameraPhase['kind'];
  viewLevel: number;
  cameraAzimuth: number;
  cueX: number;
  cueZ: number;
  previewPower: number;
};

export type CameraAction =
  | { type: 'SET_LEVEL'; level: number }
  | { type: 'SET_AZIMUTH'; azimuth: number }
  | { type: 'ENTER_SHOT'; aim: number }
  | { type: 'AIM_ESTABLISHED'; aim: number }
  | { type: 'ENTER_TACTICAL'; level?: number; azimuth?: number }
  | { type: 'SPECTATOR_ENTER'; level: number; azimuth: number }
  | { type: 'SPECTATOR_EXIT' }
  | { type: 'TOGGLE_ORBIT' }
  | { type: 'RECENTER'; level: number; azimuth: number }
  | { type: 'AIM_LOCK'; azimuth: number }
  | { type: 'AIM_RELEASE' }
  | {
      type: 'TEMP_ENTER';
      owner: TemporaryCameraOwner;
      level: number;
      azimuth: number;
    }
  | { type: 'TEMP_EXIT'; owner: TemporaryCameraOwner }
  | {
      type: 'STRIKE_CONTACT';
      anchor: CameraAnchor;
      level: number;
      azimuth: number;
      previewPower: number;
    }
  | { type: 'STRIKE_HOLD_ELAPSED'; overviewLevel?: number }
  | { type: 'SHOT_SETTLED'; overviewLevel?: number }
  | {
      type: 'RESET';
      mode?: CameraMode;
      level?: number;
      azimuth?: number;
    };

const pose = (level: number, azimuth: number): CameraPoseMemory => ({
  level: clampViewLevel(level),
  azimuth: normalizeCameraAzimuth(azimuth),
});

const clonePoses = (
  poses: Record<CameraMode, CameraPoseMemory>,
): Record<CameraMode, CameraPoseMemory> => ({
  shot: { ...poses.shot },
  tactical: { ...poses.tactical },
  spectator: { ...poses.spectator },
});

export function createCameraState(options: {
  mode?: CameraMode;
  level?: number;
  azimuth?: number;
} = {}): CameraState {
  const mode = options.mode ?? 'shot';
  const azimuth = normalizeCameraAzimuth(options.azimuth ?? FULL_TABLE_AZIMUTH);
  const defaultLevel = mode === 'shot' ? FIRST_PERSON_VIEW : SPECTATOR_VIEW_LEVEL;
  const selectedLevel = clampViewLevel(options.level ?? defaultLevel);
  const poses: Record<CameraMode, CameraPoseMemory> = {
    shot: pose(FIRST_PERSON_VIEW, azimuth),
    tactical: pose(SPECTATOR_VIEW_LEVEL, azimuth),
    spectator: pose(SPECTATOR_VIEW_LEVEL, azimuth),
  };
  poses[mode] = pose(selectedLevel, azimuth);
  return {
    mode,
    poses,
    orbitActive: false,
    phase: { kind: 'steady' },
  };
}

export function snapshotCamera(state: CameraState): CameraSnapshot {
  return {
    mode: state.mode,
    poses: clonePoses(state.poses),
    orbitActive: state.orbitActive,
  };
}

function restoreSnapshot(snapshot: CameraSnapshot): CameraState {
  return {
    mode: snapshot.mode,
    poses: clonePoses(snapshot.poses),
    orbitActive: snapshot.orbitActive,
    phase: { kind: 'steady' },
  };
}

function withCurrentPose(
  state: CameraState,
  nextPose: CameraPoseMemory,
): CameraState {
  return {
    ...state,
    poses: {
      ...state.poses,
      [state.mode]: nextPose,
    },
  };
}

function overviewState(
  state: CameraState,
  phase: Extract<CameraPhase, { kind: 'strike-hold' | 'outcome-overview' }>,
  overviewLevel = OVERHEAD_VIEW,
): CameraState {
  const level = clampViewLevel(overviewLevel);
  const tactical = pose(level, phase.azimuth);
  return {
    ...state,
    mode: 'tactical',
    poses: {
      ...state.poses,
      tactical,
    },
    orbitActive: false,
    phase: {
      kind: 'outcome-overview',
      anchor: { ...phase.anchor },
      level,
      azimuth: tactical.azimuth,
    },
  };
}

/**
 * 相机 reducer 只接受显式事件：高度不会暗中切模式，模式也不会改写世界 aim。
 * 临时视图、出杆保持和观战会清理不再有效的手势状态。
 */
export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  switch (action.type) {
    case 'SET_LEVEL':
      if (state.phase.kind === 'strike-hold' || state.phase.kind === 'outcome-overview') {
        return state;
      }
      return withCurrentPose(
        state,
        pose(action.level, state.poses[state.mode].azimuth),
      );

    case 'SET_AZIMUTH':
      if (state.phase.kind === 'strike-hold' || state.phase.kind === 'outcome-overview') {
        return state;
      }
      return withCurrentPose(
        state,
        pose(state.poses[state.mode].level, action.azimuth),
      );

    case 'ENTER_SHOT':
      if (state.phase.kind === 'temporary') return state;
      return {
        ...state,
        mode: 'shot',
        poses: {
          ...state.poses,
          shot: pose(state.poses.shot.level, action.aim),
        },
        orbitActive: false,
        phase: { kind: 'steady' },
      };

    case 'AIM_ESTABLISHED':
      if (state.phase.kind === 'temporary') return state;
      return {
        ...state,
        mode: 'shot',
        poses: {
          ...state.poses,
          shot: pose(FIRST_PERSON_VIEW, action.aim),
        },
        orbitActive: false,
        phase: { kind: 'steady' },
      };

    case 'ENTER_TACTICAL': {
      if (state.phase.kind === 'temporary') return state;
      const current = state.poses.tactical;
      const tactical = pose(
        action.level ?? current.level,
        action.azimuth ?? current.azimuth,
      );
      return {
        ...state,
        mode: 'tactical',
        poses: { ...state.poses, tactical },
        orbitActive: false,
        phase: { kind: 'steady' },
      };
    }

    case 'SPECTATOR_ENTER': {
      const spectator = pose(
        Math.max(SPECTATOR_VIEW_LEVEL, action.level),
        action.azimuth,
      );
      return {
        ...state,
        mode: 'spectator',
        poses: { ...state.poses, spectator },
        orbitActive: false,
        phase: { kind: 'steady' },
      };
    }

    case 'SPECTATOR_EXIT': {
      if (
        state.phase.kind === 'temporary' &&
        state.phase.restore.mode === 'spectator'
      ) {
        const restore = state.phase.restore;
        const tactical = { ...restore.poses.spectator };
        return {
          ...state,
          phase: {
            ...state.phase,
            restore: {
              ...restore,
              mode: 'tactical',
              poses: { ...restore.poses, tactical },
              orbitActive: false,
            },
          },
        };
      }
      if (state.mode !== 'spectator') return state;
      const tactical = { ...state.poses.spectator };
      return {
        ...state,
        mode: 'tactical',
        poses: { ...state.poses, tactical },
        orbitActive: false,
        phase: { kind: 'steady' },
      };
    }

    case 'TOGGLE_ORBIT':
      if (state.phase.kind === 'temporary') return state;
      if (state.mode === 'shot') {
        return {
          ...state,
          mode: 'tactical',
          orbitActive: true,
          phase: { kind: 'steady' },
        };
      }
      if (state.mode === 'spectator') return state;
      return { ...state, orbitActive: !state.orbitActive };

    case 'RECENTER': {
      const mode = state.mode === 'shot' ? 'tactical' : state.mode;
      const nextPose = pose(Math.max(action.level, SPECTATOR_VIEW_LEVEL), action.azimuth);
      return {
        ...state,
        mode,
        poses: { ...state.poses, [mode]: nextPose },
        phase: state.phase.kind === 'temporary' ? state.phase : { kind: 'steady' },
      };
    }

    case 'AIM_LOCK':
      if (state.mode !== 'shot' || state.phase.kind !== 'steady') return state;
      return {
        ...withCurrentPose(
          state,
          pose(state.poses.shot.level, action.azimuth),
        ),
        phase: { kind: 'aim-lock' },
      };

    case 'AIM_RELEASE':
      return state.phase.kind === 'aim-lock'
        ? { ...state, phase: { kind: 'steady' } }
        : state;

    case 'TEMP_ENTER': {
      if (state.phase.kind === 'temporary') return state;
      if (state.phase.kind === 'strike-hold' || state.phase.kind === 'outcome-overview') {
        return state;
      }
      const restore = snapshotCamera(state);
      return {
        ...state,
        mode: 'tactical',
        poses: {
          ...state.poses,
          tactical: pose(action.level, action.azimuth),
        },
        orbitActive: false,
        phase: { kind: 'temporary', owner: action.owner, restore },
      };
    }

    case 'TEMP_EXIT':
      return state.phase.kind === 'temporary' && state.phase.owner === action.owner
        ? restoreSnapshot(state.phase.restore)
        : state;

    case 'STRIKE_CONTACT': {
      const level = clampViewLevel(action.level);
      const azimuth = normalizeCameraAzimuth(action.azimuth);
      return {
        ...state,
        orbitActive: false,
        phase: {
          kind: 'strike-hold',
          anchor: { ...action.anchor },
          level,
          azimuth,
          previewPower: Math.max(0, action.previewPower),
        },
      };
    }

    case 'STRIKE_HOLD_ELAPSED':
      return state.phase.kind === 'strike-hold'
        ? overviewState(state, state.phase, action.overviewLevel)
        : state;

    case 'SHOT_SETTLED':
      if (state.phase.kind !== 'strike-hold' && state.phase.kind !== 'outcome-overview') {
        return state;
      }
      return {
        ...overviewState(state, state.phase, action.overviewLevel),
        phase: { kind: 'steady' },
      };

    case 'RESET':
      return createCameraState({
        mode: action.mode,
        level: action.level,
        azimuth: action.azimuth,
      });
  }
}

export function currentCameraLevel(state: CameraState): number {
  if (state.phase.kind === 'strike-hold' || state.phase.kind === 'outcome-overview') {
    return state.phase.level;
  }
  return state.poses[state.mode].level;
}

export function currentCameraAzimuth(state: CameraState): number {
  if (state.phase.kind === 'strike-hold' || state.phase.kind === 'outcome-overview') {
    return state.phase.azimuth;
  }
  return state.poses[state.mode].azimuth;
}

/** Scene3D 与输入层都消费同一份派生状态，避免相机/拾取各算一套模式。 */
export function renderCameraState(
  state: CameraState,
  options: {
    aim: number;
    liveCue: CameraAnchor;
    previewPower: number;
  },
): CameraRenderState {
  if (state.phase.kind === 'strike-hold') {
    return {
      mode: state.mode,
      phase: state.phase.kind,
      viewLevel: state.phase.level,
      cameraAzimuth: state.phase.azimuth,
      cueX: state.phase.anchor.cueX,
      cueZ: state.phase.anchor.cueZ,
      previewPower: state.phase.previewPower,
    };
  }
  if (state.phase.kind === 'outcome-overview') {
    return {
      mode: state.mode,
      phase: state.phase.kind,
      viewLevel: state.phase.level,
      cameraAzimuth: state.phase.azimuth,
      cueX: state.phase.anchor.cueX,
      cueZ: state.phase.anchor.cueZ,
      previewPower: 0,
    };
  }

  const selected = state.poses[state.mode];
  const followsAim = state.mode === 'shot' && state.phase.kind !== 'aim-lock';
  return {
    mode: state.mode,
    phase: state.phase.kind,
    viewLevel: selected.level,
    cameraAzimuth: followsAim
      ? normalizeCameraAzimuth(options.aim)
      : selected.azimuth,
    cueX: options.liveCue.cueX,
    cueZ: options.liveCue.cueZ,
    previewPower: Math.max(0, options.previewPower),
  };
}

export function cameraInteractionFor(
  state: CameraState,
  placementActive: boolean,
): 'aim' | 'orbit' {
  if (placementActive) return 'aim';
  return state.mode === 'spectator' || state.orbitActive ? 'orbit' : 'aim';
}
