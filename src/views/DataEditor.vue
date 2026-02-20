<script setup>
import { ref, computed, watch } from 'vue'
import { useTimelineStore } from '../stores/timelineStore.js'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import { executeSave } from '@/api/saveStrategy.js'
import { CORE_STATS } from '@/utils/coreStats.js'
import { buildEffectBindingOptions } from '@/utils/effectBindingOptions.js'
import draggable from 'vuedraggable'

const store = useTimelineStore()
const { characterRoster, iconDatabase, enemyDatabase, enemyCategories, weaponDatabase, equipmentDatabase, equipmentCategories, equipmentCategoryConfigs, misc } = storeToRefs(store)

// === Константы ===

const ELEMENTS = [
  { label: 'Огонь', value: 'blaze' },
  { label: 'Холод', value: 'cold' },
  { label: 'Электромагнитный', value: 'emag' },
  { label: 'Природа', value: 'nature' },
  { label: 'Физический', value: 'physical' }
]

const VARIANT_TYPES = [
  { label: 'Атака', value: 'attack' },
  { label: 'Навык', value: 'skill' },
  { label: 'Связка', value: 'link' },
  { label: 'Ультимейт', value: 'ultimate' },
  { label: 'Казнь', value: 'execution' }
]

const EFFECT_NAMES = {
  "break": "Прорыв защиты",
  "armor_break": "Разрушение брони",
  "stagger": "Оглушение",
  "knockdown": "Опрокидывание",
  "knockup": "Подбрасывание",
  "blaze_attach": "Наложение огня",
  "emag_attach": "Наложение электромагнетизма",
  "cold_attach": "Наложение холода",
  "nature_attach": "Наложение природы",
  "blaze_burst": "Взрыв огня",
  "emag_burst": "Взрыв электромагнетизма",
  "cold_burst": "Взрыв холода",
  "nature_burst": "Взрыв природы",
  "burning": "Горение",
  "conductive": "Проводимость",
  "frozen": "Заморозка",
  "ice_shatter": "Дробление льда",
  "corrosion": "Коррозия",
  "default": "Иконка по умолчанию"
}

const WEAPON_TYPES = [
  { label: 'Одноручный меч', value: 'sword' },
  { label: 'Двуручный меч', value: 'claym' },
  { label: 'Древковое оружие', value: 'lance' },
  { label: 'Пистолет', value: 'pistol' },
  { label: 'Модуль управления', value: 'funnel' }
]

const EQUIPMENT_SLOTS = [
  { label: 'Броня', value: 'armor' },
  { label: 'Перчатки', value: 'gloves' },
  { label: 'Аксессуар', value: 'accessory' }
]

const EQUIPMENT_LEVELS = [70, 50, 36, 20, 10]
const EQUIPMENT_LEVEL_COLORS = {
  70: '#ffd700',
  50: '#b37feb',
  36: '#4a90e2',
  20: '#95de64',
  10: '#888888'
}

function getEquipmentLevelColor(level) {
  const key = Number(level)
  return EQUIPMENT_LEVEL_COLORS[key] || '#555'
}

const ENEMY_TIERS = store.ENEMY_TIERS
const TIER_WEIGHTS = { 'boss': 4, 'champion': 3, 'elite': 2, 'normal': 1 }
const HIDDEN_CHECKBOX_KEYS = ['default']
const effectKeys = Object.keys(EFFECT_NAMES).filter(key => !HIDDEN_CHECKBOX_KEYS.includes(key))

// === Состояния и вычисляемые свойства ===

const editingMode = ref('character') // 'character' | 'enemy' | 'weapon' | 'equipment' | 'misc'
const searchQuery = ref('')
const selectedCharId = ref(null)
const selectedEnemyId = ref(null)
const selectedWeaponId = ref(null)
const selectedEquipmentId = ref(null)
const miscSection = ref('stats') // 'stats' | 'weapon_table' | 'equipment_table' | 'equipment_categories' | 'enemy_categories'
const newEquipmentCategoryName = ref('')
const newEnemyCategoryName = ref('')
const activeTab = ref('basic')
const attackSegmentIndex = ref(0)
const variantAttackSegmentIndexList = ref([])

const ATTACK_SEGMENT_COUNT = 5

function ensureAttackSegments(char) {
  if (!char) return

  const isValidSeg = (seg) => {
    if (!seg || typeof seg !== 'object') return false
    if (seg.duration === undefined) return false
    if (seg.gaugeGain === undefined) return false
    if (seg.allowed_types === undefined) return false
    if (seg.anomalies === undefined) return false
    if (seg.damage_ticks === undefined) return false
    return true
  }

  const legacy = {
    duration: Number(char.attack_duration) || 0,
    gaugeGain: Number(char.attack_gaugeGain) || 0,
    allowed_types: Array.isArray(char.attack_allowed_types) ? [...char.attack_allowed_types] : [],
    anomalies: char.attack_anomalies ? JSON.parse(JSON.stringify(char.attack_anomalies)) : [],
    damage_ticks: char.attack_damage_ticks ? JSON.parse(JSON.stringify(char.attack_damage_ticks)) : []
  }

  const migrateFromLegacy = () => {
    const base = {
      duration: legacy.duration,
      gaugeGain: legacy.gaugeGain,
      allowed_types: [...legacy.allowed_types],
      anomalies: JSON.parse(JSON.stringify(legacy.anomalies)),
      damage_ticks: JSON.parse(JSON.stringify(legacy.damage_ticks)),
    }
    char.attack_segments = Array.from({ length: ATTACK_SEGMENT_COUNT }, (_, idx) => {
      if (idx === 0) return base
      return { ...JSON.parse(JSON.stringify(base)), duration: 0 }
    })
  }

  if (!Array.isArray(char.attack_segments)) {
    migrateFromLegacy()
    return
  }

  if (char.attack_segments.length !== ATTACK_SEGMENT_COUNT) {
    char.attack_segments = char.attack_segments.slice(0, ATTACK_SEGMENT_COUNT)
    while (char.attack_segments.length < ATTACK_SEGMENT_COUNT) {
      char.attack_segments.push({ duration: 0, gaugeGain: 0, allowed_types: [], anomalies: [], damage_ticks: [] })
    }
  }

  if (char.attack_segments.some(s => !isValidSeg(s))) {
    migrateFromLegacy()
    return
  }

  for (const seg of char.attack_segments) {
    seg.duration = Number(seg.duration) || 0
    seg.gaugeGain = Number(seg.gaugeGain) || 0
    if (!Array.isArray(seg.allowed_types)) seg.allowed_types = []
    if (!Array.isArray(seg.anomalies)) seg.anomalies = []
    if (!Array.isArray(seg.damage_ticks)) seg.damage_ticks = []
    if (seg.element !== undefined && typeof seg.element !== 'string') delete seg.element
    if (seg.icon !== undefined && typeof seg.icon !== 'string') delete seg.icon
  }
}

function syncVariantAttackSegmentIndexList() {
  const len = selectedChar.value?.variants?.length || 0
  const prev = Array.isArray(variantAttackSegmentIndexList.value) ? variantAttackSegmentIndexList.value : []
  const next = prev.slice(0, len).map(v => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.min(Math.max(Math.floor(n), 0), ATTACK_SEGMENT_COUNT - 1)
  })
  while (next.length < len) next.push(0)
  variantAttackSegmentIndexList.value = next
}

function deepClone(val) {
  return val ? JSON.parse(JSON.stringify(val)) : val
}

function createVariantAttackSegment(seed = {}, fallbackSeg = null) {
  const raw = (seed && typeof seed === 'object') ? seed : {}
  const fb = (fallbackSeg && typeof fallbackSeg === 'object') ? fallbackSeg : {}

  const allowedTypesRaw = raw.allowedTypes ?? fb.allowedTypes
  const physicalAnomalyRaw = raw.physicalAnomaly ?? fb.physicalAnomaly
  const damageTicksRaw = raw.damageTicks ?? fb.damageTicks

  const out = {
    duration: Number(raw.duration ?? fb.duration) || 0,
    gaugeGain: Number(raw.gaugeGain ?? fb.gaugeGain) || 0,
    allowedTypes: Array.isArray(allowedTypesRaw) ? [...allowedTypesRaw] : [],
    physicalAnomaly: deepClone(physicalAnomalyRaw) || [],
    damageTicks: deepClone(damageTicksRaw) || [],
  }

  const element = raw.element ?? fb.element
  if (element !== undefined) out.element = element
  const icon = raw.icon ?? fb.icon
  if (icon !== undefined) out.icon = icon

  normalizeDamageTicks(out.damageTicks)
  ensureEffectIds(out.physicalAnomaly)

  return out
}

function sanitizeVariantAttackSegmentInPlace(seg) {
  if (!seg || typeof seg !== 'object') return false
  seg.duration = Number(seg.duration) || 0
  seg.gaugeGain = Number(seg.gaugeGain) || 0
  if (!Array.isArray(seg.allowedTypes)) seg.allowedTypes = []
  if (!Array.isArray(seg.physicalAnomaly)) seg.physicalAnomaly = []
  if (!Array.isArray(seg.damageTicks)) seg.damageTicks = []
  if (seg.element !== undefined && typeof seg.element !== 'string') delete seg.element
  if (seg.icon !== undefined && typeof seg.icon !== 'string') delete seg.icon
  return true
}

function buildVariantAttackSegmentsFromBase(char) {
  if (!char) {
    return Array.from({ length: ATTACK_SEGMENT_COUNT }, () => createVariantAttackSegment({ duration: 0 }))
  }

  ensureAttackSegments(char)

  const baseList = Array.isArray(char.attack_segments) ? char.attack_segments : []
  const mapped = baseList.slice(0, ATTACK_SEGMENT_COUNT).map((seg) => createVariantAttackSegment({
    duration: Number(seg?.duration) || 0,
    gaugeGain: Number(seg?.gaugeGain) || 0,
    allowedTypes: Array.isArray(seg?.allowed_types) ? [...seg.allowed_types] : [],
    physicalAnomaly: deepClone(seg?.anomalies) || [],
    damageTicks: deepClone(seg?.damage_ticks) || [],
    element: seg?.element,
    icon: seg?.icon
  }))

  const fallback = mapped[0] || null
  while (mapped.length < ATTACK_SEGMENT_COUNT) mapped.push(createVariantAttackSegment({ duration: 0 }, fallback))
  return mapped
}

function ensureVariantAttackSegments(variant, char, { force = false } = {}) {
  if (!variant || variant.type !== 'attack') return

  if (force || !Array.isArray(variant.attackSegments)) {
    variant.attackSegments = buildVariantAttackSegmentsFromBase(char)
    return
  }

  if (variant.attackSegments.length > ATTACK_SEGMENT_COUNT) {
    variant.attackSegments.length = ATTACK_SEGMENT_COUNT
  }

  const fallback = variant.attackSegments[0] || null
  while (variant.attackSegments.length < ATTACK_SEGMENT_COUNT) {
    variant.attackSegments.push(createVariantAttackSegment({ duration: 0 }, fallback))
  }

  for (let i = 0; i < variant.attackSegments.length; i++) {
    const ok = sanitizeVariantAttackSegmentInPlace(variant.attackSegments[i])
    if (!ok) {
      variant.attackSegments[i] = createVariantAttackSegment({ duration: 0 }, fallback)
    }
  }
}

function getVariantAttackTotalDuration(variant) {
  if (!variant || variant.type !== 'attack') return 0
  ensureVariantAttackSegments(variant, selectedChar.value)
  const segs = Array.isArray(variant.attackSegments) ? variant.attackSegments : []
  const total = segs.reduce((acc, s) => acc + (Number(s?.duration) || 0), 0)
  return Math.round(total * 1000) / 1000
}

function getVariantAttackSegIndex(variantIdx) {
  const raw = variantAttackSegmentIndexList.value?.[variantIdx]
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(Math.floor(n), 0), ATTACK_SEGMENT_COUNT - 1)
}

function getVariantAllowedTypesRef(variant, variantIdx) {
  if (!variant) return []
  if (variant.type === 'attack') {
    ensureVariantAttackSegments(variant, selectedChar.value)
    const idx = getVariantAttackSegIndex(variantIdx)
    const seg = variant.attackSegments?.[idx]
    if (!seg.allowedTypes) seg.allowedTypes = []
    return seg.allowedTypes
  }
  if (!variant.allowedTypes) variant.allowedTypes = []
  return variant.allowedTypes
}

function getVariantPhysicalAnomalyRef(variant, variantIdx) {
  if (!variant) return []
  if (variant.type === 'attack') {
    ensureVariantAttackSegments(variant, selectedChar.value)
    const idx = getVariantAttackSegIndex(variantIdx)
    const seg = variant.attackSegments?.[idx]
    if (!seg.physicalAnomaly) seg.physicalAnomaly = []
    ensureEffectIds(seg.physicalAnomaly)
    return seg.physicalAnomaly
  }
  if (!variant.physicalAnomaly) variant.physicalAnomaly = []
  ensureEffectIds(variant.physicalAnomaly)
  return variant.physicalAnomaly
}

function getVariantDamageTicksRef(variant, variantIdx) {
  if (!variant) return []
  if (variant.type === 'attack') {
    ensureVariantAttackSegments(variant, selectedChar.value)
    const idx = getVariantAttackSegIndex(variantIdx)
    const seg = variant.attackSegments?.[idx]
    if (!seg.damageTicks) seg.damageTicks = []
    normalizeDamageTicks(seg.damageTicks)
    return seg.damageTicks
  }
  if (!variant.damageTicks) variant.damageTicks = []
  normalizeDamageTicks(variant.damageTicks)
  return variant.damageTicks
}


const filteredRoster = computed(() => {
  let list = characterRoster.value || []
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
  }
  return [...list].sort((a, b) => (b.rarity || 0) - (a.rarity || 0))
})

const groupedEnemies = computed(() => {
  let list = enemyDatabase.value || []

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(e => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
  }

  const groups = {}

  enemyCategories.value.forEach(cat => {
    groups[cat] = []
  })
  groups['Несортированные'] = []

  list.forEach(enemy => {
    const cat = enemy.category
    if (cat && groups[cat]) {
      groups[cat].push(enemy)
    } else {
      groups['Несортированные'].push(enemy)
    }
  })

  const result = []

  enemyCategories.value.forEach(cat => {
    if (groups[cat].length > 0) {
      groups[cat].sort((a, b) => (TIER_WEIGHTS[b.tier] || 0) - (TIER_WEIGHTS[a.tier] || 0))
      result.push({ name: cat, list: groups[cat] })
    }
  })

  if (groups['Несортированные'].length > 0) {
    groups['Несортированные'].sort((a, b) => (TIER_WEIGHTS[b.tier] || 0) - (TIER_WEIGHTS[a.tier] || 0))
    result.push({ name: 'Несортированные', list: groups['Несортированные'] })
  }

  return result
})

const filteredWeapons = computed(() => {
  let list = weaponDatabase.value || []
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(w => (w.name || '').toLowerCase().includes(q) || (w.id || '').toLowerCase().includes(q))
  }
  const order = { sword: 1, claym: 2, lance: 3, pistol: 4, funnel: 5 }

  return [...list].sort((a, b) => {
    const rarityDiff = (b.rarity || 0) - (a.rarity || 0)
    if (rarityDiff !== 0) return rarityDiff
    return (order[a.type] || 99) - (order[b.type] || 99)
  })
})

const groupedWeapons = computed(() => {
  const groups = WEAPON_TYPES.map(t => ({ name: t.label.split(' ')[0], key: t.value, list: [] }))
  filteredWeapons.value.forEach(w => {
    const grp = groups.find(g => g.key === w.type) || groups[groups.length - 1]
    grp.list.push(w)
  })
  return groups.filter(g => g.list.length > 0)
})

const filteredEquipment = computed(() => {
  let list = equipmentDatabase.value || []
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(e => (e.name || '').toLowerCase().includes(q) || (e.id || '').toLowerCase().includes(q))
  }
  return list
})

const groupedEquipment = computed(() => {
  const groups = {}
  ;(equipmentCategories.value || []).forEach(cat => { groups[cat] = [] })
  groups['Несортированные'] = []

  filteredEquipment.value.forEach(eq => {
    const cat = eq.category
    if (cat && groups[cat]) groups[cat].push(eq)
    else groups['Несортированные'].push(eq)
  })

  const result = []
  ;(equipmentCategories.value || []).forEach(cat => {
    if (groups[cat].length > 0) result.push({ name: cat, list: groups[cat] })
  })
  if (groups['Несортированные'].length > 0) result.push({ name: 'Несортированные', list: groups['Несортированные'] })

  return result
})

const selectedChar = computed(() => {
  return characterRoster.value.find(c => c.id === selectedCharId.value)
})

const currentAttackSegment = computed(() => {
  const char = selectedChar.value
  if (!char) return null
  if (!Array.isArray(char.attack_segments) || char.attack_segments.length === 0) return null
  const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
  return char.attack_segments[idx] || null
})

const attackTotalDuration = computed(() => {
  const char = selectedChar.value
  if (!char) return 0
  const list = Array.isArray(char.attack_segments) ? char.attack_segments : null
  if (!list) return Number(char.attack_duration) || 0
  const total = list.reduce((acc, seg) => acc + (Number(seg?.duration) || 0), 0)
  return Math.round(total * 1000) / 1000
})

function applyAttackSegmentToAll({ includeDuration = false } = {}) {
  const char = selectedChar.value
  if (!char) return
  ensureAttackSegments(char)

  const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
  const source = char.attack_segments[idx]
  if (!source) return

  const deepClone = (val) => (val ? JSON.parse(JSON.stringify(val)) : val)

  for (let i = 0; i < ATTACK_SEGMENT_COUNT; i++) {
    if (i === idx) continue
    const target = char.attack_segments[i]
    if (!target) continue

    if (includeDuration) {
      target.duration = Number(source.duration) || 0
    }

    target.gaugeGain = Number(source.gaugeGain) || 0
    target.allowed_types = Array.isArray(source.allowed_types) ? [...source.allowed_types] : []
    target.anomalies = deepClone(source.anomalies) || []
    target.damage_ticks = deepClone(source.damage_ticks) || []

    if (source.element !== undefined) target.element = source.element
    if (source.icon !== undefined) target.icon = source.icon
  }

  ElMessage.success(includeDuration ? 'Скопировано на все сегменты (с длительностью)' : 'Скопировано на все сегменты (без длительности)')
}

