<script setup>
import { computed } from 'vue'
import { useTimelineStore } from '../stores/timelineStore.js'

const props = defineProps({
  trackId: { type: String, required: false }
})

const store = useTimelineStore()

// ===================================================================================
// Layout constants
// ===================================================================================
const ROW_HEIGHT = 50
const CHART_HEIGHT = 50    // Height fills the track
const BASE_Y = 50          // Baseline at bottom

// ===================================================================================
// Colors & gradients
// ===================================================================================

// Get the element color of the current track's operator
const themeColor = computed(() => {
  if (!props.trackId) return '#00e5ff' // default cyan
  return store.getCharacterElementColor(props.trackId)
})

// Generate a unique gradient ID to avoid style conflicts between tracks
const gradientId = computed(() => `gauge-grad-${props.trackId}`)

// ===================================================================================
// Data calculation
// ===================================================================================

// Get the raw gauge data point sequence
const gaugePoints = computed(() => {
  if (!props.trackId) return []
  return store.calculateGaugeData(props.trackId)
})

const pathData = computed(() => {
  if (gaugePoints.value.length === 0) return ''
  return gaugePoints.value.map(p => {
    const x = store.timeToPx(p.time)
    const ratio = Math.min(p.ratio, 1.0) // Clamp maximum value to 1.0
    const y = BASE_Y - (ratio * CHART_HEIGHT)
    return `${x},${y}`
  }).join(' ')
})

const areaData = computed(() => {
  if (gaugePoints.value.length === 0) return ''
  const pointsStr = pathData.value
  const lastPoint = gaugePoints.value[gaugePoints.value.length - 1]
  const lastX = lastPoint ? store.timeToPx(lastPoint.time) : 0

  // Path closing logic
  return `0,${BASE_Y} ${pointsStr} ${lastX},${BASE_Y}`
})

const fullSegments = computed(() => {
  const segments = []
  const points = gaugePoints.value
  const currentBlockWidth = store.timeBlockWidth

  for (let i = 0; i < points.length - 1; i++) {
    // Determine if two consecutive points are both at full energy
    if (points[i].ratio >= 1 && points[i + 1].ratio >= 1) {
      const x1 = store.timeToPx(points[i].time)
      const x2 = store.timeToPx(points[i + 1].time)
      if (x2 > x1) segments.push({x1, x2})
    }
  }
  return segments
})
</script>

<template>
  <div class="gauge-overlay">
    <svg class="gauge-svg" :height="ROW_HEIGHT" :width="store.totalTimelineWidthPx">

      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="themeColor" stop-opacity="0.2" />
          <stop offset="100%" :stop-color="themeColor" stop-opacity="0" />
        </linearGradient>

        <filter :id="`glow-${trackId}`" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <polyline
          :points="pathData"
          fill="none"
          :stroke="themeColor"
          stroke-width="1"
          stroke-opacity="0.4"
          stroke-linejoin="round"
          stroke-linecap="round"
          class="no-events"
      />

      <line
          v-for="(seg, i) in fullSegments"
          :key="i"
          :x1="seg.x1" :y1="1"
          :x2="seg.x2" :y2="1"
          class="full-gauge-line no-events"
          :stroke="themeColor"
      />

      <line
          v-for="(seg, i) in fullSegments"
          :key="i"
          :x1="seg.x1" :y1="1"
          :x2="seg.x2" :y2="1"
          class="full-gauge-glow no-events"
          :stroke="themeColor"
          :filter="`url(#glow-${trackId})`"
      />
    </svg>
  </div>
</template>

<style scoped>
.gauge-overlay {
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: 0;
  right: 0;
  width: 100%;
  height: auto;
  pointer-events: none;
  z-index: 1;
  overflow: visible;
}

.no-events { pointer-events: none !important; }

.full-gauge-line {
  stroke-width: 2;
  stroke-linecap: round;
  transform: translateY(1px);
  will-change: opacity;
  animation: stroke-opacity 2s ease-in-out infinite alternate;
}

.full-gauge-glow {
  stroke-width: 2;
  filter: drop-shadow(0 0 6px currentColor);
  transform: translateY(1px);
  will-change: opacity, transform;
  animation: glow 2s ease-in-out infinite alternate;
}

@keyframes glow {
  0% {
    opacity: 0;
    transform: scaleY(1);
  }
  100% {
    opacity: 1;
    transform: scaleY(1.2);
  }
}

@keyframes stroke-opacity {
  0% {
    opacity: 0.85;
  }
  100% {
    opacity: 1;
  }
}
</style>
