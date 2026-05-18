<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { commitFiles } from '../composables/useGitLab.js'
import { loadReportIndex, loadDirections, loadSignals, clearCache } from '../composables/useData.js'

const router = useRouter()
const { isEditor, openPatModal } = useAuth()

const DRAFT_KEY = 'INSPIRATION_DAILY_DRAFT_PENDING'
const TOTAL_STEPS = 4

const STEP_DEFS = [
  { n: 1, name: '导入',         sub: 'draft.json' },
  { n: 2, name: '预览',         sub: '渲染整期' },
  { n: 3, name: '状态变化确认',  sub: 'writeback diff' },
  { n: 4, name: '发布',         sub: 'commit' }
]

const STEP_LABELS = {
  1: { next: '继续 → 预览',       prev: null },
  2: { next: '继续 → 状态变化',   prev: '← 回到导入' },
  3: { next: '继续 → 发布',       prev: '← 回到预览' },
  4: { next: '发布到 GitLab',     prev: '← 回到状态变化' }
}

const step = ref(1)
const draft = ref(null)
const importError = ref('')
const manualPasteVisible = ref(false)
const manualPasteText = ref('')
const fileInputEl = ref(null)

const existingReports = ref([])
const existingDirections = ref([])
const existingSignals = ref([])

onMounted(async () => {
  if (!isEditor.value) openPatModal()
  try {
    existingReports.value = await loadReportIndex()
    existingDirections.value = await loadDirections()
    existingSignals.value = await loadSignals()
  } catch (e) {
    console.error('Failed to load existing data:', e)
  }
  // 恢复本地保存的草稿
  const saved = localStorage.getItem(DRAFT_KEY)
  if (saved) {
    try {
      draft.value = JSON.parse(saved)
      step.value = 2
    } catch {}
  }
})

watch(draft, (v) => {
  if (v) localStorage.setItem(DRAFT_KEY, JSON.stringify(v))
}, { deep: true })

// ─── 验证 + 设置 draft ───
function validateAndSetDraft(parsed) {
  if (!parsed.issue_no || !parsed.date || !parsed.version_ruler) {
    throw new Error('缺少必需字段：issue_no / date / version_ruler')
  }
  draft.value = parsed
  importError.value = ''
  step.value = 2
}

/* ============ Step 1 · 导入 ============ */
async function pasteFromClipboard() {
  importError.value = ''
  try {
    if (!navigator.clipboard?.readText) {
      throw new Error('浏览器不支持读剪贴板，请改用下方手动粘贴')
    }
    const text = await navigator.clipboard.readText()
    if (!text || !text.trim()) {
      throw new Error('剪贴板为空。请先复制 JSON 草稿')
    }
    const parsed = JSON.parse(text)
    validateAndSetDraft(parsed)
  } catch (e) {
    importError.value = '解析失败：' + e.message
    manualPasteVisible.value = true
  }
}

function submitManualPaste() {
  importError.value = ''
  try {
    const parsed = JSON.parse(manualPasteText.value)
    validateAndSetDraft(parsed)
    manualPasteText.value = ''
    manualPasteVisible.value = false
  } catch (e) {
    importError.value = '解析失败：' + e.message
  }
}

function triggerFilePick() {
  fileInputEl.value?.click()
}

function onFilePick(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result)
      validateAndSetDraft(parsed)
    } catch (e) {
      importError.value = '文件解析失败：' + e.message
    }
  }
  reader.onerror = () => {
    importError.value = '读取文件失败'
  }
  reader.readAsText(file)
  // reset 以便同一个文件能再选一次
  ev.target.value = ''
}

function urlFetchPlaceholder() {
  importError.value = '从 URL 抓取暂未实现，请改用剪贴板或拖文件。'
}

function discardDraft() {
  if (!confirm('确认放弃这份草稿？不会写入任何东西。')) return
  draft.value = null
  manualPasteText.value = ''
  manualPasteVisible.value = false
  localStorage.removeItem(DRAFT_KEY)
  step.value = 1
}

/* ============ Step 2 · 预览（计算 section 列表） ============ */
const REGION_LABELS = {
  A: '现状概况',
  B: '真·新方向',
  C: '跟进方向的新输入',
  D: '唤醒条件命中检查',
  E: '持续观察',
  F: '标尺自校'
}

