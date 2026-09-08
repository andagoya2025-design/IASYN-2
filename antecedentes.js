/*
  IASYN ERP - ANTECEDENTES FASE 1
  Cambio quirúrgico: añade Citología/PAP y estado de Colposcopia
  dentro del JSON ginecológico ya existente.
  No crea columnas, no toca Apps Script ni otros módulos.
*/

/*
  IASYN ERP - MODULO ANTECEDENTES
  Archivo modular extraído desde index.html SIN CORREGIR.
  Objetivo: iniciar modularización no destructiva del módulo Antecedentes.
  Mantiene funciones, nombres e IDs existentes.
  No modifica backend, Google Sheets ni Apps Script.
*/


function auroNormalizarClaveClinica(valor){
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function auroBuscarControlPorData(selector, dataKey, valor){
  const normal = auroNormalizarClaveClinica(valor);
  const controles = [...document.querySelectorAll(selector)];

  return controles.find(x => String(x.dataset[dataKey] || '') === String(valor || '')) ||
         controles.find(x => auroNormalizarClaveClinica(x.dataset[dataKey] || '') === normal) ||
         controles.find(x => {
           const item = auroNormalizarClaveClinica(x.dataset[dataKey] || '');
           return normal && item && (item.includes(normal) || normal.includes(item));
         }) ||
         null;
}

function auroHistoriaTieneAntecedentes(h){
  if(!h) return false;
  return [
    h.antecedentes_personales,
    h.antecedentes_quirurgicos,
    h.antecedentes_gineco_obstetricos,
    h.antecedentes_familiares,
    h.medicacion_actual,
    h.alergias
  ].some(v => String(v || '').trim());
}

function auroFechaHistoriaValor(h){
  const raw = h?.fecha_registro || h?.fecha_apertura || h?.creado_en || h?.actualizado_en || '';
  const t = raw ? new Date(raw).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

function auroHistoriasPacienteOrdenadas(idPaciente){
  return (historiasClinicas || [])
    .filter(h => String(h.id_paciente || '') === String(idPaciente || ''))
    .sort((a,b) => auroFechaHistoriaValor(b) - auroFechaHistoriaValor(a));
}

function auroUltimaHistoriaConAntecedentes(idPaciente){
  return auroHistoriasPacienteOrdenadas(idPaciente).find(auroHistoriaTieneAntecedentes) || null;
}

function auroInyectarEstilosAntecedentesPremium(){
  if(document.getElementById('auroAntecedentesPremiumStyle')) return;
  const style = document.createElement('style');
  style.id = 'auroAntecedentesPremiumStyle';
  style.textContent = `
    .auro-previos-box{
      background:linear-gradient(135deg,#ffffff 0%,#fff7fb 100%)!important;
      border:1px solid rgba(139,30,90,.16)!important;
      border-radius:16px!important;
      padding:12px!important;
      margin:8px 0 12px!important;
      box-shadow:0 8px 22px rgba(15,23,42,.06)!important;
    }
    .auro-previos-head{
      display:flex!important;
      justify-content:space-between!important;
      align-items:flex-start!important;
      gap:10px!important;
      padding-bottom:10px!important;
      margin-bottom:10px!important;
      border-bottom:1px solid rgba(139,30,90,.12)!important;
    }
    .auro-previos-head b{
      color:#7a174f!important;
      font-size:15px!important;
      font-weight:900!important;
      letter-spacing:-.01em!important;
    }
    .auro-previos-head small{
      display:block!important;
      color:#64748b!important;
      font-size:12px!important;
      font-weight:600!important;
      margin-top:2px!important;
    }
    .auro-previos-hide{
      padding:6px 10px!important;
      border-radius:10px!important;
      font-size:11px!important;
      white-space:nowrap!important;
    }
    .auro-previos-content{
      display:grid!important;
      gap:8px!important;
    }
    .auro-previos-content.auro-previos-collapsed{
      display:none!important;
    }
    .auro-previos-line{
      background:#ffffff!important;
      border:1px solid rgba(139,30,90,.10)!important;
      border-radius:14px!important;
      padding:10px!important;
      box-shadow:0 4px 12px rgba(15,23,42,.035)!important;
    }
    .auro-previos-line span{
      display:flex!important;
      align-items:center!important;
      gap:6px!important;
      color:#8b1e5a!important;
      font-size:11px!important;
      font-weight:900!important;
      text-transform:uppercase!important;
      letter-spacing:.035em!important;
      margin-bottom:7px!important;
    }
    .auro-previos-mini-table{
      display:grid!important;
      grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important;
      gap:8px!important;
    }
    .auro-previos-mini-row{
      position:relative!important;
      background:#fff!important;
      border:1px solid rgba(139,30,90,.12)!important;
      border-left:3px solid #c23b83!important;
      border-radius:12px!important;
      padding:10px 12px!important;
      min-height:auto!important;
      box-shadow:0 3px 10px rgba(139,30,90,.04)!important;
      break-inside:avoid!important;
      page-break-inside:avoid!important;
    }
    .auro-previos-mini-row b{
      display:block!important;
      color:#111827!important;
      font-size:13px!important;
      font-weight:800!important;
      margin-bottom:5px!important;
      line-height:1.2!important;
    }
    .auro-previos-mini-row em{
      display:grid!important;
      gap:4px!important;
      color:#475569!important;
      font-size:11.5px!important;
      font-style:normal!important;
      line-height:1.25!important;
    }
    .auro-previos-detail-pill{
      display:flex!important;
      align-items:flex-start!important;
      gap:5px!important;
      background:rgba(255,255,255,.82)!important;
      border:1px solid rgba(226,232,240,.85)!important;
      border-radius:8px!important;
      padding:4px 7px!important;
      color:#334155!important;
      font-size:11px!important;
      font-weight:700!important;
    }
    .auro-previos-detail-pill i{
      color:#8b1e5a!important;
      margin-top:1px!important;
      flex:0 0 auto!important;
    }

    @media print{
      .auro-previos-box{
        background:#fff!important;
        padding:8px!important;
        margin:4px 0!important;
        box-shadow:none!important;
        border-radius:10px!important;
        border:1px solid rgba(139,30,90,.16)!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      .auro-previos-head{
        padding-bottom:6px!important;
        margin-bottom:6px!important;
      }
      .auro-previos-head b{font-size:13px!important;}
      .auro-previos-head small{font-size:10px!important;}
      .auro-previos-hide{display:none!important;}
      .auro-previos-content{gap:5px!important;}
      .auro-previos-line{
        margin-bottom:5px!important;
        padding:7px!important;
        box-shadow:none!important;
        border-radius:8px!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      .auro-previos-line span{
        font-size:9.5px!important;
        margin-bottom:4px!important;
      }
      .auro-previos-mini-table{
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:5px!important;
      }
      .auro-previos-mini-row{
        padding:5px 7px!important;
        border-radius:7px!important;
        min-height:auto!important;
        box-shadow:none!important;
        page-break-inside:avoid!important;
        break-inside:avoid!important;
      }
      .auro-previos-mini-row b{
        font-size:10.5px!important;
        margin-bottom:3px!important;
        line-height:1.15!important;
      }
      .auro-previos-mini-row em{
        gap:2px!important;
        font-size:10px!important;
        line-height:1.15!important;
      }
      .auro-previos-detail-pill{
        padding:2px 5px!important;
        font-size:9.5px!important;
        border-radius:6px!important;
      }
    }
    @media(max-width:760px){
      .auro-previos-head{display:block!important;}
      .auro-previos-hide{margin-top:10px!important;}
      .auro-previos-mini-table{grid-template-columns:1fr!important;}
    }
  `;
  document.head.appendChild(style);
}

function auroToggleAntecedentesPrevios(){
  const box = document.getElementById('auroAntecedentesPreviosBox');
  const content = document.getElementById('auroAntecedentesPreviosContent');

  if(!box || !content) return;

  const btn = box.querySelector('.auro-previos-hide');
  const oculto = content.classList.toggle('auro-previos-collapsed');

  if(btn){
    btn.innerHTML = oculto
      ? '<i class="bi bi-eye me-1"></i> Mostrar'
      : '<i class="bi bi-eye-slash me-1"></i> Ocultar';
  }

  box.dataset.estado = oculto ? 'oculto' : 'visible';
}

function auroAsegurarCajaAntecedentesPrevios(){
  auroInyectarEstilosAntecedentesPremium();
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return null;

  let box = document.getElementById('auroAntecedentesPreviosBox');
  if(box) return box;

  box = document.createElement('div');
  box.id = 'auroAntecedentesPreviosBox';
  box.className = 'auro-previos-box';
  box.style.display = 'none';
  box.innerHTML = `
    <div class="auro-previos-head">
      <div>
        <b><i class="bi bi-database-check me-1"></i> Antecedentes previos guardados</b>
        <small>Información leída desde Google Sheets. Se conserva para evitar pérdida de datos.</small>
      </div>
      <button type="button" class="btn-soft auro-previos-hide" onclick="auroToggleAntecedentesPrevios()"><i class="bi bi-eye-slash me-1"></i> Ocultar</button>
    </div>
    <div class="auro-previos-content" id="auroAntecedentesPreviosContent"></div>
  `;

  const titulo = panel.querySelector('.clinical-subtitle');
  if(titulo && titulo.nextSibling){
    titulo.parentNode.insertBefore(box, titulo.nextSibling);
  }else{
    panel.insertBefore(box, panel.firstChild);
  }
  return box;
}


function auroPrevioTryParseJsonInterno(valor){
  const raw = String(valor || '').trim();
  if(!raw) return null;

  const ini = raw.indexOf('{');
  const fin = raw.lastIndexOf('}');
  if(ini === -1 || fin === -1 || fin <= ini) return null;

  try{
    return JSON.parse(raw.substring(ini, fin + 1));
  }catch(e){
    return null;
  }
}

function auroPrevioUnicos(lista){
  const vistos = {};
  return (lista || []).map(x => String(x || '').trim()).filter(x => {
    if(!x) return false;
    const k = x.toLowerCase();
    if(vistos[k]) return false;
    vistos[k] = true;
    return true;
  });
}

function auroPrevioHumanizarClave(clave){
  const mapa = {
    key:'', numero:'', no_aplica:'No aplica', aplicado:'Aplicado', aplicada:'Aplicada',
    fecha:'Fecha', tiempo:'Tiempo', detalle:'Detalle', resultado:'Resultado', observacion:'Observación', observaciones:'Observaciones',
    medicamento:'Medicamento', medicacion:'Medicación', tratamiento:'Tratamiento', biologico:'Biológico', vacuna:'Vacuna', nombre_comercial:'Nombre comercial',
    programada:'Fecha programada', administracion:'Fecha administración', dosis:'Dosis',
    presento:'Presentó', clasificacion:'Clasificación', hospitalizacion:'Hospitalización', vacunado:'Vacunado', vacuna_tipo:'Tipo de vacuna',
    anio_referencia:'Año de referencia', tiempo_hospitalizado:'Tiempo hospitalizado', observacion_presento:'Observación', detalle_clasificacion:'Detalle clasificación',
    habito:'Hábito', actual:'Ex consumidor', abstinencia:'Tiempo de abstinencia',
    actividad:'Actividad', distancia_km:'Distancia', frecuencia_dia:'Frecuencia', tiempo_horas:'Tiempo',
    agua_diaria_litros:'Agua diaria', comidas_dia:'Comidas al día', frutas_verduras:'Frutas / verduras', comida_rapida:'Comida rápida', azucar:'Azúcar', sal:'Sal', suplementos:'Suplementos',
    menarquia:'Menarquia', menacme:'Menacme', menopausia:'Menopausia', vida_sexual_activa:'Vida sexual activa', planificacion_familiar:'Planificación familiar', terapia_hormonal:'Terapia hormonal', infecciones_vulvovaginales:'Infecciones vulvovaginales', ets:'ETS', mamografia:'Mamografía', eco_mamario:'Eco mamario', densitometria_osea:'Densitometría ósea', pap:'Citología / PAP', estado:'Estado', colposcopia:'Colposcopia'
  };
  if(mapa[clave] !== undefined) return mapa[clave];
  return String(clave || '').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function auroPrevioEsValorUtil(valor){
  if(valor === null || valor === undefined) return false;
  if(typeof valor === 'boolean') return valor === true;
  const t = String(valor).trim();
  if(!t) return false;
  return !/^(no valorado|no aplica|n\/a|na|undefined|null|\[object object\])$/i.test(t);
}

function auroPrevioTextoItemBasico(item){
  if(!auroPrevioEsValorUtil(item)) return '';
  if(typeof item !== 'object') return String(item).trim();

  const titulo = item.descripcion || item.biologico || item.vacuna || item.habito || item.actividad || item.nombre || item.key || '';
  const partes = [];
  if(auroPrevioEsValorUtil(titulo)) partes.push(String(titulo));

  Object.keys(item).forEach(k => {
    if(['key','descripcion','biologico','vacuna','habito','actividad','nombre'].includes(k)) return;
    const v = item[k];
    if(!auroPrevioEsValorUtil(v)) return;

    if(Array.isArray(v)){
      const sub = v.map(auroPrevioTextoItemBasico).filter(Boolean);
      if(sub.length){
        const etiqueta = auroPrevioHumanizarClave(k);
        if(etiqueta) partes.push(etiqueta + ': ' + sub.join('; '));
      }
      return;
    }

    if(typeof v === 'object'){
      const sub = auroPrevioTextoItemBasico(v);
      if(sub){
        const etiqueta = auroPrevioHumanizarClave(k);
        partes.push((etiqueta ? etiqueta + ': ' : '') + sub);
      }
      return;
    }

    const etiqueta = auroPrevioHumanizarClave(k);
    if(etiqueta) partes.push(etiqueta + ': ' + v);
    else if(String(v).trim()) partes.push(String(v).trim());
  });

  return partes.filter(Boolean).join(' | ');
}

function auroPrevioResumenObjetoGenerico(obj, prefijo){
  if(!obj || typeof obj !== 'object') return '';
  const partes = [];
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if(!auroPrevioEsValorUtil(v)) return;
    const etiqueta = auroPrevioHumanizarClave(k);
    if(Array.isArray(v)){
      const sub = v.map(auroPrevioTextoItemBasico).filter(Boolean);
      if(sub.length) partes.push((etiqueta ? etiqueta + ': ' : '') + sub.join('; '));
    }else if(typeof v === 'object'){
      const sub = auroPrevioTextoItemBasico(v);
      if(sub) partes.push((etiqueta ? etiqueta + ': ' : '') + sub);
    }else{
      partes.push((etiqueta ? etiqueta + ': ' : '') + v);
    }
  });
  return partes.length ? (prefijo ? prefijo + ': ' : '') + partes.join('; ') : '';
}

function auroPrevioResumenJsonAntecedentes(obj){
  if(!obj || typeof obj !== 'object') return '';

  const bloques = [];

  const patologicos = Array.isArray(obj.patologicos) ? obj.patologicos.map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(patologicos.length) bloques.push('Patológicos: ' + auroPrevioUnicos(patologicos).join('; '));

  const quirurgicos = Array.isArray(obj.quirurgicos) ? obj.quirurgicos.map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(quirurgicos.length) bloques.push('Quirúrgicos: ' + auroPrevioUnicos(quirurgicos).join('; '));

  const alergias = Array.isArray(obj.alergias) ? obj.alergias.map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(alergias.length) bloques.push('Alergias: ' + auroPrevioUnicos(alergias).join('; '));

  const covid = auroPrevioResumenObjetoGenerico(obj.covid || obj.COVID, 'COVID-19');
  if(covid) bloques.push(covid);

  const vacunas = Array.isArray(obj.vacunas) ? obj.vacunas.map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(vacunas.length) bloques.push('Vacunas: ' + auroPrevioUnicos(vacunas).join('; '));

  const habitos = Array.isArray(obj.habitos) ? obj.habitos.map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(habitos.length) bloques.push('Hábitos: ' + auroPrevioUnicos(habitos).join('; '));

  const estilo = Array.isArray(obj.estilo_vida || obj.estiloVida) ? (obj.estilo_vida || obj.estiloVida).map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(estilo.length) bloques.push('Estilo de vida: ' + auroPrevioUnicos(estilo).join('; '));

  const alimentacion = auroPrevioResumenObjetoGenerico(obj.alimentacion, 'Alimentación');
  if(alimentacion) bloques.push(alimentacion);

  const obstetricos = Array.isArray(obj.obstetricos) ? obj.obstetricos.map(auroPrevioTextoItemBasico).filter(Boolean) : [];
  if(obstetricos.length) bloques.push('Obstétricos: ' + auroPrevioUnicos(obstetricos).join('; '));

  const ginecologicos = auroPrevioResumenObjetoGenerico(obj.ginecologicos, 'Ginecológicos');
  if(ginecologicos) bloques.push(ginecologicos);

  const ginecoDirecto = [];
  ['fum','menarquia','ciclos','gesta','partos','cesareas','abortos','hijos_vivos','pap','ivsa','anticoncepcion','otros'].forEach(k => {
    if(auroPrevioEsValorUtil(obj[k])) ginecoDirecto.push(auroPrevioHumanizarClave(k) + ': ' + obj[k]);
  });
  if(ginecoDirecto.length) bloques.push('Gineco-obstétricos: ' + auroPrevioUnicos(ginecoDirecto).join('; '));

  return bloques.join(' || ');
}

function auroLimpiarTextoPrevioClinico(valor){
  return String(valor || '')
    .replace(/AUROSANAX_[^\n|;]*/gi, ' ')
    .replace(/\[object Object\]/gi, ' ')
    .replace(/[{}\[\]"]/g, ' ')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\s*\|\|\s*/g, '\n')
    .replace(/\s*\|\s*/g, '\n')
    .replace(/\s*;\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function auroTokenizarPrevioClinico(valor){
  let raw = auroLimpiarTextoPrevioClinico(valor);
  if(!raw) return [];
  raw = raw
    .replace(/\b(patologicos?|patológicos?|patologico|patológico|biologico|biológico|vacunas?|covid|habitos?|hábitos?|habito|hábito|actividad(?:[_\s-]*fisica)?|actividad(?:[_\s-]*física)?|estilo[_\s-]*vida|alergias?|alergia|quirurgicos?|quirúrgicos?|cirugia|cirugía|gineco[_\s-]*obstetricos?|gineco[_\s-]*obstétricos?|fum|fur|fup|pap|gestas?|partos?|cesareas?|cesáreas?|abortos?|hijos vivos|hijos muertos|lactancia|ectopicos|ectópicos|otros|tiempo|medicamento|medicación|medicacion|tratamiento|reaccion|reacción|dosis|fecha|marca|frecuencia|cantidad|numero|número|key)\s*:/gi, '\n$1:')
    .replace(/,(?=\s*(?:patolog|biolog|vacuna|covid|habito|hábito|actividad|estilo|alerg|quir|cirug|gineco|fum|fur|fup|pap|gesta|parto|ces|aborto|hijos|lactancia|ectop|otros|tiempo|medic|tratamiento|reacci|dosis|fecha|marca|frecuencia|cantidad|numero|número|key)\s*:)/gi, '\n');
  return raw
    .split(/\n+/)
    .map(x => String(x || '').trim())
    .map(x => x.replace(/^[-•✓⚠\s]+/, '').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
}

function auroEsValorPrevioUtil(valor){
  const t = String(valor || '').trim();
  if(!t) return false;
  if(/^[-–—\s.,:]*$/.test(t)) return false;
  if(/^(no|n\/a|na|ninguno|ninguna|sin datos|sin dato|no valorado|no aplica|negado|niega|false|null|undefined)$/i.test(t)) return false;
  if(/^\d+$/.test(t)) return false;
  if(/^(años?|meses?|d[ií]as?|dosis|n[uú]mero|numero|key)$/i.test(t)) return false;
  if(/^(key|numero|número|dosis)\s*:/i.test(t)) return false;
  return true;
}

function auroCapitalizarClinico(txt){
  txt = String(txt || '').trim();
  if(!txt) return '';
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function auroNombreVacunaClinica(txt){
  return String(txt || '')
    .replace(/\bCovid\b/gi, 'COVID-19')
    .replace(/\bHpv\b/gi, 'VPH')
    .replace(/\bVirus Papiloma Humano\b/gi, 'VPH')
    .replace(/\bHepB\b/gi, 'Hepatitis B')
    .replace(/\bTdap\b|\bTd\/?Tdap\b/gi, 'Td/Tdap')
    .replace(/\bSrp\b/gi, 'SRP')
    .replace(/\bFiebreAmarilla\b/gi, 'Fiebre amarilla')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function auroEsCatalogoNoClinico(txt){
  const n = auroNormalizarClaveClinica(txt);
  if(!n) return true;
  const catalogo = [
    'covid','covid 19','virus papiloma humano','vph','hpv','hepb','hepatitis b','influenza','td','tdap','td tdap','neumococo','srp','varicela','fiebre amarilla',
    'tabaco','alcohol','drogas','cafe','café','cafeina','cafeína','biomasa',
    'correr','caminar','nadar','ciclismo','bicicleta','ejercicio','actividad fisica','actividad física','otros',
    'desayuno','almuerzo','cena','colacion','colación','agua','proteinas','proteínas','carbohidratos','grasas','verduras','frutas'
  ];
  return catalogo.includes(n);
}

function auroEsTokenTecnicoAntecedente(txt){
  const t = String(txt || '').trim();
  if(!t) return true;
  if(/^(key|numero|número|dosis)\s*:/i.test(t)) return true;
  if(/\b(key|numero|número)\s*:/i.test(t)) return true;
  if(/^(vacunas?|biologico|biológico|covid|habitos?|hábitos?|habito|hábito|actividad(?:[_\s-]*fisica)?|actividad(?:[_\s-]*física)?|estilo[_\s-]*vida)\s*:/i.test(t)) return true;
  return false;
}

function auroEsPatologiaConocida(txt){
  const n = auroNormalizarClaveClinica(txt);
  if(!n) return false;
  const patologias = [
    'hipertension arterial','hta','infarto agudo de miocardio','iam','diabetes mellitus','dm','asma bronquial','gastritis','hipotiroidismo','obesidad','osteoporosis',
    'dislipidemia','anemia','migraña','migrana','epilepsia','cancer','cáncer','depresion','depresión','ansiedad','sop','sindrome ovario poliquistico',
    'endometriosis','mioma','miomas','covid persistente','enfermedad renal','enfermedad hepatica','enfermedad hepática','artritis','lupus'
  ];
  if(patologias.includes(n)) return true;
  return patologias.some(p => n.includes(p) || p.includes(n));
}

function auroLimpiarTituloClinico(txt){
  return String(txt || '')
    .replace(/^(patologicos?|patológicos?|patologico|patológico|alergias?|alergia|quirurgicos?|quirúrgicos?|cirugia|cirugía|medicamento|medicación|medicacion|tratamiento|tiempo|reaccion|reacción)\s*:\s*/i, '')
    .replace(/^(key|numero|número|dosis)\s*:\s*[^,;|]*/gi, '')
    .replace(/\b(key|numero|número|dosis)\s*:\s*[^,;|]*/gi, '')
    .replace(/,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[:\s,.-]+|[:\s,.-]+$/g, '')
    .trim();
}



/* IASYN FIX HTA - extrae patológicos desde texto compacto o JSON modular */
function auroExtraerFuentePatologicosPersonales(valor){
  const texto = String(valor || '').trim();
  if(!texto) return '';

  try{
    if(typeof AURO_ANT_PERSONALES_MARKER !== 'undefined' && texto.startsWith(AURO_ANT_PERSONALES_MARKER)){
      const data = JSON.parse(texto.substring(AURO_ANT_PERSONALES_MARKER.length));
      if(typeof data?.patologicos === 'string') return data.patologicos;
      if(Array.isArray(data?.patologicos)) return data.patologicos.map(auroPrevioTextoItemBasico).filter(Boolean).join('; ');
    }
  }catch(e){
    console.warn('IASYN: no se pudo leer patológicos personales desde JSON.', e);
  }

  return texto;
}

function auroExtraerPatologiasPipePremium(valor){
  const fuente = auroExtraerFuentePatologicosPersonales(valor);
  const items = [];
  const seen = new Set();

  let texto = String(fuente || '')
    .replace(/^patologicos?\s*:\s*/i, '')
    .replace(/^patológicos?\s*:\s*/i, '')
    .trim();

  if(!texto) return items;

  // Soporta formato compacto:
  // Hipertensión arterial (HTA) | 5 años | Losartán; Diabetes mellitus (DM) | 3 años
  // y también casos donde Google Sheets / el navegador elimina o rompe los separadores.
  texto = texto
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n+/g, '; ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const patologiasBase = [
    'Hipertensión arterial (HTA)',
    'Infarto agudo de miocardio (IAM)',
    'Diabetes mellitus (DM)',
    'Asma bronquial',
    'Gastritis',
    'Hipotiroidismo',
    'Obesidad',
    'Osteoporosis',
    'Otros'
  ];

  // Si falta punto y coma antes de una patología conocida, lo inserta para poder separar filas.
  patologiasBase.forEach(nombre => {
    const esc = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('([^;])\\s+(' + esc + '\\s*\\|)', 'gi');
    texto = texto.replace(re, '$1; $2');
  });

  texto
    .split(';')
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .forEach(row => {
      const partes = row.split('|').map(x => String(x || '').trim()).filter(Boolean);
      const titulo = auroLimpiarTituloClinico(partes[0] || '');

      if(!titulo) return;
      if(auroEsTokenTecnicoAntecedente(titulo)) return;
      if(auroEsCatalogoNoClinico(titulo)) return;

      const detallePartes = [];
      if(partes[1]){
        const tiempo = partes[1].replace(/^Tiempo:\s*/i, '').trim();
        if(tiempo) detallePartes.push('Tiempo: ' + tiempo);
      }

      const tratamiento = partes.slice(2).join(' | ').replace(/^(Medicación|Medicamento|Tratamiento):\s*/i, '').trim();
      if(tratamiento) detallePartes.push('Tratamiento: ' + tratamiento);

      const detalle = detallePartes.join(' · ');
      const key = auroNormalizarClaveClinica(titulo + ' ' + detalle);
      if(!key || seen.has(key)) return;
      seen.add(key);

      items.push({
        titulo: auroCapitalizarClinico(titulo),
        detalle
      });
    });

  return items;
}

function auroExtraerItemsAntecedentePremium(valor, tipo){
  if(tipo === 'patologia'){
    const directas = auroExtraerPatologiasPipePremium(valor);
    if(directas.length) return directas;
  }
  const tokens = auroTokenizarPrevioClinico(valor);
  const items = [];
  const seen = new Set();
  let last = -1;

  function add(titulo, detalle){
    titulo = auroLimpiarTituloClinico(titulo);
    detalle = auroLimpiarTituloClinico(detalle);
    if(!auroEsValorPrevioUtil(titulo)) return;
    if(auroEsTokenTecnicoAntecedente(titulo)) return;
    if(['patologicos','patológicos','patologico','patológico','vacunas','vacuna','habitos','hábitos','habito','hábito','actividad','actividad fisica','actividad física','estilo vida','estilo_vida'].includes(auroNormalizarClaveClinica(titulo))) return;
    if(tipo === 'patologia' && auroEsCatalogoNoClinico(titulo)) return;
    const key = auroNormalizarClaveClinica(titulo + ' ' + detalle);
    if(!key || seen.has(key)) return;
    seen.add(key);
    items.push({titulo: auroCapitalizarClinico(titulo), detalle});
    last = items.length - 1;
  }

  function append(detalle){
    detalle = auroLimpiarTituloClinico(detalle);
    if(!auroEsValorPrevioUtil(detalle) || last < 0 || !items[last]) return false;
    if(auroEsTokenTecnicoAntecedente(detalle)) return false;
    if(items[last].detalle && items[last].detalle.toLowerCase().includes(detalle.toLowerCase())) return true;
    items[last].detalle = items[last].detalle ? items[last].detalle + ' · ' + detalle : detalle;
    return true;
  }

  tokens.forEach(tok0 => {
    let tok = String(tok0 || '').trim();
    if(!tok) return;
    let m;

    if((m = tok.match(/^(patologicos?|patológicos?|patologico|patológico)\s*:\s*(.+)$/i))){
      if(tipo === 'patologia') add(m[2]);
      return;
    }
    if((m = tok.match(/^(tiempo)\s*:\s*(.+)$/i))){
      if(tipo === 'patologia') append('Tiempo: ' + m[2]);
      return;
    }
    if((m = tok.match(/^(medicamento|medicación|medicacion|tratamiento)\s*:\s*(.+)$/i))){
      if(['patologia','alergia','medicacion'].includes(tipo)) append('Tratamiento: ' + m[2]);
      return;
    }
    if((m = tok.match(/^(reaccion|reacción)\s*:\s*(.+)$/i))){
      if(tipo === 'alergia') append('Reacción: ' + m[2]);
      return;
    }

    if(auroEsTokenTecnicoAntecedente(tok)) return;

    if(tipo === 'patologia'){
      if(/^\d+\s*(años?|meses?|d[ií]as?)\b/i.test(tok)){ append('Tiempo: ' + tok); return; }
      if(auroEsPatologiaConocida(tok)){ add(tok); return; }
      if(last >= 0 && !auroEsCatalogoNoClinico(tok) && !auroEsPatologiaConocida(tok)){ append('Tratamiento: ' + tok); return; }
      return;
    }

    if(tipo === 'alergia'){
      if((m = tok.match(/^alergias?\s*:\s*(.+)$/i))){ add(m[1]); return; }
      if(!/^patolog|^vacuna|^habito|^actividad/i.test(tok)) add(tok);
      return;
    }

    if(tipo === 'quirurgico'){
      if((m = tok.match(/^(quirurgicos?|quirúrgicos?|cirugia|cirugía)\s*:\s*(.+)$/i))){ add(m[2]); return; }
      if(!/^patolog|^vacuna|^habito|^actividad/i.test(tok)) add(tok);
      return;
    }

    if(tipo === 'gineco'){
      if((m = tok.match(/^(fum|fur|fup|pap|gestas?|partos?|cesareas?|cesáreas?|abortos?|hijos vivos|hijos muertos|lactancia|ectopicos|ectópicos|otros)\s*:\s*(.+)$/i))){
        const label = auroCapitalizarClinico(m[1].replace(/_/g, ' '));
        add(label, m[2]);
      }
      return;
    }

    if(tipo === 'medicacion' || tipo === 'familiares' || tipo === 'general'){
      if(!/^patolog|^vacuna|^habito|^actividad/i.test(tok)) add(tok);
    }
  });

  return items.filter(x => auroEsValorPrevioUtil(x.titulo));
}

function auroExtraerVacunasRegistradas(valor){
  const tokens = auroTokenizarPrevioClinico(valor);
  const items = [];
  const seen = new Set();

  tokens.forEach(tok => {
    let m;
    let nombre = '';
    let detalle = '';
    const t = String(tok || '').trim();

    if(/^(key|numero|número|dosis)\s*:/i.test(t)) return;
    if(/^covid\s*:\s*dosis\s*:/i.test(t)) return;

    if((m = t.match(/^(biologico|biológico|vacunas?)\s*:\s*(.+)$/i))){
      const val = m[2].trim();
      const tieneEvidencia = /(aplicad[ao]|sí|si|fecha\s*:|marca\s*:|lote\s*:|refuerzo|completa|completo)/i.test(val);
      if(!tieneEvidencia) return;
      nombre = val
        .replace(/\b(aplicad[ao]|si|sí|positivo|completa|completo|refuerzo)\b/gi,'')
        .replace(/\b(fecha|marca|lote)\s*:\s*[^,;|]+/gi,'')
        .trim();
      detalle = (val.match(/(fecha\s*:\s*[^,;|]+|marca\s*:\s*[^,;|]+|lote\s*:\s*[^,;|]+)/i) || [''])[0];
    }

    if(!nombre) return;
    nombre = auroNombreVacunaClinica(nombre).replace(/^[:\s-]+|[:\s-]+$/g,'');
    if(!auroEsValorPrevioUtil(nombre) || auroEsTokenTecnicoAntecedente(nombre)) return;
    const key = auroNormalizarClaveClinica(nombre + detalle);
    if(seen.has(key)) return;
    seen.add(key);
    items.push({titulo:nombre, detalle});
  });

  return items;
}

function auroExtraerHabitosRegistrados(valor){
  const tokens = auroTokenizarPrevioClinico(valor);
  const items = [];
  const seen = new Set();

  tokens.forEach(t => {
    const m = String(t || '').trim().match(/^(habitos?|hábitos?|habito|hábito)\s*:\s*(.+)$/i);
    if(!m) return;
    const v = m[2].trim();
    const tieneRespuesta = /(sí|si|ocasional|frecuente|diario|semanal|mensual|actual|ex\s|exfumador|cantidad|tiempo|frecuencia|consumo|cigarr|copa|social|biomasa)/i.test(v);
    if(!tieneRespuesta) return;
    const limpio = auroLimpiarTituloClinico(v.replace(/^(key|numero|número|dosis)\s*:.*/i,''));
    if(!auroEsValorPrevioUtil(limpio) || auroEsTokenTecnicoAntecedente(limpio)) return;
    const key = auroNormalizarClaveClinica(limpio);
    if(seen.has(key)) return;
    seen.add(key);
    items.push({titulo: auroCapitalizarClinico(limpio), detalle:''});
  });

  return items;
}

function auroExtraerActividadRegistrada(valor){
  const tokens = auroTokenizarPrevioClinico(valor);
  const items = [];
  const seen = new Set();

  tokens.forEach(t => {
    const m = String(t || '').trim().match(/^(actividad(?:[_\s-]*fisica)?|actividad(?:[_\s-]*física)?|estilo[_\s-]*vida)\s*:\s*(.+)$/i);
    if(!m) return;
    const v = m[2].trim();
    const tieneRespuesta = /(sí|si|veces|semana|diario|min|hora|frecuencia|tiempo|realiza|habitual|ocasional)/i.test(v);
    if(!tieneRespuesta) return;
    const limpio = auroLimpiarTituloClinico(v.replace(/^(key|numero|número|dosis)\s*:.*/i,''));
    if(!auroEsValorPrevioUtil(limpio) || auroEsTokenTecnicoAntecedente(limpio)) return;
    const key = auroNormalizarClaveClinica(limpio);
    if(seen.has(key)) return;
    seen.add(key);
    items.push({titulo: auroCapitalizarClinico(limpio), detalle:''});
  });

  return items;
}

function auroIconoSeccionAntecedente(label){
  const n = auroNormalizarClaveClinica(label);
  if(n.includes('patolog')) return 'bi-heart-pulse';
  if(n.includes('quir')) return 'bi-scissors';
  if(n.includes('alerg')) return 'bi-exclamation-triangle';
  if(n.includes('vacuna')) return 'bi-shield-check';
  if(n.includes('habito')) return 'bi-person-lines-fill';
  if(n.includes('actividad')) return 'bi-activity';
  if(n.includes('gineco')) return 'bi-gender-female';
  if(n.includes('medicacion')) return 'bi-capsule-pill';
  if(n.includes('familia')) return 'bi-people';
  return 'bi-journal-medical';
}

function auroRenderDetallePremium(detalle){
  const raw = String(detalle || '').trim();
  if(!raw) return '';

  const partes = raw
    .split(/\s*·\s*/)
    .map(x => x.trim())
    .filter(Boolean);

  return partes.map(p => {
    let icon = 'bi-dot';
    let texto = p;

    if(/^Tiempo:/i.test(p)){
      icon = 'bi-hourglass-split';
      texto = p.replace(/^Tiempo:\s*/i, 'Evolución: ');
    }else if(/^(Tratamiento|Medicamento|Medicación):/i.test(p)){
      icon = 'bi-capsule-pill';
      texto = p.replace(/^(Tratamiento|Medicamento|Medicación):\s*/i, 'Tratamiento: ');
    }else if(/^(Fecha|Año):/i.test(p)){
      icon = 'bi-calendar-check';
    }else if(/^(Reacción|Reaccion):/i.test(p)){
      icon = 'bi-exclamation-circle';
    }

    return `<span class="auro-previos-detail-pill"><i class="bi ${icon}"></i>${auroEscapeHtml(texto)}</span>`;
  }).join('');
}

function auroRenderPrevioItemsPremium(label, items){
  items = (items || []).filter(x => x && auroEsValorPrevioUtil(x.titulo) && !auroEsTokenTecnicoAntecedente(x.titulo));
  if(!items.length) return '';

  const icono = auroIconoSeccionAntecedente(label);

  return `
    <div class="auro-previos-line auro-previos-compact">
      <span><i class="bi ${icono}"></i>${auroEscapeHtml(label)}</span>
      <div class="auro-previos-mini-table">
        ${items.map(it => `
          <div class="auro-previos-mini-row">
            <b>${auroEscapeHtml(it.titulo)}</b>
            ${it.detalle ? `<em>${auroRenderDetallePremium(it.detalle)}</em>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function auroRenderPrevioLineaLimpia(label, value){
  const items = auroExtraerItemsAntecedentePremium(value, 'general');
  return auroRenderPrevioItemsPremium(label, items);
}



function auroMostrarAntecedentesPrevios(h, modo){
  const box = auroAsegurarCajaAntecedentesPrevios();
  const content = document.getElementById('auroAntecedentesPreviosContent');
  if(!box || !content) return;

  if(!auroHistoriaTieneAntecedentes(h)){
    box.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  const fuentePersonales = h.antecedentes_personales || '';
  const fuentePatologicos = auroExtraerFuentePatologicosPersonales(fuentePersonales);
  let html = '';

  html += auroRenderPrevioItemsPremium('Patológicos personales', auroExtraerItemsAntecedentePremium(fuentePatologicos, 'patologia'));
  html += auroRenderPrevioItemsPremium('Quirúrgicos', auroExtraerItemsAntecedentePremium(h.antecedentes_quirurgicos || '', 'quirurgico'));
  html += auroRenderPrevioItemsPremium('Alergias', auroExtraerItemsAntecedentePremium(h.alergias || '', 'alergia'));
  html += auroRenderPrevioItemsPremium('Vacunas registradas', auroExtraerVacunasRegistradas(fuentePersonales));
  html += auroRenderPrevioItemsPremium('Hábitos registrados', auroExtraerHabitosRegistrados(fuentePersonales));
  html += auroRenderPrevioItemsPremium('Actividad física registrada', auroExtraerActividadRegistrada(fuentePersonales));
  html += auroRenderPrevioItemsPremium('Gineco-obstétricos', auroExtraerItemsAntecedentePremium(h.antecedentes_gineco_obstetricos || '', 'gineco'));
  html += auroRenderPrevioItemsPremium('Medicación actual', auroExtraerItemsAntecedentePremium(h.medicacion_actual || '', 'medicacion'));
  html += auroRenderPrevioItemsPremium('Familiares', auroExtraerItemsAntecedentePremium(h.antecedentes_familiares || '', 'familiares'));

  content.innerHTML = html;

  const estadoPrevio = box.dataset.estado || 'visible';

  if(estadoPrevio === 'oculto'){
    content.classList.add('auro-previos-collapsed');
  }else{
    content.classList.remove('auro-previos-collapsed');
  }

  const btn = box.querySelector('.auro-previos-hide');
  if(btn){
    btn.innerHTML = estadoPrevio === 'oculto'
      ? '<i class="bi bi-eye me-1"></i> Mostrar'
      : '<i class="bi bi-eye-slash me-1"></i> Ocultar';
  }

  box.dataset.idHistoriaOrigen = h.id_historia || '';
  box.dataset.modo = modo || '';
  box.style.display = content.innerHTML.trim() ? 'block' : 'none';
}


function auroCargarAntecedentesDesdeHistoria(h, modo){
  if(!h) return;

  setValueIfExists('hcAntecedentesPersonales', h.antecedentes_personales || '');
  cargarAntecedentesPersonalesCompletos(h.antecedentes_personales || '');

  setValueIfExists('hcAntecedentesQuirurgicos', h.antecedentes_quirurgicos || '');
  cargarAntecedentesQuirurgicosEstructurados(h.antecedentes_quirurgicos || '');

  cargarAntecedentesGinecoObstetricosCompletos(h.antecedentes_gineco_obstetricos || '');

  setValueIfExists('hcAntecedentesFamiliares', h.antecedentes_familiares || '');
  setValueIfExists('hcMedicacionActual', h.medicacion_actual || '');
  cargarAlergiasEstructuradas(h.alergias || '');

  auroMostrarAntecedentesPrevios(h, modo || 'lectura');
  updateClinicalSummary();

  if(typeof auroV21SincronizarEstadosAyudas === 'function'){
    setTimeout(auroV21SincronizarEstadosAyudas, 0);
  }
}

function auroCargarAntecedentesPreviosPaciente(idPaciente){
  if(editingHistoryId) return;
  const h = auroUltimaHistoriaConAntecedentes(idPaciente);
  if(!h){
    auroMostrarAntecedentesPrevios(null);
    return;
  }

  auroCargarAntecedentesDesdeHistoria(h, 'lectura-paciente');

  const box = document.getElementById('auroAntecedentesPreviosBox');
  if(box){
    const nota = box.querySelector('.auro-previos-head small');
    if(nota){
      nota.textContent = 'Leído desde la última historia del paciente. Para modificarlo, use Buscar / editar historias.';
    }
  }
}

function auroValorAntecedenteVacio(valor){
  return !String(valor || '').trim();
}

function auroPreservarAntecedenteSiVacio(data, campo, historiaPrevia){
  if(!data || !campo || !historiaPrevia) return;
  const nuevo = data[campo];
  const previo = historiaPrevia[campo];

  if(auroValorAntecedenteVacio(nuevo) && !auroValorAntecedenteVacio(previo)){
    data[campo] = previo;
  }
}

function auroHistoriaActualEdicion(){
  if(!editingHistoryId) return null;
  return (historiasClinicas || []).find((h, idx) =>
    String(h.id_historia || h.id || idx) === String(editingHistoryId)
  ) || null;
}

function auroAplicarProteccionAntecedentesEdicion(data){
  const h = auroHistoriaActualEdicion();
  if(!h) return data;

  [
    'antecedentes_personales',
    'antecedentes_quirurgicos',
    'antecedentes_gineco_obstetricos',
    'antecedentes_familiares',
    'medicacion_actual',
    'alergias'
  ].forEach(campo => auroPreservarAntecedenteSiVacio(data, campo, h));

  return data;
}


function seleccionarPacienteHistoria(){
  const select = document.getElementById('hcPacienteSelect');
  const paciente = patients.find(p => p.id_paciente === select.value);
  activePatientId = select.value || activePatientId;

  if(!paciente){
    ['hcCedula','hcNacimiento','hcEdad','hcSexo','hcEstadoCivil','hcOcupacion','hcTelefono','hcCorreo','hcDireccion','hcSeguro','hcContactoEmergencia'].forEach(id => setValueIfExists(id,''));
    auroMostrarAntecedentesPrevios(null);
    auroMostrarExamenFisicoPrevio(null);
    auroMostrarDiagnosticosPrevios(null);
    updateClinicalSummary();
    renderModulePatientCards();
    return;
  }

  const fechaNacimiento = normalizarFechaInput(paciente.fecha_nacimiento);
  setValueIfExists('hcCedula', paciente.cedula);
  setValueIfExists('hcNacimiento', fechaNacimiento);
  setValueIfExists('hcEdad', paciente.edad || calcularEdadDesdeFecha(fechaNacimiento));
  setValueIfExists('hcSexo', paciente.sexo);
  setValueIfExists('hcEstadoCivil', paciente.estado_civil);
  setValueIfExists('hcOcupacion', paciente.ocupacion);
  setValueIfExists('hcTelefono', paciente.telefono);
  setValueIfExists('hcCorreo', paciente.email);
  setValueIfExists('hcDireccion', paciente.direccion);
  setValueIfExists('hcSeguro', paciente.aseguradora);
  setValueIfExists('hcContactoEmergencia', [paciente.contacto_emergencia || '', paciente.telefono_emergencia || ''].filter(Boolean).join(' - '));

  if(paciente.alergias && document.getElementById('hcAlergias') && !document.getElementById('hcAlergias').value){
    cargarAlergiasEstructuradas(paciente.alergias);
  }

  // v2.2: al seleccionar paciente, leer antecedentes ya guardados en historias_clinicas.
  // No entra en modo edición automáticamente; solo muestra la información previa para referencia segura.
  auroCargarAntecedentesPreviosPaciente(paciente.id_paciente);
  auroCargarExamenFisicoPrevioPaciente(paciente.id_paciente);

  updateClinicalSummary();
  renderModulePatientCards();
}


function recopilarAntecedentesPersonalesEstructurados(){
  const filas = [];
  document.querySelectorAll('.hcPatologicoCheck').forEach(chk => {
    const patologia = chk.dataset.patologia || '';
    const tiempo = document.querySelector(`.hcPatologicoTiempo[data-patologia="${CSS.escape(patologia)}"]`)?.value?.trim() || '';
    const medicamento = document.querySelector(`.hcPatologicoMedicamento[data-patologia="${CSS.escape(patologia)}"]`)?.value?.trim() || '';

    if(chk.checked || tiempo || medicamento){
      filas.push([patologia, tiempo, medicamento].filter(Boolean).join(' | '));
    }
  });

  const valor = filas.join('; ');
  const hidden = document.getElementById('hcAntecedentesPersonales');
  if(hidden) hidden.value = valor;
  return valor;
}

function limpiarAntecedentesPersonalesEstructurados(){
  document.querySelectorAll('.hcPatologicoCheck').forEach(chk => chk.checked = false);
  document.querySelectorAll('.hcPatologicoTiempo,.hcPatologicoMedicamento').forEach(input => input.value = '');
  setValueIfExists('hcAntecedentesPersonales','');
}

function cargarAntecedentesPersonalesEstructurados(valor){
  limpiarAntecedentesPersonalesEstructurados();
  const texto = String(valor || '').trim();
  const panel = document.getElementById('hc_antecedentes');

  if(panel) delete panel.dataset.auroNiegaPatologicos;

  if(!texto){
    if(typeof auroV21SincronizarEstadosAyudas === 'function') auroV21SincronizarEstadosAyudas();
    return;
  }

  setValueIfExists('hcAntecedentesPersonales', texto);

  if(/^Niega antecedentes patológicos personales relevantes\.?$/i.test(texto)){
    if(panel) panel.dataset.auroNiegaPatologicos = '1';
    if(typeof auroV21SincronizarEstadosAyudas === 'function') auroV21SincronizarEstadosAyudas();
    return;
  }

  texto.split(';').map(x => x.trim()).filter(Boolean).forEach(item => {
    const partes = item.split('|').map(x => x.trim());
    const patologia = partes[0] || '';
    const tiempo = (partes[1] || '').replace(/^Tiempo:\s*/i,'').trim();
    const medicamento = partes.slice(2).join(' | ').replace(/^Medicación:\s*/i,'').trim() || '';

    const chk = auroBuscarControlPorData('.hcPatologicoCheck', 'patologia', patologia);
    if(!chk) return;

    const patologiaReal = chk.dataset.patologia || patologia;
    chk.checked = true;
    const tiempoInput = document.querySelector(`.hcPatologicoTiempo[data-patologia="${CSS.escape(patologiaReal)}"]`);
    const medicamentoInput = document.querySelector(`.hcPatologicoMedicamento[data-patologia="${CSS.escape(patologiaReal)}"]`);

    if(tiempoInput) tiempoInput.value = tiempo;
    if(medicamentoInput) medicamentoInput.value = medicamento;
  });
}

function recopilarAntecedentesQuirurgicosEstructurados(){
  const filas = [];
  document.querySelectorAll('.hcQuirurgicoCheck').forEach(chk => {
    const cirugiaBase = chk.dataset.cirugia || '';
    const fecha = document.querySelector(`.hcQuirurgicoFecha[data-cirugia="${CSS.escape(cirugiaBase)}"]`)?.value?.trim() || '';
    let cirugia = cirugiaBase;

    if(cirugiaBase === 'Otros'){
      const otroNombre = document.querySelector('.hcQuirurgicoOtroNombre')?.value?.trim() || '';
      if(otroNombre) cirugia = 'Otros: ' + otroNombre;
    }

    if(chk.checked || fecha || (cirugiaBase === 'Otros' && cirugia !== 'Otros')){
      filas.push([cirugia, fecha].filter(Boolean).join(' | '));
    }
  });

  const valor = filas.join('; ');
  const hidden = document.getElementById('hcAntecedentesQuirurgicos');
  if(hidden) hidden.value = valor;
  return valor;
}

function limpiarAntecedentesQuirurgicosEstructurados(){
  document.querySelectorAll('.hcQuirurgicoCheck').forEach(chk => chk.checked = false);
  document.querySelectorAll('.hcQuirurgicoFecha').forEach(input => input.value = '');
  const otro = document.querySelector('.hcQuirurgicoOtroNombre');
  if(otro) otro.value = '';
  setValueIfExists('hcAntecedentesQuirurgicos','');
}

function cargarAntecedentesQuirurgicosEstructurados(valor){
  limpiarAntecedentesQuirurgicosEstructurados();
  const texto = String(valor || '').trim();
  const panel = document.getElementById('hc_antecedentes');

  if(panel) delete panel.dataset.auroNiegaQuirurgicos;

  if(!texto){
    if(typeof auroV21SincronizarEstadosAyudas === 'function') auroV21SincronizarEstadosAyudas();
    return;
  }

  setValueIfExists('hcAntecedentesQuirurgicos', texto);

  if(/^Niega antecedentes quirúrgicos\.?$/i.test(texto)){
    if(panel) panel.dataset.auroNiegaQuirurgicos = '1';
    if(typeof auroV21SincronizarEstadosAyudas === 'function') auroV21SincronizarEstadosAyudas();
    return;
  }

  texto.split(';').map(x => x.trim()).filter(Boolean).forEach(item => {
    const partes = item.split('|').map(x => x.trim());
    const cirugiaTexto = partes[0] || '';
    const fecha = (partes[1] || '').replace(/^Fecha:\s*/i,'').replace(/^Año:\s*/i,'').trim();
    let cirugiaBase = cirugiaTexto;

    if(cirugiaTexto.startsWith('Otros:')){
      cirugiaBase = 'Otros';
      const otro = document.querySelector('.hcQuirurgicoOtroNombre');
      if(otro) otro.value = cirugiaTexto.replace(/^Otros:\s*/,'').trim();
    }

    const chk = auroBuscarControlPorData('.hcQuirurgicoCheck', 'cirugia', cirugiaBase);
    if(!chk) return;

    const cirugiaReal = chk.dataset.cirugia || cirugiaBase;
    chk.checked = true;
    const fechaInput = document.querySelector(`.hcQuirurgicoFecha[data-cirugia="${CSS.escape(cirugiaReal)}"]`);
    if(fechaInput) fechaInput.value = fecha;
  });
}


function recopilarAlergiasEstructuradas(){
  const filas = [];
  document.querySelectorAll('.hcAlergiaCheck').forEach(chk => {
    const alergia = chk.dataset.alergia || '';
    const detalle = document.querySelector(`.hcAlergiaDetalle[data-alergia="${CSS.escape(alergia)}"]`)?.value?.trim() || '';

    if(chk.checked || detalle){
      filas.push([alergia, detalle].filter(Boolean).join(' | '));
    }
  });

  const valor = filas.join('; ');
  const hidden = document.getElementById('hcAlergias');
  if(hidden) hidden.value = valor;
  return valor;
}

function actualizarAlergiasEstructuradas(){
  recopilarAlergiasEstructuradas();
  updateClinicalSummary();
}

function limpiarAlergiasEstructuradas(){
  document.querySelectorAll('.hcAlergiaCheck').forEach(chk => chk.checked = false);
  document.querySelectorAll('.hcAlergiaDetalle').forEach(input => input.value = '');
  setValueIfExists('hcAlergias','');
  updateClinicalSummary();
}

function cargarAlergiasEstructuradas(valor){
  limpiarAlergiasEstructuradas();
  const texto = String(valor || '').trim();
  const panel = document.getElementById('hc_antecedentes');

  if(panel) delete panel.dataset.auroNiegaAlergias;

  if(!texto){
    if(typeof auroV21SincronizarEstadosAyudas === 'function') auroV21SincronizarEstadosAyudas();
    return;
  }

  setValueIfExists('hcAlergias', texto);

  if(/^Niega alergias conocidas\.?$/i.test(texto)){
    if(panel) panel.dataset.auroNiegaAlergias = '1';
    if(document.getElementById('hcAlergiasResumen')) document.getElementById('hcAlergiasResumen').textContent = 'Niega alergias conocidas';
    if(typeof auroV21SincronizarEstadosAyudas === 'function') auroV21SincronizarEstadosAyudas();
    return;
  }

  texto.split(';').map(x => x.trim()).filter(Boolean).forEach(item => {
    const partes = item.split('|').map(x => x.trim());
    const alergia = partes[0] || '';
    const detalle = partes.slice(1).join(' | ').replace(/^Reacción:\s*/i,'').trim() || '';

    const chk = auroBuscarControlPorData('.hcAlergiaCheck', 'alergia', alergia);
    if(!chk) return;

    const alergiaReal = chk.dataset.alergia || alergia;
    chk.checked = true;
    const detalleInput = document.querySelector(`.hcAlergiaDetalle[data-alergia="${CSS.escape(alergiaReal)}"]`);
    if(detalleInput) detalleInput.value = detalle;
  });

  updateClinicalSummary();
}


/* ==========================================================
   IASYN - CONEXIÓN COMPLETA MÓDULO ANTECEDENTES
   No destructivo: usa columnas existentes de historias_clinicas.
   ========================================================== */

/*
  COMPATIBILIDAD DE DATOS HISTÓRICOS IASYN:
  Los valores literales AUROSANAX_ANT_* se conservan únicamente como marcadores
  de serialización para leer y actualizar historias ya existentes en IASYN.
  No son URLs, endpoints, IDs de Google Sheets/Drive ni conexiones a AUROSANAX PRUEBA.
  No renombrarlos hasta migrar conjuntamente el comparador del index y los datos históricos.
*/
const AURO_ANT_PERSONALES_MARKER = 'AUROSANAX_ANT_PERSONALES_V1::';
const AURO_ANT_GINECO_OBS_MARKER = 'AUROSANAX_ANT_GINECO_OBS_V1::';

function auroGet(id){
  return document.getElementById(id)?.value?.trim() || '';
}

function auroSet(id, value){
  setValueIfExists(id, value || '');
}

function auroGetCheck(id){
  return !!document.getElementById(id)?.checked;
}

function auroSetCheck(id, value){
  const el = document.getElementById(id);
  if(el) el.checked = !!value;
}

function auroGetRadio(name){
  return document.querySelector(`input[name="${CSS.escape(name)}"]:checked`)?.value || '';
}

function auroSetRadio(name, value){
  document.querySelectorAll(`input[name="${CSS.escape(name)}"]`).forEach(r => {
    r.checked = String(r.value || '') === String(value || '');
  });
}

function auroTieneValor(valor){
  if(valor === null || valor === undefined) return false;
  if(typeof valor === 'boolean') return valor;
  if(typeof valor === 'number') return true;
  if(typeof valor === 'string') return valor.trim() !== '';
  if(Array.isArray(valor)) return valor.some(auroTieneValor);
  if(typeof valor === 'object') return Object.values(valor).some(auroTieneValor);
  return false;
}

function auroCompactarObjeto(obj){
  if(Array.isArray(obj)){
    return obj.map(auroCompactarObjeto).filter(auroTieneValor);
  }
  if(obj && typeof obj === 'object'){
    const limpio = {};
    Object.keys(obj).forEach(k => {
      const v = auroCompactarObjeto(obj[k]);
      if(auroTieneValor(v)) limpio[k] = v;
    });
    return limpio;
  }
  return obj;
}

function auroSerializar(marker, obj){
  const limpio = auroCompactarObjeto(obj || {});
  if(!auroTieneValor(limpio)) return '';
  return marker + JSON.stringify(limpio);
}

function auroParsear(marker, valor){
  const texto = String(valor || '').trim();
  if(!texto.startsWith(marker)) return null;
  try{
    return JSON.parse(texto.substring(marker.length));
  }catch(error){
    console.warn('No se pudo parsear antecedente IASYN:', error);
    return null;
  }
}

function recopilarAntecedenteCovidEstructurado(){
  return auroCompactarObjeto({
    presento: auroGet('hcCovidPresento'),
    observacion_presento: auroGet('hcCovidObservacionPresento'),
    fecha: auroGet('hcCovidFecha'),
    anio_referencia: auroGet('hcCovidAnioReferencia'),
    clasificacion: auroGet('hcCovidClasificacion'),
    detalle_clasificacion: auroGet('hcCovidDetalleClasificacion'),
    hospitalizacion: auroGet('hcCovidHospitalizacion'),
    tiempo_hospitalizado: auroGet('hcCovidTiempoHospitalizado'),
    vacunado: auroGet('hcCovidVacunado'),
    vacuna_tipo: auroGet('hcCovidVacunaTipo'),
    dosis: [
      { numero: '1', fecha: auroGet('hcCovidDosis1'), detalle: auroGet('hcCovidDosis1Detalle') },
      { numero: '2', fecha: auroGet('hcCovidDosis2'), detalle: auroGet('hcCovidDosis2Detalle') },
      { numero: '3', fecha: auroGet('hcCovidDosis3'), detalle: auroGet('hcCovidDosis3Detalle') },
      { numero: '4', fecha: auroGet('hcCovidDosis4'), detalle: auroGet('hcCovidDosis4Detalle') }
    ],
    observaciones: auroGet('hcCovidObservaciones')
  });
}

function cargarAntecedenteCovidEstructurado(data){
  const d = data || {};
  auroSet('hcCovidPresento', d.presento);
  auroSet('hcCovidObservacionPresento', d.observacion_presento);
  auroSet('hcCovidFecha', d.fecha);
  auroSet('hcCovidAnioReferencia', d.anio_referencia);
  auroSet('hcCovidClasificacion', d.clasificacion);
  auroSet('hcCovidDetalleClasificacion', d.detalle_clasificacion);
  auroSet('hcCovidHospitalizacion', d.hospitalizacion);
  auroSet('hcCovidTiempoHospitalizado', d.tiempo_hospitalizado);
  auroSet('hcCovidVacunado', d.vacunado);
  auroSet('hcCovidVacunaTipo', d.vacuna_tipo);
  (d.dosis || []).forEach(item => {
    const n = item.numero || '';
    auroSet('hcCovidDosis' + n, item.fecha);
    auroSet('hcCovidDosis' + n + 'Detalle', item.detalle);
  });
  auroSet('hcCovidObservaciones', d.observaciones);
}

function recopilarVacunasEstructuradas(){
  const vacunas = [
    { key:'Covid', biologico:'COVID-19', dosis:4 },
    { key:'Hpv', biologico:'Virus Papiloma Humano (HPV)', dosis:3 },
    { key:'HepB', biologico:'Hepatitis B', dosis:3 },
    { key:'Influenza', biologico:'Influenza', dosis:2 },
    { key:'Tdpa', biologico:'Td/Tdap', dosis:2 },
    { key:'Neumococo', biologico:'Neumococo', dosis:2 },
    { key:'Srp', biologico:'SRP', dosis:2 },
    { key:'Varicela', biologico:'Varicela', dosis:2 },
    { key:'FiebreAmarilla', biologico:'Fiebre amarilla', dosis:1 }
  ];

  return vacunas.map(v => {
    const dosis = [];
    for(let i = 1; i <= v.dosis; i++){
      dosis.push({
        numero: String(i),
        programada: auroGet('hcVac' + v.key + 'Prog' + i),
        administracion: auroGet('hcVac' + v.key + 'Adm' + i),
        aplicada: auroGetCheck('hcVac' + v.key + 'Apl' + i),
        observacion: auroGet('hcVac' + v.key + 'Obs' + i)
      });
    }
    return auroCompactarObjeto({
      key: v.key,
      biologico: v.biologico,
      nombre_comercial: auroGet('hcVac' + v.key + 'Nombre'),
      dosis: dosis
    });
  }).filter(auroTieneValor);
}

function cargarVacunasEstructuradas(lista){
  (lista || []).forEach(v => {
    const key = v.key || '';
    if(!key) return;
    auroSet('hcVac' + key + 'Nombre', v.nombre_comercial);
    (v.dosis || []).forEach(d => {
      const n = d.numero || '';
      auroSet('hcVac' + key + 'Prog' + n, d.programada);
      auroSet('hcVac' + key + 'Adm' + n, d.administracion);
      auroSetCheck('hcVac' + key + 'Apl' + n, d.aplicada);
      auroSet('hcVac' + key + 'Obs' + n, d.observacion);
    });
  });
}

function recopilarHabitosEstructurados(){
  const habitos = [
    { key:'Tabaco', nombre:'Tabaco' },
    { key:'Alcohol', nombre:'Alcohol' },
    { key:'Drogas', nombre:'Drogas' },
    { key:'Cafe', nombre:'Café' },
    { key:'Biomasa', nombre:'Biomasa' }
  ];

  return habitos.map(h => auroCompactarObjeto({
    habito: h.nombre,
    actual: auroGetRadio('hcHabito' + h.key + 'Ex'),
    tiempo: auroGet('hcHabito' + h.key + 'Tiempo'),
    abstinencia: auroGet('hcHabito' + h.key + 'Abstinencia')
  })).filter(auroTieneValor);
}

function cargarHabitosEstructurados(lista){
  (lista || []).forEach(h => {
    const mapa = { 'Tabaco':'Tabaco', 'Alcohol':'Alcohol', 'Drogas':'Drogas', 'Café':'Cafe', 'Cafe':'Cafe', 'Biomasa':'Biomasa' };
    const key = mapa[h.habito] || h.key || '';
    if(!key) return;
    auroSetRadio('hcHabito' + key + 'Ex', h.actual);
    auroSet('hcHabito' + key + 'Tiempo', h.tiempo);
    auroSet('hcHabito' + key + 'Abstinencia', h.abstinencia);
  });
}

function recopilarEstiloVidaEstructurado(){
  const actividades = [
    { key:'Correr', actividad:'Correr' },
    { key:'Caminar', actividad:'Caminar' },
    { key:'Nadar', actividad:'Nadar' },
    { key:'Ciclismo', actividad:'Ciclismo' },
    { key:'Otro', actividad: auroGet('hcEstiloOtroDescripcion') || 'Otros' }
  ];

  return actividades.map(a => auroCompactarObjeto({
    key: a.key,
    actividad: a.actividad,
    distancia_km: auroGet('hcEstilo' + a.key + 'Distancia'),
    frecuencia_dia: auroGet('hcEstilo' + a.key + 'Frecuencia'),
    tiempo_horas: auroGet('hcEstilo' + a.key + 'Tiempo')
  })).filter(auroTieneValor);
}

function cargarEstiloVidaEstructurado(lista){
  (lista || []).forEach(a => {
    const key = a.key || '';
    if(!key) return;
    if(key === 'Otro') auroSet('hcEstiloOtroDescripcion', a.actividad && a.actividad !== 'Otros' ? a.actividad : '');
    auroSet('hcEstilo' + key + 'Distancia', a.distancia_km);
    auroSet('hcEstilo' + key + 'Frecuencia', a.frecuencia_dia);
    auroSet('hcEstilo' + key + 'Tiempo', a.tiempo_horas);
  });
}

function recopilarAlimentacionEstructurada(){
  return auroCompactarObjeto({
    agua_diaria_litros: auroGet('hcAlimentacionAguaDiaria'),
    comidas_dia: auroGet('hcAlimentacionComidasDia'),
    frutas_verduras: auroGet('hcAlimentacionFrutasVerduras'),
    comida_rapida: auroGet('hcAlimentacionComidaRapida'),
    azucar: auroGet('hcAlimentacionAzucar'),
    sal: auroGet('hcAlimentacionSal'),
    suplementos: auroGet('hcAlimentacionSuplementos'),
    detalle: auroGet('hcAlimentacion')
  });
}

function cargarAlimentacionEstructurada(data){
  const d = data || {};
  auroSet('hcAlimentacionAguaDiaria', d.agua_diaria_litros);
  auroSet('hcAlimentacionComidasDia', d.comidas_dia);
  auroSet('hcAlimentacionFrutasVerduras', d.frutas_verduras);
  auroSet('hcAlimentacionComidaRapida', d.comida_rapida);
  auroSet('hcAlimentacionAzucar', d.azucar);
  auroSet('hcAlimentacionSal', d.sal);
  auroSet('hcAlimentacionSuplementos', d.suplementos);
  auroSet('hcAlimentacion', d.detalle);
}

function recopilarAntecedentesObstetricosEstructurados(){
  const campos = [
    { key:'Pap', descripcion:'Fecha del último Papanicolaou (PAP)', detalle:'Fecha' },
    { key:'Fum', descripcion:'Fecha de la última menstruación (FUM)', detalle:'Fecha' },
    { key:'Fup', descripcion:'Fecha del último parto (FUP)', detalle:'Fecha' },
    { key:'Gesta', descripcion:'Gesta #', detalle:'Detalle' },
    { key:'Partos', descripcion:'Partos #', detalle:'Detalle' },
    { key:'Cesareas', descripcion:'Cesáreas #', detalle:'Detalle' },
    { key:'Abortos', descripcion:'Abortos #', detalle:'Detalle' },
    { key:'HijosVivos', descripcion:'Hijos vivos #', detalle:'Detalle' },
    { key:'HijosMuertos', descripcion:'Hijos muertos #', detalle:'Detalle' },
    { key:'Lactancia', descripcion:'Lactancia', detalle:'Detalle' },
    { key:'Ectopicos', descripcion:'Ectópicos #', detalle:'Detalle' },
    { key:'Otros', descripcion:'Otros', detalle:'Detalle' }
  ];

  return campos.map(c => {
    const detalleId = c.key === 'Pap' || c.key === 'Fum' || c.key === 'Fup'
      ? 'hcObs' + c.key + 'Fecha'
      : 'hcObs' + c.key + 'Detalle';
    return auroCompactarObjeto({
      key: c.key,
      descripcion: c.descripcion,
      detalle: auroGet(detalleId),
      no_aplica: auroGetCheck('hcObs' + c.key + 'NoAplica'),
      resultado: auroGet('hcObs' + c.key + 'Resultado')
    });
  }).filter(auroTieneValor);
}

function cargarAntecedentesObstetricosEstructurados(lista){
  (lista || []).forEach(c => {
    const key = c.key || '';
    if(!key) return;
    const detalleId = key === 'Pap' || key === 'Fum' || key === 'Fup'
      ? 'hcObs' + key + 'Fecha'
      : 'hcObs' + key + 'Detalle';
    auroSet(detalleId, c.detalle);
    auroSetCheck('hcObs' + key + 'NoAplica', c.no_aplica);
    auroSet('hcObs' + key + 'Resultado', c.resultado);
  });
}

function recopilarAntecedentesGinecologicosEstructurados(){
  return auroCompactarObjeto({
    menarquia: { detalle: auroGet('hcGinMenarquia'), resultado: auroGet('hcGinMenarquiaResultado') },
    menacme: { detalle: auroGet('hcGinMenacme'), resultado: auroGet('hcGinMenacmeResultado') },
    menopausia: { detalle: auroGet('hcGinMenopausia'), resultado: auroGet('hcGinMenopausiaResultado') },
    vida_sexual_activa: { detalle: auroGetRadio('hcGinVidaSexualActiva'), resultado: auroGet('hcGinVidaSexualResultado') },
    planificacion_familiar: { detalle: auroGet('hcGinPlanificacionFamiliar'), resultado: auroGet('hcGinPlanificacionResultado') },
    terapia_hormonal: { detalle: auroGet('hcGinTerapiaHormonal'), resultado: auroGet('hcGinTerapiaResultado') },
    infecciones_vulvovaginales: { detalle: auroGet('hcGinInfeccionesVulvovaginales'), resultado: auroGet('hcGinInfeccionesResultado') },
    ets: { detalle: auroGet('hcGinETS'), resultado: auroGet('hcGinETSResultado') },
    mamografia: { fecha: auroGet('hcGinMamografiaFecha'), resultado: auroGet('hcGinMamografiaResultado') },
    eco_mamario: { fecha: auroGet('hcGinEcoMamarioFecha'), resultado: auroGet('hcGinEcoMamarioResultado') },
    densitometria_osea: { fecha: auroGet('hcGinDensitometriaFecha'), resultado: auroGet('hcGinDensitometriaResultado') },
    // Compatibilidad anti-regresión:
    // - "estado" se conserva como dato histórico oculto para historias ya existentes.
    // - Las nuevas capturas usan Fecha + Resultado / observación.
    pap: { fecha: auroGet('hcGinPapFecha'), estado: auroGet('hcGinPapEstado'), resultado: auroGet('hcGinPapResultado') },
    colposcopia: { fecha: auroGet('hcGinColposcopiaFecha'), estado: auroGet('hcGinColposcopiaEstado'), resultado: auroGet('hcGinColposcopiaResultado') },
    biopsia: { fecha: auroGet('hcGinBiopsiaFecha'), resultado: auroGet('hcGinBiopsiaResultado') },
    otros: { fecha: auroGet('hcGinOtrosFecha'), resultado: auroGet('hcGinOtrosResultado') }
  });
}

function cargarAntecedentesGinecologicosEstructurados(data){
  const d = data || {};
  auroSet('hcGinMenarquia', d.menarquia?.detalle);
  auroSet('hcGinMenarquiaResultado', d.menarquia?.resultado);
  auroSet('hcGinMenacme', d.menacme?.detalle);
  auroSet('hcGinMenacmeResultado', d.menacme?.resultado);
  auroSet('hcGinMenopausia', d.menopausia?.detalle);
  auroSet('hcGinMenopausiaResultado', d.menopausia?.resultado);
  auroSetRadio('hcGinVidaSexualActiva', d.vida_sexual_activa?.detalle);
  auroSet('hcGinVidaSexualResultado', d.vida_sexual_activa?.resultado);
  auroSet('hcGinPlanificacionFamiliar', d.planificacion_familiar?.detalle);
  auroSet('hcGinPlanificacionResultado', d.planificacion_familiar?.resultado);
  auroSet('hcGinTerapiaHormonal', d.terapia_hormonal?.detalle);
  auroSet('hcGinTerapiaResultado', d.terapia_hormonal?.resultado);
  auroSet('hcGinInfeccionesVulvovaginales', d.infecciones_vulvovaginales?.detalle);
  auroSet('hcGinInfeccionesResultado', d.infecciones_vulvovaginales?.resultado);
  auroSet('hcGinETS', d.ets?.detalle);
  auroSet('hcGinETSResultado', d.ets?.resultado);
  auroSet('hcGinMamografiaFecha', d.mamografia?.fecha);
  auroSet('hcGinMamografiaResultado', d.mamografia?.resultado);
  auroSet('hcGinEcoMamarioFecha', d.eco_mamario?.fecha);
  auroSet('hcGinEcoMamarioResultado', d.eco_mamario?.resultado);
  auroSet('hcGinDensitometriaFecha', d.densitometria_osea?.fecha);
  auroSet('hcGinDensitometriaResultado', d.densitometria_osea?.resultado);
  auroSet('hcGinPapFecha', d.pap?.fecha);
  // Conserva el estado histórico aunque ya no se muestre como selector.
  auroSet('hcGinPapEstado', d.pap?.estado);
  auroSet('hcGinPapResultado', d.pap?.resultado);
  auroSet('hcGinColposcopiaFecha', d.colposcopia?.fecha);
  // Conserva el estado histórico aunque ya no se muestre como selector.
  auroSet('hcGinColposcopiaEstado', d.colposcopia?.estado);
  auroSet('hcGinColposcopiaResultado', d.colposcopia?.resultado);
  auroSet('hcGinBiopsiaFecha', d.biopsia?.fecha);
  auroSet('hcGinBiopsiaResultado', d.biopsia?.resultado);
  auroSet('hcGinOtrosFecha', d.otros?.fecha);
  auroSet('hcGinOtrosResultado', d.otros?.resultado);
}

function recopilarAntecedentesPersonalesCompletos(){
  const patologicos = recopilarAntecedentesPersonalesEstructurados();

  const data = {
    patologicos: patologicos,
    covid: recopilarAntecedenteCovidEstructurado(),
    vacunas: recopilarVacunasEstructuradas(),
    habitos: recopilarHabitosEstructurados(),
    estilo_vida: recopilarEstiloVidaEstructurado(),
    alimentacion: recopilarAlimentacionEstructurada()
  };

  return auroSerializar(AURO_ANT_PERSONALES_MARKER, data) || patologicos;
}

function cargarAntecedentesPersonalesCompletos(valor){
  const data = auroParsear(AURO_ANT_PERSONALES_MARKER, valor);

  if(!data){
    cargarAntecedentesPersonalesEstructurados(valor || '');
    return;
  }

  cargarAntecedentesPersonalesEstructurados(data.patologicos || '');
  cargarAntecedenteCovidEstructurado(data.covid || {});
  cargarVacunasEstructuradas(data.vacunas || []);
  cargarHabitosEstructurados(data.habitos || []);
  cargarEstiloVidaEstructurado(data.estilo_vida || []);
  cargarAlimentacionEstructurada(data.alimentacion || {});
}

function recopilarAntecedentesGinecoObstetricosCompletos(){
  const data = {
    obstetricos: recopilarAntecedentesObstetricosEstructurados(),
    ginecologicos: recopilarAntecedentesGinecologicosEstructurados()
  };

  return auroSerializar(AURO_ANT_GINECO_OBS_MARKER, data) || getValueIfExists('hcRevisionSistemas');
}

function cargarAntecedentesGinecoObstetricosCompletos(valor){
  const data = auroParsear(AURO_ANT_GINECO_OBS_MARKER, valor);

  if(!data){
    // Compatibilidad v2.2: si viene texto antiguo desde Google Sheets,
    // se conserva visible sin intentar convertirlo a campos nuevos.
    setValueIfExists('hcRevisionSistemas', valor || '');
    return;
  }

  cargarAntecedentesObstetricosEstructurados(data.obstetricos || []);
  cargarAntecedentesGinecologicosEstructurados(data.ginecologicos || {});
}

function auroResumenAlergiasClinico(valor){
  const texto = String(valor || '').trim();
  if(!texto) return 'No registrado';

  if(/^Niega alergias conocidas\.?$/i.test(texto)){
    return 'Niega alergias conocidas';
  }

  const items = texto
    .split(';')
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .filter(x => !/^Niega alergias conocidas\.?$/i.test(x))
    .map(x => {
      const partes = x.split('|').map(v => String(v || '').trim()).filter(Boolean);
      return {
        alergia: partes[0] || '',
        detalle: partes.slice(1).join(' | ')
      };
    })
    .filter(x => x.alergia);

  if(!items.length) return 'No registrado';

  if(items.length === 1){
    return 'Refiere: ' + items[0].alergia;
  }

  return 'Refiere ' + items.length + ' alergias';
}

window.auroResumenAlergiasClinico = auroResumenAlergiasClinico;


function actualizarResumenAntecedentesCompletos(){
  const alergias = recopilarAlergiasEstructuradas();
  if(document.getElementById('hcAlergiasResumen')){
    document.getElementById('hcAlergiasResumen').textContent = auroResumenAlergiasClinico(alergias);
  }
  updateClinicalSummary();
}



/* ==========================================================
   IASYN - ANTECEDENTES v2.1
   Ayudas clínicas de llenado rápido sin cambiar estructura.
   No modifica Code.gs ni columnas. Todo sigue guardando en
   las columnas existentes de historias_clinicas.
   ========================================================== */

const AURO_ANT_V21 = {
  patologiasMedicamentos: {
    'Hipertensión arterial (HTA)': ['Losartán 50 mg', 'Enalapril 10 mg', 'Amlodipino 5 mg', 'Hidroclorotiazida 25 mg', 'Valsartán', 'Candesartán'],
    'Infarto agudo de miocardio (IAM)': ['Ácido acetilsalicílico', 'Atorvastatina', 'Clopidogrel', 'Bisoprolol', 'Enalapril', 'Losartán'],
    'Diabetes mellitus (DM)': ['Metformina 850 mg', 'Insulina', 'Glibenclamida', 'Empagliflozina', 'Dapagliflozina', 'Sitagliptina'],
    'Asma bronquial': ['Salbutamol inhalador', 'Budesonida inhalada', 'Fluticasona inhalada', 'Montelukast', 'Formoterol/budesonida'],
    'Gastritis': ['Omeprazol', 'Esomeprazol', 'Pantoprazol', 'Sucralfato', 'Antiácido según necesidad'],
    'Hipotiroidismo': ['Levotiroxina 25 mcg', 'Levotiroxina 50 mcg', 'Levotiroxina 75 mcg', 'Levotiroxina 100 mcg'],
    'Obesidad': ['Manejo nutricional', 'Actividad física', 'Control metabólico', 'Tratamiento médico según valoración'],
    'Osteoporosis': ['Calcio + vitamina D', 'Alendronato', 'Ibandronato', 'Denosumab', 'Vitamina D']
  },
  medicamentosGenerales: [
    'Losartán 50 mg','Enalapril 10 mg','Amlodipino 5 mg','Hidroclorotiazida 25 mg','Metformina 850 mg','Insulina',
    'Levotiroxina 50 mcg','Omeprazol 20 mg','Pantoprazol 40 mg','Salbutamol inhalador','Budesonida inhalada',
    'Atorvastatina 20 mg','Ácido acetilsalicílico 100 mg','Calcio + vitamina D','Ácido fólico','Hierro','Vitamina D',
    'Anticonceptivo oral combinado','Progesterona','Manejo nutricional','No usa medicación actual','No recuerda nombre'
  ],
  reaccionesAlergia: [
    'Urticaria','Rash cutáneo','Prurito','Edema','Angioedema','Dificultad respiratoria','Anafilaxia referida',
    'Náusea / vómito','Mareo','Intolerancia gastrointestinal','Reacción no especificada','No recuerda reacción'
  ],
  alergiasRapidas: [
    'Penicilina','Amoxicilina','Cefalosporinas','AINES','Ibuprofeno','Diclofenaco','Aspirina','Sulfas',
    'Yodo / contraste','Látex','Anestésicos','Lácteos','Mariscos','Cítricos','Polen','Ácaros'
  ],
  cirugiasRapidas: [
    'Cesárea','Legrado uterino','Histerectomía','Miomectomía','Ooforectomía','Salpingectomía','Laparoscopía',
    'Apendicectomía','Colecistectomía','Hernioplastia','Cirugía estética','Biopsia mamaria','Conización cervical'
  ],
  vacunasNombres: {
    Covid: ['Pfizer / Comirnaty','Moderna / Spikevax','AstraZeneca','Sinovac','CanSino','No recuerda marca'],
    Hpv: ['Gardasil','Gardasil 9','Cervarix','No recuerda marca'],
    HepB: ['Engerix-B','Euvax-B','No recuerda marca'],
    Influenza: ['Influenza estacional','Influenza tetravalente','No recuerda marca'],
    Tdpa: ['Td','Tdap','dTpa','No recuerda marca'],
    Neumococo: ['Neumococo 13-valente','Neumococo 23-valente','No recuerda marca'],
    Srp: ['SRP / triple viral','No recuerda marca'],
    Varicela: ['Varicela','No recuerda marca'],
    FiebreAmarilla: ['Fiebre amarilla','No recuerda marca']
  }
};

function auroV21CrearDatalist(id, opciones){
  if(document.getElementById(id)) return;
  const dl = document.createElement('datalist');
  dl.id = id;
  (opciones || []).forEach(op => {
    const option = document.createElement('option');
    option.value = op;
    dl.appendChild(option);
  });
  document.body.appendChild(dl);
}

function auroV21NormalizarCantidadUnidad(valor, unidadDefault){
  const raw = String(valor || '').trim();
  const unidad = String(unidadDefault || '').trim();

  if(!raw && ['desde infancia','desde nacimiento','no recuerda','no aplica'].includes(unidad.toLowerCase())){
    return unidad;
  }

  if(!raw) return '';

  const lower = raw.toLowerCase();
  if(/(día|dias|días|semana|mes|meses|año|años|infancia|nacimiento|recuerda|aplica|desde|hace)/i.test(raw)){
    return raw;
  }

  if(/^\d+([.,]\d+)?$/.test(raw) && unidad && !['seleccione',''].includes(unidad.toLowerCase())){
    return raw.replace(',', '.') + ' ' + unidad;
  }

  return raw;
}

function auroV21NormalizarFechaQuirurgica(valor){
  const raw = String(valor || '').trim();
  if(!raw) return '';
  if(/^\d{4}$/.test(raw)) return 'Año: ' + raw;
  if(/^\d{1,2}$/.test(raw)) return 'Hace ' + raw + ' años';
  return raw;
}

function auroV21NormalizarUnidadSimple(valor, unidad){
  const raw = String(valor || '').trim();
  if(!raw) return '';
  if(/[a-záéíóúñ/]/i.test(raw)) return raw;
  return raw + ' ' + unidad;
}

function auroV21SetDatalist(input, datalistId){
  if(!input) return;
  input.setAttribute('list', datalistId);
  input.setAttribute('autocomplete', 'off');
}

function auroV21WrapTiempoInput(input, unidades, unidadInicial){
  if(!input || input.dataset.auroV21UnitReady === '1') return;
  input.dataset.auroV21UnitReady = '1';

  const wrap = document.createElement('div');
  wrap.className = 'auro-v21-unit-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const select = document.createElement('select');
  select.className = 'form-select auro-v21-unit-select';
  select.setAttribute('aria-label', 'Unidad de tiempo');
  (unidades || ['días','semanas','meses','años','desde infancia','desde nacimiento','no recuerda','no aplica']).forEach(u => {
    const op = document.createElement('option');
    op.value = u;
    op.textContent = u;
    if(u === unidadInicial) op.selected = true;
    select.appendChild(op);
  });
  wrap.appendChild(select);

  input.addEventListener('blur', () => {
    const normalizado = auroV21NormalizarCantidadUnidad(input.value, select.value);
    if(normalizado) input.value = normalizado;
  });
}

function auroV21GetUnidadDeInput(input){
  const wrap = input?.closest('.auro-v21-unit-wrap');
  return wrap?.querySelector('.auro-v21-unit-select')?.value || '';
}

function auroV21AutoCheckPorInput(input, checkSelector, dataName){
  if(!input) return;
  input.addEventListener('input', () => {
    const key = input.dataset[dataName] || '';
    if(!key) return;
    const chk = document.querySelector(`${checkSelector}[data-${dataName.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(key)}"]`);
    if(chk && input.value.trim()) chk.checked = true;
  });
}

function auroV21AplicarMedicamentosPorPatologia(chk){
  const patologia = chk?.dataset?.patologia || '';
  const medInput = document.querySelector(`.hcPatologicoMedicamento[data-patologia="${CSS.escape(patologia)}"]`);
  const opciones = AURO_ANT_V21.patologiasMedicamentos[patologia] || AURO_ANT_V21.medicamentosGenerales;
  const id = 'auroV21Med_' + btoa(unescape(encodeURIComponent(patologia))).replace(/=/g,'');
  auroV21CrearDatalist(id, opciones);
  auroV21SetDatalist(medInput, id);
  if(chk.checked && medInput && !medInput.value && opciones.length){
    medInput.placeholder = 'Sugerencias: ' + opciones.slice(0, 3).join(', ');
  }
}

function auroV21AgregarBoton(texto, icono, onClick, estadoKey){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-soft auro-v21-helper-btn';
  btn.innerHTML = `<i class="bi ${icono} me-1"></i>${texto}`;
  if(estadoKey) btn.dataset.auroHelperKey = estadoKey;
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('click', onClick);
  return btn;
}

function auroV21SetBotonRapidoActivo(estadoKey, activo){
  if(!estadoKey) return;
  const btn = document.querySelector(
    `.auro-v21-helper-btn[data-auro-helper-key="${CSS.escape(String(estadoKey))}"]`
  );
  if(!btn) return;
  btn.classList.toggle('auro-v21-helper-active', !!activo);
  btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
}

function auroV21BotonRapidoEstaActivo(estadoKey){
  const btn = document.querySelector(
    `.auro-v21-helper-btn[data-auro-helper-key="${CSS.escape(String(estadoKey || ''))}"]`
  );
  return !!btn?.classList.contains('auro-v21-helper-active');
}

/*
  Estado temporal SOLO en memoria del navegador.
  No se guarda en Google Sheets, no modifica fechas, IDs ni payload.
  Sirve únicamente para que el segundo clic restaure exactamente
  lo que había antes de usar una ayuda rápida.
*/
const AURO_V21_HELPER_SNAPSHOTS = Object.create(null);

function auroV21CapturarControles(selectores){
  const mapa = new Map();

  (selectores || []).forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if(mapa.has(el)) return;
      mapa.set(el, {
        el: el,
        value: 'value' in el ? el.value : undefined,
        checked: 'checked' in el ? !!el.checked : undefined
      });
    });
  });

  return [...mapa.values()];
}

function auroV21RestaurarControles(snapshot){
  (snapshot || []).forEach(item => {
    const el = item?.el;
    if(!el || !document.documentElement.contains(el)) return;
    if(item.value !== undefined && 'value' in el) el.value = item.value;
    if(item.checked !== undefined && 'checked' in el) el.checked = !!item.checked;
  });
}

function auroV21GuardarSnapshot(estadoKey, selectores, extras){
  AURO_V21_HELPER_SNAPSHOTS[estadoKey] = {
    controles: auroV21CapturarControles(selectores),
    extras: typeof extras === 'function' ? extras() : null
  };
}

function auroV21RestaurarSnapshot(estadoKey, restaurarExtras){
  const snapshot = AURO_V21_HELPER_SNAPSHOTS[estadoKey];
  if(!snapshot) return false;

  auroV21RestaurarControles(snapshot.controles);
  if(typeof restaurarExtras === 'function'){
    restaurarExtras(snapshot.extras);
  }

  delete AURO_V21_HELPER_SNAPSHOTS[estadoKey];
  return true;
}

function auroV21DesactivarBotonRapido(estadoKey, limpiarSnapshot = true){
  auroV21SetBotonRapidoActivo(estadoKey, false);
  if(limpiarSnapshot) delete AURO_V21_HELPER_SNAPSHOTS[estadoKey];
}

function auroV21SincronizarEstadosAyudas(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  auroV21SetBotonRapidoActivo(
    'niega_patologicos',
    panel.dataset.auroNiegaPatologicos === '1'
  );

  auroV21SetBotonRapidoActivo(
    'niega_quirurgicos',
    panel.dataset.auroNiegaQuirurgicos === '1'
  );

  auroV21SetBotonRapidoActivo(
    'niega_alergias',
    panel.dataset.auroNiegaAlergias === '1'
  );

  auroV21SetBotonRapidoActivo(
    'niega_familiares',
    panel.dataset.auroNiegaFamiliares === '1'
  );

  const med = String(document.getElementById('hcMedicacionActual')?.value || '').trim();
  auroV21SetBotonRapidoActivo(
    'sin_medicacion',
    med === 'No usa medicación actual según refiere.'
  );

  const vacunasRapidas = ['Covid','Hpv','HepB','Influenza','Tdpa'];
  const vacunasAlDia = vacunasRapidas.every(vacunaKey => {
    const checks = [...document.querySelectorAll(`[id^="hcVac${vacunaKey}Apl"]`)];
    return checks.length > 0 && checks.every(chk => chk.checked);
  });
  auroV21SetBotonRapidoActivo('vacunas_dia', vacunasAlDia);

  const habitosSinConsumo = ['Tabaco','Alcohol','Drogas','Cafe','Biomasa'].every(habitoKey => {
    const no = document.querySelector(`input[name="hcHabito${habitoKey}Ex"][value="No"]`);
    const tiempo = String(document.getElementById('hcHabito' + habitoKey + 'Tiempo')?.value || '').trim();
    const abst = String(document.getElementById('hcHabito' + habitoKey + 'Abstinencia')?.value || '').trim();
    return !!no?.checked && tiempo === 'No aplica' && abst === 'No aplica';
  });
  auroV21SetBotonRapidoActivo('habitos_sin_consumo', habitosSinConsumo);
}

window.auroV21SincronizarEstadosAyudas = auroV21SincronizarEstadosAyudas;

function auroV21InsertarPanelAyudas(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel || document.getElementById('auroV21AntecedentesHelp')) return;

  const box = document.createElement('div');
  box.id = 'auroV21AntecedentesHelp';
  box.className = 'auro-v21-help-box';
  box.innerHTML = `
    <div>
      <b><i class="bi bi-magic me-1"></i>Ayudas clínicas de llenado rápido</b>
      <small>Opciones editables. Segundo clic revierte únicamente la ayuda aplicada.</small>
    </div>
    <div class="auro-v21-help-actions"></div>
  `;

  const actions = box.querySelector('.auro-v21-help-actions');

  actions.appendChild(auroV21AgregarBoton('Niega patológicos', 'bi-check2-circle', () => {
    const key = 'niega_patologicos';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key, extras => {
        if(extras?.niega === undefined) delete panel.dataset.auroNiegaPatologicos;
        else panel.dataset.auroNiegaPatologicos = extras.niega;
      });
      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(
      key,
      ['.hcPatologicoCheck','.hcPatologicoTiempo','.hcPatologicoMedicamento','#hcAntecedentesPersonales'],
      () => ({ niega: panel.dataset.auroNiegaPatologicos })
    );

    panel.dataset.auroNiegaPatologicos = '1';
    document.querySelectorAll('.hcPatologicoCheck').forEach(chk => chk.checked = false);
    document.querySelectorAll('.hcPatologicoTiempo,.hcPatologicoMedicamento').forEach(i => i.value = '');
    auroV21SetBotonRapidoActivo(key, true);
    alert('Se registrará: Niega antecedentes patológicos personales relevantes.');
  }, 'niega_patologicos'));

  actions.appendChild(auroV21AgregarBoton('Niega quirúrgicos', 'bi-check2-circle', () => {
    const key = 'niega_quirurgicos';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key, extras => {
        if(extras?.niega === undefined) delete panel.dataset.auroNiegaQuirurgicos;
        else panel.dataset.auroNiegaQuirurgicos = extras.niega;
      });
      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(
      key,
      ['.hcQuirurgicoCheck','.hcQuirurgicoFecha','.hcQuirurgicoOtroNombre','#hcAntecedentesQuirurgicos'],
      () => ({ niega: panel.dataset.auroNiegaQuirurgicos })
    );

    panel.dataset.auroNiegaQuirurgicos = '1';
    document.querySelectorAll('.hcQuirurgicoCheck').forEach(chk => chk.checked = false);
    document.querySelectorAll('.hcQuirurgicoFecha,.hcQuirurgicoOtroNombre').forEach(i => i.value = '');
    auroV21SetBotonRapidoActivo(key, true);
    alert('Se registrará: Niega antecedentes quirúrgicos.');
  }, 'niega_quirurgicos'));

  actions.appendChild(auroV21AgregarBoton('Niega alergias conocidas', 'bi-shield-check', () => {
    const key = 'niega_alergias';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key, extras => {
        if(extras?.niega === undefined) delete panel.dataset.auroNiegaAlergias;
        else panel.dataset.auroNiegaAlergias = extras.niega;

        const resumen = document.getElementById('hcAlergiasResumen');
        if(resumen && extras?.resumen !== undefined) resumen.textContent = extras.resumen;
      });
      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(
      key,
      ['.hcAlergiaCheck','.hcAlergiaDetalle','#hcAlergias'],
      () => ({
        niega: panel.dataset.auroNiegaAlergias,
        resumen: document.getElementById('hcAlergiasResumen')?.textContent
      })
    );

    panel.dataset.auroNiegaAlergias = '1';
    document.querySelectorAll('.hcAlergiaCheck').forEach(chk => chk.checked = false);
    document.querySelectorAll('.hcAlergiaDetalle').forEach(i => i.value = '');
    if(document.getElementById('hcAlergiasResumen')) document.getElementById('hcAlergiasResumen').textContent = 'Niega alergias conocidas';
    auroV21SetBotonRapidoActivo(key, true);
    alert('Se registrará: Niega alergias conocidas.');
  }, 'niega_alergias'));

  actions.appendChild(auroV21AgregarBoton('Sin medicación actual', 'bi-capsule', () => {
    const key = 'sin_medicacion';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key);
      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(key, ['#hcMedicacionActual']);
    const el = document.getElementById('hcMedicacionActual');
    if(el) el.value = 'No usa medicación actual según refiere.';
    auroV21SetBotonRapidoActivo(key, true);
  }, 'sin_medicacion'));

  actions.appendChild(auroV21AgregarBoton('Vacunas al día según refiere', 'bi-shield-plus', () => {
    const key = 'vacunas_dia';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key);
      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(key, ['#hc_antecedentes [id^="hcVac"]']);

    ['Covid','Hpv','HepB','Influenza','Tdpa'].forEach(vacunaKey => {
      const nombre = document.getElementById('hcVac' + vacunaKey + 'Nombre');
      if(nombre && !nombre.value) nombre.value = vacunaKey === 'Hpv' ? 'HPV / no recuerda marca' : 'No recuerda marca';

      for(let i=1;i<=4;i++){
        const apl = document.getElementById('hcVac' + vacunaKey + 'Apl' + i);
        const obs = document.getElementById('hcVac' + vacunaKey + 'Obs' + i);
        if(apl) apl.checked = true;
        if(obs && !obs.value) obs.value = 'Al día según refiere';
      }
    });

    auroV21SetBotonRapidoActivo(key, true);
  }, 'vacunas_dia'));

  actions.appendChild(auroV21AgregarBoton('Hábitos sin consumo nocivo', 'bi-heart', () => {
    const key = 'habitos_sin_consumo';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key);
      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(key, [
      'input[name^="hcHabito"][name$="Ex"]',
      '[id^="hcHabito"][id$="Tiempo"]',
      '[id^="hcHabito"][id$="Abstinencia"]'
    ]);

    ['Tabaco','Alcohol','Drogas','Cafe','Biomasa'].forEach(habitoKey => {
      const no = document.querySelector(`input[name="hcHabito${habitoKey}Ex"][value="No"]`);
      if(no) no.checked = true;
      const tiempo = document.getElementById('hcHabito' + habitoKey + 'Tiempo');
      const abst = document.getElementById('hcHabito' + habitoKey + 'Abstinencia');
      if(tiempo) tiempo.value = 'No aplica';
      if(abst) abst.value = 'No aplica';
    });

    auroV21SetBotonRapidoActivo(key, true);
  }, 'habitos_sin_consumo'));

  actions.appendChild(auroV21AgregarBoton('Niega antecedentes familiares', 'bi-people', () => {
    const key = 'niega_familiares';

    if(auroV21BotonRapidoEstaActivo(key)){
      auroV21RestaurarSnapshot(key, extras => {
        if(extras?.niega === undefined) delete panel.dataset.auroNiegaFamiliares;
        else panel.dataset.auroNiegaFamiliares = extras.niega;
      });

      if(typeof window.recopilarAntecedentesFamiliaresEstructurados === 'function'){
        window.recopilarAntecedentesFamiliaresEstructurados();
      }

      auroV21SetBotonRapidoActivo(key, false);
      return;
    }

    auroV21GuardarSnapshot(
      key,
      [
        '.hcFamiliarPatParentesco','.hcFamiliarPatDetalle','.hcFamiliarPatOtroNombre',
        '.hcFamiliarQxParentesco','.hcFamiliarQxDetalle','.hcFamiliarQxOtroNombre',
        '#hcFamiliaresOtros','#hcAntecedentesFamiliares'
      ],
      () => ({ niega: panel.dataset.auroNiegaFamiliares })
    );

    if(typeof window.limpiarAntecedentesFamiliaresEstructurados === 'function'){
      window.limpiarAntecedentesFamiliaresEstructurados();
    }

    panel.dataset.auroNiegaFamiliares = '1';

    if(typeof window.recopilarAntecedentesFamiliaresEstructurados === 'function'){
      window.recopilarAntecedentesFamiliaresEstructurados();
    }

    auroV21SetBotonRapidoActivo(key, true);
    alert('Se registrará: Niega antecedentes familiares relevantes.');
  }, 'niega_familiares'));

  const firstSubtitle = panel.querySelector('.clinical-subtitle');
  if(firstSubtitle) firstSubtitle.insertAdjacentElement('afterend', box);
}

