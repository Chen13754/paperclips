(function () {
    "use strict";
    function exportOriginal() {
        var id = "paperclipsMigration";
        if (document.getElementById(id)) return;
        var panel = document.createElement("section");
        panel.id = id;
        panel.setAttribute("aria-label", "原网页存档导出");
        panel.style.cssText = "position:fixed;z-index:2147483647;top:12px;left:12px;right:12px;max-width:38em;max-height:85vh;overflow:auto;box-sizing:border-box;padding:1em;border:2px solid #245599;background:white;color:#222;box-shadow:0 4px 24px #0005;text-align:left;font:" +
            (matchMedia("(pointer:coarse)").matches ? "max(18px,4vw)" : "18px") + "/1.6 system-ui,sans-serif";
        var status = document.createElement("p");
        status.textContent = "脚本已执行，正在加载导出工具……";
        status.setAttribute("role", "status");
        var close = document.createElement("button");
        close.textContent = "关闭";
        close.style.cssText = "font:inherit;padding:.4em .8em";
        close.onclick = function () { panel.remove(); };
        panel.append(status, close);
        document.documentElement.appendChild(panel);
        if (typeof window.save !== "function") {
            status.textContent = "请关闭此面板，回到有进度的原游戏页面再执行脚本。";
            return;
        }
        if (window.PaperclipSaves && window.PaperclipSaves.openMigration) {
            window.PaperclipSaves.openMigration(panel);
            return;
        }
        var script = document.createElement("script");
        script.src = "https://chen13754.github.io/paperclips/save-files.js?migration=2";
        var timeout = setTimeout(function () {
            status.textContent = "导出工具仍未加载。请检查网络，关闭面板后重试。";
        }, 15000);
        script.onload = function () {
            clearTimeout(timeout);
            if (!panel.isConnected) return;
            if (window.PaperclipSaves && window.PaperclipSaves.openMigration) {
                window.PaperclipSaves.openMigration(panel);
            } else {
                status.textContent = "导出工具版本不匹配。请刷新迁移帮助页，重新复制脚本。";
            }
        };
        script.onerror = function () {
            clearTimeout(timeout);
            status.textContent = "导出工具加载失败。请检查网络，关闭面板后重试；原存档未改变。";
        };
        document.head.appendChild(script);
    }
    var code = document.getElementById("migrationCode");
    code.value = "javascript:void(" + exportOriginal.toString().replace(/\s*\n\s*/g, " ") + ")()";
    async function copy(bodyOnly) {
        var status = document.getElementById("copyStatus");
        var value = bodyOnly ? code.value.slice("javascript:".length) : code.value;
        try {
            await navigator.clipboard.writeText(value);
            status.textContent = bodyOnly ? "已复制正文。回到原游戏：地址栏先手动输入 javascript:，再粘贴正文，最后点前往。" :
                "已复制完整脚本。请到原游戏页面使用。";
        } catch (_) {
            code.focus();
            code.setSelectionRange(bodyOnly ? "javascript:".length : 0, code.value.length);
            status.textContent = "请手动复制已选中的脚本。";
        }
    }
    document.getElementById("copyMigration").addEventListener("click", function () { copy(false); });
    document.getElementById("copyMigrationBody").addEventListener("click", function () { copy(true); });
})();
