import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { X } from "lucide-react";

const COLORS = [
  "hsl(172, 66%, 40%)",
  "hsl(220, 70%, 55%)",
  "hsl(340, 65%, 50%)",
  "hsl(45, 85%, 50%)",
  "hsl(270, 55%, 55%)",
  "hsl(15, 75%, 50%)",
  "hsl(140, 50%, 45%)",
  "hsl(200, 70%, 50%)",
];

interface FieldsChartProps {
  /** Array of row objects with string keys */
  rows: Record<string, unknown>[];
  /** All column keys available */
  columns: string[];
  onClose: () => void;
  onValueChange?: (rowIndex: number, column: string, value: number) => void;
}

interface DragState {
  dataIndex: number;
  column: string;
  startY: number;
  startValue: number;
}
// Recharts interprets dots in dataKey as nested property access.
// Use numeric indices as safe keys in chartData, mapping back to original column names for display.

const FieldsChart: React.FC<FieldsChartProps> = ({ rows, columns, onClose, onValueChange }) => {
  const [xAxisCol, setXAxisCol] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dataIndex: number; colIndex: number; value: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const numericColumns = columns
    .filter((col) => col !== xAxisCol)
    .filter((col) =>
      rows.some((row) => {
        const v = row[col];
        return v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
      })
    );

  // Map each numeric column to a safe index-based key: "c0", "c1", etc.
  const colToSafeKey = (col: string) => `c${numericColumns.indexOf(col)}`;
  const safeKeyToCol = (key: string) => numericColumns[parseInt(key.slice(1))];

  // Compute Y domain
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const row of rows) {
    numericColumns.forEach((col) => {
      const v = row[col];
      if (v !== null && v !== undefined && v !== "" && !isNaN(Number(v))) {
        const n = Number(v);
        if (n < yMin) yMin = n;
        if (n > yMax) yMax = n;
      }
    });
  }
  if (!isFinite(yMin)) { yMin = 0; yMax = 100; }
  const yRange = yMax - yMin || 1;
  const yDomainMin = yMin - yRange * 0.1;
  const yDomainMax = yMax + yRange * 0.1;

  const xAxisSafeKey = "__x__";
  const xKey = xAxisCol ? xAxisSafeKey : "__row__";
  const chartData: Record<string, unknown>[] = rows.map((row, i) => {
    const point: Record<string, unknown> = { __row__: i + 1, __dataRowIndex__: i };
    if (xAxisCol) {
      const xv = row[xAxisCol];
      if (xv !== null && xv !== undefined && xv !== "" && !isNaN(Number(xv))) {
        point[xAxisSafeKey] = Number(xv);
      } else {
        point[xAxisSafeKey] = xv !== null && xv !== undefined ? String(xv) : "";
      }
    }
    numericColumns.forEach((col) => {
      const v = row[col];
      point[colToSafeKey(col)] = v !== null && v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : null;
    });
    return point;
  });

  // Apply drag preview
  if (dragPreview) {
    const pt = chartData[dragPreview.dataIndex];
    if (pt) {
      chartData[dragPreview.dataIndex] = { ...pt, [`c${dragPreview.colIndex}`]: dragPreview.value };
    }
  }

  const getChartArea = useCallback((): { top: number; bottom: number } | null => {
    const container = chartContainerRef.current;
    if (!container) return null;
    const cartesian = container.querySelector(".recharts-cartesian-grid");
    if (!cartesian) return null;
    const rect = cartesian.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  }, []);

  const pixelToValue = useCallback((clientY: number): number | null => {
    const area = getChartArea();
    if (!area) return null;
    const fraction = 1 - (clientY - area.top) / (area.bottom - area.top);
    const clamped = Math.max(0, Math.min(1, fraction));
    return yDomainMin + clamped * (yDomainMax - yDomainMin);
  }, [getChartArea, yDomainMin, yDomainMax]);

  useEffect(() => {
    if (!dragState) return;
    const onMouseMove = (e: MouseEvent) => {
      const newValue = pixelToValue(e.clientY);
      if (newValue === null) return;
      const rounded = Math.round(newValue * 100) / 100;
      const colIdx = numericColumns.indexOf(dragState.column);
      setDragPreview({ dataIndex: dragState.dataIndex, colIndex: colIdx, value: rounded });
    };
    const onMouseUp = (e: MouseEvent) => {
      const newValue = pixelToValue(e.clientY);
      if (newValue !== null && onValueChange) {
        const rounded = Math.round(newValue * 100) / 100;
        const rowIndex = chartData[dragState.dataIndex]?.__dataRowIndex__ as number;
        if (rowIndex !== undefined) {
          onValueChange(rowIndex, dragState.column, rounded);
        }
      }
      setDragState(null);
      setDragPreview(null);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, pixelToValue, chartData, onValueChange]);

  const handleDotMouseDown = useCallback((dataIndex: number, column: string, value: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({ dataIndex, column, startY: e.clientY, startValue: value });
  }, []);

  const makeDraggableDot = (colIndex: number, originalCol: string, color: string) => {
    const safeKey = `c${colIndex}`;
    const DraggableDot = (props: any) => {
      const { cx, cy, index, value } = props;
      if (cx === undefined || cy === undefined || value === null || value === undefined) return null;
      return (
        <circle
          cx={cx}
          cy={cy}
          r={dragState?.dataIndex === index && dragState?.column === originalCol ? 6 : 4}
          fill={color}
          stroke="hsl(var(--background))"
          strokeWidth={2}
          style={{ cursor: onValueChange ? "ns-resize" : "default" }}
          onMouseDown={onValueChange ? (e) => handleDotMouseDown(index, originalCol, Number(value), e) : undefined}
        />
      );
    };
    return DraggableDot;
  };

  if (numericColumns.length === 0) {
    return (
      <div className="border-t border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chart</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">No numeric data in selection to chart.</p>
      </div>
    );
  }

  return (
    <div
      className="border-t border-border bg-card p-4"
      style={{ height: 300, userSelect: dragState ? "none" : undefined }}
      ref={chartContainerRef}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Chart — {numericColumns.join(", ")}
          </span>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">X axis:</label>
            <select
              value={xAxisCol || ""}
              onChange={(e) => setXAxisCol(e.target.value || null)}
              className="text-xs bg-secondary text-secondary-foreground border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Row number</option>
              {columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
          {onValueChange && (
            <span className="text-[10px] text-muted-foreground/60 italic">Drag points to adjust values</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-line))" />
          <XAxis
            dataKey={xKey}
            type={xAxisCol && chartData.every((d) => typeof d[xAxisSafeKey] === "number") ? "number" : "category"}
            label={{ value: xAxisCol || "Row", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            domain={[yDomainMin, yDomainMax]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
            tickFormatter={(v: number) => Number.isFinite(v) ? parseFloat(v.toPrecision(6)).toString() : String(v)}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              fontSize: 12,
              color: "hsl(var(--popover-foreground))",
            }}
            formatter={(value: any, name: string) => [value, name]}
          />
          {numericColumns.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              onClick={(e: any) => {
                const idx = numericColumns.indexOf(e.value as string);
                if (idx === -1) return;
                setHiddenSeries((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                });
              }}
              formatter={(value: string) => {
                const idx = numericColumns.indexOf(value);
                return (
                  <span style={{ color: hiddenSeries.has(idx) ? "hsl(var(--muted-foreground))" : undefined, textDecoration: hiddenSeries.has(idx) ? "line-through" : undefined, cursor: "pointer" }}>
                    {value}
                  </span>
                );
              }}
            />
          )}
          {numericColumns.map((col, i) => (
            <Line
              key={col}
              type="monotone"
              dataKey={`c${i}`}
              name={col}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={hiddenSeries.has(i) ? false : makeDraggableDot(i, col, COLORS[i % COLORS.length])}
              activeDot={false}
              connectNulls
              hide={hiddenSeries.has(i)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default FieldsChart;
