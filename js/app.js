// app.js — UI 与流程编排（借出免密 / 归还需密码 / 操作日志 / GitHub 存储）
import { CONFIG, DEFAULT_PASSWORD_HASH, HELP_TEXT } from "./config.js";
import { parseOperation } from "./parser.js";
import { classify } from "./classifier.js";
import * as engine from "./engine.js";
import { GitHubStore, LocalStorageStore } from "./store.js";

const XLSX = globalThis.XLSX;

// ============ 全局状态 ============
let store;
let data; // { passwordHash, materials, borrows, logs }
let currentFilter = "全部";
let searchText = "";

// 当前弹窗针对的物料名（用于借出/归还/报废）
let currentMaterial = "";

// ============ DOM ============
const $ = (id) => document.getElementById(id);

// ============ 初始化 ============
async function init() {
  if (CONFIG.owner && CONFIG.repo && CONFIG.token) {
    store = new GitHubStore(CONFIG);
  } else {
    store = new LocalStorageStore();
  }
  updateModeBadge();
  data = await store.load();
  if (!data) {
    data = { passwordHash: DEFAULT_PASSWORD_HASH, materials: [], borrows: [], logs: [] };
    await store.save(data, { message: "初始化数据" });
  }
  if (!data.passwordHash) data.passwordHash = DEFAULT_PASSWORD_HASH;
  if (!Array.isArray(data.materials)) data.materials = [];
  if (!Array.isArray(data.borrows)) data.borrows = [];
  if (!Array.isArray(data.logs)) data.logs = [];

  bindEvents();
  renderAll();
}

function updateModeBadge() {
  const badge = $("modeBadge");
  if (store instanceof GitHubStore) {
    badge.textContent = `GitHub: ${CONFIG.owner}/${CONFIG.repo}`;
  } else {
    badge.textContent = "本地存储（未配置 GitHub）";
  }
}

// ============ 乐观锁写入 ============
async function commit(mutator, message = "更新数据") {
  for (let attempt = 0; attempt < 3; attempt++) {
    let d = await store.load();
    if (!d) d = { passwordHash: DEFAULT_PASSWORD_HASH, materials: [], borrows: [], logs: [] };
    if (!d.passwordHash) d.passwordHash = DEFAULT_PASSWORD_HASH;
    if (!Array.isArray(d.materials)) d.materials = [];
    if (!Array.isArray(d.borrows)) d.borrows = [];
    if (!Array.isArray(d.logs)) d.logs = [];
    mutator(d);
    try {
      await store.save(d, { message });
      data = d;
      return d;
    } catch (e) {
      if (e && (e.status === 409 || (e.message && e.message.includes("409")))) continue;
      throw e;
    }
  }
  throw new Error("并发冲突：多人同时操作，写入失败，请重试");
}

// ============ 渲染 ============
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function filteredMaterials() {
  let list = data.materials;
  if (currentFilter !== "全部") list = list.filter((m) => m.category === currentFilter);
  if (searchText) {
    const q = searchText.toLowerCase();
    list = list.filter((m) =>
      (m.name || "").toLowerCase().includes(q) ||
      (m.description || "").toLowerCase().includes(q) ||
      (m.code || "").toLowerCase().includes(q)
    );
  }
  return list;
}

function renderTable() {
  const borrowStatus = engine.getBorrowStatusMap(data);
  const list = filteredMaterials();
  const tbody = $("materialsTable").querySelector("tbody");
  const rows = list.map((m) => {
    const qty = m.quantity || 0;
    const cls = qty <= 3 ? "low" : qty <= 10 ? "mid" : "";
    const status = (borrowStatus[m.name] || []).join("，");
    return `<tr class="${cls}">
      <td>${esc(m.description || m.name)}</td>
      <td>${qty}</td>
      <td>${esc(m.location)}</td>
      <td>${esc(m.category)}</td>
      <td>${esc(status)}</td>
      <td>${esc(m.remark)}</td>
      <td>
        <button class="btn-sm btn-borrow" data-action="borrow" data-id="${esc(m.id)}">借出</button>
        <button class="btn-sm btn-return" data-action="return" data-id="${esc(m.id)}">归还</button>
        <button class="btn-sm btn-scrap" data-action="scrap" data-id="${esc(m.id)}">报废</button>
      </td>
    </tr>`;
  }).join("");
  tbody.innerHTML = rows;
  $("emptyHint").hidden = list.length > 0;
}

