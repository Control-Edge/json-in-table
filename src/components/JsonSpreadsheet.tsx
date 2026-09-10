import React, { useState, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Plus, BarChart3, FileSpreadsheet } from "lucide-react";
import SpreadsheetChart from "./SpreadsheetChart";
import JsonExportButton from "./JsonExportButton";
import { downloadFile, escapeCsv } from "@/lib/exportFile";

interface JsonSpreadsheetProps {
  data: Record<string, unknown>[];
  columns: string[];
  onDataChange: (data: Record<string, unknown>[]) => void;
  onColumnsChange: (columns: string[]) => void;
}

const ROW_HEIGHT = 36;
const COLUMN_WIDTH = 160;
const ROW_NUM_WIDTH = 48;
const ACTION_WIDTH = 40;

const formatCellValue = (val: unknown): string => {
  if (val === null) return "null";
  if (val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
};

const getCellTypeColor = (val: unknown): string => {
  if (val === null) return "text-muted-foreground italic";
  if (typeof val === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof val === "boolean") return "text-amber-600 dark:text-amber-400";
  if (typeof val === "object") return "text-purple-600 dark:text-purple-400";
  return "text-foreground";
};

interface SpreadsheetRowProps {
  row: Record<string, unknown>;
  rowIndex: number;
  columns: string[];
  isRowEditing: boolean;
  editingCol: number | null;
  editValue: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onEditValueChange: (v: string) => void;
  onCellMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  onCellMouseEnter: (row: number, col: number, e: React.MouseEvent) => void;
  onStartEdit: (row: number, col: number) => void;
  onCommitEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onDeleteRow: (row: number) => void;
  isCellSelected: (row: number, col: number) => boolean;
}

const SpreadsheetRow: React.FC<SpreadsheetRowProps> = React.memo(({
  row,
  rowIndex,
  columns,
  isRowEditing,
  editingCol,
  editValue,
  inputRef,
  onEditValueChange,
  onCellMouseDown,
  onCellMouseEnter,
  onStartEdit,
  onCommitEdit,
  onKeyDown,
  onDeleteRow,
  isCellSelected,
}) => {
  return (
    <div className="flex group" role="row" style={{ height: ROW_HEIGHT }}>
      <div className="row-number sticky left-0 z-10 flex items-center justify-end" style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH }}>
        {rowIndex + 1}
      </div>
      {columns.map((col, colIndex) => {
        const isEditing = isRowEditing && editingCol === colIndex;
        const selected = isCellSelected(rowIndex, colIndex);
        return (
          <div
            key={colIndex}
            role="cell"
            className={`grid-cell flex items-center ${isEditing ? "grid-cell-editing" : ""} ${selected && !isEditing ? "!bg-primary/20 ring-1 ring-inset ring-primary/40" : ""} ${getCellTypeColor(row[col])}`}
            style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}
            onMouseDown={(e) => {
              if (!isEditing) onCellMouseDown(rowIndex, colIndex, e);
            }}
            onMouseEnter={(e) => onCellMouseEnter(rowIndex, colIndex, e)}
            onDoubleClick={() => {
              if (isRowEditing) onCommitEdit();
              onStartEdit(rowIndex, colIndex);
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                className="w-full bg-transparent outline-none font-mono text-sm text-foreground"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={onKeyDown}
              />
            ) : (
              <span className="block truncate max-w-xs">{formatCellValue(row[col])}</span>
            )}
          </div>
        );
      })}
      <div className="grid-cell" style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH }} />
      <div className="grid-cell flex items-center justify-center" style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH }}>
        <button
          onClick={() => onDeleteRow(rowIndex)}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
          title="Delete row"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});
SpreadsheetRow.displayName = "SpreadsheetRow";