const previewSections = computed(() => {
  const d = draft.value
  if (!d?.sections) return []
  return Object.keys(d.sections).filter(k => /^[A-F]$/.test(k)).sort().map(letter => {
    const sec = d.sections[letter]
    let count = ''
    if (letter === 'A') {
      const n = (sec.buckets || []).reduce((acc, b) => acc + (b.signal_ids?.length || 0), 0)
      const bk = sec.buckets?.length || 0
      count = bk > 1 ? `${n} 信号 · ${bk} 桶` : `${n} 信号`
    } else if (letter === 'B') {
      count = sec.new_direction_ids?.length ? `${sec.new_direction_ids.length} 条` : '0 条'
    } else if (letter === 'C') {
      count = sec.followups?.length ? `${sec.followups.length} 条` : '0 条'
    } else if (letter === 'D') {
      count = sec.wakeups?.length ? `${sec.wakeups.length} 条` : (sec.items?.length ? `${sec.items.length} 条` : '0 条')
    } else if (letter === 'E') {
      count = sec.items?.length ? `${sec.items.length} 条` : '0 条'
    } else if (letter === 'F') {
      count = sec.blocks?.length ? `${sec.blocks.length} 块` : '0 块'
    }
    let name = sec.title || REGION_LABELS[letter] || letter
    if (letter === 'B' && sec.new_direction_ids?.length) {
      name = `真·新方向 — ${sec.new_direction_ids.join(' / ')}`
    }
    return { letter, name, count }
  })
})

// step 2 顶部 meta pills（信号 / 新方向 / 跟进 / 唤醒）
const previewMetaPills = computed(() => {
  const d = draft.value
  if (!d?.sections) return []
  const pills = []
  const sigN = (d.sections.A?.buckets || []).reduce((acc, b) => acc + (b.signal_ids?.length || 0), 0)
  if (sigN) pills.push({ num: sigN, label: '信号' })
  if (d.sections.B?.new_direction_ids?.length) {
    pills.push({ num: d.sections.B.new_direction_ids.length, label: '新方向' })
  }
  if (d.sections.C?.followups?.length) {
    pills.push({ num: d.sections.C.followups.length, label: '跟进' })
  }
  if (d.sections.D?.wakeups?.length) {
    pills.push({ num: d.sections.D.wakeups.length, label: '唤醒' })
  }
  return pills
})

/* ============ Step 3 · 状态变化推理 ============ */
const proposedChanges = ref([])
const confirmedChanges = ref({})

function computeChanges() {
  if (!draft.value) return
  const changes = []

  // B 区 · 新方向
  for (const did of draft.value.sections?.B?.new_direction_ids || []) {
    const score = draft.value.sections?.B?.[`score_${did}`] || ''
    changes.push({
      key: `new_dir_${did}`,
      group: 'B',
      groupTitle: 'B 区 · 新方向',
      groupMeta: '写入 directions.json + 初始 status=待反馈',
      dirId: did,
      line: `创建新方向「<strong>${draft.value.sections?.B?.[`name_${did}`] || '（待补充）'}</strong>」，初始 status = <strong>待反馈</strong>${score ? '，评分 ' + score : ''}`,
      src: 'B 区',
      srcClass: '',
      tail: '新方向',
      uncertain: false
    })
  }

  // C 区 · 跟进新输入
  for (const fu of draft.value.sections?.C?.followups || []) {
    if (!fu.direction_id) continue
    changes.push({
      key: `followup_${fu.direction_id}_${draft.value.issue_no}`,
      group: 'C',
      groupTitle: 'C 区 · 跟进方向新输入',
      groupMeta: `追加 archive_entries · ${draft.value.sections.C.followups.length} 条`,
      dirId: fu.direction_id,
      line: `追加档案记录：<strong>${draft.value.date} 新输入</strong>${fu.title ? ' — ' + escapeHtml(stripHtml(fu.title)) : ''}`,
      src: 'C 区',
      srcClass: '',
      tail: 'followup',
      uncertain: false
    })
  }

  // D 区 · 唤醒
  for (const wu of draft.value.sections?.D?.wakeups || []) {
    if (!wu.direction_id) continue
    changes.push({
      key: `wakeup_${wu.direction_id}_${draft.value.issue_no}`,
      group: 'D',
      groupTitle: 'D 区 · 唤醒条件命中',
      groupMeta: '由保留 → 回流为待反馈 · 需你确认',
      dirId: wu.direction_id,
      line: `唤醒条件命中？<strong>${escapeHtml(wu.conditions?.[0] || '检查')}</strong>`,
      src: 'D 区',
      srcClass: 'purple',
      tail: 'wakeup · 触发回流',
      uncertain: true
    })
  }

  proposedChanges.value = changes
  // 默认全选（uncertain 项也默认勾上，让用户自己取消）
  confirmedChanges.value = Object.fromEntries(changes.map(c => [c.key, !c.uncertain]))
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, '') }