function auroV21InicializarAyudasAntecedentes(){
  auroV21CrearDatalist('auroV21MedicamentosGenerales', AURO_ANT_V21.medicamentosGenerales);
  auroV21CrearDatalist('auroV21ReaccionesAlergia', AURO_ANT_V21.reaccionesAlergia);
  auroV21CrearDatalist('auroV21AlergiasRapidas', AURO_ANT_V21.alergiasRapidas);
  auroV21CrearDatalist('auroV21CirugiasRapidas', AURO_ANT_V21.cirugiasRapidas);

  auroV21InsertarPanelAyudas();

  document.querySelectorAll('.hcPatologicoTiempo').forEach(input => {
    auroV21WrapTiempoInput(input, ['días','semanas','meses','años','desde infancia','desde nacimiento','no recuerda','no aplica'], 'años');
  });

  document.querySelectorAll('.hcPatologicoMedicamento').forEach(input => {
    const patologia = input.dataset.patologia || '';
    const opciones = AURO_ANT_V21.patologiasMedicamentos[patologia] || AURO_ANT_V21.medicamentosGenerales;
    const id = 'auroV21Med_' + btoa(unescape(encodeURIComponent(patologia))).replace(/=/g,'');
    auroV21CrearDatalist(id, opciones);
    auroV21SetDatalist(input, id);
    input.addEventListener('input', () => {
      const chk = document.querySelector(`.hcPatologicoCheck[data-patologia="${CSS.escape(patologia)}"]`);
      if(chk && input.value.trim()) chk.checked = true;
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaPatologicos;
      auroV21DesactivarBotonRapido('niega_patologicos');
    });
  });

  document.querySelectorAll('.hcPatologicoCheck').forEach(chk => {
    chk.addEventListener('change', () => {
      auroV21AplicarMedicamentosPorPatologia(chk);
      const panel = document.getElementById('hc_antecedentes');
      if(panel && chk.checked) delete panel.dataset.auroNiegaPatologicos;
      if(chk.checked) auroV21DesactivarBotonRapido('niega_patologicos');
    });
    auroV21AplicarMedicamentosPorPatologia(chk);
  });

  document.querySelectorAll('.hcPatologicoTiempo').forEach(input => {
    input.addEventListener('input', () => {
      if(!input.value.trim()) return;
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaPatologicos;
      auroV21DesactivarBotonRapido('niega_patologicos');
    });
  });

  document.querySelectorAll('.hcQuirurgicoCheck').forEach(chk => {
    chk.addEventListener('change', () => {
      if(!chk.checked) return;
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaQuirurgicos;
      auroV21DesactivarBotonRapido('niega_quirurgicos');
    });
  });

  document.querySelectorAll('.hcQuirurgicoFecha').forEach(input => {
    input.addEventListener('blur', () => {
      input.value = auroV21NormalizarFechaQuirurgica(input.value);
    });
    input.addEventListener('input', () => {
      const cirugia = input.dataset.cirugia || '';
      const chk = document.querySelector(`.hcQuirurgicoCheck[data-cirugia="${CSS.escape(cirugia)}"]`);
      if(chk && input.value.trim()) chk.checked = true;
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaQuirurgicos;
      auroV21DesactivarBotonRapido('niega_quirurgicos');
    });
  });

  const otroCirugia = document.querySelector('.hcQuirurgicoOtroNombre');
  auroV21SetDatalist(otroCirugia, 'auroV21CirugiasRapidas');
  if(otroCirugia){
    otroCirugia.addEventListener('input', () => {
      const chk = document.querySelector('.hcQuirurgicoCheck[data-cirugia="Otros"]');
      if(chk && otroCirugia.value.trim()) chk.checked = true;
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaQuirurgicos;
      auroV21DesactivarBotonRapido('niega_quirurgicos');
    });
  }

  document.querySelectorAll('.hcAlergiaDetalle').forEach(input => {
    auroV21SetDatalist(input, 'auroV21ReaccionesAlergia');
    input.addEventListener('input', () => {
      const alergia = input.dataset.alergia || '';
      const chk = document.querySelector(`.hcAlergiaCheck[data-alergia="${CSS.escape(alergia)}"]`);
      if(chk && input.value.trim()) chk.checked = true;
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaAlergias;
      auroV21DesactivarBotonRapido('niega_alergias');
    });
  });

  document.querySelectorAll('.hcAlergiaCheck').forEach(chk => {
    chk.addEventListener('change', () => {
      const panel = document.getElementById('hc_antecedentes');
      if(panel && chk.checked) delete panel.dataset.auroNiegaAlergias;
      if(chk.checked) auroV21DesactivarBotonRapido('niega_alergias');
    });
  });

  document.querySelectorAll('[id^="hcVac"][id$="Nombre"]').forEach(input => {
    const key = input.id.replace(/^hcVac/, '').replace(/Nombre$/, '');
    const opciones = AURO_ANT_V21.vacunasNombres[key] || ['No recuerda marca'];
    const id = 'auroV21Vacuna' + key;
    auroV21CrearDatalist(id, opciones);
    auroV21SetDatalist(input, id);
  });

  const covidTipo = document.getElementById('hcCovidVacunaTipo');
  auroV21CrearDatalist('auroV21CovidVacunas', AURO_ANT_V21.vacunasNombres.Covid);
  auroV21SetDatalist(covidTipo, 'auroV21CovidVacunas');

  ['hcCovidTiempoHospitalizado'].forEach(id => {
    const input = document.getElementById(id);
    if(input) auroV21WrapTiempoInput(input, ['días','semanas','meses','no recuerda','no aplica'], 'días');
  });

  const agua = document.getElementById('hcAlimentacionAguaDiaria');
  if(agua){
    agua.addEventListener('blur', () => { agua.value = auroV21NormalizarUnidadSimple(agua.value, 'litros/día'); });
  }
  const comidas = document.getElementById('hcAlimentacionComidasDia');
  if(comidas){
    comidas.addEventListener('blur', () => { comidas.value = auroV21NormalizarUnidadSimple(comidas.value, 'comidas/día'); });
  }

  document.querySelectorAll('[id^="hcEstilo"][id$="Distancia"]').forEach(input => {
    input.addEventListener('blur', () => { input.value = auroV21NormalizarUnidadSimple(input.value, 'km'); });
  });
  document.querySelectorAll('[id^="hcEstilo"][id$="Frecuencia"]').forEach(input => {
    input.addEventListener('blur', () => { input.value = auroV21NormalizarUnidadSimple(input.value, 'veces/semana'); });
  });
  document.querySelectorAll('[id^="hcEstilo"][id$="Tiempo"]').forEach(input => {
    input.addEventListener('blur', () => { input.value = auroV21NormalizarUnidadSimple(input.value, 'horas'); });
  });

  document.querySelectorAll('.clinical-note').forEach(note => {
    if(/Sección visual|no modifica Google Sheets|fase no modifica/i.test(note.textContent || '')){
      note.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Sección conectada a Historia Clínica. Se guarda en Google Sheets dentro de antecedentes estructurados.';
    }
  });

  /* Estado visual de ayudas rápidas: solo interfaz, sin alterar guardado. */
  const medActual = document.getElementById('hcMedicacionActual');
  if(medActual && medActual.dataset.auroHelperVisualReady !== '1'){
    medActual.dataset.auroHelperVisualReady = '1';
    const revisarMedicacionRapida = () => {
      if(String(medActual.value || '').trim() !== 'No usa medicación actual según refiere.'){
        auroV21DesactivarBotonRapido('sin_medicacion');
      }
    };
    medActual.addEventListener('input', revisarMedicacionRapida);
    medActual.addEventListener('change', revisarMedicacionRapida);
  }

  document.querySelectorAll('#hc_antecedentes [id^="hcVac"]').forEach(el => {
    if(el.dataset.auroHelperVisualReady === '1') return;
    el.dataset.auroHelperVisualReady = '1';
    const desactivar = () => auroV21DesactivarBotonRapido('vacunas_dia');
    el.addEventListener('input', desactivar);
    el.addEventListener('change', desactivar);
  });

  ['Tabaco','Alcohol','Drogas','Cafe','Biomasa'].forEach(key => {
    document.querySelectorAll(
      `input[name="hcHabito${key}Ex"],#hcHabito${key}Tiempo,#hcHabito${key}Abstinencia`
    ).forEach(el => {
      if(el.dataset.auroHelperVisualReady === '1') return;
      el.dataset.auroHelperVisualReady = '1';
      const desactivar = () => auroV21DesactivarBotonRapido('habitos_sin_consumo');
      el.addEventListener('input', desactivar);
      el.addEventListener('change', desactivar);
    });
  });

  document.querySelectorAll(
    '.hcFamiliarPatParentesco,.hcFamiliarPatDetalle,.hcFamiliarPatOtroNombre,' +
    '.hcFamiliarQxParentesco,.hcFamiliarQxDetalle,.hcFamiliarQxOtroNombre,' +
    '#hcFamiliaresOtros'
  ).forEach(el => {
    if(el.dataset.auroHelperFamiliaVisualReady === '1') return;
    el.dataset.auroHelperFamiliaVisualReady = '1';
    const desactivar = () => {
      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaFamiliares;
      auroV21DesactivarBotonRapido('niega_familiares');
    };
    el.addEventListener('input', desactivar);
    el.addEventListener('change', desactivar);
  });

  setTimeout(auroV21SincronizarEstadosAyudas, 0);
}

