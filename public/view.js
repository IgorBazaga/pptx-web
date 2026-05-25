import { renderPdfPage } from './pdf-render.js';
const socket = io();
const canvas = document.getElementById('canvas');
const empty = document.getElementById('empty');
const fsBtn = document.getElementById('fullscreen');
let state = null;
let renderTimer = null;

function getActive(){ return state?.presentations?.find(p=>p.id===state.activeId); }

async function draw(){
  if(!state) return;
  const active = getActive();
  if(!active){
    empty.style.display='grid';
    canvas.style.display='none';
    return;
  }
  empty.style.display='none';
  canvas.style.display='block';
  try{
    const r = await renderPdfPage(canvas, active.pdfUrl, state.currentSlide, {
      maxWidth: window.innerWidth,
      maxHeight: window.innerHeight
    });
    if(state.currentSlide > r.pages) socket.emit('go', r.pages);
  }catch(e){
    empty.style.display='grid';
    canvas.style.display='none';
    empty.innerHTML='<div><h1>Erro ao abrir apresentação</h1><p>Abra o editor e importe novamente.</p></div>';
  }
}

function syncFullscreenButton(){
  const full = !!document.fullscreenElement;
  document.body.classList.toggle('isFullscreen', full);
  fsBtn.style.display = full ? 'none' : 'block';
}

socket.on('state', s=>{ state=s; clearTimeout(renderTimer); renderTimer=setTimeout(draw,60); });
window.addEventListener('resize',()=>{ clearTimeout(renderTimer); renderTimer=setTimeout(draw,120); });
fsBtn.onclick=()=>{ document.documentElement.requestFullscreen?.(); };
document.addEventListener('fullscreenchange',()=>{ syncFullscreenButton(); draw(); });
syncFullscreenButton();

let cursorTimer;
window.addEventListener('mousemove',()=>{
  document.body.style.cursor='default';
  if(!document.fullscreenElement) fsBtn.style.opacity=1;
  clearTimeout(cursorTimer);
  cursorTimer=setTimeout(()=>{
    document.body.style.cursor='none';
    if(!document.fullscreenElement) fsBtn.style.opacity=.12;
  },2500);
});
window.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight' || e.key===' ') socket.emit('next');
  if(e.key==='ArrowLeft') socket.emit('prev');
  if(e.key.toLowerCase()==='f') document.documentElement.requestFullscreen?.();
});
