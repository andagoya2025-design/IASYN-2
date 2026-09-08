/* ============================================================
   IASYN CLINICAL ERP
   MÓDULO: OBSTETRICIA
   Archivo: obstetricia.js
   Versión: 1.0.2 - 2026-07-23 · retiro quirúrgico de campos redundantes
   Un registro por id_atencion. Compatible con 30 columnas.
============================================================ */
(function(){
'use strict';
const MODULO='IASYN_OBSTETRICIA_V1';
const STORAGE_KEY='iasyn_obstetricia_local_v1';
const VERSION='20260830_obstetricia_v1_0_4_noop_cambios_reales_refresco_tarjeta';
let registroActual=null,cargando=false,guardando=false,ultimoIdAtencion='',contextoSeleccionado=null,cargaAntecedentesSeq=0;
let cambiosUsuarioObstetricia=false,firmaBaseObstetricia='';
const $=id=>document.getElementById(id), txt=v=>String(v??'').trim(), now=()=>new Date().toISOString();
function fechaHoy(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function horaActual(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function idTemporal(){return `OBS-${Date.now()}-${Math.floor(Math.random()*1000)}`}
function parseJSON(v,d={}){if(v==null||v==='')return d;if(typeof v==='object')return v;try{return JSON.parse(v)}catch(e){console.warn(MODULO,'JSON inválido',e);return d}}
function esc(v){return txt(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function getValue(id){const e=$(id);if(!e)return '';return e.type==='checkbox'?!!e.checked:txt(e.value)}
function setValue(id,v){const e=$(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v==null?'':v}

/* ============================================================
   AUROSANAX FIX QUIRÚRGICO 2026-08-29
   AISLAMIENTO DOM DE SÍNTOMAS OBSTÉTRICOS
   ------------------------------------------------------------
   Los IDs obsSint* también existen dentro de Anamnesis.
   Obstetricia conserva intactos su guardado, carga y limpieza, pero
   para esos controles busca EXCLUSIVAMENTE dentro de #obstetricia.
   Así nunca limpia ni modifica los checkboxes de Anamnesis.
============================================================ */
function obsControlPropio(id){
  const sec=$('obstetricia');
  if(!sec)return null;
  return [...sec.querySelectorAll('[id]')].find(e=>e.id===id)||null
}
function obsGetValue(id){const e=obsControlPropio(id);if(!e)return '';return e.type==='checkbox'?!!e.checked:txt(e.value)}
function obsSetValue(id,v){const e=obsControlPropio(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v==null?'':v}
function obsTieneControlesSintomasPropios(){
  return ['obsSintSangrado','obsSintPerdidaLiquido','obsSintDolorPelvico','obsSintContracciones','obsSintCefalea','obsSintFosfenos','obsSintTinnitus','obsSintEpigastralgia','obsSintDisuria','obsSintOtros','obsSintDescripcion'].some(id=>!!obsControlPropio(id))
}
function setText(id,v,x='—'){const e=$(id);if(e)e.textContent=txt(v)||x}
function usuarioActual(){try{if(typeof window.obtenerUsuarioActual==='function'){const u=window.obtenerUsuarioActual();return txt(u?.nombre||u?.nombre_completo||u?.usuario||u?.email||u)}const u=window.usuarioActualERP||window.usuarioActual||window.currentUser||{};return txt(u.nombre||u.nombre_completo||u.usuario||u.email)||'AUROSANAX ERP'}catch(_){return 'IASYN ERP'}}
function leerAtenciones(){for(const k of ['aurosanax_atenciones_local_v1','aurosanax_atenciones','atenciones']){try{const a=JSON.parse(localStorage.getItem(k)||'[]');if(Array.isArray(a)&&a.length)return a}catch(_){}}return []}
function normalizarDetalle(d){if(!d||typeof d!=='object')return null;const c=d.atencion||d.data||d.registro||d;const id=txt(c?.id_atencion||c?.id||d.id_atencion||d.id);return id?{...c,id_atencion:id}:null}
function idAtencionDOM(){for(const s of ['[data-id-atencion].active','[data-id-atencion][aria-selected="true"]','[data-id-atencion].selected','#idAtencionActiva','#atencionActivaId','#hcIdAtencion','[name="id_atencion"]']){const e=document.querySelector(s);if(!e)continue;const id=txt(e.dataset?.idAtencion||e.value||e.getAttribute('data-id-atencion'));if(id)return id}return ''}

/* ============================================================
   AISLAMIENTO DE CONTEXTO OBSTÉTRICO V1
   El selector maestro de Historia Clínica es la autoridad para
   impedir que una atención/paciente anterior reaparezca en
   Obstetricia cuando no existe paciente seleccionado o cambió.
   NO modifica guardado, tarjeta de antecedentes ni base de datos.
============================================================ */
function estadoPacienteMaestro(){
  const e=$('hcPacienteSelect');
  return{disponible:!!e,id:txt(e?.value)}
}
function atencionCompatibleConPaciente(a){
  if(!a||typeof a!=='object'||!txt(a.id_atencion||a.id))return null;
  const m=estadoPacienteMaestro();
  if(!m.disponible)return a;
  if(!m.id)return null;
  const idPacienteAtencion=txt(a.id_paciente);
  if(idPacienteAtencion&&idPacienteAtencion!==m.id)return null;
  return a
}
function resolverAtencion(){
  const m=estadoPacienteMaestro();
  if(m.disponible&&!m.id)return null;

  let a=atencionCompatibleConPaciente(contextoSeleccionado);
  if(a)return a;

  for(const o of [window.atencionActiva,window.atencionActual,window.currentAtencion,window.AURO_ATENCION_ACTIVA]){
    a=atencionCompatibleConPaciente(o);
    if(a)return a
  }

  try{
    if(typeof window.getAtencionActiva==='function'){
      a=atencionCompatibleConPaciente(window.getAtencionActiva());
      if(a)return a
    }
  }catch(_){}

  const id=[
    window.atencionActivaId,
    window.idAtencionActiva,
    window.currentAtencionId,
    sessionStorage.getItem('aurosanax_id_atencion_activa'),
    sessionStorage.getItem('aurosanax_id_atencion_seleccionada'),
    localStorage.getItem('aurosanax_id_atencion_activa'),
    localStorage.getItem('aurosanax_id_atencion_seleccionada'),
    localStorage.getItem('id_atencion_activa'),
    idAtencionDOM()
  ].map(txt).find(Boolean)||'';

  if(id){
    const encontrada=leerAtenciones().find(x=>txt(x.id_atencion||x.id)===id);
    a=atencionCompatibleConPaciente(encontrada);
    if(a)return a;

    /*
     * Compatibilidad histórica:
     * si no existe selector maestro, se conserva el fallback antiguo.
     * Con selector maestro presente no se inventa una atención sin paciente.
     */
    if(!m.disponible)return{id_atencion:id}
  }

  return leerAtenciones().find(x=>{
    if(!['abierta','en atención','en atencion','activa'].includes(txt(x.estado_atencion||x.estado).toLowerCase()))return false;
    return !!atencionCompatibleConPaciente(x)
  })||null
}
function resolverPaciente(a){
  const m=estadoPacienteMaestro();

  /*
   * Si Historia Clínica tiene selector maestro, ese id manda.
   * Así un objeto global del paciente anterior no puede contaminar
   * el contexto visual de Obstetricia.
   */
  if(m.disponible){
    if(!m.id)return null;

    for(const o of [window.pacienteActivo,window.pacienteActual,window.currentPatient,window.selectedPatient,window.AURO_PACIENTE_ACTIVO]){
      if(o&&typeof o==='object'&&txt(o.id_paciente||o.id)===m.id)return o
    }

    try{
      if(typeof window.getPacienteActivo==='function'){
        const p=window.getPacienteActivo();
        if(p&&txt(p.id_paciente||p.id)===m.id)return p
      }
    }catch(_){}

    for(const l of [window.pacientes,window.pacientesData,window.listaPacientes]){
      if(!Array.isArray(l))continue;
      const p=l.find(x=>txt(x.id_paciente||x.id)===m.id);
      if(p)return p
    }

    return{id_paciente:m.id}
  }

  /* Fallback original cuando el selector maestro no existe. */
  for(const o of [window.pacienteActivo,window.pacienteActual,window.currentPatient,window.selectedPatient,window.AURO_PACIENTE_ACTIVO]){
    if(o&&typeof o==='object'&&txt(o.id_paciente||o.id))return o
  }
  try{
    if(typeof window.getPacienteActivo==='function'){
      const p=window.getPacienteActivo();
      if(p)return p
    }
  }catch(_){}
  const id=txt(a?.id_paciente||window.idPacienteActivo||window.activePatientId||sessionStorage.getItem('aurosanax_id_paciente_activo')||localStorage.getItem('aurosanax_id_paciente_activo')||localStorage.getItem('selectedPatientId'));
  for(const l of [window.pacientes,window.pacientesData,window.listaPacientes]){
    if(!Array.isArray(l))continue;
    const p=l.find(x=>txt(x.id_paciente||x.id)===id);
    if(p)return p
  }
  return id?{id_paciente:id}:null
}
function resolverMedico(a){const id=txt(a?.id_medico||window.idMedicoActual||window.medicoActual?.id_medico||window.usuarioActualERP?.id_medico);let nombre=txt(a?.nombre_medico||a?.medico_nombre||window.medicoActual?.nombre_completo||window.medicoActual?.nombre);for(const l of [window.medicos,window.medicosActivos,window.listaMedicos]){if(!Array.isArray(l))continue;const m=l.find(x=>txt(x.id_medico||x.id||x.codigo)===id);if(m){nombre=nombre||txt(m.nombre_completo||`${txt(m.nombres||m.nombre)} ${txt(m.apellidos)}`.trim());break}}return{id_medico:id,nombre_medico:nombre}}
function contextoActual(){const a=resolverAtencion(),p=resolverPaciente(a),m=resolverMedico(a);return{atencion:a,paciente:p,id_atencion:txt(a?.id_atencion||a?.id),numero_consulta:a?.numero_consulta||a?.consulta||'',id_paciente:txt(a?.id_paciente||p?.id_paciente||p?.id),nombre_paciente:txt(p?.nombre_completo||`${txt(p?.nombres||p?.nombre)} ${txt(p?.apellidos)}`.trim()||a?.nombre_paciente||a?.paciente_nombre),id_historia:txt(a?.id_historia||window.idHistoriaActual||window.auroHistoriaSeleccionadaId||window.historiaActiva?.id_historia||window.historiaActual?.id_historia||window.currentHistoria?.id_historia||p?.id_historia||sessionStorage.getItem('aurosanax_id_historia_activa')||localStorage.getItem('aurosanax_id_historia_activa')),id_medico:m.id_medico,nombre_medico:m.nombre_medico,fecha_atencion:txt(a?.fecha_atencion||a?.fecha)||fechaHoy(),hora_atencion:txt(a?.hora_atencion||a?.hora)||horaActual(),tipo_atencion:txt(a?.tipo_atencion)}}
function fechaInputObstetricia(v){
  if(v===null||v===undefined||v==='')return '';
  const s=String(v).trim();
  if(!s)return '';

  // Ya viene en formato válido para <input type="date">
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return `${m[1]}-${m[2]}-${m[3]}`;

  // Compatibilidad defensiva con dd/mm/aaaa
  const d=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(d)return `${d[3]}-${String(d[2]).padStart(2,'0')}-${String(d[1]).padStart(2,'0')}`;

  return s;
}
function normalizar(r={}){return{id_obstetricia:txt(r.id_obstetricia||r.id),id_atencion:txt(r.id_atencion),numero_consulta:r.numero_consulta||'',id_paciente:txt(r.id_paciente),nombre_paciente:txt(r.nombre_paciente||r.paciente_nombre),id_historia:txt(r.id_historia),id_medico:txt(r.id_medico),nombre_medico:txt(r.nombre_medico||r.medico_nombre),fecha_atencion:txt(r.fecha_atencion||r.fecha),hora_atencion:txt(r.hora_atencion||r.hora),tipo_atencion:txt(r.tipo_atencion),fum:fechaInputObstetricia(r.fum||r.fur),fpp:fechaInputObstetricia(r.fpp),edad_gestacional_semanas:txt(r.edad_gestacional_semanas),edad_gestacional_dias:txt(r.edad_gestacional_dias),peso_materno:txt(r.peso_materno),presion_arterial:txt(r.presion_arterial),altura_uterina:txt(r.altura_uterina),frecuencia_cardiaca_fetal:txt(r.frecuencia_cardiaca_fetal),riesgo_obstetrico:txt(r.riesgo_obstetrico),proximo_control:fechaInputObstetricia(r.proximo_control),embarazo_actual_json:parseJSON(r.embarazo_actual_json,{}),sintomas_obstetricos_json:parseJSON(r.sintomas_obstetricos_json,{}),evaluacion_obstetrica_json:parseJSON(r.evaluacion_obstetrica_json,{}),impresion_obstetrica:txt(r.impresion_obstetrica),observaciones:txt(r.observaciones),estado_registro:txt(r.estado_registro||r.estado||'Activo'),creado_en:r.creado_en||'',actualizado_en:r.actualizado_en||'',creado_por:txt(r.creado_por)}}
function normalizarTimestampRemotoObstetricia(v){
  const s=txt(v);
  if(!s)return '';

  /*
   * SOLO PARA RESPUESTAS REMOTAS DE APPS SCRIPT / SHEETS.
   *
   * Cuando Sheets devuelve un DATE_TIME como ISO terminado en Z,
   * esa serialización ya contiene en sus componentes UTC la hora de
   * pared visible en la hoja. Convertir nuevamente con new Date()
   * resta 5 horas en Ecuador.
   *
   * Por eso, únicamente en la ruta REMOTA, conservamos literalmente
   * YYYY-MM-DD HH:mm:ss a partir de los componentes del ISO.
   *
   * Ejemplo remoto:
   *   2026-08-27T08:22:43.000Z
   * se convierte a:
   *   2026-08-27 08:22:43
   *
   * Los timestamps locales recién creados con now() NO pasan por aquí.
   */
  const isoZ=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/i);
  if(isoZ){
    return `${isoZ[1]}-${isoZ[2]}-${isoZ[3]} ${isoZ[4]}:${isoZ[5]}:${isoZ[6]}`;
  }

  return s;
}

function normalizarRemotoObstetricia(r={}){
  const x=Object.assign({},r);
  if(x.creado_en!==undefined){
    x.creado_en=normalizarTimestampRemotoObstetricia(x.creado_en);
  }
  if(x.actualizado_en!==undefined){
    x.actualizado_en=normalizarTimestampRemotoObstetricia(x.actualizado_en);
  }
  return normalizar(x);
}

function leerLocales(){try{const a=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(a)?a.map(normalizar):[]}catch(_){return []}}
function guardarLocales(a){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(a||[]))}catch(e){console.warn(MODULO,e)}}
function actualizarLocal(r){const a=leerLocales(),i=a.findIndex(x=>(txt(r.id_obstetricia)&&txt(x.id_obstetricia)===txt(r.id_obstetricia))||(txt(r.id_atencion)&&txt(x.id_atencion)===txt(r.id_atencion)));if(i>=0)a[i]=normalizar(r);else a.push(normalizar(r));guardarLocales(a)}
async function listarRemotos(){if(typeof window.API_URL==='undefined'||!txt(window.API_URL))return[];const r=await fetch(`${window.API_URL}?accion=listarObstetricia&_=${Date.now()}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();return Array.isArray(d)?d:(Array.isArray(d?.data)?d.data:[])}
async function enviarRemoto(r,editar){if(typeof window.API_URL==='undefined'||!txt(window.API_URL))throw new Error('API_URL no está definida');await fetch(window.API_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({accion:editar?'editarObstetricia':'guardarObstetricia',data:r})})}
function notificar(m,t='success'){
  const b=$('obsEstadoModulo');

  /*
   * UX LOCAL OBSTETRICIA:
   * Se conserva compatibilidad con los toasts globales si existen,
   * pero el módulo muestra además un mensaje visual propio y persistente
   * durante unos segundos. No modifica guardado ni backend.
   */
  try{
    if(typeof window.mostrarToast==='function')window.mostrarToast(m,t);
    else if(typeof window.showToast==='function')window.showToast(m,t)
  }catch(_){}

  if(!b)return;

  const mapa={
    success:{icon:'bi-check-circle-fill',titulo:'Guardado confirmado'},
    error:{icon:'bi-exclamation-triangle-fill',titulo:'Atención'},
    info:{icon:'bi-info-circle-fill',titulo:'Información'}
  };
  const cfg=mapa[t]||mapa.info;

  b.className=`obs-status ${t} obs-status-premium`;
  b.innerHTML=`<i class="bi ${cfg.icon} obs-status-icon"></i><div class="obs-status-copy"><div class="obs-status-title">${esc(cfg.titulo)}</div><div>${esc(m)}</div></div>`;
  b.style.display='flex';

  clearTimeout(b._timer);
  b._timer=setTimeout(()=>{
    b.style.display='none';
    b.className='obs-status'
  },5200)
}
function check(id,l){return `<label class="obs-check"><input id="${id}" type="checkbox"><span>${esc(l)}</span></label>`}
function estilos(){if($('auroObstetriciaCSS'))return;const s=document.createElement('style');s.id='auroObstetriciaCSS';s.textContent=`#obstetricia .obs-shell{display:grid;gap:16px}#obstetricia .obs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:14px;border-bottom:1px solid #e5e7eb}#obstetricia .obs-head h4{margin:0;font-weight:900}#obstetricia .obs-head p{margin:4px 0 0;color:#6b7280}#obstetricia .obs-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}#obstetricia .obs-actions-block{display:grid;gap:7px;justify-items:end}#obstetricia .obs-context{border:1px solid #fbcfe8;background:linear-gradient(135deg,#fff7fb,#fff);border-radius:20px;padding:14px}#obstetricia .obs-context-grid,#obstetricia .obs-read-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#obstetricia .obs-context-item{border:1px solid #e5e7eb;background:#fff;border-radius:14px;padding:10px;min-width:0}#obstetricia .obs-context-item small{display:block;color:#6b7280;text-transform:uppercase;font-size:10px;font-weight:850}#obstetricia .obs-context-item b{font-size:13px;word-break:break-word}#obstetricia .obs-panel{border:1px solid #e5e7eb;border-radius:20px;padding:16px;background:#fff}#obstetricia .obs-panel-title{font-weight:900;margin-bottom:12px;display:flex;align-items:center;gap:8px}#obstetricia .obs-panel-title i{color:#8b1e5a}#obstetricia .obs-read{border:1px dashed #cbd5e1;background:#f8fafc;border-radius:14px;padding:10px}#obstetricia .obs-read small{display:block;color:#64748b;font-weight:800;font-size:11px}#obstetricia .obs-read b{font-size:13px}#obstetricia .obs-check-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#obstetricia .obs-check{border:1px solid #e5e7eb;border-radius:14px;padding:9px 10px;display:flex;align-items:center;gap:8px;background:#fff}#obstetricia .obs-check input{width:17px;height:17px;accent-color:#8b1e5a}#obstetricia .obs-status{display:none;border-radius:14px;padding:11px 12px;font-weight:700}#obstetricia .obs-status.success{background:#dcfce7;color:#166534}#obstetricia .obs-status.error{background:#fee2e2;color:#991b1b}#obstetricia .obs-status.info{background:#dbeafe;color:#1e40af}#obstetricia .obs-status.obs-status-premium{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:16px;font-size:15px;line-height:1.35;box-shadow:0 10px 28px rgba(15,23,42,.08);border:1px solid transparent;animation:obsPremiumIn .22s ease-out}#obstetricia .obs-status.obs-status-premium .obs-status-icon{font-size:20px;line-height:1;flex:0 0 auto;margin-top:1px}#obstetricia .obs-status.obs-status-premium .obs-status-copy{display:grid;gap:2px}#obstetricia .obs-status.obs-status-premium .obs-status-title{font-weight:900}#obstetricia .obs-status.obs-status-premium .obs-status-detail{font-size:12px;font-weight:700;opacity:.78}#obstetricia .obs-status.success.obs-status-premium{background:#f0fdf4;color:#166534;border-color:#bbf7d0}#obstetricia .obs-status.error.obs-status-premium{background:#fef2f2;color:#991b1b;border-color:#fecaca}#obstetricia .obs-status.info.obs-status-premium{background:#eff6ff;color:#1e40af;border-color:#bfdbfe}#obstetricia .obs-record-state.obs-record-saved{color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:8px 10px;display:inline-block}#obstetricia .obs-record-state.obs-record-empty{color:#64748b}#obstetricia .obs-record-state .obs-record-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px;vertical-align:1px}#obstetricia .obs-record-state .obs-record-main{font-weight:900}#obstetricia .obs-record-state .obs-record-time{font-size:12px;font-weight:750;opacity:.8}#obstetricia .obs-actions-block.obs-actions-premium{min-width:330px;max-width:420px;width:min(420px,100%);background:linear-gradient(135deg,#fff,#fff7fb);border:1px solid #f3d1e2;border-radius:20px;padding:12px 14px;box-shadow:0 12px 26px rgba(139,30,90,.07)}#obstetricia .obs-actions-block.obs-actions-premium .obs-actions{width:100%;justify-content:flex-end}#obstetricia .obs-actions-block.obs-actions-premium .obs-record-state{width:100%;text-align:left;margin-top:2px}#obstetricia .obs-actions-block.obs-actions-premium .obs-record-state.obs-record-saved{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:9px 11px}#obstetricia .obs-btn-restore{background:#fff;color:#7c2d5a;border:1px solid #efbfd5;border-radius:13px;padding:9px 13px;font-weight:800;transition:background .2s ease,border-color .2s ease,transform .18s ease,box-shadow .18s ease;white-space:nowrap}#obstetricia .obs-btn-restore:hover:not(:disabled){background:#fff1f7;border-color:#e6a8c5;transform:translateY(-1px);box-shadow:0 8px 18px rgba(124,45,90,.08)}#obstetricia .obs-btn-restore:disabled{opacity:.65;cursor:wait;transform:none;box-shadow:none}#obstetricia .obs-actions-help{font-size:11px;color:#64748b;font-weight:650;line-height:1.3;text-align:right;width:100%}@media(max-width:760px){#obstetricia .obs-actions-block.obs-actions-premium{min-width:0;max-width:none;width:100%}#obstetricia .obs-actions-block.obs-actions-premium .obs-actions{justify-content:stretch}#obstetricia .obs-actions-block.obs-actions-premium .obs-actions button{flex:1}#obstetricia .obs-actions-help{text-align:left}}@keyframes obsPremiumIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}#obstetricia .obs-alert{display:none;border-radius:14px;padding:11px 12px;background:#fff7ed;color:#9a3412}#obstetricia .obs-alert.show{display:block}#obstetricia .obs-record-state{font-size:12px;color:#475569;font-weight:750;text-align:right}#obstetricia .obs-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#obstetricia .obs-footer-actions{display:flex;gap:8px;flex-wrap:wrap}#obstetricia #obsBtnGuardar{transition:background-color .24s ease,border-color .24s ease,box-shadow .24s ease,transform .18s ease,opacity .18s ease;min-width:190px}#obstetricia #obsBtnGuardar.obs-btn-saving{opacity:.78;cursor:wait;transform:scale(.985)}#obstetricia #obsBtnGuardar.obs-btn-success{background:#15803d!important;border-color:#15803d!important;color:#fff!important;box-shadow:0 8px 20px rgba(21,128,61,.18);transform:scale(1.02)}#obstetricia #obsBtnGuardar.obs-btn-error{background:#b91c1c!important;border-color:#b91c1c!important;color:#fff!important;box-shadow:0 8px 20px rgba(185,28,28,.16)}@media(max-width:760px){#obstetricia .obs-head{display:block}#obstetricia .obs-actions-block{justify-items:start;margin-top:12px}#obstetricia .obs-context-grid,#obstetricia .obs-read-grid{grid-template-columns:1fr}#obstetricia .obs-check-grid{grid-template-columns:repeat(2,1fr)}#obstetricia .obs-record-state{text-align:left}}`;document.head.appendChild(s)}
function renderizar(){const sec=$('obstetricia');if(!sec){console.warn(MODULO,'No existe #obstetricia');return false}estilos();sec.innerHTML=`<div class="cardx p-4 obs-shell"><div class="obs-head"><div><h4><i class="bi bi-heart-pulse me-2"></i>Obstetricia</h4><p>Registro por atención. Diagnóstico, Plan y documentos se gestionan aparte.</p></div><div class="obs-actions-block obs-actions-premium"><div class="obs-actions"><button type="button" class="obs-btn-restore" id="obsBtnRecargar" title="Recupera la última versión guardada y descarta cambios no guardados"><i class="bi bi-arrow-counterclockwise me-1"></i>Restablecer</button><button type="button" class="btn-auro" id="obsBtnGuardar"><i class="bi bi-save me-1"></i>Guardar Obstetricia</button></div><div id="obsEstadoRegistroSuperior" class="obs-record-state">Consulta — · Sin registro de Obstetricia</div><div class="obs-actions-help">Restablecer descarta cambios no guardados.</div></div></div><div class="module-patient-card" data-module-patient="Obstetricia"></div><div id="obsAlertaAtencion" class="obs-alert"><i class="bi bi-exclamation-triangle me-1"></i>Debe seleccionar paciente e iniciar una atención.</div><div class="obs-context"><div class="obs-context-grid"><div class="obs-context-item"><small>Paciente</small><b id="obsCtxPaciente">—</b></div><div class="obs-context-item"><small>Atención</small><b id="obsCtxAtencion">—</b></div><div class="obs-context-item"><small>Consulta</small><b id="obsCtxConsulta">—</b></div><div class="obs-context-item"><small>Médico</small><b id="obsCtxMedico">—</b></div></div></div><div id="obsEstadoModulo" class="obs-status"></div>
<div class="obs-panel"><div class="obs-panel-title"><i class="bi bi-clock-history"></i>Antecedentes obstétricos — solo lectura</div><div class="obs-read-grid"><div class="obs-read"><small>Gestas</small><b id="obsAntGestas">—</b></div><div class="obs-read"><small>Partos</small><b id="obsAntPartos">—</b></div><div class="obs-read"><small>Cesáreas</small><b id="obsAntCesareas">—</b></div><div class="obs-read"><small>Abortos</small><b id="obsAntAbortos">—</b></div><div class="obs-read"><small>Ectópicos</small><b id="obsAntEctopicos">—</b></div><div class="obs-read"><small>Mortinatos</small><b id="obsAntMortinatos">—</b></div><div class="obs-read"><small>Hijos vivos</small><b id="obsAntVivos">—</b></div><div class="obs-read"><small>Complicaciones</small><b id="obsAntComplicaciones">—</b></div></div></div>
<div class="obs-panel"><div class="obs-panel-title"><i class="bi bi-calendar-heart"></i>Embarazo actual</div><div class="row g-3"><div class="col-md-3"><label class="form-label fw-bold">FUM</label><input id="obsFum" type="date" class="form-control"></div><div class="col-md-3"><label class="form-label fw-bold">FPP</label><input id="obsFpp" type="date" class="form-control"></div><div class="col-md-2"><label class="form-label fw-bold">EG semanas</label><input id="obsEgSemanas" type="number" min="0" max="45" class="form-control"></div><div class="col-md-2"><label class="form-label fw-bold">EG días</label><input id="obsEgDias" type="number" min="0" max="6" class="form-control"></div><div class="col-md-2"><label class="form-label fw-bold">Tipo atención</label><select id="obsTipoAtencion" class="form-select"><option value="">Seleccionar</option><option>Primera consulta</option><option>Control prenatal</option><option>Urgencia obstétrica</option><option>Seguimiento</option><option>Teleconsulta</option></select></div><div class="col-md-6"><label class="form-label fw-bold">Altura uterina (cm)</label><input id="obsAlturaUterina" type="number" step="0.1" class="form-control"></div><div class="col-md-6"><label class="form-label fw-bold">FCF (lpm)</label><input id="obsFcf" type="number" class="form-control"></div><div class="col-md-3"><label class="form-label fw-bold">Embarazo</label><select id="obsTipoEmbarazo" class="form-select"><option value="">No registrado</option><option>Único</option><option>Múltiple</option></select></div><div class="col-md-2"><label class="form-label fw-bold">Número de fetos</label><input id="obsNumeroFetos" type="number" min="1" class="form-control"></div><div class="col-md-3"><label class="form-label fw-bold">Situación fetal</label><select id="obsSituacionFetal" class="form-select"><option value="">No registrada</option><option>Longitudinal</option><option>Transversa</option><option>Oblicua</option></select></div><div class="col-md-2"><label class="form-label fw-bold">Presentación</label><select id="obsPresentacionFetal" class="form-select"><option value="">No registrada</option><option>Cefálica</option><option>Podálica</option><option>Hombro</option></select></div><div class="col-md-2"><label class="form-label fw-bold">Posición fetal</label><input id="obsPosicionFetal" class="form-control"></div></div></div>
<div class="obs-panel"><div class="obs-panel-title"><i class="bi bi-clipboard2-pulse"></i>Evaluación obstétrica</div><div class="row g-3"><div class="col-md-3"><label class="form-label fw-bold">Movimientos fetales</label><select id="obsMovimientosFetales" class="form-select"><option value="">No registrado</option><option>Presentes</option><option>Disminuidos</option><option>Ausentes</option><option>No aplica</option></select></div><div class="col-md-3"><label class="form-label fw-bold">Actividad uterina</label><select id="obsActividadUterina" class="form-select"><option value="">No registrada</option><option>Ausente</option><option>Irregular</option><option>Regular</option></select></div><div class="col-md-3"><label class="form-label fw-bold">Edema</label><select id="obsEdema" class="form-select"><option value="">No registrado</option><option>Ausente</option><option>Leve</option><option>Moderado</option><option>Severo</option></select></div><div class="col-md-3"><label class="form-label fw-bold">Membranas</label><select id="obsEstadoMembranas" class="form-select"><option value="">No registrado</option><option>Íntegras</option><option>Rotas</option><option>No evaluado</option></select></div><div class="col-md-12"><label class="form-label fw-bold">Hallazgos relevantes</label><textarea id="obsHallazgos" rows="3" class="form-control"></textarea></div></div></div>
<div class="obs-panel"><div class="obs-panel-title"><i class="bi bi-shield-check"></i>Clasificación y seguimiento</div><div class="row g-3"><div class="col-md-4"><label class="form-label fw-bold">Riesgo obstétrico</label><select id="obsRiesgoObstetrico" class="form-select"><option value="">No clasificado</option><option>Bajo</option><option>Moderado</option><option>Alto</option><option>Muy alto</option></select></div><div class="col-md-4"><label class="form-label fw-bold">Próximo control</label><input id="obsProximoControl" type="date" class="form-control"></div><div class="col-md-12"><label class="form-label fw-bold">Observaciones</label><textarea id="obsObservaciones" rows="3" class="form-control"></textarea></div></div></div></div>`;$('obsBtnGuardar')?.addEventListener('click',guardar);$('obsBtnGuardarInferior')?.addEventListener('click',guardar);const rec=()=>{if(confirm('¿Descartar cambios no guardados y recuperar la última versión guardada?'))cargar(true)};$('obsBtnRecargar')?.addEventListener('click',rec);$('obsBtnRecargarInferior')?.addEventListener('click',rec);$('obsFum')?.addEventListener('change',calcularFum);actualizarEstado();return true}
function calcularFum(){const v=getValue('obsFum');if(!v)return;const f=new Date(`${v}T12:00:00`);if(Number.isNaN(f.getTime()))return;const p=new Date(f);p.setDate(p.getDate()+280);setValue('obsFpp',p.toISOString().slice(0,10));const h=new Date();h.setHours(12,0,0,0);const d=Math.floor((h-f)/86400000);if(d>=0&&d<=315){setValue('obsEgSemanas',Math.floor(d/7));setValue('obsEgDias',d%7)}}
function historiaLocal(c){const hs=[window.historiaActiva,window.historiaActual,window.currentHistoria,window.AURO_HISTORIA_ACTIVA].filter(Boolean);for(const h of hs)if((c.id_historia&&txt(h.id_historia||h.id)===c.id_historia)||(!c.id_historia&&c.id_paciente&&txt(h.id_paciente)===c.id_paciente))return h;for(const l of [window.historiasClinicas,window.historias,window.listaHistoriasClinicas,window.historiasData]){if(!Array.isArray(l))continue;const h=l.find(x=>(c.id_historia&&txt(x.id_historia||x.id)===c.id_historia)||(!c.id_historia&&c.id_paciente&&txt(x.id_paciente)===c.id_paciente));if(h)return h}return null}
/*
 * COMPATIBILIDAD DE DATOS HISTÓRICOS IASYN:
 * AUROSANAX_ANT_GINECO_OBS_V1:: se conserva solo como marcador de
 * serialización de antecedentes ya existentes. No es una conexión,
 * endpoint, Spreadsheet ID ni recurso activo de AUROSANAX PRUEBA.
 */
const ANT_GINECO_OBS_MARKER='AUROSANAX_ANT_GINECO_OBS_V1::';

function fechaHistoriaAntecedentes(h){
  const raw=h?.actualizado_en||h?.fecha_registro||h?.fecha_apertura||h?.creado_en||h?.fecha||'';
  const n=raw?new Date(raw).getTime():0;
  return Number.isFinite(n)?n:0
}

function historiaTieneAntecedentesObstetricos(h){
  return !!txt(
    h?.antecedentes_gineco_obstetricos_json||
    h?.antecedentes_obstetricos_json||
    h?.antecedentes_gineco_obstetricos||
    h?.antecedentes_obstetricos
  )
}

function buscarHistoriaAntecedentes(lista,c){
  if(!Array.isArray(lista)||!lista.length)return null;
  const idHistoria=txt(c?.id_historia),idPaciente=txt(c?.id_paciente);

  if(idHistoria){
    const exacta=lista.find(h=>txt(h?.id_historia||h?.id)===idHistoria);
    if(exacta)return exacta
  }

  if(!idPaciente)return null;

  return lista
    .filter(h=>txt(h?.id_paciente)===idPaciente)
    .sort((a,b)=>{
      const conDatos=Number(historiaTieneAntecedentesObstetricos(b))-Number(historiaTieneAntecedentesObstetricos(a));
      return conDatos||fechaHistoriaAntecedentes(b)-fechaHistoriaAntecedentes(a)
    })[0]||null
}

function leerHistoriasAntecedentesLocales(){
  const salida=[];
  for(const k of [
    'aurosanax_historias_clinicas_local_v1',
    'aurosanax_historias_clinicas',
    'historias_clinicas',
    'historiasClinicas'
  ]){
    try{
      const v=JSON.parse(localStorage.getItem(k)||'[]');
      if(Array.isArray(v))salida.push(...v);
      else if(Array.isArray(v?.data))salida.push(...v.data)
    }catch(_){}
  }
  return salida
}

async function resolverHistoriaAntecedentes(c){
  c=c||contextoActual();
  const idHistoria=txt(c?.id_historia);
  const idPaciente=txt(c?.id_paciente);

  /*
   * FASE 1 QUIRÚRGICA:
   * La tarjeta es SOLO LECTURA. No guarda ni modifica antecedentes.
   *
   * Antes, una copia global/local de la historia podía encontrarse primero
   * aunque estuviera desactualizada y sin antecedentes obstétricos; al
   * devolverla inmediatamente se impedía consultar la historia actualizada.
   *
   * Ahora se conserva un fallback, pero se sigue buscando hasta encontrar
   * la misma historia/paciente con antecedentes reales.
   */
  let fallback=null;

  const considerar=(lista)=>{
    const candidata=buscarHistoriaAntecedentes(lista,c);
    if(!candidata)return null;
    if(!fallback)fallback=candidata;
    return historiaTieneAntecedentesObstetricos(candidata)?candidata:null
  };

  const globales=[
    window.historiaActiva,
    window.historiaActual,
    window.currentHistoria,
    window.AURO_HISTORIA_ACTIVA
  ].filter(h=>h&&typeof h==='object');

  let h=considerar(globales);

  const listas=[
    window.historiasClinicas,
    window.historias,
    window.listaHistoriasClinicas,
    window.historiasData
  ];

  try{
    if(typeof historiasClinicas!=='undefined'&&Array.isArray(historiasClinicas)){
      listas.push(historiasClinicas)
    }
  }catch(_){}

  if(!h){
    for(const lista of listas){
      h=considerar(lista);
      if(h)break
    }
  }

  if(!h){
    h=considerar(leerHistoriasAntecedentesLocales());
  }

  /*
   * Si todavía no hay una historia con antecedentes reales, consultar
   * la fuente remota actual. Esto evita que un caché vacío bloquee la tarjeta.
   */
  if(!h&&typeof window.API_URL!=='undefined'&&txt(window.API_URL)){
    try{
      const r=await fetch(`${window.API_URL}?accion=listarHistoriasClinicas&_=${Date.now()}`);
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      const remotas=Array.isArray(d)?d:(Array.isArray(d?.data)?d.data:[]);
      const remota=buscarHistoriaAntecedentes(remotas,c);

      if(remota){
        /*
         * Seguridad cruzada: aceptar solo la historia/paciente solicitado.
         */
        const coincideHistoria=!idHistoria||txt(remota?.id_historia||remota?.id)===idHistoria;
        const coincidePaciente=!idPaciente||txt(remota?.id_paciente)===idPaciente;
        if(coincideHistoria&&coincidePaciente){
          h=remota;
          fallback=remota
        }
      }

      if(remotas.length)window.historiasClinicas=remotas
    }catch(e){
      console.warn(MODULO,'No se pudo consultar la historia para antecedentes obstétricos.',e)
    }
  }

  h=h||fallback;

  if(h){
    window.historiaActiva=h;
    window.historiaActual=h;
    window.currentHistoria=h;
    const id=txt(h.id_historia||h.id);
    if(id){
      window.idHistoriaActual=id;
      try{sessionStorage.setItem('aurosanax_id_historia_activa',id)}catch(_){}
    }
  }

  return h||{}
}

function parsearAntecedentesGinecoObstetricos(v){
  if(!v)return {};
  if(typeof v==='object')return v;

  const s=txt(v);
  if(!s)return {};

  if(s.startsWith(ANT_GINECO_OBS_MARKER)){
    return parseJSON(s.substring(ANT_GINECO_OBS_MARKER.length),{})
  }

  const directo=parseJSON(s,null);
  if(directo&&typeof directo==='object')return directo;

  const i=s.indexOf('{'),f=s.lastIndexOf('}');
  if(i>=0&&f>i)return parseJSON(s.substring(i,f+1),{});

  return {}
}

function valorAntecedenteObstetrico(v){
  if(v==null)return '';
  if(typeof v!=='object')return txt(v);
  return txt(
    v.detalle??
    v.valor??
    v.resultado??
    v.descripcion??
    v.observacion??
    v.observaciones??
    v.texto
  )
}

function obstetricoPorClave(lista,claves){
  if(!Array.isArray(lista))return {};
  const permitidas=claves.map(x=>txt(x).toLowerCase());
  return lista.find(item=>{
    const k=txt(item?.key||item?.clave||item?.nombre).toLowerCase();
    return permitidas.includes(k)
  })||{}
}

function antecedentesObstetricosDesdeHistoria(h){
  h=h||{};
  const raw=
    h.antecedentes_gineco_obstetricos_json||
    h.antecedentes_obstetricos_json||
    h.antecedentes_gineco_obstetricos||
    h.antecedentes_obstetricos||
    {};

  const data=parsearAntecedentesGinecoObstetricos(raw);
  const oObjeto=(!Array.isArray(data.obstetricos)&&(data.obstetricos||data.obstetricia))||
    (!Array.isArray(data.obstetricia)&&data.obstetricia)||
    {};
  const oLista=Array.isArray(data.obstetricos)
    ?data.obstetricos
    :(Array.isArray(data.obstetricia)?data.obstetricia:[]);

  const porClave=(...claves)=>valorAntecedenteObstetrico(obstetricoPorClave(oLista,claves));
  const leer=(...valores)=>{
    for(const v of valores){
      const r=valorAntecedenteObstetrico(v);
      if(r)return r
    }
    return ''
  };

  return{
    gestas:leer(oObjeto.gestas,oObjeto.gesta,oObjeto.Gesta,porClave('Gesta','Gestas'),h.gestas,h.gesta),
    partos:leer(oObjeto.partos,oObjeto.parto,oObjeto.Partos,porClave('Partos','Parto'),h.partos),
    cesareas:leer(oObjeto.cesareas,oObjeto.cesáreas,oObjeto.cesarea,oObjeto.Cesareas,porClave('Cesareas','Cesáreas','Cesarea','Cesárea'),h.cesareas),
    abortos:leer(oObjeto.abortos,oObjeto.aborto,oObjeto.Abortos,porClave('Abortos','Aborto'),h.abortos),
    ectopicos:leer(oObjeto.ectopicos,oObjeto.ectópicos,oObjeto.Ectopicos,porClave('Ectopicos','Ectópicos','Ectopico','Ectópico'),h.ectopicos),
    mortinatos:leer(
      oObjeto.mortinatos,oObjeto.hijos_muertos,oObjeto.hijosMuertos,oObjeto.HijosMuertos,
      porClave('Mortinatos','Mortinato','HijosMuertos','Hijos muertos'),h.mortinatos,h.hijos_muertos
    ),
    vivos:leer(
      oObjeto.hijos_vivos,oObjeto.hijosVivos,oObjeto.vivos,oObjeto.HijosVivos,
      porClave('HijosVivos','Hijos vivos','Vivos'),h.hijos_vivos
    ),
    complicaciones:leer(
      oObjeto.complicaciones_previas,oObjeto.complicaciones,oObjeto.otros,oObjeto.Otros,
      porClave('Complicaciones','ComplicacionesPrevias','Otros'),h.complicaciones_obstetricas
    )
  }
}

function limpiarTarjetaAntecedentesObstetricos(){
  [
    'obsAntGestas','obsAntPartos','obsAntCesareas','obsAntAbortos',
    'obsAntEctopicos','obsAntMortinatos','obsAntVivos','obsAntComplicaciones'
  ].forEach(id=>setText(id,''))
}

async function cargarAntecedentes(c){
  c=c||contextoActual();
  const seq=++cargaAntecedentesSeq;
  const idPaciente=txt(c?.id_paciente);
  const idAtencion=txt(c?.id_atencion);

  /*
   * Siempre limpiar antes de leer: jamás heredar datos visuales
   * de la paciente/atención anterior.
   */
  limpiarTarjetaAntecedentesObstetricos();

  if(!idPaciente)return;

  const h=await resolverHistoriaAntecedentes(c);

  /*
   * Protección anti-carrera: si durante el await cambió paciente,
   * atención o comenzó una carga más reciente, descartar esta respuesta.
   */
  if(seq!==cargaAntecedentesSeq)return;

  const actual=contextoActual();
  if(txt(actual?.id_paciente)!==idPaciente)return;
  if(idAtencion&&txt(actual?.id_atencion)!==idAtencion)return;

  const a=antecedentesObstetricosDesdeHistoria(h);

  setText('obsAntGestas',a.gestas);
  setText('obsAntPartos',a.partos);
  setText('obsAntCesareas',a.cesareas);
  setText('obsAntAbortos',a.abortos);
  setText('obsAntEctopicos',a.ectopicos);
  setText('obsAntMortinatos',a.mortinatos);
  setText('obsAntVivos',a.vivos);
  setText('obsAntComplicaciones',a.complicaciones)
}

/*
 * LIMPIEZA VISUAL EXCLUSIVA DE LA TARJETA DE PACIENTE EN OBSTETRICIA
 * La tarjeta genérica se conserva íntegra; únicamente se ocultan aquí
 * las acciones "Ver historia" y "WhatsApp" para evitar duplicación visual.
 * No modifica datos, navegación global ni otros módulos.
 */
function depurarAccionesTarjetaPacienteObstetricia(){
  const card=document.querySelector('#obstetricia .module-patient-card');
  if(!card)return;

  const ocultar=()=>{
    card.querySelectorAll('button,a,[role="button"]').forEach(el=>{
      const t=txt(el.textContent).toLowerCase();
      if(t==='ver historia'||t.includes('ver historia')||t==='whatsapp'||t.includes('whatsapp')){
        el.style.display='none';
        el.setAttribute('aria-hidden','true')
      }
    })
  };

  ocultar();

  if(!card.__auroObsAccionesObserver){
    const ob=new MutationObserver(ocultar);
    ob.observe(card,{childList:true,subtree:true});
    card.__auroObsAccionesObserver=ob
  }
}

function pintarContexto(c){setText('obsCtxPaciente',c.nombre_paciente||c.id_paciente);setText('obsCtxAtencion',c.id_atencion);setText('obsCtxConsulta',c.numero_consulta?`N.º ${c.numero_consulta}`:'');setText('obsCtxMedico',c.nombre_medico||c.id_medico);$('obsAlertaAtencion')?.classList.toggle('show',!c.id_atencion||!c.id_paciente);depurarAccionesTarjetaPacienteObstetricia()}
function fechaHora(v){if(!v)return'—';const f=new Date(v);return Number.isNaN(f.getTime())?txt(v):f.toLocaleString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function fechaHoraObstetriciaSegura(v){
  const s=txt(v);
  if(!s)return'—';

  /*
   * TIMESTAMP LOCAL SIN ZONA:
   * Los valores que regresan como "YYYY-MM-DD HH:mm:ss" representan
   * hora local del ERP. No se convierten otra vez a UTC/local.
   */
  const local=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(local){
    const hh=String(local[4]).padStart(2,'0');
    return `${local[3]}/${local[2]}/${local[1]}, ${hh}:${local[5]}`;
  }

  /*
   * ISO con zona explícita sí puede convertirse de forma segura.
   */
  if(/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)){
    const f=new Date(s);
    if(!Number.isNaN(f.getTime())){
      return f.toLocaleString('es-EC',{
        day:'2-digit',month:'2-digit',year:'numeric',
        hour:'2-digit',minute:'2-digit',hour12:false
      })
    }
  }

  return fechaHora(v)
}

function estadoVisualBotonGuardarObs(estado,texto=''){
  const bs=[$('obsBtnGuardar'),$('obsBtnGuardarInferior')].filter(Boolean);
  bs.forEach(b=>{
    b.classList.remove('obs-btn-saving','obs-btn-success','obs-btn-error');
    if(estado==='guardando'){
      b.disabled=true;b.classList.add('obs-btn-saving');
      b.innerHTML='<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Guardando Obstetricia…';
    }else if(estado==='exito'){
      b.disabled=true;b.classList.add('obs-btn-success');
      b.innerHTML='<i class="bi bi-check-circle-fill me-1"></i>'+(texto||'Obstetricia guardada ✓');
    }else if(estado==='error'){
      b.disabled=false;b.classList.add('obs-btn-error');
      b.innerHTML='<i class="bi bi-exclamation-triangle-fill me-1"></i>'+(texto||'Error · Reintentar');
    }
  })
}
function actualizarEstado(){
  const c=contextoActual(),
        existe=!!txt(registroActual?.id_obstetricia),
        texto=existe?'Actualizar Obstetricia':'Guardar Obstetricia',
        ico=existe?'bi-arrow-repeat':'bi-save';

  [$('obsBtnGuardar'),$('obsBtnGuardarInferior')].filter(Boolean).forEach(b=>{
    if(!guardando)b.innerHTML=`<i class="bi ${ico} me-1"></i>${texto}`
  });

  const q=c.numero_consulta?`Consulta N.º ${c.numero_consulta}`:'Consulta —',
        u=registroActual?.actualizado_en||registroActual?.creado_en||'',
        hora=fechaHoraObstetriciaSegura(u),
        html=existe
          ? `<span class="obs-record-dot"></span><span class="obs-record-main">${esc(q)} · Guardado en base</span>${u?`<br><span class="obs-record-time">Última actualización: ${esc(hora)}</span>`:''}`
          : `<span class="obs-record-main">${esc(q)} · Sin registro de Obstetricia</span>`;

  [$('obsEstadoRegistroSuperior'),$('obsEstadoRegistroInferior')].filter(Boolean).forEach(e=>{
    e.classList.toggle('obs-record-saved',existe);
    e.classList.toggle('obs-record-empty',!existe);
    e.innerHTML=html
  })
}
function embarazo(){return{embarazo_multiple:getValue('obsTipoEmbarazo')==='Múltiple',tipo_embarazo:getValue('obsTipoEmbarazo'),numero_fetos:getValue('obsNumeroFetos'),situacion_fetal:getValue('obsSituacionFetal'),presentacion_fetal:getValue('obsPresentacionFetal'),posicion_fetal:getValue('obsPosicionFetal')}}
function sintomas(){if(!obsTieneControlesSintomasPropios())return parseJSON(registroActual?.sintomas_obstetricos_json,{});return{sangrado_vaginal:obsGetValue('obsSintSangrado'),perdida_liquido:obsGetValue('obsSintPerdidaLiquido'),dolor_pelvico:obsGetValue('obsSintDolorPelvico'),contracciones:obsGetValue('obsSintContracciones'),cefalea:obsGetValue('obsSintCefalea'),fosfenos:obsGetValue('obsSintFosfenos'),tinnitus:obsGetValue('obsSintTinnitus'),epigastralgia:obsGetValue('obsSintEpigastralgia'),disuria:obsGetValue('obsSintDisuria'),otros:obsGetValue('obsSintOtros'),descripcion:obsGetValue('obsSintDescripcion')}}
function evaluacion(){return{movimientos_fetales:getValue('obsMovimientosFetales'),actividad_uterina:getValue('obsActividadUterina'),edema:getValue('obsEdema'),estado_membranas:getValue('obsEstadoMembranas'),hallazgos_relevantes:getValue('obsHallazgos')}}

/* ============================================================
   AUROSANAX OBSTETRICIA v1.0.4
   GUARDADO SOLO ANTE CAMBIO CLÍNICO REAL
   ------------------------------------------------------------
   - La carga/limpieza fija una firma base del formulario.
   - Solo input/change real del usuario marca edición.
   - Si se cambia y luego se vuelve al valor original: NO POST.
   - La firma excluye ids, timestamps y contexto automático.
   - No toca Anamnesis, Antecedentes ni otros módulos.
============================================================ */
function auroOrdenarValorObstetricia(valor){
  if(Array.isArray(valor))return valor.map(auroOrdenarValorObstetricia);
  if(valor&&typeof valor==='object'){
    return Object.keys(valor).sort().reduce((salida,clave)=>{
      salida[clave]=auroOrdenarValorObstetricia(valor[clave]);
      return salida
    },{})
  }
  return valor
}
function auroFirmaFormularioObstetricia(){
  return JSON.stringify(auroOrdenarValorObstetricia({
    tipo_atencion:getValue('obsTipoAtencion'),
    fum:getValue('obsFum'),
    fpp:getValue('obsFpp'),
    edad_gestacional_semanas:getValue('obsEgSemanas'),
    edad_gestacional_dias:getValue('obsEgDias'),
    altura_uterina:getValue('obsAlturaUterina'),
    frecuencia_cardiaca_fetal:getValue('obsFcf'),
    riesgo_obstetrico:getValue('obsRiesgoObstetrico'),
    proximo_control:getValue('obsProximoControl'),
    embarazo_actual_json:embarazo(),
    sintomas_obstetricos_json:sintomas(),
    evaluacion_obstetrica_json:evaluacion(),
    observaciones:getValue('obsObservaciones')
  }))
}
function auroFijarBaseObstetricia(){
  firmaBaseObstetricia=auroFirmaFormularioObstetricia();
  cambiosUsuarioObstetricia=false
}
function auroInstalarDetectorCambiosObstetricia(){
  const sec=$('obstetricia');
  if(!sec||sec.dataset.auroDetectorCambiosObstetricia==='true')return;
  sec.dataset.auroDetectorCambiosObstetricia='true';

  const marcar=evento=>{
    const e=evento?.target;
    if(!e||!e.matches('input,select,textarea'))return;
    if(e.disabled||e.readOnly)return;
    cambiosUsuarioObstetricia=true
  };

  sec.addEventListener('input',marcar);
  sec.addEventListener('change',marcar)
}
function construir(){const c=contextoActual(),e=registroActual||{};return{id_obstetricia:txt(e.id_obstetricia)||idTemporal(),id_atencion:c.id_atencion,numero_consulta:c.numero_consulta,id_paciente:c.id_paciente,nombre_paciente:c.nombre_paciente,id_historia:c.id_historia,id_medico:c.id_medico,nombre_medico:c.nombre_medico,fecha_atencion:c.fecha_atencion,hora_atencion:c.hora_atencion,tipo_atencion:getValue('obsTipoAtencion')||c.tipo_atencion,fum:getValue('obsFum'),fpp:getValue('obsFpp'),edad_gestacional_semanas:getValue('obsEgSemanas'),edad_gestacional_dias:getValue('obsEgDias'),altura_uterina:getValue('obsAlturaUterina'),frecuencia_cardiaca_fetal:getValue('obsFcf'),riesgo_obstetrico:getValue('obsRiesgoObstetrico'),proximo_control:getValue('obsProximoControl'),embarazo_actual_json:JSON.stringify(embarazo()),sintomas_obstetricos_json:JSON.stringify(sintomas()),evaluacion_obstetrica_json:JSON.stringify(evaluacion()),observaciones:getValue('obsObservaciones'),estado_registro:txt(e.estado_registro)||'Activo',creado_en:e.creado_en||now(),actualizado_en:now(),creado_por:txt(e.creado_por)||usuarioActual()}}
function limpiar(){registroActual=null;['obsFum','obsFpp','obsEgSemanas','obsEgDias','obsAlturaUterina','obsFcf','obsTipoEmbarazo','obsNumeroFetos','obsSituacionFetal','obsPresentacionFetal','obsPosicionFetal','obsMovimientosFetales','obsActividadUterina','obsEdema','obsEstadoMembranas','obsHallazgos','obsRiesgoObstetrico','obsProximoControl','obsObservaciones'].forEach(id=>setValue(id,''));['obsSintOtros','obsSintDescripcion'].forEach(id=>obsSetValue(id,''));['obsSintSangrado','obsSintPerdidaLiquido','obsSintDolorPelvico','obsSintContracciones','obsSintCefalea','obsSintFosfenos','obsSintTinnitus','obsSintEpigastralgia','obsSintDisuria'].forEach(id=>obsSetValue(id,false));setValue('obsTipoAtencion',contextoActual().tipo_atencion||'');auroFijarBaseObstetricia();actualizarEstado()}
function cargarRegistro(x){const r=normalizar(x);registroActual=r;setValue('obsTipoAtencion',r.tipo_atencion);setValue('obsFum',r.fum);setValue('obsFpp',r.fpp);setValue('obsEgSemanas',r.edad_gestacional_semanas);setValue('obsEgDias',r.edad_gestacional_dias);setValue('obsAlturaUterina',r.altura_uterina);setValue('obsFcf',r.frecuencia_cardiaca_fetal);setValue('obsRiesgoObstetrico',r.riesgo_obstetrico);setValue('obsProximoControl',r.proximo_control);const e=r.embarazo_actual_json||{};setValue('obsTipoEmbarazo',e.tipo_embarazo||(e.embarazo_multiple?'Múltiple':''));setValue('obsNumeroFetos',e.numero_fetos);setValue('obsSituacionFetal',e.situacion_fetal);setValue('obsPresentacionFetal',e.presentacion_fetal);setValue('obsPosicionFetal',e.posicion_fetal);const s=r.sintomas_obstetricos_json||{};for(const [id,k] of [['obsSintSangrado','sangrado_vaginal'],['obsSintPerdidaLiquido','perdida_liquido'],['obsSintDolorPelvico','dolor_pelvico'],['obsSintContracciones','contracciones'],['obsSintCefalea','cefalea'],['obsSintFosfenos','fosfenos'],['obsSintTinnitus','tinnitus'],['obsSintEpigastralgia','epigastralgia'],['obsSintDisuria','disuria']])obsSetValue(id,s[k]);obsSetValue('obsSintOtros',s.otros);obsSetValue('obsSintDescripcion',s.descripcion);const v=r.evaluacion_obstetrica_json||{};setValue('obsMovimientosFetales',v.movimientos_fetales);setValue('obsActividadUterina',v.actividad_uterina);setValue('obsEdema',v.edema);setValue('obsEstadoMembranas',v.estado_membranas);setValue('obsHallazgos',v.hallazgos_relevantes);setValue('obsObservaciones',r.observaciones);auroFijarBaseObstetricia();actualizarEstado()}
async function guardar(){
  if(guardando)return;

  const c=contextoActual(),err=[];
  if(!c.id_atencion)err.push('No existe atención activa.');
  if(!c.id_paciente)err.push('No existe paciente seleccionada.');
  if(err.length)return notificar(err.join(' '),'error');

  const firmaActual=auroFirmaFormularioObstetricia();

  /*
    CANDADO NO-OP:
    Sin edición del usuario, o si cambió y luego volvió exactamente al
    contenido cargado, no se construye payload, no se actualiza timestamp,
    no se toca localStorage y no se realiza POST.
  */
  if(!cambiosUsuarioObstetricia ||
     (firmaBaseObstetricia&&firmaActual===firmaBaseObstetricia)){
    cambiosUsuarioObstetricia=false;
    notificar('No hay cambios en Obstetricia. No se realizó ningún guardado.','info');
    actualizarEstado();
    return{success:true,omitido:true,sin_cambios:true,id_atencion:c.id_atencion}
  }

  const r=construir();
  guardando=true;
  estadoVisualBotonGuardarObs('guardando');

  try{
    const editar=!!txt(registroActual?.id_obstetricia);
    actualizarLocal(r);
    await enviarRemoto(r,editar);

    registroActual=normalizar(r);
    firmaBaseObstetricia=auroFirmaFormularioObstetricia();
    cambiosUsuarioObstetricia=false;

    notificar(
      editar
        ?'Los cambios de Obstetricia se guardaron correctamente en la base.'
        :'El registro de Obstetricia se guardó correctamente en la base.',
      'success'
    );
    estadoVisualBotonGuardarObs(
      'exito',
      editar?'Obstetricia actualizada ✓':'Obstetricia guardada ✓'
    );

    try{
      window.dispatchEvent(new CustomEvent('aurosanax:obstetricia-guardada',{
        detail:{
          id_atencion:txt(r.id_atencion),
          id_obstetricia:txt(r.id_obstetricia),
          actualizado_en:txt(registroActual?.actualizado_en)
        }
      }))
    }catch(_){}

    await new Promise(resolve=>setTimeout(resolve,1200));
    return{success:true,id_atencion:r.id_atencion,id_obstetricia:r.id_obstetricia}
  }catch(e){
    console.error(MODULO,e);
    notificar(`Guardado local. Falló sincronización: ${e.message}`,'error');
    estadoVisualBotonGuardarObs('error','Sincronización pendiente · Reintentar');
    await new Promise(resolve=>setTimeout(resolve,1800));
    return{success:false,error:e}
  }finally{
    guardando=false;
    [$('obsBtnGuardar'),$('obsBtnGuardarInferior')].filter(Boolean).forEach(b=>{
      b.disabled=false;
      b.classList.remove('obs-btn-saving','obs-btn-success','obs-btn-error')
    });
    actualizarEstado()
  }
}
async function cargar(forzar=false){if(cargando)return;cargando=true;try{const c=contextoActual();pintarContexto(c);await cargarAntecedentes(c);if(!c.id_atencion||!c.id_paciente){limpiar();ultimoIdAtencion='';return}if(!forzar&&ultimoIdAtencion===c.id_atencion&&registroActual)return;ultimoIdAtencion=c.id_atencion;let lista=[];try{const rem=(await listarRemotos()).map(normalizarRemotoObstetricia),m=new Map();leerLocales().forEach(r=>m.set(txt(r.id_obstetricia)||`ATN:${txt(r.id_atencion)}`,r));rem.forEach(r=>m.set(txt(r.id_obstetricia)||`ATN:${txt(r.id_atencion)}`,r));lista=Array.from(m.values());guardarLocales(lista)}catch(e){console.warn(MODULO,'Respaldo local',e);lista=leerLocales()}const e=lista.filter(r=>txt(r.id_atencion)===c.id_atencion).sort((a,b)=>txt(b.actualizado_en||b.creado_en).localeCompare(txt(a.actualizado_en||a.creado_en)));if(e[0]){cargarRegistro(e[0]);notificar('Registro obstétrico cargado.','info')}else{limpiar();setValue('obsTipoAtencion',c.tipo_atencion)}}finally{cargando=false}}
function interceptar(){const o=window.showScreen;if(typeof o!=='function'||o.__obsInterceptado)return;function w(id){const r=o.apply(this,arguments);if(id==='obstetricia')setTimeout(()=>cargar(true),60);return r}w.__obsInterceptado=true;window.showScreen=w}
function evento(ev){
  const d=normalizarDetalle(ev?.detail);
  const eventoPaciente=ev?.type==='aurosanax:paciente-seleccionado'||ev?.type==='aurosanax:historia-cargada';

  /*
   * Si el evento no trae atención, o corresponde a un cambio de
   * paciente/historia, invalidar primero el contexto obstétrico viejo.
   * Una atención válida podrá resolverse nuevamente en cargar(true).
   */
  contextoSeleccionado=(!eventoPaciente&&d)?atencionCompatibleConPaciente(d):null;

  try{
    if(contextoSeleccionado?.id_atencion){
      sessionStorage.setItem('aurosanax_id_atencion_seleccionada',contextoSeleccionado.id_atencion)
    }else{
      sessionStorage.removeItem('aurosanax_id_atencion_seleccionada')
    }
  }catch(_){}

  cargaAntecedentesSeq++;
  ultimoIdAtencion='';
  limpiarTarjetaAntecedentesObstetricos();
  limpiar();
  setTimeout(()=>cargar(true),80)
}
/*
 * COMPATIBILIDAD TEMPORAL IASYN:
 * Los eventos y claves aurosanax:* / aurosanax_* que aparecen debajo
 * siguen siendo contratos internos compartidos con index y otros módulos.
 * No deben renombrarse de forma aislada.
 */
function inicializar(){if(!renderizar())return;auroInstalarDetectorCambiosObstetricia();interceptar();['aurosanax:atencion-activa','aurosanax:atencion-seleccionada','aurosanax:atencion-iniciada','aurosanax:paciente-seleccionado','aurosanax:historia-cargada','aurosanax:atencion-limpiada','aurosanax:paciente-limpiado'].forEach(n=>window.addEventListener(n,evento));setInterval(()=>{const a=resolverAtencion(),id=txt(a?.id_atencion||a?.id);if(id!==ultimoIdAtencion){contextoSeleccionado=a||null;cargar(true)}},1500);cargar(true);console.info(`${MODULO} cargado. ${VERSION}`)}
window.AurosanaxObstetricia={version:VERSION,inicializar,cargar,guardar,limpiar,obtenerRegistroActual:()=>registroActual?{...registroActual}:null,obtenerContexto:contextoActual};window.inicializarObstetricia=inicializar;window.cargarObstetriciaPorAtencion=cargar;window.guardarObstetriciaERP=guardar;window.limpiarObstetriciaERP=limpiar;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inicializar);else inicializar();
})();
