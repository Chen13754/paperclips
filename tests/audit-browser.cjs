const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { game } = require('./game.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'audit');
const temp = path.join(root, '.cache', 'audit-browser');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(temp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
const { chromium } = require('playwright-core');
const server = http.createServer((req, res) => {
    const file = path.join(root, new URL(req.url, 'http://localhost').pathname.slice(1));
    if (path.dirname(file) !== root || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'text/plain');
    res.end(fs.readFileSync(file));
});
const keys = ['saveGame', 'saveProjectsUses', 'saveProjectsFlags', 'saveProjectsActive', 'saveStratsActive', 'savePrestige'];
const good = JSON.parse(JSON.stringify(game().PaperclipSaves.capture()));

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const entry = process.env.PAPERCLIPS_URL || `http://127.0.0.1:${server.address().port}/index2.html`;
    const errors = [], external = [], results = [];
    let browser;
    try {
        browser = await chromium.launch(process.env.PAPERCLIPS_BROWSER ?
            { executablePath: process.env.PAPERCLIPS_BROWSER, headless: true } : { channel: 'msedge', headless: true });
        async function create(seed = {}, width = 1440, denyRead = false, cachedOrder = false) {
            const ctx = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
            await ctx.route('**/*', route => {
                if (new URL(route.request().url()).origin !== new URL(entry).origin) {
                    external.push(route.request().url()); return route.abort();
                }
                if (cachedOrder && route.request().isNavigationRequest()) {
                    let html = fs.readFileSync(path.join(root, 'index2.html'), 'utf8');
                    const helper = html.match(/<script src="save-files\.js[^\"]*"><\/script>/)[0];
                    html = html.replace(helper, '').replace(/(<script[^>]*src="main-v3\.js[^\"]*"[^>]*><\/script>)/, '$1\n' + helper)
                        .replace(/<section id="storageRecovery"[\s\S]*?<\/section>/, '');
                    return route.fulfill({ contentType: 'text/html', body: html });
                }
                return route.continue();
            });
            await ctx.addInitScript(({ seed, denyRead }) => {
                if (!sessionStorage.auditSeeded) {
                    for (const [key, value] of Object.entries(seed)) if (value !== null) localStorage.setItem(key, value);
                    sessionStorage.auditSeeded = '1';
                }
                if (denyRead) {
                    const native = Storage.prototype.getItem;
                    Storage.prototype.getItem = function (key) {
                        if (this === localStorage) throw new Error('SecurityError');
                        return native.call(this, key);
                    };
                }
                window.__auditTimers = [];
                window.setInterval = (fn, delay) => { __auditTimers.push({ fn, delay }); return __auditTimers.length; };
                window.clearInterval = () => {};
            }, { seed, denyRead });
            const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
            await page.goto(entry);
            await ready(page);
            return { ctx, page };
        }
        async function ready(page) {
            await page.waitForFunction(() => window.PaperclipSaves && window.PaperclipTools);
            await page.evaluate(() => { if (!PaperclipSaves.paused()) __auditTimers.find(x => x.delay === 10).fn(); });
        }
        async function imported(page, data) {
            page.once('dialog', dialog => dialog.accept());
            await Promise.all([page.waitForEvent('load'), page.locator('#saveFile').setInputFiles({
                name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
            })]);
            await ready(page);
        }
        const stored = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);

        for (const width of [320, 768, 1440]) {
            const broken = { ...good.storage, saveGame: '{', unrelated: 'keep' };
            const { ctx, page } = await create(broken, width);
            assert(await page.locator('#storageRecovery').isVisible());
            assert.equal(await page.locator('#cover').evaluate(node => getComputedStyle(node).display), 'none');
            assert.equal(await page.locator('#gameGrid').evaluate(node => getComputedStyle(node).display), 'none');
            const before = await stored(page);
            await page.evaluate(() => { for (let i = 0; i < 300; i++) for (const timer of __auditTimers) timer.fn(); });
            assert.deepEqual(await stored(page), before);
            assert.equal(await page.evaluate(() => ticks), 0);
            const bounds = await page.locator('#storageRecovery button').evaluateAll(nodes => nodes.map(node => {
                const r = node.getBoundingClientRect(); return { height: r.height, left: r.left, right: r.right };
            }));
            assert(bounds.every(r => r.height >= 44 && r.left >= 0 && r.right <= width));
            const pending = page.waitForEvent('download'); await page.locator('#recoveryBackup').click();
            const download = await pending;
            assert.match(download.suggestedFilename(), /^paperclips-recovery-/);
            const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
            assert.equal(backup.format, 'paperclips-recovery'); assert.deepEqual(backup.storage, before);
            assert.equal(await page.evaluate(data => { try { PaperclipSaves.parse(JSON.stringify(data)); return true; } catch (_) { return false; } }, backup), false);
            await page.locator('#recoveryRestart').click();
            assert(await page.locator('#restartConfirmation').isVisible());
            await page.locator('#cancelRestart').click(); assert.deepEqual(await stored(page), before);
            await page.locator('#closeSettings').click();
            await page.screenshot({ path: path.join(output, `recovery-${width}.png`), fullPage: true });
            if (width === 320) {
                await page.locator('#recoveryRestart').click();
                await Promise.all([page.waitForEvent('load'), page.locator('#confirmRestart').click()]);
                await ready(page); assert.equal(await page.evaluate(() => PaperclipSaves.paused()), false);
                assert.equal(await page.evaluate(() => localStorage.getItem('unrelated')), 'keep');
            } else {
                await imported(page, good); assert.equal(await page.evaluate(() => PaperclipSaves.paused()), false);
            }
            await ctx.close();
        }
        results.push('320/768/1440 recovery: no game/storage mutation, raw download, cancel, valid import, confirmed restart and touch bounds');

        const denied = await create(good.storage, 768, true);
        assert(await denied.page.locator('#storageRecovery').isVisible());
        await denied.page.locator('#recoveryRestart').click(); await denied.page.locator('#confirmRestart').click();
        assert.match(await denied.page.locator('#restartStatus').textContent(), /无法重开/);
        assert.equal(await denied.page.evaluate(() => PaperclipSaves.paused()), true); await denied.ctx.close();
        results.push('read permission denial shows recovery and never deletes data');

        const cached = await create(good.storage, 1440, false, true);
        assert.equal(await cached.page.evaluate(() => PaperclipSaves.paused()), false);
        assert.equal(await cached.page.evaluate(() => paperclipBootDeferred), false);
        await cached.page.evaluate(() => { save(); });
        assert.equal(await cached.page.locator('#cover').evaluate(node => getComputedStyle(node).display), 'none');
        await cached.ctx.close();
        results.push('old cached HTML/script order and missing recovery markup still boot exactly once');

        const { ctx, page } = await create();
        const race = await page.evaluate(() => {
            trust = 3; processors = memory = 1; buttonUpdate();
            document.getElementById('btnAddProc').click(); document.getElementById('btnAddMem').click();
            const allocated = processors + memory;
            humanFlag = 0; spaceFlag = 1; probeTrust = 1; probeNav = probeUsedTrust = 0; buttonUpdate();
            document.getElementById('btnRaiseProbeNav').click(); document.getElementById('btnRaiseProbeNav').click();
            humanFlag = 1; spaceFlag = 0; operations = standardOps = 2000; tempOps = 0; memory = 10;
            clipmakerLevel = wirePurchase = 1; manageProjects();
            document.getElementById('projectButton1').click(); document.getElementById('projectButton7').click();
            return { allocated, probeNav, standardOps, flags: [project1.flag, project7.flag] };
        });
        assert.deepEqual(race, { allocated: 3, probeNav: 1, standardOps: 1250, flags: [1, 0] });
        results.push('actual same-turn allocation/research buttons enforce current resources');

        const data = await page.evaluate(() => {
            humanFlag = 0; spaceFlag = 0; swarmFlag = 1; farmLevel = 100; harvesterLevel = wireDroneLevel = 100;
            sliderElement.value = '160'; updateSwarm(); riskiness = 1; pick = '1'; allStrats[1].active = 1;
            wireBuyerStatus = autoTourneyStatus = 0;
            return PaperclipSaves.capture();
        });
        const fresh = await create(); await imported(fresh.page, data);
        const controls = await fresh.page.evaluate(() => {
            for (const timer of __auditTimers) if (timer.delay === 100) timer.fn(); updateSwarm();
            return [riskiness, String(pick), String(sliderPos), wireBuyerStatusElement.textContent, autoTourneyStatusElement.textContent];
        });
        assert.deepEqual(controls, [1, '1', '160', '关闭', '关闭']); await fresh.ctx.close();
        results.push('real swarm-generated v1 file imports into fresh browser; saved controls survive timer reads');

        await page.evaluate(() => { window.__nativeWrite = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }; funds = 987654; });
        const downloadPromise = page.waitForEvent('download'); await page.locator('#exportSave').click();
        const file = await downloadPromise;
        assert.equal(JSON.parse(JSON.parse(fs.readFileSync(await file.path(), 'utf8')).storage.saveGame).funds, 987654);
        assert.match(await page.locator('#saveStatus').textContent(), /导出备份/);
        await page.evaluate(() => { Storage.prototype.setItem = __nativeWrite; }); await ctx.close();
        results.push('real download captures latest memory while all browser writes fail');

        const symbol = '<img src="https://invalid.example/audit" onerror="window.__auditInjected=true">';
        const textData = JSON.parse(JSON.stringify(good));
        const progress = JSON.parse(textData.storage.saveGame);
        progress.portfolioSize = 1; progress.stocks = [{ id: 1, symbol, price: 1, amount: 1, total: 1, profit: 0, age: 0 }];
        textData.storage.saveGame = JSON.stringify(progress);
        const text = await create(textData.storage);
        await text.page.evaluate(() => __auditTimers.find(x => String(x.fn).includes('stockSymbolElements[i-1].textContent')).fn());
        assert.equal(await text.page.evaluate(() => window.__auditInjected), undefined);
        assert.equal(await text.page.evaluate(() => stockSymbolElements[0].textContent), symbol);
        assert.equal(await text.page.evaluate(() => stockSymbolElements[0].children.length), 0);
        await text.ctx.close(); results.push('imported HTML-like stock symbol stays plain text without code or external request');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        const report = { results, pageErrors: errors, externalRequests: external, androidPhysicalDevice: false, iPadPhysicalDevice: false };
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
