// blurb_server.ts — a tiny local web UI for tuning the reporter personas.
// Edit each reporter's voice + temperature in the browser, hit Run, and see all
// three takes on a real news item side-by-side. Shares logic with blurb_lab.ts
// via blurb_core.ts.
//
// RUN (‑‑allow-write is for the 📌 Pin button that saves keeper fixtures):
//   export ANTHROPIC_API_KEY=sk-ant-...
//   deno run --allow-net --allow-read --allow-write --allow-env tools/blurb_server.ts
//   → open http://localhost:8000
//
// Fixtures come from tools/fixtures.json (build with build_fixtures.ts).

import { DEFAULT_PERSONAS, generateBlurb, loadFixtures, focusedBody, ANTHROPIC_MODEL } from "./blurb_core.ts";

const PORT = 8000;
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

Deno.serve({ port: PORT, onListen: () => console.log(`\n  Blurb Lab UI → http://localhost:${PORT}\n`) }, async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/") {
    return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/api/personas") return json(DEFAULT_PERSONAS);
  if (url.pathname === "/api/fixtures") {
    const fx = await loadFixtures();
    return json(fx.map((f) => ({ ...f, focused: focusedBody(f) })));
  }
  if (req.method === "POST" && url.pathname === "/api/pin") {
    try {
      const fx = await req.json();
      const path = new URL("./fixtures_pinned.json", import.meta.url);
      let pinned: any[] = [];
      try { pinned = JSON.parse(await Deno.readTextFile(path)); } catch (_) { pinned = []; }
      const dup = pinned.some((p) => (p.headline ?? "").toLowerCase() === (fx.headline ?? "").toLowerCase());
      if (!dup) pinned.push(fx);
      await Deno.writeTextFile(path, JSON.stringify(pinned, null, 2));
      return json({ ok: true, count: pinned.length, already: dup });
    } catch (e) { return json({ error: (e as Error).message }, 500); }
  }
  if (req.method === "POST" && url.pathname === "/api/generate") {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not set in this shell" }, 500);
    try {
      const { fixture, personas, offseason } = await req.json();
      const results = await Promise.all((personas as any[]).map(async (p) => {
        try { return { type: p.type, input: await generateBlurb(apiKey, fixture, p, !!offseason) }; }
        catch (e) { return { type: p.type, error: (e as Error).message }; }
      }));
      return json({ results });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }
  return new Response("not found", { status: 404 });
});

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blurb Lab</title>
<style>
  :root{ --bg:#060A18; --top:#0B2050; --surf:#141F44; --surf2:#1C2A55; --bd:#2B3A6B;
    --tx:#EEF3FB; --dim:#95A2C4; --faint:#63708F; --accent:#36C5F0; --hot:#FF5C7A; }
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--tx);
    background:linear-gradient(180deg,var(--top),var(--bg));min-height:100vh}
  header{padding:16px 22px;font-weight:800;font-size:18px;letter-spacing:-.3px;
    display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--bd)}
  header .m{font-size:11px;color:var(--faint);font-weight:600}
  .wrap{padding:18px 22px;max-width:1300px;margin:0 auto}
  .controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  select,button,input[type=number]{background:var(--surf2);color:var(--tx);border:1px solid var(--bd);
    border-radius:8px;padding:8px 10px;font:inherit}
  select{min-width:340px;max-width:60vw}
  button{cursor:pointer;font-weight:700}
  button#run{background:var(--accent);color:#06223A;border:none;padding:9px 18px}
  label.off{display:flex;align-items:center;gap:6px;color:var(--dim);font-weight:600}
  .preview{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:16px;margin-bottom:16px}
  .preview .src{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--accent);margin-bottom:6px}
  .preview .src .srclink{color:var(--tx);text-decoration:underline;text-underline-offset:2px}
  .preview .src .srclink:hover{color:var(--accent)}
  .preview .hl{font-size:16px;font-weight:800;margin-bottom:8px}
  .preview .body{color:var(--dim);font-size:13px;max-height:120px;overflow:auto}
  .preview .focus{margin-top:8px;padding:10px;border:1px solid rgba(54,197,240,.35);border-radius:8px;background:rgba(54,197,240,.06);color:var(--tx);font-size:13px;max-height:140px;overflow:auto}
  .preview .focus .flabel{display:block;color:var(--accent);font-size:10.5px;font-weight:800;letter-spacing:.4px;margin-bottom:5px}
  .preview .meta{margin-top:10px;color:var(--faint);font-size:12px;font-weight:600}
  .preview .ment{margin-top:6px;color:var(--dim);font-size:11.5px;line-height:1.4}
  .cols{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  @media(max-width:900px){.cols{grid-template-columns:1fr}}
  .col{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
  .col .name{font-weight:800;font-size:15px}
  .col label{color:var(--faint);font-size:11px;font-weight:700}
  .col input[type=number]{width:80px;margin-left:6px}
  textarea{width:100%;background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:8px;
    padding:9px;font:12.5px/1.4 ui-monospace,Menlo,monospace;resize:vertical}
  .result{margin-top:6px;min-height:40px}
  .subj{font-size:11px;font-weight:700;color:var(--faint);margin-bottom:4px}
  .blurb{font-size:15px;font-weight:700;line-height:1.35;color:#fff}
  .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .chip{font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--accent);
    background:rgba(54,197,240,.14);border:1px solid rgba(54,197,240,.4);border-radius:5px;padding:3px 6px}
  .why{margin-top:6px;font-size:12px;font-style:italic;color:var(--dim)}
  .spin{color:var(--faint)} .err{color:var(--hot);font-size:12px}
</style></head><body>
<header>⚡ Blurb Lab <span class="m" id="model"></span></header>
<div class="wrap">
  <div class="controls">
    <select id="fixture"></select>
    <label class="off"><input type="checkbox" id="offseason"> Offseason</label>
    <button id="run">Run ▸</button>
    <button id="pin">📌 Pin</button>
    <button id="copy">Copy personas</button>
  </div>
  <div class="preview" id="preview"></div>
  <div class="cols" id="cols"></div>
</div>
<script>
let PERSONAS=[], FIXTURES=[];
function esc(s){return (s||'').replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
async function boot(){
  document.getElementById('model').textContent='';
  PERSONAS = Object.values(await (await fetch('/api/personas')).json());
  FIXTURES = await (await fetch('/api/fixtures')).json();
  const sel=document.getElementById('fixture');
  FIXTURES.forEach(function(f,i){var o=document.createElement('option');o.value=i;
    o.textContent='['+f.label+'] '+f.headline.slice(0,58)+' — '+(f.source||'?');sel.appendChild(o);});
  sel.onchange=renderPreview; renderPreview(); buildCols();
}
function renderPreview(){
  var f=FIXTURES[document.getElementById('fixture').value]; if(!f)return;
  document.getElementById('preview').innerHTML=
    '<div class="src">'+esc(f.source||'?')+'  ·  ['+esc(f.label)+']'+
      (f.url?'  ·  <a class="srclink" href="'+encodeURI(f.url)+'" target="_blank" rel="noopener">view source article ↗</a>':'')+'</div>'+
    '<div class="hl">'+esc(f.headline)+'</div>'+
    '<div class="body">'+esc(f.body)+'</div>'+
    ((f.focused && f.focused.length < f.body.length)?
      '<div class="focus"><span class="flabel">▸ MODEL SEES (focused passage, '+f.focused.length+'c)</span>'+esc(f.focused)+'</div>':'')+
    '<div class="meta">'+f.players.map(function(p){return p.position+' '+esc(p.full_name)+' ('+p.role+
      (p.teammates&&p.teammates.length?'; room: '+p.teammates.map(esc).join(', '):'')+')';}).join(' · ')+
    '  ·  body '+f.body.length+'c</div>'+
    ((f.mentioned&&f.mentioned.length)?'<div class="ment">referenced (authoritative): '+
      f.mentioned.map(function(m){return esc(m.name)+' ('+(m.position||'?')+', '+(m.team||'FA')+')';}).join('  ·  ')+'</div>':'');
}
function buildCols(){
  var cols=document.getElementById('cols'); cols.innerHTML='';
  PERSONAS.forEach(function(p,i){
    var c=document.createElement('div'); c.className='col';
    c.innerHTML='<div class="name">'+esc(p.name)+'</div>'+
      '<label>temperature (0–1)<input type="number" step="0.05" min="0" max="1" value="'+p.temperature+'" data-t="'+i+'"></label>'+
      '<textarea data-v="'+i+'" rows="8">'+esc(p.voice)+'</textarea>'+
      '<div class="result" id="res'+i+'"></div>';
    cols.appendChild(c);
  });
}
function currentPersonas(){
  return PERSONAS.map(function(p,i){return {type:p.type,name:p.name,
    temperature:parseFloat(document.querySelector('[data-t="'+i+'"]').value),
    voice:document.querySelector('[data-v="'+i+'"]').value};});
}
async function run(){
  var f=FIXTURES[document.getElementById('fixture').value];
  var personas=currentPersonas();
  var offseason=document.getElementById('offseason').checked;
  personas.forEach(function(_,i){document.getElementById('res'+i).innerHTML='<span class="spin">generating…</span>';});
  var r=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({fixture:f,personas:personas,offseason:offseason})});
  var data=await r.json();
  if(data.error){personas.forEach(function(_,i){document.getElementById('res'+i).innerHTML='<span class="err">'+esc(data.error)+'</span>';});return;}
  data.results.forEach(function(res,i){
    var el=document.getElementById('res'+i);
    if(res.error){el.innerHTML='<span class="err">'+esc(res.error)+'</span>';return;}
    var x=res.input;
    var chips=[x.action,x.severity,x.confidence,x.timeframe,(x.relevance!=null?'rel '+x.relevance:''),
      ((x.tags||[]).join(' '))].filter(Boolean);
    el.innerHTML=(x.subject?'<div class="subj">▸ '+esc(x.subject)+'</div>':'')+
      '<div class="blurb">'+esc(x.blurb||'(none)')+'</div>'+
      '<div class="chips">'+chips.map(function(t){return '<span class="chip">'+esc(t)+'</span>';}).join('')+'</div>'+
      (x.reasoning?'<div class="why">'+esc(x.reasoning)+'</div>':'');
  });
}
function copyPersonas(){
  var s=currentPersonas().map(function(x){return x.type+' — temp '+x.temperature+'\\n'+x.voice;}).join('\\n\\n');
  navigator.clipboard.writeText(s);
  var b=document.getElementById('copy'); b.textContent='Copied!'; setTimeout(function(){b.textContent='Copy personas';},1200);
}
async function pin(){
  var f=FIXTURES[document.getElementById('fixture').value]; if(!f)return;
  var r=await fetch('/api/pin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f)});
  var d=await r.json(); var b=document.getElementById('pin');
  b.textContent = d.ok ? (d.already?'Already pinned':'Pinned ('+d.count+')') : 'Error';
  setTimeout(function(){b.textContent='📌 Pin';},1500);
}
document.getElementById('run').onclick=run;
document.getElementById('pin').onclick=pin;
document.getElementById('copy').onclick=copyPersonas;
boot();
</script></body></html>`;
