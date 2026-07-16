"use client";

import { useEffect, useRef, useState } from "react";

interface UploadPanelProps {
  isAnalyzing: boolean;
  message: string | null;
  onAnalyze: (files: File[]) => Promise<void>;
  onPreview: (files: File[]) => Promise<void>;
  onFilesSelected?: (files: File[]) => void;
}

export function UploadPanel({ isAnalyzing, message, onAnalyze, onPreview, onFilesSelected }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const selectFiles = (nextFiles: File[]) => {
    setFiles(nextFiles);
    onFilesSelected?.(nextFiles);
  };
  const handleDroppedFiles = (fileList: FileList | null) => {
    const nextFiles = Array.from(fileList ?? []);
    if (nextFiles.length > 0) selectFiles(nextFiles);
    dragDepth.current = 0;
    setIsDragging(false);
  };

  useEffect(() => {
    const preventBrowserFileOpen = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    window.addEventListener("dragover", preventBrowserFileOpen);
    window.addEventListener("drop", preventBrowserFileOpen);
    return () => {
      window.removeEventListener("dragover", preventBrowserFileOpen);
      window.removeEventListener("drop", preventBrowserFileOpen);
    };
  }, []);

  return (
    <section
      className={`panel uploadDropPanel ${isDragging ? "uploadDropPanelActive" : ""}`}
      id="upload"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        handleDroppedFiles(event.dataTransfer.files);
      }}
    >
      <div className="panelHeader">
        <div>
          <h2>Upload Bereich</h2>
          <p>
            Rechnungen, Angebote, Scans und Excel-Dateien hochladen. Die Analyse nutzt OCR,
            PDF-Textauslesung, Excel-Auslesung und KI-Extraktion.
          </p>
        </div>
        <span className="status statusNeutral">{isAnalyzing ? "Analyse laeuft" : "Bereit"}</span>
      </div>

      <div className="uploadBox">
        <label
          className={`dropzone ${isDragging ? "dropzoneActive" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleDroppedFiles(event.dataTransfer.files);
          }}
        >
          <span>
            <strong>{isDragging ? "Datei loslassen zum Hochladen" : "Dateien auswaehlen"}</strong>
            <br />
            <span className="muted">Klicken oder irgendwo auf dieser Upload-Karte ablegen. PDF, XLSX, XLS, CSV, PNG oder JPG</span>
          </span>
          <input
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
            multiple
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => {
              const nextFiles = Array.from(event.target.files ?? []);
              selectFiles(nextFiles);
            }}
          />
        </label>

        <div className="uploadTypes" aria-label="Erlaubte Dateitypen">
          <span className="pill">OCR fuer Scans</span>
          <span className="pill">PDF Analyse</span>
          <span className="pill">Excel Analyse</span>
          <span className="pill">KI Extraktion</span>
          <span className="pill">Dublettenpruefung</span>
          <span className="pill">Quellen je Feld</span>
        </div>
        <p className="muted uploadHint">OneDrive-Dateien funktionieren am stabilsten, wenn sie lokal verfuegbar sind. Ziehe die Datei ins Browserfenster und lasse sie erst los, wenn die Uploadflaeche markiert ist.</p>

        <div className="uploadFooter">
          <div>
            <strong>{files.length}</strong> Datei(en) ausgewaehlt
            {files.length > 0 ? <p className="muted">Gesamtgroesse: {formatFileSize(totalBytes)}</p> : null}
            {message ? <p className="muted">{message}</p> : null}
          </div>
          <button
            type="button"
            disabled={isAnalyzing || files.length === 0}
            onClick={() => onPreview(files)}
          >
            Text pruefen
          </button>
          <button
            type="button"
            disabled={isAnalyzing || files.length === 0}
            onClick={() => onAnalyze(files)}
          >
            {isAnalyzing ? "Analysiere..." : "Dokumente analysieren"}
          </button>
        </div>
      </div>
    </section>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}
