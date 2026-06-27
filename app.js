
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const STORAGE_KEY = 'ingles_i_study_hub_v1';
const EMBEDDED_GEMINI_API_KEY = '';
function getGeminiApiKey(){ return (state.geminiApiKey && state.geminiApiKey.trim()) || EMBEDDED_GEMINI_API_KEY; }
const todayISO = () => new Date().toISOString().slice(0,10);

const defaultState = {
  view: 'home',
  activeModule: 1,
  activeSection: null,
  indexCollapsed: false,
  theme: 'light',
  rate: 0.88,
  tapSpeak: true,
  voiceMode: 'auto',
  ttsVoice: 'Kore',
  geminiTtsModel: 'gemini-3.1-flash-tts-preview',
  geminiApiKey: '',
  aiHistory: [],
  completed: {},
  quiz: { correct: 0, total: 0 },
  notes: {},
  srs: {},
  lastStudy: null,
  streak: 0
};
let state = loadState();
let currentQuiz = null;
let currentFlash = null;
let currentAudio = null;
const ttsMemoryCache = new Map();

function loadState(){
  try { return {...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}; }
  catch(e){ return {...defaultState}; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function formatRate(value){ return `${Number(value || 0.88).toFixed(2)}x`; }
function syncRateControls(){
  const rate = Number(state.rate || 0.88);
  const sidebarRange = $('#sidebarRateRange');
  const sidebarLabel = $('#sidebarRateLabel');
  if(sidebarRange) sidebarRange.value = rate;
  if(sidebarLabel) sidebarLabel.textContent = formatRate(rate);
  const settingsRange = $('#rateRange');
  const settingsLabel = $('#rateLabel');
  if(settingsRange) settingsRange.value = rate;
  if(settingsLabel) settingsLabel.textContent = formatRate(rate);
}
function maskKey(key){
  const clean = String(key || '').trim();
  if(!clean) return '';
  if(clean.length <= 10) return '••••••';
  return `${clean.slice(0,4)}••••••••${clean.slice(-4)}`;
}
function syncApiControls(){
  const key = state.geminiApiKey || '';
  const input = $('#sidebarGeminiKey');
  const status = $('#sidebarApiStatus');
  const clearBtn = $('#sidebarClearKeyBtn');
  if(input && document.activeElement !== input) input.value = key;
  if(status) status.textContent = key ? `IA activada: ${maskKey(key)}` : 'Sin clave activada.';
  if(clearBtn) clearBtn.disabled = !key;
}
function saveGeminiKey(key){
  state.geminiApiKey = String(key || '').trim();
  saveState();
  syncApiControls();
  toast(state.geminiApiKey ? 'Google IA activada en este navegador.' : 'Pegá una API key para activar Google IA.');
}
function clearGeminiKey(){
  state.geminiApiKey = '';
  saveState();
  syncApiControls();
  toast('Clave borrada de este navegador.');
}
function setAudioRate(value, options={}){
  state.rate = Number(value);
  if(!Number.isFinite(state.rate)) state.rate = 0.88;
  state.rate = Math.min(1.30, Math.max(0.55, state.rate));
  saveState();
  syncRateControls();
  if(currentAudio) currentAudio.playbackRate = state.rate;
  if(options.clearCache !== false) ttsMemoryCache.clear();
}
function bindSidebarControls(){
  const range = $('#sidebarRateRange');
  if(range) range.addEventListener('input', e => setAudioRate(e.target.value));
  const stopBtn = $('#stopAudioBtn');
  if(stopBtn) stopBtn.addEventListener('click', stopAudio);
  const apiInput = $('#sidebarGeminiKey');
  const saveKeyBtn = $('#sidebarSaveKeyBtn');
  const clearKeyBtn = $('#sidebarClearKeyBtn');
  if(apiInput){
    apiInput.addEventListener('keydown', e => {
      if(e.key === 'Enter') saveGeminiKey(apiInput.value);
    });
  }
  if(saveKeyBtn) saveKeyBtn.addEventListener('click', () => saveGeminiKey(apiInput ? apiInput.value : ''));
  if(clearKeyBtn) clearKeyBtn.addEventListener('click', clearGeminiKey);
  syncRateControls();
  syncApiControls();
}
function stopAudio(){
  if(currentAudio){ currentAudio.pause(); currentAudio.currentTime = 0; }
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  const old = document.querySelector('.spoken-chip');
  if(old) old.remove();
  toast('Audio detenido.');
}
function setTheme(theme){
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  saveState();
}
setTheme(state.theme || 'light');

const navItems = [
  ['home','🏠','Inicio'],
  ['modules','📚','Módulos'],
  ['practice','🧠','Practicar'],
  ['flashcards','🃏','Flashcards'],
  ['vocabulary','🔎','Vocabulario'],
  ['progress','📊','Progreso'],
  ['ai','🤖','Tutor IA'],
  ['settings','⚙️','Ajustes']
];
const mobileNavItems = navItems.filter(i => ['home','modules','practice','progress'].includes(i[0]));

function initNav(){
  const side = $('#sideNav');
  side.innerHTML = navItems.map(([id,emo,label]) => `<button data-view="${id}" aria-label="${label}"><span class="emoji">${emo}</span><span>${label}</span></button>`).join('');
  const bottom = $('#bottomNav');
  bottom.innerHTML = mobileNavItems.map(([id,emo,label]) => `<button data-view="${id}" aria-label="${label}"><span>${emo}</span><span>${label}</span></button>`).join('');
  [...side.querySelectorAll('button'), ...bottom.querySelectorAll('button')].forEach(btn=>{
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
  bindSidebarControls();
}
function markActiveNav(){
  $$('[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
}
function navigate(view, opts={}){
  state.view = view;
  if(opts.module) state.activeModule = opts.module;
  if(opts.section) state.activeSection = opts.section;
  saveState();
  render();
  window.scrollTo({top:0, behavior:'smooth'});
}
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._timer); toast._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function moduleById(id){ return window.MODULES.find(m => m.id === Number(id)); }
function completionForModule(m){
  const total = m.sections.length;
  const done = m.sections.filter(s => state.completed[`${m.id}:${s.id}`]).length;
  return {done,total,pct: total ? Math.round(done/total*100) : 0};
}
function allVocab(){ return MODULES.flatMap(m => m.vocab.map(v => ({...v, moduleId:m.id, moduleTitle:m.title, color:m.color}))); }
function studyTouch(){
  const today = todayISO();
  if(state.lastStudy !== today){
    const prev = state.lastStudy ? new Date(state.lastStudy) : null;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    state.streak = prev && prev.toISOString().slice(0,10) === yesterday.toISOString().slice(0,10) ? (state.streak || 0) + 1 : 1;
    state.lastStudy = today;
    saveState();
  }
}

function render(){
  markActiveNav();
  syncRateControls();
  syncApiControls();
  const app = $('#app');
  if(state.view === 'home') renderHome(app);
  if(state.view === 'modules') renderModules(app);
  if(state.view === 'module') renderModule(app, moduleById(state.activeModule));
  if(state.view === 'practice') renderPractice(app);
  if(state.view === 'flashcards') renderFlashcards(app);
  if(state.view === 'vocabulary') renderVocabulary(app);
  if(state.view === 'progress') renderProgress(app);
  if(state.view === 'ai') renderAITutor(app);
  if(state.view === 'settings') renderSettings(app);
}

function renderHome(app){
  const totalSections = MODULES.reduce((n,m)=> n+m.sections.length,0);
  const doneSections = MODULES.reduce((n,m)=> n+completionForModule(m).done,0);
  const due = dueCards().length;
  app.innerHTML = `
    <section class="hero">
      <span class="badge">Plataforma privada de repaso</span>
      <h1>Inglés I Study Hub</h1>
      <p>Estudiá los módulos con lectura guiada, pronunciación con voz IA opcional, flashcards, quizzes y progreso. Tocá cualquier palabra o frase en inglés para escucharla. Todo queda guardado en este navegador.</p>
      <div class="hero-actions">
        <button class="btn" data-action="continue">Continuar estudiando</button>
        <button class="btn secondary" data-view="practice">Hacer quiz rápido</button>
        <button class="btn secondary" data-view="flashcards">Repasar flashcards ${due ? `(${due})` : ''}</button>
        <button class="btn secondary" data-view="ai">Preguntar al Tutor IA</button>
      </div>
    </section>

    <section class="section grid cols-4">
      <div class="card kpi"><span>Progreso general</span><strong>${Math.round(doneSections/totalSections*100)||0}%</strong><div class="progress"><span style="width:${Math.round(doneSections/totalSections*100)||0}%"></span></div></div>
      <div class="card kpi"><span>Secciones completadas</span><strong>${doneSections}/${totalSections}</strong></div>
      <div class="card kpi"><span>Quizzes</span><strong>${state.quiz.correct}/${state.quiz.total}</strong></div>
      <div class="card kpi"><span>Racha</span><strong>${state.streak || 0} días</strong></div>
    </section>

    <section class="section">
      <h2>Módulos</h2>
      <div class="grid cols-3">${MODULES.map(moduleCard).join('')}</div>
    </section>
  `;
  bindCommon(app);
  $('[data-action="continue"]', app).addEventListener('click', () => navigate('module', {module: state.activeModule || 1}));
}

function moduleCard(m){
  const p = completionForModule(m);
  const preview = m.sections.slice(0, 4).map(s => `<li>${escapeHTML(shortTitle(s.title))}</li>`).join('');
  return `<article class="card module-card" data-module="${m.id}">
    <div class="module-card-topline"><span class="module-chip" style="background:${m.color}">${m.label}</span><span class="section-count">${m.sections.length} secciones</span></div>
    <h2>${m.title}</h2>
    <p>${m.spanishTitle}</p>
    <ul class="mini-outline">${preview}</ul>
    <div class="progress"><span style="width:${p.pct}%; background:${m.color}"></span></div>
    <div class="progress-label"><span>${p.done}/${p.total} secciones</span><strong>${p.pct}%</strong></div>
  </article>`;
}

function moduleRoadmapCard(m){
  const p = completionForModule(m);
  const firstIncomplete = m.sections.find(s => !state.completed[`${m.id}:${s.id}`]) || m.sections[0];
  const outline = m.sections.map((s, i) => {
    const done = state.completed[`${m.id}:${s.id}`];
    return `<li class="roadmap-section ${done ? 'done' : ''}"><span>${done ? '✓' : i + 1}</span>${escapeHTML(shortTitle(s.title))}</li>`;
  }).join('');
  const vocabPreview = m.vocab.slice(0, 6).map(v => `<span>${escapeHTML(v.term)}</span>`).join('');
  return `<article class="card module-roadmap-card" data-module="${m.id}">
    <div class="roadmap-main">
      <div class="roadmap-number" style="background:${m.color}">${m.id}</div>
      <div class="roadmap-copy">
        <span class="module-chip" style="background:${m.color}">${m.label}</span>
        <h2>${m.title} <small>/ ${m.spanishTitle}</small></h2>
        <p>${m.goals.slice(0, 3).map(escapeHTML).join(' · ')}</p>
        <div class="vocab-pills">${vocabPreview}</div>
      </div>
    </div>
    <div class="roadmap-outline">
      <div class="progress"><span style="width:${p.pct}%; background:${m.color}"></span></div>
      <div class="progress-label"><span>${p.done}/${p.total} secciones completadas</span><strong>${p.pct}%</strong></div>
      <h3>Índice del módulo</h3>
      <ol>${outline}</ol>
      <button class="btn" data-module="${m.id}">Abrir módulo tipo Word</button>
      <small>Próximo recomendado: ${escapeHTML(shortTitle(firstIncomplete.title))}</small>
    </div>
  </article>`;
}

function renderModules(app){
  app.innerHTML = `<section class="hero"><h1>Módulos de estudio</h1><p>Ahora están ordenados como un índice de Word: cada módulo muestra objetivos, vocabulario clave, progreso y las secciones en el orden real de lectura.</p></section>
  <section class="section module-roadmap">${MODULES.map(moduleRoadmapCard).join('')}</section>`;
  bindCommon(app);
}
function bindCommon(root){
  $$('[data-view]', root).forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  $$('[data-module]', root).forEach(card => card.addEventListener('click', () => navigate('module', {module: card.dataset.module})));
}

function renderModule(app, m){
  if(!m) return renderModules(app);
  const p = completionForModule(m);
  state.activeModule = m.id;
  saveState();
  app.innerHTML = `
    <section class="card module-header module-header-word">
      <div class="module-title">
        <span class="color-dot" style="background:${m.color}"></span>
        <div><span class="badge">${m.label}</span><h1>${m.title} <small>/ ${m.spanishTitle}</small></h1><p class="lead">Vista documento: leé el módulo completo en orden, como en el Word, con índice lateral y controles por sección.</p></div>
      </div>
      <div class="module-progress-box"><div class="progress"><span style="width:${p.pct}%; background:${m.color}"></span></div><div class="progress-label"><span>Progreso</span><strong>${p.pct}%</strong></div></div>
    </section>

    <section class="section module-study-layout ${state.indexCollapsed ? 'index-collapsed' : ''}">
      <aside class="module-index card ${state.indexCollapsed ? 'collapsed' : 'expanded'}" aria-label="Índice del módulo">
        <div class="index-tabs-rail" aria-label="Accesos rápidos del módulo">
          <button class="index-vertical-tab" data-action="toggle-index" aria-expanded="${!state.indexCollapsed}" title="Mostrar u ocultar índice"><span>Índice</span></button>
          ${moduleQuickJumpTabs(m)}
        </div>
        <div class="module-index-panel">
          <h2>Índice</h2>
          <p>Seguí este orden, igual que una guía de estudio.</p>
          <nav>${m.sections.map((s, i)=>`<a href="#section-${m.id}-${s.id}" class="${state.completed[`${m.id}:${s.id}`] ? 'done' : ''}"><span class="index-number">${String(i + 1).padStart(2, '0')}</span><span class="index-title">${escapeHTML(shortTitle(s.title))}</span></a>`).join('')}</nav>
          <div class="toolbar vertical">
            <button class="btn secondary" data-action="speak-selected">🔊 Leer texto seleccionado</button>
            <button class="btn secondary" data-action="vocab-module">Vocabulario</button>
            <button class="btn secondary" data-action="quiz-module">Quiz</button>
            <button class="btn secondary" data-view="ai">Tutor IA</button>
          </div>
        </div>
      </aside>

      <div class="module-document">
        <section class="card module-objectives">
          <h2>Objetivos del módulo</h2>
          <div class="objectives-list">${m.goals.map(g=>`<div class="objective-item">✓ ${escapeHTML(g)}</div>`).join('')}</div>
        </section>
        ${m.sections.map((s, i)=>moduleDocumentSection(m, s, i)).join('')}
      </div>
    </section>

    <section class="section grid cols-2">
      <div class="card">
        <h2>Notas personales</h2>
        <textarea class="note-area" id="notes" placeholder="Escribí tus notas de este módulo...">${escapeHTML(state.notes[m.id] || '')}</textarea>
      </div>
      <div class="card">
        <h2>Próximo paso</h2>
        <p>Cuando termines el documento, practicá vocabulario y después hacé un quiz del módulo.</p>
        <div class="toolbar"><button class="btn" data-action="quiz-module">Practicar este módulo</button><button class="btn secondary" data-action="vocab-module">Ver vocabulario</button><button class="btn secondary" data-view="ai">Tutor IA</button></div>
      </div>
    </section>`;

  $$('[data-action="speak-section"]', app).forEach(btn => btn.addEventListener('click', () => speak(btn.dataset.speakText || '')));
  $$('[data-complete-section]', app).forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.completeSection;
    state.completed[key] = !state.completed[key];
    studyTouch(); saveState(); render();
  }));
  $$('[data-index-section]', app).forEach(btn => btn.addEventListener('click', ()=> { state.activeSection = btn.dataset.indexSection; saveState(); }));
  $$('[data-action="toggle-index"]', app).forEach(btn => btn.addEventListener('click', ()=> {
    state.indexCollapsed = !state.indexCollapsed;
    saveState();
    render();
  }));
  $$('[data-jump-section]', app).forEach(btn => btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.jumpSection);
    if(target){
      target.scrollIntoView({behavior: 'smooth', block: 'start'});
      state.activeSection = btn.dataset.jumpSection;
      saveState();
    } else {
      toast('No encontré esa sección en este módulo.');
    }
  }));
  $$('[data-action="speak-selected"]', app).forEach(btn => btn.addEventListener('click', ()=> {
    const selected = String(window.getSelection()).trim();
    if(selected) speak(selected); else toast('Seleccioná una palabra o frase primero.');
  }));
  $('#notes', app).addEventListener('input', e => { state.notes[m.id]=e.target.value; saveState(); });
  $$('[data-action="quiz-module"]', app).forEach(btn => btn.addEventListener('click', ()=> { state.practiceModule=m.id; navigate('practice'); }));
  $$('[data-action="vocab-module"]', app).forEach(btn => btn.addEventListener('click', ()=> { state.vocabModule=m.id; navigate('vocabulary'); }));
  bindCommon(app);
}

