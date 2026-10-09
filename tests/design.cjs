// Synthetic saves and isolated profiles only. The baseline is the deployed pre-redesign version.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'design');
fs.mkdirSync(output, { recursive: true });
const temp = path.join(root, '.cache', 'design-browser');
fs.mkdirSync(temp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
const { chromium } = require('playwright-core');
const baseline = '7354dd5f85f9f940447d03cec09994cbe9481d8b';
const files = new Map();
function previous(file) {
    if (!files.has(file)) files.set(file, execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root }));
    return files.get(file);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const old = pathname.startsWith('/baseline/');
    const name = pathname.split('/').pop();
    if (!types[path.extname(name)] || !fs.existsSync(path.join(root, name))) {
        res.writeHead(404); return res.end();
    }
    res.setHeader('Content-Type', types[path.extname(name)]);
    res.end(old ? previous(name) : fs.readFileSync(path.join(root, name)));
});
const keys = ['saveGame', 'saveProjectsUses', 'saveProjectsFlags', 'saveProjectsActive', 'saveStratsActive', 'savePrestige'];
const stored = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
async function ready(page) {
    await page.waitForFunction(() => window.PaperclipSaves);
    await page.evaluate(() => { buttonUpdate(); updateStats(); manageProjects(); buttonUpdate(); });
}
const state = page => page.evaluate(() => ({ native: getSaveSnapshot(), prestige: [prestigeU, prestigeS] }));

