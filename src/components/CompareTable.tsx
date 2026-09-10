import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X, FileSpreadsheet, CodeXml, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, EyeOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import JsonExportButton from "./JsonExportButton";
import { downloadFile, escapeCsv } from "@/lib/exportFile";
import { rowsToXml } from "@/lib/xml";

interface CompareTableProps {
  data: unknown;
  selectedPaths: string[];
  onRemovePath: (path: string) => void;
  onDataChange: (data: unknown) => void;
}

const getAtPath = (obj: unknown, pathStr: string): unknown => {
  if (!pathStr) return obj;
  const segments = pathStr.split(".");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
};

const setAtPath = (obj: unknown, pathStr: string, value: unknown): unknown => {
  if (!pathStr) return value;
  const segments = pathStr.split(".");
  const clone = (o: unknown): unknown => {
    if (Array.isArray(o)) return [...o];
    if (o !== null && typeof o === "object") return { ...(o as Record<string, unknown>) };
    return o;
  };
  const root = clone(obj);
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const child = clone((current as Record<string, unknown>)[seg]);
    (current as Record<string, unknown>)[seg] = child;
    current = child;
  }
  (current as Record<string, unknown>)[segments[segments.length - 1]] = value;
  return root;
};

const formatValue = (val: unknown): string => {
  if (val === undefined) return "—";
  if (val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
};

const getTypeColor = (val: unknown): string => {
  if (val === undefined) return "text-muted-foreground/40";
  if (val === null) return "text-muted-foreground italic";
  if (typeof val === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof val === "boolean") return "text-amber-600 dark:text-amber-400";
  if (typeof val === "string") return "text-emerald-600 dark:text-emerald-400";
  return "text-foreground";
};

const flattenObject = (
  obj: unknown,
  prefix = "",
  result: Record<string, unknown> = {}
): Record<string, unknown> => {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const key = prefix ? `${prefix}.${index}` : String(index);
      if (item !== null && typeof item === "object") {
        flattenObject(item, key, result);
      } else {
        result[key] = item;
      }
    });
  } else if (obj !== null && typeof obj === "object") {
    for (const k in obj as Record<string, unknown>) {
      const key = prefix ? `${prefix}.${k}` : k;
      const v = (obj as Record<string, unknown>)[k];
      if (v !== null && typeof v === "object") {
        flattenObject(v, key, result);
      } else {
        result[key] = v;
      }
    }
  } else {
    result[prefix] = obj;
  }
  return result;
};

const parseInput = (text: string): unknown => {
  if (text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (!isNaN(Number(text)) && text.trim() !== "") return Number(text);
  return text;
};

/** Cell display strings use "—" for missing/undefined and "null" for null; CSV has no such
 * sentinel, so both should become an empty cell rather than exporting the placeholder text. */
const csvCellValue = (display: string): string => (display === "—" || display === "null" ? "" : display);

/** Inline editable cell */
const EditableCell: React.FC<{
  value: unknown;
  onCommit: (val: unknown) => void;
}> = ({ value, onCommit }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    setText(value === null ? "null" : value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));
    setEditing(true);
  };

  const commit = () => {
    onCommit(parseInput(text));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        className="w-full bg-transparent outline-none font-mono text-sm text-foreground"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className={`block truncate max-w-xs font-mono text-sm select-none ${getTypeColor(value)}`}
      onDoubleClick={startEdit}
    >
      {formatValue(value)}
    </span>
  );
};