/* Redefinición no destructiva: conserva el formato anterior, pero añade unidades flexibles y botones rápidos. */
function recopilarAntecedentesPersonalesEstructurados(){
  const filas = [];
  const panel = document.getElementById('hc_antecedentes');

  document.querySelectorAll('.hcPatologicoCheck').forEach(chk => {
    const patologia = chk.dataset.patologia || '';
    const tiempoInput = document.querySelector(`.hcPatologicoTiempo[data-patologia="${CSS.escape(patologia)}"]`);
    let tiempo = tiempoInput?.value?.trim() || '';
    tiempo = auroV21NormalizarCantidadUnidad(tiempo, auroV21GetUnidadDeInput(tiempoInput));
    if(tiempoInput && tiempo) tiempoInput.value = tiempo;

    const medicamento = document.querySelector(`.hcPatologicoMedicamento[data-patologia="${CSS.escape(patologia)}"]`)?.value?.trim() || '';

    if(chk.checked || tiempo || medicamento){
      filas.push([patologia, tiempo, medicamento].filter(Boolean).join(' | '));
    }
  });

  if(!filas.length && panel?.dataset?.auroNiegaPatologicos === '1'){
    filas.push('Niega antecedentes patológicos personales relevantes');
  }

  const valor = filas.join('; ');
  const hidden = document.getElementById('hcAntecedentesPersonales');
  if(hidden) hidden.value = valor;
  return valor;
}

