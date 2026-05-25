let pdfDoc = null;
let currentUrl = null;
window.pdfjsLib = null;

export async function setupPdf(){
  if(window.pdfjsLib) return window.pdfjsLib;
  const mod = await import('/pdfjs/build/pdf.mjs');
  mod.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
  window.pdfjsLib = mod;
  return mod;
}

export async function loadPdf(url){
  if(!url) { pdfDoc = null; currentUrl = null; return null; }
  if(currentUrl === url && pdfDoc) return pdfDoc;
  const pdfjs = await setupPdf();
  currentUrl = url;
  pdfDoc = await pdfjs.getDocument(url + '?v=' + Date.now()).promise;
  return pdfDoc;
}

export async function renderPdfPage(canvas, url, pageNumber, options = {}){
  if(!canvas || !url) return { pages:0 };
  const doc = await loadPdf(url);
  const total = doc.numPages;
  const pageNo = Math.max(1, Math.min(Number(pageNumber)||1, total));
  const page = await doc.getPage(pageNo);
  const parent = canvas.parentElement;
  const maxW = options.maxWidth || parent?.clientWidth || window.innerWidth;
  const maxH = options.maxHeight || parent?.clientHeight || window.innerHeight;
  const dpr = options.dpr || (window.devicePixelRatio || 1);
  const viewport1 = page.getViewport({ scale: 1 });
  const scale = Math.min(maxW / viewport1.width, maxH / viewport1.height) * dpr;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
  canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { pages: total, page: pageNo };
}