// 按 group 聚合 change rows
const groupedChanges = computed(() => {
  const groups = {}
  for (const c of proposedChanges.value) {
    if (!groups[c.group]) groups[c.group] = { title: c.groupTitle, meta: c.groupMeta, rows: [] }
    groups[c.group].rows.push(c)
  }
  return Object.values(groups)
})

function toggleChange(key) {
  confirmedChanges.value[key] = !confirmedChanges.value[key]
}

watch(step, (s) => {
  if (s === 3) computeChanges()
})

/* ============ Step 4 · 发布 ============ */
const publishing = ref(false)
const publishResult = ref(null)
const publishError = ref('')

// 文件列表（用于 step 4 展示）
const fileList = computed(() => {
  const d = draft.value
  if (!d) return []
  const list = [
    { op: 'add', path: `data/reports/${d.date}.json`, note: '新建 · 第 ' + d.issue_no + ' 期日报' },
    { op: 'mod', path: 'data/reports/index.json',     note: '追加索引' }
  ]
  // 判断 directions.json 是否会变
  const willTouchDirs = (
    (d.sections?.B?.new_direction_ids?.length || 0) +
    (d.sections?.C?.followups?.length || 0) +
    (d.sections?.D?.wakeups?.length || 0)
  ) > 0
  if (willTouchDirs) {
    const dirNotes = []
    if (d.sections?.B?.new_direction_ids?.length) dirNotes.push(`${d.sections.B.new_direction_ids.length} 新增`)
    if (d.sections?.C?.followups?.length) dirNotes.push(`${d.sections.C.followups.length} archive`)
    if (d.sections?.D?.wakeups?.length) dirNotes.push(`${d.sections.D.wakeups.length} 唤醒回流`)
    list.push({ op: 'mod', path: 'data/directions.json', note: dirNotes.join(' · ') })
  }
  return list
})

const commitMessage = computed(() => {
  const d = draft.value
  if (!d) return ''
  const parts = []
  if (d.sections?.B?.new_direction_ids?.length) parts.push(`${d.sections.B.new_direction_ids.length} 新方向`)
  if (d.sections?.C?.followups?.length) parts.push(`${d.sections.C.followups.length} 跟进`)
  if (d.sections?.D?.wakeups?.length) parts.push(`${d.sections.D.wakeups.length} 唤醒回流`)
  const tail = parts.length ? ' · ' + parts.join(' + ') : ''
  return `issue#${d.issue_no} · ${d.date} 入库（via H5 向导）${tail}`
})

async function publish() {
  publishing.value = true
  publishError.value = ''
  publishResult.value = null
  try {
    const r = draft.value
    const date = r.date
    const actions = []

    // 1. reports/<date>.json
    actions.push({ action: 'create', file_path: `data/reports/${date}.json`, content: r })

    // 2. reports/index.json
    const newIndexEntry = {
      issue_no: r.issue_no,
      date: r.date,
      title: r.title,
      version_ruler: r.version_ruler,
      stats: r.stats,
      takeaway_short: r.takeaway?.body
        ? (r.takeaway.body.replace(/<[^>]+>/g, '').slice(0, 140) + '…')
        : '',
      file: `reports/${date}.json`
    }
    const updatedIndex = [...existingReports.value, newIndexEntry]
    actions.push({ action: 'update', file_path: 'data/reports/index.json', content: updatedIndex })

    // 3. directions.json
    const updatedDirections = JSON.parse(JSON.stringify(existingDirections.value))

    for (const did of r.sections?.B?.new_direction_ids || []) {
      if (!confirmedChanges.value[`new_dir_${did}`]) continue
      const existing = updatedDirections.find(d => d.id === did)
      if (!existing) {
        updatedDirections.push({
          id: did,
          id_sort_key: parseInt(did.replace(/[^\d]/g, ''), 10) || 99,
          name: '（待补充）',
          status: '待反馈',
          score: { total: null, max: 22, ruler_version: r.version_ruler },
          first_appeared: r.date,
          last_updated: r.date,
          first_appeared_issue_no: r.issue_no,
          archive_entries: [{
            date: r.date,
            issue_no: r.issue_no,
            note: '首次出现于本期 B 区，待补充详情。'
          }],
          wakeup_conditions: [],
          related_direction_ids: [],
          related_signal_ids: []
        })
      }
    }

    for (const fu of r.sections?.C?.followups || []) {
      if (!fu.direction_id) continue
      if (!confirmedChanges.value[`followup_${fu.direction_id}_${r.issue_no}`]) continue
      const d = updatedDirections.find(x => x.id === fu.direction_id)
      if (d) {
        d.archive_entries = d.archive_entries || []
        d.archive_entries.push({
          date: r.date,
          issue_no: r.issue_no,
          note: fu.title + (fu.input ? ' — ' + fu.input.replace(/<[^>]+>/g, '').slice(0, 200) : '')
        })
        d.last_updated = r.date
      }
    }

    for (const wu of r.sections?.D?.wakeups || []) {
      if (!wu.direction_id) continue
      if (!confirmedChanges.value[`wakeup_${wu.direction_id}_${r.issue_no}`]) continue
      const d = updatedDirections.find(x => x.id === wu.direction_id)
      if (d) {
        d.wakeup_conditions = wu.conditions
        d.wakeup_meta = {
          monitor_freq: wu.monitor_freq,
          data_sources: wu.data_sources,
          last_scanned: r.date,
          scan_result: '已配置'
        }
        d.last_updated = r.date
      }
    }

    if (fileList.value.some(f => f.path === 'data/directions.json')) {
      actions.push({ action: 'update', file_path: 'data/directions.json', content: updatedDirections })
    }

    const result = await commitFiles(actions, commitMessage.value)
    publishResult.value = result

    localStorage.removeItem(DRAFT_KEY)
    clearCache()
  } catch (e) {
    publishError.value = e.message
  } finally {
    publishing.value = false
  }
}