function recopilarAntecedentesQuirurgicosEstructurados(){
  const filas = [];
  const panel = document.getElementById('hc_antecedentes');

  document.querySelectorAll('.hcQuirurgicoCheck').forEach(chk => {
    const cirugiaBase = chk.dataset.cirugia || '';
    const fechaInput = document.querySelector(`.hcQuirurgicoFecha[data-cirugia="${CSS.escape(cirugiaBase)}"]`);
    let fecha = auroV21NormalizarFechaQuirurgica(fechaInput?.value?.trim() || '');
    if(fechaInput && fecha) fechaInput.value = fecha;

    let cirugia = cirugiaBase;
    if(cirugiaBase === 'Otros'){
      const otroNombre = document.querySelector('.hcQuirurgicoOtroNombre')?.value?.trim() || '';
      if(otroNombre) cirugia = 'Otros: ' + otroNombre;
    }

    if(chk.checked || fecha || (cirugiaBase === 'Otros' && cirugia !== 'Otros')){
      filas.push([cirugia, fecha].filter(Boolean).join(' | '));
    }
  });

  if(!filas.length && panel?.dataset?.auroNiegaQuirurgicos === '1'){
    filas.push('Niega antecedentes quirúrgicos');
  }

  const valor = filas.join('; ');
  const hidden = document.getElementById('hcAntecedentesQuirurgicos');
  if(hidden) hidden.value = valor;
  return valor;
}

function recopilarAlergiasEstructuradas(){
  const filas = [];
  const panel = document.getElementById('hc_antecedentes');

  document.querySelectorAll('.hcAlergiaCheck').forEach(chk => {
    const alergia = chk.dataset.alergia || '';
    const detalle = document.querySelector(`.hcAlergiaDetalle[data-alergia="${CSS.escape(alergia)}"]`)?.value?.trim() || '';

    if(chk.checked || detalle){
      filas.push([alergia, detalle].filter(Boolean).join(' | '));
    }
  });

  if(filas.length && panel?.dataset?.auroNiegaAlergias === '1'){
    delete panel.dataset.auroNiegaAlergias;
  }

  if(!filas.length && panel?.dataset?.auroNiegaAlergias === '1'){
    filas.push('Niega alergias conocidas');
  }

  const valor = filas.join('; ');
  const hidden = document.getElementById('hcAlergias');
  if(hidden) hidden.value = valor;
  return valor;
}

/* Mejora de serialización: normaliza unidades antes de guardar. */
function recopilarHabitosEstructurados(){
  const habitos = [
    { key:'Tabaco', nombre:'Tabaco' },
    { key:'Alcohol', nombre:'Alcohol' },
    { key:'Drogas', nombre:'Drogas' },
    { key:'Cafe', nombre:'Café' },
    { key:'Biomasa', nombre:'Biomasa' }
  ];

  return habitos.map(h => {
    const tiempoEl = document.getElementById('hcHabito' + h.key + 'Tiempo');
    const abstEl = document.getElementById('hcHabito' + h.key + 'Abstinencia');
    let tiempo = tiempoEl?.value?.trim() || '';
    let abstinencia = abstEl?.value?.trim() || '';
    if(/^\d+$/.test(tiempo)) tiempo = tiempo + ' años';
    if(/^\d+$/.test(abstinencia)) abstinencia = abstinencia + ' meses';
    if(tiempoEl && tiempo) tiempoEl.value = tiempo;
    if(abstEl && abstinencia) abstEl.value = abstinencia;

    return auroCompactarObjeto({
      habito: h.nombre,
      actual: auroGetRadio('hcHabito' + h.key + 'Ex'),
      tiempo: tiempo,
      abstinencia: abstinencia
    });
  }).filter(auroTieneValor);
}

