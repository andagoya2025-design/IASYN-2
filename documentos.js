/***********************************************************************
 IASYN ERP
 Archivo: documentos.js
 Módulo: Documentos clínicos por atención
 Versión: 1.3.0
 Fecha: 2026-08-14
 -----------------------------------------------------------------------
 ARQUITECTURA / ANTIRREGRESIÓN
 - Módulo funcional independiente.
 - Aislamiento principal por id_atencion.
 - Google Drive almacena el archivo físico.
 - Google Sheets almacena únicamente metadatos / referencias.
 - Los archivos NO se descargan al abrir la historia; se abren bajo demanda.
 - Imágenes: optimización cliente -> JPEG antes de subir.
 - PDF: no se re-renderiza ni altera clínicamente; se controla peso máximo.
 - Selección en cola por categoría; NO sube al elegir.
 - Guardado explícito por categoría, con subidas secuenciales para evitar saturar navegador / Apps Script.
 - NO modifica Plan, Recetas, Diagnóstico, Certificados, Recomendaciones,
   Examen Físico, Anamnesis ni Atenciones.
 - NO depende del botón global "Guardar historia".
 - No elimina físicamente documentos clínicos desde frontend: usa anulación.
 - Responsive: escritorio, tablet, iPhone y Android.
************************************************************************/

