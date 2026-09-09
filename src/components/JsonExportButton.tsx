import React from "react";
import { FileJson, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

/** JSON export split button: default click exports array-of-objects, dropdown offers the object-of-columns alternative */
const JsonExportButton: React.FC<{ onExportArray: () => void; onExportObject: () => void }> = ({ onExportArray, onExportObject }) => (
  <div className="flex items-center rounded overflow-hidden">
    <button
      onClick={onExportArray}
      className="flex items-center gap-1 pl-2 pr-1.5 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors"
      title="Export as array of objects"
    >
      <FileJson size={13} /> JSON
    </button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center px-1 py-1 text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors"
          title="More JSON export options"
        >
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Export shape</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onExportArray} className="text-xs">
          Array of objects <span className="text-muted-foreground/60 ml-1">(recommended)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportObject} className="text-xs">
          Single object of columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export default JsonExportButton;
