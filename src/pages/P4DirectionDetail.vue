<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync, loadDirections, loadSignals, loadReportIndex } from '../composables/useData.js'

const route = useRoute()
const router = useRouter()
const id = computed(() => decodeURIComponent(route.params.id))

const { data: directions, loading } = useAsync(loadDirections)
const { data: signals } = useAsync(loadSignals)
const { data: reportIndex } = useAsync(loadReportIndex)

const direction = computed(() => {
  if (!directions.value) return null
  return directions.value.find(d => d.id === id.value)
})

const signalMap = computed(() => {
  if (!signals.value) return {}
  return Object.fromEntries(signals.value.map(s => [s.id, s]))
})

const directionMap = computed(() => {
  if (!directions.value) return {}
  return Object.fromEntries(directions.value.map(d => [d.id, d]))
})

// 时间线：archive_entries 按日期降序，第一条作为 current（最近）
const sortedEntries = computed(() => {
  if (!direction.value?.archive_entries) return []
  return [...direction.value.archive_entries].sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  )
})

// 跨多少期日报
const issueSpan = computed(() => {
  const s = new Set(sortedEntries.value.map(e => e.issue_no).filter(Boolean))
  return s.size
})

// 状态变化条目识别：note 里含 "→" 或 "由...转" 等
function isStatusChange(note) {
  if (!note) return false
  return /[→]|由[^，。]{1,8}转|状态变更|status[\s]*=/.test(note)
}

const STATUS_TO_ST = {
  '采纳': 'st-accept',
  '跟进': 'st-track',
  '部分采纳': 'st-partial',
  '保留': 'st-hold',
  '忽略': 'st-ignore',
  '待反馈': 'st-pending'
}
function statusStClass(s) { return STATUS_TO_ST[s] || '' }

function goDirection(did) {
  if (did === id.value) return
  router.push(`/directions/${encodeURIComponent(did)}`)
}

function signalTitle(sid) {
  return signalMap.value[sid]?.title || sid
}
function directionName(did) {
  return directionMap.value[did]?.name || ''
}

// 信号点击 → 跳到首次出现那期日报；找不到映射时 fallback 跳最新一期
function goSignal(sid) {
  const sig = signalMap.value[sid]
  const issueNo = sig?.issue_no_origin
  const idx = reportIndex.value || []
  let target = idx.find(r => r.issue_no === issueNo)
  if (!target) target = [...idx].sort((a, b) => b.issue_no - a.issue_no)[0]
  if (target) router.push(`/reports/${target.date}`)
}

// 给 note 里出现的 ⑩ → "保留" 的字样加视觉强调（仅渲染时用 v-html，简单包装）
function renderNote(note) {
  if (!note) return ''
  // 把 "由X → Y" 的箭头加视觉
  return note
    .replace(/(由[^，。]{1,12}→[^，。]{1,12})/g, '<strong>$1</strong>')
    .replace(/【[^】]+】|『[^』]+』/g, m => `<strong>${m}</strong>`)
}
</script>

