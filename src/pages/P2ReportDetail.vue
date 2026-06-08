<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync, loadReport, loadReportIndex, loadSignals, loadDirections } from '../composables/useData.js'
import ReportSidebar from '../components/ReportSidebar.vue'
import ReportToc from '../components/ReportToc.vue'

const route = useRoute()
const router = useRouter()
const date = computed(() => route.params.date)

const { data: reportIndex } = useAsync(loadReportIndex)
const { data: signals } = useAsync(loadSignals)
const { data: directions } = useAsync(loadDirections)

const report = ref(null)
const loading = ref(true)
const error = ref(null)

// 如果没有 date，跳到最新一期；否则加载对应日报
watch([reportIndex, date], async ([idx, d]) => {
  if (!d) {
    if (idx) {
      const latest = [...idx].sort((a, b) => b.issue_no - a.issue_no)[0]
      if (latest) router.replace(`/reports/${latest.date}`)
    }
    return
  }
  loading.value = true
  error.value = null
  try {
    report.value = await loadReport(d)
  } catch (e) {
    error.value = e
    console.error(e)
  } finally {
    loading.value = false
  }
}, { immediate: true })

const signalMap = computed(() => {
  if (!signals.value) return {}
  return Object.fromEntries(signals.value.map(s => [s.id, s]))
})
const directionMap = computed(() => {
  if (!directions.value) return {}
  return Object.fromEntries(directions.value.map(d => [d.id, d]))
})

function getSignal(id) { return signalMap.value[id] }
function getDirection(id) { return directionMap.value[id] }

const platformColors = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  amazon: '#FF9900',
  weibo: '#FF8200',
  kuaishou: '#FF5722',
}

function goDirection(id) {
  if (!id) return
  router.push(`/directions/${encodeURIComponent(id)}`)
}

// ─── 报头 meta 拆 pill ───
// 用 report.meta.data_source 那串『覆盖窗口：xxx → xxx · 数据源：xxx · ...』拆 pill
const headMetaParts = computed(() => {
  const ds = report.value?.meta?.data_source || ''
  // 把 「· 」 split 出大段，再把 「: 」拆出 key/value
  if (!ds) return []
  return ds.split('·').map(s => s.trim()).filter(Boolean).map(seg => {
    const m = seg.match(/^([^：:]+)[：:]\s*(.+)$/)
    if (m) return { key: m[1], val: m[2] }
    return { key: '', val: seg }
  })
})

// 兼容已有数据：body 里有时会重复 label 内容，把 leading 的重复块剥掉
const metaBannerBody = computed(() => {
  const mb = report.value?.meta_banner
  if (!mb?.body) return ''
  // 剥掉 body 开头嵌入的 <div class="mb-label">...</div>
  return mb.body.replace(/^\s*<div class="mb-label">[\s\S]*?<\/div>\s*/, '')
})

const takeawayBody = computed(() => {
  const tk = report.value?.takeaway
  if (!tk?.body) return ''
  let body = tk.body
  // 剥掉 body 开头的 <strong>label</strong> · 这种重复结构
  const lbl = (tk.label || '本期看点').trim()
  const escaped = lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  body = body.replace(new RegExp(`^\\s*<strong>\\s*${escaped}\\s*</strong>\\s*[·•]?\\s*`), '')
  return body
})

// 状态分类工具（统一映射到 st-* 类名）
function statusToStClass(status) {
  return ({
    '采纳': 'st-accept',
    '跟进': 'st-track',
    '部分采纳': 'st-partial',
    '保留': 'st-hold',
    '忽略': 'st-ignore',
    '待反馈': 'st-pending'
  })[status] || ''
}

// 唤醒条件扫描结果 → 颜色 class
function scanClass(scan) {
  if (!scan) return ''
  if (/已触发|命中/.test(scan)) return 'scan-hit'
  if (/未触发/.test(scan)) return 'scan-miss'
  if (/延后|待/.test(scan)) return 'scan-pending'
  return ''
}

// 唤醒整体判定 → 顶部 verdict 徽章颜色
function verdictClass(verdict) {
  if (!verdict) return ''
  if (/已触发|回流/.test(verdict)) return 'v-hit'
  if (/未触发/.test(verdict)) return 'v-miss'
  return ''
}

