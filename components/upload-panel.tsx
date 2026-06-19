"use client";

import { useState } from "react";

interface UploadPanelProps {
  isAnalyzing: boolean;
  message: string | null;
  onAnalyze: (files: File[]) => Promise<void>;
  onPreview: (files: File[]) => Promise<void>;
  onFilesSelected?: (files: File[]) => void;
}

export function UploadPanel({ isAnalyzing, message, onAnalyze, onPreview, onFilesSelected }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <section className="panel" id="upload">
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
        <label className="dropzone">
          <span>
            <strong>Dateien auswaehlen</strong>
            <br />
            <span className="muted">PDF, XLSX, XLS, CSV, PNG oder JPG</span>
          </span>
          <input
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
            multiple
            onChange={(event) => {
              const nextFiles = Array.from(event.target.files ?? []);
              setFiles(nextFiles);
              onFilesSelected?.(nextFiles);
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

        <div className="uploadFooter">
          <div>
            <strong>{files.length}</strong> Datei(en) ausgewaehlt
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
