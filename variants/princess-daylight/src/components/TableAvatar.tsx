import { DEFAULT_PRINCESS, portraitFor } from '../opponent/player-portraits';
import { companionFor } from '../opponent/companions';

export function TableAvatar({ id }: { id?: string }) {
  const player = id === 'player';
  const friend = companionFor(id);
  const src = player ? portraitFor('player').avatar || DEFAULT_PRINCESS : friend.avatar;
  return <span className="table-avatar"><img src={src} alt={player ? '你的头像' : friend.name} draggable={false}/></span>;
}
