// parser.js — 自然语言操作解析（移植自 data_manager.py 的 parse_operation）
// 支持中文数字与阿拉伯数字、常见单位；借出/归还需人名。

const CN_NUM = {
  "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "零": 0,
};

export function parseCnNumber(s) {
  s = String(s).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s in CN_NUM) return CN_NUM[s];
  if (s.startsWith("十") && s.length === 2) return 10 + (CN_NUM[s[1]] || 0);
  if (s.length === 2 && s.endsWith("十")) return (CN_NUM[s[0]] || 0) * 10;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 1 : n;
}

// 返回 { result, error }，成功时 result = { date, person, action, material, qty }
export function parseOperation(text) {
  text = String(text).trim();
  if (!text) return { result: null, error: "请输入操作描述" };

  let remaining = text;
  const now = new Date();
  let dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
  let person = "";

  // 1. 提取日期: X月X日[，,]
  const dm = remaining.match(/^(\d{1,2})月(\d{1,2})日[，,]\s*(.+)/);
  if (dm) {
    dateStr = `${dm[1]}月${dm[2]}日`;
    remaining = dm[3];
  }

  // 2. 提取 人名 + 动作
  let actionRaw = "";
  let materialPart = "";
  const pa = remaining.match(/^([一-龥]{2,4})(新增入库|借出|领用|归还|报废|入库)(.+)/);
  if (pa) {
    person = pa[1];
    actionRaw = pa[2];
    materialPart = pa[3];
    // 防止 "新增入库" 被误拆为 person="新增" action="入库"
    if (person === "新增" && actionRaw === "入库") {
      const am2 = remaining.match(/^(新增入库)(.+)/);
      if (am2) {
        person = "";
        actionRaw = "新增入库";
        materialPart = am2[2];
      }
    }
  } else {
    const am = remaining.match(/^(新增入库|借出|领用|归还|报废|入库)(.+)/);
    if (am) {
      actionRaw = am[1];
      materialPart = am[2];
    } else {
      return { result: null, error: "无法识别操作类型，支持：借出/领用/归还/新增入库/报废" };
    }
  }

  const ACTION_MAP = {
    "借出": "借出领用", "领用": "借出领用",
    "归还": "归还入库",
    "入库": "新增入库", "新增入库": "新增入库",
    "报废": "闲置报废",
  };
  const action = ACTION_MAP[actionRaw] || actionRaw;

  if ((action === "借出领用" || action === "归还入库") && !person) {
    return { result: null, error: "借出和归还必须填写人名！\n正确格式：5月17日，李晓源借出CL042-91GM一台" };
  }

  // 3. 提取数量（末尾的数字+可选单位，需与前文有空格或为纯中文数字）
  let materialName = materialPart.trim();
  let qty = 1;
  const unit = "(台|个|件|套|条|只|根|块|把|张)?";
  let qm = materialPart.match(new RegExp(`\\s+([\\d一两二三四五六七八九十]+)\\s*${unit}\\s*$`));
  if (!qm) {
    qm = materialPart.match(new RegExp(`([一两二三四五六七八九十]+)\\s*${unit}\\s*$`));
  }
  if (qm) {
    qty = parseCnNumber(qm[1]);
    materialName = materialPart.slice(0, qm.index).trim();
  }

  if (!materialName) return { result: null, error: "未识别到物料名称" };

  return {
    result: { date: dateStr, person, action, material: materialName, qty },
    error: null,
  };
}
