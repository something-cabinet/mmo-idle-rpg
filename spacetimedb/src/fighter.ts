// One combatant's effects through a fight, shared by every sim: zone and Moonwell Deep
// fights (fight.ts), raids (raid.ts) and duels (src/ui/duelSim.ts). Each sim keeps its own
// loop (who swings at whom, and when); what an effect does to a swing, a hit taken or the
// swing timer is written once, here. The helpers draw from the generator exactly where the
// sims always did, so fights replay as before.

//
// The Shifting Rift's boons, rift effects and Trophies (shifting-rift.md) are effects here
// too, read from `CombatStats.effects`; each one draws from the generator only when held, so
// fights without them replay as before.

import { effectDamageMult, evasionCap, type CombatStats } from './combat';
import { EliteAffix } from './data/abyss';
import { Effect, LAST_STAND_BELOW, MOONLIGHT_EVERY, STOKE, effectAmount, rallyMult, waxingMult } from './data/legendary';
import { BOON_NUM, Boon, RIFT_NUM, RiftEffect, SET, TROPHY_NUM, Theme, boonAmount, setBonusId, trophyId } from './data/rift';
import type { Rng } from './loot';

export interface FighterStart {
  /** HP at the start (default: max HP, never above it). */
  hp?: number;
  /** Second Wind left, as a share of max HP (default: the worn amount). */
  secondWind?: number;
  /** Renewal left, as a share of max HP (default: the Phial's, `CombatStats.renewal`). */
  renewal?: number;
  /** Hold the Line not yet spent this floor (default: held). */
  holdTheLine?: boolean;
  /** Phoenix Plume not yet burned (default: worn). */
  phoenix?: boolean;
}

/** What a swing knows besides its damage, for the Rift's per-swing effects (`Fighter.riftSwing`). */
export interface SwingContext {
  /** The target (an actor index): First Blood and the Fury set count hits per enemy. */
  target: number;
  foeHp: number;
  foeMaxHp: number;
  /** Seconds into the fight. */
  at: number;
  crit: boolean;
  /** The plain hit against this target (Static's shock). */
  hit: number;
  /** The target can't be damaged now. */
  immune: boolean;
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
  /** The last `shrink`: it was blocked (Bulwark, the Rift's block chance or Bracing). */
  blocked = false;
  /** The last `take`: HP a Phial of Renewal gave back (0 if it didn't trigger). */
  renewed = 0;
  /** Hold the Line still to come this floor; `heldLine` once it gave its shield. */
  holdTheLine: boolean;
  /** Phoenix Plume not yet burned; `burned` once it caught a killing blow (the run deletes the item). */
  phoenix: boolean;
  burned = false;
  /** The fight may raise a shield (Second Skin, Stubborn, Hold the Line, Blood Price, the Bastion set): the sims show it. */
  readonly mayShield: boolean;
  /** Phantom: an enemy attack must pass the evade check twice. */
  readonly phantom: boolean;
  /** Wither Aura: every foe loses this share of its max HP a second. */
  readonly wither: number;
  /** Bastion 5-set: a shield of `share` max HP every `every` seconds. */
  readonly bastion: boolean;
  /** The Rift effects on a swing are held (`riftSwing`). */
  readonly riftSwings: boolean;

  private readonly rally: boolean;
  private readonly parry: boolean;
  private readonly moonlight: boolean;
  private readonly waxing: boolean;
  private readonly stoke: boolean;
  private readonly executioner: number;
  private readonly bully: number;
  private readonly berserk: number;
  /** Block chance: Bulwark's, plus the Rift's. */
  private readonly blockChance: number;
  /** Share of a blocked hit stopped. */
  private readonly blockShare: number;
  private readonly lastStand: number;
  private readonly afterimage: number;
  private readonly stoneskin: number;
  /** Riposte, plus Counterstep. */
  private readonly riposteShare: number;
  /** Thornshell, plus Mirror Mail and the Thorned Trophy. */
  private readonly thornshell: number;
  private readonly zealotShare: number;
  /** × effect damage (Glass Cannon, Voidtouched, Glass Heart), as on your hits. */
  private readonly effectMult: number;

