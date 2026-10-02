/* 胜局分享展示层：本地预览 → 玩家点击原生分享；不更改对局结果。 */
import { useEffect, useRef, useState } from 'react';
import type { GameMode } from '../opponent/model';
import { miniToolApi, renderVictoryCard, shareFailure, victoryNote } from '../minitool/share-note';

export function VictoryShare({ mode }: { mode: GameMode }) {
  const [image, setImage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const preview = () => {
    try { setImage(renderVictoryCard(mode)); setStatus(''); }
    catch { setStatus('战绩卡生成失败，请重试。'); }
  };
  const share = async () => {
    if (pending.current) return;
    const api = miniToolApi();
    if (!api) { setStatus('请在小红书内打开小工具后分享。'); return; }
    pending.current = true; setBusy(true); setStatus('请在小红书笔记页继续编辑或取消。');
    try {
      await api.postNote(victoryNote(image, mode));
      if (mounted.current) setStatus('已返回战绩卡，笔记状态请在小红书中查看。');
    } catch (error) {
      if (mounted.current) setStatus(shareFailure(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section className="victory-share" aria-label="胜局分享">
    {!image ? <button type="button" className="share-primary" onClick={preview}>分享我的胜局</button> : <>
      <img src={image} alt="瓜瓜台球胜局战绩卡" width="720" height="960" />
      <button type="button" className="share-primary" onClick={share} disabled={busy}>
        {busy ? '等待小红书返回…' : '分享到小红书笔记'}
      </button>
      {!miniToolApi() && <p>当前可预览战绩卡，请在小红书内分享。</p>}
      <button type="button" className="share-collapse" onClick={() => setImage('')} disabled={busy}>收起战绩卡</button>
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
