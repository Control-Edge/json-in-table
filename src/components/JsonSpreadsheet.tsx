import React, { useState, useCallback, useRef, useEffect } from "react";
import { Trash2, Plus, BarChart3 } from "lucide-react";
import SpreadsheetChart from "./SpreadsheetChart";

interface JsonSpreadsheetProps {
  data: Record<string, unknown>[];
  columns: string[];
  onDataChange: (data: Record<string, unknown>[]) => void;
  onColumnsChange: (columns: string[]) => void;
}

const JsonSpreadsheet: React.FC<JsonSpreadsheetProps> = ({
  data,
  columns,
  onDataChange,
  onColumnsChange,
}) => {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Selection state
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(new Set());
  const [cellRange, setCellRange] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<{ row: number; col: number } | null>(null);
  const [showChart, setShowChart] = useState(false);

  const hasSelection = selectedColumns.size > 0 || cellRange !== null;

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
    setEditingCell({ row, col });
    setEditValue(val === null || val === undefined ? "" : String(val));
  }, [columns, data]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    const key = columns[col];
    const newData = [...data];
    const newRow = { ...newData[row] };

    let parsed: unknown = editValue;
    if (editValue === "") parsed = "";
    else if (editValue === "null") parsed = null;
    else if (editValue === "true") parsed = true;
    else if (editValue === "false") parsed = false;
    else if (!isNaN(Number(editValue)) && editValue.trim() !== "") parsed = Number(editValue);

    newRow[key] = parsed;
    newData[row] = newRow;
    onDataChange(newData);
    setEditingCell(null);
  }, [editingCell, editValue, columns, data, onDataChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingCell) return;
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      if (e.key === "Tab") {
        const nextCol = e.shiftKey ? editingCell.col - 1 : editingCell.col + 1;
        if (nextCol >= 0 && nextCol < columns.length) {
          setTimeout(() => startEdit(editingCell.row, nextCol), 0);
        } else if (!e.shiftKey && editingCell.row + 1 < data.length) {
          setTimeout(() => startEdit(editingCell.row + 1, 0), 0);
        }
      } else {
        const nextRow = e.shiftKey ? editingCell.row - 1 : editingCell.row + 1;
        if (nextRow >= 0 && nextRow < data.length) {
          setTimeout(() => startEdit(nextRow, editingCell.col), 0);
        }
      }
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  }, [editingCell, commitEdit, startEdit, columns.length, data.length]);

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

  if (data.length === 0 && columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No data loaded. Paste or upload a JSON to get started.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
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
      <div className="overflow-auto flex-1 relative">
        <table className="border-collapse w-full" style={{ minWidth: columns.length * 160 + 100 }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="row-number sticky left-0 z-30">#</th>
              {columns.map((col, i) => {
                const isSelected = selectedColumns.has(i);
                const parts = col.split(".");
                return (
                  <th
                    key={i}
                    className={`grid-header-cell cursor-pointer select-none ${isSelected ? "!bg-primary/15 !text-primary" : ""}`}
                    style={{ minWidth: 140 }}
                    onClick={(e) => handleColumnHeaderClick(i, e)}
                  >
                    {parts.length > 1 ? (
                      <span className="flex items-center gap-0.5">
                        <span className="text-muted-foreground/50">{parts.slice(0, -1).join(".")}.</span>
                        <span>{parts[parts.length - 1]}</span>
                      </span>
                    ) : col}
                  </th>
                );
              })}
              <th className="grid-header-cell w-10">
                <button
                  onClick={addColumn}
                  className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                  title="Add column"
                >
                  <Plus size={14} />
                </button>
              </th>
              <th className="grid-header-cell w-10" />
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="group">
                <td className="row-number sticky left-0 z-10">{rowIndex + 1}</td>
                {columns.map((col, colIndex) => {
                  const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                  const selected = isCellSelected(rowIndex, colIndex);
                  return (
                    <td
                      key={colIndex}
                      className={`grid-cell ${isEditing ? "grid-cell-editing" : ""} ${selected && !isEditing ? "!bg-primary/8" : ""} ${getCellTypeColor(row[col])}`}
                      onMouseDown={(e) => {
                        if (!isEditing) handleCellMouseDown(rowIndex, colIndex, e);
                      }}
                      onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e)}
                      onDoubleClick={() => {
                        if (editingCell) commitEdit();
                        startEdit(rowIndex, colIndex);
                      }}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="w-full bg-transparent outline-none font-mono text-sm text-foreground"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <span className="block truncate max-w-xs">
                          {formatCellValue(row[col])}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="grid-cell w-10" />
                <td className="grid-cell w-10">
                  <button
                    onClick={() => deleteRow(rowIndex)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                    title="Delete row"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-primary transition-colors border-b w-full"
          style={{ borderColor: "hsl(var(--grid-line))" }}
        >
          <Plus size={14} /> Add Row
        </button>
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