function recopilarAlimentacionEstructurada(){
  const agua = document.getElementById('hcAlimentacionAguaDiaria');
  const comidas = document.getElementById('hcAlimentacionComidasDia');
  if(agua) agua.value = auroV21NormalizarUnidadSimple(agua.value, 'litros/día');
  if(comidas) comidas.value = auroV21NormalizarUnidadSimple(comidas.value, 'comidas/día');

  return auroCompactarObjeto({
    agua_diaria_litros: auroGet('hcAlimentacionAguaDiaria'),
    comidas_dia: auroGet('hcAlimentacionComidasDia'),
    frutas_verduras: auroGet('hcAlimentacionFrutasVerduras'),
    comida_rapida: auroGet('hcAlimentacionComidaRapida'),
    azucar: auroGet('hcAlimentacionAzucar'),
    sal: auroGet('hcAlimentacionSal'),
    suplementos: auroGet('hcAlimentacionSuplementos'),
    detalle: auroGet('hcAlimentacion')
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(auroV21InicializarAyudasAntecedentes, 250);
});

/* ==========================================================
   IASYN FIX DEFINITIVO - COVID Y VACUNAS EN CAJA RESUMEN
   Corrección no destructiva: reemplaza solo funciones de resumen
   y recopila vacunas solo si tienen datos reales.
   ========================================================== */

function auroVacunaDosisTieneDatoReal(d){
  if(!d) return false;
  return !!(
    String(d.programada || '').trim() ||
    String(d.administracion || '').trim() ||
    d.aplicada === true ||
    String(d.observacion || '').trim()
  );
}

function auroVacunaTieneDatoReal(v){
  if(!v) return false;
  if(String(v.nombre_comercial || '').trim()) return true;
  return Array.isArray(v.dosis) && v.dosis.some(auroVacunaDosisTieneDatoReal);
}

function recopilarVacunasEstructuradas(){
  const vacunas = [
    { key:'Covid', biologico:'COVID-19', dosis:4 },
    { key:'Hpv', biologico:'Virus Papiloma Humano (HPV)', dosis:3 },
    { key:'HepB', biologico:'Hepatitis B', dosis:3 },
    { key:'Influenza', biologico:'Influenza', dosis:2 },
    { key:'Tdpa', biologico:'Td/Tdap', dosis:2 },
    { key:'Neumococo', biologico:'Neumococo', dosis:2 },
    { key:'Srp', biologico:'SRP', dosis:2 },
    { key:'Varicela', biologico:'Varicela', dosis:2 },
    { key:'FiebreAmarilla', biologico:'Fiebre amarilla', dosis:1 }
  ];

  return vacunas.map(v => {
    const dosis = [];
    for(let i = 1; i <= v.dosis; i++){
      const item = {
        numero: String(i),
        programada: auroGet('hcVac' + v.key + 'Prog' + i),
        administracion: auroGet('hcVac' + v.key + 'Adm' + i),
        aplicada: auroGetCheck('hcVac' + v.key + 'Apl' + i),
        observacion: auroGet('hcVac' + v.key + 'Obs' + i)
      };
      if(auroVacunaDosisTieneDatoReal(item)) dosis.push(item);
    }

    const itemVacuna = {
      key: v.key,
      biologico: v.biologico,
      nombre_comercial: auroGet('hcVac' + v.key + 'Nombre'),
      dosis: dosis
    };

    return itemVacuna;
  }).filter(auroVacunaTieneDatoReal);
}

function auroResumenCovidItemsDesdeJson(data){
  const c = data?.covid || data?.COVID || null;
  if(!c || typeof c !== 'object') return [];

  const detalle = [];
  if(auroPrevioEsValorUtil(c.presento)) detalle.push('Presentó: ' + c.presento);
  if(auroPrevioEsValorUtil(c.fecha)) detalle.push('Fecha: ' + c.fecha);
  if(auroPrevioEsValorUtil(c.anio_referencia)) detalle.push('Referencia: ' + c.anio_referencia);
  if(auroPrevioEsValorUtil(c.clasificacion)) detalle.push('Clasificación: ' + c.clasificacion);
  if(auroPrevioEsValorUtil(c.hospitalizacion)) detalle.push('Hospitalización: ' + c.hospitalizacion);
  if(auroPrevioEsValorUtil(c.tiempo_hospitalizado)) detalle.push('Hospitalización tiempo: ' + c.tiempo_hospitalizado);
  if(auroPrevioEsValorUtil(c.vacunado)) detalle.push('Vacunado: ' + c.vacunado);
  if(auroPrevioEsValorUtil(c.vacuna_tipo)) detalle.push('Vacuna: ' + c.vacuna_tipo);

  const dosis = (c.dosis || [])
    .filter(d => auroPrevioEsValorUtil(d.fecha) || auroPrevioEsValorUtil(d.detalle))
    .map(d => 'Dosis ' + (d.numero || '') + ': ' + [d.fecha, d.detalle].filter(auroPrevioEsValorUtil).join(' / '));

  if(dosis.length) detalle.push(dosis.join(' · '));
  if(auroPrevioEsValorUtil(c.observaciones)) detalle.push('Obs.: ' + c.observaciones);

  return detalle.length ? [{ titulo:'COVID-19', detalle: detalle.join(' · ') }] : [];
}

function auroResumenVacunasItemsDesdeJson(data){
  const lista = Array.isArray(data?.vacunas) ? data.vacunas : [];
  return lista.filter(auroVacunaTieneDatoReal).map(v => {
    const dosisTexto = (v.dosis || [])
      .filter(auroVacunaDosisTieneDatoReal)
      .map(d => {
        const partes = [];
        if(d.aplicada === true) partes.push('Aplicada');
        if(auroPrevioEsValorUtil(d.programada)) partes.push('Programada: ' + d.programada);
        if(auroPrevioEsValorUtil(d.administracion)) partes.push('Administrada: ' + d.administracion);
        if(auroPrevioEsValorUtil(d.observacion)) partes.push('Obs.: ' + d.observacion);
        return 'Dosis ' + (d.numero || '') + ': ' + partes.join(' / ');
      });

    const detalle = [];
    if(auroPrevioEsValorUtil(v.nombre_comercial)) detalle.push('Marca: ' + v.nombre_comercial);
    if(dosisTexto.length) detalle.push(dosisTexto.join(' · '));

    return {
      titulo: v.biologico || v.key || 'Vacuna',
      detalle: detalle.join(' · ')
    };
  });
}

function auroResumenHabitosItemsDesdeJson(data){
  const lista = Array.isArray(data?.habitos) ? data.habitos : [];
  return lista.filter(x => auroTieneValor(x)).map(h => {
    const detalle = [];
    if(auroPrevioEsValorUtil(h.actual)) detalle.push('Ex consumidor: ' + h.actual);
    if(auroPrevioEsValorUtil(h.tiempo)) detalle.push('Tiempo: ' + h.tiempo);
    if(auroPrevioEsValorUtil(h.abstinencia)) detalle.push('Abstinencia: ' + h.abstinencia);
    return { titulo:h.habito || h.key || 'Hábito', detalle: detalle.join(' · ') };
  });
}

function auroResumenEstiloVidaItemsDesdeJson(data){
  const lista = Array.isArray(data?.estilo_vida || data?.estiloVida) ? (data.estilo_vida || data.estiloVida) : [];
  return lista.filter(x => auroTieneValor(x)).map(a => {
    const detalle = [];
    if(auroPrevioEsValorUtil(a.distancia_km)) detalle.push('Distancia: ' + a.distancia_km);
    if(auroPrevioEsValorUtil(a.frecuencia_dia)) detalle.push('Frecuencia: ' + a.frecuencia_dia);
    if(auroPrevioEsValorUtil(a.tiempo_horas)) detalle.push('Tiempo: ' + a.tiempo_horas);
    return { titulo:a.actividad || a.key || 'Actividad', detalle: detalle.join(' · ') };
  });
}

function auroResumenAlimentacionItemsDesdeJson(data){
  const a = data?.alimentacion || null;
  if(!a || typeof a !== 'object') return [];
  const detalle = [];
  if(auroPrevioEsValorUtil(a.agua_diaria_litros)) detalle.push('Agua: ' + a.agua_diaria_litros);
  if(auroPrevioEsValorUtil(a.comidas_dia)) detalle.push('Comidas: ' + a.comidas_dia);
  if(auroPrevioEsValorUtil(a.frutas_verduras)) detalle.push('Frutas/verduras: ' + a.frutas_verduras);
  if(auroPrevioEsValorUtil(a.comida_rapida)) detalle.push('Comida rápida: ' + a.comida_rapida);
  if(auroPrevioEsValorUtil(a.azucar)) detalle.push('Azúcar: ' + a.azucar);
  if(auroPrevioEsValorUtil(a.sal)) detalle.push('Sal: ' + a.sal);
  if(auroPrevioEsValorUtil(a.suplementos)) detalle.push('Suplementos: ' + a.suplementos);
  if(auroPrevioEsValorUtil(a.detalle)) detalle.push('Detalle: ' + a.detalle);
  return detalle.length ? [{ titulo:'Evaluación alimentaria', detalle: detalle.join(' · ') }] : [];
}

function auroMostrarAntecedentesPrevios(h, modo){
  const box = auroAsegurarCajaAntecedentesPrevios();
  const content = document.getElementById('auroAntecedentesPreviosContent');
  if(!box || !content) return;

  if(!auroHistoriaTieneAntecedentes(h)){
    box.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  const fuentePersonales = h.antecedentes_personales || '';
  const jsonPersonales = auroParsear(AURO_ANT_PERSONALES_MARKER, fuentePersonales);
  const fuentePatologicos = jsonPersonales ? (jsonPersonales.patologicos || '') : auroExtraerFuentePatologicosPersonales(fuentePersonales);

  let html = '';
  html += auroRenderPrevioItemsPremium('Patológicos personales', auroExtraerItemsAntecedentePremium(fuentePatologicos, 'patologia'));
  html += auroRenderPrevioItemsPremium('Quirúrgicos', auroExtraerItemsAntecedentePremium(h.antecedentes_quirurgicos || '', 'quirurgico'));
  html += auroRenderPrevioItemsPremium('Alergias', auroExtraerItemsAntecedentePremium(h.alergias || '', 'alergia'));

  if(jsonPersonales){
    html += auroRenderPrevioItemsPremium('COVID-19', auroResumenCovidItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Vacunas registradas', auroResumenVacunasItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Hábitos registrados', auroResumenHabitosItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Actividad física registrada', auroResumenEstiloVidaItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Alimentación', auroResumenAlimentacionItemsDesdeJson(jsonPersonales));
  }else{
    html += auroRenderPrevioItemsPremium('Vacunas registradas', auroExtraerVacunasRegistradas(fuentePersonales));
    html += auroRenderPrevioItemsPremium('Hábitos registrados', auroExtraerHabitosRegistrados(fuentePersonales));
    html += auroRenderPrevioItemsPremium('Actividad física registrada', auroExtraerActividadRegistrada(fuentePersonales));
  }

  html += auroRenderPrevioItemsPremium('Gineco-obstétricos', auroExtraerItemsAntecedentePremium(h.antecedentes_gineco_obstetricos || '', 'gineco'));
  html += auroRenderPrevioItemsPremium('Medicación actual', auroExtraerItemsAntecedentePremium(h.medicacion_actual || '', 'medicacion'));
  html += auroRenderPrevioItemsPremium('Familiares', auroExtraerItemsAntecedentePremium(h.antecedentes_familiares || '', 'familiares'));

  content.innerHTML = html;

  const estadoPrevio = box.dataset.estado || 'visible';
  if(estadoPrevio === 'oculto') content.classList.add('auro-previos-collapsed');
  else content.classList.remove('auro-previos-collapsed');

  const btn = box.querySelector('.auro-previos-hide');
  if(btn){
    btn.innerHTML = estadoPrevio === 'oculto'
      ? '<i class="bi bi-eye me-1"></i> Mostrar'
      : '<i class="bi bi-eye-slash me-1"></i> Ocultar';
  }

  box.dataset.idHistoriaOrigen = h.id_historia || '';
  box.dataset.modo = modo || '';
  box.style.display = content.innerHTML.trim() ? 'block' : 'none';
}

console.log('IASYN antecedentes.js: FIX COVID/VACUNAS resumen cargado');
/* ==========================================================
   IASYN FIX FINAL PROFESIONAL - FILTRO REAL DE RESUMEN
   Objetivo: no mostrar tarjetas vacías ni valores incompletos.
   Corrige hábitos, actividad física, alimentación, obstétricos y ginecológicos.
   No modifica backend, Google Sheets, Apps Script ni index.html.
   ========================================================== */

function auroValorClinicoReal(valor){
  if(valor === null || valor === undefined) return false;
  if(typeof valor === 'boolean') return valor === true;
  const t = String(valor || '').trim();
  if(!t) return false;
  if(/^[-–—\s.,:]*$/.test(t)) return false;
  if(/^(undefined|null|\[object object\]|seleccione|seleccionar|dd\/mm\/aaaa)$/i.test(t)) return false;
  if(/^(años?|meses?|d[ií]as?|horas?|km|litros\/d[ií]a|comidas\/d[ií]a|veces\/semana)$/i.test(t)) return false;
  if(/^(no aplica|n\/a|na)$/i.test(t)) return false;
  if(/^(detalle|resultado|fecha|marca|observaci[oó]n|reacci[oó]n|tipo de vacuna si recuerda)$/i.test(t)) return false;
  return true;
}

function auroValorClinicoRealIncluyeNo(valor){
  if(valor === null || valor === undefined) return false;
  const t = String(valor || '').trim();
  if(/^no$/i.test(t)) return true;
  return auroValorClinicoReal(valor);
}

function auroTieneDatoClinicoObjeto(obj, excluir){
  if(!obj || typeof obj !== 'object') return false;
  const omit = new Set(excluir || []);
  return Object.keys(obj).some(k => {
    if(omit.has(k)) return false;
    const v = obj[k];
    if(Array.isArray(v)) return v.some(x => auroTieneDatoClinicoObjeto(x, excluir) || auroValorClinicoReal(x));
    if(v && typeof v === 'object') return auroTieneDatoClinicoObjeto(v, excluir);
    return auroValorClinicoRealIncluyeNo(v);
  });
}

function auroLimpiarDetalleResumenClinico(detalle){
  return String(detalle || '')
    .split(/\s*·\s*/)
    .map(x => String(x || '').trim())
    .filter(x => {
      if(!x) return false;
      const limpio = x.replace(/^[^:]+:\s*/,'').trim();
      return auroValorClinicoRealIncluyeNo(limpio);
    })
    .join(' · ');
}

/* Refuerzo: no pintar filas incompletas en ninguna sección del resumen */
function auroRenderPrevioItemsPremium(label, items){
  items = (items || [])
    .map(x => {
      if(!x) return null;
      const titulo = String(x.titulo || '').trim();
      const detalle = auroLimpiarDetalleResumenClinico(x.detalle || '');
      if(!auroValorClinicoReal(titulo)) return null;
      if(auroEsTokenTecnicoAntecedente(titulo)) return null;
      return { titulo, detalle };
    })
    .filter(Boolean);

  if(!items.length) return '';
  const icono = auroIconoSeccionAntecedente(label);

  return `
    <div class="auro-previos-line auro-previos-compact">
      <span><i class="bi ${icono}"></i>${auroEscapeHtml(label)}</span>
      <div class="auro-previos-mini-table">
        ${items.map(it => `
          <div class="auro-previos-mini-row">
            <b>${auroEscapeHtml(it.titulo)}</b>
            ${it.detalle ? `<em>${auroRenderDetallePremium(it.detalle)}</em>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* Recopilar solo hábitos con dato real: evita Alcohol/Drogas/Café/Biomasa vacíos */
function recopilarHabitosEstructurados(){
  const habitos = [
    { key:'Tabaco', nombre:'Tabaco' },
    { key:'Alcohol', nombre:'Alcohol' },
    { key:'Drogas', nombre:'Drogas' },
    { key:'Cafe', nombre:'Café' },
    { key:'Biomasa', nombre:'Biomasa' }
  ];

  return habitos.map(h => {
    const tiempoEl = document.getElementById('hcHabito' + h.key + 'Tiempo');
    const abstEl = document.getElementById('hcHabito' + h.key + 'Abstinencia');
    let tiempo = tiempoEl?.value?.trim() || '';
    let abstinencia = abstEl?.value?.trim() || '';
    if(/^\d+$/.test(tiempo)) tiempo = tiempo + ' años';
    if(/^\d+$/.test(abstinencia)) abstinencia = abstinencia + ' meses';
    if(tiempoEl && tiempo) tiempoEl.value = tiempo;
    if(abstEl && abstinencia) abstEl.value = abstinencia;

    const item = {
      habito: h.nombre,
      actual: auroGetRadio('hcHabito' + h.key + 'Ex'),
      tiempo: tiempo,
      abstinencia: abstinencia
    };

    return auroTieneDatoClinicoObjeto(item, ['habito','key']) ? auroCompactarObjeto(item) : null;
  }).filter(Boolean);
}

/* Recopilar solo actividades con dato real: evita Caminar/Nadar/Ciclismo/Otros vacíos */
function recopilarEstiloVidaEstructurado(){
  const actividades = [
    { key:'Correr', actividad:'Correr' },
    { key:'Caminar', actividad:'Caminar' },
    { key:'Nadar', actividad:'Nadar' },
    { key:'Ciclismo', actividad:'Ciclismo' },
    { key:'Otro', actividad: auroGet('hcEstiloOtroDescripcion') || 'Otros' }
  ];

  return actividades.map(a => {
    const item = {
      key: a.key,
      actividad: a.actividad,
      distancia_km: auroGet('hcEstilo' + a.key + 'Distancia'),
      frecuencia_dia: auroGet('hcEstilo' + a.key + 'Frecuencia'),
      tiempo_horas: auroGet('hcEstilo' + a.key + 'Tiempo')
    };
    return auroTieneDatoClinicoObjeto(item, ['key','actividad']) ? auroCompactarObjeto(item) : null;
  }).filter(Boolean);
}

/* Recopilar solo obstétricos con dato real: evita Gesta/Partos/Hijos vivos vacíos */
function recopilarAntecedentesObstetricosEstructurados(){
  const campos = [
    { key:'Pap', descripcion:'Fecha del último Papanicolaou (PAP)', detalle:'Fecha' },
    { key:'Fum', descripcion:'Fecha de la última menstruación (FUM)', detalle:'Fecha' },
    { key:'Fup', descripcion:'Fecha del último parto (FUP)', detalle:'Fecha' },
    { key:'Gesta', descripcion:'Gesta #', detalle:'Detalle' },
    { key:'Partos', descripcion:'Partos #', detalle:'Detalle' },
    { key:'Cesareas', descripcion:'Cesáreas #', detalle:'Detalle' },
    { key:'Abortos', descripcion:'Abortos #', detalle:'Detalle' },
    { key:'HijosVivos', descripcion:'Hijos vivos #', detalle:'Detalle' },
    { key:'HijosMuertos', descripcion:'Hijos muertos #', detalle:'Detalle' },
    { key:'Lactancia', descripcion:'Lactancia', detalle:'Detalle' },
    { key:'Ectopicos', descripcion:'Ectópicos #', detalle:'Detalle' },
    { key:'Otros', descripcion:'Otros', detalle:'Detalle' }
  ];

  return campos.map(c => {
    const detalleId = c.key === 'Pap' || c.key === 'Fum' || c.key === 'Fup'
      ? 'hcObs' + c.key + 'Fecha'
      : 'hcObs' + c.key + 'Detalle';
    const item = {
      key: c.key,
      descripcion: c.descripcion,
      detalle: auroGet(detalleId),
      no_aplica: auroGetCheck('hcObs' + c.key + 'NoAplica'),
      resultado: auroGet('hcObs' + c.key + 'Resultado')
    };
    return auroTieneDatoClinicoObjeto(item, ['key','descripcion']) ? auroCompactarObjeto(item) : null;
  }).filter(Boolean);
}

function auroResumenHabitosItemsDesdeJson(data){
  const lista = Array.isArray(data?.habitos) ? data.habitos : [];
  return lista.filter(h => auroTieneDatoClinicoObjeto(h, ['habito','key'])).map(h => {
    const detalle = [];
    if(auroValorClinicoRealIncluyeNo(h.actual)) detalle.push('Ex consumidor: ' + h.actual);
    if(auroValorClinicoReal(h.tiempo)) detalle.push('Evolución: ' + h.tiempo);
    if(auroValorClinicoReal(h.abstinencia)) detalle.push('Abstinencia: ' + h.abstinencia);
    return { titulo:h.habito || h.key || 'Hábito', detalle: detalle.join(' · ') };
  }).filter(x => auroValorClinicoReal(x.titulo) && (x.detalle || auroValorClinicoRealIncluyeNo(x.titulo)));
}

function auroResumenEstiloVidaItemsDesdeJson(data){
  const lista = Array.isArray(data?.estilo_vida || data?.estiloVida) ? (data.estilo_vida || data.estiloVida) : [];
  return lista.filter(a => auroTieneDatoClinicoObjeto(a, ['key','actividad'])).map(a => {
    const detalle = [];
    if(auroValorClinicoReal(a.distancia_km)) detalle.push('Distancia: ' + a.distancia_km);
    if(auroValorClinicoReal(a.frecuencia_dia)) detalle.push('Frecuencia: ' + a.frecuencia_dia);
    if(auroValorClinicoReal(a.tiempo_horas)) detalle.push('Evolución: ' + a.tiempo_horas);
    return { titulo:a.actividad || a.key || 'Actividad', detalle: detalle.join(' · ') };
  }).filter(x => auroValorClinicoReal(x.titulo) && x.detalle);
}

function auroResumenAlimentacionItemsDesdeJson(data){
  const a = data?.alimentacion || null;
  if(!a || typeof a !== 'object') return [];
  const detalle = [];
  if(auroValorClinicoReal(a.agua_diaria_litros)) detalle.push('Agua: ' + a.agua_diaria_litros);
  if(auroValorClinicoReal(a.comidas_dia)) detalle.push('Comidas: ' + a.comidas_dia);
  if(auroValorClinicoReal(a.frutas_verduras)) detalle.push('Frutas/verduras: ' + a.frutas_verduras);
  if(auroValorClinicoReal(a.comida_rapida)) detalle.push('Comida rápida: ' + a.comida_rapida);
  if(auroValorClinicoReal(a.azucar)) detalle.push('Azúcar: ' + a.azucar);
  if(auroValorClinicoReal(a.sal)) detalle.push('Sal: ' + a.sal);
  if(auroValorClinicoReal(a.suplementos)) detalle.push('Suplementos: ' + a.suplementos);
  if(auroValorClinicoReal(a.detalle)) detalle.push('Detalle: ' + a.detalle);
  return detalle.length ? [{ titulo:'Evaluación alimentaria', detalle: detalle.join(' · ') }] : [];
}

function auroResumenObstetricosItemsDesdeJson(dataGineco){
  const lista = Array.isArray(dataGineco?.obstetricos) ? dataGineco.obstetricos : [];
  return lista.filter(o => auroTieneDatoClinicoObjeto(o, ['key','descripcion'])).map(o => {
    const detalle = [];
    if(o.no_aplica === true) detalle.push('No aplica');
    if(auroValorClinicoReal(o.detalle)) detalle.push('Detalle: ' + o.detalle);
    if(auroValorClinicoReal(o.resultado)) detalle.push('Resultado: ' + o.resultado);
    return { titulo: o.descripcion || o.key || 'Obstétrico', detalle: detalle.join(' · ') };
  }).filter(x => auroValorClinicoReal(x.titulo) && x.detalle);
}

function auroResumenGinecologicosItemsDesdeJson(dataGineco){
  const g = dataGineco?.ginecologicos || null;
  if(!g || typeof g !== 'object') return [];
  const titulos = {
    menarquia:'Menarquia', menacme:'Menacme', menopausia:'Menopausia', vida_sexual_activa:'Vida sexual activa',
    planificacion_familiar:'Planificación familiar', terapia_hormonal:'Terapia hormonal', infecciones_vulvovaginales:'Infecciones vulvovaginales',
    ets:'ETS', mamografia:'Mamografía', eco_mamario:'Eco mamario', densitometria_osea:'Densitometría ósea',
    pap:'Citología / PAP', colposcopia:'Colposcopia', biopsia:'Biopsia', otros:'Otros'
  };
  return Object.keys(g).map(k => {
    const v = g[k] || {};
    if(!auroTieneDatoClinicoObjeto(v, [])) return null;
    const detalle = [];
    if(auroValorClinicoReal(v.detalle)) detalle.push('Detalle: ' + v.detalle);
    if(auroValorClinicoReal(v.fecha)) detalle.push('Fecha: ' + v.fecha);
    if(auroValorClinicoReal(v.resultado)) detalle.push('Resultado: ' + v.resultado);
    return { titulo: titulos[k] || auroPrevioHumanizarClave(k), detalle: detalle.join(' · ') };
  }).filter(x => x && auroValorClinicoReal(x.titulo) && x.detalle);
}

function auroMostrarAntecedentesPrevios(h, modo){
  const box = auroAsegurarCajaAntecedentesPrevios();
  const content = document.getElementById('auroAntecedentesPreviosContent');
  if(!box || !content) return;

  if(!auroHistoriaTieneAntecedentes(h)){
    box.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  const fuentePersonales = h.antecedentes_personales || '';
  const fuenteGineco = h.antecedentes_gineco_obstetricos || '';
  const jsonPersonales = auroParsear(AURO_ANT_PERSONALES_MARKER, fuentePersonales);
  const jsonGineco = auroParsear(AURO_ANT_GINECO_OBS_MARKER, fuenteGineco);
  const fuentePatologicos = jsonPersonales ? (jsonPersonales.patologicos || '') : auroExtraerFuentePatologicosPersonales(fuentePersonales);

  let html = '';
  html += auroRenderPrevioItemsPremium('Patológicos personales', auroExtraerItemsAntecedentePremium(fuentePatologicos, 'patologia'));
  html += auroRenderPrevioItemsPremium('Quirúrgicos', auroExtraerItemsAntecedentePremium(h.antecedentes_quirurgicos || '', 'quirurgico'));
  html += auroRenderPrevioItemsPremium('Alergias', auroExtraerItemsAntecedentePremium(h.alergias || '', 'alergia'));

  if(jsonPersonales){
    html += auroRenderPrevioItemsPremium('COVID-19', auroResumenCovidItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Vacunas registradas', auroResumenVacunasItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Hábitos registrados', auroResumenHabitosItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Actividad física registrada', auroResumenEstiloVidaItemsDesdeJson(jsonPersonales));
    html += auroRenderPrevioItemsPremium('Alimentación', auroResumenAlimentacionItemsDesdeJson(jsonPersonales));
  }else{
    html += auroRenderPrevioItemsPremium('Vacunas registradas', auroExtraerVacunasRegistradas(fuentePersonales));
    html += auroRenderPrevioItemsPremium('Hábitos registrados', auroExtraerHabitosRegistrados(fuentePersonales));
    html += auroRenderPrevioItemsPremium('Actividad física registrada', auroExtraerActividadRegistrada(fuentePersonales));
  }

  if(jsonGineco){
    html += auroRenderPrevioItemsPremium('Obstétricos', auroResumenObstetricosItemsDesdeJson(jsonGineco));
    html += auroRenderPrevioItemsPremium('Ginecológicos', auroResumenGinecologicosItemsDesdeJson(jsonGineco));
  }else{
    html += auroRenderPrevioItemsPremium('Gineco-obstétricos', auroExtraerItemsAntecedentePremium(fuenteGineco, 'gineco'));
  }

  html += auroRenderPrevioItemsPremium('Medicación actual', auroExtraerItemsAntecedentePremium(h.medicacion_actual || '', 'medicacion'));
  html += auroRenderPrevioItemsPremium('Familiares', auroExtraerItemsAntecedentePremium(h.antecedentes_familiares || '', 'familiares'));

  content.innerHTML = html;

  const estadoPrevio = box.dataset.estado || 'visible';
  if(estadoPrevio === 'oculto') content.classList.add('auro-previos-collapsed');
  else content.classList.remove('auro-previos-collapsed');

  const btn = box.querySelector('.auro-previos-hide');
  if(btn){
    btn.innerHTML = estadoPrevio === 'oculto'
      ? '<i class="bi bi-eye me-1"></i> Mostrar'
      : '<i class="bi bi-eye-slash me-1"></i> Ocultar';
  }

  box.dataset.idHistoriaOrigen = h.id_historia || '';
  box.dataset.modo = modo || '';
  box.style.display = content.innerHTML.trim() ? 'block' : 'none';
}

console.log('IASYN antecedentes.js: FIX FINAL grupos vacíos + campos incompletos cargado');


/* ==========================================================
   IASYN UI PREMIUM FINAL - TARJETAS RESUMEN ANTECEDENTES
   Solo cambia diseño visual de la caja resumen.
   No modifica guardado, lectura, Google Sheets, Apps Script ni index.html.
   ========================================================== */

function auroInyectarEstilosAntecedentesPremium(){
  const anterior = document.getElementById('auroAntecedentesPremiumStyle');
  if(anterior) anterior.remove();

  const style = document.createElement('style');
  style.id = 'auroAntecedentesPremiumStyle';
  style.textContent = `
    .auro-previos-box{
      background:linear-gradient(135deg,#ffffff 0%,#fff6fb 48%,#ffffff 100%)!important;
      border:1px solid rgba(194,59,131,.16)!important;
      border-radius:22px!important;
      padding:18px!important;
      margin:14px 0 18px!important;
      box-shadow:0 18px 42px rgba(139,30,90,.08)!important;
      overflow:hidden!important;
    }

    .auro-previos-head{
      display:flex!important;
      justify-content:space-between!important;
      align-items:center!important;
      gap:14px!important;
      padding:0 0 14px!important;
      margin:0 0 16px!important;
      border-bottom:1px solid rgba(194,59,131,.14)!important;
    }

    .auro-previos-head b{
      display:flex!important;
      align-items:center!important;
      gap:8px!important;
      color:#7a174f!important;
      font-size:16px!important;
      font-weight:900!important;
      letter-spacing:-.02em!important;
    }

    .auro-previos-head small{
      display:block!important;
      color:#64748b!important;
      font-size:12px!important;
      font-weight:600!important;
      margin-top:4px!important;
      line-height:1.35!important;
    }

    .auro-previos-hide{
      border:1px solid rgba(194,59,131,.18)!important;
      background:#fff!important;
      color:#8b1e5a!important;
      padding:8px 12px!important;
      border-radius:999px!important;
      font-size:12px!important;
      font-weight:800!important;
      white-space:nowrap!important;
      box-shadow:0 8px 18px rgba(139,30,90,.07)!important;
    }

    .auro-previos-content{
      display:grid!important;
      gap:14px!important;
    }

    .auro-previos-content.auro-previos-collapsed{
      display:none!important;
    }

    .auro-previos-line{
      background:rgba(255,255,255,.94)!important;
      border:1px solid rgba(226,232,240,.9)!important;
      border-radius:18px!important;
      padding:14px!important;
      box-shadow:0 12px 26px rgba(15,23,42,.045)!important;
    }

    .auro-previos-line > span{
      display:flex!important;
      align-items:center!important;
      gap:8px!important;
      color:#8b1e5a!important;
      font-size:12px!important;
      font-weight:900!important;
      text-transform:uppercase!important;
      letter-spacing:.045em!important;
      margin:0 0 12px!important;
      padding:0!important;
    }

    .auro-previos-line > span i{
      width:24px!important;
      height:24px!important;
      border-radius:9px!important;
      background:linear-gradient(135deg,#fce7f3,#fdf2f8)!important;
      color:#b21d72!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      font-size:13px!important;
    }

    .auro-previos-mini-table{
      display:grid!important;
      grid-template-columns:repeat(auto-fit,minmax(240px,1fr))!important;
      gap:10px!important;
    }

    .auro-previos-mini-row{
      position:relative!important;
      background:linear-gradient(180deg,#ffffff 0%,#fffafd 100%)!important;
      border:1px solid rgba(194,59,131,.12)!important;
      border-radius:16px!important;
      padding:13px 14px!important;
      min-height:76px!important;
      box-shadow:0 8px 18px rgba(139,30,90,.055)!important;
      break-inside:avoid!important;
      page-break-inside:avoid!important;
      overflow:hidden!important;
    }

    .auro-previos-mini-row::before{
      content:''!important;
      position:absolute!important;
      left:0!important;
      top:0!important;
      right:0!important;
      height:4px!important;
      background:linear-gradient(90deg,#b21d72,#e879b9,#f9a8d4)!important;
      opacity:.95!important;
    }

    .auro-previos-mini-row b{
      display:block!important;
      color:#172033!important;
      font-size:13.5px!important;
      font-weight:900!important;
      margin:4px 0 8px!important;
      line-height:1.22!important;
      letter-spacing:-.01em!important;
    }

    .auro-previos-mini-row em{
      display:flex!important;
      flex-wrap:wrap!important;
      gap:6px!important;
      color:#475569!important;
      font-size:11.5px!important;
      font-style:normal!important;
      line-height:1.25!important;
    }

    .auro-previos-detail-pill{
      display:inline-flex!important;
      align-items:center!important;
      gap:5px!important;
      background:#fff!important;
      border:1px solid rgba(226,232,240,.95)!important;
      border-radius:999px!important;
      padding:5px 9px!important;
      color:#334155!important;
      font-size:11px!important;
      font-weight:800!important;
      box-shadow:0 3px 8px rgba(15,23,42,.035)!important;
      max-width:100%!important;
    }

    .auro-previos-detail-pill i{
      color:#b21d72!important;
      font-size:11px!important;
      flex:0 0 auto!important;
    }

    @media(max-width:760px){
      .auro-previos-box{padding:14px!important;border-radius:18px!important;}
      .auro-previos-head{display:block!important;}
      .auro-previos-hide{margin-top:10px!important;}
      .auro-previos-mini-table{grid-template-columns:1fr!important;}
      .auro-previos-mini-row{min-height:auto!important;}
    }

    @media print{
      .auro-previos-box{
        background:#fff!important;
        padding:8px!important;
        margin:4px 0!important;
        box-shadow:none!important;
        border-radius:10px!important;
        border:1px solid rgba(139,30,90,.18)!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      .auro-previos-head{
        padding-bottom:6px!important;
        margin-bottom:6px!important;
      }
      .auro-previos-head b{font-size:12px!important;}
      .auro-previos-head small{font-size:9px!important;}
      .auro-previos-hide{display:none!important;}
      .auro-previos-content{gap:5px!important;}
      .auro-previos-line{
        padding:7px!important;
        box-shadow:none!important;
        border-radius:8px!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      .auro-previos-line > span{
        font-size:9.5px!important;
        margin-bottom:5px!important;
      }
      .auro-previos-line > span i{
        width:18px!important;
        height:18px!important;
        font-size:9px!important;
      }
      .auro-previos-mini-table{
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:5px!important;
      }
      .auro-previos-mini-row{
        padding:6px 7px!important;
        border-radius:7px!important;
        min-height:auto!important;
        box-shadow:none!important;
      }
      .auro-previos-mini-row::before{height:2px!important;}
      .auro-previos-mini-row b{
        font-size:10.5px!important;
        margin:2px 0 4px!important;
        line-height:1.15!important;
      }
      .auro-previos-mini-row em{
        gap:3px!important;
        font-size:9.5px!important;
        line-height:1.15!important;
      }
      .auro-previos-detail-pill{
        padding:2px 5px!important;
        font-size:9px!important;
        border-radius:6px!important;
        box-shadow:none!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function auroRenderDetallePremium(detalle){
  const raw = String(detalle || '').trim();
  if(!raw) return '';

  const partes = raw
    .split(/\s*·\s*/)
    .map(x => x.trim())
    .filter(Boolean);

  return partes.map(p => {
    let icon = 'bi-check2-circle';
    let texto = p;

    if(/^Tiempo:/i.test(p)){
      icon = 'bi-hourglass-split';
      texto = p.replace(/^Tiempo:\s*/i, 'Evolución: ');
    }else if(/^Evolución:/i.test(p)){
      icon = 'bi-hourglass-split';
    }else if(/^(Tratamiento|Medicamento|Medicación):/i.test(p)){
      icon = 'bi-capsule-pill';
      texto = p.replace(/^(Tratamiento|Medicamento|Medicación):\s*/i, 'Tratamiento: ');
    }else if(/^(Fecha|Año|Programada|Administrada):/i.test(p)){
      icon = 'bi-calendar-check';
    }else if(/^(Resultado):/i.test(p)){
      icon = 'bi-clipboard2-check';
    }else if(/^(Reacción|Reaccion|Alergia):/i.test(p)){
      icon = 'bi-exclamation-circle';
    }else if(/^(Marca|Vacuna):/i.test(p)){
      icon = 'bi-shield-check';
    }else if(/^(Presentó|Ex consumidor|Aplicada|No aplica):/i.test(p)){
      icon = 'bi-check-circle';
    }

    return `<span class="auro-previos-detail-pill"><i class="bi ${icon}"></i>${auroEscapeHtml(texto)}</span>`;
  }).join('');
}

function auroRenderPrevioItemsPremium(label, items){
  items = (items || [])
    .map(x => {
      if(!x) return null;
      const titulo = String(x.titulo || '').trim();
      const detalle = typeof auroLimpiarDetalleResumenClinico === 'function'
        ? auroLimpiarDetalleResumenClinico(x.detalle || '')
        : String(x.detalle || '').trim();

      const tituloValido = typeof auroValorClinicoReal === 'function'
        ? auroValorClinicoReal(titulo)
        : auroEsValorPrevioUtil(titulo);

      if(!tituloValido) return null;
      if(auroEsTokenTecnicoAntecedente(titulo)) return null;
      return { titulo, detalle };
    })
    .filter(Boolean);

  if(!items.length) return '';

  const icono = auroIconoSeccionAntecedente(label);

  return `
    <section class="auro-previos-line auro-previos-compact">
      <span><i class="bi ${icono}"></i>${auroEscapeHtml(label)}</span>
      <div class="auro-previos-mini-table">
        ${items.map(it => `
          <article class="auro-previos-mini-row">
            <b>${auroEscapeHtml(it.titulo)}</b>
            ${it.detalle ? `<em>${auroRenderDetallePremium(it.detalle)}</em>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

console.log('IASYN antecedentes.js: UI PREMIUM tarjetas limpias cargado');
/* ==========================================================
   IASYN ANTECEDENTES - RESPONSIVE PREMIUM MÓVIL v1.1
   Alcance EXCLUSIVO: teléfonos (hasta 760 px).
   - No cambia escritorio.
   - No cambia IDs, nombres, data-attributes ni funciones clínicas.
   - No modifica lectura, guardado, Google Sheets ni Apps Script.
   - Los acordeones solo ocultan visualmente; los campos siguen en el DOM.
   ========================================================== */

function auroAntecedentesMobileInyectarEstilos(){
  if(document.getElementById('auroAntecedentesMobileResponsiveStyle')) return;

  const style = document.createElement('style');
  style.id = 'auroAntecedentesMobileResponsiveStyle';
  style.textContent = `
    @media (max-width:760px){
      html,body{max-width:100%!important;overflow-x:hidden!important;}

      #hc_antecedentes{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        overflow-x:hidden!important;
        padding-left:10px!important;
        padding-right:10px!important;
      }

      #hc_antecedentes > .clinical-subtitle{
        font-size:16px!important;
        line-height:1.25!important;
        margin-bottom:10px!important;
        gap:7px!important;
      }

      #hc_antecedentes .row,
      #hc_antecedentes [class*="col-"]{
        min-width:0!important;
        max-width:100%!important;
      }

      #hc_antecedentes > .row.g-3{
        --bs-gutter-x:0!important;
        --bs-gutter-y:10px!important;
        margin-left:0!important;
        margin-right:0!important;
      }

      #hc_antecedentes > .row.g-3 > [class*="col-"]{
        width:100%!important;
        flex:0 0 100%!important;
        padding-left:0!important;
        padding-right:0!important;
      }

      #hc_antecedentes input.form-control,
      #hc_antecedentes select.form-select,
      #hc_antecedentes textarea.form-control,
      #hc_antecedentes .input-group-text{
        font-size:16px!important;
      }

      #hc_antecedentes input.form-control,
      #hc_antecedentes select.form-select{
        min-height:44px!important;
        border-radius:11px!important;
      }

      #hc_antecedentes textarea.form-control{
        min-height:88px!important;
        border-radius:12px!important;
        line-height:1.4!important;
      }

      #hc_antecedentes input[type="checkbox"],
      #hc_antecedentes input[type="radio"]{
        width:20px!important;
        height:20px!important;
        min-width:20px!important;
        margin:0!important;
      }

      /* Acordeón móvil seguro: no mueve ni elimina controles */
      #hc_antecedentes .auro-ant-mobile-section{
        background:#fff!important;
        border:1px solid rgba(139,30,90,.12)!important;
        border-radius:16px!important;
        padding:10px!important;
        box-shadow:0 7px 18px rgba(15,23,42,.045)!important;
        overflow:hidden!important;
      }

      #hc_antecedentes .auro-ant-mobile-toggle{
        width:100%!important;
        min-height:46px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:10px!important;
        border:0!important;
        background:linear-gradient(135deg,#fff7fb 0%,#fff 100%)!important;
        color:#7a174f!important;
        border-radius:12px!important;
        padding:10px 12px!important;
        text-align:left!important;
        font-size:14px!important;
        line-height:1.25!important;
        font-weight:900!important;
        box-shadow:none!important;
      }

      #hc_antecedentes .auro-ant-mobile-toggle-title{
        display:flex!important;
        align-items:center!important;
        gap:8px!important;
        min-width:0!important;
      }

      #hc_antecedentes .auro-ant-mobile-toggle-title i{
        flex:0 0 auto!important;
        color:#b21d72!important;
      }

      #hc_antecedentes .auro-ant-mobile-toggle-chevron{
        flex:0 0 auto!important;
        transition:transform .2s ease!important;
      }

      #hc_antecedentes .auro-ant-mobile-section:not(.auro-ant-mobile-collapsed) > .auro-ant-mobile-toggle{
        margin-bottom:10px!important;
      }

      #hc_antecedentes .auro-ant-mobile-section.auro-ant-mobile-collapsed > .auro-ant-mobile-toggle .auro-ant-mobile-toggle-chevron{
        transform:rotate(-90deg)!important;
      }

      #hc_antecedentes .auro-ant-mobile-section.auro-ant-mobile-collapsed > :not(.auro-ant-mobile-toggle){
        display:none!important;
      }


      /* Vacunas premium: cada biológico funciona como miniacordeón SOLO en teléfono */
      #hc_antecedentes .vacunas-table tr.auro-vacuna-mobile-item{
        padding:0!important;
        gap:0!important;
        overflow:hidden!important;
        background:#fff!important;
        border:1px solid rgba(139,30,90,.13)!important;
        box-shadow:0 5px 14px rgba(15,23,42,.045)!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle{
        width:100%!important;
        min-height:48px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:10px!important;
        border:0!important;
        background:linear-gradient(135deg,#fff7fb 0%,#ffffff 100%)!important;
        color:#721447!important;
        padding:11px 12px!important;
        text-align:left!important;
        font-size:13px!important;
        font-weight:900!important;
        line-height:1.25!important;
        cursor:pointer!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle-main{
        display:flex!important;
        align-items:center!important;
        gap:9px!important;
        min-width:0!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle-main > i{
        width:31px!important;
        height:31px!important;
        flex:0 0 31px!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        border-radius:10px!important;
        background:rgba(178,29,114,.09)!important;
        color:#b21d72!important;
        font-size:15px!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle-text{
        min-width:0!important;
        display:grid!important;
        gap:2px!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle-title{
        display:block!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle-hint{
        display:block!important;
        color:#7c8798!important;
        font-size:10.5px!important;
        font-weight:700!important;
      }

      #hc_antecedentes .auro-vacuna-mobile-toggle-chevron{
        flex:0 0 auto!important;
        color:#9b2c68!important;
        transition:transform .2s ease!important;
      }

      #hc_antecedentes .vacunas-table tr.auro-vacuna-mobile-item:not(.auro-vacuna-mobile-collapsed) > .auro-vacuna-mobile-toggle{
        border-bottom:1px solid rgba(139,30,90,.10)!important;
      }

      #hc_antecedentes .vacunas-table tr.auro-vacuna-mobile-item:not(.auro-vacuna-mobile-collapsed) > td{
        padding:10px 11px 0!important;
      }

      #hc_antecedentes .vacunas-table tr.auro-vacuna-mobile-item:not(.auro-vacuna-mobile-collapsed) > td:last-child{
        padding-bottom:11px!important;
      }

      #hc_antecedentes .vacunas-table tr.auro-vacuna-mobile-collapsed > td{
        display:none!important;
      }

      #hc_antecedentes .vacunas-table tr.auro-vacuna-mobile-collapsed .auro-vacuna-mobile-toggle-chevron{
        transform:rotate(-90deg)!important;
      }

      /* Etiquetas clínicas visibles SOLO en móvil dentro de cada dosis de vacuna.
         No mueve, reemplaza ni renombra controles: usa únicamente data-* visuales. */
      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label]::before{
        content:attr(data-auro-vacuna-mobile-label)!important;
        display:block!important;
        margin:0 0 6px!important;
        color:#5f2948!important;
        font-size:11.5px!important;
        line-height:1.25!important;
        font-weight:900!important;
        letter-spacing:.01em!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Fecha programada"]::before{
        content:'📅  Fecha programada'!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Fecha de administración"]::before{
        content:'💉  Fecha de administración'!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Vacuna aplicada"]::before{
        content:'✓  Vacuna aplicada'!important;
        margin:0 10px 0 0!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Vacuna aplicada"]{
        display:flex!important;
        align-items:center!important;
        min-height:38px!important;
        padding:7px 9px!important;
        border-radius:10px!important;
        background:#fff8fc!important;
        border:1px solid rgba(139,30,90,.10)!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Vacuna aplicada"] input[type="checkbox"]{
        margin:0!important;
        flex:0 0 auto!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Observación clínica"]::before{
        content:'📝  Observación clínica'!important;
      }

      #hc_antecedentes .vacunas-table td[data-auro-vacuna-mobile-label="Nombre comercial"]::before{
        content:'Nombre comercial'!important;
      }

      /* Evita duplicar visualmente el título original dentro del acordeón */
      #hc_antecedentes .auro-ant-mobile-section > .clinical-subtitle:first-of-type,
      #hc_antecedentes .auro-ant-mobile-section > label.form-label.fw-bold:first-of-type{
        margin-top:2px!important;
      }

      /* Ayudas rápidas */
      #auroV21AntecedentesHelp{
        display:block!important;
        padding:12px!important;
        border-radius:15px!important;
        margin:8px 0 12px!important;
      }

      #auroV21AntecedentesHelp > div:first-child b{
        font-size:14px!important;
      }

      #auroV21AntecedentesHelp > div:first-child small{
        font-size:11px!important;
        line-height:1.3!important;
      }

      #auroV21AntecedentesHelp .auro-v21-help-actions{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:7px!important;
        margin-top:10px!important;
      }

      #auroV21AntecedentesHelp .auro-v21-helper-btn{
        width:100%!important;
        min-height:42px!important;
        justify-content:flex-start!important;
        text-align:left!important;
        white-space:normal!important;
        font-size:13px!important;
        border-radius:11px!important;
      }

      /* Tablas convertidas en tarjetas legibles en teléfono */
      #hc_antecedentes .antecedentes-table-wrap,
      #hc_antecedentes .vacunas-table-wrap,
      #hc_antecedentes .habitos-table-wrap,
      #hc_antecedentes .estilo-vida-table-wrap,
      #hc_antecedentes .obstetricos-table-wrap,
      #hc_antecedentes .ginecologicos-table-wrap{
        width:100%!important;
        max-width:100%!important;
        overflow:visible!important;
        border:0!important;
        box-shadow:none!important;
      }

      #hc_antecedentes .antecedentes-table,
      #hc_antecedentes .vacunas-table,
      #hc_antecedentes .habitos-table,
      #hc_antecedentes .estilo-vida-table,
      #hc_antecedentes .obstetricos-table,
      #hc_antecedentes .ginecologicos-table{
        display:block!important;
        width:100%!important;
        min-width:0!important;
        border-collapse:separate!important;
      }

      #hc_antecedentes .antecedentes-table thead,
      #hc_antecedentes .vacunas-table thead,
      #hc_antecedentes .habitos-table thead,
      #hc_antecedentes .estilo-vida-table thead,
      #hc_antecedentes .obstetricos-table thead,
      #hc_antecedentes .ginecologicos-table thead{
        display:none!important;
      }

      #hc_antecedentes .antecedentes-table tbody,
      #hc_antecedentes .vacunas-table tbody,
      #hc_antecedentes .habitos-table tbody,
      #hc_antecedentes .estilo-vida-table tbody,
      #hc_antecedentes .obstetricos-table tbody,
      #hc_antecedentes .ginecologicos-table tbody{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:9px!important;
        width:100%!important;
      }

      #hc_antecedentes .antecedentes-table tr,
      #hc_antecedentes .vacunas-table tr,
      #hc_antecedentes .habitos-table tr,
      #hc_antecedentes .estilo-vida-table tr,
      #hc_antecedentes .obstetricos-table tr,
      #hc_antecedentes .ginecologicos-table tr{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:7px!important;
        width:100%!important;
        padding:11px!important;
        background:linear-gradient(180deg,#fff 0%,#fffafd 100%)!important;
        border:1px solid rgba(139,30,90,.11)!important;
        border-radius:13px!important;
        box-shadow:0 4px 12px rgba(15,23,42,.035)!important;
      }

      #hc_antecedentes .antecedentes-table td,
      #hc_antecedentes .vacunas-table td,
      #hc_antecedentes .habitos-table td,
      #hc_antecedentes .estilo-vida-table td,
      #hc_antecedentes .obstetricos-table td,
      #hc_antecedentes .ginecologicos-table td{
        display:block!important;
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        padding:0!important;
        border:0!important;
        white-space:normal!important;
      }

      #hc_antecedentes td.patologia-nombre,
      #hc_antecedentes td.cirugia-nombre,
      #hc_antecedentes td.alergia-nombre,
      #hc_antecedentes td.obstetrico-descripcion,
      #hc_antecedentes td.ginecologico-descripcion{
        font-size:14px!important;
        font-weight:900!important;
        color:#172033!important;
        line-height:1.3!important;
        padding-bottom:2px!important;
      }

      #hc_antecedentes td.check-cell,
      #hc_antecedentes td.obstetrico-no-aplica{
        display:flex!important;
        align-items:center!important;
        justify-content:flex-start!important;
        min-height:30px!important;
      }

      #hc_antecedentes td.check-cell::before{
        content:'Marcar antecedente'!important;
        margin-right:10px!important;
        color:#64748b!important;
        font-size:12px!important;
        font-weight:700!important;
      }

      #hc_antecedentes td.obstetrico-no-aplica::before{
        content:'No aplica'!important;
        margin-right:10px!important;
        color:#64748b!important;
        font-size:12px!important;
        font-weight:700!important;
      }

      #hc_antecedentes .campo-corto{
        width:100%!important;
        max-width:none!important;
      }

      #hc_antecedentes .auro-v21-unit-wrap{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) 118px!important;
        gap:7px!important;
        width:100%!important;
      }

      #hc_antecedentes .auro-v21-unit-select{
        width:100%!important;
        min-width:0!important;
        font-size:16px!important;
      }

      #hc_antecedentes .gine-radio{
        display:flex!important;
        flex-wrap:wrap!important;
        gap:8px!important;
      }

      #hc_antecedentes .gine-radio label{
        min-height:42px!important;
        display:inline-flex!important;
        align-items:center!important;
        gap:8px!important;
        padding:8px 12px!important;
        border:1px solid rgba(139,30,90,.14)!important;
        border-radius:11px!important;
        background:#fff!important;
      }

      /* COVID, alimentación y tarjetas especiales */
      #hc_antecedentes .covid-card,
      #hc_antecedentes .alimentacion-card,
      #hc_antecedentes [class*="vacuna-card"],
      #hc_antecedentes [class*="habito-card"],
      #hc_antecedentes [class*="estilo-card"]{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        border-radius:14px!important;
      }

      #hc_antecedentes .alimentacion-grid,
      #hc_antecedentes .alimentacion-grid-secondary,
      #hc_antecedentes [class*="covid-grid"],
      #hc_antecedentes [class*="vacuna-grid"],
      #hc_antecedentes [class*="habito-grid"],
      #hc_antecedentes [class*="estilo-grid"]{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:9px!important;
      }

      #hc_antecedentes .alimentacion-card-body,
      #hc_antecedentes .covid-card-body{
        padding:11px!important;
      }

      #hc_antecedentes .clinical-note{
        font-size:11px!important;
        line-height:1.35!important;
        padding:8px 9px!important;
        overflow-wrap:anywhere!important;
      }

      /* Resumen de antecedentes previos */
      #hc_antecedentes .auro-previos-box{
        width:100%!important;
        max-width:100%!important;
        padding:12px!important;
        margin:10px 0 12px!important;
        border-radius:16px!important;
      }

      #hc_antecedentes .auro-previos-head{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:8px!important;
      }

      #hc_antecedentes .auro-previos-head b{
        font-size:14px!important;
        line-height:1.3!important;
      }

      #hc_antecedentes .auro-previos-hide{
        width:100%!important;
        min-height:40px!important;
        margin-top:0!important;
      }

      #hc_antecedentes .auro-previos-mini-table{
        grid-template-columns:1fr!important;
      }

      #hc_antecedentes .auro-previos-mini-row{
        min-width:0!important;
        padding:11px 12px!important;
        border-radius:13px!important;
      }

      #hc_antecedentes .auro-previos-detail-pill{
        white-space:normal!important;
        overflow-wrap:anywhere!important;
        border-radius:9px!important;
        align-items:flex-start!important;
      }
    }

    @media (max-width:390px){
      #hc_antecedentes{padding-left:7px!important;padding-right:7px!important;}
      #hc_antecedentes .auro-v21-unit-wrap{grid-template-columns:1fr!important;}
      #hc_antecedentes .auro-ant-mobile-toggle{font-size:13px!important;padding:9px 10px!important;}
    }
  `;

  document.head.appendChild(style);
}

function auroAntecedentesMobileTituloSeccion(columna, indice){
  const subtitle = columna.querySelector(':scope > .clinical-subtitle');
  const label = columna.querySelector(':scope > label.form-label');
  const cardHead = columna.querySelector(':scope > .alimentacion-card .alimentacion-card-head, :scope > .covid-card .covid-card-head');

  const texto = String(
    subtitle?.textContent ||
    label?.textContent ||
    cardHead?.textContent ||
    ('Sección ' + (indice + 1))
  ).replace(/\s+/g,' ').trim();

  return texto || ('Sección ' + (indice + 1));
}

function auroAntecedentesMobileIcono(titulo){
  const n = typeof auroNormalizarClaveClinica === 'function'
    ? auroNormalizarClaveClinica(titulo)
    : String(titulo || '').toLowerCase();

  if(n.includes('patolog')) return 'bi-heart-pulse';
  if(n.includes('quir')) return 'bi-scissors';
  if(n.includes('alerg')) return 'bi-exclamation-triangle';
  if(n.includes('covid')) return 'bi-virus';
  if(n.includes('vacun')) return 'bi-shield-check';
  if(n.includes('habito')) return 'bi-person-lines-fill';
  if(n.includes('actividad') || n.includes('estilo')) return 'bi-activity';
  if(n.includes('obst')) return 'bi-person-hearts';
  if(n.includes('gine')) return 'bi-gender-female';
  if(n.includes('alimenta')) return 'bi-egg-fried';
  if(n.includes('medic')) return 'bi-capsule-pill';
  if(n.includes('famil')) return 'bi-people';
  return 'bi-journal-medical';
}

function auroAntecedentesMobileTieneDato(columna){
  const controles = columna.querySelectorAll('input,select,textarea');

  return [...controles].some(el => {
    if(el.type === 'hidden') return false;
    if(el.type === 'checkbox' || el.type === 'radio') return !!el.checked;
    return String(el.value || '').trim() !== '';
  });
}

function auroAntecedentesMobileDebeAbrir(titulo, columna, indice){
  if(auroAntecedentesMobileTieneDato(columna)) return true;

  const n = typeof auroNormalizarClaveClinica === 'function'
    ? auroNormalizarClaveClinica(titulo)
    : String(titulo || '').toLowerCase();

  // Mantiene visible la primera sección clínica para orientar el llenado.
  if(n.includes('patolog')) return true;
  if(indice === 0) return true;
  return false;
}

function auroAntecedentesMobileCrearAcordeones(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  const filaPrincipal = panel.querySelector(':scope > .row.g-3');
  if(!filaPrincipal) return;

  [...filaPrincipal.children].forEach((columna, indice) => {
    if(!(columna instanceof HTMLElement)) return;
    if(columna.dataset.auroAntMobileReady === '1') return;

    const titulo = auroAntecedentesMobileTituloSeccion(columna, indice);
    const icono = auroAntecedentesMobileIcono(titulo);
    const btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'auro-ant-mobile-toggle';
    btn.setAttribute('aria-expanded','true');
    btn.innerHTML = `
      <span class="auro-ant-mobile-toggle-title"><i class="bi ${icono}"></i><span>${typeof auroEscapeHtml === 'function' ? auroEscapeHtml(titulo) : titulo}</span></span>
      <i class="bi bi-chevron-down auro-ant-mobile-toggle-chevron"></i>
    `;

    btn.addEventListener('click', () => {
      const cerrado = columna.classList.toggle('auro-ant-mobile-collapsed');
      btn.setAttribute('aria-expanded', cerrado ? 'false' : 'true');
    });

    columna.classList.add('auro-ant-mobile-section');
    columna.insertBefore(btn, columna.firstChild);
    columna.dataset.auroAntMobileReady = '1';

    const abrir = auroAntecedentesMobileDebeAbrir(titulo, columna, indice);
    columna.classList.toggle('auro-ant-mobile-collapsed', !abrir);
    btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
}


function auroAntecedentesMobileTextoVacuna(fila, indice){
  const candidato = fila.querySelector('.vacuna-nombre, .biologico-nombre, td:first-of-type');
  let texto = String(candidato?.textContent || '').replace(/\s+/g,' ').trim();

  if(!texto){
    const control = fila.querySelector('input[data-vacuna], select[data-vacuna], input[name*="vacuna" i], select[name*="vacuna" i]');
    texto = String(control?.dataset?.vacuna || control?.getAttribute('aria-label') || control?.placeholder || '').trim();
  }

  texto = texto.replace(/^(vacuna|biológico|biologico)\s*[:\-]?\s*/i,'').trim();
  return texto || ('Vacuna ' + (indice + 1));
}

function auroAntecedentesMobileEtiquetarCamposVacunas(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  panel.querySelectorAll('.vacunas-table input, .vacunas-table select, .vacunas-table textarea').forEach(control => {
    if(!(control instanceof HTMLElement)) return;

    const id = String(control.id || '');
    const celda = control.closest('td');
    if(!celda) return;

    let etiqueta = '';
    if(/Nombre$/i.test(id)) etiqueta = 'Nombre comercial';
    else if(/Prog\d+$/i.test(id)) etiqueta = 'Fecha programada';
    else if(/Adm\d+$/i.test(id)) etiqueta = 'Fecha de administración';
    else if(/Apl\d+$/i.test(id)) etiqueta = 'Vacuna aplicada';
    else if(/Obs\d+$/i.test(id)) etiqueta = 'Observación clínica';

    if(etiqueta){
      celda.dataset.auroVacunaMobileLabel = etiqueta;
    }
  });
}

function auroAntecedentesMobileQuitarEtiquetasVacunas(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  panel.querySelectorAll('.vacunas-table td[data-auro-vacuna-mobile-label]').forEach(celda => {
    delete celda.dataset.auroVacunaMobileLabel;
  });
}

function auroAntecedentesMobileCrearVacunasDesplegables(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  const filas = panel.querySelectorAll('.vacunas-table tbody tr');
  filas.forEach((fila, indice) => {
    if(!(fila instanceof HTMLElement)) return;
    if(fila.dataset.auroVacunaMobileReady === '1') return;

    const titulo = auroAntecedentesMobileTextoVacuna(fila, indice);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auro-vacuna-mobile-toggle';
    btn.setAttribute('aria-expanded','false');
    btn.innerHTML = `
      <span class="auro-vacuna-mobile-toggle-main">
        <i class="bi bi-shield-check"></i>
        <span class="auro-vacuna-mobile-toggle-text">
          <span class="auro-vacuna-mobile-toggle-title">${typeof auroEscapeHtml === 'function' ? auroEscapeHtml(titulo) : titulo}</span>
          <small class="auro-vacuna-mobile-toggle-hint">Tocar para ver o registrar dosis</small>
        </span>
      </span>
      <i class="bi bi-chevron-down auro-vacuna-mobile-toggle-chevron"></i>
    `;

    btn.addEventListener('click', () => {
      const cerrado = fila.classList.toggle('auro-vacuna-mobile-collapsed');
      btn.setAttribute('aria-expanded', cerrado ? 'false' : 'true');
    });

    fila.classList.add('auro-vacuna-mobile-item','auro-vacuna-mobile-collapsed');
    fila.insertBefore(btn, fila.firstChild);
    fila.dataset.auroVacunaMobileReady = '1';
  });
}

function auroAntecedentesMobileEliminarVacunasDesplegables(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  panel.querySelectorAll('.vacunas-table tr.auro-vacuna-mobile-item').forEach(fila => {
    fila.classList.remove('auro-vacuna-mobile-item','auro-vacuna-mobile-collapsed');
    delete fila.dataset.auroVacunaMobileReady;
    fila.querySelector(':scope > .auro-vacuna-mobile-toggle')?.remove();
  });
}

function auroAntecedentesMobileEliminarAcordeones(){
  const panel = document.getElementById('hc_antecedentes');
  if(!panel) return;

  panel.querySelectorAll('.auro-ant-mobile-section').forEach(columna => {
    columna.classList.remove('auro-ant-mobile-section','auro-ant-mobile-collapsed');
    delete columna.dataset.auroAntMobileReady;
    columna.querySelector(':scope > .auro-ant-mobile-toggle')?.remove();
  });
}

function auroAntecedentesMobileSincronizar(){
  const movil = window.matchMedia('(max-width:760px)').matches;
  if(movil){
    auroAntecedentesMobileCrearAcordeones();
    auroAntecedentesMobileCrearVacunasDesplegables();
    auroAntecedentesMobileEtiquetarCamposVacunas();
  }else{
    auroAntecedentesMobileQuitarEtiquetasVacunas();
    auroAntecedentesMobileEliminarVacunasDesplegables();
    auroAntecedentesMobileEliminarAcordeones();
  }
}

function auroAntecedentesMobileInicializar(){
  auroAntecedentesMobileInyectarEstilos();
  auroAntecedentesMobileSincronizar();

  // Reintentos seguros por si la tabla de vacunas se renderiza después del panel.
  setTimeout(auroAntecedentesMobileSincronizar, 700);
  setTimeout(auroAntecedentesMobileSincronizar, 1400);

  if(window.__auroAntecedentesMobileResizeReady !== true){
    window.__auroAntecedentesMobileResizeReady = true;
    let timer = null;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(auroAntecedentesMobileSincronizar, 120);
    }, {passive:true});
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(auroAntecedentesMobileInicializar, 420);
  });
}else{
  setTimeout(auroAntecedentesMobileInicializar, 420);
}

console.log('IASYN antecedentes.js: RESPONSIVE PREMIUM MÓVIL v1.2 + VACUNAS ETIQUETADAS cargado');
/* ============================================================
   IASYN FIX QUIRÚRGICO - NO GUARDAR ANTECEDENTES VACÍOS
   Alcance exclusivo:
   - Solo modifica el valor devuelto por
     recopilarAntecedentesPersonalesCompletos().
   - Conserva el formato JSON y el marcador vigente cuando existe
     al menos un dato clínico real.
   - Ignora únicamente estructuras técnicas predeterminadas, como
     los números 1, 2, 3 y 4 de las dosis COVID sin contenido.
   - No modifica botones, eventos, carga, edición, actualización,
     diseño, columnas, Apps Script ni otros módulos.
   ============================================================ */
function auroAntecedentesTieneDatoRealFinal_(valor, clave){
  const clavesTecnicas = {
    numero: true,
    key: true,
    biologico: true,
    actividad: true,
    habito: true
  };

  if(valor === null || valor === undefined) return false;

  if(typeof valor === 'boolean') return valor === true;

  if(typeof valor === 'number') return !Number.isNaN(valor);

  if(typeof valor === 'string'){
    if(clavesTecnicas[String(clave || '')]) return false;
    return valor.trim() !== '';
  }

  if(Array.isArray(valor)){
    return valor.some(function(item){
      return auroAntecedentesTieneDatoRealFinal_(item, '');
    });
  }

  if(typeof valor === 'object'){
    return Object.keys(valor).some(function(k){
      if(clavesTecnicas[k]) return false;
      return auroAntecedentesTieneDatoRealFinal_(valor[k], k);
    });
  }

  return false;
}

function recopilarAntecedentesPersonalesCompletos(){
  const patologicos = recopilarAntecedentesPersonalesEstructurados();

  const data = {
    patologicos: patologicos,
    covid: recopilarAntecedenteCovidEstructurado(),
    vacunas: recopilarVacunasEstructuradas(),
    habitos: recopilarHabitosEstructurados(),
    estilo_vida: recopilarEstiloVidaEstructurado(),
    alimentacion: recopilarAlimentacionEstructurada()
  };

  if(!auroAntecedentesTieneDatoRealFinal_(data, '')){
    return '';
  }

  return auroSerializar(AURO_ANT_PERSONALES_MARKER, data) || patologicos;
}

/* ============================================================
   IASYN - ANTECEDENTES FAMILIARES ESTRUCTURADOS V1
   Alcance quirúrgico:
   - Conecta únicamente los controles familiares creados en Index 42.
   - Usa la columna existente antecedentes_familiares.
   - No modifica botones, payload, Apps Script, columnas ni otros módulos.
   - Conserva compatibilidad con texto histórico.
   ============================================================ */
(function(){
  'use strict';

  const MARCADOR = 'AUROSANAX_ANT_FAMILIARES_V1::';

  function texto_(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function selectorSeguro_(valor){
    const raw = String(valor || '');
    if(window.CSS && typeof window.CSS.escape === 'function'){
      return window.CSS.escape(raw);
    }
    return raw.replace(/["\\]/g, '\\$&');
  }

  function datosVacios_(){
    return {
      version:'AUROSANAX_ANT_FAMILIARES_V1',
      niega:false,
      patologicos:[],
      quirurgicos:[],
      otros:''
    };
  }

  function tieneDatos_(data){
    return !!(
      data?.niega === true ||
      (Array.isArray(data?.patologicos) && data.patologicos.length) ||
      (Array.isArray(data?.quirurgicos) && data.quirurgicos.length) ||
      texto_(data?.otros)
    );
  }

  function leerValor_(valor){
    const raw = texto_(valor);
    if(!raw) return {estructurado:true, data:datosVacios_(), legado:''};

    let json = raw;
    if(raw.startsWith(MARCADOR)){
      json = raw.substring(MARCADOR.length);
    }

    try{
      const obj = JSON.parse(json);
      if(obj && typeof obj === 'object'){
        return {
          estructurado:true,
          data:{
            version:'AUROSANAX_ANT_FAMILIARES_V1',
            niega:obj.niega === true,
            patologicos:Array.isArray(obj.patologicos) ? obj.patologicos : [],
            quirurgicos:Array.isArray(obj.quirurgicos) ? obj.quirurgicos : [],
            otros:texto_(obj.otros)
          },
          legado:''
        };
      }
    }catch(e){}

    return {
      estructurado:false,
      data:datosVacios_(),
      legado:raw
    };
  }

  function recopilarPatologicos_(){
    const filas = [];

    document.querySelectorAll('.hcFamiliarPatParentesco').forEach(parentescoInput => {
      const clave = texto_(parentescoInput.dataset.patologiaFamiliar);
      if(!clave) return;

      const detalleInput = document.querySelector(
        '.hcFamiliarPatDetalle[data-patologia-familiar="' +
        selectorSeguro_(clave) + '"]'
      );

      const parentesco = texto_(parentescoInput.value);
      const detalle = texto_(detalleInput?.value);
      let patologia = clave;

      if(clave === 'Otros'){
        const otroNombre = texto_(document.querySelector('.hcFamiliarPatOtroNombre')?.value);
        if(otroNombre) patologia = otroNombre;
      }

      if(parentesco || detalle || (clave === 'Otros' && patologia !== 'Otros')){
        filas.push({
          patologia:patologia,
          parentesco:parentesco,
          detalle:detalle
        });
      }
    });

    return filas;
  }

  function recopilarQuirurgicos_(){
    const filas = [];

    document.querySelectorAll('.hcFamiliarQxParentesco').forEach(parentescoInput => {
      const clave = texto_(parentescoInput.dataset.cirugiaFamiliar);
      if(!clave) return;

      const detalleInput = document.querySelector(
        '.hcFamiliarQxDetalle[data-cirugia-familiar="' +
        selectorSeguro_(clave) + '"]'
      );

      const parentesco = texto_(parentescoInput.value);
      const detalle = texto_(detalleInput?.value);
      let cirugia = clave;

      if(clave === 'Otros'){
        const otroNombre = texto_(document.querySelector('.hcFamiliarQxOtroNombre')?.value);
        if(otroNombre) cirugia = otroNombre;
      }

      if(parentesco || detalle || (clave === 'Otros' && cirugia !== 'Otros')){
        filas.push({
          cirugia:cirugia,
          parentesco:parentesco,
          detalle:detalle
        });
      }
    });

    return filas;
  }

  function recopilar_(){
    const panel = document.getElementById('hc_antecedentes');
    const data = {
      version:'AUROSANAX_ANT_FAMILIARES_V1',
      niega:panel?.dataset?.auroNiegaFamiliares === '1',
      patologicos:recopilarPatologicos_(),
      quirurgicos:recopilarQuirurgicos_(),
      otros:texto_(document.getElementById('hcFamiliaresOtros')?.value)
    };

    const valor = tieneDatos_(data)
      ? MARCADOR + JSON.stringify(data)
      : '';

    const hidden = document.getElementById('hcAntecedentesFamiliares');
    if(hidden) hidden.value = valor;

    return valor;
  }

  function limpiar_(opciones){
    const preservarHidden = opciones?.preservarHidden === true;

    document.querySelectorAll(
      '.hcFamiliarPatParentesco,.hcFamiliarPatDetalle,' +
      '.hcFamiliarQxParentesco,.hcFamiliarQxDetalle'
    ).forEach(input => input.value = '');

    const patOtro = document.querySelector('.hcFamiliarPatOtroNombre');
    const qxOtro = document.querySelector('.hcFamiliarQxOtroNombre');
    const otros = document.getElementById('hcFamiliaresOtros');

    if(patOtro) patOtro.value = '';
    if(qxOtro) qxOtro.value = '';
    if(otros) otros.value = '';

    if(!preservarHidden){
      const hidden = document.getElementById('hcAntecedentesFamiliares');
      if(hidden) hidden.value = '';

      const panel = document.getElementById('hc_antecedentes');
      if(panel) delete panel.dataset.auroNiegaFamiliares;
    }
  }

  function buscarFilaPatologica_(nombre){
    const normal = typeof window.auroNormalizarClaveClinica === 'function'
      ? window.auroNormalizarClaveClinica(nombre)
      : texto_(nombre).toLowerCase();

    return [...document.querySelectorAll('.hcFamiliarPatParentesco')].find(input => {
      const valor = texto_(input.dataset.patologiaFamiliar);
      const n = typeof window.auroNormalizarClaveClinica === 'function'
        ? window.auroNormalizarClaveClinica(valor)
        : valor.toLowerCase();
      return n === normal;
    }) || null;
  }

  function buscarFilaQuirurgica_(nombre){
    const normal = typeof window.auroNormalizarClaveClinica === 'function'
      ? window.auroNormalizarClaveClinica(nombre)
      : texto_(nombre).toLowerCase();

    return [...document.querySelectorAll('.hcFamiliarQxParentesco')].find(input => {
      const valor = texto_(input.dataset.cirugiaFamiliar);
      const n = typeof window.auroNormalizarClaveClinica === 'function'
        ? window.auroNormalizarClaveClinica(valor)
        : valor.toLowerCase();
      return n === normal;
    }) || null;
  }

  function cargarPatologicos_(filas){
    (Array.isArray(filas) ? filas : []).forEach(item => {
      const nombre = texto_(item?.patologia || item?.nombre);
      if(!nombre) return;

      let parentescoInput = buscarFilaPatologica_(nombre);
      let claveReal = texto_(parentescoInput?.dataset.patologiaFamiliar);

      if(!parentescoInput){
        parentescoInput = document.querySelector(
          '.hcFamiliarPatParentesco[data-patologia-familiar="Otros"]'
        );
        claveReal = 'Otros';
        const otro = document.querySelector('.hcFamiliarPatOtroNombre');
        if(otro) otro.value = nombre;
      }

      if(!parentescoInput) return;

      parentescoInput.value = texto_(item?.parentesco);

      const detalleInput = document.querySelector(
        '.hcFamiliarPatDetalle[data-patologia-familiar="' +
        selectorSeguro_(claveReal) + '"]'
      );
      if(detalleInput) detalleInput.value = texto_(item?.detalle);
    });
  }

  function cargarQuirurgicos_(filas){
    (Array.isArray(filas) ? filas : []).forEach(item => {
      const nombre = texto_(item?.cirugia || item?.nombre);
      if(!nombre) return;

      let parentescoInput = buscarFilaQuirurgica_(nombre);
      let claveReal = texto_(parentescoInput?.dataset.cirugiaFamiliar);

      if(!parentescoInput){
        parentescoInput = document.querySelector(
          '.hcFamiliarQxParentesco[data-cirugia-familiar="Otros"]'
        );
        claveReal = 'Otros';
        const otro = document.querySelector('.hcFamiliarQxOtroNombre');
        if(otro) otro.value = nombre;
      }

      if(!parentescoInput) return;

      parentescoInput.value = texto_(item?.parentesco);

      const detalleInput = document.querySelector(
        '.hcFamiliarQxDetalle[data-cirugia-familiar="' +
        selectorSeguro_(claveReal) + '"]'
      );
      if(detalleInput) detalleInput.value = texto_(item?.detalle);
    });
  }

  function cargar_(valor){
    limpiar_({preservarHidden:true});

    const lectura = leerValor_(valor);
    const hidden = document.getElementById('hcAntecedentesFamiliares');

    if(!lectura.estructurado){
      /*
        Compatibilidad histórica:
        el texto antiguo se conserva íntegro en la columna y se muestra
        en "Otros antecedentes familiares" sin convertirlo ni perderlo.
      */
      if(hidden) hidden.value = lectura.legado;
      const otros = document.getElementById('hcFamiliaresOtros');
      if(otros) otros.value = lectura.legado;
      return;
    }

    const panel = document.getElementById('hc_antecedentes');
    if(panel){
      if(lectura.data.niega === true) panel.dataset.auroNiegaFamiliares = '1';
      else delete panel.dataset.auroNiegaFamiliares;
    }

    cargarPatologicos_(lectura.data.patologicos);
    cargarQuirurgicos_(lectura.data.quirurgicos);

    const otros = document.getElementById('hcFamiliaresOtros');
    if(otros) otros.value = texto_(lectura.data.otros);

    if(hidden){
      hidden.value = tieneDatos_(lectura.data)
        ? MARCADOR + JSON.stringify(lectura.data)
        : '';
    }

    if(typeof window.auroV21SincronizarEstadosAyudas === 'function'){
      setTimeout(window.auroV21SincronizarEstadosAyudas, 0);
    }
  }

  function resumenItems_(valor){
    const lectura = leerValor_(valor);
    if(!lectura.estructurado){
      return lectura.legado
        ? [{titulo:'Antecedente familiar', detalle:lectura.legado}]
        : [];
    }

    const items = [];

    if(lectura.data.niega === true){
      items.push({
        titulo:'Niega antecedentes familiares relevantes',
        detalle:''
      });
      return items;
    }

    lectura.data.patologicos.forEach(x => {
      const detalle = [
        texto_(x.parentesco) ? 'Parentesco: ' + texto_(x.parentesco) : '',
        texto_(x.detalle) ? 'Detalle: ' + texto_(x.detalle) : ''
      ].filter(Boolean).join(' · ');

      if(texto_(x.patologia)){
        items.push({titulo:texto_(x.patologia), detalle:detalle});
      }
    });

    lectura.data.quirurgicos.forEach(x => {
      const detalle = [
        texto_(x.parentesco) ? 'Parentesco: ' + texto_(x.parentesco) : '',
        texto_(x.detalle) ? 'Detalle: ' + texto_(x.detalle) : ''
      ].filter(Boolean).join(' · ');

      if(texto_(x.cirugia)){
        items.push({titulo:'Cirugía: ' + texto_(x.cirugia), detalle:detalle});
      }
    });

    if(texto_(lectura.data.otros)){
      items.push({
        titulo:'Otros antecedentes familiares',
        detalle:texto_(lectura.data.otros)
      });
    }

    return items;
  }

  function conectarEventos_(){
    const panel = document.getElementById('hc_antecedentes');
    if(!panel || panel.dataset.auroFamiliaresConectado === '1') return;

    panel.dataset.auroFamiliaresConectado = '1';

    panel.addEventListener('input', event => {
      if(event.target?.matches(
        '.hcFamiliarPatParentesco,.hcFamiliarPatDetalle,.hcFamiliarPatOtroNombre,' +
        '.hcFamiliarQxParentesco,.hcFamiliarQxDetalle,.hcFamiliarQxOtroNombre,' +
        '#hcFamiliaresOtros'
      )){
        recopilar_();
      }
    });

    panel.addEventListener('change', event => {
      if(event.target?.matches(
        '.hcFamiliarPatParentesco,.hcFamiliarPatDetalle,.hcFamiliarPatOtroNombre,' +
        '.hcFamiliarQxParentesco,.hcFamiliarQxDetalle,.hcFamiliarQxOtroNombre,' +
        '#hcFamiliaresOtros'
      )){
        recopilar_();
      }
    });

    const formulario = panel.closest('form');
    if(formulario && formulario.dataset.auroFamiliaresReset !== '1'){
      formulario.dataset.auroFamiliaresReset = '1';
      formulario.addEventListener('reset', () => {
        setTimeout(() => limpiar_(), 0);
      });
    }
  }

  /*
    Envuelve únicamente la carga ya existente de Antecedentes.
    Primero conserva todo el comportamiento estable y después restaura
    las nuevas tablas familiares.
  */
  if(typeof window.auroCargarAntecedentesDesdeHistoria === 'function'){
    const cargarOriginal = window.auroCargarAntecedentesDesdeHistoria;
    window.auroCargarAntecedentesDesdeHistoria = function(h, modo){
      const resultado = cargarOriginal.apply(this, arguments);
      cargar_(h?.antecedentes_familiares || '');
      return resultado;
    };
  }

  /*
    Cuando se quita el paciente, limpia solo los controles familiares.
    Cuando se selecciona uno, la función de carga envuelta restaura los datos.
  */
  if(typeof window.seleccionarPacienteHistoria === 'function'){
    const seleccionarOriginal = window.seleccionarPacienteHistoria;
    window.seleccionarPacienteHistoria = function(){
      const resultado = seleccionarOriginal.apply(this, arguments);
      const idPaciente = texto_(document.getElementById('hcPacienteSelect')?.value);
      if(!idPaciente) limpiar_();
      return resultado;
    };
  }

  /*
    Mejora exclusiva de lectura para la caja "Antecedentes previos".
    Los demás tipos continúan usando el extractor original.
  */
  if(typeof window.auroExtraerItemsAntecedentePremium === 'function'){
    const extraerOriginal = window.auroExtraerItemsAntecedentePremium;
    window.auroExtraerItemsAntecedentePremium = function(valor, tipo){
      if(tipo === 'familiares'){
        const items = resumenItems_(valor);
        if(items.length) return items;
      }
      return extraerOriginal.apply(this, arguments);
    };
  }

  window.recopilarAntecedentesFamiliaresEstructurados = recopilar_;
  window.cargarAntecedentesFamiliaresEstructurados = cargar_;
  window.limpiarAntecedentesFamiliaresEstructurados = limpiar_;
  window.auroParsearAntecedentesFamiliares = leerValor_;

  function inicializar_(){
    conectarEventos_();

    /*
      Respeta el valor que ya hubiera colocado la historia actual.
      No inventa datos ni dispara guardados automáticos.
    */
    const hidden = document.getElementById('hcAntecedentesFamiliares');
    if(hidden && texto_(hidden.value)){
      cargar_(hidden.value);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(inicializar_, 260);
    });
  }else{
    setTimeout(inicializar_, 260);
  }

  console.log(
    'IASYN antecedentes.js: familiares estructurados V1 conectados sin cambios de backend.'
  );
})();
/* ============================================================
   IASYN - GINECOLÓGICOS REPETIBLES V1
   Alcance EXCLUSIVO:
   - Permite múltiples Citologías / PAP, Colposcopias y Biopsias.
   - Conserva íntegros los IDs y campos originales de la primera fila.
   - NO modifica Index, Apps Script, Google Sheets ni columnas.
   - NO cambia botones de guardado, fechas, temporalidades, ayudas rápidas,
     limpieza general, seguridad, diagnóstico ni conexiones con otros módulos.
   - Historias antiguas sin "registros" continúan funcionando exactamente igual.
   - Los registros adicionales se guardan dentro del JSON ginecológico existente.
   ============================================================ */
(function(){
  'use strict';

  const CONFIG = {
    pap: {
      label: 'Citología / PAP',
      fechaId: 'hcGinPapFecha',
      resultadoId: 'hcGinPapResultado',
      estadoId: 'hcGinPapEstado'
    },
    colposcopia: {
      label: 'Colposcopia',
      fechaId: 'hcGinColposcopiaFecha',
      resultadoId: 'hcGinColposcopiaResultado',
      estadoId: 'hcGinColposcopiaEstado'
    },
    biopsia: {
      label: 'Biopsia',
      fechaId: 'hcGinBiopsiaFecha',
      resultadoId: 'hcGinBiopsiaResultado',
      estadoId: ''
    }
  };

  function texto_(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function selectorSeguro_(valor){
    const raw = String(valor || '');
    if(window.CSS && typeof window.CSS.escape === 'function'){
      return window.CSS.escape(raw);
    }
    return raw.replace(/["\\]/g, '\\$&');
  }

  function obtenerFilaBase_(tipo){
    const cfg = CONFIG[tipo];
    if(!cfg) return null;
    const input = document.getElementById(cfg.fechaId);
    return input?.closest('tr') || null;
  }

  function obtenerTbody_(){
    return document.querySelector('#hc_antecedentes .ginecologicos-table tbody') || null;
  }

  function registrosAdicionalesDOM_(tipo){
    return [...document.querySelectorAll(
      '#hc_antecedentes .auro-gine-repetible-row[data-auro-gine-tipo="' +
      selectorSeguro_(tipo) + '"]'
    )];
  }

  function leerRegistrosAdicionales_(tipo){
    return registrosAdicionalesDOM_(tipo)
      .map(fila => ({
        fecha: texto_(fila.querySelector('.auro-gine-repetible-fecha')?.value),
        resultado: texto_(fila.querySelector('.auro-gine-repetible-resultado')?.value)
      }))
      .filter(item => item.fecha || item.resultado);
  }

  function actualizarNumeracion_(tipo){
    const cfg = CONFIG[tipo];
    registrosAdicionalesDOM_(tipo).forEach((fila, indice) => {
      const n = indice + 2;
      const titulo = fila.querySelector('.ginecologico-descripcion');
      if(titulo) titulo.textContent = cfg.label + ' ' + n;
      const btn = fila.querySelector('.auro-gine-repetible-eliminar');
      if(btn) btn.setAttribute('aria-label', 'Eliminar ' + cfg.label + ' ' + n);
    });
  }

  function dispararResumen_(){
    if(typeof window.updateClinicalSummary === 'function'){
      try{ window.updateClinicalSummary(); }catch(e){}
    }
  }

  function crearFilaAdicional_(tipo, datos){
    const cfg = CONFIG[tipo];
    const base = obtenerFilaBase_(tipo);
    const tbody = obtenerTbody_();
    if(!cfg || !base || !tbody) return null;

    const fila = document.createElement('tr');
    fila.className = 'auro-gine-repetible-row';
    fila.dataset.auroGineTipo = tipo;

    const tdTitulo = document.createElement('td');
    tdTitulo.className = 'ginecologico-descripcion';

    const tdFecha = document.createElement('td');
    const fecha = document.createElement('input');
    fecha.type = 'date';
    fecha.className = 'form-control auro-gine-repetible-fecha';
    fecha.value = texto_(datos?.fecha);
    tdFecha.appendChild(fecha);

    const tdResultado = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'auro-gine-repetible-resultado-wrap';

    const resultado = document.createElement('input');
    resultado.type = 'text';
    resultado.className = 'form-control auro-gine-repetible-resultado';
    resultado.placeholder = 'Resultado / observación';
    resultado.value = texto_(datos?.resultado);

    const eliminar = document.createElement('button');
    eliminar.type = 'button';
    eliminar.className = 'btn-soft auro-gine-repetible-eliminar';
    eliminar.innerHTML = '<i class="bi bi-trash3"></i>';
    eliminar.title = 'Eliminar este registro';
    eliminar.addEventListener('click', () => {
      fila.remove();
      actualizarNumeracion_(tipo);
      dispararResumen_();
    });

    [fecha, resultado].forEach(control => {
      control.addEventListener('input', dispararResumen_);
      control.addEventListener('change', dispararResumen_);
    });

    wrap.appendChild(resultado);
    wrap.appendChild(eliminar);
    tdResultado.appendChild(wrap);

    fila.appendChild(tdTitulo);
    fila.appendChild(tdFecha);
    fila.appendChild(tdResultado);

    const existentes = registrosAdicionalesDOM_(tipo);
    const referencia = existentes.length ? existentes[existentes.length - 1] : base;
    referencia.insertAdjacentElement('afterend', fila);

    actualizarNumeracion_(tipo);
    return fila;
  }

  function limpiarAdicionales_(tipo){
    registrosAdicionalesDOM_(tipo).forEach(fila => fila.remove());
  }

  function limpiarTodosAdicionales_(){
    Object.keys(CONFIG).forEach(limpiarAdicionales_);
  }

  function asegurarBotonAgregar_(tipo){
    const cfg = CONFIG[tipo];
    const base = obtenerFilaBase_(tipo);
    if(!cfg || !base || base.dataset.auroGineRepetibleReady === '1') return;

    base.dataset.auroGineRepetibleReady = '1';

    const titulo = base.querySelector('.ginecologico-descripcion');
    if(!titulo) return;

    const wrap = document.createElement('div');
    wrap.className = 'auro-gine-repetible-titulo-wrap';

    const texto = document.createElement('span');
    texto.textContent = cfg.label;

    const agregar = document.createElement('button');
    agregar.type = 'button';
    agregar.className = 'btn-soft auro-gine-repetible-agregar';
    agregar.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Agregar';
    agregar.title = 'Agregar otro registro de ' + cfg.label;
    agregar.addEventListener('click', () => {
      const fila = crearFilaAdicional_(tipo, {});
      const input = fila?.querySelector('.auro-gine-repetible-fecha');
      if(input) input.focus();
    });

    titulo.textContent = '';
    wrap.appendChild(texto);
    wrap.appendChild(agregar);
    titulo.appendChild(wrap);
  }

  function inyectarEstilos_(){
    if(document.getElementById('auroGineRepetiblesStyle')) return;

    const style = document.createElement('style');
    style.id = 'auroGineRepetiblesStyle';
    style.textContent = `
      #hc_antecedentes .auro-gine-repetible-titulo-wrap{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        width:100%;
      }
      #hc_antecedentes .auro-gine-repetible-agregar{
        flex:0 0 auto;
        padding:5px 9px;
        border-radius:9px;
        font-size:11px;
        line-height:1.2;
        white-space:nowrap;
      }
      #hc_antecedentes .auro-gine-repetible-row{
        background:linear-gradient(180deg,#fff 0%,#fffafd 100%);
      }
      #hc_antecedentes .auro-gine-repetible-resultado-wrap{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:7px;
        align-items:center;
      }
      #hc_antecedentes .auro-gine-repetible-eliminar{
        width:38px;
        min-width:38px;
        height:38px;
        padding:0;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border-radius:10px;
        color:#9f1239;
      }
      @media(max-width:760px){
        #hc_antecedentes .auro-gine-repetible-titulo-wrap{
          align-items:flex-start;
        }
        #hc_antecedentes .auro-gine-repetible-agregar{
          min-height:36px!important;
          padding:6px 9px!important;
        }
        #hc_antecedentes .auro-gine-repetible-resultado-wrap{
          grid-template-columns:minmax(0,1fr) 42px!important;
        }
        #hc_antecedentes .auro-gine-repetible-eliminar{
          width:42px!important;
          min-width:42px!important;
          height:42px!important;
        }
      }
      @media print{
        #hc_antecedentes .auro-gine-repetible-agregar,
        #hc_antecedentes .auro-gine-repetible-eliminar{
          display:none!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function inicializarUI_(){
    const panel = document.getElementById('hc_antecedentes');
    if(!panel) return false;

    inyectarEstilos_();
    Object.keys(CONFIG).forEach(asegurarBotonAgregar_);

    const formulario = panel.closest('form');
    if(formulario && formulario.dataset.auroGineRepetiblesReset !== '1'){
      formulario.dataset.auroGineRepetiblesReset = '1';
      formulario.addEventListener('reset', () => {
        setTimeout(limpiarTodosAdicionales_, 0);
      });
    }

    return true;
  }

  /*
    GUARDADO:
    conserva la función estable y solo añade "registros" a los tres
    objetos autorizados. La primera fila sigue siendo fecha/estado/resultado.
  */
  if(typeof window.recopilarAntecedentesGinecologicosEstructurados === 'function'){
    const recopilarOriginal = window.recopilarAntecedentesGinecologicosEstructurados;

    window.recopilarAntecedentesGinecologicosEstructurados = function(){
      const base = recopilarOriginal.apply(this, arguments) || {};

      ['pap','colposcopia','biopsia'].forEach(tipo => {
        const extras = leerRegistrosAdicionales_(tipo);
        if(!extras.length) return;

        const actual = (base[tipo] && typeof base[tipo] === 'object' && !Array.isArray(base[tipo]))
          ? base[tipo]
          : {};

        base[tipo] = Object.assign({}, actual, { registros: extras });
      });

      return typeof window.auroCompactarObjeto === 'function'
        ? window.auroCompactarObjeto(base)
        : base;
    };
  }

  /*
    CARGA / EDICIÓN:
    primero ejecuta íntegra la función estable y luego reconstruye solo
    las filas adicionales. Si la historia es antigua y no tiene registros,
    queda exactamente una fila como antes.
  */
  if(typeof window.cargarAntecedentesGinecologicosEstructurados === 'function'){
    const cargarOriginal = window.cargarAntecedentesGinecologicosEstructurados;

    window.cargarAntecedentesGinecologicosEstructurados = function(data){
      const d = data || {};

      limpiarTodosAdicionales_();
      const resultado = cargarOriginal.apply(this, arguments);

      ['pap','colposcopia','biopsia'].forEach(tipo => {
        const lista = Array.isArray(d?.[tipo]?.registros) ? d[tipo].registros : [];
        lista.forEach(item => {
          if(texto_(item?.fecha) || texto_(item?.resultado)){
            crearFilaAdicional_(tipo, item);
          }
        });
      });

      return resultado;
    };
  }

  /*
    RESUMEN / ANTECEDENTES PREVIOS:
    conserva todas las secciones existentes y expande únicamente
    PAP, Colposcopia y Biopsia cuando existen registros adicionales.
  */
  if(typeof window.auroResumenGinecologicosItemsDesdeJson === 'function'){
    const resumenOriginal = window.auroResumenGinecologicosItemsDesdeJson;

    window.auroResumenGinecologicosItemsDesdeJson = function(dataGineco){
      const itemsOriginales = resumenOriginal.apply(this, arguments) || [];
      const g = dataGineco?.ginecologicos || null;
      if(!g || typeof g !== 'object') return itemsOriginales;

      const etiquetas = {
        pap:'Citología / PAP',
        colposcopia:'Colposcopia',
        biopsia:'Biopsia'
      };

      let items = itemsOriginales.filter(item => {
        const titulo = texto_(item?.titulo);
        return !Object.values(etiquetas).includes(titulo);
      });

      ['pap','colposcopia','biopsia'].forEach(tipo => {
        const v = g[tipo];
        if(!v || typeof v !== 'object' || Array.isArray(v)) return;

        const lista = [];
        if(texto_(v.fecha) || texto_(v.resultado)){
          lista.push({ fecha:texto_(v.fecha), resultado:texto_(v.resultado) });
        }

        if(Array.isArray(v.registros)){
          v.registros.forEach(r => {
            if(texto_(r?.fecha) || texto_(r?.resultado)){
              lista.push({ fecha:texto_(r?.fecha), resultado:texto_(r?.resultado) });
            }
          });
        }

        lista.forEach((registro, indice) => {
          const detalle = [];
          if(registro.fecha) detalle.push('Fecha: ' + registro.fecha);
          if(registro.resultado) detalle.push('Resultado: ' + registro.resultado);

          items.push({
            titulo: etiquetas[tipo] + (indice > 0 ? ' ' + (indice + 1) : ''),
            detalle: detalle.join(' · ')
          });
        });
      });

      return items;
    };
  }

  /*
    Inicialización visual diferida y segura.
    No realiza guardados automáticos ni altera el contenido clínico.
  */
  function iniciar_(){
    if(inicializarUI_()) return;
    setTimeout(iniciar_, 300);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(iniciar_, 320);
    });
  }else{
    setTimeout(iniciar_, 320);
  }

  console.log(
    'IASYN antecedentes.js: GINECOLÓGICOS REPETIBLES V1 cargado sin cambios de backend.'
  );
})();
/* ============================================================
   IASYN - AISLAMIENTO DE ANTECEDENTES ENTRE PACIENTES V1
   Corrección quirúrgica antirregresiva.
   ------------------------------------------------------------
   PROBLEMA RESUELTO:
   Los controles visuales de Antecedentes podían conservar datos
   del paciente anterior al cambiar de paciente y esos valores
   podían terminar guardándose en la nueva historia.

   ALCANCE EXCLUSIVO:
   - Limpia SOLO #hc_antecedentes cuando cambia realmente id_paciente.
   - NO limpia al cambiar de atención del mismo paciente.
   - NO modifica guardado, fechas, temporalidades ni Apps Script.
   - NO modifica Anamnesis, Examen físico, Diagnóstico, Plan ni otros módulos.
   - NO dispara eventos de input/change durante la limpieza para evitar autosaves.
   - Incluye filas dinámicas de PAP / Colposcopia / Biopsia.
   ============================================================ */