// 信号 score level → s-high / s-mid / s-low
function signalScoreLevel(s) {
  if (s.score_label) return `s-${s.score_label}`
  const v = s.score_value
  const m = s.score_max || 22
  if (v == null) return ''
  const ratio = v / m
  if (ratio >= 0.6) return 's-high'
  if (ratio >= 0.4) return 's-mid'
  return 's-low'
}

// ─── 回顶 ───
const showBackTop = ref(false)
function onScroll() {
  showBackTop.value = window.scrollY > 500
}
function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="wrap p2">
    <div v-if="loading" class="loading">加载日报中…</div>
    <div v-else-if="error" class="loading">加载失败：{{ error.message }}</div>

    <div v-else-if="report" class="layout">

      <!-- ============ 左：历史日报 sidebar ============ -->
      <aside class="left">
        <ReportSidebar :current-date="date" />
      </aside>

      <!-- ============ 中：主区 ============ -->
      <main class="content">

        <!-- report header -->
        <div class="report-head">
          <div class="kicker">{{ report.title }}</div>
          <h1>{{ report.page_title || `第 ${report.issue_no} 期 · ${report.date}` }}</h1>
          <div class="rh-meta" v-if="headMetaParts.length">
            <template v-for="(p, i) in headMetaParts" :key="i">
              <span v-if="i > 0" class="sep">·</span>
              <template v-if="p.key">
                <span>{{ p.key }}</span>
                <span class="pill">{{ p.val }}</span>
              </template>
              <template v-else>
                <span>{{ p.val }}</span>
              </template>
            </template>
          </div>
        </div>

        <!-- meta-banner + takeaway 并排 -->
        <div class="duo" v-if="report.meta_banner || report.takeaway">
          <div v-if="report.meta_banner" class="meta-banner">
            <div v-if="report.meta_banner.label" class="mb-label">{{ report.meta_banner.label }}</div>
            <div class="mb-body" v-html="metaBannerBody"></div>
          </div>
          <div v-if="report.takeaway" class="takeaway">
            <div class="tk-label">{{ report.takeaway.label || '本期看点' }}</div>
            <div class="tk-body" v-html="takeawayBody"></div>
          </div>
        </div>

        <!-- stat-strip -->
        <div v-if="report.stats?.length" class="stat-strip">
          <div v-for="(s, i) in report.stats" :key="i" class="cell">
            <div :class="['num', { zero: s.num === 0 || s.num === '0' }]">{{ s.num }}</div>
            <div class="lbl">{{ s.label }}</div>
          </div>
        </div>

        <!-- ===== A · 现状概况 ===== -->
        <section v-if="report.sections?.A">
          <h2 class="section anchor-pad" id="section-a">
            <span class="badge">A</span>
            {{ report.sections.A.title }}
            <span v-if="report.sections.A.subtitle" class="sub">{{ report.sections.A.subtitle }}</span>
          </h2>

          <!-- 本期 A 区作废时显示 empty_reason -->
          <div
            v-if="!report.sections.A.buckets?.length && report.sections.A.empty_reason"
            class="empty-section"
          >
            <div class="es-body" v-html="report.sections.A.empty_reason"></div>
          </div>

          <template v-for="(bucket, bi) in report.sections.A.buckets" :key="bi">
            <h3 v-if="bucket.title" class="bucket">
              {{ bucket.title }}
              <span v-if="bucket.signal_ids?.length" class="bk-count">{{ bucket.signal_ids.length }} 信号</span>
            </h3>
            <template v-for="sid in (bucket.signal_ids || [])" :key="sid">
              <!-- landscape card（信号有 platform 字段时） -->
              <div
                v-if="getSignal(sid)?.platform"
                :class="['l-card', getSignal(sid).platform]"
                :style="{ '--platform': platformColors[getSignal(sid).platform] || 'var(--muted)' }"
              >
                <div class="l-head">
                  <span class="l-dot"></span>
                  <span class="l-name">{{ getSignal(sid).platform_label }}</span>
                  <span class="l-date">{{ getSignal(sid).platform_date }}</span>
                </div>
                <div class="l-feature">{{ getSignal(sid).feature_headline }}</div>
                <div class="l-body" v-html="getSignal(sid).summary"></div>
                <div v-if="getSignal(sid).metrics?.length" class="l-metrics">
                  <span v-for="(m, mi) in getSignal(sid).metrics" :key="mi" class="l-metric">{{ m }}</span>
                </div>
                <div v-if="getSignal(sid).why_matters" class="l-impact" v-html="getSignal(sid).why_matters"></div>
                <div v-if="getSignal(sid).source_urls?.length" class="l-src">
                  <template v-for="(u, ui) in getSignal(sid).source_urls" :key="ui">
                    <span v-if="ui > 0"> · </span>
                    <a :href="u.url" target="_blank" rel="noopener noreferrer">{{ u.name }} ↗</a>
                  </template>
                </div>
              </div>

              <!-- 原有 card（无 platform 字段时，向后兼容旧信号） -->
              <div v-else-if="getSignal(sid)" class="card">
                <div class="head">
                  <div class="id">{{ getSignal(sid).id }}</div>
                  <div class="title">{{ getSignal(sid).title }}</div>
                  <div
                    v-if="getSignal(sid).score_value != null"
                    :class="['score', signalScoreLevel(getSignal(sid))]"
                  >
                    {{ getSignal(sid).score_value }} / {{ getSignal(sid).score_max }}
                  </div>
                </div>
                <div class="source" v-if="getSignal(sid).source_label || getSignal(sid).source_urls?.length">
                  <span v-if="getSignal(sid).source_label">来源：{{ getSignal(sid).source_label }}</span>
                  <template v-for="(u, ui) in (getSignal(sid).source_urls || [])" :key="ui">
                    · <a :href="u.url" target="_blank" rel="noopener">{{ u.name }} ↗</a>
                  </template>
                </div>
                <div class="summary" v-html="getSignal(sid).summary"></div>
                <div v-if="getSignal(sid).why_matters" class="why" v-html="getSignal(sid).why_matters"></div>
              </div>
            </template>
          </template>
        </section>

        <!-- ===== B · 真·新方向 ===== -->
        <section v-if="report.sections?.B">
          <h2 class="section anchor-pad" id="section-b">
            <span class="badge b-b">B</span>
            {{ report.sections.B.title }}
            <span v-if="report.sections.B.subtitle" class="sub">{{ report.sections.B.subtitle }}</span>
          </h2>

          <div v-if="report.sections.B.empty_reason" class="empty-section">
            <div class="es-body" v-html="report.sections.B.empty_reason"></div>
          </div>

          <div
            v-for="did in (report.sections.B.new_direction_ids || [])"
            :key="did"
            class="card direction-card"
            @click="goDirection(did)"
          >
            <template v-if="getDirection(did)">
              <div class="head">
                <div class="id">{{ did }}</div>
                <div class="title">{{ getDirection(did).name }}</div>
                <div
                  v-if="getDirection(did).score?.total != null"
                  class="score s-high"
                >
                  {{ getDirection(did).score.total }} / {{ getDirection(did).score.max }}
                </div>
              </div>
              <div class="source" v-if="getDirection(did).status || getDirection(did).priority || getDirection(did).effort">
                <span v-if="getDirection(did).status" :class="['st', statusToStClass(getDirection(did).status)]" style="margin-right:6px;">{{ getDirection(did).status }}</span>
                <span v-if="getDirection(did).priority">{{ getDirection(did).priority }}</span>
                <span v-if="getDirection(did).effort"> · Effort {{ getDirection(did).effort }}</span>
              </div>
              <div v-if="getDirection(did).form_description" class="summary">{{ getDirection(did).form_description }}</div>
            </template>
          </div>
        </section>

        <!-- ===== C · 跟进方向的新输入 ===== -->
        <section v-if="report.sections?.C">
          <h2 class="section anchor-pad" id="section-c">
            <span class="badge b-c">C</span>
            {{ report.sections.C.title }}
            <span v-if="report.sections.C.subtitle" class="sub">{{ report.sections.C.subtitle }}</span>
          </h2>

          <div
            v-for="(fu, fi) in (report.sections.C.followups || [])"
            :key="fi"
            class="followup"
            @click="goDirection(fu.direction_id)"
          >
            <div class="fu-title">{{ fu.title }}</div>
            <div v-if="fu.linked_note" class="fu-target">{{ fu.linked_note }}</div>
            <div v-if="fu.input" class="fu-input" v-html="fu.input"></div>
          </div>

          <!-- 第 1 期『持续观察』兼容 -->
          <div v-if="report.sections.C.items_legacy_watch?.length" class="watch-grid">
            <div v-for="(it, ii) in report.sections.C.items_legacy_watch" :key="ii" class="watch-item">
              <div class="wi-row">
                <div class="wi-text" v-html="it.text"></div>
                <div v-if="it.score" class="wi-score">{{ it.score }}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== D · 唤醒条件落地 ===== -->
        <section v-if="report.sections?.D">
          <h2 class="section anchor-pad" id="section-d">
            <span class="badge b-d">D</span>
            {{ report.sections.D.title }}
            <span v-if="report.sections.D.subtitle" class="sub">{{ report.sections.D.subtitle }}</span>
          </h2>

          <p v-if="report.sections.D.intro" class="section-intro">{{ report.sections.D.intro }}</p>

          <div
            v-for="(wu, wi) in (report.sections.D.wakeups || [])"
            :key="wi"
            class="wakeup"
            @click="goDirection(wu.direction_id)"
          >
            <div class="wu-head">
              <div class="wu-title">{{ wu.title }}</div>
              <div class="wu-head-right">
                <span
                  v-if="wu.verdict"
                  :class="['wu-verdict', verdictClass(wu.verdict)]"
                >{{ wu.verdict }}</span>
                <div v-if="wu.score_summary" class="wu-score-line">{{ wu.score_summary }}</div>
              </div>
            </div>
            <div class="wu-cond">
              <span class="wc-label">唤醒条件（任一命中即回流）</span>
              <ol>
                <li v-for="(c, ci) in wu.conditions" :key="ci">
                  <template v-if="typeof c === 'string'">{{ c }}</template>
                  <template v-else>
                    <div class="wc-row">
                      <span class="wc-text">{{ c.text }}</span>
                      <span
                        v-if="c.scan"
                        :class="['wc-scan', scanClass(c.scan)]"
                      >{{ c.scan }}</span>
                    </div>
                    <div v-if="c.note" class="wc-note">{{ c.note }}</div>
                  </template>
                </li>
              </ol>
            </div>
            <div
              v-if="wu.monitor_freq || wu.data_sources || wu.next_scan || wu.conclusion"
              class="wu-meta"
            >
              <span v-if="wu.monitor_freq"><span class="mk">监测频次：</span>{{ wu.monitor_freq }}</span>
              <span v-if="wu.next_scan"><span class="mk">下次扫描：</span>{{ wu.next_scan }}</span>
              <span v-if="wu.data_sources"><span class="mk">数据源：</span>{{ wu.data_sources }}</span>
              <span v-if="wu.conclusion" class="wu-conclusion"><span class="mk">结论：</span>{{ wu.conclusion }}</span>
            </div>
          </div>

          <!-- 早期 D 区其实是 watch-list 兼容 -->
          <div v-if="report.sections.D.items?.length" class="watch-grid">
            <div v-for="(it, ii) in report.sections.D.items" :key="ii" class="watch-item">
              <div class="wi-row">
                <div class="wi-text" v-html="it.text"></div>
                <div v-if="it.score" class="wi-score">{{ it.score }}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== E · 持续观察 ===== -->
        <section v-if="report.sections?.E">
          <h2 class="section anchor-pad" id="section-e">
            <span class="badge b-e">E</span>
            {{ report.sections.E.title }}
            <span v-if="report.sections.E.subtitle" class="sub">{{ report.sections.E.subtitle }}</span>
          </h2>

          <!-- E 区作废时显示 empty_reason -->
          <div
            v-if="!report.sections.E.items?.length && report.sections.E.empty_reason"
            class="empty-section"
          >
            <div class="es-body" v-html="report.sections.E.empty_reason"></div>
          </div>

          <div v-if="report.sections.E.items?.length" class="watch-grid">
            <div
              v-for="(it, ii) in report.sections.E.items"
              :key="ii"
              class="watch-item"
            >
              <div class="wi-row">
                <div class="wi-text" v-html="it.text"></div>
                <div v-if="it.score" class="wi-score">{{ it.score }}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== F · 标尺自校 ===== -->
        <section v-if="report.sections?.F">
          <h2 class="section anchor-pad" id="section-f">
            <span class="badge b-f">F</span>
            {{ report.sections.F.title }}
            <span v-if="report.sections.F.subtitle" class="sub">{{ report.sections.F.subtitle }}</span>
          </h2>

          <div
            v-for="(blk, bi) in (report.sections.F.blocks || [])"
            :key="bi"
            class="calib-block"
          >
            <h4 v-if="blk.title">{{ blk.title }}</h4>
            <p v-if="blk.body" v-html="blk.body.replace(/\n\n/g, '</p><p>')"></p>
            <table v-if="blk.table" class="status-table">
              <thead>
                <tr><th v-for="(h, hi) in blk.table.headers" :key="hi" :class="{ 'num-col': hi > 0 }">{{ h }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in blk.table.rows" :key="ri">
                  <td v-for="(c, ci) in row" :key="ci" :class="{ 'num-col': ci > 0 }">{{ c }}</td>
                </tr>
              </tbody>
            </table>
            <ul v-if="blk.bullets?.length">
              <li v-for="(b, bli) in blk.bullets" :key="bli" v-html="b"></li>
            </ul>
          </div>
        </section>

        <!-- 反馈提示 -->
        <footer v-if="report.feedback_prompts?.length" class="report-footer">
          <h2 class="section anchor-pad" id="section-feedback">
            <span class="badge">?</span>
            待 PM 反馈
            <span class="sub">{{ report.feedback_prompts.length }} 个决策点</span>
          </h2>
          <div class="decisions">
            <div v-for="(fp, fi) in report.feedback_prompts" :key="fi" class="decision">
              <div class="dec-priority">P{{ fp.priority }}</div>
              <div class="dec-q">{{ fp.topic }}</div>
              <div v-if="fp.options?.length" class="dec-opts">
                <span v-for="(opt, oi) in fp.options" :key="oi" class="dec-opt">{{ opt }}</span>
              </div>
            </div>
          </div>
        </footer>

      </main>

      <!-- ============ 右：TOC ============ -->
      <aside class="toc" v-if="report">
        <ReportToc :report="report" />
      </aside>
    </div>

    <!-- 回顶 -->
    <button
      v-show="showBackTop"
      class="back-top show"
      aria-label="回到顶部"
      @click="backToTop"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 3v8M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* ============================================================
   .wrap.p2 容器
   ============================================================ */
.wrap.p2 {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 32px 96px;
}

/* ─── 三栏主结构 ─── */
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 220px;
  gap: 36px;
  padding-top: 24px;
  align-items: start;
}

