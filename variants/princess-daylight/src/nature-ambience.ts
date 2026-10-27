/** Real CC0 field recordings, embedded offline like the opening soundtrack. */
import recording from './assets/ambience/park-birds-stream.json';

export function decodeNatureAmbience(ctx: AudioContext): Promise<AudioBuffer> {
  const bytes = Uint8Array.from(atob(recording.base64), value => value.charCodeAt(0));
  // Callback form also works in older WebViews; no URL loading or network request.
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(bytes.buffer, resolve, reject);
  });
}
