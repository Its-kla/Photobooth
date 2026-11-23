const S = 2; // export scale: 2x gives a high-resolution PNG
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Templates: sizes and slot rectangles [x, y, w, h] ---------- */
const T = {
  strip:{name:'Classic strip',w:600,h:1840,cap:[300,1725],slots:[0,1,2,3].map(i=>[50,50+i*410,500,380])},
  polaroid:{name:'Polaroid',w:800,h:980,cap:[400,855],slots:[[50,50,700,700]]},
  grid:{name:'Square grid',w:1000,h:1120,cap:[500,1050],slots:[[40,40,450,450],[510,40,450,450],[40,510,450,450],[510,510,450,450]]},
  film:{name:'Film reel',w:1560,h:700,dark:true,film:true,cap:[780,585],slots:[0,1,2].map(i=>[60+i*490,90,440,440])},
  party:{name:'Confetti party',w:800,h:1340,confetti:true,cap:[400,1215],slots:[[60,60,680,500],[60,600,680,500]]}
};

/* ---------- Filters: CSS string for canvas + preview, pixel fallback below ---------- */
const F = {
  normal:{name:'Normal',css:'none'},
  retro:{name:'Retro',css:'sepia(.55) contrast(.92) saturate(1.3) hue-rotate(-10deg) brightness(1.05)'},
  bw:{name:'Black & White',css:'grayscale(1) contrast(1.1)'},
  light:{name:'Light',css:'brightness(1.25) contrast(.95) saturate(1.1)'}
};
const canFilter = 'filter' in document.createElement('canvas').getContext('2d');

/* Frame colors shown as swatches. Edit this list to change them. */
const colors = ['#fffdf8','#ffe14d','#ff8fab','#9bd3ff','#b9f0c8','#2b2b3a'];

const st = {tpl:'strip',filter:'normal',bg:colors[0],photos:[],sel:null,facing:'user',busy:false};
let stream = null;
const sample = makeSample();

/* ---------- Drawing helpers ---------- */
function cover(c, img, x, y, w, h){
  const sw = img.videoWidth||img.naturalWidth||img.width, sh = img.videoHeight||img.naturalHeight||img.height;
  const k = Math.max(w/sw, h/sh), cw = w/k, ch = h/k;
  c.drawImage(img, (sw-cw)/2, (sh-ch)/2, cw, ch, x, y, w, h);
}
function pxFilter(c, w, h, key){
  if(key==='normal') return;
  const im = c.getImageData(0,0,w,h), d = im.data;
  for(let i=0;i<d.length;i+=4){
    let r=d[i], g=d[i+1], b=d[i+2];
    if(key==='bw'){ const v=((.3*r+.59*g+.11*b)-128)*1.1+128; r=g=b=v; }
    else if(key==='retro'){
      const R=.393*r+.769*g+.189*b, G=.349*r+.686*g+.168*b, B=.272*r+.534*g+.131*b;
      r=(r*.4+R*.6-128)*.92+138; g=(g*.4+G*.6-128)*.92+128; b=(b*.4+B*.6-128)*.92+120;
    } else if(key==='light'){ r*=1.25; g*=1.25; b*=1.25; }
    d[i]=r; d[i+1]=g; d[i+2]=b;
  }
  c.putImageData(im,0,0);
}
function filtered(src, W, H, key){
  const off = document.createElement('canvas');
  off.width = Math.round(W); off.height = Math.round(H);
  const c = off.getContext('2d', {willReadFrequently:true});
  if(canFilter) c.filter = F[key].css;
  cover(c, src, 0, 0, off.width, off.height);
  if(canFilter) c.filter = 'none'; else pxFilter(c, off.width, off.height, key);
  return off;
}
function makeSample(){
  const c = document.createElement('canvas'); c.width=320; c.height=240;
  const x = c.getContext('2d'), g = x.createLinearGradient(0,0,320,240);
  g.addColorStop(0,'#5ec8ff'); g.addColorStop(.5,'#ffb36b'); g.addColorStop(1,'#ff5d73');
  x.fillStyle=g; x.fillRect(0,0,320,240);
  x.fillStyle='#fff8'; x.beginPath(); x.arc(110,110,48,0,7); x.fill();
  x.fillStyle='#2e3470'; x.fillRect(180,70,90,110);
  return c;
}
function lum(hex){ const n=parseInt(hex.slice(1),16); return (.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255))/255; }

