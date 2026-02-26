import React, { useState, useCallback } from "react";
import { Upload, ClipboardPaste, X, Download, FileJson, Table, GitBranch, Columns, FileSpreadsheet } from "lucide-react";
import JsonSpreadsheet from "./JsonSpreadsheet";
import JsonTreeEditor from "./JsonTreeEditor";
import ComparePickerTree from "./ComparePickerTree";
import CompareTable from "./CompareTable";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./ui/resizable";

type ViewMode = "spreadsheet" | "tree" | "compare";

interface JsonTab {
  id: string;
  name: string;
  rawData: unknown;
  data: Record<string, unknown>[];
  columns: string[];
  viewMode: ViewMode;
  comparePaths: string[];
}

const flattenObject = (
  obj: unknown,
  prefix = "",
  result: Record<string, unknown> = {}
): Record<string, unknown> => {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const fullKey = prefix ? `${prefix}.${index}` : String(index);
      if (item !== null && typeof item === "object") {
        flattenObject(item, fullKey, result);
      } else {
        result[fullKey] = item;
      }
    });
  } else if (obj !== null && typeof obj === "object") {
    for (const key in obj as Record<string, unknown>) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = (obj as Record<string, unknown>)[key];
      if (value !== null && typeof value === "object") {
        flattenObject(value, fullKey, result);
      } else {
        result[fullKey] = value;
      }
    }
  } else {
    result[prefix] = obj;
  }
  return result;
};

const unflattenObject = (obj: Record<string, unknown>): unknown => {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const parts = key.split(".");
    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const nextKey = parts[i + 1];
      const isNextArray = /^\d+$/.test(nextKey);
      if (!(parts[i] in current) || typeof current[parts[i]] !== "object" || current[parts[i]] === null) {
        current[parts[i]] = isNextArray ? [] : {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = obj[key];
  }
  const convertArrays = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(convertArrays);
    const o = node as Record<string, unknown>;
    const keys = Object.keys(o);
    const allNumeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
    if (allNumeric) {
      const arr: unknown[] = [];
      keys.sort((a, b) => Number(a) - Number(b)).forEach((k) => {
        arr[Number(k)] = convertArrays(o[k]);
      });
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = convertArrays(o[k]);
    return out;
  };
  return convertArrays(result);
};

const extractColumns = (data: Record<string, unknown>[]): string[] => {
  const colSet = new Set<string>();
  data.forEach((row) => Object.keys(row).forEach((k) => colSet.add(k)));
  return Array.from(colSet);
};

// Detect if data is best shown as a tree (single object or deeply nested)
const detectViewMode = (parsed: unknown): ViewMode => {
  if (Array.isArray(parsed)) {
    // Array of flat-ish objects → spreadsheet
    if (parsed.length > 0 && parsed.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      // Check nesting depth
      const maxDepth = (obj: unknown, d: number): number => {
        if (d > 3) return d;
        if (obj === null || typeof obj !== "object") return d;
        if (Array.isArray(obj)) return Math.max(d + 1, ...obj.map((v) => maxDepth(v, d + 1)));
        return Math.max(d, ...Object.values(obj as Record<string, unknown>).map((v) => maxDepth(v, d + 1)));
      };
      const depth = Math.max(...parsed.map((item) => maxDepth(item, 0)));
      return depth > 2 ? "tree" : "spreadsheet";
    }
    return "tree";
  }
  return "tree";
};

const flattenForSpreadsheet = (parsed: unknown): Record<string, unknown>[] => {
  let rows: Record<string, unknown>[];
  if (Array.isArray(parsed)) {
    rows = parsed.map((item) =>
      typeof item === "object" && item !== null ? item : { value: item }
    );
  } else if (typeof parsed === "object" && parsed !== null) {
    rows = [parsed as Record<string, unknown>];
  } else {
    rows = [{ value: parsed }];
  }
  return rows.map((row) => flattenObject(row));
};

/** Check if data is a flat array of uniform objects (like CSV rows) */
const isFlatArray = (data: unknown): boolean => {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item) &&
    Object.values(item as Record<string, unknown>).every((v) => v === null || typeof v !== "object")
  );
};

