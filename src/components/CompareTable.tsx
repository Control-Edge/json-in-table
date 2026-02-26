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

/**
 * If data is an array, shows each array item as a row with selected paths as columns.
 * If data is an object, shows a single row with each path as a column.
 */
const CompareTable: React.FC<CompareTableProps> = ({ data, selectedPaths, onRemovePath }) => {
  if (selectedPaths.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        Select leaf values from the tree on the left to compare them here.
      </div>
    );
  }

  // Determine the root structure to decide rows
  // If root is array, each element is a row. Paths are relative to each element.
  // If root is object, single row.
  const isRootArray = Array.isArray(data);

  // Find the common prefix if all paths share one (e.g. all start with "items.0.xxx" → unlikely)
  // For arrays: strip the first numeric segment from paths and use array index as rows
  // Strategy: if root is array, paths should be relative to each array element
  // e.g. if data = [{name: "a", stats: {x: 1}}, ...] and path = "name" or "stats.x"

  // Check if paths start with numeric index (direct array child references)
  const startsWithIndex = selectedPaths.every((p) => /^\d+/.test(p));

  let rows: { label: string; source: unknown }[];
  let colPaths: string[];

  if (isRootArray && !startsWithIndex) {
    // Each array item is a row, paths are columns within each item
    rows = (data as unknown[]).map((item, i) => ({ label: String(i), source: item }));
    colPaths = selectedPaths;
  } else {
    // Single source, each path is a column
    rows = [{ label: "root", source: data }];
    colPaths = selectedPaths;
  }

  return (
    <div className="overflow-auto h-full">
      <table className="border-collapse w-full" style={{ minWidth: colPaths.length * 160 + 60 }}>
        <thead className="sticky top-0 z-20">
          <tr>
            {isRootArray && !startsWithIndex && (
              <th className="grid-header-cell sticky left-0 z-30 w-12">#</th>
            )}
            {colPaths.map((path) => (
              <th key={path} className="grid-header-cell" style={{ minWidth: 140 }}>
                <div className="flex items-center gap-1">
                  <span className="truncate text-xs font-mono" title={path}>
                    {path.split(".").length > 2 ? (
                      <>
                        <span className="text-muted-foreground/50">
                          {path.split(".").slice(0, -1).join(".")}.
                        </span>
                        {path.split(".").pop()}
                      </>
                    ) : (
                      path
                    )}
                  </span>
                  <button
                    onClick={() => onRemovePath(path)}
                    className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Remove column"
                  >
                    <X size={12} />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="group">
              {isRootArray && !startsWithIndex && (
                <td className="row-number sticky left-0 z-10">{rowIndex}</td>
              )}
              {colPaths.map((path) => {
                const val = getAtPath(row.source, path);
                return (
                  <td key={path} className={`grid-cell ${getTypeColor(val)}`}>
                    <span className="block truncate max-w-xs font-mono text-sm">
                      {formatValue(val)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CompareTable;
