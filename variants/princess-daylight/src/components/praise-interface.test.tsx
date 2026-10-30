import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ViewToolbar } from './ViewToolbar';
import { ControlHelp, CONTROL_HELP } from './ControlHelp';
import { CompanionCollectionBook } from './CompanionCollection';
import { collectCompanionWin, emptyCompanionCollection } from '../opponent/companion-collection';
import { COMPANIONS } from '../opponent/companions';

describe('accepted card and control interface', () => {
  it.each([0,.16,.6,1])('shows exactly two mutually exclusive view choices at %s', viewLevel => {
    const html=renderToStaticMarkup(<ViewToolbar viewLevel={viewLevel} manualCameraActive={false} disabled={false} orientation="vertical" onViewLevel={()=>{}} onToggleManualCamera={()=>{}}/>);
    expect(html.match(/<button/g)).toHaveLength(2);expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('全局视角');expect(html).toContain('第一视角');expect(html).not.toContain('手动视角');
  });
  it('puts aim and power first in the visible help, with real explanatory copy', () => {
    const html=renderToStaticMarkup(<ControlHelp onClose={()=>{}}/>);
    expect(CONTROL_HELP.slice(0,2).map(row=>row[0])).toEqual(['瞄准方向','蓄力出杆']);
    expect(html).toContain('松手出杆');expect(html).toContain('选中的按钮会变色');
  });
  it('shows awarded cards in win order instead of filling the book with a companion roster', () => {
    const first=collectCompanionWin(emptyCompanionCollection(),COMPANIONS[4].id,10,'这一杆真漂亮')!;
    const second=collectCompanionWin(first.collection,COMPANIONS[0].id,20,'这份准头我服了')!;
    const html=renderToStaticMarkup(<CompanionCollectionBook collection={second.collection} onClose={()=>{}}/>);
    expect(html.indexOf('这一杆真漂亮')).toBeLessThan(html.indexOf('这份准头我服了'));
    expect(html).toContain('1 / 2');expect(html).not.toContain('等待公主赢下');
    expect(html).toContain('data-earned-ordinal="1"');expect(html).toContain('data-earned-ordinal="2"');
  });
});
