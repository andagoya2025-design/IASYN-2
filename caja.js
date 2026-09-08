/* ============================================================
   IASYN — AISLAMIENTO DE CAJA
   - Sin URLs, Spreadsheet IDs ni Drive IDs directos.
   - Conserva el contrato financiero existente: cita → anticipo → atención.
   - No modifica módulos clínicos.
   - La configuración institucional IASYN tiene prioridad; se mantiene
     compatibilidad temporal con aliases heredados cuando corresponde.
============================================================ */
/* ============================================================
   IASYN ERP — CAJA.JS
   Versión 1.3 · recibo premium + logo institucional + WhatsApp · antirregresión

   RESPONSABILIDAD:
   - Lógica exclusiva de Caja.
   - Servicios/precios referenciales.
   - Cuenta por id_atencion y anticipo por id_cita antes de la atención.
   - Pagos, abonos, saldo y recibos.
   - Búsqueda/filtros y responsive específico de Caja.

   NO MODIFICA:
   - Agenda
   - Atenciones clínicas
   - Pacientes
   - Historia Clínica
   - Anamnesis
   - Diagnósticos
   - Examen Físico
   - Plan
   - Recetas
   - Seguridad
   - Code.gs
============================================================ */

  /* ============================================================
     IASYN — CAJA PREMIUM FINAL
     - Flujo histórico: id_atencion.
     - Flujo anticipado: id_cita hasta que exista id_atencion.
     - Servicios y precios referenciales provienen de Configuración.
     - El valor aplicado es editable por atención.
     - Admite varios servicios, pagos completos y múltiples abonos.
     - No escribe módulos clínicos ni genera pagos automáticos.
  ============================================================ */
  let cajaAtenciones = [];
  let cajaMovimientos = [];
  let cajaServicios = [];
  let cajaCitas = [];
  let cajaSeleccion = null;
  let cajaMovimientoActual = null;
  let cajaPagosActuales = [];
  let cajaDetallesActuales = [];
  let cajaUltimoPago = null;
  let cajaCargando = false;
  let cajaEditandoCuenta = false;

  function cajaTxt(v){ return String(v === null || v === undefined ? '' : v).trim(); }
  function cajaNum(v){ const n=Number(String(v??'').replace(',','.')); return Number.isFinite(n)?n:0; }
  function cajaMoney(v){ return '$' + cajaNum(v).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function cajaEsc(v){ return cajaTxt(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function cajaFecha(v){ const t=cajaTxt(v); if(!t)return '—'; const m=t.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:t; }
  function cajaIdAtencion(a){ return cajaTxt(a?.id_atencion || (a?._caja_contexto==='cita'?'':a?.id)); }
  function cajaIdCita(a){ return cajaTxt(a?.id_cita || (a?._caja_contexto==='cita'?a?.id:'')); }
  function cajaEsCitaPendiente(a){ return a?._caja_contexto==='cita' && !cajaIdAtencion(a); }
  function cajaClaveContexto(a){
    return cajaEsCitaPendiente(a) ? 'CITA:'+cajaIdCita(a) : 'ATN:'+cajaIdAtencion(a);
  }
  function cajaMovimientoContexto(a){
    const idAtn=cajaIdAtencion(a);
    if(idAtn){
      const porAtn=cajaMovimientos.find(m=>cajaTxt(m.id_atencion)===idAtn && cajaTxt(m.estado_financiero).toLowerCase()!=='anulado');
      if(porAtn) return porAtn;
    }
    const idCita=cajaIdCita(a);
    if(idCita){
      return cajaMovimientos.find(m=>cajaTxt(m.id_cita)===idCita && cajaTxt(m.estado_financiero).toLowerCase()!=='anulado') || null;
    }
    return null;
  }
  function cajaCitasConfirmadasSinAtencion(){
    const citasConAtencion=new Set(cajaAtenciones.map(a=>cajaTxt(a.id_cita)).filter(Boolean));
    return cajaCitas.filter(c=>{
      const id=cajaTxt(c.id_cita||c.id);
      if(!id || citasConAtencion.has(id)) return false;
      const estado=cajaNormalizar(c.estado_cita||c.estado||c.status);
      return estado==='confirmada' || estado==='confirmado';
    }).map(c=>({
      ...c,
      _caja_contexto:'cita',
      id_cita:cajaTxt(c.id_cita||c.id),
      id_atencion:'',
      fecha_atencion:c.fecha_cita||c.fecha||c.fecha_atencion||'',
      numero_consulta:''
    }));
  }
  function cajaNormalizar(v){
    return cajaTxt(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  }
  function cajaPrecioServicio(s){ return cajaNum(s?.precio ?? s?.valor ?? s?.precio_base ?? s?.tarifa ?? 0); }
  function cajaNombreServicio(s){ return cajaTxt(s?.nombre_servicio || s?.nombre || s?.servicio) || 'Servicio'; }
  function cajaIdServicio(s){ return cajaTxt(s?.id_servicio || s?.id); }
  function cajaMovimientoAtencion(id){
    return cajaMovimientos.find(m =>
      cajaTxt(m.id_atencion)===cajaTxt(id) &&
      cajaTxt(m.estado_financiero).toLowerCase()!=='anulado'
    ) || null;
  }
  function cajaPacienteRegistro(a){
    return (pacientes||[]).find(x=>cajaTxt(x.id_paciente)===cajaTxt(a?.id_paciente)) || null;
  }

  function cajaPaciente(a){
    if(cajaTxt(a?.nombre_paciente)) return cajaTxt(a.nombre_paciente);
    const p=cajaPacienteRegistro(a);
    return cajaTxt(p?.nombre_paciente || p?.nombre || [p?.nombres,p?.apellidos].filter(Boolean).join(' ')) || 'Paciente';
  }

  function cajaCedulaPaciente(a){
    const p=cajaPacienteRegistro(a);
    return cajaTxt(
      a?.numero_documento || a?.cedula ||
      p?.numero_documento || p?.cedula || p?.documento
    );
  }
  function cajaMedico(a){
    if(cajaTxt(a?.nombre_medico)) return cajaTxt(a.nombre_medico);
    const m=(medicos||[]).find(x=>cajaTxt(x.id_medico)===cajaTxt(a?.id_medico));
    return cajaTxt(m?.nombre_medico || m?.nombre_completo || m?.nombre || [m?.nombres,m?.apellidos].filter(Boolean).join(' ')) || cajaTxt(a?.id_medico) || '—';
  }
  function cajaEstadoBadge(m){
    if(!m) return '<span class="caja-status caja-status-sincuenta">Sin cobrar</span>';

    const e=cajaTxt(m.estado_pago)||'Pendiente';
    const normal=cajaNormalizar(e);

    let c='pendiente';
    let visible='Pendiente de pago';

    if(normal==='pagado'){
      c='pagado';
      visible='Pagado';
    }else if(normal==='parcial'){
      c='parcial';
      visible='Saldo pendiente';
    }

    return `<span class="caja-status caja-status-${c}">${cajaEsc(visible)}</span>`;
  }
  function cajaCitaDeAtencion(a){
    const idCita=cajaTxt(a?.id_cita);
    if(!idCita) return null;
    return cajaCitas.find(c=>cajaTxt(c.id_cita||c.id)===idCita) || null;
  }
  function cajaServicioTextoOrigen(a){
    const cita=cajaCitaDeAtencion(a);
    return cajaTxt(
      cita?.servicio || cita?.tipo_cita || cita?.motivo ||
      a?.servicio || a?.nombre_servicio || a?.tipo_cita || a?.motivo
    );
  }
  function cajaServicioCatalogoOrigen(a){
    const cita=cajaCitaDeAtencion(a);
    const id=cajaTxt(cita?.id_servicio || a?.id_servicio);
    if(id){
      const porId=cajaServicios.find(s=>cajaIdServicio(s)===id);
      if(porId) return porId;
    }

    const nombre=cajaNormalizar(cajaServicioTextoOrigen(a));
    if(!nombre) return null;

    return cajaServicios.find(s=>{
      const n=cajaNormalizar(cajaNombreServicio(s));
      return n===nombre || n.includes(nombre) || nombre.includes(n);
    }) || null;
  }

  async function cargarCaja(forzar){
    if(cajaCargando) return;
    if(!forzar && cajaAtenciones.length && cajaServicios.length){
      renderCajaAtenciones();
      cajaActualizarStats();
      return;
    }

    cajaCargando=true;
    try{
      const lecturas=await Promise.allSettled([
        apiGet('listarAtenciones'),
        apiGet('listarMovimientosFinancieros'),
        apiGet('listarServiciosActivos'),
        apiGet('listarPagosFinancieros'),
        apiGet('listarCitas')
      ]);

      const val=(i,def)=>lecturas[i]?.status==='fulfilled'?lecturas[i].value:def;
      cajaAtenciones=Array.isArray(val(0,[]))?val(0,[]):[];
      cajaMovimientos=Array.isArray(val(1,[]))?val(1,[]):[];
      cajaServicios=Array.isArray(val(2,[]))?val(2,[]):[];
      window.__cajaPagosTodos=Array.isArray(val(3,[]))?val(3,[]):[];
      cajaCitas=Array.isArray(val(4,[]))?val(4,[]):[];

      renderCajaAtenciones();
      cajaActualizarStats();

      if(cajaSeleccion){
        const clave=cajaClaveContexto(cajaSeleccion);
        await cajaSeleccionarContexto(clave);
      }
    }catch(e){
      console.error('IASYN Caja:',e);
      const lista=document.getElementById('cajaListaAtenciones');
      if(lista) lista.innerHTML='<div class="caja-empty text-danger">No se pudo cargar Caja. Revise la conexión con Apps Script.</div>';
    }finally{
      cajaCargando=false;
    }
  }

  function cajaOpcionesServicios(idSeleccionado){
    return '<option value="">Seleccione servicio</option>' + cajaServicios.map(s=>{
      const id=cajaIdServicio(s);
      const nombre=cajaNombreServicio(s);
      const precio=cajaPrecioServicio(s);
      const sel=id && id===cajaTxt(idSeleccionado)?' selected':'';
      return `<option value="${cajaEsc(id)}" data-precio="${precio}"${sel}>${cajaEsc(nombre)}${precio>0?' · '+cajaMoney(precio):' · sin tarifa fija'}</option>`;
    }).join('');
  }

  function cajaCrearFilaServicio(item){
    item=item||{};
    const cont=document.getElementById('cajaServiciosCuenta');
    if(!cont) return null;

    const row=document.createElement('div');
    row.className='caja-service-row';
    row.dataset.idDetalle=cajaTxt(item.id_detalle);
    const idServicio=cajaTxt(item.id_servicio);
    const precioRef=item.precio_referencia!==undefined
      ? cajaNum(item.precio_referencia)
      : cajaPrecioServicio(cajaServicios.find(s=>cajaIdServicio(s)===idServicio));
    const aplicado=item.precio_aplicado!==undefined
      ? item.precio_aplicado
      : (item.precio_unitario!==undefined ? item.precio_unitario : (precioRef>0?precioRef:''));

    row.innerHTML=`
      <div class="caja-service-main">
        <label>Servicio</label>
        <select class="form-select" data-caja-servicio-select onchange="cajaCambiarServicioFila(this)">
          ${cajaOpcionesServicios(idServicio)}
        </select>
      </div>
      <div>
        <label>Referencia</label>
        <input class="form-control caja-service-ref" data-caja-precio-ref value="${precioRef>0?precioRef.toFixed(2):''}" placeholder="Sin tarifa" readonly>
      </div>
      <div>
        <label>Valor aplicado</label>
        <input type="number" min="0" step="0.01" class="form-control caja-service-applied" data-caja-precio-aplicado value="${aplicado!==''?cajaNum(aplicado).toFixed(2):''}" placeholder="0.00" oninput="cajaRecalcularServicios()">
      </div>
      <div class="caja-service-remove-wrap">
        <label>&nbsp;</label>
        <button type="button" class="caja-service-remove" title="Quitar servicio" onclick="cajaQuitarServicio(this)"><i class="bi bi-trash3"></i></button>
      </div>`;

    cont.appendChild(row);
    cajaActualizarBotonesQuitar();
    cajaRecalcularServicios();
    return row;
  }

  function cajaAgregarServicio(item){
    return cajaCrearFilaServicio(item || {});
  }

  function cajaQuitarServicio(btn){
    const row=btn?.closest('.caja-service-row');
    if(!row) return;
    const rows=document.querySelectorAll('#cajaServiciosCuenta .caja-service-row');
    if(rows.length<=1){
      const sel=row.querySelector('[data-caja-servicio-select]');
      const ref=row.querySelector('[data-caja-precio-ref]');
      const aplicado=row.querySelector('[data-caja-precio-aplicado]');
      if(sel) sel.value='';
      if(ref) ref.value='';
      if(aplicado) aplicado.value='';
      row.dataset.idDetalle='';
    }else{
      row.remove();
    }
    cajaActualizarBotonesQuitar();
    cajaRecalcularServicios();
  }

  function cajaActualizarBotonesQuitar(){
    const rows=[...document.querySelectorAll('#cajaServiciosCuenta .caja-service-row')];
    rows.forEach(r=>{
      const btn=r.querySelector('.caja-service-remove');
      if(btn) btn.disabled=false;
    });
  }

  function cajaCambiarServicioFila(select){
    const row=select?.closest('.caja-service-row');
    if(!row) return;
    const opt=select.selectedOptions?.[0];
    const precio=cajaNum(opt?.dataset?.precio);
    const ref=row.querySelector('[data-caja-precio-ref]');
    const aplicado=row.querySelector('[data-caja-precio-aplicado]');

    if(ref) ref.value=precio>0?precio.toFixed(2):'';

    /*
      La tarifa solo se propone.
      Si el usuario ya escribió un valor aplicado, no se sobrescribe.
    */
    if(aplicado && !cajaTxt(aplicado.value)){
      aplicado.value=precio>0?precio.toFixed(2):'';
    }

    cajaRecalcularServicios();
  }

  function cajaLeerFilasServicios(){
    return [...document.querySelectorAll('#cajaServiciosCuenta .caja-service-row')].map(row=>{
      const sel=row.querySelector('[data-caja-servicio-select]');
      const opt=sel?.selectedOptions?.[0];
      return {
        id_detalle:cajaTxt(row.dataset.idDetalle),
        id_servicio:cajaTxt(sel?.value),
        nombre_servicio:cajaTxt(opt?.textContent).replace(/\s+·\s+(?:\$[\d.,]+|sin tarifa fija)$/i,''),
        precio_referencia:cajaNum(row.querySelector('[data-caja-precio-ref]')?.value),
        precio_aplicado:cajaNum(row.querySelector('[data-caja-precio-aplicado]')?.value)
      };
    }).filter(x=>x.id_servicio);
  }

  function cajaRecalcularServicios(){
    const filas=cajaLeerFilasServicios();
    const ref=filas.reduce((s,x)=>s+cajaNum(x.precio_referencia),0);
    const final=filas.reduce((s,x)=>s+cajaNum(x.precio_aplicado),0);

    const a=document.getElementById('cajaTotalReferencial');
    const b=document.getElementById('cajaTotalAcordado');
    if(a) a.textContent=cajaMoney(ref);
    if(b) b.textContent=cajaMoney(final);
    return {referencial:ref,final:final,filas:filas};
  }

  function renderCajaAtenciones(){
    const box=document.getElementById('cajaListaAtenciones');
    if(!box)return;

    const q=cajaNormalizar(document.getElementById('cajaBuscar')?.value);
    const filtro=cajaTxt(document.getElementById('cajaFiltro')?.value).toLowerCase();
    const campo=cajaTxt(document.getElementById('cajaBuscarPor')?.value || 'todos').toLowerCase();
    const origen=[...cajaAtenciones,...cajaCitasConfirmadasSinAtencion()];

    const rows=origen.filter(a=>{
      const idAtn=cajaIdAtencion(a);
      const idCita=cajaIdCita(a);
      if(!idAtn && !idCita)return false;

      const m=cajaMovimientoContexto(a);
      const estado=m?cajaTxt(m.estado_pago).toLowerCase():'sin_cuenta';
      const esAnticipo=cajaEsCitaPendiente(a) && !!m && cajaNum(m.total_pagado)>0;
      if(filtro==='anticipo'){
        if(!esAnticipo) return false;
      }else if(filtro && estado!==filtro){
        return false;
      }

      const servicio=cajaServicioTextoOrigen(a);
      const valores={
        todos:[idAtn,idCita,a.numero_consulta,cajaPaciente(a),cajaCedulaPaciente(a),cajaMedico(a),a.fecha_atencion,a.estado_atencion,a.estado,servicio],
        paciente:[cajaPaciente(a)],
        cedula:[cajaCedulaPaciente(a)],
        medico:[cajaMedico(a)],
        atencion:[idAtn,idCita,a.numero_consulta]
      };

      const txt=(valores[campo]||valores.todos).map(cajaNormalizar).join(' ');
      return !q || txt.includes(q);
    }).sort((a,b)=>cajaTxt(b.fecha_atencion||b.creado_en).localeCompare(cajaTxt(a.fecha_atencion||a.creado_en)));

    box.innerHTML=rows.map(a=>{
      const idAtn=cajaIdAtencion(a);
      const idCita=cajaIdCita(a);
      const m=cajaMovimientoContexto(a);
      const servicio=cajaServicioTextoOrigen(a);
      const clave=cajaClaveContexto(a);
      const active=cajaSeleccion&&cajaClaveContexto(cajaSeleccion)===clave?' active':'';
      const esCita=cajaEsCitaPendiente(a);

      return `<div class="caja-item${active}" onclick="cajaSeleccionarContexto('${cajaEsc(clave)}')">
        <div class="caja-item-top">
          <div>
            <div class="caja-item-title">${cajaEsc(cajaPaciente(a))}</div>
            <div class="caja-item-meta">${cajaCedulaPaciente(a)?'C.I. '+cajaEsc(cajaCedulaPaciente(a))+' · ':''}${cajaEsc(cajaFecha(a.fecha_atencion))} · ${esCita?'Cita confirmada · Pendiente de atención':'Consulta '+cajaEsc(a.numero_consulta||'—')+' · '+cajaEsc(cajaMedico(a))}</div>
            <div class="caja-item-meta">${esCita?cajaEsc(idCita):cajaEsc(idAtn)}${esCita?' · Anticipo habilitado':(idCita?' · Con cita':' · Sin cita')}${servicio?' · '+cajaEsc(servicio):''}</div>
          </div>
          <div class="text-end">
            ${cajaEstadoBadge(m)}
            <div class="caja-money mt-1">${m ? (cajaTxt(m.estado_pago).toLowerCase()==='pagado'?'Saldo '+cajaMoney(0):'Saldo '+cajaMoney(m.saldo_pendiente)) : '—'}</div>
          </div>
        </div>
      </div>`;
    }).join('')||'<div class="caja-empty">No hay atenciones ni citas confirmadas que coincidan con el filtro.</div>';

    const count=document.getElementById('cajaAtencionesCount');
    if(count) count.textContent=rows.length;
  }

  function cajaPrepararCuentaDesdeAtencion(a){
    cajaEditandoCuenta=false;
    cajaDetallesActuales=[];

    const cont=document.getElementById('cajaServiciosCuenta');
    if(cont) cont.innerHTML='';

    const servicioOrigen=cajaServicioCatalogoOrigen(a);
    const textoOrigen=cajaServicioTextoOrigen(a);
    const info=document.getElementById('cajaServicioOrigenInfo');

    if(servicioOrigen){
      cajaAgregarServicio({
        id_servicio:cajaIdServicio(servicioOrigen),
        precio_referencia:cajaPrecioServicio(servicioOrigen),
        precio_aplicado:cajaPrecioServicio(servicioOrigen)>0?cajaPrecioServicio(servicioOrigen):''
      });

      if(info){
        info.innerHTML=a.id_cita
          ? `<i class="bi bi-link-45deg me-1"></i>Servicio asociado a la cita: <b>${cajaEsc(cajaNombreServicio(servicioOrigen))}</b>. Puede registrar un anticipo antes de iniciar la atención.`
          : `<i class="bi bi-check2-circle me-1"></i>Servicio propuesto desde la atención: <b>${cajaEsc(cajaNombreServicio(servicioOrigen))}</b>.`;
      }
    }else{
      cajaAgregarServicio({});
      if(info){
        info.innerHTML=a.id_cita && textoOrigen
          ? `<i class="bi bi-exclamation-circle me-1"></i>La cita indica <b>${cajaEsc(textoOrigen)}</b>, pero no se encontró coincidencia exacta en Configuración. Seleccione el servicio real.`
          : `<i class="bi bi-person-walking me-1"></i>Atención sin servicio precargado. Seleccione en Caja el servicio realmente realizado.`;
      }
    }

    const obs=document.getElementById('cajaObservacionCuenta');
    if(obs) obs.value='';
    const titulo=document.getElementById('cajaTituloCuenta');
    if(titulo) titulo.textContent='Confirmar cuenta';
    const btn=document.getElementById('cajaBtnConfirmarCuenta');
    if(btn) btn.innerHTML='<i class="bi bi-check2-circle"></i> Confirmar cuenta';
    const cancel=document.getElementById('cajaBtnCancelarEdicion');
    if(cancel) cancel.style.display='none';
    const warn=document.getElementById('cajaEditWarning');
    if(warn) warn.style.display='none';
  }

  async function cajaSeleccionarContexto(clave){
    const k=cajaTxt(clave);
    let a=null;

    if(k.startsWith('CITA:')){
      const id=k.slice(5);
      a=cajaCitasConfirmadasSinAtencion().find(x=>cajaIdCita(x)===id) || null;
    }else{
      const id=k.startsWith('ATN:')?k.slice(4):k;
      a=cajaAtenciones.find(x=>cajaIdAtencion(x)===id) || null;
    }
    if(!a)return;

    cajaSeleccion=a;
    cajaMovimientoActual=cajaMovimientoContexto(a);
    cajaUltimoPago=null;
    cajaEditandoCuenta=false;

    const esCita=cajaEsCitaPendiente(a);
    const idAtn=cajaIdAtencion(a);
    const idCita=cajaIdCita(a);

    /* Si la atención acaba de nacer desde una cita que ya tenía anticipo,
       enlaza el MISMO movimiento a id_atencion. No crea cobro ni pago nuevo. */
    if(!esCita && idAtn && idCita && cajaMovimientoActual && !cajaTxt(cajaMovimientoActual.id_atencion)){
      try{
        const r=await apiPost('guardarMovimientoFinanciero',{
          id_atencion:idAtn,
          id_cita:idCita,
          valor_estimado:cajaMovimientoActual.valor_estimado,
          valor_final:cajaMovimientoActual.valor_final,
          estado_financiero:cajaMovimientoActual.estado_financiero||'Abierto',
          observaciones:cajaMovimientoActual.observaciones||'',
          creado_por:cajaMovimientoActual.creado_por||cajaTxt(document.getElementById('secSesionNombre')?.textContent)||'Secretaría'
        });
        if(r?.success===false) throw new Error(r.message||'No se pudo vincular el anticipo');
        cajaMovimientos=await apiGet('listarMovimientosFinancieros');
        if(!Array.isArray(cajaMovimientos)) cajaMovimientos=[];
        cajaMovimientoActual=cajaMovimientoContexto(a);
      }catch(e){
        console.error('IASYN Caja · vínculo anticipo-atención:',e);
      }
    }

    document.getElementById('cajaSinSeleccion').style.display='none';
    document.getElementById('cajaOperacion').style.display='block';
    document.getElementById('cajaPacienteNombre').textContent=cajaPaciente(a);
    document.getElementById('cajaIdAtencion').textContent=esCita?idCita:idAtn;
    document.getElementById('cajaNumeroConsulta').textContent=esCita?'Pendiente':(a.numero_consulta||'—');
    document.getElementById('cajaMedicoNombre').textContent=cajaMedico(a);
    document.getElementById('cajaFechaAtencion').textContent=cajaFecha(a.fecha_atencion);
    document.getElementById('cajaOrigenAtencion').textContent=esCita?'Cita confirmada · anticipo':'Atención clínica';

    renderCajaAtenciones();

    if(cajaMovimientoActual){
      document.getElementById('cajaCrearCuenta').style.display='none';
      document.getElementById('cajaCuentaActiva').style.display='block';
      await cajaMostrarMovimiento();
    }else{
      document.getElementById('cajaCrearCuenta').style.display='block';
      document.getElementById('cajaCuentaActiva').style.display='none';
      cajaPrepararCuentaDesdeAtencion(a);
    }
  }

  async function cajaSeleccionarAtencion(id){
    return cajaSeleccionarContexto('ATN:'+cajaTxt(id));
  }

  async function cajaCargarDetallesMovimiento(){
    if(!cajaMovimientoActual?.id_movimiento){
      cajaDetallesActuales=[];
      return [];
    }

    try{
      const r=await apiGetParams('listarDetallesMovimientoFinanciero',{
        id_movimiento:cajaMovimientoActual.id_movimiento
      });
      cajaDetallesActuales=Array.isArray(r)?r:[];
    }catch(_e){
      cajaDetallesActuales=[];
    }

    return cajaDetallesActuales;
  }

  function cajaDetallesActivos(){
    return (Array.isArray(cajaDetallesActuales)?cajaDetallesActuales:[])
      .filter(d=>cajaTxt(d.estado||'Activo').toLowerCase()!=='anulado');
  }

  function cajaRenderServiciosConfirmados(){
    const box=document.getElementById('cajaServiciosConfirmados');
    if(!box)return;

    const activos=cajaDetallesActivos();
    box.innerHTML=activos.map(d=>{
      const servicio=cajaTxt(d.nombre_servicio) ||
        cajaNombreServicio(cajaServicios.find(s=>cajaIdServicio(s)===cajaTxt(d.id_servicio)));
      const ref=cajaPrecioServicio(cajaServicios.find(s=>cajaIdServicio(s)===cajaTxt(d.id_servicio)));
      return `<div class="caja-confirmed-service">
        <div><b>${cajaEsc(servicio||'Servicio')}</b>${ref>0?`<small>Tarifa referencial actual: ${cajaMoney(ref)}</small>`:''}</div>
        <b>${cajaMoney(d.subtotal!==undefined?d.subtotal:d.precio_unitario)}</b>
      </div>`;
    }).join('') || '<div class="caja-note">La cuenta no tiene detalles de servicios visibles.</div>';
  }

  async function cajaMostrarMovimiento(){
    const m=cajaMovimientoActual;
    if(!m)return;

    document.getElementById('cajaCrearCuenta').style.display='none';
    document.getElementById('cajaCuentaActiva').style.display='block';

    document.getElementById('cajaEstadoPago').innerHTML=cajaEstadoBadge(m);
    document.getElementById('cajaValorFinalVista').textContent=cajaMoney(m.valor_final);
    document.getElementById('cajaTotalPagadoVista').textContent=cajaMoney(m.total_pagado);
    document.getElementById('cajaSaldoVista').textContent=cajaMoney(m.saldo_pendiente);

    const saldo=cajaNum(m.saldo_pendiente);
    const valorPago=document.getElementById('cajaValorPago');
    if(valorPago) valorPago.value='';
    document.getElementById('cajaFormularioPago').style.display=saldo>0?'block':'none';

    await cajaCargarDetallesMovimiento();
    cajaRenderServiciosConfirmados();

    try{
      cajaPagosActuales=await apiGetParams('listarPagosFinancieros',{id_movimiento:m.id_movimiento});
      if(!Array.isArray(cajaPagosActuales))cajaPagosActuales=[];
    }catch(_e){
      cajaPagosActuales=[];
    }

    cajaRenderPagos();
  }

  async function cajaEditarCuenta(){
    if(!cajaSeleccion || !cajaMovimientoActual) return;

    await cajaCargarDetallesMovimiento();
    cajaEditandoCuenta=true;

    const cont=document.getElementById('cajaServiciosCuenta');
    if(cont) cont.innerHTML='';

    const activos=cajaDetallesActivos();
    if(activos.length){
      activos.forEach(d=>{
        const srv=cajaServicios.find(s=>cajaIdServicio(s)===cajaTxt(d.id_servicio));
        cajaAgregarServicio({
          id_detalle:d.id_detalle,
          id_servicio:d.id_servicio,
          precio_referencia:cajaPrecioServicio(srv),
          precio_aplicado:cajaNum(d.precio_unitario)
        });
      });
    }else{
      cajaPrepararCuentaDesdeAtencion(cajaSeleccion);
      cajaEditandoCuenta=true;
    }

    const obs=document.getElementById('cajaObservacionCuenta');
    if(obs) obs.value=cajaTxt(cajaMovimientoActual.observaciones);

    const info=document.getElementById('cajaServicioOrigenInfo');
    if(info) info.innerHTML='<i class="bi bi-pencil-square me-1"></i>Editando la cuenta existente. Los cambios afectan únicamente esta atención; nunca modifican el precio general de Configuración.';

    const titulo=document.getElementById('cajaTituloCuenta');
    if(titulo) titulo.textContent='Editar cuenta';

    const btn=document.getElementById('cajaBtnConfirmarCuenta');
    if(btn) btn.innerHTML='<i class="bi bi-save2"></i> Guardar cambios';

    const cancel=document.getElementById('cajaBtnCancelarEdicion');
    if(cancel) cancel.style.display='inline-flex';

    const warn=document.getElementById('cajaEditWarning');
    if(warn) warn.style.display=cajaNum(cajaMovimientoActual.total_pagado)>0?'block':'none';

    document.getElementById('cajaCrearCuenta').style.display='block';
    document.getElementById('cajaCuentaActiva').style.display='none';
    cajaRecalcularServicios();
  }

  async function cajaCancelarEdicionCuenta(){
    cajaEditandoCuenta=false;
    if(cajaMovimientoActual){
      document.getElementById('cajaCrearCuenta').style.display='none';
      document.getElementById('cajaCuentaActiva').style.display='block';
      await cajaMostrarMovimiento();
    }
  }

  async function cajaSincronizarDetallesMovimiento(idMovimiento, idAtencion, filas){
    const backend=await apiGetParams('listarDetallesMovimientoFinanciero',{id_movimiento:idMovimiento});
    const existentes=Array.isArray(backend)?backend:[];
    const activos=existentes.filter(d=>cajaTxt(d.estado||'Activo').toLowerCase()!=='anulado');
    const usados=new Set();

    for(const fila of filas){
      let actual=null;

      if(fila.id_detalle){
        actual=activos.find(d=>cajaTxt(d.id_detalle)===fila.id_detalle) || null;
      }

      /*
        Antiduplicado adicional:
        si una ejecución anterior alcanzó a guardar el detalle pero el navegador
        no recibió la respuesta, se reutiliza el detalle activo del mismo servicio.
      */
      if(!actual){
        actual=activos.find(d=>
          !usados.has(cajaTxt(d.id_detalle)) &&
          cajaTxt(d.id_servicio)===fila.id_servicio
        ) || null;
      }

      const dataDetalle={
        id_movimiento:idMovimiento,
        id_atencion:idAtencion,
        id_servicio:fila.id_servicio,
        nombre_servicio:fila.nombre_servicio,
        cantidad:1,
        precio_unitario:fila.precio_aplicado,
        estado:'Activo'
      };

      if(actual?.id_detalle){
        usados.add(cajaTxt(actual.id_detalle));
        await apiPost('editarDetalleMovimientoFinanciero',{
          id_detalle:actual.id_detalle,
          data:dataDetalle
        });
      }else{
        const r=await apiPost('guardarDetalleMovimientoFinanciero',dataDetalle);
        if(r?.success===false) throw new Error(r.message||'No se pudo guardar un servicio de la cuenta');
      }
    }

    for(const d of activos){
      const id=cajaTxt(d.id_detalle);
      if(id && !usados.has(id)){
        const r=await apiPost('editarDetalleMovimientoFinanciero',{
          id_detalle:id,
          data:{estado:'Anulado'}
        });
        if(r?.success===false) throw new Error(r.message||'No se pudo actualizar un detalle retirado de la cuenta');
      }
    }
  }

  async function cajaConfirmarCuenta(){
    if(!cajaSeleccion)return;

    const totales=cajaRecalcularServicios();
    if(!totales.filas.length){
      alert(cajaEsCitaPendiente(cajaSeleccion)?'Seleccione el servicio asociado a la cita para registrar el anticipo.':'Seleccione al menos un servicio realmente realizado.');
      return;
    }

    const ids=totales.filas.map(x=>x.id_servicio);
    if(new Set(ids).size!==ids.length){
      alert('El mismo servicio está repetido. Mantenga una sola línea por servicio y ajuste allí el valor aplicado.');
      return;
    }

    for(const f of totales.filas){
      const input=[...document.querySelectorAll('#cajaServiciosCuenta .caja-service-row')].find(r=>
        cajaTxt(r.querySelector('[data-caja-servicio-select]')?.value)===f.id_servicio
      )?.querySelector('[data-caja-precio-aplicado]');

      if(input && !cajaTxt(input.value)){
        alert('Ingrese el valor aplicado para: ' + f.nombre_servicio + '. Puede ser 0.00 si es una cortesía autorizada.');
        input.focus();
        return;
      }
    }

    if(totales.final < 0){
      alert('El total de la cuenta no puede ser negativo.');
      return;
    }

    const totalPagado=cajaNum(cajaMovimientoActual?.total_pagado);
    if(cajaMovimientoActual && totales.final + 0.001 < totalPagado){
      alert('El nuevo total no puede quedar por debajo de lo ya pagado ('+cajaMoney(totalPagado)+').');
      return;
    }

    if(totales.final===0 && !confirm('La cuenta quedará en $0.00. ¿Confirma que corresponde a una cortesía o atención sin cobro?')){
      return;
    }

    const btn=document.getElementById('cajaBtnConfirmarCuenta');
    btn.disabled=true;

    try{
      const payload={
        id_atencion:cajaIdAtencion(cajaSeleccion),
        id_cita:cajaIdCita(cajaSeleccion),
        valor_estimado:totales.referencial,
        valor_final:totales.final,
        estado_financiero:'Abierto',
        observaciones:cajaTxt(document.getElementById('cajaObservacionCuenta').value),
        creado_por:cajaTxt(document.getElementById('secSesionNombre')?.textContent)||'Secretaría'
      };

      const r=await apiPost('guardarMovimientoFinanciero',payload);
      if(r?.success===false) throw new Error(r.message||'No se pudo confirmar la cuenta');

      await cargarCaja(true);
      cajaMovimientoActual=cajaMovimientos.find(m=>
        (payload.id_atencion && cajaTxt(m.id_atencion)===payload.id_atencion) ||
        (!payload.id_atencion && payload.id_cita && cajaTxt(m.id_cita)===payload.id_cita)
      ) || null;
      if(!cajaMovimientoActual?.id_movimiento){
        throw new Error('La cuenta se guardó, pero no se pudo recuperar su ID financiero.');
      }

      await cajaSincronizarDetallesMovimiento(
        cajaMovimientoActual.id_movimiento,
        payload.id_atencion,
        totales.filas
      );

      const claveRetorno=payload.id_atencion?'ATN:'+payload.id_atencion:'CITA:'+payload.id_cita;
      await cargarCaja(true);
      await cajaSeleccionarContexto(claveRetorno);

      alert(cajaEditandoCuenta
        ? 'Cuenta actualizada correctamente.'
        : 'Cuenta confirmada correctamente. Ahora puede registrar un pago total o un abono.'
      );

      cajaEditandoCuenta=false;
    }catch(e){
      console.error(e);
      alert('No se pudo guardar la cuenta: '+(e.message||e));
    }finally{
      btn.disabled=false;
    }
  }

  function cajaCompletarSaldo(){
    if(!cajaMovimientoActual) return;

    const valor=document.getElementById('cajaValorPago');
    const forma=document.getElementById('cajaFormaPago');

    if(valor){
      valor.value=cajaNum(cajaMovimientoActual.saldo_pendiente).toFixed(2);
    }

    /*
      El pago final nunca se registra automáticamente.
      Se obliga a Secretaría a confirmar la forma de pago igual que en un abono.
    */
    if(forma){
      forma.focus();
    }
  }

  async function cajaRegistrarPago(){
    if(!cajaSeleccion||!cajaMovimientoActual)return;

    const valor=cajaNum(document.getElementById('cajaValorPago').value);
    const saldo=cajaNum(cajaMovimientoActual.saldo_pendiente);
    const formaPago=cajaTxt(document.getElementById('cajaFormaPago')?.value);

    if(!(valor>0)){
      alert('Ingrese el valor recibido.');
      return;
    }

    if(!formaPago){
      alert('Seleccione la forma de pago: Efectivo, Transferencia, Tarjeta, Depósito u Otro.');
      const forma=document.getElementById('cajaFormaPago');
      if(forma) forma.focus();
      return;
    }
    if(valor>saldo+0.001){
      alert('El pago o abono no puede superar el saldo pendiente.');
      return;
    }

    const btn=document.getElementById('cajaBtnRegistrarPago');
    btn.disabled=true;

    try{
      const payload={
        id_movimiento:cajaMovimientoActual.id_movimiento,
        id_atencion:cajaIdAtencion(cajaSeleccion),
        valor_pago:valor,
        forma_pago:formaPago,
        referencia_pago:cajaTxt(document.getElementById('cajaReferenciaPago').value),
        recibido_por:cajaTxt(document.getElementById('secSesionNombre')?.textContent)||'Secretaría',
        observaciones:cajaTxt(document.getElementById('cajaObservacionPago').value),
        estado:'Activo'
      };

      const r=await apiPost('registrarPagoFinanciero',payload);
      if(r?.success===false)throw new Error(r.message||'No se pudo registrar el pago');

      cajaUltimoPago=r?.data||{...payload,id_pago:r?.id,fecha_pago:new Date().toISOString()};
      document.getElementById('cajaReferenciaPago').value='';
      document.getElementById('cajaObservacionPago').value='';

      const claveRetorno=cajaClaveContexto(cajaSeleccion);
      await cargarCaja(true);
      await cajaSeleccionarContexto(claveRetorno);

      const pagos=await apiGetParams('listarPagosFinancieros',{
        id_movimiento:cajaMovimientoActual.id_movimiento
      });

      if(Array.isArray(pagos)&&pagos.length){
        cajaUltimoPago=pagos
          .filter(p=>cajaTxt(p.estado).toLowerCase()!=='anulado')
          .sort((a,b)=>cajaTxt(b.fecha_pago||b.creado_en).localeCompare(cajaTxt(a.fecha_pago||a.creado_en)))[0] || cajaUltimoPago;
      }

      document.getElementById('cajaBtnRecibo').style.display='inline-flex';
      const waBtn=document.getElementById('cajaBtnWhatsAppRecibo');
      if(waBtn) waBtn.style.display=cajaTelefonoPaciente(cajaSeleccion)?'inline-flex':'none';
      cajaActualizarStats();
      alert(r?.duplicado_evitado
        ? 'El sistema detectó y evitó un pago duplicado.'
        : (valor+0.001<saldo ? 'Abono registrado correctamente.' : 'Pago registrado correctamente.')
      );
    }catch(e){
      console.error(e);
      alert('No se pudo registrar el pago: '+(e.message||e));
    }finally{
      btn.disabled=false;
    }
  }

  function cajaRenderPagos(){
    const box=document.getElementById('cajaHistorialPagos');
    if(!box)return;

    const pagos=[...cajaPagosActuales].sort((a,b)=>
      cajaTxt(b.fecha_pago||b.creado_en).localeCompare(cajaTxt(a.fecha_pago||a.creado_en))
    );

    box.innerHTML=pagos.map(p=>`
      <div class="caja-payment">
        <div>
          <b>${cajaEsc(cajaFecha(p.fecha_pago||p.creado_en))}</b>
          <div class="caja-note">${cajaEsc(p.forma_pago||'—')}${p.referencia_pago?' · '+cajaEsc(p.referencia_pago):''}${cajaTxt(p.estado).toLowerCase()==='anulado'?' · ANULADO':''}</div>
        </div>
        <b>${cajaMoney(p.valor_pago)}</b>
      </div>
    `).join('')||'<div class="caja-note">Sin pagos registrados.</div>';

    const validos=pagos.filter(p=>cajaTxt(p.estado).toLowerCase()!=='anulado');
    if(!cajaUltimoPago&&validos.length)cajaUltimoPago=validos[0];
    document.getElementById('cajaBtnRecibo').style.display=cajaUltimoPago?'inline-flex':'none';
    const waBtn=document.getElementById('cajaBtnWhatsAppRecibo');
    if(waBtn) waBtn.style.display=(cajaUltimoPago&&cajaTelefonoPaciente(cajaSeleccion))?'inline-flex':'none';
  }

  function cajaActualizarStats(){
    const hoy=new Date();
    const iso=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    const pagos=Array.isArray(window.__cajaPagosTodos)?window.__cajaPagosTodos:[];

    const cobrado=pagos
      .filter(p=>cajaTxt(p.estado).toLowerCase()!=='anulado'&&cajaTxt(p.fecha_pago||p.creado_en).slice(0,10)===iso)
      .reduce((s,p)=>s+cajaNum(p.valor_pago),0);

    const saldo=cajaMovimientos
      .filter(m=>cajaTxt(m.estado_financiero).toLowerCase()!=='anulado')
      .reduce((s,m)=>s+cajaNum(m.saldo_pendiente),0);

    const pagadas=cajaMovimientos.filter(m=>cajaTxt(m.estado_pago).toLowerCase()==='pagado').length;

    document.getElementById('cajaCobradoHoy').textContent=cajaMoney(cobrado);
    document.getElementById('cajaSaldoPendiente').textContent=cajaMoney(saldo);
    document.getElementById('cajaPagadasCount').textContent=pagadas;
  }

  function cajaTelefonoPaciente(a){
    const p=cajaPacienteRegistro(a)||{};
    return cajaTxt(
      a?.whatsapp || a?.telefono_whatsapp || a?.telefono || a?.celular ||
      p?.whatsapp || p?.telefono_whatsapp || p?.telefono || p?.celular || p?.movil
    );
  }

  function cajaTelefonoWhatsAppNormalizado(valor){
    let n=cajaTxt(valor).replace(/\D/g,'');
    if(!n) return '';
    if(n.startsWith('00')) n=n.slice(2);
    if(n.startsWith('0') && n.length===10) n='593'+n.slice(1);
    if(n.length===9 && n.startsWith('9')) n='593'+n;
    return n;
  }

  function cajaConfigInstitucional(){
    const candidatos=[
      window.iasynConfiguracionCentro,
      window.IASYN_CONFIGURACION_CENTRO,
      window.auroConfiguracionCentro,
      window.configuracionCentro,
      window.configCentro,
      window.CONFIG_CENTRO,
      window.configuracionInstitucional,
      (typeof configuracion!=='undefined' ? configuracion : null)
    ].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));

    let c=candidatos[0]||{};
    if(c.datos&&typeof c.datos==='object') c=Object.assign({},c,c.datos);

    const pick=(...keys)=>{
      for(const k of keys){
        const v=cajaTxt(c?.[k]);
        if(v) return v;
      }
      return '';
    };

    return {
      nombre:pick('nombre_clinica','nombre_centro','nombre_comercial','razon_social') || cajaTxt(document.getElementById('secNombreCentro')?.textContent) || 'IASYN',
      subtitulo:pick('subtitulo_clinica','descripcion_clinica','eslogan_clinica','especialidad'),
      razon_social:pick('razon_social'),
      ruc:pick('ruc'),
      direccion:pick('direccion_clinica','direccion_centro','direccion'),
      ciudad:pick('ciudad_clinica','ciudad') || 'Guayaquil',
      provincia:pick('provincia_clinica','provincia'),
      pais:pick('pais_clinica','pais') || 'Ecuador',
      telefono:pick('telefono_clinica','whatsapp_clinica','telefono','whatsapp'),
      email:pick('email_clinica','correo_clinica','email','correo'),
      web:pick('sitio_web_clinica','web_clinica','web'),
      logo:pick('logo_url','logo_drive_url','logo_centro_url','logo'),
      color:pick('color_principal') || '#8b1e5a'
    };
  }

  function cajaEstadoComprobante(a,m,p){
    const saldo=cajaNum(m?.saldo_pendiente);
    const total=cajaNum(m?.valor_final);
    const pago=cajaNum(p?.valor_pago);
    const pagado=cajaNum(m?.total_pagado);
    const cancelado=saldo<=0.001 && total>=0;
    const citaPendiente=cajaEsCitaPendiente(a);

    if(cancelado){
      return {
        tipo:'COMPROBANTE DE PAGO',
        clase:'PAGO',
        etiquetaMovimiento:'Pago realizado',
        etiquetaAcumulado:'Total pagado',
        estadoSaldo:'CANCELADO',
        cancelado:true
      };
    }

    if(citaPendiente){
      return {
        tipo:'COMPROBANTE DE ANTICIPO',
        clase:'ANTICIPO',
        etiquetaMovimiento:'Abono realizado',
        etiquetaAcumulado:'Total abonado',
        estadoSaldo:'PENDIENTE',
        cancelado:false
      };
    }

    return {
      tipo:'COMPROBANTE DE ABONO',
      clase:'ABONO',
      etiquetaMovimiento:'Abono realizado',
      etiquetaAcumulado:'Total abonado',
      estadoSaldo:'PENDIENTE',
      cancelado:false
    };
  }

  function cajaTipoRecibo(a,m,p){
    return cajaEstadoComprobante(a,m,p).tipo;
  }

  function cajaHoraVisual(v){
    const t=cajaTxt(v);
    const m=t.match(/(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/);
    return m?`${m[1]}:${m[2]}${m[3]?':'+m[3]:''}`:'—';
  }

  async function cajaConstruirReciboHTML(){
    if(!cajaUltimoPago||!cajaSeleccion||!cajaMovimientoActual){
      throw new Error('No existe un pago seleccionado para generar el comprobante.');
    }
    if(!cajaDetallesActuales.length) await cajaCargarDetallesMovimiento();

    const p=cajaUltimoPago;
    const a=cajaSeleccion;
    const m=cajaMovimientoActual;
    const cfg=cajaConfigInstitucional();
    const centro=cfg.nombre;
    const color=cfg.color;
    const logo=cfg.logo;
    const recibo=cajaTxt(p.id_pago||'COMPROBANTE');
    const estado=cajaEstadoComprobante(a,m,p);
    const tipo=estado.tipo;
    const idAtn=cajaIdAtencion(a);
    const idCita=cajaIdCita(a);
    const fechaContexto=cajaTxt(a?.fecha_cita||a?.fecha_atencion||'');
    const detalles=cajaDetallesActivos();
    const detalleHtml=detalles.map(d=>{
      const nombre=cajaTxt(d.nombre_servicio)||'Servicio';
      return `<div class="rx-line"><span>${cajaEsc(nombre)}</span><b>${cajaMoney(d.subtotal!==undefined?d.subtotal:d.precio_unitario)}</b></div>`;
    }).join('') || '<div class="rx-muted">Sin detalle de servicios visible.</div>';

    const ubicacion=[cfg.direccion,cfg.ciudad,cfg.provincia,cfg.pais].filter(Boolean).join(' · ');
    const contacto=[cfg.telefono,cfg.email,cfg.web].filter(Boolean).join(' · ');
    const logoHtml=logo
      ? `<div class="rx-logo-wrap"><img class="rx-logo" src="${cajaEsc(logo)}" alt="" onerror="this.parentElement.style.display='none'"></div>`
      : '<div class="rx-logo-wrap" style="display:none"></div>';
    const saldoTexto=estado.cancelado
      ? `${cajaMoney(0)} · CANCELADO`
      : cajaMoney(m.saldo_pendiente);
    const notaLegal=estado.cancelado
      ? 'Pago completado. La factura correspondiente podrá emitirse con los datos proporcionados conforme al proceso de facturación aplicable.'
      : 'La factura correspondiente podrá emitirse conforme al proceso de facturación aplicable una vez definidos los servicios y valores finales.';

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cajaEsc(tipo)} · ${cajaEsc(recibo)}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#eef1f5;color:#1f2937;font-family:Arial,sans-serif}.iasyn-rx-toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;background:#fff;border-bottom:1px solid #dbe2ea;box-shadow:0 2px 10px rgba(15,23,42,.08)}.iasyn-rx-actions{display:flex;gap:8px}.iasyn-rx-btn{border:0;border-radius:9px;padding:10px 14px;background:${cajaEsc(color)};color:#fff;font-weight:700;cursor:pointer}.iasyn-rx-btn.secondary{background:#fff;color:#374151;border:1px solid #cbd5e1}.iasyn-rx-stage{min-height:calc(100vh - 62px);padding:20px;display:flex;justify-content:center;align-items:flex-start;overflow:auto}.iasyn-rx-sheet{width:210mm;min-width:210mm;min-height:297mm;flex:0 0 210mm;background:#fff;box-shadow:0 18px 42px rgba(15,23,42,.24);padding:12mm 15mm;transform-origin:top center}.rx-paper{min-height:273mm;position:relative;padding-bottom:28mm}.rx-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;border-bottom:2.5px solid ${cajaEsc(color)};padding-bottom:10px}.rx-logo-wrap{width:60px;height:60px;display:grid;place-items:center;border-radius:12px;overflow:hidden}.rx-logo{max-width:100%;max-height:100%;object-fit:contain}.rx-brand h1{font-size:19px;margin:0;color:${cajaEsc(color)};letter-spacing:.035em}.rx-brand p{margin:3px 0;font-size:10.5px;color:#667085}.rx-date{text-align:right;font-size:11.5px;font-weight:750}.rx-doc-title{text-align:center;font-size:19px;margin:20px 0 18px;letter-spacing:.045em}.rx-doc-code{text-align:center;color:#6b7280;font-size:10.5px;margin-top:-11px;margin-bottom:14px}.rx-box{margin-top:11px;border:1px solid #e5e7eb;border-radius:10px;padding:11px}.rx-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px}.rx-kv{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #f0f1f3;padding:5px 0;font-size:11px}.rx-kv span{color:#6b7280}.rx-line{display:flex;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid #f0f1f3}.rx-summary{margin-top:10px;margin-left:auto;width:88mm}.rx-summary .rx-line.total{font-size:15px;color:${cajaEsc(color)};border-top:2px solid ${cajaEsc(color)};font-weight:800}.rx-muted{font-size:10px;color:#6b7280}.rx-legal{margin-top:12px;border-left:3px solid ${cajaEsc(color)};padding:8px 10px;background:#fafafa;font-size:9.7px;color:#475569;line-height:1.5}.rx-foot{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:9px;color:#6b7280;line-height:1.45}@media(max-width:980px){.iasyn-rx-stage{padding:12px 0 20px;overflow-x:hidden}.iasyn-rx-sheet{transform-origin:top center}}@media(max-width:760px){.iasyn-rx-toolbar{padding:8px 10px}.iasyn-rx-toolbar strong{display:none}.iasyn-rx-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;width:100%;gap:8px}.iasyn-rx-btn{width:100%;min-height:40px;padding:8px 10px}.iasyn-rx-btn.secondary{width:auto;min-width:74px}.iasyn-rx-stage{padding:10px 0 18px;overflow-x:hidden}.iasyn-rx-sheet{width:210mm!important;min-width:210mm!important;max-width:none!important;min-height:297mm!important;flex:0 0 210mm!important;margin:0!important;padding:12mm 15mm!important;transform-origin:top center!important;box-shadow:0 8px 24px rgba(15,23,42,.18)}}@media print{@page{size:A4 portrait;margin:12mm 15mm}html,body{background:#fff!important;margin:0!important;padding:0!important;overflow:visible!important}.iasyn-rx-toolbar{display:none!important}.iasyn-rx-stage{display:block!important;min-height:0!important;padding:0!important;overflow:visible!important}.iasyn-rx-sheet{width:auto!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;transform:none!important}.rx-paper{min-height:273mm!important}}
</style></head><body><div class="iasyn-rx-toolbar"><strong>Vista previa A4 · ${cajaEsc(tipo)}</strong><div class="iasyn-rx-actions"><button class="iasyn-rx-btn" onclick="window.print()">Imprimir / Guardar PDF</button><button class="iasyn-rx-btn secondary" onclick="window.close()">Cerrar</button></div></div><main class="iasyn-rx-stage"><div class="iasyn-rx-sheet" id="iasynCajaReciboSheet"><div class="rx-paper"><header class="rx-head">${logoHtml}<div class="rx-brand"><h1>${cajaEsc(centro)}</h1>${cfg.subtitulo?`<p>${cajaEsc(cfg.subtitulo)}</p>`:''}${ubicacion?`<p>${cajaEsc(ubicacion)}</p>`:''}${contacto?`<p>${cajaEsc(contacto)}</p>`:''}</div><div class="rx-date">${cajaEsc(cajaFecha(p.fecha_pago||p.creado_en))}<br>${cajaEsc(cajaHoraVisual(p.fecha_pago||p.creado_en))}</div></header><h2 class="rx-doc-title">${cajaEsc(tipo)}</h2><div class="rx-doc-code">${cajaEsc(recibo)}</div><section class="rx-box"><div class="rx-grid"><div class="rx-kv"><span>Paciente</span><b>${cajaEsc(cajaPaciente(a))}</b></div><div class="rx-kv"><span>Cédula</span><b>${cajaEsc(cajaCedulaPaciente(a)||'—')}</b></div><div class="rx-kv"><span>Médico</span><b>${cajaEsc(cajaMedico(a))}</b></div><div class="rx-kv"><span>Fecha de cita/atención</span><b>${cajaEsc(cajaFecha(fechaContexto)||'—')}</b></div>${idCita?`<div class="rx-kv"><span>ID cita</span><b>${cajaEsc(idCita)}</b></div>`:''}${idAtn?`<div class="rx-kv"><span>ID atención</span><b>${cajaEsc(idAtn)}</b></div>`:''}<div class="rx-kv"><span>Consulta</span><b>${cajaEsc(cajaEsCitaPendiente(a)?'Pendiente de atención':(a.numero_consulta||'—'))}</b></div><div class="rx-kv"><span>Forma de pago</span><b>${cajaEsc(p.forma_pago||'—')}</b></div>${p.referencia_pago?`<div class="rx-kv"><span>Referencia</span><b>${cajaEsc(p.referencia_pago)}</b></div>`:''}</div></section><section class="rx-box"><b>Detalle</b>${detalleHtml}<div class="rx-summary"><div class="rx-line"><span>Valor total</span><b>${cajaMoney(m.valor_final)}</b></div><div class="rx-line"><span>${cajaEsc(estado.etiquetaMovimiento)}</span><b>${cajaMoney(p.valor_pago)}</b></div><div class="rx-line"><span>${cajaEsc(estado.etiquetaAcumulado)}</span><b>${cajaMoney(m.total_pagado)}</b></div><div class="rx-line total"><span>Saldo pendiente</span><b>${cajaEsc(saldoTexto)}</b></div></div></section><section class="rx-box"><div class="rx-kv"><span>Recibido por</span><b>${cajaEsc(p.recibido_por||document.getElementById('secSesionNombre')?.textContent||'Secretaría')}</b></div>${p.observaciones?`<div class="rx-kv"><span>Observaciones</span><b>${cajaEsc(p.observaciones)}</b></div>`:''}</section><div class="rx-legal"><b>Importante:</b> Este documento es un comprobante interno de Caja y no constituye factura ni comprobante tributario autorizado. ${cajaEsc(notaLegal)}</div><footer class="rx-foot">Generado por IASYN ERP · ${cajaEsc(centro)}${cfg.razon_social?` · ${cajaEsc(cfg.razon_social)}`:''}${cfg.ruc?` · RUC ${cajaEsc(cfg.ruc)}`:''}</footer></div></div></main><script>(function(){function ajustar(){var hoja=document.getElementById('iasynCajaReciboSheet');if(!hoja)return;var ancho=window.innerWidth||document.documentElement.clientWidth||794;var anchoHoja=hoja.offsetWidth||794;var altoHoja=hoja.offsetHeight||1123;var margen=ancho<=760?16:28;var disponible=Math.max(220,ancho-margen);var escala=ancho>980?1:Math.min(1,disponible/anchoHoja);hoja.style.transform=escala<1?'scale('+escala+')':'none';hoja.style.marginBottom=escala<1?(-altoHoja*(1-escala))+'px':'0'}window.addEventListener('resize',ajustar);ajustar()})();<\/script></body></html>`;
  }

  async function cajaImprimirUltimoRecibo(){
    try{
      const html=await cajaConstruirReciboHTML();
      const w=window.open('','_blank','width=980,height=820');
      if(!w){
        alert('El navegador bloqueó la vista previa. Habilite ventanas emergentes para este sitio.');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
    }catch(e){
      console.error(e);
      alert(e.message||'No se pudo generar el comprobante.');
    }
  }

  async function cajaEnviarReciboWhatsApp(){
    if(!cajaUltimoPago||!cajaSeleccion||!cajaMovimientoActual){
      alert('No existe un comprobante disponible para enviar.');
      return;
    }
    const telefono=cajaTelefonoWhatsAppNormalizado(cajaTelefonoPaciente(cajaSeleccion));
    if(!telefono){
      alert('Este paciente no tiene teléfono o WhatsApp registrado.');
      return;
    }

    const a=cajaSeleccion;
    const m=cajaMovimientoActual;
    const p=cajaUltimoPago;
    const estado=cajaEstadoComprobante(a,m,p);
    const cfg=cajaConfigInstitucional();
    const detalles=cajaDetallesActivos();
    const servicio=detalles.length
      ? detalles.map(d=>cajaTxt(d.nombre_servicio)||'Servicio').filter(Boolean).join(', ')
      : (cajaServicioTextoOrigen(a)||'Servicio de salud');
    const fechaContexto=cajaTxt(a?.fecha_cita||a?.fecha_atencion||'');
    const saludo=estado.cancelado
      ? 'Hemos registrado correctamente el pago de su atención.'
      : (estado.clase==='ANTICIPO'
          ? 'Hemos registrado correctamente su anticipo para la cita agendada.'
          : 'Hemos registrado correctamente su abono.');
    const cierre=estado.cancelado
      ? '✅ Su saldo se encuentra cancelado. La factura correspondiente podrá emitirse con los datos proporcionados conforme al proceso de facturación aplicable.'
      : 'ℹ️ Mantiene un saldo pendiente de '+cajaMoney(m.saldo_pendiente)+'. La factura correspondiente podrá emitirse conforme al proceso de facturación aplicable una vez definidos los servicios y valores finales.';

    const lineas=[
      '🧾 *'+cajaTxt(cfg.nombre||'IASYN')+' | '+estado.tipo.replace('COMPROBANTE DE ','')+'*',
      '',
      'Estimado/a *'+cajaPaciente(a)+'*:',
      saludo,
      '',
      '👩‍⚕️ *Médico:* '+cajaMedico(a),
      '🩺 *Servicio:* '+servicio,
      fechaContexto?'📅 *Fecha:* '+cajaFecha(fechaContexto):'',
      '💳 *Forma de pago:* '+cajaTxt(p.forma_pago||'—'),
      '💵 *Valor total:* '+cajaMoney(m.valor_final),
      '💰 *'+estado.etiquetaMovimiento+':* '+cajaMoney(p.valor_pago),
      '✅ *'+estado.etiquetaAcumulado+':* '+cajaMoney(m.total_pagado),
      estado.cancelado?'🟢 *Saldo pendiente:* $0.00 · CANCELADO':'🔖 *Saldo pendiente:* '+cajaMoney(m.saldo_pendiente),
      '🧾 *Comprobante:* '+cajaTxt(p.id_pago||'—'),
      '',
      cierre,
      '',
      'Este comprobante interno no constituye factura ni comprobante tributario autorizado.',
      '',
      'Gracias por confiar en *'+cajaTxt(cfg.nombre||'IASYN')+'*. 🌷'
    ].filter(Boolean);

    window.open('https://wa.me/'+telefono+'?text='+encodeURIComponent(lineas.join('\n')),'_blank','noopener');
  }

function cajaMejorarCampoValorRecibido(){
    const valor=document.getElementById('cajaValorPago');
    if(!valor || valor.dataset.cajaSelectAllInit==='1') return;

    valor.dataset.cajaSelectAllInit='1';

    const seleccionarTodo=function(){
      try{
        requestAnimationFrame(function(){
          valor.select();
        });
      }catch(_e){}
    };

    valor.addEventListener('focus', seleccionarTodo);
    valor.addEventListener('click', seleccionarTodo);
  }

function cajaAplicarMejorasInterfaz(){
    const screen=document.getElementById('caja');
    if(!screen || screen.dataset.cajaPremiumInit==='1') return;
    screen.dataset.cajaPremiumInit='1';

    /* CSS exclusivo de Caja. No modifica otros módulos de Secretaría. */
    if(!document.getElementById('iasynCajaJsPremiumCSS')){
      const style=document.createElement('style');
      style.id='iasynCajaJsPremiumCSS';
      style.textContent=`
        #caja .caja-search-grid{
          display:grid;
          grid-template-columns:minmax(135px,.72fr) minmax(220px,1.45fr) minmax(145px,.83fr);
          gap:8px;
          margin-bottom:12px;
          align-items:stretch;
        }
        #caja .caja-search-grid .form-control,
        #caja .caja-search-grid .form-select{
          min-height:44px;
          height:44px;
          padding:8px 36px 8px 11px;
          font-size:13px;
          line-height:1.2;
          white-space:nowrap;
          text-overflow:ellipsis;
        }
        #caja .caja-search-grid .form-control{
          padding-right:11px;
        }
        #caja .caja-actions{
          align-items:stretch;
        }
        #caja .caja-actions button,
        #caja .caja-actions .btn-auro,
        #caja .caja-actions .btn-soft,
        #caja .caja-actions .btn-line{
          min-height:42px;
          line-height:1.15;
          white-space:normal;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          text-align:center;
        }
        #caja #cajaFormaPago{
          min-height:44px;
          line-height:1.2;
          padding-right:38px;
          text-overflow:ellipsis;
        }
        #caja .caja-payment-grid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
        }
        #caja .caja-payment-grid .caja-span-full{
          grid-column:1/-1;
        }
        @media(max-width:980px){
          #caja .caja-search-grid{
            grid-template-columns:1fr 1fr;
          }
          #caja .caja-search-grid .caja-search-main{
            grid-column:1/-1;
          }
        }
        @media(max-width:640px){
          #caja .caja-search-grid{
            grid-template-columns:1fr;
          }
          #caja .caja-search-grid .caja-search-main{
            grid-column:auto;
          }
          #caja .caja-search-grid .form-control,
          #caja .caja-search-grid .form-select{
            width:100%;
            min-height:46px;
            height:auto;
            font-size:14px;
          }
          #caja .caja-payment-grid{
            grid-template-columns:1fr;
          }
          #caja .caja-payment-grid .caja-span-full{
            grid-column:auto;
          }
          #caja .caja-actions{
            display:grid!important;
            grid-template-columns:1fr!important;
            gap:8px!important;
          }
          #caja .caja-actions button{
            width:100%!important;
            min-width:0!important;
            min-height:46px!important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    /* Convierte la barra existente en buscador por campo + texto + estado. */
    const buscar=document.getElementById('cajaBuscar');
    const filtro=document.getElementById('cajaFiltro');
    const oldRow=buscar?.closest('.row.g-2.mb-3');

    /* Estado financiero adicional, sin cambiar los estados persistidos en BD. */
    if(filtro && !filtro.querySelector('option[value="anticipo"]')){
      const opt=document.createElement('option');
      opt.value='anticipo';
      opt.textContent='Anticipos';
      filtro.insertBefore(opt,filtro.querySelector('option[value="Pagado"]')||null);
    }

    if(buscar && filtro && oldRow && !document.getElementById('cajaBuscarPor')){
      const wrap=document.createElement('div');
      wrap.className='caja-search-grid';

      const select=document.createElement('select');
      select.id='cajaBuscarPor';
      select.className='form-select';
      select.innerHTML=
        '<option value="todos">Buscar en todo</option>'+
        '<option value="paciente">Paciente</option>'+
        '<option value="cedula">Cédula</option>'+
        '<option value="medico">Médico</option>'+
        '<option value="atencion">Atención / cita</option>';
      select.addEventListener('change',renderCajaAtenciones);

      const main=document.createElement('div');
      main.className='caja-search-main';
      main.appendChild(buscar);
      buscar.placeholder='Escriba nombre, cédula, médico o ID...';

      const status=document.createElement('div');
      status.appendChild(filtro);

      wrap.appendChild(select);
      wrap.appendChild(main);
      wrap.appendChild(status);
      oldRow.replaceWith(wrap);
    }

    /* Valor recibido: al tocarlo se selecciona completo para escribir encima. */
    cajaMejorarCampoValorRecibido();

    /* Forma de pago siempre exige decisión explícita, incluso al cancelar saldo. */
    const forma=document.getElementById('cajaFormaPago');
    if(forma && !forma.querySelector('option[value=""]')){
      const opt=document.createElement('option');
      opt.value='';
      opt.textContent='Seleccione forma...';
      forma.insertBefore(opt,forma.firstChild);
      forma.value='';
    }

    /* Botón final más claro: llena el saldo, no cobra sin modalidad. */
    const btnSaldo=[...screen.querySelectorAll('button')].find(b=>
      cajaNormalizar(b.textContent).includes('cobrar saldo completo')
    );
    if(btnSaldo){
      btnSaldo.innerHTML='<i class="bi bi-check-all"></i> Cobrar saldo completo';
      btnSaldo.title='Completa el saldo pendiente. Luego seleccione la forma de pago y pulse Registrar pago.';
    }

    /* Recibo A4 + WhatsApp: reutiliza la zona de acciones existente de Caja. */
    const btnRecibo=document.getElementById('cajaBtnRecibo');
    if(btnRecibo){
      btnRecibo.innerHTML='<i class="bi bi-file-earmark-text"></i> Ver recibo';
      btnRecibo.title='Abrir vista previa A4 del último comprobante.';
      const acciones=btnRecibo.parentElement;
      if(acciones && !document.getElementById('cajaBtnWhatsAppRecibo')){
        const wa=document.createElement('button');
        wa.id='cajaBtnWhatsAppRecibo';
        wa.type='button';
        wa.className='btn-line';
        wa.style.display='none';
        wa.innerHTML='<i class="bi bi-whatsapp"></i> Enviar por WhatsApp';
        wa.onclick=cajaEnviarReciboWhatsApp;
        acciones.appendChild(wa);
      }
    }

    /* Mejor distribución del formulario de pago en tablet/móvil. */
    const valorPago=document.getElementById('cajaValorPago');
    const ref=document.getElementById('cajaReferenciaPago');
    const obs=document.getElementById('cajaObservacionPago');
    const row=valorPago?.closest('.row.g-2');
    if(row){
      row.classList.remove('row','g-2');
      row.classList.add('caja-payment-grid');
      [...row.children].forEach((col,i)=>{
        col.className = i>=2 ? 'caja-span-full' : '';
      });
    }
  }

  /* El archivo puede cargarse antes o después de DOMContentLoaded. */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',cajaAplicarMejorasInterfaz,{once:true});
  }else{
    cajaAplicarMejorasInterfaz();
  }
