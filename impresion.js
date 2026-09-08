/* =========================================================
   IASYN ERP - MODULO DE IMPRESION / PDF
   Archivo: impresion.js
   Fase 1: modularizacion segura desde index.html
   Contiene:
   - imprimirHistoriaClinica()
   - generarPDFReceta()
   - generarPDFConsentimiento()
   - helpers de informe IASYN
   No modifica Apps Script ni Google Sheets.
   ========================================================= */

function auroInformeEscape(valor){
  return String(valor ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

/* IASYN - identidad institucional para impresión. Solo lectura. */
function auroInformeIdentidadCentro(){
  const txt = v => String(v == null ? '' : v).trim();
  const colorSeguro = v => /^#[0-9a-fA-F]{6}$/.test(txt(v)) ? txt(v) : '';

  const candidatos = [
    window.auroConfiguracionCentro,
    window.IASYN_CONFIGURACION_CENTRO,
    window.configuracionCentro,
    window.configuracionERP
  ].filter(cfg => cfg && typeof cfg === 'object' && !Array.isArray(cfg));

  const cfg = candidatos[0] || {};
  let nombre = txt(
    cfg.nombre_clinica ||
    cfg.nombreCentro ||
    cfg.nombre_centro ||
    cfg.nombre ||
    ''
  );

  if(!nombre || /^(aurosanax|aurosanaxmedic|aurosanax medic)$/i.test(nombre)){
    nombre = 'IASYN';
  }

  let estilos = null;
  try{
    estilos = window.getComputedStyle
      ? window.getComputedStyle(document.documentElement)
      : null;
  }catch(_error){}

  const principal = colorSeguro(
    cfg.color_principal ||
    cfg.colorPrincipal ||
    (estilos ? estilos.getPropertyValue('--primary') : '')
  ) || '#7a174f';

  const secundario = colorSeguro(
    cfg.color_secundario ||
    cfg.colorSecundario ||
    (estilos ? (
      estilos.getPropertyValue('--primary-2') ||
      estilos.getPropertyValue('--primary2') ||
      estilos.getPropertyValue('--secondary')
    ) : '')
  ) || '#c23b83';

  return {
    nombre,
    colorPrincipal: principal,
    colorSecundario: secundario
  };
}

function auroInformeResolverIdMedicoReceta(){
  try{
    if(typeof window.obtenerDatosReceta === 'function'){
      const datos = window.obtenerDatosReceta() || {};
      const id = String(datos.id_medico || '').trim();
      if(id) return id;
    }

    for(const idCampo of ['recIdMedico','hcIdMedico','idMedicoActual']){
      const el = document.getElementById(idCampo);
      const valor = String(el?.value || el?.textContent || '').trim();
      if(valor) return valor;
    }

    if(typeof window.idMedicoActual === 'string' && window.idMedicoActual.trim()){
      return window.idMedicoActual.trim();
    }

    for(const atencion of [
      window.atencionActual,
      window.currentAtencion,
      window.atencionActiva,
      window.currentAttention
    ]){
      if(!atencion || typeof atencion !== 'object') continue;
      const id = String(atencion.id_medico || atencion.medico_id || '').trim();
      if(id) return id;
    }
  }catch(error){
    console.warn('IASYN IMPRESIÓN: no se pudo resolver el médico emisor.', error);
  }
  return '';
}

function auroInformeValue(id){
  const el = document.getElementById(id);
  if(!el) return '';
  if(el.tagName === 'SELECT') return el.options[el.selectedIndex]?.text || el.value || '';
  if(el.type === 'checkbox') return el.checked ? 'Sí' : '';
  if(el.type === 'radio') return el.checked ? el.value : '';
  return el.value || el.innerText || el.textContent || '';
}

function auroInformeText(id){
  return auroInformeEscape(auroInformeValue(id)).replace(/\n/g,'<br>');
}

function auroInformeSiDato(label, valor){
  const v = String(valor || '').trim();
  if(!v || v === '—' || v.toLowerCase() === 'sin seleccionar') return '';
  return `<div class="auro-info-row"><span>${auroInformeEscape(label)}</span><b>${auroInformeEscape(v)}</b></div>`;
}

function auroInformeBloque(titulo, icono, contenido, claseExtra=''){
  const c = String(contenido || '').trim();
  if(!c) return '';
  return `
    <section class="auro-report-card ${claseExtra}">
      <div class="auro-report-card-head">
        <div class="auro-report-icon">${icono}</div>
        <h3>${auroInformeEscape(titulo)}</h3>
      </div>
      <div class="auro-report-card-body">${c}</div>
    </section>`;
}

function auroInformeParrafo(texto){
  const t = String(texto || '').trim();
  if(!t) return '';
  return `<div class="auro-clinical-text">${auroInformeEscape(t).replace(/\n/g,'<br>')}</div>`;
}

function auroInformeChipsDesdeTexto(texto, tipo='normal'){
  let t = auroLimpiarTextoPrevioClinico(texto);
  if(!t) return '';
  const partes = t
    .split(/<br>|\n|;|,(?=\s*[A-Za-zÁÉÍÓÚÑáéíóúñ])/gi)
    .map(x=>x.replace(/^[•\-]\s*/, '').trim())
    .filter(Boolean)
    .filter(x => !/^(años?|meses?|días?|dias|dosis\s*:?\s*\d*)$/i.test(x))
    .slice(0,80);
  if(!partes.length) return auroInformeParrafo(t.replace(/<br>/g, '\n'));
  return `<div class="auro-chip-grid ${tipo === 'danger' ? 'danger' : ''}">${partes.map(x=>`<span>${auroInformeEscape(x)}</span>`).join('')}</div>`;
}

function auroInformeExtraerTabla(selector, opciones={}){
  const tabla = document.querySelector(selector);
  if(!tabla) return '';
  const filas = Array.from(tabla.querySelectorAll('tbody tr, tr')).filter(tr => tr.querySelector('td'));
  const items = [];

  filas.forEach(tr => {
    const celdas = Array.from(tr.querySelectorAll('td'));
    if(!celdas.length) return;
    const nombre = (celdas[0]?.innerText || '').trim();
    const checked = tr.querySelector('input[type="checkbox"]:checked');
    const radios = Array.from(tr.querySelectorAll('input[type="radio"]:checked')).map(r => r.value || r.nextSibling?.textContent || '').filter(Boolean);
    const valores = Array.from(tr.querySelectorAll('input, select, textarea'))
      .filter(el => {
        if(el.type === 'checkbox') return el.checked;
        if(el.type === 'radio') return el.checked;
        return String(el.value || '').trim();
      })
      .map(el => {
        if(el.tagName === 'SELECT') return el.options[el.selectedIndex]?.text || el.value || '';
        if(el.type === 'checkbox') return 'Sí';
        if(el.type === 'radio') return el.value || 'Sí';
        return el.value || '';
      })
      .map(x => String(x).trim())
      .filter(Boolean);

    const textoFila = celdas.map(td => (td.innerText || '').trim()).filter(Boolean).join(' ');
    const tieneDato = checked || radios.length || valores.length;
    if(!tieneDato && opciones.soloMarcados) return;
    if(!tieneDato && !opciones.incluirSinMarcar) return;

    const detalle = valores.filter(v => v.toLowerCase() !== 'sí').join(' · ');
    items.push(`
      <div class="auro-list-item">
        <strong>${auroInformeEscape(nombre || textoFila || 'Registro')}</strong>
        ${detalle ? `<small>${auroInformeEscape(detalle)}</small>` : ''}
      </div>`);
  });

  if(!items.length) return '';
  return `<div class="auro-list-premium">${items.join('')}</div>`;
}


/* IASYN FIX PDF ANTECEDENTES v3.2
   Usa los campos ocultos/serializados ya guardados, no la tabla visual.
   Evita que los selectores de unidad vacíos impriman "años" o filas no marcadas.
*/
function auroInformeRenderItemsCompactos(items){
  items = (items || []).filter(x => x && String(x.titulo || '').trim());
  if(!items.length) return '';

  return `<div class="auro-report-grid">${items.map(it => {
    const titulo = auroInformeEscape(it.titulo || 'Registro');
    const detalle = auroInformeDetalleCompacto(it.detalle || '');
    return `<div class="auro-report-item"><strong>${titulo}</strong>${detalle}</div>`;
  }).join('')}</div>`;
}

function auroInformeDetalleCompacto(detalle){
  const raw = String(detalle || '').trim();
  if(!raw) return '';

  const partes = raw
    .split(/\s*·\s*/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => {
      let texto = x
        .replace(/^Tiempo:\s*/i, 'Evolución: ')
        .replace(/^(Tratamiento|Medicamento|Medicación):\s*/i, 'Tratamiento: ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return texto ? `<small>${auroInformeEscape(texto)}</small>` : '';
    })
    .filter(Boolean);

  return partes.length ? `<div class="auro-report-detail">${partes.join('')}</div>` : '';
}

function auroInformeAntecedentesDesdeCampos(){
  const fuentePersonales = auroInformeValue('hcAntecedentesPersonales') || '';
  const fuentePatologicos = (typeof auroExtraerFuentePatologicosPersonales === 'function')
    ? auroExtraerFuentePatologicosPersonales(fuentePersonales)
    : fuentePersonales;

  const bloques = [];

  function add(titulo, icono, html, clase){
    if(html && String(html).trim()) bloques.push(auroInformeBloque(titulo, icono, html, clase || ''));
  }

  if(typeof auroExtraerItemsAntecedentePremium === 'function'){
    add('Antecedentes personales', 'AP', auroInformeRenderItemsCompactos(auroExtraerItemsAntecedentePremium(fuentePatologicos, 'patologia')));
    add('Antecedentes quirúrgicos', 'AQ', auroInformeRenderItemsCompactos(auroExtraerItemsAntecedentePremium(auroInformeValue('hcAntecedentesQuirurgicos'), 'quirurgico')));
    add('Alergias', '⚠', auroInformeRenderItemsCompactos(auroExtraerItemsAntecedentePremium(auroInformeValue('hcAlergias') || auroInformeValue('hcAlergiasResumen'), 'alergia')), 'danger');
    add('Antecedentes ginecológicos', 'G', auroInformeRenderItemsCompactos(auroExtraerItemsAntecedentePremium(auroInformeValue('hcAntecedentesGinecoObstetricos') || auroInformeValue('hcRevisionSistemas'), 'gineco')));
    add('Medicación actual', 'M', auroInformeRenderItemsCompactos(auroExtraerItemsAntecedentePremium(auroInformeValue('hcMedicacionActual'), 'medicacion')));
    add('Antecedentes familiares', 'AF', auroInformeRenderItemsCompactos(auroExtraerItemsAntecedentePremium(auroInformeValue('hcAntecedentesFamiliares'), 'familiares')));
  }else{
    add('Antecedentes personales', 'AP', auroInformeChipsDesdeTexto(fuentePatologicos));
    add('Antecedentes quirúrgicos', 'AQ', auroInformeChipsDesdeTexto(auroInformeValue('hcAntecedentesQuirurgicos')));
    add('Alergias', '⚠', auroInformeChipsDesdeTexto(auroInformeValue('hcAlergias') || auroInformeValue('hcAlergiasResumen'), 'danger'), 'danger');
    add('Antecedentes familiares', 'AF', auroInformeParrafo(auroInformeValue('hcAntecedentesFamiliares')));
  }

  if(typeof auroExtraerHabitosRegistrados === 'function'){
    add('Hábitos psicobiológicos', 'H', auroInformeRenderItemsCompactos(auroExtraerHabitosRegistrados(fuentePersonales)));
  }
  if(typeof auroExtraerActividadRegistrada === 'function'){
    add('Estilo de vida', 'EV', auroInformeRenderItemsCompactos(auroExtraerActividadRegistrada(fuentePersonales)));
  }
  if(typeof auroExtraerVacunasRegistradas === 'function'){
    add('Vacunas / COVID', 'V', auroInformeRenderItemsCompactos(auroExtraerVacunasRegistradas(fuentePersonales)));
  }

  const alimentacion = auroInformeValue('hcAlimentacion') || auroInformeValue('hcAlimentacionDetalle');
  add('Alimentación', 'N', auroInformeParrafo(alimentacion));

  return bloques.join('');
}

function auroInformeObtenerPaciente(){
  const idPaciente = document.getElementById('hcPacienteSelect')?.value || '';
  if(typeof patients !== 'undefined' && Array.isArray(patients)){
    return patients.find(p => String(p.id_paciente || p.id || '') === String(idPaciente)) || null;
  }
  return null;
}

function auroInformeDiagnosticos(){
  const body = document.getElementById('hcDxSeleccionadosBody');
  if(body){
    const filas = Array.from(body.querySelectorAll('tr')).filter(tr => !tr.innerText.toLowerCase().includes('sin diagn'));
    const items = filas.map(tr => {
      const txt = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()).filter(Boolean).slice(0,4).join(' · ');
      return txt ? `<div class="auro-list-item"><strong>${auroInformeEscape(txt)}</strong></div>` : '';
    }).filter(Boolean);
    if(items.length) return `<div class="auro-list-premium">${items.join('')}</div>`;
  }
  return auroInformeParrafo(auroInformeValue('hcDiagnosticoPrincipal') || auroInformeValue('hcCie10Principal') || auroInformeValue('recDiagnostico'));
}

function imprimirHistoriaClinica(){
  const identidadCentro = auroInformeIdentidadCentro();
  const nombreCentro = identidadCentro.nombre || 'IASYN';
  const colorPrincipal = identidadCentro.colorPrincipal || '#7a174f';
  const colorSecundario = identidadCentro.colorSecundario || '#c23b83';

  const idPaciente = document.getElementById('hcPacienteSelect')?.value || '';
  if(!idPaciente){
    alert('Seleccione primero un paciente para generar el PDF.');
    return;
  }

  const paciente = auroInformeObtenerPaciente();
  const nombrePaciente = paciente?.nombre || paciente?.nombres || auroInformeValue('hcCardNombre') || auroInformeValue('hcPacienteResumen') || 'Paciente';
  const cedula = paciente?.cedula || paciente?.numero_documento || auroInformeValue('hcCardCedula') || '—';
  const telefono = paciente?.telefono || paciente?.whatsapp || auroInformeValue('hcCardTelefono') || '—';
  const nacimiento = paciente?.fecha_nacimiento || auroInformeValue('hcCardNacimiento') || '—';
  const edad = paciente?.edad || auroInformeValue('hcCardEdad') || '—';
  const fecha = new Date().toLocaleDateString('es-EC', {year:'numeric', month:'2-digit', day:'2-digit'});
  const hora = new Date().toLocaleTimeString('es-EC', {hour:'2-digit', minute:'2-digit'});

  const datosPaciente = `
    <div class="auro-patient-band">
      <div class="auro-patient-avatar">${auroInformeEscape(String(nombrePaciente).trim().charAt(0).toUpperCase() || 'A')}</div>
      <div>
        <h2>${auroInformeEscape(nombrePaciente)}</h2>
        <p>Historia clínica integral · ${auroInformeEscape(nombreCentro)}</p>
      </div>
    </div>
    <div class="auro-info-grid">
      ${auroInformeSiDato('Cédula', cedula)}
      ${auroInformeSiDato('Edad', edad)}
      ${auroInformeSiDato('Nacimiento', nacimiento)}
      ${auroInformeSiDato('WhatsApp', telefono)}
      ${auroInformeSiDato('Fecha de emisión', fecha)}
      ${auroInformeSiDato('Hora', hora)}
    </div>`;

  const anamnesis = `
    ${auroInformeBloque('Motivo de consulta', '01', auroInformeParrafo(auroInformeValue('hcMotivoConsulta')))}
    ${auroInformeBloque('Enfermedad actual', '02', auroInformeParrafo(auroInformeValue('hcEnfermedadActual')))}
  `;

  // PDF v3.2: antecedentes desde campos ocultos/serializados, no desde la tabla visual.
  // Esto evita imprimir filas no marcadas y detalles duplicados como "5 años - años".
  const antecedentesHTML = auroInformeAntecedentesDesdeCampos();

  const signos = `
    <div class="auro-info-grid compact">
      ${auroInformeSiDato('Peso', auroInformeValue('hcPeso'))}
      ${auroInformeSiDato('Talla', auroInformeValue('hcTalla'))}
      ${auroInformeSiDato('IMC', auroInformeValue('hcIMC'))}
      ${auroInformeSiDato('Presión arterial', auroInformeValue('hcPresionArterial') || auroInformeValue('hcPA'))}
      ${auroInformeSiDato('Frecuencia cardíaca', auroInformeValue('hcFrecuenciaCardiaca') || auroInformeValue('hcFC'))}
      ${auroInformeSiDato('Temperatura', auroInformeValue('hcTemperatura'))}
      ${auroInformeSiDato('Saturación', auroInformeValue('hcSaturacion'))}
    </div>`;

  const examenFisico = `
    ${signos}
    ${auroInformeBloque('Examen físico', 'EF', auroInformeParrafo(auroInformeValue('hcExamenFisico')))}
    ${auroInformeBloque('Revisión por sistemas', 'RS', auroInformeExtraerTabla('.sistemas-check-card', {incluirSinMarcar:false}))}
  `;

  const diagnosticos = auroInformeDiagnosticos();
  const plan = auroInformeParrafo(auroInformeValue('hcPlanTratamiento'));
  const observaciones = auroInformeParrafo(auroInformeValue('hcObservaciones'));

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Historia Clínica ${auroInformeEscape(nombreCentro)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35}
  .auro-report{max-width:920px;margin:0 auto;background:white;min-height:100vh;padding:24px 30px 30px}
  .auro-header{border-radius:20px;background:linear-gradient(135deg,${colorPrincipal},${colorSecundario});color:#fff;padding:18px 22px;margin-bottom:14px;position:relative;overflow:hidden}
  .auro-header:after{content:"";position:absolute;width:210px;height:210px;border-radius:50%;background:rgba(255,255,255,.12);right:-70px;top:-80px}
  .auro-header small{display:block;opacity:.9;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
  .auro-header h1{margin:0;font-size:24px;font-weight:900;letter-spacing:.02em}
  .auro-header p{margin:5px 0 0;opacity:.95;font-size:13px}
  .auro-section-title{margin:14px 0 8px;display:flex;align-items:center;gap:8px;color:${colorPrincipal};font-size:15px;font-weight:900;border-bottom:1px solid #fbcfe8;padding-bottom:6px}
  .auro-section-title span{background:#fdf2f8;color:#8b1e5a;border:1px solid #fbcfe8;border-radius:999px;padding:5px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .auro-patient-band{display:flex;align-items:center;gap:12px;border:1px solid #fbcfe8;background:linear-gradient(135deg,#fff,#fff7fb);border-radius:18px;padding:10px 12px;margin-bottom:10px}
  .auro-patient-avatar{width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,${colorPrincipal},${colorSecundario});color:#fff;display:grid;place-items:center;font-size:20px;font-weight:900;flex:0 0 auto}
  .auro-patient-band h2{margin:0;font-size:21px;font-weight:900;color:#111827}
  .auro-patient-band p{margin:3px 0 0;color:#6b7280;font-weight:700}
  .auro-info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px}
  .auro-info-grid.compact{grid-template-columns:repeat(4,1fr)}
  .auro-info-row{border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:7px 9px;min-height:auto}
  .auro-info-row span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;margin-bottom:3px}
  .auro-info-row b{display:block;color:#111827;font-size:13px;word-break:break-word}
  .auro-report-card{border:1px solid #e5e7eb;border-radius:15px;background:#fff;margin-bottom:8px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,.035);break-inside:avoid}
  .auro-report-card-head{display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#fff7fb,#ffffff);border-bottom:1px solid #f1f5f9;padding:8px 10px}
  .auro-report-card-head h3{margin:0;color:#111827;font-size:14px;font-weight:900}
  .auro-report-icon{width:32px;height:32px;border-radius:12px;background:#fdf2f8;color:#8b1e5a;border:1px solid #fbcfe8;display:grid;place-items:center;font-size:12px;font-weight:900;flex:0 0 auto}
  .auro-report-card.danger .auro-report-icon{background:#fee2e2;color:#991b1b;border-color:#fecaca}
  .auro-report-card-body{padding:9px 10px}
  .auro-clinical-text{white-space:normal;color:#1f2937;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:8px 10px;min-height:auto}
  .auro-chip-grid{display:flex;flex-wrap:wrap;gap:7px}
  .auro-chip-grid span{border:1px solid #e5e7eb;background:#f8fafc;border-radius:999px;padding:7px 10px;font-weight:750;color:#374151}
  .auro-chip-grid.danger span{border-color:#fecaca;background:#fef2f2;color:#991b1b}
  .auro-list-premium{display:grid;gap:6px}
  .auro-list-item{border:1px solid #edf2f7;background:#fbfdff;border-radius:11px;padding:6px 8px;display:block}
  .auro-list-item strong{display:block;color:#111827;font-size:13px}
  .auro-list-item small{display:block;color:#64748b;font-weight:700;margin-top:3px}
  .auro-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .auro-report-item{border:1px solid #edf2f7;border-left:3px solid ${colorSecundario};background:#fff;border-radius:12px;padding:7px 9px;min-width:0}
  .auro-report-item strong{display:block;color:#111827;font-size:12.5px;font-weight:900;line-height:1.2;margin-bottom:3px}
  .auro-report-detail{display:grid;gap:3px}
  .auro-report-detail small{display:block;color:#475569;font-size:11px;font-weight:700;line-height:1.2}
  .auro-footer{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:14px;color:#6b7280;font-size:11px;display:flex;justify-content:space-between;gap:12px}
  @page{size:A4;margin:8mm} @media print{body{background:white;font-size:10.5px;line-height:1.25}.auro-report{max-width:none;padding:0;box-shadow:none;min-height:auto}.no-print{display:none!important}.auro-header{padding:12px 16px;margin-bottom:8px;border-radius:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.auro-header h1{font-size:20px}.auro-section-title{margin:9px 0 5px;font-size:13px;padding-bottom:4px}.auro-patient-band{padding:7px 9px;margin-bottom:6px}.auro-info-grid{gap:5px;margin-bottom:5px}.auro-info-row{padding:5px 7px;border-radius:9px}.auro-report-card{box-shadow:none;margin-bottom:5px;border-radius:10px}.auro-report-card-head{padding:5px 7px}.auro-report-card-body{padding:6px 7px}.auro-report-card,.auro-patient-band,.auro-report-item{break-inside:avoid;page-break-inside:avoid}.auro-section-title{break-after:avoid}.auro-footer{margin-top:10px;padding-top:6px}}
  @media print{.auro-report-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.auro-report-item{padding:4px 6px;border-radius:8px}.auro-report-item strong{font-size:10.5px}.auro-report-detail small{font-size:9.5px}.auro-clinical-text{padding:5px 7px}.auro-chip-grid{gap:4px}.auro-chip-grid span{padding:4px 6px;font-size:10px}.auro-list-item{padding:4px 6px}}
  @media(max-width:700px){.auro-report{padding:20px}.auro-info-grid,.auro-info-grid.compact{grid-template-columns:1fr}.auro-header h1{font-size:22px}}
</style>
</head>
<body>
  <div class="auro-report">
    <header class="auro-header">
      <small>${auroInformeEscape(nombreCentro)} · IASYN Clinical ERP</small>
      <h1>Historia Clínica Integral</h1>
      <p>Informe clínico profesional generado desde IASYN Clinical ERP</p>
    </header>

    <div class="auro-section-title"><span>Paciente</span> Datos generales</div>
    ${datosPaciente}

    <div class="auro-section-title"><span>Consulta</span> Anamnesis</div>
    ${anamnesis || '<div class="auro-clinical-text">Sin datos registrados.</div>'}

    <div class="auro-section-title"><span>Antecedentes</span> Informe estructurado premium</div>
    ${antecedentesHTML || '<div class="auro-clinical-text">Sin antecedentes registrados.</div>'}

    <div class="auro-section-title"><span>Examen</span> Signos vitales y examen físico</div>
    ${examenFisico || '<div class="auro-clinical-text">Sin datos registrados.</div>'}

    <div class="auro-section-title"><span>CIE-10</span> Diagnósticos</div>
    ${auroInformeBloque('Diagnósticos seleccionados', 'DX', diagnosticos) || '<div class="auro-clinical-text">Sin diagnóstico registrado.</div>'}

    <div class="auro-section-title"><span>Plan</span> Tratamiento y observaciones</div>
    ${auroInformeBloque('Plan terapéutico', 'PT', plan)}
    ${auroInformeBloque('Observaciones', 'OB', observaciones)}

    <footer class="auro-footer">
      <div>${auroInformeEscape(nombreCentro)} · Informe clínico generado con IASYN.</div>
      <div>${fecha} ${hora}</div>
    </footer>
  </div>
</body>
</html>`;

  const ventana = window.open('', '_blank', 'width=1100,height=900');
  if(!ventana){
    alert('El navegador bloqueó la ventana emergente. Permita ventanas emergentes para generar el PDF.');
    return;
  }
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => {
    ventana.print();
  }, 650);
}

async function guardarRecetaERP(){
  if(typeof sincronizarPlanConReceta === 'function') sincronizarPlanConReceta();
  const paciente = getPacienteActivo();
  if(!paciente){
    alert('Seleccione primero un paciente para guardar la receta.');
    showScreen('pacientes');
    return;
  }

  const medicamento = getValueIfExists('recMedicamento') || getValueIfExists('hcRecetaMedicamentos');
  const indicaciones = getValueIfExists('recIndicaciones') || getValueIfExists('hcIndicacionesPaciente');
  const recomendaciones = getValueIfExists('recRecomendaciones') || getValueIfExists('hcPlanTratamiento');
  const diagnosticoTexto = getValueIfExists('recDiagnostico') || getValueIfExists('hcDiagnosticoPrincipal');

  if(!medicamento && !indicaciones && !recomendaciones){
    alert('Ingrese al menos medicamentos, indicaciones o recomendaciones antes de guardar la receta.');
    return;
  }

  const idMedicoEmisor = auroInformeResolverIdMedicoReceta();
  if(!idMedicoEmisor){
    alert('No se pudo identificar el médico emisor de la receta. Abra o seleccione la atención correspondiente antes de guardar.');
    return;
  }

  const data = {
    id_paciente: paciente.id_paciente || activePatientId,
    id_historia: getValueIfExists('hcIdHistoria') || '',
    id_medico: idMedicoEmisor,
    fecha_receta: getValueIfExists('recFecha') || fechaHoyISO(),
    diagnostico_cie10: getValueIfExists('recCie10') || getValueIfExists('hcCie10Principal'),
    medicamento: medicamento,
    presentacion: '',
    dosis: '',
    via: '',
    frecuencia: '',
    duracion: '',
    cantidad: '',
    indicaciones: indicaciones,
    recomendaciones: [diagnosticoTexto, recomendaciones].filter(Boolean).join(' | '),
    estado: getValueIfExists('recEstado') || 'Emitida',
    creado_por: 'IASYN ERP'
  };

  try{
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({
        accion: 'guardarReceta',
        data: limpiarObjetoParaSheets(data)
      })
    });

    alert('Receta enviada a Google Sheets correctamente.');
  }catch(error){
    console.error(error);
    alert('No se pudo guardar la receta. Revise conexión o Apps Script.');
  }
}

function generarPDFReceta(){
  /*
    IASYN FIX IMPRESION RECETA:
    impresion.js ya no imprime la pantalla actual con window.print().
    Delega la impresión a recetas.js, que es el módulo que construye
    la misma receta premium usada en Vista previa.
    No modifica guardado, Google Sheets, Plan ni Atenciones.
  */

  try{
    if(typeof window.__auroRecetaPDFDelegando === 'undefined'){
      window.__auroRecetaPDFDelegando = false;
    }

    if(window.__auroRecetaPDFDelegando){
      return;
    }

    if(typeof sincronizarPlanConReceta === 'function'){
      sincronizarPlanConReceta();
    }

    if(document.getElementById('recFecha') && !document.getElementById('recFecha').value){
      document.getElementById('recFecha').value = (typeof fechaHoyISO === 'function') ? fechaHoyISO() : new Date().toISOString().slice(0,10);
    }

    const paciente = (typeof getPacienteActivo === 'function') ? getPacienteActivo() : null;
    if(!paciente){
      alert('Seleccione primero un paciente para generar la receta.');
      if(typeof showScreen === 'function') showScreen('pacientes');
      return;
    }

    /*
      Si recetas.js está cargado correctamente, él debe ser el dueño
      del PDF/impresión de recetas. Para evitar bucle, llamamos su flujo
      solo cuando exista obtenerDatosReceta() y la función global haya sido
      reemplazada por recetas.js.
    */
    if(typeof window.obtenerDatosReceta === 'function'){
      const datos = window.obtenerDatosReceta();

      if(typeof window.__auroRecetasConstruirPDFSeguro === 'function'){
        return window.__auroRecetasConstruirPDFSeguro(datos);
      }

      /*
        Fallback seguro:
        si recetas.js ya reemplazó window.generarPDFReceta por su propia
        función, esta función local no debería ejecutarse. Si aun así se
        ejecuta, usamos vistaPreviaReceta() para asegurar que el contenido
        esté actualizado antes de imprimir desde el módulo de recetas.
      */
      if(typeof window.vistaPreviaReceta === 'function'){
        window.vistaPreviaReceta();
      }

      const preview = document.getElementById('recetaPreview');
      const htmlReceta = preview ? preview.innerHTML : '';

      if(htmlReceta && htmlReceta.includes('auro-receta-documento')){
        const ventana = window.open('', '_blank');
        if(!ventana){
          alert('El navegador bloqueó la ventana de impresión. Permita ventanas emergentes para este sitio.');
          return;
        }

        const identidadCentro = auroInformeIdentidadCentro();
        const tituloReceta = 'Receta médica · ' + (identidadCentro.nombre || 'IASYN');

        ventana.document.open();
        ventana.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + auroInformeEscape(tituloReceta) + '</title></head><body>' + htmlReceta + '</body></html>');
        ventana.document.close();
        ventana.focus();

        setTimeout(function(){
          ventana.print();
        }, 350);

        return;
      }
    }

    /*
      Último respaldo: solo si recetas.js no está disponible.
      Se conserva el comportamiento antiguo para no romper el ERP,
      pero ya no será el camino principal.
    */
    alert('Se abrirá la ventana de impresión para guardar la receta como PDF.');
    window.print();

  }catch(error){
    console.error('IASYN IMPRESION: error generando PDF de receta.', error);
    alert('No se pudo generar la impresión de la receta.');
  }
}

function generarPDFConsentimiento(){
  alert('Se abrirá la ventana de impresión para guardar el consentimiento como PDF.');
  window.print();
}


/* IASYN - delegación segura de certificados, patrón Recetas */
function generarPDFCertificado(){
  try{
    if(window.auroCertificados && typeof window.auroCertificados.obtenerDatos === 'function'){
      const datos = window.auroCertificados.obtenerDatos();

      if(typeof window.__auroCertificadosConstruirPDFSeguro === 'function'){
        return window.__auroCertificadosConstruirPDFSeguro(datos);
      }

      /* Respaldo antirregresión: solo si el motor seguro todavía no cargó. */
      if(typeof window.auroCertificados.imprimir === 'function'){
        return window.auroCertificados.imprimir();
      }
    }

    alert('El módulo de certificados no está disponible para impresión.');
  }catch(error){
    console.error('IASYN IMPRESION: error generando certificado.', error);
    alert('No se pudo generar la impresión del certificado.');
  }
}
