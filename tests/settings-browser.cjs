// Isolated synthetic progress only. No request interception: external ad requests must fail this check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { game } = require('./game.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'settings');
const temp = path.join(root, '.cache', 'settings-browser');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(temp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
const { chromium } = require('playwright-core');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(file)]); res.end(fs.readFileSync(file));
});
function fixture(phase, ending = false) {
    const g = game();
    Object.assign(g, {
        humanFlag: phase === 1 ? 1 : 0, spaceFlag: phase === 3 ? 1 : 0,
        compFlag: 1, projectsFlag: 1, creativityOn: true, strategyEngineFlag: 1,
        factoryFlag: 1, wireProductionFlag: 1, harvesterFlag: 1, wireDroneFlag: 1, tothFlag: 1,
        unusedClips: 1e12, clips: 1e15, memory: 50, processors: 5,
        operations: 16000, standardOps: 16000, tempOps: 25, creativity: 240,
        factoryLevel: 15, harvesterLevel: 30, wireDroneLevel: 40,
        farmLevel: 1000, batteryLevel: 2, storedPower: 123, swarmFlag: 1,
        yomi: 100000, qFlag: 1, nextQchip: 3, ticks: 366199, prestigeU: 2, prestigeS: 1,
    });
    for (const id of ['project1','project127','project128','project50','project51','project126']) {
        g[id].flag = 1; g[id].uses = 0;
    }
    g.qChips.forEach((chip, index) => { chip.active = index < 3 ? 1 : 0; });
    g.allStrats[1].active = 1;
    if (phase === 3) {
        g.battleFlag = 1; g.project121.flag = 1; g.project131.flag = 1;
        g.probeTrust = 20; g.probeSpeed = g.probeNav = g.probeRep = g.probeHaz = 2;
    }
    if (ending) {
        g.milestoneFlag = 15; g.project146.flag = 1;
        g.operations = g.standardOps = 500000; g.creativity = 400000;
    }
    g.localStorage.setItem('savePrestige', JSON.stringify({ prestigeU: 2, prestigeS: 1 }));
    return JSON.parse(JSON.stringify(g.PaperclipSaves.capture()));
}
async function ready(page) {
    await page.waitForFunction(() => window.PaperclipTools);
    await page.evaluate(() => { buttonUpdate(); updateStats(); manageProjects(); buttonUpdate(); });
    await page.evaluate(() => new Promise(requestAnimationFrame));
}
const state = page => page.evaluate(() => getSaveSnapshot());
const open = async page => { await page.locator('#openSettings').click(); assert(await page.locator('#settingsDialog').isVisible()); };
const boosts = async page => { await open(page); await page.locator('#openResourceBoosts').click(); };
const pause = page => page.evaluate(() => new Promise(requestAnimationFrame));
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const entry = process.env.PAPERCLIPS_URL || 'http://127.0.0.1:' + server.address().port + '/index2.html';
    const origin = new URL(entry).origin;
    const errors = [], external = [], popups = [], results = [];
    let browser;
    try {
        browser = await chromium.launch({ headless: true,
            ...(process.env.PAPERCLIPS_BROWSER ? { executablePath: process.env.PAPERCLIPS_BROWSER } : { channel: 'msedge' }) });
        async function context(storage, width = 390, height = 844) {
            const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, acceptDownloads: true });
            ctx.on('request', request => {
                const url = new URL(request.url());
                if (/^https?:$/.test(url.protocol) && url.origin !== origin) external.push(request.url());
            });
            await ctx.addInitScript(data => {
                if (!/^https?:$/.test(location.protocol)) return;
                window.__callbacks = [];
                window.setInterval = (callback, delay) => { window.__callbacks.push({ callback, delay }); return window.__callbacks.length; };
                if (!sessionStorage.getItem('seeded')) {
                    for (const [key, value] of Object.entries(data || {})) if (value !== null) localStorage.setItem(key, value);
                    sessionStorage.setItem('seeded', '1');
                }
            }, storage);
            ctx.on('page', page => {
                page.on('pageerror', error => errors.push(error.message));
                page.on('popup', popup => popups.push(popup.url()));
            });
            return ctx;
        }
        const initialContext = await context();
        const initial = await initialContext.newPage();
        await initial.goto(new URL('index.html', entry).href); await ready(initial);
        assert.equal(new URL(initial.url()).pathname, new URL(entry).pathname);
        await boosts(initial);
        assert.deepEqual(await initial.locator('.boost-row').evaluateAll(rows => rows.map(row => row.dataset.resource)), ['funds','wire']);
        await initial.locator('#closeSettings').click(); await initialContext.close();
        results.push('index redirect and fresh stage have no automatic external requests or popups');

        for (const phase of [1, 2, 3]) {
            const ctx = await context(fixture(phase).storage);
            const page = await ctx.newPage(); await page.goto(entry); await ready(page);
            const before = await state(page);
            await open(page);
            assert.match(await page.locator('#gameSummary').textContent(), /01:01:01/);
            assert.match(await page.locator('#gameSummary').textContent(), /需求加成 \+20%/);
            assert.match(await page.locator('#gameSummary').textContent(), /创造力速度加成 \+10%/);
            assert.deepEqual(await state(page), before, 'opening settings does not advance any game system');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#openSettings').evaluate(node => node === document.activeElement), true);
            await boosts(page);
            for (const resource of await page.evaluate(() => PaperclipTools.resources())) {
                const row = page.locator('[data-resource="' + resource.key + '"]');
                const current = await page.evaluate(key => window[key], resource.key);
                await row.locator('button').first().click();
                const expected = resource.fill ? resource.capacity : current + resource.amounts[0];
                assert.equal(await page.evaluate(key => window[key], resource.key), expected);
                if (resource.fill) assert(await row.locator('button').isDisabled());
            }
            assert.equal(await page.evaluate(() => clips), before.saveGame.clips, 'boosts do not increase lifetime output');
            assert.equal(await page.evaluate(() => tempOps), before.saveGame.tempOps, 'fill retains temporary ops');
            const expected = await state(page);
            await page.locator('#closeSettings').click();
            const pending = page.waitForEvent('download');
            await page.locator('#exportSave').click();
            const download = await pending, filename = path.join(output, 'phase-' + phase + '.json');
            await download.saveAs(filename);
            const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
            assert.equal(saved.version, 1);
            const incomingContext = await context({}, 768, 1024);
            const incoming = await incomingContext.newPage(); await incoming.goto(entry); await ready(incoming);
            incoming.once('dialog', dialog => dialog.accept());
            const reload = incoming.waitForEvent('load');
            await incoming.locator('#saveFile').setInputFiles(filename); await reload; await ready(incoming);
            const actual = await state(incoming);
            for (const resource of await page.evaluate(() => PaperclipTools.resources()))
                assert.equal(actual.saveGame[resource.key], expected.saveGame[resource.key], resource.key + ' restored');
            assert.equal(await incoming.evaluate(() => prestigeU), 2);
            await incomingContext.close();
            if (phase === 2) {
                await boosts(page);
                await page.locator('#settingsDialog').evaluate(node => { node.scrollTop = node.scrollHeight; });
                assert(await page.locator('#closeSettings').isVisible());
                const closeBox = await page.locator('#closeSettings').boundingBox();
                assert(closeBox.y >= 0 && closeBox.y + closeBox.height < 844, 'long resource view keeps close reachable');
                await page.locator('#settingsDialog').evaluate(node => { node.scrollTop = 0; });
                await page.screenshot({ path: path.join(output, 'earth-boosts-390.png') });
                // Revalidation with an existing button, before the next UI refresh.
                await page.evaluate(() => { humanFlag = 1; });
                await page.locator('[data-resource="unusedClips"] button').first().click();
                assert.match(await page.locator('#boostStatus').textContent(), /尚未解锁/);
                await page.evaluate(() => { humanFlag = 0; dismantle = 1; });
                await page.locator('[data-resource="funds"] button').first().click();
                assert.match(await page.locator('#boostStatus').textContent(), /结局拆卸/);
                assert.equal(await page.locator('#boostList button:enabled').count(), 0);
            }
            await ctx.close();
            results.push('phase ' + phase + ': only relevant unlocked boosts, latest export, fresh-device import, overflow retention and prestige');
        }

        const ctx = await context(fixture(2).storage);
        const page = await ctx.newPage(); await page.goto(entry); await ready(page);
        const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
        for (const width of [320,390,430,699,700,768,1024,1440]) {
            await page.setViewportSize({ width, height: width === 1024 ? 768 : 1024 }); await pause(page);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            assert.equal(await page.locator('#openSettings').count(), 1);
            await open(page);
            const box = await page.locator('#settingsDialog').boundingBox();
            assert(box.x >= 0 && box.x + box.width <= width + 1);
            assert(box.y >= 0 && box.y + box.height <= (width === 1024 ? 768 : 1024) + 1);
            assert.deepEqual(await page.locator('#settingsDialog button:visible').evaluateAll(nodes =>
                nodes.filter(node => node.getBoundingClientRect().height < 43.5).map(node => node.id)), []);
            await page.keyboard.press('Tab');
            assert.equal(await page.locator('#settingsDialog').evaluate(node => node.contains(document.activeElement)), true);
            await page.mouse.click(1,1); assert.equal(await page.locator('#settingsDialog').isVisible(), false);
            assert.equal(await page.locator('#openSettings').evaluate(node => node === document.activeElement), true);
            const help = page.locator(width < 700 ? '#mobileMetrics .number-help' : '#maxOps + .number-help').first();
            await help.click();
            assert(await page.locator('#numberHint').evaluate(node => node.matches(':popover-open')));
            const hint = await page.locator('#numberHint').boundingBox();
            assert(hint.x >= 0 && hint.x + hint.width <= width + 1);
            assert(hint.y >= 0 && hint.y + hint.height <= (width === 1024 ? 768 : 1024) + 1);
            await help.click(); assert.equal(await page.locator('#numberHint').isVisible(), false);
            await help.focus(); await page.keyboard.press('Enter');
            await page.keyboard.press('Escape'); assert.equal(await page.locator('#numberHint').isVisible(), false);
            assert.equal(await help.getAttribute('aria-expanded'), 'false');
            assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).touchAction), 'manipulation');
        }
        await page.setViewportSize({ width: 390, height: 844 }); await pause(page);
        await page.locator('#mobileStock').locator('..').locator('.number-help').click();
        assert.match(await page.locator('#numberHintText').textContent(), /累计产量/);
        await page.mouse.click(1,1); assert.equal(await page.locator('#numberHint').isVisible(), false);
        await open(page); await page.screenshot({ path: path.join(output, 'settings-390.png') });
        await page.locator('#showNumberHints').uncheck(); await page.locator('#closeSettings').click();
        assert.equal(await page.locator('.number-help:visible').count(), 0);
        await page.setViewportSize({ width: 768, height: 1024 }); await pause(page);
        assert.equal(await page.locator('.number-help:visible').count(), 0, 'resize retains session toggle');
        await page.reload(); await ready(page);
        assert(await page.locator('.number-help:visible').count() > 0, 'refresh defaults hints to on');
        assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), keysBefore, 'UI preferences create no save keys');
        await page.setViewportSize({ width: 390, height: 844 }); await pause(page);
        const beforeTaps = await page.evaluate(() => standardOps);
        await page.locator('#btnQcompute').tap(); await page.locator('#btnQcompute').tap();
        assert.equal(await page.evaluate(() => standardOps), beforeTaps + 2160, 'two taps produce two native quantum actions');
        const slider = await page.locator('#slider').boundingBox();
        await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2);
        await page.mouse.down();
        await page.mouse.move(slider.x + slider.width - 2, slider.y + slider.height / 2, { steps: 8 });
        await page.mouse.up();
        await page.evaluate(() => window.__callbacks.find(item => item.delay === 10).callback());
        assert(Number(await page.locator('#slider').inputValue()) >= 95, 'range still responds to a real drag');
        await page.locator('#mobileMetrics .number-help').first().click();
        await page.screenshot({ path: path.join(output, 'hint-390.png') });
        await ctx.close();
        results.push('320–1440: dialog, focus, hint toggle/outside/Esc, session-only setting, responsive layout, touch-action, two-tap actions and slider');

        for (const id of [200,201]) {
            const ctx = await context(fixture(3, true).storage, 390);
            const page = await ctx.newPage(); await page.goto(entry); await ready(page);
            await page.locator('#mobile-tab-projects').click();
            await page.locator('#projectButton147').click();
            await page.evaluate(() => { manageProjects(); buttonUpdate(); });
            const reload = page.waitForEvent('load');
            await page.locator('#projectButton' + id).click(); await reload; await ready(page);
            assert.deepEqual(await page.evaluate(() => [humanFlag,spaceFlag,clips,ticks]), [1,0,0,0]);
            assert.deepEqual(await page.evaluate(() => [prestigeU,prestigeS]), id === 200 ? [3,1] : [2,2]);
            assert.equal(await page.evaluate(() => localStorage.getItem('saveGame')), null);
            assert.equal(await page.locator('#cover').evaluate(node => node.style.display), 'none');
            await open(page);
            assert.match(await page.locator('#gameSummary').textContent(), /00:00:00/);
            await ctx.close();
        }
        const runningContext = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
        runningContext.on('request', request => {
            const url = new URL(request.url());
            if (/^https?:$/.test(url.protocol) && url.origin !== origin) external.push(request.url());
        });
        const running = await runningContext.newPage();
        running.on('pageerror', error => errors.push(error.message));
        await running.goto(entry); await ready(running); await boosts(running);
        const start = await running.evaluate(() => ticks);
        await running.waitForFunction(value => ticks > value + 20, start);
        await running.locator('[data-resource="funds"] button').first().click();
        await running.evaluate(() => { saveTimer = 249; });
        await running.waitForFunction(() => {
            const saved = localStorage.getItem('saveGame');
            return saved && JSON.parse(saved).funds >= 10000;
        });
        await running.locator('#closeSettings').click();
        await running.reload(); await ready(running);
        assert(await running.evaluate(() => funds >= 10000));
        await runningContext.close();
        results.push('game continues with settings open and native autosave retains a boost after reload');
        results.push('both actual ending restart choices return to stage 1 with the corresponding prestige bonus');
        assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(popups, []);
        const report = { url: entry, results, pageErrors: errors, externalAutomaticRequests: external, popups,
            androidPhysicalDevice: false, iPadPhysicalDevice: false, touchSimulationBrowser: 'Chromium / Edge' };
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
