/** Gold particles with depth, drag and gravity. One short Canvas pass; no GPU scene. */
const TAU = Math.PI * 2;
const BURSTS = [
  { x: .08, y: .23, at: .4, size: 1 },
  { x: .92, y: .31, at: .95, size: .9 },
  { x: .5, y: .09, at: 1.8, size: .75 },
];
export const VICTORY_DURATION = 4600;
export function createVictoryMotion() {
  let seed = 503;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sparks = BURSTS.map(() => Array.from({ length: 90 }, () => {
    const angle = random() * TAU, depth = random() * 2 - 1;
    const speed = (.55 + random() * .65) * Math.sqrt(1 - depth * depth);
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      depth, life: 1.3 + random() * 1.2, size: .65 + random() * 1.05, phase: random() * TAU };
  }));
  const foil = Array.from({ length: 26 }, () => ({ x: random(), y: random(), z: .3 + random() * .7,
    angle: random() * TAU, speed: .2 + random() * .6, drift: random() * 2 - 1 }));
  const glow = document.createElement('canvas'); glow.width = glow.height = 32;
  const g = glow.getContext('2d');
  if (g) {
    const light = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    light.addColorStop(0, 'rgba(255,248,213,1)');
    light.addColorStop(.12, 'rgba(255,220,143,.85)');
    light.addColorStop(.4, 'rgba(231,163,51,.18)'); light.addColorStop(1, 'rgba(231,163,51,0)');
    g.fillStyle = light; g.fillRect(0, 0, 32, 32);
  }
  return (ctx: CanvasRenderingContext2D, width: number, height: number, milliseconds: number) => {
    const time = milliseconds / 1000, radius = Math.min(width * .54, height * .34, 300);
    ctx.clearRect(0, 0, width, height); ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let b = 0; b < BURSTS.length; b++) {
      const burst = BURSTS[b], age = time - burst.at;
      const x = burst.x * width, y = burst.y * height, r = radius * burst.size;
      if (age < -.32 || age > 2.6) continue;
      if (age < 0) {
        const p = 1 + age / .32, head = y + (1 - p) * height * .48;
        ctx.globalAlpha = p * .65; ctx.strokeStyle = '#f2d296'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 5, head + 55); ctx.quadraticCurveTo(x - 2, head + 20, x, head); ctx.stroke();
        ctx.drawImage(glow, x - 6, head - 6, 12, 12); continue;
      }
      const flash = Math.max(0, 1 - age / .22);
      ctx.globalAlpha = flash * .7; ctx.drawImage(glow, x - r * .34, y - r * .34, r * .68, r * .68);
      for (const spark of sparks[b]) {
        if (age > spark.life) continue;
        const travel = (1 - Math.exp(-age * 1.7)) * 1.3;
        const previous = (1 - Math.exp(-Math.max(0, age - .065) * 1.7)) * 1.3;
        const perspective = 1 / (1 + spark.depth * .28);
        const px = x + spark.vx * r * travel * perspective;
        const py = y + spark.vy * r * travel * perspective + age * age * r * .16;
        const fade = Math.pow(1 - age / spark.life, .7);
        const twinkle = age < .6 ? 1 : .6 + .4 * Math.sin(age * 19 + spark.phase);
        ctx.globalAlpha = fade * twinkle * .8;
        ctx.strokeStyle = spark.depth > 0 ? '#e5a44a' : '#fff0bf'; ctx.lineWidth = spark.size * perspective;
        ctx.beginPath();
        ctx.moveTo(x + spark.vx * r * previous * perspective, y + spark.vy * r * previous * perspective + Math.pow(Math.max(0, age - .065), 2) * r * .16);
        ctx.lineTo(px, py); ctx.stroke();
        const size = (spark.depth > .4 ? 12 : 6) * spark.size;
        ctx.globalAlpha = fade * .65; ctx.drawImage(glow, px - size / 2, py - size / 2, size, size);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const piece of foil) {
      const t = Math.max(0, time - .65), z = piece.z;
      const x = piece.x * width + Math.sin(t * .65 + piece.angle) * 30 * z + t * piece.drift * 9;
      const y = piece.y * height * 1.15 - height * .32 + t * (20 + 40 * z);
      const turn = piece.angle + t * piece.speed;
      const visible = Math.min(1, t * 1.3) * Math.min(1, (4.6 - time) * 1.4);
      ctx.save(); ctx.translate(x, y); ctx.rotate(turn * .4);
      ctx.scale(Math.cos(turn * 2), 1);
      ctx.globalAlpha = visible * (.3 + z * .45);
      ctx.fillStyle = Math.sin(turn * 2) > 0 ? '#f7e1ae' : '#926127';
      ctx.fillRect(-2 * z, -7 * z, 4 * z, 14 * z);
      ctx.fillStyle = '#fff4cf'; ctx.fillRect(-2 * z, -7 * z, z, 14 * z);
      ctx.restore();
    }
    ctx.restore();
  };
}
