(() => {
  const dataUrl = new URL("data/projects.json", document.baseURI);
  const stateKey = "open-source-radar-v1";
  const categories = { all: "今日精选", tools: "实用工具", learning: "学习资料", resources: "资源目录", saved: "我的收藏" };
  const categoryMeta = {
    tools: { label: "实用工具", icon: "⌘", color: "mint" },
    learning: { label: "学习资料", icon: "▤", color: "blue" },
    resources: { label: "资源目录", icon: "▧", color: "peach" },
  };
  const readState = () => { try { return JSON.parse(localStorage.getItem(stateKey)) || { saved: [], statuses: {} }; } catch { return { saved: [], statuses: {} }; } };
  let personal = readState();
  let projects = [];
  let dataset = {};
  let category = "all";

  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dateLabel = (value) => {
    if (!value) return "暂无记录";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "暂无记录";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
  };
  const compact = (n) => new Intl.NumberFormat("zh-CN", { notation: n > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n || 0);
  const safeUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };

  function persist() {
    localStorage.setItem(stateKey, JSON.stringify(personal));
    render();
  }

  function visibleProjects() {
    const query = $("#search-input").value.trim().toLowerCase();
    const sort = $("#sort-select").value;
    let list = projects.filter((project) => {
      const saved = personal.saved.includes(String(project.id));
      if (category === "saved" && !saved) return false;
      if (["tools", "learning", "resources"].includes(category) && project.category !== category) return false;
      return !query || [project.full_name, project.description, project.language, project.reason].join(" ").toLowerCase().includes(query);
    });
    list.sort((a, b) => sort === "updated" ? new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0) : sort === "name" ? a.full_name.localeCompare(b.full_name) : b.stars - a.stars);
    return list;
  }

  function card(project) {
    const id = String(project.id);
    const meta = categoryMeta[project.category] || categoryMeta.resources;
    const saved = personal.saved.includes(id);
    const status = personal.statuses[id] || "";
    const releaseUrl = safeUrl(project.release?.url || "");
    const release = releaseUrl ? `<a class="release-link" href="${escapeHTML(releaseUrl)}" target="_blank" rel="noopener" title="${escapeHTML(project.release.name)}">新版 ${escapeHTML(project.release.tag)}</a>` : "";
    const language = escapeHTML(project.language || "未标注");
    const homepageUrl = safeUrl(project.homepage || "");
    const homepage = homepageUrl ? `<a class="card-home" href="${escapeHTML(homepageUrl)}" target="_blank" rel="noopener">项目主页 ↗</a>` : "";
    return `<article class="project-card">
      <div class="card-top"><span class="category-tag ${meta.color}"><span>${meta.icon}</span>${meta.label}</span><button class="save-button ${saved ? "saved" : ""}" data-save="${escapeHTML(id)}" aria-label="${saved ? "取消收藏" : "收藏项目"}" title="${saved ? "取消收藏" : "收藏项目"}">${saved ? "♥" : "♡"}</button></div>
      <a class="repo-name" href="${escapeHTML(project.html_url)}" target="_blank" rel="noopener"><span>${escapeHTML(project.owner)}<i>/</i><b>${escapeHTML(project.name)}</b></span><span class="external-arrow">↗</span></a>
      <p class="repo-description">${escapeHTML(project.description)}</p>
      <p class="why-line"><span>✳</span>${escapeHTML(project.reason || "来自 GitHub 公开项目发现")}</p>
      <div class="card-tags"><span class="free-tag"><i></i>免费状态待核实</span>${release}</div>
      <div class="card-bottom"><div class="repo-stats"><span title="Stars">☆ ${compact(project.stars)}</span><span title="主要语言"><i class="language-dot"></i>${language}</span></div><span class="update-date">更新于 ${dateLabel(project.pushed_at)}</span></div>
      <div class="card-actions"><button class="status-button ${status === "used" ? "chosen" : ""}" data-status="used" data-id="${escapeHTML(id)}">✓ 已使用</button><button class="status-button ${status === "learned" ? "chosen" : ""}" data-status="learned" data-id="${escapeHTML(id)}">▤ 已学习</button>${homepage}</div>
    </article>`;
  }

  function render() {
    const list = visibleProjects();
    $("#project-grid").innerHTML = list.map(card).join("");
    $("#project-grid").hidden = list.length === 0;
    $("#empty-state").hidden = list.length !== 0;
    $("#result-count").textContent = list.length;
    $("#section-title").innerHTML = `${categories[category]} <span id="result-count">${list.length}</span>`;
    $("#crumb-current").textContent = categories[category];
    $("#stat-total").textContent = projects.length;
    $("#count-all").textContent = projects.length;
    $("#count-saved").textContent = personal.saved.length;
    for (const key of ["tools", "learning", "resources"]) $("#count-" + key).textContent = projects.filter((p) => p.category === key).length;
    $("#empty-title").textContent = category === "saved" ? "还没有收藏项目" : "没有找到匹配项目";
    $("#empty-description").textContent = category === "saved" ? "点开项目卡片上的♡，收藏后会保存在这台设备的浏览器中。" : "试试其他关键词或分类。数据首次同步后会自动显示结果。";
  }

  async function loadData() {
    const button = $("#refresh-button");
    button.classList.add("spinning");
    $("#sync-label").textContent = "正在读取最新数据";
    try {
      const response = await fetch(`${dataUrl.href}?_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`数据文件不可用（${response.status}）`);
      dataset = await response.json();
      projects = Array.isArray(dataset.projects) ? dataset.projects : [];
      const generated = dataset.generated_at ? new Date(dataset.generated_at) : null;
      const synced = generated && !Number.isNaN(generated.valueOf()) ? dateLabel(generated) : "等待首次同步";
      $("#sync-label").textContent = dataset.generated_at ? `上次更新 ${synced}` : "等待首次同步";
      $("#result-date").textContent = dataset.generated_at ? `采集于 ${synced}` : "等待 GitHub Actions 首次运行";
      const isPartial = (dataset.status || "").includes("部分");
      $("#data-status").className = `status-pill ${isPartial ? "partial" : dataset.generated_at ? "ok" : "pending"}`;
      $("#data-status").innerHTML = `<span></span>${escapeHTML(dataset.status || "等待同步")}`;
      const issues = dataset.errors?.length ? `同步提示：${dataset.errors.slice(0, 3).join("；")}` : "";
      const warnings = [dataset.warning, issues].filter(Boolean).join(" ");
      $("#notice").hidden = !warnings;
      $("#notice").textContent = warnings;
      $("#footer-update").textContent = dataset.generated_at ? `LAST SYNC: ${generated.toLocaleString("zh-CN")}` : "DATA SOURCE: GITHUB REST API";
    } catch (error) {
      $("#sync-label").textContent = "暂时无法读取数据";
      $("#data-status").className = "status-pill partial";
      $("#data-status").innerHTML = "<span></span>数据读取失败";
      $("#result-date").textContent = "检查网络或稍后重试";
      $("#notice").hidden = false;
      $("#notice").textContent = `${error.message}。本页面不会清除保存在浏览器中的收藏。`;
    } finally {
      button.classList.remove("spinning");
      render();
    }
  }

  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    category = button.dataset.category;
    render();
  }));
  $("#project-grid").addEventListener("click", (event) => {
    const save = event.target.closest("[data-save]");
    if (save) {
      const id = save.dataset.save;
      personal.saved = personal.saved.includes(id) ? personal.saved.filter((item) => item !== id) : [...personal.saved, id];
      persist();
      return;
    }
    const status = event.target.closest("[data-status]");
    if (status) {
      const id = status.dataset.id;
      if (personal.statuses[id] === status.dataset.status) delete personal.statuses[id];
      else personal.statuses[id] = status.dataset.status;
      persist();
    }
  });
  $("#search-input").addEventListener("input", render);
  $("#sort-select").addEventListener("change", render);
  $("#refresh-button").addEventListener("click", loadData);
  $("#empty-refresh").addEventListener("click", loadData);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); }
  });
  render();
  loadData();
})();