/** Convert row-oriented [{col1: v1, col2: v2}] to column-oriented {col1: [v1,...], col2: [v2,...]} */
const rowsToColumnOriented = (rows: Record<string, unknown>[]): Record<string, unknown[]> => {
  const result: Record<string, unknown[]> = {};
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
  keys.forEach((k) => { result[k] = rows.map((row) => row[k] ?? null); });
  return result;
};

/** Check if data is column-oriented {col: [...], col2: [...]} */
const isColumnOriented = (data: unknown): boolean => {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
  const values = Object.values(data as Record<string, unknown>);
  return values.length > 0 && values.every((v) => Array.isArray(v));
};

/** Convert column-oriented back to row-oriented */
const columnOrientedToRows = (data: Record<string, unknown[]>): Record<string, unknown>[] => {
  const keys = Object.keys(data);
  const len = Math.max(...keys.map((k) => data[k].length));
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < len; i++) {
    const row: Record<string, unknown> = {};
    keys.forEach((k) => { row[k] = data[k][i] ?? null; });
    rows.push(row);
  }
  return rows;
};

const detectDelimiter = (text: string): string => {
  const firstLine = text.trim().split(/\r?\n/)[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
};

const parseCsv = (text: string): { rows: Record<string, unknown>[]; columns: string[] } => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Data must have a header row and at least one data row");
  
  const delimiter = detectDelimiter(text);

  const parseLine = (line: string): string[] => {
    if (delimiter === "\t") return line.split("\t").map((s) => s.trim());
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { result.push(current.trim()); current = ""; }
        else current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  // Deduplicate headers by appending index
  const headerCount: Record<string, number> = {};
  const headers = rawHeaders.map((h) => {
    const name = h || "column";
    headerCount[name] = (headerCount[name] || 0) + 1;
    if (headerCount[name] > 1) return `${name}_${headerCount[name]}`;
    return name;
  });
  // Check if any were duped, and if so re-number from 1
  const finalHeaders = rawHeaders.map((h, i) => {
    const name = h || "column";
    const total = rawHeaders.filter((r) => r === name).length;
    if (total <= 1) return name;
    const idx = rawHeaders.slice(0, i + 1).filter((r) => r === name).length;
    return `${name}_${idx}`;
  });

  const rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, unknown> = {};
    finalHeaders.forEach((h, i) => {
      const v = values[i] ?? "";
      if (v === "") obj[h] = "";
      else if (v === "null") obj[h] = null;
      else if (v === "true") obj[h] = true;
      else if (v === "false") obj[h] = false;
      else if (!isNaN(Number(v)) && v !== "") obj[h] = Number(v);
      else obj[h] = v;
    });
    return obj;
  });
  return { rows, columns: finalHeaders };
};

const isTabularText = (text: string): boolean => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return false;
  const delimiter = detectDelimiter(text);
  const sepCount = (lines[0].match(delimiter === "\t" ? /\t/g : /,/g) || []).length;
  return sepCount > 0 && lines.slice(1, 4).every((l) => (l.match(delimiter === "\t" ? /\t/g : /,/g) || []).length >= sepCount - 1);
};