/* ─── 左 / 右 aside 容器 ─── */
aside.left {
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 88px);
  overflow: auto;
  padding-right: 4px;
}
aside.left::-webkit-scrollbar { width: 6px; }
aside.left::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }

aside.toc {
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 88px);
  overflow: auto;
}

main.content {
  min-width: 0;
}

/* ─── report header ─── */
.report-head {
  padding-bottom: 18px;
  margin-bottom: 20px;
  border-bottom: 2px solid var(--fg);
}
.report-head .kicker {
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--accent); font-weight: 700;
  margin-bottom: 6px;
}
.report-head h1 {
  font-size: 30px; line-height: 1.15; margin: 0 0 8px;
  font-weight: 700; letter-spacing: -0.015em;
}
.report-head .rh-meta {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  color: var(--muted); font-size: 12.5px;
}
.report-head .rh-meta .sep { color: var(--line); }
.report-head .rh-meta .pill {
  background: var(--card);
  border: 1px solid var(--line);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--fg);
}

/* ─── duo · meta-banner + takeaway 并排 ─── */
.duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;
}
@media (max-width: 1080px) { .duo { grid-template-columns: 1fr; } }

.meta-banner {
  background: var(--purple-soft);
  border: 1px solid var(--purple);
  border-radius: 12px;
  padding: 20px 22px;
  font-size: 13.5px;
  line-height: 1.65;
}
.meta-banner .mb-label {
  font-weight: 700; color: var(--purple); font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase;
  margin-bottom: 10px;
}
.meta-banner .mb-body {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--fg);
}
.meta-banner .mb-body :deep(strong) { color: var(--purple); font-weight: 600; }
.meta-banner .mb-body :deep(br) { display: block; margin-bottom: 4px; content: ""; }

