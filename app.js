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
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c]));
const cl=(v,a,b,d)=>{v=parseInt(v,10);return isNaN(v)?d:Math.min(b,Math.max(a,v))};
const mmss=ms=>{const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const cad=(r,ms)=>r>0&&ms>0?(r/(ms/60000)).toFixed(1):'—';
const unit=v=>v==='—'?v:v+' /min';
const fdate=t=>new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' •');
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const set=(id,v)=>{const e=document.getElementById(id);if(e&&e.textContent!==String(v))e.textContent=v};
const md=h=>{const e=$('#md');e.innerHTML=h;e.style.display=h?'grid':'none'};
const toast=m=>{const e=$('#ts');e.textContent=m;e.style.opacity=1;clearTimeout(e._t);e._t=setTimeout(()=>e.style.opacity=0,3000)};
let P=Store.get(K.p,{snd:true,voice:true,voiceMode:'performance',voiceVol:90,voiceRate:'normal',voiceIntensity:'normal',voiceAnn:{time:true,rest:true,countdown:true,motivate:true,results:true},vibrate:true,detailBins:false}),AC=null,wl=null;
const sbT=()=>{$('#sb').textContent=P.snd?'♪ Son activé':'✕ Son coupé'};
function beep(f=880,d=.12){if(!P.snd)return;try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=.07;o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+d)}catch(e){}}
async function wake(){try{if('wakeLock' in navigator&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>wl=null)}}catch(e){wl=null}}
const unwake=()=>{try{wl&&wl.release()}catch(e){}wl=null};

