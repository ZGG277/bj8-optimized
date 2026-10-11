/** Shared, offline Canvas artwork: a short burst on screen and its frozen celebration on the card. */
const TAU = Math.PI * 2;
export const CELEBRATION_COLORS = ['#ffe1a0', '#ffd074', '#9de9ce', '#ff9d89'];
export type Spark = { angle: number; reach: number; tail: number; color: string };
function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function makeFirework(seed: number, count = 60): Spark[] {
  const random = randomFor(seed);
  return Array.from({ length: count }, (_, i) => ({ angle: i / count * TAU + random() * .035,
    reach: .5 + random() * .5, tail: .1 + random() * .14, color: CELEBRATION_COLORS[Math.floor(random() * 3)] }));
}
export const FIREWORKS = [makeFirework(81), makeFirework(317), makeFirework(928)];
export function paintFirework(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, progress: number, sparks: Spark[]) {
  if (progress <= 0 || progress >= 1) return;
  const expansion = 1 - Math.pow(1 - progress, 3);
  const fade = Math.min(1, (1 - progress) * 2.2);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < sparks.length; i++) {
    const spark = sparks[i], r = radius * spark.reach * expansion;
    const dy = radius * progress * progress * .22;
    const sx = Math.cos(spark.angle), sy = Math.sin(spark.angle);
    ctx.strokeStyle = spark.color; ctx.globalAlpha = fade * .16; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x + sx * r * (1 - spark.tail), y + sy * r * (1 - spark.tail) + dy);
    ctx.lineTo(x + sx * r, y + sy * r + dy); ctx.stroke();
    ctx.globalAlpha = fade * .9; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.fillStyle = '#fff9df'; ctx.globalAlpha = fade;
    ctx.beginPath(); ctx.arc(x + sx * r, y + sy * r + dy, i % 4 ? 1.4 : 2.3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string | CanvasGradient) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
}
function ball(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, eight: boolean) {
  ctx.save();
  const shadow = ctx.createRadialGradient(x, y + radius * .88, radius * .16, x, y + radius * .88, radius * 1.3);
  shadow.addColorStop(0, 'rgba(0,0,0,.8)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(0, (y + radius * .88) * .6); ctx.scale(1,.4);
  disc(ctx,x,y + radius * .88,radius * 1.3,shadow); ctx.restore();
  const surface = ctx.createRadialGradient(x-radius*.36,y-radius*.45,0,x+radius*.12,y+radius*.24,radius*1.2);
  const stops = eight ? [[0,'#778985'],[.25,'#354b47'],[.55,'#142a25'],[.85,'#071411'],[1,'#020b08']] as const
    : [[0,'#fffef4'],[.45,'#f0e9d5'],[.85,'#a4b1a1'],[1,'#667f70']] as const;
  stops.forEach(([offset,color])=>surface.addColorStop(offset,color)); disc(ctx,x,y,radius,surface);
  ctx.strokeStyle = eight ? '#8d9d7c' : '#faf4da'; ctx.lineWidth=2; ctx.globalAlpha=.65;
  ctx.beginPath();ctx.arc(x,y,radius-1,Math.PI*1.12,Math.PI*1.87);ctx.stroke();ctx.globalAlpha=1;
  if (eight) {
    ctx.save();ctx.translate(x+radius*.19,y-radius*.03);ctx.rotate(-.2);ctx.scale(.86,1);
    const badge=ctx.createLinearGradient(-radius*.45,-radius*.45,radius*.45,radius*.45);
    badge.addColorStop(0,'#ffffed');badge.addColorStop(1,'#c1c8af');disc(ctx,0,0,radius*.46,badge);
    ctx.fillStyle='#10261e';ctx.font=`600 ${radius*.72}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('8',0,radius*.045);ctx.restore();
  }
  ctx.save();ctx.translate(x-radius*.29,y-radius*.52);ctx.rotate(-.5);
  const shine=ctx.createRadialGradient(0,0,0,0,0,radius*.42);shine.addColorStop(0,'rgba(255,255,230,.72)');shine.addColorStop(1,'rgba(255,255,230,0)');
  ctx.scale(1,.36);disc(ctx,0,0,radius*.42,shine);ctx.restore();ctx.restore();
}
/** Lightweight offline fallback if the packaged studio image cannot be decoded. */
function paintFallbackScene(ctx: CanvasRenderingContext2D) {
  const width=1080,height=1440;
  const background=ctx.createLinearGradient(0,0,width,height);
  background.addColorStop(0,'#081c18');background.addColorStop(.48,'#113d30');background.addColorStop(1,'#061c15');
  ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  const halo=ctx.createRadialGradient(650,840,20,650,840,630);
  halo.addColorStop(0,'rgba(94,169,106,.43)');halo.addColorStop(1,'rgba(28,74,49,0)');
  ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
  // An oblique cloth plane gives the billiards scene depth without a miniature clip-art table.
  ctx.save();ctx.beginPath();ctx.moveTo(-80,1010);ctx.lineTo(1150,714);ctx.lineTo(1150,1500);ctx.lineTo(-80,1500);ctx.closePath();
  const cloth=ctx.createLinearGradient(0,780,0,1440);cloth.addColorStop(0,'#26634b');cloth.addColorStop(1,'#0b3023');
  ctx.fillStyle=cloth;ctx.fill();ctx.clip();
  const grain=randomFor(804);ctx.fillStyle='#b7d1a1';ctx.globalAlpha=.07;
  for(let i=0;i<4400;i++)ctx.fillRect(grain()*width,700+grain()*740,1,1);
  ctx.restore();
  ctx.strokeStyle='rgba(225,212,153,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-80,1010);ctx.lineTo(1150,714);ctx.stroke();
  paintFirework(ctx,133,286,232,.62,FIREWORKS[0]);
  paintFirework(ctx,960,466,266,.56,FIREWORKS[1]);
  paintFirework(ctx,840,128,143,.62,FIREWORKS[2]);
  paintFirework(ctx,110,1020,145,.54,FIREWORKS[2]);
  const rand=randomFor(419);
  for(let i=0;i<90;i++) {
    const x=48+rand()*984,y=132+rand()*1050;
    // Leave the headline and footer readable.
    if(x>170 && x<910 && y>260 && y<570)continue;
    ctx.save();ctx.translate(x,y);ctx.rotate(rand()*TAU);ctx.globalAlpha=.3+rand()*.65;
    ctx.fillStyle=CELEBRATION_COLORS[i%4];ctx.fillRect(-3,-7,3+rand()*5,6+rand()*13);ctx.restore();
  }
  // Gold ribbons curve behind the hero ball.
  ctx.save();ctx.strokeStyle='#e6bb74';ctx.lineWidth=9;ctx.globalAlpha=.75;
  ctx.beginPath();ctx.moveTo(900,656);ctx.bezierCurveTo(770,648,989,840,882,882);ctx.bezierCurveTo(792,917,821,1019,966,970);ctx.stroke();
  ctx.lineWidth=4;ctx.strokeStyle='#90ddbc';ctx.beginPath();ctx.moveTo(185,704);ctx.bezierCurveTo(290,669,184,865,320,837);ctx.stroke();ctx.restore();
  ball(ctx,604,903,232,true);ball(ctx,297,1086,70,false);
}

/** Artwork is a packaged illustration; only mode and supplied real shot count are match data. */
export function paintVictoryCard(ctx: CanvasRenderingContext2D, mode: 'practice' | 'challenge', shots?: number, artwork?: CanvasImageSource) {
  if (artwork) ctx.drawImage(artwork, 0, 0, 1080, 1440);
  else paintFallbackScene(ctx);
  // Quiet text zones preserve the hero's reflections and the fine felt texture.
  const footer = ctx.createLinearGradient(0, 1130, 0, 1440);
  footer.addColorStop(0, 'rgba(3,17,14,0)');
  footer.addColorStop(.48, 'rgba(3,17,14,.78)');
  footer.addColorStop(1, 'rgba(3,17,14,.96)');
  ctx.fillStyle = footer; ctx.fillRect(0, 1130, 1080, 310);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#f5e8cc'; ctx.font = '500 29px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('瓜瓜台球', 72, 92);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
  ctx.font = '600 145px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
  const title = ctx.createLinearGradient(0, 322, 0, 452);
  title.addColorStop(0, '#fff5dd'); title.addColorStop(.5, '#f2d8a5'); title.addColorStop(1, '#c59b57');
  ctx.fillStyle = title; ctx.fillText('赢得漂亮', 540, 451);
  ctx.restore();
  ctx.fillStyle = '#f6ead1'; ctx.font = '500 36px "PingFang SC", sans-serif';
  ctx.fillText(mode === 'challenge' ? '挑战模式 · 战胜顾燃' : '陪练模式 · 战胜顾燃', 540, 1288);
  if (typeof shots === 'number' && Number.isInteger(shots) && shots > 0) {
    ctx.fillStyle = '#c9bb9f'; ctx.font = '22px "PingFang SC", sans-serif';
    ctx.fillText(`本局出杆 ${shots} 杆`, 540, 1336);
  }
}
