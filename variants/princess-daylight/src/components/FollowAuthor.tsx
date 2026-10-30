import { useEffect, useState } from 'react';
import { getFollowController, type FollowState } from '../minitool/follow-author';
import '../styles/follow-author.css';

/** Secondary menu/result entry. No dialog is opened by mounting or querying. */
export function FollowAuthor() {
  const [state, setState] = useState<FollowState>({ phase: 'idle', status: -1, notice: '' });
  useEffect(() => {
    const controller = getFollowController();
    const unsubscribe = controller.subscribe(setState);
    setState(controller.getState());
    void controller.start();
    return unsubscribe;
  }, []);
  if (state.phase === 'idle' || state.phase === 'unsupported' || state.phase === 'querying') return null;
  if (state.status === 2) return null;
  const retry = state.phase === 'error';
  const disabled = !retry && (state.phase !== 'ready' || state.status !== 0);
  const label = retry ? '重试关注状态' : state.status === 1 ? '已关注作者' : state.phase === 'pending' ? '等待确认' : '关注作者';
  return <div className="follow-author-entry">
    <button type="button" className="follow-author-button" disabled={disabled} onClick={() => {
      const controller = getFollowController();
      void (retry ? controller.retry() : controller.follow());
    }}>{label}</button>
    {state.notice && <p role="status">{state.notice}</p>}
  </div>;
}
