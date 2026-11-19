'use strict';
/* ===== STORAGE ===== */
const K={s:'scofield.session',h:'scofield.history',g:'scofield.guinness',gh:'scofield.guinness.history',p:'scofield.prefs',c:'scofield.cfg'};
const Store={ok:true,
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){this.ok=false;return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){this.ok=false}},
  del(k){try{localStorage.removeItem(k)}catch(e){this.ok=false}}};

/* ===== CHRONO : horodatages absolus alignés sur performance.now() (pas de dérive) ===== */
let T0=Date.now()-performance.now();
const now=()=>T0+performance.now();

/* ===== OUTILS ===== */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cl=(v,a,b,d)=>{v=parseInt(v,10);return isNaN(v)?d:Math.min(b,Math.max(a,v))};
const mmss=ms=>{const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const cad=(r,ms)=>r>0&&ms>0?(r/(ms/60000)).toFixed(1):'—';
const unit=v=>v==='—'?v:v+' /min';
const fdate=t=>new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' •');
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const set=(id,v)=>{const e=document.getElementById(id);if(e&&e.textContent!==String(v))e.textContent=v};
const md=h=>{const e=$('#md');e.innerHTML=h;e.style.display=h?'grid':'none'};
const toast=m=>{const e=$('#ts');e.textContent=m;e.style.opacity=1;clearTimeout(e._t);e._t=setTimeout(()=>e.style.opacity=0,3000)};
let P=Store.get(K.p,{snd:true}),AC=null,wl=null;
const sbT=()=>$('#sb').textContent=P.snd?'♪ Son activé':'✕ Son coupé';
function beep(f=880,d=.12){if(!P.snd)return;try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=.07;o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+d)}catch(e){}}
async function wake(){try{if('wakeLock' in navigator&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>wl=null)}}catch(e){wl=null}}
const unwake=()=>{try{wl&&wl.release()}catch(e){}wl=null};

/* ===== STATISTIQUES (pur, sans DOM) ===== */
const curMs=(S,t=now())=>S.run?S.acc+t-S.run:S.acc;
function stats(S,t=now()){
  const done=S.phase==='done',a=S.phase==='paused'?S.from:S.phase,c=done?0:curMs(S,t);
  let w=0,r=0,reps=0,inv=0,n=0;
  S.sets.forEach((s,i)=>{let sw=s.work,sr=s.rest;
    if(!done&&i===S.i){if(a==='work')sw=c;else if(a==='rest')sr=c}
    w+=sw;r+=sr;inv+=s.inv;if(s.st==='ok'||s.st==='inc'){reps+=s.reps;n++}});
  const tot=(S.end||t)-S.start,pt=S.pauseT+(S.phase==='paused'?t-S.pAt:0),fin=S.sets.filter(s=>s.work>0);
  return{tot,w,r,pt,reps,inv,n,cg:cad(reps,tot),cw:cad(reps,w),
    wAvg:avg(fin.map(s=>s.work)),rAvg:avg(S.sets.filter(s=>s.rest>0).map(s=>s.rest)),
    fast:fin.length?fin.reduce((m,s)=>s.work<m.work?s:m):null,slow:fin.length?fin.reduce((m,s)=>s.work>m.work?s:m):null};
}

/* ===== SÉANCE (10 séries) ===== */
let S=Store.get(K.s,null),G=Store.get(K.g,null),busy=false,note='',mi=0;
const save=()=>Store.set(K.s,S);
function arch(){const h=Store.get(K.h,[]),i=h.findIndex(x=>x.id===S.id);i<0?h.push(S):h[i]=S;Store.set(K.h,h);unwake()}
const Sess={
  start(c){const t=now();S={id:Math.round(t),name:c.name,start:t,cfg:c,
    sets:Array.from({length:c.sets},(_,i)=>({n:i+1,target:c.reps,reps:0,inv:0,note:'',work:0,rest:0,st:'todo'})),
    i:0,phase:'work',run:t,acc:0,pauseT:0,pAt:0,from:null,end:null,rb:false};save();wake();beep()},
  finish(){if(S.phase!=='work')return;const s=S.sets[S.i],t=now();s.work=curMs(S,t);s.st='pend';
    if(S.i===S.sets.length-1){S.phase='done';S.end=t;S.run=null;S.acc=0;arch()}
    else{S.phase='rest';S.run=t;S.acc=0;S.rb=false}
    save();beep();setModal(S.i)},
  next(){if(S.phase!=='rest')return;if(S.sets[S.i].st==='pend')return setModal(S.i);
    S.sets[S.i].rest=curMs(S);S.i++;S.phase='work';S.run=now();S.acc=0;save();beep(660)},
  pause(){if(S.phase!=='work'&&S.phase!=='rest')return;const t=now();S.acc=curMs(S,t);S.run=null;S.from=S.phase;S.phase='paused';S.pAt=t;save()},
  resume(){if(S.phase!=='paused')return;const t=now();S.pauseT+=t-S.pAt;S.phase=S.from;S.run=t;save()},
  clear(){S=null;Store.del(K.s);unwake()}
};

