/* =====================================================
   IASYN ERP - MÓDULO ATENCIONES 
   Archivo: atenciones.js
   Versión: 2.4 contexto maestro enriquecido no invasivo + resumen premium + paginación segura
   Objetivo:
   - Agregar historial de atenciones dentro de Historia Clínica.
   - Permitir iniciar y finalizar atención por paciente.
   - No modifica Agenda, Pacientes, Antecedentes, Plan ni Recetas.
   - Conecta Examen Físico por id_atencion sin cambiar la vista del historial.
   - Guarda localmente y sincroniza con Google Sheets mediante Apps Script.
===================================================== */

(function(){
  'use strict';

  const MODULO = 'IASYN_ATENCIONES_V2_0_MOBILE_CARDS';
  const STORAGE_KEY = 'aurosanax_atenciones_local_v1';

  let atencionActivaId = '';
  /*
    AUROSANAX 2.5.1 - generación de contexto.
    Cada transición clínica real incrementa este valor para invalidar
    callbacks diferidos de una atención anterior.
  */
  let contextoAtencionEpoch = 0;
  let consultasVisible = true;
  let atencionesSheetsCargadas = false;
  let atencionesSheetsCargando = false;
  let recetasSheetsCargadas = false;
  let recetasSheetsCargando = false;
  let consultasPaginaActual = 1;
  const CONSULTAS_POR_PAGINA = 10;
  const RECETAS_STORAGE_KEY = 'aurosanax_recetas_emitidas_v1';

  /*
    IASYN - BLINDAJE ANTIDUPLICIDAD
    Estos locks son de ejecución, no de persistencia:
    - impiden doble clic/reentrada mientras se crea una atención;
    - impiden doble finalización simultánea;
    - no cambian IDs, eventos, storage keys ni contratos heredados.
  */
  let creandoAtencionEnCurso = false;
  let finalizandoAtencionEnCurso = false;

  /* Catálogo único de médicos: se consulta desde Configuración mediante Apps Script. */
  let medicosActivosAtenciones = [];
  let medicosActivosCargados = false;
  let medicosActivosCargando = null;

  function $(id){ return document.getElementById(id); }

  function inyectarEstilosAtenciones(){
    if(document.getElementById('auroAtencionesResponsiveCSS')) return;

    const st = document.createElement('style');
    st.id = 'auroAtencionesResponsiveCSS';
    st.textContent = `
      #auroAtencionesBox .auro-atenciones-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      #auroAtencionesBox .auro-atencion-status{
        border-radius:14px;
        padding:10px 12px;
        margin-top:10px;
        font-size:14px;
      }

      #auroAtencionesBox .auro-atencion-status.abierta{
        background:#dcfce7;
        color:#166534;
        border:1px solid #bbf7d0;
      }

      #auroAtencionesBox .auro-atencion-status.cerrada{
        background:#f1f5f9;
        color:#334155;
        border:1px solid #e2e8f0;
      }

      #auroAtencionesBox .auro-table-mobile-note{
        display:none;
      }

      #auroAtencionesBox .auro-atenciones-mobile{
        display:none;
      }

      #auroAtencionesBox .auro-consulta-card{
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:12px;
        background:#fff;
        margin-bottom:10px;
      }

      #auroAtencionesBox .auro-consulta-card-head{
        display:flex;
        justify-content:space-between;
        gap:8px;
        align-items:flex-start;
        margin-bottom:8px;
      }


      #auroAtencionesBox .auro-recetas-atencion-mobile{
        display:none;
      }

      #auroAtencionesBox .auro-receta-atencion-mobile-card{
        border:1px solid #e5e7eb;
        border-radius:16px;
        padding:12px;
        margin:10px 0;
        background:#fff;
        box-shadow:0 4px 14px rgba(15,23,42,.06);
      }

      #auroAtencionesBox .auro-receta-atencion-mobile-head{
        display:flex;
        justify-content:space-between;
        gap:8px;
        align-items:flex-start;
        margin-bottom:8px;
      }


      #auroAtencionesBox .auro-atencion-premium-head{
        border:1px solid #fbcfe8;
        background:linear-gradient(135deg,#fff7fb,#ffffff);
        border-radius:18px;
        padding:14px;
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        box-shadow:0 6px 18px rgba(139,30,90,.06);
      }

      #auroAtencionesBox .auro-atencion-premium-title{
        display:flex;
        gap:10px;
        align-items:flex-start;
      }

      #auroAtencionesBox .auro-atencion-premium-icon{
        width:42px;
        height:42px;
        border-radius:15px;
        display:grid;
        place-items:center;
        background:#fdf2f8;
        color:#8b1e5a;
        border:1px solid #fbcfe8;
        font-weight:900;
        flex:0 0 auto;
      }

      #auroAtencionesBox .auro-atencion-premium-title b{
        font-size:17px;
        color:#111827;
      }

      #auroAtencionesBox .auro-atencion-id{
        color:#6b7280;
        font-size:12px;
        word-break:break-all;
      }

      #auroAtencionesBox .auro-atencion-info-grid{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px;
        margin-top:10px;
      }

      #auroAtencionesBox .auro-atencion-info-card{
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:9px 10px;
        background:#fff;
        min-width:0;
        min-height:72px;
        display:flex;
        flex-direction:column;
        justify-content:center;
      }

      #auroAtencionesBox .auro-atencion-info-card span{
        display:block;
        color:#6b7280;
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.04em;
        font-weight:800;
        margin-bottom:3px;
      }

      #auroAtencionesBox .auro-atencion-info-card b{
        display:block;
        color:#111827;
        font-size:13px;
        word-break:break-word;
      }

      #auroAtencionesBox .auro-receta-resumen-box{
        display:grid;
        gap:5px;
        white-space:normal;
        min-width:220px;
      }

      #auroAtencionesBox .auro-receta-med-principal{
        font-weight:900;
        color:#111827;
        line-height:1.25;
        margin-bottom:1px;
      }

      #auroAtencionesBox .auro-receta-med-esquema{
        color:#475569;
        font-size:12px;
        line-height:1.25;
      }

      #auroAtencionesBox .auro-receta-med-extra{
        display:inline-block;
        width:max-content;
        max-width:100%;
        margin-top:2px;
        border-radius:999px;
        padding:3px 8px;
        background:#fdf2f8;
        color:#8b1e5a;
        border:1px solid #fbcfe8;
        font-size:11px;
        font-weight:900;
      }

      #auroAtencionesBox .auro-recetas-atencion-box{
        border:1px solid #e5e7eb;
        border-radius:18px;
        padding:12px;
        background:#fff;
        box-shadow:0 6px 18px rgba(15,23,42,.04);
      }

      #auroAtencionesBox .auro-recetas-atencion-title{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        flex-wrap:wrap;
        margin-bottom:10px;
      }

      #auroAtencionesBox .auro-recetas-atencion-title b{
        color:#111827;
      }

      #auroAtencionesBox .auro-receta-indicacion-resumen{
        color:#475569;
        font-size:12px;
        line-height:1.3;
        max-width:260px;
        white-space:normal;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
        overflow:hidden;
      }

      #auroAtencionesBox .auro-consultas-paginacion{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
        margin-top:10px;
        padding:10px 0 0;
      }

      #auroAtencionesBox .auro-consultas-paginacion .small{
        font-weight:800;
      }


      #auroAtencionesBox .auro-atencion-medico-box{
        display:grid;
        gap:4px;
        line-height:1.22;
        min-width:0;
      }

      #auroAtencionesBox .auro-atencion-medico-nombre{
        display:block;
        color:#111827;
        font-size:13px;
        font-weight:900;
        word-break:break-word;
      }

      #auroAtencionesBox .auro-atencion-medico-id-row{
        display:flex;
        align-items:center;
        gap:6px;
        flex-wrap:wrap;
      }

      #auroAtencionesBox .auro-atencion-medico-id-label{
        display:inline-flex;
        align-items:center;
        border:1px solid #f3d4e8;
        background:#fdf2f8;
        color:#7a174f;
        border-radius:999px;
        padding:2px 7px;
        font-size:9.5px;
        font-weight:900;
        letter-spacing:.04em;
        text-transform:uppercase;
      }

      #auroAtencionesBox .auro-atencion-medico-id{
        display:inline-block;
        font-size:11px;
        font-weight:750;
        color:#475569;
        word-break:break-word;
      }

      .auro-medico-modal{
        position:fixed;
        inset:0;
        z-index:99999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:rgba(15,23,42,.58);
      }

      .auro-medico-modal-panel{
        width:min(520px,100%);
        background:#fff;
        border:1px solid #fbcfe8;
        border-radius:22px;
        padding:20px;
        box-shadow:0 28px 80px rgba(15,23,42,.28);
      }

      .auro-medico-modal-panel h5{
        margin:0 0 6px;
        font-weight:900;
      }

      .auro-medico-modal-panel p{
        margin:0 0 14px;
        color:#64748b;
        font-size:14px;
      }

      .auro-medico-modal-actions{
        display:flex;
        justify-content:flex-end;
        gap:8px;
        margin-top:14px;
      }

      @media (max-width: 768px){
        #auroAtencionesBox{
          padding:12px!important;
        }

        #auroAtencionesBox .auro-atenciones-header{
          flex-direction:column!important;
          align-items:stretch!important;
        }

        #auroAtencionesBox .auro-atenciones-title h5{
          font-size:16px!important;
          margin-bottom:2px!important;
        }

        #auroAtencionesBox .auro-atenciones-title h5 .desktop-title{
          display:none!important;
        }


        #auroAtencionesBox .auro-recetas-atencion-desktop{
          display:block!important;
        }
        #auroAtencionesBox .auro-recetas-atencion-mobile{
          display:none!important;
        }

        #auroAtencionesBox .auro-atenciones-title h5 .mobile-title{
          display:inline!important;
        }

        #auroAtencionesBox .auro-atenciones-actions{
          display:grid!important;
          grid-template-columns:1fr 1fr;
          gap:6px;
          width:100%;
        }

        #auroAtencionesBox .auro-atenciones-actions button{
          width:100%!important;
          font-size:12px!important;
          padding:7px 8px!important;
          white-space:normal!important;
          min-height:38px;
        }

        #auroAtencionesBox #btnFinalizarAtencion{
          grid-column: span 2;
        }

        #auroAtencionesBox .auro-atencion-status{
          font-size:12px!important;
          padding:8px 10px!important;
          line-height:1.35;
        }

        #auroAtencionesBox .auro-atenciones-desktop{
          display:none!important;
        }

        #auroAtencionesBox .auro-atenciones-mobile{
          display:block!important;
        }

        #auroAtencionesBox .auro-consulta-card{
          font-size:12px;
        }

        #auroAtencionesBox .auro-consulta-card .btn-action{
          width:100%;
          margin-top:6px;
        }

        #auroAtencionesBox .auro-table-mobile-note{
          display:none!important;
        }


        #auroAtencionesBox .auro-recetas-atencion-desktop{
          display:none!important;
        }

        #auroAtencionesBox .auro-recetas-atencion-mobile{
          display:block!important;
        }

        #auroAtencionesBox .auro-receta-atencion-mobile-card{
          font-size:12px!important;
        }

        #auroAtencionesBox .auro-receta-atencion-mobile-card .small{
          line-height:1.35;
          word-break:break-word;
        }

        #auroAtencionesBox #auroAtencionActivaBox .row > div{
          font-size:12px;
        }

        #auroAtencionesBox #auroAtencionActivaBox table{
          min-width:650px;
          font-size:12px;
        }

        #auroAtencionesBox .auro-atencion-premium-head{
          padding:12px!important;
          border-radius:16px!important;
          display:grid!important;
          grid-template-columns:1fr!important;
        }

        #auroAtencionesBox .auro-atencion-info-grid{
          grid-template-columns:1fr!important;
          gap:7px!important;
        }

        #auroAtencionesBox .auro-atencion-info-card{
          padding:8px 9px!important;
          min-height:auto!important;
        }

        #auroAtencionesBox .auro-recetas-atencion-box{
          padding:10px!important;
          border-radius:16px!important;
        }

        #auroAtencionesBox .auro-receta-resumen-box{
          min-width:0!important;
          width:100%!important;
        }

        #auroAtencionesBox .auro-consultas-paginacion{
          display:grid!important;
          grid-template-columns:1fr!important;
        }

        #auroAtencionesBox .auro-consultas-paginacion button{
          width:100%!important;
          margin:0!important;
        }

      }

      @media (min-width: 769px){
        #auroAtencionesBox .auro-atenciones-title h5 .mobile-title{
          display:none!important;
        }
        #auroAtencionesBox .auro-atenciones-desktop{
          display:block!important;
        }
        #auroAtencionesBox .auro-atenciones-mobile{
          display:none!important;
        }
      }
    `;
    document.head.appendChild(st);
  }


  function safe(v){
    return String(v || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function fechaHoyISO(){
    if(typeof window.fechaHoyISO === 'function'){
      try{ return window.fechaHoyISO(); }catch(e){}
    }
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function horaActual(){
    const d = new Date();
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  function fechaHora(){
    const d = new Date();
    return d.toLocaleString('es-EC', {
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false
    });
  }

  function fechaVisual(fecha){
    if(!fecha) return '—';
    const s = String(fecha);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const p = s.slice(0,10).split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
  }

  function horaVisualAtencion(hora){
    if(!hora) return '—';
    const s = String(hora);
    if(s.includes('T')){
      const hhmm = s.slice(11,16);
      return hhmm || '—';
    }
    if(/^\d{1,2}:\d{2}/.test(s)){
      return s.slice(0,5);
    }
    return s;
  }

  function fechaHoraVisualAtencion(valor){
    if(!valor) return '—';

    if(Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)){
      return new Intl.DateTimeFormat('es-EC', {
        timeZone:'America/Guayaquil',
        year:'numeric',
        month:'2-digit',
        day:'2-digit',
        hour:'2-digit',
        minute:'2-digit',
        hourCycle:'h23'
      }).format(valor);
    }

    const s = String(valor).trim();
    if(!s) return '—';

    /*
      Corrección quirúrgica:
      Google Apps Script serializa las fechas reales de Sheets como ISO UTC.
      Solo esos valores con zona horaria se convierten a America/Guayaquil.
      Los textos ya formateados por el ERP se conservan sin reinterpretarlos.
    */
    const esISOConZona =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);

    if(esISOConZona){
      const d = new Date(s);
      if(!isNaN(d)){
        return new Intl.DateTimeFormat('es-EC', {
          timeZone:'America/Guayaquil',
          year:'numeric',
          month:'2-digit',
          day:'2-digit',
          hour:'2-digit',
          minute:'2-digit',
          hourCycle:'h23'
        }).format(d);
      }
    }

    return s;
  }

  function leerLocal(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      console.warn(MODULO, 'No se pudo leer localStorage.', e);
      return [];
    }
  }

  function guardarLocal(arr){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    }catch(e){
      console.warn(MODULO, 'No se pudo guardar localStorage.', e);
    }
  }

  function mezclarAtencionesLocalesYSheets(remotas){
    const locales = leerLocal().map(normalizar);
    const mapa = new Map();

    /*
      AUROSANAX FIX:
      localStorage es solo respaldo temporal.
      Google Sheets es la fuente principal y sobrescribe la copia local.
    */
    locales.forEach(item => {
      const a = normalizar(item || {});
      if(a.id_atencion){
        mapa.set(String(a.id_atencion), a);
      }
    });

    (Array.isArray(remotas) ? remotas : []).forEach(item => {
      const a = normalizar(item || {});
      if(a.id_atencion){
        mapa.set(
          String(a.id_atencion),
          Object.assign({}, mapa.get(String(a.id_atencion)) || {}, a)
        );
      }
    });

    const mezcladas = Array.from(mapa.values()).sort((a,b) => {
      const na = Number(a.numero_consulta || 0);
      const nb = Number(b.numero_consulta || 0);
      if(na !== nb) return nb - na;
      return String(b.fecha_atencion + ' ' + b.hora_atencion)
        .localeCompare(String(a.fecha_atencion + ' ' + a.hora_atencion));
    });

    guardarLocal(mezcladas);
    return mezcladas;
  }

  async function cargarAtencionesDesdeSheets(forzar){
    try{
      if(atencionesSheetsCargando) return leerLocal();
      if(atencionesSheetsCargadas && !forzar) return leerLocal();

      if(typeof API_URL === 'undefined' || !API_URL){
        return leerLocal();
      }

      atencionesSheetsCargando = true;

      const res = await fetch(API_URL + '?accion=listarAtenciones&_=' + Date.now());
      const data = await res.json();
      const remotas = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

      const mezcladas = mezclarAtencionesLocalesYSheets(remotas);
      atencionesSheetsCargadas = true;
      atencionesSheetsCargando = false;

      return mezcladas;

    }catch(error){
      atencionesSheetsCargando = false;
      console.warn(MODULO, 'No se pudieron cargar atenciones desde Google Sheets.', error);
      return leerLocal();
    }
  }


  async function enviarAtencionGoogleSheets(atencion, accion){
    try{
      if(!atencion) return { success:false, message:'No hay atención para enviar' };
      if(typeof API_URL === 'undefined' || !API_URL){
        return { success:false, message:'API_URL no está definida en index.html' };
      }

      const accionAtencion = accion === 'editarAtencion'
        ? 'editarAtencion'
        : 'guardarAtencion';

      const payload = {
        accion: accionAtencion,
        data: {
          id_atencion: atencion.id_atencion || '',
          numero_consulta: Number(atencion.numero_consulta || siguienteConsulta(atencion.id_paciente || idPacienteActivo()) || 1),
          id_paciente: atencion.id_paciente || '',
          id_cita: atencion.id_cita || '',
          id_historia: atencion.id_historia || obtenerIdHistoriaActual() || '',
          id_medico: atencion.id_medico || '',
          fecha_atencion: atencion.fecha_atencion || fechaHoyISO(),
          hora_atencion: atencion.hora_atencion || horaActual(),
          tipo_atencion: atencion.tipo_atencion || '',
          estado_atencion: atencion.estado_atencion || 'Abierta',
          creado_por: atencion.creado_por || usuarioActual(),
          creado_en: atencion.creado_en || fechaHora(),
          actualizado_en: atencion.actualizado_en || fechaHora()
        }
      };

      const res = await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      return {
        success:true,
        message: accionAtencion === 'editarAtencion'
          ? 'Atención actualizada en Google Sheets'
          : 'Atención guardada en Google Sheets'
      };

    }catch(error){
      console.error(MODULO, 'Error enviando atención a Google Sheets:', error);
      return { success:false, message:error.message };
    }
  }

  function pacienteActivo(){
    try{
      if(typeof window.getPacienteActivo === 'function') return window.getPacienteActivo();
    }catch(e){}
    return null;
  }

  function idPacienteActivo(){
    try{
      /*
        AUROSANAX FIX QUIRÚRGICO:
        Dentro de Historia Clínica, el selector visible es la fuente principal.
        Si existe y está vacío, no se reutiliza un paciente residual conservado
        en variables globales de una navegación anterior.
      */
      const sel = $('hcPacienteSelect');
      if(sel){
        const idSeleccionado = String(sel.value || '').trim();
        if(!idSeleccionado) return '';
        return idSeleccionado;
      }

      /*
        Compatibilidad:
        Si el selector de Historia Clínica no existe en la pantalla actual,
        se conservan exactamente las fuentes globales anteriores.
      */
      const p = pacienteActivo();

      if(p && (p.id_paciente || p.id || p.cedula)){
        return String(p.id_paciente || p.id || p.cedula);
      }

      if(window.activePatientId) return String(window.activePatientId);

      if(window.historiaActual &&
         (window.historiaActual.id_paciente || window.historiaActual.paciente_id)){
        return String(window.historiaActual.id_paciente || window.historiaActual.paciente_id);
      }

      if(window.currentHistoria &&
         (window.currentHistoria.id_paciente || window.currentHistoria.paciente_id)){
        return String(window.currentHistoria.id_paciente || window.currentHistoria.paciente_id);
      }

    }catch(e){
      console.warn(MODULO,'Error obteniendo paciente activo',e);
    }

    return '';
  }

  function medicoActual(){
    /*
      No existe médico predeterminado.
      El médico debe venir de Agenda o seleccionarse manualmente.
    */
    return '';
  }

  function nombreCompletoMedico(m){
    m = m || {};
    return String(
      m.nombre_completo ||
      ((m.nombres || m.nombre || '') + ' ' + (m.apellidos || ''))
    ).replace(/\s+/g,' ').trim();
  }

  function idMedicoRegistro(m){
    return String((m || {}).id_medico || (m || {}).id || (m || {}).codigo || '').trim();
  }

  async function cargarMedicosActivosAtenciones(forzar){
    if(medicosActivosCargados && !forzar) return medicosActivosAtenciones;
    if(medicosActivosCargando) return medicosActivosCargando;

    medicosActivosCargando = (async function(){
      try{
        if(typeof API_URL === 'undefined' || !API_URL){
          throw new Error('API_URL no está definida.');
        }

        const res = await fetch(
          API_URL + '?accion=listarMedicosActivos&_=' + Date.now()
        );

        if(!res.ok) throw new Error('Error HTTP ' + res.status);

        const data = await res.json();
        const lista = Array.isArray(data)
          ? data
          : (Array.isArray(data?.data) ? data.data : []);

        medicosActivosAtenciones = lista.filter(function(m){
          const id = idMedicoRegistro(m);
          const estado = normalizarTextoSimple(m.estado || 'Activo');
          return id && (!estado || estado === 'activo');
        });

        medicosActivosCargados = true;
        return medicosActivosAtenciones;
      }catch(error){
        medicosActivosAtenciones = [];
        medicosActivosCargados = false;
        console.warn(MODULO, 'No se pudieron cargar médicos activos.', error);
        return [];
      }finally{
        medicosActivosCargando = null;
      }
    })();

    return medicosActivosCargando;
  }

  function leerCitaSeleccionadaAgenda(){
    try{
      if(window.auroCitaSeleccionadaAgenda &&
         typeof window.auroCitaSeleccionadaAgenda === 'object'){
        return window.auroCitaSeleccionadaAgenda;
      }

      const raw = sessionStorage.getItem('auro_cita_seleccionada_agenda');
      if(raw){
        const cita = JSON.parse(raw);
        if(cita && typeof cita === 'object') return cita;
      }
    }catch(error){
      console.warn(MODULO, 'No se pudo leer la cita seleccionada desde Agenda.', error);
    }

    return null;
  }

  function citaAgendaCorrespondePaciente(cita, idPaciente){
    if(!cita) return false;

    const citaPaciente = String(cita.id_paciente || cita.paciente_id || '').trim();
    if(!citaPaciente) return true;

    return citaPaciente === String(idPaciente || '').trim();
  }

  function limpiarCitaSeleccionadaAgenda(){
    try{
      window.auroCitaSeleccionadaAgenda = null;
      sessionStorage.removeItem('auro_cita_seleccionada_agenda');
    }catch(error){
      console.warn(MODULO, 'No se pudo limpiar la cita seleccionada.', error);
    }
  }

  function seleccionarMedicoManual(lista){
    return new Promise(function(resolve){
      const anteriores = document.querySelectorAll('.auro-medico-modal');
      anteriores.forEach(function(x){ x.remove(); });

      const modal = document.createElement('div');
      modal.className = 'auro-medico-modal';

      const opciones = (Array.isArray(lista) ? lista : []).map(function(m){
        const id = idMedicoRegistro(m);
        const nombre = nombreCompletoMedico(m) || id;
        const especialidad = String(m.especialidad_principal || m.especialidad || '').trim();
        return '<option value="' + safe(id) + '">' +
          safe(nombre + (especialidad ? ' · ' + especialidad : '')) +
        '</option>';
      }).join('');

      modal.innerHTML =
        '<div class="auro-medico-modal-panel" role="dialog" aria-modal="true" aria-labelledby="auroMedicoModalTitulo">' +
          '<h5 id="auroMedicoModalTitulo">Seleccione el médico</h5>' +
          '<p>Esta atención se está iniciando manualmente. Elija el profesional responsable.</p>' +
          '<select id="auroMedicoManualSelect" class="form-select">' +
            '<option value="">Seleccione...</option>' +
            opciones +
          '</select>' +
          '<div class="auro-medico-modal-actions">' +
            '<button type="button" class="btn-line" id="auroCancelarMedico">Cancelar</button>' +
            '<button type="button" class="btn-auro" id="auroAceptarMedico">Continuar</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);

      const cerrar = function(valor){
        modal.remove();
        resolve(valor || null);
      };

      modal.querySelector('#auroCancelarMedico').addEventListener('click', function(){
        cerrar(null);
      });

      modal.querySelector('#auroAceptarMedico').addEventListener('click', function(){
        const id = String(modal.querySelector('#auroMedicoManualSelect').value || '').trim();
        if(!id){
          alert('Seleccione un médico para continuar.');
          return;
        }

        const medico = lista.find(function(m){
          return idMedicoRegistro(m) === id;
        }) || null;

        cerrar(medico);
      });

      modal.addEventListener('click', function(e){
        if(e.target === modal) cerrar(null);
      });
    });
  }

  function usuarioActual(){
    return 'IASYN ERP';
  }

  function idNuevo(){
    const d = new Date();
    const stamp =
      d.getFullYear() +
      String(d.getMonth()+1).padStart(2,'0') +
      String(d.getDate()).padStart(2,'0') +
      String(d.getHours()).padStart(2,'0') +
      String(d.getMinutes()).padStart(2,'0') +
      String(d.getSeconds()).padStart(2,'0');
    return 'ATN-' + stamp + '-' + Math.floor(Math.random()*900+100);
  }

  function normalizar(a){
    return {
      id_atencion: a.id_atencion || idNuevo(),
      numero_consulta: Number(a.numero_consulta || 0),
      id_paciente: a.id_paciente || '',
      id_cita: a.id_cita || '',
      id_historia: a.id_historia || '',
      id_medico: a.id_medico || '',
      fecha_atencion: a.fecha_atencion || fechaHoyISO(),
      hora_atencion: a.hora_atencion || horaActual(),
      tipo_atencion: a.tipo_atencion || '',
      estado_atencion: a.estado_atencion || 'Abierta',
      creado_por: a.creado_por || usuarioActual(),
      creado_en: a.creado_en || fechaHora(),
      actualizado_en: a.actualizado_en || fechaHora()
    };
  }

  function atencionesPaciente(idPaciente){
    /*
      AUROSANAX FIX:
      Se usa exclusivamente el paciente solicitado.
      No se agregan IDs de otro paciente conservado en memoria.
    */
    const id = String(idPaciente || idPacienteActivo() || '').trim();

    if(!id) return [];

    return leerLocal()
      .map(normalizar)
      .filter(a => String(a.id_paciente || '').trim() === id)
      .sort((a,b) => {
        const na = Number(a.numero_consulta || 0);
        const nb = Number(b.numero_consulta || 0);
        if(na !== nb) return nb - na;
        return String(b.fecha_atencion + ' ' + b.hora_atencion)
          .localeCompare(String(a.fecha_atencion + ' ' + a.hora_atencion));
      });
  }

  function atencionAbierta(idPaciente){
    return atencionesPaciente(idPaciente).find(a => String(a.estado_atencion).toLowerCase() === 'abierta') || null;
  }

  function siguienteConsulta(idPaciente){
    return atencionesPaciente(idPaciente).reduce((m,a) => Math.max(m, Number(a.numero_consulta || 0)), 0) + 1;
  }


  function obtenerIdHistoriaActual(){
    try{
      /*
        AUROSANAX FIX:
        Solo se acepta una historia explícitamente activa.
        No se toma automáticamente la historia más reciente del paciente,
        porque podría corresponder a otra consulta.
      */
      if(window.auroHistoriaSeleccionadaId){
        return String(window.auroHistoriaSeleccionadaId).trim();
      }

      if(window.editingHistoryId){
        return String(window.editingHistoryId).trim();
      }

      if(
        window.historiaActual &&
        (window.historiaActual.id_historia || window.historiaActual.id)
      ){
        return String(
          window.historiaActual.id_historia || window.historiaActual.id
        ).trim();
      }

      if(
        window.currentHistoria &&
        (window.currentHistoria.id_historia || window.currentHistoria.id)
      ){
        return String(
          window.currentHistoria.id_historia || window.currentHistoria.id
        ).trim();
      }
    }catch(e){
      console.warn(MODULO, 'No se pudo obtener id_historia actual.', e);
    }

    return '';
  }

  function normalizarTextoSimple(valor){
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function obtenerDocumentoPacienteActivo(){
    const p = pacienteActivo();
    return p ? String(p.numero_documento || p.cedula || p.documento || '').replace(/\D/g,'') : '';
  }

  function buscarCitaAtendidaHoy(idPaciente){
    try{
      const citas = Array.isArray(window.citasAgendaWeb) ? window.citasAgendaWeb : [];
      const hoy = fechaHoyISO();
      const p = pacienteActivo();
      const docPaciente = obtenerDocumentoPacienteActivo();
      const nombrePaciente = normalizarTextoSimple(p ? (p.nombre || ((p.nombres || '') + ' ' + (p.apellidos || ''))) : '');

      return citas.find(c => {
        const estado = normalizarTextoSimple(c.estado || c.estado_cita || '');
        const fecha = String(c.fecha_deseada || c.fecha_cita || c.fecha || '').slice(0,10);

        const cid = String(c.id_paciente || c.paciente_id || '').trim();
        const cdoc = String(c.numero_documento || c.cedula || c.documento || '').replace(/\D/g,'');
        const cnombre = normalizarTextoSimple(c.nombre || c.paciente || c.nombre_completo || '');

        const coincidePaciente =
          (cid && String(cid) === String(idPaciente)) ||
          (docPaciente && cdoc && docPaciente === cdoc) ||
          (nombrePaciente && cnombre && nombrePaciente === cnombre);

        return coincidePaciente &&
               fecha === hoy &&
               estado.includes('atendid');
      }) || null;
    }catch(e){
      console.warn(MODULO, 'No se pudo buscar cita atendida de hoy.', e);
      return null;
    }
  }


  function auroInvalidarContextoAtencion(opciones){
    opciones = opciones || {};

    const idAnterior = String(
      opciones.idAnterior != null ? opciones.idAnterior : atencionActivaId
    ).trim();

    const idNueva = String(opciones.idNueva || '').trim();
    const idPaciente = String(
      opciones.idPaciente != null ? opciones.idPaciente : idPacienteActivo()
    ).trim();

    contextoAtencionEpoch += 1;
    atencionActivaId = '';

    window.planState = window.planState || { atencionActual:'', cache:{} };
    window.planState.atencionActual = '';

    if(window.examenFisicoState){
      window.examenFisicoState.atencionActual = '';
      window.examenFisicoState.idExamenActual = '';
    }

    if(window.auroDiagnosticosState){
      window.auroDiagnosticosState.atencionActual = '';
      window.auroDiagnosticosState.detalleExamen = null;
      window.auroDiagnosticosState.diagnosticos = [];
      window.auroDiagnosticosState.resumenClinico = '';
      window.auroDiagnosticosState.analisisClinico = '';
      window.auroDiagnosticosState.conducta = '';
    }

    if(opciones.limpiarVisual !== false){
      [
        'auroLimpiarPlanVisualAntesDeCambiarAtencion',
        'auroLimpiarDiagnosticos',
        'auroExamenFisicoLimpiarFormulario'
      ].forEach(function(nombre){
        try{
          if(typeof window[nombre] === 'function') window[nombre]();
        }catch(error){
          console.warn('AUROSANAX ATENCIONES: no se pudo ejecutar ' + nombre, error);
        }
      });

      try{
        if(typeof window.cambiarPlanPorAtencion === 'function'){
          window.cambiarPlanPorAtencion('');
        }
      }catch(error){
        console.warn('AUROSANAX ATENCIONES: no se pudo limpiar Plan.', error);
      }

      try{
        if(typeof window.cambiarExamenFisicoPorAtencion === 'function'){
          window.cambiarExamenFisicoPorAtencion('');
        }
      }catch(error){
        console.warn('AUROSANAX ATENCIONES: no se pudo limpiar Examen Físico.', error);
      }
    }

    window.dispatchEvent(new CustomEvent('aurosanax:atencion-limpiada', {
      detail:{
        id_paciente:idPaciente,
        id_atencion_anterior:idAnterior,
        id_atencion_nueva:idNueva,
        motivo:String(opciones.motivo || 'cambio_atencion'),
        contexto_epoch:contextoAtencionEpoch
      }
    }));

    return {
      idAnterior,
      idNueva,
      idPaciente,
      epoch:contextoAtencionEpoch
    };
  }

  /* =====================================================
     AUROSANAX - MOTOR ÚNICO DE ACTIVACIÓN DE ATENCIÓN
     Corrección quirúrgica v2.5

     OBJETIVO:
     - Evitar que Plan, Recetas, Diagnóstico o Examen Físico conserven
       visualmente la consulta anterior al crear o abrir una atención.
     - Reutilizar el mismo flujo tanto para "Iniciar" como para "Ver".
     - No elimina datos, no cambia IDs, no modifica Google Sheets.
  ===================================================== */
  function sincronizarContextoAtencion(atencion, opciones){
    opciones = opciones || {};

    const a = normalizar(atencion || {});
    const idAtencion = String(a.id_atencion || '').trim();
    const idPaciente = String(a.id_paciente || '').trim();
    const idPacienteVisible = String(idPacienteActivo() || '').trim();
    const idAnterior = String(atencionActivaId || '').trim();

    if(!idAtencion) return false;

    if(
      idPacienteVisible &&
      idPaciente &&
      idPacienteVisible !== idPaciente
    ){
      console.warn(
        'AUROSANAX ATENCIONES: se bloqueó una atención de otro paciente.',
        { idPacienteVisible, idPaciente, idAtencion }
      );
      return false;
    }

    /*
      2.5.1:
      Volver a pulsar Ver sobre la MISMA consulta no es una transición clínica.
      Se conserva exactamente la funcionalidad visual sin limpiar ni emitir
      eventos que puedan despertar autosaves de otros módulos.
    */
    if(idAnterior && idAnterior === idAtencion){
      renderDetalleAtencion(a);

      try{
        if(typeof window.auroPlanActualizarMiniStatus === 'function'){
          window.auroPlanActualizarMiniStatus();
        }
      }catch(error){
        console.warn('AUROSANAX ATENCIONES: no se pudo refrescar el estado visual del Plan.', error);
      }

      return true;
    }

    /*
      Transición clínica real A -> B:
      una sola invalidación central comunica la id anterior exacta.
    */
    const transicion = auroInvalidarContextoAtencion({
      idAnterior:idAnterior,
      idNueva:idAtencion,
      idPaciente:idPaciente,
      motivo:String(opciones.motivo || 'cambio_atencion'),
      limpiarVisual:true
    });

    const epoch = transicion.epoch;

    /* Activar inmediatamente la atención nueva como fuente maestra. */
    atencionActivaId = idAtencion;

    window.planState = window.planState || { atencionActual:'', cache:{} };
    window.planState.atencionActual = idAtencion;

    if(window.examenFisicoState){
      window.examenFisicoState.atencionActual = idAtencion;
    }

    if(window.auroDiagnosticosState){
      window.auroDiagnosticosState.atencionActual = idAtencion;
    }

    const detalleEvento = {
      ...a,
      contexto_epoch:epoch,
      id_atencion_anterior:idAnterior
    };

    window.dispatchEvent(new CustomEvent('aurosanax:atencion-seleccionada', {
      detail:detalleEvento
    }));

    if(opciones.emitirIniciada){
      window.dispatchEvent(new CustomEvent('aurosanax:atencion-iniciada', {
        detail:detalleEvento
      }));
    }

    /* Render inmediato: Ver, Iniciar y Vista integral conservan su comportamiento. */
    renderDetalleAtencion(a);

    try{
      if(typeof window.auroPlanActualizarMiniStatus === 'function'){
        window.auroPlanActualizarMiniStatus();
      }
    }catch(error){
      console.warn('AUROSANAX ATENCIONES: no se pudo refrescar el estado visual del Plan.', error);
    }

    setTimeout(function(){
      try{
        if(contextoAtencionEpoch !== epoch) return;
        if(String(atencionActivaId || '') !== idAtencion) return;

        if(typeof window.cambiarPlanPorAtencion === 'function'){
          window.cambiarPlanPorAtencion(idAtencion);
        }

        if(typeof window.cambiarExamenFisicoPorAtencion === 'function'){
          window.cambiarExamenFisicoPorAtencion(idAtencion);
        }
      }catch(error){
        console.warn('AUROSANAX ATENCIONES: error al cargar módulos por atención.', error);
      }
    }, 80);

    setTimeout(function(){
      cargarRecetasDesdeSheetsAtenciones(true).then(function(){
        if(contextoAtencionEpoch !== epoch) return;
        if(String(atencionActivaId || '') !== idAtencion) return;

        const actual = leerLocal().find(function(item){
          return String(item.id_atencion || '') === idAtencion;
        }) || a;

        renderDetalleAtencion(normalizar(actual));
      }).catch(function(error){
        console.warn('AUROSANAX ATENCIONES: no se pudieron refrescar recetas.', error);
      });
    }, 140);

    setTimeout(function(){
      try{
        if(contextoAtencionEpoch !== epoch) return;
        if(String(atencionActivaId || '') !== idAtencion) return;

        if(typeof window.auroPlanActualizarMiniStatus === 'function'){
          window.auroPlanActualizarMiniStatus();
        }
      }catch(error){
        console.warn('AUROSANAX ATENCIONES: no se pudo confirmar el estado visual del Plan.', error);
      }
    }, 220);

    return true;
  }

  async function crearAtencion(){
    if(creandoAtencionEnCurso){
      return null;
    }

    creandoAtencionEnCurso = true;
    const btnIniciarLock = $('btnIniciarAtencion');
    if(btnIniciarLock) btnIniciarLock.disabled = true;

    try{
      const p = pacienteActivo();
      const idPaciente = idPacienteActivo();

    if(!p || !idPaciente){
      alert('Seleccione primero un paciente desde Pacientes o Historia Clínica.');
      return null;
    }

    const abierta = atencionAbierta(idPaciente);
    if(abierta){
      atencionActivaId = abierta.id_atencion;
      renderAtencionesPaciente();
      alert('Este paciente ya tiene una atención abierta.');
      return abierta;
    }

    /*
      Prioridad obligatoria:
      1. Cita seleccionada expresamente en Agenda.
      2. Inicio manual con selector de médicos activos.
      Ya no se busca una cita atendida cualquiera ni se asigna Aurora por defecto.
    */
    let cita = leerCitaSeleccionadaAgenda();

    if(cita && !citaAgendaCorrespondePaciente(cita, idPaciente)){
      alert(
        'La cita seleccionada en Agenda pertenece a otro paciente. ' +
        'Se bloqueó el inicio para proteger la historia clínica.'
      );
      return null;
    }

    let idMedico = '';
    let fechaAtencion = fechaHoyISO();
    let horaAtencion = horaActual();
    let idCita = '';

    if(cita){
      idMedico = String(cita.id_medico || cita.medico_id || '').trim();
      idCita = String(cita.id_cita || cita.id || cita.id_cita_web || cita.fila_origen || '').trim();
      fechaAtencion = String(
        cita.fecha_deseada || cita.fecha_cita || cita.fecha || fechaHoyISO()
      ).slice(0,10);
      horaAtencion = String(
        cita.hora_deseada || cita.hora_inicio || cita.hora || horaActual()
      ).trim();

      if(!idMedico){
        alert('La cita seleccionada no tiene un id_medico válido. Revise la cita en Agenda.');
        return null;
      }

      const catalogo = await cargarMedicosActivosAtenciones(false);
      if(catalogo.length){
        const existeActivo = catalogo.some(function(m){
          return idMedicoRegistro(m) === idMedico;
        });

        if(!existeActivo){
          alert(
            'El médico asignado a la cita no aparece como activo en Configuración. ' +
            'Active el médico o corrija la cita antes de iniciar.'
          );
          return null;
        }
      }
    }else{
      const catalogo = await cargarMedicosActivosAtenciones(false);

      if(!catalogo.length){
        alert(
          'No se pudieron cargar médicos activos desde Configuración. ' +
          'Revise Apps Script o la conexión.'
        );
        return null;
      }

      const seleccionado = await seleccionarMedicoManual(catalogo);
      if(!seleccionado) return null;

      idMedico = idMedicoRegistro(seleccionado);
    }

    const num = siguienteConsulta(idPaciente);

    const nueva = normalizar({
      id_atencion: idNuevo(),
      numero_consulta: num,
      id_paciente: idPaciente,
      id_cita: idCita,
      id_historia: obtenerIdHistoriaActual(),
      id_medico: idMedico,
      fecha_atencion: fechaAtencion,
      hora_atencion: horaAtencion,
      tipo_atencion: num === 1 ? 'Primera vez' : 'Control',
      estado_atencion: 'Abierta',
      creado_por: usuarioActual(),
      creado_en: fechaHora(),
      actualizado_en: fechaHora()
    });

    const lista = leerLocal();
    lista.unshift(nueva);
    guardarLocal(lista);

    /*
      AUROSANAX FASE 1 - PERSISTENCIA INMEDIATA DE LA ATENCIÓN:
      La fila principal se crea en Google Sheets al pulsar Iniciar atención,
      con estado Abierta y conservando el mismo id_atencion durante todo el flujo.
      De este modo, Examen físico, Diagnóstico, Plan y Receta nunca trabajan
      contra una atención inexistente en la pestaña atenciones.
    */
    const resultadoInicio = await enviarAtencionGoogleSheets(
      nueva,
      'guardarAtencion'
    );

    if(!resultadoInicio || !resultadoInicio.success){
      const listaRollback = leerLocal().filter(function(item){
        return String(item.id_atencion || '') !== String(nueva.id_atencion || '');
      });
      guardarLocal(listaRollback);
      renderAtencionesPaciente();

      alert(
        'No se pudo crear la atención en Google Sheets. ' +
        'No se activó la consulta para evitar registros clínicos huérfanos. ' +
        'Revise Apps Script o la conexión.'
      );
      return null;
    }

    if(cita){
      limpiarCitaSeleccionadaAgenda();
    }

    /*
      La atención recién creada se activa mediante el mismo motor utilizado
      por el botón Ver. Así ningún módulo conserva el contexto anterior.
    */
    sincronizarContextoAtencion(nueva, {
      motivo:'atencion_creada',
      emitirIniciada:true
    });

      renderAtencionesPaciente();
      return nueva;
    }finally{
      creandoAtencionEnCurso = false;
      renderAtencionesPaciente();
    }
  }

  async function finalizarAtencion(){
    if(finalizandoAtencionEnCurso){
      return;
    }

    finalizandoAtencionEnCurso = true;
    const btnFinalizarLock = $('btnFinalizarAtencion');
    if(btnFinalizarLock) btnFinalizarLock.disabled = true;

    try{
      const idPaciente = idPacienteActivo();
    if(!idPaciente){
      alert('Seleccione primero un paciente.');
      return;
    }

    const abierta = atencionAbierta(idPaciente);
    if(!abierta){
      alert('No hay atención abierta para finalizar.');
      return;
    }

    if(!confirm('¿Finalizar la atención actual? Quedará registrada como consulta histórica.')) return;

    const lista = leerLocal();
    const idx = lista.findIndex(a => String(a.id_atencion) === String(abierta.id_atencion));

    let atencionFinalizada = null;

    if(idx >= 0){
      atencionFinalizada = Object.assign({}, lista[idx], {
        numero_consulta: Number(lista[idx].numero_consulta || abierta.numero_consulta || siguienteConsulta(idPaciente) || 1),
        estado_atencion: 'Finalizada',
        actualizado_en: fechaHora()
      });

      lista[idx] = atencionFinalizada;
      guardarLocal(lista);
    }else{
      atencionFinalizada = Object.assign({}, abierta, {
        numero_consulta: Number(abierta.numero_consulta || siguienteConsulta(idPaciente) || 1),
        estado_atencion: 'Finalizada',
        actualizado_en: fechaHora()
      });
    }

    const idFinalizada = String(atencionFinalizada?.id_atencion || abierta.id_atencion || '').trim();

    auroInvalidarContextoAtencion({
      idAnterior:idFinalizada,
      idNueva:'',
      idPaciente:idPaciente,
      motivo:'atencion_finalizada',
      limpiarVisual:true
    });

    renderAtencionesPaciente();

    const resultado = await enviarAtencionGoogleSheets(atencionFinalizada, 'editarAtencion');

      if(resultado && resultado.success){
        alert('Atención finalizada y enviada a Google Sheets.');
      }else{
        alert('Atención finalizada localmente, pero no se pudo enviar a Google Sheets. Revise Apps Script o conexión.');
      }
    }finally{
      finalizandoAtencionEnCurso = false;
      renderAtencionesPaciente();
    }
  }


  async function vincularHistoriaAAtencionActual(idHistoria, idPaciente){
    idHistoria = String(idHistoria || '').trim();
    idPaciente = String(idPaciente || idPacienteActivo() || '').trim();

    if(!idHistoria){
      return {
        success:false,
        message:'No se recibió un id_historia válido.'
      };
    }

    if(!idPaciente){
      return {
        success:false,
        message:'No existe un paciente activo para vincular la historia.'
      };
    }

    const lista = leerLocal().map(normalizar);

    /*
      Prioridad:
      1. Atención activa del mismo paciente.
      2. Atención abierta del mismo paciente.
      3. Última atención sin id_historia del mismo paciente.
      Nunca se toma una atención de otro paciente.
    */
    let idx = lista.findIndex(a =>
      atencionActivaId &&
      String(a.id_atencion || '') === String(atencionActivaId) &&
      String(a.id_paciente || '').trim() === idPaciente
    );

    if(idx < 0){
      idx = lista.findIndex(a =>
        String(a.id_paciente || '').trim() === idPaciente &&
        String(a.estado_atencion || '').toLowerCase() === 'abierta'
      );
    }

    if(idx < 0){
      const candidatas = lista
        .map((a, index) => ({a, index}))
        .filter(x =>
          String(x.a.id_paciente || '').trim() === idPaciente &&
          !String(x.a.id_historia || '').trim()
        )
        .sort((x, y) =>
          String(y.a.actualizado_en || y.a.creado_en || y.a.fecha_atencion || '')
            .localeCompare(
              String(x.a.actualizado_en || x.a.creado_en || x.a.fecha_atencion || '')
            )
        );

      if(candidatas.length){
        idx = candidatas[0].index;
      }
    }

    if(idx < 0){
      return {
        success:false,
        message:'No se encontró una atención del paciente pendiente de vincular.'
      };
    }

    const atencion = lista[idx];

    if(String(atencion.id_paciente || '').trim() !== idPaciente){
      return {
        success:false,
        message:'La atención localizada pertenece a otro paciente.'
      };
    }

    /*
      Si ya tiene otra historia, no se reemplaza silenciosamente.
    */
    const historiaAnterior = String(atencion.id_historia || '').trim();

    if(historiaAnterior && historiaAnterior !== idHistoria){
      return {
        success:false,
        message:
          'La atención ya está vinculada a otra historia clínica. ' +
          'Se bloqueó el cambio automático.'
      };
    }

    const actualizada = normalizar(Object.assign({}, atencion, {
      id_historia: idHistoria,
      actualizado_en: fechaHora()
    }));

    lista[idx] = actualizada;
    guardarLocal(lista);

    atencionActivaId = actualizada.id_atencion;

    window.planState = window.planState || {
      atencionActual:'',
      cache:{}
    };
    window.planState.atencionActual = actualizada.id_atencion;

    if(window.examenFisicoState){
      window.examenFisicoState.atencionActual = actualizada.id_atencion;
    }

    const resultado = await enviarAtencionGoogleSheets(actualizada, 'editarAtencion');

    renderAtencionesPaciente();

    return {
      success: !!(resultado && resultado.success),
      message: resultado?.message || 'Atención vinculada con la historia clínica.',
      id_atencion: actualizada.id_atencion,
      id_historia: idHistoria,
      id_paciente: idPaciente
    };
  }

  function leerRecetasLocales(){
    try{
      const raw = localStorage.getItem(RECETAS_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      console.warn(MODULO, 'No se pudo leer recetas locales.', e);
      return [];
    }
  }

  function guardarRecetasLocales(arr){
    try{
      localStorage.setItem(RECETAS_STORAGE_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    }catch(e){
      console.warn(MODULO, 'No se pudo guardar recetas locales.', e);
    }
  }

  function normalizarRecetaAtencion(r){
    r = r || {};

    /*
      AUROSANAX FIX QUIRÚRGICO - RECETAS DENTRO DE ATENCIONES
      Se conservan TODOS los campos originales de la receta. Atenciones solo
      completa alias necesarios para su vista, sin eliminar creado_en,
      actualizado_en, recomendaciones ni otros datos administrados por recetas.js.
    */
    return Object.assign({}, r, {
      id_receta: r.id_receta || r.id || '',
      id_paciente: r.id_paciente || r.paciente_id || '',
      id_historia: r.id_historia || '',
      id_atencion: r.id_atencion || '',
      id_medico: r.id_medico || '',
      fecha_receta: r.fecha_receta || r.fecha || '',
      diagnostico_cie10: r.diagnostico_cie10 || r.cie10 || '',
      medicamento: r.medicamento || r.medicamentos || '',
      indicaciones: r.indicaciones || '',
      estado: r.estado || 'Emitida',
      paciente_cedula: r.paciente_cedula || r.cedula || r.numero_documento || '',
      paciente_nombre: r.paciente_nombre || r.paciente || r.nombre || '',
      numero_consulta: r.numero_consulta || r.consulta || '',
      creado_en: r.creado_en || '',
      actualizado_en: r.actualizado_en || ''
    });
  }

  function auroRecetaMarcaTiempoAtenciones(valor){
    if(!valor) return 0;

    if(Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)){
      return valor.getTime();
    }

    const texto = String(valor).trim();
    if(!texto) return 0;

    /* yyyy-MM-dd HH:mm:ss o ISO, con o sin zona. */
    let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(m){
      const directo = Date.parse(texto);
      if(!isNaN(directo)) return directo;
      return new Date(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6] || 0)
      ).getTime();
    }

    /* dd/MM/yyyy, HH:mm o dd/MM/yyyy HH:mm. */
    m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){
      return new Date(
        Number(m[3]), Number(m[2]) - 1, Number(m[1]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
      ).getTime();
    }

    const parsed = Date.parse(texto);
    return isNaN(parsed) ? 0 : parsed;
  }

  function auroRecetaFusionarVersionesAtenciones(local, remota){
    const l = normalizarRecetaAtencion(local || {});
    const r = normalizarRecetaAtencion(remota || {});

    const fechaLocal = auroRecetaMarcaTiempoAtenciones(
      l.actualizado_en || l.creado_en || l.fecha_receta
    );
    const fechaRemota = auroRecetaMarcaTiempoAtenciones(
      r.actualizado_en || r.creado_en || r.fecha_receta
    );

    /*
      La versión más reciente gobierna. La otra solo completa campos vacíos.
      En empate se conserva la copia local, porque puede ser la recién guardada
      y Google Sheets todavía estar propagando la actualización.
    */
    const principal = fechaRemota > fechaLocal ? r : l;
    const respaldo = fechaRemota > fechaLocal ? l : r;
    const fusionada = Object.assign({}, respaldo, principal);

    Object.keys(respaldo).forEach(function(campo){
      if(
        (fusionada[campo] === '' || fusionada[campo] === null || fusionada[campo] === undefined) &&
        respaldo[campo] !== '' && respaldo[campo] !== null && respaldo[campo] !== undefined
      ){
        fusionada[campo] = respaldo[campo];
      }
    });

    return normalizarRecetaAtencion(fusionada);
  }

  function mezclarRecetasLocalesYSheets(remotas){
    const mapa = new Map();

    /* Primero se registra la copia local completa. */
    leerRecetasLocales().forEach(item => {
      const local = normalizarRecetaAtencion(item);
      if(local.id_receta){
        mapa.set(String(local.id_receta), local);
      }
    });

    /* La copia remota solo reemplaza si realmente es más reciente. */
    (Array.isArray(remotas) ? remotas : []).forEach(item => {
      const remota = normalizarRecetaAtencion(item);
      if(!remota.id_receta) return;

      const clave = String(remota.id_receta);
      const local = mapa.get(clave);
      mapa.set(
        clave,
        local ? auroRecetaFusionarVersionesAtenciones(local, remota) : remota
      );
    });

    const mezcladas = Array.from(mapa.values());
    guardarRecetasLocales(mezcladas);
    return mezcladas;
  }

  async function cargarRecetasDesdeSheetsAtenciones(forzar){
    try{
      if(recetasSheetsCargando) return leerRecetasLocales();
      if(recetasSheetsCargadas && !forzar) return leerRecetasLocales();

      if(typeof API_URL === 'undefined' || !API_URL){
        return leerRecetasLocales();
      }

      recetasSheetsCargando = true;

      const res = await fetch(API_URL + '?accion=listarRecetas&_=' + Date.now());
      const data = await res.json();
      const remotas = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

      const mezcladas = mezclarRecetasLocalesYSheets(remotas);
      recetasSheetsCargadas = true;
      recetasSheetsCargando = false;

      return mezcladas;

    }catch(error){
      recetasSheetsCargando = false;
      console.warn(MODULO, 'No se pudieron cargar recetas desde Google Sheets para atenciones.', error);
      return leerRecetasLocales();
    }
  }

  function recetasPorAtencion(atencion){
    if(!atencion) return [];

    const idAtencion = String(atencion.id_atencion || '').trim();
    const idHistoria = String(atencion.id_historia || '').trim();
    const idPaciente = String(atencion.id_paciente || idPacienteActivo() || '').trim();
    const fechaAtencion = String(atencion.fecha_atencion || '').slice(0,10);
    const numeroConsulta = String(atencion.numero_consulta || '').replace('#','').trim();

    const recetas = leerRecetasLocales().map(normalizarRecetaAtencion);

    /*
      Regla principal:
      Si la receta tiene id_atencion, solo debe mostrarse en esa atención.
      Esto evita que consulta #1 y consulta #2 muestren la misma receta.
    */
    const exactasPorAtencion = recetas.filter(r => {
      const ridAtencion = String(r.id_atencion || '').trim();
      return idAtencion && ridAtencion && ridAtencion === idAtencion;
    });

    if(exactasPorAtencion.length){
      return exactasPorAtencion.sort((a,b) =>
        String(b.fecha_receta || '').localeCompare(String(a.fecha_receta || ''))
      );
    }

    /*
      Regla secundaria:
      Si la receta trae numero_consulta, se asocia por consulta exacta.
    */
    const exactasPorConsulta = recetas.filter(r => {
      const ridAtencion = String(r.id_atencion || '').trim();
      if(ridAtencion) return false;

      const ridPaciente = String(r.id_paciente || '').trim();
      const ridHistoria = String(r.id_historia || '').trim();
      const rFecha = String(r.fecha_receta || '').slice(0,10);
      const rConsulta = String(r.numero_consulta || r.consulta || '').replace('#','').trim();

      return (
        idPaciente &&
        ridPaciente === idPaciente &&
        fechaAtencion &&
        rFecha === fechaAtencion &&
        numeroConsulta &&
        rConsulta &&
        rConsulta === numeroConsulta &&
        (!idHistoria || !ridHistoria || ridHistoria === idHistoria)
      );
    });

    if(exactasPorConsulta.length){
      return exactasPorConsulta.sort((a,b) =>
        String(b.fecha_receta || '').localeCompare(String(a.fecha_receta || ''))
      );
    }

    /*
      Último respaldo seguro:
      Solo usar paciente + fecha si hay una única atención ese día.
      Si hay varias consultas el mismo día, no se usa porque mezclaría recetas.
    */
    const atencionesMismoDia = atencionesPaciente(idPaciente).filter(a =>
      String(a.fecha_atencion || '').slice(0,10) === fechaAtencion
    );

    if(atencionesMismoDia.length === 1){
      return recetas.filter(r => {
        const ridAtencion = String(r.id_atencion || '').trim();
        if(ridAtencion) return false;

        const ridPaciente = String(r.id_paciente || '').trim();
        const ridHistoria = String(r.id_historia || '').trim();
        const rFecha = String(r.fecha_receta || '').slice(0,10);

        return (
          idPaciente &&
          ridPaciente === idPaciente &&
          fechaAtencion &&
          rFecha === fechaAtencion &&
          (!idHistoria || !ridHistoria || ridHistoria === idHistoria)
        );
      }).sort((a,b) =>
        String(b.fecha_receta || '').localeCompare(String(a.fecha_receta || ''))
      );
    }

    return [];
  }

  function resumenTexto(valor, max){
    const txt = String(valor || '').replace(/\s+/g, ' ').trim();
    if(!txt) return '—';
    return txt.length > max ? txt.slice(0, max) + '...' : txt;
  }

  function auroAtencionMedicamentoEsJSON(valor){
    const txt = String(valor || '').trim();
    if(!txt) return false;
    if(!(txt.startsWith('[') || txt.startsWith('{'))) return false;
    try{
      JSON.parse(txt);
      return true;
    }catch(e){
      return false;
    }
  }

  function auroAtencionNormalizarMedicamento(m){
    m = m || {};
    return {
      med: m.med || m.medicamento || m.nombre || '',
      pres: m.pres || m.presentacion || '',
      via: m.via || '',
      cantidad: m.cantidad || '',
      frec: m.frec || m.frecuencia || '',
      dur: m.dur || m.duracion || '',
      ind: m.ind || m.indicaciones || '',
      continuo: m.continuo || 'No'
    };
  }

  function auroAtencionUnirNombrePresentacion(nombre, presentacion){
    const n = String(nombre || '').trim();
    const p = String(presentacion || '').trim();
    if(!n) return p;
    if(!p) return n;

    const limpiar = x => String(x || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const nn = limpiar(n);
    const pp = limpiar(p);

    if(nn.includes(pp)) return n;
    return n + ' ' + p;
  }

  function auroAtencionMedicamentoTexto(valor, maxItems){
    const txt = String(valor || '').trim();
    if(!txt) return '—';

    if(!auroAtencionMedicamentoEsJSON(txt)){
      return resumenTexto(txt, 180);
    }

    try{
      let data = JSON.parse(txt);
      if(!Array.isArray(data)) data = [data];
      data = data.filter(Boolean);

      if(!data.length) return '—';

      const limite = maxItems || 2;
      const visibles = data.slice(0, limite).map((item, i) => {
        if(typeof item === 'string'){
          return (i + 1) + '. ' + item.replace(/^\s*\d+\.\s*/, '').trim();
        }

        if(item.texto){
          return (i + 1) + '. ' + String(item.texto || '').replace(/^\s*\d+\.\s*/, '').trim();
        }

        const m = auroAtencionNormalizarMedicamento(item);
        const nombre = auroAtencionUnirNombrePresentacion(m.med, m.pres);
        const detalle = [m.via, m.frec, m.dur].filter(Boolean).join(' · ');
        return (i + 1) + '. ' + [nombre, detalle].filter(Boolean).join(' — ');
      }).filter(Boolean);

      const restantes = data.length - visibles.length;
      if(restantes > 0){
        visibles.push('+' + restantes + ' medicamento' + (restantes === 1 ? '' : 's'));
      }

      return visibles.join('\n');
    }catch(e){
      return resumenTexto(txt, 180);
    }
  }


  function auroAtencionMedicamentosArray(valor){
    const txt = String(valor || '').trim();
    if(!txt) return [];

    if(!auroAtencionMedicamentoEsJSON(txt)){
      return txt.split(/\n+/).map(linea => ({texto: linea.replace(/^\s*\d+\.\s*/, '').trim()})).filter(x => x.texto);
    }

    try{
      let data = JSON.parse(txt);
      if(!Array.isArray(data)) data = [data];
      return data.filter(Boolean);
    }catch(e){
      return [];
    }
  }

  function auroAtencionMedicamentoResumenHTML(valor){
    const meds = auroAtencionMedicamentosArray(valor);
    if(!meds.length){
      return '<div class="text-muted small">Sin medicamentos registrados</div>';
    }

    const primero = meds[0];

    if(typeof primero === 'string' || primero.texto){
      const texto = typeof primero === 'string'
        ? primero.replace(/^\s*\d+\.\s*/, '').trim()
        : String(primero.texto || '').replace(/^\s*\d+\.\s*/, '').trim();
      const extra = meds.length > 1 ? '<span class="auro-receta-med-extra">+' + (meds.length - 1) + ' medicamento' + (meds.length - 1 === 1 ? '' : 's') + '</span>' : '';
      return '<div class="auro-receta-resumen-box">' +
        '<div class="auro-receta-med-principal">' + safe(texto || 'Medicamento registrado') + '</div>' +
        extra +
      '</div>';
    }

    const m = auroAtencionNormalizarMedicamento(primero || {});
    const nombre = auroAtencionUnirNombrePresentacion(m.med, m.pres);
    const esquema = [m.via, m.frec, m.dur].filter(Boolean).join(' · ');
    const indicacion = m.ind ? '<div class="auro-receta-med-esquema">' + safe(m.ind) + '</div>' : '';
    const extra = meds.length > 1 ? '<span class="auro-receta-med-extra">+' + (meds.length - 1) + ' medicamento' + (meds.length - 1 === 1 ? '' : 's') + '</span>' : '';

    return '<div class="auro-receta-resumen-box">' +
      '<div class="auro-receta-med-principal">' + safe(nombre || 'Medicamento registrado') + '</div>' +
      (esquema ? '<div class="auro-receta-med-esquema">' + safe(esquema) + '</div>' : '') +
      indicacion +
      extra +
    '</div>';
  }

  function auroAtencionDato(label, valor){
    const v = String(valor || '').trim() || '—';
    return '<div class="auro-atencion-info-card"><span>' + safe(label) + '</span><b>' + safe(v) + '</b></div>';
  }

  function auroAtencionDatoHTML(label, html){
    const h = String(html || '').trim() || '<b>—</b>';
    return '<div class="auro-atencion-info-card"><span>' + safe(label) + '</span>' + h + '</div>';
  }

  function auroAtencionCitaTexto(a){
    const id = String(a?.id_cita || '').trim();
    return id || 'Sin cita vinculada';
  }


  function auroAtencionNormalizarNombre(texto){
    return String(texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g,'')
      .replace(/\s+/g,' ');
  }

  function auroAtencionResolverMedico(atencion){
    const raw = String(atencion?.id_medico || '').trim();
    let nombre = '';
    let id = '';

    if(raw && /^MED[-_]/i.test(raw)){
      id = raw;
    }else if(raw){
      nombre = raw;
    }

    try{
      const medicosLista = medicosActivosAtenciones.length
        ? medicosActivosAtenciones
        : (Array.isArray(window.medicos) ? window.medicos : []);
      if(medicosLista.length){
        const rawNorm = auroAtencionNormalizarNombre(raw);
        const encontrado = medicosLista.find(m => {
          const mid = String(m.id_medico || m.id || m.codigo || '').trim();
          const mnombre = String(m.nombre || m.nombres || '').trim();
          const mapellidos = String(m.apellidos || '').trim();
          const completo = String(m.nombre_completo || (mnombre + ' ' + mapellidos)).trim();
          const completoNorm = auroAtencionNormalizarNombre(completo);
          const nombreNorm = auroAtencionNormalizarNombre(mnombre + ' ' + mapellidos);
          return (
            (id && mid && mid === id) ||
            (rawNorm && completoNorm && (completoNorm.includes(rawNorm) || rawNorm.includes(completoNorm))) ||
            (rawNorm && nombreNorm && (nombreNorm.includes(rawNorm) || rawNorm.includes(nombreNorm)))
          );
        });

        if(encontrado){
          id = String(encontrado.id_medico || encontrado.id || encontrado.codigo || id || '').trim();
          const n = String(encontrado.nombre_completo || ((encontrado.nombres || encontrado.nombre || '') + ' ' + (encontrado.apellidos || ''))).trim();
          if(n) nombre = n;
        }
      }
    }catch(e){
      console.warn(MODULO, 'No se pudo resolver médico desde catálogo.', e);
    }

    if(!nombre){
      nombre = raw || '—';
    }

    let especialidad = '';

    try{
      const medicosLista = medicosActivosAtenciones.length
        ? medicosActivosAtenciones
        : (Array.isArray(window.medicos) ? window.medicos : []);

      const encontradoEspecialidad = medicosLista.find(function(m){
        const mid = String(m.id_medico || m.id || m.codigo || '').trim();
        return id && mid && mid === id;
      }) || null;

      if(encontradoEspecialidad){
        especialidad = String(
          encontradoEspecialidad.especialidad_principal ||
          encontradoEspecialidad.especialidad ||
          encontradoEspecialidad.nombre_especialidad ||
          ''
        ).trim();
      }
    }catch(e){
      console.warn(MODULO, 'No se pudo resolver especialidad desde catálogo.', e);
    }

    return {
      nombre: nombre || '—',
      id: id || '—',
      especialidad: especialidad || '—'
    };
  }

  function auroAtencionMedicoHTML(atencion){
    const m = auroAtencionResolverMedico(atencion);
    const idValor = m.id && m.id !== '—' ? safe(m.id) : 'ID no disponible';

    return '<div class="auro-atencion-medico-box">' +
      '<strong class="auro-atencion-medico-nombre">' + safe(m.nombre) + '</strong>' +
      '<div class="small text-muted">' + safe(m.especialidad || '—') + '</div>' +
      '<div class="auro-atencion-medico-id-row">' +
        '<span class="auro-atencion-medico-id-label">ID</span>' +
        '<small class="auro-atencion-medico-id">' + idValor + '</small>' +
      '</div>' +
    '</div>';
  }

  function auroAtencionEspecialidadMedicoHTML(atencion){
    const m = auroAtencionResolverMedico(atencion);
    return '<div class="auro-atencion-medico-box">' +
      '<strong class="auro-atencion-medico-nombre">' + safe(m.especialidad || '—') + '</strong>' +
      '<div class="small text-muted">' + safe(m.nombre || '—') + '</div>' +
    '</div>';
  }

  function auroAtencionVerReceta(idReceta){
    const id = String(idReceta || '').trim();

    if(!id){
      alert('No se encontró el identificador de la receta.');
      return;
    }

    if(
      window.AurosanaxVistaIntegral &&
      typeof window.AurosanaxVistaIntegral.abrirReceta === 'function'
    ){
      window.AurosanaxVistaIntegral.abrirReceta(id);
      return;
    }

    alert(
      'El visor auxiliar de receta no está cargado. ' +
      'Verifique que vista_integral_atencion.js esté incluido después de recetas.js.'
    );
  }

  function ocultarDetalleAtencion(){
    /*
      2.5.1:
      Ocultar es únicamente una acción visual.
      NO invalida la atención clínica activa ni rompe el contexto maestro.
    */
    const box = $('auroAtencionActivaBox');
    if(box){
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  function renderDetalleAtencion(a){
    const box = $('auroAtencionActivaBox');
    if(!box || !a) return;

    const recetas = recetasPorAtencion(a);

    let recetasHTML = '';
    if(!recetas.length && !recetasSheetsCargadas && !recetasSheetsCargando){
      cargarRecetasDesdeSheetsAtenciones(false).then(function(){
        const actual = leerLocal().find(x => String(x.id_atencion || '') === String(a.id_atencion || ''));
        if(actual){
          renderDetalleAtencion(normalizar(actual));
        }
      });
    }

    if(recetas.length){
      const filasRecetasDesktop = recetas.map(r => {
        return '<tr>' +
          '<td>' + safe(fechaVisual(r.fecha_receta || r.fecha || '')) + '</td>' +
          '<td>' + safe(r.id_receta || '—') + '</td>' +
          '<td>' + safe(r.diagnostico_cie10 || r.cie10 || '—') + '</td>' +
          '<td>' + auroAtencionMedicamentoResumenHTML(r.medicamento || r.medicamentos || '') + '</td>' +
          '<td><div class="auro-receta-indicacion-resumen">' + safe(resumenTexto(r.indicaciones || '', 120)) + '</div></td>' +
          '<td><span class="badge-auro badge-ok">' + safe(r.estado || 'Emitida') + '</span></td>' +
          '<td><button type="button" class="btn-action primary" data-receta-ver-id="' + safe(r.id_receta || '') + '"><i class="bi bi-eye me-1"></i> Ver receta</button></td>' +
        '</tr>';
      }).join('');

      const tarjetasRecetasMobile = recetas.map(r => {
        return '<div class="auro-receta-atencion-mobile-card">' +
          '<div class="auro-receta-atencion-mobile-head">' +
            '<div>' +
              '<b>Receta</b><br>' +
              '<small class="text-muted">' + safe(r.id_receta || '—') + '</small>' +
            '</div>' +
            '<span class="badge-auro badge-ok">' + safe(r.estado || 'Emitida') + '</span>' +
          '</div>' +
          '<div class="small"><b>Fecha:</b> ' + safe(fechaVisual(r.fecha_receta || r.fecha || '')) + '</div>' +
          '<div class="small"><b>CIE-10:</b> ' + safe(r.diagnostico_cie10 || r.cie10 || '—') + '</div>' +
          '<div class="small mt-2"><b>Medicamento:</b><br>' + auroAtencionMedicamentoResumenHTML(r.medicamento || r.medicamentos || '') + '</div>' +
          '<div class="small mt-2"><b>Indicaciones:</b><br>' + safe(resumenTexto(r.indicaciones || '', 160)) + '</div>' +
          '<button type="button" class="btn-action primary mt-2" data-receta-ver-id="' + safe(r.id_receta || '') + '"><i class="bi bi-eye me-1"></i> Ver receta</button>' +
        '</div>';
      }).join('');

      recetasHTML =
        '<div class="mt-3 auro-recetas-atencion-box">' +
          '<div class="auro-recetas-atencion-title"><b><i class="bi bi-prescription2 me-1"></i> Recetas asociadas a esta atención</b><span class="badge-auro badge-blue">' + recetas.length + ' receta' + (recetas.length === 1 ? '' : 's') + '</span></div>' +
          '<div class="auro-recetas-atencion-desktop">' +
            '<div class="table-responsive">' +
              '<table class="table table-modern align-middle mb-0">' +
                '<thead><tr><th>Fecha</th><th>ID receta</th><th>CIE-10</th><th>Medicamento</th><th>Indicaciones</th><th>Estado</th><th>Acción</th></tr></thead>' +
                '<tbody>' + filasRecetasDesktop + '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>' +
          '<div class="auro-recetas-atencion-mobile">' +
            tarjetasRecetasMobile +
          '</div>' +
        '</div>';
    }else{
      recetasHTML =
        '<div class="sheet-note mt-3">' +
          '<i class="bi bi-info-circle me-1"></i> Esta atención aún no tiene recetas asociadas.' +
        '</div>';
    }

    box.style.display = 'block';
    box.innerHTML =
      '<div class="auro-atencion-premium-head">' +
        '<div class="auro-atencion-premium-title">' +
          '<div class="auro-atencion-premium-icon">#' + safe(a.numero_consulta || '') + '</div>' +
          '<div>' +
            '<b>Consulta #' + safe(a.numero_consulta || '—') + '</b>' +
            '<div class="auro-atencion-id">ID atención: ' + safe(a.id_atencion || '—') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="d-flex gap-2 align-items-center flex-wrap justify-content-end">' +
          '<span class="badge-auro ' + (String(a.estado_atencion).toLowerCase() === 'abierta' ? 'badge-blue' : 'badge-ok') + '">' + safe(a.estado_atencion || '—') + '</span>' +
          '<button type="button" class="btn-action soft" id="btnOcultarDetalleAtencion">Ocultar</button>' +
        '</div>' +
      '</div>' +
      '<div class="auro-atencion-info-grid">' +
        auroAtencionDato('Fecha', fechaVisual(a.fecha_atencion)) +
        auroAtencionDato('Hora', horaVisualAtencion(a.hora_atencion || '—')) +
        auroAtencionDato('Tipo', a.tipo_atencion || '—') +
        auroAtencionDatoHTML('Médico', auroAtencionMedicoHTML(a)) +
        auroAtencionDato('Especialidad', auroAtencionResolverMedico(a).especialidad || '—') +
        auroAtencionDato('ID historia', a.id_historia || '—') +
        auroAtencionDato('ID cita', auroAtencionCitaTexto(a)) +
        auroAtencionDato('Paciente', a.id_paciente || idPacienteActivo() || '—') +
        auroAtencionDato('Actualizado', fechaHoraVisualAtencion(a.actualizado_en)) +
      '</div>' +
      recetasHTML;

    const btnOcultar = $('btnOcultarDetalleAtencion');
    if(btnOcultar) btnOcultar.addEventListener('click', ocultarDetalleAtencion);

    box.querySelectorAll('[data-receta-ver-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        auroAtencionVerReceta(this.getAttribute('data-receta-ver-id'));
      });
    });
  }

  function seleccionarAtencion(idAtencion){
    const a = leerLocal().find(function(item){
      return String(item.id_atencion || '') === String(idAtencion || '');
    });

    if(!a){
      alert('No se encontró la atención seleccionada.');
      return;
    }

    const idPacienteVisible = String(idPacienteActivo() || '').trim();
    const idPacienteAtencion = String(a.id_paciente || '').trim();

    if(
      idPacienteVisible &&
      idPacienteAtencion &&
      idPacienteVisible !== idPacienteAtencion
    ){
      alert(
        'La consulta seleccionada pertenece a otro paciente. ' +
        'Se bloqueó la apertura para proteger la historia clínica.'
      );
      atencionActivaId = '';
      renderAtencionesPaciente();
      return;
    }

    sincronizarContextoAtencion(a, {
      motivo:'boton_ver',
      emitirIniciada:false,
      idAnterior:String(atencionActivaId || '').trim()
    });
  }

  function asegurarBloque(){
    const historia = $('historia');
    const cardPaciente = $('hcPatientCard');

    if(!historia || !cardPaciente) return null;

    let box = $('auroAtencionesBox');
    if(box) return box;

    box = document.createElement('div');
    box.id = 'auroAtencionesBox';
    box.className = 'cardx p-3 mb-3';
    box.innerHTML =
      '<div class="d-flex justify-content-between align-items-start gap-2 flex-wrap auro-atenciones-header">' +
        '<div class="auro-atenciones-title">' +
          '<h5 class="fw-bold mb-1"><i class="bi bi-journal-medical me-1"></i> <span class="desktop-title">Historial de atenciones</span><span class="mobile-title">Atenciones</span></h5>' +
          '<div class="text-muted small" id="auroAtencionesResumen">Seleccione un paciente para ver sus atenciones.</div>' +
        '</div>' +
        '<div class="auro-atenciones-actions">' +
          '<button type="button" class="btn-soft" id="btnToggleConsultasAtencion"><i class="bi bi-eye-slash me-1"></i> Ocultar consultas</button>' +
          '<button type="button" class="btn-soft" id="btnIniciarAtencion"><i class="bi bi-play-circle me-1"></i> Iniciar</button>' +
          '<button type="button" class="btn-auro" id="btnFinalizarAtencion"><i class="bi bi-check-circle me-1"></i> Finalizar</button>' +
        '</div>' +
      '</div>' +
      '<div id="auroAtencionActivaBox" class="mt-3" style="display:none;"></div>' +
      '<div id="auroAtencionesLista" class="mt-3"></div>';

    cardPaciente.parentNode.insertBefore(box, cardPaciente.nextSibling);

    const btnToggleConsultas = $('btnToggleConsultasAtencion');
    const btnIniciar = $('btnIniciarAtencion');
    const btnFinalizar = $('btnFinalizarAtencion');

    if(btnToggleConsultas) btnToggleConsultas.addEventListener('click', function(){
      consultasVisible = !consultasVisible;
      renderAtencionesPaciente();
    });

    if(btnIniciar) btnIniciar.addEventListener('click', crearAtencion);
    if(btnFinalizar) btnFinalizar.addEventListener('click', finalizarAtencion);

    return box;
  }

  function renderAtencionesPaciente(){
    asegurarBloque();

    const idPaciente = idPacienteActivo();
    const resumen = $('auroAtencionesResumen');
    const lista = $('auroAtencionesLista');
    const activaBox = $('auroAtencionActivaBox');
    const btnToggleConsultas = $('btnToggleConsultasAtencion');
    const btnIniciar = $('btnIniciarAtencion');
    const btnFinalizar = $('btnFinalizarAtencion');

    if(!resumen || !lista) return;

    if(!idPaciente){
      setTimeout(function(){
        const nuevoId = idPacienteActivo();
        if(nuevoId){
          cargarAtencionesDesdeSheets(false).then(renderAtencionesPaciente);
        }
      },300);

      setTimeout(function(){
        const nuevoId = idPacienteActivo();
        if(nuevoId){
          cargarAtencionesDesdeSheets(false).then(renderAtencionesPaciente);
        }
      },1000);

      resumen.textContent = 'Seleccione un paciente para iniciar o revisar atenciones.';
      lista.innerHTML = '<div class="text-muted small">Sin paciente activo.</div>';
      if(activaBox) activaBox.style.display = 'none';
      if(btnToggleConsultas) btnToggleConsultas.disabled = true;
      if(btnIniciar) btnIniciar.disabled = true;
      if(btnFinalizar) btnFinalizar.disabled = true;
      return;
    }

    const arr = atencionesPaciente(idPaciente);
    const abierta = atencionAbierta(idPaciente);

    if(btnToggleConsultas){
      btnToggleConsultas.disabled = false;
      btnToggleConsultas.innerHTML = consultasVisible
        ? '<i class="bi bi-eye-slash me-1"></i> Ocultar consultas'
        : '<i class="bi bi-eye me-1"></i> Mostrar consultas';
    }


    if(btnIniciar){
      btnIniciar.disabled = !!abierta || creandoAtencionEnCurso;
      btnIniciar.style.opacity = (abierta || creandoAtencionEnCurso) ? '0.55' : '1';
      btnIniciar.style.cursor = (abierta || creandoAtencionEnCurso) ? 'not-allowed' : 'pointer';
      if(creandoAtencionEnCurso){
        btnIniciar.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Iniciando...';
      }else{
        btnIniciar.innerHTML = '<i class="bi bi-play-circle me-1"></i> Iniciar';
      }
    }

    if(btnFinalizar){
      btnFinalizar.disabled = !abierta || finalizandoAtencionEnCurso;
      btnFinalizar.style.opacity = (abierta && !finalizandoAtencionEnCurso) ? '1' : '0.55';
      btnFinalizar.style.cursor = (abierta && !finalizandoAtencionEnCurso) ? 'pointer' : 'not-allowed';
      btnFinalizar.innerHTML = finalizandoAtencionEnCurso
        ? '<i class="bi bi-hourglass-split me-1"></i> Finalizando...'
        : (abierta
          ? '<i class="bi bi-check-circle me-1"></i> Finalizar'
          : '<i class="bi bi-lock me-1"></i> Cerrada ✓');
    }

    resumen.textContent = 'Total consultas: ' + arr.length + (arr[0] ? ' · Última: ' + fechaVisual(arr[0].fecha_atencion) : '') + ' · Vista integral activa';

    if(activaBox){
      /*
        AUROSANAX FIX:
        No sobrescribir el detalle abierto por el botón Ver.
        Si hay una consulta seleccionada (atencionActivaId), se mantiene visible.
      */
      if(abierta){
        activaBox.style.display = 'block';
        activaBox.innerHTML =
          '<div class="auro-atencion-status abierta">' +
          '<b>🟢 ABIERTA</b> · Consulta #' + safe(abierta.numero_consulta) + '<br>' +
          '<span>' + safe(fechaVisual(abierta.fecha_atencion)) + ' ' + safe(abierta.hora_atencion) + '</span>' +
          '</div>';
      }else if(!atencionActivaId){
        activaBox.style.display = 'block';
        activaBox.innerHTML =
          '<div class="auro-atencion-status cerrada">' +
          '<b>🔵 FINALIZADA</b> · Sin consulta abierta' +
          '</div>';
      }
    }

    if(!consultasVisible){
      lista.innerHTML = '<div class="sheet-note mt-2"><i class="bi bi-eye-slash me-1"></i> Consultas ocultas. Presione <b>Mostrar consultas</b> para verlas.</div>';
      return;
    }

    if(!arr.length && !atencionesSheetsCargadas && !atencionesSheetsCargando){
      lista.innerHTML = '<div class="text-muted small">Cargando atenciones desde Google Sheets...</div>';
      cargarAtencionesDesdeSheets(false).then(renderAtencionesPaciente);
      return;
    }

    if(!arr.length){
      lista.innerHTML = '<div class="text-muted small">Este paciente aún no tiene atenciones registradas.</div>';
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(arr.length / CONSULTAS_POR_PAGINA));
    if(consultasPaginaActual > totalPaginas) consultasPaginaActual = totalPaginas;
    if(consultasPaginaActual < 1) consultasPaginaActual = 1;

    const inicioPagina = (consultasPaginaActual - 1) * CONSULTAS_POR_PAGINA;
    const arrPagina = arr.slice(inicioPagina, inicioPagina + CONSULTAS_POR_PAGINA);

    const filasTabla = arrPagina.map(a => {
      const badge = String(a.estado_atencion).toLowerCase() === 'abierta' ? 'badge-blue' : 'badge-ok';
      return '<tr>' +
        '<td><b>#' + safe(a.numero_consulta) + '</b><br><small class="text-muted">' + safe(a.id_atencion || '—') + '</small></td>' +
        '<td>' + safe(fechaVisual(a.fecha_atencion)) + '</td>' +
        '<td>' + safe(horaVisualAtencion(a.hora_atencion || '—')) + '</td>' +
        '<td>' + safe(a.tipo_atencion || '—') + '</td>' +
        '<td>' + auroAtencionEspecialidadMedicoHTML(a) + '</td>' +
        '<td><span class="badge-auro ' + badge + '">' + safe(a.estado_atencion || '—') + '</span></td>' +
        '<td style="min-width:150px">' +
          '<div style="display:grid;grid-template-columns:1fr;gap:6px">' +
            '<button type="button" class="btn-action primary" data-atencion-id="' + safe(a.id_atencion) + '" style="width:100%">Ver</button>' +
            '<button type="button" class="btn-action soft" data-atencion-integral-id="' + safe(a.id_atencion) + '" style="width:100%;border:1px solid #8b1e5a;background:#fff7fb;color:#8b1e5a;font-weight:900">' +
              '<i class="bi bi-grid-1x2 me-1"></i> Vista integral' +
            '</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    const tarjetasMovil = arrPagina.map(a => {
      const badge = String(a.estado_atencion).toLowerCase() === 'abierta' ? 'badge-blue' : 'badge-ok';
      return '<div class="auro-consulta-card">' +
        '<div class="auro-consulta-card-head">' +
          '<div><b>Consulta #' + safe(a.numero_consulta) + '</b><br><small class="text-muted">' + safe(fechaVisual(a.fecha_atencion)) + ' · ' + safe(horaVisualAtencion(a.hora_atencion || '—')) + '</small></div>' +
          '<span class="badge-auro ' + badge + '">' + safe(a.estado_atencion || '—') + '</span>' +
        '</div>' +
        '<div class="small"><b>Tipo:</b> ' + safe(a.tipo_atencion || '—') + '</div>' +
        '<div class="small"><b>Especialidad:</b> ' + safe(auroAtencionResolverMedico(a).especialidad || '—') + '</div>' +
        '<div class="small"><b>Médico:</b> ' + safe(auroAtencionResolverMedico(a).nombre || '—') + '</div>' +
        '<div class="small text-muted"><b>ID:</b> ' + safe(a.id_atencion || '—') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr;gap:7px;margin-top:10px">' +
          '<button type="button" class="btn-action primary" data-atencion-id="' + safe(a.id_atencion) + '" style="width:100%">Ver consulta</button>' +
          '<button type="button" class="btn-action soft" data-atencion-integral-id="' + safe(a.id_atencion) + '" style="width:100%;border:1px solid #8b1e5a;background:#fff7fb;color:#8b1e5a;font-weight:900">' +
            '<i class="bi bi-grid-1x2 me-1"></i> Vista integral' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const paginacionHTML =
      '<div class="auro-consultas-paginacion">' +
        '<button type="button" class="btn-soft" id="btnAtencionesAnterior" ' + (consultasPaginaActual <= 1 ? 'disabled' : '') + '>Anterior</button>' +
        '<div class="small text-muted">Página ' + consultasPaginaActual + ' de ' + totalPaginas + ' · ' + arr.length + ' consulta' + (arr.length === 1 ? '' : 's') + '</div>' +
        '<button type="button" class="btn-soft" id="btnAtencionesSiguiente" ' + (consultasPaginaActual >= totalPaginas ? 'disabled' : '') + '>Siguiente</button>' +
      '</div>';

    lista.innerHTML =
      '<div class="auro-atenciones-desktop">' +
        '<div class="table-responsive">' +
          '<table class="table table-modern align-middle mb-0">' +
            '<thead><tr><th>Consulta</th><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Especialidad / médico</th><th>Estado</th><th>Acción</th></tr></thead>' +
            '<tbody>' + filasTabla + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div class="auro-atenciones-mobile">' + tarjetasMovil + '</div>' +
      paginacionHTML;

    const btnAnt = $('btnAtencionesAnterior');
    const btnSig = $('btnAtencionesSiguiente');

    if(btnAnt){
      btnAnt.addEventListener('click', function(){
        if(consultasPaginaActual > 1){
          consultasPaginaActual--;
          renderAtencionesPaciente();
        }
      });
    }

    if(btnSig){
      btnSig.addEventListener('click', function(){
        consultasPaginaActual++;
        renderAtencionesPaciente();
      });
    }

    lista.querySelectorAll('[data-atencion-id]').forEach(btn => {
      btn.addEventListener('click', function(){
        seleccionarAtencion(this.getAttribute('data-atencion-id'));
      });
    });

    lista.querySelectorAll('[data-atencion-integral-id]').forEach(btn => {
      btn.addEventListener('click', function(){
        const id = this.getAttribute('data-atencion-integral-id');

        if(
          window.AurosanaxVistaIntegral &&
          typeof window.AurosanaxVistaIntegral.abrir === 'function'
        ){
          window.AurosanaxVistaIntegral.abrir(id);
          return;
        }

        alert(
          'La Vista integral no está cargada. ' +
          'Incluya vista_integral_atencion.js después de los módulos clínicos.'
        );
      });
    });
  }

  function iniciarModulo(){
    inyectarEstilosAtenciones();
    asegurarBloque();
    renderAtencionesPaciente();

    cargarAtencionesDesdeSheets(false).then(function(){
      renderAtencionesPaciente();
    });

    cargarRecetasDesdeSheetsAtenciones(false);

    cargarMedicosActivosAtenciones(false).then(function(){
      renderAtencionesPaciente();
    });
  }

  function envolverFuncion(nombre, despues){
    const original = window[nombre];
    if(typeof original !== 'function' || original.__auroAtencionesWrapped) return;

    const nueva = function(){
      const r = original.apply(this, arguments);
      setTimeout(despues, 120);
      return r;
    };

    nueva.__auroAtencionesWrapped = true;
    window[nombre] = nueva;
  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      iniciarModulo();
      envolverFuncion('showScreen', function(){
        if($('historia') && $('historia').classList.contains('active')) iniciarModulo();
      });
      envolverFuncion('seleccionarPacienteHistoria', function(){
        /*
          AUROSANAX PASO 1 - INVALIDACIÓN QUIRÚRGICA AL CAMBIAR PACIENTE
          ---------------------------------------------------------------
          Al cambiar el paciente de Historia Clínica, la atención anterior
          deja de ser válida inmediatamente. Se notifica el mismo evento
          público ya utilizado por Atenciones para limpieza de contexto.

          Alcance:
          - No borra datos guardados.
          - No modifica Google Sheets, IDs, endpoints ni localStorage.
          - No cambia el flujo Iniciar / Ver / Finalizar.
          - Solo invalida el contexto temporal de la atención anterior.
        */
        const idAtencionAnterior = String(atencionActivaId || '').trim();

        consultasPaginaActual = 1;

        auroInvalidarContextoAtencion({
          idAnterior:idAtencionAnterior,
          idNueva:'',
          idPaciente:String(idPacienteActivo() || '').trim(),
          motivo:'cambio_paciente_historia',
          limpiarVisual:true
        });

        const box = $('auroAtencionActivaBox');
        if(box){
          box.style.display = 'none';
          box.innerHTML = '';
        }

        setTimeout(function(){
          cargarAtencionesDesdeSheets(true).then(renderAtencionesPaciente);
        },100);

        setTimeout(renderAtencionesPaciente,500);
      });

      envolverFuncion('actualizarTarjetaPacienteHistoria', function(){
        setTimeout(function(){ cargarAtencionesDesdeSheets(false).then(renderAtencionesPaciente); },100);
        setTimeout(renderAtencionesPaciente,500);
      });

      envolverFuncion('abrirHistoriaPaciente', function(){
        const idAtencionAnterior = String(atencionActivaId || '').trim();
        consultasPaginaActual = 1;

        auroInvalidarContextoAtencion({
          idAnterior:idAtencionAnterior,
          idNueva:'',
          idPaciente:String(idPacienteActivo() || '').trim(),
          motivo:'abrir_historia_paciente',
          limpiarVisual:true
        });

        const box = $('auroAtencionActivaBox');
        if(box){
          box.style.display = 'none';
          box.innerHTML = '';
        }

        setTimeout(function(){
          cargarAtencionesDesdeSheets(true).then(renderAtencionesPaciente);
        },300);

        setTimeout(renderAtencionesPaciente,800);
      });
    }, 700);
  });


  /* ==========================================================
     AUROSANAX - REINICIO DE ATENCIÓN PARA HISTORIA NUEVA
     Alcance:
     - Solo se ejecuta al recibir aurosanax:historia-nueva.
     - No elimina atenciones, historias ni datos guardados.
     - No crea ni modifica IDs.
     - Evita que los módulos conserven el id_atencion anterior.
  ========================================================== */

  function auroLimpiarCamposModulosConsultaNueva(){
    [
      'hc_antecedentes',
      'hc_examen',
      'hc_gineco',
      'hc_obstetricia',
      'hc_estetica',
      'hc_diagnostico',
      'hc_plan',
      'hc_docs'
    ].forEach(function(panelId){
      const panel = document.getElementById(panelId);
      if(!panel) return;

      panel.querySelectorAll('input, textarea, select').forEach(function(el){
        if(el.type === 'checkbox' || el.type === 'radio'){
          el.checked = false;
          return;
        }

        if(el.tagName === 'SELECT'){
          el.selectedIndex = 0;
          return;
        }

        if(!el.readOnly && !el.disabled){
          el.value = '';
        }
      });

      panel.querySelectorAll('[contenteditable="true"]').forEach(function(el){
        el.innerHTML = '';
      });
    });

    /* Oculta únicamente cajas visuales de datos previos. */
    [
      'auroAntecedentesPreviosBox',
      'auroExamenFisicoPrevioBox',
      'auroDiagnosticosPreviosBox'
    ].forEach(function(id){
      const box = document.getElementById(id);
      if(box){
        box.style.display = 'none';
        const contenido = box.querySelector(
          '.auro-previos-content, .auro-previos-body, [data-previos-content]'
        );
        if(contenido) contenido.innerHTML = '';
      }
    });
  }

  function auroReiniciarAtencionParaHistoriaNueva(evento){
    const detalle = evento?.detail || {};
    const idPacienteNuevo = String(detalle.id_paciente || '').trim();

    /*
      Reinicio exclusivamente en memoria.
      No se toca localStorage ni Google Sheets.
    */
    const idAtencionAnterior = String(atencionActivaId || '').trim();
    consultasPaginaActual = 1;

    auroInvalidarContextoAtencion({
      idAnterior:idAtencionAnterior,
      idNueva:'',
      idPaciente:idPacienteNuevo,
      motivo:'historia_nueva',
      limpiarVisual:false
    });

    const activaBox = $('auroAtencionActivaBox');
    if(activaBox){
      activaBox.style.display = 'none';
      activaBox.innerHTML = '';
    }

    /*
      Limpieza inmediata y refuerzos posteriores.
      Los refuerzos son necesarios porque algunos módulos terminan de
      renderizarse de forma asíncrona después del cambio de paciente.
    */
    auroLimpiarCamposModulosConsultaNueva();
    setTimeout(auroLimpiarCamposModulosConsultaNueva, 180);
    setTimeout(auroLimpiarCamposModulosConsultaNueva, 650);

    /*
      Se invocan únicamente limpiadores públicos ya existentes.
      Si un módulo no expone función de limpieza, no se altera.
    */
    [
      'auroLimpiarPlanVisualAntesDeCambiarAtencion',
      'auroLimpiarDiagnosticos',
      'auroExamenFisicoLimpiarFormulario',
      'limpiarFormularioGinecologia',
      'limpiarFormularioObstetricia',
      'limpiarFormularioEstetica',
      'limpiarFormularioDocumentos'
    ].forEach(function(nombre){
      try{
        if(typeof window[nombre] === 'function'){
          window[nombre]();
        }
      }catch(error){
        console.warn(
          'AUROSANAX ATENCIONES: no se pudo ejecutar ' + nombre,
          error
        );
      }
    });

    /*
      Compatibilidad con Plan y Examen Físico:
      un id_atencion vacío representa que todavía no existe consulta nueva.
    */
    try{
      if(typeof window.cambiarPlanPorAtencion === 'function'){
        window.cambiarPlanPorAtencion('');
      }
    }catch(error){
      console.warn('AUROSANAX ATENCIONES: no se pudo reiniciar Plan.', error);
    }

    try{
      if(typeof window.cambiarExamenFisicoPorAtencion === 'function'){
        window.cambiarExamenFisicoPorAtencion('');
      }
    }catch(error){
      console.warn('AUROSANAX ATENCIONES: no se pudo reiniciar Examen Físico.', error);
    }

    setTimeout(function(){
      renderAtencionesPaciente();
    }, 220);
  }

  window.addEventListener(
    'aurosanax:historia-nueva',
    auroReiniciarAtencionParaHistoriaNueva
  );

  window.vincularHistoriaAAtencionActual = vincularHistoriaAAtencionActual;

  window.limpiarCacheAtencionesAurosanax = function(){
    try{
      localStorage.removeItem(STORAGE_KEY);
      atencionActivaId = '';
      atencionesSheetsCargadas = false;
      atencionesSheetsCargando = false;
      consultasPaginaActual = 1;

      return cargarAtencionesDesdeSheets(true).then(function(lista){
        renderAtencionesPaciente();
        return {
          success:true,
          message:'Caché de atenciones reconstruida desde Google Sheets.',
          total:Array.isArray(lista) ? lista.length : 0
        };
      });
    }catch(error){
      return Promise.resolve({
        success:false,
        message:error.message || String(error)
      });
    }
  };

  window.sincronizarAtencionesLocales = async function(){
    const lista = leerLocal();
    if(!lista.length){
      alert('No hay atenciones locales para sincronizar.');
      return;
    }

    let ok = 0;
    let fail = 0;

    for(const item of lista){
      const r = await enviarAtencionGoogleSheets(normalizar(item));
      if(r && r.success) ok++;
      else fail++;
    }

    alert('Sincronización terminada. Enviadas: ' + ok + '. Fallidas: ' + fail + '.');
  };

  window.renderAtencionesPaciente = renderAtencionesPaciente;
  window.cargarAtencionesDesdeSheets = cargarAtencionesDesdeSheets;
  window.cargarRecetasDesdeSheetsAtenciones = cargarRecetasDesdeSheetsAtenciones;
  window.refrescarRecetasAtencionesDesdeSheets = function(){
    return cargarRecetasDesdeSheetsAtenciones(true).then(function(){
      renderAtencionesPaciente();
      return leerRecetasLocales();
    });
  };
  window.refrescarAtencionesDesdeSheets = function(){
    return cargarAtencionesDesdeSheets(true).then(function(){
      renderAtencionesPaciente();
      return leerLocal();
    });
  };

  window.refrescarMedicosAtenciones = function(){
    return cargarMedicosActivosAtenciones(true).then(function(lista){
      renderAtencionesPaciente();
      return lista;
    });
  };
  window.iniciarAtencionActual = crearAtencion;
  window.finalizarAtencionActual = finalizarAtencion;

  /* IASYN: alias moderno; se conservan los globals legacy por compatibilidad. */
  window.iasynAtenciones = Object.assign(window.iasynAtenciones || {}, {
    crearAtencion: crearAtencion,
    finalizarAtencion: finalizarAtencion
  });
  window.seleccionarAtencion = seleccionarAtencion;
  window.sincronizarContextoAtencion = sincronizarContextoAtencion;
  window.getAtencionActiva = function(){
    if(!atencionActivaId) return null;
    return leerLocal().find(a => String(a.id_atencion) === String(atencionActivaId)) || null;
  };
  window.getIdAtencionActiva = function(){
    const a = window.getAtencionActiva();
    return a ? a.id_atencion : '';
  };

  window.getContextoAtencionEpoch = function(){
    return contextoAtencionEpoch;
  };


  /* =====================================================
     AUROSANAX - ENRIQUECIMIENTO DE CONTEXTO EN MEMORIA
     Alcance estrictamente aditivo:
     - No modifica la hoja atenciones.
     - No agrega ni mueve columnas.
     - No altera crear, finalizar, guardar ni sincronizar atenciones.
     - Resuelve datos descriptivos desde los catálogos ya cargados.
     - El servicio solicitado es orientativo y nunca bloquea la atención.
  ===================================================== */

  function auroContextoListaMedicos(){
    if(Array.isArray(medicosActivosAtenciones) && medicosActivosAtenciones.length){
      return medicosActivosAtenciones;
    }

    if(Array.isArray(window.medicosAgendaWeb) && window.medicosAgendaWeb.length){
      return window.medicosAgendaWeb;
    }

    if(Array.isArray(window.medicos) && window.medicos.length){
      return window.medicos;
    }

    return [];
  }

  function auroContextoResolverMedico(idMedico){
    const id = String(idMedico || '').trim();
    const lista = auroContextoListaMedicos();

    const encontrado = lista.find(function(m){
      return idMedicoRegistro(m) === id;
    }) || null;

    if(!encontrado){
      return {
        id_medico: id,
        nombre_medico: '',
        especialidad_medico: ''
      };
    }

    return {
      id_medico: id || idMedicoRegistro(encontrado),
      nombre_medico: nombreCompletoMedico(encontrado),
      especialidad_medico: String(
        encontrado.especialidad_principal ||
        encontrado.especialidad ||
        encontrado.nombre_especialidad ||
        ''
      ).trim()
    };
  }

  function auroContextoBuscarCitaPorId(idCita){
    const id = String(idCita || '').trim();
    if(!id) return null;

    const fuentes = [];

    if(Array.isArray(window.citasAgendaWeb)){
      fuentes.push.apply(fuentes, window.citasAgendaWeb);
    }

    const seleccionada = leerCitaSeleccionadaAgenda();
    if(seleccionada && typeof seleccionada === 'object'){
      fuentes.push(seleccionada);
    }

    return fuentes.find(function(cita){
      const cid = String(
        cita?.id_cita ||
        cita?.id ||
        cita?.id_cita_web ||
        cita?.fila_origen ||
        ''
      ).trim();

      return cid === id;
    }) || null;
  }

  function auroContextoListaServicios(){
    const posibles = [
      window.serviciosAgendaWeb,
      window.serviciosActivos,
      window.servicios
    ];

    for(let i = 0; i < posibles.length; i++){
      if(Array.isArray(posibles[i]) && posibles[i].length){
        return posibles[i];
      }
    }

    return [];
  }

  function auroContextoIdServicio(servicio){
    return String(
      servicio?.id_servicio ||
      servicio?.id ||
      servicio?.codigo ||
      ''
    ).trim();
  }

  function auroContextoNombreServicio(servicio){
    return String(
      servicio?.nombre_servicio ||
      servicio?.servicio ||
      servicio?.nombre ||
      ''
    ).trim();
  }

  function auroContextoEspecialidadServicio(servicio){
    return String(
      servicio?.especialidad ||
      servicio?.nombre_especialidad ||
      servicio?.id_especialidad ||
      ''
    ).trim();
  }

  function auroContextoResolverServicioSolicitado(atencion){
    const salida = {
      id_servicio_solicitado: '',
      nombre_servicio_solicitado: '',
      especialidad_servicio_solicitado: '',
      servicio_origen: '',
      servicio_confirmado: false
    };

    const cita = auroContextoBuscarCitaPorId(atencion?.id_cita);
    if(!cita) return salida;

    salida.servicio_origen = 'cita';

    const idServicioCita = String(
      cita.id_servicio ||
      cita.servicio_id ||
      ''
    ).trim();

    const textoServicioCita = String(
      cita.nombre_servicio ||
      cita.servicio ||
      cita.tipo_cita ||
      cita.motivo ||
      ''
    ).trim();

    const listaServicios = auroContextoListaServicios();
    let servicio = null;

    if(idServicioCita){
      servicio = listaServicios.find(function(item){
        return auroContextoIdServicio(item) === idServicioCita;
      }) || null;
    }

    if(!servicio && textoServicioCita){
      const buscado = normalizarTextoSimple(textoServicioCita);

      servicio = listaServicios.find(function(item){
        const nombre = normalizarTextoSimple(auroContextoNombreServicio(item));
        return nombre && (
          nombre === buscado ||
          nombre.includes(buscado) ||
          buscado.includes(nombre)
        );
      }) || null;
    }

    if(servicio){
      salida.id_servicio_solicitado = auroContextoIdServicio(servicio);
      salida.nombre_servicio_solicitado = auroContextoNombreServicio(servicio);
      salida.especialidad_servicio_solicitado = auroContextoEspecialidadServicio(servicio);
      return salida;
    }

    /*
      Tolerancia deliberada:
      Si la cita contiene un texto libre que no coincide con el catálogo,
      se conserva como referencia sin bloquear ni convertirlo en dato confirmado.
    */
    salida.id_servicio_solicitado = idServicioCita;
    salida.nombre_servicio_solicitado = textoServicioCita;
    salida.especialidad_servicio_solicitado = String(
      cita.especialidad ||
      cita.nombre_especialidad ||
      cita.id_especialidad ||
      ''
    ).trim();

    return salida;
  }

  /* =====================================================
     AUROSANAX - CONTEXTO CLÍNICO CENTRAL COMPATIBLE
     Intervención quirúrgica y aditiva.

     OBJETIVO:
     - Entregar a Plan, Recetas, Diagnósticos y Examen Físico
       una referencia única de la atención actualmente seleccionada.
     - Conservar el flujo desde Agenda y el flujo manual sin cita.
     - No reemplazar ni eliminar variables, eventos o funciones existentes.

     REGLA:
     - id_cita es opcional.
     - id_atencion, id_paciente, id_historia e id_medico se informan
       exactamente como están registrados en la atención activa.
  ===================================================== */
  window.obtenerContextoAtencionActual = function(){
    try{
      const atencion = typeof window.getAtencionActiva === 'function'
        ? window.getAtencionActiva()
        : null;

      if(!atencion || !String(atencion.id_atencion || '').trim()){
        return null;
      }

      const medico = auroContextoResolverMedico(atencion.id_medico);
      const servicio = auroContextoResolverServicioSolicitado(atencion);

      const contexto = {
        id_atencion: String(atencion.id_atencion || '').trim(),
        id_paciente: String(atencion.id_paciente || '').trim(),
        id_historia: String(atencion.id_historia || '').trim(),
        id_cita: String(atencion.id_cita || '').trim(),
        id_medico: String(atencion.id_medico || '').trim(),

        /*
          Campos descriptivos calculados en memoria.
          No forman parte del payload de guardarAtencion.
        */
        nombre_medico: String(medico.nombre_medico || '').trim(),
        especialidad_medico: String(medico.especialidad_medico || '').trim(),

        /*
          Servicio solicitado:
          - Es orientativo.
          - Puede provenir de la cita o de texto libre.
          - Nunca bloquea la atención.
          - No se considera servicio confirmado.
        */
        id_servicio_solicitado: String(servicio.id_servicio_solicitado || '').trim(),
        nombre_servicio_solicitado: String(servicio.nombre_servicio_solicitado || '').trim(),
        especialidad_servicio_solicitado: String(servicio.especialidad_servicio_solicitado || '').trim(),
        servicio_origen: String(servicio.servicio_origen || '').trim(),
        servicio_confirmado: Boolean(servicio.servicio_confirmado),

        /*
          Especialidad clínica visible:
          prioriza la del servicio cuando existe; de lo contrario usa
          la especialidad principal configurada del médico.
        */
        especialidad_atencion: String(
          servicio.especialidad_servicio_solicitado ||
          medico.especialidad_medico ||
          ''
        ).trim(),

        numero_consulta: Number(atencion.numero_consulta || 0),
        fecha_atencion: String(atencion.fecha_atencion || '').trim(),
        hora_atencion: String(atencion.hora_atencion || '').trim(),
        tipo_atencion: String(atencion.tipo_atencion || '').trim(),
        estado_atencion: String(atencion.estado_atencion || '').trim(),
        origen_atencion: String(atencion.id_cita || '').trim() ? 'agenda' : 'manual'
      };

      return Object.freeze(contexto);
    }catch(error){
      console.warn(MODULO, 'No se pudo obtener el contexto de la atención actual.', error);
      return null;
    }
  };

  /* Alias descriptivo para integración gradual, sin retirar compatibilidad. */
  window.getContextoAtencionActual = window.obtenerContextoAtencionActual;

  /* Diagnóstico de solo lectura para pruebas controladas. */
  window.validarContextoAtencionActual = function(){
    const contexto = window.obtenerContextoAtencionActual();

    if(!contexto){
      return {
        valido:false,
        motivo:'No existe una atención activa seleccionada.',
        contexto:null,
        faltantes:['id_atencion']
      };
    }

    const requeridos = ['id_atencion','id_paciente','id_historia','id_medico'];
    const faltantes = requeridos.filter(function(campo){
      return !String(contexto[campo] || '').trim();
    });

    return {
      valido:faltantes.length === 0,
      motivo:faltantes.length
        ? 'La atención activa tiene identificadores clínicos pendientes.'
        : 'Contexto clínico válido.',
      contexto:contexto,
      faltantes:faltantes,
      admite_agenda:Boolean(contexto.id_cita),
      admite_atencion_manual:!contexto.id_cita
    };
  };
  window.__recetasPorAtencionDebug = function(idAtencion){
    const a = leerLocal().find(x => String(x.id_atencion) === String(idAtencion));
    return recetasPorAtencion(a ? normalizar(a) : null);
  };

  window.__recetasAtencionActualDebug = function(){
    const a = window.getAtencionActiva ? window.getAtencionActiva() : null;
    return {
      id_atencion_actual: a ? a.id_atencion : '',
      atencion: a,
      recetas_de_esta_atencion: a ? recetasPorAtencion(normalizar(a)) : [],
      total_recetas_locales: leerRecetasLocales().length
    };
  };

  window.__atencionesAurosanaxDebug = function(){
    return {
      modulo: MODULO,
      total: leerLocal().length,
      paciente_activo: idPacienteActivo(),
      sheets_cargadas: atencionesSheetsCargadas,
      sheets_cargando: atencionesSheetsCargando,
      recetas_sheets_cargadas: recetasSheetsCargadas,
      recetas_sheets_cargando: recetasSheetsCargando,
      recetas_locales: leerRecetasLocales().length,
      medicos_activos_cargados: medicosActivosCargados,
      medicos_activos: medicosActivosAtenciones.length,
      cita_agenda_seleccionada: leerCitaSeleccionadaAgenda(),
      atencion_activa: window.getAtencionActiva(),
      contexto_epoch: contextoAtencionEpoch
    };
  };

})();

