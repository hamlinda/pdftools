import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Trash2, GripVertical, FileSpreadsheet, Info } from 'lucide-react';

interface JpgToPdfTabProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
  sizeStr: string;
}

export const JpgToPdfTab: React.FC<JpgToPdfTabProps> = ({ addNotification }) => {
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfName, setPdfName] = useState('converted_images');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, [images]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFiles = (selectedFiles: FileList) => {
    if (isProcessing) return;
    const newImages: SelectedImage[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const name = file.name.toLowerCase();
      const isImg = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
      
      if (!isImg) {
        addNotification(`"${file.name}" is not a JPG, JPEG, or PNG image.`, 'error');
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        addNotification(`"${file.name}" exceeds the 10MB limit per image.`, 'error');
        continue;
      }

      newImages.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
        sizeStr: formatBytes(file.size),
      });
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
      addNotification(`Added ${newImages.length} image(s).`, 'success');
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

  const removeImage = (id: string) => {
    if (isProcessing) return;
    const item = images.find((img) => img.id === id);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setImages((prev) => prev.filter((img) => img.id !== id));
    addNotification('Image removed.', 'success');
  };

  const clearAll = () => {
    if (isProcessing) return;
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    addNotification('All images cleared.', 'success');
  };

  // HTML5 Drag and Drop for Reordering Images
  const handleItemDragStart = (index: number) => {
    if (isProcessing) return;
    setDraggedIndex(index);
  };

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (isProcessing || draggedIndex === null || draggedIndex === index) return;
  };

  const handleItemDrop = (index: number) => {
    if (isProcessing || draggedIndex === null || draggedIndex === index) return;

    setImages((prev) => {
      const result = [...prev];
      const [removed] = result.splice(draggedIndex, 1);
      result.splice(index, 0, removed);
      return result;
    });
    setDraggedIndex(null);
  };

  const handleConvertToPdf = async () => {
    if (images.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgress(15);
    setStatusText('Packaging images for upload...');

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) {
          setStatusText('Uploading images to server...');
          return prev + 5;
        } else if (prev < 80) {
          setStatusText('Converting and assembling multi-page PDF...');
          return prev + 3;
        } else if (prev < 96) {
          setStatusText('Finalizing PDF layout...');
          return prev + 1;
        }
        return prev;
      });
    }, 300);

    try {
      const formData = new FormData();
      images.forEach((imgObj) => {
        formData.append('files', imgObj.file);
      });

      const response = await fetch('/api/jpg-to-pdf', {
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

      setProgress(100);
      setStatusText('Download starting...');
      addNotification('PDF compiled successfully!', 'success');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Clean PDF file extension naming
      const formattedName = pdfName.trim() ? pdfName.replace(/\.[^/.]+$/, "") : 'converted_images';
      a.download = `${formattedName}.pdf`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setStatusText('');
      }, 1500);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error('Error creating PDF:', err);
      addNotification(err.message || 'An error occurred during PDF generation.', 'error');
      setIsProcessing(false);
      setProgress(0);
      setStatusText('');
    }
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
        <div className="dropzone-title">Drag & drop images here</div>
        <div className="dropzone-desc">or click to browse JPG, JPEG, or PNG images (limit 10MB per file)</div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="file-input" 
          multiple 
          accept="image/jpeg,image/png,image/jpg"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
      </div>

      {images.length > 0 && (
        <>
          <div className="options-panel" style={{
            marginTop: '20px',
            padding: '16px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <label htmlFor="pdf-name-input" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Output PDF Filename
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                id="pdf-name-input"
                value={pdfName}
                onChange={(e) => setPdfName(e.target.value)}
                placeholder="converted_images"
                disabled={isProcessing}
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border-glass)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'white',
                  outline: 'none'
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>.pdf</span>
            </div>
          </div>

          <div style={{ marginTop: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            📄 Drag the list items to arrange the page sequence in the output PDF.
          </div>

          <div className="file-list" style={{ marginTop: '10px', maxHeight: '350px', overflowY: 'auto' }}>
            {images.map((imgObj, index) => (
              <div 
                key={imgObj.id} 
                className={`file-item ${draggedIndex === index ? 'dragging' : ''}`}
                draggable={!isProcessing}
                onDragStart={() => handleItemDragStart(index)}
                onDragOver={(e) => handleItemDragOver(e, index)}
                onDrop={() => handleItemDrop(index)}
                onDragEnd={() => setDraggedIndex(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.01)',
                  marginBottom: '10px',
                  cursor: isProcessing ? 'not-allowed' : 'grab'
                }}
              >
                <div className="file-item-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  <div className="drag-handle" style={{ cursor: isProcessing ? 'not-allowed' : 'grab', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                    <GripVertical size={18} />
                  </div>
                  
                  {/* Thumbnail Image */}
                  <img 
                    src={imgObj.previewUrl} 
                    alt="Preview" 
                    style={{
                      width: '45px',
                      height: '45px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-glass)',
                      flexShrink: 0
                    }} 
                  />

                  <div className="file-info" style={{ overflow: 'hidden' }}>
                    <div className="file-name" style={{
                      fontWeight: 500,
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden'
                    }} title={imgObj.file.name}>
                      {imgObj.file.name}
                    </div>
                    <div className="file-meta" style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Page {index + 1}</span>
                      <span>Size: {imgObj.sizeStr}</span>
                    </div>
                  </div>
                </div>

                <div className="file-item-right">
                  <button 
                    className="btn-icon-only danger" 
                    onClick={() => removeImage(imgObj.id)}
                    disabled={isProcessing}
                    style={{ opacity: isProcessing ? 0.3 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                    title="Remove image"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
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
              onClick={handleConvertToPdf}
              disabled={isProcessing || images.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isProcessing ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255, 255, 255, 0.1)', borderTopColor: 'white' }} />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={18} />
                  <span>Create PDF ({images.length} Page{images.length > 1 ? 's' : ''})</span>
                </>
              )}
            </button>
          </div>

          {isProcessing && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {statusText}
              </div>
              <div className="progress-bar-container" style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div className="progress-bar" style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {Math.round(progress)}% Completed
              </div>
            </div>
          )}
        </>
      )}

      {images.length === 0 && (
        <div className="instructions-box">
          <Info size={16} className="instructions-box-icon" />
          <div className="instructions-text">
            <p>JPG to PDF Conversion</p>
            <ul>
              <li>Upload multiple images (JPG, JPEG, PNG format supported).</li>
              <li>Rearrange the sequence of files using drag and drop to establish correct PDF pages.</li>
              <li>Optionally edit the target PDF filename in the options panel.</li>
              <li>Click "Create PDF" to upload and generate a high-quality multi-page PDF document.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
