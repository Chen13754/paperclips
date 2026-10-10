/* Read-only documentation. Never call native triggers, costs, effects or update functions here. */
(function (game) {
    'use strict';
    const content = game.PaperclipManualContent;
    const stage = () => game.spaceFlag === 1 ? 3 : game.humanFlag === 0 ? 2 : 1;
    const completed = id => game['project' + id]?.flag === 1;
    const seen = project => project.flag === 1 || project.uses === 0 ||
        game.activeProjects.some(item => item.id === project.id);
    const gates = {
        auto: () => game.autoClipperFlag === 1 || game.clipmakerLevel > 0 || stage() >= 2,
        compute: () => game.compFlag === 1 || stage() >= 2,
        investment: () => game.investmentEngineFlag === 1 || completed('21'),
        creativity: () => !!game.creativityOn || completed('3'),
        quantum: () => game.qFlag === 1 || completed('50'),
        strategy: () => game.strategyEngineFlag === 1 || completed('20'),
        earth: () => stage() >= 2,
        harvester: () => game.harvesterFlag === 1 || completed('43'),
        'wire-drone': () => game.wireDroneFlag === 1 || completed('44'),
        factory: () => game.factoryFlag === 1 || completed('45'),
        power: () => completed('127'),
        swarm: () => game.swarmFlag === 1 || completed('126'),
        space: () => stage() >= 3,
        combat: () => game.battleFlag === 1 || completed('131') || completed('121'),
        ending: () => completed('147') || completed('148') || game.prestigeU > 0 || game.prestigeS > 0,
    };
    const researchSystems = {
        '制造升级': ['auto-clippers', 'wire'], '营销与社会': ['marketing', 'computing'],
        '计算与策略': ['computing', 'creativity', 'strategies', 'quantum'],
        '投资与市场': ['investments', 'investment-money'],
        '地球与蜂群': ['earth-chain', 'power', 'swarm'],
        '宇宙与战斗': ['probes', 'hazards', 'combat'], '结局与周目': ['ending', 'save-files'],
    };
    const english = {
        '1': ['Improved AutoClippers'], '2': ['Beg for More Wire'], '3': ['Creativity'],
        '4': ['Even Better AutoClippers'], '5': ['Optimized AutoClippers'], '6': ['Limerick'],
        '7': ['Improved Wire Extrusion'], '8': ['Optimized Wire Extrusion'], '9': ['Microlattice Shapecasting'],
        '10': ['Spectral Froth Annealment'], '10b': ['Quantum Foam Annealment'],
        '11': ['New Slogan'], '12': ['Catchy Jingle'], '13': ['Lexical Processing'],
        '14': ['Combinatory Harmonics'], '15': ['The Hadwiger Problem'], '16': ['Hadwiger Clip Diagrams'],
        '17': ['The Toth Sausage Conjecture', 'Tóth'], '18': ['Toth Tubule Enfolding', 'Tóth'],
        '19': ['Donkey Space'], '20': ['Strategic Modeling'], '21': ['Algorithmic Trading', 'investment'],
        '22': ['MegaClippers'], '23': ['Improved MegaClippers'], '24': ['Even Better MegaClippers'],
        '25': ['Optimized MegaClippers'], '26': ['WireBuyer'], '27': ['Coherent Extrapolated Volition', 'CEV'],
        '28': ['Cure for Cancer'], '29': ['World Peace'], '30': ['Global Warming'], '31': ['Male Pattern Baldness'],
        '34': ['Hypno Harmonics'], '35': ['Release the HypnoDrones'], '37': ['Hostile Takeover'],
        '38': ['Full Monopoly'], '40': ['A Token of Goodwill'], '40b': ['Another Token of Goodwill'],
        '41': ['Nanoscale Wire Production'], '42': ['RevTracker'], '43': ['Harvester Drones'],
        '44': ['Wire Drones'], '45': ['Clip Factories'], '46': ['Space Exploration'],
        '50': ['Quantum Computing'], '51': ['Photonic Chip', '光子芯片'], '60': ['A100'], '61': ['B100'],
        '62': ['GREEDY', '贪婪'], '63': ['GENEROUS', '慷慨'], '64': ['MINIMAX', '最小最大'],
        '65': ['TIT FOR TAT', '针锋相对'], '66': ['BEAT LAST', '击败上轮'], '70': ['HypnoDrones'],
        '100': ['Upgraded Factories'], '101': ['Hyperspeed Factories'], '102': ['Self-correcting Supply Chain'],
        '110': ['Drone Flocking Alignment'], '111': ['Drone Flocking Cohesion'], '112': ['Drone Flocking Avoidance'],
        '118': ['AutoTourney'], '119': ['Theory of Mind'], '120': ['The OODA Loop'],
        '121': ['Name the Battles'], '125': ['Momentum'], '126': ['Swarm Computing', '工作', '思考'],
        '127': ['Power Grid'], '128': ['Strategic Attachment'], '129': ['Elliptic Hull Polytopes'],
        '130': ['Reboot the Swarm'], '131': ['Combat'], '132': ['Monument to the Driftwar Fallen'],
        '133': ['Threnody', '英雄挽歌'], '134': ['Glory'], '135': ['Emergency Reconfiguration'],
        '140': ['The Message'], '147': ['Accept'], '148': ['Reject'], '200': ['Universe'],
        '201': ['Simulation Level'], '210': ['Disassemble the Probes'], '211': ['Disassemble the Swarm'],
        '212': ['Disassemble the Factories'], '213': ['Disassemble the Strategy Engine'],
        '214': ['Disassemble Quantum Computing'], '215': ['Disassemble the Processors'],
        '216': ['Disassemble Memory'], '217': ['REPLAY'], '218': ['Limerick continued'], '219': ['Xavier Re-initialization'],
    };
    const chapters = content.chapters.map(([id, title]) => ({ id, title }));
    const researchProjects = new Map(game.projects.map(project => [project.id.replace('projectButton', ''), project]));
    const format = value => Number(value).toLocaleString('zh-CN');
    function fee(id, project) {
        // These native labels can be stale until the next game UI update, especially after loading.
        if (id === '51') return format(game.qChipCost) + ' 操作点数';
        if (id === '40b') return '$' + format(game.bribe);
        if (id === '133') return format(game.threnodyCost) + ' 创造力，' + format(game.threnodyCost * .4) + ' Yomi';
        if (Number(id) >= 140 && Number(id) <= 148) return format(game.driftKingMessageCost) + ' 操作点数';
        return project.priceTag.replace(/^\(|\)$/g, '').trim() || '无资源费用';
    }
    function all() {
        return content.articles.concat(content.research.map(([id, group, condition, effect]) => {
            const project = researchProjects.get(id);
            const title = id === '133' ? '英雄挽歌' : game.cnItem(project.title).trim();
            const aliases = [...(english[id] || []), '研究' + id];
            for (const [original, translated] of Object.entries(game.cnItems || {})) {
                if (translated.trim() === title) aliases.push(original);
            }
            return { id: 'r' + id, chapter: 'research', group, title, aliases, summary: effect,
                body: ['出现条件：' + condition, '费用：' + fee(id, project) + '。', '实际效果：' + effect,
                    '出现条件用于说明何时进入研究列表；已出现的项目仍需满足费用及按钮限制。重复研究的费用显示当前下一次价格。'],
                details: [], links: researchSystems[group], project };
        }));
    }
    const visible = (entry, full) => full || (entry.project ? seen(entry.project) : !entry.gate || gates[entry.gate]());
    function entries(full = false) { return all().filter(entry => visible(entry, full)); }
    function directory(full = false) {
        const available = entries(full);
        return chapters.map(chapter => ({ ...chapter, groups: [...new Set(available.filter(entry => entry.chapter === chapter.id)
            .map(entry => entry.group))] })).filter(chapter => chapter.groups.length);
    }
    const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    function search(query, full = false) {
        const terms = normalize(query).split(' ').filter(Boolean);
        if (!terms.length) return [];
        // Filter before building searchable text, snippets, counts or links.
        return entries(full).map(entry => {
            const title = normalize(entry.title), aliases = normalize(entry.aliases.join(' '));
            const text = normalize([title, aliases, entry.summary, ...entry.body, ...entry.details].join(' '));
            const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : aliases.includes(term) ? 2 : 1), 0);
            return { entry, score, matches: terms.every(term => text.includes(term)) };
        }).filter(result => result.matches).sort((a, b) => b.score - a.score).map(result => result.entry);
    }
    const api = { entries, directory, search };
    game.PaperclipManual = api;
    if (typeof document.querySelector !== 'function') return;
    const byId = id => document.getElementById(id);
    const dialog = byId('settingsDialog'), panel = byId('gameManual');
    const main = byId('manualBody'), side = byId('manualDirectory'), crumbs = byId('manualBreadcrumbs');
    const input = byId('manualSearch'), fullSwitch = byId('manualFull');
    const state = { route: { kind: 'root' }, query: '', full: false, scroll: 0, sideScroll: 0, history: [] };
    let signature = '', opened = false;
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    function capture() { state.scroll = dialog.scrollTop; state.sideScroll = side.scrollTop; }
    function snapshot() {
        capture();
        const focus = document.activeElement?.dataset.manualTarget;
        return { route: { ...state.route }, query: state.query, scroll: state.scroll, sideScroll: state.sideScroll, focus };
    }
    function restoreScroll() {
        // No native game calls; rAF only waits for this document's layout.
        requestAnimationFrame(() => { if (opened) { dialog.scrollTop = state.scroll; side.scrollTop = state.sideScroll; } });
    }
    function go(route) {
        state.history.push(snapshot()); state.route = route; state.query = ''; state.scroll = 0; state.sideScroll = 0;
        render(); byId('manualHeading').focus({ preventScroll: true }); restoreScroll();
    }
    function button(text, target, handler, className = '') {
        const node = make('button', className, text); node.type = 'button'; node.dataset.manualTarget = target;
        node.addEventListener('click', handler); return node;
    }
    function path(entry) { return chapters.find(chapter => chapter.id === entry.chapter).title + ' / ' + entry.group; }
    function card(entry) {
        const node = button('', entry.id, () => go({ kind: 'article', id: entry.id }), 'manual-card');
        node.append(make('strong', '', entry.title), make('span', 'manual-summary', entry.summary));
        return node;
    }
    function render() {
        const available = entries(state.full), dirs = directory(state.full);
        let current = available.find(entry => entry.id === state.route.id);
        if ((state.route.kind === 'article' && !current) || (state.route.chapter && !dirs.some(item =>
            item.id === state.route.chapter && (!state.route.group || item.groups.includes(state.route.group))))) {
            state.route = { kind: 'root' }; state.scroll = 0;
        }
        current = state.route.kind === 'article' ? current : null;
        const chapterId = current?.chapter || state.route.chapter;
        const chapter = dirs.find(item => item.id === chapterId);
        if (input.value !== state.query) input.value = state.query;
        fullSwitch.checked = state.full;
        byId('manualClear').disabled = !state.query;
        byId('manualBack').disabled = !state.history.length && state.route.kind === 'root' && !state.query;
        byId('manualVisibility').textContent = state.full ? '完整百科 · 含未解锁内容和结局' : '随进度显示 · 只列出已解锁或曾出现的内容';
        crumbs.replaceChildren(button('目录', 'root', () => go({ kind: 'root' }), 'manual-link'));
        if (!state.query && chapter) {
            crumbs.append(make('span', '', '/'), button(chapter.title, chapter.id, () => go({ kind: 'chapter', chapter: chapter.id }), 'manual-link'));
            const group = current?.group || state.route.group;
            if (group) crumbs.append(make('span', '', '/'), button(group, group, () => go({ kind: 'group', chapter: chapter.id, group }), 'manual-link'));
            if (current) crumbs.append(make('span', '', '/'), make('span', '', current.title));
        }
        if (state.query) crumbs.append(make('span', '', '/ 搜索结果'));
        side.replaceChildren();
        for (const item of dirs) {
            const link = button(item.title, 'side-' + item.id, () => go({ kind: 'chapter', chapter: item.id }), 'manual-nav');
            if (chapterId === item.id && !state.query) link.setAttribute('aria-current', 'true');
            side.append(link);
            if (chapterId === item.id && !state.query) for (const group of item.groups) {
                const child = button(group, 'side-' + group, () => go({ kind: 'group', chapter: item.id, group }), 'manual-nav manual-subnav');
                if (group === (current?.group || state.route.group)) child.setAttribute('aria-current', 'true');
                side.append(child);
            }
        }
        main.replaceChildren();
        const heading = make('h3', '', state.query ? '搜索结果' : current?.title || state.route.group || chapter?.title || '说明书目录');
        heading.id = 'manualHeading'; heading.tabIndex = -1; main.append(heading);
        if (state.query) {
            const results = search(state.query, state.full);
            const status = make('p', 'manual-meta', results.length ? '找到 ' + results.length + ' 项' : '没有找到相关内容。试试其他名称，或清空搜索返回目录。');
            status.setAttribute('role', 'status'); main.append(status);
            for (const entry of results) {
                const result = card(entry); result.prepend(make('span', 'manual-meta', path(entry))); main.append(result);
            }
        } else if (current) {
            main.append(make('p', 'manual-intro', current.summary));
            for (const text of current.body) main.append(make('p', '', text));
            if (current.details.length) {
                const details = make('details', 'manual-details'); details.append(make('summary', '', '数值细节'));
                for (const text of current.details) details.append(make('p', '', text));
                main.append(details);
            }
            const related = current.links.map(id => available.find(entry => entry.id === id)).filter(Boolean);
            if (related.length) {
                const nav = make('nav', 'manual-related'); nav.setAttribute('aria-label', '相关词条'); nav.append(make('h4', '', '相关词条'));
                for (const entry of related) nav.append(button(entry.title + ' →', entry.id, () => go({ kind: 'article', id: entry.id }), 'manual-link'));
                main.append(nav);
            }
        } else if (state.route.kind === 'group') {
            for (const entry of available.filter(entry => entry.chapter === chapterId && entry.group === state.route.group)) main.append(card(entry));
        } else if (chapter) {
            for (const group of chapter.groups) {
                const count = available.filter(entry => entry.chapter === chapterId && entry.group === group).length;
                main.append(button(group + ' · ' + count + ' 项 →', group, () => go({ kind: 'group', chapter: chapterId, group }), 'manual-card'));
            }
        } else {
            main.append(make('p', 'manual-meta', '按目录逐层查看，或搜索名称、别名和说明。说明书不会执行游戏操作，阅读时游戏继续运行。'));
            for (const item of dirs) {
                const count = available.filter(entry => entry.chapter === item.id).length;
                main.append(button(item.title + ' · ' + count + ' 项 →', item.id, () => go({ kind: 'chapter', chapter: item.id }), 'manual-card'));
            }
        }
        signature = available.map(entry => entry.id).join('|');
    }
    byId('manualBack').addEventListener('click', () => {
        if (state.history.length) {
            Object.assign(state, state.history.pop()); render();
            const target = [...panel.querySelectorAll('[data-manual-target]')].find(node => node.dataset.manualTarget === state.focus);
            (target || byId('manualHeading')).focus({ preventScroll: true });
        } else {
            state.route = { kind: 'root' }; state.query = ''; state.scroll = 0; render(); byId('manualHeading').focus({ preventScroll: true });
        }
        restoreScroll();
    });
    input.addEventListener('input', () => {
        state.query = input.value; state.scroll = 0; render(); restoreScroll();
    });
    byId('manualClear').addEventListener('click', () => {
        state.query = ''; state.scroll = 0; render(); input.focus({ preventScroll: true }); restoreScroll();
    });
    fullSwitch.addEventListener('change', () => {
        capture(); state.full = fullSwitch.checked; render(); restoreScroll();
    });
    Object.assign(api, {
        open() { opened = true; render(); restoreScroll(); },
        leave() { if (opened) capture(); opened = false; },
        refresh() {
            if (!opened) return;
            if (entries(state.full).map(entry => entry.id).join('|') !== signature) {
                capture(); render(); restoreScroll();
            }
        },
    });
    Object.freeze(api);
})(window);
