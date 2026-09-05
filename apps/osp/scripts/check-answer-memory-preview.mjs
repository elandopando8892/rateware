import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://localhost:8791';
assert.match(origin, /^(http:\/\/localhost:8791|https:\/\/osp-customer-setup-[a-z0-9]+-elandopando8892s-projects\.vercel\.app)$/);
const evidence = path.resolve(import.meta.dirname, '../../../tmp/osp-s13-answer-review-evidence');
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
  const external = [], blockedFonts = [], errors = [], writes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.method()); await route.abort(); }
    else if (new URL(request.url()).origin !== origin) {
      // SurveyJS's existing stylesheet attempts Open Sans downloads. Keep them blocked,
      // report them separately, and fail for any other external request.
      if (/^https:\/\/fonts\.gstatic\.com\/s\/opensans\/[^?#]+\.woff2$/.test(request.url())) blockedFonts.push(request.url());
      else external.push(new URL(request.url()).origin);
      await route.abort();
    }
    else await route.continue();
  });
  await page.goto(`${origin}/app/cases/11111111-1111-4111-8111-111111111115/form`);
  const panel = page.getByRole('region', { name: 'Answer memory candidates' });
  await panel.waitFor();
  await panel.getByText(/4 captured candidates/).waitFor();
  await panel.getByText(/not approved reusable facts/).waitFor();
  assert.equal(await panel.getByRole('button').count(), 0);
  const review = page.getByRole('region', { name: 'Review saved answers' });
  const current = review.getByRole('article', { name: 'Razón social de ejemplo' });
  await current.getByRole('textbox').fill('Revisé la respuesta sintética y su entidad de ejemplo.');
  await current.getByRole('checkbox').check();
  await current.getByRole('button', { name: 'Aceptar candidata' }).click();
  await current.getByText(/Estado: aceptada para futura promoción; no reutilizable/).waitFor();
  const stale = review.getByRole('article', { name: 'Domicilio anterior de ejemplo' });
  await stale.getByRole('textbox').fill('La versión anterior no corresponde al origen actual.');
  await stale.getByRole('checkbox').check();
  assert.equal(await stale.getByRole('button', { name: 'Aceptar candidata' }).isDisabled(), true);
  await stale.getByRole('button', { name: 'Descartar candidata' }).click();
  await stale.getByText('Estado: descartada').waitFor();
  await current.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await current.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(evidence, 'mobile.png') });
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  await page.reload();
  await page.getByRole('article', { name: 'Razón social de ejemplo' }).getByText('Estado: pendiente', { exact: true }).waitFor();
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(JSON.stringify({ origin, acceptedExample: 1, rejectedStaleExample: 1, resetsOnReload: true, approvedForReuse: false, allowedExternalRequests: 0, blockedFontRequests: blockedFonts.length, writeRequests: 0, browserErrors: 0, mobileOverflow: false, evidence }));
} finally { await browser.close(); }
/* global document, window */
