import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Info, Zap, AlertTriangle, Download, RefreshCw } from 'lucide-react';

interface CompressTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

interface EvaluationResult {
  filename: string;
  file_size_bytes: number;
  pages: number;
  image_count: number;
  recommendation: {
    level: 'none' | 'low' | 'medium' | 'high';
    text: string;
    expected_reduction: string;
  };
}

export const CompressTab: React.FC<CompressTabProps> = ({ addNotification }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState<'idle' | 'evaluating' | 'ready' | 'compressing' | 'completed'>('idle');
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  
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
      if (e.dataTransfer.files.length > 1) {
        addNotification('Please upload only a single PDF file for compression.', 'error');
      }
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
      addNotification('Please select a valid PDF file.', 'error');
      return;
    }

    if (selectedFile.size > 200 * 1024 * 1024) {
      addNotification('File exceeds the 200MB limit for compression.', 'error');
      return;
    }

    setFile(selectedFile);
    setStatus('evaluating');
    setEvalResult(null);
    setCompressedSize(null);

    // Call evaluate-pdf endpoint
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/evaluate-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMsg = 'Failed to evaluate PDF.';
        try {
          const errData = await response.json();
          errMsg = errData.detail || errMsg;
        } catch {
          // fallback
        }
        throw new Error(errMsg);
      }

      const result: EvaluationResult = await response.json();
      setEvalResult(result);
      // Pre-select recommended compression level (if none, fallback to medium)
      if (result.recommendation.level !== 'none') {
        setCompressionLevel(result.recommendation.level as 'low' | 'medium' | 'high');
      } else {
        setCompressionLevel('medium');
      }
      setStatus('ready');
      addNotification('PDF evaluated successfully.', 'success');
    } catch (err: any) {
      console.error(err);
      addNotification(err.message || 'Error occurred during PDF evaluation.', 'error');
      setFile(null);
      setStatus('idle');
    }
  };

  const handleCompress = async () => {
    if (!file || status !== 'ready') return;

    setStatus('compressing');
    setProgress(15);
    setStatusText('Uploading PDF document to server...');

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) {
          setStatusText('Uploading PDF to server...');
          return prev + 5;
        } else if (prev < 80) {
          setStatusText('Executing Ghostscript compression engine...');
          return prev + 3;
        } else if (prev < 96) {
          setStatusText('Compressing fonts and downsampling images...');
          return prev + 1;
        }
        return prev;
      });
    }, 400);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('level', compressionLevel);

      const response = await fetch('/api/compress-pdf', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errMsg = 'PDF compression failed.';
        try {
          const errData = await response.json();
          errMsg = errData.detail || errMsg;
        } catch {
          const txt = await response.text();
          if (txt) errMsg = txt.substring(0, 100);
        }
        throw new Error(errMsg);
      }

      setProgress(100);
      setStatusText('Download started!');
      addNotification('PDF compressed successfully!', 'success');

      const blob = await response.blob();
      setCompressedSize(blob.size);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      a.download = `${baseName}_compressed.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus('completed');
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error(err);
      addNotification(err.message || 'An error occurred during compression.', 'error');
      setStatus('ready');
      setProgress(0);
      setStatusText('');
    }
  };

  const handleReset = () => {
    setFile(null);
    setEvalResult(null);
    setCompressedSize(null);
    setStatus('idle');
    setProgress(0);
    setStatusText('');
  };

  const renderSavingsPercentage = () => {
    if (!file || !compressedSize) return null;
    const savings = file.size - compressedSize;
    if (savings <= 0) return '0%';
    const pct = (savings / file.size) * 100;
    return `${Math.round(pct)}%`;
  };

  return (
    <div className="tool-card">
      {status === 'idle' && (
        <div 
          className={`dropzone ${isDragOver ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={48} className="dropzone-icon" />
          <div className="dropzone-title">Upload a single PDF to Compress</div>
          <div className="dropzone-desc">Drag & drop a file here, or click to browse (limit 200MB)</div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="file-input" 
            accept=".pdf,application/pdf"
            onChange={handleFileChange} 
          />
        </div>
      )}

      {status === 'evaluating' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px' }}>
          <div className="spinner" style={{ width: '48px', height: '48px', border: '3px solid rgba(255, 255, 255, 0.1)', borderTopColor: 'var(--color-secondary)' }} />
          <div style={{ fontSize: '1.05rem', fontWeight: 500 }}>Evaluating PDF details...</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Analyzing page layouts and scanning for embedded images.</div>
        </div>
      )}

      {(status === 'ready' || status === 'compressing' || status === 'completed') && file && evalResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* File Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(99, 102, 241, 0.1)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)',
              border: '1px solid rgba(99, 102, 241, 0.2)'
            }}>
              <FileText size={28} />
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={file.name}>
                {file.name}
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>Original Size: {formatBytes(file.size)}</span>
                <span>Pages: {evalResult.pages}</span>
                <span>Images: {evalResult.image_count}</span>
              </div>
            </div>
          </div>

          {/* Evaluation & Recommendation Card */}
          {status === 'ready' && (
            <div style={{
              padding: '16px',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              borderRadius: 'var(--radius-md)',
              background: 'radial-gradient(circle at 100% 0%, rgba(6, 182, 212, 0.05), transparent 60%)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                {evalResult.recommendation.level === 'none' ? (
                  <AlertTriangle size={20} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <Zap size={20} style={{ color: 'var(--color-secondary)', flexShrink: 0, marginTop: '2px' }} />
                )}
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    System Evaluation & Recommendation
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {evalResult.recommendation.text}
                  </p>
                  {evalResult.recommendation.level !== 'none' && (
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--color-success)', marginTop: '8px', fontWeight: 500 }}>
                      <span>Expected Savings: {evalResult.recommendation.expected_reduction}</span>
                      <span>Recommended Level: {evalResult.recommendation.level.toUpperCase()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Compression Level Selector */}
          {status === 'ready' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '16px',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Select Compression Quality</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {[
                  { id: 'low', label: 'Low Compression', dpi: '300 DPI (High Quality)', color: 'var(--color-success)' },
                  { id: 'medium', label: 'Medium Compression', dpi: '150 DPI (Balanced)', color: 'var(--color-secondary)' },
                  { id: 'high', label: 'High Compression', dpi: '72 DPI (Smallest Size)', color: 'var(--color-accent)' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCompressionLevel(option.id as any)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '12px',
                      border: compressionLevel === option.id 
                        ? `2px solid ${option.color}` 
                        : '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-md)',
                      background: compressionLevel === option.id
                        ? 'rgba(255, 255, 255, 0.03)'
                        : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: compressionLevel === option.id ? 'white' : 'var(--text-secondary)' }}>
                      {option.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {option.dpi}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress / Status Block */}
          {status === 'compressing' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '24px',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {statusText}
              </div>
              <div className="progress-bar-container" style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div className="progress-bar" style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {Math.round(progress)}% Completed
              </div>
            </div>
          )}

          {/* Completed Savings Summary */}
          {status === 'completed' && compressedSize && (
            <div style={{
              padding: '24px',
              border: '1px solid var(--color-success)',
              borderRadius: 'var(--radius-md)',
              background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.08), transparent 60%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              textAlign: 'center'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-success)',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <Download size={28} />
              </div>
              
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', marginBottom: '4px' }}>
                  Compression Finished!
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Your compressed PDF is automatically downloading in your browser.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '24px',
                width: '100%',
                maxWidth: '400px',
                marginTop: '12px',
                padding: '12px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-glass)'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Original</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>{formatBytes(file.size)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compressed</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px', color: 'var(--color-success)' }}>{formatBytes(compressedSize)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Savings</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: 'var(--color-secondary)' }}>{renderSavingsPercentage()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
            {status === 'ready' && (
              <>
                <button className="btn btn-secondary" onClick={handleReset}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCompress} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} />
                  Compress PDF
                </button>
              </>
            )}
            {status === 'completed' && (
              <button className="btn btn-primary" onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={16} />
                Compress Another File
              </button>
            )}
          </div>

        </div>
      )}

      {status === 'idle' && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>PDF Compression & Evaluation Details</p>
            <ul>
              <li>Upload a single PDF document. Large files up to 200MB are supported.</li>
              <li>The system will run a preliminary evaluation to calculate the page count and analyze embedded image counts.</li>
              <li>We will generate a recommended compression level to avoid quality loss on text while reducing layout sizes.</li>
              <li>Choose a profile: Low (High Quality 300 DPI), Medium (Balanced 150 DPI), or High (Smallest 72 DPI) and click "Compress PDF".</li>
              <li>Operations run locally using Ghostscript rendering directly on this machine.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
