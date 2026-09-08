/*
  IASYN - COMPATIBILIDAD ANTIRREGRESIVA
  Los nombres internos auro* y las claves legacy compartidas con Pacientes,
  Atenciones e Historia se conservan temporalmente porque forman parte del
  contrato entre módulos. No representan una conexión externa con AUROSANAX.
  Este módulo no contiene URLs, Spreadsheet IDs ni Drive IDs propios.
*/

/* ============================================================
   IASYN ERP - MÓDULO AGENDA MÉDICA
   Extraído quirúrgicamente desde index.
   Conserva los nombres públicos para compatibilidad.
============================================================ */ 

/* IASYN: función normalizarEstadoAgenda movida a pacientes.js */

function badgeEstadoAgenda(estado){
  const e = normalizarEstadoAgenda(estado);
  if(e === 'confirmada') return '<span class="badge-auro badge-ok">Confirmada</span>';
  if(e === 'atendida') return '<span class="badge-auro badge-blue">Atendida</span>';
  if(e === 'anulada') return '<span class="badge-auro badge-danger">Anulada</span>';
  if(e === 'no asistio') return '<span class="badge-auro badge-danger">No asistió</span>';
  if(e === 'pendiente') return '<span class="badge-auro badge-warn">Pendiente</span>';
  return '<span class="badge-auro badge-warn">Sin estado</span>';
}

/* IASYN: función formatearFechaVisual movida a pacientes.js */


function abrirSecretaria(){
  window.location.href = 'secretaria.html?from=erp';
}

function auroPacienteAgendaPorId(idPaciente){
  const id = String(idPaciente || '').trim();
  if(!id || !Array.isArray(patients)) return null;
  return patients.find(p => String(p.id_paciente || '').trim() === id) || null;
}

function auroNombrePacienteAgenda(c){
  const directo = String(
    c?.paciente ||
    c?.nombre_paciente ||
    c?.nombre_completo ||
    c?.paciente_nombre ||
    c?.nombre ||
    ''
  ).trim();

  if(directo) return directo;

  const p = auroPacienteAgendaPorId(c?.id_paciente);
  if(p){
    return String(
      p.nombre ||
      ((p.nombres || '') + ' ' + (p.apellidos || '')).trim() ||
      ''
    ).trim();
  }

  return c?.id_paciente || '';
}

function auroWhatsappPacienteAgenda(c){
  const directo = String(
    c?.whatsapp ||
    c?.telefono ||
    c?.celular ||
    c?.telefono_paciente ||
    c?.whatsapp_paciente ||
    ''
  ).trim();

  if(directo) return directo;

  const p = auroPacienteAgendaPorId(c?.id_paciente);
  return p ? String(p.telefono || p.whatsapp || p.celular || '').trim() : '';
}

function auroServicioAgenda(c){
  return String(c?.servicio || c?.tipo_cita || c?.motivo || '').trim();
}

function auroMedicoAgendaPorId(idMedico){
  const id = String(idMedico || '').trim();
  if(!id || !Array.isArray(medicosAgendaWeb)) return null;
  return medicosAgendaWeb.find(m => String(m.id_medico || m.id || '').trim() === id) || null;
}

function auroNombreMedicoAgenda(c){
  const directo = String(
    c?.nombre_medico ||
    c?.medico_nombre ||
    c?.doctor_nombre ||
    c?.medico ||
    c?.doctor ||
    ''
  ).trim();
  if(directo) return directo;

  const m = auroMedicoAgendaPorId(c?.id_medico);
  if(m){
    return String(
      m.nombre_completo ||
      m.nombre ||
      ((m.nombres || '') + ' ' + (m.apellidos || '')).trim() ||
      ''
    ).trim();
  }

  return String(c?.id_medico || '').trim();
}

function auroPacienteVinculadoAgenda(c){
  return auroPacienteAgendaPorId(c?.id_paciente);
}

function auroHistoriaPacienteAgenda(c){
  const p = auroPacienteVinculadoAgenda(c);
  if(!p || !Array.isArray(historiasClinicas)) return null;
  const idPaciente = String(p.id_paciente || '').trim();
  return historiasClinicas.find(h => String(h.id_paciente || h.paciente_id || '').trim() === idPaciente) || null;
}

function auroBadgeHistoriaAgenda(c){
  const p = auroPacienteVinculadoAgenda(c);
  if(!p) return '<span class="badge-auro badge-warn">Paciente no vinculado</span>';
  return auroHistoriaPacienteAgenda(c)
    ? '<span class="badge-auro badge-ok">Disponible</span>'
    : '<span class="badge-auro badge-warn">Sin historia</span>';
}