const selectedEnemy = computed(() => {
  return enemyDatabase.value.find(e => e.id === selectedEnemyId.value)
})

const selectedWeapon = computed(() => {
  return weaponDatabase.value.find(w => w.id === selectedWeaponId.value)
})

const selectedEquipment = computed(() => {
  return equipmentDatabase.value.find(e => e.id === selectedEquipmentId.value)
})

const equipmentAffixEditorMounted = ref(false)
let equipmentAffixMountTimer = null

const selectedEquipmentAffixes = computed(() => {
  if (!selectedEquipment.value) return null
  if (!equipmentAffixEditorMounted.value) return null
  return selectedEquipment.value.affixes || null
})

const equipmentAffixColumns = computed(() => {
  const eq = selectedEquipment.value
  const is70 = Number(eq?.level) === 70
  return is70
    ? [
        { label: 'Начальный', index: 0 },
        { label: 'Улучшение 1', index: 1 },
        { label: 'Улучшение 2', index: 2 },
        { label: 'Улучшение 3', index: 3 },
      ]
    : [{ label: 'Начальный', index: 0 }]
})

const modifierDefs = computed(() => misc.value?.modifierDefs || [])
const weaponCommonModifiers = computed(() => misc.value?.weaponCommonModifiers || {})

const PRIMARY_STAT_IDS = ['strength', 'agility', 'intellect', 'will']
const primaryStatOptions = computed(() => {
  const coreMap = new Map(CORE_STATS.map(s => [s.id, s]))
  return PRIMARY_STAT_IDS.map(id => ({ value: id, label: coreMap.get(id)?.label || id }))
})

const equipmentModifierOptions = computed(() => {
  const map = new Map()
  for (const s of CORE_STATS) {
    map.set(s.id, { id: s.id, label: s.label, unit: s.unit })
  }
  for (const d of (modifierDefs.value || [])) {
    if (!d?.id) continue
    map.set(d.id, { id: d.id, label: d.label || d.id, unit: d.unit })
  }
  return [...map.values()].sort((a, b) => (a.label || '').localeCompare(b.label || ''))
})

const equipmentModifierOptionsV2 = computed(() => {
  return equipmentModifierOptions.value.map(o => ({ value: o.id, label: o.label }))
})

const availableCoreStatsToAdd = computed(() => {
  const existing = new Set((modifierDefs.value || []).map(d => d.id))
  return CORE_STATS.filter(s => !existing.has(s.id))
})

const collapsedEnemyGroups = ref(new Set())
const collapsedWeaponGroups = ref(new Set())
const collapsedEquipmentGroups = ref(new Set())

// === Жизненный цикл ===

function scheduleEquipmentAffixEditorMount() {
  if (equipmentAffixEditorMounted.value) return
  if (equipmentAffixMountTimer) return

  const start = () => {
    equipmentAffixMountTimer = null
    equipmentAffixEditorMounted.value = true
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    equipmentAffixMountTimer = window.requestIdleCallback(start, { timeout: 800 })
  } else {
    equipmentAffixMountTimer = setTimeout(start, 200)
  }
}

watch(characterRoster, (newList) => {
  if (newList && newList.length > 0 && !selectedCharId.value) {
    selectedCharId.value = newList[0].id
  }
}, { immediate: true })

watch(selectedCharId, () => {
  attackSegmentIndex.value = 0
  if (!selectedChar.value) return
  ensureAttackSegments(selectedChar.value)
  for (const seg of selectedChar.value.attack_segments || []) {
    normalizeDamageTicks(seg.damage_ticks)
    ensureEffectIds(seg.anomalies)
  }
  syncVariantAttackSegmentIndexList()
  if (selectedChar.value.variants) {
    selectedChar.value.variants.forEach(v => {
      if (v?.type === 'attack') ensureVariantAttackSegments(v, selectedChar.value)
    })
  }
})

watch(enemyDatabase, (newList) => {
  if (newList && newList.length > 0 && !selectedEnemyId.value) {
    selectedEnemyId.value = newList[0].id
  }
}, { immediate: true })

watch(weaponDatabase, (newList) => {
  if (newList && newList.length > 0 && !selectedWeaponId.value) {
    selectedWeaponId.value = newList[0].id
  }
}, { immediate: true })

watch(editingMode, (mode) => {
  if (mode === 'equipment') scheduleEquipmentAffixEditorMount()
})

watch(selectedWeapon, (w) => {
  if (!w) return
  if (!Array.isArray(w.commonSlots)) {
    w.commonSlots = [
      { modifierId: null, size: 'small' },
      { modifierId: null, size: 'small' }
    ]
  } else {
    while (w.commonSlots.length < 2) w.commonSlots.push({ modifierId: null, size: 'small' })
    w.commonSlots = w.commonSlots.slice(0, 2).map(s => ({
      modifierId: (typeof s?.modifierId === 'string' && s.modifierId.trim())
        ? s.modifierId.trim()
        : ((typeof s?.key === 'string' && s.key.trim()) ? s.key.trim() : null),
      size: (s?.size === 'large' || s?.size === 'medium' || s?.size === 'small') ? s.size : 'small'
    }))
  }
  if (!Array.isArray(w.buffBonuses)) w.buffBonuses = []
  w.buffBonuses = w.buffBonuses.map(b => ({
    modifierId: (typeof b?.modifierId === 'string' && b.modifierId.trim())
      ? b.modifierId.trim()
      : ((typeof b?.key === 'string' && b.key.trim()) ? b.key.trim() : null),
    values: normalizeArray9(b?.values)
  }))
}, { immediate: true })

watch(equipmentDatabase, (newList) => {
  if (newList && newList.length > 0 && !selectedEquipmentId.value) {
    selectedEquipmentId.value = newList[0].id
  }
}, { immediate: true })

watch([selectedEquipment, equipmentAffixEditorMounted], ([eq, mounted]) => {
  if (!mounted || !eq) return
  ensureEquipmentAffixes(eq)
}, { immediate: true })

watch(() => selectedEquipment.value?.category, (newCat) => {
  if (!newCat) return
  ensureEquipmentCategoryConfig(newCat)
}, { immediate: true })

// === Методы ===

function setMode(mode) {
  editingMode.value = mode
  searchQuery.value = ''
  // При смене режима автоматически выбираем первый элемент
  if (mode === 'enemy' && enemyDatabase.value && enemyDatabase.value.length > 0 && !selectedEnemyId.value) {
    selectedEnemyId.value = enemyDatabase.value[0].id
  } else if (mode === 'character' && characterRoster.value && characterRoster.value.length > 0 && !selectedCharId.value) {
    selectedCharId.value = characterRoster.value[0].id
  } else if (mode === 'weapon' && weaponDatabase.value && weaponDatabase.value.length > 0 && !selectedWeaponId.value) {
    selectedWeaponId.value = weaponDatabase.value[0].id
  } else if (mode === 'equipment' && equipmentDatabase.value && equipmentDatabase.value.length > 0 && !selectedEquipmentId.value) {
    selectedEquipmentId.value = equipmentDatabase.value[0].id
  } else if (mode === 'misc') {
    miscSection.value = 'stats'
  }
}

function handleAddNew() {
  if (editingMode.value === 'character') return addNewCharacter()
  if (editingMode.value === 'enemy') return addNewEnemy()
  if (editingMode.value === 'weapon') return addNewWeapon()
  if (editingMode.value === 'equipment') return addNewEquipment()
}

function ensureMiscRoot() {
  if (!misc.value) {
    misc.value = { modifierDefs: [], weaponCommonModifiers: {}, equipmentTemplates: {} }
  }
  if (!misc.value.modifierDefs) misc.value.modifierDefs = []
  if (!misc.value.weaponCommonModifiers) misc.value.weaponCommonModifiers = {}
  if (!misc.value.equipmentTemplates || typeof misc.value.equipmentTemplates !== 'object') misc.value.equipmentTemplates = {}
  if (!misc.value.equipmentTemplates.armor) misc.value.equipmentTemplates.armor = { primary1: [0, 0, 0, 0], primary2: [0, 0, 0, 0], primary1Single: [0, 0, 0, 0] }
  if (!misc.value.equipmentTemplates.gloves) misc.value.equipmentTemplates.gloves = { primary1: [0, 0, 0, 0], primary2: [0, 0, 0, 0], primary1Single: [0, 0, 0, 0] }
  if (!misc.value.equipmentTemplates.accessory) misc.value.equipmentTemplates.accessory = { primary1: [0, 0, 0, 0], primary2: [0, 0, 0, 0], primary1Single: [0, 0, 0, 0] }
}

function normalizeArray9(arr) {
  const list = Array.isArray(arr) ? arr.slice(0, 9) : []
  while (list.length < 9) list.push(0)
  return list.map(v => Number(v) || 0)
}

function normalizeArray4(arr) {
  const list = Array.isArray(arr) ? arr.slice(0, 4) : []
  while (list.length < 4) list.push(0)
  return list.map(v => Number(v) || 0)
}

function normalizeModifierDefs(defs) {
  const list = Array.isArray(defs) ? defs : []
  const seen = new Set()
  const out = []
  for (const def of list) {
    const id = typeof def?.id === 'string' ? def.id.trim() : (typeof def?.key === 'string' ? def.key.trim() : '')
    if (!id || seen.has(id)) continue
    const unit = def?.unit === 'percent' || def?.unit === 'flat' ? def.unit : 'flat'
    out.push({ id, label: (def?.label || id).toString(), unit, note: def?.note, domainTags: def?.domainTags })
    seen.add(id)
  }
  return out
}

function normalizeEquipmentAffixes(level, affixes) {
  const safe = (affixes && typeof affixes === 'object') ? affixes : {}
  const is70 = Number(level) === 70

  const normalizePrimary = (input, { defaultId = null } = {}) => {
    const raw = (input && typeof input === 'object') ? input : {}
    const modifierId = typeof raw.modifierId === 'string' && raw.modifierId.trim()
      ? raw.modifierId.trim()
      : (typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : defaultId)

    const values = is70 ? normalizeArray4(raw.values) : [Number(Array.isArray(raw.values) ? raw.values[0] : raw.value) || 0]
    return { modifierId: modifierId || null, values }
  }

  const normalizeAdapter = (input) => {
    const raw = (input && typeof input === 'object') ? input : {}
    const ids = Array.isArray(raw.modifierIds) ? raw.modifierIds : (raw.modifierId ? [raw.modifierId] : [])
    const cleaned = []
    for (const id of ids) {
      if (typeof id !== 'string') continue
      const trimmed = id.trim()
      if (!trimmed) continue
      if (!cleaned.includes(trimmed)) cleaned.push(trimmed)
    }
    const values = is70 ? normalizeArray4(raw.values) : [Number(Array.isArray(raw.values) ? raw.values[0] : raw.value) || 0]
    return { modifierIds: cleaned, values }
  }

  return {
    primary1: normalizePrimary(safe.primary1),
    primary2: normalizePrimary(safe.primary2),
    adapter: normalizeAdapter(safe.adapter),
  }
}

function ensureEquipmentAffixes(eq) {
  if (!eq) return null
  const is70 = Number(eq.level) === 70
  const targetLen = is70 ? 4 : 1

  const ensureValues = (values, fillFrom = 0) => {
    const out = Array.isArray(values) ? values.slice() : []
    const base = Number(out[0] ?? fillFrom) || 0
    if (out.length === 0) out.push(base)
    if (out.length > targetLen) return out.slice(0, targetLen).map(v => Number(v) || 0)
    while (out.length < targetLen) out.push(base)
    return out.map(v => Number(v) || 0)
  }

  if (!eq.affixes || typeof eq.affixes !== 'object') {
    const legacy = (eq.affixes70 && typeof eq.affixes70 === 'object') ? eq.affixes70 : null
    const normalized = normalizeEquipmentAffixes(eq.level, legacy || null)
    eq.affixes = normalized
    return eq.affixes
  }

  if (!eq.affixes.primary1 || typeof eq.affixes.primary1 !== 'object') eq.affixes.primary1 = { modifierId: null, values: [] }
  if (!eq.affixes.primary2 || typeof eq.affixes.primary2 !== 'object') eq.affixes.primary2 = { modifierId: null, values: [] }
  if (!eq.affixes.adapter || typeof eq.affixes.adapter !== 'object') eq.affixes.adapter = { modifierIds: [], values: [] }

  eq.affixes.primary1.modifierId = (typeof eq.affixes.primary1.modifierId === 'string' && eq.affixes.primary1.modifierId.trim())
    ? eq.affixes.primary1.modifierId.trim()
    : null
  eq.affixes.primary2.modifierId = (typeof eq.affixes.primary2.modifierId === 'string' && eq.affixes.primary2.modifierId.trim())
    ? eq.affixes.primary2.modifierId.trim()
    : null

  if (!Array.isArray(eq.affixes.adapter.modifierIds)) eq.affixes.adapter.modifierIds = []
  eq.affixes.adapter.modifierIds = eq.affixes.adapter.modifierIds
    .filter(v => typeof v === 'string' && v.trim())
    .map(v => v.trim())

  eq.affixes.primary1.values = ensureValues(eq.affixes.primary1.values, 0)
  eq.affixes.primary2.values = ensureValues(eq.affixes.primary2.values, 0)
  eq.affixes.adapter.values = ensureValues(eq.affixes.adapter.values, 0)

  return eq.affixes
}

function ensureEquipmentTemplate(slotKey) {
  ensureMiscRoot()
  const mapKey = slotKey === 'armor' ? 'armor' : (slotKey === 'gloves' ? 'gloves' : (slotKey === 'accessory' ? 'accessory' : null))
  if (!mapKey) return null
  return misc.value.equipmentTemplates?.[mapKey] || null
}

async function applyEquipmentTemplate(eq) {
  if (!eq || Number(eq.level) !== 70) return
  const t = ensureEquipmentTemplate(eq.slot)
  if (!t) return
  const aff = ensureEquipmentAffixes(eq)
  if (!aff) return

  const hasSecond = !!aff.primary2?.modifierId
  const templateValues = hasSecond
    ? [...normalizeArray4(t.primary1), ...normalizeArray4(t.primary2)]
    : normalizeArray4(t.primary1Single)

  const templateHasNonZero = templateValues.some(v => (Number(v) || 0) !== 0)
  if (!templateHasNonZero) {
    const currentValues = hasSecond
      ? [...normalizeArray4(aff.primary1.values), ...normalizeArray4(aff.primary2.values)]
      : normalizeArray4(aff.primary1.values)
    const currentHasNonZero = currentValues.some(v => (Number(v) || 0) !== 0)
    if (currentHasNonZero) {
      try {
        await ElMessageBox.confirm('Все значения шаблона равны 0. Это очистит текущие значения. Продолжить?', 'Подтверждение', {
          confirmButtonText: 'Продолжить',
          cancelButtonText: 'Отмена',
          type: 'warning',
        })
      } catch {
        return
      }
    }
  }

  if (hasSecond) {
    aff.primary1.values = normalizeArray4(t.primary1)
    aff.primary2.values = normalizeArray4(t.primary2)
  } else {
    aff.primary1.values = normalizeArray4(t.primary1Single)
    aff.primary2.values = [0, 0, 0, 0]
  }
}

function ensureWeaponCommonEntry(key) {
  if (!key) return null
  ensureMiscRoot()
  if (!misc.value.weaponCommonModifiers[key]) {
    misc.value.weaponCommonModifiers[key] = {
      small: Array(9).fill(0),
      medium: Array(9).fill(0),
      large: Array(9).fill(0),
    }
  }
  return misc.value.weaponCommonModifiers[key]
}

function selectChar(id) {
  selectedCharId.value = id
  activeTab.value = 'basic'
}

function selectEnemy(id) {
  selectedEnemyId.value = id
}

function selectWeapon(id) {
  selectedWeaponId.value = id
}

function selectEquipment(id) {
  selectedEquipmentId.value = id
}

function updateEnemyId(event) {
  const newId = event.target.value
  if (!newId) {
    event.target.value = selectedEnemy.value.id
    return
  }
  if (selectedEnemy.value) selectedEnemy.value.id = newId
  selectedEnemyId.value = newId
}

function updateCharId(event) {
  const newId = event.target.value
  if (!newId) {
    event.target.value = selectedChar.value.id
    return
  }
  if (selectedChar.value) selectedChar.value.id = newId
  selectedCharId.value = newId
}

function updateWeaponId(event) {
  const newId = event.target.value
  if (!newId) {
    event.target.value = selectedWeapon.value.id
    return
  }
  if (selectedWeapon.value) selectedWeapon.value.id = newId
  selectedWeaponId.value = newId
}

function updateEquipmentId(event) {
  const newId = event.target.value
  if (!newId) {
    event.target.value = selectedEquipment.value.id
    return
  }
  if (selectedEquipment.value) selectedEquipment.value.id = newId
  selectedEquipmentId.value = newId
}

function addNewCharacter() {
  const newId = `char_${Date.now()}`
  const allGlobalEffects = [...effectKeys]

  const newChar = {
    id: newId, name: "Новый оператор", rarity: 5, element: "physical", weapon: "sword", avatar: "/avatars/default.webp", exclusive_buffs: [],
    accept_team_gauge: true,

    // Инициализация различных действий
    attack_segments: Array.from({ length: ATTACK_SEGMENT_COUNT }, (_, idx) => ({
      duration: idx === 0 ? 2.5 : 0,
      gaugeGain: 0,
      allowed_types: allGlobalEffects,
      anomalies: [],
      damage_ticks: []
    })),
    skill_duration: 2, skill_spCost: 100, skill_gaugeGain: 0, skill_teamGaugeGain: 0, skill_allowed_types: [], skill_anomalies: [], skill_damage_ticks: [], skill_icon: "",
    link_duration: 1.5, link_cooldown: 15, link_gaugeGain: 0, link_allowed_types: [], link_anomalies: [], link_damage_ticks: [], link_icon: "",
    ultimate_duration: 3, ultimate_gaugeMax: 100, ultimate_gaugeReply: 0, ultimate_enhancementTime: 0, ultimate_allowed_types: [], ultimate_anomalies: [], ultimate_damage_ticks: [], ultimate_animationTime: 1.5, ultimate_icon: "",
    execution_duration: 1.5, execution_allowed_types: allGlobalEffects, execution_anomalies: [], execution_damage_ticks: [],
    dodge_duration: 0.5,

    variants: []
  }

  characterRoster.value.unshift(newChar)
  selectedCharId.value = newId
  ElMessage.success('Новый оператор добавлен')
}

