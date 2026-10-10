const test = require('node:test');
const assert = require('node:assert/strict');
const { game, MemoryStorage } = require('./game.cjs');
function paced() {
    let time = 0, id = 0;
    const tasks = new Map();
    const schedule = (fn, delay) => { tasks.set(++id, { fn, due: time + delay }); return id; };
    const g = game(new MemoryStorage(), {
        performance: { now: () => time },
        setTimeout: schedule, clearTimeout: key => tasks.delete(key),
        requestAnimationFrame: fn => schedule(fn, 16), cancelAnimationFrame: key => tasks.delete(key),
    });
    function advance(ms) {
        const end = time + ms;
        for (;;) {
            const next = [...tasks].sort((a,b) => a[1].due - b[1].due)[0];
            if (!next || next[1].due > end) break;
            time = next[1].due; tasks.delete(next[0]); next[1].fn();
        }
        time = end;
    }
    const writes = [];
    let text = '';
    const child = { nodeType: 3, get data() { return text; }, set data(value) { writes.push({ time, value }); text = value; } };
    Object.defineProperty(g.clipsElement, 'textContent', { get: () => text, set: value => { writes.push({ time, value }); text = value; } });
    g.clipsElement.firstChild = child; g.clipsElement.childNodes = [child];
    g.clipCounterDisplay.reset();
    writes.length = 0;
    return { g, advance, writes, tasks, child };
}
test('unchanged cumulative count does not rewrite its text node or schedule a repaint', () => {
    const { g, advance, writes, tasks, child } = paced();
    for (let i = 0; i < 400; i++) g.clipCounterDisplay.request();
    advance(1000);
    assert.equal(writes.length, 0);
    assert.equal(tasks.size, 0);
    assert.equal(g.clipsElement.firstChild, child);
});
test('continuous production is coalesced, retains the latest value, and leaves native data real-time', () => {
    const { g, advance, writes } = paced();
    g.wire = 10000;
    for (let i = 0; i < 100; i++) { advance(10); g.clipClick(1); }
    assert.equal(g.clips, 100);
    assert(writes.length > 0 && writes.length <= 10);
    for (let i = 1; i < writes.length; i++) assert(writes[i].time - writes[i-1].time >= 100);
    const snapshot = JSON.stringify(g.getSaveSnapshot());
    advance(150);
    assert.equal(g.clipsElement.textContent, '100');
    assert.equal(JSON.stringify(g.getSaveSnapshot()), snapshot, 'display scheduling does not change native fields');
});
test('forced refresh cancels pending stale text and export captures progress before a visual refresh', () => {
    const { g, advance } = paced();
    g.clips = 5; g.clipCounterDisplay.request();
    g.clips = 9; g.clipCounterDisplay.reset();
    assert.equal(g.clipsElement.textContent, '9');
    advance(150);
    assert.equal(g.clipsElement.textContent, '9');
    g.clips = 42; g.clipCounterDisplay.request();
    assert.equal(g.clipsElement.textContent, '9');
    const envelope = g.PaperclipSaves.capture();
    assert.equal(JSON.parse(envelope.storage.saveGame).clips, 42);
    assert.equal(envelope.version, 1);
    assert(!Object.keys(JSON.parse(envelope.storage.saveGame)).some(key => /counterDisplay|lastTime|resetHeight/.test(key)));
    advance(150);
    assert.equal(g.clipsElement.textContent, '42');
});
test('large cumulative integers expand fully without scientific-prefix artifacts', () => {
    const { g } = paced();
    for (const exponent of [21,27,54,55]) {
        g.clips = 10 ** exponent; g.clipCounterDisplay.reset();
        assert.equal(g.clipsElement.textContent, ('1' + '0'.repeat(exponent)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    }
    g.clips = 12.1; g.clipCounterDisplay.reset();
    assert.equal(g.clipsElement.textContent, '13');
});
test('ending and final-clips changes appear immediately and cannot be overwritten by an earlier frame', () => {
    const { g, advance } = paced();
    g.clips = 1e15; g.clipCounterDisplay.request();
    g.milestoneFlag = 15; g.clipCounterDisplay.request();
    assert.equal(g.clipsElement.textContent, '29,999,999,999,999,900,000,000,000,000,000,000,000,000,000,000,000,000,000');
    for (const step of [1,2,3,4,5,6,7]) {
        g.dismantle = step; g.clipCounterDisplay.request();
        const text = g.clipsElement.textContent;
        advance(150); assert.equal(g.clipsElement.textContent, text);
        assert.equal(g.clipCountCrunchedElement.textContent, '29.9 septendecillion');
    }
    for (const n of [1,9,10,99,100]) {
        g.finalClips = n; g.clipCounterDisplay.request();
        const text = g.clipsElement.textContent;
        assert(text.endsWith(n === 100 ? '000' : String(n)));
        advance(150); assert.equal(g.clipsElement.textContent, text);
    }
    assert.equal(g.clipsElement.textContent, '30,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000');
    assert.equal(g.clipCountCrunchedElement.textContent, '30.0 septendecillion');
});
