<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from './composables/useAuth.js'

const { isEditor, openPatModal } = useAuth()
const route = useRoute()

const activeTab = computed(() => {
  if (route.path.startsWith('/directions')) return 'directions'
  if (route.path.startsWith('/wakeups')) return 'wakeups'
  if (route.path.startsWith('/new')) return 'new'
  return 'reports'
})
</script>

<template>
  <div class="app-shell">
    <header class="app-top">
      <div class="app-top-inner">
        <router-link to="/" class="brand">
          <span class="dot"></span> 灵感日报
        </router-link>
        <nav class="tabs">
          <router-link to="/" :class="{ active: activeTab === 'reports' }">日报</router-link>
          <router-link to="/directions" :class="{ active: activeTab === 'directions' }">方向</router-link>
          <router-link to="/wakeups" :class="{ active: activeTab === 'wakeups' }">唤醒池</router-link>
        </nav>
        <div class="right-slot">
          <span>微博音频 · v1.5</span>
          <button v-if="!isEditor" class="btn-ghost" @click="openPatModal">登录</button>
          <span v-else class="badge-editor" @click="openPatModal" title="点击重新配置 Token">⊕ 编辑模式</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>

    <router-link
      v-if="isEditor && route.name !== 'P6'"
      to="/new"
      class="fab"
    >
      ⊕ 入库今日草稿
    </router-link>

    <PatModal />
  </div>
</template>

<script>
import PatModal from './components/PatModal.vue'
export default { components: { PatModal } }
</script>

<style>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1;
}

/* fab · 编辑模式下右下角入库入口 */
.fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 40;
  background: var(--accent);
  color: #fff;
  padding: 12px 20px;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 600;
  font-size: 13.5px;
  box-shadow: 0 8px 24px -8px rgba(215, 38, 49, 0.45);
  transition: transform 0.15s, filter 0.15s;
}
.fab:hover { transform: translateY(-2px); filter: brightness(1.05); }
</style>
