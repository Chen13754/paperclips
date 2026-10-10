const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game, MemoryStorage } = require('./game.cjs');
const legacy = require('./fixtures/legacy-save-v1.json');
const copy = value => JSON.parse(JSON.stringify(value));
function manual(g = game()) {
    for (const file of ['manual-content.js', 'manual.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), g, { filename: file });
    return g;
}

test('all 96 native research projects have unique complete explanations and valid related links', () => {
    const g = manual(), data = g.PaperclipManual.entries(true);
    const research = data.filter(entry => entry.project);
    assert.equal(research.length, 96);
    assert.equal(new Set(data.map(entry => entry.id)).size, data.length);
    assert.deepEqual(research.map(entry => entry.project.id).sort(), g.projects.map(project => project.id).sort());
    assert.equal(g.PaperclipManual.directory(true).length, 7);
    for (const entry of research) {
        assert(entry.title.trim()); assert(entry.group);
        assert(entry.body[0].startsWith('出现条件：'));
        assert(entry.body[1].startsWith('费用：'));
        assert(entry.body[2].startsWith('实际效果：'));
        assert(entry.summary.length > 10);
    }
    for (const entry of data) for (const id of entry.links) assert(data.some(item => item.id === id), `${entry.id} -> ${id}`);
});

test('fresh game directories, searches and counts never expose hidden articles', () => {
    const g = manual(), m = g.PaperclipManual;
    assert.deepEqual(copy(m.directory().map(chapter => chapter.id)), ['start', 'business', 'saves']);
    for (const term of ['量子计算', 'OODA', '英雄挽歌', '漂流皇帝', '信任上限', 'Swarm Computing']) assert.equal(m.search(term).length, 0, term);
    assert.equal(m.entries().filter(entry => entry.project).length, 0);
    assert(m.search('OODA', true).length > 0);
    assert(m.search('英雄挽歌', true).length > 0);
    assert.equal(m.search('完全不存在的词', true).length, 0);
});

test('research follows active/completed/used records without executing triggers or costs', () => {
    const g = manual();
    g.activeProjects = [g.project1]; g.project7.flag = 1; g.project3.uses = 0;
    for (const project of g.projects) for (const method of ['trigger', 'cost', 'effect']) project[method] = () => { throw Error(method); };
    assert.deepEqual(copy(g.PaperclipManual.entries().filter(entry => entry.project).map(entry => entry.id)), ['r1', 'r3', 'r7']);
    assert.doesNotThrow(() => { g.PaperclipManual.directory(); g.PaperclipManual.search('研究', true); });
    g.clipmakerLevel = 10; // Mere eligibility does not mean a project has appeared.
    assert(!g.PaperclipManual.entries().some(entry => entry.id === 'r4'));
});

test('three stages retain historical unlocked systems, but do not reveal all future research', () => {
    const g = manual(), ids = () => g.PaperclipManual.entries().map(entry => entry.id);
    g.compFlag = 1; g.investmentEngineFlag = 1; g.project21.flag = 1;
    assert(ids().includes('investments')); assert(ids().includes('computing'));
    assert(!ids().includes('earth-chain'));
    g.humanFlag = 0; g.investmentEngineFlag = 0;
    g.project43.flag = g.project126.flag = g.project127.flag = 1;
    assert(ids().includes('investments')); assert(ids().includes('harvesters')); assert(ids().includes('swarm'));
    assert(!ids().includes('wire-drones')); assert(!ids().includes('probes'));
    g.spaceFlag = 1;
    assert(ids().includes('probes')); assert(ids().includes('harvesters')); assert(!ids().includes('ending'));
    assert(!ids().includes('r140'));
    g.project148.flag = 1;
    assert(ids().includes('ending'));
});

test('Chinese and English aliases, full-width text and title-priority search work', () => {
    const g = manual(), m = g.PaperclipManual;
    for (const [query, id] of [['工作', 'r126'], ['Swarm Computing', 'r126'], ['ＴＩＴ　ＦＯＲ　ＴＡＴ', 'r65'],
        ['OODA', 'r120'], ['Xavier', 'r219'], ['存档', 'save-files'], ['光子芯片', 'r51']]) {
        assert(m.search(query, true).some(entry => entry.id === id), query);
    }
    assert(m.search('量子计算', true).slice(0, 3).every(entry => entry.title.includes('量子计算')));
    assert.equal(m.search('   ', true).length, 0);
});

test('repeatable research fees are current after loading and titles remain stable', () => {
    const g = manual();
    g.qChipCost = 35000; g.bribe = 4000000; g.threnodyCost = 70000; g.driftKingMessageCost = 1;
    g.project133.title = '动态战役名称';
    const item = id => g.PaperclipManual.entries(true).find(entry => entry.id === id);
    assert(item('r51').body[1].includes('35,000'));
    assert(item('r40b').body[1].includes('4,000,000'));
    assert.equal(item('r133').title, '英雄挽歌');
    assert(item('r133').body[1].includes('28,000 Yomi'));
    assert.equal(item('r140').body[1], '费用：1 操作点数。');
});

test('manual model is read-only with old v1 storage, snapshot fields and all six keys unchanged', () => {
    const storage = new MemoryStorage(legacy.storage), g = manual(game(storage));
    const before = copy(g.getSaveSnapshot()), stored = copy(storage.entries());
    for (const method of ['save', 'refresh', 'buttonUpdate', 'updateStats', 'manageProjects', 'qComp', 'investUpgrade'])
        g[method] = () => { throw Error('manual called ' + method); };
    for (let i = 0; i < 5; i++) {
        g.PaperclipManual.entries(); g.PaperclipManual.directory(true);
        g.PaperclipManual.search('quantum', true); g.PaperclipManual.search('回形针');
    }
    assert.deepEqual(copy(g.getSaveSnapshot()), before);
    assert.deepEqual(storage.entries(), stored);
    assert.equal(Object.keys(stored).length, 6);
    assert.equal(g.PaperclipSaves.parse(JSON.stringify(legacy)).version, 1);
});

test('documented investment probability matches actual stock change and upgrade branches', () => {
    const g = manual();
    function change() {
        g.stocks = [{ age: 0, price: 100, amount: 1, profit: 0 }]; g.portfolioSize = 1;
        g.__randoms = [.1, .505, .5];
        vm.runInContext('Math.random = () => __randoms.shift(); updateStocks();', g);
        return g.stocks[0].price;
    }
    assert.equal(g.stockGainThreshold, .5); assert(change() < 100);
    assert.equal(g.stockGainThreshold, .5, 'passage of a stock tick does not improve the probability');
    g.yomi = 10000; g.investUpgrade();
    assert.equal(g.stockGainThreshold, .51); assert(change() > 100);
    const entry = g.PaperclipManual.entries(true).find(entry => entry.id === 'investments');
    const text = [...entry.body, ...entry.details].join(' ');
    assert(text.includes('50%')); assert(text.includes('1 个百分点'));
});

test('documented additive clipper and multiplicative wire upgrades match native effects', () => {
    const g = manual();
    function effect(id) {
        const project = g['project' + id]; project.element = { parentNode: { removeChild() {} } };
        g.activeProjects.push(project); project.effect();
    }
    for (const id of ['1', '4', '5', '16']) effect(id);
    assert.equal(g.clipperBoost, 7.5);
    const initial = g.wireSupply;
    for (const id of ['7', '8', '9', '10', '10b']) effect(id);
    assert.equal(g.wireSupply, initial * 1.5 * 1.75 * 2 * 3 * 11);
    effect('102'); effect('112');
    assert.equal(g.factoryBoost, 1000); assert.equal(g.droneBoost, 2);
    effect('126'); assert.equal(g.swarmFlag, 1);
    effect('129'); assert.equal(g.project129.flag, 1);
});
