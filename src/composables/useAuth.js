/**
 * 编辑模式 / PAT 管理。PAT 存 localStorage，永不离开浏览器。
 */
import { ref, computed } from 'vue'

const PAT_KEY = 'INSPIRATION_DAILY_GITLAB_PAT'
const USER_KEY = 'INSPIRATION_DAILY_GITLAB_USER'

const _pat = ref(localStorage.getItem(PAT_KEY) || '')
const _user = ref(localStorage.getItem(USER_KEY) || '')
const _modalOpen = ref(false)

export function useAuth() {
  const isEditor = computed(() => !!_pat.value)
  const pat = computed(() => _pat.value)
  const user = computed(() => _user.value)

  const setPat = (token, username = '') => {
    _pat.value = token
    _user.value = username
    if (token) {
      localStorage.setItem(PAT_KEY, token)
      if (username) localStorage.setItem(USER_KEY, username)
    } else {
      localStorage.removeItem(PAT_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  const openPatModal = () => { _modalOpen.value = true }
  const closePatModal = () => { _modalOpen.value = false }
  const modalOpen = computed(() => _modalOpen.value)

  return { isEditor, pat, user, setPat, openPatModal, closePatModal, modalOpen }
}
