# Marca de Agua en videos

Añade una marca de agua de texto a varios videos a la vez: abajo a la derecha, 50% de opacidad. 100% local en el navegador, descarga en ZIP.

🌐 **Página:** https://sandovaljon.github.io/marca-de-agua-videos/

- Arrastra tus videos o selecciónalos (varios a la vez).
- Personaliza texto, tamaño y color. Vista previa con la marca en movimiento.
- Salida: mismo formato en MP4/MOV (video H.264 + audio AAC, con la marca dibujada); otros formatos salen en WebM. Si tu navegador no soporta codificar MP4, ese video sale en WebM automáticamente.
- El proceso tarda lo que dura cada video (se re-graba en tiempo real).
- Nada se sube a Internet: todo ocurre en tu dispositivo.

Requiere un navegador con `MediaRecorder` y `canvas.captureStream` (Chrome, Edge, Brave, Firefox).
