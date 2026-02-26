import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { X, Download, FileJson, FileSpreadsheet } from "lucide-react";

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
  if (typeof val === "number") return "text-blue-400";
  if (typeof val === "boolean") return "text-amber-400";
  if (typeof val === "string") return "text-emerald-400";
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
      className={`block truncate max-w-xs font-mono text-sm cursor-pointer ${getTypeColor(value)}`}
      onClick={startEdit}
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

const downloadFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const escapeCsv = (val: string) => {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) return `"${val.replace(/"/g, '""')}"`;
  return val;
};

const CompareTable: React.FC<CompareTableProps> = ({ data, selectedPaths, onRemovePath, onDataChange }) => {
  const handleCellEdit = useCallback((fullPath: string, newValue: unknown) => {
    onDataChange(setAtPath(data, fullPath, newValue));
  }, [data, onDataChange]);

  const tableData = useTableData(data, selectedPaths);

  const exportCsv = useCallback(() => {
    const { headers, rows } = tableData;
    const lines = [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))];
    downloadFile(lines.join("\n"), "fields-export.csv", "text/csv");
  }, [tableData]);

  const exportJson = useCallback(() => {
    const { headers, rows } = tableData;
    const jsonData: Record<string, unknown[]> = {};
    headers.forEach((h) => { jsonData[h] = []; });
    rows.forEach((row) => {
      headers.forEach((h, i) => { jsonData[h].push(parseInput(row[i] === "—" ? "" : row[i])); });
    });
    downloadFile(JSON.stringify(jsonData, null, 2), "fields-export.json", "application/json");
  }, [tableData]);

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

    const maxRows = Math.max(
      primaryArray.length,
      ...extraArrays.map((e) => e.data.length)
    );

    // Full paths used for column titles

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card shrink-0 justify-end">
          <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button onClick={exportJson} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
            <FileJson size={13} /> JSON
          </button>
        </div>
        <div className="overflow-auto flex-1">
        <table className="border-collapse w-full">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="grid-header-cell sticky left-0 z-30 w-12">#</th>
              {columns.map((col) => (
                <th key={`${primaryPath}.${col}`} className="grid-header-cell" style={{ minWidth: 140 }}>
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-mono" title={`${primaryPath}.${col}`}>
                      {`${primaryPath}.${col}`}
                    </span>
                  </div>
                </th>
              ))}
              {extraArrays.map(({ path }) =>
                Array.from(extraColSets.get(path) || []).map((col) => (
                  <th key={`${path}.${col}`} className="grid-header-cell" style={{ minWidth: 140 }}>
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs font-mono" title={`${path}.${col}`}>
                        {`${path}.${col}`}
                      </span>
                    </div>
                  </th>
                ))
              )}
              {otherPaths.map((p) => (
                <th key={p} className="grid-header-cell" style={{ minWidth: 140 }}>
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-mono" title={p}>{p}</span>
                    <button
                      onClick={() => onRemovePath(p)}
                      className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              <th className="grid-header-cell sticky left-0 z-30 w-12" />
              {arrayPaths.map((p) => {
                const colCount = p === primaryPath
                  ? columns.length
                  : Array.from(extraColSets.get(p) || []).length;
                return (
                  <th key={p} colSpan={colCount} className="grid-header-cell !py-1">
                    <div className="flex items-center gap-1 justify-center">
                      <span className="text-[10px] text-muted-foreground/60 font-mono">{p}</span>
                      <button
                        onClick={() => onRemovePath(p)}
                        className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </th>
                );
              })}
              {otherPaths.length > 0 && <th colSpan={otherPaths.length} className="grid-header-cell !py-1" />}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, rowIndex) => {
              const primaryItem = primaryArray[rowIndex];
              const primaryFlat = primaryItem !== null && typeof primaryItem === "object"
                ? flattenObject(primaryItem)
                : primaryItem !== undefined ? { value: primaryItem } : {};

              return (
                <tr key={rowIndex} className="group">
                  <td className="row-number sticky left-0 z-10">{rowIndex}</td>
                  {columns.map((col) => {
                    const val = (primaryFlat as Record<string, unknown>)[col];
                    const fullPath = `${primaryPath}.${rowIndex}.${col}`;
                    return (
                      <td key={`${primaryPath}.${col}`} className="grid-cell">
                        <EditableCell value={val} onCommit={(v) => handleCellEdit(fullPath, v)} />
                      </td>
                    );
                  })}
                  {extraArrays.map(({ path, data: arr }) => {
                    const item = arr[rowIndex];
                    const flat = item !== null && typeof item === "object"
                      ? flattenObject(item)
                      : item !== undefined ? { value: item } : {};
                    return Array.from(extraColSets.get(path) || []).map((col) => {
                      const val = (flat as Record<string, unknown>)[col];
                      const fullPath = `${path}.${rowIndex}.${col}`;
                      return (
                        <td key={`${path}.${col}`} className="grid-cell">
                          <EditableCell value={val} onCommit={(v) => handleCellEdit(fullPath, v)} />
                        </td>
                      );
                    });
                  })}
                  {otherPaths.map((p) => {
                    const val = getAtPath(data, p);
                    return (
                      <td key={p} className="grid-cell">
                        <EditableCell value={val} onCommit={(v) => handleCellEdit(p, v)} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
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
        <button onClick={exportJson} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors">
          <FileJson size={13} /> JSON
        </button>
      </div>
      <div className="overflow-auto flex-1">
        <table className="border-collapse w-full" style={{ minWidth: resolvedColumns.length * 160 + 60 }}>
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
