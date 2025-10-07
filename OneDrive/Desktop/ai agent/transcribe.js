// Transcribe.js: pide permiso de micrófono y usa Web Speech Recognition para transcribir en vivo (es-ES)
const permissionStatus = document.getElementById('permissionStatus');
const liveText = document.getElementById('liveText');
const stopBtn = document.getElementById('stopBtn');

let recognition = null;
let mediaStream = null;
// When activation is detected but the command words arrive in the next final result
let pendingActivation = false;
// Simple cooldown to avoid processing the same sentence multiple times
let lastCommandAt = 0;
const COMMAND_COOLDOWN = 1500; // ms

// Remove diacritics and collapse whitespace for more robust matching
function removeDiacritics(str){
  if (!str) return '';
  // Normalize to NFD and remove diacritic marks, then remove punctuation
  try{
    const noDia = str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return noDia.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g,' ').trim().toLowerCase();
  }catch(e){
    // Fallback if unicode property escapes not supported
    return str.normalize('NFD').replace(/[^\u0000-\u007E]/g, '').replace(/[^a-zA-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  }
}

/**
 * Speak text using SpeechSynthesis. Uses stored config if available.
 */
function speak(text){
  if (!('speechSynthesis' in window)){
    console.warn('SpeechSynthesis not supported');
    return;
  }
  try{
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';

    // Load basic config from localStorage if available
    try{
      const cfgRaw = localStorage.getItem('ia_assistente_config_v1');
      const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
      utter.rate = parseFloat(cfg.rate) || 1;
      utter.pitch = parseFloat(cfg.pitch) || 1;
      // pick a spanish voice if possible
      const voices = speechSynthesis.getVoices() || [];
      const spanish = voices.find(v => (v.lang||'').toLowerCase().startsWith('es')) || voices[0];
      if (spanish) utter.voice = spanish;
    }catch(e){ /* ignore cfg errors */ }

    // If recognition is active, pause it to avoid the assistant hearing itself
    const wasRecognizing = !!(recognition);
    try{ if (wasRecognizing) recognition.stop(); }catch(e){}

    // mark speaking so onresult doesn't process commands
    window.__assistant_speaking = true;

    utter.onend = function(){
      window.__assistant_speaking = false;
      // small delay then try to restart recognition if it previously existed
      if (wasRecognizing){
        try{ recognition.start(); }catch(e){ /* ignore */ }
      }
    };

    speechSynthesis.speak(utter);
  }catch(e){ console.warn('speak error', e); }
}

/**
 * Handle simple voice commands parsed after the activation word.
 * Commands supported: hora, fecha, detener/parar, ayuda
 */
function handleCommand(command, cfg){
  const now = Date.now();
  if (now - lastCommandAt < COMMAND_COOLDOWN) return; // skip if too soon
  lastCommandAt = now;

  const cmd = (command || '').toLowerCase().trim();
  if (!cmd) return;

  // show the detected command briefly
  liveText.textContent = `Comando: ${command}`;

  // hora
  if (cmd.includes('hora')){
    const d = new Date();
    const hours = d.getHours().toString().padStart(2,'0');
    const mins = d.getMinutes().toString().padStart(2,'0');
    const resp = `La hora es ${hours} horas con ${mins} minutos.`;
    speak(resp);
    return;
  }

  // fecha/día
  if (cmd.includes('fecha') || cmd.includes('día') || cmd.includes('dia')){
    const d = new Date();
    const resp = `Hoy es ${d.toLocaleDateString('es-ES', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}.`;
    speak(resp);
    return;
  }

  // detener/parar
  if (cmd.includes('detener') || cmd.includes('parar') || cmd.includes('para') || cmd.includes('callate') || cmd.includes('silencio')){
    speak('Deteniendo la transcripción.');
    stopAll();
    return;
  }

  // ayuda
  if (cmd.includes('ayuda') || cmd.includes('qué puedes') || cmd.includes('que puedes')){
    const resp = 'Puedo decir la hora, la fecha, y detener la transcripción. Di la palabra de activación seguida del comando.';
    speak(resp);
    return;
  }

  // fallback: repeat or say not recognized
  speak('No reconozco ese comando. Di ayuda para escuchar las opciones.');
}

function supportsSpeechRecognition(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

async function requestMicPermission(){
  try{
    // Solicita permiso explícito para el micrófono (getUserMedia) para forzar el prompt
    mediaStream = await navigator.mediaDevices.getUserMedia({audio:true});
    permissionStatus.textContent = 'Permiso concedido. Iniciando transcripción...';
    startRecognition();
  }catch(e){
    // Mostrar el mensaje exacto requerido cuando hay error o el usuario niega el permiso
    permissionStatus.textContent = 'Permiso denegado o error al acceder al micrófono.';
    console.warn('Mic permission error', e);
  }
}

function startRecognition(){
  if (!supportsSpeechRecognition()){
    permissionStatus.textContent = 'Reconocimiento de voz no soportado en este navegador.';
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'es-ES';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = ()=>{ permissionStatus.textContent = 'Transcribiendo...'; };
  recognition.onend = ()=>{ permissionStatus.textContent = 'Transcripción detenida.'; };
  recognition.onerror = (e)=>{
    console.warn('SpeechRecognition error', e);
    // Si el error está relacionado con permisos o acceso, mostrar el mensaje pedido
    const err = e && e.error ? e.error : (e && e.message ? e.message : 'unknown');
    if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'permission-denied' || err === 'security'){
      permissionStatus.textContent = 'Permiso denegado o error al acceder al micrófono.';
    } else {
      // Otros errores: mostrar mensaje genérico que incluye la info
      permissionStatus.textContent = 'Permiso denegado o error al acceder al micrófono.';
    }
  };

  recognition.onresult = (event)=>{
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) final += res[0].transcript + ' ';
      else interim += res[0].transcript;
    }
    const full = (final + interim).trim() || '...';
    liveText.textContent = full;

  // If assistant is speaking, ignore results to avoid loops
  if (window.__assistant_speaking) return;

  // Detect activation word and handle command
    try{
      const cfgRaw = localStorage.getItem('ia_assistente_config_v1');
      const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
      const activation = (cfg.activation || '').trim();
      if (activation){
        const normFull = removeDiacritics(full);
        const normAct = removeDiacritics(activation);

        // Use final results only for triggering commands
        if (final){
          const normFinal = removeDiacritics(final);
          const idx = normFinal.indexOf(normAct);
          if (idx !== -1){
            // compute position in the original 'final' string by finding the actLower in a simple way
            // fallback: use final slice after the activation words length
            const after = final.slice(idx + activation.length).trim();
            if (after){
              handleCommand(after, cfg);
            } else {
              pendingActivation = true;
            }
          } else if (pendingActivation){
            pendingActivation = false;
            handleCommand(final.trim(), cfg);
          }
        }
      }
    }catch(e){ console.warn('Error processing activation/command', e); }
  };

  try{
    recognition.start();
  }catch(e){
    console.warn('recognition start', e);
  }

  // Stop handler: stop recognition and stop media tracks to release mic
  stopBtn.addEventListener('click', stopAll);
}

function stopAll(){
  if (recognition){
    try{ recognition.stop(); }catch(e){}
    recognition = null;
  }
  if (mediaStream){
    try{
      mediaStream.getTracks().forEach(t => t.stop());
    }catch(e){ }
    mediaStream = null;
  }
  permissionStatus.textContent = 'Transcripción detenida.';
}

// Inicial: solicitar permiso y empezar
requestMicPermission();

// Asegurar limpieza al salir de la página
window.addEventListener('beforeunload', ()=>{
  if (recognition) try{ recognition.stop(); }catch(e){}
  if (mediaStream) try{ mediaStream.getTracks().forEach(t=>t.stop()); }catch(e){}
});
