// How a player's name is drawn (docs/design/cosmetics.md): its name effect, title and
// nameplate. Full size shows all three; row (lists) shows the title only on hover, so every
// row is one line; inline (chat) shows only the effect, without animation.

import type { DbConnection } from '../module_bindings';
import { cosmeticOf } from '../../spacetimedb/src/data/cosmetics';

export interface LookIds {
  titleId: number;
  visualId: number;
  plateId: number;
}

/** A name in a given look (the Character page previews one not worn yet). */
export function NameInLook({ name, look, inline, row }: { name: string; look?: LookIds; inline?: boolean; row?: boolean }) {
  const title = !inline && look ? cosmeticOf(look.titleId, 'title') : undefined;
  const visual = look && cosmeticOf(look.visualId, 'visual');
  const plate = !inline && look ? cosmeticOf(look.plateId, 'plate') : undefined;
  return (
    <span className={`pname${inline ? ' inline' : ''}${plate ? ` np np-${plate.css}` : ''}`} title={row ? title?.name : undefined}>
      {title && !row && <span className="pname-title" title={title.name}>{title.name}</span>}
      <span className={`pname-name${visual ? ` nv nv-${visual.css}` : ''}`} data-text={name}>{name}</span>
    </span>
  );
}

/** Character `id`'s name as it currently looks (0 = no character: plain). */
export function PlayerName({ conn, id, name, inline, row }: { conn: DbConnection; id: bigint; name: string; inline?: boolean; row?: boolean }) {
  const look = id === 0n ? undefined : (conn.db.look.characterId.find(id) ?? undefined);
  return <NameInLook name={name} look={look} inline={inline} row={row} />;
}
