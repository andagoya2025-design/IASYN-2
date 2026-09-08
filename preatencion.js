/* ==========================================================
   IASYN ERP · PREATENCIÓN 3.7.0
   Sala de espera + buscador + colaboración de Secretaría
   Versión quirúrgica / antirregresión · estado paciente no registrado
   ----------------------------------------------------------
   CONSERVA:
   - Guardado actual en hoja preatencion.
   - id_cita opcional e id_atencion posterior.
   - Signos vitales/antropometría y antecedentes referidos.
   - Vinculación automática al iniciar la atención.
   AGREGA SIN CAMBIAR BD:
   - Sala de espera del día (varios pacientes, un formulario seguro).
   - Búsqueda por nombre, documento, teléfono/WhatsApp.
   - Corrección autorizada de datos generales con justificativo.
   - Auditoría de correcciones mediante backend existente.
   NO CREA atención, historia, examen físico, hojas ni columnas.
   ========================================================== */
(function(){
  'use strict';

  /*
   * AISLAMIENTO IASYN
   * - Sin URLs, Spreadsheet IDs ni Drive IDs directos.
   * - No crea Atención/Historia/Examen físico.
   * - Conserva IDs DOM/eventos legacy porque son contratos internos compartidos.
   * - La persistencia continúa exclusivamente mediante el API configurado por IASYN.
   */

  /*
   * IASYN: Seguridad propia primero.
   * El alias AUROSANAX se conserva únicamente como compatibilidad temporal
   * mientras los módulos heredados terminan su migración.
   */
  const seguridad=window.IASYN_SEGURIDAD || window.AUROSANAX_SEGURIDAD;
  if(!seguridad) return;

  let pacientesCache=[];
  let citasCache=[];
  let preatencionesCache=[];
  let pacienteOriginal=null;
  let preatencionCorreccionOriginal=null;

  function tiene(clave){
    return !!(seguridad && typeof seguridad.tienePermiso==='function' && seguridad.tienePermiso(clave));
  }
  function tienePreatencion(){
    return ['preconsulta','preconsulta_datos_administrativos','preconsulta_signos_vitales','preconsulta_antecedentes_referidos'].some(tiene);
  }
  function puedeCorregirPaciente(){ return tiene('pacientes_edicion_administrativa') || tiene('pacientes_edicion'); }
  function apiUrl(){
    /* IASYN primero; conserva contratos heredados solo como fallback compatible. */
    return (window.IASYN_SEGURIDAD?.configuracion && window.IASYN_SEGURIDAD.configuracion.apiUrl) ||
      (window.IASYN_SEGURIDAD?.config && window.IASYN_SEGURIDAD.config.apiUrl) ||
      (typeof IASYN_API_URL!=='undefined' ? IASYN_API_URL : '') ||
      (typeof API_URL!=='undefined' ? API_URL : '') ||
      (seguridad.configuracion && seguridad.configuracion.apiUrl) ||
      (seguridad.config && seguridad.config.apiUrl) || '';
  }

  function extraerLista(respuesta){
    if(Array.isArray(respuesta)) return respuesta;
    if(respuesta && Array.isArray(respuesta.data)) return respuesta.data;
    if(respuesta && Array.isArray(respuesta.registros)) return respuesta.registros;
    if(respuesta && Array.isArray(respuesta.resultado)) return respuesta.resultado;
    return [];
  }
  async function get(accion,params){
    const q=new URLSearchParams({accion,_:String(Date.now())});
    Object.entries(params||{}).forEach(([k,v])=>{ if(v!==undefined&&v!==null) q.append(k,String(v)); });
    const r=await fetch(apiUrl()+'?'+q.toString(),{cache:'no-store'});
    if(!r.ok) throw new Error('Error HTTP '+r.status);
    return r.json();
  }
  async function post(accion,data){
    const r=await fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({accion,data:data||{}})});
    if(!r.ok) throw new Error('Error HTTP '+r.status);
    return r.json();
  }
  const txt=v=>String(v===null||v===undefined?'':v).trim();
  const esc=v=>String(v===null||v===undefined?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const norm=v=>txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
  const val=id=>txt(document.getElementById(id)?.value);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
  const numero=v=>{const s=txt(v).replace(',','.');return s===''?'':s;};
  function nombrePaciente(p){ return txt(p?.nombre_completo||p?.nombre_paciente||[p?.nombres,p?.apellidos].filter(Boolean).join(' '))||'Paciente'; }
  function documentoPaciente(p){ return txt(p?.numero_documento||p?.cedula||p?.documento); }
  function telefonoPaciente(p){ return txt(p?.telefono||p?.whatsapp); }
  function hoyEcuador(){
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return f;
  }
  function fechaISO(v){
    const raw=txt(v);
    let m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return '';
  }
  function fechaVista(v){
    const iso=fechaISO(v);
    if(!iso) return txt(v);
    const p=iso.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
  }
  function estadoCita(c){ return norm(c?.estado_cita||c?.estado); }
  function nombreCita(c){ return txt(c?.paciente||c?.nombre_paciente||c?.nombre_completo||c?.paciente_nombre||c?.nombre||'Paciente de cita'); }
  function documentoCita(c){ return txt(c?.cedula||c?.numero_documento||c?.documento||c?.identificacion||''); }
  function telefonoCita(c){ return txt(c?.whatsapp||c?.telefono||c?.telefono_paciente||''); }
  function pacienteRegistradoDeCita(c){
    const id=txt(c?.id_paciente);
    return id ? (pacientesCache.find(p=>txt(p.id_paciente)===id)||null) : null;
  }
  function estadoRegistroCita(c){
    const id=txt(c?.id_paciente), p=pacienteRegistradoDeCita(c);
    if(p) return {key:'registered',label:'PACIENTE REGISTRADO',paciente:p};
    if(id) return {key:'unregistered',label:'PACIENTE NO REGISTRADO',paciente:null};
    return {key:'unregistered',label:'PACIENTE NO REGISTRADO',paciente:null};
  }
  function esCitaUtil(c){ return !/(anulad|cancelad)/.test(estadoCita(c)); }
  function token(){ return typeof seguridad.obtenerToken==='function'?seguridad.obtenerToken():''; }
  function usuario(){ return typeof seguridad.obtenerUsuario==='function'?(seguridad.obtenerUsuario()||{}):{}; }

  function instalarCSS(){
    if(document.getElementById('auroPreV3CSS')) return;
    const s=document.createElement('style');
    s.id='auroPreV3CSS';
    s.textContent=`
      #preatencion{--pre-accent:#8b1e5a;--pre-accent-2:#c23b83;--pre-border:#ead7e2;--pre-soft:#fff8fc;--pre-text:#1f2937;--pre-muted:#64748b}
      #preatencion *{box-sizing:border-box}
      #preatencion .cardx{border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important}
      #preatencion .section-head{margin:0 0 14px;padding:18px 20px;border:1px solid var(--pre-border);border-radius:22px;background:linear-gradient(135deg,#fff 0%,#fff9fc 100%);box-shadow:0 10px 30px rgba(139,30,90,.06)}
      #preatencion .section-head h4{margin:0;color:var(--pre-text);font-size:22px;font-weight:950;letter-spacing:-.02em}
      #preatencion .section-head h4 i{color:var(--pre-accent)}
      #preatencion .section-head p{margin:4px 0 0;color:var(--pre-muted);font-size:13px;font-weight:650}
      #preatencion .mini-note{margin:0 0 14px!important;padding:10px 13px!important;border:1px solid #eadfe6!important;border-radius:14px!important;background:#fff!important;color:#5f6672!important;font-size:12px!important;font-weight:650!important;box-shadow:0 5px 18px rgba(15,23,42,.025)}
      #preatencion .mini-note i{color:var(--pre-accent)}
      #preatencion .pre-corr-signos{display:none;margin-top:14px;padding:14px 16px;border:1px solid #e8cbdc;border-radius:16px;background:#fffafd}
      #preatencion .pre-corr-signos.show{display:block}
      #preatencion .pre-corr-signos .corr-title{font-weight:900;color:#7a2457;margin-bottom:6px}
      #preatencion .pre-corr-signos .corr-help{font-size:12px;color:#64748b;margin-bottom:10px}

      .pre-v3-grid{display:grid;grid-template-columns:minmax(285px,.78fr) minmax(0,1.65fr);gap:16px;align-items:start}
      .pre-v3-card{border:1px solid var(--pre-border);border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 10px 28px rgba(15,23,42,.045)}
      .pre-v3-head{display:flex;align-items:center;min-height:48px;padding:12px 15px;border-bottom:1px solid #f2e6ed;background:linear-gradient(180deg,#fff,#fffafd);font-weight:950;color:#5f1747;font-size:14px}
      .pre-v3-head i{color:var(--pre-accent);font-size:15px}.pre-v3-body{padding:14px}

      .pre-search{position:relative;width:100%}.pre-search i{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#9b5d7e;pointer-events:none;z-index:1;font-size:14px}.pre-search input{width:100%;min-height:42px;padding-left:39px!important;padding-right:12px!important;border:1px solid #dfe4ea!important;border-radius:12px!important;background:#fff!important;box-shadow:none!important;font-size:13px!important}.pre-search input:focus{border-color:#d593b7!important;box-shadow:0 0 0 3px rgba(194,59,131,.10)!important;outline:none!important}
      .pre-results{display:grid;gap:6px;margin-top:7px;max-height:238px;overflow:auto}.pre-result{width:100%;text-align:left;border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:10px 11px;cursor:pointer;transition:.16s ease}.pre-result:hover{border-color:#d89bbb;background:#fff8fc;transform:translateY(-1px)}.pre-result b{display:block;color:#1f2937;font-size:12.5px}.pre-result small{display:block;margin-top:2px;color:#64748b;font-size:10.5px}
      .pre-cita-auto{margin-top:9px;padding:9px 11px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;font-size:11.5px;color:#475569;font-weight:700}
      .pre-wait{display:grid;gap:8px;max-height:520px;overflow:auto;padding-right:2px}.pre-wait-item{border:1px solid #e5e7eb;border-radius:14px;padding:10px 11px;background:#fff;cursor:pointer;transition:.16s ease}.pre-wait-item:hover,.pre-wait-item.active{border-color:#d89bbb;background:#fff8fc;box-shadow:0 6px 18px rgba(139,30,90,.06)}
      .pre-wait-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.pre-wait-name{font-weight:950;color:#1f2937;font-size:12.5px}.pre-wait-meta{font-size:10.5px;color:#64748b;margin-top:3px;line-height:1.35}.pre-badge{display:inline-flex;align-items:center;justify-content:center;min-height:27px;font-size:10.5px;font-weight:950;letter-spacing:.025em;border-radius:999px;padding:6px 10px;white-space:nowrap;box-shadow:0 3px 10px rgba(15,23,42,.06)}.pre-badge.wait{background:#f1f5f9;color:#475569}.pre-badge.ready{background:#ecfdf5;color:#166534}.pre-badge.linked{background:#eff6ff;color:#1d4ed8}.pre-badge.confirm{background:#fff7ed;color:#9a3412}.pre-badge.registered{background:#ecfdf5;color:#166534}.pre-badge.unregistered{background:#fff7ed;color:#9a3412}

      .pre-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.pre-toolbar .btn-line,.pre-toolbar .btn-auro{min-height:38px;border-radius:11px!important;font-size:12px!important;font-weight:850!important;padding:8px 11px!important}
      #preEditarPaciente{border-color:#dfbfd1!important;color:#7a2457!important;background:#fff!important}#preEditarPaciente:hover{background:#fff7fb!important;border-color:#cb8fb0!important}
      #preIrPacientes{border-color:#e5e7eb!important;color:#475569!important;background:#fff!important}
      .pre-patient-summary{padding:11px 12px;border:1px solid #e5e7eb;border-radius:13px;background:#f8fafc;font-size:11.5px;line-height:1.45;color:#475569}
      .pre-edit-box{display:none;margin-top:12px;padding:13px;border:1px solid #f0d4e4;border-radius:15px;background:#fffafd}.pre-edit-box.show{display:block}
      .pre-status-line{font-size:11.5px;font-weight:850;color:#64748b}.pre-empty{padding:17px 12px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:13px;background:#fbfcfd;font-size:11.5px;line-height:1.45}

      #preatencion h5{font-size:15px!important;color:#2f3540!important;letter-spacing:-.01em}
      #preatencion .form-label{margin-bottom:5px!important;color:#4b5563!important;font-size:11px!important;font-weight:850!important}
      #preatencion .form-control,#preatencion .form-select{min-height:40px;border-radius:11px!important;border-color:#dfe4ea!important;font-size:13px!important;box-shadow:none!important}
      #preatencion .form-control:focus,#preatencion .form-select:focus{border-color:#d593b7!important;box-shadow:0 0 0 3px rgba(194,59,131,.10)!important}
      #preatencion textarea.form-control{min-height:94px;line-height:1.45}
      #preatencion #preGuardar{min-height:42px;border-radius:12px!important;padding:9px 14px!important;font-weight:900!important;box-shadow:0 7px 16px rgba(139,30,90,.12)}

      @media(max-width:1024px){.pre-v3-grid{grid-template-columns:minmax(250px,.9fr) minmax(0,1.45fr);gap:12px}.pre-v3-body{padding:12px}}
      @media(max-width:820px){#preatencion .section-head{padding:15px 16px;border-radius:18px}.pre-v3-grid{grid-template-columns:1fr}.pre-wait{max-height:300px}.pre-v3-card{border-radius:17px}}
      @media(max-width:600px){#preatencion{padding-bottom:calc(18px + env(safe-area-inset-bottom))}#preatencion .section-head{margin-bottom:10px;padding:13px 14px;border-radius:16px}#preatencion .section-head h4{font-size:19px}#preatencion .section-head p{font-size:11.5px}.pre-v3-grid{gap:10px}.pre-v3-card{border-radius:15px}.pre-v3-head{min-height:44px;padding:10px 12px;font-size:13px}.pre-v3-body{padding:10px}.pre-toolbar{display:grid;grid-template-columns:1fr 1fr;gap:7px}.pre-toolbar button{width:100%;min-width:0}.pre-search input{min-height:44px;font-size:16px!important}.pre-wait{max-height:260px}.pre-patient-summary{font-size:11px}#preatencion .row.g-3{--bs-gutter-x:.65rem;--bs-gutter-y:.65rem}#preatencion .form-control,#preatencion .form-select{font-size:16px!important}#preatencion #preGuardar{width:100%;min-height:46px}}
      @media(max-width:390px){.pre-toolbar{grid-template-columns:1fr}.pre-v3-head{font-size:12.5px}.pre-badge{white-space:normal;text-align:center}}
    `;
    document.head.appendChild(s);
  }

  function gestionarTituloGlobalPreatencion(activo){
    /* UX QUIRÚRGICA: oculta únicamente el título redundante IASYN/legacy del área principal.
       No toca la marca de la barra lateral ni otros módulos. */
    const candidatos=Array.from(document.querySelectorAll('h1,h2,h3,.page-title,.main-title'));
    candidatos.forEach(el=>{
      if(el.closest('.sidebar')||el.closest('#preatencion')) return;
      if(!['iasyn','aurosanax'].includes(norm(el.textContent))) return;
      if(el.dataset.auroPreDisplayOriginal===undefined){
        el.dataset.auroPreDisplayOriginal=el.style.display||'';
      }
      el.style.display=activo?'none':el.dataset.auroPreDisplayOriginal;
    });
  }

  function instalarControlTituloGlobal(){
    if(window.__auroPreShowScreenEnvuelto) return;
    if(typeof window.showScreen!=='function') return;
    const original=window.showScreen;
    window.showScreen=function(nombre){
      const resultado=original.apply(this,arguments);
      try{ gestionarTituloGlobalPreatencion(String(nombre||'')==='preatencion'); }catch(_e){}
      return resultado;
    };
    window.__auroPreShowScreenEnvuelto=true;
  }

  function inyectar(){
    if(!tienePreatencion()||document.getElementById('preatencion')) return;
    instalarCSS();
    instalarControlTituloGlobal();
    const menu=document.querySelector('.sidebar .menu');
    if(menu){
      const btn=document.createElement('button');btn.type='button';btn.dataset.screen='preatencion';btn.dataset.permisoCualquiera='preconsulta,preconsulta_datos_administrativos,preconsulta_signos_vitales,preconsulta_antecedentes_referidos';btn.innerHTML='<i class="bi bi-clipboard2-pulse"></i> Preatención';btn.onclick=async()=>{ if(window.showScreen) window.showScreen('preatencion',btn); gestionarTituloGlobalPreatencion(true); try{ await refrescarReferenciasPreatencion_(); }catch(error){ console.warn('IASYN PREATENCIÓN: no se pudieron refrescar pacientes/citas al entrar.',error); } };
      const configBtn=menu.querySelector('[data-permiso-cualquiera*="configuracion"]');if(configBtn)menu.insertBefore(btn,configBtn);else menu.appendChild(btn);
    }
    const main=document.querySelector('.main');if(!main)return;
    const section=document.createElement('section');section.className='screen';section.id='preatencion';section.innerHTML=`
      <div class="cardx p-4">
        <div class="section-head"><div><h4><i class="bi bi-clipboard2-pulse me-2"></i>Preatención</h4><p>Sala de espera y registro previo. No inicia una atención clínica.</p></div></div>
        <div class="mini-note mb-3"><i class="bi bi-shield-check me-1"></i>Puede preparar varios pacientes consecutivamente. Cada uno conserva su <b>id_paciente</b> y, cuando existe, su <b>id_cita</b>. Solo hay un formulario activo para evitar cruces.</div>
        <div class="pre-v3-grid">
          <div class="pre-v3-card"><div class="pre-v3-head"><i class="bi bi-people me-1"></i>Sala de espera / preatenciones del día</div><div class="pre-v3-body">
            <div class="pre-search mb-2"><i class="bi bi-search"></i><input id="preBuscarSala" class="form-control" placeholder="Buscar nombre, cédula o teléfono"></div>
            <div class="pre-status-line mb-2" id="preSalaResumen">Cargando…</div><div class="pre-wait" id="preSalaLista"></div>
          </div></div>
          <div class="pre-v3-card"><div class="pre-v3-head"><i class="bi bi-person-vcard me-1"></i>Paciente seleccionado</div><div class="pre-v3-body">
            <div class="row g-3">
              <div class="col-md-7"><label class="form-label">Buscar paciente</label><div class="pre-search"><i class="bi bi-search"></i><input id="preBuscarPaciente" class="form-control" autocomplete="off" placeholder="Escriba nombre, cédula o teléfono"></div><div id="preResultadosPaciente" class="pre-results"></div><input type="hidden" id="prePaciente"><input type="hidden" id="preCita"><div id="preCitaAuto" class="pre-cita-auto" style="display:none"></div><div id="preCitasMultiples" class="mt-2" style="display:none"><label class="form-label mb-1">Seleccione la cita de hoy</label><select id="preCitaVisible" class="form-select"></select></div></div>
              <div class="col-md-5 d-flex align-items-end"><div class="pre-toolbar w-100"><button type="button" class="btn-line" id="preCorregirPreatencion" style="display:none"><i class="bi bi-clipboard2-check me-1"></i>Corregir preatención</button><button type="button" class="btn-line" id="preEditarPaciente" style="display:none"><i class="bi bi-pencil-square me-1"></i>Corregir datos paciente</button><button type="button" class="btn-line" id="preIrPacientes"><i class="bi bi-person-plus me-1"></i>Nuevo paciente</button></div></div>
              <div class="col-12"><div id="preContexto" class="pre-patient-summary">Seleccione un paciente.</div></div>
            </div>
            <div id="preEditarBox" class="pre-edit-box">
              <div class="fw-bold mb-2"><i class="bi bi-shield-lock me-1"></i>Corrección autorizada de datos generales</div>
              <div class="row g-2">
                <div class="col-md-6"><label class="form-label">Nombres</label><input id="preEdNombres" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Apellidos</label><input id="preEdApellidos" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Documento</label><input id="preEdDocumento" class="form-control" inputmode="numeric" maxlength="10"></div>
                <div class="col-md-4"><label class="form-label">Fecha de nacimiento</label><input id="preEdNacimiento" type="date" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Sexo</label><select id="preEdSexo" class="form-select"><option value="">Seleccione</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></div>
                <div class="col-md-4"><label class="form-label">Estado civil</label><select id="preEdEstadoCivil" class="form-select"><option value="">Seleccione</option><option>Soltero/a</option><option>Casado/a</option><option>Unión libre</option><option>Divorciado/a</option><option>Viudo/a</option></select></div>
                <div class="col-md-4"><label class="form-label">Ocupación</label><input id="preEdOcupacion" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Ciudad</label><input id="preEdCiudad" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Teléfono</label><input id="preEdTelefono" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">WhatsApp</label><input id="preEdWhatsapp" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Aseguradora</label><input id="preEdAseguradora" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Correo</label><input id="preEdEmail" type="email" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Dirección</label><input id="preEdDireccion" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Contacto de emergencia</label><input id="preEdContacto" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Teléfono de emergencia</label><input id="preEdTelefonoEmergencia" class="form-control"></div>

                <div class="col-md-6"><label class="form-label">Tipo de justificativo *</label>
                  <select id="preEdTipoJustificativo" class="form-select"><option value="">Seleccione...</option>
                  <option value="Error de digitación">Error de digitación</option>
                  <option value="Omisión">Omisión</option>
                  <option value="Dato incorrecto">Dato incorrecto</option>
                  <option value="Actualización solicitada por el paciente">Actualización solicitada por el paciente</option>
                  <option value="Verificación documental">Verificación documental</option>
                  <option value="Fallo del sistema">Fallo del sistema</option>
                  <option value="Emergencia">Emergencia</option>
                  <option value="Corrección clínica">Corrección clínica</option>
                  <option value="Otro">Otro</option></select>
                </div>
                <div class="col-md-6" id="preEdMotivoWrap" style="display:none"><label class="form-label">Detalle del justificativo *</label><input id="preEdMotivo" class="form-control" maxlength="150" placeholder="Especifique el motivo (máx. 150 caracteres)"></div>
                <div class="col-12" id="preEdObsWrap" style="display:none"><label class="form-label">Observación adicional <span class="text-muted">(opcional)</span></label><input id="preEdObservacion" class="form-control" maxlength="150" placeholder="Detalle adicional, si aplica (máx. 150 caracteres)"></div>
              </div><div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn-line" id="preEdCancelar">Cancelar</button><button type="button" class="btn-auro" id="preEdGuardar"><i class="bi bi-save me-1"></i>Guardar corrección</button></div>
            </div>
            <div id="preSignos" class="mt-4" style="display:none"><h5 class="fw-bold mb-3">Signos vitales y antropometría</h5><div class="row g-3">
              <div class="col-6 col-md-2"><label class="form-label">Peso (kg)</label><input id="prePeso" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">Talla (cm)</label><input id="preTalla" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">IMC</label><input id="preIMC" class="form-control" readonly></div>
              <div class="col-6 col-md-2"><label class="form-label">PA sistólica</label><input id="prePAS" class="form-control" inputmode="numeric" maxlength="3"></div><div class="col-6 col-md-2"><label class="form-label">PA diastólica</label><input id="prePAD" class="form-control" inputmode="numeric" maxlength="3"></div><div class="col-6 col-md-2"><label class="form-label">FC (lpm)</label><input id="preFC" class="form-control" inputmode="numeric"></div>
              <div class="col-6 col-md-2"><label class="form-label">FR (rpm)</label><input id="preFR" class="form-control" inputmode="numeric"></div><div class="col-6 col-md-2"><label class="form-label">Temperatura (°C)</label><input id="preTemp" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">Saturación O₂ (%)</label><input id="preSat" class="form-control" inputmode="numeric"></div>
              <div class="col-6 col-md-2"><label class="form-label">Perímetro cadera (cm)</label><input id="preCadera" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">Grasa corporal (%)</label><input id="preGrasa" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">Masa muscular (kg)</label><input id="preMasa" class="form-control" inputmode="decimal"></div>
              <div class="col-6 col-md-2"><label class="form-label">Perímetro cefálico (cm)</label><input id="preCefalico" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">Perímetro torácico (cm)</label><input id="preToracico" class="form-control" inputmode="decimal"></div><div class="col-6 col-md-2"><label class="form-label">Perímetro abdominal (cm)</label><input id="preAbdominal" class="form-control" inputmode="decimal"></div>
            </div></div>
            <div id="preAntecedentes" class="mt-4" style="display:none"><h5 class="fw-bold mb-2">Antecedentes referidos</h5><p class="text-muted small">Información referida por el paciente. No sustituye la validación médica ni modifica antecedentes oficiales.</p><textarea id="preAntecedentesTexto" class="form-control" rows="4" placeholder="Registre únicamente lo referido por el paciente."></textarea></div>
            <div id="preCorregirSignosBox" class="pre-corr-signos">
              <div class="corr-title"><i class="bi bi-shield-check me-1"></i>Corrección auditable de Preatención</div>
              <div class="corr-help">Corrija los signos vitales arriba e indique el motivo. Si esta Preatención ya está vinculada a una Atención, se actualizará únicamente el Examen físico de esa misma atención.</div>
              <label class="form-label">Tipo de justificativo *</label>
              <select id="preCorregirTipo" class="form-select">
                <option value="">Seleccione...</option>
                <option value="Error de digitación">Error de digitación</option>
                <option value="Omisión">Omisión</option>
                <option value="Dato incorrecto">Dato incorrecto</option>
                <option value="Actualización solicitada por el paciente">Actualización solicitada por el paciente</option>
                <option value="Verificación documental">Verificación documental</option>
                <option value="Fallo del sistema">Fallo del sistema</option>
                <option value="Emergencia">Emergencia</option>
                <option value="Corrección clínica">Corrección clínica</option>
                <option value="Otro">Otro</option>
              </select>

              <div id="preCorregirDetalleWrap" style="display:none" class="mt-3">
                <label class="form-label">Detalle del justificativo *</label>
                <input id="preCorregirMotivo" class="form-control" maxlength="150" placeholder="Especifique el motivo (máx. 150 caracteres)">
              </div>

              <div id="preCorregirDetalleOpcionalWrap" style="display:none" class="mt-3">
                <label class="form-label">Observación adicional <span class="text-muted">(opcional)</span></label>
                <input id="preCorregirObservacion" class="form-control" maxlength="150" placeholder="Detalle adicional, si aplica (máx. 150 caracteres)">
              </div>

              <div class="d-flex justify-content-end gap-2 mt-3">
                <button type="button" class="btn-line" id="preCorregirCancelar">Cancelar</button>
                <button type="button" class="btn-auro" id="preCorregirGuardar"><i class="bi bi-save me-1"></i>Guardar corrección</button>
              </div>
            </div>
            <div class="d-flex justify-content-end mt-4"><button type="button" id="preGuardar" class="btn-auro"><i class="bi bi-save me-1"></i>Guardar preatención y continuar</button></div>
          </div></div>
        </div>
      </div>`;
    main.appendChild(section);

    document.getElementById('preSignos').style.display=(tiene('preconsulta_signos_vitales')||tiene('preconsulta'))?'':'none';
    document.getElementById('preAntecedentes').style.display=(tiene('preconsulta_antecedentes_referidos')||tiene('preconsulta'))?'':'none';
    /* El botón se muestra solo cuando existe un paciente seleccionado.
       La autorización se valida al intentar corregir, sin ocultar la función. */
    document.getElementById('preEditarPaciente').style.display='none';
    document.getElementById('preBuscarPaciente').oninput=renderResultadosPacientes;
    document.getElementById('preBuscarSala').oninput=renderSala;
    document.getElementById('preCitaVisible').onchange=async()=>{set('preCita',val('preCitaVisible'));await cargarPendiente();};
    document.getElementById('preGuardar').onclick=guardar;
    document.getElementById('preCorregirPreatencion').onclick=abrirCorreccionPreatencion;
    document.getElementById('preCorregirCancelar').onclick=cerrarCorreccionPreatencion;
    document.getElementById('preCorregirGuardar').onclick=guardarCorreccionPreatencion;
    document.getElementById('preCorregirTipo').onchange=actualizarJustificativoPreatencion_;
    document.getElementById('preEditarPaciente').onclick=abrirEdicionPaciente;
    document.getElementById('preEdCancelar').onclick=cerrarEdicionPaciente;
    document.getElementById('preEdGuardar').onclick=guardarCorreccionPaciente;
    document.getElementById('preEdTipoJustificativo').onchange=actualizarJustificativoPaciente_;
    document.getElementById('preIrPacientes').onclick=abrirPacienteDesdePreatencion_;

    /*
     * Regreso seguro desde el modal de creación:
     * refresca únicamente las fuentes de Preatención y vuelve a seleccionar
     * la misma cita ya vinculada. No inicia Historia ni Atención.
     */
    window.addEventListener('auro:paciente-vinculado-preatencion', async function(ev){
      const d=ev?.detail||{};
      if(!d.id_paciente)return;
      try{
        if(d.id_cita){
          await cargarTodo();
          await seleccionarDesdeSala(d.id_paciente,d.id_cita);
        }else{
          const respuestaPacientes=await get('listarPacientes');
          pacientesCache=extraerLista(respuestaPacientes);
          renderResultadosPacientes();
          renderSala();
          await seleccionarPacienteDirecto(d.id_paciente);
        }
      }catch(error){
        console.warn('IASYN PREATENCIÓN: no se pudo refrescar después de crear paciente.',error);
      }
    });
    ['prePeso','preTalla'].forEach(id=>document.getElementById(id)?.addEventListener('input',calcIMC));
    cargarTodo();
  }


  function actualizarAccionesPaciente(){
    const btnCorregirPre=document.getElementById('preCorregirPreatencion');
    const btnEditar=document.getElementById('preEditarPaciente');
    const btnNuevo=document.getElementById('preIrPacientes');
    const seleccionado=!!val('prePaciente');
    const cita=citasCache.find(c=>txt(c.id_cita)===val('preCita'));
    const citaSinPaciente=!!cita&&!seleccionado;
    const preActual=seleccionado ? preatencionActualSeleccionada_() : null;

    if(btnCorregirPre){
      btnCorregirPre.style.display=(seleccionado&&preActual)?'':'none';
      btnCorregirPre.disabled=!(tiene('preconsulta_signos_vitales')||tiene('preconsulta'));
      btnCorregirPre.title=preActual
        ? 'Corregir signos vitales de esta Preatención con motivo y auditoría.'
        : 'No existe una Preatención guardada para corregir.';
    }

    if(btnEditar){
      btnEditar.style.display=seleccionado?'':'none';
      btnEditar.disabled=false;
      btnEditar.innerHTML='<i class="bi bi-pencil-square me-1"></i>Corregir datos paciente';
      btnEditar.title=seleccionado
        ? (puedeCorregirPaciente()?'Corregir datos administrativos del paciente con trazabilidad.':'La corrección de datos del paciente requiere autorización desde Configuración.')
        : 'Seleccione un paciente.';
    }
    if(btnNuevo){
      btnNuevo.style.display=seleccionado?'none':'';
      btnNuevo.innerHTML=citaSinPaciente
        ? '<i class="bi bi-person-plus me-1"></i>Crear paciente'
        : '<i class="bi bi-person-plus me-1"></i>Nuevo paciente';
      btnNuevo.title=citaSinPaciente?'Crear el registro del paciente de esta cita.':'Crear un paciente nuevo.';
    }
  }



  /* ==========================================================
     IASYN PREATENCIÓN 12
     CREAR PACIENTE DESDE CITA · REUTILIZA MODAL DE SECRETARÍA
     ----------------------------------------------------------
     - No navega al listado general de Pacientes.
     - No crea paciente automáticamente.
     - Prellena solo datos que YA existen en la cita.
     - No crea columnas, hojas ni cambia el backend.
     - Mantiene intactos signos vitales y el formulario activo.
  ========================================================== */
  function contextoPacienteDesdeCitaPreatencion_(){
    const c = citasCache.find(x=>txt(x.id_cita)===val('preCita'));
    if(!c) return null;
    return {
      id_cita: txt(c.id_cita),
      nombre_paciente: nombreCita(c),
      numero_documento: documentoCita(c),
      telefono: txt(c.telefono || c.whatsapp || ''),
      whatsapp: txt(c.whatsapp || c.telefono || ''),
      email: txt(c.email || c.correo || ''),
      servicio: txt(c.tipo_cita || c.motivo || c.servicio || ''),
      ciudad: txt(c.ciudad || 'Guayaquil'),
      origen: 'preatencion'
    };
  }

  function abrirPacienteDesdePreatencion_(){
    const contexto = contextoPacienteDesdeCitaPreatencion_();

    if(contexto && contexto.id_cita && !val('prePaciente')){
      if(typeof window.abrirPacienteSecretaria !== 'function'){
        alert('El formulario de Pacientes no está disponible.');
        return;
      }
      window.abrirPacienteSecretaria('', contexto);
      return;
    }

    /* Flujo espontáneo: conserva origen Preatención aunque id_cita sea opcional. */
    if(typeof window.abrirPacienteSecretaria === 'function'){
      window.abrirPacienteSecretaria('', {origen:'preatencion'});
      return;
    }
    if(typeof window.showScreen === 'function') window.showScreen('pacientes');
  }

  function calcIMC(){ const p=parseFloat(numero(val('prePeso'))),t=parseFloat(numero(val('preTalla')));set('preIMC',p>0&&t>0?(p/((t/100)*(t/100))).toFixed(1):''); }
  function limpiarClinico(){ ['prePeso','preTalla','preIMC','prePAS','prePAD','preFC','preFR','preTemp','preSat','preCadera','preGrasa','preMasa','preCefalico','preToracico','preAbdominal','preAntecedentesTexto'].forEach(id=>set(id,'')); }

  let refrescoReferenciasPreatencionEnCurso_=null;

  async function refrescarReferenciasPreatencion_(){
    /*
      IASYN · SINCRONIZACIÓN QUIRÚRGICA
      Alcance exclusivo: referencias de Pacientes y Citas al reingresar.
      - No modifica signos vitales ni antecedentes escritos.
      - No toca edición, permisos, justificativos ni auditoría.
      - No crea ni modifica PRE / ATE / HC.
      - Si una lectura falla, conserva el último caché válido.
    */
    if(refrescoReferenciasPreatencionEnCurso_) return refrescoReferenciasPreatencionEnCurso_;

    refrescoReferenciasPreatencionEnCurso_=(async()=>{
      const pacienteSeleccionado=val('prePaciente');
      const citaSeleccionada=val('preCita');

      const [rp,rc]=await Promise.allSettled([
        get('listarPacientes'),
        get('listarCitas')
      ]);

      if(rp.status==='fulfilled'){
        pacientesCache=extraerLista(rp.value);
      }else{
        console.warn('IASYN PREATENCIÓN: no se pudieron refrescar pacientes.',rp.reason);
      }

      if(rc.status==='fulfilled'){
        citasCache=extraerLista(rc.value);
      }else{
        console.warn('IASYN PREATENCIÓN: no se pudieron refrescar citas.',rc.reason);
      }

      renderResultadosPacientes();
      renderSala();

      if(pacienteSeleccionado){
        set('prePaciente',pacienteSeleccionado);
        await cargarCitasPaciente(citaSeleccionada);
      }else{
        actualizarContexto();
      }
      actualizarAccionesPaciente();
    })();

    try{
      return await refrescoReferenciasPreatencionEnCurso_;
    }finally{
      refrescoReferenciasPreatencionEnCurso_=null;
    }
  }

  async function cargarTodo(){
    /*
      CARGA ANTIRREGRESIVA:
      1) Pacientes es crítico y se carga SOLO, igual que en la versión estable.
      2) Citas y preatenciones son complementarias: si fallan, NO vacían pacientes.
      3) El selector se pinta inmediatamente al recibir pacientes.
    */
    const resumen=document.getElementById('preSalaResumen');

    try{
      const respuestaPacientes=await get('listarPacientes');
      const listaPacientes=extraerLista(respuestaPacientes);
      if(!listaPacientes.length && respuestaPacientes && respuestaPacientes.success===false){
        throw new Error(respuestaPacientes.message||'No se pudieron cargar pacientes.');
      }
      pacientesCache=listaPacientes;
      renderResultadosPacientes();
    }catch(error){
      console.error('IASYN PREATENCIÓN: error cargando pacientes',error);
      pacientesCache=[];
      const resultados=document.getElementById('preResultadosPaciente');if(resultados)resultados.innerHTML='<div class="pre-empty">No se pudieron leer pacientes.</div>';
      if(resumen) resumen.textContent='No se pudieron leer pacientes.';
      renderSala();
      return;
    }

    try{
      const respuestaCitas=await get('listarCitas');
      citasCache=extraerLista(respuestaCitas);
    }catch(error){
      console.warn('IASYN PREATENCIÓN: citas no disponibles; selector de pacientes continúa operativo.',error);
      citasCache=[];
    }

    try{
      const respuestaPre=await get('listarPreatenciones');
      preatencionesCache=extraerLista(respuestaPre);
    }catch(error){
      console.warn('IASYN PREATENCIÓN: listado de preatenciones no disponible; guardado y búsqueda por paciente continúan operativos.',error);
      preatencionesCache=[];
    }

    renderResultadosPacientes();
    renderSala();
    await cargarCitasPaciente();
    await cargarPendiente();
  }

  function renderResultadosPacientes(){
    const box=document.getElementById('preResultadosPaciente');if(!box)return;const q=norm(val('preBuscarPaciente'));
    if(!q){box.innerHTML='';return;}
    const lista=pacientesCache.filter(p=>norm([nombrePaciente(p),documentoPaciente(p),p.telefono,p.whatsapp].join(' ')).includes(q)).slice(0,12);
    if(!lista.length){box.innerHTML='<div class="pre-empty">No se encontraron pacientes.</div>';return;}
    box.innerHTML=lista.map(p=>`<button type="button" class="pre-result" data-paciente="${esc(p.id_paciente||'')}"><b>${esc(nombrePaciente(p))}</b><small>${esc(documentoPaciente(p)||'Sin documento')} · ${esc(telefonoPaciente(p)||'Sin teléfono')}</small></button>`).join('');
    box.querySelectorAll('[data-paciente]').forEach(b=>b.onclick=()=>seleccionarPacienteDirecto(b.dataset.paciente));
  }
  async function seleccionarPacienteDirecto(idPaciente){
    const p=pacientesCache.find(x=>txt(x.id_paciente)===txt(idPaciente));if(!p)return;cerrarCorreccionPreatencion();set('prePaciente',idPaciente);set('preBuscarPaciente',nombrePaciente(p));const box=document.getElementById('preResultadosPaciente');if(box)box.innerHTML='';cerrarEdicionPaciente();actualizarAccionesPaciente();await cargarCitasPaciente();await cargarPendiente();
  }

  function preDeCita(idCita,idPaciente){
    const lista=preatencionesCache.filter(p=>txt(p.id_cita)===txt(idCita)&&txt(p.id_paciente)===txt(idPaciente));
    lista.sort((a,b)=>txt(b.actualizado_en||b.creado_en).localeCompare(txt(a.actualizado_en||a.creado_en)));return lista[0]||null;
  }
  function estadoSala(c){
    const pre=preDeCita(c.id_cita,c.id_paciente);if(pre&&txt(pre.id_atencion))return {key:'linked',label:'ATENCIÓN INICIADA'};if(pre&&norm(pre.estado)==='pendiente')return {key:'ready',label:'PREATENCIÓN COMPLETADA'};if(/confirm/.test(estadoCita(c)))return {key:'confirm',label:'CITA CONFIRMADA'};return {key:'wait',label:'CITA '+txt(c.estado_cita||c.estado||'PENDIENTE').toUpperCase()};
  }
  function renderSala(){
    const box=document.getElementById('preSalaLista'),res=document.getElementById('preSalaResumen');
    if(!box)return;
    const q=norm(val('preBuscarSala')),hoy=hoyEcuador();
    const lista=citasCache
      .filter(c=>fechaISO(c.fecha_cita||c.fecha||c.fecha_deseada)===hoy&&esCitaUtil(c))
      .filter(c=>{
        const reg=estadoRegistroCita(c),p=reg.paciente||{};
        const nombre=reg.paciente?nombrePaciente(p):nombreCita(c);
        const doc=reg.paciente?documentoPaciente(p):documentoCita(c);
        const tel=reg.paciente?telefonoPaciente(p):telefonoCita(c);
        return !q||norm([nombre,doc,tel,c.hora_inicio,c.estado_cita,c.tipo_cita,c.motivo].join(' ')).includes(q);
      })
      .sort((a,b)=>txt(a.hora_inicio).localeCompare(txt(b.hora_inicio)));

    if(res)res.textContent=`${lista.length} cita(s) de hoy`;
    if(!lista.length){
      box.innerHTML='<div class="pre-empty">No hay citas de hoy con ese filtro.</div>';
      return;
    }

    box.innerHTML=lista.map(c=>{
      const reg=estadoRegistroCita(c),p=reg.paciente||{};
      const nombre=reg.paciente?nombrePaciente(p):nombreCita(c);
      const doc=reg.paciente?documentoPaciente(p):documentoCita(c);
      const tel=reg.paciente?telefonoPaciente(p):telefonoCita(c);
      const e=reg.paciente?estadoSala(c):reg;
      return `<div class="pre-wait-item" data-pre-cita="${esc(c.id_cita||'')}" data-pre-paciente="${esc(reg.paciente?reg.paciente.id_paciente:'')}" data-pre-registro="${esc(reg.key)}">
        <div class="pre-wait-top">
          <div>
            <div class="pre-wait-name">${esc(nombre)}</div>
            <div class="pre-wait-meta">${esc(c.hora_inicio||'')} · ${esc(c.tipo_cita||c.motivo||'Consulta')}<br>${esc(doc||'Sin documento')} · ${esc(tel||'Sin teléfono')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <span class="pre-badge ${esc(reg.key)}">${esc(reg.label)}</span>
            ${reg.paciente?`<span class="pre-badge ${e.key}">${esc(e.label)}</span>`:''}
          </div>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-pre-cita]').forEach(el=>{
      el.onclick=()=>{
        if(el.dataset.prePaciente) seleccionarDesdeSala(el.dataset.prePaciente,el.dataset.preCita);
        else seleccionarCitaSinPaciente(el.dataset.preCita);
      };
    });
  }


  function seleccionarCitaSinPaciente(idCita){
    const c=citasCache.find(x=>txt(x.id_cita)===txt(idCita));
    if(!c)return;
    cerrarCorreccionPreatencion();
    cerrarEdicionPaciente();
    set('prePaciente','');set('preCita',idCita);set('preBuscarPaciente',nombreCita(c));
    limpiarClinico();
    const box=document.getElementById('preResultadosPaciente');if(box)box.innerHTML='';
    const auto=document.getElementById('preCitaAuto');
    if(auto){auto.style.display='block';auto.innerHTML='<b>PACIENTE NO REGISTRADO.</b> La cita existe, pero no hay un registro activo correspondiente en Pacientes. Cree el paciente antes de guardar la Preatención.';}
    const multi=document.getElementById('preCitasMultiples');if(multi)multi.style.display='none';
    actualizarAccionesPaciente();
    actualizarContexto();
    document.querySelectorAll('.pre-wait-item').forEach(x=>x.classList.toggle('active',x.dataset.preCita===idCita));
  }

  async function seleccionarDesdeSala(idPaciente,idCita){
    const p=pacientesCache.find(x=>txt(x.id_paciente)===txt(idPaciente));set('preBuscarPaciente',p?nombrePaciente(p):'');set('prePaciente',idPaciente);const box=document.getElementById('preResultadosPaciente');if(box)box.innerHTML='';actualizarAccionesPaciente();await cargarCitasPaciente(idCita);set('preCita',idCita);set('preCitaVisible',idCita);await cargarPendiente();
    document.querySelectorAll('.pre-wait-item').forEach(x=>x.classList.toggle('active',x.dataset.preCita===idCita));
    document.getElementById('preContexto')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function cargarCitasPaciente(preferida){
    const id=val('prePaciente'),hoy=hoyEcuador();const rel=citasCache.filter(c=>txt(c.id_paciente)===id&&esCitaUtil(c));const hoyRel=rel.filter(c=>fechaISO(c.fecha_cita||c.fecha||c.fecha_deseada)===hoy).sort((a,b)=>txt(a.hora_inicio).localeCompare(txt(b.hora_inicio)));
    const auto=document.getElementById('preCitaAuto'),multi=document.getElementById('preCitasMultiples'),vis=document.getElementById('preCitaVisible');if(auto){auto.style.display='none';auto.textContent='';}if(multi)multi.style.display='none';
    let elegida=txt(preferida);if(!elegida&&hoyRel.length===1)elegida=txt(hoyRel[0].id_cita);set('preCita',elegida);
    if(!hoyRel.length){if(auto){auto.style.display='block';auto.textContent='Sin cita de hoy · Preatención espontánea';}}else if(hoyRel.length===1){const c=hoyRel[0];if(auto){auto.style.display='block';auto.textContent=`Cita de hoy vinculada automáticamente · ${txt(c.hora_inicio)} · ${txt(c.tipo_cita||c.motivo||'Consulta')}`;}}else{if(multi)multi.style.display='block';if(vis){vis.innerHTML=hoyRel.map(c=>`<option value="${esc(c.id_cita||'')}">${esc([c.hora_inicio||'',c.tipo_cita||c.motivo||'Consulta'].filter(Boolean).join(' · '))}</option>`).join('');if(elegida&&[...vis.options].some(o=>o.value===elegida))vis.value=elegida;else{vis.selectedIndex=0;set('preCita',vis.value);}}}
    actualizarContexto();
  }
  function actualizarContexto(){
    const box=document.getElementById('preContexto');if(!box)return;
    const p=pacientesCache.find(x=>txt(x.id_paciente)===val('prePaciente'));
    const c=citasCache.find(x=>txt(x.id_cita)===val('preCita'));
    if(p){
      box.innerHTML=`<b>${esc(nombrePaciente(p))}</b> · <span class="pre-badge registered">PACIENTE REGISTRADO</span> · Documento: ${esc(documentoPaciente(p)||'—')} · Tel/WhatsApp: ${esc(telefonoPaciente(p)||'—')}<br>${c?`Cita: ${esc(c.id_cita||'')} · ${esc(fechaVista(c.fecha_cita||c.fecha||c.fecha_deseada))} ${esc(c.hora_inicio||'')} · ${esc(c.nombre_medico||c.id_medico||'—')}`:'Sin cita seleccionada · atención espontánea'}`;
      return;
    }
    if(c){
      const reg=estadoRegistroCita(c);
      box.innerHTML=`<b>${esc(nombreCita(c))}</b> · <span class="pre-badge ${esc(reg.key)}">${esc(reg.label)}</span> · Documento: ${esc(documentoCita(c)||'—')} · Tel/WhatsApp: ${esc(telefonoCita(c)||'—')}<br>Cita: ${esc(c.id_cita||'')} · ${esc(fechaVista(c.fecha_cita||c.fecha||c.fecha_deseada))} ${esc(c.hora_inicio||'')} · ${esc(c.nombre_medico||c.id_medico||'—')}`;
      return;
    }
    box.textContent='Seleccione un paciente.';
  }


  async function cargarPendiente(){
    limpiarClinico();actualizarContexto();const idPaciente=val('prePaciente'),idCita=val('preCita');if(!idPaciente)return;
    try{const r=await get('buscarPreatencionPendientePorPaciente',{id_paciente:idPaciente,id_cita:idCita,contexto_exacto:'SI'});if(!r||!r.id_preatencion)return;set('prePeso',r.peso_kg);set('preTalla',r.talla_cm);set('preIMC',r.imc);const pa=txt(r.presion_arterial).match(/^(\d{2,3})\/(\d{2,3})$/);set('prePAS',pa?pa[1]:'');set('prePAD',pa?pa[2]:'');set('preFC',r.frecuencia_cardiaca);set('preFR',r.frecuencia_respiratoria);set('preTemp',r.temperatura);set('preSat',r.saturacion);set('preCadera',r.perimetro_cadera);set('preGrasa',r.porcentaje_grasa);set('preMasa',r.masa_muscular);set('preCefalico',r.perimetro_cefalico);set('preToracico',r.perimetro_toracico);set('preAbdominal',r.perimetro_abdominal);set('preAntecedentesTexto',r.antecedentes_referidos);}
    catch(e){console.warn('IASYN PREATENCIÓN: pendiente',e);}
  }

  async function guardar(){
    const idPaciente=val('prePaciente'),idCita=val('preCita');if(!idPaciente){alert('Seleccione un paciente.');return;}if(!tienePreatencion()){alert('Su usuario no tiene permiso de Preatención.');return;}
    const pas=val('prePAS').replace(/\D/g,''),pad=val('prePAD').replace(/\D/g,'');if((pas&&!pad)||(!pas&&pad)){alert('Complete presión sistólica y diastólica.');return;}
    const u=usuario(),cita=citasCache.find(x=>txt(x.id_cita)===idCita)||{};const data={id_paciente:idPaciente,id_cita:idCita,id_medico:cita.id_medico||'',peso_kg:numero(val('prePeso')),talla_cm:numero(val('preTalla')),presion_arterial:pas&&pad?pas+'/'+pad:'',frecuencia_cardiaca:numero(val('preFC')),frecuencia_respiratoria:numero(val('preFR')),temperatura:numero(val('preTemp')),saturacion:numero(val('preSat')),perimetro_cadera:numero(val('preCadera')),porcentaje_grasa:numero(val('preGrasa')),masa_muscular:numero(val('preMasa')),perimetro_cefalico:numero(val('preCefalico')),perimetro_toracico:numero(val('preToracico')),perimetro_abdominal:numero(val('preAbdominal')),antecedentes_referidos:val('preAntecedentesTexto'),creado_por:u.usuario||u.nombre_completo||'Secretaría',token:token()};
    const btn=document.getElementById('preGuardar');if(btn)btn.disabled=true;try{const r=await post('guardarPreatencion',data);if(!r||r.success===false)throw new Error(r?.message||'No se pudo guardar.');await cargarTodo();alert('Preatención guardada. Puede continuar con el siguiente paciente.');}catch(e){alert(e.message||'No se pudo guardar la preatención.');}finally{if(btn)btn.disabled=false;}
  }


  function preatencionActualSeleccionada_(){
    const idPaciente=val('prePaciente');
    const idCita=val('preCita');
    if(!idPaciente) return null;

    let lista=preatencionesCache.filter(p=>txt(p.id_paciente)===idPaciente);
    if(idCita){
      lista=lista.filter(p=>txt(p.id_cita)===idCita);
    }else{
      lista=lista.filter(p=>!txt(p.id_cita));
    }

    lista.sort((a,b)=>txt(b.actualizado_en||b.creado_en).localeCompare(txt(a.actualizado_en||a.creado_en)));
    return lista[0]||null;
  }

  function cargarSignosDesdePreatencion_(r){
    if(!r) return;
    set('prePeso',r.peso_kg);
    set('preTalla',r.talla_cm);
    set('preIMC',r.imc);
    const pa=txt(r.presion_arterial).match(/^(\d{2,3})\/(\d{2,3})$/);
    set('prePAS',pa?pa[1]:'');
    set('prePAD',pa?pa[2]:'');
    set('preFC',r.frecuencia_cardiaca);
    set('preFR',r.frecuencia_respiratoria);
    set('preTemp',r.temperatura);
    set('preSat',r.saturacion);
    set('preCadera',r.perimetro_cadera);
    set('preGrasa',r.porcentaje_grasa);
    set('preMasa',r.masa_muscular);
    set('preCefalico',r.perimetro_cefalico);
    set('preToracico',r.perimetro_toracico);
    set('preAbdominal',r.perimetro_abdominal);
    set('preAntecedentesTexto',r.antecedentes_referidos);
    calcIMC();
  }


  function actualizarJustificativoPreatencion_(){
    const tipo=val('preCorregirTipo');
    const esOtro=tipo==='Otro';
    const detalleWrap=document.getElementById('preCorregirDetalleWrap');
    const obsWrap=document.getElementById('preCorregirDetalleOpcionalWrap');

    if(detalleWrap) detalleWrap.style.display=esOtro?'':'none';
    if(obsWrap) obsWrap.style.display=(!tipo||esOtro)?'none':'';

    if(!esOtro) set('preCorregirMotivo','');
    if(!tipo||esOtro) set('preCorregirObservacion','');
  }

  function abrirCorreccionPreatencion(){
    if(!(tiene('preconsulta_signos_vitales')||tiene('preconsulta'))){
      alert('Su usuario no tiene autorización para corregir signos vitales de Preatención.');
      return;
    }

    const preActual=preatencionActualSeleccionada_();
    if(!preActual||!preActual.id_preatencion){
      alert('No existe una Preatención guardada para este paciente y contexto.');
      return;
    }

    preatencionCorreccionOriginal=JSON.parse(JSON.stringify(preActual));
    cargarSignosDesdePreatencion_(preActual);
    set('preCorregirTipo','');
    set('preCorregirMotivo','');
    set('preCorregirObservacion','');
    actualizarJustificativoPreatencion_();
    document.getElementById('preCorregirSignosBox')?.classList.add('show');
    document.getElementById('preGuardar').style.display='none';
    document.getElementById('preCorregirMotivo')?.focus();
  }

  function cerrarCorreccionPreatencion(){
    document.getElementById('preCorregirSignosBox')?.classList.remove('show');
    const normal=document.getElementById('preGuardar');
    if(normal) normal.style.display='';
    preatencionCorreccionOriginal=null;
    set('preCorregirTipo','');
    set('preCorregirMotivo','');
    set('preCorregirObservacion','');
    actualizarJustificativoPreatencion_();
  }

  async function guardarCorreccionPreatencion(){
    if(!preatencionCorreccionOriginal||!preatencionCorreccionOriginal.id_preatencion) return;

    const tipoJustificativo=val('preCorregirTipo');
    const motivoLibre=val('preCorregirMotivo');
    const observacion=val('preCorregirObservacion');

    if(!tipoJustificativo){
      alert('Seleccione el tipo de justificativo.');
      return;
    }

    if(tipoJustificativo==='Otro' && motivoLibre.length<3){
      alert('Especifique el motivo cuando selecciona "Otro".');
      return;
    }

    if(motivoLibre.length>150 || observacion.length>150){
      alert('El detalle del justificativo no puede superar 150 caracteres.');
      return;
    }

    /*
     * Semántica IASYN:
     * - tipo_justificativo = categoría normalizada.
     * - motivo = explicación concreta, solo si realmente se escribió.
     * Nunca se repite automáticamente la categoría en motivo.
     */
    const motivoFinal = tipoJustificativo==='Otro'
      ? motivoLibre
      : observacion;

    const pas=val('prePAS').replace(/\D/g,'');
    const pad=val('prePAD').replace(/\D/g,'');
    if((pas&&!pad)||(!pas&&pad)){
      alert('Complete presión sistólica y diastólica.');
      return;
    }

    const data={
      id_preatencion:preatencionCorreccionOriginal.id_preatencion,
      peso_kg:numero(val('prePeso')),
      talla_cm:numero(val('preTalla')),
      presion_arterial:pas&&pad?pas+'/'+pad:'',
      frecuencia_cardiaca:numero(val('preFC')),
      frecuencia_respiratoria:numero(val('preFR')),
      temperatura:numero(val('preTemp')),
      saturacion:numero(val('preSat')),
      perimetro_cadera:numero(val('preCadera')),
      porcentaje_grasa:numero(val('preGrasa')),
      masa_muscular:numero(val('preMasa')),
      perimetro_cefalico:numero(val('preCefalico')),
      perimetro_toracico:numero(val('preToracico')),
      perimetro_abdominal:numero(val('preAbdominal')),
      tipo_justificativo:tipoJustificativo,
      motivo_correccion:motivoFinal,
      observacion_correccion:observacion,
      token:token()
    };

    const btn=document.getElementById('preCorregirGuardar');
    if(btn) btn.disabled=true;

    try{
      const r=await post('corregirPreatencionAuditable',data);
      if(!r||r.success===false) throw new Error(r?.message||'No se pudo corregir la Preatención.');

      cerrarCorreccionPreatencion();
      await cargarTodo();
      const idPaciente=txt(r.id_paciente||val('prePaciente'));
      const idCita=txt(r.id_cita||val('preCita'));
      if(idPaciente){
        if(idCita) await seleccionarDesdeSala(idPaciente,idCita);
        else await seleccionarPacienteDirecto(idPaciente);
      }

      alert(r.sin_cambios
        ? 'No había cambios para guardar.'
        : (r.examen_fisico_actualizado
            ? 'Preatención corregida. También se actualizó el Examen físico vinculado. La modificación quedó auditada.'
            : 'Preatención corregida y registrada en auditoría.'));
    }catch(e){
      alert(e.message||'No se pudo corregir la Preatención.');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  function actualizarJustificativoPaciente_(){
    const tipo=val('preEdTipoJustificativo');
    const esOtro=tipo==='Otro';
    const motivoWrap=document.getElementById('preEdMotivoWrap');
    const obsWrap=document.getElementById('preEdObsWrap');
    if(motivoWrap) motivoWrap.style.display=esOtro?'':'none';
    if(obsWrap) obsWrap.style.display=(!tipo||esOtro)?'none':'';
    if(!esOtro) set('preEdMotivo','');
    if(!tipo||esOtro) set('preEdObservacion','');
  }

  function abrirEdicionPaciente(){
    if(!puedeCorregirPaciente()){
      alert('Su usuario no tiene autorización para corregir datos administrativos del paciente.');
      return;
    }
    const p=pacientesCache.find(x=>txt(x.id_paciente)===val('prePaciente'));
    if(!p){alert('Seleccione un paciente.');return;}

    pacienteOriginal=JSON.parse(JSON.stringify(p));
    set('preEdNombres',p.nombres||'');
    set('preEdApellidos',p.apellidos||'');
    set('preEdDocumento',documentoPaciente(p));
    set('preEdNacimiento',String(p.fecha_nacimiento||'').substring(0,10));
    set('preEdSexo',p.sexo||'');
    set('preEdEstadoCivil',p.estado_civil||'');
    set('preEdOcupacion',p.ocupacion||'');
    set('preEdCiudad',p.ciudad||'');
    set('preEdTelefono',p.telefono||'');
    set('preEdWhatsapp',p.whatsapp||'');
    set('preEdEmail',p.email||p.correo||'');
    set('preEdDireccion',p.direccion||'');
    set('preEdAseguradora',p.aseguradora||'');
    set('preEdContacto',p.contacto_emergencia||'');
    set('preEdTelefonoEmergencia',p.telefono_emergencia||'');
    set('preEdTipoJustificativo','');
    set('preEdMotivo','');
    set('preEdObservacion','');
    actualizarJustificativoPaciente_();
    document.getElementById('preEditarBox')?.classList.add('show');
  }

  function cerrarEdicionPaciente(){
    document.getElementById('preEditarBox')?.classList.remove('show');
    pacienteOriginal=null;
    set('preEdTipoJustificativo','');
    set('preEdMotivo','');
    set('preEdObservacion','');
    actualizarJustificativoPaciente_();
  }

  async function guardarCorreccionPaciente(){
    if(!pacienteOriginal)return;

    const tipo=val('preEdTipoJustificativo');
    const motivoLibre=val('preEdMotivo');
    const observacion=val('preEdObservacion');

    if(!tipo){alert('Seleccione el tipo de justificativo.');return;}
    if(tipo==='Otro' && motivoLibre.length<3){
      alert('Especifique el motivo cuando selecciona "Otro".');
      return;
    }
    if(motivoLibre.length>150 || observacion.length>150){
      alert('El detalle del justificativo no puede superar 150 caracteres.');
      return;
    }

    const documento=val('preEdDocumento').replace(/\D/g,'');
    if(documento && documento.length!==10){
      alert('La cédula debe contener 10 dígitos.');
      return;
    }

    const data={
      id_paciente:pacienteOriginal.id_paciente,
      nombres:val('preEdNombres'),
      apellidos:val('preEdApellidos'),
      numero_documento:documento,
      fecha_nacimiento:val('preEdNacimiento'),
      sexo:val('preEdSexo'),
      estado_civil:val('preEdEstadoCivil'),
      ocupacion:val('preEdOcupacion'),
      ciudad:val('preEdCiudad'),
      telefono:val('preEdTelefono'),
      whatsapp:val('preEdWhatsapp'),
      email:val('preEdEmail'),
      direccion:val('preEdDireccion'),
      aseguradora:val('preEdAseguradora'),
      contacto_emergencia:val('preEdContacto'),
      telefono_emergencia:val('preEdTelefonoEmergencia'),
      tipo_justificativo:tipo,
      motivo_correccion:tipo==='Otro'?motivoLibre:observacion,
      token:token()
    };

    const btn=document.getElementById('preEdGuardar');
    if(btn)btn.disabled=true;
    try{
      const r=await post('editarPacienteAuditable',data);
      if(!r||r.success===false)throw new Error(r?.message||'No se pudo corregir el paciente.');
      const id=pacienteOriginal.id_paciente;
      cerrarEdicionPaciente();
      await cargarTodo();
      await seleccionarPacienteDirecto(id);
      alert(r.sin_cambios
        ? 'No había cambios para guardar.'
        : 'Datos administrativos corregidos. La modificación quedó registrada en auditoría.');
    }catch(e){
      alert(e.message||'No se pudo corregir el paciente.');
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  async function abrirDesdeCita(idCita){
    if(!document.getElementById('preatencion'))inyectar();if(!citasCache.length)await cargarTodo();const c=citasCache.find(x=>txt(x.id_cita)===txt(idCita));if(!c){alert('No se encontró la cita.');return;}if(!c.id_paciente){alert('La cita todavía no está vinculada a un paciente. Cree o vincule primero el paciente.');return;}await seleccionarDesdeSala(c.id_paciente,c.id_cita);const btn=document.querySelector('.menu button[data-screen="preatencion"]');if(typeof window.showScreen==='function')window.showScreen('preatencion',btn||null);
  }

  const apiPreatencion={abrirDesdeCita,cargarTodo,version:'3.7.0'};
  window.IASYN_PREATENCION=apiPreatencion;
  /* Compatibilidad temporal con consumidores heredados. */
  window.AUROSANAX_PREATENCION=apiPreatencion;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inyectar,{once:true});else setTimeout(inyectar,0);
})();