(function(){
  'use strict';

  if(window.auroDocumentos && window.auroDocumentos.version){
    console.warn('IASYN DOCUMENTOS: módulo ya cargado.');
    return;
  }

  const MODULO = 'IASYN DOCUMENTOS';
  const VERSION = '1.3.0';
  const JSON_VERSION = 'IASYN_DOCUMENTOS_JSON_V1';

  /*
    IASYN - AISLAMIENTO / COMPATIBILIDAD INTERNA TEMPORAL
    -----------------------------------------------------
    Este módulo no contiene URLs directas de Apps Script, Drive, Sheets
    ni dominios AUROSANAX. El backend se obtiene exclusivamente desde
    API_URL, que debe estar definido por el index de IASYN.

    Los eventos `aurosanax:*`, claves `aurosanax_*`, objetos `window.auro*`
    y atributos DOM `data-auro-*` que permanecen son contratos internos
    heredados compartidos con Atenciones, Historia, Diagnóstico e index.
    No representan una conexión activa con AUROSANAX PRUEBA y no deben
    renombrarse de forma aislada porque romperían la comunicación interna.
  */

  /*
    CONTRATOS DE BACKEND ESPERADOS
    --------------------------------
    GET  ?accion=listarDocumentosPorAtencion&id_atencion=...
      -> [] o {registros:[...]}

    POST {accion:"subirDocumentoClinico", data:{...}}
      -> {
           success:true,
           id_documento:"DOC-...",
           drive_file_id:"...",
           archivo_url:"...",
           nombre_documento:"...",
           mime_type:"...",
           extension:"jpg|pdf",
           tamano_bytes:12345,
           creado_en:"..."
         }

    POST {accion:"anularDocumentoClinico", data:{
           id_documento:"...",
           id_atencion:"..."
         }}
      -> {success:true}

    OPCIONAL:
    GET ?accion=obtenerDocumentoClinico&id_documento=...
      No es requerido para V1 si archivo_url viene en el listado.

    REGLA:
    El backend debe derivar/validar contexto real por id_atencion.
    El frontend NO es autoridad de numero_consulta, nombre_paciente o nombre_medico.
  */

  const ENDPOINTS = Object.freeze({
    listar: 'listarDocumentosPorAtencion',
    subir: 'subirDocumentoClinico',
    anular: 'anularDocumentoClinico'
  });

  /*
    Límites V1 orientados a mantener el ERP liviano.
    Se pueden ajustar posteriormente sin cambiar contratos.
  */
  const LIMITES = Object.freeze({
    imagenEntradaBytes: 12 * 1024 * 1024,   // 12 MB máximo antes de comprimir
    imagenSalidaBytes:  2 * 1024 * 1024,    // objetivo / corte final de 2 MB
    pdfBytes:            5 * 1024 * 1024,    // PDF máximo 5 MB
    ladoMaximoImagen: 1800,
    calidadJpegInicial: 0.80,
    calidadJpegMinima: 0.58,
    maxArchivosPorLote: 12
  });

  const CATEGORIAS = Object.freeze([
    {
      key:'LABORATORIO',
      label:'Laboratorios',
      icon:'bi-droplet-half',
      accept:'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif'
    },
    {
      key:'ECOGRAFIA_IMAGEN',
      label:'Ecografías / imágenes',
      icon:'bi-image',
      accept:'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif'
    },
    {
      key:'FOTOGRAFIA_CLINICA',
      label:'Fotografías clínicas',
      icon:'bi-camera',
      accept:'image/jpeg,image/png,image/webp,image/heic,image/heif'
    },
    {
      key:'OTRO',
      label:'Otros documentos',
      icon:'bi-file-earmark-medical',
      accept:'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif'
    }
  ]);

  const state = {
    inicializado:false,
    montado:false,
    cargando:false,
    subiendo:false,
    tokenCarga:0,
    idAtencion:'',
    contexto:null,
    registros:[],
    medicos:[],
    medicosCargados:false,
    filtro:'TODOS',
    colas:{
      LABORATORIO:{files:[], idAtencion:''},
      ECOGRAFIA_IMAGEN:{files:[], idAtencion:''},
      FOTOGRAFIA_CLINICA:{files:[], idAtencion:''},
      OTRO:{files:[], idAtencion:''}
    },
    ultimoError:''
  };

  const txt = v => String(v === null || v === undefined ? '' : v).trim();

  function norm(v){
    return txt(v)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/\s+/g,' ')
      .trim();
  }

  function esc(v){
    return String(v ?? '')
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

    const q = new URLSearchParams({accion, _:String(Date.now())});
    Object.entries(params || {}).forEach(([k,v])=>{
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
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({
        accion,
        data:data || {}
      })
    });

    if(!r.ok) throw new Error('Error HTTP ' + r.status + ' en ' + accion);
    return await r.json();
  }

  function arr(data){
    return Array.isArray(data)
      ? data
      : Array.isArray(data?.registros)
        ? data.registros
        : Array.isArray(data?.data)
          ? data.data
          : [];
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
        const a = window.obtenerContextoAtencionActual();
        if(a && txt(a.id_atencion)) return a;
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
      const lista = raw ? JSON.parse(raw) : [];
      return Array.isArray(lista) ? lista : [];
    }catch(e){
      return [];
    }
  }

  function contextoAtencion(){
    const activa = atencionActiva() || {};
    const id = txt(activa.id_atencion || idAtencionActiva());

    if(!id){
      return {
        id:'',
        atencion:{},
        editable:false,
        bloqueada:false,
        finalizada:false,
        idPaciente:'',
        idHistoria:'',
        idMedico:'',
        numeroConsulta:''
      };
    }

    const local = atencionesLocales();
    const respaldo = local.find(x=>txt(x?.id_atencion) === id) || {};
    const a = Object.assign({}, respaldo, activa);

    const estado = norm(
      activa.estado_atencion ||
      activa.estado ||
      activa.estado_consulta ||
      a.estado_atencion ||
      a.estado ||
      a.estado_consulta
    );

    /*
      Un documento clínico puede adjuntarse luego de finalizar la consulta.
      Solo se bloquean atenciones anuladas/canceladas/archivadas.
    */
    const bloqueada = /(anulad|cancelad|archivad)/.test(estado);
    const finalizada = /(cerrad|finaliz|complet)/.test(estado);

    return {
      id,
      atencion:a,
      editable:!bloqueada,
      bloqueada,
      finalizada,
      idPaciente:txt(a.id_paciente),
      idHistoria:txt(a.id_historia),
      idMedico:txt(a.id_medico),
      numeroConsulta:txt(a.numero_consulta || a.numero_atencion || a.numero)
    };
  }

  function nombrePaciente(ctx){
    const a = ctx?.atencion || {};
    return txt(
      a.nombre_paciente ||
      a.paciente_nombre ||
      window.currentAttention?.nombre_paciente ||
      window.atencionActual?.nombre_paciente ||
      document.getElementById('hcPacienteResumen')?.textContent
    ) || 'Paciente';
  }

  function nombreCompletoPersona(p){
    if(!p || typeof p !== 'object') return '';
    return txt(
      p.nombre_completo ||
      p.nombre ||
      p.nombres_apellidos ||
      [
        p.nombres || p.nombre1 || '',
        p.apellidos || [p.apellido_paterno,p.apellido_materno].filter(Boolean).join(' ')
      ].filter(Boolean).join(' ')
    );
  }

  function resolverMedico(ctx){
    const a = ctx?.atencion || {};
    const id = txt(ctx?.idMedico || a.id_medico);

    /*
      Mismo criterio clínico usado por Certificados:
      resolver por id_medico contra catálogos de médicos.
      IMPORTANTE: no usar .doctor-pill porque puede representar
      al usuario/administrador conectado y no al médico tratante.
    */
    const listas = [
      state.medicos,
      window.medicos,
      window.medicosActivos,
      window.listaMedicos,
      window.configuracionMedicos,
      window.medicosConfiguracion
    ].filter(Array.isArray);

    let m = null;
    if(id){
      for(const lista of listas){
        m = lista.find(x=>txt(x?.id_medico || x?.id || x?.codigo) === id) || null;
        if(m) break;
      }
    }

    const nombre = nombreCompletoPersona(m) || txt(
      a.nombre_medico ||
      a.medico_nombre ||
      window.currentAttention?.nombre_medico ||
      window.atencionActual?.nombre_medico
    );

    const especialidad = txt(
      m?.especialidad_principal ||
      m?.especialidad ||
      m?.especialidad_medica ||
      a.especialidad ||
      a.especialidad_principal ||
      a.medico_especialidad ||
      window.currentAttention?.especialidad ||
      window.currentAttention?.medico_especialidad ||
      window.atencionActual?.especialidad ||
      window.atencionActual?.medico_especialidad
    );

    return {
      id_medico:id,
      nombre:nombre || 'Profesional tratante',
      especialidad
    };
  }

  async function cargarMedicosActivos(){
    /*
      Patrón clínico homologado con Certificados:
      el médico responsable se resuelve por id_medico de la atención
      contra el catálogo real de médicos activos.
      Esta llamada es SOLO LECTURA.
    */
    try{
      const r = await apiGet('listarMedicosActivos',{});
      state.medicos = arr(r);
      state.medicosCargados = true;
      return state.medicos;
    }catch(error){
      console.warn(MODULO+': no se pudo cargar listarMedicosActivos.', error);
      state.medicos = [];
      state.medicosCargados = true;
      return [];
    }
  }

  function nombreMedico(ctx){
    return resolverMedico(ctx).nombre;
  }

  function especialidadMedico(ctx){
    return resolverMedico(ctx).especialidad;
  }

  function fechaAtencion(ctx){
    const a = ctx?.atencion || {};
    return txt(
      a.fecha_atencion ||
      a.fecha_consulta ||
      a.fecha ||
      a.creado_en
    );
  }

  function fechaAtencionVisual(valor){
    const raw = txt(valor);
    if(!raw) return '—';

    /*
      Documentos muestra FECHA clínica, no una hora artificial 00:00.
      Si el dato viene como ISO/fecha-hora, conserva solo DD/MM/AAAA.
    */
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return `${m[3]}/${m[2]}/${m[1]}`;

    const d = new Date(raw);
    if(!Number.isNaN(d.getTime())){
      return d.toLocaleDateString('es-EC',{
        day:'2-digit',
        month:'2-digit',
        year:'numeric'
      });
    }

    return raw;
  }

  function usuarioActual(){
    try{
      const raw =
        sessionStorage.getItem('iasyn_seguridad_usuario') ||
        sessionStorage.getItem('aurosanax_seguridad_usuario');
      if(raw){
        const u = JSON.parse(raw);
        return txt(u.nombre_completo || u.usuario || u.email);
      }
    }catch(e){}
    return txt(document.documentElement.dataset.auroUsuario) || 'IASYN ERP';
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
        day:'2-digit',
        month:'2-digit',
        year:'numeric',
        hour:'2-digit',
        minute:'2-digit',
        hour12:false
      });
    }

    return raw;
  }

  function bytesVisual(bytes){
    const n = Number(bytes || 0);
    if(!Number.isFinite(n) || n <= 0) return '—';
    if(n < 1024) return n + ' B';
    if(n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
    return (n/(1024*1024)).toFixed(n >= 10*1024*1024 ? 0 : 1) + ' MB';
  }

  function categoriaInfo(key){
    return CATEGORIAS.find(c=>c.key === key) || CATEGORIAS[CATEGORIAS.length-1];
  }

  function normalizarCategoria(v){
    const n = norm(v).replace(/\s+/g,'_').toUpperCase();
    const exacta = CATEGORIAS.find(c=>c.key === n);
    if(exacta) return exacta.key;

    if(/labor/.test(norm(v))) return 'LABORATORIO';
    if(/eco|imagen|radiol|tomograf|reson/.test(norm(v))) return 'ECOGRAFIA_IMAGEN';
    if(/foto/.test(norm(v))) return 'FOTOGRAFIA_CLINICA';
    return 'OTRO';
  }

  function extensionArchivo(nombre, mime){
    const n = txt(nombre);
    const m = n.match(/\.([a-z0-9]{1,8})$/i);
    if(m) return m[1].toLowerCase();
    if(mime === 'application/pdf') return 'pdf';
    if(mime === 'image/jpeg') return 'jpg';
    if(mime === 'image/png') return 'png';
    if(mime === 'image/webp') return 'webp';
    return '';
  }

  function esImagen(file){
    return /^image\//i.test(txt(file?.type)) ||
      /\.(jpe?g|png|webp|heic|heif)$/i.test(txt(file?.name));
  }

  function esPdf(file){
    return txt(file?.type) === 'application/pdf' || /\.pdf$/i.test(txt(file?.name));
  }

  function panelActivo(){
    return document.getElementById('hc_docs')?.classList.contains('active') === true;
  }

  function instalarCSS(){
    if(document.getElementById('auroDocumentosCSS')) return;

    const style = document.createElement('style');
    style.id = 'auroDocumentosCSS';
    style.textContent = `
#auroDocumentosApp{width:100%;max-width:1180px;margin:0 auto;color:#1f2937}
#auroDocumentosApp *{box-sizing:border-box}
.auro-doc-shell{display:grid;gap:15px;min-width:0}
.auro-doc-hero{border:1px solid #ead7e2;border-radius:22px;background:linear-gradient(135deg,#fff,#fff7fb);box-shadow:0 12px 34px rgba(139,30,90,.065);overflow:hidden}
.auro-doc-hero-main{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:16px 18px}
.auro-doc-icon{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff;font-size:22px;box-shadow:0 9px 20px rgba(139,30,90,.2)}
.auro-doc-kicker{font-size:10px;letter-spacing:.08em;font-weight:950;color:#8b1e5a;text-transform:uppercase}
.auro-doc-title{font-size:20px;font-weight:950;line-height:1.2;margin-top:2px;color:#111827;overflow-wrap:anywhere}
.auro-doc-sub{font-size:12px;color:#64748b;font-weight:700;margin-top:4px;overflow-wrap:anywhere}
.auro-doc-state{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 11px;font-size:11px;font-weight:900;white-space:nowrap}
.auro-doc-state.edit{background:#dcfce7;color:#166534}
.auro-doc-state.read{background:#f1f5f9;color:#475569}
.auro-doc-context{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid #f0e1e9;background:rgba(255,255,255,.72)}
.auro-doc-context-item{padding:10px 13px;border-right:1px solid #f0e1e9;min-width:0}
.auro-doc-context-item:last-child{border-right:0}
.auro-doc-context-item span{display:block;color:#8b7280;font-size:9.5px;text-transform:uppercase;font-weight:900;letter-spacing:.05em}
.auro-doc-context-item b{display:block;margin-top:3px;font-size:12px;overflow-wrap:anywhere}
.auro-doc-msg{padding:10px 12px;border-radius:13px;font-size:12px;font-weight:750}
.auro-doc-msg.info{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe}
.auro-doc-msg.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.auro-doc-msg.warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
.auro-doc-msg.error{background:#fff1f2;color:#9f1239;border:1px solid #fecdd3}
.auro-doc-categories{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
.auro-doc-category{border:1px solid #e7e9ed;border-radius:17px;background:#fff;padding:13px;display:grid;gap:9px;box-shadow:0 7px 20px rgba(15,23,42,.035);min-width:0}
.auro-doc-category-top{display:flex;align-items:center;gap:9px}
.auro-doc-category-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#fdf2f8;color:#8b1e5a;font-size:18px;flex:0 0 auto}
.auro-doc-category b{font-size:13px;line-height:1.2}
.auro-doc-count{font-size:11px;color:#64748b;font-weight:800}
.auro-doc-upload-btn{width:100%;border:1px solid #f3c7df;background:#fff7fb;color:#8b1e5a;border-radius:11px;padding:8px 9px;font-weight:850;font-size:12px;cursor:pointer}
.auro-doc-upload-btn:disabled{opacity:.45;cursor:not-allowed}
.auro-doc-queue{display:grid;gap:7px}
.auro-doc-queue-info{min-height:18px;font-size:10.5px;color:#64748b;font-weight:750;line-height:1.35;overflow-wrap:anywhere}
.auro-doc-queue-actions{display:grid;grid-template-columns:1fr auto;gap:7px}
.auro-doc-save-btn{border:0;background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff;border-radius:11px;padding:8px 9px;font-weight:900;font-size:11.5px;cursor:pointer}
.auro-doc-clear-btn{border:1px solid #e5e7eb;background:#fff;color:#64748b;border-radius:11px;padding:8px 9px;font-weight:850;font-size:11px;cursor:pointer}
.auro-doc-save-btn:disabled,.auro-doc-clear-btn:disabled{opacity:.42;cursor:not-allowed}
.auro-doc-card{border:1px solid #e5e7eb;border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 8px 25px rgba(15,23,42,.04)}
.auro-doc-card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#2f1f3a;color:#fff}
.auro-doc-card-head b{font-size:13px}
.auro-doc-card-head small{display:block;opacity:.8;font-size:10.5px;margin-top:2px}
.auro-doc-card-body{padding:14px}
.auro-doc-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:11px}
.auro-doc-filters{display:flex;gap:6px;flex-wrap:wrap}
.auro-doc-filter{border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:6px 9px;font-size:10.5px;font-weight:850;color:#475569;cursor:pointer}
.auro-doc-filter.active{background:#8b1e5a;color:#fff;border-color:#8b1e5a}
.auro-doc-refresh{border:1px solid #e5e7eb;background:#fff;border-radius:11px;padding:7px 9px;font-size:11px;font-weight:850;color:#475569;cursor:pointer}
.auro-doc-list{display:grid;gap:8px}
.auro-doc-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid #edf0f3;border-radius:14px;background:#fff;min-width:0}
.auro-doc-file-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#f8fafc;color:#8b1e5a;font-size:17px}
.auro-doc-file-main{min-width:0}
.auro-doc-file-name{font-size:12.5px;font-weight:900;color:#111827;overflow-wrap:anywhere}
.auro-doc-file-meta{font-size:10.5px;color:#64748b;font-weight:700;margin-top:3px;line-height:1.35;overflow-wrap:anywhere}
.auro-doc-file-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.auro-doc-btn{border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:7px 9px;font-size:10.5px;font-weight:850;color:#374151;cursor:pointer}
.auro-doc-btn.open{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}
.auro-doc-btn.danger{border-color:#fecdd3;background:#fff1f2;color:#9f1239}
.auro-doc-btn:disabled{opacity:.45;cursor:not-allowed}
.auro-doc-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:13px;color:#64748b;font-size:12px;text-align:center}
.auro-doc-progress{display:grid;gap:8px}
.auro-doc-progress-item{border:1px solid #edf0f3;border-radius:12px;padding:9px 10px}
.auro-doc-progress-top{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:800}
.auro-doc-progress-bar{height:7px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-top:7px}
.auro-doc-progress-fill{height:100%;width:0;background:linear-gradient(135deg,#8b1e5a,#c23b83);transition:width .2s}
.auro-doc-note{font-size:11px;color:#64748b;line-height:1.45;margin-top:8px}
.auro-doc-hidden-input{display:none!important}
@media(max-width:960px){
  .auro-doc-categories{grid-template-columns:repeat(2,minmax(0,1fr))}
  .auro-doc-context{grid-template-columns:repeat(2,minmax(0,1fr))}
  .auro-doc-context-item{border-bottom:1px solid #f0e1e9}
  .auro-doc-context-item:nth-child(2n){border-right:0}
}
@media(max-width:640px){
  html,body{max-width:100%;overflow-x:hidden}
  #hc_docs,#auroDocumentosMount,#auroDocumentosApp{max-width:100%!important;min-width:0!important;overflow-x:hidden!important}
  .auro-doc-shell{gap:11px}
  .auro-doc-hero{border-radius:17px}
  .auro-doc-hero-main{grid-template-columns:auto minmax(0,1fr);padding:13px;gap:10px}
  .auro-doc-icon{width:42px;height:42px;border-radius:13px}
  .auro-doc-title{font-size:17px}
  .auro-doc-state{grid-column:1/-1;width:100%;justify-content:center;white-space:normal;text-align:center}
  .auro-doc-context{grid-template-columns:1fr}
  .auro-doc-context-item{border-right:0;border-bottom:1px solid #f0e1e9;padding:8px 11px}
  .auro-doc-categories{grid-template-columns:1fr}
  .auro-doc-category{padding:11px;border-radius:15px}
  .auro-doc-card{border-radius:16px}
  .auro-doc-card-head{padding:10px 11px}
  .auro-doc-card-body{padding:11px}
  .auro-doc-row{grid-template-columns:auto minmax(0,1fr);align-items:start}
  .auro-doc-file-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;width:100%}
  .auro-doc-btn{min-height:40px}
}
`;
    document.head.appendChild(style);
  }

  function htmlApp(){
    const categorias = CATEGORIAS.map(c=>`
      <div class="auro-doc-category">
        <div class="auro-doc-category-top">
          <div class="auro-doc-category-icon"><i class="bi ${esc(c.icon)}"></i></div>
          <div style="min-width:0">
            <b>${esc(c.label)}</b>
            <div class="auro-doc-count" id="auroDocCount_${esc(c.key)}">0 archivos</div>
          </div>
        </div>
        <button type="button" class="auro-doc-upload-btn" data-auro-doc-upload="${esc(c.key)}">
          <i class="bi bi-paperclip me-1"></i> Elegir archivo(s)
        </button>
        <div class="auro-doc-queue">
          <div class="auro-doc-queue-info" id="auroDocQueueInfo_${esc(c.key)}">
            Sin archivos seleccionados
          </div>
          <div class="auro-doc-queue-actions">
            <button type="button"
              class="auro-doc-save-btn"
              data-auro-doc-save="${esc(c.key)}"
              disabled>
              <i class="bi bi-cloud-arrow-up me-1"></i> Guardar
            </button>
            <button type="button"
              class="auro-doc-clear-btn"
              data-auro-doc-clear="${esc(c.key)}"
              disabled
              title="Quitar selección">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>
        <input
          class="auro-doc-hidden-input"
          type="file"
          id="auroDocInput_${esc(c.key)}"
          data-auro-doc-input="${esc(c.key)}"
          accept="${esc(c.accept)}"
          multiple>
      </div>
    `).join('');

    const filtros = [
      ['TODOS','Todos'],
      ...CATEGORIAS.map(c=>[c.key,c.label])
    ].map(([key,label],i)=>`
      <button type="button"
        class="auro-doc-filter ${i===0?'active':''}"
        data-auro-doc-filter="${esc(key)}">${esc(label)}</button>
    `).join('');

    return `
      <div id="auroDocumentosApp">
        <div class="auro-doc-shell">

          <section class="auro-doc-hero">
            <div class="auro-doc-hero-main">
              <div class="auro-doc-icon"><i class="bi bi-folder2-open"></i></div>
              <div>
                <div class="auro-doc-kicker">Documentos clínicos</div>
                <div class="auro-doc-title" id="auroDocPaciente">Sin atención seleccionada</div>
                <div class="auro-doc-sub" id="auroDocAtencion">
                  Seleccione una atención para consultar o cargar archivos.
                </div>
              </div>
              <div class="auro-doc-state read" id="auroDocEstado">
                <i class="bi bi-lock"></i> Sin atención
              </div>
            </div>

            <div class="auro-doc-context">
              <div class="auro-doc-context-item">
                <span>Consulta</span><b id="auroDocConsulta">—</b>
              </div>
              <div class="auro-doc-context-item">
                <span>Fecha atención</span><b id="auroDocFecha">—</b>
              </div>
              <div class="auro-doc-context-item">
                <span>Médico responsable</span>
                <b id="auroDocMedico">—</b>
                <small id="auroDocEspecialidad" style="display:block;margin-top:2px;color:#64748b;font-size:10px;font-weight:750"></small>
              </div>
              <div class="auro-doc-context-item">
                <span>ID atención</span><b id="auroDocIdAtencion">—</b>
              </div>
            </div>
          </section>

          <div id="auroDocMensaje" class="auro-doc-msg info" hidden></div>

          <section>
            <div class="auro-doc-categories">${categorias}</div>
            <div class="auro-doc-note">
              Imágenes: se optimizan a JPG antes de subir. PDF: máximo ${Math.round(LIMITES.pdfBytes/1024/1024)} MB.
              Elegir un archivo solo lo deja pendiente. Se carga a Drive únicamente al pulsar Guardar en su categoría y no se descarga al abrir la historia.
            </div>
          </section>

          <section class="auro-doc-card" id="auroDocProgresoCard" hidden>
            <div class="auro-doc-card-head">
              <div>
                <b>Procesando archivos</b>
                <small>La subida se realiza de uno en uno para mantener estable el ERP.</small>
              </div>
            </div>
            <div class="auro-doc-card-body">
              <div id="auroDocProgreso" class="auro-doc-progress"></div>
            </div>
          </section>

          <section class="auro-doc-card">
            <div class="auro-doc-card-head">
              <div>
                <b>Archivos de esta atención</b>
                <small>Se carga solo el índice. El archivo físico se abre únicamente cuando lo solicite.</small>
              </div>
            </div>
            <div class="auro-doc-card-body">
              <div class="auro-doc-toolbar">
                <div class="auro-doc-filters">${filtros}</div>
                <button type="button" class="auro-doc-refresh" id="auroDocRecargar">
                  <i class="bi bi-arrow-repeat me-1"></i> Recargar
                </button>
              </div>
              <div id="auroDocLista" class="auro-doc-list">
                <div class="auro-doc-empty">Sin atención seleccionada.</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function asegurarMount(){
    instalarCSS();

    const panel = document.getElementById('hc_docs');
    if(!panel) return null;

    let mount = document.getElementById('auroDocumentosMount');

    /*
      Compatibilidad con el index actual:
      si todavía contiene el placeholder antiguo con tres inputs,
      documento.js sustituye ÚNICAMENTE el contenido de #hc_docs.
      No modifica .clinical-actions ni otros paneles.
    */
    if(!mount){
      panel.innerHTML = '<div id="auroDocumentosMount"></div>';
      mount = document.getElementById('auroDocumentosMount');
    }

    if(!document.getElementById('auroDocumentosApp')){
      mount.innerHTML = htmlApp();
    }

    state.montado = true;
    return mount;
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  function setMsg(texto, tipo){
    const el = document.getElementById('auroDocMensaje');
    if(!el) return;
    el.className = 'auro-doc-msg ' + (tipo || 'info');
    el.textContent = texto || '';
    el.hidden = !texto;
  }

  function colaCategoria(categoria){
    if(!state.colas[categoria]){
      state.colas[categoria] = {files:[], idAtencion:''};
    }
    return state.colas[categoria];
  }

  function resumenArchivos(files){
    const lista = Array.from(files || []);
    if(!lista.length) return 'Sin archivos seleccionados';

    const total = lista.reduce((acc,file)=>acc + Number(file?.size || 0),0);
    const nombres = lista.slice(0,2).map(file=>txt(file?.name)).filter(Boolean);
    const extra = lista.length > 2 ? ` +${lista.length-2} más` : '';

    return `${lista.length} seleccionado${lista.length===1?'':'s'} · ${bytesVisual(total)} · ${nombres.join(', ')}${extra}`;
  }

  function renderCola(categoria){
    const cola = colaCategoria(categoria);
    const info = document.getElementById('auroDocQueueInfo_'+categoria);
    const btnGuardar = document.querySelector(`[data-auro-doc-save="${categoria}"]`);
    const btnLimpiar = document.querySelector(`[data-auro-doc-clear="${categoria}"]`);

    if(info) info.textContent = resumenArchivos(cola.files);

    const habilitada = !!(
      cola.files.length &&
      cola.idAtencion &&
      state.contexto?.id === cola.idAtencion &&
      state.contexto?.editable &&
      !state.subiendo
    );

    if(btnGuardar) btnGuardar.disabled = !habilitada;
    if(btnLimpiar) btnLimpiar.disabled = !cola.files.length || state.subiendo;
  }

  function renderTodasLasColas(){
    CATEGORIAS.forEach(c=>renderCola(c.key));
  }

  function limpiarCola(categoria, opciones){
    const cola = colaCategoria(categoria);
    cola.files = [];
    cola.idAtencion = '';

    const input = document.getElementById('auroDocInput_'+categoria);
    if(input) input.value = '';

    renderCola(categoria);

    if(opciones?.mensaje){
      setMsg(opciones.mensaje, opciones.tipo || 'info');
    }
  }

  function limpiarTodasLasColas(opciones){
    CATEGORIAS.forEach(c=>limpiarCola(c.key));
    if(opciones?.mensaje){
      setMsg(opciones.mensaje, opciones.tipo || 'info');
    }
  }

  function renderContexto(){
    const ctx = state.contexto || contextoAtencion();

    setText('auroDocPaciente', ctx.id ? nombrePaciente(ctx) : 'Sin atención seleccionada');
    setText(
      'auroDocAtencion',
      ctx.id
        ? `Archivos vinculados exclusivamente a esta atención clínica.`
        : 'Seleccione una atención para consultar o cargar archivos.'
    );
    setText('auroDocConsulta', ctx.numeroConsulta ? 'Consulta #'+ctx.numeroConsulta : '—');
    setText('auroDocFecha', fechaAtencionVisual(fechaAtencion(ctx)));
    setText('auroDocMedico', ctx.id ? nombreMedico(ctx) : '—');
    setText('auroDocEspecialidad', ctx.id ? especialidadMedico(ctx) : '');
    setText('auroDocIdAtencion', ctx.id || '—');

    const estado = document.getElementById('auroDocEstado');
    if(estado){
      estado.className = 'auro-doc-state ' + (ctx.editable ? 'edit' : 'read');

      if(!ctx.id){
        estado.innerHTML = '<i class="bi bi-lock"></i> Sin atención';
      }else if(ctx.bloqueada){
        estado.innerHTML = '<i class="bi bi-lock"></i> Atención bloqueada';
      }else if(ctx.finalizada){
        estado.innerHTML = '<i class="bi bi-check2-circle"></i> Atención finalizada · Archivos habilitados';
      }else{
        estado.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Atención activa';
      }
    }

    document.querySelectorAll('[data-auro-doc-upload]').forEach(btn=>{
      btn.disabled = !ctx.id || !ctx.editable || state.subiendo;
    });

    renderTodasLasColas();
  }

  function registrosActivos(){
    return state.registros.filter(r=>{
      const e = norm(r.estado || 'activo');
      return !/(anulad|eliminad|inactiv)/.test(e);
    });
  }

  function renderContadores(){
    const lista = registrosActivos();
    CATEGORIAS.forEach(c=>{
      const n = lista.filter(r=>normalizarCategoria(r.categoria_documento || r.tipo_documento) === c.key).length;
      setText(`auroDocCount_${c.key}`, n + (n === 1 ? ' archivo' : ' archivos'));
    });
  }

  function iconoRegistro(registro){
    const mime = txt(registro.mime_type);
    const ext = txt(registro.extension).toLowerCase();

    if(mime === 'application/pdf' || ext === 'pdf') return 'bi-file-earmark-pdf';
    if(/^image\//.test(mime) || /^(jpg|jpeg|png|webp|heic|heif)$/.test(ext)) return 'bi-image';
    return 'bi-file-earmark-medical';
  }

  function renderLista(){
    const box = document.getElementById('auroDocLista');
    if(!box) return;

    let lista = registrosActivos();

    if(state.filtro !== 'TODOS'){
      lista = lista.filter(r=>
        normalizarCategoria(r.categoria_documento || r.tipo_documento) === state.filtro
      );
    }

    if(!state.contexto?.id){
      box.innerHTML = '<div class="auro-doc-empty">Seleccione una atención para consultar documentos.</div>';
      renderContadores();
      return;
    }

    if(!lista.length){
      box.innerHTML = '<div class="auro-doc-empty">No existen archivos en esta categoría para la atención seleccionada.</div>';
      renderContadores();
      return;
    }

    const ordenados = [...lista].sort((a,b)=>{
      const fa = new Date(a.creado_en || a.fecha_documento || 0).getTime() || 0;
      const fb = new Date(b.creado_en || b.fecha_documento || 0).getTime() || 0;
      return fb - fa;
    });

    box.innerHTML = ordenados.map(r=>{
      const categoria = categoriaInfo(normalizarCategoria(r.categoria_documento || r.tipo_documento));
      const url = txt(r.archivo_url);
      const id = txt(r.id_documento);

      return `
        <div class="auro-doc-row">
          <div class="auro-doc-file-icon"><i class="bi ${esc(iconoRegistro(r))}"></i></div>
          <div class="auro-doc-file-main">
            <div class="auro-doc-file-name">${esc(r.nombre_documento || 'Documento clínico')}</div>
            <div class="auro-doc-file-meta">
              ${esc(categoria.label)}
              · ${esc((r.extension || '').toUpperCase() || 'ARCHIVO')}
              · ${esc(bytesVisual(r.tamano_bytes))}
              · ${esc(fechaVisual(r.creado_en || r.fecha_documento))}
              ${r.creado_por ? ' · '+esc(r.creado_por) : ''}
            </div>
            ${r.descripcion ? `<div class="auro-doc-file-meta">${esc(r.descripcion)}</div>` : ''}
          </div>
          <div class="auro-doc-file-actions">
            <button type="button"
              class="auro-doc-btn open"
              data-auro-doc-open="${esc(id)}"
              ${url ? '' : 'disabled'}>
              <i class="bi bi-box-arrow-up-right me-1"></i> Ver
            </button>
            <button type="button"
              class="auro-doc-btn danger"
              data-auro-doc-anular="${esc(id)}"
              ${state.contexto?.editable ? '' : 'disabled'}>
              <i class="bi bi-slash-circle me-1"></i> Anular
            </button>
          </div>
        </div>
      `;
    }).join('');

    renderContadores();
  }

  function renderProgreso(items){
    const card = document.getElementById('auroDocProgresoCard');
    const box = document.getElementById('auroDocProgreso');
    if(!card || !box) return;

    if(!items?.length){
      card.hidden = true;
      box.innerHTML = '';
      return;
    }

    card.hidden = false;
    box.innerHTML = items.map((item,i)=>`
      <div class="auro-doc-progress-item" data-auro-doc-progress="${i}">
        <div class="auro-doc-progress-top">
          <span>${esc(item.nombre)}</span>
          <span id="auroDocProgressText_${i}">${esc(item.estado || 'Pendiente')}</span>
        </div>
        <div class="auro-doc-progress-bar">
          <div class="auro-doc-progress-fill" id="auroDocProgressFill_${i}"
            style="width:${Number(item.porcentaje || 0)}%"></div>
        </div>
      </div>
    `).join('');
  }

  function actualizarProgreso(index, porcentaje, estado){
    const fill = document.getElementById(`auroDocProgressFill_${index}`);
    const text = document.getElementById(`auroDocProgressText_${index}`);
    if(fill) fill.style.width = Math.max(0,Math.min(100,Number(porcentaje||0))) + '%';
    if(text) text.textContent = estado || '';
  }

  async function cargar(forzar){
    asegurarMount();

    const ctx = contextoAtencion();
    state.contexto = ctx;

    /*
      Cargar catálogo de médicos una sola vez por sesión del módulo.
      No bloquea otras áreas y no escribe en base de datos.
    */
    if(ctx.id && !state.medicosCargados){
      await cargarMedicosActivos();
    }

    renderContexto();

    if(!ctx.id){
      state.idAtencion = '';
      state.registros = [];
      renderLista();
      setMsg('Seleccione una atención antes de trabajar Documentos.','info');
      return [];
    }

    if(state.cargando) return state.registros;

    /*
      Si ya tenemos el índice de la misma atención y no se pidió recarga,
      evitamos otra consulta de red.
    */
    if(!forzar && state.idAtencion === ctx.id && state.registros.length){
      renderLista();
      return state.registros;
    }

    const token = ++state.tokenCarga;
    state.cargando = true;
    setMsg('Cargando índice de documentos de esta atención...','info');

    try{
      const data = await apiGet(ENDPOINTS.listar,{id_atencion:ctx.id});

      if(token !== state.tokenCarga) return state.registros;

      state.registros = arr(data).filter(r=>
        !txt(r.id_atencion) || txt(r.id_atencion) === ctx.id
      );
      state.idAtencion = ctx.id;

      renderLista();
      setMsg(
        state.registros.length
          ? 'Documentos cargados. Los archivos físicos permanecen en Drive y se abren solo bajo demanda.'
          : 'Esta atención todavía no tiene documentos clínicos registrados.',
        state.registros.length ? 'ok' : 'info'
      );

      return state.registros;
    }catch(error){
      console.error(MODULO+':',error);
      state.ultimoError = txt(error.message || error);
      state.registros = [];
      renderLista();

      const mensaje = /accion|endpoint|no encontrada|desconocida|inv[aá]lida/i.test(state.ultimoError)
        ? 'El frontend de Documentos está listo, pero el backend todavía no expone listarDocumentosPorAtencion.'
        : 'No se pudo cargar Documentos: '+state.ultimoError;

      setMsg(mensaje,'error');
      return [];
    }finally{
      state.cargando = false;
    }
  }

  function cargarImagenEnCanvas(file){
    return new Promise((resolve,reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = ()=>{
        URL.revokeObjectURL(url);

        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        const max = LIMITES.ladoMaximoImagen;
        const escala = Math.min(1, max / Math.max(width,height));
        width = Math.max(1,Math.round(width * escala));
        height = Math.max(1,Math.round(height * escala));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d',{
          alpha:false,
          willReadFrequently:false
        });

        if(!ctx){
          reject(new Error('El navegador no pudo preparar la imagen.'));
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,width,height);
        ctx.drawImage(img,0,0,width,height);

        resolve(canvas);
      };

      img.onerror = ()=>{
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen seleccionada.'));
      };

      img.src = url;
    });
  }

  function canvasToBlob(canvas, quality){
    return new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>{
        if(blob) resolve(blob);
        else reject(new Error('No se pudo comprimir la imagen.'));
      },'image/jpeg',quality);
    });
  }

  async function optimizarImagen(file){
    if(file.size > LIMITES.imagenEntradaBytes){
      throw new Error(
        `La imagen "${file.name}" supera ${Math.round(LIMITES.imagenEntradaBytes/1024/1024)} MB antes de comprimir.`
      );
    }

    const canvas = await cargarImagenEnCanvas(file);
    let quality = LIMITES.calidadJpegInicial;
    let blob = await canvasToBlob(canvas,quality);

    while(blob.size > LIMITES.imagenSalidaBytes && quality > LIMITES.calidadJpegMinima){
      quality = Math.max(LIMITES.calidadJpegMinima, quality - 0.07);
      blob = await canvasToBlob(canvas,quality);
      if(quality === LIMITES.calidadJpegMinima) break;
    }

    if(blob.size > LIMITES.imagenSalidaBytes){
      throw new Error(
        `La imagen "${file.name}" sigue siendo demasiado pesada después de optimizar (${bytesVisual(blob.size)}).`
      );
    }

    const base = txt(file.name).replace(/\.[^.]+$/,'') || 'imagen';
    const nombre = base + '.jpg';

    return {
      blob,
      nombre,
      mime:'image/jpeg',
      extension:'jpg',
      originalNombre:file.name,
      originalBytes:file.size,
      optimizado:true,
      calidad:quality,
      ancho:canvas.width,
      alto:canvas.height
    };
  }

  async function prepararPdf(file){
    if(file.size > LIMITES.pdfBytes){
      throw new Error(
        `El PDF "${file.name}" pesa ${bytesVisual(file.size)}. El máximo permitido es ${Math.round(LIMITES.pdfBytes/1024/1024)} MB.`
      );
    }

    return {
      blob:file,
      nombre:file.name,
      mime:'application/pdf',
      extension:'pdf',
      originalNombre:file.name,
      originalBytes:file.size,
      optimizado:false
    };
  }

  async function prepararArchivo(file){
    if(esImagen(file)) return await optimizarImagen(file);
    if(esPdf(file)) return await prepararPdf(file);

    throw new Error(
      `Formato no permitido en "${file.name}". Use PDF o imagen JPG/PNG/WEBP/HEIC.`
    );
  }

  function blobToBase64(blob){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();

      reader.onload = ()=>{
        const raw = String(reader.result || '');
        const pos = raw.indexOf(',');
        resolve(pos >= 0 ? raw.slice(pos+1) : raw);
      };

      reader.onerror = ()=>reject(new Error('No se pudo preparar el archivo para subir.'));
      reader.readAsDataURL(blob);
    });
  }

  async function sha256Blob(blob){
    try{
      if(!window.crypto?.subtle) return '';
      const buffer = await blob.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256',buffer);
      return Array.from(new Uint8Array(hash))
        .map(b=>b.toString(16).padStart(2,'0'))
        .join('');
    }catch(e){
      return '';
    }
  }

  function yaExisteHash(hash){
    if(!hash) return false;

    return state.registros.some(r=>{
      try{
        const d = typeof r.detalle_json === 'object'
          ? r.detalle_json
          : JSON.parse(txt(r.detalle_json) || '{}');

        return txt(d?.archivo?.sha256) === hash &&
               !/(anulad|eliminad|inactiv)/.test(norm(r.estado || 'activo'));
      }catch(e){
        return false;
      }
    });
  }

  async function construirPayload(preparado, categoria){
    const ctx = state.contexto || contextoAtencion();
    const base64 = await blobToBase64(preparado.blob);
    const sha256 = await sha256Blob(preparado.blob);

    if(yaExisteHash(sha256)){
      throw new Error(
        `El archivo "${preparado.originalNombre}" parece estar ya registrado en esta atención.`
      );
    }

    const detalle = {
      version:JSON_VERSION,
      archivo:{
        nombre_original:preparado.originalNombre,
        nombre_guardado:preparado.nombre,
        mime_type:preparado.mime,
        extension:preparado.extension,
        tamano_original_bytes:preparado.originalBytes,
        tamano_guardado_bytes:preparado.blob.size,
        sha256,
        optimizado:preparado.optimizado === true
      },
      imagen:preparado.optimizado ? {
        ancho_px:preparado.ancho,
        alto_px:preparado.alto,
        calidad_jpeg:preparado.calidad
      } : null,
      almacenamiento:{
        proveedor:'GOOGLE_DRIVE',
        estrategia:'ARCHIVO_EN_DRIVE_INDICE_EN_SHEETS',
        carga_bajo_demanda:true
      }
    };

    return {
      /*
        Campos de contexto enviados para validación, NO como autoridad.
        Backend debe completar/contrastar desde id_atencion.
      */
      id_atencion:ctx.id,
      numero_consulta:ctx.numeroConsulta,
      id_paciente:ctx.idPaciente,
      nombre_paciente:nombrePaciente(ctx),
      id_historia:ctx.idHistoria,
      id_medico:ctx.idMedico,
      nombre_medico:nombreMedico(ctx),
      especialidad:especialidadMedico(ctx),
      id_cita:txt(ctx.atencion?.id_cita),
      id_procedimiento:txt(ctx.atencion?.id_procedimiento),
      fecha_documento:new Date().toISOString(),
      categoria_documento:categoria,
      tipo_documento:categoriaInfo(categoria).label,
      nombre_documento:preparado.nombre,
      descripcion:'',
      mime_type:preparado.mime,
      extension:preparado.extension,
      tamano_bytes:preparado.blob.size,
      origen:'CARGA_ERP',
      detalle_json:JSON.stringify(detalle),
      estado:'Activo',
      creado_por:usuarioActual(),

      /*
        Contenido temporal de transporte.
        El backend NO debe guardar base64 en Sheets.
        Debe decodificar, crear archivo en Drive y descartar este campo.
      */
      archivo_base64:base64
    };
  }

  async function subirUno(file, categoria, index){
    actualizarProgreso(index,5,'Validando');

    const preparado = await prepararArchivo(file);
    actualizarProgreso(index,35, preparado.optimizado ? 'Imagen optimizada' : 'Archivo validado');

    const payload = await construirPayload(preparado,categoria);
    actualizarProgreso(index,55,'Enviando a Drive');

    const r = await apiPost(ENDPOINTS.subir,payload);

    if(!r || r.success === false){
      throw new Error(txt(r?.message || 'El backend no pudo almacenar el documento.'));
    }

    actualizarProgreso(index,100,'Guardado');

    return r;
  }

  function seleccionarArchivos(categoria, files){
    const ctx = contextoAtencion();
    state.contexto = ctx;
    renderContexto();

    if(!ctx.id){
      setMsg('Seleccione una atención antes de elegir documentos.','error');
      limpiarCola(categoria);
      return;
    }

    if(!ctx.editable){
      setMsg('La atención seleccionada está anulada, cancelada o archivada.','error');
      limpiarCola(categoria);
      return;
    }

    if(state.subiendo){
      setMsg('Existe una carga en proceso. Espere a que finalice antes de cambiar la selección.','warn');
      return;
    }

    const lista = Array.from(files || []);

    if(!lista.length){
      limpiarCola(categoria);
      return;
    }

    if(lista.length > LIMITES.maxArchivosPorLote){
      setMsg(
        `Seleccione máximo ${LIMITES.maxArchivosPorLote} archivos por lote para mantener estable el navegador.`,
        'error'
      );
      limpiarCola(categoria);
      return;
    }

    /*
      IMPORTANTE:
      Elegir NO sube nada.
      Se guarda una referencia temporal en memoria del navegador asociada
      a la id_atencion que estaba activa en el momento de seleccionar.
    */
    const cola = colaCategoria(categoria);
    cola.files = lista;
    cola.idAtencion = ctx.id;

    renderCola(categoria);
    setMsg(
      `${lista.length} archivo(s) seleccionado(s) en ${categoriaInfo(categoria).label}. Revise y pulse Guardar para subirlos.`,
      'info'
    );
  }

  async function guardarCategoria(categoria){
    const cola = colaCategoria(categoria);
    const lista = Array.from(cola.files || []);
    const ctx = contextoAtencion();

    state.contexto = ctx;
    renderContexto();

    if(!lista.length){
      setMsg('No hay archivos seleccionados en esta categoría.','warn');
      return;
    }

    if(!ctx.id){
      limpiarCola(categoria);
      setMsg('La atención dejó de estar seleccionada. La selección pendiente fue limpiada por seguridad.','error');
      return;
    }

    /*
      DOBLE BARRERA ANTIRREGRESIÓN:
      la atención actual debe ser exactamente la misma en la que se hizo
      la selección. Si cambió paciente/consulta, NO se permite subir.
    */
    if(!cola.idAtencion || cola.idAtencion !== ctx.id){
      limpiarCola(categoria);
      setMsg('Cambió la atención desde que eligió los archivos. La selección fue limpiada para evitar asociarla a otra consulta.','error');
      return;
    }

    if(!ctx.editable){
      limpiarCola(categoria);
      setMsg('La atención está anulada, cancelada o archivada. No se pueden adjuntar documentos.','error');
      return;
    }

    if(state.subiendo){
      setMsg('Ya existe una carga en proceso. Espere a que finalice.','warn');
      return;
    }

    state.subiendo = true;
    renderContexto();

    const progreso = lista.map(f=>({
      nombre:f.name,
      porcentaje:0,
      estado:'Pendiente'
    }));
    renderProgreso(progreso);

    let ok = 0;
    const errores = [];

    try{
      for(let i=0;i<lista.length;i++){
        try{
          const idAntes = contextoAtencion().id;

          if(idAntes !== cola.idAtencion){
            throw new Error('Cambió la atención durante la carga. Se detuvo el proceso por seguridad.');
          }

          await subirUno(lista[i],categoria,i);
          ok++;
        }catch(error){
          actualizarProgreso(i,100,'Error');
          errores.push(txt(error.message || error));
        }
      }

      if(ok){
        /*
          Una vez enviado el lote confirmado, la cola de ESTA categoría
          se limpia antes de refrescar el índice.
        */
        limpiarCola(categoria);
        await cargar(true);

        try{
          if(typeof window.auroHistoriaGuardarActualizacionConsulta === 'function'){
            window.auroHistoriaGuardarActualizacionConsulta(ctx.atencion || ctx, null, 'hc_docs');
          }
          if(typeof window.auroHistoriaRefrescarEstadoConsultaActiva === 'function' && panelActivo()){
            window.auroHistoriaRefrescarEstadoConsultaActiva('hc_docs');
          }
        }catch(e){}

        window.dispatchEvent(new CustomEvent('aurosanax:documentos-actualizados',{
          detail:{id_atencion:ctx.id, cantidad:ok, categoria}
        }));
      }

      if(errores.length){
        /*
          Si hubo errores parciales, no se arrastra la selección original.
          El usuario puede volver a elegir únicamente lo que quiera reintentar.
        */
        limpiarCola(categoria);
        setMsg(
          `${ok} archivo(s) guardado(s). ${errores.length} no pudieron procesarse: ${errores.join(' | ')}`,
          ok ? 'warn' : 'error'
        );
      }else{
        setMsg(`${ok} archivo(s) guardado(s) correctamente.`,'ok');
      }
    }finally{
      state.subiendo = false;
      renderContexto();

      setTimeout(()=>{
        const card = document.getElementById('auroDocProgresoCard');
        if(card && !state.subiendo) card.hidden = true;
      },2500);
    }
  }


  function abrirDocumento(idDocumento){
    const r = state.registros.find(x=>txt(x.id_documento) === txt(idDocumento));
    if(!r) return;

    const url = txt(r.archivo_url);
    if(!url){
      setMsg('Este registro no tiene un enlace de Drive disponible.','error');
      return;
    }

    const w = window.open(url,'_blank','noopener,noreferrer');
    if(!w){
      setMsg('El navegador bloqueó la apertura. Permita ventanas emergentes para IASYN.','warn');
    }
  }

  async function anularDocumento(idDocumento){
    if(state.subiendo) return;

    const ctx = contextoAtencion();
    const r = state.registros.find(x=>txt(x.id_documento) === txt(idDocumento));

    if(!r || !ctx.id) return;

    if(txt(r.id_atencion) && txt(r.id_atencion) !== ctx.id){
      setMsg('Protección de seguridad: el documento no pertenece a la atención activa.','error');
      return;
    }

    if(!ctx.editable){
      setMsg('La atención está bloqueada y no permite modificar documentos.','error');
      return;
    }

    const nombre = txt(r.nombre_documento || 'este documento');
    const confirmar = window.confirm(
      `¿Anular "${nombre}"?\n\nEl registro clínico no se eliminará silenciosamente; quedará marcado como anulado.`
    );

    if(!confirmar) return;

    try{
      const resp = await apiPost(ENDPOINTS.anular,{
        id_documento:txt(r.id_documento),
        id_atencion:ctx.id
      });

      if(!resp || resp.success === false){
        throw new Error(txt(resp?.message || 'No se pudo anular el documento.'));
      }

      setMsg('Documento anulado correctamente.','ok');
      await cargar(true);

      window.dispatchEvent(new CustomEvent('aurosanax:documentos-actualizados',{
        detail:{id_atencion:ctx.id,id_documento:txt(r.id_documento),accion:'ANULAR'}
      }));
    }catch(error){
      setMsg('No se pudo anular: '+txt(error.message || error),'error');
    }
  }

  function eventos(){
    const app = document.getElementById('auroDocumentosApp');
    if(!app || app.dataset.auroEventos === '1') return;

    app.dataset.auroEventos = '1';

    app.addEventListener('click',e=>{
      const upload = e.target.closest('[data-auro-doc-upload]');
      if(upload){
        const categoria = txt(upload.dataset.auroDocUpload);
        document.getElementById('auroDocInput_'+categoria)?.click();
        return;
      }

      const guardar = e.target.closest('[data-auro-doc-save]');
      if(guardar){
        const categoria = txt(guardar.dataset.auroDocSave);
        guardarCategoria(categoria).catch(error=>{
          console.error(MODULO+':',error);
          setMsg('No se pudo guardar: '+txt(error.message || error),'error');
        });
        return;
      }

      const limpiar = e.target.closest('[data-auro-doc-clear]');
      if(limpiar){
        const categoria = txt(limpiar.dataset.auroDocClear);
        limpiarCola(categoria,{mensaje:'Selección pendiente eliminada.','tipo':'info'});
        return;
      }

      const filtro = e.target.closest('[data-auro-doc-filter]');
      if(filtro){
        state.filtro = txt(filtro.dataset.auroDocFilter) || 'TODOS';

        app.querySelectorAll('[data-auro-doc-filter]').forEach(btn=>{
          btn.classList.toggle('active',btn === filtro);
        });

        renderLista();
        return;
      }

      const abrir = e.target.closest('[data-auro-doc-open]');
      if(abrir){
        abrirDocumento(abrir.dataset.auroDocOpen);
        return;
      }

      const anular = e.target.closest('[data-auro-doc-anular]');
      if(anular){
        anularDocumento(anular.dataset.auroDocAnular);
        return;
      }

      if(e.target.closest('#auroDocRecargar')){
        cargar(true);
      }
    });

    app.addEventListener('change',e=>{
      const input = e.target.closest('[data-auro-doc-input]');
      if(!input) return;

      const categoria = txt(input.dataset.auroDocInput);
      seleccionarArchivos(categoria,input.files);
    });
  }

  async function inicializar(options){
    asegurarMount();
    eventos();

    state.inicializado = true;

    const forzar = options?.forzar === true;

    /*
      Lazy loading:
      montar interfaz no implica necesariamente leer Sheets.
      Solo carga datos cuando Documentos está visible o cuando la llamada
      explícita solicita forzar la carga.
    */
    if(panelActivo() || forzar){
      return await cargar(forzar);
    }

    state.contexto = contextoAtencion();

    if(state.contexto.id && !state.medicosCargados){
      await cargarMedicosActivos();
    }

    renderContexto();
    return [];
  }

  function onAtencionCambio(){
    const nuevoId = idAtencionActiva();

    if(nuevoId !== state.idAtencion){
      const teniaPendientes = CATEGORIAS.some(c=>colaCategoria(c.key).files.length > 0);

      state.tokenCarga++;
      state.idAtencion = nuevoId;
      state.registros = [];
      state.contexto = contextoAtencion();

      /*
        Nunca arrastrar archivos seleccionados de una consulta/paciente
        hacia otra atención.
      */
      limpiarTodasLasColas();

      if(state.montado){
        const refrescarContexto = async ()=>{
          if(state.contexto?.id && !state.medicosCargados){
            await cargarMedicosActivos();
          }
          renderContexto();
          renderLista();
        };

        refrescarContexto().catch(error=>{
          console.warn(MODULO+': no se pudo refrescar contexto médico.', error);
          renderContexto();
          renderLista();
        });

        if(teniaPendientes){
          setMsg(
            'Cambió la atención. Se limpiaron los archivos pendientes para evitar asociarlos a otra consulta.',
            'info'
          );
        }
      }

      if(panelActivo()){
        setTimeout(()=>cargar(true),60);
      }
    }else if(state.montado){
      state.contexto = contextoAtencion();
      renderContexto();
    }
  }

  /*
    Integración independiente con los eventos existentes del ERP.
    Escuchar no provoca guardado.
  */
  window.addEventListener('aurosanax:atencion-cambiada',onAtencionCambio);
  window.addEventListener('aurosanax:atencion-seleccionada',onAtencionCambio);
  window.addEventListener('aurosanax:atencion-actualizada',onAtencionCambio);
  window.addEventListener('aurosanax:paciente-cambiado',onAtencionCambio);
  window.addEventListener('aurosanax:paciente-seleccionado',onAtencionCambio);

  /*
    Compatibilidad con index actual:
    el botón de pestaña usa onclick="showClinicalTab('hc_docs',this)".
    Este listener solo detecta apertura y llama al módulo después.
  */
  document.addEventListener('click',e=>{
    const btn = e.target?.closest?.('.clinical-tabs button');
    if(!btn) return;

    const action = txt(btn.getAttribute('onclick'));
    if(!/hc_docs/.test(action)) return;

    setTimeout(()=>{
      inicializar({forzar:true}).catch(error=>{
        console.error(MODULO+':',error);
      });
    },70);
  });

  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('hc_docs')){
      inicializar({forzar:false});
    }
  });

  /*
    API pública pequeña y explícita.
  */
  window.auroDocumentos = {
    version:VERSION,
    inicializar,
    cargar:function(){ return cargar(true); },
    guardarCategoria,
    limpiarCola,
    limpiarTodasLasColas,
    abrir:abrirDocumento,
    anular:anularDocumento,
    estado:state,
    limites:LIMITES,
    endpoints:ENDPOINTS,
    obtenerContexto:contextoAtencion,
    resolverMedico,
    cargarMedicosActivos
  };

  /* Alias propio IASYN sin romper consumidores heredados de window.auroDocumentos. */
  window.iasynDocumentos = window.auroDocumentos;

})();