/* ===== MODE GUINNESS 60 MIN ===== */
const GM=3600000,BIN=300000;
const gEl=(t=now())=>G?Math.min(GM,(G.end||t)-G.start):0;
const gReps=()=>G.ev.reduce((a,e)=>a+e.n,0);
const gRest=(t=now())=>G.rest+(G.rAt?t-G.rAt:0);
const bins=g=>{const b=Array(12).fill(0);g.ev.forEach(e=>b[Math.min(11,Math.floor(e.t/BIN))]+=e.n);return b};
const gSave=()=>Store.set(K.g,G);
const Guin={
  start(){G={id:Math.round(now()),start:now(),ev:[],rest:0,rAt:null,end:null,bin:0};gSave();wake();beep()},
  add(n){if(!G||G.end)return;G.ev.push({t:gEl(),n});gSave();beep(740,.05)},
  undo(){if(G&&!G.end){G.ev.pop();gSave()}},
  rest(){if(!G||G.end)return;const t=now();if(G.rAt){G.rest+=t-G.rAt;G.rAt=null}else G.rAt=t;gSave()},
  end(){if(!G||G.end)return;const t=now();if(G.rAt){G.rest+=t-G.rAt;G.rAt=null}G.end=Math.min(t,G.start+GM);
    const h=Store.get(K.gh,[]);h.push(G);Store.set(K.gh,h);gSave();unwake();beep(520,.3)},
  clear(){G=null;Store.del(K.g)}
};

/* ===== VUES ===== */
const sc=(l,v,id)=>`<div class="card"><div class="lbl">${l}</div><div class="f text-2xl sm:text-3xl num"${id?` id="${id}"`:''}>${v}</div></div>`;
const stp=(id,l,v)=>`<div class="flex items-center justify-between gap-2 my-2"><span>${l}</span><div class="flex items-center gap-2"><button class="btn" data-a="step" data-t="${id}" data-d="-1">−</button><input id="${id}" type="number" inputmode="numeric" min="0" value="${v}" class="inp !w-20 text-center f text-2xl"><button class="btn" data-a="step" data-t="${id}" data-d="1">+</button></div></div>`;

function tbl(T,live){
  const a=T.phase==='paused'?T.from:T.phase;
  return`<div class="overflow-x-auto"><table class="w-full text-sm num"><thead class="lbl"><tr><th class="text-left">Série</th><th class="text-right">Reps</th><th class="text-right">Travail</th><th class="text-right">Repos</th><th class="text-right">Statut</th></tr></thead><tbody>`+
  T.sets.map((s,i)=>{
    const cur=live&&T.phase!=='done'&&i===T.i,conf=s.st==='ok'||s.st==='inc',e=conf||s.st==='pend';
    let st=s.st==='ok'?'Terminée':s.st==='inc'?'Incomplète':s.st==='pend'?'À valider':cur?(T.phase==='paused'?'En pause':'En cours'):'À venir';
    if(cur&&a==='rest'&&conf)st='Repos';
    return`<tr class="${cur?'cur':''}${live&&e?' cursor-pointer':''}"${live&&e?` data-a="setRow" data-i="${i}"`:''}><td class="f text-lg">${s.n}</td><td class="text-right">${conf?s.reps:'—'}${s.inv?` <span class="${cur?'':'red'}">(${s.inv}✗)</span>`:''}</td><td class="text-right">${s.work>0?mmss(s.work):'—'}</td><td class="text-right">${s.rest>0?mmss(s.rest):'—'}</td><td class="text-right">${st}</td></tr>`}).join('')+'</tbody></table></div>';
}

