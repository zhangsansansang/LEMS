// classifier.js — 物料自动分类（移植自 classifier.py）
// 策略：关键词优先（控制器/软件）→ 产品代号前缀匹配 → 兜底「其他物料」

export const PRODUCT_CODE_MAP = {
  // --- 工业相机（统一） ---
  "MV-CH": "工业相机",
  "MV-CS": "工业相机",
  "MV-CU": "工业相机",
  "MV-CL": "线阵相机",
  // --- 智能相机 ---
  "MV-SC": "智能相机",
  // --- 3D 视觉 ---
  "MV-DP": "线激光轮廓仪",
  "MV-DLS": "3D视觉类",
  // --- 读码器 ---
  "MV-ID": "智能读码器",
  // --- 采集卡 ---
  "MV-GE": "采集卡",
  "MV-GS": "采集卡",
  "MV-GU": "采集卡",
  // --- 工业镜头 ---
  "MVL": "工业镜头",
  "LF": "工业镜头",
  // --- 视觉光源 ---
  "MV-LB": "视觉光源",
  "MV-LC": "视觉光源",
  "MV-LD": "视觉光源",
  "MV-LE": "视觉光源",
  "MV-LG": "视觉光源",
  "MV-LL": "视觉光源",
  "MV-LR": "视觉光源",
  "MV-LT": "视觉光源",
  "MV-LW": "视觉光源",
  "MV-LODIS": "视觉光源",
  "MV-DAPS": "视觉光源",
  // --- 视觉软件 ---
  "IMVS": "视觉软件",
  "OLP": "视觉软件",
  "MV-MVS": "视觉软件",
  "MV-RVM": "视觉软件",
  // --- 工控设备 ---
  "MV-IPC": "工控设备",
  // --- 视觉配件 ---
  "MV-AC": "视觉配件",
  "MV-DA": "视觉配件",
  "MV-DL": "视觉配件",
  "MV-MZ": "视觉配件",
  "MV-SL": "视觉配件",
  "MV-SV": "视觉配件",
  "MV-VC": "视觉配件",
};

const RE_CODE = /(?:imvs|OLP|LF|MVL(?=[-\d])|MV-[A-Z]+)/i;

export function extractCodePrefix(text) {
  const matches = String(text || "").match(RE_CODE);
  if (matches) return matches[0].toUpperCase();
  return null;
}

export function classify(name = "", description = "") {
  const searchText = ((description || "") + " " + (name || "")).toLowerCase();

  // 第一级：关键词优先（控制器、软件）
  if (searchText.includes("控制器")) return "光源控制器";
  if (searchText.includes("软件")) return "视觉软件";

  // 第二级：产品代号前缀匹配
  if (description) {
    const prefix = extractCodePrefix(description);
    if (prefix) {
      for (let end = prefix.length; end > 1; end--) {
        const candidate = prefix.slice(0, end);
        if (PRODUCT_CODE_MAP[candidate]) return PRODUCT_CODE_MAP[candidate];
      }
    }
  }

  return "其他物料";
}