/* ===== VOICE COACH MODULE (indépendant) ===== */
const VoiceCoach = (() => {
  const queue = [];
  let speaking = false;
  let selectedVoice = null;
  let lastMilestone = -1;
  let restCountdownActive = false;
  let lastSpoken = '';
  let lastSpokenAt = 0;
  let currentUtterance = null;

  const phrases = {
    startSession: (sets, reps) => `Séance The Scofield. ${sets} séries de ${reps}. ${sets * reps} pompes. Prépare-toi.`,
    startSet: (n, reps) => `Série ${n}. ${reps} répétitions. Go.`,
    setDone: (n) => `Série ${n} terminée. Repos.`,
    restAnnounce: (sec) => sec > 0 ? `Repos. ${sec} secondes.` : 'Repos.',
    restWarning: (sec) => `Reprise dans ${sec} secondes.`,
    go: 'GO !',
    guinnessStart: 'Départ. Mode Guinness. Soixante minutes.',
    minutes: (m) => `${m} minutes écoulées.`,
    last5: 'Dernières 5 minutes.',
    lastMinute: 'Dernière minute.',
    guinnessEnd: 'Une heure. Terminé. Performance enregistrée.',
    sessionEnd: (reps, min) => `Séance terminée. ${reps} pompes. ${min} minutes.`,
    test: 'The Scofield. Coach vocal activé.',
    mid: 'Mi-parcours. Reste concentré.',
    fifteenLeft: 'Quinze minutes. Continue.'
  };

  function pickVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    const fr = voices.filter(v => /fr[-_]?FR|français|French/i.test(v.lang + ' ' + v.name));
    const maleKeywords = /male|homme|thomas|nicolas|paul|arthur|claude|daniel|google français|microsoft hortense|microsoft paul|microsoft claude/i;
    const femaleKeywords = /female|femme|marie|julie|cécile|amélie|hortense|google français female/i;
    let preferred = fr.find(v => maleKeywords.test(v.name) && !femaleKeywords.test(v.name));
    if (!preferred) preferred = fr.find(v => !femaleKeywords.test(v.name));
    if (!preferred) preferred = fr[0] || voices.find(v => /fr/i.test(v.lang));
    if (!preferred) preferred = voices[0];
    return preferred;
  }

  function getRate() {
    const map = { lent: 0.85, normal: 1.0, rapide: 1.15 };
    return map[P.voiceRate] || 1.0;
  }

  function getPitch() {
    return P.voiceIntensity === 'calme' ? 0.95 : P.voiceIntensity === 'énergique' ? 1.05 : 1.0;
  }

  function getVolume() {
    return Math.max(0, Math.min(1, (P.voiceVol || 90) / 100));
  }

  function canSpeak() {
    return P.voice && P.voiceMode !== 'silencieux' && window.speechSynthesis;
  }

  function speak(text, priority = 5) {
    if (!canSpeak() || !text) return;
    const nowTs = now();
    if (text === lastSpoken && nowTs - lastSpokenAt < 1800) return;
    queue.push({ text, priority, ts: nowTs });
    queue.sort((a, b) => a.priority - b.priority);
    processQueue();
  }

  function processQueue() {
    if (speaking || !queue.length || !canSpeak()) return;
    const item = queue.shift();
    speaking = true;
    lastSpoken = item.text;
    lastSpokenAt = now();
    showVoiceIndicator(item.text);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = 'fr-FR';
      u.rate = getRate();
      u.pitch = getPitch();
      u.volume = getVolume();
      if (selectedVoice) u.voice = selectedVoice;
      currentUtterance = u;
      u.onend = u.onerror = () => {
        speaking = false;
        currentUtterance = null;
        hideVoiceIndicator();
        setTimeout(processQueue, 80);
      };
      speechSynthesis.speak(u);
    } catch (e) {
      speaking = false;
      hideVoiceIndicator();
      if (P.snd) beep(660, 0.15);
      setTimeout(processQueue, 100);
    }
  }

  function stop() {
    queue.length = 0;
    speaking = false;
    restCountdownActive = false;
    try { speechSynthesis.cancel(); } catch (e) {}
    currentUtterance = null;
    hideVoiceIndicator();
  }

  function showVoiceIndicator(text) {
    let el = document.getElementById('voice-ind');
    if (!el) {
      el = document.createElement('div');
      el.id = 'voice-ind';
      el.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-40 card !py-1.5 !px-3 text-xs tracking-wide opacity-0 transition-opacity pointer-events-none flex items-center gap-2';
      el.innerHTML = '<span>🎙</span><span id="voice-ind-txt"></span>';
      document.body.appendChild(el);
    }
    const txt = document.getElementById('voice-ind-txt');
    if (txt) txt.textContent = text.length > 42 ? text.slice(0, 40) + '…' : text;
    el.style.opacity = '1';
  }

  function hideVoiceIndicator() {
    const el = document.getElementById('voice-ind');
    if (el) el.style.opacity = '0';
  }

  function init() {
    if (!window.speechSynthesis) return;
    selectedVoice = pickVoice();
    speechSynthesis.onvoiceschanged = () => { selectedVoice = pickVoice(); };
    speechSynthesis.getVoices();
  }

  function announce(text, priority = 5) {
    if (P.voiceMode === 'silencieux') return;
    speak(text, priority);
  }

  function go() {
    if (!P.voiceAnn?.countdown) return;
    speak(phrases.go, 1);
    if (P.vibrate && navigator.vibrate) try { navigator.vibrate([40, 30, 60]); } catch (e) {}
  }

  function updateRestCountdown(elapsedMs, targetMs) {
    if (!canSpeak() || !P.voiceAnn?.countdown || !P.voiceAnn?.rest) return;
    if (targetMs <= 0) return;
    const remaining = Math.ceil((targetMs - elapsedMs) / 1000);
    if (remaining > 10 || remaining < 0) {
      restCountdownActive = false;
      return;
    }
    if (remaining === 10 && !restCountdownActive) {
      restCountdownActive = true;
      announce(phrases.restWarning(10), 3);
      return;
    }
    if (remaining <= 5 && remaining >= 1) {
      if (lastSpoken !== String(remaining) || now() - lastSpokenAt > 900) {
        announce(String(remaining), 2);
        if (P.vibrate && navigator.vibrate) {
          try {
            if (remaining === 1) navigator.vibrate(80);
            else navigator.vibrate(30);
          } catch (e) {}
        }
      }
    }
    if (remaining <= 0 && restCountdownActive) {
      restCountdownActive = false;
      go();
    }
  }

  function onSessionStart(cfg) {
    if (!canSpeak()) return;
    lastMilestone = -1;
    if (P.voiceMode === 'silencieux') return;
    announce(phrases.startSession(cfg.sets, cfg.reps), 4);
  }

  function onSetStart(n, reps) {
    if (!canSpeak() || P.voiceMode === 'silencieux') return;
    if (n === 1) {
      announce(`Série 1. ${reps} répétitions. Go.`, 3);
    } else {
      announce(`Série ${n}.`, 4);
      setTimeout(() => go(), 600);
    }
  }

  function onSetComplete(n) {
    if (!canSpeak()) return;
    announce(phrases.setDone(n), 4);
  }

  function onRestStart(sec) {
    if (!canSpeak() || !P.voiceAnn?.rest) return;
    restCountdownActive = false;
    if (sec > 0) announce(phrases.restAnnounce(sec), 4);
    else announce('Repos.', 5);
  }

  function onGuinnessStart() {
    if (!canSpeak()) return;
    lastMilestone = -1;
    announce(phrases.guinnessStart, 3);
  }

  function onGuinnessMilestone(minutes, repsInBin) {
    if (!canSpeak() || !P.voiceAnn?.time) return;
    if (minutes === lastMilestone) return;
    lastMilestone = minutes;
    let msg = phrases.minutes(minutes);
    if (P.detailBins && repsInBin > 0) msg += ` ${repsInBin} pompes.`;
    if (P.voiceMode === 'performance' && P.voiceAnn?.motivate) {
      if (minutes === 30) msg = phrases.mid;
      else if (minutes === 45) msg = phrases.fifteenLeft;
      else if (minutes === 55) msg = phrases.last5;
    }
    if (minutes === 55) msg = phrases.last5;
    announce(msg, 4);
  }

  function onGuinnessEnd() {
    if (!canSpeak()) return;
    announce(phrases.guinnessEnd, 3);
  }

  function onSessionEnd(reps, durationMs) {
    if (!canSpeak() || !P.voiceAnn?.results) return;
    const min = Math.round(durationMs / 60000);
    announce(phrases.sessionEnd(reps, min), 4);
  }

  function test() {
    stop();
    const was = P.voice;
    P.voice = true;
    selectedVoice = pickVoice();
    announce(phrases.test, 1);
    setTimeout(() => { P.voice = was; }, 3000);
  }

  function status() {
    return {
      enabled: !!P.voice && P.voiceMode !== 'silencieux',
      mode: P.voiceMode,
      voiceName: selectedVoice ? selectedVoice.name : 'Système',
      speaking
    };
  }

  init();

  return {
    speak: announce,
    go,
    stop,
    onSessionStart,
    onSetStart,
    onSetComplete,
    onRestStart,
    updateRestCountdown,
    onGuinnessStart,
    onGuinnessMilestone,
    onGuinnessEnd,
    onSessionEnd,
    test,
    status,
    init
  };
})();

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
  start(c){
    const t=now();
    S={id:Math.round(t),name:c.name,start:t,cfg:c,
      sets:Array.from({length:c.sets},(_,i)=>({n:i+1,target:c.reps,reps:0,inv:0,note:'',work:0,rest:0,st:'todo'})),
      i:0,phase:'work',run:t,acc:0,pauseT:0,pAt:0,from:null,end:null,rb:false};
    save();wake();beep();
    VoiceCoach.onSessionStart(c);
    setTimeout(() => VoiceCoach.onSetStart(1, c.reps), 2800);
  },
  finish(){
    if(S.phase!=='work')return;
    const s=S.sets[S.i],t=now();
    s.work=curMs(S,t);s.st='pend';
    if(S.i===S.sets.length-1){
      S.phase='done';S.end=t;S.run=null;S.acc=0;arch();
      const x=stats(S);
      VoiceCoach.onSessionEnd(x.reps, x.tot);
    } else {
      S.phase='rest';S.run=t;S.acc=0;S.rb=false;
      VoiceCoach.onSetComplete(S.sets[S.i].n);
      VoiceCoach.onRestStart(S.cfg.rest);
    }
    save();beep();setModal(S.i);
  },
  next(){
    if(S.phase!=='rest')return;
    if(S.sets[S.i].st==='pend')return setModal(S.i);
    S.sets[S.i].rest=curMs(S);S.i++;S.phase='work';S.run=now();S.acc=0;save();beep(660);
    VoiceCoach.onSetStart(S.sets[S.i].n, S.cfg.reps);
  },
  pause(){if(S.phase!=='work'&&S.phase!=='rest')return;const t=now();S.acc=curMs(S,t);S.run=null;S.from=S.phase;S.phase='paused';S.pAt=t;save();VoiceCoach.stop()},
  resume(){if(S.phase!=='paused')return;const t=now();S.pauseT+=t-S.pAt;S.phase=S.from;S.run=t;save()},
  clear(){S=null;Store.del(K.s);unwake();VoiceCoach.stop()}
};