(function(){
  'use strict';

  const PANEL_ID = 'hc_antecedentes';
  const SELECTOR_PACIENTE_ID = 'hcPacienteSelect';

  let pacienteAnterior = '';

  function texto_(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function idPacienteActual_(){
    const selector = document.getElementById(SELECTOR_PACIENTE_ID);
    return texto_(selector?.value);
  }

  function limpiarControlSilencioso_(control){
    if(!control) return;

    const tag = String(control.tagName || '').toUpperCase();
    const type = String(control.type || '').toLowerCase();

    if(tag === 'INPUT'){
      if(type === 'checkbox' || type === 'radio'){
        control.checked = false;
        control.indeterminate = false;
        return;
      }

      if(type === 'button' || type === 'submit' || type === 'reset'){
        return;
      }

      control.value = '';
      return;
    }

    if(tag === 'SELECT'){
      /*
        Preferir opción vacía cuando exista.
        Si no existe, dejar sin selección para no inventar valores.
      */
      const opcionVacia = [...control.options].find(opt => texto_(opt.value) === '');
      if(opcionVacia){
        control.value = '';
      }else{
        control.selectedIndex = -1;
      }
      return;
    }

    if(tag === 'TEXTAREA'){
      control.value = '';
    }
  }

  function limpiarFilasDinamicas_(){
    document
      .querySelectorAll(
        '#' + PANEL_ID + ' .auro-gine-repetible-row'
      )
      .forEach(fila => fila.remove());
  }

  function limpiarEstadosVisualesAyudas_(panel){
    if(!panel) return;

    /*
      Solo estados visuales conocidos de ayudas rápidas.
      No elimina botones ni listeners.
    */
    panel.querySelectorAll(
      '.active,.selected,.is-active,.auro-active,.auro-v21-active'
    ).forEach(el => {
      if(
        el.matches('button,[role="button"],.auro-v21-helper-btn') ||
        el.closest('.auro-v21-helper-btn')
      ){
        el.classList.remove(
          'active','selected','is-active','auro-active','auro-v21-active'
        );
        el.removeAttribute('aria-pressed');
      }
    });
  }

  function limpiarCajaAntecedentesPrevios_(){
    const caja = document.getElementById('hcAntecedentesPreviosBox');
    if(!caja) return;

    /*
      Ocultamos el resumen del paciente anterior.
      La lógica estable del módulo podrá volver a pintarlo cuando corresponda.
    */
    caja.style.display = 'none';
    caja.setAttribute('aria-hidden','true');

    const contenido = caja.querySelector(
      '.hc-antecedentes-previos-content,' +
      '.antecedentes-previos-content,' +
      '[data-auro-antecedentes-previos-content]'
    );

    if(contenido){
      contenido.innerHTML = '';
    }
  }

  function limpiarAntecedentesVisualesPaciente_(){
    const panel = document.getElementById(PANEL_ID);
    if(!panel) return false;

    /*
      Primero retiramos las filas clonadas porque también contienen inputs.
    */
    limpiarFilasDinamicas_();

    /*
      Limpiar únicamente controles clínicos dentro de Antecedentes.
      Se hace en silencio: no se disparan input/change.
    */
    panel
      .querySelectorAll('input,select,textarea')
      .forEach(limpiarControlSilencioso_);

    limpiarEstadosVisualesAyudas_(panel);
    limpiarCajaAntecedentesPrevios_();

    /*
      Sincronizar únicamente presentación de ayudas si la función estable existe.
      No guarda ni consulta servidor.
    */
    if(typeof window.auroV21SincronizarEstadosAyudas === 'function'){
      try{
        window.auroV21SincronizarEstadosAyudas();
      }catch(error){
        console.warn(
          'IASYN Antecedentes: no se pudo sincronizar el estado visual de ayudas tras limpiar paciente.',
          error
        );
      }
    }

    if(typeof window.updateClinicalSummary === 'function'){
      try{ window.updateClinicalSummary(); }catch(_error){}
    }

    return true;
  }

  function manejarCambioPaciente_(nuevoId){
    const nuevo = texto_(nuevoId);

    /*
      Primer reconocimiento de contexto:
      no limpiar porque todavía no existe una transición conocida.
    */
    if(!pacienteAnterior){
      pacienteAnterior = nuevo;
      return;
    }

    /*
      Mismo paciente = NO limpiar.
      Esto protege cambios de atención y navegación interna.
    */
    if(nuevo === pacienteAnterior){
      return;
    }

    const anterior = pacienteAnterior;
    pacienteAnterior = nuevo;

    /*
      Cambio real de paciente: limpieza visual inmediata.
      Si el nuevo paciente tiene antecedentes, la lógica estable existente
      podrá cargarlos después de esta transición.
    */
    limpiarAntecedentesVisualesPaciente_();

    console.log(
      'IASYN Antecedentes: contexto visual limpiado por cambio de paciente.',
      { anterior, nuevo }
    );
  }

  function instalarProteccion_(){
    const selector = document.getElementById(SELECTOR_PACIENTE_ID);
    if(!selector) return false;

    if(selector.dataset.auroAislamientoAntecedentesPaciente === '1'){
      return true;
    }

    selector.dataset.auroAislamientoAntecedentesPaciente = '1';
    pacienteAnterior = idPacienteActual_();

    /*
      Captura temprana: limpiamos antes de que otros listeners carguen
      el contexto del nuevo paciente.
    */
    selector.addEventListener('change', function(){
      manejarCambioPaciente_(selector.value);
    }, true);

    return true;
  }

  function iniciar_(){
    if(instalarProteccion_()) return;
    setTimeout(iniciar_, 250);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(iniciar_, 250);
    }, { once:true });
  }else{
    setTimeout(iniciar_, 250);
  }

  /*
    API pública mínima solo para diagnóstico manual.
    No se usa en guardados.
  */
  window.auroLimpiarAntecedentesVisualesPaciente =
    limpiarAntecedentesVisualesPaciente_;

  console.log(
    'IASYN antecedentes.js: AISLAMIENTO DE ANTECEDENTES ENTRE PACIENTES V1 cargado.'
  );
})();
/* ============================================================
   IASYN - ANTECEDENTES: BARRERA SIN CAMBIOS REALES V2
   Base: antecedentes estable entregado por el usuario.
   ------------------------------------------------------------
   OBJETIVO EXCLUSIVO:
   Evitar escrituras de antecedentes cuando el usuario abre una
   historia y pulsa Guardar/Actualizar sin modificar datos clínicos.

   CAMPOS PROTEGIDOS:
   - antecedentes_personales
   - antecedentes_quirurgicos
   - antecedentes_gineco_obstetricos
   - antecedentes_familiares
   - medicacion_actual
   - alergias

   PRINCIPIO:
   1. Después de cargar la historia se conserva:
      a) el valor RAW exacto leído de historias_clinicas;
      b) el valor que este mismo módulo reconstruye tras la carga.
   2. Al guardar:
      - si el valor enviado sigue siendo equivalente al reconstruido
        tras la carga, NO hubo cambio del usuario y se restaura el RAW;
      - si existe una modificación real, se conserva el valor nuevo.
   3. El Index puede entonces reconocer que los seis campos siguen
      iguales y omitir el POST, evitando mover actualizado_en.

   NO MODIFICA:
   - botones rápidos / estados morados / snapshots;
   - familiares;
   - PAP / Colposcopia / Biopsia repetibles;
   - aislamiento entre pacientes;
   - diseño desktop/móvil;
   - Index;
   - Apps Script;
   - otros módulos.
   ============================================================ */
