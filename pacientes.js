/*****************************************************************************************
 * IASYN ERP - pacientes.js
 * Módulo Pacientes extraído desde index.html.
 *
 * IMPORTANTE:
 * 1) En esta primera fase NO borres nada del index.html.
 * 2) Pega este contenido en pacientes.js.
 * 3) Luego conectamos el archivo desde index.html con:
 *    <script src="pacientes.js"></script>
 *
 * Este archivo contiene la lógica de:
 * - listado de pacientes
 * - búsqueda y filtro
 * - paginación
 * - última atención real desde citas atendidas
 * - nuevo paciente
 * - editar paciente
 * - WhatsApp de paciente
 * - selección de paciente para módulos clínicos
 *****************************************************************************************/

function setTextIfExists(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

/* Configuración defensiva del campo de cédula al cargar el módulo. */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){
    try{ auroConfigurarCampoCedulaPaciente(); }catch(_e){}
  });
}else{
  setTimeout(function(){
    try{ auroConfigurarCampoCedulaPaciente(); }catch(_e){}
  }, 0);
}

function getPacienteActivo(){
  const selectId = document.getElementById('hcPacienteSelect')?.value || '';

  const candidatos = [
    activePatientId,
    window.activePatientId,
    selectId,
    window.historiaActual?.id_paciente,
    window.currentHistoria?.id_paciente
  ].filter(Boolean);

  for(const id of candidatos){
    const paciente = patients.find(p =>
      String(p.id_paciente || p.id || '') === String(id)
    );
    if(paciente) return paciente;
  }

  return null;
}

function inicialesPaciente(nombre){
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if(!partes.length) return 'A';
  return partes.slice(0,2).map(x => x[0]).join('').toUpperCase();
}

function renderModulePatientCards(){
  const paciente = getPacienteActivo();
  document.querySelectorAll('[data-module-patient]').forEach(card => {
    const modulo = card.getAttribute('data-module-patient') || 'Módulo';
    if(!paciente){
      card.classList.add('empty');
      card.innerHTML = `
        <div>
          <div class="module-patient-title"><i class="bi bi-exclamation-triangle me-1"></i> ${modulo}: paciente no seleccionado</div>
          <div class="module-patient-meta"><span>Seleccione o abra un paciente desde Pacientes o Historia Clínica antes de guardar.</span></div>
        </div>
        <div class="module-patient-actions">
          <button class="btn-soft" onclick="showScreen('pacientes')"><i class="bi bi-search me-1"></i> Buscar paciente</button>
          <button class="btn-soft" onclick="showScreen('historia')"><i class="bi bi-file-medical me-1"></i> Historia clínica</button>
        </div>`;
      return;
    }
    card.classList.remove('empty');
    const edad = paciente.edad || calcularEdadDesdeFecha(paciente.fecha_nacimiento) || '—';
    card.innerHTML = `
      <div>
        <div class="module-patient-title"><i class="bi bi-person-check me-1"></i> ${modulo} de ${paciente.nombre || 'Paciente'}</div>
        <div class="module-patient-meta">
          <span>Cédula: ${paciente.cedula || '—'}</span>
          <span>Edad: ${edad}</span>
          <span>WhatsApp: ${paciente.telefono || '—'}</span>
          <span>ID: ${paciente.id_paciente || '—'}</span>
        </div>
      </div>
      <div class="module-patient-actions">
        <button class="btn-action primary" onclick="abrirHistoriaPaciente('${paciente.id_paciente || ''}')"><i class="bi bi-file-medical me-1"></i> Ver historia</button>
        <button class="btn-action success" onclick="abrirWhatsAppPaciente('${paciente.id_paciente || ''}')"><i class="bi bi-whatsapp me-1"></i> WhatsApp</button>
      </div>`;
  });
}

function validarPacienteModulo(){
  if(!getPacienteActivo()){
    alert('Seleccione primero un paciente para trabajar este módulo.');
    showScreen('pacientes');
    return false;
  }
  return true;
}

function badgeEstado(e){
  if(e==='Activa') return '<span class="badge-auro badge-ok">Activa</span>';
  if(e==='Control') return '<span class="badge-auro badge-warn">Control</span>';
  return '<span class="badge-auro badge-blue">Seguimiento</span>';
}


function auroInyectarEstiloAccionesPacientes(){
  if(document.getElementById('auro-pacientes-acciones-premium-style')) return;

  const style = document.createElement('style');
  style.id = 'auro-pacientes-acciones-premium-style';
  style.textContent = `
    .auro-patient-actions{
      position:relative;
      display:inline-block;
    }

    .auro-patient-actions-btn{
      min-width:112px;
      border:1px solid #fbcfe8;
      background:linear-gradient(135deg,#ffffff,#fff7fb);
      color:#8b1e5a;
      border-radius:13px;
      padding:7px 10px;
      font-weight:800;
      font-size:12px;
      box-shadow:0 6px 18px rgba(139,30,90,.08);
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:5px;
      cursor:pointer;
    }

    .auro-patient-actions-btn:hover{
      background:#fdf2f8;
      color:#7a174f;
    }

    .auro-patient-actions-menu{
      position:absolute;
      top:calc(100% + 6px);
      right:0;
      z-index:9999;
      min-width:210px;
      background:#fff;
      border:1px solid #fbcfe8;
      border-radius:16px;
      padding:8px;
      box-shadow:0 18px 45px rgba(15,23,42,.18);
      display:none;
    }

    .auro-patient-actions.open .auro-patient-actions-menu{
      display:block;
    }

    .auro-patient-actions-item{
      width:100%;
      border:0;
      background:transparent;
      color:#374151;
      padding:9px 10px;
      border-radius:12px;
      font-weight:750;
      font-size:13px;
      display:flex;
      align-items:center;
      gap:8px;
      text-align:left;
      cursor:pointer;
    }

    .auro-patient-actions-item:hover{
      background:#fdf2f8;
      color:#8b1e5a;
    }

    .auro-patient-actions-divider{
      height:1px;
      background:#f1f5f9;
      margin:6px 4px;
    }

    .table-modern td:last-child{
      white-space:nowrap;
      overflow:visible;
    }

    .table-responsive{
      overflow:visible;
    }

    .cardx{
      overflow:visible;
    }
  `;
  document.head.appendChild(style);
}

function toggleAccionesPaciente(event, idPaciente){
  event.stopPropagation();

  document.querySelectorAll('.auro-patient-actions.open').forEach(el => {
    if(el.id !== 'acciones-paciente-' + idPaciente){
      el.classList.remove('open');
    }
  });

  const menu = document.getElementById('acciones-paciente-' + idPaciente);
  if(menu){
    menu.classList.toggle('open');
  }
}

document.addEventListener('click', function(){
  document.querySelectorAll('.auro-patient-actions.open').forEach(el => el.classList.remove('open'));
});

function accionesPacientePremiumHTML(idPaciente){
  const id = String(idPaciente || '');
  return `
    <div class="auro-patient-actions" id="acciones-paciente-${id}">
      <button type="button" class="auro-patient-actions-btn" onclick="toggleAccionesPaciente(event,'${id}')">
        <i class="bi bi-three-dots-vertical"></i> Acciones
      </button>
      <div class="auro-patient-actions-menu">
        <button type="button" class="auro-patient-actions-item" onclick="abrirHistoriaPaciente('${id}')">
          <i class="bi bi-file-medical"></i> Historia clínica
        </button>
        <button type="button" class="auro-patient-actions-item" onclick="abrirWhatsAppPaciente('${id}')">
          <i class="bi bi-whatsapp"></i> WhatsApp
        </button>
        <div class="auro-patient-actions-divider"></div>
        <button type="button" class="auro-patient-actions-item" onclick="editarPacienteModal('${id}')">
          <i class="bi bi-pencil-square"></i> Editar paciente
        </button>
      </div>
    </div>
  `;
}

function normalizarEstadoAgenda(estado){
  const e = String(estado || '').trim().toLowerCase();
  if(!e) return 'sin estado';
  if(e === 'anulada' || e === 'anulado' || e === 'cancelada' || e === 'cancelado') return 'anulada';
  if(e === 'no asistio' || e === 'no asistió' || e === 'inasistencia' || e === 'no asistio a cita' || e === 'no asistió a cita') return 'no asistio';
  if(e === 'atendida' || e === 'atendidas') return 'atendida';
  if(e === 'confirmada' || e === 'confirmado') return 'confirmada';
  if(e === 'pendiente') return 'pendiente';
  if(e === 'sin estado') return 'sin estado';
  return e;
}

