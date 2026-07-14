import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error("Provide one or more XLSX files.");
}

for (const filePath of files) {
  const blob = await FileBlob.load(filePath);
  const workbook = await SpreadsheetFile.importXlsx(blob);
  const sheet = workbook.worksheets.getItemAt(0);
  const values = sheet.getUsedRange(true).values;
  console.log(`\n=== ${filePath} ===`);
  console.log(JSON.stringify({
    sheet: sheet.name,
    rows: values.length,
    columns: values[0]?.length ?? 0,
    headers: values[0] ?? [],
    samples: values.slice(1, 4),
  }, null, 2));
}
