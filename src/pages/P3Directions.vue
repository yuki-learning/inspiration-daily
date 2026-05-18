<script setup>
import { ref, computed } from 'vue'
import { useAsync, loadDirections, loadReportIndex } from '../composables/useData.js'

const { data: directions, loading, error } = useAsync(loadDirections)
const { data: reportIndex } = useAsync(loadReportIndex)

// ─── 状态 chip 配置（顺序与 mockup 一致） ───
const STATUS_DEFS = [
  { st: 'accept',  status: '采纳' },
  { st: 'track',   status: '跟进' },
  { st: 'partial', status: '部分采纳' },
  { st: 'hold',    status: '保留' },
  { st: 'ignore',  status: '忽略' },
  { st: 'pending', status: '待反馈' }
]

// 筛选：空 set 代表 "无筛选 → 全部显示"
const activeStatuses = ref(new Set())

// status → st-* class (复用 styles.css 全局)
const STATUS_TO_ST = {
  '采纳': 'st-accept',
  '跟进': 'st-track',
  '部分采纳': 'st-partial',
  '保留': 'st-hold',
  '忽略': 'st-ignore',
  '待反馈': 'st-pending'
}
function statusStClass(s) { return STATUS_TO_ST[s] || '' }

// 状态在排序时的数值
const STATUS_ORDER = {
  '采纳': 1, '跟进': 2, '部分采纳': 3, '保留': 4, '忽略': 6, '待反馈': 5
}

// 计数
const statusCounts = computed(() => {
  const m = {}
  if (!directions.value) return m
  for (const d of directions.value) m[d.status] = (m[d.status] || 0) + 1
  return m
})

// 跨多少期日报
const issuesCount = computed(() => reportIndex.value?.length || 0)

// ─── 排序 ───
// 默认：评分倒序；点击列头切换 asc → desc → 清除（回默认）
const sortState = ref({ col: null, dir: null })

function clickSort(col) {
  const s = sortState.value
  if (s.col !== col) sortState.value = { col, dir: 'asc' }
  else if (s.dir === 'asc') sortState.value = { col, dir: 'desc' }
  else sortState.value = { col: null, dir: null }
}

function getSortVal(d, col) {
  if (col === 'id') return d.id_sort_key ?? 99
  if (col === 'status') return STATUS_ORDER[d.status] ?? 99
  if (col === 'score') return d.score?.total
  if (col === 'last') return d.last_updated || ''
}

// ─── 派生：过滤 + 排序 ───
const filtered = computed(() => {
  if (!directions.value) return []
  let rows = directions.value
  if (activeStatuses.value.size > 0) {
    rows = rows.filter(d => activeStatuses.value.has(d.status))
  }
  const { col, dir } = sortState.value
  const sign = dir === 'asc' ? 1 : -1
  const usedCol = col || 'score'
  const usedDir = col ? dir : 'desc' // 默认 score desc
  const usedSign = usedDir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const va = getSortVal(a, usedCol)
    const vb = getSortVal(b, usedCol)
    if (usedCol === 'score') {
      const na = va == null, nb = vb == null
      if (na && nb) return 0
      if (na) return 1
      if (nb) return -1
    }
    if (va < vb) return -1 * usedSign
    if (va > vb) return  1 * usedSign
    return 0
  })
})

// chip 点击：toggle
function toggleStatus(s) {
  const set = new Set(activeStatuses.value)
  if (set.has(s)) set.delete(s)
  else set.add(s)
  activeStatuses.value = set
}
function clearFilter() {
  activeStatuses.value = new Set()
}

// 排序图标
function sortIcon(col) {
  if (sortState.value.col !== col) return '↕'
  return sortState.value.dir === 'asc' ? '↑' : '↓'
}
function sortClass(col) {
  if (sortState.value.col !== col) return ''
  return sortState.value.dir === 'asc' ? 'sort-asc' : 'sort-desc'
}
</script>