/* ===== MODE GUINNESS 60 MIN ===== */
const GM=3600000,BIN=300000;
const gEl=(t=now())=>G?Math.min(GM,(G.end||t)-G.start):0;
const gReps=()=>G.ev.reduce((a,e)=>a+e.n,0);
const gRest=(t=now())=>G.rest+(G.rAt?t-G.rAt:0);
const bins=g=>{const b=Array(12).fill(0);g.ev.forEach(e=>b[Math.min(11,Math.floor(e.t/BIN))]+=e.n);return b};
const gSave=()=>Store.set(K.g,G);
const Guin={
  start(){
    G={id:Math.round(now()),start:now(),ev:[],rest:0,rAt:null,end:null,bin:0};
    gSave();wake();beep();
    VoiceCoach.onGuinnessStart();
  },
  add(n){if(!G||G.end)return;G.ev.push({t:gEl(),n});gSave();beep(740,.05)},
  undo(){if(G&&!G.end){G.ev.pop();gSave()}},
  rest(){if(!G||G.end)return;const t=now();if(G.rAt){G.rest+=t-G.rAt;G.rAt=null}else G.rAt=t;gSave()},
  end(){
    if(!G||G.end)return;
    const t=now();
    if(G.rAt){G.rest+=t-G.rAt;G.rAt=null}
    G.end=Math.min(t,G.start+GM);
    const h=Store.get(K.gh,[]);h.push(G);Store.set(K.gh,h);gSave();unwake();beep(520,.3);
    VoiceCoach.onGuinnessEnd();
  },
  clear(){G=null;Store.del(K.g);VoiceCoach.stop()}
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
  <button class="btn p w-full" data-a="start" data-l="1">COMMENCER LA SÉANCE</button>
  <div class="mt-4 pt-3 border-t border-[#333]">
    <button class="btn w-full text-sm" data-a="openVoice">🎙 Coach vocal · Réglages</button>
  </div>
  </div>`;
}
function upd(){const s=cl($('#cs').value,1,50,10),r=cl($('#cr').value,1,500,30);set('obj',`${s} × ${r} = ${s*r} pompes`)}

function voiceSettingsPanel(){
  const st = VoiceCoach.status();
  const mode = P.voiceMode || 'performance';
  const ann = P.voiceAnn || {};
  return `<div class="card w-full max-w-md max-h-[90dvh] overflow-y-auto">
    <h3 class="f text-2xl mb-1">🎙 Coach Vocal</h3>
    <p class="lbl mb-4 text-xs">Voix : ${esc(st.voiceName)}</p>
    <div class="flex items-center justify-between mb-3">
      <span class="font-semibold">Activer le coach</span>
      <button class="btn !min-h-[36px] text-sm ${P.voice?'p':''}" data-a="toggleVoice">${P.voice?'ON':'OFF'}</button>
    </div>
    <label class="lbl">Mode</label>
    <div class="grid grid-cols-3 gap-2 mb-4">
      <button class="btn text-xs ${mode==='silencieux'?'p':''}" data-a="voiceMode" data-m="silencieux">Silencieux</button>
      <button class="btn text-xs ${mode==='minimal'?'p':''}" data-a="voiceMode" data-m="minimal">Minimal</button>
      <button class="btn text-xs ${mode==='performance'?'p':''}" data-a="voiceMode" data-m="performance">Performance</button>
    </div>
    <label class="lbl">Volume (${P.voiceVol||90}%)</label>
    <input type="range" id="vvol" min="0" max="100" value="${P.voiceVol||90}" class="w-full mb-3" oninput="A.setVol(this.value)">
    <label class="lbl">Vitesse</label>
    <div class="grid grid-cols-3 gap-2 mb-4">
      <button class="btn text-xs ${P.voiceRate==='lent'?'p':''}" data-a="voiceRate" data-r="lent">Lent</button>
      <button class="btn text-xs ${P.voiceRate==='normal'?'p':''}" data-a="voiceRate" data-r="normal">Normal</button>
      <button class="btn text-xs ${P.voiceRate==='rapide'?'p':''}" data-a="voiceRate" data-r="rapide">Rapide</button>
    </div>
    <label class="lbl">Intensité</label>
    <div class="grid grid-cols-3 gap-2 mb-4">
      <button class="btn text-xs ${P.voiceIntensity==='calme'?'p':''}" data-a="voiceInt" data-i="calme">Calme</button>
      <button class="btn text-xs ${P.voiceIntensity==='normal'?'p':''}" data-a="voiceInt" data-i="normal">Normal</button>
      <button class="btn text-xs ${P.voiceIntensity==='énergique'?'p':''}" data-a="voiceInt" data-i="énergique">Énergique</button>
    </div>
    <label class="lbl mb-2 block">Annonces</label>
    <div class="grid grid-cols-2 gap-2 text-sm mb-4">
      <label class="flex items-center gap-2"><input type="checkbox" ${ann.time?'checked':''} data-a="ann" data-k="time"> Temps</label>
      <label class="flex items-center gap-2"><input type="checkbox" ${ann.rest?'checked':''} data-a="ann" data-k="rest"> Repos</label>
      <label class="flex items-center gap-2"><input type="checkbox" ${ann.countdown?'checked':''} data-a="ann" data-k="countdown"> Compte à rebours</label>
      <label class="flex items-center gap-2"><input type="checkbox" ${ann.motivate?'checked':''} data-a="ann" data-k="motivate"> Motivation</label>
      <label class="flex items-center gap-2"><input type="checkbox" ${ann.results?'checked':''} data-a="ann" data-k="results"> Résultats</label>
      <label class="flex items-center gap-2"><input type="checkbox" ${P.detailBins?'checked':''} data-a="toggleDetail"> Détail 5 min</label>
    </div>
    <div class="flex items-center justify-between mb-4">
      <span>Vibration</span>
      <button class="btn !min-h-[36px] text-sm ${P.vibrate?'p':''}" data-a="toggleVib">${P.vibrate?'ON':'OFF'}</button>
    </div>
    <button class="btn p w-full mb-2" data-a="testVoice">TESTER LA VOIX</button>
    <button class="btn w-full" data-a="closeM">Fermer</button>
  </div>`;
}

function vTrain(){
  if(!S)return setup();
  const x=stats(S),d=S.phase==='done',cfg=S.cfg,tot=cfg.sets*cfg.reps,a=S.phase==='paused'?S.from:S.phase;
  const lab={work:'EN COURS',rest:'REPOS',paused:'EN PAUSE',done:'TERMINÉ'}[S.phase];
  const pr=[['work','finish','TERMINER LA SÉRIE'],['rest','next','REPRENDRE'],['paused','resume','REPRENDRE APRÈS PAUSE'],['done','reset','NOUVELLE SÉANCE']].find(z=>z[0]===S.phase);
  const sub=d?'Bilan ci-dessous':a==='work'?`${cfg.reps} pompes à effectuer`:cfg.rest?`Repos cible : ${mmss(cfg.rest*1000)}`:'Repos libre';
  const bar=`<div class="h-2 rounded bg-[#222] mt-2"><div class="h-2 rounded" style="background:var(--red);width:${Math.min(100,x.reps/tot*100)}%"></div></div>`;
  const voiceSt = VoiceCoach.status();
  const voiceBadge = `<button class="btn !min-h-[32px] text-xs ${voiceSt.enabled?'':'opacity-50'}" data-a="openVoice">🎙 ${voiceSt.enabled?(P.voiceMode==='performance'?'PERF':'MIN'):'OFF'}</button>`;
  return `<div class="grid lg:grid-cols-[1fr_340px] gap-4">
    <div>
      <div class="card text-center relative">
        <div class="flex justify-between items-center mb-1">
          <div class="lbl text-left">${lab} · Série ${S.i+1}/${cfg.sets}</div>
          ${voiceBadge}
        </div>
        <div class="f text-6xl sm:text-7xl md:text-8xl num leading-none my-2" id="tm">${mmss(curMs(S))}</div>
        <div class="lbl">${sub}</div>
        ${bar}
        <div class="grid grid-cols-3 gap-2 mt-4 text-center">
          <div><div class="lbl">Total</div><div class="f text-xl num" id="tt">${mmss(x.tot)}</div></div>
          <div><div class="lbl">Travail</div><div class="f text-xl num" id="tw">${mmss(x.w)}</div></div>
          <div><div class="lbl">Repos</div><div class="f text-xl num" id="tr">${mmss(x.r)}</div></div>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-3 text-center">
          <div><div class="lbl">Cadence globale</div><div class="f text-lg num" id="cg">${unit(x.cg)}</div></div>
          <div><div class="lbl">Cadence travail</div><div class="f text-lg num" id="cw">${unit(x.cw)}</div></div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 mt-3">
        ${pr?`<button class="btn p col-span-2" data-a="${pr[1]}" data-l="1">${pr[2]}</button>`:''}
        ${S.phase!=='done'?`<button class="btn" data-a="pause">Pause</button><button class="btn d" data-a="askCancel">Annuler</button>`:''}
      </div>
      ${d?`<div class="card mt-4"><h3 class="f text-2xl mb-3">Bilan</h3>${bilan(S)}</div>`:''}
    </div>
    <div class="card">${tbl(S,true)}</div>
  </div>`;
}

function vG(){
  if(!G)return`<div class="card max-w-xl mx-auto text-center"><h2 class="f text-3xl mb-2">Mode Guinness</h2><p class="lbl mb-4">60 minutes chronométrées. Enregistre chaque pompe. Les tranches de 5 minutes sont automatiques.</p>
  <button class="btn p w-full" data-a="gStart" data-l="1">DÉMARRER LA TENTATIVE</button>
  <div class="mt-4"><button class="btn w-full text-sm" data-a="openVoice">🎙 Coach vocal · Réglages</button></div></div>`;
  const el=gEl(),reps=gReps(),b=bins(G),done=!!G.end;
  const voiceBadge = `<button class="btn !min-h-[32px] text-xs" data-a="openVoice">🎙 ${VoiceCoach.status().enabled?'ON':'OFF'}</button>`;
  return`<div class="grid lg:grid-cols-[1fr_300px] gap-4">
  <div class="card text-center">
    <div class="flex justify-between items-center"><div class="lbl">${done?'TERMINÉ':'EN COURS'}</div>${voiceBadge}</div>
    <div class="f text-6xl sm:text-7xl num my-2" id="gr">${mmss(GM-el)}</div>
    <div class="lbl">Restant · <span id="gel">${mmss(el)}</span> écoulées</div>
    <div class="h-2 rounded bg-[#222] mt-3"><div id="gb" class="h-2 rounded" style="background:var(--red);width:${el/GM*100}%"></div></div>
    <div class="grid grid-cols-3 gap-2 mt-4">
      <div><div class="lbl">Pompes</div><div class="f text-3xl num">${reps}</div></div>
      <div><div class="lbl">Cadence</div><div class="f text-3xl num" id="gc">${unit(cad(reps,el))}</div></div>
      <div><div class="lbl">Repos</div><div class="f text-3xl num" id="grst">${mmss(gRest())}</div></div>
    </div>
    ${!done?`<div class="grid grid-cols-4 gap-2 mt-4">
      <button class="btn p col-span-2 text-2xl" data-a="gAdd" data-n="1" data-l="1">+1</button>
      <button class="btn" data-a="gAdd" data-n="5">+5</button>
      <button class="btn" data-a="gAdd" data-n="10">+10</button>
      <button class="btn" data-a="gUndo">↩</button>
      <button class="btn" data-a="gRest">${G.rAt?'Fin repos':'Repos'}</button>
      <button class="btn d col-span-2" data-a="askG">Terminer</button>
    </div>`:`<button class="btn p w-full mt-4" data-a="gReset">Nouvelle tentative</button>`}
  </div>
  <div class="card"><h3 class="f text-xl mb-2">Par tranche de 5 min</h3>
  ${b.map((n,i)=>`<div class="flex justify-between py-1 border-b border-[#222]"><span class="lbl">${i*5}–${(i+1)*5} min</span><span class="num f">${n||'—'}</span></div>`).join('')}
  </div></div>`;
}

function vHist(){
  const h=Store.get(K.h,[]).slice().reverse(),gh=Store.get(K.gh,[]).slice().reverse();
  return`<div class="grid lg:grid-cols-2 gap-4">
  <div class="card"><h2 class="f text-2xl mb-3">Séances</h2>
  ${h.length?h.map(s=>`<button class="w-full text-left card !p-3 mb-2 hover:border-[#555]" data-a="hOpen" data-id="${s.id}">
    <div class="f text-lg">${esc(s.name)}</div><div class="lbl text-xs">${fdate(s.start)} · ${stats(s).reps} pompes · ${mmss(stats(s).tot)}</div>
  </button>`).join(''):'<p class="lbl">Aucune séance enregistrée.</p>'}</div>
  <div class="card"><h2 class="f text-2xl mb-3">Guinness</h2>
  ${gh.length?gh.map(g=>`<div class="card !p-3 mb-2"><div class="f">${fdate(g.start)}</div><div class="lbl text-xs">${g.ev.reduce((a,e)=>a+e.n,0)} pompes · ${mmss((g.end||g.start)-g.start)}</div>
  <button class="btn d text-xs mt-2" data-a="askGH" data-id="${g.id}">Supprimer</button></div>`).join(''):'<p class="lbl">Aucune tentative.</p>'}</div>
  </div>`;
}

function setModal(i){
  mi=i;const s=S.sets[i];
  md(`<div class="card w-full max-w-sm"><h3 class="f text-2xl mb-3">Série ${s.n}</h3>
  ${stp('fr','Répétitions validées',s.reps||s.target)}${stp('fi','Invalides',s.inv||0)}
  <label class="lbl">Note</label><textarea id="fn" class="inp h-20 mb-3" maxlength="200">${esc(s.note)}</textarea>
  <div class="grid grid-cols-2 gap-2"><button class="btn" data-a="closeM">Annuler</button><button class="btn p" data-a="saveSet">Valider</button></div></div>`);
}
function ask(m,a,id){md(`<div class="card max-w-sm text-center"><p class="mb-4">${m}</p><div class="grid grid-cols-2 gap-2"><button class="btn" data-a="closeM">Non</button><button class="btn d" data-a="${a}"${id?` data-id="${id}"`:''}>Oui</button></div></div>`)}

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
  snd(){P.snd=!P.snd;Store.set(K.p,P);sbT()},
  openVoice(){md(voiceSettingsPanel())},
  toggleVoice(){P.voice=!P.voice;Store.set(K.p,P);md(voiceSettingsPanel())},
  voiceMode(d){P.voiceMode=d.m;if(d.m==='silencieux')VoiceCoach.stop();Store.set(K.p,P);md(voiceSettingsPanel())},
  voiceRate(d){P.voiceRate=d.r;Store.set(K.p,P);md(voiceSettingsPanel())},
  voiceInt(d){P.voiceIntensity=d.i;Store.set(K.p,P);md(voiceSettingsPanel())},
  setVol(v){P.voiceVol=+v;Store.set(K.p,P)},
  ann(d){const k=d.k;P.voiceAnn=P.voiceAnn||{};P.voiceAnn[k]=!P.voiceAnn[k];Store.set(K.p,P)},
  toggleDetail(){P.detailBins=!P.detailBins;Store.set(K.p,P);md(voiceSettingsPanel())},
  toggleVib(){P.vibrate=!P.vibrate;Store.set(K.p,P);md(voiceSettingsPanel())},
  testVoice(){VoiceCoach.test()}
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b||b.disabled||!A[b.dataset.a])return;
  if(b.dataset.l){if(busy)return;busy=true;setTimeout(()=>busy=false,350)}
  if(b.dataset.a==='ann'){
    const k=b.dataset.k;
    P.voiceAnn=P.voiceAnn||{};
    P.voiceAnn[k]=b.checked;
    Store.set(K.p,P);
    return;
  }
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
    if(S.phase==='rest' && S.cfg.rest>0){
      VoiceCoach.updateRestCountdown(c, S.cfg.rest*1000);
    }
  }
  if(G&&!G.end){
    const el=gEl(t),b=Math.min(11,Math.floor(el/BIN));
    if(t-G.start>=GM){Guin.end();render();return}
    set('gr',mmss(GM-el));set('gel',mmss(el));set('gc',unit(cad(gReps(),el)));set('grst',mmss(gRest(t)));
    const bar=document.getElementById('gb');if(bar)bar.style.width=(el/GM*100)+'%';
    if(b>G.bin){
      G.bin=b;gSave();
      document.body.classList.add('flash');setTimeout(()=>document.body.classList.remove('flash'),1300);
      toast(`${b*5} minutes écoulées`);beep(1040,.25);
      const binReps = bins(G)[b-1] || 0;
      VoiceCoach.onGuinnessMilestone(b*5, binReps);
      render();
    }
    const remaining = GM - el;
    if(remaining <= 60000 && remaining > 59000){
      VoiceCoach.speak('Dernière minute.', 3);
    }
    if(remaining <= 10000 && remaining > 9000){
      VoiceCoach.speak('10 secondes.', 2);
    }
    if(remaining <= 5000){
      VoiceCoach.updateRestCountdown(5000 - remaining, 5000);
    }
  }
}
document.addEventListener('visibilitychange',()=>{T0=Date.now()-performance.now();if(document.visibilityState==='visible'&&((S&&S.phase!=='done')||(G&&!G.end)))wake()});
window.addEventListener('hashchange',render);

/* ===== DÉMARRAGE ===== */
sbT();
VoiceCoach.init();
if(G&&!G.end&&now()-G.start>=GM)Guin.end();
if((S&&S.phase!=='done')||(G&&!G.end)){note='Séance restaurée après rechargement. Le temps réel écoulé est conservé, aucune répétition n’a été ajoutée.';wake()}
render();setInterval(tick,100);

/* ===== PWA ===== */
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