.takeaway {
  background: var(--info-soft);
  border: 1px solid transparent;
  border-left: 4px solid var(--info);
  border-radius: 8px;
  padding: 20px 22px;
  font-size: 13.5px;
  line-height: 1.65;
}
.takeaway .tk-label {
  font-weight: 700; color: var(--info); font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase;
  margin-bottom: 10px;
}
.takeaway .tk-body {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--fg);
}
.takeaway .tk-body :deep(strong) { color: var(--info); font-weight: 600; }

/* ─── stat-strip ─── */
.stat-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  margin-bottom: 32px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.stat-strip .cell {
  padding: 14px 18px;
  border-right: 1px solid var(--line);
}
.stat-strip .cell:last-child { border-right: none; }
.stat-strip .num {
  font-size: 26px; font-weight: 700; line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.stat-strip .num.zero { color: var(--muted); }
.stat-strip .lbl {
  font-size: 12px; color: var(--muted); margin-top: 6px;
}

/* ─── 章节头 ─── */
.anchor-pad { scroll-margin-top: 80px; }
h2.section {
  font-size: 20px;
  margin: 40px 0 14px;
  display: flex; align-items: baseline; gap: 12px;
  border-top: 1px solid var(--line);
  padding-top: 28px;
}
section:first-of-type h2.section { border-top: none; padding-top: 0; margin-top: 8px; }
h2.section .badge {
  font-size: 11px;
  background: var(--accent);
  color: #fff;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
h2.section .sub { font-size: 13px; color: var(--muted); font-weight: 400; }
h2.section .badge.b-b { background: var(--high); }
h2.section .badge.b-c { background: var(--info); }
h2.section .badge.b-d { background: var(--purple); }
h2.section .badge.b-e { background: var(--mid); }
h2.section .badge.b-f { background: var(--accent); }

.section-intro {
  font-size: 12.5px;
  color: var(--muted);
  margin: 0 0 12px;
  line-height: 1.6;
}

/* ─── bucket 副标题 ─── */
h3.bucket {
  font-size: 13px;
  margin: 22px 0 10px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.02em;
  border-left: 3px solid var(--accent);
  padding-left: 10px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
h3.bucket .bk-count {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}

/* ─── A 区 · landscape card ─── */
.l-card {
  background: var(--card);
  border: 1px solid color-mix(in srgb, var(--platform, var(--muted)) 24%, var(--line));
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  position: relative;
}
.l-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.l-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--platform, var(--muted));
}
.l-name {
  font-size: 13px;
  font-weight: 700;
  flex: 0 0 auto;
}
.l-date {
  font-size: 12px;
  color: var(--muted);
  margin-left: auto;
}
.l-feature {
  font-size: 17px;
  font-weight: 800;
  margin-bottom: 8px;
  line-height: 1.42;
  text-wrap: balance;
}
.l-body {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.66;
  margin-bottom: 10px;
}
.l-body :deep(strong) { color: var(--fg); }
.l-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.l-metric {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--platform, var(--muted)) 10%, transparent);
  color: var(--platform, var(--muted));
}
.l-impact {
  font-size: 13px;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--info-soft);
  line-height: 1.6;
}
.l-impact :deep(strong) { color: var(--info); }
.l-src {
  font-size: 11px;
  color: var(--muted);
  margin-top: 8px;
}
.l-src a {
  color: var(--info);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--info) 35%, transparent);
}
.l-src a:hover { border-bottom-color: var(--info); }

