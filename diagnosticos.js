/***********************************************************************
 IASYN ERP
 Archivo: diagnosticos.js
 Módulo: Diagnósticos e integración clínica por atención
 Versión: 1.5.4 - profesional, tipo y motivo para Apoyo Cognitivo con IA
 Fecha: 2026-07-24
 -----------------------------------------------------------------------
 OBJETIVO
 - Leer los diagnósticos ya registrados desde Examen Físico.
 - Trabajar exclusivamente por id_atencion.
 - Consultar el detalle clínico y protocolos existentes en Apps Script.
 - Integrar información visible de la atención sin modificar otros módulos.
 - Mostrar sugerencias para revisión médica.
 - Aplicar al Plan únicamente por acción expresa del usuario.
 - Preparar y transferir temporalmente el contexto clínico a apoyoIA.html.
 - Mantener la futura persistencia de Apoyo IA independiente y vinculada por id_atencion.

 REGLAS DE SEGURIDAD
 - NO elimina ni modifica funciones de examenfisico.js.
 - NO sobrescribe plan.js, atenciones.js, ginecologia.js u obstetricia.js.
 - NO prescribe ni guarda automáticamente.
 - NO aplica protocolos automáticamente.
 - Si falta un módulo, continúa funcionando con degradación segura.
 - Cada atención conserva su estado independiente.
 - La apertura de Apoyo IA no guarda, duplica ni modifica registros clínicos.
 - No altera fechas, horas ni formatos JSON de los módulos existentes.
************************************************************************/