<template>
  <div class="wrap p3">
    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="error" class="loading">加载失败：{{ error.message }}</div>

    <main v-else class="content">

      <!-- ─── filter strip ─── -->
      <div
        class="filter-strip"
        :data-any-active="activeStatuses.size > 0 ? '1' : '0'"
      >
        <span class="fs-label">状态</span>
        <button
          v-for="d in STATUS_DEFS"
          :key="d.st"
          :class="['fchip', { 'is-active': activeStatuses.has(d.status) }]"
          :data-st="d.st"
          @click="toggleStatus(d.status)"
        >
          {{ d.status }}
          <span class="fc-num">{{ statusCounts[d.status] || 0 }}</span>
        </button>
        <button
          class="fs-reset"
          :disabled="activeStatuses.size === 0"
          @click="clearFilter"
        >清除筛选</button>
      </div>

      <!-- ─── count line ─── -->
      <div class="count-line">
        <span class="cl-meta"><b>{{ filtered.length }}</b> 条 · v1.5 标尺 · 按评分降序</span>
        <span class="cl-meta cl-issues">跨 {{ issuesCount }} 期日报</span>
      </div>

      <!-- ─── 表格 ─── -->
      <div class="dir-table-wrap">
        <table class="dir-table">
          <thead>
            <tr>
              <th
                :class="['col-id', 'sortable', sortClass('id')]"
                @click="clickSort('id')"
              >ID<span class="sort-ico">{{ sortIcon('id') }}</span></th>
              <th>名称</th>
              <th
                :class="['col-status', 'sortable', sortClass('status')]"
                @click="clickSort('status')"
              >状态<span class="sort-ico">{{ sortIcon('status') }}</span></th>
              <th
                :class="['col-score', 'col-num', 'sortable', sortClass('score')]"
                @click="clickSort('score')"
              >评分<span class="sort-ico">{{ sortIcon('score') }}</span></th>
              <th class="col-first col-date">首次出现</th>
              <th
                :class="['col-last', 'col-date', 'sortable', sortClass('last')]"
                @click="clickSort('last')"
              >最近更新<span class="sort-ico">{{ sortIcon('last') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <router-link
              v-for="d in filtered"
              :key="d.id"
              :to="`/directions/${encodeURIComponent(d.id)}`"
              custom
              v-slot="{ navigate }"
            >
              <tr @click="navigate">
                <td class="col-id"><span class="cell-id">{{ d.id }}</span></td>
                <td>
                  <div class="cell-name">
                    {{ d.name }}
                    <div v-if="d.form_description" class="sub">{{ d.form_description }}</div>
                  </div>
                </td>
                <td><span :class="['st', statusStClass(d.status)]">{{ d.status }}</span></td>
                <td class="col-num">
                  <span :class="['cell-score', { none: d.score?.total == null }]">
                    <template v-if="d.score?.total != null">
                      <b>{{ d.score.total }}</b><span class="denom">/{{ d.score.max }}</span>
                    </template>
                    <template v-else>
                      —<span class="denom">/22</span>
                    </template>
                    <span
                      v-if="d.score?.ruler_version && d.score.ruler_version.startsWith('v1') && !d.score.ruler_version.startsWith('v1.5')"
                      class="v1-tag"
                    >v1</span>
                  </span>
                </td>
                <td class="col-date"><span class="cell-date">{{ d.first_appeared }}</span></td>
                <td class="col-date"><span class="cell-date">{{ d.last_updated }}</span></td>
              </tr>
            </router-link>
          </tbody>
        </table>
      </div>

    </main>
  </div>
</template>

<style scoped>
.wrap.p3 {
  max-width: 1320px;
  margin: 0 auto;
  padding: 24px 40px 96px;
}

main.content { min-width: 0; }

/* ─── filter strip ─── */
.filter-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 0 14px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--line);
}
.filter-strip .fs-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin-right: 4px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}

