/* Universal Paperclips file saves. No save data leaves this browser. */
(function (root) {
    "use strict";

    var keys = ["saveGame", "saveProjectsUses", "saveProjectsFlags",
        "saveProjectsActive", "saveStratsActive", "savePrestige"];
    var format = "paperclips-save";
    var contract = null;
    var recovery = false;
    var saveWarning = "";

    function initialize(snapshot) {
        // Freeze the native defaults before loading, rather than sampling the current phase.
        if (!contract) contract = snapshot.saveGame;
    }

    function paused() { return recovery || root.fullRestartPending === true; }

    function report(message) {
        saveWarning = message;
        var status = root.document.getElementById("saveStatus");
        if (status) status.textContent = message;
    }

    function serializeCurrent() {
        check(!recovery, "当前存档尚未成功读取，请先备份原始数据或导入有效存档。");
        var snapshot = root.getSaveSnapshot();
        var values = {};
        keys.slice(0, 5).forEach(function (key) { values[key] = JSON.stringify(snapshot[key]); });
        values.savePrestige = root.prestigeU || root.prestigeS ?
            JSON.stringify({ prestigeU: root.prestigeU, prestigeS: root.prestigeS }) : null;
        return values;
    }

    function saveCurrent() {
        if (paused()) return false;
        try {
            var values = serializeCurrent();
            // Preserve an explicit zero prestige record, too.
            if (values.savePrestige === null) values.savePrestige = root.localStorage.getItem("savePrestige");
            writeStorage(values, root.localStorage, "保存失败，已保留上次存档。当前进度仍在运行，请导出备份并检查存储权限或空间。");
            if (saveWarning) report("");
            return true;
        } catch (error) {
            report(error.message + " 当前进度仍在内存中，请导出备份。");
            return false;
        }
    }

    function check(condition, message) {
        if (!condition) throw new Error(message);
    }

    function record(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function readStorage(storage) {
        var result = {};
        keys.forEach(function (key) { result[key] = storage.getItem(key); });
        return result;
    }

    function capture() {
        check(typeof root.save === "function", "请先打开正在游玩的回形针游戏页面。");
        var storage;
        if (typeof root.getSaveSnapshot === "function") {
            // Downloads must remain available even when browser storage rejects every write.
            storage = serializeCurrent();
            try {
                if (storage.savePrestige === null) storage.savePrestige = root.localStorage.getItem("savePrestige");
            } catch (_) { /* The running game's prestige is already captured above. */ }
            root.save();
        } else {
            // One-time exporter on the unmodified upstream page.
            root.save();
            storage = readStorage(root.localStorage);
        }
        keys.slice(0, 5).forEach(function (key) {
            check(typeof storage[key] === "string", "未找到完整游戏进度，无法导出。");
        });
        return { format: format, version: 1, exportedAt: new Date().toISOString(), storage: storage };
    }

    function filename(date) {
        function pad(value) { return String(value).padStart(2, "0"); }
        return "paperclips-" + date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" +
            pad(date.getDate()) + "_" + pad(date.getHours()) + "-" + pad(date.getMinutes()) +
            "-" + pad(date.getSeconds()) + ".json";
    }

    function download(envelope, name) {
        var blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var link = root.document.createElement("a");
        link.href = url;
        link.download = name || filename(new Date(envelope.exportedAt));
        root.document.body.appendChild(link);
        link.click();
        link.remove();
        root.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function validate(envelope) {
        check(record(envelope) && envelope.format === format, "这不是本游戏的存档文件。");
        check(envelope.version === 1, "不支持这个存档版本，请使用版本 1 的存档。");
        check(typeof envelope.exportedAt === "string" &&
            Number.isFinite(Date.parse(envelope.exportedAt)), "存档日期无效。");
        check(record(envelope.storage), "存档缺少游戏数据。");
        var parsed = {};
        keys.forEach(function (key) {
            var value = envelope.storage[key];
            if (key === "savePrestige" && value === null) return;
            check(typeof value === "string", "存档数据不完整：" + key);
            try { parsed[key] = JSON.parse(value); }
            catch (_) { throw new Error("存档数据损坏：" + key); }
        });

        // Reuse the game's own snapshot as the field contract; no second list of hundreds of fields.
        if (!contract) initialize(root.getSaveSnapshot());
        var expected = contract;
        var game = parsed.saveGame;
        check(record(game), "主进度格式无效。");
        Object.keys(expected).forEach(function (field) {
            check(Object.prototype.hasOwnProperty.call(game, field), "主进度缺少字段：" + field);
            var actual = game[field];
            var sample = expected[field];
            var valid;
            // Upstream stores these titles as either text or serialized DOM Text nodes.
            if (field === "battleName" || field === "threnodyTitle") {
                valid = typeof actual === "string" || (record(actual) && Object.keys(actual).length === 0);
            } else if (field === "creativityOn") {
                // Native research writes booleans; legacy helpers also write numeric 0/1.
                valid = typeof actual === "boolean" || actual === 0 || actual === 1;
            } else if (field === "pick" || field === "sliderPos") {
                // <select>.value changes this field from a number to a numeric string.
                valid = (typeof actual === "number" || typeof actual === "string") &&
                    String(actual).trim() !== "" && Number.isFinite(Number(actual));
            } else if (Array.isArray(sample)) {
                valid = Array.isArray(actual);
            } else if (typeof sample === "number" || sample === null) {
                // Only these derived values legitimately serialize NaN/Infinity in native saves.
                valid = (actual === null && ["avgRev", "giftCountdown"].indexOf(field) !== -1) ||
                    (typeof actual === "number" && Number.isFinite(actual));
            } else {
                valid = typeof actual === typeof sample;
            }
            check(valid, "主进度字段格式无效：" + field);
        });

        function array(key, length, predicate) {
            var values = parsed[key];
            check(Array.isArray(values) && (length === null || values.length === length) &&
                values.every(predicate), "存档数据格式无效：" + key);
        }
        array("saveProjectsUses", root.projects.length, function (value) {
            return Number.isInteger(value) && value >= 0;
        });
        array("saveProjectsFlags", root.projects.length, function (value) { return value === 0 || value === 1; });
        array("saveStratsActive", root.allStrats.length, function (value) { return value === 0 || value === 1; });
        var projectIds = root.projects.map(function (project) { return project.id; });
        array("saveProjectsActive", null, function (id) { return projectIds.indexOf(id) !== -1; });
        check(new Set(parsed.saveProjectsActive).size === parsed.saveProjectsActive.length,
            "存档包含重复的项目。");
        var strategyFlags = parsed.saveStratsActive;
        check(strategyFlags[0] === 1 && strategyFlags.every(function (flag, index) {
            return flag === 0 || index === 0 || strategyFlags[index - 1] === 1;
        }), "策略解锁顺序无效。");
        var pick = Number(game.pick);
        check(Number.isInteger(pick) && (pick === 10 || (pick >= 0 && strategyFlags[pick] === 1)), "比赛策略无效。");
        check(Number.isInteger(Number(game.sliderPos)) && Number(game.sliderPos) >= 0 && Number(game.sliderPos) <= 200,
            "工作／思考分配无效。");
        check(Number.isInteger(game.nextQchip) && game.nextQchip >= 0 && game.nextQchip <= expected.qChips.length,
            "量子芯片索引无效。");
        check(game.nextQchip < expected.qChips.length || parsed.saveProjectsActive.indexOf("projectButton51") === -1,
            "量子芯片已满，不能保留购买项目。");
        check(game.margin > 0 && [1, 5, 7].indexOf(game.riskiness) !== -1, "价格或投资风险无效。");
        check(game.maxPort === 5 && game.portfolioSize === game.stocks.length && game.stocks.length <= 5,
            "持仓数量无效。");
        check([0, 1].indexOf(game.humanFlag) !== -1 && [0, 1].indexOf(game.spaceFlag) !== -1 &&
            !(game.humanFlag === 1 && game.spaceFlag === 1) && Number.isInteger(game.dismantle) &&
            game.dismantle >= 0 && game.dismantle <= 7 && game.resetFlag === 2, "游戏阶段数据无效。");
        check(game.maxBattles === 1 && game.battles.length <= game.maxBattles, "战斗数量无效。");

        ["incomeTracker", "battleNumbers"].forEach(function (field) {
            check(game[field].every(function (value) {
                return value === null || (typeof value === "number" && Number.isFinite(value));
            }), "主进度数组格式无效：" + field);
        });
        ["qChips", "stocks", "battles"].forEach(function (field) {
            check(game[field].every(record), "主进度数组格式无效：" + field);
        });
        check(game.battleNumbers.length === expected.battleNumbers.length, "战斗编号数据不完整。");
        check(game.qChips.length === expected.qChips.length, "量子芯片数据不完整。");
        game.qChips.forEach(function (chip) {
            check([chip.waveSeed, chip.value, chip.active].every(function (value) {
                return typeof value === "number" && Number.isFinite(value);
            }), "量子芯片数据格式无效。");
            check(chip.active === 0 || chip.active === 1, "量子芯片购买状态无效。");
        });
        function numericFields(value, fields) {
            return fields.every(function (field) {
                return typeof value[field] === "number" && Number.isFinite(value[field]);
            });
        }
        game.stocks.forEach(function (stock) {
            check(typeof stock.symbol === "string" && numericFields(stock,
                ["id", "price", "amount", "total", "profit", "age"]), "股票数据不完整。");
        });
        game.battles.forEach(function (battle) {
            check(typeof battle.victory === "boolean" && typeof battle.loss === "boolean" &&
                numericFields(battle, ["id", "clipProbes", "drifterProbes", "whiteFlag",
                    "territory", "reportCount", "garbageFlag"]), "战斗数据不完整。");
        });
        if (envelope.storage.savePrestige !== null) {
            var prestige = parsed.savePrestige;
            check(record(prestige) && [prestige.prestigeU, prestige.prestigeS].every(function (value) {
                return Number.isInteger(value) && value >= 0;
            }), "周目数据格式无效。");
        }
        return envelope;
    }

    function boot() {
        initialize(root.getSaveSnapshot());
        try {
            var values = readStorage(root.localStorage);
            var hasProgress = keys.slice(0, 5).some(function (key) { return values[key] !== null; });
            if (hasProgress) validate({ format: format, version: 1, exportedAt: new Date().toISOString(), storage: values });
            else if (values.savePrestige !== null) {
                var prestige = JSON.parse(values.savePrestige);
                check(record(prestige) && [prestige.prestigeU, prestige.prestigeS].every(function (value) {
                    return Number.isInteger(value) && value >= 0;
                }), "周目数据格式无效。");
            }
            if (values.savePrestige !== null) root.loadPrestige();
            if (hasProgress) root.load();
            else if (values.savePrestige !== null) root.refresh();
        } catch (error) {
            recovery = true;
            report("无法读取存档：" + error.message + " 原数据已保留，游戏与自动保存已暂停。");
            if (root.document.body && root.document.body.classList) root.document.body.classList.add("save-recovery");
            var cover = root.document.getElementById("cover");
            if (cover) cover.style.display = "none";
            var panel = root.document.getElementById("storageRecovery");
            if (panel) panel.hidden = false;
        }
    }

    function backupRaw() {
        try {
            var date = new Date();
            download({ format: "paperclips-recovery", exportedAt: date.toISOString(), storage: readStorage(root.localStorage) },
                filename(date).replace("paperclips-", "paperclips-recovery-"));
        } catch (error) { root.alert("原始备份失败：" + error.message); }
    }

    function parse(text) {
        var envelope;
        try { envelope = JSON.parse(text); }
        catch (_) { throw new Error("无法读取存档，请选择完整的 JSON 存档文件。"); }
        return validate(envelope);
    }

    function writeStorage(values, storage, failureMessage) {
        var previous = readStorage(storage);
        var changed = [];
        try {
            keys.forEach(function (key) {
                var value = values[key];
                if (value === previous[key]) return;
                if (value === null) storage.removeItem(key);
                else storage.setItem(key, value);
                changed.push(key);
                check(storage.getItem(key) === value, "浏览器未能保存变更。");
            });
        } catch (error) {
            try {
                // Free only successfully changed keys before restoring, including on quota errors.
                changed.forEach(function (key) { storage.removeItem(key); });
                changed.forEach(function (key) {
                    if (previous[key] !== null) storage.setItem(key, previous[key]);
                });
                changed.forEach(function (key) {
                    check(storage.getItem(key) === previous[key], "存档恢复不完整。");
                });
            } catch (_) {
                throw new Error("浏览器阻止了存档恢复。请勿刷新或关闭页面，当前游戏仍在内存中，请先导出存档。");
            }
            throw new Error(failureMessage);
        }
    }

    function restore(envelope, storage) {
        validate(envelope);
        writeStorage(envelope.storage, storage,
            "导入失败，已保留原存档。请检查浏览器存储空间或权限。");
    }

    function clear(storage) {
        var empty = {};
        keys.forEach(function (key) { empty[key] = null; });
        writeStorage(empty, storage, "重开失败，已保留原存档。请检查浏览器存储权限。");
    }

    function restart(prestige) {
        if (paused()) return false;
        var values = {};
        keys.forEach(function (key) { values[key] = null; });
        try {
            values.savePrestige = prestige ? JSON.stringify(prestige) : root.localStorage.getItem("savePrestige");
            writeStorage(values, root.localStorage, "重开失败，已保留原存档。请检查浏览器存储权限。");
            root.fullRestartPending = true;
            root.location.reload();
            return true;
        } catch (error) { report(error.message); return false; }
    }

    function exportFile() {
        try {
            var envelope = capture();
            download(envelope);
            return envelope;
        } catch (error) {
            root.alert("导出失败：" + error.message);
            return null;
        }
    }

    function openMigration(panel) {
        panel.replaceChildren();
        var title = root.document.createElement("strong");
        title.textContent = "原网页存档导出";
        var status = root.document.createElement("p");
        status.setAttribute("role", "status");
        status.textContent = "工具已就绪。点击下方按钮，保存并下载此刻的进度。";
        var captured = null;

        function button(text, handler) {
            var element = root.document.createElement("button");
            element.type = "button";
            element.textContent = text;
            element.style.cssText = "font:inherit;min-height:44px;padding:.4em .8em;margin:.2em .4em .2em 0";
            element.addEventListener("click", handler);
            return element;
        }
        var exportButton = button("导出存档", function () {
            text.hidden = true;
            text.value = "";
            captured = exportFile();
            status.textContent = captured ? "已发起下载：" + filename(new Date(captured.exportedAt)) +
                "。若未出现文件，可使用「显示存档文本」。" : "导出失败，请根据弹窗提示处理。";
        });
        var text = root.document.createElement("textarea");
        text.readOnly = true;
        text.hidden = true;
        text.setAttribute("aria-label", "存档 JSON 文本");
        text.style.cssText = "box-sizing:border-box;width:100%;height:8em;font:inherit";
        var showText = button("显示存档文本", function () {
            try {
                var envelope = captured || capture();
                text.value = JSON.stringify(envelope, null, 2);
                text.hidden = false;
                text.focus();
                text.select();
                status.textContent = "请长按文本、全选并复制，传到电脑后保存为 " +
                    filename(new Date(envelope.exportedAt)) + "（纯文本文件）。再在新版导入。";
            } catch (error) {
                status.textContent = "无法读取存档：" + error.message;
            }
        });
        var close = button("关闭", function () { panel.remove(); });
        panel.append(title, status, exportButton, showText, close, text);
    }

    root.PaperclipSaves = { capture: capture, filename: filename, parse: parse,
        restore: restore, clear: clear, exportFile: exportFile, openMigration: openMigration,
        initialize: initialize, boot: boot, paused: paused, saveCurrent: saveCurrent, restart: restart };
    // An older cached HTML can still place this script after the updated game script.
    if (root.paperclipBootDeferred) { root.paperclipBootDeferred = false; boot(); }

    var exportButton = root.document.getElementById("exportSave");
    if (!exportButton) return; // The same exporter also runs on the original site for migration.
    var importButton = root.document.getElementById("importSave");
    var fileInput = root.document.getElementById("saveFile");
    var status = root.document.getElementById("saveStatus");
    function actionStatus(message) { status.textContent = message + (saveWarning ? " " + saveWarning : ""); }

    exportButton.addEventListener("click", function () {
        var envelope = exportFile();
        actionStatus(envelope ? "已发起下载：" + filename(new Date(envelope.exportedAt)) : "导出失败。");
    });
    var backupButton = root.document.getElementById("recoveryBackup");
    var recoveryImport = root.document.getElementById("recoveryImport");
    var recoveryRestart = root.document.getElementById("recoveryRestart");
    if (backupButton) backupButton.addEventListener("click", backupRaw);
    if (recoveryImport) recoveryImport.addEventListener("click", function () { fileInput.click(); });
    if (recoveryRestart) recoveryRestart.addEventListener("click", function () {
        root.document.getElementById("openSettings").click();
        root.document.getElementById("openRestart").click();
    });
    importButton.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", async function () {
        var file = fileInput.files[0];
        if (!file) return;
        try {
            var envelope = parse(await file.text());
            var date = new Date(envelope.exportedAt).toLocaleString();
            if (!root.confirm("存档保存时间：" + date + "\n\n导入将覆盖本浏览器的当前进度，随后刷新页面。\n如需保留当前进度，请先取消并导出。\n\n确定导入？")) {
                actionStatus("已取消导入。");
                return;
            }
            restore(envelope, root.localStorage);
            root.fullRestartPending = true;
            root.location.reload();
        } catch (error) {
            actionStatus(error.message);
            root.alert(error.message);
        } finally {
            fileInput.value = "";
        }
    });
})(window);
