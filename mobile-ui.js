/* View state only: reuse the game's original nodes, handlers and save state. */
(function () {
    'use strict';
    const media = matchMedia('(max-width: 699px)');
    const byId = id => document.getElementById(id);
    let dispose = null;
    function mount() {
        const moves = [], created = [], gates = [], mirrors = [], positions = {};
        let active = 'production', queued = false, stopped = false;
        // Capture native ancestry BEFORE extracting controls. The engine can hide
        // their original modules later, including during the ending sequence.
        const parents = new Map([...document.querySelectorAll('*')].map(node => [node, node.parentElement]));
        const make = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text) node.textContent = text;
            created.push(node);
            return node;
        };
        function move(node, parent, before = null) {
            const anchor = document.createComment('mobile layout position');
            node.before(anchor);
            moves.push({ node, anchor });
            parent.insertBefore(node, before);
        }
        function nativeShown(node) {
            if (!node) return false;
            for (let item = node; item && item !== document.body; item = parents.get(item)) {
                if (item.style.display === 'none' || item.style.visibility === 'hidden') return false;
            }
            return true;
        }
        const anyShown = ids => () => ids.some(id => nativeShown(byId(id)));
        const panels = make('div', 'mobile-panels');
        panels.id = 'mobilePanels';
        byId('gameGrid').before(panels);
        const nav = make('nav', 'mobile-tabs');
        nav.id = 'mobileTabs';
        nav.setAttribute('aria-label', '主要页面');
        nav.setAttribute('role', 'tablist');
        document.body.append(nav);
        const views = new Map();
        function action(label, handler, className = '') {
            const button = make('button', className, label);
            button.type = 'button';
            button.addEventListener('click', handler);
            return button;
        }
        function view(key, title, unlocked, root = false) {
            const panel = make('section', 'mobile-panel' + (root ? '' : ' mobile-detail'));
            panel.id = 'mobile-panel-' + key;
            panel.setAttribute('role', root ? 'tabpanel' : 'region');
            const heading = make('h2', 'section-heading', title);
            heading.id = 'mobile-heading-' + key;
            panel.setAttribute('aria-labelledby', heading.id);
            if (!root) panel.append(action('返回主控台', () => activate('production'), 'mobile-back'));
            panel.append(heading);
            panels.append(panel);
            const item = { key, panel, heading, unlocked, button: null };
            if (root) {
                const button = action(title, () => activate(key));
                button.id = 'mobile-tab-' + key;
                button.setAttribute('role', 'tab');
                button.setAttribute('aria-controls', panel.id);
                nav.append(button);
                item.button = button;
            }
            views.set(key, item);
            return panel;
        }
        function link(key, label) {
            const button = action(label + ' →', () => activate(key), 'mobile-detail-link');
            button.dataset.detail = key;
            gates.push({ node: button, shown: () => views.get(key).unlocked() });
            return button;
        }
        function card(parent, title, key, label) {
            const section = make('section', 'mobile-card');
            const head = make('div', 'mobile-card-heading');
            head.append(make('h3', '', title));
            if (key) head.append(link(key, label));
            section.append(head);
            parent.append(section);
            return section;
        }
        function extract(node, parent, className = '', shown = () => nativeShown(node)) {
            const wrapper = make('div', 'mobile-native ' + className);
            parent.append(wrapper);
            move(node, wrapper);
            gates.push({ node: wrapper, shown });
            return wrapper;
        }
        function returnTo(parent, label, target) {
            parent.append(action(label + '：前往主控台操作 →', () => activate('production', true, target), 'mobile-return-action'));
        }
        const home = view('production', '主控台', () => true, true);
        const research = view('projects', '研究', anyShown(['projectsDiv']), true);
        const production = view('production-detail', '生产详情', anyShown(['creationDiv', 'wireProductionDiv']));
        const power = view('power', '电力详情', anyShown(['powerDiv']));
        const computing = view('computing', '计算与蜂群', anyShown(['compDiv']));
        const strategy = view('strategy', '投资与比赛详情', anyShown(['investmentEngine', 'investmentEngineUpgrade', 'strategyEngine', 'tournamentManagement']));
        const exploration = view('exploration', '探测器设计与战斗', anyShown(['spaceDiv', 'probeDesignDiv', 'increaseProbeTrustDiv', 'increaseMaxTrustDiv', 'battleCanvasDiv', 'honorDiv']));
        move(byId('leftColumn'), production);
        move(byId('powerDiv'), power);
        move(byId('compDiv'), computing);
        move(byId('projectsDiv'), research);
        move(document.querySelector('.investment-module'), strategy);
        move(document.querySelector('.strategy-module'), strategy);
        move(byId('spaceDiv'), exploration);
        move(document.querySelector('.probe-module'), exploration);
        move(document.querySelector('.battle-module'), exploration);
        const quick = card(home, '快速操作', 'computing', '计算与蜂群');
        quick.id = 'mobileQuick';
        const quantum = make('div', 'mobile-quantum');
        quantum.append(make('span', 'mobile-action-label', '量子计算'));
        quick.append(quantum);
        extract(byId('btnQcompute'), quantum);
        extract(byId('qCompDisplay'), quantum, '', () => nativeShown(byId('qCompDisplay')) && Boolean(byId('qCompDisplay').textContent.trim()));
        gates.push({ node: quantum, shown: () => nativeShown(byId('btnQcompute')) });
        extract(byId('swarmSliderDiv'), quick);
        gates.push({ node: quick, shown: anyShown(['compDiv']) });
        returnTo(computing, '量子计算、工作／思考', quick);
        const human = card(home, '制作、销售与制造', 'production-detail', '生产详情');
        const makeClip = byId('btnMakePaperclip');
        const manual = extract(makeClip, human, '', () => nativeShown(byId('btnMakePaperclip')) && (window.humanFlag === 1 || window.dismantle >= 4));
        const manualDetail = card(production, '手动制作');
        // Reparent this one native control when the stage changes. It stays
        // available in production details during automated phases.
        extract(byId('businessDiv'), human);
        extract(byId('manufacturingDiv'), human);
        gates.push({ node: human, shown: () => !manual.hidden || nativeShown(byId('businessDiv')) || nativeShown(byId('manufacturingDiv')) });
        const earth = card(home, '工厂与无人机', 'production-detail', '生产详情');
        earth.id = 'mobileEarth';
        function purchase(device, parent, label) {
            const row = make('div', 'mobile-purchase');
            parent.append(row);
            const controls = device.querySelector('.engineText5');
            const cost = device.querySelector('.device-cost');
            const count = controls.querySelector('.engineText6');
            const title = make('h3', 'mobile-device-label');
            device.prepend(title);
            mirrors.push({ node: title, source: count, prefix: label.replace('购买', '') + ' · ' });
            const detailCost = make('p', 'mobile-detail-cost');
            title.after(detailCost);
            mirrors.push({ node: detailCost, source: cost, prefix: '' });
            move(controls, row);
            move(cost, row);
            gates.push({ node: row, shown: () => nativeShown(device) });
            returnTo(device, label, row);
        }
        purchase(byId('factoryDiv'), earth, '购买工厂');
        const energy = card(earth, '电力', 'power', '电力详情');
        const powerSummary = make('p', 'mobile-power-overview');
        energy.append(powerSummary);
        purchase(byId('btnMakeFarm').closest('.mobile-device'), energy, '购买太阳能农场');
        purchase(byId('btnMakeBattery').closest('.mobile-device'), energy, '购买电池塔');
        gates.push({ node: energy, shown: anyShown(['powerDiv']) });
        purchase(byId('harvesterDiv'), earth, '购买采集无人机');
        purchase(byId('wireDroneDiv'), earth, '购买线材无人机');
        gates.push({ node: earth, shown: anyShown(['factoryDiv', 'powerDiv', 'harvesterDiv', 'wireDroneDiv']) });
        returnTo(production, '普通购买', earth);
        const space = card(home, '探测器运行', 'exploration', '设计与战斗');
        const explored = make('p', 'mobile-space-overview');
        const probes = make('p', 'mobile-space-overview');
        space.append(explored, probes);
        mirrors.push({ node: explored, source: byId('colonizedDisplay'), prefix: '宇宙探索：', suffix: '%' });
        mirrors.push({ node: probes, source: byId('probesTotalDisplay'), prefix: '探测器累计：' });
        extract(byId('probeDiv'), space);
        gates.push({ node: space, shown: anyShown(['spaceDiv']) });
        returnTo(exploration, '发射探测器', space);
        const matches = card(home, '策略比赛', 'strategy', '投资与比赛详情');
        matches.id = 'mobileMatches';
        extract(byId('tourneyButton'), matches);
        extract(byId('newTourneyCost').closest('p'), matches);
        const run = make('div', 'mobile-match-run');
        matches.append(run);
        extract(byId('stratPicker'), run);
        extract(byId('btnRunTournament'), run);
        extract(byId('tournamentLabel'), matches);
        gates.push({ node: matches, shown: anyShown(['strategyEngine', 'tournamentManagement']) });
        returnTo(strategy, '新建比赛、选择策略及运行', matches);
        // Investment can unlock before strategy. Give it an independent entry.
        const investment = action('投资与比赛详情 →', () => activate('strategy'), 'mobile-detail-link');
        investment.dataset.detail = 'strategy';
        home.append(investment);
        gates.push({ node: investment, shown: () => views.get('strategy').unlocked() && matches.hidden });
        const history = make('details', 'mobile-history mobile-total');
        history.append(make('summary', '', '终端记录与累计产量'));
        byId('consoleDiv').append(history);
        move(byId('consoleDiv').querySelector('.consoleOld'), history);
        move(byId('prestigeDiv'), history);
        move(byId('clips').closest('.toolTip'), history);
        const help = make('details', 'mobile-help');
        help.append(make('summary', '', '存档迁移帮助'));
        document.querySelector('.site-footer').before(help);
        move(byId('saveToolbar').querySelector('a'), help);
        const saveLabels = ['exportSave', 'importSave'].map(id => {
            const button = byId(id), text = button.textContent, aria = button.getAttribute('aria-label');
            button.setAttribute('aria-label', text);
            button.textContent = id === 'exportSave' ? '导出' : '导入';
            return { button, text, aria };
        });
        const metrics = make('div', 'mobile-metrics');
        metrics.id = 'mobileMetrics';
        metrics.setAttribute('aria-label', '实时游戏数据');
        document.querySelector('.overview').before(metrics);
        function metric(id, label, className) {
            const card = make('div', 'mobile-metric ' + className);
            const caption = make('span', 'metric-label', label);
            const value = make('strong', 'metric-value');
            value.id = id;
            card.append(caption, value);
            metrics.append(card);
            return { card, caption, value };
        }
        const rate = metric('mobileRate', '产量 / 秒', 'metric-rate');
        const stock = metric('mobileStock', '可用回形针', 'metric-stock');
        const ops = metric('mobileOps', '操作点数 / 上限', 'metric-secondary');
        const yomi = metric('mobileYomi', 'Yomi', 'metric-secondary');
        const resize = new ResizeObserver(() => document.body.style.setProperty('--mobile-metrics-height', metrics.offsetHeight + 'px'));
        resize.observe(metrics);
        function activate(key, scroll = true, target = null) {
            if (scroll && key !== active) positions[active] = window.scrollY;
            active = key;
            document.body.dataset.mobileTab = key;
            for (const item of views.values()) {
                item.panel.hidden = item.key !== key;
                if (item.button) {
                    const selected = item.key === (key === 'projects' ? 'projects' : 'production');
                    item.button.setAttribute('aria-selected', String(selected));
                    item.button.tabIndex = selected ? 0 : -1;
                }
            }
            if (scroll) {
                const panel = views.get(key).panel;
                const top = target ? window.scrollY + target.getBoundingClientRect().top - metrics.offsetHeight - 12 :
                    positions[key] ?? (window.scrollY + panel.getBoundingClientRect().top - metrics.offsetHeight - 12);
                window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
                views.get(key).heading.tabIndex = -1;
                views.get(key).heading.focus({ preventScroll: true });
            }
        }
        nav.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const available = [...views.values()].filter(item => item.button && !item.button.hidden);
            const index = available.findIndex(item => item.button.getAttribute('aria-selected') === 'true');
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
            activate(available[next].key);
            available[next].button.focus({ preventScroll: true });
        });
        function text(node, value) {
            if (node.textContent !== value) node.textContent = value;
        }
        function sync() {
            queued = false;
            if (stopped) return;
            const manualOnHome = window.humanFlag === 1 || window.dismantle >= 4;
            const manualParent = manualOnHome ? manual : manualDetail;
            if (makeClip.parentElement !== manualParent) manualParent.append(makeClip);
            manualDetail.hidden = manualOnHome || !nativeShown(makeClip);
            for (const gate of gates) gate.node.hidden = !gate.shown();
            for (const item of views.values()) if (item.button) item.button.hidden = !item.unlocked();
            if (!views.get(active).unlocked()) activate('production');
            for (const mirror of mirrors) text(mirror.node, mirror.prefix + mirror.source.textContent + (mirror.suffix || ''));
            const humanStage = window.humanFlag === 1;
            rate.card.hidden = !nativeShown(byId(humanStage ? 'manufacturingDiv' : 'clipsPerSecDiv'));
            stock.card.hidden = !nativeShown(byId(humanStage ? 'businessDiv' : 'tothDiv'));
            text(stock.caption, humanStage ? '未售库存' : '可用回形针');
            text(rate.value, byId(humanStage ? 'clipmakerRate' : 'clipmakerRate2').textContent);
            text(stock.value, byId(humanStage ? 'unsoldClips' : 'unusedClipsDisplay').textContent);
            ops.card.hidden = !nativeShown(byId('compDiv'));
            text(ops.value, byId('operations').textContent + ' / ' + byId('maxOps').textContent);
            yomi.card.hidden = !nativeShown(byId('strategyEngine'));
            text(yomi.value, byId('yomiDisplay').textContent);
            text(powerSummary, '供电 ' + byId('powerProductionRate').textContent + ' / 耗电 ' + byId('powerConsumptionRate').textContent + ' MWs · 性能 ' + byId('performance').textContent + '%');
            metrics.hidden = [rate, stock, ops, yomi].every(item => item.card.hidden);
        }
        const observer = new MutationObserver(() => {
            if (!queued) { queued = true; requestAnimationFrame(sync); }
        });
        // Observe native inline visibility, never our generated wrappers.
        for (const node of parents.keys()) {
            if (node !== document.body) observer.observe(node, { attributes: true, attributeFilter: ['style'] });
        }
        for (const id of ['clipmakerRate', 'clipmakerRate2', 'unsoldClips', 'unusedClipsDisplay', 'operations', 'maxOps', 'yomiDisplay', 'powerProductionRate', 'powerConsumptionRate', 'performance', 'qCompDisplay']) {
            observer.observe(byId(id), { childList: true, subtree: true, characterData: true });
        }
        for (const mirror of mirrors) observer.observe(mirror.source, { childList: true, subtree: true, characterData: true });
        document.body.classList.add('mobile-ui');
        activate(active, false);
        sync();
        return () => {
            stopped = true;
            observer.disconnect(); resize.disconnect();
            for (const { node, anchor } of moves.reverse()) anchor.replaceWith(node);
            for (const { button, text, aria } of saveLabels) {
                button.textContent = text;
                if (aria === null) button.removeAttribute('aria-label'); else button.setAttribute('aria-label', aria);
            }
            for (const node of created.reverse()) node.remove();
            document.body.classList.remove('mobile-ui');
            document.body.style.removeProperty('--mobile-metrics-height');
            delete document.body.dataset.mobileTab;
        };
    }
    function update() {
        if (media.matches && !dispose) dispose = mount();
        else if (!media.matches && dispose) { dispose(); dispose = null; }
    }
    media.addEventListener('change', update);
    update();
})();