function moduleQuickJumpTabs(m){
  const shortcuts = [
    {kind:'key', label:'KEY EXPRESSIONS / FRASES CLAVE DEL LIBRO', short:'Key Expressions', match: /KEY EXPRESSIONS|FRASES CLAVE/i},
    {kind:'audio', label:'LECTURA DEL LIBRO Y FRASES DEL AUDIO SCRIPT', short:'Lectura + Audio', match: /LECTURA DEL LIBRO|AUDIO SCRIPT/i},
    {kind:'story', label:'ANEXO FINAL: HISTORIA PARA LEER', short:'Historia', match: /HISTORIA PARA LEER|ANEXO FINAL/i}
  ];
  return shortcuts.map(item => {
    const section = m.sections.find(s => item.match.test(s.title) || item.match.test(String(s.html || '')));
    if(!section) return '';
    const targetId = `section-${m.id}-${section.id}`;
    return `<button class="quick-vertical-tab quick-${item.kind}" data-jump-section="${escapeAttr(targetId)}" type="button" title="Ir a ${escapeAttr(item.label)}" aria-label="Ir a ${escapeAttr(item.label)}"><span class="quick-tab-full">${escapeHTML(item.label)}</span><span class="quick-tab-short">${escapeHTML(item.short)}</span></button>`;
  }).join('');
}