  // The Rift (0 or false when not held): boons as fractions, Bracing as hits.
  private bracing: number;
  private readonly braced: number;
  private readonly hold: number;
  private readonly smoke: number;
  private readonly evadeCap: number;
  private readonly slip: number;
  private readonly opening: number;
  private readonly mist5: boolean;
  private readonly bash: number;
  private readonly steady: number;
  private readonly aegis5: boolean;
  private readonly tailwind: number;
  private readonly thunder: boolean;
  private readonly bloodPrice: boolean;
  private readonly clotting: number;
  private readonly killHeal: number;
  private readonly salvo: number;
  private readonly coup: number;
  private readonly frenzy: boolean;
  private readonly staticShare: number;
  private readonly firstHit: number;
  private readonly storm5: boolean;
  private readonly echoStrike: boolean;
  private readonly gambler: boolean;
  private readonly overclock: boolean;
  private readonly ravenous: boolean;
  /** The last `shrink` before a block stopped part of it (the Aegis 5-set reflects all of it). */
  private wholeHit = 0;
  /** Opening: an evade since the last swing. */
  private openingReady = false;
  /** Thunderhead's crits so far this fight. */
  private crits = 0;
  /** The Storm 5-set: damage chained to the next swing that lands. */
  private chained = 0;
  /** Enemies hit so far (First Blood, the Fury 5-set). */
  private readonly hitFoes = new Set<number>();

  constructor(s: CombatStats, start: FighterStart = {}) {
    const fx = s.effects;
    const amount = (id: number) => effectAmount(fx, id);
    const boon = (id: number) => boonAmount(fx, id) / 100;
    this.stats = s;
    this.maxHp = s.maxHp;
    this.hp = Math.min(s.maxHp, start.hp ?? s.maxHp);
    // One shield pool: Second Skin and Stubborn start it.
    this.shield = (amount(Effect.SecondSkin) + boon(Boon.Stubborn)) * s.maxHp;
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
    this.blockChance = Math.min(1, amount(Effect.Bulwark) + (s.block ?? 0));
    this.blockShare = s.blockShare ?? 0.5;
    this.lastStand = amount(Effect.LastStand);
    this.afterimage = amount(Effect.Afterimage);
    this.stoneskin = amount(Effect.Stoneskin);
    this.riposteShare = amount(Effect.Riposte) + boon(Boon.Counterstep);
    this.thornshell = amount(Effect.Thornshell) + (fx.has(RiftEffect.MirrorMail) ? RIFT_NUM.mirrorReflect : 0) +
      (fx.has(trophyId(EliteAffix.Thorned)) ? TROPHY_NUM.thornedReflect : 0);
    this.zealotShare = amount(Effect.ZealotsOath);
    this.effectMult = effectDamageMult(fx);

    this.bracing = boonAmount(fx, Boon.Bracing);
    this.braced = boon(Boon.Braced);
    this.hold = boon(Boon.HoldTheLine);
    this.holdTheLine = this.hold > 0 && (start.holdTheLine ?? true);
    this.phoenix = fx.has(RiftEffect.PhoenixPlume) && (start.phoenix ?? true);
    this.phantom = fx.has(Boon.Phantom);
    this.smoke = boon(Boon.Smoke);
    this.evadeCap = evasionCap(s);
    this.slip = boon(Boon.SlipAway);
    this.opening = boon(Boon.Opening);
    this.mist5 = fx.has(setBonusId(Theme.Mist, 5));
    this.bash = boon(Boon.ShieldBash);
    this.steady = boon(Boon.SteadyGuard);
    this.aegis5 = fx.has(setBonusId(Theme.Aegis, 5));
    this.tailwind = boon(Boon.Tailwind);
    this.thunder = fx.has(Boon.Thunderhead);
    this.bloodPrice = fx.has(Boon.BloodPrice);
    this.clotting = boon(Boon.Clotting);
    this.killHeal = boon(Boon.Transfusion) + (fx.has(setBonusId(Theme.Blood, 5)) ? SET.blood5 : 0);
    this.bastion = fx.has(setBonusId(Theme.Bastion, 5));
    this.wither = fx.has(RiftEffect.WitherAura) ? RIFT_NUM.wither : 0;
    this.salvo = boon(Boon.OpeningSalvo);
    this.coup = boon(Boon.CoupDeGrace);
    this.frenzy = fx.has(Boon.Frenzy);
    this.staticShare = boon(Boon.Static);
    this.firstHit = (fx.has(setBonusId(Theme.Fury, 5)) ? SET.fury5 : 1) * (fx.has(RiftEffect.FirstBlood) ? RIFT_NUM.firstBlood : 1);
    this.storm5 = fx.has(setBonusId(Theme.Storm, 5));
    this.echoStrike = fx.has(RiftEffect.EchoStrike);
    this.gambler = fx.has(RiftEffect.GamblersEdge);
    this.overclock = fx.has(RiftEffect.Overclock);
    this.ravenous = fx.has(trophyId(EliteAffix.Ravenous));
    this.riftSwings = this.opening > 0 || this.salvo > 0 || this.coup > 0 || this.frenzy || this.staticShare > 0 || this.firstHit > 1 ||
      this.storm5 || this.echoStrike || this.gambler || this.overclock || this.ravenous || this.thunder;
    this.mayShield = this.shield > 0 || this.holdTheLine || this.bloodPrice || this.bastion;
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
    return this.riftPeriod(period / (this.rally ? rallyMult(1) : 1), 1);
  }

