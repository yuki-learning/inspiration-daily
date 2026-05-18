<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAsync, loadDirections } from '../composables/useData.js'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { isEditor } = useAuth()

const { data: directions, loading } = useAsync(loadDirections)

const wakeupDirections = computed(() => {
  if (!directions.value) return []
  return directions.value
    .filter(d => d.status === '保留' && d.wakeup_conditions?.length > 0)
    .sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1))
})

// 总条件数（顶部 meta-strip 用）
const totalConditions = computed(() =>
  wakeupDirections.value.reduce((acc, d) => acc + (d.wakeup_conditions?.length || 0), 0)
)

// 最近扫描日（取所有 wakeup_meta.last_scanned 里最近的一个）
const lastScanned = computed(() => {
  let max = null
  for (const d of wakeupDirections.value) {
    const ls = d.wakeup_meta?.last_scanned
    if (ls && (!max || ls > max)) max = ls
  }
  return max
})

function goDirection(id) {
  router.push(`/directions/${encodeURIComponent(id)}`)
}

// "新入池" badge 判定
function isNewInPool(scanResult) {
  if (!scanResult) return false
  return /新入池/.test(scanResult)
}

// 扫描结果是否表达"未触发/无变化"
function isUntriggered(scanResult) {
  if (!scanResult) return false
  return /未触发|无变化/.test(scanResult)
}
</script>

<template>
  <div class="wrap p5">
    <div v-if="loading" class="loading">加载中…</div>

    <div v-else-if="wakeupDirections.length === 0" class="empty-state">
      <div class="es-headline">唤醒池为空</div>
      <div>当前没有 status=保留 的方向。</div>
    </div>

    <template v-else>
      <!-- 元信息条 -->
      <div class="meta-strip">
        <div class="ms-line">
          <b>{{ wakeupDirections.length }}</b> 条保留方向<span class="sep">·</span>共
          <b>{{ totalConditions }}</b> 条唤醒条件<span class="sep">·</span>最近扫描
          <b>{{ lastScanned || '—' }}</b>
        </div>
        <button
          class="scan-btn"
          :disabled="!isEditor"
          :title="isEditor ? '点击触发一次扫描' : '编辑模式可用'"
        >
          <span class="sb-icon">↻</span> 立即扫描一次
          <span v-if="!isEditor" class="sb-locked">· 编辑模式</span>
        </button>
      </div>

      <!-- 顶部提示 -->
      <div class="hint">
        <span class="h-mark">⚑ 工作机制</span>
        <div class="h-body">
          下方每条方向都是上期被你打"<strong>保留</strong>"的方向。每条都配套一组<strong>唤醒条件</strong>——<strong>任一命中</strong>即从保留池回流到下期"今日可做"，按当时的标尺重新打分。每期跑日报前来扫一遍。
        </div>
      </div>

      <!-- 保留方向列表 -->
      <div class="pool-list">
        <article
          v-for="d in wakeupDirections"
          :key="d.id"
          class="pool-card"
        >
          <div class="pc-head">
            <span class="pc-id" @click="goDirection(d.id)" style="cursor:pointer;">{{ d.id }}</span>
            <span class="pc-name" @click="goDirection(d.id)" style="cursor:pointer;">{{ d.name }}</span>
            <div class="pc-chips">
              <span class="st st-hold">保留</span>
              <span
                v-if="d.score?.total != null"
                class="pc-score"
              >{{ d.score.total }}<span class="denom">/{{ d.score.max }}</span></span>
              <span v-else class="pc-score none">—<span class="denom">/22</span></span>
              <span v-if="d.wakeup_meta?.monitor_freq" class="pc-freq">
                监测 <b>{{ d.wakeup_meta.monitor_freq }}</b>
              </span>
            </div>
          </div>

          <div v-if="d.form_description" class="pc-desc">
            {{ d.form_description }}
          </div>

          <div class="pc-conds-label">
            <span class="cl-title">唤醒条件 · {{ d.wakeup_conditions.length }} 条</span>
            <span class="cl-status">未命中 <b>{{ d.wakeup_conditions.length }}</b> / {{ d.wakeup_conditions.length }}</span>
          </div>

          <ol class="cond-list">
            <li v-for="(c, i) in d.wakeup_conditions" :key="i">
              <span class="cl-check"></span>
              <span class="cl-num"></span>
              <span class="cl-body">{{ c }}</span>
            </li>
          </ol>

          <div v-if="d.wakeup_meta" class="pc-meta">
            <div v-if="d.wakeup_meta.data_sources" class="pm-row">
              <span class="pm-key">数据源</span>
              <span class="pm-val">{{ d.wakeup_meta.data_sources }}</span>
            </div>
            <div v-if="d.wakeup_meta.last_scanned" class="pm-row">
              <span class="pm-key">上次扫描</span>
              <span :class="['pm-val', { muted: isUntriggered(d.wakeup_meta.scan_result) }]">
                {{ d.wakeup_meta.last_scanned }}
                <span v-if="isNewInPool(d.wakeup_meta.scan_result)" class="badge-new">新入池</span>
                <template v-else-if="d.wakeup_meta.scan_result"> · {{ d.wakeup_meta.scan_result }}</template>
              </span>
            </div>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap.p5 {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 40px 96px;
}