/** Build { headers, rows } from current table state for export */
const useTableData = (data: unknown, selectedPaths: string[]) => {
  return useMemo(() => {
    const arrayPaths: string[] = [];
    const otherPaths: string[] = [];
    for (const p of selectedPaths) {
      const val = getAtPath(data, p);
      if (Array.isArray(val)) arrayPaths.push(p);
      else otherPaths.push(p);
    }

    if (arrayPaths.length > 0) {
      const primaryPath = arrayPaths[0];
      const primaryArray = getAtPath(data, primaryPath) as unknown[];
      const colSet = new Set<string>();
      primaryArray.forEach((item) => {
        if (item !== null && typeof item === "object") {
          Object.keys(flattenObject(item)).forEach((k) => colSet.add(k));
        } else colSet.add("value");
      });
      const columns = Array.from(colSet);
      // Use full path for column titles

      const extraArrays = arrayPaths.slice(1).map((p) => ({
        path: p, data: getAtPath(data, p) as unknown[],
      }));
      const extraColSets: Map<string, string[]> = new Map();
      extraArrays.forEach(({ path, data: arr }) => {
        const cs = new Set<string>();
        arr.forEach((item) => {
          if (item !== null && typeof item === "object") Object.keys(flattenObject(item)).forEach((k) => cs.add(k));
          else cs.add("value");
        });
        extraColSets.set(path, Array.from(cs));
      });

      const headers: string[] = [
        ...columns.map((c) => `${primaryPath}.${c}`),
        ...extraArrays.flatMap(({ path }) => (extraColSets.get(path) || []).map((c) => `${path}.${c}`)),
        ...otherPaths,
      ];

      const maxRows = Math.max(primaryArray.length, ...extraArrays.map((e) => e.data.length));
      const rows: string[][] = [];
      for (let i = 0; i < maxRows; i++) {
        const row: string[] = [];
        const pItem = primaryArray[i];
        const pFlat = pItem !== null && typeof pItem === "object" ? flattenObject(pItem) : pItem !== undefined ? { value: pItem } : {};
        columns.forEach((col) => row.push(formatValue((pFlat as Record<string, unknown>)[col])));
        extraArrays.forEach(({ path, data: arr }) => {
          const item = arr[i];
          const flat = item !== null && typeof item === "object" ? flattenObject(item) : item !== undefined ? { value: item } : {};
          (extraColSets.get(path) || []).forEach((col) => row.push(formatValue((flat as Record<string, unknown>)[col])));
        });
        otherPaths.forEach((p) => row.push(formatValue(getAtPath(data, p))));
        rows.push(row);
      }
      return { headers, rows };
    }

    // Non-array mode
    const resolvedColumns: { header: string; fullPath: string }[] = [];
    for (const p of selectedPaths) {
      const val = getAtPath(data, p);
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        const flat = flattenObject(val);
        for (const subKey of Object.keys(flat)) resolvedColumns.push({ header: `${p}.${subKey}`, fullPath: `${p}.${subKey}` });
      } else resolvedColumns.push({ header: p, fullPath: p });
    }
    return {
      headers: resolvedColumns.map((c) => c.header),
      rows: [resolvedColumns.map((c) => formatValue(getAtPath(data, c.fullPath)))],
    };
  }, [data, selectedPaths]);
};

type SortDir = "asc" | "desc";

const compareValues = (a: unknown, b: unknown): number => {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

interface ColumnDef {
  key: string;
  label: string;
  group?: string;
  getValue: (rowIndex: number) => unknown;
  getEditPath?: (rowIndex: number) => string;
}

const ROW_HEIGHT = 36;
const COLUMN_WIDTH = 160;
const ROW_NUM_WIDTH = 48;

const CompareRow: React.FC<{
  rowIndex: number;
  columns: ColumnDef[];
  onCellEdit: (fullPath: string, value: unknown) => void;
}> = React.memo(({ rowIndex, columns, onCellEdit }) => {
  return (
    <div className="flex group" role="row" style={{ height: ROW_HEIGHT }}>
      <div className="row-number sticky left-0 z-10 flex items-center justify-end" style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH }}>
        {rowIndex}
      </div>
      {columns.map((c) => (
        <div key={c.key} role="cell" className="grid-cell flex items-center" style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}>
          <EditableCell value={c.getValue(rowIndex)} onCommit={(v) => onCellEdit(c.getEditPath!(rowIndex), v)} />
        </div>
      ))}
    </div>
  );
});
CompareRow.displayName = "CompareRow";

const SortIcon: React.FC<{ dir: SortDir | null }> = ({ dir }) => {
  if (dir === "asc") return <ArrowUp size={12} />;
  if (dir === "desc") return <ArrowDown size={12} />;
  return <ArrowUpDown size={12} className="opacity-30 group-hover/th:opacity-70" />;
};