function addNewEnemy() {
  const newId = `enemy_${Date.now()}`
  const newEnemy = {
    id: newId,
    name: 'Новый враг',
    avatar: '/Icon_Enemy/default_enemy.webp',
    maxStagger: 100,
    staggerNodeCount: 0,
    staggerNodeDuration: 2,
    staggerBreakDuration: 10,
    executionRecovery: 20,
    category: enemyCategories.value[0] || '',
    tier: 'normal'
  }
  if (!enemyDatabase.value) enemyDatabase.value = []
  enemyDatabase.value.push(newEnemy)
  selectedEnemyId.value = newId
  ElMessage.success('Новый враг добавлен')
}

function addNewWeapon() {
  const newId = `wp_${Date.now()}`
  const newWeapon = {
    id: newId,
    name: 'Новое оружие',
    buffName: '',
    type: 'sword',
    rarity: 3,
    duration: 0,
    icon: '/weapons/default.webp',
    commonSlots: [
      { modifierId: null, size: 'small' },
      { modifierId: null, size: 'small' }
    ],
    buffBonuses: []
  }
  if (!weaponDatabase.value) weaponDatabase.value = []
  weaponDatabase.value.push(newWeapon)
  selectedWeaponId.value = newId
  ElMessage.success('Новое оружие добавлено')
}

function addNewEquipment() {
  const newId = `eq_${Date.now()}`
  const category = equipmentCategories.value?.[0] || ''
  const newEquipment = {
    id: newId,
    name: 'Новое снаряжение',
    category,
    slot: 'armor',
    level: 70,
    icon: '/equipment/default.webp'
  }
  if (!equipmentDatabase.value) equipmentDatabase.value = []
  equipmentDatabase.value.push(newEquipment)
  selectedEquipmentId.value = newId

  if (category && !equipmentCategoryConfigs.value?.[category]) {
    equipmentCategoryConfigs.value[category] = { setBonus: { duration: 0 } }
  }

  ElMessage.success('Новое снаряжение добавлено')
}

function addCoreModifierDef(statId) {
  if (!statId) return
  ensureMiscRoot()
  if (modifierDefs.value.some(d => d.id === statId)) return
  const core = CORE_STATS.find(s => s.id === statId)
  const newDef = { id: statId, label: core ? `${core.label} повышение` : 'Новый атрибут', unit: core?.unit || 'flat' }
  misc.value.modifierDefs.push(newDef)
  ensureWeaponCommonEntry(statId)
  if (miscSection.value === 'weapon_table') {
    selectedWeaponTableModifierId.value = statId
  }
}

function removeModifierDef(id) {
  if (!id) return
  ElMessageBox.confirm('Вы уверены, что хотите удалить этот атрибут? Ссылки на него в оружии будут очищены.', 'Подтверждение', {
    confirmButtonText: 'Удалить',
    cancelButtonText: 'Отмена',
    type: 'warning'
  }).then(() => {
    const idx = misc.value.modifierDefs.findIndex(d => d.id === id)
    if (idx !== -1) misc.value.modifierDefs.splice(idx, 1)

    if (misc.value.weaponCommonModifiers && misc.value.weaponCommonModifiers[id]) {
      delete misc.value.weaponCommonModifiers[id]
    }

    for (const w of weaponDatabase.value || []) {
      if (Array.isArray(w.commonSlots)) {
        w.commonSlots.forEach(slot => { if ((slot?.modifierId || slot?.key) === id) slot.modifierId = null })
      }
      if (Array.isArray(w.buffBonuses)) {
        w.buffBonuses = w.buffBonuses.filter(b => (b?.modifierId || b?.key) !== id)
      }
    }

  }).catch(() => {})
}

function addEquipmentCategory() {
  const name = (newEquipmentCategoryName.value || '').trim()
  if (!name) {
    ElMessage.warning('Название категории не может быть пустым')
    return
  }
  if (equipmentCategories.value.includes(name)) {
    ElMessage.warning('Такая категория уже существует')
    return
  }
  equipmentCategories.value.push(name)
  if (!equipmentCategoryConfigs.value?.[name]) {
    equipmentCategoryConfigs.value[name] = { setBonus: { duration: 0 } }
  }
  newEquipmentCategoryName.value = ''
  ElMessage.success(`Категория "${name}" добавлена`)
}

function deleteEquipmentCategory(name) {
  if (!name) return
  ElMessageBox.confirm(`Вы уверены, что хотите удалить категорию снаряжения "${name}"? Снаряжение в этой категории станет несортированным.`, 'Предупреждение', {
    confirmButtonText: 'Удалить',
    cancelButtonText: 'Отмена',
    type: 'warning'
  }).then(() => {
    for (const eq of equipmentDatabase.value || []) {
      if (eq.category === name) eq.category = ''
    }
    const idx = equipmentCategories.value.indexOf(name)
    if (idx !== -1) equipmentCategories.value.splice(idx, 1)
    if (equipmentCategoryConfigs.value?.[name]) delete equipmentCategoryConfigs.value[name]
  }).catch(() => {})
}

function addEnemyCategory() {
  const name = (newEnemyCategoryName.value || '').trim()
  if (!name) {
    ElMessage.warning('Название категории не может быть пустым')
    return
  }
  if (enemyCategories.value.includes(name)) {
    ElMessage.warning('Такая категория уже существует')
    return
  }
  enemyCategories.value.push(name)
  newEnemyCategoryName.value = ''
  ElMessage.success(`Категория "${name}" добавлена`)
}

function deleteEnemyCategory(name) {
  if (!name) return
  ElMessageBox.confirm(`Вы уверены, что хотите удалить категорию врагов "${name}"? Враги в этой категории станут несортированными.`, 'Предупреждение', {
    confirmButtonText: 'Удалить',
    cancelButtonText: 'Отмена',
    type: 'warning'
  }).then(() => {
    for (const enemy of enemyDatabase.value || []) {
      if (enemy.category === name) enemy.category = ''
    }
    const idx = enemyCategories.value.indexOf(name)
    if (idx !== -1) enemyCategories.value.splice(idx, 1)
  }).catch(() => {})
}

function addWeaponBuffBonusRow() {
  if (!selectedWeapon.value) return
  if (!Array.isArray(selectedWeapon.value.buffBonuses)) selectedWeapon.value.buffBonuses = []
  selectedWeapon.value.buffBonuses.push({
    modifierId: null,
    values: Array(9).fill(0)
  })
}

function removeWeaponBuffBonusRow(index) {
  if (!selectedWeapon.value) return
  if (!Array.isArray(selectedWeapon.value.buffBonuses)) return
  selectedWeapon.value.buffBonuses.splice(index, 1)
}

function deleteCurrentCharacter() {
  if (!selectedChar.value) return
  ElMessageBox.confirm(`Вы уверены, что хотите удалить оператора "${selectedChar.value.name}"?`, 'Предупреждение', {
    confirmButtonText: 'Удалить', cancelButtonText: 'Отмена', type: 'warning'
  }).then(() => {
    const idx = characterRoster.value.findIndex(c => c.id === selectedCharId.value)
    if (idx !== -1) {
      characterRoster.value.splice(idx, 1)
      if (characterRoster.value.length > 0) selectedCharId.value = characterRoster.value[0].id
      else selectedCharId.value = null
      ElMessage.success('Удалено')
    }
  }).catch(() => {})
}

function deleteCurrentEnemy() {
  if (!selectedEnemy.value) return
  ElMessageBox.confirm(`Вы уверены, что хотите удалить врага "${selectedEnemy.value.name}"?`, 'Предупреждение', {
    confirmButtonText: 'Удалить', cancelButtonText: 'Отмена', type: 'warning'
  }).then(() => {
    const idx = enemyDatabase.value.findIndex(e => e.id === selectedEnemyId.value)
    if (idx !== -1) {
      enemyDatabase.value.splice(idx, 1)
      selectedEnemyId.value = enemyDatabase.value.length > 0 ? enemyDatabase.value[0].id : null
      ElMessage.success('Удалено')
    }
  }).catch(() => {})
}

function deleteCurrentWeapon() {
  if (!selectedWeapon.value) return
  ElMessageBox.confirm(`Вы уверены, что хотите удалить оружие "${selectedWeapon.value.name}"?`, 'Предупреждение', {
    confirmButtonText: 'Удалить', cancelButtonText: 'Отмена', type: 'warning'
  }).then(() => {
    const idx = weaponDatabase.value.findIndex(w => w.id === selectedWeaponId.value)
    if (idx !== -1) {
      weaponDatabase.value.splice(idx, 1)
      selectedWeaponId.value = weaponDatabase.value.length > 0 ? weaponDatabase.value[0].id : null
      ElMessage.success('Удалено')
    }
  }).catch(() => {})
}

function deleteCurrentEquipment() {
  if (!selectedEquipment.value) return
  ElMessageBox.confirm(`Вы уверены, что хотите удалить снаряжение "${selectedEquipment.value.name}"?`, 'Предупреждение', {
    confirmButtonText: 'Удалить', cancelButtonText: 'Отмена', type: 'warning'
  }).then(() => {
    const idx = equipmentDatabase.value.findIndex(e => e.id === selectedEquipmentId.value)
    if (idx !== -1) {
      equipmentDatabase.value.splice(idx, 1)
      selectedEquipmentId.value = equipmentDatabase.value.length > 0 ? equipmentDatabase.value[0].id : null
      ElMessage.success('Удалено')
    }
  }).catch(() => {})
}

function toggleEnemyGroup(name) {
  const set = collapsedEnemyGroups.value
  if (set.has(name)) set.delete(name); else set.add(name)
}

function isEnemyGroupCollapsed(name) {
  return collapsedEnemyGroups.value.has(name)
}

function toggleWeaponGroup(name) {
  const set = collapsedWeaponGroups.value
  if (set.has(name)) set.delete(name); else set.add(name)
}

function isWeaponGroupCollapsed(name) {
  return collapsedWeaponGroups.value.has(name)
}

function toggleEquipmentGroup(name) {
  const set = collapsedEquipmentGroups.value
  if (set.has(name)) set.delete(name); else set.add(name)
}

function isEquipmentGroupCollapsed(name) {
  return collapsedEquipmentGroups.value.has(name)
}

function ensureEquipmentCategoryConfig(category) {
  if (!category) return
  if (!equipmentCategoryConfigs.value) equipmentCategoryConfigs.value = {}
  if (!equipmentCategoryConfigs.value[category]) {
    equipmentCategoryConfigs.value[category] = { setBonus: { duration: 0 } }
    return
  }
  if (!equipmentCategoryConfigs.value[category].setBonus) {
    equipmentCategoryConfigs.value[category].setBonus = { duration: 0 }
    return
  }
  if (equipmentCategoryConfigs.value[category].setBonus.duration === undefined) {
    equipmentCategoryConfigs.value[category].setBonus.duration = 0
  }
}

function getCategorySetBonusDuration(category) {
  ensureEquipmentCategoryConfig(category)
  const raw = equipmentCategoryConfigs.value?.[category]?.setBonus?.duration
  const num = Number(raw)
  return Number.isFinite(num) ? Math.max(0, num) : 0
}

function setCategorySetBonusDuration(category, value) {
  ensureEquipmentCategoryConfig(category)
  const num = Number(value)
  equipmentCategoryConfigs.value[category].setBonus.duration = Number.isFinite(num) ? Math.max(0, num) : 0
}

// === Логика точек урона (Damage Ticks) ===
function getDamageTicks(char, type) {
  if (!char) return []

  if (type === 'attack') {
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = Array.isArray(char.attack_segments) ? char.attack_segments[idx] : null
    return Array.isArray(seg?.damage_ticks) ? seg.damage_ticks : []
  }

  const key = `${type}_damage_ticks`
  if (!char[key]) char[key] = []
  normalizeDamageTicks(char[key])
  return char[key]
}

function addDamageTick(char, type) {
  if (!char) return
  if (type === 'attack') {
    ensureAttackSegments(char)
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = char.attack_segments[idx]
    if (!Array.isArray(seg.damage_ticks)) seg.damage_ticks = []
    normalizeDamageTicks(seg.damage_ticks)
    seg.damage_ticks.push({ offset: 0, stagger: 0, sp: 0, boundEffects: [] })
    return
  }

  const list = getDamageTicks(char, type)
  // Точка по умолчанию: 0 сек, урон 0, восполнение энергии 0
  list.push({ offset: 0, stagger: 0, sp: 0, boundEffects: [] })
}

function removeDamageTick(char, type, index) {
  if (!char) return
  if (type === 'attack') {
    ensureAttackSegments(char)
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = char.attack_segments[idx]
    if (!Array.isArray(seg.damage_ticks)) seg.damage_ticks = []
    seg.damage_ticks.splice(index, 1)
    return
  }

  const list = getDamageTicks(char, type)
  list.splice(index, 1)
}

function normalizeDamageTicks(list = []) {
  list.forEach(tick => {
    if (!tick.boundEffects) tick.boundEffects = []
  })
}


// === Основная логика вариантов действий ===

function getSnapshotFromBase(char, type) {
  if (type === 'attack') {
    const attackSegments = buildVariantAttackSegmentsFromBase(char)
    const totalDuration = attackSegments.reduce((acc, s) => acc + (Number(s?.duration) || 0), 0)
    return { duration: totalDuration, attackSegments }
  }

  // Базовые значения
  const snapshot = {
    duration: char[`${type}_duration`] || 1,
    element: char[`${type}_element`] || undefined,
    icon: char[`${type}_icon`] || "",
    allowedTypes: char[`${type}_allowed_types`] ? [...char[`${type}_allowed_types`]] : [],
    physicalAnomaly: char[`${type}_anomalies`] ? JSON.parse(JSON.stringify(char[`${type}_anomalies`])) : [],
    damageTicks: char[`${type}_damage_ticks`] ? JSON.parse(JSON.stringify(char[`${type}_damage_ticks`])) : []
  }

  if (type === 'skill') {
    snapshot.spCost = char.skill_spCost || 0
    snapshot.gaugeGain = char.skill_gaugeGain || 0
    snapshot.teamGaugeGain = char.skill_teamGaugeGain || 0
  }
  else if (type === 'link') {
    snapshot.cooldown = char.link_cooldown || 0
    snapshot.gaugeGain = char.link_gaugeGain || 0
  }
  else if (type === 'ultimate') {
    snapshot.gaugeCost = char.ultimate_gaugeMax || 0
    snapshot.gaugeGain = char.ultimate_gaugeReply || 0
    snapshot.enhancementTime = char.ultimate_enhancementTime || 0
    snapshot.animationTime = char.ultimate_animationTime || 0
  }
  return snapshot
}

function addVariant() {
  if (!selectedChar.value.variants) selectedChar.value.variants = []

  const defaultType = 'attack'
  const baseStats = getSnapshotFromBase(selectedChar.value, defaultType)

  selectedChar.value.variants.push({
    id: `v_${Date.now()}`,
    name: 'Усиленная атака',
    type: defaultType,
    ...baseStats
  })
  syncVariantAttackSegmentIndexList()
}

function removeVariant(idx) {
  if (selectedChar.value.variants) {
    selectedChar.value.variants.splice(idx, 1)
  }
  syncVariantAttackSegmentIndexList()
}

function onVariantTypeChange(variant, variantIdx) {
  if (!selectedChar.value) return
  const newStats = getSnapshotFromBase(selectedChar.value, variant.type)
  Object.assign(variant, newStats)

  if (variant.type === 'attack') {
    ensureVariantAttackSegments(variant, selectedChar.value, { force: true })
    syncVariantAttackSegmentIndexList()
    if (variantIdx !== undefined && variantIdx !== null) {
      variantAttackSegmentIndexList.value[variantIdx] = 0
    }
  } else {
    delete variant.attackSegments
  }

  if (variant.name === 'Новый усиленный навык' || variant.name.startsWith('Усиленный')) {
    const typeObj = VARIANT_TYPES.find(t => t.value === variant.type)
    if (typeObj) {
      const labelName = typeObj.label
      variant.name = `Усиленный ${labelName.toLowerCase()}`
    }
  }
}

// === Логика чекбоксов для вариантов ===

function onVariantCheckChange(variant, variantIdx, key) {
  const list = getVariantAllowedTypesRef(variant, variantIdx)
  const isChecked = list.includes(key)
  handleGroupCheck(list, isChecked, key)
}

function onCheckChange(char, skillType, key) {
  if (!char) return

  if (skillType === 'attack') {
    ensureAttackSegments(char)
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = char.attack_segments[idx]
    if (!seg.allowed_types) seg.allowed_types = []
    const list = seg.allowed_types
    const isChecked = list.includes(key)
    handleGroupCheck(list, isChecked, key)
    return
  }

  const fieldName = `${skillType}_allowed_types`
  if (!char[fieldName]) char[fieldName] = []
  const list = char[fieldName]
  const isChecked = list.includes(key)
  handleGroupCheck(list, isChecked, key)
}

function handleGroupCheck(list, isChecked, key) {
  const elementalGroups = [
    ['burning', 'blaze_attach', 'blaze_burst'],
    ['conductive', 'emag_attach', 'emag_burst'],
    ['frozen', 'cold_attach', 'cold_burst'],
    ['corrosion', 'nature_attach', 'nature_burst']
  ]
  const group = elementalGroups.find(g => g.includes(key))
  if (group) {
    if (isChecked) {
      group.forEach(item => { if (!list.includes(item)) list.push(item) })
    }
  }

  const physicalGroup = ['stagger', 'armor_break', 'knockup', 'knockdown'];
  const physicalBase = ['break', 'ice_shatter'];
  if (isChecked && physicalGroup.includes(key)) {
    physicalBase.forEach(baseItem => {
      if (!list.includes(baseItem)) list.push(baseItem);
    });
  }
}

function generateEffectId() {
  return Math.random().toString(36).substring(2, 9)
}

function createEffect(defaultType = 'default') {
  return { _id: generateEffectId(), type: defaultType, stacks: 1, duration: 0, offset: 0 }
}

