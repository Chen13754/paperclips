(function () {
    "use strict";
    function exportOriginal() {
        var script = document.createElement("script");
        script.src = "https://chen13754.github.io/paperclips/save-files.js";
        script.onload = function () { window.PaperclipSaves.exportFile(); };
        script.onerror = function () { alert("导出工具加载失败。请检查网络后重试，原存档未改变。"); };
        document.head.appendChild(script);
    }
    var code = document.getElementById("migrationCode");
    code.value = "javascript:(" + exportOriginal.toString() + ")()";
    document.getElementById("copyMigration").addEventListener("click", async function () {
        var status = document.getElementById("copyStatus");
        try {
            await navigator.clipboard.writeText(code.value);
            status.textContent = "已复制。请到原游戏页面使用。";
        } catch (_) {
            code.focus();
            code.select();
            status.textContent = "请手动复制已选中的脚本。";
        }
    });
})();