function renderFilter() {
  const sel = $("categoryFilter");
  const cats = engine.getAllCategories(data);
  const current = currentFilter;
  sel.innerHTML = ["全部", ...cats].map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (cats.includes(current) || current === "全部") sel.value = current;
  else sel.value = "全部";
}

function renderStats() {
  const stats = engine.getStats(data);
  const filteredCount = filteredMaterials().length;
  $("statTotal").textContent = stats.total_items;
  $("statQty").textContent = stats.total_quantity;
  $("statBorrowed").textContent = stats.borrowed;
  $("statFiltered").textContent = filteredCount;
}

function renderBorrows() {
  const active = engine.getActiveBorrows(data);
  const el = $("borrowList");
  if (!active.length) {
    el.innerHTML = `<div class="none">（当前无在借物料）</div>`;
    return;
  }
  el.innerHTML = active.map((b) =>
    `<div class="item">${esc(b.person)} ｜ ${esc(b.material)} ｜ ${b.qty}台 ｜ ${esc(b.date)}</div>`
  ).join("");
}

function renderLogs() {
  const logs = engine.getLogs(data, 50);
  const el = $("logList");
  if (!logs.length) {
    el.innerHTML = `<div class="none">（暂无操作日志）</div>`;
    return;
  }
  el.innerHTML = logs.map((l) => {
    const person = l.person ? ` [${esc(l.person)}]` : "";
    const sign = l.change > 0 ? `+${l.change}` : `${l.change}`;
    return `<div class="item">${esc(l.time)} | ${esc(l.type)}${person} | ${esc(l.name)} | ${sign} | 余 ${l.after}</div>`;
  }).join("");
}

function renderAll() {
  renderFilter();
  renderTable();
  renderStats();
  renderBorrows();
  renderLogs();
}

