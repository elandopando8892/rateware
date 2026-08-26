import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import { parseXlsxStructure } from './xlsx-structure.ts';

const sourceVersionId = '11111111-1111-4111-8111-111111111111';

Deno.test('XLSX adapter preserves typed cells, inert formulas, merges, and coordinates', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Registration');
  sheet.getCell('A1').value = 'Supplier';
  sheet.getCell('B2').value = 42;
  sheet.getCell('C3').value = { formula: 'B2*2', result: 84 };
  sheet.mergeCells('D4:E4');
  sheet.getCell('D4').value = 'Merged';
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const parsed = await parseXlsxStructure({ sourceVersionId, bytes });
  assert.deepEqual(parsed.sheets[0].mergedRanges, ['D4:E4']);
  assert.deepEqual(parsed.sheets[0].cells.map((cell) => ({ address: cell.address, kind: cell.kind, value: cell.value })), [
    { address: 'A1', kind: 'string', value: 'Supplier' },
    { address: 'B2', kind: 'number', value: 42 },
    { address: 'C3', kind: 'formula', value: 'B2*2' },
    { address: 'D4', kind: 'string', value: 'Merged' },
  ]);
  assert.equal(parsed.evidence.every((item) => item.locator.sourceVersionId === sourceVersionId), true);
  assert.equal(parsed.evidence.find((item) => item.locator.cellRange === 'C3')?.content, 'FORMULA:B2*2');
});

Deno.test('XLSX adapter rejects corrupt and oversized sources', async () => {
  await assert.rejects(parseXlsxStructure({ sourceVersionId, bytes: new Uint8Array([1, 2, 3]) }), /XLSX_INVALID/);
  await assert.rejects(parseXlsxStructure({ sourceVersionId, bytes: new Uint8Array(25 * 1024 * 1024 + 1) }), /DOCUMENT_SIZE_INVALID/);
});
