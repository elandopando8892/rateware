function editableCells(row, cellSelector) {
  return [...row.querySelectorAll(cellSelector)].filter((cell) => {
    const tableCell = cell.closest("td, th");
    return !cell.disabled && cell.type !== "hidden" && !tableCell?.classList.contains("column-hidden");
  });
}

function visibleRows(container, rowSelector) {
  return [...container.querySelectorAll(rowSelector)];
}

function cellPosition(container, control, rowSelector, cellSelector) {
  const row = control.closest(rowSelector);
  const rows = visibleRows(container, rowSelector);
  const rowIndex = rows.indexOf(row);
  const cells = row ? editableCells(row, cellSelector) : [];
  const columnIndex = cells.indexOf(control);
  return { rows, rowIndex, columnIndex };
}

function focusCell(container, rowSelector, cellSelector, rowIndex, columnIndex) {
  const rows = visibleRows(container, rowSelector);
  const row = rows[rowIndex];
  if (!row) return false;
  const cells = editableCells(row, cellSelector);
  const target = cells[Math.max(0, Math.min(columnIndex, cells.length - 1))];
  if (!target) return false;
  target.focus();
  if (target.select && target.matches('input:not([type="checkbox"])')) target.select();
  return true;
}

function focusFirstCellControl(target, rowSelector, cellSelector) {
  if (target.closest(cellSelector)) return false;
  const tableCell = target.closest("td");
  const row = target.closest(rowSelector);
  if (!tableCell || !row) return false;
  const control = tableCell.querySelector(cellSelector);
  if (!control || control.disabled) return false;
  control.focus();
  if (control.select && control.matches('input:not([type="checkbox"])')) control.select();
  return true;
}

function shouldKeepArrowInsideInput(event, control) {
  if (!control.matches('input:not([type="checkbox"])')) return false;
  const valueLength = String(control.value || "").length;
  const start = control.selectionStart ?? 0;
  const end = control.selectionEnd ?? start;
  if (event.key === "ArrowLeft") return start > 0 || end > start;
  if (event.key === "ArrowRight") return end < valueLength || end > start;
  return false;
}

function parseClipboardGrid(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line, index, lines) => line.length || index < lines.length - 1)
    .map((line) => line.split("\t"));
}

function booleanValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "x", "checked", "si", "sí"].includes(text);
}

function setControlValue(control, value) {
  if (control.matches('input[type="checkbox"]')) {
    control.checked = booleanValue(value);
  } else if (control.tagName === "SELECT") {
    const text = String(value ?? "").trim();
    if (text && ![...control.options].some((option) => option.value === text)) {
      control.add(new Option(text, text));
    }
    control.value = text;
  } else {
    control.value = value ?? "";
  }
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

export function installSpreadsheetGrid({
  container,
  rowSelector,
  cellSelector,
  saveRow,
  onRowsChanged
}) {
  container.addEventListener("click", (event) => {
    focusFirstCellControl(event.target, rowSelector, cellSelector);
  });

  container.addEventListener("focusin", (event) => {
    const control = event.target.closest(cellSelector);
    if (!control) return;
    container.querySelectorAll(".active-sheet-cell").forEach((cell) => cell.classList.remove("active-sheet-cell"));
    control.closest("td")?.classList.add("active-sheet-cell");
  });

  container.addEventListener("focusout", (event) => {
    event.target.closest("td")?.classList.remove("active-sheet-cell");
  });

  container.addEventListener("keydown", async (event) => {
    const control = event.target.closest(cellSelector);
    if (!control) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await saveRow(control.closest(rowSelector));
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (["ArrowLeft", "ArrowRight"].includes(event.key) && shouldKeepArrowInsideInput(event, control)) return;

    const movement = {
      Enter: [event.shiftKey ? -1 : 1, 0],
      Tab: [0, event.shiftKey ? -1 : 1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    }[event.key];

    if (!movement) return;
    const { rowIndex, columnIndex } = cellPosition(container, control, rowSelector, cellSelector);
    if (rowIndex < 0 || columnIndex < 0) return;
    event.preventDefault();
    focusCell(container, rowSelector, cellSelector, rowIndex + movement[0], columnIndex + movement[1]);
  });

  container.addEventListener("paste", (event) => {
    const control = event.target.closest(cellSelector);
    if (!control) return;

    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\t") && !text.includes("\n") && !text.includes("\r")) return;

    const grid = parseClipboardGrid(text);
    if (!grid.length) return;
    event.preventDefault();

    const { rows, rowIndex, columnIndex } = cellPosition(container, control, rowSelector, cellSelector);
    const changedRows = new Set();
    grid.forEach((clipboardRow, rowOffset) => {
      const targetRow = rows[rowIndex + rowOffset];
      if (!targetRow) return;
      const cells = editableCells(targetRow, cellSelector);
      clipboardRow.forEach((value, columnOffset) => {
        const target = cells[columnIndex + columnOffset];
        if (!target) return;
        setControlValue(target, value);
        changedRows.add(targetRow);
      });
    });

    if (changedRows.size) onRowsChanged?.([...changedRows]);
  });
}
