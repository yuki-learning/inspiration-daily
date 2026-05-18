import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    // 走 vite dev server proxy 转发 GitLab API 调用，避免本地 dev 时撞 CORS
    proxy: {
      '/gitlab-api': {
        target: 'https://gitlab.weibo.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gitlab-api/, '/api/v4')
      }
    }
  }
})
