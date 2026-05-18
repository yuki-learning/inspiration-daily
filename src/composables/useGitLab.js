/**
 * GitLab Repository Files API 封装。
 * 通过 vite dev server 的 /gitlab-api proxy 转发到 gitlab.weibo.cn，避免本地 dev 时撞 CORS。
 * 部署到 GitLab Pages 后，由于和 API 同源（gitlab.weibo.cn），可以直接调，proxy 字段会被忽略。
 */
import { useAuth } from './useAuth.js'

// 通过 vite dev proxy 转发；生产环境同源可以直接打 /api/v4
const API_BASE = import.meta.env.DEV ? '/gitlab-api' : 'https://gitlab.weibo.cn/api/v4'

const PROJECT_ID = 11804 // gitlab.weibo.cn/yuki/inspiration-daily

/**
 * 验证 PAT 是否有效。
 * 通过 GET /user 端点（任何 scope 都能调）。
 */
export async function verifyPat(pat) {
  const resp = await fetch(`${API_BASE}/user`, {
    headers: { 'PRIVATE-TOKEN': pat }
  })
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Token 无效或已过期')
    throw new Error(`验证失败（${resp.status}）`)
  }
  const data = await resp.json()
  return { username: data.username, name: data.name }
}

/**
 * 提交多文件原子 commit。
 * @param {Array<{action: 'create'|'update'|'delete', file_path: string, content?: any}>} actions
 * @param {string} commitMessage
 * @returns commit 对象（含 web_url）
 */
export async function commitFiles(actions, commitMessage) {
  const { pat } = useAuth()
  if (!pat.value) throw new Error('未配置 PAT')

  // 把 JS 对象内容转 JSON 字符串
  const payload = {
    branch: 'main',
    commit_message: commitMessage,
    actions: actions.map(a => ({
      action: a.action,
      file_path: a.file_path,
      content: typeof a.content === 'string'
        ? a.content
        : JSON.stringify(a.content, null, 2)
    }))
  }

  const resp = await fetch(`${API_BASE}/projects/${PROJECT_ID}/repository/commits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': pat.value
    },
    body: JSON.stringify(payload)
  })

  if (!resp.ok) {
    let errMsg = `Commit 失败（${resp.status}）`
    try {
      const errData = await resp.json()
      if (errData.message) errMsg += `: ${JSON.stringify(errData.message)}`
    } catch {}
    throw new Error(errMsg)
  }
  return await resp.json()
}

/**
 * 读取仓库中单个文件的最新内容。用于在 commit 前比较是否需要 update。
 * 当前实现仅为辅助，写入路径不严格依赖此函数。
 */
export async function getFile(filePath, ref = 'main') {
  const { pat } = useAuth()
  const url = `${API_BASE}/projects/${PROJECT_ID}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${ref}`
  const headers = {}
  if (pat.value) headers['PRIVATE-TOKEN'] = pat.value
  const resp = await fetch(url, { headers })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`Fetch ${filePath} 失败（${resp.status}）`)
  return await resp.text()
}

export { PROJECT_ID, API_BASE }
