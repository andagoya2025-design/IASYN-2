/* ============================================================================
 * AUROSANAX ERP | resultados.js | V1.3.2 - COMPATIBILIDAD ANTIRREGRESIVA
 * Basado en resultados.js V1.0.0, sin modificar documentos.js.
 * Emite enlaces exclusivamente mediante backend Apps Script validado; no envía mensajes automáticamente.
 * Requiere documentos.js con resultadosBridge V1.0.0 y carga del script en index.
 * Vigencia, accesos y autorización se aplican en el backend scrib 08 vigente.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.auroResultados) {
    console.warn('AUROSANAX RESULTADOS: módulo ya cargado.');
    return;
  }

  const VERSION = '2.3.0-IASYN2-EMISION-BACKEND-VIGENTE';
  // Backend scrib 08 publicado: la interfaz permite solicitar emisión.
  // La autorización REAL ocurre en Apps Script: sesión ADMINISTRADOR, atención y archivos.
  // No depende de banderas globales configuradas manualmente.
  const EMISION_HABILITADA = true;
  const CATEGORIAS = Object.freeze([
    { id: 'LABORATORIO', nombre: 'Laboratorios', icono: 'bi-droplet-half' },
    { id: 'ECOGRAFIA_IMAGEN', nombre: 'Ecografías / imágenes', icono: 'bi-image' },
    { id: 'FOTOGRAFIA_CLINICA', nombre: 'Fotografías clínicas', icono: 'bi-camera' },
    { id: 'PATOLOGIA', nombre: 'Patología', icono: 'bi-file-earmark-medical' },
    { id: 'OTRO', nombre: 'Otros documentos', icono: 'bi-folder2-open' }
  ]);
  const FORMATOS = Object.freeze({
    'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG',
    'image/webp': 'WEBP', 'image/heic': 'HEIC', 'image/heif': 'HEIF'
  });
  const state = {
    idAtencion: '', idPaciente: '', idHistoria: '',
    seleccion: new Set(), registros: [], tokenCarga: 0,
    cargando: false, contenedor: null, dias: 7, limite: 5,
    mensajePersonalizado: null, aviso: '', montado: false, emitiendo: false, enlace: ''
  };
  const txt = v => String(v == null ? '' : v).trim();
  const seguro = v => txt(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const documentos = () => window.auroDocumentos || null;
  const puente = () => documentos()?.resultadosBridge || null;

  function contexto() {
    try { return documentos()?.obtenerContexto?.() || null; }
    catch (error) { console.warn('RESULTADOS: contexto no disponible.', error); return null; }
  }
  function valido(c) {
    return Boolean(c && txt(c.id) && c.valido === true &&
      txt(c.idPaciente) && !c.bloqueada);
  }
  function activos(r) {
    return !/(anulad|eliminad|inactiv)/i.test(txt(r.estado || 'Activo'));
  }
  function tipo(r) {
    const mime = txt(r.mime_type).toLowerCase();
    if (FORMATOS[mime]) return FORMATOS[mime];
    const ext = txt(r.extension || txt(r.nombre_documento).split('.').pop()).toLowerCase();
    return ({pdf:'PDF', jpg:'JPG', jpeg:'JPG', png:'PNG', webp:'WEBP',
      heic:'HEIC', heif:'HEIF'})[ext] || '';
  }
  function categoria(r) {
    const raw = txt(r.categoria_documento || r.tipo_documento).toUpperCase();
    if (CATEGORIAS.some(c => c.id === raw)) return raw;
    if (/LABOR/.test(raw)) return 'LABORATORIO';
    if (/PATOLOG|BIOPS|HISTOPAT/.test(raw)) return 'PATOLOGIA';
    if (/ECO|IMAGEN|RADIO/.test(raw)) return 'ECOGRAFIA_IMAGEN';
    if (/FOTO/.test(raw)) return 'FOTOGRAFIA_CLINICA';
    return 'OTRO';
  }
  function claveContexto(c) {
    return valido(c) ? [txt(c.id), txt(c.idPaciente), txt(c.idHistoria)] : null;
  }
  function comprobarCambio() {
    const c = contexto();
    const clave = claveContexto(c);
    if (!clave || clave[0] !== state.idAtencion ||
        clave[1] !== state.idPaciente || clave[2] !== state.idHistoria) {
      state.tokenCarga++;
      state.seleccion.clear();
      state.registros = [];
      state.idAtencion = clave?.[0] || '';
      state.idPaciente = clave?.[1] || '';
      state.idHistoria = clave?.[2] || '';
      state.mensajePersonalizado = null;
      state.aviso = '';
      state.enlace = '';
    }
    return c;
  }
  function comprobarCambioSinRender() { return comprobarCambio(); }
  function aviso(mensaje) {
    state.aviso = txt(mensaje);
    const nodo = state.contenedor?.querySelector('[data-res-mensaje]');
    if (nodo) nodo.textContent = state.aviso;
  }
  function limpiar() {
    state.tokenCarga++;
    state.seleccion.clear();
    state.registros = [];
    state.idAtencion = '';
    state.idPaciente = '';
    state.idHistoria = '';
    state.mensajePersonalizado = null;
    state.aviso = '';
    state.enlace = '';
    render();
  }
  function leerPuente(c) {
    const b = puente();
    if (!b || typeof b.obtenerSnapshot !== 'function') return null;
    const snapshot = b.obtenerSnapshot();
    if (!snapshot?.listo || txt(snapshot.id_atencion) !== txt(c.id) ||
        txt(snapshot.id_paciente) !== txt(c.idPaciente)) return null;
    return Array.isArray(snapshot.documentos) ? snapshot.documentos : [];
  }
  function normalizarRegistros(lista, c) {
    const vistos = new Set();
    return lista.filter(r => {
      const id = txt(r.id_documento);
      if (!id || vistos.has(id) || !tipo(r) || !activos(r)) return false;
      if (txt(r.id_atencion) && txt(r.id_atencion) !== txt(c.id)) return false;
      if (txt(r.id_paciente) && txt(r.id_paciente) !== txt(c.idPaciente)) return false;
      vistos.add(id);
      return true;
    }).map(r => ({
      id_documento: txt(r.id_documento),
      nombre_documento: txt(r.nombre_documento) || 'Documento clínico',
      categoria_documento: categoria(r),
      mime_type: txt(r.mime_type), extension: txt(r.extension),
      tamano_bytes: Number(r.tamano_bytes) || 0
    }));
  }
  function aplicarRegistros(lista, c) {
    state.registros = normalizarRegistros(lista, c);
    const ids = new Set(state.registros.map(r => r.id_documento));
    if ([...state.seleccion].some(id => !ids.has(id))) invalidarEnlace();
    for (const id of state.seleccion) {
      if (!ids.has(id)) state.seleccion.delete(id);
    }
  }
  async function cargar() {
    const c = comprobarCambio();
    if (!valido(c)) { render(); return []; }
    if (state.cargando) return [];
    const id = txt(c.id), paciente = txt(c.idPaciente), historia = txt(c.idHistoria);
    const token = ++state.tokenCarga;
    state.cargando = true;
    render();
    aviso('Consultando índice de documentos de la atención activa...');
    try {
      let lista = leerPuente(c);
      if (!lista) {
        // Conserva la lectura asíncrona original. No se abre ni descarga Drive.
        const modulo = documentos();
        if (typeof modulo?.cargar !== 'function') {
          throw new Error('El módulo Documentos no está disponible.');
        }
        await modulo.cargar();
        if (token !== state.tokenCarga) return [];
        const actual = contexto();
        if (!valido(actual) || txt(actual.id) !== id ||
            txt(actual.idPaciente) !== paciente || txt(actual.idHistoria) !== historia) {
          comprobarCambio(); render(); return [];
        }
        lista = leerPuente(actual);
        if (!lista) {
          throw new Error('El índice seguro todavía no está listo. Recargue Documentos.');
        }
      }
      if (token !== state.tokenCarga) return [];
      aplicarRegistros(lista, c);
      aviso(`${state.registros.length} archivo(s) disponibles. Ningún enlace ha sido generado.`);
      return state.registros.map(r => ({...r}));
    } catch (error) {
      if (token === state.tokenCarga) {
        state.registros = [];
        state.seleccion.clear();
        aviso('No se pudieron consultar los documentos: ' + txt(error.message || error));
      }
      return [];
    } finally {
      if (token === state.tokenCarga) {
        state.cargando = false;
        render();
      }
    }
  }
  function seleccionActual() {
    const c = comprobarCambio();
    if (!valido(c)) return [];
    return state.registros.filter(r => state.seleccion.has(r.id_documento))
      .map(r => r.id_documento);
  }
  // Identidad: solo datos de la misma ficha de paciente vinculada a la atención.
  function pacienteVinculado(c) {
    const id = txt(c?.idPaciente);
    if (!id || !valido(c)) return null;
    const listas = [];
    try { if (Array.isArray(window.patients)) listas.push(window.patients); } catch (_) {}
    try { if (typeof patients !== 'undefined' && Array.isArray(patients)) listas.push(patients); } catch (_) {}
    for (const lista of listas) {
      const p = lista.find(x => txt(x?.id_paciente || x?.id) === id);
      if (p) return p;
    }
    return null;
  }
  // La ficha vinculada por ID es la fuente principal. Nunca concatenar
  // p.nombre (que puede estar completo) con p.apellidos.
  function nombreDestinatario(c) {
    const p = pacienteVinculado(c);
    if (p) {
      const nombres = txt(p.nombres || p.primer_nombre);
      const apellidos = txt(p.apellidos || p.apellido || p.primer_apellido);
      if (nombres && apellidos) return [nombres, apellidos].join(' ').replace(/\s+/g, ' ').trim();
      const completo = txt(p.nombre_completo || p.nombre || p.nombres_apellidos);
      if (completo) return completo.replace(/\s+/g, ' ').trim();
      if (nombres || apellidos) return [nombres, apellidos].filter(Boolean).join(' ');
    }
    const a = c?.atencion || {};
    return txt(a.nombre_paciente || a.paciente_nombre).replace(/\s+/g, ' ').trim();
  }
  // Identidad institucional: misma configuración de lectura usada por
  // Historia Clínica; no modifica la configuración ni el backend.
  function nombreInstitucionalResultados() {
    const cfg = window.auroConfiguracionCentro;
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      return txt(cfg.nombre_clinica || cfg.nombre_centro || cfg.nombre_comercial || cfg.razon_social) || 'Centro médico';
    }
    return 'Centro médico';
  }
  function telefonoDestinatario(c) {
    const p = pacienteVinculado(c);
    return txt(p?.telefono || p?.whatsapp || p?.celular || p?.telefono_paciente);
  }
  function invalidarEnlace() {
    if (!state.enlace) return;
    const anterior = state.enlace;
    state.enlace = '';
    if (state.mensajePersonalizado !== null) {
      state.mensajePersonalizado = state.mensajePersonalizado.split(anterior).join('[PENDIENTE DE GENERACIÓN]');
    }
    aviso('Cambió la configuración de entrega. Genere un nuevo enlace antes de enviar por WhatsApp.');
  }
  function abrirWhatsAppResultados() {
    const c = comprobarCambio();
    if (!valido(c) || !state.enlace || state.emitiendo) {
      aviso('Genere un enlace privado válido para la atención activa antes de enviar.');
      render(); return;
    }
    const telefono = telefonoDestinatario(c);
    if (!telefono) { aviso('El paciente de esta atención no tiene teléfono registrado.'); return; }
    const mensaje = state.mensajePersonalizado === null ? mensajePredeterminado() : state.mensajePersonalizado;
    if (!mensaje.includes(state.enlace) || mensaje.includes('[PENDIENTE DE GENERACIÓN]')) {
      aviso('El mensaje no contiene el enlace privado actual. Restablezca el mensaje y genere un enlace nuevo.');
      return;
    }
    if (typeof window.abrirWhatsApp !== 'function') {
      aviso('El módulo WhatsApp de Pacientes no está disponible.'); return;
    }
    window.abrirWhatsApp(telefono, mensaje);
  }
  function mensajePredeterminado() {
    const c = contexto();
    const nombre = nombreDestinatario(c);
    const saludo = nombre ? `Estimada/o ${nombre}:` : 'Estimado/a paciente:';
    return `🌸 *${nombreInstitucionalResultados()} | Resultados médicos*\n\n${saludo}\n\n✨ Sus resultados médicos se encuentran disponibles mediante un enlace privado.\n\n🔐 *Acceso seguro a sus resultados*\n🔗 [PENDIENTE DE GENERACIÓN]\n\n⏳ *Vigencia del enlace:* ${state.dias} día(s).\n🔢 *Máximo de accesos:* ${state.limite}.\n\n🛡️ Por su privacidad, no comparta este enlace con terceros.\n\n💗 Gracias por confiar en ${nombreInstitucionalResultados()}.\n*Su bienestar es nuestra prioridad.*`;
  }
  function instalarCSS() {
    if (document.getElementById('auroResultadosCSS')) return;
    const css = document.createElement('style');
    css.id = 'auroResultadosCSS';
    css.textContent = `
#auroResultadosMount{width:100%;min-width:0}#auroResultadosMount *{box-sizing:border-box}
.ar-card{background:linear-gradient(155deg,#fff 0%,#fff9fc 55%,#fdf0f7 100%);border:1px solid #ebc9dc;border-radius:22px;box-shadow:0 16px 38px rgba(115,28,80,.11),0 3px 7px rgba(115,28,80,.05);overflow:hidden;color:#292333}
.ar-head{padding:19px 21px;background:linear-gradient(125deg,#54203f,#902c68 65%,#bc568b);color:#fff;display:flex;align-items:center;gap:13px}
.ar-emblem{height:43px;width:43px;display:grid;place-items:center;border-radius:14px;background:#ffffff2a;border:1px solid #ffffff55;font-size:21px}
.ar-head h3{margin:0;font-size:18px;font-weight:900}.ar-head p{margin:4px 0 0;font-size:11px;opacity:.91}
.ar-body{padding:18px 20px;display:grid;gap:15px}.ar-meta{display:flex;gap:8px;flex-wrap:wrap}
.ar-pill{border-radius:999px;padding:6px 10px;background:#fff;border:1px solid #f0dbe6;font-size:11px;color:#75455e;font-weight:750;overflow-wrap:anywhere}
.ar-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ar-btn{border:1px solid #e6c9d8;border-radius:11px;background:#fff;color:#782d59;padding:9px 12px;font-size:11px;font-weight:850;cursor:pointer;box-shadow:0 3px 9px #782d5912}
.ar-btn:disabled{opacity:.5;cursor:not-allowed}.ar-btn:focus-visible,.ar-check:focus-visible,.ar-input:focus-visible,.ar-textarea:focus-visible{outline:3px solid #e69dc3;outline-offset:2px}
.ar-btn.primary{background:linear-gradient(135deg,#842758,#bb4382);border:0;color:#fff;box-shadow:0 7px 16px #84275830}
 .ar-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ar-actions .ar-btn{width:100%;min-height:42px;display:flex;align-items:center;justify-content:center;gap:7px;text-align:center}.ar-btn.whatsapp{background:linear-gradient(135deg,#168a4d,#20b763);border:0;color:#fff;box-shadow:0 7px 16px #168a4d30}
.ar-group{border:1px solid #eddde6;border-radius:15px;background:#fff;overflow:hidden;box-shadow:0 4px 13px #2f1f3a09}
.ar-group-head{padding:10px 13px;background:#fdf5f9;font-size:12px;font-weight:900;color:#743051;display:flex;justify-content:space-between;gap:8px}
.ar-file{display:flex;align-items:flex-start;gap:10px;padding:10px 13px;border-top:1px solid #f6edf2;cursor:pointer}.ar-file:hover{background:#fff9fc}
.ar-file-name{font-size:12px;font-weight:800;overflow-wrap:anywhere}.ar-file-meta{font-size:10px;color:#796b78;margin-top:3px}
.ar-check{accent-color:#a52c70;width:17px;height:17px;flex:none;margin-top:2px}
.ar-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.ar-field{display:grid;gap:5px;font-size:11px;font-weight:850;color:#6c3451}
.ar-input,.ar-textarea{width:100%;border:1px solid #e9ccdb;border-radius:11px;padding:10px 11px;font:inherit;font-size:12px;color:#302735;background:#fff}
.ar-textarea{min-height:124px;resize:vertical;line-height:1.5}.ar-subtitle{font-size:12px;font-weight:900;color:#6f294f}
.ar-note{font-size:11px;line-height:1.5;color:#756775}.ar-status{padding:10px 12px;border-radius:11px;background:#fff;border:1px solid #efd8e4;font-size:11px;color:#6e3555}
.ar-footer{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.ar-count{font-size:12px;font-weight:850;color:#732b51}
.ar-empty{padding:17px;background:#fff;border:1px dashed #e7bfd3;border-radius:12px;color:#75546a;font-size:12px}
@media(max-width:640px){.ar-card{border-radius:16px}.ar-head{padding:15px}.ar-body{padding:13px}.ar-fields{grid-template-columns:1fr}.ar-footer .ar-btn{width:100%}}@media(max-width:370px){.ar-actions{grid-template-columns:1fr}}
`;
    document.head.appendChild(css);
  }
  function render() {
    const el = state.contenedor;
    if (!el) return;
    const c = comprobarCambioSinRender();
    const a = c?.atencion || {};
    const habilitado = valido(c);
    const nombreVisible = nombreDestinatario(c);
    const grupos = CATEGORIAS.map(grupo => {
      const lista = state.registros.filter(r => r.categoria_documento === grupo.id);
      if (!lista.length) return '';
      const archivos = lista.map(r => `
        <label class="ar-file">
          <input class="ar-check" type="checkbox" data-res-id="${seguro(r.id_documento)}"
            ${state.seleccion.has(r.id_documento) ? 'checked' : ''}>
          <span style="min-width:0">
            <span class="ar-file-name">${seguro(r.nombre_documento)}</span>
            <span class="ar-file-meta" style="display:block">${seguro(tipo(r))} · ${r.tamano_bytes ? seguro((r.tamano_bytes / 1024).toFixed(1)) + ' KB' : 'Tamaño no disponible'}</span>
          </span>
        </label>`).join('');
      return `<div class="ar-group"><div class="ar-group-head"><span><i class="bi ${grupo.icono} me-1"></i>${seguro(grupo.nombre)}</span><span>${lista.length} archivo(s)</span></div>${archivos}</div>`;
    }).join('');
    const mensaje = state.mensajePersonalizado === null ? mensajePredeterminado() : state.mensajePersonalizado;
    el.innerHTML = `
      <section class="ar-card" aria-label="Entrega segura de resultados">
        <div class="ar-head"><div class="ar-emblem"><i class="bi bi-shield-lock"></i></div>
          <div><h3>Entrega segura de resultados</h3><p>Seleccione exactamente qué archivos podrá recibir el paciente</p></div></div>
        <div class="ar-body">
          <div class="ar-meta">
            <span class="ar-pill">Paciente: ${seguro(nombreVisible || '—')}</span>
            <span class="ar-pill">Consulta: ${seguro(c?.numeroConsulta || '—')}</span>
            <span class="ar-pill">Atención: ${seguro(c?.id || '—')}</span>
          </div>
          <div class="ar-toolbar">
            <button type="button" class="ar-btn" data-res-recargar ${!habilitado || state.cargando ? 'disabled' : ''}>Actualizar lista</button>
            <button type="button" class="ar-btn" data-res-todos ${!habilitado || !state.registros.length ? 'disabled' : ''}>Seleccionar todos</button>
            <button type="button" class="ar-btn" data-res-limpiar ${!state.seleccion.size ? 'disabled' : ''}>Limpiar selección</button>
          </div>
          <div class="ar-subtitle">Documentos disponibles por categoría</div>
          ${!habilitado ? '<div class="ar-empty">Seleccione una atención clínica válida.</div>' :
            state.registros.length ? grupos : '<div class="ar-empty">No hay archivos disponibles. Pulse Actualizar lista.</div>'}
          <div class="ar-footer"><span class="ar-count">${state.seleccion.size} de ${state.registros.length} archivo(s) seleccionado(s)</span></div>
          <div class="ar-fields">
            <label class="ar-field">Vigencia del enlace (días)<input class="ar-input" type="number" min="1" max="30" step="1" data-res-dias value="${state.dias}"></label>
            <label class="ar-field">Máximo de accesos<input class="ar-input" type="number" min="1" max="20" step="1" data-res-limite value="${state.limite}"></label>
          </div>
          <div class="ar-subtitle">Mensaje predeterminado de WhatsApp</div>
          <textarea class="ar-textarea" data-res-mensaje-texto aria-label="Mensaje para WhatsApp">${seguro(mensaje)}</textarea>
          <div class="ar-toolbar"><button type="button" class="ar-btn" data-res-restablecer>Restablecer mensaje</button></div>
          <div class="ar-actions">
            <button type="button" class="ar-btn primary" data-res-generar ${!EMISION_HABILITADA || !habilitado || state.emitiendo || !state.seleccion.size ? 'disabled' : ''}>Generar enlace privado</button>
            <button type="button" class="ar-btn whatsapp" data-res-whatsapp ${!habilitado || !state.enlace || state.emitiendo ? 'disabled' : ''}><i class="bi bi-whatsapp" aria-hidden="true"></i> Enviar por WhatsApp</button>
          </div>
          <div class="ar-status" data-res-mensaje role="status">${seguro(state.aviso || 'Seleccione los documentos y genere un enlace privado.')}</div>
          <div class="ar-note">Un enlace podrá contener varios archivos individuales. No se fusionan PDF ni se publican enlaces directos de Drive.</div>
        </div>
      </section>`;
  }
  function cambiarSeleccion(input) {
    const c = comprobarCambio();
    const id = txt(input.dataset.resId);
    if (!valido(c) || !state.registros.some(r => r.id_documento === id)) {
      render(); return;
    }
    if (input.checked && state.seleccion.size >= 30) { aviso('Máximo permitido: 30 documentos por entrega.'); render(); return; }
     if (input.checked !== state.seleccion.has(id)) invalidarEnlace();
    if (input.checked) state.seleccion.add(id);
    else state.seleccion.delete(id);
    render();
  }
  function endpointResultados() {
    const base = txt(window.API_URL || window.AUROSANAX_APPS_SCRIPT_URL ||
      document.getElementById('appsScriptUrl')?.value);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/(exec|dev)(?:[?#]|$)/.test(base)) {
      throw new Error('La URL de Apps Script no está configurada.');
    }
    return base;
  }
  // Presentación del enlace: no cambia el token ni los permisos del servidor.
  function enlacePublicoResultados(enlaceServidor) {
    let url;
    try { url = new URL(txt(enlaceServidor)); }
    catch (_) { throw new Error('El servidor devolvió un enlace inválido.'); }

    if (url.protocol !== 'https:') throw new Error('El enlace no es HTTPS.');
    if (url.username || url.password || url.hash) throw new Error('El enlace contiene componentes no permitidos.');
    if (url.hostname === 'iasyn.fyi' && url.pathname === '/resultados.html') {
      const token = url.searchParams.get('token') || '';
      if (!/^[A-Za-z0-9_-]{40,64}$/.test(token))
        throw new Error('El enlace público no contiene un token válido.');
      // El backend vigente devuelve el portal Apps Script, no una página web externa.
      throw new Error('El backend devolvió un portal externo no configurado para esta emisión.');
    }
    if (url.hostname === 'script.google.com' &&
        /^\/macros\/s\/[^/]+\/(exec|dev)$/.test(url.pathname) &&
        url.searchParams.get('portal') === 'resultados') {
      const token = url.searchParams.get('token') || '';
      if (!/^[A-Za-z0-9_-]{40,64}$/.test(token))
        throw new Error('No se encontró un token compatible para el portal público.');
      const backend = new URL(endpointResultados());
      if (url.origin !== backend.origin || url.pathname !== backend.pathname ||
          backend.pathname.endsWith('/dev'))
        throw new Error('El enlace no corresponde al despliegue EIC validado.');
      return url.toString();
    }
    throw new Error('El servidor no devolvió un enlace compatible con el portal público.');
  }
  function tokenAdministrador() {
    const token = txt(sessionStorage.getItem('aurosanax_seguridad_token'));
    const expira = Number(sessionStorage.getItem('aurosanax_seguridad_expira_en') || 0);
    if (!token || (expira && Date.now() >= expira)) throw new Error('Sesión vencida. Inicie sesión nuevamente.');
    return token;
  }
  async function emitirEnlace() {
    if (state.emitiendo) return;
    if (!EMISION_HABILITADA) { aviso('Emisión protegida: validar y publicar primero el backend EIC y el portal de resultados.'); render(); return; }
    const c = comprobarCambio();
    if (!valido(c)) { aviso('Seleccione una atención clínica válida.'); return; }
    const ids = seleccionActual();
    if (!ids.length || ids.length > 30) { aviso('Seleccione entre 1 y 30 documentos.'); return; }
    if (!Number.isInteger(state.dias) || state.dias < 1 || state.dias > 30 ||
        !Number.isInteger(state.limite) || state.limite < 1 || state.limite > 20) {
      aviso('Revise los límites de vigencia y accesos.'); return;
    }
    let url, sesion;
    try { url = endpointResultados(); sesion = tokenAdministrador(); }
    catch (e) { aviso(e.message); return; }
    const atencion = txt(c.id), paciente = txt(c.idPaciente);
    const historia = txt(c.idHistoria), diasEmitidos = state.dias, limiteEmitido = state.limite;
    const idsEmitidos = ids.join('\u001f');
    state.emitiendo = true;
    invalidarEnlace();
    state.enlace = '';
    aviso('Generando enlace privado...');
    render();
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({accion:'auroEntregaGenerarResultados',data:{
          session_token:sesion, id_atencion:atencion, id_paciente:paciente,
          ids_documentos:ids, dias_vigencia:state.dias, limite_accesos:state.limite
        }})
      });
      if (!respuesta.ok) throw new Error('El servidor respondió HTTP ' + respuesta.status);
      const r = await respuesta.json();
      if (!r || r.success !== true || !/^https:\/\/(?:script\.google\.com\/|iasyn\.fyi\/resultados\.html\?token=)/.test(txt(r.enlace))) {
        throw new Error(txt(r?.message) || 'El servidor no confirmó un enlace válido.');
      }
      const actual = comprobarCambio();
      if (!valido(actual) || txt(actual.id) !== atencion || txt(actual.idPaciente) !== paciente ||
          txt(actual.idHistoria) !== historia || state.dias !== diasEmitidos ||
          state.limite !== limiteEmitido || seleccionActual().join('\u001f') !== idsEmitidos) {
        aviso('Enlace emitido, pero cambió la atención. No se muestra por seguridad.');
        return;
      }
      const enlacePublico = enlacePublicoResultados(r.enlace);
      state.enlace = enlacePublico;
      // Reemplaza el enlace anterior al emitir de nuevo, sin dejar un token obsoleto.
      let mensaje = state.mensajePersonalizado === null ? mensajePredeterminado() : state.mensajePersonalizado;
      if (!mensaje.includes('[PENDIENTE DE GENERACIÓN]')) {
        mensaje = mensaje.replace(/https:\/\/(?:iasyn\.fyi\/resultados\.html\?token=[A-Za-z0-9_-]+|script\.google\.com\/macros\/s\/[^\s]+?\?[^\s]*portal=resultados[^\s]*)/g,
          '[PENDIENTE DE GENERACIÓN]');
      }
      if (!mensaje.includes('[PENDIENTE DE GENERACIÓN]')) mensaje = mensajePredeterminado();
      state.mensajePersonalizado = mensaje.replace(/\[PENDIENTE DE GENERACIÓN\]/g, enlacePublico);
      aviso('Enlace privado generado. Cópielo del mensaje de WhatsApp. Caduca: ' + txt(r.vence_en));
    } catch (e) { aviso('No se pudo emitir el enlace: ' + txt(e.message || e)); }
    finally { state.emitiendo = false; render(); }
  }
  function instalarEventos(el) {
    el.addEventListener('click', event => {
      if (event.target.closest('[data-res-recargar]')) { cargar(); return; }
      if (event.target.closest('[data-res-todos]')) {
        if (!valido(comprobarCambio())) return;
        if (state.registros.slice(0, 30).some(r => !state.seleccion.has(r.id_documento))) invalidarEnlace();
        state.registros.slice(0, 30).forEach(r => state.seleccion.add(r.id_documento));
         if (state.registros.length > 30) aviso('Máximo permitido: 30 documentos por entrega.');
        render(); return;
      }
      if (event.target.closest('[data-res-limpiar]')) {
        if (state.seleccion.size) invalidarEnlace();
        state.seleccion.clear(); render(); return;
      }
      if (event.target.closest('[data-res-generar]')) { emitirEnlace(); return; }
      if (event.target.closest('[data-res-whatsapp]')) { abrirWhatsAppResultados(); return; }
      if (event.target.closest('[data-res-restablecer]')) {
        state.mensajePersonalizado = null;
        if (state.enlace) state.mensajePersonalizado = mensajePredeterminado().replace('[PENDIENTE DE GENERACIÓN]', state.enlace);
        render();
      }
    });
    el.addEventListener('change', event => {
      const checkbox = event.target.closest('input[data-res-id]');
      if (checkbox) { cambiarSeleccion(checkbox); return; }
      const dias = event.target.closest('[data-res-dias]');
      if (dias) {
        const nuevo = Math.max(1, Math.min(30, parseInt(dias.value, 10) || 7));
        if (nuevo !== state.dias) { invalidarEnlace(); state.mensajePersonalizado = null; }
        state.dias = nuevo;
        render(); return;
      }
      const limite = event.target.closest('[data-res-limite]');
      if (limite) {
        const nuevo = Math.max(1, Math.min(20, parseInt(limite.value, 10) || 5));
        if (nuevo !== state.limite) { invalidarEnlace(); state.mensajePersonalizado = null; }
        state.limite = nuevo;
        render();
      }
    });
    el.addEventListener('input', event => {
      if (event.target.matches('[data-res-mensaje-texto]')) {
        state.mensajePersonalizado = event.target.value;
      }
    });
  }
  function inicializar(opciones) {
    const id = txt(opciones?.contenedor) || 'auroResultadosMount';
    const el = document.getElementById(id) || puente()?.asegurarContenedor?.();
    if (!el) throw new Error('No se encontró el contenedor de Resultados.');
    instalarCSS();
    if (state.contenedor !== el) {
      state.contenedor = el;
      instalarEventos(el);
    }
    render();
    cargar();
    return { version: VERSION, listo: true, integrado: true };
  }
  function iniciarAutomatico() {
    if (!puente()) return;
    try { inicializar({contenedor: 'auroResultadosMount'}); }
    catch (error) { console.warn('RESULTADOS: esperando contenedor.', error.message); }
  }
  function refrescarSiMontado() {
    if (state.contenedor) cargar();
    else iniciarAutomatico();
  }
  window.addEventListener('aurosanax:documentos-actualizados', event => {
    const c = comprobarCambio();
    if (valido(c) && txt(event.detail?.id_atencion) === txt(c.id)) refrescarSiMontado();
  });
  ['aurosanax:atencion-cambiada', 'aurosanax:atencion-seleccionada',
   'aurosanax:atencion-actualizada', 'aurosanax:atencion-limpiada',
   'aurosanax:paciente-cambiado', 'aurosanax:paciente-seleccionado',
   'aurosanax:historia-nueva'].forEach(nombre => {
    window.addEventListener(nombre, () => {
      comprobarCambio();
      refrescarSiMontado();
    });
  });
  document.addEventListener('click', event => {
    const boton = event.target?.closest?.('.clinical-tabs button');
    if (boton?.getAttribute('onclick')?.includes('hc_docs')) {
      setTimeout(iniciarAutomatico, 130);
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarAutomatico);
  } else {
    iniciarAutomatico();
  }
  window.auroResultados = Object.freeze({
    version: VERSION, inicializar, cargar, limpiar, seleccionActual,
    estado: () => ({
      id_atencion: state.idAtencion, id_paciente: state.idPaciente,
      seleccionados: state.seleccion.size, documentos: state.registros.length,
      modo: EMISION_HABILITADA ? 'EMISION_VALIDADA' : 'VISTA_PREVIA_SEGURA', emisionHabilitada: EMISION_HABILITADA
    })
  });
})();