(function(){
  'use strict';

  if(
    window.auroDiagnosticosModuloCargado &&
    window.auroDiagnosticos &&
    typeof window.auroDiagnosticos.inicializar === 'function'
  ){
    console.warn('IASYN DIAGNÓSTICOS: el módulo completo ya estaba cargado.');
    window.auroDiagnosticos.inicializar();
    return;
  }

  /* Recuperación ante una carga anterior incompleta o interrumpida. */
  window.auroDiagnosticosModuloCargado = false;

  const MODULO = 'IASYN DIAGNÓSTICOS';
  const VERSION = '1.5.12';
  /*
    COMPATIBILIDAD TEMPORAL IASYN:
    Las claves de sessionStorage/localStorage, eventos aurosanax:* y nombres
    globales heredados que permanecen en este archivo son contratos internos
    compartidos con index, Examen Físico, Plan, Seguridad y apoyoIA.html.
    No contienen por sí mismos endpoint, Spreadsheet ID ni recurso activo de
    AUROSANAX PRUEBA. Deben migrarse coordinadamente, no desde Diagnósticos
    de forma aislada.
  */
  const APOYO_IA_SESSION_KEY = 'aurosanax_apoyoIA_contexto';
  const RELEASE = '20260823_dx_cero_sugerencias_plan_v3';

  const state = window.auroDiagnosticosState = window.auroDiagnosticosState || {
    atencionActual: '',
    diagnosticos: [],
    detalleExamen: null,
    historia: null,
    anamnesis: null,
    especialidades: {},
    protocolos: [],
    protocoloSeleccionado: null,
    resumenClinico: '',
    analisisClinico: '',
    conducta: '',
    cache: {},
    cargando: false,
    inicializado: false,
    ultimaActualizacion: '',
    modoEdicion: false,
    cambiosPendientes: false,
    guardadoTemporalConfirmado: false,
    ultimaEdicionLocal: '',
    protocoloVisualCodigo: '',
    protocoloVisualModoLectura: false,
    correccionClinicaActiva: false,
    correccionClinicaMeta: null,

    /*
      AUROSANAX 1.5.11:
      Estado exclusivamente visual para edición del CIE-10 de una atención abierta.
      No se persiste y no modifica la corrección histórica.
    */
    edicionDiagnosticoAbierto: false,

    /*
      AUROSANAX OPTIMIZACIÓN QUIRÚRGICA 2026-08-03:
      Controles internos de sincronización. No se persisten ni modifican
      la estructura clínica, Apps Script, Google Sheets o los demás módulos.
    */
    cargaToken: 0,
    idCargaEnCurso: '',
    promesaCarga: null
  };

  const IDS_PANEL_CANDIDATOS = [
    'hc_diagnosticos',
    'hc_diagnostico',
    'diagnosticos',
    'diagnostico',
    'panelDiagnosticos',
    'tabDiagnosticos',
    'hcDiagnosticosPanel'
  ];

  const IDS_PLAN = {
    planTratamiento: ['hcPlanTratamiento','hcPlanTerapeutico','hcPlan'],
    indicaciones: ['hcIndicacionesPaciente','hcIndicaciones','hcRecomendaciones'],
    control: ['hcProximoControl','hcControl','hcSeguimiento'],
    observaciones: ['hcObservacionesPlan','hcObservaciones']
  };

  function texto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  /*
    AUROSANAX - Protección quirúrgica de historia nueva.
    Solo bloquea la reutilización de una atención anterior cuando
    Pacientes/Agenda marcaron explícitamente modo "nueva" y todavía
    no existe un nuevo id_atencion.
  */
  function historiaNuevaSinAtencion(){
    const modo = texto(window.auroModoAperturaHistoria).toLowerCase();
    if(modo !== 'nueva') return false;

    /*
      AUROSANAX FIX QUIRÚRGICO 2026-07-30:
      Atenciones es la fuente maestra. Una historia puede conservar temporalmente
      el modo "nueva" aun después de crear la consulta. Si ya existe una atención
      activa real, Diagnóstico no debe limpiarla ni tratarla como inexistente.
    */
    try{
      if(typeof window.getAtencionActiva === 'function'){
        const activa = window.getAtencionActiva();
        if(activa && texto(activa.id_atencion)) return false;
      }
    }catch(e){}

    try{
      if(typeof window.getIdAtencionActiva === 'function'){
        const idActivo = texto(window.getIdAtencionActiva());
        if(idActivo) return false;
      }
    }catch(e){}

    try{
      const contexto = typeof window.obtenerContextoAtencionActual === 'function'
        ? window.obtenerContextoAtencionActual()
        : (typeof window.getContextoAtencionActual === 'function'
            ? window.getContextoAtencionActual()
            : null);
      if(contexto && texto(contexto.id_atencion)) return false;
    }catch(e){}

    const idNuevo = texto(
      window.auroAtencionNuevaId ||
      window.auroAtencionSeleccionadaId ||
      window.currentAttention?.id_atencion ||
      window.atencionActual?.id_atencion
    );

    return !idNuevo;
  }

  function normalizar(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/\s+/g,' ')
      .trim();
  }

  function escapeHtml(valor){
    return String(valor || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function clonar(valor, fallback){
    try{
      return JSON.parse(JSON.stringify(valor));
    }catch(e){
      return fallback;
    }
  }

  function arraySeguro(valor){
    if(Array.isArray(valor)) return valor;
    if(valor && Array.isArray(valor.data)) return valor.data;
    if(valor && Array.isArray(valor.registros)) return valor.registros;
    if(valor && Array.isArray(valor.resultado)) return valor.resultado;
    return [];
  }

  function parseJsonSeguro(valor, fallback){
    if(Array.isArray(valor) || (valor && typeof valor === 'object')) return valor;
    const raw = texto(valor);
    if(!raw) return fallback;
    try{
      return JSON.parse(raw);
    }catch(e){
      return fallback;
    }
  }

  function apiUrl(){
    try{
      if(typeof API_URL !== 'undefined' && API_URL) return texto(API_URL);
    }catch(e){}
    if(window.API_URL) return texto(window.API_URL);
    const input = document.getElementById('appsScriptUrl');
    return input ? texto(input.value) : '';
  }

  async function getJSON(accion, parametros){
    const API = apiUrl();
    if(!API) throw new Error('API_URL no está definida.');

    const query = new URLSearchParams({accion: accion});
    Object.keys(parametros || {}).forEach(k => {
      const v = parametros[k];
      if(v !== undefined && v !== null && texto(v)){
        query.append(k, v);
      }
    });

    const respuesta = await fetch(API + '?' + query.toString() + '&_=' + Date.now(), {
      method: 'GET',
      cache: 'no-store'
    });

    if(!respuesta.ok){
      throw new Error('Error HTTP ' + respuesta.status + ' al ejecutar ' + accion);
    }

    return await respuesta.json();
  }
  /* ==========================================================
     AUROSANAX DIAGNÓSTICO 18 - CORRECCIÓN EXPLÍCITA HISTÓRICA
     - Atención abierta: flujo original intacto.
     - Atención finalizada: desbloqueo explícito y temporal.
     - Guardado directo por id_atencion, sin crear Examen Físico.
     - Motivo/enmienda definidos por backend y Configuración.
  ========================================================== */
  function auroDxTokenControlClinico(){
    try{
      if(window.AUROSANAX_SEGURIDAD && typeof window.AUROSANAX_SEGURIDAD.obtenerToken === 'function'){
        return texto(window.AUROSANAX_SEGURIDAD.obtenerToken());
      }
    }catch(e){}
    try{ return texto(sessionStorage.getItem('aurosanax_seguridad_token')); }catch(e){}
    return '';
  }

  /*
    AUROSANAX DIAGNÓSTICO 20 - PUENTE QUIRÚRGICO DE CORRECCIÓN HISTÓRICA
    --------------------------------------------------------------------
    El botón oficial "Aplicar al Plan" está interceptado por Examen Físico y,
    en el flujo normal, exige guardar primero el diagnóstico mediante
    window.auroGuardarDiagnosticosAtencionActual().

    En una atención finalizada esa escritura normal NO corresponde:
    la corrección debe persistirse únicamente con "Guardar corrección",
    porque ese flujo sí envía token + justificativo y deja una sola auditoría.

    Este puente actúa SOLO mientras state.correccionClinicaActiva === true.
    Fuera de la corrección histórica, restaura y conserva exactamente el
    guardado normal existente.
  */
  let auroDxGuardarDiagnosticosOriginal = null;
  let auroDxPuenteGuardadoCorreccionInstalado = false;

  function auroDxInstalarPuenteGuardadoCorreccion(){
    if(!state.correccionClinicaActiva) return false;
    if(auroDxPuenteGuardadoCorreccionInstalado) return true;
    if(typeof window.auroGuardarDiagnosticosAtencionActual !== 'function') return false;

    auroDxGuardarDiagnosticosOriginal = window.auroGuardarDiagnosticosAtencionActual;

    window.auroGuardarDiagnosticosAtencionActual = async function(){
      const ctx = contextoAtencionSeleccionada();

      if(state.correccionClinicaActiva && ctx.historica){
        const registros = auroDxDiagnosticosParaCorreccion();
        return {
          success:true,
          correccion_clinica_activa:true,
          guardado_diferido:true,
          id_atencion:ctx.id,
          diagnosticos:Array.isArray(registros) ? registros.length : 0,
          message:'Corrección histórica activa: el diagnóstico se guardará exclusivamente con “Guardar corrección”.'
        };
      }

      return await Promise.resolve(
        auroDxGuardarDiagnosticosOriginal.apply(this, arguments)
      );
    };

    auroDxPuenteGuardadoCorreccionInstalado = true;
    return true;
  }

  function auroDxRestaurarPuenteGuardadoCorreccion(){
    if(
      auroDxPuenteGuardadoCorreccionInstalado &&
      typeof auroDxGuardarDiagnosticosOriginal === 'function'
    ){
      window.auroGuardarDiagnosticosAtencionActual = auroDxGuardarDiagnosticosOriginal;
    }
    auroDxGuardarDiagnosticosOriginal = null;
    auroDxPuenteGuardadoCorreccionInstalado = false;
  }

  /*
    AUROSANAX 2026-08 - JUSTIFICATIVO CLÍNICO PREMIUM
    Intervención quirúrgica:
    - Solo reemplaza la interfaz que solicita el motivo.
    - Conserva exactamente el contrato de salida consumido por Diagnóstico.
    - No modifica guardado, id_atencion, id_diagnostico, auditoría ni Aplicar al Plan.
    - Se instala de forma explícita para evitar que una copia antigua de 6 motivos,
      cargada previamente por otro módulo, prevalezca dentro de Diagnóstico.
  */
  window.auroSolicitarMotivoCorreccionClinica = function(opciones){
    opciones = opciones || {};
    const excepcional = !!opciones.excepcional;

    const motivos = [
      'Error de digitación',
      'Omisión',
      'Dato incorrecto',
      'Actualización solicitada por el paciente',
      'Verificación documental',
      'Fallo del sistema',
      'Emergencia',
      'Corrección clínica',
      'Otro'
    ];

    return new Promise(resolve => {
      const ID = 'auroCorreccionClinicaPremium';

      const previo = document.getElementById(ID);
      if(previo) previo.remove();

      if(!document.getElementById('auroCorreccionClinicaPremiumStyles')){
        const style = document.createElement('style');
        style.id = 'auroCorreccionClinicaPremiumStyles';
        style.textContent = `
          .auro-ccp-overlay{
            position:fixed; inset:0; z-index:2147483000;
            display:flex; align-items:center; justify-content:center;
            padding:max(18px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right))
                    max(18px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
            background:rgba(15,23,42,.48);
            backdrop-filter:blur(7px); -webkit-backdrop-filter:blur(7px);
          }
          .auro-ccp-card{
            width:min(620px,100%); max-height:min(88vh,760px); overflow:auto;
            background:#fff; border:1px solid rgba(148,163,184,.28);
            border-radius:24px; box-shadow:0 28px 80px rgba(15,23,42,.24);
            color:#172033; font-family:inherit;
          }
          .auro-ccp-head{
            padding:22px 24px 17px; display:flex; gap:14px; align-items:flex-start;
            border-bottom:1px solid #edf0f5;
            background:linear-gradient(135deg,#fff 0%,#fff7fb 100%);
            border-radius:24px 24px 0 0;
          }
          .auro-ccp-icon{
            flex:0 0 42px; width:42px; height:42px; border-radius:14px;
            display:grid; place-items:center; font-size:19px;
            background:#fff0f6; color:#b42367; border:1px solid #f7d5e5;
          }
          .auro-ccp-title{font-size:18px;font-weight:800;line-height:1.2;margin:0 0 5px}
          .auro-ccp-sub{font-size:13px;line-height:1.45;color:#667085;margin:0}
          .auro-ccp-body{padding:20px 24px 8px}
          .auro-ccp-label{display:block;font-size:13px;font-weight:750;color:#344054;margin:0 0 8px}
          .auro-ccp-required{color:#b42367}
          .auro-ccp-select,.auro-ccp-textarea{
            width:100%; box-sizing:border-box; border:1px solid #d0d5dd; border-radius:13px;
            background:#fff; color:#172033; font:inherit; font-size:14px;
            outline:none; transition:border-color .15s ease,box-shadow .15s ease;
          }
          .auro-ccp-select{height:46px;padding:0 13px}
          .auro-ccp-textarea{min-height:92px;resize:vertical;padding:12px 13px;line-height:1.45}
          .auro-ccp-select:focus,.auro-ccp-textarea:focus{
            border-color:#d14d87; box-shadow:0 0 0 4px rgba(209,77,135,.10);
          }
          .auro-ccp-field{margin-bottom:16px}
          .auro-ccp-help{font-size:12px;color:#7a8495;margin-top:7px;line-height:1.4}
          .auro-ccp-error{
            display:none; margin-top:9px; padding:9px 11px; border-radius:10px;
            background:#fff1f3; color:#b42318; font-size:12px; font-weight:650;
          }
          .auro-ccp-error.show{display:block}
          .auro-ccp-trace{
            display:flex; gap:9px; align-items:flex-start; margin:2px 24px 18px;
            padding:11px 13px; border-radius:12px; background:#f8fafc;
            color:#596579; font-size:12px; line-height:1.45;
          }
          .auro-ccp-actions{
            display:flex; justify-content:flex-end; gap:10px; padding:16px 24px 22px;
            border-top:1px solid #edf0f5;
          }
          .auro-ccp-btn{
            min-height:42px; border-radius:12px; padding:0 17px; font:inherit;
            font-size:14px; font-weight:750; cursor:pointer; border:1px solid transparent;
          }
          .auro-ccp-cancel{background:#fff;color:#475467;border-color:#d0d5dd}
          .auro-ccp-confirm{background:#b42367;color:#fff;box-shadow:0 8px 20px rgba(180,35,103,.18)}
          .auro-ccp-confirm:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
          @media (max-width:575.98px){
            .auro-ccp-overlay{align-items:flex-end;padding:10px max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
            .auro-ccp-card{max-height:92vh;border-radius:22px}
            .auro-ccp-head{padding:18px 17px 15px;border-radius:22px 22px 0 0}
            .auro-ccp-body{padding:17px 17px 6px}
            .auro-ccp-trace{margin:2px 17px 15px}
            .auro-ccp-actions{padding:14px 17px calc(16px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1fr}
            .auro-ccp-btn{width:100%}
          }
          @media (prefers-reduced-motion:reduce){
            .auro-ccp-select,.auro-ccp-textarea{transition:none}
          }
        `;
        document.head.appendChild(style);
      }

      const overlay = document.createElement('div');
      overlay.id = ID;
      overlay.className = 'auro-ccp-overlay';
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-labelledby','auroCcpTitle');

      const opcionesHtml = motivos.map(m =>
        '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>'
      ).join('');

      overlay.innerHTML = `
        <section class="auro-ccp-card">
          <header class="auro-ccp-head">
            <div class="auro-ccp-icon"><i class="bi ${excepcional ? 'bi-shield-exclamation' : 'bi-shield-check'}"></i></div>
            <div>
              <h3 id="auroCcpTitle" class="auro-ccp-title">${excepcional ? 'Enmienda excepcional' : 'Corrección clínica'}</h3>
              <p class="auro-ccp-sub">Seleccione el justificativo de la modificación. Esta información forma parte de la trazabilidad clínica.</p>
            </div>
          </header>
          <div class="auro-ccp-body">
            <div class="auro-ccp-field">
              <label class="auro-ccp-label" for="auroCcpTipo">Motivo de corrección <span class="auro-ccp-required">*</span></label>
              <select id="auroCcpTipo" class="auro-ccp-select">
                <option value="">Seleccione un motivo</option>
                ${opcionesHtml}
              </select>
            </div>
            <div class="auro-ccp-field">
              <label class="auro-ccp-label" for="auroCcpDetalle">Observación / detalle</label>
              <textarea id="auroCcpDetalle" class="auro-ccp-textarea" maxlength="150" placeholder="Añada una observación breve si corresponde."></textarea>
              <div id="auroCcpHelp" class="auro-ccp-help">Opcional. Si selecciona “Otro”, el detalle es obligatorio.</div>
              <div id="auroCcpError" class="auro-ccp-error" role="alert"></div>
            </div>
          </div>
          <div class="auro-ccp-trace">
            <i class="bi bi-lock"></i>
            <span>El registro original permanece protegido. Esta ventana no modifica por sí sola ningún dato clínico.</span>
          </div>
          <footer class="auro-ccp-actions">
            <button type="button" id="auroCcpCancelar" class="auro-ccp-btn auro-ccp-cancel">Cancelar</button>
            <button type="button" id="auroCcpConfirmar" class="auro-ccp-btn auro-ccp-confirm" disabled>Continuar</button>
          </footer>
        </section>
      `;

      document.body.appendChild(overlay);

      const tipoEl = overlay.querySelector('#auroCcpTipo');
      const detalleEl = overlay.querySelector('#auroCcpDetalle');
      const confirmarEl = overlay.querySelector('#auroCcpConfirmar');
      const cancelarEl = overlay.querySelector('#auroCcpCancelar');
      const errorEl = overlay.querySelector('#auroCcpError');
      const helpEl = overlay.querySelector('#auroCcpHelp');

      let terminado = false;
      const cerrar = valor => {
        if(terminado) return;
        terminado = true;
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(valor);
      };

      const validar = mostrarError => {
        const tipo = String(tipoEl.value || '').trim();
        const detalle = String(detalleEl.value || '').trim();
        let error = '';
        if(!tipo) error = 'Seleccione un motivo de corrección.';
        else if(tipo === 'Otro' && detalle.length < 3) error = 'Especifique el motivo cuando selecciona “Otro”.';

        confirmarEl.disabled = !!error;
        if(mostrarError && error){
          errorEl.textContent = error;
          errorEl.classList.add('show');
        }else{
          errorEl.textContent = '';
          errorEl.classList.remove('show');
        }
        return !error;
      };

      tipoEl.addEventListener('change', () => {
        const esOtro = tipoEl.value === 'Otro';
        detalleEl.placeholder = esOtro
          ? 'Describa brevemente el motivo de la corrección.'
          : 'Añada una observación breve si corresponde.';
        helpEl.textContent = esOtro
          ? 'Obligatorio para “Otro”. Máximo 150 caracteres.'
          : 'Opcional. Máximo 150 caracteres.';
        validar(false);
        if(esOtro) detalleEl.focus();
      });
      detalleEl.addEventListener('input', () => validar(false));

      cancelarEl.addEventListener('click', () => cerrar(null));
      confirmarEl.addEventListener('click', () => {
        if(!validar(true)) return;
        const tipo = String(tipoEl.value || '').trim();
        const detalle = String(detalleEl.value || '').trim();
        cerrar({
          motivo_correccion_tipo:tipo,
          motivo_correccion_detalle:detalle,
          motivo_correccion:detalle,
          correccion_excepcional:excepcional ? 'SI' : 'NO'
        });
      });

      overlay.addEventListener('click', e => {
        if(e.target === overlay) cerrar(null);
      });

      const onKey = e => {
        if(e.key === 'Escape'){
          e.preventDefault();
          cerrar(null);
        }
      };
      document.addEventListener('keydown', onKey);

      setTimeout(() => tipoEl.focus(), 0);
    });
  };

  async function auroDxPostJSON(accion, data){
    const API = apiUrl();
    if(!API) throw new Error('API_URL no está definida.');
    const respuesta = await fetch(API, {
      method:'POST',
      body:JSON.stringify({accion:accion, data:data || {}})
    });
    if(!respuesta.ok) throw new Error('Error HTTP ' + respuesta.status);
    return await respuesta.json();
  }

  function auroDxElementosEditorCie(){
    const panel = document.getElementById('hc_diagnostico') || buscarPanelExistente();
    if(!panel) return [];
    const selectores = [
      '#hcDxCodigoBuscar','#hcDxNombreBuscar',
      '.diagnostico-add','.diagnostico-delete','.diagnostico-radio','.diagnostico-tipo-select',
      'button[onclick*="buscarDiagnosticoCie10"]',
      'button[onclick*="agregarDiagnosticoCie10Manual"]'
    ];
    const salida = [];
    selectores.forEach(sel => {
      panel.querySelectorAll(sel).forEach(el => { if(!salida.includes(el)) salida.push(el); });
    });
    return salida;
  }

  function auroDxAplicarEstadoEditorHistorico(){
    const ctx = contextoAtencionSeleccionada();

    /*
      MÁQUINA DE ESTADOS DEL EDITOR CIE-10
      ------------------------------------
      - Atención abierta + no está editando: BLOQUEADO.
      - Atención abierta + edición explícita: HABILITADO.
      - Atención histórica: BLOQUEADO salvo corrección clínica activa.
      Esto evita modificar CIE-10 mientras arriba todavía dice
      “Editar diagnóstico” y elimina estados temporales contradictorios.
    */
    const bloquearHistorico =
      ctx.historica && !state.correccionClinicaActiva;

    const bloquearAbiertoProtegido =
      ctx.editable === true &&
      ctx.historica !== true &&
      state.edicionDiagnosticoAbierto !== true;

    const bloquear = bloquearHistorico || bloquearAbiertoProtegido;

    auroDxElementosEditorCie().forEach(el => {
      if(el.dataset.auroDxDisabledOriginal === undefined){
        el.dataset.auroDxDisabledOriginal = el.disabled ? '1' : '0';
      }

      if(bloquear){
        el.disabled = true;
      }else{
        el.disabled = el.dataset.auroDxDisabledOriginal === '1';
      }
    });
  }

  async function auroDxEvaluarCorreccionHistorica(){
    const ctx = contextoAtencionSeleccionada();
    if(!ctx.id) return {success:false,message:'No existe una atención seleccionada.'};
    return await getJSON('evaluarEdicionClinica', {
      token: auroDxTokenControlClinico(),
      modulo:'DIAGNOSTICO',
      id_atencion:ctx.id
    });
  }

  async function auroDxIniciarCorreccionHistorica(){
    const ctx = contextoAtencionSeleccionada();
    if(!ctx.historica){
      mensaje('aviso','La atención está abierta; puede editar el diagnóstico normalmente.');
      return;
    }
    if(state.correccionClinicaActiva) return;

    try{
      const evaluacion = await auroDxEvaluarCorreccionHistorica();
      if(evaluacion && evaluacion.success === false && !evaluacion.requiere_motivo && !evaluacion.requiere_excepcion){
        mensaje('error', evaluacion.message || 'La corrección está bloqueada por Configuración.');
        return;
      }

      const motivo = await window.auroSolicitarMotivoCorreccionClinica({
        excepcional: !!(evaluacion && evaluacion.requiere_excepcion)
      });
      if(!motivo) return;

      state.correccionClinicaMeta = motivo;
      state.correccionClinicaActiva = true;
      auroDxInstalarPuenteGuardadoCorreccion();
      renderContextoSuperior();
      auroDxAplicarEstadoEditorHistorico();
      configurarModoProtocoloMaestro();
      mensaje('aviso', (motivo.correccion_excepcional === 'SI' ? 'Enmienda excepcional' : 'Corrección clínica') + ' habilitada temporalmente. Puede corregir el diagnóstico y aplicar su protocolo al Plan; finalice con “Guardar corrección”.');
    }catch(error){
      console.error(MODULO + ': no se pudo iniciar corrección histórica.', error);
      mensaje('error', error.message || 'No se pudo validar la corrección clínica.');
    }
  }

  function auroDxDiagnosticosParaCorreccion(){
    let registros = [];
    try{
      registros = typeof window.auroRecopilarDiagnosticosEstructurados === 'function'
        ? window.auroRecopilarDiagnosticosEstructurados()
        : [];
    }catch(e){ registros = []; }
    if(!Array.isArray(registros)) registros = [];

    return registros.map(r => {
      const codigo = texto(r.codigo_cie10 || r.codigo || '').replace(/\./g,'').toUpperCase();
      const previo = state.diagnosticos.find(d =>
        texto(d.codigo_cie10 || d.codigo || '').replace(/\./g,'').toUpperCase() === codigo
      ) || null;
      return Object.assign({}, r, {
        id_diagnostico: texto(r.id_diagnostico || previo?.id_diagnostico || ''),
        id_atencion: contextoAtencionSeleccionada().id
      });
    });
  }

  async function auroDxGuardarCorreccionHistorica(){
    if(!state.correccionClinicaActiva || !state.correccionClinicaMeta){
      mensaje('error','Primero habilite la corrección clínica.');
      return;
    }

    const ctx = contextoAtencionSeleccionada();
    const registros = auroDxDiagnosticosParaCorreccion();
    const idExamen = texto(
      (window.examenFisicoState?.atencionActual === ctx.id
        ? (window.examenFisicoState?.examenesSheets?.[ctx.id]?.id_examen || '')
        : '')
    );

    const payload = Object.assign({
      id_atencion:ctx.id,
      id_examen:idExamen,
      registros:registros,
      token:auroDxTokenControlClinico()
    }, state.correccionClinicaMeta);

    const botonGuardar = document.querySelector(
      '#auroDxContextoSuperior button[onclick="window.auroDxGuardarCorreccionHistorica()"]'
    );
    const htmlBotonGuardar = botonGuardar ? botonGuardar.innerHTML : '';

    function notificacionGuardadoDx(tipo, textoMensaje){
      let toast = document.getElementById('auroDxCorreccionToast');
      if(toast) toast.remove();

      toast = document.createElement('div');
      toast.id = 'auroDxCorreccionToast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');

      const ok = tipo === 'ok';
      toast.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:max(22px,calc(14px + env(safe-area-inset-bottom)))',
        'transform:translateX(-50%)',
        'z-index:2147483001',
        'width:min(92vw,520px)',
        'box-sizing:border-box',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'padding:13px 15px',
        'border-radius:14px',
        'font-family:inherit',
        'font-size:13px',
        'font-weight:800',
        'line-height:1.35',
        'box-shadow:0 18px 45px rgba(15,23,42,.20)',
        'border:1px solid ' + (ok ? '#b7e4c7' : '#fecaca'),
        'background:' + (ok ? '#f0fdf4' : '#fff1f2'),
        'color:' + (ok ? '#166534' : '#b42318')
      ].join(';');

      toast.innerHTML =
        '<i class="bi ' + (ok ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill') +
        '" style="font-size:18px;flex:0 0 auto"></i>' +
        '<span>' + escapeHtml(textoMensaje || '') + '</span>';

      document.body.appendChild(toast);
      window.setTimeout(() => {
        try{ toast.remove(); }catch(_e){}
      }, ok ? 4200 : 5200);
    }

    try{
      if(botonGuardar){
        botonGuardar.disabled = true;
        botonGuardar.setAttribute('aria-busy','true');
        botonGuardar.innerHTML = '<i class="bi bi-hourglass-split"></i> Guardando corrección…';
      }

      mensaje('aviso','Guardando corrección diagnóstica…');

      const resultado = await auroDxPostJSON('guardarDiagnosticos', payload);
      if(!resultado || resultado.success === false){
        throw new Error(resultado?.message || 'No se pudo guardar la corrección diagnóstica.');
      }

      /*
        AUROSANAX UX PREMIUM 2026-08-20
        Confirmación visual posterior a respuesta exitosa del backend.
        No modifica persistencia, auditoría, IDs, atención ni datos clínicos.
      */
      if(botonGuardar && document.body.contains(botonGuardar)){
        botonGuardar.disabled = true;
        botonGuardar.removeAttribute('aria-busy');
        botonGuardar.innerHTML = '<i class="bi bi-check-circle-fill"></i> Guardado correctamente';
        botonGuardar.style.background = '#198754';
        botonGuardar.style.color = '#fff';
        botonGuardar.style.borderColor = '#198754';
        botonGuardar.style.boxShadow = '0 8px 18px rgba(25,135,84,.18)';
      }

      mensaje('ok','Corrección diagnóstica guardada correctamente.');
      notificacionGuardadoDx('ok','Corrección diagnóstica guardada correctamente.');

      /*
        Mantiene el estado visual de éxito el tiempo suficiente para que el
        usuario perciba la confirmación antes de volver al modo solo lectura.
      */
      await new Promise(resolve => window.setTimeout(resolve, 1800));

      state.correccionClinicaActiva = false;
      state.correccionClinicaMeta = null;
      auroDxRestaurarPuenteGuardadoCorreccion();

      await cargarAtencionActual(true);
      auroDxAplicarEstadoEditorHistorico();
      renderContextoSuperior();

    }catch(error){
      console.error(MODULO + ': error guardando corrección histórica.', error);
      mensaje('error', error.message || 'No se pudo guardar la corrección diagnóstica.');
      notificacionGuardadoDx('error', error.message || 'No se pudo guardar la corrección diagnóstica.');

      if(botonGuardar && document.body.contains(botonGuardar)){
        botonGuardar.disabled = false;
        botonGuardar.removeAttribute('aria-busy');
        botonGuardar.innerHTML = htmlBotonGuardar || '<i class="bi bi-save"></i> Guardar corrección';
      }
    }
  }

  async function auroDxCancelarCorreccionHistorica(){
    state.correccionClinicaActiva = false;
    state.correccionClinicaMeta = null;
    auroDxRestaurarPuenteGuardadoCorreccion();
    try{ await cargarAtencionActual(true); }catch(e){}
    auroDxAplicarEstadoEditorHistorico();
    renderContextoSuperior();
    mensaje('aviso','Corrección cancelada. Se restauró el diagnóstico guardado.');
  }



  function getValue(id){
    try{
      if(typeof window.getValueIfExists === 'function'){
        return texto(window.getValueIfExists(id));
      }
    }catch(e){}
    const el = document.getElementById(id);
    return el ? texto(el.value) : '';
  }

  function setValue(id, valor, anexar){
    const el = document.getElementById(id);
    if(!el) return false;

    const nuevo = texto(valor);
    if(!nuevo) return false;

    if(anexar && texto(el.value)){
      const actual = texto(el.value);
      if(!normalizar(actual).includes(normalizar(nuevo))){
        el.value = actual + '\n' + nuevo;
      }
    }else{
      el.value = nuevo;
    }

    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }

  function setPrimerCampo(ids, valor, anexar){
    for(const id of ids || []){
      if(document.getElementById(id)){
        return setValue(id, valor, anexar);
      }
    }
    return false;
  }

  function atencionActiva(){
    if(historiaNuevaSinAtencion()) return null;

    try{
      if(typeof window.getAtencionActiva === 'function'){
        const a = window.getAtencionActiva();
        if(a && a.id_atencion) return a;
      }
    }catch(e){}

    try{
      if(window.atencionesState && window.atencionesState.atencionActual){
        return window.atencionesState.atencionActual;
      }
    }catch(e){}

    /* Respaldo real usado por Atenciones/Plan/Examen Físico. */
    try{
      const id = texto(
        window.examenFisicoState?.atencionActual ||
        window.planState?.atencionActual ||
        state.atencionActual
      );
      if(id){
        const raw = localStorage.getItem('aurosanax_atenciones_local_v1');
        const lista = raw ? JSON.parse(raw) : [];
        if(Array.isArray(lista)){
          const encontrada = lista.find(a => texto(a?.id_atencion) === id);
          if(encontrada) return encontrada;
        }
      }
    }catch(e){}

    return null;
  }

  function idAtencionActiva(){
    if(historiaNuevaSinAtencion()) return '';

    try{
      if(typeof window.getIdAtencionActiva === 'function'){
        const id = texto(window.getIdAtencionActiva());
        if(id) return id;
      }
    }catch(e){}

    const a = atencionActiva();
    if(a && a.id_atencion) return texto(a.id_atencion);

    return texto(
      window.examenFisicoState?.atencionActual ||
      window.planState?.atencionActual ||
      state.atencionActual
    );
  }

  function idPacienteActual(){
    const a = atencionActiva() || {};
    return texto(
      a.id_paciente ||
      document.getElementById('hcPacienteSelect')?.value ||
      window.activePatientId ||
      window.historiaActual?.id_paciente ||
      window.currentHistoria?.id_paciente
    );
  }

  function obtenerAtencionesLocales(){
    try{
      const raw = localStorage.getItem('aurosanax_atenciones_local_v1');
      const lista = raw ? JSON.parse(raw) : [];
      return Array.isArray(lista) ? lista : [];
    }catch(e){
      return [];
    }
  }

  function fechaAtencionComparable(atencion){
    const a = atencion || {};
    const raw = texto(
      a.fecha_atencion || a.fecha_consulta || a.fecha || a.creado_en ||
      a.fecha_creacion || a.actualizado_en || ''
    );
    const t = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  function contextoAtencionSeleccionada(){
    /*
      La atención activa de Atenciones tiene prioridad sobre cualquier estado
      temporal conservado por Diagnóstico, Plan o Examen Físico.
    */
    const actual = atencionActiva() || {};
    const idMaestro = texto(actual.id_atencion || idAtencionActiva());
    const id = texto(idMaestro || state.atencionActual);
    const idPaciente = texto(actual.id_paciente || idPacienteActual());
    const lista = obtenerAtencionesLocales();

    const delPaciente = lista.filter(a => {
      if(!idPaciente) return true;
      return texto(a?.id_paciente) === idPaciente;
    });

    const ordenadas = [...delPaciente].sort((a,b) => {
      const fa = fechaAtencionComparable(a);
      const fb = fechaAtencionComparable(b);
      if(fa !== fb) return fb - fa;
      const na = Number(a?.numero_consulta || a?.numero_atencion || a?.numero || 0);
      const nb = Number(b?.numero_consulta || b?.numero_atencion || b?.numero || 0);
      return nb - na;
    });

    const registroLocal = lista.find(a => texto(a?.id_atencion) === id) || null;

    /*
      AUROSANAX FIX QUIRÚRGICO 2026-08-23 — ESTADO MAESTRO DE LA ATENCIÓN
      -------------------------------------------------------------------
      Si Atenciones informa explícitamente la atención seleccionada, su estado
      tiene prioridad sobre una copia local que pueda haber quedado desfasada.
      Esto evita bloquear Diagnóstico durante una consulta que continúa abierta.
      Para consultas históricas sin atención maestra disponible se conserva el
      registro local como respaldo, sin alterar persistencia ni auditoría.
    */
    const registro = (
      idMaestro &&
      idMaestro === id &&
      actual &&
      typeof actual === 'object'
    )
      ? Object.assign({}, registroLocal || {}, actual)
      : (registroLocal || actual);

    const ultima = ordenadas[0] || registro || null;
    const idUltima = texto(ultima?.id_atencion);

    const estadoMaestro = normalizar(
      actual?.estado_atencion ||
      actual?.estado_consulta ||
      actual?.estado ||
      ''
    );
    const estadoLocal = normalizar(
      registroLocal?.estado_atencion ||
      registroLocal?.estado_consulta ||
      registroLocal?.estado ||
      ''
    );
    const estado = (idMaestro && idMaestro === id && estadoMaestro)
      ? estadoMaestro
      : (estadoLocal || normalizar(
          registro?.estado_atencion ||
          registro?.estado_consulta ||
          registro?.estado ||
          ''
        ));

    const cerrada = /(cerrad|finaliz|complet|anulad|cancelad|archivad)/.test(estado);

    const idPlan = texto(window.planState?.atencionActual || window.planState?.id_atencion || '');
    const idExamen = texto(window.examenFisicoState?.atencionActual || window.examenFisicoState?.id_atencion || '');
    const coincidePlan = !idPlan || idPlan === id;
    const coincideExamen = !idExamen || idExamen === id;
    const esUltima = !idUltima || idUltima === id;

    /*
      Plan y Examen pueden tardar milisegundos en actualizar su estado interno.
      Esa demora no convierte la consulta activa en histórica. El bloqueo de
      edición depende solo de la atención maestra: existente, última y abierta.
    */
    /*
      AUROSANAX FIX QUIRÚRGICO 2026-08-23 — EDICIÓN DE ATENCIÓN ABIERTA
      ------------------------------------------------------------------
      La editabilidad no debe depender de que el registro resulte ser el primero
      del arreglo local. Ese orden puede quedar desfasado mientras la consulta
      actual sigue abierta y provocaba que Diagnóstico quedara bloqueado.

      Fuente maestra: la atención actualmente seleccionada + su estado.
      - Si está abierta: permite agregar, cambiar principal/tipo y eliminar CIE-10.
      - Si está finalizada/cerrada: solo lectura, salvo corrección histórica.
      - No cambia IDs, persistencia, auditoría, Plan ni Apps Script.
    */
    const editable = !!id && !cerrada && (!idMaestro || idMaestro === id);

    return {
      id,
      atencion: registro || {},
      numeroConsulta: texto(registro?.numero_consulta || registro?.numero_atencion || registro?.numero || actual.numero_consulta || actual.numero_atencion || actual.numero),
      esUltima,
      cerrada,
      coincidePlan,
      coincideExamen,
      editable,
      historica: !editable
    };
  }

  function puedeAplicarAlPlan(){
    const ctx = contextoAtencionSeleccionada();
    return ctx.editable === true || (ctx.historica && state.correccionClinicaActiva === true);
  }

  function diagnosticosConteo(){
    const total = state.diagnosticos.length;
    const principales = state.diagnosticos.filter(d => d.principal).length;
    const asociados = Math.max(0, total - (principales ? 1 : 0));
    return {total, principales: principales ? 1 : 0, asociados};
  }

  function asegurarContextoSuperior(){
    const panel = document.getElementById('hc_diagnostico') || buscarPanelExistente();
    if(!panel) return null;
    let box = document.getElementById('auroDxContextoSuperior');
    if(!box){
      box = document.createElement('div');
      box.id = 'auroDxContextoSuperior';
      box.className = 'auro-dx-contexto-superior';
      panel.insertBefore(box, panel.firstChild);
    }
    return box;
  }

  function renderContextoSuperior(){
    const box = asegurarContextoSuperior();
    if(!box) return;

    const ctx = contextoAtencionSeleccionada();
    const c = diagnosticosConteo();
    const estadoClase = ctx.editable ? 'editable' : 'historica';
    const estadoTexto = ctx.editable ? 'Atención activa y editable' : 'Consulta histórica · Solo lectura';
    const totalTexto = c.total === 1 ? '1 diagnóstico registrado' : c.total + ' diagnósticos registrados';
    const asociadosTexto = c.asociados === 1 ? '1 asociado' : c.asociados + ' asociados';

    box.innerHTML = `
      <div class="auro-dx-contexto-main">
        <div class="auro-dx-contexto-icon"><i class="bi bi-journal-medical"></i></div>
        <div class="auro-dx-contexto-copy">
          <div class="auro-dx-contexto-kicker">DIAGNÓSTICO DE LA CONSULTA</div>
          <div class="auro-dx-contexto-title">
            ${ctx.numeroConsulta ? 'Consulta #' + escapeHtml(ctx.numeroConsulta) : 'Consulta seleccionada'}
          </div>
          <div class="auro-dx-contexto-id">Atención: ${escapeHtml(ctx.id || 'Sin atención seleccionada')}</div>
        </div>
        <div class="auro-dx-contexto-state ${estadoClase}">
          <i class="bi ${ctx.editable ? 'bi-pencil-square' : 'bi-lock'}"></i>
          ${escapeHtml(estadoTexto)}
        </div>
      </div>
      ${ctx.historica ? `
        <div class="auro-dx-correccion-actions">
          ${state.correccionClinicaActiva ? `
            <span class="auro-dx-correccion-note"><i class="bi bi-unlock"></i> Corrección habilitada temporalmente</span>
            <button type="button" class="auro-dx-btn primary" onclick="window.auroDxGuardarCorreccionHistorica()"><i class="bi bi-save"></i> Guardar corrección</button>
            <button type="button" class="auro-dx-btn ghost" onclick="window.auroDxCancelarCorreccionHistorica()">Cancelar</button>
          ` : `
            <span class="auro-dx-correccion-note"><i class="bi bi-shield-lock"></i> El original permanece protegido</span>
            <button type="button" class="auro-dx-btn ghost" onclick="window.auroDxIniciarCorreccionHistorica()"><i class="bi bi-pencil-square"></i> Corregir diagnóstico</button>
          `}
        </div>
      ` : `
        <div class="auro-dx-correccion-actions">
          <span class="auro-dx-correccion-note ${state.edicionDiagnosticoAbierto ? 'auro-dx-note-edicion' : 'auro-dx-note-protegido'}">
            <i class="bi ${state.edicionDiagnosticoAbierto ? 'bi-pencil-square' : 'bi-shield-lock'}"></i>
            ${state.edicionDiagnosticoAbierto
              ? 'Edición activa. Modifique los CIE-10 y luego presione “Guardar cambios del diagnóstico”.'
              : (state.diagnosticos.length
                  ? 'Diagnóstico protegido. Presione “Editar diagnóstico” para habilitar los campos CIE-10.'
                  : 'Diagnóstico protegido. Presione “Agregar diagnóstico” para habilitar los campos CIE-10.')}
          </span>

          ${state.edicionDiagnosticoAbierto ? `
            <button
              type="button"
              class="auro-dx-btn auro-dx-save-ready"
              id="auroDxGuardarCambiosAbiertosBtn"
              onclick="window.auroDxGuardarCambiosAtencionAbierta()"
            >
              <i class="bi bi-save"></i> Guardar cambios del diagnóstico
            </button>
            <button
              type="button"
              class="auro-dx-btn ghost"
              onclick="window.auroDxCancelarEdicionDiagnosticoAbierto()"
            >
              Cancelar
            </button>
          ` : `
            <button
              type="button"
              class="auro-dx-btn auro-dx-edit"
              id="auroDxEditarDiagnosticoAbiertoBtn"
              onclick="window.auroDxIniciarEdicionDiagnosticoAbierto()"
            >
              <i class="bi bi-pencil-square"></i>
              ${state.diagnosticos.length ? 'Editar diagnóstico' : 'Agregar diagnóstico'}
            </button>
          `}
        </div>
      `}
      <div class="auro-dx-contexto-stats">
        <div class="auro-dx-contexto-stat">
          <span>Total</span><strong>${escapeHtml(totalTexto)}</strong>
        </div>
        <div class="auro-dx-contexto-stat">
          <span>Clasificación</span><strong>${c.total ? '1 principal · ' + escapeHtml(asociadosTexto) : 'Sin diagnósticos'}</strong>
        </div>
        <div class="auro-dx-contexto-stat">
          <span>Protocolos</span><strong>${state.protocolos.length} disponible(s)</strong>
        </div>
      </div>
    `;
    setTimeout(auroDxAplicarEstadoEditorHistorico, 0);
  }

  function optimizarTitulosResumenExistente(){
    const panel = document.getElementById('hc_diagnostico') || buscarPanelExistente();
    if(!panel) return;

    const app = document.getElementById('auroDiagnosticosApp');
    const nodos = panel.querySelectorAll('h1,h2,h3,h4,h5,h6,p,small,span,div,button');
    nodos.forEach(el => {
      if(app && app.contains(el)) return;
      if(el.children.length && el.tagName !== 'BUTTON') return;
      const t = texto(el.textContent);
      if(t === 'Diagnósticos CIE-10 previos guardados'){
        el.textContent = 'Resumen diagnóstico de la consulta';
      }else if(/^Información leída desde Google Sheets/i.test(t)){
        el.textContent = 'Información diagnóstica registrada para esta atención.';
      }else if(t === 'LISTADO CIE-10 ESTRUCTURADO' || t === 'Listado CIE-10 estructurado'){
        el.textContent = 'Detalle diagnóstico registrado';
      }else if(t === 'Ocultar'){
        el.textContent = 'Ocultar resumen';
        el.setAttribute('aria-label','Ocultar resumen diagnóstico');
      }else if(t === 'Mostrar'){
        el.textContent = 'Mostrar resumen';
        el.setAttribute('aria-label','Mostrar resumen diagnóstico');
      }
    });
  }

  /*
    AUROSANAX 1.5.10 — EDICIÓN / GUARDADO DE DIAGNÓSTICO EN ATENCIÓN ABIERTA
    ------------------------------------------------------------------------
    Alcance estricto:
    - Solo para la atención actualmente abierta y editable.
    - Usa el guardador autónomo YA existente del ERP.
    - Mantiene la misma id_atencion.
    - No crea atención, examen ni corrección histórica.
    - No toca Plan, Recetas, Apps Script ni seguridad.
    - Después de confirmar el guardado vuelve a leer Diagnóstico y protocolos;
      el flujo normal de cargarAtencion(..., true) emite el evento que reconstruye
      las tarjetas de Plan con los diagnósticos efectivamente guardados.
  */
  let auroDxGuardandoCambiosAbiertos = false;
  let auroDxGuardadoAbiertoToken = 0;

  function auroDxIniciarEdicionDiagnosticoAbierto(){
    const ctx = contextoAtencionSeleccionada();

    if(!ctx.id || ctx.editable !== true || ctx.historica){
      mensaje(
        'error',
        'Solo puede editar directamente el diagnóstico mientras la atención permanezca abierta.'
      );
      return false;
    }

    sincronizarEditorCie10DesdeDiagnosticos();
    try{
      if(typeof window.auroLimpiarBusquedaDiagnosticoCie10 === 'function'){
        window.auroLimpiarBusquedaDiagnosticoCie10(false);
      }
    }catch(_e){}
    state.edicionDiagnosticoAbierto = true;
    renderContextoSuperior();
    auroDxAplicarEstadoEditorHistorico();
    configurarModoProtocoloMaestro();

    mensaje(
      'aviso',
      state.diagnosticos.length
        ? 'Edición de diagnóstico habilitada. Modifique los CIE-10 y luego presione “Guardar cambios del diagnóstico”.'
        : 'Edición habilitada. Agregue los diagnósticos y luego presione “Guardar cambios del diagnóstico”.'
    );

    try{
      const editor =
        document.getElementById('hcDiagnosticoCieGrupo') ||
        document.getElementById('hcDxSeleccionadosBody');

      if(editor){
        editor.scrollIntoView({behavior:'smooth', block:'start'});
      }
    }catch(_e){}

    return true;
  }

  function auroDxCancelarEdicionDiagnosticoAbierto(){
    sincronizarEditorCie10DesdeDiagnosticos();
    try{
      if(typeof window.auroLimpiarBusquedaDiagnosticoCie10 === 'function'){
        window.auroLimpiarBusquedaDiagnosticoCie10(false);
      }
    }catch(_e){}
    state.edicionDiagnosticoAbierto = false;
    renderContextoSuperior();
    auroDxAplicarEstadoEditorHistorico();
    configurarModoProtocoloMaestro();

    mensaje(
      'aviso',
      'Edición cancelada. Se restauró en pantalla el diagnóstico guardado.'
    );

    return true;
  }

  window.auroDxIniciarEdicionDiagnosticoAbierto =
    auroDxIniciarEdicionDiagnosticoAbierto;

  window.auroDxCancelarEdicionDiagnosticoAbierto =
    auroDxCancelarEdicionDiagnosticoAbierto;

  function auroDxNotificarGuardadoAbierto(tipo, textoMensaje){
    let toast = document.getElementById('auroDxGuardadoAbiertoToast');
    if(toast) toast.remove();

    toast = document.createElement('div');
    toast.id = 'auroDxGuardadoAbiertoToast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');

    const ok = tipo === 'ok';
    toast.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:max(22px,calc(14px + env(safe-area-inset-bottom)))',
      'transform:translateX(-50%)',
      'z-index:2147483001',
      'width:min(92vw,520px)',
      'box-sizing:border-box',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:13px 15px',
      'border-radius:14px',
      'font-family:inherit',
      'font-size:13px',
      'font-weight:800',
      'line-height:1.35',
      'box-shadow:0 18px 45px rgba(15,23,42,.20)',
      'border:1px solid ' + (ok ? '#b7e4c7' : '#fecaca'),
      'background:' + (ok ? '#f0fdf4' : '#fff1f2'),
      'color:' + (ok ? '#166534' : '#b42318')
    ].join(';');

    toast.innerHTML =
      '<i class="bi ' + (ok ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill') +
      '" style="font-size:18px;flex:0 0 auto"></i>' +
      '<span>' + escapeHtml(textoMensaje || '') + '</span>';

    document.body.appendChild(toast);
    window.setTimeout(() => {
      try{ toast.remove(); }catch(_e){}
    }, ok ? 2600 : 4200);
  }

  /*
    AUROSANAX DX - VERIFICACIÓN AUTORITATIVA POST-GUARDADO
    -----------------------------------------------------
    Uso EXCLUSIVO: edición de una atención abierta.
    - Consulta únicamente la fuente persistida de diagnósticos.
    - NO fusiona con diagnosticosLocales().
    - NO usa detalle del Examen Físico como fallback.
    - Una respuesta válida con 0 diagnósticos significa 0.
    - No modifica el flujo normal ni la corrección histórica.
  */
  async function auroDxVerificarDiagnosticosPersistidosAbiertos(idAtencion){
    const respuesta = await getJSON('listarDiagnosticosPorAtencion', {
      id_atencion: texto(idAtencion)
    });

    if(respuesta && respuesta.success === false){
      throw new Error(
        respuesta.message ||
        'No se pudo verificar el diagnóstico persistido de la atención.'
      );
    }

    return normalizarDiagnosticosServidor(respuesta);
  }

  async function auroDxVerificarGuardadoAbiertoEnSegundoPlano(idAtencion, tokenGuardado){
    const idEsperado = texto(idAtencion);
    if(!idEsperado) return false;

    try{
      const persistidos = await auroDxVerificarDiagnosticosPersistidosAbiertos(idEsperado);

      if(tokenGuardado !== auroDxGuardadoAbiertoToken) return false;
      if(state.atencionActual !== idEsperado) return false;

      /*
        Si el médico ya inició otra edición, no se pisa su editor.
        El siguiente guardado/verificación resolverá el nuevo estado.
      */
      if(state.edicionDiagnosticoAbierto === true) return false;

      state.diagnosticos = clonar(persistidos, []);
      sincronizarEditorCie10DesdeDiagnosticos();
      renderDiagnosticos();
      renderContextoSuperior();
      auroDxAplicarEstadoEditorHistorico();

      return true;
    }catch(error){
      console.warn(
        MODULO + ': el POST fue confirmado, pero no se pudo completar la verificación secundaria.',
        error
      );
      return false;
    }
  }

  /*
    AUROSANAX DX - ACTUALIZACIÓN SECUNDARIA DE PROTOCOLOS
    -----------------------------------------------------
    Uso exclusivo después de guardar una atención abierta.
    El diagnóstico ya fue persistido y verificado antes de entrar aquí.
    Esta función NO vuelve a cargar Historia, Anamnesis, Examen Físico ni
    especialidades; únicamente actualiza protocolos e integración derivada.
  */
  async function auroDxActualizarProtocolosEnSegundoPlano(idAtencion){
    const idEsperado = texto(idAtencion);
    if(!idEsperado || state.atencionActual !== idEsperado) return false;

    const firmaEsperada = (state.diagnosticos || [])
      .map(d => auroDxClaveProtocolo(d.codigo_cie10))
      .filter(Boolean)
      .sort()
      .join('|');

    try{
      const protocolos = await consultarProtocolos({forzar:false});

      if(state.atencionActual !== idEsperado) return false;

      const firmaActual = (state.diagnosticos || [])
        .map(d => auroDxClaveProtocolo(d.codigo_cie10))
        .filter(Boolean)
        .sort()
        .join('|');

      /*
        Si el usuario cambió diagnósticos mientras cargaban los protocolos,
        esta respuesta queda obsoleta y no se aplica.
      */
      if(firmaActual !== firmaEsperada) return false;

      state.protocolos = clonar(protocolos, []);

      if(state.protocolos.length){
        if(
          state.protocoloSeleccionado === null ||
          state.protocoloSeleccionado >= state.protocolos.length
        ){
          state.protocoloSeleccionado = 0;
        }
      }else{
        state.protocoloSeleccionado = null;
      }

      renderProtocolos();
      renderContextoSuperior();
      configurarModoProtocoloMaestro();

      try{
        document.dispatchEvent(new CustomEvent(
          'aurosanax:protocolos-diagnostico-listos',
          {
            detail:{
              id_atencion:idEsperado,
              diagnosticos:clonar(state.diagnosticos, []),
              protocolos:clonar(state.protocolos, [])
            }
          }
        ));
      }catch(_e){}

      guardarEstadoTemporal();
      return true;

    }catch(error){
      /*
        El diagnóstico ya está guardado. Un fallo de protocolos no revierte
        ni falsea la confirmación del diagnóstico.
      */
      console.warn(
        MODULO + ': diagnóstico guardado; no se pudieron actualizar los protocolos en segundo plano.',
        error
      );
      return false;
    }
  }

  async function auroDxGuardarCambiosAtencionAbierta(){
    if(auroDxGuardandoCambiosAbiertos) return;

    const ctx = contextoAtencionSeleccionada();

    if(!ctx.id || ctx.editable !== true || ctx.historica){
      mensaje(
        'error',
        'El guardado directo del diagnóstico solo está disponible mientras la atención permanezca abierta.'
      );
      renderContextoSuperior();
      return;
    }

    if(state.edicionDiagnosticoAbierto !== true){
      mensaje(
        'aviso',
        'Primero presione “Editar diagnóstico” para habilitar una modificación controlada.'
      );
      renderContextoSuperior();
      return;
    }

    if(typeof window.auroGuardarDiagnosticosAtencionActual !== 'function'){
      mensaje(
        'error',
        'No está disponible el guardador autónomo de Diagnóstico. No se realizó ningún cambio.'
      );
      return;
    }

    /*
      Sincroniza únicamente la tabla visible CIE-10 con sus campos compatibles
      antes de invocar el guardador existente. No persiste por sí mismo.
    */
    try{
      if(typeof window.sincronizarDiagnosticosConCamposHistoria === 'function'){
        window.sincronizarDiagnosticosConCamposHistoria();
      }else if(typeof sincronizarDiagnosticosConCamposHistoria === 'function'){
        sincronizarDiagnosticosConCamposHistoria();
      }
    }catch(error){
      console.warn(
        MODULO + ': no se pudieron sincronizar los campos CIE-10 antes del guardado.',
        error
      );
    }

    const btn = document.getElementById('auroDxGuardarCambiosAbiertosBtn');
    const htmlOriginal = btn ? btn.innerHTML : '';

    auroDxGuardandoCambiosAbiertos = true;

    if(btn){
      btn.disabled = true;
      btn.setAttribute('aria-busy','true');
      btn.classList.remove('auro-dx-save-ready','auro-dx-saved','auro-dx-error');
      btn.classList.add('auro-dx-saving');
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Guardando diagnóstico…';
    }

    mensaje('aviso','Guardando diagnóstico. Espere la confirmación antes de continuar.');

    try{
      const snapshotPersistido = clonar(state.diagnosticos, []);
      const snapshotEditor = diagnosticosLocales();

      const idExamenConocido = texto(
        state.detalleExamen?.id_examen ||
        snapshotPersistido.find(d => texto(d.id_examen))?.id_examen ||
        ''
      );

      const resultado = await Promise.resolve(
        window.auroGuardarDiagnosticosAtencionActual({
          omitir_refresco_visor:true,
          omitir_lectura_persistidos:true,
          persistidos_base:snapshotPersistido,
          omitir_busqueda_examen:true,
          id_examen_preferido:idExamenConocido,
          origen:'edicion_diagnostico_abierto'
        })
      );

      if(!resultado || resultado.success !== true){
        throw new Error(
          resultado?.message ||
          'No se pudo confirmar el guardado del diagnóstico.'
        );
      }

      /*
        El backend ya confirmó success:true.
        La UI adopta inmediatamente EXACTAMENTE el snapshot que se envió.
        No hay GET bloqueante posterior ni posibilidad de “resucitar” un
        diagnóstico antiguo durante la experiencia de guardado.
      */
      state.diagnosticos = clonar(snapshotEditor, []);
      sincronizarEditorCie10DesdeDiagnosticos();

      const tokenGuardado = ++auroDxGuardadoAbiertoToken;

      /*
        Verificación remota posterior: no bloquea el botón.
      */
      try{
        Promise.resolve(
          auroDxVerificarGuardadoAbiertoEnSegundoPlano(ctx.id, tokenGuardado)
        );
      }catch(_e){}

      if(state.diagnosticos.length === 0){
        state.protocolos = [];
        state.protocoloSeleccionado = null;
        state.resumenClinico = '';
        state.analisisClinico = '';
        state.conducta = '';

        try{
          document.dispatchEvent(new CustomEvent(
            'aurosanax:protocolos-diagnostico-listos',
            {
              detail:{
                id_atencion: ctx.id,
                diagnosticos: [],
                protocolos: []
              }
            }
          ));
        }catch(_e){}

        guardarEstadoTemporal();
      }else{
        /*
          El diagnóstico ya está confirmado. Los protocolos continúan aparte
          y NO bloquean el botón ni disparan una recarga clínica completa.
        */
        try{
          Promise.resolve(
            auroDxActualizarProtocolosEnSegundoPlano(ctx.id)
          ).catch(error => {
            console.warn(
              MODULO + ': diagnóstico guardado; protocolos pendientes.',
              error
            );
          });
        }catch(_e){}
      }

      if(btn && document.body.contains(btn)){
        btn.disabled = true;
        btn.removeAttribute('aria-busy');
        btn.classList.remove('auro-dx-saving','auro-dx-save-ready','auro-dx-error');
        btn.classList.add('auro-dx-saved');
        btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Diagnóstico guardado ✓';
      }

      mensaje(
        'ok',
        state.diagnosticos.length === 0
          ? 'Diagnósticos eliminados. Las sugerencias diagnósticas del Plan se retiraron; el Plan ya guardado permanece intacto.'
          : (resultado.sin_cambios
              ? 'Diagnóstico verificado. No había cambios nuevos para guardar.'
              : 'Diagnóstico guardado correctamente. Los protocolos se actualizan en segundo plano.')
      );

      /*
        No existe espera artificial. La edición se cierra únicamente después
        de confirmar el estado persistido.
      */
      state.edicionDiagnosticoAbierto = false;
      try{
        if(typeof window.auroLimpiarBusquedaDiagnosticoCie10 === 'function'){
          window.auroLimpiarBusquedaDiagnosticoCie10(false);
        }
      }catch(_e){}

      /*
        La edición clínica ya terminó y el editor se bloquea de inmediato.
        La cabecera se redibuja 700 ms después para que el médico alcance a
        percibir “Diagnóstico guardado ✓”. Esta espera NO bloquea persistencia,
        protocolos ni navegación interna.
      */
      auroDxAplicarEstadoEditorHistorico();
      configurarModoProtocoloMaestro();

      window.setTimeout(() => {
        try{
          if(
            state.edicionDiagnosticoAbierto === false &&
            contextoAtencionSeleccionada().id === ctx.id
          ){
            renderContextoSuperior();
            auroDxAplicarEstadoEditorHistorico();
          }
        }catch(_e){}
      }, 700);

      auroDxNotificarGuardadoAbierto(
        'ok',
        state.diagnosticos.length === 0
          ? 'Diagnóstico guardado: la atención quedó sin diagnósticos.'
          : 'Diagnóstico guardado correctamente.'
      );

      try{
        document.dispatchEvent(new CustomEvent(
          'aurosanax:diagnostico-abierto-guardado',
          {
            detail:{
              id_atencion: ctx.id,
              diagnosticos: clonar(state.diagnosticos, []),
              protocolos: clonar(state.protocolos, []),
              sin_cambios: !!resultado.sin_cambios
            }
          }
        ));
      }catch(_e){}

      return resultado;

    }catch(error){
      console.error(
        MODULO + ': no se pudo guardar la edición de diagnóstico abierto.',
        error
      );

      mensaje(
        'error',
        'No se guardaron los cambios del diagnóstico: ' +
        (error?.message || String(error))
      );

      if(btn && document.body.contains(btn)){
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.classList.remove('auro-dx-saving','auro-dx-saved');
        btn.classList.add('auro-dx-error');
        btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i> Error al guardar · Reintentar';

        window.setTimeout(() => {
          try{
            if(document.body.contains(btn) && state.edicionDiagnosticoAbierto === true){
              btn.classList.remove('auro-dx-error');
              btn.classList.add('auro-dx-save-ready');
              btn.innerHTML =
                htmlOriginal || '<i class="bi bi-save"></i> Guardar cambios del diagnóstico';
            }
          }catch(_e){}
        }, 1600);
      }

      auroDxNotificarGuardadoAbierto(
        'error',
        'No se pudo guardar el diagnóstico. Revise la conexión e intente nuevamente.'
      );

      return null;

    }finally{
      auroDxGuardandoCambiosAbiertos = false;

      const botonActual = document.getElementById('auroDxGuardarCambiosAbiertosBtn');

      /*
        En éxito, state.edicionDiagnosticoAbierto ya es false y el botón se
        mantiene verde hasta el redraw programado. En error permanece activo.
      */
      if(botonActual && state.edicionDiagnosticoAbierto === true){
        botonActual.disabled = false;
        botonActual.removeAttribute('aria-busy');

        if(!botonActual.classList.contains('auro-dx-error')){
          botonActual.classList.remove('auro-dx-saving','auro-dx-saved');
          botonActual.classList.add('auro-dx-save-ready');
          botonActual.innerHTML =
            htmlOriginal || '<i class="bi bi-save"></i> Guardar cambios del diagnóstico';
        }
      }
    }
  }

  window.auroDxGuardarCambiosAtencionAbierta =
    auroDxGuardarCambiosAtencionAbierta;

  /*
    AUROSANAX 1.5.10 — HANDOFF GLOBAL CIE-10 → PLAN SIN APLICACIÓN AUTOMÁTICA
    ------------------------------------------------------------------------
    Problema corregido:
    El botón principal del visor CIE-10 conserva un flujo histórico que guarda
    Diagnóstico y aplica automáticamente medicamentos/órdenes/indicaciones,
    mostrando un alert con conteos y generando una espera innecesaria.

    Solución:
    - Diagnóstico sustituye únicamente la acción pública del botón mientras
      este módulo está cargado.
    - Lee el protocolo YA consultado por CIE-10 mediante su API pública
      auroCie10InteligenteEstado(); no accede a variables privadas.
    - Envía las sugerencias a las tarjetas de Plan.
    - Navega inmediatamente a Plan.
    - NO guarda diagnóstico.
    - NO agrega medicamentos u órdenes automáticamente.
    - NO guarda Plan.
    - NO toca Recetas, Apps Script, Google Sheets ni seguridad.
    - Si CIE-10 no está disponible, Diagnóstico continúa funcionando.
  */
  let auroDxCieAplicarOriginal = null;

  function auroDxProtocoloActualDesdeCie10(){
    try{
      if(typeof window.auroCie10InteligenteEstado !== 'function') return null;

      const estadoCie = window.auroCie10InteligenteEstado() || {};
      const resultado = estadoCie.ultimoResultado || {};
      const raw = resultado.protocolo || null;
      if(!raw) return null;

      const diagnostico = {
        codigo_cie10: texto(
          estadoCie.ultimoCodigo ||
          raw.codigo_cie10 ||
          raw.cie10
        ).replace(/\./g,'').toUpperCase(),
        descripcion: texto(
          estadoCie.ultimoNombre ||
          raw.diagnostico ||
          raw.descripcion_diagnostico
        )
      };

      return normalizarProtocolo(raw, diagnostico);
    }catch(error){
      console.warn(
        MODULO + ': no se pudo leer el protocolo actual del visor CIE-10.',
        error
      );
      return null;
    }
  }

  async function auroDxHandoffCie10AlPlan(){
    if(!puedeAplicarAlPlan()){
      mensaje(
        'error',
        'El Plan solo puede prepararse desde una atención activa o desde una corrección clínica histórica habilitada.'
      );
      configurarModoProtocoloMaestro();
      return;
    }

    const protocoloCie = auroDxProtocoloActualDesdeCie10();
    const protocolos = protocoloCie
      ? [protocoloCie]
      : clonar(state.protocolos, []);

    if(!protocolos.length){
      mensaje(
        'aviso',
        'No hay sugerencias de protocolo disponibles para revisar en el Plan.'
      );
      return;
    }

    let diagnosticos = clonar(state.diagnosticos, []);
    if(
      protocoloCie &&
      protocoloCie.codigo_cie10 &&
      !diagnosticos.some(d =>
        texto(d.codigo_cie10).replace(/\./g,'').toUpperCase() ===
        texto(protocoloCie.codigo_cie10).replace(/\./g,'').toUpperCase()
      )
    ){
      diagnosticos.push({
        codigo_cie10: protocoloCie.codigo_cie10,
        descripcion: protocoloCie.diagnostico || '',
        principal: diagnosticos.length === 0,
        tipo_diagnostico: 'Presuntivo',
        estado: 'Activo',
        origen: 'CIE-10 inteligente'
      });
    }

    try{
      document.dispatchEvent(new CustomEvent(
        'aurosanax:protocolos-diagnostico-listos',
        {
          detail:{
            id_atencion: state.atencionActual,
            diagnosticos,
            protocolos: clonar(protocolos, [])
          }
        }
      ));
    }catch(error){
      console.warn(
        MODULO + ': no se pudieron publicar las sugerencias para Plan.',
        error
      );
    }

    /*
      Mantiene el contexto de Plan en sincronización, pero nunca bloquea
      la navegación esperando esta promesa.
    */
    try{
      if(typeof window.cambiarPlanPorAtencion === 'function'){
        Promise.resolve(
          window.cambiarPlanPorAtencion(state.atencionActual)
        ).catch(error => {
          console.warn(
            MODULO + ': Plan continuará sincronizando en segundo plano.',
            error
          );
        });
      }
    }catch(error){
      console.warn(
        MODULO + ': no se pudo iniciar la sincronización no bloqueante de Plan.',
        error
      );
    }

    guardarEstadoTemporal();

    mensaje(
      'ok',
      'Sugerencias listas en Plan. Seleccione allí únicamente lo que corresponda.'
    );

    try{
      if(typeof window.navegarAtencionActiva === 'function'){
        window.navegarAtencionActiva('hc_plan');
        return;
      }

      const botonPlan = Array.from(
        document.querySelectorAll('button')
      ).find(btn =>
        String(btn.getAttribute('onclick') || '')
          .includes("navegarAtencionActiva('hc_plan'")
      );

      if(botonPlan){
        botonPlan.click();
        return;
      }

      const plan = document.getElementById('hc_plan');
      if(plan){
        plan.scrollIntoView({behavior:'smooth', block:'start'});
      }
    }catch(error){
      console.warn(
        MODULO + ': las sugerencias están listas, pero no fue posible navegar automáticamente a Plan.',
        error
      );
    }
  }

  function auroDxInstalarHandoffCie10Global(){
    const actual = window.auroCie10InteligenteAplicarAlPlan;
    if(typeof actual !== 'function') return false;
    if(actual.__auroDxHandoffPlan === true) return true;

    if(!auroDxCieAplicarOriginal){
      auroDxCieAplicarOriginal = actual;
    }

    const puente = async function(){
      return await auroDxHandoffCie10AlPlan();
    };

    puente.__auroDxHandoffPlan = true;
    puente.__auroDxOriginal = auroDxCieAplicarOriginal;

    window.auroCie10InteligenteAplicarAlPlan = puente;
    return true;
  }

  function configurarModoProtocoloMaestro(){
    const box = document.getElementById('auroCie10InteligenteBox');
    if(!box) return;

    const ctx = contextoAtencionSeleccionada();
    const lecturaHistorica = !puedeAplicarAlPlan();
    const edicionAbiertaPendiente =
      ctx.editable === true &&
      ctx.historica !== true &&
      state.edicionDiagnosticoAbierto === true;

    const lectura = lecturaHistorica || edicionAbiertaPendiente;
    state.protocoloVisualModoLectura = lectura;

    let btnAplicar = box.querySelector('.auro-cie10-btn.primary');
    if(btnAplicar){
      /*
        AUROSANAX FIX QUIRÚRGICO 2026-08-23 — BOTÓN MAESTRO CIE-10 → PLAN
        ------------------------------------------------------------------
        El visor CIE-10 podía conservar un manejador antiguo que guardaba el
        diagnóstico y aplicaba automáticamente todas las sugerencias al Plan,
        generando el alert nativo con conteos de medicamentos/órdenes.

        Cuando el visor se abre DESDE Diagnóstico, el botón debe ejecutar el
        handoff actual de Diagnóstico: preparar sugerencias y abrir Plan, sin
        aplicar ni guardar automáticamente medicamentos u órdenes.

        Se clona únicamente este botón para retirar listeners heredados del
        visor maestro. No modifica el motor CIE-10, Plan, Recetas ni backend.
      */
      if(btnAplicar.dataset.auroDxHandoff !== '1'){
        const limpio = btnAplicar.cloneNode(true);
        limpio.dataset.auroDxHandoff = '1';
        limpio.removeAttribute('onclick');
        limpio.onclick = null;
        limpio.addEventListener('click', function(evento){
          evento.preventDefault();
          evento.stopImmediatePropagation();
          aplicarAlPlan();
        });
        btnAplicar.replaceWith(limpio);
        btnAplicar = limpio;
      }

      if(lecturaHistorica){
        btnAplicar.style.display = 'none';
        btnAplicar.disabled = true;
        btnAplicar.title =
          'Consulta histórica: disponible solo durante una corrección clínica habilitada';
      }else{
        btnAplicar.style.display = '';
        btnAplicar.disabled = edicionAbiertaPendiente;
        btnAplicar.title = edicionAbiertaPendiente
          ? 'Guarde primero los cambios del diagnóstico'
          : 'Revisar las sugerencias disponibles en Plan';

        /*
          El botón ya no “aplica” tratamientos: el flujo moderno solo publica
          sugerencias y abre Plan. El texto refleja su función real.
        */
        if(!edicionAbiertaPendiente){
          btnAplicar.innerHTML = '<i class="bi bi-arrow-right-circle me-1"></i> Revisar en Plan';
        }else{
          btnAplicar.innerHTML = '<i class="bi bi-lock me-1"></i> Guarde diagnóstico primero';
        }
      }
    }

    let aviso = box.querySelector('.auro-dx-protocolo-readonly');
    if(lecturaHistorica || edicionAbiertaPendiente){
      const textoAviso = edicionAbiertaPendiente
        ? 'Hay cambios de diagnóstico sin guardar. Guarde primero el diagnóstico antes de continuar al Plan.'
        : 'Consulta histórica: protocolo disponible únicamente para lectura.';

      if(!aviso){
        aviso = document.createElement('div');
        aviso.className = 'auro-dx-protocolo-readonly';
        const body = box.querySelector('.auro-cie10-body');
        if(body) body.insertBefore(aviso, body.firstChild);
      }

      aviso.innerHTML =
        '<i class="bi bi-lock"></i><span>' +
        escapeHtml(textoAviso) +
        '</span>';
    }else if(aviso){
      aviso.remove();
    }
  }

  async function abrirProtocoloMaestro(diagnostico){
    const d = diagnostico || {};
    const codigo = texto(d.codigo_cie10).replace(/\./g,'').toUpperCase();
    if(!codigo){
      mensaje('aviso','Este diagnóstico no tiene un código CIE-10 válido para consultar el protocolo.');
      return;
    }

    state.protocoloVisualCodigo = codigo;
    const indice = state.protocolos.findIndex(p => texto(p.codigo_cie10).replace(/\./g,'').toUpperCase() === codigo);
    if(indice >= 0) state.protocoloSeleccionado = indice;

    if(typeof window.auroCie10InteligenteBuscarProtocolo === 'function'){
      try{
        await window.auroCie10InteligenteBuscarProtocolo(codigo, texto(d.descripcion));
        configurarModoProtocoloMaestro();
        const maestro = document.getElementById('auroCie10InteligenteBox');
        maestro?.scrollIntoView({behavior:'smooth', block:'start'});
        renderProtocolos();
        guardarEstadoTemporal();
        return;
      }catch(error){
        console.warn(MODULO + ': no se pudo abrir el visor maestro.', error);
      }
    }

    /* Degradación segura: usa el motor interno solo si el visor maestro no está disponible. */
    const box = document.getElementById('auroDxProtocolos');
    if(box){
      box.hidden = false;
      box.setAttribute('aria-hidden','false');
      box.classList.add('auro-dx-protocolos-fallback-visible');
      renderProtocolos();
      box.scrollIntoView({behavior:'smooth', block:'start'});
      mensaje('aviso','Se abrió el visor interno de respaldo porque el visor CIE-10 principal no está disponible.');
    }
  }

  function diagnosticosLocales(){
    let lista = [];

    try{
      if(Array.isArray(window.hcDiagnosticosSeleccionados)){
        lista = clonar(window.hcDiagnosticosSeleccionados, []);
      }
    }catch(e){}

    return lista.map((d, i) => ({
      id_diagnostico: texto(d.id_diagnostico),
      codigo_cie10: texto(d.codigo_cie10 || d.codigo || d.cie10).replace(/\./g,'').toUpperCase(),
      descripcion: texto(d.descripcion || d.nombre),
      principal: d.principal === true || normalizar(d.principal) === 'si' || i === 0,
      tipo_diagnostico: texto(d.tipo_diagnostico || d.tipo || 'Presuntivo'),
      estado: texto(d.estado || 'Activo'),
      origen: 'Examen Físico'
    })).filter(d => d.codigo_cie10 || d.descripcion);
  }

  function normalizarDiagnosticosServidor(data){
    return arraySeguro(data).map((d, i) => ({
      id_diagnostico: texto(d.id_diagnostico),
      id_atencion: texto(d.id_atencion),
      id_examen: texto(d.id_examen),
      codigo_cie10: texto(d.codigo_cie10 || d.codigo || d.cie10).replace(/\./g,'').toUpperCase(),
      descripcion: texto(d.descripcion || d.nombre || d.diagnostico),
      principal: d.principal === true || normalizar(d.principal) === 'si' || normalizar(d.principal) === 'true',
      tipo_diagnostico: texto(d.tipo_diagnostico || d.tipo || 'Presuntivo'),
      estado: texto(d.estado || 'Activo'),
      observaciones: texto(d.observaciones),

      /*
       * AUROSANAX FIX QUIRÚRGICO FECHAS DIAGNÓSTICO 2026-08-07
       * Solo conserva las fechas reales recibidas desde Google Sheets.
       * No genera fechas, no guarda y no modifica id_atencion.
       */
      fecha_creacion: texto(d.fecha_creacion),
      fecha_actualizacion: texto(d.fecha_actualizacion),

      origen: 'Google Sheets'
    })).filter(d => {
      const activo = !d.estado || ['activo','activa','si','true'].includes(normalizar(d.estado));
      return activo && (d.codigo_cie10 || d.descripcion);
    }).map((d, i, arr) => {
      if(!arr.some(x => x.principal) && i === 0) d.principal = true;
      return d;
    });
  }

  function fusionarDiagnosticos(servidor, locales){
    const salida = [];
    const claves = new Set();

    [...(servidor || []), ...(locales || [])].forEach(d => {
      const clave = normalizar((d.codigo_cie10 || '') + '|' + (d.descripcion || ''));
      if(!clave || claves.has(clave)) return;
      claves.add(clave);
      salida.push(d);
    });

    if(salida.length && !salida.some(d => d.principal)){
      salida[0].principal = true;
    }

    return salida;
  }

  /*
    AUROSANAX - RESTAURACIÓN QUIRÚRGICA DEL EDITOR CIE-10
    Sincroniza únicamente la tabla superior con los diagnósticos ya cargados
    para la atención actual. No guarda ni consulta Apps Script.
  */
  function sincronizarEditorCie10DesdeDiagnosticos(){
    if(historiaNuevaSinAtencion()) return false;

    const id = texto(state.atencionActual || idAtencionActiva());
    if(!id) return false;

    const lista = (state.diagnosticos || []).map((d, index) => ({
      codigo: texto(d.codigo_cie10 || d.codigo || d.cie10)
        .replace(/\./g,'')
        .toUpperCase(),
      nombre: texto(d.descripcion || d.nombre || d.diagnostico),
      principal: d.principal === true || normalizar(d.principal) === 'si' || index === 0,
      tipo: texto(d.tipo_diagnostico || d.tipo || 'Presuntivo') === 'Definitivo'
        ? 'Definitivo'
        : 'Presuntivo'
    })).filter(d => d.codigo || d.nombre);

    window.hcDiagnosticosSeleccionados = clonar(lista, []);

    try{
      hcDiagnosticosSeleccionados = window.hcDiagnosticosSeleccionados;
    }catch(_e){}

    try{
      if(typeof window.renderDiagnosticosSeleccionados === 'function'){
        window.renderDiagnosticosSeleccionados();
      }else if(typeof renderDiagnosticosSeleccionados === 'function'){
        renderDiagnosticosSeleccionados();
      }
    }catch(error){
      console.warn(MODULO + ': no se pudo actualizar la tabla superior CIE-10.', error);
    }

    try{
      if(typeof window.sincronizarDiagnosticosConCamposHistoria === 'function'){
        window.sincronizarDiagnosticosConCamposHistoria();
      }else if(typeof sincronizarDiagnosticosConCamposHistoria === 'function'){
        sincronizarDiagnosticosConCamposHistoria();
      }
    }catch(error){
      console.warn(MODULO + ': no se pudieron sincronizar los campos CIE-10.', error);
    }

    return true;
  }

  function buscarPanelExistente(){
    for(const id of IDS_PANEL_CANDIDATOS){
      const el = document.getElementById(id);
      if(el) return el;
    }

    const candidatos = Array.from(document.querySelectorAll(
      '.tab-pane, .clinical-panel, .clinical-section, section, [role="tabpanel"]'
    ));

    return candidatos.find(el => {
      const titulo = el.querySelector('h1,h2,h3,h4,.clinical-title,.clinical-subtitle,.section-title');
      return titulo && normalizar(titulo.textContent).includes('diagnost');
    }) || null;
  }

  function asegurarPanel(){
    let panel = buscarPanelExistente();
    if(panel) return panel;

    const examen = document.getElementById('hc_examen');
    if(!examen || !examen.parentNode) return null;

    panel = document.createElement('section');
    panel.id = 'hc_diagnosticos';
    panel.className = 'clinical-panel tab-pane';
    panel.dataset.auroCreado = '1';
    panel.style.display = 'none';
    examen.parentNode.insertBefore(panel, examen.nextSibling);
    return panel;
  }

  function instalarEstilos(){
    if(document.getElementById('auroDiagnosticosStyles')) return;

    const style = document.createElement('style');
    style.id = 'auroDiagnosticosStyles';
    style.textContent = `
      #auroDiagnosticosApp{font-family:inherit;color:#263238}
      #auroDiagnosticosApp *{box-sizing:border-box}
      .auro-dx-shell{display:grid;gap:14px}
      .auro-dx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px;border:1px solid #dbe6e8;border-radius:16px;background:linear-gradient(135deg,#ffffff,#f5fbfb)}
      .auro-dx-head h3{margin:0;font-size:20px}
      .auro-dx-head p{margin:5px 0 0;color:#62767b;font-size:13px}
      .auro-dx-status{font-size:12px;padding:7px 10px;border-radius:999px;background:#edf7f7;color:#28626a;white-space:nowrap;max-width:100%;overflow-wrap:anywhere}
      .auro-dx-contexto-superior{margin:0 0 14px;border:1px solid #ead7e2;border-radius:20px;background:linear-gradient(135deg,#fff,#fff8fc);box-shadow:0 12px 30px rgba(139,30,90,.07);overflow:hidden}
      .auro-dx-contexto-main{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:15px 16px}
      .auro-dx-contexto-icon{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff;font-size:20px;box-shadow:0 8px 18px rgba(139,30,90,.2)}
      .auro-dx-contexto-kicker{font-size:10px;letter-spacing:.08em;font-weight:950;color:#8b1e5a}
      .auro-dx-contexto-title{font-size:19px;line-height:1.2;font-weight:950;color:#1f2937;margin-top:2px}
      .auro-dx-contexto-id{font-size:12px;color:#64748b;font-weight:750;margin-top:4px;overflow-wrap:anywhere}
      .auro-dx-contexto-state{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap}
      .auro-dx-contexto-state.editable{background:#eaf8f0;color:#216344}
      .auro-dx-contexto-state.historica{background:#f1f5f9;color:#475569}
      .auro-dx-correccion-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:10px 0 2px}
      .auro-dx-correccion-note{font-size:12px;font-weight:800;color:#64748b;margin-right:auto}
      .auro-dx-contexto-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid #f0e1e9;background:rgba(255,255,255,.72)}
      .auro-dx-contexto-stat{padding:11px 14px;border-right:1px solid #f0e1e9;min-width:0}
      .auro-dx-contexto-stat:last-child{border-right:0}
      .auro-dx-contexto-stat span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8b7280;font-weight:900}
      .auro-dx-contexto-stat strong{display:block;margin-top:3px;font-size:12px;color:#374151;overflow-wrap:anywhere}
      .auro-dx-toolbar{display:flex;flex-wrap:wrap;gap:8px}
      .auro-dx-btn{
        border:0;border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer;
        background:#eef4f5;color:#29474b;
        transition:background .18s ease,color .18s ease,box-shadow .18s ease,transform .18s ease,opacity .18s ease;
      }
      .auro-dx-btn:hover:not(:disabled){transform:translateY(-1px)}
      .auro-dx-btn.primary{background:#1d6670;color:#fff}
      .auro-dx-btn.success{background:var(--success,#16a34a);color:#fff}
      .auro-dx-btn.auro-dx-edit{
        background:var(--blue,#2563eb);color:#fff;
        box-shadow:0 7px 16px rgba(37,99,235,.16);
      }
      .auro-dx-btn.auro-dx-save-ready{
        background:linear-gradient(135deg,var(--primary,#8b1e5a),var(--primary-2,#c23b83));
        color:#fff;box-shadow:0 7px 16px rgba(139,30,90,.18);
      }
      .auro-dx-btn.auro-dx-saving{
        background:var(--warning,#f59e0b)!important;color:#fff!important;
        box-shadow:0 7px 18px rgba(245,158,11,.22)!important;
        cursor:wait!important;opacity:1!important;
      }
      .auro-dx-btn.auro-dx-saved{
        background:var(--success,#16a34a)!important;color:#fff!important;
        box-shadow:0 7px 18px rgba(22,163,74,.20)!important;
        opacity:1!important;
      }
      .auro-dx-btn.auro-dx-error{
        background:var(--danger,#dc2626)!important;color:#fff!important;
        box-shadow:0 7px 18px rgba(220,38,38,.18)!important;
        opacity:1!important;
      }
      .auro-dx-btn:disabled{opacity:.62;cursor:not-allowed}
      .auro-dx-correccion-note.auro-dx-note-protegido{
        display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border-radius:11px;
        background:#f8fafc;border:1px solid #e2e8f0;color:#475569;
      }
      .auro-dx-correccion-note.auro-dx-note-edicion{
        display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border-radius:11px;
        background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;
      }
      .auro-dx-grid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(360px,1.4fr);gap:14px}
      .auro-dx-card{border:1px solid #dce7e9;border-radius:16px;background:#fff;overflow:hidden}
      .auro-dx-card-head{padding:12px 14px;border-bottom:1px solid #e4edef;background:#f8fbfb;font-weight:800}
      .auro-dx-card-body{padding:14px}
      .auro-dx-empty{padding:20px;text-align:center;color:#76888c;border:1px dashed #ccd9dc;border-radius:12px}
      .auro-dx-item{padding:11px;border:1px solid #dfe9eb;border-radius:12px;margin-bottom:8px}
      .auro-dx-item:last-child{margin-bottom:0}
      .auro-dx-item-main{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:flex-start}
      .auro-dx-item-copy{min-width:0}
      .auro-dx-protocol-btn{width:36px;height:36px;border:1px solid #efd4e4;border-radius:11px;background:#fff7fb;color:#8b1e5a;display:grid;place-items:center;cursor:pointer;transition:.18s ease;font-size:16px}
      .auro-dx-protocol-btn:hover{background:#8b1e5a;color:#fff;transform:translateY(-1px);box-shadow:0 7px 16px rgba(139,30,90,.18)}
      .auro-dx-protocol-btn:focus-visible{outline:3px solid rgba(194,59,131,.24);outline-offset:2px}
      .auro-dx-protocolo-readonly{display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:12px;border:1px solid #dbe4ec;border-radius:12px;background:#f8fafc;color:#475569;font-size:12px;font-weight:800}
      .auro-dx-protocolos-fallback-visible{display:block;margin:14px 0;padding:14px;border:1px solid #ead7e2;border-radius:18px;background:#fff}
      .auro-dx-code{font-weight:900;color:#1d6670;min-width:54px}
      .auro-dx-name{font-weight:700;line-height:1.35}
      .auro-dx-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
      .auro-dx-tag{font-size:10px;padding:4px 7px;border-radius:999px;background:#edf4f5;color:#52676b}
      .auro-dx-tag.principal{background:#dff3ea;color:#256146}
      .auro-dx-textarea{width:100%;min-height:112px;resize:vertical;border:1px solid #cedbdd;border-radius:12px;padding:11px;font:inherit;line-height:1.45}
      .auro-dx-section{margin-top:12px}
      .auro-dx-section:first-child{margin-top:0}
      .auro-dx-label{display:block;font-weight:800;font-size:12px;margin-bottom:6px;color:#42575b}
      .auro-dx-protocolo{border:1px solid #dce7e9;border-radius:13px;padding:12px;margin-bottom:10px}
      .auro-dx-protocolo.selected{border-color:#1d6670;box-shadow:0 0 0 2px rgba(29,102,112,.09)}
      .auro-dx-protocolo h5{margin:0 0 5px;font-size:14px}
      .auro-dx-protocolo small{color:#718287}
      .auro-dx-list{margin:7px 0 0;padding-left:18px}
      .auro-dx-warning{padding:10px 12px;border-radius:12px;background:#fff8e7;color:#77591c;font-size:12px}
      .auro-dx-error{padding:10px 12px;border-radius:12px;background:#fff0f0;color:#8a3030;font-size:12px}
      .auro-dx-ok{padding:10px 12px;border-radius:12px;background:#eaf8f0;color:#286043;font-size:12px}
      .auro-dx-source{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .auro-dx-source-item{padding:11px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px}
      .auro-dx-source-item.available{border-color:#bbf7d0;background:#f0fdf4}
      .auro-dx-source-item.missing{border-color:#e2e8f0;background:#f8fafc}
      .auro-dx-source-state{display:flex;align-items:center;gap:6px;margin-top:4px;font-weight:800}
      .auro-dx-source-item.available .auro-dx-source-state{color:#166534}
      .auro-dx-source-item.missing .auro-dx-source-state{color:#64748b}
      .auro-dx-card-help{font-size:12px;color:#64748b;font-weight:500;margin-top:3px}
      .auro-dx-field-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px}
      .auro-dx-field-actions{display:flex;gap:6px;flex-wrap:wrap}
      .auro-dx-mini-btn{border:1px solid #dbe5e7;background:#fff;color:#42575b;border-radius:9px;padding:5px 8px;font-size:11px;font-weight:800;cursor:pointer}
      .auro-dx-mini-btn:hover{background:#f2f7f8}
      .auro-dx-guide{display:none;padding:10px 12px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:12px;line-height:1.4}
      .auro-dx-ia-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 15px;border:1px solid #e7d6e1;border-radius:16px;background:linear-gradient(135deg,#fff,#fff8fc);box-shadow:0 8px 22px rgba(108,29,82,.06)}
      .auro-dx-ia-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#6c1d52,#b76a93);color:#fff;font-size:19px}
      .auro-dx-ia-title{font-size:14px;font-weight:900;color:#491137}
      .auro-dx-ia-copy{margin-top:3px;color:#6f6874;font-size:12px;line-height:1.35}
      .auro-dx-ia-state{display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;font-weight:800;color:#64748b}
      .auro-dx-ia-state.ready{color:#198754}
      .auro-dx-ia-btn{border:0;border-radius:12px;padding:10px 13px;background:linear-gradient(135deg,#6c1d52,#491137);color:#fff;font-size:12px;font-weight:850;cursor:pointer;white-space:nowrap}
      .auro-dx-ia-btn:disabled{opacity:.5;cursor:not-allowed}
      #auroDiagnosticosApp.guide-on .auro-dx-guide{display:block}
      .auro-dx-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.58);display:none;align-items:center;justify-content:center;padding:18px;z-index:99999}
      .auro-dx-modal-backdrop.show{display:flex}
      .auro-dx-modal{width:min(980px,100%);max-height:90vh;background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden}
      .auro-dx-modal-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid #e5e7eb}
      .auro-dx-modal-head h4{margin:0;font-size:18px}
      .auro-dx-modal-body{padding:18px;overflow:auto}
      .auro-dx-modal-body textarea{width:100%;min-height:52vh;resize:vertical;border:1px solid #cbd5e1;border-radius:14px;padding:14px;font:inherit;line-height:1.5}
      .auro-dx-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:13px 18px;border-top:1px solid #e5e7eb}
      @media(max-width:900px){.auro-dx-grid{grid-template-columns:1fr}.auro-dx-source{grid-template-columns:1fr}.auro-dx-head{flex-direction:column}.auro-dx-field-head{align-items:flex-start;flex-direction:column}}

      @media(max-width:600px){
        html,body{
          max-width:100%;
          overflow-x:hidden;
        }
        #hc_diagnostico,
        #auroDiagnosticosMount,
        #auroDiagnosticosApp,
        .auro-dx-shell{
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          overflow-x:hidden!important;
        }
        .auro-dx-shell{gap:10px}
        .auro-dx-contexto-superior{margin-bottom:10px;border-radius:15px}
        .auro-dx-contexto-main{grid-template-columns:auto minmax(0,1fr);padding:12px;gap:10px}
        .auro-dx-contexto-icon{width:40px;height:40px;border-radius:12px}
        .auro-dx-contexto-state{grid-column:1/-1;width:100%;justify-content:center;white-space:normal;text-align:center}
        .auro-dx-contexto-title{font-size:17px}
        .auro-dx-contexto-stats{grid-template-columns:1fr}
        .auro-dx-contexto-stat{border-right:0;border-bottom:1px solid #f0e1e9;padding:9px 12px}
        .auro-dx-contexto-stat:last-child{border-bottom:0}
        .auro-dx-head{
          display:block;
          padding:12px;
          border-radius:14px;
        }
        .auro-dx-head h3{
          font-size:18px;
          line-height:1.25;
        }
        .auro-dx-head p{
          font-size:12px;
          line-height:1.4;
          overflow-wrap:anywhere;
        }
        .auro-dx-status{
          display:block;
          width:100%;
          max-width:100%;
          margin-top:10px;
          white-space:normal;
          overflow-wrap:anywhere;
          line-height:1.35;
          text-align:left;
          border-radius:12px;
        }
        .auro-dx-toolbar{
          display:grid;
          grid-template-columns:1fr;
          gap:8px;
          width:100%;
        }
        .auro-dx-btn{
          width:100%;
          min-width:0;
          min-height:46px;
          padding:10px 12px;
          font-size:15px;
          white-space:normal;
          line-height:1.25;
          text-align:center;
        }
        .auro-dx-grid{
          grid-template-columns:1fr!important;
          gap:10px;
        }
        .auro-dx-card{
          width:100%;
          min-width:0;
          border-radius:14px;
        }
        .auro-dx-card-head{
          padding:11px 12px;
          font-size:14px;
          line-height:1.35;
          overflow-wrap:anywhere;
        }
        .auro-dx-card-help{
          font-size:11px;
          line-height:1.35;
        }
        .auro-dx-card-body{
          padding:11px;
          min-width:0;
        }
        .auro-dx-item{
          padding:10px;
          min-width:0;
        }
        .auro-dx-item-main{
          display:grid;
          grid-template-columns:auto minmax(0,1fr) auto;
          gap:8px;
        }
        .auro-dx-code{min-width:0}
        .auro-dx-name{
          min-width:0;
          overflow-wrap:anywhere;
        }
        .auro-dx-field-head{
          display:block;
          margin-bottom:8px;
        }
        .auro-dx-field-actions{
          display:grid;
          grid-template-columns:1fr 1fr;
          width:100%;
          margin-top:7px;
        }
        .auro-dx-mini-btn{
          width:100%;
          min-height:40px;
          font-size:12px;
        }
        .auro-dx-textarea,
        .auro-dx-modal-body textarea{
          width:100%;
          min-width:0;
          max-width:100%;
          font-size:16px!important;
          line-height:1.45;
        }
        .auro-dx-textarea{min-height:140px}
        .auro-dx-source{
          grid-template-columns:1fr!important;
          gap:7px;
        }
        .auro-dx-source-item{padding:10px}
        .auro-dx-source-state{
          align-items:flex-start;
          line-height:1.35;
        }
        .auro-dx-protocolo{
          padding:10px;
          overflow-wrap:anywhere;
        }
        .auro-dx-protocolo > div:first-child{
          display:block!important;
        }
        .auro-dx-protocolo [data-seleccionar-protocolo]{
          width:100%;
          margin-top:9px;
        }
        .auro-dx-list{
          padding-left:20px;
          overflow-wrap:anywhere;
        }
        .auro-dx-warning,
        .auro-dx-guide,
        .auro-dx-error,
        .auro-dx-ok{
          font-size:12px;
          line-height:1.45;
          overflow-wrap:anywhere;
        }
        .auro-dx-modal-backdrop{
          padding:0;
          align-items:flex-end;
        }
        .auro-dx-modal{
          width:100%;
          max-width:100%;
          max-height:94dvh;
          border-radius:18px 18px 0 0;
        }
        .auro-dx-modal-head{
          padding:12px;
          align-items:flex-start;
        }
        .auro-dx-modal-head h4{
          font-size:17px;
          line-height:1.3;
        }
        .auro-dx-modal-body{padding:12px}
        .auro-dx-modal-body textarea{min-height:56dvh}
        .auro-dx-modal-foot{
          display:grid;
          grid-template-columns:1fr;
          padding:10px 12px calc(10px + env(safe-area-inset-bottom));
        }
        .auro-dx-modal-foot .auro-dx-btn{width:100%}
        .auro-dx-ia-card{grid-template-columns:auto minmax(0,1fr);padding:12px}
        .auro-dx-ia-btn{grid-column:1/-1;width:100%;min-height:44px}
      }
    `;
    document.head.appendChild(style);
  }

  function appHTML(){
    return `
      <div class="auro-dx-shell">
        <div class="auro-dx-head">
          <div>
            <h3><i class="bi bi-clipboard2-pulse"></i> Integración diagnóstica y clínica</h3>
            <p>Integra los diagnósticos de esta atención con la información clínica disponible para apoyar la revisión médica y la elaboración del Plan.</p>
          </div>
          <div class="auro-dx-status" id="auroDxStatus">Sin atención activa</div>
        </div>

        <div class="auro-dx-toolbar">
          <button type="button" class="auro-dx-btn primary" id="auroDxActualizar" title="Vuelve a leer los datos guardados de esta atención">
            <i class="bi bi-arrow-repeat"></i> Sincronizar datos
          </button>
          <button type="button" class="auro-dx-btn" id="auroDxGenerar" title="Construye el resumen, análisis y conducta con los datos disponibles">
            <i class="bi bi-stars"></i> Generar resumen clínico
          </button>
          <button type="button" class="auro-dx-btn" id="auroDxEditar" disabled title="Habilita la revisión y edición médica de la integración">
            <i class="bi bi-pencil-square"></i> Editar integración
          </button>
          <button type="button" class="auro-dx-btn" id="auroDxGuardar" disabled title="Confirma los cambios únicamente en el estado temporal de esta atención">
            <i class="bi bi-save2"></i> Guardar temporalmente
          </button>
          <button type="button" class="auro-dx-btn success" id="auroDxAplicarPlan" disabled title="Transfiere el protocolo seleccionado al módulo Plan">
            <i class="bi bi-check2-circle"></i> Aplicar protocolo al Plan
          </button>
          <button type="button" class="auro-dx-btn" id="auroDxGuia" aria-pressed="false">
            <i class="bi bi-question-circle"></i> Activar guía
          </button>
        </div>

        <div class="auro-dx-guide">
          <b>Flujo recomendado:</b> sincronice los datos y genere el resumen clínico. Puede hacerlo antes de registrar diagnósticos; cuando existan, actualice la integración para incorporar la correlación diagnóstica y los protocolos.
        </div>

        <div id="auroDxMensaje"></div>

        <div class="auro-dx-grid">
          <div class="auro-dx-card">
            <div class="auro-dx-card-head">
              Diagnósticos de la atención
              <div class="auro-dx-card-help">Resumen clínico de los diagnósticos registrados, con acceso al protocolo completo disponible para cada CIE-10.</div>
            </div>
            <div class="auro-dx-card-body" id="auroDxLista"></div>
          </div>

          <div class="auro-dx-card">
            <div class="auro-dx-card-head">
              Integración clínica
              <div class="auro-dx-card-help">La integración se genera en modo protegido. Presione “Editar integración” para realizar la revisión médica antes de utilizarla en el Plan.</div>
              <div class="auro-dx-card-help" id="auroDxEdicionEstado">Sin integración generada.</div>
            </div>
            <div class="auro-dx-card-body">
              <div class="auro-dx-section">
                <div class="auro-dx-field-head">
                  <label class="auro-dx-label" for="auroDxResumen">Resumen clínico integrado</label>
                  <div class="auro-dx-field-actions">
                    <button type="button" class="auro-dx-mini-btn" data-copy-field="auroDxResumen"><i class="bi bi-clipboard"></i> Copiar</button>
                    <button type="button" class="auro-dx-mini-btn" data-expand-field="auroDxResumen" data-title="Resumen clínico integrado"><i class="bi bi-arrows-fullscreen"></i> Ampliar</button>
                  </div>
                </div>
                <div class="auro-dx-guide">Describe de forma objetiva los datos relevantes de la consulta: anamnesis, antecedentes, revisión por sistemas, hallazgos y diagnósticos cuando estén disponibles.</div>
                <textarea id="auroDxResumen" class="auro-dx-textarea" readonly placeholder="Se generará a partir de los datos clínicos disponibles de esta atención."></textarea>
              </div>

              <div class="auro-dx-section">
                <div class="auro-dx-field-head">
                  <label class="auro-dx-label" for="auroDxAnalisis">Análisis / impresión clínica</label>
                  <div class="auro-dx-field-actions">
                    <button type="button" class="auro-dx-mini-btn" data-copy-field="auroDxAnalisis"><i class="bi bi-clipboard"></i> Copiar</button>
                    <button type="button" class="auro-dx-mini-btn" data-expand-field="auroDxAnalisis" data-title="Análisis / impresión clínica"><i class="bi bi-arrows-fullscreen"></i> Ampliar</button>
                  </div>
                </div>
                <div class="auro-dx-guide">Expresa un razonamiento clínico preliminar antes del diagnóstico y, posteriormente, la correlación diagnóstica que debe revisar el profesional.</div>
                <textarea id="auroDxAnalisis" class="auro-dx-textarea" readonly placeholder="Interpretación clínica editable por el profesional."></textarea>
              </div>

              <div class="auro-dx-section">
                <div class="auro-dx-field-head">
                  <label class="auro-dx-label" for="auroDxConducta">Conducta sugerida</label>
                  <div class="auro-dx-field-actions">
                    <button type="button" class="auro-dx-mini-btn" data-copy-field="auroDxConducta"><i class="bi bi-clipboard"></i> Copiar</button>
                    <button type="button" class="auro-dx-mini-btn" data-expand-field="auroDxConducta" data-title="Conducta sugerida"><i class="bi bi-arrows-fullscreen"></i> Ampliar</button>
                  </div>
                </div>
                <div class="auro-dx-guide">Resume las acciones clínicas sugeridas. Cuando exista un diagnóstico y protocolo, incorpora sus recomendaciones para revisión antes de enviarlas al Plan.</div>
                <textarea id="auroDxConducta" class="auro-dx-textarea" readonly placeholder="Conducta editable antes de transferir al Plan."></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="auro-dx-ia-card" id="auroDxApoyoIACard">
          <div class="auro-dx-ia-icon"><i class="bi bi-brain"></i></div>
          <div>
            <div class="auro-dx-ia-title">Apoyo Cognitivo con IA</div>
            <div class="auro-dx-ia-copy">Abre el módulo auxiliar con el contexto clínico integrado de esta atención.</div>
            <div class="auro-dx-ia-state" id="auroDxApoyoIAEstado">
              <i class="bi bi-circle-fill"></i>
              <span>Genere o sincronice la integración clínica.</span>
            </div>
          </div>
          <button type="button" class="auro-dx-ia-btn" id="auroDxAbrirApoyoIA" disabled>
            <i class="bi bi-box-arrow-up-right"></i> Abrir Apoyo Cognitivo
          </button>
        </div>

        <!-- AUROSANAX: contenedor técnico oculto.
             Conserva el motor de protocolos sin duplicar su visualización,
             porque el protocolo clínico ya se presenta en el módulo CIE-10 inteligente. -->
        <div id="auroDxProtocolos" hidden aria-hidden="true"></div>

        <div class="auro-dx-card">
          <div class="auro-dx-card-head">
            Información utilizada para el análisis clínico
            <div class="auro-dx-card-help">Indica qué módulos tienen datos vinculados a esta atención. “No registrado” no significa error.</div>
          </div>
          <div class="auro-dx-card-body">
            <div class="auro-dx-source" id="auroDxFuentes"></div>
          </div>
        </div>

        <div class="auro-dx-warning">
          Las sugerencias no sustituyen el criterio médico. Revise indicaciones, contraindicaciones, alergias,
          embarazo, lactancia, función renal/hepática, interacciones y contexto clínico antes de aplicar al Plan.
        </div>

        <div class="auro-dx-modal-backdrop" id="auroDxModal" aria-hidden="true">
          <div class="auro-dx-modal" role="dialog" aria-modal="true" aria-labelledby="auroDxModalTitle">
            <div class="auro-dx-modal-head">
              <h4 id="auroDxModalTitle">Texto clínico</h4>
              <button type="button" class="auro-dx-mini-btn" id="auroDxModalCerrar"><i class="bi bi-x-lg"></i> Cerrar</button>
            </div>
            <div class="auro-dx-modal-body">
              <textarea id="auroDxModalTexto"></textarea>
            </div>
            <div class="auro-dx-modal-foot">
              <button type="button" class="auro-dx-btn" id="auroDxModalCopiar"><i class="bi bi-clipboard"></i> Copiar</button>
              <button type="button" class="auro-dx-btn primary" id="auroDxModalAplicar"><i class="bi bi-check2"></i> Aplicar cambios</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function asegurarApp(){
    instalarEstilos();

    const panel = document.getElementById('hc_diagnostico') || asegurarPanel();
    if(!panel){
      console.error(MODULO + ': no existe #hc_diagnostico.');
      return null;
    }

    /*
      MONTAJE DETERMINISTA:
      Diagnósticos se pinta exclusivamente dentro de #auroDiagnosticosMount.
      El punto de montaje se crea si el index todavía no lo contiene.
    */
    let mount = document.getElementById('auroDiagnosticosMount');
    if(!mount){
      mount = document.createElement('div');
      mount.id = 'auroDiagnosticosMount';
      panel.appendChild(mount);
    }

    mount.style.display = 'block';
    mount.style.width = '100%';
    mount.style.minHeight = '220px';

    asegurarContextoSuperior();
    optimizarTitulosResumenExistente();

    let app = document.getElementById('auroDiagnosticosApp');
    if(!app){
      app = document.createElement('div');
      app.id = 'auroDiagnosticosApp';
    }

    if(app.parentElement !== mount){
      mount.replaceChildren(app);
    }

    /*
      Siempre reconstruye la estructura si está vacía o incompleta.
      Esto corrige el caso observado: pestaña activa pero panel en blanco.
    */
    if(
      !app.querySelector('#auroDxStatus') ||
      !app.querySelector('#auroDxLista') ||
      !app.querySelector('#auroDxResumen')
    ){
      app.innerHTML = appHTML();
      delete app.dataset.eventosInstalados;
    }

    app.style.display = 'block';
    app.style.visibility = 'visible';
    app.style.opacity = '1';
    app.style.width = '100%';

    if(app.dataset.eventosInstalados !== '1'){
      app.querySelector('#auroDxActualizar')?.addEventListener('click', () => cargarAtencionActual(true));
      app.querySelector('#auroDxGenerar')?.addEventListener('click', generarIntegracion);
      app.querySelector('#auroDxEditar')?.addEventListener('click', alternarEdicionClinica);
      app.querySelector('#auroDxGuardar')?.addEventListener('click', guardarIntegracionTemporal);
      app.querySelector('#auroDxAplicarPlan')?.addEventListener('click', aplicarAlPlan);
      app.querySelector('#auroDxGuia')?.addEventListener('click', alternarGuia);
      app.querySelector('#auroDxAbrirApoyoIA')?.addEventListener('click', abrirApoyoIA);

      app.querySelectorAll('[data-copy-field]').forEach(btn => {
        btn.addEventListener('click', () => copiarCampo(btn.dataset.copyField));
      });

      app.querySelectorAll('[data-expand-field]').forEach(btn => {
        btn.addEventListener('click', () => abrirCampoAmpliado(btn.dataset.expandField, btn.dataset.title));
      });

      app.querySelector('#auroDxModalCerrar')?.addEventListener('click', cerrarCampoAmpliado);
      app.querySelector('#auroDxModalAplicar')?.addEventListener('click', aplicarCampoAmpliado);
      app.querySelector('#auroDxModalCopiar')?.addEventListener('click', () => copiarCampo('auroDxModalTexto'));
      app.querySelector('#auroDxModal')?.addEventListener('click', e => {
        if(e.target?.id === 'auroDxModal') cerrarCampoAmpliado();
      });

      ['auroDxResumen','auroDxAnalisis','auroDxConducta'].forEach(id => {
        app.querySelector('#' + id)?.addEventListener('input', () => {
          state.cambiosPendientes = true;
          state.guardadoTemporalConfirmado = false;
          state.ultimaEdicionLocal = new Date().toISOString();
          guardarEstadoTemporal();
          actualizarEstadoEdicion();
        });
      });

      app.dataset.eventosInstalados = '1';
    }

    return app;
  }

  function mensaje(tipo, contenido){
    const box = document.getElementById('auroDxMensaje');
    if(!box) return;
    if(!contenido){
      box.innerHTML = '';
      return;
    }
    const clase = tipo === 'error' ? 'auro-dx-error' : tipo === 'ok' ? 'auro-dx-ok' : 'auro-dx-warning';
    box.innerHTML = `<div class="${clase}">${escapeHtml(contenido)}</div>`;
  }

  function status(contenido){
    const el = document.getElementById('auroDxStatus');
    if(el) el.textContent = contenido;
  }

  function actualizarBotonGeneracion(){
    const btn = document.getElementById('auroDxGenerar');
    if(!btn) return;
    const conDiagnosticos = state.diagnosticos.length > 0;
    btn.innerHTML = conDiagnosticos
      ? '<i class="bi bi-stars"></i> Actualizar integración clínica'
      : '<i class="bi bi-stars"></i> Generar resumen clínico';
    btn.title = conDiagnosticos
      ? 'Regenera el resumen, el análisis y la conducta incorporando los diagnósticos registrados'
      : 'Genera el resumen y el razonamiento clínico preliminar con la información disponible';
  }

  function renderDiagnosticos(){
    const box = document.getElementById('auroDxLista');
    if(!box) return;

    actualizarBotonGeneracion();
    renderContextoSuperior();
    optimizarTitulosResumenExistente();

    if(!state.diagnosticos.length){
      box.innerHTML = '<div class="auro-dx-empty"><b>Aún no se han registrado diagnósticos para esta atención.</b><br><span style="display:block;margin-top:6px">Puede generar primero el resumen clínico con la anamnesis y la información disponible.</span></div>';
      return;
    }

    const ordenados = [...state.diagnosticos].sort((a,b) => Number(b.principal) - Number(a.principal));
    box.innerHTML = ordenados.map((d, index) => {
      const codigo = texto(d.codigo_cie10).replace(/\./g,'').toUpperCase();
      const tieneProtocolo = state.protocolos.some(p => texto(p.codigo_cie10).replace(/\./g,'').toUpperCase() === codigo);
      return `
        <div class="auro-dx-item">
          <div class="auro-dx-item-main">
            <div class="auro-dx-code">${escapeHtml(d.codigo_cie10 || 'S/C')}</div>
            <div class="auro-dx-item-copy">
              <div class="auro-dx-name">${escapeHtml(d.descripcion || 'Sin descripción')}</div>
              <div class="auro-dx-tags">
                ${d.principal ? '<span class="auro-dx-tag principal">Diagnóstico principal</span>' : '<span class="auro-dx-tag">Diagnóstico asociado</span>'}
                <span class="auro-dx-tag">${escapeHtml(d.tipo_diagnostico || 'Presuntivo')}</span>
                <span class="auro-dx-tag">${tieneProtocolo ? 'Protocolo disponible' : 'Consultar protocolo'}</span>
              </div>
            </div>
            <button type="button" class="auro-dx-protocol-btn" data-ver-protocolo-dx="${index}" title="Ver protocolo clínico completo" aria-label="Ver protocolo clínico completo de ${escapeHtml(d.codigo_cie10 || d.descripcion)}">
              <i class="bi bi-eye"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('[data-ver-protocolo-dx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = ordenados[Number(btn.dataset.verProtocoloDx)];
        abrirProtocoloMaestro(d);
      });
    });
  }

  function protocoloLista(valor){
    const parsed = parseJsonSeguro(valor, []);
    if(Array.isArray(parsed)) return parsed;
    if(parsed && typeof parsed === 'object'){
      return Object.keys(parsed).map(k => {
        const v = parsed[k];
        return typeof v === 'string' ? v : k + ': ' + JSON.stringify(v);
      });
    }
    const raw = texto(valor);
    if(!raw) return [];
    return raw.split(/\r?\n|\s*\|\|\s*|;/).map(texto).filter(Boolean);
  }

  function normalizarProtocolo(raw, diagnostico){
    raw = raw || {};
    return {
      id_protocolo: texto(raw.id_protocolo || raw.id),
      codigo_cie10: texto(raw.codigo_cie10 || raw.cie10 || diagnostico?.codigo_cie10).replace(/\./g,'').toUpperCase(),
      diagnostico: texto(raw.diagnostico || raw.descripcion_diagnostico || diagnostico?.descripcion),
      nombre: texto(raw.nombre_protocolo || raw.titulo || raw.nombre || 'Protocolo clínico'),
      especialidad: texto(raw.especialidad || 'General'),
      version: texto(raw.version_protocolo || raw.version),
      medicamentos: protocoloLista(raw.medicamentos_json || raw.medicamentos),
      ordenes: protocoloLista(raw.ordenes_json || raw.ordenes || raw.laboratorios_json),
      imagenes: protocoloLista(raw.imagenes_json || raw.imagenes),
      indicaciones: protocoloLista(raw.indicaciones_json || raw.indicaciones),
      controles: protocoloLista(raw.controles_json || raw.controles || raw.seguimiento),
      procedimientos: protocoloLista(raw.procedimientos_json || raw.procedimientos),
      alertas: protocoloLista(raw.alertas_json || raw.alertas),
      conducta: texto(raw.conducta || raw.conducta_sugerida),
      fuente: texto(raw.fuente || raw.referencia),
      raw: raw
    };
  }

  function renderProtocolos(){
    const box = document.getElementById('auroDxProtocolos');
    const btn = document.getElementById('auroDxAplicarPlan');
    if(!box) return;

    if(!state.protocolos.length){
      box.innerHTML = '<div class="auro-dx-empty">No se encontraron protocolos activos para los diagnósticos de esta atención.</div>';
      if(btn) btn.disabled = true;
      return;
    }

    box.innerHTML = state.protocolos.map((p, index) => {
      const seleccionado = state.protocoloSeleccionado === index;
      const secciones = [
        ['Medicamentos', p.medicamentos],
        ['Órdenes', p.ordenes],
        ['Imágenes', p.imagenes],
        ['Procedimientos', p.procedimientos],
        ['Indicaciones', p.indicaciones],
        ['Controles', p.controles],
        ['Alertas', p.alertas]
      ].filter(x => x[1] && x[1].length);

      return `
        <div class="auro-dx-protocolo ${seleccionado ? 'selected' : ''}" data-protocolo-index="${index}">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <h5>${escapeHtml(p.nombre)}</h5>
              <small>${escapeHtml(p.codigo_cie10)} · ${escapeHtml(p.especialidad)} ${p.version ? '· v' + escapeHtml(p.version) : ''}</small>
            </div>
            <button type="button" class="auro-dx-btn ${seleccionado ? 'primary' : ''}" data-seleccionar-protocolo="${index}">
              ${seleccionado ? 'Seleccionado' : 'Seleccionar'}
            </button>
          </div>
          ${p.conducta ? `<p style="margin:9px 0 0">${escapeHtml(p.conducta)}</p>` : ''}
          ${secciones.map(([titulo, lista]) => `
            <div style="margin-top:9px">
              <b style="font-size:12px">${escapeHtml(titulo)}</b>
              <ul class="auro-dx-list">${lista.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    box.querySelectorAll('[data-seleccionar-protocolo]').forEach(btnSel => {
      btnSel.addEventListener('click', () => {
        state.protocoloSeleccionado = Number(btnSel.dataset.seleccionarProtocolo);
        const p = state.protocolos[state.protocoloSeleccionado];
        if(p && p.conducta){
          const campo = document.getElementById('auroDxConducta');
          if(campo && !texto(campo.value)) campo.value = p.conducta;
        }
        renderProtocolos();
        guardarEstadoTemporal();
      });
    });

    if(btn){
      const permitido = puedeAplicarAlPlan();
      btn.disabled = state.protocoloSeleccionado === null || !permitido;
      btn.title = permitido
        ? 'Transfiere el protocolo seleccionado al módulo Plan'
        : 'Disponible únicamente en la última atención activa y editable';
    }
    renderContextoSuperior();
  }

  function fuenteTieneDatos(obj){
    if(!obj) return false;
    if(Array.isArray(obj)) return obj.length > 0;
    if(typeof obj !== 'object') return !!texto(obj);
    return Object.keys(obj).some(k => {
      const v = obj[k];
      return Array.isArray(v) ? v.length : (typeof v === 'object' ? fuenteTieneDatos(v) : !!texto(v));
    });
  }

  /*
    AUROSANAX - FUENTES CLÍNICAS SEPARADAS
    Cambio exclusivo de la tarjeta visual del módulo Diagnóstico.
  */
  function datosGeneralesDisponibles(historia){
    const h = historia || {};
    const paciente = atencionActiva() || {};

    const claves = [
      'id_historia','id_paciente','numero_historia','historia_clinica',
      'nombre_paciente','paciente_nombre','nombre_completo','nombre','nombres',
      'cedula','identificacion','documento','numero_documento',
      'fecha_nacimiento','nacimiento','edad','sexo','genero',
      'telefono','whatsapp','correo','email','direccion','ciudad'
    ];

    return claves.some(clave =>
      !!texto(h?.[clave]) || !!texto(paciente?.[clave])
    );
  }

  function antecedentesDisponibles(historia){
    const h = historia || {};

    const claves = [
      'antecedentes_personales','antecedentes_patologicos',
      'antecedentes_quirurgicos','antecedentes_familiares',
      'antecedentes_gineco_obstetricos','antecedentes_ginecologicos',
      'antecedentes_obstetricos','alergias','medicacion_actual',
      'medicamentos_actuales','habitos','habitos_toxicos',
      'vacunas','vacunacion','inmunizaciones','covid','transfusiones'
    ];

    return claves.some(clave => {
      const valor = h?.[clave];
      if(valor === null || valor === undefined) return false;

      if(typeof valor === 'string'){
        const limpio = quitarPrefijoSerializado(valor);
        if(!limpio || limpio === '{}' || limpio === '[]') return false;

        const parseado = parseJsonSeguro(limpio, null);
        if(parseado && typeof parseado === 'object'){
          return fuenteTieneDatos(parseado);
        }

        return !!texto(limpio);
      }

      return fuenteTieneDatos(valor);
    });
  }

  function renderFuentes(){
    const box = document.getElementById('auroDxFuentes');
    if(!box) return;

    const fuentesBase = [
      ['Atención actual', atencionActiva(), null],
      ['Datos generales', state.historia, datosGeneralesDisponibles(state.historia)],
      ['Antecedentes', state.historia, antecedentesDisponibles(state.historia)],
      ['Anamnesis', state.anamnesis, null],
      ['Revisión por sistemas', state.detalleExamen?.sistemas, null],
      ['Examen físico general', state.detalleExamen?.examen, null],
      ['Examen regional', state.detalleExamen?.regionales, null]
    ];

    const fuentesEspecialidad = [
      ['Ginecología', state.especialidades.ginecologia, null],
      ['Obstetricia', state.especialidades.obstetricia, null],
      ['Estética', state.especialidades.estetica, null]
    ].filter(([, valor]) => fuenteTieneDatos(valor));

    const fuentes = [...fuentesBase, ...fuentesEspecialidad];

    box.innerHTML = fuentes.map(([nombre, valor, disponibleForzado]) => {
      const disponible = typeof disponibleForzado === 'boolean'
        ? disponibleForzado
        : fuenteTieneDatos(valor);

      return `
        <div class="auro-dx-source-item ${disponible ? 'available' : 'missing'}">
          <b>${escapeHtml(nombre)}</b>
          <div class="auro-dx-source-state">
            <i class="bi ${disponible ? 'bi-check-circle-fill' : 'bi-dash-circle'}"></i>
            ${disponible ? 'Disponible para el análisis' : 'No registrado en esta atención'}
          </div>
        </div>
      `;
    }).join('');
  }

  const CLAVES_TECNICAS = new Set([
    'id','id_atencion','id_paciente','id_historia','id_medico','id_cita',
    'id_ginecologia','id_obstetricia','id_estetica','id_examen',
    'estado','estado_registro','creado_en','actualizado_en','fecha_creacion',
    'fecha_actualizacion','creado_por','actualizado_por','usuario','version'
  ]);

  function etiquetaClinica(clave){
    return texto(clave)
      .replace(/_/g,' ')
      .replace(/\b\w/g, letra => letra.toUpperCase());
  }

  function quitarPrefijoSerializado(valor){
    return texto(valor)
      .replace(/^\s*AUROSANAX_[A-Z0-9_]+_V\d+::\s*/i,'')
      .trim();
  }

  function valorClinicoPlano(valor, profundidad){
    profundidad = profundidad || 0;
    if(profundidad > 6 || valor === null || valor === undefined) return '';

    if(typeof valor === 'string'){
      const limpio = quitarPrefijoSerializado(valor);
      if(!limpio || limpio === '{}' || limpio === '[]' || /^(null|undefined|nan)$/i.test(limpio)) return '';

      /*
        CORRECCIÓN 1.4.2:
        Algunos módulos guardan objetos serializados con el prefijo
        AUROSANAX_...:: antes del JSON. En la versión anterior se intentaba
        interpretar el JSON antes de retirar ese prefijo, por lo que el
        contenido completo terminaba visible en el resumen.
      */
      const parseado = parseJsonSeguro(limpio, null);
      if(parseado && typeof parseado === 'object'){
        return valorClinicoPlano(parseado, profundidad + 1);
      }

      if(pareceFechaTecnica(limpio)) return '';
      return limpio;
    }

    if(typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
    if(typeof valor === 'boolean') return valor ? 'Sí' : 'No';

    if(Array.isArray(valor)){
      const items = valor
        .map(item => valorClinicoPlano(item, profundidad + 1))
        .filter(Boolean);

      return [...new Set(items.map(texto))].join('; ');
    }

    if(typeof valor === 'object'){
      const partes = [];
      const vistos = new Set();

      Object.entries(valor).forEach(([clave, dato]) => {
        if(claveTecnicaOAdministrativa(clave)) return;

        const plano = valorClinicoPlano(dato, profundidad + 1);
        if(!plano) return;

        const parte = etiquetaClinica(clave) + ': ' + plano;
        const firma = normalizar(parte);
        if(vistos.has(firma)) return;

        vistos.add(firma);
        partes.push(parte);
      });

      return partes.join('; ');
    }

    return '';
  }

  function resumenObjeto(obj, exclusiones){
    if(!obj || typeof obj !== 'object') return '';

    const omitir = new Set([
      ...Array.from(CLAVES_TECNICAS),
      ...(exclusiones || []).map(normalizar)
    ]);

    const partes = [];
    Object.entries(obj).forEach(([clave, valor]) => {
      if(omitir.has(normalizar(clave))) return;
      const plano = valorClinicoPlano(valor, 0);
      if(!plano) return;
      partes.push(etiquetaClinica(clave) + ': ' + plano);
    });

    return partes.join(' | ');
  }

  async function copiarCampo(id){
    const campo = document.getElementById(id);
    const contenido = texto(campo?.value);
    if(!contenido){
      mensaje('aviso','No hay contenido para copiar.');
      return;
    }

    try{
      await navigator.clipboard.writeText(contenido);
      mensaje('ok','Texto copiado al portapapeles.');
    }catch(error){
      campo.focus();
      campo.select();
      document.execCommand('copy');
      mensaje('ok','Texto copiado al portapapeles.');
    }
  }

  let campoModalActivo = '';

  function abrirCampoAmpliado(id, titulo){
    const campo = document.getElementById(id);
    const modal = document.getElementById('auroDxModal');
    const modalTexto = document.getElementById('auroDxModalTexto');
    if(!campo || !modal || !modalTexto) return;

    campoModalActivo = id;
    document.getElementById('auroDxModalTitle').textContent = titulo || 'Texto clínico';
    modalTexto.value = campo.value || '';
    modalTexto.readOnly = !state.modoEdicion;
    const btnAplicar = document.getElementById('auroDxModalAplicar');
    if(btnAplicar) btnAplicar.disabled = !state.modoEdicion;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    setTimeout(() => modalTexto.focus(), 30);
  }

  function cerrarCampoAmpliado(){
    const modal = document.getElementById('auroDxModal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    campoModalActivo = '';
  }

  function aplicarCampoAmpliado(){
    if(!state.modoEdicion){
      mensaje('aviso','Active “Editar integración” antes de modificar el texto.');
      return;
    }
    if(!campoModalActivo) return cerrarCampoAmpliado();
    const origen = document.getElementById(campoModalActivo);
    const modalTexto = document.getElementById('auroDxModalTexto');
    if(origen && modalTexto){
      origen.value = modalTexto.value;
      origen.dispatchEvent(new Event('input',{bubbles:true}));
    }
    cerrarCampoAmpliado();
    mensaje('ok','Cambios aplicados al texto clínico.');
  }

  function alternarGuia(){
    const app = document.getElementById('auroDiagnosticosApp');
    const btn = document.getElementById('auroDxGuia');
    if(!app || !btn) return;
    const activa = !app.classList.contains('guide-on');
    app.classList.toggle('guide-on', activa);
    btn.setAttribute('aria-pressed', activa ? 'true' : 'false');
    btn.innerHTML = activa
      ? '<i class="bi bi-question-circle-fill"></i> Ocultar guía'
      : '<i class="bi bi-question-circle"></i> Activar guía';
  }

  function tieneIntegracionClinica(){
    return ['auroDxResumen','auroDxAnalisis','auroDxConducta']
      .some(id => texto(document.getElementById(id)?.value));
  }

  function formatearFechaLocal(valor){
    const raw = texto(valor);
    if(!raw) return '';
    const fecha = new Date(raw);
    if(Number.isNaN(fecha.getTime())) return '';
    try{
      return fecha.toLocaleString('es-EC', {
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit'
      });
    }catch(e){
      return fecha.toLocaleString();
    }
  }

  function actualizarEstadoEdicion(){
    const hayIntegracion = tieneIntegracionClinica();
    const btnEditar = document.getElementById('auroDxEditar');
    const btnGuardar = document.getElementById('auroDxGuardar');
    const estado = document.getElementById('auroDxEdicionEstado');

    ['auroDxResumen','auroDxAnalisis','auroDxConducta'].forEach(id => {
      const campo = document.getElementById(id);
      if(campo) campo.readOnly = !state.modoEdicion;
    });

    if(btnEditar){
      btnEditar.disabled = !hayIntegracion;
      btnEditar.innerHTML = state.modoEdicion
        ? '<i class="bi bi-lock"></i> Finalizar edición'
        : '<i class="bi bi-pencil-square"></i> Editar integración';
    }
    if(btnGuardar) btnGuardar.disabled = !hayIntegracion || !state.cambiosPendientes;

    if(!estado) return;
    if(!hayIntegracion) estado.textContent = 'Sin integración generada.';
    else if(state.modoEdicion && state.cambiosPendientes) estado.textContent = 'En edición · Cambios pendientes de confirmación temporal.';
    else if(state.modoEdicion) estado.textContent = 'Edición médica habilitada.';
    else if(state.guardadoTemporalConfirmado){
      const fecha = formatearFechaLocal(state.ultimaEdicionLocal);
      estado.textContent = 'Guardado temporal confirmado' + (fecha ? ' · ' + fecha : '') + '. Conservado temporalmente en esta atención.';
    }else if(state.cambiosPendientes) estado.textContent = 'Cambios pendientes de confirmación temporal.';
    else estado.textContent = 'Integración generada en modo protegido.';
  }

  function alternarEdicionClinica(){
    if(!tieneIntegracionClinica()){
      mensaje('aviso','Primero genere la integración clínica.');
      return;
    }
    state.modoEdicion = !state.modoEdicion;
    actualizarEstadoEdicion();
    if(state.modoEdicion){
      document.getElementById('auroDxResumen')?.focus();
      mensaje('aviso','Edición médica habilitada. Revise los textos y confirme con “Guardar temporalmente”.');
    }else{
      mensaje('ok','Edición finalizada. Los textos quedaron protegidos contra cambios accidentales.');
    }
  }

  function guardarIntegracionTemporal(){
    if(!state.atencionActual || !tieneIntegracionClinica()){
      mensaje('error','No existe una integración clínica para guardar temporalmente.');
      return;
    }
    state.cambiosPendientes = false;
    state.guardadoTemporalConfirmado = true;
    state.ultimaEdicionLocal = new Date().toISOString();
    state.modoEdicion = false;
    guardarEstadoTemporal();
    actualizarEstadoEdicion();
    mensaje('ok','Integración confirmada temporalmente para esta atención.');
  }

  function claveTecnicaOAdministrativa(clave){
    const k = normalizar(clave);
    if(!k) return true;
    if(CLAVES_TECNICAS.has(k)) return true;

    /*
      Se excluyen solamente identificadores, metadatos y datos administrativos.
      No se modifican los objetos originales ni su almacenamiento.
    */
    return /(^id\b|\bid$|_id\b|\bid_|\bjson\b|timestamp|fecha creacion|fecha actualizacion|hora atencion|creado|actualizado|usuario|version|token|uuid|hash|accion|success|mensaje sistema|numero consulta|numero atencion|numero historia|tipo atencion|modalidad atencion|nombre paciente|nombres paciente|apellidos paciente|paciente nombre|^paciente$|documento paciente|cedula|correo|email|telefono|direccion|estado civil|responsable|acompanante|profesional|medico tratante|sede|sucursal)/.test(k);
  }

  function pareceFechaTecnica(valor){
    const v = texto(valor);
    if(!v) return false;
    if(/^1899-12-3[01]t/i.test(v)) return true;
    return /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(\.\d+)?z?$/i.test(v);
  }

  function limpiarTextoClinico(valor){
    if(valor === null || valor === undefined) return '';

    /*
      Acepta tanto texto simple como objetos serializados.
      Esta función solo transforma una copia para presentación; nunca escribe
      ni modifica la información recibida desde otros módulos.
    */
    if(typeof valor === 'object'){
      return valorClinicoPlano(valor, 0);
    }

    let v = quitarPrefijoSerializado(valor);
    if(!v || v === '{}' || v === '[]' || /^(null|undefined|nan)$/i.test(v)) return '';
    if(pareceFechaTecnica(v)) return '';

    const parseado = parseJsonSeguro(v, null);
    if(parseado && typeof parseado === 'object'){
      return valorClinicoPlano(parseado, 0);
    }

    v = v
      .replace(/AUROSANAX_[A-Z0-9_]+_V\d+::/gi,'')
      .replace(/[{}\[\]"]/g, caracter => caracter)
      .replace(/\s+/g,' ')
      .replace(/\s*\|\s*/g,' · ')
      .replace(/\s*;\s*/g,'; ')
      .trim();

    /*
      Protección final: si todavía parece JSON crudo, no se muestra.
      Es preferible omitir un valor técnico antes que exponerlo al médico.
    */
    if((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))){
      return '';
    }

    return v;
  }

  function resumenClinicoDeObjeto(obj, maximo){
    if(!obj || typeof obj !== 'object') return [];
    const salida = [];
    const vistos = new Set();
    Object.entries(obj).forEach(([clave, valor]) => {
      if(salida.length >= (maximo || 8) || claveTecnicaOAdministrativa(clave)) return;
      const plano = limpiarTextoClinico(valorClinicoPlano(valor, 0));
      if(!plano) return;
      const item = etiquetaClinica(clave) + ': ' + plano;
      const firma = normalizar(item);
      if(vistos.has(firma)) return;
      vistos.add(firma);
      salida.push(item);
    });
    return salida;
  }


  function auroSi(v){
    return v === true || v === 1 ||
      ['si','sí','true','positivo','positiva','presente','1'].includes(normalizar(v));
  }

  function auroNo(v){
    return v === false || v === 0 ||
      ['no','false','negativo','negativa','ausente','0'].includes(normalizar(v));
  }

  function auroListaNatural(lista){
    const a = [...new Set((lista || []).map(texto).filter(Boolean))];
    if(!a.length) return '';
    if(a.length === 1) return a[0];
    if(a.length === 2) return a[0] + ' y ' + a[1];
    return a.slice(0,-1).join(', ') + ' y ' + a[a.length-1];
  }

  function auroPunto(v){
    const t = texto(v).replace(/\s+/g,' ').trim();
    if(!t) return '';
    return /[.!?]$/.test(t) ? t : t + '.';
  }

  function auroObjetoClinico(valor){
    if(!valor) return {};
    if(typeof valor === 'object') return valor;
    const limpio = quitarPrefijoSerializado(valor);
    const parsed = parseJsonSeguro(limpio, null);
    if(parsed && typeof parsed === 'object') return parsed;

    const obj = {};
    limpio.split(/\s*;\s*|\s*\|\s*/).forEach(p => {
      const i = p.indexOf(':');
      if(i > 0){
        const k = texto(p.slice(0,i));
        const v = texto(p.slice(i+1));
        if(k && v) obj[k] = v;
      }
    });
    return obj;
  }

  function auroBuscar(obj, aliases){
    obj = auroObjetoClinico(obj);
    const keys = Object.keys(obj);
    for(const alias of aliases){
      const a = normalizar(alias).replace(/\s+/g,'');
      const k = keys.find(x => normalizar(x).replace(/\s+/g,'') === a);
      if(k) return obj[k];
    }
    return '';
  }

  const AURO_GINE = {
    'dolor pélvico':['dolor_pelvico','dolor pelvico','dolorPelvico'],
    'sangrado uterino anormal':['sangrado_anormal','sangrado vaginal','sangrado_vaginal'],
    'leucorrea':['leucorrea','flujo_vaginal','flujo vaginal'],
    'prurito vulvovaginal':['prurito','prurito_vulvar','prurito_vaginal'],
    'disuria':['disuria'],
    'dispareunia':['dispareunia'],
    'amenorrea':['amenorrea'],
    'dismenorrea':['dismenorrea'],
    'sensación de masa':['sensacion_masa','masa'],
    'sequedad vaginal':['sequedad_vaginal','sequedad vaginal'],
    'incontinencia urinaria':['incontinencia','incontinencia_urinaria']
  };

  const AURO_OBST = {
    'sangrado vaginal':['sangrado_vaginal','sangrado vaginal','sangrado'],
    'pérdida de líquido':['perdida_liquido','perdida de liquido'],
    'dolor pélvico':['dolor_pelvico','dolor pelvico'],
    'cefalea':['cefalea'],
    'fosfenos':['fosfenos'],
    'edema':['edema'],
    'contracciones uterinas':['contracciones','contracciones_uterinas'],
    'disminución de movimientos fetales':['disminucion_movimientos_fetales']
  };

  function auroSintomas(obj, mapa){
    const positivos = [], negativos = [];
    Object.entries(mapa).forEach(([nombre, aliases]) => {
      const v = auroBuscar(obj, aliases);
      if(auroSi(v)) positivos.push(nombre);
      else if(auroNo(v)) negativos.push(nombre);
    });
    return {positivos, negativos};
  }

  function auroNarrarSintomas(prefijo, datos){
    if(!datos.positivos.length && !datos.negativos.length) return '';
    let frase = '';
    if(datos.positivos.length){
      frase = prefijo + ' se documenta ' + auroListaNatural(datos.positivos);
    }
    if(datos.negativos.length){
      frase += (frase ? '; niega ' : prefijo + ' niega ') +
        auroListaNatural(datos.negativos.slice(0,6));
    }
    return auroPunto(frase);
  }

  /* ==========================================================
     AUROSANAX DIAGNÓSTICOS v1.4.4
     Intérprete clínico profesional de antecedentes.
     - Lee el formato estructurado generado por antecedentes.js.
     - No modifica ni reescribe los datos de origen.
     - Evita exponer key, número, dosis, JSON o metadatos internos.
     ========================================================== */

  /*
   * Marcador histórico de serialización. Se conserva para leer datos ya
   * existentes; no representa una conexión con AUROSANAX PRUEBA.
   */
  const AURO_DX_ANT_PERSONALES_MARKER = 'AUROSANAX_ANT_PERSONALES_V1::';

  function auroDxParseAntecedentesPersonales(valor){
    const raw = texto(valor);
    if(!raw) return {estructurado:false, data:null, patologicos:''};

    if(raw.startsWith(AURO_DX_ANT_PERSONALES_MARKER)){
      try{
        const data = JSON.parse(raw.substring(AURO_DX_ANT_PERSONALES_MARKER.length));
        return {
          estructurado:true,
          data: data && typeof data === 'object' ? data : {},
          patologicos: texto(data?.patologicos)
        };
      }catch(error){
        console.warn(MODULO + ': no se pudo interpretar antecedentes personales estructurados.', error);
      }
    }

    return {estructurado:false, data:null, patologicos:raw};
  }

  function auroDxLimpiarElementoAntecedente(valor){
    return texto(valor)
      .replace(/^(patol[oó]gicos?|quir[uú]rgicos?|alergias?|medicaci[oó]n actual|tratamiento)\s*:\s*/i,'')
      .replace(/\b(key|n[uú]mero|numero|dosis)\s*:\s*[^;|,]*/gi,'')
      .replace(/\s+/g,' ')
      .replace(/^[:;,|.\-\s]+|[:;,|.\-\s]+$/g,'')
      .trim();
  }

  function auroDxSepararRegistros(valor){
    if(Array.isArray(valor)) return valor;
    const raw = texto(valor);
    if(!raw) return [];
    return raw.split(/\s*;\s*|\r?\n+/).map(texto).filter(Boolean);
  }

  function auroDxNarrarPatologicos(valor){
    const frases = [];

    auroDxSepararRegistros(valor).forEach(registro => {
      if(registro && typeof registro === 'object'){
        const nombre = auroDxLimpiarElementoAntecedente(
          registro.descripcion || registro.patologia || registro.nombre || registro.titulo
        );
        const tiempo = auroDxLimpiarElementoAntecedente(
          registro.tiempo || registro.evolucion || registro.tiempo_diagnostico
        );
        const medicamento = auroDxLimpiarElementoAntecedente(
          registro.medicamento || registro.medicacion || registro.tratamiento
        );
        if(!nombre) return;
        let frase = nombre;
        if(tiempo && !/^(no aplica|n\/a)$/i.test(tiempo)) frase += ' de ' + tiempo + ' de evolución';
        if(medicamento && !/^no (usa|recuerda)/i.test(medicamento)) frase += ', en tratamiento con ' + medicamento;
        frases.push(frase);
        return;
      }

      const limpio = auroDxLimpiarElementoAntecedente(registro);
      if(!limpio) return;
      if(/^niega antecedentes patol[oó]gicos/i.test(limpio)){
        frases.push('niega antecedentes patológicos personales relevantes');
        return;
      }

      const partes = limpio.split('|').map(auroDxLimpiarElementoAntecedente).filter(Boolean);
      const nombre = partes[0] || '';
      const tiempo = (partes[1] || '').replace(/^Tiempo\s*:\s*/i,'').trim();
      const medicamento = partes.slice(2).join(' | ')
        .replace(/^(Medicamento|Medicaci[oó]n|Tratamiento)\s*:\s*/i,'').trim();
      if(!nombre) return;

      let frase = nombre;
      if(tiempo && !/^(no aplica|n\/a)$/i.test(tiempo)) frase += ' de ' + tiempo + ' de evolución';
      if(medicamento && !/^no (usa|recuerda)/i.test(medicamento)) frase += ', en tratamiento con ' + medicamento;
      frases.push(frase);
    });

    return auroListaNatural(frases);
  }

  function auroDxNarrarQuirurgicos(valor){
    const items = auroDxSepararRegistros(valor).map(registro => {
      const partes = texto(registro).split('|').map(auroDxLimpiarElementoAntecedente).filter(Boolean);
      if(!partes.length) return '';
      if(/^niega antecedentes quir[uú]rgicos/i.test(partes[0])) return 'niega antecedentes quirúrgicos';
      const nombre = partes[0];
      const fecha = partes.slice(1).join(' ')
        .replace(/^(Fecha|Año)\s*:\s*/i,'').trim();
      return fecha ? nombre + ' (' + fecha + ')' : nombre;
    }).filter(Boolean);
    return auroListaNatural(items);
  }

  function auroDxNarrarAlergias(valor){
    const items = auroDxSepararRegistros(valor).map(registro => {
      const partes = texto(registro).split('|').map(auroDxLimpiarElementoAntecedente).filter(Boolean);
      if(!partes.length) return '';
      if(/^niega alergias/i.test(partes[0])) return 'niega alergias conocidas';
      const agente = partes[0];
      const reaccion = partes.slice(1).join(' ').replace(/^Reacci[oó]n\s*:\s*/i,'').trim();
      return reaccion ? agente + ', con reacción referida de ' + reaccion : agente;
    }).filter(Boolean);
    return auroListaNatural(items);
  }

  function auroDxVacunaTieneDatoReal(vacuna){
    if(!vacuna || typeof vacuna !== 'object') return false;
    if(texto(vacuna.nombre_comercial)) return true;
    return Array.isArray(vacuna.dosis) && vacuna.dosis.some(d =>
      d?.aplicada === true || texto(d?.administracion) || texto(d?.observacion)
    );
  }

  function auroDxNombreVacuna(valor){
    return texto(valor)
      .replace(/Virus Papiloma Humano\s*\(HPV\)/i,'VPH')
      .replace(/Virus Papiloma Humano/i,'VPH')
      .replace(/COVID-19/i,'COVID-19')
      .replace(/Hepatitis B/i,'hepatitis B')
      .trim();
  }

  function auroDxNarrarVacunacion(data){
    if(!data || typeof data !== 'object') return '';
    const vacunas = Array.isArray(data.vacunas) ? data.vacunas : [];
    const nombres = vacunas
      .filter(auroDxVacunaTieneDatoReal)
      .map(v => auroDxNombreVacuna(v.biologico || v.key))
      .filter(Boolean);

    const covid = data.covid && typeof data.covid === 'object' ? data.covid : null;
    if(covid && auroSi(covid.vacunado) && !nombres.some(x => normalizar(x).includes('covid'))){
      nombres.unshift('COVID-19');
    }

    if(!nombres.length) return '';
    return 'vacunación registrada contra ' + auroListaNatural(nombres);
  }

  function auroDxNarrarCovid(data){
    const c = data?.covid;
    if(!c || typeof c !== 'object') return '';
    if(auroNo(c.presento)) return 'niega antecedente de COVID-19';
    if(!auroSi(c.presento)) return '';

    let frase = 'antecedente de COVID-19';
    const fecha = auroDxLimpiarElementoAntecedente(c.fecha || c.anio_referencia);
    const clasificacion = auroDxLimpiarElementoAntecedente(c.clasificacion);
    if(fecha) frase += ' en ' + fecha;
    if(clasificacion) frase += ', clasificado como ' + clasificacion.toLowerCase();
    if(auroSi(c.hospitalizacion)){
      frase += ', con hospitalización';
      const tiempo = auroDxLimpiarElementoAntecedente(c.tiempo_hospitalizado);
      if(tiempo) frase += ' durante ' + tiempo;
    }
    return frase;
  }

  /* ==========================================================
     AUROSANAX DIAGNÓSTICOS 1.5.6
     INTÉRPRETE QUIRÚRGICO DE ANTECEDENTES FAMILIARES
     ----------------------------------------------------------
     - Solo transforma el valor para el resumen clínico.
     - No modifica el dato original ni su formato en Google Sheets.
     - Compatible con AUROSANAX_ANT_FAMILIARES_V1:: y JSON puro.
     - Conserva compatibilidad con texto familiar antiguo.
     ========================================================== */
  /*
   * Marcador histórico de serialización. Se conserva para leer datos ya
   * existentes; no representa una conexión con AUROSANAX PRUEBA.
   */
  const AURO_DX_ANT_FAMILIARES_MARKER = 'AUROSANAX_ANT_FAMILIARES_V1::';

  function auroDxParseAntecedentesFamiliares(valor){
    if(valor && typeof valor === 'object'){
      return {estructurado:true, data:valor};
    }

    const raw = texto(valor);
    if(!raw) return {estructurado:false, data:null, texto:''};

    const limpio = raw.startsWith(AURO_DX_ANT_FAMILIARES_MARKER)
      ? raw.substring(AURO_DX_ANT_FAMILIARES_MARKER.length).trim()
      : quitarPrefijoSerializado(raw);

    const data = parseJsonSeguro(limpio, null);
    if(data && typeof data === 'object'){
      return {estructurado:true, data};
    }

    return {
      estructurado:false,
      data:null,
      texto:auroDxLimpiarElementoAntecedente(raw)
    };
  }

  function auroDxNarrarItemFamiliar(item, tipo){
    if(item === null || item === undefined) return '';

    if(typeof item !== 'object'){
      return auroDxLimpiarElementoAntecedente(item);
    }

    const nombre = auroDxLimpiarElementoAntecedente(
      tipo === 'quirurgico'
        ? (item.cirugia || item.procedimiento || item.nombre || item.descripcion || item.patologia)
        : (item.patologia || item.enfermedad || item.diagnostico || item.nombre || item.descripcion)
    );
    const parentesco = auroDxLimpiarElementoAntecedente(
      item.parentesco || item.familiar || item.relacion || item.parentiente
    );
    const detalle = auroDxLimpiarElementoAntecedente(
      item.detalle || item.observacion || item.observaciones || item.fecha || item.anio
    );

    if(!nombre && !parentesco && !detalle) return '';

    let frase = '';
    if(parentesco && nombre){
      frase = parentesco + ' con ' + nombre;
    }else{
      frase = nombre || parentesco;
    }

    if(detalle){
      frase += frase ? ' (' + detalle + ')' : detalle;
    }

    return frase;
  }

  function auroDxNarrarFamiliares(valor){
    const parsed = auroDxParseAntecedentesFamiliares(valor);

    if(!parsed.estructurado){
      const textoLibre = auroDxLimpiarElementoAntecedente(parsed.texto || '');
      if(/^niega antecedentes familiares/i.test(textoLibre)){
        return 'niega antecedentes familiares relevantes';
      }
      return textoLibre;
    }

    const data = parsed.data || {};

    /*
      AUROSANAX FIX QUIRÚRGICO 2026-08-08:
      antecedentes.js puede guardar la negación familiar como estado
      estructurado { niega:true } dentro de la misma columna existente.
      Diagnóstico solo la interpreta para el resumen; no modifica origen,
      Google Sheets, fechas, IDs ni estructura de guardado.
    */
    if(data.niega === true || auroSi(data.niega)){
      return 'niega antecedentes familiares relevantes';
    }

    const frases = [];

    const patologicos = Array.isArray(data.patologicos) ? data.patologicos : [];
    const quirurgicos = Array.isArray(data.quirurgicos) ? data.quirurgicos : [];

    patologicos
      .map(item => auroDxNarrarItemFamiliar(item, 'patologico'))
      .filter(Boolean)
      .forEach(frase => frases.push(frase));

    quirurgicos
      .map(item => auroDxNarrarItemFamiliar(item, 'quirurgico'))
      .filter(Boolean)
      .forEach(frase => frases.push('antecedente quirúrgico: ' + frase));

    const otros = auroDxLimpiarElementoAntecedente(data.otros);
    if(/^niega antecedentes familiares/i.test(otros)){
      return 'niega antecedentes familiares relevantes';
    }
    if(otros && !/^(ninguno|ninguna|no|n\/a|no aplica)$/i.test(otros)){
      frases.push('otros antecedentes familiares: ' + otros);
    }

    return auroListaNatural([...new Set(frases.map(texto).filter(Boolean))]);
  }

  function auroDxConstruirNarrativaAntecedentes(historia){
    const h = historia || {};
    const personales = auroDxParseAntecedentesPersonales(
      h.antecedentes_personales || h.antecedentes_patologicos
    );
    const bloques = [];

    const patologicos = auroDxNarrarPatologicos(personales.patologicos);
    if(patologicos){
      if(/^niega antecedentes patol[oó]gicos/i.test(patologicos)) bloques.push(auroPunto(patologicos));
      else bloques.push(auroPunto('Antecedentes patológicos personales de ' + patologicos));
    }

    const quirurgicos = auroDxNarrarQuirurgicos(h.antecedentes_quirurgicos);
    if(quirurgicos){
      if(/^niega antecedentes quir[uú]rgicos/i.test(quirurgicos)) bloques.push(auroPunto(quirurgicos));
      else bloques.push(auroPunto('Antecedentes quirúrgicos de ' + quirurgicos));
    }

    const alergias = auroDxNarrarAlergias(h.alergias);
    if(alergias){
      if(/^niega alergias/i.test(alergias)) bloques.push(auroPunto(alergias));
      else bloques.push(auroPunto('Refiere alergia a ' + alergias));
    }

    const medicacion = auroDxLimpiarElementoAntecedente(h.medicacion_actual);
    if(medicacion && !/^no usa medicaci[oó]n/i.test(medicacion)){
      bloques.push(auroPunto('Como medicación habitual refiere ' + medicacion));
    }else if(/^no usa medicaci[oó]n/i.test(medicacion)){
      bloques.push(auroPunto('No utiliza medicación habitual según refiere'));
    }

    const familiares = auroDxNarrarFamiliares(h.antecedentes_familiares);
    if(familiares){
      if(/^niega antecedentes familiares/i.test(familiares)){
        bloques.push(auroPunto(familiares));
      }else{
        bloques.push(auroPunto('Antecedentes familiares: ' + familiares));
      }
    }

    if(personales.estructurado){
      const covid = auroDxNarrarCovid(personales.data);
      if(covid) bloques.push(auroPunto(covid));

      const vacunacion = auroDxNarrarVacunacion(personales.data);
      if(vacunacion) bloques.push(auroPunto('Se documenta ' + vacunacion));
    }

    return bloques.join(' ');
  }

  function contenidoAnamnesis(){
    const a = state.anamnesis || {};
    return limpiarTextoClinico(
      a.enfermedad_actual || a.anamnesis || a.descripcion || a.relato_clinico ||
      a.historia_enfermedad_actual || a.contenido || a.texto ||
      state.historia?.enfermedad_actual || state.historia?.anamnesis ||
      atencionActiva()?.enfermedad_actual ||
      getValue('hcEnfermedadActual') || getValue('hcAnamnesis')
    );
  }

  function construirResumenClinico(){
    const at = atencionActiva() || {};
    const h = state.historia || {};
    const d = state.detalleExamen || {};
    const ex = d.examen || {};
    const gine = state.especialidades.ginecologia || {};
    const obst = state.especialidades.obstetricia || {};
    const parrafos = [];

    function add(v){
      const t = auroPunto(v);
      if(t && !parrafos.some(x => normalizar(x) === normalizar(t))) parrafos.push(t);
    }

    const motivo = limpiarTextoClinico(
      at.motivo_consulta || h.motivo_consulta ||
      getValue('hcMotivoConsulta') || getValue('hcMotivo')
    );
    const enfermedad = contenidoAnamnesis();

    if(motivo && enfermedad){
      add('Consulta por ' + motivo.replace(/[.\s]+$/,'') +
          '. En la anamnesis se describe ' + enfermedad);
    }else if(motivo) add('Consulta por ' + motivo);
    else if(enfermedad) add('En la anamnesis se describe ' + enfermedad);

    const narrativaAntecedentes = auroDxConstruirNarrativaAntecedentes(h);
    if(narrativaAntecedentes) add(narrativaAntecedentes);

    const vitales = [];
    if(ex.presion_arterial) vitales.push('presión arterial de ' + limpiarTextoClinico(ex.presion_arterial));
    if(ex.frecuencia_cardiaca) vitales.push('frecuencia cardíaca de ' + limpiarTextoClinico(ex.frecuencia_cardiaca) + ' lpm');
    if(ex.frecuencia_respiratoria) vitales.push('frecuencia respiratoria de ' + limpiarTextoClinico(ex.frecuencia_respiratoria) + ' rpm');
    if(ex.temperatura) vitales.push('temperatura de ' + limpiarTextoClinico(ex.temperatura) + ' °C');
    if(ex.saturacion) vitales.push('saturación de oxígeno de ' + limpiarTextoClinico(ex.saturacion) + '%');
    if(ex.peso_kg) vitales.push('peso de ' + limpiarTextoClinico(ex.peso_kg) + ' kg');
    if(ex.imc) vitales.push('índice de masa corporal de ' + limpiarTextoClinico(ex.imc));
    if(vitales.length) add('En la valoración se registran ' + auroListaNatural(vitales));

    const hallazgo = limpiarTextoClinico(ex.examen_fisico || ex.hallazgos || ex.observaciones);
    if(hallazgo) add('Al examen físico se documenta ' + hallazgo);

    const gineCont = gine.sintomas_json || gine.sintomas ||
      gine.sintomas_ginecologicos_json || gine.sintomas_ginecologicos || gine;
    const obstCont = obst.sintomas_obstetricos_json || obst.sintomas_obstetricos ||
      obst.sintomas_json || obst.sintomas || obst;

    add(auroNarrarSintomas('En la valoración ginecológica', auroSintomas(gineCont, AURO_GINE)));
    add(auroNarrarSintomas('En la valoración obstétrica', auroSintomas(obstCont, AURO_OBST)));

    const principal = state.diagnosticos.find(x => x.principal) || state.diagnosticos[0];
    const secundarios = state.diagnosticos.filter(x => x !== principal);

    if(principal){
      add('Como diagnóstico principal se registra ' +
        [principal.codigo_cie10, principal.descripcion].filter(Boolean).join(' - ') +
        (principal.tipo_diagnostico ? ', de carácter ' + principal.tipo_diagnostico.toLowerCase() : ''));
    }
    if(secundarios.length){
      add('Se registran como diagnósticos asociados ' +
        auroListaNatural(secundarios.map(x =>
          [x.codigo_cie10,x.descripcion].filter(Boolean).join(' - ')
        )));
    }

    if(!principal){
      add('La impresión diagnóstica se encuentra pendiente de establecer y deberá definirse mediante correlación clínica');
    }

    return parrafos.join('\n\n');
  }

  function construirAnalisis(){
    const principal = state.diagnosticos.find(x => x.principal) || state.diagnosticos[0];
    const secundarios = state.diagnosticos.filter(x => x !== principal);
    const at = atencionActiva() || {};
    const h = state.historia || {};
    const ex = state.detalleExamen?.examen || {};
    const gine = state.especialidades.ginecologia || {};
    const obst = state.especialidades.obstetricia || {};
    const parrafos = [];

    /*
      AUROSANAX — CONTEXTO CLÍNICO DE GENERACIÓN
      Reutiliza exclusivamente el contexto ya existente del módulo.
      No crea estados nuevos ni modifica la seguridad de la atención.
    */
    const ctx = contextoAtencionSeleccionada();
    const historica = ctx?.historica === true;
    const correccionActiva =
      historica && state.correccionClinicaActiva === true;
    const historicaSoloLectura =
      historica && !correccionActiva;

    const motivo = limpiarTextoClinico(
      at.motivo_consulta || h.motivo_consulta ||
      getValue('hcMotivoConsulta') || getValue('hcMotivo')
    );
    const enfermedad = contenidoAnamnesis();
    const hallazgo = limpiarTextoClinico(
      ex.examen_fisico || ex.hallazgos || ex.observaciones
    );

    const gineCont = gine.sintomas_json || gine.sintomas ||
      gine.sintomas_ginecologicos_json || gine.sintomas_ginecologicos || gine;
    const obstCont = obst.sintomas_obstetricos_json || obst.sintomas_obstetricos ||
      obst.sintomas_json || obst.sintomas || obst;

    const sg = auroSintomas(gineCont, AURO_GINE);
    const so = auroSintomas(obstCont, AURO_OBST);
    const positivos = [...sg.positivos, ...so.positivos];
    const negativos = [...sg.negativos, ...so.negativos];

    /*
      SIN DIAGNÓSTICO PRINCIPAL
      - Atención abierta: razonamiento prospectivo original.
      - Histórica: descripción documental, sin sugerir que la atención sigue activa.
      - Corrección: revisión clínica temporal dentro del flujo auditado existente.
    */
    if(!principal){
      const bases = [];
      if(motivo) bases.push('el motivo de consulta');
      if(enfermedad) bases.push('la anamnesis y evolución clínica referida');
      if(hallazgo) bases.push('los hallazgos del examen físico');
      if(positivos.length){
        bases.push('la presencia de ' + auroListaNatural(positivos.slice(0,6)));
      }

      if(historicaSoloLectura){
        if(bases.length){
          parrafos.push(
            'En esta atención finalizada no consta un diagnóstico principal activo en la información diagnóstica disponible. ' +
            'El análisis histórico se limita a la documentación registrada, que incluye ' +
            auroListaNatural(bases) + '.'
          );
        }else{
          parrafos.push(
            'En esta atención finalizada no consta un diagnóstico principal activo ni información clínica suficiente para ampliar retrospectivamente la impresión diagnóstica.'
          );
        }
      }else if(correccionActiva){
        if(bases.length){
          parrafos.push(
            'Durante la revisión clínica del registro histórico se dispone de ' +
            auroListaNatural(bases) +
            '. Estos elementos permiten reevaluar la impresión diagnóstica dentro de la corrección clínica habilitada, sin modificar por sí solos el registro original.'
          );
        }else{
          parrafos.push(
            'La corrección clínica está habilitada, pero la información disponible aún es insuficiente para reformular una impresión diagnóstica.'
          );
        }
      }else{
        if(bases.length){
          parrafos.push(
            'Con la información disponible se establece un razonamiento clínico preliminar basado en ' +
            auroListaNatural(bases) +
            '. Estos elementos permiten orientar la impresión diagnóstica, que permanece pendiente de confirmación y registro por el profesional.'
          );
        }else{
          parrafos.push(
            'La atención está activa, pero la información clínica disponible aún es insuficiente para formular un razonamiento clínico preliminar.'
          );
        }
      }

      if(negativos.length){
        parrafos.push(
          'Se documenta ausencia de ' +
          auroListaNatural(negativos.slice(0,5)) +
          (historicaSoloLectura
            ? ', dato consignado en el registro de esta atención.'
            : ', hallazgo que debe interpretarse dentro del contexto clínico y no excluye otros diagnósticos diferenciales.')
        );
      }
    }

    /*
      DIAGNÓSTICO PRINCIPAL
      Conserva explícitamente el grado de certeza registrado.
    */
    if(principal){
      const dx = [principal.codigo_cie10, principal.descripcion]
        .filter(Boolean)
        .join(' - ');

      const tipoRegistrado =
        texto(principal.tipo_diagnostico || 'Presuntivo');
      const tipoNormalizado = normalizar(tipoRegistrado);
      const esDefinitivo =
        tipoNormalizado.includes('definit');

      if(historicaSoloLectura){
        let frase =
          'En esta atención finalizada quedó registrado como diagnóstico principal ' +
          dx +
          ', de carácter ' +
          tipoRegistrado.toLowerCase();

        if(positivos.length){
          frase +=
            '. Entre los datos clínicos documentados constan ' +
            auroListaNatural(positivos.slice(0,6));
        }else{
          const bases = [];
          if(motivo) bases.push('el motivo de consulta');
          if(enfermedad) bases.push('la evolución clínica referida');
          if(hallazgo) bases.push('los hallazgos del examen físico');

          if(bases.length){
            frase +=
              '. El registro disponible conserva como elementos de contexto ' +
              auroListaNatural(bases);
          }
        }

        frase += '.';

        if(negativos.length){
          frase +=
            ' También se documenta ausencia de ' +
            auroListaNatural(negativos.slice(0,5)) +
            '.';
        }

        parrafos.push(frase);

      }else{
        let frase = '';

        if(esDefinitivo){
          frase =
            'Se encuentra registrado como diagnóstico principal definitivo ' +
            dx;
        }else{
          frase =
            'Se encuentra registrado como diagnóstico principal ' +
            tipoRegistrado.toLowerCase() +
            ' ' +
            dx;
        }

        if(positivos.length){
          frase +=
            esDefinitivo
              ? ', en correlación con la presencia documentada de ' +
                auroListaNatural(positivos.slice(0,6))
              : '. Los hallazgos disponibles son concordantes con esta impresión, incluyendo ' +
                auroListaNatural(positivos.slice(0,6));
        }else{
          const bases = [];
          if(motivo) bases.push('el motivo de consulta');
          if(enfermedad) bases.push('la evolución clínica referida');
          if(hallazgo) bases.push('los hallazgos del examen físico');

          if(bases.length){
            frase +=
              esDefinitivo
                ? ', en correlación con ' + auroListaNatural(bases)
                : '. La correlación clínica disponible considera ' +
                  auroListaNatural(bases);
          }
        }

        frase += '.';

        if(negativos.length){
          frase +=
            ' Se documenta ausencia de ' +
            auroListaNatural(negativos.slice(0,5)) +
            ', lo cual debe interpretarse dentro del contexto clínico.';
        }

        if(correccionActiva){
          frase +=
            ' Esta integración se realiza dentro de una corrección clínica habilitada del registro histórico y requiere validación profesional antes de guardar la enmienda.';
        }

        parrafos.push(frase);
      }
    }

    /*
      DIAGNÓSTICOS ASOCIADOS
      En modo histórico se describen; no se convierten en una nueva conducta.
    */
    if(secundarios.length){
      const listaSecundarios = secundarios.map(x =>
        [
          [x.codigo_cie10, x.descripcion].filter(Boolean).join(' - '),
          x.tipo_diagnostico
            ? '(' + texto(x.tipo_diagnostico).toLowerCase() + ')'
            : ''
        ].filter(Boolean).join(' ')
      ).join('; ');

      if(historicaSoloLectura){
        parrafos.push(
          'En el registro de esta atención constan además como diagnósticos asociados: ' +
          listaSecundarios +
          '.'
        );
      }else{
        parrafos.push(
          'Los diagnósticos asociados —' +
          listaSecundarios +
          '— deben considerarse al individualizar el abordaje y el seguimiento.'
        );
      }
    }

    /*
      INFORMACIÓN FALTANTE
      Nunca exige completar retrospectivamente una consulta finalizada.
    */
    const faltantes = [];
    if(!motivo) faltantes.push('motivo de consulta');
    if(!enfermedad) faltantes.push('enfermedad actual');
    if(!hallazgo) faltantes.push('hallazgos del examen físico');

    if(faltantes.length){
      if(historicaSoloLectura){
        parrafos.push(
          'En la documentación disponible de esta atención no constan ' +
          auroListaNatural(faltantes) +
          '; por tratarse de un registro finalizado, esta integración histórica se limita a la información efectivamente documentada.'
        );
      }else if(correccionActiva){
        parrafos.push(
          'Durante la revisión del registro no constan ' +
          auroListaNatural(faltantes) +
          '. Cualquier incorporación debe corresponder a una corrección clínica debidamente validada y trazable.'
        );
      }else{
        parrafos.push(
          'La correlación clínica debe completarse o verificarse con ' +
          auroListaNatural(faltantes) +
          ' antes de cerrar la impresión diagnóstica.'
        );
      }
    }

    /*
      PROTOCOLOS
      La existencia ACTUAL de un protocolo no se presenta como evidencia
      de que haya sido aplicado en una atención histórica.
    */
    if(state.protocolos.length){
      if(historicaSoloLectura){
        parrafos.push(
          'Actualmente se dispone de ' +
          state.protocolos.length +
          ' protocolo(s) de apoyo vinculado(s) al diagnóstico registrado. Su disponibilidad se muestra únicamente como referencia clínica actual y no implica que hayan sido aplicados durante esta atención finalizada.'
        );
      }else{
        parrafos.push(
          'Se dispone de ' +
          state.protocolos.length +
          ' protocolo(s) de apoyo vinculado(s) al diagnóstico registrado. Su contenido es orientativo y requiere validación e individualización médica.'
        );
      }
    }else if(principal){
      if(historicaSoloLectura){
        parrafos.push(
          'No se identifica actualmente un protocolo clínico activo específico para el diagnóstico registrado. Esto no modifica ni redefine la conducta documentada en la atención finalizada.'
        );
      }else{
        parrafos.push(
          'No se encontró un protocolo clínico activo específico para el diagnóstico registrado; la conducta deberá individualizarse según la valoración clínica y los resultados complementarios.'
        );
      }
    }else if(!historicaSoloLectura){
      parrafos.push(
        'Al no existir todavía un diagnóstico registrado, no se realiza vinculación automática con protocolos. Esta etapa podrá completarse al actualizar la integración clínica.'
      );
    }

    /*
      SEGURIDAD CLÍNICA
      La advertencia prospectiva solo corresponde cuando todavía existe
      capacidad de decisión clínica o una corrección explícitamente habilitada.
    */
    if(!historicaSoloLectura){
      parrafos.push(
        correccionActiva
          ? 'Antes de modificar el Plan o incorporar una corrección deben verificarse gravedad, comorbilidades, alergias, embarazo o lactancia cuando corresponda, función renal y hepática, interacciones farmacológicas y signos de alarma.'
          : 'Antes de definir el Plan deben verificarse gravedad, comorbilidades, alergias, embarazo o lactancia cuando corresponda, función renal y hepática, interacciones farmacológicas y signos de alarma.'
      );
    }

    return parrafos.map(auroPunto).join('\n\n');
  }

  function construirConducta(){
    const ctx = contextoAtencionSeleccionada();
    const historica = ctx?.historica === true;
    const correccionActiva =
      historica && state.correccionClinicaActiva === true;
    const historicaSoloLectura =
      historica && !correccionActiva;

    const p =
      state.protocoloSeleccionado !== null
        ? state.protocolos[state.protocoloSeleccionado]
        : null;

    /*
      ATENCIÓN FINALIZADA / SOLO LECTURA
      No genera retrospectivamente una conducta nueva.
      Tampoco afirma que un protocolo actual fue aplicado en el pasado.
    */
    if(historicaSoloLectura){
      const partes = [
        'Atención finalizada: esta integración no genera una conducta clínica nueva ni modifica retrospectivamente el Plan.'
      ];

      partes.push(
        'La conducta clínicamente válida corresponde a lo documentado en el Plan, órdenes, indicaciones, recetas, interconsultas y demás registros de esta atención.'
      );

      if(p){
        partes.push(
          'El protocolo actualmente vinculado al diagnóstico permanece disponible únicamente como referencia clínica; su presencia no implica que haya sido indicado o aplicado durante esta atención.'
        );
      }

      return partes.join('\n');
    }

    /*
      ATENCIÓN ABIERTA O CORRECCIÓN CLÍNICA HABILITADA
      Conserva el motor de sugerencias, pero diferencia de forma inequívoca
      protocolo de apoyo versus conducta ya indicada.
    */
    if(!p){
      const partes = [];

      if(correccionActiva){
        partes.push(
          'Corrección clínica habilitada: las siguientes orientaciones son apoyo para revisión y no modifican por sí solas el registro histórico.'
        );
      }

      partes.push(
        'Estudios sugeridos para revisión: definir exámenes complementarios según hallazgos clínicos y diagnósticos diferenciales.'
      );
      partes.push(
        'Tratamiento sugerido para revisión: individualizar de acuerdo con diagnóstico, grado de certeza, antecedentes, alergias y contraindicaciones.'
      );
      partes.push(
        'Educación sugerida: explicar evolución esperada, adherencia y medidas generales pertinentes.'
      );
      partes.push(
        'Seguimiento sugerido: establecer control según evolución clínica y resultados.'
      );
      partes.push(
        'Signos de alarma: indicar consulta inmediata ante deterioro clínico o síntomas de alarma relacionados con el cuadro.'
      );

      partes.push(
        correccionActiva
          ? 'Cualquier modificación debe incorporarse expresamente dentro del flujo de corrección clínica habilitado.'
          : 'Estas orientaciones no constituyen prescripción automática y requieren validación médica antes de incorporarse al Plan.'
      );

      return partes.join('\n');
    }

    const partes = [];
    const estudios = [
      ...(p.ordenes || []),
      ...(p.imagenes || []),
      ...(p.procedimientos || [])
    ].map(limpiarTextoClinico).filter(Boolean);

    const tratamiento = (p.medicamentos || [])
      .map(limpiarTextoClinico)
      .filter(Boolean);
    const indicaciones = (p.indicaciones || [])
      .map(limpiarTextoClinico)
      .filter(Boolean);
    const controles = (p.controles || [])
      .map(limpiarTextoClinico)
      .filter(Boolean);
    const alertas = (p.alertas || [])
      .map(limpiarTextoClinico)
      .filter(Boolean);

    if(correccionActiva){
      partes.push(
        'Corrección clínica habilitada: el protocolo se presenta como apoyo para revisión del registro histórico y no modifica por sí solo la atención original.'
      );
    }

    const conductaGeneral = limpiarTextoClinico(p.conducta);
    if(conductaGeneral){
      partes.push(
        'Conducta protocolizada sugerida para revisión: ' +
        conductaGeneral +
        '.'
      );
    }

    if(estudios.length){
      partes.push(
        'Estudios/procedimientos sugeridos para revisión: ' +
        estudios.join('; ') +
        '.'
      );
    }

    if(tratamiento.length){
      partes.push(
        'Tratamiento protocolizado propuesto para revisión: ' +
        tratamiento.join('; ') +
        '.'
      );
    }

    if(indicaciones.length){
      partes.push(
        'Educación e indicaciones sugeridas: ' +
        indicaciones.join('; ') +
        '.'
      );
    }

    if(controles.length){
      partes.push(
        'Seguimiento sugerido: ' +
        controles.join('; ') +
        '.'
      );
    }

    if(alertas.length){
      partes.push(
        'Signos de alarma/precauciones del protocolo: ' +
        alertas.join('; ') +
        '.'
      );
    }

    partes.push(
      correccionActiva
        ? 'Estas sugerencias no modifican por sí solas el registro histórico. Cualquier cambio debe incorporarse expresamente dentro de la corrección clínica habilitada y conservar su trazabilidad.'
        : 'Estas sugerencias no constituyen prescripción automática. Validar e individualizar con criterio médico antes de transferirlas al Plan.'
    );

    return partes.join('\n');
  }

  function valorPrimero(objeto, claves){
    for(const clave of claves || []){
      const valor = texto(objeto?.[clave]);
      if(valor) return valor;
    }
    return '';
  }

  function fechaHoraEcuador(){
    const ahora = new Date();
    const fecha = new Intl.DateTimeFormat('es-EC',{
      timeZone:'America/Guayaquil',
      day:'2-digit',
      month:'2-digit',
      year:'numeric'
    }).format(ahora);
    const hora = new Intl.DateTimeFormat('es-EC',{
      timeZone:'America/Guayaquil',
      hour:'2-digit',
      minute:'2-digit',
      second:'2-digit',
      hour12:false
    }).format(ahora);
    const partes = new Intl.DateTimeFormat('en-CA',{
      timeZone:'America/Guayaquil',
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',
      hour12:false
    }).formatToParts(ahora);
    const mapa = {};
    partes.forEach(p => { if(p.type !== 'literal') mapa[p.type] = p.value; });
    return {
      fecha,
      hora,
      iso: `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}-05:00`
    };
  }

  function construirContextoApoyoIA(){
    const ctx = contextoAtencionSeleccionada();
    const atencion = ctx.atencion || atencionActiva() || {};
    const historia = state.historia || {};
    const anamnesis = state.anamnesis || {};
    const principal = state.diagnosticos.find(d => d.principal) || state.diagnosticos[0] || {};
    const asociados = state.diagnosticos.filter(d => d !== principal);
    const marcaTiempo = fechaHoraEcuador();

    /*
     MEJORA QUIRÚRGICA:
     Diagnóstico conserva su lógica original, pero completa el contexto
     de Apoyo IA con los datos que ya están cargados en el ERP.
     No modifica pacientes, historias, atenciones ni persistencia.
    */
    const idPaciente = texto(atencion.id_paciente || idPacienteActual());

    let pacienteRegistro = {};
    try{
      const listaPacientes =
        (typeof patients !== 'undefined' && Array.isArray(patients))
          ? patients
          : (Array.isArray(window.patients) ? window.patients : []);

      pacienteRegistro = listaPacientes.find(p =>
        texto(p?.id_paciente || p?.id) === idPaciente
      ) || {};
    }catch(e){
      pacienteRegistro = {};
    }

    /*
     Fuentes complementarias, solo lectura:
     - contexto unificado de Atenciones;
     - cita vinculada de Agenda;
     - catálogo de médicos ya cargado;
     - estado público de Anamnesis para la misma atención.
    */
    let contextoAtencion = {};
    try{
      if(typeof window.obtenerContextoAtencionActual === 'function'){
        contextoAtencion = window.obtenerContextoAtencionActual() || {};
      }else if(typeof window.getContextoAtencionActual === 'function'){
        contextoAtencion = window.getContextoAtencionActual() || {};
      }
    }catch(e){
      contextoAtencion = {};
    }

    const idAtencionContexto = texto(
      ctx.id ||
      state.atencionActual ||
      contextoAtencion.id_atencion ||
      atencion.id_atencion
    );

    const idCita = texto(
      atencion.id_cita ||
      contextoAtencion.id_cita ||
      window.auroCitaSeleccionadaAgenda?.id_cita
    );

    let citaRegistro = {};
    try{
      const listaCitas = Array.isArray(window.citasAgendaWeb)
        ? window.citasAgendaWeb
        : (typeof citasAgendaWeb !== 'undefined' && Array.isArray(citasAgendaWeb)
            ? citasAgendaWeb
            : []);

      citaRegistro = listaCitas.find(c =>
        texto(c?.id_cita || c?.id) === idCita
      ) || {};

      if(!Object.keys(citaRegistro).length){
        const raw = sessionStorage.getItem('auro_cita_seleccionada_agenda');
        const temporal = raw ? JSON.parse(raw) : {};
        if(
          temporal &&
          (!idCita || texto(temporal.id_cita) === idCita)
        ){
          citaRegistro = temporal;
        }
      }
    }catch(e){
      citaRegistro = {};
    }

    let anamnesisPublica = {};
    try{
      if(
        window.auroAnamnesis &&
        typeof window.auroAnamnesis.obtenerDatosAnamnesis === 'function'
      ){
        const candidata = window.auroAnamnesis.obtenerDatosAnamnesis() || {};
        if(
          !texto(candidata.id_atencion) ||
          texto(candidata.id_atencion) === idAtencionContexto
        ){
          anamnesisPublica = candidata;
        }
      }
    }catch(e){
      anamnesisPublica = {};
    }

    let medicoRegistro = {};
    try{
      const idMedico = texto(
        atencion.id_medico ||
        contextoAtencion.id_medico ||
        citaRegistro.id_medico ||
        citaRegistro.medico_id
      );

      const listaMedicos =
        (typeof medicosAgendaWeb !== 'undefined' && Array.isArray(medicosAgendaWeb))
          ? medicosAgendaWeb
          : (Array.isArray(window.medicosAgendaWeb) ? window.medicosAgendaWeb : []);

      medicoRegistro = listaMedicos.find(m =>
        texto(m?.id_medico || m?.id || m?.codigo) === idMedico
      ) || {};
    }catch(e){
      medicoRegistro = {};
    }

    const valorCampo = (...ids) => {
      for(const id of ids){
        const el = document.getElementById(id);
        if(!el) continue;
        const valor = texto(
          el.value !== undefined ? el.value : el.textContent
        );
        if(valor) return valor;
      }
      return '';
    };

    const textoOpcionPaciente = (() => {
      const select = document.getElementById('hcPacienteSelect');
      const opcion = select?.selectedOptions?.[0];
      return texto(opcion?.dataset?.nombre || opcion?.textContent);
    })();

    const nombrePaciente =
      valorPrimero(pacienteRegistro,[
        'nombre_completo','nombreCompleto','nombre','nombres',
        'nombre_paciente','paciente'
      ]) ||
      valorPrimero(atencion,[
        'nombre_paciente','paciente_nombre','nombre_completo',
        'nombreCompleto','nombre','nombres'
      ]) ||
      valorPrimero(historia,[
        'nombre_paciente','paciente_nombre','paciente',
        'nombre_completo','nombreCompleto','nombre','nombres'
      ]) ||
      textoOpcionPaciente;

    const identificacionPaciente =
      valorPrimero(pacienteRegistro,[
        'cedula','identificacion','documento','numero_documento'
      ]) ||
      valorPrimero(atencion,[
        'cedula','identificacion','documento','numero_documento'
      ]) ||
      valorPrimero(historia,[
        'cedula','identificacion','documento','numero_documento'
      ]) ||
      valorCampo('hcCedula');

    const edadPaciente =
      valorPrimero(pacienteRegistro,['edad']) ||
      valorPrimero(atencion,['edad']) ||
      valorPrimero(historia,['edad']) ||
      valorCampo('hcEdad');

    const sexoPaciente =
      valorPrimero(pacienteRegistro,['sexo','genero']) ||
      valorPrimero(atencion,['sexo','genero']) ||
      valorPrimero(historia,['sexo','genero']) ||
      valorCampo('hcSexo');

    const historiaClinica =
      valorPrimero(atencion,[
        'numero_historia','historia_clinica','id_historia'
      ]) ||
      valorPrimero(historia,[
        'numero_historia','historia_clinica','id_historia','id'
      ]) ||
      texto(window.auroHistoriaSeleccionadaId);

    const nombreProfesional =
      valorPrimero(atencion,[
        'nombre_profesional','profesional_nombre',
        'nombre_medico','medico_nombre','doctor_nombre',
        'medico','profesional','doctor'
      ]) ||
      valorPrimero(contextoAtencion,[
        'nombre_profesional','profesional_nombre',
        'nombre_medico','medico_nombre','doctor_nombre',
        'medico','profesional','doctor'
      ]) ||
      valorPrimero(citaRegistro,[
        'nombre_medico','medico_nombre','doctor_nombre',
        'medico','doctor'
      ]) ||
      valorPrimero(medicoRegistro,[
        'nombre_completo','nombreCompleto','nombre',
        'nombres','medico_nombre'
      ]) ||
      valorCampo(
        'hcProfesional',
        'hcMedico',
        'atencionProfesional',
        'atencionMedico'
      );

    const especialidadProfesional =
      valorPrimero(atencion,[
        'especialidad','especialidad_clinica','nombre_especialidad'
      ]) ||
      valorCampo(
        'hcEspecialidad',
        'atencionEspecialidad',
        'especialidadClinica'
      ) ||
      'Ginecología y Obstetricia';

    const tipoConsulta =
      valorPrimero(atencion,[
        'tipo_consulta','tipo_atencion','tipo',
        'modalidad_consulta','clase_consulta',
        'servicio','tipo_cita'
      ]) ||
      valorPrimero(contextoAtencion,[
        'tipo_consulta','tipo_atencion','tipo',
        'servicio','tipo_cita'
      ]) ||
      valorPrimero(citaRegistro,[
        'servicio','tipo_cita','tipo_consulta','motivo'
      ]) ||
      valorCampo(
        'hcTipoConsulta',
        'atencionTipoConsulta',
        'tipoConsulta'
      );

    const motivo =
      valorPrimero(anamnesisPublica,[
        'motivo_consulta','motivo','consulta_principal'
      ]) ||
      valorPrimero(anamnesis,[
        'motivo_consulta','motivo','consulta_principal'
      ]) ||
      valorCampo(
        'hcMotivoConsulta',
        'anamnesisMotivoConsulta',
        'motivoConsulta'
      ) ||
      valorPrimero(atencion,[
        'motivo_consulta','motivo','razon_consulta'
      ]) ||
      valorPrimero(historia,[
        'motivo_consulta','motivo'
      ]);

    const paciente = {
      id_paciente: idPaciente,
      nombre: nombrePaciente,
      identificacion: identificacionPaciente,
      edad: edadPaciente,
      sexo: sexoPaciente,
      historiaClinica
    };

    const profesional = {
      nombre: nombreProfesional,
      especialidad: especialidadProfesional
    };

    return {
      version: '1.0.2',
      modulo: 'Apoyo Cognitivo con IA',
      origen: 'diagnosticos.js',
      id_atencion: texto(ctx.id || state.atencionActual),
      id_paciente: paciente.id_paciente,
      id_historia: historiaClinica,
      numero_consulta: texto(ctx.numeroConsulta),
      zonaHoraria: 'America/Guayaquil',
      creadoEn: marcaTiempo.iso,
      fecha: marcaTiempo.fecha,
      hora: marcaTiempo.hora,
      paciente,
      profesional,
      consulta: {
        id_atencion: texto(ctx.id || state.atencionActual),
        numero: texto(ctx.numeroConsulta),
        especialidad: profesional.especialidad,
        tipo: tipoConsulta,
        motivo,
        resumenClinico: texto(document.getElementById('auroDxResumen')?.value || state.resumenClinico),
        analisisClinico: texto(document.getElementById('auroDxAnalisis')?.value || state.analisisClinico),
        conducta: texto(document.getElementById('auroDxConducta')?.value || state.conducta)
      },
      diagnostico: {
        principal: [principal.codigo_cie10, principal.descripcion].filter(Boolean).join(' - '),
        cie10: state.diagnosticos.map(d => texto(d.codigo_cie10)).filter(Boolean).join(', '),
        diferenciales: asociados.map(d => [d.codigo_cie10,d.descripcion].filter(Boolean).join(' - ')).filter(Boolean).join('\n'),
        lista: clonar(state.diagnosticos, [])
      },
      integracionClinica: {
        resumen: texto(document.getElementById('auroDxResumen')?.value || state.resumenClinico),
        analisis: texto(document.getElementById('auroDxAnalisis')?.value || state.analisisClinico),
        conducta: texto(document.getElementById('auroDxConducta')?.value || state.conducta),
        ultimaActualizacion: texto(state.ultimaActualizacion),
        ultimaEdicionLocal: texto(state.ultimaEdicionLocal)
      },
      fuentes: {
        pacienteDisponible: !!Object.keys(pacienteRegistro || {}).length,
        atencionDisponible: !!Object.keys(contextoAtencion || {}).length,
        citaDisponible: !!Object.keys(citaRegistro || {}).length,
        medicoDisponible: !!Object.keys(medicoRegistro || {}).length,
        historiaDisponible: !!state.historia,
        anamnesisDisponible:
          !!state.anamnesis ||
          !!Object.keys(anamnesisPublica || {}).length,
        examenFisicoDisponible: !!state.detalleExamen,
        especialidadesDisponibles: Object.keys(state.especialidades || {}).filter(k => !!state.especialidades[k])
      },
      persistencia: {
        estado: 'temporal',
        guardadoBaseDatos: false,
        hojaFutura: 'APOYO_IA'
      }
    };
  }

  function actualizarTarjetaApoyoIA(){
    const btn = document.getElementById('auroDxAbrirApoyoIA');
    const estado = document.getElementById('auroDxApoyoIAEstado');
    if(!btn || !estado) return;

    const hayAtencion = !!texto(state.atencionActual || idAtencionActiva());
    const hayContexto = !!texto(document.getElementById('auroDxResumen')?.value || state.resumenClinico);
    btn.disabled = !(hayAtencion && hayContexto);
    estado.classList.toggle('ready', hayAtencion && hayContexto);
    estado.innerHTML = hayAtencion && hayContexto
      ? '<i class="bi bi-check-circle-fill"></i><span>Contexto clínico integrado listo.</span>'
      : '<i class="bi bi-circle-fill"></i><span>Genere o sincronice la integración clínica.</span>';
  }

  function abrirApoyoIA(){
    if(!texto(state.atencionActual || idAtencionActiva())){
      mensaje('error','Seleccione o inicie una atención antes de abrir el apoyo cognitivo.');
      return;
    }

    const resumen = texto(document.getElementById('auroDxResumen')?.value || state.resumenClinico);
    if(!resumen){
      mensaje('aviso','Genere primero el resumen clínico integrado para preparar el contexto de IA.');
      document.getElementById('auroDxGenerar')?.focus();
      return;
    }

    try{
      const contexto = construirContextoApoyoIA();
      sessionStorage.setItem(APOYO_IA_SESSION_KEY, JSON.stringify(contexto));
      sessionStorage.setItem('aurosanax_url_diagnostico', window.location.href);
      sessionStorage.setItem('aurosanax_abrir_modulo', 'diagnostico');
      window.location.href = 'apoyoIA.html';
    }catch(error){
      console.error(MODULO + ': no se pudo preparar el contexto para Apoyo IA.', error);
      mensaje('error','No fue posible abrir el módulo de Apoyo Cognitivo.');
    }
  }

  function generarIntegracion(){
    if(!state.atencionActual){
      mensaje('error','No existe una atención activa.');
      return;
    }

    const campos = ['auroDxResumen','auroDxAnalisis','auroDxConducta']
      .map(id => document.getElementById(id))
      .filter(Boolean);

    const hayContenido = campos.some(campo => texto(campo.value));
    if(hayContenido){
      const continuar = window.confirm(
        'Ya existe contenido en la integración clínica.\n\n' +
        'Al generar nuevamente se reemplazarán los textos actuales.\n\n' +
        '¿Desea continuar?'
      );
      if(!continuar) return;
    }

    mensaje('aviso', state.diagnosticos.length ? 'Actualizando integración clínica con diagnósticos y datos disponibles…' : 'Generando resumen y razonamiento clínico preliminar con la información disponible…');

    state.resumenClinico = construirResumenClinico();
    state.analisisClinico = construirAnalisis();
    state.conducta = construirConducta();

    const r = document.getElementById('auroDxResumen');
    const a = document.getElementById('auroDxAnalisis');
    const c = document.getElementById('auroDxConducta');
    if(r) r.value = state.resumenClinico;
    if(a) a.value = state.analisisClinico;
    if(c) c.value = state.conducta;

    state.modoEdicion = false;
    state.cambiosPendientes = true;
    state.guardadoTemporalConfirmado = false;
    state.ultimaEdicionLocal = new Date().toISOString();
    guardarEstadoTemporal();
    actualizarEstadoEdicion();
    actualizarTarjetaApoyoIA();
    mensaje('ok', state.diagnosticos.length ? 'Integración clínica actualizada en modo protegido. Presione “Editar integración” para revisión médica.' : 'Resumen clínico preliminar generado en modo protegido. Podrá actualizarlo cuando registre los diagnósticos.');
  }

  async function consultarDetalleExamen(idAtencion){
    try{
      const data = await getJSON('listarDetalleExamenFisicoPorAtencion', {id_atencion:idAtencion});
      if(data && data.success === false) return null;
      return data || null;
    }catch(e){
      console.warn(MODULO + ': no se pudo consultar detalle del examen.', e);
      return null;
    }
  }

  async function consultarDiagnosticos(idAtencion){
    try{
      const data = await getJSON('listarDiagnosticosPorAtencion', {id_atencion:idAtencion});
      return normalizarDiagnosticosServidor(data);
    }catch(e){
      console.warn(MODULO + ': no se pudieron consultar diagnósticos.', e);
      return [];
    }
  }

  async function consultarAnamnesis(idAtencion){
    const id = texto(idAtencion);

    try{
      const candidatos = [
        window.auroAnamnesisState?.registroActual,
        window.auroAnamnesisState?.anamnesisActual,
        window.anamnesisState?.registroActual,
        window.anamnesisState?.anamnesisActual,
        window.anamnesisActual
      ].filter(Boolean);
      const local = candidatos.find(x => !id || texto(x?.id_atencion) === id) || candidatos[0];
      if(local && fuenteTieneDatos(local)) return clonar(local, local);
    }catch(e){}

    const acciones = [
      ['listarAnamnesisPorAtencion', {id_atencion:id}],
      ['obtenerAnamnesisPorAtencion', {id_atencion:id}],
      ['listarAnamnesisAtenciones', {id_atencion:id}]
    ];

    for(const [accion, parametros] of acciones){
      try{
        const data = await getJSON(accion, parametros);
        if(data && data.success === false) continue;
        const lista = arraySeguro(data);
        const registro = lista.find(x => texto(x?.id_atencion) === id) ||
          (data && typeof data === 'object' && !Array.isArray(data) ? data : null);
        if(registro && fuenteTieneDatos(registro)) return registro;
      }catch(e){}
    }

    const dom = {
      id_atencion:id,
      enfermedad_actual:getValue('hcEnfermedadActual'),
      anamnesis:getValue('hcAnamnesis')
    };
    return fuenteTieneDatos(dom.enfermedad_actual) || fuenteTieneDatos(dom.anamnesis) ? dom : null;
  }

  async function consultarHistoria(idPaciente, idAtencion){
    try{
      const data = await getJSON('listarHistoriasClinicas');
      const lista = arraySeguro(data);
      const porAtencion = lista.find(x => texto(x.id_atencion) === idAtencion);
      if(porAtencion) return porAtencion;

      const paciente = lista.filter(x => texto(x.id_paciente) === idPaciente);
      paciente.sort((a,b) => new Date(b.fecha_atencion || b.fecha || 0) - new Date(a.fecha_atencion || a.fecha || 0));
      return paciente[0] || null;
    }catch(e){
      return window.historiaActual || window.currentHistoria || null;
    }
  }

  async function consultarEspecialidad(accion, idAtencion){
    try{
      const data = await getJSON(accion);
      return arraySeguro(data).find(x => texto(x.id_atencion) === idAtencion) || null;
    }catch(e){
      return null;
    }
  }

  /*
    AUROSANAX DX - PROTOCOLOS NO BLOQUEANTES / CACHE TEMPORAL
    --------------------------------------------------------
    Objetivo:
    - Mantener exactamente los mismos endpoints y datos clínicos.
    - Evitar consultar repetidamente el mismo CIE-10 al cambiar de pestaña.
    - Consultar máximo 2 códigos simultáneamente para no saturar Apps Script.
    - Una sincronización forzada puede saltarse el cache.
    - No guarda ni aplica protocolos automáticamente.
  */
  const AURO_DX_PROTOCOLO_CACHE_TTL_MS = 120000;
  const auroDxProtocolosCache = new Map();

  function auroDxClaveProtocolo(codigo){
    return texto(codigo).replace(/\./g,'').toUpperCase();
  }

  function auroDxLeerCacheProtocolo(codigo){
    const clave = auroDxClaveProtocolo(codigo);
    const entrada = auroDxProtocolosCache.get(clave);
    if(!entrada) return null;

    if(Date.now() - Number(entrada.ts || 0) > AURO_DX_PROTOCOLO_CACHE_TTL_MS){
      auroDxProtocolosCache.delete(clave);
      return null;
    }

    return clonar(entrada.protocolos, []);
  }

  function auroDxGuardarCacheProtocolo(codigo, protocolos){
    const clave = auroDxClaveProtocolo(codigo);
    if(!clave) return;
    auroDxProtocolosCache.set(clave, {
      ts:Date.now(),
      protocolos:clonar(protocolos, [])
    });
  }

  async function auroDxConsultarProtocoloPorDiagnostico(dx, forzar){
    const codigo = auroDxClaveProtocolo(dx?.codigo_cie10);
    if(!codigo) return [];

    if(!forzar){
      const cache = auroDxLeerCacheProtocolo(codigo);
      if(cache !== null) return cache;
    }

    let salida = [];
    let consultaValida = false;

    try{
      const data = await getJSON('buscarProtocolosPorCie10', {
        codigo_cie10: codigo
      });
      consultaValida = true;
      salida = arraySeguro(data).map(p => normalizarProtocolo(p, dx));
    }catch(e){
      try{
        const unico = await getJSON('buscarProtocoloPorCie10', {
          codigo_cie10: codigo
        });

        consultaValida = true;

        if(unico && unico.success !== false){
          const lista = arraySeguro(unico);
          if(lista.length){
            salida = lista.map(p => normalizarProtocolo(p, dx));
          }else if(unico.id_protocolo || unico.codigo_cie10 || unico.nombre_protocolo){
            salida = [normalizarProtocolo(unico, dx)];
          }
        }
      }catch(error){
        /*
          No se cachea un fallo de red. Así una próxima carga puede reintentar.
        */
      }
    }

    if(consultaValida){
      auroDxGuardarCacheProtocolo(codigo, salida);
    }

    return salida;
  }

  async function consultarProtocolos(opciones){
    opciones = opciones || {};
    const forzar = opciones.forzar === true;

    const diagnosticos = (state.diagnosticos || [])
      .filter(dx => texto(dx?.codigo_cie10));

    if(!diagnosticos.length) return [];

    /*
      Pool controlado: máximo dos solicitudes CIE-10 simultáneas.
      Conserva el orden lógico de los diagnósticos en el resultado.
    */
    const resultadosPorIndice = new Array(diagnosticos.length).fill(null);
    let siguiente = 0;

    async function trabajador(){
      while(true){
        const indice = siguiente++;
        if(indice >= diagnosticos.length) return;

        resultadosPorIndice[indice] =
          await auroDxConsultarProtocoloPorDiagnostico(
            diagnosticos[indice],
            forzar
          );
      }
    }

    const totalTrabajadores = Math.min(2, diagnosticos.length);
    await Promise.all(
      Array.from({length:totalTrabajadores}, () => trabajador())
    );

    const resultados = resultadosPorIndice
      .flatMap(lista => Array.isArray(lista) ? lista : []);

    const vistos = new Set();
    return resultados.filter(p => {
      const clave = normalizar(
        (p.id_protocolo || '') + '|' + p.codigo_cie10 + '|' + p.nombre
      );
      if(vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  }

  function guardarEstadoTemporal(){
    const id = texto(state.atencionActual);
    if(!id) return;

    state.resumenClinico = texto(document.getElementById('auroDxResumen')?.value);
    state.analisisClinico = texto(document.getElementById('auroDxAnalisis')?.value);
    state.conducta = texto(document.getElementById('auroDxConducta')?.value);

    state.cache[id] = {
      resumenClinico: state.resumenClinico,
      analisisClinico: state.analisisClinico,
      conducta: state.conducta,
      protocoloSeleccionado: state.protocoloSeleccionado,
      ultimaActualizacion: new Date().toISOString(),
      modoEdicion: state.modoEdicion,
      cambiosPendientes: state.cambiosPendientes,
      guardadoTemporalConfirmado: state.guardadoTemporalConfirmado,
      ultimaEdicionLocal: state.ultimaEdicionLocal
    };
  }
  function restaurarEstadoTemporal(id){
    const cache = state.cache[id];
    if(!cache) return;

    state.resumenClinico = texto(cache.resumenClinico);
    state.analisisClinico = texto(cache.analisisClinico);
    state.conducta = texto(cache.conducta);
    state.protocoloSeleccionado = Number.isInteger(cache.protocoloSeleccionado) ? cache.protocoloSeleccionado : null;
    state.modoEdicion = cache.modoEdicion === true;
    state.cambiosPendientes = cache.cambiosPendientes === true;
    state.guardadoTemporalConfirmado = cache.guardadoTemporalConfirmado === true;
    state.ultimaEdicionLocal = texto(cache.ultimaEdicionLocal || cache.ultimaActualizacion);

    const r = document.getElementById('auroDxResumen');
    const a = document.getElementById('auroDxAnalisis');
    const c = document.getElementById('auroDxConducta');
    if(r) r.value = state.resumenClinico;
    if(a) a.value = state.analisisClinico;
    if(c) c.value = state.conducta;
    actualizarEstadoEdicion();
  }

  function limpiarVisual(){
    state.diagnosticos = [];
    state.detalleExamen = null;
    state.historia = null;
    state.anamnesis = null;
    state.especialidades = {};
    state.protocolos = [];
    state.protocoloSeleccionado = null;
    state.resumenClinico = '';
    state.analisisClinico = '';
    state.conducta = '';
    state.modoEdicion = false;
    state.cambiosPendientes = false;
    state.guardadoTemporalConfirmado = false;
    state.ultimaEdicionLocal = '';

    ['auroDxResumen','auroDxAnalisis','auroDxConducta'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });

    renderDiagnosticos();
    renderProtocolos();
    renderFuentes();
    const btn = document.getElementById('auroDxAplicarPlan');
    if(btn) btn.disabled = true;
    actualizarEstadoEdicion();
    actualizarTarjetaApoyoIA();
    renderContextoSuperior();
    optimizarTitulosResumenExistente();
  }


  /* ==========================================================
     AUROSANAX FIX QUIRÚRGICO - LIMPIEZA CIE ENTRE ATENCIONES
     2026-08-11
     ----------------------------------------------------------
     Alcance exclusivo:
     - Limpia el editor CIE-10 temporal al cerrar/cambiar de atención.
     - Evita que diagnósticos locales de la atención anterior se fusionen
       con la siguiente atención.
     - No guarda, elimina ni modifica registros persistidos.
     - No toca Apps Script, Google Sheets, Plan, Recetas ni Examen Físico.
     ========================================================== */
  function limpiarEditorCie10Consulta(){
    /* Estado temporal compartido con el editor CIE de examenfisico.js. */
    window.hcDiagnosticosSeleccionados = [];
    window.hcDxResultadosActuales = [];

    /* Compatibilidad con las variables globales históricas del editor. */
    try{
      hcDiagnosticosSeleccionados = window.hcDiagnosticosSeleccionados;
    }catch(_e){}
    try{
      hcDxResultadosActuales = window.hcDxResultadosActuales;
    }catch(_e){}

    /* Limpia únicamente los campos variables del editor CIE. */
    ['hcDxCodigoBuscar','hcDxNombreBuscar'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });

    const resultados = document.getElementById('hcDxResultadosBody');
    if(resultados){
      resultados.innerHTML = '<tr><td colspan="3" class="diagnostico-empty">Sin Registros</td></tr>';
    }

    /* Reutiliza el render y sincronización oficiales del editor. */
    try{
      if(typeof window.renderDiagnosticosSeleccionados === 'function'){
        window.renderDiagnosticosSeleccionados();
      }else if(typeof renderDiagnosticosSeleccionados === 'function'){
        renderDiagnosticosSeleccionados();
      }
    }catch(error){
      console.warn(MODULO + ': no se pudo limpiar la tabla superior CIE-10.', error);
    }

    try{
      if(typeof window.sincronizarDiagnosticosConCamposHistoria === 'function'){
        window.sincronizarDiagnosticosConCamposHistoria();
      }else if(typeof sincronizarDiagnosticosConCamposHistoria === 'function'){
        sincronizarDiagnosticosConCamposHistoria();
      }
    }catch(error){
      console.warn(MODULO + ': no se pudieron limpiar los campos compatibles CIE-10.', error);
    }

    /* El visor inteligente puede conservar su propio STATE; se oculta para
       impedir que el protocolo de la atención cerrada permanezca visible. */
    try{
      if(typeof window.auroCie10InteligenteOcultar === 'function'){
        window.auroCie10InteligenteOcultar();
      }
    }catch(_e){}
  }

  function limpiarContextoHistoriaNueva(){
    auroDxRestaurarPuenteGuardadoCorreccion();
    state.correccionClinicaActiva = false;
    state.correccionClinicaMeta = null;

    /*
      Limpieza exclusivamente en memoria y visual.
      No elimina cache histórico de otras atenciones, no llama Apps Script
      y no modifica diagnósticos persistidos.
    */
    state.atencionActual = '';
    state.cargando = false;
    state.ultimaActualizacion = '';
    limpiarVisual();
    limpiarEditorCie10Consulta();

    status('Sin atención activa');
    mensaje(
      'aviso',
      'Historia nueva: Diagnóstico permanecerá limpio hasta crear o seleccionar una atención.'
    );

    const contexto = document.getElementById('auroDxContextoSuperior');
    if(contexto){
      contexto.innerHTML = `
        <div class="auro-dx-contexto-main">
          <div class="auro-dx-contexto-icon"><i class="bi bi-journal-medical"></i></div>
          <div class="auro-dx-contexto-copy">
            <div class="auro-dx-contexto-kicker">DIAGNÓSTICO DE LA CONSULTA</div>
            <div class="auro-dx-contexto-title">Historia nueva</div>
            <div class="auro-dx-contexto-id">Sin atención seleccionada</div>
          </div>
          <div class="auro-dx-contexto-state historica">
            <i class="bi bi-hourglass-split"></i>
            Pendiente de crear atención
          </div>
        </div>
      `;
    }

    actualizarTarjetaApoyoIA();
  }


  async function cargarAtencion(idAtencion, forzar){
    asegurarApp();

    if(historiaNuevaSinAtencion()){
      limpiarContextoHistoriaNueva();
      return null;
    }

    idAtencion = texto(idAtencion || idAtencionActiva());

    if(state.atencionActual && state.atencionActual !== idAtencion){
      state.edicionDiagnosticoAbierto = false;
    }

    if(!idAtencion){
      state.atencionActual = '';
      state.idCargaEnCurso = '';
      state.promesaCarga = null;
      limpiarVisual();
      status('Sin atención activa');
      mensaje('','');
      return null;
    }

    /*
      Si dos señales del ERP solicitan simultáneamente la misma atención,
      se reutiliza la carga en curso. Esto evita llamadas duplicadas sin
      impedir cambiar inmediatamente a otra atención.
    */
    if(
      state.cargando &&
      state.idCargaEnCurso === idAtencion &&
      state.promesaCarga
    ){
      return state.promesaCarga;
    }

    /*
      Al regresar a Diagnóstico dentro de la misma atención se conserva
      la información ya cargada en memoria. El botón “Sincronizar datos”
      continúa forzando una lectura nueva porque envía forzar=true.
    */
    if(
      !forzar &&
      state.atencionActual === idAtencion &&
      state.ultimaActualizacion
    ){
      renderDiagnosticos();
      renderProtocolos();
      renderFuentes();
      restaurarEstadoTemporal(idAtencion);
      actualizarEstadoEdicion();
      actualizarTarjetaApoyoIA();
      renderContextoSuperior();
      optimizarTitulosResumenExistente();
      return state;
    }

    if(state.atencionActual && state.atencionActual !== idAtencion){
      guardarEstadoTemporal();
    }

    /*
      Cada nueva atención recibe un token único. Si el usuario cambia rápido
      entre Atención 1, 2 y 3, las respuestas tardías de una consulta anterior
      se descartan y nunca reemplazan la atención actualmente seleccionada.
    */
    const tokenCarga = Number(state.cargaToken || 0) + 1;
    state.cargaToken = tokenCarga;
    state.cargando = true;
    state.idCargaEnCurso = idAtencion;
    state.atencionActual = idAtencion;

    status('Cargando diagnóstico de la atención ' + idAtencion + '…');
    mensaje('','');
    limpiarVisual();
    state.atencionActual = idAtencion;

    const cargaSigueVigente = () =>
      state.cargaToken === tokenCarga &&
      state.atencionActual === idAtencion;

    const ejecutarCarga = async () => {
      try{
        const idPaciente = idPacienteActual();

        /*
          FASE 1 — CARGA RÁPIDA
          El diagnóstico guardado se consulta y se muestra primero.
          La integración clínica pesada continúa después sin bloquearlo.
        */
        const promesaDiagnosticos = consultarDiagnosticos(idAtencion);

        /*
          FASE 2 — INTEGRACIÓN CLÍNICA
          Estas lecturas continúan en paralelo: examen, historia, anamnesis
          y especialidades. No se cambia su fuente ni su estructura.
        */
        const promesaIntegracion = Promise.all([
          consultarDetalleExamen(idAtencion),
          consultarHistoria(idPaciente, idAtencion),
          consultarAnamnesis(idAtencion),
          consultarEspecialidad('listarGinecologia', idAtencion),
          consultarEspecialidad('listarObstetricia', idAtencion),
          consultarEspecialidad('listarEstetica', idAtencion)
        ]);

        const dxServidor = await promesaDiagnosticos;
        if(!cargaSigueVigente()) return null;

        state.diagnosticos = fusionarDiagnosticos(
          dxServidor,
          diagnosticosLocales()
        );

        /*
          El CIE-10 aparece inmediatamente, antes de esperar antecedentes,
          anamnesis, examen físico, especialidades y protocolos.
        */
        renderDiagnosticos();
        sincronizarEditorCie10DesdeDiagnosticos();
        restaurarEstadoTemporal(idAtencion);
        actualizarEstadoEdicion();
        actualizarTarjetaApoyoIA();
        renderContextoSuperior();
        optimizarTitulosResumenExistente();

        const atencionInicial = atencionActiva() || {};
        const numeroInicial = texto(
          atencionInicial.numero_consulta ||
          atencionInicial.numero_atencion ||
          atencionInicial.numero
        );

        status(
          (numeroInicial ? 'Consulta #' + numeroInicial + ' · ' : '') +
          'Diagnóstico cargado · completando integración clínica…'
        );

        const [
          detalle,
          historia,
          anamnesis,
          ginecologia,
          obstetricia,
          estetica
        ] = await promesaIntegracion;

        if(!cargaSigueVigente()) return null;

        state.detalleExamen = detalle;
        state.historia = historia;
        state.anamnesis = anamnesis;
        state.especialidades = {ginecologia, obstetricia, estetica};

        /*
          Respaldo original: si la consulta directa no devolvió diagnósticos,
          se leen los diagnósticos incluidos en el detalle del examen físico.
        */
        if(!state.diagnosticos.length){
          state.diagnosticos = fusionarDiagnosticos(
            normalizarDiagnosticosServidor(detalle?.diagnosticos),
            diagnosticosLocales()
          );
          renderDiagnosticos();
          sincronizarEditorCie10DesdeDiagnosticos();
        }

        renderFuentes();

        /*
          Los protocolos se consultan después de mostrar el diagnóstico y
          completar las fuentes clínicas. Su demora ya no bloquea el CIE-10.
        */
        state.protocolos = await consultarProtocolos({forzar: !!forzar});
        if(!cargaSigueVigente()) return null;

        /*
          AUROSANAX DIAGNÓSTICO 17:
          Señal visual de solo lectura para que Plan pueda presentar,
          agrupadas por CIE-10, las sugerencias ya consultadas.
          No guarda, no aplica y no modifica ningún protocolo.
        */
        try{
          document.dispatchEvent(new CustomEvent('aurosanax:protocolos-diagnostico-listos', {
            detail: {
              id_atencion: idAtencion,
              diagnosticos: clonar(state.diagnosticos, []),
              protocolos: clonar(state.protocolos, [])
            }
          }));
        }catch(_e){}

        if(state.protocolos.length && state.protocoloSeleccionado === null){
          state.protocoloSeleccionado = 0;
        }

        renderDiagnosticos();
        sincronizarEditorCie10DesdeDiagnosticos();
        renderProtocolos();
        renderFuentes();
        restaurarEstadoTemporal(idAtencion);
        actualizarEstadoEdicion();
        actualizarTarjetaApoyoIA();

        state.ultimaActualizacion = new Date().toISOString();

        const atencion = atencionActiva() || {};
        const numeroConsulta = texto(
          atencion.numero_consulta ||
          atencion.numero_atencion ||
          atencion.numero
        );

        status(
          (numeroConsulta ? 'Consulta #' + numeroConsulta + ' · ' : '') +
          'Atención ' + idAtencion + ' · ' +
          state.diagnosticos.length + ' diagnóstico(s)'
        );

        renderContextoSuperior();
        optimizarTitulosResumenExistente();

        if(!state.diagnosticos.length){
          mensaje(
            'aviso',
            'Aún no se han registrado diagnósticos. Puede generar el resumen clínico con la anamnesis y los datos disponibles.'
          );
        }else{
          mensaje(
            'ok',
            'Información clínica sincronizada correctamente. La integración puede actualizarse con los diagnósticos registrados.'
          );
        }

        return state;
      }catch(error){
        if(!cargaSigueVigente()) return null;

        console.error(MODULO + ': error cargando atención.', error);
        mensaje(
          'error',
          'No se pudo completar la sincronización: ' + error.message
        );
        status('Error de sincronización');
        return null;
      }finally{
        /*
          Una carga antigua nunca puede apagar el indicador de una carga más
          reciente. Solo la solicitud vigente libera el estado de carga.
        */
        if(state.cargaToken === tokenCarga){
          state.cargando = false;
          state.idCargaEnCurso = '';
          state.promesaCarga = null;
        }
      }
    };

    state.promesaCarga = ejecutarCarga();
    return state.promesaCarga;
  }

  async function cargarAtencionActual(forzar){
    return cargarAtencion(idAtencionActiva(), !!forzar);
  }

  function agregarMedicamentosAlPlan(items){
    if(!items || !items.length) return 0;
    const destino = Array.isArray(window.medicamentosPlanSeleccionados)
      ? window.medicamentosPlanSeleccionados
      : Array.isArray(window.medicamentosSeleccionados)
        ? window.medicamentosSeleccionados
        : null;

    if(!destino) return 0;
    let total = 0;

    items.forEach(item => {
      const nombre = typeof item === 'string' ? item : texto(item.nombre || item.medicamento);
      if(!nombre) return;
      if(destino.some(x => normalizar(x.nombre || x.medicamento || x) === normalizar(nombre))) return;

      destino.push(typeof item === 'object' ? Object.assign({}, item) : {
        nombre,
        dosis:'',
        via:'',
        frecuencia:'',
        duracion:'',
        indicaciones:'',
        origen:'Protocolo Diagnósticos'
      });
      total++;
    });

    try{
      if(typeof window.renderMedicamentosPlanTabla === 'function') window.renderMedicamentosPlanTabla();
    }catch(e){}
    return total;
  }

  function categoriaOrden(nombre){
    const n = normalizar(nombre);
    if(/eco|radiograf|tomograf|resonancia|mamograf|doppler|imagen/.test(n)) return 'IMÁGENES';
    if(/biops|citolog|papanic|patolog/.test(n)) return 'PATOLOGÍA';
    if(/hemograma|glucosa|orina|cultivo|perfil|hormona|serolog|laboratorio/.test(n)) return 'LABORATORIO';
    return 'OTROS';
  }

  function agregarOrdenesAlPlan(items){
    if(!items || !items.length) return 0;
    const destino = Array.isArray(window.ordenesMedicasPlanSeleccionadas)
      ? window.ordenesMedicasPlanSeleccionadas
      : Array.isArray(window.ordenesMedicasSeleccionadas)
        ? window.ordenesMedicasSeleccionadas
        : null;

    if(!destino) return 0;
    let total = 0;

    items.forEach(item => {
      const nombre = typeof item === 'string' ? item : texto(item.nombre || item.orden);
      if(!nombre) return;
      if(destino.some(x => normalizar(x.nombre || x.orden || x) === normalizar(nombre))) return;

      destino.push(typeof item === 'object' ? Object.assign({}, item) : {
        categoria: categoriaOrden(nombre),
        nombre,
        observacion:'Sugerido desde módulo Diagnósticos'
      });
      total++;
    });

    try{
      if(typeof window.renderOrdenesMedicasTabla === 'function') window.renderOrdenesMedicasTabla();
    }catch(e){}
    return total;
  }

  async function aplicarAlPlan(){
    const ctx = contextoAtencionSeleccionada();

    if(!puedeAplicarAlPlan()){
      mensaje(
        'error',
        'El Plan solo puede prepararse desde una atención activa o desde una corrección clínica histórica habilitada.'
      );
      configurarModoProtocoloMaestro();
      return;
    }

    if(!state.protocolos.length){
      mensaje(
        'aviso',
        'No hay sugerencias de protocolo disponibles para transferir al Plan.'
      );
      return;
    }

    if(state.cambiosPendientes){
      const continuarPendiente = window.confirm(
        'La integración clínica tiene cambios pendientes de confirmación temporal.\n\n' +
        'Puede continuar al Plan para revisar las sugerencias; este paso no guardará ni aplicará automáticamente medicamentos u órdenes.\n\n' +
        '¿Desea continuar?'
      );
      if(!continuarPendiente) return;
    }

    /*
      AUROSANAX 2026-08-23 — HANDOFF QUIRÚRGICO DIAGNÓSTICO → PLAN
      -------------------------------------------------------------
      Diagnóstico ya consultó y normalizó los protocolos por CIE-10.
      Plan dispone de sus propias tarjetas para seleccionar medicamentos,
      órdenes, procedimientos e indicaciones. Por tanto, este botón deja de
      duplicar esa aplicación y deja de esperar guardados/remapeos que Plan
      puede resolver en su propio flujo.
      NO guarda diagnóstico, NO aplica medicamentos, NO aplica órdenes,
      NO modifica Plan, NO toca Recetas y NO altera la corrección histórica.
    */
    try{
      document.dispatchEvent(new CustomEvent(
        'aurosanax:protocolos-diagnostico-listos',
        {
          detail:{
            id_atencion: state.atencionActual,
            diagnosticos: clonar(state.diagnosticos, []),
            protocolos: clonar(state.protocolos, [])
          }
        }
      ));
    }catch(error){
      console.warn(
        MODULO + ': no se pudo reenviar inmediatamente las sugerencias al Plan.',
        error
      );
    }

    /*
      Sincronización no bloqueante:
      mantiene el contexto por id_atencion, pero no obliga al usuario a esperar
      su resolución antes de abrir Plan.
    */
    try{
      if(typeof window.cambiarPlanPorAtencion === 'function'){
        Promise.resolve(
          window.cambiarPlanPorAtencion(state.atencionActual)
        ).catch(error => {
          console.warn(
            MODULO + ': la sincronización de Plan continuó en segundo plano.',
            error
          );
        });
      }
    }catch(error){
      console.warn(
        MODULO + ': no se pudo iniciar la sincronización de Plan en segundo plano.',
        error
      );
    }

    guardarEstadoTemporal();

    mensaje(
      'ok',
      'Sugerencias preparadas para el Plan. Seleccione allí únicamente los medicamentos, órdenes e indicaciones que correspondan.'
    );

    /*
      Navegación inmediata al Plan.
      Usa primero la navegación oficial del ERP y conserva un fallback
      limitado al mismo botón existente del menú.
    */
    try{
      if(typeof window.navegarAtencionActiva === 'function'){
        window.navegarAtencionActiva('hc_plan');
        return;
      }

      const botonPlan = Array.from(
        document.querySelectorAll('button')
      ).find(btn =>
        String(btn.getAttribute('onclick') || '')
          .includes("navegarAtencionActiva('hc_plan'")
      );

      if(botonPlan){
        botonPlan.click();
        return;
      }

      const plan = document.getElementById('hc_plan');
      if(plan){
        plan.scrollIntoView({behavior:'smooth', block:'start'});
      }
    }catch(error){
      console.warn(
        MODULO + ': las sugerencias quedaron disponibles, pero no se pudo navegar automáticamente al Plan.',
        error
      );
    }
  }

  function cambiarPorAtencion(idAtencion){
    idAtencion = texto(idAtencion);

    if(
      state.correccionClinicaActiva &&
      state.atencionActual &&
      idAtencion &&
      texto(state.atencionActual) !== idAtencion
    ){
      auroDxRestaurarPuenteGuardadoCorreccion();
      state.correccionClinicaActiva = false;
      state.correccionClinicaMeta = null;
    }

    /*
      El evento de Atenciones contiene el id maestro. Se registra primero para
      evitar que un estado residual de historia nueva o de la consulta anterior
      bloquee la sincronización.
    */
    if(idAtencion){
      state.atencionActual = idAtencion;
      window.auroAtencionSeleccionadaId = idAtencion;
    }

    if(historiaNuevaSinAtencion()){
      limpiarContextoHistoriaNueva();
      return null;
    }

    if(!idAtencion) return;
    return cargarAtencion(idAtencion, true);
  }

  function instalarEventos(){
    if(window.__auroDiagnosticosEventosInstalados) return;
    window.__auroDiagnosticosEventosInstalados = true;

    ['aurosanax:atencion-iniciada','aurosanax:atencion-seleccionada','aurosanax:atencion-actualizada'].forEach(nombre => {
      const receptor = e => {
        const id = texto(
          e?.detail?.id_atencion ||
          e?.detail?.atencion?.id_atencion ||
          idAtencionActiva()
        );
        if(id) cambiarPorAtencion(id);
      };

      /*
        ATENCIONES emite estos CustomEvent con window.dispatchEvent().
        La versión anterior escuchaba únicamente document y nunca recibía
        el cambio de consulta. Se escucha window y document por compatibilidad.
      */
      window.addEventListener(nombre, receptor);
      document.addEventListener(nombre, receptor);
    });

    document.addEventListener('aurosanax:diagnosticos-actualizados', () => {
      if(historiaNuevaSinAtencion()){
        limpiarContextoHistoriaNueva();
        return;
      }
      cargarAtencionActual(true);
    });

    /*
      Señales emitidas por Pacientes/Atenciones al abrir una historia nueva.
      Diagnóstico se limpia y queda bloqueado hasta que exista id_atencion.
    */
    window.addEventListener('aurosanax:historia-nueva', limpiarContextoHistoriaNueva);
    document.addEventListener('aurosanax:historia-nueva', limpiarContextoHistoriaNueva);
    window.addEventListener('aurosanax:atencion-limpiada', limpiarContextoHistoriaNueva);
    document.addEventListener('aurosanax:atencion-limpiada', limpiarContextoHistoriaNueva);

    document.addEventListener('click', e => {
      const btn = e.target?.closest?.('button,a,[role="tab"]');
      if(!btn) return;
      const label = normalizar(btn.textContent || btn.getAttribute('aria-label') || btn.title);
      const target = normalizar(btn.dataset?.target || btn.getAttribute('href') || '');
      if(label.includes('diagnost') || target.includes('diagnost')){
        if(historiaNuevaSinAtencion()){
          setTimeout(limpiarContextoHistoriaNueva, 20);
          return;
        }
        setTimeout(() => cargarAtencionActual(false), 50);
      }
    }, true);

    if(!window.__auroDxTitulosObserver){
      window.__auroDxTitulosObserver = new MutationObserver(() => {
        optimizarTitulosResumenExistente();
      });
      const panel = document.getElementById('hc_diagnostico') || buscarPanelExistente();
      if(panel) window.__auroDxTitulosObserver.observe(panel, {childList:true, subtree:true});
    }

    window.addEventListener('beforeunload', guardarEstadoTemporal);
  }

  function inicializar(){
    /*
      AUROSANAX FIX 1.1.0:
      Asegurar siempre el montaje. Antes, si la primera inicialización ocurría
      cuando el panel todavía no existía, state.inicializado quedaba en true
      y la interfaz nunca volvía a construirse.
    */
    const app = asegurarApp();
    instalarEventos();

    /*
      Instala el handoff rápido del botón CIE-10 si el visor ya está cargado.
      Si el orden de scripts todavía no lo permite, los reintentos de load
      completan la instalación sin bloquear el arranque.
    */
    auroDxInstalarHandoffCie10Global();

    if(!app){
      state.inicializado = false;
      setTimeout(inicializar, 250);
      return;
    }

    state.inicializado = true;

    if(historiaNuevaSinAtencion()){
      limpiarContextoHistoriaNueva();
      console.log(MODULO + ' v' + VERSION + ' [' + RELEASE + '] cargado en modo historia nueva.');
      return;
    }

    const id = idAtencionActiva();
    if(id){
      cargarAtencion(id, false);
    }else{
      status('Sin atención activa');
      renderDiagnosticos();
      renderProtocolos();
      renderFuentes();
      actualizarTarjetaApoyoIA();
      mensaje('aviso','Seleccione o inicie una consulta para cargar la información diagnóstica.');
    }

    console.log(MODULO + ' v' + VERSION + ' [' + RELEASE + '] cargado correctamente.');
  }

  window.auroDxIniciarCorreccionHistorica = auroDxIniciarCorreccionHistorica;
  window.auroDxGuardarCorreccionHistorica = auroDxGuardarCorreccionHistorica;
  window.auroDxCancelarCorreccionHistorica = auroDxCancelarCorreccionHistorica;

  window.auroDiagnosticos = {
    version: VERSION,
    state,
    inicializar,
    cargar: cargarAtencion,
    cargarActual: cargarAtencionActual,
    cambiarPorAtencion,
    actualizar: () => cargarAtencionActual(true),
    generarIntegracion,
    alternarEdicionClinica,
    guardarIntegracionTemporal,
    aplicarAlPlan,
    limpiar: limpiarVisual,
    obtenerDiagnosticos: () => clonar(state.diagnosticos, []),
    obtenerAnamnesis: () => clonar(state.anamnesis, null),
    obtenerProtocolos: () => clonar(state.protocolos, []),
    obtenerEstado: () => clonar(state, {}),
    montarInterfaz: asegurarApp,
    copiarCampo,
    abrirCampoAmpliado,
    alternarGuia,
    abrirProtocoloMaestro,
    renderContextoSuperior,
    puedeAplicarAlPlan,
    construirContextoApoyoIA,
    abrirApoyoIA,
    actualizarTarjetaApoyoIA,
    limpiarContextoHistoriaNueva,
    sincronizarEditorCie10DesdeDiagnosticos
  };

  window.cambiarDiagnosticosPorAtencion = cambiarPorAtencion;
  window.auroCargarDiagnosticosPorAtencion = cargarAtencion;
  window.auroActualizarDiagnosticos = () => cargarAtencionActual(true);
  window.auroGenerarIntegracionDiagnostica = generarIntegracion;
  window.auroAplicarDiagnosticoAlPlan = aplicarAlPlan;
  window.auroAbrirApoyoIA = abrirApoyoIA;
  window.auroLimpiarDiagnosticosParaHistoriaNueva = limpiarContextoHistoriaNueva;
  window.auroSincronizarEditorCie10DesdeDiagnosticos =
    sincronizarEditorCie10DesdeDiagnosticos;

  window.iasynDiagnosticos = window.auroDiagnosticos;
  window.auroDiagnosticosModuloCargado = true;

  function arrancarDiagnosticos(){
    try{
      asegurarApp();
      inicializar();
    }catch(error){
      console.error(MODULO + ': fallo de arranque.', error);
      setTimeout(arrancarDiagnosticos, 300);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', arrancarDiagnosticos, {once:true});
  }else{
    arrancarDiagnosticos();
  }

  /*
    Reintentos acotados de compatibilidad por orden de carga.
    No usan MutationObserver ni polling permanente.
  */
  [0, 250, 800].forEach(ms => {
    setTimeout(auroDxInstalarHandoffCie10Global, ms);
  });

  /* Segundo intento después de terminar de cargar todos los scripts externos. */
  window.addEventListener('load', () => {
    setTimeout(() => {
      try{
        auroDxInstalarHandoffCie10Global();
        asegurarApp();
        inicializar();
      }catch(error){
        console.error(MODULO + ': fallo en segundo montaje.', error);
      }
    }, 120);
  }, {once:true});
})();

/* =====================================================================
   AUROSANAX DIAGNÓSTICOS — OPTIMIZACIÓN QUIRÚRGICA DE SINCRONIZACIÓN
   Fecha: 2026-08-03

   CAMBIOS EXCLUSIVOS:
   - El diagnóstico CIE-10 se muestra antes que la integración clínica.
   - Examen, historia, anamnesis y especialidades cargan en paralelo.
   - Los protocolos ya no bloquean la visualización inicial del diagnóstico.
   - Se reutiliza una solicitud duplicada de la misma atención.
   - Se permite cambiar inmediatamente a otra atención durante una carga.
   - Las respuestas tardías de atenciones anteriores son descartadas.
   - Al volver a Diagnóstico dentro de la misma atención se usa memoria.
   - “Sincronizar datos” conserva la recarga forzada original.

   NO MODIFICADO:
   - Guardado de diagnóstico.
   - Aplicación de protocolo al Plan.
   - Plan, Recetas, Examen Físico, Anamnesis, Antecedentes o Apoyo IA.
   - Apps Script, Google Sheets, JSON, botones, HTML o CSS.
===================================================================== */