function moduleDocumentSection(m, s, i){
  const key = `${m.id}:${s.id}`;
  const done = !!state.completed[key];
  return `<article id="section-${m.id}-${s.id}" class="card content-card doc-section ${done ? 'completed' : ''}">
    <header class="doc-section-header">
      <div>
        <span class="doc-section-number" style="background:${m.color}">${done ? '✓' : i + 1}</span>
        <h2>${escapeHTML(s.title)}</h2>
      </div>
      <div class="section-actions">
        <button class="btn secondary" data-action="speak-section" data-speak-text="${escapeAttr(`${m.title}. ${s.title}`)}">🔊 Título</button>
        <button class="btn ${done ? 'success' : 'secondary'}" data-complete-section="${escapeAttr(key)}">${done ? '✓ Completada' : 'Marcar'}</button>
      </div>
    </header>
    <div class="doc-section-body">${s.html}</div>
  </article>`;
}
function shortTitle(t){ return t.replace(/^\d+\.\s*/, '').slice(0,52); }

function renderVocabulary(app){
  const mid = state.vocabModule || 'all';
  app.innerHTML = `<section class="hero"><h1>Vocabulario por módulos</h1><p>Vista más limpia: el vocabulario está separado por módulo y en forma de lista. Tocá una palabra o el ejemplo para escucharlo con audio IA.</p>
  <div class="searchbar"><input id="vocabSearch" placeholder="Buscar: invoice, architect, There is..." aria-label="Buscar vocabulario"><select id="vocabModule"><option value="all">Todos los módulos</option>${MODULES.map(m=>`<option value="${m.id}" ${String(mid)===String(m.id)?'selected':''}>${m.label} - ${m.title}</option>`).join('')}</select></div></section>
  <section class="section"><div id="vocabResults" class="vocab-list-view"></div></section>`;
  const search = $('#vocabSearch', app);
  const modSel = $('#vocabModule', app);
  const draw = () => {
    state.vocabModule = modSel.value; saveState();
    const q = search.value.toLowerCase().trim();
    let modulesToShow = modSel.value === 'all' ? MODULES : MODULES.filter(m => String(m.id) === modSel.value);
    const groups = modulesToShow.map(m => {
      let items = m.vocab.map(v => ({...v, moduleId:m.id, moduleTitle:m.title, spanishTitle:m.spanishTitle, color:m.color}));
      if(q) items = items.filter(v => `${v.term} ${v.translation} ${v.example}`.toLowerCase().includes(q));
      return {module:m, items};
    }).filter(g => g.items.length);
    $('#vocabResults', app).innerHTML = groups.map(vocabModuleGroup).join('') || '<div class="card">No encontré resultados.</div>';
    bindVocabButtons(app);
  };
  search.addEventListener('input', draw); modSel.addEventListener('change', draw); draw();
}
function vocabModuleGroup(group){
  const m = group.module;
  return `<article class="card vocab-module-panel">
    <header class="vocab-module-head"><div><span class="module-chip" style="background:${m.color}">${m.label}</span><h2>${escapeHTML(m.title)} <small>/ ${escapeHTML(m.spanishTitle)}</small></h2></div><span>${group.items.length} palabras/frases</span></header>
    <div class="vocab-rows">${group.items.map(vocabRow).join('')}</div>
  </article>`;
}
function vocabRow(v){
  return `<div class="vocab-row">
    <button class="icon-btn vocab-sound" data-speak="${escapeAttr(v.term)}" aria-label="Escuchar ${escapeAttr(v.term)}">🔊</button>
    <div class="vocab-main">
      <strong class="vocab-term" data-speak="${escapeAttr(v.term)}">${escapeHTML(v.term)}</strong>
      <span class="translation">${escapeHTML(v.translation)}</span>
      <p class="example"><span data-speak="${escapeAttr(v.example)}">${escapeHTML(v.example)}</span></p>
    </div>
    <button class="btn secondary compact-btn" data-add-card="${escapeAttr(v.id)}">Flashcard</button>
  </div>`;
}
function bindVocabButtons(root){
  $$('[data-speak]', root).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); speak(b.dataset.speak); }));
  $$('[data-add-card]', root).forEach(b => b.addEventListener('click', () => { addOrBoostCard(b.dataset.addCard); }));
}
function addOrBoostCard(id){
  state.srs[id] = state.srs[id] || {level:0, due: todayISO(), seen:0, correct:0};
  state.srs[id].due = todayISO(); saveState(); toast('Flashcard agregada para repasar.');
}