function goHome() {
  router.push('/')
}

/* ============ stepper / 行动条 ============ */
function go(n) {
  step.value = Math.max(1, Math.min(TOTAL_STEPS, n))
}

function onNext() {
  // step 4 = 发布
  if (step.value === TOTAL_STEPS) {
    publish()
  } else {
    go(step.value + 1)
  }
}
function onPrev() {
  if (step.value > 1) go(step.value - 1)
}

// step 是否可点（仅在草稿存在时允许跳到 step 2+）
function isStepDisabled(n) {
  if (!draft.value && n > 1) return true
  return false
}
</script>

<template>
  <div class="wrap p6">

    <!-- ─── 编辑模式 banner ─── -->
    <div class="wf-banner">
      <span class="wb-icon">⊕ 编辑模式</span>
      <div class="wb-text">
        <strong>入库今日草稿</strong> · 把桌面客户端跑出的 <span class="mono">report.schema.json</span> 草稿 4 步审完后发布到 GitLab。任意一步可回退，本地 <span class="mono">localStorage</span> 自动兜底。
      </div>
    </div>

    <!-- ─── 步骤指示器 ─── -->
    <div class="stepper">
      <button
        v-for="sd in STEP_DEFS"
        :key="sd.n"
        :class="['step', {
          active: step === sd.n,
          done: step > sd.n
        }]"
        :disabled="isStepDisabled(sd.n)"
        @click="go(sd.n)"
      >
        <span class="s-num">{{ sd.n }}</span>
        <span class="s-label">
          <span class="s-name">{{ sd.name }}</span>
          <span class="s-sub">{{ sd.sub }}</span>
        </span>
      </button>
    </div>

    <!-- 非编辑模式提醒 -->
    <div v-if="!isEditor" class="auth-warning">
      ⚠️ 入库向导需要编辑模式。请先 <a @click="openPatModal">配置 GitLab Token</a>。可以预览前 3 步，发布将不可用。
    </div>

    <!-- ============================
         STEP 1 · 导入
         ============================ -->
    <section v-show="step === 1" class="panel">
      <h2 class="panel-title">
        第 1 步 · 导入草稿
        <span class="pt-meta">JSON · report.schema.json</span>
      </h2>

      <!-- 主入口：剪贴板 -->
      <button class="paste-primary" @click="pasteFromClipboard">
        <span class="pp-icon">⏎</span>
        <span class="pp-text">
          <span class="pp-title">一键从剪贴板导入</span>
          <span class="pp-sub">自动检测合法 JSON · 命中即跳第 2 步预览</span>
        </span>
      </button>

      <!-- 副入口 -->
      <div class="fallback-row">
        <span class="fr-label">或</span>
        <button class="fallback-btn" @click="triggerFilePick">
          <span class="fb-icon">↑</span> 拖入 .json 文件
        </button>
        <button class="fallback-btn" @click="urlFetchPlaceholder">
          <span class="fb-icon">⇒</span> 从 URL 抓取
        </button>
        <input
          ref="fileInputEl"
          type="file"
          accept=".json,application/json"
          style="display:none"
          @change="onFilePick"
        />
      </div>

      <!-- 错误 / 手动粘贴 fallback -->
      <div v-if="importError" class="import-error">{{ importError }}</div>

      <div v-if="manualPasteVisible" class="manual-paste">
        <label>手动粘贴 JSON：</label>
        <textarea
          v-model="manualPasteText"
          rows="10"
          placeholder='{ "issue_no": 5, "date": "2026-05-19", "version_ruler": "v1.5", ... }'
        ></textarea>
        <div class="manual-paste-actions">
          <button class="btn-secondary" @click="manualPasteVisible = false">取消</button>
          <button class="btn-primary" :disabled="!manualPasteText.trim()" @click="submitManualPaste">提交</button>
        </div>
      </div>
      <div v-else style="margin-top:14px;">
        <button class="fallback-btn" style="opacity:0.7;" @click="manualPasteVisible = true">
          <span class="fb-icon">⌨</span> 手动粘贴（剪贴板不可用时）
        </button>
      </div>

      <div class="schema-note" style="margin-top:18px;">
        <span class="sn-ok">✓</span>
        当前 schema 版本：<b>report.schema.json v1.0</b> · 业务实例：微博音频 · 标尺：v1.5
      </div>
    </section>

    <!-- ============================
         STEP 2 · 预览
         ============================ -->
    <section v-show="step === 2" class="panel">
      <h2 class="panel-title">
        第 2 步 · 预览草稿
        <span class="pt-meta">渲染样式 = P2 单期详情</span>
      </h2>

      <div v-if="!draft" class="loading">尚未导入草稿。</div>

      <div v-else class="preview-frame">
        <div class="pf-meta">
          <div class="pf-title">
            {{ draft.page_title || `${draft.date} 灵感日报` }}
            <span class="pf-issue">第 {{ draft.issue_no }} 期 · 草稿</span>
          </div>
          <div class="pf-meta-pills">
            <span
              v-for="(p, i) in previewMetaPills"
              :key="i"
              class="pf-pill"
            ><b>{{ p.num }}</b> {{ p.label }}</span>
          </div>
        </div>

        <div class="pf-section-list">
          <div
            v-for="s in previewSections"
            :key="s.letter"
            class="pf-sec"
            :data-region="s.letter"
          >
            <span class="pf-badge">{{ s.letter }}</span>
            <span class="pf-name">{{ s.name }}</span>
            <span class="pf-count">{{ s.count }}</span>
          </div>
        </div>

        <div class="preview-hint">
          预览完整草稿轮廓（A-F 区视觉效果与正式日报一致）。如发现明显问题（stats 数字错、关联方向错、信号引用错），
          <a href="#" @click.prevent="step = 1">← 回到第 1 步改 JSON</a>；若整份草稿不值得发布，
          <a href="#" style="color:var(--accent)" @click.prevent="discardDraft">放弃此草稿</a>。
        </div>
      </div>
    </section>

    <!-- ============================
         STEP 3 · 状态变化确认
         ============================ -->
    <section v-show="step === 3" class="panel">
      <h2 class="panel-title">
        第 3 步 · 状态变化确认
        <span class="pt-meta">writeback diff to directions.json</span>
      </h2>

      <div v-if="!draft" class="loading">尚未导入草稿。</div>

      <div v-else>
        <div v-if="proposedChanges.length === 0" class="empty-state">
          <div class="es-headline">本期没有方向台账变化</div>
          <div>本期日报只有 A / E / F 区内容，不涉及方向状态修改。</div>
        </div>

        <div v-else class="changes-card">
          <template v-for="grp in groupedChanges" :key="grp.title">
            <div class="change-grp-title">
              {{ grp.title }}
              <span class="cgt-meta">{{ grp.meta }}</span>
            </div>
            <div
              v-for="c in grp.rows"
              :key="c.key"
              :class="['change-row', { checked: confirmedChanges[c.key], uncertain: c.uncertain && !confirmedChanges[c.key] }]"
              @click="toggleChange(c.key)"
            >
              <span class="ck"></span>
              <div class="cr-body">
                <div class="cr-line">
                  <span class="dir-id">{{ c.dirId }}</span>
                  <span v-html="c.line"></span>
                </div>
                <div class="cr-meta">
                  <span :class="['src', c.srcClass]">{{ c.src }}</span>{{ c.tail }}
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="schema-note" style="margin-top:14px;">
          每条勾选会在发布时合并写入 <b>directions.json</b>，并自动追加 <code>archive_entry</code> 时间戳。取消勾选即跳过该写入。
        </div>
      </div>
    </section>

    <!-- ============================
         STEP 4 · 发布
         ============================ -->
    <section v-show="step === 4" class="panel">
      <h2 class="panel-title">
        第 4 步 · 发布到 GitLab
        <span class="pt-meta">一次 commit · 多文件原子提交</span>
      </h2>

      <div v-if="!draft" class="loading">尚未导入草稿。</div>

      <!-- 发布成功 -->
      <div v-else-if="publishResult" class="publish-success">
        <div class="success-icon">✓</div>
        <h3>发布成功！</h3>
        <p>第 {{ draft.issue_no }} 期已入库到 GitLab。</p>
        <p v-if="publishResult.web_url">
          <a :href="publishResult.web_url" target="_blank" rel="noopener">查看 commit ↗</a>
        </p>
        <button class="btn-primary" @click="goHome">回到首页查看</button>
      </div>

      <!-- 发布前 -->
      <div v-else class="publish-card">
        <div class="pub-target">
          <div class="pt-label">目标仓库</div>
          <div class="pt-url">
            gitlab.weibo.cn/yuki/inspiration-daily
            <span class="branch">main</span>
          </div>
        </div>

        <div class="pt-label" style="margin-bottom:8px;">
          即将提交的文件 · {{ fileList.length }} 项
        </div>
        <div class="file-list">
          <div
            v-for="(f, i) in fileList"
            :key="i"
            class="file-row"
          >
            <span :class="['fr-op', f.op]">{{ f.op === 'add' ? '+' : '~' }}</span>
            <span class="fr-path">{{ f.path }}</span>
            <span class="fr-note">{{ f.note }}</span>
          </div>
        </div>

        <div class="commit-msg">
          <div class="cm-label">Commit Message</div>
          <div class="cm-text">{{ commitMessage }}</div>
        </div>
      </div>

      <!-- 自动部署说明 -->
      <div v-if="draft && !publishResult" class="auto-deploy">
        <div class="ad-label">发布后会发生什么</div>
        发布后会自动 commit 到 <span class="mono">gitlab.weibo.cn/yuki/inspiration-daily</span> 的 <span class="mono">main</span> 分支。
        GitLab Pages 检测到 commit 后<strong>约 30–60 秒</strong>重新部署完成，团队成员刷新页面就能看到本期内容。<strong>无需手动通知或分享</strong>。
      </div>

      <div v-if="draft && !publishResult" class="schema-note" style="margin-top:14px;">
        点<b>发布</b> → GitLab API <code>/repository/commits</code> 一次性提交全部文件。失败时本地 draft 保留可重试。
      </div>

      <div v-if="publishError" class="import-error">{{ publishError }}</div>
    </section>

    <!-- ─── 底部行动条（sticky） ─── -->
    <div v-if="draft || step === 1" class="action-bar">
      <span class="ab-progress">第 <b>{{ step }}</b> 步 / 共 {{ TOTAL_STEPS }} 步</span>
      <button
        v-if="step === 2 && draft"
        class="btn btn-danger"
        @click="discardDraft"
      >放弃此草稿</button>
      <button
        class="btn"
        :disabled="step === 1"
        @click="onPrev"
      >{{ STEP_LABELS[step].prev || '← 上一步' }}</button>
      <button
        v-if="!(step === 4 && publishResult)"
        class="btn btn-primary"
        :disabled="!draft || (step === 4 && (!isEditor || publishing))"
        @click="onNext"
      >
        <template v-if="step === 4 && publishing">发布中…</template>
        <template v-else>{{ STEP_LABELS[step].next }}</template>
      </button>
    </div>

  </div>
