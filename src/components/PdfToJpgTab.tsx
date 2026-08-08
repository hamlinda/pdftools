import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Image as ImageIcon, Info, CheckCircle, AlertCircle } from 'lucide-react';

interface PdfToJpgTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

interface QueuedFile {
  id: string;
  file: File;
  sizeStr: string;
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number;
  statusText: string;
}

export const PdfToJpgTab: React.FC<PdfToJpgTabProps> = ({ addNotification }) => {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [joinPages, setJoinPages] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFiles = (selectedFiles: FileList) => {
    if (isProcessing) return;
    const newFiles: QueuedFile[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        addNotification(`"${file.name}" is not a PDF file.`, 'error');
        continue;
      }
      
      if (file.size > 20 * 1024 * 1024) {
        addNotification(`"${file.name}" exceeds the 20MB conversion limit.`, 'error');
        continue;
      }

      newFiles.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        sizeStr: formatBytes(file.size),
        status: 'idle',
        progress: 0,
        statusText: 'Ready',
      });
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      addNotification(`Added ${newFiles.length} PDF file(s).`, 'success');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    if (isProcessing) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
    addNotification('File removed from queue.', 'success');
  };

  const clearAll = () => {
    if (isProcessing) return;
    setFiles([]);
    addNotification('Queue cleared.', 'success');
  };

  const updateFileState = (
    id: string,
    updates: Partial<Pick<QueuedFile, 'status' | 'progress' | 'statusText'>>
  ) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const handleConvertAll = async () => {
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    addNotification('Starting conversions...', 'success');

    // Reset status of all files in queue
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: 'idle',
        progress: 0,
        statusText: 'Ready',
      }))
    );

    // Iteratively cycle through the queue
    for (let i = 0; i < files.length; i++) {
      const fileObj = files[i];
      
      updateFileState(fileObj.id, {
        status: 'processing',
        progress: 10,
        statusText: 'Uploading PDF to server...',
      });

      // Progress bar animation simulator
      let currentProg = 10;
      const progressInterval = setInterval(() => {
        if (currentProg < 90) {
          currentProg += currentProg < 50 ? 8 : 4;
          let text = 'Rendering PDF pages...';
          if (currentProg > 70) {
            text = joinPages ? 'Merging pages vertically...' : 'Packaging images into zip...';
          }
          updateFileState(fileObj.id, {
            progress: currentProg,
            statusText: text,
          });
        }
      }, 300);

      try {
        const formData = new FormData();
        formData.append('file', fileObj.file);
        formData.append('join_pages', joinPages.toString());

        const response = await fetch('/api/pdf-to-jpg', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          let errMsg = 'Conversion failed.';
          try {
            const errData = await response.json();
            errMsg = errData.detail || errMsg;
          } catch {
            const txt = await response.text();
            if (txt) errMsg = txt.substring(0, 100);
          }
          throw new Error(errMsg);
        }

        updateFileState(fileObj.id, {
          progress: 100,
          statusText: 'Downloading...',
        });

        // Trigger browser download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Handle file naming
        const baseName = fileObj.file.name.replace(/\.[^/.]+$/, "");
        const isZip = response.headers.get('Content-Type')?.includes('zip') || 
                      (!joinPages && blob.type.includes('zip'));
        a.download = isZip ? `${baseName}_images.zip` : `${baseName}.jpg`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateFileState(fileObj.id, {
          status: 'success',
          statusText: 'Completed',
        });
        
        // Wait a short duration before processing the next file
        await new Promise((resolve) => setTimeout(resolve, 800));

      } catch (err: any) {
        clearInterval(progressInterval);
        console.error('Error converting file:', fileObj.file.name, err);
        updateFileState(fileObj.id, {
          status: 'error',
          progress: 0,
          statusText: err.message || 'Error occurred',
        });
        addNotification(`Failed to convert "${fileObj.file.name}".`, 'error');
        
        // Pause briefly before carrying on with the rest of the queue
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setIsProcessing(false);
    addNotification('All conversions in the queue processed!', 'success');
  };

  return (
    <div className="tool-card">
      <div 
        className={`dropzone ${isDragOver ? 'dragover' : ''} ${isProcessing ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
      >
        <UploadCloud size={48} className="dropzone-icon" />
        <div className="dropzone-title">Drag & drop multiple PDFs here</div>
        <div className="dropzone-desc">or click to browse from your computer (limit 20MB per file)</div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="file-input" 
          multiple 
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
      </div>

      {files.length > 0 && (
        <>
          <div className="options-panel" style={{
            marginTop: '20px',
            padding: '16px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <input
              type="checkbox"
              id="join-pages-checkbox"
              checked={joinPages}
              onChange={(e) => setJoinPages(e.target.checked)}
              disabled={isProcessing}
              style={{
                width: '18px',
                height: '18px',
                accentColor: 'var(--color-secondary)',
                cursor: isProcessing ? 'not-allowed' : 'pointer'
              }}
            />
            <label htmlFor="join-pages-checkbox" style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
              <strong>Join pages vertically:</strong> Combine multi-page PDFs into one single long JPG image instead of generating individual JPGs.
            </label>
          </div>

          <div className="file-list" style={{ marginTop: '20px', maxHeight: '350px', overflowY: 'auto' }}>
            {files.map((fileObj) => (
              <div 
                key={fileObj.id} 
                className={`file-item`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 16px',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-md)',
                  background: fileObj.status === 'processing' ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                  marginBottom: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div className="file-item-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                    <FileText size={24} style={{ 
                      color: fileObj.status === 'success' ? 'var(--color-success)' : fileObj.status === 'error' ? 'var(--color-danger)' : 'var(--color-primary)', 
                      flexShrink: 0 
                    }} />
                    <div className="file-info" style={{ overflow: 'hidden' }}>
                      <div className="file-name" style={{
                        fontWeight: 500,
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden'
                      }} title={fileObj.file.name}>
                        {fileObj.file.name}
                      </div>
                      <div className="file-meta" style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span>Size: {fileObj.sizeStr}</span>
                        <span style={{ 
                          color: fileObj.status === 'success' ? 'var(--color-success)' : fileObj.status === 'error' ? 'var(--color-danger)' : fileObj.status === 'processing' ? 'var(--color-secondary)' : 'var(--text-muted)'
                        }}>
                          {fileObj.statusText}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="file-item-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {fileObj.status === 'success' && <CheckCircle size={20} style={{ color: 'var(--color-success)' }} />}
                    {fileObj.status === 'error' && <AlertCircle size={20} style={{ color: 'var(--color-danger)' }} />}
                    {fileObj.status === 'processing' && <div className="spinner" style={{ width: '18px', height: '18px', border: '2px solid rgba(255, 255, 255, 0.1)', borderTopColor: 'var(--color-secondary)' }} />}
                    
                    <button 
                      className="btn-icon-only danger" 
                      onClick={() => removeFile(fileObj.id)}
                      disabled={isProcessing}
                      style={{ opacity: isProcessing ? 0.3 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                      title="Remove from queue"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {fileObj.status === 'processing' && (
                  <div style={{ width: '100%', marginTop: '4px' }}>
                    <div className="progress-bar-container" style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div className="progress-bar" style={{ width: `${fileObj.progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '16px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={clearAll} 
              disabled={isProcessing}
            >
              Clear All
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleConvertAll}
              disabled={isProcessing || files.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <ImageIcon size={18} />
              {isProcessing ? 'Converting Queue...' : 'Convert PDFs to JPG'}
            </button>
          </div>
        </>
      )}

      {files.length === 0 && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>PDF to JPG Conversion</p>
            <ul>
              <li>Upload one or multiple PDF documents at the same time.</li>
              <li>Toggle "Join pages vertically" if you want multi-page documents to merge into a single tall JPG image.</li>
              <li>Click "Convert PDFs to JPG" to start. The application will cycle through the files sequentially, process them on your local backend, and download them automatically in your browser.</li>
              <li>Single-page files and joined multi-page files download directly as a `.jpg`. Standard multi-page files download as a `.zip` containing each page as an individual image.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
