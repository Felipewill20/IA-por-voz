# IA Personal Asistente (proyecto de ejemplo)

Proyecto estático pequeño que muestra una interfaz para configurar una "palabra de activación", tipo de voz y parámetros de velocidad y frecuencia. Incluye un botón "Probar" que usa la API Web Speech para pronunciar:

"Hola soy [palabra de activacion] y esta es mi voz"

Además el botón "Parametros listo" abre una ventana con los parámetros seleccionados.

Cómo usar:

1. Abrir el archivo `index.html` en un navegador moderno (Chrome o Edge recomendado).
2. Escribir la "Palabra de activacion", elegir "Tipo de voz", ajustar velocidad y frecuencia.
3. Presionar "Probar" para escuchar la voz.
4. Presionar "Listo" para ir al módulo de transcripción (pedirá permiso de micrófono).

Transcripción en vivo:
- El módulo `transcribe.html` solicita permiso para el micrófono y muestra un contenedor "Transcribiendo" con la transcripción en vivo (usa la Web Speech Recognition API).

Notas:
- La selección de voz por "tipo" intenta elegir una voz femenina o masculina buscando palabras clave en el nombre del voice. Esto depende de las voces instaladas en el navegador/sistema.
- Si no hay voces cargadas inmediatamente, recarga la página o espera unos segundos (algunos navegadores cargan las voces de forma asíncrona).
