const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const root = __dirname;
const storageDir = path.join(root, 'storage');
const uploadsDir = path.join(storageDir, 'uploads');
const presentationsDir = path.join(storageDir, 'presentations');
const dbPath = path.join(storageDir, 'db.json');

for (const dir of [storageDir, uploadsDir, presentationsDir]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ presentations: [], activeId: null, currentSlide: 1 }, null, 2));

function readDB(){ return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
function writeDB(data){ fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
function safeName(name){ return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'apresentacao'; }
function uid(){ return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }

const upload = multer({ dest: uploadsDir, limits: { fileSize: 500 * 1024 * 1024 } });

app.use(express.json());
app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  next();
});
app.use(express.static(path.join(root, 'public')));
app.use('/files', express.static(presentationsDir));
app.use('/pdfjs', express.static(path.join(root, 'node_modules/pdfjs-dist')));

function findLibreOffice(){
  const candidates = process.platform === 'win32' ? [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice.exe', 'libreoffice.exe'
  ] : ['libreoffice', 'soffice'];
  return candidates;
}
function convertPptxToPdf(input, outDir){
  return new Promise((resolve, reject) => {
    const args = ['--headless','--convert-to','pdf','--outdir', outDir, input];
    const candidates = findLibreOffice();
    let index = 0;
    const tryNext = () => {
      if (index >= candidates.length) return reject(new Error('LibreOffice não encontrado. Instale o LibreOffice para importar PPTX preservando o visual.'));
      const bin = candidates[index++];
      execFile(bin, args, { timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return tryNext();
        const base = path.basename(input, path.extname(input)) + '.pdf';
        const pdfPath = path.join(outDir, base);
        if (fs.existsSync(pdfPath)) return resolve(pdfPath);
        const pdf = fs.readdirSync(outDir).find(f => f.toLowerCase().endsWith('.pdf'));
        if (pdf) return resolve(path.join(outDir, pdf));
        reject(new Error('A conversão terminou, mas o PDF não foi gerado.'));
      });
    };
    tryNext();
  });
}

app.get('/control', (req,res)=>res.sendFile(path.join(root,'public','control.html')));
app.get('/editor', (req,res)=>res.sendFile(path.join(root,'public','editor.html')));
app.get('/api/state', (req,res)=>res.json(readDB()));

app.post('/api/import', upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({ error:'Envie um arquivo PPTX ou PDF.' });
    const original = req.file.originalname;
    const ext = path.extname(original).toLowerCase();
    if(!['.pptx','.pdf'].includes(ext)) return res.status(400).json({ error:'Formato inválido. Use .pptx ou .pdf.' });
    const id = uid();
    const folder = path.join(presentationsDir, id);
    fs.mkdirSync(folder, { recursive: true });
    const importedPath = path.join(folder, safeName(original));
    fs.renameSync(req.file.path, importedPath);
    let pdfPath = importedPath;
    if(ext === '.pptx') pdfPath = await convertPptxToPdf(importedPath, folder);
    const pdfName = 'presentation.pdf';
    const finalPdf = path.join(folder, pdfName);
    if(path.resolve(pdfPath) !== path.resolve(finalPdf)) fs.copyFileSync(pdfPath, finalPdf);
    const db = readDB();
    const item = { id, name: original.replace(/\.[^.]+$/,''), original, type: ext.slice(1), pdfUrl: `/files/${id}/${pdfName}`, createdAt: new Date().toISOString() };
    db.presentations.unshift(item);
    db.activeId = id;
    db.currentSlide = 1;
    writeDB(db);
    io.emit('state', db);
    res.json({ ok:true, item, state:db });
  }catch(e){ res.status(500).json({ error:e.message || 'Erro ao importar.' }); }
});

app.post('/api/active/:id', (req,res)=>{
  const db = readDB();
  if(!db.presentations.find(p=>p.id===req.params.id)) return res.status(404).json({ error:'Apresentação não encontrada.' });
  db.activeId = req.params.id; db.currentSlide = 1; writeDB(db); io.emit('state',db); res.json(db);
});
app.delete('/api/presentation/:id', (req,res)=>{
  const db = readDB();
  db.presentations = db.presentations.filter(p=>p.id!==req.params.id);
  if(db.activeId===req.params.id){ db.activeId = db.presentations[0]?.id || null; db.currentSlide=1; }
  fs.rmSync(path.join(presentationsDir, req.params.id), { recursive:true, force:true });
  writeDB(db); io.emit('state',db); res.json(db);
});

io.on('connection', socket=>{
  socket.emit('state', readDB());
  socket.on('go', slide=>{ const db=readDB(); db.currentSlide=Math.max(1, Number(slide)||1); writeDB(db); io.emit('state',db); });
  socket.on('next', ()=>{ const db=readDB(); db.currentSlide=(Number(db.currentSlide)||1)+1; writeDB(db); io.emit('state',db); });
  socket.on('prev', ()=>{ const db=readDB(); db.currentSlide=Math.max(1,(Number(db.currentSlide)||1)-1); writeDB(db); io.emit('state',db); });
});

function getLocalIP(){
  const nets = os.networkInterfaces();
  for(const name of Object.keys(nets)) for(const net of nets[name]||[]) if(net.family==='IPv4' && !net.internal) return net.address;
  return 'localhost';
}
server.listen(PORT,()=>{
  const ip = getLocalIP();
  console.log('\nPower Control Remote PPTX rodando!');
  console.log(`VIEW:    http://localhost:${PORT}`);
  console.log(`EDITOR:  http://localhost:${PORT}/editor`);
  console.log(`CONTROL: http://localhost:${PORT}/control`);
  console.log(`CELULAR: http://${ip}:${PORT}/control\n`);
});
