import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { createPostgresIntakePersistence } from './postgres-intake-persistence.ts';

const supplierMailbox = ['ops', 'supplier.example.test'].join('@');

Deno.test('Postgres intake persistence replays a delivery receipt without creating a second case', async () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const receipts = new Map<string, { request_hash: string; response_json: string }>();
  let cases = 0;
  const messageInsertValues: unknown[][] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.raw.join(' ').toLowerCase();
    if (/set local role|set_config|pg_advisory_xact_lock/.test(query)) return [];
    if (/select request_hash, response_json from osp_private\.command_receipts/.test(query)) return receipts.get(`${values[1]}:${values[2]}`) ? [receipts.get(`${values[1]}:${values[2]}`)!] : [];
    if (/select id, case_id, source_sha256, gmail_thread_id from osp_private\.gmail_messages/.test(query)) return [];
    if (/insert into osp_private\.supplier_counterparties/.test(query)) return [{ id: '33333333-3333-4333-8333-333333333333' }];
    if (/insert into osp_private\.customer_registration_cases/.test(query)) { cases += 1; return []; }
    if (/insert into osp_private\.gmail_messages/.test(query)) { messageInsertValues.push(values); return []; }
    if (/insert into osp_private\.gmail_attachments|insert into osp_private\.case_events/.test(query)) return [];
    if (/select id, aggregate_version from osp_private\.customer_registration_cases/.test(query)) return [{ id: values[1], aggregate_version: 0 }];
    if (/select coalesce\(max\(sequence\)/.test(query)) return [{ sequence: 1 }];
    if (/update osp_private\.customer_registration_cases set aggregate_version = aggregate_version \+ 1/.test(query)) return [{ aggregate_version: 1 }];
    if (/insert into osp_private\.command_receipts/.test(query)) { receipts.set(`${values[2]}:${values[3]}`, { request_hash: String(values[4]), response_json: String(values[5]) }); return []; }
    throw new Error(`UNEXPECTED_QUERY:${query}`);
  }, { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const persistence = createPostgresIntakePersistence({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  const input = {
    organizationId,
    deliveryIdempotencyKey: 'delivery-1',
    source: { gmailMessageId: 'message-1', gmailThreadId: 'thread-1', rawMimeKey: `${organizationId}/11111111-1111-4111-8111-111111111111`, rawMimeHash: 'a'.repeat(64), attachments: [], attachmentHashes: [], receivedAt: '2026-08-22T00:00:00.000Z' },
    parsed: { senderDomain: 'xbfreight.com', supplierDomain: 'supplier.example.test', to: [supplierMailbox], cc: ['carriers@xbfreight.com'], subject: 'Supplier registration', safeBody: 'Please complete the application.', applicationReference: 'APP-7', requirementTokens: ['application', 'w9'], attachments: [] },
    blockedByDuplicateReview: false as const,
  };
  const first = await persistence.createCase(input as never);
  const replay = await persistence.createCase({ ...input, source: { ...input.source, rawMimeKey: `${organizationId}/22222222-2222-4222-8222-222222222222` } } as never);
  assertEquals(replay, first);
  await assertRejects(() => persistence.createCase({ ...input, source: { ...input.source, rawMimeHash: 'b'.repeat(64) } } as never), Error, 'IDEMPOTENCY_CONFLICT');
  assertEquals(cases, 1);
  assertEquals(messageInsertValues.length, 1);
  assertEquals(messageInsertValues[0].includes('Supplier registration'), true);
  assertEquals(messageInsertValues[0].includes('Please complete the application.'), true);
  assertEquals(messageInsertValues[0].includes('APP-7'), true);
  assertEquals(messageInsertValues[0].some((value) => Array.isArray(value) && value.includes('application')), true);
});

Deno.test('Postgres exact attachment does not insert a second gmail row for the same source', async () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const receipts = new Map<string, { request_hash: string; response_json: string }>();
  let messageInserts = 0;
  let messageLookupCount = 0;
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.raw.join(' ').toLowerCase();
    if (/set local role|set_config|pg_advisory_xact_lock/.test(query)) return [];
    if (/select request_hash, response_json from osp_private\.command_receipts/.test(query)) return receipts.get(`${values[1]}:${values[2]}`) ? [receipts.get(`${values[1]}:${values[2]}`)!] : [];
    if (/select id, case_id, source_sha256, gmail_thread_id from osp_private\.gmail_messages/.test(query)) {
      messageLookupCount += 1;
      return messageLookupCount === 1 ? [] : [{ id: 'message-row', case_id: '44444444-4444-4444-8444-444444444444', source_sha256: 'a'.repeat(64), gmail_thread_id: 'thread-1' }];
    }
    if (/insert into osp_private\.gmail_messages/.test(query)) { messageInserts += 1; return []; }
    if (/update osp_private\.gmail_messages set duplicate_evidence_json/.test(query)) return [];
    if (/select id, aggregate_version from osp_private\.customer_registration_cases/.test(query)) return [{ id: '44444444-4444-4444-8444-444444444444', aggregate_version: 0 }];
    if (/select coalesce\(max\(sequence\)/.test(query)) return [{ sequence: 1 }];
    if (/update osp_private\.customer_registration_cases set aggregate_version = aggregate_version \+ 1/.test(query)) return [{ aggregate_version: 1 }];
    if (/insert into osp_private\.case_events/.test(query)) return [];
    if (/insert into osp_private\.command_receipts/.test(query)) { receipts.set(`${values[2]}:${values[3]}`, { request_hash: String(values[4]), response_json: String(values[5]) }); return []; }
    throw new Error(`UNEXPECTED_QUERY:${query}`);
  }, { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const persistence = createPostgresIntakePersistence({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  const source = { gmailMessageId: 'message-1', gmailThreadId: 'thread-1', rawMimeKey: `${organizationId}/11111111-1111-4111-8111-111111111111`, rawMimeHash: 'a'.repeat(64), attachments: [], attachmentHashes: [], receivedAt: '2026-08-22T00:00:00.000Z' };
  const parsed = { senderDomain: 'xbfreight.com', supplierDomain: 'supplier.example.test', to: [supplierMailbox], cc: ['carriers@xbfreight.com'], subject: 'Supplier registration', safeBody: 'Body', applicationReference: null, requirementTokens: [], attachments: [] };
  const base = { organizationId, existingCaseId: '44444444-4444-4444-8444-444444444444', source, parsed, evidence: [], };
  await persistence.attachExact({ ...base, deliveryIdempotencyKey: 'delivery-1' } as never);
  await persistence.attachExact({ ...base, deliveryIdempotencyKey: 'delivery-2', source: { ...source, rawMimeKey: `${organizationId}/22222222-2222-4222-8222-222222222222` } } as never);
  assertEquals(messageInserts, 1);
});

Deno.test('Postgres exact replay persists duplicate evidence once and replays the same event', async () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const caseId = '44444444-4444-4444-8444-444444444444';
  const receipts = new Map<string, { request_hash: string; response_json: string }>();
  const eventValues: unknown[][] = [];
  let messageLookups = 0;
  let messageInserts = 0;
  let evidenceUpdates = 0;
  const evidenceUpdateValues: unknown[][] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.raw.join(' ').toLowerCase();
    if (/set local role|set_config|pg_advisory_xact_lock/.test(query)) return [];
    if (/select request_hash, response_json from osp_private\.command_receipts/.test(query)) return receipts.get(`${values[1]}:${values[2]}`) ? [receipts.get(`${values[1]}:${values[2]}`)!] : [];
    if (/select id, case_id, source_sha256, gmail_thread_id from osp_private\.gmail_messages/.test(query)) {
      messageLookups += 1;
      return messageLookups === 1 ? [] : [{ id: 'message-row', case_id: caseId, source_sha256: 'a'.repeat(64), gmail_thread_id: 'thread-1' }];
    }
    if (/insert into osp_private\.gmail_messages/.test(query)) { messageInserts += 1; return []; }
    if (/update osp_private\.gmail_messages set duplicate_evidence_json/.test(query)) { evidenceUpdates += 1; evidenceUpdateValues.push(values); return []; }
    if (/select id, aggregate_version from osp_private\.customer_registration_cases/.test(query)) return [{ id: caseId, aggregate_version: 0 }];
    if (/select coalesce\(max\(sequence\)/.test(query)) return [{ sequence: 1 }];
    if (/update osp_private\.customer_registration_cases set aggregate_version = aggregate_version \+ 1/.test(query)) return [{ aggregate_version: 1 }];
    if (/insert into osp_private\.case_events/.test(query)) { eventValues.push(values); return []; }
    if (/insert into osp_private\.gmail_attachments/.test(query)) return [];
    if (/insert into osp_private\.command_receipts/.test(query)) { receipts.set(`${values[2]}:${values[3]}`, { request_hash: String(values[4]), response_json: String(values[5]) }); return []; }
    throw new Error(`UNEXPECTED_QUERY:${query}`);
  }, { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const persistence = createPostgresIntakePersistence({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  const source = { gmailMessageId: 'message-1', gmailThreadId: 'thread-1', rawMimeKey: `${organizationId}/11111111-1111-4111-8111-111111111111`, rawMimeHash: 'a'.repeat(64), attachments: [], attachmentHashes: [], receivedAt: '2026-08-22T00:00:00.000Z' };
  const parsed = { senderDomain: 'xbfreight.com', supplierDomain: 'supplier.example.test', to: [supplierMailbox], cc: ['carriers@xbfreight.com'], subject: 'Supplier registration', safeBody: 'Body', applicationReference: null, requirementTokens: [], attachments: [] };
  const evidence = [{ kind: 'raw_mime_hash' as const, score: 1, sourceIds: ['message-1', 'message-existing'] }];
  const first = await persistence.attachExact({ organizationId, existingCaseId: caseId, deliveryIdempotencyKey: 'delivery-exact-1', source, parsed, evidence } as never);
  const second = await persistence.attachExact({ organizationId, existingCaseId: caseId, deliveryIdempotencyKey: 'delivery-exact-2', source: { ...source, rawMimeKey: `${organizationId}/22222222-2222-4222-8222-222222222222` }, parsed, evidence } as never);
  const replay = await persistence.attachExact({ organizationId, existingCaseId: caseId, deliveryIdempotencyKey: 'delivery-exact-2', source: { ...source, rawMimeKey: `${organizationId}/33333333-3333-4333-8333-333333333333` }, parsed, evidence } as never);
  assertEquals(second.caseId, caseId);
  assertEquals(second.eventId === first.eventId, false);
  assertEquals(replay, second);
  assertEquals(messageLookups, 2);
  assertEquals(messageInserts, 1);
  assertEquals(evidenceUpdates, 1);
  assertEquals(evidenceUpdateValues[0].some((value) => typeof value === 'string' && value.includes('raw_mime_hash')), true);
  assertEquals(eventValues.length, 2);
  assertEquals(eventValues.every((values) => values.some((value) => typeof value === 'string' && value.includes('raw_mime_hash'))), true);
});

Deno.test('Postgres probable hold appends evidence and advances the case aggregate', async () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const candidateCaseId = '55555555-5555-4555-8555-555555555555';
  const receipts = new Map<string, { request_hash: string; response_json: string }>();
  const eventValues: unknown[][] = [];
  let aggregateUpdates = 0;
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.raw.join(' ').toLowerCase();
    if (/set local role|set_config|pg_advisory_xact_lock/.test(query)) return [];
    if (/select request_hash, response_json from osp_private\.command_receipts/.test(query)) return receipts.get(`${values[1]}:${values[2]}`) ? [receipts.get(`${values[1]}:${values[2]}`)!] : [];
    if (/insert into osp_private\.supplier_counterparties/.test(query)) return [{ id: '33333333-3333-4333-8333-333333333333' }];
    if (/insert into osp_private\.customer_registration_cases/.test(query)) return [];
    if (/select id, case_id, source_sha256, gmail_thread_id from osp_private\.gmail_messages/.test(query)) return [];
    if (/insert into osp_private\.gmail_messages|insert into osp_private\.gmail_attachments|insert into osp_private\.duplicate_candidates/.test(query)) return [];
    if (/select id(?:, aggregate_version)? from osp_private\.customer_registration_cases/.test(query)) return [{ id: 'held-case', aggregate_version: 0 }];
    if (/select coalesce\(max\(sequence\)/.test(query)) return [{ sequence: 1 }];
    if (/update osp_private\.customer_registration_cases set aggregate_version = aggregate_version \+ 1/.test(query)) { aggregateUpdates += 1; return [{ aggregate_version: 1 }]; }
    if (/insert into osp_private\.case_events/.test(query)) { eventValues.push(values); return []; }
    if (/insert into osp_private\.command_receipts/.test(query)) { receipts.set(`${values[2]}:${values[3]}`, { request_hash: String(values[4]), response_json: String(values[5]) }); return []; }
    throw new Error(`UNEXPECTED_QUERY:${query}`);
  }, { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const persistence = createPostgresIntakePersistence({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  const source = { gmailMessageId: 'message-held', gmailThreadId: 'thread-held', rawMimeKey: `${organizationId}/66666666-6666-4666-8666-666666666666`, rawMimeHash: 'c'.repeat(64), attachments: [], attachmentHashes: [], receivedAt: '2026-08-22T00:00:00.000Z' };
  const parsed = { senderDomain: 'xbfreight.com', supplierDomain: 'supplier.example.test', to: [supplierMailbox], cc: [], subject: 'Supplier registration', safeBody: 'Body', applicationReference: null, requirementTokens: [], attachments: [] };
  const evidence = [{ kind: 'thread_ancestry' as const, score: 0.8, sourceIds: ['held-case', candidateCaseId] }];
  const result = await persistence.holdForReview({ organizationId, deliveryIdempotencyKey: 'delivery-hold-1', candidateIds: [candidateCaseId], source, parsed, evidence } as never);
  assertEquals(typeof result.caseId, 'string');
  assertEquals(aggregateUpdates, 1);
  assertEquals(eventValues.length, 1);
  assertEquals(eventValues[0][4], 0);
  assertEquals(eventValues[0].some((value) => typeof value === 'string' && value.includes('thread_ancestry')), true);
});

Deno.test('Postgres duplicate query preserves application reference and requirement tokens', async () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const sql = Object.assign(async (strings: TemplateStringsArray) => {
    const query = strings.raw.join(' ').toLowerCase();
    if (/set local role|set_config/.test(query)) return [];
    if (/select c\.id as case_id/.test(query)) return [{ case_id: '44444444-4444-4444-8444-444444444444', gmail_message_id: 'message-1', raw_mime_hash: 'a'.repeat(64), gmail_thread_id: 'thread-1', supplier_domain: 'supplier.example.test', received_at: '2026-08-22T00:00:00.000Z', attachment_hashes: [], application_reference: 'APP-7', requirement_tokens: ['application', 'w9'] }];
    throw new Error(`UNEXPECTED_QUERY:${query}`);
  }, { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const persistence = createPostgresIntakePersistence({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  const result = await persistence.findDuplicates(organizationId, {} as never);
  assertEquals(result[0].applicationReference, 'APP-7');
  assertEquals(result[0].requirementTokens, ['application', 'w9']);
});

Deno.test('Postgres duplicate review refresh appends evidence once and advances the aggregate on replay', async () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  const caseId = '44444444-4444-4444-8444-444444444444';
  const receipts = new Map<string, { request_hash: string; response_json: string }>();
  const eventValues: unknown[][] = [];
  const eventQueries: string[] = [];
  let aggregateUpdates = 0;
  let duplicateQueries = 0;
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.raw.join(' ').toLowerCase();
    if (/set local role|set_config|pg_advisory_xact_lock/.test(query)) return [];
    if (/select request_hash, response_json from osp_private\.command_receipts/.test(query)) return receipts.get(`${values[1]}:${values[2]}`) ? [receipts.get(`${values[1]}:${values[2]}`)!] : [];
    if (/select c\.id as case_id/.test(query)) {
      duplicateQueries += 1;
      return [
        { case_id: caseId, gmail_message_id: 'message-current', raw_mime_hash: 'a'.repeat(64), gmail_thread_id: 'thread-1', supplier_domain: 'supplier.example.test', received_at: '2026-08-22T00:00:00.000Z', application_reference: null, requirement_tokens: ['w9'], attachment_hashes: [] },
        { case_id: '55555555-5555-4555-8555-555555555555', gmail_message_id: 'message-candidate', raw_mime_hash: 'b'.repeat(64), gmail_thread_id: 'thread-1', supplier_domain: 'supplier.example.test', received_at: '2026-08-22T00:00:00.000Z', application_reference: null, requirement_tokens: ['carrier'], attachment_hashes: [] },
      ];
    }
    if (/insert into osp_private\.duplicate_candidates/.test(query)) return [];
    if (/select id, aggregate_version from osp_private\.customer_registration_cases/.test(query)) return [{ id: caseId, aggregate_version: 4 }];
    if (/select coalesce\(max\(sequence\)/.test(query)) return [{ sequence: 2 }];
    if (/update osp_private\.customer_registration_cases set blocked_by_duplicate_review = true, aggregate_version = aggregate_version \+ 1/.test(query)) { aggregateUpdates += 1; return [{ aggregate_version: 5 }]; }
    if (/insert into osp_private\.case_events/.test(query)) { eventQueries.push(query); eventValues.push(values); return []; }
    if (/insert into osp_private\.command_receipts/.test(query)) { receipts.set(`${values[2]}:${values[3]}`, { request_hash: String(values[4]), response_json: String(values[5]) }); return []; }
    throw new Error(`UNEXPECTED_QUERY:${query}`);
  }, { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const persistence = createPostgresIntakePersistence({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  await persistence.refreshDuplicateReview({ organizationId, caseId, correlationId: 'refresh-job-1' });
  await persistence.refreshDuplicateReview({ organizationId, caseId, correlationId: 'refresh-job-1' });
  assertEquals(duplicateQueries, 1);
  assertEquals(aggregateUpdates, 1);
  assertEquals(eventValues.length, 1);
  assertEquals(eventQueries[0].includes('duplicate_review_refresh'), true);
  assertEquals(eventValues[0].includes('refresh-job-1'), true);
  assertEquals(eventValues[0].some((value) => typeof value === 'string' && value.includes('thread_ancestry')), true);
  const receipt = receipts.get('duplicate_review_refresh:refresh-job-1');
  assertEquals(typeof receipt, 'object');
  assertEquals(JSON.parse(receipt!.response_json).caseId, caseId);
  assertEquals(JSON.parse(receipt!.response_json).eventId, eventValues[0][0]);
});