(async () => {
    let browser;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const local = `http://127.0.0.1:${server.address().port}`;
    const entry = process.env.PAPERCLIPS_URL || `${local}/index2.html`;
    const errors = [];
    const results = [];
    const screenshots = [];
    try {
        browser = await chromium.launch({ headless: true,
            ...(process.env.PAPERCLIPS_BROWSER ? { executablePath: process.env.PAPERCLIPS_BROWSER } : { channel: 'msedge' }) });
        async function context(storage = {}, width = 1440) {
            const ctx = await browser.newContext({ viewport: { width, height: 1024 }, deviceScaleFactor: 1, acceptDownloads: true });
            await ctx.route('**/*', route => {
                const origin = new URL(route.request().url()).origin;
                return [local, new URL(entry).origin].includes(origin) ? route.continue() : route.abort();
            });
            await ctx.addInitScript(data => {
                if (!/^https?:$/.test(location.protocol)) return;
                window.__callbacks = [];
                window.setInterval = (callback, delay) => { window.__callbacks.push({ callback, delay }); return 1; };
                // Apply only on the first load, so imports and refreshes use their actual saved data.
                if (!sessionStorage.getItem('seeded')) {
                    for (const [key, value] of Object.entries(data)) if (value !== null) localStorage.setItem(key, value);
                    sessionStorage.setItem('seeded', '1');
                }
            }, storage);
            ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
            return ctx;
        }
        const baseContext = await context();
        const basePage = await baseContext.newPage();
        await basePage.goto(`${local}/baseline/index2.html`);
        await ready(basePage);
        const originalIds = await basePage.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
        const handlers = await basePage.locator('[onclick]').evaluateAll(elements => elements.map(element => [element.id, element.getAttribute('onclick')]));
        const fixtures = {};
        for (const stage of ['initial', 'earth', 'space']) {
            await basePage.evaluate(() => localStorage.clear());
            // Reload a clean baseline between stages, rather than retaining any previous runtime flags.
            await basePage.reload(); await ready(basePage);
            await basePage.evaluate(stage => {
                if (stage !== 'initial') {
                    humanFlag = 0;
                    compFlag = projectsFlag = qFlag = creativityOn = 1;
                    clips = 1e15; unusedClips = 1e12; memory = 50; processors = 5;
                    operations = standardOps = 16000; creativity = 240;
                    factoryFlag = wireProductionFlag = harvesterFlag = wireDroneFlag = tothFlag = 1;
                    factoryLevel = 15; harvesterLevel = 30; wireDroneLevel = 40;
                    farmLevel = 1000; powMod = 1;
                    strategyEngineFlag = 1; yomi = 100000;
                    project1.uses = 0; project1.flag = 1;
                    project127.flag = 1; project127.uses = 0;
                    project128.flag = 1; project128.uses = 0; swarmFlag = 1;
                    project50.flag = 1; project50.uses = 0;
                    project51.flag = 1; nextQchip = 3; qChipCost = 25000;
                    qChips.forEach((chip, index) => { chip.active = index < 3 ? 1 : 0; });
                    allStrats[1].active = 1;
                    quantumCompute();
                }
                if (stage === 'space') {
                    spaceFlag = battleFlag = 1;
                    project131.flag = 1; project131.uses = 0;
                    probeCount = 1e20; probeTrust = 30;
                    probeSpeed = probeNav = probeRep = probeHaz = 2;
                    probeFac = probeHarv = probeWire = probeCombat = 1;
                    prestigeU = 2; prestigeS = 1;
                    localStorage.setItem('savePrestige', JSON.stringify({ prestigeU, prestigeS }));
                }
                buttonUpdate(); updateStats(); manageProjects(); buttonUpdate();
            }, stage);
            fixtures[stage] = await basePage.evaluate(() => PaperclipSaves.capture());
            fs.writeFileSync(path.join(output, `${stage}-baseline-v1.json`), JSON.stringify(fixtures[stage], null, 2));
        }
        // A representative human-stage state for comparing the chosen visual direction.
        const humanContext = await context(require('./fixtures/legacy-save-v1.json').storage);
        const humanBase = await humanContext.newPage();
        await humanBase.goto(`${local}/baseline/index2.html`); await ready(humanBase);
        await humanBase.evaluate(() => {
            compFlag = projectsFlag = qFlag = creativityOn = autoClipperFlag = revPerSecFlag = 1;
            clipmakerLevel = 25; clipRate = 12; standardOps = operations = 16000; creativity = 240;
            trust = 3; funds = 123.45; clips = 654321;
            prestigeU = prestigeS = 0; localStorage.removeItem('savePrestige');
            for (const id of ['projectButton6', 'projectButton11', 'projectButton12', 'projectButton13',
                'projectButton14', 'projectButton15', 'projectButton16', 'projectButton17']) {
                const project = projects.find(project => project.id === id);
                project.uses = 0; project.flag = 1;
            }
            activeProjects = []; document.getElementById('projectListTop').innerHTML = ''; project51.uses = 1;
            buttonUpdate(); updateStats(); manageProjects(); buttonUpdate();
        });
        fixtures.human = await humanBase.evaluate(() => PaperclipSaves.capture());
        await humanBase.evaluate(() => {
            investmentEngineFlag = strategyEngineFlag = 1;
            stocks.push({ id: 1, symbol: 'ABC', price: 10, amount: 2, total: 20, profit: 0, age: 0 });
            portfolioSize = 1;
            buttonUpdate(); updateStats(); manageProjects(); buttonUpdate();
        });
        fixtures.trading = await humanBase.evaluate(() => PaperclipSaves.capture());
        for (const [stage, fixture] of Object.entries(fixtures)) {
            const expectedContext = await context(fixture.storage);
            const expectedPage = await expectedContext.newPage();
            await expectedPage.goto(`${local}/baseline/index2.html`); await ready(expectedPage);
            const expected = await state(expectedPage);
            await expectedContext.close();
            for (const width of [320, 390, 768, 1440]) {
                const ctx = await context(fixture.storage, width);
                const page = await ctx.newPage();
                await page.goto(entry); await ready(page);
                assert.deepEqual(await stored(page), fixture.storage, `${stage}/${width}: opening the new UI must not rewrite storage`);
                assert.deepEqual(await state(page), expected, `${stage}/${width}: native load has the same result as the previous release`);
                const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
                assert.deepEqual(originalIds.filter(id => !['mobile', 'mobile-content', 'mobile-title', 'mobile-main-text',
                    'mobile-badges', 'apple_badge', 'google_badge', 'giftShopDiv'].includes(id)).sort(),
                    ids.filter(id => originalIds.includes(id)).sort(), 'all existing functional IDs preserved');
                assert.deepEqual(await page.locator('[onclick]').evaluateAll(elements => elements.map(element => [element.id, element.getAttribute('onclick')]).sort()), handlers.slice().sort());
                const layout = await page.evaluate(() => {
                    const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
                    const tinyButtons = [...document.querySelectorAll('button')].filter(element => element.checkVisibility() && element.getBoundingClientRect().height < 43.5).map(element => element.id);
                    return { width: innerWidth, scroll: document.documentElement.scrollWidth, tinyButtons,
                        production: rect('leftColumn'), computing: rect('compDiv'), projects: rect('projectsDiv'),
                        overview: rect('topDiv'), terminal: rect('consoleDiv'), canvas: rect('canvas') };
                });
                if (layout.scroll > width + 1) {
                    await page.screenshot({ path: path.join(output, 'overflow.png'), fullPage: true });
                    console.error(await page.locator('*').evaluateAll(elements => elements.filter(element => element.checkVisibility() && element.getBoundingClientRect().right > innerWidth).map(element => ({
                        tag: element.tagName, id: element.id, right: element.getBoundingClientRect().right, text: element.textContent.slice(0, 70)
                    }))));
                }
                assert(layout.scroll <= width + 1, `${stage}/${width}: page overflow ${layout.scroll}`);
                assert.deepEqual(layout.tinyButtons, [], `${stage}/${width}: 44px button targets`);
                assert.equal(await page.locator('#giftShopDiv, #mobile').count(), 0);
                assert.equal(await page.locator('#compDiv').isVisible(), stage !== 'initial');
                assert.equal(await page.locator('#projectsDiv').isVisible(), stage !== 'initial');
                assert.equal(await page.locator('#probeDesignDiv').isVisible(), stage === 'space');
                assert.equal(await page.locator('#investmentEngine').isVisible(), stage === 'trading');
                if (stage === 'space') {
                    const canvas = await page.locator('#canvas').boundingBox();
                    assert(Math.abs(canvas.width / canvas.height - 310 / 150) < .02);
                }
                if (stage === 'trading' && width === 320) {
                    assert(await page.locator('.table-scroll').evaluate(element => element.scrollWidth > element.clientWidth));
                }
                if (stage !== 'initial' && width < 700) {
                    assert(layout.terminal.top >= layout.overview.bottom, 'terminal follows overview');
                    assert(layout.computing.top >= layout.production.bottom, 'computing follows production');
                    assert(layout.projects.top >= layout.computing.bottom, 'projects follow computing');
                }
                if (stage !== 'initial' && width === 768) {
                    assert(Math.abs(layout.computing.top - layout.production.top) < 2);
                    assert(layout.projects.top >= layout.computing.bottom);
                }
                if (stage !== 'initial' && width === 1440) {
                    assert(Math.abs(layout.projects.top - layout.production.top) < 2);
                }
                const screen = `${stage}-${width}.png`;
                await page.screenshot({ path: path.join(output, screen), fullPage: true });
                screenshots.push(screen);
                if (stage === 'human' && width === 1440) {
                    await page.screenshot({ path: path.join(output, 'reference-state-1440.png') });
                }
                // Actual file chooser + confirmation + reload, then a real download.
                const chooser = page.waitForEvent('filechooser');
                await page.locator('#importSave').click();
                const dialog = page.waitForEvent('dialog');
                await (await chooser).setFiles({ name: `${stage}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
                const confirm = await dialog;
                assert.match(confirm.message(), /存档保存时间/);
                const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
                await confirm.accept(); await navigation; await ready(page);
                assert.deepEqual(await state(page), expected);
                const download = page.waitForEvent('download');
                await page.locator('#exportSave').click();
                const file = await download;
                const filePath = path.join(output, `${stage}-${width}.json`);
                await file.saveAs(filePath);
                const exported = JSON.parse(fs.readFileSync(filePath));
                assert.equal(exported.version, 1);
                assert.deepEqual(Object.keys(exported.storage), keys);
                const reloadContext = await context(exported.storage);
                const reloadBaseline = await reloadContext.newPage();
                await reloadBaseline.goto(`${local}/baseline/index2.html`); await ready(reloadBaseline);
                const reloadExpected = await state(reloadBaseline);
                await reloadContext.close();
                await page.reload(); await ready(page);
                assert.deepEqual(await state(page), reloadExpected);
                results.push(`${stage}/${width}: upgrade, layout, v1 import, download and refresh`);
                await ctx.close();
            }
        }
        // Exercise real native controls after the HTML has been moved into its new layout.
        for (const width of [390, 1440]) {
            const ctx = await context(fixtures.human.storage, width);
            const page = await ctx.newPage();
            await page.goto(entry); await ready(page);
            const before = await page.evaluate(() => ({ clips, wire, funds, margin, processors, memory, standardOps, clipmakerLevel }));
            await page.locator('#btnMakePaperclip').click();
            assert.equal(await page.evaluate(() => clips), before.clips + 1);
            await page.locator('#btnBuyWire').click();
            assert((await page.evaluate(() => wire)) > before.wire);
            await page.locator('#btnRaisePrice').click();
            assert((await page.evaluate(() => margin)) > before.margin);
            await page.evaluate(() => { trust = 100; buttonUpdate(); });
            await page.locator('#btnAddProc').click(); await page.locator('#btnAddMem').click();
            assert.deepEqual(await page.evaluate(() => [processors, memory]), [before.processors + 1, before.memory + 1]);
            await page.locator('#btnQcompute').click();
            assert.equal(await page.evaluate(() => standardOps), before.standardOps + 1080);
            await page.evaluate(() => { operations = standardOps = 40000; manageProjects(); buttonUpdate(); });
            await page.locator('#projectButton51').click();
            assert.equal(await page.evaluate(() => nextQchip), 4);
            await page.evaluate(() => { strategyEngineFlag = 1; operations = standardOps = 40000; buttonUpdate(); });
            await page.locator('#btnNewTournament').click();
            await page.locator('#stratPicker').selectOption('0');
            await page.locator('#btnRunTournament').click();
            assert.equal(await page.evaluate(() => tourneyInProg), 1);
            await page.evaluate(() => { investmentEngineFlag = 1; funds = 100; buttonUpdate(); });
            const bank = await page.evaluate(() => bankroll);
            await page.locator('#btnInvest').click();
            assert.equal(await page.evaluate(() => bankroll), bank + 100);
            await page.locator('#btnWithdraw').click();
            assert.equal(await page.evaluate(() => bankroll), 0);
            // Focus appearance and keyboard activation remain available.
            await page.keyboard.press('Tab');
            await page.locator('#exportSave').focus();
            assert.equal(await page.locator('#exportSave').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
            const keyboardDownload = page.waitForEvent('download');
            await page.keyboard.press('Enter');
            assert.match((await keyboardDownload).suggestedFilename(), /^paperclips-.*\.json$/);
            await ctx.close();
            const earthContext = await context(fixtures.earth.storage, width);
            const earth = await earthContext.newPage();
            await earth.goto(entry); await ready(earth);
            await earth.locator('#slider').fill('100');
            await earth.evaluate(() => window.__callbacks.find(timer => timer.delay === 10).callback());
            assert.equal(await earth.evaluate(() => Number(sliderPos)), 100);
            await earthContext.close();
            results.push(`${width}: make, buy wire, price, processor/memory, quantum, research, strategy, investment, keyboard export and swarm slider`);
        }
        assert.deepEqual(errors, []);
        const report = { url: entry, baseline, results, screenshots, pageErrors: errors, androidPhysicalDevice: false };
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
