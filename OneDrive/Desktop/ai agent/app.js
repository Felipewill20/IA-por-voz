// Lógica para selección de voz y prueba de síntesis
const activationEl = document.getElementById('activation');
const voiceTypeEl = document.getElementById('voiceType');
const rateEl = document.getElementById('rate');
const pitchEl = document.getElementById('pitch');
const rateValue = document.getElementById('rateValue');
const pitchValue = document.getElementById('pitchValue');
const tryBtn = document.getElementById('tryBtn');

let voices = [];
const STORAGE_KEY = 'ia_assistente_config_v1';

function saveConfig(){
  const cfg = {
    activation: activationEl.value || '',
    voiceType: voiceTypeEl.value,
    rate: rateEl.value,
    pitch: pitchEl.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = 'Configuración guardada en el navegador.';
}

function loadConfig(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (cfg.activation) activationEl.value = cfg.activation;
    if (cfg.voiceType) voiceTypeEl.value = cfg.voiceType;
    if (cfg.rate) { rateEl.value = cfg.rate; rateValue.textContent = cfg.rate }
    if (cfg.pitch) { pitchEl.value = cfg.pitch; pitchValue.textContent = cfg.pitch }
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = 'Configuración cargada desde el navegador.';
  }catch(e){ console.warn('No se pudo cargar configuración:', e) }
}

function loadVoices(){
  voices = speechSynthesis.getVoices() || [];
  // some browsers load asynchronously
}

loadVoices();
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => loadVoices();
}

function findVoiceByType(type){
  if (!voices.length) return null;

  // Helper lists for heuristic matching
  const femaleKeywords = ['female','woman','girl','feminine','femenina','mujer'];
  const maleNameKeywords = ['miguel','juan','jose','carlos','javier','david','jorge','gabriel','andres','alejandro','manuel','pablo','antonio','luis','raul','francisco','alberto','jorge','roberto','eduardo'];

  // Return first available voice for 'any'
  if (type === 'any') return voices[0];

  // Prefer voices with Spanish locale
  const spanish = voices.filter(v => (v.lang || '').toLowerCase().startsWith('es'));

  if (type === 'male'){
    // 1) Among Spanish voices try to find one whose name contains a common male name
    const spanishLower = spanish.map(v => ({v, name:(v.name||'').toLowerCase()}));
    for (const {v,name} of spanishLower){
      if (maleNameKeywords.some(k => name.includes(k))) return v;
    }

    // 2) If none, pick a Spanish voice whose name doesn't include female indicators
    for (const v of spanish){
      const name = (v.name||'').toLowerCase();
      if (!femaleKeywords.some(k => name.includes(k))) return v;
    }

    // 3) Fallback: any voice whose name contains a male name keyword
    for (const v of voices){
      const name = (v.name||'').toLowerCase();
      if (maleNameKeywords.some(k => name.includes(k))) return v;
    }

    // 4) Last resort: first Spanish voice, or first available
    return spanish.length ? spanish[0] : voices[0];
  }

  if (type === 'female'){
    // Prefer Spanish female voices
    const spanishFemale = spanish.filter(v => {
      const name = (v.name||'').toLowerCase();
      return femaleKeywords.some(k => name.includes(k));
    });
    if (spanishFemale.length) return spanishFemale[0];

    // Otherwise pick any voice that looks female
    const anyFemale = voices.find(v => femaleKeywords.some(k => (v.name||'').toLowerCase().includes(k) || (v.lang||'').toLowerCase().includes(k)));
    if (anyFemale) return anyFemale;

    // Fallbacks
    return spanish.length ? spanish[0] : voices[0];
  }

  return voices[0];
}

function speak(text){
  if (!('speechSynthesis' in window)){
    alert('Tu navegador no soporta SpeechSynthesis. Usa Chrome/Edge/Firefox reciente.');
    return;
  }
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const type = voiceTypeEl.value;
  const voice = findVoiceByType(type);
  if (voice) utter.voice = voice;
  utter.rate = parseFloat(rateEl.value) || 1;
  utter.pitch = parseFloat(pitchEl.value) || 1;
  speechSynthesis.speak(utter);
}

rateEl.addEventListener('input', ()=> rateValue.textContent = rateEl.value);
pitchEl.addEventListener('input', ()=> pitchValue.textContent = pitchEl.value);

// Guardar configuración al cambiar cualquier control
activationEl.addEventListener('change', saveConfig);
voiceTypeEl.addEventListener('change', saveConfig);
rateEl.addEventListener('change', saveConfig);
pitchEl.addEventListener('change', saveConfig);

// Cargar config al inicio
loadConfig();

tryBtn.addEventListener('click', ()=>{
  const activation = (activationEl.value || 'IA').trim();
  const phrase = `Hola soy ${activation} y esta es mi voz`;
  speak(phrase);
});

// No hay botón "Parametros listo" — la configuración se guarda cuando se cambian los controles

// Guardar también al salir de la página (por si no se hicieron cambios explícitos)
window.addEventListener('beforeunload', saveConfig);

// ------------------ Control de voz (speech recognition) ------------------
const transcriptEl = document.getElementById('transcript');
const voiceControlSection = document.getElementById('voiceControl');
const vcStopBtn = document.getElementById('vcStop');

let recognition;
let recognizing = false;

function supportsSpeechRecognition(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function showVoiceControl(){
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = 'Configuración guardada. Control de voz activo.';
  if (!supportsSpeechRecognition()){
    transcriptEl.textContent = 'Reconocimiento de voz no soportado en este navegador.';
    voiceControlSection.setAttribute('aria-hidden','false');
    voiceControlSection.style.display = 'block';
    return;
  }

  // Inicializar reconocimiento si no existe
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = recognition || new SR();
  recognition.lang = 'es-ES';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = ()=>{ recognizing = true; voiceControlSection.setAttribute('aria-hidden','false'); voiceControlSection.style.display='block'; transcriptEl.textContent = 'Escuchando...'; };
  recognition.onend = ()=>{ recognizing = false; transcriptEl.textContent = 'Control detenido.' };
  recognition.onerror = (e)=>{ transcriptEl.textContent = 'Error de reconocimiento: '+(e.error||e.message); };

  recognition.onresult = (event)=>{
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) final += res[0].transcript + ' ';
      else interim += res[0].transcript;
    }
    transcriptEl.textContent = (final + interim).trim() || 'Escuchando...';
  };

  try{
    recognition.start();
  }catch(e){ /* ignore already started */ }
}

vcStopBtn.addEventListener('click', ()=>{
  if (recognition && recognizing) recognition.stop();
  voiceControlSection.setAttribute('aria-hidden','true');
  voiceControlSection.style.display='none';
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = 'Control de voz detenido.';
});

