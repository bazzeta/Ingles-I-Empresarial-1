
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
  streak: 0,
  modulesNavOpen: true
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
  ['verbs','📘','Verbos'],
  ['progress','📊','Progreso'],
  ['ai','🤖','Tutor IA'],
  ['settings','⚙️','Ajustes']
];
const mobileNavItems = navItems.filter(i => ['home','modules','practice','progress'].includes(i[0]));

const MODULE_DIALOGUES = {
  1: [
    {
      title: 'Dialogue 1 — Saying hello and introducing yourself',
      context: 'Para practicar saludos, presentaciones y despedidas.',
      lines: [
        ['A', 'Hello. My name is Luis.', 'Hola. Mi nombre es Luis.'],
        ['B', 'Nice to meet you, Luis. I’m Ana.', 'Encantada de conocerte, Luis. Soy Ana.'],
        ['A', 'Nice to meet you too. This is my colleague, Damaris.', 'Encantado de conocerte también. Esta es mi colega, Damaris.'],
        ['B', 'Pleased to meet you, Damaris.', 'Mucho gusto, Damaris.'],
        ['C', 'Pleased to meet you too.', 'Mucho gusto también.'],
        ['A', 'See you soon. Goodbye.', 'Nos vemos pronto. Adiós.']
      ]
    },
    {
      title: 'Dialogue 2 — Spelling a name',
      context: 'Para practicar cómo deletrear nombres y datos personales.',
      lines: [
        ['A', 'What’s your name?', '¿Cuál es tu nombre?'],
        ['B', 'My name is Damaris.', 'Mi nombre es Damaris.'],
        ['A', 'How do you spell that?', '¿Cómo se deletrea eso?'],
        ['B', 'D-A-M-A-R-I-S.', 'D-A-M-A-R-I-S.'],
        ['A', 'Thank you. And what’s your job?', 'Gracias. ¿Y cuál es tu trabajo?'],
        ['B', 'I’m an architect and interior designer.', 'Soy arquitecta y diseñadora de interiores.']
      ]
    }
  ],
  2: [
    {
      title: 'Dialogue 1 — Booking by phone',
      context: 'Para practicar pedidos y reservas por teléfono.',
      lines: [
        ['A', 'Good morning. Can I book a private room, please?', 'Buenos días. ¿Puedo reservar una sala privada, por favor?'],
        ['B', 'Yes, of course. Can you give me your name, please?', 'Sí, por supuesto. ¿Puede darme su nombre, por favor?'],
        ['A', 'My name is Luis Bazzeta.', 'Mi nombre es Luis Bazzeta.'],
        ['B', 'Can you spell your surname?', '¿Puede deletrear su apellido?'],
        ['A', 'B-A-Z-Z-E-T-A.', 'B-A-Z-Z-E-T-A.'],
        ['B', 'Thank you. Can I confirm your booking by email?', 'Gracias. ¿Puedo confirmar su reserva por email?']
      ]
    },
    {
      title: 'Dialogue 2 — Ordering products',
      context: 'Para practicar órdenes, repetición y confirmación.',
      lines: [
        ['A', 'Hello. I want to order some mobile phones.', 'Hola. Quiero ordenar algunos teléfonos móviles.'],
        ['B', 'Certainly. Can you tell me the product code?', 'Por supuesto. ¿Puede decirme el código del producto?'],
        ['A', 'DFK 1678.', 'DFK 1678.'],
        ['B', 'Can you repeat that, please?', '¿Puede repetir eso, por favor?'],
        ['A', 'DFK 1678.', 'DFK 1678.'],
        ['B', 'Thank you. We can deliver them next week.', 'Gracias. Podemos entregarlos la próxima semana.']
      ]
    }
  ],
  3: [
    {
      title: 'Dialogue 1 — Starting and ending a telephone call',
      context: 'Para practicar cómo iniciar y cerrar una llamada laboral.',
      lines: [
        ['A', 'Hello, the Dubai Grand Hotel. Can I help you?', 'Hola, Dubai Grand Hotel. ¿En qué puedo ayudarle?'],
        ['B', 'Hello. This is Luis Bazzeta.', 'Hola. Habla Luis Bazzeta.'],
        ['A', 'How can I help you?', '¿Cómo puedo ayudarle?'],
        ['B', 'I’m calling about meeting rooms for next week.', 'Estoy llamando por salas de reunión para la próxima semana.'],
        ['A', 'Certainly. We have conference rooms available.', 'Por supuesto. Tenemos salas de conferencia disponibles.'],
        ['B', 'Thank you for your help. Goodbye.', 'Gracias por su ayuda. Adiós.']
      ]
    },
    {
      title: 'Dialogue 2 — Leaving a message',
      context: 'Para practicar mensajes telefónicos y confirmar datos.',
      lines: [
        ['A', 'Could I speak to Teresa Baum, please?', '¿Podría hablar con Teresa Baum, por favor?'],
        ['B', 'I’m sorry, but she isn’t here this morning. Can I take a message?', 'Lo siento, pero ella no está aquí esta mañana. ¿Puedo tomar un mensaje?'],
        ['A', 'Yes. Could I leave a message for her?', 'Sí. ¿Podría dejarle un mensaje?'],
        ['B', 'Of course. Can I have a contact number?', 'Por supuesto. ¿Me puede dar un número de contacto?'],
        ['A', 'Yes. My number is 702 555 0184.', 'Sí. Mi número es 702 555 0184.'],
        ['B', 'So that’s 702 555 0184. Is that right?', 'Entonces es 702 555 0184. ¿Es correcto?']
      ]
    }
  ],
  4: [
    {
      title: 'Dialogue 1 — Asking for help',
      context: 'Para practicar pedir ayuda con tecnología.',
      lines: [
        ['A', 'Can you help me?', '¿Puedes ayudarme?'],
        ['B', 'Yes, of course. What’s the problem?', 'Sí, por supuesto. ¿Cuál es el problema?'],
        ['A', 'I’m trying to log on to the company website.', 'Estoy intentando iniciar sesión en el sitio web de la empresa.'],
        ['B', 'Do you have your username and password?', '¿Tienes tu nombre de usuario y contraseña?'],
        ['A', 'Yes, but I don’t know how to enter the password.', 'Sí, pero no sé cómo ingresar la contraseña.'],
        ['B', 'No problem. I can give you a hand.', 'No hay problema. Puedo darte una mano.']
      ]
    },
    {
      title: 'Dialogue 2 — Offering help',
      context: 'Para practicar ofrecer ayuda y responder.',
      lines: [
        ['A', 'Do you want a hand?', '¿Quieres una mano?'],
        ['B', 'Yes, please. That would be good.', 'Sí, por favor. Eso estaría bien.'],
        ['A', 'What are you trying to do?', '¿Qué estás intentando hacer?'],
        ['B', 'I’m trying to print this document.', 'Estoy intentando imprimir este documento.'],
        ['A', 'First, click on the printer icon. Then, push the button.', 'Primero, haz clic en el ícono de la impresora. Luego, presiona el botón.'],
        ['B', 'Great. Thanks for your help.', 'Genial. Gracias por tu ayuda.']
      ]
    }
  ],
  5: [
    {
      title: 'Dialogue 1 — Apologizing',
      context: 'Para practicar disculpas y razones en pasado.',
      lines: [
        ['A', 'I’m sorry I was late for the meeting.', 'Lo siento, llegué tarde a la reunión.'],
        ['B', 'What happened?', '¿Qué pasó?'],
        ['A', 'There were problems with the traffic this morning.', 'Hubo problemas con el tráfico esta mañana.'],
        ['B', 'Don’t worry. The meeting started late too.', 'No te preocupes. La reunión también empezó tarde.'],
        ['A', 'Thank you. I’ll arrive earlier next time.', 'Gracias. Llegaré más temprano la próxima vez.']
      ]
    },
    {
      title: 'Dialogue 2 — Solving problems',
      context: 'Para practicar explicar problemas, prometer acción y agradecer.',
      lines: [
        ['A', 'We’ve got a problem with the order.', 'Tenemos un problema con el pedido.'],
        ['B', 'What’s the problem exactly?', '¿Cuál es exactamente el problema?'],
        ['A', 'The delivery was late, and some products didn’t arrive.', 'La entrega llegó tarde y algunos productos no llegaron.'],
        ['B', 'I’m sorry. I’ll speak to the warehouse today.', 'Lo siento. Hablaré con el almacén hoy.'],
        ['A', 'Can you let me know as soon as you can?', '¿Puedes avisarme tan pronto como puedas?'],
        ['B', 'Yes, no problem. I’ll call you this afternoon.', 'Sí, no hay problema. Te llamaré esta tarde.']
      ]
    }
  ]
};