function bilan(T){
  const x=stats(T),f=T.sets.filter(s=>s.work>0),ev=f.length>1?`${mmss(f[0].work)} → ${mmss(f[f.length-1].work)}`:'—';
  const sf=s=>s?`n°${s.n} · ${mmss(s.work)}`:'—';
  return`<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">`+sc('Pompes',x.reps+' / '+T.cfg.sets*T.cfg.reps)+sc('Séries terminées',x.n+' / '+T.cfg.sets)+sc('Durée totale',mmss(x.tot))+sc('Temps de travail',mmss(x.w))+sc('Temps de repos',mmss(x.r))+sc('Pauses',mmss(x.pt))+sc('Moyenne par série',mmss(x.wAvg))+sc('Repos moyen',mmss(x.rAvg))+sc('Cadence globale',unit(x.cg))+sc('Cadence de travail',unit(x.cw))+sc('Série la plus rapide',sf(x.fast))+sc('Série la plus lente',sf(x.slow))+sc('Évolution des temps',ev)+sc('Invalides',x.inv)+`</div>`;
}

function setup(){
  const c=Store.get(K.c,{sets:10,reps:30,rest:60}),chips=[0,30,45,60,90,120,180].map(v=>`<button type="button" class="btn !min-h-[40px] !px-3 text-sm" onclick="document.getElementById('cd').value=${v}">${v?v+' s':'Libre'}</button>`).join('');
  return`<div class="card max-w-xl mx-auto"><h2 class="f text-3xl mb-1">Configuration de la séance</h2><p class="lbl mb-3" id="dt"></p>
  <label class="lbl">Nom de la séance</label><input id="cn" class="inp mb-2" maxlength="40" value="Séance du ${new Date().toLocaleDateString('fr-FR')}">
  <div class="grid grid-cols-2 gap-2"><div><label class="lbl">Séries</label><input id="cs" type="number" inputmode="numeric" min="1" max="50" value="${c.sets}" class="inp" oninput="upd()"></div>
  <div><label class="lbl">Reps / série</label><input id="cr" type="number" inputmode="numeric" min="1" max="500" value="${c.reps}" class="inp" oninput="upd()"></div>
  </div><label class="lbl mt-2 block">Temps de repos en secondes (0 = repos libre)</label><input id="cd" type="number" inputmode="numeric" min="0" max="3600" value="${c.rest}" class="inp"><div class="flex flex-wrap gap-2 mt-2">${chips}</div>
  <p class="my-4 text-center f text-3xl" id="obj"></p>
  <button class="btn p w-full" data-a="start" data-l="1">COMMENCER LA SÉANCE</button></div>`;
}
function upd(){const s=cl($('#cs').value,1,50,10),r=cl($('#cr').value,1,500,30);set('obj',`${s} × ${r} = ${s*r} pompes`)}

