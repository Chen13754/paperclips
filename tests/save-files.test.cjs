const test = require('node:test');
const assert = require('node:assert/strict');
const { game, MemoryStorage } = require('./game.cjs');
const copy = value => JSON.parse(JSON.stringify(value));

test('export captures runtime before autosave, all six keys, and local filename time', () => {
    const g = game();
    g.save();
    g.clips = 54321;
    g.projects[0].uses = 0;
    g.projects[0].flag = 1;
    const envelope = g.PaperclipSaves.capture();
    assert.equal(JSON.parse(envelope.storage.saveGame).clips, 54321);
    assert.equal(JSON.parse(envelope.storage.saveProjectsUses)[0], 0);
    assert.equal(JSON.parse(envelope.storage.saveProjectsFlags)[0], 1);
    assert.equal(envelope.storage.savePrestige, null);
    assert.equal(Object.keys(envelope.storage).length, 6);
    assert.equal(new Date(envelope.exportedAt).toISOString(), envelope.exportedAt);
    assert.equal(g.PaperclipSaves.filename(new Date(2026, 9, 10, 8, 9, 7)), 'paperclips-2026-10-10_08-09-07.json');
});

for (const stage of ['initial', 'earth', 'space']) {
    test(`${stage} save restores through the actual upstream load routines`, () => {
        const g = game();
        if (stage !== 'initial') {
            g.humanFlag = 0; g.clips = 1e15; g.unusedClips = 1e12;
            g.factoryLevel = 15; g.harvesterLevel = 30; g.wireDroneLevel = 40;
            g.projects[0].uses = 0; g.projects[0].flag = 1;
            g.activeProjects.push(g.projects[1]);
            g.allStrats[1].active = 1;
            g.qChips[0].active = 1;
            g.stocks.push({ id: 1, symbol: 'ABC', price: 10, amount: 2, total: 20, profit: 0, age: 0 });
            g.portfolioSize = 1;
        }
        if (stage === 'space') {
            g.spaceFlag = 1; g.probeCount = 1e20; g.probeTrust = 30; g.yomi = 100000;
            g.cheatPrestigeU(); g.cheatPrestigeS();
            g.pick = '10';
            g.battles.push({ id: 1, clipProbes: 2e8, drifterProbes: 1e8, victory: false,
                loss: false, whiteFlag: 0, territory: 0.01, reportCount: 0, garbageFlag: 0 });
            g.tourneyInProg = 1;
        }
        if (stage === 'earth') { g.farmLevel = 1000; g.powMod = 1; }
        const exported = copy(g.PaperclipSaves.capture());
        const storage = new MemoryStorage({ unrelated: 'keep' });
        const receiver = game(storage);
        receiver.PaperclipSaves.restore(receiver.PaperclipSaves.parse(JSON.stringify(exported)), storage);
        for (const [key, value] of Object.entries(exported.storage)) assert.equal(storage.getItem(key), value, key);
        const reloaded = game(storage);
        const roundtrip = copy(reloaded.PaperclipSaves.capture());
        for (const key of Object.keys(exported.storage).filter(key => key !== 'saveGame')) {
            assert.equal(roundtrip.storage[key], exported.storage[key], key);
        }
        const before = JSON.parse(exported.storage.saveGame);
        const after = JSON.parse(roundtrip.storage.saveGame);
        // Chip values are now derived from ownership when loading an existing save.
        before.qChips.forEach(chip => { chip.value = chip.active === 1 ? 1 : 0; });
        // Original refresh() clears an in-progress battle/tournament and uses x as a loop counter.
        for (const field of Object.keys(before).filter(field => !['x', 'battles', 'tourneyInProg'].includes(field))) {
            assert.deepEqual(after[field], before[field], field);
        }
        assert.deepEqual(after.battles, []);
        assert.equal(after.tourneyInProg, 0);
        assert.equal(storage.getItem('unrelated'), 'keep');
    });
}

test('absent prestige clears the receiving browser previous universe', () => {
    const g = game();
    const incoming = copy(g.PaperclipSaves.capture());
    g.cheatPrestigeU();
    g.PaperclipSaves.restore(incoming, g.localStorage);
    assert.equal(g.localStorage.getItem('savePrestige'), null);
    assert.equal(game(g.localStorage).prestigeU, 0);
});

