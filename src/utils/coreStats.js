export const CORE_STATS = [
  { id: 'primary_ability', label: 'Primary Ability', unit: 'flat', default: 0 },
  { id: 'secondary_ability', label: 'Secondary Ability', unit: 'percent', default: 0 },
  { id: 'strength', label: 'Strength', unit: 'flat', default: 0 },
  { id: 'agility', label: 'Agility', unit: 'flat', default: 0 },
  { id: 'intellect', label: 'Intellect', unit: 'flat', default: 0 },
  { id: 'will', label: 'Will', unit: 'flat', default: 0 },
  { id: 'attack', label: 'Attack', unit: 'percent', default: 0 },
  { id: 'hp', label: 'HP', unit: 'percent', default: 0 },
  { id: 'crit_rate', label: 'Crit Rate', unit: 'percent', default: 0 },
  { id: 'blaze_dmg', label: 'Blaze Damage', unit: 'percent', default: 0 },
  { id: 'emag_dmg', label: 'EMag Damage', unit: 'percent', default: 0 },
  { id: 'cold_dmg', label: 'Cold Damage', unit: 'percent', default: 0 },
  { id: 'nature_dmg', label: 'Nature Damage', unit: 'percent', default: 0 },
  { id: 'healing_effect', label: 'Healing Effect', unit: 'percent', default: 0 },
  { id: 'physical_dmg', label: 'Physical Damage', unit: 'percent', default: 0 },
  { id: 'arts_dmg', label: 'Arts Damage', unit: 'percent', default: 0 },
  { id: 'originium_arts_power', label: 'Originium Arts Power', unit: 'flat', default: 0 },
  { id: 'ult_charge_eff', label: 'Ult Charge Efficiency', unit: 'percent', default: 100 },
  { id: 'link_cd_reduction', label: 'Link CD Reduction', unit: 'percent', default: 0 },
]

export function createDefaultStats() {
  const stats = {}
  for (const stat of CORE_STATS) {
    stats[stat.id] = stat.default
  }
  return stats
}