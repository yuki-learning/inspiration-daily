<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  report: { type: Object, default: null }
})

const SECTION_META = {
  A: { color: '',     label: '现状概况' },
  B: { color: 'b-b',  label: '真·新方向' },
  C: { color: 'b-c',  label: '跟进新输入' },
  D: { color: 'b-d',  label: '专题区' },
  E: { color: 'b-e',  label: '持续观察' },
  F: { color: 'b-f',  label: '标尺自校' }
}

const tocItems = computed(() => {
  if (!props.report?.sections) return []
  return Object.keys(props.report.sections)
    .filter(k => /^[A-F]$/.test(k))
    .sort()
    .map(letter => {
      const sec = props.report.sections[letter]
      const meta = SECTION_META[letter] || {}
      let count = ''
      if (letter === 'A') {
        const n = (sec.buckets || []).reduce((acc, b) => acc + (b.signal_ids?.length || 0), 0)
        const bk = sec.buckets?.length || 0
        count = bk > 1 ? `${n} 信号 · ${bk} 桶` : `${n} 信号`
      } else if (letter === 'B') {
        count = sec.new_direction_ids?.length
          ? `${sec.new_direction_ids.length} 新方向`
          : (sec.empty_reason ? '0 条' : '')
      } else if (letter === 'C') {
        count = sec.followups?.length
          ? `${sec.followups.length} 跟进`
          : (sec.items_legacy_watch?.length ? `${sec.items_legacy_watch.length} 观察` : '')
      } else if (letter === 'D') {
        count = sec.wakeups?.length
          ? `${sec.wakeups.length} 唤醒`
          : (sec.items?.length ? `${sec.items.length} 观察` : '')
      } else if (letter === 'E') {
        count = sec.items?.length ? `${sec.items.length} 观察` : ''
      } else if (letter === 'F') {
        count = sec.blocks?.length ? `${sec.blocks.length} 块` : ''
      }
      return {
        letter,
        title: sec.title || meta.label,
        color: meta.color,
        count,
        anchorId: `section-${letter.toLowerCase()}`
      }
    })
})

const activeLetter = ref('A')
let observer = null

function setupObserver() {
  if (observer) observer.disconnect()
  observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible[0]) {
      const m = visible[0].target.id.match(/section-([a-f])/)
      if (m) activeLetter.value = m[1].toUpperCase()
    }
  }, {
    rootMargin: '-10% 0px -70% 0px',
    threshold: 0
  })
  document.querySelectorAll('[id^="section-"]').forEach(t => observer.observe(t))
}

onMounted(() => setTimeout(setupObserver, 200))
watch(() => props.report, () => setTimeout(setupObserver, 200))
onUnmounted(() => observer?.disconnect())

function jumpTo(anchorId) {
  const el = document.getElementById(anchorId)
  if (el) window.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
}
</script>

<template>
  <div class="toc-inner">
    <div class="toc-title">本期目录</div>
    <ul class="toc-list">
      <li
        v-for="it in tocItems"
        :key="it.letter"
      >
        <a
          href="#"
          :class="{ active: activeLetter === it.letter }"
          @click.prevent="jumpTo(it.anchorId)"
        >
          <span :class="['tb', it.color]">{{ it.letter }}</span>
          <span class="tt">
            <span class="tt-name">{{ it.title }}</span>
            <span v-if="it.count" class="tt-meta">{{ it.count }}</span>
          </span>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.toc-title {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin-bottom: 14px;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toc-list a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--muted);
  border-left: 2px solid transparent;
  transition: color .12s, background .12s, border-color .12s;
}
.toc-list a:hover {
  color: var(--fg);
  background: var(--card-soft);
}
.toc-list a.active {
  color: var(--fg);
  border-left-color: var(--accent);
  background: var(--card-soft);
}

.toc-list .tb {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.toc-list .tb.b-b { background: var(--high); }
.toc-list .tb.b-c { background: var(--info); }
.toc-list .tb.b-d { background: var(--purple); }
.toc-list .tb.b-e { background: var(--mid); }
.toc-list .tb.b-f { background: var(--accent); }

.toc-list .tt {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.toc-list .tt-name { font-size: 13px; font-weight: 500; }
.toc-list .tt-meta {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
