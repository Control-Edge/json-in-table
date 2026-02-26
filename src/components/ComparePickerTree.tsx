import React, { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Check } from "lucide-react";

interface ComparePickerTreeProps {
  data: unknown;
  selectedPaths: string[];
  onTogglePath: (path: string) => void;
}

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

const PickerNode: React.FC<{
  label: string;
  value: unknown;
  pathStr: string;
  depth: number;
  selectedPaths: string[];
  onTogglePath: (path: string) => void;
  expandedPaths: Set<string>;
  toggleExpand: (pathKey: string) => void;
}> = ({ label, value, pathStr, depth, selectedPaths, onTogglePath, expandedPaths, toggleExpand }) => {
  const isExpandable = value !== null && typeof value === "object";
  const isExpanded = expandedPaths.has(pathStr);
  const isArray = Array.isArray(value);
  const isSelected = selectedPaths.includes(pathStr);
  // Allow selecting any node except root
  const isSelectable = depth > 0;

  const entries = isExpandable
    ? isArray
      ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v }))
      : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v }))
    : [];

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
              onClick={() => toggleExpand(pathStr)}
              className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </span>

        {/* Checkbox for selectable nodes */}
        {isSelectable && (
          <button
            onClick={() => onTogglePath(pathStr)}
            className={`w-4 h-4 rounded border mr-2 flex items-center justify-center shrink-0 transition-colors ${
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-muted-foreground/40 hover:border-primary"
            }`}
          >
            {isSelected && <Check size={10} />}
          </button>
        )}

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
        ) : (
          <span className={`text-sm font-mono px-1.5 py-0.5 rounded ${getTypeColor(value)}`}>
            {formatDisplayValue(value)}
          </span>
        )}

        {/* Type badge */}
        <span className="text-[10px] text-muted-foreground/40 ml-2 font-mono select-none">
          {getValueType(value)}
        </span>
      </div>

      {isExpandable && isExpanded && (
        <div>
          {entries.map((entry) => {
            const childPath = pathStr ? `${pathStr}.${entry.key}` : entry.key;
            return (
              <PickerNode
                key={entry.key}
                label={entry.key}
                value={entry.value}
                pathStr={childPath}
                depth={depth + 1}
                selectedPaths={selectedPaths}
                onTogglePath={onTogglePath}
                expandedPaths={expandedPaths}
                toggleExpand={toggleExpand}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const ComparePickerTree: React.FC<ComparePickerTreeProps> = ({ data, selectedPaths, onTogglePath }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([""]));

  const toggleExpand = useCallback((pathKey: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  if (data === null || data === undefined) {
    return <div className="text-muted-foreground text-sm p-4">No data.</div>;
  }

  return (
    <div className="overflow-auto py-2 font-mono text-sm">
      <PickerNode
        label="root"
        value={data}
        pathStr=""
        depth={0}
        selectedPaths={selectedPaths}
        onTogglePath={onTogglePath}
        expandedPaths={expandedPaths}
        toggleExpand={toggleExpand}
      />
    </div>
  );
};

export default ComparePickerTree;
