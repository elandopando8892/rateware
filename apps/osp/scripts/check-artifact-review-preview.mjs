import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://localhost:8791';
assert.match(origin, /^(http:\/\/localhost:8791|https:\/\/osp-customer-setup-[a-z0-9]+-elandopando8892s-projects\.vercel\.app)$/);
const evidence = path.resolve(import.meta.dirname, '../../../tmp/osp-s13-review-preview-evidence');
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
  const external = [], errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.goto(`${origin}/app/cases/11111111-1111-4111-8111-111111111115/review`);
  const panel = page.getByRole('region', { name: 'Revisar el PDF campo por campo' });
  await panel.waitFor();
  assert.equal(await panel.getByRole('combobox').count(), 6);
  assert.equal(await panel.getByRole('combobox').first().isDisabled(), true);
  // Deliberately a header-only fixture: this tests local byte identity, NOT PDF validity/rendering.
  const fixture = (suffix) => ({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.7\n${suffix}`) });
  await panel.getByLabel('PDF local (máximo 25 MB)').setInputFiles(fixture('version-one'));
  await page.waitForFunction(() => !document.querySelector('.artifact-review select')?.disabled);
  const groups = panel.getByRole('group');
  for (let index = 0; index < 6; index++) {
    const group = groups.nth(index);
    await group.getByRole('combobox').selectOption(index === 5 ? 'not_applicable' : 'verified');
    if (index !== 5) await group.getByLabel('Ubicación en el PDF').fill('Página 1, casilla de prueba');
    await group.getByLabel('Qué comprobó o por qué no aplica').fill(index === 5 ? 'Ejemplo: la cuarta referencia es opcional.' : 'Ejemplo de revisión sintética; no es evidencia real.');
  }
  await panel.getByText(/Borrador de revisión completo/).waitFor();
  assert.equal(await page.getByRole('checkbox').isDisabled(), true);
  await panel.screenshot({ path: path.join(evidence, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole('heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'mobile.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await panel.getByLabel('PDF local (máximo 25 MB)').setInputFiles(fixture('version-two'));
  const restart = panel.getByRole('button', { name: 'Iniciar revisión del archivo actual' });
  await restart.waitFor();
  assert.equal(await panel.getByRole('combobox').first().isDisabled(), true);
  await restart.click();
  assert.equal(await panel.getByRole('combobox').first().inputValue(), 'pending');
  assert.equal(await panel.getByLabel('Qué comprobó o por qué no aplica').first().inputValue(), '');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ origin, fields: 6, staleReviewRejected: true, workflowStillBlocked: true, externalRequests: 0, browserErrors: 0, mobileOverflow: false, evidence }));
} finally { await browser.close(); }
/* global document, window */