function auroFechaAgenda(c){
  return String(c?.fecha_cita || c?.fecha || c?.fecha_deseada || '').substring(0,10);
}

function auroHoraVisualAgenda(valor){
  if(valor === null || valor === undefined) return '';

  if(typeof valor === 'number' && isFinite(valor)){
    const total = Math.round((valor % 1) * 24 * 60);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }

  let txt = String(valor || '').trim();
  if(!txt) return '';

  const iso = txt.match(/T(\d{2}):(\d{2})/);
  if(iso) return iso[1] + ':' + iso[2];

  if(/^\d{1}:\d{2}$/.test(txt)) return '0' + txt;
  if(/^\d{1,2}:\d{2}/.test(txt)){
    const p = txt.split(':');
    return String(p[0]).padStart(2,'0') + ':' + String(p[1]).substring(0,2);
  }

  return txt;
}

function auroHoraAgenda(c){
  const inicio = auroHoraVisualAgenda(c?.hora_inicio || c?.hora_deseada || c?.hora || '');
  const fin = auroHoraVisualAgenda(c?.hora_fin || '');
  if(inicio && fin) return inicio + ' - ' + fin;
  return inicio || fin || '';
}

function auroEstadoAgenda(c){
  return String(c?.estado_cita || c?.estado || '').trim();
}

function auroNormalizarCitaSecretariaParaERP(c, index){
  return {
    ...c,
    originalIndex: index,
    id_cita: c?.id_cita || c?.id || '',
    nombre: auroNombrePacienteAgenda(c),
    whatsapp: auroWhatsappPacienteAgenda(c),
    servicio: auroServicioAgenda(c),
    fecha_deseada: auroFechaAgenda(c),
    hora_deseada: auroHoraAgenda(c),
    estado: auroEstadoAgenda(c),
    medico_nombre: auroNombreMedicoAgenda(c),
    origen: 'Secretaría'
  };
}

/* ============================================================
   AGENDA 04 - CARGA PERCIBIDA RÁPIDA + VERIFICACIÓN SEGURA
   - Renderiza citas apenas llegan.
   - Verifica Atenciones después, sin bloquear la vista.
   - Mientras verifica, bloquea únicamente la acción de iniciar consulta.
   - No modifica IDs, estados, creación de paciente/historia ni backend.
============================================================ */
let auroAgendaVerificacionAtenciones = 'lista'; // lista | verificando | error
let auroAgendaCargaSecuencia = 0;

function auroAgendaEstadoBotonActualizar(estado, detalle){
  const btn = document.getElementById('agendaRefreshBtn');
  if(!btn) return;

  const icon = btn.querySelector('.auro-agenda-refresh-icon');
  const label = btn.querySelector('.auro-agenda-refresh-label');
  btn.classList.remove('is-loading','is-success','is-error');
  btn.disabled = estado === 'loading';
  btn.setAttribute('aria-busy', estado === 'loading' ? 'true' : 'false');

  if(estado === 'loading'){
    btn.classList.add('is-loading');
    if(icon) icon.className = 'bi bi-arrow-clockwise auro-agenda-refresh-icon';
    if(label) label.textContent = detalle || 'Actualizando…';
  }else if(estado === 'success'){
    btn.classList.add('is-success');
    if(icon) icon.className = 'bi bi-check2-circle auro-agenda-refresh-icon';
    if(label) label.textContent = detalle || 'Agenda actualizada';
  }else if(estado === 'error'){
    btn.classList.add('is-error');
    if(icon) icon.className = 'bi bi-exclamation-triangle auro-agenda-refresh-icon';
    if(label) label.textContent = detalle || 'Reintentar';
  }else{
    if(icon) icon.className = 'bi bi-arrow-clockwise auro-agenda-refresh-icon';
    if(label) label.textContent = 'Actualizar agenda';
  }
}

function auroAgendaEstadoCargaVisual(texto, tipo){
  const info = document.getElementById('agendaCountInfo');
  if(!info) return;
  info.classList.remove('auro-agenda-info-loading','auro-agenda-info-ok','auro-agenda-info-error');
  if(tipo) info.classList.add('auro-agenda-info-' + tipo);
  info.textContent = texto || '';
}