/* =====================================================
   AUROSANAX ATENCIONES - CORRECCIÓN DEFINITIVA
   - Aislamiento estricto por id_paciente
   - Google Sheets tiene prioridad sobre localStorage
   - No reutiliza automáticamente historias antiguas
   - Permite vincular id_historia después de crear la atención
   - Bloquea atención de otro paciente
===================================================== */

/* ============================================================
   AUROSANAX ERP - VISTA INTEGRAL DE LA ATENCIÓN
   Versión: 1.2.0 - refinamiento premium quirúrgico y responsive

   ALCANCE ESTRICTO:
   - Solo lectura y presentación.
   - No modifica Google Sheets, Apps Script, localStorage ni módulos clínicos.
   - No altera botones Guardar, Ver, iniciar/finalizar atención ni sincronizaciones.
   - No escribe datos de regreso.
============================================================ */
(function(){
  'use strict';

  const MODULO = 'AUROSANAX_VISTA_INTEGRAL_V1_10_PULIDO_ANTIRREGRESIVO';
  const STORAGE_ATENCIONES = 'aurosanax_atenciones_local_v1';
  const STORAGE_RECETAS = 'aurosanax_recetas_emitidas_v1';

  function texto(v){ return String(v == null ? '' : v).trim(); }

  function esc(v){
    return texto(v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function norm(v){
    return texto(v)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function esVacio(v){
    const n = norm(v);
    if(!n) return true;

    return new Set([
      'seleccione','seleccione...','seleccionar','elegir indicacion rapida...',
      'no registrado','no registrada','no registrado en esta atencion',
      'no registrada en esta atencion','no disponible','sin informacion',
      'sin informacion registrada','sin datos','sin dato','undefined',
      'null','false','[]','{}','-','—'
    ]).has(n);
  }

  function esEstadoInterno(v){
    const n = norm(v);
    if(!n) return true;

    return (
      n.includes('no registrado en esta atencion') ||
      n.includes('no disponible para esta atencion') ||
      n.includes('seleccione una atencion') ||
      n.includes('seleccione primero') ||
      n.includes('cargando') ||
      n.includes('sin consulta activa') ||
      n.includes('sin atencion activa')
    );
  }

  function parseJSON(v, fallback){
    if(v && typeof v === 'object') return v;
    try{ return JSON.parse(texto(v)); }catch(_){ return fallback; }
  }

  function listaStorage(clave){
    try{
      const v = JSON.parse(localStorage.getItem(clave) || '[]');
      return Array.isArray(v) ? v : [];
    }catch(_){
      return [];
    }
  }

  function atencionPorId(id){
    return listaStorage(STORAGE_ATENCIONES).find(x =>
      texto(x?.id_atencion) === texto(id)
    ) || null;
  }

  function recetasPorAtencion(id){
    return listaStorage(STORAGE_RECETAS).filter(x =>
      texto(x?.id_atencion) === texto(id)
    );
  }

  function fechaVisual(v){
    const s = texto(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const p = s.slice(0,10).split('-');
      return p[2]+'/'+p[1]+'/'+p[0];
    }
    return s;
  }

  function horaVisual(v){
    const s = texto(v);
    if(!s) return '';
    if(/^\d{1,2}:\d{2}/.test(s)) return s.slice(0,5);
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(11,16);
    if(/^1899-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(11,16);
    return s;
  }

  function pacienteActual(){
    const fuentes = [
      window.getPacienteActivo && (()=>window.getPacienteActivo()),
      ()=>window.pacienteActivo,
      ()=>window.pacienteActual,
      ()=>window.currentPatient,
      ()=>window.selectedPatient,
      ()=>window.historiaActual,
      ()=>window.currentHistoria
    ];

    for(const fn of fuentes){
      try{
        const p = typeof fn === 'function' ? fn() : null;
        if(p && typeof p === 'object') return p;
      }catch(_){}
    }
    return {};
  }

  function nombrePaciente(p){
    return texto(
      p.nombre_completo ||
      p.paciente_nombre ||
      p.nombre ||
      [p.nombres,p.apellidos].filter(Boolean).join(' ')
    );
  }

  function calcularEdad(fecha){
    const s = texto(fecha);
    if(!s) return '';
    const d = new Date(s);
    if(Number.isNaN(d.getTime())) return '';

    const hoy = new Date();
    let edad = hoy.getFullYear() - d.getFullYear();
    const mes = hoy.getMonth() - d.getMonth();
    if(mes < 0 || (mes === 0 && hoy.getDate() < d.getDate())) edad--;

    return edad >= 0 && edad < 130 ? String(edad) : '';
  }

  function primero(obj, claves){
    for(const k of claves){
      const v = obj && obj[k];
      if(!esVacio(v)) return texto(v);
    }
    return '';
  }

  function dato(label, value, clase){
    if(esVacio(value)) return '';
    return '<div class="avi-data '+(clase || '')+'">'+
      '<span>'+esc(label)+'</span>'+
      '<b>'+esc(value)+'</b>'+
    '</div>';
  }

  function datosPacienteHTML(atencion){
    const p = pacienteActual();
    const nacimiento = primero(p,['fecha_nacimiento','nacimiento','fechaNacimiento']);
    const edad = primero(p,['edad']) || calcularEdad(nacimiento);
    const nombre =
      nombrePaciente(p) ||
      primero(atencion,['nombre_paciente','paciente_nombre']) ||
      texto(atencion?.id_paciente);

    return [
      dato('Paciente',nombre,'avi-col-2'),
      dato('Identificación',primero(p,['numero_documento','cedula','documento','identificacion'])),
      dato('Fecha de nacimiento',fechaVisual(nacimiento)),
      dato('Edad',edad ? edad+' años' : ''),
      dato('Sexo',primero(p,['sexo','genero'])),
      dato('Estado civil',primero(p,['estado_civil','estadoCivil'])),
      dato('Ocupación',primero(p,['ocupacion','profesion'])),
      dato('Teléfono',primero(p,['telefono','celular','movil'])),
      dato('Correo',primero(p,['correo','email']),'avi-col-2'),
      dato('Dirección',primero(p,['direccion','domicilio']),'avi-col-2'),
      dato('Aseguradora',primero(p,['aseguradora','seguro'])),
      dato('Contacto de emergencia',primero(p,['contacto_emergencia','emergencia_contacto','nombre_contacto_emergencia']),'avi-col-2')
    ].filter(Boolean).join('');
  }

  function datosAtencionHTML(a){
    let ctx = {};
    try{
      ctx = typeof window.obtenerContextoAtencionActual === 'function'
        ? (window.obtenerContextoAtencionActual() || {})
        : {};
    }catch(_){}

    return [
      dato('Consulta',a?.numero_consulta ? '#'+a.numero_consulta : ''),
      dato('Fecha',fechaVisual(a?.fecha_atencion)),
      dato('Hora',horaVisual(a?.hora_atencion)),
      dato('Tipo',a?.tipo_atencion),
      dato('Estado',a?.estado_atencion),
      dato('Médico',ctx.nombre_medico || a?.nombre_medico || a?.id_medico,'avi-col-2'),
      dato('Especialidad',ctx.especialidad_atencion || ctx.especialidad_medico,'avi-col-2'),
      dato('ID atención',a?.id_atencion,'avi-col-2 avi-id-card'),
      dato('ID historia',a?.id_historia,'avi-col-2 avi-id-card'),
      dato('ID cita',a?.id_cita || '')
    ].filter(Boolean).join('');
  }

  function etiquetaCampo(el){
    if(!el) return '';

    if(el.id){
      try{
        const lab = document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
        if(lab) return texto(lab.textContent);
      }catch(_){}
    }

    const parent = el.closest(
      '.form-group,.mb-3,.col,.col-md-2,.col-md-3,.col-md-4,'+
      '.col-md-6,.col-md-12,.obs-read,.auro-previos-line'
    );

    if(parent){
      const lab = parent.querySelector('label,.form-label,.field-label,.fw-semibold');
      if(lab && lab !== el) return texto(lab.textContent);
    }

    return texto(
      el.getAttribute('aria-label') ||
      el.dataset?.label ||
      el.name ||
      el.id
    );
  }

  function etiquetaCheckbox(el){
    const directa = texto(el.dataset?.label);
    if(directa) return directa;

    if(el.id){
      try{
        const lab = document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
        if(lab) return texto(lab.textContent);
      }catch(_){}
    }

    const contenedor = el.closest('label,.form-check,.form-switch');
    if(contenedor){
      const clon = contenedor.cloneNode(true);
      clon.querySelectorAll('input,select,textarea,button').forEach(x=>x.remove());
      const t = texto(clon.textContent).replace(/\s+/g,' ');
      if(t) return t;
    }

    return etiquetaCampo(el);
  }

  function valorCampo(el){
    if(!el) return '';

    if(el.type === 'checkbox' || el.type === 'radio'){
      if(!el.checked) return '';

      const raw = texto(el.value);
      if(!raw || norm(raw) === 'on' || esVacio(raw)) return 'Sí';
      return raw;
    }

    if(el.tagName === 'SELECT'){
      const op = el.options && el.selectedIndex >= 0
        ? el.options[el.selectedIndex]
        : null;
      const valor = texto(op?.textContent || el.value);
      return esVacio(valor) ? '' : valor;
    }

    const valor = texto(el.value || el.textContent);
    return esVacio(valor) ? '' : valor;
  }

  function limpiarEtiqueta(valor){
    let t = texto(valor).replace(/\s+/g,' ');
    if(!t) return 'Dato clínico';

    const mapa = {
      'hcrecetamedicamentos':'Medicamentos',
      'hcexamenessolicitados':'Exámenes solicitados',
      'hcinterconsultas':'Interconsultas',
      'hcordenesmedicas':'Órdenes médicas',
      'hcindicaciones':'Indicaciones generales',
      'tto. continuo':'Tratamiento continuo',
      'registro visible':'Dato clínico',
      'dato registrado':'Dato clínico'
    };

    const n = norm(t).replace(/\s/g,'');
    if(mapa[n]) return mapa[n];

    const n2 = norm(t);
    if(mapa[n2]) return mapa[n2];

    t = t
      .replace(/^hc/i,'')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g,'$1 $2')
      .replace(/[_-]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    return t || 'Dato clínico';
  }

  function limpiarTextoClinico(valor){
    let t = texto(valor).replace(/\s+/g,' ').trim();
    if(!t || esEstadoInterno(t)) return '';

    t = t
      .replace(/^registro visible\s*:?\s*/i,'')
      .replace(/^dato registrado\s*:?\s*/i,'')
      .trim();

    return esVacio(t) ? '' : t;
  }

  function interpretarAntecedenteFamiliar(valor){
    const raw = texto(valor);
    if(!raw) return null;

    const idx = raw.indexOf('{');
    if(idx < 0) return null;

    const data = parseJSON(raw.slice(idx),null);
    if(!data || typeof data !== 'object') return null;

    const salida = [];
    const patologicos = Array.isArray(data.patologicos) ? data.patologicos : [];

    patologicos.forEach(item=>{
      const patologia = texto(item?.patologia || item?.nombre);
      const parentesco = texto(item?.parentesco);
      const detalle = texto(item?.detalle);
      if(!patologia) return;

      salida.push({
        etiqueta:'Antecedente familiar',
        valor:[
          patologia,
          parentesco ? 'Parentesco: '+parentesco : '',
          detalle ? 'Detalle: '+detalle : ''
        ].filter(Boolean).join(' · '),
        tipo:'texto'
      });
    });

    return salida.length ? salida : null;
  }

  function listaDesdeValor(valor){
    const raw = texto(valor);
    if(!raw) return null;

    const data = parseJSON(raw,null);
    if(Array.isArray(data)){
      const items = data.map(x =>
        typeof x === 'string'
          ? texto(x)
          : texto(x?.texto || x?.indicacion || x?.descripcion || x?.nombre)
      ).filter(x=>!esVacio(x));

      return items.length ? items : null;
    }

    const numerados = raw
      .split(/\s+(?=\d+\.\s)/)
      .map(x=>x.replace(/^\d+\.\s*/,'').trim())
      .filter(Boolean);

    return numerados.length > 1 ? numerados : null;
  }

  function deduplicarPares(pares){
    const salida = [];
    const vistos = new Set();

    pares.forEach(p=>{
      const etiqueta = limpiarEtiqueta(p.etiqueta);
      const valor = limpiarTextoClinico(p.valor);
      if(!valor) return;

      const antecedente = interpretarAntecedenteFamiliar(valor);
      if(antecedente){
        antecedente.forEach(item=>{
          const clave = norm(item.etiqueta) + '||' + norm(item.valor);
          if(!clave || vistos.has(clave)) return;
          vistos.add(clave);
          salida.push(item);
        });
        return;
      }

      const claveContenido = norm(etiqueta) + '||' + norm(valor);
      if(!norm(valor) || vistos.has(claveContenido)) return;

      vistos.add(claveContenido);
      salida.push({
        etiqueta,
        valor,
        tipo:p.tipo || 'texto',
        anchoCompleto:Boolean(p.anchoCompleto || valor.length > 150)
      });
    });

    return salida;
  }

  function capturarPanel(panelId, opciones={}){
    const panel = document.getElementById(panelId);
    if(!panel) return [];

    const pares = [];

    panel.querySelectorAll('input,textarea,select').forEach(el=>{
      if(el.type === 'hidden') return;

      const valor = valorCampo(el);
      if(!valor) return;

      let etiqueta =
        (el.type === 'checkbox' || el.type === 'radio')
          ? etiquetaCheckbox(el)
          : etiquetaCampo(el);

      const eNorm = norm(etiqueta);
      const vNorm = norm(valor);

      if(panelId === 'hc_anamnesis' && (
        eNorm === 'tipo' ||
        eNorm.includes('tipo de consulta') ||
        (eNorm === 'tipo' && vNorm.includes('primera vez'))
      )){
        return;
      }

      pares.push({
        etiqueta:etiqueta || 'Dato clínico',
        valor,
        anchoCompleto:valor.length > 150 || el.tagName === 'TEXTAREA'
      });
    });

    const selectorResumen = opciones.excluirObsRead
      ? '.auro-previos-line,.auro-previos-mini-row,.auro-dx-item'
      : '.auro-previos-line,.auro-previos-mini-row,.obs-read,.auro-dx-item';

    panel.querySelectorAll(selectorResumen).forEach(n=>{
      if(n.closest('button')) return;

      const valor = limpiarTextoClinico(n.textContent);
      if(!valor || esEstadoInterno(valor)) return;

      let etiqueta = '';
      const titulo = n.querySelector(
        'b,strong,.fw-bold,.fw-semibold,.auro-dx-source-title,'+
        '.auro-previos-label,.label,.title'
      );

      if(titulo) etiqueta = texto(titulo.textContent);

      pares.push({
        etiqueta:etiqueta || 'Dato clínico',
        valor,
        anchoCompleto:valor.length > 150
      });
    });

    return deduplicarPares(pares);
  }


  function historiaFuenteAntecedentes(atencion){
    const idHistoria = texto(atencion?.id_historia);
    const idPaciente = texto(atencion?.id_paciente);
    if(!idHistoria) return null;

    const coincide = h =>
      h &&
      typeof h === 'object' &&
      texto(h.id_historia || h.id) === idHistoria &&
      (!idPaciente || !texto(h.id_paciente) || texto(h.id_paciente) === idPaciente);

    for(const h of [window.historiaActual, window.currentHistoria]){
      if(coincide(h)) return h;
    }

    try{
      if(typeof window.auroHistoriasPacienteOrdenadas === 'function' && idPaciente){
        const lista = window.auroHistoriasPacienteOrdenadas(idPaciente);
        if(Array.isArray(lista)){
          const h = lista.find(coincide);
          if(h) return h;
        }
      }
    }catch(error){
      console.warn(MODULO,'No se pudo resolver historia desde antecedentes.js.',error);
    }

    try{
      if(typeof window.auroHistoriaActualEdicion === 'function'){
        const h = window.auroHistoriaActualEdicion();
        if(coincide(h)) return h;
      }
    }catch(error){
      console.warn(MODULO,'No se pudo resolver historia en edición.',error);
    }

    return null;
  }

  function parsearAntecedenteEstructurado(valor, marker){
    const raw = texto(valor);
    if(!raw || !raw.startsWith(marker)) return null;
    try{
      const data = JSON.parse(raw.slice(marker.length));
      return data && typeof data === 'object' ? data : null;
    }catch(_){
      return null;
    }
  }

  function normalizarItemsAntecedente(items){
    return (Array.isArray(items) ? items : [])
      .map(item=>{
        if(!item) return null;
        if(typeof item === 'string'){
          const titulo = limpiarTextoClinico(item);
          return titulo ? {titulo, detalle:''} : null;
        }

        const titulo = limpiarTextoClinico(
          item.titulo || item.nombre || item.descripcion ||
          item.biologico || item.vacuna || item.habito ||
          item.actividad || ''
        );

        const detalle = limpiarTextoClinico(
          item.detalle || item.observacion || item.observaciones || ''
        );

        if(!titulo && !detalle) return null;
        return {titulo:titulo || 'Registrado', detalle};
      })
      .filter(Boolean);
  }

  /*
    STABLE24 — saneamiento EXCLUSIVAMENTE VISUAL del Examen físico.
    - No modifica campos, almacenamiento, IDs, eventos ni módulos clínicos.
    - Conserva el contenido registrado; solo elimina prefijos repetidos y
      duplicados visuales producidos al capturar controles + resumen leído.
    - Si no puede normalizar con seguridad, devuelve el contenido stable.
  */
  function examenFisicoParesProfesional(){
    const originales = capturarPanel('hc_examen');
    if(!Array.isArray(originales) || !originales.length) return originales || [];

    try{
      let base = deduplicarPares(originales);

      /*
        PA canónica en Vista Integral — SOLO PRESENTACIÓN.
        El dueño del dato es Examen físico; hcPA conserva sistólica/diastólica.
        Aquí no se escribe, recalcula ni persiste ningún valor clínico.
        Si el formato no es inequívoco, se conserva el comportamiento previo.
      */
      const paCanonica = texto(document.getElementById('hcPA')?.value || '');
      const paMatch = paCanonica.match(/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/);

      if(paMatch){
        let paInsertada = false;

        base = base.reduce((salida,p)=>{
          const e = norm(p?.etiqueta || '');
          const esPA = (
            e === 'presion arterial' ||
            e === 'presion arterial sistolica' ||
            e === 'presion arterial diastolica'
          );

          if(!esPA){
            salida.push(p);
            return salida;
          }

          if(!paInsertada){
            salida.push(
              {
                ...p,
                etiqueta:'Presión arterial sistólica',
                valor:paMatch[1]+' mmHg',
                anchoCompleto:false
              },
              {
                ...p,
                etiqueta:'Presión arterial diastólica',
                valor:paMatch[2]+' mmHg',
                anchoCompleto:false
              }
            );
            paInsertada = true;
          }

          return salida;
        },[]);
      }

      const regiones = base
        .map(p=>normalizarClaveClinicaExamen(p?.etiqueta || ''))
        .filter(x=>x && x !== 'dato clinico');

      const salida = [];
      const vistos = [];

      const tieneSignosIndividuales = base.some(p=>{
        const e = norm(p?.etiqueta || '');
        return (
          e.includes('presion arterial') ||
          e.includes('frecuencia cardiaca') ||
          e.includes('frecuencia respiratoria') ||
          e.includes('temperatura') ||
          e.includes('saturacion')
        );
      });

      base.forEach(p=>{
        const etiqueta = limpiarEtiqueta(p?.etiqueta || 'Dato clínico');
        let valor = limpiarTextoClinico(p?.valor || '');
        if(!valor) return;

        const etiquetaNormSimple = norm(etiqueta);
        const valorNormSimple = norm(valor);

        /*
          Si PA/FC/FR/T°/SatO2 ya están visibles por separado,
          no repetir el renglón agregado "Signos vitales registrados...".
        */
        if(
          tieneSignosIndividuales &&
          etiquetaNormSimple === 'dato clinico' &&
          valorNormSimple.includes('signos vitales registrados')
        ){
          return;
        }

        const eNorm = normalizarClaveClinicaExamen(etiqueta);
        const vNormOriginal = normalizarClaveClinicaExamen(valor);

        // Omitir resúmenes agregados que ya contienen varias regiones individuales.
        const otrasRegiones = regiones
          .filter(r=>r && r !== eNorm && r.length >= 4)
          .filter(r=>vNormOriginal.includes(r));

        if(otrasRegiones.length >= 2) return;

        const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

        [
          new RegExp('^\\s*Examen\\s+f[ií]sico\\s+(?:por\\s+sistemas|regional)\\s*'+escRx(etiqueta)+'\\s*[:\\-]?\\s*','i'),
          new RegExp('^\\s*'+escRx(etiqueta)+'\\s+(?:Hallazgos\\s+regionales|Observaci[oó]n)\\s*[:\\-]?\\s*','i'),
          new RegExp('^\\s*'+escRx(etiqueta)+'\\s*[:\\-]\\s*','i')
        ].forEach(rx=>{ valor = valor.replace(rx,'').trim(); });

        // Quitar prefijos repetidos sin tocar el hallazgo clínico.
        for(let i=0;i<3;i++){
          const antes = valor;
          valor = valor
            .replace(/^Genitales\s*(?:Observaci[oó]n)?\s*[:\-]\s*/i,'')
            .replace(/^Canal\s+vaginal\s*(?:Observaci[oó]n)?\s*[:\-]\s*/i,'')
            .replace(/^Abdomen\s*(?:Hallazgos\s+regionales|Observaci[oó]n)?\s*[:\-]\s*/i,'')
            .replace(/^T[oó]rax\/Respiratorio\s*[:\-]\s*/i,'')
            .trim();
          if(valor === antes) break;
        }

        if(!valor) return;

        const vNorm = normalizarClaveClinicaExamen(valor);

        const duplicado = vistos.some(x=>{
          if(x.e === eNorm && (x.v === vNorm || x.v.includes(vNorm) || vNorm.includes(x.v))) return true;
          if(x.v === vNorm && vNorm.length > 8) return true;
          return false;
        });
        if(duplicado) return;

        vistos.push({e:eNorm,v:vNorm});

        salida.push({
          ...p,
          etiqueta,
          valor,
          anchoCompleto:Boolean(p?.anchoCompleto || valor.length > 150)
        });
      });

      return salida.length ? salida : originales;
    }catch(error){
      console.warn(MODULO,'No se pudo normalizar visualmente Examen físico; se conserva stable.',error);
      return originales;
    }
  }

  function normalizarClaveClinicaExamen(s){
    return norm(
      limpiarTextoClinico(s)
        .replace(/\bexamen\s+f[ií]sico\s+(?:regional|por\s+sistemas)\b/gi,'')
        .replace(/\bhallazgos\s+regionales\b/gi,'')
        .replace(/\bobservaci[oó]n\b/gi,'')
        .replace(/[:|·\-–—]+/g,' ')
    );
  }

  function antecedentesGrupoHTML(titulo, items){
    const lista = normalizarItemsAntecedente(items);
    if(!lista.length) return '';

    const grupoVacunas = /vacunas|covid/i.test(titulo);
    const grupoHabitos = /hábitos|actividad|alimentación/i.test(titulo);

    return '<div class="avi-subgroup avi-ant-group'+
      (grupoVacunas ? ' avi-ant-vacunas' : '')+
      (grupoHabitos ? ' avi-ant-habitos' : '')+'">'+
      '<h5>'+esc(titulo)+'</h5>'+
      '<div class="avi-ant-grid">'+
        lista.map(item=>
          '<div class="avi-ant-card">'+
            '<b class="avi-ant-title">'+esc(item.titulo)+'</b>'+
            (item.detalle ? '<p class="avi-ant-detail">'+
              esc(item.detalle)
                .replace(/Dosis\s+(\d+)/gi,'Dosis&nbsp;$1')
                .replace(/Consulta\s+#?(\d+)/gi,'Consulta&nbsp;#$1')+
            '</p>' : '')+
          '</div>'
        ).join('')+
      '</div>'+
    '</div>';
  }

  function antecedentesDesdeFuenteHTML(atencion){
    const h = historiaFuenteAntecedentes(atencion);
    if(!h){
      return paresHTML(capturarPanel('hc_antecedentes'));
    }

    try{
      const personales = texto(h.antecedentes_personales);
      const gineco = texto(h.antecedentes_gineco_obstetricos);

      const jsonPersonales = parsearAntecedenteEstructurado(
        personales,
        'AUROSANAX_ANT_PERSONALES_V1::'
      );

      const jsonGineco = parsearAntecedenteEstructurado(
        gineco,
        'AUROSANAX_ANT_GINECO_OBS_V1::'
      );

      const bloques = [];

      if(typeof window.auroExtraerItemsAntecedentePremium !== 'function'){
        return paresHTML(capturarPanel('hc_antecedentes'));
      }

      const patologicosFuente = jsonPersonales
        ? (jsonPersonales.patologicos || '')
        : (
            typeof window.auroExtraerFuentePatologicosPersonales === 'function'
              ? window.auroExtraerFuentePatologicosPersonales(personales)
              : personales
          );

      bloques.push(
        antecedentesGrupoHTML(
          'Patológicos personales',
          window.auroExtraerItemsAntecedentePremium(patologicosFuente,'patologia')
        )
      );

      bloques.push(
        antecedentesGrupoHTML(
          'Quirúrgicos',
          window.auroExtraerItemsAntecedentePremium(
            h.antecedentes_quirurgicos || '',
            'quirurgico'
          )
        )
      );

      bloques.push(
        antecedentesGrupoHTML(
          'Alergias',
          window.auroExtraerItemsAntecedentePremium(
            h.alergias || '',
            'alergia'
          )
        )
      );

      if(jsonPersonales){
        if(typeof window.auroResumenCovidItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'COVID-19',
              window.auroResumenCovidItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenVacunasItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Vacunas registradas',
              window.auroResumenVacunasItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenHabitosItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Hábitos registrados',
              window.auroResumenHabitosItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenEstiloVidaItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Actividad física registrada',
              window.auroResumenEstiloVidaItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenAlimentacionItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Alimentación',
              window.auroResumenAlimentacionItemsDesdeJson(jsonPersonales)
            )
          );
        }
      }else{
        if(typeof window.auroExtraerVacunasRegistradas === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Vacunas registradas',
              window.auroExtraerVacunasRegistradas(personales)
            )
          );
        }

        if(typeof window.auroExtraerHabitosRegistrados === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Hábitos registrados',
              window.auroExtraerHabitosRegistrados(personales)
            )
          );
        }

        if(typeof window.auroExtraerActividadRegistrada === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Actividad física registrada',
              window.auroExtraerActividadRegistrada(personales)
            )
          );
        }
      }

      if(jsonGineco){
        if(typeof window.auroResumenObstetricosItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Obstétricos',
              window.auroResumenObstetricosItemsDesdeJson(jsonGineco)
            )
          );
        }

        if(typeof window.auroResumenGinecologicosItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Ginecológicos',
              window.auroResumenGinecologicosItemsDesdeJson(jsonGineco)
            )
          );
        }
      }else{
        bloques.push(
          antecedentesGrupoHTML(
            'Gineco-obstétricos',
            window.auroExtraerItemsAntecedentePremium(gineco,'gineco')
          )
        );
      }

      bloques.push(
        antecedentesGrupoHTML(
          'Medicación actual',
          window.auroExtraerItemsAntecedentePremium(
            h.medicacion_actual || '',
            'medicacion'
          )
        )
      );

      bloques.push(
        antecedentesGrupoHTML(
          'Familiares',
          window.auroExtraerItemsAntecedentePremium(
            h.antecedentes_familiares || '',
            'familiares'
          )
        )
      );

      const html = bloques.filter(Boolean).join('');
      return html || paresHTML(capturarPanel('hc_antecedentes'));

    }catch(error){
      console.warn(MODULO,'Falló lector estructurado de Antecedentes; fallback stable.',error);
      return paresHTML(capturarPanel('hc_antecedentes'));
    }
  }


  function diagnosticosVistaHTML(){
    const panel = document.getElementById('hc_diagnostico');
    if(!panel) return '';

    const items = [...panel.querySelectorAll('.auro-dx-item')];

    if(items.length){
      const tarjetas = [];

      items.forEach(item=>{
        const codigo = limpiarTextoClinico(
          item.querySelector('.auro-dx-code,[data-cie10],.cie10-code')?.textContent || ''
        );
        const nombre = limpiarTextoClinico(
          item.querySelector('.auro-dx-name,.auro-dx-desc,[data-diagnostico],.diagnostico-nombre')?.textContent || ''
        );
        const textoItem = limpiarTextoClinico(item.textContent || '');

        let clase = '';
        let tipo = '';

        if(/\bprincipal\b/i.test(textoItem)) clase = 'Principal';
        else if(/\basociad[oa]s?\b/i.test(textoItem)) clase = 'Asociado';

        if(/\bdefinitiv[oa]\b/i.test(textoItem)) tipo = 'Definitivo';
        else if(/\bpresuntiv[oa]\b/i.test(textoItem)) tipo = 'Presuntivo';

        const titulo = [codigo, nombre].filter(Boolean).join(' — ');
        if(!titulo) return;

        const meta = [clase,tipo].filter(Boolean);

        tarjetas.push(
          '<div class="avi-dx-card">'+
            '<div class="avi-dx-main">'+esc(titulo)+'</div>'+
            (meta.length
              ? '<div class="avi-dx-meta">'+meta.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>'
              : '')+
          '</div>'
        );
      });

      if(tarjetas.length){
        return '<div class="avi-dx-grid">'+tarjetas.join('')+'</div>';
      }
    }

    const pares = deduplicarPares(
      capturarPanel('hc_diagnostico').filter(p=>{
        const e = norm(p?.etiqueta || '');
        const v = norm(p?.valor || '');

        if(!v) return false;
        if(e === 'dx principal' && /^(si|sí|no)$/.test(v)) return false;
        if(e === 'dato clinico' && /^(definitivo|presuntivo)$/.test(v)) return false;
        if(v.includes('consultar protocolo')) return false;

        return true;
      })
    );

    return paresHTML(pares);
  }


  function valorClinicoVisualHTML(valor){
    /*
      SOLO presentación:
      protege rangos numéricos clínicos (3-4, 0-1, 11-12, etc.)
      sin modificar el dato almacenado.
    */
    return esc(valor).replace(
      /(^|[\s(:,;])(\d+)\s*[-–—]\s*(\d+)(?=$|[\s).,;:])/g,
      function(_, prefijo, a, b){
        return prefijo+'<span class="avi-nowrap">'+a+'-'+b+'</span>';
      }
    );
  }

  function paresHTMLClinico(pares, claseExtra){
    if(!Array.isArray(pares) || !pares.length) return '';

    return '<div class="avi-lines '+esc(claseExtra || '')+'">'+pares.map(p=>{
      const lista = listaDesdeValor(p.valor);

      if(lista){
        return '<div class="avi-line avi-span-full">'+
          '<b>'+esc(p.etiqueta)+'</b>'+
          '<ul class="avi-clean-list">'+
            lista.map(item=>'<li>'+valorClinicoVisualHTML(item)+'</li>').join('')+
          '</ul>'+
        '</div>';
      }

      return '<div class="avi-line'+(p.anchoCompleto?' avi-span-full':'')+'">'+
        '<b>'+esc(p.etiqueta)+'</b>'+
        '<p>'+valorClinicoVisualHTML(p.valor)+'</p>'+
      '</div>';
    }).join('')+'</div>';
  }

  function anamnesisVistaHTML(){
    const capturados = capturarPanel('hc_anamnesis');

    /*
      VISTA INTEGRAL > ANAMNESIS
      - "Plantilla sindrómica" es metadato de configuración/llenado y no
        forma parte del resumen clínico final.
      - Si "Enfermedad actual" ya contiene explícitamente un síntoma marcado
        como "Sí", no se repite después como campo aislado.
      - Si el síntoma NO está contenido en la narrativa, se conserva.
      - Solo presentación: no modifica Anamnesis, guardado ni datos.
    */
    const enfermedadActual = capturados.find(p=>
      norm(p?.etiqueta || '').includes('enfermedad actual')
    );

    const narrativaNorm = norm(enfermedadActual?.valor || '');

    const pares = capturados
      .filter(p=>{
        const etiqueta = norm(p?.etiqueta || '');
        const valor = norm(p?.valor || '');

        // Metadato interno de la plantilla: no mostrar en Vista Integral.
        if(etiqueta.includes('plantilla sindromica')) return false;

        /*
          Duplicado clínico:
          ocultar únicamente pares tipo "Sí" cuyo concepto ya está escrito
          dentro de Enfermedad actual. No se aplica a otros valores.
        */
        if(
          narrativaNorm &&
          valor === 'si' &&
          etiqueta &&
          narrativaNorm.includes(etiqueta)
        ){
          return false;
        }

        return true;
      })
      .map(p=>{
        const etiqueta = norm(p?.etiqueta || '');
        const valor = texto(p?.valor || '');

        const esNarrativo =
          etiqueta.includes('enfermedad actual') ||
          etiqueta.includes('motivo de consulta') ||
          etiqueta.includes('resumen') ||
          etiqueta.includes('observacion') ||
          valor.length > 120;

        return {
          ...p,
          anchoCompleto:Boolean(p?.anchoCompleto || esNarrativo)
        };
      });

    return paresHTMLClinico(pares,'avi-anamnesis-grid');
  }

  function obstetriciaVistaHTML(){
    const pares = capturarPanel('hc_obstetricia',{excluirObsRead:true});

    /*
      La sección solo existe si hay al menos un dato clínico real.
      Placeholders de un módulo no diligenciado NO crean una sección.
    */
    const vaciosObstetricia = new Set([
      '', '0', '-', '—', 'no clasificado', 'no aplica', 'ninguno',
      'ninguna', 'sin datos', 'sin dato', 'pendiente'
    ]);

    const utiles = pares.filter(p=>{
      const etiqueta = norm(p?.etiqueta || '');
      const valor = norm(p?.valor || '');

      if(!valor || vaciosObstetricia.has(valor)) return false;

      // textos de ayuda/estado del propio módulo
      if(
        valor.includes('no clasificado') ||
        valor.includes('sin informacion') ||
        valor.includes('no registrado') ||
        valor.includes('seleccione')
      ) return false;

      // una etiqueta aislada o marcador técnico tampoco cuenta como dato
      if(
        etiqueta === 'riesgo obstetrico' &&
        vaciosObstetricia.has(valor)
      ) return false;

      return true;
    });

    if(!utiles.length) return '';

    return paresHTMLClinico(utiles,'avi-obstetricia-grid');
  }

  function paresHTML(pares){
    if(!pares.length) return '';

    return '<div class="avi-lines">'+pares.map(p=>{
      const lista = listaDesdeValor(p.valor);

      if(lista){
        return '<div class="avi-line avi-span-full">'+
          '<b>'+esc(p.etiqueta)+'</b>'+
          '<ul class="avi-clean-list">'+
            lista.map(item=>'<li>'+esc(item)+'</li>').join('')+
          '</ul>'+
        '</div>';
      }

      return '<div class="avi-line'+(p.anchoCompleto?' avi-span-full':'')+'">'+
        '<b>'+esc(p.etiqueta)+'</b>'+
        '<p>'+esc(p.valor)+'</p>'+
      '</div>';
    }).join('')+'</div>';
  }

  function seccion(titulo, icono, contenido, abierta){
    if(!texto(contenido)) return '';

    /*
      AUROSANAX VISTA INTEGRAL ÉLITE:
      contador exclusivamente visual calculado sobre el HTML ya renderizado.
      No modifica datos, IDs, guardado ni relaciones clínicas.
    */
    const coincidencias = String(contenido || '').match(
      /class="[^"]*(?:avi-line|avi-med-card|avi-rx-card)[^"]*"/g
    ) || [];
    const totalVisual = coincidencias.length;
    const contador = totalVisual
      ? '<small class="avi-section-count">'+totalVisual+'</small>'
      : '';

    return '<details class="avi-section" '+(abierta?'open':'')+'>'+
      '<summary>'+
        '<span class="avi-section-label"><i class="bi '+esc(icono)+'"></i>'+esc(titulo)+contador+'</span>'+
        '<i class="bi bi-chevron-down avi-chevron"></i>'+
      '</summary>'+
      '<div class="avi-section-body">'+contenido+'</div>'+
    '</details>';
  }

  function medicamentoCards(valor){
    const raw = texto(valor);
    if(!raw) return '';

    let data = parseJSON(raw,null);
    if(!data){
      const lista = listaDesdeValor(raw);
      const arr = lista || [raw];
      return '<div class="avi-med-grid">'+arr.map(x=>
        '<article class="avi-med-card"><h5>Medicamento</h5><p>'+esc(x)+'</p></article>'
      ).join('')+'</div>';
    }

    if(!Array.isArray(data)) data = [data];

    const html = data.filter(Boolean).map((m,i)=>{
      if(typeof m === 'string'){
        return '<article class="avi-med-card"><h5>Medicamento '+(i+1)+'</h5><p>'+esc(m)+'</p></article>';
      }

      const nombre = texto(m.med || m.medicamento || m.nombre || m.texto);
      const filas = [
        ['Presentación',m.pres || m.presentacion],
        ['Vía',m.via],
        ['Cantidad',m.cantidad],
        ['Frecuencia',m.frec || m.frecuencia],
        ['Duración',m.dur || m.duracion],
        ['Indicaciones',m.ind || m.indicaciones]
      ].filter(x=>!esVacio(x[1]));

      if(!nombre && !filas.length) return '';

      return '<article class="avi-med-card">'+
        '<h5>'+esc(nombre || ('Medicamento '+(i+1)))+'</h5>'+
        '<div class="avi-med-details">'+filas.map(f=>
          '<div><span>'+esc(f[0])+'</span><b>'+esc(f[1])+'</b></div>'
        ).join('')+'</div>'+
      '</article>';
    }).filter(Boolean).join('');

    return html ? '<div class="avi-med-grid">'+html+'</div>' : '';
  }

  function planHTML(){
    const pares = capturarPanel('hc_plan');
    if(!pares.length) return '';

    const grupos = {
      indicaciones:[],
      medicamentos:[],
      examenes:[],
      ordenes:[],
      interconsultas:[],
      otros:[]
    };

    pares.forEach(p=>{
      const n = norm(p.etiqueta);
      const v = norm(p.valor);

      /*
        Campos de apoyo internos del formulario (p. ej.
        "EXAMEN ... EN PLAN = Sí") no son una orden clínica adicional.
        Se omiten SOLO en Vista Integral antes de clasificar, para impedir
        que la palabra "examen" los haga aparecer como examen solicitado.
      */
      const esBanderaInternaPlan =
        (n.includes(' en plan') || n.endsWith('en plan')) &&
        (v === 'si' || v === 'no' || v === 'true' || v === 'false');

      if(esBanderaInternaPlan) return;

      if(n.includes('medicamento')) grupos.medicamentos.push(p);
      else if(n.includes('examen')) grupos.examenes.push(p);
      else if(n.includes('interconsulta')) grupos.interconsultas.push(p);
      else if(n.includes('orden')) grupos.ordenes.push(p);
      else if(n.includes('indicacion')) grupos.indicaciones.push(p);
      else grupos.otros.push(p);
    });

    let html = '';

    if(grupos.indicaciones.length){
      html += '<div class="avi-subgroup"><h5>Indicaciones generales</h5>'+
        paresHTML(grupos.indicaciones)+'</div>';
    }

    if(grupos.medicamentos.length){
      html += '<div class="avi-subgroup"><h5>Medicamentos</h5>'+
        grupos.medicamentos.map(p=>medicamentoCards(p.valor)).join('')+'</div>';
    }

    if(grupos.examenes.length){
      html += '<div class="avi-subgroup">'+ 
        paresHTML(grupos.examenes)+'</div>';
    }

    if(grupos.ordenes.length){
      html += '<div class="avi-subgroup"><h5>Órdenes médicas</h5>'+
        paresHTML(grupos.ordenes)+'</div>';
    }

    if(grupos.interconsultas.length){
      html += '<div class="avi-subgroup"><h5>Interconsultas</h5>'+
        paresHTML(grupos.interconsultas)+'</div>';
    }

    /*
      Vista Integral:
      "grupos.otros" contiene banderas/campos estructurados internos del Plan
      (por ejemplo "... EN PLAN = Sí"). Se conservan en el módulo y en los
      datos, pero no se muestran en el visor clínico porque duplican o ensucian
      la lectura de Medicamentos, Exámenes, Indicaciones, Órdenes e Interconsultas.
    */

    return html;
  }

  function indicacionesHTML(valor){
    const raw = texto(valor);
    if(!raw || esVacio(raw)) return '';

    const lista = listaDesdeValor(raw);
    if(lista){
      return '<div class="avi-note">'+
        '<b>Indicaciones</b>'+
        '<ul class="avi-clean-list">'+
          lista.map(item=>'<li>'+esc(item)+'</li>').join('')+
        '</ul>'+
      '</div>';
    }

    return '<div class="avi-note"><b>Indicaciones</b><p>'+esc(raw)+'</p></div>';
  }

  function recetasHTML(idAtencion){
    const recetas = recetasPorAtencion(idAtencion);
    if(!recetas.length) return '';

    /*
      Evita repetición visual Plan -> Receta:
      si las indicaciones de una receta son exactamente las mismas que ya
      aparecen como indicaciones generales del Plan, la Vista Integral no
      las imprime por segunda vez dentro de la tarjeta de receta.
      La receta y sus datos permanecen intactos.
    */
    const indicacionesPlan = new Set(
      capturarPanel('hc_plan')
        .filter(p=>norm(p.etiqueta).includes('indicacion'))
        .map(p=>norm(limpiarTextoClinico(p.valor)))
        .filter(Boolean)
    );

    return '<div class="avi-rx-list">'+recetas.map(r=>{
      const meds = medicamentoCards(r.medicamento || r.medicamentos);
      const indicacionReceta = limpiarTextoClinico(r.indicaciones);
      const indicaciones = (
        indicacionReceta &&
        !indicacionesPlan.has(norm(indicacionReceta))
      ) ? indicacionesHTML(indicacionReceta) : '';

      return '<article class="avi-rx-card">'+
        '<div class="avi-rx-head">'+
          '<div class="avi-rx-heading">'+
            '<span class="avi-rx-kicker"><i class="bi bi-prescription2"></i> Receta emitida</span>'+
            '<h4>Receta médica</h4>'+
            '<small><b>ID receta</b> · '+esc(r.id_receta || r.id || '')+'</small>'+
          '</div>'+
          '<button type="button" class="avi-btn avi-btn-primary" data-avi-rx="'+esc(r.id_receta || r.id || '')+'">'+
            '<i class="bi bi-eye"></i> Ver receta completa'+
          '</button>'+
        '</div>'+
        '<div class="avi-rx-meta">'+
          dato('Fecha',fechaVisual(r.fecha_receta || r.fecha))+
          dato('CIE-10',r.diagnostico_cie10 || r.cie10)+
          dato('Estado',r.estado || 'Emitida')+
        '</div>'+
        meds+
        indicaciones+
      '</article>';
    }).join('')+'</div>';
  }

  function instalarEstilos(){
    if(document.getElementById('auroVistaIntegralCSS')) return;

    const s = document.createElement('style');
    s.id = 'auroVistaIntegralCSS';
    s.textContent = `
      /* ============================================================
         AUROSANAX VISTA INTEGRAL ÉLITE - SOLO PRESENTACIÓN
         - No cambia IDs clínicos, estado, eventos, backend ni guardado.
         - Mantiene Expandir / Contraer / Actualizar / Solo lectura.
         - Mantiene apertura exacta por id_atencion.
      ============================================================ */
      .avi-overlay{
        position:fixed;inset:0;z-index:100000;
        background:rgba(15,23,42,.76);
        backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
        display:flex;align-items:center;justify-content:center;padding:10px;
      }
      .avi-shell{
        width:min(98vw,1680px);height:min(97dvh,1080px);max-height:97dvh;
        background:#f7f8fb;border:1px solid rgba(255,255,255,.48);
        border-radius:24px;overflow:hidden;display:flex;flex-direction:column;
        box-shadow:0 36px 110px rgba(15,23,42,.42);
      }

      .avi-head{
        display:flex;justify-content:space-between;gap:18px;align-items:flex-start;
        padding:18px 20px;
        background:
          radial-gradient(circle at 100% 0,rgba(194,59,131,.11),transparent 34%),
          linear-gradient(135deg,#fff 0%,#fff8fc 54%,#fbf6fa 100%);
        border-bottom:1px solid #ecd8e4;
      }
      .avi-head-main{display:flex;gap:14px;align-items:flex-start;min-width:0}
      .avi-head-icon{
        width:48px;height:48px;flex:0 0 auto;border-radius:16px;
        display:grid;place-items:center;
        background:linear-gradient(135deg,#7a174f,#b52d76);
        color:#fff;font-size:20px;
        box-shadow:0 10px 24px rgba(122,23,79,.20);
      }
      .avi-head-copy{min-width:0}
      .avi-head-kicker{
        display:block;margin-bottom:3px;color:#9d174d;
        font-size:10px;font-weight:950;text-transform:uppercase;
        letter-spacing:.08em;
      }
      .avi-head h3{
        margin:0;color:#2f1526;font-size:21px;line-height:1.2;font-weight:950;
      }
      .avi-head-patient{
        margin-top:5px;color:#111827;font-size:15px;font-weight:950;
        line-height:1.25;overflow-wrap:anywhere;
      }
      .avi-head-subcontext{
        margin-top:2px;color:#64748b;font-size:12px;font-weight:750;
        line-height:1.3;overflow-wrap:anywhere;
      }
      .avi-technical-id{
        margin:5px 0 0!important;color:#94a3b8!important;
        font-size:10.5px!important;font-weight:700;letter-spacing:.01em;
        overflow-wrap:anywhere;
      }
      .avi-head-context{margin-top:9px;display:flex;gap:6px;flex-wrap:wrap}
      .avi-chip{
        display:inline-flex;align-items:center;gap:5px;
        border:1px solid #e7d8e1;background:#fff;color:#6c1d52;
        border-radius:999px;padding:4px 8px;font-size:10.5px;font-weight:850;
        line-height:1.1;
      }
      .avi-chip-strong{background:#fdf2f8;border-color:#f3cfe2;color:#7a174f}
      .avi-chip-status{background:#ecfdf5;border-color:#bbf7d0;color:#166534}
      .avi-chip-readonly{background:#f8fafc;border-color:#e2e8f0;color:#475569}

      .avi-close,.avi-btn{
        border:1px solid #e4d6df;background:#fff;color:#6c1d52;
        border-radius:12px;padding:8px 11px;font-weight:850;cursor:pointer;
        transition:transform .16s ease,box-shadow .16s ease,background .16s ease;
      }
      .avi-close:hover,.avi-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 7px 16px rgba(15,23,42,.08);
      }
      .avi-close{flex:0 0 auto}
      .avi-btn-primary{
        background:linear-gradient(135deg,#7a174f,#a9286c);
        color:#fff;border-color:transparent;
      }

      .avi-toolbar{
        display:flex;gap:8px;flex-wrap:wrap;padding:10px 18px;
        background:#fff;border-bottom:1px solid #e5e7eb;
        box-shadow:0 3px 12px rgba(15,23,42,.025);
      }
      .avi-toolbar .avi-btn{font-size:11.5px;padding:7px 10px}

      .avi-body{
        overflow:auto;padding:18px;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:thin;
      }

      .avi-overview-block{
        border:1px solid #e5e7eb;border-radius:19px;
        background:#fff;padding:13px;margin-bottom:12px;
        box-shadow:0 7px 20px rgba(15,23,42,.035);
      }
      .avi-group-title{
        display:flex;align-items:center;gap:7px;
        margin:0 0 10px;font-size:12px;color:#6c1d52;font-weight:950;
        text-transform:uppercase;letter-spacing:.055em;
      }
      .avi-group-title i{font-size:13px}
      .avi-data-grid{
        display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px;margin:0;
      }
      .avi-data{
        background:linear-gradient(180deg,#fff,#fcfdff);
        border:1px solid #e7ebf0;border-radius:13px;
        padding:9px 10px;min-width:0;min-height:58px;
        display:flex;flex-direction:column;justify-content:center;
      }
      .avi-data span{
        display:block;font-size:9.5px;color:#7c8798;text-transform:uppercase;
        font-weight:900;letter-spacing:.045em;
      }
      .avi-data b{
        display:block;margin-top:3px;color:#172033;font-size:11.8px;
        line-height:1.35;overflow-wrap:anywhere;
      }
      .avi-col-2{grid-column:span 2}
      .avi-id-card{
        background:#f8fafc;border-style:dashed;
      }
      .avi-id-card b{font-size:10.5px;color:#64748b;font-weight:750}

      .avi-clinical-divider{
        display:flex;align-items:center;gap:10px;
        margin:16px 2px 11px;color:#7a174f;
        font-size:11px;font-weight:950;text-transform:uppercase;
        letter-spacing:.065em;
      }
      .avi-clinical-divider::before,.avi-clinical-divider::after{
        content:"";height:1px;background:#e9d5e1;flex:1 1 auto;
      }
      .avi-clinical-divider span{flex:0 0 auto}

      .avi-section{
        background:#fff;border:1px solid #e2e7ed;border-radius:17px;
        margin-bottom:9px;overflow:hidden;
        box-shadow:0 5px 16px rgba(15,23,42,.028);
      }
      .avi-section summary{
        list-style:none;cursor:pointer;padding:12px 14px;
        display:flex;justify-content:space-between;gap:10px;align-items:center;
        font-weight:900;color:#2f3b4d;
        transition:background .15s ease,color .15s ease;
      }
      .avi-section summary:hover{background:#fffafd}
      .avi-section[open] summary{
        background:linear-gradient(90deg,#fff8fc 0%,#fff 60%);
        color:#5a1740;border-bottom:1px solid #f1e4ec;
      }
      .avi-section summary::-webkit-details-marker{display:none}
      .avi-section-label{display:flex;align-items:center;gap:8px;min-width:0}
      .avi-section-label>i{
        width:28px;height:28px;border-radius:9px;display:grid;place-items:center;
        color:#8b1e5a;background:#fdf2f8;border:1px solid #f5d5e6;
        flex:0 0 auto;font-size:12px;
      }
      .avi-section-count{
        display:inline-grid;place-items:center;min-width:22px;height:20px;
        padding:0 6px;border-radius:999px;background:#f1f5f9;color:#64748b;
        font-size:9.5px;font-weight:900;
      }
      .avi-section[open] .avi-chevron{transform:rotate(180deg)}
      .avi-chevron{transition:.18s;color:#94a3b8}
      .avi-section-body{padding:12px 14px 14px}

      .avi-lines{
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;
      }
      .avi-line{
        border:1px solid #e8edf2;border-radius:12px;padding:10px;
        background:#fbfdff;min-width:0;
      }
      .avi-span-full{grid-column:1/-1}
      .avi-nowrap{
        white-space:nowrap;
        display:inline-block;
      }

      /*
        Anamnesis: dos columnas clínicas en escritorio.
        Los textos narrativos ocupan todo el ancho.
        No altera otros módulos.
      */
      .avi-anamnesis-grid{
        grid-template-columns:repeat(2,minmax(0,1fr));
        grid-auto-flow:row dense;
        gap:10px 14px;
      }

      .avi-anamnesis-grid .avi-span-full{
        grid-column:1/-1;
      }

      @media(max-width:760px){
        .avi-anamnesis-grid{
          grid-template-columns:1fr;
        }
      }

      .avi-line b,.avi-note b{
        display:block;color:#7a174f;font-size:10px;
        text-transform:uppercase;letter-spacing:.045em;font-weight:900;
      }
      .avi-line p,.avi-note p{
        margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;
        color:#1f2937;font-size:12.2px;line-height:1.48;
      }
      .avi-clean-list{
        margin:6px 0 0;padding-left:19px;color:#1f2937;
        font-size:12.2px;line-height:1.5;
      }
      .avi-clean-list li+li{margin-top:4px}

      .avi-subgroup{
        border-top:1px dashed #e7eaf0;padding-top:11px;
      }
    /* Antecedentes: presentación clínica compacta, sin alterar datos */

    .avi-dx-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:12px;
    }
    .avi-dx-card{
      border:1px solid #ece8ef;
      border-radius:12px;
      padding:12px 14px;
      background:#fff;
      min-width:0;
    }
    .avi-dx-main{
      font-size:13px;
      line-height:1.45;
      font-weight:800;
      color:#2e2333;
      overflow-wrap:break-word;
      word-break:normal;
    }
    .avi-dx-meta{
      margin-top:8px;
      display:flex;
      flex-wrap:wrap;
      gap:6px;
    }
    .avi-dx-meta span{
      display:inline-flex;
      align-items:center;
      min-height:24px;
      padding:3px 8px;
      border-radius:999px;
      border:1px solid #e7dce8;
      background:#faf7fb;
      font-size:11px;
      line-height:1.2;
      color:#5d4c62;
      white-space:nowrap;
    }
    @media(max-width:760px){
      .avi-dx-grid{grid-template-columns:1fr;}
    }

    .avi-ant-group{
      margin:0 0 18px;
      min-width:0;
    }
    .avi-ant-group>h5{
      margin:0 0 9px;
      font-size:13px;
      line-height:1.25;
      font-weight:800;
      color:#25233a;
    }
    .avi-ant-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px 12px;
      align-items:start;
    }
    .avi-ant-card{
      min-width:0;
      border:1px solid #ece8ef;
      border-radius:12px;
      padding:10px 12px;
      background:#fff;
      overflow-wrap:break-word;
      word-break:normal;
    }
    .avi-ant-title{
      display:block;
      margin:0 0 5px;
      font-size:12px;
      line-height:1.3;
      font-weight:800;
      color:#32223a;
    }
    .avi-ant-detail{
      margin:0;
      font-size:12px;
      line-height:1.55;
      color:#55515b;
      white-space:normal;
      overflow-wrap:break-word;
      word-break:normal;
    }
    .avi-ant-detail::first-line{
      line-height:1.55;
    }
    /* Evita cortes visuales como "Dosis 1" dejando el número en otra línea. */
    .avi-ant-card{
      text-wrap:pretty;
    }
    .avi-ant-vacunas .avi-ant-grid{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
    .avi-ant-habitos .avi-ant-grid{
      grid-template-columns:repeat(3,minmax(0,1fr));
    }
    @media (max-width:980px){
      .avi-ant-grid,
      .avi-ant-vacunas .avi-ant-grid,
      .avi-ant-habitos .avi-ant-grid{
        grid-template-columns:1fr;
      }
    }

      .avi-subgroup:first-child{border-top:0;padding-top:0}
      .avi-subgroup+.avi-subgroup{margin-top:12px}
      .avi-subgroup>h5{
        margin:0 0 8px;color:#334155;font-size:12.5px;font-weight:950;
      }

      .avi-med-grid{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;
      }
      .avi-med-card{
        border:1px solid #ead7e2;border-radius:14px;padding:11px;
        background:linear-gradient(180deg,#fff,#fffafd);
        box-shadow:0 3px 10px rgba(122,23,79,.025);
      }
      .avi-med-card h5{
        margin:0 0 8px;color:#541536;font-size:13px;font-weight:900;
        line-height:1.3;
      }
      .avi-med-card p{margin:0;color:#334155;font-size:12px;line-height:1.48}
      .avi-med-details{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;
      }
      .avi-med-details div{
        border:1px solid #edf0f3;background:#fff;border-radius:10px;padding:7px 8px;
      }
      .avi-med-details span{
        display:block;color:#7c8798;font-size:8.8px;font-weight:900;
        text-transform:uppercase;letter-spacing:.035em;
      }
      .avi-med-details b{
        display:block;margin-top:3px;color:#1f2937;font-size:10.8px;
        line-height:1.35;overflow-wrap:anywhere;
      }

      .avi-rx-list{display:grid;gap:11px}
      .avi-rx-card{
        border:1px solid #e4c7da;border-radius:18px;padding:14px;background:#fff;
        box-shadow:0 8px 22px rgba(122,23,79,.055);
      }
      .avi-rx-head{
        display:flex;justify-content:space-between;gap:12px;align-items:flex-start;
        margin-bottom:9px;padding-bottom:10px;border-bottom:1px solid #f1e5ec;
      }
      .avi-rx-heading{min-width:0}
      .avi-rx-kicker{
        display:flex;align-items:center;gap:5px;
        color:#9d174d;font-size:9.5px;font-weight:950;text-transform:uppercase;
        letter-spacing:.055em;margin-bottom:3px;
      }
      .avi-rx-head h4{
        margin:0;color:#341224;font-size:14px;font-weight:950;line-height:1.25;
      }
      .avi-rx-head small{
        display:block;color:#94a3b8;margin-top:4px;
        font-size:9.8px;line-height:1.3;overflow-wrap:anywhere;
      }
      .avi-rx-head small b{color:#64748b}
      .avi-rx-meta{
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
        gap:7px;margin:9px 0 11px;
      }
      .avi-rx-meta .avi-data{min-height:50px;padding:7px 9px}
      .avi-note{
        margin-top:11px;border-top:1px solid #e5e7eb;padding-top:10px;
        background:#fcfdff;
      }
      .avi-loading{padding:34px;text-align:center;color:#64748b;font-weight:750}

      .avi-rx-overlay{
        position:fixed;inset:0;z-index:100010;background:rgba(15,23,42,.74);
        backdrop-filter:blur(3px);
        display:flex;align-items:center;justify-content:center;padding:14px;
      }
      .avi-rx-shell{
        width:min(1120px,100%);max-height:95vh;background:#fff;
        border-radius:22px;overflow:hidden;display:flex;flex-direction:column;
        box-shadow:0 30px 90px rgba(15,23,42,.38);
      }
      .avi-rx-view{
        overflow:auto;padding:14px;background:#f8fafc;
        -webkit-overflow-scrolling:touch;
      }

      @media(max-width:980px){
        .avi-overlay{padding:6px}
        .avi-shell{width:100%;height:98dvh;max-height:98dvh;border-radius:20px}
        .avi-data-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .avi-lines{grid-template-columns:repeat(2,minmax(0,1fr))}
        .avi-col-2{grid-column:span 2}
      }

      @media(max-width:760px){
        .avi-overlay,.avi-rx-overlay{padding:0;align-items:stretch}
        .avi-shell,.avi-rx-shell{
          width:100%;max-width:100%;height:100dvh;max-height:100dvh;
          border-radius:0;
        }
        .avi-head{
          padding:12px calc(12px + env(safe-area-inset-right)) 12px
            calc(12px + env(safe-area-inset-left));
          align-items:flex-start;
        }
        .avi-head-main{gap:10px}
        .avi-head-icon{width:40px;height:40px;border-radius:13px;font-size:17px}
        .avi-head h3{font-size:17px}
        .avi-head-patient{font-size:13.5px}
        .avi-head-subcontext{font-size:11px}
        .avi-close{min-height:42px;flex:0 0 auto;padding:8px 9px;font-size:11px}
        .avi-toolbar{
          display:grid;grid-template-columns:1fr 1fr;padding:8px 10px;gap:7px;
        }
        .avi-toolbar .avi-btn{width:100%;min-height:41px;font-size:11px}
        .avi-toolbar .avi-btn:last-child{grid-column:1/-1}
        .avi-body{
          padding:10px calc(10px + env(safe-area-inset-right))
            calc(14px + env(safe-area-inset-bottom))
            calc(10px + env(safe-area-inset-left));
        }
        .avi-overview-block{padding:10px;border-radius:16px;margin-bottom:9px}
        .avi-data-grid,.avi-lines,.avi-rx-meta,.avi-med-grid,.avi-med-details{
          grid-template-columns:1fr;
        }
        .avi-col-2,.avi-span-full{grid-column:auto}
        .avi-clinical-divider{margin:13px 2px 9px;font-size:9.5px}
        .avi-section{border-radius:15px;margin-bottom:8px}
        .avi-section summary{padding:10px 11px;font-size:12px}
        .avi-section-label>i{width:26px;height:26px}
        .avi-section-body{padding:9px 10px 11px}
        .avi-rx-head{display:grid;grid-template-columns:1fr}
        .avi-rx-head .avi-btn{width:100%;min-height:41px}
        .avi-chip{font-size:9.3px;padding:4px 7px}
        .avi-rx-card{padding:11px;border-radius:16px}
      }

      @media(max-width:430px){
        .avi-head-icon{display:none}
        .avi-head-kicker{font-size:9px}
        .avi-head h3{font-size:16px}
        .avi-close span{display:none}
      }

      /* ============================================================
         AUROSANAX VISTA INTEGRAL - VISOR DOCUMENTAL CLÍNICO V1.5
         SOLO ESCRITORIO >= 981px.
         - Hoja clínica central amplia, inspirada en visor A4.
         - Todo texto narrativo usa ancho documental completo.
         - Campos breves conservan distribución compacta.
         - Móvil/tablet existente NO se modifica.
         - Sin cambios de datos, eventos, guardado ni contexto clínico.
      ============================================================ */
      @media(min-width:981px){
        .avi-shell{
          width:min(98vw,1720px);
          height:min(97dvh,1100px);
          max-height:97dvh;
          background:#e9edf1;
        }

        .avi-head{
          padding:11px 18px;
          min-height:auto;
          background:linear-gradient(135deg,#fff 0%,#fff9fc 62%,#fbf5f9 100%);
        }
        .avi-head-main{gap:10px}
        .avi-head-icon{width:40px;height:40px;border-radius:12px;font-size:17px}
        .avi-head-kicker{font-size:9px;margin-bottom:1px}
        .avi-head h3{font-size:18px;line-height:1.15}
        .avi-head-patient{font-size:13.5px;margin-top:2px}
        .avi-head-subcontext{font-size:11px}
        .avi-technical-id{font-size:9.4px!important;margin-top:2px!important}
        .avi-head-context{margin-top:5px;gap:5px}
        .avi-chip{font-size:9.5px;padding:3px 7px}
        .avi-close{padding:7px 10px}

        .avi-toolbar{
          padding:7px 18px;
          background:#fff;
        }
        .avi-toolbar .avi-btn{
          min-height:34px;
          padding:7px 11px;
          font-size:11.5px;
        }

        .avi-body{
          padding:24px 20px 34px;
          background:#dfe4e9;
        }

        .avi-body > .avi-overview-block,
        .avi-body > .avi-clinical-divider,
        .avi-body > .avi-section,
        .avi-body > .avi-line{
          width:min(1120px,calc(100% - 36px));
          margin-left:auto;
          margin-right:auto;
          box-sizing:border-box;
        }

        .avi-body > .avi-overview-block:first-child{
          border-radius:10px 10px 0 0;
          padding-top:26px;
        }
        .avi-body > .avi-section:last-child{
          border-radius:0 0 10px 10px;
          padding-bottom:18px;
        }

        .avi-overview-block,
        .avi-clinical-divider,
        .avi-section{
          background:#fff;
          box-shadow:none;
        }

        .avi-overview-block{
          border:0;
          border-radius:0;
          padding:12px 42px 10px;
          margin-bottom:0;
          border-bottom:1px solid #e7e9ed;
        }

        .avi-group-title{
          margin:0 0 10px;
          font-size:11px;
          letter-spacing:.065em;
          color:#7a174f;
        }

        .avi-data-grid{
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:8px 22px;
        }
        .avi-data{
          min-height:auto;
          padding:3px 0 5px;
          border:0;
          border-radius:0;
          background:transparent;
          justify-content:flex-start;
        }
        .avi-data span{
          font-size:9.2px;
          line-height:1.15;
          color:#7a174f;
          margin-bottom:2px;
        }
        .avi-data b{
          margin-top:0;
          font-size:13.2px;
          line-height:1.34;
          color:#1f2937;
        }
        .avi-id-card{background:transparent;border:0}
        .avi-id-card b{font-size:10.5px;color:#64748b}

        .avi-clinical-divider{
          padding:16px 42px 8px;
          margin-top:0;
          margin-bottom:0;
          font-size:10.5px;
          color:#7a174f;
        }

        .avi-section{
          border:0;
          border-radius:0;
          margin-bottom:0;
          overflow:visible;
          border-bottom:1px solid #e8ebef;
        }
        .avi-section summary{
          padding:12px 42px 10px;
          font-size:13.5px;
          color:#3f1630;
          background:#fff!important;
        }
        .avi-section[open] summary{
          border-bottom:1px solid #f0e4eb;
        }
        .avi-section-label>i{
          width:27px;height:27px;border-radius:8px;
        }
        .avi-section-body{
          padding:14px 42px 22px;
        }

        .avi-lines{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px 26px;
          align-items:start;
        }
        .avi-line{
          border:0;
          border-radius:0;
          padding:4px 0 8px;
          background:transparent;
        }
        .avi-line.avi-span-full{
          grid-column:1/-1;
          width:100%;
        }
        .avi-line b,.avi-note b{
          font-size:10.2px;
          line-height:1.2;
          color:#7a174f;
          letter-spacing:.055em;
        }
        .avi-line p,.avi-note p{
          margin:5px 0 0;
          font-size:14px;
          line-height:1.62;
          color:#222b38;
          text-align:left;
          max-width:none;
          white-space:pre-wrap;
          overflow-wrap:anywhere;
        }
        .avi-line.avi-span-full p,
        .avi-note p{
          width:100%;
          max-width:100%;
        }
        .avi-clean-list{
          width:100%;
          max-width:100%;
          font-size:13.8px;
          line-height:1.58;
        }

        .avi-lines > .avi-line:only-child{
          grid-column:1/-1;
        }
        .avi-lines > .avi-line:only-child p{
          width:100%;
          max-width:100%;
        }

        .avi-subgroup{padding-top:13px}
        .avi-subgroup>h5{font-size:13.2px;margin-bottom:9px}

        .avi-med-grid{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
        }
        .avi-med-card{
          border:1px solid #ead7e2;
          border-radius:11px;
          padding:12px;
          background:#fffdfd;
          box-shadow:none;
        }
        .avi-med-card h5{font-size:13.4px}
        .avi-med-card p{font-size:13px;line-height:1.52}
        .avi-med-details b{font-size:11.4px}

        .avi-rx-card{
          border:1px solid #ead7e2;
          border-radius:12px;
          padding:14px;
          box-shadow:none;
          background:#fff;
        }
        .avi-rx-head h4{font-size:14.5px}
        .avi-rx-meta{grid-template-columns:repeat(3,minmax(0,1fr))}
        .avi-rx-meta .avi-data{
          border-bottom:1px solid #edf0f3;
          padding-bottom:7px;
        }

        .avi-loading{
          width:min(1120px,calc(100% - 36px));
          margin:0 auto;
          min-height:520px;
          background:#fff;
          padding-top:80px;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function cerrar(){
    document.getElementById('auroVistaIntegralOverlay')?.remove();
    document.body.style.overflow = '';
  }

  function cerrarReceta(){
    document.getElementById('auroVistaRecetaOverlay')?.remove();
  }

  async function abrirReceta(idReceta){
    instalarEstilos();
    const id = texto(idReceta);

    if(!id){
      alert('No se encontró el identificador de la receta.');
      return;
    }

    if(typeof window.pdfRecetaEmitida !== 'function'){
      alert('La vista oficial de Recetas no está disponible.');
      return;
    }

    try{
      await window.pdfRecetaEmitida(id);
    }catch(e){
      console.error(MODULO,e);
      alert('No se pudo abrir la vista oficial de la receta.');
    }
  }

  function encabezadoContexto(a){
    return [
      a?.numero_consulta ? '<span class="avi-chip avi-chip-strong">Consulta #'+esc(a.numero_consulta)+'</span>' : '',
      a?.fecha_atencion ? '<span class="avi-chip"><i class="bi bi-calendar3"></i>'+esc(fechaVisual(a.fecha_atencion))+'</span>' : '',
      a?.hora_atencion ? '<span class="avi-chip"><i class="bi bi-clock"></i>'+esc(horaVisual(a.hora_atencion))+'</span>' : '',
      a?.tipo_atencion ? '<span class="avi-chip">'+esc(a.tipo_atencion)+'</span>' : '',
      a?.estado_atencion ? '<span class="avi-chip avi-chip-status">'+esc(a.estado_atencion)+'</span>' : '',
      '<span class="avi-chip avi-chip-readonly"><i class="bi bi-lock"></i>Solo lectura</span>'
    ].filter(Boolean).join('');
  }

  function renderizar(idAtencion){
    const overlay = document.getElementById('auroVistaIntegralOverlay');
    const body = overlay?.querySelector('.avi-body');
    if(!overlay || !body) return;

    const idActivo = texto(
      typeof window.getIdAtencionActiva === 'function'
        ? window.getIdAtencionActiva()
        : ''
    );

    if(idActivo !== texto(idAtencion)){
      body.innerHTML =
        '<div class="avi-line avi-span-full"><b>Atención no verificada</b>'+
        '<p>No se pudo confirmar la consulta seleccionada.</p></div>';
      return;
    }

    const a = atencionPorId(idAtencion);
    if(!a){
      body.innerHTML =
        '<div class="avi-line avi-span-full"><b>Atención no encontrada</b>'+
        '<p>No se encontró la atención solicitada.</p></div>';
      return;
    }

    const anamnesis = seccion(
      'Anamnesis','bi-clipboard2-pulse',
      anamnesisVistaHTML(),true
    );

    const antecedentes = seccion(
      'Antecedentes de la historia clínica','bi-clock-history',
      antecedentesDesdeFuenteHTML(a),false
    );

    const examen = seccion(
      'Examen físico','bi-person-vcard',
      paresHTMLClinico(examenFisicoParesProfesional(),'avi-examen-grid'),true
    );

    const obstetricia = seccion(
      'Obstetricia','bi-heart-pulse',
      obstetriciaVistaHTML(),false
    );

    const diagnosticos = seccion(
      'Diagnósticos','bi-journal-medical',
      diagnosticosVistaHTML(),true
    );

    const plan = seccion(
      'Plan terapéutico','bi-list-check',
      planHTML(),true
    );

    const recetas = seccion(
      'Recetas asociadas','bi-prescription2',
      recetasHTML(idAtencion),true
    );

    const datosPaciente = datosPacienteHTML(a);
    const datosAtencion = datosAtencionHTML(a);

    body.innerHTML =
      (datosPaciente
        ? '<section class="avi-overview-block">'+
            '<h4 class="avi-group-title"><i class="bi bi-person-vcard"></i> Datos personales</h4>'+
            '<div class="avi-data-grid">'+datosPaciente+'</div>'+
          '</section>'
        : '')+
      (datosAtencion
        ? '<section class="avi-overview-block">'+
            '<h4 class="avi-group-title"><i class="bi bi-clipboard2-pulse"></i> Datos de la atención</h4>'+
            '<div class="avi-data-grid">'+datosAtencion+'</div>'+
          '</section>'
        : '')+
      '<div class="avi-clinical-divider"><span>Resumen clínico de la consulta</span></div>'+
      anamnesis+antecedentes+examen+obstetricia+diagnosticos+plan+recetas;

    const contextBox = overlay.querySelector('[data-avi-contexto]');
    if(contextBox) contextBox.innerHTML = encabezadoContexto(a);

    /*
      Cabecera clínica: utiliza únicamente datos ya disponibles en memoria.
      No consulta ni modifica backend y no cambia el contexto de la atención.
    */
    const p = pacienteActual();
    const nombreCabecera =
      nombrePaciente(p) ||
      primero(a,['nombre_paciente','paciente_nombre']) ||
      texto(a?.id_paciente) ||
      'Paciente';

    let ctxCabecera = {};
    try{
      ctxCabecera = typeof window.obtenerContextoAtencionActual === 'function'
        ? (window.obtenerContextoAtencionActual() || {})
        : {};
    }catch(_){}

    const medicoCabecera = texto(ctxCabecera.nombre_medico || a?.nombre_medico || a?.id_medico);
    const especialidadCabecera = texto(ctxCabecera.especialidad_atencion || ctxCabecera.especialidad_medico);

    const pacienteBox = overlay.querySelector('[data-avi-paciente]');
    if(pacienteBox) pacienteBox.textContent = nombreCabecera;

    const subcontextoBox = overlay.querySelector('[data-avi-subcontexto]');
    if(subcontextoBox){
      subcontextoBox.textContent = [
        medicoCabecera,
        especialidadCabecera
      ].filter(Boolean).join(' · ');
    }

    const idTecnicoBox = overlay.querySelector('[data-avi-id-tecnico]');
    if(idTecnicoBox) idTecnicoBox.textContent = 'ID atención · ' + texto(a.id_atencion || idAtencion);

    body.querySelectorAll('[data-avi-rx]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        abrirReceta(btn.getAttribute('data-avi-rx'));
      });
    });
  }

  async function esperarAtencion(id, maxMs){
    const inicio = Date.now();
    while(Date.now()-inicio < maxMs){
      const actual = texto(
        typeof window.getIdAtencionActiva === 'function'
          ? window.getIdAtencionActiva()
          : ''
      );
      if(actual === texto(id)) return true;
      await new Promise(r=>setTimeout(r,100));
    }
    return false;
  }

  async function abrir(idAtencion){
    instalarEstilos();

    const id = texto(idAtencion);
    const a = atencionPorId(id);

    if(!id || !a){
      alert('No se encontró la atención seleccionada.');
      return;
    }

    cerrar();

    const o = document.createElement('div');
    o.id = 'auroVistaIntegralOverlay';
    o.className = 'avi-overlay';
    o.innerHTML =
      '<div class="avi-shell" role="dialog" aria-modal="true" aria-label="Vista integral de la atención">'+
        '<div class="avi-head">'+
          '<div class="avi-head-main">'+
            '<div class="avi-head-icon"><i class="bi bi-file-medical-fill"></i></div>'+
            '<div class="avi-head-copy">'+
              '<span class="avi-head-kicker">Historia clínica · Vista de consulta</span>'+
              '<h3>Vista integral de la atención</h3>'+
              '<div class="avi-head-patient" data-avi-paciente>Paciente</div>'+
              '<div class="avi-head-subcontext" data-avi-subcontexto></div>'+
              '<p class="avi-technical-id" data-avi-id-tecnico>ID atención · '+esc(id)+'</p>'+
              '<div class="avi-head-context" data-avi-contexto></div>'+
            '</div>'+
          '</div>'+
          '<button type="button" class="avi-close" data-avi-cerrar>'+
            '<i class="bi bi-x-lg"></i> <span>Cerrar</span>'+
          '</button>'+
        '</div>'+
        '<div class="avi-toolbar">'+
          '<button type="button" class="avi-btn" data-avi-expandir>Expandir todo</button>'+
          '<button type="button" class="avi-btn" data-avi-contraer>Contraer todo</button>'+
          '<button type="button" class="avi-btn" data-avi-actualizar>Actualizar vista</button>'+
        '</div>'+
        '<div class="avi-body">'+
          '<div class="avi-loading">Cargando información exacta de la consulta seleccionada…</div>'+
        '</div>'+
      '</div>';

    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';

    o.querySelector('[data-avi-cerrar]').addEventListener('click',cerrar);
    o.addEventListener('click',e=>{ if(e.target === o) cerrar(); });

    o.querySelector('[data-avi-expandir]').addEventListener('click',()=>{
      o.querySelectorAll('details').forEach(d=>d.open=true);
    });

    o.querySelector('[data-avi-contraer]').addEventListener('click',()=>{
      o.querySelectorAll('details').forEach(d=>d.open=false);
    });

    o.querySelector('[data-avi-actualizar]').addEventListener('click',async function(){
      const btn = this;
      const htmlOriginal = btn.innerHTML;
      if(btn.disabled) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Actualizando…';

      try{
        renderizar(id);
        await new Promise(r=>setTimeout(r,180));
        btn.innerHTML = '<i class="bi bi-check2"></i> Actualizada';
        setTimeout(function(){
          if(document.body.contains(btn)){
            btn.innerHTML = htmlOriginal;
            btn.disabled = false;
          }
        },700);
      }catch(error){
        console.warn(MODULO,'No se pudo actualizar la vista.',error);
        btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Reintentar';
        btn.disabled = false;
      }
    });

    try{
      if(typeof window.seleccionarAtencion === 'function'){
        window.seleccionarAtencion(id);
      }

      const ok = await esperarAtencion(id,2500);

      if(!ok){
        o.querySelector('.avi-body').innerHTML =
          '<div class="avi-line avi-span-full"><b>No se pudo activar la consulta</b>'+
          '<p>Cierre el visor y pulse primero “Ver”.</p></div>';
        return;
      }

      /*
        V1.3 - Render temprano seguro.
        sincronizarContextoAtencion carga Plan/Examen/Recetas en refuerzos de
        80/140/220 ms. Se mantiene margen corto y un único refuerzo visual
        posterior, sin alterar esos procesos ni su contexto_epoch.
      */
      await new Promise(r=>setTimeout(r,280));
      renderizar(id);
      setTimeout(function(){
        const actual = texto(
          typeof window.getIdAtencionActiva === 'function'
            ? window.getIdAtencionActiva()
            : ''
        );
        if(actual === id) renderizar(id);
      },650);

    }catch(e){
      console.error(MODULO,e);
      o.querySelector('.avi-body').innerHTML =
        '<div class="avi-line avi-span-full"><b>Error de presentación</b>'+
        '<p>No se pudo construir la Vista integral.</p></div>';
    }
  }

  window.AurosanaxVistaIntegral = {
    version:'1.10.0-pulido-antirregresivo',
    abrir,
    cerrar,
    abrirReceta,
    cerrarReceta
  };

  console.info(MODULO+' cargado.');
})();
