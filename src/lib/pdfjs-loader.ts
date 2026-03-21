"use client";

const PDF_JS_VERSION = "3.11.174";
const PDF_JS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}`;

let pdfJsLoadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

function configureWorker() {
  if (typeof window === "undefined" || !window.pdfjsLib?.GlobalWorkerOptions) {
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDF_JS_BASE}/pdf.worker.min.js`;
}

export function ensurePdfJsLoaded() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF.js 只能在浏览器环境加载"));
  }

  if (window.pdfjsLib) {
    configureWorker();
    return Promise.resolve();
  }

  if (!pdfJsLoadPromise) {
    pdfJsLoadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${PDF_JS_BASE}/pdf.min.js`;
      script.async = true;
      script.onload = () => {
        try {
          configureWorker();
          resolve();
        } catch (error) {
          pdfJsLoadPromise = null;
          reject(error);
        }
      };
      script.onerror = () => {
        pdfJsLoadPromise = null;
        reject(new Error("PDF.js 加载失败"));
      };
      document.head.appendChild(script);
    });
  }

  return pdfJsLoadPromise;
}
