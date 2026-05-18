/**
 * 数据访问层：开发环境下从本地 /data/ /config/ 读，生产环境下同样（GitLab Pages 部署 public 即可）。
 * 所有 fetch 都是无鉴权 GET，public 静态文件即可命中。
 */
import { ref } from 'vue'

const cache = new Map()

export async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path)
  const resp = await fetch(path, { cache: 'no-store' })
  if (!resp.ok) throw new Error(`Failed to fetch ${path}: ${resp.status}`)
  const data = await resp.json()
  cache.set(path, data)
  return data
}

export function clearCache() {
  cache.clear()
}

export async function loadReportIndex() {
  return await fetchJSON('./data/reports/index.json')
}

export async function loadReport(date) {
  return await fetchJSON(`./data/reports/${date}.json`)
}

export async function loadDirections() {
  return await fetchJSON('./data/directions.json')
}

export async function loadSignals() {
  return await fetchJSON('./data/signals.json')
}

export async function loadFeedbacks() {
  return await fetchJSON('./data/feedbacks.json')
}

export async function loadConfig() {
  return await fetchJSON('./config/business-config.json')
}

/**
 * 简易响应式包装：useAsync(() => loadReport('2026-05-12'))
 */
export function useAsync(loader) {
  const data = ref(null)
  const loading = ref(true)
  const error = ref(null)
  const reload = async () => {
    loading.value = true
    error.value = null
    try {
      data.value = await loader()
    } catch (e) {
      error.value = e
      console.error(e)
    } finally {
      loading.value = false
    }
  }
  reload()
  return { data, loading, error, reload }
}
