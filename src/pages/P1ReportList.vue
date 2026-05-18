<script setup>
import { computed } from 'vue'
import { useAsync, loadReportIndex } from '../composables/useData.js'

const { data: reports, loading, error } = useAsync(loadReportIndex)

const sortedReports = computed(() => {
  if (!reports.value) return []
  return [...reports.value].sort((a, b) => b.issue_no - a.issue_no)
})

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').trim()
}
</script>

<template>
  <div>
    <header class="page-header">
      <div class="kicker">微博音频 · 灵感日报</div>
      <h1>历史日报</h1>
      <div class="meta">v1.5 标尺，已跑 {{ sortedReports.length }} 期</div>
    </header>

    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="error" class="loading">加载失败：{{ error.message }}</div>

    <div v-else class="report-list">
      <router-link
        v-for="r in sortedReports"
        :key="r.date"
        :to="`/reports/${r.date}`"
        class="report-card"
      >
        <div class="card-head">
          <span class="issue">第 {{ r.issue_no }} 期</span>
          <span class="date">{{ r.date }}</span>
          <span class="ruler">{{ r.version_ruler }}</span>
        </div>
        <div class="card-stats">
          <template v-for="s in r.stats" :key="s.label">
            <span class="stat-pill">
              <strong>{{ s.num }}</strong> {{ s.label }}
            </span>
          </template>
        </div>
        <div v-if="r.takeaway_short" class="card-takeaway">
          {{ stripHtml(r.takeaway_short) }}
        </div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  border-bottom: 2px solid var(--fg);
  padding-bottom: 20px;
  margin-bottom: 28px;
}
.kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 6px;
}
.page-header h1 {
  font-size: 28px;
  margin: 0 0 6px;
  letter-spacing: -0.01em;
}
.page-header .meta {
  color: var(--muted);
  font-size: 13px;
}

.report-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.report-card {
  display: block;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px 20px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, transform 0.15s;
}
.report-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.card-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.card-head .issue {
  font-size: 18px;
  font-weight: 700;
}
.card-head .date {
  font-size: 13px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.card-head .ruler {
  font-size: 11px;
  background: var(--tag-bg);
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: auto;
}

.card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--muted);
}
.stat-pill strong {
  color: var(--fg);
  font-size: 14px;
  margin-right: 4px;
}

.card-takeaway {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  border-left: 2px solid var(--line);
  padding-left: 10px;
  margin-top: 8px;
}
</style>
