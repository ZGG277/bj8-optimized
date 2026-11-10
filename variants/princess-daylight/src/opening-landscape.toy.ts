/**
 * [INPUT]: 已核准的 8 秒横屏城堡开场及首帧海报。
 * [OUTPUT]: 仅 B 站 Toy 构建注入的成片地址。
 * [POS]: 由 vite.toy.config.ts 替换 opening-landscape；小红书构建不会打包这两个文件。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
import film from './assets/opening/arrival-landscape.mp4?url';
import poster from './assets/opening/arrival-landscape-poster.jpg?url';

export const landscapeOpeningUrl = film;
export const landscapeOpeningPoster = poster;
