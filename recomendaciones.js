/***********************************************************************
 IASYN ERP
 Archivo: recomendaciones.js
 Módulo: Recomendaciones clínicas por atención
 Versión: 1.5.5 — reserva de firma estilo Certificados; A4 y lectura blindadas (candidata)
 Fecha: 2026-09-10
 -----------------------------------------------------------------------
 ARQUITECTURA
 - Módulo funcional independiente.
 - Historial con varias recomendaciones independientes por id_atencion.
 - detalle_json compacto para contenido variable.
 - Contexto clínico derivado desde la atención real.
 - Diagnósticos solo se leen; NO se duplican ni se modifican.
 - Consulta histórica: solo lectura.
 - Atención activa: editable.
 - Responsive: escritorio, tablet, iPhone y Android.
 - No modifica Plan, Recetas, Diagnóstico, Examen Físico ni Historia.
************************************************************************/

(function(){
  'use strict';

  if(window.auroRecomendaciones && window.auroRecomendaciones.version){
    console.warn('IASYN RECOMENDACIONES: módulo ya cargado.');
    return;
  }

  const MODULO = 'IASYN RECOMENDACIONES';
  const VERSION = '1.5.5-RECOMENDACIONES-ANCLA-FIRMA-HTML';
  const JSON_VERSION = 'IASYN_RECOMENDACIONES_JSON_V1';
  const RELEASE = '20261029_iasyn2_recomendaciones_firma_html_a4_v155_candidata';

  /*
    IASYN - COMPATIBILIDAD INTERNA TEMPORAL
    ---------------------------------------
    Los eventos `aurosanax:*`, algunas claves localStorage `aurosanax_*`
    y objetos `window.auro*` que permanecen en este archivo son contratos
    internos heredados compartidos con Atenciones, Diagnóstico, Plan e index.
    No representan una conexión directa con AUROSANAX PRUEBA.
    Su migración debe hacerse coordinadamente para evitar regresiones.
  */

  const state = {
    idAtencion: '',
    idRecomendacion: '',
    contexto: null,
    diagnosticos: [],
    registro: null,
    registros: [],
    modoNuevo: false,
    verificandoFirma: false,
    firmaVerificacionFallida: false,
    cargando: false,
    guardando: false,
    inicializado: false,
    tokenCarga: 0,
    tokenGuardado: 0,
    firmaPersistida: '',
    firmaPersistidaAtencion: ''
  };

  /*
    IASYN RECOMENDACIONES — FIRMA ELECTRÓNICA V1
    ------------------------------------------------------------
    Estado aislado de firma. No reemplaza state.firmaPersistida:
    - state.firmaPersistida = huella clínica usada por el guardado no-op.
    - recomendacionFirmasPorDocumento = estado persistente de firma electrónica.
    - recomendacionFirmaProcesos = solicitudes operativas en curso.
  */
  const recomendacionFirmasPorDocumento = new Map();
  const recomendacionFirmaProcesos = new Map();
  let recomendacionFirmaSyncToken = 0;
  let recomendacionFirmaHistorialToken = 0; // Aísla comprobación masiva de la comprobación del documento abierto.
  let recomendacionFirmaLogoCache = null;
  let recomendacionFirmaLogoPromesa = null;

  const ALERTAS = [
    ['fiebre','Fiebre que no cede'],
    ['dolor','Dolor intenso o que no cede'],
    ['sangrado','Sangrado anormal o abundante'],
    ['dificultad_respiratoria','Dificultad respiratoria'],
    ['vomito','Vómitos persistentes'],
    ['diarrea','Diarrea persistente'],
    ['mareo_desmayo','Mareo intenso o desmayo'],
    ['deterioro_general','Deterioro del estado general']
  ];

  const INFECCION = [
    ['fiebre_infeccion','Fiebre o escalofríos'],
    ['dolor_local','Dolor local en aumento'],
    ['enrojecimiento','Enrojecimiento progresivo'],
    ['inflamacion','Inflamación importante'],
    ['secrecion','Secreción anormal o purulenta'],
    ['mal_olor','Mal olor'],
    ['calor_local','Aumento de calor local']
  ];

  function txt(v){ return String(v === null || v === undefined ? '' : v).trim(); }

  function norm(v){
    return txt(v)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/\s+/g,' ')
      .trim();
  }

  function esc(v){
    return String(v || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function apiUrl(){
    try{
      if(typeof API_URL !== 'undefined' && API_URL) return txt(API_URL);
    }catch(e){}
    return txt(window.API_URL || document.getElementById('appsScriptUrl')?.value);
  }

  async function apiGet(accion, params){
    const base = apiUrl();
    if(!base) throw new Error('API_URL no está definida.');

    const q = new URLSearchParams({accion:accion, _:String(Date.now())});
    Object.keys(params || {}).forEach(k=>{
      const v = params[k];
      if(v !== undefined && v !== null && txt(v)) q.append(k, v);
    });

    const r = await fetch(base + '?' + q.toString(), {
      method:'GET',
      cache:'no-store'
    });

    if(!r.ok) throw new Error('Error HTTP ' + r.status + ' en ' + accion);
    return await r.json();
  }

  async function apiPost(accion, data){
    const base = apiUrl();
    if(!base) throw new Error('API_URL no está definida.');

    const r = await fetch(base, {
      method:'POST',
      body:JSON.stringify({
        accion:accion,
        data:data || {}
      })
    });

    if(!r.ok) throw new Error('Error HTTP ' + r.status + ' en ' + accion);
    return await r.json();
  }

  function atencionActiva(){
    try{
      if(typeof window.getAtencionActiva === 'function'){
        const a = window.getAtencionActiva();
        if(a && txt(a.id_atencion)) return a;
      }
    }catch(e){}

    try{
      if(typeof window.obtenerContextoAtencionActual === 'function'){
        const c = window.obtenerContextoAtencionActual();
        if(c && txt(c.id_atencion)) return c;
      }
    }catch(e){}

    return window.atencionesState?.atencionActual ||
           window.currentAttention ||
           window.atencionActual ||
           null;
  }

  function idAtencionActiva(){
    try{
      if(typeof window.getIdAtencionActiva === 'function'){
        const id = txt(window.getIdAtencionActiva());
        if(id) return id;
      }
    }catch(e){}

    const a = atencionActiva();
    return txt(
      a?.id_atencion ||
      window.planState?.atencionActual ||
      window.examenFisicoState?.atencionActual ||
      window.auroDiagnosticosState?.atencionActual
    );
  }

  function atencionesLocales(){
    try{
      const raw = localStorage.getItem('aurosanax_atenciones_local_v1');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }catch(e){
      return [];
    }
  }

  function tiempoAtencion(a){
    const raw = txt(
      a?.fecha_atencion || a?.fecha_consulta || a?.fecha ||
      a?.creado_en || a?.fecha_creacion || a?.actualizado_en
    );
    const n = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function contextoAtencion(){
    const actual = atencionActiva() || {};
    const id = txt(actual.id_atencion || idAtencionActiva());
    if(!id) return {id:'', atencion:{}, editable:false, historica:false, cerrada:false};

    /*
      IASYN FIX QUIRÚRGICO 2026-08-12:
      La autoridad clínica es la atención seleccionada/activa del ERP.
      localStorage se usa únicamente como respaldo descriptivo y NUNCA
      para decidir que una atención abierta es histórica solo porque
      otra fila local tenga fecha o número de consulta superior.
      Este criterio replica el patrón estable del Plan: una atención
      seleccionada es editable mientras no esté explícitamente cerrada.
    */
    const local = atencionesLocales();
    const localRegistro = local.find(a=>txt(a?.id_atencion) === id) || {};
    const registro = Object.assign({}, localRegistro, actual);

    const idPaciente = txt(registro.id_paciente || actual.id_paciente);
    const estado = norm(
      actual.estado_atencion ||
      actual.estado ||
      actual.estado_consulta ||
      registro.estado_atencion ||
      registro.estado ||
      registro.estado_consulta
    );

    /*
      IASYN RECOMENDACIONES 2026-08-12:
      El cierre clínico de la atención NO equivale al cierre documental
      de Recomendaciones. Una atención finalizada/cerrada/completada
      puede todavía requerir emisión o corrección de recomendaciones.

      Solo se bloquean estados que invalidan la atención como documento
      clínico operativo: anulada, cancelada o archivada.
    */
    const finalizada = /(cerrad|finaliz|complet)/.test(estado);
    const bloqueada = /(anulad|cancelad|archivad)/.test(estado);
    const editable = !!id && !bloqueada;

    return {
      id:id,
      atencion:registro,
      idPaciente:idPaciente,
      numeroConsulta:txt(
        actual.numero_consulta ||
        actual.numero_atencion ||
        registro.numero_consulta ||
        registro.numero_atencion
      ),
      estadoAtencion:estado,
      finalizada:finalizada,
      bloqueada:bloqueada,
      editable:editable,
      historica:!!id && bloqueada
    };
  }

  function primerTexto(){
    for(let i=0;i<arguments.length;i++){
      const v=txt(arguments[i]);
      if(v) return v;
    }
    return '';
  }

  function valorCampo(){
    for(let i=0;i<arguments.length;i++){
      const el=document.getElementById(arguments[i]);
      if(!el) continue;

      if(el.tagName === 'SELECT'){
        const opcion=el.options?.[el.selectedIndex];
        const t=txt(opcion?.textContent);
        if(t && !/^seleccione/i.test(t)) return t;
      }

      const v=txt(el.value || el.textContent);
      if(v) return v;
    }
    return '';
  }

  function nombreMedicoDesdeContexto(atencion){
    const a=atencion || {};
    const activa=atencionActiva() || {};

    return primerTexto(
      a.nombre_medico,
      a.medico_nombre,
      a.nombre_profesional,
      a.profesional_nombre,
      a.doctor_nombre,
      activa.nombre_medico,
      activa.medico_nombre,
      activa.nombre_profesional,
      activa.profesional_nombre,
      activa.doctor_nombre,
      window.currentAttention?.nombre_medico,
      window.currentAttention?.medico_nombre,
      window.atencionActual?.nombre_medico,
      window.atencionActual?.medico_nombre,
      valorCampo('hcProfesional','hcMedico','atencionProfesional','atencionMedico'),
      document.querySelector('.doctor-pill strong')?.textContent,
      document.querySelector('.doctor-pill b')?.textContent
    );
  }

  function nombrePacienteDesdeContexto(atencion){
    const a=atencion || {};
    const activa=atencionActiva() || {};

    return primerTexto(
      a.nombre_paciente,
      a.paciente_nombre,
      activa.nombre_paciente,
      activa.paciente_nombre,
      window.currentAttention?.nombre_paciente,
      window.atencionActual?.nombre_paciente,
      valorCampo('hcPacienteNombre','hcNombrePaciente')
    );
  }

  async function enriquecerContextoDesdeServidor(ctx){
    if(!ctx || !ctx.id) return ctx;

    const a=ctx.atencion || {};
    const faltaMedico=!nombreMedicoDesdeContexto(a);
    const faltaPaciente=!nombrePacienteDesdeContexto(a);
    const faltaNumero=!txt(ctx.numeroConsulta);

    if(!faltaMedico && !faltaPaciente && !faltaNumero) return ctx;

    try{
      const data=await apiGet('listarAtenciones');
      const lista=Array.isArray(data)
        ? data
        : (Array.isArray(data?.registros) ? data.registros : []);

      const encontrada=lista.find(item=>txt(item?.id_atencion)===txt(ctx.id));
      if(!encontrada) return ctx;

      ctx.atencion=Object.assign({}, a, encontrada);
      ctx.numeroConsulta=primerTexto(
        encontrada.numero_consulta,
        encontrada.numero_atencion,
        ctx.numeroConsulta
      );
      return ctx;
    }catch(error){
      console.warn(MODULO+': no se pudo enriquecer el contexto descriptivo.',error);
      return ctx;
    }
  }

  function parseDetalle(valor){
    if(valor && typeof valor === 'object') return valor;
    const raw = txt(valor);
    if(!raw) return {};
    try{
      const d = JSON.parse(raw);
      return d && typeof d === 'object' ? d : {};
    }catch(e){
      return {};
    }
  }

  function fechaVisual(valor){
    const raw = txt(valor);
    if(!raw) return '—';
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if(m){
      return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' · '+m[4]+':'+m[5] : ''}`;
    }
    const d = new Date(raw);
    if(!Number.isNaN(d.getTime())){
      return d.toLocaleString('es-EC',{
        day:'2-digit',month:'2-digit',year:'numeric',
        hour:'2-digit',minute:'2-digit',hour12:false
      });
    }
    return raw;
  }

  /* V1.5.0 — Avisos premium limitados a acciones operativas visibles.
     Las cargas automáticas y los cambios de atención no generan ventanas emergentes. */
  let recToastTemporizador=null;
  let recToastUltimaClave='';
  function recPantallaVisible(){
    const el=document.getElementById('auroRecomendacionesApp');
    if(!el || !el.isConnected || !el.getClientRects().length || !idAtencionActiva()) return false;
    for(let n=el;n && n!==document.body;n=n.parentElement){
      if(n.hidden || n.inert || n.getAttribute('aria-hidden')==='true') return false;
      const s=window.getComputedStyle(n);
      if(s.display==='none' || s.visibility==='hidden') return false;
    }
    return true;
  }
  function recNotificacionPremium(tipo,texto){
    const mensaje=txt(texto);
    if(!mensaje || !recPantallaVisible()) return;
    if(/^(Seleccione una atención|Cargando |Historial de recomendaciones cargado|Historial cargado|Esta atención todavía no tiene recomendaciones|No hay recomendaciones anteriores|Nueva recomendación en preparación|Se precargaron las indicaciones)/i.test(mensaje)) return;
    const clave=(tipo||'info')+'|'+mensaje;
    if(recToastUltimaClave===clave) return;
    recToastUltimaClave=clave;
    let zone=document.getElementById('auroRecToastZone');
    if(!zone){
      zone=document.createElement('div');zone.id='auroRecToastZone';
      zone.className='auro-rec-toast-zone';zone.setAttribute('aria-live','polite');
      document.body.appendChild(zone);
    }
    const dic={ok:['ok','✓','Operación confirmada'],info:['info','i','IASYN 2'],warn:['warn','!','Firma electrónica'],error:['error','×','Atención requerida']};
    const c=dic[tipo]||dic.info;
    zone.innerHTML='<div class="auro-rec-toast auro-rec-toast-'+c[0]+'" role="status"><div class="auro-rec-toast-icon">'+c[1]+'</div><div><div class="auro-rec-toast-title">'+esc(c[2])+'</div><div class="auro-rec-toast-text">'+esc(mensaje)+'</div></div></div>';
    if(recToastTemporizador) clearTimeout(recToastTemporizador);
    recToastTemporizador=setTimeout(()=>{zone.remove();recToastTemporizador=null;recToastUltimaClave='';},3600);
  }
  function recCerrarNotificaciones(){
    if(recToastTemporizador){clearTimeout(recToastTemporizador);recToastTemporizador=null;}
    recToastUltimaClave='';
    document.getElementById('auroRecToastZone')?.remove();
  }
  function setMsg(texto, tipo){
    const el=document.getElementById('auroRecMensaje');
    if(el){
      el.className='auro-rec-msg '+(tipo||'info');
      el.textContent=texto||'';
      el.hidden=!texto;
    }
    if(texto) recNotificacionPremium(tipo,texto);
  }

  function instalarEstilos(){
    if(document.getElementById('auroRecomendacionesStyles')) return;

    const style=document.createElement('style');
    style.id='auroRecomendacionesStyles';
    style.textContent=`
      /* V1.5.0 — notificaciones premium no invasivas y editor ampliado. */
      .auro-rec-toast-zone{position:fixed;right:18px;top:18px;z-index:2147483000;width:min(390px,calc(100vw - 28px));pointer-events:none}
      .auro-rec-toast{display:grid;grid-template-columns:42px minmax(0,1fr);gap:11px;align-items:center;padding:13px 15px;border-radius:16px;color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.23);border:1px solid rgba(255,255,255,.2);animation:auroRecToastIn .22s ease-out}
      .auro-rec-toast-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:rgba(255,255,255,.16);font-size:21px;font-weight:900}
      .auro-rec-toast-title{font-size:13px;font-weight:900}.auro-rec-toast-text{font-size:12px;line-height:1.45;margin-top:3px;overflow-wrap:anywhere}
      .auro-rec-toast-ok{background:linear-gradient(135deg,#047857,#059669)}.auro-rec-toast-info{background:linear-gradient(135deg,#6c1749,#8b1e5a)}
      .auro-rec-toast-warn{background:linear-gradient(135deg,#945b08,#b7791f)}.auro-rec-toast-error{background:linear-gradient(135deg,#8f1d18,#b42318)}
      @keyframes auroRecToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
      @media(prefers-reduced-motion:reduce){.auro-rec-toast{animation:none}}
      #auroRecDieta,#auroRecGenerales{text-align:justify;white-space:pre-wrap;line-height:1.55}
      .auro-rec-expand-row{display:flex;justify-content:flex-end;margin:6px 0 7px}
      .auro-rec-expand-btn{border:1px solid #e5b7d0;background:#fff7fb;color:#8b1e5a;border-radius:9px;padding:6px 11px;font-size:12px;font-weight:800;cursor:pointer}
      .auro-rec-expand-btn:disabled{opacity:.5;cursor:not-allowed}
      .auro-rec-expand-dialog{width:min(1000px,96vw);max-height:94vh;padding:0;border:0;border-radius:18px;box-shadow:0 20px 70px #0005}
      .auro-rec-expand-dialog::backdrop{background:rgba(17,24,39,.65)}
      .auro-rec-expand-panel{padding:18px;display:grid;gap:11px;background:#fff}
      .auro-rec-expand-panel h3{margin:0;font-size:18px;color:#374151}
      .auro-rec-expand-help{font-size:12px;color:#64748b}
      .auro-rec-expand-text{width:100%;min-height:52vh;max-height:69vh;resize:vertical;padding:14px;border:1px solid #cbd5e1;border-radius:12px;font:15px/1.62 Arial,sans-serif;text-align:justify;white-space:pre-wrap;color:#111827}
      .auro-rec-expand-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}
      .auro-rec-expand-actions button{border:1px solid #ded5dd;border-radius:10px;padding:9px 16px;background:#fff;color:#475569;font-weight:800;cursor:pointer}
      .auro-rec-expand-actions .aplicar{background:linear-gradient(135deg,#8b1e5a,#c23b83);border-color:#8b1e5a;color:#fff}
      @media(max-width:640px){.auro-rec-expand-panel{padding:12px}.auro-rec-expand-text{min-height:55vh;font-size:16px}}
      #auroRecomendacionesApp{width:100%;max-width:1180px;margin:0 auto;color:#1f2937}
      #auroRecomendacionesApp *{box-sizing:border-box}
      .auro-rec-shell{display:grid;gap:16px}
      .auro-rec-hero{border:1px solid #ead7e2;border-radius:22px;background:linear-gradient(135deg,#fff,#fff7fb);box-shadow:0 12px 34px rgba(139,30,90,.07);overflow:hidden}
      .auro-rec-hero-main{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:17px 18px}
      .auro-rec-icon{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff;font-size:22px;box-shadow:0 9px 20px rgba(139,30,90,.2)}
      .auro-rec-kicker{font-size:10px;letter-spacing:.08em;font-weight:950;color:#8b1e5a;text-transform:uppercase}
      .auro-rec-title{font-size:20px;font-weight:950;line-height:1.2;margin-top:2px;color:#111827}
      .auro-rec-sub{font-size:12px;color:#64748b;font-weight:700;margin-top:4px;overflow-wrap:anywhere}
      .auro-rec-state{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 11px;font-size:11px;font-weight:900;white-space:nowrap}
      .auro-rec-state.edit{background:#dcfce7;color:#166534}
      .auro-rec-state.read{background:#f1f5f9;color:#475569}
      .auro-rec-context{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid #f0e1e9;background:rgba(255,255,255,.72)}
      .auro-rec-context-item{padding:11px 14px;border-right:1px solid #f0e1e9;min-width:0}
      .auro-rec-context-item:last-child{border-right:0}
      .auro-rec-context-item span{display:block;color:#8b7280;font-size:10px;text-transform:uppercase;font-weight:900;letter-spacing:.05em}
      .auro-rec-context-item b{display:block;margin-top:3px;font-size:12px;overflow-wrap:anywhere}
      .auro-rec-card{border:1px solid #e5e7eb;border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 8px 25px rgba(15,23,42,.04)}
      .auro-rec-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:13px 15px;background:#2f1f3a;color:#fff}
      .auro-rec-card-head b{font-size:13px}
      .auro-rec-card-head small{display:block;opacity:.8;font-size:11px;margin-top:2px;line-height:1.35}
      .auro-rec-card-body{padding:15px}
      .auro-rec-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .auro-rec-field label{display:block;font-size:12px;font-weight:850;color:#374151;margin-bottom:6px}
      .auro-rec-field input,.auro-rec-field textarea,.auro-rec-field select{width:100%;border:1px solid #dbe1e8;border-radius:13px;padding:10px 11px;font:inherit;color:#111827;background:#fff}
      .auro-rec-field textarea{min-height:110px;resize:vertical;line-height:1.45}
      .auro-rec-field input:focus,.auro-rec-field textarea:focus,.auro-rec-field select:focus{outline:none;border-color:#c23b83;box-shadow:0 0 0 3px rgba(194,59,131,.12)}
      .auro-rec-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .auro-rec-check{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border:1px solid #edf0f3;border-radius:13px;background:#fff;min-height:44px;font-size:13px;font-weight:650;line-height:1.3}
      .auro-rec-check input{width:17px;height:17px;accent-color:#8b1e5a;flex:0 0 auto;margin-top:1px}
      .auro-rec-dx-list{display:grid;gap:8px}
      .auro-rec-dx{display:grid;grid-template-columns:86px minmax(0,1fr) 96px;gap:10px;align-items:center;padding:10px 11px;border:1px solid #e8edf1;border-radius:13px;background:#f8fafc}
      .auro-rec-dx-code{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:5px 8px;border-radius:10px;background:#fff0f7;border:1px solid #f3c7df;font-size:12px;font-weight:950;color:#8b1e5a;text-align:center;white-space:nowrap}
      .auro-rec-dx-name{min-width:0;font-size:13px;font-weight:750;line-height:1.35;overflow-wrap:anywhere}
      .auro-rec-dx-tag{display:inline-flex;align-items:center;justify-content:center;min-height:28px;font-size:10px;font-weight:900;padding:4px 7px;border-radius:999px;background:#fff;border:1px solid #dbe1e8;color:#475569;text-align:center}
      .auro-rec-empty{padding:12px;border:1px dashed #cbd5e1;border-radius:13px;color:#64748b;font-size:12px;text-align:center}
      .auro-rec-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;position:sticky;bottom:10px;z-index:3;padding:12px;border:1px solid #ead7e2;border-radius:18px;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);box-shadow:0 12px 30px rgba(15,23,42,.08)}
      .auro-rec-btn{border:1px solid #e5e7eb;background:#fff;color:#374151;border-radius:13px;padding:10px 13px;font-weight:850;cursor:pointer}
      .auro-rec-btn.primary{border:0;background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff}
      .auro-rec-btn.firma-ok{border-color:#86efac;background:#f0fdf4;color:#166534}
      .auro-rec-btn.firma-warn{border-color:#fdba74;background:#fff7ed;color:#9a3412}
      /* IASYN V1.4.0: controles exclusivamente de pantalla, nunca PDF A4. */
      .auro-rec-btn.nuevo{background:#fff0f6;border-color:#f3b1d2;color:#981b62}
      .auro-rec-btn.nuevo:hover{background:#ffe1ef}
      .auro-rec-saved-item.activo{border-color:#e9a5ca;box-shadow:0 5px 18px rgba(139,30,90,.09)}
      .auro-rec-saved-actions .auro-rec-btn{white-space:normal;text-align:center;overflow-wrap:anywhere;line-height:1.35;min-height:40px}
      .auro-rec-btn.firma-ok{background:#edfdf4;color:#166534;border-color:#7bdca8}
      .auro-rec-btn.firma-warn{background:#fffbeb;color:#92400e;border-color:#f4cc76}
      /* El botón Abierta se distingue del botón Abrir y del verde firmado. */
      #auroRecGuardada .auro-rec-btn.doc-abierto{background:#f7e6f1;border:1px solid #c763a0;color:#81245a;box-shadow:inset 0 0 0 1px #e9afd0}
      #auroRecGuardada .auro-rec-btn.doc-abierto:focus-visible{outline:2px solid #8b1e5a;outline-offset:2px}
      /* V1.5.1: verde evidente SOLO para PDF con firma confirmada por el servidor. */
      .auro-rec-saved-actions .auro-rec-btn.firma-ok{background:linear-gradient(135deg,#047857,#059669);color:#fff;border:1px solid #047857;box-shadow:0 3px 11px rgba(4,120,87,.13)}
      .auro-rec-saved-actions .auro-rec-btn.firma-ok:hover{background:#047857}
      .auro-rec-saved-actions .auro-rec-btn.firma-ok:focus-visible{outline:3px solid #6ee7b7;outline-offset:2px}
      .auro-rec-saved-badge.proceso{background:#fff7ed;color:#9a3412;border-color:#fdba74}
      .auro-rec-saved-meta{word-break:break-word}
      .auro-rec-saved-title{line-height:1.4}
      .auro-rec-actions .auro-rec-btn{line-height:1.35;white-space:normal}
      .auro-rec-firma-status{display:flex;align-items:center;justify-content:flex-end;gap:7px;width:100%;font-size:11px;font-weight:900;color:#64748b;margin-bottom:-3px}
      .auro-rec-saved-list{display:grid;gap:10px}
      .auro-rec-saved-item{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:14px 16px;box-shadow:0 4px 16px rgba(15,23,42,.04)}
      .auro-rec-saved-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .auro-rec-saved-title{font-size:14px;font-weight:950;color:#1f2937}
      .auro-rec-saved-meta{font-size:11px;line-height:1.5;color:#64748b;margin-top:4px;overflow-wrap:anywhere}
      .auro-rec-saved-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .auro-rec-saved-badge{display:inline-flex;align-items:center;gap:5px;border:1px solid #d1d5db;border-radius:999px;padding:4px 8px;font-size:10.5px;font-weight:900;background:#f8fafc;color:#475569}
      .auro-rec-saved-badge.ok{border-color:#86efac;background:#f0fdf4;color:#166534}
      .auro-rec-saved-badge.warn{border-color:#fdba74;background:#fff7ed;color:#9a3412}
      .auro-rec-saved-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      @media(max-width:700px){
        .auro-rec-saved-top{display:grid}
        .auro-rec-saved-actions{justify-content:stretch}
        .auro-rec-saved-actions .auro-rec-btn{width:100%}
      }
      /* IASYN 1.5.3: compactación SOLO VISUAL del historial. Se mantienen
         accesibilidad, badges, firmas verdes y acciones tal como funcionan. */
      #auroRecGuardadaCard .auro-rec-card-body{padding:10px 12px}
      #auroRecGuardada .auro-rec-saved-list{gap:6px}
      #auroRecGuardada.auro-rec-saved-list{gap:6px}
      #auroRecGuardada .auro-rec-saved-item{padding:8px 11px;border-radius:11px;box-shadow:0 2px 9px rgba(15,23,42,.035)}
      #auroRecGuardada .auro-rec-saved-top{align-items:center;gap:10px}
      #auroRecGuardada .auro-rec-saved-title{font-size:13px;line-height:1.22}
      #auroRecGuardada .auro-rec-saved-meta{font-size:10px;line-height:1.25;margin-top:2px;overflow-wrap:anywhere}
      #auroRecGuardada .auro-rec-saved-badges{gap:4px;margin-top:4px}
      #auroRecGuardada .auro-rec-saved-badge{gap:4px;padding:2px 6px;font-size:9.5px;line-height:1.18}
      #auroRecGuardada .auro-rec-saved-actions{gap:6px;align-items:center;flex:0 0 auto}
      #auroRecGuardada .auro-rec-saved-actions .auro-rec-btn{min-height:34px;padding:6px 9px;font-size:11px;line-height:1.22;max-width:238px}
      @media(max-width:700px){
        #auroRecGuardada .auro-rec-saved-item{padding:10px}
        #auroRecGuardada .auro-rec-saved-top{display:grid;gap:7px}
        #auroRecGuardada .auro-rec-saved-actions .auro-rec-btn{max-width:none;min-height:42px;font-size:12px}
      }
      .auro-rec-btn:disabled{opacity:.5;cursor:not-allowed}
      .auro-rec-msg{padding:10px 12px;border-radius:13px;font-size:12px;font-weight:750}
      .auro-rec-msg.info{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe}
      .auro-rec-msg.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
      .auro-rec-msg.error{background:#fff1f2;color:#9f1239;border:1px solid #fecdd3}
      .auro-rec-readonly input,.auro-rec-readonly textarea,.auro-rec-readonly select{background:#f8fafc!important;color:#475569!important}
      .auro-rec-readonly textarea[readonly],.auro-rec-readonly input[readonly]{user-select:text!important;-webkit-user-select:text!important;cursor:text!important;color:#334155!important;opacity:1!important}
      .auro-rec-expand-text[readonly]{user-select:text!important;-webkit-user-select:text!important;cursor:text;background:#f8fafc}
      @media(max-width:900px){
        .auro-rec-context{grid-template-columns:repeat(2,minmax(0,1fr))}
        .auro-rec-context-item{border-bottom:1px solid #f0e1e9}
        .auro-rec-context-item:nth-child(2n){border-right:0}
      }
      @media(max-width:640px){
        html,body{max-width:100%;overflow-x:hidden}
        #hc_recomendaciones,#auroRecomendacionesMount,#auroRecomendacionesApp{width:100%!important;max-width:100%!important;min-width:0!important;overflow-x:hidden!important}
        .auro-rec-shell{gap:11px}
        .auro-rec-hero{border-radius:17px}
        .auro-rec-hero-main{grid-template-columns:auto minmax(0,1fr);padding:13px;gap:10px}
        .auro-rec-icon{width:42px;height:42px;border-radius:13px}
        .auro-rec-title{font-size:18px}
        .auro-rec-state{grid-column:1/-1;width:100%;justify-content:center;white-space:normal;text-align:center}
        .auro-rec-context{grid-template-columns:1fr}
        .auro-rec-context-item{border-right:0;border-bottom:1px solid #f0e1e9;padding:9px 12px}
        .auro-rec-grid-2,.auro-rec-check-grid{grid-template-columns:1fr}
        .auro-rec-card{border-radius:16px}
        .auro-rec-card-head{padding:11px 12px}
        .auro-rec-card-body{padding:12px}
        .auro-rec-field input,.auro-rec-field textarea,.auro-rec-field select{font-size:16px;min-height:44px}
        .auro-rec-field textarea{min-height:135px}
        .auro-rec-check{min-height:48px;font-size:13px;padding:10px}
        .auro-rec-actions{display:grid;grid-template-columns:1fr;bottom:6px;padding:9px}
        .auro-rec-btn{width:100%;min-height:46px;font-size:14px}
        .auro-rec-dx{grid-template-columns:78px minmax(0,1fr);align-items:start}
        .auro-rec-dx-code{width:78px}
        .auro-rec-dx-tag{grid-column:2;width:max-content;max-width:100%;margin-top:-2px}
      }
    `;
    document.head.appendChild(style);
  }

  function checksHtml(lista, prefijo){
    return lista.map(([key,label])=>`
      <label class="auro-rec-check">
        <input type="checkbox" data-auro-rec-check="${esc(prefijo)}" value="${esc(key)}">
        <span>${esc(label)}</span>
      </label>
    `).join('');
  }

  function appHtml(){
    return `
      <div id="auroRecomendacionesApp">
        <div class="auro-rec-shell">
          <section class="auro-rec-hero">
            <div class="auro-rec-hero-main">
              <div class="auro-rec-icon"><i class="bi bi-heart-pulse"></i></div>
              <div>
                <div class="auro-rec-kicker">Recomendaciones clínicas</div>
                <div class="auro-rec-title" id="auroRecPaciente">Sin atención seleccionada</div>
                <div class="auro-rec-sub" id="auroRecAtencion">Seleccione una atención para trabajar sus recomendaciones.</div>
              </div>
              <div class="auro-rec-state read" id="auroRecEstado"><i class="bi bi-lock"></i> Sin atención</div>
            </div>
            <div class="auro-rec-context">
              <div class="auro-rec-context-item"><span>Consulta</span><b id="auroRecConsulta">—</b></div>
              <div class="auro-rec-context-item"><span>Médico</span><b id="auroRecMedico">—</b></div>
              <div class="auro-rec-context-item"><span>Fecha atención</span><b id="auroRecFecha">—</b></div>
              <div class="auro-rec-context-item"><span>Última actualización</span><b id="auroRecActualizado">—</b></div>
            </div>
          </section>

          <div id="auroRecMensaje" class="auro-rec-msg info" role="status" aria-live="polite" hidden></div>

          <section class="auro-rec-card">
            <div class="auro-rec-card-head">
              <div><b>Diagnósticos de esta atención</b><small>Lectura automática. Recomendaciones no modifica el módulo Diagnóstico.</small></div>
            </div>
            <div class="auro-rec-card-body">
              <div id="auroRecDiagnosticos" class="auro-rec-dx-list">
                <div class="auro-rec-empty">Sin diagnósticos cargados.</div>
              </div>
            </div>
          </section>

          <section class="auro-rec-card">
            <div class="auro-rec-card-head">
              <div><b>Seguimiento</b><small>Próxima revisión y motivo del control.</small></div>
            </div>
            <div class="auro-rec-card-body">
              <div class="auro-rec-grid-2">
                <div class="auro-rec-field">
                  <label for="auroRecProximaCita">Próxima cita / control</label>
                  <input id="auroRecProximaCita" type="date">
                </div>
                <div class="auro-rec-field">
                  <label for="auroRecMotivoControl">Motivo de próxima cita</label>
                  <input id="auroRecMotivoControl" type="text" placeholder="Ej.: control de resultados, revisión, procedimiento...">
                </div>
              </div>
            </div>
          </section>

          <section class="auro-rec-card">
            <div class="auro-rec-card-head">
              <div><b>Signos de alerta</b><small>Marque las opciones aplicables. Use “Otros signos / observaciones” para escribir indicaciones adicionales.</small></div>
            </div>
            <div class="auro-rec-card-body">
              <div class="auro-rec-check-grid">${checksHtml(ALERTAS,'alerta')}</div>
              <div class="auro-rec-field" style="margin-top:12px">
                <label for="auroRecAlertaOtros">Otros signos / observaciones</label>
                <div class="auro-rec-expand-row"><button type="button" class="auro-rec-expand-btn" data-auro-rec-expand="auroRecAlertaOtros">⛶ Ampliar / ver texto</button></div>
                <textarea id="auroRecAlertaOtros" placeholder="Otros signos de alarma o aclaraciones específicas."></textarea>
              </div>
            </div>
          </section>

          <section class="auro-rec-card">
            <div class="auro-rec-card-head">
              <div><b>Signos de infección</b><small>Marque las opciones aplicables y escriba aclaraciones libres en el campo de observaciones.</small></div>
            </div>
            <div class="auro-rec-card-body">
              <div class="auro-rec-check-grid">${checksHtml(INFECCION,'infeccion')}</div>
              <div class="auro-rec-field" style="margin-top:12px">
                <label for="auroRecInfeccionOtros">Otros signos / observaciones</label>
                <div class="auro-rec-expand-row"><button type="button" class="auro-rec-expand-btn" data-auro-rec-expand="auroRecInfeccionOtros">⛶ Ampliar / ver texto</button></div>
                <textarea id="auroRecInfeccionOtros" placeholder="Observaciones relacionadas con infección o cuidados locales."></textarea>
              </div>
            </div>
          </section>

          <section class="auro-rec-card">
            <div class="auro-rec-card-head">
              <div><b>Dieta y cuidados</b><small>Indicaciones dietéticas, actividad, higiene y cuidados domiciliarios.</small></div>
            </div>
            <div class="auro-rec-card-body">
              <div class="auro-rec-field">
                <label for="auroRecDieta">Dieta / cuidados recomendados</label>
                <div class="auro-rec-expand-row"><button type="button" class="auro-rec-expand-btn" data-auro-rec-expand="auroRecDieta">⛶ Ampliar editor</button></div>
                <textarea id="auroRecDieta" placeholder="Ej.: hidratación, dieta, reposo relativo, higiene, cuidados del procedimiento..."></textarea>
              </div>
            </div>
          </section>

          <section class="auro-rec-card">
            <div class="auro-rec-card-head">
              <div><b>Recomendaciones generales</b><small>Texto final entregable al paciente. Debe ser revisado por el profesional.</small></div>
            </div>
            <div class="auro-rec-card-body">
              <div class="auro-rec-field">
                <label for="auroRecGenerales">Recomendaciones para el paciente</label>
                <div class="auro-rec-expand-row"><button type="button" class="auro-rec-expand-btn" data-auro-rec-expand="auroRecGenerales">⛶ Ampliar editor</button></div>
                <textarea id="auroRecGenerales" style="min-height:180px" placeholder="Escriba las recomendaciones finales de esta atención."></textarea>
                <div style="margin-top:10px;display:flex;justify-content:flex-end">
                  <button type="button" class="auro-rec-btn" id="auroRecBtnAgregarPlan">
                    <i class="bi bi-plus-circle me-1"></i> Añadir indicaciones del Plan
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div class="auro-rec-actions">
            <button type="button" class="auro-rec-btn nuevo" id="auroRecBtnNueva"><i class="bi bi-plus-circle me-1"></i> Nueva recomendación</button>
            <button type="button" class="auro-rec-btn" id="auroRecBtnRecargar"><i class="bi bi-arrow-repeat me-1"></i> Recargar</button>
            <button type="button" class="auro-rec-btn" id="auroRecBtnVista"><i class="bi bi-printer me-1"></i> Imprimir recomendaciones</button>
            <button type="button" class="auro-rec-btn primary" id="auroRecBtnGuardar"><i class="bi bi-save2 me-1"></i> Guardar recomendaciones</button>
          </div>

          <section class="auro-rec-card" id="auroRecGuardadaCard">
            <div class="auro-rec-card-head">
              <div>
                <b>Recomendaciones guardadas</b>
                <small>Historial independiente por atención. Cada documento tiene su propia firma electrónica.</small>
              </div>
            </div>
            <div class="auro-rec-card-body">
              <div id="auroRecGuardada" class="auro-rec-saved-list">
                <div class="auro-rec-empty">No existe una recomendación guardada para esta atención.</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function asegurarMount(){
    const mount = document.getElementById('auroRecomendacionesMount');
    if(!mount) return null;
    if(!document.getElementById('auroRecomendacionesApp')){
      mount.innerHTML = appHtml();
    }
    return mount;
  }

  function setText(id, valor){
    const el=document.getElementById(id);
    if(el) el.textContent=valor;
  }

  function setValue(id, valor){
    const el=document.getElementById(id);
    if(el) el.value=valor || '';
  }

  function getValue(id){
    return txt(document.getElementById(id)?.value);
  }

  /* V1.5.4: editor ampliado en SOLO LECTURA para documentos firmados.
     La opción Aplicar jamás existe en modo lectura; no se altera el firmado. */
  function recAmpliarEditor(id){
    if(!['auroRecDieta','auroRecGenerales','auroRecAlertaOtros','auroRecInfeccionOtros'].includes(id)) return;
    const origen=document.getElementById(id);
    const ctx=state.contexto||contextoAtencion();
    const idAtencion=txt(ctx?.id),idDocumento=txt(state.idRecomendacion),modoNuevo=!!state.modoNuevo;
    if(!origen || !idAtencion || state.guardando || state.cargando) return;
    const editable=ctx.editable===true && !origen.readOnly && !origen.disabled &&
      !state.verificandoFirma && !state.firmaVerificacionFallida &&
      !recDocumentoFirmadoActivo() && !recFirmaActivaEnAtencion(idAtencion);
    const titulos={
      auroRecDieta:'Dieta / cuidados recomendados',
      auroRecGenerales:'Recomendaciones para el paciente',
      auroRecAlertaOtros:'Otros signos de alerta / observaciones',
      auroRecInfeccionOtros:'Otros signos de infección / observaciones'
    };
    const titulo=titulos[id];
    const dialog=document.createElement('dialog');dialog.className='auro-rec-expand-dialog';
    const panel=document.createElement('div');panel.className='auro-rec-expand-panel';
    const h=document.createElement('h3');h.textContent=titulo;
    const ayuda=document.createElement('div');ayuda.className='auro-rec-expand-help';
    ayuda.textContent=editable
      ? 'Aplicar el texto solo actualiza el formulario; para guardar pulse Guardar recomendaciones.'
      : 'Consulta de solo lectura: seleccione el texto y use Ctrl+A / Ctrl+C para copiarlo. El documento firmado no se modifica.';
    const campo=document.createElement('textarea');campo.className='auro-rec-expand-text';
    campo.value=origen.value;campo.readOnly=!editable;campo.setAttribute('aria-label',titulo);
    const acciones=document.createElement('div');acciones.className='auro-rec-expand-actions';
    const cancelar=document.createElement('button');cancelar.type='button';cancelar.textContent=editable?'Cancelar':'Cerrar';
    acciones.append(cancelar);
    const cerrar=()=>{if(dialog.open && typeof dialog.close==='function') dialog.close();dialog.remove();};
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    cancelar.addEventListener('click',cerrar);
    if(editable){
      const aplicar=document.createElement('button');aplicar.type='button';aplicar.textContent='Aplicar texto';aplicar.className='aplicar';
      acciones.append(aplicar);
      aplicar.addEventListener('click',()=>{
        const actual=state.contexto||contextoAtencion();
        const invalido=txt(actual.id)!==idAtencion || txt(state.idRecomendacion)!==idDocumento || !!state.modoNuevo!==modoNuevo ||
          !actual.editable || !origen.isConnected || origen.disabled || origen.readOnly || state.guardando || state.cargando ||
          state.verificandoFirma || state.firmaVerificacionFallida || recDocumentoFirmadoActivo() || recFirmaActivaEnAtencion(idAtencion);
        if(invalido){cerrar();setMsg('Cambió la atención, el documento o la firma. No se aplicó el texto.','error');return;}
        origen.value=campo.value;origen.dispatchEvent(new Event('input',{bubbles:true}));cerrar();origen.focus();
      });
    }
    panel.append(h,ayuda,campo,acciones);dialog.append(panel);document.body.append(dialog);
    if(typeof dialog.showModal==='function') dialog.showModal();else{dialog.setAttribute('open','');campo.focus();}
  }

  function checksSeleccionados(tipo){
    return Array.from(document.querySelectorAll(`[data-auro-rec-check="${tipo}"]:checked`))
      .map(el=>txt(el.value))
      .filter(Boolean);
  }

  function aplicarChecks(tipo, valores){
    const set=new Set(Array.isArray(valores) ? valores.map(txt) : []);
    document.querySelectorAll(`[data-auro-rec-check="${tipo}"]`).forEach(el=>{
      el.checked=set.has(txt(el.value));
    });
  }

  function limpiar(){
    state.idRecomendacion='';
    state.registro=null;
    setValue('auroRecProximaCita','');
    setValue('auroRecMotivoControl','');
    setValue('auroRecAlertaOtros','');
    setValue('auroRecInfeccionOtros','');
    setValue('auroRecDieta','');
    setValue('auroRecGenerales','');
    aplicarChecks('alerta',[]);
    aplicarChecks('infeccion',[]);
    setText('auroRecActualizado','Sin guardar aún');
    renderRecomendacionGuardada();
  }

  function renderDiagnosticos(){
    const box=document.getElementById('auroRecDiagnosticos');
    if(!box) return;

    if(!state.diagnosticos.length){
      box.innerHTML='<div class="auro-rec-empty">Sin diagnósticos registrados para esta atención.</div>';
      return;
    }

    box.innerHTML=state.diagnosticos.map((d,i)=>{
      const codigo=txt(d.codigo_cie10 || d.codigo || d.cie10);
      const nombre=txt(d.descripcion || d.nombre || d.diagnostico);
      const principal = d.principal === true || ['si','sí','true','1'].includes(norm(d.principal)) || i===0;
      return `<div class="auro-rec-dx">
        <div class="auro-rec-dx-code">${esc(codigo || '—')}</div>
        <div class="auro-rec-dx-name">${esc(nombre || 'Diagnóstico sin descripción')}</div>
        <div class="auro-rec-dx-tag">${principal ? 'Principal' : esc(txt(d.tipo_diagnostico || d.tipo || 'Asociado'))}</div>
      </div>`;
    }).join('');
  }

  function precargarSeguimientoDesdePlanSiVacio(){
    if(state.idRecomendacion) return false;
    if(getValue('auroRecMotivoControl')) return false;

    const candidatos = [
      'hcProximoControl',
      'hcControl',
      'hcSeguimiento'
    ];

    for(const id of candidatos){
      const el=document.getElementById(id);
      const valor=txt(el?.value || el?.textContent);
      if(!valor) continue;

      setValue('auroRecMotivoControl',valor);
      return true;
    }

    return false;
  }

  /*
    IASYN RECOMENDACIONES 1.2.0 — PLAN → RECOMENDACIONES
    ------------------------------------------------------
    Integración quirúrgica y antirregresiva.

    REGLAS:
    - La autoridad clínica es siempre la MISMA id_atencion.
    - Recomendaciones nunca escribe ni modifica Plan.
    - Si el campo general ya contiene texto, nunca se sobrescribe automáticamente.
    - Si está vacío, puede precargarse con las indicaciones persistidas del Plan.
    - El botón manual agrega únicamente indicaciones que todavía no están presentes.
    - Las indicaciones importadas se muestran con viñeta para lectura clínica clara.
    - Si una versión futura entrega categoría explícita, se conserva; nunca se inventa.
    - Nada se persiste hasta pulsar Guardar recomendaciones.
  */

  function limpiarMarcadorClinico(linea){
    return txt(linea)
      .replace(/^\s*(?:[•●▪◦\-–—*]|\d+[.)])\s+/, '')
      .trim();
  }

  function claveLineaClinica(linea){
    return norm(limpiarMarcadorClinico(linea));
  }

  function lineaPlanDesdeItem(item){
    if(typeof item === 'string') return limpiarMarcadorClinico(item);
    if(!item || typeof item !== 'object') return '';

    const texto=txt(
      item.texto ||
      item.descripcion ||
      item.indicacion ||
      item.recomendacion ||
      ''
    );

    if(!texto) return '';

    const categoria=txt(
      item.categoria ||
      item.category ||
      item.grupo ||
      item.seccion ||
      item.tipo ||
      ''
    );

    return categoria ? `${categoria}: ${limpiarMarcadorClinico(texto)}` : limpiarMarcadorClinico(texto);
  }

  function indicacionesPlanALista(valor){
    if(valor === null || valor === undefined) return [];

    if(Array.isArray(valor)){
      return valor.map(lineaPlanDesdeItem).filter(Boolean);
    }

    if(typeof valor === 'object'){
      const coleccion = valor.indicaciones || valor.items || valor.registros || valor.lista;
      if(Array.isArray(coleccion)) return indicacionesPlanALista(coleccion);
      const unica=lineaPlanDesdeItem(valor);
      return unica ? [unica] : [];
    }

    const raw=txt(valor);
    if(!raw) return [];

    if(raw.startsWith('[') || raw.startsWith('{')){
      try{
        return indicacionesPlanALista(JSON.parse(raw));
      }catch(e){
        /* Compatibilidad histórica: continuar como texto si no es JSON válido. */
      }
    }

    return raw
      .split(/\r?\n+/)
      .map(limpiarMarcadorClinico)
      .filter(Boolean);
  }

  function lineasClinicasUnicas(valor){
    const vistas=new Set();
    const salida=[];

    const base=Array.isArray(valor)
      ? valor
      : String(valor || '').split(/\r?\n+/);

    base.forEach(linea=>{
      const limpia=limpiarMarcadorClinico(linea);
      const clave=claveLineaClinica(limpia);
      if(!limpia || !clave || vistas.has(clave)) return;
      vistas.add(clave);
      salida.push(limpia);
    });

    return salida;
  }

  function indicacionesPlanAEditor(valor){
    return lineasClinicasUnicas(indicacionesPlanALista(valor))
      .map(linea=>'• '+linea)
      .join('\n');
  }

  async function obtenerIndicacionesPlanMismaAtencion(idAtencionEsperada){
    const idEsperada=txt(idAtencionEsperada);
    if(!idEsperada) return '';

    const ctxInicial=state.contexto || contextoAtencion();
    const idInicial=txt(ctxInicial?.id || state.idAtencion);
    if(!idInicial || idInicial !== idEsperada) return '';

    let plan=null;

    try{
      if(typeof window.buscarPlanClinicoPorAtencionDesdeSheets === 'function'){
        plan=await window.buscarPlanClinicoPorAtencionDesdeSheets(idEsperada);
      }else{
        plan=await apiGet('buscarPlanPorAtencion',{id_atencion:idEsperada});
      }
    }catch(error){
      console.warn(MODULO+': no se pudieron leer indicaciones del Plan.',error);
      return '';
    }

    const ctxActual=state.contexto || contextoAtencion();
    const idActual=txt(ctxActual?.id || state.idAtencion);
    if(!idActual || idActual !== idEsperada) return '';

    const valor =
      plan?.indicaciones_paciente ??
      plan?.indicaciones ??
      plan?.indicacionesPaciente ??
      '';

    const desdePersistido=indicacionesPlanAEditor(valor);
    if(desdePersistido) return desdePersistido;

    /*
      Respaldo visual permitido únicamente cuando el Plan visible declara
      exactamente la misma id_atencion. Nunca se toma un campo de otra atención.
    */
    const idPlanVisible=txt(window.planState?.atencionActual);
    if(idPlanVisible !== idEsperada) return '';

    const campoPlan=document.getElementById('hcIndicacionesPaciente');
    return indicacionesPlanAEditor(campoPlan?.value || campoPlan?.textContent || '');
  }

  async function precargarIndicacionesDesdePlanSiVacio(idAtencionEsperada){
    if(state.guardando) return false;
    if(getValue('auroRecGenerales')) return false;

    const idEsperada=txt(idAtencionEsperada);
    const ctx=state.contexto || contextoAtencion();
    const idRec=txt(ctx?.id || state.idAtencion);
    if(!idEsperada || !idRec || idEsperada !== idRec) return false;

    const valor=await obtenerIndicacionesPlanMismaAtencion(idEsperada);

    const ctxFinal=state.contexto || contextoAtencion();
    const idFinal=txt(ctxFinal?.id || state.idAtencion);

    if(state.guardando) return false;
    if(idFinal !== idEsperada) return false;
    if(getValue('auroRecGenerales')) return false;
    if(!valor) return false;

    setValue('auroRecGenerales',valor);
    return true;
  }

  async function agregarIndicacionesPlanManualmente(){
    const ctx=state.contexto || contextoAtencion();

    if(state.guardando){
      setMsg('Espere a que termine el guardado actual antes de añadir indicaciones del Plan.','info');
      return false;
    }

    if(!ctx?.id){
      setMsg('Seleccione una atención antes de añadir indicaciones del Plan.','error');
      return false;
    }

    if(!ctx.editable){
      setMsg('La atención seleccionada está protegida contra edición.','error');
      return false;
    }

    const idEsperada=txt(ctx.id);
    const valorPlan=await obtenerIndicacionesPlanMismaAtencion(idEsperada);

    const ctxActual=state.contexto || contextoAtencion();
    if(state.guardando || txt(ctxActual?.id) !== idEsperada) return false;

    if(!valorPlan){
      setMsg('El Plan de esta atención no tiene indicaciones para paciente disponibles.','info');
      return false;
    }

    const actuales=getValue('auroRecGenerales');
    const clavesActuales=new Set(
      lineasClinicasUnicas(actuales).map(claveLineaClinica)
    );

    const nuevas=lineasClinicasUnicas(valorPlan)
      .filter(linea=>!clavesActuales.has(claveLineaClinica(linea)));

    if(!nuevas.length){
      setMsg('Las indicaciones disponibles en Plan ya están incluidas en Recomendaciones generales.','info');
      return false;
    }

    const bloqueNuevo=nuevas.map(linea=>'• '+linea).join('\n');
    const combinado=actuales
      ? actuales.replace(/\s+$/,'')+'\n'+bloqueNuevo
      : bloqueNuevo;

    setValue('auroRecGenerales',combinado);
    setMsg(
      'Se añadieron únicamente indicaciones nuevas del Plan. Revise el texto antes de guardar recomendaciones.',
      'info'
    );
    return true;
  }

  function firmaDetalle(detalle){
    const d=detalle || {};
    const normalizado={
      seguimiento:{
        proxima_cita:txt(d?.seguimiento?.proxima_cita),
        motivo:txt(d?.seguimiento?.motivo)
      },
      signos_alerta:{
        seleccionados:Array.isArray(d?.signos_alerta?.seleccionados)
          ? d.signos_alerta.seleccionados.map(txt).filter(Boolean).sort()
          : [],
        otros:txt(d?.signos_alerta?.otros)
      },
      signos_infeccion:{
        seleccionados:Array.isArray(d?.signos_infeccion?.seleccionados)
          ? d.signos_infeccion.seleccionados.map(txt).filter(Boolean).sort()
          : [],
        otros:txt(d?.signos_infeccion?.otros)
      },
      dieta_cuidados:txt(d?.dieta_cuidados),
      recomendaciones_generales:txt(d?.recomendaciones_generales)
    };
    return JSON.stringify(normalizado);
  }

  function fijarFirmaPersistida(idAtencion){
    state.firmaPersistida=firmaDetalle(detalleActual());
    state.firmaPersistidaAtencion=txt(idAtencion);
  }

  function detalleActual(){
    return {
      version:JSON_VERSION,
      seguimiento:{
        proxima_cita:getValue('auroRecProximaCita'),
        motivo:getValue('auroRecMotivoControl')
      },
      signos_alerta:{
        seleccionados:checksSeleccionados('alerta'),
        otros:getValue('auroRecAlertaOtros')
      },
      signos_infeccion:{
        seleccionados:checksSeleccionados('infeccion'),
        otros:getValue('auroRecInfeccionOtros')
      },
      dieta_cuidados:getValue('auroRecDieta'),
      recomendaciones_generales:getValue('auroRecGenerales')
    };
  }

  function tieneContenido(detalle){
    const d=detalle || {};
    return !!(
      txt(d?.seguimiento?.proxima_cita) ||
      txt(d?.seguimiento?.motivo) ||
      (Array.isArray(d?.signos_alerta?.seleccionados) && d.signos_alerta.seleccionados.length) ||
      txt(d?.signos_alerta?.otros) ||
      (Array.isArray(d?.signos_infeccion?.seleccionados) && d.signos_infeccion.seleccionados.length) ||
      txt(d?.signos_infeccion?.otros) ||
      txt(d?.dieta_cuidados) ||
      txt(d?.recomendaciones_generales)
    );
  }

  function aplicarRegistro(registro){
    state.registro=registro || null;
    state.idRecomendacion=txt(registro?.id_recomendacion);

    const d=parseDetalle(registro?.detalle_json);
    setValue('auroRecProximaCita',d?.seguimiento?.proxima_cita);
    setValue('auroRecMotivoControl',d?.seguimiento?.motivo);
    aplicarChecks('alerta',d?.signos_alerta?.seleccionados);
    setValue('auroRecAlertaOtros',d?.signos_alerta?.otros);
    aplicarChecks('infeccion',d?.signos_infeccion?.seleccionados);
    setValue('auroRecInfeccionOtros',d?.signos_infeccion?.otros);setValue('auroRecDieta',d?.dieta_cuidados);
    setValue('auroRecGenerales',d?.recomendaciones_generales);

    setText(
      'auroRecActualizado',
      fechaVisual(registro?.actualizado_en || registro?.creado_en)
    );
    renderRecomendacionGuardada();
  }

  /* ============================================================
     IASYN2 RECOMENDACIONES MULTIDOCUMENTO V1.4.0 — BLINDAJE
     Sin alterar recDocumentoHTML(), recEstilosImpresion(), SHA ni PDF.
     ============================================================ */
  function recCambiosSinGuardar(){
    if(state.modoNuevo) return tieneContenido(detalleActual());
    return auroRecFirmaHayCambiosSinGuardar();
  }

  function recPermitirDescartarCambios(){
    return !recCambiosSinGuardar() || window.confirm(
      'Existen cambios sin guardar. ¿Desea continuar y descartarlos?'
    );
  }

  function recFirmaActivaEnAtencion(idAtencion){
    return Array.from(recomendacionFirmaProcesos.values()).some(p=>
      txt(p?.id_atencion)===txt(idAtencion) &&
      ['PREPARANDO','PENDIENTE','TOMADA','PROCESO'].includes(txt(p?.estado).toUpperCase())
    );
  }

  function recDocumentoFirmadoActivo(){
    if(!state.idRecomendacion || state.modoNuevo) return false;
    const e=auroRecFirmaEstado(state.idRecomendacion);
    return ['FIRMADA','NUEVA_VERSION'].includes(txt(e?.estado).toUpperCase());
  }

  async function abrirRecomendacionHistorial(id){
    const rid=txt(id);
    const ctx=state.contexto||contextoAtencion();
    if(!rid || state.guardando || state.cargando) return false;
    if(recFirmaActivaEnAtencion(ctx.id)){
      setMsg('Existe una firma en proceso. Espere su confirmación o cancele la solicitud.','error');
      return false;
    }
    const registro=(state.registros||[]).find(r=>txt(r.id_recomendacion)===rid);
    if(!registro || txt(registro.id_atencion)!==txt(ctx.id)){
      setMsg('El documento no pertenece a esta atención. Recargue el historial.','error');
      return false;
    }
    if(!recPermitirDescartarCambios()) return false;
    state.modoNuevo=false;
    state.verificandoFirma=true;
    state.firmaVerificacionFallida=false;
    ++recomendacionFirmaSyncToken;
    aplicarRegistro(registro);
    fijarFirmaPersistida(ctx.id);
    aplicarModo();
    try{
      const consulta=await auroRecFirmaSincronizarPersistencia({
        silencioso:true,id_atencion:ctx.id,id_recomendacion:rid
      });
      state.firmaVerificacionFallida=consulta?.success!==true;
    }finally{
      if(txt(state.idRecomendacion)===rid && txt(state.contexto?.id)===txt(ctx.id)){
        state.verificandoFirma=false;
        aplicarModo();
      }
    }
    setMsg('Recomendación seleccionada: '+rid+'.','ok');
    return true;
  }

  async function nuevaRecomendacion(){
    const ctx=state.contexto||contextoAtencion();
    if(!ctx.id || !ctx.editable || state.guardando || state.cargando){
      setMsg('Seleccione una atención editable para crear una recomendación.','error');
      return false;
    }
    if(recFirmaActivaEnAtencion(ctx.id)){
      setMsg('Existe una firma en proceso. Espere o cancele antes de crear otro documento.','error');
      return false;
    }
    if(!recPermitirDescartarCambios()) return false;
    limpiar();
    state.modoNuevo=true;
    state.verificandoFirma=false;
    state.firmaVerificacionFallida=false;
    state.firmaPersistida='';
    state.firmaPersistidaAtencion='';
    precargarSeguimientoDesdePlanSiVacio();
    aplicarModo();
    renderRecomendacionGuardada();
    setMsg('Nueva recomendación independiente. Al guardar no se modificará ninguna anterior.','info');
    return true;
  }

  function aplicarModo(){
    const ctx=state.contexto || contextoAtencion();
    const bloqueadaFirma=recDocumentoFirmadoActivo();
    const editable=ctx.editable===true && !bloqueadaFirma && !state.verificandoFirma && !state.firmaVerificacionFallida;
    const bloqueadoPorGuardado=state.guardando===true;
    const app=document.getElementById('auroRecomendacionesApp');
    if(app) app.classList.toggle('auro-rec-readonly',!editable);
    // V1.5.4: un documento firmado se puede LEER y COPIAR, nunca editar.
    // Textarea/texto usan readonly (permite foco, selección, Ctrl+A y Ctrl+C).
    // Checkboxes/fecha/select permanecen deshabilitados si están protegidos.
    document.querySelectorAll('#auroRecomendacionesApp input,#auroRecomendacionesApp textarea,#auroRecomendacionesApp select').forEach(el=>{
      const seleccionable=el.tagName==='TEXTAREA' || (el.tagName==='INPUT' && ['text','search','email','tel','url'].includes(el.type));
      if(seleccionable){
        el.readOnly=!editable || bloqueadoPorGuardado;
        el.disabled=false;
        el.setAttribute('aria-readonly',String(el.readOnly));
      }else{
        el.disabled=!editable || bloqueadoPorGuardado;
      }
    });
    const guardar=document.getElementById('auroRecBtnGuardar');
    if(guardar){
      guardar.disabled=!editable || !ctx.id || bloqueadoPorGuardado;
      if(bloqueadoPorGuardado){
        guardar.setAttribute('aria-busy','true');
        guardar.innerHTML='<i class="bi bi-hourglass-split me-1"></i> Guardando...';
      }else{
        guardar.removeAttribute('aria-busy');
        guardar.innerHTML='<i class="bi bi-save2 me-1"></i> Guardar recomendaciones';
      }
    }
    const nueva=document.getElementById('auroRecBtnNueva');
    if(nueva) nueva.disabled=!ctx.editable || !ctx.id || state.guardando || state.cargando || recFirmaActivaEnAtencion(ctx.id);
    const agregarPlan=document.getElementById('auroRecBtnAgregarPlan');
    if(agregarPlan) agregarPlan.disabled=!editable || !ctx.id || bloqueadoPorGuardado;
    const recargar=document.getElementById('auroRecBtnRecargar');
    if(recargar) recargar.disabled=bloqueadoPorGuardado;
    document.querySelectorAll('[data-auro-rec-expand]').forEach(btn=>{
      btn.disabled=!ctx.id || bloqueadoPorGuardado || state.cargando;
    });
    const estado=document.getElementById('auroRecEstado');
    if(estado){
      estado.className='auro-rec-state '+(editable?'edit':'read');
      if(!ctx.id) estado.innerHTML='<i class="bi bi-lock"></i> Sin atención';
      else if(ctx.bloqueada) estado.innerHTML='<i class="bi bi-lock"></i> Atención anulada/cancelada · Solo lectura';
      else if(state.modoNuevo) estado.innerHTML='<i class="bi bi-plus-circle"></i> Nueva recomendación · Sin guardar';
      else if(state.firmaVerificacionFallida) estado.innerHTML='<i class="bi bi-exclamation-triangle"></i> Firma no verificada · Edición protegida';
      else if(state.verificandoFirma) estado.innerHTML='<i class="bi bi-shield-check"></i> Comprobando firma…';
      else if(bloqueadaFirma) estado.innerHTML='<i class="bi bi-lock"></i> Documento firmado · Protegido contra edición';
      else if(ctx.finalizada) estado.innerHTML='<i class="bi bi-check2-circle"></i> Atención finalizada · Recomendaciones editables';
      else estado.innerHTML='<i class="bi bi-pencil-square"></i> Atención activa · Editable';
    }
    auroRecFirmaActualizarUI();
  }

  function renderContexto(){
    const ctx=state.contexto || contextoAtencion();
    const a=ctx.atencion || {};

    setText('auroRecPaciente',nombrePacienteDesdeContexto(a) || 'Paciente de la atención');
    setText('auroRecAtencion',ctx.id ? 'Atención: '+ctx.id : 'Sin atención seleccionada');
    setText('auroRecConsulta',ctx.numeroConsulta ? 'Consulta #'+ctx.numeroConsulta : '—');
    setText('auroRecMedico',nombreMedicoDesdeContexto(a) || '—');
    setText('auroRecFecha',fechaVisual(a.fecha_atencion || a.fecha_consulta || a.creado_en));

    aplicarModo();
  }

  async function cargarDiagnosticos(id, tokenEsperado){
    const idEsperada=txt(id);
    if(!idEsperada) return [];

    try{
      const data=await apiGet('listarDiagnosticosPorAtencion',{id_atencion:idEsperada});
      const lista=Array.isArray(data) ? data : (Array.isArray(data?.registros) ? data.registros : []);

      const ctxActual=state.contexto || contextoAtencion();
      const idActual=txt(ctxActual?.id || idAtencionActiva());
      const tokenValido=tokenEsperado === undefined || tokenEsperado === state.tokenCarga;

      if(!tokenValido || idActual !== idEsperada) return null;

      state.diagnosticos=lista;
      renderDiagnosticos();
      return lista;
    }catch(e){
      console.warn(MODULO+': no se pudieron cargar diagnósticos.',e);

      const ctxActual=state.contexto || contextoAtencion();
      const idActual=txt(ctxActual?.id || idAtencionActiva());
      const tokenValido=tokenEsperado === undefined || tokenEsperado === state.tokenCarga;

      if(tokenValido && idActual === idEsperada){
        state.diagnosticos=[];
        renderDiagnosticos();
      }
      return null;
    }
  }

  async function cargar(forzar){
    let ctx=contextoAtencion();
    state.contexto=ctx;
    renderContexto();
    if(!ctx.id){
      state.tokenCarga++;
      state.cargando=false;
      state.registros=[];
      state.modoNuevo=false;
      state.verificandoFirma=false;
      state.firmaVerificacionFallida=false;
      limpiar();
      state.diagnosticos=[];
      state.firmaPersistida='';
      state.firmaPersistidaAtencion='';
      renderDiagnosticos();
      setMsg('Seleccione una atención antes de trabajar Recomendaciones.','info');
      return null;
    }
    const idSolicitada=txt(ctx.id);
    const mantenerId=state.idAtencion===idSolicitada?txt(state.idRecomendacion):'';
    const mantenerNuevo=state.idAtencion===idSolicitada && state.modoNuevo;
    const token=++state.tokenCarga;
    ++recomendacionFirmaHistorialToken;
    state.cargando=true;
    setMsg('Cargando historial de recomendaciones de esta atención…','info');
    try{
      const resultados=await Promise.all([
        apiGet('listarRecomendacionesPorAtencion',{id_atencion:idSolicitada}),
        enriquecerContextoDesdeServidor(ctx),
        cargarDiagnosticos(idSolicitada,token)
      ]);
      if(token!==state.tokenCarga) return null;
      const ctxVigente=contextoAtencion();
      if(txt(ctxVigente?.id)!==idSolicitada) return null;
      ctx=resultados[1]||ctxVigente||ctx;
      if(txt(ctx?.id)!==idSolicitada) return null;
      state.contexto=ctx;
      // Precarga no bloqueante: la ficha médica ya estará disponible al imprimir o firmar.
      recPrecargarMedicoImpresion(ctx).catch(()=>{});
      const raw=resultados[0];
      const items=Array.isArray(raw)?raw:(Array.isArray(raw?.registros)?raw.registros:[]);
      const docs=items.filter(r=>txt(r?.id_atencion)===idSolicitada && txt(r?.id_recomendacion));
      const registro=docs.find(r=>txt(r.id_recomendacion)===mantenerId)||docs[0]||null;
      limpiar();
      state.registros=docs;
      // Ninguna tarjeta se presume sin firma antes de consultar al servidor.
      // Los procesos locales de firma en curso tienen prioridad sobre la lectura.
      docs.forEach(reg=>{
        const rid=txt(reg.id_recomendacion);
        if(!recomendacionFirmaProcesos.has(rid)){
          recomendacionFirmasPorDocumento.set(rid,{
            estado:'VERIFICANDO',documento:null,sha_actual:'',
            version_documento:auroRecFirmaVersionDocumento(reg),error:'',id_atencion:idSolicitada
          });
        }
      });
      state.modoNuevo=mantenerNuevo;
      state.verificandoFirma=!!(registro && !mantenerNuevo);
      state.firmaVerificacionFallida=false;
      if(!mantenerNuevo && registro){
        aplicarRegistro(registro);
        fijarFirmaPersistida(idSolicitada);
        let precargadas=false;
        if(ctx.editable && !getValue('auroRecGenerales')){
          precargadas=await precargarIndicacionesDesdePlanSiVacio(idSolicitada);
          if(token!==state.tokenCarga || txt(contextoAtencion()?.id)!==idSolicitada) return null;
        }
        setMsg(precargadas?'Historial cargado; indicaciones del Plan precargadas para revisión.':'Historial de recomendaciones cargado correctamente.','ok');
      }else if(!mantenerNuevo){
        const precargado=ctx.editable?precargarSeguimientoDesdePlanSiVacio():false;
        const desdePlan=ctx.editable?await precargarIndicacionesDesdePlanSiVacio(idSolicitada):false;
        if(token!==state.tokenCarga || txt(contextoAtencion()?.id)!==idSolicitada) return null;
        setMsg((precargado||desdePlan)?'No hay recomendaciones anteriores. Se precargaron indicaciones disponibles para revisión.':'Esta atención todavía no tiene recomendaciones guardadas.','info');
      }else{
        setMsg('Nueva recomendación en preparación. Sus cambios todavía no están guardados.','info');
      }
      state.idAtencion=idSolicitada;
      renderContexto();
      if(registro && state.idRecomendacion && !state.modoNuevo){
        const consulta=await auroRecFirmaSincronizarPersistencia({
          silencioso:true,id_atencion:idSolicitada,id_recomendacion:state.idRecomendacion
        });
        state.firmaVerificacionFallida=consulta?.success!==true;
      }else{
        auroRecFirmaActualizarUI();
      }
      return state.modoNuevo?null:registro;
    }catch(e){
      if(token!==state.tokenCarga || txt(contextoAtencion()?.id)!==idSolicitada) return null;
      console.error(MODULO+':',e);
      setMsg('No se pudo cargar el historial: '+txt(e.message||e),'error');
      return null;
    }finally{
      if(token===state.tokenCarga){
        state.cargando=false;
        state.verificandoFirma=false;
        aplicarModo();
        // Lectura en segundo plano de TODAS las demás recomendaciones de esta atención.
        // Dos consultas simultáneas como máximo, sin POST de firma ni regeneración de PDF.
        if(txt(contextoAtencion()?.id)===idSolicitada && state.registros.length){
          void recFirmaSincronizarHistorial(idSolicitada,state.registros.slice(),token,
            !state.modoNuevo?state.idRecomendacion:'');
        }
      }
    }
  }

  function datosGuardar(ctxForzado, detalleForzado){
    const ctx=ctxForzado || state.contexto || contextoAtencion();
    const a=ctx.atencion || {};
    const detalle=detalleForzado || detalleActual();

    return {
      id_recomendacion:state.modoNuevo?'':(state.idRecomendacion || ''),
      ...(state.modoNuevo?{forzar_nueva_recomendacion:'SI'}:{}),
      id_atencion:ctx.id || '',
      id_cita:txt(a.id_cita),
      id_paciente:txt(a.id_paciente),
      id_historia:txt(a.id_historia),
      id_medico:txt(a.id_medico),
      fecha_atencion:a.fecha_atencion || '',
      detalle_json:JSON.stringify(detalle),
      estado:'Activo'
    };
  }

  async function guardar(){
    if(state.guardando) return;

    const ctx=contextoAtencion();
    state.contexto=ctx;

    if(!ctx.id){
      setMsg('No existe una atención activa para guardar recomendaciones.','error');
      return;
    }

    if(!ctx.editable){
      setMsg('La consulta seleccionada es histórica y está protegida contra edición.','error');
      return;
    }
    if(state.verificandoFirma || state.firmaVerificacionFallida){
      setMsg('Espere o recargue para comprobar el estado de firma antes de guardar.','info');
      return;
    }
    if(recDocumentoFirmadoActivo()){
      setMsg('Documento firmado: para agregar cambios cree una nueva recomendación.','error');
      return;
    }
    if(recFirmaActivaEnAtencion(ctx.id)){
      setMsg('Existe una firma en proceso. No se editará el documento mientras se firma.','error');
      return;
    }

    const idGuardado=txt(ctx.id);
    const detalle=detalleActual();

    if(!tieneContenido(detalle)){
      setMsg('Ingrese al menos una recomendación, seguimiento, signo de alerta o cuidado antes de guardar.','error');
      return;
    }

    /* Barrera no-op: mismo contenido clínico persistido = cero POST. */
    if(
      !state.modoNuevo &&
      state.firmaPersistidaAtencion === idGuardado &&
      state.firmaPersistida &&
      firmaDetalle(detalle) === state.firmaPersistida
    ){
      setMsg('No hay cambios nuevos en Recomendaciones para guardar.','info');
      return;
    }

    const tokenGuardado=++state.tokenGuardado;
    const btn=document.getElementById('auroRecBtnGuardar');
    state.guardando=true;
    aplicarModo();

    function guardadoSigueVigente(){
      const ctxActual=contextoAtencion();
      return tokenGuardado === state.tokenGuardado && txt(ctxActual?.id) === idGuardado;
    }

    try{
      const data=datosGuardar(ctx,detalle);
      const r=await apiPost('guardarRecomendacion',data);

      if(!guardadoSigueVigente()) return;

      if(!r || r.success === false){
        throw new Error(txt(r?.message || 'No se pudo guardar Recomendaciones.'));
      }

      state.idRecomendacion=txt(r.id || r.id_recomendacion || data.id_recomendacion);
      state.modoNuevo=false;
      if(state.idRecomendacion){
        const nuevo=Object.assign({},state.registro||{},data,{
          id_recomendacion:state.idRecomendacion,
          id_atencion:idGuardado,
          actualizado_en:txt(r.actualizado_en||r.fecha_actualizacion||new Date().toISOString())
        });
        delete nuevo.forzar_nueva_recomendacion;
        state.registros=(state.registros||[]).filter(x=>txt(x.id_recomendacion)!==state.idRecomendacion);
        state.registros.unshift(nuevo);
        aplicarRegistro(nuevo);
        fijarFirmaPersistida(idGuardado);
        auroRecFirmaActualizarUI();
      }

      /*
        Recarga autoritativa de la MISMA atención. La carga fija la firma persistida
        desde lo realmente devuelto por backend antes de cualquier precarga del Plan.
      */
      await cargar(true);

      if(!guardadoSigueVigente()) return;

      setMsg(
        r.actualizado ? 'Recomendaciones actualizadas correctamente.' : 'Recomendaciones guardadas correctamente.',
        'ok'
      );

      window.dispatchEvent(new CustomEvent('aurosanax:recomendaciones-guardadas',{
        detail:{id_atencion:idGuardado,id_recomendacion:state.idRecomendacion}
      }));
    }catch(e){
      if(!guardadoSigueVigente()) return;
      console.error(MODULO+':',e);
      setMsg('No se pudo guardar: '+txt(e.message || e),'error');
    }finally{
      if(tokenGuardado === state.tokenGuardado){
        state.guardando=false;
        aplicarModo();

        if(btn && document.body.contains(btn)){
          btn.removeAttribute('aria-busy');
          btn.innerHTML='<i class="bi bi-save2 me-1"></i> Guardar recomendaciones';
        }
      }
    }
  }



  /* ============================================================
     IASYN RECOMENDACIONES 1.2.0
     IMPRESIÓN A4 BASADA EN EL DOCUMENTO MAESTRO DE CERTIFICADOS
     ----------------------------------------------------------------
     ALCANCE QUIRÚRGICO / ANTIRREGRESIÓN
     - Sustituye ÚNICAMENTE la representación de vista/impresión.
     - Conserva guardado, detalle_json, carga, diagnósticos, atención,
       eventos, endpoints, Google Sheets, Plan y demás módulos.
     - Mantiene una sola geometría documental A4.
     - Escritorio, tablet, iPhone y Android solo escalan el visor.
     - La impresión real no hereda el zoom visual del dispositivo.
     ============================================================ */

  /* Normalización de lectura: admite envoltorios de API sin alterar datos persistidos. */
  function recConfigObjeto(valor){
    if(!valor || typeof valor!=='object' || Array.isArray(valor)) return {};
    let c=valor;
    for(let i=0;i<4;i++){
      const siguiente=[c.datos,c.configuracion,c.config,c.centro,c.data]
        .find(x=>x && typeof x==='object' && !Array.isArray(x));
      if(!siguiente) break;
      c=Object.assign({},c,siguiente);
      if(siguiente===c) break;
      /* Se conserva la prioridad de los campos del objeto interno. */
      delete c.datos;
      delete c.configuracion;
      delete c.config;
      delete c.centro;
      delete c.data;
    }
    return c;
  }

  function recDireccionConfig(c){
    c=recConfigObjeto(c);
    const ubicacion=recConfigObjeto(c.ubicacion);
    const contacto=recConfigObjeto(c.contacto);
    return primerTexto(
      c.direccion_clinica,c.direccion_centro,c.direccion_establecimiento,
      c.direccion_consultorio,c.direccion_fiscal,c.direccion,
      c.domicilio,c.domicilio_fiscal,c.direccion_matriz,
      ubicacion.direccion_clinica,ubicacion.direccion,ubicacion.domicilio,
      contacto.direccion
    );
  }

  function recConfigInstitucional(){
    const candidatos=[
      window.auroConfiguracionCentro,
      window.configuracionCentro,
      window.configCentro,
      window.CONFIG_CENTRO,
      window.configuracionInstitucional
    ];
    const c=recConfigObjeto(candidatos.find(x=>x&&typeof x==='object'&&!Array.isArray(x))||{});

    return {
      nombre:primerTexto(c.nombre_clinica,c.nombre_centro,c.nombre_comercial,c.razon_social,'IASYN'),
      subtitulo:primerTexto(c.subtitulo_clinica,c.descripcion_clinica,c.eslogan_clinica),
      especialidad:primerTexto(c.especialidad_clinica,c.especialidad_centro,c.especialidad_principal,c.especialidad),
      razon_social:txt(c.razon_social),
      ruc:txt(c.ruc),
      direccion:recDireccionConfig(c),
      ciudad:primerTexto(c.ciudad_clinica,c.ciudad),
      provincia:primerTexto(c.provincia_clinica,c.provincia),
      pais:primerTexto(c.pais_clinica,c.pais),
      telefono:primerTexto(c.telefono_clinica,c.whatsapp_clinica,c.telefono,c.whatsapp),
      email:primerTexto(c.email_clinica,c.correo_clinica,c.email,c.correo),
      web:primerTexto(c.sitio_web_clinica,c.web_clinica,c.web),
      logo:primerTexto(c.logo_url,c.logo_drive_url,c.logo),
      colorPrincipal:primerTexto(c.color_principal,'#8b1e5a')
    };
  }

  /* Identidad institucional vigente: consulta aislada, sin escrituras. */
  async function recIdentidadDocumento(){
    let remoto={};
    try{
      const r=await apiGet('obtenerConfiguracion',{});
      if(r && r.success===false) throw new Error(txt(r.message||'No se pudo leer la configuración institucional.'));
      remoto=recConfigObjeto(r);
      /* La API histórica puede responder con filas {clave,valor}; se normalizan
         solo en memoria, sin alterar la configuración ni efectuar escrituras. */
      const filas=Array.isArray(r)?r:
        (Array.isArray(r?.data)?r.data:
        (Array.isArray(r?.datos)?r.datos:
        (Array.isArray(r?.registros)?r.registros:
        (Array.isArray(r?.resultado)?r.resultado:[]))));
      if(filas.length){
        const valores={};
        filas.forEach(f=>{
          const k=txt(f?.clave);
          if(k && f?.valor!==undefined && f?.valor!==null) valores[k]=f.valor;
        });
        remoto=Object.assign({},valores,remoto);
      }
      /* Compatibilidad con instalaciones donde obtenerConfiguracion devuelve
         una respuesta parcial: consultar la lista SOLO si falta dirección. */
      if(!recDireccionConfig(remoto)){
        try{
          const listado=await apiGet('listarConfiguracion',{});
          if(listado && listado.success===false) throw new Error(txt(listado.message||'Listado institucional no disponible.'));
          const rows=Array.isArray(listado)?listado:
            (Array.isArray(listado?.data)?listado.data:
            (Array.isArray(listado?.datos)?listado.datos:
            (Array.isArray(listado?.registros)?listado.registros:[])));
          const valores={};
          rows.forEach(f=>{
            const k=txt(f?.clave);
            if(k && f?.valor!==undefined && f?.valor!==null) valores[k]=f.valor;
          });
          remoto=Object.assign({},valores,remoto);
        }catch(_e){ /* No interrumpe emisión ni firma. */ }
      }
      if(!recDireccionConfig(remoto)){
        console.warn(MODULO+': la configuración consultada no contiene direccion_clinica. Verifique que el valor esté guardado en el centro activo.');
      }
    }catch(e){
      console.warn(MODULO+': no se pudo consultar configuración institucional.',e);
    }
    const base=recConfigInstitucional();
    /* Nunca se inventa una dirección: el dato proviene del servidor o de la configuración activa. */
    const campo=(...claves)=>primerTexto(...claves.map(k=>remoto[k]));
    const cfg=Object.assign({},base,{
      nombre:campo('nombre_clinica','nombre_centro','nombre_comercial','razon_social')||base.nombre,
      subtitulo:campo('subtitulo_clinica','descripcion_clinica','eslogan_clinica')||base.subtitulo,
       especialidad:campo('especialidad_clinica','especialidad_centro','especialidad_principal','especialidad')||base.especialidad,
      razon_social:campo('razon_social')||base.razon_social,
      ruc:campo('ruc')||base.ruc,
      direccion:recDireccionConfig(remoto)||base.direccion,
      ciudad:campo('ciudad_clinica','ciudad')||base.ciudad,
      provincia:campo('provincia_clinica','provincia')||base.provincia,
      pais:campo('pais_clinica','pais')||base.pais,
      telefono:campo('telefono_clinica','whatsapp_clinica','telefono','whatsapp')||base.telefono,
      email:campo('email_clinica','correo_clinica','email','correo')||base.email,
      web:campo('sitio_web_clinica','web_clinica','web')||base.web,
      logo:campo('logo_url','logo_drive_url','logo')||base.logo,
      colorPrincipal:campo('color_principal')||base.colorPrincipal
    });
    /* La imagen embebida funciona tanto en el visor como al imprimir/PDF. */
    let logo=cfg.logo;
    try{
      const r=await auroRecFirmaPost('obtenerLogoInstitucionalFirma',{});
      if(r?.disponible && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(txt(r.data_url))){
        logo=txt(r.data_url);
      }
    }catch(e){
      console.warn(MODULO+': logo embebido no disponible; se conserva URL configurada.',e);
    }
    return {configuracion:cfg,logo:logo};
  }

  function recNombreCompleto(obj){
    obj=obj||{};
    return primerTexto(
      obj.nombre_completo,
      obj.nombre,
      [obj.nombres,obj.apellidos].filter(Boolean).join(' ')
    ).replace(/\s+/g,' ').trim();
  }

  function recPacienteImpresion(ctx){
    const a=ctx?.atencion||{};
    const id=txt(ctx?.idPaciente||a.id_paciente);
    let p=null;

    try{
      if(typeof window.getPacienteActivo==='function'){
        const x=window.getPacienteActivo();
        const xid=txt(x?.id_paciente||x?.id);
        if(x && (!id || !xid || xid===id)) p=x;
      }
    }catch(e){}

    if(!p){
      const listas=[window.patients,window.pacientes,window.listaPacientes].filter(Array.isArray);
      for(const lista of listas){
        p=lista.find(x=>txt(x?.id_paciente||x?.id)===id)||null;
        if(p) break;
      }
    }

    p=p||{};
    return {
      nombre:recNombreCompleto(p)||nombrePacienteDesdeContexto(a)||'Paciente',
      documento:primerTexto(p.numero_documento,p.cedula,p.documento,p.identificacion,a.numero_documento,a.cedula,a.identificacion),
      telefono:primerTexto(p.telefono,p.whatsapp,a.telefono,a.whatsapp)
    };
  }

  /* ============================================================
     IASYN RECOMENDACIONES V1.4.1 — CORRECCIÓN QUIRÚRGICA DE IMPRESIÓN
     - Solo lectura: se reutiliza el endpoint existente listarMedicosActivos.
     - Caché por ID exacto del médico: no cruza datos entre consultas.
     - Una solicitud en vuelo por médico: no ralentiza innecesariamente
       las vistas previas ni crea consultas duplicadas.
     - Fallo de lectura: mantiene impresión y firma con datos disponibles.
     - No altera guardado, motor de firma, PDF firmado ni estilos A4.
     ============================================================ */
  const recMedicosImpresionPorId = new Map();
  const recMedicosImpresionPendientes = new Map();

  async function recPrecargarMedicoImpresion(ctx){
    const id=txt(ctx?.atencion?.id_medico||ctx?.idMedico);
    if(!id) return null;
    if(recMedicosImpresionPorId.has(id)) return recMedicosImpresionPorId.get(id);
    if(recMedicosImpresionPendientes.has(id)) return recMedicosImpresionPendientes.get(id);

    const pendiente=(async()=>{
      try{
        const respuesta=await apiGet('listarMedicosActivos');
        if(respuesta?.success===false) throw new Error(txt(respuesta.message||'No se pudo consultar médicos.'));
        const lista=Array.isArray(respuesta)?respuesta:
          (Array.isArray(respuesta?.data)?respuesta.data:
          (Array.isArray(respuesta?.medicos)?respuesta.medicos:
          (Array.isArray(respuesta?.registros)?respuesta.registros:[])));
        const medico=lista.find(m=>txt(m?.id_medico||m?.id||m?.codigo)===id)||null;
        if(medico) recMedicosImpresionPorId.set(id,medico);
        return medico;
      }catch(error){
        console.warn(MODULO+': no se pudo precargar la ficha del médico para impresión; se conserva el origen local.',error);
        return null;
      }finally{
        recMedicosImpresionPendientes.delete(id);
      }
    })();
    recMedicosImpresionPendientes.set(id,pendiente);
    return pendiente;
  }

  function recMedicoImpresion(ctx){
    const a=ctx?.atencion||{};
    const id=txt(a.id_medico||ctx?.idMedico);
    const listas=[
      recMedicosImpresionPorId.has(id)?[recMedicosImpresionPorId.get(id)]:[],
      window.medicos,
      window.medicosActivos,
      window.listaMedicos,
      window.configuracionMedicos,
      window.medicosConfiguracion
    ].filter(Array.isArray);

    let m=null;
    for(const lista of listas){
      m=lista.find(x=>txt(x?.id_medico||x?.id||x?.codigo)===id)||null;
      if(m) break;
    }

    m=m||{};
    return {
      nombre:recNombreCompleto(m)||nombreMedicoDesdeContexto(a)||'Profesional tratante',
      especialidad:primerTexto(
        m.especialidad_principal,m.especialidad,m.especialidad_medica,
        a.especialidad,a.medico_especialidad
      ),
      registro_msp:primerTexto(m.registro_msp,m.msp,m.registro_profesional),
      registro_senescyt:primerTexto(m.registro_senescyt,m.senescyt),
      email:primerTexto(m.email,m.correo)
    };
  }

  function recFechaDocumento(v){
    const raw=txt(v);
    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m?`${m[3]}/${m[2]}/${m[1]}`:(raw||'—');
  }

  function recCie10Visual(valor){
    const raw=txt(valor);if(!raw) return '';
    const s=raw.toUpperCase().replace(/\s+/g,'');
    if(/^([A-Z]\d{2})(?:\.[0-9A-Z]{1,4})?$/.test(s)) return s;
    const m=s.match(/^([A-Z]\d{2})([0-9A-Z]{1,4})$/);
    return m?m[1]+'.'+m[2]:raw;
  }

  function recListaHTML(items){
    const arr=(items||[]).filter(Boolean);
    return arr.length
      ? `<ul class="ar-doc-list">${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`
      : '';
  }

  /* V1.5.0 — conserva literalmente los párrafos, repeticiones y saltos de línea.
     Solo representa listas si el profesional introdujo marcadores explícitos. */
  function recRecomendacionesHTML(texto){
    const raw=txt(texto);if(!raw) return '';
    const lineas=raw.split(/\r?\n/);
    let actual=[],tipo='',salida=[];
    function cerrar(){
      if(!actual.length) return;
      if(tipo==='ul'){
        salida.push('<ul class="ar-doc-list ar-rec-list">'+actual.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>');
      }else if(tipo==='ol'){
        salida.push('<ol class="ar-doc-list ar-rec-list">'+actual.map(v=>'<li value="'+v.n+'">'+esc(v.t)+'</li>').join('')+'</ol>');
      }else{
        salida.push('<p class="ar-rec-text">'+actual.map(esc).join('<br>')+'</p>');
      }
      actual=[];tipo='';
    }
    lineas.forEach(l=>{
      const v=l.trim();
      if(!v){cerrar();return;}
      const bullet=v.match(/^[•●▪◦\-*–—]\s+(.+)$/);
      const num=v.match(/^(\d+)[.)]\s+(.+)$/);
      const next=bullet?'ul':(num?'ol':'p');
      if(tipo && next!==tipo) cerrar();
      tipo=next;
      if(next==='ul') actual.push(bullet[1]);
      else if(next==='ol') actual.push({n:Number(num[1]),t:num[2]});
      else actual.push(v);
    });
    cerrar();return salida.join('');
  }

  /* IASYN2 V1.5 — paginación A4 aislada y determinista.
     - Ensambla páginas físicas con tamaño imprimible 180 x 273 mm.
     - Conserva el texto de cada párrafo, incluidos los repetidos.
     - Solo reproduce el pie institucional en la última página.
     - No consulta servidor, no guarda ni altera el proceso de firma.
     - Ante navegador sin medición, utiliza la maquetación fluida segura. */
  function recPaginarHTML(html){
    if(typeof document==='undefined' || !document.body || window.IASYN_REC_PAGINACION_FLUIDA===true) {
      return recPaginarRespaldoSeguro(html);
    }
    let marco=null;
    try{
      marco=document.createElement('iframe');
      marco.setAttribute('aria-hidden','true');marco.setAttribute('tabindex','-1');
      marco.style.cssText='position:fixed;left:-10000px;top:0;width:180mm;height:273mm;visibility:hidden;pointer-events:none;border:0';
      document.body.appendChild(marco);
      const d=marco.contentDocument;
      if(!d) return recPaginarRespaldoSeguro(html);
      d.open();
      d.write('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>'+recEstilosImpresion()+
        '.ar-page{width:100%!important;height:263mm!important;min-height:263mm!important;max-height:263mm!important;display:flex!important;flex-direction:column!important;overflow:visible!important;break-after:page;page-break-after:always}'+
        '.ar-page-main{width:100%;flex:0 0 auto;display:flow-root}.ar-page .ar-firma-area{padding-top:18mm!important;margin-top:auto!important}'+
        '</style></head><body></body></html>');
      d.close();
      const plantilla=d.createElement('template');plantilla.innerHTML=html;
      const origen=plantilla.content.querySelector('.ar-paper');
      const footerOriginal=origen?.querySelector(':scope > .ar-firma-area');
      if(!origen || !footerOriginal) return recPaginarRespaldoSeguro(html);
      const raiz=d.createElement('div');raiz.className='ar-paginas';d.body.appendChild(raiz);
      let paginaActual=null,cuerpoActual=null,seccionActual=null;
      const paginas=[];
      const crearPagina=()=>{
        paginaActual=d.createElement('article');paginaActual.className='ar-paper ar-page';
        paginaActual.style.cssText=origen.style.cssText;
        cuerpoActual=d.createElement('div');cuerpoActual.className='ar-page-main';
        paginaActual.appendChild(cuerpoActual);raiz.appendChild(paginaActual);
        paginas.push(paginaActual);seccionActual=null;return paginaActual;
      };
      crearPagina();
      const mm=d.createElement('div');mm.style.cssText='height:1mm;width:1mm;position:absolute;visibility:hidden';d.body.appendChild(mm);
      const pxmm=mm.getBoundingClientRect().height||3.779527559;mm.remove();
      const tempFooter=footerOriginal.cloneNode(true);tempFooter.style.marginTop='0';tempFooter.style.paddingTop='18mm';
      paginaActual.appendChild(tempFooter);
      const altoFooter=tempFooter.getBoundingClientRect().height;
      tempFooter.remove();
      // Altura segura 263 mm: margen interior para los distintos motores de PDF.
      // No se modifica @page ni la geometría externa de A4.
      const maximo=(263*pxmm)-(4*pxmm); // 259 mm de cuerpo clínico por hoja.
      const cabe=()=>cuerpoActual.getBoundingClientRect().height <= maximo+0.5;
      const intentar=(n,padre)=>{padre.appendChild(n);if(cabe()) return true;n.remove();return false;};
      const moverPagina=()=>crearPagina();
      // Agrega párrafos largos por palabras cuando no caben enteros.
      function textoElemento(el){
        return Array.from(el.childNodes).map(n=>n.nodeName==='BR'?'\n':(n.textContent||'')).join('');
      }
      function dividirTexto(elemento,padreNuevo){
        let restante=textoElemento(elemento);
        let total=0;
        while(restante){
          if(++total>300) throw new Error('Límite preventivo de segmentación alcanzado');
          const partes=restante.split(/(\s+)/).filter(x=>x!=='');
          let lo=1,hi=partes.length,mejor=0;
          const candidato=elemento.cloneNode(false);
          padreNuevo.appendChild(candidato);
          while(lo<=hi){
            const mid=(lo+hi)>>1;
            candidato.textContent=partes.slice(0,mid).join('');
            if(cabe()){mejor=mid;lo=mid+1;}else hi=mid-1;
          }
          candidato.remove();
          if(!mejor) return restante;
          const parte=partes.slice(0,mejor).join('');
          const pedazo=elemento.cloneNode(false);pedazo.textContent=parte;pedazo.classList.add('ar-parrafo-fragmento');
          padreNuevo.appendChild(pedazo);
          restante=partes.slice(mejor).join('');
          if(!restante) return '';
          // El llamador seguirá en la página siguiente, sin perder texto.
          return restante;
        }
        return '';
      }
      function agregarNormal(node){
        if(intentar(node.cloneNode(true),cuerpoActual)) return;
        if(cuerpoActual.children.length) moverPagina();
        if(intentar(node.cloneNode(true),cuerpoActual)) return;
        if(node.tagName==='P'){
          let restante=textoElemento(node),n=0;
          while(restante){
            if(++n>300) throw new Error('Párrafo excesivo para impresión');
            const frag=node.cloneNode(false);frag.textContent=restante;
            if(intentar(frag,cuerpoActual)) break;
            const nuevo=dividirTexto(frag,cuerpoActual);
            if(nuevo===restante){moverPagina();continue;}
            restante=nuevo;if(restante) moverPagina();
          }
        }else{
          // El bloque inusual se conserva íntegro en vez de descartar información.
          cuerpoActual.appendChild(node.cloneNode(true));moverPagina();
        }
      }
      function nuevaSeccion(template,continuacion){
        const s=template.cloneNode(false);
        if(template.dataset.iasynSeccion) s.dataset.iasynSeccion=template.dataset.iasynSeccion;
        if(!continuacion){const h=template.querySelector(':scope > h3');if(h) s.appendChild(h.cloneNode(true));}
        cuerpoActual.appendChild(s);seccionActual=s;return s;
      }
      function agregarParrafoSeccion(node,seccionPlantilla){
        let original=node.cloneNode(true);
        if(intentar(original,seccionActual)) return;
        // Cuando el título quedaría solo al pie, trasladarlo con el primer texto.
        const espacioRestante=maximo-cuerpoActual.getBoundingClientRect().height;
        // Un párrafo gigante comienza en esta misma hoja si hay espacio suficiente;
        // nunca se traslada íntegro dejando la primera página vacía.
        if(espacioRestante<65){
          if(seccionActual.children.length<=1 && seccionActual.querySelector('h3')){
            seccionActual.remove();moverPagina();nuevaSeccion(seccionPlantilla,false);
          }else{moverPagina();nuevaSeccion(seccionPlantilla,true);}
          if(intentar(node.cloneNode(true),seccionActual)) return;
        }
        let restante=textoElemento(node),n=0;
        while(restante){
          if(++n>300) throw new Error('Contenido excesivo para impresión');
          const p=node.cloneNode(false);p.textContent=restante;
          if(intentar(p,seccionActual)) break;
          const nuevo=dividirTexto(p,seccionActual);
          if(nuevo===restante){moverPagina();nuevaSeccion(seccionPlantilla,true);continue;}
          restante=nuevo;
          if(restante){moverPagina();nuevaSeccion(seccionPlantilla,true);}
        }
      }
      function agregarLista(lista,template){
        let grupo=null;
        const abrir=()=>{grupo=lista.cloneNode(false);seccionActual.appendChild(grupo);};
        abrir();
        Array.from(lista.children).forEach(item=>{
          if(intentar(item.cloneNode(true),grupo)) return;
          if(!grupo.children.length) grupo.remove();
          const encabezadoHuerfano=seccionActual.children.length===1 && seccionActual.firstElementChild.tagName==='H3';
          if(encabezadoHuerfano) seccionActual.remove();
          moverPagina();nuevaSeccion(template,encabezadoHuerfano?false:true);abrir();
          if(intentar(item.cloneNode(true),grupo)) return;
          // Una viñeta excepcionalmente extensa se divide conservando la numeración.
          let resto=textoElemento(item),n=0;
          while(resto){
            if(++n>300) throw new Error('Lista excesiva para impresión');
            const p=item.cloneNode(false);p.textContent=resto;
            if(intentar(p,grupo)) break;
            const nuevo=dividirTexto(p,grupo);
            if(nuevo===resto){moverPagina();nuevaSeccion(template,true);abrir();continue;}
            resto=nuevo;
            if(resto){moverPagina();nuevaSeccion(template,true);abrir();}
          }
        });
      }
      Array.from(origen.children).forEach(node=>{
        if(node===footerOriginal) return;
        if(!node.classList.contains('ar-section')){agregarNormal(node);return;}
        const plantillaSeccion=node;
        plantillaSeccion.dataset.iasynSeccion=String(Array.from(origen.children).indexOf(node));
        nuevaSeccion(plantillaSeccion,false);
        // Probar el título y su primer elemento como unidad para evitar títulos huérfanos.
        const hijos=Array.from(node.children).filter(x=>x.tagName!=='H3');
        if(!hijos.length) return;
        hijos.forEach(sub=>{
          if(sub.tagName==='UL' || sub.tagName==='OL') agregarLista(sub,plantillaSeccion);
          else agregarParrafoSeccion(sub,plantillaSeccion);
        });
      });
      // Reserva del pie SOLO en la última página. El resto conserva máxima capacidad.
      // Si queda un espacio insuficiente, trasladar los últimos párrafos completos
      // a una nueva última página, manteniendo el orden y la identidad de los bloques.
      const maximaFinal=(263*pxmm)-(3*pxmm);
      if(cuerpoActual.getBoundingClientRect().height + altoFooter > maximaFinal){
        const anterior=cuerpoActual;
        moverPagina();
        const destino=cuerpoActual;
        let movimientos=0;
        while(anterior.getBoundingClientRect().height+altoFooter > maximaFinal){
          if(++movimientos>80) throw new Error('No fue posible reservar el pie final sin recortar texto');
          const ultimo=anterior.lastElementChild;
          if(!ultimo) break;
          if(ultimo.classList.contains('ar-section') && ultimo.children.length>1){
            const hoja=ultimo.lastElementChild;
            if(hoja.tagName==='UL'||hoja.tagName==='OL'){
              const item=hoja.lastElementChild;
              if(item){
                item.remove();
                let copia=destino.firstElementChild;
                if(!copia || !copia.classList.contains('ar-section') || copia.dataset.iasynSeccion!==ultimo.dataset.iasynSeccion){copia=ultimo.cloneNode(false);destino.prepend(copia);}
                let lista=copia.firstElementChild;
                if(!lista || (lista.tagName!=='UL' && lista.tagName!=='OL')){lista=hoja.cloneNode(false);copia.prepend(lista);}
                lista.prepend(item);
                if(!hoja.children.length) hoja.remove();
              }else hoja.remove();
            }else{
              hoja.remove();
              let copia=destino.firstElementChild;
              if(!copia || !copia.classList.contains('ar-section') || copia.dataset.iasynSeccion!==ultimo.dataset.iasynSeccion){copia=ultimo.cloneNode(false);destino.prepend(copia);}
              copia.prepend(hoja);
            }
            if(ultimo.children.length===1 && ultimo.firstElementChild.tagName==='H3'){
              let destinoSeccion=destino.firstElementChild;
              if(destinoSeccion && destinoSeccion.dataset.iasynSeccion===ultimo.dataset.iasynSeccion) destinoSeccion.prepend(ultimo.firstElementChild);
              ultimo.remove();
            }
          }else{
            ultimo.remove();destino.prepend(ultimo);
          }
        }
        if(destino.getBoundingClientRect().height+altoFooter>maximaFinal){
          // Contenido individual inusualmente grande: conservar el flujo nativo.
          throw new Error('El pie excede la última página después de reubicar contenido');
        }
      }
      paginaActual.appendChild(footerOriginal.cloneNode(true));
      /* V1.5.2 — inspección preventiva del cierre: nunca entregar al motor
         un artículo final vacío cuyo único contenido sea el pie. Si se
         produce por falta de altura utilizable, el respaldo seguro fluirá
         el pie detrás del último párrafo en lugar de forzar hoja exclusiva. */
      if(paginas.length>1 && !paginas[paginas.length-1].querySelector('.ar-page-main')?.textContent.trim()){
        throw new Error('Cierre paginado sin contenido clínico en la última hoja');
      }
      // La vista previa y el documento remitido a firma utilizan exactamente el mismo HTML.
      return raiz.innerHTML;
    }catch(e){
      console.warn(MODULO+': paginación A4 manual no disponible; se aplica respaldo de flujo legible.',e);
      return recPaginarRespaldoSeguro(html);
    }finally{if(marco) marco.remove();}
  }

  /* Respaldo de impresión cuando Chromium/iframe no puede medir.
     Un documento extenso no debe crear una última página solo para el pie.
     No se usa firma falsa ni se altera la firma electrónica. */
  function recPaginarRespaldoSeguro(html){
    return String(html||'').replace('class="ar-paper"', 'class="ar-paper ar-flujo-respaldo"');
  }

  function recDocumentoHTML(opciones){
    opciones=opciones||{};
    const ctx=opciones.ctx||state.contexto||contextoAtencion();
    const a=ctx.atencion||{};
    const d=opciones.detalle||detalleActual();
    const cfg=opciones.configuracion||recConfigInstitucional();
    const diagnosticos=Array.isArray(opciones.diagnosticos)?opciones.diagnosticos:state.diagnosticos;
    const logoFuente=Object.prototype.hasOwnProperty.call(opciones,'logo')
      ? txt(opciones.logo)
      : txt(cfg.logo);
    const paciente=recPacienteImpresion(ctx);
    const medico=recMedicoImpresion(ctx);

    const alertas=ALERTAS
      .filter(([k])=>(d.signos_alerta?.seleccionados||[]).includes(k))
      .map(([,l])=>l);

    const infeccion=INFECCION
      .filter(([k])=>(d.signos_infeccion?.seleccionados||[]).includes(k))
      .map(([,l])=>l);

    const dx=diagnosticos.map(x=>({
      codigo:recCie10Visual(x.codigo_cie10||x.codigo||x.cie10),
      nombre:txt(x.descripcion||x.nombre||x.diagnostico)
    })).filter(x=>x.codigo||x.nombre);

    const fecha=recFechaDocumento(
      a.fecha_atencion||a.fecha_consulta||a.creado_en||new Date().toISOString().slice(0,10)
    );

    const ubicacion=[cfg.direccion,[cfg.ciudad,cfg.provincia,cfg.pais].filter(Boolean).join(', ')]
      .filter(Boolean).join(' · ');
    // Presentacion del pie institucional: misma iconografia SVG que Certificados.
    // Solo se cambian los elementos visuales, no los datos ni el flujo clinico.
    const contactoFilas=[
      ['direccion',ubicacion],
      ['correo',txt(cfg.email)],
      ['telefono',txt(cfg.telefono)],
      ['web',txt(cfg.web)]
    ].filter(([,valor])=>!!valor);
    const contactoIconos={
      direccion:'<path d="M12 21s-7-4.4-7-11a7 7 0 0 1 14 0c0 6.6-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
      correo:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
      telefono:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.1 10a16 16 0 0 0 6.9 6.9l1.6-1.9a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z"/>',
      web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>'
    };
    const contactoHTML=contactoFilas.map(([tipo,valor])=>
      `<div class="ar-contacto-fila"><svg class="ar-contacto-icono" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contactoIconos[tipo]}</svg><span class="ar-contacto-texto">${esc(valor)}</span></div>`
    ).join('');
    const registros=[
      medico.registro_msp ? 'MSP: '+medico.registro_msp : '',
      medico.registro_senescyt ? 'SENESCYT: '+medico.registro_senescyt : ''
    ].filter(Boolean);

    const logo=logoFuente
      ? `<div class="ar-logo-wrap"><img class="ar-logo" src="${esc(logoFuente)}" alt=""></div>`
      : '';

    const seguimiento=[
      d.seguimiento?.proxima_cita ? `<div class="ar-line"><b>PRÓXIMO CONTROL:</b> ${esc(recFechaDocumento(d.seguimiento.proxima_cita))}</div>` : '',
      d.seguimiento?.motivo ? `<div class="ar-line"><b>MOTIVO DEL CONTROL:</b> ${esc(d.seguimiento.motivo)}</div>` : ''
    ].filter(Boolean).join('');

    const bloques=[
      (alertas.length||txt(d.signos_alerta?.otros)) ? `
        <section class="ar-section">
          <h3>SIGNOS DE ALERTA</h3>
          ${recListaHTML(alertas)}
          ${d.signos_alerta?.otros?recRecomendacionesHTML(d.signos_alerta.otros):''}
        </section>` : '',
      (infeccion.length||txt(d.signos_infeccion?.otros)) ? `
        <section class="ar-section">
          <h3>SIGNOS DE INFECCIÓN</h3>
          ${recListaHTML(infeccion)}
          ${d.signos_infeccion?.otros?recRecomendacionesHTML(d.signos_infeccion.otros):''}
        </section>` : '',
      txt(d.dieta_cuidados) ? `
        <section class="ar-section">
          <h3>DIETA Y CUIDADOS</h3>
          ${recRecomendacionesHTML(d.dieta_cuidados)}
        </section>` : '',
      txt(d.recomendaciones_generales) ? `
        <section class="ar-section">
          <h3>RECOMENDACIONES GENERALES</h3>
          ${recRecomendacionesHTML(d.recomendaciones_generales)}
        </section>` : ''
    ].filter(Boolean).join('');

    return recPaginarHTML(`<article class="ar-paper" style="--ar-color:${esc(cfg.colorPrincipal)}">
      <header class="ar-doc-head${logo?'':' ar-doc-head-no-logo'}">
        ${logo}
        <div>
          <div class="ar-brand">${esc(cfg.nombre)}</div>
          ${(medico.especialidad||cfg.especialidad||cfg.subtitulo)?`<div class="ar-brand-sub">${esc(medico.especialidad||cfg.especialidad||cfg.subtitulo)}</div>`:''}
        </div>
        <div class="ar-doc-date">${esc([cfg.ciudad,fecha].map(txt).filter(Boolean).join(', '))}</div>
      </header>

      <h1>RECOMENDACIONES MÉDICAS</h1>

      <p class="ar-intro">Se emiten las siguientes recomendaciones para <b>${esc(paciente.nombre)}</b>${paciente.documento?`, con documento de identidad <b>${esc(paciente.documento)}</b>`:''}, correspondientes a la ${ctx.numeroConsulta?`consulta #${esc(ctx.numeroConsulta)}`:'atención clínica seleccionada'}, atendida por <b>${esc(medico.nombre)}</b>.</p>

      <div class="ar-lines">
        ${medico.especialidad?`<div class="ar-line"><b>ESPECIALIDAD:</b> ${esc(medico.especialidad)}</div>`:''}
        ${seguimiento}
      </div>

      ${dx.length?`
        <section class="ar-dx">
          <h3>DIAGNÓSTICO(S) CIE-10:</h3>
          ${dx.map(x=>`<div class="ar-dx-row">${x.codigo?`<b>${esc(x.codigo)}</b>${x.nombre?' · ':''}`:''}${esc(x.nombre)}</div>`).join('')}
        </section>`:''}

      ${bloques||'<p>No se registraron recomendaciones clínicas para imprimir.</p>'}

      <footer class="ar-firma-area">
        <div class="ar-centro-contacto">
          ${contactoHTML}
          ${cfg.razon_social?`<div>${esc(cfg.razon_social)}${cfg.ruc?' · RUC '+esc(cfg.ruc):''}</div>`:''}
        </div>
        <div class="ar-sign">
          <div class="ar-sign-line"></div>
          <b>${esc(medico.nombre)}</b>
          ${medico.especialidad?`<br><span>${esc(medico.especialidad)}</span>`:''}
          ${registros.map(x=>`<br><span>${esc(x)}</span>`).join('')}
          ${medico.email?`<br><span>${esc(medico.email)}</span>`:''}
          <br><span>Firma y sello</span>
        </div>
      </footer>
    </article>`);
  }

  /* V1.5.0 — A4 fluido. Los bloques clínicos no son indivisibles;
     el encabezado de sección se mantiene con el primer renglón.
     El pie se ancla al final de una página corta, y pasa al flujo en documentos largos. */
  function recEstilosImpresion(){
    return `
/* V1.5.2: se mantienen 12mm superiores y 15mm laterales; 2mm adicionales
   de holgura inferior evitan que Chromium desplace el pie de una hoja A4
   exacta a otra por redondeo/subpíxeles o bloque no divisible. */
@page{size:A4 portrait;margin:12mm 15mm 10mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;max-width:100%;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}
body{overflow-x:hidden}
.ar-paper{width:100%;max-width:100%;min-width:0;min-height:273mm;display:flex;flex-direction:column;margin:0;padding:0;background:#fff;position:relative}
.ar-paper,.ar-paper *{min-width:0}
.ar-paper p,.ar-paper span,.ar-paper b,.ar-paper div{overflow-wrap:anywhere;word-break:normal}
.ar-doc-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;border-bottom:2.5px solid var(--ar-color,#8b1e5a);padding-bottom:9px}
.ar-doc-head-no-logo{grid-template-columns:minmax(0,1fr) auto}
.ar-logo-wrap{width:55px;height:55px;display:grid;place-items:center;border-radius:10px;overflow:hidden}
.ar-logo{max-width:100%;max-height:100%;object-fit:contain}
.ar-brand{font-size:18.5px;font-weight:950;color:var(--ar-color,#8b1e5a);letter-spacing:.035em}
.ar-brand-sub{font-size:10.5px;color:#667085;margin-top:2px}
.ar-doc-date{text-align:right;font-size:11px;font-weight:700;white-space:nowrap}
.ar-paper h1{text-align:center;font-size:18px;margin:21px 0 23px;letter-spacing:.05em}
.ar-paper p{font-size:12.1px;line-height:1.58;text-align:justify;margin:0 0 10px;white-space:pre-wrap;orphans:3;widows:3}
.ar-intro{margin-bottom:14px!important}
.ar-lines{display:grid;gap:5px;margin:12px 0}
.ar-line{font-size:12px;line-height:1.42}
.ar-line b{display:inline-block;min-width:120px}
.ar-section{margin:14px 0;break-inside:auto;page-break-inside:auto}
.ar-dx{margin:14px 0;break-inside:avoid;page-break-inside:avoid}
.ar-section h3,.ar-dx h3{font-size:12px;margin:0 0 6px;font-weight:900;break-after:avoid-page;page-break-after:avoid}
.ar-dx-row{font-size:12px;line-height:1.45;margin:2px 0}
.ar-doc-list{margin:4px 0 7px 18px;padding:0}
.ar-doc-list li{font-size:12px;line-height:1.58;text-align:justify;margin:3px 0;orphans:3;widows:3;break-inside:auto;page-break-inside:auto}
.ar-rec-list{margin-top:6px}
.ar-rec-list li{line-height:1.58;margin:4px 0;padding-left:2px}
.ar-rec-text{line-height:1.62!important;text-align:justify}
.ar-parrafo-fragmento{margin-bottom:0!important}
.ar-firma-area{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22mm;align-items:end;margin-top:auto;padding-top:18mm;break-inside:avoid;page-break-inside:avoid}
.ar-centro-contacto{font-size:10.2px;color:#475569;line-height:1.45;overflow-wrap:anywhere;display:grid;gap:5px;align-content:end;min-width:0}
.ar-contacto-fila{display:grid;grid-template-columns:13px minmax(0,1fr);gap:6px;align-items:start;break-inside:avoid}
.ar-contacto-icono{display:block;width:12px;height:12px;margin-top:2px;color:var(--ar-color,#8b1e5a)}
.ar-contacto-texto{min-width:0;overflow-wrap:anywhere}
.ar-sign{text-align:center;font-size:11.2px;overflow-wrap:anywhere}
.ar-sign-line{border-top:1px solid #111;margin-bottom:6px}
.ar-sign b{font-size:12.4px}
/* La medición opcional añade relleno únicamente cuando cabe en la última página. */
.ar-firma-area.ar-firma-ajustada{margin-top:var(--ar-ajuste-pie,0px)!important}
.ar-paginas{width:100%}
.ar-paginas .ar-page{height:263mm!important;min-height:263mm!important;max-height:263mm!important;display:flex!important;flex-direction:column!important;overflow:visible!important;break-after:page;page-break-after:always}
.ar-paginas .ar-page:last-child{break-after:auto;page-break-after:auto}
.ar-paginas .ar-page-main{display:flow-root;width:100%;flex:0 0 auto}
.ar-paginas .ar-page .ar-firma-area{padding-top:18mm!important;margin-top:auto!important}
/* En flujo de respaldo, el documento sigue teniendo páginas A4 pero el cierre
   se mantiene con el texto que lo precede, nunca en una hoja aislada por flex. */
.ar-flujo-respaldo{display:block!important;min-height:0!important;height:auto!important}
.ar-flujo-respaldo .ar-firma-area{display:grid!important;margin-top:12mm!important;padding-top:18mm!important;break-inside:avoid;page-break-inside:avoid}
@media print{
  html,body{width:auto!important;max-width:none!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .ar-paper{width:100%!important;max-width:100%!important;min-width:0!important;min-height:273mm!important;margin:0!important;padding:0!important;overflow:visible!important;position:relative!important;transform:none!important;break-inside:auto!important;page-break-inside:auto!important}
  .ar-paper.ar-flujo-respaldo{display:block!important;min-height:0!important;height:auto!important}
  .ar-flujo-respaldo .ar-firma-area{margin-top:12mm!important}
  .ar-doc-head{grid-template-columns:auto minmax(0,1fr) auto!important}
  .ar-doc-head-no-logo{grid-template-columns:minmax(0,1fr) auto!important}
  .ar-firma-area{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
}`;
  }

  async function vistaPrevia(){
    const ctx=state.contexto||contextoAtencion();
    if(!ctx.id){
      setMsg('Seleccione una atención antes de imprimir recomendaciones.','error');
      return;
    }

    const d=detalleActual();
    if(!tieneContenido(d)){
      setMsg('No existen recomendaciones registradas para mostrar en el documento.','error');
      return;
    }

    const w=window.open('','_blank');

    if(!w){
      setMsg('El navegador bloqueó la vista de impresión. Permita ventanas emergentes para este sitio.','error');
      return;
    }
    const medicoPendiente=recPrecargarMedicoImpresion(ctx);
    const identidad=await recIdentidadDocumento();
    await medicoPendiente;
    if(w.closed) return;
    const htmlDoc=recDocumentoHTML({configuracion:identidad.configuracion,logo:identidad.logo});

    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recomendaciones médicas IASYN</title>
<style>
${recEstilosImpresion()}
html,body{background:#dfe3e8}
.auro-rec-print-toolbar{position:sticky;top:0;z-index:9999;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;background:#fff;border-bottom:1px solid #d1d5db;box-shadow:0 3px 14px rgba(15,23,42,.14)}
.auro-rec-print-toolbar strong{color:#7a174f;font-size:15px}
.auro-rec-print-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.auro-rec-print-btn{border:0;border-radius:10px;padding:9px 14px;font-weight:850;cursor:pointer;background:#8b1e5a;color:#fff}
.auro-rec-print-btn.secondary{background:#fff;color:#374151;border:1px solid #d1d5db}
.auro-rec-print-stage{padding:20px;display:flex;justify-content:center;align-items:flex-start;min-height:calc(100vh - 58px);overflow-x:hidden}
.auro-rec-print-sheet{width:210mm;min-width:210mm;min-height:297mm;background:#fff;padding:12mm 15mm;box-shadow:0 18px 45px rgba(15,23,42,.18);transform-origin:top center}
@media(max-width:1000px){
  .auro-rec-print-stage{padding:12px 0 20px}
  .auro-rec-print-sheet{transform:scale(.78);margin-bottom:-64mm}
}
@media(max-width:700px){
  .auro-rec-print-toolbar{padding:8px 10px}
  .auro-rec-print-toolbar strong{display:none}
  .auro-rec-print-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;width:100%;gap:8px}
  .auro-rec-print-btn{width:100%;min-height:40px;padding:8px 10px}
  .auro-rec-print-btn.secondary{width:auto;min-width:74px}
  .auro-rec-print-stage{padding:10px 0 18px;overflow-x:hidden}
  .auro-rec-print-sheet{width:210mm!important;min-width:210mm!important;max-width:none!important;min-height:297mm!important;flex:0 0 210mm!important;margin:0!important;padding:12mm 15mm!important;transform-origin:top center!important}
}
@media print{
  html,body{background:#fff!important;margin:0!important;padding:0!important;overflow:visible!important}
  .auro-rec-print-toolbar{display:none!important}
  .auro-rec-print-stage{display:block!important;min-height:0!important;padding:0!important;overflow:visible!important}
  .auro-rec-print-sheet{width:auto!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;transform:none!important}
}
</style>
</head>
<body>
  <div class="auro-rec-print-toolbar">
    <strong>Vista previa A4 · Recomendaciones médicas</strong>
    <div class="auro-rec-print-actions">
      <button type="button" class="auro-rec-print-btn" onclick="window.print()">Imprimir / Guardar PDF</button>
      <button type="button" class="auro-rec-print-btn secondary" onclick="window.close()">Cerrar</button>
    </div>
  </div>
  <main class="auro-rec-print-stage">
    <div class="auro-rec-print-sheet">${htmlDoc}</div>
  </main>
</body>
</html>`);
    w.document.close();
    w.focus();
  }




  /* ============================================================
     IASYN RECOMENDACIONES — TARJETA DE DOCUMENTO GUARDADO V1.1
     ------------------------------------------------------------
     CAPA SOLO VISUAL:
     - Lee exclusivamente state.registro / state.idRecomendacion.
     - No consulta red.
     - No guarda.
     - No crea solicitudes.
     - No mantiene una segunda verdad de firma.
     - “Abrir guardada” usa detalle_json persistido, no el formulario.
     ============================================================ */

  function auroRecGuardadaEstadoFirmaVisual(id,esActiva){
    const rid=txt(id);
    const proceso=auroRecFirmaProceso(rid);
    const estado=auroRecFirmaEstado(rid);
    // No trasladar el estado "cambios sin guardar" a todas las demás tarjetas.
    const hayCambios=!!esActiva && auroRecFirmaHayCambiosSinGuardar();

    if(proceso){
      const op=txt(proceso.estado).toUpperCase();
      if(op==='PREPARANDO') return {texto:'Preparando firma…',clase:'warn',accion:'Preparando firma…',disabled:true,cancelar:false};
      if(op==='PENDIENTE') return {texto:'Firma en proceso',clase:'warn',accion:'Firma en proceso…',disabled:true,cancelar:true};
      if(op==='TOMADA') return {texto:'Firma en Adobe',clase:'warn',accion:'Firma en Adobe…',disabled:true,cancelar:true};
      if(op==='ERROR') return {texto:'Error recuperable',clase:'warn',accion:'Reintentar firma',disabled:false,cancelar:false};
      if(op==='EXPIRADA') return {texto:'Firma expirada',clase:'warn',accion:'Reintentar firma',disabled:false,cancelar:false};
    }

    // El estado de firma archivado permanece visible aunque otro editor tenga cambios.
    if(estado.estado==='FIRMADA'){
      return {texto:'Firmada ✓',clase:'ok',accion:'Ver recomendación firmada ✓',disabled:false,cancelar:false};
    }
    if(estado.estado==='NUEVA_VERSION'){
      return {texto:'Firma histórica ✓ · Versión distinta',clase:'ok',accion:'Ver documento firmado ✓',disabled:false,cancelar:false};
    }
    if(estado.estado==='VERIFICANDO'){
      return {texto:'Verificando firma…',clase:'warn',accion:'Verificando firma…',disabled:true,cancelar:false};
    }
    if(estado.estado==='NO_VERIFICADA'){
      return {texto:'Firma no verificada',clase:'warn',accion:'Firma no verificada · Recargue',disabled:true,cancelar:false};
    }
    if(hayCambios){
      return {texto:'Guardada · cambios sin guardar',clase:'warn',accion:'Guarde cambios antes de firmar',disabled:true,cancelar:false};
    }
    return {texto:'Sin firma',clase:'',accion:'Firmar recomendación',disabled:false,cancelar:false};
  }

  function renderRecomendacionGuardada(){
    const box=document.getElementById('auroRecGuardada');
    if(!box) return;
    const ctx=state.contexto||contextoAtencion();
    const idAtn=txt(ctx?.id);
    const registros=Array.isArray(state.registros)?state.registros:[];
    const docs=registros.filter(r=>txt(r.id_atencion)===idAtn && txt(r.id_recomendacion));
    if(!idAtn || !docs.length){
      box.innerHTML='<div class="auro-rec-empty">No existen recomendaciones guardadas para esta atención.</div>';
      return;
    }
    box.innerHTML=docs.map(registro=>{
      const id=txt(registro.id_recomendacion);
      const activa=!state.modoNuevo && id===txt(state.idRecomendacion);
      // Todas las tarjetas usan el estado individual que verificó el servidor.
      const firma=auroRecGuardadaEstadoFirmaVisual(id,activa);
      const f=fechaVisual(registro.actualizado_en||registro.creado_en||registro.fecha_atencion);
      const consulta=txt(registro.numero_consulta||ctx.numeroConsulta);
      const esPdfFirmado=firma.clase==='ok';
      const deshabilitarFirma=state.guardando || state.cargando ||
        (activa&&(state.verificandoFirma || state.firmaVerificacionFallida)) ||
        (ctx?.bloqueada===true && !esPdfFirmado) || firma.disabled;
      const claseFirma=firma.clase?' '+firma.clase:'';
      return `<div class="auro-rec-saved-item${activa?' activo':''}">
        <div class="auro-rec-saved-top"><div>
          <div class="auro-rec-saved-title">Recomendaciones médicas${activa?' · Abierta ✓':''}</div>
          <div class="auro-rec-saved-meta">${consulta?'Consulta #'+esc(consulta)+' · ':''}${esc(f||'Fecha no disponible')}<br>${esc(id)}</div>
          <div class="auro-rec-saved-badges"><span class="auro-rec-saved-badge ok"><i class="bi bi-check2-circle"></i> Guardada</span>
          <span class="auro-rec-saved-badge${claseFirma}"><i class="bi bi-shield-check"></i> ${esc(firma.texto)}</span></div>
        </div><div class="auro-rec-saved-actions">
          <button type="button" class="auro-rec-btn${activa?' doc-abierto':''}" data-auro-rec-seleccionar="${esc(id)}" ${activa?'aria-current="true"':''}>${activa?'Abierta ✓':'Abrir'}</button>
          <button type="button" class="auro-rec-btn${firma.clase==='ok'?' firma-ok':(firma.clase==='warn'?' firma-warn':' primary')}" data-auro-rec-firma-guardada="${esc(id)}" ${deshabilitarFirma?'disabled':''}>
            <i class="bi ${firma.clase==='ok'?'bi-file-earmark-check':'bi-pen'} me-1"></i> ${esc(firma.accion)}
          </button>
          ${activa&&firma.cancelar?`<button type="button" class="auro-rec-btn firma-warn" data-auro-rec-cancelar-guardada="${esc(id)}" ${state.guardando?'disabled':''}>Cancelar firma</button>`:''}
        </div></div></div>`;
    }).join('');
    box.querySelectorAll('[data-auro-rec-seleccionar]').forEach(el=>{
      el.onclick=()=>abrirRecomendacionHistorial(el.dataset.auroRecSeleccionar);
    });
    box.querySelectorAll('[data-auro-rec-firma-guardada]').forEach(el=>{
      el.onclick=async()=>{
        const id=txt(el.dataset.auroRecFirmaGuardada);
        const actual=state.contexto||contextoAtencion();
        const registro=(state.registros||[]).find(r=>txt(r.id_recomendacion)===id && txt(r.id_atencion)===txt(actual?.id));
        if(!registro){setMsg('La recomendación ya no pertenece a la atención visible. Recargue el historial.','error');return;}
        // PDF firmado: abrir el original DIRECTAMENTE, sin seleccionar/editar la ficha.
        if(['FIRMADA','NUEVA_VERSION'].includes(auroRecFirmaEstado(id).estado) && !auroRecFirmaProceso(id)){
          return auroRecFirmaVerFirmada(id,txt(actual.id));
        }
        if(state.modoNuevo||id!==txt(state.idRecomendacion)){
          if(!(await abrirRecomendacionHistorial(id))) return;
        }
        return auroRecFirmaAccionPrincipal();
      };
    });
    box.querySelectorAll('[data-auro-rec-cancelar-guardada]').forEach(el=>{
      el.onclick=()=>auroRecFirmaCancelar();
    });
  }

  async function auroRecAbrirGuardada(id){
    const rid=txt(id);
    const registro=state.registro;
    const ctx=state.contexto||contextoAtencion();

    if(!registro || txt(registro.id_recomendacion)!==rid){
      setMsg('No se encontró la recomendación guardada seleccionada.','error');
      return null;
    }
    if(!ctx?.id || txt(registro.id_atencion)!==txt(ctx.id)){
      setMsg('La recomendación guardada no pertenece a la atención seleccionada.','error');
      return null;
    }

    const detalle=parseDetalle(registro.detalle_json);
    const w=window.open('','_blank');
    if(!w){
      setMsg('El navegador bloqueó la vista de la recomendación guardada. Permita ventanas emergentes para este sitio.','error');
      return null;
    }
    const medicoPendiente=recPrecargarMedicoImpresion(ctx);
    const identidad=await recIdentidadDocumento();
    await medicoPendiente;
    if(w.closed) return null;
    const htmlDoc=recDocumentoHTML({
      ctx:ctx,
      detalle:detalle,
      diagnosticos:Array.isArray(state.diagnosticos)?state.diagnosticos:[],
      configuracion:identidad.configuracion,
      logo:identidad.logo
    });

    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recomendación guardada IASYN</title>
<style>
${recEstilosImpresion()}
html,body{background:#dfe3e8}
.auro-rec-print-toolbar{position:sticky;top:0;z-index:9999;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;background:#fff;border-bottom:1px solid #d1d5db;box-shadow:0 3px 14px rgba(15,23,42,.14)}
.auro-rec-print-toolbar strong{color:#7a174f;font-size:15px}
.auro-rec-print-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.auro-rec-print-btn{border:0;border-radius:10px;padding:9px 14px;font-weight:850;cursor:pointer;background:#8b1e5a;color:#fff}
.auro-rec-print-btn.secondary{background:#fff;color:#374151;border:1px solid #d1d5db}
.auro-rec-print-stage{padding:20px;display:flex;justify-content:center;align-items:flex-start;min-height:calc(100vh - 58px);overflow-x:hidden}
.auro-rec-print-sheet{width:210mm;min-width:210mm;min-height:297mm;background:#fff;padding:12mm 15mm;box-shadow:0 18px 45px rgba(15,23,42,.18);transform-origin:top center}
@media(max-width:700px){
  .auro-rec-print-toolbar{padding:8px 10px}
  .auro-rec-print-toolbar strong{display:none}
  .auro-rec-print-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;width:100%;gap:8px}
  .auro-rec-print-btn{width:100%;min-height:40px;padding:8px 10px}
  .auro-rec-print-btn.secondary{width:auto;min-width:74px}
  .auro-rec-print-stage{padding:10px 0 18px;overflow-x:hidden}
  .auro-rec-print-sheet{width:210mm!important;min-width:210mm!important;max-width:none!important;min-height:297mm!important;flex:0 0 210mm!important;margin:0!important;padding:12mm 15mm!important;transform-origin:top center!important}
}
@media print{
  html,body{background:#fff!important;margin:0!important;padding:0!important;overflow:visible!important}
  .auro-rec-print-toolbar{display:none!important}
  .auro-rec-print-stage{display:block!important;min-height:0!important;padding:0!important;overflow:visible!important}
  .auro-rec-print-sheet{width:auto!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;transform:none!important}
}
</style>
</head>
<body>
  <div class="auro-rec-print-toolbar">
    <strong>Recomendación guardada · ${esc(rid)}</strong>
    <div class="auro-rec-print-actions">
      <button type="button" class="auro-rec-print-btn" onclick="window.print()">Imprimir / Guardar PDF</button>
      <button type="button" class="auro-rec-print-btn secondary" onclick="window.close()">Cerrar</button>
    </div>
  </div>
  <main class="auro-rec-print-stage">
    <div class="auro-rec-print-sheet">${htmlDoc}</div>
  </main>
</body>
</html>`);
    w.document.close();
    w.focus();
    return registro;
  }


  /* ============================================================
     IASYN RECOMENDACIONES — FIRMA ELECTRÓNICA V1
     ------------------------------------------------------------
     REGLAS ANTIRREGRESIVAS:
     - Solo firma una recomendación YA GUARDADA.
     - Identidad: RECOMENDACION + id_atencion + id_recomendacion.
     - Versión exacta: version_documento + SHA-256 del HTML enviado.
     - Requiere 1 firma digital.
     - Consultar firma NUNCA crea una solicitud.
     - documentos_firmados + Drive son la verdad compartida.
     - El logo de firma se incrusta como data URI; si falla, no se crea <img>.
     - No modifica Plan, Diagnósticos, guardado ni estructura de la hoja.
     ============================================================ */

  function auroRecFirmaTokenSesion(){
    try{
      const s=window.IASYN_SEGURIDAD||window.AUROSANAX_SEGURIDAD;
      if(s){
        if(typeof s.obtenerToken==='function') return txt(s.obtenerToken());
        if(typeof s.obtenerTokenSesion==='function') return txt(s.obtenerTokenSesion());
      }
    }catch(_e){}
    try{
      return txt(
        sessionStorage.getItem('iasyn_seguridad_token') ||
        sessionStorage.getItem('aurosanax_seguridad_token') || ''
      );
    }catch(_e){ return ''; }
  }

  async function auroRecFirmaPost(accion,data){
    const base=apiUrl();
    if(!base) throw new Error('API_URL no está definida.');

    const token=auroRecFirmaTokenSesion();
    if(!token) throw new Error('No existe una sesión IASYN activa para firmar.');

    const r=await fetch(base,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({
        accion:accion,
        data:Object.assign({},data||{},{token})
      })
    });

    if(!r.ok) throw new Error('Error HTTP '+r.status+' en '+accion);
    const j=await r.json();
    if(j && j.success===false){
      throw new Error(txt(j.message||'La operación de firma no pudo completarse.'));
    }
    return j;
  }

  function auroRecFirmaEstado(id){
    return recomendacionFirmasPorDocumento.get(txt(id)) || {
      estado:'SIN_FIRMA',
      documento:null,
      sha_actual:'',
      version_documento:'',
      error:''
    };
  }

  function auroRecFirmaProceso(id){
    return recomendacionFirmaProcesos.get(txt(id)) || null;
  }

  function auroRecFirmaVersionDocumento(registro){
    return txt(
      registro?.actualizado_en ||
      registro?.creado_en ||
      registro?.fecha_atencion ||
      ''
    );
  }

  function auroRecFirmaVersionDesdeFirmado(doc){
    try{
      const d=JSON.parse(String(doc?.detalle_json||'{}'));
      return txt(d?.version_documento);
    }catch(_e){
      return '';
    }
  }

  function auroRecFirmaHayCambiosSinGuardar(){
    const ctx=state.contexto||contextoAtencion();
    const idAtn=txt(ctx?.id);
    if(!idAtn || !state.idRecomendacion) return false;
    if(state.firmaPersistidaAtencion!==idAtn || !state.firmaPersistida) return false;
    return firmaDetalle(detalleActual())!==state.firmaPersistida;
  }

  function auroRecFirmaEsContextoActual(id,idAtencion){
    return (
      txt(state.idRecomendacion)===txt(id) &&
      txt((state.contexto||contextoAtencion())?.id)===txt(idAtencion)
    );
  }

  function auroRecFirmaEmitirCambio(id,estado,extra){
    const rid=txt(id);
    if(!rid) return;
    const detail=Object.assign({
      tipo_documento:'RECOMENDACION',
      id_documento_origen:rid,
      id_recomendacion:rid,
      id_receta:'',
      id_certificado:'',
      id_atencion:txt(state.contexto?.id),
      estado:txt(estado)
    },extra||{});
    try{
      window.dispatchEvent(new CustomEvent('aurosanax:recomendacion-firma-estado',{detail}));
    }catch(_e){}
  }

  function auroRecFirmaActualizarUI(){
    /*
      V1.3.2 — fuente visual única:
      toda la UX de firma vive en la tarjeta “Recomendación guardada”.
      La state machine, polling, persistencia y acciones NO cambian.
    */
    renderRecomendacionGuardada();
  }

  async function auroRecFirmaLogoDataUrl(){
    if(recomendacionFirmaLogoCache!==null) return recomendacionFirmaLogoCache;
    if(recomendacionFirmaLogoPromesa) return recomendacionFirmaLogoPromesa;

    recomendacionFirmaLogoPromesa=(async function(){
      try{
        const r=await auroRecFirmaPost('obtenerLogoInstitucionalFirma',{});
        recomendacionFirmaLogoCache=(
          r?.disponible &&
          String(r?.data_url||'').startsWith('data:image/')
        ) ? String(r.data_url) : '';
      }catch(_e){
        recomendacionFirmaLogoCache='';
      }finally{
        recomendacionFirmaLogoPromesa=null;
      }
      return recomendacionFirmaLogoCache;
    })();

    return recomendacionFirmaLogoPromesa;
  }

  async function auroRecFirmaSha256(texto){
    if(!window.crypto?.subtle) return '';
    const data=new TextEncoder().encode(String(texto||''));
    const digest=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(digest))
      .map(x=>x.toString(16).padStart(2,'0'))
      .join('');
  }

  async function auroRecFirmaPersistidaExacta(id,idAtencion){
    /* IASYN V1.4.0: documento exacto, aunque no sea el más reciente. */
    const data=await apiGet('listarRecomendacionesPorAtencion',{id_atencion:txt(idAtencion)});
    const docs=Array.isArray(data)?data:(Array.isArray(data?.registros)?data.registros:[]);
    const r=docs.find(x=>txt(x.id_recomendacion)===txt(id) && txt(x.id_atencion)===txt(idAtencion));
    if(!r) return null;
    const estado=norm(r.estado||'activo');
    if(estado.includes('anulad')||estado.includes('cancelad')) return null;
    return r;
  }

  async function auroRecFirmaDiagnosticos(idAtencion){
    try{
      const data=await apiGet('listarDiagnosticosPorAtencion',{id_atencion:txt(idAtencion)});
      return Array.isArray(data)
        ? data
        : (Array.isArray(data?.registros)?data.registros:[]);
    }catch(_e){
      return Array.isArray(state.diagnosticos)?state.diagnosticos:[];
    }
  }

  async function auroRecFirmaHtmlCanonico(registro){
    const idAtn=txt(registro?.id_atencion);
    if(!txt(registro?.id_recomendacion) || !idAtn){
      throw new Error('La recomendación no tiene identidad clínica completa.');
    }

    const ctxActual=state.contexto||contextoAtencion();
    if(txt(ctxActual?.id)!==idAtn){
      throw new Error('La recomendación ya no pertenece a la atención seleccionada.');
    }

    const detalle=parseDetalle(registro.detalle_json);
    // El motor mantiene su secuencia; la consulta de médico se inicia en paralelo.
    const medicoPendiente=recPrecargarMedicoImpresion(ctxActual);
    const diagnosticos=await auroRecFirmaDiagnosticos(idAtn);
    const logo=await auroRecFirmaLogoDataUrl();
    const identidad=await recIdentidadDocumento();
    await medicoPendiente;

    const cuerpo=recDocumentoHTML({
      ctx:ctxActual,
      detalle:detalle,
      diagnosticos:diagnosticos,
      configuracion:identidad.configuracion,
      logo:logo
    });

    // Solo RECOMENDACION: ancla exacta en la ultima hoja A4 ya paginada.
    // Usa el contrato HTML de anclas existente en IASYN Firma, sin cambiar el agente.
    // El flujo de respaldo mantiene el comportamiento previo si no hay paginas verificables.
    const paginasFirma=(cuerpo.match(/<article class="ar-paper ar-page"/g)||[]).length;
    const anclaFirma=paginasFirma>0
      ? '<meta name="iasyn-signature-anchors" content="'+btoa(JSON.stringify({
          tipo_documento:'RECOMENDACION',coordinate_system:'pdf',
          anchors:[{name:'IASYN_RECOMENDACION',page:paginasFirma,rect:[347.211,97.6985,512.211,143.6985]}]
        }))+'">'
      : '';
    return '<!DOCTYPE html><html lang="es"><head>'+
      '<meta charset="UTF-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      anclaFirma+
      '<title>Recomendaciones médicas</title>'+
      '<style>'+recEstilosImpresion()+'</style>'+
      '</head><body>'+cuerpo+'</body></html>';
  }

  /* IASYN V1.5.1 — VERIFICACIÓN DEL HISTORIAL COMPLETO, EXCLUSIVAMENTE LECTURA.
     Se reutiliza consultarDocumentosFirmados por ID exacta porque el backend
     existente NO garantiza una acción masiva. Limita la concurrencia a 2.
     No modifica el motor, documentos_firmados, Sheets, hashes ni solicitudes. */
  async function recFirmaSincronizarHistorial(idAtencion,registros,tokenCarga,excluirId){
    const idAtn=txt(idAtencion);
    const token=++recomendacionFirmaHistorialToken;
    const sigueVigente=()=>token===recomendacionFirmaHistorialToken &&
      tokenCarga===state.tokenCarga && txt(state.contexto?.id)===idAtn &&
      txt(contextoAtencion()?.id)===idAtn;
    if(!idAtn || !sigueVigente()) return;
    const docs=(Array.isArray(registros)?registros:[]).filter(r=>
      txt(r?.id_recomendacion) && txt(r?.id_atencion)===idAtn &&
      txt(r?.id_recomendacion)!==txt(excluirId));
    let siguiente=0;
    async function trabajador(){
      while(sigueVigente() && siguiente<docs.length){
        const registro=docs[siguiente++];
        const id=txt(registro.id_recomendacion);
        // Una solicitud de firma en curso tiene su propia máquina de estados.
        if(recomendacionFirmaProcesos.has(id)) continue;
        try{
          const respuesta=await auroRecFirmaPost('consultarDocumentosFirmados',{
            tipo_documento:'RECOMENDACION',
            id_documento_origen:id,
            id_recomendacion:id,
            id_atencion:idAtn
          });
          if(!sigueVigente()) return;
          if(recomendacionFirmaProcesos.has(id)) continue;
          const firmados=(Array.isArray(respuesta?.documentos)?respuesta.documentos:[]).filter(d=>
            txt(d?.tipo_documento).toUpperCase()==='RECOMENDACION' &&
            txt(d?.id_documento_origen||d?.id_recomendacion)===id &&
            txt(d?.id_atencion)===idAtn &&
            txt(d?.estado_firma).toUpperCase()==='FIRMADO'
          );
          const version=auroRecFirmaVersionDocumento(registro);
          if(!firmados.length){
            // No borrar una firma confirmada mientras se propaga entre servicios.
            const previo=auroRecFirmaEstado(id);
            if(!['FIRMADA','NUEVA_VERSION'].includes(previo.estado)){
              recomendacionFirmasPorDocumento.set(id,{
                estado:'SIN_FIRMA',documento:null,sha_actual:'',version_documento:version,
                error:'',id_atencion:idAtn
              });
            }
          }else{
            const exacto=version?firmados.find(d=>auroRecFirmaVersionDesdeFirmado(d)===version):null;
            // Si versión no coincide, preservar la firma histórica sin atribuirla
            // equivocadamente a la versión clínica actual.
            recomendacionFirmasPorDocumento.set(id,{
              estado:exacto?'FIRMADA':'NUEVA_VERSION',documento:exacto||firmados[0],
              sha_actual:'',version_documento:version,error:'',id_atencion:idAtn
            });
          }
        }catch(error){
          if(!sigueVigente()) return;
          const previo=auroRecFirmaEstado(id);
          if(!['FIRMADA','NUEVA_VERSION'].includes(previo.estado)){
            recomendacionFirmasPorDocumento.set(id,{
              estado:'NO_VERIFICADA',documento:null,sha_actual:'',
              version_documento:auroRecFirmaVersionDocumento(registro),
              error:txt(error?.message||error),id_atencion:idAtn
            });
          }
        }
        if(sigueVigente()) auroRecFirmaActualizarUI();
      }
    }
    await Promise.all([trabajador(),trabajador()]);
  }

  async function auroRecFirmaSincronizarPersistencia(opciones){
    opciones=opciones||{};
    const token=++recomendacionFirmaSyncToken;
    const ctx=state.contexto||contextoAtencion();
    const idAtn=txt(opciones.id_atencion||ctx?.id);
    const id=txt(opciones.id_recomendacion||state.idRecomendacion);

    if(!idAtn || !id){
      auroRecFirmaActualizarUI();
      return {success:true,documentos:[]};
    }

    try{
      const [registro,resFirmas]=await Promise.all([
        auroRecFirmaPersistidaExacta(id,idAtn),
        auroRecFirmaPost('consultarDocumentosFirmados',{
          tipo_documento:'RECOMENDACION',
          id_documento_origen:id,
          id_recomendacion:id,
          id_atencion:idAtn
        })
      ]);

      if(token!==recomendacionFirmaSyncToken) return {success:false,descartada:true};
      if(!auroRecFirmaEsContextoActual(id,idAtn)) return {success:false,descartada:true};
      if(!registro){
        recomendacionFirmasPorDocumento.set(id,{
          estado:'SIN_FIRMA',documento:null,sha_actual:'',version_documento:'',error:''
        });
        auroRecFirmaActualizarUI();
        return {success:true,documentos:[]};
      }

      const docs=(Array.isArray(resFirmas?.documentos)?resFirmas.documentos:[])
        .filter(d=>
          txt(d.tipo_documento).toUpperCase()==='RECOMENDACION' &&
          txt(d.id_documento_origen||d.id_recomendacion)===id &&
          txt(d.id_atencion)===idAtn &&
          txt(d.estado_firma).toUpperCase()==='FIRMADO'
        );

      if(!docs.length){
        recomendacionFirmasPorDocumento.set(id,{
          estado:'SIN_FIRMA',documento:null,sha_actual:'',version_documento:auroRecFirmaVersionDocumento(registro),error:''
        });
        auroRecFirmaActualizarUI();
        return {success:true,documentos:[]};
      }

      const versionActual=auroRecFirmaVersionDocumento(registro);
      let exacto=versionActual
        ? docs.find(d=>auroRecFirmaVersionDesdeFirmado(d)===versionActual)
        : null;
      let sha='';

      try{
        if(!exacto){
          const html=await auroRecFirmaHtmlCanonico(registro);
          sha=await auroRecFirmaSha256(html);
          exacto=sha
            ? docs.find(d=>txt(d.sha256_origen).toLowerCase()===sha.toLowerCase())
            : null;
        }

        recomendacionFirmasPorDocumento.set(id,{
          estado:exacto?'FIRMADA':'NUEVA_VERSION',
          documento:exacto||docs[0],
          sha_actual:sha,
          version_documento:versionActual,
          error:''
        });
      }catch(error){
        /*
          Si existe un documento firmado pero no se pudo recalcular la
          representación, se bloquea una firma duplicada: el histórico
          firmado prevalece hasta poder sincronizar correctamente.
        */
        recomendacionFirmasPorDocumento.set(id,{
          estado:'NUEVA_VERSION',
          documento:docs[0],
          sha_actual:'',
          version_documento:versionActual,
          error:txt(error?.message||error)
        });
      }

      if(token===recomendacionFirmaSyncToken && auroRecFirmaEsContextoActual(id,idAtn)){
        auroRecFirmaActualizarUI();
      }

      return {success:true,documentos:docs};
    }catch(error){
      if(token===recomendacionFirmaSyncToken) auroRecFirmaActualizarUI();
      if(!opciones.silencioso){
        setMsg('No se pudo sincronizar el estado de firma. Las recomendaciones clínicas siguen disponibles.','error');
      }
      return {success:false,error:txt(error?.message||error)};
    }
  }

  async function auroRecFirmaObtenerDocumentoActual(){
    if(state.verificandoFirma || state.firmaVerificacionFallida){
      return {success:false,estado:'FIRMA_NO_VERIFICADA',message:'No se ha podido verificar el estado de firma. Recargue el documento.'};
    }
    const ctx=state.contexto||contextoAtencion();
    const idAtn=txt(ctx?.id);
    const id=txt(state.idRecomendacion);

    if(!idAtn || !id){
      return {
        success:false,
        estado:'RECOMENDACION_NO_GUARDADA',
        message:'Guarde las recomendaciones antes de firmarlas.'
      };
    }

    if(ctx?.bloqueada===true){
      return {
        success:false,
        estado:'RECOMENDACION_NO_FIRMABLE',
        message:'La atención está anulada o cancelada.'
      };
    }

    if(auroRecFirmaHayCambiosSinGuardar()){
      return {
        success:false,
        estado:'EDICION_PENDIENTE',
        message:'Guarde los cambios de Recomendaciones antes de firmar.'
      };
    }

    const registro=await auroRecFirmaPersistidaExacta(id,idAtn);
    if(!registro){
      return {
        success:false,
        estado:'RECOMENDACION_NO_GUARDADA',
        message:'La recomendación no está persistida en Google Sheets.'
      };
    }

    const html=await auroRecFirmaHtmlCanonico(registro);
    const sha=await auroRecFirmaSha256(html);

    return {
      success:true,
      estado:'LISTA',
      tipo_documento:'RECOMENDACION',
      id_documento_origen:id,
      id_recomendacion:id,
      id_receta:'',
      id_certificado:'',
      id_atencion:idAtn,
      id_paciente:txt(registro.id_paciente),
      nombre_paciente:txt(registro.nombre_paciente),
      id_historia:txt(registro.id_historia),
      numero_consulta:txt(registro.numero_consulta||ctx?.numeroConsulta),
      id_medico:txt(registro.id_medico),
      nombre_medico:txt(registro.nombre_medico),
      nombre_archivo:'RECOMENDACION_'+txt(registro.numero_consulta||ctx?.numeroConsulta||'CONSULTA')+'_'+id+'.pdf',
      firmas_requeridas:1,
      version_documento:auroRecFirmaVersionDocumento(registro),
      html_documento:html,
      sha256_origen:sha,
      recomendacion:registro
    };
  }

  async function auroRecFirmaObtenerEstadoActual(){
    const doc=await auroRecFirmaObtenerDocumentoActual();
    if(!doc.success) return doc;
    await auroRecFirmaSincronizarPersistencia({
      silencioso:true,
      id_atencion:doc.id_atencion,
      id_recomendacion:doc.id_recomendacion
    });
    return Object.assign({},doc,{
      estado_firma:auroRecFirmaEstado(doc.id_recomendacion)
    });
  }

  async function auroRecFirmaFirmarActual(){
    const id=txt(state.idRecomendacion);
    if(!id){
      setMsg('Guarde la recomendación antes de solicitar firma electrónica.','error');
      auroRecFirmaActualizarUI();
      return {success:false,estado:'RECOMENDACION_NO_GUARDADA'};
    }
    /* Evita doble obtención del HTML/PDF antes de mostrar progreso. */
    return auroRecFirmaFirmar(id);
  }

  async function auroRecFirmaFirmar(id){
    const rid=txt(id);
    if(!rid) return null;

    const proceso=auroRecFirmaProceso(rid);
    if(proceso && ['PREPARANDO','PENDIENTE','TOMADA'].includes(txt(proceso.estado).toUpperCase())){
      setMsg('Esta recomendación ya tiene una firma en proceso.','info');
      auroRecFirmaActualizarUI();
      return proceso;
    }
    if(proceso && ['ERROR','EXPIRADA'].includes(txt(proceso.estado).toUpperCase())){
      return auroRecFirmaReabrir(rid);
    }

    /* Estado inmediato antes de consultas a servidor y generación del HTML. */
    recomendacionFirmaProcesos.set(rid,{
      estado:'PREPARANDO',id_solicitud:'',id_atencion:txt((state.contexto||contextoAtencion())?.id)
    });
    auroRecFirmaActualizarUI();
    setMsg('Preparando firma digital… Se está verificando el documento.','info');
    let doc;
    try{
      doc=await auroRecFirmaObtenerDocumentoActual();
      if(!doc.success || doc.id_recomendacion!==rid){
        recomendacionFirmaProcesos.delete(rid);
        setMsg(doc.message||'La recomendación no está lista para firmar.','error');
        auroRecFirmaActualizarUI();
        return doc;
      }
    }catch(error){
      recomendacionFirmaProcesos.delete(rid);
      auroRecFirmaActualizarUI();
      setMsg(txt(error?.message||'No se pudo preparar el documento.'),'error');
      return {success:false,error:txt(error?.message||error)};
    }

    /*
      Consulta solo lectura antes del POST creador.
      Una versión ya firmada jamás crea otra solicitud por error.
    */
    try{
      const q=await auroRecFirmaPost('consultarDocumentosFirmados',{
        tipo_documento:'RECOMENDACION',
        id_documento_origen:rid,
        id_recomendacion:rid,
        id_atencion:doc.id_atencion
      });
      const docs=Array.isArray(q?.documentos)?q.documentos:[];
      const exacto=docs.find(x=>
        txt(x.estado_firma).toUpperCase()==='FIRMADO' &&
        (
          (doc.version_documento && auroRecFirmaVersionDesdeFirmado(x)===doc.version_documento) ||
          txt(x.sha256_origen).toLowerCase()===txt(doc.sha256_origen).toLowerCase()
        )
      );

      if(exacto){
        recomendacionFirmaProcesos.delete(rid);
        recomendacionFirmasPorDocumento.set(rid,{
          estado:'FIRMADA',
          documento:exacto,
          sha_actual:doc.sha256_origen,
          version_documento:doc.version_documento,
          error:''
        });
        auroRecFirmaActualizarUI();
        setMsg('Esta versión de Recomendaciones ya está firmada.','ok');
        return exacto;
      }
    }catch(_e){}

    recomendacionFirmaProcesos.set(rid,{
      estado:'PREPARANDO',
      id_solicitud:'',
      id_atencion:doc.id_atencion
    });
    auroRecFirmaActualizarUI();
    setMsg('Preparando Recomendaciones para firma electrónica. Se requiere 1 firma digital.','info');

    try{
      const r=await auroRecFirmaPost('firmarDocumento',{
        tipo_documento:'RECOMENDACION',
        id_documento_origen:rid,
        id_recomendacion:rid,
        id_receta:'',
        id_certificado:'',
        id_atencion:doc.id_atencion,
        id_paciente:doc.id_paciente,
        nombre_paciente:doc.nombre_paciente,
        id_historia:doc.id_historia,
        numero_consulta:doc.numero_consulta,
        id_medico:doc.id_medico,
        nombre_medico:doc.nombre_medico,
        nombre_archivo:doc.nombre_archivo,
        firmas_requeridas:1,
        version_documento:doc.version_documento,
        html_documento:doc.html_documento
      });

      if(txt(r?.estado_firma).toUpperCase()==='FIRMADO'){
        recomendacionFirmaProcesos.delete(rid);
        recomendacionFirmasPorDocumento.set(rid,{
          estado:'FIRMADA',documento:r,sha_actual:doc.sha256_origen,
          version_documento:doc.version_documento,error:''
        });
        aplicarModo();
        await auroRecFirmaSincronizarPersistencia({
          silencioso:true,
          id_atencion:doc.id_atencion,
          id_recomendacion:rid
        });
        setMsg('Esta versión de Recomendaciones ya estaba firmada.','ok');
        return r;
      }

      const solicitud=txt(r?.id_solicitud);
      if(!solicitud) throw new Error('IASYN no devolvió id_solicitud.');

      recomendacionFirmaProcesos.set(rid,{
        estado:txt(r.estado_firma||'PENDIENTE').toUpperCase(),
        id_solicitud:solicitud,
        id_atencion:doc.id_atencion,
        poll_token:Date.now()
      });
      auroRecFirmaActualizarUI();
      setMsg('Solicitud enviada al motor de firma. En Adobe aplique 1 firma digital y guarde el PDF.','info');

      return await auroRecFirmaEsperar(rid,solicitud,doc.id_atencion);
    }catch(error){
      recomendacionFirmaProcesos.delete(rid);
      auroRecFirmaActualizarUI();
      setMsg(txt(error?.message||'No se pudo iniciar la firma.'),'error');
      return {success:false,error:txt(error?.message||error)};
    }
  }

  async function auroRecFirmaEsperar(id,idSolicitud,idAtencion){
    const proceso=auroRecFirmaProceso(id);
    const pollToken=proceso?.poll_token||Date.now();
    const inicio=Date.now();

    while(Date.now()-inicio<35*60*1000){
      await new Promise(r=>setTimeout(r,2000));

      const actual=auroRecFirmaProceso(id);
      if(!actual || actual.poll_token!==pollToken || actual.id_solicitud!==idSolicitud){
        return null;
      }

      let r;
      try{
        r=await auroRecFirmaPost('obtenerEstadoFirmaElectronica',{
          id_solicitud:idSolicitud
        });
      }catch(_e){
        // Error de transporte != error de firma.
        continue;
      }

      const estado=txt(r?.estado_firma||r?.estado).toUpperCase();
      actual.estado=estado||actual.estado;
      recomendacionFirmaProcesos.set(id,actual);

      if(auroRecFirmaEsContextoActual(id,idAtencion)){
        auroRecFirmaActualizarUI();
      }

      if(estado==='FIRMADO'){
        recomendacionFirmaProcesos.delete(id);
        recomendacionFirmasPorDocumento.set(id,{
          estado:'FIRMADA',documento:r,sha_actual:'',version_documento:'',error:''
        });
        if(auroRecFirmaEsContextoActual(id,idAtencion)) aplicarModo();

        if(auroRecFirmaEsContextoActual(id,idAtencion)){
          await auroRecFirmaSincronizarPersistencia({
            silencioso:true,
            id_atencion:idAtencion,
            id_recomendacion:id
          });
          setMsg('Recomendaciones firmadas electrónicamente y archivadas en IASYN.','ok');
        }

        try{
          window.dispatchEvent(new CustomEvent('aurosanax:firma-electronica-completada',{
            detail:{
              tipo_documento:'RECOMENDACION',
              id_documento_origen:id,
              id_recomendacion:id,
              id_atencion:idAtencion,
              id_solicitud:idSolicitud
            }
          }));
        }catch(_e){}

        auroRecFirmaEmitirCambio(id,'FIRMADA',{
          id_atencion:idAtencion,
          id_solicitud:idSolicitud
        });
        return r;
      }

      if(estado==='ERROR' || estado==='EXPIRADA'){
        actual.estado=estado;
        actual.error=txt(r?.error);
        recomendacionFirmaProcesos.set(id,actual);

        if(auroRecFirmaEsContextoActual(id,idAtencion)){
          auroRecFirmaActualizarUI();
          setMsg(
            actual.error || ('La solicitud quedó '+estado+'. Puede reintentar.'),
            'error'
          );
        }
        return r;
      }

      if(estado==='CANCELADA'){
        recomendacionFirmaProcesos.delete(id);
        if(auroRecFirmaEsContextoActual(id,idAtencion)){
          auroRecFirmaActualizarUI();
        }
        auroRecFirmaEmitirCambio(id,'CANCELADA',{
          id_atencion:idAtencion,
          id_solicitud:idSolicitud
        });
        return r;
      }

      if(estado==='TOMADA' && auroRecFirmaEsContextoActual(id,idAtencion)){
        setMsg('Adobe está abierto. Aplique 1 firma digital y guarde el PDF.','info');
      }
    }

    const actual=auroRecFirmaProceso(id);
    if(actual){
      actual.estado='EXPIRADA';
      recomendacionFirmaProcesos.set(id,actual);
      if(auroRecFirmaEsContextoActual(id,idAtencion)){
        auroRecFirmaActualizarUI();
      }
    }

    return {success:false,estado_firma:'EXPIRADA'};
  }

  async function auroRecFirmaCancelar(){
    const id=txt(state.idRecomendacion);
    const proceso=auroRecFirmaProceso(id);
    if(!id || !proceso?.id_solicitud){
      setMsg('No existe una solicitud activa para cancelar.','error');
      return null;
    }

    try{
      const r=await auroRecFirmaPost('firmarDocumento',{
        operacion_frontend:'CANCELAR',
        id_solicitud:proceso.id_solicitud,
        tipo_documento:'RECOMENDACION',
        id_documento_origen:id,
        id_recomendacion:id,
        id_receta:'',
        id_certificado:'',
        id_atencion:proceso.id_atencion
      });

      recomendacionFirmaProcesos.delete(id);
      auroRecFirmaActualizarUI();
      setMsg('Firma de Recomendaciones cancelada.','info');

      try{
        window.dispatchEvent(new CustomEvent('aurosanax:firma-electronica-cancelada',{
          detail:{
            tipo_documento:'RECOMENDACION',
            id_documento_origen:id,
            id_recomendacion:id,
            id_atencion:proceso.id_atencion,
            id_solicitud:proceso.id_solicitud
          }
        }));
      }catch(_e){}

      auroRecFirmaEmitirCambio(id,'CANCELADA',{
        id_atencion:proceso.id_atencion,
        id_solicitud:proceso.id_solicitud
      });
      return r;
    }catch(error){
      setMsg(txt(error?.message||'No se pudo cancelar la firma.'),'error');
      return null;
    }
  }

  async function auroRecFirmaReabrir(id){
    const rid=txt(id||state.idRecomendacion);
    const proceso=auroRecFirmaProceso(rid);
    if(!proceso?.id_solicitud) return auroRecFirmaFirmar(rid);

    try{
      const r=await auroRecFirmaPost('firmarDocumento',{
        operacion_frontend:'REABRIR',
        id_solicitud:proceso.id_solicitud,
        tipo_documento:'RECOMENDACION',
        id_documento_origen:rid,
        id_recomendacion:rid,
        id_receta:'',
        id_certificado:'',
        id_atencion:proceso.id_atencion
      });

      proceso.estado='PENDIENTE';
      proceso.poll_token=Date.now();
      recomendacionFirmaProcesos.set(rid,proceso);

      if(auroRecFirmaEsContextoActual(rid,proceso.id_atencion)){
        auroRecFirmaActualizarUI();
        setMsg('Solicitud de firma reabierta.','ok');
      }

      return auroRecFirmaEsperar(
        rid,
        proceso.id_solicitud,
        proceso.id_atencion
      );
    }catch(error){
      setMsg(txt(error?.message||'No se pudo reabrir la firma.'),'error');
      return null;
    }
  }

  function auroRecFirmaBlobPDF(base64){
    const bin=atob(String(base64||''));
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return new Blob([bytes],{type:'application/pdf'});
  }

  async function auroRecFirmaVerFirmada(idSolicitado,idAtencionSolicitada){
    const ctx=state.contexto||contextoAtencion();
    const id=txt(idSolicitado||state.idRecomendacion);
    const idAtn=txt(idAtencionSolicitada||ctx?.id);
    const pertenece=(state.registros||[]).some(r=>
      txt(r?.id_recomendacion)===id && txt(r?.id_atencion)===idAtn);
    if(!id || !idAtn || txt(ctx?.id)!==idAtn || !pertenece ||
       !['FIRMADA','NUEVA_VERSION'].includes(auroRecFirmaEstado(id).estado)){
      setMsg('No se ha confirmado una firma de esta recomendación en la atención seleccionada.','error');
      return null;
    }
    const ventana=window.open('','_blank');
    if(ventana){
      ventana.document.title='Cargando recomendación firmada…';
      ventana.document.body.innerHTML='<div style="font:15px/1.6 Arial,sans-serif;padding:24px;color:#334155"><strong>Cargando recomendación firmada…</strong><p>Se está recuperando el PDF certificado.</p></div>';
    }
    try{
      const r=await auroRecFirmaPost('obtenerDocumentoFirmado',{
        tipo_documento:'RECOMENDACION',
        id_documento_origen:id,
        id_recomendacion:id,
        id_receta:'',
        id_certificado:'',
        id_atencion:idAtn
      });

      if(!r?.pdf_firmado_base64){
        throw new Error(r?.message||'No se encontró el PDF firmado.');
      }

      const url=URL.createObjectURL(auroRecFirmaBlobPDF(r.pdf_firmado_base64));
      if(ventana) ventana.location.href=url;
      else window.open(url,'_blank');
      setTimeout(()=>URL.revokeObjectURL(url),120000);
      return r;
    }catch(error){
      if(ventana) ventana.close();
      setMsg(txt(error?.message||'No se pudo abrir la recomendación firmada.'),'error');
      return null;
    }
  }

  async function auroRecFirmaAccionPrincipal(){
    const id=txt(state.idRecomendacion);
    if(!id) return auroRecFirmaFirmarActual();

    if(auroRecFirmaHayCambiosSinGuardar()){
      setMsg('Guarde los cambios antes de firmar una nueva versión.','error');
      auroRecFirmaActualizarUI();
      return null;
    }

    const proceso=auroRecFirmaProceso(id);
    if(proceso && ['ERROR','EXPIRADA'].includes(txt(proceso.estado).toUpperCase())){
      return auroRecFirmaReabrir(id);
    }

    const estado=auroRecFirmaEstado(id);
    if(['FIRMADA','NUEVA_VERSION'].includes(estado.estado) && !proceso){
      return auroRecFirmaVerFirmada();
    }

    return auroRecFirmaFirmarActual();
  }


  function enlazar(){
    const guardarBtn=document.getElementById('auroRecBtnGuardar');
    const nuevaBtn=document.getElementById('auroRecBtnNueva');
    const recargarBtn=document.getElementById('auroRecBtnRecargar');
    const vistaBtn=document.getElementById('auroRecBtnVista');
    const agregarPlanBtn=document.getElementById('auroRecBtnAgregarPlan');
    const app=document.getElementById('auroRecomendacionesApp');
    document.querySelectorAll('[data-auro-rec-expand]').forEach(btn=>{
      if(btn.dataset.iasynRecExpandBound==='1') return;
      btn.dataset.iasynRecExpandBound='1';
      btn.addEventListener('click',()=>recAmpliarEditor(btn.dataset.auroRecExpand));
    });

    if(nuevaBtn && nuevaBtn.dataset.auroRec!=='1'){
      nuevaBtn.dataset.auroRec='1';
      nuevaBtn.addEventListener('click',nuevaRecomendacion);
    }
    if(guardarBtn && guardarBtn.dataset.auroRec!=='1'){
      guardarBtn.dataset.auroRec='1';
      guardarBtn.addEventListener('click',guardar);
    }
    if(recargarBtn && recargarBtn.dataset.auroRec!=='1'){
      recargarBtn.dataset.auroRec='1';
      recargarBtn.addEventListener('click',()=>{
        if(!recPermitirDescartarCambios()) return;
        state.modoNuevo=false;
        return cargar(true);
      });
    }
    if(vistaBtn && vistaBtn.dataset.auroRec!=='1'){
      vistaBtn.dataset.auroRec='1';
      vistaBtn.addEventListener('click',vistaPrevia);
    }
    if(agregarPlanBtn && agregarPlanBtn.dataset.auroRec!=='1'){
      agregarPlanBtn.dataset.auroRec='1';
      agregarPlanBtn.addEventListener('click',async ()=>{
        await agregarIndicacionesPlanManualmente();
        auroRecFirmaActualizarUI();
      });
    }
    if(app && app.dataset.auroRecFirmaDirty!=='1'){
      app.dataset.auroRecFirmaDirty='1';
      app.addEventListener('input',auroRecFirmaActualizarUI);
      app.addEventListener('change',auroRecFirmaActualizarUI);
    }
    auroRecFirmaActualizarUI();
  }

  async function inicializar(){
    instalarEstilos();
    const mount=asegurarMount();
    if(!mount) return false;
    enlazar();
    state.inicializado=true;
    await cargar(false);
    return true;
  }

  /*
    IASYN RECOMENDACIONES 1.2.0 — AISLAMIENTO POR ATENCIÓN
    -------------------------------------------------------
    La limpieza solo responde al evento canónico de Atenciones.
    Cambiar/limpiar atención invalida cargas y guardados visuales anteriores,
    pero nunca intenta revertir una escritura que ya llegó al backend.
  */
  function onAtencionLimpiada(){
    recCerrarNotificaciones();
    state.tokenCarga++;
    state.tokenGuardado++;
    recomendacionFirmaSyncToken++;
    recomendacionFirmaHistorialToken++;
    state.cargando=false;
    state.guardando=false;
    state.idAtencion='';
    state.idRecomendacion='';
    state.registro=null;
    state.registros=[];
    state.modoNuevo=false;
    state.verificandoFirma=false;
    state.firmaVerificacionFallida=false;
    state.diagnosticos=[];
    state.firmaPersistida='';
    state.firmaPersistidaAtencion='';
    state.contexto={
      id:'',
      atencion:{},
      idPaciente:'',
      numeroConsulta:'',
      estadoAtencion:'',
      finalizada:false,
      bloqueada:false,
      editable:false,
      historica:false
    };
    limpiar();
    renderDiagnosticos();
    renderContexto();
    setMsg('Seleccione una atención antes de trabajar Recomendaciones.','info');
  }

  function onAtencionCambio(){
    const id=idAtencionActiva();

    if(id !== state.idAtencion){
      recCerrarNotificaciones();
      state.tokenCarga++;
      state.tokenGuardado++;
      recomendacionFirmaSyncToken++;
      recomendacionFirmaHistorialToken++;
      state.cargando=false;
      state.guardando=false;
      state.idAtencion=id;
      state.idRecomendacion='';
      state.registro=null;
      state.registros=[];
      state.modoNuevo=false;
      state.verificandoFirma=false;
      state.firmaVerificacionFallida=false;
      state.diagnosticos=[];
      state.firmaPersistida='';
      state.firmaPersistidaAtencion='';
      state.contexto=contextoAtencion();

      /* Limpieza inmediata para no dejar datos visuales de la atención previa. */
      limpiar();
      renderDiagnosticos();
      renderContexto();

      if(id){
        setMsg('Cargando recomendaciones de esta atención...','info');
        setTimeout(()=>cargar(true),50);
      }else{
        setMsg('Seleccione una atención antes de trabajar Recomendaciones.','info');
      }
    }else{
      state.contexto=contextoAtencion();
      renderContexto();
    }
  }

  window.addEventListener('aurosanax:atencion-cambiada',onAtencionCambio);
  window.addEventListener('aurosanax:atencion-seleccionada',onAtencionCambio);
  window.addEventListener('aurosanax:atencion-actualizada',onAtencionCambio);
  window.addEventListener('aurosanax:atencion-limpiada',onAtencionLimpiada);

  /*
    Si Plan termina de cargar después de Recomendaciones, se intenta la misma
    precarga segura. Solo actúa en la MISMA id_atencion y si el campo sigue vacío.
  */
  window.addEventListener('aurosanax:plan-cargado',async (evento)=>{
    const idEvento=txt(evento?.detail?.id_atencion || evento?.detail?.idAtencion);
    const ctx=state.contexto || contextoAtencion();

    if(state.guardando || state.verificandoFirma || recDocumentoFirmadoActivo()) return;
    if(!idEvento || !ctx?.id || idEvento !== txt(ctx.id)) return;
    if(getValue('auroRecGenerales')) return;

    if(await precargarIndicacionesDesdePlanSiVacio(idEvento)){
      if(txt(contextoAtencion()?.id) !== idEvento) return;
      setMsg(
        'Se precargaron las indicaciones para paciente del Plan en Recomendaciones generales. Puede revisarlas y editarlas antes de guardar.',
        'info'
      );
      auroRecFirmaActualizarUI();
    }
  });

  window.addEventListener('aurosanax:diagnosticos-actualizados',(evento)=>{
    const idEvento=txt(evento?.detail?.id_atencion || evento?.detail?.idAtencion);
    const idActual=txt((state.contexto || contextoAtencion())?.id || state.idAtencion);
    if(!idActual) return;
    if(idEvento && idEvento !== idActual) return;
    cargarDiagnosticos(idActual);
  });


  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('auroRecomendacionesMount')) inicializar();
  });

  window.auroRecomendaciones={
    version:VERSION,
    inicializar:inicializar,
    cargar:function(){return cargar(true);},
    guardar:guardar,
    nueva:nuevaRecomendacion,
    abrirHistorial:abrirRecomendacionHistorial,
    vistaPrevia:vistaPrevia,
    estado:state,

    /* Contrato público único de firma de Recomendaciones. */
    obtenerDocumentoFirmableActual:auroRecFirmaObtenerDocumentoActual,
    obtenerEstadoFirmaActual:auroRecFirmaObtenerEstadoActual,
    firmarElectronicaActual:auroRecFirmaFirmarActual,
    firmarRecomendacion:auroRecFirmaFirmar,
    cancelarFirma:auroRecFirmaCancelar,
    reabrirFirma:auroRecFirmaReabrir,
    abrirDocumentoFirmado:auroRecFirmaVerFirmada,
    sincronizarEstadoFirma:auroRecFirmaSincronizarPersistencia
  };

  /* Alias propio IASYN sin romper consumidores heredados de window.auroRecomendaciones. */
  window.iasynRecomendaciones = window.auroRecomendaciones;
})();
