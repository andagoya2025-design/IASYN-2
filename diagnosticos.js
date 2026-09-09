/***********************************************************************
 IASYN 2 - REFUERZO QUIRÚRGICO DE DIAGNÓSTICO
 Archivo sugerido en GitHub: diagnosticos_refuerzo_iasyn2.js
 Versión: 1.0.0 - 2026-09-09
 -----------------------------------------------------------------------
 OBJETIVOS
 - Corregir el falso "sin cambios" del guardado explícito de Diagnóstico:
   para una atención abierta se contrasta primero contra lo REALMENTE
   persistido, no contra un snapshot local que puede no existir en Sheets.
 - Verificar por GET, después del POST, que la misma id_atencion contenga
   exactamente el diagnóstico esperado antes de devolver success:true.
 - Mantener Diagnóstico independiente de Examen Físico: id_examen es opcional.
 - Mostrar CIE-10 en formato profesional con punto sin migrar ni reescribir
   los códigos compactos internos (N871 -> N87.1, B977 -> B97.7).
 - Usar el catálogo maestro activo para búsqueda por código/nombre sin mostrar
   categorías ni subcategorías en la interfaz clínica.
 - Mantener aislamiento estricto por id_atencion y no tocar Plan, Recetas,
   Apps Script, Google Sheets ni otros módulos por sí solo.

 REGLAS ANTIRREGRESIVAS
 - Este archivo NO contiene endpoints ni Spreadsheet IDs de AUROSANAX PRUEBA.
 - Usa exclusivamente API_URL ya configurada por la instalación IASYN 2.
 - No crea escrituras automáticas. Solo refuerza una escritura que el usuario
   ya inició desde el flujo existente de Diagnóstico / Aplicar al Plan.
 - No sustituye diagnosticos.js ni examenfisico.js; se carga DESPUÉS de ellos.
************************************************************************/

