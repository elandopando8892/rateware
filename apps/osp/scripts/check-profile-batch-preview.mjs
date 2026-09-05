import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://localhost:8791';
assert.match(origin, /^(http:\/\/localhost:8791|https:\/\/osp-customer-setup-[a-z0-9]+-elandopando8892s-projects\.vercel\.app)$/);
const evidence = path.resolve(import.meta.dirname, '../../../tmp/osp-s13-complete-batch-evidence', origin.startsWith('http:') ? 'local' : 'cloud');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  if (process.env.OSP_REVIEW_PREVIEW_ACCESS_URL) {
    const access = new URL(process.env.OSP_REVIEW_PREVIEW_ACCESS_URL);
    assert.equal(access.origin, origin);
    assert.equal(access.searchParams.has('_vercel_share'), true);
    await page.goto(access.href);
  }
  const external = [], errors = [], writes = [], blockedFonts = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.method()); await route.abort(); }
    else if (new URL(request.url()).origin !== origin) {
      if (/^https:\/\/fonts\.gstatic\.com\/s\/opensans\/[^?#]+\.woff2$/.test(request.url())) blockedFonts.push(request.url());
      else external.push(new URL(request.url()).origin);
      await route.abort();
    } else await route.continue();
  });
  await page.goto(`${origin}/app/profile`);
  await page.getByRole('button', { name: /United States entity/ }).click();
  const panel = page.getByRole('region', { name: 'Comparación completa del documento' });
  await panel.getByRole('heading', { name: 'Documento completo · 5 campos' }).waitFor();
  for (const text of ['Nuevo', 'Reemplaza', 'Sin cambio', 'Reservado · excluido', 'Rechazado · excluido']) await panel.getByText(text, { exact: true }).waitFor();
  assert.equal(await panel.getByRole('listitem').count(), 5);
  assert.equal(await panel.getByRole('checkbox').count(), 1);
  assert.equal(await panel.getByRole('button').isDisabled(), true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'desktop.png') });
  await panel.screenshot({ path: path.join(evidence, 'desktop-batch.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await panel.screenshot({ path: path.join(evidence, 'mobile-batch.png') });
  await panel.getByRole('checkbox').focus();
  await page.screenshot({ path: path.join(evidence, 'mobile-focus.png') });
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Publicar lote completo en el perfil XBF' }).click();
  await page.getByRole('status').filter({ hasText: '2 reviewed facts promoted' }).waitFor();
  assert.equal(await panel.getByRole('button').count(), 0);
  await page.reload();
  await page.getByRole('button', { name: /United States entity/ }).click();
  assert.equal(await panel.getByRole('checkbox').isChecked(), false);
  assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  const proof = { origin, syntheticBatchFields: 5, dispositions: 5, syntheticPublicationReceipts: 1, resetsOnReload: true,
    persistentCloudWrites: 0, allowedExternalRequests: 0, blockedFontRequests: blockedFonts.length, browserErrors: 0, mobileOverflow: false, evidence };
  await writeFile(path.join(evidence, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally { await browser.close(); }
/* global document, window */
