import React, { useState, useCallback, useRef, useEffect } from "react";
import { Trash2, Plus } from "lucide-react";

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

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

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

    // Try to preserve type
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
      // Move to next cell
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
    <div className="overflow-auto flex-1 relative">
      <table className="border-collapse w-full" style={{ minWidth: columns.length * 160 + 100 }}>
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="row-number sticky left-0 z-30">#</th>
            {columns.map((col, i) => {
              const parts = col.split(".");
              return (
                <th key={i} className="grid-header-cell" style={{ minWidth: 140 }}>
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
                return (
              <td
                    key={colIndex}
                    className={`grid-cell ${isEditing ? "grid-cell-editing" : ""} ${getCellTypeColor(row[col])}`}
                    onClick={() => {
                      if (isEditing) return;
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
  );
};

export default JsonSpreadsheet;
