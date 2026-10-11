/* 胜局分享展示层：一次烟花庆祝 → 自动生成庆祝卡 → 玩家点击原生分享；不更改对局结果。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameMode } from '../opponent/model';
import { miniToolApi, renderVictoryCard, shareFailure, postVictoryNote } from '../minitool/share-note';

import { VictoryCelebration } from './VictoryCelebration';

export function VictoryShare({ mode, shots }: { mode: GameMode; shots?: number }) {
  const [celebrating, setCelebrating] = useState(true);
  const [image, setImage] = useState('');
  const [generating, setGenerating] = useState(false);
  const rendering = useRef(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const preview = useCallback(async () => {
    if (rendering.current) return;
    rendering.current = true; setCelebrating(false); setGenerating(true);
    try {
      const card = await renderVictoryCard(mode, shots);
      if (mounted.current) { setImage(card); setStatus(''); }
    } catch { if (mounted.current) setStatus('战绩卡生成失败，请重试。'); }
    finally { rendering.current = false; if (mounted.current) setGenerating(false); }
  }, [mode, shots]);
  const share = async () => {
    if (pending.current) return;
    const api = miniToolApi();
    if (!api) { setStatus('请在小红书内打开小工具后分享。'); return; }
    pending.current = true; setBusy(true); setStatus('请在小红书笔记页继续编辑或取消。');
    try {
      await postVictoryNote(api, image, mode);
      if (mounted.current) setStatus('已返回战绩卡，笔记状态请在小红书中查看。');
    } catch (error) {
      if (mounted.current) setStatus(shareFailure(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section className="victory-share" aria-label="胜局分享">
    {celebrating && <VictoryCelebration onComplete={preview} />}
    {celebrating ? <p>正在庆祝胜局…</p> : generating ? <p role="status">正在生成胜局卡…</p> : !image ? <button type="button" className="share-primary" onClick={preview}>分享我的胜局</button> : <>
      <img src={image} alt="公主请开球胜局战绩卡" width="1080" height="1440" />
      <button type="button" className="share-primary" onClick={share} disabled={busy}>
        {busy ? '等待小红书返回…' : '分享到小红书笔记'}
      </button>
      {!miniToolApi() && <p>当前可预览战绩卡，请在小红书内分享。</p>}
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