(function(){
  'use strict';

  const CAMPOS = [
    'antecedentes_personales',
    'antecedentes_quirurgicos',
    'antecedentes_gineco_obstetricos',
    'antecedentes_familiares',
    'medicacion_actual',
    'alergias'
  ];

  const BASELINE = {
    id_historia:'',
    id_paciente:'',
    raw:null,
    reconstruido:null
  };

  function texto_(valor){
    return String(valor === null || valor === undefined ? '' : valor);
  }

  function canonico_(valor){
    if(valor === null || valor === undefined) return '';

    if(typeof valor === 'number' || typeof valor === 'boolean'){
      return String(valor);
    }

    if(Array.isArray(valor)){
      return '[' + valor.map(canonico_).join(',') + ']';
    }

    if(valor && typeof valor === 'object'){
      return '{' + Object.keys(valor)
        .sort()
        .map(function(k){
          return JSON.stringify(k) + ':' + canonico_(valor[k]);
        })
        .join(',') + '}';
    }

    const raw = texto_(valor)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    if(!raw) return '';

    /*
      Los antecedentes estructurados usan marcadores del tipo:
      AUROSANAX_..._V1::{...}
      Se conserva el prefijo y solo se canoniza el JSON interno.
    */
    const separador = raw.indexOf('::');
    if(separador > 0){
      const prefijo = raw.slice(0, separador + 2);
      const contenido = raw.slice(separador + 2).trim();

      if(
        (contenido.startsWith('{') && contenido.endsWith('}')) ||
        (contenido.startsWith('[') && contenido.endsWith(']'))
      ){
        try{
          return prefijo + canonico_(JSON.parse(contenido));
        }catch(_error){}
      }
    }

    if(
      (raw.startsWith('{') && raw.endsWith('}')) ||
      (raw.startsWith('[') && raw.endsWith(']'))
    ){
      try{
        return canonico_(JSON.parse(raw));
      }catch(_error){}
    }

    return raw;
  }

  function idHistoriaEdicion_(){
    try{
      if(typeof editingHistoryId !== 'undefined'){
        return texto_(editingHistoryId).trim();
      }
    }catch(_error){}
    return texto_(window.editingHistoryId).trim();
  }

  function idPacienteActivo_(){
    const select = document.getElementById('hcPacienteSelect');
    const idSelect = texto_(select?.value).trim();
    if(idSelect) return idSelect;

    try{
      if(typeof activePatientId !== 'undefined'){
        return texto_(activePatientId).trim();
      }
    }catch(_error){}

    return texto_(window.activePatientId).trim();
  }

  function recolectarEstadoActual_(){
    const estado = {
      antecedentes_personales:'',
      antecedentes_quirurgicos:'',
      antecedentes_gineco_obstetricos:'',
      antecedentes_familiares:'',
      medicacion_actual:'',
      alergias:''
    };

    try{
      estado.antecedentes_personales =
        typeof recopilarAntecedentesPersonalesCompletos === 'function'
          ? recopilarAntecedentesPersonalesCompletos()
          : (typeof getValueIfExists === 'function'
              ? getValueIfExists('hcAntecedentesPersonales')
              : '');
    }catch(error){
      console.warn('IASYN Antecedentes: no se pudo capturar personales.', error);
    }

    try{
      estado.antecedentes_quirurgicos =
        typeof recopilarAntecedentesQuirurgicosEstructurados === 'function'
          ? recopilarAntecedentesQuirurgicosEstructurados()
          : (typeof getValueIfExists === 'function'
              ? getValueIfExists('hcAntecedentesQuirurgicos')
              : '');
    }catch(error){
      console.warn('IASYN Antecedentes: no se pudo capturar quirúrgicos.', error);
    }

    try{
      estado.antecedentes_gineco_obstetricos =
        typeof recopilarAntecedentesGinecoObstetricosCompletos === 'function'
          ? recopilarAntecedentesGinecoObstetricosCompletos()
          : (typeof getValueIfExists === 'function'
              ? getValueIfExists('hcRevisionSistemas')
              : '');
    }catch(error){
      console.warn('IASYN Antecedentes: no se pudo capturar gineco-obstétricos.', error);
    }

    try{
      estado.antecedentes_familiares =
        typeof window.recopilarAntecedentesFamiliaresEstructurados === 'function'
          ? window.recopilarAntecedentesFamiliaresEstructurados()
          : (typeof getValueIfExists === 'function'
              ? getValueIfExists('hcAntecedentesFamiliares')
              : '');
    }catch(error){
      console.warn('IASYN Antecedentes: no se pudo capturar familiares.', error);
    }

    try{
      estado.medicacion_actual =
        typeof getValueIfExists === 'function'
          ? getValueIfExists('hcMedicacionActual')
          : texto_(document.getElementById('hcMedicacionActual')?.value);
    }catch(_error){}

    try{
      estado.alergias =
        typeof recopilarAlergiasEstructuradas === 'function'
          ? recopilarAlergiasEstructuradas()
          : (typeof getValueIfExists === 'function'
              ? getValueIfExists('hcAlergias')
              : '');
    }catch(error){
      console.warn('IASYN Antecedentes: no se pudo capturar alergias.', error);
    }

    return estado;
  }

  function limpiarBaseline_(){
    BASELINE.id_historia = '';
    BASELINE.id_paciente = '';
    BASELINE.raw = null;
    BASELINE.reconstruido = null;
  }

  function capturarBaseline_(h){
    if(!h) return false;

    const idHistoria = texto_(h.id_historia || h.id).trim();
    const idEdicion = idHistoriaEdicion_();

    /*
      Solo se arma línea base cuando realmente estamos editando
      la misma historia que acaba de cargarse.
    */
    if(!idHistoria || !idEdicion || idHistoria !== idEdicion){
      return false;
    }

    BASELINE.id_historia = idHistoria;
    BASELINE.id_paciente = texto_(h.id_paciente).trim();

    BASELINE.raw = {};
    CAMPOS.forEach(function(campo){
      BASELINE.raw[campo] = texto_(h[campo]);
    });

    /*
      Importante: se toma DESPUÉS de que el archivo estable terminó
      de cargar todos los controles. Así las normalizaciones propias
      del módulo forman parte de la referencia y no cuentan como
      cambios hechos por el usuario.
    */
    BASELINE.reconstruido = recolectarEstadoActual_();

    return true;
  }

  function baselineValido_(h){
    if(!h || !BASELINE.raw || !BASELINE.reconstruido) return false;

    const idHistoria = texto_(h.id_historia || h.id).trim();
    const idPacienteHistoria = texto_(h.id_paciente).trim();
    const idPacienteActivo = idPacienteActivo_();

    if(!idHistoria || idHistoria !== BASELINE.id_historia) return false;

    if(
      BASELINE.id_paciente &&
      idPacienteHistoria &&
      BASELINE.id_paciente !== idPacienteHistoria
    ){
      return false;
    }

    if(
      BASELINE.id_paciente &&
      idPacienteActivo &&
      BASELINE.id_paciente !== idPacienteActivo
    ){
      return false;
    }

    return true;
  }

  /*
    Conservamos la protección estable que ya existía y añadimos
    únicamente la barrera de igualdad contra la línea base.
  */
  const proteccionAnterior =
    typeof window.auroAplicarProteccionAntecedentesEdicion === 'function'
      ? window.auroAplicarProteccionAntecedentesEdicion
      : null;

  window.auroAplicarProteccionAntecedentesEdicion = function(data){
    let salida = data || {};

    if(proteccionAnterior){
      salida = proteccionAnterior.call(this, salida) || salida;
    }

    let h = null;
    try{
      h = typeof auroHistoriaActualEdicion === 'function'
        ? auroHistoriaActualEdicion()
        : null;
    }catch(_error){}

    if(!h || !baselineValido_(h)){
      return salida;
    }

    CAMPOS.forEach(function(campo){
      /*
        Comparamos contra lo que el propio módulo reconstruyó al cargar.
        Si sigue igual, el usuario no modificó ese campo.
        Se devuelve el RAW exacto para que el comparador del Index vea
        igualdad real con historias_clinicas y corte el POST.
      */
      if(
        canonico_(salida[campo]) ===
        canonico_(BASELINE.reconstruido[campo])
      ){
        salida[campo] = BASELINE.raw[campo];
      }
    });

    return salida;
  };

  /*
    Captura FINAL: este wrapper se instala al final del archivo estable,
    después de familiares, repetibles y aislamiento. Por ello observa
    el estado ya reconstruido por toda la cadena estable.
  */
  if(
    typeof window.auroCargarAntecedentesDesdeHistoria === 'function' &&
    window.auroCargarAntecedentesDesdeHistoria.__auroSinCambiosRealesV2 !== true
  ){
    const cargarAnterior = window.auroCargarAntecedentesDesdeHistoria;

    const cargarConBaseline = function(h, modo){
      const resultado = cargarAnterior.apply(this, arguments);

      try{
        capturarBaseline_(h);
      }catch(error){
        console.warn(
          'IASYN Antecedentes: no se pudo capturar línea base de edición.',
          error
        );
      }

      return resultado;
    };

    cargarConBaseline.__auroSinCambiosRealesV2 = true;
    window.auroCargarAntecedentesDesdeHistoria = cargarConBaseline;
  }

  /*
    Al cambiar realmente de paciente invalidamos la línea base anterior.
    No limpiamos controles aquí; eso sigue siendo responsabilidad del
    aislamiento estable ya existente.
  */
  const selectorPaciente = document.getElementById('hcPacienteSelect');
  if(
    selectorPaciente &&
    selectorPaciente.dataset.auroBaselineAntecedentesV2 !== '1'
  ){
    selectorPaciente.dataset.auroBaselineAntecedentesV2 = '1';
    selectorPaciente.addEventListener('change', limpiarBaseline_, true);
  }

  window.auroAntecedentesDebugSinCambiosV2 = function(){
    return {
      id_historia:BASELINE.id_historia,
      id_paciente:BASELINE.id_paciente,
      baseline_disponible:!!(BASELINE.raw && BASELINE.reconstruido),
      raw:BASELINE.raw,
      reconstruido:BASELINE.reconstruido
    };
  };

  console.log(
    'IASYN antecedentes.js: BARRERA SIN CAMBIOS REALES V2 instalada.'
  );
})();