function questionPool(moduleId){
  const modules = moduleId && moduleId !== 'all' ? [moduleById(moduleId)] : MODULES;
  let pool = modules.flatMap(m => m.quiz.map(q => ({...q, moduleId:m.id, color:m.color})));
  const voc = modules.flatMap(m => m.vocab.slice(0, 12).map(v => ({...v, moduleId:m.id, color:m.color})));
  voc.forEach(v => {
    const opts = shuffle([v.translation, ...sample(allVocab().filter(x => x.translation !== v.translation), 3).map(x => x.translation)]);
    pool.push({type:'mc', q:`¿Qué significa “${v.term}”?`, options: opts, answer: v.translation, speak:v.term, moduleId:v.moduleId, color:v.color});
  });
  return shuffle(pool);
}
function renderPractice(app){
  const mid = state.practiceModule || 'all';
  const title = mid==='all' ? 'Quiz general' : `Quiz del Módulo ${mid}`;
  app.innerHTML = `<section class="hero"><h1>${title}</h1><p>Respondé, recibí feedback inmediato y repetí los errores.</p>
    <div class="toolbar"><select id="practiceModule"><option value="all">Todos</option>${MODULES.map(m=>`<option value="${m.id}" ${String(mid)===String(m.id)?'selected':''}>${m.label} - ${m.title}</option>`).join('')}</select><button class="btn" data-action="new-question">Nueva pregunta</button></div></section>
    <section class="section"><div id="quizArea"></div></section>`;
  $('#practiceModule', app).addEventListener('change', e => { state.practiceModule=e.target.value; saveState(); newQuestion(); });
  $('[data-action="new-question"]', app).addEventListener('click', newQuestion);
  newQuestion();
}
function newQuestion(){
  const app = $('#app');
  const mid = state.practiceModule || 'all';
  const pool = questionPool(mid);
  currentQuiz = pool[0];
  const area = $('#quizArea', app);
  const badge = currentQuiz.moduleId ? `<span class="module-chip" style="background:${currentQuiz.color}">M${currentQuiz.moduleId}</span>` : '';
  if(currentQuiz.type === 'mc'){
    area.innerHTML = `<article class="card quiz-card">${badge}<h2>${escapeHTML(currentQuiz.q)}</h2>${currentQuiz.speak ? `<button class="btn secondary" data-speak="${escapeAttr(currentQuiz.speak)}">🔊 Escuchar</button>`:''}<div class="quiz-options">${currentQuiz.options.map(o=>`<button data-option="${escapeAttr(o)}">${escapeHTML(o)}</button>`).join('')}</div><div id="feedback" class="feedback"></div></article>`;
    $$('[data-option]', area).forEach(b => b.addEventListener('click', () => answerMC(b)));
  } else {
    area.innerHTML = `<article class="card quiz-card">${badge}<h2>${escapeHTML(currentQuiz.q)}</h2><div class="input-row"><input id="fillAnswer" placeholder="Escribí tu respuesta"><button class="btn" data-action="check-fill">Comprobar</button></div><div id="feedback" class="feedback"></div></article>`;
    $('[data-action="check-fill"]', area).addEventListener('click', answerFill);
    $('#fillAnswer', area).addEventListener('keydown', e => { if(e.key==='Enter') answerFill(); });
  }
  bindVocabButtons(area);
}
function answerMC(btn){
  const selected = btn.dataset.option;
  const ok = selected === currentQuiz.answer;
  $$('#quizArea [data-option]').forEach(b => {
    b.disabled = true;
    if(b.dataset.option === currentQuiz.answer) b.classList.add('correct');
    if(b === btn && !ok) b.classList.add('wrong');
  });
  state.quiz.total += 1; if(ok) state.quiz.correct += 1; studyTouch(); saveState();
  const f = $('#feedback'); f.textContent = ok ? 'Correcto ✅' : `Casi. La respuesta correcta es: ${currentQuiz.answer}`; f.className = 'feedback ' + (ok?'ok':'no');
}
function answerFill(){
  const input = $('#fillAnswer');
  const val = normalize(input.value);
  const ans = normalize(currentQuiz.answer);
  const ok = val === ans;
  state.quiz.total += 1; if(ok) state.quiz.correct += 1; studyTouch(); saveState();
  const f = $('#feedback'); f.textContent = ok ? 'Correcto ✅' : `Revisá: la respuesta esperada es “${currentQuiz.answer}”.`; f.className = 'feedback ' + (ok?'ok':'no');
}

