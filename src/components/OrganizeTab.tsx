import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, RotateCw, RotateCcw, Trash2, RefreshCw, Download, Info, Image as ImageIcon, Plus } from 'lucide-react';
import { loadPDF, renderPageFromDocument, compileWorkspace, convertImageToJpg } from '../utils/pdf';

interface WorkspacePage {
  id: string;
  type: 'pdf' | 'image';
  name: string;
  pdfId: string;
  pageNumber: number;
  dataUrl: string | null;
  rotation: number; // 0, 90, 180, 270
  deleted: boolean;
}

interface OrganizeTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

export const OrganizeTab: React.FC<OrganizeTabProps> = ({ addNotification }) => {
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [pdfBuffers, setPdfBuffers] = useState<{ [pdfId: string]: ArrayBuffer }>({});
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

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
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const renderPdfThumbnails = async (pdf: any, pdfId: string) => {
    const totalPages = pdf.numPages;
    for (let i = 0; i < totalPages; i++) {
      try {
        const url = await renderPageFromDocument(pdf, i + 1, 150);
        setPages((prev) =>
          prev.map((p) =>
            p.pdfId === pdfId && p.pageNumber === i + 1 ? { ...p, dataUrl: url } : p
          )
        );
      } catch (err) {
        console.error(`Error rendering page ${i + 1} of PDF ${pdfId}:`, err);
      }
    }
    if (pdf.destroy) {
      await pdf.destroy();
    }
  };

  const processFiles = async (selectedFiles: File[]) => {
    setIsProcessing(true);
    setLoadingStep('Processing files...');
    
    const newPages: WorkspacePage[] = [];
    const newPdfBuffers = { ...pdfBuffers };
    
    for (const file of selectedFiles) {
      const filename = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || filename.endsWith('.pdf');
      const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/.test(filename);
      
      if (isPdf) {
        setLoadingStep(`Reading PDF: ${file.name}...`);
        try {
          const pdfId = 'pdf_' + Math.random().toString(36).substring(2, 9);
          const buffer = await file.arrayBuffer();
          newPdfBuffers[pdfId] = buffer;
          
          const pdf = await loadPDF(buffer);
          const totalPages = pdf.numPages;
          
          const pdfPages: WorkspacePage[] = Array.from({ length: totalPages }, (_, i) => ({
            id: Math.random().toString(36).substring(2, 9),
            type: 'pdf',
            name: file.name,
            pdfId,
            pageNumber: i + 1,
            dataUrl: null,
            rotation: 0,
            deleted: false,
          }));
          
          newPages.push(...pdfPages);
          
          // Fire-and-forget background thumbnail generator
          renderPdfThumbnails(pdf, pdfId);
        } catch (err) {
          console.error('Error reading PDF:', err);
          addNotification(`Failed to load PDF "${file.name}"`, 'error');
        }
      } else if (isImg) {
        setLoadingStep(`Processing Image: ${file.name}...`);
        try {
          const dataUrl = await convertImageToJpg(file);
          newPages.push({
            id: Math.random().toString(36).substring(2, 9),
            type: 'image',
            name: file.name,
            pdfId: '',
            pageNumber: 0,
            dataUrl,
            rotation: 0,
            deleted: false,
          });
        } catch (err) {
          console.error('Error reading image:', err);
          addNotification(`Failed to load image "${file.name}"`, 'error');
        }
      } else {
        addNotification(`Unsupported file type: "${file.name}"`, 'error');
      }
    }
    
    if (newPages.length > 0) {
      setPages((prev) => [...prev, ...newPages]);
      setPdfBuffers(newPdfBuffers);
      addNotification(`Added ${newPages.length} page(s) successfully.`, 'success');
    }
    setIsProcessing(false);
    setLoadingStep('');
  };

  const rotatePage = (id: string, direction: 'cw' | 'ccw') => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const change = direction === 'cw' ? 90 : -90;
        const newRotation = (p.rotation + change + 360) % 360;
        return { ...p, rotation: newRotation };
      })
    );
  };

  const toggleDeletePage = (id: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
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
    const activePages = pages.filter((p) => !p.deleted);
    if (activePages.length === 0) {
      addNotification('Cannot export a PDF with zero pages. Please restore at least one page.', 'error');
      return;
    }

    setIsProcessing(true);
    setLoadingStep('Compiling and generating PDF document...');
    
    try {
      const compileData = activePages.map((p) => ({
        type: p.type,
        pdfBuffer: p.type === 'pdf' ? pdfBuffers[p.pdfId] : undefined,
        pageNumber: p.pageNumber,
        dataUrl: p.dataUrl,
        rotation: p.rotation,
      }));

      const modifiedBytes = await compileWorkspace(compileData);
      
      const blob = new Blob([modifiedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organized_${Date.now()}.pdf`;
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

  const clearWorkspace = () => {
    setPages([]);
    setPdfBuffers({});
    addNotification('Workspace cleared.', 'success');
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
      {pages.length === 0 ? (
        <div 
          className={`dropzone ${isDragOver ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={48} className="dropzone-icon" />
          <div className="dropzone-title">Upload PDFs or Images to Organize Pages</div>
          <div className="dropzone-desc">Drag & drop files here, or click to browse</div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="file-input" 
            accept=".pdf,application/pdf,image/*"
            multiple
            onChange={handleFileChange} 
          />
        </div>
      ) : (
        <>
          <div className="organize-actions">
            <div className="file-item-left" style={{ maxWidth: '350px' }}>
              <FileText size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <div className="file-info">
                <div className="file-name" style={{ fontSize: '0.95rem' }} title="Current Workspace">
                  PDF Workspace
                </div>
                <div className="file-meta">
                  <span>Pages: {pages.filter(p => !p.deleted).length} of {pages.length}</span>
                </div>
              </div>
            </div>

            <div className="organize-buttons">
              <button className="btn btn-secondary" onClick={() => addMoreInputRef.current?.click()} disabled={isProcessing}>
                <Plus size={14} />
                Add Files
              </button>
              <input 
                type="file" 
                ref={addMoreInputRef} 
                className="file-input" 
                accept=".pdf,application/pdf,image/*"
                multiple
                onChange={handleFileChange} 
              />
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
              <button className="btn btn-secondary" onClick={clearWorkspace} disabled={isProcessing}>
                Clear All
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
                key={p.id} 
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
                      alt={`Page ${index + 1}`}
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
                        onClick={() => toggleDeletePage(p.id)}
                      >
                        Restore
                      </button>
                    </div>
                  )}
                </div>

                <div className="page-number-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {p.type === 'pdf' ? <FileText size={12} style={{ opacity: 0.8 }} /> : <ImageIcon size={12} style={{ opacity: 0.8 }} />}
                  <span>Page {index + 1}</span>
                </div>

                {!p.deleted && (
                  <div className="page-card-controls">
                    <button 
                      className="page-card-btn" 
                      onClick={() => rotatePage(p.id, 'ccw')}
                      title="Rotate counter-clockwise"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button 
                      className="page-card-btn" 
                      onClick={() => rotatePage(p.id, 'cw')}
                      title="Rotate clockwise"
                    >
                      <RotateCw size={14} />
                    </button>
                    <button 
                      className="page-card-btn delete" 
                      onClick={() => toggleDeletePage(p.id)}
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

      {pages.length === 0 && !isProcessing && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>How it works</p>
            <ul>
              <li>Upload one or multiple PDF documents or image files (PNG, JPG, WEBP, GIF, SVG) using the dropzone.</li>
              <li>PDF pages are rendered visually in real-time, while images populate directly.</li>
              <li>Drag and drop the thumbnails to reorder them in any sequence.</li>
              <li>Hover over a page to rotate it or delete it. Deleted pages can be restored before export.</li>
              <li>Use the controls at the top to add more files, rotate all pages, reset changes, or clear the workspace.</li>
              <li>Click "Export PDF" to compile everything into a single PDF. Page operations are executed instantly in the browser.</li>
            </ul>
          </div>
        </div>
      )}

      {isProcessing && pages.length === 0 && (
        <div className="loader-container">
          <div className="spinner" />
          <div>Loading pages...</div>
        </div>
      )}
    </div>
  );
};
