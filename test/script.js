// ---------- Background animation (canvas) ----------
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;

window.addEventListener('resize', ()=>{ W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

// particles: letters/numbers floating upward
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const particles = [];
const maxParticles = 120;

function rand(min,max){ return Math.random()*(max-min)+min }

function createParticle(){
  const size = rand(12,36);
  const x = rand(0, W);
  const y = H + rand(0, 200);
  const vx = rand(-0.2,0.2);
  const vy = -rand(0.3,1.2);
  const ch = chars.charAt(Math.floor(Math.random()*chars.length));
  const alpha = rand(0.08,0.35);
  const rot = rand(0,Math.PI*2);
  particles.push({x,y,vx,vy,size,ch,alpha,rot,rotv:rand(-0.01,0.01) });
}

for(let i=0;i<maxParticles;i++) createParticle();

function draw(){
  ctx.clearRect(0,0,W,H);
  for(let i=0;i<particles.length;i++){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.rot += p.rotv;
    if(p.y < -40 || p.x < -50 || p.x > W+50) {
      // reset
      p.x = rand(0,W); p.y = H + rand(0,200); p.vy = -rand(0.3,1.2); p.vx = rand(-0.2,0.2); p.alpha = rand(0.06,0.32);
      p.ch = chars.charAt(Math.floor(Math.random()*chars.length)); p.size = rand(12,36);
    }
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.font = `${p.size}px Inter, Arial`;
    ctx.fillStyle = 'white';
    ctx.fillText(p.ch, -p.size/4, p.size/4);
    ctx.restore();
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---------- App logic (analyze + generate) ----------
const sampleTexts = [
  "The quick brown fox jumps over the lazy dog.",
  "2023 brought many changes: 7 launches, 3 delays, and 12 lessons learned.",
  "Coding in JavaScript can be both fun and challenging.",
  "Roses are red, violets are blue, HTML and CSS, I love you."
];

const $ = id => document.getElementById(id);
$('btnRandom').addEventListener('click', async ()=>{
  const lines = $('textInput').value.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.length===0){ // insert sample
    $('textInput').value = sampleTexts[Math.floor(Math.random()*sampleTexts.length)];
    return;
  }
  // pick random line; if it's a URL try fetch
  const pick = lines[Math.floor(Math.random()*lines.length)];
  if(/^https?:\/\//i.test(pick)){
    try{
      $('textInput').value = 'Fetching ' + pick + ' ...';
      const res = await fetch(pick);
      const html = await res.text();
      const cleaned = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'')
                          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi,'')
                          .replace(/<[^>]+>/g,' ')
                          .replace(/\s+/g,' ').trim();
      $('textInput').value = cleaned.slice(0,20000);
    }catch(e){
      console.warn(e);
      $('textInput').value = sampleTexts[1] + '\n\n// (failed to fetch ' + pick + ' — likely CORS)';
    }
  } else {
    $('textInput').value = pick;
  }
});

$('btnClear').addEventListener('click', ()=>{ $('textInput').value=''; $('generated').textContent='(nothing yet)'; $('totalWords').textContent='—'; $('startsWith').textContent='—'; });

$('btnAnalyze').addEventListener('click', ()=>{
  const text = $('textInput').value.trim();
  const char = $('letterInput').value.trim();
  const type = $('generationType').value;
  if(!text) return alert('Please paste or fetch some text first.');
  if(!char) return alert('Please enter a letter or number to analyze.');

  const words = text.match(/[\p{L}\p{N}'’\-]+/gu) || [];
  const total = words.length;
  const starts = words.filter(w => w[0] && w[0].toLowerCase() === char.toLowerCase()).length;

  $('totalWords').textContent = total;
  $('startsWith').textContent = starts;

  const generated = generateFor(char, type);
  $('generated').textContent = generated;
});

function generateFor(ch,type){
  const s = ch;
  if(type==='haiku'){
    const a = [`${s.toUpperCase()} dawns on the meadow`, `${s} winds whisper low`, `${s} petals drift away`];
    const b = [`a single heartbeat`, `echoes along the valley`, `softly counts the hours`];
    const c = [`still breath of night`, `dawn spreads a quiet`, `and the world exhales`];
    return `${pickRandom(a)}\n${pickRandom(b)}\n${pickRandom(c)}`;
  }
  if(type==='riddle'){
    const r = [
      `I begin with ${s}. I am small but start many words. Who am I?`,
      `I stand at the start and signal the rest. I am ${s} — what am I called?`,
      `First among letters or numbers, I open the gate. I start your words — guess my state.`
    ];
    return pickRandom(r);
  }
  // rhyming poem (simple AABB or couplet)
  if(type==='poem'){
    // naive rhyming by repeating ending sound — small templates to suggest rhyme
    const lines = [
      `${s.toUpperCase()} lights the line and makes it bloom,\nWords fall in order like stars in a room.`,
      `${s} sings in silver, ${s} hums in gold,\nEvery word you start with ${s}, a little tale is told.`,
      `When ${s} begins, the sentence sways,\nIt carries the tune through nights and days.`
    ];
    return pickRandom(lines);
  }
  return '';
}

function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
