// store.js — 持久化层：GitHub Contents API（乐观锁） 或 浏览器 localStorage（兜底）

// UTF-8 安全的 base64 编解码（GitHub Contents API 要求 base64）
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubStore {
  constructor({ owner, repo, branch = "main", token, path = "data/data.json" }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.path = path;
    this.apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    this.sha = null;
  }

  _headers() {
    const h = { Accept: "application/vnd.github+json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async load() {
    const res = await fetch(`${this.apiUrl}?ref=${this.branch}`, {
      headers: this._headers(),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`读取失败 HTTP ${res.status}: ${await res.text()}`);
    const j = await res.json();
    this.sha = j.sha;
    return JSON.parse(fromBase64(j.content));
  }

  async save(data, { message = "更新数据" } = {}) {
    const content = toBase64(JSON.stringify(data, null, 2));
    const body = { message, content, branch: this.branch };
    if (this.sha) body.sha = this.sha;
    const res = await fetch(this.apiUrl, {
      method: "PUT",
      headers: { ...this._headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`写入失败 HTTP ${res.status}: ${text}`);
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    this.sha = j.content.sha;
    return j;
  }
}

export class LocalStorageStore {
  constructor(key = "lab_materials_data") {
    this.key = key;
  }
  async load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  async save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
    return data;
  }
}
