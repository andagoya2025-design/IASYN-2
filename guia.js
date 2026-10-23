// PRELIMINAR: no instalar sin revisar index.html y pacientes.js vigentes de IASYN2.
// Eventos aurosanax:* conservados por compatibilidad; no renombrar emisores.
/*
======================================================================
IASYN2 / EIC — guia.js (adaptación preliminar)
ASISTENTE CONTEXTUAL PREMIUM DEL ERP
Adaptación V1 basada en archivo donante con VERSION 1.3.7; no equivale a donante 1.3.9
======================================================================

CONTRATO ANTIRREGRESIVO
- Presentación y capacitación únicamente.
- NO guarda datos clínicos.
- NO crea pacientes, historias, citas ni atenciones.
- NO modifica IDs clínicos.
- NO realiza fetch, POST, consultas ni persistencia clínica.
- Solo conserva posición y activación visual en localStorage.
- NO firma, NO finaliza atenciones y NO dispara botones propietarios.
- Los módulos informan hechos ya confirmados; la guía solo orienta.
- Si este archivo falla o no carga, el ERP conserva su flujo propietario.
- Todo el CSS está encapsulado en iasyn-guia-*.
======================================================================
*/
(function iasynGuiaBootstrap(window, document){
  'use strict';

  if(!window || !document) return;
  if(window.IASYNGuia && window.IASYNGuia.__iasynGuiaMotor === true) return;

  const VERSION='IASYN2-ADAPTACION-V1-DONANTE-1.3.7';
  const STYLE_ID='iasynGuiaStyles';
  const HOST_ID='iasynGuiaFloatingHost';
  const mounts=new Map();
  let activo='';
  let posicionUsuario=null;
  const PREF_KEY='iasyn2_guia_preferencias_v1';
  let preferencias=cargarPreferencias();

  function cargarPreferencias(){
    try{
      const raw=window.localStorage.getItem(PREF_KEY);
      const p=raw?JSON.parse(raw):{};
      return {
        activa:p.activa!==false,
        x:Number.isFinite(Number(p.x))?Number(p.x):null,
        y:Number.isFinite(Number(p.y))?Number(p.y):null
      };
    }catch(_e){ return {activa:true,x:null,y:null}; }
  }

  function guardarPreferencias(){
    try{
      window.localStorage.setItem(PREF_KEY,JSON.stringify({
        activa:preferencias.activa!==false,
        x:Number.isFinite(preferencias.x)?preferencias.x:null,
        y:Number.isFinite(preferencias.y)?preferencias.y:null
      }));
    }catch(_e){}
  }

  function texto(v,f){ const t=String(v==null?'':v).trim(); return t || String(f||'').trim(); }
  function tipo(v){ const t=String(v||'info').trim().toLowerCase(); return ['info','ok','warning','neutral'].includes(t)?t:'info'; }
  function esMovil(){ return window.matchMedia('(max-width:700px)').matches; }

  function normalizar(c){
    c=c&&typeof c==='object'?c:{};
    return {
      tipo:tipo(c.tipo), titulo:texto(c.titulo,'Asistente IASYN2'),
      resumen:texto(c.resumen,''), detalle:texto(c.detalle,''), siguiente:texto(c.siguiente,''),
      expandible:c.expandible!==false, expandida:c.expandida===true, ocultable:c.ocultable!==false,
      etiquetaAbrir:texto(c.etiquetaAbrir,'Más información'), etiquetaCerrar:texto(c.etiquetaCerrar,'Ver menos')
    };
  }

  function inyectarEstilos(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #${HOST_ID}{
        position:fixed;top:150px;right:18px;z-index:2147482000;
        width:min(340px,calc(100vw - 36px));pointer-events:none;font:inherit;
        max-height:calc(100vh - 168px);
      }
      .iasyn-guia-card,.iasyn-guia-launcher{box-sizing:border-box;font:inherit}
      .iasyn-guia-card{
        pointer-events:auto;width:100%;color:#172033;
        background:linear-gradient(145deg,#fff 0%,#fff7fd 100%);
        border:1px solid rgba(217,70,239,.34);border-radius:18px;
        box-shadow:0 18px 55px rgba(76,29,149,.20),0 5px 18px rgba(162,28,175,.13);
        overflow:hidden;animation:iasynGuiaEntrada .22s ease-out
      }
      .iasyn-guia-card[data-tipo="ok"]{border-color:rgba(16,185,129,.48)}
      .iasyn-guia-card[data-tipo="warning"]{border-color:rgba(245,158,11,.55)}
      .iasyn-guia-top{
        display:flex;align-items:flex-start;gap:9px;cursor:grab;touch-action:none;
        user-select:none;-webkit-user-select:none;padding:12px 12px 10px;
        background:linear-gradient(120deg,rgba(192,38,211,.13),rgba(236,72,153,.08))
      }
      .iasyn-guia-icon{
        width:32px;height:32px;flex:0 0 32px;border-radius:10px;display:grid;place-items:center;
        background:linear-gradient(135deg,#c026d3,#ec4899);color:#fff;font-weight:900;
        box-shadow:0 7px 18px rgba(192,38,211,.28)
      }
      .iasyn-guia-card[data-tipo="ok"] .iasyn-guia-icon{background:linear-gradient(135deg,#059669,#10b981)}
      .iasyn-guia-copy{min-width:0;flex:1}
      .iasyn-guia-brand{font-size:10.5px;font-weight:900;letter-spacing:.055em;text-transform:uppercase;color:#9d174d}
      .iasyn-guia-title{margin:2px 0 0;font-size:15px;font-weight:850;line-height:1.2;color:#3b174f}
      .iasyn-guia-close{
        pointer-events:auto;appearance:none;border:0;background:rgba(255,255,255,.82);color:#6b7280;
        width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:19px;line-height:1;
        display:grid;place-items:center
      }
      .iasyn-guia-close:hover{background:#fff;color:#831843}
      .iasyn-guia-top:active{cursor:grabbing}
      .iasyn-guia-body{padding:11px 12px 12px}
      .iasyn-guia-summary{margin:0;color:#4b5563;font-size:13px;line-height:1.42}
      .iasyn-guia-next{
        margin:9px 0 0;padding:9px 10px;border-radius:11px;
        background:linear-gradient(135deg,rgba(217,70,239,.12),rgba(236,72,153,.09));
        color:#701a75;font-size:13px;font-weight:800;line-height:1.34
      }
      .iasyn-guia-detail{
        margin:9px 0 0;padding-top:9px;border-top:1px solid rgba(148,163,184,.22);
        color:#64748b;font-size:12.25px;line-height:1.42
      }
      .iasyn-guia-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
      .iasyn-guia-btn{
        appearance:none;border:1px solid rgba(192,38,211,.24);background:#fff;color:#86198f;
        min-height:34px;padding:6px 10px;border-radius:10px;font:inherit;font-size:12px;font-weight:800;cursor:pointer
      }
      .iasyn-guia-btn:hover{background:#fdf4ff}
      .iasyn-guia-mode{
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        margin-top:10px;padding-top:9px;border-top:1px solid rgba(148,163,184,.22);
        color:#64748b;font-size:12px;font-weight:800
      }
      .iasyn-guia-switch{
        appearance:none;border:1px solid rgba(192,38,211,.28);background:#f8fafc;color:#64748b;
        min-width:76px;height:32px;padding:0 10px;border-radius:999px;font:inherit;font-size:11.5px;
        font-weight:900;cursor:pointer
      }
      .iasyn-guia-switch[data-activa="true"]{background:#fdf4ff;color:#86198f;border-color:rgba(192,38,211,.45)}

      /* Estado cerrado: avatar mínimo, no pastilla horizontal. */
      .iasyn-guia-launcher{
        pointer-events:auto;display:none;margin-left:auto;width:46px;height:46px;padding:0;
        align-items:center;justify-content:center;border:1px solid rgba(217,70,239,.42);
        background:linear-gradient(135deg,#a21caf,#ec4899);color:#fff;border-radius:50%;
        box-shadow:0 10px 28px rgba(162,28,175,.27);cursor:grab;
        touch-action:none;user-select:none;-webkit-user-select:none
      }
      .iasyn-guia-launcher.is-visible{display:flex}
      .iasyn-guia-launcher[data-activa="false"]{opacity:.42;filter:saturate(.45)}
      .iasyn-guia-launcher:active{cursor:grabbing}
      .iasyn-guia-launcher:hover{transform:translateY(-1px);box-shadow:0 13px 32px rgba(162,28,175,.31)}
      .iasyn-guia-robot{width:29px;height:29px;display:block;pointer-events:none}
      .iasyn-guia-robot *{pointer-events:none}
      @keyframes iasynGuiaEntrada{from{opacity:0;transform:translateY(-7px) scale(.985)}to{opacity:1;transform:none}}

      @media(max-width:700px){
        #${HOST_ID}{
          top:calc(env(safe-area-inset-top,0px) + 82px);right:10px;bottom:auto;
          width:min(360px,calc(100vw - 20px));max-height:calc(100vh - 104px)
        }
        .iasyn-guia-card{border-radius:16px}
        .iasyn-guia-top{padding:12px}
        .iasyn-guia-body{padding:11px 12px 12px}
        .iasyn-guia-launcher{width:44px;height:44px;font-size:16px}
      }
      @media(prefers-reduced-motion:reduce){.iasyn-guia-card{animation:none}.iasyn-guia-launcher:hover{transform:none}}
    `;
    document.head.appendChild(s);
  }

  function host(){
    inyectarEstilos();
    let h=document.getElementById(HOST_ID);
    if(!h){
      h=document.createElement('div'); h.id=HOST_ID; h.setAttribute('aria-live','polite'); document.body.appendChild(h);
    }
    return h;
  }

  function posicionPredeterminada(h){
    h.style.bottom='auto';
    if(Number.isFinite(preferencias.x) && Number.isFinite(preferencias.y)){
      const p=limitarPosicion(h,preferencias.x,preferencias.y);
      h.style.right='auto';h.style.left=p.left+'px';h.style.top=p.top+'px';
      posicionUsuario=p;
      return;
    }
    h.style.left='auto';
    if(esMovil()){
      h.style.right='10px';
      h.style.top='calc(env(safe-area-inset-top,0px) + 82px)';
    }else{
      h.style.right='18px';
      h.style.top='92px';
    }
    posicionUsuario=null;
  }

  function recordarPosicion(p){
    if(!p)return;
    posicionUsuario=p;
    preferencias.x=p.left;
    preferencias.y=p.top;
    guardarPreferencias();
  }

  function limitarPosicion(h,left,top){
    const margen=8, r=h.getBoundingClientRect();
    const ancho=r.width||Math.min(esMovil()?360:340,window.innerWidth-20);
    const alto=Math.min(r.height||80,window.innerHeight-(margen*2));
    return {
      left:Math.max(margen,Math.min(left,window.innerWidth-ancho-margen)),
      top:Math.max(margen,Math.min(top,window.innerHeight-alto-margen))
    };
  }

  function aplicarPosicionUsuario(){
    const h=document.getElementById(HOST_ID); if(!h || !posicionUsuario)return;
    const p=limitarPosicion(h,posicionUsuario.left,posicionUsuario.top);
    h.style.right='auto';h.style.bottom='auto';h.style.left=p.left+'px';h.style.top=p.top+'px';posicionUsuario=p;
  }

  function activarArrastre(r){
    const asa=r.nodes.card.querySelector('.iasyn-guia-top');
    if(!asa || asa.dataset.iasynDrag==='1')return;
    asa.dataset.iasynDrag='1'; let drag=null;
    asa.addEventListener('pointerdown',function(e){
      if(e.button!=null && e.button!==0)return;
      if(e.target && e.target.closest && e.target.closest('button'))return;
      const h=host(), rect=h.getBoundingClientRect();
      drag={id:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};
      try{asa.setPointerCapture(e.pointerId);}catch(_e){}
      e.preventDefault();
    });
    asa.addEventListener('pointermove',function(e){
      if(!drag || drag.id!==e.pointerId)return;
      const h=host(),p=limitarPosicion(h,e.clientX-drag.dx,e.clientY-drag.dy);
      h.style.right='auto';h.style.bottom='auto';h.style.left=p.left+'px';h.style.top=p.top+'px';recordarPosicion(p);e.preventDefault();
    });
    function terminar(e){ if(!drag || (e.pointerId!=null && drag.id!==e.pointerId))return; drag=null; }
    asa.addEventListener('pointerup',terminar); asa.addEventListener('pointercancel',terminar);
  }


  function activarArrastreLauncher(r){
    const launcher=r.nodes.launcher;
    if(!launcher || launcher.dataset.iasynDrag==='1')return;
    launcher.dataset.iasynDrag='1';
    let drag=null;
    const UMBRAL=6;

    launcher.addEventListener('pointerdown',function(e){
      if(e.button!=null && e.button!==0)return;
      const h=host(), rect=h.getBoundingClientRect();
      drag={
        id:e.pointerId,
        inicioX:e.clientX,
        inicioY:e.clientY,
        dx:e.clientX-rect.left,
        dy:e.clientY-rect.top,
        movido:false
      };
      try{launcher.setPointerCapture(e.pointerId);}catch(_e){}
      e.preventDefault();
    });

    launcher.addEventListener('pointermove',function(e){
      if(!drag || drag.id!==e.pointerId)return;
      if(!drag.movido && (Math.abs(e.clientX-drag.inicioX)>=UMBRAL || Math.abs(e.clientY-drag.inicioY)>=UMBRAL)){
        drag.movido=true;
      }
      if(!drag.movido)return;
      const h=host(), p=limitarPosicion(h,e.clientX-drag.dx,e.clientY-drag.dy);
      h.style.right='auto';h.style.bottom='auto';
      h.style.left=p.left+'px';h.style.top=p.top+'px';
      recordarPosicion(p);
      e.preventDefault();
    });

    function terminar(e){
      if(!drag || (e.pointerId!=null && drag.id!==e.pointerId))return;
      const fueArrastre=drag.movido;
      drag=null;
      if(!fueArrastre){
        ocultarOtros(r.id);
        activo=r.id;
        r.oculta=false;
        pintar(r);
      }
      if(e && e.preventDefault)e.preventDefault();
    }

    launcher.addEventListener('pointerup',terminar);
    launcher.addEventListener('pointercancel',function(){drag=null;});
    launcher.addEventListener('click',function(e){e.preventDefault();});
  }

  function crearNodo(id){
    const card=document.createElement('section'); card.className='iasyn-guia-card'; card.dataset.iasynGuiaId=id; card.setAttribute('aria-label','Asistente IASYN2');
    const top=document.createElement('div'); top.className='iasyn-guia-top';
    const icon=document.createElement('div'); icon.className='iasyn-guia-icon'; icon.textContent='A';
    const copy=document.createElement('div'); copy.className='iasyn-guia-copy';
    const brand=document.createElement('div'); brand.className='iasyn-guia-brand'; brand.textContent='Asistente IASYN2';
    const title=document.createElement('h3'); title.className='iasyn-guia-title';
    const close=document.createElement('button'); close.type='button'; close.className='iasyn-guia-close'; close.setAttribute('aria-label','Ocultar asistente'); close.textContent='×';
    copy.append(brand,title); top.append(icon,copy,close);

    const body=document.createElement('div'); body.className='iasyn-guia-body';
    const summary=document.createElement('p'); summary.className='iasyn-guia-summary';
    const next=document.createElement('div'); next.className='iasyn-guia-next';
    const detail=document.createElement('div'); detail.className='iasyn-guia-detail';
    const actions=document.createElement('div'); actions.className='iasyn-guia-actions';
    const toggle=document.createElement('button'); toggle.type='button'; toggle.className='iasyn-guia-btn'; toggle.setAttribute('aria-expanded','false');
    actions.append(toggle);
    const mode=document.createElement('div'); mode.className='iasyn-guia-mode';
    const modeLabel=document.createElement('span'); modeLabel.textContent='Asistente';
    const modeSwitch=document.createElement('button'); modeSwitch.type='button'; modeSwitch.className='iasyn-guia-switch';
    mode.append(modeLabel,modeSwitch);
    body.append(summary,next,detail,actions,mode); card.append(top,body);

    const launcher=document.createElement('button');
    launcher.type='button'; launcher.className='iasyn-guia-launcher';
    launcher.innerHTML='<svg class="iasyn-guia-robot" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5V2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="2.5" r="1.5" fill="currentColor"/><rect x="6" y="7" width="20" height="17" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="15" r="2" fill="currentColor"/><circle cx="20" cy="15" r="2" fill="currentColor"/><path d="M11.5 20c1.2 1 2.7 1.5 4.5 1.5s3.3-.5 4.5-1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 14H3.5v5H6M26 14h2.5v5H26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    launcher.setAttribute('aria-label','Abrir o mover Asistente IASYN2');
    launcher.setAttribute('title','Asistente IASYN2');
    return {card,title,summary,next,detail,actions,toggle,close,launcher,modeSwitch};
  }

  function ocultarOtros(id){
    mounts.forEach(function(r,k){
      if(k!==id){ r.nodes.card.style.display='none'; r.nodes.launcher.classList.remove('is-visible'); }
    });
  }

  function pintar(r){
    const c=r.config,n=r.nodes;
    n.card.dataset.tipo=c.tipo;n.title.textContent=c.titulo;
    n.summary.textContent=c.resumen;n.summary.hidden=!c.resumen;
    n.next.textContent=c.siguiente?'Siguiente paso: '+c.siguiente:'';n.next.hidden=!c.siguiente;
    n.detail.textContent=c.detalle;n.detail.hidden=!c.detalle || !r.expandida;
    n.toggle.textContent=r.expandida?c.etiquetaCerrar:c.etiquetaAbrir;
    n.toggle.setAttribute('aria-expanded',r.expandida?'true':'false');
    n.toggle.hidden=!c.expandible || !c.detalle;n.actions.hidden=n.toggle.hidden;
    const activa=preferencias.activa!==false;
    n.modeSwitch.dataset.activa=activa?'true':'false';
    n.modeSwitch.textContent=activa?'ACTIVO':'INACTIVO';
    n.modeSwitch.setAttribute('aria-pressed',activa?'true':'false');
    n.launcher.dataset.activa=activa?'true':'false';
    n.launcher.setAttribute('title',activa?'Asistente activo':'Asistente inactivo');
    n.launcher.setAttribute('aria-label',(activa?'Asistente activo. ':'Asistente inactivo. ')+'Abrir o mover Asistente IASYN2');
    if(r.oculta){ n.card.style.display='none';n.launcher.classList.add('is-visible'); }
    else{ n.card.style.display='';n.launcher.classList.remove('is-visible'); }
  }

  function montar(id,_contenedor,config){
    const clave=texto(id,'');if(!clave)return null;
    const h=host();ocultarOtros(clave);activo=clave;
    let r=mounts.get(clave);
    if(!r){
      const nodes=crearNodo(clave);
      r={id:clave,nodes,config:normalizar(config),expandida:false,oculta:false};
      activarArrastre(r);
      activarArrastreLauncher(r);
      nodes.toggle.addEventListener('click',function(){r.expandida=!r.expandida;pintar(r);});
      nodes.close.addEventListener('click',function(){r.oculta=true;pintar(r);});
      nodes.modeSwitch.addEventListener('click',function(){
        preferencias.activa=!(preferencias.activa!==false);
        guardarPreferencias();
        pintar(r);
      });
      h.append(nodes.card,nodes.launcher);mounts.set(clave,r);
    }else{
      r.config=normalizar(config);r.expandida=r.config.expandida;r.oculta=false;
    }
    pintar(r);return r.nodes.card;
  }

  function actualizar(id,config){
    const r=mounts.get(texto(id,''));if(!r)return false;
    ocultarOtros(r.id);activo=r.id;r.config=normalizar(Object.assign({},r.config,config||{}));r.oculta=false;pintar(r);return true;
  }
  function mostrar(id){ const r=mounts.get(texto(id,''));if(!r)return false;ocultarOtros(r.id);activo=r.id;r.oculta=false;pintar(r);return true; }
  function ocultar(id){ const r=mounts.get(texto(id,''));if(!r)return false;r.oculta=true;posicionPredeterminada(host());pintar(r);return true; }
  function desmontar(id){
    const clave=texto(id,''),r=mounts.get(clave);if(!r)return false;
    r.nodes.card.remove();r.nodes.launcher.remove();mounts.delete(clave);if(activo===clave)activo='';return true;
  }

  function recibirContexto(evento){
    try{
      const d=evento&&evento.detail&&typeof evento.detail==='object'?evento.detail:{};
      const id=texto(d.id,'');if(!id)return;
      const existente=mounts.get(id);
      if(preferencias.activa===false){
        if(existente){ existente.config=normalizar(d.config||{}); existente.oculta=true; pintar(existente); }
        return;
      }
      montar(id,null,d.config||{});
    }catch(error){console.warn('IASYN2 GUÍA: contexto ignorado de forma segura.',error);}
  }

  function recibirPacienteConfirmado(evento){
    try{
      const d=evento&&evento.detail&&typeof evento.detail==='object'?evento.detail:{};
      if(!texto(d.id_paciente,''))return;
      if(preferencias.activa===false)return;
      const esEdicion=String(d.operacion||'')==='edicion';
      const desdeAgenda=String(d.origen||'')==='agenda';
      montar('pacientes',null,{
        tipo:'info',titulo:esEdicion?'Aviso de actualización de paciente':'Aviso de registro de paciente',
        resumen:esEdicion?'El módulo de Pacientes notificó una actualización. Verifique el registro en Pacientes.':'El módulo de Pacientes notificó un registro. Verifique el registro en Pacientes.',
        siguiente:desdeAgenda?'Continúe el flujo de la cita desde Agenda.':'Abra la historia clínica del paciente para continuar.',
        detalle:'Antes de crear la primera atención, el paciente debe tener una Historia Clínica. La guía solo orienta: no crea historias, no inicia atenciones y no modifica información médica.',
        expandible:true,expandida:false,ocultable:true
      });
    }catch(error){console.warn('IASYN2 GUÍA: no se pudo mostrar la orientación de Pacientes.',error);}
  }

  function recibirHistoriaCreada(evento){
    try{
      const d=evento&&evento.detail&&typeof evento.detail==='object'?evento.detail:{};
      const idHistoria=texto(d.id_historia,'');
      const idPaciente=texto(d.id_paciente,'');
      if(!idHistoria || !idPaciente)return;
      if(preferencias.activa===false)return;
      const esEdicion=String(d.operacion||'')==='edicion';
      montar('historia',null,{
        tipo:'ok',
        titulo:esEdicion?'Historia clínica actualizada':'Historia clínica creada',
        resumen:esEdicion
          ?'El módulo de Historia Clínica notificó una actualización. Verifique el estado del registro.'
          :'El módulo de Historia Clínica notificó una creación. Verifique el estado del registro.',
        siguiente:esEdicion
          ?'Puede continuar con el flujo clínico del paciente.'
          :'Ya puede crear la primera atención del paciente.',
        detalle:esEdicion
          ?'El asistente confirma la actualización y únicamente orienta; no crea atenciones ni modifica información clínica.'
          :'Flujo recomendado: Paciente → Historia Clínica → Atención. El asistente únicamente orienta y no crea atenciones ni modifica información clínica.',
        expandible:true,expandida:false,ocultable:true
      });
    }catch(error){console.warn('IASYN2 GUÍA: no se pudo mostrar la orientación de Historia Clínica.',error);}
  }

  /* ============================================================
     IASYN2 GUÍA ADAPTACIÓN V1 — ORIENTACIÓN AL ENTRAR A HISTORIA
     - Solo observa el contexto ya disponible en el ERP.
     - NO consulta backend, NO guarda y NO modifica datos clínicos.
     - Solo abre la guía si hay paciente seleccionado SIN Historia Clínica.
  ============================================================ */
  let historiaPantallaActivaAnterior=false;

  function idPacienteHistoriaActual(){
    const selector=document.getElementById('hcPacienteSelect');
    return texto(
      (selector&&selector.value) ||
      window.activePatientId ||
      '',
      ''
    );
  }

  function pacienteTieneHistoriaConfirmada(idPaciente){
    const id=texto(idPaciente,'');
    if(!id)return false;

    const candidatas=[
      window.historiaActual,
      window.currentHistoria
    ];

    for(let i=0;i<candidatas.length;i+=1){
      const h=candidatas[i];
      if(!h || typeof h!=='object')continue;
      const hp=texto(h.id_paciente || h.idPaciente,'');
      const hi=texto(h.id_historia || h.idHistoria || h.id,'');
      if(hp===id && hi)return true;
    }

    const listas=[
      window.historiasClinicas,
      window.historias_clinicas
    ];

    for(let i=0;i<listas.length;i+=1){
      const lista=listas[i];
      if(!Array.isArray(lista))continue;
      const encontrada=lista.some(function(h){
        if(!h || typeof h!=='object')return false;
        const hp=texto(h.id_paciente || h.idPaciente,'');
        const hi=texto(h.id_historia || h.idHistoria || h.id,'');
        return hp===id && !!hi;
      });
      if(encontrada)return true;
    }

    return false;
  }

  function orientarEntradaHistoria(){
    try{
      if(preferencias.activa===false)return;

      const pantalla=document.getElementById('historia');
      if(!pantalla || !pantalla.classList.contains('active'))return;

      const idPaciente=idPacienteHistoriaActual();
      if(!idPaciente)return;
      if(pacienteTieneHistoriaConfirmada(idPaciente))return;
      // SEGURIDAD: no inferir ausencia de Historia Clínica de memoria local incompleta.
      // Hasta verificar contrato de carga en index.html, no emitir advertencia automática.
      return;

      montar('historia',null,{
        tipo:'warning',
        titulo:'Primero crea la Historia Clínica',
        resumen:'Antes de iniciar una atención, completa y guarda Datos generales y Antecedentes para generar el ID de Historia Clínica.',
        siguiente:'Datos generales → Antecedentes → Guardar historia.',
        detalle:'Cuando la Historia Clínica quede confirmada, podrás crear la primera atención y continuar con los siguientes módulos. El asistente solo orienta: no guarda, no crea atenciones y no modifica información clínica.',
        expandible:true,expandida:false,ocultable:true
      });
    }catch(error){console.warn('IASYN2 GUÍA: no se pudo mostrar la orientación inicial de Historia Clínica.',error);}
  }

  function observarEntradaHistoria(){
    const pantalla=document.getElementById('historia');
    if(!pantalla)return;

    historiaPantallaActivaAnterior=pantalla.classList.contains('active');

    const observer=new MutationObserver(function(){
      const activaAhora=pantalla.classList.contains('active');
      if(activaAhora && !historiaPantallaActivaAnterior){
        window.setTimeout(orientarEntradaHistoria,180);
      }
      historiaPantallaActivaAnterior=activaAhora;
    });

    observer.observe(pantalla,{attributes:true,attributeFilter:['class']});
  }

  /* ============================================================
     IASYN2 GUÍA ADAPTACIÓN V1 — ORIENTACIÓN AL ENTRAR A DIAGNÓSTICO
     - Solo observa el DOM y el contexto ya disponible en el ERP.
     - NO consulta backend, NO guarda y NO modifica datos clínicos.
     - NO agrega CIE-10, NO aplica protocolos y NO dispara botones.
  ============================================================ */
  let diagnosticoPantallaActivaAnterior=false;

  function orientarEntradaDiagnostico(){
    try{
      if(preferencias.activa===false)return;
      const pantalla=document.getElementById('hc_diagnostico');
      if(!pantalla || !pantalla.classList.contains('active'))return;

      const seleccionados=document.getElementById('hcDxSeleccionadosBody');
      const tieneDiagnostico=!!(seleccionados && seleccionados.querySelector('tr') && !seleccionados.querySelector('.diagnostico-empty'));

      montar('diagnostico',null,{
        tipo:'info',
        titulo:tieneDiagnostico?'Diagnóstico visible para revisión':'Asistente de Diagnóstico',
        resumen:tieneDiagnostico
          ?'Se observan filas de diagnóstico en pantalla. Su presencia no demuestra que estén guardadas ni que correspondan a la atención actual; compruebe el estado en el módulo.'
          :'Revise la información clínica registrada y utilice el buscador CIE-10 para agregar el diagnóstico que corresponda.',
        siguiente:tieneDiagnostico
          ?'Verifique el estado de guardado en Diagnósticos antes de continuar con Plan.'
          :'Busque por código o nombre, agregue el CIE-10 correspondiente y confirme el diagnóstico.',
        detalle:'El asistente solo orienta: no agrega diagnósticos, no guarda cambios, no aplica protocolos y no modifica Plan ni Recetas.',
        expandible:true,expandida:false,ocultable:true
      });
    }catch(error){console.warn('IASYN2 GUÍA: no se pudo mostrar la orientación de Diagnóstico.',error);}
  }

  function observarEntradaDiagnostico(){
    const pantalla=document.getElementById('hc_diagnostico');
    if(!pantalla)return;
    diagnosticoPantallaActivaAnterior=pantalla.classList.contains('active');
    const observer=new MutationObserver(function(){
      const activaAhora=pantalla.classList.contains('active');
      if(activaAhora && !diagnosticoPantallaActivaAnterior) window.setTimeout(orientarEntradaDiagnostico,180);
      diagnosticoPantallaActivaAnterior=activaAhora;
    });
    observer.observe(pantalla,{attributes:true,attributeFilter:['class']});
  }

  function refrescarGuiaDiagnosticoSiActiva(){
    const pantalla=document.getElementById('hc_diagnostico');
    if(!pantalla || !pantalla.classList.contains('active'))return;
    window.setTimeout(orientarEntradaDiagnostico,120);
  }

  window.addEventListener('aurosanax:diagnosticos-actualizados',refrescarGuiaDiagnosticoSiActiva);

  window.addEventListener('resize',function(){if(posicionUsuario)aplicarPosicionUsuario();});
  window.addEventListener('aurosanax:guia-contexto',recibirContexto);
  window.addEventListener('aurosanax:paciente-confirmado',recibirPacienteConfirmado);
  window.addEventListener('aurosanax:historia-creada',recibirHistoriaCreada);

  function asegurarAsistenteDisponible(){
    if(mounts.size)return;
    montar('inicio',null,{
      tipo:'neutral',titulo:'Asistente IASYN2',
      resumen:'El asistente está disponible para orientarle durante el uso del ERP.',
      siguiente:'Seleccione el módulo en el que desea trabajar.',
      detalle:'La guía es únicamente visual y de orientación. No guarda, crea, firma, finaliza ni modifica información clínica.',
      expandible:true,expandida:false,ocultable:true
    });
    const r=mounts.get('inicio');
    if(r){
      posicionPredeterminada(host());
      r.oculta=true;
      pintar(r);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){
      asegurarAsistenteDisponible();
      observarEntradaHistoria();
      observarEntradaDiagnostico();
    },{once:true});
  }else{
    setTimeout(function(){
      asegurarAsistenteDisponible();
      observarEntradaHistoria();
      observarEntradaDiagnostico();
    },0);
  }

  window.IASYNGuia=Object.freeze({
    __iasynGuiaMotor:true,version:VERSION,montar,actualizar,mostrar,ocultar,desmontar
  });
})(window,document);