test('explicit zero prestige and serialized upstream title nodes remain valid', () => {
    const g = game();
    g.localStorage.setItem('savePrestige', '{"prestigeU":0,"prestigeS":0}');
    g.battleName = {};
    g.threnodyTitle = {};
    const data = copy(g.PaperclipSaves.capture());
    assert.equal(g.PaperclipSaves.parse(JSON.stringify(data)).storage.savePrestige, data.storage.savePrestige);
});

const invalidCases = {
    'wrong game': data => { data.format = 'another-game'; },
    'wrong version': data => { data.version = 2; },
    'invalid date': data => { data.exportedAt = 'invalid'; },
    'missing main key': data => { delete data.storage.saveGame; },
    'missing prestige entry': data => { delete data.storage.savePrestige; },
    'corrupt nested JSON': data => { data.storage.saveGame = '{'; },
    'incomplete main progress': data => { data.storage.saveGame = '{}'; },
    'wrong scalar type': data => { const value = JSON.parse(data.storage.saveGame); value.clips = 'broken'; data.storage.saveGame = JSON.stringify(value); },
    'wrong project array length': data => { data.storage.saveProjectsFlags = '[]'; },
    'unknown project': data => { data.storage.saveProjectsActive = '["unknown-project"]'; },
    'invalid strategy flag': data => { const flags = JSON.parse(data.storage.saveStratsActive); flags[0] = 2; data.storage.saveStratsActive = JSON.stringify(flags); },
    'missing quantum chips': data => { const value = JSON.parse(data.storage.saveGame); value.qChips = []; data.storage.saveGame = JSON.stringify(value); },
    'incomplete stock': data => { const value = JSON.parse(data.storage.saveGame); value.stocks = [{}]; data.storage.saveGame = JSON.stringify(value); },
    'incomplete battle': data => { const value = JSON.parse(data.storage.saveGame); value.battles = [{}]; data.storage.saveGame = JSON.stringify(value); },
    'missing battle numbers': data => { const value = JSON.parse(data.storage.saveGame); value.battleNumbers = []; data.storage.saveGame = JSON.stringify(value); },
    'invalid prestige': data => { data.storage.savePrestige = '{"prestigeU":-1,"prestigeS":0}'; },
};
for (const [name, mutate] of Object.entries(invalidCases)) {
    test(`reject ${name} without writing storage`, () => {
        const g = game();
        const data = copy(g.PaperclipSaves.capture());
        const before = g.localStorage.entries();
        mutate(data);
        assert.throws(() => g.PaperclipSaves.parse(JSON.stringify(data)));
        assert.throws(() => g.PaperclipSaves.restore(data, g.localStorage));
        assert.deepEqual(g.localStorage.entries(), before);
    });
}

test('truncated file does not change progress', () => {
    const g = game();
    g.save();
    const before = g.localStorage.entries();
    assert.throws(() => g.PaperclipSaves.parse('{"format":'));
    assert.deepEqual(g.localStorage.entries(), before);
});

test('quota failure after several writes restores every changed key', () => {
    const g = game();
    g.clips = 5;
    g.projects[0].uses = 1;
    g.cheatPrestigeU();
    const before = copy(g.PaperclipSaves.capture()).storage;
    g.clips = 900;
    g.projects[0].uses = 0;
    g.projects[0].flag = 1;
    g.activeProjects.push(g.projects[1]);
    const incoming = copy(g.PaperclipSaves.capture());
    const storage = new MemoryStorage(Object.fromEntries(Object.entries(before).filter(([, value]) => value !== null)));
    storage.setItem('unrelated', 'keep');
    storage.failKey = 'saveProjectsActive';
    assert.throws(() => g.PaperclipSaves.restore(incoming, storage), /已保留原存档/);
    for (const [key, value] of Object.entries(before)) assert.equal(storage.getItem(key), value);
    assert.equal(storage.getItem('unrelated'), 'keep');
});

test('denied first write leaves all old data untouched', () => {
    const g = game();
    const incoming = copy(g.PaperclipSaves.capture());
    const storage = new MemoryStorage({ saveGame: 'old-save', savePrestige: 'old-prestige' });
    const before = storage.entries();
    storage.failKey = 'saveGame';
    assert.throws(() => g.PaperclipSaves.restore(incoming, storage));
    assert.deepEqual(storage.entries(), before);
});

