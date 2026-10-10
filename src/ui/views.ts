// Renders the in-game views from the player's data (snapshot.ts). Numbers come from
// the same pure modules the server settles with (combat.ts, craft.ts, equip.ts).

import type { Item, SettleLog } from '../module_bindings/types';
import { combatStats, defenseAgainst, matchup, type Matchup } from '../../spacetimedb/src/combat';
import { bagExpansionCost, rerollCost, upgradeCost, type CraftCost } from '../../spacetimedb/src/craft';
import { SLOTS, base, type BaseKind } from '../../spacetimedb/src/data/bases';
import { Effect, LEGENDARIES_BY_ID } from '../../spacetimedb/src/data/legendary';
import { STATS, Stat, fromStored, type StatId } from '../../spacetimedb/src/data/stats';
import { ZONES, ZONES_BY_ID, bossOf, previousZone, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import { fitsSlot, placeItem } from '../../spacetimedb/src/equip';
import { BAG_MAX } from '../../spacetimedb/src/game';
import { RARITIES, rarityRank, salvageValue, type RarityName } from '../../spacetimedb/src/loot';
import { $, call } from './dom';
import { startFight } from './fight';
import { esc, fmt, fmtBig, getNumberFormat, pct, secs, setNumberFormat, type NumberFormat } from './format';
import { hydrateIcons, icon } from './icons';
import { affixLabel, itemCard, itemName, rarityCls, statText } from './items';
import { gearFor, type Snapshot } from './snapshot';
import { setTheme, themePref, type ThemePref } from './theme';

type BagSort = 'newest' | 'rarity' | 'tier' | 'slot';

const state = {
  /** Zone tab shown on the Zones view; undefined = the current zone. */
  zoneId: undefined as number | undefined,
  dropsOf: undefined as number | undefined,
  /** Loadout shown on the Equipment view; undefined = the active one. */
  loadout: undefined as number | undefined,
  pickSlot: undefined as number | undefined,
  bagSelected: new Set<bigint>(),
  /** Last plainly or ctrl-clicked bag item: the start of a shift-click range. */
  bagAnchor: undefined as bigint | undefined,
  /** Slots of a loadout before its last auto-equip, for the summary. */
  autoSummary: undefined as { loadout: number; before: bigint[] } | undefined,
  bagSort: 'newest' as BagSort,
  bagKind: 'all' as BaseKind | 'all',
  craftItem: undefined as bigint | undefined,
  craftTab: 'reroll' as 'reroll' | 'upgrade',
  craftAffix: 0,
  affixSearch: '',
  /** Fight scene identity: rebuilt only when the fight changes. */
  fightKey: '',
};

let snap: Snapshot | undefined;

/** Called on every render with fresh data; views redraw on `renderView`. */
export function setSnapshot(s: Snapshot) {
  snap = s;
}

// ---------------------------------------------------------------- helpers

function viewHeader(title: string, iconName: string, extra = '') {
  return `<div class="view-head"><h1><i data-icon="${iconName}"></i>${title}</h1>${extra}</div>`;
}

const margin = (m: Matchup) => m.timeToDie / m.timeToKill;
const result = (m: Matchup | undefined) => (!m ? '—' : m.viable ? `Win ${fmt(margin(m))}×` : 'Lose ✖');
const perHour = (m: Matchup) => m.killRate * 3600;
const dmgTag = (e: EnemyDef) => `<span class="tag ${e.damageType === 'Magic' ? 'magic' : 'phys'}">${e.damageType === 'Magic' ? 'Magic' : 'Phys'}</span>`;
const zoneLevels = (z: ZoneDef) => `${Math.min(...z.enemies.map(e => e.level))}–${Math.max(...z.enemies.map(e => e.level))}`;

function zoneUnlocked(s: Snapshot, z: ZoneDef) {
  const prev = previousZone(z);
  return !prev || s.killedZones.has(prev.id);
}

function statRows(rows: [string, string, string?][]) {
  return rows
    .map(([k, v, hint]) => `<div class="stat-row"${hint ? ` title="${hint}"` : ''}><span>${k}</span><strong>${v}</strong></div>`)
    .join('');
}

/** Why a craft can't be paid for, or undefined. */
function cantAfford(s: Snapshot, c: CraftCost): string | undefined {
  if (s.gold < c.gold) return `Need ${fmtBig(c.gold - s.gold)} more gold`;
  if (s.row.essence < c.essence) return `Need ${fmtBig(c.essence - s.row.essence)} more Essence`;
  return undefined;
}
const costText = (c: CraftCost) => `${fmtBig(c.gold)} gold · ${fmtBig(c.essence)} Essence`;

/** "In Farm, Boss" for an item in loadouts. */
function loadoutNote(s: Snapshot, it: Item) {
  const ls = s.inLoadouts.get(it.id);
  return ls ? `In ${ls.map(i => esc(s.loadouts[i]?.name ?? `Set ${i + 1}`)).join(', ')}` : undefined;
}

// ---------------------------------------------------------------- fight

function lootLines(s: Snapshot, logs: SettleLog[], max = 30): string {
  const lines: string[] = [];
  for (const log of logs) {
    for (const id of log.keptItemIds) {
      const it = s.items.get(id);
      if (it) {
        lines.push(`<li><a href="#crafting" data-craft="${it.id}" class="c-${rarityCls(it.rarity.tag)}">${it.rarity.tag} ${itemName(it)}</a><span class="muted">kept</span></li>`);
      }
    }
    const salvaged = RARITIES.map((r, i) => [r, log.salvaged[i] ?? 0] as const).filter(([, n]) => n > 0);
    if (salvaged.length) {
      lines.push(`<li class="dim"><span>${salvaged.map(([r, n]) => `${n} ${r}`).join(', ')}</span><span class="muted">salvaged +${fmtBig(log.essence)} Essence</span></li>`);
    }
    if (lines.length >= max) break;
  }
  return lines.slice(0, max).join('') || '<li class="muted">No drops yet. Drops are rare: about 1 every 2 minutes.</li>';
}

function fightKpis(m: Matchup) {
  return `
    <div class="kpi"><span>Time to kill</span><strong>${secs(m.timeToKill)}</strong></div>
    <div class="kpi"><span>Time to die</span><strong>${secs(m.timeToDie)}</strong></div>
    <div class="kpi ${m.viable ? 'ok' : 'bad'}"><span>Result</span><strong>${result(m)}</strong></div>
    <div class="kpi"><span>Kills / h</span><strong>${fmt(perHour(m))}</strong></div>
    <div class="kpi"><span>XP / h</span><strong>${fmt(perHour(m) * m.xpPerKill)}</strong></div>
    <div class="kpi"><span>Gold / h</span><strong>${fmt(perHour(m) * m.goldPerKill)}</strong></div>`;
}

const keepLabel = (s: Snapshot) => `Keeping ${s.filter?.minRarity.tag ?? 'Magic'}+${s.filter?.keepAffixes.length ? ` and ${s.filter.keepAffixes.length} affixes` : ''}`;

function renderFight(s: Snapshot) {
  const view = $('view-fight');
  if (!s.target || !s.fight) {
    state.fightKey = '';
    view.innerHTML = `${viewHeader('Fight', 'swords')}<div class="card"><p class="muted">No target. Pick an enemy on the Zones screen.</p><a class="btn small" href="#zones">${icon('map')}Zones</a></div>`;
    return;
  }
  const { zone, enemy: e } = s.target;
  const m = s.fight;
  const key = `${e.id}|${s.level}|${m.dps}|${m.timeToDie}|${s.stats.maxHp}`;
  if (key === state.fightKey && document.getElementById('scene')) {
    $('fight-kpis').innerHTML = fightKpis(m);
    $('loot-log').innerHTML = lootLines(s, s.logs);
    $('loot-keep').textContent = keepLabel(s);
    return;
  }
  state.fightKey = key;
  view.innerHTML = `
    ${viewHeader('Fight', 'swords')}
    <div class="fight-target">
      <div>
        <div class="crumb">${zone.name} <span class="muted">T${zone.tier}</span></div>
        <div class="target-name">${e.boss ? icon('skull', 'boss') : ''}${e.name}</div>
        <div class="tags"><span class="tag">Lv ${e.level}</span>${dmgTag(e)}<span class="tag">${e.defense}</span></div>
      </div>
      <a class="btn small ghost" href="#zones">${icon('map')}Change target</a>
    </div>

    <div class="scene card" id="scene">
      <div class="fighter" id="fighter-you">
        <div class="portrait you">${icon('user')}</div>
        <div class="fighter-name">${esc(s.row.name)} <span class="muted">Lv ${s.level}</span></div>
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

    <div class="kpis" id="fight-kpis">${fightKpis(m)}</div>

    <div class="card">
      <div class="card-head"><h2>Loot log</h2><span class="muted" id="loot-keep">${keepLabel(s)}</span></div>
      <ul class="loot-log" id="loot-log">${lootLines(s, s.logs)}</ul>
    </div>`;
  startFight(s.stats, m, e);
}

/** The activity strip in the top bar; called on every tick. */
export function updateActivity(s: Snapshot) {
  const m = s.fight;
  $('activity-text').textContent = s.target ? `${s.target.zone.name} › ${s.target.enemy.name}` : 'No target';
  $('activity-rate').textContent = !m ? '' : m.viable ? `${secs(m.timeToKill)} · ${fmt(perHour(m))}/h · ${result(m)}` : 'Lose ✖';
  $('activity').querySelector('.dot')!.className = `dot ${m?.viable ? 'ok' : 'bad'}`;
}

// ---------------------------------------------------------------- zones

function zoneRows(s: Snapshot, z: ZoneDef) {
  const unlocked = zoneUnlocked(s, z);
  const bossDown = s.killedZones.has(z.id);
  return z.enemies
    .map(e => {
      const m = matchup(s.stats, e);
      const active = s.row.targetEnemyId === e.id;
      const action = !unlocked
        ? `<span class="muted">${icon('lock')}</span>`
        : e.boss && !bossDown
          ? `<button class="btn small danger" data-boss="${z.id}">Challenge</button>`
          : active
            ? `<span class="tag ok">Fighting</span>`
            : `<button class="btn small" data-fight="${e.id}">Fight</button>`;
      return `
      <tr class="${active ? 'active' : ''}${e.boss ? ' boss' : ''}" data-row="${e.id}">
        <td class="name">${e.boss ? icon('skull', 'boss') : ''}${e.name}</td>
        <td>${e.level}</td>
        <td>${dmgTag(e)}</td>
        <td>${e.defense}</td>
        <td class="num">${fmt(e.hp)}</td>
        <td class="num">${fmt(e.dps)}</td>
        <td><span class="result ${m.viable ? 'ok' : 'bad'}">${result(m)}</span></td>
        <td class="num">${m.viable ? secs(m.timeToKill) : '—'}</td>
        <td class="num">${m.viable ? fmt(perHour(m) * m.xpPerKill) : '—'}</td>
        <td class="num">${m.viable ? fmt(perHour(m) * m.goldPerKill) : '—'}</td>
        <td class="num">${e.boss ? 'All' : e.drops.length}</td>
        <td class="actions">${action}</td>
      </tr>`;
    })
    .join('');
}

function renderZones(s: Snapshot) {
  const z = ZONES_BY_ID.get(state.zoneId ?? s.row.zoneId) ?? ZONES[0];
  const unlocked = zoneUnlocked(s, z);
  const prevBoss = previousZone(z) && bossOf(previousZone(z)!);
  $('view-zones').innerHTML = `
    ${viewHeader('Zones', 'map')}
    <div class="seg">
      ${ZONES.map(
        zz => `<button class="seg-btn${zz === z ? ' active' : ''}" data-zone="${zz.id}">
          ${zoneUnlocked(s, zz) ? '' : icon('lock')}T${zz.tier} ${zz.name}${s.killedZones.has(zz.id) ? ' ✔' : ''}</button>`
      ).join('')}
    </div>
    <div class="card">
      <div class="zone-head">
        <div><h2>${z.name} <span class="muted">Levels ${zoneLevels(z)}</span></h2><p class="muted">${z.blurb}</p></div>
        ${unlocked ? '' : `<div class="lock-note">${icon('lock')}Defeat ${prevBoss?.name ?? 'the previous boss'} to unlock</div>`}
      </div>
      <div class="table-wrap">
      <table class="table${unlocked ? '' : ' locked'}">
        <thead><tr>
          <th>Enemy</th><th>Lv</th><th>Dmg</th><th>Defense</th><th class="num">HP</th><th class="num">DPS</th>
          <th>Your result</th><th class="num">Kill</th><th class="num">XP/h</th><th class="num">Gold/h</th><th class="num">Bases</th><th></th>
        </tr></thead>
        <tbody>${zoneRows(s, z)}</tbody>
      </table>
      </div>
      <p class="muted hint">Results use your active loadout (${esc(s.active.name)}).</p>
    </div>
    <div class="card" id="zone-drops"></div>`;
  const shown = z.enemies.find(e => e.id === state.dropsOf) ?? z.enemies.find(e => e.id === s.row.targetEnemyId) ?? z.enemies[0];
  showDrops(z, shown);
}

function showDrops(z: ZoneDef, e: EnemyDef) {
  $('zone-drops').innerHTML = `
    <div class="card-head"><h2>${e.name} drops</h2><span class="muted">${e.boss ? 'Every base of the zone' : 'Each base drops from exactly one enemy in the zone'}</span></div>
    <div class="chips">${e.drops.map(d => `<span class="chip">${base(d).name(z.tier)}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- character

/** Summed gear values per stat (display units). */
function gearSums(s: Snapshot) {
  const sum = new Map<number, number>();
  for (const it of s.gear) {
    if (!it) continue;
    for (const st of [...it.implicits, ...it.affixes, ...(it.legendary ? [it.legendary] : [])]) {
      sum.set(st.stat, (sum.get(st.stat) ?? 0) + fromStored(st.value));
    }
  }
  return sum;
}

function effectsCard(effects: ReadonlySet<number>) {
  if (!effects.size) return '';
  const both = effects.has(Effect.MidasTouch) && effects.has(Effect.ScholarsFocus);
  return `<div class="card"><div class="card-head"><h2>Legendary effects</h2></div>
    ${[...effects].map(id => LEGENDARIES_BY_ID.get(id)!).map(l => `<div class="stat-row"><span>${icon('sparkles')}${l.name}</span><span class="muted">${l.text}</span></div>`).join('')}
    ${both ? `<p class="c-bad">Midas Touch and Scholar's Focus together: no XP and only × 1.25 gold.</p>` : ''}
  </div>`;
}

/** "Copper Sword: +2 Physical damage" for each worn stat among `ids`. */
function gearLines(s: Snapshot, ids: readonly number[]): string[] {
  const lines: string[] = [];
  for (const it of s.gear) {
    if (!it) continue;
    for (const st of [...it.implicits, ...it.affixes, ...(it.legendary ? [it.legendary] : [])]) {
      if (ids.includes(st.stat)) lines.push(`${itemName(it)}: ${statText(st.stat, st.value)}`);
    }
  }
  return lines;
}

/** Hover text for a stat: base and primary-attribute notes, then the items that add to it. */
function breakdown(s: Snapshot, ids: readonly number[], ...notes: (string | false | undefined)[]): string {
  const gear = gearLines(s, ids);
  return esc([...notes.filter(Boolean), ...(gear.length ? ['From gear:', ...gear.map(l => `  ${l}`)] : ['No gear bonuses'])].join('\n'));
}

const n1 = (x: number) => String(Number(x.toFixed(2)));

function renderCharacter(s: Snapshot) {
  const st = s.stats;
  const sums = gearSums(s);
  const enemyLevel = s.target?.enemy.level ?? s.level;
  const phys = defenseAgainst(st, 'Physical', enemyLevel);
  const magic = defenseAgainst(st, 'Magic', enemyLevel);
  const src = st.sources[0];
  const w = s.gear[0]?.weapon;
  const prim = (id: number) => s.level + (sums.get(id) ?? 0);
  const [might, finesse, mind, vit] = [prim(Stat.Might), prim(Stat.Finesse), prim(Stat.Mind), prim(Stat.Vitality)];
  const has = (e: number) => st.effects.has(e);
  const primary = (name: string, id: number) => {
    const gear = sums.get(id) ?? 0;
    return [name, fmt(s.level + gear), breakdown(s, [id], `${s.level} from levels`)] as [string, string, string];
  };
  $('view-character').innerHTML = `
    ${viewHeader('Character', 'user')}
    <div class="grid-4">
      <div class="card"><div class="card-head"><h2>Primaries</h2></div>
        ${statRows([primary('Might', Stat.Might), primary('Finesse', Stat.Finesse), primary('Mind', Stat.Mind), primary('Vitality', Stat.Vitality)])}
      </div>
      <div class="card"><div class="card-head"><h2>Offense</h2></div>
        ${statRows(
          src
            ? [
                ['Hit', [src.hit.Physical ? `${fmt(src.hit.Physical)} phys` : '', src.hit.Magic ? `${fmt(src.hit.Magic)} magic` : ''].filter(Boolean).join(' + ') || '0',
                  breakdown(s, [Stat.PhysDamage, Stat.PhysDamagePct, Stat.MagicDamage, Stat.MagicDamagePct],
                    w && `Weapon: ${n1(fromStored(w.hit))} ${w.damageType.tag.toLowerCase()} per hit`,
                    `Might ${n1(might)}: +${n1(0.5 * might)}% physical damage`,
                    `Mind ${n1(mind)}: +${n1(0.45 * mind)}% magic damage`,
                    'Flat damage is per hit at 1.0/s, scaled by weapon speed',
                    has(Effect.Spellblade) && 'Spellblade: damage type swapped, both damage-% groups apply',
                    has(Effect.GlassCannon) && 'Glass Cannon: × 2',
                    has(Effect.Voidtouched) && 'Voidtouched: × 0.75, ignores enemy mitigation')],
                ...(src.heal ? [['Heal', fmt(src.heal), breakdown(s, [Stat.Heal, Stat.HealPct], `Mind ${n1(mind)}: +${n1(0.45 * mind)}% heal`)] as [string, string, string]] : []),
                ['Attack speed', `${src.attacksPerSec.toFixed(2)} /s`,
                  breakdown(s, [Stat.AttackSpeedPct], w && `Weapon: ${w.speedMilli / 1000}/s`, `Finesse ${n1(finesse)}: +${n1(0.1 * finesse)}%`, 'Floor: 25% of the weapon\'s speed')],
                ['Crit chance', pct(src.critChance, 1),
                  breakdown(s, [Stat.CritChancePct], w && `Weapon base: ${w.baseCritBp / 100}%`, `Finesse ${n1(finesse)}: +${n1(0.4 * finesse)}% increased`, 'Rolls use at most 100%',
                    has(Effect.Overcrit) && 'Overcrit: each 1% above 100% gives +2% crit damage')],
                ['Crit damage', pct(st.critDamage), breakdown(s, [Stat.CritDamage], 'Base 150%')],
                ['Armor / magic pen', `${pct(st.armorPen)} / ${pct(st.magicPen)}`, breakdown(s, [Stat.ArmorPenPct, Stat.MagicPenPct], 'Cap 75% each')],
                ['DPS vs target', s.fight ? fmt(s.fight.dps) : '—',
                  esc(['Hit × attack speed × average crit, after the target\'s mitigation',
                    has(Effect.Thornshell) ? 'Thornshell: + 40% of the damage you take' : '',
                    has(Effect.ZealotsOath) ? "Zealot's Oath: + 50% of your heals" : ''].filter(Boolean).join('\n'))],
              ]
            : [['Weapon', 'None equipped']]
        )}
      </div>
      <div class="card"><div class="card-head"><h2>Defense</h2></div>
        ${statRows([
          ['Max HP', fmt(st.maxHp), breakdown(s, [Stat.MaxHp, Stat.MaxHpPct], `Base ${100 + 10 * (s.level - 1)} (100 + 10 per level)`,
            `Might ${n1(might)}: +${n1(0.2 * might)}%`, `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`, has(Effect.GlassCannon) && 'Glass Cannon: × 0.5')],
          ['HP regen', `${fmt(st.regen)} /s`, breakdown(s, [Stat.HpRegen], `Vitality ${n1(vit)}: +${n1(vit)}%`)],
          ['Armor', `${fmt(st.armor)} (${pct(phys.mitigation)} vs phys)`, breakdown(s, [Stat.Armor, Stat.ArmorPct], `Mitigation vs Lv ${enemyLevel}: armor / (armor + ${5 * s.level}), cap 85%`,
            has(Effect.Spellward) && 'Spellward: physical uses the better of armor and resistance')],
          ['Resistance', `${fmt(st.resistance)} (${pct(magic.mitigation)} vs magic)`, breakdown(s, [Stat.Resistance, Stat.ResistancePct],
            has(Effect.Juggernaut) && 'Juggernaut: magic uses the better of armor and resistance')],
          ['Evasion', `${pct(phys.evasion)}`, breakdown(s, [Stat.EvasionRating, Stat.EvasionRatingPct], `Rating ${fmt(st.evasionRating)} vs Lv ${enemyLevel}: rating / (rating + ${10 * enemyLevel})`,
            `Finesse ${n1(finesse)}: +${n1(0.25 * finesse)}% rating`, `Cap ${has(Effect.PhantomStep) ? '75% (Phantom Step)' : '60%'}`,
            (has(Effect.Juggernaut) || has(Effect.Spellward)) && "Juggernaut / Spellward: you can't evade")],
          ['Lifesteal', pct(st.lifesteal, 1), breakdown(s, [Stat.LifestealPct], 'Cap 3%')],
        ])}
      </div>
      <div class="card"><div class="card-head"><h2>Utility</h2></div>
        ${statRows([
          ['Item find', pct(st.itemFind), breakdown(s, [Stat.ItemFindPct], has(Effect.FortunesFavor) && "Fortune's Favor: kept drops have a 15% chance to be one rarity higher")],
          ['Gold find', pct(st.goldFind), breakdown(s, [Stat.GoldFindPct], has(Effect.MidasTouch) && 'Midas Touch: gold × 2.5', has(Effect.ScholarsFocus) && "Scholar's Focus: gold × 0.5")],
          ['XP gain', pct(st.xpGain), breakdown(s, [Stat.XpGainPct], has(Effect.MidasTouch) && 'Midas Touch: no XP', has(Effect.ScholarsFocus) && "Scholar's Focus: XP × 1.75")],
          ['Threat', pct(st.threat), breakdown(s, [Stat.ThreatPct], `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`)],
        ])}
      </div>
    </div>
    ${effectsCard(st.effects)}
    <p class="muted hint">Hover a stat to see where it comes from. Mitigation and evasion are against Lv ${enemyLevel}${s.target ? ` (${s.target.enemy.name})` : ''}.</p>`;
}

// ---------------------------------------------------------------- equipment

const SLOT_LABEL = ['Main hand', 'Off-hand', 'Head', 'Chest', 'Hands', 'Feet', 'Ring 1', 'Ring 2', 'Amulet'];

interface Total {
  label: string;
  value: number;
  show: (n: number) => string;
  lowerBetter?: boolean;
}

/** Loadout totals compared on swaps and after auto-equip (ui.md: totals, never an item score). */
function totals(s: Snapshot, slots: readonly bigint[]): Total[] {
  const st = combatStats(s.level, gearFor(slots, s.items));
  const src = st.sources[0];
  const m = s.target && matchup(st, s.target.enemy);
  const level = s.target?.enemy.level ?? s.level;
  const p = (x: number) => pct(x, 1);
  return [
    { label: 'Hit', value: src ? src.hit.Physical + src.hit.Magic : 0, show: fmt },
    { label: 'Max HP', value: st.maxHp, show: fmt },
    { label: 'Armor', value: st.armor, show: fmt },
    { label: 'Resistance', value: st.resistance, show: fmt },
    { label: 'Evasion', value: defenseAgainst(st, 'Physical', level).evasion, show: p },
    { label: 'Item find', value: st.itemFind, show: p },
    { label: 'Gold find', value: st.goldFind, show: p },
    { label: 'XP gain', value: st.xpGain, show: p },
    ...(m
      ? [
          { label: 'DPS', value: m.dps, show: fmt },
          { label: 'Kill', value: m.timeToKill, show: secs, lowerBetter: true },
          { label: 'Die', value: m.timeToDie, show: secs },
        ]
      : []),
  ];
}

function compareTable(before: Total[], after: Total[]) {
  return before
    .map((b, i) => {
      const a = after[i];
      const same = a.value === b.value || Math.abs(a.value - b.value) < 1e-9;
      const better = a.lowerBetter ? a.value < b.value : a.value > b.value;
      return `<div class="stat-row${same ? ' dim' : ''}"><span>${b.label}</span><strong>${
        same ? b.show(b.value) : `${b.show(b.value)} → <span class="${better ? 'c-ok' : 'c-bad'}">${a.show(a.value)}</span>`
      }</strong></div>`;
    })
    .join('');
}

const slotItemName = (s: Snapshot, id: bigint) => {
  const it = id === 0n ? undefined : s.items.get(id);
  return it ? `<span class="c-${rarityCls(it.rarity.tag)}">${itemName(it)}</span>` : '<span class="muted">Empty</span>';
};

/** Equipped vs hovered item, and the loadout totals before → after the swap. */
function renderCompare(s: Snapshot, lo: Snapshot['active'], slot: number, itemId: bigint) {
  const it = s.items.get(itemId);
  const box = document.getElementById('compare');
  if (!it || !box) return;
  const next = placeItem(lo.slots, slot, it, id => s.items.get(id));
  if (typeof next === 'string') return;
  const cur = s.items.get(lo.slots[slot]);
  const also = next.map((id, i) => [i, id] as const).filter(([i, id]) => i !== slot && id !== lo.slots[i]);
  box.innerHTML = `
    <div class="compare-items">
      <div><div class="slot-label">Equipped</div>${cur ? itemCard(cur, { compact: true }) : '<div class="item-card compact empty"><span class="muted">Empty</span></div>'}</div>
      <div><div class="slot-label">Hovered</div>${itemCard(it, { compact: true, note: loadoutNote(s, it) })}</div>
    </div>
    ${also.map(([i]) => `<p class="muted">Also empties ${SLOT_LABEL[i]} (${slotItemName(s, lo.slots[i])}).</p>`).join('')}
    <div class="card-head"><h2>Loadout totals</h2>${s.target ? `<span class="muted">vs ${s.target.enemy.name}</span>` : ''}</div>
    ${compareTable(totals(s, lo.slots), totals(s, next))}`;
}

function autoSummary(s: Snapshot, lo: Snapshot['active']) {
  const a = state.autoSummary;
  if (!a || a.loadout !== lo.index) return '';
  const changes = lo.slots.map((id, i) => [i, a.before[i] ?? 0n, id] as const).filter(([, b, n]) => b !== n);
  return `
    <div class="card" id="auto-summary">
      <div class="card-head"><h2>Auto-equip · ${lo.profile.tag}</h2><button class="btn small ghost" data-summary-close>Dismiss</button></div>
      ${changes.length
        ? `${changes.map(([i, b, n]) => `<div class="stat-row"><span>${SLOT_LABEL[i]}</span><strong>${slotItemName(s, b)} → ${slotItemName(s, n)}</strong></div>`).join('')}
           <div class="card-head" style="margin-top:12px"><h2>Totals before → after</h2>${s.target ? `<span class="muted">vs ${s.target.enemy.name}</span>` : ''}</div>
           ${compareTable(totals(s, a.before), totals(s, lo.slots))}`
        : '<p class="muted">Already the best gear you own for this profile: nothing changed.</p>'}
    </div>`;
}

function fightLine(m: Matchup | undefined) {
  return m ? `Kill ${secs(m.timeToKill)} · Die ${secs(m.timeToDie)} · ${result(m)}` : 'No target';
}

function slotPicker(s: Snapshot, lo: Snapshot['active'], slot: number) {
  const lookup = (id: bigint) => s.items.get(id);
  const now = s.target && matchup(combatStats(s.level, gearFor(lo.slots, s.items)), s.target.enemy);
  const candidates = [...s.items.values()]
    .filter(it => fitsSlot(it.baseId, slot) && it.id !== lo.slots[slot])
    .sort((a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag));
  const rows = candidates.map(it => {
    const next = placeItem(lo.slots, slot, it, lookup);
    if (typeof next === 'string') return `<div class="list-item" title="${next}"><span class="item-name c-${rarityCls(it.rarity.tag)}">${itemName(it)}</span><span class="muted">${next}</span></div>`;
    const m = s.target && matchup(combatStats(s.level, gearFor(next, s.items)), s.target.enemy);
    const note = loadoutNote(s, it);
    return `<button class="list-item" data-equip="${it.id}" title="${note ?? ''}">
      <span class="item-name c-${rarityCls(it.rarity.tag)}">${itemName(it)} <span class="muted">T${it.tier} ${it.rarity.tag}${note ? ` · ${note}` : ''}</span></span>
      <span class="muted">${m && now ? `Kill ${secs(now.timeToKill)} → ${secs(m.timeToKill)} · Die ${secs(now.timeToDie)} → ${secs(m.timeToDie)}` : ''}</span>
    </button>`;
  });
  return `
    <div class="card" id="slot-picker">
      <div class="card-head"><h2>${SLOT_LABEL[slot]}</h2>
        <span>${lo.slots[slot] !== 0n ? `<button class="btn small ghost" data-unequip="${slot}">Unequip</button>` : ''}
        <button class="btn small ghost" data-pick-close>Close</button></span></div>
      <div class="picker">
        <div class="picker-list">${rows.join('') || '<p class="muted">No other items fit this slot.</p>'}</div>
        <div class="compare" id="compare"><p class="muted">Hover an item to compare it with the equipped one.</p></div>
      </div>
      ${s.target ? `<p class="muted hint">Kill and die times are against ${s.target.enemy.name} with this loadout.</p>` : ''}
    </div>`;
}

function renderEquipment(s: Snapshot) {
  const lo = s.loadouts.find(l => l.index === (state.loadout ?? s.row.activeLoadout)) ?? s.active;
  const gear = gearFor(lo.slots, s.items);
  const stats = combatStats(s.level, gear);
  const m = s.target && matchup(stats, s.target.enemy);
  const isActive = lo.index === s.row.activeLoadout;
  $('view-equipment').innerHTML = `
    ${viewHeader('Equipment', 'shield')}
    <div class="toolbar card">
      <span class="toolbar-label">Loadout</span>
      <div class="seg">${s.loadouts
        .map(l => `<button class="seg-btn${l.index === lo.index ? ' active' : ''}" data-loadout="${l.index}">${l.index + 1} ${esc(l.name)}${l.index === s.row.activeLoadout ? ' ✔' : ''}</button>`)
        .join('')}</div>
      ${isActive ? '<span class="tag ok">In use</span>' : `<button class="btn small" id="use-loadout">Use this loadout</button>`}
      <button class="btn small ghost" id="rename-loadout">Rename</button>
      <span class="spacer"></span>
      <span class="toolbar-label">Profile</span>
      <select id="profile">${['Damage', 'Survival', 'Loot'].map(p => `<option${p === lo.profile.tag ? ' selected' : ''}>${p}</option>`).join('')}</select>
      <button class="btn primary small" id="auto-equip">${icon('zap')}Auto-equip</button>
    </div>
    <div class="equip-grid">
      ${SLOTS.map((_, i) => {
        const it = gear[i] && s.items.get(lo.slots[i]);
        return `<div class="slot" data-slot="${i}"><div class="slot-label">${SLOT_LABEL[i]}</div>${
          it ? itemCard(it, { compact: true, selected: state.pickSlot === i }) : `<div class="item-card compact empty${state.pickSlot === i ? ' selected' : ''}"><span class="muted">Empty</span></div>`
        }</div>`;
      }).join('')}
    </div>
    ${autoSummary(s, lo)}
    ${state.pickSlot !== undefined ? slotPicker(s, lo, state.pickSlot) : ''}
    <div class="totals card">
      <span>HP <strong>${fmt(stats.maxHp)}</strong></span>
      <span>Armor <strong>${fmt(stats.armor)}</strong></span>
      <span>Resistance <strong>${fmt(stats.resistance)}</strong></span>
      <span>DPS <strong>${m ? fmt(m.dps) : '—'}</strong></span>
      <span class="${m?.viable ? 'c-ok' : 'c-bad'}">${fightLine(m)}${s.target ? ` vs ${s.target.enemy.name}` : ''}</span>
    </div>
    ${effectsCard(stats.effects)}
    <p class="muted hint">Click a slot to change it. Auto-equip scores against a reference enemy of your level, not your target.</p>`;
}

// ---------------------------------------------------------------- bag

function sortedBag(s: Snapshot): Item[] {
  const items = s.bag.filter(it => state.bagKind === 'all' || base(it.baseId).kind === state.bagKind);
  const by: Record<BagSort, (a: Item, b: Item) => number> = {
    newest: (a, b) => (a.id < b.id ? 1 : -1),
    rarity: (a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier,
    tier: (a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag),
    slot: (a, b) => SLOTS.indexOf(base(a.baseId).slots[0]) - SLOTS.indexOf(base(b.baseId).slots[0]) || b.tier - a.tier,
  };
  return items.sort(by[state.bagSort]);
}

function renderBag(s: Snapshot) {
  // Drop selections of items that left the bag.
  for (const id of state.bagSelected) if (!s.bag.some(i => i.id === id)) state.bagSelected.delete(id);
  const selected = s.bag.filter(i => state.bagSelected.has(i.id));
  const anyLocked = selected.some(i => i.locked);
  const essence = selected.reduce((sum, i) => sum + salvageValue(i.rarity.tag, i.tier), 0n);
  const cost = bagExpansionCost(s.row.bagSize);
  const opt = (v: string, label: string, cur: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  $('view-bag').innerHTML = `
    ${viewHeader('Bag', 'bag')}
    <div class="toolbar card">
      <span class="toolbar-label">Bag <strong>${s.bag.length}</strong> / ${s.row.bagSize}</span>
      ${cost === undefined
        ? `<span class="muted">Maximum size (${BAG_MAX})</span>`
        : `<button class="btn small ghost" id="bag-expand" ${s.gold < cost ? `disabled title="Need ${fmtBig(cost - s.gold)} more gold"` : ''}>+25 slots · ${fmtBig(cost)} gold</button>`}
      <span class="spacer"></span>
      <select id="bag-sort">${opt('newest', 'Sort: Newest', state.bagSort)}${opt('rarity', 'Sort: Rarity', state.bagSort)}${opt('tier', 'Sort: Tier', state.bagSort)}${opt('slot', 'Sort: Slot', state.bagSort)}</select>
      <select id="bag-kind">${opt('all', 'All slots', state.bagKind)}${opt('weapon', 'Weapons', state.bagKind)}${opt('offhand', 'Off-hands', state.bagKind)}${opt('armor', 'Armor', state.bagKind)}${opt('jewelry', 'Jewelry', state.bagKind)}</select>
    </div>
    <div class="item-grid">${sortedBag(s).map(it => itemCard(it, { select: true, selected: state.bagSelected.has(it.id), compact: true })).join('') || '<p class="muted">The bag is empty. Equipped items are on the Equipment screen.</p>'}</div>
    <div class="action-bar card${selected.length ? '' : ' empty'}">
      <span>${selected.length ? `<strong>${selected.length}</strong> selected` : 'Click to select · Ctrl-click to add · Shift-click for a range'}</span>
      ${selected.length ? '<button class="btn small ghost" id="bag-clear">Clear</button>' : ''}
      <button class="btn small ghost" id="bag-all">Select all shown</button>
      <span class="spacer"></span>
      <button class="btn small" id="bag-lock" ${selected.length ? '' : 'disabled'}>${icon('lock')}${selected.length && selected.every(i => i.locked) ? 'Unlock' : 'Lock'}</button>
      <button class="btn small" id="bag-craft" ${selected.length === 1 ? '' : 'disabled'}>${icon('hammer')}Craft…</button>
      <button class="btn small danger" id="bag-salvage" ${selected.length && !anyLocked ? '' : 'disabled'} ${anyLocked ? 'title="Locked items can\'t be salvaged"' : ''}>Salvage → +${fmtBig(essence)} Essence</button>
    </div>`;
}

// ---------------------------------------------------------------- crafting

function renderCrafting(s: Snapshot) {
  const items = [...s.items.values()].sort((a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier || (a.id < b.id ? 1 : -1));
  const item = s.items.get(state.craftItem ?? 0n) ?? items[0];
  const view = $('view-crafting');
  if (!item) {
    view.innerHTML = `${viewHeader('Crafting', 'hammer')}<div class="card"><p class="muted">No items yet.</p></div>`;
    return;
  }
  state.craftItem = item.id;
  const reroll = state.craftTab === 'reroll';
  const rarity = item.rarity.tag as RarityName;
  const cost = reroll ? rerollCost(item) : upgradeCost(item);
  const next = RARITIES[rarityRank(rarity) + 1];
  const toLegendary = !reroll && rarity === 'Epic';
  const affixPick = (name: string) =>
    `<div class="affix-pick">${item.affixes
      .map(
        (a, i) => `<label class="radio"><input type="radio" name="${name}" value="${i}" ${i === state.craftAffix ? 'checked' : ''}/>
        <span>${statText(a.stat, a.value)}</span><span class="affix-tier">T${a.tier}</span></label>`
      )
      .join('')}</div>`;

  let body: string;
  if (rarity === 'Unique') body = `<p class="muted">Uniques can't be crafted.</p>`;
  else if (reroll) {
    body = item.affixes.length
      ? `<p class="muted">The chosen affix is replaced by a new random one, rolled like a drop.${item.legendary ? ' The legendary affix stays.' : ''}</p>${affixPick('craft-affix')}`
      : `<p class="muted">This item has no affixes to reroll. Upgrade its rarity first.</p>`;
  } else {
    body = cost
      ? `<p>${rarity} → <strong class="c-${rarityCls(next)}">${next}</strong>: ${toLegendary ? 'remove the affix you pick, add a random legendary affix.' : 'adds one random affix.'}</p>${toLegendary ? affixPick('craft-affix') : ''}`
      : `<p class="muted">Legendary is the highest craftable rarity.</p>`;
  }
  const blocked = !cost || (reroll && !item.affixes.length) ? 'Nothing to craft' : cantAfford(s, cost);
  view.innerHTML = `
    ${viewHeader('Crafting', 'hammer', `<div class="head-tags"><span class="chip">${icon('coins')}${fmtBig(s.gold)}</span><span class="chip">${icon('gem')}${fmtBig(s.row.essence)}</span></div>`)}
    <div class="craft">
      <div class="card craft-list">
        <div class="card-head"><h2>Items</h2><span class="muted">${items.length}</span></div>
        ${items.map(it => `<button class="list-item r-${rarityCls(it.rarity.tag)}${it.id === item.id ? ' active' : ''}" data-craft="${it.id}"><span class="item-name">${itemName(it)}</span><span class="muted">T${it.tier} ${it.rarity.tag}${s.inLoadouts.has(it.id) ? ' · equipped' : ''}</span></button>`).join('')}
      </div>
      <div class="craft-main">
        ${itemCard(item, { note: loadoutNote(s, item) })}
        <div class="card">
          <div class="seg">
            <button class="seg-btn${reroll ? ' active' : ''}" data-craft-tab="reroll">Reroll affix</button>
            <button class="seg-btn${reroll ? '' : ' active'}" data-craft-tab="upgrade">Upgrade rarity</button>
          </div>
          ${body}
          ${cost ? `<div class="cost">Cost: <strong>${costText(cost)}</strong></div>` : ''}
          <button class="btn primary" id="craft-go" ${blocked ? `disabled title="${blocked}"` : ''}>${reroll ? 'Reroll' : 'Upgrade'}</button>
          ${blocked && cost && blocked !== 'Nothing to craft' ? `<span class="muted"> ${blocked}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- loot filter

const AFFIX_STATS = (Object.values(STATS) as (typeof STATS)[StatId][]).filter(d => d.ref !== undefined).map(d => d.id);

function filterSummary(s: Snapshot) {
  const since = BigInt(Date.now() - 8 * 3600_000) * 1000n;
  const recent = s.logs.filter(l => l.at.microsSinceUnixEpoch >= since);
  const kept = recent.reduce((n, l) => n + l.keptItemIds.length, 0);
  const salvaged = recent.reduce((n, l) => n + l.salvaged.reduce((a, b) => a + b, 0), 0);
  const essence = recent.reduce((n, l) => n + l.essence, 0n);
  const overflow = recent.reduce((n, l) => n + l.overflow, 0);
  return statRows([
    ['Drops', String(kept + salvaged)],
    ['Kept', String(kept)],
    ['Salvaged', `${salvaged} (+${fmtBig(essence)} Essence)`],
    ...(overflow ? [['Salvaged for a full bag', String(overflow)] as [string, string]] : []),
  ]);
}

function renderFilter(s: Snapshot) {
  const min = s.filter?.minRarity.tag ?? 'Magic';
  const keep = new Set(s.filter?.keepAffixes ?? []);
  const q = state.affixSearch.toLowerCase();
  $('view-filter').innerHTML = `
    ${viewHeader('Loot filter', 'filter')}
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Keep rarity</h2></div>
        <p class="muted">Drops below this rarity are salvaged into Essence automatically.</p>
        <div class="seg wrap">${RARITIES.slice(0, 5)
          .map(r => `<button class="seg-btn c-${rarityCls(r)}${r === min ? ' active' : ''}" data-filter-rarity="${r}">${r}+</button>`)
          .join('')}</div>
        <div class="card-head" style="margin-top:12px"><h2>Last 8 hours</h2></div>
        ${filterSummary(s)}
      </div>
      <div class="card">
        <div class="card-head"><h2>Always keep affixes</h2><span class="muted">${keep.size} selected</span></div>
        <input id="affix-search" placeholder="Search affixes…" value="${esc(state.affixSearch)}" />
        <div class="checks" id="affix-checks">${AFFIX_STATS.map(id => {
          const label = affixLabel(id);
          return `<label class="check"${q && !label.toLowerCase().includes(q) ? ' hidden' : ''}><input type="checkbox" value="${id}" ${keep.has(id) ? 'checked' : ''}/>${label}</label>`;
        }).join('')}</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- settings

function renderSettings() {
  const pref = themePref();
  let floats = true;
  try {
    floats = localStorage.getItem('floatNumbers') !== 'off';
  } catch {
    // storage blocked: default on
  }
  $('view-settings').innerHTML = `
    ${viewHeader('Settings', 'settings')}
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Appearance</h2></div>
        <div class="seg">${(['system', 'dark', 'light'] as ThemePref[])
          .map(t => `<button class="seg-btn${t === pref ? ' active' : ''}" data-theme-pref="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)
          .join('')}</div>
        <label class="check"><input type="checkbox" id="float-toggle" ${floats ? 'checked' : ''}/>Floating damage numbers</label>
        <div class="card-head" style="margin-top:12px"><h2>Numbers</h2></div>
        <div class="seg">${([['short', '1.2k'], ['full', '1,234']] as [NumberFormat, string][])
          .map(([f, label]) => `<button class="seg-btn${f === getNumberFormat() ? ' active' : ''}" data-number-format="${f}">${label}</button>`)
          .join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Account</h2></div>
        <p class="muted">Use the buttons at the bottom of the sidebar to log in or out. Guest progress is saved in this browser only.</p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- wiring

const RENDER: Record<string, (s: Snapshot) => void> = {
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
  if (!snap) return;
  if (view !== 'fight') state.fightKey = '';
  RENDER[view]?.(snap);
  hydrateIcons($(`view-${view}`));
}

const rerender = (view: string) => renderView(view);

function setFilter(s: Snapshot, minRarity: string, keepAffixes: number[]) {
  call(s.conn.reducers.setLootFilter({ minRarity: { tag: minRarity as RarityName }, keepAffixes }));
}

/** One delegated click handler for all views. */
export function bindViews() {
  $('content').addEventListener('click', ev => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>(
      '[data-zone],[data-fight],[data-boss],[data-row],[data-loadout],[data-slot],[data-equip],[data-unequip],[data-pick-close],[data-summary-close],[data-select],[data-craft],[data-craft-tab],[data-filter-rarity],[data-theme-pref],[data-number-format],#auto-equip,#use-loadout,#rename-loadout,#bag-salvage,#bag-lock,#bag-craft,#bag-clear,#bag-all,#bag-expand,#craft-go'
    );
    const s = snap;
    if (!el || !s) return;
    const d = el.dataset;
    const r = s.conn.reducers;
    const lo = state.loadout ?? s.row.activeLoadout;
    if (d.zone) {
      state.zoneId = Number(d.zone);
      state.dropsOf = undefined;
      rerender('zones');
    } else if (d.fight) {
      call(r.setTarget({ enemyId: Number(d.fight) }).then(() => void (location.hash = '#fight')));
    } else if (d.boss) {
      const zone = ZONES_BY_ID.get(Number(d.boss))!;
      call(r.challengeBoss({ zoneId: zone.id }), `${bossOf(zone)!.name} defeated! The next zone is open.`);
    } else if (d.row) {
      state.dropsOf = Number(d.row);
      const z = ZONES_BY_ID.get(state.zoneId ?? s.row.zoneId) ?? ZONES[0];
      showDrops(z, z.enemies.find(e => e.id === state.dropsOf) ?? z.enemies[0]);
    } else if (d.loadout) {
      state.loadout = Number(d.loadout);
      state.pickSlot = undefined;
      state.autoSummary = undefined;
      rerender('equipment');
    } else if (d.equip) {
      state.autoSummary = undefined;
      call(r.equip({ loadout: lo, slot: state.pickSlot!, itemId: BigInt(d.equip) }));
    } else if (d.unequip) {
      state.autoSummary = undefined;
      call(r.unequip({ loadout: lo, slot: Number(d.unequip) }));
    } else if (el.dataset.summaryClose !== undefined) {
      state.autoSummary = undefined;
      rerender('equipment');
    } else if (el.dataset.pickClose !== undefined) {
      state.pickSlot = undefined;
      rerender('equipment');
    } else if (d.slot) {
      state.pickSlot = state.pickSlot === Number(d.slot) ? undefined : Number(d.slot);
      rerender('equipment');
    } else if (d.select) {
      const id = BigInt(d.select);
      const sel = state.bagSelected;
      const order = sortedBag(s).map(i => i.id);
      const [from, to] = [order.indexOf(state.bagAnchor ?? -1n), order.indexOf(id)];
      if (ev.shiftKey && from >= 0 && to >= 0) {
        for (const x of order.slice(Math.min(from, to), Math.max(from, to) + 1)) sel.add(x);
      } else if (ev.ctrlKey || ev.metaKey) {
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
        state.bagAnchor = id;
      } else {
        const only = sel.size === 1 && sel.has(id);
        sel.clear();
        if (!only) sel.add(id);
        state.bagAnchor = id;
      }
      rerender('bag');
    } else if (d.craft) {
      ev.preventDefault();
      state.craftItem = BigInt(d.craft);
      state.craftAffix = 0;
      if (location.hash !== '#crafting') location.hash = '#crafting';
      else rerender('crafting');
    } else if (d.craftTab) {
      state.craftTab = d.craftTab as 'reroll' | 'upgrade';
      state.craftAffix = 0;
      rerender('crafting');
    } else if (d.filterRarity) {
      setFilter(s, d.filterRarity, s.filter?.keepAffixes ?? []);
    } else if (d.numberFormat) {
      setNumberFormat(d.numberFormat as NumberFormat);
      rerender('settings');
    } else if (d.themePref) {
      setTheme(d.themePref as ThemePref);
      rerender('settings');
    } else if (el.id === 'auto-equip') {
      const before = [...(s.loadouts.find(l => l.index === lo)?.slots ?? [])];
      state.pickSlot = undefined;
      call(
        r.autoEquip({ loadout: lo }).then(() => {
          state.autoSummary = { loadout: lo, before };
          rerender('equipment');
        })
      );
    }
    else if (el.id === 'use-loadout') call(r.switchLoadout({ loadout: lo }));
    else if (el.id === 'rename-loadout') {
      const name = prompt('Loadout name', s.loadouts[lo]?.name ?? '');
      if (name !== null) call(r.renameLoadout({ loadout: lo, name }));
    } else if (el.id === 'bag-clear') {
      state.bagSelected.clear();
      rerender('bag');
    } else if (el.id === 'bag-all') {
      for (const it of sortedBag(s)) state.bagSelected.add(it.id);
      rerender('bag');
    } else if (el.id === 'bag-lock') {
      const sel = s.bag.filter(i => state.bagSelected.has(i.id));
      const locked = !sel.every(i => i.locked);
      for (const it of sel) call(r.lockItem({ itemId: it.id, locked }));
    } else if (el.id === 'bag-salvage') {
      const ids = [...state.bagSelected];
      call(r.salvage({ itemIds: ids }).then(() => state.bagSelected.clear()));
    } else if (el.id === 'bag-craft') {
      state.craftItem = [...state.bagSelected][0];
      location.hash = '#crafting';
    } else if (el.id === 'bag-expand') call(r.expandBag({}), 'Bag expanded by 25 slots');
    else if (el.id === 'craft-go' && state.craftItem !== undefined) {
      const itemId = state.craftItem;
      if (state.craftTab === 'reroll') call(r.rerollAffix({ itemId, affixIndex: state.craftAffix }));
      else {
        const epic = s.items.get(itemId)?.rarity.tag === 'Epic';
        call(r.upgradeRarity({ itemId, removeAffix: epic ? state.craftAffix : undefined }));
      }
    }
  });

  $('content').addEventListener('change', ev => {
    const el = ev.target as HTMLInputElement;
    const s = snap;
    if (!s) return;
    if (el.name === 'craft-affix') state.craftAffix = Number(el.value);
    else if (el.id === 'float-toggle') {
      try {
        localStorage.setItem('floatNumbers', el.checked ? 'on' : 'off');
      } catch {
        // storage blocked: the setting lasts for this page only
      }
    } else if (el.id === 'profile') {
      call(s.conn.reducers.setProfile({ loadout: state.loadout ?? s.row.activeLoadout, profile: { tag: el.value as 'Damage' | 'Survival' | 'Loot' } }));
    } else if (el.id === 'bag-sort') {
      state.bagSort = el.value as BagSort;
      rerender('bag');
    } else if (el.id === 'bag-kind') {
      state.bagKind = el.value as BaseKind | 'all';
      rerender('bag');
    } else if (el.closest('#affix-checks')) {
      const keep = new Set(s.filter?.keepAffixes ?? []);
      if (el.checked) keep.add(Number(el.value));
      else keep.delete(Number(el.value));
      setFilter(s, s.filter?.minRarity.tag ?? 'Magic', [...keep]);
    }
  });

  // Comparison panel in the slot picker.
  let compared = '';
  $('content').addEventListener('mouseover', ev => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-equip]');
    const s = snap;
    if (!el || !s || state.pickSlot === undefined || el.dataset.equip === compared) return;
    compared = el.dataset.equip!;
    const lo = s.loadouts.find(l => l.index === (state.loadout ?? s.row.activeLoadout)) ?? s.active;
    renderCompare(s, lo, state.pickSlot, BigInt(compared));
  });
  $('content').addEventListener('mouseout', ev => {
    if ((ev.target as HTMLElement).closest('[data-equip]')) compared = '';
  });

  $('content').addEventListener('input', ev => {
    const el = ev.target as HTMLInputElement;
    if (el.id !== 'affix-search') return;
    state.affixSearch = el.value;
    const q = el.value.toLowerCase();
    $('affix-checks')
      .querySelectorAll<HTMLElement>('.check')
      .forEach(c => (c.hidden = !c.textContent!.toLowerCase().includes(q)));
  });
}
