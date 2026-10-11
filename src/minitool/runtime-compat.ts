/** Small fallbacks for APIs/layout actually used by this product. No UA checks. */
let prepared = false;
export function prepareCompatibility() {
  if (prepared) return;
  prepared = true;
  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true,
      value: function<T, U>(this: T[], map: (value: T, index: number, array: T[]) => U | U[], context?: unknown) {
        const out: U[] = [];
        this.forEach((value, index, array) => {
          const result = map.call(context, value, index, array);
          if (Array.isArray(result)) result.forEach(item => out.push(item)); else out.push(result);
        });
        return out;
      },
    });
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
  probe.appendChild(document.createElement('div')); probe.appendChild(document.createElement('div'));
  document.body.appendChild(probe);
  const flexGap = probe.scrollHeight === 1;
  probe.remove();
  if (flexGap) return;
  // Only old engines need this path. Child margins follow the active responsive CSS gap values.
  const tracked = new Map<HTMLElement, { left: string; top: string }>();
  let timer = 0;
  function update() {
    timer = 0;
    tracked.forEach((original, child) => { child.style.marginLeft = original.left; child.style.marginTop = original.top; });
    tracked.clear();
    document.querySelectorAll<HTMLElement>('#root *').forEach(parent => {
      const style = getComputedStyle(parent);
      if (style.display !== 'flex' && style.display !== 'inline-flex') return;
      const column = style.flexDirection.indexOf('column') === 0;
      const gap = style.getPropertyValue(column ? '--minitool-row-gap' : '--minitool-column-gap').trim();
      if (!gap || gap === '0' || gap === '0px') return;
      const children = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && getComputedStyle(child).display !== 'none');
      children.slice(1).forEach(child => {
        tracked.set(child, { left: child.style.marginLeft, top: child.style.marginTop });
        const original = getComputedStyle(child)[column ? 'marginTop' : 'marginLeft'];
        child.style[column ? 'marginTop' : 'marginLeft'] = `calc(${original} + ${gap})`;
      });
    });
  }
  function schedule() { if (!timer) timer = window.setTimeout(update, 0); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('root')!, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', schedule);
  schedule();
}
// Evaluate before Game's dependency graph, which computes table geometry at module load.
if (import.meta.env.VITE_MINITOOL === '1' && typeof document !== 'undefined') prepareCompatibility();
