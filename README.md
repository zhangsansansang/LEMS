# 机器视觉实验室物料管理系统（网页版）

原桌面 EXE（Python/PyQt5）的网页版重写：纯静态单页应用，数据存到 GitHub，
打开链接即可使用。新增**借出/还回权限**：所有人可借出，**还回需输入密码**，全部操作记录日志。

## 功能

- 物料表格（描述/数量/存放位置/分类/借出状态/备注），数量 ≤3 标红、≤10 标黄
- 分类筛选 + 名称/描述/编码搜索
- 统计（物料总数 / 库存总量 / 借出在用 / 当前筛选）
- 借出登记记录（未还清列表）与操作日志（最近 50 条）
- Excel 导入 / 更新同步 / 导出物料 / 导出借出（浏览器内完成）
- 自然语言操作：`5月17日，李晓源借出CL042-91GM一台`、`新增入库 物料名 数量`、`报废 物料名 数量`
- 自动分类（产品代号前缀 + 关键词）
- **权限**：借出免密；归还、报废、新增入库均可操作，其中**归还必须输入还回密码**（默认 `admin123`）
- 修改还回密码（设置里，需旧密码）

## 快速体验（无需 GitHub）

`js/config.js` 中 token 留空时，应用自动用浏览器本地存储（localStorage），
用任意静态服务器打开 `index.html` 即可体验全部功能：

```bash
cd webapp
npx serve .        # 或 python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 部署到 GitHub（打开链接即用）

1. **建仓库**：新建 GitHub 仓库（如 `lab-materials`，建议 Public，免费开 Pages）。
2. **生成 token**：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens，
   仅授权该仓库，权限只勾选 `Contents: Read and write`。
3. **填配置**：编辑 `js/config.js`：
   ```js
   export const CONFIG = {
     owner: "你的用户名",
     repo: "lab-materials",
     branch: "main",
     token: "github_pat_xxxx",   // 仅授权该仓库
   };
   ```
4. **推送**：
   ```bash
   cd webapp
   git init
   git add .
   git commit -m "物料管理系统网页版"
   git branch -M main
   git remote add origin https://github.com/你的用户名/lab-materials.git
   git push -u origin main
   ```
5. **开启 Pages**：仓库 → Settings → Pages → Source 选 `main` 分支根目录 → 得到链接
   `https://你的用户名.github.io/lab-materials/`，分享给同事即可使用。

## 数据存储

- 仓库内 `data/data.json` 单文件：`{ passwordHash, materials, borrows, logs }`，一次写入原子更新。
- 读写通过 GitHub Contents API（浏览器直连，支持 CORS），带 `sha` 乐观锁，冲突自动重试。

## 还回密码

- 默认 `admin123`（以 SHA-256 哈希存于 `data/data.json`，不在代码里）。
- 在页面「⚙️ 设置」中修改（需输入旧密码）。所有用户共享同一密码。

## 测试

```bash
cd webapp
node --test test/logic.test.mjs     # 纯逻辑单测（无需网络）
# GitHub 真机联调：
GITHUB_OWNER=xxx GITHUB_REPO=yyy GITHUB_TOKEN=ghp_xxx node test/github-e2e.mjs
```

## ⚠️ 安全说明

本方案为「纯静态站 + GitHub API」：token 与密码校验均在浏览器端。拿到链接的人理论上能读到内嵌 token
（但它**仅能读写这一个仓库**，无法访问你的其他仓库/账号）。因此「还回密码」属于**流程门槛 + 审计留痕**，
不是加密级安全；真正的可追溯性由**操作日志**承担。若需要更高安全等级，应加一层服务端（如 Cloudflare/Vercel
函数）把 token 放到服务端。
