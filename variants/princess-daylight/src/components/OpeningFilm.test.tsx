/**
 * [INPUT]: 开场组件首次渲染。
 * [OUTPUT]: 默认音乐开启、画面无播放选择、横屏视频不循环，且跳过独立的用户契约回归。
 * [POS]: 首帧结构验证；实际声音与浏览器播放限制另由真实入口验证。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {OpeningFilm} from './OpeningFilm';
import gameSource from '../Game.tsx?raw';
describe('opening music defaults',()=>{
  it('starts enabled on every fresh opening without a play-choice screen',()=>{
    const html=renderToStaticMarkup(<OpeningFilm src="film.webp" onFinish={()=>{}}/>);
    expect(html).toContain('data-opening-autoplay="true"');
    expect(html).toContain('data-opening-control="music" aria-pressed="true"');
    expect(html).toContain('关闭音乐');expect(html).not.toContain('开启音乐');
    expect(html).not.toContain('data-opening-start');expect(html).toContain('跳过开场');
    expect(html).toContain('data-opening-duration="8000"');
    expect(html).toContain('<img');
  });
  it('plays the landscape film from its own track and keeps skip separate from music',()=>{
    const html=renderToStaticMarkup(<OpeningFilm src="film.mp4" media="video" onFinish={()=>{}}/>);
    expect(html).toContain('<video');
    expect(html).toContain('playsinline');
    expect(html).not.toContain('loop');
    expect(html).toContain('data-opening-autoplay="true"');
    expect(html).toContain('data-opening-media="video"');
    expect(html).toContain('data-film-aspect="1.7777777777777777"');
    expect(html).toContain('跳过开场');
    expect(html).toContain('关闭音乐');
  });
  it('keeps the portrait film unless the Bilibili build is landscape',()=>{
    expect(gameSource).toContain("import.meta.env.VITE_BILIBILI_TOY !== '1'");
    expect(gameSource).toContain('min-aspect-ratio: 1/1');
    expect(gameSource).toContain('arrival.webp');
  });
});
