const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";

export const BULK_IMPORT_TEMPLATE_COLUMNS = [
  { key: "row_id", header: "Shipment ID", required: "recommended", example: "SHP-1001", notes: "Customer shipment, lane, load, or quote row identifier." },
  { key: "vendor_domain", header: "Vendor Domain", required: "recommended", example: "tnexpress.net", notes: "Best match when the carrier has a corporate domain." },
  { key: "vendor_name", header: "Vendor Name", required: "recommended", example: "Trans-National Express", notes: "Use legal or commercial name when the carrier uses Gmail, Hotmail, Yahoo, or another generic email domain." },
  { key: "rfx_id", header: "RFx", required: "recommended", example: "RFx-05132601", notes: "Event, bid, RFQ, or quote number." },
  { key: "quote_date", header: "Quote Date", required: "recommended", example: "2026-05-14", notes: "Use YYYY-MM-DD when possible." },
  { key: "origin", header: "Origin", required: "yes", example: "Lerma, EM", notes: "City, state and ZIP if available. Mexico uses metro/state matching; US/CA can use ZIP prefix." },
  { key: "destination", header: "Destination", required: "yes", example: "Canton, MS", notes: "City, state and ZIP if available." },
  { key: "distance", header: "Distance", required: "optional", example: "781", notes: "Loaded miles or kilometers when the source already provides distance." },
  { key: "distance_type", header: "Distance Type", required: "optional", example: "miles", notes: "Use miles, mi, km, or kilometers." },
  { key: "equipment", header: "Equipment", required: "recommended", example: "Truck Trailer", notes: "Equipment catalog value." },
  { key: "trailer", header: "Trailer", required: "recommended", example: "Dry Van", notes: "Trailer catalog value before Hazmat/Reefer flags." },
  { key: "hazmat", header: "Hazmat", required: "optional", example: "No", notes: "Use Yes/No." },
  { key: "temperature_controlled", header: "Temperature Controlled", required: "optional", example: "No", notes: "Use Yes/No for reefer or temperature-controlled freight." },
  { key: "config", header: "Config", required: "recommended", example: "Single", notes: "Single, team, solo, etc." },
  { key: "operation", header: "Operation", required: "recommended", example: "D2D Export", notes: "Use Mexico perspective: MX to US/CA is Export, US/CA to MX is Import." },
  { key: "service", header: "Service", required: "recommended", example: "One Way", notes: "Use Roundtrip only when explicitly quoted as RT/Roundtrip." },
  { key: "driver", header: "Driver", required: "optional", example: "Single", notes: "Driver type when available." },
  { key: "mx_border_crossing_point", header: "MX Border Crossing", required: "optional", example: "Nuevo Laredo, TM", notes: "Border city, not bridge name." },
  { key: "us_border_crossing_point", header: "US Border Crossing", required: "optional", example: "Laredo, TX", notes: "Border city, not bridge name." },
  { key: "mx_linehaul", header: "MX Linehaul", required: "optional", example: "2300", notes: "Only populate when the quote breaks this out." },
  { key: "us_linehaul", header: "US Linehaul", required: "optional", example: "1961.15", notes: "Only populate when the quote breaks this out." },
  { key: "us_miles", header: "US Miles", required: "optional", example: "781", notes: "US leg miles when provided." },
  { key: "fsc", header: "FSC", required: "optional", example: "663.85", notes: "Only populate when the quote breaks this out." },
  { key: "fuel", header: "Fuel", required: "optional", example: "0.85", notes: "Fuel index or surcharge basis when provided." },
  { key: "border_crossing_fee", header: "Border Fee", required: "optional", example: "125", notes: "Only populate when the quote breaks this out." },
  { key: "all_in_rate", header: "All-in Rate", required: "yes", example: "5050", notes: "Numeric only. Do not use Tier 1, Tier 2, Tier 3, X, N/A, or Please Estimate." },
  { key: "currency", header: "Currency", required: "recommended", example: "USD", notes: "USD, MXN, or CAD." },
  { key: "weekly_capacity", header: "Weekly Capacity", required: "optional", example: "2-3", notes: "Carrier stated weekly capacity." },
  { key: "notes", header: "Notes", required: "optional", example: "Carrier response only", notes: "Optional internal context." }
];

