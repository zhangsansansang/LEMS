// engine.js — 纯业务逻辑（无 DOM / fetch 依赖），浏览器与 Node 测试共用
// 状态结构：{ passwordHash, materials, borrows, logs }
import { classify } from "./classifier.js";

// ============ 状态 ============
export function createState() {
  return { passwordHash: "", materials: [], borrows: [], logs: [] };
}

// ============ 密码（SHA-256，浏览器 Web Crypto 与 Node 均可） ============
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(pwd) {
  return sha256Hex(pwd);
}

export async function verifyPassword(hash, input) {
  return (await sha256Hex(input)) === hash;
}

// ============ 工具 ============
export function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function uid() {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
}

// ============ 日志 ============
export function log(state, opType, name, change, after, person = "") {
  const entry = { time: nowStr(), type: opType, name, change, after };
  if (person) entry.person = person;
  state.logs.push(entry);
  if (state.logs.length > 2000) state.logs = state.logs.slice(-2000);
}

export function getLogs(state, limit = 50) {
  return [...state.logs].slice(-limit).reverse();
}

// ============ 物料查找 ============
export function getMaterialByName(state, name) {
  const n = String(name).trim().toLowerCase();
  if (!n) return null;
  for (const m of state.materials) if (m.name.trim().toLowerCase() === n) return m;
  for (const m of state.materials) if (m.name.trim().toLowerCase().includes(n)) return m;
  for (const m of state.materials) if ((m.description || "").toLowerCase().includes(n)) return m;
  return null;
}

// ============ 新增入库 ============
export function addMaterial(state, { name, quantity = 1, description = "", location = "", remark = "" }) {
  if (quantity <= 0) throw new Error("入库数量必须大于0");
  const existing = getMaterialByName(state, name);
  if (existing) {
    existing.quantity += quantity;
    log(state, "新增入库(合并)", existing.name, quantity, existing.quantity);
    return existing;
  }
  const nm = name.trim();
  const item = {
    id: uid(),
    name: nm,
    description: description.trim() || nm,
    code: "", model: "", spec: "",
    quantity,
    location: location.trim(),
    remark: remark.trim(),
    category: classify(nm, description.trim() || nm),
  };
  state.materials.push(item);
  log(state, "新增入库", nm, quantity, quantity);
  return item;
}

// ============ 借出领用（无需密码） ============
export function borrowMaterial(state, { name, quantity = 1, person = "", dateStr = "" }) {
  if (quantity <= 0) throw new Error("借出数量必须大于0");
  if (!person) throw new Error("借出必须填写借用人姓名！");
  const item = getMaterialByName(state, name);
  if (!item) throw new Error(`未找到物料：${name}`);
  if (item.quantity < quantity) throw new Error(`库存不足！当前库存 ${item.quantity}，尝试借出 ${quantity}`);
  item.quantity -= quantity;
  state.borrows.push({
    id: uid(),
    person,
    material_name: item.name,
    material_id: item.id,
    qty: quantity,
    returned: 0,
    date: dateStr,
    time: nowStr(),
  });
  log(state, "借出领用", item.name, -quantity, item.quantity, person);
  return item;
}

// ============ 归还入库（需密码，密码校验在调用方完成） ============
export function returnMaterial(state, { name, quantity = 1, person = "" }) {
  if (quantity <= 0) throw new Error("归还数量必须大于0");
  if (!person) throw new Error("归还必须填写借用人姓名！");
  const item = getMaterialByName(state, name);
  if (!item) throw new Error(`未找到物料：${name}`);

  let matched = null;
  for (const br of state.borrows) {
    if (br.material_name === item.name && br.person === person && br.qty - br.returned > 0) {
      matched = br;
      break;
    }
  }
  if (!matched) {
    throw new Error(`未找到 ${person} 对「${item.name}」的借出记录，归还失败！\n请确认借出人姓名和物料名称是否正确。`);
  }
  const outstanding = matched.qty - matched.returned;
  if (quantity > outstanding) {
    throw new Error(`归还数量(${quantity})超过未归还数量(${outstanding})！\n${person} 借出 ${matched.qty} 台，已归还 ${matched.returned} 台。`);
  }
  matched.returned += quantity;
  item.quantity += quantity;
  log(state, "归还入库", item.name, quantity, item.quantity, person);
  return item;
}

// ============ 闲置报废 ============
export function scrapMaterial(state, { name, quantity = 1 }) {
  if (quantity <= 0) throw new Error("报废数量必须大于0");
  const item = getMaterialByName(state, name);
  if (!item) throw new Error(`未找到物料：${name}`);
  if (item.quantity < quantity) throw new Error(`库存不足！当前库存 ${item.quantity}，尝试报废 ${quantity}`);
  item.quantity -= quantity;
  log(state, "闲置报废", item.name, -quantity, item.quantity);
  return item;
}