function vTrain(){
  if(!S)return setup();
  const x=stats(S),d=S.phase==='done',cfg=S.cfg,tot=cfg.sets*cfg.reps,a=S.phase==='paused'?S.from:S.phase;
  const lab={work:'EN COURS',rest:'REPOS',paused:'EN PAUSE',done:'TERMINÉ'}[S.phase];
  const p=S.sets.filter(s=>s.st!=='todo').length/cfg.sets,pr=[['work','finish','TERMINER LA SÉRIE'],['rest','next','REPRENDRE'],['paused','resume','REPRENDRE APRÈS PAUSE'],['done','reset','NOUVELLE SÉANCE']].find(z=>z[0]===S.phase);
  const sub=d?'Bilan ci-dessous':a==='work'?`${cfg.reps} pompes à effectuer`:cfg.rest?`Repos cible : ${mmss(cfg.rest*1000)}`:'Repos libre';
  const bar=`<div class="h-2 rounded bg-[#222] mt-2"><div class="h-2 rounded" style="background:var(--red);width:${Math.min(100,x.reps/tot*100)}%"></div></div>`;
  const timer=`<div class="card text-center"><span class="badge">${lab}</span>
   <div class="relative mx-auto my-3 aspect-square w-full max-w-[420px]">
    <svg viewBox="0 0 200 200" class="absolute inset-0 w-full h-full -rotate-90 ring"><circle cx="100" cy="100" r="92" fill="none" stroke="#1f1f1f" stroke-width="8"/><circle cx="100" cy="100" r="92" fill="none" stroke="#d4141c" stroke-width="8" stroke-linecap="round" stroke-dasharray="578" stroke-dashoffset="${578*(1-p)}" style="transition:stroke-dashoffset .6s"/></svg>
    <div class="absolute inset-0 grid place-content-center gap-1"><div class="lbl">Série actuelle</div><div class="f text-3xl red">${d?cfg.sets:S.i+1} / ${cfg.sets}</div><div id="tm" class="f timer num">${d?mmss(x.tot):'00:00'}</div><div class="lbl">${sub}</div></div></div>
   <div class="grid gap-2 max-w-md mx-auto"><button class="btn p" data-a="${pr[1]}" data-l="1">${pr[2]}</button>
   ${a==='work'&&S.phase!=='paused'||S.phase==='rest'?'<button class="btn" data-a="pause" data-l="1">METTRE EN PAUSE</button>':''}
   ${d?'':'<button class="btn d mt-3" data-a="askCancel">ANNULER LA SÉANCE</button>'}</div></div>`;
  const obj=`<div class="card flex flex-wrap items-center justify-around gap-3 mb-3 text-center"><div class="lbl text-left">Objectif<br>de la séance</div><div><b class="f text-3xl">${cfg.sets}</b><div class="lbl">Séries</div></div><div class="f text-2xl">×</div><div><b class="f text-3xl">${cfg.reps}</b><div class="lbl">Pompes par série</div></div><div class="f text-2xl">=</div><div><b class="f text-3xl">${tot}</b><div class="lbl">Pompes totales</div></div><div class="lbl" id="dt"></div></div>`;
  if(d)return obj+`<div class="grid md:grid-cols-2 gap-3 mb-3">${timer}<div class="card grid place-content-center text-center gap-2"><div class="f text-3xl red">SÉANCE TERMINÉE</div><div class="f text-7xl num">${x.reps}</div><div class="lbl">pompes confirmées sur ${tot}</div>${S.sets.some(s=>s.st==='pend')?'<p class="red">Des séries restent à valider : touche la ligne pour confirmer.</p>':''}</div></div><div class="card mb-3"><h3 class="f text-2xl mb-2">Séries</h3>${tbl(S,true)}</div>${bilan(S)}`;
  return obj+`<section class="grid md:grid-cols-2 lg:grid-cols-12 gap-3">
   <div class="order-2 lg:order-1 lg:col-span-3 grid gap-3 content-start">${`<div class="card"><div class="lbl">Total effectué</div><div class="f text-3xl num">${x.reps} / ${tot}</div>${bar}</div>`+sc('Temps total',mmss(x.tot),'tt')+sc('Cadence moyenne',unit(x.cg),'cg')+sc('Cadence de travail',unit(x.cw),'cw')}</div>
   <div class="order-1 md:col-span-2 lg:order-2 lg:col-span-5">${timer}</div>
   <div class="order-3 lg:col-span-4 grid gap-3 content-start"><div class="grid grid-cols-2 gap-3">${sc('Travail cumulé',mmss(x.w),'tw')+sc('Repos cumulé',mmss(x.r),'tr')}</div><div class="card"><h3 class="f text-xl mb-1">Progression des séries</h3>${tbl(S,true)}</div></div></section>`;
}