function dueCards(){
  const today = todayISO();
  const vocab = allVocab();
  return vocab.filter(v => !state.srs[v.id] || state.srs[v.id].due <= today);
}
function renderFlashcards(app){
  app.innerHTML = `<section class="hero"><h1>Flashcards con repetición espaciada</h1><p>La app prioriza las palabras nuevas o vencidas. Marcá cómo te fue para programar el próximo repaso.</p></section><section class="section" id="flashArea"></section>`;
  drawFlashcard();
}
function drawFlashcard(showBack=false){
  const area = $('#flashArea');
  const cards = dueCards();
  if(!cards.length){ area.innerHTML = `<div class="card"><h2>No tenés tarjetas vencidas 🎉</h2><p>Podés volver a vocabulario y agregar más palabras, o repasar todo igual.</p><button class="btn" data-action="review-anyway">Repasar igual</button></div>`; $('[data-action="review-anyway"]', area).addEventListener('click', ()=>{ currentFlash = shuffle(allVocab())[0]; drawFlashcard(false); }); return; }
  currentFlash = currentFlash || shuffle(cards)[0];
  const front = currentFlash.term;
  const back = `${currentFlash.translation}\n${currentFlash.example}`;
  area.innerHTML = `<article class="card flashcard"><div><span class="badge">Módulo ${currentFlash.moduleId}</span><br><strong>${escapeHTML(showBack?currentFlash.translation:front)}</strong>${showBack ? `<span class="small">${escapeHTML(currentFlash.example)}</span>` : '<span class="small">Tocá “Mostrar respuesta”</span>'}</div></article>
  <div class="flash-actions"><button class="btn secondary" data-speak="${escapeAttr(currentFlash.term)}">🔊 Escuchar</button>${!showBack ? `<button class="btn" data-action="show-back">Mostrar respuesta</button>` : `<button class="btn danger" data-rate="again">Otra vez</button><button class="btn secondary" data-rate="good">Bien</button><button class="btn success" data-rate="easy">Fácil</button>`}</div>`;
  bindVocabButtons(area);
  const show = $('[data-action="show-back"]', area); if(show) show.addEventListener('click', ()=> drawFlashcard(true));
  $$('[data-rate]', area).forEach(b => b.addEventListener('click', ()=> rateCard(b.dataset.rate)));
}
function rateCard(rating){
  const id = currentFlash.id;
  const rec = state.srs[id] || {level:0, due: todayISO(), seen:0, correct:0};
  rec.seen += 1;
  let days = 1;
  if(rating === 'again'){ rec.level = Math.max(0, rec.level-1); days = 0; }
  if(rating === 'good'){ rec.level += 1; rec.correct += 1; days = [1,2,4,7,14,30][Math.min(rec.level,5)]; }
  if(rating === 'easy'){ rec.level += 2; rec.correct += 1; days = [2,4,7,14,30,60][Math.min(rec.level,5)]; }
  const d = new Date(); d.setDate(d.getDate()+days); rec.due = d.toISOString().slice(0,10);
  state.srs[id] = rec; currentFlash = null; studyTouch(); saveState(); drawFlashcard(false);
}

