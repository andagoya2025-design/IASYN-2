/* ============================================================================
   IASYN CLINICAL ERP
   Archivo de reemplazo propuesto: informe_historico.js
   Entrega externa: TXT completo para revisión manual
   Versión propuesta: 2.4.0-DEPURACION-DOCUMENTAL-ORDENADA-ANTIRREGRESIVO
   Fecha: 2026-08-31
   Baseline leído en GitHub (SOLO LECTURA):
   informe_historico.js v2.3.0-RENDIMIENTO-LECTURA-CONTROLADA-ANTIRREGRESIVO
   SHA: f8229f1d30d3247743bd0528e44d48d32efe87e5
   ---------------------------------------------------------------------------
   OBJETIVO QUIRÚRGICO
   - Corregir exclusivamente lectura, asociación, validación y presentación del
     Informe Clínico Histórico.
   - NO modificar ningún guardado clínico propietario.
   - NO modificar Apps Script, Google Sheets, Atenciones, Anamnesis, Examen,
     Obstetricia, Ginecología, Diagnóstico, Plan, Recetas ni documentos.
   - Mantener el contrato público histórico:
       window.auroInformeHistorico.abrir()
       window.auroInformeHistorico.imprimir()
       window.auroInformeHistorico.cerrar()
       window.auroInformeHistorico.diagnostico()
   - Se agrega de forma aditiva:
       window.auroInformeHistorico.actualizar()

   PRINCIPIOS GOLD STANDARD / ANTIRREGRESIÓN
   1. SOLO LECTURA: exclusivamente GET. Nunca POST/PUT/PATCH/DELETE.
   2. BACKEND PERSISTENTE COMO AUTORIDAD. RAM solo como respaldo marcado.
   3. UNA ATENCIÓN, UN CONTEXTO; UN PACIENTE, UNA IDENTIDAD.
   4. id_atencion es frontera de datos por consulta.
   5. No se cambia la atención activa, no se navega y no se disparan autosaves.
   6. Un dato vacío, placeholder o estado interno NO se convierte en dato clínico.
   7. Un módulo sin contenido clínico real NO se imprime ni reserva espacio.
   8. No se infiere pertenencia por fecha.
   9. Fallo de una fuente clínica != fuente vacía.
  10. Si una fuente clínica crítica no pudo verificarse, la vista previa puede
      mostrarse como INCOMPLETA, pero el PDF definitivo queda bloqueado.
  11. Vista previa y PDF usan el MISMO HTML documental validado.
  12. El informe ordena y presenta; NO corrige ni reescribe el registro clínico.
  13. VISOR PREMIUM: zoom y ajuste al ancho afectan SOLO la vista previa.
      El HTML documental y la impresión/PDF A4 permanecen sin modificación.
  14. DOCUMENTO CLÍNICO PROFESIONAL: dato ausente = espacio ausente. La
      maquetación documental se redistribuye sin fabricar información ni dejar
      tarjetas/celdas vacías. Los textos clínicos extensos aprovechan el ancho.

   OPTIMIZACIÓN QUIRÚRGICA V2.3 — SOLO MOTOR PRIVADO DE LECTURA
   - Mantiene exactamente los mismos endpoints GET y el mismo filtrado clínico.
   - No modifica Apps Script, Sheets, módulos propietarios ni estado global ERP.
   - Limita únicamente las solicitudes iniciadas por este Informe Histórico.
   - Inicia el detalle por atención apenas está disponible listarAtenciones,
     sin esperar innecesariamente las demás fuentes maestras/globales.
   - Añade métricas privadas de rendimiento para diagnóstico; no persisten datos.
   - No introduce caché clínica persistente ni cambia la frescura de las lecturas.

   DEPURACIÓN DOCUMENTAL QUIRÚRGICA V2.4 — SOLO PRESENTACIÓN / VALIDACIÓN
   - El Informe Histórico deja de exigir un "profesional responsable de emisión"
     fijo en Configuración; cada atención conserva su profesional real.
   - Los contadores técnicos de pertenencia permanecen en diagnóstico interno,
     pero dejan de mostrarse como alertas clínicas al usuario.
   - Las atenciones vacías no se imprimen y se resumen de forma clínica, no técnica.
   - Estética se presenta una sola vez por registro con contenido real; se elimina
     la segunda representación duplicada en la sección evolutiva.
   - Los registros sin id_atencion se muestran agrupados como "Otros registros
     clínicos del paciente" sin atribuirlos artificialmente a una consulta.
   - No se implementan cambios de permisos en esta fase; seguridad queda intacta.
============================================================================ */
(function(){
  'use strict';

  if(window.auroInformeHistorico?.version){
    console.warn('IASYN INFORME HISTÓRICO: el módulo ya estaba cargado.');
    return;
  }

  const VERSION = '2.4.0-DEPURACION-DOCUMENTAL-ORDENADA-ANTIRREGRESIVO';
  const MODULO = 'IASYN INFORME HISTÓRICO';

  /*
    IASYN - AISLAMIENTO / COMPATIBILIDAD INTERNA TEMPORAL
    -----------------------------------------------------
    Este módulo es SOLO LECTURA: realiza exclusivamente GET y no contiene
    URLs directas de Apps Script, Google Drive, Google Sheets ni AUROSANAX.

    API_URL sigue siendo la autoridad del index de IASYN. Los prefijos
    históricos AUROSANAX_ANT_* se conservan porque identifican serializaciones
    clínicas ya persistidas y no representan una conexión activa externa.
    AUROSANAX_SEGURIDAD permanece únicamente como fallback temporal de
    compatibilidad mientras la migración coordinada de Seguridad finaliza.
  */
  const MAX_GET_CONCURRENCIA = 8;

  const INVALIDOS_BASE = new Set([
    '', '-', '—', 'undefined', 'null', '[object object]',
    'no registrado', 'no registrada', 'sin registrar',
    'no registrado en esta atencion', 'no registrada en esta atencion',
    'sin información', 'sin informacion', 'sin información registrada',
    'sin informacion registrada', 'sin dato', 'sin datos', 'no valorado',
    'no disponible', 'n/a', 'na', 'seleccione', 'seleccione...',
    'seleccionar', 'elegir indicacion rapida...', 'pendiente', '[]', '{}'
  ]);

  const INVALIDOS_OBSTETRICIA = new Set([
    ...INVALIDOS_BASE,
    '0', '0.0', '00', 'no clasificado', 'no clasificada',
    'no aplica', 'ninguno', 'ninguna', 'sin clasificar'
  ]);

  const state = {
    token: 0,
    cargando: false,
    idPaciente: '',
    datos: null,
    htmlDocumento: '',
    validacion: null,
    fuentes: {},
    advertencias: [],
    errores: [],
    excluidos: {
      sinPertenencia: 0,
      sinAtencion: 0,
      atencionesSinContenido: 0
    },
    /*
      V2.3: diagnóstico de rendimiento SOLO EN RAM PRIVADA DEL INFORME.
      No participa en el modelo clínico, no se persiste y no modifica otros módulos.
    */
    rendimiento: {
      inicio_ms: 0,
      fin_ms: 0,
      total_ms: 0,
      solicitudes: 0,
      pico_concurrencia: 0,
      endpoints: {}
    },
    /* Solo presentación. No participa en lectura, validación ni PDF. */
    visor: {
      zoom: 1.25,
      ajusteAncho: false
    }
  };

  /* ========================================================================
     UTILIDADES BÁSICAS
  ======================================================================== */
  const txt = v => String(v === null || v === undefined ? '' : v).trim();

  function norm(v){
    return txt(v)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/\s+/g,' ')
      .trim();
  }

  function esc(v){
    return String(v ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function arr(v){
    if(Array.isArray(v)) return v;
    if(!v || typeof v !== 'object') return [];
    const candidatos = [v.data, v.datos, v.registros, v.resultado, v.result, v.items, v.lista];
    return candidatos.find(Array.isArray) || [];
  }

  function obj(v){
    if(!v) return null;
    if(Array.isArray(v)) return v[0] || null;
    if(typeof v !== 'object') return null;
    if(v.data && !Array.isArray(v.data) && typeof v.data === 'object') return v.data;
    if(v.datos && !Array.isArray(v.datos) && typeof v.datos === 'object') return v.datos;
    if(v.registro && typeof v.registro === 'object') return v.registro;
    if(v.resultado && !Array.isArray(v.resultado) && typeof v.resultado === 'object') return v.resultado;
    return v;
  }

  function parseJSON(v, fallback=null){
    if(v && typeof v === 'object') return v;
    const raw = txt(v);
    if(!raw) return fallback;

    const candidatos = [raw];
    const idxObj = raw.indexOf('{');
    const idxArr = raw.indexOf('[');
    const idx = [idxObj, idxArr].filter(x=>x>=0).sort((a,b)=>a-b)[0];
    if(Number.isInteger(idx) && idx > 0) candidatos.push(raw.slice(idx));

    for(const c of candidatos){
      try{ return JSON.parse(c); }catch(_e){}
    }
    return fallback;
  }

  function esClaveTecnica(k){
    const n = norm(k).replace(/\s+/g,'_');
    if(!n) return true;
    if(/^id($|_)/.test(n)) return true;
    if(/(^|_)(creado|actualizado|modificado|eliminado)(_en|_por)?$/.test(n)) return true;
    if(/^(creado_en|actualizado_en|creado_por|actualizado_por|modulo_version|version|timestamp)$/.test(n)) return true;
    if(/^(estado_registro|estado_examen|estado_documento|estado_historia)$/.test(n)) return true;
    if(/^_/.test(n)) return true;
    if(/cabecera_contexto|valor_confirmado|interno|tecnico|debug/.test(n)) return true;
    return false;
  }

  function esPlaceholder(v, opciones={}){
    if(v === null || v === undefined) return true;
    if(typeof v === 'boolean') return v === false;
    if(typeof v === 'number'){
      if(!Number.isFinite(v)) return true;
      return opciones.ceroVacio === true && v === 0;
    }
    if(typeof v === 'object') return false;

    const n = norm(v);
    if(!n) return true;
    const invalidos = opciones.obstetricia ? INVALIDOS_OBSTETRICIA : INVALIDOS_BASE;
    if(invalidos.has(n)) return true;
    if(opciones.ceroVacio === true && /^0(?:[.,]0+)?$/.test(n)) return true;
    if(/^(cargando|seleccione primero|sin consulta activa|sin atencion activa)/.test(n)) return true;
    return false;
  }

  function valorClinico(v, opciones={}){
    if(esPlaceholder(v,opciones)) return false;
    if(typeof v === 'boolean') return v === true;
    if(typeof v === 'number') return Number.isFinite(v) && !(opciones.ceroVacio === true && v === 0);
    if(Array.isArray(v)) return v.some(x=>valorClinico(x,opciones));
    if(v && typeof v === 'object'){
      return Object.entries(v).some(([k,x])=>!esClaveTecnica(k) && valorClinico(x,opciones));
    }
    return true;
  }

  function primer(){
    for(const v of arguments){
      if(valorClinico(v)) return v;
    }
    return '';
  }

  function nombreCompleto(o){
    o = o || {};
    return txt(
      o.nombre_completo || o.nombre_paciente || o.paciente_nombre || o.nombre ||
      [o.nombres || o.nombre1, o.apellidos || [o.apellido_paterno,o.apellido_materno].filter(Boolean).join(' ')]
        .filter(Boolean).join(' ')
    ).replace(/\s+/g,' ').trim();
  }

  function humanizar(k){
    const original = txt(k)
      .replace(/^(id|question|name):/i,'')
      .replace(/^hc/i,'')
      .replace(/^auroDyn_/i,'')
      .replace(/^ginSint/i,'')
      .replace(/^obsSint/i,'');

    const mapa = {
      fum:'FUM', fur:'FUM', fpp:'FPP', fcf:'FCF', imc:'IMC', cie10:'CIE-10',
      pa:'Presión arterial', fc:'Frecuencia cardíaca', fr:'Frecuencia respiratoria', spo2:'Saturación',
      presion_arterial:'Presión arterial', frecuencia_cardiaca:'Frecuencia cardíaca',
      frecuencia_respiratoria:'Frecuencia respiratoria', saturacion:'Saturación',
      temperatura:'Temperatura', peso_kg:'Peso', talla_cm:'Talla',
      edad_gestacional_semanas:'Edad gestacional (semanas)',
      edad_gestacional_dias:'Edad gestacional (días)',
      frecuencia_cardiaca_fetal:'Frecuencia cardíaca fetal',
      altura_uterina:'Altura uterina', riesgo_obstetrico:'Riesgo obstétrico',
      movimientos_fetales:'Movimientos fetales', actividad_uterina:'Actividad uterina',
      estado_membranas:'Estado de membranas', hallazgos_relevantes:'Hallazgos relevantes',
      tipo_embarazo:'Tipo de embarazo', numero_fetos:'Número de fetos',
      situacion_fetal:'Situación fetal', presentacion_fetal:'Presentación fetal', posicion_fetal:'Posición fetal',
      motivo_consulta:'Motivo de consulta', enfermedad_actual:'Enfermedad actual',
      plan_tratamiento:'Plan terapéutico', indicaciones_paciente:'Indicaciones',
      proximo_control:'Próximo control', observaciones:'Observaciones',
      medicamento:'Medicamento', presentacion:'Presentación', via:'Vía', cantidad:'Cantidad',
      frecuencia:'Frecuencia', duracion:'Duración', indicaciones:'Indicaciones',
      dolor_pelvico:'Dolor pélvico', sangrado:'Sangrado', leucorrea:'Leucorrea', prurito:'Prurito',
      disuria:'Disuria', dispareunia:'Dispareunia', amenorrea:'Amenorrea', dismenorrea:'Dismenorrea',
      masa:'Sensación de masa', sequedad:'Sequedad vaginal', incontinencia:'Incontinencia',
      menopausia:'Síntomas menopáusicos', perdida_liquido:'Pérdida de líquido',
      contracciones:'Contracciones', cefalea:'Cefalea', fosfenos:'Fosfenos', tinnitus:'Tinnitus',
      epigastralgia:'Epigastralgia', otros:'Otros síntomas', descripcion:'Descripción'
    };

    const clave = norm(original).replace(/\s+/g,'_');
    if(mapa[clave]) return mapa[clave];

    return original
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g,'$1 $2')
      .replace(/[_-]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .replace(/\b\w/g,m=>m.toUpperCase()) || 'Dato clínico';
  }

  function fechaISO(v){
    const raw = txt(v);
    if(!raw) return '';
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return '';
  }

  function fechaVista(v){
    const iso = fechaISO(v);
    if(!iso) return valorClinico(v) ? txt(v) : '';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function horaVista(v){
    const raw = txt(v);
    if(!raw) return '';
    const m = raw.match(/(?:T|\s)?(\d{1,2}):(\d{2})/);
    return m ? `${String(m[1]).padStart(2,'0')}:${m[2]}` : raw;
  }

  function timestampAtencion(a){
    const f = fechaISO(a?.fecha_atencion || a?.fecha_consulta || a?.fecha || a?.creado_en);
    if(!f) return 0;
    const h = horaVista(a?.hora_atencion || a?.hora_consulta || a?.hora) || '00:00';
    const n = new Date(`${f}T${h}:00`).getTime();
    return Number.isFinite(n) ? n : 0;
  }

  function esAtencionClinicaValida(a){
    const e = norm(a?.estado_atencion || a?.estado || a?.estado_consulta);
    return !/(anulad|cancelad|archivad|eliminad)/.test(e);
  }

  function idPacienteSeleccionado(){
    const select = document.getElementById('hcPacienteSelect');
    const idSelect = txt(select?.value);
    if(idSelect) return idSelect;

    try{
      const p = window.getPacienteActivo?.();
      const id = txt(p?.id_paciente || p?.id);
      if(id) return id;
    }catch(_e){}

    return txt(window.activePatientId || window.historiaActual?.id_paciente || window.currentHistoria?.id_paciente);
  }

  function apiUrl(){
    try{
      if(typeof API_URL !== 'undefined' && API_URL) return txt(API_URL);
    }catch(_e){}

    return txt(
      window.API_URL ||
      window.APP_SCRIPT_URL ||
      document.getElementById('appsScriptUrl')?.value ||
      window.IASYN_SEGURIDAD?.configuracion?.apiUrl ||
      window.IASYN_SEGURIDAD?.config?.apiUrl ||
      window.AUROSANAX_SEGURIDAD?.configuracion?.apiUrl ||
      window.AUROSANAX_SEGURIDAD?.config?.apiUrl
    );
  }

  function registrarFuente(clave, datos){
    state.fuentes[clave] = {
      ...(state.fuentes[clave] || {}),
      ...datos
    };
  }

  /* ========================================================================
     API: EXCLUSIVAMENTE GET
     V2.3 — COLA PRIVADA DE LECTURA CONTROLADA
     ------------------------------------------------------------------------
     Esta cola SOLO administra fetch() iniciados por informe_historico.js.
     No intercepta window.fetch, no modifica API_URL, no cambia endpoints,
     no toca eventos/estado de otros módulos y no persiste caché clínica.
  ======================================================================== */
  const colaGet = {
    activos: 0,
    espera: [],
    pico: 0
  };

  function relojMs(){
    try{
      if(typeof performance !== 'undefined' && typeof performance.now === 'function'){
        return performance.now();
      }
    }catch(_e){}
    return Date.now();
  }

  function reiniciarRendimiento(){
    state.rendimiento = {
      inicio_ms: relojMs(),
      fin_ms: 0,
      total_ms: 0,
      solicitudes: 0,
      pico_concurrencia: 0,
      endpoints: {}
    };
    colaGet.pico = colaGet.activos;
  }

  function registrarMetricaGet(accion, datos={}){
    const r = state.rendimiento || (state.rendimiento = {endpoints:{}});
    r.endpoints = r.endpoints || {};
    const clave = txt(accion) || 'GET';
    const item = r.endpoints[clave] || {
      solicitudes: 0,
      exitos: 0,
      errores: 0,
      total_ms: 0,
      red_ms: 0,
      cola_ms: 0,
      max_ms: 0
    };

    const total = Number(datos.total_ms || 0);
    const red = Number(datos.red_ms || 0);
    const cola = Number(datos.cola_ms || 0);

    item.solicitudes += 1;
    if(datos.ok === true) item.exitos += 1;
    else item.errores += 1;
    item.total_ms += total;
    item.red_ms += red;
    item.cola_ms += cola;
    item.max_ms = Math.max(item.max_ms, total);
    r.endpoints[clave] = item;
    r.solicitudes = Number(r.solicitudes || 0) + 1;
    r.pico_concurrencia = Math.max(Number(r.pico_concurrencia || 0), colaGet.pico);
  }

  function drenarColaGet(){
    while(colaGet.activos < MAX_GET_CONCURRENCIA && colaGet.espera.length){
      const item = colaGet.espera.shift();
      colaGet.activos += 1;
      colaGet.pico = Math.max(colaGet.pico, colaGet.activos);
      if(state.rendimiento){
        state.rendimiento.pico_concurrencia = Math.max(
          Number(state.rendimiento.pico_concurrencia || 0),
          colaGet.pico
        );
      }

      Promise.resolve()
        .then(item.tarea)
        .then(item.resolve,item.reject)
        .finally(()=>{
          colaGet.activos = Math.max(0,colaGet.activos-1);
          drenarColaGet();
        });
    }
  }

  function ejecutarGetControlado(tarea){
    return new Promise((resolve,reject)=>{
      colaGet.espera.push({tarea,resolve,reject});
      drenarColaGet();
    });
  }

  async function get(accion, params={}, opciones={}){
    const base = apiUrl();
    const clave = txt(opciones.clave || accion);
    const critica = opciones.critica === true;

    if(!base){
      const error = new Error('API_URL no está definida.');
      registrarFuente(clave,{accion,ok:false,critica,error:error.message});
      if(opciones.fatal) throw error;
      return opciones.defecto ?? null;
    }

    const q = new URLSearchParams({accion, _:String(Date.now())});
    Object.entries(params || {}).forEach(([k,v])=>{
      if(v !== undefined && v !== null && txt(v)) q.append(k, String(v));
    });

    const programadoEn = relojMs();
    let inicioRed = programadoEn;

    try{
      const data = await ejecutarGetControlado(async()=>{
        inicioRed = relojMs();
        const r = await fetch(base + '?' + q.toString(), {
          method:'GET',
          cache:'no-store',
          redirect:'follow'
        });
        if(!r.ok) throw new Error(`HTTP ${r.status} en ${accion}`);
        const payload = await r.json();
        if(payload && typeof payload === 'object' && !Array.isArray(payload) && payload.success === false){
          throw new Error(txt(payload.message || payload.error || `Apps Script reportó error en ${accion}`));
        }
        return payload;
      });

      const fin = relojMs();
      registrarMetricaGet(accion,{
        ok:true,
        cola_ms:Math.max(0,inicioRed-programadoEn),
        red_ms:Math.max(0,fin-inicioRed),
        total_ms:Math.max(0,fin-programadoEn)
      });
      registrarFuente(clave,{accion,ok:true,critica,error:'',respaldo_local:false});
      return data;
    }catch(error){
      const fin = relojMs();
      registrarMetricaGet(accion,{
        ok:false,
        cola_ms:Math.max(0,inicioRed-programadoEn),
        red_ms:Math.max(0,fin-inicioRed),
        total_ms:Math.max(0,fin-programadoEn)
      });
      registrarFuente(clave,{accion,ok:false,critica,error:error?.message || String(error),respaldo_local:false});
      state.advertencias.push(`${accion}: ${error?.message || error}`);
      if(opciones.fatal) throw error;
      return opciones.defecto ?? null;
    }
  }

  /* ========================================================================
     FUENTES MAESTRAS: BACKEND PRIMERO, RAM SOLO RESPALDO MARCADO
  ======================================================================== */
  function pacienteLocal(idPaciente){
    const listas = [window.patients, window.pacientes, window.listaPacientes, window.pacientesData].filter(Array.isArray);
    for(const lista of listas){
      const p = lista.find(x=>txt(x?.id_paciente || x?.id) === idPaciente);
      if(p) return p;
    }
    try{
      const p = window.getPacienteActivo?.();
      if(txt(p?.id_paciente || p?.id) === idPaciente) return p;
    }catch(_e){}
    return null;
  }

  async function cargarPaciente(idPaciente){
    const remoto = await get('listarPacientes',{}, {
      clave:'maestro:pacientes',
      critica:true,
      defecto:[]
    });

    const encontrado = arr(remoto).find(x=>txt(x?.id_paciente || x?.id) === idPaciente) || null;
    if(encontrado) return encontrado;

    const local = pacienteLocal(idPaciente);
    if(local){
      registrarFuente('maestro:pacientes',{
        accion:'listarPacientes',
        ok:state.fuentes['maestro:pacientes']?.ok === true,
        critica:true,
        respaldo_local:true,
        observacion:'Paciente resuelto desde memoria local.'
      });
      state.advertencias.push('Paciente resuelto desde memoria local; el documento requiere verificación persistente.');
      return local;
    }
    return null;
  }

  function historiasLocales(idPaciente){
    const listas = [window.historiasClinicas, window.historias, window.listaHistorias].filter(Array.isArray);
    for(const lista of listas){
      const encontradas = lista.filter(x=>txt(x?.id_paciente) === idPaciente);
      if(encontradas.length) return encontradas;
    }
    return [];
  }

  async function cargarHistoriasPaciente(idPaciente){
    const remoto = await get('listarHistoriasClinicas',{}, {
      clave:'maestro:historias',
      critica:true,
      defecto:[]
    });

    const remotas = arr(remoto).filter(x=>txt(x?.id_paciente) === idPaciente);
    if(remotas.length) return remotas;

    const locales = historiasLocales(idPaciente);
    if(locales.length){
      registrarFuente('maestro:historias',{
        accion:'listarHistoriasClinicas',
        ok:state.fuentes['maestro:historias']?.ok === true,
        critica:true,
        respaldo_local:true,
        observacion:'Historia resuelta desde memoria local.'
      });
      state.advertencias.push('Historia clínica resuelta desde memoria local; requiere verificación persistente.');
      return locales;
    }
    return [];
  }

  async function cargarAtencionesPaciente(idPaciente){
    const remoto = await get('listarAtenciones',{}, {
      clave:'maestro:atenciones',
      critica:true,
      fatal:true,
      defecto:[]
    });

    return arr(remoto)
      .filter(a=>txt(a?.id_paciente) === idPaciente)
      .filter(esAtencionClinicaValida)
      .sort((a,b)=>timestampAtencion(a)-timestampAtencion(b));
  }

  async function cargarMedicos(){
    const remoto = await get('listarMedicosActivos',{}, {
      clave:'maestro:medicos',
      critica:false,
      defecto:[]
    });
    const remotos = arr(remoto);
    if(remotos.length) return remotos;
    return [window.medicos, window.medicosActivos, window.listaMedicos].find(Array.isArray) || [];
  }

  async function cargarConfiguracion(){
    const remoto = await get('obtenerConfiguracion',{}, {
      clave:'maestro:configuracion',
      critica:false,
      defecto:{}
    });
    return obj(remoto) || window.auroConfiguracionCentro || window.configuracionCentro || window.configuracionInstitucional || {};
  }

  function historiaConAntecedentes(historias){
    const tiene = h => [
      h?.antecedentes_personales,
      h?.antecedentes_quirurgicos,
      h?.antecedentes_gineco_obstetricos,
      h?.antecedentes_familiares,
      h?.medicacion_actual,
      h?.alergias
    ].some(v=>valorClinico(v));

    return (historias || [])
      .filter(tiene)
      .sort((a,b)=>{
        const ta = new Date(a?.actualizado_en || a?.fecha_apertura || a?.creado_en || 0).getTime() || 0;
        const tb = new Date(b?.actualizado_en || b?.fecha_apertura || b?.creado_en || 0).getTime() || 0;
        return tb-ta;
      })[0] || historias?.[0] || null;
  }

  /* ========================================================================
     CARGADORES CLÍNICOS POR ATENCIÓN
     Un fallo queda registrado como FUENTE NO VERIFICADA; no se finge vacío.
  ======================================================================== */
  async function cargarModuloAtencion(a){
    const id = txt(a?.id_atencion);
    if(!id){
      return {
        atencion:a,
        anamnesis:null,
        examen:null,
        diagnosticos:[],
        plan:null,
        recomendaciones:null,
        certificados:[],
        documentos:[],
        _sinIdAtencion:true
      };
    }

    const [anamnesisR, examenR, diagnosticosR, planR, recomendacionesR, certificadosR, documentosR] = await Promise.all([
      get('buscarAnamnesisPorAtencion',{id_atencion:id},{clave:`anamnesis:${id}`,critica:true,defecto:null}),
      get('buscarExamenFisicoPorAtencion',{id_atencion:id},{clave:`examen:${id}`,critica:true,defecto:null}),
      get('listarDiagnosticosPorAtencion',{id_atencion:id},{clave:`diagnosticos:${id}`,critica:true,defecto:[]}),
      get('buscarPlanPorAtencion',{id_atencion:id},{clave:`plan:${id}`,critica:true,defecto:null}),
      get('buscarRecomendacionPorAtencion',{id_atencion:id},{clave:`recomendaciones:${id}`,critica:true,defecto:null}),
      get('listarCertificadosPorAtencion',{id_atencion:id},{clave:`certificados:${id}`,critica:true,defecto:[]}),
      get('listarDocumentosPorAtencion',{id_atencion:id},{clave:`documentos:${id}`,critica:true,defecto:[]})
    ]);

    return {
      atencion:a,
      anamnesis:obj(anamnesisR),
      examen:obj(examenR),
      diagnosticos:arr(diagnosticosR),
      plan:obj(planR),
      recomendaciones:obj(recomendacionesR),
      certificados:arr(certificadosR),
      documentos:arr(documentosR)
    };
  }

  async function cargarColeccionesGlobales(){
    const definiciones = [
      ['recetas','listarRecetas'],
      ['obstetricia','listarObstetricia'],
      ['ginecologia','listarGinecologia'],
      ['estetica','listarEstetica'],
      ['preatenciones','listarPreatenciones'],
      ['bioimpedancia','listarBioimpedancia'],
      ['procedimientos','listarProcedimientos'],
      ['consentimientos','listarConsentimientos'],
      ['seguimientos','listarSeguimientos']
    ];

    const resultados = await Promise.all(definiciones.map(([clave,accion])=>
      get(accion,{}, {clave:`global:${clave}`,critica:true,defecto:[]})
    ));

    return Object.fromEntries(definiciones.map(([clave],i)=>[clave,arr(resultados[i])]));
  }

  /* ========================================================================
     RELACIÓN CLÍNICA ESTRICTA
  ======================================================================== */
  function construirRelacion(idPaciente, historias, atenciones){
    return {
      idPaciente:txt(idPaciente),
      idsHistoria:new Set((historias || []).map(h=>txt(h?.id_historia || h?.id)).filter(Boolean)),
      idsAtencion:new Set((atenciones || []).map(a=>txt(a?.id_atencion)).filter(Boolean))
    };
  }

  function pertenecePaciente(registro, relacion){
    if(!registro || typeof registro !== 'object') return false;

    const idP = txt(registro.id_paciente || registro.paciente_id);
    const idA = txt(registro.id_atencion || registro.atencion_id);
    const idH = txt(registro.id_historia || registro.historia_id);

    if(idP) return idP === relacion.idPaciente;
    if(idA) return relacion.idsAtencion.has(idA);
    if(idH) return relacion.idsHistoria.has(idH);
    return false;
  }

  function filtrarPorPertenencia(lista, relacion){
    const salida = [];
    (lista || []).forEach(r=>{
      if(pertenecePaciente(r,relacion)) salida.push(r);
      else state.excluidos.sinPertenencia += 1;
    });
    return salida;
  }

  function indexarPorAtencion(lista, relacion){
    const m = new Map();
    (lista || []).forEach(x=>{
      const id = txt(x?.id_atencion || x?.atencion_id);
      if(!id || !relacion.idsAtencion.has(id)) return;
      if(!m.has(id)) m.set(id,[]);
      m.get(id).push(x);
    });
    return m;
  }

  function asociarColecciones(detalleAtenciones, globalesBase, relacion){
    const globales = {};
    Object.entries(globalesBase || {}).forEach(([k,lista])=>{
      globales[k] = filtrarPorPertenencia(lista,relacion);
    });

    const mapas = {
      recetas:indexarPorAtencion(globales.recetas,relacion),
      obstetricia:indexarPorAtencion(globales.obstetricia,relacion),
      ginecologia:indexarPorAtencion(globales.ginecologia,relacion),
      estetica:indexarPorAtencion(globales.estetica,relacion),
      preatenciones:indexarPorAtencion(globales.preatenciones,relacion)
    };

    detalleAtenciones.forEach(d=>{
      const id = txt(d.atencion?.id_atencion);
      d.recetas = mapas.recetas.get(id) || [];
      d.obstetricia = mapas.obstetricia.get(id) || [];
      d.ginecologia = mapas.ginecologia.get(id) || [];
      d.estetica = mapas.estetica.get(id) || [];
      d.preatencion = mapas.preatenciones.get(id) || [];
    });

    const sinAtencion = {};
    ['recetas','obstetricia','ginecologia','estetica','preatenciones','bioimpedancia','procedimientos','consentimientos','seguimientos']
      .forEach(k=>{
        sinAtencion[k] = (globales[k] || []).filter(r=>!txt(r?.id_atencion || r?.atencion_id));
      });

    state.excluidos.sinAtencion = Object.values(sinAtencion).reduce((n,l)=>n+(l?.length||0),0);

    return {...globales, sinAtencion};
  }

  /* ========================================================================
     NORMALIZACIÓN DOCUMENTAL
  ======================================================================== */
  function medicoDeAtencion(a, medicos){
    const id = txt(a?.id_medico);
    const m = (medicos || []).find(x=>txt(x?.id_medico || x?.id || x?.codigo) === id) || {};
    return {
      id,
      nombre:nombreCompleto(m) || txt(a?.nombre_medico || a?.medico_nombre),
      especialidad:txt(
        m?.especialidad_principal || m?.especialidad || m?.especialidad_medica ||
        a?.especialidad || a?.especialidad_atencion || a?.medico_especialidad
      ),
      registro_msp:txt(m?.registro_msp || m?.msp || m?.registro_profesional),
      registro_senescyt:txt(m?.registro_senescyt || m?.senescyt)
    };
  }

  function normalizarInstitucion(c){
    c = c || {};
    if(c.datos && typeof c.datos === 'object') c = c.datos;

    const nombreComercial = txt(c.nombre_comercial || c.nombre_clinica || c.nombre_centro) || 'IASYN';
    const profesional = txt(
      c.nombre_profesional || c.profesional_responsable || c.titular_profesional || c.medico_responsable
    );

    return {
      nombre_comercial:nombreComercial,
      subtitulo:txt(c.subtitulo_clinica || c.descripcion_clinica || c.eslogan_clinica),
      razon_social:txt(c.razon_social),
      ruc:txt(c.ruc),
      direccion:txt(c.direccion_clinica || c.direccion),
      ciudad:txt(c.ciudad_clinica || c.ciudad) || 'Guayaquil',
      pais:txt(c.pais_clinica || c.pais) || 'Ecuador',
      telefono:txt(c.telefono_clinica || c.whatsapp_clinica || c.telefono || c.whatsapp),
      email:txt(c.email_clinica || c.correo_clinica || c.email || c.correo),
      web:txt(c.sitio_web_clinica || c.web_clinica || c.web),
      logo:txt(c.logo_url || c.logo_drive_url || c.logo),
      color:txt(c.color_principal) || '#8b1e5a',
      emisor:{
        nombre:profesional,
        especialidad:txt(c.especialidad_profesional || c.especialidad_medica || c.especialidad),
        registro:txt(c.registro_profesional || c.registro_msp || c.msp),
        ruc:txt(c.ruc)
      }
    };
  }

  function normalizarPaciente(p, historia){
    p = p || {};
    historia = historia || {};
    return {
      id_paciente:txt(p.id_paciente || p.id),
      nombre:nombreCompleto(p) || nombreCompleto(historia),
      documento:txt(p.numero_documento || p.cedula || p.documento || p.identificacion),
      fecha_nacimiento:txt(p.fecha_nacimiento || p.nacimiento),
      edad:txt(p.edad),
      sexo:txt(p.sexo),
      estado_civil:txt(p.estado_civil),
      ocupacion:txt(p.ocupacion),
      telefono:txt(p.telefono || p.whatsapp || p.celular),
      correo:txt(p.correo || p.email),
      direccion:txt(p.direccion),
      seguro:txt(p.seguro_medico || p.seguro),
      tipo_sangre:txt(p.tipo_sangre || p.grupo_sanguineo),
      contacto_emergencia:txt(p.contacto_emergencia),
      telefono_emergencia:txt(p.telefono_emergencia),
      id_historia:txt(historia.id_historia || historia.id),
      fecha_apertura:txt(historia.fecha_apertura || historia.creado_en)
    };
  }

  /* ========================================================================
     LIMPIEZA CLÍNICA ESTRUCTURADA
  ======================================================================== */
  function limpiarObjetoClinico(valor, opciones={}, profundidad=0){
    if(profundidad > 6) return null;

    if(Array.isArray(valor)){
      const a = valor
        .map(x=>limpiarObjetoClinico(x,opciones,profundidad+1))
        .filter(x=>x !== null && x !== undefined && x !== '' && !(Array.isArray(x) && !x.length));
      return a.length ? a : null;
    }

    if(valor && typeof valor === 'object'){
      const salida = {};
      Object.entries(valor).forEach(([k,v])=>{
        if(esClaveTecnica(k)) return;
        if(opciones.excluirClaves && opciones.excluirClaves.some(rx=>rx.test(norm(k)))) return;
        const limpio = limpiarObjetoClinico(v,opciones,profundidad+1);
        if(limpio === null || limpio === undefined || limpio === '') return;
        if(Array.isArray(limpio) && !limpio.length) return;
        if(limpio && typeof limpio === 'object' && !Array.isArray(limpio) && !Object.keys(limpio).length) return;
        salida[k] = limpio;
      });
      return Object.keys(salida).length ? salida : null;
    }

    if(!valorClinico(valor,opciones)) return null;
    if(typeof valor === 'boolean') return valor === true ? 'Sí' : null;
    return valor;
  }

  function contenidoEstructurado(valor, opciones={}, profundidad=0){
    if(profundidad > 6) return '';

    const base = typeof valor === 'string' ? (()=>{
      const raw = txt(valor);
      const prefijo = raw.match(/^[A-Z0-9_\-]+::/);
      const limpio = prefijo ? raw.slice(prefijo[0].length) : raw;
      const p = parseJSON(limpio,null);
      return p === null ? limpio : p;
    })() : valor;

    const limpio = limpiarObjetoClinico(base,opciones,0);
    if(limpio === null || limpio === undefined || limpio === '') return '';

    if(Array.isArray(limpio)){
      const items = limpio.map(v=>contenidoEstructurado(v,opciones,profundidad+1)).filter(Boolean);
      return items.length ? `<ul class="aih-list">${items.map(x=>`<li>${x}</li>`).join('')}</ul>` : '';
    }

    if(limpio && typeof limpio === 'object'){
      const filas = Object.entries(limpio).map(([k,v])=>{
        if(v && typeof v === 'object'){
          const interno = contenidoEstructurado(v,opciones,profundidad+1);
          return interno ? `<div class="aih-kv aih-kv-block"><span>${esc(humanizar(k))}</span><div>${interno}</div></div>` : '';
        }
        return `<div class="aih-kv"><span>${esc(humanizar(k))}</span><b>${esc(v)}</b></div>`;
      }).filter(Boolean);
      return filas.length ? `<div class="aih-kv-grid">${filas.join('')}</div>` : '';
    }

    return esc(limpio).replace(/\n/g,'<br>');
  }

  function bloque(titulo, contenido, clase=''){
    const c = txt(contenido);
    if(!c) return '';
    return `<section class="aih-block ${clase}"><h3>${esc(titulo)}</h3><div class="aih-block-body">${c}</div></section>`;
  }

  function miniDatos(pares, opciones={}){
    const utiles = (pares || []).filter(item=>{
      const v = Array.isArray(item) ? item[1] : item?.valor;
      const o = Array.isArray(item) ? opciones : {...opciones,...(item?.opciones || {})};
      return valorClinico(v,o);
    });
    if(!utiles.length) return '';

    return `<div class="aih-mini-grid">${utiles.map(item=>{
      const l = Array.isArray(item) ? item[0] : item.label;
      const v = Array.isArray(item) ? item[1] : item.valor;
      return `<div class="aih-mini"><span>${esc(l)}</span><b>${esc(v)}</b></div>`;
    }).join('')}</div>`;
  }

  function ultimoRegistro(lista){
    return (lista || []).slice().sort((a,b)=>
      txt(b?.actualizado_en || b?.creado_en).localeCompare(txt(a?.actualizado_en || a?.creado_en))
    )[0] || null;
  }

  function contenidoEquivalente(a,b){
    const na = norm(a).replace(/[.;:,]+$/,'');
    const nb = norm(b).replace(/[.;:,]+$/,'');
    return !!na && !!nb && (na === nb || (na.length > 20 && nb.includes(na)) || (nb.length > 20 && na.includes(nb)));
  }

  /* ========================================================================
     ANTECEDENTES LONGITUDINALES
     Se intenta aprovechar los helpers premium ya existentes en antecedentes.js
     sin escribir en dicho módulo. Si no están disponibles, fallback local seguro.
  ======================================================================== */
  function itemsAntecedenteHTML(titulo, items, clase=''){
    const lista = Array.isArray(items) ? items : [];
    const normalizados = lista.map(item=>{
      if(typeof item === 'string') return {titulo:item,detalle:''};
      if(!item || typeof item !== 'object') return null;
      return {
        titulo:txt(item.titulo || item.nombre || item.label || item.patologia || item.alergia || item.medicamento || item.texto),
        detalle:txt(item.detalle || item.descripcion || item.valor || item.parentesco)
      };
    }).filter(x=>x && valorClinico(x.titulo));

    if(!normalizados.length) return '';

    /*
      V2.2 — MAQUETACIÓN DOCUMENTAL ADAPTATIVA / SOLO PRESENTACIÓN.
      No crea, elimina ni modifica antecedentes. La clase ancha solo permite
      que un antecedente narrativo use todo el renglón y evita huecos visuales.
    */
    return `<div class="aih-ant-group ${clase}"><h3>${esc(titulo)}</h3><div class="aih-ant-grid">${normalizados.map(x=>{
      const largo = `${txt(x.titulo)} ${txt(x.detalle)}`.length;
      const ancha = largo > 135 ? ' aih-ant-item-wide' : '';
      return `<div class="aih-ant-item${ancha}"><b>${esc(x.titulo)}</b>${valorClinico(x.detalle)?`<span>${esc(x.detalle)}</span>`:''}</div>`;
    }).join('')}</div></div>`;
  }

  function helperAntecedente(nombre){
    return typeof window[nombre] === 'function' ? window[nombre] : null;
  }

  function renderAntecedentes(historia){
    if(!historia) return '';
    const bloques = [];

    try{
      const extraer = helperAntecedente('auroExtraerItemsAntecedentePremium');
      if(extraer){
        const personales = txt(historia.antecedentes_personales);
        const gineco = txt(historia.antecedentes_gineco_obstetricos);
        const jsonPersonales = parseJSON(personales.replace(/^AUROSANAX_ANT_PERSONALES_V1::/i,''),null);
        const jsonGineco = parseJSON(gineco.replace(/^AUROSANAX_ANT_GINECO_OBS_V1::/i,''),null);

        const fuentePat = jsonPersonales?.patologicos ?? personales;
        bloques.push(itemsAntecedenteHTML('Patológicos personales', extraer(fuentePat,'patologia')));
        bloques.push(itemsAntecedenteHTML('Quirúrgicos', extraer(historia.antecedentes_quirurgicos || '','quirurgico')));
        bloques.push(itemsAntecedenteHTML('Alergias', extraer(historia.alergias || '','alergia'),'aih-ant-alert'));
        bloques.push(itemsAntecedenteHTML('Medicación actual', extraer(historia.medicacion_actual || '','medicacion')));
        bloques.push(itemsAntecedenteHTML('Familiares', extraer(historia.antecedentes_familiares || '','familiares')));

        if(jsonPersonales){
          const grupos = [
            ['COVID-19','auroResumenCovidItemsDesdeJson'],
            ['Vacunas registradas','auroResumenVacunasItemsDesdeJson'],
            ['Hábitos registrados','auroResumenHabitosItemsDesdeJson'],
            ['Actividad física registrada','auroResumenEstiloVidaItemsDesdeJson'],
            ['Alimentación','auroResumenAlimentacionItemsDesdeJson']
          ];
          grupos.forEach(([titulo,fn])=>{
            const h = helperAntecedente(fn);
            if(h) bloques.push(itemsAntecedenteHTML(titulo,h(jsonPersonales)));
          });
        }

        if(jsonGineco){
          const hObs = helperAntecedente('auroResumenObstetricosItemsDesdeJson');
          const hGin = helperAntecedente('auroResumenGinecologicosItemsDesdeJson');
          if(hObs) bloques.push(itemsAntecedenteHTML('Obstétricos',hObs(jsonGineco)));
          if(hGin) bloques.push(itemsAntecedenteHTML('Ginecológicos',hGin(jsonGineco)));
        }else{
          bloques.push(itemsAntecedenteHTML('Gineco-obstétricos',extraer(gineco,'gineco')));
        }
      }
    }catch(error){
      console.warn(MODULO,'No se pudieron usar helpers premium de Antecedentes; se usa fallback seguro.',error);
    }

    if(!bloques.filter(Boolean).length){
      const pares = [
        ['Antecedentes personales',historia.antecedentes_personales],
        ['Antecedentes quirúrgicos',historia.antecedentes_quirurgicos],
        ['Alergias',historia.alergias],
        ['Antecedentes gineco-obstétricos',historia.antecedentes_gineco_obstetricos],
        ['Medicación actual',historia.medicacion_actual],
        ['Antecedentes familiares',historia.antecedentes_familiares]
      ];
      pares.forEach(([titulo,v])=>{
        const c = contenidoEstructurado(v,{});
        if(c) bloques.push(bloque(titulo,c,norm(titulo).includes('alerg')?'aih-danger':''));
      });
    }

    const html = bloques.filter(Boolean).join('');
    return html ? `<section class="aih-major"><h2>Antecedentes clínicos longitudinales</h2>${html}</section>` : '';
  }

  /* ========================================================================
     ANAMNESIS - solo contenido clínico persistido
  ======================================================================== */
  function controlesAnamnesisPares(controles){
    const salida = [];
    Object.entries(controles || {}).forEach(([clave,dato])=>{
      if(!dato || typeof dato !== 'object') return;
      if(dato.cabecera_contexto === true) return;
      const tipo = norm(dato.tipo);
      if((tipo === 'checkbox' || tipo === 'radio') && dato.checked !== true) return;

      let valor = txt(dato.valor);
      if((tipo === 'checkbox' || tipo === 'radio') && (!valor || norm(valor) === 'on')) valor = 'Sí';
      if(!valorClinico(valor)) return;

      salida.push([humanizar(clave),valor]);
    });
    return salida;
  }

  function respuestasAnamnesisPares(respuestas, motivo, enfermedad){
    const limpio = limpiarObjetoClinico(respuestas,{
      excluirClaves:[/^_modo_captura$/, /motivo/, /enfermedad/, /plantilla/]
    });
    if(!limpio || typeof limpio !== 'object' || Array.isArray(limpio)) return [];

    return Object.entries(limpio).flatMap(([k,v])=>{
      if(v && typeof v === 'object') return [];
      const valor = txt(v);
      if(!valorClinico(valor)) return [];
      if(contenidoEquivalente(valor,motivo) || contenidoEquivalente(valor,enfermedad)) return [];
      if(norm(enfermedad).includes(norm(valor)) && norm(valor).length > 3) return [];
      return [[humanizar(k),valor]];
    });
  }

  function paresClinicosHTML(pares){
    const vistos = new Set();
    const utiles = [];
    (pares || []).forEach(([label,v])=>{
      if(!valorClinico(v)) return;
      const clave = `${norm(label)}||${norm(v)}`;
      if(vistos.has(clave)) return;
      vistos.add(clave);
      utiles.push([label,v]);
    });
    if(!utiles.length) return '';
    return `<div class="aih-lines">${utiles.map(([l,v])=>
      `<div class="aih-line"><span>${esc(l)}</span><div>${esc(v).replace(/\n/g,'<br>')}</div></div>`
    ).join('')}</div>`;
  }

  function renderAnamnesis(r){
    if(!r) return '';
    const partes = [];
    const motivo = txt(r.motivo_consulta);
    const enfermedad = txt(r.enfermedad_actual);
    const narrativa = txt(r.narrativa_generada);

    if(valorClinico(motivo)) partes.push(bloque('Motivo de consulta',esc(motivo).replace(/\n/g,'<br>')));
    if(valorClinico(enfermedad)) partes.push(bloque('Enfermedad actual',esc(enfermedad).replace(/\n/g,'<br>')));
    else if(valorClinico(narrativa)) partes.push(bloque('Enfermedad actual',esc(narrativa).replace(/\n/g,'<br>')));

    const respuestas = respuestasAnamnesisPares(parseJSON(r.respuestas_json,{}) || {},motivo,enfermedad || narrativa);
    const controles = controlesAnamnesisPares(parseJSON(r.controles_json,{}) || {});
    const extras = [...respuestas,...controles].filter(([,v])=>{
      if(contenidoEquivalente(v,motivo) || contenidoEquivalente(v,enfermedad) || contenidoEquivalente(v,narrativa)) return false;
      return true;
    });
    const extraHtml = paresClinicosHTML(extras);
    if(extraHtml) partes.push(bloque('Datos complementarios de anamnesis',extraHtml));

    return partes.length ? `<section class="aih-module"><h3 class="aih-module-title">Anamnesis</h3>${partes.join('')}</section>` : '';
  }

  /* ========================================================================
     SIGNOS VITALES - fusión campo por campo Examen > Preatención
  ======================================================================== */
  function vital(r, claves, opciones={}){
    for(const k of claves){
      const v = r?.[k];
      if(valorClinico(v,opciones)) return txt(v);
    }
    return '';
  }

  function signosVitales(examen, preatencionLista){
    const pre = ultimoRegistro(preatencionLista) || {};
    const ex = examen || {};
    const elegir = (claves,o={}) => vital(ex,claves,o) || vital(pre,claves,o);

    return [
      ['Peso',elegir(['peso_kg','peso'])],
      ['Talla',elegir(['talla_cm','talla'])],
      ['IMC',elegir(['imc'])],
      ['Presión arterial',elegir(['presion_arterial','pa'])],
      ['Frecuencia cardíaca',elegir(['frecuencia_cardiaca','fc'])],
      ['Frecuencia respiratoria',elegir(['frecuencia_respiratoria','fr'])],
      ['Temperatura',elegir(['temperatura'])],
      ['Saturación',elegir(['saturacion','spo2'])]
    ].filter(([,v])=>valorClinico(v));
  }

  function renderExamen(examen, preatencionLista){
    const partes = [];
    const vitales = signosVitales(examen,preatencionLista);
    if(vitales.length) partes.push(bloque('Signos vitales',miniDatos(vitales)));

    if(examen){
      const general = primer(examen.examen_fisico, examen.examen_general, examen.hallazgos_generales, examen.observaciones_examen);
      const sistemas = primer(examen.examenes_sistemas, examen.sistemas, examen.sistemas_json, examen.revision_sistemas_json, examen.revision_sistemas);
      const regional = primer(examen.examenes_regionales, examen.regionales, examen.regional_json, examen.examen_regional);

      const cGeneral = contenidoEstructurado(general,{});
      const cSistemas = contenidoEstructurado(sistemas,{excluirClaves:[/no_valorado/,/estado/]});
      const cRegional = contenidoEstructurado(regional,{excluirClaves:[/no_valorado/,/estado/]});

      if(cGeneral) partes.push(bloque('Examen físico',cGeneral));
      if(cSistemas && !contenidoEquivalente(txt(sistemas),txt(general))) partes.push(bloque('Examen por sistemas',cSistemas));
      if(cRegional && !contenidoEquivalente(txt(regional),txt(general))) partes.push(bloque('Examen regional',cRegional));
    }

    return partes.length ? `<section class="aih-module"><h3 class="aih-module-title">Examen físico</h3>${partes.join('')}</section>` : '';
  }

  /* ========================================================================
     OBSTETRICIA - política estricta anti-placeholder
  ======================================================================== */
  function renderObstetricia(lista){
    const r = ultimoRegistro(lista);
    if(!r) return '';

    const o = {obstetricia:true,ceroVacio:true};
    const cab = miniDatos([
      {label:'FUM',valor:fechaVista(r.fum || r.fur),opciones:o},
      {label:'FPP',valor:fechaVista(r.fpp),opciones:o},
      {label:'Edad gestacional',valor:[
        valorClinico(r.edad_gestacional_semanas,o) ? `${txt(r.edad_gestacional_semanas)} sem` : '',
        valorClinico(r.edad_gestacional_dias,o) ? `${txt(r.edad_gestacional_dias)} días` : ''
      ].filter(Boolean).join(' + '),opciones:o},
      {label:'Peso materno',valor:r.peso_materno,opciones:o},
      {label:'Presión arterial',valor:r.presion_arterial,opciones:o},
      {label:'Altura uterina',valor:r.altura_uterina,opciones:o},
      {label:'FCF',valor:r.frecuencia_cardiaca_fetal,opciones:o},
      {label:'Riesgo obstétrico',valor:r.riesgo_obstetrico,opciones:o},
      {label:'Próximo control',valor:fechaVista(r.proximo_control),opciones:o}
    ],o);

    const extras = [
      ['Embarazo actual',r.embarazo_actual_json],
      ['Síntomas obstétricos',r.sintomas_obstetricos_json],
      ['Evaluación obstétrica',r.evaluacion_obstetrica_json],
      ['Impresión obstétrica',r.impresion_obstetrica],
      ['Observaciones',r.observaciones]
    ].map(([titulo,v])=>{
      const c = contenidoEstructurado(v,{obstetricia:true,ceroVacio:true,excluirClaves:[/estado/,/clasific/]});
      return c ? bloque(titulo,c) : '';
    }).filter(Boolean).join('');

    if(!cab && !extras) return '';
    return `<section class="aih-module aih-special"><h3 class="aih-module-title">Obstetricia</h3>${cab}${extras}</section>`;
  }

  function renderGinecologia(lista){
    const r = ultimoRegistro(lista);
    if(!r) return '';
    const partes = [];

    if(valorClinico(r.fum_actual)) partes.push(miniDatos([['FUM actual',fechaVista(r.fum_actual)]]));
    [
      ['Motivo ginecológico',r.motivo_ginecologico],
      ['Síntomas ginecológicos',r.sintomas_json],
      ['Examen ginecológico',r.examen_ginecologico_json],
      ['Estudios ginecológicos',r.estudios_ginecologicos_json],
      ['Impresión ginecológica',r.impresion_ginecologica],
      ['Observaciones ginecológicas',r.observaciones]
    ].forEach(([titulo,v])=>{
      const c = contenidoEstructurado(v,{excluirClaves:[/estado/,/interno/]});
      if(c) partes.push(bloque(titulo,c));
    });

    return partes.length ? `<section class="aih-module aih-special"><h3 class="aih-module-title">Ginecología</h3>${partes.join('')}</section>` : '';
  }

  function renderEstetica(lista, opciones={}){
    const registros = (lista || []).filter(r=>{
      if(!r || typeof r !== 'object') return false;
      const e = norm(r?.estado || r?.estado_registro);
      if(/(anulad|cancelad|eliminad|inactiv)/.test(e)) return false;

      const cab = [r.zona_tratamiento,r.procedimiento_sugerido,r.plan_sesiones]
        .some(v=>valorClinico(v));
      const evalClinica = contenidoEstructurado(r.evaluacion_clinica,{excluirClaves:[/estado/,/interno/]});
      return cab || !!evalClinica;
    }).slice().sort((a,b)=>{
      const fa = fechaISO(a?.fecha || a?.fecha_atencion || a?.fecha_registro || a?.creado_en);
      const fb = fechaISO(b?.fecha || b?.fecha_atencion || b?.fecha_registro || b?.creado_en);
      if(fa && fb && fa !== fb) return fa.localeCompare(fb);
      return txt(a?.creado_en || a?.actualizado_en).localeCompare(txt(b?.creado_en || b?.actualizado_en));
    });

    if(!registros.length) return '';

    const items = registros.map((r,idx)=>{
      const fecha = opciones.mostrarFecha === true
        ? fechaVista(r.fecha || r.fecha_atencion || r.fecha_registro || r.creado_en)
        : '';
      const cab = miniDatos([
        ['Fecha',fecha],
        ['Área',r.zona_tratamiento],
        ['Procedimiento sugerido',r.procedimiento_sugerido],
        ['Plan de sesiones',r.plan_sesiones]
      ]);
      const evalClinica = contenidoEstructurado(r.evaluacion_clinica,{excluirClaves:[/estado/,/interno/]});
      if(!cab && !evalClinica) return '';

      const tituloRegistro = registros.length > 1
        ? `<h4 class="aih-record-title">Registro ${idx+1}</h4>`
        : '';

      return `<div class="aih-record">${tituloRegistro}${cab}${evalClinica?bloque('Evaluación clínica',evalClinica):''}</div>`;
    }).filter(Boolean).join('');

    return items
      ? `<section class="aih-module aih-special"><h3 class="aih-module-title">Evaluación estética funcional</h3>${items}</section>`
      : '';
  }

  function renderDiagnosticos(lista){
    const validos = (lista || []).filter(d=>{
      const e = norm(d?.estado || d?.estado_registro);
      if(/(anulad|eliminad|inactiv|cancelad)/.test(e)) return false;
      return [d?.codigo_cie10,d?.cie10,d?.codigo,d?.diagnostico,d?.descripcion,d?.nombre,d?.nombre_diagnostico]
        .some(v=>valorClinico(v));
    });
    if(!validos.length) return '';

    const html = validos.map(d=>{
      const codigo = txt(d.codigo_cie10 || d.cie10 || d.codigo);
      const descripcion = txt(d.diagnostico || d.descripcion || d.nombre || d.nombre_diagnostico);
      const principalRaw = d.principal !== undefined ? d.principal : d.es_principal;
      const principal = principalRaw === true || ['si','sí','true','1'].includes(norm(principalRaw)) ? 'Principal' : '';
      const tipo = valorClinico(d.tipo_diagnostico || d.tipo || d.clasificacion)
        ? txt(d.tipo_diagnostico || d.tipo || d.clasificacion)
        : '';
      const titulo = [codigo,descripcion].filter(valorClinico).join(' — ');
      if(!titulo) return '';
      const meta = [principal,tipo].filter(valorClinico);
      return `<div class="aih-dx"><b>${esc(titulo)}</b>${meta.length?`<small>${esc(meta.join(' · '))}</small>`:''}</div>`;
    }).filter(Boolean).join('');

    return html ? `<section class="aih-module"><h3 class="aih-module-title">Diagnósticos</h3><div class="aih-dx-list">${html}</div></section>` : '';
  }

  function renderPlan(p){
    if(!p) return '';
    const partes = [];
    const opcionesPlan = {
      excluirClaves:[/en_plan/,/en plan/,/flag/,/estado/,/aplicado/,/seleccionado/,/interno/]
    };

    const campos = [
      ['Plan terapéutico',primer(p.plan_tratamiento,p.plan_terapeutico)],
      ['Medicamentos indicados en Plan',primer(p.medicamentos_json,p.medicamentos,p.receta_medica,p.receta_medicamentos)],
      ['Exámenes / órdenes solicitadas',primer(p.ordenes_json,p.ordenes_medicas,p.examenes_solicitados)],
      ['Interconsultas',primer(p.interconsulta_json,p.interconsulta,p.interconsultas_json)],
      ['Evaluaciones',primer(p.evaluaciones_json,p.evaluaciones)],
      ['Indicaciones para el paciente',primer(p.indicaciones_paciente,p.indicaciones)]
    ];

    const vistos = [];
    campos.forEach(([titulo,v])=>{
      const c = contenidoEstructurado(v,opcionesPlan);
      if(!c) return;
      const comparable = norm(txt(v));
      if(comparable && vistos.some(x=>x === comparable)) return;
      if(comparable) vistos.push(comparable);
      partes.push(bloque(titulo,c));
    });

    if(valorClinico(p.proximo_control || p.control)){
      partes.push(bloque('Próximo control',esc(fechaVista(p.proximo_control || p.control))));
    }

    return partes.length ? `<section class="aih-module"><h3 class="aih-module-title">Plan terapéutico</h3>${partes.join('')}</section>` : '';
  }

  function parseMedicamentos(v){
    const parsed = parseJSON(v,null);
    if(Array.isArray(parsed)) return parsed;
    if(parsed && typeof parsed === 'object') return [parsed];
    const raw = txt(v);
    if(!valorClinico(raw)) return [];
    return raw.split(/\n+/)
      .map(x=>txt(x).replace(/^\s*\d+\.\s*/,''))
      .filter(valorClinico)
      .map(texto=>({texto}));
  }

  function renderRecetas(lista){
    const validas = (lista || []).filter(r=>{
      const e = norm(r?.estado || r?.estado_receta);
      if(/(anulad|cancelad|eliminad)/.test(e)) return false;
      const meds = parseMedicamentos(r?.medicamento || r?.medicamentos || r?.receta_medica);
      return meds.length > 0;
    });
    if(!validas.length) return '';

    const recetasHtml = validas.map((r,idx)=>{
      const meds = parseMedicamentos(r.medicamento || r.medicamentos || r.receta_medica);
      const cuerpo = meds.map((m,i)=>{
        if(typeof m === 'string') return `<div class="aih-med"><b>${i+1}. ${esc(m)}</b></div>`;
        if(m.texto) return `<div class="aih-med"><b>${i+1}. ${esc(m.texto)}</b></div>`;

        const nombre = txt(m.med || m.medicamento || m.nombre);
        const presentacion = txt(m.pres || m.presentacion);
        if(!valorClinico(nombre) && !valorClinico(presentacion)) return '';

        const detalle = [
          valorClinico(m.via) ? `Vía: ${txt(m.via)}` : '',
          valorClinico(m.cantidad) ? `Cantidad: ${txt(m.cantidad)}` : '',
          valorClinico(m.frec || m.frecuencia) ? `Frecuencia: ${txt(m.frec || m.frecuencia)}` : '',
          valorClinico(m.dur || m.duracion) ? `Duración: ${txt(m.dur || m.duracion)}` : '',
          valorClinico(m.ind || m.indicaciones) ? `Indicaciones: ${txt(m.ind || m.indicaciones)}` : '',
          ['si','sí','true','1'].includes(norm(m.continuo)) ? 'Tratamiento continuo' : ''
        ].filter(Boolean).join(' · ');

        return `<div class="aih-med"><b>${i+1}. ${esc([nombre,presentacion].filter(valorClinico).join(' '))}</b>${detalle?`<small>${esc(detalle)}</small>`:''}</div>`;
      }).filter(Boolean).join('');

      if(!cuerpo) return '';
      const extra = miniDatos([
        ['Fecha de emisión',fechaVista(r.fecha_receta || r.fecha_emision || r.creado_en)],
        ['Profesional',r.nombre_medico || r.medico_nombre]
      ]);
      return `<div class="aih-recipe"><h4>${esc(validas.length>1 ? `Receta ${idx+1}` : 'Receta médica')}</h4>${extra}<div class="aih-med-list">${cuerpo}</div></div>`;
    }).filter(Boolean).join('');

    return recetasHtml ? `<section class="aih-module"><h3 class="aih-module-title">Recetas asociadas</h3>${recetasHtml}</section>` : '';
  }

  function renderRecomendaciones(r){
    if(!r) return '';
    const detalle = parseJSON(r.detalle_json,{}) || {};
    const partes = [];

    const campos = [
      ['Recomendaciones',primer(detalle.recomendaciones_generales,detalle.recomendaciones,r.recomendaciones_generales,r.recomendaciones,r.detalle)],
      ['Cuidados',primer(detalle.cuidados,detalle.cuidados_generales,detalle.dieta,r.cuidados)],
      ['Signos de alarma',primer(detalle.signos_alarma,detalle.alertas,r.signos_alarma),'aih-danger'],
      ['Signos de posible infección',primer(detalle.signos_infeccion,detalle.infeccion,r.signos_infeccion),'aih-danger'],
      ['Seguimiento recomendado',primer(detalle.seguimiento,r.seguimiento,r.proximo_control)]
    ];

    campos.forEach(([titulo,v,clase])=>{
      const c = contenidoEstructurado(v,{excluirClaves:[/estado/,/interno/]});
      if(c) partes.push(bloque(titulo,c,clase || ''));
    });

    return partes.length ? `<section class="aih-module"><h3 class="aih-module-title">Recomendaciones</h3>${partes.join('')}</section>` : '';
  }

  function renderCertificados(lista){
    const validos = (lista || []).filter(r=>{
      if(/(anulad|cancelad|eliminad)/.test(norm(r?.estado))) return false;
      const d = parseJSON(r?.detalle_json,{}) || {};
      return [r?.tipo_certificado,d?.tipo_certificado,r?.motivo,d?.dias_reposo,r?.dias_reposo]
        .some(v=>valorClinico(v));
    });
    if(!validos.length) return '';

    const items = validos.map(r=>{
      const d = parseJSON(r.detalle_json,{}) || {};
      const titulo = primer(r.tipo_certificado,d.tipo_certificado,r.motivo);
      if(!valorClinico(titulo)) return '';
      const meta = [
        fechaVista(r.fecha_emision || r.fecha_certificado || r.creado_en),
        valorClinico(d.dias_reposo || r.dias_reposo) ? `${txt(d.dias_reposo || r.dias_reposo)} día(s) de reposo` : ''
      ].filter(valorClinico).join(' · ');
      return `<li><b>${esc(titulo)}</b>${meta?`<small>${esc(meta)}</small>`:''}</li>`;
    }).filter(Boolean).join('');

    return items ? `<section class="aih-module"><h3 class="aih-module-title">Certificados emitidos</h3><ul class="aih-list aih-doc-list">${items}</ul></section>` : '';
  }

  function renderDocumentos(lista){
    const validos = (lista || []).filter(r=>
      !/(anulad|cancelad|eliminad)/.test(norm(r?.estado || r?.estado_documento)) &&
      [r?.nombre_documento,r?.archivo_nombre,r?.nombre_archivo,r?.titulo,r?.categoria,r?.tipo_documento].some(v=>valorClinico(v))
    );
    if(!validos.length) return '';

    const items = validos.map(r=>{
      const nombre = primer(r.nombre_documento,r.archivo_nombre,r.nombre_archivo,r.titulo,r.categoria);
      if(!valorClinico(nombre)) return '';
      const meta = [
        primer(r.categoria,r.tipo_documento),
        fechaVista(r.fecha_documento || r.fecha_atencion || r.creado_en)
      ].filter(valorClinico).join(' · ');
      return `<li><b>${esc(nombre)}</b>${meta?`<small>${esc(meta)}</small>`:''}</li>`;
    }).filter(Boolean).join('');

    return items ? `<section class="aih-module"><h3 class="aih-module-title">Documentos clínicos asociados</h3><ul class="aih-list aih-doc-list">${items}</ul></section>` : '';
  }

  /* ========================================================================
     ATENCIÓN - no se inventa texto cuando no existe contenido clínico
  ======================================================================== */
  function renderAtencion(d, numero, medicos){
    const a = d.atencion || {};
    const medico = medicoDeAtencion(a,medicos);
    const fecha = fechaVista(a.fecha_atencion || a.fecha_consulta || a.fecha);
    const hora = horaVista(a.hora_atencion || a.hora_consulta || a.hora);

    const contenido = [
      renderAnamnesis(d.anamnesis),
      renderExamen(d.examen,d.preatencion),
      renderObstetricia(d.obstetricia),
      renderGinecologia(d.ginecologia),
      renderEstetica(d.estetica),
      renderDiagnosticos(d.diagnosticos),
      renderPlan(d.plan),
      renderRecetas(d.recetas),
      renderRecomendaciones(d.recomendaciones),
      renderCertificados(d.certificados),
      renderDocumentos(d.documentos)
    ].filter(Boolean).join('');

    if(!contenido){
      state.excluidos.atencionesSinContenido += 1;
      return '';
    }

    /* Fecha y hora permanecen en la cabecera documental; no se duplican abajo. */
    const cabecera = miniDatos([
      ['Tipo de atención',a.tipo_atencion || a.tipo],
      ['Especialidad',medico.especialidad],
      ['Profesional',medico.nombre],
      ['Estado',a.estado_atencion || a.estado]
    ]);

    return `<article class="aih-attention">
      <div class="aih-attention-head">
        <div class="aih-attention-index">${esc(a.numero_consulta || a.consulta || numero)}</div>
        <div class="aih-attention-title">
          <span class="aih-attention-kicker">Atención clínica · Consulta N.º ${esc(a.numero_consulta || a.consulta || numero)}</span>
          <h2>${esc(fecha || 'Atención clínica')}${hora?` <small>· ${esc(hora)}</small>`:''}</h2>
        </div>
      </div>
      ${cabecera}
      ${contenido}
    </article>`;
  }

  /* ========================================================================
     EVOLUTIVOS / ASOCIADOS
  ======================================================================== */
  function renderBioimpedancia(lista){
    const registros = (lista || []).filter(r=>{
      return [r?.peso_kg,r?.peso,r?.imc,r?.porcentaje_grasa,r?.grasa_corporal,r?.masa_muscular,r?.musculo,r?.porcentaje_agua,r?.agua_corporal]
        .some(v=>valorClinico(v));
    }).sort((a,b)=>fechaISO(a.fecha||a.fecha_registro||a.creado_en).localeCompare(fechaISO(b.fecha||b.fecha_registro||b.creado_en)));

    if(!registros.length) return '';

    const columnas = [
      ['Peso',r=>primer(r.peso_kg,r.peso)],
      ['IMC',r=>r.imc],
      ['Grasa corporal',r=>primer(r.porcentaje_grasa,r.grasa_corporal)],
      ['Masa muscular',r=>primer(r.masa_muscular,r.musculo)],
      ['Agua',r=>primer(r.porcentaje_agua,r.agua_corporal)]
    ].filter(([,fn])=>registros.some(r=>valorClinico(fn(r))));

    const filas = registros.map(r=>{
      const f = fechaVista(r.fecha || r.fecha_registro || r.creado_en);
      return `<tr><td>${esc(f)}</td>${columnas.map(([,fn])=>`<td>${esc(valorClinico(fn(r))?fn(r):'')}</td>`).join('')}</tr>`;
    }).join('');

    return `<section class="aih-major"><h2>Evolución corporal / Bioimpedancia</h2><div class="aih-table-wrap"><table class="aih-table"><thead><tr><th>Fecha</th>${columnas.map(([t])=>`<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div></section>`;
  }

  function resumenAsociados(titulo, lista, campos){
    const items = (lista || []).map(r=>{
      const nombre = primer(...campos.map(k=>r?.[k]));
      if(!valorClinico(nombre)) return '';
      const meta = [
        fechaVista(r.fecha || r.fecha_atencion || r.fecha_procedimiento || r.creado_en),
        valorClinico(r.estado) && !/^(activo|registrado)$/i.test(txt(r.estado)) ? r.estado : ''
      ].filter(valorClinico).join(' · ');
      return `<li><b>${esc(nombre)}</b>${meta?`<small>${esc(meta)}</small>`:''}</li>`;
    }).filter(Boolean).join('');

    return items ? `<section class="aih-major"><h2>${esc(titulo)}</h2><ul class="aih-list aih-doc-list">${items}</ul></section>` : '';
  }

  function renderRegistrosSinAtencion(globales){
    const s = globales?.sinAtencion || {};
    const partes = [];

    const vitales = signosVitales(null,s.preatenciones || []);
    const pre = vitales.length
      ? `<section class="aih-module"><h3 class="aih-module-title">Signos vitales no vinculados a una atención</h3>${miniDatos(vitales)}</section>`
      : '';
    const obs = renderObstetricia(s.obstetricia || []);
    const gin = renderGinecologia(s.ginecologia || []);
    const est = renderEstetica(s.estetica || [],{mostrarFecha:true});
    const rec = renderRecetas(s.recetas || []);

    [pre,obs,gin,est,rec].filter(Boolean).forEach(x=>partes.push(x));
    if(!partes.length) return '';

    return `<section class="aih-major aih-associated"><h2>Otros registros clínicos del paciente</h2><p class="aih-associated-note">Registros clínicos del expediente que pertenecen al paciente, pero no están vinculados a una atención específica. Se presentan por separado y no se atribuyen a ninguna consulta.</p>${partes.join('')}</section>`;
  }

  function renderEvolutivos(globales){
    const secciones = [];
    const bio = renderBioimpedancia(globales.bioimpedancia);
    if(bio) secciones.push(bio);

    const proc = resumenAsociados('Procedimientos asociados',globales.procedimientos,['nombre_procedimiento','procedimiento','tipo_procedimiento']);
    const seg = resumenAsociados('Seguimientos asociados',globales.seguimientos,['tipo_seguimiento','motivo','mensaje']);
    const cons = resumenAsociados('Consentimientos asociados',globales.consentimientos,['tipo_consentimiento','nombre_consentimiento','procedimiento']);
    [proc,seg,cons].filter(Boolean).forEach(x=>secciones.push(x));

    return secciones.join('');
  }

  /* ========================================================================
     VALIDACIÓN GOLD STANDARD
  ======================================================================== */
  function validarModelo(modelo){
    const idsCrudos = modelo.atenciones.map(x=>txt(x.atencion?.id_atencion));
    const idsPresentes = idsCrudos.filter(Boolean);
    const unicos = new Set(idsPresentes);
    const problemas = [];
    const advertencias = [];
    /*
      V2.4: se conserva el campo por compatibilidad del diagnóstico público,
      pero ya no se exige un profesional institucional fijo para emitir el
      resumen histórico. El profesional clínico sigue perteneciendo a cada
      atención mediante su id_medico.
    */
    const faltantesDocumentales = [];

    if(!modelo.paciente?.id_paciente) problemas.push('Falta id_paciente del paciente.');
    if(idsCrudos.some(x=>!x)) problemas.push('Existe una atención sin id_atencion.');
    if(idsPresentes.length !== unicos.size) problemas.push('Existen id_atencion duplicados.');

    const fallosCriticos = Object.entries(state.fuentes)
      .filter(([,f])=>f?.critica === true && f?.ok !== true)
      .map(([clave,f])=>`${clave}: ${f?.error || 'fuente no verificada'}`);

    const respaldosLocales = Object.entries(state.fuentes)
      .filter(([,f])=>f?.respaldo_local === true)
      .map(([clave])=>clave);

    /*
      Los contadores técnicos permanecen disponibles en diagnostico().
      No se convierten en alertas clínicas visibles porque "sin pertenencia"
      puede corresponder legítimamente a filas de otros pacientes recibidas en
      colecciones globales, y "sin atención" puede ser un registro histórico
      válido que no debe atribuirse artificialmente a una consulta.
    */

    let estado = 'VALIDADO';
    if(problemas.length) estado = 'ERROR_INTEGRIDAD';
    else if(fallosCriticos.length || respaldosLocales.length) estado = 'INCOMPLETO';

    return {
      estado,
      valido:estado === 'VALIDADO',
      pdfPermitido:estado === 'VALIDADO',
      problemas,
      advertencias,
      fallosCriticos,
      respaldosLocales,
      faltantesDocumentales,
      resumen:{
        atenciones:modelo.atenciones.length,
        ids_unicos:unicos.size,
        diagnosticos:modelo.atenciones.reduce((n,x)=>n+(x.diagnosticos?.length||0),0),
        recetas:modelo.atenciones.reduce((n,x)=>n+(x.recetas?.length||0),0),
        documentos:modelo.atenciones.reduce((n,x)=>n+(x.documentos?.length||0),0),
        obstetricia:modelo.atenciones.reduce((n,x)=>n+(x.obstetricia?.length||0),0),
        fuentes_no_verificadas:fallosCriticos.length,
        respaldos_locales:respaldosLocales.length,
        faltantes_documentales:0
      }
    };
  }

  /* ========================================================================
     CONSTRUCCIÓN DOCUMENTAL PREMIUM / PERFIL LEGAL BAJO
  ======================================================================== */
  function ahoraGuayaquil(){
    return new Intl.DateTimeFormat('es-EC',{
      timeZone:'America/Guayaquil',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
    }).format(new Date());
  }

  function construirDocumento(modelo){
    const inst = modelo.institucion;
    const p = modelo.paciente;
    const generado = ahoraGuayaquil();

    state.excluidos.atencionesSinContenido = 0;
    let numeroVisible = 0;
    const fechasVisibles = [];
    const atencionesHtml = modelo.atenciones.map(d=>{
      const html = renderAtencion(d,numeroVisible+1,modelo.medicos);
      if(html){
        numeroVisible += 1;
        const rawFecha = d?.atencion?.fecha_atencion || d?.atencion?.fecha_consulta || d?.atencion?.fecha;
        const iso = fechaISO(rawFecha);
        const vista = fechaVista(rawFecha);
        if(iso && vista) fechasVisibles.push({iso,vista});
      }
      return html;
    }).filter(Boolean).join('');

    const fechasOrdenadas = fechasVisibles.slice().sort((a,b)=>a.iso.localeCompare(b.iso));
    const periodo = !fechasOrdenadas.length
      ? ''
      : fechasOrdenadas.length === 1
        ? fechasOrdenadas[0].vista
        : `${fechasOrdenadas[0].vista} – ${fechasOrdenadas[fechasOrdenadas.length-1].vista}`;

    const cabPaciente = miniDatos([
      ['Documento',p.documento],
      ['Fecha de nacimiento',fechaVista(p.fecha_nacimiento)],
      ['Edad',p.edad],
      ['Sexo',p.sexo],
      ['Historia clínica',p.id_historia],
      ['Teléfono',p.telefono],
      ['Correo',p.correo]
    ]);

    const resumenDocumento = miniDatos([
      ['Periodo documentado',periodo],
      ['Atenciones incluidas',numeroVisible ? String(numeroVisible) : ''],
      ['Fecha de emisión',generado]
    ]);

    const nota = `El presente Informe Clínico Histórico constituye un resumen longitudinal generado a partir de los registros clínicos persistidos disponibles en el expediente electrónico al momento de su emisión. La información se presenta respetando su asociación con las atenciones y documentos clínicos fuente correspondientes. Este resumen no sustituye los registros originales que integran la Historia Clínica.`;

    return `<div class="aih-doc">
      <div class="aih-topline">
        <div class="aih-confidential">CONFIDENCIAL</div>
        <div class="aih-doc-code">Informe clínico longitudinal · HISTÓRICO V2.4</div>
      </div>

      <header class="aih-header">
        <div class="aih-legal">
          <h1>Informe clínico longitudinal</h1>
          <p>Expediente clínico consolidado</p>
          ${valorClinico(inst.razon_social)?`<small>${esc(inst.razon_social)}${valorClinico(inst.ruc)?` · RUC ${esc(inst.ruc)}`:''}</small>`:(valorClinico(inst.ruc)?`<small>RUC ${esc(inst.ruc)}</small>`:'')}
        </div>
        <div class="aih-brand">
          ${inst.logo ? `<img src="${esc(inst.logo)}" alt="">` : ''}
          <div><b>${esc(inst.nombre_comercial)}</b>${valorClinico(inst.subtitulo)?`<span>${esc(inst.subtitulo)}</span>`:''}</div>
        </div>
      </header>

      <div class="aih-document-title">
        <span>Documento clínico confidencial</span>
        <h2>INFORME CLÍNICO HISTÓRICO</h2>
        <p>Resumen longitudinal del expediente clínico</p>
      </div>

      <section class="aih-patient">
        <div class="aih-patient-name"><span>Paciente</span><h2>${esc(p.nombre || 'Paciente')}</h2></div>
        ${cabPaciente}
      </section>

      ${resumenDocumento ? `<section class="aih-document-summary">${resumenDocumento}</section>` : ''}

      ${renderAntecedentes(modelo.historia)}

      ${atencionesHtml ? `<section class="aih-major aih-timeline"><div class="aih-major-heading"><span>Curso clínico</span><h2>Historial cronológico de atenciones</h2></div>${atencionesHtml}</section>` : ''}
      ${renderRegistrosSinAtencion(modelo.globales)}
      ${renderEvolutivos(modelo.globales)}

      <section class="aih-note"><b>Nota documental</b><p>${esc(nota)}</p></section>

      <footer class="aih-footer-doc">
        <div>
          <b>${esc(inst.nombre_comercial)}</b>
          ${valorClinico(inst.direccion)?`<span>${esc(inst.direccion)}</span>`:''}
          ${valorClinico(inst.telefono)?`<span>${esc(inst.telefono)}</span>`:''}
        </div>
        <div>
          <span>Emitido: ${esc(generado)}</span>
          <span>Atenciones con contenido clínico incluidas: ${numeroVisible}</span>
          <span>Versión documental: HISTORICO_V2.4</span>
        </div>
      </footer>

      <div class="aih-running-footer">${esc(p.nombre || '')}${valorClinico(p.id_historia)?` · HC ${esc(p.id_historia)}`:''} · Documento clínico confidencial</div>
    </div>`;
  }

  /* ========================================================================
     CSS DOCUMENTAL PREMIUM, LIMPIO Y A4
  ======================================================================== */
  function cssDocumento(){
    return `
      :root{--aih-primary:#7a174f;--aih-primary-2:#a52a6a;--aih-primary-soft:#fbf6f9;--aih-text:#18212f;--aih-muted:#687386;--aih-line:#dfe4ea;--aih-line-soft:#edf0f3;--aih-danger:#9f1239;--aih-paper:#fff}
      *{box-sizing:border-box}
      html{background:#e9edf2}
      body{margin:0;background:#e9edf2;color:var(--aih-text);font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .aih-doc{width:210mm;min-height:297mm;margin:18px auto;background:var(--aih-paper);padding:10mm 12mm 15mm;box-shadow:0 12px 38px rgba(15,23,42,.13);position:relative;font-size:10px;line-height:1.42}

      .aih-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}
      .aih-confidential{display:inline-flex;align-items:center;border:1px solid #b4233c;color:#9f1239;font-size:7.5px;font-weight:900;letter-spacing:.16em;padding:3px 7px;border-radius:4px}
      .aih-doc-code{font-size:7.4px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;font-weight:800;text-align:right}

      .aih-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-top:2px solid var(--aih-primary);border-bottom:1px solid var(--aih-line);padding:9px 0 8px}
      .aih-legal{min-width:0;flex:1 1 auto}.aih-legal h1{font-size:15.5px;margin:0;color:#111827;line-height:1.15}.aih-legal p{font-size:9.5px;margin:3px 0 0;color:#475569}.aih-legal small{display:block;font-size:8px;color:#7b8798;margin-top:2px}
      .aih-brand{display:flex;gap:8px;align-items:center;text-align:right;justify-content:flex-end;max-width:47%;min-width:0}.aih-brand img{width:38px;height:38px;object-fit:contain}.aih-brand b{display:block;font-size:12.2px;color:var(--aih-primary);line-height:1.15}.aih-brand span{display:block;font-size:8px;color:#7b8798;margin-top:2px;line-height:1.25}

      .aih-document-title{text-align:left;padding:13px 0 10px;border-bottom:1px solid var(--aih-line-soft)}
      .aih-document-title>span{font-size:7.6px;color:#8a516f;text-transform:uppercase;letter-spacing:.11em;font-weight:900}
      .aih-document-title h2{font-size:18px;margin:3px 0 1px;color:#111827;letter-spacing:.012em;line-height:1.14}
      .aih-document-title p{font-size:9.5px;color:#6b7280;margin:0}

      .aih-patient{padding:10px 0 8px;margin:0;border-bottom:1px solid var(--aih-line)}
      .aih-patient-name{display:flex;align-items:baseline;gap:9px;margin-bottom:5px}.aih-patient-name span{font-size:7.5px;text-transform:uppercase;color:#8a516f;font-weight:900;letter-spacing:.09em}.aih-patient-name h2{font-size:15px;margin:0;color:#111827;line-height:1.25}
      .aih-document-summary{margin:0;padding:6px 0 8px;border-bottom:1px solid var(--aih-line);background:linear-gradient(90deg,#fff,var(--aih-primary-soft),#fff)}

      /* Distribución fluida: el último dato crece y no deja celdas vacías. */
      .aih-mini-grid{display:flex;flex-wrap:wrap;gap:0 12px;align-items:stretch}
      .aih-mini{flex:1 1 145px;min-width:0;border-bottom:1px solid var(--aih-line-soft);padding:4px 1px 5px}
      .aih-mini span{display:block;font-size:7.3px;text-transform:uppercase;color:#8a516f;font-weight:900;letter-spacing:.045em;margin-bottom:1px}
      .aih-mini b{display:block;font-size:9.5px;line-height:1.35;overflow-wrap:anywhere;color:#222b38}
      .aih-document-summary .aih-mini{border-bottom:0;padding-top:3px;padding-bottom:3px}

      .aih-major{margin:13px 0 0}
      .aih-major>h2,.aih-signature>h2{font-size:12.7px;color:#1f2937;margin:0 0 7px;border-bottom:1px solid #d8c3cf;padding:0 0 5px;font-weight:900}
      .aih-major-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;border-bottom:1px solid #d8c3cf;padding-bottom:5px;margin-bottom:8px}
      .aih-major-heading span{font-size:7.4px;color:var(--aih-primary);text-transform:uppercase;letter-spacing:.09em;font-weight:900;white-space:nowrap}
      .aih-major-heading h2{font-size:12.8px;color:#1f2937;margin:0;font-weight:900;text-align:right}

      /* Antecedentes: grupos sin reserva de espacio y tarjetas fluidas. */
      .aih-ant-group{margin:0;padding:7px 0;border-bottom:1px solid var(--aih-line-soft)}
      .aih-ant-group:last-child{border-bottom:0}
      .aih-ant-group>h3{font-size:9.3px;margin:0 0 5px;color:#4a3240;text-transform:uppercase;letter-spacing:.035em;font-weight:900}
      .aih-ant-grid{display:flex;flex-wrap:wrap;gap:5px}
      .aih-ant-item{flex:1 1 180px;min-width:0;border-left:2px solid #d9b5c9;background:#fcfbfc;padding:5px 7px;break-inside:avoid;page-break-inside:avoid}
      .aih-ant-item-wide{flex-basis:100%}
      .aih-ant-item b{display:block;font-size:9.4px;line-height:1.3;color:#1f2937;overflow-wrap:anywhere}
      .aih-ant-item span{display:block;font-size:8.5px;line-height:1.38;color:#5f6b7b;margin-top:2px;white-space:normal;overflow-wrap:anywhere}
      .aih-ant-alert>h3{color:var(--aih-danger)}.aih-ant-alert .aih-ant-item{border-left-color:#e11d48;background:#fffafa}

      .aih-attention{margin:0 0 11px;border-top:1px solid #cfd6df;border-bottom:1px solid #e6eaf0;padding:0 0 10px;break-inside:auto;page-break-inside:auto}
      .aih-attention:first-of-type{border-top:0}
      .aih-attention-head{display:flex;align-items:center;gap:9px;background:linear-gradient(90deg,var(--aih-primary-soft),#fff 72%);border-left:3px solid var(--aih-primary);padding:7px 8px;margin-bottom:5px}
      .aih-attention-index{width:25px;height:25px;flex:0 0 25px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1px solid #d8c3cf;color:var(--aih-primary);font-size:9px;font-weight:900}
      .aih-attention-title{min-width:0}.aih-attention-kicker{display:block;font-size:7.2px;text-transform:uppercase;letter-spacing:.075em;color:var(--aih-primary);font-weight:900;margin-bottom:1px}
      .aih-attention-head h2{font-size:11.7px;margin:0;color:#111827;line-height:1.2}.aih-attention-head h2 small{font-size:9.2px;color:#64748b;font-weight:700}
      .aih-attention>.aih-mini-grid{padding:0 4px 3px}

      .aih-module{margin:8px 4px 0;padding-top:7px;border-top:1px solid var(--aih-line-soft)}
      .aih-module-title{font-size:10.3px;color:#2d3748;margin:0 0 5px;font-weight:900;text-transform:uppercase;letter-spacing:.025em}
      .aih-special{background:#fff;border-left:2px solid #dfc4d3;padding-left:8px}
      .aih-record{padding:3px 0 5px;border-bottom:1px solid var(--aih-line-soft)}.aih-record:last-child{border-bottom:0}.aih-record-title{font-size:8.6px;color:#6d3655;margin:1px 0 3px;font-weight:900}
      .aih-block{margin:5px 0 7px;break-inside:auto;page-break-inside:auto}
      .aih-block h3{font-size:8.7px;margin:0 0 2px;color:#6d3655;font-weight:900}
      .aih-block-body{font-size:9.5px;line-height:1.48;color:#273244;overflow-wrap:anywhere}
      .aih-danger h3{color:var(--aih-danger)}.aih-danger .aih-block-body{color:#7f1d1d}

      .aih-kv-grid{display:flex;flex-wrap:wrap;gap:4px 12px}.aih-kv{flex:1 1 175px;min-width:0;border-bottom:1px solid var(--aih-line-soft);padding:4px 1px}.aih-kv span{display:block;font-size:7.7px;color:#7b8798;font-weight:800;margin-bottom:1px}.aih-kv b{font-size:9.3px;font-weight:700;line-height:1.35}.aih-kv-block{flex-basis:100%}.aih-kv-block>div{margin-top:3px}
      .aih-lines{display:grid;gap:0}.aih-line{display:grid;grid-template-columns:minmax(112px,29%) 1fr;gap:8px;border-bottom:1px solid var(--aih-line-soft);padding:4px 0}.aih-line:last-child{border-bottom:0}.aih-line span{font-size:8.1px;color:#697586;font-weight:900}.aih-line div{font-size:9.5px;line-height:1.43;overflow-wrap:anywhere}

      .aih-list{margin:2px 0;padding-left:17px}.aih-list li{font-size:9.3px;margin:3px 0;line-height:1.4}.aih-doc-list{list-style:none;padding-left:0}.aih-doc-list li{padding:4px 0;border-bottom:1px solid var(--aih-line-soft)}.aih-doc-list li:last-child{border-bottom:0}.aih-doc-list b{display:block}.aih-doc-list small{display:block;color:#697586;margin-top:1px}
      .aih-dx-list,.aih-med-list{display:grid;gap:0}.aih-dx,.aih-med{padding:5px 3px;border-bottom:1px solid var(--aih-line-soft);break-inside:avoid;page-break-inside:avoid}.aih-dx:last-child,.aih-med:last-child{border-bottom:0}.aih-dx b,.aih-med b{display:block;font-size:9.5px;line-height:1.35}.aih-dx small,.aih-med small{display:block;font-size:8.3px;color:#697586;margin-top:2px;line-height:1.35}.aih-recipe{margin-top:4px}.aih-recipe h4{font-size:9px;margin:0 0 3px;color:#6d3655;font-weight:900}

      .aih-table-wrap{overflow:hidden;border:1px solid var(--aih-line);border-radius:4px}.aih-table{width:100%;border-collapse:collapse;font-size:8.6px}.aih-table th{background:#f7f8fa;text-align:left;color:#475569;font-weight:900}.aih-table td,.aih-table th{padding:4px 5px;border-bottom:1px solid var(--aih-line-soft);vertical-align:top}
      .aih-associated{border-left:3px solid #94a3b8;padding-left:9px}.aih-associated-note{font-size:8.2px;line-height:1.42;color:#697586;margin:-1px 0 7px}

      .aih-signature{margin:17px 0 11px;break-inside:avoid;page-break-inside:avoid}.aih-signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:end}.aih-signature-grid>div:first-child{display:grid;gap:2px;font-size:8.6px}.aih-signature-grid b{font-size:10px}.aih-signature-grid span{color:#697586}.aih-sign-line{border-top:1px solid #8f99a8;padding-top:4px;text-align:center;font-size:7.7px;color:#64748b}
      .aih-note{border-top:1px solid var(--aih-line);padding-top:7px;margin-top:12px}.aih-note b{font-size:7.8px;text-transform:uppercase;color:#475569;letter-spacing:.04em}.aih-note p{font-size:8px;line-height:1.4;color:#697586;margin:3px 0 0}
      .aih-footer-doc{margin-top:11px;padding-top:7px;border-top:1px solid #cfd6df;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:7.6px;color:#697586}.aih-footer-doc div{display:grid;gap:1px}.aih-footer-doc div:last-child{text-align:right}.aih-footer-doc b{color:#394454}
      .aih-running-footer{display:none}

      @page{size:A4;margin:11mm 10mm 14mm}
      @media print{
        html,body{background:#fff}
        .aih-doc{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
        .aih-header,.aih-patient,.aih-document-summary,.aih-attention-head,.aih-mini,.aih-dx,.aih-med,.aih-doc-list li,.aih-ant-item,.aih-table tr{break-inside:avoid;page-break-inside:avoid}
        .aih-module-title,.aih-block h3,.aih-ant-group>h3{break-after:avoid;page-break-after:avoid}
        .aih-running-footer{display:block;position:fixed;left:0;right:0;bottom:-7.5mm;border-top:1px solid #dfe4ea;padding-top:1.8mm;text-align:center;font-size:7px;color:#94a3b8;background:#fff}
      }

      @media(max-width:760px){
        .aih-doc{width:210mm;min-height:297mm}
        .aih-mini{flex-basis:135px}
        .aih-ant-item{flex-basis:165px}
      }
    `;
  }

  /* ========================================================================
     VISOR PREMIUM V2.1 - SOLO PRESENTACIÓN / ANTIRREGRESIVO
     ------------------------------------------------------------------------
     - Pantalla casi completa.
     - Zoom independiente del documento.
     - Ajuste al ancho del área visible.
     - NO modifica state.htmlDocumento.
     - NO modifica cssDocumento() ni imprimir().
     - NO consulta backend ni dispara eventos clínicos.
  ======================================================================== */
  const VISOR_ZOOM_MIN = 0.75;
  const VISOR_ZOOM_MAX = 2.00;
  const VISOR_ZOOM_STEP = 0.10;

  function visorDocumento(){
    return document.querySelector('#aihPreviewDocument .aih-doc');
  }

  function visorZoomNormalizado(valor){
    const n = Number(valor);
    if(!Number.isFinite(n)) return 1.25;
    return Math.min(VISOR_ZOOM_MAX, Math.max(VISOR_ZOOM_MIN, n));
  }

  function actualizarControlesVisor(){
    const etiqueta = document.getElementById('aihZoomLabel');
    const btnMenos = document.getElementById('aihBtnZoomMenos');
    const btnMas = document.getElementById('aihBtnZoomMas');
    const btnAjustar = document.getElementById('aihBtnAjustarAncho');
    const zoom = visorZoomNormalizado(state.visor?.zoom);

    if(etiqueta) etiqueta.textContent = `${Math.round(zoom * 100)}%`;
    if(btnMenos) btnMenos.disabled = zoom <= VISOR_ZOOM_MIN + 0.001;
    if(btnMas) btnMas.disabled = zoom >= VISOR_ZOOM_MAX - 0.001;
    if(btnAjustar){
      btnAjustar.classList.toggle('active', state.visor?.ajusteAncho === true);
      btnAjustar.setAttribute('aria-pressed', state.visor?.ajusteAncho === true ? 'true' : 'false');
    }
  }

  function aplicarZoomVisor(valor, opciones={}){
    const doc = visorDocumento();
    const zoom = visorZoomNormalizado(valor);

    state.visor = state.visor || {zoom:1.25,ajusteAncho:false};
    state.visor.zoom = zoom;
    state.visor.ajusteAncho = opciones.ajusteAncho === true;

    if(doc){
      /* CSS zoom solo afecta el visor. La impresión usa otra ventana/HTML. */
      doc.style.zoom = String(zoom);
      doc.style.margin = '0 auto 42px';
    }

    actualizarControlesVisor();
  }

  function cambiarZoomVisor(delta){
    const actual = visorZoomNormalizado(state.visor?.zoom);
    aplicarZoomVisor(actual + Number(delta || 0), {ajusteAncho:false});
  }

  function ajustarVisorAlAncho(){
    const body = document.getElementById('aihPreviewBody');
    const doc = visorDocumento();
    if(!body || !doc) return;

    /* Medición neutral: se calcula el ancho A4 sin zoom previo. */
    const scrollIzq = body.scrollLeft;
    doc.style.zoom = '1';

    requestAnimationFrame(()=>{
      const anchoDocumento = doc.getBoundingClientRect().width || doc.offsetWidth || 1;
      const margenSeguro = window.innerWidth <= 760 ? 16 : 44;
      const anchoDisponible = Math.max(1, body.clientWidth - margenSeguro);
      const zoom = visorZoomNormalizado(anchoDisponible / anchoDocumento);
      aplicarZoomVisor(zoom,{ajusteAncho:true});
      body.scrollLeft = Math.max(0, scrollIzq);
    });
  }

  function instalarPreviewCSS(){
    if(document.getElementById('auroInformeHistoricoPreviewCSS')) return;
    const s = document.createElement('style');
    s.id = 'auroInformeHistoricoPreviewCSS';
    s.textContent = `
      .aih-overlay{position:fixed;inset:0;z-index:2147482000;background:rgba(15,23,42,.66);display:flex;flex-direction:column;padding:6px;backdrop-filter:blur(5px)}
      .aih-preview-shell{width:calc(100vw - 12px);max-width:none;height:calc(100vh - 12px);margin:auto;background:#eef1f5;border-radius:16px;overflow:hidden;display:grid;grid-template-rows:auto auto minmax(0,1fr);box-shadow:0 30px 90px rgba(15,23,42,.38)}
      .aih-preview-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 13px;background:#fff;border-bottom:1px solid #e5e7eb;min-height:58px}.aih-preview-head h3{margin:0;font-size:16px;color:#111827}.aih-preview-head small{display:block;color:#64748b;margin-top:2px}.aih-preview-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.aih-preview-actions button{border-radius:9px;padding:8px 11px;font-weight:800;border:1px solid #d8dee6;background:#fff;color:#344054;cursor:pointer;white-space:nowrap}.aih-preview-actions .primary{background:#8b1e5a;color:#fff;border-color:#8b1e5a}.aih-preview-actions button:disabled{opacity:.45;cursor:not-allowed}.aih-preview-actions button.active{background:#fff7fb;color:#8b1e5a;border-color:#d9a5c2}
      .aih-zoom-group{display:inline-flex;align-items:center;gap:0;border:1px solid #d8dee6;border-radius:10px;overflow:hidden;background:#fff;height:36px}.aih-zoom-group button{height:34px;min-width:36px;padding:0 10px;border:0;border-radius:0;border-right:1px solid #e5e7eb;font-size:16px;line-height:1}.aih-zoom-group button:last-child{border-right:0}.aih-zoom-label{min-width:58px;text-align:center;font-size:11px;font-weight:900;color:#475569;padding:0 8px;user-select:none}
      .aih-validation{padding:7px 13px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;flex-wrap:wrap}.aih-validation span{font-size:10px;border:1px solid #e5e7eb;background:#f8fafc;border-radius:999px;padding:5px 8px;font-weight:750;color:#475569}.aih-validation .ok{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.aih-validation .warn{background:#fff7ed;border-color:#fed7aa;color:#9a3412}.aih-validation .bad{background:#fff1f2;border-color:#fecdd3;color:#9f1239}
      .aih-preview-body{overflow:auto;padding:0;background:#dde3ea;overscroll-behavior:contain}.aih-preview-stage{min-width:100%;width:max-content;min-height:100%;padding:18px 22px 46px}.aih-preview-stage .aih-doc{margin:0 auto 42px;transform-origin:top center}.aih-loading{display:grid;place-items:center;height:100%;min-height:320px;color:#64748b}.aih-loading-card{background:#fff;padding:22px 26px;border-radius:16px;box-shadow:0 12px 35px rgba(15,23,42,.12);text-align:center;max-width:580px}.aih-spinner{width:32px;height:32px;border:4px solid #f1d9e7;border-top-color:#8b1e5a;border-radius:50%;margin:0 auto 11px;animation:aihspin .75s linear infinite}@keyframes aihspin{to{transform:rotate(360deg)}}
      @media(max-width:980px){.aih-preview-head{align-items:flex-start}.aih-preview-actions{max-width:70%}.aih-preview-actions button{padding:7px 9px;font-size:11px}.aih-zoom-group{height:34px}.aih-zoom-group button{height:32px}.aih-validation{max-height:70px;overflow:auto}}
      @media(max-width:760px){.aih-overlay{padding:0}.aih-preview-shell{width:100vw;height:100vh;border-radius:0}.aih-preview-head{align-items:flex-start;flex-direction:column;padding:9px 10px}.aih-preview-actions{width:100%;max-width:none;justify-content:flex-start}.aih-preview-actions>button{flex:1 1 auto}.aih-zoom-group{flex:0 0 auto}.aih-preview-body{padding:0}.aih-preview-stage{padding:8px 8px 34px}.aih-preview-stage .aih-doc{margin:0 auto 30px}.aih-validation{padding:6px 8px;max-height:64px}.aih-mini-grid,.aih-kv-grid,.aih-ant-grid{grid-template-columns:1fr}.aih-line{grid-template-columns:1fr;gap:2px}}
      @media(max-width:460px){.aih-preview-actions{gap:5px}.aih-preview-actions button{font-size:10.5px;padding:7px 8px}.aih-zoom-label{min-width:50px;padding:0 5px}.aih-zoom-group button{min-width:32px;padding:0 8px}.aih-preview-head small{font-size:10px}}
    `;
    document.head.appendChild(s);
  }

  function asegurarModal(){
    instalarPreviewCSS();
    let overlay = document.getElementById('auroInformeHistoricoOverlay');
    if(overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'auroInformeHistoricoOverlay';
    overlay.className = 'aih-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="aih-preview-shell" role="dialog" aria-modal="true" aria-label="Vista previa del Informe Clínico Histórico">
        <div class="aih-preview-head">
          <div><h3>Informe Clínico Histórico</h3><small>Vista previa · solo lectura · datos persistidos</small></div>
          <div class="aih-preview-actions">
            <button type="button" id="aihBtnActualizar">Actualizar información</button>
            <button type="button" id="aihBtnAjustarAncho" aria-pressed="false" title="Ajustar el documento al ancho disponible">Ajustar ancho</button>
            <div class="aih-zoom-group" role="group" aria-label="Zoom de vista previa">
              <button type="button" id="aihBtnZoomMenos" aria-label="Reducir zoom" title="Reducir zoom">−</button>
              <span class="aih-zoom-label" id="aihZoomLabel">125%</span>
              <button type="button" id="aihBtnZoomMas" aria-label="Aumentar zoom" title="Aumentar zoom">+</button>
            </div>
            <button type="button" id="aihBtnCerrar">Cerrar</button>
            <button type="button" class="primary" id="aihBtnImprimir">Imprimir / PDF</button>
          </div>
        </div>
        <div class="aih-validation" id="aihValidation"></div>
        <div class="aih-preview-body" id="aihPreviewBody"></div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#aihBtnActualizar')?.addEventListener('click',actualizar);
    overlay.querySelector('#aihBtnAjustarAncho')?.addEventListener('click',ajustarVisorAlAncho);
    overlay.querySelector('#aihBtnZoomMenos')?.addEventListener('click',()=>cambiarZoomVisor(-VISOR_ZOOM_STEP));
    overlay.querySelector('#aihBtnZoomMas')?.addEventListener('click',()=>cambiarZoomVisor(VISOR_ZOOM_STEP));
    overlay.querySelector('#aihBtnCerrar')?.addEventListener('click',cerrar);
    overlay.querySelector('#aihBtnImprimir')?.addEventListener('click',imprimir);
    overlay.addEventListener('click',e=>{ if(e.target===overlay) cerrar(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape' && overlay.style.display!=='none') cerrar(); });
    actualizarControlesVisor();
    return overlay;
  }

  function mostrarCargando(texto='Construyendo informe clínico histórico...'){
    const overlay = asegurarModal();
    overlay.style.display = 'flex';
    const body = document.getElementById('aihPreviewBody');
    const val = document.getElementById('aihValidation');
    const btn = document.getElementById('aihBtnImprimir');
    if(btn) btn.disabled = true;
    if(val) val.innerHTML = '';
    if(body) body.innerHTML = `<div class="aih-loading"><div class="aih-loading-card"><div class="aih-spinner"></div><b>${esc(texto)}</b><div style="margin-top:5px;font-size:12px">Lectura fresca del expediente persistido. No se modifica la historia clínica.</div></div></div>`;
  }

  function renderValidacion(v){
    const el = document.getElementById('aihValidation');
    if(!el) return;

    const r = v.resumen;
    const total = Number(r.atenciones || 0);
    const vacias = Number(state.excluidos.atencionesSinContenido || 0);
    const incluidas = Math.max(0,total-vacias);
    const pills = [
      [v.estado === 'VALIDADO' ? 'VALIDADO' : v.estado === 'INCOMPLETO' ? 'VERIFICACIÓN PENDIENTE' : 'ERROR DE INTEGRIDAD · PDF BLOQUEADO', v.estado === 'VALIDADO'?'ok':v.estado === 'INCOMPLETO'?'warn':'bad'],
      [`${total} atención${total===1?'':'es'} registrada${total===1?'':'s'}`,''],
      [`${incluidas} con contenido clínico`,''],
      [r.diagnosticos ? `${r.diagnosticos} diagnóstico${r.diagnosticos===1?'':'s'}` : '',''],
      [r.recetas ? `${r.recetas} receta${r.recetas===1?'':'s'}` : '',''],
      [r.fuentes_no_verificadas ? `${r.fuentes_no_verificadas} fuente(s) clínica(s) pendiente(s) de verificación` : '', r.fuentes_no_verificadas?'bad':''],
      [r.respaldos_locales ? `${r.respaldos_locales} fuente(s) usando respaldo local` : '', r.respaldos_locales?'warn':'']
    ].filter(([t])=>t);

    if(v.problemas.length) pills.push([v.problemas.join(' · '),'bad']);
    el.innerHTML = pills.map(([t,c])=>`<span class="${c||''}">${esc(t)}</span>`).join('');

    const btn = document.getElementById('aihBtnImprimir');
    if(btn) btn.disabled = !v.pdfPermitido;
  }

  function renderPreview(validacion){
    const body = document.getElementById('aihPreviewBody');
    if(!body) return;
    renderValidacion(validacion);
    body.innerHTML = `<style>${cssDocumento()}</style><div class="aih-preview-stage"><div id="aihPreviewDocument">${state.htmlDocumento}</div></div>`;

    requestAnimationFrame(()=>{
      /* En teléfono el ancho manda; en escritorio se conserva 125% inicial. */
      if(window.matchMedia?.('(max-width:760px)')?.matches || state.visor?.ajusteAncho === true){
        ajustarVisorAlAncho();
      }else{
        aplicarZoomVisor(state.visor?.zoom || 1.25,{ajusteAncho:false});
      }
    });
  }

  function mostrarError(error){
    const overlay = asegurarModal();
    overlay.style.display = 'flex';
    const body = document.getElementById('aihPreviewBody');
    const val = document.getElementById('aihValidation');
    const btn = document.getElementById('aihBtnImprimir');
    if(btn) btn.disabled = true;
    if(val) val.innerHTML = '<span class="bad">No se pudo construir el informe</span>';
    if(body) body.innerHTML = `<div class="aih-loading"><div class="aih-loading-card"><b style="color:#9f1239">${esc(error?.message || error || 'Error desconocido')}</b><div style="margin-top:8px;font-size:12px;color:#64748b">No se realizó ninguna escritura en la historia clínica.</div></div></div>`;
  }

  function cerrar(){
    const overlay = document.getElementById('auroInformeHistoricoOverlay');
    if(overlay) overlay.style.display = 'none';
  }

  function imprimir(){
    if(!state.htmlDocumento || !state.validacion){
      alert('Genere primero la vista previa del Informe Clínico Histórico.');
      return;
    }
    if(!state.validacion.pdfPermitido){
      alert('El Informe Histórico no está completamente validado. Corrija o vuelva a verificar las fuentes antes de generar el PDF definitivo.');
      return;
    }

    const w = window.open('','_blank','noopener,noreferrer');
    if(!w){
      alert('El navegador bloqueó la ventana de impresión. Habilite las ventanas emergentes para este sitio.');
      return;
    }

    w.document.open();
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe Clínico Histórico</title><style>${cssDocumento()}</style></head><body>${state.htmlDocumento}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
    w.document.close();
  }

  /* ========================================================================
     ORQUESTADOR PRINCIPAL
  ======================================================================== */
  async function construirModelo(idPaciente, token){
    /*
      V2.3 — SOLAPAMIENTO SEGURO DE LECTURAS
      Todas las fuentes conservan sus mismos GET. La única diferencia es temporal:
      en cuanto listarAtenciones termina, se encola el detalle por id_atencion sin
      esperar a que concluyan médicos/configuración/colecciones globales.
      MAX_GET_CONCURRENCIA limita globalmente SOLO las lecturas de este informe.
    */
    const pacienteP = cargarPaciente(idPaciente);
    const historiasP = cargarHistoriasPaciente(idPaciente);
    const atencionesP = cargarAtencionesPaciente(idPaciente);
    const medicosP = cargarMedicos();
    const configuracionP = cargarConfiguracion();
    const globalesP = cargarColeccionesGlobales();

    const atenciones = await atencionesP;

    if(token !== state.token) throw new Error('La generación anterior fue cancelada por un nuevo contexto.');

    /*
      No existe límite por "grupo de atención". Cada cargarModuloAtencion puede
      encolar sus 7 GET, pero la cola privada permite como máximo
      MAX_GET_CONCURRENCIA solicitudes reales simultáneas.
    */
    const detalleAtencionesP = Promise.all(
      (atenciones || []).map(cargarModuloAtencion)
    );

    const [paciente, historias, medicos, configuracion, globalesBase, detalleAtenciones] = await Promise.all([
      pacienteP,
      historiasP,
      medicosP,
      configuracionP,
      globalesP,
      detalleAtencionesP
    ]);

    if(token !== state.token) throw new Error('El paciente cambió durante la generación del informe.');
    if(idPacienteSeleccionado() && idPacienteSeleccionado() !== idPaciente){
      throw new Error('El paciente seleccionado cambió durante la generación. Vuelva a abrir el informe.');
    }

    const historia = historiaConAntecedentes(historias || []);
    const relacion = construirRelacion(idPaciente,historias,atenciones);
    const globales = asociarColecciones(detalleAtenciones,globalesBase,relacion);

    return {
      institucion:normalizarInstitucion(configuracion),
      paciente:normalizarPaciente(paciente,historia),
      historia,
      medicos,
      atenciones:detalleAtenciones,
      globales,
      relacion
    };
  }

  function reiniciarEstadoGeneracion(idPaciente){
    state.idPaciente = idPaciente;
    state.datos = null;
    state.htmlDocumento = '';
    state.validacion = null;
    state.fuentes = {};
    state.advertencias = [];
    state.errores = [];
    state.excluidos = {sinPertenencia:0,sinAtencion:0,atencionesSinContenido:0};
    reiniciarRendimiento();
  }

  async function abrir(){
    if(state.cargando) return;

    const idPaciente = idPacienteSeleccionado();
    if(!idPaciente){
      alert('Seleccione primero un paciente en Historia Clínica para generar el Informe Histórico.');
      return;
    }

    const token = ++state.token;
    state.cargando = true;
    reiniciarEstadoGeneracion(idPaciente);
    mostrarCargando();

    try{
      const modelo = await construirModelo(idPaciente,token);
      if(token !== state.token) return;

      state.datos = modelo;
      state.htmlDocumento = construirDocumento(modelo);
      state.validacion = validarModelo(modelo);
      renderPreview(state.validacion);
    }catch(error){
      console.error(MODULO,error);
      state.errores.push(error?.message || String(error));
      mostrarError(error);
    }finally{
      if(token === state.token){
        state.cargando = false;
        const fin = relojMs();
        state.rendimiento.fin_ms = fin;
        state.rendimiento.total_ms = Math.max(0,fin-Number(state.rendimiento.inicio_ms || fin));

        try{
          console.info(`${MODULO} V2.3 rendimiento`, {
            total_ms:Math.round(state.rendimiento.total_ms),
            solicitudes:state.rendimiento.solicitudes,
            pico_concurrencia:state.rendimiento.pico_concurrencia,
            endpoints:Object.fromEntries(
              Object.entries(state.rendimiento.endpoints || {}).map(([accion,m])=>[
                accion,
                {
                  solicitudes:m.solicitudes,
                  exitos:m.exitos,
                  errores:m.errores,
                  total_ms:Math.round(m.total_ms),
                  red_ms:Math.round(m.red_ms),
                  cola_ms:Math.round(m.cola_ms),
                  max_ms:Math.round(m.max_ms)
                }
              ])
            )
          });
        }catch(_e){}
      }
    }
  }

  async function actualizar(){
    if(state.cargando) return;
    return abrir();
  }

  /* ========================================================================
     INTERFAZ PÚBLICA - COMPATIBLE + ADITIVA
  ======================================================================== */
  window.auroInformeHistorico = Object.freeze({
    version:VERSION,
    abrir,
    actualizar,
    imprimir,
    cerrar,
    diagnostico:function(){
      return {
        version:VERSION,
        cargando:state.cargando,
        id_paciente:state.idPaciente,
        tiene_modelo:!!state.datos,
        estado_validacion:state.validacion?.estado || '',
        pdf_permitido:state.validacion?.pdfPermitido === true,
        atenciones:state.datos?.atenciones?.length || 0,
        fuentes:{...state.fuentes},
        excluidos:{...state.excluidos},
        rendimiento:{
          total_ms:Math.round(Number(state.rendimiento?.total_ms || 0)),
          solicitudes:Number(state.rendimiento?.solicitudes || 0),
          pico_concurrencia:Number(state.rendimiento?.pico_concurrencia || 0),
          limite_concurrencia:MAX_GET_CONCURRENCIA,
          endpoints:Object.fromEntries(
            Object.entries(state.rendimiento?.endpoints || {}).map(([accion,m])=>[
              accion,
              {
                solicitudes:m.solicitudes,
                exitos:m.exitos,
                errores:m.errores,
                total_ms:Math.round(m.total_ms),
                red_ms:Math.round(m.red_ms),
                cola_ms:Math.round(m.cola_ms),
                max_ms:Math.round(m.max_ms)
              }
            ])
          )
        },
        advertencias:[...state.advertencias],
        errores:[...state.errores]
      };
    }
  });

  /* Alias IASYN aditivo; se conserva window.auroInformeHistorico por compatibilidad. */
  window.iasynInformeHistorico = window.auroInformeHistorico;

  console.info(`${MODULO} v${VERSION}: cargado en modo SOLO LECTURA / GOLD STANDARD.`);
})();