// ============ 修改密码 ============
export function changePassword(state, newHash) {
  state.passwordHash = newHash;
  log(state, "修改密码", "还回密码", 0, 0, "管理员");
}

// ============ Excel 导入（行数组来自 SheetJS sheet_to_json） ============
const COLUMN_ALIASES = {
  code: ["物料编码", "编码", "料号", "物料号"],
  name: ["物料名称", "名称", "品名"],
  description: ["物料描述", "描述", "规格描述", "物料规格"],
  model: ["型号", "规格型号", "物料型号"],
  spec: ["规格", "参数", "技术参数"],
  quantity: ["数量", "现有数量", "库存数量", "申请数量", "可用量"],
  location: ["存放位置", "位置", "库位", "仓库"],
  remark: ["备注", "说明", "附注", "注释"],
};

export function mapColumns(headers) {
  const mapping = {};
  const cols = headers.map((c) => String(c).trim());
  for (const [internal, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const found = cols.find((ec) => alias === ec || ec.includes(alias));
      if (found) { mapping[internal] = found; break; }
    }
  }
  return mapping;
}

export function parseRow(row, colMap) {
  const getVal = (field) => {
    const col = colMap[field];
    if (col === undefined) return field === "quantity" ? 0 : "";
    let val = row[col];
    if (val === undefined || val === null) return field === "quantity" ? 0 : "";
    return val;
  };
  let name = String(getVal("name")).trim();
  let description = String(getVal("description")).trim();
  if (!description) description = name;
  if (!name && !description) return null;
  let quantity = parseInt(String(getVal("quantity")).trim(), 10);
  if (Number.isNaN(quantity)) quantity = 0;
  const item = {
    id: uid(),
    name: name || description,
    description,
    code: String(getVal("code")).trim(),
    model: String(getVal("model")).trim(),
    spec: String(getVal("spec")).trim(),
    quantity: Math.max(0, quantity),
    location: String(getVal("location")).trim(),
    remark: String(getVal("remark")).trim(),
  };
  item.category = classify(item.name, item.description);
  return item;
}

export function findMaterial(state, item) {
  if (item.code) {
    for (const m of state.materials) if (m.code && m.code === item.code) return m;
  }
  const desc = item.description ? item.description.slice(0, 20) : "";
  if (desc) {
    for (const m of state.materials) if ((m.description || "").slice(0, 20) === desc) return m;
  }
  for (const m of state.materials) if (m.name === item.name) return m;
  return null;
}

export function importExcelRows(state, rows, mode = "append") {
  const headers = Object.keys(rows[0] || {});
  const colMap = mapColumns(headers);
  let added = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const item = parseRow(row, colMap);
    if (!item) continue;
    const existing = findMaterial(state, item);
    if (mode === "update") {
      if (existing) {
        const oldQty = existing.quantity;
        existing.quantity = item.quantity;
        existing.description = item.description;
        existing.model = item.model;
        existing.spec = item.spec;
        existing.location = item.location;
        existing.remark = item.remark;
        existing.code = item.code;
        existing.category = classify(item.name, item.description);
        updated++;
        log(state, "Excel更新", item.name, item.quantity - oldQty, item.quantity);
      } else {
        state.materials.push(item);
        added++;
        log(state, "Excel新增", item.name, item.quantity, item.quantity);
      }
    } else {
      if (existing) { skipped++; }
      else { state.materials.push(item); added++; log(state, "Excel导入", item.name, item.quantity, item.quantity); }
    }
  }
  return { added, updated, skipped };
}

// ============ 查询 / 统计 ============
export function getActiveBorrows(state) {
  const active = [];
  for (const br of state.borrows) {
    if (br.returned < br.qty) {
      active.push({
        person: br.person,
        material: br.material_name,
        qty: br.qty - br.returned,
        total_qty: br.qty,
        date: br.date,
      });
    }
  }
  return active;
}

export function getBorrowStatusMap(state) {
  const status = {};
  for (const br of state.borrows) {
    const outstanding = br.qty - br.returned;
    if (outstanding > 0) {
      (status[br.material_name] = status[br.material_name] || []).push(`${br.person}(${outstanding}台)`);
    }
  }
  return status;
}

export function getAllCategories(state) {
  return [...new Set(state.materials.map((m) => m.category))].sort();
}

export function getStats(state) {
  const totalItems = state.materials.length;
  const totalQty = state.materials.reduce((s, m) => s + (m.quantity || 0), 0);
  const borrowed = state.borrows
    .filter((b) => b.returned < b.qty)
    .reduce((s, b) => s + (b.qty - b.returned), 0);
  const categoryCount = {};
  const categoryQty = {};
  for (const m of state.materials) {
    categoryCount[m.category] = (categoryCount[m.category] || 0) + 1;
    categoryQty[m.category] = (categoryQty[m.category] || 0) + (m.quantity || 0);
  }
  return { total_items: totalItems, total_quantity: totalQty, borrowed, category_count: categoryCount, category_qty: categoryQty };
}
