import type { DbConnection } from '../module_bindings';
import { validateCharacterName } from '../../spacetimedb/src/game';
import { STARTER_WEAPONS, base, weaponValues } from '../../spacetimedb/src/data/bases';
import { $, call, toast } from './dom';

/** One radio per starter weapon, with its T1 numbers. */
function renderWeapons() {
  if ($('create-weapons').querySelector('input')) return; // already built (reconnect)
  $('create-weapons').append(
    ...STARTER_WEAPONS.map((id, i) => {
      const b = base(id);
      const w = weaponValues(b.weapon!, 1);
      const label = document.createElement('label');
      label.className = 'radio';
      const input = document.createElement('input');
      Object.assign(input, { type: 'radio', name: 'starter-weapon', value: String(id), checked: i === 0 });
      const name = document.createElement('span');
      name.textContent = b.name(1);
      const stats = document.createElement('span');
      stats.className = 'muted';
      stats.textContent = [
        `${w.damageType} ${w.hit} × ${w.speed}/s`,
        w.heal ? `heals ${w.heal}` : '',
        w.twoHanded ? '2H' : '1H',
      ].filter(Boolean).join(' · ');
      label.append(input, name, stats);
      return label;
    })
  );
}

export function bindCreate(conn: DbConnection) {
  renderWeapons();
  const input = $<HTMLInputElement>('create-name');
  $<HTMLFormElement>('create-form').onsubmit = e => {
    e.preventDefault();
    const name = input.value.trim();
    const invalid = validateCharacterName(name);
    if (invalid) return toast(invalid);
    const picked = document.querySelector<HTMLInputElement>('input[name="starter-weapon"]:checked');
    call(conn.reducers.createCharacter({ name, starterWeapon: Number(picked?.value ?? STARTER_WEAPONS[0]) }));
  };
  $('play-here-btn').onclick = () => call(conn.reducers.playHere({}));
}
