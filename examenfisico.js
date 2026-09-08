/* ==========================================================
   IASYN - examenfisico.js
   Versión corregida: evita repetición de 'Otros hallazgos' y regiones no valoradas
   Módulo extraído desde index.html para Examen Físico.
   Fase segura: puede conectarse sin borrar todavía el código del index.
   Incluye:
   - Examen físico regional
   - Recopilación por sistemas
   - Carga previa desde historia clínica
   - Visualización premium de examen físico previo
   - Protección de datos en edición
   ========================================================== */

window.auroExamenFisicoRegionalConfig = window.auroExamenFisicoRegionalConfig || {
  piel_faneras: {titulo:'Piel y faneras', grupos:[{titulo:'Hallazgos regionales', items:['Piel gruesa','Piel fría','Palidez cutánea']}]},
  cabeza: {titulo:'Cabeza', grupos:[]},
  ojos: {titulo:'Ojos', grupos:[{titulo:'Hallazgos regionales', items:['Hinchazón periorbitaria']}]},
  oidos: {titulo:'Oídos', grupos:[]},
  nariz: {titulo:'Nariz', grupos:[]},
  boca: {titulo:'Boca', grupos:[]},
  orofaringe: {titulo:'Orofaringe', grupos:[]},
  cuello: {titulo:'Cuello', grupos:[]},
  axilas_mamas: {titulo:'Axilas-mamas', grupos:[{titulo:'Hallazgos regionales', items:['Mamas bilateralmente dolorosas','Nódulo palpable en mama derecha','Nódulo palpable en mama izquierda','Secreción por el pezón','Dolor mamario']}]},
  torax: {titulo:'Tórax', grupos:[{titulo:'Hallazgos regionales', items:['Asimetría de tórax presente','Dolor a la digitopresión intercostal','Roncus presentes','Sibilancias presentes','Tiraje intercostal presente','Ruidos respiratorios presentes','Estertores presentes','No se evidencia soplos cardíacos','Ruidos cardíacos rítmicos regulares']}]},
  abdomen_regional: {titulo:'Abdomen', grupos:[{titulo:'Hallazgos regionales', items:['Distensión abdominal presente','Blumberg positivo','Rovsing positivo','Maniobra de psoas positiva','Puntos ureterales dolorosos medios','Puntos ureterales dolorosos inferiores','Dolor en punto cístico positivo','Signo de Murphy positivo']}]},
  columna_vertebral: {titulo:'Columna vertebral', grupos:[{titulo:'Hallazgos regionales', items:['Lasègue positivo','Bragard positivo','Valleix positivo','Spurling positivo','Descompresión cervical positiva','Contractura muscular paravertebral presente']}]},
  ingle_perine: {titulo:'Ingle-periné', grupos:[]},
  genitales_regional: {titulo:'Genitales', grupos:[]},
  ano_recto: {titulo:'Ano recto', grupos:[]},
  canal_vaginal: {titulo:'Canal vaginal', grupos:[{titulo:'Hallazgos regionales', items:['Cérvix inflamatorio presente','Flujo vaginal abundante','Cambios macroscópicos en cérvix','Irritación vaginal presente','Lesiones blanquecinas en cuello']}]},
  miembros_superiores: {titulo:'Miembros superiores', grupos:[
    {titulo:'Hombro', items:['Jobe positivo','Hawkins positivo','Drop Arm positivo','Neer positivo','Speed positivo']},
    {titulo:'Muñeca', items:['Durkan positivo','Tinel positivo','Finkelstein positivo','Phalen positivo']}
  ]},
  miembros_inferiores: {titulo:'Miembros inferiores', grupos:[
    {titulo:'Rodilla', items:['Test de cepillo positivo','Zohlen positivo','McMurray positivo','Apley positivo','Cajón anterior positivo','Cajón posterior positivo','Bostezo medial positivo','Bostezo lateral positivo']},
    {titulo:'Cadera', items:['Fader positivo','Fadir positivo','Test de Thomas positivo']},
    {titulo:'Tobillo', items:['Cotton positivo','Tobillo inestable positivo','Thompson positivo']}
  ]},
  neurologico_regional: {titulo:'Neurológico', grupos:[{titulo:'Hallazgos regionales', items:['Reflejo de tobillo lento']}]},
  otros_hallazgos: {titulo:'Otros hallazgos', grupos:[{titulo:'Hallazgos regionales', items:['Movimientos lentos']}]}
};

function hcRegionalInputId(region){
  return 'hcRegional_' + region + '_obs';
}