async function cargarCitasAgendaWeb(){
  const secuencia = ++auroAgendaCargaSecuencia;
  const body = document.getElementById('agendaBody');
  const mobile = document.getElementById('agendaMobile');

  auroAgendaEstadoBotonActualizar('loading','Cargando citas…');
  auroAgendaEstadoCargaVisual('Cargando agenda médica…','loading');

  if(body && !citasAgendaWebCargadas){
    body.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Cargando citas…</td></tr>';
  }
  if(mobile && !citasAgendaWebCargadas){
    mobile.innerHTML = '<div class="mobile-card text-muted"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Cargando citas…</div>';
  }

  try{
    const [resCitas, resMedicos] = await Promise.all([
      fetch(API_URL + '?accion=listarCitas&t=' + Date.now()),
      fetch(API_URL + '?accion=listarMedicos&t=' + Date.now()).catch(() => null)
    ]);

    if(secuencia !== auroAgendaCargaSecuencia) return;

    if(!resCitas || !resCitas.ok){
      throw new Error('No se pudo consultar la agenda.');
    }

    const data = await resCitas.json();
    if(!Array.isArray(data)){
      throw new Error(data?.message || 'Secretaría no devolvió una lista válida de citas.');
    }

    if(resMedicos){
      try{
        const dataMedicos = await resMedicos.json();
        medicosAgendaWeb = Array.isArray(dataMedicos) ? dataMedicos : [];
      }catch(_e){
        medicosAgendaWeb = [];
      }
    }

    citasAgendaWeb = data.map((c, index) => auroNormalizarCitaSecretariaParaERP(c, index));
    citasAgendaWebCargadas = true;

    /* Primera pintura: la Agenda ya es visible. */
    auroAgendaVerificacionAtenciones = 'verificando';
    auroActualizarFiltroMedicosAgenda();
    renderAgendaWeb();
    auroAgendaEstadoBotonActualizar('loading','Verificando consultas…');

    const pacientesActivo = document.getElementById('pacientes')?.classList.contains('active');
    if(pacientesActivo && typeof renderPatients === 'function'){
      renderPatients();
    }

    /* Segunda fase: protege la id_cita sin secuestrar el render inicial. */
    try{
      if(typeof window.refrescarAtencionesDesdeSheets === 'function'){
        await window.refrescarAtencionesDesdeSheets();
      }
      if(secuencia !== auroAgendaCargaSecuencia) return;
      auroAgendaVerificacionAtenciones = 'lista';
      renderAgendaWeb();
      auroAgendaEstadoBotonActualizar('success','Agenda verificada');
      setTimeout(function(){
        if(secuencia === auroAgendaCargaSecuencia){
          auroAgendaEstadoBotonActualizar('idle');
        }
      }, 1400);
    }catch(errorAtenciones){
      if(secuencia !== auroAgendaCargaSecuencia) return;
      auroAgendaVerificacionAtenciones = 'error';
      console.warn('AGENDA: no se pudo verificar Atenciones.', errorAtenciones);
      renderAgendaWeb();
      auroAgendaEstadoBotonActualizar('error','Verificación pendiente');
    }

  }catch(error){
    if(secuencia !== auroAgendaCargaSecuencia) return;
    citasAgendaWebCargadas = false;
    auroAgendaVerificacionAtenciones = 'error';
    console.error(error);
    auroAgendaEstadoBotonActualizar('error','Reintentar');
    auroAgendaEstadoCargaVisual('No se pudo cargar la agenda.','error');
    if(body){
      body.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">No se pudo cargar la agenda. Use “Reintentar”.</td></tr>';
    }
    if(mobile){
      mobile.innerHTML = '<div class="mobile-card text-danger">No se pudo cargar la agenda. Use “Reintentar”.</div>';
    }
  }
}

