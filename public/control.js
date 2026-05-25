import { renderPdfPage } from './pdf-render.js';
const socket=io();
const canvas=document.getElementById('mobileCanvas');
const nameEl=document.getElementById('name');
const num=document.getElementById('num');
const slideList=document.getElementById('slideList');
const slidesCount=document.getElementById('slidesCount');
let state=null,pages=0,lastListKey='';

async function draw(){
  const active=state?.presentations.find(p=>p.id===state.activeId);
  if(!active){
    nameEl.textContent='Sem apresentação';
    num.textContent='Abra o editor';
    pages=0;
    slidesCount.textContent='--';
    slideList.innerHTML='<div class="slideEmpty">Importe uma apresentação no editor.</div>';
    lastListKey='';
    return;
  }
  nameEl.textContent=active.name;
  try{
    const r=await renderPdfPage(canvas, active.pdfUrl, state.currentSlide);
    pages=r.pages;
    num.textContent=`${r.page}/${r.pages}`;
    slidesCount.textContent=`${r.pages} slides`;
    await buildSlideList(active);
    markActiveSlide();
  }catch(e){
    num.textContent='Erro';
    slidesCount.textContent='Erro';
  }
}

async function buildSlideList(active){
  const key=`${active.id}-${active.pdfUrl}-${pages}`;
  if(!pages || key===lastListKey) return;
  lastListKey=key;
  slideList.innerHTML='';
  for(let i=1;i<=pages;i++){
    const btn=document.createElement('button');
    btn.className='mobileSlideThumb';
    btn.dataset.slide=String(i);
    btn.innerHTML=`<span class="thumbNumber">${i}</span><canvas></canvas>`;
    btn.onclick=()=>{navigator.vibrate?.(18);socket.emit('go',i)};
    slideList.appendChild(btn);
    const thumbCanvas=btn.querySelector('canvas');
    renderPdfPage(thumbCanvas, active.pdfUrl, i, {maxWidth:150, maxHeight:90, dpr:1}).catch(()=>{});
  }
}

function markActiveSlide(){
  const current=Number(state?.currentSlide)||1;
  slideList.querySelectorAll('.mobileSlideThumb').forEach(el=>{
    const active=Number(el.dataset.slide)===current;
    el.classList.toggle('active',active);
    if(active) el.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
  });
}

socket.on('state',s=>{state=s; draw();});
document.getElementById('next').onclick=()=>{navigator.vibrate?.(25);socket.emit('next')};
document.getElementById('prev').onclick=()=>{navigator.vibrate?.(25);socket.emit('prev')};
let startX=0; document.addEventListener('touchstart',e=>startX=e.touches[0].clientX); document.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX; if(dx<-70) socket.emit('next'); if(dx>70) socket.emit('prev');});
window.addEventListener('resize',draw);