  /** The wait before the next swing as things stand (Fading Rally: swing k comes at rallyMult(k) × speed). */
  periodNow(period: number): number {
    return this.riftPeriod(period / (this.rally ? rallyMult(this.swings + 1) : 1), this.swings + 1);
  }

  /** Tailwind speeds up the first swings of a fight, Thunderhead every swing after a crit. */
  private riftPeriod(period: number, swing: number): number {
    if (this.tailwind > 0 && swing <= BOON_NUM.tailwindAttacks) period /= 1 + this.tailwind;
    if (this.thunder) period /= 1 + Math.min(BOON_NUM.thunderMax, BOON_NUM.thunderStep * this.crits);
    return period;
  }

  /** Counts a swing and returns the wait before the next one. */
  nextPeriod(period: number): number {
    this.swings += 1;
    return this.periodNow(period);
  }

  // ------------------------------------------------------------ your swing

  /**
   * Whether this swing crits (call after `nextPeriod`): Parry and Thrust crits only the swing
   * after a dodge, anything else rolls `crit` (the Mist 5-set: a swing after a dodge always
   * crits, rolling nothing). A missed swing never crits and rolls nothing.
   */
  rollCrit(crit: number, rng: Rng, missed = false): boolean {
    const isCrit = missed ? false : this.parry ? this.parried : (this.mist5 && this.parried) || rng() < crit;
    this.parried = false;
    return isCrit;
  }

