/* ============================================================================
 IASYN-2 / EIC | resultados.js | ADAPTACION COMPLETA V2.0.0
 ARCHIVO NUEVO. No sustituye documentos.js ni modifica datos existentes.
 Integracion prevista: cargar despues de documentos.js desde index.html.
 SEGURIDAD: Emision habilitable SOLO con backend EIC y portal verificados.
 No instalar en produccion antes de completar puente y backend.
 ============================================================================ */
(function () {
  'use strict';
  if (window.auroResultados) { console.warn('IASYN2 Resultados ya cargado'); return; }
  const VERSION = '2.0.0-IASYN2-INTEGRACION-CONTROLADA';
  // Configurar SOLO cuando el backend EIC y resultados.html estén desplegados.
  // No usar endpoints ni tokens de Aurosanax Prueba.
  const CONFIG = Object.freeze({
    endpoint: '',                 // Ej.: URL /exec del Apps Script PROPIO de EIC
    portal: '',                   // Ej.: https://DOMINIO-EIC/resultados.html
    accion: 'auroEntregaGenerarResultados',
    emisionHabilitada: false,     // Cambiar solo tras probar permisos y backend EIC
    maxDocumentos: 30,
    maxDias: 30,
    maxAccesos: 20
  });
  const MAX_DOCS = 30;
  const CATEGORIAS = [
    ['LABORATORIO','Laboratorios'], ['ECOGRAFIA_IMAGEN','Ecografías e imágenes'],
    ['FOTOGRAFIA_CLINICA','Fotografías clínicas'], ['PATOLOGIA','Patología'], ['OTRO','Otros']
  ];
  const s = {contenedor:null, atencion:'', paciente:'', historia:'', registros:[], seleccion:new Set(),
    secuencia:0, cargando:false, emitiendo:false, dias:7, limite:5,
    aviso:'', mensaje:'', enlace:'', ultimoToken:'', montado:false};
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
      for(const id of s.seleccion) if(!ids.has(id)){s.seleccion.delete(id);invalidarEnlace();}
      s.aviso=s.registros.length+' archivo(s) disponibles. '+(configuracionLista()?'Puede preparar la entrega.':'Emisión pendiente de validación del backend EIC.');
      return s.registros.map(r=>({...r}));
    } catch(e) {
      if(sec===s.secuencia) {s.registros=[];s.seleccion.clear();s.aviso=txt(e.message||e);}
      return [];
    } finally {if(sec===s.secuencia){s.cargando=false;render();}}
  }
  function seleccionActual(){const c=reiniciarSiCambio();return valido(c)?s.registros.filter(r=>s.seleccion.has(r.id_documento)).map(r=>r.id_documento):[];}
  function pacienteVinculado(c) {
    const id = txt(c?.idPaciente);
    if (!valido(c)) return null;
    const listas = [];
    if (Array.isArray(window.patients)) listas.push(window.patients);
    for (const lista of listas) {
      const p = lista.find(x => txt(x?.id_paciente || x?.id) === id);
      if (p) return p;
    }
    return null;
  }
  function nombrePaciente(c) {
    const p = pacienteVinculado(c);
    if (p) {
      const n = txt(p.nombres || p.primer_nombre);
      const a = txt(p.apellidos || p.apellido);
      return (n && a ? n + ' ' + a : txt(p.nombre_completo || p.nombre || n || a));
    }
    return txt(c?.atencion?.nombre_paciente || c?.atencion?.paciente_nombre);
  }
  function telefonoPaciente(c) {
    const p = pacienteVinculado(c);
    return txt(p?.telefono || p?.whatsapp || p?.celular || p?.telefono_paciente);
  }
  function nombreCentro() {
    const cfg = window.auroConfiguracionCentro;
    return txt(cfg?.nombre_clinica || cfg?.nombre_centro || cfg?.nombre_comercial) || 'AUROSANAX MEDIC';
  }
  function mensajePredeterminado() {
    const nombre = nombrePaciente(contexto());
    const saludo = nombre ? 'Estimada/o ' + nombre + ':' : 'Estimado/a paciente:';
    return '🌸 *' + nombreCentro() + ' | Resultados médicos*\\n\\n' +
      saludo + '\\n\\nSus resultados médicos están disponibles mediante un enlace privado.\\n\\n' +
      '🔐 *Acceso a resultados*\\n🔗 ' + (s.enlace || '[PENDIENTE DE GENERACIÓN]') +
      '\\n\\n⏳ Vigencia: ' + s.dias + ' día(s).\\n🔢 Máximo de accesos: ' + s.limite +
      '.\\n\\nPor privacidad, no comparta este enlace con terceros.';
  }
  function invalidarEnlace() {
    const anterior = s.enlace;
    if (!anterior) return;
    s.enlace = ''; s.ultimoToken = '';
    if (s.mensaje) s.mensaje = s.mensaje.split(anterior).join('[PENDIENTE DE GENERACIÓN]');
    s.aviso = 'Cambió la entrega. Genere un enlace nuevo antes de enviarlo.';
  }
  function endpointEIC() {
    const raw = txt(CONFIG.endpoint);
    let u;
    try { u = new URL(raw); } catch (_) { throw new Error('Configure el endpoint exclusivo de EIC.'); }
    if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' ||
        !/^\/macros\/s\/[^/]+\/exec$/.test(u.pathname) || u.search || u.hash)
      throw new Error('El endpoint de EIC debe ser un Apps Script HTTPS /exec válido.');
    return u.href;
  }
  function portalEIC() {
    let u;
    try { u = new URL(txt(CONFIG.portal)); } catch (_) { throw new Error('Configure el portal resultados.html exclusivo de EIC.'); }
    if (u.protocol !== 'https:' || !/\/resultados\\.html$/.test(u.pathname) ||
        u.username || u.password || u.search || u.hash)
      throw new Error('El portal EIC debe ser HTTPS y terminar en resultados.html.');
    return u;
  }
  function tokenAdministrador() {
    const t = txt(sessionStorage.getItem('aurosanax_seguridad_token'));
    const exp = Number(sessionStorage.getItem('aurosanax_seguridad_expira_en') || 0);
    if (!t || (exp && Date.now() >= exp)) throw new Error('Sesión vencida. Inicie sesión nuevamente.');
    return t;
  }
  function validarEnlaceServidor(enlace) {
    let u;
    try { u = new URL(txt(enlace)); } catch (_) { throw new Error('Enlace inválido del servidor.'); }
    if (u.protocol !== 'https:') throw new Error('El enlace no utiliza HTTPS.');
    const portal = portalEIC();
    const token = u.searchParams.get('token') || '';
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token))
      throw new Error('El servidor no devolvió un token de acceso válido.');
    const esPortal = u.origin === portal.origin && u.pathname === portal.pathname;
    const esBackend = u.hostname === 'script.google.com' &&
      /^\/macros\/s\/[^/]+\/exec$/.test(u.pathname) &&
      u.searchParams.get('portal') === 'resultados' &&
      u.origin + u.pathname === new URL(endpointEIC()).origin + new URL(endpointEIC()).pathname;
    if (!esPortal && !esBackend) throw new Error('El servidor devolvió un enlace de otro sistema.');
    return portal.href + '?token=' + encodeURIComponent(token);
  }
  function configuracionLista() {
    return CONFIG.emisionHabilitada === true && !!CONFIG.endpoint && !!CONFIG.portal;
  }
  async function emitirEnlace() {
    if (s.emitiendo) return false;
    const c = reiniciarSiCambio();
    if (!valido(c)) {s.aviso='Seleccione una atención clínica válida.';render();return false;}
    const ids = seleccionActual();
    if (!ids.length || ids.length > MAX_DOCS) {
      s.aviso='Seleccione entre 1 y 30 documentos válidos.';render();return false;
    }
    if (!configuracionLista()) {
      s.aviso='Emisión bloqueada: falta configurar y validar backend y portal de EIC.';
      render(); return false;
    }
    let endpoint, session;
    try {endpoint=endpointEIC();portalEIC();session=tokenAdministrador();}
    catch (e) {s.aviso=txt(e.message);render();return false;}
    const identidad = [txt(c.id),txt(c.idPaciente),txt(c.idHistoria)].join('|');
    const huella = ids.join('\\u001f'), dias=s.dias, limite=s.limite;
    s.emitiendo=true; invalidarEnlace();s.aviso='Generando enlace privado...';render();
    try {
      const resp=await fetch(endpoint,{
        method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({accion:CONFIG.accion,data:{
          session_token:session,id_atencion:txt(c.id),id_paciente:txt(c.idPaciente),
          ids_documentos:ids,dias_vigencia:dias,limite_accesos:limite
        }}),credentials:'omit',cache:'no-store',redirect:'follow'
      });
      if(!resp.ok)throw new Error('Error HTTP '+resp.status);
      const data=await resp.json();
      if(data?.success!==true)throw new Error(txt(data?.message)||'Emisión no confirmada.');
      const enlace=validarEnlaceServidor(data.enlace);
      const actual=reiniciarSiCambio();
      if(!valido(actual)||[txt(actual.id),txt(actual.idPaciente),txt(actual.idHistoria)].join('|')!==identidad||
         seleccionActual().join('\\u001f')!==huella||s.dias!==dias||s.limite!==limite) {
        s.aviso='Se emitió un enlace, pero cambió la atención o selección. No se mostrará.';
        return false;
      }
      s.enlace=enlace;
      s.mensaje=(s.mensaje||mensajePredeterminado()).replace(
        /\\[PENDIENTE DE GENERACIÓN\\]/g,enlace);
      if(!s.mensaje.includes(enlace))s.mensaje=mensajePredeterminado();
      s.aviso='Enlace privado emitido. Vencimiento: '+txt(data.vence_en||'según servidor');
      return true;
    } catch(e) {
      s.aviso='No se pudo emitir: '+txt(e.message||e);
      return false;
    } finally {s.emitiendo=false;render();}
  }
  function abrirWhatsAppResultados() {
    const c=reiniciarSiCambio();
    if(!valido(c)||!s.enlace||s.emitiendo) {
      s.aviso='Primero genere un enlace privado válido.';render();return false;
    }
    const telefono=telefonoPaciente(c);
    if(!telefono){s.aviso='El paciente no tiene teléfono registrado.';render();return false;}
    const mensaje=s.mensaje||mensajePredeterminado();
    if(!mensaje.includes(s.enlace)){s.aviso='El mensaje no incluye el enlace actual.';render();return false;}
    if(typeof window.abrirWhatsApp!=='function'){
      s.aviso='No se encontró la función WhatsApp del ERP.';render();return false;
    }
    window.abrirWhatsApp(telefono,mensaje);
    return true;
  }
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
      '<p style="margin:0 0 12px">Seleccione los documentos de una misma atención. La emisión exige autorización del backend exclusivo de EIC.</p>'+
      '<p><strong>Atención:</strong> '+html(ok?c.id:'No seleccionada')+' · <strong>Paciente:</strong> '+html(nombrePaciente(c)||'—')+'</p>'+
      '<button type="button" data-resultado-actualizar '+(!ok||s.cargando?'disabled':'')+'>Actualizar documentos</button> '+
      '<button type="button" data-resultado-todos '+(!s.registros.length?'disabled':'')+'>Seleccionar hasta 30</button> '+
      '<button type="button" data-resultado-limpiar '+(!s.seleccion.size?'disabled':'')+'>Limpiar</button>'+
      (grupos||'<p>No hay documentos disponibles para mostrar.</p>')+
      '<p>'+s.seleccion.size+' de '+s.registros.length+' documentos seleccionados (máximo '+MAX_DOCS+').</p>'+
      '<label>Vigencia (días): <input type="number" data-resultado-dias min="1" max="30" value="'+s.dias+'" style="width:65px"></label> '+
      '<label>Máximo de accesos: <input type="number" data-resultado-limite min="1" max="20" value="'+s.limite+'" style="width:65px"></label>'+
      '<p><textarea data-resultado-mensaje rows="5" style="width:100%">'+html(s.mensaje||mensajePredeterminado())+'</textarea></p>'+
      '<button type="button" data-resultado-emitir '+(!configuracionLista()||!ok||s.emitiendo||!s.seleccion.size?'disabled':'')+'>Generar enlace privado</button> '+
      '<button type="button" data-resultado-whatsapp '+(!s.enlace||s.emitiendo?'disabled':'')+'>Enviar por WhatsApp</button>'+
      (s.enlace?'<p><label>Enlace autorizado: <input readonly style="width:100%" value="'+html(s.enlace)+'"></label></p>':'')+
      '<p role="status" style="font-size:13px">'+html(s.aviso||'Módulo preparado para integración; no se han emitido enlaces.')+'</p></section>';
  }
  function eventos(el){
    el.addEventListener('click',e=>{
      if(e.target.closest('[data-resultado-actualizar]'))return void cargar();
      if(e.target.closest('[data-resultado-todos]')){if(s.registros.slice(0,MAX_DOCS).some(r=>!s.seleccion.has(r.id_documento)))invalidarEnlace();s.registros.slice(0,MAX_DOCS).forEach(r=>s.seleccion.add(r.id_documento));render();return;}
      if(e.target.closest('[data-resultado-limpiar]')){invalidarEnlace();s.seleccion.clear();render();return;}
      if(e.target.closest('[data-resultado-emitir]'))return void emitirEnlace();
      if(e.target.closest('[data-resultado-whatsapp]'))return void abrirWhatsAppResultados();
    });
    el.addEventListener('change',e=>{
      const input=e.target.closest('[data-resultado-id]');
      if(input){const id=txt(input.dataset.resultadoId);if(!s.registros.some(r=>r.id_documento===id))return;
        if(input.checked&&s.seleccion.size>=MAX_DOCS){s.aviso='Máximo 30 documentos.';render();return;}
        invalidarEnlace();input.checked?s.seleccion.add(id):s.seleccion.delete(id);render();return;}
      if(e.target.matches('[data-resultado-dias]')){const nuevo=Math.max(1,Math.min(30,parseInt(e.target.value,10)||7));if(nuevo!==s.dias){invalidarEnlace();s.mensaje='';}s.dias=nuevo;render();}
      if(e.target.matches('[data-resultado-limite]')){const nuevo=Math.max(1,Math.min(20,parseInt(e.target.value,10)||5));if(nuevo!==s.limite){invalidarEnlace();s.mensaje='';}s.limite=nuevo;render();}
    });
    el.addEventListener('input',e=>{if(e.target.matches('[data-resultado-mensaje]'))s.mensaje=e.target.value;});
  }
  function inicializar(opciones={}){
    const id=txt(opciones.contenedor)||'auroResultadosMount';
    const el=document.getElementById(id)||puente()?.asegurarContenedor?.();
    if(!el)return {version:VERSION,listo:false,motivo:'No existe contenedor de Resultados.'};
    if(s.contenedor!==el){s.contenedor=el;eventos(el);}
    render();cargar();return {version:VERSION,listo:true,emisionHabilitada:configuracionLista()};
  }
  function limpiar(){s.secuencia++;s.atencion='';s.paciente='';s.historia='';s.registros=[];s.seleccion.clear();s.enlace='';s.mensaje='';s.aviso='';render();}
  function iniciar(){
    if(document.getElementById('auroResultadosMount')||puente()?.asegurarContenedor){
      inicializar();
    }
  }
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('.clinical-tabs button');
    if(b?.getAttribute('onclick')?.includes('hc_docs'))setTimeout(iniciar,130);
  });
  window.addEventListener('aurosanax:documentos-actualizados',()=>{if(s.contenedor)cargar();});
  ['aurosanax:atencion-cambiada','aurosanax:atencion-seleccionada','aurosanax:atencion-actualizada',
   'aurosanax:atencion-limpiada','aurosanax:paciente-cambiado','aurosanax:paciente-seleccionado',
   'aurosanax:historia-nueva'].forEach(n=>window.addEventListener(n,()=>{reiniciarSiCambio();if(s.contenedor)cargar();}));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
  window.auroResultados=Object.freeze({version:VERSION,inicializar,cargar,limpiar,seleccionActual,
    emitirEnlace,abrirWhatsAppResultados,estado:()=>({id_atencion:s.atencion,id_paciente:s.paciente,
      documentos:s.registros.length,seleccionados:s.seleccion.size,emisionHabilitada:configuracionLista(),enlaceEmitido:!!s.enlace})});
})();
