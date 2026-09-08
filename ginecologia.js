/* ============================================================
   IASYN CLINICAL ERP
   MÓDULO: GINECOLOGÍA
   Archivo: ginecologia.js
   Versión: 1.0.0
   Fecha: 2026-07-17

   - Trabaja por id_atencion.
   - Guarda síntomas, examen y estudios en JSON.
   - No duplica Diagnóstico, Plan ni antecedentes históricos.
============================================================ */

(function () {
  'use strict';

  const MODULO = 'IASYN_GINECOLOGIA_V1';
  const STORAGE_KEY = 'iasyn_ginecologia_local_v1';
  const VERSION = '20260720_ginecologia_v1_5_sintomas_movidos_anamnesis';

  let registroActual = null;
  let cargando = false;
  let guardando = false;
  let ultimoIdAtencion = '';
  let contextoSeleccionado = null;

  const $ = (id) => document.getElementById(id);
  const txt = (v) => String(v ?? '').trim();
  const now = () => new Date().toISOString();

  function fechaHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function horaActual() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function idTemporal(prefijo) {
    return `${prefijo}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  }

  function parseJSON(v, defecto) {
    if (v == null || v === '') return defecto;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); }
    catch (e) { console.warn(MODULO, 'JSON inválido', e); return defecto; }
  }

  function esc(v) {
    return txt(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function getValue(id) {
    const el = $(id);
    if (!el) return '';
    return el.type === 'checkbox' ? !!el.checked : txt(el.value);
  }

  function setValue(id, v) {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : v;
  }

  function setText(id, v, vacio='—') {
    const el = $(id);
    if (el) el.textContent = txt(v) || vacio;
  }

  function usuarioActual() {
    try {
      if (typeof window.obtenerUsuarioActual === 'function') {
        const u = window.obtenerUsuarioActual();
        return txt(u?.nombre || u?.usuario || u?.email || u);
      }
      const u = window.usuarioActualERP || window.usuarioActual || window.currentUser || {};
      return txt(u.nombre || u.nombre_completo || u.usuario || u.email) || 'Usuario ERP';
    } catch (_) { return 'Usuario ERP'; }
  }

  function leerAtencionesLocales() {
    for (const llave of ['aurosanax_atenciones_local_v1','aurosanax_atenciones','atenciones']) {
      try {
        const arr = JSON.parse(localStorage.getItem(llave) || '[]');
        if (Array.isArray(arr) && arr.length) return arr;
      } catch (_) {}
    }
    return [];
  }

  function leerIdAtencionDesdeDOM() {
    const selectores = [
      '[data-id-atencion].active', '[data-id-atencion][aria-selected="true"]',
      '[data-id-atencion].selected', 'tr[data-id-atencion].table-active',
      '[data-atencion-id].active', '[data-atencion-id][aria-selected="true"]',
      '#idAtencionActiva', '#atencionActivaId', '[name="id_atencion"]'
    ];

    for (const selector of selectores) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const id = txt(
        el.dataset?.idAtencion || el.dataset?.atencionId ||
        el.value || el.getAttribute('data-id-atencion') || el.getAttribute('data-atencion-id')
      );
      if (id) return id;
    }
    return '';
  }

  function normalizarDetalleAtencion(detalle) {
    if (!detalle || typeof detalle !== 'object') return null;
    const candidato = detalle.atencion || detalle.data || detalle.registro || detalle;
    if (!candidato || typeof candidato !== 'object') return null;
    const id = txt(candidato.id_atencion || candidato.id || detalle.id_atencion || detalle.id);
    return id ? {...candidato, id_atencion:id} : null;
  }

  function resolverAtencionActiva() {
    if (contextoSeleccionado && txt(contextoSeleccionado.id_atencion || contextoSeleccionado.id)) {
      return contextoSeleccionado;
    }

    for (const obj of [window.atencionActiva, window.atencionActual, window.currentAtencion, window.AURO_ATENCION_ACTIVA]) {
      if (obj && typeof obj === 'object' && txt(obj.id_atencion || obj.id)) return obj;
    }

    const id = [
      window.atencionActivaId,
      window.idAtencionActiva,
      window.currentAtencionId,
      sessionStorage.getItem('aurosanax_id_atencion_activa'),
      sessionStorage.getItem('aurosanax_id_atencion_seleccionada'),
      localStorage.getItem('aurosanax_id_atencion_activa'),
      localStorage.getItem('aurosanax_id_atencion_seleccionada'),
      localStorage.getItem('id_atencion_activa'),
      leerIdAtencionDesdeDOM()
    ].map(txt).find(Boolean) || '';

    if (id) {
      const encontrada = leerAtencionesLocales().find(a => txt(a.id_atencion || a.id) === id);
      return encontrada || { id_atencion:id };
    }

    return leerAtencionesLocales().find(a => {
      const e = txt(a.estado_atencion || a.estado).toLowerCase();
      return ['abierta','en atención','en atencion','activa'].includes(e);
    }) || null;
  }

  function resolverPacienteActivo(atencion) {
    for (const obj of [window.pacienteActivo, window.pacienteActual, window.currentPatient, window.selectedPatient, window.AURO_PACIENTE_ACTIVO]) {
      if (obj && typeof obj === 'object' && txt(obj.id_paciente || obj.id)) return obj;
    }

    const id = txt(
      atencion?.id_paciente || window.idPacienteActivo ||
      sessionStorage.getItem('aurosanax_id_paciente_activo') ||
      localStorage.getItem('aurosanax_id_paciente_activo') ||
      localStorage.getItem('selectedPatientId')
    );

    for (const lista of [window.pacientes, window.pacientesData, window.listaPacientes]) {
      if (!Array.isArray(lista)) continue;
      const p = lista.find(x => txt(x.id_paciente || x.id) === id);
      if (p) return p;
    }
    return id ? {id_paciente:id} : null;
  }

  function nombrePaciente(p, a) {
    return txt(p?.nombre_completo || `${txt(p?.nombres || p?.nombre)} ${txt(p?.apellidos)}`.trim() || a?.nombre_paciente || a?.paciente_nombre);
  }

  function resolverHistoria(a,p) {
    return txt(a?.id_historia || window.idHistoriaActual || window.historiaActiva?.id_historia || window.historiaActual?.id_historia || p?.id_historia || sessionStorage.getItem('aurosanax_id_historia_activa') || localStorage.getItem('aurosanax_id_historia_activa'));
  }

  function resolverMedico(a) {
    const id = txt(a?.id_medico || window.idMedicoActual || window.medicoActual?.id_medico || window.usuarioActualERP?.id_medico);
    let nombre = txt(a?.nombre_medico || a?.medico_nombre || window.medicoActual?.nombre_completo || window.medicoActual?.nombre);
    for (const lista of [window.medicos, window.medicosActivos, window.listaMedicos]) {
      if (!Array.isArray(lista)) continue;
      const m = lista.find(x => txt(x.id_medico || x.id || x.codigo) === id);
      if (m) {
        nombre = nombre || txt(m.nombre_completo || `${txt(m.nombres || m.nombre)} ${txt(m.apellidos)}`.trim());
        break;
      }
    }
    return {id_medico:id, nombre_medico:nombre};
  }

  function contextoActual() {
    const atencion = resolverAtencionActiva();
    const paciente = resolverPacienteActivo(atencion);
    const medico = resolverMedico(atencion);
    return {
      atencion, paciente, medico,
      id_atencion:txt(atencion?.id_atencion || atencion?.id),
      numero_consulta:atencion?.numero_consulta || atencion?.consulta || '',
      id_paciente:txt(atencion?.id_paciente || paciente?.id_paciente || paciente?.id),
      nombre_paciente:nombrePaciente(paciente,atencion),
      id_historia:resolverHistoria(atencion,paciente),
      id_medico:medico.id_medico,
      nombre_medico:medico.nombre_medico,
      fecha_atencion:txt(atencion?.fecha_atencion || atencion?.fecha) || fechaHoy(),
      hora_atencion:txt(atencion?.hora_atencion || atencion?.hora) || horaActual(),
      tipo_atencion:txt(atencion?.tipo_atencion)
    };
  }

  function normalizar(r={}) {
    return {
      id_ginecologia:txt(r.id_ginecologia || r.id),
      id_atencion:txt(r.id_atencion), numero_consulta:r.numero_consulta || '',
      id_paciente:txt(r.id_paciente), nombre_paciente:txt(r.nombre_paciente || r.paciente_nombre),
      id_historia:txt(r.id_historia), id_medico:txt(r.id_medico),
      nombre_medico:txt(r.nombre_medico || r.medico_nombre),
      fecha_atencion:txt(r.fecha_atencion || r.fecha), hora_atencion:txt(r.hora_atencion || r.hora),
      tipo_atencion:txt(r.tipo_atencion), fum_actual:txt(r.fum_actual || r.fur || r.fum),
      motivo_ginecologico:txt(r.motivo_ginecologico || r.motivo_consulta),
      sintomas_json:parseJSON(r.sintomas_json,{}),
      examen_ginecologico_json:parseJSON(r.examen_ginecologico_json,{}),
      estudios_ginecologicos_json:parseJSON(r.estudios_ginecologicos_json,{}),
      impresion_ginecologica:txt(r.impresion_ginecologica), observaciones:txt(r.observaciones),
      estado_registro:txt(r.estado_registro || r.estado || 'Activo'),
      creado_en:r.creado_en || '', actualizado_en:r.actualizado_en || '', creado_por:txt(r.creado_por)
    };
  }

  function leerLocales() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(arr) ? arr.map(normalizar) : [];
    } catch (_) { return []; }
  }

  function guardarLocales(lista) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lista || [])); }
    catch (e) { console.warn(MODULO, 'No se pudo guardar respaldo local', e); }
  }

  function actualizarLocal(registro) {
    const lista = leerLocales();
    const i = lista.findIndex(x =>
      (txt(registro.id_ginecologia) && txt(x.id_ginecologia) === txt(registro.id_ginecologia)) ||
      (txt(registro.id_atencion) && txt(x.id_atencion) === txt(registro.id_atencion))
    );
    if (i >= 0) lista[i] = normalizar(registro); else lista.push(normalizar(registro));
    guardarLocales(lista);
  }

  async function listarRemotos() {
    if (typeof window.API_URL === 'undefined' || !txt(window.API_URL)) return [];
    const r = await fetch(`${window.API_URL}?accion=listarGinecologia&_=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  }

  async function enviarRemoto(registro, editar) {
    if (typeof window.API_URL === 'undefined' || !txt(window.API_URL)) throw new Error('API_URL no está definida en index.html');
    await fetch(window.API_URL, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({accion:editar ? 'editarGinecologia' : 'guardarGinecologia', data:registro})
    });
  }

  function notificar(mensaje,tipo='success') {
    if (typeof window.mostrarToast === 'function') return window.mostrarToast(mensaje,tipo);
    if (typeof window.showToast === 'function') return window.showToast(mensaje,tipo);
    const box = $('ginEstadoModulo');
    if (!box) return;
    box.className = `gin-status ${tipo}`;
    box.textContent = mensaje;
    box.style.display = 'block';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.style.display='none',4500);
  }

  function inyectarEstilos() {
    if ($('auroGinecologiaCSS')) return;
    const s = document.createElement('style');
    s.id='auroGinecologiaCSS';
    s.textContent=`
      #ginecologia .gin-shell{display:grid;gap:16px}
      #ginecologia .gin-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:14px;border-bottom:1px solid #e5e7eb}
      #ginecologia .gin-head h4{margin:0;font-weight:900} #ginecologia .gin-head p{margin:4px 0 0;color:#6b7280}
      #ginecologia .gin-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      #ginecologia .gin-context{border:1px solid #fbcfe8;background:linear-gradient(135deg,#fff7fb,#fff);border-radius:20px;padding:14px}
      #ginecologia .gin-context-grid,#ginecologia .gin-read-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      #ginecologia .gin-context-item{border:1px solid #e5e7eb;background:#fff;border-radius:14px;padding:10px;min-width:0}
      #ginecologia .gin-context-item small{display:block;color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.05em;font-weight:850;margin-bottom:3px}
      #ginecologia .gin-context-item b{display:block;font-size:13px;word-break:break-word}
      #ginecologia .gin-alert{display:none;border-radius:14px;padding:11px 12px;font-size:14px}.gin-alert.show{display:block!important}
      #ginecologia .gin-alert.warning{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}
      #ginecologia .gin-panel{border:1px solid #e5e7eb;border-radius:20px;padding:16px;background:#fff}
      #ginecologia .gin-panel-title{font-weight:900;color:#111827;margin-bottom:12px;display:flex;align-items:center;gap:8px}
      #ginecologia .gin-panel-title i{color:#8b1e5a}
      #ginecologia .gin-read{border:1px dashed #cbd5e1;background:#f8fafc;border-radius:14px;padding:10px}
      #ginecologia .gin-read small{display:block;color:#64748b;font-weight:800;font-size:11px}
      #ginecologia .gin-read b{display:block;margin-top:3px;font-size:13px}
      #ginecologia .gin-check-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      #ginecologia .gin-check{border:1px solid #e5e7eb;border-radius:14px;padding:9px 10px;display:flex;align-items:center;gap:8px;background:#fff;cursor:pointer}
      #ginecologia .gin-check:hover{border-color:#f9a8d4;background:#fff7fb}
      #ginecologia .gin-check input{width:17px;height:17px;accent-color:#8b1e5a}
      #ginecologia .gin-status{display:none;border-radius:14px;padding:11px 12px;font-weight:700}
      #ginecologia .gin-status.success{background:#dcfce7;border:1px solid #bbf7d0;color:#166534}
      #ginecologia .gin-status.error{background:#fee2e2;border:1px solid #fecaca;color:#991b1b}
      #ginecologia .gin-status.info{background:#dbeafe;border:1px solid #bfdbfe;color:#1e40af}
      #ginecologia .gin-last-update{font-size:12px;color:#64748b;text-align:right;font-weight:700}
      #ginecologia .gin-actions-block{display:grid;gap:7px;justify-items:end}
      #ginecologia .gin-record-state{font-size:12px;color:#475569;font-weight:750;text-align:right;line-height:1.35}
      #ginecologia .gin-record-state strong{color:#111827}
      #ginecologia .gin-required{color:#dc2626}
      #ginecologia .gin-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      #ginecologia .gin-footer-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      @media(max-width:1100px){#ginecologia .gin-context-grid,#ginecologia .gin-read-grid{grid-template-columns:repeat(2,1fr)}#ginecologia .gin-check-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:760px){#ginecologia .gin-head{display:block}#ginecologia .gin-actions-block{justify-items:start;margin-top:12px}#ginecologia .gin-actions{justify-content:flex-start}#ginecologia .gin-record-state{text-align:left}#ginecologia .gin-context-grid,#ginecologia .gin-read-grid{grid-template-columns:1fr}#ginecologia .gin-check-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:460px){#ginecologia .gin-check-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function check(id,label) {
    return `<label class="gin-check"><input id="${id}" type="checkbox"><span>${esc(label)}</span></label>`;
  }

  function renderizar() {
    const sec = $('ginecologia');
    if (!sec) { console.warn(MODULO,'No existe #ginecologia'); return false; }
    inyectarEstilos();
    sec.innerHTML=`
      <div class="cardx p-4 gin-shell">
        <div class="gin-head">
          <div><h4><i class="bi bi-gender-female me-2"></i>Ginecología</h4><p>Registro por atención. Diagnóstico y Plan se manejan en sus módulos independientes.</p></div>
          <div class="gin-actions-block">
            <div class="gin-actions">
              <button type="button" class="btn-soft" id="ginBtnRecargar"><i class="bi bi-arrow-clockwise me-1"></i>Recargar</button>
              <button type="button" class="btn-auro" id="ginBtnGuardar"><i class="bi bi-save me-1"></i>Guardar ginecología</button>
            </div>
            <div id="ginEstadoRegistroSuperior" class="gin-record-state">Consulta — · Sin registro de Ginecología</div>
          </div>
        </div>
        <div class="module-patient-card" data-module-patient="Ginecología"></div>
        <div id="ginAlertaAtencion" class="gin-alert warning"><i class="bi bi-exclamation-triangle me-1"></i>Debe seleccionar una paciente e iniciar una atención antes de registrar Ginecología.</div>
        <div class="gin-context"><div class="gin-context-grid">
          <div class="gin-context-item"><small>Paciente</small><b id="ginCtxPaciente">—</b></div>
          <div class="gin-context-item"><small>Atención</small><b id="ginCtxAtencion">—</b></div>
          <div class="gin-context-item"><small>Consulta</small><b id="ginCtxConsulta">—</b></div>
          <div class="gin-context-item"><small>Médico</small><b id="ginCtxMedico">—</b></div>
        </div></div>
        <div id="ginEstadoModulo" class="gin-status"></div>

        <div class="gin-panel">
          <div class="gin-panel-title"><i class="bi bi-journal-medical"></i>Antecedentes ginecológicos — solo lectura</div>
          <div class="gin-read-grid">
            <div class="gin-read"><small>Menarquia</small><b id="ginAntMenarquia">—</b></div>
            <div class="gin-read"><small>Menacme</small><b id="ginAntMenacme">—</b></div>
            <div class="gin-read"><small>Menopausia</small><b id="ginAntMenopausia">—</b></div>
            <div class="gin-read"><small>Vida sexual activa</small><b id="ginAntVidaSexual">—</b></div>
            <div class="gin-read"><small>Planificación familiar</small><b id="ginAntPlanificacion">—</b></div>
            <div class="gin-read"><small>Terapia hormonal</small><b id="ginAntTerapiaHormonal">—</b></div>
            <div class="gin-read"><small>Infecciones vulvovaginales</small><b id="ginAntInfecciones">—</b></div>
            <div class="gin-read"><small>Enfermedades de transmisión sexual (ETS)</small><b id="ginAntEts">—</b></div>
            <div class="gin-read"><small>Último PAP</small><b id="ginAntPap">—</b></div>
            <div class="gin-read"><small>Colposcopía</small><b id="ginAntColpo">—</b></div>
            <div class="gin-read"><small>Mamografía</small><b id="ginAntMamografia">—</b></div>
            <div class="gin-read"><small>Eco mamario</small><b id="ginAntEcoMamario">—</b></div>
            <div class="gin-read"><small>Densitometría ósea</small><b id="ginAntDensitometria">—</b></div>
          </div>
        </div>

        <div class="gin-panel"><div class="gin-panel-title"><i class="bi bi-chat-square-text"></i>Motivo y datos de la consulta</div>
          <div class="row g-3">
            <div class="col-md-3"><label class="form-label fw-bold">FUM actual</label><input id="ginFumActual" type="date" class="form-control"></div>
            <div class="col-md-3"><label class="form-label fw-bold">Tipo de atención</label><select id="ginTipoAtencion" class="form-select"><option value="">Seleccionar</option><option>Primera consulta</option><option>Control</option><option>Urgencia</option><option>Seguimiento</option><option>Teleconsulta</option></select></div>
            <div class="col-md-6"><label class="form-label fw-bold">Motivo ginecológico <span class="gin-required">*</span></label><textarea id="ginMotivo" class="form-control" rows="2"></textarea></div>
          </div>
        </div>

        <div class="gin-panel"><div class="gin-panel-title"><i class="bi bi-clipboard2-pulse"></i>Examen ginecológico</div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label fw-bold">Genitales externos</label><textarea id="ginExGenitales" class="form-control" rows="2"></textarea></div>
            <div class="col-md-6"><label class="form-label fw-bold">Especuloscopía</label><textarea id="ginExEspeculo" class="form-control" rows="2"></textarea></div>
            <div class="col-md-6"><label class="form-label fw-bold">Tacto vaginal bimanual</label><textarea id="ginExTacto" class="form-control" rows="2"></textarea></div>
            <div class="col-md-6"><label class="form-label fw-bold">Examen mamario</label><textarea id="ginExMamas" class="form-control" rows="2"></textarea></div>
            <div class="col-md-12"><label class="form-label fw-bold">Otros hallazgos</label><textarea id="ginExOtros" class="form-control" rows="2"></textarea></div>
          </div>
        </div>

        <div class="gin-panel"><div class="gin-panel-title"><i class="bi bi-file-earmark-medical"></i>Estudios ginecológicos de esta atención</div>
          <div class="row g-3">
            <div class="col-md-4"><label class="form-label fw-bold">Citología / PAP</label><select id="ginEstPapEstado" class="form-select"><option value="">No registrado</option><option>No indicado</option><option>Solicitado</option><option>Tomado</option><option>Resultado disponible</option></select></div>
            <div class="col-md-4"><label class="form-label fw-bold">Colposcopía</label><select id="ginEstColpoEstado" class="form-select"><option value="">No registrado</option><option>No indicada</option><option>Solicitada</option><option>Realizada</option><option>Resultado disponible</option></select></div>
            <div class="col-md-4"><label class="form-label fw-bold">Ecografía ginecológica</label><select id="ginEstEcoEstado" class="form-select"><option value="">No registrado</option><option>No indicada</option><option>Solicitada</option><option>Realizada</option><option>Resultado disponible</option></select></div>
            <div class="col-md-6"><label class="form-label fw-bold">HPV / genotipificación</label><select id="ginEstHpvEstado" class="form-select"><option value="">No registrado</option><option>No indicada</option><option>Solicitada</option><option>Tomada</option><option>Resultado disponible</option></select></div>
            <div class="col-md-6"><label class="form-label fw-bold">Biopsia / patología</label><select id="ginEstBiopsiaEstado" class="form-select"><option value="">No registrado</option><option>No indicada</option><option>Solicitada</option><option>Tomada</option><option>Enviada a patología</option><option>Resultado disponible</option></select></div>
            <div class="col-md-12"><label class="form-label fw-bold">Resultados o hallazgos relevantes</label><textarea id="ginEstResultados" class="form-control" rows="3"></textarea></div>
          </div>
        </div>

        <div class="gin-panel"><div class="gin-panel-title"><i class="bi bi-card-text"></i>Impresión ginecológica</div>
          <div class="row g-3">
            <div class="col-md-12"><label class="form-label fw-bold">Impresión clínica ginecológica</label><textarea id="ginImpresion" class="form-control" rows="3" placeholder="El diagnóstico CIE-10 se registra en Diagnósticos."></textarea></div>
            <div class="col-md-12"><label class="form-label fw-bold">Observaciones</label><textarea id="ginObservaciones" class="form-control" rows="3"></textarea></div>
          </div>
        </div>

        <div class="gin-footer">
          <div id="ginEstadoRegistroInferior" class="gin-record-state">Consulta — · Sin registro de Ginecología</div>
          <div class="gin-footer-actions">
            <button type="button" class="btn-soft" id="ginBtnRecargarInferior"><i class="bi bi-arrow-clockwise me-1"></i>Recargar</button>
            <button type="button" class="btn-auro" id="ginBtnGuardarInferior"><i class="bi bi-save me-1"></i>Guardar ginecología</button>
          </div>
        </div>
      </div>`;

    $('ginBtnGuardar')?.addEventListener('click',guardar);
    $('ginBtnGuardarInferior')?.addEventListener('click',guardar);

    const recargarRegistro = () => {
      if (confirm('¿Desea restablecer la información guardada de esta consulta? Se perderán los cambios no guardados en Ginecología.')) {
        cargar(true);
      }
    };

    $('ginBtnRecargar')?.addEventListener('click',recargarRegistro);
    $('ginBtnRecargarInferior')?.addEventListener('click',recargarRegistro);
    actualizarEstadoRegistro();
    return true;
  }

  /*
    COMPATIBILIDAD DE DATOS HISTÓRICOS IASYN:
    El literal AUROSANAX_ANT_GINECO_OBS_V1:: se conserva exclusivamente para
    leer antecedentes ya serializados con ese marcador. No es una conexión,
    endpoint, Spreadsheet ID ni recurso de AUROSANAX PRUEBA.
  */
  const ANT_GINECO_OBS_MARKER = 'AUROSANAX_ANT_GINECO_OBS_V1::';

  function fechaHistoriaValor(h) {
    const raw = h?.actualizado_en || h?.fecha_registro || h?.fecha_apertura || h?.creado_en || h?.fecha || '';
    const valor = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(valor) ? valor : 0;
  }

  function historiaTieneAntecedentes(h) {
    return !!txt(
      h?.antecedentes_gineco_obstetricos_json ||
      h?.antecedentes_ginecologicos_json ||
      h?.antecedentes_gineco_obstetricos ||
      h?.antecedentes_ginecologicos
    );
  }

  function buscarHistoriaEnLista(lista, contexto) {
    if (!Array.isArray(lista) || !lista.length) return null;

    const idHistoria = txt(contexto?.id_historia);
    const idPaciente = txt(contexto?.id_paciente);

    if (idHistoria) {
      const exacta = lista.find(h => txt(h?.id_historia || h?.id) === idHistoria);
      if (exacta) return exacta;
    }

    if (!idPaciente) return null;

    return lista
      .filter(h => txt(h?.id_paciente) === idPaciente)
      .sort((a,b) => {
        const conAntecedentes = Number(historiaTieneAntecedentes(b)) - Number(historiaTieneAntecedentes(a));
        return conAntecedentes || fechaHistoriaValor(b) - fechaHistoriaValor(a);
      })[0] || null;
  }

  function leerHistoriasLocales() {
    const acumuladas = [];

    for (const llave of [
      'aurosanax_historias_clinicas_local_v1',
      'aurosanax_historias_clinicas',
      'historias_clinicas',
      'historiasClinicas'
    ]) {
      try {
        const valor = JSON.parse(localStorage.getItem(llave) || '[]');
        if (Array.isArray(valor)) acumuladas.push(...valor);
        else if (Array.isArray(valor?.data)) acumuladas.push(...valor.data);
      } catch (_) {}
    }

    return acumuladas;
  }

  async function resolverHistoriaParaAntecedentes(contexto) {
    const globales = [
      window.historiaActiva,
      window.historiaActual,
      window.currentHistoria,
      window.AURO_HISTORIA_ACTIVA
    ].filter(h => h && typeof h === 'object');

    let historia = buscarHistoriaEnLista(globales, contexto);
    if (historia) return historia;

    const listas = [
      window.historiasClinicas,
      window.historias,
      window.listaHistoriasClinicas,
      window.historiasData
    ];

    /*
      En el index principal "historiasClinicas" puede estar declarado con let
      y por eso no siempre aparece como propiedad de window. Esta comprobación
      permite utilizarlo sin producir ReferenceError.
    */
    try {
      if (typeof historiasClinicas !== 'undefined' && Array.isArray(historiasClinicas)) {
        listas.push(historiasClinicas);
      }
    } catch (_) {}

    for (const lista of listas) {
      historia = buscarHistoriaEnLista(lista, contexto);
      if (historia) break;
    }

    if (!historia) {
      historia = buscarHistoriaEnLista(leerHistoriasLocales(), contexto);
    }

    if (!historia && typeof window.API_URL !== 'undefined' && txt(window.API_URL)) {
      try {
        const respuesta = await fetch(`${window.API_URL}?accion=listarHistoriasClinicas&_=${Date.now()}`);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        const resultado = await respuesta.json();
        const remotas = Array.isArray(resultado)
          ? resultado
          : (Array.isArray(resultado?.data) ? resultado.data : []);

        historia = buscarHistoriaEnLista(remotas, contexto);

        /*
          Conserva la lista para que posteriores recargas no vuelvan a consultar
          innecesariamente el servidor.
        */
        if (remotas.length) window.historiasClinicas = remotas;
      } catch (error) {
        console.warn(MODULO, 'No se pudo consultar la historia clínica para antecedentes.', error);
      }
    }

    if (historia) {
      window.historiaActiva = historia;
      window.historiaActual = historia;
      window.currentHistoria = historia;

      const idHistoria = txt(historia.id_historia || historia.id);
      if (idHistoria) {
        window.idHistoriaActual = idHistoria;
        try { sessionStorage.setItem('aurosanax_id_historia_activa', idHistoria); } catch (_) {}
      }
    }

    return historia || {};
  }

  function parsearAntecedenteGinecoObstetrico(valor) {
    if (!valor) return {};
    if (typeof valor === 'object') return valor;

    const texto = txt(valor);
    if (!texto) return {};

    if (texto.startsWith(ANT_GINECO_OBS_MARKER)) {
      return parseJSON(texto.substring(ANT_GINECO_OBS_MARKER.length), {});
    }

    const directo = parseJSON(texto, null);
    if (directo && typeof directo === 'object') return directo;

    /*
      Compatibilidad con cadenas que incluyen un marcador o texto antes del JSON.
    */
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    if (inicio >= 0 && fin > inicio) {
      return parseJSON(texto.substring(inicio, fin + 1), {});
    }

    return {};
  }

  function valorAntecedente(valor) {
    if (valor == null) return '';
    if (typeof valor !== 'object') return txt(valor);

    return txt(
      valor.detalle ??
      valor.resultado ??
      valor.valor ??
      valor.fecha ??
      valor.descripcion ??
      valor.observacion ??
      valor.observaciones ??
      valor.texto
    );
  }

  function obstetricoPorClave(lista, claves) {
    if (!Array.isArray(lista)) return {};
    const permitidas = claves.map(x => txt(x).toLowerCase());

    return lista.find(item => {
      const clave = txt(item?.key || item?.clave || item?.nombre).toLowerCase();
      return permitidas.includes(clave);
    }) || {};
  }

  function combinarFechaResultado(valor) {
    if (!valor || typeof valor !== 'object') return valorAntecedente(valor);
    const partes = [txt(valor.fecha || valor.detalle), txt(valor.resultado)].filter(Boolean);
    return [...new Set(partes)].join(' · ');
  }

  function antecedentesDesdeSistema(historia, contexto) {
    const h = historia || {};
    const p = contexto?.paciente || window.pacienteActivo || window.pacienteActual || window.currentPatient || {};

    const raw =
      h.antecedentes_gineco_obstetricos_json ||
      h.antecedentes_ginecologicos_json ||
      h.antecedentes_gineco_obstetricos ||
      h.antecedentes_ginecologicos ||
      {};

    const data = parsearAntecedenteGinecoObstetrico(raw);
    const g = data.ginecologicos || data.ginecologia || data.gineco || data || {};
    const obstetricos = Array.isArray(data.obstetricos)
      ? data.obstetricos
      : (Array.isArray(data.obstetricia) ? data.obstetricia : []);

    const papObs = obstetricoPorClave(obstetricos, ['Pap','PAP']);

    const leer = (...valores) => {
      for (const valor of valores) {
        const resuelto = valorAntecedente(valor);
        if (resuelto) return resuelto;
      }
      return '';
    };

    return {
      menarquia:leer(g.menarquia, h.menarquia, p.menarquia),
      menacme:leer(g.menacme, g.ciclos_menstruales, g.ciclos, g.ritmo_menstrual, h.menacme, h.ciclos_menstruales),
      menopausia:leer(g.menopausia, g.estado_menopausico, h.menopausia),
      vida_sexual:leer(g.vida_sexual_activa, g.vida_sexual, g.actividad_sexual, h.vida_sexual_activa),
      planificacion:leer(g.planificacion_familiar, g.metodo_anticonceptivo, g.anticoncepcion, h.planificacion_familiar, h.metodo_anticonceptivo),
      terapia_hormonal:leer(g.terapia_hormonal, g.tratamiento_hormonal, h.terapia_hormonal),
      infecciones:leer(g.infecciones_vulvovaginales, g.infecciones_vaginales, h.infecciones_vulvovaginales),
      ets:leer(g.ets, g.enfermedades_transmision_sexual, g.infecciones_transmision_sexual, h.ets),
      pap:combinarFechaResultado(g.ultimo_pap || g.pap || papObs) || txt(h.citologia_resultado),
      colpo:combinarFechaResultado(g.colposcopia || g.colposcopia_previa) || txt(h.colposcopia),
      mamografia:combinarFechaResultado(g.mamografia || g.mamografia_previa) || txt(h.mamografia),
      eco_mamario:combinarFechaResultado(g.eco_mamario || g.ecografia_mamaria || g.eco_mamas) || txt(h.eco_mamario || h.ecografia_mamaria),
      densitometria:combinarFechaResultado(g.densitometria_osea || g.densitometria || g.dmo) || txt(h.densitometria_osea)
    };
  }

  async function cargarAntecedentes(contexto) {
    const historia = await resolverHistoriaParaAntecedentes(contexto || contextoActual());
    const a = antecedentesDesdeSistema(historia, contexto);

    setText('ginAntMenarquia',a.menarquia);
    setText('ginAntMenacme',a.menacme);
    setText('ginAntMenopausia',a.menopausia);
    setText('ginAntVidaSexual',a.vida_sexual);
    setText('ginAntPlanificacion',a.planificacion);
    setText('ginAntTerapiaHormonal',a.terapia_hormonal);
    setText('ginAntInfecciones',a.infecciones);
    setText('ginAntEts',a.ets);
    setText('ginAntPap',a.pap);
    setText('ginAntColpo',a.colpo);
    setText('ginAntMamografia',a.mamografia);
    setText('ginAntEcoMamario',a.eco_mamario);
    setText('ginAntDensitometria',a.densitometria);
  }

  function formatearFechaHora(valor) {
    if (!valor) return '—';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return txt(valor) || '—';
    return fecha.toLocaleString('es-EC', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:false
    });
  }

  function actualizarEstadoRegistro() {
    const c = contextoActual();
    const existe = !!txt(registroActual?.id_ginecologia);
    const textoBoton = existe ? 'Actualizar ginecología' : 'Guardar ginecología';
    const icono = existe ? 'bi-arrow-repeat' : 'bi-save';

    [$('ginBtnGuardar'), $('ginBtnGuardarInferior')].filter(Boolean).forEach(boton => {
      if (!guardando) boton.innerHTML = `<i class="bi ${icono} me-1"></i>${textoBoton}`;
    });

    const consulta = c.numero_consulta ? `Consulta N.º ${c.numero_consulta}` : 'Consulta —';
    const ultima = registroActual?.actualizado_en || registroActual?.creado_en || '';

    const estado = existe
      ? `<strong>${esc(consulta)}</strong> · Ginecología guardada<br>Última actualización de Ginecología: ${esc(formatearFechaHora(ultima))}`
      : `<strong>${esc(consulta)}</strong> · Sin registro de Ginecología`;

    [$('ginEstadoRegistroSuperior'), $('ginEstadoRegistroInferior')].filter(Boolean).forEach(el => {
      el.innerHTML = estado;
    });
  }

  function pintarContexto(c) {
    setText('ginCtxPaciente',c.nombre_paciente || c.id_paciente); setText('ginCtxAtencion',c.id_atencion);
    setText('ginCtxConsulta',c.numero_consulta ? `N.º ${c.numero_consulta}` : ''); setText('ginCtxMedico',c.nombre_medico || c.id_medico);
    $('ginAlertaAtencion')?.classList.toggle('show',!c.id_atencion || !c.id_paciente);
  }

  function recopilarSintomas() {
    return {
      dolor_pelvico:getValue('ginSintDolorPelvico'), sangrado_anormal:getValue('ginSintSangrado'), leucorrea:getValue('ginSintLeucorrea'), prurito:getValue('ginSintPrurito'),
      disuria:getValue('ginSintDisuria'), dispareunia:getValue('ginSintDispareunia'), amenorrea:getValue('ginSintAmenorrea'), dismenorrea:getValue('ginSintDismenorrea'),
      sensacion_masa:getValue('ginSintMasa'), sequedad_vaginal:getValue('ginSintSequedad'), incontinencia:getValue('ginSintIncontinencia'), sintomas_menopausicos:getValue('ginSintMenopausia'),
      descripcion:getValue('ginSintDescripcion')
    };
  }

  function recopilarExamen() {
    return {genitales_externos:getValue('ginExGenitales'), especuloscopia:getValue('ginExEspeculo'), tacto_vaginal_bimanual:getValue('ginExTacto'), examen_mamario:getValue('ginExMamas'), otros_hallazgos:getValue('ginExOtros')};
  }

  function recopilarEstudios() {
    return {
      pap:{estado:getValue('ginEstPapEstado')}, colposcopia:{estado:getValue('ginEstColpoEstado')}, ecografia_ginecologica:{estado:getValue('ginEstEcoEstado')},
      hpv_genotipificacion:{estado:getValue('ginEstHpvEstado')}, biopsia_patologia:{estado:getValue('ginEstBiopsiaEstado')}, resultados_relevantes:getValue('ginEstResultados')
    };
  }

  function construirRegistro() {
    const c=contextoActual(), e=registroActual || {};
    return {
      id_ginecologia:txt(e.id_ginecologia) || idTemporal('GIN'), id_atencion:c.id_atencion, numero_consulta:c.numero_consulta,
      id_paciente:c.id_paciente, nombre_paciente:c.nombre_paciente, id_historia:c.id_historia, id_medico:c.id_medico, nombre_medico:c.nombre_medico,
      fecha_atencion:c.fecha_atencion, hora_atencion:c.hora_atencion, tipo_atencion:getValue('ginTipoAtencion') || c.tipo_atencion,
      fum_actual:getValue('ginFumActual'), motivo_ginecologico:getValue('ginMotivo'),
      sintomas_json:JSON.stringify(recopilarSintomas()), examen_ginecologico_json:JSON.stringify(recopilarExamen()), estudios_ginecologicos_json:JSON.stringify(recopilarEstudios()),
      impresion_ginecologica:getValue('ginImpresion'), observaciones:getValue('ginObservaciones'), estado_registro:txt(e.estado_registro) || 'Activo',
      creado_en:e.creado_en || now(), actualizado_en:now(), creado_por:txt(e.creado_por) || usuarioActual()
    };
  }

  async function guardar() {
    if (guardando) return;
    const r=construirRegistro();
    const errores=[];
    if(!r.id_atencion) errores.push('No existe una atención activa.');
    if(!r.id_paciente) errores.push('No existe una paciente seleccionada.');
    if(!r.motivo_ginecologico) errores.push('Debe registrar el motivo ginecológico.');
    if(errores.length) return notificar(errores.join(' '),'error');

    guardando=true;
    const botones=[$('ginBtnGuardar'),$('ginBtnGuardarInferior')].filter(Boolean);
    botones.forEach(b=>{b.disabled=true;b.dataset.old=b.innerHTML;b.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';});
    try {
      const editar=!!txt(registroActual?.id_ginecologia);
      actualizarLocal(r);
      await enviarRemoto(r,editar);
      registroActual=normalizar(r);
      actualizarEstadoRegistro();
      notificar(editar ? 'Registro ginecológico actualizado correctamente.' : 'Registro ginecológico guardado correctamente.','success');
      window.dispatchEvent(new CustomEvent('aurosanax:ginecologia-guardada',{detail:{...r}}));
    } catch(e) {
      console.error(MODULO,e);
      notificar(`Se guardó respaldo local, pero no se pudo sincronizar: ${e.message}`,'error');
    } finally {
      guardando=false;
      botones.forEach(b=>{b.disabled=false;});
      actualizarEstadoRegistro();
    }
  }

  function cargarRegistro(r) {
    registroActual=r ? normalizar(r) : null;
    const x=registroActual || {}, s=x.sintomas_json || {}, e=x.examen_ginecologico_json || {}, t=x.estudios_ginecologicos_json || {};

    if (registroActual) {
      const base = contextoActual();
      pintarContexto({
        ...base,
        id_atencion:x.id_atencion || base.id_atencion,
        numero_consulta:x.numero_consulta || base.numero_consulta,
        id_paciente:x.id_paciente || base.id_paciente,
        nombre_paciente:x.nombre_paciente || base.nombre_paciente,
        id_historia:x.id_historia || base.id_historia,
        id_medico:x.id_medico || base.id_medico,
        nombre_medico:x.nombre_medico || base.nombre_medico
      });
    }
    setValue('ginFumActual',x.fum_actual); setValue('ginTipoAtencion',x.tipo_atencion); setValue('ginMotivo',x.motivo_ginecologico);
    const mapa={ginSintDolorPelvico:'dolor_pelvico',ginSintSangrado:'sangrado_anormal',ginSintLeucorrea:'leucorrea',ginSintPrurito:'prurito',ginSintDisuria:'disuria',ginSintDispareunia:'dispareunia',ginSintAmenorrea:'amenorrea',ginSintDismenorrea:'dismenorrea',ginSintMasa:'sensacion_masa',ginSintSequedad:'sequedad_vaginal',ginSintIncontinencia:'incontinencia',ginSintMenopausia:'sintomas_menopausicos'};
    Object.entries(mapa).forEach(([id,k])=>setValue(id,s[k])); setValue('ginSintDescripcion',s.descripcion);
    setValue('ginExGenitales',e.genitales_externos); setValue('ginExEspeculo',e.especuloscopia); setValue('ginExTacto',e.tacto_vaginal_bimanual); setValue('ginExMamas',e.examen_mamario); setValue('ginExOtros',e.otros_hallazgos);
    setValue('ginEstPapEstado',t.pap?.estado || t.pap || ''); setValue('ginEstColpoEstado',t.colposcopia?.estado || t.colposcopia || ''); setValue('ginEstEcoEstado',t.ecografia_ginecologica?.estado || t.ecografia_ginecologica || '');
    setValue('ginEstHpvEstado',t.hpv_genotipificacion?.estado || t.hpv_genotipificacion || ''); setValue('ginEstBiopsiaEstado',t.biopsia_patologia?.estado || t.biopsia_patologia || ''); setValue('ginEstResultados',t.resultados_relevantes);
    setValue('ginImpresion',x.impresion_ginecologica); setValue('ginObservaciones',x.observaciones);
    actualizarEstadoRegistro();
  }

  function limpiarDatosConsulta() {
    /*
      Limpia únicamente los campos propios de la consulta ginecológica.
      No modifica paciente, atención, número de consulta, médico ni antecedentes.
    */
    registroActual=null;
    ['ginFumActual','ginTipoAtencion','ginMotivo','ginSintDescripcion','ginExGenitales','ginExEspeculo','ginExTacto','ginExMamas','ginExOtros','ginEstPapEstado','ginEstColpoEstado','ginEstEcoEstado','ginEstHpvEstado','ginEstBiopsiaEstado','ginEstResultados','ginImpresion','ginObservaciones'].forEach(id=>setValue(id,''));
    ['ginSintDolorPelvico','ginSintSangrado','ginSintLeucorrea','ginSintPrurito','ginSintDisuria','ginSintDispareunia','ginSintAmenorrea','ginSintDismenorrea','ginSintMasa','ginSintSequedad','ginSintIncontinencia','ginSintMenopausia'].forEach(id=>setValue(id,false));
    actualizarEstadoRegistro();
  }

  // Alias de compatibilidad para integraciones existentes.
  const limpiarFormulario = limpiarDatosConsulta;

  async function cargar(forzar=false) {
    if(cargando) return;
    cargando=true;
    try {
      const c=contextoActual();
      const cambioAtencion = !!c.id_atencion && c.id_atencion !== ultimoIdAtencion;

      pintarContexto(c);
      await cargarAntecedentes(c);

      if(!c.id_atencion || !c.id_paciente){
        limpiarDatosConsulta();
        ultimoIdAtencion='';
        return;
      }

      if(!forzar && ultimoIdAtencion===c.id_atencion && registroActual) return;

      /*
        Al cambiar a otra atención, limpia de inmediato solo los datos de la
        consulta anterior. El contexto y los antecedentes permanecen visibles.
        Si existe un registro para la nueva atención, se carga a continuación.
      */
      if (cambioAtencion) {
        limpiarDatosConsulta();
        setValue('ginTipoAtencion',c.tipo_atencion);
      }

      ultimoIdAtencion=c.id_atencion;
      let lista=[];
      try {
        const remotos=(await listarRemotos()).map(normalizar), mapa=new Map();
        leerLocales().forEach(r=>mapa.set(txt(r.id_ginecologia) || `ATN:${txt(r.id_atencion)}`,r));
        remotos.forEach(r=>mapa.set(txt(r.id_ginecologia) || `ATN:${txt(r.id_atencion)}`,r));
        lista=Array.from(mapa.values()); guardarLocales(lista);
      } catch(e) { console.warn(MODULO,'Usando respaldo local',e); lista=leerLocales(); }
      const encontrados=lista.filter(r=>txt(r.id_atencion)===c.id_atencion).sort((a,b)=>txt(b.actualizado_en || b.creado_en).localeCompare(txt(a.actualizado_en || a.creado_en)));
      if(encontrados[0]) { cargarRegistro(encontrados[0]); notificar('Registro ginecológico de esta atención cargado.','info'); }
      else { limpiarDatosConsulta(); setValue('ginTipoAtencion',c.tipo_atencion); actualizarEstadoRegistro(); }
    } finally { cargando=false; }
  }

  function interceptarShowScreen() {
    const original=window.showScreen;
    if(typeof original!=='function' || original.__ginInterceptado) return;
    function wrapper(id){const r=original.apply(this,arguments);if(id==='ginecologia')setTimeout(()=>cargar(true),60);return r;}
    wrapper.__ginInterceptado=true; window.showScreen=wrapper;
  }

  function inicializar() {
    if(!renderizar()) return;
    interceptarShowScreen();

    /*
      COMPATIBILIDAD TEMPORAL IASYN:
      Los eventos aurosanax:* y las claves heredadas de contexto se mantienen
      mientras index y los demás módulos usen ese contrato. No conectan con
      AUROSANAX PRUEBA y no deben renombrarse en este archivo de forma aislada.
    */
    ['aurosanax:atencion-activa','aurosanax:atencion-seleccionada','aurosanax:atencion-iniciada'].forEach(nombre => {
      window.addEventListener(nombre, evento => {
        const detalle = normalizarDetalleAtencion(evento?.detail);
        if (detalle) {
          contextoSeleccionado = detalle;
          const id = txt(detalle.id_atencion || detalle.id);
          window.atencionActiva = detalle;
          window.atencionActual = detalle;
          window.idAtencionActiva = id;
          try {
            sessionStorage.setItem('aurosanax_id_atencion_activa', id);
            sessionStorage.setItem('aurosanax_id_atencion_seleccionada', id);
          } catch (_) {}
        }
        ultimoIdAtencion='';
        setTimeout(()=>cargar(true),80);
      });
    });

    ['aurosanax:paciente-seleccionado','aurosanax:historia-cargada'].forEach(nombre => {
      window.addEventListener(nombre,()=>{ultimoIdAtencion='';setTimeout(()=>cargar(true),80);});
    });

    document.addEventListener('click', evento => {
      const el = evento.target?.closest?.('[data-id-atencion],[data-atencion-id]');
      if (!el) return;
      const id = txt(el.dataset?.idAtencion || el.dataset?.atencionId || el.getAttribute('data-id-atencion') || el.getAttribute('data-atencion-id'));
      if (!id) return;
      const encontrada = leerAtencionesLocales().find(a => txt(a.id_atencion || a.id) === id) || {id_atencion:id};
      contextoSeleccionado = encontrada;
      try { sessionStorage.setItem('aurosanax_id_atencion_seleccionada', id); } catch (_) {}
      ultimoIdAtencion='';
      setTimeout(()=>cargar(true),120);
    }, true);

    setInterval(()=>{
      const atencion = resolverAtencionActiva();
      const id=txt(atencion?.id_atencion || atencion?.id);
      if(id && id!==ultimoIdAtencion)cargar(true);
    },1500);
    cargar(true);
    console.info(`${MODULO} cargado. ${VERSION}`);
  }

  window.AurosanaxGinecologia={version:VERSION,inicializar,cargar,guardar,limpiar:limpiarFormulario,limpiarDatosConsulta,obtenerRegistroActual:()=>registroActual?{...registroActual}:null,obtenerContexto:contextoActual};
  window.inicializarGinecologia=inicializar;
  window.cargarGinecologiaPorAtencion=cargar;
  window.guardarGinecologiaERP=guardar;
  window.limpiarGinecologiaERP=limpiarFormulario;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',inicializar); else inicializar();
})();
