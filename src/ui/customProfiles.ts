// Settings › Auto-equip profiles: the weights of the custom profiles, kept in this browser.

import { CUSTOM_OUTCOMES, CUSTOM_WEIGHT_COUNT, DEFAULT_CUSTOM_WEIGHTS, validCustomWeights, type CustomProfile } from '../../spacetimedb/src/equip';

const key = (p: CustomProfile) => `customProfile:${p}`;

/** The profile's weights (outcomes, then gear stats); the defaults if none are saved. */
export function getCustomWeights(p: CustomProfile): number[] {
  try {
    let saved: unknown = JSON.parse(localStorage.getItem(key(p)) ?? 'null');
    // Saved before gear stats existed: outcomes only.
    if (Array.isArray(saved) && saved.length === CUSTOM_OUTCOMES.length)
      saved = [...saved, ...Array<number>(CUSTOM_WEIGHT_COUNT - saved.length).fill(0)];
    if (Array.isArray(saved) && saved.every(x => typeof x === 'number') && validCustomWeights(saved)) return saved;
  } catch {
    // unreadable or blocked: fall back to the defaults
  }
  return [...DEFAULT_CUSTOM_WEIGHTS];
}

export function setCustomWeights(p: CustomProfile, weights: readonly number[]) {
  try {
    localStorage.setItem(key(p), JSON.stringify(weights));
  } catch {
    // storage blocked: the weights last for this page only
  }
}