/* ---------- Render the final composition ---------- */
let queued = false;
function render(){ if(queued) return; queued = true; requestAnimationFrame(()=>{queued=false; draw();}); }
function draw(){
  const t = T[st.tpl], out = $('out');
  out.width = t.w*S; out.height = t.h*S;
  const c = out.getContext('2d');
  c.scale(S,S);
  const bg = t.dark ? '#15161c' : st.bg; // film reel always uses this dark color
  c.fillStyle = bg; c.fillRect(0,0,t.w,t.h);
  if(t.confetti){
    let s = 7; const rnd = () => (s = (s*16807)%2147483647)/2147483647;
    const pal = ['#ff5d73','#ffe14d','#5ec8ff','#7be0a6','#b48cff'];
    for(let i=0;i<70;i++){ c.fillStyle = pal[i%5]; c.globalAlpha=.8; c.beginPath(); c.arc(rnd()*t.w, rnd()*t.h, 6+rnd()*12, 0, 7); c.fill(); }
    c.globalAlpha = 1;
  }
  if(t.film){
    c.fillStyle = '#f2efe6';
    for(let x=20;x<t.w-20;x+=46){ c.fillRect(x,30,26,22); c.fillRect(x,t.h-52,26,22); }
  }
  t.slots.forEach(([x,y,w,h],i)=>{
    const p = st.photos[i];
    if(p){ c.drawImage(filtered(p.src, w*S, h*S, st.filter), x, y, w, h); }
    else { c.fillStyle='rgba(0,0,0,.12)'; c.fillRect(x,y,w,h); c.fillStyle='rgba(255,255,255,.7)'; c.font='700 34px Nunito, sans-serif'; c.textAlign='center'; c.fillText('Shot '+(i+1), x+w/2, y+h/2+12); }
    c.strokeStyle='rgba(0,0,0,.18)'; c.lineWidth=2; c.strokeRect(x,y,w,h);
  });
  c.fillStyle = lum(bg) > .55 ? '#20233f' : '#f5f4ff';
  c.textAlign = 'center';
  c.font = '44px "Bowlby One", sans-serif';
  c.fillText($('cap').value, t.cap[0], t.cap[1], t.w-80);
  if($('showDate').checked){
    c.font = '700 28px Nunito, sans-serif';
    c.fillText(new Date().toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}), t.cap[0], t.cap[1]+50);
  }
  renderFilterTiles();
}

/* ---------- UI builders ---------- */
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(toast.id); toast.id=setTimeout(()=>t.classList.remove('on'),3200);
}
function buildTemplates(){
  const box = $('tpls'); box.innerHTML='';
  Object.entries(T).forEach(([id,t])=>{
    const b = document.createElement('button'); b.className='tile'; b.setAttribute('aria-pressed', id===st.tpl);
    const m = document.createElement('canvas'), k = 70/Math.max(t.w,t.h);
    m.width = t.w*k; m.height = t.h*k;
    const x = m.getContext('2d'); x.fillStyle = t.dark?'#15161c':'#fffdf8'; x.fillRect(0,0,m.width,m.height);
    x.fillStyle = '#7d83c9'; t.slots.forEach(([a,b2,w,h])=>x.fillRect(a*k,b2*k,w*k,h*k));
    b.append(m, t.name, Object.assign(document.createElement('small'),{textContent:t.slots.length+(t.slots.length>1?' photos':' photo')}));
    b.onclick = () => { st.tpl=id; st.sel=null; buildTemplates(); buildSlots(); render(); };
    box.append(b);
  });
}
function renderFilterTiles(){
  const box = $('fils'); box.innerHTML='';
  const src = (st.photos.find(Boolean)||{}).src || sample;
  Object.entries(F).forEach(([id,f])=>{
    const b = document.createElement('button'); b.className='tile filter-thumb'; b.setAttribute('aria-pressed', id===st.filter);
    b.append(filtered(src,192,144,id), f.name);
    b.onclick = () => { st.filter=id; render(); };
    box.append(b);
  });
}
function buildSwatches(){
  const box = $('sws'); box.innerHTML='';
  colors.forEach(col=>{
    const b = document.createElement('button'); b.className='sw'; b.style.background=col;
    b.setAttribute('aria-label','Frame color '+col); b.setAttribute('aria-pressed', col===st.bg);
    b.onclick = () => { st.bg=col; buildSwatches(); render(); };
    box.append(b);
  });
}
function buildSlots(){
  const box = $('slots'); box.innerHTML='';
  T[st.tpl].slots.forEach((_,i)=>{
    const b = document.createElement('button'); b.className='slot'+(st.sel===i?' sel':'');
    const p = st.photos[i];
    if(p){ const im = new Image(); im.src = p.thumb; im.alt='Shot '+(i+1); b.append(im); }
    else { const d = document.createElement('span'); d.className='ph'; b.append(d); }
    b.append('Shot '+(i+1));
    b.onclick = () => { st.sel = st.sel===i ? null : i; buildSlots(); };
    box.append(b);
  });
}