function vG(){
  const dis='<p class="lbl mt-3">Outil d’entraînement et de suivi personnel. Il ne remplace ni les témoins, ni le comptage officiel, ni les preuves exigées par Guinness World Records.</p>';
  if(!G)return`<div class="card max-w-xl mx-auto text-center"><h2 class="f text-3xl">MODE GUINNESS · 60 MIN</h2><p class="my-3 text-[#ccc]">Chronomètre continu de 60 minutes. Il ne s’arrête jamais pendant les pauses : tu signales seulement tes périodes de repos.</p><button class="btn p w-full" data-a="gStart" data-l="1">DÉMARRER LES 60 MIN</button>${dis}</div>`+gHist();
  const el=gEl(),done=!!G.end,reps=gReps(),b=bins(G),mx=Math.max(...b,1),cb=Math.min(11,Math.floor(el/BIN));
  const cols=b.map((n,i)=>`<div class="flex-1 text-center"><div class="h-24 flex items-end"><div class="w-full rounded-t" style="height:${n/mx*100}%;min-height:${n?3:0}px;background:${i===cb&&!done?'var(--red)':'#f2f2f2'}"></div></div><div class="num text-xs">${n}</div><div class="lbl">${(i+1)*5}</div></div>`).join('');
  return`<div class="grid md:grid-cols-2 gap-3"><div class="card text-center"><span class="badge">${done?'TERMINÉ':G.rAt?'REPOS':'EN COURS'}</span>
   <div class="lbl mt-3">Temps restant</div><div id="gr" class="f timer num">${mmss(GM-el)}</div>
   <div class="h-2 rounded bg-[#222] my-3"><div id="gb" class="h-2 rounded" style="background:var(--red);width:${el/GM*100}%"></div></div>
   <div class="lbl">Répétitions validées</div><div class="f text-7xl num">${reps}</div>
   <div class="grid gap-2 mt-3 max-w-md mx-auto"><button class="btn p !min-h-[110px] !text-5xl f" data-a="gAdd" data-n="1" data-l="1"${done?' disabled':''}>+1</button>
   <div class="grid grid-cols-2 gap-2"><button class="btn" data-a="gAdd" data-n="5" data-l="1"${done?' disabled':''}>+5</button><button class="btn" data-a="gUndo" data-l="1"${done?' disabled':''}>Annuler la dernière saisie</button></div>
   ${done?'<button class="btn p" data-a="gReset">NOUVELLE TENTATIVE</button>':`<button class="btn" data-a="gRest" data-l="1">${G.rAt?'JE REPRENDS':'JE ME REPOSE'}</button><button class="btn d mt-3" data-a="askG">TERMINER LA TENTATIVE</button>`}</div></div>
  <div class="grid gap-3 content-start"><div class="grid grid-cols-3 gap-3">${sc('Écoulé',mmss(el),'gel')+sc('Cadence',unit(cad(reps,el)),'gc')+sc('Repos',mmss(gRest()),'grst')}</div>
  <div class="card"><h3 class="f text-xl mb-2">Pompes par tranche de 5 minutes</h3><div class="flex gap-1">${cols}</div></div>${dis}</div></div>`+gHist();
}
function gHist(){
  const h=Store.get(K.gh,[]).slice().reverse().filter(g=>!G||g.id!==G.id);
  if(!h.length)return'';
  return`<h3 class="f text-2xl mt-6 mb-2">Historique des 60 minutes</h3><div class="grid gap-2">`+h.map(g=>{const r=g.ev.reduce((a,e)=>a+e.n,0),el=g.end-g.start;return`<div class="card flex items-center justify-between gap-2"><div><b>${fdate(g.start)}</b><div class="lbl">${mmss(el)} · repos ${mmss(g.rest)}</div></div><div class="text-right"><b class="f text-2xl">${r}</b><div class="lbl">${unit(cad(r,el))}</div></div><button class="btn d" data-a="askGH" data-id="${g.id}">Supprimer</button></div>`}).join('')+'</div>';
}

function vHist(){
  const h=Store.get(K.h,[]).slice().reverse();
  const li=h.map(s=>{const x=stats(s),ok=x.reps>=s.cfg.sets*s.cfg.reps;
    return`<button class="card w-full text-left grid grid-cols-2 sm:grid-cols-5 gap-2 items-center" data-a="hOpen" data-id="${s.id}"><div class="col-span-2 sm:col-span-1"><b>${esc(s.name)}</b><div class="lbl">${fdate(s.start)}</div></div><div><div class="lbl">Objectif</div>${s.cfg.sets} × ${s.cfg.reps}</div><div><div class="lbl">Total</div><b>${x.reps}</b></div><div><div class="lbl">Durée / cadence</div>${mmss(x.tot)} · ${unit(x.cg)}</div><div class="${ok?'font-bold':'red'}">${ok?'Objectif atteint':'Incomplet'}</div></button>`}).join('');
  return`<h2 class="f text-3xl mb-3">Historique des séances</h2><div class="grid gap-2">${li||'<p class="lbl">Aucune séance terminée pour l’instant. Lance un entraînement pour la retrouver ici.</p>'}</div>`;
}