const exampleRows = [
  {
    row_id: "SHP-1001",
    vendor_domain: "tnexpress.net",
    vendor_name: "Trans-National Express",
    rfx_id: "RFx-05132601",
    quote_date: "2026-05-14",
    origin: "Lerma, EM",
    destination: "Canton, MS",
    distance: "781",
    distance_type: "miles",
    equipment: "Truck Trailer",
    trailer: "Dry Van",
    hazmat: "No",
    temperature_controlled: "No",
    config: "Single",
    operation: "D2D Export",
    service: "One Way",
    driver: "Single",
    mx_border_crossing_point: "Nuevo Laredo, TM",
    us_border_crossing_point: "Laredo, TX",
    mx_linehaul: "2300",
    us_linehaul: "1961.15",
    us_miles: "781",
    fsc: "663.85",
    fuel: "0.85",
    border_crossing_fee: "125",
    all_in_rate: "5050",
    currency: "USD",
    weekly_capacity: "2-3",
    notes: "Split rate example"
  },
  {
    row_id: "SHP-1002",
    vendor_domain: "",
    vendor_name: "ABC Transportes SA de CV",
    rfx_id: "RFx-04302602",
    quote_date: "2026-05-05",
    origin: "Apodaca, NL",
    destination: "Dallas, TX",
    distance: "",
    distance_type: "",
    equipment: "Truck Trailer",
    trailer: "Flatbed",
    hazmat: "Yes",
    temperature_controlled: "No",
    config: "Single",
    operation: "D2D Export",
    service: "One Way",
    driver: "Single",
    mx_border_crossing_point: "Nuevo Laredo, TM",
    us_border_crossing_point: "Laredo, TX",
    mx_linehaul: "",
    us_linehaul: "",
    us_miles: "",
    fsc: "",
    fuel: "",
    border_crossing_fee: "",
    all_in_rate: "2900",
    currency: "USD",
    weekly_capacity: "1",
    notes: "Generic email carrier matched by vendor name"
  }
];

function rowsFromObjects(rows) {
  return [
    BULK_IMPORT_TEMPLATE_COLUMNS.map((column) => column.header),
    ...rows.map((row) => BULK_IMPORT_TEMPLATE_COLUMNS.map((column) => row[column.key] ?? ""))
  ];
}

function applyColumnWidths(sheet) {
  sheet["!cols"] = BULK_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
    wch: Math.min(Math.max(column.header.length + 4, 14), 26)
  }));
}

function applyAutoFilter(XLSX, sheet) {
  const endColumn = XLSX.utils.encode_col(BULK_IMPORT_TEMPLATE_COLUMNS.length - 1);
  sheet["!autofilter"] = { ref: `A1:${endColumn}1` };
}

export async function downloadBulkImportTemplate() {
  const XLSX = await import(XLSX_MODULE_URL);
  const workbook = XLSX.utils.book_new();

  const rateSheet = XLSX.utils.aoa_to_sheet(rowsFromObjects(exampleRows));
  applyColumnWidths(rateSheet);
  applyAutoFilter(XLSX, rateSheet);
  XLSX.utils.book_append_sheet(workbook, rateSheet, "Rateware Bulk Import");

  const fieldRows = [
    ["Column", "Required", "Example", "Notes"],
    ...BULK_IMPORT_TEMPLATE_COLUMNS.map((column) => [column.header, column.required, column.example, column.notes])
  ];
  const fieldSheet = XLSX.utils.aoa_to_sheet(fieldRows);
  fieldSheet["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 24 }, { wch: 86 }];
  XLSX.utils.book_append_sheet(workbook, fieldSheet, "Field Reference");

  const instructionRows = [
    ["Rateware Bulk Import Template"],
    [""],
    ["Use the first sheet for data. Keep the header row intact."],
    ["Each row becomes one staging row. Review and approve from Staging Review before it enters Rateware."],
    ["Vendor matching priority: corporate domain, exact email, then vendor legal/commercial name."],
    ["For Gmail/Hotmail/Yahoo carriers, leave Vendor Domain blank if needed and provide Vendor Name as legal or commercial name."],
    ["All-in Rate must be numeric. Do not use Tier 1, Tier 2, Tier 3, X, N/A, or Please Estimate."],
    ["Populate MX/US Linehaul, FSC, Border Fee only when the carrier quote breaks those values out. Otherwise use All-in Rate."],
    ["Roundtrip should only be used when RT, Round Trip, Roundtrip, or viaje redondo is explicitly shown."],
    ["Mexico operating perspective: MX to US/CA is D2D Export; US/CA to MX is D2D Import."]
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);
  instructionSheet["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, instructionSheet, "Instructions");

  XLSX.writeFile(workbook, `rateware-bulk-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
