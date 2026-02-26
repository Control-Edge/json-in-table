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

interface SpreadsheetChartProps {
  data: Record<string, unknown>[];
  columns: string[];
  selectedColumns: Set<number>;
  cellRange: { startRow: number; endRow: number; startCol: number; endCol: number } | null;
  onClose: () => void;
  onValueChange: (rowIndex: number, column: string, value: number) => void;
}

interface DragState {
  dataIndex: number; // index within chartData
  column: string;
  startY: number;
  startValue: number;
}

const SpreadsheetChart: React.FC<SpreadsheetChartProps> = ({
  data,
  columns,
  selectedColumns,
  cellRange,
  onClose,
  onValueChange,
}) => {
  const [xAxisCol, setXAxisCol] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dataIndex: number; column: string; value: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  let chartColumns: string[] = [];
  let startRow = 0;
  let endRow = data.length - 1;

  if (cellRange) {
    for (let c = cellRange.startCol; c <= cellRange.endCol; c++) {
      if (columns[c]) chartColumns.push(columns[c]);
    }
    startRow = cellRange.startRow;
    endRow = cellRange.endRow;
  } else if (selectedColumns.size > 0) {
    selectedColumns.forEach((ci) => {
      if (columns[ci]) chartColumns.push(columns[ci]);
    });
  }

  const allSelectedColumns = [...chartColumns];

  const numericColumns = chartColumns
    .filter((col) => col !== xAxisCol)
    .filter((col) =>
      data.slice(startRow, endRow + 1).some((row) => {
        const v = row[col];
        return v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
      })
    );

  // Compute Y domain
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = startRow; i <= endRow; i++) {
    numericColumns.forEach((col) => {
      const v = data[i]?.[col];
      if (v !== null && v !== undefined && v !== "" && !isNaN(Number(v))) {
        const n = Number(v);
        if (n < yMin) yMin = n;
        if (n > yMax) yMax = n;
      }
    });
  }
  if (!isFinite(yMin)) { yMin = 0; yMax = 100; }
  // Add 10% padding
  const yRange = yMax - yMin || 1;
  const yDomainMin = yMin - yRange * 0.1;
  const yDomainMax = yMax + yRange * 0.1;

  const xKey = xAxisCol || "__row__";
  const chartData: Record<string, unknown>[] = [];
  for (let i = startRow; i <= endRow; i++) {
    const point: Record<string, unknown> = {
      __row__: i + 1,
      __dataRowIndex__: i,
    };
    if (xAxisCol) {
      const xv = data[i]?.[xAxisCol];
      point[xAxisCol] = xv !== null && xv !== undefined ? String(xv) : "";
    }
    numericColumns.forEach((col) => {
      const v = data[i]?.[col];
      point[col] = v !== null && v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : null;
    });
    chartData.push(point);
  }

  // Apply drag preview to chartData
  if (dragPreview) {
    const pt = chartData[dragPreview.dataIndex];
    if (pt) {
      chartData[dragPreview.dataIndex] = { ...pt, [dragPreview.column]: dragPreview.value };
    }
  }

  // Get chart area bounds from the SVG
  const getChartArea = useCallback((): { top: number; bottom: number } | null => {
    const container = chartContainerRef.current;
    if (!container) return null;
    const svg = container.querySelector(".recharts-surface");
    if (!svg) return null;
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
      setDragPreview({ dataIndex: dragState.dataIndex, column: dragState.column, value: rounded });
    };

    const onMouseUp = (e: MouseEvent) => {
      const newValue = pixelToValue(e.clientY);
      if (newValue !== null) {
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

  // Custom dot component for dragging
  const makeDraggableDot = (column: string, color: string) => {
    const DraggableDot = (props: any) => {
      const { cx, cy, index, value } = props;
      if (cx === undefined || cy === undefined || value === null || value === undefined) return null;
      return (
        <circle
          cx={cx}
          cy={cy}
          r={dragState?.dataIndex === index && dragState?.column === column ? 6 : 4}
          fill={color}
          stroke="hsl(var(--background))"
          strokeWidth={2}
          style={{ cursor: "ns-resize" }}
          onMouseDown={(e) => handleDotMouseDown(index, column, Number(value), e)}
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

  const xLabel = xAxisCol || "Row";

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
          <span className="text-[10px] text-muted-foreground/60 italic">Drag points to adjust values</span>
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
            label={{ value: xLabel, position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            domain={[yDomainMin, yDomainMax]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              fontSize: 12,
              color: "hsl(var(--popover-foreground))",
            }}
          />
          {numericColumns.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              onClick={(e: any) => {
                const key = e.dataKey as string;
                setHiddenSeries((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              formatter={(value: string) => (
                <span style={{ color: hiddenSeries.has(value) ? "hsl(var(--muted-foreground))" : undefined, textDecoration: hiddenSeries.has(value) ? "line-through" : undefined, cursor: "pointer" }}>
                  {value}
                </span>
              )}
            />
          )}
          {numericColumns.map((col, i) => (
            <Line
              key={col}
              type="monotone"
              dataKey={col}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={hiddenSeries.has(col) ? false : makeDraggableDot(col, COLORS[i % COLORS.length])}
              activeDot={false}
              connectNulls
              hide={hiddenSeries.has(col)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpreadsheetChart;