(function(){
  'use strict';

  if(window.__IASYN2_DIAGNOSTICO_REFUERZO_V1){
    console.warn('IASYN 2 DIAGNÓSTICO REFUERZO: ya estaba cargado.');
    return;
  }
  window.__IASYN2_DIAGNOSTICO_REFUERZO_V1 = true;

  const MODULO = 'IASYN 2 DIAGNÓSTICO REFUERZO';
  const VERSION = '1.0.0';

  function texto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function normalizarTexto(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(valor){
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clonar(valor, fallback){
    try{
      return JSON.parse(JSON.stringify(valor));
    }catch(_e){
      return fallback;
    }
  }

  function arraySeguro(valor){
    if(Array.isArray(valor)) return valor;
    if(valor && Array.isArray(valor.data)) return valor.data;
    if(valor && Array.isArray(valor.registros)) return valor.registros;
    if(valor && Array.isArray(valor.resultado)) return valor.resultado;
    return [];
  }

  function apiUrl(){
    try{
      if(typeof API_URL !== 'undefined' && API_URL) return texto(API_URL);
    }catch(_e){}
    try{
      if(window.API_URL) return texto(window.API_URL);
    }catch(_e){}
    const input = document.getElementById('appsScriptUrl');
    return input ? texto(input.value) : '';
  }

  async function getJSON(accion, parametros){
    const API = apiUrl();
    if(!API) throw new Error('API_URL no está definida en IASYN 2.');

    const query = new URLSearchParams({accion:String(accion || '')});
    Object.keys(parametros || {}).forEach(function(clave){
      const valor = parametros[clave];
      if(valor !== undefined && valor !== null && texto(valor)){
        query.append(clave, valor);
      }
    });

    const respuesta = await fetch(
      API + '?' + query.toString() + '&_=' + Date.now(),
      {method:'GET', cache:'no-store'}
    );

    if(!respuesta.ok){
      throw new Error('HTTP ' + respuesta.status + ' al ejecutar ' + accion);
    }

    return await respuesta.json();
  }

  function idAtencionActiva(){
    try{
      if(typeof window.getIdAtencionActiva === 'function'){
        const id = texto(window.getIdAtencionActiva());
        if(id) return id;
      }
    }catch(_e){}

    try{
      if(typeof window.getAtencionActiva === 'function'){
        const atencion = window.getAtencionActiva();
        const id = texto(atencion?.id_atencion);
        if(id) return id;
      }
    }catch(_e){}

    try{
      const contexto = typeof window.obtenerContextoAtencionActual === 'function'
        ? window.obtenerContextoAtencionActual()
        : (typeof window.getContextoAtencionActual === 'function'
            ? window.getContextoAtencionActual()
            : null);
      const id = texto(contexto?.id_atencion);
      if(id) return id;
    }catch(_e){}

    return texto(
      window.auroAtencionNuevaId ||
      window.auroAtencionSeleccionadaId ||
      window.currentAttention?.id_atencion ||
      window.atencionActual?.id_atencion ||
      window.auroDiagnosticosState?.atencionActual ||
      window.examenFisicoState?.atencionActual ||
      ''
    );
  }

  /* ==========================================================
     CIE-10 VISUAL PROFESIONAL
     ========================================================== */
  function cieCompacto(valor){
    return texto(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function extraerAliasVisual(registro, compacto){
    registro = registro || {};
    compacto = compacto || cieCompacto(
      registro.codigo_cie10 || registro.codigo || registro.cie10 || ''
    );

    const candidatos = [
      registro.codigo_cie10_visual,
      registro.codigo_oficial,
      registro.alias_cie10,
      registro.palabras_clave
    ].filter(Boolean).join(' ');

    const hallados = String(candidatos || '')
      .toUpperCase()
      .match(/\b[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,2})?\b/g) || [];

    const alias = hallados.find(function(item){
      return cieCompacto(item) === compacto;
    });

    return alias ? texto(alias).toUpperCase() : '';
  }

  function formatearCie10Visual(valor, registro){
    const compacto = cieCompacto(valor);
    if(!compacto) return '';

    const alias = extraerAliasVisual(registro, compacto);
    if(alias) return alias;

    /* Compatibilidad histórica conocida: N720 corresponde a la categoría N72. */
    if(compacto === 'N720') return 'N72';

    /* Categorías CIE-10 de 3 caracteres permanecen sin decimal. */
    if(/^[A-Z][0-9]{2}$/.test(compacto)) return compacto;

    /* Subcategorías compactas de 4 o 5 caracteres: punto tras el 3.er carácter. */
    if(/^[A-Z][0-9]{3,4}$/.test(compacto)){
      return compacto.slice(0, 3) + '.' + compacto.slice(3);
    }

    return compacto;
  }

  window.auroFormatearCie10Visual = formatearCie10Visual;
  window.iasynFormatearCie10Visual = formatearCie10Visual;

  /* ==========================================================
     CATÁLOGO MAESTRO DE DIAGNÓSTICOS - SOLO LECTURA
     ========================================================== */
  let catalogoMaestro = [];
  let catalogoCargado = false;
  let promesaCatalogo = null;
  let tokenBusqueda = 0;

  function normalizarRegistroCatalogo(raw){
    raw = raw || {};
    const codigo = cieCompacto(
      raw.codigo_cie10 || raw.codigo || raw.cie10 || ''
    );
    const nombre = texto(
      raw.descripcion || raw.nombre || raw.diagnostico || raw.descripcion_diagnostico || ''
    );

    return {
      codigo:codigo,
      nombre:nombre,
      codigo_visual:formatearCie10Visual(codigo, raw),
      raw:raw
    };
  }

  function catalogoFallbackLocal(){
    return (Array.isArray(window.hcCie10CatalogoBase)
      ? window.hcCie10CatalogoBase
      : []
    ).map(normalizarRegistroCatalogo)
      .filter(function(item){ return item.codigo && item.nombre; });
  }

  function fusionarCatalogos(principal, respaldo){
    const mapa = new Map();
    [...(principal || []), ...(respaldo || [])].forEach(function(item){
      const normalizado = item?.raw ? item : normalizarRegistroCatalogo(item);
      const clave = cieCompacto(normalizado.codigo);
      if(!clave || !normalizado.nombre) return;
      if(!mapa.has(clave)) mapa.set(clave, normalizado);
    });
    return Array.from(mapa.values());
  }

  async function cargarCatalogoMaestro(){
    if(catalogoCargado && catalogoMaestro.length) return catalogoMaestro;
    if(promesaCatalogo) return promesaCatalogo;

    promesaCatalogo = (async function(){
      const local = catalogoFallbackLocal();
      try{
        const respuesta = await getJSON('listarCatalogoDiagnosticosActivos', {});
        const remotos = arraySeguro(respuesta)
          .map(normalizarRegistroCatalogo)
          .filter(function(item){ return item.codigo && item.nombre; });

        catalogoMaestro = fusionarCatalogos(remotos, local);
        catalogoCargado = catalogoMaestro.length > 0;
      }catch(error){
        console.warn(
          MODULO + ': catálogo maestro no disponible; se conserva fallback local.',
          error
        );
        catalogoMaestro = local;
        catalogoCargado = catalogoMaestro.length > 0;
      }finally{
        promesaCatalogo = null;
      }

      /*
        El motor existente puede seguir leyendo hcCie10CatalogoBase.
        Se expone únicamente código compacto + nombre, sin categorías visuales.
      */
      if(catalogoMaestro.length){
        window.hcCie10CatalogoBase = catalogoMaestro.map(function(item){
          return {codigo:item.codigo, nombre:item.nombre};
        });
      }

      window.IASYN_CATALOGO_DIAGNOSTICOS_ACTIVO = catalogoMaestro.slice();
      return catalogoMaestro;
    })();

    return promesaCatalogo;
  }

  function renderResultadosBusqueda(lista){
    const body = document.getElementById('hcDxResultadosBody');
    if(!body) return;

    if(!Array.isArray(lista) || !lista.length){
      body.innerHTML = '<tr><td colspan="3" class="diagnostico-empty">Sin Registros</td></tr>';
      return;
    }

    body.innerHTML = lista.map(function(item, indice){
      return '<tr>' +
        '<td class="diagnostico-cie-code">' +
          escapeHtml(item.codigo_visual || formatearCie10Visual(item.codigo, item.raw)) +
        '</td>' +
        '<td>' + escapeHtml(String(item.nombre || '').toUpperCase()) + '</td>' +
        '<td><button type="button" class="diagnostico-add" ' +
          'onclick="agregarDiagnosticoCie10DesdeResultado(' + indice + ')">Agregar</button></td>' +
      '</tr>';
    }).join('');
  }

  async function buscarDiagnosticoCie10IASYN(){
    const miToken = ++tokenBusqueda;
    const codigoRaw = texto(document.getElementById('hcDxCodigoBuscar')?.value);
    const nombreRaw = texto(document.getElementById('hcDxNombreBuscar')?.value);
    const codigo = cieCompacto(codigoRaw);
    const nombre = normalizarTexto(nombreRaw);

    if(!codigo && !nombre){
      window.hcDxResultadosActuales = [];
      renderResultadosBusqueda([]);
      return [];
    }

    const catalogo = await cargarCatalogoMaestro();
    if(miToken !== tokenBusqueda) return [];

    const resultados = (catalogo || []).filter(function(item){
      const coincideCodigo = !codigo || cieCompacto(item.codigo).includes(codigo);
      const coincideNombre = !nombre || normalizarTexto(item.nombre).includes(nombre);
      return coincideCodigo && coincideNombre;
    }).slice(0, 20);

    /*
      La función histórica agregarDiagnosticoCie10DesdeResultado() consume
      esta misma variable global. Se conserva el código compacto internamente.
    */
    window.hcDxResultadosActuales = resultados.map(function(item){
      return {codigo:item.codigo, nombre:item.nombre};
    });

    renderResultadosBusqueda(resultados);
    return resultados;
  }

  function renderSeleccionadosIASYN(){
    const body = document.getElementById('hcDxSeleccionadosBody');
    if(!body) return;

    const lista = Array.isArray(window.hcDiagnosticosSeleccionados)
      ? window.hcDiagnosticosSeleccionados
      : [];

    if(!lista.length){
      body.innerHTML = '<tr><td colspan="4" class="diagnostico-empty">Sin diagnósticos agregados</td></tr>';
      return;
    }

    body.innerHTML = lista.map(function(d, indice){
      const tipo = texto(d?.tipo) === 'Definitivo' ? 'Definitivo' : 'Presuntivo';
      return '<tr>' +
        '<td><span class="diagnostico-cie-code">' +
          escapeHtml(formatearCie10Visual(d?.codigo)) +
        '</span> &nbsp; ' + escapeHtml(String(d?.nombre || '').toUpperCase()) + '</td>' +
        '<td class="text-center"><input class="diagnostico-radio" type="radio" ' +
          'name="hcDxPrincipal" ' + (d?.principal ? 'checked' : '') +
          ' onchange="marcarDiagnosticoPrincipal(' + indice + ')"></td>' +
        '<td><select class="form-select diagnostico-tipo-select" ' +
          'onchange="cambiarTipoDiagnostico(' + indice + ', this.value)">' +
          '<option ' + (tipo === 'Presuntivo' ? 'selected' : '') + '>Presuntivo</option>' +
          '<option ' + (tipo === 'Definitivo' ? 'selected' : '') + '>Definitivo</option>' +
        '</select></td>' +
        '<td class="text-center"><button type="button" class="diagnostico-delete" ' +
          'onclick="eliminarDiagnosticoCie10(' + indice + ')">' +
          '<i class="bi bi-trash"></i></button></td>' +
      '</tr>';
    }).join('');
  }

  function instalarPresentacionCie10(){
    /* Se sustituyen solo funciones públicas visuales; no cambia persistencia. */
    window.buscarDiagnosticoCie10 = buscarDiagnosticoCie10IASYN;
    window.renderDiagnosticosSeleccionados = renderSeleccionadosIASYN;

    try{ renderSeleccionadosIASYN(); }catch(_e){}
    Promise.resolve(cargarCatalogoMaestro()).catch(function(){});
  }

  /* ==========================================================
     FIRMA CLÍNICA PARA VERIFICACIÓN DE PERSISTENCIA
     ========================================================== */
  function principalBooleano(valor){
    if(valor === true || valor === 1) return true;
    const v = normalizarTexto(valor);
    return ['si','sí','true','1','principal'].includes(v);
  }

  function normalizarDxFirma(raw){
    raw = raw || {};
    return {
      codigo:cieCompacto(raw.codigo_cie10 || raw.codigo || ''),
      nombre:normalizarTexto(raw.descripcion || raw.nombre || ''),
      tipo:normalizarTexto(raw.tipo_diagnostico || raw.tipo || 'Presuntivo') === 'definitivo'
        ? 'definitivo'
        : 'presuntivo',
      principal:principalBooleano(raw.principal)
    };
  }

  function firmaLista(lista){
    return (Array.isArray(lista) ? lista : [])
      .map(normalizarDxFirma)
      .filter(function(item){ return item.codigo || item.nombre; })
      .sort(function(a, b){
        const ka = [a.codigo, a.nombre, a.tipo, a.principal ? '1' : '0'].join('|');
        const kb = [b.codigo, b.nombre, b.tipo, b.principal ? '1' : '0'].join('|');
        return ka.localeCompare(kb);
      })
      .map(function(item){
        return [item.codigo, item.nombre, item.tipo, item.principal ? '1' : '0'].join('|');
      })
      .join('||');
  }

  async function leerPersistidos(idAtencion){
    const respuesta = await getJSON('listarDiagnosticosPorAtencion', {
      id_atencion:texto(idAtencion)
    });

    if(respuesta && respuesta.success === false){
      throw new Error(
        texto(respuesta.message) || 'El backend no confirmó la lectura de diagnósticos.'
      );
    }

    return arraySeguro(respuesta);
  }

  function esperar(ms){
    return new Promise(function(resolve){ setTimeout(resolve, ms); });
  }

  async function verificarPersistencia(idAtencion, esperados){
    const firmaEsperada = firmaLista(esperados);
    const pausas = [0, 180, 420];
    let ultimoError = null;
    let ultimoPersistido = [];

    for(let intento = 0; intento < pausas.length; intento++){
      if(pausas[intento]) await esperar(pausas[intento]);

      try{
        const persistidos = await leerPersistidos(idAtencion);
        ultimoPersistido = persistidos;

        if(firmaLista(persistidos) === firmaEsperada){
          return {
            ok:true,
            intentos:intento + 1,
            persistidos:persistidos
          };
        }
      }catch(error){
        ultimoError = error;
      }
    }

    return {
      ok:false,
      persistidos:ultimoPersistido,
      error:ultimoError
    };
  }

  /* ==========================================================
     GUARDADO VERIFICADO
     ========================================================== */
  function instalarGuardadoVerificado(){
    const actual = window.auroGuardarDiagnosticosAtencionActual;
    if(typeof actual !== 'function'){
      console.warn(MODULO + ': aún no existe auroGuardarDiagnosticosAtencionActual().');
      return false;
    }

    if(actual.__iasynDxGuardadoVerificadoV1) return true;

    const original = actual;

    const reforzado = async function(opciones){
      const opcionesEntrada = opciones && typeof opciones === 'object'
        ? opciones
        : {};
      const opcionesSeguras = Object.assign({}, opcionesEntrada);
      const snapshotEditorAntes = clonar(
        Array.isArray(window.hcDiagnosticosSeleccionados)
          ? window.hcDiagnosticosSeleccionados
          : [],
        []
      );
      const idAtencionAntes = idAtencionActiva();

      /*
        CORRECCIÓN DEL FALSO "SIN CAMBIOS":
        El editor abierto de diagnosticos.js enviaba como persistidos_base
        state.diagnosticos y además omitía la lectura remota. Si ese state
        contenía el diagnóstico visual pero Sheets estaba vacío, la firma era
        igual y examenfisico.js devolvía success:true/sin_cambios sin hacer POST.

        Para el guardado explícito de una atención abierta, se elimina esa
        suposición y se obliga a contrastar contra listarDiagnosticosPorAtencion.
      */
      if(texto(opcionesSeguras.origen) === 'edicion_diagnostico_abierto'){
        delete opcionesSeguras.persistidos_base;
        opcionesSeguras.omitir_lectura_persistidos = false;
      }

      const resultado = await Promise.resolve(
        original.call(this, opcionesSeguras)
      );

      if(!resultado || resultado.success !== true) return resultado;

      /* Corrección histórica: conserva su flujo de auditoría/diferimiento. */
      if(
        resultado.correccion_clinica_activa === true ||
        resultado.guardado_diferido === true
      ){
        return resultado;
      }

      const idAtencion = texto(resultado.id_atencion || idAtencionAntes || idAtencionActiva());
      if(!idAtencion){
        return Object.assign({}, resultado, {
          success:false,
          verificacion_persistencia:false,
          message:'El backend respondió, pero IASYN 2 no pudo confirmar la id_atencion del diagnóstico.'
        });
      }

      const esperados = Array.isArray(resultado.registros_enviados)
        ? clonar(resultado.registros_enviados, [])
        : snapshotEditorAntes;

      const verificacion = await verificarPersistencia(idAtencion, esperados);

      if(!verificacion.ok){
        console.error(
          MODULO + ': el guardado no pudo verificarse contra la misma atención.',
          {
            id_atencion:idAtencion,
            esperados:esperados,
            persistidos:verificacion.persistidos,
            error:verificacion.error || null
          }
        );

        return Object.assign({}, resultado, {
          success:false,
          backend_success:true,
          verificacion_persistencia:false,
          id_atencion:idAtencion,
          message:
            'IASYN 2 recibió respuesta del backend, pero no pudo confirmar en la base ' +
            'que el diagnóstico de esta atención quedara persistido. No se marcará como guardado.'
        });
      }

      return Object.assign({}, resultado, {
        success:true,
        verificacion_persistencia:true,
        verificacion_intentos:verificacion.intentos,
        id_atencion:idAtencion,
        diagnosticos_persistidos:verificacion.persistidos.length
      });
    };

    reforzado.__iasynDxGuardadoVerificadoV1 = true;
    reforzado.__iasynDxGuardadoOriginal = original;

    window.auroGuardarDiagnosticosAtencionActual = reforzado;
    window.IASYN_GUARDAR_DIAGNOSTICOS_VERIFICADO = reforzado;
    return true;
  }

  /* ==========================================================
     REINSTALACIÓN SEGURA SI OTRO MÓDULO RESTAURA EL GUARDADOR
     ========================================================== */
  function asegurarRefuerzo(){
    instalarPresentacionCie10();
    instalarGuardadoVerificado();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', asegurarRefuerzo, {once:true});
  }else{
    asegurarRefuerzo();
  }

  /*
    La corrección histórica puede envolver/restaurar temporalmente el guardador.
    En cambios de atención se verifica que el refuerzo siga siendo la capa pública.
  */
  document.addEventListener('aurosanax:atencion-cambiada', function(){
    setTimeout(instalarGuardadoVerificado, 0);
    setTimeout(function(){
      try{ renderSeleccionadosIASYN(); }catch(_e){}
    }, 40);
  });

  window.IASYN_DIAGNOSTICO_REFUERZO = Object.freeze({
    version:VERSION,
    formatearCie10Visual:formatearCie10Visual,
    cargarCatalogoMaestro:cargarCatalogoMaestro,
    verificarPersistencia:verificarPersistencia,
    reinstalar:asegurarRefuerzo
  });

  console.log(
    MODULO + ' ' + VERSION +
    ': cargado. Guardado verificado + CIE-10 visual + catálogo maestro sin categorías.'
  );
})();
