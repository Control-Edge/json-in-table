import React, { useState, useCallback } from "react";
import { Upload, ClipboardPaste, X, Download, FileJson, Table, GitBranch, Columns } from "lucide-react";
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

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          addTab(file.name.replace(/\.json$/i, ""), text);
        };
        reader.readAsText(file);
      });
      e.target.value = "";
    },
    [addTab]
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
        const source = t.viewMode === "tree" || t.viewMode === "compare" ? t.rawData : t.rawData;
        const flatData = flattenForSpreadsheet(source);
        const columns = extractColumns(flatData);
        return { ...t, viewMode: "spreadsheet", data: flatData, columns };
      } else if (mode === "tree" && t.viewMode !== "tree") {
        if (t.viewMode === "spreadsheet") {
          const nested = t.data.map((row) => unflattenObject(row));
          const rawData = nested.length === 1 ? nested[0] : nested;
          return { ...t, viewMode: "tree", rawData };
        }
        return { ...t, viewMode: "tree" };
      } else if (mode === "compare") {
        if (t.viewMode === "spreadsheet") {
          const nested = t.data.map((row) => unflattenObject(row));
          const rawData = nested.length === 1 ? nested[0] : nested;
          return { ...t, viewMode: "compare", rawData };
        }
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
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data } : t)));
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
      if (file.name.endsWith(".json")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          addTab(file.name.replace(/\.json$/i, ""), ev.target?.result as string);
        };
        reader.readAsText(file);
      }
    });
  }, [addTab]);

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
            <ClipboardPaste size={14} /> Paste JSON
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
            <Upload size={14} /> Upload
            <input type="file" accept=".json" multiple className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      {/* Paste area */}
      {showPaste && (
        <div className="px-4 py-3 border-b border-border bg-card shrink-0">
          <textarea
            className="w-full h-28 bg-background border border-border rounded p-3 text-xs font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder='Paste your JSON here... e.g. [{"name": "John", "age": 30}]'
            value={pasteValue}
            onChange={(e) => { setPasteValue(e.target.value); setError(null); }}
          />
          {error && <p className="text-destructive text-xs mt-1">{error}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => addTab(`paste_${tabs.length + 1}`, pasteValue)}
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
                  const labels = { tree: "Tree", spreadsheet: "Table", compare: "Compare" };
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
                    Select leaf values to add as columns
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
            <p className="text-sm font-medium text-foreground mb-1">No JSON loaded</p>
            <p className="text-xs">Drop JSON files here, upload, or paste JSON to start editing</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonEditor;
