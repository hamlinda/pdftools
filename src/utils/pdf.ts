import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';

// Configure PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Loads a PDF document from an ArrayBuffer and returns the PDFJS Document Proxy.
 * We slice the array buffer to avoid detaching the original buffer.
 */
export async function loadPDF(pdfData: ArrayBuffer): Promise<any> {
  const dataCopy = pdfData.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataCopy) });
  return await loadingTask.promise;
}

/**
 * Gets the number of pages in a PDF document.
 */
export async function getNumPages(pdfData: ArrayBuffer): Promise<number> {
  const pdf = await loadPDF(pdfData);
  const numPages = pdf.numPages;
  if (pdf.destroy) {
    await pdf.destroy();
  }
  return numPages;
}

/**
 * Renders a page from an already loaded PDF Document Proxy to a JPEG Data URL.
 */
export async function renderPageFromDocument(
  pdf: any,
  pageNumber: number,
  targetWidth: number = 180
): Promise<string> {
  const page = await pdf.getPage(pageNumber);

  // Calculate scaling viewport
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get 2D canvas context');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  // Clean up
  canvas.remove();

  return dataUrl;
}

/**
 * Renders a specific page of a PDF to a JPEG Data URL (one-off utility).
 */
export async function renderPageToDataUrl(
  pdfData: ArrayBuffer,
  pageNumber: number,
  targetWidth: number = 180
): Promise<string> {
  const pdf = await loadPDF(pdfData);
  const dataUrl = await renderPageFromDocument(pdf, pageNumber, targetWidth);
  if (pdf.destroy) {
    await pdf.destroy();
  }
  return dataUrl;
}

/**
 * Merges multiple PDF documents into one PDF.
 */
export async function mergePDFs(
  files: Array<{ data: ArrayBuffer; name: string }>
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const pdfDoc = await PDFDocument.load(file.data);
    const copiedPages = await mergedPdf.copyPages(
      pdfDoc,
      pdfDoc.getPageIndices()
    );
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

/**
 * Modifies a single PDF document by applying rotations and deleting selected pages.
 */
export async function modifyPDF(
  pdfData: ArrayBuffer,
  operations: Array<{ pageIndex: number; rotation: number; deleted: boolean }>
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfData);
  const destDoc = await PDFDocument.create();

  for (const op of operations) {
    // If the page is marked as deleted, skip it
    if (op.deleted) {
      continue;
    }

    const [copiedPage] = await destDoc.copyPages(srcDoc, [op.pageIndex]);
    
    // Apply rotation if needed
    if (op.rotation !== 0) {
      // PDF-Lib uses degrees (0, 90, 180, 270)
      const currentRotation = copiedPage.getRotation().angle;
      const newRotation = (currentRotation + op.rotation) % 360;
      copiedPage.setRotation(degrees(newRotation));
    }

    destDoc.addPage(copiedPage);
  }

  return await destDoc.save();
}

/**
 * Reads an image file and converts it to a standard JPEG or PNG Data URL via Canvas.
 * This ensures compatibility with pdf-lib which only supports JPEG and PNG.
 */
export function convertImageToJpg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        
        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        const exportType = isPng ? 'image/png' : 'image/jpeg';
        const convertedDataUrl = canvas.toDataURL(exportType, 0.9);
        resolve(convertedDataUrl);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image element'));
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compiles a mixed list of PDF pages and Image pages into a single PDF Document.
 */
export async function compileWorkspace(
  pages: Array<{
    type: 'pdf' | 'image';
    pdfBuffer?: ArrayBuffer;
    pageNumber?: number; // 1-indexed page number in the source PDF
    dataUrl?: string | null;
    rotation: number;
  }>
): Promise<Uint8Array> {
  const destDoc = await PDFDocument.create();
  
  // Cache loaded PDF documents to avoid parsing the same PDF multiple times
  const pdfCache = new Map<ArrayBuffer, PDFDocument>();

  for (const pageInfo of pages) {
    if (pageInfo.type === 'pdf' && pageInfo.pdfBuffer && pageInfo.pageNumber !== undefined) {
      let srcDoc = pdfCache.get(pageInfo.pdfBuffer);
      if (!srcDoc) {
        srcDoc = await PDFDocument.load(pageInfo.pdfBuffer);
        pdfCache.set(pageInfo.pdfBuffer, srcDoc);
      }
      
      // pageNumber is 1-indexed, pdf-lib copyPages uses 0-indexed index
      const [copiedPage] = await destDoc.copyPages(srcDoc, [pageInfo.pageNumber - 1]);
      
      if (pageInfo.rotation !== 0) {
        const currentRotation = copiedPage.getRotation().angle;
        const newRotation = (currentRotation + pageInfo.rotation) % 360;
        copiedPage.setRotation(degrees(newRotation));
      }
      destDoc.addPage(copiedPage);
    } else if (pageInfo.type === 'image' && pageInfo.dataUrl) {
      const isPng = pageInfo.dataUrl.startsWith('data:image/png');
      const base64Data = pageInfo.dataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      let embeddedImg;
      if (isPng) {
        embeddedImg = await destDoc.embedPng(bytes);
      } else {
        embeddedImg = await destDoc.embedJpg(bytes);
      }
      
      const { width, height } = embeddedImg.scale(1);
      const page = destDoc.addPage([width, height]);
      
      page.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
      
      if (pageInfo.rotation !== 0) {
        page.setRotation(degrees(pageInfo.rotation));
      }
    }
  }
  
  return await destDoc.save();
}
