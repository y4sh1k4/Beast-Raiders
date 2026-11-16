# Loot Survivor combat rules (for flavour and balancing)

Summarised from docs.provable.games/lootsurvivor/combat and /beasts. Use these so a game
built on Beasts "feels" like Loot Survivor.

## Type triangle

| Beast type | Weapon | Armor | Beats |
|---|---|---|---|
| Brute | Bludgeon | Metal | Hunter |
| Hunter | Blade | Hide | Magic |
| Magic | Magic | Cloth | Brute |

Advantage: +50% damage. Disadvantage: −50%.

## Formulas

- Beast power = `Level × (6 − Tier)` (also the `Power` metadata trait).
- Base attack = item level × (6 − tier); elemental effect = base / 2 (added if strong,
  subtracted if weak).
- Strength bonus = adjusted × STR / 10. Critical = +100% of adjusted, chance = LUCK %.
- Name match bonus (prefix/suffix match with the item): prefix-2 match 2×, prefix-1 match 8×,
  both 16×.
- Final damage = max(minimum, total attack − armor); minimum 4 vs adventurers, 2 vs beasts.
- Gold reward for defeating a beast = (tier multiplier × level) / 2; tier multipliers
  T1 5×, T2 4×, T3 3×, T4 2×, T5 1×.

## Tiers

T1 Legendary · T2 Rare · T3 Uncommon · T4 Common · T5 Very Common. Species ids are laid out
in blocks of 25 per type (1–25 Magic, 26–50 Hunter, 51–75 Brute), 5 per tier inside each block.