/* ─── A 区 · signal card ─── */
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 16px;
}
.card.direction-card { cursor: pointer; transition: border-color .12s; }
.card.direction-card:hover { border-color: var(--accent); }

.card .head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 4px;
}
.card .head .id {
  flex: 0 0 auto;
  font-size: 11px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--muted);
  background: var(--tag-bg);
  padding: 3px 7px;
  border-radius: 4px;
  margin-top: 3px;
  letter-spacing: 0.02em;
}
.card .head .title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.005em;
}
.card .head .score {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.card .head .score.s-high { background: var(--high-soft); color: var(--high); }
.card .head .score.s-mid  { background: var(--mid-soft);  color: var(--mid); }
.card .head .score.s-low  { background: var(--low-soft);  color: var(--low); }

.card .source {
  font-size: 11.5px;
  color: var(--muted);
  margin-bottom: 12px;
  line-height: 1.5;
}
.card .source a {
  color: var(--muted);
  text-decoration: none;
  border-bottom: 1px dashed var(--line);
}
.card .source a:hover { color: var(--accent); border-bottom-color: var(--accent); }

.card .summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--fg);
}
.card .summary :deep(strong) { font-weight: 600; }

.card .why {
  font-size: 13px;
  color: var(--muted);
  background: var(--info-soft);
  border-left: 3px solid var(--info);
  padding: 11px 14px;
  border-radius: 0 6px 6px 0;
  margin-top: 14px;
  line-height: 1.65;
}
.card .why::before {
  content: "对微博的含义";
  display: block;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--info);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 6px;
}
.card .why :deep(strong) { color: var(--fg); font-weight: 600; }