function courseOf(m){ return m.course || (m.id <= 5 ? 'Inglés I' : 'Inglés II'); }
function displayModuleNumber(m){ return m.moduleNo || m.id; }
function groupedModules(){
  const groups = [];
  MODULES.forEach(m => {
    const course = courseOf(m);
    let g = groups.find(x => x.course === course);
    if(!g){ g = {course, modules:[]}; groups.push(g); }
    g.modules.push(m);
  });
  return groups;
}

function initNav(){
  const side = $('#sideNav');
  side.innerHTML = navItems.map(([id,emo,label]) => {
    if(id !== 'modules') return `<button data-view="${id}" aria-label="${label}"><span class="emoji">${emo}</span><span>${label}</span></button>`;
    return `<div class="nav-group ${state.modulesNavOpen ? 'open' : ''}" id="modulesNavGroup">
      <button data-view="modules" data-toggle-submenu="modules" aria-label="${label}" aria-expanded="${state.modulesNavOpen ? 'true' : 'false'}">
        <span class="emoji">${emo}</span><span>${label}</span><span class="submenu-arrow">▾</span>
      </button>
      <div class="nav-submenu" id="modulesSubmenu">
        <button class="submenu-item all-modules" data-view="modules">Ver todos los módulos</button>
        ${groupedModules().map(g => `<div class="submenu-label">${escapeHTML(g.course)}</div>${g.modules.map(m => `<button class="submenu-item" data-open-module="${m.id}">Módulo ${displayModuleNumber(m)} - ${escapeHTML(m.title)}</button>`).join('')}`).join('')}
        <div class="submenu-label">Diálogos del libro</div>
        ${groupedModules().map(g => `<div class="submenu-label">${escapeHTML(g.course)}</div>${g.modules.map(m => `<button class="submenu-item dialogue-subitem" data-dialogue-module="${m.id}">Diálogos Módulo ${displayModuleNumber(m)}</button>`).join('')}`).join('')}
      </div>
    </div>`;
  }).join('');
  const bottom = $('#bottomNav');
  bottom.innerHTML = mobileNavItems.map(([id,emo,label]) => `<button data-view="${id}" aria-label="${label}"><span>${emo}</span><span>${label}</span></button>`).join('');
  side.querySelectorAll('button[data-view]:not([data-toggle-submenu])').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
  const modulesToggle = side.querySelector('[data-toggle-submenu="modules"]');
  if(modulesToggle){
    modulesToggle.addEventListener('click', () => {
      state.modulesNavOpen = !state.modulesNavOpen;
      saveState();
      render();
      if(state.view !== 'modules' && state.view !== 'module') navigate('modules');
    });
  }
  side.querySelectorAll('[data-open-module]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate('module', {module: btn.dataset.openModule});
    });
  });
  side.querySelectorAll('[data-dialogue-module]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.modulesNavOpen = true;
      navigate('dialogues', {module: btn.dataset.dialogueModule});
    });
  });
  [...bottom.querySelectorAll('button')].forEach(btn=>{
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
  bindSidebarControls();
}
function markActiveNav(){
  $$('[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
  const modulesActive = state.view === 'modules' || state.view === 'module' || state.view === 'dialogues';
  const mainModulesBtn = $('#modulesNavGroup > button[data-view="modules"]');
  if(mainModulesBtn) mainModulesBtn.classList.toggle('active', modulesActive);
  const bottomModulesBtn = $('.bottom-nav [data-view="modules"]');
  if(bottomModulesBtn) bottomModulesBtn.classList.toggle('active', modulesActive);
  $$('.submenu-item[data-open-module]').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.openModule) === Number(state.activeModule) && state.view === 'module'));
  $$('.submenu-item[data-dialogue-module]').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.dialogueModule) === Number(state.activeModule) && state.view === 'dialogues'));
  const allModulesBtn = $('.submenu-item.all-modules');
  if(allModulesBtn) allModulesBtn.classList.toggle('active', state.view === 'modules');
}
function navigate(view, opts={}){
  state.view = view;
  if(opts.module) state.activeModule = opts.module;
  if(opts.section) state.activeSection = opts.section;
  if(view === 'modules' || view === 'module') state.modulesNavOpen = true;
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
  if(state.view === 'dialogues') renderDialogues(app, moduleById(state.activeModule));
  if(state.view === 'practice') renderPractice(app);
  if(state.view === 'flashcards') renderFlashcards(app);
  if(state.view === 'vocabulary') renderVocabulary(app);
  if(state.view === 'verbs') renderVerbs(app);
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
      <div class="roadmap-number" style="background:${m.color}">${displayModuleNumber(m)}</div>
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
  const openModule = Number(state.openRoadmapModule || MODULES[0].id);
  app.innerHTML = `<section class="hero"><h1>Módulos de estudio</h1><p>Inglés I e Inglés II quedan separados para no mezclar contenidos. Inglés I trabaja Units 1-5; Inglés II trabaja Units 6-10 del mismo libro.</p></section>
  <section class="section card course-map"><h2>Inglés I vs Inglés II</h2><div class="table-wrap"><table><tr><th>Curso</th><th>Unidades del libro</th><th>Enfoque</th></tr><tr><td>Inglés I</td><td>Units 1-5</td><td>Jobs, Products & Services, Location, Technology, Communication.</td></tr><tr><td>Inglés II</td><td>Units 6-10</td><td>Contacts, Departments, Employment, Competition, Teamwork.</td></tr></table></div></section>
  ${groupedModules().map(g => `<section class="section module-accordion"><h2 class="course-title">${escapeHTML(g.course)}</h2>${g.modules.map(m => moduleAccordionItem(m, openModule === m.id)).join('')}</section>`).join('')}`;
  $$('[data-open-module]', app).forEach(btn => btn.addEventListener('click', () => {
    const mid = Number(btn.dataset.openModule);
    state.openRoadmapModule = state.openRoadmapModule === mid ? 0 : mid;
    saveState();
    render();
  }));
  bindCommon(app);
}