function renderProgress(app){
  const vocabCount = allVocab().length;
  const srsSeen = Object.keys(state.srs).length;
  app.innerHTML = `<section class="hero"><h1>Progreso</h1><p>Tu avance queda guardado en este dispositivo. Para sincronizar entre equipos, en una versión futura se puede conectar Firebase o Supabase.</p></section>
  <section class="section grid cols-4">
    <div class="card kpi"><span>Racha</span><strong>${state.streak||0}</strong></div>
    <div class="card kpi"><span>Quiz accuracy</span><strong>${state.quiz.total ? Math.round(state.quiz.correct/state.quiz.total*100):0}%</strong></div>
    <div class="card kpi"><span>Flashcards vistas</span><strong>${srsSeen}/${vocabCount}</strong></div>
    <div class="card kpi"><span>Tarjetas para hoy</span><strong>${dueCards().length}</strong></div>
  </section>
  <section class="section grid cols-2">${MODULES.map(m=>{const p=completionForModule(m); return `<div class="card"><span class="module-chip" style="background:${m.color}">${m.label}</span><h2>${m.title}</h2><div class="progress"><span style="width:${p.pct}%; background:${m.color}"></span></div><div class="progress-label"><span>${p.done}/${p.total} secciones</span><strong>${p.pct}%</strong></div></div>`}).join('')}</section>`;
}
function renderSettings(app){
  const hasKey = !!getGeminiApiKey();
  const mode = state.voiceMode || 'auto';
  const voice = state.ttsVoice || 'Kore';
  app.innerHTML = `<section class="hero"><h1>Ajustes</h1><p>Personalizá lectura, audio, apariencia y conexión opcional con Google AI Studio.</p></section>
  <section class="section grid cols-2">
    <div class="card"><h2>Apariencia</h2><div class="toolbar"><button class="btn ${state.theme==='light'?'':'secondary'}" data-theme="light">Claro</button><button class="btn ${state.theme==='dark'?'':'secondary'}" data-theme="dark">Oscuro</button></div></div>
    <div class="card"><h2>Audio inteligente</h2>
      <p class="muted">La mejor opción es <strong>Automático</strong>: usa Gemini IA si tenés la clave guardada y, si falla o no hay internet, vuelve a la voz del navegador.</p>
      <label>Motor de voz</label>
      <select id="voiceMode">
        <option value="auto" ${mode==='auto'?'selected':''}>Automático: Gemini IA + respaldo navegador</option>
        <option value="gemini" ${mode==='gemini'?'selected':''}>Solo Gemini IA</option>
        <option value="browser" ${mode==='browser'?'selected':''}>Solo voz del navegador</option>
      </select>
      <label>Voz Gemini</label>
      <select id="ttsVoice">
        ${['Kore','Puck','Charon','Fenrir','Aoede','Leda','Orus','Zephyr'].map(v=>`<option value="${v}" ${voice===v?'selected':''}>${v}</option>`).join('')}
      </select>
      <label>Velocidad de lectura IA / navegador: <strong id="rateLabel">${formatRate(state.rate)}</strong></label>
      <input type="range" min="0.55" max="1.30" step="0.05" value="${state.rate}" id="rateRange">
      <label class="checkline"><input type="checkbox" id="tapSpeakToggle" ${state.tapSpeak !== false ? 'checked' : ''}> Tocar palabras/frases en inglés para escuchar</label>
      <div class="toolbar"><button class="btn secondary" data-speak="Where are you from?">Probar frase</button><button class="btn secondary" data-speak="architect">Probar palabra</button><button class="btn secondary" data-action="clear-audio-cache">Limpiar caché de audio</button></div>
      <p class="small-status">Estado de voz: ${hasKey ? 'Gemini disponible si el motor está en Automático o Solo Gemini' : 'sin API key; se usará la voz del navegador'}</p>
    </div>
    <div class="card"><h2>Google AI Studio</h2><p class="muted">Por seguridad, la clave no va dentro del código cuando se sube a GitHub. Podés pegarla aquí o en la tarjeta lateral “Google IA”. Se guarda solo en este navegador.</p><label>API key para activar Google IA</label><div class="input-row"><input id="geminiKey" type="password" value="${escapeAttr(state.geminiApiKey || '')}" placeholder="Pegar API key de Google AI Studio"><button class="btn" data-action="save-key">Activar IA</button></div><div class="toolbar"><button class="btn secondary" data-view="ai">Abrir Tutor IA</button><button class="btn secondary" data-action="clear-key">Borrar clave local</button></div><p class="small-status">Estado: ${hasKey ? 'clave guardada en este navegador' : 'sin clave guardada'}</p></div>
    <div class="card"><h2>Datos</h2><p>Esto borra progreso, notas, flashcards y clave guardada en este navegador.</p><button class="btn danger" data-action="reset">Borrar progreso local</button></div>
    <div class="card"><h2>Instalar como app</h2><p>En Chrome/Edge/Android podés usar “Agregar a pantalla de inicio” o “Instalar app” desde el navegador.</p></div>
  </section>`;
  $$('[data-theme]', app).forEach(b => b.addEventListener('click', ()=> { setTheme(b.dataset.theme); render(); }));
  $('#rateRange', app).addEventListener('input', e => setAudioRate(e.target.value));
  $('#voiceMode', app).addEventListener('change', e => { state.voiceMode = e.target.value; saveState(); toast('Motor de voz actualizado.'); render(); });
  $('#ttsVoice', app).addEventListener('change', e => { state.ttsVoice = e.target.value; ttsMemoryCache.clear(); saveState(); toast('Voz Gemini actualizada.'); });
  $('#tapSpeakToggle', app).addEventListener('change', e => { state.tapSpeak = e.target.checked; saveState(); toast(state.tapSpeak ? 'Audio al tocar activado.' : 'Audio al tocar desactivado.'); });
  $('[data-action="clear-audio-cache"]', app).addEventListener('click', ()=> { ttsMemoryCache.clear(); toast('Caché de audio limpiada.'); });
  $('[data-action="save-key"]', app).addEventListener('click', ()=> { saveGeminiKey($('#geminiKey', app).value); render(); });
  $('[data-action="clear-key"]', app).addEventListener('click', ()=> { clearGeminiKey(); render(); });
  $('[data-action="reset"]', app).addEventListener('click', ()=> { if(confirm('¿Borrar todo el progreso local?')){ localStorage.removeItem(STORAGE_KEY); state = {...defaultState}; setTheme('light'); render(); } });
  bindVocabButtons(app);
  bindCommon(app);
}

function renderAITutor(app){
  const hasKey = !!getGeminiApiKey();
  const mid = state.aiModule || state.activeModule || 1;
  app.innerHTML = `<section class="hero"><h1>Tutor IA de Inglés I</h1><p>Hacé preguntas sobre los módulos, pedí ejemplos, ejercicios nuevos o correcciones. La respuesta se limita al nivel de Inglés I.</p></section>
  <section class="section ai-layout">
    <article class="card ai-card">
      <div class="toolbar"><select id="aiModule">${MODULES.map(m=>`<option value="${m.id}" ${String(mid)===String(m.id)?'selected':''}>${m.label} - ${m.title}</option>`).join('')}</select><button class="btn secondary" data-action="ask-template">Sugerir práctica</button></div>
      ${!hasKey ? `<div class="warning-box"><strong>Falta configurar la API key.</strong><p>Andá a Ajustes → Google AI Studio y pegá una clave.</p><button class="btn" data-view="settings">Ir a ajustes</button></div>` : ''}
      <textarea id="aiPrompt" class="ai-prompt" placeholder="Ejemplo: Explicame Present Simple con 10 ejercicios y respuestas."></textarea>
      <div class="toolbar"><button class="btn" data-action="ask-ai" ${hasKey ? '' : 'disabled'}>Preguntar</button><button class="btn secondary" data-action="clear-ai">Limpiar</button></div>
    </article>
    <article class="card ai-response-card"><h2>Respuesta</h2><div id="aiStatus" class="small-status">${hasKey ? 'Listo para preguntar.' : 'Configurá la clave para usar el tutor.'}</div><div id="aiResponse" class="ai-response"></div></article>
  </section>`;
  $('#aiModule', app).addEventListener('change', e => { state.aiModule=e.target.value; saveState(); });
  const prompt = $('#aiPrompt', app);
  $('[data-action="ask-template"]', app).addEventListener('click', ()=> { const m = moduleById($('#aiModule', app).value); prompt.value = `Armame 10 ejercicios nuevos del módulo ${m.id} (${m.title}) con respuestas al final. Quiero practicar vocabulario, gramática y frases útiles.`; prompt.focus(); });
  $('[data-action="ask-ai"]', app).addEventListener('click', askAITutor);
  $('[data-action="clear-ai"]', app).addEventListener('click', ()=> { prompt.value=''; $('#aiResponse', app).innerHTML=''; $('#aiStatus', app).textContent='Listo.'; });
  bindCommon(app);
}

async function askAITutor(){
  const promptEl = $('#aiPrompt');
  const raw = promptEl.value.trim();
  if(!raw){ toast('Escribí una pregunta primero.'); return; }
  if(!getGeminiApiKey()){ toast('Configurá la API key en Ajustes.'); return; }
  const m = moduleById($('#aiModule').value);
  const status = $('#aiStatus');
  const out = $('#aiResponse');
  status.textContent = 'Pensando...';
  out.innerHTML = '<div class="loader"></div>';
  try{
    const response = await callGemini(buildLearningPrompt(raw, m));
    out.innerHTML = formatAIResponse(response);
    status.textContent = 'Respuesta generada.';
  }catch(err){
    console.error(err);
    status.textContent = 'No pude conectar con Gemini.';
    out.innerHTML = `<p class="error-text">Revisá la clave, la conexión o los permisos de la API. Detalle: ${escapeHTML(err.message || String(err))}</p>`;
  }
}

