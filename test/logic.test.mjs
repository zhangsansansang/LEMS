// logic.test.mjs — 纯逻辑单元测试（无网络）：classifier / parser / engine
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify } from "../js/classifier.js";
import { parseOperation, parseCnNumber } from "../js/parser.js";
import * as engine from "../js/engine.js";

// ---------- 分类 ----------
test("classify 产品代号前缀", () => {
  const cases = [
    ["MV-CH120-20UM", "工业相机"],
    ["MV-CS004-10GM", "工业相机"],
    ["MV-CL042-91GM", "线阵相机"],
    ["MV-SC2016EC-08S-WBN", "智能相机"],
    ["MV-DP2060-01D", "线激光轮廓仪"],
    ["MV-DLS600P", "3D视觉类"],
    ["MV-IDH3000/13SR", "智能读码器"],
    ["MV-GE2204P", "采集卡"],
    ["MVL-MY-2-110C-MP", "工业镜头"],
    ["LF2528M-F", "工业镜头"],
    ["MV-LB-270-140-4030WL-A", "视觉光源"],
    ["iMVS-VM-8206", "视觉软件"],
    ["MV-IPC-F4B9W", "工控设备"],
    ["MV-AC10G-2LC", "视觉配件"],
    ["MV-LODIS-H-300", "视觉光源"],
    ["MV-DAPS-25UM", "视觉光源"],
    ["随便什么名称", "其他物料"],
  ];
  for (const [text, want] of cases) {
    assert.equal(classify("", text), want, `classify("${text}")`);
  }
});

test("classify 关键词优先（控制器/软件）", () => {
  assert.equal(classify("光源控制器MV-LEVD-200-4-PY", "光源控制器MV-LEVD-200-4-PY"), "光源控制器");
  assert.equal(classify("OLP工业机器人离线编程软件", "OLP工业机器人离线编程软件"), "视觉软件");
});

// ---------- 中文数字 ----------
test("parseCnNumber", () => {
  assert.equal(parseCnNumber("5"), 5);
  assert.equal(parseCnNumber("十"), 10);
  assert.equal(parseCnNumber("十二"), 12);
  assert.equal(parseCnNumber("二十"), 20);
  assert.equal(parseCnNumber("两"), 2);
});

// ---------- 自然语言解析 ----------
test("parseOperation 借出完整格式", () => {
  const { result, error } = parseOperation("5月17日，李晓源借出CL042-91GM一台");
  assert.equal(error, null);
  assert.deepEqual(result, {
    date: "5月17日", person: "李晓源", action: "借出领用", material: "CL042-91GM", qty: 1,
  });
});

test("parseOperation 归还完整格式", () => {
  const { result } = parseOperation("5月17日，李晓源归还CL042-91GM一台");
  assert.equal(result.action, "归还入库");
  assert.equal(result.person, "李晓源");
});

test("parseOperation 新增入库简写", () => {
  const { result } = parseOperation("新增入库 MV-CH120 5");
  assert.equal(result.action, "新增入库");
  assert.equal(result.material, "MV-CH120");
  assert.equal(result.qty, 5);
  assert.equal(result.person, "");
});

test("parseOperation 报废简写", () => {
  const { result } = parseOperation("报废 旧镜头 2个");
  assert.equal(result.action, "闲置报废");
  assert.equal(result.material, "旧镜头");
  assert.equal(result.qty, 2);
});

test("parseOperation 中文数字数量", () => {
  const { result } = parseOperation("5月14日，张三借出MV-CH120两台");
  assert.equal(result.qty, 2);
  assert.equal(result.material, "MV-CH120");
});

test("parseOperation 借出缺人名报错", () => {
  const { error } = parseOperation("借出CL042-91GM一台");
  assert.ok(error.includes("必须填写人名"));
});

test("parseOperation 空输入报错", () => {
  const { error } = parseOperation("");
  assert.equal(error, "请输入操作描述");
});

test("parseOperation 未知动作报错", () => {
  const { error } = parseOperation("删除 物料A");
  assert.ok(error.includes("无法识别操作类型"));
});

// ---------- 密码 ----------
test("密码哈希与校验", async () => {
  const hash = await engine.hashPassword("admin123");
  assert.equal(hash, "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9");
  assert.equal(await engine.verifyPassword(hash, "admin123"), true);
  assert.equal(await engine.verifyPassword(hash, "wrong"), false);
});