for (const phase of [1, 2, 3]) {
    test(`full clear returns phase ${phase} and prestige to fresh defaults without touching unrelated data`, () => {
        const g = game();
        g.humanFlag = phase === 1 ? 1 : 0; g.spaceFlag = phase === 3 ? 1 : 0;
        g.funds = 1e6; g.clips = 1e27; g.ticks = 900000;
        g.project1.flag = 1; g.project1.uses = 0; g.allStrats[1].active = 1;
        g.cheatPrestigeU(); g.cheatPrestigeS();
        const saved = copy(g.PaperclipSaves.capture());
        g.localStorage.setItem('unrelated', 'keep');
        g.fullRestartPending = true;
        g.PaperclipSaves.clear(g.localStorage);
        g.save(); // A queued autosave must not recreate the old progress before navigation.
        for (const key of Object.keys(saved.storage)) assert.equal(g.localStorage.getItem(key), null, key);
        assert.equal(g.localStorage.getItem('unrelated'), 'keep');
        const fresh = game(g.localStorage), baseline = game();
        assert.deepEqual(copy(fresh.getSaveSnapshot()), copy(baseline.getSaveSnapshot()));
        assert.deepEqual([fresh.prestigeU, fresh.prestigeS, fresh.fullRestartPending], [0, 0, false]);
        // The exported version 1 file can still restore progress after a deliberate full reset.
        fresh.PaperclipSaves.restore(fresh.PaperclipSaves.parse(JSON.stringify(saved)), fresh.localStorage);
        assert.equal(game(fresh.localStorage).clips, 1e27);
        assert.equal(game(fresh.localStorage).prestigeU, 1);
    });
}

for (const failKey of ['saveGame', 'saveProjectsUses', 'saveProjectsFlags',
    'saveProjectsActive', 'saveStratsActive', 'savePrestige']) {
    test(`full clear rolls back all six raw saves if deleting ${failKey} fails`, () => {
        const g = game();
        const entries = Object.fromEntries(Object.keys(g.PaperclipSaves.capture().storage)
            .map(key => [key, 'raw legacy data for ' + key]));
        const storage = new MemoryStorage({ ...entries, unrelated: 'keep' });
        const remove = storage.removeItem;
        let failed = false;
        storage.removeItem = function (key) {
            if (key === failKey && !failed) { failed = true; throw new Error('SecurityError'); }
            return remove.call(this, key);
        };
        assert.throws(() => g.PaperclipSaves.clear(storage), /重开失败，已保留原存档/);
        assert.deepEqual(storage.entries(), { ...entries, unrelated: 'keep' });
    });
}

test('full clear handles fresh/sparse storage and detects a silently rejected deletion', () => {
    const g = game();
    const storage = new MemoryStorage({ savePrestige: 'legacy', unrelated: 'keep' });
    storage.removeItem = () => {};
    assert.throws(() => g.PaperclipSaves.clear(storage), /已保留原存档/);
    assert.equal(storage.getItem('savePrestige'), 'legacy');
    delete storage.removeItem;
    g.PaperclipSaves.clear(storage); g.PaperclipSaves.clear(storage);
    assert.deepEqual(storage.entries(), { unrelated: 'keep' });
});

test('full clear read denial never deletes data; rollback denial explains how to preserve runtime', () => {
    const g = game();
    const unreadable = new MemoryStorage({ saveGame: 'old' });
    unreadable.getItem = () => { throw new Error('SecurityError'); };
    assert.throws(() => g.PaperclipSaves.clear(unreadable));
    assert.deepEqual(unreadable.entries(), { saveGame: 'old' });
    const storage = new MemoryStorage({ saveGame: 'old', saveProjectsUses: 'projects' });
    storage.failKey = 'saveGame';
    const remove = storage.removeItem;
    storage.removeItem = function (key) {
        if (key === 'saveProjectsUses') throw new Error('SecurityError');
        return remove.call(this, key);
    };
    assert.throws(() => g.PaperclipSaves.clear(storage), /请勿刷新或关闭页面.*请先导出存档/);
});
