/**
 * [INPUT]: 开场组件首次渲染。
 * [OUTPUT]: 默认音乐开启、画面无播放选择且跳过独立的用户契约回归。
 * [POS]: 首帧结构验证；实际声音与浏览器播放限制另由真实入口验证。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {OpeningFilm} from './OpeningFilm';
describe('opening music defaults',()=>{
  it('starts enabled on every fresh opening without a play-choice screen',()=>{
    const html=renderToStaticMarkup(<OpeningFilm src="film.webp" onFinish={()=>{}}/>);
    expect(html).toContain('data-opening-autoplay="true"');
    expect(html).toContain('data-opening-control="music" aria-pressed="true"');
    expect(html).toContain('关闭音乐');expect(html).not.toContain('开启音乐');
    expect(html).not.toContain('data-opening-start');expect(html).toContain('跳过开场');
    expect(html).toContain('data-opening-duration="8000"');
  });
});
