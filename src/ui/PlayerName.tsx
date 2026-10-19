// How a player's name is drawn (docs/design/cosmetics.md): its name effect, title and
// nameplate. Full size shows all three; inline (chat) shows only the effect, without animation.

import type { DbConnection } from '../module_bindings';
import { cosmeticOf } from '../../spacetimedb/src/data/cosmetics';

export interface LookIds {
  titleId: number;
  visualId: number;
  plateId: number;
}

/** A name in a given look (the Character page previews one not worn yet). */
export function NameInLook({ name, look, inline }: { name: string; look?: LookIds; inline?: boolean }) {
  const title = !inline && look ? cosmeticOf(look.titleId, 'title') : undefined;
  const visual = look && cosmeticOf(look.visualId, 'visual');
  const plate = !inline && look ? cosmeticOf(look.plateId, 'plate') : undefined;
  return (
    <span className={`pname${inline ? ' inline' : ''}${plate ? ` np np-${plate.css}` : ''}`}>
      <span className={`pname-name${visual ? ` nv nv-${visual.css}` : ''}`} data-text={name}>{name}</span>
      {title && <span className="pname-title">{title.name}</span>}
    </span>
  );
}

/** Character `id`'s name as it currently looks (0 = no character: plain). */
export function PlayerName({ conn, id, name, inline }: { conn: DbConnection; id: bigint; name: string; inline?: boolean }) {
  const look = id === 0n ? undefined : (conn.db.look.characterId.find(id) ?? undefined);
  return <NameInLook name={name} look={look} inline={inline} />;
}
