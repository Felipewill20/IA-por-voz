import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_PERSONA = {
  name: "Luna",
  tone: "amable y cercana",
};

const DEFAULT_VOICE_SETTINGS = {
  voiceURI: "",
  pitch: 1,
  rate: 1,
  volume: 1,
};

const LOCAL_FALLBACK_REPLIES = [
  "Estoy aquí contigo. ¿Quieres contarme algo más?",
  "Gracias por compartirme eso. ¿Qué más te gustaría explorar?",
  "Procuro escucharte con calma. Podemos avanzar paso a paso.",
  "Te entiendo. Vamos a pensarlo juntas y encontrar una buena idea.",
];

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
};

const createSpeechRecognition = () => {
  if (typeof window === "undefined") return null;
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.interimResults = true;
  recognition.continuous = true;
  return recognition;
};

const buildSystemPrompt = (persona) =>
  `Actúa como ${persona.name}, una IA de tono ${persona.tone}. Responde en español con empatía, frases claras y no más de 4 párrafos.`;

function App() {
  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState("");
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PERSONA.name);
  const [tone, setTone] = useState(DEFAULT_PERSONA.tone);
  const [voiceSettings, setVoiceSettings] = useState(DEFAULT_VOICE_SETTINGS);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [apiSettings, setApiSettings] = useState({
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
  });
  const [customQuestion, setCustomQuestion] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [customResponses, setCustomResponses] = useState([]);
  const [status, setStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(
    typeof window !== "undefined" ? window.speechSynthesis : null,
  );

  useEffect(() => {
    recognitionRef.current = createSpeechRecognition();

    if (!recognitionRef.current) {
      setRecognitionError(
        "Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.",
      );
      return;
    }

    recognitionRef.current.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcriptChunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptChunk;
        } else {
          setTranscript(transcriptChunk);
        }
      }

      if (finalTranscript.trim()) {
        handleTranscriptionComplete(finalTranscript.trim());
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setRecognitionError(
        "El reconocimiento falló. Revisa permisos del micrófono e inténtalo de nuevo.",
      );
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };
  }, []);

  useEffect(() => {
    if (!speechSynthesisRef.current) return;

    const populateVoices = () => {
      const voices = speechSynthesisRef.current.getVoices();
      setAvailableVoices(voices.filter((voice) => voice.lang.startsWith("es")));
      if (voices.length && !voiceSettings.voiceURI) {
        const defaultVoice =
          voices.find((voice) => voice.lang.startsWith("es")) || voices[0];
        setVoiceSettings((prev) => ({
          ...prev,
          voiceURI: defaultVoice?.voiceURI || "",
        }));
      }
    };

    populateVoices();
    speechSynthesisRef.current.addEventListener("voiceschanged", populateVoices);

    return () => {
      speechSynthesisRef.current?.removeEventListener(
        "voiceschanged",
        populateVoices,
      );
    };
  }, [voiceSettings.voiceURI]);

  const systemPrompt = useMemo(
    () => buildSystemPrompt({ name: customPrompt, tone }),
    [customPrompt, tone],
  );

  const stopSpeaking = () => {
    if (speechSynthesisRef.current?.speaking) {
      speechSynthesisRef.current.cancel();
    }
  };

  const speak = (text) => {
    if (!speechSynthesisRef.current) return;
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = availableVoices.find(
      (voice) => voice.voiceURI === voiceSettings.voiceURI,
    );
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.pitch = voiceSettings.pitch;
    utterance.rate = voiceSettings.rate;
    utterance.volume = voiceSettings.volume;
    speechSynthesisRef.current.speak(utterance);
  };

  const startListening = () => {
    if (!recognitionRef.current) return;
    try {
      setTranscript("");
      setRecognitionError("");
      recognitionRef.current.start();
      setIsListening(true);
      setStatus("Escuchando...");
    } catch (error) {
      console.error("Error starting recognition:", error);
      setRecognitionError("No pude activar el micrófono, inténtalo otra vez.");
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
    setStatus("Micrófono detenido.");
  };

  const findCustomMatch = (input) => {
    const normalizedInput = input.toLowerCase().trim();
    return customResponses.find((item) => {
      const normalizedQuestion = item.question.toLowerCase().trim();
      return (
        normalizedInput === normalizedQuestion ||
        normalizedInput.includes(normalizedQuestion)
      );
    });
  };

  const generateFallbackResponse = (prompt) => {
    if (!prompt) return LOCAL_FALLBACK_REPLIES[0];
    const lower = prompt.toLowerCase();
    if (lower.includes("hola") || lower.includes("buenos")) {
      return "¡Hola! Aquí estoy. ¿Cómo te gustaría que continuemos?";
    }
    if (lower.includes("gracias")) {
      return "A ti por confiar en mí. ¿Quieres seguir con algo más?";
    }
    const randomIndex = Math.floor(
      Math.random() * LOCAL_FALLBACK_REPLIES.length,
    );
    return LOCAL_FALLBACK_REPLIES[randomIndex];
  };

  const callRemoteModel = async (history, prompt) => {
    if (!apiSettings.apiKey || !apiSettings.baseUrl) {
      return { text: generateFallbackResponse(prompt), source: "fallback" };
    }

    try {
      const response = await fetch(apiSettings.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: apiSettings.model,
          messages: [
            { role: "system", content: systemPrompt },
            ...history.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const content =
        data?.choices?.[0]?.message?.content ||
        generateFallbackResponse(prompt);
      return { text: content.trim(), source: "remote" };
    } catch (error) {
      console.error("Remote model error:", error);
      return { text: generateFallbackResponse(prompt), source: "fallback" };
    }
  };

  const handleTranscriptionComplete = async (finalText) => {
    setTranscript("");
    setStatus("Procesando tu mensaje...");

    const userMessage = {
      id: createId(),
      role: "user",
      content: finalText,
      timestamp: Date.now(),
    };

    const history = [...messages, userMessage];
    setMessages(history);

    const matched = findCustomMatch(finalText);

    if (matched) {
      const botMessage = {
        id: createId(),
        role: "assistant",
        content: matched.answer,
        timestamp: Date.now(),
        source: "custom",
      };
      setMessages((prev) => [...prev, botMessage]);
      speak(matched.answer);
      setStatus("Respuesta enviada desde respuestas fijas.");
      return;
    }

    setIsGenerating(true);
    const { text: reply, source } = await callRemoteModel(history, finalText);
    setIsGenerating(false);

    const botMessage = {
      id: createId(),
      role: "assistant",
      content: reply,
      timestamp: Date.now(),
      source,
    };

    setMessages((prev) => [...prev, botMessage]);
    speak(reply);
    setStatus(
      source === "remote"
        ? "Respuesta generada por el modelo."
        : "Respuesta de respaldo sin conexión.",
    );
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const text = formData.get("manualPrompt");
    if (!text || typeof text !== "string") return;
    await handleTranscriptionComplete(text.trim());
    event.target.reset();
  };

  const addCustomResponse = () => {
    if (!customQuestion.trim() || !customAnswer.trim()) return;
    const newItem = {
      id: createId(),
      question: customQuestion,
      answer: customAnswer,
    };
    setCustomResponses((prev) => [...prev, newItem]);
    setCustomQuestion("");
    setCustomAnswer("");
  };

  const removeCustomResponse = (id) => {
    setCustomResponses((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="app">
      <header className="card">
        <h1>Persona Voz IA</h1>
        <p>
          Configura una personalidad de voz, habla con tu micrófono y recibe
          respuestas adaptadas. Añade reglas para respuestas fijas si deseas un
          guion exacto para ciertas preguntas.
        </p>
        <div
          className={`microphone-state ${isListening ? "active" : ""}`}
          role="status"
        >
          {isListening ? "🎙️ Escuchando..." : "Micrófono inactivo"}
        </div>
        {status && <p className="status">{status}</p>}
        {transcript && (
          <p className="status">
            <strong>Texto detectado:</strong> {transcript}
          </p>
        )}
        {recognitionError && <p className="error">{recognitionError}</p>}
        <div className="tts-preview">
          <button
            type="button"
            className="primary-btn"
            onClick={isListening ? stopListening : startListening}
            disabled={!recognitionRef.current}
          >
            {isListening ? "Detener micrófono" : "Hablar con la IA"}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={stopSpeaking}
          >
            Silenciar voz
          </button>
        </div>
      </header>

      <section className="card">
        <h2>Configuración de voz y tono</h2>
        <div className="controls">
          <div className="control-group">
            <label htmlFor="persona-name">Nombre o personaje</label>
            <input
              id="persona-name"
              className="input"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              placeholder="Ej. Luna, Mentor creativo…"
            />
          </div>
          <div className="control-group">
            <label htmlFor="tone">Tono y forma de responder</label>
            <input
              id="tone"
              className="input"
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              placeholder="Ej. cálido, profesional, entusiasta…"
            />
          </div>
          <div className="control-group">
            <label htmlFor="voice">Voz sintetizada</label>
            <select
              id="voice"
              className="input"
              value={voiceSettings.voiceURI}
              onChange={(event) =>
                setVoiceSettings((prev) => ({
                  ...prev,
                  voiceURI: event.target.value,
                }))
              }
            >
              {availableVoices.length === 0 && (
                <option value="">
                  Activa voces en tu navegador para usar síntesis.
                </option>
              )}
              {availableVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="pitch">Tono</label>
            <input
              type="range"
              id="pitch"
              min="0.5"
              max="2"
              step="0.1"
              value={voiceSettings.pitch}
              onChange={(event) =>
                setVoiceSettings((prev) => ({
                  ...prev,
                  pitch: Number(event.target.value),
                }))
              }
              className="slider"
            />
            <span>{voiceSettings.pitch.toFixed(1)}</span>
          </div>
          <div className="control-group">
            <label htmlFor="rate">Velocidad</label>
            <input
              type="range"
              id="rate"
              min="0.5"
              max="2"
              step="0.1"
              value={voiceSettings.rate}
              onChange={(event) =>
                setVoiceSettings((prev) => ({
                  ...prev,
                  rate: Number(event.target.value),
                }))
              }
              className="slider"
            />
            <span>{voiceSettings.rate.toFixed(1)}x</span>
          </div>
          <div className="control-group">
            <label htmlFor="volume">Volumen</label>
            <input
              type="range"
              id="volume"
              min="0"
              max="1"
              step="0.05"
              value={voiceSettings.volume}
              onChange={(event) =>
                setVoiceSettings((prev) => ({
                  ...prev,
                  volume: Number(event.target.value),
                }))
              }
              className="slider"
            />
            <span>{Math.round(voiceSettings.volume * 100)}%</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Conexión con IA</h2>
        <p>
          Puedes usar un endpoint compatible con OpenAI (OpenRouter, Groq,
          Mistral, etc.). Si lo dejas en blanco, el asistente responderá con
          frases predefinidas sin conexión.
        </p>
        <div className="settings-grid">
          <div className="control-group">
            <label htmlFor="api-base">URL del endpoint</label>
            <input
              id="api-base"
              className="input"
              placeholder="https://api.openai.com/v1/chat/completions"
              value={apiSettings.baseUrl}
              onChange={(event) =>
                setApiSettings((prev) => ({
                  ...prev,
                  baseUrl: event.target.value,
                }))
              }
            />
          </div>
          <div className="control-group">
            <label htmlFor="api-key">API Key</label>
            <input
              id="api-key"
              className="input"
              type="password"
              placeholder="Clave privada"
              value={apiSettings.apiKey}
              onChange={(event) =>
                setApiSettings((prev) => ({
                  ...prev,
                  apiKey: event.target.value,
                }))
              }
            />
          </div>
          <div className="control-group">
            <label htmlFor="model">Modelo</label>
            <input
              id="model"
              className="input"
              placeholder="gpt-4o-mini, llama-3.2-3b-instruct, etc."
              value={apiSettings.model}
              onChange={(event) =>
                setApiSettings((prev) => ({
                  ...prev,
                  model: event.target.value,
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="card conversation">
        <h2>Conversación</h2>
        <form onSubmit={handleManualSubmit} className="control-group">
          <label htmlFor="manualPrompt">
            También puedes escribirle a tu asistente:
          </label>
          <textarea
            id="manualPrompt"
            name="manualPrompt"
            className="textarea"
            placeholder="Escribe un mensaje y presiona Enter..."
            rows={3}
          />
          <button className="secondary-btn" type="submit" disabled={isGenerating}>
            {isGenerating ? "Generando..." : "Enviar mensaje manual"}
          </button>
        </form>

        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <p className="history-empty">
              Aún no hay mensajes. Usa el micrófono o escribe un mensaje para
              comenzar.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role === "user" ? "user" : "bot"}`}
            >
              <span className="role">
                {message.role === "user" ? "Usuario" : "IA"}
                {message.source === "custom" && " · fija"}
                {message.source === "fallback" && " · offline"}
              </span>
              <span>{message.content}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Preguntas y respuestas fijas</h2>
        <p>
          Crea atajos para que la IA responda exactamente lo que necesitas ante
          ciertas preguntas o palabras clave.
        </p>
        <div className="input-row">
          <input
            className="input"
            placeholder="Pregunta o palabra clave"
            value={customQuestion}
            onChange={(event) => setCustomQuestion(event.target.value)}
          />
          <input
            className="input"
            placeholder="Respuesta exacta"
            value={customAnswer}
            onChange={(event) => setCustomAnswer(event.target.value)}
          />
          <button
            type="button"
            className="primary-btn"
            onClick={addCustomResponse}
          >
            Añadir respuesta fija
          </button>
        </div>
        <div className="question-list">
          {customResponses.length === 0 && (
            <p className="history-empty">
              Aún no has agregado reglas fijas. Agrega una para comenzar.
            </p>
          )}
          {customResponses.map((item) => (
            <div className="question-item" key={item.id}>
              <div>
                <strong>{item.question}</strong>
                <p>{item.answer}</p>
              </div>
              <div className="question-actions">
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => removeCustomResponse(item.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;


