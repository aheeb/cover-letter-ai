import { cn } from "@/lib/utils";
import { FileText, Upload, X } from "lucide-react";
import * as React from "react";

interface FileUploadProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  accept?: string;
  label?: string;
  description?: string;
}

export function FileUpload({
  file,
  onFileSelect,
  accept,
  label = "Upload file",
  description = "Drag and drop or click to upload",
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "group relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 transition-colors hover:bg-zinc-50",
        isDragging && "border-zinc-900 bg-zinc-50",
        file && "border-zinc-200 bg-zinc-50/50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
      />

      {file ? (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <div className="rounded-full bg-zinc-100 p-2">
            <FileText className="h-6 w-6 text-zinc-600" />
          </div>
          <div className="text-sm font-medium text-zinc-900">{file.name}</div>
          <div className="text-xs text-zinc-500">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </div>
          <button
            onClick={handleRemove}
            className="absolute right-2 top-2 rounded-full p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <div className="rounded-full bg-zinc-100 p-2 group-hover:bg-zinc-200">
            <Upload className="h-6 w-6 text-zinc-500" />
          </div>
          <div className="text-sm font-medium text-zinc-900">{label}</div>
          <div className="text-xs text-zinc-500">{description}</div>
        </div>
      )}
    </div>
  );
}