  /** × a crit's damage multiplier `critX`: a Glimmerguard wearer's parried crits get the Mist 5-set's +50% crit damage. */
  critBoost(critX: number): number {
    return this.mist5 && this.parry ? critX * (1 + SET.mist5Glimmer / Math.max(1, this.stats.critDamage)) : critX;
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

  /**
   * The Rift's effects on a swing (`riftSwings`; call after `swingDamage`), from `damage` (0
   * for a miss): on a hit, First Blood and the Fury 5-set on the first hit on each enemy,
   * Opening after an evade, Coup de Grâce, Frenzy, the Ravenous Trophy, Opening Salvo,
   * Gambler's Edge (draws), Echo Strike and the Storm 5-set's chained damage; then, hit or
   * miss, Static's shock, Thunderhead's stack and Overclock's HP cost (it never kills).
   */
  riftSwing(damage: number, c: SwingContext, rng: Rng): number {
    let d = damage;
    if (d > 0) {
      if (!this.hitFoes.has(c.target)) {
        this.hitFoes.add(c.target);
        d *= this.firstHit;
      }
      if (this.openingReady) d *= 1 + this.opening;
      if (c.foeHp < BOON_NUM.coupBelow * c.foeMaxHp) d *= 1 + this.coup;
      if (this.frenzy) d *= 2 - this.hp / this.maxHp;
      if (this.ravenous) d *= 1 + TROPHY_NUM.ravenous.step * Math.floor(c.at / TROPHY_NUM.ravenous.every);
      if (c.at < BOON_NUM.openingSeconds) d *= 1 + this.salvo;
      if (this.gambler) d *= RIFT_NUM.gamblerMax * rng();
      if (this.echoStrike && this.swings % RIFT_NUM.echoEvery === 0) d *= 2;
      const chained = this.chained;
      this.chained = this.storm5 && c.crit ? SET.storm5 * d : 0;
      d += chained;
    }
    this.openingReady = false;
    if (this.staticShare > 0 && this.swings % BOON_NUM.staticEvery === 0 && !c.immune) d += this.staticShare * c.hit;
    if (this.thunder && c.crit) this.crits += 1;
    const cost = RIFT_NUM.overclockCost * this.maxHp;
    if (this.overclock && this.hp > cost) this.hp -= cost;
    return d;
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

  /** Your chance to evade an attack, `base` being your evasion against it, `at` seconds into the fight: Smoke adds to it early, up to the cap. */
  evade(base: number, at: number): number {
    return this.smoke > 0 && at < BOON_NUM.openingSeconds ? Math.min(this.evadeCap, base + this.smoke) : base;
  }

  /**
   * An attack you dodged: Afterimage shrinks the next hit, Parry and Thrust (and the Mist
   * 5-set) crits your next swing, Opening strengthens it. Returns what Slip Away heals.
   */
  dodge(): number {
    this.lastDodged = true;
    this.parried = true;
    this.openingReady = this.opening > 0;
    return this.slip * this.maxHp;
  }

  /**
   * An enemy attack after your effects: a Phial of Warding (and the Rift's damage taken),
   * Stoneskin, Braced against an Elite or a boss (`tough`), a block (Bracing's first hits, else
   * a roll, see `blocked`), Last Stand below its HP share, and Afterimage right after a dodge.
   * Before the shield (`absorb`).
   */
  shrink(damage: number, rng: Rng, tough = false): number {
    damage = Math.max(0, damage * (this.stats.damageTaken ?? 1) - this.stoneskin * this.maxHp);
    if (tough) damage *= 1 - this.braced;
    this.wholeHit = damage;
    if (this.bracing > 0) {
      this.bracing -= 1;
      this.blocked = true;
    } else this.blocked = this.blockChance > 0 && rng() < this.blockChance;
    if (this.blocked) damage *= 1 - this.blockShare;
    if (this.hp < LAST_STAND_BELOW * this.maxHp) damage *= 1 - this.lastStand;
    if (this.lastDodged) damage *= 1 - this.afterimage;
    this.lastDodged = false;
    return damage;
  }

  /**
   * What the last `shrink`, if blocked, sends back at the attacker: Shield Bash (a share of
   * your average hit `avgHit`) and the Aegis 5-set (half the whole hit, through the attacker's
   * mitigation `through`, like Thornshell). Also returns Steady Guard's heal.
   */
  onBlock(avgHit: number, through: number): { back: number; heal: number } {
    if (!this.blocked) return { back: 0, heal: 0 };
    const aegis = this.aegis5 ? SET.aegis5 * this.wholeHit * this.effectMult * through : 0;
    return { back: this.bash * avgHit + aegis, heal: this.steady * this.maxHp };
  }

  /** What's left of `damage` once Second Skin's shield has taken its share. */
  absorb(damage: number): number {
    const absorbed = Math.min(this.shield, damage);
    this.shield -= absorbed;
    return damage - absorbed;
  }

  /**
   * You take `damage` (after the shield). A Phial of Renewal heals once when it leaves you
   * below half HP (`renewed`); Hold the Line shields once when it leaves you below 30%;
   * Second Wind turns the first killing blow into a drop to its share of max HP, and Phoenix
   * Plume the next one (`burned`). Returns whether Second Wind or the Plume saved you.
   */
  take(damage: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.renewed = 0;
    if (this.hp > 0 && this.renewal > 0 && this.hp < this.maxHp / 2) {
      this.renewed = Math.min(this.maxHp - this.hp, this.renewal * this.maxHp);
      this.hp += this.renewed;
      this.renewal = 0;
    }
    if (this.holdTheLine && this.hp > 0 && this.hp < BOON_NUM.holdBelow * this.maxHp) {
      this.shield += this.hold * this.maxHp;
      this.holdTheLine = false;
    }
    if (this.hp > 0) return false;
    if (this.secondWind > 0) {
      this.hp = this.secondWind * this.maxHp;
      this.secondWind = 0;
      return true;
    }
    if (!this.phoenix) return false;
    this.hp = RIFT_NUM.phoenixHp * this.maxHp;
    this.phoenix = false;
    this.burned = true;
    return true;
  }

  /**
   * Damage that isn't an enemy attack (a reflect, a counter): the shield takes it first,
   * nothing shrinks it. Returns whether Second Wind saved you.
   */
  takeDirect(damage: number): boolean {
    return this.take(this.absorb(damage));
  }

  /** Heals `amount`, up to max HP; the fallen stay down. */
  heal(amount: number): void {
    if (this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Lifesteal of `amount` (the sim heals it first): Blood Price turns what overflows full HP into shield, up to its cap. */
  overflow(amount: number, hpBefore: number): void {
    const over = amount - (this.maxHp - hpBefore);
    const cap = BOON_NUM.bloodPriceCap * this.maxHp;
    if (this.bloodPrice && this.hp > 0 && over > 0 && this.shield < cap) this.shield = Math.min(cap, this.shield + over);
  }

  /** HP regen per tick as things stand: Clotting raises it below half HP. */
  regenNow(): number {
    return this.clotting > 0 && this.hp < BOON_NUM.clottingBelow * this.maxHp ? this.stats.regen * (1 + this.clotting) : this.stats.regen;
  }

  /** What a kill heals (Transfusion, the Blood 5-set), HP. */
  killHealing(): number {
    return this.killHeal * this.maxHp;
  }

  /** The Bastion 5-set's shield, every 10 s of the fight (`at`, a whole second): adds to the pool. Returns whether it did. */
  bastionTick(at: number): boolean {
    if (!this.bastion || this.hp <= 0 || at <= 0 || at % SET.bastion5.every !== 0) return false;
    this.shield += SET.bastion5.share * this.maxHp;
    return true;
  }
}
