const test = require('node:test');
const assert = require('node:assert/strict');
const { game, MemoryStorage } = require('./game.cjs');
// Synthetic file exported by b73761b, before fixed quantum yields were introduced.
const legacy = require('./fixtures/legacy-save-v1.json');
const copy = value => JSON.parse(JSON.stringify(value));

for (const count of [0, 1, 10]) {
    test(`${count} purchased chips remain black and provide full yield on the first click`, () => {
        const g = game();
        assert(g.qChipsElements.every(element => element.style.opacity === 0));
        g.memory = 50;
        g.standardOps = 123;
        g.qChips.forEach((chip, index) => {
            chip.active = index < count ? 1 : 0;
            chip.value = index < count ? -0.8 : 0.5;
        });
        g.qComp();
        assert.equal(g.standardOps, 123 + count * 360);
        assert.equal(g.tempOps, 0);
        if (count === 0) assert.equal(g.qCompDisplayElement.innerHTML, '需要光子芯片');
        for (const clock of [0, 100, 1e8]) {
            g.qClock = clock;
            g.quantumCompute();
            g.qChips.forEach((chip, index) => {
                assert.equal(chip.value, index < count ? 1 : 0);
                assert.equal(g.qChipsElements[index].style.opacity, index < count ? 1 : 0);
            });
        }
        g.qComp();
        assert.equal(g.standardOps, 123 + count * 720);
    });
}

test('purchasing a chip immediately turns it black and preserves its cost and purchase count', () => {
    const g = game();
    g.memory = 50;
    g.standardOps = 30000;
    g.project51.element = { parentNode: { removeChild() {} } };
    g.activeProjects.push(g.project51);
    g.project51.effect();
    assert.equal(g.nextQchip, 1);
    assert.equal(g.qChipCost, 15000);
    assert.equal(g.standardOps, 20000);
    assert.equal(g.qChips[0].active, 1);
    assert.equal(g.qChips[0].value, 1);
    assert.equal(g.qChipsElements[0].style.opacity, 1);
    assert(g.qChips.slice(1).every(chip => chip.active === 0 && chip.value === 0));
    g.qComp();
    assert.equal(g.standardOps, 20360);
});

for (const initial of [{ standardOps: 1000, tempOps: 0 }, { standardOps: 950, tempOps: 200 }]) {
    test(`memory and overflow rules stay intact with ${initial.standardOps} standard and ${initial.tempOps} temporary ops`, () => {
        const g = game();
        g.memory = 1;
        Object.assign(g, initial);
        g.qChips.forEach(chip => { chip.active = 1; });
        const buffer = 1000 - initial.standardOps;
        const expectedTemp = initial.tempOps + Math.ceil(3600 / (initial.tempOps / 100 + 5)) - buffer;
        g.qComp();
        assert.equal(g.standardOps, 1000);
        assert.equal(g.tempOps, expectedTemp);
        assert.equal(g.opFade, 0.01);
        assert.equal(g.opFadeTimer, 0);
    });
}

test('pre-update native save normalizes old phases without losing any other progress or prestige', () => {
    const before = JSON.parse(legacy.storage.saveGame);
    assert(before.qChips.some(chip => chip.value < 0));
    assert(before.qChips.some(chip => chip.value > 0 && chip.value < 1));
    const storage = new MemoryStorage(legacy.storage);
    const storedBefore = storage.entries();
    const g = game(storage);
    assert.deepEqual(storage.entries(), storedBefore);
    assert.equal(g.prestigeU, 2);
    assert.equal(g.prestigeS, 1);
    assert.equal(g.nextQchip, 3);
    assert.equal(g.qChipCost, before.qChipCost);
    g.qChips.forEach((chip, index) => {
        assert.equal(chip.value, index < 3 ? 1 : 0);
        assert.equal(g.qChipsElements[index].style.opacity, index < 3 ? 1 : 0);
    });
    const after = copy(g.getSaveSnapshot().saveGame);
    const expected = copy(before);
    expected.qChips.forEach(chip => { chip.value = chip.active === 1 ? 1 : 0; });
    // The original refresh() uses x as a temporary loop counter.
    delete after.x;
    delete expected.x;
    assert.deepEqual(after, expected);
    const exported = copy(g.PaperclipSaves.capture());
    assert.equal(exported.version, 1);
    assert.deepEqual(Object.keys(exported.storage), Object.keys(legacy.storage));
    for (const key of Object.keys(legacy.storage).filter(key => key !== 'saveGame')) {
        assert.equal(exported.storage[key], legacy.storage[key]);
    }
    assert.doesNotThrow(() => g.PaperclipSaves.parse(JSON.stringify(exported)));
    const reloaded = game(new MemoryStorage(exported.storage));
    assert.deepEqual(copy(reloaded.qChips), copy(g.qChips));
});

test('pre-update version 1 file imports unchanged and its first calculation has full yield', () => {
    const receiver = game();
    const incoming = receiver.PaperclipSaves.parse(JSON.stringify(legacy));
    receiver.PaperclipSaves.restore(incoming, receiver.localStorage);
    assert.deepEqual(receiver.localStorage.entries(), legacy.storage);
    const loaded = game(receiver.localStorage);
    const before = loaded.standardOps;
    loaded.qComp();
    assert.equal(loaded.standardOps - before, 1080);
    assert.equal(loaded.prestigeU, 2);
    assert.equal(loaded.prestigeS, 1);
});
