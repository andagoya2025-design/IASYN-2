/***********************************************************************
 AUROSANAX ERP DEMO
 Archivo: certificado.js
 Módulo: Certificados médicos por atención
 Versión: 1.3.3 - documento maestro A4 + visor móvil escalado antirregresión
 Fecha: 2026-08-12
 -----------------------------------------------------------------------
 ALCANCE QUIRÚRGICO / ANTIRREGRESIÓN
 - Conserva endpoints existentes: listarCertificadosPorAtencion,
   guardarCertificado, editarCertificado y listarDiagnosticosPorAtencion.
 - Conserva una fila por certificado y detalle_json.
 - NO modifica Recetas, Plan, Diagnóstico, Atenciones ni Apps Script.
 - Lee identidad institucional desde Configuración.
 - Resuelve paciente / historia / médico desde la atención seleccionada.
 - Conserva snapshot documental dentro de detalle_json.
 - PDF no se almacena: se reconstruye bajo demanda.
 - Responsive: escritorio, tablet, iPhone y Android.
************************************************************************/
(function(){
'use strict';

if(window.auroCertificados?.version) return;

const VERSION='1.4.2-IASYN-FIRMA-CERT-UX-SYNC-V1';
const JSON_VERSION='AUROSANAX_CERTIFICADO_JSON_V2';

const state={
  idAtencion:'',
  contexto:null,
  diagnosticos:[],
  certificados:[],
  editandoId:'',
  guardando:false,
  token:0,
  configuracion:{},
  medicos:[],
  paciente:null,
  historia:null,
  firmasPorDocumento:{},
  firmaSolicitudId:'',
  firmaDocumentoId:'',
  firmando:false,
  firmaPollToken:0
};

const txt=v=>String(v??'').trim();
const esc=v=>String(v??'')
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#039;');

const norm=v=>txt(v)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/\s+/g,' ')
  .trim();

function apiUrl(){
  try{
    if(typeof API_URL!=='undefined'&&API_URL) return txt(API_URL);
  }catch(e){}
  return txt(window.API_URL||document.getElementById('appsScriptUrl')?.value);
}

async function get(accion,p={}){
  const b=apiUrl();
  if(!b) throw Error('API_URL no está definida.');
  const q=new URLSearchParams({accion,_:Date.now()});
  Object.entries(p).forEach(([k,v])=>{ if(txt(v)) q.append(k,v); });
  const r=await fetch(b+'?'+q.toString(),{cache:'no-store'});
  if(!r.ok) throw Error('HTTP '+r.status);
  return r.json();
}

async function post(accion,data){
  const r=await fetch(apiUrl(),{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({accion,data})
  });
  if(!r.ok) throw Error('HTTP '+r.status);
  return r.json();
}


/* ============================================================
 * IASYN CERTIFICADO — PUENTE DE FIRMA ELECTRÓNICA V1
 * Solo CERTIFICADO está activo en esta fase.
 * No altera el guardado clínico ni la maqueta A4 existente.
 * ============================================================ */
function tokenSesionFirma(){
  try{
    const s=window.IASYN_SEGURIDAD||window.AUROSANAX_SEGURIDAD;
    if(s){
      if(typeof s.obtenerToken==='function') return txt(s.obtenerToken());
      if(typeof s.obtenerTokenSesion==='function') return txt(s.obtenerTokenSesion());
    }
  }catch(e){}
  try{
    return txt(
      sessionStorage.getItem('iasyn_seguridad_token')||
      sessionStorage.getItem('aurosanax_seguridad_token')||''
    );
  }catch(e){return '';}
}

function postFirma(accion,data){
  const token=tokenSesionFirma();
  if(!token) return Promise.reject(new Error('No existe una sesión IASYN activa para firmar.'));
  return post(accion,Object.assign({},data||{},{token}));
}

function arr(x){
  return Array.isArray(x)?x:
    Array.isArray(x?.registros)?x.registros:
    Array.isArray(x?.data)?x.data:[];
}

function parse(v){
  if(v&&typeof v==='object') return v;
  try{return JSON.parse(txt(v)||'{}');}catch(e){return {};}
}

function activa(){
  try{
    const a=window.getAtencionActiva?.();
    if(a?.id_atencion) return a;
  }catch(e){}
  try{
    const a=window.obtenerContextoAtencionActual?.();
    if(a?.id_atencion) return a;
  }catch(e){}
  return window.atencionesState?.atencionActual||window.currentAttention||window.atencionActual||null;
}

function idActiva(){
  try{
    const x=txt(window.getIdAtencionActiva?.());
    if(x) return x;
  }catch(e){}
  const a=activa();
  return txt(
    a?.id_atencion||
    window.planState?.atencionActual||
    window.examenFisicoState?.atencionActual||
    window.auroDiagnosticosState?.atencionActual
  );
}

function contexto(){
  const a=activa()||{};
  const id=txt(a.id_atencion||idActiva());
  const estado=norm(a.estado_atencion||a.estado||a.estado_consulta);
  const bloqueada=/(anulad|cancelad|archivad)/.test(estado);

  return {
    id,
    atencion:a,
    bloqueada,
    editable:!!id&&!bloqueada,
    numeroConsulta:txt(a.numero_consulta||a.numero_atencion||a.numero),
    idPaciente:txt(a.id_paciente),
    idHistoria:txt(a.id_historia),
    idMedico:txt(a.id_medico),
    fechaAtencion:txt(a.fecha_atencion||a.fecha_consulta),
    horaAtencion:txt(a.hora_atencion||a.hora_consulta)
  };
}

function hoy(){
  const p=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Guayaquil',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).reduce((a,x)=>{a[x.type]=x.value;return a;},{});
  return `${p.year}-${p.month}-${p.day}`;
}

function sumarDias(f,dias){
  const m=txt(f).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return '';
  const x=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  x.setUTCDate(x.getUTCDate()+Math.max(0,Number(dias||0)-1));
  return x.toISOString().slice(0,10);
}

function fechaVisual(v){
  const m=txt(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:(txt(v)||'—');
}

function nombreCompleto(obj){
  obj=obj||{};
  return txt(
    obj.nombre_completo||
    obj.nombre||
    [obj.nombres,obj.apellidos].filter(Boolean).join(' ')
  ).replace(/\s+/g,' ').trim();
}

function resolverPaciente(ctx){
  const a=ctx?.atencion||{};
  const id=txt(ctx?.idPaciente||a.id_paciente);

  try{
    if(typeof window.getPacienteActivo==='function'){
      const p=window.getPacienteActivo();
      if(p){
        const pid=txt(p.id_paciente||p.id);
        if(!id||!pid||pid===id) return p;
      }
    }
  }catch(e){}

  const listas=[window.patients,window.pacientes,window.listaPacientes].filter(Array.isArray);
  for(const lista of listas){
    const p=lista.find(x=>txt(x.id_paciente||x.id)===id);
    if(p) return p;
  }

  return {
    id_paciente:id,
    nombre:a.nombre_paciente||a.paciente_nombre||'',
    numero_documento:a.numero_documento||a.cedula||a.identificacion||'',
    telefono:a.telefono||a.whatsapp||'',
    direccion:a.direccion||''
  };
}

function resolverHistoria(ctx){
  const id=txt(ctx?.idHistoria);
  const listas=[window.historiasClinicas,window.historias,window.listaHistorias].filter(Array.isArray);
  for(const lista of listas){
    const h=lista.find(x=>txt(x.id_historia||x.id)===id);
    if(h) return h;
  }
  try{
    if(window.historiaActual && txt(window.historiaActual.id_historia||window.historiaActual.id)===id){
      return window.historiaActual;
    }
  }catch(e){}
  try{
    if(window.currentHistoria && txt(window.currentHistoria.id_historia||window.currentHistoria.id)===id){
      return window.currentHistoria;
    }
  }catch(e){}
  return {id_historia:id};
}

function resolverMedico(ctx){
  const a=ctx?.atencion||{};
  const id=txt(ctx?.idMedico||a.id_medico);

  const listas=[
    state.medicos,
    window.medicos,
    window.medicosActivos,
    window.listaMedicos,
    window.configuracionMedicos,
    window.medicosConfiguracion
  ].filter(Array.isArray);

  let m=null;
  for(const lista of listas){
    m=lista.find(x=>txt(x.id_medico||x.id||x.codigo)===id)||null;
    if(m) break;
  }

  const nombre=nombreCompleto(m)||txt(a.nombre_medico||a.medico_nombre)||'Profesional tratante';

  return {
    id_medico:id,
    nombre,
    especialidad:txt(
      m?.especialidad_principal||
      m?.especialidad||
      m?.especialidad_medica||
      a.especialidad||
      a.medico_especialidad
    ),
    registro_msp:txt(m?.registro_msp||m?.msp||m?.registro_profesional),
    registro_senescyt:txt(m?.registro_senescyt||m?.senescyt),
    email:txt(m?.email||m?.correo),
    telefono:txt(m?.telefono||m?.whatsapp)
  };
}

function configGlobal(){
  const candidatos=[
    window.auroConfiguracionCentro,
    window.configuracionCentro,
    window.configCentro,
    window.CONFIG_CENTRO,
    window.configuracionInstitucional
  ];
  let c=candidatos.find(x=>x&&typeof x==='object'&&!Array.isArray(x))||{};
  if(c.datos&&typeof c.datos==='object') c=c.datos;
  return c;
}

function normalizarConfig(c){
  c=c||{};
  if(c.datos&&typeof c.datos==='object') c=c.datos;
  return {
    nombre:txt(c.nombre_clinica||c.nombre_centro||c.nombre_comercial||c.razon_social)||'AUROSANAX',
    subtitulo:txt(c.subtitulo_clinica||c.descripcion_clinica||c.eslogan_clinica),
    razon_social:txt(c.razon_social),
    ruc:txt(c.ruc),
    direccion:txt(c.direccion_clinica||c.direccion),
    ciudad:txt(c.ciudad_clinica||c.ciudad)||'Guayaquil',
    provincia:txt(c.provincia_clinica||c.provincia),
    pais:txt(c.pais_clinica||c.pais)||'Ecuador',
    telefono:txt(c.telefono_clinica||c.whatsapp_clinica||c.telefono||c.whatsapp),
    email:txt(c.email_clinica||c.correo_clinica||c.email||c.correo),
    web:txt(c.sitio_web_clinica||c.web_clinica||c.web),
    logo:txt(c.logo_url||c.logo_drive_url||c.logo),
    colorPrincipal:txt(c.color_principal)||'#8b1e5a'
  };
}

async function cargarContextoAuxiliar(ctx){
  state.paciente=resolverPaciente(ctx);
  state.historia=resolverHistoria(ctx);

  let cfg=normalizarConfig(configGlobal());
  try{
    const remoto=await get('obtenerConfiguracion');
    cfg=normalizarConfig(Object.assign({},configGlobal(),remoto||{}));
  }catch(e){}
  state.configuracion=cfg;

  try{
    const r=await get('listarMedicosActivos');
    state.medicos=arr(r);
  }catch(e){
    state.medicos=[];
  }
}

const UN=[
  'CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ',
  'ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO',
  'DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO',
  'VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE','TREINTA'
];

function numeroLetras(n){
  n=Number(n||0);
  if(n>=0&&n<=30) return UN[n];
  if(n<100){
    const d=['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'][Math.floor(n/10)];
    return n%10?d+' Y '+UN[n%10]:d;
  }
  if(n===100) return 'CIEN';
  if(n<200) return 'CIENTO '+numeroLetras(n-100);
  if(n<1000){
    const c=['','','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'][Math.floor(n/100)];
    return c+(n%100?' '+numeroLetras(n%100):'');
  }
  if(n<2000) return 'MIL'+(n%1000?' '+numeroLetras(n%1000):'');
  if(n<1000000){
    const miles=Math.floor(n/1000),resto=n%1000;
    return numeroLetras(miles)+' MIL'+(resto?' '+numeroLetras(resto):'');
  }
  return String(n);
}

function fechaLetras(v){
  const m=txt(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return txt(v).toUpperCase();
  const meses=['','ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  return `${numeroLetras(+m[3])} DE ${meses[+m[2]]} DEL ${numeroLetras(+m[1])}`;
}

function instalarCSS(){
  if(document.getElementById('auroCertCSS')) return;
  const s=document.createElement('style');
  s.id='auroCertCSS';
  s.textContent=`
#auroCertificadosApp{font-family:inherit;color:#1f2937}
#auroCertificadosApp *{box-sizing:border-box}
.ac-shell{display:grid;gap:16px;max-width:100%;overflow:hidden}
.ac-hero{padding:18px;border:1px solid #ead7e2;border-radius:20px;background:linear-gradient(135deg,#fff,#fff7fb);display:flex;justify-content:space-between;gap:14px;align-items:center}
.ac-hero h3{margin:0;color:#6c1d52;font-weight:900}
.ac-hero p{margin:4px 0 0;color:#6b7280}
.ac-pill{padding:8px 11px;border-radius:999px;background:#fdf2f8;color:#8b1e5a;font-size:12px;font-weight:850}
.ac-context-card{border:1px solid #f0d9e6;background:#fff;border-radius:18px;padding:12px}
.ac-context-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.ac-context-item{border:1px solid #edf0f3;border-radius:12px;padding:8px 10px;min-width:0;background:#fff}
.ac-context-item span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#8b1e5a;font-weight:900;margin-bottom:2px}
.ac-context-item b{display:block;font-size:12.5px;overflow-wrap:anywhere}
.ac-grid{display:grid;grid-template-columns:1fr;gap:16px}
.ac-card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}
.ac-head{padding:13px 15px;background:#fafafa;border-bottom:1px solid #eee;font-weight:850}
.ac-body{padding:15px}
.ac-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ac-field.full{grid-column:1/-1}
.ac-field label{display:block;font-size:12px;font-weight:800;color:#4b5563;margin-bottom:5px}
.ac-field input,.ac-field select,.ac-field textarea{width:100%;border:1px solid #d1d5db;border-radius:12px;padding:10px 11px;font:inherit}
.ac-field textarea{min-height:92px;resize:vertical}
.ac-dx{display:grid;gap:8px}
.ac-dx label{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #ead7e2;border-radius:12px;background:linear-gradient(135deg,#fff,#fff9fc);min-height:46px;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}
.ac-dx label:hover{border-color:#d9a7c3;box-shadow:0 5px 14px rgba(139,30,90,.06)}
.ac-dx label:has(input:checked){border-color:#d79ab9;background:#fff7fb;box-shadow:0 5px 14px rgba(139,30,90,.07)}
.ac-dx input[type="checkbox"]{width:18px;height:18px;flex:0 0 auto;margin:0;accent-color:#8b1e5a}
.ac-dx span{display:flex;align-items:center;gap:9px;min-width:0;flex:1;color:#374151;font-size:13px;line-height:1.35;overflow-wrap:anywhere}
.ac-dx span b{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:58px;padding:4px 8px;border-radius:999px;background:#fdf2f8;border:1px solid #f3c8df;color:#8b1e5a;font-size:11.5px;font-weight:900;letter-spacing:.025em;line-height:1.1}
@media(max-width:700px){.ac-dx label{padding:10px}.ac-dx span{font-size:12.5px;gap:8px}.ac-dx span b{min-width:54px;font-size:11px;padding:4px 7px}}
.ac-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.ac-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:850;cursor:pointer}
.ac-btn[disabled]{opacity:.72;cursor:wait}
.ac-firma-preparando{background:#fff7ed!important;color:#9a3412!important;border:1px solid #fed7aa!important}
.ac-firma-proceso{background:#eff6ff!important;color:#1d4ed8!important;border:1px solid #bfdbfe!important}
.ac-firma-firmada{background:#ecfdf5!important;color:#166534!important;border:1px solid #bbf7d0!important}
.ac-firma-cancelar{background:#fff1f2!important;color:#be123c!important;border:1px solid #fecdd3!important}
.ac-primary{background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff}
.ac-soft{background:#fdf2f8;color:#8b1e5a;border:1px solid #fbcfe8}
.ac-item{border:1px solid #e5e7eb;border-radius:13px;padding:11px;margin-bottom:8px}
.ac-item:last-child{margin-bottom:0}
.ac-item-top{display:flex;justify-content:space-between;gap:10px;align-items:center}
.ac-meta{font-size:12px;color:#6b7280;margin-top:4px}
.ac-empty{padding:20px;text-align:center;color:#6b7280;border:1px dashed #d1d5db;border-radius:12px}
.ac-msg{padding:10px 12px;border-radius:12px;font-size:13px}
.ac-ok{background:#ecfdf5;color:#166534}
.ac-error{background:#fef2f2;color:#991b1b}
.ac-warn{background:#fffbeb;color:#92400e}
.ac-preview{margin-top:14px;overflow:auto;background:#eef1f4;border-radius:16px;padding:18px}
.ac-paper{width:210mm;min-height:297mm;background:#fff;margin:auto;padding:15mm 17mm 42mm;box-shadow:0 8px 28px rgba(0,0,0,.12);transform-origin:top center;position:relative}
.ac-doc-head{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;border-bottom:2.5px solid var(--ac-color,#8b1e5a);padding-bottom:10px}
.ac-logo-wrap{width:60px;height:60px;display:grid;place-items:center;border-radius:12px;overflow:hidden}
.ac-logo-wrap:empty{display:none}
.ac-logo{max-width:100%;max-height:100%;object-fit:contain}
.ac-brand{font-size:19px;font-weight:950;color:var(--ac-color,#8b1e5a);letter-spacing:.035em}
.ac-brand-sub{font-size:10.5px;color:#667085;margin-top:2px}
.ac-doc-date{text-align:right;font-size:11.5px;font-weight:750}
.ac-paper h1{text-align:center;font-size:19px;margin:22px 0 26px;letter-spacing:.045em}
.ac-paper p{font-size:12.3px;line-height:1.62;text-align:justify;margin:0 0 12px}
.ac-cert-lines{display:grid;gap:6px;margin:14px 0}
.ac-cert-line{font-size:12.1px;line-height:1.42}
.ac-cert-line b:first-child{display:inline-block;min-width:150px}
.ac-dx-doc{margin:14px 0 16px}
.ac-dx-doc-title{font-size:12.1px;font-weight:900;margin-bottom:5px}
.ac-dx-doc-row{font-size:12.1px;line-height:1.45}
.ac-reposo{margin-top:16px}
.ac-reposo-row{font-size:12.2px;line-height:1.5;margin-top:4px}
.ac-firma-area{position:absolute;left:17mm;right:17mm;bottom:15mm;display:grid;grid-template-columns:1fr 1fr;gap:22mm;align-items:end;margin-top:0}
.ac-centro-contacto{font-size:10.5px;color:#475569;line-height:1.45}
.ac-sign{text-align:center;font-size:11.5px}
.ac-sign-line{border-top:1px solid #111;margin-bottom:6px}
.ac-sign b{font-size:12.5px}
.ac-toast-zone{
  position:fixed;top:18px;right:18px;z-index:2147483000;
  width:min(390px,calc(100vw - 28px));display:grid;gap:10px;
  pointer-events:none
}
.ac-toast{
  display:grid;grid-template-columns:42px minmax(0,1fr);gap:11px;align-items:center;
  padding:13px 15px;border-radius:16px;color:#fff;
  box-shadow:0 18px 45px rgba(15,23,42,.22),0 2px 8px rgba(15,23,42,.14);
  border:1px solid rgba(255,255,255,.22);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  animation:acToastIn .22s ease-out both
}
.ac-toast-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.17);font-size:22px;font-weight:950}
.ac-toast-title{font-size:13.5px;font-weight:950;letter-spacing:.01em;line-height:1.2}
.ac-toast-text{font-size:12px;line-height:1.35;margin-top:3px;color:rgba(255,255,255,.92)}
.ac-toast-ok{background:linear-gradient(135deg,#047857,#059669)}
.ac-toast-warn{background:linear-gradient(135deg,#9a6700,#b7791f)}
.ac-toast-info{background:linear-gradient(135deg,#6c1749,#8b1e5a)}
.ac-toast-error{background:linear-gradient(135deg,#8f1d18,#b42318)}
.ac-toast-out{animation:acToastOut .2s ease-in both}
@keyframes acToastIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes acToastOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-6px) scale(.98)}}
@media(prefers-reduced-motion:reduce){.ac-toast,.ac-toast-out{animation:none}}
@media(max-width:700px){.ac-toast-zone{top:10px;right:10px;width:calc(100vw - 20px)}.ac-toast{padding:12px 13px;border-radius:14px}}

@media(max-width:1000px){
  .ac-context-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ac-preview{padding:10px}
  .ac-paper{transform:scale(.78);margin-bottom:-64mm}
}
@media(max-width:700px){
  html,body{max-width:100%;overflow-x:hidden}
  #hc_certificados,#auroCertificadosMount,#auroCertificadosApp{max-width:100%!important;min-width:0!important;overflow-x:hidden!important}
  .ac-hero{display:block;padding:14px}
  .ac-pill{display:inline-block;margin-top:10px}
  .ac-context-grid{grid-template-columns:1fr}
  .ac-form{grid-template-columns:1fr}
  .ac-field.full{grid-column:auto}
  .ac-body{padding:12px}
  .ac-field input,.ac-field select,.ac-field textarea{font-size:16px}
  .ac-actions{display:grid;grid-template-columns:1fr}
  .ac-btn{min-height:46px;width:100%}
  .ac-item-top{align-items:flex-start}
  .ac-preview{padding:6px;overflow:hidden}
  .ac-paper{transform:scale(.45);margin-left:50%;translate:-50% 0;margin-bottom:-162mm}
}
`;
  document.head.appendChild(s);
}

function html(){
  return `<div class="ac-shell">
    <div class="ac-hero">
      <div>
        <h3><i class="bi bi-file-earmark-medical"></i> Certificados</h3>
        <p>Emisión documental vinculada a la atención seleccionada.</p>
      </div>
      <div class="ac-pill" id="acContexto">Sin atención</div>
    </div>

    <div id="acContextoClinico" class="ac-context-card" style="display:none"></div>
    <div id="acMsg"></div>

    <div class="ac-grid">
      <div class="ac-card">
        <div class="ac-head">Emisión de certificado</div>
        <div class="ac-body">
          <div class="ac-form">
            <div class="ac-field">
              <label>Tipo de certificado</label>
              <select id="acTipo">
                <option>Certificado médico</option>
                <option>Certificado de asistencia por consulta</option>
                <option>Certificado prequirúrgico</option>
              </select>
            </div>
            <div class="ac-field"><label>Fecha de emisión</label><input id="acFecha" type="date"></div>
            <div class="ac-field"><label>Días de reposo</label><input id="acDias" type="number" min="0" max="365" value="0"></div>
            <div class="ac-field"><label>Tipo de contingencia</label>
              <select id="acContingencia">
                <option value="">Seleccione...</option>
                <option>Enfermedad general</option>
                <option>Accidente común</option>
                <option>Enfermedad profesional</option>
                <option>Accidente de trabajo</option>
                <option>Maternidad</option>
                <option>Otra</option>
              </select>
            </div>
            <div class="ac-field"><label>Reposo desde</label><input id="acDesde" type="date"></div>
            <div class="ac-field"><label>Reposo hasta</label><input id="acHasta" type="date" readonly></div>

            <div class="ac-field full">
              <label>Diagnósticos de esta atención</label>
              <div id="acDx" class="ac-dx"></div>
            </div>

            <div class="ac-field"><label>Número de contacto</label><input id="acContacto" inputmode="tel"></div>
            <div class="ac-field"><label>Institución / Empresa</label><input id="acEmpresa"></div>
            <div class="ac-field full"><label>Resumen clínico</label><textarea id="acResumen"></textarea></div>
            <div class="ac-field"><label>Actividad laboral</label><input id="acActividad"></div>
            <div class="ac-field"><label>Dirección de trabajo</label><input id="acDireccionTrabajo"></div>
            <div class="ac-field full"><label>Observaciones / extensión de reposo</label><textarea id="acObservaciones"></textarea></div>
          </div>

          <div class="ac-actions">
            <button class="ac-btn ac-primary" id="acGuardar">Emitir / Guardar certificado</button>
            <button class="ac-btn ac-soft" id="acVista">Vista previa</button>
            <button class="ac-btn ac-soft" id="acImprimir">Imprimir / PDF</button>
            <button class="ac-btn ac-soft" id="acNuevo">Nuevo certificado</button>
          </div>

          <div id="acPreview" class="ac-preview" style="display:none"></div>
        </div>
      </div>

      <div class="ac-card">
        <div class="ac-head">Certificados emitidos</div>
        <div class="ac-body" id="acHistorial"></div>
      </div>
    </div>
  </div>`;
}

function mount(){
  instalarCSS();
  let p=document.getElementById('hc_certificados');
  if(!p) return null;
  let m=document.getElementById('auroCertificadosMount');
  if(!m){
    m=document.createElement('div');
    m.id='auroCertificadosMount';
    p.appendChild(m);
  }
  if(!document.getElementById('auroCertificadosApp')){
    m.innerHTML='<div id="auroCertificadosApp">'+html()+'</div>';
    eventos();
  }
  return m;
}

let acToastTimer=null;

function toastPremium(tipo,texto){
  const textoLimpio=txt(texto);
  if(!textoLimpio) return;

  let zona=document.getElementById('acToastZone');
  if(!zona){
    zona=document.createElement('div');
    zona.id='acToastZone';
    zona.className='ac-toast-zone';
    zona.setAttribute('aria-live','polite');
    zona.setAttribute('aria-atomic','true');
    document.body.appendChild(zona);
  }

  if(acToastTimer){clearTimeout(acToastTimer);acToastTimer=null;}

  const mapa={
    ok:{clase:'ok',icono:'✓',titulo:'Operación completada'},
    warn:{clase:'warn',icono:'!',titulo:'Firma electrónica'},
    info:{clase:'info',icono:'•',titulo:'IASYN'},
    error:{clase:'error',icono:'×',titulo:'Atención requerida'}
  };
  const cfg=mapa[tipo]||mapa.info;

  zona.innerHTML=`<div class="ac-toast ac-toast-${cfg.clase}" role="status">
    <div class="ac-toast-icon">${cfg.icono}</div>
    <div><div class="ac-toast-title">${esc(cfg.titulo)}</div><div class="ac-toast-text">${esc(textoLimpio)}</div></div>
  </div>`;

  const tarjeta=zona.firstElementChild;
  acToastTimer=setTimeout(()=>{
    if(!tarjeta||!tarjeta.isConnected) return;
    tarjeta.classList.add('ac-toast-out');
    setTimeout(()=>{
      if(tarjeta.isConnected) tarjeta.remove();
      if(zona && !zona.children.length) zona.remove();
    },220);
  },3600);
}

function msg(t,s){
  const e=document.getElementById('acMsg');
  if(e) e.innerHTML=s?`<div class="ac-msg ac-${t}">${esc(s)}</div>`:'';
}

function v(id){return txt(document.getElementById(id)?.value);}
function sv(id,x){const e=document.getElementById(id);if(e)e.value=x??'';}

function eventos(){
  document.getElementById('acDias')?.addEventListener('input',()=>{
    const d=Number(v('acDias')||0);
    if(d>0 && !v('acDesde')) sv('acDesde',v('acFecha')||hoy());
    calcularHasta();
  });
  document.getElementById('acDesde')?.addEventListener('change',calcularHasta);
  document.getElementById('acFecha')?.addEventListener('change',()=>{
    if(Number(v('acDias')||0)>0){
      sv('acDesde',v('acFecha')||hoy());
      calcularHasta();
    }
  });
  document.getElementById('acGuardar')?.addEventListener('click',guardar);
  document.getElementById('acVista')?.addEventListener('click',()=>vista(false));
  document.getElementById('acImprimir')?.addEventListener('click',()=>vista(true));
  document.getElementById('acNuevo')?.addEventListener('click',nuevo);
}

function calcularHasta(){
  const d=Number(v('acDias')||0);
  const f=v('acDesde')||v('acFecha')||hoy();
  if(d>0){
    if(!v('acDesde')) sv('acDesde',f);
    sv('acHasta',sumarDias(f,d));
  }else{
    sv('acHasta','');
  }
}

async function cargarDx(id, token){
  let diagnosticos=[];
  try{
    const r=await get('listarDiagnosticosPorAtencion',{id_atencion:id});
    diagnosticos=arr(r);
  }catch(e){
    try{
      const r=await get('listarDiagnosticos');
      diagnosticos=arr(r).filter(x=>txt(x.id_atencion)===txt(id));
    }catch(_){
      diagnosticos=[];
    }
  }

  /* IASYN 1.4.1 — una respuesta tardía de otra consulta no puede repintar
     Diagnóstico ni contaminar el contexto de Certificados. */
  if(token!==state.token || txt(state.idAtencion)!==txt(id)) return;

  state.diagnosticos=diagnosticos;
  renderDx();
}

function renderDx(){
  const b=document.getElementById('acDx');
  if(!b) return;
  if(!state.diagnosticos.length){
    b.innerHTML='<div class="ac-empty">Sin diagnósticos registrados para esta atención.</div>';
    return;
  }
  b.innerHTML=state.diagnosticos.map((d,i)=>`
    <label>
      <input type="checkbox" data-acdx="${i}" checked>
      <span><b>${esc(d.codigo_cie10||d.codigo||'S/C')}</b> · ${esc(d.descripcion||d.diagnostico||'')}</span>
    </label>`).join('');
}

async function cargarFirmasCertificados(idAtencion, token=state.token){
  const firmas={};
  if(!idAtencion){
    if(token===state.token) state.firmasPorDocumento={};
    return;
  }

  try{
    const r=await postFirma('consultarDocumentosFirmados',{
      tipo_documento:'CERTIFICADO',
      id_atencion:idAtencion
    });
    const lista=arr(r);
    lista.forEach(f=>{
      const id=txt(f.id_documento_origen||f.id_certificado);
      if(id && !firmas[id]) firmas[id]=f;
    });
  }catch(e){
    console.warn('No se pudo cargar historial de firmas de certificados:',e);
  }

  /* No permitir que la respuesta de firmas de una consulta anterior
     sobrescriba la consulta actualmente seleccionada. */
  if(token!==state.token || txt(state.idAtencion)!==txt(idAtencion)) return;

  state.firmasPorDocumento=firmas;
}

async function cargarHistorial(id, token=state.token){
  let certificados=[];
  try{
    const r=await get('listarCertificadosPorAtencion',{id_atencion:id});
    certificados=arr(r);
  }catch(e){
    certificados=[];
  }

  /* La respuesta solo pertenece a la atención que inició esta carga. */
  if(token!==state.token || txt(state.idAtencion)!==txt(id)) return;

  state.certificados=certificados;

  /* Mostrar el historial clínico inmediatamente. La consulta del estado
     de firma es auxiliar y no debe retrasar la aparición del certificado. */
  renderHistorial();
  actualizarControlesFirma();

  cargarFirmasCertificados(id,token)
    .then(()=>{
      if(token!==state.token || txt(state.idAtencion)!==txt(id)) return;
      renderHistorial();
      actualizarControlesFirma();
    })
    .catch(()=>{});
}

function renderHistorial(){
  const b=document.getElementById('acHistorial');
  if(!b) return;

  if(!state.certificados.length){
    b.innerHTML='<div class="ac-empty">No existen certificados emitidos para esta atención.</div>';
    return;
  }

  b.innerHTML=[...state.certificados].reverse().map(c=>{
    const d=parse(c.detalle_json);
    const id=txt(c.id_certificado);
    const firmado=state.firmasPorDocumento[id];
    const esProceso=state.firmando && txt(state.firmaDocumentoId)===id;
    const preparando=esProceso && !txt(state.firmaSolicitudId);
    const proceso=esProceso && !!txt(state.firmaSolicitudId);

    const estado=firmado
      ? '<span style="font-size:11px;font-weight:900;color:#166534">FIRMADO ✓</span>'
      : (preparando
          ? '<span style="font-size:11px;font-weight:900;color:#9a3412">PREPARANDO FIRMA…</span>'
          : (proceso
              ? '<span style="font-size:11px;font-weight:900;color:#1d4ed8">FIRMA EN PROCESO…</span>'
              : '<span style="font-size:11px;font-weight:800;color:#64748b">SIN FIRMA</span>'));

    const accionFirma=firmado
      ? `<button class="ac-btn ac-firma-firmada" data-acverfirmado="${esc(id)}">Ver certificado firmado ✓</button>`
      : `<button class="ac-btn ac-soft${preparando?' ac-firma-preparando':(proceso?' ac-firma-proceso':'')}" data-acfirmar="${esc(id)}" ${esProceso?'disabled aria-busy="true"':''}>${preparando?'Preparando firma…':(proceso?'Firma en proceso…':'Firmar certificado')}</button>`;

    const cancelar=proceso
      ? `<button class="ac-btn ac-firma-cancelar" data-accancelarfirma="${esc(id)}">Cancelar firma</button>`
      : '';

    return `<div class="ac-item">
      <div class="ac-item-top">
        <div>
          <b>${esc(c.tipo_certificado||d.tipo_certificado||'Certificado')}</b>
          <div class="ac-meta">${esc(fechaVisual(c.fecha_emision||d.fecha_emision))} · ${esc(id)}</div>
          <div style="margin-top:5px">${estado}</div>
        </div>
        <div class="ac-actions" style="margin-top:0;justify-content:flex-end">
          <button class="ac-btn ac-soft" data-aceditar="${esc(id)}">Abrir</button>
          ${accionFirma}
          ${cancelar}
        </div>
      </div>
    </div>`;
  }).join('');

  b.querySelectorAll('[data-aceditar]').forEach(x=>x.onclick=()=>abrir(x.dataset.aceditar));
  b.querySelectorAll('[data-acfirmar]').forEach(x=>x.onclick=()=>firmarCertificado(x.dataset.acfirmar));
  b.querySelectorAll('[data-acverfirmado]').forEach(x=>x.onclick=()=>verCertificadoFirmado(x.dataset.acverfirmado));
  b.querySelectorAll('[data-accancelarfirma]').forEach(x=>x.onclick=()=>cancelarFirmaCertificado(x.dataset.accancelarfirma));
}

function dxSeleccionados(){
  return [...document.querySelectorAll('[data-acdx]:checked')]
    .map(x=>state.diagnosticos[Number(x.dataset.acdx)])
    .filter(Boolean)
    .map(d=>({
      id_diagnostico:txt(d.id_diagnostico),
      codigo_cie10:txt(d.codigo_cie10||d.codigo),
      descripcion:txt(d.descripcion||d.diagnostico),
      principal:d.principal===true||['si','true'].includes(norm(d.principal)),
      tipo_diagnostico:txt(d.tipo_diagnostico||d.tipo)
    }));
}

function snapshotPaciente(ctx){
  const p=state.paciente||resolverPaciente(ctx)||{};
  return {
    id_paciente:txt(p.id_paciente||p.id||ctx.idPaciente),
    nombre:nombreCompleto(p)||txt(ctx.atencion?.nombre_paciente||ctx.atencion?.paciente_nombre),
    numero_documento:txt(p.numero_documento||p.cedula||p.documento||p.identificacion),
    telefono:txt(p.telefono||p.whatsapp),
    direccion:txt(p.direccion||p.domicilio),
    fecha_nacimiento:txt(p.fecha_nacimiento||p.nacimiento)
  };
}

function snapshotHistoria(ctx){
  const h=state.historia||resolverHistoria(ctx)||{};
  return {
    id_historia:txt(h.id_historia||h.id||ctx.idHistoria),
    numero_historia:txt(h.numero_historia||h.historia_clinica||h.numero_hc||h.id_historia||ctx.idHistoria)
  };
}

function datos(){
  const c=state.contexto||contexto();
  const a=c.atencion||{};
  const fecha=v('acFecha')||hoy();
  const dias=Number(v('acDias')||0);
  const desde=v('acDesde')||(dias?fecha:'');
  const hasta=v('acHasta')||(dias?sumarDias(desde,dias):'');

  const paciente=snapshotPaciente(c);
  const historia=snapshotHistoria(c);
  const medico=resolverMedico(c);
  const centro=state.configuracion&&state.configuracion.nombre
    ? state.configuracion
    : normalizarConfig(configGlobal());

  const detalle={
    version:JSON_VERSION,
    tipo_certificado:v('acTipo'),
    fecha_emision:fecha,
    fecha_atencion:c.fechaAtencion,
    hora_atencion:c.horaAtencion,
    dias_reposo:dias,
    contingencia:v('acContingencia'),
    reposo_desde:desde,
    reposo_hasta:hasta,
    diagnosticos:dxSeleccionados(),
    contacto:v('acContacto'),
    institucion_empresa:v('acEmpresa'),
    resumen_clinico:v('acResumen'),
    actividad_laboral:v('acActividad'),
    direccion_trabajo:v('acDireccionTrabajo'),
    observaciones:v('acObservaciones'),
    paciente,
    historia,
    medico,
    centro
  };

  return {
    id_certificado:state.editandoId||undefined,
    id_atencion:c.id,
    id_cita:txt(a.id_cita),
    numero_consulta:c.numeroConsulta,
    id_paciente:paciente.id_paciente,
    nombre_paciente:paciente.nombre,
    numero_documento:paciente.numero_documento,
    id_historia:historia.id_historia,
    id_medico:medico.id_medico,
    nombre_medico:medico.nombre,
    especialidad:medico.especialidad,
    tipo_certificado:v('acTipo'),
    fecha_emision:fecha,
    detalle_json:JSON.stringify(detalle),
    estado:'Activo',
    version:VERSION
  };
}

async function guardar(){
  if(state.guardando) return;

  const c=state.contexto||contexto();
  if(!c.id) return msg('warn','Seleccione una atención antes de emitir el certificado.');
  if(c.bloqueada) return msg('warn','La atención está anulada, cancelada o archivada.');

  const data=datos();
  if(!data.nombre_paciente) return msg('warn','No se pudo identificar al paciente de la atención.');
  if(!data.id_medico) return msg('warn','La atención seleccionada no tiene un médico responsable identificado.');

  state.guardando=true;
  const b=document.getElementById('acGuardar');
  if(b) b.disabled=true;

  try{
    const r=await post(state.editandoId?'editarCertificado':'guardarCertificado',data);
    if(r?.success===false) throw Error(r.message||'No se pudo guardar.');
    state.editandoId=txt(r.id||r.id_certificado||data.id_certificado);
    msg('ok','Certificado guardado correctamente.');
    await cargarHistorial(c.id);
    actualizarControlesFirma();
  }catch(e){
    msg('error',e.message||'Error al guardar el certificado.');
  }finally{
    state.guardando=false;
    if(b) b.disabled=false;
  }
}

function abrir(id){
  const c=state.certificados.find(x=>txt(x.id_certificado)===txt(id));
  if(!c) return;

  const d=parse(c.detalle_json);
  state.editandoId=txt(c.id_certificado);

  sv('acTipo',c.tipo_certificado||d.tipo_certificado);
  sv('acFecha',c.fecha_emision||d.fecha_emision);
  sv('acDias',d.dias_reposo??0);
  sv('acContingencia',d.contingencia);
  sv('acDesde',d.reposo_desde);
  sv('acHasta',d.reposo_hasta);
  sv('acContacto',d.contacto);
  sv('acEmpresa',d.institucion_empresa);
  sv('acResumen',d.resumen_clinico);
  sv('acActividad',d.actividad_laboral);
  sv('acDireccionTrabajo',d.direccion_trabajo);
  sv('acObservaciones',d.observaciones);

  setTimeout(()=>{
    const cod=new Set((d.diagnosticos||[]).map(x=>txt(x.codigo_cie10)));
    document.querySelectorAll('[data-acdx]').forEach(x=>{
      const dx=state.diagnosticos[Number(x.dataset.acdx)];
      x.checked=cod.has(txt(dx?.codigo_cie10||dx?.codigo));
    });
  },0);

  msg('ok','Certificado cargado para revisión.');
  actualizarControlesFirma();
}

function nuevo(){
  state.editandoId='';
  ['acEmpresa','acResumen','acActividad','acDireccionTrabajo','acObservaciones'].forEach(x=>sv(x,''));

  const p=state.paciente||{};
  sv('acContacto',txt(p.telefono||p.whatsapp));

  sv('acTipo','Certificado médico');
  sv('acFecha',hoy());
  sv('acDias','0');
  sv('acContingencia','');
  sv('acDesde','');
  sv('acHasta','');

  document.querySelectorAll('[data-acdx]').forEach(x=>x.checked=true);

  const preview=document.getElementById('acPreview');
  if(preview) preview.style.display='none';

  state.firmaSolicitudId='';
  state.firmaDocumentoId='';
  actualizarControlesFirma();
  msg('','');
}


function certificadoPersistido(id){
  const x=txt(id);
  return state.certificados.find(c=>txt(c.id_certificado)===x)||null;
}

function htmlCompletoFirmaCertificado(certificado){
  /* El PDF firmado no necesita handlers HTML. Se eliminan atributos on*
     del documento que son útiles solo para la vista del navegador. */
  const cuerpo=docHTML(certificado).replace(/\son[a-z]+=(?:"[^"]*"|'[^']*')/gi,'');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificado médico</title>
<style>${estilosImpresion()}</style>
</head>
<body>${cuerpo}</body>
</html>`;
}

function actualizarControlesFirma(){
  const btn=document.getElementById('acFirmar');
  const ver=document.getElementById('acVerFirmado');
  const id=txt(state.editandoId);
  const firmado=id?state.firmasPorDocumento[id]:null;
  if(btn){
    btn.disabled=!id||!!firmado||state.firmando;
    btn.textContent=state.firmando&&state.firmaDocumentoId===id
      ? 'Esperando firma en Adobe…'
      : (firmado?'Certificado firmado ✓':'Firmar electrónicamente');
  }
  if(ver){
    ver.style.display=firmado?'inline-flex':'none';
    ver.disabled=!firmado;
  }
}

async function cancelarFirmaCertificado(idCertificado){
  const id=txt(idCertificado||state.firmaDocumentoId);
  const idSolicitud=txt(state.firmaSolicitudId);
  const certificado=certificadoPersistido(id);

  if(!id || !idSolicitud || !certificado){
    msg('warn','No existe una solicitud activa de firma para cancelar.');
    toastPremium('warn','No existe una solicitud activa de firma para cancelar.');
    return;
  }

  try{
    msg('warn','Cancelando firma del certificado…');
    toastPremium('info','Cancelando firma del certificado…');

    const r=await postFirma('firmarDocumento',{
      operacion_frontend:'CANCELAR',
      id_solicitud:idSolicitud,
      tipo_documento:'CERTIFICADO',
      id_documento_origen:id,
      id_certificado:id,
      id_atencion:txt(certificado.id_atencion),
      id_receta:''
    });

    if(!r || r.success===false) throw Error(r?.message||'No se pudo cancelar la firma.');
    const estado=txt(r.estado_firma||r.estado).toUpperCase();
    if(estado && !['CANCELADA','CANCELADO'].includes(estado)){
      throw Error('IASYN no confirmó la cancelación de la firma.');
    }

    state.firmaPollToken++;
    state.firmando=false;
    state.firmaSolicitudId='';
    state.firmaDocumentoId='';
    renderHistorial();
    actualizarControlesFirma();
    msg('warn','Firma del certificado cancelada.');
    toastPremium('warn','Firma cancelada correctamente. El certificado está disponible nuevamente.');
    return r;
  }catch(e){
    msg('error',e.message||'No se pudo cancelar la firma del certificado.');
    toastPremium('error',e.message||'No se pudo cancelar la firma del certificado.');
    return null;
  }
}

async function firmarCertificado(idCertificado){
  const id=txt(idCertificado||state.editandoId);
  if(!id) return msg('warn','Primero guarde el certificado que desea firmar.');
  if(state.firmasPorDocumento[id]) return verCertificadoFirmado(id);
  if(state.firmando) return msg('warn','Ya existe una solicitud de firma en proceso.');

  const certificado=certificadoPersistido(id);
  if(!certificado) return msg('warn','No se encontró el certificado guardado. Recargue el historial.');
  const idAtencion=txt(certificado.id_atencion);
  if(!idAtencion) return msg('warn','El certificado no tiene id_atencion.');

  const idAtencionActual=txt(state.idAtencion||contexto().id);
  if(!idAtencionActual || idAtencion!==idAtencionActual){
    return msg('warn','El certificado no pertenece a la atención actualmente seleccionada.');
  }

  state.firmando=true;
  state.firmaSolicitudId='';
  state.firmaDocumentoId=id;
  actualizarControlesFirma();
  renderHistorial();
  msg('','Preparando certificado para firma electrónica…');
  toastPremium('info','Certificado enviado a firma. Preparando Adobe…');

  try{
    const htmlDocumento=htmlCompletoFirmaCertificado(certificado);
    const nombre=`CERTIFICADO_${txt(certificado.numero_consulta||'CONSULTA')}_${id}.pdf`;
    const r=await postFirma('firmarDocumento',{
      tipo_documento:'CERTIFICADO',
      id_documento_origen:id,
      id_certificado:id,
      id_atencion:idAtencion,
      id_paciente:txt(certificado.id_paciente),
      nombre_paciente:txt(certificado.nombre_paciente),
      id_historia:txt(certificado.id_historia),
      numero_consulta:txt(certificado.numero_consulta),
      id_medico:txt(certificado.id_medico),
      nombre_medico:txt(certificado.nombre_medico),
      nombre_archivo:nombre,
      firmas_requeridas:1,
      html_documento:htmlDocumento
    });
    if(!r||r.success===false) throw Error(r?.message||'No se pudo crear la solicitud de firma.');

    if(txt(r.estado_firma).toUpperCase()==='FIRMADO'){
      await cargarFirmasCertificados(idAtencion);
      renderHistorial();
      msg('ok','Este certificado ya estaba firmado.');
      toastPremium('ok','Este certificado ya se encuentra firmado.');
      return;
    }

    state.firmaSolicitudId=txt(r.id_solicitud);
    if(!state.firmaSolicitudId) throw Error('IASYN no devolvió id_solicitud.');
    renderHistorial();
    msg('ok',r.agente_online===false
      ? 'Solicitud creada. Abra IASYN Firma en el computador autorizado.'
      : 'Solicitud enviada. Adobe se abrirá automáticamente en el computador autorizado.');
    toastPremium('info',r.agente_online===false
      ? 'Solicitud creada. El motor IASYN debe estar activo en el computador autorizado.'
      : 'Firma en proceso. Adobe se abrirá automáticamente.');
    await esperarFirmaCertificado(state.firmaSolicitudId,id,idAtencion);
  }catch(e){
    msg('error',e.message||'No se pudo iniciar la firma del certificado.');
    toastPremium('error',e.message||'No se pudo iniciar la firma del certificado.');
  }finally{
    state.firmando=false;
    state.firmaSolicitudId='';
    state.firmaDocumentoId='';
    actualizarControlesFirma();
    renderHistorial();
  }
}

async function esperarFirmaCertificado(idSolicitud,idCertificado,idAtencion){
  const miToken=++state.firmaPollToken;
  const inicio=Date.now();
  while(miToken===state.firmaPollToken && Date.now()-inicio<35*60*1000){
    await new Promise(r=>setTimeout(r,2000));
    if(miToken!==state.firmaPollToken) return;
    const r=await postFirma('obtenerEstadoFirmaElectronica',{id_solicitud:idSolicitud});
    const estado=txt(r?.estado_firma||r?.estado).toUpperCase();
    if(estado==='FIRMADO'){
      await cargarFirmasCertificados(idAtencion);
      renderHistorial();
      if(txt(state.editandoId)===txt(idCertificado)) actualizarControlesFirma();
      msg('ok','Certificado firmado electrónicamente y archivado en IASYN.');
      toastPremium('ok','Certificado firmado correctamente y archivado en IASYN.');
      return;
    }
    if(estado==='ERROR') throw Error(r?.error||'El motor reportó un error de firma.');
    if(estado==='CANCELADA') throw Error('La solicitud de firma fue cancelada.');
    if(estado==='EXPIRADA') throw Error('La solicitud de firma expiró. Vuelva a intentarlo.');
    if(estado==='TOMADA') msg('','Adobe está abierto. Firme el certificado y guarde el PDF.');
  }
  throw Error('La solicitud sigue pendiente. Puede volver a abrir el certificado y consultar su estado.');
}

function base64BlobPDF(base64,nombre){
  const bin=atob(base64||'');
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:'application/pdf'});
}

async function verCertificadoFirmado(idCertificado){
  const id=txt(idCertificado||state.editandoId);
  const c=certificadoPersistido(id);
  if(!id||!c) return msg('warn','No se pudo identificar el certificado.');
  const ventana=window.open('','_blank');
  try{
    const r=await postFirma('obtenerDocumentoFirmado',{
      tipo_documento:'CERTIFICADO',
      id_atencion:txt(c.id_atencion),
      id_documento_origen:id,
      id_certificado:id
    });
    if(!r||r.success===false||!r.pdf_firmado_base64) throw Error(r?.message||'No se encontró el PDF firmado.');
    const blob=base64BlobPDF(r.pdf_firmado_base64,r.nombre_archivo||'certificado_firmado.pdf');
    const url=URL.createObjectURL(blob);
    if(ventana) ventana.location.href=url;
    else window.open(url,'_blank');
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(e){
    if(ventana) ventana.close();
    msg('error',e.message||'No se pudo abrir el certificado firmado.');
  }
}

function renderContextoClinico(){
  const box=document.getElementById('acContextoClinico');
  if(!box) return;

  const c=state.contexto||contexto();
  if(!c.id){
    box.style.display='none';
    box.innerHTML='';
    return;
  }

  const p=snapshotPaciente(c);
  const h=snapshotHistoria(c);
  const m=resolverMedico(c);

  box.style.display='block';
  box.innerHTML=`<div class="ac-context-grid">
    <div class="ac-context-item"><span>Paciente</span><b>${esc(p.nombre||'—')}</b></div>
    <div class="ac-context-item"><span>Cédula / documento</span><b>${esc(p.numero_documento||'—')}</b></div>
    <div class="ac-context-item"><span>Historia clínica</span><b>${esc(h.numero_historia||h.id_historia||'—')}</b></div>
    <div class="ac-context-item"><span>Consulta</span><b>#${esc(c.numeroConsulta||'—')}</b></div>
    <div class="ac-context-item"><span>Fecha de atención</span><b>${esc(fechaVisual(c.fechaAtencion)||'—')}</b></div>
    <div class="ac-context-item"><span>Médico responsable</span><b>${esc(m.nombre||'—')}</b></div>
    <div class="ac-context-item"><span>Especialidad</span><b>${esc(m.especialidad||'—')}</b></div>
    <div class="ac-context-item"><span>ID atención</span><b>${esc(c.id)}</b></div>
  </div>`;
}

function docHTML(data){
  const d=parse(data.detalle_json);
  const dx=d.diagnosticos||[];
  const dias=Number(d.dias_reposo||0);

  const pac=d.paciente||{
    nombre:data.nombre_paciente,
    numero_documento:data.numero_documento
  };

  const hist=d.historia||{id_historia:data.id_historia,numero_historia:data.id_historia};
  const med=d.medico||{
    nombre:data.nombre_medico,
    especialidad:data.especialidad,
    id_medico:data.id_medico
  };

  const cfg=Object.assign(
    {},
    normalizarConfig(configGlobal()),
    state.configuracion||{},
    d.centro||{}
  );

  const centro=txt(cfg.nombre)||'AUROSANAX';
  const color=txt(cfg.colorPrincipal)||'#8b1e5a';
  const ciudad=txt(cfg.ciudad)||'Guayaquil';
  const tipo=txt(data.tipo_certificado||d.tipo_certificado||'Certificado médico').toUpperCase();
  const fecha=d.fecha_emision||data.fecha_emision||hoy();

  const ubicacion=[cfg.direccion,cfg.ciudad,cfg.provincia,cfg.pais].filter(Boolean).join(' · ');
  const contactoCentro=[cfg.telefono,cfg.email,cfg.web].filter(Boolean).join(' · ');

  const logo=cfg.logo
    ? `<div class="ac-logo-wrap"><img class="ac-logo" src="${esc(cfg.logo)}" alt="Logo institucional" onerror="this.parentElement.style.display='none'"></div>`
    : '<div></div>';

  const dxHtml=dx.length
    ? dx.map(x=>`<div class="ac-dx-doc-row"><b>${esc(x.codigo_cie10||'')}</b>${x.descripcion?' '+esc(x.descripcion):''}</div>`).join('')
    : '<div class="ac-dx-doc-row">Sin diagnóstico seleccionado para este documento.</div>';

  const registros=[
    med.registro_msp?`Registro MSP/ACESS: ${med.registro_msp}`:'',
    med.registro_senescyt?`Registro SENESCYT: ${med.registro_senescyt}`:''
  ].filter(Boolean);

  const reposo=dias>0
    ? `<div class="ac-reposo">
        <p>Por lo que amerita reposo por <b>${dias} (${esc(numeroLetras(dias))}) ${dias===1?'DÍA':'DÍAS'}</b>:</p>
        <div class="ac-reposo-row"><b>DESDE:</b> ${esc(fechaVisual(d.reposo_desde))} (${esc(fechaLetras(d.reposo_desde))}).</div>
        <div class="ac-reposo-row"><b>HASTA:</b> ${esc(fechaVisual(d.reposo_hasta))} (${esc(fechaLetras(d.reposo_hasta))}).</div>
      </div>`
    : '';

  return `<div class="ac-paper" style="--ac-color:${esc(color)}">
    <div class="ac-doc-head">
      ${logo}
      <div>
        <div class="ac-brand">${esc(centro)}</div>
        ${(med.especialidad||cfg.subtitulo)?`<div class="ac-brand-sub">${esc(med.especialidad||cfg.subtitulo)}</div>`:''}
      </div>
      <div class="ac-doc-date">${esc(ciudad)}, ${esc(fechaVisual(fecha))}</div>
    </div>

    <h1>${esc(tipo)}</h1>

    <p>
      Por medio del presente certifico haber atendido al/la paciente
      <b>${esc(pac.nombre||'Paciente')}</b>, con documento de identidad
      <b>${esc(pac.numero_documento||'—')}</b>, número de historia clínica
      <b>${esc(hist.numero_historia||hist.id_historia||'—')}</b>, en la consulta
      <b>#${esc(data.numero_consulta||'—')}</b>, atendida por
      <b>${esc(med.nombre||'Profesional tratante')}</b>.
    </p>

    <div class="ac-cert-lines">
      ${med.especialidad?`<div class="ac-cert-line"><b>ESPECIALIDAD:</b> ${esc(med.especialidad)}</div>`:''}
      ${d.resumen_clinico?`<div class="ac-cert-line"><b>RESUMEN CLÍNICO:</b> ${esc(d.resumen_clinico)}</div>`:''}
      ${d.actividad_laboral?`<div class="ac-cert-line"><b>ACTIVIDAD LABORAL:</b> ${esc(d.actividad_laboral)}</div>`:''}
      ${d.contacto?`<div class="ac-cert-line"><b>NÚMERO DE CONTACTO:</b> ${esc(d.contacto)}</div>`:''}
      ${d.institucion_empresa?`<div class="ac-cert-line"><b>INSTITUCIÓN / EMPRESA:</b> ${esc(d.institucion_empresa)}</div>`:''}
      ${d.direccion_trabajo?`<div class="ac-cert-line"><b>DIRECCIÓN DE TRABAJO:</b> ${esc(d.direccion_trabajo)}</div>`:''}
    </div>

    <div class="ac-dx-doc">
      <div class="ac-dx-doc-title">DIAGNÓSTICO(S) CIE-10:</div>
      ${dxHtml}
    </div>

    ${d.contingencia?`<div class="ac-cert-line"><b>TIPO DE CONTINGENCIA:</b> ${esc(d.contingencia.toUpperCase())}</div>`:''}

    ${reposo}

    ${d.observaciones?`<p style="margin-top:16px"><b>OBSERVACIONES:</b> ${esc(d.observaciones)}</p>`:''}

    <div class="ac-firma-area">
      <div class="ac-centro-contacto">
        ${ubicacion?`<div>${esc(ubicacion)}</div>`:''}
        ${contactoCentro?`<div>${esc(contactoCentro)}</div>`:''}
        ${cfg.razon_social?`<div>${esc(cfg.razon_social)}${cfg.ruc?' · RUC '+esc(cfg.ruc):''}</div>`:''}
      </div>

      <div class="ac-sign">
        <div class="ac-sign-line"></div>
        <b>${esc(med.nombre||'Profesional tratante')}</b>
        ${med.especialidad?`<br><span>${esc(med.especialidad)}</span>`:''}
        ${registros.map(x=>`<br><span>${esc(x)}</span>`).join('')}
        ${med.email?`<br><span>${esc(med.email)}</span>`:''}
        <br><span>Firma y sello</span>
      </div>
    </div>
  </div>`;
}

function estilosImpresion(){
  return `
@page{size:A4 portrait;margin:12mm 15mm}
*{box-sizing:border-box}
html,body{
  margin:0;
  padding:0;
  max-width:100%;
  background:#fff;
  color:#111;
  font-family:Arial,Helvetica,sans-serif;
}
body{overflow-x:hidden}
.ac-paper{
  width:100%;
  max-width:100%;
  min-width:0;
  min-height:270mm;
  margin:0;
  padding:0 0 30mm 0;
  background:#fff;
  overflow:visible;
  position:relative;
}
.ac-paper,.ac-paper *{min-width:0}
.ac-paper p,.ac-paper span,.ac-paper b,.ac-paper div{
  overflow-wrap:anywhere;
  word-break:normal;
}
.ac-doc-head{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  gap:12px;
  align-items:center;
  border-bottom:2.5px solid var(--ac-color,#8b1e5a);
  padding-bottom:9px;
}
.ac-logo-wrap{width:55px;height:55px;display:grid;place-items:center;overflow:hidden}
.ac-logo{max-width:100%;max-height:100%;object-fit:contain}
.ac-brand{font-size:19px;font-weight:950;color:var(--ac-color,#8b1e5a);letter-spacing:.035em;overflow-wrap:anywhere}
.ac-brand-sub{font-size:10px;color:#667085;margin-top:2px;overflow-wrap:anywhere}
.ac-doc-date{text-align:right;font-size:11px;font-weight:750;white-space:normal}
h1{text-align:center;font-size:19px;margin:24px 0 27px;letter-spacing:.045em}
p{font-size:12.2px;line-height:1.6;text-align:justify;margin:0 0 12px}
.ac-cert-lines{display:grid;gap:6px;margin:14px 0}
.ac-cert-line{font-size:12px;line-height:1.42}
.ac-cert-line b:first-child{display:inline-block;min-width:150px}
.ac-dx-doc{margin:14px 0 16px}
.ac-dx-doc-title{font-size:12px;font-weight:900;margin-bottom:5px}
.ac-dx-doc-row{font-size:12px;line-height:1.45}
.ac-reposo{margin-top:16px}
.ac-reposo-row{font-size:12.1px;line-height:1.5;margin-top:4px}
.ac-firma-area{
position:absolute;
  left:0;
  right:0;
  bottom:0;
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:22mm;
  align-items:end;
  margin-top:0;
  break-inside:avoid;
  page-break-inside:avoid;
}
.ac-centro-contacto{font-size:10.2px;color:#475569;line-height:1.45;overflow-wrap:anywhere}
.ac-sign{text-align:center;font-size:11.2px;overflow-wrap:anywhere}
.ac-sign-line{border-top:1px solid #111;margin-bottom:6px}
.ac-sign b{font-size:12.4px}

/*
  DOCUMENTO MAESTRO A4:
  La geometría interna NO se remaqueta por ancho de pantalla.
  iPhone / Android reciben el mismo documento; solo cambia la escala del visor.
*/

/* Impresión: el área útil la define @page. No se vuelve a forzar 210 mm en html/body. */
@media print{
  html,body{
    width:auto!important;
    max-width:none!important;
    min-width:0!important;
    min-height:0!important;
    margin:0!important;
    padding:0!important;
    overflow:visible!important;
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
  }
  .ac-paper{
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    min-height:273mm!important;
    margin:0!important;
    padding:0 0 30mm 0!important;
    overflow:visible!important;
    position:relative!important;
    transform:none!important;
    translate:none!important;
    page-break-inside:auto!important;
    break-inside:auto!important;
  }
  .ac-doc-head{grid-template-columns:auto minmax(0,1fr) auto!important}
  .ac-firma-area{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
}`;
}

function auroGenerarVistaImpresionCertificadoUnificada(dataOpcional){
  const data=dataOpcional||datos();
  const htmlDoc=docHTML(data);
  const ventana=window.open('','_blank');

  if(!ventana){
    msg('warn','El navegador bloqueó la vista previa. Permita ventanas emergentes para este sitio.');
    return;
  }

  ventana.document.open();
  ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vista previa de certificado médico AUROSANAX</title>
<style>
${estilosImpresion()}
html,body{background:#dfe3e8}
.auro-cert-preview-toolbar{
  position:sticky;top:0;z-index:9999;display:flex;justify-content:space-between;
  align-items:center;gap:12px;padding:12px 18px;background:#fff;
  border-bottom:1px solid #d1d5db;box-shadow:0 3px 14px rgba(15,23,42,.14)
}
.auro-cert-preview-toolbar strong{color:#7a174f;font-size:15px}
.auro-cert-preview-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.auro-cert-preview-btn{border:0;border-radius:10px;padding:9px 14px;font-weight:850;cursor:pointer;background:#8b1e5a;color:#fff}
.auro-cert-preview-btn.secondary{background:#fff;color:#374151;border:1px solid #cbd5e1}
.auro-cert-preview-stage{min-height:calc(100vh - 62px);padding:20px;box-sizing:border-box;display:flex;justify-content:center;align-items:flex-start;overflow:auto}
.auro-cert-preview-sheet{width:210mm;min-width:210mm;min-height:297mm;flex:0 0 210mm;background:#fff;box-shadow:0 18px 42px rgba(15,23,42,.24);padding:12mm 15mm;box-sizing:border-box;transform-origin:top center}
.auro-cert-preview-sheet>.ac-paper{min-height:273mm!important}
@media(max-width:980px){
  .auro-cert-preview-stage{padding:12px 0 20px;overflow-x:hidden;display:flex;justify-content:center}
  .auro-cert-preview-sheet{transform-origin:top center}
}
@media(max-width:760px){
  .auro-cert-preview-toolbar{
    position:sticky;top:0;
    align-items:center;flex-direction:row;
    gap:8px;padding:8px 10px
  }
  .auro-cert-preview-toolbar strong{display:none}
  .auro-cert-preview-actions{
    display:grid;grid-template-columns:minmax(0,1fr) auto;
    width:100%;gap:8px;align-items:center
  }
  .auro-cert-preview-btn{
    width:100%;min-height:40px;padding:8px 10px;
    border-radius:8px;font-size:14px;line-height:1.15
  }
  .auro-cert-preview-btn.secondary{width:auto;min-width:74px}
  .auro-cert-preview-stage{
    display:flex;justify-content:center;min-height:calc(100vh - 58px);
    padding:10px 0 18px;overflow-x:hidden
  }
  .auro-cert-preview-sheet{
    width:210mm!important;min-width:210mm!important;max-width:none!important;min-height:297mm!important;
    flex:0 0 210mm!important;margin:0!important;padding:12mm 15mm!important;
    transform-origin:top center!important;
    box-shadow:0 8px 24px rgba(15,23,42,.18)
  }
}
@media print{
  @page{size:A4 portrait;margin:12mm 15mm}
  html,body{background:#fff!important;width:auto!important;min-width:0!important;max-width:none!important;margin:0!important;padding:0!important;overflow:visible!important}
  .auro-cert-preview-toolbar{display:none!important}
  .auro-cert-preview-stage{display:block!important;min-height:0!important;padding:0!important;overflow:visible!important}
  .auro-cert-preview-sheet{width:auto!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;transform:none!important}
  .auro-cert-preview-sheet>.ac-paper{width:100%!important;max-width:100%!important;min-height:273mm!important;margin:0!important;padding:0 0 30mm 0!important;position:relative!important;transform:none!important}
}
</style>
</head>
<body>
  <div class="auro-cert-preview-toolbar">
    <strong>Vista previa A4 · Certificado médico</strong>
    <div class="auro-cert-preview-actions">
      <button type="button" class="auro-cert-preview-btn" onclick="window.print()">Imprimir / Guardar PDF</button>
      <button type="button" class="auro-cert-preview-btn secondary" onclick="window.close()">Cerrar</button>
    </div>
  </div>
  <main class="auro-cert-preview-stage">
    <div class="auro-cert-preview-sheet" id="auroCertPreviewSheet">${htmlDoc}</div>
  </main>
<script>
(function(){
  function ajustar(){
    var hoja=document.getElementById('auroCertPreviewSheet');
    if(!hoja) return;

    var anchoVentana=window.innerWidth||document.documentElement.clientWidth||794;
    var anchoHoja=hoja.offsetWidth||794;
    var altoHoja=hoja.offsetHeight||1123;
    var margen=anchoVentana<=760?16:28;
    var disponible=Math.max(220,anchoVentana-margen);
    var escala=anchoVentana>980?1:Math.min(1,disponible/anchoHoja);

    hoja.style.transform=escala<1?'scale('+escala+')':'none';
    hoja.style.marginBottom=escala<1?(-altoHoja*(1-escala))+'px':'0';
  }
  window.addEventListener('resize',ajustar);
  ajustar();
})();
<\/script>
</body>
</html>`);
  ventana.document.close();
  ventana.focus();
}

function vista(imprimir){
  const data=datos();
  const htmlDoc=docHTML(data);
  const p=document.getElementById('acPreview');

  if(!imprimir){
    if(p){
      p.innerHTML=htmlDoc;
      p.style.display='block';
      p.scrollIntoView({behavior:'smooth',block:'start'});
    }
    return;
  }

  return auroGenerarVistaImpresionCertificadoUnificada(data);
}

function auroInstalarMotorImpresionCertificadoUnificado(){
  window.__auroCertificadosConstruirPDFSeguro=function(data){
    return auroGenerarVistaImpresionCertificadoUnificada(data||datos());
  };
}

auroInstalarMotorImpresionCertificadoUnificado();

function pintarCargaAtencion(c){
  const dx=document.getElementById('acDx');
  const historial=document.getElementById('acHistorial');
  const numero=txt(c?.numeroConsulta);

  if(dx){
    dx.innerHTML='<div class="ac-empty">Cargando diagnósticos de esta atención…</div>';
  }
  if(historial){
    historial.innerHTML='<div class="ac-empty">Cargando certificados'+
      (numero?' de la consulta #'+esc(numero):' de esta atención')+'…</div>';
  }
}

async function inicializar(){
  mount();

  const token=++state.token;
  const c=contexto();

  state.contexto=c;
  state.idAtencion=c.id;

  const badge=document.getElementById('acContexto');
  if(badge){
    badge.textContent=c.id
      ? (c.numeroConsulta?'Consulta #'+c.numeroConsulta:'Atención seleccionada')
      : 'Sin atención seleccionada';
  }

  if(!c.id){
    state.diagnosticos=[];
    state.certificados=[];
    state.firmasPorDocumento={};
    state.paciente=null;
    state.historia=null;
    state.editandoId='';
    renderDx();
    renderHistorial();
    renderContextoClinico();
    nuevo();
    return;
  }

  /* IASYN 1.4.1 — al cambiar de consulta se invalida inmediatamente la
     proyección visual anterior. No se muestra "No existen certificados"
     mientras todavía se está consultando la nueva atención. */
  state.diagnosticos=[];
  state.certificados=[];
  state.firmasPorDocumento={};
  state.paciente=null;
  state.historia=null;
  state.editandoId='';
  actualizarControlesFirma();
  renderContextoClinico();
  pintarCargaAtencion(c);

  /* Contexto auxiliar y datos clínicos se cargan en paralelo. El historial
     ya no queda bloqueado esperando Configuración/Médicos ni estado de firma. */
  const cargaAuxiliar=cargarContextoAuxiliar(c);
  const cargaClinica=Promise.all([
    cargarDx(c.id,token),
    cargarHistorial(c.id,token)
  ]);

  await cargaAuxiliar;
  if(token!==state.token || txt(state.idAtencion)!==txt(c.id)) return;
  renderContextoClinico();

  await cargaClinica;
  if(token!==state.token || txt(state.idAtencion)!==txt(c.id)) return;

  nuevo();
}

window.auroCertificados={
  version:VERSION,
  inicializar,
  estado:state,
  vistaPrevia:()=>vista(false),
  imprimir:()=>vista(true),
  obtenerDatos:datos,
  construirDocumento:docHTML,
  firmarCertificado:firmarCertificado,
  cancelarFirmaCertificado:cancelarFirmaCertificado,
  verCertificadoFirmado:verCertificadoFirmado
};

/*
  IASYN 1.4.2 — SINCRONIZACIÓN + UX DE BOTONES DE CERTIFICADOS
  Atenciones emite 'aurosanax:atencion-seleccionada' después de fijar el
  nuevo id_atencion como contexto maestro. Si Certificados está visible,
  se reinicializa inmediatamente con ese contexto. No modifica Atenciones,
  Index, persistencia, PDF ni el contrato de Firma Electrónica.
*/
function iasynCertificadosAlCambiarAtencion(){
  const panel=document.getElementById('hc_certificados');
  if(!panel || panel.offsetParent===null) return;

  Promise.resolve(inicializar()).catch(error=>{
    console.warn('IASYN CERTIFICADOS: no se pudo refrescar la atención seleccionada.',error);
  });
}

window.addEventListener('aurosanax:atencion-seleccionada',iasynCertificadosAlCambiarAtencion);

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{mount();},{once:true});
}else{
  mount();
}

window.addEventListener('load',()=>{
  auroInstalarMotorImpresionCertificadoUnificado();
});

})();