.fchip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: opacity .12s, background .12s, border-color .12s;
  user-select: none;
  line-height: 1.3;
  font-family: inherit;
}
.fchip .fc-num {
  font-size: 11px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

/* 默认（未选）：浅色描边 + soft 背景 */
.fchip[data-st="accept"]  { background: var(--high-soft);   color: var(--high);   border-color: rgba(30,122,58,0.18); }
.fchip[data-st="track"]   { background: var(--info-soft);   color: var(--info);   border-color: rgba(31,95,181,0.18); }
.fchip[data-st="partial"] { background: var(--mid-soft);    color: var(--mid);    border-color: rgba(184,118,26,0.22); }
.fchip[data-st="hold"]    { background: var(--purple-soft); color: var(--purple); border-color: rgba(112,66,184,0.18); }
.fchip[data-st="ignore"]  { background: var(--low-soft);    color: var(--low);    border-color: rgba(107,107,107,0.18); }
.fchip[data-st="pending"] { background: var(--warn-soft);   color: var(--warn);   border-color: rgba(124,62,0,0.20); }

/* 有任一选中 → 未选项淡化 */
.filter-strip[data-any-active="1"] .fchip:not(.is-active) {
  opacity: 0.32;
}

/* 选中态：加强边框 */
.fchip.is-active {
  box-shadow: inset 0 0 0 1px currentColor;
}
.fchip:hover { filter: brightness(0.98); }

.filter-strip .fs-reset {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: inherit;
}
.filter-strip .fs-reset:hover { color: var(--accent); }
.filter-strip .fs-reset:disabled {
  opacity: 0.35;
  cursor: default;
}

/* ─── count line ─── */
.count-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 0 12px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.count-line .cl-meta {
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.count-line .cl-meta b {
  color: var(--fg);
  font-weight: 700;
}

/* ─── 表格 ─── */
.dir-table-wrap {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.dir-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}

.dir-table thead th {
  text-align: left;
  padding: 12px 14px;
  background: var(--card-soft);
  border-bottom: 1px solid var(--line);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  position: sticky;
  top: 60px;
  z-index: 2;
}
.dir-table thead th::after {
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 1px;
  background: var(--line);
}
.dir-table thead th:first-child { border-top-left-radius: 12px; }
.dir-table thead th:last-child  { border-top-right-radius: 12px; }

.dir-table thead th.col-num,
.dir-table thead th.col-date { text-align: right; }

/* sortable headers */
.dir-table thead th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color .12s;
}
.dir-table thead th.sortable:hover { color: var(--fg); }
.dir-table thead th .sort-ico {
  display: inline-block;
  margin-left: 5px;
  font-size: 9px;
  color: var(--line);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  vertical-align: 1px;
  line-height: 1;
  transition: color .12s;
}
.dir-table thead th.sortable:hover .sort-ico { color: var(--muted); }
.dir-table thead th.sort-asc,
.dir-table thead th.sort-desc { color: var(--fg); }
.dir-table thead th.sort-asc .sort-ico,
.dir-table thead th.sort-desc .sort-ico {
  color: var(--accent);
  font-weight: 700;
  font-size: 11px;
}

.dir-table tbody tr {
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background .1s;
}
.dir-table tbody tr:last-child { border-bottom: none; }
.dir-table tbody tr:hover { background: var(--card-soft); }
.dir-table tbody tr:last-child td:first-child { border-bottom-left-radius: 12px; }
.dir-table tbody tr:last-child td:last-child  { border-bottom-right-radius: 12px; }

/* hover 左 3px 红条 */
.dir-table tbody tr td:first-child {
  position: relative;
}
.dir-table tbody tr td:first-child::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--accent);
  opacity: 0;
  transition: opacity .12s;
}
.dir-table tbody tr:hover td:first-child::before { opacity: 1; }

.dir-table tbody td {
  padding: 14px 14px;
  vertical-align: middle;
  line-height: 1.45;
}

/* 列宽 */
.dir-table .col-id     { width: 80px; }
.dir-table .col-status { width: 110px; }
.dir-table .col-score  { width: 96px; }
.dir-table .col-first  { width: 120px; }
.dir-table .col-last   { width: 120px; }

td.col-num,
td.col-date { text-align: right; }

/* cell content */
.cell-id {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 16px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.cell-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.005em;
  line-height: 1.4;
}
.cell-name .sub {
  font-size: 12px;
  color: var(--muted);
  font-weight: 400;
  margin-top: 3px;
  line-height: 1.45;
}

.cell-score {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cell-score b { font-weight: 700; color: var(--fg); }
.cell-score .denom { color: var(--muted); }
.cell-score.none { color: var(--muted); }
.cell-score .v1-tag {
  display: inline-block;
  font-size: 10px;
  padding: 1px 4px;
  margin-left: 4px;
  background: var(--tag-bg);
  color: var(--muted);
  border-radius: 3px;
  letter-spacing: 0.02em;
  vertical-align: 1px;
}

.cell-date {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--fg);
  white-space: nowrap;
}

/* responsive */
@media (max-width: 1100px) {
  .dir-table .col-first, .dir-table .col-last { width: 110px; }
}
@media (max-width: 900px) {
  .wrap.p3 { padding: 16px 16px 80px; }
  .dir-table-wrap { overflow: auto; }
  .dir-table { min-width: 760px; }
}
</style>