// ---------- 借还闭环 ----------
test("借出→归还 完整闭环", () => {
  const s = engine.createState();
  engine.addMaterial(s, { name: "MV-CH120", quantity: 5 });
  engine.borrowMaterial(s, { name: "MV-CH120", quantity: 2, person: "张三", dateStr: "5月17日" });
  assert.equal(s.materials[0].quantity, 3);
  assert.equal(s.borrows.length, 1);
  assert.equal(engine.getStats(s).borrowed, 2);

  engine.returnMaterial(s, { name: "MV-CH120", quantity: 2, person: "张三" });
  assert.equal(s.materials[0].quantity, 5);
  assert.equal(engine.getStats(s).borrowed, 0);

  const types = s.logs.map((l) => l.type);
  assert.ok(types.includes("借出领用"));
  assert.ok(types.includes("归还入库"));
});

test("借出库存不足报错", () => {
  const s = engine.createState();
  engine.addMaterial(s, { name: "X", quantity: 1 });
  assert.throws(() => engine.borrowMaterial(s, { name: "X", quantity: 2, person: "张三" }), /库存不足/);
});

test("借出缺人名报错", () => {
  const s = engine.createState();
  engine.addMaterial(s, { name: "X", quantity: 5 });
  assert.throws(() => engine.borrowMaterial(s, { name: "X", quantity: 1, person: "" }), /姓名/);
});

test("归还无借出记录报错", () => {
  const s = engine.createState();
  engine.addMaterial(s, { name: "X", quantity: 5 });
  assert.throws(() => engine.returnMaterial(s, { name: "X", quantity: 1, person: "李四" }), /借出记录/);
});

test("归还超量报错", () => {
  const s = engine.createState();
  engine.addMaterial(s, { name: "X", quantity: 5 });
  engine.borrowMaterial(s, { name: "X", quantity: 2, person: "张三" });
  assert.throws(() => engine.returnMaterial(s, { name: "X", quantity: 3, person: "张三" }), /超过未归还数量/);
});

// ---------- 日志截断 ----------
test("日志 2000 条截断", () => {
  const s = engine.createState();
  for (let i = 0; i < 2500; i++) engine.log(s, "测试", "x", 1, 1);
  assert.equal(s.logs.length, 2000);
});

// ---------- 借出状态 / 活动借出 ----------
test("借出状态映射", () => {
  const s = engine.createState();
  engine.addMaterial(s, { name: "X", quantity: 5 });
  engine.borrowMaterial(s, { name: "X", quantity: 2, person: "张三" });
  const map = engine.getBorrowStatusMap(s);
  assert.deepEqual(map["X"], ["张三(2台)"]);
  assert.equal(engine.getActiveBorrows(s).length, 1);
});

// ---------- Excel 导入 ----------
test("Excel 导入：映射/分类/去重/更新", () => {
  const s = engine.createState();
  const rows = [{ "物料名称": "MV-CH120-20UM(国内标配)V4.0", "数量": 3, "存放位置": "柜A", "备注": "x" }];
  const r = engine.importExcelRows(s, rows, "append");
  assert.equal(r.added, 1);
  assert.equal(s.materials[0].category, "工业相机");
  assert.equal(s.materials[0].quantity, 3);

  const r2 = engine.importExcelRows(s, rows, "append");
  assert.equal(r2.skipped, 1);

  const r3 = engine.importExcelRows(s, [{ "物料名称": "MV-CH120-20UM(国内标配)V4.0", "数量": 8 }], "update");
  assert.equal(r3.updated, 1);
  assert.equal(s.materials[0].quantity, 8);
});

// ---------- 还回密码门槛（模拟 app.js 的 doReturn 流程） ----------
test("还回密码门槛：错密码记日志+拒绝，对密码放行", async () => {
  const s = engine.createState();
  s.passwordHash = await engine.hashPassword("admin123");
  engine.addMaterial(s, { name: "X", quantity: 5 });
  engine.borrowMaterial(s, { name: "X", quantity: 2, person: "张三" });

  // 错误密码 → 拒绝，记录「归还密码错误」，库存不变
  const wrongOk = await engine.verifyPassword(s.passwordHash, "wrong");
  assert.equal(wrongOk, false);
  engine.log(s, "归还密码错误", "X", 0, 0, "张三");
  assert.ok(s.logs.some((l) => l.type === "归还密码错误"));
  assert.equal(s.materials[0].quantity, 3); // 未被归还

  // 正确密码 → 放行，完成归还
  const rightOk = await engine.verifyPassword(s.passwordHash, "admin123");
  assert.equal(rightOk, true);
  engine.returnMaterial(s, { name: "X", quantity: 2, person: "张三" });
  assert.equal(engine.getStats(s).borrowed, 0);
  assert.equal(s.materials[0].quantity, 5);
});

// ---------- 种子数据 ----------
test("种子数据可加载且结构完整", () => {
  const raw = readFileSync(new URL("../data/data.json", import.meta.url), "utf-8");
  const d = JSON.parse(raw);
  assert.ok(d.materials.length > 0, "物料非空");
  assert.equal(typeof d.passwordHash, "string");
  assert.ok(Array.isArray(d.borrows) && Array.isArray(d.logs));
});