const CompareTable: React.FC<CompareTableProps> = ({ data, selectedPaths, onRemovePath, onDataChange }) => {
  const handleCellEdit = useCallback((fullPath: string, newValue: unknown) => {
    onDataChange(setAtPath(data, fullPath, newValue));
  }, [data, onDataChange]);

  const tableData = useTableData(data, selectedPaths);

  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  const toggleColumnVisibility = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }, []);

  const exportCsv = useCallback(() => {
    const { headers, rows } = tableData;
    const lines = [
      headers.map(escapeCsv).join(","),
      ...rows.map((r) => r.map((v) => escapeCsv(csvCellValue(v))).join(",")),
    ];
    downloadFile(lines.join("\n"), "fields-export.csv", "text/csv");
  }, [tableData]);

  const exportXml = useCallback(() => {
    const { headers, rows } = tableData;
    const objects = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = row[i] === "—" ? null : parseInput(row[i]); });
      return obj;
    });
    downloadFile(rowsToXml(headers, objects), "fields-export.xml", "application/xml");
  }, [tableData]);

  const exportJsonAsArray = useCallback(() => {
    const { headers, rows } = tableData;
    const jsonData = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = row[i] === "—" ? null : parseInput(row[i]); });
      return obj;
    });
    downloadFile(JSON.stringify(jsonData, null, 2), "fields-export.json", "application/json");
  }, [tableData]);

  const exportJsonAsObject = useCallback(() => {
    const { headers, rows } = tableData;
    const jsonData: Record<string, unknown[]> = {};
    headers.forEach((h) => { jsonData[h] = []; });
    rows.forEach((row) => {
      headers.forEach((h, i) => { jsonData[h].push(row[i] === "—" ? null : parseInput(row[i])); });
    });
    downloadFile(JSON.stringify(jsonData, null, 2), "fields-export.json", "application/json");
  }, [tableData]);

  // Row count for the virtualizer — must be computed unconditionally since hooks
  // can't be called from inside the array-mode branch below.
  const maxRows = useMemo(() => {
    const arrayPaths = selectedPaths.filter((p) => Array.isArray(getAtPath(data, p)));
    if (arrayPaths.length === 0) return 0;
    return Math.max(...arrayPaths.map((p) => (getAtPath(data, p) as unknown[]).length));
  }, [data, selectedPaths]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: maxRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (selectedPaths.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        Select fields from the tree to view them as table columns.
      </div>
    );
  }

  const arrayPaths: string[] = [];
  const otherPaths: string[] = [];

  for (const p of selectedPaths) {
    const val = getAtPath(data, p);
    if (Array.isArray(val)) {
      arrayPaths.push(p);
    } else {
      otherPaths.push(p);
    }
  }


  if (arrayPaths.length > 0) {
    const primaryPath = arrayPaths[0];
    const primaryArray = getAtPath(data, primaryPath) as unknown[];

    const colSet = new Set<string>();
    primaryArray.forEach((item) => {
      if (item !== null && typeof item === "object") {
        Object.keys(flattenObject(item)).forEach((k) => colSet.add(k));
      } else {
        colSet.add("value");
      }
    });
    const columns = Array.from(colSet);

    const extraArrays = arrayPaths.slice(1).map((p) => ({
      path: p,
      data: getAtPath(data, p) as unknown[],
    }));

    const extraColSets: Map<string, Set<string>> = new Map();
    extraArrays.forEach(({ path, data: arr }) => {
      const cs = new Set<string>();
      arr.forEach((item) => {
        if (item !== null && typeof item === "object") {
          Object.keys(flattenObject(item)).forEach((k) => cs.add(k));
        } else {
          cs.add("value");
        }
      });
      extraColSets.set(path, cs);
    });

    // Unified column model across the primary array, extra arrays, and scalar paths
    const allColumns: ColumnDef[] = [
      ...columns.map((col) => ({
        key: `${primaryPath}.${col}`,
        label: `${primaryPath}.${col}`,
        group: primaryPath,
        getValue: (rowIndex: number) => {
          const item = primaryArray[rowIndex];
          const flat = item !== null && typeof item === "object" ? flattenObject(item) : item !== undefined ? { value: item } : {};
          return (flat as Record<string, unknown>)[col];
        },
        getEditPath: (rowIndex: number) => `${primaryPath}.${rowIndex}.${col}`,
      })),
      ...extraArrays.flatMap(({ path, data: arr }) =>
        Array.from(extraColSets.get(path) || []).map((col) => ({
          key: `${path}.${col}`,
          label: `${path}.${col}`,
          group: path,
          getValue: (rowIndex: number) => {
            const item = arr[rowIndex];
            const flat = item !== null && typeof item === "object" ? flattenObject(item) : item !== undefined ? { value: item } : {};
            return (flat as Record<string, unknown>)[col];
          },
          getEditPath: (rowIndex: number) => `${path}.${rowIndex}.${col}`,
        }))
      ),
      ...otherPaths.map((p) => ({
        key: p,
        label: p,
        getValue: () => getAtPath(data, p),
        getEditPath: () => p,
      })),
    ];

    const visibleColumns = allColumns.filter((c) => !hiddenColumns.has(c.key));

    const rowOrder = Array.from({ length: maxRows }, (_, i) => i);
    if (sort) {
      const sortCol = allColumns.find((c) => c.key === sort.key);
      if (sortCol) {
        rowOrder.sort((a, b) => {
          const cmp = compareValues(sortCol.getValue(a), sortCol.getValue(b));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }

    const groupVisibleCount = (group: string) => visibleColumns.filter((c) => c.group === group).length;
    const otherVisibleCount = visibleColumns.filter((c) => !c.group).length;
    const totalWidth = ROW_NUM_WIDTH + visibleColumns.length * COLUMN_WIDTH;
    const HEADER1_HEIGHT = 34;
    const HEADER2_HEIGHT = 26;
    const virtualItems = rowVirtualizer.getVirtualItems();

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card shrink-0 justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
                <SlidersHorizontal size={13} /> Columns{hiddenColumns.size > 0 ? ` (${hiddenColumns.size} hidden)` : ""}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
              <DropdownMenuLabel className="text-xs">Show / hide columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allColumns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hiddenColumns.has(c.key)}
                  onCheckedChange={() => toggleColumnVisibility(c.key)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs font-mono"
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button onClick={exportXml} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
            <CodeXml size={13} /> XML
          </button>
          <JsonExportButton onExportArray={exportJsonAsArray} onExportObject={exportJsonAsObject} />
        </div>
        <div className="overflow-auto flex-1 relative" ref={scrollRef}>
          <div style={{ width: totalWidth, minWidth: totalWidth }} role="table">
            {/* Header row 1: column labels */}
            <div className="flex sticky z-20" style={{ top: 0 }} role="row">
              <div className="grid-header-cell sticky left-0 z-30 flex items-center justify-end" style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH, height: HEADER1_HEIGHT }}>
                #
              </div>
              {visibleColumns.map((c) => (
                <div key={c.key} role="columnheader" className="grid-header-cell group/th flex items-center" style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH, height: HEADER1_HEIGHT }}>
                  <div className="flex items-center gap-1 w-full">
                    <button
                      className="flex items-center gap-1 min-w-0 flex-1 text-left"
                      onClick={() => handleSort(c.key)}
                      title={`Sort by ${c.label}`}
                    >
                      <span className="truncate text-xs font-mono" title={c.label}>{c.label}</span>
                      <SortIcon dir={sort?.key === c.key ? sort.dir : null} />
                    </button>
                    <button
                      onClick={() => toggleColumnVisibility(c.key)}
                      className="p-0.5 rounded hover:bg-secondary text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                      title="Hide column"
                    >
                      <EyeOff size={12} />
                    </button>
                    {!c.group && (
                      <button
                        onClick={() => onRemovePath(c.key)}
                        className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Header row 2: group labels */}
            <div className="flex sticky z-20" style={{ top: HEADER1_HEIGHT }} role="row">
              <div className="grid-header-cell sticky left-0 z-30" style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH, height: HEADER2_HEIGHT }} />
              {arrayPaths.map((p) => {
                const colCount = groupVisibleCount(p);
                if (colCount === 0) return null;
                return (
                  <div key={p} className="grid-header-cell !py-1 flex items-center justify-center" style={{ width: colCount * COLUMN_WIDTH, minWidth: colCount * COLUMN_WIDTH, height: HEADER2_HEIGHT }}>
                    <div className="flex items-center gap-1 justify-center">
                      <span className="text-[10px] text-muted-foreground/60 font-mono">{p}</span>
                      <button
                        onClick={() => onRemovePath(p)}
                        className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {otherVisibleCount > 0 && (
                <div className="grid-header-cell !py-1" style={{ width: otherVisibleCount * COLUMN_WIDTH, minWidth: otherVisibleCount * COLUMN_WIDTH, height: HEADER2_HEIGHT }} />
              )}
            </div>

            {/* Virtualized body */}
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }} role="rowgroup">
              {virtualItems.map((virtualRow) => {
                const rowIndex = rowOrder[virtualRow.index];
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
                    <CompareRow rowIndex={rowIndex} columns={visibleColumns} onCellEdit={handleCellEdit} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No arrays — object/leaf mode
  const resolvedColumns: { header: string; sourcePath: string; fullPath: string }[] = [];

  for (const p of selectedPaths) {
    const val = getAtPath(data, p);
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const flat = flattenObject(val);
      for (const subKey of Object.keys(flat)) {
        const shortP = p.split(".").pop() || p;
        resolvedColumns.push({
          header: `${shortP}.${subKey}`,
          sourcePath: p,
          fullPath: `${p}.${subKey}`,
        });
      }
    } else {
      resolvedColumns.push({
        header: p,
        sourcePath: p,
        fullPath: p,
      });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card shrink-0 justify-end">
        <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
          <FileSpreadsheet size={13} /> CSV
        </button>
        <button onClick={exportXml} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
          <CodeXml size={13} /> XML
        </button>
        <JsonExportButton onExportArray={exportJsonAsArray} onExportObject={exportJsonAsObject} />
      </div>
      <div className="overflow-auto flex-1">
        <table className="border-collapse w-full select-none" style={{ minWidth: resolvedColumns.length * 160 + 60 }}>
          <thead className="sticky top-0 z-20">
            <tr>
              {resolvedColumns.map((col, i) => (
                <th key={i} className="grid-header-cell" style={{ minWidth: 140 }}>
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-mono" title={col.header}>{col.header}</span>
                    <button
                      onClick={() => onRemovePath(col.sourcePath)}
                      className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {resolvedColumns.map((col, i) => {
                const val = getAtPath(data, col.fullPath);
                return (
                  <td key={i} className="grid-cell">
                    <EditableCell value={val} onCommit={(v) => handleCellEdit(col.fullPath, v)} />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CompareTable;
