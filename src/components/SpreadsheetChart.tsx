import React from "react";
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
  /** Selected full columns */
  selectedColumns: Set<number>;
  /** Selected cell range: {startRow, endRow, startCol, endCol} */
  cellRange: { startRow: number; endRow: number; startCol: number; endCol: number } | null;
  onClose: () => void;
}

const SpreadsheetChart: React.FC<SpreadsheetChartProps> = ({
  data,
  columns,
  selectedColumns,
  cellRange,
  onClose,
}) => {
  // Determine which columns and row range to chart
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

  // Filter to only numeric columns
  const numericColumns = chartColumns.filter((col) =>
    data.slice(startRow, endRow + 1).some((row) => {
      const v = row[col];
      return v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
    })
  );

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

  const chartData = [];
  for (let i = startRow; i <= endRow; i++) {
    const point: Record<string, unknown> = { row: i + 1 };
    numericColumns.forEach((col) => {
      const v = data[i]?.[col];
      point[col] = v !== null && v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : null;
    });
    chartData.push(point);
  }

  return (
    <div className="border-t border-border bg-card p-4" style={{ height: 280 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Chart — {numericColumns.join(", ")}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-line))" />
          <XAxis
            dataKey="row"
            label={{ value: "Row", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
          />
          <YAxis
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
          {numericColumns.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {numericColumns.map((col, i) => (
            <Line
              key={col}
              type="monotone"
              dataKey={col}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpreadsheetChart;