function setModal(i){
  mi=i;const s=S.sets[i];
  md(`<div class="card w-full max-w-md"><h3 class="f text-2xl">Série ${s.n} · confirmation</h3><p class="lbl mb-2">Objectif ${s.target} · travail ${mmss(s.work)}</p>${stp('fr','Répétitions validées',s.st==='pend'?s.target:s.reps)}${stp('fi','Répétitions invalides',s.inv)}<textarea id="fn" rows="2" class="inp mt-2" placeholder="Observation (facultatif)">${esc(s.note)}</textarea><button class="btn p w-full mt-3" data-a="saveSet" data-l="1">CONFIRMER</button><button class="btn w-full mt-2" data-a="closeM">Plus tard</button></div>`);
}
const ask=(m,yes,id='')=>md(`<div class="card w-full max-w-sm"><p class="mb-4">${m}</p><div class="grid grid-cols-2 gap-2"><button class="btn" data-a="closeM">Non</button><button class="btn r" data-a="${yes}" data-id="${id}">Oui</button></div></div>`);

/* ===== ACTIONS ===== */
const A={
  start(){const c={name:($('#cn').value||'Séance').trim().slice(0,40),sets:cl($('#cs').value,1,50,10),reps:cl($('#cr').value,1,500,30),rest:cl($('#cd').value,0,3600,0)};Store.set(K.c,c);Sess.start(c)},
  finish(){Sess.finish()},next(){Sess.next()},pause(){Sess.pause()},resume(){Sess.resume()},reset(){Sess.clear()},
  askCancel(){ask('Annuler la séance en cours ? Les données de cette séance seront perdues.','cancel')},
  cancel(){Sess.clear();md('')},
  step(d){const e=document.getElementById(d.t);e.value=Math.max(0,(+e.value||0)+ +d.d)},
  setRow(d){setModal(+d.i)},
  saveSet(){const s=S.sets[mi],r=cl($('#fr').value,0,999,0);s.reps=r;s.inv=cl($('#fi').value,0,999,0);s.note=$('#fn').value.slice(0,200);s.st=r>=s.target?'ok':'inc';save();if(S.phase==='done')arch();md('')},
  closeM(){md('')},
  hOpen(d){const s=Store.get(K.h,[]).find(x=>x.id==d.id);if(!s)return;md(`<div class="card w-full max-w-3xl max-h-[92dvh] overflow-y-auto"><h3 class="f text-2xl">${esc(s.name)}</h3><p class="lbl mb-3">${fdate(s.start)}</p>${bilan(s)}<div class="card mt-3">${tbl(s,false)}</div><div class="grid grid-cols-2 gap-2 mt-3"><button class="btn" data-a="closeM">Fermer</button><button class="btn d" data-a="askH" data-id="${s.id}">Supprimer</button></div></div>`)},
  askH(d){ask('Supprimer définitivement cette séance ?','hDel',d.id)},
  hDel(d){Store.set(K.h,Store.get(K.h,[]).filter(x=>x.id!=d.id));md('')},
  gStart(){Guin.start()},gAdd(d){Guin.add(+d.n)},gUndo(){Guin.undo()},gRest(){Guin.rest()},
  askG(){ask('Terminer la tentative maintenant ?','gEnd')},gEnd(){Guin.end();md('')},gReset(){Guin.clear()},
  askGH(d){ask('Supprimer cette tentative de l’historique ?','ghDel',d.id)},
  ghDel(d){Store.set(K.gh,Store.get(K.gh,[]).filter(x=>x.id!=d.id));md('')},
  fs(){try{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>toast('Plein écran indisponible'))}catch(e){toast('Plein écran indisponible')}},
  snd(){P.snd=!P.snd;Store.set(K.p,P);sbT()}
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b||b.disabled||!A[b.dataset.a])return;
  if(b.dataset.l){if(busy)return;busy=true;setTimeout(()=>busy=false,350)}   // anti double-clic
  note='';A[b.dataset.a](b.dataset);render();
});

