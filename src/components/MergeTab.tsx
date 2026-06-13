import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, GripVertical, Merge, Info } from 'lucide-react';
import { getNumPages, mergePDFs } from '../utils/pdf';

interface SelectedFile {
  id: string;
  file: File;
  pages: number;
  sizeStr: string;
}

interface MergeTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

export const MergeTab: React.FC<MergeTabProps> = ({ addNotification }) => {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFiles = async (selectedFiles: FileList) => {
    setIsProcessing(true);
    const newFiles: SelectedFile[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        addNotification(`"${file.name}" is not a PDF file.`, 'error');
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pages = await getNumPages(arrayBuffer);
        
        newFiles.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          pages,
          sizeStr: formatBytes(file.size),
        });
      } catch (err) {
        console.error('Error reading PDF:', err);
        addNotification(`Failed to read "${file.name}". It might be corrupted or encrypted.`, 'error');
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      addNotification(`Added ${newFiles.length} file(s) successfully.`, 'success');
    }
    setIsProcessing(false);
  };

  // Drag and drop handlers for Dropzone
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
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    addNotification('File removed from list.', 'success');
  };

  // HTML5 Drag and Drop for Reordering Files
  const handleItemDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleItemDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;

    setFiles((prev) => {
      const result = [...prev];
      const [removed] = result.splice(draggedIndex, 1);
      result.splice(index, 0, removed);
      return result;
    });
    setDraggedIndex(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      addNotification('Please add at least 2 PDF files to merge.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const filesData = await Promise.all(
        files.map(async (f) => {
          const buffer = await f.file.arrayBuffer();
          return { data: buffer, name: f.file.name };
        })
      );

      const mergedBytes = await mergePDFs(filesData);
      
      // Download merged file
      const blob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification('PDFs merged and downloaded successfully!', 'success');
    } catch (err) {
      console.error('Error merging PDFs:', err);
      addNotification('An error occurred while merging the PDF files.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="tool-card">
      <div 
        className={`dropzone ${isDragOver ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud size={48} className="dropzone-icon" />
        <div className="dropzone-title">Drag & drop multiple PDFs here</div>
        <div className="dropzone-desc">or click to browse from your computer</div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="file-input" 
          multiple 
          accept=".pdf,application/pdf"
          onChange={handleFileChange} 
        />
      </div>

      {files.length > 0 && (
        <>
          <div className="file-list">
            {files.map((fileObj, index) => (
              <div 
                key={fileObj.id} 
                className={`file-item ${draggedIndex === index ? 'dragging' : ''}`}
                draggable
                onDragStart={() => handleItemDragStart(index)}
                onDragOver={(e) => handleItemDragOver(e, index)}
                onDrop={() => handleItemDrop(index)}
                onDragEnd={() => setDraggedIndex(null)}
              >
                <div className="file-item-left">
                  <div className="drag-handle" title="Drag to reorder">
                    <GripVertical size={18} />
                  </div>
                  <FileText size={24} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <div className="file-info">
                    <div className="file-name" title={fileObj.file.name}>{fileObj.file.name}</div>
                    <div className="file-meta">
                      <span>Pages: {fileObj.pages}</span>
                      <span>Size: {fileObj.sizeStr}</span>
                    </div>
                  </div>
                </div>
                <div className="file-item-right">
                  <button 
                    className="btn-icon-only danger" 
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(fileObj.id);
                    }}
                    title="Remove file"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setFiles([])} 
              disabled={isProcessing}
            >
              Clear All
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleMerge}
              disabled={isProcessing || files.length < 2}
            >
              <Merge size={18} />
              {isProcessing ? 'Merging...' : 'Merge PDFs'}
            </button>
          </div>
        </>
      )}

      {files.length === 0 && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>How it works</p>
            <ul>
              <li>Upload two or more PDF documents using the dropzone above.</li>
              <li>Use the drag handle <GripVertical size={12} style={{ display: 'inline' }} /> to reorder documents in the list.</li>
              <li>Click "Merge PDFs" to combine the files. The operation happens entirely in your browser.</li>
            </ul>
          </div>
        </div>
      )}

      {isProcessing && files.length === 0 && (
        <div className="loader-container">
          <div className="spinner" />
          <div>Reading documents...</div>
        </div>
      )}
    </div>
  );
};