function buildLearningPrompt(userPrompt, m){
  const vocab = m.vocab.slice(0, 30).map(v => `${v.term} = ${v.translation}; ejemplo: ${v.example}`).join('\n');
  const sections = m.sections.map(s => `- ${s.title}`).join('\n');
  return `Actúa como tutor de Inglés I para un estudiante hispanohablante adulto que está reaprendiendo desde cero.\n\nMódulo actual: ${m.label} - ${m.title} / ${m.spanishTitle}.\nObjetivos: ${m.goals.join('; ')}.\nSecciones del módulo:\n${sections}\n\nVocabulario base:\n${vocab}\n\nInstrucciones de estilo:\n- Explicá en español claro.\n- Usá ejemplos en inglés con traducción.\n- Nivel A1/A1.1.\n- No inventes contenido fuera del nivel.\n- Cuando propongas ejercicios, incluí respuestas al final.\n- Evitá respuestas demasiado largas si el estudiante pide algo puntual.\n\nPregunta del estudiante:\n${userPrompt}`;
}

async function callGemini(input){
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': getGeminiApiKey()
    },
    body: JSON.stringify({
      model: 'gemini-3.5-flash',
      input,
      generation_config: { temperature: 0.35, thinking_level: 'low' }
    })
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    const msg = data?.error?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data.output_text || extractTextFromGemini(data) || 'No se recibió texto.';
}

function extractTextFromGemini(data){
  if(typeof data === 'string') return data;
  if(data?.output_text) return data.output_text;
  const texts = [];
  const walk = obj => {
    if(!obj || typeof obj !== 'object') return;
    if(typeof obj.text === 'string') texts.push(obj.text);
    Object.values(obj).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v));
  };
  walk(data);
  return texts.join('\n').trim();
}

function formatAIResponse(text){
  return escapeHTML(text)
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

function handleTapToSpeak(event){
  if(state.tapSpeak === false) return;
  if(!event.isTrusted) return;
  const interactive = event.target.closest('button, a, input, textarea, select, label, [contenteditable="true"]');
  if(interactive) return;
  const area = event.target.closest('.doc-section-body, .vocab-card, .vocab-list-view, .vocab-row, .quiz-card, .flashcard, .hero, .module-header-word');
  if(!area) return;
  const text = getTextAtPoint(event) || getElementSpeakText(event.target);
  const clean = cleanSpeakText(text);
  if(!clean) return;
  if(!isLikelyEnglish(clean)) return;
  speak(clean);
  flashSpokenText(clean);
}

function getTextAtPoint(event){
  let range = null;
  if(document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);
  else if(document.caretPositionFromPoint){
    const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
    if(pos){ range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
  }
  if(!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return '';
  const full = range.startContainer.textContent || '';
  const idx = Math.max(0, Math.min(range.startOffset, full.length));
  const sentence = sentenceAround(full, idx);
  const word = wordAround(full, idx);
  const chosen = sentence && sentence.split(/\s+/).filter(Boolean).length >= 3 ? sentence : word;
  return chosen || sentence || word;
}

function getElementSpeakText(target){
  const el = target.closest('td, th, p, li, strong, h1, h2, h3, h4, span');
  if(!el) return '';
  return el.innerText || el.textContent || '';
}

function sentenceAround(text, idx){
  const normalized = String(text).replace(/\s+/g, ' ');
  const offset = Math.min(idx, normalized.length);
  const left = Math.max(normalized.lastIndexOf('.', offset-1), normalized.lastIndexOf('?', offset-1), normalized.lastIndexOf('!', offset-1), normalized.lastIndexOf(';', offset-1));
  let rightCandidates = ['.','?','!',';'].map(ch => normalized.indexOf(ch, offset)).filter(n => n >= 0);
  const right = rightCandidates.length ? Math.min(...rightCandidates) : normalized.length;
  return normalized.slice(left + 1, right + (right < normalized.length ? 1 : 0)).trim();
}

function wordAround(text, idx){
  const re = /[A-Za-z][A-Za-z'’-]*/g;
  let m;
  while((m = re.exec(text))){
    if(idx >= m.index && idx <= m.index + m[0].length) return m[0];
  }
  return '';
}

function cleanSpeakText(text){
  let t = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\d\s•·\-–—:;,.()\[\]]+/, '')
    .replace(/[\s•·\-–—:;,.()\[\]]+$/, '')
    .trim();
  if(!t || t.length > 360) return '';
  if(/^\d+$/.test(t)) return '';
  return t;
}

function isLikelyEnglish(text){
  const t = cleanSpeakText(text);
  if(!t) return false;
  if(/[¿¡áéíóúñÁÉÍÓÚÑ]/.test(t)) return false;
  const words = (t.match(/[A-Za-z][A-Za-z'’-]*/g) || []).map(w => w.toLowerCase().replace(/[’']/g,"'"));
  if(!words.length) return false;
  const spanishStops = new Set(['hola','soy','desde','de','del','la','el','los','las','una','uno','con','para','por','trabajo','empresa','pregunta','respuesta','correcto','incorrecto','modulo','vocabulario','gramatica','ejercicio','respuestas','pais','paises','nacionalidad','frase','oracion','espanol','ingles','gerente','asistente','contador','tecnico']);
  if(words.length === 1 && spanishStops.has(words[0])) return false;
  const englishCue = new Set(['i','am','is','are','was','were','be','do','does','did','don\'t','doesn\'t','didn\'t','can','could','would','will','you','your','he','she','it','we','they','my','his','her','our','their','this','that','these','those','the','a','an','from','for','with','in','on','at','to','of','and','or','but','not','no','yes','hello','hi','goodbye','bye','please','sorry','thanks','thank','nice','meet','meeting','name','job','company','work','works','produce','produces','provide','provides','sell','sells','buy','buys','export','exports','import','imports','employ','employs','develop','develops','where','what','when','why','who','how','which','there','some','any','message','call','phone','email','invoice','receipt','order','form','delivery','document','password','screen','button','laptop','printer','photocopier','office','hotel','conference','restaurant','manager','architect','designer','administrator','receptionist','technician','assistant','director','engineer']);
  const vocabWords = getEnglishWordSet();
  let hits = 0;
  for(const w of words){ if(englishCue.has(w) || vocabWords.has(w)) hits++; }
  if(words.length === 1) return hits > 0 || /^[A-Z][a-z]+$/.test(t);
  if(/\b(I\'m|She\'s|He\'s|They\'re|We\'re|isn\'t|aren\'t|don\'t|doesn\'t|didn\'t)\b/i.test(t)) return true;
  if(/[?]$/.test(t) && words.some(w => ['what','where','when','why','who','how','do','does','did','is','are','can','could','would'].includes(w))) return true;
  return hits / words.length >= 0.38;
}

function getEnglishWordSet(){
  if(getEnglishWordSet.cache) return getEnglishWordSet.cache;
  const set = new Set();
  const add = txt => (String(txt).match(/[A-Za-z][A-Za-z'’-]*/g) || []).forEach(w => set.add(w.toLowerCase().replace(/[’']/g,"'")));
  try{
    allVocab().forEach(v => { add(v.term); add(v.example); });
    MODULES.forEach(m => { add(m.title); m.goals.forEach(add); m.quiz.forEach(q => { add(q.q); add(q.answer); (q.options||[]).forEach(add); }); });
  }catch(e){}
  getEnglishWordSet.cache = set;
  return set;
}

function flashSpokenText(text){
  const old = document.querySelector('.spoken-chip');
  if(old) old.remove();
  const chip = document.createElement('div');
  chip.className = 'spoken-chip';
  chip.textContent = `🔊 ${text}`;
  document.body.appendChild(chip);
  setTimeout(()=>chip.classList.add('show'), 10);
  setTimeout(()=>{ chip.classList.remove('show'); setTimeout(()=>chip.remove(), 220); }, 1400);
}

async function speak(text){
  const clean = cleanSpeakText(text);
  if(!clean) return;
  const mode = state.voiceMode || 'auto';
  const canUseGemini = !!getGeminiApiKey() && mode !== 'browser';
  if(canUseGemini){
    try{
      await speakWithGemini(clean);
      return;
    }catch(err){
      console.warn('Gemini TTS fallback:', err);
      if(mode === 'gemini'){
        toast('Gemini IA no pudo generar audio. Revisá API key, internet o permisos.');
        return;
      }
      toast('Gemini IA falló; uso voz del navegador.');
    }
  }
  speakWithBrowser(clean);
}

async function speakWithGemini(text){
  const cacheKey = `${state.geminiTtsModel || 'gemini-3.1-flash-tts-preview'}|${state.ttsVoice || 'Kore'}|${state.rate || 0.88}|${text}`;
  if(ttsMemoryCache.has(cacheKey)){
    await playAudioUrl(ttsMemoryCache.get(cacheKey));
    return;
  }
  showSpeakingState(text, 'Generando voz IA...');
  const input = buildTtsPrompt(text);
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': getGeminiApiKey()
    },
    body: JSON.stringify({
      model: state.geminiTtsModel || 'gemini-3.1-flash-tts-preview',
      input,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: state.ttsVoice || 'Kore' }] }
    })
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    const msg = data?.error?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  const audio = extractGeminiAudio(data);
  if(!audio || !audio.base64) throw new Error('La respuesta no incluyó audio.');
  const bytes = base64ToUint8Array(audio.base64);
  const mime = audio.mime || '';
  const sampleRate = audio.sampleRate || parseSampleRate(mime) || 24000;
  const blob = mime.includes('wav') || mime.includes('mpeg') || mime.includes('mp3') || mime.includes('ogg')
    ? new Blob([bytes], {type: mime || 'audio/wav'})
    : new Blob([pcm16ToWav(bytes, sampleRate, 1)], {type: 'audio/wav'});
  const url = URL.createObjectURL(blob);
  ttsMemoryCache.set(cacheKey, url);
  await playAudioUrl(url);
}

