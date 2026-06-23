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
  return target;
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

function controlValue(control) {
  if (control.matches('input[type="checkbox"]')) return control.checked ? "TRUE" : "FALSE";
  return control.value ?? "";
}

function numericControlValue(control) {
  if (control.matches('input[type="checkbox"]')) return null;
  const raw = String(controlValue(control) ?? "").trim();
  if (!raw || raw.includes("/") || raw.includes("\\")) return null;
  if (/rfx|quote|lane/i.test(raw)) return null;
  const cleaned = raw
    .replace(/\b(usd|mxn|cad)\b/gi, "")
    .replace(/[$,\s]/g, "")
    .trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function selectionBounds(container, anchor, focus, rowSelector, cellSelector) {
  const anchorPosition = cellPosition(container, anchor, rowSelector, cellSelector);
  const focusPosition = cellPosition(container, focus, rowSelector, cellSelector);
  if (anchorPosition.rowIndex < 0 || focusPosition.rowIndex < 0 || anchorPosition.columnIndex < 0 || focusPosition.columnIndex < 0) return null;
  return {
    rows: anchorPosition.rows,
    startRow: Math.min(anchorPosition.rowIndex, focusPosition.rowIndex),
    endRow: Math.max(anchorPosition.rowIndex, focusPosition.rowIndex),
    startColumn: Math.min(anchorPosition.columnIndex, focusPosition.columnIndex),
    endColumn: Math.max(anchorPosition.columnIndex, focusPosition.columnIndex)
  };
}

function clearSheetSelection(container) {
  container.querySelectorAll(".selected-sheet-cell").forEach((cell) => cell.classList.remove("selected-sheet-cell"));
}

function selectedControls(container, anchor, focus, rowSelector, cellSelector) {
  const bounds = selectionBounds(container, anchor, focus, rowSelector, cellSelector);
  if (!bounds) return [];
  const matrix = [];
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    const row = bounds.rows[rowIndex];
    const cells = editableCells(row, cellSelector).slice(bounds.startColumn, bounds.endColumn + 1);
    if (cells.length) matrix.push(cells);
  }
  return matrix;
}

function paintSheetSelection(container, anchor, focus, rowSelector, cellSelector) {
  clearSheetSelection(container);
  const matrix = selectedControls(container, anchor, focus, rowSelector, cellSelector);
  matrix.flat().forEach((control) => control.closest("td")?.classList.add("selected-sheet-cell"));
  return matrix;
}

function selectionInfo(matrix) {
  const rowCount = matrix.length;
  const columnCount = matrix[0]?.length || 0;
  const cellCount = matrix.reduce((sum, row) => sum + row.length, 0);
  const numbers = matrix
    .flat()
    .map(numericControlValue)
    .filter((value) => value !== null);
  const numericSum = numbers.reduce((sum, value) => sum + value, 0);
  return {
    rows: rowCount,
    columns: columnCount,
    cells: cellCount,
    isRange: cellCount > 1,
    numeric: {
      count: numbers.length,
      sum: numericSum,
      average: numbers.length ? numericSum / numbers.length : null
    }
  };
}

function selectionToTsv(matrix) {
  return matrix.map((row) => row.map(controlValue).join("\t")).join("\n");
}

async function copySelection(matrix) {
  const text = selectionToTsv(matrix);
  if (!text) return false;
  if (!navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

function fillDownSelection(matrix) {
  if (!matrix.length) return [];
  const source = matrix[0].map(controlValue);
  const changedRows = new Set();
  matrix.slice(1).forEach((row) => {
    row.forEach((control, index) => {
      setControlValue(control, source[index] ?? "");
      changedRows.add(control.closest("tr"));
    });
  });
  return [...changedRows].filter(Boolean);
}

export function installSpreadsheetGrid({
  container,
  rowSelector,
  cellSelector,
  saveRow,
  onRowsChanged,
  onGridMessage,
  onSelectionChange
}) {
  const selection = { anchor: null, focus: null, keyboardSelecting: false };

  function emitSelection(matrix) {
    onSelectionChange?.(selectionInfo(matrix));
  }

  container.addEventListener("click", (event) => {
    focusFirstCellControl(event.target, rowSelector, cellSelector);
  });

  container.addEventListener("focusin", (event) => {
    const control = event.target.closest(cellSelector);
    if (!control) return;
    container.querySelectorAll(".active-sheet-cell").forEach((cell) => cell.classList.remove("active-sheet-cell"));
    control.closest("td")?.classList.add("active-sheet-cell");
    if (!selection.keyboardSelecting) {
      selection.anchor = control;
      selection.focus = control;
      clearSheetSelection(container);
      emitSelection([[control]]);
    }
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

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      const matrix = selectedControls(container, selection.anchor || control, selection.focus || control, rowSelector, cellSelector);
      if (matrix.flat().length > 1) {
        event.preventDefault();
        const copied = await copySelection(matrix);
        onGridMessage?.(copied ? `${matrix.length} row(s) copied.` : "Clipboard copy is not available in this browser.");
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      const matrix = selectedControls(container, selection.anchor || control, selection.focus || control, rowSelector, cellSelector);
      let changedRows = [];
      if (matrix.length > 1) {
        changedRows = fillDownSelection(matrix);
      } else {
        const { rows, rowIndex, columnIndex } = cellPosition(container, control, rowSelector, cellSelector);
        const previousRow = rows[rowIndex - 1];
        const targetRow = rows[rowIndex];
        const source = previousRow ? editableCells(previousRow, cellSelector)[columnIndex] : null;
        const target = targetRow ? editableCells(targetRow, cellSelector)[columnIndex] : null;
        if (source && target) {
          setControlValue(target, controlValue(source));
          changedRows = [targetRow];
        }
      }
      if (changedRows.length) {
        onRowsChanged?.(changedRows);
        onGridMessage?.(`Filled ${changedRows.length} row(s).`);
      }
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
    selection.keyboardSelecting = event.shiftKey;
    const next = focusCell(container, rowSelector, cellSelector, rowIndex + movement[0], columnIndex + movement[1]);
    if (event.shiftKey && next) {
      selection.anchor ||= control;
      selection.focus = next;
      emitSelection(paintSheetSelection(container, selection.anchor, selection.focus, rowSelector, cellSelector));
    } else {
      selection.anchor = next || control;
      selection.focus = next || control;
      clearSheetSelection(container);
      emitSelection([[selection.focus]]);
    }
    window.setTimeout(() => {
      selection.keyboardSelecting = false;
    });
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
    if (changedRows.size) onGridMessage?.(`Pasted ${changedRows.size} row(s).`);
  });
}