/* ============================================================
   IASYN - ANTECEDENTES: BARRERA DE MODIFICACIÓN REAL V3
   Corrección quirúrgica anti-escritura sin interacción del usuario.
   ------------------------------------------------------------
   OBJETIVO EXCLUSIVO:
   - Si una historia existente termina de cargar Antecedentes y el
     usuario NO modifica ningún dato clínico del panel, al pulsar
     Guardar / Actualizar historia desde Antecedentes se corta el
     flujo ANTES de entrar a guardarHistoriaClinicaERP().
   - Resultado: 0 POST, 0 escritura y 0 cambio de actualizado_en.

   SEGURIDAD / COMPATIBILIDAD:
   - NO bloquea la creación de una historia nueva.
   - NO actúa fuera de la pestaña #hc_antecedentes.
   - NO considera como cambios los acordeones, Mostrar/Ocultar ni
     desplegar vacunas en móvil.
   - Sí considera modificación real escribir, seleccionar, marcar,
     usar ayudas rápidas y agregar/eliminar PAP/Colposcopia/Biopsia.
   - Conserva íntegra la Barrera V2 como segunda protección para
     casos donde hubo interacción pero el estado final quedó igual.
   - NO modifica Index, Apps Script, backend, columnas ni otros módulos.
   ============================================================ */
(function(){
  'use strict';

  if(window.__auroAntecedentesModificacionRealV3 === true) return;
  window.__auroAntecedentesModificacionRealV3 = true;

  const ESTADO = {
    modificado:false,
    cargado:false,
    id_historia:'',
    id_paciente:'',
    motivo:''
  };

  function texto_(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function idHistoriaEdicion_(){
    try{
      if(typeof editingHistoryId !== 'undefined'){
        return texto_(editingHistoryId);
      }
    }catch(_error){}
    return texto_(window.editingHistoryId);
  }

  function idPacienteActivo_(){
    const select = document.getElementById('hcPacienteSelect');
    if(texto_(select?.value)) return texto_(select.value);

    try{
      if(typeof activePatientId !== 'undefined'){
        return texto_(activePatientId);
      }
    }catch(_error){}

    return texto_(window.activePatientId);
  }

  function panelAntecedentes_(){
    return document.getElementById('hc_antecedentes');
  }

  function antecedentesActivo_(){
    const panel = panelAntecedentes_();
    if(!panel) return false;

    if(panel.classList.contains('active')) return true;

    const activo = document.querySelector('.clinical-panel.active');
    if(activo) return activo === panel;

    /* Fallback visual para versiones antiguas sin clase active. */
    try{
      const estilo = window.getComputedStyle(panel);
      return estilo.display !== 'none' && estilo.visibility !== 'hidden';
    }catch(_error){
      return false;
    }
  }

  function marcarModificado_(motivo){
    /*
      Solo una interacción humana posterior a la carga puede activar
      esta bandera. Las cargas programáticas no disparan eventos trusted.
    */
    if(!ESTADO.cargado || !ESTADO.id_historia) return;

    ESTADO.modificado = true;
    ESTADO.motivo = texto_(motivo) || 'interacción clínica';
  }

  function marcarLimpioDesdeHistoria_(h){
    const idHistoria = texto_(h?.id_historia || h?.id);
    const idEdicion = idHistoriaEdicion_();

    /*
      La barrera directa solo protege EDICIÓN de una historia existente.
      Historia nueva debe conservar su flujo normal de creación.
    */
    if(!idHistoria || !idEdicion || idHistoria !== idEdicion){
      ESTADO.modificado = false;
      ESTADO.cargado = false;
      ESTADO.id_historia = '';
      ESTADO.id_paciente = '';
      ESTADO.motivo = '';
      return false;
    }

    ESTADO.modificado = false;
    ESTADO.cargado = true;
    ESTADO.id_historia = idHistoria;
    ESTADO.id_paciente = texto_(h?.id_paciente) || idPacienteActivo_();
    ESTADO.motivo = 'historia cargada sin modificaciones';
    return true;
  }

  function invalidarContexto_(){
    ESTADO.modificado = false;
    ESTADO.cargado = false;
    ESTADO.id_historia = '';
    ESTADO.id_paciente = '';
    ESTADO.motivo = '';
  }

  function contextoEdicionValido_(){
    if(!ESTADO.cargado || !ESTADO.id_historia) return false;

    const idEdicion = idHistoriaEdicion_();
    if(!idEdicion || idEdicion !== ESTADO.id_historia) return false;

    const paciente = idPacienteActivo_();
    if(
      ESTADO.id_paciente &&
      paciente &&
      paciente !== ESTADO.id_paciente
    ){
      return false;
    }

    return true;
  }

  function esClickVisualSinCambio_(target){
    if(!(target instanceof Element)) return false;

    return !!target.closest(
      '.auro-ant-mobile-toggle,' +
      '.auro-vacuna-mobile-toggle,' +
      '.auro-previos-hide,' +
      '[data-bs-toggle="collapse"],' +
      '[data-bs-toggle="tab"]'
    );
  }

  function esClickClinicoQueModifica_(target){
    if(!(target instanceof Element)) return false;

    return !!target.closest(
      '.auro-v21-helper-btn,' +
      '.auro-gine-repetible-agregar,' +
      '.auro-gine-repetible-eliminar'
    );
  }

  function instalarDetectorInteraccion_(){
    const panel = panelAntecedentes_();
    if(!panel) return false;
    if(panel.dataset.auroModificacionRealV3 === '1') return true;

    panel.dataset.auroModificacionRealV3 = '1';

    /*
      input/change solo cuentan si fueron provocados por el usuario.
      Esto evita que la carga y reconstrucción interna marquen el módulo.
    */
    ['input','change'].forEach(tipo => {
      panel.addEventListener(tipo, function(event){
        if(event.isTrusted !== true) return;
        const target = event.target;
        if(!(target instanceof Element)) return;
        if(!target.matches('input,select,textarea')) return;
        marcarModificado_(tipo + ': ' + (target.id || target.name || target.className || 'control'));
      }, true);
    });

    /*
      Las ayudas rápidas y los botones de repetibles modifican el DOM
      por código y por eso requieren registrar el clic humano explícito.
    */
    panel.addEventListener('click', function(event){
      if(event.isTrusted !== true) return;
      const target = event.target;
      if(esClickVisualSinCambio_(target)) return;
      if(esClickClinicoQueModifica_(target)){
        marcarModificado_('clic clínico');
      }
    }, true);

    return true;
  }

  function instalarResetDespuesCarga_(){
    const actual = window.auroCargarAntecedentesDesdeHistoria;
    if(typeof actual !== 'function') return false;
    if(actual.__auroModificacionRealV3 === true) return true;

    const cargarAnterior = actual;

    const cargarConEstadoV3 = function(h, modo){
      const resultado = cargarAnterior.apply(this, arguments);

      /*
        Se ejecuta al final de toda la cadena estable de carga.
        No depende de la serialización ni compara JSON.
      */
      marcarLimpioDesdeHistoria_(h);
      return resultado;
    };

    cargarConEstadoV3.__auroModificacionRealV3 = true;
    cargarConEstadoV3.__auroOriginal = cargarAnterior;
    window.auroCargarAntecedentesDesdeHistoria = cargarConEstadoV3;
    return true;
  }

  function mostrarSinCambios_(){
    try{
      if(typeof window.auroHistoriaMostrarSinCambios === 'function'){
        window.auroHistoriaMostrarSinCambios('hc_antecedentes');
        return;
      }
    }catch(_error){}

    const status = document.getElementById('auroHistoriaMiniStatus');
    if(status){
      status.textContent = 'Antecedentes · Sin cambios pendientes. No se realizó ninguna escritura.';
    }

    console.info(
      'IASYN Antecedentes: guardado omitido por ausencia de modificaciones reales.'
    );
  }

  function instalarBarreraAntesGuardar_(){
    const actual = window.guardarHistoriaClinicaERP;
    if(typeof actual !== 'function') return false;
    if(actual.__auroAntecedentesModificacionRealV3 === true) return true;

    const guardarAnterior = actual;

    const guardarConBarreraV3 = function(){
      const esEdicion = !!idHistoriaEdicion_();

      if(
        esEdicion &&
        antecedentesActivo_() &&
        contextoEdicionValido_() &&
        ESTADO.modificado !== true
      ){
        mostrarSinCambios_();
        return Promise.resolve({
          success:true,
          sin_cambios:true,
          modulo:'hc_antecedentes',
          message:'No existen cambios en Antecedentes para guardar.'
        });
      }

      const habiaCambioAntecedentes =
        esEdicion &&
        antecedentesActivo_() &&
        contextoEdicionValido_() &&
        ESTADO.modificado === true;

      let resultado;
      try{
        resultado = guardarAnterior.apply(this, arguments);
      }catch(error){
        throw error;
      }

      /*
        Si el guardado terminó sin lanzar error, el siguiente clic sin nuevas
        interacciones debe volver a quedar protegido por la barrera directa.
        Si el flujo devuelve una Promise rechazada, conservamos modificado=true.
      */
      if(habiaCambioAntecedentes && resultado && typeof resultado.then === 'function'){
        return resultado.then(function(valor){
          ESTADO.modificado = false;
          ESTADO.motivo = 'guardado finalizado; sin nuevas modificaciones';
          return valor;
        }, function(error){
          throw error;
        });
      }

      if(habiaCambioAntecedentes){
        ESTADO.modificado = false;
        ESTADO.motivo = 'guardado finalizado; sin nuevas modificaciones';
      }

      return resultado;
    };

    guardarConBarreraV3.__auroAntecedentesModificacionRealV3 = true;
    guardarConBarreraV3.__auroOriginal = guardarAnterior;
    window.guardarHistoriaClinicaERP = guardarConBarreraV3;
    return true;
  }

  function instalarCambioPaciente_(){
    const selector = document.getElementById('hcPacienteSelect');
    if(!selector) return false;
    if(selector.dataset.auroModificacionRealPacienteV3 === '1') return true;

    selector.dataset.auroModificacionRealPacienteV3 = '1';
    selector.addEventListener('change', function(){
      invalidarContexto_();
    }, true);
    return true;
  }

  function instalarTodo_(){
    instalarDetectorInteraccion_();
    instalarResetDespuesCarga_();
    instalarBarreraAntesGuardar_();
    instalarCambioPaciente_();
  }

  /*
    Se reintenta porque antecedentes.js puede ejecutarse antes de que Index
    termine de declarar guardarHistoriaClinicaERP(). No se reemplaza Index:
    solo se envuelve la función final cuando ya está disponible.
  */
  let intentos = 0;
  const timer = window.setInterval(function(){
    instalarTodo_();
    intentos += 1;

    const listo =
      document.getElementById('hc_antecedentes') &&
      typeof window.auroCargarAntecedentesDesdeHistoria === 'function' &&
      typeof window.guardarHistoriaClinicaERP === 'function' &&
      window.guardarHistoriaClinicaERP.__auroAntecedentesModificacionRealV3 === true;

    if(listo || intentos >= 120){
      window.clearInterval(timer);
    }
  }, 100);

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', instalarTodo_, {once:true});
  }else{
    instalarTodo_();
  }

  window.auroAntecedentesDebugModificacionRealV3 = function(){
    return {
      modificado:ESTADO.modificado,
      cargado:ESTADO.cargado,
      id_historia:ESTADO.id_historia,
      id_paciente:ESTADO.id_paciente,
      motivo:ESTADO.motivo,
      contexto_valido:contextoEdicionValido_(),
      antecedentes_activo:antecedentesActivo_()
    };
  };

  console.log(
    'IASYN antecedentes.js: BARRERA DE MODIFICACIÓN REAL V3 instalada.'
  );
})();
