/* Settings are view state only. Resource changes use existing game fields and saves. */
(function (game) {
    'use strict';
    const stage = () => game.spaceFlag === 1 ? 3 : game.humanFlag === 0 ? 2 : 1;
    const computing = () => game.compFlag === 1;
    const definitions = [
        { key: 'funds', label: '可用资金', phases: [1], amounts: [1e4, 1e6], displays: ['funds'] },
        { key: 'wire', label: '线材', phases: [1], amounts: [1e4, 1e6], displays: ['wire', 'nanoWire', 'transWire'] },
        { key: 'trust', label: '信任', phases: [1], unlocked: computing, amounts: [10, 100], integer: true, displays: ['trust'] },
        { key: 'unusedClips', label: '可用回形针', phases: [2], amounts: [1e12, 1e27], displays: ['unusedClipsDisplay'] },
        { key: 'wire', label: '线材', phases: [2], amounts: [1e12, 1e24], displays: ['wire', 'nanoWire', 'transWire'] },
        { key: 'acquiredMatter', label: '已采集物质', phases: [2], amounts: [1e12, 1e24], displays: ['acquiredMatterDisplay'] },
        { key: 'unusedClips', label: '可用回形针', phases: [3], amounts: [1e24, 1e54], displays: ['unusedClipsDisplay'] },
        { key: 'creativity', label: '创造力', unlocked: () => (game.creativityOn === 1 || game.creativityOn === true), amounts: [1e4, 1e6], displays: ['creativity'] },
        { key: 'yomi', label: 'Yomi', unlocked: () => game.strategyEngineFlag === 1, amounts: [1e4, 1e6], displays: ['yomiDisplay'] },
        { key: 'swarmGifts', label: '蜂群礼物', phases: [2, 3], unlocked: () => game.swarmFlag === 1,
            amounts: [10, 100], integer: true, displays: ['swarmGifts'] },
        { key: 'honor', label: '荣誉', phases: [3], unlocked: () => game.project121.flag === 1,
            amounts: [1e4, 1e6], displays: ['honorDisplay'] },
        { key: 'standardOps', label: '标准操作点数', unlocked: computing, fill: '补满至内存上限',
            capacity: () => Number.isSafeInteger(game.memory) && game.memory > 0 ? game.memory * 1000 : NaN,
            displays: ['operations'] },
        { key: 'storedPower', label: '储存电力', phases: [2], unlocked: () => game.project127.flag === 1,
            fill: '补满至电池容量',
            capacity: () => Number.isSafeInteger(game.batteryLevel) && game.batteryLevel >= 0 &&
                valid(game.batterySize) ? game.batteryLevel * game.batterySize : NaN, displays: ['storedPower'] },
    ];
    const valid = value => Number.isFinite(value) && value >= 0;
    function available(definition) {
        return (!definition.phases || definition.phases.includes(stage())) &&
            (!definition.unlocked || definition.unlocked());
    }
    function resources() {
        return definitions.filter(available).map(definition => ({
            key: definition.key, label: definition.label, value: game[definition.key],
            amounts: definition.amounts, fill: definition.fill,
            capacity: definition.capacity ? definition.capacity() : undefined,
        }));
    }
    function failure(message) { return { ok: false, message }; }
    function apply(key, amount) {
        if (game.dismantle >= 1) return failure('结局拆卸期间，资源增益不可用。');
        // Look up the current phase and unlocks again, including clicks from an already-open dialog.
        const definition = definitions.find(item => item.key === key && available(item));
        if (!definition) return failure('当前阶段尚未解锁此资源。');
        const current = game[key];
        if (!valid(current) || (definition.integer && !Number.isSafeInteger(current)))
            return failure('当前数值无效，未作修改。');
        let next;
        if (definition.fill) {
            if (amount !== 'fill') return failure('无效的增益操作。');
            next = definition.capacity();
            if (!valid(next)) return failure('容量无效，未作修改。');
            if (next === 0) return failure('请先增加容量。');
            if (current >= next) return failure('已经达到容量上限。');
        } else {
            if (!definition.amounts.includes(amount)) return failure('无效的增益数值。');
            next = current + amount;
        }
        if (!valid(next) || (definition.integer && !Number.isSafeInteger(next)))
            return failure('数值超出可用范围，未作修改。');
        if (next <= current) return failure('增量小于当前数值的精度，请选择更大的增益。');
        if (key === 'standardOps') {
            if (!valid(game.tempOps) || !Number.isFinite(next + Math.floor(game.tempOps)))
                return failure('溢出操作点数无效，未作修改。');
        }
        game[key] = next;
        if (key === 'standardOps') game.operations = Math.floor(next + Math.floor(game.tempOps));
        // Update only the affected counters; refresh/buttonUpdate also advance native game systems.
        if (typeof document.querySelector === 'function') {
            for (const id of definition.displays) {
                const node = document.getElementById(id);
                if (node) node.textContent = number(key === 'standardOps' ? game.operations : next);
            }
        }
        return { ok: true, message: definition.label + '已更新。' };
    }
    const number = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2,
        ...(Math.abs(value) >= 1e12 ? { notation: 'scientific', maximumFractionDigits: 3 } : {}) }) : '数值无效';
    function summary() {
        const seconds = Math.max(0, Math.floor(game.ticks / 100));
        const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
            .map(value => String(value).padStart(2, '0')).join(':');
        return [
            ['当前阶段', ['制造与商业', '地球自动化', '宇宙探索'][stage() - 1] + (game.dismantle >= 1 ? ' · 结局拆卸' : '')],
            ['本周目运行时间', time],
            ['宇宙', String(game.prestigeU + 1) + ' · 需求加成 +' + number(game.prestigeU * 10) + '%'],
            ['模拟等级', String(game.prestigeS + 1) + ' · 创造力速度加成 +' + number(game.prestigeS * 10) + '%'],
        ];
    }
    game.PaperclipTools = Object.freeze({ stage, resources, apply, summary });
    if (typeof document.querySelector !== 'function') return;

    const byId = id => document.getElementById(id);
    const dialog = byId('settingsDialog'), opener = byId('openSettings');
    if (!dialog || !opener) return;
    const overview = byId('settingsOverview'), boosts = byId('resourceBoosts'), list = byId('boostList');
    const warning = byId('boostWarning'), restart = byId('restartConfirmation'), manual = byId('gameManual');
    let timer = null, lastKeys = '', boostWarningAccepted = false;
    const rows = new Map();
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    function render() {
        if (!manual.hidden) game.PaperclipManual.refresh();
        const stats = summary();
        if (!overview.hidden) {
            if (!byId('gameSummary').children.length) {
                for (const [label] of stats) byId('gameSummary').append(make('dt', '', label), make('dd'));
            }
            [...byId('gameSummary').querySelectorAll('dd')].forEach((node, index) => setText(node, stats[index][1]));
        }
        if (boosts.hidden) return;
        const ending = game.dismantle >= 1, items = resources();
        const keys = items.map(item => item.key + ':' + (item.amounts || item.fill)).join('|');
        if (keys !== lastKeys) {
            lastKeys = keys; rows.clear(); list.replaceChildren();
            for (const item of items) {
                const row = make('section', 'boost-row');
                row.dataset.resource = item.key;
                const label = make('h4', '', item.label), value = make('p', 'boost-value');
                const actions = make('div', 'boost-actions'), buttons = [];
                for (const amount of item.amounts || ['fill']) {
                    const button = make('button', '', amount === 'fill' ? item.fill : '+' + number(amount));
                    button.type = 'button';
                    button.dataset.amount = String(amount);
                    button.addEventListener('click', () => {
                        const result = apply(item.key, amount);
                        byId('boostStatus').textContent = result.message;
                        render();
                    });
                    actions.append(button); buttons.push(button);
                }
                row.append(label, value, actions); list.append(row);
                rows.set(item.key, { value, buttons });
            }
        }
        setText(byId('boostNotice'), ending ? '结局拆卸期间暂停资源增益，进度可在设置中查看。' :
            '仅增加已解锁的资源。沿用原游戏自动保存；需要立即保存时，请关闭设置后导出存档。');
        for (const item of items) {
            const row = rows.get(item.key);
            setText(row.value, number(item.value) + (item.fill ? ' / ' + number(item.capacity) : ''));
            for (const button of row.buttons) {
                button.disabled = ending || (item.fill && (!valid(item.capacity) || item.capacity === 0 || item.value >= item.capacity));
            }
        }
    }
    function showView(view, focus) {
        if (!manual.hidden) game.PaperclipManual.leave();
        for (const section of [overview, boosts, warning, restart, manual]) section.hidden = section !== view;
        byId('settingsTitle').textContent = view === overview ? '设置' : view === restart ? '从头开始' : view === manual ? '游戏说明书' : '资源增益';
        dialog.classList.toggle('manual-open', view === manual);
        dialog.scrollTop = 0;
        if (view === manual) game.PaperclipManual.open();
        render();
        if (focus) byId(focus).focus({ preventScroll: true });
    }
    function enterBoosts() {
        byId('boostStatus').textContent = '';
        showView(boosts, 'boostTitle');
    }
    opener.addEventListener('click', () => {
        closeHint(); showView(overview);
        dialog.showModal();
        timer = setInterval(render, 1000);
    });
    byId('closeSettings').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        if (!manual.hidden) game.PaperclipManual.leave();
        clearInterval(timer); timer = null; opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    byId('openManual').addEventListener('click', () => showView(manual, 'manualHeading'));
    byId('manualToSettings').addEventListener('click', () => showView(overview, 'openManual'));
    byId('openResourceBoosts').addEventListener('click', () => {
        if (boostWarningAccepted) enterBoosts();
        else showView(warning, 'cancelBoostWarning');
    });
    byId('cancelBoostWarning').addEventListener('click', () => showView(overview, 'openResourceBoosts'));
    byId('confirmBoostWarning').addEventListener('click', () => {
        boostWarningAccepted = true;
        enterBoosts();
    });
    byId('backToSettings').addEventListener('click', () => showView(overview, 'openResourceBoosts'));
    byId('openRestart').addEventListener('click', () => {
        byId('restartStatus').textContent = '';
        showView(restart, 'cancelRestart');
    });
    byId('cancelRestart').addEventListener('click', () => showView(overview, 'openRestart'));
    byId('confirmRestart').addEventListener('click', () => {
        if (game.fullRestartPending) return;
        game.fullRestartPending = true;
        byId('confirmRestart').disabled = true;
        try {
            game.PaperclipSaves.clear(game.localStorage);
        } catch (error) {
            game.fullRestartPending = false;
            byId('confirmRestart').disabled = false;
            byId('restartStatus').textContent = '无法重开：' + error.message;
            return;
        }
        byId('restartStatus').textContent = '进度已清除，正在重新开始…';
        game.location.reload();
    });

    // Hint buttons are siblings of native counters so native innerHTML updates cannot remove them.
    const hints = [
        ['clipmakerRate', '产量', () => '每秒生产的回形针数量。生产与销售分别进行，库存积压时可以调整价格。'],
        ['clipmakerRate2', '产量', () => '每秒生产的回形针数量。生产需要线材；在自动化阶段，电力不足也会降低产量。'],
        ['unsoldClips', '库存', () => '已制成但尚未售出的回形针。售出后才会变成资金。'],
        ['unusedClipsDisplay', '可用回形针', () => '目前可以花费的回形针，用于建造设备或发射探测器。累计产量包含已花掉的部分，与可用数量不同。'],
        ['demand', '价格与需求', () => '需求反映销售活跃程度，并非库存售出的百分比。提高价格通常会降低需求，营销可以提升需求。'],
        ['wireCost', '购买成本', () => '成本是点击购买时需要支付的资源。设备越多，后续购买通常越贵；批量购买会支付整批成本。'],
        ['trust', '信任', () => '信任决定可分配给处理器和内存的总额度。已经分配的部分仍计入总信任。'],
        ['memory', '内存', () => '内存决定标准操作点数的容量。处理器负责生成操作点数；蜂群礼物可以提供额外的分配额度。'],
        ['maxOps', '操作点数', () => '操作点数用于研究和策略比赛。量子计算可以暂时超过内存上限，溢出部分会逐渐衰减。'],
        ['creativity', '创造力', () => '操作点数达到内存上限后产生，用于特殊研究。更多处理器可以加快积累。'],
        ['yomiDisplay', 'Yomi', () => '策略比赛获得的资源，可用于研究、投资升级和探测器信任等。选择不同策略会影响比赛收益。'],
        ['acquiredMatterDisplay', '物质与线材', () => '采集无人机把可用物质变成已采集物质，线材无人机再将其制成线材。工厂消耗线材生产回形针。'],
        ['performance', '电力与性能', () => '供电不足时，工厂和无人机的性能会下降。太阳能农场发电，电池储存余电并在缺电时放电。'],
        ['maxStorage', '电力存储', () => '左侧是当前储电，右侧是电池容量。储电还可用于蜂群操作；电池本身不会发电。'],
        ['probeTrustDisplay', '探测器信任与设计', () => '已用信任不能超过可用信任，各项设计共享这份额度。速度、探索、复制、防护、生产和战斗决定探测器的不同能力。'],
        ['honorDisplay', '荣誉', () => '战斗获得的资源，可用于提高探测器信任上限。提高上限后，仍需用 Yomi 购买信任。'],
        ['swarmGifts', '蜂群礼物', () => '蜂群思考带来的额外计算分配额度，可用于增加处理器或内存。工作／思考滑块决定蜂群的任务分配。'],
    ];
    const hint = byId('numberHint');
    let activeHint = null;
    function closeHint() { if (hint.matches(':popover-open')) hint.hidePopover(); }
    function positionHint() {
        if (!activeHint || !hint.matches(':popover-open')) return;
        if (!activeHint.isConnected || !activeHint.getClientRects().length) { closeHint(); return; }
        const viewport = window.visualViewport;
        const left = viewport ? viewport.offsetLeft : 0, top = viewport ? viewport.offsetTop : 0;
        const width = viewport ? viewport.width : innerWidth, height = viewport ? viewport.height : innerHeight;
        const rect = activeHint.getBoundingClientRect();
        hint.style.maxWidth = Math.min(360, width - 24) + 'px';
        hint.style.left = Math.max(left + 12, Math.min(rect.left, left + width - hint.offsetWidth - 12)) + 'px';
        const below = rect.bottom + 8;
        hint.style.top = Math.max(top + 12, Math.min(below, top + height - hint.offsetHeight - 12)) + 'px';
    }
    function attach(target, label, content, metric = false) {
        if (!target) return;
        const button = make('button', 'number-help' + (metric ? ' metric-help' : ''), '?');
        button.type = 'button';
        button.setAttribute('aria-label', label + '说明');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'numberHint');
        button.hidden = !byId('showNumberHints').checked;
        button.addEventListener('click', () => {
            if (activeHint === button && hint.matches(':popover-open')) { closeHint(); return; }
            closeHint();
            activeHint = button;
            byId('numberHintText').textContent = content();
            hint.showPopover(); button.setAttribute('aria-expanded', 'true');
            button.setAttribute('aria-describedby', 'numberHintText');
            positionHint();
        });
        if (metric) target.append(button); else target.after(button);
    }
    hint.addEventListener('beforetoggle', event => {
        if (event.newState === 'closed' && activeHint) {
            activeHint.setAttribute('aria-expanded', 'false');
            activeHint.removeAttribute('aria-describedby'); activeHint = null;
        }
    });
    document.addEventListener('pointerdown', event => {
        if (activeHint && !hint.contains(event.target) && !activeHint.contains(event.target)) closeHint();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && hint.matches(':popover-open')) {
            const target = activeHint; closeHint();
            if (target) target.focus({ preventScroll: true });
        }
    });
    byId('closeNumberHint').addEventListener('click', () => {
        const target = activeHint; closeHint(); if (target) target.focus({ preventScroll: true });
    });
    byId('showNumberHints').addEventListener('change', event => {
        closeHint();
        document.querySelectorAll('.number-help').forEach(button => { button.hidden = !event.target.checked; });
    });
    function attachHints() {
        closeHint();
        document.querySelectorAll('.number-help').forEach(button => button.remove());
        for (const [id, label, content] of hints) attach(byId(id), label, content);
        for (const [id, source, label] of [['mobileRate', 'clipmakerRate2', '产量'], ['mobileStock', 'unusedClipsDisplay', '库存'],
            ['mobileOps', 'maxOps', '操作点数'], ['mobileYomi', 'yomiDisplay', 'Yomi']]) {
            const target = byId(id);
            attach(target && target.parentElement, label, () => {
                const key = id === 'mobileStock' && game.humanFlag === 1 ? 'unsoldClips' :
                    id === 'mobileRate' && game.humanFlag === 1 ? 'clipmakerRate' : source;
                return hints.find(item => item[0] === key)[2]();
            }, true);
        }
    }
    document.addEventListener('paperclips:layout', attachHints);
    window.addEventListener('resize', positionHint);
    // Close during page/tab scrolling so an explanation cannot cover a different module.
    window.addEventListener('scroll', closeHint, true);
    attachHints();
})(window);
