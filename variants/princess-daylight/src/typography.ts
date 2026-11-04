/**
 * [INPUT]: 包内霞鹜文楷子集及浏览器字体加载接口。
 * [OUTPUT]: UI/Canvas共同字体栈、字号构造与加载完成门禁。
 * [POS]: 呈现资源边界，避免一次性Canvas文字在字体加载前永久固化成系统字。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
export const UI_FONT_FAMILY = 'Princess WenKai UI';
export const UI_FONT_STACK = `"${UI_FONT_FAMILY}", serif`;
export const canvasFont = (size: number, weight = 400) => `${weight} ${size}px ${UI_FONT_STACK}`;
let loading: Promise<void> | null = null;
export function ensureUiFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  if (!loading) loading = document.fonts.load(`16px "${UI_FONT_FAMILY}"`, '公主请开球赞美卡0123456789')
    .then(() => document.fonts.ready).then(() => {}).catch(error => { loading = null; throw error; });
  return loading;
}
