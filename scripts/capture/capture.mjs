// Regenerates docs/screenshots by RUNNING the real portal and driving it with a real browser.
// The portal is started from a scratch copy of this repository (so the create flow never writes into your
// working tree), the golden-path create flow is exercised through its real form, and Playwright screenshots
// what the portal renders. Nothing is mocked up by hand.
// Usage: cd scripts/capture && npm install && npm run capture   (needs Node >= 22.13)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const shots = path.join(root, 'docs/screenshots');
const work = '/tmp/idp-demo';
const PORT = 3100;
const URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChromium() {
  for (const dir of [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      for (const rel of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
        const p = path.join(dir, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

let server;
function stop() { if (server) { try { process.kill(-server.pid); } catch { /* gone */ } } }
process.on('exit', stop);

try {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const r = spawnSync('rsync', ['-a', '--exclude', '.git', '--exclude', 'docs/screenshots', '--exclude', 'catalog.db', '--exclude', 'generated/*', root + '/', work + '/']);
  if (r.status !== 0) throw new Error('could not copy the repository: ' + r.stderr);
  fs.mkdirSync(path.join(work, 'generated'), { recursive: true });
  fs.mkdirSync(shots, { recursive: true });
  for (const f of fs.readdirSync(shots)) if (f.endsWith('.png')) fs.rmSync(path.join(shots, f));

  server = spawn('npm', ['run', 'dev:web'], { cwd: work, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), PAGERDUTY_SUBDOMAIN: 'acme' } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(URL + '/')).ok) break; } catch { /* starting */ } await sleep(1000); }

  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const shot = async (name) => { await sleep(500); await page.screenshot({ path: path.join(shots, name), fullPage: true }); console.log('captured ' + name); };

  await page.goto(URL + '/');
  await shot('01-catalog.png');
  await page.goto(URL + '/services/payments-service');
  await shot('02-service-detail.png');
  await page.goto(URL + '/graph');
  await shot('03-dependency-graph.png');

  // the golden-path create flow, through the real form
  await page.goto(URL + '/create');
  await page.fill('input[name=name]', 'billing-service');
  await page.fill('textarea[name=description]', 'Invoices customers and reconciles payments.');
  await page.fill('input[name=owner]', 'team-billing');
  await page.check('input[name=dependsOn][value=payments-service]');
  await shot('04-create-form.png');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  await shot('05-create-success.png');

  await page.goto(URL + '/create');
  await page.fill('input[name=name]', 'marketing-site');
  await page.fill('textarea[name=description]', 'The public marketing website.');
  await page.fill('input[name=owner]', 'team-billing');
  await page.selectOption('select[name=kind]', 'Website');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  await page.goto(URL + '/');
  await shot('06-catalog-after-create.png');
  await page.goto(URL + '/?kind=Website');
  await shot('07-catalog-filtered.png');

  await page.goto(URL + '/teams');
  await shot('08-teams.png');
  await page.goto(URL + '/teams/team-checkout');
  await shot('09-team-detail.png');

  // a malformed catalog-info.yaml is skipped and reported, not allowed to break the catalog
  const broken = path.join(work, 'catalog/examples/broken-service');
  fs.mkdirSync(broken, { recursive: true });
  fs.writeFileSync(path.join(broken, 'catalog-info.yaml'), 'apiVersion: idp/v1\nkind: Service\nmetadata:\n  name: Broken Service!\nspec:\n  lifecycle: nonsense\n');
  await fetch(URL + '/admin/refresh', { method: 'POST' });
  await page.goto(URL + '/');
  await shot('10-catalog-validation-errors.png');
  await browser.close();
} finally {
  stop();
}