/* ===== RENDU + BOUCLE ===== */
function render(){
  const h=location.hash.slice(1),view=['train','guinness','history'].includes(h)?h:'train';
  document.querySelectorAll('[data-n]').forEach(a=>a.classList.toggle('on',a.dataset.n===view));
  $('#v').dataset.view=view;
  $('#v').innerHTML=(Store.ok?'':'<div class="card mb-3 red">Stockage local indisponible : les données ne seront pas sauvegardées.</div>')+(note?`<div class="card mb-3">${note}</div>`:'')+(view==='train'?vTrain():view==='guinness'?vG():vHist());
  if(view==='train'&&!S)upd();
  tick();
}
function tick(){
  const t=now(),view=$('#v').dataset.view;set('dt',fdate(t));
  if(S&&S.phase!=='done'&&view==='train'){
    const x=stats(S,t),c=curMs(S,t),r=S.phase==='rest'||(S.phase==='paused'&&S.from==='rest'),over=r&&S.cfg.rest>0&&c>=S.cfg.rest*1000;
    set('tm',mmss(c));set('tt',mmss(x.tot));set('tw',mmss(x.w));set('tr',mmss(x.r));set('cg',unit(x.cg));set('cw',unit(x.cw));
    $('#tm')?.classList.toggle('over',over);
    if(over&&!S.rb&&S.phase==='rest'){S.rb=true;save();beep(1040,.25)}
  }
  if(G&&!G.end){
    const el=gEl(t),b=Math.min(11,Math.floor(el/BIN));
    if(t-G.start>=GM){Guin.end();render();return}
    set('gr',mmss(GM-el));set('gel',mmss(el));set('gc',unit(cad(gReps(),el)));set('grst',mmss(gRest(t)));
    const bar=document.getElementById('gb');if(bar)bar.style.width=(el/GM*100)+'%';
    if(b>G.bin){G.bin=b;gSave();document.body.classList.add('flash');setTimeout(()=>document.body.classList.remove('flash'),1300);toast(`${b*5} minutes écoulées`);beep(1040,.25);render()}
  }
}
document.addEventListener('visibilitychange',()=>{T0=Date.now()-performance.now();if(document.visibilityState==='visible'&&((S&&S.phase!=='done')||(G&&!G.end)))wake()});
window.addEventListener('hashchange',render);

/* ===== DÉMARRAGE : reprise après rechargement, sans temps ni répétition inventés ===== */
sbT();
if(G&&!G.end&&now()-G.start>=GM)Guin.end();
if((S&&S.phase!=='done')||(G&&!G.end)){note='Séance restaurée après rechargement. Le temps réel écoulé est conservé, aucune répétition n’a été ajoutée.';wake()}
render();setInterval(tick,100);

/* ===== PWA : enregistrement + diagnostic visible + bouton d’installation ===== */
let dip=null;const pm=m=>set('sw',m),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(standalone)pm('Appli installée ✓');
else if(!window.isSecureContext||!('serviceWorker' in navigator))pm(location.protocol==='file:'?'Installation impossible : ouvre l’appli depuis une adresse HTTPS, pas depuis le fichier local.':'Installation impossible : l’adresse doit être en HTTPS.');
else{
  navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(()=>pm('Hors-ligne prêt ✓')).catch(e=>pm('Service worker non enregistré : '+e.message));
  if(/iphone|ipad/i.test(navigator.userAgent))pm('iPhone : Partager, puis « Sur l’écran d’accueil ».');
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dip=e;$('#ib').hidden=false});
window.addEventListener('appinstalled',()=>{dip=null;$('#ib').hidden=true;pm('Appli installée ✓')});
A.install=async()=>{if(!dip)return;dip.prompt();try{await dip.userChoice}catch(e){}dip=null;$('#ib').hidden=true};
