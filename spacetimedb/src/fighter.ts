// One combatant's effects through a fight, shared by every sim: zone and Moonwell Deep
// fights (fight.ts), raids (raid.ts) and duels (src/ui/duelSim.ts). Each sim keeps its own
// loop (who swings at whom, and when); what an effect does to a swing, a hit taken or the
// swing timer is written once, here. The helpers draw from the generator exactly where the
// sims always did, so fights replay as before.

import { effectDamageMult, type CombatStats } from './combat';
import { Effect, LAST_STAND_BELOW, MOONLIGHT_EVERY, STOKE, effectAmount, rallyMult, waxingMult } from './data/legendary';
import type { Rng } from './loot';

export interface FighterStart {
  /** HP at the start (default: max HP, never above it). */
  hp?: number;
  /** Second Wind left, as a share of max HP (default: the worn amount). */
  secondWind?: number;
  /** Renewal left, as a share of max HP (default: the Phial's, `CombatStats.renewal`). */
  renewal?: number;
}

export class Fighter {
  readonly stats: CombatStats;
  readonly maxHp: number;
  hp: number;
  /** Second Skin's shield left: it takes hits before HP. */
  shield: number;
  secondWind: number;
  renewal: number;
  /** Swings so far (Moonlight, Waxing Moon and Fading Rally count them). */
  swings = 0;
  /** Ambush: × the next swing that lands, 1 once spent (the sim spends it). */
  ambush: number;
  /** Dodged the last attack (Afterimage). */
  lastDodged = false;
  /** Parry and Thrust: dodged since the last swing. */
  parried = false;
  /** The last `shrink`: Bulwark blocked half of it. */
  blocked = false;
  /** The last `take`: HP a Phial of Renewal gave back (0 if it didn't trigger). */
  renewed = 0;

  private readonly rally: boolean;
  private readonly parry: boolean;
  private readonly moonlight: boolean;
  private readonly waxing: boolean;
  private readonly stoke: boolean;
  private readonly executioner: number;
  private readonly bully: number;
  private readonly berserk: number;
  private readonly bulwark: number;
  private readonly lastStand: number;
  private readonly afterimage: number;
  private readonly stoneskin: number;
  private readonly riposteShare: number;
  private readonly thornshell: number;
  private readonly zealotShare: number;
  /** × effect damage (Glass Cannon, Voidtouched), as on your hits. */
  private readonly effectMult: number;

  constructor(s: CombatStats, start: FighterStart = {}) {
    const fx = s.effects;
    const amount = (id: number) => effectAmount(fx, id);
    this.stats = s;
    this.maxHp = s.maxHp;
    this.hp = Math.min(s.maxHp, start.hp ?? s.maxHp);
    this.shield = amount(Effect.SecondSkin) * s.maxHp;
    this.secondWind = start.secondWind ?? amount(Effect.SecondWind);
    this.renewal = start.renewal ?? s.renewal ?? 0;
    this.ambush = fx.has(Effect.Ambush) ? 5 : 1;
    this.rally = fx.has(Effect.FadingRally);
    this.parry = fx.has(Effect.ParryAndThrust);
    this.moonlight = fx.has(Effect.Moonlight);
    this.waxing = fx.has(Effect.WaxingMoon);
    this.stoke = fx.has(Effect.StokeTheFire);
    this.executioner = amount(Effect.Executioner);
    this.bully = amount(Effect.Bully);
    this.berserk = 10 * amount(Effect.Berserker);
    this.bulwark = amount(Effect.Bulwark);
    this.lastStand = amount(Effect.LastStand);
    this.afterimage = amount(Effect.Afterimage);
    this.stoneskin = amount(Effect.Stoneskin);
    this.riposteShare = amount(Effect.Riposte);
    this.thornshell = amount(Effect.Thornshell);
    this.zealotShare = amount(Effect.ZealotsOath);
    this.effectMult = effectDamageMult(fx);
  }

  amount(id: number): number {
    return effectAmount(this.stats.effects, id);
  }

  has(id: number): boolean {
    return this.stats.effects.has(id);
  }

  // ------------------------------------------------------------ swing timer

  /** Seconds until the first swing, `period` being the plain wait (Fading Rally: the first swing is faster). */
  firstPeriod(period: number): number {
    return period / (this.rally ? rallyMult(1) : 1);
  }

  /** The wait before the next swing as things stand (Fading Rally: swing k comes at rallyMult(k) × speed). */
  periodNow(period: number): number {
    return period / (this.rally ? rallyMult(this.swings + 1) : 1);
  }

  /** Counts a swing and returns the wait before the next one. */
  nextPeriod(period: number): number {
    this.swings += 1;
    return this.periodNow(period);
  }

  // ------------------------------------------------------------ your swing

