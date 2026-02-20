export const CORE_STATS = [
  { id: 'primary_ability', label: 'Main Attribute', unit: 'flat', default: 0 },
  { id: 'secondary_ability', label: 'Sec. Attribute', unit: 'percent', default: 0 },

  { id: 'strength', label: 'Strength', unit: 'flat', default: 0 },
  { id: 'agility', label: 'Agility', unit: 'flat', default: 0 },
  { id: 'intellect', label: 'Intellect', unit: 'flat', default: 0 },
  { id: 'will', label: 'Will', unit: 'flat', default: 0 },

  { id: 'attack', label: 'Attack', unit: 'percent', default: 0 },
  { id: 'hp', label: 'HP', unit: 'percent', default: 0 },
  { id: 'crit_rate', label: 'Critical Rate', unit: 'percent', default: 0 },

  { id: 'blaze_dmg', label: 'Fire DMG', unit: 'percent', default: 0 },
  { id: 'emag_dmg', label: 'Electro DMG', unit: 'percent', default: 0 },
  { id: 'cold_dmg', label: 'Cryo DMG', unit: 'percent', default: 0 },
  { id: 'nature_dmg', label: 'Nature DMG', unit: 'percent', default: 0 },

  { id: 'healing_effect', label: 'Healing', unit: 'percent', default: 0 },
  { id: 'physical_dmg', label: 'Physical DMG', unit: 'percent', default: 0 },
  { id: 'arts_dmg', label: 'Arts DMG', unit: 'percent', default: 0 },

  { id: 'originium_arts_power', label: 'Originium Arts power', unit: 'flat', default: 0 },
  { id: 'ult_charge_eff', label: 'Ultimate Gain Eff.', unit: 'percent', default: 100 },
  { id: 'link_cd_reduction', label: 'Combo CD reduction', unit: 'percent', default: 0 },
]

export function createDefaultStats() {
  const stats = {}
  for (const stat of CORE_STATS) {
    stats[stat.id] = stat.default
  }
  return stats
}