/* ─── B 区 · empty-section ─── */
.empty-section {
  background: var(--low-soft);
  border: 1px dashed var(--line);
  border-radius: 12px;
  padding: 20px 22px;
  margin-bottom: 12px;
}
.empty-section .es-body {
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.7;
}
.empty-section .es-body :deep(.es-headline) {
  font-size: 15px;
  font-weight: 700;
  color: var(--fg);
  margin-bottom: 10px;
  display: block;
}
.empty-section .es-body :deep(.es-body) { display: contents; }
.empty-section .es-body :deep(strong) { color: var(--fg); font-weight: 600; }
.empty-section .es-body :deep(p) { margin: 0 0 10px; }
.empty-section .es-body :deep(p:last-child) { margin-bottom: 0; }

/* ─── C 区 · followup ─── */
.followup {
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 4px solid var(--info);
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 16px;
  cursor: pointer;
  transition: border-color .12s;
}
.followup:hover { border-color: var(--info); }
.followup .fu-title {
  font-size: 14.5px;
  font-weight: 600;
  margin-bottom: 4px;
  line-height: 1.4;
  color: var(--fg);
}
.followup .fu-target {
  font-size: 11.5px;
  color: var(--info);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  margin-bottom: 12px;
  letter-spacing: 0.01em;
  opacity: 0.85;
}
.followup .fu-input {
  font-size: 14px;
  color: var(--fg);
  line-height: 1.7;
}
.followup .fu-input :deep(strong) { font-weight: 600; }