<template>
  <div class="wrap p4">
    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="!direction" class="loading">未找到方向 {{ id }}</div>

    <template v-else>
      <!-- 面包屑 -->
      <div class="crumb">
        <router-link to="/directions">← 返回方向台账</router-link>
      </div>

      <!-- head -->
      <div class="dir-head">
        <div class="dh-row">
          <span class="dh-id">{{ direction.id }}</span>
          <h1>{{ direction.name }}</h1>
          <div class="dh-meta">
            <span :class="['st', statusStClass(direction.status)]">{{ direction.status }}</span>
            <span v-if="direction.priority" class="mono">{{ direction.priority }}</span>
            <span v-if="direction.effort" class="mono">Effort {{ direction.effort }}</span>
          </div>
        </div>
        <div v-if="direction.form_description" class="dh-desc">
          {{ direction.form_description }}
        </div>
      </div>

      <!-- 主体 2 栏 -->
      <div class="dir-layout">

        <!-- 左：时间线 + 唤醒条件 -->
        <main>
          <h2 class="dir-section">
            演进时间线
            <span class="ds-count">
              {{ sortedEntries.length }} 条记录<span v-if="issueSpan"> · 跨 {{ issueSpan }} 期</span>
            </span>
          </h2>
          <div v-if="sortedEntries.length" class="timeline">
            <div
              v-for="(e, i) in sortedEntries"
              :key="i"
              :class="['tl-item', { 'tl-current': i === 0, 'tl-status-change': isStatusChange(e.note) }]"
            >
              <div class="tl-dot"></div>
              <div class="tl-when">
                <span class="tl-date">{{ e.date }}</span>
                <span v-if="e.issue_no" class="tl-issue">第 {{ e.issue_no }} 期</span>
              </div>
              <div class="tl-note" v-html="renderNote(e.note)"></div>
            </div>
          </div>
          <div v-else class="loading" style="text-align:left;padding:14px 0;">暂无演进记录。</div>

          <!-- 唤醒条件 -->
          <template v-if="direction.wakeup_conditions?.length">
            <h2 class="dir-section">
              唤醒条件
              <span class="ds-count">{{ direction.wakeup_conditions.length }} 条 · 任一命中即回流</span>
            </h2>
            <div class="wakeup-block">
              <p class="wb-intro">
                status = 保留 配套字段。任一条件命中即从保留池回流到下期"今日可做"，按当时的标尺重新打分。
              </p>
              <ol class="wb-list">
                <li v-for="(c, i) in direction.wakeup_conditions" :key="i">{{ c }}</li>
              </ol>
              <div v-if="direction.wakeup_meta" class="wb-meta">
                <span v-if="direction.wakeup_meta.monitor_freq">
                  <span class="mk">监测频次：</span>{{ direction.wakeup_meta.monitor_freq }}
                </span>
                <span v-if="direction.wakeup_meta.data_sources">
                  <span class="mk">数据源：</span>{{ direction.wakeup_meta.data_sources }}
                </span>
                <span v-if="direction.wakeup_meta.last_scanned">
                  <span class="mk">最近扫描：</span>{{ direction.wakeup_meta.last_scanned }}<template v-if="direction.wakeup_meta.scan_result"> · {{ direction.wakeup_meta.scan_result }}</template>
                </span>
              </div>
            </div>
          </template>
        </main>

        <!-- 右：元数据 -->
        <aside class="dir-side">

          <!-- 评分卡 -->
          <div v-if="direction.score?.total != null" class="side-card score-card">
            <div class="sc-row">
              <span class="sc-num">{{ direction.score.total }}</span>
              <span class="sc-denom">/ {{ direction.score.max }}</span>
              <span class="sc-ruler">{{ direction.score.ruler_version || 'v1.5' }} 标尺</span>
            </div>
            <div class="sc-status-line">
              <span :class="['st', statusStClass(direction.status)]">{{ direction.status }}</span>
              <span v-if="direction.priority" class="sc-tag">{{ direction.priority }}</span>
              <span v-if="direction.effort" class="sc-tag">Effort {{ direction.effort }}</span>
            </div>
          </div>

          <!-- 元数据 -->
          <div class="side-card">
            <h3>档案元数据</h3>
            <div class="meta-list">
              <div class="ml-row">
                <span class="ml-key">首次出现</span>
                <span class="ml-val">
                  {{ direction.first_appeared }}<template v-if="direction.first_appeared_issue_no"> · 第 {{ direction.first_appeared_issue_no }} 期</template>
                </span>
              </div>
              <div class="ml-row">
                <span class="ml-key">最近更新</span>
                <span class="ml-val">{{ direction.last_updated }}</span>
              </div>
              <div class="ml-row">
                <span class="ml-key">立项方</span>
                <span :class="['ml-val', { muted: !direction.owning_team }]">
                  {{ direction.owning_team || '—（未立项）' }}
                </span>
              </div>
              <div class="ml-row" v-if="direction.priority">
                <span class="ml-key">优先级</span>
                <span class="ml-val">{{ direction.priority }}</span>
              </div>
              <div class="ml-row" v-if="direction.effort">
                <span class="ml-key">工时</span>
                <span class="ml-val">{{ direction.effort }}</span>
              </div>
            </div>
          </div>

          <!-- 关联方向 -->
          <div v-if="direction.related_direction_ids?.length" class="side-card">
            <h3>关联方向</h3>
            <div class="rel-pills">
              <a
                v-for="rid in direction.related_direction_ids"
                :key="rid"
                href="#"
                class="rel-pill"
                @click.prevent="goDirection(rid)"
              >
                {{ rid }}
                <span v-if="directionName(rid)" class="rp-title">{{ directionName(rid) }}</span>
              </a>
            </div>
          </div>

          <!-- 关联信号 -->
          <div v-if="direction.related_signal_ids?.length" class="side-card">
            <h3>关联信号</h3>
            <div class="rel-pills">
              <a
                v-for="sid in direction.related_signal_ids"
                :key="sid"
                href="#"
                class="rel-pill"
                :title="signalTitle(sid)"
                @click.prevent="goSignal(sid)"
              >
                {{ sid }}
                <span class="rp-title">{{ signalTitle(sid) }}</span>
              </a>
            </div>
          </div>

          <!-- 微博独家筹码 -->
          <div v-if="direction.weibo_advantage" class="side-card advantage-card">
            <div class="ac-label">微博独家筹码</div>
            <div class="ac-body">{{ direction.weibo_advantage }}</div>
          </div>

        </aside>

      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap.p4 {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 40px 96px;
}

