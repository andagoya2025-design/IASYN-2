/* ============================================================================
 IASYN-2 / EIC | resultados.js | ADAPTACION V1.0.0
 ARCHIVO NUEVO. No sustituye documentos.js ni modifica datos existentes.
 Integracion prevista: cargar despues de documentos.js desde index.html.
 SEGURIDAD: Emision y WhatsApp BLOQUEADOS hasta validar el backend propio de EIC.
 No instalar en produccion antes de completar puente y backend.
 ============================================================================ */
(function () {
  'use strict';
  if (window.auroResultados) { console.warn('IASYN2 Resultados ya cargado'); return; }
  const VERSION = '1.0.0-IASYN2-PREINTEGRACION';
  const MAX_DOCS = 30;
  const CATEGORIAS = [
    ['LABORATORIO','Laboratorios'], ['ECOGRAFIA_IMAGEN','Ecografías e imágenes'],
    ['FOTOGRAFIA_CLINICA','Fotografías clínicas'], ['PATOLOGIA','Patología'], ['OTRO','Otros']
  ];
  const s = {contenedor:null, atencion:'', paciente:'', historia:'', registros:[], seleccion:new Set(),
    secuencia:0, cargando:false, dias:7, limite:5, aviso:'', mensaje:'', enlace:''};
  const txt = v => String(v == null ? '' : v).trim();
  const html = v => txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const docs = () => window.auroDocumentos || window.iasynDocumentos || null;
  const puente = () => docs()?.resultadosBridge || null;
  function contexto() { try {return docs()?.obtenerContexto?.() || null;} catch (_) {return null;} }
  function valido(c) {return !!(c && c.valido === true && !c.bloqueada && txt(c.id) && txt(c.idPaciente));}
  function reiniciarSiCambio() {
    const c = contexto(), a = valido(c) ? txt(c.id) : '', p = valido(c) ? txt(c.idPaciente) : '',
      h = valido(c) ? txt(c.idHistoria) : '';
    if (a !== s.atencion || p !== s.paciente || h !== s.historia) {
      s.secuencia++; s.atencion=a; s.paciente=p; s.historia=h;
      s.registros=[]; s.seleccion.clear(); s.enlace=''; s.mensaje=''; s.aviso='';
    }
    return c;
  }
  function formato(r) {
    const m = txt(r.mime_type).toLowerCase(), e = txt(r.extension || txt(r.nombre_documento).split('.').pop()).toLowerCase();
    return ({'application/pdf':'PDF','image/jpeg':'JPG','image/png':'PNG','image/webp':'WEBP',
      'image/heic':'HEIC','image/heif':'HEIF'})[m] || ({pdf:'PDF',jpg:'JPG',jpeg:'JPG',png:'PNG',webp:'WEBP',heic:'HEIC',heif:'HEIF'})[e] || '';
  }
  function categoria(r) {
    const c = txt(r.categoria_documento || r.tipo_documento).toUpperCase();
    if (CATEGORIAS.some(x=>x[0]===c)) return c;
    if (/LABOR/.test(c)) return 'LABORATORIO';
    if (/PATOLOG|BIOPS|HISTOPAT/.test(c)) return 'PATOLOGIA';
    if (/ECO|IMAGEN|RADIO/.test(c)) return 'ECOGRAFIA_IMAGEN';
    if (/FOTO/.test(c)) return 'FOTOGRAFIA_CLINICA';
    return 'OTRO';
  }
  function normalizar(lista,c) {
    const vistos = new Set();
    return lista.filter(r=>{
      const id=txt(r?.id_documento);
      if (!id || vistos.has(id) || !formato(r) || /anulad|eliminad|inactiv/i.test(txt(r.estado))) return false;
      if (txt(r.id_atencion) && txt(r.id_atencion)!==txt(c.id)) return false;
      if (txt(r.id_paciente) && txt(r.id_paciente)!==txt(c.idPaciente)) return false;
      vistos.add(id);return true;
    }).map(r=>({id_documento:txt(r.id_documento),nombre_documento:txt(r.nombre_documento)||'Documento clínico',
      categoria_documento:categoria(r),mime_type:txt(r.mime_type),extension:txt(r.extension),
      tamano_bytes:Number(r.tamano_bytes)||0}));
  }
  function snapshot(c) {
    const b=puente();
    if (!b || typeof b.obtenerSnapshot!=='function') return null;
    const v=b.obtenerSnapshot();
    if (!v?.listo || txt(v.id_atencion)!==txt(c.id) || txt(v.id_paciente)!==txt(c.idPaciente)) return null;
    return Array.isArray(v.documentos)?v.documentos:null;
  }
  async function cargar() {
    const c=reiniciarSiCambio();
    if (!valido(c)) {s.aviso='Seleccione una atención clínica válida.';render();return [];}
    const sec=++s.secuencia, a=txt(c.id), p=txt(c.idPaciente), h=txt(c.idHistoria);
    s.cargando=true;s.aviso='Consultando documentos de la atención activa...';render();
    try {
      let lista=snapshot(c);
      if (!lista) {
        if (typeof docs()?.cargar!=='function') throw new Error('Módulo Documentos no disponible.');
        await docs().cargar();
        if (sec!==s.secuencia) return [];
        const actual=reiniciarSiCambio();
        if (!valido(actual)||txt(actual.id)!==a||txt(actual.idPaciente)!==p||txt(actual.idHistoria)!==h) return [];
        lista=snapshot(actual);
      }
      if (!lista) throw new Error('Falta el puente resultadosBridge en documentos.js de IASYN-2.');
      if (sec!==s.secuencia) return [];
      s.registros=normalizar(lista,c);
      const ids=new Set(s.registros.map(r=>r.id_documento));
      for(const id of s.seleccion) if(!ids.has(id)) s.seleccion.delete(id);
      s.aviso=s.registros.length+' archivo(s) disponibles. Emisión deshabilitada hasta validar el backend de EIC.';
      return s.registros.map(r=>({...r}));
    } catch(e) {
      if(sec===s.secuencia) {s.registros=[];s.seleccion.clear();s.aviso=txt(e.message||e);}
      return [];
    } finally {if(sec===s.secuencia){s.cargando=false;render();}}
  }
  function seleccionActual(){const c=reiniciarSiCambio();return valido(c)?s.registros.filter(r=>s.seleccion.has(r.id_documento)).map(r=>r.id_documento):[];}
  function mensajePredeterminado(){return 'AUROSANAX MEDIC | Resultados médicos\n\nSus resultados estarán disponibles mediante un enlace privado una vez habilitado el servicio.\n\n[ENLACE PENDIENTE DE HABILITACIÓN]\n\nPor privacidad, no comparta el enlace con terceros.';}
  function emitirEnlace(){s.aviso='FUNCIÓN BLOQUEADA: falta implementar y validar la emisión segura en Apps Script de EIC.';render();return false;}
  function abrirWhatsAppResultados(){s.aviso='ENVÍO BLOQUEADO: no existe un enlace privado validado por el backend de EIC.';render();return false;}
  function render(){
    const el=s.contenedor;if(!el)return;
    const c=reiniciarSiCambio(),ok=valido(c);
    const grupos=CATEGORIAS.map(([id,nombre])=>{
      const items=s.registros.filter(r=>r.categoria_documento===id);
      if(!items.length)return '';
      return '<fieldset style="margin:12px 0;padding:10px;border:1px solid #e9d6e1;border-radius:8px"><legend>'+html(nombre)+'</legend>'+items.map(r=>
        '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" data-resultado-id="'+html(r.id_documento)+'" '+(s.seleccion.has(r.id_documento)?'checked':'')+'><span>'+html(r.nombre_documento)+' <small>('+html(formato(r))+')</small></span></label>'
      ).join('')+'</fieldset>';
    }).join('');
    el.innerHTML='<section style="background:#fff;border:1px solid #e8dce4;border-radius:12px;padding:16px;color:#49424a">'+
      '<h3 style="margin:0 0 6px;color:#a53576">Entrega segura de resultados · IASYN-2</h3>'+
      '<p style="margin:0 0 12px">Seleccione los documentos de una misma atención. La emisión está bloqueada hasta integrar el backend.</p>'+
      '<p><strong>Atención:</strong> '+html(ok?c.id:'No seleccionada')+' · <strong>Paciente ID:</strong> '+html(ok?c.idPaciente:'—')+'</p>'+
      '<button type="button" data-resultado-actualizar '+(!ok||s.cargando?'disabled':'')+'>Actualizar documentos</button> '+
      '<button type="button" data-resultado-todos '+(!s.registros.length?'disabled':'')+'>Seleccionar hasta 30</button> '+
      '<button type="button" data-resultado-limpiar '+(!s.seleccion.size?'disabled':'')+'>Limpiar</button>'+
      (grupos||'<p>No hay documentos disponibles para mostrar.</p>')+
      '<p>'+s.seleccion.size+' de '+s.registros.length+' documentos seleccionados (máximo '+MAX_DOCS+').</p>'+
      '<label>Vigencia (días): <input type="number" data-resultado-dias min="1" max="30" value="'+s.dias+'" style="width:65px"></label> '+
      '<label>Máximo de accesos: <input type="number" data-resultado-limite min="1" max="20" value="'+s.limite+'" style="width:65px"></label>'+
      '<p><textarea data-resultado-mensaje rows="5" style="width:100%">'+html(s.mensaje||mensajePredeterminado())+'</textarea></p>'+
      '<button type="button" data-resultado-emitir disabled title="Pendiente backend EIC">Generar enlace privado (pendiente)</button> '+
      '<button type="button" data-resultado-whatsapp disabled>Enviar por WhatsApp (pendiente)</button>'+
      '<p role="status" style="font-size:13px">'+html(s.aviso||'Módulo preparado para integración; no se han emitido enlaces.')+'</p></section>';
  }
  function eventos(el){
    el.addEventListener('click',e=>{
      if(e.target.closest('[data-resultado-actualizar]'))return void cargar();
      if(e.target.closest('[data-resultado-todos]')){s.registros.slice(0,MAX_DOCS).forEach(r=>s.seleccion.add(r.id_documento));render();return;}
      if(e.target.closest('[data-resultado-limpiar]')){s.seleccion.clear();render();return;}
      if(e.target.closest('[data-resultado-emitir]'))return void emitirEnlace();
      if(e.target.closest('[data-resultado-whatsapp]'))return void abrirWhatsAppResultados();
    });
    el.addEventListener('change',e=>{
      const input=e.target.closest('[data-resultado-id]');
      if(input){const id=txt(input.dataset.resultadoId);if(!s.registros.some(r=>r.id_documento===id))return;
        if(input.checked&&s.seleccion.size>=MAX_DOCS){s.aviso='Máximo 30 documentos.';render();return;}
        input.checked?s.seleccion.add(id):s.seleccion.delete(id);render();return;}
      if(e.target.matches('[data-resultado-dias]')){s.dias=Math.max(1,Math.min(30,parseInt(e.target.value,10)||7));render();}
      if(e.target.matches('[data-resultado-limite]')){s.limite=Math.max(1,Math.min(20,parseInt(e.target.value,10)||5));render();}
    });
    el.addEventListener('input',e=>{if(e.target.matches('[data-resultado-mensaje]'))s.mensaje=e.target.value;});
  }
  function inicializar(opciones={}){
    const id=txt(opciones.contenedor)||'auroResultadosMount';
    const el=document.getElementById(id)||puente()?.asegurarContenedor?.();
    if(!el)return {version:VERSION,listo:false,motivo:'No existe contenedor de Resultados.'};
    if(s.contenedor!==el){s.contenedor=el;eventos(el);}
    render();cargar();return {version:VERSION,listo:true,emisionHabilitada:false};
  }
  function limpiar(){s.secuencia++;s.atencion='';s.paciente='';s.historia='';s.registros=[];s.seleccion.clear();s.enlace='';s.mensaje='';s.aviso='';render();}
  function iniciar(){if(document.getElementById('auroResultadosMount')||puente()?.asegurarContenedor){inicializar();}}
  window.addEventListener('aurosanax:documentos-actualizados',()=>{if(s.contenedor)cargar();});
  ['aurosanax:atencion-cambiada','aurosanax:atencion-seleccionada','aurosanax:atencion-actualizada',
   'aurosanax:atencion-limpiada','aurosanax:paciente-cambiado','aurosanax:paciente-seleccionado',
   'aurosanax:historia-nueva'].forEach(n=>window.addEventListener(n,()=>{reiniciarSiCambio();if(s.contenedor)cargar();}));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
  window.auroResultados=Object.freeze({version:VERSION,inicializar,cargar,limpiar,seleccionActual,
    emitirEnlace,abrirWhatsAppResultados,estado:()=>({id_atencion:s.atencion,id_paciente:s.paciente,
      documentos:s.registros.length,seleccionados:s.seleccion.size,emisionHabilitada:false})});
})();