function moduleAccordionItem(m, isOpen){
  const p = completionForModule(m);
  const firstIncomplete = m.sections.find(s => !state.completed[`${m.id}:${s.id}`]) || m.sections[0];
  const outline = m.sections.map((s, i) => {
    const done = state.completed[`${m.id}:${s.id}`];
    return `<li class="roadmap-section ${done ? 'done' : ''}"><span>${done ? '✓' : i + 1}</span>${escapeHTML(shortTitle(s.title))}</li>`;
  }).join('');
  const vocabPreview = m.vocab.slice(0, 8).map(v => `<span>${escapeHTML(v.term)}</span>`).join('');
  return `<article class="card module-accordion-item ${isOpen ? 'open' : ''}">
    <button class="module-accordion-trigger" data-open-module="${m.id}" aria-expanded="${isOpen ? 'true' : 'false'}">
      <div class="accordion-head-left">
        <div class="roadmap-number" style="background:${m.color}">${displayModuleNumber(m)}</div>
        <div class="accordion-head-copy">
          <em class="course-mini">${escapeHTML(courseOf(m))}</em>
          <strong>${m.title} <small>/ ${m.spanishTitle}</small></strong>
          <span>${p.done}/${p.total} secciones completadas</span>
        </div>
      </div>
      <div class="accordion-head-right">
        <div class="progress compact"><span style="width:${p.pct}%; background:${m.color}"></span></div>
        <strong>${p.pct}%</strong>
        <span class="accordion-arrow">▾</span>
      </div>
    </button>
    <div class="module-accordion-panel">
      <div class="module-roadmap-card">
        <div class="roadmap-main">
          <div class="roadmap-copy">
            <h2>${m.title} <small>/ ${m.spanishTitle}</small></h2>
            <p>${m.goals.slice(0, 3).map(escapeHTML).join(' · ')}</p>
            <div class="vocab-pills">${vocabPreview}</div>
          </div>
        </div>
        <div class="roadmap-outline">
          <h3>Índice del módulo</h3>
          <ol>${outline}</ol>
          <button class="btn" data-module="${m.id}">Abrir módulo tipo Word</button>
          <small>Próximo recomendado: ${escapeHTML(shortTitle(firstIncomplete.title))}</small>
        </div>
      </div>
    </div>
  </article>`;
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



Object.assign(MODULE_DIALOGUES, {
  "6": [
    {
      "title": "A business trip",
      "context": "Practicar un viaje en pasado.",
      "lines": [
        [
          "A",
          "How was your trip?",
          "¿Cómo fue tu viaje?"
        ],
        [
          "B",
          "It was very good.",
          "Fue muy bueno."
        ],
        [
          "A",
          "Where did you go?",
          "¿A dónde fuiste?"
        ],
        [
          "B",
          "I went to Santiago for a conference.",
          "Fui a Santiago por una conferencia."
        ],
        [
          "A",
          "Did you meet new contacts?",
          "¿Conociste nuevos contactos?"
        ],
        [
          "B",
          "Yes, I did. I met two suppliers.",
          "Sí. Conocí a dos proveedores."
        ]
      ]
    },
    {
      "title": "Arranging a meeting by email",
      "context": "Practicar una reunión por email.",
      "lines": [
        [
          "A",
          "Are you free on Tuesday morning?",
          "¿Estás libre el martes por la mañana?"
        ],
        [
          "B",
          "Yes, I am. What time is good for you?",
          "Sí. ¿Qué horario te queda bien?"
        ],
        [
          "A",
          "Can we meet at ten?",
          "¿Podemos reunirnos a las diez?"
        ],
        [
          "B",
          "Yes, that is fine.",
          "Sí, está bien."
        ],
        [
          "A",
          "Great. I will send you a confirmation email.",
          "Genial. Te enviaré un email de confirmación."
        ]
      ]
    }
  ],
  "7": [
    {
      "title": "Finding a department",
      "context": "Practicar indicaciones dentro de una empresa.",
      "lines": [
        [
          "A",
          "Excuse me. Where is the Finance department?",
          "Disculpe. ¿Dónde está el departamento de Finanzas?"
        ],
        [
          "B",
          "It is on the second floor.",
          "Está en el segundo piso."
        ],
        [
          "A",
          "How do I get there?",
          "¿Cómo llego allí?"
        ],
        [
          "B",
          "Take the lift, go straight on, and turn left.",
          "Tomá el ascensor, seguí derecho y doblá a la izquierda."
        ],
        [
          "A",
          "Is it next to Human Resources?",
          "¿Está al lado de Recursos Humanos?"
        ],
        [
          "B",
          "Yes, it is opposite the meeting room.",
          "Sí, está frente a la sala de reuniones."
        ]
      ]
    },
    {
      "title": "Taking a message",
      "context": "Practicar mensajes telefónicos.",
      "lines": [
        [
          "A",
          "Could I speak to Mr. Green, please?",
          "¿Podría hablar con el Sr. Green, por favor?"
        ],
        [
          "B",
          "I am sorry, but he is not available. Can I take a message?",
          "Lo siento, no está disponible. ¿Puedo tomar un mensaje?"
        ],
        [
          "A",
          "Yes. Please ask him to call me back.",
          "Sí. Por favor dígale que me devuelva la llamada."
        ],
        [
          "B",
          "Can I have your phone number?",
          "¿Me da su número de teléfono?"
        ],
        [
          "A",
          "Yes. It is 702 555 0148.",
          "Sí. Es 702 555 0148."
        ],
        [
          "B",
          "So that is 702 555 0148. Is that right?",
          "Entonces es 702 555 0148. ¿Es correcto?"
        ]
      ]
    }
  ],
  "8": [
    {
      "title": "Arranging an interview",
      "context": "Practicar horarios y citas.",
      "lines": [
        [
          "A",
          "Good morning. Are you available for an interview on Monday?",
          "Buenos días. ¿Está disponible para una entrevista el lunes?"
        ],
        [
          "B",
          "Yes, I am. What time is convenient?",
          "Sí. ¿Qué horario es conveniente?"
        ],
        [
          "A",
          "Can we meet at quarter past ten?",
          "¿Podemos reunirnos a las diez y cuarto?"
        ],
        [
          "B",
          "Yes, that is fine.",
          "Sí, está bien."
        ],
        [
          "A",
          "Please bring your CV.",
          "Por favor traiga su currículum."
        ],
        [
          "B",
          "Of course. Thank you.",
          "Por supuesto. Gracias."
        ]
      ]
    },
    {
      "title": "At work now",
      "context": "Practicar Present Continuous.",
      "lines": [
        [
          "A",
          "What are you doing now?",
          "¿Qué estás haciendo ahora?"
        ],
        [
          "B",
          "I am preparing a customer report.",
          "Estoy preparando un informe de cliente."
        ],
        [
          "A",
          "Is Ana working with you?",
          "¿Ana está trabajando con vos?"
        ],
        [
          "B",
          "No, she is interviewing a candidate.",
          "No, ella está entrevistando a un candidato."
        ],
        [
          "A",
          "Are they hiring a marketing assistant?",
          "¿Están contratando un asistente de marketing?"
        ],
        [
          "B",
          "Yes, they are.",
          "Sí."
        ]
      ]
    }
  ],
  "9": [
    {
      "title": "Comparing two products",
      "context": "Practicar comparativos y precios.",
      "lines": [
        [
          "A",
          "Which laptop is better?",
          "¿Qué laptop es mejor?"
        ],
        [
          "B",
          "The blue one is faster, but it is more expensive.",
          "La azul es más rápida, pero es más cara."
        ],
        [
          "A",
          "How much does it cost?",
          "¿Cuánto cuesta?"
        ],
        [
          "B",
          "It costs eight hundred dollars.",
          "Cuesta ochocientos dólares."
        ],
        [
          "A",
          "Is the black one cheaper?",
          "¿La negra es más barata?"
        ],
        [
          "B",
          "Yes, but the battery is worse.",
          "Sí, pero la batería es peor."
        ]
      ]
    },
    {
      "title": "A competitive company",
      "context": "Practicar presentación breve.",
      "lines": [
        [
          "A",
          "Why is your company competitive?",
          "¿Por qué tu empresa es competitiva?"
        ],
        [
          "B",
          "Our prices are lower than our competitors.",
          "Nuestros precios son más bajos que los de nuestros competidores."
        ],
        [
          "A",
          "What about quality?",
          "¿Qué pasa con la calidad?"
        ],
        [
          "B",
          "Our quality is better, and our delivery is faster.",
          "Nuestra calidad es mejor y nuestra entrega es más rápida."
        ],
        [
          "A",
          "That sounds good.",
          "Eso suena bien."
        ],
        [
          "B",
          "Yes, customers like our service.",
          "Sí, a los clientes les gusta nuestro servicio."
        ]
      ]
    }
  ],
  "10": [
    {
      "title": "Reacting to news",
      "context": "Practicar reacciones.",
      "lines": [
        [
          "A",
          "I have good news. We finished the project early.",
          "Tengo buenas noticias. Terminamos el proyecto antes de tiempo."
        ],
        [
          "B",
          "That is great news! Congratulations!",
          "¡Qué buena noticia! ¡Felicitaciones!"
        ],
        [
          "A",
          "Thank you. The team worked very well.",
          "Gracias. El equipo trabajó muy bien."
        ],
        [
          "B",
          "Who was the most organized person?",
          "¿Quién fue la persona más organizada?"
        ],
        [
          "A",
          "Ana was the most organized.",
          "Ana fue la más organizada."
        ],
        [
          "B",
          "Excellent. She is a great team member.",
          "Excelente. Es una gran integrante del equipo."
        ]
      ]
    },
    {
      "title": "Opinions about teamwork",
      "context": "Practicar opiniones y superlativos.",
      "lines": [
        [
          "A",
          "What do you think about teamwork?",
          "¿Qué pensás sobre el trabajo en equipo?"
        ],
        [
          "B",
          "I think it is the best way to solve problems.",
          "Creo que es la mejor forma de resolver problemas."
        ],
        [
          "A",
          "I agree. Communication is the most important thing.",
          "Estoy de acuerdo. La comunicación es lo más importante."
        ],
        [
          "B",
          "Yes, and a good team leader is important too.",
          "Sí, y un buen líder de equipo también es importante."
        ],
        [
          "A",
          "What is the most difficult part?",
          "¿Cuál es la parte más difícil?"
        ],
        [
          "B",
          "The most difficult part is organizing everybody.",
          "La parte más difícil es organizar a todos."
        ]
      ]
    }
  ]
});

function renderDialogues(app, m){
  if(!m) m = moduleById(1);
  state.activeModule = m.id;
  state.modulesNavOpen = true;
  saveState();
  const dialogues = MODULE_DIALOGUES[m.id] || [];
  app.innerHTML = `<section class="hero"><h1>Diálogos del módulo ${m.id}</h1><p>${escapeHTML(m.title)} / ${escapeHTML(m.spanishTitle)}. Practicá los diálogos relacionados con este módulo. Tocá cualquier línea en inglés para escucharla con voz IA.</p>
    <div class="hero-actions">
      <button class="btn secondary" data-view="modules">Ver módulos</button>
      <button class="btn secondary" data-module="${m.id}">Abrir módulo completo</button>
    </div>
  </section>
  <section class="section dialogues-layout">
    <aside class="card dialogue-module-list">
      <h2>Elegir módulo</h2>
      ${MODULES.map(mod => `<button class="${mod.id === m.id ? 'active' : ''}" data-dialogue-switch="${mod.id}"><span style="background:${mod.color}">${displayModuleNumber(mod)}</span>${escapeHTML(courseOf(mod))}: ${escapeHTML(mod.title)}</button>`).join('')}
    </aside>
    <div class="dialogue-content">
      ${dialogues.map((d, index) => dialogueCard(d, index, m.color)).join('')}
      <article class="card dialogue-practice">
        <h2>Cómo practicar</h2>
        <ol>
          <li>Escuchá cada línea tocando el texto en inglés.</li>
          <li>Repetí en voz alta imitando la pronunciación.</li>
          <li>Cambiá los datos por los tuyos: nombre, empresa, número o problema.</li>
          <li>Usá la barra de velocidad para escuchar más lento si lo necesitás.</li>
        </ol>
      </article>
    </div>
  </section>`;
  $$('[data-dialogue-switch]', app).forEach(btn => btn.addEventListener('click', () => navigate('dialogues', {module: btn.dataset.dialogueSwitch})));
  $$('[data-action="speak-dialogue"]', app).forEach(btn => btn.addEventListener('click', () => speak(btn.dataset.speakText || '')));
  $$('[data-speak-line]', app).forEach(line => line.addEventListener('click', () => speak(line.dataset.speakLine || '')));
  bindCommon(app);
}

function dialogueCard(d, index, color){
  const allText = d.lines.map(line => line[1]).join(' ');
  return `<article class="card dialogue-card">
    <header class="dialogue-head">
      <div><span class="doc-section-number" style="background:${color}">${index + 1}</span><h2>${escapeHTML(d.title)}</h2><p>${escapeHTML(d.context)}</p></div>
      <button class="btn secondary" data-action="speak-dialogue" data-speak-text="${escapeAttr(allText)}">🔊 Escuchar todo</button>
    </header>
    <div class="dialogue-lines">
      ${d.lines.map(([speaker, line, translation]) => `<div class="dialogue-line"><strong>${escapeHTML(speaker)}</strong><span class="dialogue-english" data-speak-line="${escapeAttr(line)}">${escapeHTML(line)} ${translation ? `<em class="dialogue-translation">(${escapeHTML(translation)})</em>` : ''}</span><button class="icon-btn" data-action="speak-dialogue" data-speak-text="${escapeAttr(line)}" aria-label="Escuchar línea">🔊</button></div>`).join('')}
    </div>
  </article>`;
}




function renderVerbs(app){
  const everyday = [
    ['be','ser / estar','I am ready.','Estoy listo.'], ['have','tener','I have a meeting.','Tengo una reunión.'], ['do','hacer','I do my work.','Hago mi trabajo.'], ['go','ir','I go to work.','Voy al trabajo.'], ['come','venir','She comes home at six.','Ella viene a casa a las seis.'], ['get','obtener / llegar','I get up early.','Me levanto temprano.'], ['make','hacer / crear','I make coffee.','Hago café.'], ['take','tomar / llevar','I take a break.','Tomo un descanso.'], ['give','dar','Can you give me a hand?','¿Puedes darme una mano?'], ['need','necesitar','I need help.','Necesito ayuda.'], ['want','querer','I want to practice.','Quiero practicar.'], ['like','gustar','I like English.','Me gusta el inglés.'], ['know','saber / conocer','I know the answer.','Sé la respuesta.'], ['think','pensar','I think it is important.','Creo que es importante.'], ['say','decir','What did she say?','¿Qué dijo ella?'], ['tell','decir / contar','Can you tell me the price?','¿Puedes decirme el precio?'], ['speak','hablar','I speak English slowly.','Hablo inglés despacio.'], ['read','leer','Read the dialogue.','Lee el diálogo.'], ['write','escribir','Write an email.','Escribe un email.'], ['meet','reunirse / conocer','I met a supplier yesterday.','Me reuní con un proveedor ayer.'], ['travel','viajar','She travelled last month.','Ella viajó el mes pasado.']
  ];
  const business = [
    ['work for','trabajar para','I work for Amazon.','Trabajo para Amazon.'], ['work with','trabajar con','I work with colleagues.','Trabajo con colegas.'], ['produce','producir','The company produces software.','La empresa produce software.'], ['provide','proveer / brindar','We provide services.','Brindamos servicios.'], ['sell','vender','They sell products online.','Venden productos online.'], ['buy','comprar','We buy office supplies.','Compramos suministros de oficina.'], ['order','pedir / ordenar','I want to order laptops.','Quiero pedir laptops.'], ['book','reservar','Can I book a room?','¿Puedo reservar una sala?'], ['confirm','confirmar','Can you confirm by email?','¿Puede confirmar por email?'], ['deliver','entregar','We deliver next week.','Entregamos la próxima semana.'], ['receive','recibir','I received an invoice.','Recibí una factura.'], ['send','enviar','Send the document, please.','Envía el documento, por favor.'], ['attach','adjuntar','Attach the order form.','Adjunta el formulario de pedido.'], ['print','imprimir','Print a hard copy.','Imprime una copia en papel.'], ['forward','reenviar','Forward the email to me.','Reenvíame el email.'], ['call','llamar','I will call the customer.','Llamaré al cliente.'], ['contact','contactar','Contact the supplier.','Contacta al proveedor.'], ['compare','comparar','Compare the two companies.','Compará las dos empresas.'], ['choose','elegir','Choose the best option.','Elegí la mejor opción.'], ['arrange','organizar / acordar','Can we arrange a meeting?','¿Podemos acordar una reunión?']
  ];
  const tenses = [
    ['Verb BE - Present','am / is / are','I am ready. She is an architect. They are colleagues.','Presente del verbo ser/estar.'],
    ['Present Simple','base verb / he-she-it + s','We work in Sales. The company produces software.','Rutinas, hechos generales y actividades habituales.'],
    ['Present Continuous','am/is/are + verb-ing','I am studying. She is preparing a report.','Acciones ahora o situaciones temporales.'],
    ['Past Simple - regular','verb + ed','I called the customer yesterday.','Acciones terminadas en el pasado.'],
    ['Past Simple - irregular','went / had / met / sent','We went to a conference last week.','Pasado con formas irregulares.'],
    ['Future with will','will + base verb','I will call you tomorrow.','Promesas, decisiones rápidas y futuro simple.'],
    ['Future with going to','am/is/are going to + verb','We are going to meet next Monday.','Planes e intenciones.'],
    ['Present Perfect','have/has + past participle','I have sent the email.','Experiencia o acciones con resultado presente.'],
    ['Modal CAN','can + base verb','Can you help me? I can speak English.','Habilidad, permiso o pedido informal.'],
    ['Modal COULD','could + base verb','Could I leave a message?','Pedido más formal o posibilidad.'],
    ['Imperative','base verb','Go straight on. Turn left. Do not enter.','Instrucciones, órdenes o indicaciones.']
  ];
  app.innerHTML = `<section class="hero"><h1>Centro de Verbos y Tiempos Verbales</h1><p>Una sección completa para Inglés I e Inglés II: verbos básicos, tiempos verbales, pasado, futuro, modales, imperativos, verbos cotidianos y verbos de empresa. Tocá cualquier frase en inglés para escucharla.</p></section>
  <section class="section card"><h2>Mapa general de tiempos verbales</h2><div class="table-wrap"><table><thead><tr><th>Tiempo / estructura</th><th>Forma</th><th>Ejemplo</th><th>Uso</th></tr></thead><tbody>${tenses.map(row => `<tr>${row.map(c => `<td class="speak-cell">${escapeHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  <section class="section verb-grid">
    <article class="card verb-card"><h2>Reglas rápidas</h2><ul><li><strong>He / She / It:</strong> en Present Simple agrega -s o -es: works, produces, goes.</li><li><strong>Preguntas en presente:</strong> Do you...? / Does she...?</li><li><strong>Negativo en presente:</strong> don’t / doesn’t + verbo base.</li><li><strong>Preguntas en pasado:</strong> Did you...? El verbo vuelve a base.</li><li><strong>Futuro:</strong> will para decisión/promesa; going to para plan.</li><li><strong>Modal verbs:</strong> can, could, will van con verbo base.</li></ul></article>
    <article class="card verb-card"><h2>Errores típicos</h2><ul><li>Incorrecto: <strong>She work</strong>. Correcto: <strong>She works</strong>.</li><li>Incorrecto: <strong>Does she works?</strong> Correcto: <strong>Does she work?</strong></li><li>Incorrecto: <strong>I didn’t went</strong>. Correcto: <strong>I didn’t go</strong>.</li><li>Incorrecto: <strong>Can you to help me?</strong> Correcto: <strong>Can you help me?</strong></li></ul></article>
  </section>
  <section class="section verb-grid"><article class="card"><h2>Verbos más usados en la vida cotidiana</h2>${verbList(everyday)}</article><article class="card"><h2>Verbos más usados en empresa / trabajo</h2>${verbList(business)}</article></section>
  <section class="section card verb-practice"><h2>Mini práctica guiada</h2><p>Completá mentalmente y después abrí la respuesta.</p><details><summary>1. She ____ in Finance.</summary><strong>works</strong> - Present Simple, he/she/it + s.</details><details><summary>2. I ____ preparing a report now.</summary><strong>am</strong> - Present Continuous.</details><details><summary>3. We ____ to a conference last week.</summary><strong>went</strong> - Past Simple irregular.</details><details><summary>4. I ____ call you tomorrow.</summary><strong>will</strong> - Future Simple.</details><details><summary>5. Could I ____ a message?</summary><strong>leave</strong> - modal + base verb.</details></section>`;
  $$('[data-speak-verb]', app).forEach(el => el.addEventListener('click', () => speak(el.dataset.speakVerb || '')));
  bindCommon(app);
}

function verbList(items){
  return `<div class="verb-list">${items.map(([verb, translation, example, exampleEs]) => `<div class="verb-row"><strong>${escapeHTML(verb)}</strong><span>${escapeHTML(translation)}</span><p><span class="verb-example" data-speak-verb="${escapeAttr(example)}">${escapeHTML(example)}</span> <em>(${escapeHTML(exampleEs)})</em></p></div>`).join('')}</div>`;
}

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
