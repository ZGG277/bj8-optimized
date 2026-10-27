/** Shared outline icons keep controls independent of font glyphs. */
export function RoyalIcon({ name }: { name: 'scene' | 'help' | 'pause' | 'play' | 'sound' | 'muted' | 'restart' | 'close' | 'skip' | 'crown' | 'cards' | 'left' | 'right' }) {
  return <svg className="royal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'scene' && <><path d="M3 19V5h18v14H3Z"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 3 3-4 4 6"/></>}
    {name === 'help' && <><path d="M8.5 8a3.5 3.5 0 0 1 7 0c0 2.5-3.5 2.5-3.5 5"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/></>}
    {name === 'pause' && <><path d="M8 5v14M16 5v14"/></>}
    {name === 'play' && <path d="m8 5 11 7-11 7Z"/>}
    {(name === 'sound' || name === 'muted') && <><path d="M3 9h4l5-4v14l-5-4H3Z"/>{name === 'sound' ? <><path d="M16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></> : <path d="m17 9 5 6m0-6-5 6"/>}</>}
    {name === 'restart' && <><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></>}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18"/>}
    {name === 'skip' && <><path d="m5 6 9 6-9 6ZM18 6v12"/></>}
    {name === 'crown' && <><path d="m3 6 5 5 4-7 4 7 5-5-2 13H5ZM6 16h12"/></>}
    {name === 'cards' && <><path d="m5 5 10-2 3 15-10 2Z"/><path d="m17 5 4 2-4 14-10-3"/><path d="m9 10 3-3 2 3-2 3Z"/></>}
    {name === 'left' && <path d="m15 5-7 7 7 7"/>}
    {name === 'right' && <path d="m9 5 7 7-7 7"/>}
  </svg>;
}
