// Renders the in-game views. Everything except the Fight view's live progress card and
// the top bar is preview data from docs/design until the matching systems exist.

import { $, toast } from './dom';
import { hydrateIcons, icon } from './icons';
import { startFight } from './fight';
import {
  AFFIX_NAMES,
  BAG,
  EQUIPPED,
  PREVIEW_PLAYER,
  SLOTS,
  ZONES,
  type Enemy,
  type Item,
  type Rarity,
  type Zone,
} from './preview-data';
import { fmt, matchup, pct, secs } from './sim';
import { setTheme, themePref, type ThemePref } from './theme';

const RARITIES: Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'unique'];
const label = (r: Rarity) => r[0].toUpperCase() + r.slice(1);
const previewTag = `<span class="tag preview" title="Layout preview with design-doc data; not live yet">Preview</span>`;

export const state = {
  zone: ZONES[0],
  target: ZONES[0].enemies[0],
  loadout: 0,
  bagSelected: new Set<number>(),
  craftItem: 2,
  craftTab: 'reroll' as 'reroll' | 'upgrade',
  craftAffix: 0,
  filterRarity: 'rare' as Rarity,
  filterAffixes: new Set<string>(['Item find %']),
};

// ---------------------------------------------------------------- helpers

function viewHeader(title: string, iconName: string, extra = '') {
  return `<div class="view-head"><h1><i data-icon="${iconName}"></i>${title}</h1>${extra}</div>`;
}