/* ─── 顶部元信息条 ─── */
.meta-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0 18px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.meta-strip .ms-line {
  font-size: 12.5px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  line-height: 1.6;
}
.meta-strip .ms-line b {
  color: var(--fg);
  font-weight: 700;
}
.meta-strip .ms-line .sep {
  color: var(--line);
  margin: 0 6px;
}

.scan-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--muted);
  cursor: not-allowed;
  user-select: none;
  font-weight: 500;
  font-family: inherit;
}
.scan-btn:not(:disabled) {
  color: var(--fg);
  cursor: pointer;
}
.scan-btn:not(:disabled):hover {
  border-color: var(--purple);
  color: var(--purple);
}
.scan-btn .sb-icon {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}
.scan-btn .sb-locked {
  font-size: 10.5px;
  color: var(--muted);
  opacity: 0.7;
  margin-left: 4px;
  letter-spacing: 0.05em;
}

/* ─── hint banner ─── */
.hint {
  background: var(--card-soft);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 18px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.6;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.hint .h-mark {
  flex: 0 0 auto;
  color: var(--purple);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.hint .h-body strong { color: var(--fg); font-weight: 600; }

/* ─── 保留方向列表 ─── */
.pool-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pool-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 4px solid var(--purple);
  border-radius: 12px;
  padding: 20px 22px;
}

/* 卡片头 */
.pc-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.pc-id {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 22px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.02em;
  line-height: 1;
  transition: color .12s;
}
.pc-id:hover { color: var(--accent); }
.pc-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--fg);
  transition: color .12s;
}
.pc-name:hover { color: var(--accent); }
.pc-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-wrap: wrap;
}
.pc-score {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  padding: 3px 9px;
  border-radius: 4px;
  background: var(--purple-soft);
  color: var(--purple);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}
.pc-score .denom { font-weight: 500; opacity: 0.65; }
.pc-score.none {
  color: var(--muted);
  background: var(--low-soft);
}
.pc-freq {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--tag-bg);
  color: var(--muted);
  letter-spacing: 0.02em;
}
.pc-freq b {
  color: var(--fg);
  font-weight: 600;
}

/* 描述 */
.pc-desc {
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 16px;
  max-width: 820px;
}

/* 唤醒条件标签栏 */
.pc-conds-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 10px;
}
.pc-conds-label .cl-title {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--purple);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.pc-conds-label .cl-status {
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.pc-conds-label .cl-status b {
  color: var(--fg);
  font-weight: 600;
}

/* 条件列表 */
ol.cond-list {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  counter-reset: cd;
}
ol.cond-list li {
  counter-increment: cd;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px 10px 10px;
  border-radius: 6px;
  transition: background .12s;
}
ol.cond-list li:hover { background: var(--purple-soft); }
ol.cond-list li + li { margin-top: 2px; }

ol.cond-list .cl-check {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border: 1.5px solid var(--line);
  border-radius: 4px;
  background: var(--bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  opacity: 0.7;
  transition: border-color .12s;
}
ol.cond-list li:hover .cl-check {
  border-color: var(--purple);
  opacity: 1;
}
ol.cond-list .cl-num {
  flex: 0 0 auto;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--purple);
  width: 18px;
  text-align: center;
  margin-top: 1px;
}
ol.cond-list .cl-num::after { content: counter(cd); }
ol.cond-list .cl-body {
  flex: 1;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--fg);
}
ol.cond-list .cl-body :deep(strong) { font-weight: 600; }

/* 底部元信息 */
.pc-meta {
  padding-top: 14px;
  border-top: 1px dashed var(--line);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 24px;
  font-size: 12px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.pc-meta .pm-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  line-height: 1.5;
}
.pc-meta .pm-key {
  color: var(--muted);
  opacity: 0.85;
  letter-spacing: 0.02em;
  flex: 0 0 auto;
}
.pc-meta .pm-val { color: var(--fg); }
.pc-meta .pm-val.muted { color: var(--muted); }
.pc-meta .pm-val .badge-new {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  background: var(--purple-soft);
  color: var(--purple);
  font-size: 10px;
  border-radius: 3px;
  letter-spacing: 0.04em;
}

/* responsive */
@media (max-width: 720px) {
  .wrap.p5 { padding: 16px 16px 80px; }
  .pc-meta { grid-template-columns: 1fr; }
  .pc-chips { margin-left: 0; }
}
</style>
