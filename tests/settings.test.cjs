const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { game, MemoryStorage } = require('./game.cjs');
const legacy = require('./fixtures/legacy-save-v1.json');
const copy = value => JSON.parse(JSON.stringify(value));
function setup(storage) {
    const g = game(storage);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'settings.js'), 'utf8'), g);
    return g;
}
function unlocked(g, phase) {
    g.humanFlag = phase === 1 ? 1 : 0; g.spaceFlag = phase === 3 ? 1 : 0;
    g.compFlag = g.creativityOn = g.strategyEngineFlag = g.swarmFlag = 1;
    g.project121.flag = g.project127.flag = 1;
}
const keys = g => [...g.PaperclipTools.resources()].map(item => item.key);
test('initial phase only exposes unlocked resources, and phases have the agreed resource amounts', () => {
    const g = setup();
    assert.deepEqual(keys(g), ['funds', 'wire']);
    for (const [phase, expected] of [
        [1, ['funds','wire','trust','creativity','yomi','standardOps']],
        [2, ['unusedClips','wire','acquiredMatter','creativity','yomi','swarmGifts','standardOps','storedPower']],
        [3, ['unusedClips','creativity','yomi','swarmGifts','honor','standardOps']],
    ]) {
        unlocked(g, phase);
        assert.deepEqual(keys(g), expected);
        for (const item of g.PaperclipTools.resources()) {
            for (const amount of item.amounts || []) {
                g[item.key] = 0;
                const snapshot = copy(g.getSaveSnapshot());
                assert.equal(g.PaperclipTools.apply(item.key, amount).ok, true, item.key);
                assert.equal(g[item.key], amount);
                snapshot.saveGame[item.key] = amount;
                assert.deepEqual(copy(g.getSaveSnapshot()), snapshot, 'only the selected native resource changes');
            }
        }
    }
    assert.deepEqual(copy(g.PaperclipTools.resources().find(item => item.key === 'unusedClips').amounts), [1e24, 1e54]);
});
test('every click rechecks phase, unlock, ending and accepted action', () => {
    const g = setup();
    assert.equal(g.PaperclipTools.apply('yomi', 1e4).ok, false);
    unlocked(g, 1);
    assert.equal(g.PaperclipTools.apply('honor', 1e4).ok, false);
    assert.equal(g.PaperclipTools.apply('clips', 1e4).ok, false);
    assert.equal(g.PaperclipTools.apply('funds', Infinity).ok, false);
    assert.equal(g.PaperclipTools.apply('funds', '10000').ok, false);
    unlocked(g, 2);
    assert.equal(g.PaperclipTools.apply('funds', 1e4).ok, false);
    g.swarmFlag = 0;
    assert.equal(g.PaperclipTools.apply('swarmGifts', 10).ok, false);
    g.dismantle = 1;
    const before = copy(g.getSaveSnapshot());
    for (const item of g.PaperclipTools.resources()) assert.equal(g.PaperclipTools.apply(item.key, item.amounts?.[0] || 'fill').ok, false);
    assert.deepEqual(copy(g.getSaveSnapshot()), before);
});
test('fill operations retains temporary overflow, and energy respects capacity', () => {
    const g = setup(); unlocked(g, 2);
    g.memory = 4; g.standardOps = 123; g.tempOps = 205.9; g.operations = 328;
    assert.equal(g.PaperclipTools.apply('standardOps', 'fill').ok, true);
    assert.deepEqual([g.standardOps,g.tempOps,g.operations], [4000,205.9,4205]);
    assert.equal(g.PaperclipTools.apply('standardOps', 'fill').ok, false);
    g.batteryLevel = 2; g.storedPower = 123;
    assert.equal(g.PaperclipTools.apply('storedPower', 'fill').ok, true);
    assert.equal(g.storedPower, g.batteryLevel * g.batterySize);
    assert.equal(g.PaperclipTools.apply('storedPower', 'fill').ok, false);
    g.batteryLevel = 0; g.storedPower = 0;
    assert.equal(g.PaperclipTools.apply('storedPower', 'fill').ok, false);
});
test('invalid, overflowing, fractional counts and precision-lost changes are rejected without writing', () => {
    const g = setup(); unlocked(g, 1);
    for (const value of [NaN, Infinity, -1, '10', undefined]) {
        g.funds = value;
        assert.equal(g.PaperclipTools.apply('funds', 1e4).ok, false);
        assert(Object.is(g.funds, value));
    }
    for (const value of [1.5, Number.MAX_SAFE_INTEGER, -1]) {
        g.trust = value;
        assert.equal(g.PaperclipTools.apply('trust', 10).ok, false);
        assert.equal(g.trust, value);
    }
    g.funds = 1e30;
    assert.equal(g.PaperclipTools.apply('funds', 1e6).ok, false);
    assert.equal(g.funds, 1e30);
    g.memory = -1; g.standardOps = 0;
    assert.equal(g.PaperclipTools.apply('standardOps', 'fill').ok, false);
    g.memory = 2; g.tempOps = Infinity;
    assert.equal(g.PaperclipTools.apply('standardOps', 'fill').ok, false);
    assert.equal(g.standardOps, 0);
    unlocked(g, 2); g.batteryLevel = 1000; g.batterySize = Number.MAX_VALUE;
    assert.equal(g.PaperclipTools.apply('storedPower', 'fill').ok, false);
    assert.equal(g.storedPower, 0);
});
test('boosts remain in native version 1 export/import/reload and never add save keys', () => {
    const g = setup(new MemoryStorage(legacy.storage));
    unlocked(g, 3); g.unusedClips = 0;
    const oldFields = Object.keys(g.getSaveSnapshot().saveGame);
    const clips = g.clips, time = g.ticks, count = g.qChips.filter(chip => chip.active).length;
    const beforeStorage = g.localStorage.entries();
    for (let i = 0; i < 3; i++) assert.equal(g.PaperclipTools.apply('unusedClips', 1e54).ok, true);
    assert.equal(g.clips, clips); assert.equal(g.ticks, time);
    assert.deepEqual(g.localStorage.entries(), beforeStorage, 'use native autosave/export, no extra writer');
    const envelope = copy(g.PaperclipSaves.capture());
    assert.equal(envelope.version, 1);
    assert.deepEqual(Object.keys(envelope.storage), Object.keys(legacy.storage));
    assert.deepEqual(Object.keys(JSON.parse(envelope.storage.saveGame)), oldFields);
    const receiver = setup();
    receiver.PaperclipSaves.restore(receiver.PaperclipSaves.parse(JSON.stringify(envelope)), receiver.localStorage);
    const loaded = setup(receiver.localStorage);
    assert.equal(loaded.unusedClips, g.unusedClips);
    assert.deepEqual([loaded.prestigeU,loaded.prestigeS], [2,1]);
    assert.equal(loaded.qChips.filter(chip => chip.active).length, count);
    assert(loaded.qChips.filter(chip => chip.active).every(chip => chip.value === 1));
});
test('settings summary is read only, includes run time and linear prestige bonuses', () => {
    const g = setup(); g.ticks = 366199; g.prestigeU = 2; g.prestigeS = 1;
    const before = copy(g.getSaveSnapshot());
    const stats = copy(g.PaperclipTools.summary());
    assert.equal(stats[1][1], '01:01:01');
    assert.match(stats[2][1], /3 · 需求加成 \+20%/);
    assert.match(stats[3][1], /2 · 创造力速度加成 \+10%/);
    assert.deepEqual(copy(g.getSaveSnapshot()), before);
});

test('native boolean and numeric creativity unlocks import into fresh or progressed browsers', () => {
    for (const value of [true, false, 0, 1]) {
        const g = setup(); g.creativityOn = value;
        assert.equal(keys(g).includes('creativity'), value === true || value === 1);
        const envelope = copy(g.PaperclipSaves.capture());
        for (const targetValue of [false, 1]) {
            const receiver = setup(); receiver.creativityOn = targetValue;
            const valid = receiver.PaperclipSaves.parse(JSON.stringify(envelope));
            receiver.PaperclipSaves.restore(valid, receiver.localStorage);
            assert.equal(setup(receiver.localStorage).creativityOn, value);
        }
    }
    const g = setup(), envelope = copy(g.PaperclipSaves.capture());
    const progress = JSON.parse(envelope.storage.saveGame); progress.creativityOn = 'yes';
    envelope.storage.saveGame = JSON.stringify(progress);
    assert.throws(() => g.PaperclipSaves.parse(JSON.stringify(envelope)), /creativityOn/);
});