function ensureEffectIds(rows) {
  if (!rows || rows.length === 0) return
  const normalized = Array.isArray(rows[0]) ? rows : [rows]
  normalized.forEach(row => {
    row.forEach(effect => {
      if (effect && !effect._id) effect._id = generateEffectId()
    })
  })
}

function getEffectDisplayName(type) {
  if (EFFECT_NAMES[type]) return EFFECT_NAMES[type]
  const exclusive = selectedChar.value?.exclusive_buffs?.find(b => b.key === type)
  if (exclusive?.name) return exclusive.name
  return type || 'Unknown'
}

function getEffectIconPath(type) {
  const exclusive = selectedChar.value?.exclusive_buffs?.find(b => b.key === type)
  if (exclusive?.path) return exclusive.path
  return iconDatabase.value?.[type] || iconDatabase.value?.default || ''
}

function getVariantAvailableOptions(variant, variantIdx) {
  const allowedList = getVariantAllowedTypesRef(variant, variantIdx)
  const combinedKeys = new Set([...allowedList, 'default'])
  return buildOptions(combinedKeys)
}

function getAvailableAnomalyOptions(skillType) {
  if (!selectedChar.value) return []
  if (skillType === 'attack') {
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = Array.isArray(selectedChar.value.attack_segments) ? selectedChar.value.attack_segments[idx] : null
    const allowedList = seg?.allowed_types || []
    const combinedKeys = new Set([...allowedList, 'default'])
    return buildOptions(combinedKeys)
  }

  const allowedList = selectedChar.value[`${skillType}_allowed_types`] || []
  const combinedKeys = new Set([...allowedList, 'default'])
  return buildOptions(combinedKeys)
}

function buildOptions(keysSet) {
  return Array.from(keysSet).map(key => {
    if (EFFECT_NAMES[key]) return { label: EFFECT_NAMES[key], value: key }
    const exclusive = selectedChar.value?.exclusive_buffs.find(b => b.key === key)
    if (exclusive) return { label: `★ ${exclusive.name}`, value: key }
    return { label: key, value: key }
  })
}

function buildBindingOptionsFromAnomalies(raw) {
  if (!raw || raw.length === 0) return []
  ensureEffectIds(raw)
  return buildEffectBindingOptions(raw, { getEffectName: (type) => getEffectDisplayName(type) })
}

function getBindingOptions(skillType) {
  if (!selectedChar.value) return []
  if (skillType === 'attack') {
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = Array.isArray(selectedChar.value.attack_segments) ? selectedChar.value.attack_segments[idx] : null
    const raw = seg?.anomalies
    return buildBindingOptionsFromAnomalies(raw)
  }

  const raw = selectedChar.value[`${skillType}_anomalies`]
  return buildBindingOptionsFromAnomalies(raw)
}

function getVariantBindingOptions(variant, variantIdx) {
  if (!variant) return []
  const raw = getVariantPhysicalAnomalyRef(variant, variantIdx)
  return buildBindingOptionsFromAnomalies(raw)
}

// === Общая логика для двумерных массивов ===

function getAnomalyRows(char, skillType) {
  if (!char) return []
  if (skillType === 'attack') {
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = Array.isArray(char.attack_segments) ? char.attack_segments[idx] : null
    const raw = seg?.anomalies || []
    if (raw.length === 0) return []
    if (!Array.isArray(raw[0])) return [raw]
    return raw
  }

  const key = `${skillType}_anomalies`
  const raw = char[key] || []
  if (raw.length === 0) return []
  ensureEffectIds(raw)
  if (!Array.isArray(raw[0])) return [raw]
  return raw
}

function addAnomalyRow(char, skillType) {
  if (!char) return

  if (skillType === 'attack') {
    ensureAttackSegments(char)
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = char.attack_segments[idx]
    let rows = getAnomalyRows(char, skillType)
    if (!seg.anomalies || (seg.anomalies.length > 0 && !Array.isArray(seg.anomalies[0]))) {
      seg.anomalies = rows
    }
    const allowedList = seg.allowed_types || []
    const defaultType = allowedList.length > 0 ? allowedList[0] : 'default'
    seg.anomalies.push([createEffect(defaultType)])
    return
  }

  const key = `${skillType}_anomalies`
  let rows = getAnomalyRows(char, skillType)
  if (!char[key] || (char[key].length > 0 && !Array.isArray(char[key][0]))) {
    char[key] = rows
  }
  const allowedList = char[`${skillType}_allowed_types`] || []
  const defaultType = allowedList.length > 0 ? allowedList[0] : 'default'
  char[key].push([createEffect(defaultType)])
}

function addAnomalyToRow(char, skillType, rowIndex) {
  const rows = getAnomalyRows(char, skillType)

  if (skillType === 'attack') {
    ensureAttackSegments(char)
    const idx = Math.min(Math.max(attackSegmentIndex.value, 0), ATTACK_SEGMENT_COUNT - 1)
    const seg = char.attack_segments[idx]
    const allowedList = seg.allowed_types || []
    const defaultType = allowedList.length > 0 ? allowedList[0] : 'default'
    if (rows[rowIndex]) {
      rows[rowIndex].push(createEffect(defaultType))
    }
    return
  }

  const allowedList = char[`${skillType}_allowed_types`] || []
  const defaultType = allowedList.length > 0 ? allowedList[0] : 'default'
  if (rows[rowIndex]) {
    rows[rowIndex].push(createEffect(defaultType))
  }
}

function removeAnomaly(char, skillType, rowIndex, colIndex) {
  const rows = getAnomalyRows(char, skillType)
  if (rows[rowIndex]) {
    rows[rowIndex].splice(colIndex, 1)
    if (rows[rowIndex].length === 0) {
      rows.splice(rowIndex, 1)
    }
  }
}

// Операции с матрицей для вариантов
function addVariantRow(variant, variantIdx) {
  const anomalies = getVariantPhysicalAnomalyRef(variant, variantIdx)
  const allowedTypes = getVariantAllowedTypesRef(variant, variantIdx)
  const defaultType = (allowedTypes && allowedTypes.length > 0) ? allowedTypes[0] : 'default'
  anomalies.push([createEffect(defaultType)])
}

function addVariantEffect(variant, variantIdx, rowIndex) {
  const anomalies = getVariantPhysicalAnomalyRef(variant, variantIdx)
  const allowedTypes = getVariantAllowedTypesRef(variant, variantIdx)
  if (anomalies && anomalies[rowIndex]) {
    const defaultType = (allowedTypes && allowedTypes.length > 0) ? allowedTypes[0] : 'default'
    anomalies[rowIndex].push(createEffect(defaultType))
  }
}

function removeVariantEffect(variant, variantIdx, rowIndex, colIndex) {
  const anomalies = getVariantPhysicalAnomalyRef(variant, variantIdx)
  if (anomalies && anomalies[rowIndex]) {
    anomalies[rowIndex].splice(colIndex, 1)
    if (anomalies[rowIndex].length === 0) {
      anomalies.splice(rowIndex, 1)
    }
  }
}

function getVariantTicks(variant, variantIdx) {
  return getVariantDamageTicksRef(variant, variantIdx)
}

// Операции с точками урона для вариантов
function addVariantDamageTick(variant, variantIdx) {
  const ticks = getVariantTicks(variant, variantIdx)
  ticks.push({ offset: 0, stagger: 0, sp: 0, boundEffects: [] })
}
function removeVariantDamageTick(variant, variantIdx, index) {
  const ticks = getVariantTicks(variant, variantIdx)
  ticks.splice(index, 1)
}

function onSkillGaugeInput(event) {
  const val = Number(event.target.value)
  if (selectedChar.value) {
    selectedChar.value.skill_teamGaugeGain = val
  }
}

function normalizeCharacterForSave(char) {
  if (char.dodge_duration === '' || char.dodge_duration === null) {
    delete char.dodge_duration
  } else if (char.dodge_duration !== undefined) {
    const dodgeVal = Number(char.dodge_duration)
    if (Number.isFinite(dodgeVal)) char.dodge_duration = Math.max(0, dodgeVal)
    else delete char.dodge_duration
  }

  const skillTypes = ['skill', 'link', 'ultimate', 'execution']
  skillTypes.forEach(type => {
    const tickKey = `${type}_damage_ticks`
    if (!char[tickKey]) char[tickKey] = []
    normalizeDamageTicks(char[tickKey])
    ensureEffectIds(char[`${type}_anomalies`])
  })

  ensureAttackSegments(char)
  for (const seg of char.attack_segments || []) {
    if (!seg.damage_ticks) seg.damage_ticks = []
    normalizeDamageTicks(seg.damage_ticks)
    ensureEffectIds(seg.anomalies)
    if (!Array.isArray(seg.allowed_types)) seg.allowed_types = []
  }

  // Устаревшие поля атаки больше не сохраняются
  delete char.attack_duration
  delete char.attack_gaugeGain
  delete char.attack_allowed_types
  delete char.attack_anomalies
  delete char.attack_damage_ticks

  if (char.variants) {
    char.variants.forEach(variant => {
      if (variant?.type === 'attack') {
        ensureVariantAttackSegments(variant, char)
        for (const seg of variant.attackSegments || []) {
          if (!seg.damageTicks) seg.damageTicks = []
          normalizeDamageTicks(seg.damageTicks)
          ensureEffectIds(seg.physicalAnomaly)
          if (!Array.isArray(seg.allowedTypes)) seg.allowedTypes = []
        }
      } else {
        if (!variant.damageTicks) variant.damageTicks = []
        normalizeDamageTicks(variant.damageTicks)
        ensureEffectIds(variant.physicalAnomaly)
        if (!Array.isArray(variant.allowedTypes)) variant.allowedTypes = []
      }
    })
  }
}

function saveData() {
  characterRoster.value.sort((a, b) => (b.rarity || 0) - (a.rarity || 0));

  // Нормализуем опциональные поля, чтобы не сохранять значения-заглушки
  for (const char of characterRoster.value || []) {
    normalizeCharacterForSave(char)
    for (const key of Object.keys(char)) {
      if (key.endsWith('_element') && char[key] === '') {
        delete char[key]
      }
    }
  }

  // Нормализуем опциональные поля оружия
  for (const weapon of weaponDatabase.value || []) {
    if (!Array.isArray(weapon.commonSlots)) {
      weapon.commonSlots = [
        { modifierId: null, size: 'small' },
        { modifierId: null, size: 'small' }
      ]
    }
    while (weapon.commonSlots.length < 2) weapon.commonSlots.push({ modifierId: null, size: 'small' })
    weapon.commonSlots = weapon.commonSlots.slice(0, 2).map(s => ({
      modifierId: (typeof s?.modifierId === 'string' && s.modifierId.trim())
        ? s.modifierId.trim()
        : ((typeof s?.key === 'string' && s.key.trim()) ? s.key.trim() : null),
      size: (s?.size === 'large' || s?.size === 'medium' || s?.size === 'small') ? s.size : 'small'
    }))

    if (!Array.isArray(weapon.buffBonuses)) weapon.buffBonuses = []
    weapon.buffBonuses = weapon.buffBonuses.map(b => ({
      modifierId: (typeof b?.modifierId === 'string' && b.modifierId.trim())
        ? b.modifierId.trim()
        : ((typeof b?.key === 'string' && b.key.trim()) ? b.key.trim() : null),
      values: normalizeArray9(b?.values)
    })).filter(b => b.modifierId)
  }

  // Нормализуем misc поля
  ensureMiscRoot()
  misc.value.modifierDefs = normalizeModifierDefs(misc.value.modifierDefs)
  const normalizedCommon = {}
  for (const def of misc.value.modifierDefs) {
    const entry = misc.value.weaponCommonModifiers?.[def.id]
    if (!entry) continue
    normalizedCommon[def.id] = {
      small: normalizeArray9(entry.small),
      medium: normalizeArray9(entry.medium),
      large: normalizeArray9(entry.large),
    }
  }
  misc.value.weaponCommonModifiers = normalizedCommon

  if (!misc.value.equipmentTemplates || typeof misc.value.equipmentTemplates !== 'object') misc.value.equipmentTemplates = {}
  for (const key of ['armor', 'gloves', 'accessory']) {
    if (!misc.value.equipmentTemplates[key]) {
      misc.value.equipmentTemplates[key] = { primary1: [0, 0, 0, 0], primary2: [0, 0, 0, 0], primary1Single: [0, 0, 0, 0] }
    }
    const t = misc.value.equipmentTemplates[key]
    t.primary1 = normalizeArray4(t.primary1)
    t.primary2 = normalizeArray4(t.primary2)
    t.primary1Single = normalizeArray4(t.primary1Single)
  }

  for (const eq of equipmentDatabase.value || []) {
    if (!eq) continue
    if (eq.affixes || eq.affixes70) {
      ensureEquipmentAffixes(eq)
    }
    if (Number(eq.level) !== 70 && eq.affixes) {
      eq.affixes.primary1.values = [Number(eq.affixes.primary1.values?.[0]) || 0]
      eq.affixes.primary2.values = [Number(eq.affixes.primary2.values?.[0]) || 0]
      eq.affixes.adapter.values = [Number(eq.affixes.adapter.values?.[0]) || 0]
    }
  }

  const dataToSave = {
    ICON_DATABASE: iconDatabase.value,
    characterRoster: characterRoster.value,
    enemyDatabase: enemyDatabase.value,
    enemyCategories: enemyCategories.value,
    weaponDatabase: weaponDatabase.value,
    equipmentDatabase: equipmentDatabase.value,
    equipmentCategories: equipmentCategories.value,
    equipmentCategoryConfigs: equipmentCategoryConfigs.value,
    misc: misc.value
  }
  executeSave(dataToSave)
}
</script>

