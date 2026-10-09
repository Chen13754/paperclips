const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const temp = path.join(root, '.cache', 'browser');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(temp, { recursive: true });
// Keep temporary browser profiles and downloads inside this checkout.
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
const { chromium, devices } = require('playwright-core');
const upstream = 'f4b33a93082a2c1ef5678353486428cf21506e9c';
const original = file => execFileSync('git', ['show', `${upstream}:${file}`], { cwd: root });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (name === '/legacy.html') {
        res.setHeader('Content-Type', types['.html']);
        return res.end(original('index2.html').toString().replace('src="main-v3.js"', 'src="legacy-main-v3.js"'));
    }
    if (name === '/legacy-main-v3.js') {
        res.setHeader('Content-Type', types['.js']);
        return res.end(original('main-v3.js'));
    }
    const file = path.join(root, name === '/' ? 'index2.html' : name.slice(1));
    const type = types[path.extname(file)];
    if (!type || path.dirname(file) !== root || !fs.existsSync(file)) {
        res.writeHead(404); return res.end();
    }
    res.setHeader('Content-Type', type);
    res.end(fs.readFileSync(file));
});

const keys = ['saveGame', 'saveProjectsUses', 'saveProjectsFlags', 'saveProjectsActive', 'saveStratsActive', 'savePrestige'];
const stored = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);

async function ready(page) {
    await page.waitForFunction(() => window.PaperclipSaves && document.getElementById('cover').style.display === 'none');
    await page.evaluate(() => window.__gameIntervals.forEach(clearInterval));
}

async function selectFile(page, file, accept) {
    const dialogPromise = page.waitForEvent('dialog');
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入存档', exact: true }).click();
    await (await chooserPromise).setFiles(file);
    const dialog = await dialogPromise;
    const message = dialog.message();
    if (accept) await dialog.accept(); else await dialog.dismiss();
    return message;
}

