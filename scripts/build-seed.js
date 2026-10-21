// build-seed.js — 一次性脚本：把旧程序 dist/data 下的三个 JSON 合并为 data/data.json
// 用法：node scripts/build-seed.js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "..", "dist", "data");
const OUT = join(__dirname, "..", "data", "data.json");

const PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"; // admin123

function read(name) {
  return JSON.parse(readFileSync(join(SRC, name), "utf-8"));
}

const materials = read("materials.json").materials || [];
const borrows = read("borrows.json").borrows || [];
const logs = read("logs.json").logs || [];

const data = { passwordHash: PASSWORD_HASH, materials, borrows, logs };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2), "utf-8");
console.log(
  `生成 ${OUT}\n  物料 ${materials.length} 条 / 借出 ${borrows.length} 条 / 日志 ${logs.length} 条`
);
