// Lógica para selección de voz y prueba de síntesis
const activationEl = document.getElementById('activation');
const voiceTypeEl = document.getElementById('voiceType');
const rateEl = document.getElementById('rate');
const pitchEl = document.getElementById('pitch');
const rateValue = document.getElementById('rateValue');
const pitchValue = document.getElementById('pitchValue');
const tryBtn = document.getElementById('tryBtn');
const paramsBtn = document.getElementById('paramsBtn');

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

paramsBtn.addEventListener('click', ()=>{
  const params = new URLSearchParams({
    activation: activationEl.value || '',
    voiceType: voiceTypeEl.value,
    rate: rateEl.value,
    pitch: pitchEl.value
  }).toString();
  // Abrir nueva ventana con los parámetros
  window.open(`params.html?${params}`,'_blank','width=420,height=360');
});

// Guardar también al salir de la página (por si no se hicieron cambios explícitos)
window.addEventListener('beforeunload', saveConfig);
