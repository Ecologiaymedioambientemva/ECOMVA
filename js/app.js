/* ==========================================================================
   Lógica del portal de reportes anónimos (index.html)
   --------------------------------------------------------------------------
   Depende de: firebase-config.js (expone window.db)
   Incluye:
     - Conversión automática a WebP con canvas (hasta 1600px, calidad 0.8)
     - Compresión de fotos antes de subirlas a Firebase
   ========================================================================== */

(function () {
  'use strict';

  // ========================================================================
  // REFERENCIAS DOM
  // ========================================================================
  const form                = document.getElementById('reportForm');
  const fotoInput           = document.getElementById('fotoInput');
  const addPhotoBtn         = document.getElementById('addPhotoBtn');
  const previewContainer    = document.getElementById('previewContainer');
  const fileCount           = document.getElementById('fileCount');
  const toast               = document.getElementById('toast');
  const btnSubmit           = document.getElementById('btnSubmit');
  const btnSubmitText       = document.getElementById('btnSubmitText');
  const categoriaSelect     = document.getElementById('categoria');
  const categoriaCustom     = document.getElementById('categoriaCustom');
  const categoriaCustomWrap = document.getElementById('categoriaCustomWrapper');

  // ========================================================================
  // ESTADO LOCAL
  // ========================================================================
  let imagenesBase64 = [];
  const MAX_FOTOS = 2;

  // Configuración de compresión WebP
  const WEBP_CONFIG = {
    maxWidth:  1600,   // px — mantiene aspecto, evita fotos enormes de celular
    maxHeight: 1600,
    quality:   0.8     // 0.0 a 1.0 — buen balance peso/calidad
  };

  // Tamaño máximo del archivo original antes de procesar (por seguridad)
  const MAX_INPUT_SIZE_MB = 25;

  // ========================================================================
  // CATEGORÍA PERSONALIZADA: mostrar/ocultar input
  // ========================================================================
  categoriaSelect.addEventListener('change', () => {
    if (categoriaSelect.value === 'Otro') {
      categoriaCustomWrap.classList.remove('hidden');
      categoriaCustom.setAttribute('required', 'required');
      setTimeout(() => categoriaCustom.focus(), 50);
    } else {
      categoriaCustomWrap.classList.add('hidden');
      categoriaCustom.removeAttribute('required');
      categoriaCustom.value = '';
    }
  });

  // ========================================================================
  // CONVERSIÓN A WEBP (con redimensionado + compresión)
  // ------------------------------------------------------------------------
  // Recibe un File, lo dibuja en un canvas y lo exporta como WebP Base64.
  // Si el navegador no soporta WebP, cae automáticamente a JPEG.
  // Devuelve una Promise que resuelve con el string Base64 (data:image/...)
  // ========================================================================
  function convertirAWebP(file, options) {
    const { maxWidth, maxHeight, quality } = Object.assign(
      { maxWidth: 1600, maxHeight: 1600, quality: 0.8 },
      options || {}
    );

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));

      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));

        img.onload = () => {
          try {
            // Calcular nuevas dimensiones manteniendo aspecto
            let { width, height } = img;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width  = Math.round(width  * ratio);
              height = Math.round(height * ratio);
            }

            // Crear canvas del tamaño final
            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');

            // Fondo blanco para imágenes con transparencia (PNG con alpha)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Suavizado de alta calidad al redimensionar
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Dibujar imagen ya redimensionada
            ctx.drawImage(img, 0, 0, width, height);

            // Exportar a WebP
            let base64 = canvas.toDataURL('image/webp', quality);

            // Verificar soporte real de WebP (algunos navegadores devuelven PNG silenciosamente)
            if (!base64.startsWith('data:image/webp')) {
              console.warn('[WebP] Navegador no soporta WebP, usando JPEG como fallback');
              base64 = canvas.toDataURL('image/jpeg', quality);
            }

            resolve(base64);
          } catch (err) {
            reject(err);
          }
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  // ========================================================================
  // UTILIDAD: peso aproximado de un Base64 en KB/MB
  // ========================================================================
  function pesoAproximadoKB(base64) {
    // Restar el encabezado "data:image/webp;base64,"
    const idx = base64.indexOf(',');
    const b64 = idx >= 0 ? base64.slice(idx + 1) : base64;
    // Cada 4 caracteres base64 = 3 bytes
    return Math.round((b64.length * 3 / 4) / 1024);
  }

  // ========================================================================
  // MANEJO DE IMÁGENES (con conversión WebP)
  // ========================================================================
  addPhotoBtn.addEventListener('click', () => {
    if (imagenesBase64.length >= MAX_FOTOS) {
      alert(`Ya has alcanzado el límite de ${MAX_FOTOS} fotos.`);
      return;
    }
    fotoInput.click();
  });

  fotoInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || !files.length) return;

    // Bloquear botón mientras se procesan
    addPhotoBtn.disabled = true;
    addPhotoBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const textoOriginal = fileCount.textContent;

    for (const file of Array.from(files)) {
      if (imagenesBase64.length >= MAX_FOTOS) break;
      if (!file.type.startsWith('image/')) continue;

      // Verificar tamaño máximo de entrada (seguridad)
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_INPUT_SIZE_MB) {
        alert(`La imagen "${file.name}" pesa ${sizeMB.toFixed(1)} MB y excede el límite de ${MAX_INPUT_SIZE_MB} MB.`);
        continue;
      }

      // Mostrar estado de conversión
      fileCount.textContent = 'Optimizando…';
      fileCount.classList.add('text-amber-700', 'bg-amber-100');

      try {
        const webpBase64 = await convertirAWebP(file, WEBP_CONFIG);
        const pesoKB = pesoAproximadoKB(webpBase64);
        console.log(`[WebP] "${file.name}" → ${pesoKB} KB`);

        imagenesBase64.push(webpBase64);
        renderPreviews();
      } catch (err) {
        console.error('[WebP] Error convirtiendo imagen:', err);
        alert(`No se pudo procesar la imagen "${file.name}".\nIntenta con otra foto.`);
      }
    }

    // Restaurar botón y contador
    addPhotoBtn.disabled = false;
    addPhotoBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    fileCount.classList.remove('text-amber-700', 'bg-amber-100');
    fileCount.textContent = `${imagenesBase64.length}/${MAX_FOTOS}`;

    // Limpiar input para permitir reseleccionar el mismo archivo
    fotoInput.value = '';
  });

  // ========================================================================
  // RENDERIZAR PREVISUALIZACIONES
  // ========================================================================
  function renderPreviews() {
    previewContainer.innerHTML = '';

    imagenesBase64.forEach((base64, index) => {
      const pesoKB = pesoAproximadoKB(base64);

      const div = document.createElement('div');
      div.className = 'relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-sm';
      div.innerHTML = `
        <img src="${base64}" alt="Previsualización ${index + 1}" class="img-preview">
        <span class="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
          ${pesoKB} KB
        </span>
        <button type="button"
                class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md transition"
                data-index="${index}"
                aria-label="Eliminar foto ${index + 1}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      `;

      div.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        imagenesBase64.splice(idx, 1);
        renderPreviews();
      });

      previewContainer.appendChild(div);
    });

    fileCount.textContent = `${imagenesBase64.length}/${MAX_FOTOS}`;
  }

  // ========================================================================
  // TOAST DE CONFIRMACIÓN
  // ========================================================================
  let toastTimer = null;

  function showToast() {
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100', 'show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('opacity-0', 'pointer-events-none');
      toast.classList.remove('opacity-100', 'show');
    }, 6000);
  }

  // ========================================================================
  // ENVÍO DEL FORMULARIO
  // ========================================================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Recolectar valores
    const direccion    = document.getElementById('direccion').value.trim();
    const colonia      = document.getElementById('colonia').value.trim();
    const codigoPostal = document.getElementById('codigoPostal').value.trim();
    const antiguedad   = document.getElementById('antiguedad').value;
    let   categoria    = categoriaSelect.value;
    const descripcion  = document.getElementById('descripcion').value.trim();

    // Validación básica
    if (!direccion || !colonia || !codigoPostal || !antiguedad || !categoria || !descripcion) {
      alert('Por favor completa todos los campos obligatorios.');
      return;
    }

    // Validación de categoría personalizada
    if (categoria === 'Otro') {
      const custom = categoriaCustom.value.trim();
      if (!custom) {
        alert('Por favor especifica el motivo personalizado.');
        categoriaCustom.focus();
        return;
      }
      if (custom.length > 60) {
        alert('El motivo personalizado no puede exceder 60 caracteres.');
        return;
      }
      categoria = custom;
    }

    // Validación del código postal
    if (!/^\d{4,5}$/.test(codigoPostal)) {
      alert('El código postal debe contener entre 4 y 5 dígitos numéricos.');
      return;
    }

    // Generar folio temporal
    const timestamp = Date.now();
    const folio = 'MON-' + timestamp.toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1000);

    // Construir objeto del reporte
    const reporte = {
      folio,
      timestamp,
      fechaLegible: new Date(timestamp).toISOString(),
      direccion,
      colonia,
      codigoPostal,
      antiguedad,
      categoria,
      descripcion,
      fotos: imagenesBase64,   // Ya son WebP Base64 optimizadas
      estado: 'pendiente'
    };

    // Estado de carga en el botón
    btnSubmit.disabled = true;
    btnSubmitText.textContent = 'Enviando...';

    try {
      await window.db.ref('reportes').push(reporte);

      showToast();
      form.reset();

      categoriaCustomWrap.classList.add('hidden');
      categoriaCustom.removeAttribute('required');

      imagenesBase64 = [];
      renderPreviews();
      fileCount.textContent = `0/${MAX_FOTOS}`;
    } catch (error) {
      console.error('[App] Error al enviar el reporte:', error);
      alert('Ocurrió un error al enviar el reporte. Por favor intenta de nuevo.\n' + (error.message || ''));
    } finally {
      btnSubmit.disabled = false;
      btnSubmitText.textContent = 'Enviar Reporte Anónimo';
    }
  });

  // ========================================================================
  // INICIALIZACIÓN
  // ========================================================================
  fileCount.textContent = `0/${MAX_FOTOS}`;
})();