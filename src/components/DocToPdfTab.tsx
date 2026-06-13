import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Info, Sparkles } from 'lucide-react';

interface DocToPdfTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

export const DocToPdfTab: React.FC<DocToPdfTabProps> = ({ addNotification }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    const filename = selectedFile.name.toLowerCase();
    const isDoc = filename.endsWith('.doc') || filename.endsWith('.docx');
    const isText = filename.endsWith('.txt');
    const isMd = filename.endsWith('.md');

    if (!isDoc && !isText && !isMd) {
      addNotification('Please select a valid Word (.doc/.docx), Text (.txt), or Markdown (.md) file.', 'error');
      return;
    }
    
    // Size limit of 15MB
    if (selectedFile.size > 15 * 1024 * 1024) {
      addNotification('File exceeds the 15MB limit for conversion.', 'error');
      return;
    }

    setFile(selectedFile);
    addNotification('File selected for conversion.', 'success');
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(10);
    setStatusText('Uploading document to local server...');

    // Progress simulation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 35) {
          return prev + 5; // upload stage
        } else if (prev < 80) {
          setStatusText('Processing document & converting to PDF layout...');
          return prev + 3; // conversion stage
        } else if (prev < 96) {
          setStatusText('Finalizing PDF document structure...');
          return prev + 1; // wrapping up
        }
        return prev;
      });
    }, 350);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/doc-to-pdf', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      const contentType = response.headers.get('Content-Type') || '';
      
      if (!response.ok || contentType.includes('application/json')) {
        let errMsg = 'Conversion failed.';
        try {
          const errData = await response.json();
          errMsg = errData.detail || errMsg;
        } catch (e) {
          const text = await response.text();
          if (text) errMsg = text.substring(0, 100);
        }
        throw new Error(errMsg);
      }

      setProgress(100);
      setStatusText('Download started!');
      addNotification('Document successfully converted to PDF!', 'success');

      // Process download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Replace file extension
      const pdfName = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
      a.download = pdfName;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Reset state after a short delay
      setTimeout(() => {
        setFile(null);
        setIsProcessing(false);
        setProgress(0);
        setStatusText('');
      }, 2000);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error('Conversion error:', err);
      addNotification(err.message || 'An error occurred during conversion.', 'error');
      setIsProcessing(false);
      setProgress(0);
      setStatusText('');
    }
  };

  const getFileIconColor = () => {
    if (!file) return 'var(--color-primary)';
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'var(--color-secondary)';
    if (name.endsWith('.md')) return 'var(--color-accent)';
    return 'var(--color-success)';
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
          <div className="dropzone-title">Convert Document to PDF</div>
          <div className="dropzone-desc">Drag & drop a Word (.doc/.docx), Text (.txt), or Markdown (.md) file here, or click to browse</div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="file-input" 
            accept=".doc,.docx,.txt,.md"
            onChange={handleFileChange} 
          />
        </div>
      ) : (
        <div className="convert-status-container">
          <div 
            className="doc-preview-icon"
            style={{ 
              backgroundColor: `rgba(${getFileIconColor() === 'var(--color-secondary)' ? '6, 182, 212' : getFileIconColor() === 'var(--color-accent)' ? '217, 70, 239' : '99, 102, 241'}, 0.1)`, 
              color: getFileIconColor(),
              borderColor: `rgba(${getFileIconColor() === 'var(--color-secondary)' ? '6, 182, 212' : getFileIconColor() === 'var(--color-accent)' ? '217, 70, 239' : '99, 102, 241'}, 0.2)`
            }}
          >
            <FileText size={36} />
          </div>
          <div>
            <div className="doc-name" title={file.name}>{file.name}</div>
            <div className="doc-size">{formatBytes(file.size)}</div>
          </div>

          {!isProcessing ? (
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', width: '100%', justifyContent: 'center' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setFile(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleConvert}
                style={{ background: `linear-gradient(135deg, ${getFileIconColor()}, #4f46e5)` }}
              >
                <Sparkles size={16} />
                Convert to PDF
              </button>
            </div>
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {statusText}
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {Math.round(progress)}% Completed
              </div>
            </div>
          )}
        </div>
      )}

      {!file && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>Supported formats & workflow</p>
            <ul>
              <li><strong>Word Documents (.docx, .doc):</strong> Converted with high-fidelity formatting using headless LibreOffice.</li>
              <li><strong>Plain Text (.txt):</strong> Converted directly to PDF maintaining layout and columns.</li>
              <li><strong>Markdown (.md):</strong> Rendered into HTML with high-quality styled typography and then exported into PDF.</li>
              <li>Your files are kept completely private and processed locally on this machine.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