const JsonSpreadsheet: React.FC<JsonSpreadsheetProps> = ({
  data,
  columns,
  onDataChange,
  onColumnsChange,
}) => {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editValueRef = useRef("");
  const editingCellRef = useRef<{ row: number; col: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEditValueChange = useCallback((v: string) => {
    editValueRef.current = v;
    setEditValue(v);
  }, []);

  const setEditingCellBoth = useCallback((cell: { row: number; col: number } | null) => {
    editingCellRef.current = cell;
    setEditingCell(cell);
  }, []);

  // Selection state
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(new Set());
  const [cellRange, setCellRange] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<{ row: number; col: number } | null>(null);
  const [showChart, setShowChart] = useState(false);

  const hasSelection = selectedColumns.size > 0 || cellRange !== null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const clearSelection = useCallback(() => {
    setSelectedColumns(new Set());
    setCellRange(null);
    setRangeAnchor(null);
  }, []);

  const handleColumnHeaderClick = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    setCellRange(null);
    setRangeAnchor(null);

    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        if (next.has(colIndex)) next.delete(colIndex);
        else next.add(colIndex);
      } else {
        if (next.size === 1 && next.has(colIndex)) {
          next.clear();
        } else {
          next.clear();
          next.add(colIndex);
        }
      }
      return next;
    });
  }, []);

  const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.shiftKey && rangeAnchor) {
      // Extend range
      const startRow = Math.min(rangeAnchor.row, row);
      const endRow = Math.max(rangeAnchor.row, row);
      const startCol = Math.min(rangeAnchor.col, col);
      const endCol = Math.max(rangeAnchor.col, col);
      setCellRange({ startRow, endRow, startCol, endCol });
      setSelectedColumns(new Set());
    } else {
      setRangeAnchor({ row, col });
      setCellRange({ startRow: row, endRow: row, startCol: col, endCol: col });
      setSelectedColumns(new Set());
    }
  }, [rangeAnchor]);

  const handleCellMouseEnter = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.buttons === 1 && rangeAnchor && !editingCell) {
      const startRow = Math.min(rangeAnchor.row, row);
      const endRow = Math.max(rangeAnchor.row, row);
      const startCol = Math.min(rangeAnchor.col, col);
      const endCol = Math.max(rangeAnchor.col, col);
      setCellRange({ startRow, endRow, startCol, endCol });
      setSelectedColumns(new Set());
    }
  }, [rangeAnchor, editingCell]);

  const isCellSelected = useCallback((row: number, col: number): boolean => {
    if (selectedColumns.has(col)) return true;
    if (cellRange) {
      return row >= cellRange.startRow && row <= cellRange.endRow && col >= cellRange.startCol && col <= cellRange.endCol;
    }
    return false;
  }, [selectedColumns, cellRange]);

  const startEdit = useCallback((row: number, col: number) => {
    const key = columns[col];
    const val = data[row]?.[key];
    const initial = val === null || val === undefined ? "" : String(val);
    setEditingCellBoth({ row, col });
    editValueRef.current = initial;
    setEditValue(initial);
  }, [columns, data, setEditingCellBoth]);

  // Reads current row/col and edit text from refs so this stays referentially
  // stable across keystrokes, letting SpreadsheetRow's memoization actually work.
  const commitEdit = useCallback(() => {
    const current = editingCellRef.current;
    if (!current) return;
    const { row, col } = current;
    const key = columns[col];
    const text = editValueRef.current;

    let parsed: unknown = text;
    if (text === "") parsed = "";
    else if (text === "null") parsed = null;
    else if (text === "true") parsed = true;
    else if (text === "false") parsed = false;
    else if (!isNaN(Number(text)) && text.trim() !== "") parsed = Number(text);

    const newData = [...data];
    const newRow = { ...newData[row] };
    newRow[key] = parsed;
    newData[row] = newRow;
    onDataChange(newData);
    setEditingCellBoth(null);
  }, [columns, data, onDataChange, setEditingCellBoth]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingCell) return;
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const current = editingCell;
      commitEdit();
      if (e.key === "Tab") {
        const nextCol = e.shiftKey ? current.col - 1 : current.col + 1;
        if (nextCol >= 0 && nextCol < columns.length) {
          setTimeout(() => startEdit(current.row, nextCol), 0);
        } else if (!e.shiftKey && current.row + 1 < data.length) {
          setTimeout(() => startEdit(current.row + 1, 0), 0);
        }
      } else {
        const nextRow = e.shiftKey ? current.row - 1 : current.row + 1;
        if (nextRow >= 0 && nextRow < data.length) {
          setTimeout(() => startEdit(nextRow, current.col), 0);
        }
      }
    } else if (e.key === "Escape") {
      setEditingCellBoth(null);
    }
  }, [editingCell, commitEdit, startEdit, columns.length, data.length, setEditingCellBoth]);

  const addRow = useCallback(() => {
    const emptyRow: Record<string, unknown> = {};
    columns.forEach((col) => (emptyRow[col] = ""));
    onDataChange([...data, emptyRow]);
  }, [columns, data, onDataChange]);

  const deleteRow = useCallback((rowIndex: number) => {
    onDataChange(data.filter((_, i) => i !== rowIndex));
  }, [data, onDataChange]);

  const addColumn = useCallback(() => {
    const name = `column_${columns.length + 1}`;
    onColumnsChange([...columns, name]);
    onDataChange(data.map((row) => ({ ...row, [name]: "" })));
  }, [columns, data, onColumnsChange, onDataChange]);

  const exportCsv = useCallback(() => {
    const lines = [
      columns.map(escapeCsv).join(","),
      ...data.map((row) => columns.map((col) => escapeCsv(formatCellValue(row[col]))).join(",")),
    ];
    downloadFile(lines.join("\n"), "table-export.csv", "text/csv");
  }, [columns, data]);

  const exportJsonAsArray = useCallback(() => {
    const jsonData = data.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col) => { obj[col] = row[col] ?? null; });
      return obj;
    });
    downloadFile(JSON.stringify(jsonData, null, 2), "table-export.json", "application/json");
  }, [columns, data]);

  const exportJsonAsObject = useCallback(() => {
    const jsonData: Record<string, unknown[]> = {};
    columns.forEach((col) => { jsonData[col] = data.map((row) => row[col] ?? null); });
    downloadFile(JSON.stringify(jsonData, null, 2), "table-export.json", "application/json");
  }, [columns, data]);

  const totalWidth = ROW_NUM_WIDTH + columns.length * COLUMN_WIDTH + ACTION_WIDTH * 2;

  const virtualItems = rowVirtualizer.getVirtualItems();

  if (data.length === 0 && columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No data loaded. Paste or upload a JSON to get started.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Export toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-card shrink-0 justify-end" style={{ borderColor: "hsl(var(--grid-line))" }}>
        <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
          <FileSpreadsheet size={13} /> CSV
        </button>
        <JsonExportButton onExportArray={exportJsonAsArray} onExportObject={exportJsonAsObject} />
      </div>

      {/* Selection toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0" style={{ borderColor: "hsl(var(--grid-line))" }}>
          <span className="text-xs text-muted-foreground">
            {selectedColumns.size > 0
              ? `${selectedColumns.size} column(s) selected`
              : cellRange
                ? `${cellRange.endRow - cellRange.startRow + 1}×${cellRange.endCol - cellRange.startCol + 1} cells selected`
                : ""}
          </span>
          <button
            onClick={() => setShowChart(!showChart)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <BarChart3 size={13} /> {showChart ? "Hide Chart" : "Show Chart"}
          </button>
          <button
            onClick={() => { clearSelection(); setShowChart(false); }}
            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Spreadsheet */}
      <div className="overflow-auto flex-1 relative" ref={scrollRef}>
        <div style={{ width: totalWidth, minWidth: totalWidth }} role="table">
          {/* Header */}
          <div className="flex sticky top-0 z-20" role="row">
            <div className="row-number sticky left-0 z-30 flex items-center justify-end" style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH }}>
              #
            </div>
            {columns.map((col, i) => {
              const isSelected = selectedColumns.has(i);
              const parts = col.split(".");
              return (
                <div
                  role="columnheader"
                  key={i}
                  className={`grid-header-cell flex items-center cursor-pointer select-none ${isSelected ? "!bg-primary/15 !text-primary" : ""}`}
                  style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}
                  onClick={(e) => handleColumnHeaderClick(i, e)}
                >
                  {parts.length > 1 ? (
                    <span className="flex items-center gap-0.5 truncate">
                      <span className="text-muted-foreground/50">{parts.slice(0, -1).join(".")}.</span>
                      <span>{parts[parts.length - 1]}</span>
                    </span>
                  ) : <span className="truncate">{col}</span>}
                </div>
              );
            })}
            <div className="grid-header-cell flex items-center justify-center" style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH }}>
              <button
                onClick={addColumn}
                className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title="Add column"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="grid-header-cell" style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH }} />
          </div>

          {/* Virtualized body */}
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }} role="rowgroup">
            {virtualItems.map((virtualRow) => {
              const row = data[virtualRow.index];
              const isRowEditing = editingCell?.row === virtualRow.index;
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <SpreadsheetRow
                    row={row}
                    rowIndex={virtualRow.index}
                    columns={columns}
                    isRowEditing={isRowEditing}
                    editingCol={isRowEditing ? editingCell!.col : null}
                    editValue={isRowEditing ? editValue : ""}
                    inputRef={inputRef}
                    onEditValueChange={handleEditValueChange}
                    onCellMouseDown={handleCellMouseDown}
                    onCellMouseEnter={handleCellMouseEnter}
                    onStartEdit={startEdit}
                    onCommitEdit={commitEdit}
                    onKeyDown={handleKeyDown}
                    onDeleteRow={deleteRow}
                    isCellSelected={isCellSelected}
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-primary transition-colors border-b w-full"
            style={{ borderColor: "hsl(var(--grid-line))" }}
          >
            <Plus size={14} /> Add Row
          </button>
        </div>
      </div>

      {/* Chart */}
      {showChart && hasSelection && (
        <SpreadsheetChart
          data={data}
          columns={columns}
          selectedColumns={selectedColumns}
          cellRange={cellRange}
          onClose={() => setShowChart(false)}
          onValueChange={(rowIndex, column, value) => {
            const newData = [...data];
            newData[rowIndex] = { ...newData[rowIndex], [column]: value };
            onDataChange(newData);
          }}
        />
      )}
    </div>
  );
};

export default JsonSpreadsheet;