function buildTtsPrompt(text){
  const words = (text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
  const rate = Number(state.rate || 0.88);
  const pace = rate < 0.70 ? 'very slowly and clearly' : rate < 0.90 ? 'slowly and clearly' : rate < 1.08 ? 'at a natural clear pace' : 'a little faster but still clearly';
  const safeText = text.replace(/\s+/g, ' ').trim();
  if(words <= 2){
    return `Say ${pace} in American English, like a patient English teacher. Pronounce exactly this word or short phrase and do not add anything else: "${safeText}"`;
  }
  return `Read ${pace} in American English, like a patient English teacher for beginners. Say exactly this sentence and do not add anything else: "${safeText}"`;
}

function extractGeminiAudio(data){
  if(data?.output_audio?.data) return {base64: data.output_audio.data, mime: data.output_audio.mime_type || data.output_audio.mimeType || '', sampleRate: data.output_audio.sample_rate || data.output_audio.sampleRate};
  const found = [];
  const walk = obj => {
    if(!obj || typeof obj !== 'object') return;
    if(typeof obj.data === 'string'){
      const typ = String(obj.type || obj.mime_type || obj.mimeType || '').toLowerCase();
      if(typ.includes('audio') || obj.sample_rate || obj.sampleRate || obj.audio) found.push(obj);
    }
    Object.values(obj).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v));
  };
  walk(data);
  const item = found[0];
  if(!item) return null;
  return {base64: item.data, mime: item.mime_type || item.mimeType || item.type || '', sampleRate: item.sample_rate || item.sampleRate};
}

function parseSampleRate(mime){
  const m = String(mime || '').match(/rate=(\d+)/i);
  return m ? Number(m[1]) : null;
}

function base64ToUint8Array(base64){
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcm16ToWav(pcmBytes, sampleRate=24000, channels=1){
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcmBytes);
  return buffer;
}

function writeAscii(view, offset, str){
  for(let i=0; i<str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function playAudioUrl(url){
  return new Promise((resolve, reject)=>{
    try{
      if(currentAudio){ currentAudio.pause(); currentAudio.currentTime = 0; }
      if('speechSynthesis' in window) window.speechSynthesis.cancel();
      const audio = new Audio(url);
      audio.playbackRate = Number(state.rate || 0.88);
      currentAudio = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('No se pudo reproducir el audio generado.'));
      audio.play().catch(reject);
    }catch(err){ reject(err); }
  });
}

function speakWithBrowser(text){
  if(!('speechSynthesis' in window)){ toast('Tu navegador no soporta audio de navegador.'); return; }
  if(currentAudio){ currentAudio.pause(); currentAudio.currentTime = 0; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = state.rate || 0.88; u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => /Google US English|Microsoft .*English.*United States|Samantha|Alex/i.test(v.name) && /^en/i.test(v.lang));
  const voice = preferred || voices.find(v => /en-US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
  if(voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

function showSpeakingState(text, label='Generando audio...'){
  const old = document.querySelector('.spoken-chip');
  if(old) old.remove();
  const chip = document.createElement('div');
  chip.className = 'spoken-chip show';
  chip.textContent = `✨ ${label} ${text}`;
  document.body.appendChild(chip);
  setTimeout(()=>{ if(chip.isConnected){ chip.classList.remove('show'); setTimeout(()=>chip.remove(), 220); } }, 2400);
}
function normalize(s){ return String(s).trim().toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' '); }
function escapeHTML(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHTML(s).replace(/'/g,'&#39;'); }
function shuffle(a){ return [...a].sort(()=>Math.random()-.5); }
function sample(a,n){ return shuffle(a).slice(0,n); }

document.addEventListener('click', handleTapToSpeak, true);
if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
initNav(); render();
