// config.js — 部署配置
// ============================================================
// 部署到 GitHub 时填写下面三项（token 用 fine-grained PAT，仅授权该仓库 + Contents 读写）。
// 不填 token 时，应用自动降级为浏览器本地存储（localStorage），便于离线演示/测试。
// ============================================================
export const CONFIG = {
  owner: "zhangsansansang",   // GitHub 用户名或组织名
  repo: "LEMS",               // 仓库名
  branch: "main",             // 分支
  // token 不要写在这里（GitHub 会拦截内嵌密钥并自动吊销）。
  // 改为：打开网页后在「⚙️ 设置」里粘贴一次 token，存到浏览器本地（localStorage）。
  token: "",
};

// 还回密码的默认 SHA-256 哈希（对应 "admin123"）。
// 运行时以 data.json 里的 passwordHash 为准；此值仅在首次初始化/无数据时兜底。
export const DEFAULT_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

// 数据在仓库中的路径
export const DATA_PATH = "data/data.json";

// 说明文案（底部帮助）
export const HELP_TEXT =
  "借出/归还完整格式：5月17日，李晓源借出CL042-91GM一台\n" +
  "新增/报废可简写：新增入库 物料名 数量 | 报废 物料名 数量";