/* ─── D 区 · wakeup ─── */
.wakeup {
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 4px solid var(--purple);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color .12s;
}
.wakeup:hover { border-color: var(--purple); }
.wakeup .wu-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.wakeup .wu-title { font-size: 14.5px; font-weight: 600; line-height: 1.4; }
.wakeup .wu-score-line {
  font-size: 11.5px;
  color: var(--purple);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.wakeup .wu-cond {
  font-size: 13px;
  color: var(--fg);
  margin-top: 8px;
  padding: 12px 14px;
  background: var(--purple-soft);
  border-radius: 8px;
  line-height: 1.6;
}
.wakeup .wu-cond .wc-label {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--purple);
  font-weight: 700;
  margin-bottom: 8px;
  display: block;
}
.wakeup .wu-cond ol { margin: 0; padding-left: 20px; }
.wakeup .wu-cond ol li { margin-bottom: 4px; }
.wakeup .wu-cond ol li:last-child { margin-bottom: 0; }
.wakeup .wu-meta {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.wakeup .wu-meta .mk { color: var(--fg); font-weight: 500; }

/* 富对象条件：wc-row + wc-text + wc-scan + wc-note */
.wakeup .wu-cond ol li .wc-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.wakeup .wu-cond ol li .wc-text {
  flex: 1;
  min-width: 0;
}
.wakeup .wu-cond ol li .wc-scan {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 3px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.wakeup .wu-cond ol li .wc-scan.scan-hit {
  background: var(--high-soft);
  color: var(--high);
}
.wakeup .wu-cond ol li .wc-scan.scan-miss {
  background: var(--low-soft);
  color: var(--low);
}
.wakeup .wu-cond ol li .wc-scan.scan-pending {
  background: var(--mid-soft);
  color: var(--mid);
}
.wakeup .wu-cond ol li .wc-note {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.5;
  padding-left: 0;
}

/* wu-head 拆出右侧分栏（verdict + score_summary） */
.wakeup .wu-head .wu-head-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: 0 0 auto;
}
.wakeup .wu-verdict {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.wakeup .wu-verdict.v-hit {
  background: var(--high);
  color: #fff;
}
.wakeup .wu-verdict.v-miss {
  background: var(--low-soft);
  color: var(--low);
}

.wakeup .wu-meta .wu-conclusion {
  color: var(--fg);
  font-weight: 500;
}

/* ─── E 区 · watch-grid ─── */
.watch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 1080px) { .watch-grid { grid-template-columns: 1fr; } }

.watch-item {
  font-size: 13px;
  padding: 12px 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 3px solid var(--mid);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.6;
}
.watch-item .wi-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.watch-item .wi-text { flex: 1; }
.watch-item .wi-text :deep(strong) { font-weight: 600; }
.watch-item .wi-score {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--mid);
  padding-top: 2px;
  font-variant-numeric: tabular-nums;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}

