import assert from 'node:assert/strict';

import { createAzureDocumentIntelligence } from './azure-document-intelligence.ts';

const sourceVersionId = '11111111-1111-4111-8111-111111111111';
const polygon = [0, 0, 1, 0, 1, 1, 0, 1];
const origin = `${['https', ''].join(':')}//synthetic-resource.cognitiveservices.azure.com`;

function completedResult() {
  return {
    status: 'succeeded',
    analyzeResult: {
      apiVersion: '2024-11-30',
      modelId: 'prebuilt-layout',
      content: 'Supplier registration',
      pages: [{ pageNumber: 1, width: 8.5, height: 11, unit: 'inch', lines: [{ content: 'Supplier registration', polygon }] }],
      documents: [{ docType: 'supplier_registration', confidence: 0.98, boundingRegions: [{ pageNumber: 1, polygon }] }],
    },
  };
}

Deno.test('Azure adapter submits bytes and polls only the same-origin 2024-11-30 operation', async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const adapter = createAzureDocumentIntelligence({
    endpoint: origin,
    apiKey: 'synthetic-key',
    request: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init: init ?? {} });
      if (calls.length === 1) {
        const operation = new URL('/documentintelligence/documentModels/prebuilt-layout/analyzeResults/operation-1', origin);
        operation.searchParams.set('api-version', '2024-11-30');
        return new Response(null, { status: 202, headers: { 'operation-location': operation.toString() } });
      }
      return Response.json(completedResult());
    },
    sleep: async () => {},
  });
  const bytes = new TextEncoder().encode('synthetic pdf bytes');
  const result = await adapter.analyze({ sourceVersionId, sourceSafety: 'safe', contentType: 'application/pdf', bytes });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get('api-version'), '2024-11-30');
  assert.match(calls[0].url.pathname, /prebuilt-layout:analyze$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.body, bytes);
  assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/pdf');
  assert.equal((calls[0].init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key'], 'synthetic-key');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[1].url.origin, calls[0].url.origin);
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.redirect, 'error');
  assert.equal(result.modelVersion, 'prebuilt-layout@2024-11-30');
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].locator.sourceVersionId, sourceVersionId);
  assert.deepEqual(result.evidence[0].locator.polygon, polygon);
  assert.deepEqual(result.classifications, [{ documentType: 'supplier_registration', confidence: 0.98, pageRanges: [{ firstPage: 1, lastPage: 1 }] }]);
});

Deno.test('Azure adapter fails closed before or across the provider boundary', async () => {
  let calls = 0;
  const adapter = createAzureDocumentIntelligence({
    endpoint: origin,
    apiKey: 'synthetic-key',
    request: async () => { calls += 1; return new Response(null, { status: 500 }); },
    sleep: async () => {},
  });
  await assert.rejects(
    adapter.analyze({ sourceVersionId, sourceSafety: 'pending', contentType: 'application/pdf', bytes: new Uint8Array([1]) }),
    /SOURCE_NOT_SAFE/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    adapter.analyze({ sourceVersionId, sourceSafety: 'safe', contentType: 'application/pdf', bytes: new Uint8Array(25 * 1024 * 1024 + 1) }),
    /DOCUMENT_SIZE_INVALID/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    adapter.analyze({ sourceVersionId, sourceSafety: 'safe', contentType: 'application/pdf', bytes: new Uint8Array([1]) }),
    /AZURE_TEMPORARY/,
  );
  assert.equal(calls, 1);

  const foreignOrigin = `${['https', ''].join(':')}//foreign.example.test`;
  const foreignPoll = createAzureDocumentIntelligence({
    endpoint: origin,
    apiKey: 'synthetic-key',
    request: async () => new Response(null, { status: 202, headers: { 'operation-location': `${foreignOrigin}/operation-1` } }),
    sleep: async () => {},
  });
  await assert.rejects(
    foreignPoll.analyze({ sourceVersionId, sourceSafety: 'safe', contentType: 'application/pdf', bytes: new Uint8Array([1]) }),
    /AZURE_OPERATION_ORIGIN_INVALID/,
  );
});

Deno.test('Azure adapter bounds polling and provider page output', async () => {
  let polls = 0;
  const boundedPoll = createAzureDocumentIntelligence({
    endpoint: origin,
    apiKey: 'synthetic-key',
    request: async () => {
      if (polls++ === 0) {
        const operation = new URL('/documentintelligence/documentModels/prebuilt-layout/analyzeResults/operation-2', origin);
        operation.searchParams.set('api-version', '2024-11-30');
        return new Response(null, { status: 202, headers: { 'operation-location': operation.toString() } });
      }
      return Response.json({ status: 'running' });
    },
    sleep: async () => {},
  });
  await assert.rejects(
    boundedPoll.analyze({ sourceVersionId, sourceSafety: 'safe', contentType: 'application/pdf', bytes: new Uint8Array([1]) }),
    /AZURE_TEMPORARY/,
  );
  assert.equal(polls, 21);

  const tooManyPages = completedResult();
  tooManyPages.analyzeResult.pages = Array.from({ length: 501 }, (_, index) => ({
    pageNumber: index + 1,
    width: 1,
    height: 1,
    unit: 'inch',
    lines: [],
  }));
  const pageBound = createAzureDocumentIntelligence({
    endpoint: origin,
    apiKey: 'synthetic-key',
    request: async (_input, init) => init?.method === 'POST'
      ? new Response(null, { status: 202, headers: { 'operation-location': `${origin}/documentintelligence/documentModels/prebuilt-layout/analyzeResults/operation-3?api-version=2024-11-30` } })
      : Response.json(tooManyPages),
    sleep: async () => {},
  });
  await assert.rejects(
    pageBound.analyze({ sourceVersionId, sourceSafety: 'safe', contentType: 'application/pdf', bytes: new Uint8Array([1]) }),
    /AZURE_INVALID_RESPONSE/,
  );
});
