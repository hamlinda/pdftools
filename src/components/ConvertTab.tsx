import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, FileSpreadsheet, Info } from 'lucide-react';

interface ConvertTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

export const ConvertTab: React.FC<ConvertTabProps> = ({ addNotification }) => {
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
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
      addNotification('Please select a valid PDF file.', 'error');
      return;
    }
    
    // Impose a size limit of 20MB for conversion to avoid server overload
    if (selectedFile.size > 20 * 1024 * 1024) {
      addNotification('File exceeds the 20MB limit for conversion.', 'error');
      return;
    }

    setFile(selectedFile);
    addNotification('File selected for conversion.', 'success');
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(10);
    setStatusText('Uploading PDF to server...');

    // Progress bar animation simulator
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) {
          setStatusText('Uploading PDF to server...');
          return prev + 5; // upload stage
        } else if (prev < 70) {
          setStatusText('Extracting digital text layers...');
          return prev + 3; // parsing stage
        } else if (prev < 90) {
          setStatusText('Running OCR fallback for scanned pages...');
          return prev + 1.5; // OCR stage
        } else if (prev < 98) {
          setStatusText('Assembling editable Word Document (.docx)...');
          return prev + 0.5; // docx generation
        }
        return prev;
      });
    }, 400);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/pdf-to-docx', {
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
          // Fallback to text if JSON parsing fails
          const text = await response.text();
          if (text) errMsg = text.substring(0, 100);
        }
        throw new Error(errMsg);
      }

      setProgress(100);
      setStatusText('Download started!');
      addNotification('PDF converted to Word successfully!', 'success');

      // Process download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Replace file extension
      const docxName = file.name.replace(/\.[^/.]+$/, "") + ".docx";
      a.download = docxName;
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
          <div className="dropzone-title">Convert PDF to Word Document</div>
          <div className="dropzone-desc">Drag & drop a file here, or click to browse</div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="file-input" 
            accept=".pdf,application/pdf"
            onChange={handleFileChange} 
          />
        </div>
      ) : (
        <div className="convert-status-container">
          <div className="doc-preview-icon">
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
              >
                <FileSpreadsheet size={16} />
                Convert to Word
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
            <p>How it works</p>
            <ul>
              <li>Upload a PDF document (limit 20MB).</li>
              <li>Click "Convert to Word" to start the conversion process.</li>
              <li>The engine extracts digital text layers to construct flowing, editable paragraphs. For scanned pages or images, it uses high-fidelity Tesseract OCR to automatically perform text extraction.</li>
              <li>Once conversion completes, your browser will automatically download the editable Word document.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