/* ---------- Photos ---------- */
function setPhoto(i, src){
  const t = document.createElement('canvas'); t.width=160; t.height=120;
  cover(t.getContext('2d'), src, 0, 0, 160, 120);
  st.photos[i] = {src, thumb:t.toDataURL('image/jpeg',.7)};
  st.sel = null; buildSlots(); render();
}
function targetSlot(){
  const n = T[st.tpl].slots.length;
  if(st.sel!==null) return st.sel;
  for(let i=0;i<n;i++) if(!st.photos[i]) return i;
  return -1;
}
$('file').onchange = async e => {
  const files = [...e.target.files]; e.target.value='';
  for(const f of files){
    const i = targetSlot(); if(i<0){ toast('All shots are filled. Tap a slot to replace it.'); break; }
    const img = new Image(); img.src = URL.createObjectURL(f);
    try{ await img.decode(); setPhoto(i, img); }catch{ toast('That file could not be read as an image.'); }
  }
};
$('btnClear').onclick = () => { st.photos=[]; st.sel=null; buildSlots(); render(); };

/* ---------- Camera ---------- */
async function startCam(){
  try{
    stopCam();
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:st.facing,width:{ideal:1920},height:{ideal:1440}},audio:false});
    const v = $('video'); v.srcObject = stream; await v.play();
    v.classList.add('on'); v.classList.toggle('mirror', st.facing==='user');
    $('stageEmpty').style.display='none';
    ['btnShot','btnAuto','btnFlip'].forEach(id=>$(id).disabled=false);
    $('btnCam').textContent='Stop camera';
  }catch(e){ console.error(e); toast('Camera error: '+e.name+'. '+e.message); }
}
function stopCam(){
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  const v=$('video'); v.classList.remove('on'); v.srcObject=null;
  $('stageEmpty').style.display=''; ['btnShot','btnAuto','btnFlip'].forEach(id=>$(id).disabled=true);
  $('btnCam').textContent='Start camera';
}
$('btnCam').onclick = () => stream ? stopCam() : startCam();
$('btnFlip').onclick = () => { st.facing = st.facing==='user'?'environment':'user'; startCam(); };

async function countdown(n=3){
  const c = $('count'); c.classList.add('on');
  for(let i=n;i>0;i--){ c.textContent=i; await sleep(900); }
  c.classList.remove('on');
  const f=$('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function snap(){
  const v=$('video'), c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight;
  const x=c.getContext('2d');
  if(st.facing==='user'){ x.translate(c.width,0); x.scale(-1,1); }
  x.drawImage(v,0,0); return c;
}
function lock(b){ st.busy=b; ['btnShot','btnAuto','btnFlip'].forEach(id=>$(id).disabled=b); }
$('btnShot').onclick = async () => {
  const i = targetSlot(); if(i<0){ toast('All shots are filled. Tap a slot to retake it.'); return; }
  lock(true); await countdown(); setPhoto(i, snap()); lock(false);
};
$('btnAuto').onclick = async () => {
  const n = T[st.tpl].slots.length;
  let list = [...Array(n).keys()].filter(i=>!st.photos[i]); if(!list.length) list=[...Array(n).keys()];
  lock(true);
  for(const i of list){ st.sel=i; buildSlots(); await countdown(); setPhoto(i, snap()); await sleep(500); }
  lock(false);
};

/* ---------- Save & share ---------- */
const hasPhotos = () => st.photos.some(Boolean);
const toBlob = () => new Promise(r => $('out').toBlob(r,'image/png'));
$('btnSave').onclick = async () => {
  if(!hasPhotos()){ toast('Add at least one photo first.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(await toBlob());
  a.download = 'snapbooth-'+Date.now()+'.png'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
async function share(){
  if(!hasPhotos()){ toast('Add at least one photo first.'); return; }
  const file = new File([await toBlob()], 'snapbooth.png', {type:'image/png'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'My Snapbooth', text:'Made with Snapbooth'}); }catch{}
  } else { toast('File sharing is not supported here. Save the image, then post it.'); }
}
$('btnShare').onclick = share; $('shIg').onclick = share;
const pageUrl = encodeURIComponent(location.href);
$('shFb').href = 'https://www.facebook.com/sharer/sharer.php?u='+pageUrl;
$('shTw').href = 'https://twitter.com/intent/tweet?text='+encodeURIComponent('I made this at Snapbooth!')+'&url='+pageUrl;

/* ---------- Init ---------- */
$('cap').oninput = render; $('showDate').onchange = render;
buildTemplates(); buildSwatches(); buildSlots(); render();
if(document.fonts) document.fonts.ready.then(render);