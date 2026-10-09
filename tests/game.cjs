const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MemoryStorage {
    constructor(entries = {}) { this.data = new Map(Object.entries(entries)); }
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) {
        if (this.failKey === key) { this.failKey = null; throw new Error('QuotaExceededError'); }
        this.data.set(key, String(value));
    }
    removeItem(key) { this.data.delete(key); }
    entries() { return Object.fromEntries(this.data); }
}

function game(storage = new MemoryStorage()) {
    const elements = new Map();
    function element(id) {
        if (id === 'exportSave') return null;
        if (!elements.has(id)) elements.set(id, {
            style: {}, value: '10', innerHTML: '', options: [],
            appendChild() {}, removeChild() {}, addEventListener() {}, setAttribute() {}, insertBefore() {},
            getContext() { return {}; },
        });
        return elements.get(id);
    }
    const context = vm.createContext({
        console, localStorage: storage, setInterval() {}, clearInterval() {}, setTimeout() {},
        document: { getElementById: element, createElement: element, createTextNode: text => ({ textContent: text }) },
        cnItem: value => String(value), location: { reload() {} }, alert() {},
        Audio: function () { this.addEventListener = function () {}; },
    });
    context.window = context;
    for (const file of ['combat-v3.js', 'globals-v3.js', 'projects-v3.js', 'main-v3.js', 'save-files.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    return context;
}

module.exports = { game, MemoryStorage };
