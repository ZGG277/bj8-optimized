/** [INPUT]: 本机真实资历；[OUTPUT]: 可返回的成绩/明确标注排序示例；[POS]: 展示层，无平台调用。 */
import { useEffect, useRef, useState } from 'react';
import { careerSummary, rankSamples, type Career } from '../opponent/career';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { RoyalIcon } from './RoyalIcon';
import '../styles/career.css';

export function CareerPanel({ career, saveFailed, onClose, onCards }: {
  career: Career; saveFailed?: boolean; onClose: () => void; onCards: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [examples, setExamples] = useState(false);
  const summary = careerSummary(career);
  useEffect(() => { close.current?.focus(); }, []);
  const rows = rankSamples([
    { id: 'a', label: '测试样本 A', completed: 30, bonus: 20, order: 1 },
    { id: 'b', label: '测试样本 B', completed: 10, bonus: 89, order: 2 },
    { id: 'c', label: '测试样本 C', completed: 10, bonus: 89, order: 3 },
    { id: 'd', label: '测试样本 D', completed: 11, bonus: 0, order: 4 },
    { id: 'me', label: '我 · 本机记录', completed: career.completed, bonus: summary.bonus, order: 5 },
  ]);
  const latest = career.recent[career.recent.length - 1];
  return <div className="career-mask" role="dialog" aria-modal="true" aria-labelledby="career-title"
    onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
    <section className="career-sheet">
      <header className="career-heading"><div><small>每一局，都算数</small><h2 id="career-title">你的球局簿</h2></div>
        <button ref={close} onClick={onClose} aria-label="收起球局簿"><RoyalIcon name="close"/></button></header>
      <nav className="career-tabs" aria-label="卡册与球局"><button onClick={onCards}>回忆卡册</button><button aria-current="page" onClick={() => setExamples(false)}>球局排行</button></nav>
      <div className="career-scroll">
        <section className="career-hero" aria-label="我的资历"><span className="career-level">{summary.level}</span>
          <div className="career-score"><strong>{summary.score}</strong><span>资历分</span></div>
          <p>完整结束 <b>{career.completed}</b> 局 · 技术加成 <b>+{summary.bonus}</b></p>
          <p className="career-next">{summary.nextAt === null ? '常来球台，继续积累。' : `再完成 ${summary.nextAt - career.completed} 局，迎接下一档。`}</p>
        </section>
        <section className="career-stats" aria-label="近期技术">
          <div><span>近局技术均分</span><strong>{summary.average === null ? '—' : summary.average}</strong><small>{summary.samples ? `最近 ${summary.samples} / 10 局有效样本` : '打完一局后开始记录'}</small></div>
          <div><span>最近一局连杆</span><strong>{latest?.bestRun ?? '—'}<small> 杆</small></strong><small>连续有合法得分的出杆</small></div>
          <div><span>最近一局多球</span><strong>{latest?.maxMulti ?? '—'}<small> 球</small></strong><small>一杆最多合法进球</small></div>
        </section>
        {career.legacyCompleted > 0 && <p className="career-note">保留旧档的 {career.legacyCompleted} 局完成记录；缺失的技术明细不补算。</p>}
        {saveFailed && <p className="career-error" role="alert">本次进度暂未保存，请保持页面打开。</p>}
        <div className="career-board-heading"><h3>{examples ? '排序样例' : '最近对局'}</h3><button onClick={() => setExamples(!examples)}>{examples ? '返回我的对局' : '查看排序样例'}</button></div>
        {examples ? <><p className="career-note">A—D 是测试样本，不是真实玩家；此处名次仅用于演示。</p>
          <ol className="career-ranking">{rows.map(row => <li key={row.id} data-self={row.id === 'me' || undefined}><b>{row.rank}</b><span>{row.label}<small>{row.completed} 局 · 技术 +{row.bonus}</small></span><strong>{row.score}</strong></li>)}</ol></>
          : career.recent.length ? <ol className="career-history">{[...career.recent].reverse().map(m => <li key={m.id}><span>{m.won ? '胜局' : '本局结束'}<small>{m.shots} 杆 · {m.legalPots} 颗合法进球</small></span><strong>{m.skill}<small> 技术分</small></strong></li>)}</ol>
            : <p className="career-empty">从下一场完整对局开始，留下你的第一条技术记录。</p>}
        <details className="career-rules"><summary>积分与等级怎么算</summary><p>完整结局 +100 分；重开与未完成的对局不计。胜负和规则判负都算一次完成。</p><p>最近最多十局有出杆的对局取技术均分，换算为 0—99 分加成。多完成一局，始终排在前面。同分按先写入顺序排列。</p><p>初级 1 局 · 熟练 10 局 · 资深 30 局 · 常驻 100 局。技术看连杆、一杆多球、得分杆比例和犯规控制，不因单局爆发覆盖长期积累。</p></details>
        <p className="career-local">当前成绩保存在本机。全服榜尚未启用。</p>
      </div>
    </section>
  </div>;
}

export function CareerBadge({ career, onClick }: { career: Career; onClick: () => void }) {
  const summary = careerSummary(career);
  return <button className="career-badge" onClick={onClick} aria-label="查看球局排行"><span>{summary.level} · {career.completed} 局</span><b>{summary.score} 分 ›</b></button>;
}
