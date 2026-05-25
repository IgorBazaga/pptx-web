import { renderPdfPage } from './pdf-render.js';
const socket = io();
const canvas = document.getElementById('previewCanvas');
const list = document.getElementById('list');
const file = document.getElementById('file');
const toast = document.getElementById('toast');
const status = document.getElementById('status');
const title = document.getElementById('title');
const meta = document.getElementById('meta');
const link = document.getElementById('link');
let state=null, pages=0;
function show(msg){ toast.textContent=msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),3500); }
async function draw(){
  if(!state) return;
  const active = state.presentations.find(p=>p.id===state.activeId);
  list.innerHTML = state.presentations.length ? '' : '<div class="infoBox"><p>Nenhuma apresentação ainda. Importe um PPTX ou PDF.</p></div>';
  state.presentations.forEach(p=>{
    const div=document.createElement('div'); div.className='item '+(p.id===state.activeId?'active':'');
    div.innerHTML=`<strong>${p.name}</strong><span>${p.original}</span><div class="itemActions"><button class="small open">Abrir</button><button class="small danger del">Excluir</button></div>`;
    div.querySelector('.open').onclick=()=>fetch('/api/active/'+p.id,{method:'POST'});
    div.querySelector('.del').onclick=async()=>{ if(confirm('Excluir esta apresentação?')) await fetch('/api/presentation/'+p.id,{method:'DELETE'}); };
    list.appendChild(div);
  });
  if(!active){ title.textContent='Nenhum PPTX carregado'; meta.textContent='Importe uma apresentação para começar.'; return; }
  title.textContent=active.name; meta.textContent=`Slide ${state.currentSlide}${pages?` de ${pages}`:''}`; status.textContent='Ao vivo no telão';
  link.textContent = `${location.origin}/control`;
  try{ const r=await renderPdfPage(canvas, active.pdfUrl, state.currentSlide); pages=r.pages; meta.textContent=`Slide ${r.page} de ${r.pages}`; if(state.currentSlide>r.pages) socket.emit('go', r.pages); }catch(e){ show('Não consegui renderizar o preview.'); }
}
socket.on('state',s=>{state=s; draw();});
document.getElementById('next').onclick=()=>socket.emit('next');
document.getElementById('prev').onclick=()=>socket.emit('prev');
document.getElementById('full').onclick=()=>window.open('/','_blank');
file.onchange=async()=>{
  if(!file.files[0]) return;
  const fd=new FormData(); fd.append('file', file.files[0]);
  show('Importando... se for PPTX grande pode demorar.');
  try{
    const res=await fetch('/api/import',{method:'POST',body:fd});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Erro ao importar');
    show('Apresentação importada com sucesso.');
  }catch(e){ show(e.message); }
  file.value='';
};
window.addEventListener('keydown',e=>{ if(e.key==='ArrowRight') socket.emit('next'); if(e.key==='ArrowLeft') socket.emit('prev'); });
