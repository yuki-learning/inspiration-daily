<script setup>
import { computed } from 'vue'
import { useAsync, loadReportIndex, loadDirections, loadSignals } from '../composables/useData.js'

const props = defineProps({
  currentDate: { type: String, default: '' }
})

const { data: reports } = useAsync(loadReportIndex)
const { data: directions } = useAsync(loadDirections)
const { data: signals } = useAsync(loadSignals)

const sortedReports = computed(() => {
  if (!reports.value) return []
  return [...reports.value].sort((a, b) => b.issue_no - a.issue_no)
})

// 是否含标尺自校 F 区
function hasCalibration(r) {
  return r.takeaway_short?.includes('标尺自校') || r.takeaway_short?.includes('校准')
}

// stats 压成一行『6 信号 · 0 方向 · 4 跟进』形式
function shortStats(stats) {
  if (!stats?.length) return ''
  const parts = stats.slice(0, 3).map(s => {
    const lbl = (s.label || '')
      .replace(/本期|≥6 分 ·|≥13\/22|—|\s+/g, '')
      .replace('真·新方向', '方向')
      .replace('跟进方向新输入', '跟进')
      .replace('持续观察', '观察')
      .replace('本期入唤醒池', '唤醒')
      .replace('满分 10\/10 信号', '满分')
      .replace('今日可做', '可做')
      .trim()
    return `${s.num} ${lbl}`
  })
  return parts.join(' · ')
}

// 快速跳转的计数
const directionCount = computed(() => directions.value?.length || 0)
const wakeupCount = computed(() =>
  directions.value?.filter(d => d.status === '保留' && d.wakeup_conditions?.length)?.length || 0
)
const signalCount = computed(() => signals.value?.length || 0)
</script>

<template>
  <div class="sidebar-inner">
    <div class="sb-section-title">
      <span>历史日报</span>
      <span class="meta">共 {{ sortedReports.length }} 期</span>
    </div>

    <ul class="issue-list">
      <li v-for="r in sortedReports" :key="r.date">
        <router-link
          :to="`/reports/${r.date}`"
          class="issue-row"
          :class="{ active: r.date === currentDate }"
        >
          <div class="ir-line1">
            <span class="ir-no">第 {{ r.issue_no }} 期</span>
            <span class="ir-sep">·</span>
            <span class="ir-date">{{ r.date }}</span>
            <span v-if="hasCalibration(r)" class="ir-mark" title="含标尺自校 F 区">⚑</span>
          </div>
          <div class="ir-stats">{{ shortStats(r.stats) }}</div>
        </router-link>
      </li>
    </ul>

    <div class="sb-section-title">
      <span>快速跳转</span>
    </div>
    <nav class="sb-quicklinks">
      <router-link to="/directions">
        方向台账 <span class="count">{{ directionCount }}</span>
      </router-link>
      <router-link to="/wakeups">
        唤醒池 <span class="count">{{ wakeupCount }}</span>
      </router-link>
      <span class="qlink-static">
        信号库 <span class="count">{{ signalCount }}</span>
      </span>
    </nav>
  </div>
</template>

<style scoped>
.sidebar-inner {
  font-size: 13px;
}

.sb-section-title {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin: 4px 0 10px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.sb-section-title .meta {
  letter-spacing: 0.02em;
  text-transform: none;
  font-weight: 500;
}

.issue-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.issue-row {
  display: block;
  padding: 8px 12px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  border: 1px solid transparent;
  transition: background .12s, border-color .12s;
}
.issue-row:hover { background: var(--card-soft); }
.issue-row.active {
  background: var(--accent-soft);
  border-color: rgba(215, 38, 49, 0.25);
}

.ir-line1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}
.ir-no {
  font-size: 13px;
  font-weight: 700;
}
.issue-row.active .ir-no { color: var(--accent); }
.ir-sep { color: var(--muted); font-size: 11px; }
.ir-date {
  font-size: 12px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.ir-mark {
  margin-left: auto;
  font-size: 11px;
  color: var(--accent);
  line-height: 1;
}
.ir-stats {
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}
.issue-row.active .ir-stats { color: var(--fg); }

.sb-quicklinks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sb-quicklinks a,
.sb-quicklinks .qlink-static {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--fg);
  text-decoration: none;
  border: 1px solid var(--line);
  background: var(--card);
}
.sb-quicklinks a:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.sb-quicklinks .qlink-static {
  color: var(--muted);
  cursor: default;
}
.sb-quicklinks .count {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
