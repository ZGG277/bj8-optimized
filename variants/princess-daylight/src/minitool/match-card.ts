/** The displayed win card is also the exact first image passed to postNote. */
export async function loadCardImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('卡片图片暂未准备好，请重试。'));
    image.src = src;
  });
}

const renderedCards = new Map<string, Promise<string>>();
/** Stable card v2; the exact same image is shown in the book and passed to sharing. */
export function renderMatchCard(art: string, name: string, praise: string): Promise<string> {
  const key = JSON.stringify([art, name, praise]);
  const cached = renderedCards.get(key);
  if (cached) return cached;
  const rendering = drawCard(art, name, praise).catch(error => { renderedCards.delete(key); throw error; });
  renderedCards.set(key, rendering);
  if (renderedCards.size > 24) renderedCards.delete(renderedCards.keys().next().value!);
  return rendering;
}
async function drawCard(art: string, name: string, praise: string): Promise<string> {
  const portrait = await loadCardImage(art);
  if (document.fonts) await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('卡片暂未准备好，请重试。');
  const paper = ctx.createLinearGradient(0, 0, 720, 960);
  paper.addColorStop(0, '#fffdf5'); paper.addColorStop(.5, '#f5f4e9'); paper.addColorStop(1, '#e8eee2');
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 720, 960);
  const gold = ctx.createLinearGradient(40, 0, 680, 960);
  gold.addColorStop(0, '#b48b48'); gold.addColorStop(.35, '#e0c99a'); gold.addColorStop(.65, '#a67e3e'); gold.addColorStop(1, '#dfc69a');
  ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.strokeRect(23, 23, 674, 914);
  ctx.lineWidth = 1; ctx.strokeRect(34, 34, 652, 892);
  for (const [x, y, sx, sy] of [[44,44,1,1],[676,44,-1,1],[44,916,1,-1],[676,916,-1,-1]]) {
    ctx.save(); ctx.translate(x,y); ctx.scale(sx,sy); ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,74); ctx.quadraticCurveTo(0,0,74,0); ctx.moveTo(0,42); ctx.quadraticCurveTo(28,42,42,0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(22,22,10,18,-Math.PI/4,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
  ctx.textAlign='center';ctx.fillStyle='#8e754c';ctx.font='24px "Princess WenKai UI", serif';ctx.fillText('公主的赞美',360,104);
  ctx.fillStyle='#d5be89';ctx.beginPath();ctx.arc(360,292,171,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(360,292,163,0,Math.PI*2);ctx.clip();
  const side=Math.min(portrait.naturalWidth,portrait.naturalHeight);
  ctx.drawImage(portrait,(portrait.naturalWidth-side)/2,(portrait.naturalHeight-side)/2,side,side,197,129,326,326);ctx.restore();
  ctx.strokeStyle=gold;ctx.lineWidth=1;ctx.beginPath();ctx.arc(360,292,179,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#8a6a36';ctx.font='36px "Princess WenKai UI", serif';ctx.fillText(name,360,526);
  ctx.strokeStyle='#c8af7b';ctx.beginPath();ctx.moveTo(240,574);ctx.lineTo(330,574);ctx.moveTo(390,574);ctx.lineTo(480,574);ctx.stroke();
  ctx.save();ctx.translate(360,574);ctx.rotate(Math.PI/4);ctx.strokeRect(-6,-6,12,12);ctx.restore();
  ctx.fillStyle='#3f6251';ctx.font='42px "Princess WenKai UI", serif';
  ctx.fillText(praise,360,670,590);
  ctx.strokeStyle='#c3ac7d';ctx.beginPath();ctx.moveTo(290,736);ctx.quadraticCurveTo(325,712,360,736);ctx.quadraticCurveTo(395,712,430,736);ctx.stroke();
  ctx.fillStyle='#9f926f';ctx.font='20px "Princess WenKai UI", serif';ctx.fillText('公主请开球',360,914);
  return canvas.toDataURL('image/jpeg',.92);
}

export async function bundledSceneImage(src: string): Promise<string> {
  const image = await loadCardImage(src);
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('城堡图片暂未准备好，请重试。');
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL('image/jpeg', .9);
}
