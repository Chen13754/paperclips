const test = require('node:test');
const assert = require('node:assert/strict');
const { game, MemoryStorage } = require('./game.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const keys = ['saveGame', 'saveProjectsUses', 'saveProjectsFlags', 'saveProjectsActive', 'saveStratsActive', 'savePrestige'];

test('real swarm slider saves import into every phase, with frozen scalar types', () => {
    for (const position of ['0', '120', '200']) {
        const source = game();
        Object.assign(source, { humanFlag: 0, swarmFlag: 1, powMod: 1, harvesterLevel: 100, wireDroneLevel: 100 });
        source.document.getElementById('slider').value = position;
        source.updateSwarm();
        const data = copy(source.PaperclipSaves.capture());
        assert.equal(JSON.parse(data.storage.saveGame).sliderPos, position);
        for (const phase of [1, 2, 3]) {
            const receiver = game();
            receiver.humanFlag = phase === 1 ? 1 : 0;
            receiver.spaceFlag = phase === 3 ? 1 : 0;
            receiver.sliderPos = 50;
            receiver.PaperclipSaves.restore(receiver.PaperclipSaves.parse(JSON.stringify(data)), receiver.localStorage);
            const loaded = game(receiver.localStorage);
            assert.equal(loaded.PaperclipSaves.paused(), false);
            assert.equal(loaded.document.getElementById('slider').value, position);
            if (position === '0') assert.equal(loaded.giftCountdown, Infinity);
        }
    }
});

for (const key of keys) test(`automatic save rolls back a denied ${key} write`, () => {
    const g = game();
    g.funds = 100; g.prestigeU = 1; g.save();
    const before = g.localStorage.entries();
    g.funds = 500; g.prestigeU = 2; g.project1.flag = 1; g.project1.uses = 0;
    g.activeProjects.push(g.project7); g.allStrats[1].active = 1;
    g.localStorage.failKey = key;
    assert.equal(g.save(), false);
    assert.deepEqual(g.localStorage.entries(), before);
    assert.match(g.document.getElementById('saveStatus').textContent, /导出/);
    assert.equal(game(g.localStorage).funds, 100);
    assert.equal(g.save(), true);
    assert.equal(g.document.getElementById('saveStatus').textContent, '');
});

test('persistent write denial retains the 25-second cadence and exports current memory', () => {
    const timers = [], g = game(new MemoryStorage(), { setInterval(fn, delay) { timers.push({ fn, delay }); } });
    const slow = timers.find(timer => timer.delay === 100 && String(timer.fn).includes('saveTimer++')).fn;
    let attempts = 0;
    g.localStorage.setItem = () => { attempts++; throw new Error('QuotaExceededError'); };
    for (let i = 0; i < 1000; i++) slow();
    assert.equal(attempts, 4);
    g.funds = 123456;
    const data = g.PaperclipSaves.capture();
    assert.equal(JSON.parse(data.storage.saveGame).funds, 123456);
    assert.equal(g.PaperclipSaves.parse(JSON.stringify(data)).version, 1);
});

const corruptions = {
    missingKey: data => { delete data.storage.saveProjectsUses; },
    malformedJSON: data => { data.storage.saveProjectsFlags = '{'; },
    nullPrice: data => { data.game.margin = null; },
    nullResource: data => { data.game.funds = null; },
    chipIndex: data => { data.game.nextQchip = 100; },
    exhaustedChips: data => { data.game.nextQchip = 10; data.storage.saveProjectsActive = '["projectButton51"]'; },
    negativeStrategy: data => { data.game.pick = '-1'; },
    lockedStrategy: data => { data.game.pick = '1'; },
    sliderRange: data => { data.game.sliderPos = '201'; },
    sparseStrategies: data => { data.storage.saveStratsActive = '[1,0,1,0,0,0,0,0]'; },
    oversizedPortfolio: data => {
        data.game.stocks = Array.from({ length: 6 }, (_, id) => ({ id, symbol: 'ABC', price: 1, amount: 1, total: 1, profit: 0, age: 0 }));
        data.game.portfolioSize = 6;
    },
    stalePortfolioCount: data => { data.game.portfolioSize = 1; },
    invalidPhase: data => { data.game.humanFlag = 1; data.game.spaceFlag = 1; },
    destructiveResetFlag: data => { data.game.resetFlag = 0; },
    oversizedBattles: data => { data.game.maxBattles = 2; },
};
for (const [name, mutate] of Object.entries(corruptions)) test(`${name} cannot overwrite or partially load a game`, () => {
    const g = game(); g.funds = 100; g.save();
    const before = g.localStorage.entries(), data = copy(g.PaperclipSaves.capture());
    data.game = JSON.parse(data.storage.saveGame); mutate(data);
    data.storage.saveGame = JSON.stringify(data.game); delete data.game;
    assert.throws(() => g.PaperclipSaves.restore(data, g.localStorage));
    assert.deepEqual(g.localStorage.entries(), before);
    const raw = Object.fromEntries(Object.entries(data.storage).filter(([, value]) => value !== null));
    const storage = new MemoryStorage(raw), loaded = game(storage);
    assert.equal(loaded.PaperclipSaves.paused(), true);
    assert.deepEqual(storage.entries(), raw);
    assert.equal(loaded.save(), false);
    assert.throws(() => loaded.PaperclipSaves.capture(), /尚未成功读取/);
});

test('legitimate null revenue and infinite gift countdown recover without a free gift', () => {
    const g = game();
    Object.assign(g, { humanFlag: 0, swarmFlag: 1, powMod: 1, harvesterLevel: 100, wireDroneLevel: 100, avgRev: NaN, giftCountdown: Infinity });
    g.save(); const loaded = game(g.localStorage);
    assert.equal(loaded.PaperclipSaves.paused(), false);
    assert.equal(loaded.avgRev, 0); assert.equal(loaded.giftCountdown, Infinity);
    loaded.updateSwarm(); assert.equal(loaded.swarmGifts, 0);
});

test('numeric strategy text restores a usable selection and full chips cannot be bought', () => {
    for (const pick of ['01', '1e0', ' 1 ']) {
        const g = game(); g.allStrats[1].active = 1; g.pick = pick; g.save();
        const loaded = game(g.localStorage);
        assert.equal(loaded.PaperclipSaves.paused(), false);
        assert.equal(loaded.pick, '1');
        assert.equal(loaded.document.getElementById('stratPicker').value, '1');
        assert.equal(loaded.strats[loaded.pick], loaded.strats[1]);
    }
    const g = game(); g.nextQchip = 10; g.operations = 1e6;
    assert.equal(g.project51.cost(), false);
});

test('startup read denial stays paused without overwriting storage', () => {
    const storage = new MemoryStorage({ saveGame: 'preserve' });
    storage.getItem = () => { throw new Error('SecurityError'); };
    const g = game(storage);
    assert.equal(g.PaperclipSaves.paused(), true);
    assert.equal(g.save(), false);
    assert.equal(storage.entries().saveGame, 'preserve');
});

test('battery boundary conserves supplied energy and production; momentum remains unbounded', () => {
    for (const [battery, expected, remaining] of [[0, .25, 0], [1, .3, 0], [15, 1, 0], [16, 1, 1]]) {
        const g = game();
        Object.assign(g, { humanFlag: 0, spaceFlag: 0, farmLevel: 10, factoryLevel: 10, harvesterLevel: 0,
            wireDroneLevel: 0, storedPower: battery, powMod: .1, clips: 1e12, wire: 1e12 });
        g.updatePower(); assert.equal(g.powMod, expected); assert.equal(g.storedPower, remaining);
        const before = g.clips; g.clipClick(g.powMod * g.factoryLevel * g.factoryRate);
        assert(g.clips >= before); assert(g.wire <= 1e12);
    }
    const g = game(); Object.assign(g, { humanFlag: 0, farmLevel: 40, factoryLevel: 1, batteryLevel: 1, storedPower: 0, momentum: 1, powMod: 2 });
    g.updatePower(); assert(g.storedPower > 0); assert.equal(g.powMod, 2.0005);
    Object.assign(g, { farmLevel: 10, factoryLevel: 10, storedPower: 15, powMod: .3 });
    g.updatePower(); assert.equal(g.powMod, 1.0005);
});

test('CPU, swarm gifts and all probe attributes enforce live allocation limits', () => {
    const g = game(); Object.assign(g, { trust: 3, processors: 1, memory: 1 });
    g.addProc(); g.addMem(); assert.equal(g.processors + g.memory, 3);
    Object.assign(g, { humanFlag: 0, trust: 100, swarmGifts: 1 });
    g.addMem(); g.addProc(); assert.equal(g.swarmGifts, 0);
    for (const attr of ['Speed', 'Nav', 'Haz', 'Rep', 'Fac', 'Harv', 'Wire', 'Combat']) {
        for (const field of ['Speed', 'Nav', 'Haz', 'Rep', 'Fac', 'Harv', 'Wire', 'Combat']) g['probe' + field] = 0;
        g.probeTrust = 1; g.probeUsedTrust = 0;
        g['raiseProbe' + attr](); g['raiseProbe' + attr]();
        assert.equal(g.usedProbeTrust(), 1, attr);
        g['lowerProbe' + attr](); g['raiseProbe' + attr](); assert.equal(g.usedProbeTrust(), 1, attr);
    }
});

test('investment and tournament purchases reject insufficient or already-spent resources', () => {
    const g = game(); g.yomi = g.investUpgradeCost; g.investUpgrade();
    const level = g.investLevel; g.investUpgrade(); assert.equal(g.investLevel, level); assert.equal(g.yomi, 0);
    g.standardOps = g.tourneyCost; g.tempOps = 0; g.tourneyInProg = 0; g.newTourney();
    const tourney = g.tourneyLvl; g.newTourney(); assert.equal(g.tourneyLvl, tourney); assert.equal(g.standardOps, 0);
});

test('saved controls restore before timers can overwrite them', () => {
    const g = game();
    Object.assign(g, { riskiness: 1, pick: '1', sliderPos: '160', wireBuyerStatus: 0, autoTourneyStatus: 0 });
    g.allStrats[1].active = 1; g.save();
    const loaded = game(g.localStorage);
    for (const [id, expected] of [['investStrat', 'hi'], ['stratPicker', '1'], ['slider', '160']])
        assert.equal(loaded.document.getElementById(id).value, expected);
    assert.equal(loaded.document.getElementById('wireBuyerStatus').textContent, '关闭');
    assert.equal(loaded.document.getElementById('autoTourneyStatus').textContent, '关闭');
});

for (const [id, counter] of [[200, 'prestigeU'], [201, 'prestigeS']]) test(`ending ${id} atomically restarts or retains the entire previous game`, () => {
    for (const key of keys) {
        const storage = new MemoryStorage(), g = game(storage);
        Object.assign(g, { humanFlag: 0, spaceFlag: 1, standardOps: 300000, creativity: 300000 });
        g.save(); const before = storage.entries(), snapshot = copy(g.getSaveSnapshot());
        const remove = storage.removeItem.bind(storage), set = storage.setItem.bind(storage);
        let failed = false;
        storage.removeItem = k => { if (k === key && !failed) { failed = true; throw new Error('Denied'); } remove(k); };
        storage.setItem = (k, v) => { if (k === key && !failed) { failed = true; throw new Error('Denied'); } set(k, v); };
        g['project' + id].effect();
        assert.deepEqual(storage.entries(), before, key); assert.deepEqual(copy(g.getSaveSnapshot()), snapshot, key);
        assert.equal(g.fullRestartPending, false);
        g['project' + id].effect();
        assert.equal(g.fullRestartPending, true); assert.equal(g.save(), undefined);
        const restarted = game(storage); assert.equal(restarted.humanFlag, 1); assert.equal(restarted[counter], 1);
    }
});

test('legacy negative-operations replay preserves progress on cancel or storage failure', () => {
    let confirmed = false;
    const g = game(new MemoryStorage(), { confirm() { return confirmed; } });
    g.operations = g.standardOps = -10000; g.save();
    const before = copy(g.getSaveSnapshot()), raw = g.localStorage.entries();
    g.project217.effect(); assert.deepEqual(copy(g.getSaveSnapshot()), before);
    confirmed = true;
    const remove = g.localStorage.removeItem.bind(g.localStorage);
    g.localStorage.removeItem = key => { if (key === 'saveGame') throw new Error('Denied'); remove(key); };
    g.project217.effect(); assert.deepEqual(copy(g.getSaveSnapshot()), before); assert.deepEqual(g.localStorage.entries(), raw);
    assert.equal(game(new MemoryStorage(raw)).PaperclipSaves.paused(), false);
});
