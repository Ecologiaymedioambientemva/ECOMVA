/* ==========================================================================
   Lógica del Panel de Administración (admin.html)
   --------------------------------------------------------------------------
   Depende de: firebase-config.js (expone window.db)
   ========================================================================== */

(function () {
  'use strict';

  // ========================================================================
  // VALIDACIÓN: Firebase debe estar disponible
  // ========================================================================
  if (!window.db) {
    console.error('[Admin] window.db no está disponible. Verifica firebase-config.js');
    return;
  }
  const database = window.db;

  // ========================================================================
  // ESTADO GLOBAL
  // ========================================================================
  let todosLosReportes = []; // Array de objetos { id, ...datos }
  let filtros = { colonia: '', categoria: '', estado: '' };
  let debounceTimer = null;
  let toastTimer = null;

  // ========================================================================
  // REFERENCIAS DOM
  // ========================================================================
  const gridReportes     = document.getElementById('gridReportes');
  const metricTotal      = document.getElementById('metricTotal');
  const metricHoy        = document.getElementById('metricHoy');
  const metricCategoria  = document.getElementById('metricCategoria');
  const contadorFiltro   = document.getElementById('contadorFiltro');
  const filtroColonia    = document.getElementById('filtroColonia');
  const filtroCategoria  = document.getElementById('filtroCategoria');
  const filtroEstado     = document.getElementById('filtroEstado');
  const btnLimpiarFiltros= document.getElementById('btnLimpiarFiltros');
  const btnRefresh       = document.getElementById('btnRefresh');
  const imageModal       = document.getElementById('imageModal');
  const modalImage       = document.getElementById('modalImage');
  const closeModal       = document.getElementById('closeModal');
  const toastAdmin       = document.getElementById('toastAdmin');
  const toastMessage     = document.getElementById('toastMessage');
  const toastIcon        = document.getElementById('toastIcon');
  const statusDot        = document.getElementById('statusDot');
  const statusText       = document.getElementById('statusText');

  // ========================================================================
  // UTILIDADES
  // ========================================================================
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatearFecha(isoString) {
    if (!isoString) return 'Sin fecha';
    try {
      const fecha = new Date(isoString);
      if (isNaN(fecha.getTime())) return isoString;
      return fecha.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  function mostrarToast(mensaje, tipo = 'success') {
    toastMessage.textContent = mensaje;

    if (tipo === 'error') {
      toastIcon.className = 'bg-red-500 rounded-full p-1 shrink-0';
      toastIcon.innerHTML = '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
    } else {
      toastIcon.className = 'bg-emerald-500 rounded-full p-1 shrink-0';
      toastIcon.innerHTML = '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
    }

    toastAdmin.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastAdmin.classList.add('hidden');
    }, 3000);
  }

  // ========================================================================
  // ACTUALIZAR MÉTRICAS
  // ========================================================================
  function actualizarMetricas() {
    const total = todosLosReportes.length;
    metricTotal.textContent = total;

    // Reportes del día (basado en timestamp numérico)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioHoy = hoy.getTime();
    const reportesHoy = todosLosReportes.filter(r => Number(r.timestamp) >= inicioHoy).length;
    metricHoy.textContent = reportesHoy;

    // Categoría más frecuente
    if (total === 0) {
      metricCategoria.textContent = '—';
    } else {
      const conteo = {};
      todosLosReportes.forEach(r => {
        const cat = r.categoria || 'Sin categoría';
        conteo[cat] = (conteo[cat] || 0) + 1;
      });
      let maxCat = '—';
      let maxCount = 0;
      for (const [cat, count] of Object.entries(conteo)) {
        if (count > maxCount) {
          maxCount = count;
          maxCat = cat;
        }
      }
      metricCategoria.textContent = maxCat;
    }
  }

  // ========================================================================
  // ACTUALIZAR FILTRO DE CATEGORÍAS DINÁMICAMENTE
  // ========================================================================
  function actualizarFiltroCategorias() {
    const valorActual = filtroCategoria.value;

    // Recolectar categorías únicas de los reportes existentes
    const setCategorias = new Set();
    todosLosReportes.forEach(r => {
      if (r.categoria) setCategorias.add(r.categoria);
    });

    // Ordenar alfabéticamente
    const categorias = Array.from(setCategorias).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    // Reconstruir opciones del select
    filtroCategoria.innerHTML = '<option value="">Todas las categorías</option>' +
      categorias.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    // Restaurar la selección previa si aún existe
    if (valorActual && categorias.includes(valorActual)) {
      filtroCategoria.value = valorActual;
    } else if (valorActual) {
      // La categoría ya no existe → limpiamos el filtro
      filtroCategoria.value = '';
      filtros.categoria = '';
    }
  }

  // ========================================================================
  // FILTROS
  // ========================================================================
  function aplicarFiltros(reportes) {
    return reportes.filter(r => {
      // Filtro colonia (búsqueda parcial, insensible a mayúsculas)
      if (filtros.colonia) {
        const colonia = (r.colonia || '').toLowerCase();
        if (!colonia.includes(filtros.colonia.toLowerCase())) return false;
      }
      // Filtro categoría
      if (filtros.categoria && r.categoria !== filtros.categoria) return false;
      // Filtro estado
      if (filtros.estado && (r.estado || 'pendiente') !== filtros.estado) return false;
      return true;
    });
  }

  // ========================================================================
  // RENDERIZAR REPORTES
  // ========================================================================
  function renderizarReportes() {
    const filtrados = aplicarFiltros(todosLosReportes);
    contadorFiltro.textContent = filtrados.length;

    // Estado vacío
    if (filtrados.length === 0) {
      gridReportes.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
          <svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <p class="text-sm font-medium">No hay reportes que coincidan con los filtros</p>
        </div>
      `;
      return;
    }

    // Ordenar: más recientes primero
    const ordenados = [...filtrados].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

    gridReportes.innerHTML = ordenados.map(r => {
      const estado = r.estado || 'pendiente';
      const badgeClass = estado === 'atendido' ? 'badge-atendido' : 'badge-pendiente';
      const badgeTexto = estado === 'atendido' ? '✓ Atendido' : '⏳ Pendiente';

      // Fecha segura
      const fechaIso = r.fechaLegible || (r.timestamp ? new Date(Number(r.timestamp)).toISOString() : '');

      // Fotos miniaturas
      const fotos = Array.isArray(r.fotos) ? r.fotos : [];
      const fotosHTML = fotos.length > 0
        ? `<div class="flex gap-2 mt-3 flex-wrap">
            ${fotos.map((foto, idx) => `
              <img src="${foto}" alt="Foto ${idx + 1}"
                   class="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition shadow-sm"
                   data-img="${foto}">
            `).join('')}
          </div>`
        : `<p class="text-xs text-gray-400 mt-3 italic">Sin fotos adjuntas</p>`;

      return `
        <article class="card-reporte bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col" data-id="${escapeHtml(r.id)}">
          <!-- Encabezado de card -->
          <div class="bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-3 border-b border-emerald-100 flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                ${escapeHtml(formatearFecha(fechaIso))}
              </p>
              <p class="text-xs text-gray-500 mt-0.5 truncate">Folio: <span class="font-mono font-semibold text-gray-700">${escapeHtml(r.folio || 'N/A')}</span></p>
            </div>
            <span class="text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full ${badgeClass} whitespace-nowrap">${badgeTexto}</span>
          </div>

          <!-- Cuerpo de card -->
          <div class="p-4 flex-1 flex flex-col">
            <!-- Categoría -->
            <div class="mb-2">
              <span class="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">
                ${escapeHtml(r.categoria || 'Sin categoría')}
              </span>
            </div>

            <!-- Dirección -->
            <div class="space-y-1 text-sm text-gray-700">
              <p class="flex items-start gap-1.5">
                <svg class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span><strong>${escapeHtml(r.direccion || '')}</strong>, Col. ${escapeHtml(r.colonia || '')}, C.P. ${escapeHtml(r.codigoPostal || '')}</span>
              </p>
              <p class="flex items-center gap-1.5 text-xs text-gray-500">
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Antigüedad: <span class="font-medium text-gray-700">${escapeHtml(r.antiguedad || 'No especificada')}</span>
              </p>
            </div>

            <!-- Descripción -->
            <p class="mt-2 text-sm text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100 flex-1">
              ${escapeHtml(r.descripcion || 'Sin descripción')}
            </p>

            <!-- Fotos -->
            ${fotosHTML}
          </div>

          <!-- Acciones -->
          <div class="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <button class="btn-toggle-estado flex-1 min-w-[110px] text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5
              ${estado === 'atendido'
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'}"
              data-id="${escapeHtml(r.id)}" data-estado="${estado}">
              ${estado === 'atendido'
                ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Marcar Pendiente'
                : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Marcar Atendido'}
            </button>
            <button class="btn-eliminar text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition flex items-center justify-center gap-1.5"
                    data-id="${escapeHtml(r.id)}" data-folio="${escapeHtml(r.folio || '')}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              <span class="hidden sm:inline">Eliminar</span>
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Delegación de eventos para imágenes
    gridReportes.querySelectorAll('[data-img]').forEach(img => {
      img.addEventListener('click', (e) => {
        modalImage.src = e.currentTarget.dataset.img;
        imageModal.classList.remove('hidden');
        imageModal.classList.add('flex');
      });
    });

    // Delegación de eventos para toggle estado
    gridReportes.querySelectorAll('.btn-toggle-estado').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const estadoActual = e.currentTarget.dataset.estado;
        const nuevoEstado = estadoActual === 'atendido' ? 'pendiente' : 'atendido';
        e.currentTarget.disabled = true;
        try {
          await database.ref('reportes/' + id).update({ estado: nuevoEstado });
          mostrarToast(nuevoEstado === 'atendido' ? 'Reporte marcado como atendido' : 'Reporte marcado como pendiente');
        } catch (err) {
          console.error('[Admin] Error al actualizar estado:', err);
          mostrarToast('Error al actualizar estado', 'error');
          e.currentTarget.disabled = false;
        }
      });
    });

    // Delegación de eventos para eliminar
    gridReportes.querySelectorAll('.btn-eliminar').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const folio = e.currentTarget.dataset.folio;
        if (!confirm(`¿Estás seguro de eliminar el reporte ${folio}?\nEsta acción no se puede deshacer.`)) return;
        e.currentTarget.disabled = true;
        try {
          await database.ref('reportes/' + id).remove();
          mostrarToast('Reporte eliminado correctamente');
        } catch (err) {
          console.error('[Admin] Error al eliminar:', err);
          mostrarToast('Error al eliminar el reporte', 'error');
          e.currentTarget.disabled = false;
        }
      });
    });
  }

  // ========================================================================
  // ESCUCHAR DATOS EN TIEMPO REAL
  // ========================================================================
  const reportesRef = database.ref('reportes');

  reportesRef.on('value', (snapshot) => {
    const data = snapshot.val();
    todosLosReportes = [];
    if (data) {
      for (const [id, reporte] of Object.entries(data)) {
        todosLosReportes.push({ id, ...reporte });
      }
    }
    actualizarMetricas();
    actualizarFiltroCategorias();   // ← NUEVO
    renderizarReportes();
  }, (error) => {
    console.error('[Admin] Error en listener Firebase:', error);
    statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
    statusText.textContent = 'Error de conexión';
    gridReportes.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-16 text-red-500 bg-red-50 rounded-2xl border border-red-200">
        <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <p class="text-sm font-medium">Error al conectar con Firebase</p>
        <p class="text-xs mt-1">Verifica tu configuración y reglas de seguridad</p>
      </div>
    `;
  });

  // ========================================================================
  // ESTADO DE CONEXIÓN
  // ========================================================================
  database.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true) {
      statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      statusText.textContent = 'En línea';
    } else {
      statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
      statusText.textContent = 'Desconectado';
    }
  });

  // ========================================================================
  // EVENTOS DE FILTROS
  // ========================================================================
  filtroColonia.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filtros.colonia = e.target.value.trim();
      renderizarReportes();
    }, 250);
  });

  filtroCategoria.addEventListener('change', (e) => {
    filtros.categoria = e.target.value;
    renderizarReportes();
  });

  filtroEstado.addEventListener('change', (e) => {
    filtros.estado = e.target.value;
    renderizarReportes();
  });

  btnLimpiarFiltros.addEventListener('click', () => {
    filtroColonia.value = '';
    filtroCategoria.value = '';
    filtroEstado.value = '';
    filtros = { colonia: '', categoria: '', estado: '' };
    renderizarReportes();
  });

  btnRefresh.addEventListener('click', () => {
    mostrarToast('Datos actualizados en tiempo real');
    renderizarReportes();
  });

  // ========================================================================
  // MODAL DE IMAGEN
  // ========================================================================
  function cerrarModal() {
    imageModal.classList.add('hidden');
    imageModal.classList.remove('flex');
    modalImage.src = '';
  }

  closeModal.addEventListener('click', cerrarModal);

  imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) cerrarModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !imageModal.classList.contains('hidden')) {
      cerrarModal();
    }
  });

})();