  /**
   * Whether this swing crits (call after `nextPeriod`): Parry and Thrust crits only the swing
   * after a dodge, anything else rolls `crit`. A missed swing never crits and rolls nothing.
   */
  rollCrit(crit: number, rng: Rng, missed = false): boolean {
    const isCrit = missed ? false : this.parry ? this.parried : rng() < crit;
    this.parried = false;
    return isCrit;
  }

  /** Moonlight: this swing (call after `nextPeriod`) hits twice. */
  isWave(): boolean {
    return this.moonlight && this.swings % MOONLIGHT_EVERY === 0;
  }

  /**
   * A swing's damage from `base` (the hit with its crit and variance): Executioner and Bully
   * double it below / above their share of the target's HP, Berserker scales it with your
   * missing HP, then Ambush, Moonlight and Waxing Moon. Call after `nextPeriod`.
   */
  swingDamage(base: number, foeHp: number, foeMaxHp: number): number {
    const doubled = foeHp < this.executioner * foeMaxHp || foeHp > (1 - this.bully) * foeMaxHp ? 2 : 1;
    const rage = 1 + (this.berserk * (this.maxHp - this.hp)) / this.maxHp;
    return base * doubled * this.ambush * rage * (this.isWave() ? 2 : 1) * (this.waxing ? waxingMult(this.swings) : 1);
  }

  /** Stoke the Fire: × your hits for `fallen` allies and enemies already down. */
  stokeMult(fallen: number): number {
    return this.stoke ? 1 + STOKE * fallen : 1;
  }

  /** Riposte: what a dodge counters for, from your average hit (`hit`, with `crit` chance at × `critX`). */
  riposte(hit: number, crit: number, critX: number): number {
    return this.riposteShare * hit * (1 + crit * (critX - 1));
  }

  /** Thornshell: what reflects back from `taken` (what reached you), `through` being the share the attacker's mitigation lets through. */
  thorns(taken: number, through: number): number {
    return this.thornshell * taken * this.effectMult * through;
  }

  /** Zealot's Oath: what a heal of `heal` also deals, against the target's magic mitigation `mitM`. */
  zealot(heal: number, mitM: number): number {
    return this.zealotShare * heal * this.effectMult * (1 - mitM);
  }

  // ------------------------------------------------------------ a hit taken

  /**
   * An attack you dodged: Afterimage shrinks the next hit, Parry and Thrust crits your next swing.
   */
  dodge(): void {
    this.lastDodged = true;
    this.parried = true;
  }

  /**
   * An enemy attack after your effects: a Phial of Warding, Stoneskin, Bulwark (rolls, see
   * `blocked`), Last Stand below its HP share, and Afterimage right after a dodge. Before the
   * shield (`absorb`).
   */
  shrink(damage: number, rng: Rng): number {
    damage = Math.max(0, damage * (this.stats.damageTaken ?? 1) - this.stoneskin * this.maxHp);
    this.blocked = this.bulwark > 0 && rng() < this.bulwark;
    if (this.blocked) damage /= 2;
    if (this.hp < LAST_STAND_BELOW * this.maxHp) damage *= 1 - this.lastStand;
    if (this.lastDodged) damage *= 1 - this.afterimage;
    this.lastDodged = false;
    return damage;
  }

  /** What's left of `damage` once Second Skin's shield has taken its share. */
  absorb(damage: number): number {
    const absorbed = Math.min(this.shield, damage);
    this.shield -= absorbed;
    return damage - absorbed;
  }

  /**
   * You take `damage` (after the shield). A Phial of Renewal heals once when it leaves you
   * below half HP (`renewed`); Second Wind turns the first killing blow into a drop to its
   * share of max HP. Returns whether Second Wind saved you.
   */
  take(damage: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.renewed = 0;
    if (this.hp > 0 && this.renewal > 0 && this.hp < this.maxHp / 2) {
      this.renewed = Math.min(this.maxHp - this.hp, this.renewal * this.maxHp);
      this.hp += this.renewed;
      this.renewal = 0;
    }
    if (this.hp > 0 || this.secondWind <= 0) return false;
    this.hp = this.secondWind * this.maxHp;
    this.secondWind = 0;
    return true;
  }

  /**
   * Damage that isn't an enemy attack (a reflect, a counter): the shield takes it first,
   * nothing shrinks it. Returns whether Second Wind saved you.
   */
  takeDirect(damage: number): boolean {
    return this.take(this.absorb(damage));
  }

  /**
   * A new fight against a new enemy (a Deep depth's next one): what lasts one fight starts
   * over. Ambush, Waxing Moon, Fading Rally and Moonlight count from the first swing again,
   * Second Skin's shield is whole, dodges are forgotten. HP, Second Wind and Renewal carry on.
   */
  newFight(): void {
    this.swings = 0;
    this.ambush = this.has(Effect.Ambush) ? 5 : 1;
    this.shield = this.amount(Effect.SecondSkin) * this.maxHp;
    this.lastDodged = false;
    this.parried = false;
  }

  /** Heals `amount`, up to max HP; the fallen stay down. */
  heal(amount: number): void {
    if (this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
