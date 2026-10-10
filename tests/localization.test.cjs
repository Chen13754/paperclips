const test = require('node:test');
const assert = require('node:assert/strict');
const { game, MemoryStorage } = require('./game.cjs');
const legacy = require('./fixtures/legacy-save-v1.json');

test('all project descriptions and displayed titles are Chinese, with explicit technical exceptions', () => {
    const g = game();
    assert.equal(g.projects.length, 96);
    for (const project of g.projects) {
        assert.match(project.description, /[\u3400-\u9fff]/u, project.id);
        for (const text of [g.localizeBattleName(project.title), project.description, project.priceTag]) {
            if (text === 'null') continue; // Native placeholder for the calculated final memory cost.
            const remainder = text.replace(/\b(?:Yomi|A100|B100|A|B|OODA|Xavier|Tóth|MW-seconds|oct|sextillion|nonillion)\b/g, '');
            assert.doesNotMatch(remainder, /[A-Za-z]/, project.id + ': ' + text);
        }
    }
});

test('historic battle labels translate for display while old v1 data round-trips unchanged', () => {
    const storage = new MemoryStorage(legacy.storage);
    const old = JSON.parse(storage.getItem('saveGame'));
    old.threnodyTitle = 'Drifter Attack 42';
    storage.setItem('saveGame', JSON.stringify(old));
    const before = storage.entries();
    const g = game(storage);
    assert.deepEqual(storage.entries(), before);
    assert.equal(g.localizeBattleName(g.threnodyTitle), '漂流者袭击 42');
    assert.equal(g.localizeBattleName('英雄挽歌 Durenstein 12 '), '英雄挽歌 迪恩施泰因 12 ');
    assert.equal(g.localizeBattleName('The Nile 3'), '尼罗河 3');
    assert.equal(g.localizeBattleName('滑铁卢 7'), '滑铁卢 7');
    assert.equal(g.localizeBattleName('Unknown Place 3'), 'Unknown Place 3');
    const exported = g.PaperclipSaves.capture();
    assert.equal(exported.version, 1);
    assert.equal(JSON.parse(exported.storage.saveGame).threnodyTitle, old.threnodyTitle);
});

test('newly unlocked and reloaded strategy choices agree without changing stored indices or names', () => {
    const g = game();
    const names = ['RANDOM', 'A100', 'B100', 'GREEDY', 'GENEROUS', 'MINIMAX', 'TIT FOR TAT', 'BEAT LAST'];
    const choices = [];
    g.document.createElement = () => ({ style: {}, textContent: '', value: '' });
    g.document.getElementById('stratPicker').appendChild = node => choices.push([node.value, node.textContent]);
    g.standardOps = 1e6;
    for (const id of [60, 61, 62, 63, 64, 65, 66]) {
        const project = g['project' + id];
        project.element = { parentNode: { removeChild() {} } };
        g.activeProjects.push(project);
        project.effect();
    }
    const expected = [[1, 'A100'], [2, 'B100'], [3, '贪婪'], [4, '慷慨'], [5, '最小最大'], [6, '针锋相对'], [7, '击败上轮']];
    assert.deepEqual(choices, expected);
    assert.deepEqual(Array.from(g.allStrats, strat => strat.name), names);
    const exported = g.PaperclipSaves.capture();
    assert.deepEqual(JSON.parse(exported.storage.saveStratsActive), Array(8).fill(1));
    const storage = new MemoryStorage();
    const loaded = game(storage);
    const reloaded = [];
    loaded.document.createElement = () => ({ style: {}, setAttribute() {}, appendChild() {} });
    loaded.stratPickerElement.appendChild = node => reloaded.push([node.value, node.textContent]);
    for (const [key, value] of Object.entries(exported.storage)) if (value !== null) storage.setItem(key, value);
    loaded.load();
    assert.deepEqual(reloaded, expected);
    assert.deepEqual(Array.from(loaded.allStrats, strat => strat.name), names);
});
