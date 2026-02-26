import React, { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Table, GitBranch } from "lucide-react";
import JsonSpreadsheet from "./JsonSpreadsheet";

interface JsonTreeEditorProps {
  data: unknown;
  onDataChange: (data: unknown) => void;
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

const extractColumns = (data: Record<string, unknown>[]): string[] => {
  const colSet = new Set<string>();
  data.forEach((row) => Object.keys(row).forEach((k) => colSet.add(k)));
  return Array.from(colSet);
};

type PathSegment = string | number;

const getValueType = (val: unknown): string => {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val;
};

const getTypeColor = (val: unknown): string => {
  if (val === null) return "text-muted-foreground italic";
  if (typeof val === "number") return "text-blue-400";
  if (typeof val === "boolean") return "text-amber-400";
  if (typeof val === "string") return "text-emerald-400";
  return "text-foreground";
};

const formatDisplayValue = (val: unknown): string => {
  if (val === null) return "null";
  if (typeof val === "string") return `"${val}"`;
  return String(val);
};

const getAtPath = (obj: unknown, path: PathSegment[]): unknown => {
  let current: unknown = obj;
  for (const seg of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[String(seg)];
  }
  return current;
};

const setAtPath = (obj: unknown, path: PathSegment[], value: unknown): unknown => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const arr = [...obj];
    arr[Number(head)] = setAtPath(arr[Number(head)], rest, value);
    return arr;
  }
  const o = { ...(obj as Record<string, unknown>) };
  o[String(head)] = setAtPath(o[String(head)], rest, value);
  return o;
};

const deleteAtPath = (obj: unknown, path: PathSegment[]): unknown => {
  if (path.length === 0) return undefined;
  if (path.length === 1) {
    if (Array.isArray(obj)) {
      const arr = [...obj];
      arr.splice(Number(path[0]), 1);
      return arr;
    }
    const o = { ...(obj as Record<string, unknown>) };
    delete o[String(path[0])];
    return o;
  }
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const arr = [...obj];
    arr[Number(head)] = deleteAtPath(arr[Number(head)], rest);
    return arr;
  }
  const o = { ...(obj as Record<string, unknown>) };
  o[String(head)] = deleteAtPath(o[String(head)], rest);
  return o;
};

const addToPath = (obj: unknown, path: PathSegment[], key: string, value: unknown): unknown => {
  const parent = path.length === 0 ? obj : getAtPath(obj, path);
  if (Array.isArray(parent)) {
    const newArr = [...parent, value];
    return path.length === 0 ? newArr : setAtPath(obj, path, newArr);
  }
  if (parent !== null && typeof parent === "object") {
    const newObj = { ...(parent as Record<string, unknown>), [key]: value };
    return path.length === 0 ? newObj : setAtPath(obj, path, newObj);
  }
  return obj;
};

// Inline value editor
const ValueEditor: React.FC<{
  value: unknown;
  onCommit: (val: unknown) => void;
  onCancel: () => void;
}> = ({ value, onCommit, onCancel }) => {
  const [text, setText] = useState(
    value === null ? "null" : typeof value === "string" ? value : JSON.stringify(value)
  );
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    let parsed: unknown = text;
    if (text === "null") parsed = null;
    else if (text === "true") parsed = true;
    else if (text === "false") parsed = false;
    else if (!isNaN(Number(text)) && text.trim() !== "") parsed = Number(text);
    onCommit(parsed);
  };

  return (
    <input
      ref={ref}
      className="bg-background border border-primary/50 rounded px-2 py-0.5 text-sm font-mono text-foreground outline-none w-64"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
};

