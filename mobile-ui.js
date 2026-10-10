/* View state only: original game nodes, handlers, timers and storage stay intact. */
(function () {
    'use strict';
    const media = matchMedia('(max-width: 699px)');
    const byId = id => document.getElementById(id);
    let dispose = null;

    function mount() {
        const moves = [], created = [], positions = {};
        let active = 'production', queued = false, stopped = false;
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
        function disclosure(label, className) {
            const details = make('details', className);
            details.append(make('summary', '', label));
            return details;
        }
        // Ignore tab wrappers and closed disclosures when checking native unlocks.
        // The engine owns inline display; UI wrappers own the hidden attribute.
        function nativeShown(node) {
            for (let item = node; item && item !== document.body; item = item.parentElement) {
                if (item.style.display === 'none' || item.style.visibility === 'hidden') return false;
            }
            return Boolean(node);
        }
        const panels = make('div', 'mobile-panels');
        panels.id = 'mobilePanels';
        byId('gameGrid').before(panels);
        const nav = make('nav', 'mobile-tabs');
        nav.id = 'mobileTabs';
        nav.setAttribute('aria-label', '游戏模块');
        nav.setAttribute('role', 'tablist');
        document.body.append(nav);
        const definitions = [
            ['production', '生产', [byId('leftColumn')], () => true],
            ['computing', '计算', [byId('compDiv')]],
            ['projects', '项目', [byId('projectsDiv')]],
            ['strategy', '策略', [document.querySelector('.investment-module'), document.querySelector('.strategy-module')],
                () => ['investmentEngine', 'investmentEngineUpgrade', 'strategyEngine', 'tournamentManagement'].some(id => nativeShown(byId(id)))],
            ['exploration', '探索', [byId('spaceDiv'), document.querySelector('.probe-module'), document.querySelector('.battle-module')],
                () => ['spaceDiv', 'probeDesignDiv', 'increaseProbeTrustDiv', 'increaseMaxTrustDiv', 'battleCanvasDiv', 'honorDiv'].some(id => nativeShown(byId(id)))],
        ];
        const tabs = definitions.map(([key, label, nodes, unlocked]) => {
            const panel = make('section', 'mobile-panel');
            panel.id = 'mobile-panel-' + key;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', 'mobile-tab-' + key);
            const button = make('button', '', label);
            button.id = 'mobile-tab-' + key;
            button.type = 'button';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', panel.id);
            nav.append(button);
            panels.append(panel);
            if (key === 'strategy' || key === 'exploration') panel.append(make('h2', 'section-heading', label));
            for (const node of nodes) move(node, panel);
            button.addEventListener('click', () => activate(key));
            return { key, panel, button, unlocked: unlocked || (() => nodes.some(nativeShown)) };
        });
        move(byId('powerDiv'), byId('leftColumn'), byId('wireProductionDiv'));
        move(byId('btnMakePaperclip'), byId('leftColumn'), byId('leftColumn').querySelector('.section-heading').nextSibling);

        const total = disclosure('累计产量与周目', 'mobile-total');
        byId('topDiv').append(total);
        move(byId('prestigeDiv'), total);
        move(byId('clips').closest('.toolTip'), total);
        const history = disclosure('终端记录', 'mobile-history');
        byId('consoleDiv').append(history);
        move(byId('consoleDiv').querySelector('.consoleOld'), history);
        const powerBreakdown = document.querySelector('.power-breakdown');
        const powerWasOpen = powerBreakdown.open;
        powerBreakdown.open = false;
        for (const id of ['btnFactoryReboot', 'btnHarvesterReboot', 'btnWireDroneReboot', 'btnFarmReboot', 'btnBatteryReboot']) {
            const holder = byId(id).closest('.toolTip3');
            const details = disclosure('设备管理', 'mobile-device-management');
            holder.before(details);
            move(holder, details);
            const cost = details.parentElement.querySelector('.device-cost');
            if (cost) move(cost, details.parentElement, details);
        }

        const metrics = make('div', 'mobile-metrics');
        metrics.id = 'mobileMetrics';
        metrics.setAttribute('aria-label', '实时生产数据');
        panels.before(metrics);
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
        const resize = new ResizeObserver(() => {
            document.body.style.setProperty('--mobile-metrics-height', metrics.offsetHeight + 'px');
        });
        resize.observe(metrics);
        function activate(key, scroll = true) {
            if (scroll && key !== active) positions[active] = window.scrollY;
            active = key;
            document.body.dataset.mobileTab = key;
            for (const tab of tabs) {
                tab.panel.hidden = tab.key !== key;
                tab.button.setAttribute('aria-selected', String(tab.key === key));
                tab.button.tabIndex = tab.key === key ? 0 : -1;
            }
            if (scroll) {
                const target = tabs.find(tab => tab.key === key).panel;
                const top = positions[key] ?? (window.scrollY + target.getBoundingClientRect().top - metrics.offsetHeight - 12);
                window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
            }
        }
        nav.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const available = tabs.filter(tab => !tab.button.hidden);
            const index = available.findIndex(tab => tab.key === active);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 :
                (index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
            activate(available[next].key);
            available[next].button.focus({ preventScroll: true });
        });
        function sync() {
            queued = false;
            if (stopped) return;
            for (const tab of tabs) tab.button.hidden = !tab.unlocked();
            nav.hidden = tabs.filter(tab => !tab.button.hidden).length < 2;
            if (tabs.find(tab => tab.key === active).button.hidden) activate('production');
            const human = window.humanFlag === 1;
            rate.card.hidden = !nativeShown(byId(human ? 'manufacturingDiv' : 'clipsPerSecDiv'));
            stock.card.hidden = !nativeShown(byId(human ? 'businessDiv' : 'tothDiv'));
            stock.caption.textContent = human ? '未售库存' : '可用回形针';
            rate.value.textContent = byId(human ? 'clipmakerRate' : 'clipmakerRate2').textContent;
            stock.value.textContent = byId(human ? 'unsoldClips' : 'unusedClipsDisplay').textContent;
            metrics.hidden = rate.card.hidden && stock.card.hidden;
        }
        const observer = new MutationObserver(() => {
            if (!queued) { queued = true; requestAnimationFrame(sync); }
        });
        for (const id of ['compDiv', 'projectsDiv', 'manufacturingDiv', 'businessDiv', 'creationDiv', 'clipsPerSecDiv', 'tothDiv',
            'spaceDiv', 'investmentEngine', 'investmentEngineUpgrade', 'strategyEngine', 'tournamentManagement',
            'probeDesignDiv', 'increaseProbeTrustDiv', 'increaseMaxTrustDiv', 'battleCanvasDiv', 'honorDiv']) {
            observer.observe(byId(id), { attributes: true, attributeFilter: ['style'] });
        }
        for (const id of ['clipmakerRate', 'clipmakerRate2', 'unsoldClips', 'unusedClipsDisplay']) {
            observer.observe(byId(id), { childList: true, subtree: true, characterData: true });
        }
        document.body.classList.add('mobile-ui');
        activate(active, false);
        sync();
        return () => {
            stopped = true;
            observer.disconnect(); resize.disconnect();
            powerBreakdown.open = powerWasOpen;
            for (const { node, anchor } of moves.reverse()) anchor.replaceWith(node);
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