/* 面包屑 */
.crumb {
  padding: 16px 0 8px;
  font-size: 12.5px;
}
.crumb a {
  color: var(--muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.crumb a:hover { color: var(--accent); }

/* head 一行 */
.dir-head {
  padding: 6px 0 14px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 22px;
}
.dir-head .dh-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.dir-head .dh-id {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 22px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.02em;
}
.dir-head h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.015em;
  line-height: 1.3;
}
.dir-head .dh-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: 4px;
}
.dir-head .dh-meta .mono {
  font-size: 11px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--muted);
  padding: 3px 7px;
  background: var(--tag-bg);
  border-radius: 4px;
  letter-spacing: 0.02em;
}
.dir-head .dh-desc {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
  max-width: 820px;
}

/* 2 栏 */
.dir-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 36px;
  align-items: start;
}
@media (max-width: 1080px) {
  .dir-layout { grid-template-columns: 1fr; }
}

/* section 头 */
h2.dir-section {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  margin: 0 0 14px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
h2.dir-section + h2.dir-section { margin-top: 32px; }
h2.dir-section .ds-count {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: none;
}

/* 时间线 */
.timeline {
  position: relative;
  margin: 0 0 36px;
}
.timeline::before {
  content: "";
  position: absolute;
  left: 7px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: var(--line);
}
.tl-item {
  position: relative;
  padding: 0 0 18px 30px;
}
.tl-item:last-child { padding-bottom: 0; }
.tl-item .tl-dot {
  position: absolute;
  left: 0;
  top: 6px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--bg);
  border: 2px solid var(--purple);
  box-sizing: border-box;
}
.tl-item.tl-current .tl-dot {
  background: var(--purple);
}
.tl-item .tl-when {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  margin-bottom: 4px;
}
.tl-item .tl-when .tl-date {
  color: var(--fg);
  font-weight: 600;
}
.tl-item .tl-when .tl-issue {
  padding: 1px 6px;
  background: var(--tag-bg);
  border-radius: 3px;
  font-size: 10.5px;
  color: var(--muted);
}
.tl-item .tl-note {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--fg);
}
.tl-item .tl-note :deep(strong) { font-weight: 600; }
.tl-item.tl-status-change .tl-note {
  background: var(--purple-soft);
  border-left: 3px solid var(--purple);
  padding: 10px 12px;
  border-radius: 0 6px 6px 0;
}

/* 唤醒条件块 */
.wakeup-block {
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 4px solid var(--purple);
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 24px;
}
.wakeup-block .wb-intro {
  font-size: 12.5px;
  color: var(--muted);
  margin: 0 0 12px;
  line-height: 1.55;
}
.wakeup-block ol.wb-list {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: cond;
}
.wakeup-block ol.wb-list li {
  counter-increment: cond;
  position: relative;
  padding: 10px 12px 10px 36px;
  font-size: 13.5px;
  line-height: 1.6;
  border-radius: 6px;
  transition: background .12s;
}
.wakeup-block ol.wb-list li::before {
  content: counter(cond);
  position: absolute;
  left: 10px;
  top: 10px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--purple-soft);
  color: var(--purple);
  font-size: 11px;
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  border-radius: 50%;
}
.wakeup-block ol.wb-list li:hover {
  background: var(--purple-soft);
}
.wakeup-block ol.wb-list li + li {
  margin-top: 2px;
}
.wakeup-block .wb-meta {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.wakeup-block .wb-meta .mk { color: var(--fg); font-weight: 600; }

/* 右侧栏 */
aside.dir-side {
  position: sticky;
  top: 76px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 18px;
}

/* 评分卡 */
.score-card {
  background: var(--purple-soft);
  border: 1px solid var(--purple);
}
.score-card .sc-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}
.score-card .sc-num {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 38px;
  font-weight: 700;
  line-height: 1;
  color: var(--purple);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.score-card .sc-denom {
  color: var(--purple);
  opacity: 0.55;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.score-card .sc-ruler {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--purple);
  opacity: 0.7;
  margin-left: auto;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.score-card .sc-status-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.score-card .sc-tag {
  font-size: 11px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--purple);
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
}

/* side h3 */
.side-card h3 {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  margin: 0 0 12px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}

/* meta list */
.meta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta-list .ml-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}
.meta-list .ml-row + .ml-row {
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.meta-list .ml-key {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}
.meta-list .ml-val {
  color: var(--fg);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.meta-list .ml-val.muted { color: var(--muted); }

/* 关联 pills */
.rel-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rel-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--card-soft);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--fg);
  text-decoration: none;
  transition: border-color .12s, color .12s;
  cursor: pointer;
}
.rel-pill:hover { border-color: var(--accent); color: var(--accent); }
.rel-pill .rp-title {
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
  color: var(--muted);
  font-size: 11.5px;
  margin-left: 2px;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 微博筹码 */
.advantage-card {
  background: var(--accent-soft);
  border: 1px solid transparent;
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  padding: 12px 14px;
}
.advantage-card .ac-label {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  margin-bottom: 6px;
}
.advantage-card .ac-body {
  font-size: 13px;
  color: var(--fg);
  line-height: 1.55;
}

/* responsive */
@media (max-width: 900px) {
  .wrap.p4 { padding: 0 16px 80px; }
  aside.dir-side { position: static; }
}
</style>
