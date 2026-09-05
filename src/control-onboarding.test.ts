/*
[INPUT]: control-onboarding 的纯逐控件存储模型与可注入存储
[OUTPUT]: 独立学习、重载保持、损坏数据、受限存储、多标签合并与订阅回归
[POS]: 控件提示领域单测；不依赖浏览器或对局世界
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it, vi } from 'vitest';
import {
  CONTROL_LEARNING_STORAGE_KEY,
  CONTROL_TIPS,
  createControlLearningStore,
  isControlTipId,
  shouldShowControlTip,
} from './control-onboarding';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: vi.fn((_key: string, next: string) => { value = next; }) };
}

describe('逐控件新手记忆', () => {
  it('查看并不学习，成功只关闭该控件，刷新仍记得', () => {
    const storage = memoryStorage();
    const store = createControlLearningStore(() => storage);
    expect(store.has('shoot')).toBe(false);
    expect(store.has('view-overhead')).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    store.mark('view-overhead');
    expect(store.has('view-overhead')).toBe(true);
    expect(store.has('view-first-person')).toBe(false);
    expect(store.has('shoot')).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(CONTROL_LEARNING_STORAGE_KEY, '["view-overhead"]');
    expect(createControlLearningStore(() => storage).has('view-overhead')).toBe(true);
  });

  it('同一成功只通知与持久化一次，取消订阅后不再通知', () => {
    const storage = memoryStorage();
    const store = createControlLearningStore(() => storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.mark('shoot');
    store.mark('shoot');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(store.getRevision()).toBe(1);
    unsubscribe();
    store.mark('spin');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each(['oops', '{}', 'null', '42'])('损坏或错误结构 %s 安全回到未学习', value => {
    const store = createControlLearningStore(() => memoryStorage(value));
    expect(store.has('shoot')).toBe(false);
    expect(() => store.mark('shoot')).not.toThrow();
    expect(store.has('shoot')).toBe(true);
  });

  it('只读取稳定白名单 ID，忽略未知、原型属性与非字符串', () => {
    const store = createControlLearningStore(() => memoryStorage('["shoot","constructor","future",1,null]'));
    expect(store.has('shoot')).toBe(true);
    expect(store.has('spin')).toBe(false);
    expect(isControlTipId('constructor')).toBe(false);
    expect(isControlTipId('__proto__')).toBe(false);
    expect(Object.values(CONTROL_TIPS).every(copy => copy.length <= 32 || copy.startsWith('出杆：'))).toBe(true);
  });

  it('localStorage getter、读写拒绝均不阻断当前页面学习', () => {
    for (const storage of [
      () => null,
      () => { throw new Error('SecurityError'); },
      () => ({ getItem: () => { throw new Error('read'); }, setItem: () => { throw new Error('quota'); } }),
    ]) {
      const store = createControlLearningStore(storage);
      expect(() => store.mark('shoot')).not.toThrow();
      expect(store.has('shoot')).toBe(true);
      expect(store.has('spin')).toBe(false);
    }
  });

  it('写入合并其他标签页进度，storage 事件刷新只增不减', () => {
    const storage = memoryStorage();
    const first = createControlLearningStore(() => storage);
    const second = createControlLearningStore(() => storage);
    first.has('shoot');
    second.mark('spin');
    first.mark('shoot');
    expect(first.has('spin')).toBe(true);
    second.refresh();
    expect(second.has('shoot')).toBe(true);
    storage.setItem(CONTROL_LEARNING_STORAGE_KEY, '[]');
    second.refresh();
    expect(second.has('shoot')).toBe(true);
  });

  it('三项基础操作学会后仍保留速查，其他控件仍遵循一次性隐藏', () => {
    for (const id of ['view-overhead', 'view-manual', 'shoot'] as const) {
      expect(shouldShowControlTip(id, true)).toBe(true);
    }
    expect(shouldShowControlTip('view-height', true)).toBe(false);
    expect(shouldShowControlTip('aim-dial', true)).toBe(false);
    expect(shouldShowControlTip('view-height', false)).toBe(true);
  });

  it('常驻速查使用具名、简短的基础操作文案', () => {
    expect(CONTROL_TIPS['view-overhead']).toBe('俯视：俯视全台');
    expect(CONTROL_TIPS['view-manual']).toContain('手动视角');
    expect(CONTROL_TIPS.shoot).toContain('出杆：向下拉蓄力');
    expect(CONTROL_TIPS.shoot).toContain('Enter 轻杆');
  });
});