function auroNormalizarTextoAgenda(valor){
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/*
  IASYN - CONTROL QUIRÚRGICO DE CITA YA UTILIZADA
  --------------------------------------------------
  La acción clínica se bloquea únicamente cuando ya existe una atención
  vinculada al mismo id_cita. No se compara solo por paciente, fecha o nombre.
*/
function auroAtencionesLocalesAgenda(){
  try{
    const raw = localStorage.getItem('aurosanax_atenciones_local_v1');
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  }catch(error){
    console.warn('IASYN AGENDA: no se pudieron leer las atenciones locales.', error);
    return [];
  }
}

function auroIdCitaAgenda(c){
  return String(
    c?.id_cita ||
    c?.id ||
    c?.id_cita_web ||
    c?.fila_origen ||
    ''
  ).trim();
}

function auroAtencionVinculadaACitaAgenda(c){
  const idCita = auroIdCitaAgenda(c);
  if(!idCita) return null;

  return auroAtencionesLocalesAgenda().find(function(atencion){
    return String(atencion?.id_cita || '').trim() === idCita &&
           String(atencion?.id_atencion || '').trim();
  }) || null;
}

function auroPuedeIniciarConsultaAgenda(c){
  if(auroAtencionVinculadaACitaAgenda(c)){
    return false;
  }

  const estado = normalizarEstadoAgenda(auroEstadoAgenda(c));
  return estado === 'confirmada' || estado === 'pendiente';
}

function auroActualizarFiltroMedicosAgenda(){
  const select = document.getElementById('agendaMedico');
  if(!select) return;

  const actual = select.value || '';
  const mapa = new Map();

  (Array.isArray(medicosAgendaWeb) ? medicosAgendaWeb : []).forEach(m => {
    const id = String(m?.id_medico || m?.id || m?.codigo || '').trim();
    const nombre = String(m?.nombre_completo || m?.nombre || ((m?.nombres || '') + ' ' + (m?.apellidos || ''))).trim();
    if(nombre) mapa.set(id || auroNormalizarTextoAgenda(nombre), {id, nombre});
  });

  (Array.isArray(citasAgendaWeb) ? citasAgendaWeb : []).forEach(c => {
    const id = String(c?.id_medico || c?.medico_id || '').trim();
    const nombre = String(c?.medico_nombre || auroNombreMedicoAgenda(c) || '').trim();
    if(nombre) mapa.set(id || auroNormalizarTextoAgenda(nombre), {id, nombre});
  });

  const opciones = Array.from(mapa.values()).sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
  select.innerHTML = '<option value="">Todos los médicos</option>' + opciones.map(m =>
    `<option value="${String(m.id || auroNormalizarTextoAgenda(m.nombre)).replace(/"/g,'&quot;')}">${m.nombre}</option>`
  ).join('');

  if(Array.from(select.options).some(o => o.value === actual)) select.value = actual;
}

/* ============================================================
   IASYN AGENDA 03 - CREAR PACIENTE DESDE CITA
   Cambio quirúrgico y antirregresivo:
   - Solo actúa cuando la cita NO tiene un paciente válido vinculado.
   - Reutiliza el modal normal de Pacientes; no crea otro formulario.
   - Conserva temporalmente la id_cita para que Pacientes pueda vincularla
     después del guardado real.
   - No afecta Historia, Atención espontánea, citas ya vinculadas,
     estados, disponibilidad, WhatsApp, filtros ni paginación.
============================================================ */
function auroDatosPacienteDesdeCitaAgenda(c){
  c = c || {};

  const nombreCompleto = String(
    c.nombre_paciente || c.paciente || c.nombre_completo ||
    c.paciente_nombre || c.nombre || ''
  ).replace(/\s+/g,' ').trim();

  let nombres = String(c.nombres || c.nombres_paciente || c.primer_nombre || '').replace(/\s+/g,' ').trim();
  let apellidos = String(c.apellidos || c.apellidos_paciente || c.apellido || '').replace(/\s+/g,' ').trim();

  /* Solo como ayuda visual cuando la cita no trae nombres/apellidos separados.
     El usuario conserva el control del formulario antes de guardar. */
  if(!nombres && !apellidos && nombreCompleto){
    const partes = nombreCompleto.split(/\s+/).filter(Boolean);
    if(partes.length === 1){
      nombres = partes[0];
    }else if(partes.length === 2){
      nombres = partes[0];
      apellidos = partes[1];
    }else if(partes.length === 3){
      nombres = partes.slice(0,2).join(' ');
      apellidos = partes[2];
    }else{
      nombres = partes.slice(0, partes.length - 2).join(' ');
      apellidos = partes.slice(-2).join(' ');
    }
  }

  return {
    id_cita: auroIdCitaAgenda(c),
    nombres: nombres,
    apellidos: apellidos,
    nombre_completo: nombreCompleto,
    cedula: String(c.numero_documento || c.cedula || c.documento || '').trim(),
    telefono: auroWhatsappPacienteAgenda(c),
    email: String(c.email || c.correo || c.email_paciente || '').trim(),
    servicio: auroServicioAgenda(c),
    origen: 'agenda_medica'
  };
}

function abrirCrearPacienteDesdeAgenda(index){
  const c = citasAgendaWeb[index];
  if(!c){
    alert('No se encontró la cita seleccionada.');
    return;
  }

  if(auroPacienteVinculadoAgenda(c)){
    renderAgendaWeb();
    alert('La cita ya tiene un paciente registrado vinculado.');
    return;
  }

  const contexto = auroDatosPacienteDesdeCitaAgenda(c);
  if(!contexto.id_cita){
    alert('La cita no tiene un identificador válido. Actualice la agenda antes de crear el paciente.');
    return;
  }

  window.auroPacienteDesdeAgendaContexto = contexto;
  try{
    sessionStorage.setItem('auro_paciente_desde_agenda', JSON.stringify(contexto));
  }catch(_e){}

  if(typeof openPatientModal !== 'function'){
    alert('El módulo Pacientes no está disponible.');
    return;
  }

  openPatientModal();

  /* Prellenado defensivo: solo campos existentes del formulario normal. */
  if(typeof setValueIfExists === 'function'){
    setValueIfExists('pNombres', contexto.nombres || '');
    setValueIfExists('pApellidos', contexto.apellidos || '');
    setValueIfExists('pNombre', contexto.nombre_completo || '');
    setValueIfExists('pCedula', contexto.cedula || '');
    setValueIfExists('pTelefono', contexto.telefono || '');
    setValueIfExists('pEmail', contexto.email || '');

    const servicio = document.getElementById('pServicio');
    if(servicio && contexto.servicio){
      const buscado = typeof normalizarTextoComparacion === 'function'
        ? normalizarTextoComparacion(contexto.servicio)
        : String(contexto.servicio).trim().toLowerCase();
      const opcion = Array.from(servicio.options || []).find(function(opt){
        const valor = typeof normalizarTextoComparacion === 'function'
          ? normalizarTextoComparacion(opt.value || opt.textContent || '')
          : String(opt.value || opt.textContent || '').trim().toLowerCase();
        return valor === buscado;
      });
      if(opcion) servicio.value = opcion.value;
    }
  }

  setTextIfExists('patientModalTitle','Crear paciente desde cita');
}

function auroAccionClinicaAgendaHTML(c, modoMovil){
  if(!auroPacienteVinculadoAgenda(c)){
    return modoMovil
      ? `<button class="btn-auro w-100" onclick="abrirCrearPacienteDesdeAgenda(${c.originalIndex})"><i class="bi bi-person-plus me-1"></i> Crear paciente</button>`
      : `<button class="btn-action primary" title="Crear y vincular paciente a esta cita" onclick="abrirCrearPacienteDesdeAgenda(${c.originalIndex})"><i class="bi bi-person-plus me-1"></i> Crear paciente</button>`;
  }

  if(!auroHistoriaPacienteAgenda(c)){
    return modoMovil
      ? `<button class="btn-auro w-100" onclick="abrirHistoriaDesdeAgenda(${c.originalIndex})"><i class="bi bi-file-earmark-plus me-1"></i> Crear historia</button>`
      : `<button class="btn-action primary" title="Crear historia clínica" onclick="abrirHistoriaDesdeAgenda(${c.originalIndex})"><i class="bi bi-file-earmark-plus me-1"></i> Crear historia</button>`;
  }

  /* La cita ya se ve, pero no se permite iniciar una consulta hasta confirmar
     contra Atenciones que esa id_cita no fue utilizada. */
  if(auroAgendaVerificacionAtenciones === 'verificando'){
    return modoMovil
      ? '<button class="btn-auro w-100 auro-agenda-action-checking" type="button" disabled><span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Verificando consulta…</button>'
      : '<button class="btn-action primary auro-agenda-action-checking" type="button" disabled title="Verificando si esta cita ya tiene una atención"><span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Verificando…</button>';
  }

  if(auroAgendaVerificacionAtenciones === 'error'){
    return modoMovil
      ? '<button class="btn-soft w-100" type="button" disabled><i class="bi bi-shield-exclamation me-1"></i> Actualice para verificar</button>'
      : '<button class="btn-action soft" type="button" disabled title="No se pudo verificar todavía si esta cita ya tiene una atención"><i class="bi bi-shield-exclamation me-1"></i> Verificación pendiente</button>';
  }

  if(auroPuedeIniciarConsultaAgenda(c)){
    return modoMovil
      ? `<button class="btn-auro w-100" onclick="abrirHistoriaDesdeAgenda(${c.originalIndex})"><i class="bi bi-play-circle me-1"></i> Iniciar consulta</button>`
      : `<button class="btn-action primary" title="Iniciar consulta" onclick="abrirHistoriaDesdeAgenda(${c.originalIndex})"><i class="bi bi-play-circle me-1"></i> Iniciar consulta</button>`;
  }

  return modoMovil
    ? '<div class="auro-agenda-estado-cerrado"><i class="bi bi-check2-circle"></i> Consulta no disponible en este estado</div>'
    : '<span class="auro-agenda-estado-cerrado"><i class="bi bi-check2-circle"></i> Sin acción clínica</span>';
}

function renderAgendaWeb(){
  const q = (document.getElementById('agendaSearch')?.value || '').toLowerCase();
  const fecha = document.getElementById('agendaFecha')?.value || '';
  const estadoRaw = (document.getElementById('agendaEstado')?.value || '').trim();
  const estadoFiltro = estadoRaw ? normalizarEstadoAgenda(estadoRaw) : '';
  const medicoFiltro = (document.getElementById('agendaMedico')?.value || '').trim();
  const medicoFiltroNorm = auroNormalizarTextoAgenda(medicoFiltro);
  const sizeSelect = document.getElementById('agendaPageSize');
  if(sizeSelect) agendaPageSize = parseInt(sizeSelect.value,10) || 25;

  const hoy = fechaHoyISO();

  const rows = citasAgendaWeb.map((c, originalIndex) => ({...c, originalIndex})).filter(c => {
    const estadoCita = normalizarEstadoAgenda(c.estado);
    const nombreMedico = String(c.medico_nombre || auroNombreMedicoAgenda(c) || '').trim();
    const idMedico = String(c.id_medico || c.medico_id || '').trim();
    const txt = [c.nombre, c.whatsapp, c.servicio, c.fecha_deseada, c.hora_deseada, estadoCita, nombreMedico].join(' ').toLowerCase();
    const coincideMedico = !medicoFiltro || idMedico === medicoFiltro || auroNormalizarTextoAgenda(nombreMedico) === medicoFiltroNorm;

    return (!q || txt.includes(q)) &&
           (!fecha || c.fecha_deseada === fecha) &&
           (!estadoFiltro || estadoCita === estadoFiltro) &&
           coincideMedico;
  }).sort((a, b) => {
    const fechaA = String(a.fecha_deseada || '');
    const fechaB = String(b.fecha_deseada || '');
    const horaA = String(a.hora_deseada || '');
    const horaB = String(b.hora_deseada || '');

    const grupoA = fechaA >= hoy ? 0 : 1; // 0 = hoy/futuras, 1 = pasadas
    const grupoB = fechaB >= hoy ? 0 : 1;

    if(grupoA !== grupoB) return grupoA - grupoB;

    const valorA = `${fechaA} ${horaA}`;
    const valorB = `${fechaB} ${horaB}`;

    // Hoy y futuras: de menor a mayor. Pasadas: de más reciente a más antigua.
    return grupoA === 0
      ? valorA.localeCompare(valorB)
      : valorB.localeCompare(valorA);
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / agendaPageSize));
  if(agendaPage > totalPages) agendaPage = totalPages;
  if(agendaPage < 1) agendaPage = 1;
  const startIndex = (agendaPage - 1) * agendaPageSize;
  const visibleRows = rows.slice(startIndex, startIndex + agendaPageSize);
  const endIndex = Math.min(startIndex + visibleRows.length, rows.length);

  setTextIfExists('agendaCountInfo', rows.length ? `Mostrando ${startIndex + 1}–${endIndex} de ${rows.length} citas` : 'No hay citas para mostrar');
  setTextIfExists('agendaPageInfo', `Página ${agendaPage} / ${totalPages}`);
  const prevBtn = document.getElementById('agendaPrevBtn');
  const nextBtn = document.getElementById('agendaNextBtn');
  if(prevBtn) prevBtn.disabled = agendaPage <= 1;
  if(nextBtn) nextBtn.disabled = agendaPage >= totalPages;

  const body = document.getElementById('agendaBody');
  if(body){
    body.innerHTML = visibleRows.map((c) => `
      <tr>
        <td>${formatearFechaVisual(c.fecha_deseada)}</td>
        <td><b>${c.hora_deseada || ''}</b></td>
        <td><b>${c.nombre || ''}</b><br><small class="text-muted">${c.origen || 'Agenda Web'}</small></td>
        <td>${c.medico_nombre || auroNombreMedicoAgenda(c) || '<span class="text-muted">Sin asignar</span>'}</td>
        <td>${c.whatsapp || ''}</td>
        <td><span class="badge-auro">${c.servicio || ''}</span></td>
        <td>${auroBadgeHistoriaAgenda(c)}</td>
        <td>${badgeEstadoAgenda(c.estado)}</td>
        <td>
          <div class="patient-action-group">
            <button class="btn-action success" title="WhatsApp" onclick="abrirWhatsAppCitaAgenda(${c.originalIndex})"><i class="bi bi-whatsapp me-1"></i> WhatsApp</button>
            ${auroAccionClinicaAgendaHTML(c, false)}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9" class="text-center text-muted py-4">Sin citas para mostrar</td></tr>';
  }

  const mobile = document.getElementById('agendaMobile');
  if(mobile){
    mobile.innerHTML = visibleRows.map((c) => `
      <div class="mobile-card">
        <div class="mobile-card-top"><b>${formatearFechaVisual(c.fecha_deseada)} · ${c.hora_deseada || ''}</b>${badgeEstadoAgenda(c.estado)}</div>
        <div class="line"><span>Paciente</span><span>${c.nombre || ''}</span></div>
        <div class="line"><span>Médico</span><span>${c.medico_nombre || auroNombreMedicoAgenda(c) || 'Sin asignar'}</span></div>
        <div class="line"><span>WhatsApp</span><span>${c.whatsapp || ''}</span></div>
        <div class="line"><span>Servicio</span><span>${c.servicio || ''}</span></div>
        <div class="line"><span>Historia</span><span>${auroBadgeHistoriaAgenda(c)}</span></div>
        <div class="auro-agenda-mobile-actions">
          <button class="btn-soft w-100" onclick="abrirWhatsAppCitaAgenda(${c.originalIndex})"><i class="bi bi-whatsapp me-1"></i> WhatsApp</button>
          ${auroAccionClinicaAgendaHTML(c, true)}
        </div>
      </div>
    `).join('') || '<div class="mobile-card text-muted">Sin citas para mostrar</div>';
  }

  actualizarDashboard();
}

function cambiarPaginaAgenda(delta){
  agendaPage += delta;
  renderAgendaWeb();
}


function limpiarFiltrosAgenda(){
  if(document.getElementById('agendaSearch')) document.getElementById('agendaSearch').value = '';
  if(document.getElementById('agendaFecha')) document.getElementById('agendaFecha').value = '';
  if(document.getElementById('agendaEstado')) document.getElementById('agendaEstado').value = '';
  if(document.getElementById('agendaMedico')) document.getElementById('agendaMedico').value = '';
  agendaPage = 1;
  renderAgendaWeb();
}

function abrirWhatsAppCitaAgenda(index){
  const c = citasAgendaWeb[index];
  if(!c){
    alert('No se encontró la cita seleccionada.');
    return;
  }

  const mensaje = `Hola ${c.nombre || ''},\n\nLe saluda IASYN.\nLe escribimos sobre su solicitud de cita para ${c.servicio || 'atención médica'} el ${formatearFechaVisual(c.fecha_deseada)} a las ${c.hora_deseada || ''}.\n\nPor favor, confirme si mantiene su disponibilidad.`;
  abrirWhatsApp(c.whatsapp, mensaje);
}


/* ============================================================
   IASYN - LIMPIEZA SEGURA PARA HISTORIA NUEVA DESDE AGENDA
   Se ejecuta únicamente cuando la cita aún no tiene historia.
   No se aplica al abrir una historia existente.
============================================================ */
function auroLimpiarHistoriaNuevaDesdeAgenda(){
  try{
    const historia = document.getElementById('historia');
    if(historia){
      historia.querySelectorAll('.clinical-panel input, .clinical-panel textarea, .clinical-panel select').forEach(function(el){
        if(el.id === 'hcPacienteSelect') return;

        if(el.type === 'checkbox' || el.type === 'radio'){
          el.checked = false;
          return;
        }

        if(el.tagName === 'SELECT'){
          el.selectedIndex = 0;
          return;
        }

        if(!el.readOnly && !el.disabled){
          el.value = '';
        }
      });
    }

    try{ editingHistoryId = null; }catch(_e){}
    window.editingHistoryId = null;
    window.auroHistoriaSeleccionadaId = '';
    window.historiaActual = null;
    window.currentHistoria = null;

    if(window.planState) window.planState.atencionActual = '';
    if(window.examenFisicoState) window.examenFisicoState.atencionActual = '';

    if(typeof window.auroLimpiarPlanVisualAntesDeCambiarAtencion === 'function'){
      window.auroLimpiarPlanVisualAntesDeCambiarAtencion();
    }
    if(typeof window.auroLimpiarDiagnosticos === 'function'){
      window.auroLimpiarDiagnosticos();
    }
    if(typeof window.auroExamenFisicoLimpiarFormulario === 'function'){
      window.auroExamenFisicoLimpiarFormulario();
    }

    [
      ['hcPacienteResumen', 'Sin seleccionar'],
      ['hcAlergiasResumen', 'No registradas'],
      ['hcImcResumen', '—'],
      ['hcControlResumen', 'Pendiente']
    ].forEach(function(item){
      const el = document.getElementById(item[0]);
      if(el) el.textContent = item[1];
    });

  }catch(error){
    console.warn('IASYN AGENDA: no se pudo completar la limpieza de historia nueva.', error);
  }
}

function abrirHistoriaDesdeAgenda(index){
  const c = citasAgendaWeb[index];
  if(!c){
    alert('No se encontró la cita seleccionada.');
    return;
  }

  const paciente = auroPacienteVinculadoAgenda(c);
  if(!paciente){
    alert('Esta cita todavía no está vinculada a un paciente registrado. Vincule primero el paciente para evitar historias duplicadas.');
    return;
  }

  const idPaciente = String(paciente.id_paciente || '').trim();
  const historia = auroHistoriaPacienteAgenda(c);
  const idHistoria = String(historia?.id_historia || historia?.id || '').trim();
  const atencionCita = auroAtencionVinculadaACitaAgenda(c);

  if(atencionCita && historia){
    alert(
      'Esta cita ya tiene una consulta iniciada. ' +
      'No se creará una segunda atención desde Agenda.'
    );
    renderAgendaWeb();
    return;
  }

  if(historia){
    const idPacienteHistoria = String(historia.id_paciente || historia.paciente_id || '').trim();
    if(idPacienteHistoria && idPacienteHistoria !== idPaciente){
      alert('La historia clínica localizada no pertenece al paciente de la cita. Se bloqueó la apertura para proteger los datos.');
      return;
    }
  }

  /* Limpieza quirúrgica del contexto anterior antes de abrir otro paciente. */
  try{
    activePatientId = '';
    editingHistoryId = null;
    window.auroHistoriaSeleccionadaId = '';
    window.historiaActual = null;
    window.currentHistoria = null;
  }catch(_e){}

  /*
    Si la cita todavía no tiene historia, el formulario debe comenzar vacío.
    Una historia existente nunca se limpia aquí.
  */
  if(!historia){
    auroLimpiarHistoriaNuevaDesdeAgenda();
  }

  const referencia = {
    id_cita: String(c.id_cita || c.id || '').trim(),
    id_paciente: idPaciente,
    id_historia: idHistoria,
    id_medico: String(c.id_medico || '').trim(),
    fecha: String(c.fecha_deseada || '').trim(),
    hora: String(c.hora_deseada || '').trim(),
    servicio: String(c.servicio || '').trim(),
    origen: 'agenda_medica'
  };

  /*
    IASYN - MODO EXPLÍCITO DESDE AGENDA
    Agenda ya conoce si esta cita tiene una historia vinculada.
    No se deja que Pacientes lo deduzca usando otras historias del paciente.
  */
  const modoHistoria = idHistoria ? 'existente' : 'nueva';
  referencia.modo_historia = modoHistoria;
  window.auroModoAperturaHistoria = modoHistoria;

  window.auroCitaSeleccionadaAgenda = referencia;
  try{
    sessionStorage.setItem(
      'auro_cita_seleccionada_agenda',
      JSON.stringify(referencia)
    );
  }catch(_e){
    console.warn(
      'No se pudo conservar temporalmente la cita seleccionada.',
      _e
    );
  }

  abrirHistoriaPaciente(referencia.id_paciente, modoHistoria);

  /* Refuerzo posterior: conserva solo la historia verificada del paciente. */
  if(idHistoria){
    setTimeout(function(){
      const historiaActiva = Array.isArray(historiasClinicas)
        ? historiasClinicas.find(function(h){
            return String(h.id_historia || h.id || '').trim() === idHistoria &&
                   String(h.id_paciente || h.paciente_id || '').trim() === idPaciente;
          })
        : null;

      if(historiaActiva){
        window.auroHistoriaSeleccionadaId = idHistoria;
        window.historiaActual = historiaActiva;
        window.currentHistoria = historiaActiva;
        editingHistoryId = idHistoria;
      }
    }, 80);
  }
}
/* ============================================================
   IASYN AGENDA - API DE COMPATIBILIDAD
============================================================ */
window.IASYN_AGENDA = Object.assign(window.IASYN_AGENDA || {}, {
  cargarCitasAgendaWeb,
  renderAgendaWeb,
  limpiarFiltrosAgenda,
  cambiarPaginaAgenda,
  abrirHistoriaDesdeAgenda,
  abrirCrearPacienteDesdeAgenda,
  abrirWhatsAppCitaAgenda
});