<template>
  <div class="cms-layout">
    <aside class="cms-sidebar">
      <div class="sidebar-tabs">
        <button
          class="ea-btn ea-btn--glass-cut"
          :class="{ 'is-active': editingMode === 'character' }"
          :style="{ '--ea-btn-accent': 'var(--ea-gold)' }"
          @click="setMode('character')"
        >Персонаж</button>
        <button
            class="ea-btn ea-btn--glass-cut"
            :class="{ 'is-active': editingMode === 'weapon' }"
            :style="{ '--ea-btn-accent': 'var(--ea-blue)' }"
            @click="setMode('weapon')"
        >Оружие</button>
        <button
            class="ea-btn ea-btn--glass-cut"
            :class="{ 'is-active': editingMode === 'equipment' }"
            :style="{ '--ea-btn-accent': 'var(--ea-success)' }"
            @click="setMode('equipment')"
        >Снаряжение</button>
        <button
          class="ea-btn ea-btn--glass-cut"
          :class="{ 'is-active': editingMode === 'enemy' }"
          :style="{ '--ea-btn-accent': 'var(--ea-danger-soft)' }"
          @click="setMode('enemy')"
        >Враг</button>
        <button
          class="ea-btn ea-btn--glass-cut"
          :class="{ 'is-active': editingMode === 'misc' }"
          :style="{ '--ea-btn-accent': 'var(--ea-purple)' }"
          @click="setMode('misc')"
        >Прочее</button>
      </div>

      <div class="sidebar-header">
        <h2>
          {{
            editingMode === 'character'
              ? 'Данные персонажа'
              : editingMode === 'enemy'
                ? 'Данные врага'
                : editingMode === 'weapon'
                  ? 'Данные оружия'
                  : editingMode === 'equipment'
                    ? 'Данные снаряжения'
                    : 'Прочее'
          }}
        </h2>
        <button
          v-if="editingMode !== 'misc'"
          class="ea-btn ea-btn--icon ea-btn--icon-28 ea-btn--icon-plus"
          @click="handleAddNew"
        >＋</button>
      </div>
      <div v-if="editingMode !== 'misc'" class="search-box">
        <input v-model="searchQuery" placeholder="Поиск по ID или имени..." />
      </div>

      <div v-if="editingMode === 'character'" class="char-list">
        <div v-for="char in filteredRoster" :key="char.id"
             class="char-item" :class="{ active: char.id === selectedCharId }"
             @click="selectChar(char.id)">

          <div class="avatar-wrapper-small" :class="`rarity-${char.rarity}-border`">
            <img :src="char.avatar" loading="lazy" decoding="async" @error="e=>e.target.src='/avatars/default.webp'" />
          </div>

          <div class="char-info">
            <span class="char-name">{{ char.name }}</span>
            <span class="char-meta" :class="`rarity-${char.rarity}`">
              {{ char.rarity }}★ {{ ELEMENTS.find(e=>e.value===char.element)?.label || char.element || '' }}
            </span>
          </div>
        </div>

      </div>

      <div v-else-if="editingMode === 'enemy'" class="char-list">

        <div v-for="group in groupedEnemies" :key="group.name" class="enemy-group">
          <div class="group-title" @click="toggleEnemyGroup(group.name)" style="cursor: pointer; display:flex; align-items:center; justify-content:space-between;">
            <span>{{ group.name }}</span>
            <span class="group-meta">
              <span class="group-count">({{ group.list.length }})</span>
              <el-icon class="toggle-arrow" :class="{ 'is-rotated': !isEnemyGroupCollapsed(group.name) }"><ArrowRight /></el-icon>
            </span>
          </div>

          <div v-if="!isEnemyGroupCollapsed(group.name)">
            <div v-for="enemy in group.list" :key="enemy.id"
                 class="char-item"
                :class="{ active: enemy.id === selectedEnemyId }"
                @click="selectEnemy(enemy.id)">

              <div class="avatar-wrapper-small" :style="{ borderColor: ENEMY_TIERS.find(t=>t.value===enemy.tier)?.color }">
                <img :src="enemy.avatar" loading="lazy" decoding="async" @error="e=>e.target.src='/avatars/default_enemy.webp'" />
              </div>

              <div class="char-info">
                <span class="char-name">{{ enemy.name }}</span>
                <span class="char-meta" style="color:#aaa">
                  {{ enemy.maxStagger }} / {{ enemy.staggerNodeCount }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="groupedEnemies.length === 0" class="empty-hint">
          Нет подходящих врагов
        </div>

      </div>

      <div v-else-if="editingMode === 'weapon'" class="char-list">
        <div v-for="group in groupedWeapons" :key="group.key" class="enemy-group">
          <div class="group-title" @click="toggleWeaponGroup(group.name)" style="cursor: pointer; display:flex; align-items:center; justify-content:space-between;">
            <span>{{ group.name }}</span>
            <span class="group-meta">
              <span class="group-count">({{ group.list.length }})</span>
              <el-icon class="toggle-arrow" :class="{ 'is-rotated': !isWeaponGroupCollapsed(group.name) }"><ArrowRight /></el-icon>
            </span>
          </div>

          <div v-if="!isWeaponGroupCollapsed(group.name)">
            <div v-for="weapon in group.list" :key="weapon.id"
                 class="char-item"
                 :class="{ active: weapon.id === selectedWeaponId }"
                 @click="selectWeapon(weapon.id)">
              <div class="avatar-wrapper-small" :class="`rarity-${Math.max(3, weapon.rarity || 3)}-border`" style="display:flex;align-items:center;justify-content:center; overflow:hidden;">
                <img
                    :key="weapon.icon || weapon.id"
                    :src="weapon.icon || '/weapons/default.webp'"
                    loading="lazy"
                    decoding="async"
                    @error="e=>e.target.src='/weapons/default.webp'"
                    style="width:100%;height:100%;object-fit:cover;" />
              </div>
              <div class="char-info">
                <span class="char-name">{{ weapon.name }}</span>
                <span class="char-meta" :class="`rarity-${Math.max(3, weapon.rarity || 3)}`">
                  {{ Math.max(3, weapon.rarity || 3) }}★ {{ (WEAPON_TYPES.find(w=>w.value===weapon.type)?.label || weapon.type || 'Неизвестно') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredWeapons.length === 0" class="empty-hint">
          Нет оружия, добавьте через кнопку выше
        </div>
      </div>

      <div v-else-if="editingMode === 'equipment'" class="char-list">
        <div v-for="group in groupedEquipment" :key="group.name" class="enemy-group">
          <div class="group-title" @click="toggleEquipmentGroup(group.name)" style="cursor: pointer; display:flex; align-items:center; justify-content:space-between;">
            <span>{{ group.name }}</span>
            <span class="group-meta">
              <span class="group-count">({{ group.list.length }})</span>
              <el-icon class="toggle-arrow" :class="{ 'is-rotated': !isEquipmentGroupCollapsed(group.name) }"><ArrowRight /></el-icon>
            </span>
          </div>

          <div v-show="!isEquipmentGroupCollapsed(group.name)">
            <div v-for="eq in group.list" :key="eq.id"
                 class="char-item"
                 :class="{ active: eq.id === selectedEquipmentId }"
                 @click="selectEquipment(eq.id)">
              <div class="avatar-wrapper-small" :style="{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderColor: getEquipmentLevelColor(eq.level) }">
                <img
                    :key="eq.icon || eq.id"
                    :src="eq.icon || '/icons/default_icon.webp'"
                    loading="lazy"
                    decoding="async"
                    @error="e=>e.target.src='/icons/default_icon.webp'"
                    style="width:100%;height:100%;object-fit:cover;" />
              </div>
              <div class="char-info">
                <span class="char-name">{{ eq.name }}</span>
                <span class="char-meta" :style="{ color: getEquipmentLevelColor(eq.level) }">
                  {{ (EQUIPMENT_SLOTS.find(s=>s.value===eq.slot)?.label || eq.slot || 'Неизвестно') }} · Ур.{{ eq.level || 0 }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredEquipment.length === 0" class="empty-hint">
          Нет снаряжения, добавьте через кнопку выше
        </div>
      </div>

      <div v-else-if="editingMode === 'misc'" class="char-list">
        <div class="char-item" :class="{ active: miscSection === 'stats' }" @click="miscSection = 'stats'">
          <div class="char-info">
            <span class="char-name">Все атрибуты</span>
            <span class="char-meta" style="color:#aaa">Сортировка / быстрое добавление</span>
          </div>
        </div>
        <div class="char-item" :class="{ active: miscSection === 'weapon_table' }" @click="miscSection = 'weapon_table'">
          <div class="char-info">
            <span class="char-name">Значения модификаторов оружия</span>
            <span class="char-meta" style="color:#aaa">1–9 ур. / большой/средний/малый</span>
          </div>
        </div>
        <div class="char-item" :class="{ active: miscSection === 'equipment_table' }" @click="miscSection = 'equipment_table'">
          <div class="char-info">
            <span class="char-name">Шаблоны аффиксов снаряжения</span>
            <span class="char-meta" style="color:#aaa">Броня/Перчатки/Аксессуар</span>
          </div>
        </div>
        <div class="char-item" :class="{ active: miscSection === 'equipment_categories' }" @click="miscSection = 'equipment_categories'">
          <div class="char-info">
            <span class="char-name">Категории снаряжения</span>
            <span class="char-meta" style="color:#aaa">Добавление / удаление / сортировка</span>
          </div>
        </div>
        <div class="char-item" :class="{ active: miscSection === 'enemy_categories' }" @click="miscSection = 'enemy_categories'">
          <div class="char-info">
            <span class="char-name">Категории врагов</span>
            <span class="char-meta" style="color:#aaa">Добавление / удаление / сортировка</span>
          </div>
        </div>
      </div>

      <div class="sidebar-footer">
        <button class="ea-btn ea-btn--block ea-btn--lg ea-btn--fill-success" @click="saveData">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Сохранить данные
        </button>
        <router-link to="/" class="ea-btn ea-btn--block ea-btn--outline-muted">↩ Вернуться к таймлайну</router-link>
      </div>
    </aside>

    <main class="cms-content">
      <div v-if="editingMode === 'character' && selectedChar" class="editor-panel">
        <header class="panel-header">
          <div class="header-left">
            <div class="avatar-wrapper-large" :class="`rarity-${selectedChar.rarity}-border`">
              <img :src="selectedChar.avatar" @error="e=>e.target.src='/avatars/default.webp'" />
            </div>

            <div class="header-titles">
              <h1 class="edit-title">{{ selectedChar.name }}</h1>
              <span class="id-tag">{{ selectedChar.id }}</span>
            </div>
          </div>
          <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="deleteCurrentCharacter">Удалить персонажа</button>
        </header>

        <div class="cms-tabs">
          <button :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Основное
          </button>

          <button :class="{ active: activeTab === 'attack' }" @click="activeTab = 'attack'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 17.5L3 6V3h3l11.5 11.5"></path>
              <path d="M13 19l6-6"></path>
              <path d="M16 16l4 4"></path>
              <path d="M19 21l2-2"></path>
            </svg>
            Атака
          </button>

          <button :class="{ active: activeTab === 'skill' }" @click="activeTab = 'skill'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            Навык
          </button>

          <button :class="{ active: activeTab === 'link' }" @click="activeTab = 'link'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Связка
          </button>

          <button :class="{ active: activeTab === 'ultimate' }" @click="activeTab = 'ultimate'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            Ультимейт
          </button>

          <button :class="{ active: activeTab === 'execution' }" @click="activeTab = 'execution'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="22" y1="12" x2="18" y2="12"></line>
              <line x1="6" y1="12" x2="2" y2="12"></line>
              <line x1="12" y1="6" x2="12" y2="2"></line>
              <line x1="12" y1="22" x2="12" y2="18"></line>
            </svg>
            Казнь
          </button>

          <button :class="{ active: activeTab === 'dodge' }" @click="activeTab = 'dodge'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12c3-6 6-6 9 0s6 6 9 0"></path>
              <path d="M3 12c3 6 6 6 9 0s6-6 9 0"></path>
            </svg>
            Уклонение
          </button>

          <button :class="{ active: activeTab === 'variants' }" @click="activeTab = 'variants'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            Варианты
          </button>
        </div>

        <div class="tab-content">

          <div v-show="activeTab === 'basic'" class="form-section">
            <h3 class="section-title">Основные атрибуты</h3>
            <div class="form-grid">
              <div class="form-group"><label>Имя</label><input v-model="selectedChar.name" type="text" /></div>
              <div class="form-group"><label>ID (уникальный)</label><input :value="selectedChar.id" @input="updateCharId" type="text" /></div>
              <div class="form-group"><label>Редкость</label>
                <el-select v-model="selectedChar.rarity" size="large" style="width: 100%">
                  <el-option :value="6" label="6 ★" />
                  <el-option :value="5" label="5 ★" />
                  <el-option :value="4" label="4 ★" />
                </el-select>
              </div>
              <div class="form-group">
                <label>Стихия</label>
                <el-select v-model="selectedChar.element" size="large" style="width: 100%">
                  <el-option v-for="elm in ELEMENTS" :key="elm.value" :label="elm.label" :value="elm.value" />
                </el-select>
              </div>
              <div class="form-group">
                <label>Тип оружия</label>
                <el-select v-model="selectedChar.weapon" size="large" style="width: 100%">
                  <el-option v-for="wpn in WEAPON_TYPES" :key="wpn.value" :label="wpn.label" :value="wpn.value" />
                </el-select>
              </div>
              <div class="form-group full-width"><label>Путь к иконке</label><input v-model="selectedChar.avatar" type="text" /></div>
            </div>

            <h3 class="section-title">Особые механики</h3>
            <div class="form-grid">
              <div class="form-group">
                <label>Пополнение энергии</label>
                <div class="checkbox-wrapper" :class="{ 'is-checked': selectedChar.accept_team_gauge !== false }">
                  <input
                      type="checkbox"
                      id="cb_accept_gauge"
                      :checked="selectedChar.accept_team_gauge !== false"
                      @change="e => selectedChar.accept_team_gauge = e.target.checked"
                  >
                  <label for="cb_accept_gauge">Получать энергию от команды</label>
                </div>
              </div>
            </div>

            <h3 class="section-title">Эксклюзивные эффекты</h3>
            <div class="exclusive-list">
              <div v-for="(buff, idx) in selectedChar.exclusive_buffs" :key="idx" class="exclusive-row">
                <input v-model="buff.key" placeholder="Ключ" />
                <input v-model="buff.name" placeholder="Отображаемое имя" />
                <input v-model="buff.path" placeholder="Путь к иконке" class="flex-grow" />
                <button class="ea-btn ea-btn--icon ea-btn--icon-24 ea-btn--glass-rect ea-btn--accent-red ea-btn--glass-rect-danger" @click="selectedChar.exclusive_buffs.splice(idx, 1)">×</button>
              </div>
              <button class="ea-btn ea-btn--block ea-btn--dashed-muted" @click="selectedChar.exclusive_buffs.push({key:'',name:'',path:''})">+ Добавить эксклюзивный эффект</button>
            </div>
          </div>

          <div v-show="activeTab === 'variants'" class="form-section">
            <div class="info-banner">
              Добавленные здесь действия имеют <strong>независимые значения</strong> (глубокая копия базовых значений на момент создания).<br>
              Изменение здесь не влияет на базовые навыки, и наоборот.
            </div>

            <div v-for="(variant, idx) in (selectedChar.variants || [])" :key="idx" class="variant-card">
              <div class="variant-header">
                <span class="variant-idx">#{{ idx + 1 }}</span>
                <button class="ea-btn ea-btn--icon ea-btn--icon-24 ea-btn--glass-rect ea-btn--accent-red ea-btn--glass-rect-danger" @click="removeVariant(idx)">×</button>
              </div>

              <div class="form-grid three-col">
                <div class="form-group">
                  <label>Отображаемое имя</label>
                  <input v-model="variant.name" placeholder="Например: Усиленный навык" />
                </div>
                <div class="form-group">
                  <label>Тип действия (сброс при смене)</label>
                  <el-select v-model="variant.type" size="large" style="width: 100%" @change="onVariantTypeChange(variant, idx)">
                    <el-option v-for="t in VARIANT_TYPES" :key="t.value" :label="t.label" :value="t.value" />
                  </el-select>
                </div>
                <div class="form-group">
                  <label>Уникальный ID (суффикс)</label>
                  <input v-model="variant.id" placeholder="англ. ключ, например s1_enhanced" />
                </div>
                <div class="form-group" v-if="['skill', 'link', 'ultimate'].includes(variant.type)">
                  <label>Путь к иконке варианта</label>
                  <input v-model="variant.icon" type="text"/>
                </div>

                <div class="form-group" v-if="variant.type !== 'attack'"><label>Длительность</label><input type="number" step="0.1" v-model.number="variant.duration"></div>

                <template v-if="variant.type === 'attack'">
                  <div class="form-group">
                    <label>Сегмент атаки</label>
                    <el-select v-model="variantAttackSegmentIndexList[idx]" size="large" style="width: 100%">
                      <el-option v-for="i in ATTACK_SEGMENT_COUNT" :key="`vseg_${idx}_${i}`" :label="`Сегмент ${i}`" :value="i - 1" />
                    </el-select>
                  </div>
                  <div class="form-group"><label>Общая длительность (с)</label><input type="number" :value="getVariantAttackTotalDuration(variant)" disabled></div>
                  <div class="form-group"><label>Длительность сегмента (с)</label><input type="number" step="0.1" v-model.number="variant.attackSegments[variantAttackSegmentIndexList[idx] || 0].duration"></div>
                  <div class="form-group"><label>Пополнение энергии (свой)</label><input type="number" v-model.number="variant.attackSegments[variantAttackSegmentIndexList[idx] || 0].gaugeGain"></div>
                  <div class="form-group full-width">
                    <button class="ea-btn ea-btn--block ea-btn--dashed-muted" @click="ensureVariantAttackSegments(variant, selectedChar, { force: true })">Перекопировать 5 сегментов из базовой атаки</button>
                  </div>
                </template>

                <div class="form-group" v-if="variant.type === 'skill'"><label>Стоимость энергии</label><input type="number" v-model.number="variant.spCost"></div>
                <div class="form-group" v-if="variant.type === 'skill'"><label>Пополнение энергии (своё)</label><input type="number" v-model.number="variant.gaugeGain"></div>
                <div class="form-group" v-if="variant.type === 'skill'"><label>Пополнение энергии (команда)</label><input type="number" v-model.number="variant.teamGaugeGain"></div>

                <div class="form-group" v-if="variant.type === 'link'"><label>Время восстановления (CD)</label><input type="number" v-model.number="variant.cooldown"></div>
                <div class="form-group" v-if="variant.type === 'link'"><label>Пополнение энергии (своё)</label><input type="number" v-model.number="variant.gaugeGain"></div>

                <div class="form-group" v-if="variant.type === 'ultimate'"><label>Стоимость энергии</label><input type="number" v-model.number="variant.gaugeCost"></div>
                <div class="form-group" v-if="variant.type === 'ultimate'"><label>Возврат энергии</label><input type="number" v-model.number="variant.gaugeGain"></div>
                <div class="form-group" v-if="variant.type === 'ultimate'"><label>Время усиления (с)</label><input type="number" step="0.5" v-model.number="variant.enhancementTime"></div>
                <div class="form-group" v-if="variant.type === 'ultimate'"><label>Время анимации (с)</label><input type="number" step="0.1" v-model.number="variant.animationTime"></div>
              </div>

              <div class="ticks-editor-area" style="margin-top: 10px;">
                <label style="font-size: 12px; color: #aaa; font-weight: bold; display: block; margin-bottom: 5px;">Точки урона</label>
                <div v-if="getVariantTicks(variant, idx).length === 0" class="empty-ticks-hint">Нет точек урона</div>
                <div v-for="(tick, tIdx) in getVariantTicks(variant, idx)" :key="tIdx" class="tick-row">
                  <div class="tick-top">
                    <div class="tick-idx">HIT {{ tIdx + 1 }}</div>
                    <div class="tick-inputs">
                      <div class="t-group"><label>Время (с)</label><input type="number" v-model.number="tick.offset" step="any" class="mini-input"></div>
                      <div class="t-group"><label style="color:#ff7875">Опрокидывание</label><input type="number" v-model.number="tick.stagger" class="mini-input"></div>
                      <div class="t-group"><label style="color:#ffd700">Восполнение энергии</label><input type="number" v-model.number="tick.sp" class="mini-input"></div>
                    </div>
                    <button class="ea-btn ea-btn--icon ea-btn--icon-24 ea-btn--glass-rect ea-btn--accent-red ea-btn--glass-rect-danger" @click="removeVariantDamageTick(variant, idx, tIdx)">×</button>
                  </div>
                  <div class="tick-binding">
                    <label>Привязанные эффекты</label>
                    <el-select
                        v-model="tick.boundEffects"
                        multiple
                        collapse-tags
                        collapse-tags-tooltip
                        popper-class="ea-tick-binding-popper"
                        size="small"
                        class="tick-select"
                        placeholder="Выберите эффекты для привязки"
                        :disabled="getVariantBindingOptions(variant, idx).length === 0"
                    >
                      <el-option v-for="opt in getVariantBindingOptions(variant, idx)" :key="opt.value" :label="opt.label" :value="opt.value">
                        <div class="binding-option">
                          <img :src="getEffectIconPath(opt.type)" class="binding-option__icon" />
                          <span class="binding-option__label">{{ opt.label }}</span>
                          <span class="binding-option__hint">{{ opt.hint }}</span>
                        </div>
                      </el-option>
                    </el-select>
                  </div>
                </div>
                <button class="ea-btn ea-btn--block ea-btn--lg ea-btn--dashed-panel ea-btn--radius-6" style="margin-top: 5px;" @click="addVariantDamageTick(variant, idx)">+ Добавить точку урона</button>
              </div>

              <div class="checkbox-grid" style="margin-top: 15px;">
                <template v-if="variant.type === 'attack'">
                  <label v-for="key in effectKeys" :key="`v_${variant.id}_${key}`" class="cb-item">
                    <input type="checkbox" :value="key" v-model="variant.attackSegments[variantAttackSegmentIndexList[idx] || 0].allowedTypes" @change="onVariantCheckChange(variant, idx, key)">
                    {{ EFFECT_NAMES[key] }}
                  </label>
                  <label v-for="buff in selectedChar.exclusive_buffs" :key="`v_${variant.id}_${buff.key}`" class="cb-item exclusive">
                    <input type="checkbox" :value="buff.key" v-model="variant.attackSegments[variantAttackSegmentIndexList[idx] || 0].allowedTypes" @change="onVariantCheckChange(variant, idx, buff.key)">
                    ★ {{ buff.name }}
                  </label>
                </template>
                <template v-else>
                  <label v-for="key in effectKeys" :key="`v_${variant.id}_${key}`" class="cb-item">
                    <input type="checkbox" :value="key" v-model="variant.allowedTypes" @change="onVariantCheckChange(variant, idx, key)">
                    {{ EFFECT_NAMES[key] }}
                  </label>
                  <label v-for="buff in selectedChar.exclusive_buffs" :key="`v_${variant.id}_${buff.key}`" class="cb-item exclusive">
                    <input type="checkbox" :value="buff.key" v-model="variant.allowedTypes" @change="onVariantCheckChange(variant, idx, buff.key)">
                    ★ {{ buff.name }}
                  </label>
                </template>
              </div>

              <div class="matrix-editor-area" style="margin-top: 15px; border-top: 1px dashed #444; padding-top: 15px;">
                <label style="font-size: 12px; color: #aaa; margin-bottom: 8px; display: block; font-weight: bold;">Дополнительные аномалии</label>
                <div class="anomalies-grid-editor">
                  <div v-for="(row, rIndex) in (variant.type === 'attack' ? (variant.attackSegments[variantAttackSegmentIndexList[idx] || 0].physicalAnomaly || []) : (variant.physicalAnomaly || []))" :key="rIndex" class="editor-row">
                    <div v-for="(item, cIndex) in row" :key="cIndex" class="editor-card">
                      <div class="card-header">
                        <span class="card-label">R{{rIndex+1}}:C{{cIndex+1}}</span>
                        <button class="ea-btn ea-btn--icon ea-btn--icon-24 ea-btn--glass-rect ea-btn--accent-red ea-btn--glass-rect-danger" @click="removeVariantEffect(variant, idx, rIndex, cIndex)">×</button>
                      </div>
                      <el-select v-model="item.type" size="small" class="card-select full-width-mb" style="width: 100%">
                        <el-option v-for="opt in getVariantAvailableOptions(variant, idx)" :key="opt.value" :label="opt.label" :value="opt.value" />
                      </el-select>

                      <div class="card-props-grid">
                        <div class="prop-item full-span">
                          <label>Слои (Stacks)</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="item.stacks" placeholder="1" class="mini-input">
                            <span class="unit">сл.</span>
                          </div>
                        </div>
                        <div class="prop-item">
                          <label>Смещение</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="item.offset" placeholder="0" step="0.1" class="mini-input">
                            <span class="unit">с</span>
                          </div>
                        </div>
                        <div class="prop-item">
                          <label>Длит.</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="item.duration" placeholder="0" step="0.5" class="mini-input">
                            <span class="unit">с</span>
                          </div>
                        </div>
                      </div>

                    </div>
                    <button class="ea-btn ea-btn--icon ea-btn--icon-40 ea-btn--icon-plus" @click="addVariantEffect(variant, idx, rIndex)">+</button>
                  </div>
                  <button class="ea-btn ea-btn--block ea-btn--lg ea-btn--dashed-panel ea-btn--radius-6" @click="addVariantRow(variant, idx)" :disabled="getVariantAvailableOptions(variant, idx).length === 0">+ Добавить строку эффектов</button>
                </div>
              </div>
            </div>

            <button class="ea-btn ea-btn--block ea-btn--lg ea-btn--dashed-panel ea-btn--radius-6" @click="addVariant" style="margin-top: 20px;">+ Добавить новый вариант действия</button>
          </div>

          <template v-for="type in ['attack', 'skill', 'link', 'ultimate', 'execution', 'dodge']" :key="type">
            <div v-show="activeTab === type" class="form-section">
              <h3 class="section-title">Настройки значений</h3>

              <div v-if="type === 'attack'" class="attack-seg-toolbar">
                <div class="attack-seg-buttons">
                  <button
                      v-for="i in ATTACK_SEGMENT_COUNT"
                      :key="`atkseg_${i}`"
                      class="ea-btn ea-btn--glass-cut ea-btn--sm"
                      :class="{ active: attackSegmentIndex === (i - 1) }"
                      @click="attackSegmentIndex = i - 1"
                  >Сегмент {{ i }}</button>
                </div>
                <div class="attack-seg-meta">
                  <span class="meta-item">Общая длительность: {{ attackTotalDuration }}с</span>
                  <button class="ea-btn ea-btn--glass-cut ea-btn--sm" @click="applyAttackSegmentToAll({ includeDuration: false })">Копировать на все (без длительности)</button>
                  <button class="ea-btn ea-btn--glass-cut ea-btn--sm" @click="applyAttackSegmentToAll({ includeDuration: true })">Копировать на все (с длительностью)</button>
                </div>
              </div>

              <div v-if="type === 'attack' && currentAttackSegment" class="form-grid three-col">
                <div class="form-group"><label>Длительность сегмента (с)</label><input type="number" step="0.1" v-model.number="currentAttackSegment.duration"></div>
                <div class="form-group"><label>Пополнение энергии (своё)</label><input type="number" v-model.number="currentAttackSegment.gaugeGain"></div>
              </div>

              <div v-else class="form-grid three-col">
                <div class="form-group" v-if="type === 'skill' || type === 'ultimate'">
                  <label>Стихия навыка</label>
                  <el-select v-model="selectedChar[`${type}_element`]" size="large" placeholder="По умолчанию (стихия персонажа)" style="width: 100%">
                    <el-option value="" label="По умолчанию (стихия персонажа)" />
                    <el-option v-for="elm in ELEMENTS" :key="elm.value" :label="elm.label" :value="elm.value" />
                  </el-select>
                </div>

                <div class="form-group" v-if="['skill', 'link', 'ultimate'].includes(type)"><label>Путь к иконке</label><input v-model="selectedChar[`${type}_icon`]" type="text"/></div>

                <div class="form-group"><label>Длительность (с)</label><input type="number" step="0.1" v-model.number="selectedChar[`${type}_duration`]"></div>

                <div class="form-group" v-if="type === 'skill'"><label>Стоимость энергии</label><input type="number" v-model.number="selectedChar[`${type}_spCost`]"></div>
                <div class="form-group" v-if="type === 'skill'"><label>Пополнение энергии (своё)</label><input type="number" v-model.number="selectedChar[`${type}_gaugeGain`]" @input="onSkillGaugeInput"></div>
                <div class="form-group" v-if="type === 'skill'"><label>Пополнение энергии (команда)</label><input type="number" v-model.number="selectedChar[`${type}_teamGaugeGain`]"></div>

                <div class="form-group" v-if="type === 'link'"><label>Время восстановления (с)</label><input type="number" v-model.number="selectedChar[`${type}_cooldown`]"></div>
                <div class="form-group" v-if="type === 'link'"><label>Пополнение энергии (своё)</label><input type="number" v-model.number="selectedChar[`${type}_gaugeGain`]"></div>

                <div class="form-group" v-if="type === 'ultimate'"><label>Стоимость энергии</label><input type="number" v-model.number="selectedChar[`${type}_gaugeMax`]"></div>
                <div class="form-group" v-if="type === 'ultimate'"><label>Пополнение энергии (своё)</label><input type="number" v-model.number="selectedChar[`${type}_gaugeReply`]"></div>
                <div class="form-group" v-if="type === 'ultimate'"><label>Время усиления (с)</label><input type="number" step="0.5" v-model.number="selectedChar[`${type}_enhancementTime`]"></div>
                <div class="form-group" v-if="type === 'ultimate'">
                  <label>Время анимации (с)</label>
                  <input type="number" step="0.1" v-model.number="selectedChar[`${type}_animationTime`]">
                </div>
              </div>

              <template v-if="type !== 'dodge'">
                <h3 class="section-title">Точки урона</h3>
              <div class="ticks-editor-area">
                <div v-if="getDamageTicks(selectedChar, type).length === 0" class="empty-ticks-hint">
                  Нет точек урона, нажмите кнопку ниже, чтобы добавить
                </div>
                <div v-for="(tick, tIdx) in getDamageTicks(selectedChar, type)" :key="tIdx" class="tick-row">
                  <div class="tick-top">
                    <div class="tick-idx">HIT {{ tIdx + 1 }}</div>
                    <div class="tick-inputs">
                      <div class="t-group"><label>Время (с)</label><input type="number" v-model.number="tick.offset" step="any" class="mini-input"></div>
                      <div class="t-group"><label style="color:#ff7875">Опрокидывание</label><input type="number" v-model.number="tick.stagger" class="mini-input"></div>
                      <div class="t-group"><label style="color:#ffd700">Восполнение энергии</label><input type="number" v-model.number="tick.sp" class="mini-input"></div>
                    </div>
                    <button class="ea-btn ea-btn--icon ea-btn--icon-24 ea-btn--glass-rect ea-btn--accent-red ea-btn--glass-rect-danger" @click="removeDamageTick(selectedChar, type, tIdx)">×</button>
                  </div>
                  <div class="tick-binding">
                    <label>Привязанные эффекты</label>
                    <el-select
                        v-model="tick.boundEffects"
                        multiple
                        collapse-tags
                        collapse-tags-tooltip
                        popper-class="ea-tick-binding-popper"
                        size="small"
                        class="tick-select"
                        placeholder="Выберите эффекты для привязки"
                        :disabled="getBindingOptions(type).length === 0"
                    >
                      <el-option v-for="opt in getBindingOptions(type)" :key="opt.value" :label="opt.label" :value="opt.value">
                        <div class="binding-option">
                          <img :src="getEffectIconPath(opt.type)" class="binding-option__icon" />
                          <span class="binding-option__label">{{ opt.label }}</span>
                          <span class="binding-option__hint">{{ opt.hint }}</span>
                        </div>
                      </el-option>
                    </el-select>
                  </div>
                </div>
                <button class="ea-btn ea-btn--block ea-btn--lg ea-btn--dashed-panel ea-btn--radius-6" style="margin-top: 10px;" @click="addDamageTick(selectedChar, type)">+ Добавить точку урона</button>
              </div>

              <h3 class="section-title">Пул эффектов</h3>
              <div v-if="type === 'attack' && currentAttackSegment" class="checkbox-grid">
                <label v-for="key in effectKeys" :key="`${type}_${attackSegmentIndex}_${key}`" class="cb-item">
                  <input type="checkbox" :value="key" v-model="currentAttackSegment.allowed_types" @change="onCheckChange(selectedChar, type, key)">
                  {{ EFFECT_NAMES[key] }}
                </label>
                <label v-for="buff in selectedChar.exclusive_buffs" :key="`${type}_${attackSegmentIndex}_${buff.key}`" class="cb-item exclusive">
                  <input type="checkbox" :value="buff.key" v-model="currentAttackSegment.allowed_types">
                  ★ {{ buff.name }}
                </label>
              </div>
              <div v-else class="checkbox-grid">
                <label v-for="key in effectKeys" :key="`${type}_${key}`" class="cb-item">
                  <input type="checkbox" :value="key" v-model="selectedChar[`${type}_allowed_types`]" @change="onCheckChange(selectedChar, type, key)">
                  {{ EFFECT_NAMES[key] }}
                </label>
                <label v-for="buff in selectedChar.exclusive_buffs" :key="`${type}_${buff.key}`" class="cb-item exclusive">
                  <input type="checkbox" :value="buff.key" v-model="selectedChar[`${type}_allowed_types`]">
                  ★ {{ buff.name }}
                </label>
              </div>

              <div class="matrix-editor-area">
                <h3 class="section-title">Прикреплённые эффекты (двумерная матрица)</h3>
                <div class="anomalies-grid-editor">
                  <div v-for="(row, rIndex) in getAnomalyRows(selectedChar, type)" :key="rIndex" class="editor-row">

                    <div v-for="(item, cIndex) in row" :key="cIndex" class="editor-card">
                      <div class="card-header">
                        <span class="card-label">R{{rIndex+1}}:C{{cIndex+1}}</span>
                        <button class="ea-btn ea-btn--icon ea-btn--icon-24 ea-btn--glass-rect ea-btn--accent-red ea-btn--glass-rect-danger" @click="removeAnomaly(selectedChar, type, rIndex, cIndex)">×</button>
                      </div>
                      <el-select v-model="item.type" size="small" class="card-select full-width-mb" style="width: 100%">
                        <el-option v-for="opt in getAvailableAnomalyOptions(type)" :key="opt.value" :label="opt.label" :value="opt.value" />
                      </el-select>

                      <div class="card-props-grid">
                        <div class="prop-item full-span">
                          <label>Слои</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="item.stacks" placeholder="1" class="mini-input">
                            <span class="unit">сл.</span>
                          </div>
                        </div>
                        <div class="prop-item">
                          <label>Смещение</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="item.offset" placeholder="0" step="0.1" class="mini-input">
                            <span class="unit">с</span>
                          </div>
                        </div>
                        <div class="prop-item">
                          <label>Длит.</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="item.duration" placeholder="0" step="0.5" class="mini-input">
                            <span class="unit">с</span>
                          </div>
                        </div>
                      </div>

                    </div>
                    <button class="ea-btn ea-btn--icon ea-btn--icon-40 ea-btn--icon-plus" @click="addAnomalyToRow(selectedChar, type, rIndex)">+</button>
                  </div>
                  <button class="ea-btn ea-btn--block ea-btn--lg ea-btn--dashed-panel ea-btn--radius-6" @click="addAnomalyRow(selectedChar, type)" :disabled="getAvailableAnomalyOptions(type).length === 0">+ Добавить строку эффектов</button>
                </div>
              </div>
              </template>
            </div>
          </template>

        </div>
      </div>

      <div v-else-if="editingMode === 'enemy' && selectedEnemy" class="editor-panel">
        <header class="panel-header">
          <div class="header-left">
            <div class="avatar-wrapper-large" :style="{ borderColor: ENEMY_TIERS.find(t=>t.value===selectedEnemy.tier)?.color || '#ff4d4f' }">
              <img :src="selectedEnemy.avatar" @error="e=>e.target.src='/avatars/default_enemy.webp'" />
            </div>
            <div class="header-titles">
              <h1 class="edit-title">{{ selectedEnemy.name }}</h1>
              <span class="id-tag">{{ selectedEnemy.id }}</span>
            </div>
          </div>
          <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="deleteCurrentEnemy">Удалить врага</button>
        </header>

        <div class="form-section">
          <h3 class="section-title">Основная информация</h3>
          <div class="form-grid">
            <div class="form-group"><label>Имя</label><input v-model="selectedEnemy.name" /></div>
            <div class="form-group"><label>ID</label><input :value="selectedEnemy.id" @change="updateEnemyId" /></div>
            <div class="form-group">
              <label>Ранг</label>
              <el-select
                v-model="selectedEnemy.tier"
                size="large"
                class="enemy-tier-select"
                style="width: 100%"
                :style="{ '--ea-tier-color': ENEMY_TIERS.find(t=>t.value===selectedEnemy.tier)?.color }"
              >
                <el-option v-for="t in ENEMY_TIERS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </div>

            <div class="form-group">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <label>Категория</label>
              </div>
              <el-select v-model="selectedEnemy.category" size="large" style="width: 100%">
                <el-option :value="''" label="Несортированные" />
                <el-option v-for="cat in enemyCategories" :key="cat" :label="cat" :value="cat" />
              </el-select>
            </div>
            <div class="form-group full-width"><label>Путь к иконке</label><input v-model="selectedEnemy.avatar" /></div>
          </div>

          <h3 class="section-title">Характеристики</h3>
          <div class="form-grid three-col">
            <div class="form-group"><label style="color:#ff7875">Макс. опрокидывание</label><input type="number" v-model.number="selectedEnemy.maxStagger"></div>
            <div class="form-group"><label style="color:#ff7875">Кол-во узлов опрокидывания</label><input type="number" v-model.number="selectedEnemy.staggerNodeCount"></div>
            <div class="form-group"><label style="color:#ff7875">Длительность пошатывания (с)</label><input type="number" step="0.1" v-model.number="selectedEnemy.staggerNodeDuration"></div>
            <div class="form-group"><label style="color:#ff7875">Длительность опрокидывания (с)</label><input type="number" step="0.5" v-model.number="selectedEnemy.staggerBreakDuration"></div>
            <div class="form-group"><label style="color:#ffd700">Восполнение энергии при казни</label><input type="number" v-model.number="selectedEnemy.executionRecovery"></div>
          </div>
        </div>
      </div>

      <div v-else-if="editingMode === 'equipment' && selectedEquipment" class="editor-panel">
        <header class="panel-header">
          <div class="header-left">
            <div class="avatar-wrapper-large" :style="{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderColor: getEquipmentLevelColor(selectedEquipment.level) }">
              <img
                  :key="selectedEquipment.icon || selectedEquipment.id"
                  :src="selectedEquipment.icon || '/icons/default_icon.webp'"
                  @error="e=>e.target.src='/icons/default_icon.webp'"
                  style="width:100%; height:100%; object-fit:cover;" />
            </div>
            <div class="header-titles">
              <h1 class="edit-title">{{ selectedEquipment.name }}</h1>
              <span class="id-tag">{{ selectedEquipment.id }}</span>
            </div>
          </div>
          <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="deleteCurrentEquipment">Удалить снаряжение</button>
        </header>

        <div class="form-section">
          <h3 class="section-title">Основная информация</h3>
          <div class="form-grid three-col">
            <div class="form-group"><label>Имя</label><input v-model="selectedEquipment.name" type="text" /></div>
            <div class="form-group"><label>ID (уникальный)</label><input :value="selectedEquipment.id" @input="updateEquipmentId" type="text" /></div>
            <div class="form-group">
              <label>Слот</label>
              <el-select v-model="selectedEquipment.slot" size="large" style="width: 100%">
                <el-option v-for="s in EQUIPMENT_SLOTS" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </div>
            <div class="form-group">
              <label>Уровень</label>
              <el-select v-model="selectedEquipment.level" size="large" style="width: 100%">
                <el-option v-for="lv in EQUIPMENT_LEVELS" :key="lv" :label="`Ур.${lv}`" :value="lv" />
              </el-select>
            </div>
            <div class="form-group">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <label>Категория</label>
              </div>
              <el-select v-model="selectedEquipment.category" size="large" style="width: 100%">
                <el-option :value="''" label="Несортированные" />
                <el-option v-for="cat in equipmentCategories" :key="cat" :label="cat" :value="cat" />
              </el-select>
            </div>
            <div class="form-group full-width"><label>Путь к иконке</label><input v-model="selectedEquipment.icon" type="text" /></div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Сетовый бонус (3 предмета)</h3>
          <div class="form-grid three-col">
            <div class="form-group">
              <label>Название баффа (равно категории)</label>
              <input :value="selectedEquipment.category || ''" disabled />
            </div>
            <div class="form-group">
              <label>Длительность (с)</label>
              <input
                  type="number"
                  min="0"
                  step="0.1"
                  :value="getCategorySetBonusDuration(selectedEquipment.category)"
                  @input="setCategorySetBonusDuration(selectedEquipment.category, $event.target.value)"
              />
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Значения аффиксов</h3>
          <div class="info-banner">
            Снаряжение Ур.70 поддерживает «Начальный / Улучшение 1 / Улучшение 2 / Улучшение 3»; ниже Ур.70 только «Начальное значение». Вторичный аффикс может быть пустым; адаптер может содержать несколько модификаторов (например, для комбинаций Холод+Электромагнитный).
          </div>

          <div v-if="Number(selectedEquipment.level) === 70" class="attack-seg-toolbar" style="margin-bottom: 12px;">
            <div class="attack-seg-meta" style="justify-content: space-between;">
              <span class="meta-item">Улучшаемые аффиксы: 4 ступени</span>
              <button class="ea-btn ea-btn--glass-cut ea-btn--sm" @click="applyEquipmentTemplate(selectedEquipment)">Применить шаблон слота (только значения)</button>
            </div>
          </div>

          <div v-if="selectedEquipmentAffixes" class="matrix-grid" :style="{ gridTemplateColumns: `140px 200px repeat(${equipmentAffixColumns.length}, 1fr)` }">
            <div class="matrix-cell header-corner">Аффикс</div>
            <div class="matrix-cell header-level">Модификатор</div>
            <div v-for="col in equipmentAffixColumns" :key="`eq_col_${col.index}`" class="matrix-cell header-level">{{ col.label }}</div>

            <div class="matrix-cell row-label large">Основной</div>
            <div class="matrix-cell">
              <el-select v-model="selectedEquipmentAffixes.primary1.modifierId" size="small" style="width: 100%" :teleported="true" placeholder="Выберите">
                <el-option :value="null" label="(нет)" />
                <el-option v-for="opt in primaryStatOptions" :key="`p1_${opt.value}`" :label="opt.label" :value="opt.value" />
              </el-select>
            </div>
            <div v-for="col in equipmentAffixColumns" :key="`p1v_${col.index}`" class="matrix-cell">
              <input type="number" step="0.1" v-model.number="selectedEquipmentAffixes.primary1.values[col.index]" class="matrix-input" />
            </div>

            <div class="matrix-cell row-label medium">Вторичный</div>
            <div class="matrix-cell">
              <el-select v-model="selectedEquipmentAffixes.primary2.modifierId" size="small" style="width: 100%" :teleported="true" placeholder="Выберите">
                <el-option :value="null" label="(нет)" />
                <el-option v-for="opt in primaryStatOptions" :key="`p2_${opt.value}`" :label="opt.label" :value="opt.value" />
              </el-select>
            </div>
            <div v-for="col in equipmentAffixColumns" :key="`p2v_${col.index}`" class="matrix-cell">
              <input type="number" step="0.1" v-model.number="selectedEquipmentAffixes.primary2.values[col.index]" class="matrix-input" />
            </div>

            <div class="matrix-cell row-label small">Адаптер</div>
            <div class="matrix-cell" style="overflow: visible;">
              <el-select-v2
                  v-model="selectedEquipmentAffixes.adapter.modifierIds"
                  multiple
                  filterable
                  collapse-tags
                  collapse-tags-tooltip
                  size="small"
                  style="width: 100%"
                  :teleported="true"
                  :options="equipmentModifierOptionsV2"
                  placeholder="Выберите"
              />
            </div>
            <div v-for="col in equipmentAffixColumns" :key="`adv_${col.index}`" class="matrix-cell">
              <input type="number" step="0.1" v-model.number="selectedEquipmentAffixes.adapter.values[col.index]" class="matrix-input" />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="editingMode === 'misc'" class="editor-panel">
        <header class="panel-header">
          <div class="header-left">
            <div class="header-titles">
              <h1 class="edit-title">
                {{
                  miscSection === 'stats'
                    ? 'Все атрибуты'
                    : miscSection === 'weapon_table'
                      ? 'Значения модификаторов оружия'
                      : miscSection === 'equipment_table'
                        ? 'Шаблоны аффиксов снаряжения'
                      : miscSection === 'equipment_categories'
                        ? 'Категории снаряжения'
                        : 'Категории врагов'
                }}
              </h1>
              <span class="id-tag">Прочее</span>
            </div>
          </div>
        </header>

        <div v-if="miscSection === 'stats'" class="form-section">
          <div class="info-banner">
            Здесь перечислены только «поддерживаемые» атрибуты; значения оружия/снаряжения будут работать только для атрибутов из этого списка.
          </div>

          <div v-if="availableCoreStatsToAdd.length > 0" style="margin-top: 18px;">
            <h3 class="section-title">Быстрое добавление (поддерживаемые атрибуты)</h3>
            <div style="display:flex; flex-wrap: wrap; gap: 10px;">
              <button
                  v-for="s in availableCoreStatsToAdd"
                  :key="s.id"
                  class="ea-btn ea-btn--glass-cut"
                  :style="{ '--ea-btn-accent': s.unit === 'percent' ? 'var(--ea-gold)' : 'var(--ea-purple)' }"
                  @click="addCoreModifierDef(s.id)"
              >{{ s.label }} повышение</button>
            </div>
          </div>

          <h3 class="section-title" style="margin-top: 18px;">Список атрибутов (можно сортировать перетаскиванием)</h3>

          <div v-if="misc.modifierDefs.length === 0" class="empty-hint">
            Нет атрибутов, используйте «Быстрое добавление» выше
          </div>

          <draggable v-model="misc.modifierDefs" :item-key="(item) => item.id" handle=".drag-handle" :animation="150">
            <template #item="{ element }">
              <div class="editor-row" style="align-items:center;">
                <div class="drag-handle" style="cursor: grab; color:#666; font-family: monospace;">≡</div>
                <div class="flex-grow">
                  <div class="form-grid" style="grid-template-columns: 1fr 160px 110px; gap: 12px; align-items:end;">
                    <div class="form-group">
                      <label>Название</label>
                      <input v-model="element.label" type="text" />
                    </div>
                    <div class="form-group">
                      <label>Единицы</label>
                      <div class="unit-badge" :class="element.unit">
                        {{ element.unit === 'percent' ? 'Процент (%)' : 'Фиксированное число' }}
                      </div>
                    </div>
                    <div class="form-group">
                      <label>Действие</label>
                      <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="removeModifierDef(element.id)">Удалить</button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <div v-else-if="miscSection === 'weapon_table'" class="form-section">
          <h3 class="section-title">Таблица значений модификаторов оружия</h3>
          <div class="info-banner">
            Здесь настраиваются значения для разных уровней (1-9) и размеров (большой/средний/малый).
          </div>

          <div v-if="modifierDefs.length === 0" class="empty-hint">
            Нет атрибутов, сначала добавьте их в разделе «Все атрибуты».
          </div>

          <div class="weapon-table-list">
            <div v-for="def in modifierDefs" :key="def.id" class="stat-table-card">
              <div class="stat-header">
                <div class="stat-title-group">
                  <span class="stat-name">{{ def.label }}</span>
                  <span class="stat-unit-badge" :class="def.unit">
            {{ def.unit === 'percent' ? 'Процент (%)' : 'Фиксированное число' }}
          </span>
                </div>
                <div class="stat-id">ID: {{ def.id }}</div>
              </div>

              <div class="stat-body" v-if="ensureWeaponCommonEntry(def.id)">
                <div class="matrix-grid">
                  <div class="matrix-cell header-corner">Уровень</div>
                  <div v-for="lv in 9" :key="`h-${lv}`" class="matrix-cell header-level">{{ lv }}</div>

                  <div class="matrix-cell row-label large">Большой</div>
                  <div v-for="i in 9" :key="`l-${i}`" class="matrix-cell">
                    <input
                        type="number"
                        :step="def.unit === 'percent' ? 0.1 : 1"
                        v-model.number="misc.weaponCommonModifiers[def.id].large[i - 1]"
                        class="matrix-input"
                    />
                  </div>

                  <div class="matrix-cell row-label medium">Средний</div>
                  <div v-for="i in 9" :key="`m-${i}`" class="matrix-cell">
                    <input
                        type="number"
                        :step="def.unit === 'percent' ? 0.1 : 1"
                        v-model.number="misc.weaponCommonModifiers[def.id].medium[i - 1]"
                        class="matrix-input"
                    />
                  </div>

                  <div class="matrix-cell row-label small">Малый</div>
                  <div v-for="i in 9" :key="`s-${i}`" class="matrix-cell">
                    <input
                        type="number"
                        :step="def.unit === 'percent' ? 0.1 : 1"
                        v-model.number="misc.weaponCommonModifiers[def.id].small[i - 1]"
                        class="matrix-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="miscSection === 'equipment_table'" class="form-section">
          <h3 class="section-title">Шаблоны значений аффиксов для снаряжения Ур.70</h3>
          <div class="info-banner">
            Здесь настраиваются шаблоны для брони/перчаток/аксессуаров. На странице редактирования снаряжения (Ур.70) можно одним нажатием применить эти значения к основному аффиксу (без выбора типа модификатора).
          </div>

          <div class="weapon-table-list">
            <div v-for="slotKey in ['armor','gloves','accessory']" :key="`eqtpl_${slotKey}`" class="stat-table-card">
              <div class="stat-header">
                <div class="stat-title-group">
                  <span class="stat-name">
                    {{ slotKey === 'armor' ? 'Броня' : (slotKey === 'gloves' ? 'Перчатки' : 'Аксессуар') }}
                  </span>
                  <span class="stat-unit-badge flat">Значения</span>
                </div>
                <div class="stat-id">Шаблон</div>
              </div>

              <div class="stat-body" v-if="ensureEquipmentTemplate(slotKey)">
                <div class="matrix-grid" style="grid-template-columns: 80px repeat(4, minmax(60px, 1fr));">
                  <div class="matrix-cell header-corner">Аффикс</div>
                  <div class="matrix-cell header-level">Нач.</div>
                  <div class="matrix-cell header-level">Ул.1</div>
                  <div class="matrix-cell header-level">Ул.2</div>
                  <div class="matrix-cell header-level">Ул.3</div>

                  <div class="matrix-cell row-label large">Основной</div>
                  <div v-for="i in 4" :key="`t_${slotKey}_p1_${i}`" class="matrix-cell">
                    <input type="number" step="0.1" v-model.number="misc.equipmentTemplates[slotKey].primary1[i - 1]" class="matrix-input" />
                  </div>

                  <div class="matrix-cell row-label medium">Вторичный</div>
                  <div v-for="i in 4" :key="`t_${slotKey}_p2_${i}`" class="matrix-cell">
                    <input type="number" step="0.1" v-model.number="misc.equipmentTemplates[slotKey].primary2[i - 1]" class="matrix-input" />
                  </div>

                  <div class="matrix-cell row-label small">Основной (один)</div>
                  <div v-for="i in 4" :key="`t_${slotKey}_p1s_${i}`" class="matrix-cell">
                    <input type="number" step="0.1" v-model.number="misc.equipmentTemplates[slotKey].primary1Single[i - 1]" class="matrix-input" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="miscSection === 'equipment_categories'" class="form-section">
          <h3 class="section-title">Категории снаряжения (добавление/удаление/сортировка)</h3>
          <div class="info-banner">При удалении категории снаряжение в ней становится несортированным (категория пуста).</div>

          <div class="add-cat-row" style="display:flex; gap: 10px; margin-bottom: 12px;">
            <input v-model="newEquipmentCategoryName" placeholder="Введите название новой категории..." />
            <button class="ea-btn ea-btn--md ea-btn--fill-success" @click="addEquipmentCategory">Добавить</button>
          </div>

          <draggable v-model="equipmentCategories" :item-key="(item) => item" handle=".drag-handle" :animation="150">
            <template #item="{ element }">
              <div class="editor-row" style="align-items:center;">
                <div class="drag-handle" style="cursor: grab; color:#666; font-family: monospace;">≡</div>
                <div class="flex-grow" style="color:#ddd;">{{ element }}</div>
                <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="deleteEquipmentCategory(element)">Удалить</button>
              </div>
            </template>
          </draggable>
        </div>

        <div v-else-if="miscSection === 'enemy_categories'" class="form-section">
          <h3 class="section-title">Категории врагов (добавление/удаление/сортировка)</h3>
          <div class="info-banner">При удалении категории враги в ней становятся несортированными (категория пуста).</div>

          <div class="add-cat-row" style="display:flex; gap: 10px; margin-bottom: 12px;">
            <input v-model="newEnemyCategoryName" placeholder="Введите название новой категории..." />
            <button class="ea-btn ea-btn--md ea-btn--fill-success" @click="addEnemyCategory">Добавить</button>
          </div>

          <draggable v-model="enemyCategories" :item-key="(item) => item" handle=".drag-handle" :animation="150">
            <template #item="{ element }">
              <div class="editor-row" style="align-items:center;">
                <div class="drag-handle" style="cursor: grab; color:#666; font-family: monospace;">≡</div>
                <div class="flex-grow" style="color:#ddd;">{{ element }}</div>
                <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="deleteEnemyCategory(element)">Удалить</button>
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <div v-else-if="editingMode === 'weapon' && selectedWeapon" class="editor-panel">
        <header class="panel-header">
          <div class="header-left">
            <div class="avatar-wrapper-large" :class="`rarity-${Math.max(3, selectedWeapon.rarity || 3)}-border`" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff; overflow:hidden;">
              <img
                  :key="selectedWeapon.icon || selectedWeapon.id"
                  :src="selectedWeapon.icon || '/weapons/default.webp'"
                  @error="e=>e.target.src='/weapons/default.webp'"
                  style="width:100%; height:100%; object-fit:cover;" />
            </div>
            <div class="header-titles">
              <h1 class="edit-title">{{ selectedWeapon.name }}</h1>
              <span class="id-tag">{{ selectedWeapon.id }}</span>
            </div>
          </div>
          <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="deleteCurrentWeapon">Удалить оружие</button>
        </header>

        <div class="form-section">
          <h3 class="section-title">Основная информация</h3>
          <div class="form-grid three-col">
            <div class="form-group"><label>Имя</label><input v-model="selectedWeapon.name" type="text" /></div>
            <div class="form-group"><label>ID (уникальный)</label><input :value="selectedWeapon.id" @input="updateWeaponId" type="text" /></div>
            <div class="form-group">
              <label>Редкость</label>
              <el-select v-model="selectedWeapon.rarity" size="large" style="width: 100%">
                <el-option :value="6" label="6 ★" />
                <el-option :value="5" label="5 ★" />
                <el-option :value="4" label="4 ★" />
                <el-option :value="3" label="3 ★" />
              </el-select>
            </div>
            <div class="form-group">
              <label>Тип</label>
              <el-select v-model="selectedWeapon.type" size="large" style="width: 100%">
                <el-option v-for="wpn in WEAPON_TYPES" :key="wpn.value" :label="wpn.label" :value="wpn.value" />
              </el-select>
            </div>
            <div class="form-group full-width"><label>Путь к иконке</label><input v-model="selectedWeapon.icon" type="text" /></div>
            <div class="form-group full-width">
              <div class="form-grid" style="gap: 20px;">
                <div class="form-group">
                  <label>Название баффа</label>
                  <input v-model="selectedWeapon.buffName" type="text" />
                </div>
                <div class="form-group">
                  <label>Длительность (с)</label>
                  <input type="number" min="0" step="0.1" v-model.number="selectedWeapon.duration">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Значения оружия</h3>
          <div class="info-banner">
            Первые два слота — общие модификаторы: выберите «атрибут + размер». Третий слот — эксклюзивный бафф оружия: можно добавить несколько атрибутов и заполнить значения для уровней 1–9.
          </div>

          <div class="weapon-seg">
            <div class="weapon-seg-title">
              <span class="seg-bar"></span>
              <span>Общий модификатор 1</span>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 160px; gap: 14px; align-items: end;">
              <div class="form-group">
                <label>Атрибут</label>
                <el-select
                    v-model="selectedWeapon.commonSlots[0].modifierId"
                    size="large"
                    style="width: 100%"
                    placeholder="Выберите"
                >
                  <el-option :value="null" label="(нет)" />
                  <el-option v-for="def in modifierDefs" :key="def.id" :label="def.label" :value="def.id" />
                </el-select>
              </div>
              <div class="form-group">
                <label>Размер</label>
                <el-select v-model="selectedWeapon.commonSlots[0].size" size="large" style="width: 100%">
                  <el-option value="large" label="Большой" />
                  <el-option value="medium" label="Средний" />
                  <el-option value="small" label="Малый" />
                </el-select>
              </div>
            </div>
          </div>

          <div class="weapon-seg">
            <div class="weapon-seg-title">
              <span class="seg-bar"></span>
              <span>Общий модификатор 2</span>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 160px; gap: 14px; align-items: end;">
              <div class="form-group">
                <label>Атрибут</label>
                <el-select
                    v-model="selectedWeapon.commonSlots[1].modifierId"
                    size="large"
                    style="width: 100%"
                    placeholder="Выберите"
                >
                  <el-option :value="null" label="(нет)" />
                  <el-option v-for="def in modifierDefs" :key="def.id" :label="def.label" :value="def.id" />
                </el-select>
              </div>
              <div class="form-group">
                <label>Размер</label>
                <el-select v-model="selectedWeapon.commonSlots[1].size" size="large" style="width: 100%">
                  <el-option value="large" label="Большой" />
                  <el-option value="medium" label="Средний" />
                  <el-option value="small" label="Малый" />
                </el-select>
              </div>
            </div>
          </div>

          <div class="weapon-seg">
            <div class="weapon-seg-title">
              <span class="seg-bar"></span>
              <span>Эксклюзивный бафф</span>
            </div>
            <div class="info-banner">
              Пока обрабатывается как постоянный атрибут (складывается с первыми двумя); в будущем может быть расширен до эффекта с длительностью.
            </div>

            <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px; margin-bottom: 12px;">
              <div style="color:#aaa; font-size: 13px;">
                Название баффа: <span style="color:#ffd700; font-weight:700;">{{ selectedWeapon.buffName || '(не заполнено)' }}</span>
              </div>
              <button class="ea-btn ea-btn--md ea-btn--glass-rect" :style="{ '--ea-btn-accent': 'var(--ea-purple)' }" @click="addWeaponBuffBonusRow">＋ Добавить атрибут</button>
            </div>

            <div v-if="selectedWeapon.buffBonuses && selectedWeapon.buffBonuses.length > 0" class="matrix-editor-area">
              <div
                v-for="(bonus, idx) in selectedWeapon.buffBonuses"
                :key="idx"
                class="editor-row"
                style="align-items: flex-start;"
              >
                <div style="display:flex; flex-direction: column; gap: 10px; width: 100%;">
                  <div class="form-grid" style="grid-template-columns: 1fr 140px; gap: 12px; align-items:end;">
                    <div class="form-group">
                      <label>Атрибут</label>
                      <el-select
                          v-model="bonus.modifierId"
                          size="large"
                          style="width: 100%"
                          placeholder="Выберите"
                      >
                        <el-option :value="null" label="(нет)" />
                        <el-option v-for="def in modifierDefs" :key="def.id" :label="def.label" :value="def.id" />
                      </el-select>
                    </div>
                    <div class="form-group">
                      <label>Действие</label>
                      <button class="ea-btn ea-btn--md ea-btn--fill-danger" @click="removeWeaponBuffBonusRow(idx)">Удалить</button>
                    </div>
                  </div>

                  <div class="form-grid" style="grid-template-columns: repeat(9, minmax(60px, 1fr)); gap: 10px;">
                    <div v-for="lv in 9" :key="lv" class="form-group">
                      <label style="text-align:center;">Ур.{{ lv }}</label>
                      <input type="number" step="0.01" v-model.number="bonus.values[lv - 1]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="empty-hint" style="margin-top: 10px;">
              Нет добавленных эксклюзивных атрибутов
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">Выберите элемент из списка слева</div>
    </main>
  </div>
</template>

<style scoped>
.cms-layout { display: flex; height: 100vh; background-color: #1e1e1e; color: #f0f0f0; overflow: hidden; font-family: 'Segoe UI', Roboto, sans-serif; }

/* Sidebar */
.cms-sidebar { width: 300px; background-color: #252526; border-right: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; background: #1e1e1e; border-bottom: 1px solid #333; }
.sidebar-tabs .ea-btn { flex: 1 1 90px; min-width: 90px; justify-content: center; height: 34px; padding: 0 10px; font-size: 12px; }
.sidebar-tabs .ea-btn--glass-cut { clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); }

.sidebar-header { padding: 15px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #2b2b2b; }
.sidebar-header h2 { margin: 0; font-size: 16px; color: #ffd700; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
.search-box { padding: 10px; border-bottom: 1px solid #333; background: #252526; }
.search-box input {
  width: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
  background: #16161a;
  border: none;
  box-shadow: 0 0 0 1px #333 inset;
  color: #fff;
  border-radius: 0;
  font-size: 13px;
  transition: box-shadow 0.2s, background-color 0.2s;
}
.search-box input:focus {
  box-shadow: 0 0 0 1px #ffd700 inset;
  outline: none;
  background-color: #1f1f24;
}
.enemy-group { margin-bottom: 15px; border: 1px solid #2b2b2b; border-radius: 6px; padding: 6px; background: #1a1a1a; }
.group-title { font-size: 11px; color: #ccc; font-weight: bold; text-transform: uppercase; padding: 6px 8px; background: #242424; border-radius: 4px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; column-gap: 8px; }
.group-meta { display: flex; align-items: center; gap: 8px; }
.group-count { color: #999; font-size: 12px; }
.toggle-arrow { transition: transform 0.2s; }
.toggle-arrow.is-rotated { transform: rotate(90deg); }
.add-cat-row input { flex: 1; background: #1a1a1a; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; }

/* Character List */
.char-list { flex-grow: 1; overflow-y: auto; padding: 10px; }
.char-item { display: flex; align-items: center; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; margin-bottom: 4px; border: 1px solid transparent; border-left: 3px solid transparent; padding-left: 8px; }
.char-item:hover { background-color: #2d2d2d; border-color: #444; }
.char-item.active { background-color: #37373d; box-shadow: 0 0 10px rgba(0,0,0,0.2); }
.empty-hint { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }

.avatar-wrapper-small { width: 44px; height: 44px; border-radius: 6px; margin-right: 12px; background: #333; position: relative; overflow: hidden; border: 2px solid #444; flex-shrink: 0; box-sizing: border-box; }
.avatar-wrapper-small[class*="rarity-6-border"] { border: 2px solid transparent; background: linear-gradient(#2b2b2b, #2b2b2b) padding-box, linear-gradient(135deg, #FFD700, #FF8C00, #FF4500) border-box; box-shadow: 0 0 6px rgba(255, 140, 0, 0.3); }
.avatar-wrapper-small img { width: 100%; height: 100%; object-fit: cover; display: block; }
.char-info { display: flex; flex-direction: column; justify-content: center; }
.char-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; color: #f0f0f0; }
.char-meta { font-size: 12px; font-weight: bold; }
.rarity-6 { background: linear-gradient(45deg, #FFD700, #FF8C00, #FF4500); background-clip: text; -webkit-background-clip: text; color: transparent; }
.rarity-5 { color: #ffc400; }
.rarity-4 { color: #d8b4fe; }
.rarity-3, .rarity-2, .rarity-1 { color: #888; }
.char-meta.rarity-6 {
  background: linear-gradient(45deg, #FFD700, #FF8C00, #FF4500);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.char-meta.rarity-5 { color: #ffc400; }
.char-meta.rarity-4 { color: #d8b4fe; }
.char-meta.rarity-3, .char-meta.rarity-2, .char-meta.rarity-1 { color: #aaa; }

/* Sidebar Footer */
.sidebar-footer { padding: 15px; border-top: 1px solid #333; display: flex; flex-direction: column; gap: 10px; background: #2b2b2b; }

/* Main Content */
.cms-content { flex-grow: 1; overflow-y: auto; padding: 30px 40px; background-color: #1e1e1e; }
.editor-panel { max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease; --ea-tier-color: #fff; }

/* Header */
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid #333; padding-bottom: 20px; }
.header-left { display: flex; align-items: center; gap: 20px; }
.avatar-wrapper-large { width: 80px; height: 80px; border-radius: 8px; background: #333; position: relative; overflow: hidden; border: 3px solid #555; box-shadow: 0 4px 8px rgba(0,0,0,0.3); flex-shrink: 0; box-sizing: border-box; }
.avatar-wrapper-large img { width: 100%; height: 100%; object-fit: cover; display: block; }
.header-titles { display: flex; flex-direction: column; gap: 5px; }
.edit-title { margin: 0; font-size: 28px; font-weight: 700; color: #f0f0f0; }
.id-tag { font-size: 14px; color: #666; font-family: 'Roboto Mono', monospace; background: #252526; padding: 2px 8px; border-radius: 4px; border: 1px solid #333; align-self: flex-start; }

/* Tabs */
.cms-tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 2px solid #333; }
.cms-tabs button { background: #252526; border: none; color: #888; padding: 10px 18px; cursor: pointer; border-radius: 6px 6px 0 0; transition: all 0.2s; font-weight: 500; font-size: 13px; display: flex; align-items: center; gap: 6px; border-bottom: 2px solid transparent; }
.cms-tabs button:hover { background: #2d2d2d; color: #ccc; }
.cms-tabs button.active { background: #333; color: #ffd700; font-weight: bold; border-bottom-color: #ffd700; box-shadow: none; }
.cms-tabs button svg { flex-shrink: 0; opacity: 0.7; transition: opacity 0.2s; }
.cms-tabs button.active svg { opacity: 1; }

/* Forms */
.form-section { background: #252526; padding: 25px; border-radius: 0 0 8px 8px; margin-top: -22px; border: 1px solid #333; border-top: none; }
.section-title { font-size: 14px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #333; padding-bottom: 8px; margin: 30px 0 15px 0; }
.section-title:first-child { margin-top: 0; }
.weapon-seg { margin-top: 16px; }
.weapon-seg:first-child { margin-top: 10px; }
.weapon-seg-title { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #ddd; margin-bottom: 10px; }
.weapon-seg-title .seg-bar { width: 4px; height: 18px; background-color: #ffd700; flex-shrink: 0; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px 20px; }
.form-grid.three-col { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.form-group { display: flex; flex-direction: column; }
.form-group.full-width { grid-column: 1 / -1; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 12px; font-weight: 500; }
.form-group input {
  background: #16161a;
  border: none;
  box-shadow: 0 0 0 1px #333 inset;
  color: #f0f0f0;
  padding: 10px 12px;
  border-radius: 0;
  font-size: 14px;
  transition: box-shadow 0.2s, background-color 0.2s;
}
.form-group input:focus {
  box-shadow: 0 0 0 1px #ffd700 inset;
  outline: none;
  background: #1f1f24;
}

:deep(.enemy-tier-select .el-input__inner) {
  color: var(--ea-tier-color) !important;
}

/* Variant Card Style */
.variant-card { background: #2b2b2b; border: 1px solid #444; border-radius: 6px; padding: 15px; margin-bottom: 15px; border-left: 4px solid #ffd700; }
.variant-header { display: flex; justify-content: space-between; margin-bottom: 10px; align-items: center; }
.variant-idx { font-weight: bold; color: #ffd700; font-size: 12px; }

/* Checkbox & Exclusive */
.checkbox-wrapper { background: #1a1a1a; border: 1px solid #444; padding: 0 15px; border-radius: 4px; display: flex; align-items: center; height: 38px; cursor: pointer; transition: all 0.2s; }
.checkbox-wrapper:hover { border-color: #666; }
.checkbox-wrapper.is-checked { border-color: #ffd700; background: rgba(255, 215, 0, 0.05); }
.checkbox-wrapper input { margin-right: 10px; cursor: pointer; width: 16px; height: 16px; accent-color: #ffd700; }
.checkbox-wrapper label { margin: 0; cursor: pointer; color: #ccc; }
.exclusive-list { display: flex; flex-direction: column; gap: 10px; }
.exclusive-row { display: flex; gap: 10px; align-items: center; }
.exclusive-row input {
  background: #16161a;
  border: none;
  box-shadow: 0 0 0 1px #333 inset;
  color: #fff;
  padding: 8px;
  border-radius: 0;
  font-size: 13px;
  transition: box-shadow 0.2s, background-color 0.2s;
}
.exclusive-row input:focus {
  box-shadow: 0 0 0 1px #ffd700 inset;
  outline: none;
  background: #1f1f24;
}
.flex-grow { flex-grow: 1; }
.checkbox-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; background: #1a1a1a; padding: 15px; border-radius: 6px; border: 1px solid #333; margin-bottom: 20px; }
.cb-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #bbb; cursor: pointer; user-select: none; padding: 5px; border-radius: 4px; transition: background 0.1s; }
.cb-item:hover { background: #252526; }
.cb-item input { accent-color: #ffd700; width: 16px; height: 16px; }
.cb-item.exclusive { color: #ffd700; }


/* Matrix Editor */
.matrix-editor-area { margin-top: 25px; border-top: 1px dashed #444; padding-top: 20px; }
.anomalies-grid-editor { display: flex; flex-direction: column; gap: 10px; }
.editor-row { display: flex; flex-wrap: wrap; gap: 10px; background: #1f1f1f; padding: 10px; border-radius: 6px; border: 1px solid #333; align-items: center; }
.card-select { width: 100%; }
:deep(.card-select .el-input__wrapper) { padding: 0 8px; min-height: 24px; }
:deep(.card-select .el-input__inner) { font-size: 12px; height: 24px; line-height: 24px; }

.unit-badge {
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: #1a1a1a;
  border: 1px solid #333;
  color: #666;
  font-size: 13px;
  user-select: none;
  white-space: nowrap;
}

.unit-badge.percent {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.05);
  border-color: rgba(255, 215, 0, 0.2);
}

.unit-badge.flat {
  color: #b37feb;
  background: rgba(179, 127, 235, 0.05);
  border-color: rgba(179, 127, 235, 0.2);
}

.weapon-table-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 10px;
}

.stat-table-card {
  background: #1f1f1f;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
}

.stat-header {
  background: #2b2b2b;
  padding: 8px 15px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-name {
  font-weight: bold;
  color: #f0f0f0;
  font-size: 14px;
}

.stat-unit-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #333;
  color: #aaa;
  text-transform: uppercase;
}

.stat-unit-badge.percent {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.stat-id {
  font-family: monospace;
  font-size: 11px;
  color: #555;
}

.stat-body {
  padding: 15px;
  overflow-x: auto;
}

.matrix-grid {
  display: grid;
  grid-template-columns: 60px repeat(9, minmax(50px, 1fr));
  gap: 1px;
  background: #333;
  border: 1px solid #333;
}

.matrix-cell {
  background: #16161a;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
}

.matrix-cell.header-corner {
  background: #252526;
  color: #888;
  font-size: 11px;
  font-weight: bold;
}

.matrix-cell.header-level {
  background: #252526;
  color: #aaa;
  font-size: 12px;
  font-family: monospace;
}

.matrix-cell.row-label {
  font-size: 12px;
  font-weight: bold;
}

.matrix-cell.row-label.large { color: #ff7875; border-left: 3px solid #ff7875; }
.matrix-cell.row-label.medium { color: #ffd700; border-left: 3px solid #ffd700; }
.matrix-cell.row-label.small { color: #69c0ff; border-left: 3px solid #69c0ff; }

.matrix-input {
  width: 100%;
  background: transparent !important;
  border: none !important;
  color: #fff !important;
  text-align: center;
  font-family: 'Roboto Mono', monospace;
  font-size: 13px;
  padding: 0 !important;
  height: 100%;
  box-shadow: none !important;
}

.matrix-input:focus {
  color: #ffd700 !important;
  font-weight: bold;
}

.matrix-cell:focus-within {
  background: #2a2a30;
}
/* === Card Styles === */
.editor-card {
  background: #2b2b2b;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 8px;
  width: 170px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.2s, border-color 0.2s;
}
.editor-card:hover {
  border-color: #777;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #3a3a3a;
  padding-bottom: 4px;
  margin-bottom: 2px;
}
.card-label {
  font-size: 11px;
  color: #888;
  font-family: monospace;
}

.full-width-mb {
  width: 100%;
  margin-bottom: 4px;
}

.card-props-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prop-item.full-span {
  grid-column: span 2;
}

.prop-item label {
  font-size: 10px;
  color: #aaa;
}

.input-with-unit {
  display: flex;
  align-items: center;
  background: #16161a;
  border: none;
  box-shadow: 0 0 0 1px #333 inset;
  border-radius: 0;
  overflow: hidden;
}
.input-with-unit:focus-within {
  box-shadow: 0 0 0 1px #ffd700 inset;
  background: #1f1f24;
}

.mini-input {
  width: 100% !important;
  border: none !important;
  background: transparent !important;
  padding: 2px 4px !important;
  text-align: center;
  color: #fff;
  font-size: 12px;
  height: 20px;
}
.mini-input:focus {
  background: transparent !important;
  outline: none;
}

.unit {
  font-size: 10px;
  color: #666;
  padding-right: 4px;
  background: transparent;
  user-select: none;
}

/* Ticks Editor Area */
.ticks-editor-area { background: #1f1f1f; padding: 15px; border-radius: 6px; border: 1px solid #333; margin-bottom: 20px; }
.tick-row { display: flex; flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 8px; background: #2b2b2b; padding: 10px; border-radius: 4px; border-left: 3px solid #666; }
.tick-top { display: flex; align-items: center; gap: 15px; width: 100%; }
.tick-idx { font-family: monospace; color: #888; font-size: 12px; width: 48px; }
.tick-inputs { display: flex; gap: 15px; flex-grow: 1; flex-wrap: wrap; }
.t-group { display: flex; align-items: center; gap: 6px; }
.t-group label { font-size: 11px; color: #aaa; white-space: nowrap; }
.tick-binding { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.tick-select { width: 100%; }
:deep(.tick-binding label) { font-size: 12px; color: #ccc; font-weight: 600; letter-spacing: 0.2px; }
:deep(.tick-select .el-input__wrapper) { background: #16161a; box-shadow: 0 0 0 1px #333 inset; }

.binding-option { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.binding-option__icon { width: 18px; height: 18px; border-radius: 3px; object-fit: cover; background: #111; box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset; flex: 0 0 auto; }
.binding-option__label { font-size: 12px; color: #e6e6e6; }
.binding-option__hint { font-size: 11px; color: #9aa0a6; margin-left: 4px; white-space: nowrap; opacity: 0.95; }

.empty-ticks-hint { color: #666; font-size: 12px; text-align: center; padding: 10px; font-style: italic; }

.info-banner { background: rgba(50, 50, 50, 0.5); padding: 12px; border-left: 3px solid #666; color: #aaa; margin-bottom: 20px; font-size: 13px; border-radius: 0 4px 4px 0; }
.empty-state { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 400px; color: #666; font-size: 16px; border: 2px dashed #333; border-radius: 8px; margin-top: 20px; }

.attack-seg-toolbar { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid #333; background: #1f1f1f; border-radius: 6px; margin-bottom: 14px; }
.attack-seg-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.attack-seg-toolbar .ea-btn--sm { height: 30px; padding: 0 10px; font-size: 12px; }
.attack-seg-toolbar .ea-btn.active { box-shadow: 0 0 0 1px #ffd700 inset, 0 0 14px rgba(255, 215, 0, 0.15); }
.attack-seg-toolbar .ea-btn--glass-cut { clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); }
.attack-seg-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; color: #aaa; font-size: 12px; }
.attack-seg-meta .meta-item { color: #ccc; font-weight: 600; }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.rarity-6-border { border: 2px solid transparent; background: linear-gradient(#2b2b2b, #2b2b2b) padding-box, linear-gradient(135deg, #FFD700, #FF8C00, #FF4500) border-box; box-shadow: 0 0 6px rgba(255, 140, 0, 0.3); }
.rarity-5-border { border-color: #ffc400; }
.rarity-4-border { border-color: #d8b4fe; }
</style>