export function itemCard(item: Item, opts: { selectable?: number; selected?: boolean; compact?: boolean } = {}) {
  const sel = opts.selectable !== undefined ? ` data-select="${opts.selectable}"` : '';
  return `
  <div class="item-card r-${item.rarity}${opts.selected ? ' selected' : ''}${opts.compact ? ' compact' : ''}"${sel}>
    <div class="item-head">
      <span class="item-name">${item.name}</span>
      ${item.locked ? `<span class="lock" title="Locked">${icon('lock')}</span>` : ''}
      <span class="badge r-${item.rarity}">T${item.tier}</span>
    </div>
    <div class="item-sub"><span>${label(item.rarity)}</span><span>${item.base}</span></div>
    <div class="item-implicits">${item.implicits.map(t => `<span>${t}</span>`).join('')}</div>
    ${item.legendary ? `<div class="item-legendary"><strong>${icon('sparkles')}${item.legendary.name}</strong><span>${item.legendary.text}</span></div>` : ''}
    ${item.affixes.length ? `<div class="item-affixes">${item.affixes.map(a => `<div class="affix"><span>${a.text}</span><span class="affix-tier">T${a.tier}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

const enemyTags = (e: Enemy) => `
  <span class="tag">Lv ${e.level}</span>
  <span class="tag ${e.dmg === 'Magic' ? 'magic' : 'phys'}">${e.dmg}</span>
  <span class="tag">${e.def}</span>`;

// ---------------------------------------------------------------- fight

function renderFight() {
  const e = state.target;
  const m = matchup(PREVIEW_PLAYER, e);
  $('view-fight').innerHTML = `
    ${viewHeader('Fight', 'swords', `<div class="head-tags">${previewTag}</div>`)}
    <div class="fight-target">
      <div>
        <div class="crumb">${state.zone.name} <span class="muted">T${state.zone.tier}</span></div>
        <div class="target-name">${e.boss ? icon('skull', 'boss') : ''}${e.name}</div>
        <div class="tags">${enemyTags(e)}</div>
      </div>
      <a class="btn small ghost" href="#zones">${icon('map')}Change target</a>
    </div>

    <div class="scene card" id="scene">
      <div class="fighter" id="fighter-you">
        <div class="portrait you">${icon('user')}</div>
        <div class="fighter-name">You <span class="muted">Lv ${PREVIEW_PLAYER.level}</span></div>
        <div class="hpbar"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="swing"><div class="swing-fill"></div></div>
        <div class="floats"></div>
      </div>
      <div class="versus">VS</div>
      <div class="fighter" id="fighter-enemy">
        <div class="portrait enemy">${icon(e.boss ? 'skull' : 'swords')}</div>
        <div class="fighter-name">${e.name} <span class="muted">Lv ${e.level}</span></div>
        <div class="hpbar enemy"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="swing"><div class="swing-fill"></div></div>
        <div class="floats"></div>
      </div>
      <div class="scene-status" id="scene-status"></div>
    </div>

    <div class="kpis">
      <div class="kpi"><span>Time to kill</span><strong>${secs(m.ttk)}</strong></div>
      <div class="kpi"><span>Time to die</span><strong>${secs(m.ttd)}</strong></div>
      <div class="kpi ${m.win ? 'ok' : 'bad'}"><span>Result</span><strong>${m.win ? `Win ${fmt(m.margin)}×` : 'Lose ✖'}</strong></div>
      <div class="kpi"><span>Kills / h</span><strong>${fmt(m.killsPerHour)}</strong></div>
      <div class="kpi"><span>XP / h</span><strong>${fmt(m.xpPerHour)}</strong></div>
      <div class="kpi"><span>Gold / h</span><strong>${fmt(m.goldPerHour)}</strong></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Loot log</h2><span class="muted">Keeping Rare+</span></div>
        <ul class="loot-log" id="loot-log"><li class="muted">No drops yet. Drops are rare: about 1 every 2 minutes.</li></ul>
      </div>
      <div class="card">
        <div class="card-head"><h2>Live progress</h2><span class="tag ok">Live</span></div>
        <p class="muted">Server data: your active loadout against your target. The rest of this view is preview data.</p>
        <div class="row"><span>Target</span><strong id="live-target">—</strong></div>
        <div class="row"><span>Kill / die</span><strong id="live-times">—</strong></div>
        <div class="row"><span>Rates</span><span id="live-rates" class="muted"></span></div>
      </div>
    </div>`;
  updateActivity();
  startFight(state.target);
}

export function updateActivity() {
  const m = matchup(PREVIEW_PLAYER, state.target);
  $('activity-text').textContent = `${state.zone.name} › ${state.target.name}`;
  $('activity-rate').textContent = m.win ? `${secs(m.ttk)} · ${fmt(m.killsPerHour)}/h` : 'Lose';
  $('activity').querySelector('.dot')!.className = `dot ${m.win ? 'ok' : 'bad'}`;
}

// ---------------------------------------------------------------- zones

function zoneRows(z: Zone) {
  return z.enemies
    .map((e, i) => {
      const m = matchup(PREVIEW_PLAYER, e);
      const active = state.target === e;
      const action = !z.unlocked
        ? `<span class="muted">${icon('lock')}</span>`
        : e.boss
          ? `<button class="btn small danger" data-boss="${i}">Challenge</button>`
          : active
            ? `<span class="tag ok">Fighting</span>`
            : `<button class="btn small" data-fight="${i}">Fight</button>`;
      return `
      <tr class="${active ? 'active' : ''}${e.boss ? ' boss' : ''}" data-row="${i}">
        <td class="name">${e.boss ? icon('skull', 'boss') : ''}${e.name}</td>
        <td>${e.level}</td>
        <td><span class="tag ${e.dmg === 'Magic' ? 'magic' : 'phys'}">${e.dmg}</span></td>
        <td>${e.def}</td>
        <td class="num">${fmt(e.hp)}</td>
        <td class="num">${fmt(e.dps)}</td>
        <td><span class="result ${m.win ? 'ok' : 'bad'}">${m.win ? `Win ${fmt(m.margin)}×` : 'Lose ✖'}</span></td>
        <td class="num">${m.win ? secs(m.ttk) : '—'}</td>
        <td class="num">${m.win ? fmt(m.xpPerHour) : '—'}</td>
        <td class="num">${m.win ? fmt(m.goldPerHour) : '—'}</td>
        <td class="num">${e.drops.length > 1 ? e.drops.length : 'All'}</td>
        <td class="actions">${action}</td>
      </tr>`;
    })
    .join('');
}

function renderZones() {
  const z = state.zone;
  $('view-zones').innerHTML = `
    ${viewHeader('Zones', 'map', `<div class="head-tags">${previewTag}</div>`)}
    <div class="seg">
      ${ZONES.map(
        zz => `<button class="seg-btn${zz === z ? ' active' : ''}" data-zone="${zz.tier}">
          ${zz.unlocked ? '' : icon('lock')}T${zz.tier} ${zz.name}</button>`
      ).join('')}
      <button class="seg-btn" disabled>${icon('lock')}T3 …</button>
    </div>
    <div class="card">
      <div class="zone-head">
        <div><h2>${z.name} <span class="muted">Levels ${z.levels}</span></h2><p class="muted">${z.blurb}</p></div>
        ${z.unlocked ? '' : `<div class="lock-note">${icon('lock')}Defeat ${ZONES[z.tier - 2]?.enemies.at(-1)?.name ?? 'the previous boss'} to unlock</div>`}
      </div>
      <div class="table-wrap">
      <table class="table${z.unlocked ? '' : ' locked'}">
        <thead><tr>
          <th>Enemy</th><th>Lv</th><th>Dmg</th><th>Defense</th><th class="num">HP</th><th class="num">DPS</th>
          <th>Your result</th><th class="num">Kill</th><th class="num">XP/h</th><th class="num">Gold/h</th><th class="num">Bases</th><th></th>
        </tr></thead>
        <tbody>${zoneRows(z)}</tbody>
      </table>
      </div>
    </div>
    <div class="card" id="zone-drops"></div>`;
  showDrops(z.enemies.indexOf(state.target) >= 0 ? z.enemies.indexOf(state.target) : 0);
  hydrateIcons($('view-zones'));
}

function showDrops(i: number) {
  const e = state.zone.enemies[i];
  $('zone-drops').innerHTML = `
    <div class="card-head"><h2>${e.name} drops</h2><span class="muted">Each base drops from exactly one enemy in the zone</span></div>
    <div class="chips">${e.drops.map(d => `<span class="chip">${d}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- character

function statRows(rows: [string, string, string?][]) {
  return rows
    .map(([k, v, hint]) => `<div class="stat-row"${hint ? ` title="${hint}"` : ''}><span>${k}</span><strong>${v}</strong></div>`)
    .join('');
}

function renderCharacter() {
  const p = PREVIEW_PLAYER;
  const e = state.target;
  const m = matchup(p, e);
  $('view-character').innerHTML = `
    ${viewHeader('Character', 'user', `<div class="head-tags">${previewTag}</div>`)}
    <div class="grid-4">
      <div class="card"><div class="card-head"><h2>Primaries</h2></div>
        ${statRows(Object.entries(p.primaries).map(([k, v]) => [k, String(v), `${p.level} from levels, ${v - p.level} from gear`]))}
      </div>
      <div class="card"><div class="card-head"><h2>Offense</h2></div>
        ${statRows([
          ['Hit', `${fmt(p.hit)} ${p.dmg}`],
          ['Attack speed', `${p.speed.toFixed(2)} /s`],
          ['Crit chance', pct(p.crit, 1)],
          ['Crit damage', pct(p.critDmg)],
          ['Armor penetration', pct(p.armorPen)],
          ['DPS vs target', fmt(m.dps)],
        ])}
      </div>
      <div class="card"><div class="card-head"><h2>Defense</h2></div>
        ${statRows([
          ['Max HP', fmt(p.hp)],
          ['HP regen', `${fmt(p.regen)} /s`],
          ['Armor', `${fmt(p.armor)} (${pct(m.playerMit)} vs ${e.dmg === 'Phys' ? 'target' : 'phys'})`],
          ['Resistance', `${fmt(p.resist)}`],
          ['Evasion', pct(p.evasion)],
        ])}
      </div>
      <div class="card"><div class="card-head"><h2>Utility</h2></div>
        ${statRows([
          ['Item find', pct(p.itemFind)],
          ['Gold find', pct(p.goldFind)],
          ['XP gain', pct(p.xpGain)],
        ])}
      </div>
    </div>
    <p class="muted hint">Hover a primary to see where it comes from. Mitigation is shown against your current target (Lv ${e.level}).</p>`;
}

// ---------------------------------------------------------------- equipment

function renderEquipment() {
  const m = matchup(PREVIEW_PLAYER, state.target);
  $('view-equipment').innerHTML = `
    ${viewHeader('Equipment', 'shield', `<div class="head-tags">${previewTag}</div>`)}
    <div class="toolbar card">
      <span class="toolbar-label">Loadout</span>
      <div class="seg">${['Farm', 'Boss', '—', '—']
        .map((n, i) => `<button class="seg-btn${i === state.loadout ? ' active' : ''}" data-loadout="${i}">${i + 1} ${n}</button>`)
        .join('')}</div>
      <span class="spacer"></span>
      <span class="toolbar-label">Profile</span>
      <select id="profile"><option>Damage</option><option>Survival</option><option>Loot</option></select>
      <button class="btn primary small" id="auto-equip">${icon('zap')}Auto-equip</button>
    </div>
    <div class="equip-grid">
      ${SLOTS.map(s => `<div class="slot"><div class="slot-label">${s}</div>${itemCard(EQUIPPED[s])}</div>`).join('')}
    </div>
    <div class="totals card">
      <span>Hit <strong>${fmt(PREVIEW_PLAYER.hit)}</strong></span>
      <span>HP <strong>${fmt(PREVIEW_PLAYER.hp)}</strong></span>
      <span>Armor <strong>${fmt(PREVIEW_PLAYER.armor)}</strong></span>
      <span>Kill <strong>${secs(m.ttk)}</strong></span>
      <span>Die <strong>${secs(m.ttd)}</strong></span>
      <span class="${m.win ? 'c-ok' : 'c-bad'}">${m.win ? `Win ${fmt(m.margin)}×` : 'Lose'} vs ${state.target.name}</span>
    </div>`;
}

// ---------------------------------------------------------------- bag

const ESSENCE: Record<Rarity, number> = { common: 1, magic: 2, rare: 5, epic: 20, legendary: 60, unique: 60 };

function renderBag() {
  const sel = state.bagSelected;
  const essence = [...sel].reduce((s, i) => s + ESSENCE[BAG[i].rarity], 0);
  $('view-bag').innerHTML = `
    ${viewHeader('Bag', 'bag', `<div class="head-tags">${previewTag}</div>`)}
    <div class="toolbar card">
      <span class="toolbar-label">Bag <strong>${BAG.length}</strong> / 200</span>
      <button class="btn small ghost" id="bag-expand">+25 slots · 50k gold</button>
      <span class="spacer"></span>
      <select><option>Sort: Newest</option><option>Sort: Rarity</option><option>Sort: Tier</option><option>Sort: Slot</option></select>
      <select><option>All slots</option><option>Weapons</option><option>Armor</option><option>Jewelry</option></select>
    </div>
    <div class="item-grid">${BAG.map((it, i) => itemCard(it, { selectable: i, selected: sel.has(i), compact: true })).join('')}</div>
    <div class="action-bar card${sel.size ? '' : ' empty'}">
      <span>${sel.size ? `<strong>${sel.size}</strong> selected` : 'Click items to select'}</span>
      <span class="spacer"></span>
      <button class="btn small" id="bag-lock" ${sel.size ? '' : 'disabled'}>${icon('lock')}Lock</button>
      <button class="btn small danger" id="bag-salvage" ${sel.size ? '' : 'disabled'}>Salvage → +${essence} essence</button>
    </div>`;
}

// ---------------------------------------------------------------- crafting

const REROLL_COST: Partial<Record<Rarity, string>> = { magic: '300 gold · 4 essence', rare: '600 gold · 8 essence', epic: '1,200 gold · 15 essence', legendary: '2,400 gold · 30 essence' };
const UPGRADE: Partial<Record<Rarity, [Rarity, string]>> = {
  common: ['magic', '300 gold · 4 essence'],
  magic: ['rare', '1,200 gold · 15 essence'],
  rare: ['epic', '4,800 gold · 60 essence'],
  epic: ['legendary', '29k gold · 360 essence'],
};

function renderCrafting() {
  const item = BAG[state.craftItem];
  const reroll = state.craftTab === 'reroll';
  const up = UPGRADE[item.rarity];
  let body: string;
  if (reroll) {
    body = item.affixes.length
      ? `<div class="affix-pick">${item.affixes
          .map(
            (a, i) => `<label class="radio"><input type="radio" name="craft-affix" value="${i}" ${i === state.craftAffix ? 'checked' : ''}/>
            <span>${a.text}</span><span class="affix-tier">T${a.tier}</span></label>`
          )
          .join('')}</div>
         <div class="cost">Cost: <strong>${REROLL_COST[item.rarity] ?? '—'}</strong></div>`
      : `<p class="muted">This item has no affixes to reroll. Upgrade its rarity first.</p>`;
  } else {
    body = up
      ? `<p>${label(item.rarity)} → <strong class="c-${up[0]}">${label(up[0])}</strong>: ${up[0] === 'legendary' ? 'remove one affix of your choice, add a random legendary affix.' : 'adds one random affix.'}</p>
         <div class="cost">Cost: <strong>${up[1]}</strong></div>`
      : `<p class="muted">${label(item.rarity)} items can't be upgraded further.</p>`;
  }
  $('view-crafting').innerHTML = `
    ${viewHeader('Crafting', 'hammer', `<div class="head-tags">${previewTag}</div>`)}
    <div class="craft">
      <div class="card craft-list">
        <div class="card-head"><h2>Items</h2></div>
        ${BAG.map((it, i) => `<button class="list-item r-${it.rarity}${i === state.craftItem ? ' active' : ''}" data-craft="${i}"><span class="item-name">${it.name}</span><span class="muted">${label(it.rarity)}</span></button>`).join('')}
      </div>
      <div class="craft-main">
        ${itemCard(item)}
        <div class="card">
          <div class="seg">
            <button class="seg-btn${reroll ? ' active' : ''}" data-craft-tab="reroll">Reroll affix</button>
            <button class="seg-btn${reroll ? '' : ' active'}" data-craft-tab="upgrade">Upgrade rarity</button>
          </div>
          ${body}
          <button class="btn primary" id="craft-go" ${(reroll ? item.affixes.length : up) ? '' : 'disabled'}>${reroll ? 'Reroll' : 'Upgrade'}</button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- loot filter

function renderFilter() {
  $('view-filter').innerHTML = `
    ${viewHeader('Loot filter', 'filter', `<div class="head-tags">${previewTag}</div>`)}
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Keep rarity</h2></div>
        <p class="muted">Drops below this rarity are salvaged into essence automatically.</p>
        <div class="seg wrap">${RARITIES.slice(0, 5)
          .map(r => `<button class="seg-btn c-${r}${r === state.filterRarity ? ' active' : ''}" data-filter-rarity="${r}">${label(r)}+</button>`)
          .join('')}</div>
        <div class="card-head" style="margin-top:12px"><h2>Last session</h2></div>
        ${statRows([
          ['Drops', '95'],
          ['Kept', '12'],
          ['Salvaged', '83 (+210 essence)'],
        ])}
      </div>
      <div class="card">
        <div class="card-head"><h2>Always keep affixes</h2><span class="muted">${state.filterAffixes.size} selected</span></div>
        <input id="affix-search" placeholder="Search affixes…" />
        <div class="checks" id="affix-checks">${AFFIX_NAMES.map(
          a => `<label class="check"><input type="checkbox" value="${a}" ${state.filterAffixes.has(a) ? 'checked' : ''}/>${a}</label>`
        ).join('')}</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- settings

function renderSettings() {
  const pref = themePref();
  const floats = localStorage.getItem('floatNumbers') !== 'off';
  $('view-settings').innerHTML = `
    ${viewHeader('Settings', 'settings')}
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Appearance</h2></div>
        <div class="seg">${(['system', 'dark', 'light'] as ThemePref[])
          .map(t => `<button class="seg-btn${t === pref ? ' active' : ''}" data-theme-pref="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)
          .join('')}</div>
        <label class="check"><input type="checkbox" id="float-toggle" ${floats ? 'checked' : ''}/>Floating damage numbers</label>
      </div>
      <div class="card">
        <div class="card-head"><h2>Account</h2></div>
        <p class="muted">Use the buttons at the bottom of the sidebar to log in or out. Guest progress is saved in this browser only.</p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- wiring

const RENDER: Record<string, () => void> = {
  fight: renderFight,
  zones: renderZones,
  character: renderCharacter,
  equipment: renderEquipment,
  bag: renderBag,
  crafting: renderCrafting,
  filter: renderFilter,
  settings: renderSettings,
};

export function renderView(view: string) {
  RENDER[view]?.();
  hydrateIcons($(`view-${view}`));
}

const soon = (what: string) => toast(`${what} arrives with the item system`, 'info');

/** One delegated click handler for all views. */
export function bindViews() {
  $('content').addEventListener('click', ev => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>(
      '[data-zone],[data-fight],[data-boss],[data-row],[data-loadout],[data-select],[data-craft],[data-craft-tab],[data-filter-rarity],[data-theme-pref],#auto-equip,#bag-salvage,#bag-lock,#bag-expand,#craft-go'
    );
    if (!el) return;
    const d = el.dataset;
    if (d.zone) {
      state.zone = ZONES[Number(d.zone) - 1];
      renderView('zones');
    } else if (d.fight) {
      state.target = state.zone.enemies[Number(d.fight)];
      location.hash = '#fight';
    } else if (d.boss) {
      toast('Boss challenges arrive with the combat system', 'info');
    } else if (d.row) {
      showDrops(Number(d.row));
    } else if (d.loadout) {
      state.loadout = Number(d.loadout);
      renderView('equipment');
    } else if (d.select) {
      const i = Number(d.select);
      if (state.bagSelected.has(i)) state.bagSelected.delete(i);
      else state.bagSelected.add(i);
      renderView('bag');
    } else if (d.craft) {
      state.craftItem = Number(d.craft);
      state.craftAffix = 0;
      renderView('crafting');
    } else if (d.craftTab) {
      state.craftTab = d.craftTab as 'reroll' | 'upgrade';
      renderView('crafting');
    } else if (d.filterRarity) {
      state.filterRarity = d.filterRarity as Rarity;
      renderView('filter');
    } else if (d.themePref) {
      setTheme(d.themePref as ThemePref);
      renderView('settings');
    } else if (el.id === 'auto-equip') soon('Auto-equip');
    else if (el.id === 'bag-salvage' || el.id === 'bag-lock') soon(el.id === 'bag-lock' ? 'Locking' : 'Salvage');
    else if (el.id === 'bag-expand') soon('Bag expansion');
    else if (el.id === 'craft-go') soon('Crafting');
  });

  $('content').addEventListener('change', ev => {
    const el = ev.target as HTMLInputElement;
    if (el.name === 'craft-affix') state.craftAffix = Number(el.value);
    else if (el.id === 'float-toggle') localStorage.setItem('floatNumbers', el.checked ? 'on' : 'off');
    else if (el.closest('#affix-checks')) {
      if (el.checked) state.filterAffixes.add(el.value);
      else state.filterAffixes.delete(el.value);
      renderView('filter');
    }
  });

  $('content').addEventListener('input', ev => {
    const el = ev.target as HTMLInputElement;
    if (el.id !== 'affix-search') return;
    const q = el.value.toLowerCase();
    $('affix-checks')
      .querySelectorAll<HTMLElement>('.check')
      .forEach(c => (c.hidden = !c.textContent!.toLowerCase().includes(q)));
  });
}