// ============ Toast ============
let toastTimer;
function toast(msg, kind = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ============ 弹窗 ============
function openDialog(id) { $(id).showModal(); }
function closeDialog(id) { $(id).close(); }

function openBorrow(name) {
  currentMaterial = name;
  $("borrowMaterialLabel").textContent = name;
  $("borrowPerson").value = "";
  $("borrowQty").value = "1";
  openDialog("dlgBorrow");
}
function openReturn(name, personPrefill = "", qtyPrefill = 1) {
  currentMaterial = name;
  $("returnMaterialLabel").textContent = name;
  $("returnPassword").value = "";
  $("returnPerson").value = personPrefill;
  $("returnQty").value = String(qtyPrefill);
  openDialog("dlgReturn");
}
function openScrap(name) {
  currentMaterial = name;
  $("scrapMaterialLabel").textContent = name;
  $("scrapQty").value = "1";
  openDialog("dlgScrap");
}
function openAdd() {
  $("addName").value = "";
  $("addQty").value = "1";
  $("addLocation").value = "";
  $("addRemark").value = "";
  openDialog("dlgAdd");
}
function openSettings() {
  $("settingsMode").textContent = (store instanceof GitHubStore)
    ? `GitHub: ${CONFIG.owner}/${CONFIG.repo}`
    : "本地存储（未配置 GitHub）";
  $("oldPwd").value = "";
  $("newPwd").value = "";
  $("newPwd2").value = "";
  openDialog("dlgSettings");
}

// ============ 业务动作 ============
async function doBorrow() {
  const name = currentMaterial;
  const person = $("borrowPerson").value.trim();
  const qty = parseInt($("borrowQty").value, 10) || 1;
  if (!person) { toast("请填写借用人姓名", "error"); return; }
  try {
    await commit((d) => engine.borrowMaterial(d, { name, quantity: qty, person, dateStr: todayCn() }));
    closeDialog("dlgBorrow");
    toast(`借出「${name}」x ${qty} 成功`);
  } catch (e) {
    toast(e.message, "error");
  }
  renderAll();
}

async function doReturn() {
  const name = currentMaterial;
  const password = $("returnPassword").value;
  const person = $("returnPerson").value.trim();
  const qty = parseInt($("returnQty").value, 10) || 1;
  if (!password) { toast("请输入还回密码", "error"); return; }
  if (!person) { toast("请填写借用人姓名", "error"); return; }

  const ok = await engine.verifyPassword(data.passwordHash, password);
  if (!ok) {
    try {
      await commit((d) => engine.log(d, "归还密码错误", name, 0, 0, person));
    } catch (e) { /* 日志写入失败不影响提示 */ }
    toast("密码错误，归还失败", "error");
    renderAll();
    return;
  }
  try {
    await commit((d) => engine.returnMaterial(d, { name, quantity: qty, person }));
    closeDialog("dlgReturn");
    toast(`归还「${name}」x ${qty} 成功`);
  } catch (e) {
    toast(e.message, "error");
  }
  renderAll();
}

async function doAdd() {
  const name = $("addName").value.trim();
  const qty = parseInt($("addQty").value, 10) || 1;
  const location = $("addLocation").value.trim();
  const remark = $("addRemark").value.trim();
  if (!name) { toast("请填写物料名称", "error"); return; }
  try {
    await commit((d) => engine.addMaterial(d, { name, quantity: qty, location, remark }));
    closeDialog("dlgAdd");
    toast(`新增入库「${name}」x ${qty} 成功`);
  } catch (e) {
    toast(e.message, "error");
  }
  renderAll();
}

async function doScrap() {
  const name = currentMaterial;
  const qty = parseInt($("scrapQty").value, 10) || 1;
  try {
    await commit((d) => engine.scrapMaterial(d, { name, quantity: qty }));
    closeDialog("dlgScrap");
    toast(`报废「${name}」x ${qty} 成功`);
  } catch (e) {
    toast(e.message, "error");
  }
  renderAll();
}

async function doChangePassword() {
  const oldPwd = $("oldPwd").value;
  const newPwd = $("newPwd").value;
  const newPwd2 = $("newPwd2").value;
  if (!oldPwd || !newPwd) { toast("请填写旧密码和新密码", "error"); return; }
  if (newPwd !== newPwd2) { toast("两次输入的新密码不一致", "error"); return; }
  const ok = await engine.verifyPassword(data.passwordHash, oldPwd);
  if (!ok) { toast("旧密码错误", "error"); return; }
  const newHash = await engine.hashPassword(newPwd);
  try {
    await commit((d) => engine.changePassword(d, newHash));
    closeDialog("dlgSettings");
    toast("还回密码已修改");
  } catch (e) {
    toast(e.message, "error");
  }
  renderAll();
}

// 自然语言执行
async function doExecute() {
  const text = $("nlInput").value.trim();
  if (!text) { toast("请输入操作描述", "error"); return; }
  const { result, error } = parseOperation(text);
  if (error) { toast(error, "error"); return; }

  const { action, material, qty, person, date } = result;
  try {
    if (action === "借出领用") {
      await commit((d) => engine.borrowMaterial(d, { name: material, quantity: qty, person, dateStr: date }));
      $("nlInput").value = "";
      toast(`借出「${material}」x ${qty} 成功`);
    } else if (action === "归还入库") {
      // 归还需密码
      $("nlInput").value = "";
      openReturn(material, person, qty);
      return;
    } else if (action === "新增入库") {
      await commit((d) => engine.addMaterial(d, { name: material, quantity: qty }));
      $("nlInput").value = "";
      toast(`新增入库「${material}」x ${qty} 成功`);
    } else if (action === "闲置报废") {
      await commit((d) => engine.scrapMaterial(d, { name: material, quantity: qty }));
      $("nlInput").value = "";
      toast(`报废「${material}」x ${qty} 成功`);
    }
  } catch (e) {
    toast(e.message, "error");
  }
  renderAll();
}

// ============ Excel ============
async function handleExcel(file, mode) {
  if (!XLSX) { toast("Excel 库未加载（请检查网络）", "error"); return; }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) { toast("Excel 无有效数据", "error"); return; }
    let res = null;
    await commit((d) => { res = engine.importExcelRows(d, rows, mode); });
    if (mode === "update") {
      toast(`同步完成：新增 ${res.added} 条，更新 ${res.updated} 条`);
    } else {
      toast(`导入完成：新增 ${res.added} 条，跳过 ${res.skipped} 条（已存在）`);
    }
  } catch (e) {
    toast(`处理失败：${e.message}`, "error");
  }
  renderAll();
}

