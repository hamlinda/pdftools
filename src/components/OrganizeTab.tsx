import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, RotateCw, RotateCcw, Trash2, RefreshCw, Download, Info } from 'lucide-react';
import { loadPDF, renderPageFromDocument, modifyPDF } from '../utils/pdf';

interface PageState {
  pageIndex: number;
  dataUrl: string | null;
  rotation: number; // 0, 90, 180, 270
  deleted: boolean;
}

interface OrganizeTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

export const OrganizeTab: React.FC<OrganizeTabProps> = ({ addNotification }) => {
  const [file, setFile] = useState<File | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
      addNotification('Please select a valid PDF file.', 'error');
      return;
    }

    // Cancel any ongoing thumbnail generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    setIsProcessing(true);
    setFile(selectedFile);
    setPages([]);
    
    try {
      setLoadingStep('Reading file data...');
      const buffer = await selectedFile.arrayBuffer();
      setArrayBuffer(buffer);

      setLoadingStep('Analyzing pages...');
      const pdf = await loadPDF(buffer);
      const totalPages = pdf.numPages;
      
      // Initialize page states immediately with placeholders
      const initialPages: PageState[] = Array.from({ length: totalPages }, (_, i) => ({
        pageIndex: i,
        dataUrl: null,
        rotation: 0,
        deleted: false,
      }));
      setPages(initialPages);

      // Render thumbnails incrementally
      for (let i = 0; i < totalPages; i++) {
        if (abortSignal.aborted) {
          if (pdf.destroy) await pdf.destroy();
          return;
        }
        setLoadingStep(`Rendering thumbnail for page ${i + 1} of ${totalPages}...`);
        
        try {
          const url = await renderPageFromDocument(pdf, i + 1, 150);
          setPages((prev) => 
            prev.map((p) => p.pageIndex === i ? { ...p, dataUrl: url } : p)
          );
        } catch (err) {
          console.error(`Error rendering page ${i + 1}:`, err);
        }
      }

      if (pdf.destroy) {
        await pdf.destroy();
      }

      addNotification('PDF loaded and thumbnails generated.', 'success');
    } catch (err) {
      console.error('Error opening PDF:', err);
      addNotification('Failed to read the PDF document.', 'error');
      setFile(null);
      setArrayBuffer(null);
      setPages([]);
    } finally {
      setIsProcessing(false);
      setLoadingStep('');
    }
  };

  const rotatePage = (pageIndex: number, direction: 'cw' | 'ccw') => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.pageIndex !== pageIndex) return p;
        const change = direction === 'cw' ? 90 : -90;
        const newRotation = (p.rotation + change + 360) % 360;
        return { ...p, rotation: newRotation };
      })
    );
  };

  const toggleDeletePage = (pageIndex: number) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.pageIndex !== pageIndex) return p;
        return { ...p, deleted: !p.deleted };
      })
    );
  };

  const rotateAll = (direction: 'cw' | 'ccw') => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.deleted) return p;
        const change = direction === 'cw' ? 90 : -90;
        const newRotation = (p.rotation + change + 360) % 360;
        return { ...p, rotation: newRotation };
      })
    );
    addNotification(`Rotated all pages ${direction === 'cw' ? 'clockwise' : 'counter-clockwise'}.`, 'success');
  };

  const resetAll = () => {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        rotation: 0,
        deleted: false,
      }))
    );
    addNotification('All changes reset.', 'success');
  };

  const handleExport = async () => {
    if (!arrayBuffer || pages.length === 0) return;

    const activePagesCount = pages.filter((p) => !p.deleted).length;
    if (activePagesCount === 0) {
      addNotification('Cannot export a PDF with zero pages. Please restore at least one page.', 'error');
      return;
    }

    setIsProcessing(true);
    setLoadingStep('Compiling and saving PDF...');
    
    try {
      const operations = pages.map((p) => ({
        pageIndex: p.pageIndex,
        rotation: p.rotation,
        deleted: p.deleted,
      }));

      const modifiedBytes = await modifyPDF(arrayBuffer, operations);
      
      const blob = new Blob([modifiedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organized_${file?.name || 'document.pdf'}`;
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification('Organized PDF exported and downloaded successfully!', 'success');
    } catch (err) {
      console.error('Error modifying PDF:', err);
      addNotification('Failed to compile the new PDF document.', 'error');
    } finally {
      setIsProcessing(false);
      setLoadingStep('');
    }
  };

  const clearFile = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFile(null);
    setArrayBuffer(null);
    setPages([]);
  };

  const handleCardDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleCardDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCardDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    setPages((prev) => {
      const result = [...prev];
      const [removed] = result.splice(draggedIndex, 1);
      result.splice(targetIndex, 0, removed);
      return result;
    });
    setDraggedIndex(null);
  };

  return (
    <div className="tool-card">
      {!file ? (
        <div 
          className={`dropzone ${isDragOver ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={48} className="dropzone-icon" />
          <div className="dropzone-title">Upload a PDF to Organize Pages</div>
          <div className="dropzone-desc">Drag & drop a file, or click to browse</div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="file-input" 
            accept=".pdf,application/pdf"
            onChange={handleFileChange} 
          />
        </div>
      ) : (
        <>
          <div className="organize-actions">
            <div className="file-item-left" style={{ maxWidth: '350px' }}>
              <FileText size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <div className="file-info">
                <div className="file-name" style={{ fontSize: '0.95rem' }} title={file.name}>
                  {file.name}
                </div>
                <div className="file-meta">
                  <span>Pages: {pages.filter(p => !p.deleted).length} of {pages.length}</span>
                </div>
              </div>
            </div>

            <div className="organize-buttons">
              <button className="btn btn-secondary" onClick={resetAll} disabled={isProcessing}>
                <RefreshCw size={14} />
                Reset
              </button>
              <button className="btn btn-secondary" onClick={() => rotateAll('ccw')} disabled={isProcessing}>
                <RotateCcw size={14} />
                Rotate All Left
              </button>
              <button className="btn btn-secondary" onClick={() => rotateAll('cw')} disabled={isProcessing}>
                <RotateCw size={14} />
                Rotate All Right
              </button>
              <button className="btn btn-secondary" onClick={clearFile} disabled={isProcessing}>
                Change File
              </button>
              <button className="btn btn-success" onClick={handleExport} disabled={isProcessing}>
                <Download size={14} />
                Export PDF
              </button>
            </div>
          </div>

          {loadingStep && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <div className="spinner spinner-cyan" style={{ width: '16px', height: '16px' }} />
              <span>{loadingStep}</span>
            </div>
          )}

          <div className="thumbnail-container">
            {pages.map((p, index) => (
              <div 
                key={p.pageIndex} 
                className={`page-card ${p.deleted ? 'deleted' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
                style={{
                  opacity: draggedIndex === index ? 0.4 : (p.deleted ? 0.35 : 1),
                  filter: p.deleted ? 'grayscale(80%)' : 'none',
                  cursor: p.deleted ? 'not-allowed' : 'grab',
                }}
                draggable={!isProcessing && !p.deleted}
                onDragStart={() => handleCardDragStart(index)}
                onDragOver={handleCardDragOver}
                onDrop={() => handleCardDrop(index)}
                onDragEnd={() => setDraggedIndex(null)}
              >
                <div className="canvas-wrapper">
                  {p.dataUrl ? (
                    <img 
                      src={p.dataUrl} 
                      alt={`Page ${p.pageIndex + 1}`}
                      className="page-thumbnail"
                      style={{
                        transform: `rotate(${p.rotation}deg)`,
                      }}
                    />
                  ) : (
                    <div className="spinner spinner-cyan" style={{ width: '24px', height: '24px' }} />
                  )}
                  
                  {p.deleted && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'rgba(15, 23, 42, 0.75)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: '8px',
                      zIndex: 2,
                    }}>
                      <span style={{ color: 'var(--color-danger)', fontWeight: 700, fontSize: '0.9rem' }}>DELETED</span>
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                        onClick={() => toggleDeletePage(p.pageIndex)}
                      >
                        Restore
                      </button>
                    </div>
                  )}
                </div>

                <div className="page-number-badge">
                  Page {p.pageIndex + 1}
                </div>

                {!p.deleted && (
                  <div className="page-card-controls">
                    <button 
                      className="page-card-btn" 
                      onClick={() => rotatePage(p.pageIndex, 'ccw')}
                      title="Rotate counter-clockwise"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button 
                      className="page-card-btn" 
                      onClick={() => rotatePage(p.pageIndex, 'cw')}
                      title="Rotate clockwise"
                    >
                      <RotateCw size={14} />
                    </button>
                    <button 
                      className="page-card-btn delete" 
                      onClick={() => toggleDeletePage(p.pageIndex)}
                      title="Delete page"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!file && !isProcessing && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>How it works</p>
            <ul>
              <li>Upload a single PDF document. Pages will load visually in real-time.</li>
              <li>Drag and drop the page thumbnails to reorder them in any sequence.</li>
              <li>Hover over a page to rotate it 90 degrees left/right, or delete it.</li>
              <li>Use the controls at the top to apply actions to the whole document (Rotate All, Reset, etc.).</li>
              <li>Click "Export PDF" to download your modified document. Page updates are executed instantly in the browser.</li>
            </ul>
          </div>
        </div>
      )}

      {isProcessing && !file && (
        <div className="loader-container">
          <div className="spinner" />
          <div>Loading PDF pages...</div>
        </div>
      )}
    </div>
  );
};
