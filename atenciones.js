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

      /*
        IASYN 2 · BLINDAJE HISTORIA ↔ PACIENTE
        Solo bloquea cuando existe evidencia explícita de que la historia
        pertenece a otro paciente. Si la pertenencia no puede determinarse
        todavía, conserva el flujo heredado y permite vinculación posterior.
      */
      const idPacienteEnvio = String(
        atencion.id_paciente || idPacienteActivo() || ''
      ).trim();

      const idHistoriaRegistrada = String(atencion.id_historia || '').trim();

      if(
        idHistoriaRegistrada &&
        idPacienteEnvio &&
        auroEstadoPertenenciaHistoria(idHistoriaRegistrada, idPacienteEnvio) === false
      ){
        return {
          success:false,
          message:
            'Se bloqueó el envío: id_historia no corresponde al id_paciente de la atención.'
        };
      }

      const payload = {
        accion: accionAtencion,
        data: {
          id_atencion: atencion.id_atencion || '',
          numero_consulta: Number(atencion.numero_consulta || siguienteConsulta(atencion.id_paciente || idPacienteActivo()) || 1),
          id_paciente: atencion.id_paciente || '',
          id_cita: atencion.id_cita || '',
          id_historia: atencion.id_historia || obtenerIdHistoriaActual(atencion.id_paciente) || '',
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

      // IASYN 2 · BLINDAJE ANTIRREGRESIVO: la edición nunca modifica
      // la fecha ni la hora clínica originales de la atención.
      if (accionAtencion === 'editarAtencion') {
        delete payload.data.fecha_atencion;
        delete payload.data.hora_atencion;
      }

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

  /* IASYN 2 · AVISO QUIRÚRGICO DE ATENCIONES ABIERTAS · SOLO LECTURA */
  function auroNombrePacienteAviso(idPaciente){
    const id = String(idPaciente || '').trim();
    if(!id) return 'Paciente no identificado';
    try{
      const activo = pacienteActivo();
      if(activo && String(activo.id_paciente || activo.id || '').trim() === id){
        const nombre = String(activo.nombre_completo || activo.nombre ||
          [activo.nombres, activo.apellidos].filter(Boolean).join(' ')).trim();
        if(nombre) return nombre;
      }
      if(typeof patients !== 'undefined' && Array.isArray(patients)){
        const p = patients.find(function(item){
          return String(item.id_paciente || item.id || '').trim() === id;
        });
        if(p){
          const nombre = String(p.nombre_completo || p.nombre ||
            [p.nombres, p.apellidos].filter(Boolean).join(' ')).trim();
          if(nombre) return nombre;
        }
      }
    }catch(error){
      console.warn(MODULO, 'No se pudo consultar el nombre del paciente para el aviso.', error);
    }
    return id;
  }

  function auroAbiertasMedicoAviso(idMedico, idPacienteActual){
    const medico = String(idMedico || '').trim();
    const paciente = String(idPacienteActual || '').trim();
    if(!medico) return [];
    return leerLocal().filter(function(a){
      return String(a.id_medico || '').trim() === medico &&
        String(a.id_paciente || '').trim() !== paciente &&
        String(a.estado_atencion || '').trim().toLowerCase() === 'abierta';
    });
  }

  /* Consulta explícita a Sheets para no autorizar nuevas consultas con caché obsoleta.
     Si falla, NO se crea atención ni se cambia el contexto clínico. */
  async function auroRefrescarAtencionesParaAviso(){
    if(typeof API_URL === 'undefined' || !API_URL){
      throw new Error('No está configurada la conexión con Google Sheets.');
    }
    const respuesta = await fetch(API_URL + '?accion=listarAtenciones&_=' + Date.now());
    if(!respuesta.ok) throw new Error('La consulta de atenciones devolvió HTTP ' + respuesta.status);
    const resultado = await respuesta.json();
    const remotas = Array.isArray(resultado) ? resultado :
      (resultado && Array.isArray(resultado.data) ? resultado.data : null);
    if(!remotas) throw new Error('Respuesta de atenciones no válida.');
    mezclarAtencionesLocalesYSheets(remotas);
    atencionesSheetsCargadas = true;
  }

  function siguienteConsulta(idPaciente){
    return atencionesPaciente(idPaciente).reduce((m,a) => Math.max(m, Number(a.numero_consulta || 0)), 0) + 1;
  }


  function auroIdPacienteHistoria(historia){
    return String(
      historia?.id_paciente ||
      historia?.paciente_id ||
      ''
    ).trim();
  }

  function auroIdHistoriaRegistro(historia){
    return String(
      historia?.id_historia ||
      historia?.id ||
      ''
    ).trim();
  }

  /*
    IASYN 2 · PERTENENCIA HISTORIA/PACIENTE
    true  = se pudo demostrar pertenencia.
    false = existe evidencia de que pertenece a otro paciente.
    null  = no hay información suficiente; no se inventa una conclusión.
  */
  function auroEstadoPertenenciaHistoria(idHistoria, idPaciente){
    idHistoria = String(idHistoria || '').trim();
    idPaciente = String(idPaciente || '').trim();

    if(!idHistoria || !idPaciente) return null;

    const candidatasDirectas = [
      window.historiaActual,
      window.currentHistoria
    ].filter(function(h){
      return h && typeof h === 'object' &&
        auroIdHistoriaRegistro(h) === idHistoria;
    });

    if(candidatasDirectas.length){
      const candidatasConPaciente = candidatasDirectas.filter(function(h){
        return !!auroIdPacienteHistoria(h);
      });

      if(candidatasConPaciente.length){
        return candidatasConPaciente.some(function(h){
          return auroIdPacienteHistoria(h) === idPaciente;
        });
      }
    }

    try{
      if(typeof window.auroHistoriasPacienteOrdenadas === 'function'){
        const historiasPaciente = window.auroHistoriasPacienteOrdenadas(idPaciente);
        if(Array.isArray(historiasPaciente)){
          const existe = historiasPaciente.some(function(h){
            return auroIdHistoriaRegistro(h) === idHistoria;
          });
          if(existe) return true;

          /*
            Solo se rechaza cuando la fuente oficial del paciente está cargada
            y contiene historias, pero la historia candidata no aparece allí.
          */
          if(historiasPaciente.length) return false;
        }
      }
    }catch(error){
      console.warn(MODULO, 'No se pudo validar la historia contra el paciente.', error);
    }

    try{
      if(typeof window.auroHistoriaActualEdicion === 'function'){
        const h = window.auroHistoriaActualEdicion();
        if(h && auroIdHistoriaRegistro(h) === idHistoria){
          return auroIdPacienteHistoria(h) === idPaciente;
        }
      }
    }catch(error){
      console.warn(MODULO, 'No se pudo validar la historia en edición.', error);
    }

    return null;
  }

  function obtenerIdHistoriaActual(idPacienteEsperado){
    try{
      /*
        IASYN 2 · BLINDAJE DE CONTEXTO
        Una referencia residual de historia solo se hereda cuando puede
        demostrarse que corresponde al paciente esperado.
        Ante duda se deja vacío y la vinculación posterior sigue disponible.
      */
      const idPaciente = String(
        idPacienteEsperado || idPacienteActivo() || ''
      ).trim();

      if(!idPaciente) return '';

      const candidatos = [];

      if(window.auroHistoriaSeleccionadaId){
        candidatos.push(String(window.auroHistoriaSeleccionadaId).trim());
      }

      if(window.editingHistoryId){
        candidatos.push(String(window.editingHistoryId).trim());
      }

      if(window.historiaActual){
        candidatos.push(auroIdHistoriaRegistro(window.historiaActual));
      }

      if(window.currentHistoria){
        candidatos.push(auroIdHistoriaRegistro(window.currentHistoria));
      }

      for(const idHistoria of candidatos.filter(Boolean)){
        if(auroEstadoPertenenciaHistoria(idHistoria, idPaciente) === true){
          return idHistoria;
        }
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

    /* IASYN 2 · ADAPTACIÓN QUIRÚRGICA DEL AVISO AUROSANAX.
       No altera selección, recetas, firmas, timestamps ni estados previos. */
    try{
      await auroRefrescarAtencionesParaAviso();
    }catch(error){
      console.warn(MODULO, 'No se pudo verificar la lista actual de atenciones.', error);
      alert('No se pudieron verificar las atenciones abiertas en Google Sheets. ' +
        'No se inició otra consulta para evitar duplicidades. Revise la conexión e intente de nuevo.');
      return null;
    }

    /* Revalidación del mismo paciente después de actualizar la fuente persistente. */
    const abiertaActualizada = atencionAbierta(idPaciente);
    if(abiertaActualizada){
      alert('Este paciente ya tiene una atención abierta' +
        (abiertaActualizada.numero_consulta
          ? ' (consulta #' + abiertaActualizada.numero_consulta + ')' : '') +
        '. Continúe o finalice esa atención antes de iniciar una nueva.');
      return null;
    }

    const otrasAbiertas = auroAbiertasMedicoAviso(idMedico, idPaciente);
    if(otrasAbiertas.length){
      const detalle = otrasAbiertas.map(function(a){
        return '• Paciente: ' + auroNombrePacienteAviso(a.id_paciente) +
          '\n  Consulta: ' + (a.numero_consulta ? '#' + a.numero_consulta : 'Sin número') +
          '\n  ID atención: ' + String(a.id_atencion || '').trim();
      }).join('\n\n');
      const continuar = confirm(
        'El médico seleccionado tiene ' + otrasAbiertas.length +
        (otrasAbiertas.length === 1 ? ' atención abierta.' : ' atenciones abiertas.') +
        '\n\n' + detalle + '\n\n' +
        'Estas atenciones pertenecen a otros pacientes.\n' +
        'Aceptar: mantenerlas abiertas e iniciar una nueva atención.\n' +
        'Cancelar: no crear una nueva atención.'
      );
      if(!continuar) return null;
    }

    const num = siguienteConsulta(idPaciente);

    const nueva = normalizar({
      id_atencion: idNuevo(),
      numero_consulta: num,
      id_paciente: idPaciente,
      id_cita: idCita,
      id_historia: obtenerIdHistoriaActual(idPaciente),
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

    if(auroEstadoPertenenciaHistoria(idHistoria, idPaciente) === false){
      return {
        success:false,
        message:
          'La historia clínica seleccionada pertenece a otro paciente. ' +
          'Se bloqueó la vinculación automática.'
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

    /*
      IASYN 2 · BLINDAJE VISUAL ADITIVO
      1. Reutiliza el puente ya expuesto por Vista Integral.
      2. Si todavía no existe por orden de carga, usa el MISMO visor oficial
         de Recetas. No crea un motor paralelo ni cambia id_receta.
    */
    if(
      window.AurosanaxVistaIntegral &&
      typeof window.AurosanaxVistaIntegral.abrirReceta === 'function'
    ){
      window.AurosanaxVistaIntegral.abrirReceta(id);
      return;
    }

    if(typeof window.pdfRecetaEmitida === 'function'){
      try{
        const resultado = window.pdfRecetaEmitida(id);
        if(resultado && typeof resultado.catch === 'function'){
          resultado.catch(function(error){
            console.error(MODULO, 'No se pudo abrir la receta oficial.', error);
          });
        }
        return;
      }catch(error){
        console.error(MODULO, 'No se pudo abrir la receta oficial.', error);
      }
    }

    alert('La vista oficial de Recetas no está disponible en este momento.');
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
      /* ==========================================================
         IASYN 2 — SINCRONIZACIÓN VISUAL ANTIRREGRESIVA
         ----------------------------------------------------------
         - La atención seleccionada explícitamente (atencionActivaId)
           gobierna la representación visual.
         - Un render posterior NO puede sustituirla por otra atención
           abierta del mismo paciente.
         - Solo cuando no existe selección explícita se muestra la
           atención abierta como referencia visual.
         - La hora se formatea únicamente para presentación; no cambia
           el valor almacenado ni el payload clínico.
         ========================================================== */
      if(!atencionActivaId && abierta){
        activaBox.style.display = 'block';
        activaBox.innerHTML =
          '<div class="auro-atencion-status abierta">' +
          '<b>🟢 ABIERTA</b> · Consulta #' + safe(abierta.numero_consulta) + '<br>' +
          '<span>' + safe(fechaVisual(abierta.fecha_atencion)) + ' ' + safe(horaVisualAtencion(abierta.hora_atencion || '—')) + '</span>' +
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
          'Verifique que vista_integral.js esté cargado después de los módulos clínicos.'
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

      const idPacienteContexto = String(atencion.id_paciente || '').trim();
      const idPacienteVisible = String(idPacienteActivo() || '').trim();
      const idHistoriaContexto = String(atencion.id_historia || '').trim();

      /*
        IASYN 2 · CONTEXTO CLÍNICO AISLADO
        Nunca entrega a Plan/Recetas/Diagnóstico/Examen una atención que
        contradiga el paciente visible o una historia demostrablemente ajena.
      */
      if(
        idPacienteVisible &&
        idPacienteContexto &&
        idPacienteVisible !== idPacienteContexto
      ){
        return null;
      }

      if(
        idHistoriaContexto &&
        idPacienteContexto &&
        auroEstadoPertenenciaHistoria(idHistoriaContexto, idPacienteContexto) === false
      ){
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
