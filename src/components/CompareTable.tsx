import React from "react";
import { X } from "lucide-react";

interface CompareTableProps {
  data: unknown;
  selectedPaths: string[];
  onRemovePath: (path: string) => void;
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

/** Flatten an object/array into dot-notation keys with leaf values */
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

/**
 * Resolve selected paths into table columns.
 * If a selected path points to an array, treat each element as a row and flatten its children as columns.
 * If a selected path points to an object, flatten it into multiple leaf columns.
 * Leaf paths become single columns.
 */
interface ResolvedColumn {
  /** Display header */
  header: string;
  /** The original selected path this column came from */
  sourcePath: string;
  /** Sub-path within each row item (for array sources) or full dot-path for leaf extraction */
  subPath: string;
}

const CompareTable: React.FC<CompareTableProps> = ({ data, selectedPaths, onRemovePath }) => {
  if (selectedPaths.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        Select values from the tree on the left to compare them here.
      </div>
    );
  }

  // Determine what we're working with
  // Find array-type selections — these define rows
  // Other selections become additional columns per row
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

  // If we have array selections, use the first (largest) array as row source
  // and flatten each element's properties as columns
  if (arrayPaths.length > 0) {
    // Use first array as primary row source
    const primaryPath = arrayPaths[0];
    const primaryArray = getAtPath(data, primaryPath) as unknown[];

    // Collect all column keys from all array elements
    const colSet = new Set<string>();
    primaryArray.forEach((item) => {
      if (item !== null && typeof item === "object") {
        const flat = flattenObject(item);
        Object.keys(flat).forEach((k) => colSet.add(k));
      } else {
        colSet.add("value");
      }
    });
    const columns = Array.from(colSet);

    // Additional arrays become extra column groups
    const extraArrays = arrayPaths.slice(1).map((p) => ({
      path: p,
      data: getAtPath(data, p) as unknown[],
    }));

    // Extra array columns
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

    // Build header label helper
    const shortLabel = (path: string) => {
      const parts = path.split(".");
      return parts[parts.length - 1];
    };

    return (
      <div className="overflow-auto h-full">
        <table className="border-collapse w-full">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="grid-header-cell sticky left-0 z-30 w-12">#</th>
              {/* Primary array columns */}
              {columns.map((col) => (
                <th key={`${primaryPath}.${col}`} className="grid-header-cell" style={{ minWidth: 140 }}>
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-mono" title={`${shortLabel(primaryPath)}.${col}`}>
                      <span className="text-muted-foreground/50">{shortLabel(primaryPath)}.</span>
                      {col}
                    </span>
                  </div>
                </th>
              ))}
              {/* Extra array columns */}
              {extraArrays.map(({ path }) =>
                Array.from(extraColSets.get(path) || []).map((col) => (
                  <th key={`${path}.${col}`} className="grid-header-cell" style={{ minWidth: 140 }}>
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs font-mono" title={`${shortLabel(path)}.${col}`}>
                        <span className="text-muted-foreground/50">{shortLabel(path)}.</span>
                        {col}
                      </span>
                    </div>
                  </th>
                ))
              )}
              {/* Other leaf/object paths */}
              {otherPaths.map((p) => (
                <th key={p} className="grid-header-cell" style={{ minWidth: 140 }}>
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-mono" title={p}>{shortLabel(p)}</span>
                    <button
                      onClick={() => onRemovePath(p)}
                      className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </th>
              ))}
              {/* Remove buttons for array paths - in a separate header row area */}
            </tr>
            {/* Source path labels with remove buttons */}
            <tr>
              <th className="grid-header-cell sticky left-0 z-30 w-12" />
              {arrayPaths.map((p) => {
                const arr = getAtPath(data, p) as unknown[];
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
                    return (
                      <td key={`${primaryPath}.${col}`} className={`grid-cell ${getTypeColor(val)}`}>
                        <span className="block truncate max-w-xs font-mono text-sm">{formatValue(val)}</span>
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
                      return (
                        <td key={`${path}.${col}`} className={`grid-cell ${getTypeColor(val)}`}>
                          <span className="block truncate max-w-xs font-mono text-sm">{formatValue(val)}</span>
                        </td>
                      );
                    });
                  })}
                  {otherPaths.map((p) => {
                    const val = getAtPath(data, p);
                    return (
                      <td key={p} className={`grid-cell ${getTypeColor(val)}`}>
                        <span className="block truncate max-w-xs font-mono text-sm">{formatValue(val)}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // No arrays selected — object/leaf mode: flatten objects into columns, show single row
  const resolvedColumns: { header: string; sourcePath: string; getValue: () => unknown }[] = [];

  for (const p of selectedPaths) {
    const val = getAtPath(data, p);
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      // Flatten object into multiple columns
      const flat = flattenObject(val);
      for (const [subKey, subVal] of Object.entries(flat)) {
        const shortP = p.split(".").pop() || p;
        resolvedColumns.push({
          header: `${shortP}.${subKey}`,
          sourcePath: p,
          getValue: () => subVal,
        });
      }
    } else {
      resolvedColumns.push({
        header: p,
        sourcePath: p,
        getValue: () => val,
      });
    }
  }

  return (
    <div className="overflow-auto h-full">
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
              const val = col.getValue();
              return (
                <td key={i} className={`grid-cell ${getTypeColor(val)}`}>
                  <span className="block truncate max-w-xs font-mono text-sm">{formatValue(val)}</span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default CompareTable;