function formatearFechaVisual(fecha){
  if(!fecha) return '';
  const partes = String(fecha).slice(0,10).split('-');
  if(partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
  return fecha;
}

function auroTimestampFechaAgendaPaciente(c){
  const fecha = String(c?.fecha_deseada || c?.fecha_cita || c?.fecha || '').substring(0,10);
  if(!fecha) return 0;

  const horaTxt = String(c?.hora_deseada || c?.hora_inicio || c?.hora || '').trim();
  const horaMatch = horaTxt.match(/(\d{1,2}):(\d{2})/);
  const hora = horaMatch ? String(horaMatch[1]).padStart(2,'0') + ':' + horaMatch[2] : '00:00';
  const t = new Date(fecha + 'T' + hora + ':00').getTime();
  return Number.isFinite(t) ? t : 0;
}

function auroCitaPertenecePaciente(c, p){
  if(!c || !p) return false;

  const idCita = String(c.id_paciente || c.paciente_id || '').trim();
  const idPaciente = String(p.id_paciente || '').trim();
  if(idCita && idPaciente && idCita === idPaciente) return true;

  const cedulaCita = String(c.numero_documento || c.cedula || c.documento || '').replace(/\D/g,'');
  const cedulaPaciente = String(p.cedula || p.numero_documento || '').replace(/\D/g,'');
  if(cedulaCita && cedulaPaciente && cedulaCita === cedulaPaciente) return true;

  const telCita = String(c.whatsapp || c.telefono || c.celular || '').replace(/\D/g,'');
  const telPaciente = String(p.telefono || p.whatsapp || p.celular || '').replace(/\D/g,'');
  if(telCita && telPaciente && telCita.slice(-8) === telPaciente.slice(-8)) return true;

  const nombreCita = normalizarTextoComparacion(c.nombre || c.paciente || c.nombre_paciente || c.nombre_completo || '');
  const nombrePaciente = normalizarTextoComparacion(p.nombre || ((p.nombres || '') + ' ' + (p.apellidos || '')).trim() || '');
  return !!nombreCita && !!nombrePaciente && nombreCita === nombrePaciente;
}

/* ============================================================
   IASYN PACIENTES 07 - ÚLTIMA ATENCIÓN CLÍNICA ANTIRREGRESIVA
   Alcance EXCLUSIVO: cálculo de la columna "Última atención".

   Jerarquía permanente:
   1) Atención clínica real por id_paciente (atenciones.fecha_atencion).
   2) Si no existe atención real: última cita con estado Atendida.
   3) Si tampoco existe: fecha histórica/importada del paciente.
   4) Si no existe ninguna evidencia: sin atención.

   Protecciones:
   - actualizado_en NO se interpreta como atención clínica.
   - Las atenciones reales se vinculan SOLO por id_paciente.
   - No modifica Agenda, Historia Clínica, Atenciones, IDs ni Google Sheets.
============================================================ */
let auroAtencionesPacientesCache = [];
let auroAtencionesPacientesCargadas = false;
let auroAtencionesPacientesCargando = null;

function auroFechaISOClinicaPaciente(valor){
  if(!valor) return '';

  const s = String(valor).trim();
  if(!s) return '';

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  const lat = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(lat){
    return lat[3] + '-' + String(lat[2]).padStart(2,'0') + '-' + String(lat[1]).padStart(2,'0');
  }

  const d = new Date(s);
  if(isNaN(d.getTime())) return '';
  return d.toISOString().slice(0,10);
}

function auroTimestampAtencionPaciente(a){
  const fecha = auroFechaISOClinicaPaciente(a?.fecha_atencion || a?.fecha || '');
  if(!fecha) return 0;

  const horaTxt = String(a?.hora_atencion || a?.hora || '').trim();
  const horaMatch = horaTxt.match(/(\d{1,2}):(\d{2})/);
  const hora = horaMatch ? String(horaMatch[1]).padStart(2,'0') + ':' + horaMatch[2] : '00:00';
  const t = new Date(fecha + 'T' + hora + ':00').getTime();
  return Number.isFinite(t) ? t : 0;
}

function auroAtencionPertenecePaciente(a, p){
  if(!a || !p) return false;

  const idAtencionPaciente = String(a.id_paciente || a.paciente_id || '').trim();
  const idPaciente = String(p.id_paciente || p.id || '').trim();

  return !!idAtencionPaciente && !!idPaciente && idAtencionPaciente === idPaciente;
}

function auroLeerAtencionesLocalesPacientes(){
  try{
    const raw = localStorage.getItem('aurosanax_atenciones_local_v1') || '';
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  }catch(_e){
    return [];
  }
}

function auroAtencionesDisponiblesPacientes(){
  const mapa = new Map();

  auroLeerAtencionesLocalesPacientes().forEach(function(a, idx){
    const key = String(a?.id_atencion || ('LOCAL-' + idx)).trim();
    if(key) mapa.set(key, a);
  });

  (Array.isArray(auroAtencionesPacientesCache) ? auroAtencionesPacientesCache : []).forEach(function(a, idx){
    const key = String(a?.id_atencion || ('SHEETS-' + idx)).trim();
    if(key) mapa.set(key, a);
  });

  return Array.from(mapa.values());
}

async function auroCargarAtencionesParaUltimaAtencion(forzar){
  if(auroAtencionesPacientesCargando) return auroAtencionesPacientesCargando;
  if(auroAtencionesPacientesCargadas && !forzar) return auroAtencionesPacientesCache;

  auroAtencionesPacientesCargando = (async function(){
    try{
      if(typeof API_URL === 'undefined' || !API_URL) return auroAtencionesPacientesCache;

      const res = await fetch(API_URL + '?accion=listarAtenciones&_=' + Date.now());
      const data = await res.json();
      const lista = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

      auroAtencionesPacientesCache = lista;
      auroAtencionesPacientesCargadas = true;
      return auroAtencionesPacientesCache;
    }catch(error){
      console.warn('IASYN PACIENTES: no se pudo refrescar Última atención desde Atenciones.', error);
      return auroAtencionesPacientesCache;
    }finally{
      auroAtencionesPacientesCargando = null;
    }
  })();

  return auroAtencionesPacientesCargando;
}

function auroPacienteEsHistoricoImportado(p){
  const origen = normalizarTextoComparacion(p?.creado_por || p?.origen_registro || p?.origen || '');
  if(!origen) return false;

  return origen.includes('migracion') ||
         origen.includes('manual') ||
         origen.includes('import') ||
         origen.includes('extern');
}

function auroFechaHistoricaPaciente(p){
  if(!auroPacienteEsHistoricoImportado(p)) return '';

  return auroFechaISOClinicaPaciente(
    p?.fecha_historica ||
    p?.ultima_atencion_historica ||
    p?.fecha_ultima_atencion ||
    p?.fecha_registro ||
    p?.creado_en ||
    ''
  );
}

function auroUltimaAtencionPaciente(p){
  const atencionesReales = auroAtencionesDisponiblesPacientes()
    .filter(a => auroAtencionPertenecePaciente(a, p))
    .map(a => ({ atencion: a, ts: auroTimestampAtencionPaciente(a) }))
    .filter(x => x.ts > 0)
    .sort((a, b) => b.ts - a.ts);

  if(atencionesReales.length){
    return {
      fecha: auroFechaISOClinicaPaciente(atencionesReales[0].atencion.fecha_atencion || atencionesReales[0].atencion.fecha || ''),
      ts: atencionesReales[0].ts,
      fuente: 'atencion'
    };
  }

  const citasAtendidas = (Array.isArray(citasAgendaWeb) ? citasAgendaWeb : [])
    .filter(c => normalizarEstadoAgenda(c.estado) === 'atendida' && auroCitaPertenecePaciente(c, p))
    .map(c => ({ cita: c, ts: auroTimestampFechaAgendaPaciente(c) }))
    .filter(x => x.ts > 0)
    .sort((a, b) => b.ts - a.ts);

  if(citasAtendidas.length){
    return {
      fecha: auroFechaISOClinicaPaciente(
        citasAtendidas[0].cita.fecha_deseada ||
        citasAtendidas[0].cita.fecha_cita ||
        citasAtendidas[0].cita.fecha ||
        ''
      ),
      ts: citasAtendidas[0].ts,
      fuente: 'cita'
    };
  }

  const fechaHistorica = auroFechaHistoricaPaciente(p);
  if(fechaHistorica){
    const tsHistorico = new Date(fechaHistorica + 'T00:00:00').getTime();
    return {
      fecha: fechaHistorica,
      ts: Number.isFinite(tsHistorico) ? tsHistorico : 0,
      fuente: 'historica'
    };
  }

  return {fecha: '', ts: 0, fuente: 'sin_atencion'};
}

function renderPatients(){
  auroInyectarEstiloAccionesPacientes();
  const q=(document.getElementById('patientSearch')?.value||'').toLowerCase();
  const f=document.getElementById('patientFilter')?.value||'';
  const rows=patients.map(p => {
    const ultimaInfo = auroUltimaAtencionPaciente(p);
    return {
      ...p,
      ultima_atencion_real: ultimaInfo.fecha,
      ultima_atencion_ts: ultimaInfo.ts
    };
  }).filter(p=>{
    const txt=[p.nombre,p.cedula,p.telefono,p.email,p.servicio,p.ciudad].join(' ').toLowerCase();
    return (!q || txt.includes(q)) && (!f || p.servicio===f);
  }).sort((a,b)=>{
    const ta = Number(a.ultima_atencion_ts || 0);
    const tb = Number(b.ultima_atencion_ts || 0);
    if(ta && tb && ta !== tb) return tb - ta;
    if(ta && !tb) return -1;
    if(!ta && tb) return 1;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {sensitivity:'base'});
  });

  const sizeSelect = document.getElementById('patientPageSize');
  if(sizeSelect) patientPageSize = parseInt(sizeSelect.value,10) || 25;

  const totalPages = Math.max(1, Math.ceil(rows.length / patientPageSize));
  if(patientPage > totalPages) patientPage = totalPages;
  if(patientPage < 1) patientPage = 1;

  const startIndex = (patientPage - 1) * patientPageSize;
  const visibleRows = rows.slice(startIndex, startIndex + patientPageSize);

  const endIndex = Math.min(startIndex + visibleRows.length, rows.length);
  setTextIfExists('patientCountInfo', rows.length ? `Mostrando ${startIndex + 1}–${endIndex} de ${rows.length} pacientes` : 'No hay pacientes para mostrar');
  setTextIfExists('patientPageInfo', `Página ${patientPage} / ${totalPages}`);
  const prevBtn = document.getElementById('patientPrevBtn');
  const nextBtn = document.getElementById('patientNextBtn');
  if(prevBtn) prevBtn.disabled = patientPage <= 1;
  if(nextBtn) nextBtn.disabled = patientPage >= totalPages;

  document.getElementById('patientsBody').innerHTML = visibleRows.map((p,i)=>`
    <tr>
      <td><b>${p.nombre}</b><br><small class="text-muted">${p.email}</small></td>
      <td>${p.cedula}</td>
      <td>${p.telefono}</td>
      <td><span class="badge-auro">${p.servicio}</span></td>
      <td>${p.ultima_atencion_real ? formatearFechaVisual(p.ultima_atencion_real) : '—'}</td>
      <td>${badgeEstado(p.estado)}</td>
      <td>
        ${accionesPacientePremiumHTML(p.id_paciente || '')}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="text-center text-muted py-4">Sin pacientes</td></tr>';

  document.getElementById('patientsMobile').innerHTML = visibleRows.map(p=>`
    <div class="mobile-card">
      <div class="mobile-card-top"><b>${p.nombre}</b>${badgeEstado(p.estado)}</div>
      <div class="line"><span>Cédula</span><span>${p.cedula}</span></div>
      <div class="line"><span>Teléfono</span><span>${p.telefono}</span></div>
      <div class="line"><span>Servicio</span><span>${p.servicio}</span></div>
      <div class="line"><span>Última atención</span><span>${p.ultima_atencion_real ? formatearFechaVisual(p.ultima_atencion_real) : '—'}</span></div>
      <div class="d-grid gap-2 mt-2">
        <button class="btn-auro w-100" onclick="abrirHistoriaPaciente('${p.id_paciente || ''}')">Ver historia clínica</button>
        <button class="btn-soft w-100" onclick="abrirWhatsAppPaciente('${p.id_paciente || ''}')"><i class="bi bi-whatsapp me-1"></i> WhatsApp</button>
        <button class="btn-soft w-100" onclick="editarPacienteModal('${p.id_paciente || ''}')"><i class="bi bi-pencil-square me-1"></i> Editar paciente</button>
      </div>
    </div>
  `).join('') || '<div class="mobile-card text-muted">Sin pacientes</div>';
  document.getElementById('stPacientes').textContent=patients.length;
  actualizarDashboard();
}

function cambiarPaginaPacientes(delta){
  patientPage += delta;
  renderPatients();
}

function resetPatients(){
  document.getElementById('patientSearch').value='';
  document.getElementById('patientFilter').value='';
  patientPage = 1;
  renderPatients();
}

/* ============================================================
   IASYN PACIENTES 0.5 - CÉDULA ECUATORIANA SEGURA EN FORMULARIO
   Alcance exclusivo: input pCedula.
   - Se mantiene como TEXTO: conserva cero inicial.
   - Solo permite dígitos.
   - Máximo 10 dígitos mientras se escribe.
   - Si se informa una cédula, exige exactamente 10 dígitos al guardar.
   - NO altera backend, Google Sheets, nombres/apellidos, WhatsApp,
     Historia Clínica, Atenciones, Documentos ni otros campos.
============================================================ */
function auroCedulaPacienteSoloDigitos(valor){
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/\D/g, '');
}

function auroConfigurarCampoCedulaPaciente(){
  const input = document.getElementById('pCedula');
  if(!input) return;

  /*
   * type=text es deliberado:
   * evita conversiones numéricas que podrían eliminar un cero inicial.
   */
  input.type = 'text';
  input.inputMode = 'numeric';
  input.maxLength = 10;
  input.setAttribute('pattern', '[0-9]{10}');
  input.setAttribute('autocomplete', 'off');

  if(input.dataset.auroCedulaConfigurada === '1') return;
  input.dataset.auroCedulaConfigurada = '1';

  input.addEventListener('input', function(){
    const limpia = auroCedulaPacienteSoloDigitos(input.value).slice(0, 10);
    if(input.value !== limpia) input.value = limpia;
  });

  input.addEventListener('paste', function(){
    setTimeout(function(){
      const limpia = auroCedulaPacienteSoloDigitos(input.value).slice(0, 10);
      if(input.value !== limpia) input.value = limpia;
    }, 0);
  });
}

function auroValidarCedulaPacienteAntesDeGuardar(){
  const input = document.getElementById('pCedula');
  if(!input) return {ok:false, valor:''};

  const original = String(input.value || '');
  const soloDigitos = auroCedulaPacienteSoloDigitos(original);

  /*
   * IASYN · IDENTIDAD DEL PACIENTE
   * - En un ALTA NUEVA la cédula es obligatoria.
   * - Debe contener exactamente 10 dígitos.
   * - Se conserva como texto para no perder el cero inicial.
   * - Compatibilidad antirregresiva: un registro histórico que YA exista
   *   sin documento puede seguir abriéndose/editándose; esta validación
   *   no crea nuevos pacientes sin cédula ni borra datos históricos.
   */
  if(!soloDigitos){
    const idEdicion = String(
      (typeof editingPatientId !== 'undefined' && editingPatientId) || ''
    ).trim();

    if(idEdicion){
      const pacienteActual = Array.isArray(patients)
        ? patients.find(p => String(p?.id_paciente || p?.id || '').trim() === idEdicion)
        : null;

      const cedulaActual = auroCedulaPacienteSoloDigitos(
        pacienteActual?.cedula ||
        pacienteActual?.numero_documento ||
        pacienteActual?.documento ||
        ''
      );

      /* Solo preserva edición de un registro histórico que YA estaba sin documento. */
      if(!cedulaActual){
        input.value = '';
        return {ok:true, valor:''};
      }
    }

    input.value = '';
    alert('La cédula es obligatoria para registrar un paciente.');
    input.focus();
    return {ok:false, valor:''};
  }

  if(soloDigitos.length !== 10){
    alert('La cédula debe contener exactamente 10 dígitos.');
    input.focus();
    return {ok:false, valor:soloDigitos};
  }

  /*
   * Se asigna como string. Ej.: 0981128465 permanece 0981128465.
   */
  input.value = soloDigitos;
  return {ok:true, valor:soloDigitos};
}

function limpiarFormularioPaciente(){
  ['pNombres','pApellidos','pNombre','pCedula','pNacimiento','pSexo','pEstadoCivil','pOcupacion','pTelefono','pEmail','pDireccion','pSeguro','pContactoEmergencia','pTelefonoEmergencia','pTipoSangre','pAlergias','pNotas'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value='';
  });
  const ciudad=document.getElementById('pCiudad');
  if(ciudad) ciudad.value='Guayaquil';
  const servicio=document.getElementById('pServicio');
  if(servicio) servicio.value='Ginecología';
}

function openPatientModal(){
  editingPatientId = null;
  auroConfigurarCampoCedulaPaciente();
  limpiarFormularioPaciente();
  setTextIfExists('patientModalTitle','Nuevo paciente');
  setTextIfExists('patientSaveBtn','Guardar paciente');
  document.getElementById('patientModal').classList.add('show');
}

function closePatientModal(){
  document.getElementById('patientModal').classList.remove('show');
  editingPatientId = null;
}

/* ============================================================
   IASYN PACIENTES 0.4 - NOMBRE COMPATIBLE DE SOLO LECTURA
   Alcance:
   - Resuelve el nombre visible desde estructuras actuales o históricas.
   - No modifica Google Sheets.
   - No cambia guardado, separación de nombres/apellidos, cédula,
     WhatsApp, Historia Clínica, Atenciones ni Documentos.
============================================================ */
function auroNombrePacienteLecturaSegura(p){
  p = p || {};

  const nombreDirecto = String(
    p.nombre ||
    p.nombre_completo ||
    p.nombre_paciente ||
    p.paciente_nombre ||
    ''
  ).replace(/\s+/g,' ').trim();

  if(nombreDirecto) return nombreDirecto;

  const nombres = String(
    p.nombres ||
    p.primer_nombre ||
    ''
  ).replace(/\s+/g,' ').trim();

  const apellidos = String(
    p.apellidos ||
    p.apellido ||
    p.primer_apellido ||
    ''
  ).replace(/\s+/g,' ').trim();

  return [nombres, apellidos].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}

function auroPartesNombrePacienteLecturaSegura(p){
  p = p || {};

  const nombres = String(
    p.nombres ||
    p.primer_nombre ||
    ''
  ).replace(/\s+/g,' ').trim();

  const apellidos = String(
    p.apellidos ||
    p.apellido ||
    p.primer_apellido ||
    ''
  ).replace(/\s+/g,' ').trim();

  if(nombres || apellidos){
    return {nombres:nombres, apellidos:apellidos};
  }

  /*
   * Compatibilidad exclusivamente para registros históricos que solo
   * traigan un nombre completo. Los registros normales de AUROSANAX
   * conservan nombres y apellidos en columnas separadas.
   */
  const completo = auroNombrePacienteLecturaSegura(p);
  const partes = String(completo || '').split(/\s+/).filter(Boolean);

  if(partes.length <= 1){
    return {nombres:completo, apellidos:''};
  }

  return {
    nombres:partes.slice(0, -1).join(' '),
    apellidos:partes.slice(-1).join(' ')
  };
}

function editarPacienteModal(idPaciente){
  auroConfigurarCampoCedulaPaciente();

  if(!idPaciente){
    alert('Este paciente todavía no tiene ID. Actualice la página y vuelva a intentar.');
    return;
  }
  const p = patients.find(x => x.id_paciente === idPaciente);
  if(!p){
    alert('No se encontró el paciente en la lista cargada.');
    return;
  }
  editingPatientId = idPaciente;
  setTextIfExists('patientModalTitle','Editar paciente');
  setTextIfExists('patientSaveBtn','Actualizar paciente');
  const partesNombrePaciente = auroPartesNombrePacienteLecturaSegura(p);
  if(document.getElementById('pNombres') || document.getElementById('pApellidos')){
    setValueIfExists('pNombres', partesNombrePaciente.nombres || '');
    setValueIfExists('pApellidos', partesNombrePaciente.apellidos || '');
  }else{
    /* Compatibilidad con un Index anterior si todavía estuviera en caché. */
    setValueIfExists('pNombre', auroNombrePacienteLecturaSegura(p));
  }
  setValueIfExists('pCedula', p.cedula || '');
  setValueIfExists('pNacimiento', normalizarFechaInput(p.fecha_nacimiento || ''));
  setValueIfExists('pSexo', p.sexo || '');
  setValueIfExists('pEstadoCivil', normalizarEstadoCivilPaciente(p.estado_civil || ''));
  setValueIfExists('pOcupacion', p.ocupacion || '');
  setValueIfExists('pTelefono', p.telefono || '');
  setValueIfExists('pEmail', p.email || '');
  setValueIfExists('pDireccion', p.direccion || '');
  setValueIfExists('pCiudad', p.ciudad || 'Guayaquil');
  setValueIfExists('pSeguro', p.aseguradora || p.seguro_medico || '');
  setValueIfExists('pContactoEmergencia', p.contacto_emergencia || '');
  setValueIfExists('pTelefonoEmergencia', p.telefono_emergencia || '');
  setValueIfExists('pTipoSangre', p.tipo_sangre || '');
  setValueIfExists('pAlergias', p.alergias || '');
  setValueIfExists('pNotas', p.antecedentes_importantes || '');
  const serv=document.getElementById('pServicio');
  if(serv) serv.value = p.servicio || 'Ginecología';
  document.getElementById('patientModal').classList.add('show');
}

async function cargarPacientesDesdeSheets(){
  try{
    const res = await fetch(API_URL + '?accion=listarPacientes');
    const data = await res.json();

    patients = data.map(p => ({
      id_paciente: p.id_paciente || p.id || '',
      nombre: auroNombrePacienteLecturaSegura(p),
      nombres: p.nombres || p.primer_nombre || '',
      apellidos: p.apellidos || p.apellido || p.primer_apellido || '',
      cedula: p.numero_documento || p.cedula || p.documento || '',
      fecha_nacimiento: p.fecha_nacimiento || '',
      edad: p.edad || '',
      sexo: p.sexo || '',
      estado_civil: p.estado_civil || '',
      ocupacion: p.ocupacion || '',
      telefono: p.telefono || p.whatsapp || p.celular || '',
      email: p.email || '',
      direccion: p.direccion || '',
      ciudad: p.ciudad || '',
      provincia: p.provincia || '',
      contacto_emergencia: p.contacto_emergencia || '',
      telefono_emergencia: p.telefono_emergencia || '',
      aseguradora: p.aseguradora || '',
      alergias: p.alergias || '',
      tipo_sangre: p.tipo_sangre || p.grupo_sanguineo || '',
      antecedentes_importantes: p.antecedentes_importantes || '',
      servicio: p.servicio_principal || 'Ginecología',
      /* Metadatos conservados solo para el respaldo histórico de Última atención. */
      fecha_registro: p.fecha_registro || '',
      creado_en: p.creado_en || '',
      creado_por: p.creado_por || '',
      origen_registro: p.origen_registro || p.origen || '',
      fecha_historica: p.fecha_historica || p.ultima_atencion_historica || p.fecha_ultima_atencion || '',
      /* Compatibilidad: se conserva ultima, pero ya NO participa en Última atención. */
      ultima: p.actualizado_en ? new Date(p.actualizado_en).toLocaleDateString('es-EC') : '',
      estado: p.estado || 'Activa'
    }));

    /*
     * AUROSANAX FASE 1 VELOCIDAD:
     * Pacientes ya fue confirmado contra la fuente real.
     * La interfaz no espera la consulta secundaria de Atenciones.
     */
    renderPatients();
    actualizarSelectorPacientesHistoria();
    actualizarDashboard();

    /*
     * "Última atención" conserva exactamente la jerarquía actual.
     * Solo se completa después, sin bloquear el primer render de Pacientes.
     */
    auroCargarAtencionesParaUltimaAtencion(false)
      .then(function(){
        renderPatients();
      })
      .catch(function(error){
        console.warn(
          'IASYN PACIENTES: no se pudo completar Última atención en segundo plano.',
          error
        );
      });
  }catch(error){
    console.warn('No se pudo cargar desde Google Sheets. Se mantiene demo local.', error);
    renderPatients();
    actualizarSelectorPacientesHistoria();
    actualizarDashboard();
  }
}

/* ============================================================
   IASYN PACIENTES 05 - VÍNCULO SEGURO CON CITA DE AGENDA
   Alcance exclusivo:
   - Solo se activa cuando el modal fue abierto por Agenda médica.
   - El guardado normal de pacientes permanece intacto.
   - id_cita continúa siendo opcional: pacientes, historias y atenciones
     espontáneas siguen funcionando sin cita.
   - No crea historia ni atención automáticamente.
============================================================ */
function auroContextoPacienteDesdeAgenda(){
  if(window.auroPacienteDesdeAgendaContexto && window.auroPacienteDesdeAgendaContexto.id_cita){
    return {...window.auroPacienteDesdeAgendaContexto};
  }

  try{
    const raw = sessionStorage.getItem('auro_paciente_desde_agenda') || '';
    if(!raw) return null;
    const data = JSON.parse(raw);
    return data && data.id_cita ? data : null;
  }catch(_e){
    return null;
  }
}

function auroLimpiarContextoPacienteDesdeAgenda(){
  window.auroPacienteDesdeAgendaContexto = null;
  try{ sessionStorage.removeItem('auro_paciente_desde_agenda'); }catch(_e){}
}

function auroDigitosPacienteVinculo(valor){
  return String(valor || '').replace(/\D/g,'');
}

function auroBuscarPacienteCreadoParaCita(contexto, datosGuardados){
  const lista = Array.isArray(patients) ? patients : [];
  if(!lista.length) return null;

  const cedula = auroDigitosPacienteVinculo(datosGuardados?.numero_documento || contexto?.cedula || '');
  if(cedula){
    const porCedula = lista.filter(function(p){
      return auroDigitosPacienteVinculo(p.cedula || p.numero_documento || p.documento || '') === cedula;
    });
    if(porCedula.length === 1 && porCedula[0].id_paciente) return porCedula[0];
    if(porCedula.length > 1) return null;
  }

  const telefono = auroDigitosPacienteVinculo(datosGuardados?.telefono || contexto?.telefono || '');
  const nombre = typeof normalizarTextoComparacion === 'function'
    ? normalizarTextoComparacion(
        [datosGuardados?.nombres, datosGuardados?.apellidos].filter(Boolean).join(' ') || contexto?.nombre_completo || ''
      )
    : String(contexto?.nombre_completo || '').trim().toLowerCase();

  if(telefono && nombre){
    const porTelefonoNombre = lista.filter(function(p){
      const telP = auroDigitosPacienteVinculo(p.telefono || p.whatsapp || p.celular || '');
      const nomP = typeof normalizarTextoComparacion === 'function'
        ? normalizarTextoComparacion(p.nombre || [p.nombres,p.apellidos].filter(Boolean).join(' '))
        : String(p.nombre || '').trim().toLowerCase();
      return telP && telP.slice(-8) === telefono.slice(-8) && nomP === nombre;
    });
    if(porTelefonoNombre.length === 1 && porTelefonoNombre[0].id_paciente) return porTelefonoNombre[0];
  }

  return null;
}

async function auroVincularPacienteGuardadoConCita(contexto, datosGuardados, opciones){
  if(!contexto || !contexto.id_cita) return {ok:false, motivo:'sin_contexto'};

  const opts = opciones || {};

  /*
   * Si el llamador ya confirmó Pacientes contra la fuente real, reutiliza
   * esa lectura. Las llamadas antiguas conservan la relectura defensiva.
   */
  if(!opts.pacientesYaConfirmados){
    await cargarPacientesDesdeSheets();
  }

  const paciente = auroBuscarPacienteCreadoParaCita(contexto, datosGuardados);
  if(!paciente || !paciente.id_paciente){
    return {ok:false, motivo:'paciente_no_identificado'};
  }

  await fetch(API_URL, {
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({
      accion:'editarCita',
      data:{
        id_cita:String(contexto.id_cita || '').trim(),
        id_paciente:String(paciente.id_paciente || '').trim()
      }
    })
  });

  /* La escritura es no-cors; se confirma visualmente releyendo Agenda. */
  if(typeof window.cargarCitasAgendaWeb === 'function'){
    await new Promise(resolve => setTimeout(resolve, 700));
    await window.cargarCitasAgendaWeb();
  }

  return {ok:true, paciente:paciente};
}


/* ============================================================
   IASYN PACIENTES - BARRERA LOCAL ANTIDUPLICIDAD DE CÉDULA
   Alcance EXCLUSIVO:
   - Evita crear visualmente un paciente que el backend rechazará por
     documento duplicado.
   - No sustituye la protección del backend; la complementa.
   - En edición excluye al propio id_paciente.
   - Reconoce compatibilidad histórica cuando Sheets perdió un cero inicial.
   - NO modifica Historia Clínica, Atenciones, Agenda, Preatención,
     Seguridad, última atención ni persistencia.
============================================================ */
function auroBuscarPacienteDuplicadoPorCedulaLocal(cedula, idPacienteExcluir){
  const doc = auroCedulaPacienteSoloDigitos(cedula);
  const excluir = String(idPacienteExcluir || '').trim();
  if(!doc) return null;

  const lista = Array.isArray(patients) ? patients : [];

  return lista.find(function(p){
    const id = String(p?.id_paciente || p?.id || '').trim();
    if(excluir && id && id === excluir) return false;

    const docPaciente = auroCedulaPacienteSoloDigitos(
      p?.cedula || p?.numero_documento || p?.documento || ''
    );

    if(!docPaciente) return false;
    if(docPaciente === doc) return true;

    /* Compatibilidad histórica: 0987654321 pudo quedar 987654321. */
    if(doc.length === 10 && doc.startsWith('0') && docPaciente === doc.slice(1)){
      return true;
    }

    return false;
  }) || null;
}

let iasynGuardandoPaciente = false;

async function savePatient(){
  if(iasynGuardandoPaciente) return;

  iasynGuardandoPaciente = true;
  const btnGuardarPaciente = document.getElementById('patientSaveBtn');
  if(btnGuardarPaciente){
    btnGuardarPaciente.disabled = true;
    btnGuardarPaciente.dataset.iasynTextoOriginal = btnGuardarPaciente.innerHTML || btnGuardarPaciente.textContent || '';
    btnGuardarPaciente.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Guardando...';
  }

  try{
  const campoNombres = document.getElementById('pNombres');
  const campoApellidos = document.getElementById('pApellidos');
  const campoNombreLegacy = document.getElementById('pNombre');

  let nombres = '';
  let apellidos = '';

  if(campoNombres || campoApellidos){
    nombres = String(campoNombres?.value || '').replace(/\s+/g,' ').trim();
    apellidos = String(campoApellidos?.value || '').replace(/\s+/g,' ').trim();

    if(!nombres){
      alert('Ingrese los nombres del paciente');
      campoNombres?.focus();
      return;
    }
    if(!apellidos){
      alert('Ingrese los apellidos del paciente');
      campoApellidos?.focus();
      return;
    }
  }else{
    /*
     * Compatibilidad temporal con un Index antiguo en caché.
     * El Index 57E utiliza siempre pNombres + pApellidos.
     */
    const nombreCompletoLegacy = String(campoNombreLegacy?.value || '').replace(/\s+/g,' ').trim();
    if(!nombreCompletoLegacy){
      alert('Ingrese nombres y apellidos del paciente');
      return;
    }
    const partesLegacy = nombreCompletoLegacy.split(/\s+/).filter(Boolean);
    nombres = partesLegacy.slice(0, Math.max(1, partesLegacy.length - 1)).join(' ');
    apellidos = partesLegacy.length > 1 ? partesLegacy.slice(-1).join(' ') : '';
  }

  const nombreCompleto = [nombres, apellidos].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();

  const validacionCedula = auroValidarCedulaPacienteAntesDeGuardar();
  if(!validacionCedula.ok) return;
  const cedulaPaciente = validacionCedula.valor;

  /*
   * BARRERA LOCAL ANTIDUPLICIDAD:
   * el backend ya rechaza el documento duplicado, pero este frontend usa
   * mode:'no-cors' y no puede leer esa respuesta. Sin esta barrera podía
   * mostrar temporalmente un paciente que nunca fue guardado en Sheets.
   */
  const pacienteDuplicadoCedula = auroBuscarPacienteDuplicadoPorCedulaLocal(
    cedulaPaciente,
    editingPatientId
  );

  if(pacienteDuplicadoCedula){
    const nombreExistente = String(
      pacienteDuplicadoCedula.nombre ||
      [pacienteDuplicadoCedula.nombres, pacienteDuplicadoCedula.apellidos].filter(Boolean).join(' ') ||
      'otro paciente'
    ).trim();

    alert(
      'La cédula ' + cedulaPaciente +
      ' ya pertenece al paciente ' + nombreExistente +
      '. No se creó un paciente duplicado.'
    );

    document.getElementById('pCedula')?.focus();
    return;
  }

  const pacienteSheet = {
    tipo_documento: 'Cédula',
    numero_documento: cedulaPaciente,
    nombres: nombres,
    apellidos: apellidos,
    fecha_nacimiento: document.getElementById('pNacimiento').value,
    sexo: document.getElementById('pSexo')?.value || '',
    estado_civil: document.getElementById('pEstadoCivil')?.value || '',
    ocupacion: document.getElementById('pOcupacion')?.value.trim() || '',
    telefono: document.getElementById('pTelefono').value.trim(),
    whatsapp: document.getElementById('pTelefono').value.trim(),
    email: document.getElementById('pEmail').value.trim(),
    direccion: document.getElementById('pDireccion').value.trim(),
    ciudad: document.getElementById('pCiudad').value.trim(),
    provincia: 'Guayas',
    aseguradora: document.getElementById('pSeguro')?.value.trim() || '',
    contacto_emergencia: document.getElementById('pContactoEmergencia')?.value.trim() || '',
    telefono_emergencia: document.getElementById('pTelefonoEmergencia')?.value.trim() || '',
    tipo_sangre: document.getElementById('pTipoSangre')?.value.trim() || '',
    alergias: document.getElementById('pAlergias')?.value.trim() || '',
    servicio_principal: document.getElementById('pServicio')?.value || 'Ginecología',
    antecedentes_importantes: document.getElementById('pNotas').value.trim(),
    estado: 'Activo',
    creado_por: 'IASYN ERP'
  };

  const pacienteLocal = {
    nombre: nombreCompleto,
    nombres: pacienteSheet.nombres,
    apellidos: pacienteSheet.apellidos,
    cedula: pacienteSheet.numero_documento,
    fecha_nacimiento: pacienteSheet.fecha_nacimiento,
    sexo: pacienteSheet.sexo,
    estado_civil: pacienteSheet.estado_civil,
    ocupacion: pacienteSheet.ocupacion,
    telefono: pacienteSheet.telefono,
    email: pacienteSheet.email,
    direccion: pacienteSheet.direccion,
    ciudad: pacienteSheet.ciudad,
    provincia: pacienteSheet.provincia,
    aseguradora: pacienteSheet.aseguradora,
    contacto_emergencia: pacienteSheet.contacto_emergencia,
    telefono_emergencia: pacienteSheet.telefono_emergencia,
    tipo_sangre: pacienteSheet.tipo_sangre,
    alergias: pacienteSheet.alergias,
    antecedentes_importantes: pacienteSheet.antecedentes_importantes,
    servicio: document.getElementById('pServicio').value,
    ultima: new Date().toLocaleDateString('es-EC'),
    estado: 'Activa'
  };

  try{
    const esEdicion = !!editingPatientId;
    const contextoAgenda = !esEdicion ? auroContextoPacienteDesdeAgenda() : null;
    const payloadData = esEdicion ? {...pacienteSheet, id_paciente: editingPatientId} : pacienteSheet;

    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({
        accion: esEdicion ? 'editarPaciente' : 'guardarPaciente',
        data: limpiarObjetoParaSheets(payloadData)
      })
    });

    if(esEdicion){
      const idx = patients.findIndex(p => p.id_paciente === editingPatientId);
      if(idx >= 0){
        patients[idx] = {...patients[idx], ...pacienteLocal, id_paciente: editingPatientId};
      }
    }else{
      patients.unshift(pacienteLocal);
    }

    limpiarFormularioPaciente();
    closePatientModal();
    renderPatients();
    actualizarSelectorPacientesHistoria();
    actualizarDashboard();
    setTimeout(async () => {
      /*
       * Esta relectura ya actualiza patients, Última atención, tabla,
       * selector de Historia y Dashboard. No se repiten esos renderizados.
       */
      await cargarPacientesDesdeSheets();

      /* Solo Agenda: intenta vincular ESTA cita después de confirmar el
         paciente en la fuente real. El resto de guardados no entra aquí. */
      if(contextoAgenda && contextoAgenda.id_cita){
        try{
          const vinculo = await auroVincularPacienteGuardadoConCita(
            contextoAgenda,
            pacienteSheet,
            {pacientesYaConfirmados:true}
          );
          if(vinculo.ok){
            auroLimpiarContextoPacienteDesdeAgenda();
            alert('Paciente registrado y vinculado correctamente a la cita.');
          }else{
            console.warn('IASYN PACIENTES: paciente guardado, vínculo de cita pendiente.', vinculo);
            alert('El paciente fue guardado, pero no se pudo confirmar automáticamente el vínculo con la cita. Actualice Agenda antes de continuar.');
          }
        }catch(errorVinculo){
          console.error('IASYN PACIENTES: error al vincular cita.', errorVinculo);
          alert('El paciente fue guardado, pero no se pudo confirmar el vínculo con la cita. Actualice Agenda antes de continuar.');
        }
      }
    }, 1200);

    if(!contextoAgenda){
      alert(esEdicion ? 'Paciente actualizado correctamente.' : 'Paciente enviado a Google Sheets correctamente.');
    }
  }catch(error){
    console.error(error);
    alert('No se pudo guardar en Google Sheets. Revise la conexión o la implementación del Apps Script.');
  }
  }finally{
    iasynGuardandoPaciente = false;
    if(btnGuardarPaciente){
      btnGuardarPaciente.disabled = false;
      const original = btnGuardarPaciente.dataset.iasynTextoOriginal || '';
      if(original) btnGuardarPaciente.innerHTML = original;
      delete btnGuardarPaciente.dataset.iasynTextoOriginal;
    }
  }
}

/* ============================================================
   IASYN - CONTROL SEGURO DE APERTURA DE HISTORIA CLÍNICA
   - Compatible con llamadas antiguas: abrirHistoriaPaciente(idPaciente)
   - Admite modo opcional: 'nueva', 'existente' o 'auto'
   - No crea ni modifica IDs de historia.
   - El ID HCL continúa generándose únicamente al guardar.
============================================================ */

function auroHistoriaPacientePorId(idPaciente){
  const id = String(idPaciente || '').trim();
  if(!id || typeof historiasClinicas === 'undefined' || !Array.isArray(historiasClinicas)){
    return null;
  }

  const historias = historiasClinicas
    .filter(function(h){
      return String(h?.id_paciente || h?.paciente_id || '').trim() === id;
    })
    .sort(function(a,b){
      return String(b?.actualizado_en || b?.fecha_apertura || b?.creado_en || '')
        .localeCompare(String(a?.actualizado_en || a?.fecha_apertura || a?.creado_en || ''));
    });

  return historias[0] || null;
}

function auroActualizarBotonHistoriaNueva(){
  document.querySelectorAll('button[onclick*="guardarHistoriaClinicaERP"]').forEach(function(btn){
    btn.innerHTML = '<i class="bi bi-save me-1"></i> Guardar historia';
  });

  const estado = document.getElementById('auroEstadoGuardadoHistoria') ||
                 document.getElementById('hcEstadoHistoria') ||
                 document.getElementById('historiaSaveStatus');

  if(estado){
    estado.textContent = 'Historia nueva · pendiente de guardar';
  }
}

function auroLimpiarFormularioClinicoParaHistoriaNueva(){
  const historia = document.getElementById('historia');
  if(!historia) return;

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

    el.value = '';
  });

  historia.querySelectorAll('.clinical-panel [contenteditable="true"]').forEach(function(el){
    el.innerHTML = '';
  });
}

function auroPrepararHistoriaNuevaPaciente(idPaciente){
  const id = String(idPaciente || '').trim();

  /*
    Limpia exclusivamente el contexto de edición de la historia anterior.
    No genera ID, no guarda y no modifica Google Sheets.
  */
  try{
    if(typeof editingHistoryId !== 'undefined') editingHistoryId = null;
  }catch(_e){}

  window.editingHistoryId = null;
  window.auroHistoriaSeleccionadaId = '';
  window.historiaActual = null;
  window.currentHistoria = null;
  window.auroModoAperturaHistoria = 'nueva';
  window.auroPacienteHistoriaNuevaId = id;

  auroLimpiarFormularioClinicoParaHistoriaNueva();

  /*
    Estados internos conocidos. Solo se reinicia la atención seleccionada;
    no se eliminan registros ni cachés históricos de otros pacientes.
  */
  if(window.planState){
    window.planState.atencionActual = '';
  }

  if(window.examenFisicoState){
    window.examenFisicoState.atencionActual = '';
    window.examenFisicoState.idExamenActual = '';
  }

  if(window.diagnosticosSeleccionados && Array.isArray(window.diagnosticosSeleccionados)){
    window.diagnosticosSeleccionados.length = 0;
  }

  /*
    Funciones públicas opcionales de los módulos.
    Se llaman únicamente si existen, preservando compatibilidad.
  */
  [
    'auroLimpiarPlanVisualAntesDeCambiarAtencion',
    'auroLimpiarDiagnosticos',
    'auroExamenFisicoLimpiarFormulario',
    'limpiarFormularioGinecologia',
    'limpiarFormularioObstetricia',
    'limpiarFormularioEstetica',
    'limpiarFormularioDocumentos'
  ].forEach(function(nombre){
    try{
      if(typeof window[nombre] === 'function'){
        window[nombre]();
      }
    }catch(error){
      console.warn('IASYN PACIENTES: limpieza opcional no completada en ' + nombre, error);
    }
  });

  auroActualizarBotonHistoriaNueva();

  window.dispatchEvent(new CustomEvent('aurosanax:historia-nueva', {
    detail: {
      id_paciente: id,
      origen: 'pacientes'
    }
  }));
}

function auroPrepararHistoriaExistentePaciente(idPaciente, historia){
  window.auroModoAperturaHistoria = 'existente';
  window.auroPacienteHistoriaNuevaId = '';

  /*
    No se fuerza aquí el modo edición ni se reemplaza el ID.
    La carga normal de la historia existente conserva la lógica actual.
  */
  if(historia){
    window.auroHistoriaObjetivoPaciente = {
      id_paciente: String(idPaciente || '').trim(),
      id_historia: String(historia.id_historia || historia.id || '').trim()
    };
  }else{
    window.auroHistoriaObjetivoPaciente = null;
  }
}

function auroLimpiarHistoriaDeOtroPaciente(idPacienteNuevo){
  const nuevoId = String(idPacienteNuevo || '').trim();
  if(!nuevoId) return;

  const idHistoriaActiva = String(
    (typeof editingHistoryId !== 'undefined' && editingHistoryId) ||
    window.editingHistoryId ||
    window.auroHistoriaSeleccionadaId ||
    window.historiaActual?.id_historia ||
    window.currentHistoria?.id_historia ||
    ''
  ).trim();

  let historiaActiva = null;

  if(window.historiaActual && String(window.historiaActual.id_paciente || '').trim()){
    historiaActiva = window.historiaActual;
  }else if(window.currentHistoria && String(window.currentHistoria.id_paciente || '').trim()){
    historiaActiva = window.currentHistoria;
  }else if(idHistoriaActiva && typeof historiasClinicas !== 'undefined' && Array.isArray(historiasClinicas)){
    historiaActiva = historiasClinicas.find((h, idx) =>
      String(h?.id_historia || h?.id || idx).trim() === idHistoriaActiva
    ) || null;
  }

  const pacienteHistoria = String(historiaActiva?.id_paciente || '').trim();

  if(pacienteHistoria && pacienteHistoria !== nuevoId){
    try{
      if(typeof editingHistoryId !== 'undefined') editingHistoryId = null;
    }catch(_e){}
    window.editingHistoryId = null;
    window.auroHistoriaSeleccionadaId = '';
    window.historiaActual = null;
    window.currentHistoria = null;
  }
}

function abrirHistoriaPaciente(idPaciente, modoApertura){
  if(!idPaciente){
    alert('Este paciente todavía no tiene ID. Actualice la página y vuelva a intentar.');
    return;
  }

  const id = String(idPaciente || '').trim();
  const historiaExistente = auroHistoriaPacientePorId(id);
  const modoSolicitado = String(modoApertura || 'auto').trim().toLowerCase();

  /*
    Resolución compatible:
    - 'nueva': limpieza integral.
    - 'existente': conserva carga actual.
    - 'auto' o llamada antigua: nueva solo cuando el paciente no tiene historia.
  */
  const esHistoriaNueva = modoSolicitado === 'nueva' ||
    (modoSolicitado !== 'existente' && !historiaExistente);

  auroLimpiarHistoriaDeOtroPaciente(id);

  if(esHistoriaNueva){
    auroPrepararHistoriaNuevaPaciente(id);
  }else{
    auroPrepararHistoriaExistentePaciente(id, historiaExistente);
  }

  activePatientId = id;
  window.activePatientId = id;

  showScreen('historia');
  actualizarSelectorPacientesHistoria();

  const select = document.getElementById('hcPacienteSelect');
  if(select){
    select.value = id;
    seleccionarPacienteHistoria();
  }

  window.scrollTo({top:0, behavior:'smooth'});
}

function actualizarSelectorPacientesHistoria(){
  const select = document.getElementById('hcPacienteSelect');
  if(!select) return;

  const valorActual = select.value;
  select.innerHTML = '<option value="">Seleccione un paciente registrado</option>' + patients.map(p => {
    const nombre = p.nombre || 'Paciente sin nombre';
    return `<option value="${p.id_paciente || ''}">${nombre}</option>`;
  }).join('');

  if(valorActual) select.value = valorActual;
}

function normalizarFechaInput(valor){
  if(!valor) return '';
  const d = new Date(valor);
  if(isNaN(d.getTime())) return String(valor).slice(0,10);
  return d.toISOString().slice(0,10);
}

function calcularEdadDesdeFecha(valor){
  if(!valor) return '';
  const n = new Date(normalizarFechaInput(valor) + 'T00:00:00');
  if(isNaN(n.getTime())) return '';
  const h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if(m < 0 || (m === 0 && h.getDate() < n.getDate())) e--;
  return e >= 0 ? e : '';
}

function normalizarEstadoCivilPaciente(valor){
  const v = normalizarTextoComparacion(valor);
  if(!v) return '';
  if(v === 'soltera' || v === 'soltero' || v === 'soltero/a') return 'Soltero/a';
  if(v === 'casada' || v === 'casado' || v === 'casado/a') return 'Casado/a';
  if(v === 'union libre' || v === 'unión libre') return 'Unión libre';
  if(v === 'divorciada' || v === 'divorciado' || v === 'divorciado/a') return 'Divorciado/a';
  if(v === 'viuda' || v === 'viudo' || v === 'viudo/a') return 'Viudo/a';
  if(v === 'separada' || v === 'separado' || v === 'separado/a') return 'Separado/a';
  if(v === 'no especifica' || v === 'no especificado' || v === 'no especificado/a') return 'No especifica';
  return valor || '';
}

function normalizarTextoComparacion(valor){
  return String(valor || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase();
}

function setValueIfExists(id, value){
  const el = document.getElementById(id);
  if(!el) return;

  if(el.tagName === 'SELECT'){
    const buscado = normalizarTextoComparacion(value);
    let encontrado = false;
    [...el.options].forEach(opt => {
      if(normalizarTextoComparacion(opt.value) === buscado || normalizarTextoComparacion(opt.textContent) === buscado){
        el.value = opt.value;
        encontrado = true;
      }
    });
    if(!encontrado) el.value = '';
    return;
  }

  el.value = value || '';
}

function getValueIfExists(id){
  return document.getElementById(id)?.value || '';
}

function limpiarTextoParaSheets(valor){
  if(valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function limpiarObjetoParaSheets(obj){
  const limpio = {};
  Object.keys(obj || {}).forEach(k => {
    const v = obj[k];
    limpio[k] = typeof v === 'string' ? limpiarTextoParaSheets(v) : v;
  });
  return limpio;
}




/* IASYN: módulo Antecedentes movido a antecedentes.js para evitar duplicados. */

/* ============================================================
   IASYN PACIENTES 06 - TELÉFONO / WHATSAPP INTERNACIONAL
   Alcance EXCLUSIVO:
   - Conversión del número SOLO al abrir WhatsApp.
   - Conserva el valor real guardado en la ficha del paciente.
   - Ecuador local 09XXXXXXXX -> 5939XXXXXXXX.
   - Compatibilidad histórica 9XXXXXXXX -> 5939XXXXXXXX.
   - +593, +1, +34, +57, etc. se respetan.
   - NO modifica guardado, Agenda, Secretaría, Preatención,
     Historia Clínica, Atenciones, estados, IDs ni vínculos.
============================================================ */
function normalizarTelefonoWhatsAppInternacional(numero){
  let raw = String(numero === null || numero === undefined ? '' : numero).trim();
  if(!raw) return '';

  /*
   * wa.me requiere únicamente dígitos.
   * Se toleran +, espacios, guiones y paréntesis en la ficha.
   */
  let n = raw.replace(/[^\d+]/g, '');

  if(n.startsWith('+')) n = n.slice(1);
  if(n.startsWith('00')) n = n.slice(2);

  if(!n) return '';

  /*
   * Ecuador local:
   * 0986535080 -> 593986535080
   */
  if(/^0\d{9}$/.test(n)){
    return '593' + n.slice(1);
  }

  /*
   * Compatibilidad con registros históricos donde Sheets
   * pudo haber perdido el cero inicial:
   * 986535080 -> 593986535080
   */
  if(/^9\d{8}$/.test(n)){
    return '593' + n;
  }

  /*
   * Si ya tiene código internacional (593, 1, 34, 57, etc.)
   * se conserva tal cual.
   */
  return n;
}

/*
 * Alias de compatibilidad:
 * cualquier llamada existente a normalizarTelefonoEcuador()
 * sigue funcionando sin romper otros módulos.
 */
function normalizarTelefonoEcuador(numero){
  return normalizarTelefonoWhatsAppInternacional(numero);
}

function abrirWhatsApp(numero, mensaje){
  const tel = normalizarTelefonoWhatsAppInternacional(numero);
  if(!tel){
    alert('No hay número de WhatsApp registrado.');
    return;
  }
  const url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje || '');
  window.open(url, '_blank');
}

function abrirWhatsAppPaciente(idPaciente){
  const paciente = patients.find(p => p.id_paciente === idPaciente);
  if(!paciente){
    alert('No se encontró el paciente seleccionado.');
    return;
  }
  const mensaje = `Hola ${paciente.nombre || ''},\n\nLe saluda IASYN.\nQueremos realizar seguimiento a su atención médica.\n\nSi presenta alguna novedad o requiere agendar un control, estamos atentos para ayudarle.`;
  abrirWhatsApp(paciente.telefono, mensaje);
}

/*****************************************************************************************
 * IASYN ERP - pacientes.js
 * FASE 2 MODULARIZACIÓN PACIENTES
 * Funciones de selección, resumen y tarjeta de paciente en Historia Clínica.
 * Movidas desde index.html para alivianar el archivo principal.
 *****************************************************************************************/

function updateClinicalSummary(){
  const sel=document.getElementById('hcPacienteSelect');
  const paciente=patients.find(p=>p.id_paciente===(sel?.value||''));
  const n=paciente?.nombre||'Sin seleccionar';
  const a=document.getElementById('hcAlergias')?.value?.trim()||paciente?.alergias||'No registradas';
  const c=document.getElementById('hcControl')?.value||'Pendiente';
  if(document.getElementById('hcPacienteResumen'))document.getElementById('hcPacienteResumen').textContent=n;
  if(document.getElementById('hcAlergiasResumen'))document.getElementById('hcAlergiasResumen').textContent=a.length>18?a.slice(0,18)+'...':a;
  if(document.getElementById('hcControlResumen'))document.getElementById('hcControlResumen').textContent=c;
  actualizarTarjetaPacienteHistoria(paciente);
}

function actualizarTarjetaPacienteHistoria(paciente){
  const nombre = paciente?.nombre || 'Seleccione un paciente';
  const iniciales = nombre !== 'Seleccione un paciente' ? nombre.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() : 'A';
  const fechaNacimiento = paciente?.fecha_nacimiento ? normalizarFechaInput(paciente.fecha_nacimiento) : '';
  const edad = paciente?.edad || calcularEdadDesdeFecha(fechaNacimiento) || '—';
  const imc = document.getElementById('hcIMC')?.value || '—';

  setTextIfExists('hcAvatar', iniciales || 'A');
  setTextIfExists('hcCardNombre', nombre);
  setTextIfExists('hcCardEstado', paciente ? (paciente.estado || 'Paciente activo') : 'Historia activa');
  setTextIfExists('hcCardServicio', paciente ? (paciente.servicio || 'Ginecología') : 'IASYN');
  setTextIfExists('hcCardCedula', paciente?.cedula || '—');
  setTextIfExists('hcCardNacimiento', fechaNacimiento ? formatearFechaVisual(fechaNacimiento) : '—');
  setTextIfExists('hcCardEdad', edad === '—' ? '—' : edad + ' años');
  setTextIfExists('hcCardTelefono', paciente?.telefono || '—');
  setTextIfExists('hcCardIMC', imc);
  setTextIfExists('hcCardDetalle', paciente ? 
    ['Sexo: ' + (paciente.sexo || 'No registrado'), 'Ciudad: ' + (paciente.ciudad || 'No registrada'), 'Correo: ' + (paciente.email || 'No registrado')].join('  ·  ')
    : 'Los datos clínicos aparecerán aquí al elegir un paciente registrado.'
  );
}

function seleccionarPacienteHistoria(){
  const idPaciente = document.getElementById('hcPacienteSelect')?.value || activePatientId || '';
  const p = patients.find(x => String(x.id_paciente || x.id || '') === String(idPaciente));

  if(!p){
    activePatientId = '';
    window.activePatientId = '';
    ['hcCedula','hcNacimiento','hcEdad','hcOcupacion','hcTelefono','hcCorreo','hcDireccion','hcSeguro','hcContactoEmergencia','hcTelefonoEmergencia','hcTipoSangre','hcAlergiasPaciente'].forEach(id => setValueIfExists(id, ''));
    setValueIfExists('hcSexo', '');
    setValueIfExists('hcEstadoCivil', '');
    updateClinicalSummary();
    renderModulePatientCards();
    return;
  }

  activePatientId = p.id_paciente || idPaciente;
  window.activePatientId = activePatientId;
  const fechaNacimiento = normalizarFechaInput(p.fecha_nacimiento || '');
  const edad = p.edad || calcularEdadDesdeFecha(fechaNacimiento) || '';

  setValueIfExists('hcCedula', p.cedula || '');
  setValueIfExists('hcNacimiento', fechaNacimiento);
  setValueIfExists('hcEdad', edad);
  setValueIfExists('hcSexo', p.sexo || '');
  setValueIfExists('hcEstadoCivil', normalizarEstadoCivilPaciente(p.estado_civil || ''));
  setValueIfExists('hcOcupacion', p.ocupacion || '');
  setValueIfExists('hcTelefono', p.telefono || '');
  setValueIfExists('hcCorreo', p.email || '');
  setValueIfExists('hcDireccion', p.direccion || '');
  setValueIfExists('hcSeguro', p.aseguradora || p.seguro_medico || '');
  setValueIfExists('hcContactoEmergencia', p.contacto_emergencia || '');
  setValueIfExists('hcTelefonoEmergencia', p.telefono_emergencia || '');
  setValueIfExists('hcTipoSangre', p.tipo_sangre || '');
  setValueIfExists('hcAlergiasPaciente', p.alergias || '');

  const alergiasHidden = document.getElementById('hcAlergias');
  if(alergiasHidden && !String(alergiasHidden.value || '').trim()) alergiasHidden.value = p.alergias || '';

  updateClinicalSummary();
  actualizarTarjetaPacienteHistoria(p);
  renderModulePatientCards();

  if(typeof window.renderAtencionesPaciente === 'function'){
    setTimeout(window.renderAtencionesPaciente,300);
    setTimeout(window.renderAtencionesPaciente,800);
  }
}

/* ============================================================
   IASYN PACIENTES 08 - BARRERA ANTIRREGRESIVA HISTORIA NUEVA
   Alcance EXCLUSIVO:
   - Evita que un id_historia residual de otro paciente convierta una
     historia realmente nueva en una actualización incorrecta.
   - Solo actúa si el paciente seleccionado NO tiene historia registrada.
   - Conserva intactas las historias existentes, su edición, Atenciones,
     Diagnóstico, Plan, Recetas, Seguridad, Agenda y backend.
============================================================ */
(function auroInstalarBarreraHistoriaNuevaPaciente(){
  const guardarOriginal = window.guardarHistoriaClinicaERP;

  if(typeof guardarOriginal !== 'function') return;
  if(guardarOriginal.__auroBarreraHistoriaNuevaPaciente === true) return;

  const guardarProtegido = async function(){
    const idPaciente = String(
      document.getElementById('hcPacienteSelect')?.value ||
      window.activePatientId ||
      (typeof activePatientId !== 'undefined' ? activePatientId : '') ||
      ''
    ).trim();

    if(idPaciente){
      const historiaRealPaciente = Array.isArray(window.historiasClinicas)
        ? window.historiasClinicas.find(function(h){
            return String(h?.id_paciente || h?.paciente_id || '').trim() === idPaciente;
          })
        : (typeof historiasClinicas !== 'undefined' && Array.isArray(historiasClinicas)
            ? historiasClinicas.find(function(h){
                return String(h?.id_paciente || h?.paciente_id || '').trim() === idPaciente;
              })
            : null);

      const esHistoriaNuevaDeclarada =
        window.auroModoAperturaHistoria === 'nueva' &&
        String(window.auroPacienteHistoriaNuevaId || '').trim() === idPaciente;

      /*
       * Solo si NO existe una historia real para este paciente se permite
       * limpiar un contexto de edición residual. De esta forma una historia
       * ya creada nunca pierde su modo de edición por esta barrera.
       */
      if(esHistoriaNuevaDeclarada && !historiaRealPaciente){
        try{
          if(typeof editingHistoryId !== 'undefined') editingHistoryId = null;
        }catch(_e){}

        window.editingHistoryId = null;
        window.auroHistoriaSeleccionadaId = '';
        window.historiaActual = null;
        window.currentHistoria = null;
      }
    }

    return guardarOriginal.apply(this, arguments);
  };

  guardarProtegido.__auroBarreraHistoriaNuevaPaciente = true;
  guardarProtegido.__auroOriginal = guardarOriginal;
  window.guardarHistoriaClinicaERP = guardarProtegido;
})();
/* ============================================================
   IASYN PACIENTES - API DE COMPATIBILIDAD
   Se añaden aliases IASYN sin retirar nombres legacy consumidos por index
   y por otros módulos clínicos.
============================================================ */
window.IASYN_PACIENTES = Object.assign(window.IASYN_PACIENTES || {}, {
  getPacienteActivo,
  renderPatients,
  cargarPacientesDesdeSheets,
  savePatient,
  abrirHistoriaPaciente,
  seleccionarPacienteHistoria,
  abrirWhatsAppPaciente
});
