/***********************************************************************
 IASYN ERP DEMO
 Archivo: auditoria_clinica.js
 Módulo: Auditoría clínica independiente
 Versión: 4.0.2
 -----------------------------------------------------------------------
 OBJETIVO
 - Consultar la hoja auditoria_clinica y administrar el control de correcciones.
 - Mantener esta auditoría separada de seguridad.js y de la bitácora
   administrativa de accesos/usuarios.
 - Mostrar cambios de Diagnóstico, Plan clínico y Recetas.
 - Estructura preparada para Historia clínica futura sin activarla todavía.
 - Mostrar la ventana configurable de corrección y las enmiendas excepcionales.
 - La atención en proceso continúa libre; el control inicia al finalizarla.
 - Acceso exclusivo para Administrador; el backend vuelve a validar token.
 - Presentar los eventos más recientes primero sin alterar la fuente persistida.
************************************************************************/

/*
 AISLAMIENTO IASYN
 - Sin URLs, Spreadsheet IDs ni Drive IDs directos.
 - Seguridad y endpoint IASYN tienen prioridad.
 - La auditoría no modifica registros clínicos: consulta eventos y solo guarda
   la configuración administrativa de la ventana de corrección.
 - Los nombres CSS auro-* se conservan porque son contratos visuales internos.
*/
(function(){
  'use strict';

  const MODULO = 'IASYN AUDITORÍA CLÍNICA';
  const state = {
    preparado: false,
    cargando: false,
    cargado: false,
    eventos: [],
    filtrados: [],
    config: {control_edicion:'SI', horas_edicion:24, correccion_excepcional:'SI'}
  };

  function texto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function normalizar(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  function escapar(valor){
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function apiUrl(){
    try{
      if(typeof IASYN_API_URL !== 'undefined' && IASYN_API_URL) return texto(IASYN_API_URL);
    }catch(_e){}
    if(window.IASYN_SEGURIDAD?.configuracion?.apiUrl) return texto(window.IASYN_SEGURIDAD.configuracion.apiUrl);
    if(window.IASYN_SEGURIDAD?.config?.apiUrl) return texto(window.IASYN_SEGURIDAD.config.apiUrl);
    try{
      if(typeof API_URL !== 'undefined' && API_URL) return texto(API_URL);
    }catch(_e){}
    return texto(window.API_URL || '');
  }

  function seguridad(){
    /* IASYN primero; alias AUROSANAX solo como compatibilidad temporal. */
    return window.IASYN_SEGURIDAD || window.AUROSANAX_SEGURIDAD || null;
  }

  function usuarioActual(){
    const seg = seguridad();
    if(!seg || typeof seg.obtenerUsuario !== 'function') return {};
    return seg.obtenerUsuario() || {};
  }

  function esAdministrador(){
    const u = usuarioActual();
    return normalizar(u.rol || u.nombre_rol || u.perfil || u.tipo_usuario) === 'ADMINISTRADOR';
  }

  function tokenActual(){
    const seg = seguridad();
    if(!seg || typeof seg.obtenerToken !== 'function') return '';
    return texto(seg.obtenerToken());
  }

  function instalarEstilos(){
    if(document.getElementById('iasynAuditoriaClinicaStyles') || document.getElementById('auroAuditoriaClinicaStyles')) return;
    const style = document.createElement('style');
    style.id = 'iasynAuditoriaClinicaStyles';
    style.textContent = `
      #securityAuditoriaClinica .auro-audit-badge{
        display:inline-flex;align-items:center;justify-content:center;
        border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;
        white-space:nowrap;border:1px solid transparent;
      }
      #securityAuditoriaClinica .auro-audit-module{background:#fdf2f8;color:#8b1e5a;border-color:#f4c7dc}
      #securityAuditoriaClinica .auro-audit-action{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
      #securityAuditoriaClinica .auro-audit-24-si{background:#dcfce7;color:#166534;border-color:#bbf7d0}
      #securityAuditoriaClinica .auro-audit-24-no{background:#fff1f2;color:#be123c;border-color:#fecdd3}
      #securityAuditoriaClinica .auro-audit-24-open{background:#fef3c7;color:#92400e;border-color:#fde68a}
      #securityAuditoriaClinica .auro-audit-24-na{background:#f1f5f9;color:#475569;border-color:#e2e8f0}
      #securityAuditoriaClinica .auro-audit-person{font-weight:850;color:#111827}
      #securityAuditoriaClinica .auro-audit-sub{font-size:12px;color:#64748b;font-weight:700;margin-top:2px}
      #securityAuditoriaClinica .auro-audit-detail-btn{min-width:38px}
      #securityAuditoriaClinica .auro-audit-mobile-card{border-left:4px solid #c23b83!important}
      .auro-audit-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .auro-audit-detail-box{border:1px solid #e5e7eb;border-radius:16px;padding:12px;background:#f8fafc;min-width:0}
      .auro-audit-detail-box h6{font-weight:900;margin:0 0 8px;color:#334155}
      .auro-audit-detail-box pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.45;max-height:360px;overflow:auto;color:#0f172a}
      .auro-audit-meta{border:1px solid #f1d4e5;background:#fff7fb;border-radius:16px;padding:12px;margin-bottom:12px;font-size:13px;line-height:1.55}
      #securityAuditoriaClinica .auro-audit-control-card{border:1px solid #ead5e2;border-radius:18px;padding:16px;background:linear-gradient(180deg,#fff,#fffafd);box-shadow:0 7px 22px rgba(15,23,42,.045)}
      #securityAuditoriaClinica .auro-audit-control-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      #securityAuditoriaClinica .auro-audit-control-head strong{display:block;color:#111827;font-size:15px;font-weight:900}
      #securityAuditoriaClinica .auro-audit-control-head small{display:block;color:#64748b;font-size:12px;font-weight:650;margin-top:3px}
      #securityAuditoriaClinica .auro-audit-control-note{margin-top:12px;padding:9px 11px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:12px;font-weight:700}

      /* IASYN 4.0.1 — mejora visual local, sin tocar CSS global */
      #securityAuditoriaClinica #audClinRefrescar{
        background:linear-gradient(135deg,#7a163f,#a52167)!important;
        border:1px solid #7a163f!important;
        color:#fff!important;
        font-weight:850;
        box-shadow:0 7px 18px rgba(122,22,63,.16)!important;
        transition:transform .16s ease,box-shadow .16s ease,opacity .16s ease;
      }
      #securityAuditoriaClinica #audClinRefrescar:hover:not(:disabled){
        transform:translateY(-1px);
        box-shadow:0 10px 22px rgba(122,22,63,.22);
      }
      #securityAuditoriaClinica #audClinRefrescar:disabled{
        opacity:.72;
        cursor:wait;
        transform:none;
      }
      #securityAuditoriaClinica #audClinBuscar{
        transition:border-color .16s ease,box-shadow .16s ease,background .16s ease;
      }
      #securityAuditoriaClinica #audClinBuscar:focus{
        border-color:#b72b73!important;
        box-shadow:0 0 0 3px rgba(183,43,115,.12)!important;
        background:#fff!important;
        outline:none;
      }

      @media(max-width:720px){.auro-audit-detail-grid{grid-template-columns:1fr}.auro-audit-control-head{display:grid!important;grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function setTexto(id, valor){
    const el = document.getElementById(id);
    if(el) el.textContent = valor;
  }

  function setEstado(mensaje, error){
    const el = document.getElementById('audClinEstado');
    if(!el) return;
    el.innerHTML = (error ? '<i class="bi bi-exclamation-triangle me-1"></i>' : '<i class="bi bi-shield-check me-1"></i>') + escapar(mensaje || '');
    el.style.background = error ? '#fff1f2' : '';
    el.style.borderColor = error ? '#fecdd3' : '';
    el.style.color = error ? '#be123c' : '';
  }

  function fechaISO(valor){
    const raw = texto(valor);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }

  function formatearFechaHora(valor){
    const raw = texto(valor);
    if(!raw) return '—';

    const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(local){
      return `${local[3]}/${local[2]}/${local[1]} ${local[4]}:${local[5]}`;
    }

    const fecha = new Date(raw);
    if(isNaN(fecha.getTime())) return raw;

    return new Intl.DateTimeFormat('es-EC', {
      timeZone:'America/Guayaquil',
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',hour12:false
    }).format(fecha);
  }

  /*
    Convierte fecha_hora / creado_en a un valor comparable sin modificar
    el registro original. Los valores locales YYYY-MM-DD HH:mm:ss se comparan
    por sus componentes; otros formatos válidos usan Date.parse().
  */
  function marcaTiempoOrden(evento){
    const raw = texto(evento && (evento.fecha_hora || evento.creado_en));
    if(!raw) return 0;

    const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(local){
      return Date.UTC(
        Number(local[1]),
        Number(local[2]) - 1,
        Number(local[3]),
        Number(local[4]),
        Number(local[5]),
        Number(local[6] || 0)
      );
    }

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compararEventosRecientes(a, b){
    const diferencia = marcaTiempoOrden(b) - marcaTiempoOrden(a);
    if(diferencia) return diferencia;

    /*
      Desempate determinista. No cambia auditoría ni IDs.
    */
    return texto(b && b.id_auditoria).localeCompare(
      texto(a && a.id_auditoria),
      'es',
      {numeric:true,sensitivity:'base'}
    );
  }

  function horaActualEcuador(){
    try{
      return new Intl.DateTimeFormat('es-EC', {
        timeZone:'America/Guayaquil',
        day:'2-digit',month:'2-digit',year:'numeric',
        hour:'2-digit',minute:'2-digit',hour12:false
      }).format(new Date());
    }catch(_e){
      return '';
    }
  }

  function nombreModulo(valor){
    const n = normalizar(valor);
    if(n === 'ATENCION') return 'Atención';
    if(n === 'DIAGNOSTICO') return 'Diagnóstico';
    if(n === 'PLAN') return 'Plan clínico';
    if(n === 'RECETA') return 'Receta';
    if(n === 'HISTORIA_CLINICA') return 'Historia clínica';
    return texto(valor) || '—';
  }

  function nombreAccion(valor){
    const n = normalizar(valor);
    if(n === 'FINALIZACION') return 'Finalización';
    if(n === 'REGISTRO') return 'Registro';
    if(n === 'EMISION') return 'Emisión';
    if(n === 'CORRECCION') return 'Corrección';
    if(n === 'ENMIENDA') return 'Enmienda';
    return texto(valor) || '—';
  }

  function ventanaHTML(evento){
    const v = normalizar(evento && (evento.dentro_ventana || evento.dentro_24h));
    const horas = texto(evento && evento.horas_desde_referencia);
    const limite = Number(state.config.horas_edicion || 24);

    if(v === 'SI'){
      return `<span class="auro-audit-badge auro-audit-24-si">Dentro del plazo${horas ? ' · '+escapar(horas)+' h' : ''}</span>`;
    }
    if(v === 'NO'){
      return `<span class="auro-audit-badge auro-audit-24-no">Fuera del plazo${horas ? ' · '+escapar(horas)+' h' : ''}</span>`;
    }
    if(v === 'ABIERTA'){
      return '<span class="auro-audit-badge auro-audit-24-open">Atención abierta</span>';
    }
    if(v === 'SIN_LIMITE'){
      return '<span class="auro-audit-badge auro-audit-24-open">Control temporal desactivado</span>';
    }
    return `<span class="auro-audit-badge auro-audit-24-na">No aplica${limite ? ' · regla '+escapar(limite)+' h' : ''}</span>`;
  }

  function actorHTML(evento){
    const medico = texto(evento && evento.nombre_medico);
    const usuario = texto(evento && evento.usuario);
    const rol = texto(evento && evento.rol);
    const principal = medico || usuario || 'Sin actor identificado';
    const secundario = usuario && usuario !== medico
      ? usuario + (rol ? ' · '+rol : '')
      : (rol || '');

    return `<div class="auro-audit-person">${escapar(principal)}</div>${secundario ? `<div class="auro-audit-sub">${escapar(secundario)}</div>` : ''}`;
  }

  function coincideFiltros(evento){
    const desde = texto(document.getElementById('audClinDesde')?.value);
    const hasta = texto(document.getElementById('audClinHasta')?.value);
    const modulo = normalizar(document.getElementById('audClinModulo')?.value);
    const accion = normalizar(document.getElementById('audClinAccion')?.value);
    const q = normalizar(document.getElementById('audClinBuscar')?.value);
    const fecha = fechaISO(evento.fecha_hora || evento.creado_en);

    if(desde && fecha && fecha < desde) return false;
    if(hasta && fecha && fecha > hasta) return false;
    if(modulo && normalizar(evento.modulo) !== modulo) return false;
    if(accion && normalizar(evento.accion) !== accion) return false;

    if(q){
      const bolsa = normalizar([
        evento.id_auditoria,
        evento.id_paciente,
        evento.nombre_paciente,
        evento.id_atencion,
        evento.numero_consulta,
        evento.id_historia,
        evento.id_registro,
        evento.id_receta,
        evento.id_plan,
        evento.id_diagnostico,
        evento.codigo_cie10,
        evento.id_medico,
        evento.nombre_medico,
        evento.id_usuario,
        evento.usuario,
        evento.rol,
        evento.modulo,
        evento.accion,
        evento.tipo_justificativo,
        evento.motivo
      ].join(' '));
      if(!bolsa.includes(q)) return false;
    }
    return true;
  }

  function actualizarResumen(){
    const lista = state.filtrados;
    setTexto('audClinTotal', String(lista.length));
    setTexto('audClinDentro24', String(lista.filter(e => normalizar(e.dentro_ventana || e.dentro_24h) === 'SI').length));
    setTexto('audClinFuera24', String(lista.filter(e => normalizar(e.dentro_ventana || e.dentro_24h) === 'NO').length));
    setTexto('audClinUltimo', lista.length ? formatearFechaHora(lista[0].fecha_hora || lista[0].creado_en) : '—');
  }

  function render(){
    /*
      IASYN 4.0.1:
      El orden es exclusivamente de presentación. state.eventos conserva los
      datos recibidos y la base/backend no se modifica.
    */
    state.filtrados = state.eventos
      .filter(coincideFiltros)
      .slice()
      .sort(compararEventosRecientes);

    actualizarResumen();

    const body = document.getElementById('audClinBody');
    const mobile = document.getElementById('audClinMobile');

    if(!state.filtrados.length){
      const hayEventos = state.eventos.length > 0;
      const vacio = hayEventos
        ? '<i class="bi bi-funnel"></i>No hay eventos que coincidan con los filtros seleccionados.'
        : '<i class="bi bi-clipboard2-check"></i><b>Aún no hay correcciones auditadas.</b><br><span>Es normal mientras no se haya corregido una atención finalizada. La primera corrección de Diagnóstico, Plan o Receta aparecerá aquí automáticamente.</span>';
      if(body) body.innerHTML = `<tr><td colspan="8" class="security-empty">${vacio}</td></tr>`;
      if(mobile) mobile.innerHTML = `<div class="mobile-card security-empty">${vacio}</div>`;
      return;
    }

    if(body){
      body.innerHTML = state.filtrados.map(function(e, index){
        return `
          <tr>
            <td>${escapar(formatearFechaHora(e.fecha_hora || e.creado_en))}</td>
            <td><div class="auro-audit-person">${escapar(e.nombre_paciente || '—')}</div><div class="auro-audit-sub">${escapar(e.id_paciente || '')}</div></td>
            <td>${escapar(e.numero_consulta || '—')}<div class="auro-audit-sub">${escapar(e.id_atencion || '')}</div></td>
            <td><span class="auro-audit-badge auro-audit-module">${escapar(nombreModulo(e.modulo))}</span></td>
            <td><span class="auro-audit-badge auro-audit-action">${escapar(nombreAccion(e.accion))}</span></td>
            <td>${actorHTML(e)}</td>
            <td>${ventanaHTML(e)}</td>
            <td><button type="button" class="btn-line btn-sm auro-audit-detail-btn" onclick="window.IASYN_AUDITORIA_CLINICA.verDetalle(${index})" title="Ver detalle"><i class="bi bi-search"></i></button></td>
          </tr>`;
      }).join('');
    }

    if(mobile){
      mobile.innerHTML = state.filtrados.map(function(e, index){
        return `
          <div class="mobile-card auro-audit-mobile-card">
            <b>${escapar(nombreModulo(e.modulo))} · ${escapar(nombreAccion(e.accion))}</b>
            <div class="line"><span>Fecha</span><span>${escapar(formatearFechaHora(e.fecha_hora || e.creado_en))}</span></div>
            <div class="line"><span>Paciente</span><span>${escapar(e.nombre_paciente || '—')}</span></div>
            <div class="line"><span>Consulta</span><span>${escapar(e.numero_consulta || '—')}</span></div>
            <div class="line"><span>Médico / usuario</span><span>${escapar(e.nombre_medico || e.usuario || '—')}</span></div>
            <div class="line"><span>Ventana</span><span>${ventanaHTML(e)}</span></div>
            <button type="button" class="btn-line w-100 mt-2" onclick="window.IASYN_AUDITORIA_CLINICA.verDetalle(${index})"><i class="bi bi-search me-1"></i> Ver detalle</button>
          </div>`;
      }).join('');
    }
  }

  function jsonLegible(valor){
    const raw = texto(valor);
    if(!raw) return 'Sin información.';
    try{
      return JSON.stringify(JSON.parse(raw), null, 2);
    }catch(_e){
      return raw;
    }
  }

  function verDetalle(index){
    const e = state.filtrados[Number(index)];
    if(!e) return;

    const modal = document.getElementById('modalConfig');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    if(!modal || !title || !body) return;

    title.textContent = 'Detalle de auditoría clínica';
    body.innerHTML = `
      <div class="auro-audit-meta">
        <b>${escapar(nombreModulo(e.modulo))} · ${escapar(nombreAccion(e.accion))}</b><br>
        Paciente: ${escapar(e.nombre_paciente || '—')} · Consulta: ${escapar(e.numero_consulta || '—')}<br>
        Fecha: ${escapar(formatearFechaHora(e.fecha_hora || e.creado_en))}<br>
        Actor: ${escapar(e.nombre_medico || e.usuario || '—')}<br>
        Justificativo: ${escapar(e.tipo_justificativo || e.motivo || '—')}${texto(e.tipo_justificativo) && texto(e.motivo) && normalizar(e.motivo) !== normalizar(e.tipo_justificativo) ? ' · '+escapar(e.motivo) : ''}<br>
        Estado de auditoría: ${escapar(e.estado || '—')}<br>
        Ventana: ${escapar(e.dentro_ventana || e.dentro_24h || 'NO_APLICA')}${texto(e.horas_desde_referencia) ? ' · '+escapar(e.horas_desde_referencia)+' h' : ''}${texto(e.plazo_horas_configurado) ? ' / límite '+escapar(e.plazo_horas_configurado)+' h' : ''}<br>
        Referencia de cierre: ${escapar(formatearFechaHora(e.fecha_referencia))} · Excepcional: ${escapar(e.correccion_excepcional || 'NO')}
      </div>`;
    modal.classList.add('show');
  }

  function aplicarHorasConfig(horas){
    horas = Number(horas || 24);
    const preset = document.getElementById('audClinPlazoPreset');
    const custom = document.getElementById('audClinHorasCustom');
    const wrap = document.getElementById('audClinHorasCustomWrap');
    if(!preset || !custom || !wrap) return;

    if([24,48,72].includes(horas)){
      preset.value = String(horas);
      wrap.style.display = 'none';
    }else{
      preset.value = 'PERSONALIZADO';
      custom.value = String(horas);
      wrap.style.display = '';
    }
  }

  function horasConfigSeleccionadas(){
    const preset = texto(document.getElementById('audClinPlazoPreset')?.value);
    if(preset === 'PERSONALIZADO'){
      return Number(document.getElementById('audClinHorasCustom')?.value || 24);
    }
    return Number(preset || 24);
  }

  function actualizarEstadoConfig(){
    const badge = document.getElementById('audClinConfigEstado');
    if(!badge) return;
    const control = normalizar(state.config.control_edicion) === 'SI';
    const excepcion = normalizar(state.config.correccion_excepcional) === 'SI';
    const horas = Number(state.config.horas_edicion || 24);
    badge.innerHTML = control
      ? `<i class="bi bi-lock me-1"></i> Control activo · ${escapar(horas)} h${excepcion ? ' · Excepción habilitada' : ''}`
      : '<i class="bi bi-unlock me-1"></i> Sin límite temporal · Auditoría activa';
  }

  async function cargarConfiguracionControl(){
    if(!esAdministrador()) return;
    const API = apiUrl();
    const token = tokenActual();
    if(!API || !token) return;

    try{
      const q = new URLSearchParams({
        accion:'obtenerConfiguracionAuditoriaClinica',
        token:token,
        t:String(Date.now())
      });
      const respuesta = await fetch(API + '?' + q.toString(), {cache:'no-store'});
      const resultado = await respuesta.json();
      if(!resultado || resultado.success === false){
        throw new Error(resultado?.message || 'No se pudo cargar el control de correcciones.');
      }

      state.config = {
        control_edicion: resultado.control_edicion || 'SI',
        horas_edicion: Number(resultado.horas_edicion || 24),
        correccion_excepcional: resultado.correccion_excepcional || 'SI'
      };

      const control = document.getElementById('audClinControlEdicion');
      const excepcion = document.getElementById('audClinCorreccionExcepcional');
      if(control) control.value = state.config.control_edicion;
      if(excepcion) excepcion.value = state.config.correccion_excepcional;
      aplicarHorasConfig(state.config.horas_edicion);
      actualizarEstadoConfig();
    }catch(error){
      console.error(MODULO + ': configuración', error);
      const badge = document.getElementById('audClinConfigEstado');
      if(badge) badge.textContent = 'No se pudo cargar configuración';
    }
  }

  async function guardarConfiguracionControl(){
    if(!esAdministrador()) return;
    const API = apiUrl();
    const token = tokenActual();
    const boton = document.getElementById('audClinGuardarConfig');
    if(!API || !token){
      setEstado('No existe una sesión administrativa válida.', true);
      return;
    }

    const horas = horasConfigSeleccionadas();
    if(!Number.isFinite(horas) || horas < 1 || horas > 720){
      setEstado('El plazo personalizado debe estar entre 1 y 720 horas.', true);
      return;
    }

    const data = {
      token:token,
      control_edicion:texto(document.getElementById('audClinControlEdicion')?.value || 'SI'),
      horas_edicion:Math.round(horas),
      correccion_excepcional:texto(document.getElementById('audClinCorreccionExcepcional')?.value || 'SI')
    };

    const original = boton ? boton.innerHTML : '';
    try{
      if(boton){
        boton.disabled = true;
        boton.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Guardando…';
      }
      const respuesta = await fetch(API, {
        method:'POST',
        body:JSON.stringify({accion:'guardarConfiguracionAuditoriaClinica', data:data})
      });
      const resultado = await respuesta.json();
      if(!resultado || resultado.success === false){
        throw new Error(resultado?.message || 'No se pudo guardar el control de correcciones.');
      }

      state.config = {
        control_edicion:data.control_edicion,
        horas_edicion:data.horas_edicion,
        correccion_excepcional:data.correccion_excepcional
      };
      actualizarEstadoConfig();
      setEstado('Configuración guardada. La auditoría clínica permanece siempre activa.', false);
    }catch(error){
      console.error(MODULO + ': guardar configuración', error);
      setEstado(error?.message || 'No se pudo guardar la configuración.', true);
    }finally{
      if(boton){
        boton.disabled = false;
        boton.innerHTML = original || '<i class="bi bi-save me-1"></i> Guardar control';
      }
    }
  }

  async function cargar(forzar){
    if(state.cargando) return;
    await cargarConfiguracionControl();
    if(state.cargado && !forzar){ render(); return; }

    if(!esAdministrador()){
      setEstado('Acceso reservado para Administrador.', true);
      return;
    }

    const API = apiUrl();
    const token = tokenActual();
    if(!API || !token){
      setEstado('No existe una sesión administrativa válida para consultar la auditoría.', true);
      return;
    }

    const boton = document.getElementById('audClinRefrescar');
    const originalBoton = boton ? boton.innerHTML : '';
    let cargaExitosa = false;

    state.cargando = true;
    setEstado(forzar ? 'Actualizando auditoría clínica…' : 'Cargando auditoría clínica…', false);

    if(boton){
      boton.disabled = true;
      boton.setAttribute('aria-busy','true');
      boton.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Actualizando…';
    }

    try{
      const q = new URLSearchParams({
        accion:'listarAuditoriaClinicaSegura',
        token:token,
        t:String(Date.now())
      });
      const respuesta = await fetch(API + '?' + q.toString(), {cache:'no-store'});
      if(!respuesta.ok) throw new Error('Error HTTP ' + respuesta.status);
      const resultado = await respuesta.json();

      if(resultado && resultado.success === false){
        throw new Error(resultado.message || 'No se pudo consultar la auditoría clínica.');
      }

      state.eventos = Array.isArray(resultado)
        ? resultado
        : (Array.isArray(resultado && resultado.data) ? resultado.data : []);
      state.cargado = true;
      cargaExitosa = true;

      const hora = horaActualEcuador();
      setEstado(
        'Auditoría actualizada' + (hora ? ' · '+hora : '') + '. Registro independiente de la bitácora de accesos.',
        false
      );
      render();
    }catch(error){
      console.error(MODULO + ':', error);
      state.eventos = [];
      state.cargado = false;
      setEstado(error && error.message ? error.message : 'No se pudo cargar la auditoría clínica.', true);
      render();
    }finally{
      state.cargando = false;

      if(boton){
        boton.disabled = false;
        boton.removeAttribute('aria-busy');

        if(cargaExitosa){
          boton.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Auditoría actualizada';
          setTimeout(function(){
            const actual = document.getElementById('audClinRefrescar');
            if(actual && !state.cargando){
              actual.innerHTML = originalBoton || '<i class="bi bi-arrow-clockwise me-1"></i> Actualizar auditoría';
            }
          }, 1400);
        }else{
          boton.innerHTML = originalBoton || '<i class="bi bi-arrow-clockwise me-1"></i> Actualizar auditoría';
        }
      }
    }
  }

  function limpiarFiltros(){
    ['audClinDesde','audClinHasta','audClinModulo','audClinAccion','audClinBuscar'].forEach(function(id){
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
    render();
  }

  function preparar(){
    if(state.preparado) return;
    state.preparado = true;
    instalarEstilos();

    const tab = document.getElementById('tabAuditoriaClinica');
    if(tab){
      if(!esAdministrador()){
        tab.style.display = 'none';
      }else{
        tab.addEventListener('click', function(){ cargar(false); });
      }
    }

    ['audClinDesde','audClinHasta','audClinModulo','audClinAccion'].forEach(function(id){
      document.getElementById(id)?.addEventListener('change', render);
    });
    document.getElementById('audClinBuscar')?.addEventListener('input', render);
    document.getElementById('audClinRefrescar')?.addEventListener('click', function(){ cargar(true); });
    document.getElementById('audClinLimpiar')?.addEventListener('click', limpiarFiltros);
    document.getElementById('audClinGuardarConfig')?.addEventListener('click', guardarConfiguracionControl);
    document.getElementById('audClinPlazoPreset')?.addEventListener('change', function(){
      const wrap = document.getElementById('audClinHorasCustomWrap');
      if(wrap) wrap.style.display = this.value === 'PERSONALIZADO' ? '' : 'none';
    });
  }

  const apiAuditoriaClinica = {
    preparar: preparar,
    cargar: cargar,
    render: render,
    verDetalle: verDetalle,
    limpiarFiltros: limpiarFiltros,
    cargarConfiguracionControl: cargarConfiguracionControl,
    guardarConfiguracionControl: guardarConfiguracionControl
  };

  window.IASYN_AUDITORIA_CLINICA = apiAuditoriaClinica;
  /* Compatibilidad temporal con HTML/módulos heredados. */
  window.auroAuditoriaClinica = apiAuditoriaClinica;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(preparar, 0); });
  }else{
    setTimeout(preparar, 0);
  }
})();