function renderHcRegionalPanels(){
  const cont = document.getElementById('hcRegionalPanels');
  if(!cont || cont.dataset.rendered === '1') return;

  const html = Object.keys(window.auroExamenFisicoRegionalConfig).map((key, index) => {
    const cfg = window.auroExamenFisicoRegionalConfig[key];
    const grupos = (cfg.grupos || []).map(grupo => `
      <div class="sistemas-check-group">
        <div class="sistemas-check-subhead">${grupo.titulo}</div>
        <div class="sistemas-check-grid">
          ${(grupo.items || []).map(item => `
            <label class="sistemas-check-item">
              <input type="checkbox" class="hcRegionalCheck" data-region="${key}" data-grupo="${grupo.titulo}" data-label="${item}"> ${item}
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <div class="sistemas-check-card regional-panel ${index === 0 ? 'active' : ''}" data-region-panel="${key}">
        <div class="sistemas-check-head"><i class="bi bi-person-vcard"></i> ${cfg.titulo}</div>
        <div class="sistemas-check-body">
          ${grupos}
          <div class="sistemas-check-observacion mt-2">
            <textarea id="${hcRegionalInputId(key)}" class="form-control regional-textarea" rows="1" placeholder="Escriba hallazgos solo si fueron valorados"></textarea>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cont.innerHTML = html;
  cont.dataset.rendered = '1';
}

function activarHcRegional(region){
  renderHcRegionalPanels();
  document.querySelectorAll('#hcRegionalTabs .regional-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.region === region);
  });
  document.querySelectorAll('#hcRegionalPanels .regional-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.regionPanel === region);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderHcRegionalPanels();
  document.querySelectorAll('#hcRegionalTabs .regional-tab').forEach(btn => {
    btn.addEventListener('click', () => activarHcRegional(btn.dataset.region));
  });
});

function recopilarRegionalExamenFisico(){
  renderHcRegionalPanels();
  const regiones = [];

  Object.keys(window.auroExamenFisicoRegionalConfig).forEach(region => {
    const cfg = window.auroExamenFisicoRegionalConfig[region];
    const partes = [];
    const grupos = {};

    document.querySelectorAll(`.hcRegionalCheck[data-region="${region}"]`).forEach(chk => {
      if(!chk.checked) return;
      const grupo = chk.dataset.grupo || 'Hallazgos regionales';
      const label = chk.dataset.label || '';
      if(!grupos[grupo]) grupos[grupo] = [];
      if(label) grupos[grupo].push(label);
    });

    Object.keys(grupos).forEach(grupo => {
      if(grupos[grupo] && grupos[grupo].length){
        partes.push(`${grupo}: ${grupos[grupo].join(', ')}`);
      }
    });

    const observacion = getValueIfExists(hcRegionalInputId(region)).trim();

    /*
      CORRECCIÓN IASYN:
      Antes el sistema guardaba "NO VALORADO" por cada región.
      Eso generaba múltiples tarjetas repetidas de "Otros hallazgos" al cargar la historia previa.
      Ahora solo se guarda la región cuando existe un hallazgo real o una observación real.
    */
    if(observacion && !auroEsNoValoradoExamen(observacion)){
      partes.push('Observación: ' + observacion);
    }

    if(partes.length){
      regiones.push(`${cfg.titulo}: ${partes.join(' | ')}`);
    }
  });

  return regiones.join(' || ');
}


window.hcCie10CatalogoBase = window.hcCie10CatalogoBase || [
  {
    "codigo": "N760",
    "nombre": "Vaginitis aguda"
  },
  {
    "codigo": "N761",
    "nombre": "Vaginitis subaguda y crónica"
  },
  {
    "codigo": "N720",
    "nombre": "Cervicitis"
  },
  {
    "codigo": "N870",
    "nombre": "Displasia cervical leve"
  },
  {
    "codigo": "N871",
    "nombre": "Displasia cervical moderada"
  },
  {
    "codigo": "N872",
    "nombre": "Displasia cervical severa"
  },
  {
    "codigo": "N879",
    "nombre": "Displasia del cuello uterino no especificada"
  },
  {
    "codigo": "B977",
    "nombre": "Papilomavirus como causa de enfermedades clasificadas en otros capítulos"
  },
  {
    "codigo": "A630",
    "nombre": "Verrugas anogenitales"
  },
  {
    "codigo": "B373",
    "nombre": "Candidiasis de vulva y vagina"
  },
  {
    "codigo": "A590",
    "nombre": "Tricomoniasis urogenital"
  },
  {
    "codigo": "A600",
    "nombre": "Herpes genital"
  },
  {
    "codigo": "A560",
    "nombre": "Infección urogenital por clamidia"
  },
  {
    "codigo": "A549",
    "nombre": "Infección gonocócica no especificada"
  },
  {
    "codigo": "A539",
    "nombre": "Sífilis no especificada"
  },
  {
    "codigo": "D250",
    "nombre": "Mioma uterino submucoso"
  },
  {
    "codigo": "D251",
    "nombre": "Mioma uterino intramural"
  },
  {
    "codigo": "D252",
    "nombre": "Mioma uterino subseroso"
  },
  {
    "codigo": "D259",
    "nombre": "Mioma uterino no especificado"
  },
  {
    "codigo": "N800",
    "nombre": "Endometriosis del útero"
  },
  {
    "codigo": "N801",
    "nombre": "Endometriosis del ovario"
  },
  {
    "codigo": "N809",
    "nombre": "Endometriosis no especificada"
  },
  {
    "codigo": "N920",
    "nombre": "Menstruación excesiva y frecuente con ciclo regular"
  },
  {
    "codigo": "N921",
    "nombre": "Menstruación excesiva y frecuente con ciclo irregular"
  },
  {
    "codigo": "N939",
    "nombre": "Hemorragia uterina y vaginal anormal no especificada"
  },
  {
    "codigo": "N944",
    "nombre": "Dismenorrea primaria"
  },
  {
    "codigo": "N945",
    "nombre": "Dismenorrea secundaria"
  },
  {
    "codigo": "N946",
    "nombre": "Dismenorrea no especificada"
  },
  {
    "codigo": "R102",
    "nombre": "Dolor pélvico y perineal"
  },
  {
    "codigo": "N941",
    "nombre": "Dispareunia"
  },
  {
    "codigo": "N952",
    "nombre": "Vaginitis atrófica postmenopáusica"
  },
  {
    "codigo": "N951",
    "nombre": "Estado menopáusico y climatérico femenino"
  },
  {
    "codigo": "N979",
    "nombre": "Infertilidad femenina no especificada"
  },
  {
    "codigo": "Z014",
    "nombre": "Examen ginecológico general"
  },
  {
    "codigo": "Z124",
    "nombre": "Pesquisa especial para tumor del cuello uterino"
  },
  {
    "codigo": "Z300",
    "nombre": "Consejo anticonceptivo"
  },
  {
    "codigo": "Z321",
    "nombre": "Embarazo confirmado"
  },
  {
    "codigo": "Z340",
    "nombre": "Supervisión de primer embarazo normal"
  },
  {
    "codigo": "Z348",
    "nombre": "Supervisión de otros embarazos normales"
  },
  {
    "codigo": "Z349",
    "nombre": "Supervisión de embarazo normal no especificado"
  },
  {
    "codigo": "O099",
    "nombre": "Supervisión de embarazo de alto riesgo no especificado"
  },
  {
    "codigo": "O200",
    "nombre": "Amenaza de aborto"
  },
  {
    "codigo": "O209",
    "nombre": "Hemorragia precoz del embarazo no especificada"
  },
  {
    "codigo": "O210",
    "nombre": "Hiperémesis gravídica leve"
  },
  {
    "codigo": "O230",
    "nombre": "Infección del riñón en el embarazo"
  },
  {
    "codigo": "O231",
    "nombre": "Infección de vejiga en el embarazo"
  },
  {
    "codigo": "O234",
    "nombre": "Infección urinaria en embarazo no especificada"
  },
  {
    "codigo": "O235",
    "nombre": "Infección genital en el embarazo"
  },
  {
    "codigo": "O244",
    "nombre": "Diabetes gestacional"
  },
  {
    "codigo": "O249",
    "nombre": "Diabetes mellitus en embarazo no especificada"
  },
  {
    "codigo": "O13",
    "nombre": "Hipertensión gestacional sin proteinuria significativa"
  },
  {
    "codigo": "O140",
    "nombre": "Preeclampsia moderada"
  },
  {
    "codigo": "O141",
    "nombre": "Preeclampsia severa"
  },
  {
    "codigo": "O149",
    "nombre": "Preeclampsia no especificada"
  },
  {
    "codigo": "O410",
    "nombre": "Oligohidramnios"
  },
  {
    "codigo": "O420",
    "nombre": "Ruptura prematura de membranas"
  },
  {
    "codigo": "O470",
    "nombre": "Falso trabajo de parto antes de las 37 semanas"
  },
  {
    "codigo": "O600",
    "nombre": "Trabajo de parto prematuro sin parto"
  },
  {
    "codigo": "O820",
    "nombre": "Parto por cesárea electiva"
  },
  {
    "codigo": "O821",
    "nombre": "Parto por cesárea de emergencia"
  },
  {
    "codigo": "O809",
    "nombre": "Parto único espontáneo no especificado"
  },
  {
    "codigo": "E039",
    "nombre": "Hipotiroidismo no especificado"
  },
  {
    "codigo": "E050",
    "nombre": "Hipertiroidismo con bocio difuso"
  },
  {
    "codigo": "E059",
    "nombre": "Hipertiroidismo no especificado"
  },
  {
    "codigo": "E069",
    "nombre": "Tiroiditis no especificada"
  },
  {
    "codigo": "E079",
    "nombre": "Trastorno de tiroides no especificado"
  },
  {
    "codigo": "E119",
    "nombre": "Diabetes mellitus tipo 2 sin complicaciones"
  },
  {
    "codigo": "E112",
    "nombre": "Diabetes mellitus tipo 2 con complicaciones renales"
  },
  {
    "codigo": "E113",
    "nombre": "Diabetes mellitus tipo 2 con complicaciones oftálmicas"
  },
  {
    "codigo": "E114",
    "nombre": "Diabetes mellitus tipo 2 con complicaciones neurológicas"
  },
  {
    "codigo": "E115",
    "nombre": "Diabetes mellitus tipo 2 con complicaciones circulatorias periféricas"
  },
  {
    "codigo": "E117",
    "nombre": "Diabetes mellitus tipo 2 con complicaciones múltiples"
  },
  {
    "codigo": "E149",
    "nombre": "Diabetes mellitus no especificada sin complicaciones"
  },
  {
    "codigo": "R730",
    "nombre": "Prueba de tolerancia a la glucosa anormal"
  },
  {
    "codigo": "R739",
    "nombre": "Hiperglucemia no especificada"
  },
  {
    "codigo": "E162",
    "nombre": "Hipoglucemia no especificada"
  },
  {
    "codigo": "E660",
    "nombre": "Obesidad por exceso de calorías"
  },
  {
    "codigo": "E669",
    "nombre": "Obesidad no especificada"
  },
  {
    "codigo": "E780",
    "nombre": "Hipercolesterolemia pura"
  },
  {
    "codigo": "E781",
    "nombre": "Hipergliceridemia pura"
  },
  {
    "codigo": "E782",
    "nombre": "Hiperlipidemia mixta"
  },
  {
    "codigo": "E785",
    "nombre": "Hiperlipidemia no especificada"
  },
  {
    "codigo": "E559",
    "nombre": "Deficiencia de vitamina D no especificada"
  },
  {
    "codigo": "E611",
    "nombre": "Deficiencia de hierro"
  },
  {
    "codigo": "E282",
    "nombre": "Síndrome de ovario poliquístico"
  },
  {
    "codigo": "E281",
    "nombre": "Exceso de andrógenos"
  },
  {
    "codigo": "E221",
    "nombre": "Hiperprolactinemia"
  },
  {
    "codigo": "E349",
    "nombre": "Trastorno endocrino no especificado"
  },
  {
    "codigo": "I10",
    "nombre": "Hipertensión esencial primaria"
  },
  {
    "codigo": "I110",
    "nombre": "Enfermedad cardíaca hipertensiva con insuficiencia cardíaca"
  },
  {
    "codigo": "I119",
    "nombre": "Enfermedad cardíaca hipertensiva sin insuficiencia cardíaca"
  },
  {
    "codigo": "I120",
    "nombre": "Enfermedad renal hipertensiva con insuficiencia renal"
  },
  {
    "codigo": "I129",
    "nombre": "Enfermedad renal hipertensiva sin insuficiencia renal"
  },
  {
    "codigo": "I150",
    "nombre": "Hipertensión renovascular"
  },
  {
    "codigo": "I159",
    "nombre": "Hipertensión secundaria no especificada"
  },
  {
    "codigo": "I200",
    "nombre": "Angina inestable"
  },
  {
    "codigo": "I209",
    "nombre": "Angina de pecho no especificada"
  },
  {
    "codigo": "I219",
    "nombre": "Infarto agudo de miocardio no especificado"
  },
  {
    "codigo": "I250",
    "nombre": "Enfermedad cardiovascular aterosclerótica"
  },
  {
    "codigo": "I251",
    "nombre": "Enfermedad aterosclerótica del corazón"
  },
  {
    "codigo": "I259",
    "nombre": "Enfermedad isquémica crónica del corazón no especificada"
  },
  {
    "codigo": "I269",
    "nombre": "Embolia pulmonar"
  },
  {
    "codigo": "I272",
    "nombre": "Hipertensión pulmonar secundaria"
  },
  {
    "codigo": "I350",
    "nombre": "Estenosis aórtica no reumática"
  },
  {
    "codigo": "I359",
    "nombre": "Trastorno de la válvula aórtica no especificado"
  },
  {
    "codigo": "I420",
    "nombre": "Cardiomiopatía dilatada"
  },
  {
    "codigo": "I429",
    "nombre": "Cardiomiopatía no especificada"
  },
  {
    "codigo": "I471",
    "nombre": "Taquicardia supraventricular"
  },
  {
    "codigo": "I472",
    "nombre": "Taquicardia ventricular"
  },
  {
    "codigo": "I48",
    "nombre": "Fibrilación y aleteo auricular"
  },
  {
    "codigo": "I499",
    "nombre": "Arritmia cardíaca no especificada"
  },
  {
    "codigo": "I500",
    "nombre": "Insuficiencia cardíaca congestiva"
  },
  {
    "codigo": "I501",
    "nombre": "Insuficiencia ventricular izquierda"
  },
  {
    "codigo": "I509",
    "nombre": "Insuficiencia cardíaca no especificada"
  },
  {
    "codigo": "I519",
    "nombre": "Enfermedad cardíaca no especificada"
  },
  {
    "codigo": "I64",
    "nombre": "Accidente vascular encefálico no especificado"
  },
  {
    "codigo": "I679",
    "nombre": "Enfermedad cerebrovascular no especificada"
  },
  {
    "codigo": "I700",
    "nombre": "Aterosclerosis de la aorta"
  },
  {
    "codigo": "I709",
    "nombre": "Aterosclerosis generalizada y no especificada"
  },
  {
    "codigo": "I739",
    "nombre": "Enfermedad vascular periférica no especificada"
  },
  {
    "codigo": "I800",
    "nombre": "Flebitis y tromboflebitis superficial de miembros inferiores"
  },
  {
    "codigo": "I802",
    "nombre": "Flebitis y tromboflebitis profunda de miembros inferiores"
  },
  {
    "codigo": "I803",
    "nombre": "Flebitis y tromboflebitis de miembros inferiores no especificada"
  },
  {
    "codigo": "I830",
    "nombre": "Várices de miembros inferiores con úlcera"
  },
  {
    "codigo": "I831",
    "nombre": "Várices de miembros inferiores con inflamación"
  },
  {
    "codigo": "I832",
    "nombre": "Várices de miembros inferiores con úlcera e inflamación"
  },
  {
    "codigo": "I839",
    "nombre": "Várices de miembros inferiores sin úlcera ni inflamación"
  },
  {
    "codigo": "I872",
    "nombre": "Insuficiencia venosa crónica periférica"
  },
  {
    "codigo": "I879",
    "nombre": "Trastorno venoso no especificado"
  },
  {
    "codigo": "I890",
    "nombre": "Linfedema"
  },
  {
    "codigo": "I959",
    "nombre": "Hipotensión no especificada"
  },
  {
    "codigo": "N300",
    "nombre": "Cistitis aguda"
  },
  {
    "codigo": "N309",
    "nombre": "Cistitis no especificada"
  },
  {
    "codigo": "N390",
    "nombre": "Infección de vías urinarias sitio no especificado"
  },
  {
    "codigo": "J00",
    "nombre": "Rinofaringitis aguda resfriado común"
  },
  {
    "codigo": "J029",
    "nombre": "Faringitis aguda no especificada"
  },
  {
    "codigo": "J039",
    "nombre": "Amigdalitis aguda no especificada"
  },
  {
    "codigo": "J069",
    "nombre": "Infección respiratoria superior no especificada"
  },
  {
    "codigo": "J209",
    "nombre": "Bronquitis aguda no especificada"
  },
  {
    "codigo": "J459",
    "nombre": "Asma no especificada"
  },
  {
    "codigo": "J309",
    "nombre": "Rinitis alérgica no especificada"
  },
  {
    "codigo": "K219",
    "nombre": "Reflujo gastroesofágico sin esofagitis"
  },
  {
    "codigo": "K297",
    "nombre": "Gastritis no especificada"
  },
  {
    "codigo": "K590",
    "nombre": "Constipación"
  },
  {
    "codigo": "K529",
    "nombre": "Gastroenteritis y colitis no infecciosa no especificada"
  },
  {
    "codigo": "D509",
    "nombre": "Anemia por deficiencia de hierro no especificada"
  },
  {
    "codigo": "D649",
    "nombre": "Anemia no especificada"
  },
  {
    "codigo": "R51",
    "nombre": "Cefalea"
  },
  {
    "codigo": "R42",
    "nombre": "Mareo y desvanecimiento"
  },
  {
    "codigo": "R53",
    "nombre": "Malestar y fatiga"
  },
  {
    "codigo": "R104",
    "nombre": "Dolor abdominal no especificado"
  },
  {
    "codigo": "R11",
    "nombre": "Náusea y vómito"
  },
  {
    "codigo": "R50",
    "nombre": "Fiebre de origen desconocido"
  },
  {
    "codigo": "R600",
    "nombre": "Edema localizado"
  },
  {
    "codigo": "R609",
    "nombre": "Edema no especificado"
  },
  {
    "codigo": "R634",
    "nombre": "Pérdida anormal de peso"
  },
  {
    "codigo": "R635",
    "nombre": "Aumento anormal de peso"
  },
  {
    "codigo": "M545",
    "nombre": "Lumbago no especificado"
  },
  {
    "codigo": "M549",
    "nombre": "Dorsalgia no especificada"
  },
  {
    "codigo": "M255",
    "nombre": "Dolor en articulación"
  },
  {
    "codigo": "M796",
    "nombre": "Dolor en miembro"
  },
  {
    "codigo": "M791",
    "nombre": "Mialgia"
  },
  {
    "codigo": "M819",
    "nombre": "Osteoporosis no especificada"
  },
  {
    "codigo": "F419",
    "nombre": "Trastorno de ansiedad no especificado"
  },
  {
    "codigo": "F329",
    "nombre": "Episodio depresivo no especificado"
  },
  {
    "codigo": "G439",
    "nombre": "Migraña no especificada"
  },
  {
    "codigo": "G470",
    "nombre": "Insomnio"
  },
  {
    "codigo": "L700",
    "nombre": "Acné vulgar"
  },
  {
    "codigo": "L709",
    "nombre": "Acné no especificado"
  },
  {
    "codigo": "L650",
    "nombre": "Efluvio telógeno"
  },
  {
    "codigo": "L659",
    "nombre": "Pérdida de cabello no cicatricial no especificada"
  },
  {
    "codigo": "L639",
    "nombre": "Alopecia areata no especificada"
  },
  {
    "codigo": "L680",
    "nombre": "Hirsutismo"
  },
  {
    "codigo": "L681",
    "nombre": "Hirsutismo adquirido"
  },
  {
    "codigo": "L810",
    "nombre": "Hiperpigmentación postinflamatoria"
  },
  {
    "codigo": "L819",
    "nombre": "Trastorno de pigmentación no especificado"
  },
  {
    "codigo": "L905",
    "nombre": "Cicatrices y fibrosis de la piel"
  },
  {
    "codigo": "L989",
    "nombre": "Trastorno de piel y tejido subcutáneo no especificado"
  }
];
/* IASYN FIX SEGURO 2026-06-28
   Evita error de consola: Identifier 'hcDxResultadosActuales' has already been declared.
   No cambia la lógica del módulo: si el index ya creó estas variables, se reutilizan;
   si no existen, se crean como variables globales seguras en window.
*/
if (typeof hcDxResultadosActuales === 'undefined') {
  window.hcDxResultadosActuales = [];
}
if (typeof hcDiagnosticosSeleccionados === 'undefined') {
  window.hcDiagnosticosSeleccionados = [];
}

function normalizarDxTexto(valor){
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
function buscarDiagnosticoCie10(){
  const codigo = normalizarDxTexto(getValueIfExists('hcDxCodigoBuscar'));
  const nombre = normalizarDxTexto(getValueIfExists('hcDxNombreBuscar'));
  const body = document.getElementById('hcDxResultadosBody');
  if(!body) return;
  if(!codigo && !nombre){hcDxResultadosActuales=[];body.innerHTML='<tr><td colspan="3" class="diagnostico-empty">Sin Registros</td></tr>';return;}
  hcDxResultadosActuales = window.hcCie10CatalogoBase.filter(d => (!codigo || normalizarDxTexto(d.codigo).includes(codigo)) && (!nombre || normalizarDxTexto(d.nombre).includes(nombre))).slice(0,12);
  body.innerHTML = hcDxResultadosActuales.map((d,i)=>`<tr><td class="diagnostico-cie-code">${d.codigo}</td><td>${String(d.nombre||'').toUpperCase()}</td><td><button type="button" class="diagnostico-add" onclick="agregarDiagnosticoCie10DesdeResultado(${i})">Agregar</button></td></tr>`).join('') || '<tr><td colspan="3" class="diagnostico-empty">Sin Registros</td></tr>';
}
function agregarDiagnosticoCie10DesdeResultado(index){const d=hcDxResultadosActuales[index];if(d)agregarDiagnosticoCie10(d.codigo,d.nombre);}
function agregarDiagnosticoCie10Manual(){const codigo=getValueIfExists('hcDxCodigoBuscar').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');const nombre=getValueIfExists('hcDxNombreBuscar').trim();if(!codigo||!nombre){alert('Ingrese código CIE-10 y nombre de diagnóstico, o seleccione un resultado de la búsqueda.');return;}agregarDiagnosticoCie10(codigo,nombre);}

/* ==========================================================
   IASYN DX - LIMPIEZA QUIRÚRGICA DEL BUSCADOR CIE-10
   ----------------------------------------------------------
   Alcance EXCLUSIVAMENTE visual:
   - Vacía código y nombre de búsqueda.
   - Vacía resultados temporales y muestra "Sin Registros".
   - Opcionalmente devuelve el foco al nombre del diagnóstico.
   - NO modifica hcDiagnosticosSeleccionados.
   - NO guarda, elimina ni altera datos clínicos persistidos.
   ========================================================== */
function auroLimpiarBusquedaDiagnosticoCie10(enfocarNombre){
  const codigo = document.getElementById('hcDxCodigoBuscar');
  const nombre = document.getElementById('hcDxNombreBuscar');
  const body = document.getElementById('hcDxResultadosBody');

  if(codigo) codigo.value = '';
  if(nombre) nombre.value = '';

  window.hcDxResultadosActuales = [];
  try{ hcDxResultadosActuales = window.hcDxResultadosActuales; }catch(_e){}

  if(body){
    body.innerHTML = '<tr><td colspan="3" class="diagnostico-empty">Sin Registros</td></tr>';
  }

  if(enfocarNombre !== false && nombre && !nombre.disabled){
    try{ nombre.focus({preventScroll:true}); }
    catch(_e){ try{ nombre.focus(); }catch(__e){} }
  }

  return true;
}
window.auroLimpiarBusquedaDiagnosticoCie10 = auroLimpiarBusquedaDiagnosticoCie10;

function agregarDiagnosticoCie10(codigo,nombre){
  codigo = String(codigo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  nombre = String(nombre || '').trim();

  if(!codigo || !nombre) return;

  if(hcDiagnosticosSeleccionados.some(d => d.codigo === codigo)){
    alert('Este diagnóstico ya fue agregado.');
    return;
  }

  hcDiagnosticosSeleccionados.push({
    codigo,
    nombre,
    principal: hcDiagnosticosSeleccionados.length === 0,
    tipo: 'Presuntivo'
  });

  renderDiagnosticosSeleccionados();
  sincronizarDiagnosticosConCamposHistoria();

  /*
    Limpieza visual posterior a una adición realmente exitosa.
    El diagnóstico recién agregado permanece en hcDiagnosticosSeleccionados.
  */
  auroLimpiarBusquedaDiagnosticoCie10(true);

  /* ======================================================
     IASYN - CONEXIÓN SEGURA CIE-10 INTELIGENTE
     ------------------------------------------------------
     - Se ejecuta solo después de agregar el diagnóstico.
     - No modifica Examen Físico, Plan, Recetas ni guardado.
     - Si el módulo cie10_inteligente.js no está cargado,
       el sistema continúa funcionando igual.
     ====================================================== */
  try{
    if(typeof window.auroCie10InteligenteBuscarProtocolo === 'function'){
      window.auroCie10InteligenteBuscarProtocolo(codigo, nombre);
    }
  }catch(error){
    console.warn('IASYN EXAMEN: CIE-10 inteligente no pudo ejecutarse.', error);
  }
}
function eliminarDiagnosticoCie10(index){hcDiagnosticosSeleccionados.splice(index,1);if(hcDiagnosticosSeleccionados.length&&!hcDiagnosticosSeleccionados.some(d=>d.principal))hcDiagnosticosSeleccionados[0].principal=true;renderDiagnosticosSeleccionados();sincronizarDiagnosticosConCamposHistoria();}
function marcarDiagnosticoPrincipal(index){hcDiagnosticosSeleccionados.forEach((d,i)=>d.principal=i===index);renderDiagnosticosSeleccionados();sincronizarDiagnosticosConCamposHistoria();}
function cambiarTipoDiagnostico(index,valor){if(hcDiagnosticosSeleccionados[index])hcDiagnosticosSeleccionados[index].tipo=valor;sincronizarDiagnosticosConCamposHistoria();}
function renderDiagnosticosSeleccionados(){const body=document.getElementById('hcDxSeleccionadosBody');if(!body)return;if(!hcDiagnosticosSeleccionados.length){body.innerHTML='<tr><td colspan="4" class="diagnostico-empty">Sin diagnósticos agregados</td></tr>';return;}body.innerHTML=hcDiagnosticosSeleccionados.map((d,i)=>`<tr><td><span class="diagnostico-cie-code">${d.codigo}</span> &nbsp; ${String(d.nombre||'').toUpperCase()}</td><td class="text-center"><input class="diagnostico-radio" type="radio" name="hcDxPrincipal" ${d.principal?'checked':''} onchange="marcarDiagnosticoPrincipal(${i})"></td><td><select class="form-select diagnostico-tipo-select" onchange="cambiarTipoDiagnostico(${i}, this.value)"><option ${d.tipo==='Presuntivo'?'selected':''}>Presuntivo</option><option ${d.tipo==='Definitivo'?'selected':''}>Definitivo</option></select></td><td class="text-center"><button type="button" class="diagnostico-delete" onclick="eliminarDiagnosticoCie10(${i})"><i class="bi bi-trash"></i></button></td></tr>`).join('');}
function sincronizarDiagnosticosConCamposHistoria(){const principal=hcDiagnosticosSeleccionados.find(d=>d.principal)||hcDiagnosticosSeleccionados[0];const secundarios=hcDiagnosticosSeleccionados.filter(d=>!principal||d.codigo!==principal.codigo);if(principal){setValueIfExists('hcCie10Principal',principal.codigo);setValueIfExists('hcDiagnosticoPrincipal',principal.nombre);}else{setValueIfExists('hcCie10Principal','');setValueIfExists('hcDiagnosticoPrincipal','');}setValueIfExists('hcCie10Secundario',secundarios.map(d=>d.codigo).join('; '));setValueIfExists('hcDiagnosticoSecundario',secundarios.map(d=>`${d.codigo} ${d.nombre} (${d.tipo})`).join('; '));}
function recopilarDiagnosticosCie10(){sincronizarDiagnosticosConCamposHistoria();return hcDiagnosticosSeleccionados.map(d=>`${d.principal?'Principal':'Secundario'}: ${d.codigo} ${d.nombre} (${d.tipo})`).join(' || ');}

function recopilarInterconsultaPlan(){
  const partes = [];
  const tipo = getValueIfExists('hcInterconsultaTipo');
  const especialidad = getValueIfExists('hcInterconsultaEspecialidad');
  const prioridad = getValueIfExists('hcInterconsultaPrioridad');
  const profesional = getValueIfExists('hcInterconsultaProfesional');
  const estado = getValueIfExists('hcInterconsultaEstado');
  const motivo = getValueIfExists('hcInterconsultaMotivo');
  const observaciones = getValueIfExists('hcInterconsultaObservaciones');
  if(tipo) partes.push('Tipo: ' + tipo);
  if(especialidad) partes.push('Especialidad: ' + especialidad);
  if(prioridad) partes.push('Prioridad: ' + prioridad);
  if(profesional) partes.push('Profesional: ' + profesional);
  if(estado) partes.push('Estado: ' + estado);
  if(motivo) partes.push('Motivo: ' + motivo);
  if(observaciones) partes.push('Observaciones: ' + observaciones);
  const texto = partes.join(' | ');
  setValueIfExists('hcInterconsultaResumen', texto);
  return texto;
}

function recopilarEvaluacionesPlan(){
  const items = [];
  const opciones = [
    ['hcEvalMalaActitud', 'Denota mala actitud ante el examinador'],
    ['hcEvalAnimo', 'Alteraciones del estado de ánimo'],
    ['hcEvalAbusoNegligencia', 'Sospecha psicológica: paciente víctima de abuso o negligencia'],
    ['hcEvalAnomaliasMotoras', 'Evidencia actividades y anomalías motoras'],
    ['hcEvalOdontologica', 'Requiere evaluación odontológica']
  ];
  opciones.forEach(([id, texto]) => {
    const el = document.getElementById(id);
    if(el && el.checked) items.push(texto);
  });
  const resumen = items.join(' | ');
  setValueIfExists('hcEvaluacionesResumen', resumen);
  return resumen;
}



/* ==========================================================
   IASYN - Examen físico v3.2
   Conexión completa, ayudas clínicas y compatibilidad con datos previos.
   No modifica base de datos ni Code.gs.
   ========================================================== */

function auroNormalizarExamenTexto(valor){
  return String(valor || '')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function auroEscapeHtml(valor){
  return String(valor || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}


/* ==========================================================
   IASYN FIX QUIRÚRGICO IMC 2026-07-27
   Alcance exclusivo:
   - Valida el valor IMC antes de mostrarlo o restaurarlo.
   - Si llega una fecha ISO, objeto Date o serial de Google Sheets
     como 46254, lo descarta.
   - Si existen peso y talla válidos, recalcula el IMC.
   - No modifica guardado, diagnóstico, agenda, plan ni otros módulos.
   ========================================================== */
function auroIMCClinicoSeguro(valor, peso, tallaCm){
  const esFecha = Object.prototype.toString.call(valor) === '[object Date]';

  if(!esFecha){
    const texto = String(valor === null || valor === undefined ? '' : valor).trim();

    if(texto && !/^\d{4}-\d{2}-\d{2}T/i.test(texto)){
      const numero = Number(texto.replace(',', '.'));

      if(Number.isFinite(numero) && numero >= 5 && numero <= 100){
        return String(Number(numero.toFixed(1)));
      }
    }
  }

  const pesoNumero = Number(String(peso === null || peso === undefined ? '' : peso).replace(',', '.'));
  const tallaNumero = Number(String(tallaCm === null || tallaCm === undefined ? '' : tallaCm).replace(',', '.'));

  if(
    Number.isFinite(pesoNumero) &&
    Number.isFinite(tallaNumero) &&
    pesoNumero >= 1 &&
    pesoNumero <= 400 &&
    tallaNumero >= 30 &&
    tallaNumero <= 250
  ){
    const tallaM = tallaNumero / 100;
    const calculado = pesoNumero / (tallaM * tallaM);

    if(Number.isFinite(calculado) && calculado >= 5 && calculado <= 100){
      return String(Number(calculado.toFixed(1)));
    }
  }

  return '';
}

function auroHistoriaTieneExamenFisico(h){
  if(!h) return false;
  return [
    h.peso_kg,
    h.talla_cm,
    h.imc,
    h.presion_arterial,
    h.frecuencia_cardiaca,
    h.temperatura,
    h.saturacion,
    h.examen_fisico
  ].some(v => String(v || '').trim());
}

function auroHistoriaTieneDiagnosticos(h){
  if(!h) return false;
  return [
    h.diagnostico_cie10,
    h.diagnostico_principal,
    h.diagnostico_secundario,
    h.cie10_secundario,
    h.diagnosticos_cie10
  ].some(v => String(v || '').trim());
}

function auroAsegurarCajaExamenFisicoPrevio(){
  const panel = document.getElementById('hc_examen');
  if(!panel) return null;

  let box = document.getElementById('auroExamenFisicoPrevioBox');
  if(box) return box;

  box = document.createElement('div');
  box.id = 'auroExamenFisicoPrevioBox';
  box.className = 'auro-previos-box';
  box.style.display = 'none';
  box.innerHTML = `
    <div class="auro-previos-head">
      <div>
        <b><i class="bi bi-database-check me-1"></i> Examen físico previo guardado</b>
        <small>Información leída desde Google Sheets. Se conserva para evitar pérdida de datos.</small>
      </div>
      <button type="button" class="btn-soft auro-previos-hide" onclick="document.getElementById('auroExamenFisicoPrevioBox').style.display='none'">Ocultar</button>
    </div>
    <div class="auro-previos-content" id="auroExamenFisicoPrevioContent"></div>
  `;

  const titulo = panel.querySelector('.clinical-subtitle');
  if(titulo && titulo.nextSibling){
    titulo.parentNode.insertBefore(box, titulo.nextSibling);
  }else{
    panel.insertBefore(box, panel.firstChild);
  }
  return box;
}


function auroNormalizarTextoExamenPrevio(valor){
  return String(valor || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\|\s*/g, ' || ')
    .trim();
}

function auroEsNoValoradoExamen(valor){
  const t = String(valor || '').trim().toLowerCase();
  return !t || t === 'no valorado' || t === 'no valorada' || t === 'sin valorar' || t === 'n/v';
}

function auroPartirExamenFisicoPrevio(texto){
  let raw = auroNormalizarTextoExamenPrevio(texto);
  if(!raw) return [];

  const etiquetasConocidas = [
    'Piel y faneras','Cabeza','Ojos','Oídos','Nariz','Boca','Orofaringe','Cuello',
    'Tórax','Axilas-mamas','Abdomen','Columna vertebral','Ingle-periné',
    'Genitales','Ano recto','Canal vaginal','Miembros superiores','Miembros inferiores',
    'Neurológico','Otros hallazgos',
    'Órgano de los sentidos','Organo de los sentidos','Respiratorio','Cardiovascular',
    'Digestivo','Urinario','Músculo Esquelético','Musculo Esqueletico','Endócrino',
    'Endocrino','Hemo-linfático','Hemo-linfatico',
    'Frecuencia respiratoria','Perímetro de cadera','Porcentaje de grasa','Masa muscular',
    'Perímetro cefálico','Perímetro torácico','Perímetro abdominal',
    'Estado general','Cabeza y cuello','Tórax/Respiratorio','Cardiovascular clínico',
    'Extremidades','Ginecológico','Examen físico regional','Examen fisico regional',
    'Examen físico por sistemas','Examen fisico por sistemas'
  ];

  const escapeRegex = txt => String(txt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patronEtiquetas = etiquetasConocidas.map(escapeRegex).join('|');

  /*
    CORRECCIÓN IASYN:
    Algunas historias antiguas quedaron guardadas así:
    "Otros hallazgos: No valorado | Abdomen: No valorado".
    Eso hacía que el visor interpretara todo como "Otros hallazgos" repetido.
    Esta normalización separa correctamente las etiquetas internas antes de renderizar.
  */
  raw = raw
    .replace(/^Examen físico regional\s*:\s*/i, '')
    .replace(/^Examen fisico regional\s*:\s*/i, '')
    .replace(/^Examen físico por sistemas\s*:\s*/i, '')
    .replace(/^Examen fisico por sistemas\s*:\s*/i, '')
    .replace(new RegExp('\\s+\\|\\s+(' + patronEtiquetas + ')\\s*:', 'gi'), ' || $1:');

  return raw.split(/\s*\|\|\s*/).map(item => {
    let t = String(item || '').trim();
    if(!t) return null;

    t = t
      .replace(/^Examen físico regional\s*:\s*/i, '')
      .replace(/^Examen fisico regional\s*:\s*/i, '')
      .replace(/^Examen físico por sistemas\s*:\s*/i, '')
      .replace(/^Examen fisico por sistemas\s*:\s*/i, '');

    const idx = t.indexOf(':');
    if(idx === -1){
      return { etiqueta: 'Detalle', valor: t };
    }

    return {
      etiqueta: t.substring(0, idx).trim(),
      valor: t.substring(idx + 1).trim()
    };
  }).filter(Boolean);
}

function auroNormalizarClaveExamen(valor){
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function auroEsTextoNoValoradoSimple(valor){
  const n = auroNormalizarClaveExamen(valor)
    .replace(/[.;,]+$/g, '')
    .trim();
  return !n || n === 'no valorado' || n === 'no valorada' || n === 'sin valorar' || n === 'n/v';
}

function auroLimpiarValorPrevioClinico(valor){
  let texto = String(valor || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\|\s*/g, ' | ')
    .trim();

  if(!texto) return '';

  const etiquetasBasura = [
    'Examen físico regional','Examen fisico regional','Examen físico por sistemas','Examen fisico por sistemas',
    'Piel y faneras','Cabeza','Ojos','Oídos','Nariz','Boca','Orofaringe','Cuello','Tórax','Axilas-mamas',
    'Abdomen','Columna vertebral','Ingle-periné','Genitales','Ano recto','Canal vaginal',
    'Miembros superiores','Miembros inferiores','Neurológico','Otros hallazgos'
  ];

  const partes = texto
    .split(/\s*\|\s*/)
    .map(x => x.trim())
    .filter(Boolean);

  const limpias = [];

  partes.forEach(parte => {
    let p = parte.trim();
    if(!p) return;

    // Caso: "Examen físico regional: Piel y faneras: No valorado"
    p = p.replace(/^Examen\s+f[ií]sico\s+regional\s*:\s*/i, '').trim();
    p = p.replace(/^Examen\s+f[ií]sico\s+por\s+sistemas\s*:\s*/i, '').trim();

    const idx = p.indexOf(':');
    if(idx !== -1){
      const etiqueta = p.substring(0, idx).trim();
      const valorInterno = p.substring(idx + 1).trim();
      const etiquetaEsBasura = etiquetasBasura.some(e => auroNormalizarClaveExamen(e) === auroNormalizarClaveExamen(etiqueta));

      if(auroEsTextoNoValoradoSimple(valorInterno)) return;
      if(etiquetaEsBasura && auroEsTextoNoValoradoSimple(valorInterno)) return;
    }

    if(auroEsTextoNoValoradoSimple(p)) return;
    if(/:\s*(no valorado|no valorada|sin valorar|n\/v)\s*$/i.test(p)) return;

    limpias.push(p);
  });

  return limpias.join(' | ').trim();
}

function auroEsValorPrevioSoloNoValorado(valor){
  return !auroLimpiarValorPrevioClinico(valor);
}

function auroTokensUnicosConHallazgoReal(tokens){
  const vistos = new Set();
  return (tokens || []).map(t => {
    const etiqueta = String(t.etiqueta || '').trim();
    const valor = auroLimpiarValorPrevioClinico(t.valor || '');
    return { etiqueta, valor };
  }).filter(t => {
    const etiqueta = String(t.etiqueta || '').trim();
    const valor = String(t.valor || '').trim();
    if(!etiqueta || !valor) return false;

    const clave = (etiqueta + '|' + valor).toLowerCase();
    if(vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function auroTokensUnicosNoValorados(tokens){
  const vistos = new Set();
  return (tokens || []).filter(t => {
    const etiqueta = String(t.etiqueta || '').trim();
    const valor = String(t.valor || '').trim();
    if(!etiqueta || !auroEsValorPrevioSoloNoValorado(valor)) return false;

    const clave = etiqueta.toLowerCase();
    if(vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function auroRenderPrevioLinea(label, value){
  if(!String(value || '').trim()) return '';
  return `
    <div class="auro-previos-line">
      <span>${auroEscapeHtml(label)}</span>
      <p>${auroEscapeHtml(value)}</p>
    </div>
  `;
}

function auroRenderPrevioChips(titulo, items){
  const lista = (items || []).filter(Boolean);
  if(!lista.length) return '';
  return `
    <div class="auro-previos-line auro-previos-compact">
      <span>${auroEscapeHtml(titulo)}</span>
      <div class="auro-previos-chip-grid">
        ${lista.map(item => `<div class="auro-previos-chip">${auroEscapeHtml(item)}</div>`).join('')}
      </div>
    </div>
  `;
}

function auroRenderPrevioTabla(titulo, pares){
  const lista = (pares || []).filter(p => p && String(p.etiqueta || '').trim() && String(p.valor || '').trim());
  if(!lista.length) return '';
  return `
    <div class="auro-previos-line auro-previos-compact">
      <span>${auroEscapeHtml(titulo)}</span>
      <div class="auro-previos-mini-table">
        ${lista.map(p => `
          <div class="auro-previos-mini-row">
            <b>${auroEscapeHtml(p.etiqueta)}</b>
            <em>${auroEscapeHtml(p.valor)}</em>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function auroMostrarExamenFisicoPrevio(h){
  const box = auroAsegurarCajaExamenFisicoPrevio();
  const content = document.getElementById('auroExamenFisicoPrevioContent');
  if(!box || !content) return;

  if(!auroHistoriaTieneExamenFisico(h)){
    box.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  /*
    PA desglosada en el resumen previo — SOLO PRESENTACIÓN.
    El dato persistido sigue siendo presion_arterial = "sistólica/diastólica".
    Si el formato histórico no es inequívoco, se conserva el valor original.
  */
  const paRegistrada = String(h.presion_arterial || '').trim();
  const paRegistradaMatch = paRegistrada.match(/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/);
  const signosPresion = paRegistradaMatch
    ? [
        'PA sistólica: ' + paRegistradaMatch[1] + ' mmHg',
        'PA diastólica: ' + paRegistradaMatch[2] + ' mmHg'
      ]
    : (paRegistrada ? ['PA: ' + paRegistrada] : []);

  const signos = [
    h.peso_kg ? 'Peso: ' + h.peso_kg + ' kg' : '',
    h.talla_cm ? 'Talla: ' + h.talla_cm + ' cm' : '',
    auroIMCClinicoSeguro(h.imc, h.peso_kg, h.talla_cm) ? 'IMC: ' + auroIMCClinicoSeguro(h.imc, h.peso_kg, h.talla_cm) : '',
    ...signosPresion,
    h.frecuencia_cardiaca ? 'FC: ' + h.frecuencia_cardiaca : '',
    h.temperatura ? 'Temperatura: ' + h.temperatura + ' °C' : '',
    h.saturacion ? 'SatO₂: ' + h.saturacion + ' %' : ''
  ].filter(Boolean);

  const tokens = auroPartirExamenFisicoPrevio(h.examen_fisico || '');
  const regionales = [
    'Piel y faneras','Cabeza','Ojos','Oídos','Nariz','Boca','Orofaringe','Cuello',
    'Tórax','Axilas-mamas','Abdomen','Columna vertebral','Ingle-periné',
    'Genitales','Ano recto','Canal vaginal','Miembros superiores','Miembros inferiores',
    'Neurológico','Otros hallazgos'
  ];

  const tokensRegional = [];
  const tokensSistemas = [];
  const tokensGenerales = [];

  tokens.forEach(t => {
    const etiqueta = String(t.etiqueta || '').trim();
    if(regionales.some(r => r.toLowerCase() === etiqueta.toLowerCase())){
      tokensRegional.push(t);
    }else if(/sentidos|ocular|respiratorio|cardiovascular|digestivo|urinario|músculo|musculo|endocrino|hemo|linfático|linfatico/i.test(etiqueta)){
      tokensSistemas.push(t);
    }else{
      tokensGenerales.push(t);
    }
  });

  const regionalHallazgos = auroTokensUnicosConHallazgoReal(tokensRegional);
  const sistemasHallazgos = auroTokensUnicosConHallazgoReal(tokensSistemas);
  const generalesLimpios = auroTokensUnicosConHallazgoReal(tokensGenerales);

  const diagnosticos = [
    h.diagnostico_cie10 ? 'Principal CIE-10: ' + h.diagnostico_cie10 : '',
    h.diagnostico_principal ? 'Dx principal: ' + h.diagnostico_principal : '',
    h.cie10_secundario ? 'Secundario CIE-10: ' + h.cie10_secundario : '',
    h.diagnostico_secundario ? 'Dx secundario: ' + h.diagnostico_secundario : ''
  ].filter(Boolean);

  /*
    IASYN v3.2.2
    Corrección visual:
    Si la historia anterior solo contiene textos repetidos de "No valorado",
    se oculta la caja previa para no mostrar un bloque largo y confuso.
    No toca CIE-10, Pacientes, guardado ni lectura de Google Sheets.
  */
  const tieneContenidoClinicoReal =
    signos.length ||
    generalesLimpios.length ||
    sistemasHallazgos.length ||
    regionalHallazgos.length ||
    diagnosticos.length;

  if(!tieneContenidoClinicoReal){
    box.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  let html = '';

  html += auroRenderPrevioChips('Signos vitales registrados', signos);

  if(generalesLimpios.length){
    html += auroRenderPrevioTabla('Examen general / medidas complementarias', generalesLimpios);
  }

  if(sistemasHallazgos.length){
    html += auroRenderPrevioTabla('Examen físico por sistemas', sistemasHallazgos);
  }

  if(regionalHallazgos.length){
    html += auroRenderPrevioTabla('Examen físico regional', regionalHallazgos);
  }

  html += auroRenderPrevioChips('Diagnóstico CIE-10 guardado', diagnosticos);

  content.innerHTML = html;
  box.style.display = 'block';
}

function auroAsegurarCajaDiagnosticosPrevios(){
  const grupo = document.getElementById('hcDiagnosticoCieGrupo') || document.getElementById('hc_examen');
  if(!grupo) return null;

  let box = document.getElementById('auroDiagnosticosPreviosBox');
  if(box) return box;

  box = document.createElement('div');
  box.id = 'auroDiagnosticosPreviosBox';
  box.className = 'auro-previos-box';
  box.style.display = 'none';
  box.innerHTML = `
    <div class="auro-previos-head">
      <div>
        <b><i class="bi bi-clipboard2-pulse me-1"></i> Diagnósticos CIE-10 previos guardados</b>
        <small>Información leída desde Google Sheets. El bloque CIE-10 se conserva intacto.</small>
      </div>
      <button type="button" class="btn-soft auro-previos-hide" onclick="document.getElementById('auroDiagnosticosPreviosBox').style.display='none'">Ocultar</button>
    </div>
    <div class="auro-previos-content" id="auroDiagnosticosPreviosContent"></div>
  `;

  grupo.parentNode.insertBefore(box, grupo);
  return box;
}

function auroMostrarDiagnosticosPrevios(h){
  const box = auroAsegurarCajaDiagnosticosPrevios();
  const content = document.getElementById('auroDiagnosticosPreviosContent');
  if(!box || !content) return;

  if(!auroHistoriaTieneDiagnosticos(h)){
    box.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  const lineas = [
    ['Diagnóstico principal', [h.diagnostico_cie10, h.diagnostico_principal].filter(Boolean).join(' - ')],
    ['Diagnósticos secundarios', [h.cie10_secundario, h.diagnostico_secundario].filter(Boolean).join(' - ')],
    ['Listado CIE-10 estructurado', h.diagnosticos_cie10]
  ].filter(x => String(x[1] || '').trim());

  content.innerHTML = lineas.map(([label, value]) => `
    <div class="auro-previos-line">
      <span>${auroEscapeHtml(label)}</span>
      <p>${auroEscapeHtml(value)}</p>
    </div>
  `).join('');

  box.style.display = 'block';
}

function auroCargarExamenFisicoPrevioPaciente(idPaciente){
  const h = auroHistoriasPacienteOrdenadas(idPaciente).find(auroHistoriaTieneExamenFisico) || null;
  auroMostrarExamenFisicoPrevio(h);
  const dx = auroHistoriasPacienteOrdenadas(idPaciente).find(auroHistoriaTieneDiagnosticos) || null;
  auroMostrarDiagnosticosPrevios(dx);
}

function auroExtraerSeccionExamen(texto, etiqueta){
  texto = auroNormalizarExamenTexto(texto);
  if(!texto || !etiqueta) return '';
  const etiquetas = [
    'Frecuencia respiratoria','Perímetro de cadera','Porcentaje de grasa','Masa muscular',
    'Perímetro cefálico','Perímetro torácico','Perímetro abdominal',
    'Órgano de los sentidos','Respiratorio','Cardiovascular','Digestivo','Urinario',
    'Músculo Esquelético','Endócrino','Hemo-linfático','Examen físico regional',
    'Estado general','Cabeza y cuello','Tórax/Respiratorio','Abdomen','Extremidades','Ginecológico'
  ];
  const inicio = texto.indexOf(etiqueta + ':');
  if(inicio === -1) return '';
  let desde = inicio + etiqueta.length + 1;
  let fin = texto.length;
  etiquetas.forEach(et => {
    if(et === etiqueta) return;
    const idx = texto.indexOf(' | ' + et + ':', desde);
    if(idx !== -1 && idx < fin) fin = idx;
  });
  return texto.substring(desde, fin).replace(/^\s*\|\s*/, '').trim();
}

function auroSetCheckboxesPorTexto(selector, texto){
  const base = auroNormalizarExamenTexto(texto).toLowerCase();
  if(!base) return;
  document.querySelectorAll(selector).forEach(chk => {
    const label = String(chk.dataset.label || '').trim();
    if(label && base.includes(label.toLowerCase())){
      chk.checked = true;
    }
  });
}

function auroCargarExamenFisicoDesdeHistoria(h, modo){
  if(!h) return;

  /*
    IASYN FIX QUIRÚRGICO POR ATENCIÓN
    La tarjeta inferior y los campos del formulario solo se cargan
    cuando el registro proviene de examenes_fisicos para la atención activa.
    La historia clínica general no alimenta esta tarjeta.
  */
  if(modo !== 'atencion'){
    auroMostrarExamenFisicoPrevio(null);
    return;
  }

  auroMostrarExamenFisicoPrevio(h);

  setValueIfExists('hcPeso', h.peso_kg || '');
  setValueIfExists('hcTalla', h.talla_cm || '');
  setValueIfExists('hcIMC', auroIMCClinicoSeguro(h.imc, h.peso_kg, h.talla_cm));
  setValueIfExists('hcPA', h.presion_arterial || '');
  auroPASincronizarDesdeCompatibilidad();
  setValueIfExists('hcFC', h.frecuencia_cardiaca || '');
  setValueIfExists('hcTemperatura', h.temperatura || '');
  setValueIfExists('hcSaturacion', h.saturacion || '');

  const ex = h.examen_fisico || '';
  setValueIfExists('hcFR', auroExtraerSeccionExamen(ex, 'Frecuencia respiratoria'));
  setValueIfExists('hcCadera', auroExtraerSeccionExamen(ex, 'Perímetro de cadera'));
  setValueIfExists('hcPorcentajeGrasa', auroExtraerSeccionExamen(ex, 'Porcentaje de grasa'));
  setValueIfExists('hcMasaMuscular', auroExtraerSeccionExamen(ex, 'Masa muscular'));
  setValueIfExists('hcPerimetroCefalico', auroExtraerSeccionExamen(ex, 'Perímetro cefálico'));
  setValueIfExists('hcPerimetroToracico', auroExtraerSeccionExamen(ex, 'Perímetro torácico'));
  setValueIfExists('hcPerimetroAbdominal', auroExtraerSeccionExamen(ex, 'Perímetro abdominal'));

  const sentidos = auroExtraerSeccionExamen(ex, 'Órgano de los sentidos');
  const respiratorio = auroExtraerSeccionExamen(ex, 'Respiratorio');
  const cardiovascular = auroExtraerSeccionExamen(ex, 'Cardiovascular');
  const digestivo = auroExtraerSeccionExamen(ex, 'Digestivo');
  const urinario = auroExtraerSeccionExamen(ex, 'Urinario');
  const musculo = auroExtraerSeccionExamen(ex, 'Músculo Esquelético');
  const endocrino = auroExtraerSeccionExamen(ex, 'Endócrino');
  const hemo = auroExtraerSeccionExamen(ex, 'Hemo-linfático');
  const regional = auroExtraerSeccionExamen(ex, 'Examen físico regional');

  auroSetCheckboxesPorTexto('.hcSentidosCheck', sentidos);
  auroSetCheckboxesPorTexto('.hcRespiratorioCheck', respiratorio);
  auroSetCheckboxesPorTexto('.hcCardiovascularCheck', cardiovascular);
  auroSetCheckboxesPorTexto('.hcDigestivoCheck', digestivo);
  auroSetCheckboxesPorTexto('.hcUrinarioCheck', urinario);
  auroSetCheckboxesPorTexto('.hcMusculoEsqueleticoCheck', musculo);
  auroSetCheckboxesPorTexto('.hcRegionalCheck', regional);

  if(sentidos.includes('No valorado')) document.getElementById('hcSentidosNoValorado') && (document.getElementById('hcSentidosNoValorado').checked = true);
  if(respiratorio.includes('No valorado')) document.getElementById('hcRespiratorioNoValorado') && (document.getElementById('hcRespiratorioNoValorado').checked = true);
  if(cardiovascular.includes('No valorado')) document.getElementById('hcCardiovascularNoValorado') && (document.getElementById('hcCardiovascularNoValorado').checked = true);
  if(digestivo.includes('No valorado')) document.getElementById('hcDigestivoNoValorado') && (document.getElementById('hcDigestivoNoValorado').checked = true);
  if(urinario.includes('No valorado')) document.getElementById('hcUrinarioNoValorado') && (document.getElementById('hcUrinarioNoValorado').checked = true);
  if(musculo.includes('No valorado')) document.getElementById('hcMusculoEsqueleticoNoValorado') && (document.getElementById('hcMusculoEsqueleticoNoValorado').checked = true);
  if(endocrino.includes('No valorado')) document.getElementById('hcEndocrinoNoValorado') && (document.getElementById('hcEndocrinoNoValorado').checked = true);
  if(hemo.includes('No valorado')) document.getElementById('hcHemoLinfaticoNoValorado') && (document.getElementById('hcHemoLinfaticoNoValorado').checked = true);

  setValueIfExists('hcSentidosObservacion', auroExtraerObservacionSistema(sentidos));
  setValueIfExists('hcRespiratorioObservacion', auroExtraerObservacionSistema(respiratorio));
  setValueIfExists('hcCardiovascularObservacion', auroExtraerObservacionSistema(cardiovascular));
  setValueIfExists('hcDigestivoObservacion', auroExtraerObservacionSistema(digestivo));
  setValueIfExists('hcUrinarioObservacion', auroExtraerObservacionSistema(urinario));
  setValueIfExists('hcMusculoEsqueleticoObservacion', auroExtraerObservacionSistema(musculo));
  setValueIfExists('hcEndocrinoObservacion', auroExtraerObservacionSistema(endocrino));
  setValueIfExists('hcHemoLinfaticoObservacion', auroExtraerObservacionSistema(hemo));


  auroActualizarAyudaIMC();
  if(typeof auroPASincronizarDesdeCompatibilidad === 'function'){
    auroPASincronizarDesdeCompatibilidad();
  }

  if(typeof auroActualizarApoyoSignosVitales === 'function'){
    auroActualizarApoyoSignosVitales();
  }
}

function auroExtraerObservacionSistema(texto){
  const m = String(texto || '').match(/Observación(?:es)?:\s*(.+)$/i);
  return m ? m[1].trim() : '';
}

function auroConstruirExamenFisicoCompleto(){
  const unirLinea = arr => arr.filter(Boolean).join(' | ');

  const sentidos = recopilarOrganosSentidosExamenFisico();
  const respiratorio = recopilarRespiratorioExamenFisico();
  const cardiovascularSistemas = recopilarCardiovascularExamenFisico();
  const digestivo = recopilarDigestivoExamenFisico();
  const urinario = recopilarUrinarioExamenFisico();
  const musculo = recopilarMusculoEsqueleticoExamenFisico();
  const endocrino = recopilarEndocrinoExamenFisico();
  const hemo = recopilarHemoLinfaticoExamenFisico();
  const regional = recopilarRegionalExamenFisico();

  return unirLinea([
    getValueIfExists('hcFR') ? 'Frecuencia respiratoria: ' + getValueIfExists('hcFR') : '',
    getValueIfExists('hcCadera') ? 'Perímetro de cadera: ' + getValueIfExists('hcCadera') : '',
    getValueIfExists('hcPorcentajeGrasa') ? 'Porcentaje de grasa: ' + getValueIfExists('hcPorcentajeGrasa') : '',
    getValueIfExists('hcMasaMuscular') ? 'Masa muscular: ' + getValueIfExists('hcMasaMuscular') : '',
    getValueIfExists('hcPerimetroCefalico') ? 'Perímetro cefálico: ' + getValueIfExists('hcPerimetroCefalico') : '',
    getValueIfExists('hcPerimetroToracico') ? 'Perímetro torácico: ' + getValueIfExists('hcPerimetroToracico') : '',
    getValueIfExists('hcPerimetroAbdominal') ? 'Perímetro abdominal: ' + getValueIfExists('hcPerimetroAbdominal') : '',
    sentidos ? 'Órgano de los sentidos: ' + sentidos : '',
    respiratorio ? 'Respiratorio: ' + respiratorio : '',
    cardiovascularSistemas ? 'Cardiovascular: ' + cardiovascularSistemas : '',
    digestivo ? 'Digestivo: ' + digestivo : '',
    urinario ? 'Urinario: ' + urinario : '',
    musculo ? 'Músculo Esquelético: ' + musculo : '',
    endocrino ? 'Endócrino: ' + endocrino : '',
    hemo ? 'Hemo-linfático: ' + hemo : '',
    regional ? 'Examen físico regional: ' + regional : '',
  ]);
}

function auroAplicarProteccionExamenFisicoEdicion(data){
  const h = auroHistoriaActualEdicion();
  if(!h) return data;

  [
    'peso_kg',
    'talla_cm',
    'imc',
    'presion_arterial',
    'frecuencia_cardiaca',
    'temperatura',
    'saturacion',
    'examen_fisico'
  ].forEach(campo => {
    if(!String(data[campo] || '').trim() && String(h[campo] || '').trim()){
      data[campo] = h[campo];
    }
  });

  return data;
}

function auroAplicarProteccionDiagnosticosEdicion(data){
  const h = auroHistoriaActualEdicion();
  if(!h) return data;

  [
    'diagnostico_cie10',
    'diagnostico_principal',
    'diagnostico_secundario',
    'cie10_secundario',
    'diagnosticos_cie10'
  ].forEach(campo => {
    if(!String(data[campo] || '').trim() && String(h[campo] || '').trim()){
      data[campo] = h[campo];
    }
  });

  return data;
}

function auroCargarDiagnosticosDesdeHistoria(h){
  if(!h) return;
  auroMostrarDiagnosticosPrevios(h);

  const lista = [];
  const texto = String(h.diagnosticos_cie10 || '').trim();
  if(texto){
    texto.split(/\s*\|\|\s*/).forEach(item => {
      const m = item.match(/^(Principal|Secundario):\s*([A-Z0-9\.]+)\s+(.+?)(?:\s*\((Presuntivo|Definitivo)\))?$/i);
      if(m){
        lista.push({
          codigo: String(m[2] || '').replace(/\./g,'').toUpperCase(),
          nombre: String(m[3] || '').trim(),
          principal: String(m[1] || '').toLowerCase() === 'principal',
          tipo: m[4] || 'Presuntivo'
        });
      }
    });
  }

  if(!lista.length && (h.diagnostico_cie10 || h.diagnostico_principal)){
    lista.push({
      codigo: String(h.diagnostico_cie10 || '').replace(/\./g,'').toUpperCase(),
      nombre: String(h.diagnostico_principal || '').trim() || 'Diagnóstico principal',
      principal: true,
      tipo: 'Presuntivo'
    });
  }

  if(h.cie10_secundario || h.diagnostico_secundario){
    const codigos = String(h.cie10_secundario || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
    const nombres = String(h.diagnostico_secundario || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
    codigos.forEach((codigo, i) => {
      const c = codigo.replace(/\./g,'').toUpperCase();
      if(c && !lista.some(d => d.codigo === c)){
        lista.push({
          codigo: c,
          nombre: nombres[i] || 'Diagnóstico secundario',
          principal: false,
          tipo: 'Presuntivo'
        });
      }
    });
  }

  if(lista.length){
    hcDiagnosticosSeleccionados = lista.map((d, i) => ({
      codigo: d.codigo,
      nombre: d.nombre,
      principal: d.principal || (i === 0 && !lista.some(x => x.principal)),
      tipo: d.tipo === 'Definitivo' ? 'Definitivo' : 'Presuntivo'
    }));
    renderDiagnosticosSeleccionados();
    sincronizarDiagnosticosConCamposHistoria();
  }else{
    setValueIfExists('hcCie10Principal', h.diagnostico_cie10 || '');
    setValueIfExists('hcDiagnosticoPrincipal', h.diagnostico_principal || '');
    setValueIfExists('hcCie10Secundario', h.cie10_secundario || '');
    setValueIfExists('hcDiagnosticoSecundario', h.diagnostico_secundario || '');
  }
}

/* ==========================================================
   IASYN - APOYO CLÍNICO DE SIGNOS VITALES V1
   MODIFICACIÓN QUIRÚRGICA Y NO BLOQUEANTE
   ----------------------------------------------------------
   ALCANCE EXCLUSIVO:
   - Peso, talla e IMC.
   - Presión arterial, frecuencia cardíaca y respiratoria.
   - Temperatura y saturación de oxígeno.
   - Interpretaciones visuales orientativas para adultos.
   - Alertas de plausibilidad y valores que requieren revisión.

   PROTECCIONES:
   - No modifica IDs existentes.
   - No cambia la estructura del objeto de guardado.
   - No crea columnas ni escribe interpretaciones en Google Sheets.
   - No altera fechas, id_atencion, id_examen ni actualización.
   - No toca examen por sistemas, regionales ni diagnósticos.
   - No bloquea el guardado: toda alerta es informativa.
   ========================================================== */

function auroVitalTexto(valor){
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

function auroVitalNumero(valor){
  const txt = auroVitalTexto(valor)
    .replace(',', '.')
    .replace(/[^0-9.+-]/g, '');
  if(!txt) return null;
  const numero = Number(txt);
  return Number.isFinite(numero) ? numero : null;
}

function auroVitalNumeroLimpio(valor, decimales){
  const numero = auroVitalNumero(valor);
  if(numero === null) return '';
  const n = Number(numero.toFixed(Number.isInteger(decimales) ? decimales : 1));
  return String(n);
}

function auroVitalPresion(valor){
  const txt = auroVitalTexto(valor)
    .replace(/mmhg/ig, '')
    .replace(/\s+/g, '')
    .replace('-', '/');
  const match = txt.match(/^(\d{2,3})\/(\d{2,3})$/);
  if(!match) return null;
  const sistolica = Number(match[1]);
  const diastolica = Number(match[2]);
  if(!Number.isFinite(sistolica) || !Number.isFinite(diastolica)) return null;
  return { sistolica, diastolica, texto: sistolica + '/' + diastolica };
}

/* ==========================================================
   IASYN - PA DOBLE CAMPO / COMPATIBILIDAD QUIRÚRGICA
   - Interfaz: sistólica + diastólica.
   - Contrato histórico: hcPA conserva "120/80".
   - No cambia payload, backend, Sheets ni registros existentes.
   ========================================================== */
function auroPASoloEnteros(valor){
  return auroVitalTexto(valor).replace(/\D/g, '').slice(0, 3);
}

function auroPASincronizarHaciaCompatibilidad(){
  const sistolicaEl = document.getElementById('hcPASistolica');
  const diastolicaEl = document.getElementById('hcPADiastolica');
  const paEl = document.getElementById('hcPA');
  if(!sistolicaEl || !diastolicaEl || !paEl) return;

  const sistolica = auroPASoloEnteros(sistolicaEl.value);
  const diastolica = auroPASoloEnteros(diastolicaEl.value);
  sistolicaEl.value = sistolica;
  diastolicaEl.value = diastolica;
  paEl.value = sistolica && diastolica ? sistolica + '/' + diastolica : '';
}

function auroPASincronizarDesdeCompatibilidad(){
  const sistolicaEl = document.getElementById('hcPASistolica');
  const diastolicaEl = document.getElementById('hcPADiastolica');
  const paEl = document.getElementById('hcPA');
  if(!sistolicaEl || !diastolicaEl || !paEl) return;

  const pa = auroVitalPresion(paEl.value);
  if(pa){
    sistolicaEl.value = String(pa.sistolica);
    diastolicaEl.value = String(pa.diastolica);
  }else if(!auroVitalTexto(paEl.value)){
    sistolicaEl.value = '';
    diastolicaEl.value = '';
  }
}

function auroPAActualizarPresentacion(){
  const paEl = document.getElementById('hcPA');
  const sistolicaEl = document.getElementById('hcPASistolica');
  const diastolicaEl = document.getElementById('hcPADiastolica');
  if(!paEl || !sistolicaEl || !diastolicaEl) return;

  const resultado = auroInterpretarPA(paEl.value);
  const ayuda = auroObtenerAyudaVital('hcPA');
  if(ayuda){
    ['normal','precaucion','alerta','critico','invalido'].forEach(nivel => {
      ayuda.classList.remove('auro-vital-nivel-' + nivel);
      sistolicaEl.classList.remove('auro-vital-input-' + nivel);
      diastolicaEl.classList.remove('auro-vital-input-' + nivel);
    });

    if(!auroVitalTexto(paEl.value)){
      ayuda.textContent = '';
      return;
    }

    const nivel = resultado?.nivel || 'pendiente';
    ayuda.textContent = resultado?.texto || '';
    ayuda.classList.add(auroVitalClaseNivel(nivel));
    if(nivel !== 'pendiente'){
      sistolicaEl.classList.add('auro-vital-input-' + nivel);
      diastolicaEl.classList.add('auro-vital-input-' + nivel);
    }
  }
}

function auroPAInstalarCamposDobles(){
  const sistolicaEl = document.getElementById('hcPASistolica');
  const diastolicaEl = document.getElementById('hcPADiastolica');
  if(!sistolicaEl || !diastolicaEl) return;
  if(sistolicaEl.dataset.auroPaDoble === '1') return;

  sistolicaEl.dataset.auroPaDoble = '1';
  diastolicaEl.dataset.auroPaDoble = '1';

  [sistolicaEl, diastolicaEl].forEach(el => {
    el.addEventListener('input', function(){
      auroPASincronizarHaciaCompatibilidad();
      auroPAActualizarPresentacion();
      auroActualizarApoyoSignosVitales();
    });
    el.addEventListener('blur', function(){
      auroPASincronizarHaciaCompatibilidad();
      auroPAActualizarPresentacion();
    });
  });

  auroPASincronizarDesdeCompatibilidad();
  auroPAActualizarPresentacion();
}

function auroInterpretarIMC(valor){
  const imc = auroVitalNumero(valor);
  if(imc === null || imc <= 0) return '';
  if(imc < 18.5) return 'Bajo peso';
  if(imc < 25) return 'Normopeso';
  if(imc < 30) return 'Sobrepeso';
  if(imc < 35) return 'Obesidad grado I';
  if(imc < 40) return 'Obesidad grado II';
  return 'Obesidad grado III';
}

function auroInterpretarPA(valor){
  const pa = auroVitalPresion(valor);
  if(!pa) return {nivel:'pendiente', texto:'Ingrese PA como 120/80', alerta:false};
  const s = pa.sistolica;
  const d = pa.diastolica;

  if(s < 50 || s > 260 || d < 30 || d > 160 || d >= s){
    return {nivel:'invalido', texto:'Valor improbable; verifique la medición', alerta:true};
  }
  if(s >= 180 || d >= 120){
    return {nivel:'critico', texto:'PA muy elevada; repetir y valorar de inmediato según el contexto clínico', alerta:true};
  }
  if(s < 90 || d < 60){
    return {nivel:'alerta', texto:'PA baja; correlacionar con síntomas y condición clínica', alerta:true};
  }
  if(s >= 140 || d >= 90){
    return {nivel:'alerta', texto:'PA elevada; confirmar con técnica adecuada y mediciones repetidas', alerta:true};
  }
  if(s >= 130 || d >= 80){
    return {nivel:'precaucion', texto:'PA por encima del rango óptimo; confirmar y correlacionar', alerta:false};
  }
  if(s >= 120 && d < 80){
    return {nivel:'precaucion', texto:'PA sistólica elevada; confirmar medición', alerta:false};
  }
  return {nivel:'normal', texto:'PA dentro de rango habitual en adulto', alerta:false};
}

function auroInterpretarFC(valor){
  const fc = auroVitalNumero(valor);
  if(fc === null) return {nivel:'pendiente', texto:'Pendiente', alerta:false};
  if(fc < 20 || fc > 250) return {nivel:'invalido', texto:'Valor improbable; verifique', alerta:true};
  if(fc < 40) return {nivel:'critico', texto:'Bradicardia marcada; correlacionar y valorar', alerta:true};
  if(fc < 60) return {nivel:'precaucion', texto:'Bradicardia', alerta:false};
  if(fc <= 100) return {nivel:'normal', texto:'Frecuencia cardíaca en rango habitual adulto', alerta:false};
  if(fc <= 120) return {nivel:'precaucion', texto:'Taquicardia', alerta:false};
  return {nivel:'alerta', texto:'Taquicardia marcada; correlacionar y valorar', alerta:true};
}

function auroInterpretarFR(valor){
  const fr = auroVitalNumero(valor);
  if(fr === null) return {nivel:'pendiente', texto:'Pendiente', alerta:false};
  if(fr < 3 || fr > 80) return {nivel:'invalido', texto:'Valor improbable; verifique', alerta:true};
  if(fr < 8) return {nivel:'critico', texto:'Bradipnea marcada; correlacionar y valorar', alerta:true};
  if(fr < 12) return {nivel:'precaucion', texto:'Frecuencia respiratoria baja', alerta:false};
  if(fr <= 20) return {nivel:'normal', texto:'Frecuencia respiratoria en rango habitual adulto', alerta:false};
  if(fr <= 30) return {nivel:'precaucion', texto:'Taquipnea', alerta:false};
  return {nivel:'alerta', texto:'Taquipnea marcada; correlacionar y valorar', alerta:true};
}

function auroInterpretarTemperatura(valor){
  const t = auroVitalNumero(valor);
  if(t === null) return {nivel:'pendiente', texto:'Pendiente', alerta:false};
  if(t < 25 || t > 45) return {nivel:'invalido', texto:'Valor improbable; verifique', alerta:true};
  if(t < 35) return {nivel:'critico', texto:'Hipotermia; correlacionar y valorar', alerta:true};
  if(t < 36) return {nivel:'precaucion', texto:'Temperatura baja', alerta:false};
  if(t < 37.5) return {nivel:'normal', texto:'Temperatura en rango habitual', alerta:false};
  if(t < 38) return {nivel:'precaucion', texto:'Temperatura elevada / febrícula', alerta:false};
  if(t < 40) return {nivel:'alerta', texto:'Fiebre; correlacionar con evaluación clínica', alerta:true};
  return {nivel:'critico', texto:'Hipertermia marcada; valoración inmediata', alerta:true};
}

function auroInterpretarSaturacion(valor){
  const sat = auroVitalNumero(valor);
  if(sat === null) return {nivel:'pendiente', texto:'Pendiente', alerta:false};
  if(sat < 40 || sat > 100) return {nivel:'invalido', texto:'Valor improbable; verifique', alerta:true};
  if(sat < 90) return {nivel:'critico', texto:'Saturación muy baja; confirmar señal y valorar de inmediato', alerta:true};
  if(sat < 94) return {nivel:'alerta', texto:'Saturación disminuida; confirmar medición y correlacionar', alerta:true};
  if(sat < 95) return {nivel:'precaucion', texto:'Saturación limítrofe', alerta:false};
  return {nivel:'normal', texto:'Saturación en rango habitual', alerta:false};
}

function auroInterpretarPeso(valor){
  const n = auroVitalNumero(valor);
  if(n === null) return {nivel:'pendiente', texto:'', alerta:false};
  if(n < 1 || n > 400) return {nivel:'invalido', texto:'Peso improbable; verifique', alerta:true};
  return {nivel:'normal', texto:'', alerta:false};
}

function auroInterpretarTalla(valor){
  const n = auroVitalNumero(valor);
  if(n === null) return {nivel:'pendiente', texto:'', alerta:false};
  if(n < 30 || n > 250) return {nivel:'invalido', texto:'Talla improbable; verifique', alerta:true};
  return {nivel:'normal', texto:'', alerta:false};
}

function auroVitalClaseNivel(nivel){
  return 'auro-vital-nivel-' + (nivel || 'pendiente');
}

function auroCrearEstilosVitales(){
  if(document.getElementById('auroVitalesClinicosCSS')) return;
  const style = document.createElement('style');
  style.id = 'auroVitalesClinicosCSS';
  style.textContent = `
    .auro-vital-wrap{position:relative}
    .auro-vital-ayuda{display:block;min-height:18px;margin-top:5px;font-size:11px;font-weight:750;line-height:1.25;color:#64748b}
    .auro-vital-ayuda.auro-vital-nivel-normal{color:#166534}
    .auro-vital-ayuda.auro-vital-nivel-precaucion{color:#92400e}
    .auro-vital-ayuda.auro-vital-nivel-alerta{color:#b45309}
    .auro-vital-ayuda.auro-vital-nivel-critico,.auro-vital-ayuda.auro-vital-nivel-invalido{color:#b91c1c}
    .auro-vital-input-normal{border-color:#bbf7d0!important;background:#f0fdf4!important}
    .auro-vital-input-precaucion{border-color:#fde68a!important;background:#fffbeb!important}
    .auro-vital-input-alerta{border-color:#fdba74!important;background:#fff7ed!important}
    .auro-vital-input-critico,.auro-vital-input-invalido{border-color:#fecaca!important;background:#fef2f2!important}
    #auroVitalesAlertaGeneral{display:none;margin:10px 0 4px;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:14px;padding:9px 11px;font-size:12px;font-weight:750;line-height:1.4}
    #auroVitalesAlertaGeneral.show{display:block}
    #auroVitalesAlertaGeneral.critica{border-color:#fecaca;background:#fef2f2;color:#991b1b}
    @media(max-width:560px){.auro-vital-ayuda{font-size:10.5px}}
  `;
  document.head.appendChild(style);
}

function auroObtenerAyudaVital(id){
  const input = document.getElementById(id);
  if(!input) return null;
  let ayuda = document.getElementById(id + 'AuroAyuda');
  if(!ayuda){
    ayuda = document.createElement('small');
    ayuda.id = id + 'AuroAyuda';
    ayuda.className = 'auro-vital-ayuda';
    ayuda.setAttribute('aria-live', 'polite');
    input.insertAdjacentElement('afterend', ayuda);
  }
  return ayuda;
}

function auroAplicarResultadoVital(id, resultado){
  const input = document.getElementById(id);
  const ayuda = auroObtenerAyudaVital(id);
  if(!input || !ayuda) return;

  ['normal','precaucion','alerta','critico','invalido'].forEach(nivel => {
    input.classList.remove('auro-vital-input-' + nivel);
    ayuda.classList.remove('auro-vital-nivel-' + nivel);
  });

  const valor = auroVitalTexto(input.value);
  if(!valor){
    ayuda.textContent = '';
    return;
  }

  const nivel = resultado?.nivel || 'pendiente';
  ayuda.textContent = resultado?.texto || '';
  ayuda.classList.add(auroVitalClaseNivel(nivel));
  if(nivel !== 'pendiente') input.classList.add('auro-vital-input-' + nivel);
}

function auroActualizarAyudaIMC(){
  const input = document.getElementById('hcIMC');
  if(!input) return;
  const imc = auroVitalNumero(input.value);
  let resultado = {nivel:'pendiente', texto:'', alerta:false};

  if(imc !== null){
    if(imc < 5 || imc > 100){
      resultado = {nivel:'invalido', texto:'IMC improbable; verifique peso y talla', alerta:true};
    }else{
      const texto = auroInterpretarIMC(imc);
      const nivel = imc >= 30 || imc < 18.5 ? 'precaucion' : (imc >= 25 ? 'precaucion' : 'normal');
      resultado = {nivel, texto:'IMC: ' + texto, alerta:false};
    }
  }

  /*
    IASYN FIX QUIRÚRGICO IMC 2026-08-21
    Punto único de sincronización visual:
    - hcIMC sigue siendo la fuente real del módulo.
    - hcImcResumen y hcCardIMC solo reflejan ese mismo valor.
    - Se ejecuta tanto al limpiar como al cargar una atención.
    - No recalcula, no guarda, no consulta API y no usa temporizadores.
  */
  const imcVisual = (imc !== null && imc >= 5 && imc <= 100)
    ? String(Number(imc.toFixed(1)))
    : '—';

  if(typeof setTextIfExists === 'function'){
    setTextIfExists('hcImcResumen', imcVisual);
    setTextIfExists('hcCardIMC', imcVisual);
  }else{
    const resumen = document.getElementById('hcImcResumen');
    const tarjeta = document.getElementById('hcCardIMC');
    if(resumen) resumen.textContent = imcVisual;
    if(tarjeta) tarjeta.textContent = imcVisual;
  }

  auroAplicarResultadoVital('hcIMC', resultado);
  return resultado;
}

function calcIMC(){
  const pesoEl = document.getElementById('hcPeso');
  const tallaEl = document.getElementById('hcTalla');
  const imcEl = document.getElementById('hcIMC');
  if(!pesoEl || !tallaEl || !imcEl) return;

  const peso = auroVitalNumero(pesoEl.value);
  const tallaCm = auroVitalNumero(tallaEl.value);
  const pesoValido = peso !== null && peso >= 1 && peso <= 400;
  const tallaValida = tallaCm !== null && tallaCm >= 30 && tallaCm <= 250;

  if(!pesoValido || !tallaValida){
    imcEl.value = '';
    if(typeof setTextIfExists === 'function'){
      setTextIfExists('hcImcResumen', '—');
      setTextIfExists('hcCardIMC', '—');
    }
    auroActualizarAyudaIMC();
    auroActualizarApoyoSignosVitales();
    return;
  }

  const tallaM = tallaCm / 100;
  const imc = Number((peso / (tallaM * tallaM)).toFixed(1));
  imcEl.value = String(imc);

  if(typeof setTextIfExists === 'function'){
    setTextIfExists('hcImcResumen', String(imc));
    setTextIfExists('hcCardIMC', String(imc));
  }else{
    const resumen = document.getElementById('hcImcResumen');
    const card = document.getElementById('hcCardIMC');
    if(resumen) resumen.textContent = String(imc);
    if(card) card.textContent = String(imc);
  }

  auroActualizarAyudaIMC();
  auroActualizarApoyoSignosVitales();
}

function auroNormalizarVitalesExamen(){
  auroPASincronizarHaciaCompatibilidad();

  const paEl = document.getElementById('hcPA');
  if(paEl){
    const pa = auroVitalPresion(paEl.value);
    if(pa) paEl.value = pa.texto;
  }

  [
    ['hcPeso',1],
    ['hcTalla',1],
    ['hcFC',0],
    ['hcFR',0],
    ['hcTemperatura',1],
    ['hcSaturacion',0],
    ['hcCadera',1],
    ['hcPorcentajeGrasa',1],
    ['hcMasaMuscular',1],
    ['hcPerimetroCefalico',1],
    ['hcPerimetroToracico',1],
    ['hcPerimetroAbdominal',1]
  ].forEach(([id, decimales]) => {
    const el = document.getElementById(id);
    if(!el) return;
    const original = auroVitalTexto(el.value);
    if(!original) return;
    const limpio = auroVitalNumeroLimpio(original, decimales);
    if(limpio !== '') el.value = limpio;
  });

  calcIMC();
  auroActualizarApoyoSignosVitales();
}

function auroCrearAlertaGeneralVitales(){
  let alerta = document.getElementById('auroVitalesAlertaGeneral');
  if(alerta) return alerta;

  const panel = document.getElementById('hc_examen');
  if(!panel) return null;
  const titulo = Array.from(panel.querySelectorAll('.clinical-subtitle')).find(el =>
    String(el.textContent || '').toLowerCase().includes('signos vitales')
  );
  if(!titulo) return null;

  alerta = document.createElement('div');
  alerta.id = 'auroVitalesAlertaGeneral';
  alerta.setAttribute('role', 'status');
  alerta.setAttribute('aria-live', 'polite');
  titulo.insertAdjacentElement('afterend', alerta);
  return alerta;
}

function auroActualizarApoyoSignosVitales(){
  const resultados = [
    ['hcPeso', auroInterpretarPeso(document.getElementById('hcPeso')?.value)],
    ['hcTalla', auroInterpretarTalla(document.getElementById('hcTalla')?.value)],
    ['hcPA', auroInterpretarPA(document.getElementById('hcPA')?.value)],
    ['hcFC', auroInterpretarFC(document.getElementById('hcFC')?.value)],
    ['hcFR', auroInterpretarFR(document.getElementById('hcFR')?.value)],
    ['hcTemperatura', auroInterpretarTemperatura(document.getElementById('hcTemperatura')?.value)],
    ['hcSaturacion', auroInterpretarSaturacion(document.getElementById('hcSaturacion')?.value)]
  ];

  resultados.forEach(([id, resultado]) => {
    if(id === 'hcPA') return;
    auroAplicarResultadoVital(id, resultado);
  });
  auroPAActualizarPresentacion();
  const imcResultado = auroActualizarAyudaIMC();
  if(imcResultado) resultados.push(['hcIMC', imcResultado]);

  const conContenido = resultados.filter(([id]) => auroVitalTexto(document.getElementById(id)?.value));
  const alertas = conContenido.filter(([,r]) => r && r.alerta);
  const criticas = conContenido.filter(([,r]) => r && (r.nivel === 'critico' || r.nivel === 'invalido'));
  const alertaGeneral = auroCrearAlertaGeneralVitales();
  if(!alertaGeneral) return;

  alertaGeneral.classList.remove('show','critica');
  alertaGeneral.textContent = '';

  if(alertas.length){
    alertaGeneral.classList.add('show');
    if(criticas.length) alertaGeneral.classList.add('critica');
    alertaGeneral.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i> Existen signos vitales que requieren verificación o correlación clínica. Las alertas son orientativas y no bloquean el guardado.';
  }
}

function auroPrepararCampoVital(id, configuracion){
  const el = document.getElementById(id);
  if(!el || el.dataset.auroVitalV1 === '1') return;
  el.dataset.auroVitalV1 = '1';
  el.setAttribute('autocomplete','off');
  el.setAttribute('inputmode', configuracion?.inputmode || 'decimal');
  if(configuracion?.placeholder && !auroVitalTexto(el.getAttribute('placeholder'))){
    el.setAttribute('placeholder', configuracion.placeholder);
  }
  if(configuracion?.ariaLabel) el.setAttribute('aria-label', configuracion.ariaLabel);

  el.addEventListener('input', function(){
    if(id === 'hcPeso' || id === 'hcTalla') calcIMC();
    else auroActualizarApoyoSignosVitales();
  });

  el.addEventListener('blur', function(){
    auroNormalizarVitalesExamen();
  });
}


function auroMarcarSistemasNoValorados(){
  [
    'hcSentidosNoValorado',
    'hcRespiratorioNoValorado',
    'hcCardiovascularNoValorado',
    'hcDigestivoNoValorado',
    'hcUrinarioNoValorado',
    'hcMusculoEsqueleticoNoValorado',
    'hcEndocrinoNoValorado',
    'hcHemoLinfaticoNoValorado'
  ].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.checked = true;
  });
}

function auroInicializarAyudasExamenFisicoV32(){
  const panel = document.getElementById('hc_examen');
  if(!panel) return;

  auroCrearEstilosVitales();
  auroCrearAlertaGeneralVitales();

  const campos = {
    hcPeso:{placeholder:'Ej. 60', ariaLabel:'Peso en kilogramos'},
    hcTalla:{placeholder:'Ej. 154', ariaLabel:'Talla en centímetros'},
    hcFC:{placeholder:'Ej. 72', ariaLabel:'Frecuencia cardíaca por minuto'},
    hcFR:{placeholder:'Ej. 16', ariaLabel:'Frecuencia respiratoria por minuto'},
    hcTemperatura:{placeholder:'Ej. 36.5', ariaLabel:'Temperatura en grados Celsius'},
    hcSaturacion:{placeholder:'Ej. 98', ariaLabel:'Saturación de oxígeno en porcentaje'}
  };

  Object.keys(campos).forEach(id => auroPrepararCampoVital(id, campos[id]));
  auroPAInstalarCamposDobles();
  auroObtenerAyudaVital('hcIMC');

  /* Compatibilidad con listeners históricos del mismo módulo. */
  ['hcPeso','hcTalla'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.dataset.auroImcListenerV321 = '1';
  });

  calcIMC();
  auroActualizarApoyoSignosVitales();
}

/* Permite refrescar ayudas después de cargar o cambiar una atención. */
window.auroActualizarApoyoSignosVitales = auroActualizarApoyoSignosVitales;
window.auroNormalizarVitalesExamen = auroNormalizarVitalesExamen;


/* ==========================================================
   IASYN - Plan v3.3.1
   Conexión completa del Plan sin tocar otros módulos.
   - Carga previa limpia
   - Plan terapéutico / evaluaciones / indicaciones / control
   - Protección anti-sobrescritura en edición
   ========================================================== */



/* ==========================================================
   IASYN - EXAMEN FÍSICO POR ATENCIÓN
   Fase 1: estado temporal por id_atencion
   ----------------------------------------------------------
   Objetivo:
   - Igualar el comportamiento de Plan Clínico.
   - No toca Google Sheets.
   - No toca Apps Script.
   - No modifica interfaz.
   - No muestra el examen dentro del botón Ver de Atenciones.
   - Solo conserva/carga los campos de Examen Físico y Diagnóstico
     según la atención activa.
   ========================================================== */

window.examenFisicoState = window.examenFisicoState || {
  atencionActual: '',
  cache: {}
};

function auroExamenFisicoPanel(){
  return document.getElementById('hc_examen');
}

function auroExamenFisicoCampos(){
  const panel = auroExamenFisicoPanel();
  if(!panel) return [];

  return Array.from(panel.querySelectorAll('input[id], textarea[id], select[id]'))
    .filter(el => {
      const id = String(el.id || '');
      if(!id) return false;

      /* No guardar cajas visuales auxiliares; solo campos reales. */
      if(id.includes('Sugerencias')) return false;
      if(id.includes('ResultadosBody')) return false;
      if(id.includes('SeleccionadosBody')) return false;

      return true;
    });
}

function auroExamenFisicoCapturarCampos(){
  const data = {};

  auroExamenFisicoCampos().forEach(el => {
    if(!el || !el.id) return;

    if(el.type === 'checkbox' || el.type === 'radio'){
      data[el.id] = {
        tipo: el.type,
        checked: !!el.checked,
        value: el.value || ''
      };
    }else{
      data[el.id] = {
        tipo: el.tagName,
        value: el.value || ''
      };
    }
  });

  return data;
}

function auroExamenFisicoAplicarCampos(data){
  data = data || {};

  Object.keys(data).forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;

    const item = data[id] || {};

    if(el.type === 'checkbox' || el.type === 'radio'){
      el.checked = !!item.checked;
      if(item.value !== undefined) el.value = item.value;
    }else{
      el.value = item.value || '';
    }
  });

  if(typeof auroActualizarApoyoSignosVitales === 'function'){
    auroActualizarApoyoSignosVitales();
  }
}

function auroExamenFisicoLimpiarCampos(){
  auroExamenFisicoCampos().forEach(el => {
    if(!el) return;

    if(el.type === 'checkbox' || el.type === 'radio'){
      el.checked = false;
    }else if(el.tagName === 'SELECT'){
      el.selectedIndex = 0;
    }else{
      el.value = '';
    }
  });

  if(typeof auroActualizarApoyoSignosVitales === 'function'){
    auroActualizarApoyoSignosVitales();
  }
}

function auroExamenFisicoCapturarDiagnosticos(){
  try{
    return JSON.parse(JSON.stringify(window.hcDiagnosticosSeleccionados || hcDiagnosticosSeleccionados || []));
  }catch(e){
    return [];
  }
}

function auroExamenFisicoAplicarDiagnosticos(lista){
  try{
    window.hcDiagnosticosSeleccionados = Array.isArray(lista)
      ? JSON.parse(JSON.stringify(lista))
      : [];

    try{
      hcDiagnosticosSeleccionados = window.hcDiagnosticosSeleccionados;
    }catch(e){}

    if(typeof renderDiagnosticosSeleccionados === 'function'){
      renderDiagnosticosSeleccionados();
    }

    if(typeof sincronizarDiagnosticosConCamposHistoria === 'function'){
      sincronizarDiagnosticosConCamposHistoria();
    }
  }catch(error){
    console.warn('IASYN EXAMEN: no se pudieron restaurar diagnósticos temporales.', error);
  }
}

function guardarExamenFisicoTemporal(){
  window.examenFisicoState = window.examenFisicoState || {
    atencionActual: '',
    cache: {}
  };

  const idAtencion = String(window.examenFisicoState.atencionActual || '').trim();
  if(!idAtencion) return;

  try{
    if(typeof renderHcRegionalPanels === 'function'){
      renderHcRegionalPanels();
    }
  }catch(e){}

  window.examenFisicoState.cache[idAtencion] = {
    campos: auroExamenFisicoCapturarCampos(),
    diagnosticos: auroExamenFisicoCapturarDiagnosticos(),
    examenTexto: typeof auroConstruirExamenFisicoCompleto === 'function'
      ? auroConstruirExamenFisicoCompleto()
      : '',
    diagnosticosTexto: typeof recopilarDiagnosticosCie10 === 'function'
      ? recopilarDiagnosticosCie10()
      : '',
    actualizado_en: new Date().toISOString()
  };
}

function limpiarExamenFisicoTemporal(){
  try{
    if(typeof renderHcRegionalPanels === 'function'){
      renderHcRegionalPanels();
    }
  }catch(e){}

  /*
    IASYN FIX LIMPIEZA 2026-07-05
    Nueva consulta debe quedar limpia.
    Antes se limpiaban signos vitales, pero podían quedar checks de sistemas/regionales
    por memoria temporal, paneles renderizados o campos fuera del barrido principal.
  */
  auroExamenFisicoLimpiarCampos();

  const selectoresChecks = [
    '.hcSentidosCheck',
    '.hcRespiratorioCheck',
    '.hcCardiovascularCheck',
    '.hcDigestivoCheck',
    '.hcUrinarioCheck',
    '.hcMusculoEsqueleticoCheck',
    '.hcRegionalCheck'
  ];

  selectoresChecks.forEach(selector => {
    document.querySelectorAll(selector).forEach(chk => {
      chk.checked = false;
      chk.removeAttribute('checked');
    });
  });

  [
    'hcSentidosNoValorado',
    'hcRespiratorioNoValorado',
    'hcCardiovascularNoValorado',
    'hcDigestivoNoValorado',
    'hcUrinarioNoValorado',
    'hcMusculoEsqueleticoNoValorado',
    'hcEndocrinoNoValorado',
    'hcHemoLinfaticoNoValorado'
  ].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.checked = false;
      el.removeAttribute('checked');
    }
  });

  [
    'hcSentidosObservacion',
    'hcRespiratorioObservacion',
    'hcCardiovascularObservacion',
    'hcDigestivoObservacion',
    'hcUrinarioObservacion',
    'hcMusculoEsqueleticoObservacion',
    'hcEndocrinoObservacion',
    'hcHemoLinfaticoObservacion'
  ].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });

  Object.keys(window.auroExamenFisicoRegionalConfig || {}).forEach(regionKey => {
    const id = typeof hcRegionalInputId === 'function'
      ? hcRegionalInputId(regionKey)
      : 'hcRegional_' + regionKey + '_obs';

    const el = document.getElementById(id);
    if(el) el.value = '';
  });

  auroExamenFisicoAplicarDiagnosticos([]);

  const previo = document.getElementById('auroExamenFisicoPrevioBox');
  if(previo){
    previo.style.display = 'none';
    const c = document.getElementById('auroExamenFisicoPrevioContent');
    if(c) c.innerHTML = '';
  }

  const previoDx = document.getElementById('auroDiagnosticosPreviosBox');
  if(previoDx){
    previoDx.style.display = 'none';
    const cdx = document.getElementById('auroDiagnosticosPreviosContent');
    if(cdx) cdx.innerHTML = '';
  }

  if(typeof auroActualizarAyudaIMC === 'function'){
    auroActualizarAyudaIMC();
  }
}

function cargarExamenFisicoTemporal(idAtencion){
  window.examenFisicoState = window.examenFisicoState || {
    atencionActual: '',
    cache: {}
  };

  idAtencion = String(idAtencion || window.examenFisicoState.atencionActual || '').trim();
  if(!idAtencion) return null;

  limpiarExamenFisicoTemporal();

  const data = window.examenFisicoState.cache[idAtencion];
  if(!data){
    return null;
  }

  auroExamenFisicoAplicarCampos(data.campos || {});
  auroExamenFisicoAplicarDiagnosticos(data.diagnosticos || []);

  if(typeof auroActualizarAyudaIMC === 'function'){
    auroActualizarAyudaIMC();
  }

  return data;
}

/* ==========================================================
   IASYN - EXAMEN FÍSICO PERSISTENTE POR ATENCIÓN
   Fase 2: conexión segura con Apps Script y pestaña examenes_fisicos.
   ----------------------------------------------------------
   Reglas:
   - No modifica Atenciones, Plan, Recetas, Pacientes ni Agenda.
   - Usa id_atencion como llave principal clínica de consulta.
   - Si existe examen para la atención: lo carga.
   - Si no existe: limpia los campos variables del examen.
   - El botón "Actualizar historia" guarda/actualiza también
     el examen físico en examenes_fisicos.
   ========================================================== */

function auroExamenFisicoApiUrl(){
  try{
    if(typeof API_URL !== 'undefined' && API_URL) return API_URL;
  }catch(e){}
  try{
    if(window.API_URL) return window.API_URL;
  }catch(e){}
  return '';
}

function auroExamenFisicoAtencionActual(){
  try{
    if(typeof getAtencionActiva === 'function'){
      return getAtencionActiva();
    }
  }catch(e){}
  return null;
}

function auroExamenFisicoIdAtencionActual(){
  try{
    if(typeof getIdAtencionActiva === 'function'){
      return String(getIdAtencionActiva() || '').trim();
    }
  }catch(e){}

  try{
    return String(window.examenFisicoState?.atencionActual || '').trim();
  }catch(e){}

  return '';
}


/* ==========================================================
   IASYN - DETALLE ESTRUCTURADO EXAMEN FÍSICO
   Conecta examen_fisico.js con:
   - examenes_sistemas
   - examenes_regionales
   - diagnosticos
   Mantiene el guardado antiguo en examenes_fisicos.
   ========================================================== */

function auroBaseDetalleExamenFisico(){
  const atencion = auroExamenFisicoAtencionActual() || {};
  const idAtencion = auroExamenFisicoIdAtencionActual() || String(window.examenFisicoState?.atencionActual || '').trim();

  return {
    id_atencion: idAtencion,
    id_cita: atencion.id_cita || '',
    id_paciente: atencion.id_paciente || '',
    id_historia: atencion.id_historia || '',
    id_medico: atencion.id_medico || '',
    fecha_atencion: atencion.fecha_atencion || atencion.fecha || new Date().toISOString()
  };
}

function auroAgregarSistemaDetalle(lista, base, sistema, grupo, hallazgo, marcado, noValorado, observacion){
  lista.push(Object.assign({}, base, {
    sistema: sistema || '',
    grupo: grupo || '',
    hallazgo: hallazgo || '',
    marcado: marcado ? 'SI' : 'NO',
    no_valorado: noValorado ? 'SI' : 'NO',
    observacion: observacion || '',
    estado: 'Activo'
  }));
}

function auroRecolectarCheckboxesSistema(selector, sistema, base, observacionId, noValoradoId){
  const lista = [];
  const obs = getValueIfExists(observacionId).trim();
  const noValorado = !!(document.getElementById(noValoradoId) && document.getElementById(noValoradoId).checked);

  document.querySelectorAll(selector).forEach(chk => {
    if(!chk.checked) return;

    auroAgregarSistemaDetalle(
      lista,
      base,
      sistema,
      chk.dataset.grupo || 'Hallazgos',
      chk.dataset.label || chk.value || '',
      true,
      false,
      obs
    );
  });

  if(noValorado){
    auroAgregarSistemaDetalle(lista, base, sistema, 'No valorado', '', false, true, obs);
  }else if(obs && !lista.length){
    auroAgregarSistemaDetalle(lista, base, sistema, 'Observación', '', false, false, obs);
  }

  return lista;
}

function auroRecopilarSistemasEstructurados(){
  const base = auroBaseDetalleExamenFisico();
  let lista = [];

  lista = lista.concat(auroRecolectarCheckboxesSistema('.hcSentidosCheck', 'Órgano de los sentidos', base, 'hcSentidosObservacion', 'hcSentidosNoValorado'));
  lista = lista.concat(auroRecolectarCheckboxesSistema('.hcRespiratorioCheck', 'Respiratorio', base, 'hcRespiratorioObservacion', 'hcRespiratorioNoValorado'));
  lista = lista.concat(auroRecolectarCheckboxesSistema('.hcCardiovascularCheck', 'Cardiovascular', base, 'hcCardiovascularObservacion', 'hcCardiovascularNoValorado'));
  lista = lista.concat(auroRecolectarCheckboxesSistema('.hcDigestivoCheck', 'Digestivo', base, 'hcDigestivoObservacion', 'hcDigestivoNoValorado'));
  lista = lista.concat(auroRecolectarCheckboxesSistema('.hcUrinarioCheck', 'Urinario', base, 'hcUrinarioObservacion', 'hcUrinarioNoValorado'));
  lista = lista.concat(auroRecolectarCheckboxesSistema('.hcMusculoEsqueleticoCheck', 'Músculo Esquelético', base, 'hcMusculoEsqueleticoObservacion', 'hcMusculoEsqueleticoNoValorado'));

  const endocrinoObs = getValueIfExists('hcEndocrinoObservacion').trim();
  const endocrinoNoValorado = !!(document.getElementById('hcEndocrinoNoValorado') && document.getElementById('hcEndocrinoNoValorado').checked);
  if(endocrinoNoValorado || endocrinoObs){
    auroAgregarSistemaDetalle(lista, base, 'Endócrino', endocrinoNoValorado ? 'No valorado' : 'Observación', '', false, endocrinoNoValorado, endocrinoObs);
  }

  const hemoObs = getValueIfExists('hcHemoLinfaticoObservacion').trim();
  const hemoNoValorado = !!(document.getElementById('hcHemoLinfaticoNoValorado') && document.getElementById('hcHemoLinfaticoNoValorado').checked);
  if(hemoNoValorado || hemoObs){
    auroAgregarSistemaDetalle(lista, base, 'Hemo-linfático', hemoNoValorado ? 'No valorado' : 'Observación', '', false, hemoNoValorado, hemoObs);
  }

  return lista;
}

function auroRecopilarRegionalesEstructurados(){
  renderHcRegionalPanels();

  const base = auroBaseDetalleExamenFisico();
  const lista = [];

  Object.keys(window.auroExamenFisicoRegionalConfig || {}).forEach(regionKey => {
    const cfg = window.auroExamenFisicoRegionalConfig[regionKey] || {};
    const region = cfg.titulo || regionKey;
    const obs = getValueIfExists(hcRegionalInputId(regionKey)).trim();

    document.querySelectorAll(`.hcRegionalCheck[data-region="${regionKey}"]`).forEach(chk => {
      if(!chk.checked) return;

      lista.push(Object.assign({}, base, {
        region: region,
        grupo: chk.dataset.grupo || 'Hallazgos regionales',
        hallazgo: chk.dataset.label || chk.value || '',
        marcado: 'SI',
        no_valorado: 'NO',
        observacion: obs,
        estado: 'Activo'
      }));
    });

    if(obs && !auroEsNoValoradoExamen(obs)){
      const yaTiene = lista.some(r => r.region === region);
      if(!yaTiene){
        lista.push(Object.assign({}, base, {
          region: region,
          grupo: 'Observación',
          hallazgo: '',
          marcado: 'NO',
          no_valorado: 'NO',
          observacion: obs,
          estado: 'Activo'
        }));
      }
    }
  });

  return lista;
}

function auroRecopilarDiagnosticosEstructurados(){
  const base = auroBaseDetalleExamenFisico();
  const lista = [];

  const seleccionados = Array.isArray(window.hcDiagnosticosSeleccionados)
    ? window.hcDiagnosticosSeleccionados
    : [];

  seleccionados.forEach((d, index) => {
    lista.push(Object.assign({}, base, {
      tipo_diagnostico: d.tipo || 'Presuntivo',
      cie10: 'CIE-10',
      codigo_cie10: String(d.codigo || '').trim().toUpperCase(),
      descripcion: d.nombre || '',
      principal: d.principal || index === 0 ? 'SI' : 'NO',
      estado: 'Activo',
      observaciones: ''
    }));
  });

  return lista;
}

async function auroGuardarDetalleExamenFisicoSheets(idExamen){
  const API = auroExamenFisicoApiUrl();
  const base = auroBaseDetalleExamenFisico();

  if(!API || !base.id_atencion || !idExamen){
    return {
      success: false,
      message: 'Faltan datos para guardar detalle del examen físico'
    };
  }

  const payload = {
    accion: 'guardarDetalleExamenFisico',
    data: {
      id_examen: idExamen,
      id_atencion: base.id_atencion,
      sistemas: auroRecopilarSistemasEstructurados(),
      regionales: auroRecopilarRegionalesEstructurados(),
      diagnosticos: auroRecopilarDiagnosticosEstructurados()
    }
  };

  const res = await fetch(API, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const resultado = await res.json();

  if(resultado && resultado.success){
    console.log('IASYN EXAMEN: detalle guardado en sistemas/regionales/diagnosticos:', resultado);
  }else{
    console.warn('IASYN EXAMEN: no se confirmó guardado de detalle.', resultado);
  }

  return resultado;
}


function auroExamenFisicoPayload(){
  auroPASincronizarHaciaCompatibilidad();

  const atencion = auroExamenFisicoAtencionActual() || {};
  const idAtencion = auroExamenFisicoIdAtencionActual() || String(window.examenFisicoState?.atencionActual || '').trim();

  if(!idAtencion){
    return null;
  }

  if(typeof sincronizarDiagnosticosConCamposHistoria === 'function'){
    try{ sincronizarDiagnosticosConCamposHistoria(); }catch(e){}
  }

  return {
    id_examen: String(window.examenFisicoState?.examenesSheets?.[idAtencion]?.id_examen || '').trim(),
    id_atencion: idAtencion,
    id_cita: atencion.id_cita || '',
    id_paciente: atencion.id_paciente || '',
    id_historia: atencion.id_historia || '',
    id_medico: atencion.id_medico || '',
    fecha_examen: new Date().toISOString(),

    peso_kg: getValueIfExists('hcPeso'),
    talla_cm: getValueIfExists('hcTalla'),
    imc: getValueIfExists('hcIMC'),
    presion_arterial: getValueIfExists('hcPA'),
    frecuencia_cardiaca: getValueIfExists('hcFC'),
    temperatura: getValueIfExists('hcTemperatura'),
    saturacion: getValueIfExists('hcSaturacion'),

    examen_fisico: typeof auroConstruirExamenFisicoCompleto === 'function'
      ? auroConstruirExamenFisicoCompleto()
      : '',

    diagnosticos_cie10: typeof recopilarDiagnosticosCie10 === 'function'
      ? recopilarDiagnosticosCie10()
      : '',

    diagnostico_cie10: getValueIfExists('hcCie10Principal'),
    diagnostico_principal: getValueIfExists('hcDiagnosticoPrincipal'),
    cie10_secundario: getValueIfExists('hcCie10Secundario'),
    diagnostico_secundario: getValueIfExists('hcDiagnosticoSecundario'),

    estado_examen: 'Activo'
  };
}

async function auroBuscarExamenFisicoPorAtencion(idAtencion){
  const API = auroExamenFisicoApiUrl();
  idAtencion = String(idAtencion || auroExamenFisicoIdAtencionActual() || '').trim();

  if(!API || !idAtencion){
    return null;
  }

  const url = API + '?accion=buscarExamenFisicoPorAtencion&id_atencion=' + encodeURIComponent(idAtencion) + '&_=' + Date.now();

  const res = await fetch(url);
  const data = await res.json();

  window.examenFisicoState = window.examenFisicoState || { atencionActual:'', cache:{} };
  window.examenFisicoState.examenesSheets = window.examenFisicoState.examenesSheets || {};

  if(data && data.id_examen){
    window.examenFisicoState.examenesSheets[idAtencion] = data;
  }else{
    delete window.examenFisicoState.examenesSheets[idAtencion];
  }

  return data || null;
}

function auroCargarExamenFisicoDesdeSheet(registro){
  limpiarExamenFisicoTemporal();

  if(!registro || !registro.id_examen){
    return false;
  }

  if(typeof auroCargarExamenFisicoDesdeHistoria === 'function'){
    auroCargarExamenFisicoDesdeHistoria(registro, 'atencion');
  }else{
    setValueIfExists('hcPeso', registro.peso_kg || '');
    setValueIfExists('hcTalla', registro.talla_cm || '');
    setValueIfExists('hcIMC', auroIMCClinicoSeguro(registro.imc, registro.peso_kg, registro.talla_cm));
    setValueIfExists('hcPA', registro.presion_arterial || '');
    auroPASincronizarDesdeCompatibilidad();
    setValueIfExists('hcFC', registro.frecuencia_cardiaca || '');
    setValueIfExists('hcTemperatura', registro.temperatura || '');
    setValueIfExists('hcSaturacion', registro.saturacion || '');
  }

  if(typeof auroCargarDiagnosticosDesdeHistoria === 'function'){
    auroCargarDiagnosticosDesdeHistoria(registro);
  }

  guardarExamenFisicoTemporal();

  return true;
}

function auroCargarSignosVitalesPreatencion_(registro){
  if(!registro || String(registro.origen_preatencion || '').toUpperCase() !== 'SI') return false;

  /* IASYN PREATENCIÓN V2: precarga visual únicamente.
     NO crea id_examen ni escribe en examenes_fisicos. */
  setValueIfExists('hcPeso', registro.peso_kg || '');
  setValueIfExists('hcTalla', registro.talla_cm || '');
  setValueIfExists('hcIMC', auroIMCClinicoSeguro(registro.imc, registro.peso_kg, registro.talla_cm));
  setValueIfExists('hcPA', registro.presion_arterial || '');
  auroPASincronizarDesdeCompatibilidad();
  setValueIfExists('hcFC', registro.frecuencia_cardiaca || '');
  setValueIfExists('hcFR', registro.frecuencia_respiratoria || '');
  setValueIfExists('hcTemperatura', registro.temperatura || '');
  setValueIfExists('hcSaturacion', registro.saturacion || '');
  setValueIfExists('hcCadera', registro.perimetro_cadera || '');
  setValueIfExists('hcPorcentajeGrasa', registro.porcentaje_grasa || '');
  setValueIfExists('hcMasaMuscular', registro.masa_muscular || '');
  setValueIfExists('hcPerimetroCefalico', registro.perimetro_cefalico || '');
  setValueIfExists('hcPerimetroToracico', registro.perimetro_toracico || '');
  setValueIfExists('hcPerimetroAbdominal', registro.perimetro_abdominal || '');

  if(typeof auroActualizarAyudaIMC === 'function') auroActualizarAyudaIMC();
  if(typeof auroActualizarApoyoSignosVitales === 'function') auroActualizarApoyoSignosVitales();

  guardarExamenFisicoTemporal();
  console.log('IASYN EXAMEN: Preatención V2 precargada; el examen real se crea solo al guardar.');
  return true;
}

async function auroCargarExamenFisicoDesdeSheetsPorAtencion(idAtencion){
  idAtencion = String(idAtencion || auroExamenFisicoIdAtencionActual() || '').trim();
  if(!idAtencion) return null;

  try{
    const registro = await auroBuscarExamenFisicoPorAtencion(idAtencion);

    if(String(window.examenFisicoState?.atencionActual || '') !== idAtencion){
      return registro;
    }

    if(registro && registro.id_examen){
      auroCargarExamenFisicoDesdeSheet(registro);
      console.log('IASYN EXAMEN: cargado desde examenes_fisicos:', idAtencion);
    }else if(registro && String(registro.origen_preatencion || '').toUpperCase() === 'SI'){
      limpiarExamenFisicoTemporal();
      auroMostrarExamenFisicoPrevio(null);
      auroCargarSignosVitalesPreatencion_(registro);
    }else{
      limpiarExamenFisicoTemporal();
      auroMostrarExamenFisicoPrevio(null);
      console.log('IASYN EXAMEN: sin examen físico guardado para esta atención:', idAtencion);
    }

    return registro || null;
  }catch(error){
    console.warn('IASYN EXAMEN: no se pudo cargar desde examenes_fisicos.', error);
    return null;
  }
}

async function auroGuardarExamenFisicoSheets(){
  const API = auroExamenFisicoApiUrl();
  const payloadData = auroExamenFisicoPayload();

  if(!API){
    console.warn('IASYN EXAMEN: API_URL no definida. No se guardó examen físico.');
    return { success:false, message:'API_URL no definida' };
  }

  if(!payloadData || !payloadData.id_atencion){
    console.warn('IASYN EXAMEN: no hay id_atencion activa. No se guardó examen físico.');
    return { success:false, message:'No hay id_atencion activa' };
  }

  const payload = {
    accion: 'guardarExamenFisico',
    data: payloadData
  };

  try{
    const res = await fetch(API, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const resultado = await res.json();

    if(resultado && resultado.success){
      window.examenFisicoState = window.examenFisicoState || { atencionActual:'', cache:{} };
      window.examenFisicoState.examenesSheets = window.examenFisicoState.examenesSheets || {};

      if(resultado.data){
        window.examenFisicoState.examenesSheets[payloadData.id_atencion] = resultado.data;
      }else if(resultado.id){
        window.examenFisicoState.examenesSheets[payloadData.id_atencion] = Object.assign({}, payloadData, {
          id_examen: resultado.id
        });
      }

      guardarExamenFisicoTemporal();

      const idExamenGuardado = String(
        (resultado.data && resultado.data.id_examen) ||
        resultado.id ||
        payloadData.id_examen ||
        ''
      ).trim();

      if(idExamenGuardado && typeof auroGuardarDetalleExamenFisicoSheets === 'function'){
        await auroGuardarDetalleExamenFisicoSheets(idExamenGuardado);
      }

      console.log('IASYN EXAMEN: guardado en examenes_fisicos:', resultado);
    }else{
      console.warn('IASYN EXAMEN: Apps Script no confirmó guardado.', resultado);
    }

    return resultado;
  }catch(error){
    console.error('IASYN EXAMEN: error guardando en examenes_fisicos.', error);
    return { success:false, message:error.message };
  }
}

function cambiarExamenFisicoPorAtencion(idAtencion){
  window.examenFisicoState = window.examenFisicoState || {
    atencionActual: '',
    cache: {}
  };

  idAtencion = String(idAtencion || '').trim();

  /*
    IASYN - CORRECCIÓN QUIRÚRGICA HISTORIA NUEVA
    Si todavía no existe id_atencion, se limpia únicamente el estado
    temporal del Examen físico y la selección CIE-10 heredada.
    No elimina registros guardados ni modifica Apps Script.
  */
  if(!idAtencion){
    window.examenFisicoState.atencionActual = '';
    limpiarExamenFisicoTemporal();
    auroMostrarExamenFisicoPrevio(null);
    return;
  }

  const anterior = String(window.examenFisicoState.atencionActual || '').trim();

  if(anterior && anterior !== idAtencion){
    guardarExamenFisicoTemporal();
  }

  window.examenFisicoState.atencionActual = idAtencion;

  /*
    IASYN FIX CAMBIO DE CONSULTA 2026-07-05
    Regla:
    - Nueva consulta / nuevo id_atencion: limpiar primero.
    - Luego consultar Sheets.
    - Si existe examen para esa atención: cargar.
    - Si no existe: queda limpio.
    No se restaura caché temporal antes de consultar Sheets porque podía traer checks
    de sistemas/regionales de una consulta anterior.
  */
  limpiarExamenFisicoTemporal();
  auroMostrarExamenFisicoPrevio(null);

  try{
    if(window.examenFisicoState.cache){
      delete window.examenFisicoState.cache[idAtencion];
    }
  }catch(e){}

  auroCargarExamenFisicoDesdeSheetsPorAtencion(idAtencion);

  console.log('IASYN EXAMEN: atención activa sincronizada:', idAtencion, '(limpio hasta validar Sheets)');
}

function auroInstalarAutoGuardadoExamenFisicoPorAtencion(){
  if(window.__auroExamenFisicoAutoGuardadoInstalado) return;
  window.__auroExamenFisicoAutoGuardadoInstalado = true;

  document.addEventListener('input', function(e){
    const panel = auroExamenFisicoPanel();
    if(panel && panel.contains(e.target)){
      guardarExamenFisicoTemporal();
    }
  });

  document.addEventListener('change', function(e){
    const panel = auroExamenFisicoPanel();
    if(panel && panel.contains(e.target)){
      guardarExamenFisicoTemporal();
    }
  });

  /* ==========================================================
     IASYN FASE 2 - GUARDADO PERSISTENTE AISLADO POR MÓDULO
     Corrección quirúrgica:
     - El botón general "Actualizar historia" existe en todas las pestañas.
     - Antes, cualquier clic sobre ese botón creaba/actualizaba una fila en
       examenes_fisicos, incluso desde Anamnesis, Antecedentes, Diagnóstico o Plan.
     - Ahora solo se persiste Examen físico cuando su panel está activo.
     - Si aún no existe id_examen, se exige al menos un dato físico real.
     - Si ya existe id_examen, se permite actualizarlo incluso al limpiar campos.
     No modifica el guardado temporal, Diagnóstico, Plan, Historia ni Apps Script.
  ========================================================== */
  function auroExamenFisicoPanelEstaActivo(){
    const panel = auroExamenFisicoPanel();
    return !!(
      panel &&
      panel.classList &&
      panel.classList.contains('active') &&
      panel.offsetParent !== null
    );
  }

  function auroExamenFisicoPayloadTieneDatosReales(payload){
    payload = payload || {};

    return [
      payload.peso_kg,
      payload.talla_cm,
      payload.imc,
      payload.presion_arterial,
      payload.frecuencia_cardiaca,
      payload.temperatura,
      payload.saturacion,
      payload.examen_fisico
    ].some(function(valor){
      return String(valor == null ? '' : valor).trim() !== '';
    });
  }

  document.addEventListener('click', function(e){
    const btn = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if(!btn) return;

    const texto = String(btn.textContent || btn.innerText || '').toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if(!texto.includes('actualizar historia')) return;

    /* Bloqueo principal: otros módulos nunca persisten Examen físico. */
    if(!auroExamenFisicoPanelEstaActivo()) return;

    setTimeout(function(){
      if(typeof auroGuardarExamenFisicoSheets !== 'function') return;

      const payload = typeof auroExamenFisicoPayload === 'function'
        ? auroExamenFisicoPayload()
        : null;

      if(!payload || !payload.id_atencion) return;

      const idExamenExistente = String(payload.id_examen || '').trim();
      const hayDatosFisicos = auroExamenFisicoPayloadTieneDatosReales(payload);

      /* No crear una fila nueva completamente vacía. */
      if(!idExamenExistente && !hayDatosFisicos){
        console.log(
          'IASYN EXAMEN: guardado omitido; no existen datos físicos reales.'
        );
        return;
      }

      auroGuardarExamenFisicoSheets();
    }, 450);
  }, true);
}

window.guardarExamenFisicoTemporal = guardarExamenFisicoTemporal;
window.cargarExamenFisicoTemporal = cargarExamenFisicoTemporal;
window.limpiarExamenFisicoTemporal = limpiarExamenFisicoTemporal;
window.cambiarExamenFisicoPorAtencion = cambiarExamenFisicoPorAtencion;
window.auroBuscarExamenFisicoPorAtencion = auroBuscarExamenFisicoPorAtencion;
window.auroCargarExamenFisicoDesdeSheetsPorAtencion = auroCargarExamenFisicoDesdeSheetsPorAtencion;
window.auroGuardarExamenFisicoSheets = auroGuardarExamenFisicoSheets;
window.auroRecopilarSistemasEstructurados = auroRecopilarSistemasEstructurados;
window.auroRecopilarRegionalesEstructurados = auroRecopilarRegionalesEstructurados;
window.auroRecopilarDiagnosticosEstructurados = auroRecopilarDiagnosticosEstructurados;
window.auroGuardarDetalleExamenFisicoSheets = auroGuardarDetalleExamenFisicoSheets;
window.auroInstalarAutoGuardadoExamenFisicoPorAtencion = auroInstalarAutoGuardadoExamenFisicoPorAtencion;

/*
  COMPATIBILIDAD TEMPORAL IASYN:
  El evento literal "aurosanax:historia-nueva" se conserva únicamente como contrato
  interno heredado entre módulos. No es una URL, endpoint, base de datos ni conexión
  con AUROSANAX PRUEBA. No renombrarlo aisladamente hasta migrar también sus emisores.
*/

/*
  IASYN - LIMPIEZA CIE-10 AL INICIAR HISTORIA NUEVA
  Escucha únicamente la señal emitida por Pacientes/Agenda.
  Mantiene intactas las consultas existentes y sus diagnósticos guardados.
*/
if(!window.__auroExamenHistoriaNuevaListenerInstalado){
  window.__auroExamenHistoriaNuevaListenerInstalado = true;

  const auroLimpiarExamenHistoriaNueva = function(){
    try{
      window.examenFisicoState = window.examenFisicoState || {
        atencionActual: '',
        cache: {}
      };
      window.examenFisicoState.atencionActual = '';

      if(typeof limpiarExamenFisicoTemporal === 'function'){
        limpiarExamenFisicoTemporal();
      }else{
        window.hcDiagnosticosSeleccionados = [];
        try{ hcDiagnosticosSeleccionados = window.hcDiagnosticosSeleccionados; }catch(_e){}
        if(typeof renderDiagnosticosSeleccionados === 'function'){
          renderDiagnosticosSeleccionados();
        }
        if(typeof sincronizarDiagnosticosConCamposHistoria === 'function'){
          sincronizarDiagnosticosConCamposHistoria();
        }
      }
    }catch(error){
      console.warn(
        'IASYN EXAMEN: no se pudo limpiar CIE-10 al iniciar historia nueva.',
        error
      );
    }
  };

  window.addEventListener('aurosanax:historia-nueva', auroLimpiarExamenHistoriaNueva);
  document.addEventListener('aurosanax:historia-nueva', auroLimpiarExamenHistoriaNueva);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', auroInstalarAutoGuardadoExamenFisicoPorAtencion);
}else{
  auroInstalarAutoGuardadoExamenFisicoPorAtencion();
}



/* ==========================================================
   IASYN FIX 2026-07-20
   GUARDADO AUTÓNOMO DE DIAGNÓSTICOS POR ATENCIÓN
   ----------------------------------------------------------
   Motivo:
   - El editor CIE-10 fue trasladado desde Examen físico a Diagnóstico.
   - La persistencia seguía dependiendo de "Actualizar historia".
   - El Plan podía recibir protocolos sin que el diagnóstico quedara en Sheets.

   Resultado:
   - Guarda el diagnóstico directamente por id_atencion.
   - id_examen se conserva únicamente si ya existe un examen físico real.
   - Nunca crea una fila técnica de examen físico desde Diagnóstico.
   - Espera confirmación real antes de continuar hacia Plan.
   ========================================================== */

/* ==========================================================
   IASYN FIX QUIRÚRGICO DIAGNÓSTICO INDEPENDIENTE 2026-08-07
   ----------------------------------------------------------
   Alcance exclusivo:
   - Diagnósticos de la atención activa.
   - Permite eliminar el último diagnóstico enviando registros: [].
   - Compara contra Google Sheets antes de escribir.
   - Si no existe cambio clínico real, NO hace POST.
   - Conserva id_diagnostico al editar el mismo código CIE-10.
   - No guarda Examen Físico.
   - No modifica Plan, Recetas, Anamnesis ni Atenciones.
   ========================================================== */

function auroDxTextoComparable_(valor){
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

function auroDxCodigoComparable_(registro){
  registro = registro || {};
  return auroDxTextoComparable_(registro.codigo_cie10 || registro.codigo || registro.cie10 || '')
    .toUpperCase().replace(/\./g,'').replace(/\s+/g,'');
}

function auroDxPrincipalComparable_(registro){
  registro = registro || {};
  const valor = auroDxTextoComparable_(registro.principal !== undefined ? registro.principal : registro.es_principal).toUpperCase();
  return (registro.principal === true || ['SI','SÍ','TRUE','1'].includes(valor)) ? 'SI' : 'NO';
}

function auroDxTipoComparable_(registro){
  registro = registro || {};
  const tipo = auroDxTextoComparable_(registro.tipo_diagnostico || registro.tipo || 'Presuntivo').toLowerCase();
  return tipo === 'definitivo' ? 'Definitivo' : 'Presuntivo';
}

function auroDxDescripcionComparable_(registro){
  registro = registro || {};
  return auroDxTextoComparable_(registro.descripcion || registro.nombre || registro.diagnostico || '').replace(/\s+/g,' ');
}

function auroDxFirmaLista_(lista){
  return (Array.isArray(lista) ? lista : []).map(function(registro){
    return [
      auroDxCodigoComparable_(registro),
      auroDxDescripcionComparable_(registro).toLowerCase(),
      auroDxPrincipalComparable_(registro),
      auroDxTipoComparable_(registro),
      auroDxTextoComparable_(registro.estado || 'Activo').toLowerCase(),
      auroDxTextoComparable_(registro.observaciones || '').replace(/\s+/g,' ').toLowerCase()
    ].join('|');
  }).sort().join('||');
}

async function auroDxLeerPersistidosAtencion_(API, idAtencion){
  if(!API || !idAtencion) return [];
  const url = API + '?accion=listarDiagnosticosPorAtencion&id_atencion=' + encodeURIComponent(idAtencion) + '&_=' + Date.now();
  const respuesta = await fetch(url, {method:'GET', cache:'no-store'});
  const data = await respuesta.json();
  if(Array.isArray(data)) return data;
  if(data && Array.isArray(data.data)) return data.data;
  if(data && Array.isArray(data.registros)) return data.registros;
  return [];
}

function auroDxConservarIdsPersistidos_(actuales, persistidos){
  const anteriores = Array.isArray(persistidos) ? persistidos : [];
  return (Array.isArray(actuales) ? actuales : []).map(function(registro){
    const salida = Object.assign({}, registro || {});
    const idActual = auroDxTextoComparable_(salida.id_diagnostico);
    const codigoActual = auroDxCodigoComparable_(salida);
    let coincidencia = null;
    if(idActual){
      coincidencia = anteriores.find(function(item){
        return auroDxTextoComparable_(item.id_diagnostico) === idActual;
      }) || null;
    }
    if(!coincidencia && codigoActual){
      coincidencia = anteriores.find(function(item){
        return auroDxCodigoComparable_(item) === codigoActual;
      }) || null;
    }
    if(coincidencia && coincidencia.id_diagnostico){
      salida.id_diagnostico = coincidencia.id_diagnostico;
    }
    return salida;
  });
}

async function auroGuardarDiagnosticosAtencionActual(opciones){
  opciones = opciones || {};
  const omitirRefrescoVisor = opciones.omitir_refresco_visor === true;
  const omitirLecturaPersistidos = opciones.omitir_lectura_persistidos === true;
  const omitirBusquedaExamen = opciones.omitir_busqueda_examen === true;
  const persistidosBase = Array.isArray(opciones.persistidos_base)
    ? opciones.persistidos_base
    : null;
  const idExamenPreferido = String(opciones.id_examen_preferido || '').trim();
  const API = typeof auroExamenFisicoApiUrl === 'function' ? auroExamenFisicoApiUrl() : '';
  const idAtencion = String((typeof auroExamenFisicoIdAtencionActual === 'function' ? auroExamenFisicoIdAtencionActual() : window.examenFisicoState?.atencionActual) || '').trim();
  let diagnosticos = typeof auroRecopilarDiagnosticosEstructurados === 'function' ? auroRecopilarDiagnosticosEstructurados() : [];

  if(!API) return {success:false,message:'API_URL no definida para guardar el diagnóstico.'};
  if(!idAtencion) return {success:false,message:'No existe una atención activa para guardar el diagnóstico.'};

  try{
    if(window.auroDiagnosticos && typeof window.auroDiagnosticos.puedeAplicarAlPlan === 'function' && window.auroDiagnosticos.puedeAplicarAlPlan() === false){
      return {success:false,bloqueado:true,message:'La atención seleccionada está cerrada o es histórica. Diagnóstico permanece en solo lectura.'};
    }
  }catch(e){}

  try{
    window.examenFisicoState = window.examenFisicoState || {atencionActual:idAtencion,cache:{}};
    window.examenFisicoState.examenesSheets = window.examenFisicoState.examenesSheets || {};

    /*
      EDICIÓN ABIERTA RÁPIDA:
      Diagnóstico puede entregar el snapshot persistido que ya tiene cargado.
      Así no se hace un GET redundante antes del POST.
      Fuera de ese flujo se conserva exactamente la lectura remota histórica.
    */
    const persistidos = persistidosBase !== null
      ? persistidosBase
      : (omitirLecturaPersistidos
          ? []
          : await auroDxLeerPersistidosAtencion_(API, idAtencion));

    diagnosticos = auroDxConservarIdsPersistidos_(
      Array.isArray(diagnosticos) ? diagnosticos : [],
      persistidos
    );

    const firmaActual = auroDxFirmaLista_(diagnosticos);
    const firmaPersistida = auroDxFirmaLista_(persistidos);

    if(firmaActual === firmaPersistida){
      return {
        success:true,
        sin_cambios:true,
        id_atencion:idAtencion,
        diagnosticos:diagnosticos.length,
        registros_enviados:diagnosticos,
        message:'Diagnóstico sin cambios. No se realizó ninguna escritura.'
      };
    }

    let idExamen = idExamenPreferido;

    if(!idExamen){
      const examenCache = window.examenFisicoState.examenesSheets[idAtencion] || null;
      idExamen = String(examenCache?.id_examen || '').trim();
    }

    /*
      En la edición explícita de Diagnóstico por id_atencion no es obligatorio
      crear ni buscar un examen físico. Si ya conocemos id_examen se conserva.
      Los demás flujos mantienen la búsqueda histórica.
    */
    if(!idExamen && !omitirBusquedaExamen){
      const examen = await auroBuscarExamenFisicoPorAtencion(idAtencion);
      idExamen = String(examen?.id_examen || '').trim();
    }

    const respuesta = await fetch(API, {
      method:'POST',
      body:JSON.stringify({accion:'guardarDiagnosticos',data:{id_atencion:idAtencion,id_examen:idExamen,registros:diagnosticos}})
    });
    const resultado = await respuesta.json();
    if(!resultado || resultado.success === false){
      return {success:false,message:resultado?.message || 'Apps Script no confirmó el guardado del diagnóstico.',data:resultado || null};
    }

    try{
      if(window.auroDiagnosticosState?.cache) delete window.auroDiagnosticosState.cache[idAtencion];
      if(window.recetaDiagnosticosPorAtencionCache) delete window.recetaDiagnosticosPorAtencionCache[idAtencion];
    }catch(e){}

    let visorRefrescado = false;

    /*
      IASYN DX - EDICIÓN ABIERTA AUTORITATIVA
      -------------------------------------------
      El comportamiento histórico se conserva para todos los demás flujos.
      Solo el guardado explícito de edición de atención abierta puede pedir
      omitir este refresco completo, porque diagnosticos.js verificará de
      inmediato la tabla persistida de diagnósticos de la misma id_atencion.
    */
    if(!omitirRefrescoVisor){
      try{
        if(window.auroDiagnosticos && typeof window.auroDiagnosticos.cargar === 'function'){
          await Promise.resolve(window.auroDiagnosticos.cargar(idAtencion, true));
          visorRefrescado = true;
        }
      }catch(e){
        console.warn('IASYN DIAGNÓSTICOS: guardado confirmado, pero no se pudo refrescar el visor.', e);
      }
    }

    return {
      success:true,
      sin_cambios:false,
      visor_refrescado:visorRefrescado,
      refresco_omitido:omitirRefrescoVisor,
      id_atencion:idAtencion,
      id_examen:idExamen,
      diagnosticos:Number(resultado.total_guardados ?? diagnosticos.length),
      registros_enviados:diagnosticos,
      data:resultado
    };
  }catch(error){
    console.error('IASYN DIAGNÓSTICOS: error guardando directamente por atención.', error);
    return {success:false,message:error?.message || String(error)};
  }
}

window.auroGuardarDiagnosticosAtencionActual =
  auroGuardarDiagnosticosAtencionActual;



/* ==========================================================
   IASYN FIX DEFINITIVO 2026-07-20
   UN SOLO BOTÓN OFICIAL: PROTOCOLO CLÍNICO SUGERIDO
   ----------------------------------------------------------
   Botón que se conserva:
   - Botón morado "Aplicar al Plan" del CIE-10 inteligente.
   - Ejecuta auroCie10InteligenteAplicarAlPlan().

   Botón que se desactiva visual y funcionalmente:
   - #auroDxAplicarPlan del módulo Integración clínica.
   - Se mantiene oculto en el DOM para no romper referencias internas
     de diagnosticos.js, pero no puede verse, enfocarse ni ejecutarse.

   Flujo único:
   1. El usuario pulsa el botón morado.
   2. Se guarda el diagnóstico de la atención activa en Google Sheets.
   3. Solo si el guardado se confirma, se aplica el protocolo al Plan.
   ========================================================== */

function auroDesactivarBotonSecundarioIntegracion(){
  const botonSecundario = document.getElementById('auroDxAplicarPlan');
  if(!botonSecundario) return false;

  botonSecundario.disabled = true;
  botonSecundario.hidden = true;
  botonSecundario.style.setProperty('display', 'none', 'important');
  botonSecundario.setAttribute('aria-hidden', 'true');
  botonSecundario.setAttribute('tabindex', '-1');
  botonSecundario.dataset.auroDesactivado = '1';

  return true;
}

function auroInstalarOcultamientoBotonSecundario(){
  auroDesactivarBotonSecundarioIntegracion();

  /*
    diagnosticos.js puede volver a renderizar su panel.
    El observador garantiza que el botón secundario permanezca oculto
    sin eliminar nodos que ese módulo todavía pueda consultar internamente.
  */
  if(window.__auroObserverBotonSecundario) return;

  const observer = new MutationObserver(function(){
    auroDesactivarBotonSecundarioIntegracion();
  });

  observer.observe(document.documentElement, {
    childList:true,
    subtree:true
  });

  window.__auroObserverBotonSecundario = observer;
}

function auroEsBotonOficialAplicarPlan(boton){
  if(!boton) return false;

  const onclick = String(boton.getAttribute('onclick') || '');
  if(onclick.includes('auroCie10InteligenteAplicarAlPlan')) return true;

  /*
    Respaldo por si el motor cambia de onclick a listener:
    solo se acepta un botón dentro del protocolo inteligente cuyo texto
    sea exactamente "Aplicar al Plan". No afecta otros botones del ERP.
  */
  const textoBoton = String(boton.textContent || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const contenedorProtocolo = boton.closest(
    '#auroCie10InteligentePanel, .auro-cie10-panel, .cie10-inteligente-panel, [data-auro-cie10-inteligente]'
  );

  return !!contenedorProtocolo && textoBoton === 'aplicar al plan';
}

async function auroEjecutarBotonOficialAplicarPlan(boton){
  if(!boton || boton.dataset.auroProcesando === '1') return;

  boton.dataset.auroProcesando = '1';

  const textoOriginal = boton.innerHTML;
  const disabledOriginal = !!boton.disabled;

  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');

  try{
    if(typeof window.auroGuardarDiagnosticosAtencionActual !== 'function'){
      throw new Error(
        'No está disponible la función de guardado autónomo del diagnóstico.'
      );
    }

    const resultado = await window.auroGuardarDiagnosticosAtencionActual();

    if(!resultado || resultado.success !== true){
      throw new Error(
        resultado?.message ||
        'No se pudo confirmar el guardado del diagnóstico de esta atención.'
      );
    }

    /*
      Se llama directamente a la función original del botón morado.
      No se genera un segundo clic y no se ejecuta el botón secundario.
    */
    if(typeof window.auroCie10InteligenteAplicarAlPlan !== 'function'){
      throw new Error(
        'No está disponible la función del protocolo clínico sugerido.'
      );
    }

    await Promise.resolve(
      window.auroCie10InteligenteAplicarAlPlan()
    );

    console.log(
      'IASYN: diagnóstico guardado y protocolo aplicado mediante el botón oficial.',
      {
        id_atencion: resultado.id_atencion,
        id_examen: resultado.id_examen,
        diagnosticos: resultado.diagnosticos
      }
    );
  }catch(error){
    console.error(
      'IASYN: no se completó el flujo único Diagnóstico → Plan.',
      error
    );

    alert(
      'No se pudo aplicar el protocolo al Plan.\n\n' +
      (error?.message || String(error))
    );
  }finally{
    boton.innerHTML = textoOriginal;
    boton.disabled = disabledOriginal;
    boton.removeAttribute('aria-busy');
    delete boton.dataset.auroProcesando;
  }
}

function auroInstalarFlujoUnicoDiagnosticoPlan(){
  if(window.__auroFlujoUnicoDiagnosticoPlanInstalado) return;
  window.__auroFlujoUnicoDiagnosticoPlanInstalado = true;

  /*
    IASYN CORRECCIÓN QUIRÚRGICA:
    - Se conserva oculto el botón secundario de Integración clínica.
    - Se elimina únicamente la captura global del clic del botón oficial.
    - El botón morado vuelve a ejecutar directamente
      auroCie10InteligenteAplicarAlPlan(), sin interferencia de Examen físico.
    - No se modifica guardado, diagnóstico, examen, Plan ni Google Sheets.
  */
  auroInstalarOcultamientoBotonSecundario();
}

if(document.readyState === 'loading'){
  document.addEventListener(
    'DOMContentLoaded',
    auroInstalarFlujoUnicoDiagnosticoPlan
  );
}else{
  auroInstalarFlujoUnicoDiagnosticoPlan();
}

window.auroDesactivarBotonSecundarioIntegracion =
  auroDesactivarBotonSecundarioIntegracion;

window.auroInstalarFlujoUnicoDiagnosticoPlan =
  auroInstalarFlujoUnicoDiagnosticoPlan;



/* ==========================================================
   IASYN - ACTUALIZAR HISTORIA DESDE DIAGNÓSTICO 2026-08-07
   ----------------------------------------------------------
   - Solo actúa si el panel Diagnóstico está activo/visible.
   - No guarda Examen Físico.
   - No aplica Plan.
   - Usa el guardador autónomo de Diagnóstico.
   - Si no hay cambios, el guardador no escribe.
   ========================================================== */
function auroDxPanelEstaActivo_(){
  const candidatos = [
    document.getElementById('hc_diagnostico'),
    document.getElementById('hc_diagnosticos'),
    document.getElementById('diagnosticos'),
    document.getElementById('diagnostico')
  ].filter(Boolean);

  return candidatos.some(function(panel){
    const visible = panel.offsetParent !== null;
    const activo = panel.classList?.contains('active') || panel.classList?.contains('show') || panel.getAttribute('aria-hidden') === 'false';
    return visible && !!activo;
  });
}

function auroInstalarActualizarDiagnosticoIndependiente_(){
  if(window.__auroActualizarDiagnosticoIndependienteInstalado) return;
  window.__auroActualizarDiagnosticoIndependienteInstalado = true;

  document.addEventListener('click', function(e){
    const btn = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if(!btn) return;
    const textoBoton = String(btn.textContent || btn.innerText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    if(!textoBoton.includes('actualizar historia')) return;
    if(!auroDxPanelEstaActivo_()) return;

    setTimeout(async function(){
      if(typeof window.auroGuardarDiagnosticosAtencionActual !== 'function') return;
      const resultado = await window.auroGuardarDiagnosticosAtencionActual();
      if(!resultado || resultado.success !== true){
        console.warn('IASYN DIAGNÓSTICOS: actualización no confirmada.', resultado);
        return;
      }
      if(resultado.sin_cambios){
        console.log('IASYN DIAGNÓSTICOS: sin cambios reales; no se escribió en Sheets.');
      }else{
        console.log('IASYN DIAGNÓSTICOS: actualización independiente confirmada.', resultado);
      }
    }, 450);
  }, true);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', auroInstalarActualizarDiagnosticoIndependiente_);
}else{
  auroInstalarActualizarDiagnosticoIndependiente_();
}

/* IASYN - Confirmación de carga del módulo */
window.auroExamenFisicoModuloCargado = true;
console.log('IASYN examenfisico.js cargado correctamente');
/* IASYN FIX APLICADO: limpieza completa sistemas/regionales por nueva consulta */

/* ==========================================================
   IASYN - EXAMEN FÍSICO
   BARRERA SIN CAMBIOS REALES V1
   ----------------------------------------------------------
   OBJETIVO QUIRÚRGICO:
   - Si una atención YA tiene examen físico persistido y el
     contenido clínico cargado no cambió, NO ejecutar POST.
   - La barrera se aplica ANTES de auroGuardarExamenFisicoSheets().
   - Protege tanto el registro principal como el detalle estructurado:
       * examenes_fisicos
       * examenes_sistemas
       * examenes_regionales
       * diagnosticos incluidos por el flujo histórico del módulo
   - Si existe cualquier cambio real, se conserva EXACTAMENTE
     el guardado original del archivo.
   - Después de un guardado confirmado se redefine el baseline.
   - Nueva atención / examen aún inexistente NO queda bloqueado.

   NO TOCA:
   - Apps Script / backend
   - Index
   - Plan
   - Recetas
   - Anamnesis
   - Antecedentes
   - Diagnóstico independiente
   - carga por id_atencion
   - limpieza entre consultas
   - signos vitales / IMC / PA
   - estructura de Google Sheets
   ========================================================== */
(function(){
  if(window.__auroExamenFisicoSinCambiosRealesV1) return;
  window.__auroExamenFisicoSinCambiosRealesV1 = true;

  const ESTADO = {
    id_atencion: '',
    id_examen: '',
    firma: '',
    cargado: false,
    motivo: ''
  };

  function texto_(valor){
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/\r\n|\r/g, '\n')
      .trim();
  }

  function normalizarObjeto_(valor){
    if(Array.isArray(valor)){
      return valor.map(normalizarObjeto_);
    }

    if(valor && typeof valor === 'object'){
      const salida = {};
      Object.keys(valor).sort().forEach(function(clave){
        /*
          Campos técnicos que no representan una modificación clínica.
          Se excluyen de la firma para que timestamps/IDs generados no
          produzcan falsos cambios.
        */
        if([
          'fecha_examen',
          'creado_en',
          'actualizado_en',
          'fecha_creacion',
          'fecha_actualizacion'
        ].includes(clave)) return;

        salida[clave] = normalizarObjeto_(valor[clave]);
      });
      return salida;
    }

    if(typeof valor === 'string'){
      return valor.replace(/\r\n|\r/g, '\n').trim();
    }

    return valor;
  }

  function ordenarListaClinica_(lista){
    const limpia = (Array.isArray(lista) ? lista : []).map(function(item){
      return normalizarObjeto_(item || {});
    });

    /*
      Las colecciones estructuradas son clínicamente conjuntos.
      Ordenarlas evita que un cambio incidental de orden DOM simule
      una modificación cuando el contenido real es el mismo.
    */
    return limpia.sort(function(a,b){
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : (sa > sb ? 1 : 0);
    });
  }

  function obtenerEstadoClinicoActual_(){
    if(typeof window.auroExamenFisicoPayload !== 'function'){
      return null;
    }

    const principalOriginal = window.auroExamenFisicoPayload();
    if(!principalOriginal || !principalOriginal.id_atencion){
      return null;
    }

    const principal = {
      id_atencion: texto_(principalOriginal.id_atencion),
      id_cita: texto_(principalOriginal.id_cita),
      id_paciente: texto_(principalOriginal.id_paciente),
      id_historia: texto_(principalOriginal.id_historia),
      id_medico: texto_(principalOriginal.id_medico),

      peso_kg: texto_(principalOriginal.peso_kg),
      talla_cm: texto_(principalOriginal.talla_cm),
      imc: texto_(principalOriginal.imc),
      presion_arterial: texto_(principalOriginal.presion_arterial),
      frecuencia_cardiaca: texto_(principalOriginal.frecuencia_cardiaca),
      temperatura: texto_(principalOriginal.temperatura),
      saturacion: texto_(principalOriginal.saturacion),

      examen_fisico: texto_(principalOriginal.examen_fisico),

      diagnosticos_cie10: texto_(principalOriginal.diagnosticos_cie10),
      diagnostico_cie10: texto_(principalOriginal.diagnostico_cie10),
      diagnostico_principal: texto_(principalOriginal.diagnostico_principal),
      cie10_secundario: texto_(principalOriginal.cie10_secundario),
      diagnostico_secundario: texto_(principalOriginal.diagnostico_secundario),

      estado_examen: texto_(principalOriginal.estado_examen || 'Activo')
    };

    let sistemas = [];
    let regionales = [];
    let diagnosticos = [];

    try{
      if(typeof window.auroRecopilarSistemasEstructurados === 'function'){
        sistemas = window.auroRecopilarSistemasEstructurados();
      }
    }catch(error){
      console.warn('IASYN EXAMEN V1: no se pudo firmar sistemas.', error);
    }

    try{
      if(typeof window.auroRecopilarRegionalesEstructurados === 'function'){
        regionales = window.auroRecopilarRegionalesEstructurados();
      }
    }catch(error){
      console.warn('IASYN EXAMEN V1: no se pudo firmar regionales.', error);
    }

    try{
      if(typeof window.auroRecopilarDiagnosticosEstructurados === 'function'){
        diagnosticos = window.auroRecopilarDiagnosticosEstructurados();
      }
    }catch(error){
      console.warn('IASYN EXAMEN V1: no se pudo firmar diagnósticos.', error);
    }

    return {
      id_atencion: principal.id_atencion,
      principal: normalizarObjeto_(principal),
      sistemas: ordenarListaClinica_(sistemas),
      regionales: ordenarListaClinica_(regionales),
      diagnosticos: ordenarListaClinica_(diagnosticos)
    };
  }

  function firmaActual_(){
    const estado = obtenerEstadoClinicoActual_();
    if(!estado) return '';
    return JSON.stringify(normalizarObjeto_(estado));
  }

  function examenPersistidoActual_(){
    const idAtencion = (typeof window.auroExamenFisicoIdAtencionActual === 'function')
      ? texto_(window.auroExamenFisicoIdAtencionActual())
      : texto_(window.examenFisicoState && window.examenFisicoState.atencionActual);

    if(!idAtencion) return null;

    const registro = window.examenFisicoState &&
      window.examenFisicoState.examenesSheets &&
      window.examenFisicoState.examenesSheets[idAtencion];

    return registro && registro.id_examen ? registro : null;
  }

  function invalidar_(motivo){
    ESTADO.id_atencion = '';
    ESTADO.id_examen = '';
    ESTADO.firma = '';
    ESTADO.cargado = false;
    ESTADO.motivo = motivo || 'invalidado';
  }

  function capturarBaseline_(motivo){
    const registro = examenPersistidoActual_();
    if(!registro || !registro.id_examen){
      invalidar_(motivo || 'sin_examen_persistido');
      return false;
    }

    const idAtencion = texto_(registro.id_atencion ||
      (typeof window.auroExamenFisicoIdAtencionActual === 'function'
        ? window.auroExamenFisicoIdAtencionActual()
        : window.examenFisicoState && window.examenFisicoState.atencionActual));

    const firma = firmaActual_();

    if(!idAtencion || !firma){
      invalidar_(motivo || 'baseline_incompleto');
      return false;
    }

    ESTADO.id_atencion = idAtencion;
    ESTADO.id_examen = texto_(registro.id_examen);
    ESTADO.firma = firma;
    ESTADO.cargado = true;
    ESTADO.motivo = motivo || 'baseline_capturado';

    return true;
  }

  function contextoCoincide_(){
    if(!ESTADO.cargado || !ESTADO.id_atencion || !ESTADO.id_examen){
      return false;
    }

    const registro = examenPersistidoActual_();
    if(!registro) return false;

    const idAtencion = texto_(registro.id_atencion ||
      (typeof window.auroExamenFisicoIdAtencionActual === 'function'
        ? window.auroExamenFisicoIdAtencionActual()
        : window.examenFisicoState && window.examenFisicoState.atencionActual));

    return (
      idAtencion === ESTADO.id_atencion &&
      texto_(registro.id_examen) === ESTADO.id_examen
    );
  }

  function sinCambiosReales_(){
    if(!contextoCoincide_()) return false;
    const actual = firmaActual_();
    return !!actual && actual === ESTADO.firma;
  }

  /*
    1) Captura baseline DESPUÉS de que el examen persistido fue
       aplicado al formulario. Esto evita comparar contra controles
       todavía incompletos durante la carga.
  */
  const cargarDesdeSheetOriginal =
    typeof window.auroCargarExamenFisicoDesdeSheet === 'function'
      ? window.auroCargarExamenFisicoDesdeSheet
      : null;

  if(cargarDesdeSheetOriginal){
    window.auroCargarExamenFisicoDesdeSheet = function(registro){
      const resultado = cargarDesdeSheetOriginal.apply(this, arguments);

      try{
        if(registro && registro.id_examen){
          capturarBaseline_('carga_examen_persistido');
        }else{
          invalidar_('carga_sin_examen');
        }
      }catch(error){
        invalidar_('error_capturando_baseline');
        console.warn('IASYN EXAMEN V1: no se pudo capturar baseline tras cargar.', error);
      }

      return resultado;
    };
  }

  /*
    2) Al cambiar de atención invalida inmediatamente el baseline.
       La nueva carga persistida volverá a capturarlo cuando corresponda.
  */
  const cambiarAtencionOriginal =
    typeof window.cambiarExamenFisicoPorAtencion === 'function'
      ? window.cambiarExamenFisicoPorAtencion
      : null;

  if(cambiarAtencionOriginal){
    window.cambiarExamenFisicoPorAtencion = function(idAtencion){
      const nueva = texto_(idAtencion);
      if(nueva !== ESTADO.id_atencion){
        invalidar_('cambio_atencion');
      }
      return cambiarAtencionOriginal.apply(this, arguments);
    };
  }

  /*
    3) BARRERA PRINCIPAL.
       Si el registro ya existe y la firma clínica actual es igual
       al baseline cargado, se devuelve success/sin_cambios sin
       invocar el guardador original. Por tanto NO existe POST.
  */
  const guardarOriginal =
    typeof window.auroGuardarExamenFisicoSheets === 'function'
      ? window.auroGuardarExamenFisicoSheets
      : null;

  if(guardarOriginal){
    window.auroGuardarExamenFisicoSheets = async function(){
      try{
        if(sinCambiosReales_()){
          const resultadoSinCambios = {
            success: true,
            sin_cambios: true,
            id_atencion: ESTADO.id_atencion,
            id_examen: ESTADO.id_examen,
            message: 'Examen físico sin cambios. No se realizó ninguna escritura.'
          };

          console.log(
            'IASYN EXAMEN: sin cambios reales; guardado omitido antes del POST.',
            resultadoSinCambios
          );

          return resultadoSinCambios;
        }
      }catch(error){
        /*
          Fail-open seguro:
          si la comparación falla, NO se bloquea un cambio clínico;
          se utiliza el guardador histórico exactamente como estaba.
        */
        console.warn(
          'IASYN EXAMEN V1: no se pudo comprobar no-op; se conserva guardado original.',
          error
        );
      }

      const resultado = await guardarOriginal.apply(this, arguments);

      if(resultado && resultado.success === true){
        try{
          /*
            Después de que principal + detalle terminaron correctamente,
            el formulario actual pasa a ser el nuevo baseline.
          */
          capturarBaseline_(
            resultado.sin_cambios === true
              ? 'guardado_original_sin_cambios'
              : 'guardado_confirmado'
          );
        }catch(error){
          console.warn(
            'IASYN EXAMEN V1: guardado confirmado, pero no se pudo renovar baseline.',
            error
          );
        }

        /*
          IASYN - REFRESCO VISUAL QUIRÚRGICO V2
          ------------------------------------------------------------
          Solo después de un guardado REAL confirmado:
          1) relee el mismo examen por id_atencion para hidratar en memoria
             el actualizado_en persistido por Apps Script;
          2) refresca exclusivamente la etiqueta visual inferior de hc_examen.

          No realiza POST adicional, no modifica datos clínicos y no toca
          Antecedentes, Estética ni historias_clinicas.
        */
        if(resultado.sin_cambios !== true){
          try{
            const idAtencionRefresco = texto_(ESTADO.id_atencion);

            if(
              idAtencionRefresco &&
              typeof window.auroBuscarExamenFisicoPorAtencion === 'function'
            ){
              await window.auroBuscarExamenFisicoPorAtencion(idAtencionRefresco);
            }

            const panelExamen = document.getElementById('hc_examen');
            const examenActivo = !!panelExamen?.classList?.contains('active');

            let atencionActual = '';
            try{
              if(typeof window.getIdAtencionActiva === 'function'){
                atencionActual = texto_(window.getIdAtencionActiva());
              }
            }catch(e){}

            if(
              examenActivo &&
              (!atencionActual || atencionActual === idAtencionRefresco) &&
              typeof window.auroHistoriaRefrescarEstadoConsultaActiva === 'function'
            ){
              await window.auroHistoriaRefrescarEstadoConsultaActiva('hc_examen');
            }
          }catch(error){
            /*
              Fallo exclusivamente visual:
              el guardado clínico ya fue confirmado, por lo tanto nunca
              se altera su resultado ni se reintenta la escritura.
            */
            console.warn(
              'IASYN EXAMEN V2: guardado correcto; no se pudo refrescar la hora visual.',
              error
            );
          }
        }
      }

      return resultado;
    };
  }

  /*
    4) Re-exportación explícita para mantener las referencias públicas
       del módulo apuntando a las funciones envueltas.
  */
  if(typeof window.auroCargarExamenFisicoDesdeSheet === 'function'){
    try{ auroCargarExamenFisicoDesdeSheet = window.auroCargarExamenFisicoDesdeSheet; }catch(_e){}
  }

  if(typeof window.cambiarExamenFisicoPorAtencion === 'function'){
    try{ cambiarExamenFisicoPorAtencion = window.cambiarExamenFisicoPorAtencion; }catch(_e){}
  }

  if(typeof window.auroGuardarExamenFisicoSheets === 'function'){
    try{ auroGuardarExamenFisicoSheets = window.auroGuardarExamenFisicoSheets; }catch(_e){}
  }

  /*
    Herramienta diagnóstica de solo lectura para pruebas.
  */
  window.auroExamenFisicoDebugSinCambiosV1 = function(){
    let actual = '';
    try{ actual = firmaActual_(); }catch(_e){}

    return {
      instalado: true,
      id_atencion_baseline: ESTADO.id_atencion,
      id_examen_baseline: ESTADO.id_examen,
      baseline_cargado: ESTADO.cargado,
      motivo: ESTADO.motivo,
      contexto_coincide: contextoCoincide_(),
      sin_cambios_reales: !!actual && contextoCoincide_() && actual === ESTADO.firma,
      firma_baseline_longitud: ESTADO.firma.length,
      firma_actual_longitud: actual.length
    };
  };

  console.log(
    'IASYN examenfisico.js: BARRERA SIN CAMBIOS REALES V1 instalada.'
  );
})();