/* ─── F 区 · 标尺自校 ─── */
.calib-block {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 12px;
}
.calib-block h4 {
  font-size: 14px;
  margin: 0 0 10px;
  color: var(--accent);
  font-weight: 700;
}
.calib-block p { margin: 0 0 8px; font-size: 13.5px; line-height: 1.65; }
.calib-block p :deep(strong) { font-weight: 600; }
.calib-block ul {
  margin: 8px 0 0;
  padding-left: 0;
  list-style: none;
  font-size: 13px;
  color: var(--muted);
}
.calib-block li {
  margin-bottom: 8px;
  padding-left: 16px;
  position: relative;
  line-height: 1.6;
}
.calib-block li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 9px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.calib-block li :deep(strong) { color: var(--fg); font-weight: 600; }

.status-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  margin-top: 10px;
  font-variant-numeric: tabular-nums;
}
.status-table th,
.status-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}
.status-table th {
  color: var(--muted);
  font-weight: 600;
  font-size: 11.5px;
  background: var(--card-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.status-table td.num-col,
.status-table th.num-col { text-align: right; }

/* ─── 决策卡 ─── */
.decisions { display: grid; gap: 12px; }
.decision {
  background: var(--card);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
  border-radius: 12px;
  padding: 20px;
}
.dec-priority {
  font-size: 11px; font-weight: 800; color: #fff;
  background: var(--accent); padding: 3px 10px;
  border-radius: 4px; display: inline-block; margin-bottom: 8px;
}
.dec-q { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.dec-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.dec-opt {
  font-size: 12px; padding: 6px 12px; border-radius: 6px;
  background: var(--tag-bg); color: var(--fg); font-weight: 600;
  border: 1px solid var(--line);
}

/* ─── report footer · 反馈优先级 ─── */
.report-footer {
  margin-top: 50px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.7;
}
.report-footer .rf-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  margin-bottom: 8px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.report-footer ul { margin: 0; padding-left: 18px; }
.report-footer strong { color: var(--fg); font-weight: 600; }
.report-footer .rf-options {
  color: var(--info);
  margin-left: 4px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

/* ─── 回顶 ─── */
.back-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--card);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  cursor: pointer;
  box-shadow: 0 4px 14px -6px rgba(0,0,0,.15);
  z-index: 30;
  transition: opacity .2s, transform .2s, color .12s, border-color .12s;
}
.back-top:hover { color: var(--accent); border-color: var(--accent); }

/* ─── responsive ─── */
@media (max-width: 1200px) {
  .layout { grid-template-columns: 240px minmax(0, 1fr); }
  aside.toc { display: none; }
}
@media (max-width: 900px) {
  .wrap.p2 { padding: 0 16px 80px; }
  .layout { grid-template-columns: 1fr; gap: 24px; }
  aside.left { position: static; max-height: none; }
}
</style>