</template>

<style scoped>
.wrap.p6 {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 40px 140px;
}

/* ─── 工作流 banner ─── */
.wf-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin: 16px 0 18px;
  background: var(--accent-soft);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  font-size: 12.5px;
  line-height: 1.5;
}
.wf-banner .wb-icon {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--accent);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  flex: 0 0 auto;
}
.wf-banner .wb-text { color: var(--fg); }
.wf-banner .wb-text strong { font-weight: 600; }
.wf-banner .wb-text .mono {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--muted);
}

/* ─── 步骤指示器 ─── */
.stepper {
  display: flex;
  gap: 0;
  margin-bottom: 28px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-right: 1px solid var(--line);
  cursor: pointer;
  background: transparent;
  transition: background .12s, color .12s;
  text-align: left;
  border-top: none;
  border-bottom: none;
  border-left: none;
  font-family: inherit;
  color: var(--muted);
  min-width: 0;
}
.step:last-child { border-right: none; }
.step:hover:not(:disabled) { background: var(--card-soft); }
.step:disabled { cursor: not-allowed; opacity: 0.55; }
.step.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.step.done { color: var(--high); }
.step .s-num {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--tag-bg);
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background .12s, color .12s;
}
.step.active .s-num { background: var(--accent); color: #fff; }
.step.done .s-num { background: var(--high); color: #fff; }
.step .s-label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.step .s-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.step.active .s-name { color: var(--accent); }
.step.done .s-name { color: var(--high); }
.step .s-sub {
  font-size: 10.5px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* 非编辑模式提示 */
.auth-warning {
  background: var(--warn-soft);
  color: var(--warn);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  margin: 0 0 18px;
  line-height: 1.5;
}
.auth-warning a {
  color: var(--warn);
  text-decoration: underline;
  cursor: pointer;
  font-weight: 600;
}

/* ─── panel ─── */
.panel-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  margin: 0 0 14px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.panel-title .pt-meta {
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0.02em;
  font-weight: 500;
  color: var(--muted);
}

/* ============ STEP 1 ============ */
.paste-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: 100%;
  padding: 36px 28px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 18px;
  box-shadow: 0 8px 24px -12px rgba(215, 38, 49, 0.45);
  transition: filter .12s, transform .12s;
}
.paste-primary:hover { filter: brightness(1.05); transform: translateY(-1px); }
.paste-primary:active { transform: translateY(0); }
.paste-primary .pp-icon {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 28px;
  line-height: 1;
  opacity: 0.9;
}
.paste-primary .pp-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.paste-primary .pp-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.paste-primary .pp-sub {
  font-size: 12.5px;
  opacity: 0.85;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
}

.fallback-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.fallback-row .fr-label {
  font-size: 11.5px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
}
.fallback-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--muted);
  cursor: pointer;
  font-family: inherit;
  transition: all .12s;
}
.fallback-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.fallback-btn .fb-icon {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}

