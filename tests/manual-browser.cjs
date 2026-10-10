// Synthetic saves and isolated browser profiles only; never inspect personal browser storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { game } = require('./game.cjs');
const legacy = require('./fixtures/legacy-save-v1.json');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'manual'), temp = path.join(root, '.cache', 'manual-browser');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(temp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
const { chromium } = require('playwright-core');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
    const file = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(file)]); res.end(fs.readFileSync(file));
});
function fixture(phase) {
    const g = game();
    Object.assign(g, { humanFlag: phase === 1 ? 1 : 0, spaceFlag: phase === 3 ? 1 : 0,
        compFlag: 1, projectsFlag: 1, creativityOn: 1, strategyEngineFlag: 1,
        investmentEngineFlag: phase === 1 ? 1 : 0, qFlag: 1, nextQchip: 3,
        clipmakerLevel: 80, clips: 1e15, unusedClips: 1e12, wire: 10000, funds: 10000,
        processors: 5, memory: 50, standardOps: 16000, tempOps: 0, creativity: 1000, yomi: 1e5,
        factoryFlag: phase >= 2 ? 1 : 0, harvesterFlag: phase >= 2 ? 1 : 0,
        wireDroneFlag: phase >= 2 ? 1 : 0, swarmFlag: phase >= 2 ? 1 : 0 });
    for (const id of [1, 3, 20, 21, 50, 51]) { g['project' + id].flag = 1; g['project' + id].uses = 0; }
    if (phase >= 2) for (const id of [18, 35, 43, 44, 45, 126, 127]) { g['project' + id].flag = 1; g['project' + id].uses = 0; }
    if (phase === 3) { g.battleFlag = 1; g.project131.flag = 1; }
    g.qChips.forEach((chip, i) => { chip.active = i < 3 ? 1 : 0; });
    return JSON.parse(JSON.stringify(g.PaperclipSaves.capture().storage));
}
const pause = page => page.evaluate(() => new Promise(requestAnimationFrame));
const snapshot = page => page.evaluate(() => ({ game: getSaveSnapshot(), storage: Object.fromEntries(Object.entries(localStorage)) }));
async function ready(page) {
    await page.waitForFunction(() => window.PaperclipManual && window.PaperclipTools);
    await page.evaluate(() => { buttonUpdate(); updateStats(); manageProjects(); buttonUpdate(); }); await pause(page);
}
async function open(page) { await page.locator('#openSettings').click(); await page.locator('#openManual').click(); await pause(page); }
const heading = page => page.locator('#manualHeading').textContent();
async function choose(page, id) { await page.locator('#manualBody [data-manual-target="' + id + '"]').click(); await pause(page); }
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const entry = process.env.PAPERCLIPS_URL || 'http://127.0.0.1:' + server.address().port + '/index2.html';
    const origin = new URL(entry).origin, errors = [], external = [], popups = [], results = [];
    let browser;
    try {
        browser = await chromium.launch({ headless: true, ...(process.env.PAPERCLIPS_BROWSER ? { executablePath: process.env.PAPERCLIPS_BROWSER } : { channel: 'msedge' }) });
        async function context(storage, width = 390, frozen = true) {
            const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
            await ctx.addInitScript(({ storage, frozen }) => {
                if (!/^https?:$/.test(location.protocol)) return;
                if (frozen) {
                    window.__callbacks = [];
                    window.setInterval = (callback, delay) => { window.__callbacks.push({ callback, delay }); return window.__callbacks.length; };
                }
                if (!sessionStorage.getItem('seeded')) {
                    for (const [key, value] of Object.entries(storage || {})) if (value !== null) localStorage.setItem(key, value);
                    sessionStorage.setItem('seeded', '1');
                }
            }, { storage, frozen });
            ctx.on('request', request => { const url = new URL(request.url()); if (/^https?:$/.test(url.protocol) && url.origin !== origin) external.push(request.url()); });
            ctx.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('popup', popup => popups.push(popup.url())); });
            return ctx;
        }
        const fresh = await context(), p = await fresh.newPage(); await p.goto(entry); await ready(p);
        const before = await snapshot(p); await open(p);
        assert.equal(await heading(p), '说明书目录');
        assert.equal(await p.locator('#manualFull').isChecked(), false);
        assert.equal(await p.locator('#manualBody [data-manual-target="space"]').count(), 0);
        assert.equal(await p.locator('#manualDirectory').getByText('宇宙探索').count(), 0);
        await choose(p, 'start'); await choose(p, '开始游玩'); await choose(p, 'first-steps');
        assert.equal(await heading(p), '从第一枚回形针开始');
        assert((await p.locator('#manualBreadcrumbs').textContent()).includes('快速入门'));
        assert(await p.locator('#manualBody').getByText('价格、公众需求与自动销售', { exact: false }).count());
        await p.locator('#manualBody [data-manual-target="sales"]').click();
        await p.locator('#manualBody summary').click();
        assert(await p.locator('#manualBody details').getAttribute('open') !== null);
        await p.locator('#manualBack').click(); assert.equal(await heading(p), '从第一枚回形针开始');
        await p.locator('#manualBack').click(); assert.equal(await heading(p), '开始游玩');
        await p.locator('#manualBack').click(); assert.equal(await heading(p), '快速入门');
        results.push('three-level directory, breadcrumbs, related links and expandable numeric details');

        await p.locator('#manualSearch').fill('英雄挽歌');
        assert((await p.locator('#manualBody').textContent()).includes('没有找到'));
        assert(!(await p.locator('#manualBody').textContent()).includes('宇宙与战斗'));
        await p.locator('#manualFull').check();
        assert.equal(await p.locator('#manualBody [data-manual-target="r133"]').count(), 1);
        await choose(p, 'r133'); assert.equal(await heading(p), '英雄挽歌');
        await p.locator('#manualFull').uncheck(); assert.equal(await heading(p), '说明书目录');
        await p.locator('#manualBack').click(); // Previous search is re-filtered under the now-disabled full switch.
        assert((await p.locator('#manualBody').textContent()).includes('没有找到'));
        assert.equal(await p.locator('#manualFull').isChecked(), false);
        await p.locator('#manualClear').click(); assert.equal(await p.locator('#manualSearch').inputValue(), '');
        assert(await p.locator('#manualClear').isDisabled());
        await p.locator('#manualSearch').fill('不存在的词'); assert((await p.locator('#manualBody').textContent()).includes('没有找到'));
        await p.locator('#manualFull').check(); await p.locator('#manualSearch').fill('ＴＩＴ　ＦＯＲ　ＴＡＴ');
        assert(await p.locator('#manualBody [data-manual-target="r65"]').count());
        await p.locator('#manualSearch').fill('OODA'); assert(await p.locator('#manualBody [data-manual-target="r120"]').count());
        results.push('hidden titles/categories/counts stay hidden; full switch, Chinese/English aliases, clear and empty results');

        await p.locator('#manualSearch').fill('操作点数');
        const result = p.locator('#manualBody .manual-card').last(); await result.scrollIntoViewIfNeeded();
        const scroll = await p.locator('#settingsDialog').evaluate(node => node.scrollTop);
        assert(scroll > 0); await result.click(); await p.locator('#manualBack').click(); await pause(p);
        assert.equal(await p.locator('#manualSearch').inputValue(), '操作点数');
        assert(Math.abs(await p.locator('#settingsDialog').evaluate(node => node.scrollTop) - scroll) < 3);
        await p.locator('#closeSettings').click(); await open(p); await pause(p);
        assert.equal(await p.locator('#manualSearch').inputValue(), '操作点数');
        assert(Math.abs(await p.locator('#settingsDialog').evaluate(node => node.scrollTop) - scroll) < 3);
        await p.locator('#manualToSettings').click(); assert(await p.locator('#settingsOverview').isVisible());
        await p.locator('#openManual').click(); await pause(p);
        assert.equal(await p.locator('#manualSearch').inputValue(), '操作点数');
        await p.keyboard.press('Escape'); assert(!(await p.locator('#settingsDialog').isVisible()));
        assert.equal(await p.evaluate(() => document.activeElement.id), 'openSettings');
        assert.deepEqual(await snapshot(p), before, 'all browsing with frozen game timers is read-only');
        await open(p); assert(await p.locator('#manualFull').isChecked());
        await p.reload(); await ready(p); await open(p); assert.equal(await p.locator('#manualFull').isChecked(), false);
        results.push('search, focus and scroll survive Back, settings return and reopen; Esc restores focus; full switch resets on refresh; no state/storage mutation');
        await fresh.close();

        for (const [label, storage, phase] of [['initial', {}, 0], ['business', fixture(1), 1], ['earth', fixture(2), 2], ['space', fixture(3), 3], ['legacy', legacy.storage, 1]]) {
            const ctx = await context(storage); const page = await ctx.newPage(); await page.goto(entry); await ready(page);
            const baseline = await snapshot(page); await open(page);
            const ids = await page.evaluate(() => PaperclipManual.entries().map(item => item.id));
            if (phase >= 2) assert(ids.includes('earth-chain'));
            if (phase === 3) assert(ids.includes('probes'));
            if (label === 'earth') assert(ids.includes('investments'), 'earlier system remains readable');
            assert(!ids.includes('r140'), 'future research remains hidden even in space');
            for (const width of [320, 390, 430, 699, 700, 768, 1024, 1440]) {
                await page.setViewportSize({ width, height: 844 }); await pause(page);
                await page.locator('#manualSearch').fill('存档'); await choose(page, 'save-files');
                const metrics = await page.locator('#settingsDialog').evaluate(node => {
                    const rect = node.getBoundingClientRect();
                    return { width: rect.width, left: rect.left, horizontal: node.scrollWidth > node.clientWidth + 1,
                        font: parseFloat(getComputedStyle(document.querySelector('#manualBody')).fontSize),
                        targets: [...node.querySelectorAll('button, summary, input[type="search"]')].filter(item => item.getClientRects().length)
                            .map(item => ({ id: item.id, height: item.getBoundingClientRect().height })) };
                });
                assert(metrics.width <= width - 20 && metrics.left >= 10, `${label}/${width} dialog`);
                assert(!metrics.horizontal, `${label}/${width} horizontal overflow`); assert(metrics.font >= 16);
                for (const item of metrics.targets) assert(item.height >= 44, `${label}/${width}/${item.id}: ${item.height}`);
                assert.equal(await page.locator('#manualDirectory').isVisible(), width >= 700);
                await page.locator('#settingsDialog').evaluate(node => { node.scrollTop = node.scrollHeight; }); await pause(page);
                assert(await page.locator('#closeSettings').isVisible());
                const rect = await page.locator('#closeSettings').boundingBox(); assert(rect.y >= 0 && rect.y + rect.height <= 844);
                if (label === 'space' && [320, 390, 768, 1440].includes(width)) {
                    await page.screenshot({ path: path.join(output, `article-space-${width}.png`) });
                }
                await page.locator('#manualBack').click(); await pause(page);
            }
            await page.locator('#manualFull').check(); await page.locator('#manualSearch').fill('研究');
            assert(await page.locator('#manualBody .manual-card').count() > 0);
            await page.locator('#closeSettings').click();
            assert.deepEqual(await snapshot(page), baseline, `${label} browsing changes no progress`);
            await page.evaluate(() => { const b = document.querySelector('#btnMakePaperclip'); b.disabled = false; });
            const enabled = await page.locator('#btnMakePaperclip').evaluate(b => ({ width: b.offsetWidth, height: b.offsetHeight, shadow: getComputedStyle(b).boxShadow }));
            await page.evaluate(() => { document.querySelector('#btnMakePaperclip').disabled = true; });
            const disabled = await page.locator('#btnMakePaperclip').evaluate(b => ({ width: b.offsetWidth, height: b.offsetHeight, shadow: getComputedStyle(b).boxShadow }));
            assert.equal(enabled.width, disabled.width); assert.equal(enabled.height, disabled.height);
            assert.notEqual(enabled.shadow, 'none'); assert.equal(disabled.shadow, 'none');
            await ctx.close(); results.push(`${label}: 320–1440px directory/article/scroll/close/touch targets, stable button dimensions and read-only progress`);
        }
        const live = await context(fixture(1), 1440, false), livePage = await live.newPage();
        await livePage.goto(entry); await livePage.waitForFunction(() => window.PaperclipManual); await open(livePage);
        const ticks = await livePage.evaluate(() => window.ticks);
        await livePage.waitForFunction(before => window.ticks > before + 10, ticks);
        await livePage.screenshot({ path: path.join(output, 'directory-desktop-1440.png') });
        await live.close(); results.push('game continues while manual is open');
        assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(popups, []);
        results.push('no page errors, automatic external requests or popups');
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ passed: results.length, results }, null, 2));
    } catch (error) {
        if (browser) for (const [index, page] of browser.contexts().flatMap(ctx => ctx.pages()).entries()) {
            if (page.isClosed()) continue;
            await page.screenshot({ path: path.join(output, 'failure-' + index + '.png') }).catch(() => {});
            const info = await page.evaluate(() => ({ body: document.querySelector('#manualBody')?.innerText,
                search: document.querySelector('#manualSearch')?.value, scroll: document.querySelector('#settingsDialog')?.scrollTop })).catch(() => ({}));
            fs.writeFileSync(path.join(output, 'failure-' + index + '.json'), JSON.stringify(info, null, 2));
        }
        throw error;
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