function exportMaterials() {
  if (!XLSX) { toast("Excel 库未加载", "error"); return; }
  const rows = data.materials.map((m) => ({
    "物料编码": m.code, "物料名称": m.name, "物料描述": m.description, "型号": m.model,
    "规格": m.spec, "数量": m.quantity, "存放位置": m.location, "分类": m.category, "备注": m.remark,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "物料");
  XLSX.writeFile(wb, "物料数据导出.xlsx");
}

function exportBorrows() {
  if (!XLSX) { toast("Excel 库未加载", "error"); return; }
  const rows = data.borrows.map((br) => {
    const outstanding = br.qty - br.returned;
    return {
      "借用人": br.person, "物料名称": br.material_name, "借出数量": br.qty, "已归还": br.returned,
      "未归还": outstanding, "借出日期": br.date, "借出时间": br.time,
      "状态": outstanding <= 0 ? "已归还" : "在借",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "借出记录");
  XLSX.writeFile(wb, "借出记录.xlsx");
}

function todayCn() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ============ 事件绑定 ============
function bindEvents() {
  // 表格行操作（事件委托）
  $("materialsTable").querySelector("tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const m = data.materials.find((x) => x.id === btn.dataset.id);
    if (!m) return;
    if (btn.dataset.action === "borrow") openBorrow(m.name);
    else if (btn.dataset.action === "return") openReturn(m.name);
    else if (btn.dataset.action === "scrap") openScrap(m.name);
  });

  // 筛选 / 搜索
  $("categoryFilter").addEventListener("change", (e) => {
    currentFilter = e.target.value;
    renderTable();
    renderStats();
  });
  $("searchBox").addEventListener("input", (e) => {
    searchText = e.target.value.trim();
    renderTable();
    renderStats();
  });

  // 工具栏
  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) handleExcel(f, "append");
    e.target.value = "";
  });
  $("btnSync").addEventListener("click", () => {
    if (confirm("将以 Excel 数据为准覆盖现有物料数量！借出日志会保留，确定继续？")) {
      $("syncFile").click();
    }
  });
  $("syncFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) handleExcel(f, "update");
    e.target.value = "";
  });
  $("btnExport").addEventListener("click", exportMaterials);
  $("btnExportBorrow").addEventListener("click", exportBorrows);
  $("btnAdd").addEventListener("click", openAdd);
  $("btnSettings").addEventListener("click", openSettings);

  // 自然语言
  $("btnExec").addEventListener("click", doExecute);
  $("nlInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doExecute(); });

  // 弹窗按钮
  $("borrowOk").addEventListener("click", doBorrow);
  $("borrowCancel").addEventListener("click", () => closeDialog("dlgBorrow"));
  $("returnOk").addEventListener("click", doReturn);
  $("returnCancel").addEventListener("click", () => closeDialog("dlgReturn"));
  $("addOk").addEventListener("click", doAdd);
  $("addCancel").addEventListener("click", () => closeDialog("dlgAdd"));
  $("scrapOk").addEventListener("click", doScrap);
  $("scrapCancel").addEventListener("click", () => closeDialog("dlgScrap"));
  $("pwdOk").addEventListener("click", doChangePassword);
  $("settingsCancel").addEventListener("click", () => closeDialog("dlgSettings"));

  // 回车提交弹窗
  $("borrowPerson").addEventListener("keydown", (e) => { if (e.key === "Enter") doBorrow(); });
  $("returnPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doReturn(); });
  $("addName").addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
}

init().catch((e) => {
  console.error(e);
  toast(`初始化失败：${e.message}`, "error");
});
