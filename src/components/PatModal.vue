<script setup>
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { verifyPat } from '../composables/useGitLab.js'

const { modalOpen, closePatModal, setPat, pat: storedPat, user: storedUser } = useAuth()
const input = ref('')
const error = ref('')
const verifying = ref(false)
const username = ref('')

function reset() {
  input.value = ''
  error.value = ''
  verifying.value = false
  username.value = ''
}

async function save() {
  error.value = ''
  if (!input.value || input.value.length < 20) {
    error.value = '看起来不是有效 token（太短）'
    return
  }
  verifying.value = true
  try {
    const info = await verifyPat(input.value.trim())
    username.value = info.username
    setPat(input.value.trim(), info.username)
    setTimeout(() => {
      closePatModal()
      reset()
    }, 800)
  } catch (e) {
    error.value = e.message
  } finally {
    verifying.value = false
  }
}

function logout() {
  setPat('', '')
  closePatModal()
  reset()
}
</script>

<template>
  <div v-if="modalOpen" class="modal-backdrop" @click.self="closePatModal">
    <div class="modal">
      <h3>{{ storedPat ? '管理 GitLab Token' : '配置 GitLab Token · 进入编辑模式' }}</h3>

      <p v-if="!storedPat" class="hint">
        从 Mac 备忘录或密码管理器复制你的 GitLab Personal Access Token（<code>glpat-...</code>），粘贴到下面。
        Token 只存浏览器 localStorage，不上传任何地方。
      </p>
      <p v-else class="hint">
        当前已登录：<strong>{{ storedUser || '已配置' }}</strong>。
        如需更换 token，请粘贴新的；如需退出编辑模式，点底部『退出』。
      </p>

      <div class="modal-row">
        <label>Personal Access Token</label>
        <input
          v-model="input"
          type="password"
          placeholder="glpat-xxxxxxxxxxxxxxxx"
          autocomplete="off"
        />
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="username" class="success-msg">✓ 验证通过，欢迎 @{{ username }}</p>

      <div class="modal-actions">
        <button v-if="storedPat" class="btn-danger" @click="logout">退出编辑模式</button>
        <button class="btn-secondary" @click="closePatModal">取消</button>
        <button class="btn-primary" :disabled="verifying || !input" @click="save">
          {{ verifying ? '验证中…' : '保存并验证' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 14px;
  line-height: 1.6;
}
.hint code {
  background: var(--tag-bg);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: SFMono-Regular, Menlo, Consolas, monospace;
}
.error-msg {
  color: var(--accent);
  font-size: 13px;
  margin: 8px 0;
}
.success-msg {
  color: var(--high);
  font-size: 13px;
  margin: 8px 0;
  font-weight: 600;
}
</style>