.import-error {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 6px;
  font-size: 12.5px;
  line-height: 1.5;
}

.manual-paste {
  margin-top: 16px;
  padding: 14px 16px;
  background: var(--card-soft);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.manual-paste label {
  display: block;
  font-size: 11.5px;
  color: var(--muted);
  margin-bottom: 6px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
}
.manual-paste textarea {
  width: 100%;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  resize: vertical;
}
.manual-paste-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.schema-note {
  padding: 12px 14px;
  background: var(--card-soft);
  border-radius: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.schema-note .sn-ok {
  color: var(--high);
  margin-right: 4px;
  font-weight: 700;
}
.schema-note b { color: var(--fg); font-weight: 700; }
.schema-note code {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--line);
  padding: 1px 5px;
  border-radius: 3px;
}

/* ============ STEP 2 ============ */
.preview-frame {
  background: var(--card-soft);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 16px;
}
.preview-frame .pf-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line);
  gap: 12px;
  flex-wrap: wrap;
}
.preview-frame .pf-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--fg);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.preview-frame .pf-title .pf-issue {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
.preview-frame .pf-meta-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.preview-frame .pf-pill {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  padding: 3px 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.preview-frame .pf-pill b { color: var(--accent); font-weight: 700; }

.pf-section-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pf-sec {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.pf-sec .pf-badge {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pf-sec[data-region="B"] .pf-badge { background: var(--high); }
.pf-sec[data-region="C"] .pf-badge { background: var(--info); }
.pf-sec[data-region="D"] .pf-badge { background: var(--purple); }
.pf-sec[data-region="E"] .pf-badge { background: var(--mid); }
.pf-sec[data-region="F"] .pf-badge { background: var(--accent); }
.pf-sec .pf-name { flex: 1; color: var(--fg); font-weight: 600; }
.pf-sec .pf-count {
  font-size: 12px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.preview-hint {
  padding: 12px 14px;
  background: var(--info-soft);
  border-left: 3px solid var(--info);
  border-radius: 0 6px 6px 0;
  font-size: 12.5px;
  color: var(--fg);
  line-height: 1.6;
  margin-top: 14px;
}
.preview-hint a {
  color: var(--info);
  text-decoration: none;
  font-weight: 600;
}
.preview-hint a:hover { text-decoration: underline; }

/* ============ STEP 3 ============ */
.changes-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 0;
  margin-bottom: 14px;
}
.change-grp-title {
  padding: 14px 22px 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.change-grp-title .cgt-meta {
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--muted);
  font-weight: 500;
}
.change-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 22px;
  border-top: 1px solid var(--line);
  cursor: pointer;
  transition: background .12s;
}
.change-row:hover { background: var(--card-soft); }
.change-row .ck {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 1.5px solid var(--line);
  border-radius: 4px;
  background: var(--bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all .12s;
}
.change-row.checked .ck {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.change-row.checked .ck::after {
  content: "✓";
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.change-row.uncertain .ck {
  border-color: var(--mid);
  background: var(--mid-soft);
}
.change-row .cr-body { flex: 1; min-width: 0; }
.change-row .cr-line {
  font-size: 13.5px;
  color: var(--fg);
  line-height: 1.5;
  margin-bottom: 2px;
}
.change-row .cr-line .dir-id {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  color: var(--fg);
  margin-right: 4px;
}
.change-row .cr-line :deep(strong) { font-weight: 600; }
.change-row .cr-meta {
  font-size: 11.5px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.change-row .cr-meta .src {
  color: var(--info);
  padding: 1px 5px;
  background: var(--info-soft);
  border-radius: 3px;
  margin-right: 4px;
}
.change-row .cr-meta .src.purple {
  color: var(--purple);
  background: var(--purple-soft);
}
.change-row.uncertain .cr-meta::after {
  content: "需确认";
  color: var(--mid);
  font-weight: 700;
  margin-left: 8px;
}

/* ============ STEP 4 ============ */
.publish-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 22px 24px;
  margin-bottom: 14px;
}
.pub-target { margin-bottom: 18px; }
.pub-target .pt-label {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  margin-bottom: 6px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.pub-target .pt-url {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
  color: var(--fg);
  padding: 10px 12px;
  background: var(--card-soft);
  border-radius: 6px;
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 8px;
}
.pub-target .pt-url .branch {
  color: var(--accent);
  font-weight: 600;
  padding: 2px 6px;
  background: var(--accent-soft);
  border-radius: 3px;
  font-size: 12px;
}
.publish-card > .pt-label {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}

.file-list {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--fg);
  border-bottom: 1px solid var(--line);
}
.file-row:last-child { border-bottom: none; }
.file-row .fr-op {
  flex: 0 0 auto;
  width: 16px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
}
.file-row .fr-op.add { color: var(--high); }
.file-row .fr-op.mod { color: var(--mid); }
.file-row .fr-path { flex: 1; min-width: 0; }
.file-row .fr-note {
  font-size: 11.5px;
  color: var(--muted);
}

.commit-msg {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
  font-size: 12px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.5;
}
.commit-msg .cm-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10.5px;
  margin-bottom: 4px;
  color: var(--muted);
  font-weight: 700;
}
.commit-msg .cm-text {
  color: var(--fg);
  padding: 6px 10px;
  background: var(--card-soft);
  border-radius: 4px;
}

.auto-deploy {
  margin: 14px 0 0;
  padding: 14px 16px;
  background: var(--card-soft);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.7;
}
.auto-deploy .ad-label {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  margin-bottom: 8px;
  opacity: 0.85;
}
.auto-deploy strong { color: var(--fg); font-weight: 700; }
.auto-deploy .mono {
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--line);
  padding: 1px 5px;
  border-radius: 3px;
}

.publish-success {
  text-align: center;
  padding: 40px 20px;
  background: var(--high-soft);
  border-radius: 12px;
  margin-bottom: 14px;
}
.publish-success .success-icon {
  font-size: 48px;
  color: var(--high);
  margin-bottom: 8px;
  font-weight: 700;
  line-height: 1;
}
.publish-success h3 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--high);
}
.publish-success p { margin: 6px 0; color: var(--fg); }
.publish-success a {
  color: var(--high);
  font-weight: 600;
  text-decoration: none;
}
.publish-success a:hover { text-decoration: underline; }
.publish-success .btn-primary { margin-top: 14px; }

/* ─── 底部行动条 ─── */
.action-bar {
  position: sticky;
  bottom: 16px;
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 6px 18px -10px rgba(0,0,0,.18);
  z-index: 20;
}
.action-bar .ab-progress {
  font-size: 12px;
  color: var(--muted);
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
  margin-right: auto;
}
.action-bar .ab-progress b { color: var(--fg); font-weight: 700; }

.action-bar .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  transition: all .12s;
  font-family: inherit;
}
.action-bar .btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.action-bar .btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-bar .btn.btn-danger {
  color: var(--accent);
  border-color: transparent;
}
.action-bar .btn.btn-danger:hover {
  background: var(--accent-soft);
  border-color: transparent;
}
.action-bar .btn.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.action-bar .btn.btn-primary:hover:not(:disabled) {
  filter: brightness(1.05);
  color: #fff;
}

@media (max-width: 900px) {
  .wrap.p6 { padding: 0 16px 140px; }
  .stepper { flex-wrap: wrap; }
  .step {
    flex: 1 1 50%;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }
  .step:nth-child(odd) { border-right: 1px solid var(--line); }
}
</style>
