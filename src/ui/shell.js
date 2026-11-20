// TH2 双模式壳启动（FR-001）：两页面共用本模块——同一渲染入口、同一存储键读取
// M1-2：主题应用（FR-045/054）+ 单击选中（FR-036）；M3-1：文件导入导出与本地备份
import * as store from "../core/store.js";
import * as io from "../core/import-export.js";

// FR-045/054：主题解析——仅接受 light，其余（含缺省）一律深色
export function themeOf(settings) {
  return settings && settings.theme === "light" ? "light" : "dark";
}

// FR-054：把主题写到文档根节点，触发 CSS 变量整站切换
export function applyTheme(doc, theme) {
  doc.documentElement.setAttribute("data-theme", theme);
}

export async function bootShell(root) {
  const initial = await store.loadAll();
  let m = {
    windows: initial.windows,
    groups: initial.groups,
    tabs: initial.tabs,
    trash: initial.trash,
    settings: initial.settings,
  };
  let settings = initial.settings;
  applyTheme(document, themeOf(settings));
  const body = root.querySelector("#spBody");
  const { renderTree, renderEmpty, renderStats } = await import("./render.js");
  const status = root.querySelector("#dataStatus");
  const say = (text) => {
    if (status) status.textContent = text;
  };
  const render = () => {
    body.innerHTML = m.windows.length ? renderTree(m) : renderEmpty();
    const stats = root.querySelector("#stats");
    if (stats) stats.textContent = renderStats(m);
  };
  const refreshBackups = async () => {
    const list = root.querySelector("#backupList");
    if (!list) return;
    const backups = await io.getBackupList(chrome);
    list.replaceChildren(
      ...backups.map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.ts} · ${item.count} 条 · ${item.filename}`;
        return option;
      })
    );
  };
  render();
  const panel = root.querySelector("#dataPanel");
  const syncBackupFields = () => {
    const target = root.querySelector("#backupTarget");
    const ghFields = root.querySelector("#githubBackupFields");
    if (target) target.value = settings.backupTarget || "local";
    if (ghFields) ghFields.hidden = (settings.backupTarget || "local") !== "github";
    for (const [id, key, fallback] of [
      ["ghRepo", "ghRepo", ""],
      ["ghBranch", "ghBranch", "main"],
      ["ghPath", "ghPath", "tabharbor-bookmarks.html"],
      ["ghToken", "ghToken", ""],
    ]) {
      const field = root.querySelector(`#${id}`);
      if (field && document.activeElement !== field) field.value = settings[key] || fallback;
    }
    const frequency = root.querySelector("#ghBackupFreq");
    if (frequency) frequency.value = settings.ghBackupFreq || "off";
  };
  root.querySelector("#btnSettings")?.addEventListener("click", async () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      syncBackupFields();
      await refreshBackups();
    }
  });
  root.querySelector("#btnDataClose")?.addEventListener("click", () => {
    panel.hidden = true;
  });
  root.querySelector("#btnExportJson")?.addEventListener("click", async () => {
    const content = await io.exportJSON(m, settings);
    await io.triggerDownload("tabharbor-export-" + Date.now() + ".json", content, chrome.downloads);
    say("JSON 已导出");
  });
  root.querySelector("#btnExportHtml")?.addEventListener("click", async () => {
    const content = await io.exportHTML(m);
    await io.triggerDownload(
      "tabharbor-bookmarks-" + Date.now() + ".html",
      content,
      chrome.downloads
    );
    say("HTML 书签已导出");
  });
  root
    .querySelector("#btnImportFile")
    ?.addEventListener("click", () => root.querySelector("#importFile")?.click());
  root.querySelector("#importFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let imported;
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        imported = await io.importJSON(parsed, m);
        if (parsed.settings) imported.settings = parsed.settings;
        else imported.settings = settings;
      } else if (file.name.toLowerCase().endsWith(".html")) {
        imported = await io.importHTML(text, m);
        imported.trash = [];
        imported.settings = settings;
      } else {
        throw new Error("仅支持 .json 或 .html 文件");
      }
      if (!window.confirm("导入会全量替换当前树数据，是否继续？")) return;
      await store.saveModel(imported);
      m = imported;
      if (imported.settings) settings = await store.saveSettings(imported.settings);
      render();
      say("导入完成，树数据已替换");
    } catch (error) {
      say("导入失败：" + error.message);
    } finally {
      event.target.value = "";
    }
  });
  root.querySelector("#btnBackupNow")?.addEventListener("click", async () => {
    try {
      if ((settings.backupTarget || "local") === "github") {
        const result = await io.runAutoBackup(chrome, m, settings);
        say(`GitHub HTML 备份完成：${result.path}`);
      } else {
        await io.manualBackup(m, settings, chrome.downloads, chrome);
        await refreshBackups();
        say("已创建可恢复快照并下载 JSON 备份");
      }
    } catch (error) {
      say("备份失败：" + error.message);
    }
  });
  const saveGitHubSettings = async (patch) => {
    try {
      settings = await store.saveSettings(patch);
      m.settings = settings;
      syncBackupFields();
      say("GitHub 备份设置已保存");
    } catch (error) {
      say("设置保存失败：" + error.message);
    }
  };
  root.querySelector("#backupTarget")?.addEventListener("change", (event) => {
    const target = event.target.value === "github" ? "github" : "local";
    if (target === "github") {
      for (const [id, key] of [
        ["ghRepo", "ghRepo"],
        ["ghBranch", "ghBranch"],
        ["ghPath", "ghPath"],
        ["ghToken", "ghToken"],
      ]) {
        const field = root.querySelector(`#${id}`);
        if (field) field.value = settings[key] || "";
      }
    }
    void saveGitHubSettings({ backupTarget: target });
    const fields = root.querySelector("#githubBackupFields");
    if (fields) fields.hidden = target !== "github";
  });
  root
    .querySelector("#ghBackupFreq")
    ?.addEventListener(
      "change",
      (event) => void saveGitHubSettings({ ghBackupFreq: event.target.value })
    );
  root.querySelector("#btnAuthorizeGithub")?.addEventListener("click", async () => {
    try {
      const patch = {
        ghRepo: root.querySelector("#ghRepo")?.value.trim() || "",
        ghBranch: root.querySelector("#ghBranch")?.value.trim() || "main",
        ghPath: root.querySelector("#ghPath")?.value.trim() || "tabharbor-bookmarks.html",
        ghToken: root.querySelector("#ghToken")?.value || "",
        backupTarget: "github",
      };
      if (!patch.ghRepo || !patch.ghToken || !patch.ghPath || !patch.ghBranch) {
        say("请填写仓库地址、分支、文件路径和访问令牌");
        return;
      }
      const granted = await chrome.permissions.request({ origins: ["https://api.github.com/*"] });
      if (!granted) {
        say("未授予 GitHub 权限；未开始备份");
        return;
      }
      await saveGitHubSettings(patch);
      say("GitHub 权限已授权，配置已保存在本机扩展存储");
    } catch (error) {
      say("GitHub 授权失败：" + error.message);
    }
  });
  root.querySelector("#btnRestoreBackup")?.addEventListener("click", async () => {
    const backupId = root.querySelector("#backupList")?.value;
    if (!backupId) {
      say("请先选择一个本地快照");
      return;
    }
    if (!window.confirm("恢复会全量替换当前树数据与设置，是否继续？")) return;
    try {
      const restored = await io.restoreBackup(backupId, m, chrome);
      await store.saveModel(restored);
      m = restored;
      if (restored.settings) settings = await store.saveSettings(restored.settings);
      render();
      say("快照已恢复");
    } catch (error) {
      say("恢复失败：" + error.message);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (["windows", "groups", "tabs", "trash"].some((key) => changes[key])) {
      m = {
        ...m,
        ...Object.fromEntries(
          ["windows", "groups", "tabs", "trash"]
            .filter((key) => changes[key])
            .map((key) => [key, changes[key].newValue || []])
        ),
      };
      render();
    }
    if (changes.settings) {
      settings = changes.settings.newValue || {};
      m.settings = settings;
      applyTheme(document, themeOf(settings));
      syncBackupFields();
    }
  });
  body.addEventListener("click", (e) => {
    const el = e.target.closest(".node");
    if (!el) return;
    body.querySelectorAll(".node-selected").forEach((x) => x.classList.remove("node-selected"));
    el.classList.add("node-selected");
  });
  return m;
}
