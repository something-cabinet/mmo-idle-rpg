import type { DbConnection } from '../module_bindings';
import { validateCharacterName } from '../../spacetimedb/src/game';
import { $, call, toast } from './dom';

export function bindCreate(conn: DbConnection) {
  const input = $<HTMLInputElement>('create-name');
  $<HTMLFormElement>('create-form').onsubmit = e => {
    e.preventDefault();
    const name = input.value.trim();
    const invalid = validateCharacterName(name);
    if (invalid) return toast(invalid);
    call(conn.reducers.createCharacter({ name }));
  };
  $('play-here-btn').onclick = () => call(conn.reducers.playHere({}));
}