(async () => {
    let browser;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const local = `http://127.0.0.1:${server.address().port}`;
    const entry = process.env.PAPERCLIPS_URL || `${local}/index2.html`;
    const pageOrigin = new URL(entry).origin;
    const errors = [];
    const results = [];
    try {
        const launch = { headless: true, args: ['--no-first-run'] };
        if (process.env.PAPERCLIPS_BROWSER) launch.executablePath = process.env.PAPERCLIPS_BROWSER;
        else launch.channel = 'msedge';
        browser = await chromium.launch(launch);

        async function context(options = {}, migration = false) {
            const ctx = await browser.newContext({ acceptDownloads: true, ...options });
            // Game behavior is independent of the upstream analytics/customer-service scripts.
            await ctx.route('**/*', route => {
                const url = new URL(route.request().url());
                if (migration && !process.env.PAPERCLIPS_URL && url.origin === 'https://chen13754.github.io' &&
                    url.pathname === '/paperclips/save-files.js') {
                    return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'save-files.js')) });
                }
                if (url.origin === pageOrigin || url.origin === local ||
                    (migration && process.env.PAPERCLIPS_URL && url.origin === 'https://g1tyx.github.io')) {
                    return route.continue();
                }
                return route.abort();
            });
            await ctx.addInitScript(() => {
                const original = window.setInterval;
                window.__gameIntervals = [];
                window.setInterval = function (...args) {
                    const id = original.apply(this, args);
                    window.__gameIntervals.push(id);
                    return id;
                };
            });
            ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
            return ctx;
        }

        const desktopContext = await context({ viewport: { width: 1280, height: 900 } });
        const desktop = await desktopContext.newPage();
        await desktop.goto(entry, { waitUntil: 'domcontentloaded' });
        await ready(desktop);
        assert(await desktop.getByRole('button', { name: '导出存档', exact: true }).isVisible());
        await desktop.evaluate(() => { clips = 12345; funds = 567; updateStats(); });
        const downloadPromise = desktop.waitForEvent('download');
        await desktop.getByRole('button', { name: '导出存档', exact: true }).click();
        const downloaded = await downloadPromise;
        assert.match(downloaded.suggestedFilename(), /^paperclips-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
        const savePath = path.join(output, downloaded.suggestedFilename());
        await downloaded.saveAs(savePath);
        const envelope = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        assert.equal(JSON.parse(envelope.storage.saveGame).clips, 12345);
        await desktop.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
        results.push('Desktop actual download captures latest progress and dated filename');

        const mobileContext = await context(devices['Pixel 7']);
        const mobile = await mobileContext.newPage();
        await mobile.goto(entry, { waitUntil: 'domcontentloaded' });
        await ready(mobile);
        const layout = await mobile.evaluate(() => ({
            gameVisible: getComputedStyle(document.getElementById('page')).display !== 'none',
            toolbar: document.getElementById('saveToolbar').getBoundingClientRect().toJSON(),
            viewport: innerWidth,
        }));
        assert(layout.gameVisible);
        assert(layout.toolbar.right <= layout.viewport + 1);
        await mobile.evaluate(() => localStorage.setItem('savePrestige', '{"prestigeU":9,"prestigeS":8}'));
        const navigation = mobile.waitForEvent('framenavigated', { predicate: frame => frame === mobile.mainFrame() });
        const message = await selectFile(mobile, savePath, true);
        assert.match(message, /存档保存时间/);
        await navigation;
        await ready(mobile);
        assert.deepEqual(await stored(mobile), envelope.storage);
        assert.equal(await mobile.evaluate(() => clips), 12345);
        assert.equal(await mobile.evaluate(() => prestigeU), 0);
        await mobile.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true, scale: 'css' });
        results.push('Mobile-size browser uses real file chooser, imports all keys, reloads, and clears absent prestige');

        const before = await stored(mobile);
        await selectFile(mobile, savePath, false);
        await mobile.waitForFunction(() => document.getElementById('saveStatus').textContent === '已取消导入。');
        assert.deepEqual(await stored(mobile), before);
        const invalid = { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') };
        const errorMessage = await selectFile(mobile, invalid, true);
        assert.match(errorMessage, /无法读取存档/);
        assert.deepEqual(await stored(mobile), before);
        results.push('Cancel and malformed-file UI paths preserve storage without reload');

        await desktop.goto(new URL('migrate.html', entry).href);
        const code = await desktop.locator('#migrationCode').inputValue();
        assert(code.startsWith('javascript:'));
        assert(!/[\r\n]/.test(code));
        await desktop.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
            configurable: true, value: { async writeText(value) { window.__copiedMigration = value; } },
        }));
        await desktop.getByRole('button', { name: '安卓：复制脚本正文', exact: true }).click();
        assert.equal(await desktop.evaluate(() => window.__copiedMigration), code.slice('javascript:'.length));
        await desktop.getByRole('button', { name: '复制完整脚本', exact: true }).click();
        assert.equal(await desktop.evaluate(() => window.__copiedMigration), code);
        const migrationContext = await context({ ...devices['Pixel 7'],
            userAgent: await desktop.evaluate(() => navigator.userAgent) }, true);
        const legacy = await migrationContext.newPage();
        await legacy.goto(process.env.PAPERCLIPS_URL ? 'https://g1tyx.github.io/paperclips/index2.html' :
            `${local}/legacy.html`, { waitUntil: 'domcontentloaded' });
        await legacy.waitForFunction(() => typeof save === 'function' && document.getElementById('cover').style.display === 'none');
        await legacy.evaluate(() => {
            window.__gameIntervals.forEach(clearInterval);
            // Approximate Android Desktop site's wide layout; this does not test its native address bar.
            document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=980');
            clips = 9876; cheatPrestigeU();
        });
        await legacy.waitForFunction(() => innerWidth >= 980);
        assert.equal(await legacy.evaluate(() => typeof getSaveSnapshot), 'undefined');
        const beforeMigration = await stored(legacy);
        let migrationDownloads = 0;
        legacy.on('download', () => migrationDownloads++);
        await legacy.evaluate(code.slice('javascript:'.length));
        const panel = legacy.locator('#paperclipsMigration');
        await panel.getByRole('button', { name: '导出存档', exact: true }).waitFor();
        assert.deepEqual(await stored(legacy), beforeMigration);
        assert.equal(migrationDownloads, 0);
        const panelLayout = await panel.boundingBox();
        const panelViewport = await legacy.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        assert(panelLayout.x >= 0 && panelLayout.x + panelLayout.width <= panelViewport.width);
        assert(panelLayout.y >= 0 && panelLayout.y + panelLayout.height <= panelViewport.height);
        await legacy.evaluate(code.slice('javascript:'.length));
        assert.equal(await panel.count(), 1);
        await legacy.screenshot({ path: path.join(output, 'migration-desktop-site.png'), scale: 'css' });
        await legacy.evaluate(() => { clips = 9877; });
        const migrationDownload = legacy.waitForEvent('download');
        await panel.getByRole('button', { name: '导出存档', exact: true }).click();
        const migrated = await migrationDownload;
        const migratedPath = path.join(output, 'migration.json');
        await migrated.saveAs(migratedPath);
        const migratedEnvelope = JSON.parse(fs.readFileSync(migratedPath, 'utf8'));
        assert.equal(JSON.parse(migratedEnvelope.storage.saveGame).clips, 9877);
        assert.equal(JSON.parse(migratedEnvelope.storage.savePrestige).prestigeU, 1);
        await mobile.evaluate(data => PaperclipSaves.parse(JSON.stringify(data)), migratedEnvelope);
        assert.equal(await legacy.evaluate(() => clips), 9877);
        await panel.getByRole('button', { name: '显示存档文本', exact: true }).click();
        const textBackup = await panel.getByRole('textbox', { name: '存档 JSON 文本' }).inputValue();
        assert.deepEqual(JSON.parse(textBackup), migratedEnvelope);
        await mobile.evaluate(text => PaperclipSaves.parse(text), textBackup);
        await panel.getByRole('button', { name: '关闭', exact: true }).click();
        assert.equal(await panel.count(), 0);
        results.push('Wide touch-screen migration panel waits for a tap, exports latest original-site progress, and offers identical JSON text');

        const beforeFailure = await stored(legacy);
        await legacy.evaluate(() => { delete window.PaperclipSaves; });
        await migrationContext.route('**/save-files.js?migration=2', route => route.abort());
        await legacy.evaluate(code.slice('javascript:'.length));
        await panel.getByRole('status').filter({ hasText: '导出工具加载失败' }).waitFor();
        assert.deepEqual(await stored(legacy), beforeFailure);
        assert.equal(migrationDownloads, 1);
        results.push('Failed helper load shows a visible error and leaves original save untouched');

        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ url: entry, results, pageErrors: errors,
            androidPhysicalDevice: false, androidNativeAddressBarTested: false }, null, 2));
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
