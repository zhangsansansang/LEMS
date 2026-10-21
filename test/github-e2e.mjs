// github-e2e.mjs — GitHub 真机联调（需提供仓库 + fine-grained token）
// 用法（Windows Git Bash）：
//   GITHUB_OWNER=xxx GITHUB_REPO=yyy GITHUB_TOKEN=ghp_xxx node test/github-e2e.mjs
// 仅在仓库 data/__e2e_test__.json 临时路径上读写并自清理，不触碰正式 data/data.json。
import { GitHubStore } from "../js/store.js";

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const token = process.env.GITHUB_TOKEN;
const branch = process.env.GITHUB_BRANCH || "main";

if (!owner || !repo || !token) {
  console.error("缺少环境变量：GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN");
  process.exit(1);
}

const store = new GitHubStore({ owner, repo, branch, token, path: "data/__e2e_test__.json" });
const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/__e2e_test__.json`;

async function main() {
  // 1) 首次写入
  const seed = { passwordHash: "test", materials: [{ id: "1", name: "测试物料", quantity: 5 }], borrows: [], logs: [] };
  await store.save(seed, { message: "e2e test: create" });
  console.log("✓ 写入成功（新建）");

  // 2) 读回
  const loaded = await store.load();
  if (loaded.materials[0].name !== "测试物料") throw new Error("读回数据不一致");
  console.log("✓ 读回成功，内容一致");

  // 3) 更新（带 sha）
  loaded.materials[0].quantity = 3;
  await store.save(loaded, { message: "e2e test: update" });
  const loaded2 = await store.load();
  if (loaded2.materials[0].quantity !== 3) throw new Error("更新后数量不一致");
  console.log("✓ 更新成功（乐观锁 sha）");

  // 4) 清理：删除临时文件
  const res = await fetch(`${apiUrl}?ref=${branch}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "e2e test: cleanup", sha: store.sha, branch }),
  });
  if (!res.ok) throw new Error(`清理失败 HTTP ${res.status}: ${await res.text()}`);
  console.log("✓ 临时文件已清理");
  console.log("\nGitHub 联调全部通过。");
}

main().catch((e) => {
  console.error("✗ 失败：", e.message);
  process.exit(1);
});