const JsonEditor: React.FC = () => {
  const [tabs, setTabs] = useState<JsonTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const addTab = useCallback((name: string, jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const viewMode = detectViewMode(parsed);
      const flatData = flattenForSpreadsheet(parsed);
      const columns = extractColumns(flatData);
      const id = crypto.randomUUID();
      setTabs((prev) => [...prev, { id, name, rawData: parsed, data: flatData, columns, viewMode, comparePaths: [] }]);
      setActiveTabId(id);
      setError(null);
      setShowPaste(false);
      setPasteValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }, []);

  const addCsvTab = useCallback((name: string, csvText: string) => {
    try {
      const { rows, columns } = parseCsv(csvText);
      // Store as column-oriented JSON: {col1: [...], col2: [...]}
      const colOriented = rowsToColumnOriented(rows);
      const id = crypto.randomUUID();
      setTabs((prev) => [...prev, { id, name, rawData: colOriented, data: rows, columns, viewMode: "spreadsheet" as ViewMode, comparePaths: [] }]);
      setActiveTabId(id);
      setError(null);
      setShowPaste(false);
      setPasteValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid CSV");
    }
  }, []);

  const addData = useCallback((name: string, text: string) => {
    const trimmed = text.trim();
    // Try JSON first if it looks like JSON
    if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) {
      try {
        JSON.parse(trimmed);
        addTab(name, trimmed);
        return;
      } catch {
        // Not valid JSON, fall through to CSV
      }
    }
    // Try CSV
    if (isTabularText(trimmed)) {
      addCsvTab(name, trimmed);
      return;
    }
    // Last resort: try JSON anyway to show its error, or CSV
    try {
      addCsvTab(name, trimmed);
    } catch {
      addTab(name, trimmed);
    }
  }, [addTab, addCsvTab]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          const name = file.name.replace(/\.(json|csv)$/i, "");
          addData(name, text);
        };
        reader.readAsText(file);
      });
      e.target.value = "";
    },
    [addData]
  );

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeTabId]);

  const toggleViewMode = useCallback((tabId: string, mode: ViewMode) => {
    setTabs((prev) => prev.map((t) => {
      if (t.id !== tabId) return t;
      if (mode === "spreadsheet" && t.viewMode !== "spreadsheet") {
        // Derive display data from rawData without mutating rawData
        let source = t.rawData;
        if (isColumnOriented(source)) {
          source = columnOrientedToRows(source as Record<string, unknown[]>);
        }
        const flatData = flattenForSpreadsheet(source);
        const columns = extractColumns(flatData);
        return { ...t, viewMode: "spreadsheet", data: flatData, columns };
      } else if (mode === "tree" && t.viewMode !== "tree") {
        // Just switch view mode; rawData is already correct
        return { ...t, viewMode: "tree" };
      } else if (mode === "compare") {
        // Just switch view mode; rawData is already correct
        return { ...t, viewMode: "compare" };
      }
      return t;
    }));
  }, []);

  const toggleComparePath = useCallback((tabId: string, path: string) => {
    setTabs((prev) => prev.map((t) => {
      if (t.id !== tabId) return t;
      const paths = t.comparePaths.includes(path)
        ? t.comparePaths.filter((p) => p !== path)
        : [...t.comparePaths, path];
      return { ...t, comparePaths: paths };
    }));
  }, []);

  const updateTabData = useCallback((tabId: string, data: Record<string, unknown>[]) => {
    setTabs((prev) => prev.map((t) => {
      if (t.id !== tabId) return t;
      // Sync edits back to rawData
      let rawData: unknown;
      if (isColumnOriented(t.rawData)) {
        // CSV-like data: keep column-oriented format
        rawData = rowsToColumnOriented(data);
      } else {
        const nested = data.map((row) => unflattenObject(row));
        rawData = nested.length === 1 ? nested[0] : nested;
      }
      return { ...t, data, rawData };
    }));
  }, []);

  const updateTabRawData = useCallback((tabId: string, rawData: unknown) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, rawData } : t)));
  }, []);

  const updateTabColumns = useCallback((tabId: string, columns: string[]) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, columns } : t)));
  }, []);

  const exportTab = useCallback((tab: JsonTab) => {
    let exportData: unknown;
    if (tab.viewMode === "tree") {
      exportData = tab.rawData;
    } else {
      const nested = tab.data.map((row) => unflattenObject(row));
      exportData = nested;
    }
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach((file) => {
      if (file.name.endsWith(".json") || file.name.endsWith(".csv")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          addData(file.name.replace(/\.(json|csv)$/i, ""), ev.target?.result as string);
        };
        reader.readAsText(file);
      }
    });
  }, [addData]);

  return (
    <div
      className="flex flex-col h-screen bg-background"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <FileJson className="text-primary" size={22} />
          <h1 className="text-sm font-semibold tracking-tight">JSON Editor</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPaste(!showPaste)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <ClipboardPaste size={14} /> Paste
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
            <Upload size={14} /> Upload
            <input type="file" accept=".json,.csv" multiple className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      {/* Paste area */}
      {showPaste && (
        <div className="px-4 py-3 border-b border-border bg-card shrink-0">
          <textarea
            className="w-full h-28 bg-background border border-border rounded p-3 text-xs font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder='Paste JSON or CSV here...'
            value={pasteValue}
            onChange={(e) => { setPasteValue(e.target.value); setError(null); }}
          />
          {error && <p className="text-destructive text-xs mt-1">{error}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => addData(`paste_${tabs.length + 1}`, pasteValue)}
              className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Load
            </button>
            <button
              onClick={() => { setShowPaste(false); setPasteValue(""); setError(null); }}
              className="px-3 py-1.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-0 border-b border-border bg-card overflow-x-auto shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs border-r border-border transition-colors shrink-0 ${
                tab.id === activeTabId
                  ? "bg-background text-foreground border-b-2 border-b-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <FileJson size={12} />
              <span className="max-w-[120px] truncate">{tab.name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="ml-1 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors cursor-pointer"
              >
                <X size={12} />
              </span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 shrink-0 px-2">
            {activeTab && (
              <>
                {(["tree", "spreadsheet", "compare"] as ViewMode[]).map((mode) => {
                  const icons = { tree: <GitBranch size={14} />, spreadsheet: <Table size={14} />, compare: <Columns size={14} /> };
                  const labels = { tree: "Tree", spreadsheet: "Table", compare: "Fields" };
                  return (
                    <button
                      key={mode}
                      onClick={() => toggleViewMode(activeTab.id, mode)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors rounded ${
                        activeTab.viewMode === mode
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-primary hover:bg-secondary/50"
                      }`}
                    >
                      {icons[mode]} {labels[mode]}
                    </button>
                  );
                })}
                <button
                  onClick={() => exportTab(activeTab)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-primary transition-colors rounded hover:bg-secondary/50"
                >
                  <Download size={14} /> Export
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab ? (
        activeTab.viewMode === "tree" ? (
          <JsonTreeEditor
            data={activeTab.rawData}
            onDataChange={(rawData) => updateTabRawData(activeTab.id, rawData)}
          />
        ) : activeTab.viewMode === "compare" ? (
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={40} minSize={25}>
              <div className="h-full overflow-auto border-r border-border">
                <div className="px-3 py-2 border-b border-border bg-card">
                  <p className="text-xs text-muted-foreground">
                    Select fields to view as table columns
                    {activeTab.comparePaths.length > 0 && (
                      <span className="ml-2 text-primary font-medium">({activeTab.comparePaths.length} selected)</span>
                    )}
                  </p>
                </div>
                <ComparePickerTree
                  data={activeTab.rawData}
                  selectedPaths={activeTab.comparePaths}
                  onTogglePath={(path) => toggleComparePath(activeTab.id, path)}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30}>
              <CompareTable
                data={activeTab.rawData}
                selectedPaths={activeTab.comparePaths}
                onRemovePath={(path) => toggleComparePath(activeTab.id, path)}
                onDataChange={(rawData) => updateTabRawData(activeTab.id, rawData)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <JsonSpreadsheet
            data={activeTab.data}
            columns={activeTab.columns}
            onDataChange={(data) => updateTabData(activeTab.id, data)}
            onColumnsChange={(columns) => updateTabColumns(activeTab.id, columns)}
          />
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <div className="p-6 rounded-xl border-2 border-dashed border-border">
            <FileJson size={48} className="text-primary/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground mb-1">No data loaded</p>
            <p className="text-xs">Drop JSON/CSV files here, upload, or paste data to start editing</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonEditor;
