# 灵感日报 H5

竞品 + AI 信号扫描日报的内部 PC H5。Vue 3 + Vite 应用，部署在 GitHub Pages。

**线上访问**：https://yuki-learning.github.io/inspiration-daily/

> 部署后这个 URL 会自动生效。访问者无需登录、无需 GitHub 账号。

---

## 本地开发

```bash
# 1. 进入项目目录
cd ~/Documents/yuki/产品灵感/h5-app

# 2. 装依赖（只需要做一次）
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器打开 `http://localhost:5173`。改源码热更新，改 JSON 数据刷新页面即可看到。

---

## 6 个页面

| 路由 | 名称 | 内容 |
|---|---|---|
| `/#/reports` | P2 单期日报 reader | 默认跳最新一期；三栏（历史日报 sidebar / 正文 / TOC） |
| `/#/reports/<date>` | P2 指定一期 | 同上，按日期定位 |
| `/#/directions` | P3 方向台账 | 全部方向表格 + 状态筛选 + 排序 |
| `/#/directions/<id>` | P4 单方向详情 | 演进时间线 + 唤醒条件 + 评分卡 |
| `/#/wakeups` | P5 唤醒池 | 保留方向 + 唤醒条件清单 |
| `/#/new` | P6 入库向导 | 4 步向导（编辑模式专用） |

---

## 编辑模式（写入功能）

> 注：当前部署版本下，编辑模式（P6 入库）依赖公司内部 GitLab。GitHub Pages 部署的版本只读优先；写入流程后续如果需要，再适配 GitHub API。

点右上角『登录』→ 粘贴 GitLab PAT → 进入编辑模式（顶 nav 显示『⊕ 编辑模式』徽章 + 右下角出现『⊕ 入库今日草稿』红色 FAB）。

---

## 部署流程

每次 `git push` 到 `main` 分支，GitHub Actions 自动：
1. `npm install`
2. `npm run build`
3. 把 `dist/` 部署到 GitHub Pages

约 1-2 分钟后线上 URL 更新。失败的话去 GitHub 仓库 → Actions tab 看 build log。

---

## 数据更新

日报数据存在 `public/data/` 下：

```
public/data/
├── reports/
│   ├── index.json           ← 期号索引
│   ├── 2026-04-27.json
│   ├── 2026-04-29.json
│   ├── 2026-05-08.json
│   ├── 2026-05-12.json
│   └── 2026-05-18.json      ← 最新
├── directions.json          ← 方向台账
├── signals.json             ← 信号库
└── feedbacks.json
```

加新一期日报的标准流程：

1. 桌面 Claude 客户端跑生成 → 输出 JSON 草稿
2. 把 JSON 保存为 `public/data/reports/<date>.json`
3. 编辑 `public/data/reports/index.json` 追加索引
4. 如果有方向状态变化，更新 `public/data/directions.json`
5. `git add . && git commit -m "feat: add <date> 日报" && git push`
6. GitHub Actions 自动部署，1-2 分钟后线上可见

---

## 项目结构

```
.
├── .github/workflows/deploy.yml   ← GitHub Actions 部署配置
├── package.json
├── vite.config.js
├── index.html
├── README.md
├── src/
│   ├── main.js
│   ├── App.vue                    ← 顶部 nav 壳
│   ├── router.js
│   ├── styles.css                 ← 全局 tokens
│   ├── pages/                     ← P2-P6 五个页面组件
│   ├── components/                ← PatModal / ReportSidebar / ReportToc
│   └── composables/               ← useData / useAuth / useGitLab
└── public/
    ├── data/                      ← 业务数据
    └── config/business-config.json
```

---

## 浏览器兼容

PC 优先，1280-1920px 主战场。Chrome / Edge / Safari 最新版完美支持。响应式做了基础适配，900px 以下也能用。
