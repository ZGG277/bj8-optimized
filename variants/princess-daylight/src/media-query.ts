/** MediaQueryList became an EventTarget after the minimum supported WebView. */
export type MotionPreference = Pick<MediaQueryList, 'matches'> & Partial<Pick<MediaQueryList,
  'addEventListener' | 'removeEventListener' | 'addListener' | 'removeListener'>>;

export function observeMediaQuery(query: MotionPreference | undefined, listener: () => void): () => void {
  if (typeof query?.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }
  query?.addListener?.(listener);
  return () => query?.removeListener?.(listener);
}
