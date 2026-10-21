/* ============================================================
   IASYN-2 / EIC - VISTA INTEGRAL DE LA ATENCIÓN
   Versión: IASYN-2 EIC 1.0 - adaptación de módulo independiente

   ALCANCE ESTRICTO:
   - Solo lectura y presentación.
   - No modifica Google Sheets, Apps Script, localStorage ni módulos clínicos.
   - No altera botones Guardar, Ver, iniciar/finalizar atención ni sincronizaciones.
   - No escribe datos de regreso.
============================================================ */
(function(){
  'use strict';

  const MODULO = 'IASYN2_EIC_VISTA_INTEGRAL_V1_0';
  const STORAGE_ATENCIONES = 'aurosanax_atenciones_local_v1';
  const STORAGE_RECETAS = 'aurosanax_recetas_emitidas_v1';

  // Aislamiento de instalación: sin fallback a endpoints históricos.
  // Si IASYN_CONFIG no está configurado, se impide la consulta remota.
  function obtenerEndpointIASYN(){
    const url = texto(window.IASYN_CONFIG && window.IASYN_CONFIG.apiUrl);
    if(!url || !/^https:\/\//i.test(url)) return '';
    return url;
  }

  function texto(v){ return String(v == null ? '' : v).trim(); }

  function esc(v){
    return texto(v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function norm(v){
    return texto(v)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function esVacio(v){
    const n = norm(v);
    if(!n) return true;

    return new Set([
      'seleccione','seleccione...','seleccionar','elegir indicacion rapida...',
      'no registrado','no registrada','no registrado en esta atencion',
      'no registrada en esta atencion','no disponible','sin informacion',
      'sin informacion registrada','sin datos','sin dato','undefined',
      'null','false','[]','{}','-','—'
    ]).has(n);
  }

  function esEstadoInterno(v){
    const n = norm(v);
    if(!n) return true;

    return (
      n.includes('no registrado en esta atencion') ||
      n.includes('no disponible para esta atencion') ||
      n.includes('seleccione una atencion') ||
      n.includes('seleccione primero') ||
      n.includes('cargando') ||
      n.includes('sin consulta activa') ||
      n.includes('sin atencion activa')
    );
  }

  function parseJSON(v, fallback){
    if(v && typeof v === 'object') return v;
    try{ return JSON.parse(texto(v)); }catch(_){ return fallback; }
  }

  function listaStorage(clave){
    try{
      const v = JSON.parse(localStorage.getItem(clave) || '[]');
      return Array.isArray(v) ? v : [];
    }catch(_){
      return [];
    }
  }

  function atencionPorId(id){
    return listaStorage(STORAGE_ATENCIONES).find(x =>
      texto(x?.id_atencion) === texto(id)
    ) || null;
  }

  function recetasPorAtencion(id){
    return listaStorage(STORAGE_RECETAS).filter(x =>
      texto(x?.id_atencion) === texto(id)
    );
  }

  function fechaVisual(v){
    const s = texto(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const p = s.slice(0,10).split('-');
      return p[2]+'/'+p[1]+'/'+p[0];
    }
    return s;
  }

  function horaVisual(v){
    const s = texto(v);
    if(!s) return '';
    if(/^\d{1,2}:\d{2}/.test(s)) return s.slice(0,5);
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(11,16);
    if(/^1899-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(11,16);
    return s;
  }

  function pacienteActual(){
    const fuentes = [
      window.getPacienteActivo && (()=>window.getPacienteActivo()),
      ()=>window.pacienteActivo,
      ()=>window.pacienteActual,
      ()=>window.currentPatient,
      ()=>window.selectedPatient,
      ()=>window.historiaActual,
      ()=>window.currentHistoria
    ];

    for(const fn of fuentes){
      try{
        const p = typeof fn === 'function' ? fn() : null;
        if(p && typeof p === 'object') return p;
      }catch(_){}
    }
    return {};
  }

  /* FASE 1 — Identidad de consulta: nunca reutilizar otro paciente activo. */
  function idPacienteRegistro(p){
    return texto(p?.id_paciente || p?.paciente_id || p?.id);
  }

  function pacienteLocalPorAtencion(atencion){
    const esperado = texto(atencion?.id_paciente);
    if(!esperado) return {};
    const listas = [window.patients,window.pacientes,window.listaPacientes,window.pacientesData];
    for(const lista of listas){
      if(!Array.isArray(lista)) continue;
      const encontrado = lista.find(p=>idPacienteRegistro(p) === esperado);
      if(encontrado) return encontrado;
    }
    const activo = pacienteActual();
    return idPacienteRegistro(activo) === esperado ? activo : {};
  }

  function contextoSeguroPorAtencion(atencion){
    let ctx = null;
    try{
      ctx = typeof window.obtenerContextoAtencionActual === 'function'
        ? window.obtenerContextoAtencionActual() : null;
    }catch(_){}
    const id = texto(atencion?.id_atencion);
    if(!id || texto(ctx?.id_atencion) !== id) return {};
    if(texto(ctx?.id_paciente) && texto(ctx.id_paciente) !== texto(atencion?.id_paciente)) return {};
    if(texto(ctx?.id_historia) && texto(atencion?.id_historia) &&
       texto(ctx.id_historia) !== texto(atencion.id_historia)) return {};
    return ctx;
  }

  function registrosOficiales(respuesta){
    if(Array.isArray(respuesta)) return respuesta;
    if(respuesta?.success === false) throw new Error(texto(respuesta.message || respuesta.error || 'Respuesta API fallida'));
    for(const clave of ['data','datos','registros','resultado','result','items','lista']){
      if(Array.isArray(respuesta?.[clave])) return respuesta[clave];
    }
    throw new Error('Formato de registros no reconocido');
  }

  async function consultarColeccionOficial(accion){
    const base = obtenerEndpointIASYN();
    if(!base) throw new Error('IASYN-2 no configurado: consulta oficial deshabilitada');
    const q = new URLSearchParams({accion,_:String(Date.now())});
    const res = await fetch(base+'?'+q.toString(),{method:'GET',cache:'no-store',redirect:'follow'});
    if(!res.ok) throw new Error('Error HTTP '+res.status);
    return registrosOficiales(await res.json());
  }

  /* Se enriquece exclusivamente la cabecera sin alterar formularios ni la atención activa.
     El dato remoto manda; si falla, no se simula confirmación persistente. */
  async function completarIdentidadOficialVista(idAtencion,overlayEsperado){
    const id = texto(idAtencion);
    const slot = overlayEsperado?.querySelector('[data-avi-fuente-identidad]');
    if(!slot || !id) return;
    const [atR,pacR] = await Promise.allSettled([
      consultarColeccionOficial('listarAtenciones'),
      consultarColeccionOficial('listarPacientes')
    ]);
    if(document.getElementById('auroVistaIntegralOverlay') !== overlayEsperado ||
       texto(overlayEsperado.dataset.aviAtencion) !== id) return;
    if(atR.status !== 'fulfilled' || pacR.status !== 'fulfilled'){
      slot.textContent='Identidad pendiente de verificación en registros persistidos.';
      return;
    }
    const a = atR.value.find(x=>texto(x?.id_atencion) === id);
    if(!a || !texto(a.id_paciente)){
      slot.textContent='Atención no verificada en el registro persistido.';
      return;
    }
    const p = pacR.value.find(x=>idPacienteRegistro(x) === texto(a.id_paciente));
    if(!p){
      slot.textContent='Paciente de esta atención no verificado en el registro persistido.';
      return;
    }
    const actual = atencionPorId(id);
    if(actual && texto(actual.id_paciente) && texto(actual.id_paciente) !== texto(a.id_paciente)){
      slot.textContent='Inconsistencia entre atención local y atención persistida. Revisión requerida.';
      return;
    }
    const datosP=overlayEsperado.querySelector('[data-avi-datos-paciente]');
    const datosA=overlayEsperado.querySelector('[data-avi-datos-atencion]');
    if(datosP) datosP.innerHTML=datosPacienteHTML(a,p);
    if(datosA) datosA.innerHTML=datosAtencionHTML(a);
    const cab=overlayEsperado.querySelector('[data-avi-paciente]');
    if(cab) cab.textContent=nombrePaciente(p) || texto(a.id_paciente);
    const sub=overlayEsperado.querySelector('[data-avi-subcontexto]');
    const ctx=contextoSeguroPorAtencion(a);
    if(sub) sub.textContent=[
      texto(a.nombre_medico || ctx.nombre_medico || a.id_medico),
      texto(a.especialidad_atencion || a.especialidad || ctx.especialidad_atencion || ctx.especialidad_medico)
    ].filter(Boolean).join(' · ');
    const chips=overlayEsperado.querySelector('[data-avi-contexto]');
    if(chips) chips.innerHTML=encabezadoContexto(a);
    const numeroCab=overlayEsperado.querySelector('[data-avi-numero-consulta]');
    if(numeroCab) numeroCab.textContent=texto(a.numero_consulta) ? 'Consulta N.º '+texto(a.numero_consulta) : '';
    slot.textContent='';
  }

  function nombrePaciente(p){
    return texto(
      p.nombre_completo ||
      p.paciente_nombre ||
      p.nombre ||
      [p.nombres,p.apellidos].filter(Boolean).join(' ')
    );
  }

  function calcularEdad(fecha){
    const s = texto(fecha);
    if(!s) return '';
    const d = new Date(s);
    if(Number.isNaN(d.getTime())) return '';

    const hoy = new Date();
    let edad = hoy.getFullYear() - d.getFullYear();
    const mes = hoy.getMonth() - d.getMonth();
    if(mes < 0 || (mes === 0 && hoy.getDate() < d.getDate())) edad--;

    return edad >= 0 && edad < 130 ? String(edad) : '';
  }

  function primero(obj, claves){
    for(const k of claves){
      const v = obj && obj[k];
      if(!esVacio(v)) return texto(v);
    }
    return '';
  }

  function dato(label, value, clase){
    if(esVacio(value)) return '';
    return '<div class="avi-data '+(clase || '')+'">'+
      '<span>'+esc(label)+'</span>'+
      '<b>'+esc(value)+'</b>'+
    '</div>';
  }

  function datosPacienteHTML(atencion,pacienteVerificado){
    const p = pacienteVerificado || pacienteLocalPorAtencion(atencion);
    const nacimiento = primero(p,['fecha_nacimiento','nacimiento','fechaNacimiento']);
    const edad = primero(p,['edad']) || calcularEdad(nacimiento);
    const nombre =
      nombrePaciente(p) ||
      primero(atencion,['nombre_paciente','paciente_nombre']) ||
      texto(atencion?.id_paciente);

    return [
      dato('Paciente',nombre,'avi-col-2'),
      dato('Identificación',primero(p,['numero_documento','cedula','documento','identificacion'])),
      dato('Fecha de nacimiento',fechaVisual(nacimiento)),
      dato('Edad',edad ? edad+' años' : ''),
      dato('Sexo',primero(p,['sexo','genero'])),
      dato('Estado civil',primero(p,['estado_civil','estadoCivil'])),
      dato('Ocupación',primero(p,['ocupacion','profesion'])),
      dato('Teléfono',primero(p,['telefono','celular','movil'])),
      dato('Correo',primero(p,['correo','email']),'avi-col-2'),
      dato('Dirección',primero(p,['direccion','domicilio']),'avi-col-2'),
      dato('Aseguradora',primero(p,['aseguradora','seguro'])),
      dato('Contacto de emergencia',primero(p,['contacto_emergencia','emergencia_contacto','nombre_contacto_emergencia']),'avi-col-2')
    ].filter(Boolean).join('');
  }

  function datosAtencionHTML(a){
    const ctx = contextoSeguroPorAtencion(a);

    return [
      dato('Consulta',a?.numero_consulta ? '#'+a.numero_consulta : ''),
      dato('Fecha',fechaVisual(a?.fecha_atencion)),
      dato('Hora',horaVisual(a?.hora_atencion)),
      dato('Tipo',a?.tipo_atencion),
      dato('Estado',a?.estado_atencion),
      dato('Médico',a?.nombre_medico || ctx.nombre_medico || a?.id_medico,'avi-col-2'),
      dato('Especialidad',a?.especialidad_atencion || a?.especialidad || ctx.especialidad_atencion || ctx.especialidad_medico,'avi-col-2'),
      dato('ID atención',a?.id_atencion,'avi-col-2 avi-id-card'),
      dato('ID historia',a?.id_historia,'avi-col-2 avi-id-card'),
      dato('ID cita',a?.id_cita || '')
    ].filter(Boolean).join('');
  }

  function etiquetaCampo(el){
    if(!el) return '';

    if(el.id){
      try{
        const lab = document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
        if(lab) return texto(lab.textContent);
      }catch(_){}
    }

    const parent = el.closest(
      '.form-group,.mb-3,.col,.col-md-2,.col-md-3,.col-md-4,'+
      '.col-md-6,.col-md-12,.obs-read,.auro-previos-line'
    );

    if(parent){
      const lab = parent.querySelector('label,.form-label,.field-label,.fw-semibold');
      if(lab && lab !== el) return texto(lab.textContent);
    }

    return texto(
      el.getAttribute('aria-label') ||
      el.dataset?.label ||
      el.name ||
      el.id
    );
  }

  function etiquetaCheckbox(el){
    const directa = texto(el.dataset?.label);
    if(directa) return directa;

    if(el.id){
      try{
        const lab = document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
        if(lab) return texto(lab.textContent);
      }catch(_){}
    }

    const contenedor = el.closest('label,.form-check,.form-switch');
    if(contenedor){
      const clon = contenedor.cloneNode(true);
      clon.querySelectorAll('input,select,textarea,button').forEach(x=>x.remove());
      const t = texto(clon.textContent).replace(/\s+/g,' ');
      if(t) return t;
    }

    return etiquetaCampo(el);
  }

  function valorCampo(el){
    if(!el) return '';

    if(el.type === 'checkbox' || el.type === 'radio'){
      if(!el.checked) return '';

      const raw = texto(el.value);
      if(!raw || norm(raw) === 'on' || esVacio(raw)) return 'Sí';
      return raw;
    }

    if(el.tagName === 'SELECT'){
      const op = el.options && el.selectedIndex >= 0
        ? el.options[el.selectedIndex]
        : null;
      const valor = texto(op?.textContent || el.value);
      return esVacio(valor) ? '' : valor;
    }

    const valor = texto(el.value || el.textContent);
    return esVacio(valor) ? '' : valor;
  }

  function limpiarEtiqueta(valor){
    let t = texto(valor).replace(/\s+/g,' ');
    if(!t) return 'Dato clínico';

    const mapa = {
      'hcrecetamedicamentos':'Medicamentos',
      'hcexamenessolicitados':'Exámenes solicitados',
      'hcinterconsultas':'Interconsultas',
      'hcordenesmedicas':'Órdenes médicas',
      'hcindicaciones':'Indicaciones generales',
      'tto. continuo':'Tratamiento continuo',
      'registro visible':'Dato clínico',
      'dato registrado':'Dato clínico'
    };

    const n = norm(t).replace(/\s/g,'');
    if(mapa[n]) return mapa[n];

    const n2 = norm(t);
    if(mapa[n2]) return mapa[n2];

    t = t
      .replace(/^hc/i,'')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g,'$1 $2')
      .replace(/[_-]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    return t || 'Dato clínico';
  }

  function limpiarTextoClinico(valor){
    let t = texto(valor).replace(/\s+/g,' ').trim();
    if(!t || esEstadoInterno(t)) return '';

    t = t
      .replace(/^registro visible\s*:?\s*/i,'')
      .replace(/^dato registrado\s*:?\s*/i,'')
      .trim();

    return esVacio(t) ? '' : t;
  }

  function interpretarAntecedenteFamiliar(valor){
    const raw = texto(valor);
    if(!raw) return null;

    const idx = raw.indexOf('{');
    if(idx < 0) return null;

    const data = parseJSON(raw.slice(idx),null);
    if(!data || typeof data !== 'object') return null;

    const salida = [];
    const patologicos = Array.isArray(data.patologicos) ? data.patologicos : [];

    patologicos.forEach(item=>{
      const patologia = texto(item?.patologia || item?.nombre);
      const parentesco = texto(item?.parentesco);
      const detalle = texto(item?.detalle);
      if(!patologia) return;

      salida.push({
        etiqueta:'Antecedente familiar',
        valor:[
          patologia,
          parentesco ? 'Parentesco: '+parentesco : '',
          detalle ? 'Detalle: '+detalle : ''
        ].filter(Boolean).join(' · '),
        tipo:'texto'
      });
    });

    return salida.length ? salida : null;
  }

  function listaDesdeValor(valor){
    const raw = texto(valor);
    if(!raw) return null;

    const data = parseJSON(raw,null);
    if(Array.isArray(data)){
      const items = data.map(x =>
        typeof x === 'string'
          ? texto(x)
          : texto(x?.texto || x?.indicacion || x?.descripcion || x?.nombre)
      ).filter(x=>!esVacio(x));

      return items.length ? items : null;
    }

    const numerados = raw
      .split(/\s+(?=\d+\.\s)/)
      .map(x=>x.replace(/^\d+\.\s*/,'').trim())
      .filter(Boolean);

    return numerados.length > 1 ? numerados : null;
  }

  function deduplicarPares(pares){
    const salida = [];
    const vistos = new Set();

    pares.forEach(p=>{
      const etiqueta = limpiarEtiqueta(p.etiqueta);
      const valor = limpiarTextoClinico(p.valor);
      if(!valor) return;

      const antecedente = interpretarAntecedenteFamiliar(valor);
      if(antecedente){
        antecedente.forEach(item=>{
          const clave = norm(item.etiqueta) + '||' + norm(item.valor);
          if(!clave || vistos.has(clave)) return;
          vistos.add(clave);
          salida.push(item);
        });
        return;
      }

      const claveContenido = norm(etiqueta) + '||' + norm(valor);
      if(!norm(valor) || vistos.has(claveContenido)) return;

      vistos.add(claveContenido);
      salida.push({
        etiqueta,
        valor,
        tipo:p.tipo || 'texto',
        anchoCompleto:Boolean(p.anchoCompleto || valor.length > 150)
      });
    });

    return salida;
  }

  function capturarPanel(panelId, opciones={}){
    const panel = document.getElementById(panelId);
    if(!panel) return [];

    const pares = [];

    panel.querySelectorAll('input,textarea,select').forEach(el=>{
      if(el.type === 'hidden') return;

      const valor = valorCampo(el);
      if(!valor) return;

      let etiqueta =
        (el.type === 'checkbox' || el.type === 'radio')
          ? etiquetaCheckbox(el)
          : etiquetaCampo(el);

      const eNorm = norm(etiqueta);
      const vNorm = norm(valor);

      if(panelId === 'hc_anamnesis' && (
        eNorm === 'tipo' ||
        eNorm.includes('tipo de consulta') ||
        (eNorm === 'tipo' && vNorm.includes('primera vez'))
      )){
        return;
      }

      pares.push({
        etiqueta:etiqueta || 'Dato clínico',
        valor,
        anchoCompleto:valor.length > 150 || el.tagName === 'TEXTAREA'
      });
    });

    const selectorResumen = opciones.excluirObsRead
      ? '.auro-previos-line,.auro-previos-mini-row,.auro-dx-item'
      : '.auro-previos-line,.auro-previos-mini-row,.obs-read,.auro-dx-item';

    panel.querySelectorAll(selectorResumen).forEach(n=>{
      if(n.closest('button')) return;

      const valor = limpiarTextoClinico(n.textContent);
      if(!valor || esEstadoInterno(valor)) return;

      let etiqueta = '';
      const titulo = n.querySelector(
        'b,strong,.fw-bold,.fw-semibold,.auro-dx-source-title,'+
        '.auro-previos-label,.label,.title'
      );

      if(titulo) etiqueta = texto(titulo.textContent);

      pares.push({
        etiqueta:etiqueta || 'Dato clínico',
        valor,
        anchoCompleto:valor.length > 150
      });
    });

    return deduplicarPares(pares);
  }


  function historiaFuenteAntecedentes(atencion){
    const idHistoria = texto(atencion?.id_historia);
    const idPaciente = texto(atencion?.id_paciente);
    if(!idHistoria) return null;

    const coincide = h =>
      h &&
      typeof h === 'object' &&
      texto(h.id_historia || h.id) === idHistoria &&
      (!idPaciente || !texto(h.id_paciente) || texto(h.id_paciente) === idPaciente);

    for(const h of [window.historiaActual, window.currentHistoria]){
      if(coincide(h)) return h;
    }

    try{
      if(typeof window.auroHistoriasPacienteOrdenadas === 'function' && idPaciente){
        const lista = window.auroHistoriasPacienteOrdenadas(idPaciente);
        if(Array.isArray(lista)){
          const h = lista.find(coincide);
          if(h) return h;
        }
      }
    }catch(error){
      console.warn(MODULO,'No se pudo resolver historia desde antecedentes.js.',error);
    }

    try{
      if(typeof window.auroHistoriaActualEdicion === 'function'){
        const h = window.auroHistoriaActualEdicion();
        if(coincide(h)) return h;
      }
    }catch(error){
      console.warn(MODULO,'No se pudo resolver historia en edición.',error);
    }

    return null;
  }

  function parsearAntecedenteEstructurado(valor, marker){
    const raw = texto(valor);
    if(!raw || !raw.startsWith(marker)) return null;
    try{
      const data = JSON.parse(raw.slice(marker.length));
      return data && typeof data === 'object' ? data : null;
    }catch(_){
      return null;
    }
  }

  function normalizarItemsAntecedente(items){
    return (Array.isArray(items) ? items : [])
      .map(item=>{
        if(!item) return null;
        if(typeof item === 'string'){
          const titulo = limpiarTextoClinico(item);
          return titulo ? {titulo, detalle:''} : null;
        }

        const titulo = limpiarTextoClinico(
          item.titulo || item.nombre || item.descripcion ||
          item.biologico || item.vacuna || item.habito ||
          item.actividad || ''
        );

        const detalle = limpiarTextoClinico(
          item.detalle || item.observacion || item.observaciones || ''
        );

        if(!titulo && !detalle) return null;
        return {titulo:titulo || 'Registrado', detalle};
      })
      .filter(Boolean);
  }

  /*
    STABLE24 — saneamiento EXCLUSIVAMENTE VISUAL del Examen físico.
    - No modifica campos, almacenamiento, IDs, eventos ni módulos clínicos.
    - Conserva el contenido registrado; solo elimina prefijos repetidos y
      duplicados visuales producidos al capturar controles + resumen leído.
    - Si no puede normalizar con seguridad, devuelve el contenido stable.
  */
  function examenFisicoParesProfesional(){
    const originales = capturarPanel('hc_examen');
    if(!Array.isArray(originales) || !originales.length) return originales || [];

    try{
      let base = deduplicarPares(originales);

      /*
        PA canónica en Vista Integral — SOLO PRESENTACIÓN.
        El dueño del dato es Examen físico; hcPA conserva sistólica/diastólica.
        Aquí no se escribe, recalcula ni persiste ningún valor clínico.
        Si el formato no es inequívoco, se conserva el comportamiento previo.
      */
      const paCanonica = texto(document.getElementById('hcPA')?.value || '');
      const paMatch = paCanonica.match(/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/);

      if(paMatch){
        let paInsertada = false;

        base = base.reduce((salida,p)=>{
          const e = norm(p?.etiqueta || '');
          const esPA = (
            e === 'presion arterial' ||
            e === 'presion arterial sistolica' ||
            e === 'presion arterial diastolica'
          );

          if(!esPA){
            salida.push(p);
            return salida;
          }

          if(!paInsertada){
            salida.push(
              {
                ...p,
                etiqueta:'Presión arterial sistólica',
                valor:paMatch[1]+' mmHg',
                anchoCompleto:false
              },
              {
                ...p,
                etiqueta:'Presión arterial diastólica',
                valor:paMatch[2]+' mmHg',
                anchoCompleto:false
              }
            );
            paInsertada = true;
          }

          return salida;
        },[]);
      }

      const regiones = base
        .map(p=>normalizarClaveClinicaExamen(p?.etiqueta || ''))
        .filter(x=>x && x !== 'dato clinico');

      const salida = [];
      const vistos = [];

      const tieneSignosIndividuales = base.some(p=>{
        const e = norm(p?.etiqueta || '');
        return (
          e.includes('presion arterial') ||
          e.includes('frecuencia cardiaca') ||
          e.includes('frecuencia respiratoria') ||
          e.includes('temperatura') ||
          e.includes('saturacion')
        );
      });

      base.forEach(p=>{
        const etiqueta = limpiarEtiqueta(p?.etiqueta || 'Dato clínico');
        let valor = limpiarTextoClinico(p?.valor || '');
        if(!valor) return;

        const etiquetaNormSimple = norm(etiqueta);
        const valorNormSimple = norm(valor);

        /*
          Si PA/FC/FR/T°/SatO2 ya están visibles por separado,
          no repetir el renglón agregado "Signos vitales registrados...".
        */
        if(
          tieneSignosIndividuales &&
          etiquetaNormSimple === 'dato clinico' &&
          valorNormSimple.includes('signos vitales registrados')
        ){
          return;
        }

        const eNorm = normalizarClaveClinicaExamen(etiqueta);
        const vNormOriginal = normalizarClaveClinicaExamen(valor);

        // Omitir resúmenes agregados que ya contienen varias regiones individuales.
        const otrasRegiones = regiones
          .filter(r=>r && r !== eNorm && r.length >= 4)
          .filter(r=>vNormOriginal.includes(r));

        if(otrasRegiones.length >= 2) return;

        const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

        [
          new RegExp('^\\s*Examen\\s+f[ií]sico\\s+(?:por\\s+sistemas|regional)\\s*'+escRx(etiqueta)+'\\s*[:\\-]?\\s*','i'),
          new RegExp('^\\s*'+escRx(etiqueta)+'\\s+(?:Hallazgos\\s+regionales|Observaci[oó]n)\\s*[:\\-]?\\s*','i'),
          new RegExp('^\\s*'+escRx(etiqueta)+'\\s*[:\\-]\\s*','i')
        ].forEach(rx=>{ valor = valor.replace(rx,'').trim(); });

        // Quitar prefijos repetidos sin tocar el hallazgo clínico.
        for(let i=0;i<3;i++){
          const antes = valor;
          valor = valor
            .replace(/^Genitales\s*(?:Observaci[oó]n)?\s*[:\-]\s*/i,'')
            .replace(/^Canal\s+vaginal\s*(?:Observaci[oó]n)?\s*[:\-]\s*/i,'')
            .replace(/^Abdomen\s*(?:Hallazgos\s+regionales|Observaci[oó]n)?\s*[:\-]\s*/i,'')
            .replace(/^T[oó]rax\/Respiratorio\s*[:\-]\s*/i,'')
            .trim();
          if(valor === antes) break;
        }

        if(!valor) return;

        const vNorm = normalizarClaveClinicaExamen(valor);

        const duplicado = vistos.some(x=>{
          if(x.e === eNorm && (x.v === vNorm || x.v.includes(vNorm) || vNorm.includes(x.v))) return true;
          if(x.v === vNorm && vNorm.length > 8) return true;
          return false;
        });
        if(duplicado) return;

        vistos.push({e:eNorm,v:vNorm});

        salida.push({
          ...p,
          etiqueta,
          valor,
          anchoCompleto:Boolean(p?.anchoCompleto || valor.length > 150)
        });
      });

      return salida.length ? salida : originales;
    }catch(error){
      console.warn(MODULO,'No se pudo normalizar visualmente Examen físico; se conserva stable.',error);
      return originales;
    }
  }

  function normalizarClaveClinicaExamen(s){
    return norm(
      limpiarTextoClinico(s)
        .replace(/\bexamen\s+f[ií]sico\s+(?:regional|por\s+sistemas)\b/gi,'')
        .replace(/\bhallazgos\s+regionales\b/gi,'')
        .replace(/\bobservaci[oó]n\b/gi,'')
        .replace(/[:|·\-–—]+/g,' ')
    );
  }

  function antecedentesGrupoHTML(titulo, items){
    const lista = normalizarItemsAntecedente(items);
    if(!lista.length) return '';

    const grupoVacunas = /vacunas|covid/i.test(titulo);
    const grupoHabitos = /hábitos|actividad|alimentación/i.test(titulo);

    return '<div class="avi-subgroup avi-ant-group'+
      (grupoVacunas ? ' avi-ant-vacunas' : '')+
      (grupoHabitos ? ' avi-ant-habitos' : '')+'">'+
      '<h5>'+esc(titulo)+'</h5>'+
      '<div class="avi-ant-grid">'+
        lista.map(item=>
          '<div class="avi-ant-card">'+
            '<b class="avi-ant-title">'+esc(item.titulo)+'</b>'+
            (item.detalle ? '<p class="avi-ant-detail">'+
              esc(item.detalle)
                .replace(/Dosis\s+(\d+)/gi,'Dosis&nbsp;$1')
                .replace(/Consulta\s+#?(\d+)/gi,'Consulta&nbsp;#$1')+
            '</p>' : '')+
          '</div>'
        ).join('')+
      '</div>'+
    '</div>';
  }

  function antecedentesDesdeFuenteHTML(atencion){
    const h = historiaFuenteAntecedentes(atencion);
    if(!h){
      return paresHTML(capturarPanel('hc_antecedentes'));
    }

    try{
      const personales = texto(h.antecedentes_personales);
      const gineco = texto(h.antecedentes_gineco_obstetricos);

      const jsonPersonales = parsearAntecedenteEstructurado(
        personales,
        'AUROSANAX_ANT_PERSONALES_V1::'
      );

      const jsonGineco = parsearAntecedenteEstructurado(
        gineco,
        'AUROSANAX_ANT_GINECO_OBS_V1::'
      );

      const bloques = [];

      if(typeof window.auroExtraerItemsAntecedentePremium !== 'function'){
        return paresHTML(capturarPanel('hc_antecedentes'));
      }

      const patologicosFuente = jsonPersonales
        ? (jsonPersonales.patologicos || '')
        : (
            typeof window.auroExtraerFuentePatologicosPersonales === 'function'
              ? window.auroExtraerFuentePatologicosPersonales(personales)
              : personales
          );

      bloques.push(
        antecedentesGrupoHTML(
          'Patológicos personales',
          window.auroExtraerItemsAntecedentePremium(patologicosFuente,'patologia')
        )
      );

      bloques.push(
        antecedentesGrupoHTML(
          'Quirúrgicos',
          window.auroExtraerItemsAntecedentePremium(
            h.antecedentes_quirurgicos || '',
            'quirurgico'
          )
        )
      );

      bloques.push(
        antecedentesGrupoHTML(
          'Alergias',
          window.auroExtraerItemsAntecedentePremium(
            h.alergias || '',
            'alergia'
          )
        )
      );

      if(jsonPersonales){
        if(typeof window.auroResumenCovidItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'COVID-19',
              window.auroResumenCovidItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenVacunasItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Vacunas registradas',
              window.auroResumenVacunasItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenHabitosItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Hábitos registrados',
              window.auroResumenHabitosItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenEstiloVidaItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Actividad física registrada',
              window.auroResumenEstiloVidaItemsDesdeJson(jsonPersonales)
            )
          );
        }

        if(typeof window.auroResumenAlimentacionItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Alimentación',
              window.auroResumenAlimentacionItemsDesdeJson(jsonPersonales)
            )
          );
        }
      }else{
        if(typeof window.auroExtraerVacunasRegistradas === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Vacunas registradas',
              window.auroExtraerVacunasRegistradas(personales)
            )
          );
        }

        if(typeof window.auroExtraerHabitosRegistrados === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Hábitos registrados',
              window.auroExtraerHabitosRegistrados(personales)
            )
          );
        }

        if(typeof window.auroExtraerActividadRegistrada === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Actividad física registrada',
              window.auroExtraerActividadRegistrada(personales)
            )
          );
        }
      }

      if(jsonGineco){
        if(typeof window.auroResumenObstetricosItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Obstétricos',
              window.auroResumenObstetricosItemsDesdeJson(jsonGineco)
            )
          );
        }

        if(typeof window.auroResumenGinecologicosItemsDesdeJson === 'function'){
          bloques.push(
            antecedentesGrupoHTML(
              'Ginecológicos',
              window.auroResumenGinecologicosItemsDesdeJson(jsonGineco)
            )
          );
        }
      }else{
        bloques.push(
          antecedentesGrupoHTML(
            'Gineco-obstétricos',
            window.auroExtraerItemsAntecedentePremium(gineco,'gineco')
          )
        );
      }

      bloques.push(
        antecedentesGrupoHTML(
          'Medicación actual',
          window.auroExtraerItemsAntecedentePremium(
            h.medicacion_actual || '',
            'medicacion'
          )
        )
      );

      bloques.push(
        antecedentesGrupoHTML(
          'Familiares',
          window.auroExtraerItemsAntecedentePremium(
            h.antecedentes_familiares || '',
            'familiares'
          )
        )
      );

      const html = bloques.filter(Boolean).join('');
      return html || paresHTML(capturarPanel('hc_antecedentes'));

    }catch(error){
      console.warn(MODULO,'Falló lector estructurado de Antecedentes; fallback stable.',error);
      return paresHTML(capturarPanel('hc_antecedentes'));
    }
  }


  function diagnosticosVistaHTML(){
    const panel = document.getElementById('hc_diagnostico');
    if(!panel) return '';

    const items = [...panel.querySelectorAll('.auro-dx-item')];

    if(items.length){
      const tarjetas = [];

      items.forEach(item=>{
        const codigo = limpiarTextoClinico(
          item.querySelector('.auro-dx-code,[data-cie10],.cie10-code')?.textContent || ''
        );
        const nombre = limpiarTextoClinico(
          item.querySelector('.auro-dx-name,.auro-dx-desc,[data-diagnostico],.diagnostico-nombre')?.textContent || ''
        );
        const textoItem = limpiarTextoClinico(item.textContent || '');

        let clase = '';
        let tipo = '';

        if(/\bprincipal\b/i.test(textoItem)) clase = 'Principal';
        else if(/\basociad[oa]s?\b/i.test(textoItem)) clase = 'Asociado';

        if(/\bdefinitiv[oa]\b/i.test(textoItem)) tipo = 'Definitivo';
        else if(/\bpresuntiv[oa]\b/i.test(textoItem)) tipo = 'Presuntivo';

        const titulo = [codigo, nombre].filter(Boolean).join(' — ');
        if(!titulo) return;

        const meta = [clase,tipo].filter(Boolean);

        tarjetas.push(
          '<div class="avi-dx-card">'+
            '<div class="avi-dx-main">'+esc(titulo)+'</div>'+
            (meta.length
              ? '<div class="avi-dx-meta">'+meta.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>'
              : '')+
          '</div>'
        );
      });

      if(tarjetas.length){
        return '<div class="avi-dx-grid">'+tarjetas.join('')+'</div>';
      }
    }

    const pares = deduplicarPares(
      capturarPanel('hc_diagnostico').filter(p=>{
        const e = norm(p?.etiqueta || '');
        const v = norm(p?.valor || '');

        if(!v) return false;
        if(e === 'dx principal' && /^(si|sí|no)$/.test(v)) return false;
        if(e === 'dato clinico' && /^(definitivo|presuntivo)$/.test(v)) return false;
        if(v.includes('consultar protocolo')) return false;

        return true;
      })
    );

    return paresHTML(pares);
  }


  function valorClinicoVisualHTML(valor){
    /*
      SOLO presentación:
      protege rangos numéricos clínicos (3-4, 0-1, 11-12, etc.)
      sin modificar el dato almacenado.
    */
    return esc(valor).replace(
      /(^|[\s(:,;])(\d+)\s*[-–—]\s*(\d+)(?=$|[\s).,;:])/g,
      function(_, prefijo, a, b){
        return prefijo+'<span class="avi-nowrap">'+a+'-'+b+'</span>';
      }
    );
  }

  function paresHTMLClinico(pares, claseExtra){
    if(!Array.isArray(pares) || !pares.length) return '';

    return '<div class="avi-lines '+esc(claseExtra || '')+'">'+pares.map(p=>{
      const lista = listaDesdeValor(p.valor);

      if(lista){
        return '<div class="avi-line avi-span-full">'+
          '<b>'+esc(p.etiqueta)+'</b>'+
          '<ul class="avi-clean-list">'+
            lista.map(item=>'<li>'+valorClinicoVisualHTML(item)+'</li>').join('')+
          '</ul>'+
        '</div>';
      }

      return '<div class="avi-line'+(p.anchoCompleto?' avi-span-full':'')+'">'+
        '<b>'+esc(p.etiqueta)+'</b>'+
        '<p>'+valorClinicoVisualHTML(p.valor)+'</p>'+
      '</div>';
    }).join('')+'</div>';
  }

  function anamnesisVistaHTML(){
    const capturados = capturarPanel('hc_anamnesis');

    /*
      VISTA INTEGRAL > ANAMNESIS
      - "Plantilla sindrómica" es metadato de configuración/llenado y no
        forma parte del resumen clínico final.
      - Si "Enfermedad actual" ya contiene explícitamente un síntoma marcado
        como "Sí", no se repite después como campo aislado.
      - Si el síntoma NO está contenido en la narrativa, se conserva.
      - Solo presentación: no modifica Anamnesis, guardado ni datos.
    */
    const enfermedadActual = capturados.find(p=>
      norm(p?.etiqueta || '').includes('enfermedad actual')
    );

    const narrativaNorm = norm(enfermedadActual?.valor || '');

    const pares = capturados
      .filter(p=>{
        const etiqueta = norm(p?.etiqueta || '');
        const valor = norm(p?.valor || '');

        // Metadato interno de la plantilla: no mostrar en Vista Integral.
        if(etiqueta.includes('plantilla sindromica')) return false;

        /*
          Duplicado clínico:
          ocultar únicamente pares tipo "Sí" cuyo concepto ya está escrito
          dentro de Enfermedad actual. No se aplica a otros valores.
        */
        if(
          narrativaNorm &&
          valor === 'si' &&
          etiqueta &&
          narrativaNorm.includes(etiqueta)
        ){
          return false;
        }

        return true;
      })
      .map(p=>{
        const etiqueta = norm(p?.etiqueta || '');
        const valor = texto(p?.valor || '');

        const esNarrativo =
          etiqueta.includes('enfermedad actual') ||
          etiqueta.includes('motivo de consulta') ||
          etiqueta.includes('resumen') ||
          etiqueta.includes('observacion') ||
          valor.length > 120;

        return {
          ...p,
          anchoCompleto:Boolean(p?.anchoCompleto || esNarrativo)
        };
      });

    return paresHTMLClinico(pares,'avi-anamnesis-grid');
  }

  function obstetriciaVistaHTML(){
    const pares = capturarPanel('hc_obstetricia',{excluirObsRead:true});

    /*
      La sección solo existe si hay al menos un dato clínico real.
      Placeholders de un módulo no diligenciado NO crean una sección.
    */
    const vaciosObstetricia = new Set([
      '', '0', '-', '—', 'no clasificado', 'no aplica', 'ninguno',
      'ninguna', 'sin datos', 'sin dato', 'pendiente'
    ]);

    const utiles = pares.filter(p=>{
      const etiqueta = norm(p?.etiqueta || '');
      const valor = norm(p?.valor || '');

      if(!valor || vaciosObstetricia.has(valor)) return false;

      // textos de ayuda/estado del propio módulo
      if(
        valor.includes('no clasificado') ||
        valor.includes('sin informacion') ||
        valor.includes('no registrado') ||
        valor.includes('seleccione')
      ) return false;

      // una etiqueta aislada o marcador técnico tampoco cuenta como dato
      if(
        etiqueta === 'riesgo obstetrico' &&
        vaciosObstetricia.has(valor)
      ) return false;

      return true;
    });

    if(!utiles.length) return '';

    return paresHTMLClinico(utiles,'avi-obstetricia-grid');
  }

  function paresHTML(pares){
    if(!pares.length) return '';

    return '<div class="avi-lines">'+pares.map(p=>{
      const lista = listaDesdeValor(p.valor);

      if(lista){
        return '<div class="avi-line avi-span-full">'+
          '<b>'+esc(p.etiqueta)+'</b>'+
          '<ul class="avi-clean-list">'+
            lista.map(item=>'<li>'+esc(item)+'</li>').join('')+
          '</ul>'+
        '</div>';
      }

      return '<div class="avi-line'+(p.anchoCompleto?' avi-span-full':'')+'">'+
        '<b>'+esc(p.etiqueta)+'</b>'+
        '<p>'+esc(p.valor)+'</p>'+
      '</div>';
    }).join('')+'</div>';
  }

  /* Contadores visuales por clase REAL de registro. No cuentan contenedores. */
  function contarRegistrosVisiblesVistaIntegral(titulo,contenido){
    const plantilla=document.createElement('template');
    plantilla.innerHTML=String(contenido || '');
    const base=plantilla.content;
    const contar=selector=>base.querySelectorAll(selector).length;
    const seccionNorm=norm(titulo);
    if(seccionNorm.includes('antecedentes')){
      return contar('.avi-ant-card') || contar('.avi-line');
    }
    if(seccionNorm.includes('diagnostico')){
      return contar('.avi-dx-card') || contar('.avi-line');
    }
    if(seccionNorm.includes('certificados')) return contar('.avi-cert-page');
    if(seccionNorm.includes('recomendaciones')) return contar('.avi-rec-page');
    if(seccionNorm === 'recetas') return contar('.avi-rx-card');
    if(seccionNorm === 'plan'){
      // Cada apartado clínico cuenta una vez; cada orden formal, una vez.
      return contar('.avi-plan-block:not([data-avi-ordenes-formales])') +
        contar('.avi-orden-formal') +
        (contar('[data-avi-ordenes-formales]') && !contar('.avi-orden-formal') ? 1 : 0);
    }
    return contar('.avi-line') || contar('.avi-med-card');
  }

  function actualizarContadorPlanVistaIntegral(slot){
    const sec=slot?.querySelector('.avi-section');
    if(!sec) return;
    const contenido=sec.querySelector('.avi-section-body')?.innerHTML || '';
    const total=contarRegistrosVisiblesVistaIntegral('Plan',contenido);
    const label=sec.querySelector('.avi-section-label');
    if(!label) return;
    let contador=label.querySelector('.avi-section-count');
    if(!total){contador?.remove();return;}
    if(!contador){
      contador=document.createElement('small');
      contador.className='avi-section-count';
      label.appendChild(contador);
    }
    contador.textContent=String(total);
  }

  function seccion(titulo, icono, contenido, abierta){
    if(!texto(contenido)) return '';

    /*
      AUROSANAX VISTA INTEGRAL ÉLITE:
      contador exclusivamente visual calculado sobre el HTML ya renderizado.
      No modifica datos, IDs, guardado ni relaciones clínicas.
    */
    // Contar elementos semánticos exactos, no coincidencias parciales de clases.
    // Antes «avi-lines» se confundía con «avi-line», sumando 1 extra.
    const totalVisual = contarRegistrosVisiblesVistaIntegral(titulo,contenido);
    const contador = totalVisual
      ? '<small class="avi-section-count">'+totalVisual+'</small>'
      : '';

    return '<details class="avi-section" '+(abierta?'open':'')+'>'+
      '<summary>'+
        '<span class="avi-section-label"><i class="bi '+esc(icono)+'"></i>'+esc(titulo)+contador+'</span>'+
        '<i class="bi bi-chevron-down avi-chevron"></i>'+
      '</summary>'+
      '<div class="avi-section-body">'+contenido+'</div>'+
    '</details>';
  }

  function medicamentoCards(valor){
    const raw = texto(valor);
    if(!raw) return '';

    let data = parseJSON(raw,null);
    if(!data){
      const lista = listaDesdeValor(raw);
      const arr = lista || [raw];
      return '<div class="avi-med-grid">'+arr.map(x=>
        '<article class="avi-med-card"><h5>Medicamento</h5><p>'+esc(x)+'</p></article>'
      ).join('')+'</div>';
    }

    if(!Array.isArray(data)) data = [data];

    const html = data.filter(Boolean).map((m,i)=>{
      if(typeof m === 'string'){
        return '<article class="avi-med-card"><h5>Medicamento '+(i+1)+'</h5><p>'+esc(m)+'</p></article>';
      }

      const nombre = texto(m.med || m.medicamento || m.nombre || m.texto);
      const filas = [
        ['Presentación',m.pres || m.presentacion],
        ['Vía',m.via],
        ['Cantidad',m.cantidad],
        ['Frecuencia',m.frec || m.frecuencia],
        ['Duración',m.dur || m.duracion],
        ['Indicaciones',m.ind || m.indicaciones]
      ].filter(x=>!esVacio(x[1]));

      if(!nombre && !filas.length) return '';

      return '<article class="avi-med-card">'+
        '<h5>'+esc(nombre || ('Medicamento '+(i+1)))+'</h5>'+
        '<div class="avi-med-details">'+filas.map(f=>
          '<div><span>'+esc(f[0])+'</span><b>'+esc(f[1])+'</b></div>'
        ).join('')+'</div>'+
      '</article>';
    }).filter(Boolean).join('');

    return html ? '<div class="avi-med-grid">'+html+'</div>' : '';
  }

  function planHTML(opciones){
    opciones = opciones || {};
    const pares = capturarPanel('hc_plan');
    if(!pares.length) return '';

    /*
      V1.22 — ESTRUCTURA VISUAL CANÓNICA DE PLAN
      Solo se presentan categorías clínicas propias del módulo Plan cuando
      contienen información real. Medicamentos/receta y diagnósticos no se
      representan aquí para evitar duplicidad con sus módulos documentales.
    */
    const grupos = {
      planTerapeutico:[],
      indicaciones:[],
      ordenes:[],
      interconsultas:[],
      evaluaciones:[],
      proximoControl:[]
    };

    pares.forEach(p=>{
      const n = norm(p.etiqueta);
      const v = norm(p.valor);

      const esBanderaInternaPlan =
        (n.includes(' en plan') || n.endsWith('en plan')) &&
        (v === 'si' || v === 'no' || v === 'true' || v === 'false');

      if(esBanderaInternaPlan) return;

      /* No duplicar receta/medicamentos ni diagnósticos dentro de Plan. */
      if(
        n.includes('medicamento') ||
        n.includes('receta') ||
        n.includes('diagnost')
      ) return;

      if(
        n.includes('plan terapeutico') ||
        n.includes('plan de tratamiento') ||
        n.includes('plan tratamiento')
      ) grupos.planTerapeutico.push(p);
      else if(n.includes('interconsulta')) { const items=interconsultasClinicasVista(p.valor); items.forEach(function(item){grupos.interconsultas.push({...p,valor:item});}); }
      else if(n.includes('evaluacion')) grupos.evaluaciones.push(p);
      else if(n.includes('proximo control') || n.includes('próximo control')) grupos.proximoControl.push(p);
      else if(n.includes('orden') || n.includes('examen')) grupos.ordenes.push(p);
      else if(n.includes('indicacion')) grupos.indicaciones.push(p);
    });

    function bloqueDOM(titulo,lista){
      if(!Array.isArray(lista) || !lista.length) return '';
      const valores = lista.map(function(p){
        return {
          etiqueta:'',
          valor:p.valor,
          anchoCompleto:true
        };
      });
      return '<div class="avi-subgroup avi-plan-block"><h5>'+esc(titulo)+'</h5>'+
        paresHTMLClinico(valores,'avi-plan-prose')+
      '</div>';
    }

    return [
      bloqueDOM('Plan terapéutico',grupos.planTerapeutico),
      bloqueDOM('Órdenes médicas',grupos.ordenes),
      bloqueDOM('Interconsulta',grupos.interconsultas),
      bloqueDOM('Evaluaciones',grupos.evaluaciones),
      bloqueDOM('Próximo control',grupos.proximoControl),
      bloqueDOM('Indicaciones para el paciente',grupos.indicaciones)
    ].filter(Boolean).join('');
  }

  /*
    AUROSANAX V1.21 — FUENTE CANÓNICA DEL PLAN PARA VISTA INTEGRAL
    ----------------------------------------------------------------
    Problema corregido:
    - capturarPanel('hc_plan') depende del DOM actualmente hidratado.
    - una atención histórica puede tener plan_terapeutico persistido aunque el
      DOM todavía no lo exponga al momento de construir Vista Integral.

    Solución:
    - la Vista Integral sigue usando el DOM como render temprano/fallback;
    - inmediatamente consulta el lector público de plan.js, que hace GET sobre
      buscarPlanPorAtencion;
    - valida id_atencion + paciente + historia antes de pintar;
    - nunca guarda, nunca modifica Plan, nunca hace POST.
  */
  function valorPlanPersistido(plan){
    const claves = Array.prototype.slice.call(arguments,1);
    for(const k of claves){
      const v = plan && plan[k];
      if(v !== undefined && v !== null && !esVacio(v)) return v;
    }
    return '';
  }

  /* Vista integral: contenido semántico de interconsulta; ignora valores por defecto. */
  function interconsultasClinicasVista(valor){
    let data=typeof valor==='string' ? parseJSON(valor,null) : valor;
    if(data === null){
      const literal=limpiarTextoClinico(valor);
      return literal && !/^[\[{]/.test(literal) ? [literal] : [];
    }
    const elementos=Array.isArray(data) ? data : [data];
    const salida=[];
    elementos.forEach(function(x){
      if(typeof x==='string'){
        const t=limpiarTextoClinico(x);
        if(t) salida.push(t);
        return;
      }
      if(!x || typeof x!=='object') return;
      const claves=['tipo','especialidad','profesional','motivo','observaciones'];
      const relevantes=claves.map(function(k){return [k,limpiarTextoClinico(x[k])];})
        .filter(function(kv){return !!kv[1];});
      if(!relevantes.length) return;
      const etiquetas={tipo:'Tipo',especialidad:'Especialidad',profesional:'Profesional',motivo:'Motivo',observaciones:'Observaciones'};
      const extras=['prioridad','estado'].map(function(k){return [k,limpiarTextoClinico(x[k])];})
        .filter(function(kv){return kv[1] && !['normal','pendiente'].includes(norm(kv[1]));});
      salida.push(relevantes.concat(extras).map(function(kv){return (etiquetas[kv[0]]||kv[0])+': '+kv[1];}).join(' · '));
    });
    return [...new Set(salida)];
  }
  function bloqueInterconsultaVista(valor){
    const items=interconsultasClinicasVista(valor);
    if(!items.length) return '';
    return '<div class="avi-subgroup avi-plan-block"><h5>Interconsulta</h5>'+ 
      '<ul class="avi-clean-list">'+items.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></div>';
  }

  function bloquePlanPersistidoLista(titulo,valor,opciones){
    opciones = opciones || {};
    const limpio = limpiarTextoClinico(valor);
    if(!limpio) return '';

    const lista = listaDesdeValor(valor);
    let contenido = '';

    if(lista && lista.length){
      contenido = '<ul class="avi-clean-list">'+
        lista.map(function(item){
          return '<li>'+valorClinicoVisualHTML(limpiarTextoClinico(item))+'</li>';
        }).join('')+
      '</ul>';
    }else{
      contenido = '<p class="avi-plan-text">'+valorClinicoVisualHTML(limpio)+'</p>';
    }

    return '<div class="avi-subgroup avi-plan-block">'+
      '<h5>'+esc(titulo)+'</h5>'+
      '<div class="avi-plan-content">'+contenido+'</div>'+
    '</div>';
  }

  function planPersistidoHTMLVistaIntegral(plan,opciones){
    opciones = opciones || {};
    plan = plan || {};

    /*
      Contrato visual V1.22:
      mostrar únicamente los ítems propios de Plan que tengan contenido real.
      No repetir medicamentos/receta ni diagnósticos dentro de esta sección.
    */
    const bloques = [];

    const tratamiento = valorPlanPersistido(
      plan,'plan_terapeutico','plan_tratamiento','planTratamiento'
    );
    if(tratamiento){
      bloques.push(bloquePlanPersistidoLista('Plan terapéutico',tratamiento));
    }

    const ordenes = valorPlanPersistido(
      plan,'ordenes_medicas','ordenes','examenes_solicitados'
    );
    if(ordenes){
      bloques.push(bloquePlanPersistidoLista('Órdenes médicas',ordenes));
    }

    const interconsulta = valorPlanPersistido(
      plan,'interconsulta','interconsultas','interconsulta_plan'
    );
    if(interconsulta){
      bloques.push(bloqueInterconsultaVista(interconsulta));
    }

    const evaluaciones = valorPlanPersistido(
      plan,'evaluaciones_plan','evaluaciones','evaluacion_plan'
    );
    if(evaluaciones){
      bloques.push(bloquePlanPersistidoLista('Evaluaciones',evaluaciones));
    }

    const proximo = valorPlanPersistido(
      plan,'proximo_control','control','proximoControl'
    );
    if(proximo){
      bloques.push(bloquePlanPersistidoLista('Próximo control',fechaVisual(proximo)));
    }

    const indicaciones = valorPlanPersistido(
      plan,'indicaciones_paciente','indicaciones','indicacionesPaciente'
    );
    if(indicaciones){
      bloques.push(bloquePlanPersistidoLista('Indicaciones para el paciente',indicaciones));
    }

    return bloques.filter(Boolean).join('');
  }

  function textosCanonicosPlanVistaIntegral(plan){
    const campos = [
      valorPlanPersistido(plan,'plan_terapeutico','plan_tratamiento','planTratamiento'),
      valorPlanPersistido(plan,'indicaciones_paciente','indicaciones','indicacionesPaciente'),
      valorPlanPersistido(plan,'ordenes_medicas','ordenes','examenes_solicitados'),
      valorPlanPersistido(plan,'interconsulta','interconsultas','interconsulta_plan'),
      valorPlanPersistido(plan,'evaluaciones_plan','evaluaciones','evaluacion_plan')
    ];

    const set = new Set();
    campos.forEach(function(v){
      const limpio = limpiarTextoClinico(v);
      if(limpio) set.add(norm(limpio));

      const lista = listaDesdeValor(v);
      (lista || []).forEach(function(item){
        const n = norm(limpiarTextoClinico(item));
        if(n) set.add(n);
      });
    });
    return set;
  }

  function indicacionesHistoricasRecetaHTML(idAtencion,canonicos){
    const recetas = recetasPorAtencion(idAtencion);
    const vistos = new Set();
    const items = [];

    (recetas || []).forEach(function(r){
      const raw = limpiarTextoClinico(r?.indicaciones || '');
      if(!raw) return;

      const lista = listaDesdeValor(raw) || [raw];
      lista.forEach(function(item){
        const limpio = limpiarTextoClinico(item);
        const n = norm(limpio);
        if(!n || vistos.has(n)) return;
        if(canonicos && canonicos.has(n)) return;

        vistos.add(n);
        items.push(limpio);
      });
    });

    if(!items.length) return '';

    return '<div class="avi-note">'+
      '<b>Indicaciones complementarias</b>'+
      '<ul class="avi-clean-list">'+
        items.map(function(item){ return '<li>'+esc(item)+'</li>'; }).join('')+
      '</ul>'+
      '<p class="avi-technical-id" style="margin-top:8px!important">'+
        'Registro histórico asociado a la receta de esta misma atención.'+
      '</p>'+
    '</div>';
  }

  function validarPlanPersistidoVistaIntegral(plan,atencion,idAtencion){
    if(!plan || typeof plan !== 'object') return false;

    const idPlanAtencion = texto(plan.id_atencion);
    if(idPlanAtencion && idPlanAtencion !== texto(idAtencion)) return false;

    const idPacientePlan = texto(plan.id_paciente);
    const idPacienteAtencion = texto(atencion?.id_paciente);
    if(idPacientePlan && idPacienteAtencion && idPacientePlan !== idPacienteAtencion){
      return false;
    }

    const idHistoriaPlan = texto(plan.id_historia);
    const idHistoriaAtencion = texto(atencion?.id_historia);
    if(idHistoriaPlan && idHistoriaAtencion && idHistoriaPlan !== idHistoriaAtencion){
      return false;
    }

    return Boolean(texto(plan.id_plan) || idPlanAtencion);
  }

  /* Documentos formales emitidos: fuente oficial ordenes_medicas, solo GET. */
  function ordenesFormalesHTML(registros,atencion,id){
    const vistos=new Set();
    const tarjetas=[];
    (Array.isArray(registros)?registros:[]).forEach(function(reg){
      if(texto(reg?.id_atencion)!==id || !texto(reg?.id_orden)) return;
      if(texto(reg?.id_paciente) && texto(atencion?.id_paciente) &&
         texto(reg.id_paciente)!==texto(atencion.id_paciente)) return;
      if(texto(reg?.id_historia) && texto(atencion?.id_historia) &&
         texto(reg.id_historia)!==texto(atencion.id_historia)) return;
      if(/anulad|reemplaz|eliminad/i.test(norm(reg.estado))) return;
      const clave=texto(reg.id_orden);
      if(vistos.has(clave)) return;
      const d=parseJSON(reg.detalle_json,{}) || {};
      const items=(Array.isArray(d.items)?d.items:[]).map(function(x){
        if(typeof x==='string') return {orden:limpiarTextoClinico(x),cat:'',obs:''};
        if(!x || typeof x!=='object') return null;
        return {
          orden:limpiarTextoClinico(x.orden||x.nombre||x.examen||x.procedimiento||x.descripcion||x.texto||x.nombre_examen),
          cat:limpiarTextoClinico(x.cat||x.categoria),
          obs:limpiarTextoClinico(x.obs||x.observacion||x.observaciones),
          cie:limpiarTextoClinico(x.codigo_cie10),
          diagnostico:limpiarTextoClinico(x.diagnostico)
        };
      }).filter(x=>x&&x.orden);
      if(!items.length) return;
      vistos.add(clave);
      const centro=d.centro||{};
      const medico=d.medico||{};
      const paciente=d.paciente||{};
      const historia=d.historia||{};
      const nombreCentro=primero(centro,['nombre','nombre_clinica','nombre_centro','nombre_comercial','razon_social'])||'AUROSANAX';
      const especialidad=primero(medico,['especialidad'])||texto(reg.especialidad||atencion?.especialidad_atencion||atencion?.especialidad);
      const nombreMedico=primero(medico,['nombre'])||texto(reg.nombre_medico||atencion?.nombre_medico);
      const direccion=[primero(centro,['direccion','direccion_clinica']),primero(centro,['ciudad','ciudad_clinica']),primero(centro,['provincia','provincia_clinica']),primero(centro,['pais','pais_clinica'])].filter(Boolean).join(' · ');
      const contacto=[primero(centro,['telefono','telefono_clinica']),primero(centro,['email','correo']),primero(centro,['web','sitio_web'])].filter(Boolean).join(' · ');
      const datos=[
        ['Paciente',texto(reg.nombre_paciente||paciente.nombre)],
        ['Identificación',texto(reg.numero_documento||paciente.numero_documento)],
        ['Historia clínica',texto(reg.id_historia||historia.numero_historia||historia.id_historia)],
        ['Consulta',texto(reg.numero_consulta||d.numero_consulta||atencion?.numero_consulta)],
        ['ID orden',clave],['Versión',texto(reg.version||'1')]
      ];
      const dx=(Array.isArray(d.diagnosticos)?d.diagnosticos:[]).filter(x=>x&&(x.codigo_cie10||x.descripcion));
      tarjetas.push('<article class="avi-orden-formal avi-orden-documento" data-avi-orden-documento="'+esc(clave)+'">'+
        '<header class="avi-orden-head"><strong>'+esc(nombreCentro)+'</strong><span>'+esc(fechaVisual(reg.fecha_emision||d.fecha_emision))+'</span></header>'+
        '<h4 class="avi-orden-title">ORDEN MÉDICA</h4>'+
        '<div class="avi-orden-acciones"><button type="button" class="avi-btn avi-btn-primary" data-avi-orden-oficial="'+esc(clave)+'"><i class="bi bi-file-earmark-medical"></i> Ver documento oficial / Imprimir</button></div>'+
        '<div class="avi-orden-datos">'+datos.filter(x=>x[1]).map(function(x){return '<div><b>'+esc(x[0])+':</b> '+esc(x[1])+'</div>';}).join('')+'</div>'+
        (dx.length?'<div class="avi-orden-dx"><b>DIAGNÓSTICOS DE LA ATENCIÓN</b>'+dx.map(x=>'<div>'+esc([x.codigo_cie10,x.descripcion].filter(Boolean).join(' — '))+'</div>').join('')+'</div>':'')+
        '<div class="avi-orden-tabla-wrap"><table class="avi-orden-tabla"><thead><tr><th>N.º</th><th>Examen / procedimiento</th><th>Categoría</th><th>Observación</th></tr></thead><tbody>'+
        items.map(function(x,i){return '<tr><td>'+esc(i+1)+'</td><td><b>'+esc(x.orden)+'</b>'+(x.cie?'<div>CIE-10: '+esc(x.cie)+(x.diagnostico?' · '+esc(x.diagnostico):'')+'</div>':'')+'</td><td>'+esc(x.cat)+'</td><td>'+esc(x.obs)+'</td></tr>';}).join('')+'</tbody></table></div>'+
        (texto(d.observaciones_generales)?'<p class="avi-orden-observaciones"><b>Observaciones:</b> '+esc(d.observaciones_generales)+'</p>':'')+
        '<footer class="avi-orden-pie"><div class="avi-orden-centro">'+
        (direccion?'<div>'+esc(direccion)+'</div>':'')+(contacto?'<div>'+esc(contacto)+'</div>':'')+
        (centro.razon_social?'<div>'+esc(centro.razon_social)+(centro.ruc?' · RUC '+esc(centro.ruc):'')+'</div>':'')+
        '<div>Estado documental: '+esc(reg.estado||'Emitida')+' · Versión '+esc(reg.version||1)+'</div></div>'+
        '<div class="avi-orden-firma"><div class="avi-orden-firma-line"></div><b>'+esc(nombreMedico||'Profesional tratante')+'</b>'+
        (especialidad?'<span>'+esc(especialidad)+'</span>':'')+
        (medico.registro_msp?'<span>Registro MSP/ACESS: '+esc(medico.registro_msp)+'</span>':'')+
        (medico.registro_senescyt?'<span>Registro SENESCYT: '+esc(medico.registro_senescyt)+'</span>':'')+
        '<small>Firma y sello</small></div></footer></article>');
    });
    return tarjetas.length?'<div class="avi-subgroup avi-plan-block" data-avi-ordenes-formales><h5>Órdenes médicas emitidas · Exámenes y procedimientos</h5>'+tarjetas.join('')+'</div>':'';
  }
  /* Documentos independientes: no se insertan dentro del resumen Plan. */
  function incluirOrdenesEnPlanVista(overlay,id){
    if(!overlay || texto(overlay.dataset.aviAtencion)!==id) return;
    if(document.getElementById('auroVistaIntegralOverlay')!==overlay) return;
    const activo=texto(typeof window.getIdAtencionActiva==='function' ? window.getIdAtencionActiva() : '');
    if(activo && activo!==id) return;
    const slot=overlay.querySelector('[data-avi-ordenes-documentos="'+CSS.escape(id)+'"]');
    if(!slot) return;
    const html=overlay.__aviOrdenesFormalesHTML||'';
    slot.innerHTML=html ? seccion('Órdenes médicas emitidas','bi-file-earmark-medical',html,true) : '';
  }
  /* Vista Integral solo lee; el módulo de Órdenes sigue siendo propietario de su visor. */
  function registroOrdenesParaVista(resp,id,atencion){
    const remotos=Array.isArray(resp)?resp:Array.isArray(resp?.registros)?resp.registros:
      Array.isArray(resp?.data)?resp.data:[];
    const estado=window.IASYN_ORDENES_MEDICAS?.estado;
    const memoria=Array.isArray(estado?.ordenesEmitidas)?estado.ordenesEmitidas:[];
    const todos=[...remotos,...memoria];
    const vistos=new Set();
    return todos.filter(function(r){
      if(!r || texto(r.id_atencion)!==id || !texto(r.id_orden)) return false;
      if(texto(r.id_paciente)&&texto(atencion?.id_paciente) &&
         texto(r.id_paciente)!==texto(atencion.id_paciente)) return false;
      if(texto(r.id_historia)&&texto(atencion?.id_historia) &&
         texto(r.id_historia)!==texto(atencion.id_historia)) return false;
      const clave=texto(r.id_orden);
      if(vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  }
  function verDocumentoOficialOrden(idOrden,overlay){
    const id=texto(overlay?.dataset?.aviAtencion);
    if(!id || document.getElementById('auroVistaIntegralOverlay')!==overlay) return;
    const activo=texto(typeof window.getIdAtencionActiva==='function'?window.getIdAtencionActiva():'');
    if(activo && activo!==id) return;
    const reg=(overlay.__aviOrdenesRegistros||[]).find(function(r){
      return texto(r.id_orden)===texto(idOrden)&&texto(r.id_atencion)===id;
    });
    if(!reg){alert('No se encontró esta orden médica emitida en la consulta seleccionada.');return;}
    const api=window.IASYN_ORDENES_MEDICAS;
    if(!api || typeof api.imprimir!=='function'){
      alert('El visor oficial de Órdenes médicas no está disponible.');return;
    }
    try{
      const detalle=parseJSON(reg.detalle_json,{})||{};
      api.imprimir(Object.assign({},reg,{detalle_json:detalle}));
    }catch(err){
      console.error(MODULO,'No se pudo abrir el documento oficial de la orden.',err);
      alert('No se pudo abrir el documento oficial. Revise la consola o el registro emitido.');
    }
  }
  async function completarOrdenesFormalesVista(idAtencion,atencion,overlayEsperado){
    const id=texto(idAtencion);
    const resp=await getSoloLecturaVistaIntegral('listarOrdenesMedicasPorAtencion',{id_atencion:id});
    if(document.getElementById('auroVistaIntegralOverlay')!==overlayEsperado ||
       texto(overlayEsperado?.dataset?.aviAtencion)!==id) return;
    const registros=registroOrdenesParaVista(resp,id,atencion);
    overlayEsperado.__aviOrdenesRegistros=registros;
    overlayEsperado.__aviOrdenesFormalesHTML=ordenesFormalesHTML(registros,atencion,id);
    incluirOrdenesEnPlanVista(overlayEsperado,id);
    const api=window.IASYN_ORDENES_MEDICAS;
    if(api&&typeof api.construirDocumento==='function'){
      const originales=overlayEsperado.__aviOrdenesRegistros||[];
      originales.forEach(function(reg){
        const destino=Array.from(overlayEsperado.querySelectorAll('[data-avi-orden-documento]')).find(function(e){return e.getAttribute('data-avi-orden-documento')===texto(reg.id_orden);});
        if(!destino) return;
        try{
          const detalle=parseJSON(reg.detalle_json,{})||{};
          const documento=api.construirDocumento(Object.assign({},reg,{detalle_json:detalle}));
          if(typeof documento==='string'&&documento.includes('aom-paper')){
            destino.innerHTML=documento;
            destino.classList.add('avi-orden-oficial-embebida');
          }
        }catch(error){console.warn(MODULO,'No se pudo integrar orden oficial; se conserva la vista de respaldo.',error);}
      });
    }
  }

  async function completarPlanVistaIntegral(idAtencion,atencion,hayRecetas){
    const id = texto(idAtencion);
    if(!id) return;

    const idActivoAntes = texto(
      typeof window.getIdAtencionActiva === 'function'
        ? window.getIdAtencionActiva()
        : ''
    );
    if(idActivoAntes !== id) return;

    let plan = null;

    try{
      if(typeof window.buscarPlanClinicoPorAtencionDesdeSheets === 'function'){
        plan = await window.buscarPlanClinicoPorAtencionDesdeSheets(id);
      }else{
        plan = await getSoloLecturaVistaIntegral(
          'buscarPlanPorAtencion',
          {id_atencion:id}
        );
      }
    }catch(error){
      console.warn(MODULO,'No se pudo leer el Plan persistido de la atención.',error);
      return;
    }

    const overlay = document.getElementById('auroVistaIntegralOverlay');
    if(!overlay) return;

    const idActivoDespues = texto(
      typeof window.getIdAtencionActiva === 'function'
        ? window.getIdAtencionActiva()
        : ''
    );
    if(idActivoDespues !== id) return;

    if(!validarPlanPersistidoVistaIntegral(plan,atencion,id)) return;

    const slotPlan = overlay.querySelector(
      '[data-avi-plan="'+CSS.escape(id)+'"]'
    );

    if(slotPlan){
      const htmlPlan = planPersistidoHTMLVistaIntegral(plan,{
        omitirMedicamentos:Boolean(hayRecetas)
      });

      slotPlan.innerHTML = seccion(
        'Plan','bi-list-check',htmlPlan,true
      );
      incluirOrdenesEnPlanVista(overlay,id);
    }

    const slotLegacy = overlay.querySelector(
      '[data-avi-indicaciones-legacy="'+CSS.escape(id)+'"]'
    );

    if(slotLegacy){
      const canonicos = textosCanonicosPlanVistaIntegral(plan);
      const legacy = indicacionesHistoricasRecetaHTML(id,canonicos);

      slotLegacy.innerHTML = seccion(
        'Indicaciones complementarias','bi-card-text',legacy,false
      );
    }
  }

  function indicacionesHTML(valor){
    const raw = texto(valor);
    if(!raw || esVacio(raw)) return '';

    const lista = listaDesdeValor(raw);
    if(lista){
      return '<div class="avi-note">'+
        '<b>Indicaciones</b>'+
        '<ul class="avi-clean-list">'+
          lista.map(item=>'<li>'+esc(item)+'</li>').join('')+
        '</ul>'+
      '</div>';
    }

    return '<div class="avi-note"><b>Indicaciones</b><p>'+esc(raw)+'</p></div>';
  }

  function medicamentosRecetaArray(valor){
    const raw = texto(valor);
    if(!raw) return [];

    let data = parseJSON(raw,null);
    if(data && !Array.isArray(data)) data = [data];

    if(Array.isArray(data)){
      return data.filter(Boolean).map(function(m){
        if(typeof m === 'string'){
          return { med:texto(m), pres:'', cantidad:'', via:'', frec:'', dur:'', ind:'', continuo:'' };
        }
        return {
          med:texto(m.med || m.medicamento || m.nombre || m.texto),
          pres:texto(m.pres || m.presentacion || m.concentracion),
          cantidad:texto(m.cantidad),
          via:texto(m.via),
          frec:texto(m.frec || m.frecuencia),
          dur:texto(m.dur || m.duracion),
          ind:texto(m.ind || m.indicaciones),
          continuo:texto(m.continuo)
        };
      }).filter(function(m){
        return !!(m.med || m.pres || m.cantidad || m.via || m.frec || m.dur || m.ind);
      });
    }

    return raw.split(/\n+/).map(function(linea){
      const med = texto(linea).replace(/^\s*\d+\.\s*/,'');
      return med ? { med:med, pres:'', cantidad:'', via:'', frec:'', dur:'', ind:'', continuo:'' } : null;
    }).filter(Boolean);
  }

  function indicacionMedicamentoReceta(m){
    const partes = [];
    if(m.via) partes.push('Vía: '+m.via);
    if(m.frec) partes.push('Frecuencia: '+m.frec);
    if(m.dur) partes.push('Duración: '+m.dur);
    if(m.continuo && !/^(no|false|0)$/i.test(m.continuo)) partes.push('Tratamiento continuo');
    if(m.ind) partes.push(m.ind);
    return partes.join(' · ');
  }

  function tablaMedicamentosRecetaHTML(valor){
    const medicamentos = medicamentosRecetaArray(valor);
    if(!medicamentos.length) return medicamentoCards(valor);

    return '<div class="avi-rx-table-wrap">'+
      '<table class="avi-rx-table">'+
        '<thead><tr>'+
          '<th class="avi-rx-num">N.º</th>'+
          '<th>Medicamento</th>'+
          '<th>Presentación / concentración</th>'+
          '<th class="avi-rx-cant">Cantidad</th>'+
          '<th>Indicaciones</th>'+
        '</tr></thead>'+
        '<tbody>'+medicamentos.map(function(m,i){
          return '<tr>'+
            '<td class="avi-rx-num" data-label="N.º">'+esc(i+1)+'</td>'+
            '<td data-label="Medicamento"><strong>'+esc(m.med || 'Medicamento')+'</strong></td>'+
            '<td data-label="Presentación / concentración">'+esc(m.pres || '—')+'</td>'+
            '<td class="avi-rx-cant" data-label="Cantidad">'+esc(m.cantidad || '—')+'</td>'+
            '<td data-label="Indicaciones">'+esc(indicacionMedicamentoReceta(m) || '—')+'</td>'+
          '</tr>';
        }).join('')+'</tbody>'+
      '</table>'+
    '</div>';
  }

  function diagnosticosRecetaNormalizados(valor){
    let lista = valor;

    if(typeof lista === 'string'){
      const parsed = parseJSON(lista,null);
      lista = parsed == null ? [] : parsed;
    }

    if(lista && !Array.isArray(lista)) lista = [lista];

    const salida = [];
    const vistos = new Set();

    (Array.isArray(lista) ? lista : []).forEach(function(dx,index){
      dx = dx || {};

      const estado = norm(dx.estado || 'Activo');
      if(['inactivo','inactiva','anulado','anulada','eliminado','eliminada'].includes(estado)) return;

      const codigo = texto(
        dx.codigo || dx.codigo_cie10 || dx.diagnostico_cie10 || dx.cie10 || ''
      );
      const nombre = texto(
        dx.descripcion || dx.diagnostico || dx.nombre || dx.detalle || dx.texto || ''
      );

      if(!codigo && !nombre) return;

      const principal = dx.principal === true ||
        ['si','sí','true','1'].includes(norm(dx.principal));

      const clave = norm(codigo+'|'+nombre);
      if(!clave || vistos.has(clave)) return;
      vistos.add(clave);

      salida.push({
        codigo:codigo,
        nombre:nombre,
        jerarquia:principal ? 'Principal' : '',
        tipo:texto(dx.tipo_diagnostico || dx.tipo || ''),
        principal:principal,
        orden:index
      });
    });

    if(salida.length && !salida.some(function(dx){ return dx.principal; })){
      salida[0].principal = true;
      salida[0].jerarquia = 'Principal';
    }

    salida.forEach(function(dx){
      if(!dx.jerarquia && salida.length > 1) dx.jerarquia = 'Asociado';

      const tipoNorm = norm(dx.tipo);
      if(tipoNorm === 'definitivo') dx.tipo = 'Definitivo';
      else if(tipoNorm === 'presuntivo') dx.tipo = 'Presuntivo';
    });

    return salida.sort(function(a,b){
      if(a.principal !== b.principal) return Number(b.principal) - Number(a.principal);
      return a.orden - b.orden;
    });
  }

  function diagnosticosAtencionActivaParaReceta(idAtencion){
    const esperado = texto(idAtencion);
    if(!esperado) return [];

    let activo = '';

    try{
      if(typeof window.getIdAtencionActiva === 'function'){
        activo = texto(window.getIdAtencionActiva());
      }
    }catch(_){}

    if(!activo){
      try{
        const ctx = typeof window.obtenerContextoAtencionActual === 'function'
          ? window.obtenerContextoAtencionActual()
          : null;
        activo = texto(ctx?.id_atencion);
      }catch(_){}
    }

    /*
      Fallback DOM permitido únicamente cuando el DOM pertenece exactamente
      a la misma atención que se está representando. Una Vista Integral
      histórica nunca debe tomar diagnósticos visibles de otra consulta.
    */
    if(!activo || activo !== esperado) return [];

    const panel = document.getElementById('hc_diagnostico');
    if(!panel) return [];

    const diagnosticos = [];
    const vistos = new Set();

    [...panel.querySelectorAll('.auro-dx-item')].forEach(function(item,index){
      const codigo = limpiarTextoClinico(
        item.querySelector('.auro-dx-code,[data-cie10],.cie10-code')?.textContent || ''
      );
      const nombre = limpiarTextoClinico(
        item.querySelector('.auro-dx-name,.auro-dx-desc,[data-diagnostico],.diagnostico-nombre')?.textContent || ''
      );
      const textoItem = limpiarTextoClinico(item.textContent || '');

      if(!codigo && !nombre) return;

      const clave = norm(codigo+'|'+nombre);
      if(vistos.has(clave)) return;
      vistos.add(clave);

      let principal = /\bprincipal\b/i.test(textoItem);
      let tipo = '';
      if(/\bdefinitiv[oa]\b/i.test(textoItem)) tipo = 'Definitivo';
      else if(/\bpresuntiv[oa]\b/i.test(textoItem)) tipo = 'Presuntivo';

      diagnosticos.push({
        codigo:codigo,
        nombre:nombre,
        jerarquia:principal ? 'Principal' : '',
        tipo:tipo,
        principal:principal,
        orden:index
      });
    });

    if(diagnosticos.length && !diagnosticos.some(function(dx){ return dx.principal; })){
      diagnosticos[0].principal = true;
      diagnosticos[0].jerarquia = 'Principal';
    }

    diagnosticos.forEach(function(dx){
      if(!dx.jerarquia && diagnosticos.length > 1) dx.jerarquia = 'Asociado';
    });

    return diagnosticos;
  }

  function diagnosticosRecetaHTML(receta,idAtencion){
    receta = receta || {};

    /*
      PRIORIDAD ANTIRREGRESIVA:
      1. Diagnósticos estructurados guardados con la propia receta.
      2. Diagnósticos del DOM/estado SOLO si la atención activa coincide exactamente.
      3. Campo histórico singular de la propia receta como compatibilidad final.
      Todo es lectura; no se modifica Recetas, Diagnóstico, Plan ni persistencia.
    */
    let diagnosticos = diagnosticosRecetaNormalizados(receta.diagnosticos);

    if(!diagnosticos.length){
      diagnosticos = diagnosticosAtencionActivaParaReceta(idAtencion);
    }

    if(!diagnosticos.length){
      const codigo = texto(
        receta.diagnostico_cie10 || receta.cie10 || receta.codigo_cie10 || ''
      );
      const nombre = texto(
        receta.diagnostico || receta.descripcion_diagnostico || receta.descripcion || ''
      );

      if(codigo || nombre){
        diagnosticos = [{
          codigo:codigo,
          nombre:nombre,
          jerarquia:'Principal',
          tipo:'',
          principal:true,
          orden:0
        }];
      }
    }

    if(!diagnosticos.length) return '';

    return '<div class="avi-rx-diagnosticos">'+
      '<h5>Diagnósticos de la receta</h5>'+
      '<div class="avi-rx-dx-list">'+diagnosticos.map(function(dx){
        return '<div class="avi-rx-dx-row">'+
          '<div><strong>'+esc(dx.codigo || 'Diagnóstico')+'</strong>'+
            (dx.nombre ? '<span>'+esc(dx.nombre)+'</span>' : '')+
          '</div>'+
          '<div class="avi-rx-dx-tags">'+
            (dx.jerarquia ? '<small>'+esc(dx.jerarquia)+'</small>' : '')+
            (dx.tipo ? '<small>'+esc(dx.tipo)+'</small>' : '')+
          '</div>'+
        '</div>';
      }).join('')+'</div>'+
    '</div>';
  }

  function recetasHTML(idAtencion,opciones){
    opciones = opciones || {};
    const recetas = recetasPorAtencion(idAtencion);
    if(!recetas.length) return '';

    /*
      La receta dentro de Vista Integral representa el documento farmacológico.
      Las indicaciones generales históricas guardadas en r.indicaciones pueden
      provenir de versiones antiguas del flujo Plan -> Receta. Para no atribuirlas
      al tratamiento farmacológico sin certeza, V1.21 puede separarlas de la
      tarjeta de Receta y conservarlas en "Indicaciones complementarias".
      No se borra ni modifica ningún dato.
    */
    const indicacionesPlan = new Set(
      capturarPanel('hc_plan')
        .filter(p=>norm(p.etiqueta).includes('indicacion'))
        .map(p=>norm(limpiarTextoClinico(p.valor)))
        .filter(Boolean)
    );

    return '<div class="avi-rx-list">'+recetas.map(function(r){
      const indicacionReceta = limpiarTextoClinico(r.indicaciones);
      const indicaciones = (
        opciones.separarIndicacionesHistoricas !== true &&
        indicacionReceta &&
        !indicacionesPlan.has(norm(indicacionReceta))
      ) ? indicacionesHTML(indicacionReceta) : '';

      const pacienteRx=r.paciente&&typeof r.paciente==='object'?r.paciente:{};
      const medicoRx=r.medico&&typeof r.medico==='object'?r.medico:{};
      const nombrePaciente=texto(r.nombre_paciente||pacienteRx.nombre||atencionPorId(idAtencion)?.nombre_paciente);
      const nombreMedico=texto(r.nombre_medico||medicoRx.nombre);
      const cedula=texto(r.numero_documento||pacienteRx.numero_documento||r.cedula);
      const fechaRx=fechaVisual(r.fecha_receta||r.fecha);
      const cfg=window.auroConfiguracionCentro||window.configuracionCentro||window.configCentro||window.CONFIG_CENTRO||{};
      const centro=cfg.datos&&typeof cfg.datos==='object'?cfg.datos:cfg;
      const nombreCentro=texto(centro.nombre_clinica||centro.nombre_comercial||centro.nombre||'AUROSANAX');
      const contacto=[centro.direccion_clinica||centro.direccion,centro.ciudad_clinica||centro.ciudad,centro.telefono_clinica||centro.telefono,centro.email_clinica||centro.email].map(texto).filter(Boolean);
      return '<article class="avi-rx-card avi-rx-documento">'+
        '<div class="avi-rx-institucional"><strong>'+esc(nombreCentro)+'</strong><span>'+esc(fechaRx)+'</span></div>'+
        '<h3 class="avi-rx-doc-titulo">RECETA MÉDICA</h3>'+
        '<div class="avi-rx-identificacion">'+
          (nombrePaciente?'<div><b>Paciente:</b> '+esc(nombrePaciente)+'</div>':'')+
          (cedula?'<div><b>Identificación:</b> '+esc(cedula)+'</div>':'')+
          '<div><b>Consulta:</b> '+esc(atencionPorId(idAtencion)?.numero_consulta||r.numero_consulta||'—')+'</div>'+
          '<div><b>ID receta:</b> '+esc(r.id_receta||r.id||'—')+'</div>'+
        '</div>'+
        '<div class="avi-rx-head">'+
          '<div class="avi-rx-heading">'+
            '<h4><i class="bi bi-prescription2"></i> Receta médica</h4>'+
          '</div>'+
          '<button type="button" class="avi-btn avi-btn-primary" data-avi-rx="'+esc(r.id_receta || r.id || '')+'">'+
            '<i class="bi bi-eye"></i> Ver receta completa'+
          '</button>'+
        '</div>'+
        '<div class="avi-rx-meta avi-rx-meta-compact">'+
          dato('Fecha',fechaVisual(r.fecha_receta || r.fecha))+
          dato('Estado',r.estado || 'Emitida')+
          dato('ID receta',r.id_receta || r.id || '')+
        '</div>'+
        '<div class="avi-rx-treatment-title">Tratamiento prescrito</div>'+
        tablaMedicamentosRecetaHTML(r.medicamento || r.medicamentos)+
        diagnosticosRecetaHTML(r,idAtencion)+
        indicaciones+
        '<footer class="avi-rx-documento-pie"><div class="avi-rx-doc-centro">'+contacto.map(function(v){return '<div>'+esc(v)+'</div>';}).join('')+'</div>'+
          '<div class="avi-rx-doc-firma"><div class="avi-rx-doc-firma-line"></div>'+
            (nombreMedico?'<strong>'+esc(nombreMedico)+'</strong>':'')+
            (texto(medicoRx.especialidad||r.especialidad)?'<span>'+esc(medicoRx.especialidad||r.especialidad)+'</span>':'')+
            '<small>Firma y sello</small></div></footer>'+
      '</article>';
    }).join('')+'</div>';
  }


  function registrosRespuestaVistaIntegral(respuesta){
    if(Array.isArray(respuesta)) return respuesta;
    if(Array.isArray(respuesta?.registros)) return respuesta.registros;
    if(Array.isArray(respuesta?.data)) return respuesta.data;
    if(respuesta?.data && typeof respuesta.data === 'object') return [respuesta.data];
    if(respuesta && typeof respuesta === 'object' && !respuesta.success && !respuesta.message){
      return [respuesta];
    }
    return [];
  }

  async function getSoloLecturaVistaIntegral(accion,parametros){
    try{
      const base = obtenerEndpointIASYN();
      if(!base) return null;

      const qs = new URLSearchParams();
      qs.set('accion',accion);
      Object.entries(parametros || {}).forEach(function(par){
        const clave = par[0];
        const valor = par[1];
        if(valor !== undefined && valor !== null && texto(valor)){
          qs.set(clave,texto(valor));
        }
      });
      qs.set('_',Date.now());

      const res = await fetch(base+'?'+qs.toString(),{
        method:'GET',
        cache:'no-store'
      });
      if(!res.ok) return null;
      return await res.json();
    }catch(error){
      console.warn(MODULO,'No se pudo completar lectura documental '+accion+'.',error);
      return null;
    }
  }

  function etiquetaDocumentoVistaIntegral(clave){
    const mapa = {
      recomendacion:'Recomendación',
      recomendaciones:'Recomendaciones',
      indicaciones:'Indicaciones',
      seguimiento:'Seguimiento',
      control:'Control',
      signos_alarma:'Signos de alarma',
      cuidados:'Cuidados',
      observaciones:'Observaciones',
      detalle:'Detalle',
      motivo:'Motivo',
      tipo_certificado:'Tipo de certificado',
      fecha_emision:'Fecha de emisión',
      fecha_desde:'Desde',
      fecha_hasta:'Hasta',
      dias_reposo:'Días de reposo',
      reposo_dias:'Días de reposo',
      diagnostico:'Diagnóstico',
      diagnostico_cie10:'CIE-10',
      cie10:'CIE-10',
      estado:'Estado'
    };
    return mapa[clave] || '';
  }

  function recomendacionParesVistaIntegral(registro){
    registro = registro || {};
    const d = parseJSON(registro.detalle_json,{}) || {};
    const salida = [];

    function agregar(etiqueta,valor){
      const limpio = limpiarTextoClinico(valor);
      if(!limpio) return;
      salida.push({etiqueta:etiqueta,valor:limpio,anchoCompleto:true});
    }

    function seleccionadosTexto(bloque){
      bloque = bloque || {};
      const items = Array.isArray(bloque.seleccionados) ? bloque.seleccionados : [];
      const textos = items.map(function(x){
        if(typeof x === 'string') return limpiarTextoClinico(x);
        if(x && typeof x === 'object'){
          return limpiarTextoClinico(x.texto || x.descripcion || x.nombre || x.label || x.valor || '');
        }
        return '';
      }).filter(Boolean);
      const otros = limpiarTextoClinico(bloque.otros || '');
      if(otros) textos.push(otros);
      return textos.join(' · ');
    }

    /*
      Esquema REAL del módulo Recomendaciones 1.1.0:
      seguimiento, signos_alerta, signos_infeccion,
      dieta_cuidados y recomendaciones_generales.
      Se conserva solo lectura y no se inventan campos.
    */
    const seguimiento = d.seguimiento || {};
    agregar('Próxima cita', fechaDocumentoVistaIntegral(seguimiento.proxima_cita));
    agregar('Motivo de control', seguimiento.motivo);
    agregar('Signos de alerta', seleccionadosTexto(d.signos_alerta));
    agregar('Signos de infección', seleccionadosTexto(d.signos_infeccion));
    agregar('Dieta y cuidados', d.dieta_cuidados);
    agregar('Recomendaciones generales', d.recomendaciones_generales);

    return deduplicarPares(salida);
  }

  /* Recomendaciones oficiales: visualización documental de solo lectura.
     Replica secciones y tratamiento de párrafos del visor recomendaciones.js,
     sin consultar estado de edición ni modificar contenido persistido. */
  function parrafosRecomendacionVistaIntegral(valor){
    const raw=texto(valor).replace(/\r\n?/g,'\n');
    if(!raw) return '';
    return raw.split(/\n\s*\n/).map(function(parrafo){
      const lineas=parrafo.split('\n').map(function(x){return x.trim();}).filter(Boolean);
      if(!lineas.length) return '';
      const todasVinetas=lineas.every(function(x){return /^(?:[-*•]|\d+[.)])\s+/.test(x);});
      return todasVinetas
        ? '<ul class="avi-rec-list">'+lineas.map(function(x){return '<li>'+esc(x.replace(/^(?:[-*•]|\d+[.)])\s+/,''))+'</li>';}).join('')+'</ul>'
        : '<p class="avi-rec-text">'+lineas.map(esc).join('<br>')+'</p>';
    }).join('');
  }

  function recomendacionRegistroHTML(registro,atencion,configuracion){
    if(!registro || !texto(registro.id_atencion)) return '';
    const d=parseJSON(registro.detalle_json,{}) || {};
    const bloques=[];
    // Datos documentales originales: misma atención y configuración institucional de lectura.
    atencion=atencion||{};
    let cfg=configuracion&&typeof configuracion==='object' ? configuracion : {};
    if(cfg.datos&&typeof cfg.datos==='object') cfg=cfg.datos;
    const centroGuardado=d.centro&&typeof d.centro==='object' ? d.centro : {};
    cfg=Object.assign({},cfg,centroGuardado);
    const campoConfig=function(){ return primerDatoCertificado.apply(null,Array.from(arguments).map(function(k){return cfg[k];})); };
    const institucion=campoConfig('nombre_clinica','nombre_centro','nombre_comercial','razon_social')||'AUROSANAX';
    const ubicacion=[
      campoConfig('direccion_clinica','direccion'),
      [campoConfig('ciudad_clinica','ciudad'),campoConfig('provincia_clinica','provincia'),campoConfig('pais_clinica','pais')].filter(Boolean).join(', ')
    ].filter(Boolean).join(' · ');
    const nombreMedico=primerDatoCertificado(d?.medico?.nombre,registro.nombre_medico,atencion.nombre_medico);
    const especialidad=primerDatoCertificado(d?.medico?.especialidad,registro.especialidad,atencion.especialidad_atencion,atencion.especialidad);
    const registroMsp=primerDatoCertificado(d?.medico?.registro_msp,d?.medico?.msp);
    const registroSenescyt=primerDatoCertificado(d?.medico?.registro_senescyt);
    const contacto=[
      ubicacion,
      campoConfig('email_clinica','correo_clinica','email','correo'),
      campoConfig('telefono_clinica','whatsapp_clinica','telefono','whatsapp'),
      campoConfig('sitio_web_clinica','web_clinica','web')
    ].filter(Boolean);
    const nombresAlerta={
      fiebre:'Fiebre que no cede',dolor:'Dolor intenso o que no cede',
      sangrado:'Sangrado anormal o abundante',dificultad_respiratoria:'Dificultad respiratoria',
      vomito:'Vómitos persistentes',diarrea:'Diarrea persistente',
      mareo_desmayo:'Mareo intenso o desmayo',deterioro_general:'Deterioro del estado general'
    };
    const nombresInfeccion={
      fiebre_infeccion:'Fiebre o escalofríos',dolor_local:'Dolor local en aumento',
      enrojecimiento:'Enrojecimiento progresivo',inflamacion:'Inflamación importante',
      secrecion:'Secreción anormal o purulenta',mal_olor:'Mal olor',
      calor_local:'Aumento de calor local'
    };
    function bloqueSeleccionados(titulo,bloque,nombres){
      bloque=bloque || {};
      const lista=(Array.isArray(bloque.seleccionados)?bloque.seleccionados:[])
        .map(function(x){
          if(typeof x==='string') return nombres[x] || x;
          if(x && typeof x==='object'){
            const clave=texto(x.id || x.clave || x.valor || x.key);
            return nombres[clave] || texto(x.texto || x.descripcion || x.nombre || x.label || clave);
          }
          return '';
        }).filter(function(x){return !!texto(x);});
      const otro=texto(bloque.otros);
      if(!lista.length && !otro) return '';
      return '<section class="avi-rec-section"><h5>'+esc(titulo)+'</h5>'+
        (lista.length?'<ul class="avi-rec-list">'+lista.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>':'')+
        (otro?parrafosRecomendacionVistaIntegral(otro):'')+'</section>';
    }
    const fecha=texto(registro.fecha_atencion || registro.fecha_emision || '');
    const seguimiento=d.seguimiento || {};
    const campos=[
      fecha?'<div><b>Fecha:</b> '+esc(fechaDocumentoVistaIntegral(fecha))+'</div>':'',
      seguimiento.proxima_cita?'<div><b>PRÓXIMO CONTROL:</b> '+esc(fechaDocumentoVistaIntegral(seguimiento.proxima_cita))+'</div>':'',
      seguimiento.motivo?'<div><b>MOTIVO DEL CONTROL:</b> '+esc(seguimiento.motivo)+'</div>':''
    ].filter(Boolean).join('');
    bloques.push(bloqueSeleccionados('SIGNOS DE ALERTA',d.signos_alerta,nombresAlerta));
    bloques.push(bloqueSeleccionados('SIGNOS DE INFECCIÓN',d.signos_infeccion,nombresInfeccion));
    if(texto(d.dieta_cuidados)) bloques.push('<section class="avi-rec-section"><h5>DIETA Y CUIDADOS</h5>'+parrafosRecomendacionVistaIntegral(d.dieta_cuidados)+'</section>');
    if(texto(d.recomendaciones_generales)) bloques.push('<section class="avi-rec-section"><h5>RECOMENDACIONES GENERALES</h5>'+parrafosRecomendacionVistaIntegral(d.recomendaciones_generales)+'</section>');
    if(!bloques.some(Boolean)) return '';
    return '<article class="avi-rec-page">'+
      '<header class="avi-rec-head"><strong>'+esc(institucion)+'</strong>'+
      '<span>'+esc(fecha?fechaDocumentoVistaIntegral(fecha):'')+'</span></header>'+
      '<h4 class="avi-rec-title">RECOMENDACIONES MÉDICAS</h4>'+
      (campos?'<div class="avi-rec-meta">'+campos+'</div>':'')+
      '<div class="avi-rec-docid">Documento · '+esc(registro.id_recomendacion)+'</div>'+
      bloques.filter(Boolean).join('')+
      '<footer class="avi-rec-footer">'+
        '<div class="avi-rec-centro">'+
          contacto.map(function(v){return '<div>'+esc(v)+'</div>';}).join('')+
          (cfg.razon_social?'<div>'+esc(cfg.razon_social)+(cfg.ruc?' · RUC '+esc(cfg.ruc):'')+'</div>':'')+
        '</div>'+
        '<div class="avi-rec-firma"><div class="avi-rec-firma-line"></div>'+
          (nombreMedico?'<b>'+esc(nombreMedico)+'</b>':'')+
          (especialidad?'<span>'+esc(especialidad)+'</span>':'')+
          (registroMsp?'<span>MSP: '+esc(registroMsp)+'</span>':'')+
          (registroSenescyt?'<span>SENESCYT: '+esc(registroSenescyt)+'</span>':'')+
          '<small>Firma y sello</small>'+
        '</div>'+
      '</footer>'+
      '</article>';
  }

  function objetoDetalleCertificado(detalle,clave){
    const v = detalle?.[clave];
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  function primerDatoCertificado(){
    for(let i=0;i<arguments.length;i++){
      const v = texto(arguments[i]);
      if(v && !esVacio(v)) return v;
    }
    return '';
  }

  function fechaDocumentoVistaIntegral(valor){
    const raw = texto(valor);
    if(!raw) return '';

    /*
      Fecha civil: se toma YYYY-MM-DD sin reinterpretar zona horaria.
      Evita cambiar accidentalmente el día de nacimiento/emisión.
    */
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[3]+'/'+m[2]+'/'+m[1];

    return raw;
  }

  function horaDocumentoVistaIntegral(valor){
    const raw = texto(valor);
    if(!raw) return '';

    let m = raw.match(/^(?:1899-\d{2}-\d{2}T)?(\d{2}):(\d{2})/);
    if(m) return m[1]+':'+m[2];

    m = raw.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
    if(m) return m[1]+':'+m[2];

    return raw;
  }

  function certificadoVistaIntegralHTML(registro){
    registro = registro || {};
    const d = parseJSON(registro.detalle_json,{}) || {};
    const pac = d.paciente || {};
    const hist = d.historia || {};
    const med = d.medico || {};
    const centro = d.centro || {};
    const dx = Array.isArray(d.diagnosticos) ? d.diagnosticos : [];
    const dias = Number(d.dias_reposo || 0);

    const nombrePaciente = primerDatoCertificado(
      pac.nombre, pac.nombre_completo,
      registro.nombre_paciente, registro.paciente_nombre
    );
    const documentoPaciente = primerDatoCertificado(
      pac.numero_documento, pac.cedula, pac.documento,
      registro.numero_documento
    );
    const numeroHistoria = primerDatoCertificado(
      hist.numero_historia, hist.id_historia, registro.id_historia
    );
    const fechaNacimiento = fechaDocumentoVistaIntegral(
      primerDatoCertificado(pac.fecha_nacimiento,pac.nacimiento)
    );
    const numeroConsulta = primerDatoCertificado(
      registro.numero_consulta, d.numero_consulta
    );

    const nombreMedico = primerDatoCertificado(
      med.nombre, med.nombre_completo, registro.nombre_medico
    );
    const especialidad = primerDatoCertificado(
      med.especialidad, med.especialidad_principal, registro.especialidad
    );
    const registroMsp = primerDatoCertificado(
      med.registro_msp, med.msp, med.registro_profesional
    );
    const registroSenescyt = primerDatoCertificado(
      med.registro_senescyt, med.senescyt
    );

    const nombreCentro = primerDatoCertificado(
      centro.nombre, centro.nombre_clinica, centro.nombre_centro,
      centro.nombre_comercial, centro.razon_social, 'AUROSANAX'
    );
    const ciudad = primerDatoCertificado(
      centro.ciudad, centro.ciudad_clinica, 'Guayaquil'
    );
    const ubicacion = [
      primerDatoCertificado(centro.direccion,centro.direccion_clinica),
      primerDatoCertificado(centro.ciudad,centro.ciudad_clinica),
      primerDatoCertificado(centro.provincia,centro.provincia_clinica),
      primerDatoCertificado(centro.pais,centro.pais_clinica)
    ].filter(Boolean).join(' · ');
    const contactoCentro = [
      primerDatoCertificado(centro.telefono,centro.whatsapp),
      primerDatoCertificado(centro.email,centro.correo),
      primerDatoCertificado(centro.web,centro.sitio_web)
    ].filter(Boolean).join(' · ');

    const tipo = primerDatoCertificado(
      registro.tipo_certificado,d.tipo_certificado,'Certificado médico'
    );
    const fecha = fechaDocumentoVistaIntegral(
      primerDatoCertificado(registro.fecha_emision,d.fecha_emision)
    );

    const dxHtml = dx.length
      ? dx.map(function(x){
          const codigo = primerDatoCertificado(x.codigo_cie10,x.codigo);
          const desc = primerDatoCertificado(x.descripcion,x.diagnostico);
          return '<div class="avi-cert-dx-row"><b>'+esc(codigo || 'S/C')+'</b>'+
            (desc ? ' · '+esc(desc) : '')+'</div>';
        }).join('')
      : '';

    const reposo = dias > 0
      ? '<div class="avi-cert-reposo">'+
          '<p>Por lo que amerita reposo por <b>'+esc(dias)+' día'+(dias===1?'':'s')+'</b>.</p>'+
          (d.reposo_desde ? '<div><b>Desde:</b> '+esc(fechaDocumentoVistaIntegral(d.reposo_desde))+'</div>' : '')+
          (d.reposo_hasta ? '<div><b>Hasta:</b> '+esc(fechaDocumentoVistaIntegral(d.reposo_hasta))+'</div>' : '')+
        '</div>'
      : '';

    const registros = [
      registroMsp ? 'Registro MSP/ACESS: '+registroMsp : '',
      registroSenescyt ? 'Registro SENESCYT: '+registroSenescyt : ''
    ].filter(Boolean);

    return '<article class="avi-cert-page">'+
      '<div class="avi-cert-official-head">'+
        '<div>'+
          '<strong>'+esc(nombreCentro)+'</strong>'+
          (especialidad ? '<small>'+esc(especialidad)+'</small>' : '')+
        '</div>'+
        '<div>'+esc(ciudad)+(fecha ? ' · '+esc(fecha) : '')+'</div>'+
      '</div>'+
      '<h4 class="avi-cert-official-title">'+esc(tipo.toUpperCase())+'</h4>'+
      '<div class="avi-cert-official-body">'+
        '<p>Por medio del presente certifico haber atendido al/la paciente '+
          '<b>'+esc(nombrePaciente || 'Paciente')+'</b>'+
          (documentoPaciente ? ', con documento de identidad <b>'+esc(documentoPaciente)+'</b>' : '')+
          (numeroHistoria ? ', número de historia clínica <b>'+esc(numeroHistoria)+'</b>' : '')+
          (numeroConsulta ? ', en la consulta <b>#'+esc(numeroConsulta)+'</b>' : '')+
          (nombreMedico ? ', atendida por <b>'+esc(nombreMedico)+'</b>' : '')+'.</p>'+
        (fechaNacimiento ? '<div class="avi-cert-line"><b>FECHA DE NACIMIENTO:</b> '+esc(fechaNacimiento)+'</div>' : '')+
        (especialidad ? '<div class="avi-cert-line"><b>ESPECIALIDAD:</b> '+esc(especialidad)+'</div>' : '')+
        (d.resumen_clinico ? '<div class="avi-cert-line"><b>RESUMEN CLÍNICO:</b> '+esc(d.resumen_clinico)+'</div>' : '')+
        (d.actividad_laboral ? '<div class="avi-cert-line"><b>ACTIVIDAD LABORAL:</b> '+esc(d.actividad_laboral)+'</div>' : '')+
        (d.contacto ? '<div class="avi-cert-line"><b>NÚMERO DE CONTACTO:</b> '+esc(d.contacto)+'</div>' : '')+
        (d.institucion_empresa ? '<div class="avi-cert-line"><b>INSTITUCIÓN / EMPRESA:</b> '+esc(d.institucion_empresa)+'</div>' : '')+
        (d.direccion_trabajo ? '<div class="avi-cert-line"><b>DIRECCIÓN DE TRABAJO:</b> '+esc(d.direccion_trabajo)+'</div>' : '')+
        (dxHtml ? '<div class="avi-cert-dx"><b>DIAGNÓSTICO(S) CIE-10:</b>'+dxHtml+'</div>' : '')+
        (d.contingencia ? '<div class="avi-cert-line"><b>TIPO DE CONTINGENCIA:</b> '+esc(String(d.contingencia).toUpperCase())+'</div>' : '')+
        reposo+
        (d.observaciones ? '<p class="avi-cert-observaciones"><b>OBSERVACIONES:</b> '+esc(d.observaciones)+'</p>' : '')+
      '</div>'+
      '<div class="avi-cert-footer">'+
        '<div class="avi-cert-center">'+
          (ubicacion ? '<div>'+esc(ubicacion)+'</div>' : '')+
          (contactoCentro ? '<div>'+esc(contactoCentro)+'</div>' : '')+
        '</div>'+
        '<div class="avi-cert-sign">'+
          '<div class="avi-cert-sign-line"></div>'+
          (nombreMedico ? '<b>'+esc(nombreMedico)+'</b>' : '')+
          (especialidad ? '<span>'+esc(especialidad)+'</span>' : '')+
          registros.map(function(x){ return '<span>'+esc(x)+'</span>'; }).join('')+
          '<small>Firma y sello</small>'+
        '</div>'+
      '</div>'+
    '</article>';
  }

  function certificadosRegistrosHTML(registros){
    const lista = (Array.isArray(registros) ? registros : [])
      .filter(function(r){
        const estado = norm(r?.estado || 'Activo');
        return texto(r?.id_certificado) &&
          !['anulado','anulada','eliminado','eliminada','inactivo','inactiva'].includes(estado);
      })
      .sort(function(a,b){
        return texto(b?.actualizado_en || b?.creado_en || b?.fecha_emision || '')
          .localeCompare(texto(a?.actualizado_en || a?.creado_en || a?.fecha_emision || ''));
      });

    if(!lista.length) return '';

    const html = lista.map(certificadoVistaIntegralHTML).filter(Boolean).join('');
    return html ? '<div class="avi-document-list">'+html+'</div>' : '';
  }

  async function completarDocumentosVistaIntegral(idAtencion){
    const id = texto(idAtencion);
    if(!id) return;

    const overlay = document.getElementById('auroVistaIntegralOverlay');
    if(!overlay) return;

    const idActivo = texto(
      typeof window.getIdAtencionActiva === 'function'
        ? window.getIdAtencionActiva()
        : ''
    );
    if(idActivo !== id) return;

    // La fuente oficial de Recomendaciones es PLURAL: cada documento tiene
    // su propio id_recomendacion. El lector singular ocultaba los posteriores.
    const resultados = await Promise.all([
      getSoloLecturaVistaIntegral('listarRecomendacionesPorAtencion',{id_atencion:id}),
      getSoloLecturaVistaIntegral('listarCertificadosPorAtencion',{id_atencion:id}),
      getSoloLecturaVistaIntegral('obtenerConfiguracion',{})
    ]);

    const overlayActual = document.getElementById('auroVistaIntegralOverlay');
    if(!overlayActual || overlayActual !== overlay ||
       texto(overlayActual.dataset.aviAtencion) !== id) return;

    const idActivoActual = texto(
      typeof window.getIdAtencionActiva === 'function'
        ? window.getIdAtencionActiva()
        : ''
    );
    if(idActivoActual !== id) return;

    const slot = overlayActual.querySelector('[data-avi-documentos="'+CSS.escape(id)+'"]');
    if(!slot) return;

    const vistosRecomendaciones = new Set();
    const recomendacionesRegistros = registrosRespuestaVistaIntegral(resultados[0])
      .filter(function(r){
        if(texto(r?.id_atencion) !== id || !texto(r?.id_recomendacion)) return false;
        const ip=texto(r?.id_paciente), ih=texto(r?.id_historia);
        const at=atencionPorId(id);
        if(ip && texto(at?.id_paciente) && ip !== texto(at.id_paciente)) return false;
        if(ih && texto(at?.id_historia) && ih !== texto(at.id_historia)) return false;
        const estado=norm(r.estado || 'Activo');
        if(['anulado','anulada','eliminado','eliminada','inactivo','inactiva'].includes(estado)) return false;
        const clave=texto(r.id_recomendacion);
        if(vistosRecomendaciones.has(clave)) return false;
        vistosRecomendaciones.add(clave);
        return true;
      })
      .sort(function(a,b){
        return texto(a.creado_en || a.fecha_atencion || '').localeCompare(
          texto(b.creado_en || b.fecha_atencion || ''));
      });

    const certificados = registrosRespuestaVistaIntegral(resultados[1]).filter(function(r){
      return texto(r?.id_atencion) === id && texto(r?.id_certificado);
    });

    const recomendaciones = seccion(
      'Recomendaciones','bi-heart-pulse',
      recomendacionesRegistros.map(function(r){return recomendacionRegistroHTML(r,atencionPorId(id),resultados[2]);}).filter(Boolean).join(''),false
    );

    const certificadosHTML = seccion(
      'Certificados emitidos','bi-file-earmark-medical',
      certificadosRegistrosHTML(certificados),false
    );

    slot.innerHTML = recomendaciones + certificadosHTML;
  }

  function instalarEstilos(){
    const CSS_VERSION = '1.24.7';
    const existente = document.getElementById('auroVistaIntegralCSS');

    /*
      BLINDAJE RESPONSIVE VERSIONADO:
      Si el navegador conserva CSS de una versión anterior de Vista Integral,
      se sustituye únicamente ese style propietario. Esto evita que iPhone
      siga aplicando la antigua receta en tarjetas después de actualizar JS.
      No toca estilos globales, módulos clínicos ni persistencia.
    */
    if(existente){
      if(texto(existente.dataset?.auroVistaVersion) === CSS_VERSION) return;
      existente.remove();
    }

    const s = document.createElement('style');
    s.id = 'auroVistaIntegralCSS';
    s.dataset.auroVistaVersion = CSS_VERSION;
    s.textContent = `
      /* ============================================================
         AUROSANAX VISTA INTEGRAL ÉLITE - SOLO PRESENTACIÓN
         - No cambia IDs clínicos, estado, eventos, backend ni guardado.
         - Mantiene Expandir / Contraer / Actualizar / Solo lectura.
         - Mantiene apertura exacta por id_atencion.
      ============================================================ */
      .avi-overlay{
        position:fixed;inset:0;z-index:100000;
        background:rgba(15,23,42,.76);
        backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
        display:flex;align-items:center;justify-content:center;padding:10px;
      }
      .avi-shell{
        width:min(98vw,1680px);height:min(97dvh,1080px);max-height:97dvh;
        background:#f7f8fb;border:1px solid rgba(255,255,255,.48);
        border-radius:24px;overflow:hidden;display:flex;flex-direction:column;
        box-shadow:0 36px 110px rgba(15,23,42,.42);
      }

      .avi-head{
        display:flex;justify-content:space-between;gap:18px;align-items:flex-start;
        padding:18px 20px;
        background:
          radial-gradient(circle at 100% 0,rgba(194,59,131,.11),transparent 34%),
          linear-gradient(135deg,#fff 0%,#fff8fc 54%,#fbf6fa 100%);
        border-bottom:1px solid #ecd8e4;
      }
      .avi-head-main{display:flex;gap:14px;align-items:flex-start;min-width:0}
      .avi-head-icon{
        width:48px;height:48px;flex:0 0 auto;border-radius:16px;
        display:grid;place-items:center;
        background:linear-gradient(135deg,#7a174f,#b52d76);
        color:#fff;font-size:20px;
        box-shadow:0 10px 24px rgba(122,23,79,.20);
      }
      .avi-head-copy{min-width:0}
      .avi-head-kicker{
        display:block;margin-bottom:3px;color:#9d174d;
        font-size:10px;font-weight:950;text-transform:uppercase;
        letter-spacing:.08em;
      }
      .avi-head h3{
        margin:0;color:#2f1526;font-size:21px;line-height:1.2;font-weight:950;
      }
      .avi-numero-consulta:not(:empty){
        display:inline-block;vertical-align:middle;margin-left:9px;padding:5px 10px;
        border-radius:10px;background:#fdf2f8;border:1px solid #f2cde0;
        color:#86165a;font-size:12px;font-weight:900;white-space:nowrap;
      }
      .avi-head-patient{
        margin-top:5px;color:#111827;font-size:15px;font-weight:950;
        line-height:1.25;overflow-wrap:anywhere;
      }
      .avi-head-subcontext{
        margin-top:2px;color:#64748b;font-size:12px;font-weight:750;
        line-height:1.3;overflow-wrap:anywhere;
      }
      .avi-technical-id{
        margin:5px 0 0!important;color:#94a3b8!important;
        font-size:10.5px!important;font-weight:700;letter-spacing:.01em;
        overflow-wrap:anywhere;
      }
      .avi-head-context{margin-top:9px;display:flex;gap:6px;flex-wrap:wrap}
      .avi-chip{
        display:inline-flex;align-items:center;gap:5px;
        border:1px solid #e7d8e1;background:#fff;color:#6c1d52;
        border-radius:999px;padding:4px 8px;font-size:10.5px;font-weight:850;
        line-height:1.1;
      }
      .avi-chip-strong{background:#fdf2f8;border-color:#f3cfe2;color:#7a174f}
      .avi-chip-status{background:#ecfdf5;border-color:#bbf7d0;color:#166534}
      .avi-chip-readonly{background:#f8fafc;border-color:#e2e8f0;color:#475569}

      .avi-close,.avi-btn{
        border:1px solid #e4d6df;background:#fff;color:#6c1d52;
        border-radius:12px;padding:8px 11px;font-weight:850;cursor:pointer;
        transition:transform .16s ease,box-shadow .16s ease,background .16s ease;
      }
      .avi-close:hover,.avi-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 7px 16px rgba(15,23,42,.08);
      }
      .avi-close{flex:0 0 auto}
      .avi-btn-primary{
        background:linear-gradient(135deg,#7a174f,#a9286c);
        color:#fff;border-color:transparent;
      }

      .avi-toolbar{
        display:flex;gap:8px;flex-wrap:wrap;padding:10px 18px;
        background:#fff;border-bottom:1px solid #e5e7eb;
        box-shadow:0 3px 12px rgba(15,23,42,.025);
      }
      .avi-toolbar .avi-btn{font-size:11.5px;padding:7px 10px}

      .avi-body{
        overflow:auto;padding:18px;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:thin;
      }

      .avi-overview-block{
        border:1px solid #e5e7eb;border-radius:19px;
        background:#fff;padding:13px;margin-bottom:12px;
        box-shadow:0 7px 20px rgba(15,23,42,.035);
      }
      .avi-group-title{
        display:flex;align-items:center;gap:7px;
        margin:0 0 10px;font-size:12px;color:#6c1d52;font-weight:950;
        text-transform:uppercase;letter-spacing:.055em;
      }
      .avi-group-title i{font-size:13px}
      .avi-data-grid{
        display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px;margin:0;
      }
      .avi-data{
        background:linear-gradient(180deg,#fff,#fcfdff);
        border:1px solid #e7ebf0;border-radius:13px;
        padding:9px 10px;min-width:0;min-height:58px;
        display:flex;flex-direction:column;justify-content:center;
      }
      .avi-data span{
        display:block;font-size:9.5px;color:#7c8798;text-transform:uppercase;
        font-weight:900;letter-spacing:.045em;
      }
      .avi-data b{
        display:block;margin-top:3px;color:#172033;font-size:11.8px;
        line-height:1.35;overflow-wrap:anywhere;
      }
      .avi-col-2{grid-column:span 2}
      .avi-id-card{
        background:#f8fafc;border-style:dashed;
      }
      .avi-id-card b{font-size:10.5px;color:#64748b;font-weight:750}

      .avi-clinical-divider{
        display:flex;align-items:center;gap:10px;
        margin:16px 2px 11px;color:#7a174f;
        font-size:11px;font-weight:950;text-transform:uppercase;
        letter-spacing:.065em;
      }
      .avi-clinical-divider::before,.avi-clinical-divider::after{
        content:"";height:1px;background:#e9d5e1;flex:1 1 auto;
      }
      .avi-clinical-divider span{flex:0 0 auto}

      .avi-section{
        background:#fff;border:1px solid #e2e7ed;border-radius:17px;
        margin-bottom:9px;overflow:hidden;
        box-shadow:0 5px 16px rgba(15,23,42,.028);
      }
      .avi-section summary{
        list-style:none;cursor:pointer;padding:12px 14px;
        display:flex;justify-content:space-between;gap:10px;align-items:center;
        font-weight:900;color:#2f3b4d;
        transition:background .15s ease,color .15s ease;
      }
      .avi-section summary:hover{background:#fffafd}
      .avi-section[open] summary{
        background:linear-gradient(90deg,#fff8fc 0%,#fff 60%);
        color:#5a1740;border-bottom:1px solid #f1e4ec;
      }
      .avi-section summary::-webkit-details-marker{display:none}
      .avi-section-label{display:flex;align-items:center;gap:8px;min-width:0}
      .avi-section-label>i{
        width:28px;height:28px;border-radius:9px;display:grid;place-items:center;
        color:#8b1e5a;background:#fdf2f8;border:1px solid #f5d5e6;
        flex:0 0 auto;font-size:12px;
      }
      .avi-section-count{
        display:inline-grid;place-items:center;min-width:22px;height:20px;
        padding:0 6px;border-radius:999px;background:#f1f5f9;color:#64748b;
        font-size:9.5px;font-weight:900;
      }
      .avi-section[open] .avi-chevron{transform:rotate(180deg)}
      .avi-chevron{transition:.18s;color:#94a3b8}
      .avi-section-body{padding:12px 14px 14px}

      .avi-lines{
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;
      }
      .avi-line{
        border:1px solid #e8edf2;border-radius:12px;padding:10px;
        background:#fbfdff;min-width:0;
      }
      .avi-span-full{grid-column:1/-1}
      .avi-nowrap{
        white-space:nowrap;
        display:inline-block;
      }

      /*
        Anamnesis: dos columnas clínicas en escritorio.
        Los textos narrativos ocupan todo el ancho.
        No altera otros módulos.
      */
      .avi-anamnesis-grid{
        grid-template-columns:repeat(2,minmax(0,1fr));
        grid-auto-flow:row dense;
        gap:10px 14px;
      }

      .avi-anamnesis-grid .avi-span-full{
        grid-column:1/-1;
      }

      @media(max-width:760px){
        .avi-anamnesis-grid{
          grid-template-columns:1fr;
        }
      }

      .avi-line b,.avi-note b{
        display:block;color:#7a174f;font-size:10px;
        text-transform:uppercase;letter-spacing:.045em;font-weight:900;
      }
      .avi-line p,.avi-note p{
        margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;
        color:#1f2937;font-size:12.2px;line-height:1.48;
      }
      .avi-clean-list{
        margin:6px 0 0;padding-left:19px;color:#1f2937;
        font-size:12.2px;line-height:1.5;
      }
      .avi-clean-list li+li{margin-top:4px}

      .avi-subgroup{
        border-top:1px dashed #e7eaf0;padding-top:11px;
      }
      .avi-plan-slot{
        display:block!important;
        min-width:0!important;
        box-sizing:border-box!important;
        clear:both;
      }
      .avi-plan-slot>.avi-section{
        display:block;
        width:100%;
        max-width:100%;
        box-sizing:border-box;
      }
      .avi-plan-slot .avi-section-body{
        width:100%;
        max-width:100%;
        box-sizing:border-box;
      }

      .avi-plan-block{
        width:100%;
        max-width:100%;
        box-sizing:border-box;
        min-width:0;
      }
      .avi-plan-block:first-child{
        border-top:0;
        padding-top:0;
      }
      .avi-plan-block>h5{
        margin:0 0 8px;
        color:#5a1740;
        font-size:12px;
        line-height:1.3;
        font-weight:900;
      }
      .avi-plan-content,
      .avi-plan-prose{
        width:100%;
        max-width:100%;
        min-width:0;
        box-sizing:border-box;
      }
      .avi-plan-content .avi-clean-list{
        margin:0;
        padding-left:20px;
      }
      .avi-plan-text{
        margin:0;
        color:#1f2937;
        font-size:12.2px;
        line-height:1.5;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
      }
      .avi-plan-prose .avi-line{
        grid-column:1/-1;
        width:100%;
        max-width:100%;
        box-sizing:border-box;
      }
      .avi-plan-prose .avi-line>b:empty{
        display:none;
      }
    /* Antecedentes: presentación clínica compacta, sin alterar datos */

    .avi-dx-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:12px;
    }
    .avi-dx-card{
      border:1px solid #ece8ef;
      border-radius:12px;
      padding:12px 14px;
      background:#fff;
      min-width:0;
    }
    .avi-dx-main{
      font-size:13px;
      line-height:1.45;
      font-weight:800;
      color:#2e2333;
      overflow-wrap:break-word;
      word-break:normal;
    }
    .avi-dx-meta{
      margin-top:8px;
      display:flex;
      flex-wrap:wrap;
      gap:6px;
    }
    .avi-dx-meta span{
      display:inline-flex;
      align-items:center;
      min-height:24px;
      padding:3px 8px;
      border-radius:999px;
      border:1px solid #e7dce8;
      background:#faf7fb;
      font-size:11px;
      line-height:1.2;
      color:#5d4c62;
      white-space:nowrap;
    }
    @media(max-width:760px){
      .avi-dx-grid{grid-template-columns:1fr;}
    }

    .avi-ant-group{
      margin:0 0 18px;
      min-width:0;
    }
    .avi-ant-group>h5{
      margin:0 0 9px;
      font-size:13px;
      line-height:1.25;
      font-weight:800;
      color:#25233a;
    }
    .avi-ant-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px 12px;
      align-items:start;
    }
    .avi-ant-card{
      min-width:0;
      border:1px solid #ece8ef;
      border-radius:12px;
      padding:10px 12px;
      background:#fff;
      overflow-wrap:break-word;
      word-break:normal;
    }
    .avi-ant-title{
      display:block;
      margin:0 0 5px;
      font-size:12px;
      line-height:1.3;
      font-weight:800;
      color:#32223a;
    }
    .avi-ant-detail{
      margin:0;
      font-size:12px;
      line-height:1.55;
      color:#55515b;
      white-space:normal;
      overflow-wrap:break-word;
      word-break:normal;
    }
    .avi-ant-detail::first-line{
      line-height:1.55;
    }
    /* Evita cortes visuales como "Dosis 1" dejando el número en otra línea. */
    .avi-ant-card{
      text-wrap:pretty;
    }
    .avi-ant-vacunas .avi-ant-grid{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
    .avi-ant-habitos .avi-ant-grid{
      grid-template-columns:repeat(3,minmax(0,1fr));
    }
    @media (max-width:980px){
      .avi-ant-grid,
      .avi-ant-vacunas .avi-ant-grid,
      .avi-ant-habitos .avi-ant-grid{
        grid-template-columns:1fr;
      }
    }

      .avi-subgroup:first-child{border-top:0;padding-top:0}
      .avi-subgroup+.avi-subgroup{margin-top:12px}
      .avi-subgroup>h5{
        margin:0 0 8px;color:#334155;font-size:12.5px;font-weight:950;
      }

      .avi-med-grid{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;
      }
      .avi-med-card{
        border:1px solid #ead7e2;border-radius:14px;padding:11px;
        background:linear-gradient(180deg,#fff,#fffafd);
        box-shadow:0 3px 10px rgba(122,23,79,.025);
      }
      .avi-med-card h5{
        margin:0 0 8px;color:#541536;font-size:13px;font-weight:900;
        line-height:1.3;
      }
      .avi-med-card p{margin:0;color:#334155;font-size:12px;line-height:1.48}
      .avi-med-details{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;
      }
      .avi-med-details div{
        border:1px solid #edf0f3;background:#fff;border-radius:10px;padding:7px 8px;
      }
      .avi-med-details span{
        display:block;color:#7c8798;font-size:8.8px;font-weight:900;
        text-transform:uppercase;letter-spacing:.035em;
      }
      .avi-med-details b{
        display:block;margin-top:3px;color:#1f2937;font-size:10.8px;
        line-height:1.35;overflow-wrap:anywhere;
      }

      .avi-rx-list{display:grid;gap:11px}
      /* Hoja documental visible dentro de Vista integral; sin escribir la receta. */
      .avi-rx-documento{width:100%;max-width:210mm;min-height:297mm;box-sizing:border-box;
        margin:14px auto 20px;padding:15mm 17mm 17mm!important;border-radius:3px!important;
        display:flex;flex-direction:column;overflow:visible!important;background:#fff!important}
      .avi-rx-institucional{display:flex;justify-content:space-between;align-items:center;
        border-bottom:2px solid #8b1e5a;padding-bottom:12px;gap:12px;font-size:11px}
      .avi-rx-institucional strong{font-size:21px;color:#8b1e5a;letter-spacing:.02em}
      .avi-rx-doc-titulo{text-align:center;font-size:19px;letter-spacing:.055em;margin:22px 0}
      .avi-rx-identificacion{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;
        font-size:11.5px;overflow-wrap:anywhere;margin-bottom:18px}
      .avi-rx-documento-pie{margin-top:auto;padding-top:23mm;display:grid;grid-template-columns:1fr 1fr;
        gap:20mm;align-items:end;break-inside:avoid;page-break-inside:avoid}
      .avi-rx-doc-centro{color:#475569;font-size:10px;line-height:1.6;overflow-wrap:anywhere}
      .avi-rx-doc-firma{display:flex;flex-direction:column;text-align:center;font-size:11px}
      .avi-rx-doc-firma-line{border-top:1px solid #111;margin-bottom:7px}
      .avi-rx-doc-firma span,.avi-rx-doc-firma small{margin-top:4px}
      .avi-orden-oficial-embebida{border:0!important;padding:0!important;display:block!important;
        background:transparent!important;box-shadow:none!important}
      .avi-orden-oficial-embebida>.aom-paper{box-sizing:border-box!important;position:relative;
        width:100%!important;max-width:210mm!important;min-height:297mm!important;
        margin:0 auto!important;padding:15mm 17mm 48mm!important;overflow:visible!important;
        background:#fff!important;box-shadow:none!important}
      @media(max-width:760px){
        .avi-rx-documento{min-height:0;padding:17px 12px 24px!important}
        .avi-rx-identificacion{grid-template-columns:1fr}
        .avi-rx-documento-pie{grid-template-columns:1fr;gap:22px;padding-top:24px}
        .avi-orden-oficial-embebida>.aom-paper{min-height:0!important;padding:17px 12px 24px!important}
      }
      .avi-rx-card{
        border:1px solid #e4c7da;border-radius:18px;padding:14px;background:#fff;
        box-shadow:0 8px 22px rgba(122,23,79,.055);
      }
      .avi-rx-head{
        display:flex;justify-content:space-between;gap:12px;align-items:flex-start;
        margin-bottom:9px;padding-bottom:10px;border-bottom:1px solid #f1e5ec;
      }
      .avi-rx-heading{min-width:0}
      .avi-rx-kicker{
        display:flex;align-items:center;gap:5px;
        color:#9d174d;font-size:9.5px;font-weight:950;text-transform:uppercase;
        letter-spacing:.055em;margin-bottom:3px;
      }
      .avi-rx-head h4{
        margin:0;color:#341224;font-size:14px;font-weight:950;line-height:1.25;
      }
      .avi-rx-head small{
        display:block;color:#94a3b8;margin-top:4px;
        font-size:9.8px;line-height:1.3;overflow-wrap:anywhere;
      }
      .avi-rx-head small b{color:#64748b}
      .avi-rx-meta{
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
        gap:7px;margin:9px 0 11px;
      }
      .avi-rx-meta .avi-data{min-height:50px;padding:7px 9px}
      .avi-note{
        margin-top:11px;border-top:1px solid #e5e7eb;padding-top:10px;
        background:#fcfdff;
      }
      /* Receta asociada: documento de lectura, sin límite de hoja A4. */
      .avi-rx-list,
      .avi-rx-card,
      .avi-rx-card .avi-rx-table-wrap,
      .avi-rx-card .avi-rx-diagnosticos{
        max-height:none!important;
        overflow-y:visible!important;
      }
      .avi-rx-meta-compact{
        grid-template-columns:repeat(3,minmax(0,1fr));
      }
      .avi-rx-treatment-title{
        margin:12px 0 7px;
        color:#7a174f;
        font-size:10.5px;
        font-weight:950;
        text-transform:uppercase;
        letter-spacing:.055em;
      }
      .avi-rx-table-wrap{
        display:block;
        width:100%;
        max-width:100%;
        min-width:0;
        overflow-x:auto;
        overflow-y:hidden;
        border:1px solid #dfe4ea;
        border-radius:10px;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:thin;
      }
      .avi-rx-table{
        width:100%;
        min-width:760px;
        border-collapse:collapse;
        table-layout:fixed;
        background:#fff;
      }
      .avi-rx-table th{
        background:#273142;
        color:#fff;
        padding:8px 9px;
        font-size:10px;
        line-height:1.2;
        text-align:left;
        font-weight:900;
      }
      .avi-rx-table td{
        padding:9px;
        border-top:1px solid #e7ebf0;
        color:#273142;
        font-size:11.5px;
        line-height:1.45;
        vertical-align:top;
        overflow-wrap:anywhere;
      }
      .avi-rx-table th:nth-child(1),.avi-rx-table td:nth-child(1){width:5%}
      .avi-rx-table th:nth-child(2),.avi-rx-table td:nth-child(2){width:20%}
      .avi-rx-table th:nth-child(3),.avi-rx-table td:nth-child(3){width:23%}
      .avi-rx-table th:nth-child(4),.avi-rx-table td:nth-child(4){width:9%}
      .avi-rx-table th:nth-child(5),.avi-rx-table td:nth-child(5){width:43%}
      .avi-rx-num,.avi-rx-cant{text-align:center!important}
      .avi-rx-diagnosticos{
        margin-top:13px;
        padding-top:11px;
        border-top:1px solid #e7ebf0;
      }
      .avi-rx-diagnosticos h5{
        margin:0 0 7px;
        color:#7a174f;
        font-size:10.5px;
        font-weight:950;
        text-transform:uppercase;
        letter-spacing:.055em;
      }
      .avi-rx-dx-list{display:grid;gap:6px}
      .avi-rx-dx-row{
        display:flex;
        justify-content:space-between;
        gap:10px;
        align-items:flex-start;
        padding:7px 0;
        border-bottom:1px solid #f0f2f5;
      }
      .avi-rx-dx-row:last-child{border-bottom:0}
      .avi-rx-dx-row strong{font-size:11.5px;color:#273142}
      .avi-rx-dx-row span{display:block;margin-top:2px;font-size:11.5px;color:#475569}
      .avi-rx-dx-tags{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
      .avi-rx-dx-tags small{
        border:1px solid #e7dce8;
        background:#faf7fb;
        color:#5d4c62;
        border-radius:999px;
        padding:3px 7px;
        font-size:9px;
        font-weight:800;
        white-space:nowrap;
      }


      /* Recomendaciones: lectura con jerarquía documental equivalente al visor oficial.
         Se limita a esta tarjeta y no modifica estilos de los demás apartados. */
      .avi-ordenes-documentos-slot>.avi-section{overflow:visible}
      .avi-ordenes-documentos-slot .avi-section-body{overflow:visible;max-height:none}
      .avi-ordenes-documentos-slot [data-avi-ordenes-formales]{width:100%;max-width:100%}
      /* Órdenes médicas: documento íntegro de solo lectura, hoja flexible. */
      .avi-orden-documento{display:flex;flex-direction:column;box-sizing:border-box;
        width:100%;max-width:210mm;min-height:297mm;margin:14px auto 20px;
        padding:15mm 17mm 17mm;background:#fff;color:#111827;
        border:1px solid #dfe3e8;border-radius:3px;overflow:visible!important}
      .avi-orden-head{display:flex;justify-content:space-between;gap:12px;align-items:center;
        padding-bottom:10px;border-bottom:2.5px solid #8b1e5a;font-size:11px}
      .avi-orden-head strong{color:#8b1e5a;font-size:18px}
      .avi-orden-title{text-align:center;font-size:19px;margin:22px 0 24px;letter-spacing:.04em}
      .avi-orden-acciones{display:flex;justify-content:flex-end;margin:0 0 18px;gap:8px}
      .avi-orden-datos{display:grid;grid-template-columns:1fr 1fr;gap:9px 16px;font-size:12px;margin-bottom:16px}
      .avi-orden-dx{font-size:12px;line-height:1.5;margin:0 0 16px}
      .avi-orden-dx>b{display:block;margin-bottom:5px}
      .avi-orden-tabla-wrap{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}
      .avi-orden-tabla{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:auto}
      .avi-orden-tabla th,.avi-orden-tabla td{border:1px solid #dfe3e8;text-align:left;padding:8px;vertical-align:top;overflow-wrap:anywhere}
      .avi-orden-tabla th{background:#f8f0f5;font-weight:800}
      .avi-orden-tabla td:first-child{text-align:center}
      .avi-orden-observaciones{font-size:12px;line-height:1.6;white-space:pre-wrap;margin:15px 0;text-align:justify}
      .avi-orden-pie{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:22mm;
        margin-top:auto;padding-top:24mm;break-inside:avoid;page-break-inside:avoid}
      .avi-orden-centro{font-size:10px;line-height:1.5;color:#475569;overflow-wrap:anywhere}
      .avi-orden-firma{display:flex;flex-direction:column;text-align:center;justify-content:flex-end;font-size:11px}
      .avi-orden-firma-line{border-top:1px solid #111;margin-bottom:7px}
      .avi-orden-firma span,.avi-orden-firma small{margin-top:3px}
      @media(max-width:760px){
        .avi-orden-documento{min-height:0;padding:17px 12px 24px;border-radius:9px}
        .avi-orden-title{font-size:16px}.avi-orden-datos{grid-template-columns:1fr}
        .avi-orden-tabla{min-width:620px}.avi-orden-pie{grid-template-columns:1fr;gap:24px;padding-top:28px}
      }
      .avi-rec-page{
        width:100%;max-width:210mm;margin:0 auto;padding:15mm 17mm 17mm;
        background:#fff;color:#111827;box-sizing:border-box;
        border:1px solid #e3e6ec;border-radius:3px;
        font-family:Arial,Helvetica,sans-serif;
      }
      .avi-rec-page{
        min-height:297mm;display:flex;flex-direction:column;
        overflow:visible!important;max-height:none!important;
      }
      .avi-rec-footer{
        display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        gap:22mm;align-items:end;margin-top:auto;
        padding-top:24mm;min-height:120px;
        break-inside:avoid;page-break-inside:avoid;
      }
      .avi-rec-centro{font-size:10.2px;line-height:1.55;color:#475569;overflow-wrap:anywhere}
      .avi-rec-centro>div{margin-bottom:5px}
      .avi-rec-firma{display:flex;flex-direction:column;justify-content:flex-end;
        text-align:center;font-size:11px;min-height:110px}
      .avi-rec-firma-line{border-top:1px solid #111;margin-bottom:7px}
      .avi-rec-firma b{font-size:12px}
      .avi-rec-firma span,.avi-rec-firma small{margin-top:3px}
      .avi-rec-head{display:flex;justify-content:space-between;gap:16px;
        align-items:center;border-bottom:2.5px solid #8b1e5a;padding-bottom:10px}
      .avi-rec-head strong{color:#8b1e5a;font-size:18px;letter-spacing:.035em}
      .avi-rec-head span{color:#374151;font-size:11px}
      .avi-rec-title{font-size:18px!important;line-height:1.3;text-align:center;
        letter-spacing:.05em;margin:22px 0 23px!important;color:#111827!important}
      .avi-rec-meta{font-size:12px;line-height:1.55;margin:12px 0 16px;display:grid;gap:5px}
      .avi-rec-meta b{font-weight:850}
      .avi-rec-docid{font-size:10px;color:#64748b;margin:0 0 12px;overflow-wrap:anywhere}
      .avi-rec-section{margin:16px 0 18px}
      .avi-rec-section h5{font-size:12px;font-weight:900;margin:0 0 9px;
        color:#222!important;letter-spacing:.015em}
      .avi-rec-text{font-size:12.2px;line-height:1.65;text-align:justify;
        text-justify:inter-word;margin:0 0 12px;overflow-wrap:anywhere}
      .avi-rec-list{margin:5px 0 12px 21px;padding:0}
      .avi-rec-list li{font-size:12.2px;line-height:1.58;margin:4px 0;overflow-wrap:anywhere}
      @media(max-width:760px){
        .avi-rec-page{padding:17px 14px 24px;border-radius:9px;min-height:0}
        .avi-rec-footer{grid-template-columns:1fr;gap:20px;padding-top:24px;min-height:0}
        .avi-rec-firma{min-height:125px}
        .avi-rec-title{font-size:16px!important}
        .avi-rec-text{text-align:left}
      }
      .avi-document-list{display:grid;gap:14px}
      .avi-document-grid{grid-template-columns:1fr}
      .avi-document-prose .avi-line{grid-column:1/-1}
      .avi-document-prose .avi-line p{
        margin:0;
        text-align:justify;
        text-justify:inter-word;
        line-height:1.66;
      }

      /* Certificado: proporciones de hoja y jerarquía del visor oficial (certificado.js).
         SOLO visual; nunca transforma detalle_json ni cambia documentos emitidos. */
      .avi-cert-page{
        width:100%;
        max-width:210mm;
        min-height:297mm;
        margin:0 auto;
        display:flex;
        flex-direction:column;
        box-sizing:border-box;
        background:#fff;
        border:1px solid #dfe3e8;
        border-radius:3px;
        padding:15mm 17mm 17mm;
        color:#111827;
        box-shadow:0 8px 24px rgba(15,23,42,.05);
      }
      .avi-cert-official-head{
        display:grid;grid-template-columns:minmax(0,1fr) auto;
        gap:16px;align-items:center;padding-bottom:10px;
        border-bottom:2.5px solid #8b1e5a;
      }
      .avi-cert-official-head strong{
        display:block;color:#8b1e5a;font-size:17px;font-weight:950;
      }
      .avi-cert-official-head small{
        display:block;margin-top:2px;color:#667085;font-size:10px;
      }
      .avi-cert-official-head>div:last-child{
        text-align:right;font-size:10.5px;font-weight:800;color:#374151;
      }
      .avi-cert-official-title{
        margin:22px 0 26px;text-align:center;
        color:#111827;font-size:18px;font-weight:950;letter-spacing:.04em;
      }
      .avi-cert-official-body p{
        margin:0 0 12px;font-size:12.4px;line-height:1.64;
        text-align:justify;text-justify:inter-word;
      }
      .avi-cert-line{
        margin:6px 0;
        font-size:12.1px;
        line-height:1.58;
        text-align:justify;
        text-justify:inter-word;
        white-space:pre-line;
        overflow-wrap:anywhere;
      }
      .avi-cert-line b{color:#2b1623}
      .avi-cert-line>b:first-child{
        display:inline-block;
        min-width:150px;
      }
      .avi-cert-dx{margin:15px 0 16px;font-size:12.1px;line-height:1.5}
      .avi-cert-dx>b{display:block;margin-bottom:5px}
      .avi-cert-dx-row{margin-top:2px}
      .avi-cert-reposo{margin-top:15px}
      .avi-cert-reposo p{margin-bottom:4px}
      .avi-cert-reposo div{font-size:12.1px;line-height:1.5;margin-top:3px}
      .avi-cert-observaciones{margin-top:15px!important}
      .avi-cert-footer{
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        gap:22mm;
        align-items:start;
        margin-top:auto;
        padding-top:24mm;
        min-height:150px;
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .avi-cert-center{
        align-self:end;
        color:#64748b;
        font-size:9.7px;
        line-height:1.5;
        padding-bottom:6px;
        max-width:100%;
        overflow-wrap:anywhere;
      }
      .avi-cert-sign{
        align-self:end;
        text-align:center;
        font-size:10.8px;
        min-height:132px;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
      }
      .avi-cert-sign::before{
        content:'';
        display:block;
        flex:1 1 auto;
        min-height:66px;
      }
      .avi-cert-sign-line{
        border-top:1px solid #111;
        margin:0 0 7px;
      }
      .avi-cert-sign b{display:block;font-size:12px}
      .avi-cert-sign span,.avi-cert-sign small{display:block;margin-top:2px}

      @media(max-width:760px){
        .avi-document-grid{grid-template-columns:1fr}
        .avi-document-prose .avi-line p{text-align:left}
        .avi-cert-page{
          width:100%;max-width:100%;min-height:0;
          padding:17px 14px 24px;border-radius:9px;
        }
        .avi-cert-line{text-align:left}
        .avi-cert-line>b:first-child{min-width:0}
        .avi-cert-official-head{grid-template-columns:1fr;gap:5px}
        .avi-cert-official-head>div:last-child{text-align:left}
        .avi-cert-official-title{font-size:16px;margin:17px 0 18px}
        .avi-cert-official-body p{font-size:12.2px;line-height:1.58;text-align:left}
        .avi-cert-line,.avi-cert-dx,.avi-cert-reposo div{font-size:11.9px}
        .avi-cert-footer{
          grid-template-columns:1fr;
          gap:24px;
          margin-top:34px;
          padding-top:6px;
          min-height:0;
        }
        .avi-cert-center{
          order:1;
          padding-bottom:0;
        }
        .avi-cert-sign{
          order:2;
          width:100%;
          min-height:154px;
        }
        .avi-cert-sign::before{
          min-height:84px;
        }
      }

      .avi-loading{padding:34px;text-align:center;color:#64748b;font-weight:750}

      .avi-rx-overlay{
        position:fixed;inset:0;z-index:100010;background:rgba(15,23,42,.74);
        backdrop-filter:blur(3px);
        display:flex;align-items:center;justify-content:center;padding:14px;
      }
      .avi-rx-shell{
        width:min(1120px,100%);max-height:95vh;background:#fff;
        border-radius:22px;overflow:hidden;display:flex;flex-direction:column;
        box-shadow:0 30px 90px rgba(15,23,42,.38);
      }
      .avi-rx-view{
        overflow:auto;padding:14px;background:#f8fafc;
        -webkit-overflow-scrolling:touch;
      }

      @media(max-width:980px){
        .avi-overlay{padding:6px}
        .avi-shell{width:100%;height:98dvh;max-height:98dvh;border-radius:20px}
        .avi-data-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .avi-lines{grid-template-columns:repeat(2,minmax(0,1fr))}
        .avi-col-2{grid-column:span 2}
      }

      @media(max-width:760px){
        .avi-overlay,.avi-rx-overlay{padding:0;align-items:stretch}
        .avi-shell,.avi-rx-shell{
          width:100%;max-width:100%;height:100dvh;max-height:100dvh;
          border-radius:0;
        }
        .avi-head{
          padding:12px calc(12px + env(safe-area-inset-right)) 12px
            calc(12px + env(safe-area-inset-left));
          align-items:flex-start;
        }
        .avi-head-main{gap:10px}
        .avi-head-icon{width:40px;height:40px;border-radius:13px;font-size:17px}
        .avi-head h3{font-size:17px}
        .avi-head-patient{font-size:13.5px}
        .avi-head-subcontext{font-size:11px}
        .avi-close{min-height:42px;flex:0 0 auto;padding:8px 9px;font-size:11px}
        .avi-toolbar{
          display:grid;grid-template-columns:1fr 1fr;padding:8px 10px;gap:7px;
        }
        .avi-toolbar .avi-btn{width:100%;min-height:41px;font-size:11px}
        .avi-toolbar .avi-btn:last-child{grid-column:1/-1}
        .avi-body{
          padding:10px calc(10px + env(safe-area-inset-right))
            calc(14px + env(safe-area-inset-bottom))
            calc(10px + env(safe-area-inset-left));
        }
        .avi-overview-block{padding:10px;border-radius:16px;margin-bottom:9px}
        .avi-data-grid,.avi-lines,.avi-rx-meta,.avi-med-grid,.avi-med-details{
          grid-template-columns:1fr;
        }
        .avi-col-2,.avi-span-full{grid-column:auto}
        .avi-clinical-divider{margin:13px 2px 9px;font-size:9.5px}
        .avi-section{border-radius:15px;margin-bottom:8px}
        .avi-section summary{padding:10px 11px;font-size:12px}
        .avi-section-label>i{width:26px;height:26px}
        .avi-section-body{padding:9px 10px 11px}
        .avi-rx-head{display:grid;grid-template-columns:1fr}
        .avi-rx-head .avi-btn{width:100%;min-height:41px}
        .avi-chip{font-size:9.3px;padding:4px 7px}
        .avi-rx-card{padding:11px;border-radius:16px}
        .avi-rx-meta-compact{grid-template-columns:1fr}
        .avi-rx-dx-row{display:grid;grid-template-columns:1fr}
        .avi-rx-dx-tags{justify-content:flex-start}

        /*
          RECETA RESPONSIVE MÓVIL — SOLO PRESENTACIÓN.
          Conserva exactamente la tabla profesional de escritorio y habilita
          desplazamiento horizontal táctil únicamente dentro de la receta.
          No altera datos, columnas, guardado, IDs ni el resto de Vista Integral.
        */
        /*
          RECETA · SCROLL HORIZONTAL NATIVO MULTIDISPOSITIVO
          iPhone / iPad / Android / Safari / Chrome / WebView.
          Corrección exclusivamente CSS:
          - los contenedores padres pueden encogerse (min-width:0);
          - la tabla conserva ancho documental mayor que la pantalla;
          - el wrapper es quien recibe el desplazamiento horizontal nativo;
          - el scroll vertical general de Vista Integral permanece intacto.
        */
        .avi-overlay .avi-section,
        .avi-overlay .avi-section-body,
        .avi-overlay .avi-rx-card,
        .avi-overlay .avi-rx-table-wrap{
          min-width:0!important;
          max-width:100%!important;
          box-sizing:border-box!important;
        }
        .avi-overlay .avi-rx-card{
          overflow:visible!important;
        }
        .avi-overlay .avi-rx-table-wrap{
          position:relative!important;
          display:block!important;
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          -webkit-overflow-scrolling:touch!important;
          overscroll-behavior-x:contain;
          scrollbar-width:thin;
          touch-action:auto!important;
        }
        .avi-overlay .avi-rx-table{
          display:table!important;
          width:820px!important;
          min-width:820px!important;
          max-width:none!important;
          table-layout:fixed!important;
          border-collapse:collapse!important;
          transform:none!important;
          margin:0!important;
        }
        .avi-overlay .avi-rx-table thead{display:table-header-group!important}
        .avi-overlay .avi-rx-table tbody{display:table-row-group!important}
        .avi-overlay .avi-rx-table tr{display:table-row!important}
        .avi-overlay .avi-rx-table th,
        .avi-overlay .avi-rx-table td{
          display:table-cell!important;
          min-width:0!important;
          text-align:left!important;
          white-space:normal!important;
        }
        .avi-overlay .avi-rx-table td::before{content:none!important}

        .avi-overlay .avi-rx-table th:nth-child(1),
        .avi-overlay .avi-rx-table td:nth-child(1){width:58px!important}
        .avi-overlay .avi-rx-table th:nth-child(2),
        .avi-overlay .avi-rx-table td:nth-child(2){width:205px!important}
        .avi-overlay .avi-rx-table th:nth-child(3),
        .avi-overlay .avi-rx-table td:nth-child(3){width:190px!important}
        .avi-overlay .avi-rx-table th:nth-child(4),
        .avi-overlay .avi-rx-table td:nth-child(4){width:92px!important}
        .avi-overlay .avi-rx-table th:nth-child(5),
        .avi-overlay .avi-rx-table td:nth-child(5){width:275px!important}
      }

      @media(max-width:430px){
        .avi-head-icon{display:none}
        .avi-head-kicker{font-size:9px}
        .avi-head h3{font-size:16px}
        .avi-close span{display:none}
      }

      /* ============================================================
         AUROSANAX VISTA INTEGRAL - VISOR DOCUMENTAL CLÍNICO V1.5
         SOLO ESCRITORIO >= 981px.
         - Hoja clínica central amplia, inspirada en visor A4.
         - Todo texto narrativo usa ancho documental completo.
         - Campos breves conservan distribución compacta.
         - Móvil/tablet existente NO se modifica.
         - Sin cambios de datos, eventos, guardado ni contexto clínico.
      ============================================================ */
      @media(min-width:981px){
        .avi-shell{
          width:min(98vw,1720px);
          height:min(97dvh,1100px);
          max-height:97dvh;
          background:#e9edf1;
        }

        .avi-head{
          padding:11px 18px;
          min-height:auto;
          background:linear-gradient(135deg,#fff 0%,#fff9fc 62%,#fbf5f9 100%);
        }
        .avi-head-main{gap:10px}
        .avi-head-icon{width:40px;height:40px;border-radius:12px;font-size:17px}
        .avi-head-kicker{font-size:9px;margin-bottom:1px}
        .avi-head h3{font-size:18px;line-height:1.15}
        .avi-head-patient{font-size:13.5px;margin-top:2px}
        .avi-head-subcontext{font-size:11px}
        .avi-technical-id{font-size:9.4px!important;margin-top:2px!important}
        .avi-head-context{margin-top:5px;gap:5px}
        .avi-chip{font-size:9.5px;padding:3px 7px}
        .avi-close{padding:7px 10px}

        .avi-toolbar{
          padding:7px 18px;
          background:#fff;
        }
        .avi-toolbar .avi-btn{
          min-height:34px;
          padding:7px 11px;
          font-size:11.5px;
        }

        .avi-body{
          padding:24px 20px 34px;
          background:#dfe4e9;
        }

        .avi-body > .avi-overview-block,
        .avi-body > .avi-clinical-divider,
        .avi-body > .avi-section,
        .avi-body > .avi-line,
        .avi-body > .avi-plan-slot,
        .avi-body > .avi-ordenes-documentos-slot,
        .avi-body > [data-avi-documentos]{
          width:min(1120px,calc(100% - 36px));
          margin-left:auto;
          margin-right:auto;
          box-sizing:border-box;
        }

        /*
          CONTINUIDAD DOCUMENTAL:
          Recomendaciones y Certificados quedan dentro de la misma hoja clínica
          visual de Vista Integral, con el mismo ancho y jerarquía del documento.
          El slot no crea un segundo visor ni una fuente de datos paralela.
        */
        .avi-body > [data-avi-documentos]{
          background:#fff;
          margin-top:0;
          margin-bottom:0;
        }
        .avi-body > [data-avi-documentos] > .avi-section{
          width:100%;
          margin:0;
          border:0;
          border-radius:0;
          box-shadow:none;
          border-bottom:1px solid #e8ebef;
          background:#fff;
        }
        .avi-body > [data-avi-documentos] > .avi-section summary{
          padding:12px 42px 10px;
          font-size:13.5px;
          color:#3f1630;
          background:#fff!important;
        }
        .avi-body > [data-avi-documentos] > .avi-section[open] summary{
          border-bottom:1px solid #f0e4eb;
        }
        .avi-body > [data-avi-documentos] > .avi-section .avi-section-body{
          padding:14px 42px 22px;
        }
        .avi-body > [data-avi-documentos] > .avi-section:last-child{
          border-radius:0 0 10px 10px;
          padding-bottom:18px;
        }

        .avi-body > .avi-overview-block:first-child{
          border-radius:10px 10px 0 0;
          padding-top:26px;
        }
        .avi-body > .avi-section:last-child{
          border-radius:0 0 10px 10px;
          padding-bottom:18px;
        }

        .avi-overview-block,
        .avi-clinical-divider,
        .avi-section{
          background:#fff;
          box-shadow:none;
        }

        .avi-overview-block{
          border:0;
          border-radius:0;
          padding:12px 42px 10px;
          margin-bottom:0;
          border-bottom:1px solid #e7e9ed;
        }

        .avi-group-title{
          margin:0 0 10px;
          font-size:11px;
          letter-spacing:.065em;
          color:#7a174f;
        }

        .avi-data-grid{
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:8px 22px;
        }
        .avi-data{
          min-height:auto;
          padding:3px 0 5px;
          border:0;
          border-radius:0;
          background:transparent;
          justify-content:flex-start;
        }
        .avi-data span{
          font-size:9.2px;
          line-height:1.15;
          color:#7a174f;
          margin-bottom:2px;
        }
        .avi-data b{
          margin-top:0;
          font-size:13.2px;
          line-height:1.34;
          color:#1f2937;
        }
        .avi-id-card{background:transparent;border:0}
        .avi-id-card b{font-size:10.5px;color:#64748b}

        .avi-clinical-divider{
          padding:16px 42px 8px;
          margin-top:0;
          margin-bottom:0;
          font-size:10.5px;
          color:#7a174f;
        }

        .avi-section{
          border:0;
          border-radius:0;
          margin-bottom:0;
          overflow:visible;
          border-bottom:1px solid #e8ebef;
        }
        .avi-section summary{
          padding:12px 42px 10px;
          font-size:13.5px;
          color:#3f1630;
          background:#fff!important;
        }
        .avi-section[open] summary{
          border-bottom:1px solid #f0e4eb;
        }
        .avi-section-label>i{
          width:27px;height:27px;border-radius:8px;
        }
        .avi-section-body{
          padding:14px 42px 22px;
        }

        .avi-lines{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px 26px;
          align-items:start;
        }
        .avi-line{
          border:0;
          border-radius:0;
          padding:4px 0 8px;
          background:transparent;
        }
        .avi-line.avi-span-full{
          grid-column:1/-1;
          width:100%;
        }
        .avi-line b,.avi-note b{
          font-size:10.2px;
          line-height:1.2;
          color:#7a174f;
          letter-spacing:.055em;
        }
        .avi-line p,.avi-note p{
          margin:5px 0 0;
          font-size:14px;
          line-height:1.62;
          color:#222b38;
          text-align:left;
          max-width:none;
          white-space:pre-wrap;
          overflow-wrap:anywhere;
        }
        .avi-line.avi-span-full p,
        .avi-note p{
          width:100%;
          max-width:100%;
        }
        .avi-clean-list{
          width:100%;
          max-width:100%;
          font-size:13.8px;
          line-height:1.58;
        }

        .avi-lines > .avi-line:only-child{
          grid-column:1/-1;
        }
        .avi-lines > .avi-line:only-child p{
          width:100%;
          max-width:100%;
        }

        .avi-subgroup{padding-top:13px}
        .avi-subgroup>h5{font-size:13.2px;margin-bottom:9px}

        .avi-med-grid{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
        }
        .avi-med-card{
          border:1px solid #ead7e2;
          border-radius:11px;
          padding:12px;
          background:#fffdfd;
          box-shadow:none;
        }
        .avi-med-card h5{font-size:13.4px}
        .avi-med-card p{font-size:13px;line-height:1.52}
        .avi-med-details b{font-size:11.4px}

        .avi-rx-card{
          border:1px solid #ead7e2;
          border-radius:12px;
          padding:14px;
          box-shadow:none;
          background:#fff;
        }
        .avi-rx-head h4{font-size:14.5px}
        .avi-rx-meta{grid-template-columns:repeat(3,minmax(0,1fr))}
        .avi-rx-meta .avi-data{
          border-bottom:1px solid #edf0f3;
          padding-bottom:7px;
        }

        .avi-loading{
          width:min(1120px,calc(100% - 36px));
          margin:0 auto;
          min-height:520px;
          background:#fff;
          padding-top:80px;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function cerrar(){
    document.getElementById('auroVistaIntegralOverlay')?.remove();
    document.body.style.overflow = '';
  }

  function cerrarReceta(){
    document.getElementById('auroVistaRecetaOverlay')?.remove();
  }

  async function abrirReceta(idReceta){
    instalarEstilos();
    const id = texto(idReceta);

    if(!id){
      alert('No se encontró el identificador de la receta.');
      return;
    }

    if(typeof window.pdfRecetaEmitida !== 'function'){
      alert('La vista oficial de Recetas no está disponible.');
      return;
    }

    try{
      await window.pdfRecetaEmitida(id);
    }catch(e){
      console.error(MODULO,e);
      alert('No se pudo abrir la vista oficial de la receta.');
    }
  }

  function encabezadoContexto(a){
    return [
      a?.numero_consulta ? '<span class="avi-chip avi-chip-strong">Consulta #'+esc(a.numero_consulta)+'</span>' : '',
      a?.fecha_atencion ? '<span class="avi-chip"><i class="bi bi-calendar3"></i>'+esc(fechaVisual(a.fecha_atencion))+'</span>' : '',
      a?.hora_atencion ? '<span class="avi-chip"><i class="bi bi-clock"></i>'+esc(horaVisual(a.hora_atencion))+'</span>' : '',
      a?.tipo_atencion ? '<span class="avi-chip">'+esc(a.tipo_atencion)+'</span>' : '',
      a?.estado_atencion ? '<span class="avi-chip avi-chip-status">'+esc(a.estado_atencion)+'</span>' : '',
      '<span class="avi-chip avi-chip-readonly"><i class="bi bi-lock"></i>Solo lectura</span>'
    ].filter(Boolean).join('');
  }

  function renderizar(idAtencion){
    const overlay = document.getElementById('auroVistaIntegralOverlay');
    const body = overlay?.querySelector('.avi-body');
    if(!overlay || !body) return;

    const idActivo = texto(
      typeof window.getIdAtencionActiva === 'function'
        ? window.getIdAtencionActiva()
        : ''
    );

    if(idActivo !== texto(idAtencion)){
      body.innerHTML =
        '<div class="avi-line avi-span-full"><b>Atención no verificada</b>'+
        '<p>No se pudo confirmar la consulta seleccionada.</p></div>';
      return;
    }

    const a = atencionPorId(idAtencion);
    if(!a){
      body.innerHTML =
        '<div class="avi-line avi-span-full"><b>Atención no encontrada</b>'+
        '<p>No se encontró la atención solicitada.</p></div>';
      return;
    }

    const anamnesis = seccion(
      'Anamnesis','bi-clipboard2-pulse',
      anamnesisVistaHTML(),true
    );

    const antecedentes = seccion(
      'Antecedentes de la historia clínica','bi-clock-history',
      antecedentesDesdeFuenteHTML(a),false
    );

    const examen = seccion(
      'Examen físico','bi-person-vcard',
      paresHTMLClinico(examenFisicoParesProfesional(),'avi-examen-grid'),true
    );

    const obstetricia = seccion(
      'Obstetricia','bi-heart-pulse',
      obstetriciaVistaHTML(),false
    );

    const diagnosticos = seccion(
      'Diagnósticos','bi-journal-medical',
      diagnosticosVistaHTML(),true
    );

    const hayRecetasAsociadas = recetasPorAtencion(idAtencion).length > 0;

    const planInicial = seccion(
      'Plan','bi-list-check',
      planHTML({ omitirMedicamentos:hayRecetasAsociadas }),true
    );

    const plan =
      '<div class="avi-plan-slot" data-avi-plan="'+esc(idAtencion)+'">'+planInicial+'</div>';

    const ordenesDocumentos = '<div class="avi-ordenes-documentos-slot" data-avi-ordenes-documentos="'+esc(idAtencion)+'"></div>';

    const indicacionesLegacyInicial = seccion(
      'Indicaciones complementarias','bi-card-text',
      indicacionesHistoricasRecetaHTML(idAtencion,new Set()),false
    );

    const indicacionesLegacy =
      '<div data-avi-indicaciones-legacy="'+esc(idAtencion)+'">'+
        indicacionesLegacyInicial+
      '</div>';

    const recetas = seccion(
      'Recetas','bi-prescription2',
      recetasHTML(idAtencion,{separarIndicacionesHistoricas:true}),true
    );

    const datosPaciente = datosPacienteHTML(a);
    const datosAtencion = datosAtencionHTML(a);

    body.innerHTML =
      (datosPaciente
        ? '<section class="avi-overview-block">'+
            '<h4 class="avi-group-title"><i class="bi bi-person-vcard"></i> Datos personales</h4>'+
            '<div class="avi-data-grid" data-avi-datos-paciente>'+datosPaciente+'</div>'+
          '</section>'
        : '')+
      (datosAtencion
        ? '<section class="avi-overview-block">'+
            '<h4 class="avi-group-title"><i class="bi bi-clipboard2-pulse"></i> Datos de la atención</h4>'+
            '<div class="avi-data-grid" data-avi-datos-atencion>'+datosAtencion+'</div>'+
          '</section>'
        : '')+
      '<div data-avi-fuente-identidad style="font-size:11px;color:#64748b;padding:4px 12px"></div>'+
      '<div class="avi-clinical-divider"><span>Resumen clínico de la consulta</span></div>'+
      anamnesis+antecedentes+examen+obstetricia+diagnosticos+plan+ordenesDocumentos+indicacionesLegacy+recetas+
      '<div data-avi-documentos="'+esc(idAtencion)+'"></div>';

    /*
      Recomendaciones y Certificados se enriquecen después del render inicial
      mediante GET de solo lectura y se aceptan únicamente si la atención
      sigue siendo exactamente la misma. No bloquean Vista Integral.
    */
    /*
      V1.21: el Plan persistido se enriquece por GET exacto de id_atencion.
      La respuesta tardía se descarta si cambió la atención.
    */
    completarPlanVistaIntegral(
      idAtencion,
      a,
      hayRecetasAsociadas
    );

    completarDocumentosVistaIntegral(idAtencion);
    completarOrdenesFormalesVista(idAtencion,a,overlay).catch(function(e){console.warn(MODULO,'No se pudo mostrar órdenes formales.',e);});

    const contextBox = overlay.querySelector('[data-avi-contexto]');
    if(contextBox) contextBox.innerHTML = encabezadoContexto(a);
    const numeroCab = overlay.querySelector('[data-avi-numero-consulta]');
    if(numeroCab) numeroCab.textContent = texto(a.numero_consulta) ? 'Consulta N.º '+texto(a.numero_consulta) : '';

    /*
      Cabecera clínica: utiliza únicamente datos ya disponibles en memoria.
      No consulta ni modifica backend y no cambia el contexto de la atención.
    */
    const p = pacienteLocalPorAtencion(a);
    const nombreCabecera =
      nombrePaciente(p) ||
      primero(a,['nombre_paciente','paciente_nombre']) ||
      texto(a?.id_paciente) ||
      'Paciente';

    const ctxCabecera = contextoSeguroPorAtencion(a);

    const medicoCabecera = texto(a?.nombre_medico || ctxCabecera.nombre_medico || a?.id_medico);
    const especialidadCabecera = texto(a?.especialidad_atencion || a?.especialidad || ctxCabecera.especialidad_atencion || ctxCabecera.especialidad_medico);

    const pacienteBox = overlay.querySelector('[data-avi-paciente]');
    if(pacienteBox) pacienteBox.textContent = nombreCabecera;

    const subcontextoBox = overlay.querySelector('[data-avi-subcontexto]');
    if(subcontextoBox){
      subcontextoBox.textContent = [
        medicoCabecera,
        especialidadCabecera
      ].filter(Boolean).join(' · ');
    }

    /* Verificación asíncrona de los dos primeros apartados exclusivamente. */
    completarIdentidadOficialVista(idAtencion,overlay).catch(error=>{
      if(document.getElementById('auroVistaIntegralOverlay') !== overlay) return;
      const slot = overlay.querySelector('[data-avi-fuente-identidad]');
      if(slot) slot.textContent='No se pudo verificar identidad persistida: '+texto(error?.message);
    });

    const idTecnicoBox = overlay.querySelector('[data-avi-id-tecnico]');
    if(idTecnicoBox) idTecnicoBox.textContent = 'ID atención · ' + texto(a.id_atencion || idAtencion);

    /* Delegación: las órdenes se insertan después del GET asíncrono. */
    overlay.addEventListener('click',function(event){
      const boton=event.target.closest('[data-avi-orden-oficial]');
      if(!boton || !overlay.contains(boton)) return;
      event.preventDefault();
      verDocumentoOficialOrden(boton.getAttribute('data-avi-orden-oficial'),overlay);
    });

    body.querySelectorAll('[data-avi-rx]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        abrirReceta(btn.getAttribute('data-avi-rx'));
      });
    });
  }

  async function esperarAtencion(id, maxMs){
    const inicio = Date.now();
    while(Date.now()-inicio < maxMs){
      const actual = texto(
        typeof window.getIdAtencionActiva === 'function'
          ? window.getIdAtencionActiva()
          : ''
      );
      if(actual === texto(id)) return true;
      await new Promise(r=>setTimeout(r,100));
    }
    return false;
  }

  async function abrir(idAtencion){
    instalarEstilos();

    const id = texto(idAtencion);
    const a = atencionPorId(id);

    if(!id || !a){
      alert('No se encontró la atención seleccionada.');
      return;
    }

    cerrar();

    const o = document.createElement('div');
    o.id = 'auroVistaIntegralOverlay';
    o.className = 'avi-overlay';
    o.dataset.aviAtencion = id;
    o.innerHTML =
      '<div class="avi-shell" role="dialog" aria-modal="true" aria-label="Vista integral de la atención">'+
        '<div class="avi-head">'+
          '<div class="avi-head-main">'+
            '<div class="avi-head-icon"><i class="bi bi-file-medical-fill"></i></div>'+
            '<div class="avi-head-copy">'+
              '<span class="avi-head-kicker">Historia clínica · Vista de consulta</span>'+
                     '<h3>Vista integral de la atención <span class="avi-numero-consulta" data-avi-numero-consulta></span></h3>'+
              '<div class="avi-head-patient" data-avi-paciente>Paciente</div>'+
              '<div class="avi-head-subcontext" data-avi-subcontexto></div>'+
              '<p class="avi-technical-id" data-avi-id-tecnico>ID atención · '+esc(id)+'</p>'+
              '<div class="avi-head-context" data-avi-contexto></div>'+
            '</div>'+
          '</div>'+
          '<button type="button" class="avi-close" data-avi-cerrar>'+
            '<i class="bi bi-x-lg"></i> <span>Cerrar</span>'+
          '</button>'+
        '</div>'+
        '<div class="avi-toolbar">'+
          '<button type="button" class="avi-btn" data-avi-expandir>Expandir todo</button>'+
          '<button type="button" class="avi-btn" data-avi-contraer>Contraer todo</button>'+
          '<button type="button" class="avi-btn" data-avi-actualizar>Actualizar vista</button>'+
        '</div>'+
        '<div class="avi-body">'+
          '<div class="avi-loading">Cargando información exacta de la consulta seleccionada…</div>'+
        '</div>'+
      '</div>';

    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';

    o.querySelector('[data-avi-cerrar]').addEventListener('click',cerrar);
    o.addEventListener('click',e=>{ if(e.target === o) cerrar(); });

    o.querySelector('[data-avi-expandir]').addEventListener('click',()=>{
      o.querySelectorAll('details').forEach(d=>d.open=true);
    });

    o.querySelector('[data-avi-contraer]').addEventListener('click',()=>{
      o.querySelectorAll('details').forEach(d=>d.open=false);
    });

    o.querySelector('[data-avi-actualizar]').addEventListener('click',async function(){
      const btn = this;
      const htmlOriginal = btn.innerHTML;
      if(btn.disabled) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Actualizando…';

      try{
        renderizar(id);
        await new Promise(r=>setTimeout(r,180));
        btn.innerHTML = '<i class="bi bi-check2"></i> Actualizada';
        setTimeout(function(){
          if(document.body.contains(btn)){
            btn.innerHTML = htmlOriginal;
            btn.disabled = false;
          }
        },700);
      }catch(error){
        console.warn(MODULO,'No se pudo actualizar la vista.',error);
        btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Reintentar';
        btn.disabled = false;
      }
    });

    try{
      if(typeof window.seleccionarAtencion === 'function'){
        window.seleccionarAtencion(id);
      }

      const ok = await esperarAtencion(id,2500);

      if(!ok){
        o.querySelector('.avi-body').innerHTML =
          '<div class="avi-line avi-span-full"><b>No se pudo activar la consulta</b>'+
          '<p>Cierre el visor y pulse primero “Ver”.</p></div>';
        return;
      }

      /*
        V1.3 - Render temprano seguro.
        sincronizarContextoAtencion carga Plan/Examen/Recetas en refuerzos de
        80/140/220 ms. Se mantiene margen corto y un único refuerzo visual
        posterior, sin alterar esos procesos ni su contexto_epoch.
      */
      await new Promise(r=>setTimeout(r,280));
      renderizar(id);
      setTimeout(function(){
        const actual = texto(
          typeof window.getIdAtencionActiva === 'function'
            ? window.getIdAtencionActiva()
            : ''
        );
        if(actual === id) renderizar(id);
      },650);

    }catch(e){
      console.error(MODULO,e);
      o.querySelector('.avi-body').innerHTML =
        '<div class="avi-line avi-span-full"><b>Error de presentación</b>'+
        '<p>No se pudo construir la Vista integral.</p></div>';
    }
  }

  window.AurosanaxVistaIntegral = {
    version:'IASYN-2-EIC-1.0-adaptacion',
    abrir,
    cerrar,
    abrirReceta,
    cerrarReceta
  };

  console.info(MODULO+' cargado.');
})();
