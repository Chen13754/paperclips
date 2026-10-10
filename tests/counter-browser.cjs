// Isolated synthetic saves; never read an everyday browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { game } = require('./game.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'counter');
const temp = path.join(root, '.cache', 'counter-browser');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(temp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
const { chromium } = require('playwright-core');
const baseline = '0c7950dd528711f87492c51ea2ab30db50a77b35', old = new Map();
function previous(name) {
    if (!old.has(name)) old.set(name, execFileSync('git', ['show', baseline + ':' + name], { cwd: root }));
    return old.get(name);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost'), isOld = url.pathname.startsWith('/baseline/');
    const name = url.pathname.split('/').pop();
    if (!types[path.extname(name)] || !fs.existsSync(path.join(root,name))) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type',types[path.extname(name)]);
    res.end(isOld ? previous(name) : fs.readFileSync(path.join(root,name)));
});
const frame = page => page.evaluate(() => new Promise(requestAnimationFrame));
async function ready(page) {
    await page.waitForFunction(() => window.PaperclipSaves);
    await page.evaluate(() => { buttonUpdate(); updateStats(); manageProjects(); buttonUpdate(); });
    await frame(page);
}
function storage() {
    const g = game();
    Object.assign(g, { humanFlag: 0, compFlag: 1, projectsFlag: 1, creativityOn: true,
        factoryFlag: 1, wireProductionFlag: 1, harvesterFlag: 1, wireDroneFlag: 1, tothFlag: 1,
        unusedClips: 1e12, clips: 1e15, memory: 50, processors: 5, factoryLevel: 15,
        farmLevel: 1000, powMod: 1, swarmFlag: 1, strategyEngineFlag: 1,
        qFlag: 1, nextQchip: 3, operations: 16000, standardOps: 16000 });
    for (const id of ['project1','project127','project128','project50','project51']) { g[id].flag = 1; g[id].uses = 0; }
    g.qChips.forEach((chip,index) => { chip.active = index < 3 ? 1 : 0; });
    return JSON.parse(JSON.stringify(g.PaperclipSaves.capture())).storage;
}
const keys = ['saveGame','saveProjectsUses','saveProjectsFlags','saveProjectsActive','saveStratsActive','savePrestige'];
(async () => {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const local = 'http://127.0.0.1:' + server.address().port;
    const entry = process.env.PAPERCLIPS_URL || local + '/index2.html';
    const errors = [], results = [];
    let browser;
    try {
        browser = await chromium.launch({ headless: true,
            ...(process.env.PAPERCLIPS_BROWSER ? { executablePath: process.env.PAPERCLIPS_BROWSER } : { channel: 'msedge' }) });
        async function context(width, height = 1024, seed = storage()) {
            const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, acceptDownloads: true });
            await ctx.route('**/*', route => {
                const origin = new URL(route.request().url()).origin;
                return [local, new URL(entry).origin].includes(origin) ? route.continue() : route.abort();
            });
            await ctx.addInitScript(data => {
                if (!/^https?:$/.test(location.protocol)) return;
                window.__callbacks = [];
                window.setInterval = (callback, delay) => { __callbacks.push({ callback, delay }); return 1; };
                if (!sessionStorage.getItem('seeded')) {
                    for (const [key,value] of Object.entries(data)) if (value !== null) localStorage.setItem(key,value);
                    sessionStorage.setItem('seeded','1');
                }
            }, seed);
            ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
            return ctx;
        }
        for (const width of [768,980,1024,1440]) {
            const ctx = await context(width);
            const page = await ctx.newPage(); await page.goto(entry); await ready(page);
            const oldPage = await ctx.newPage(); await oldPage.goto(local + '/baseline/index2.html'); await ready(oldPage);
            assert.equal(await page.locator('#clips').evaluate(node => getComputedStyle(node).fontSize),
                await oldPage.locator('#clips').evaluate(node => getComputedStyle(node).fontSize), 'original number font size');
            const stateBefore = await page.evaluate(() => getSaveSnapshot());
            const originalState = await oldPage.evaluate(() => getSaveSnapshot());
            assert.deepEqual(stateBefore, originalState, 'pre-fix save loads identical native fields');
            await page.bringToFront();
            const untouched = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
            const idle = await page.evaluate(async () => {
                factoryLevel = clipmakerLevel = megaClipperLevel = 0; wire = 1e30;
                clips = 1e20; clipCounterDisplay.reset();
                window.__numberNode = document.getElementById('clips').firstChild;
                let count = 0;
                const observer = new MutationObserver(items => count += items.length);
                observer.observe(document.getElementById('clips'), { childList: true, subtree: true, characterData: true });
                const callback = __callbacks.find(item => item.delay === 10).callback;
                for (let i=0;i<100;i++) callback();
                await Promise.resolve(); observer.disconnect();
                return { count, sameNode: __numberNode === document.getElementById('clips').firstChild };
            });
            assert.deepEqual(idle, { count: 0, sameNode: true }, '100 idle ticks do not rewrite the number');

            const paced = await page.evaluate(async () => {
                factoryLevel = 1; clips = 1e15; wire = 1e30; clipCounterDisplay.reset();
                const times = [], start = performance.now();
                const observer = new MutationObserver(() => times.push(performance.now()));
                observer.observe(document.getElementById('clips'), { childList: true, subtree: true, characterData: true });
                const callback = __callbacks.find(item => item.delay === 10).callback;
                for (let i=0;i<100;i++) { callback(); await new Promise(resolve => setTimeout(resolve,10)); }
                const live = clips;
                await new Promise(resolve => setTimeout(resolve,150)); observer.disconnect();
                return { times, duration: performance.now() - start, live, text: document.getElementById('clips').textContent, sameNode: __numberNode === document.getElementById('clips').firstChild };
            });
            assert(paced.times.length >= 5 && paced.times.length <= Math.ceil(paced.duration / 100) + 1, JSON.stringify({ width, paced }));
            for (let i=1;i<paced.times.length;i++) assert(paced.times[i]-paced.times[i-1] >= 95, 'ordinary display refresh is paced');
            assert.equal(paced.text, paced.live.toLocaleString('en-US',{ maximumFractionDigits: 0 }));
            assert.equal(paced.sameNode,true);
            assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),keys),untouched);

            // High-water line height prevents an alternating digit width or ending string from shrinking the page.
            const geometry = [];
            await page.evaluate(() => { clips = 1e54; clipCounterDisplay.reset(); scrollTo(0,400); });
            for (const value of [9e14,1e15,1e27,1e54,9e14,1e54]) {
                await page.evaluate(value => { clips = value; clipCounterDisplay.request(); },value);
                await page.waitForFunction(value => document.getElementById('clips').textContent === value.toLocaleString('en-US',{ maximumFractionDigits:0 }),value);
                geometry.push(await page.evaluate(() => {
                    const rect = id => document.getElementById(id).getBoundingClientRect();
                    return { scroll: scrollY, number: rect('clips').height, grid: rect('gameGrid').top, terminal: rect('consoleDiv').height,
                        unit: document.querySelector('.clip-unit').getBoundingClientRect().top, bottom: rect('clips').bottom };
                }));
            }
            assert(geometry.every(item => Math.abs(item.number-geometry[0].number)<1 && Math.abs(item.grid-geometry[0].grid)<1 && Math.abs(item.scroll-geometry[0].scroll)<1));
            assert(geometry.every(item => Math.abs(item.terminal-geometry[0].terminal)<1 && item.unit >= item.bottom-1));
            await page.screenshot({ path: path.join(output,'pc-'+width+'.png'),fullPage:true });
            // Refresh/reload resets reserved space; immediate manual clicks cancel a pending value.
            await page.evaluate(() => { clips = 0; wire = 100; humanFlag = 1; clipCounterDisplay.reset(); buttonUpdate(); clips = 2; clipCounterDisplay.request(); });
            await page.locator('#btnMakePaperclip').click();
            assert.equal(await page.locator('#clips').textContent(),'3');
            await page.waitForTimeout(150); assert.equal(await page.locator('#clips').textContent(),'3');
            await page.evaluate(() => { clips = 42; clipCounterDisplay.request(); });
            const downloadPromise = page.waitForEvent('download');
            await page.locator('#exportSave').click();
            const file = path.join(output,'export-'+width+'.json'); await (await downloadPromise).saveAs(file);
            const envelope = JSON.parse(fs.readFileSync(file,'utf8'));
            assert.equal(envelope.version,1); assert.equal(JSON.parse(envelope.storage.saveGame).clips,42);
            await page.reload(); await ready(page);
            assert.equal(await page.locator('#clips').textContent(),'42');
            await oldPage.close(); await ctx.close();
            results.push({ width, idleWrites: idle.count, productionWrites: paced.times.length, measuredMs: Math.round(paced.duration),
                stableTextNode: paced.sameNode, nativeStateEqual: true, stableNumberAndTerminalHeight: true, latestExportAndReload: true });
        }

        const ctx = await context(390,844);
        const phone = await ctx.newPage(); await phone.goto(entry); await ready(phone);
        for (const width of [320,390,430,699]) {
            await phone.setViewportSize({ width,height:844 }); await frame(phone);
            await phone.evaluate(() => { window.scrollTo(0,450); });
            const samples=[];
            for (const n of [9999999,10000000,999999999999,1e12,9e15,1e16,1e27,1e54,9999999,1e54]) {
                await phone.evaluate(n => {
                    unusedClips = n; unusedClipsDisplayElement.innerHTML = spellf(n);
                    clipmakerRate2Element.innerHTML = spellf(n/10);
                }, n);
                await frame(phone); await frame(phone);
                samples.push(await phone.evaluate(() => ({
                    height: document.getElementById('mobileMetrics').offsetHeight, scroll: scrollY,
                    bodyHeight: document.body.style.getPropertyValue('--mobile-metrics-height'),
                    stockHeight: document.getElementById('mobileStock').offsetHeight,
                    font: getComputedStyle(document.getElementById('mobileStock')).fontSize,
                    overflow: document.documentElement.scrollWidth > innerWidth+1,
                    text: document.getElementById('mobileStock').textContent,
                })));
            }
            assert(samples.every(item => item.height===samples[0].height && item.stockHeight===90 && item.font==='24px' && !item.overflow));
            assert(samples.every(item => Math.abs(item.scroll-samples[0].scroll)<1));
            assert(samples.every(item => item.bodyHeight === samples[0].bodyHeight));
            assert(samples.every(item => !/e\+/.test(item.text)), 'native quantity names remain');
            await phone.evaluate(() => scrollTo(0,0));
            await phone.screenshot({ path: path.join(output,'phone-'+width+'.png'),fullPage:true });
            results.push({ width, phoneMetricsHeight: samples[0].height, fixedThreeRows: true, stableScroll: true, fontUnchanged: true });
        }

        // Width changes discard only the view's reserved height, including repeated phone/tablet transitions.
        for (const size of [[980,1024],[390,844],[1024,768],[699,844],[700,1024],[1440,900],[768,1024]]) {
            await phone.setViewportSize({ width:size[0],height:size[1] }); await frame(phone); await frame(phone);
            await phone.evaluate(() => { clips = 1e27; clipCounterDisplay.reset(); });
            assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
            if (size[0]<700) {
                assert.equal(await phone.locator('#clips').evaluate(node => node.style.minHeight),'');
                assert.equal(await phone.locator('#mobileMetrics').count(),1);
            } else assert(await phone.locator('#clips').evaluate(node => parseFloat(node.style.minHeight)>0));
            assert.equal(await phone.locator('#btnMakePaperclip').count(),1);
        }
        await phone.setViewportSize({ width:980,height:1024 }); await frame(phone);
        const oldPage = await ctx.newPage(); await oldPage.goto(local+'/baseline/index2.html'); await ready(oldPage);
        await phone.bringToFront();
        for (const [step, final] of [[0,0],[1,0],[2,0],[3,0],[4,0],[4,9],[5,10],[6,99],[7,100]]) {
            for (const page of [phone,oldPage]) await page.evaluate(({step,final}) => {
                milestoneFlag=15; dismantle=step; finalClips=final; updateStats();
            },{step,final});
            assert.equal(await phone.locator('#clips').textContent(),await oldPage.locator('#clips').textContent(),'ending text preserved');
            assert.equal(await phone.locator('#clipCountCrunched').textContent(),await oldPage.locator('#clipCountCrunched').textContent());
        }
        await ctx.close();
        results.push('repeated width changes and every ending display preserve nodes, complete digits and original ending text');
        assert.deepEqual(errors,[]);
        const report={ url:entry, baseline, results, pageErrors:errors, androidPhysicalDevice:false, iPadPhysicalDevice:false, engine:'Windows Edge / Chromium' };
        fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
    } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