// Recursive tree node
const TreeNode: React.FC<{
  label: string;
  value: unknown;
  path: PathSegment[];
  depth: number;
  onUpdate: (path: PathSegment[], value: unknown) => void;
  onDelete: (path: PathSegment[]) => void;
  onAdd: (path: PathSegment[], key: string, value: unknown) => void;
  expandedPaths: Set<string>;
  toggleExpand: (pathKey: string) => void;
  tablePaths: Set<string>;
  toggleTable: (pathKey: string) => void;
}> = ({ label, value, path, depth, onUpdate, onDelete, onAdd, expandedPaths, toggleExpand, tablePaths, toggleTable }) => {
  const [editing, setEditing] = useState(false);
  const [addingKey, setAddingKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  const pathKey = path.join(".");
  const isExpandable = value !== null && typeof value === "object";
  const isExpanded = expandedPaths.has(pathKey);
  const isArray = Array.isArray(value);

  useEffect(() => {
    if (addingKey && addRef.current) {
      addRef.current.focus();
    }
  }, [addingKey]);

  const entries = isExpandable
    ? isArray
      ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v }))
      : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v }))
    : [];

  const handleAddConfirm = () => {
    if (isArray) {
      onAdd(path, "", "");
    } else if (newKey.trim()) {
      onAdd(path, newKey.trim(), "");
    }
    setAddingKey(false);
    setNewKey("");
  };

  return (
    <div>
      <div
        className="flex items-center group hover:bg-secondary/30 transition-colors"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        {/* Expand toggle */}
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          {isExpandable ? (
            <button
              onClick={() => toggleExpand(pathKey)}
              className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </span>

        {/* Key label */}
        <span className="text-sm font-mono text-muted-foreground mr-2 select-none shrink-0">
          {label}
          <span className="text-muted-foreground/40">:</span>
        </span>

        {/* Value */}
        {isExpandable ? (
          <span className="text-xs text-muted-foreground/60 font-mono">
            {isArray ? `Array(${(value as unknown[]).length})` : `Object(${Object.keys(value as Record<string, unknown>).length})`}
          </span>
        ) : editing ? (
          <ValueEditor
            value={value}
            onCommit={(v) => {
              onUpdate(path, v);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className={`text-sm font-mono cursor-pointer hover:bg-secondary/50 px-1.5 py-0.5 rounded transition-colors ${getTypeColor(value)}`}
            onClick={() => setEditing(true)}
          >
            {formatDisplayValue(value)}
          </span>
        )}

        {/* Type badge */}
        <span className="text-[10px] text-muted-foreground/40 ml-2 font-mono select-none">
          {getValueType(value)}
        </span>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
          {isExpandable && (
            <>
              <button
                onClick={() => toggleTable(pathKey)}
                className={`p-1 rounded hover:bg-primary/20 transition-colors ${tablePaths.has(pathKey) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                title={tablePaths.has(pathKey) ? "Switch to tree" : "View as table"}
              >
                {tablePaths.has(pathKey) ? <GitBranch size={12} /> : <Table size={12} />}
              </button>
              <button
                onClick={() => {
                  if (!isExpanded) toggleExpand(pathKey);
                  if (isArray) {
                    onAdd(path, "", "");
                  } else {
                    setAddingKey(true);
                  }
                }}
                className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title={isArray ? "Add item" : "Add property"}
              >
                <Plus size={12} />
              </button>
            </>
          )}
          {depth > 0 && (
            <button
              onClick={() => onDelete(path)}
              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Children or inline table */}
      {isExpandable && isExpanded && (
        tablePaths.has(pathKey) ? (
          <InlineTable
            value={value}
            depth={depth}
            onUpdate={(newValue) => onUpdate(path, newValue)}
          />
        ) : (
          <div>
            {entries.map((entry) => (
              <TreeNode
                key={entry.key}
                label={entry.key}
                value={entry.value}
                path={[...path, isArray ? Number(entry.key) : entry.key]}
                depth={depth + 1}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
                expandedPaths={expandedPaths}
                toggleExpand={toggleExpand}
                tablePaths={tablePaths}
                toggleTable={toggleTable}
              />
            ))}
            {addingKey && !isArray && (
              <div className="flex items-center gap-2" style={{ paddingLeft: (depth + 1) * 20 + 8 + 20 }}>
                <input
                  ref={addRef}
                  className="bg-background border border-primary/50 rounded px-2 py-0.5 text-sm font-mono text-foreground outline-none w-40"
                  placeholder="property name"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddConfirm();
                    if (e.key === "Escape") { setAddingKey(false); setNewKey(""); }
                  }}
                  onBlur={handleAddConfirm}
                />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

// Inline table component for a node
const InlineTable: React.FC<{
  value: unknown;
  depth: number;
  onUpdate: (newValue: unknown) => void;
}> = ({ value, depth, onUpdate }) => {
  const flatData = flattenForSpreadsheet(value);
  const columns = extractColumns(flatData);

  const handleDataChange = useCallback((newData: Record<string, unknown>[]) => {
    const nested = newData.map((row) => unflattenObject(row));
    const result = Array.isArray(value) ? nested : nested[0] ?? {};
    onUpdate(result);
  }, [value, onUpdate]);

  const handleColumnsChange = useCallback((_columns: string[]) => {
    // columns are derived from data, no-op
  }, []);

  return (
    <div
      className="border border-border rounded my-1 overflow-hidden"
      style={{ marginLeft: (depth + 1) * 20 + 8 }}
    >
      <JsonSpreadsheet
        data={flatData}
        columns={columns}
        onDataChange={handleDataChange}
        onColumnsChange={handleColumnsChange}
      />
    </div>
  );
};

const JsonTreeEditor: React.FC<JsonTreeEditorProps> = ({ data, onDataChange }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    initial.add("");
    return initial;
  });

  const [tablePaths, setTablePaths] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((pathKey: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const toggleTable = useCallback((pathKey: string) => {
    setTablePaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const handleUpdate = useCallback((path: PathSegment[], value: unknown) => {
    onDataChange(setAtPath(data, path, value));
  }, [data, onDataChange]);

  const handleDelete = useCallback((path: PathSegment[]) => {
    onDataChange(deleteAtPath(data, path));
  }, [data, onDataChange]);

  const handleAdd = useCallback((path: PathSegment[], key: string, value: unknown) => {
    const result = addToPath(data, path, key, value);
    onDataChange(result);
  }, [data, onDataChange]);

  if (data === null || data === undefined) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No data loaded.
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1 py-2 font-mono text-sm">
      <TreeNode
        label="root"
        value={data}
        path={[]}
        depth={0}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onAdd={handleAdd}
        expandedPaths={expandedPaths}
        toggleExpand={toggleExpand}
        tablePaths={tablePaths}
        toggleTable={toggleTable}
      />
    </div>
  );
};

export default JsonTreeEditor;
