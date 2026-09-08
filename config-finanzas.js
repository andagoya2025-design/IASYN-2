/*
 IASYN - AISLAMIENTO CONFIGURACIÓN FINANCIERA
 - No contiene URLs, Spreadsheet IDs ni Drive IDs directos.
 - Conserva las acciones financieras del backend y los IDs HTML existentes.
 - No modifica datos clínicos ni el catálogo clínico de médicos.
 - No guarda automáticamente por inicialización; las escrituras continúan
   dependiendo de acciones explícitas del usuario.
*/
/* ==========================================================
   IASYN ERP - CONFIG FINANZAS JS
   Versión: 2026-08-11 / 06 CIERRE PREMIUM
   Fase 3 - Archivo independiente ampliado

   OBJETIVO:
   - Administrar únicamente configuración financiera.
   - Usar apiGet() / apiPost() existentes en configuracion.html.
   - Usar exclusivamente endpoints financieros del mismo Code.gs.
   - No guardar ni modificar datos clínicos.
   - No tocar config-centro.js ni seguridad.js.
   - No guardar automáticamente al abrir/cambiar pestaña.

   REQUISITOS HTML FUTUROS:
   Parámetros:
   - cfgFinMoneda
   - cfgFinMetaMensual
   - cfgFinHorasFacturables
   - cfgFinMargenMinimo
   - cfgFinPorcentajeReferido
   - cfgFinDiasCartera
   - finanzasConfigMsg
   - btnGuardarConfigFinanzas

   Gastos fijos:
   - finGastoNombre
   - finGastoNombreOtro
   - finGastoCategoria
   - finGastoCategoriaOtro
   - finGastoValor
   - finGastoPeriodicidad
   - finGastoValorMensual
   - finGastoFechaInicio
   - finGastoFechaFin
   - finGastoObservaciones
   - finGastosTbody
   - finanzasGastosMsg
   - btnGuardarGastoFinanzas
   - btnCargarBaseGastosFinanzas
   - finGastosMobile

   Configuración económica de médicos:
   - finMedicoConfigId
   - finMedicoId
   - finMedicoTipoPago
   - finMedicoPorcentaje
   - finMedicoValorFijo
   - finMedicoValorHora
   - finMedicoVigenciaDesde
   - finMedicoVigenciaHasta
   - finMedicoEstado
   - finMedicoObservaciones
   - finMedicosTbody
   - finanzasMedicosMsg
   - btnGuardarMedicoFinanzas
   - btnLimpiarMedicoFinanzas
   - finMedicosMobile
   ========================================================== */

(function(){
  'use strict';

  const IASYN_FIN_CONFIG_KEYS = Object.freeze({
    moneda: 'moneda',
    meta_mensual: 'meta_mensual',
    horas_facturables_mes: 'horas_facturables_mes',
    margen_minimo: 'margen_minimo',
    porcentaje_referido_predeterminado: 'porcentaje_referido_predeterminado',
    dias_vencimiento_cartera: 'dias_vencimiento_cartera'
  });

  /* Sugerencias de alta. No fijan montos y siguen siendo editables. */
  const IASYN_FIN_GASTO_SUGERENCIAS = Object.freeze({
    'Alquiler': { categoria: 'Infraestructura', periodicidad: 'Mensual' },
    'Luz': { categoria: 'Servicios básicos', periodicidad: 'Mensual' },
    'Agua': { categoria: 'Servicios básicos', periodicidad: 'Mensual' },
    'Internet': { categoria: 'Servicios básicos', periodicidad: 'Mensual' },
    'Mantenimiento de aire': { categoria: 'Mantenimiento', periodicidad: 'Anual' },
    'Mantenimiento aire acondicionado': { categoria: 'Mantenimiento', periodicidad: 'Anual' },
    'Permiso de funcionamiento': { categoria: 'Permisos e impuestos', periodicidad: 'Anual' },
    'Permiso de funcionamiento ACESS': { categoria: 'Permisos e impuestos', periodicidad: 'Anual' },
    'Bomberos': { categoria: 'Permisos e impuestos', periodicidad: 'Anual' },
    'Permiso de Bomberos': { categoria: 'Permisos e impuestos', periodicidad: 'Anual' },
    'Patente': { categoria: 'Permisos e impuestos', periodicidad: 'Anual' },
    'Tasa de Habilitación': { categoria: 'Permisos e impuestos', periodicidad: 'Anual' },
    'Publicidad': { categoria: 'Marketing/Publicidad', periodicidad: 'Anual' },
    'Contabilidad': { categoria: 'Administración', periodicidad: 'Anual' },
    'Limpieza e insumos': { categoria: 'Limpieza e insumos', periodicidad: 'Anual' },
    'Mantenimiento de equipos': { categoria: 'Mantenimiento', periodicidad: 'Anual' },
    'Depreciación de equipos': { categoria: 'Equipos/Depreciación', periodicidad: 'Mensual' }
  });

  /* Modelo financiero base IASYN.
     La carga es manual por botón, nunca automática al abrir.
     Tasa de Habilitación permanece disponible en catálogo pero no se precarga
     porque el documento base no proporciona un valor. */
  const IASYN_FIN_GASTOS_BASE = Object.freeze([
    { nombre_gasto:'Alquiler', categoria:'Infraestructura', valor:950, periodicidad:'Mensual' },
    { nombre_gasto:'Luz', categoria:'Servicios básicos', valor:40, periodicidad:'Mensual' },
    { nombre_gasto:'Agua', categoria:'Servicios básicos', valor:10, periodicidad:'Mensual' },
    { nombre_gasto:'Internet', categoria:'Servicios básicos', valor:35, periodicidad:'Mensual' },
    { nombre_gasto:'Mantenimiento aire acondicionado', categoria:'Mantenimiento', valor:50, periodicidad:'Anual' },
    { nombre_gasto:'Permiso de funcionamiento ACESS', categoria:'Permisos e impuestos', valor:400, periodicidad:'Anual' },
    { nombre_gasto:'Permiso de Bomberos', categoria:'Permisos e impuestos', valor:150, periodicidad:'Anual' },
    { nombre_gasto:'Patente', categoria:'Permisos e impuestos', valor:120, periodicidad:'Anual' },
    { nombre_gasto:'Publicidad', categoria:'Marketing/Publicidad', valor:1000, periodicidad:'Anual' },
    { nombre_gasto:'Contabilidad', categoria:'Administración', valor:200, periodicidad:'Anual' },
    { nombre_gasto:'Limpieza e insumos', categoria:'Limpieza e insumos', valor:300, periodicidad:'Anual' },
    { nombre_gasto:'Mantenimiento de equipos', categoria:'Mantenimiento', valor:300, periodicidad:'Anual' },
    { nombre_gasto:'Depreciación de equipos', categoria:'Equipos/Depreciación', valor:350, periodicidad:'Mensual' }
  ]);

  let iasynFinanzasConfigCargada = false;
  let iasynFinanzasGastosCargados = false;
  let iasynFinanzasGastos = [];

  /* Estado aislado: configuración económica de médicos.
     No modifica el catálogo clínico de médicos. */
  let iasynFinanzasMedicosCargados = false;
  let iasynFinanzasCatalogoMedicos = [];
  let iasynFinanzasConfigMedicos = [];

  function finEl(id){
    return document.getElementById(id);
  }

  function finTexto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function finEscape(valor){
    return finTexto(valor).replace(/[&<>"']/g, function(c){
      return ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#039;'
      })[c];
    });
  }

  function finNumero(valor){
    const txt = finTexto(valor).replace(',', '.');
    if(!txt) return 0;
    const n = Number(txt);
    return Number.isFinite(n) ? n : 0;
  }

  function finNumeroOpcional(valor){
    const txt = finTexto(valor);
    if(!txt) return '';
    const n = Number(txt.replace(',', '.'));
    return Number.isFinite(n) ? n : '';
  }

  function finSetMsg(id, mensaje, tipo){
    const el = finEl(id);
    if(!el) return;

    const clases = {
      ok: 'text-success',
      error: 'text-danger',
      info: 'text-muted'
    };

    el.className = clases[tipo] || clases.info;
    el.textContent = mensaje || '';
  }

  function finSetBoton(id, bloqueado, texto){
    const btn = finEl(id);
    if(!btn) return;

    if(!btn.dataset.iasynTextoOriginal){
      btn.dataset.iasynTextoOriginal = btn.innerHTML;
    }

    btn.disabled = !!bloqueado;
    btn.innerHTML = bloqueado
      ? '<i class="bi bi-arrow-clockwise me-1"></i>' + finEscape(texto || 'Procesando...')
      : btn.dataset.iasynTextoOriginal;
  }

  function finValorConfig(config, clave, respaldo){
    if(config && Object.prototype.hasOwnProperty.call(config, clave)){
      const valor = config[clave];
      if(valor !== null && valor !== undefined && valor !== '') return valor;
    }
    return respaldo;
  }

  function finAsignarValor(id, valor){
    const el = finEl(id);
    if(el) el.value = valor === null || valor === undefined ? '' : valor;
  }

  function finValidarApi(){
    if(typeof window.apiGet !== 'function' || typeof window.apiPost !== 'function'){
      throw new Error('Configuración no tiene disponibles apiGet/apiPost.');
    }
  }

  async function cargarConfiguracionFinanzas(forzar){
    if(iasynFinanzasConfigCargada && !forzar) return;

    finValidarApi();
    finSetMsg('finanzasConfigMsg', 'Cargando configuración financiera...', 'info');

    try{
      const config = await window.apiGet('obtenerConfiguracionFinanciera');
      const datos = config && typeof config === 'object' && !Array.isArray(config) ? config : {};

      finAsignarValor('cfgFinMoneda',
        finValorConfig(datos, IASYN_FIN_CONFIG_KEYS.moneda, 'USD'));

      finAsignarValor('cfgFinMetaMensual',
        finValorConfig(datos, IASYN_FIN_CONFIG_KEYS.meta_mensual, ''));

      finAsignarValor('cfgFinHorasFacturables',
        finValorConfig(datos, IASYN_FIN_CONFIG_KEYS.horas_facturables_mes, ''));

      finAsignarValor('cfgFinMargenMinimo',
        finValorConfig(datos, IASYN_FIN_CONFIG_KEYS.margen_minimo, ''));

      finAsignarValor('cfgFinPorcentajeReferido',
        finValorConfig(datos, IASYN_FIN_CONFIG_KEYS.porcentaje_referido_predeterminado, ''));

      finAsignarValor('cfgFinDiasCartera',
        finValorConfig(datos, IASYN_FIN_CONFIG_KEYS.dias_vencimiento_cartera, ''));

      iasynFinanzasConfigCargada = true;
      finSetMsg('finanzasConfigMsg', 'Configuración financiera cargada.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - cargar configuración:', e);
      finSetMsg('finanzasConfigMsg',
        'No se pudo cargar la configuración financiera: ' + finTexto(e.message || e),
        'error');
    }
  }

  async function guardarClaveFinanciera(clave, valor, descripcion, tipoDato){
    const respuesta = await window.apiPost('guardarConfiguracionFinanciera', {
      clave: clave,
      valor: valor,
      descripcion: descripcion || '',
      tipo_dato: tipoDato || 'texto',
      estado: 'Activo'
    });

    if(!respuesta || respuesta.success !== true){
      throw new Error((respuesta && respuesta.message) || ('No se pudo guardar ' + clave));
    }

    return respuesta;
  }

  async function guardarConfiguracionFinanzas(){
    finValidarApi();

    const moneda = finTexto(finEl('cfgFinMoneda')?.value || 'USD').toUpperCase();
    const meta = finNumeroOpcional(finEl('cfgFinMetaMensual')?.value);
    const horas = finNumeroOpcional(finEl('cfgFinHorasFacturables')?.value);
    const margen = finNumeroOpcional(finEl('cfgFinMargenMinimo')?.value);
    const referido = finNumeroOpcional(finEl('cfgFinPorcentajeReferido')?.value);
    const diasCartera = finNumeroOpcional(finEl('cfgFinDiasCartera')?.value);

    if(!moneda){
      alert('Seleccione o ingrese la moneda.');
      return;
    }
    if(meta !== '' && meta < 0){
      alert('La meta mensual no puede ser negativa.');
      return;
    }
    if(horas !== '' && horas < 0){
      alert('Las horas facturables no pueden ser negativas.');
      return;
    }
    if(margen !== '' && (margen < 0 || margen > 100)){
      alert('El margen mínimo debe estar entre 0 y 100.');
      return;
    }
    if(referido !== '' && (referido < 0 || referido > 100)){
      alert('El porcentaje de referido debe estar entre 0 y 100.');
      return;
    }
    if(diasCartera !== '' && diasCartera < 0){
      alert('Los días de vencimiento de cartera no pueden ser negativos.');
      return;
    }

    finSetBoton('btnGuardarConfigFinanzas', true, 'Guardando...');
    finSetMsg('finanzasConfigMsg', 'Guardando parámetros financieros...', 'info');

    try{
      /* Guardados independientes por clave.
         No se llama ningún guardador clínico ni institucional. */
      await guardarClaveFinanciera(
        IASYN_FIN_CONFIG_KEYS.moneda,
        moneda,
        'Moneda principal del módulo financiero',
        'texto'
      );

      await guardarClaveFinanciera(
        IASYN_FIN_CONFIG_KEYS.meta_mensual,
        meta,
        'Meta mensual de ingresos',
        'numero'
      );

      await guardarClaveFinanciera(
        IASYN_FIN_CONFIG_KEYS.horas_facturables_mes,
        horas,
        'Horas facturables estimadas por mes',
        'numero'
      );

      await guardarClaveFinanciera(
        IASYN_FIN_CONFIG_KEYS.margen_minimo,
        margen,
        'Margen mínimo objetivo en porcentaje',
        'numero'
      );

      if(finEl('cfgFinPorcentajeReferido')){
        await guardarClaveFinanciera(
          IASYN_FIN_CONFIG_KEYS.porcentaje_referido_predeterminado,
          referido,
          'Porcentaje de referido predeterminado',
          'numero'
        );
      }

      if(finEl('cfgFinDiasCartera')){
        await guardarClaveFinanciera(
          IASYN_FIN_CONFIG_KEYS.dias_vencimiento_cartera,
          diasCartera,
          'Días predeterminados para vencimiento de cartera',
          'numero'
        );
      }

      iasynFinanzasConfigCargada = false;
      await cargarConfiguracionFinanzas(true);

      finSetMsg('finanzasConfigMsg', 'Configuración financiera guardada correctamente.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - guardar configuración:', e);
      finSetMsg('finanzasConfigMsg',
        'Error guardando configuración financiera: ' + finTexto(e.message || e),
        'error');
      alert('Error al guardar Finanzas: ' + finTexto(e.message || e));
    }finally{
      finSetBoton('btnGuardarConfigFinanzas', false);
    }
  }

  function actualizarNombreOtroGastoFinanzas(){
    const selector = finEl('finGastoNombre');
    const otro = finEl('finGastoNombreOtro');
    if(!selector || !otro) return;

    const esOtro = finTexto(selector.value) === '__OTRO__';
    otro.classList.toggle('d-none', !esOtro);

    if(!esOtro){
      otro.value = '';
    }
  }

  function obtenerNombreGastoFinanzas(){
    const selector = finEl('finGastoNombre');
    if(!selector) return '';

    const valor = finTexto(selector.value);
    if(valor === '__OTRO__'){
      return finTexto(finEl('finGastoNombreOtro')?.value);
    }

    return valor;
  }

  function asignarNombreGastoFinanzas(nombre){
    const selector = finEl('finGastoNombre');
    const otro = finEl('finGastoNombreOtro');
    if(!selector) return;

    const valor = finTexto(nombre);
    const existe = Array.from(selector.options || []).some(function(op){
      return finTexto(op.value) === valor;
    });

    if(!valor){
      selector.value = '';
      if(otro) otro.value = '';
    }else if(existe){
      selector.value = valor;
      if(otro) otro.value = '';
    }else{
      selector.value = '__OTRO__';
      if(otro) otro.value = valor;
    }

    actualizarNombreOtroGastoFinanzas();
  }

  function actualizarCategoriaOtroGastoFinanzas(){
    const selector = finEl('finGastoCategoria');
    const otro = finEl('finGastoCategoriaOtro');
    if(!selector || !otro) return;

    const esOtro = finTexto(selector.value) === '__OTRO__';
    otro.classList.toggle('d-none', !esOtro);

    if(!esOtro) otro.value = '';
  }

  function obtenerCategoriaGastoFinanzas(){
    const selector = finEl('finGastoCategoria');
    if(!selector) return '';

    const valor = finTexto(selector.value);
    if(valor === '__OTRO__'){
      return finTexto(finEl('finGastoCategoriaOtro')?.value);
    }
    return valor;
  }

  function asignarCategoriaGastoFinanzas(categoria){
    const selector = finEl('finGastoCategoria');
    const otro = finEl('finGastoCategoriaOtro');
    if(!selector) return;

    const valor = finTexto(categoria);
    const existe = Array.from(selector.options || []).some(function(op){
      return finTexto(op.value) === valor;
    });

    if(!valor){
      selector.value = '';
      if(otro) otro.value = '';
    }else if(existe){
      selector.value = valor;
      if(otro) otro.value = '';
    }else{
      selector.value = '__OTRO__';
      if(otro) otro.value = valor;
    }

    actualizarCategoriaOtroGastoFinanzas();
  }

  function fechaHoyFinanzas(){
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function normalizarFechaInputFinanzas(valor){
    if(valor === null || valor === undefined || valor === '') return '';

    if(valor instanceof Date && !Number.isNaN(valor.getTime())){
      const y = valor.getFullYear();
      const m = String(valor.getMonth() + 1).padStart(2, '0');
      const d = String(valor.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }

    const txt = finTexto(valor);
    if(!txt) return '';

    const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

    const latam = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(latam){
      return latam[3] + '-' +
        String(latam[2]).padStart(2, '0') + '-' +
        String(latam[1]).padStart(2, '0');
    }

    return '';
  }

  function aplicarSugerenciasGastoFinanzas(){
    const nombre = obtenerNombreGastoFinanzas();
    const sugerencia = IASYN_FIN_GASTO_SUGERENCIAS[nombre];
    if(!sugerencia) return;

    asignarCategoriaGastoFinanzas(sugerencia.categoria);

    const periodicidad = finEl('finGastoPeriodicidad');
    if(periodicidad && sugerencia.periodicidad){
      periodicidad.value = sugerencia.periodicidad;
      actualizarProrrateoGastoFinanzas();
    }
  }

  function finNormalizarClaveGasto(valor){
    let txt = finTexto(valor).toLowerCase();
    try{ txt = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }catch(_e){}
    txt = txt.replace(/\s+/g, ' ').trim();

    const alias = {
      'mantenimiento de aire': 'mantenimiento aire acondicionado',
      'permiso de funcionamiento': 'permiso de funcionamiento acess',
      'bomberos': 'permiso de bomberos'
    };
    return alias[txt] || txt;
  }

  function finBuscarGastoActivoDuplicado(nombre, excluirId){
    const clave = finNormalizarClaveGasto(nombre);
    const excluir = finTexto(excluirId);
    return iasynFinanzasGastos.find(function(g){
      return finTexto(g.id_gasto) !== excluir &&
        finNormalizarClaveGasto(g.nombre_gasto) === clave &&
        finTexto(g.estado || 'Activo').toLowerCase() === 'activo';
    }) || null;
  }

  function finEstadoActivo(valor){
    return finTexto(valor || 'Activo').toLowerCase() === 'activo';
  }

  function finDinero(valor){
    const n = Number(String(valor === null || valor === undefined ? 0 : valor).replace(',', '.'));
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }


  /* ==========================================================
     IASYN FINANZAS - RECUPERACIÓN QUIRÚRGICA RENTABILIDAD
     2026-08-18 · ANTIRREGRESIÓN

     Recupera exclusivamente el resumen mensual existente en la
     rama CONTROL_GASTOS_RENTABILIDAD.

     NO modifica:
     - guardado de parámetros financieros,
     - gastos fijos existentes,
     - configuración económica de médicos,
     - Caja,
     - backend,
     - módulos clínicos.

     Solo lectura: consulta obtenerResumenFinancieroPeriodo.
     ========================================================== */
  function finMesActual(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  function finMoneyUI(valor){
    return '$' + finNumero(valor).toLocaleString('es-EC',{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }

  async function cargarResumenMensualFinanzas(forzar){
    finValidarApi();

    if(typeof window.apiGetParams !== 'function'){
      throw new Error('Configuración no tiene disponible apiGetParams para consultar el período financiero.');
    }

    const periodo = finTexto(finEl('finResumenPeriodo')?.value) || finMesActual();
    if(finEl('finResumenPeriodo') && !finEl('finResumenPeriodo').value){
      finEl('finResumenPeriodo').value = periodo;
    }

    finSetMsg('finResumenMsg', 'Calculando resultado financiero del período...', 'info');

    try{
      const r = await window.apiGetParams('obtenerResumenFinancieroPeriodo', { periodo: periodo });
      const data = r && typeof r === 'object' ? r : {};

      const asignar = function(id, valor){
        const el = finEl(id);
        if(el) el.textContent = valor;
      };

      asignar('finResIngresos', finMoneyUI(data.ingresos_cobrados));
      asignar('finResFacturacion', finMoneyUI(data.facturacion_generada));
      asignar('finResCartera', finMoneyUI(data.cuentas_por_cobrar));
      asignar('finResFijos', finMoneyUI(data.gastos_fijos));
      asignar('finResPeriodicos', finMoneyUI(data.gastos_periodicos));
      asignar('finResVariables', finMoneyUI(data.costos_variables));
      asignar('finResExtraordinarios', finMoneyUI(data.gastos_extraordinarios));
      asignar('finResComisiones', finMoneyUI(data.comisiones_medicos));
      asignar('finResResultado', finMoneyUI(data.utilidad_estimada));
      asignar('finResMargen', finNumero(data.margen_operativo_pct).toFixed(1) + '%');
      asignar('finResPuntoEquilibrio',
        data.punto_equilibrio_mensual === null || data.punto_equilibrio_mensual === undefined
          ? '—'
          : finMoneyUI(data.punto_equilibrio_mensual)
      );
      asignar('finResAtenciones', String(data.numero_atenciones || 0));
      asignar('finResTicket', finMoneyUI(data.ticket_promedio));

      const resultadoCard = finEl('finResResultadoCard');
      if(resultadoCard){
        resultadoCard.classList.remove('fin-result-ok','fin-result-bad','fin-result-neutral');
        resultadoCard.classList.add(
          finNumero(data.utilidad_estimada) > 0
            ? 'fin-result-ok'
            : (finNumero(data.utilidad_estimada) < 0 ? 'fin-result-bad' : 'fin-result-neutral')
        );
      }

      const texto = finNumero(data.utilidad_estimada) > 0
        ? 'Resultado positivo del período.'
        : (finNumero(data.utilidad_estimada) < 0
            ? 'El período presenta pérdida operativa estimada.'
            : 'El período está en punto neutro o todavía no tiene suficiente información.');

      finSetMsg('finResumenMsg',
        texto + ' El análisis usa ingresos realmente cobrados y costos configurados/registrados.',
        finNumero(data.utilidad_estimada) < 0 ? 'error' : 'ok'
      );

      return data;
    }catch(e){
      console.error('IASYN Finanzas - resumen mensual:', e);
      finSetMsg('finResumenMsg',
        'No se pudo calcular el resumen mensual: ' + finTexto(e.message || e),
        'error'
      );
      return null;
    }
  }

  function finPeriodicidadMensual(valor, periodicidad){
    const v = finNumero(valor);
    const p = finTexto(periodicidad).toLowerCase();

    if(!v) return 0;
    if(p === 'mensual') return v;
    if(p === 'semanal') return Math.round((v * 52 / 12) * 100) / 100;
    if(p === 'quincenal') return Math.round((v * 24 / 12) * 100) / 100;
    if(p === 'trimestral') return Math.round((v / 3) * 100) / 100;
    if(p === 'semestral') return Math.round((v / 6) * 100) / 100;
    if(p === 'anual') return Math.round((v / 12) * 100) / 100;

    return v;
  }

  function actualizarProrrateoGastoFinanzas(){
    const valor = finNumero(finEl('finGastoValor')?.value);
    const periodicidad = finTexto(finEl('finGastoPeriodicidad')?.value);
    const mensual = finPeriodicidadMensual(valor, periodicidad);

    const input = finEl('finGastoValorMensual');
    if(input) input.value = mensual ? mensual.toFixed(2) : '';
  }

  async function cargarGastosFijosFinanzas(forzar){
    if(iasynFinanzasGastosCargados && !forzar){
      renderGastosFijosFinanzas();
      return;
    }

    finValidarApi();
    finSetMsg('finanzasGastosMsg', 'Cargando gastos fijos...', 'info');

    try{
      const datos = await window.apiGet('listarGastosFijosFinancieros');
      iasynFinanzasGastos = Array.isArray(datos) ? datos : [];
      iasynFinanzasGastosCargados = true;
      renderGastosFijosFinanzas();
      finSetMsg('finanzasGastosMsg', 'Gastos fijos cargados.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - cargar gastos:', e);
      iasynFinanzasGastos = [];
      renderGastosFijosFinanzas();
      finSetMsg('finanzasGastosMsg',
        'No se pudieron cargar los gastos fijos: ' + finTexto(e.message || e),
        'error');
    }
  }

  function renderGastosFijosFinanzas(){
    const tbody = finEl('finGastosTbody');
    const mobile = finEl('finGastosMobile');

    if(!iasynFinanzasGastos.length){
      if(tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Sin gastos fijos registrados.</td></tr>';
      if(mobile) mobile.innerHTML = '<div class="text-muted text-center py-3">Sin gastos fijos registrados.</div>';
      return;
    }

    if(tbody){
      tbody.innerHTML = iasynFinanzasGastos.map(function(g){
        const activo = finEstadoActivo(g.estado);
        return '<tr>' +
          '<td>' + finEscape(g.nombre_gasto) + '</td>' +
          '<td>' + finEscape(g.categoria) + '</td>' +
          '<td>' + finEscape(g.valor) + '</td>' +
          '<td>' + finEscape(g.periodicidad) + '</td>' +
          '<td>' + finEscape(g.valor_mensual_prorrateado) + '</td>' +
          '<td>' + finEscape(normalizarFechaInputFinanzas(g.fecha_inicio)) + '</td>' +
          '<td>' + finEscape(normalizarFechaInputFinanzas(g.fecha_fin)) + '</td>' +
          '<td>' + finEscape(g.estado) + '</td>' +
          '<td class="text-end"><div class="fin-actions">' +
            '<button type="button" class="btn btn-sm btn-outline-primary" data-fin-editar-gasto="' + finEscape(g.id_gasto) + '" title="Editar"><i class="bi bi-pencil"></i></button>' +
            '<button type="button" class="btn btn-sm ' + (activo ? 'btn-outline-warning' : 'btn-outline-success') + '" data-fin-estado-gasto="' + finEscape(g.id_gasto) + '" data-fin-nuevo-estado="' + (activo ? 'Inactivo' : 'Activo') + '" title="' + (activo ? 'Desactivar' : 'Reactivar') + '"><i class="bi ' + (activo ? 'bi-pause-circle' : 'bi-play-circle') + '"></i></button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" data-fin-eliminar-gasto="' + finEscape(g.id_gasto) + '" title="Eliminar registro creado por error"><i class="bi bi-trash3"></i></button>' +
          '</div></td>' +
        '</tr>';
      }).join('');
    }

    if(mobile){
      mobile.innerHTML = iasynFinanzasGastos.map(function(g){
        const activo = finEstadoActivo(g.estado);
        return '<article class="fin-mobile-card">' +
          '<div class="fin-mobile-title"><strong>' + finEscape(g.nombre_gasto) + '</strong><span class="' + (activo ? 'fin-state-active' : 'fin-state-inactive') + '">' + finEscape(g.estado || 'Activo') + '</span></div>' +
          '<div class="fin-mobile-grid">' +
            '<span>Categoría</span><b>' + finEscape(g.categoria) + '</b>' +
            '<span>Valor</span><b>$' + finDinero(g.valor) + '</b>' +
            '<span>Periodicidad</span><b>' + finEscape(g.periodicidad) + '</b>' +
            '<span>Mensual</span><b>$' + finDinero(g.valor_mensual_prorrateado) + '</b>' +
            '<span>Desde</span><b>' + finEscape(normalizarFechaInputFinanzas(g.fecha_inicio) || '—') + '</b>' +
            '<span>Hasta</span><b>' + finEscape(normalizarFechaInputFinanzas(g.fecha_fin) || '—') + '</b>' +
          '</div>' +
          '<div class="fin-mobile-actions">' +
            '<button type="button" class="btn btn-outline-primary" data-fin-editar-gasto="' + finEscape(g.id_gasto) + '"><i class="bi bi-pencil me-1"></i> Editar</button>' +
            '<button type="button" class="btn ' + (activo ? 'btn-outline-warning' : 'btn-outline-success') + '" data-fin-estado-gasto="' + finEscape(g.id_gasto) + '" data-fin-nuevo-estado="' + (activo ? 'Inactivo' : 'Activo') + '"><i class="bi ' + (activo ? 'bi-pause-circle' : 'bi-play-circle') + ' me-1"></i> ' + (activo ? 'Desactivar' : 'Reactivar') + '</button>' +
            '<button type="button" class="btn btn-outline-danger" data-fin-eliminar-gasto="' + finEscape(g.id_gasto) + '"><i class="bi bi-trash3 me-1"></i> Eliminar</button>' +
          '</div>' +
        '</article>';
      }).join('');
    }
  }

  function finActualizarModoEdicionGastoFinanzas(gasto){
    const btn = finEl('btnGuardarGastoFinanzas');
    if(!btn) return;

    const editando = !!gasto;
    const etiqueta = editando
      ? '<i class="bi bi-save me-1"></i> Guardar cambios'
      : '<i class="bi bi-save me-1"></i> Guardar gasto';

    /* Mantiene compatible finSetBoton(): al finalizar Guardando...,
       restaura la etiqueta correcta según el modo actual. */
    btn.dataset.iasynTextoOriginal = etiqueta;
    if(!btn.disabled) btn.innerHTML = etiqueta;
  }

  function finMostrarFormularioGastoFinanzas(){
    const destino = finEl('finGastoNombre') || finEl('finGastoValor');
    if(!destino || typeof destino.scrollIntoView !== 'function') return;

    try{
      destino.scrollIntoView({ behavior:'smooth', block:'center' });
    }catch(_){
      destino.scrollIntoView();
    }
  }

  function limpiarFormularioGastoFinanzas(){
    [
      'finGastoNombre',
      'finGastoCategoria',
      'finGastoValor',
      'finGastoValorMensual',
      'finGastoFechaInicio',
      'finGastoFechaFin',
      'finGastoObservaciones'
    ].forEach(function(id){
      const el = finEl(id);
      if(el) el.value = '';
    });

    const otroNombre = finEl('finGastoNombreOtro');
    if(otroNombre) otroNombre.value = '';
    actualizarNombreOtroGastoFinanzas();

    const otraCategoria = finEl('finGastoCategoriaOtro');
    if(otraCategoria) otraCategoria.value = '';
    actualizarCategoriaOtroGastoFinanzas();

    const periodicidad = finEl('finGastoPeriodicidad');
    if(periodicidad) periodicidad.value = 'Mensual';

    const fechaInicio = finEl('finGastoFechaInicio');
    if(fechaInicio) fechaInicio.value = fechaHoyFinanzas();

    const id = finEl('finGastoId');
    if(id) id.value = '';

    finActualizarModoEdicionGastoFinanzas(null);
  }

  async function cambiarEstadoGastoFinanzas(idGasto, nuevoEstado){
    finValidarApi();

    const id = finTexto(idGasto);
    const estado = finTexto(nuevoEstado);

    if(!id || !estado) return;

    const gasto = iasynFinanzasGastos.find(function(g){
      return finTexto(g.id_gasto) === id;
    });

    if(!gasto){
      alert('No se encontró el gasto seleccionado.');
      return;
    }

    const accion = estado === 'Activo' ? 'reactivar' : 'desactivar';
    const confirmado = confirm(
      '¿Desea ' + accion + ' el gasto "' + finTexto(gasto.nombre_gasto) + '"?'
    );

    if(!confirmado) return;

    finSetMsg('finanzasGastosMsg', 'Actualizando estado del gasto...', 'info');

    try{
      const data = {
        nombre_gasto: gasto.nombre_gasto,
        categoria: gasto.categoria,
        valor: gasto.valor,
        periodicidad: gasto.periodicidad,
        valor_mensual_prorrateado: gasto.valor_mensual_prorrateado,
        fecha_inicio: gasto.fecha_inicio,
        fecha_fin: gasto.fecha_fin,
        estado: estado,
        observaciones: gasto.observaciones
      };

      const respuesta = await window.apiPost('editarGastoFijoFinanciero', {
        id_gasto: id,
        data: data
      });

      if(!respuesta || respuesta.success !== true){
        throw new Error((respuesta && respuesta.message) || 'No se pudo actualizar el estado del gasto.');
      }

      iasynFinanzasGastosCargados = false;
      await cargarGastosFijosFinanzas(true);

      finSetMsg(
        'finanzasGastosMsg',
        estado === 'Activo'
          ? 'Gasto reactivado correctamente.'
          : 'Gasto desactivado correctamente.',
        'ok'
      );
    }catch(e){
      console.error('IASYN Finanzas - cambiar estado gasto:', e);
      finSetMsg(
        'finanzasGastosMsg',
        'Error actualizando estado del gasto: ' + finTexto(e.message || e),
        'error'
      );
      alert('Error al actualizar el estado del gasto: ' + finTexto(e.message || e));
    }
  }

  async function eliminarGastoFinanzas(idGasto){
    finValidarApi();

    const id = finTexto(idGasto);
    const gasto = iasynFinanzasGastos.find(function(g){ return finTexto(g.id_gasto) === id; });
    if(!gasto){ alert('No se encontró el gasto seleccionado.'); return; }

    if(!confirm('Eliminar se usa únicamente para registros creados por error. ¿Desea continuar con "' + finTexto(gasto.nombre_gasto) + '"?')) return;

    const palabra = prompt('Confirmación final: escriba ELIMINAR para borrar este registro.');
    if(finTexto(palabra).toUpperCase() !== 'ELIMINAR'){
      finSetMsg('finanzasGastosMsg', 'Eliminación cancelada. No se modificó ningún registro.', 'info');
      return;
    }

    finSetMsg('finanzasGastosMsg', 'Verificando y eliminando gasto...', 'info');
    try{
      const respuesta = await window.apiPost('eliminarGastoFijoFinanciero', {
        id_gasto: id,
        confirmar_eliminacion: 'ELIMINAR'
      });
      if(!respuesta || respuesta.success !== true){
        throw new Error((respuesta && respuesta.message) || 'No se pudo eliminar el gasto.');
      }

      limpiarFormularioGastoFinanzas();
      iasynFinanzasGastosCargados = false;
      await cargarGastosFijosFinanzas(true);
      finSetMsg('finanzasGastosMsg', 'Gasto eliminado correctamente.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - eliminar gasto:', e);
      finSetMsg('finanzasGastosMsg', 'No se eliminó el gasto: ' + finTexto(e.message || e), 'error');
      alert('No se pudo eliminar: ' + finTexto(e.message || e));
    }
  }

  async function cargarGastosBaseIasynFinanzas(){
    finValidarApi();

    const fechaInicio = finTexto(finEl('finGastoFechaInicio')?.value) || fechaHoyFinanzas();
    const faltantes = IASYN_FIN_GASTOS_BASE.filter(function(base){
      const clave = finNormalizarClaveGasto(base.nombre_gasto);
      return !iasynFinanzasGastos.some(function(g){
        return finNormalizarClaveGasto(g.nombre_gasto) === clave;
      });
    });

    if(!faltantes.length){
      finSetMsg('finanzasGastosMsg', 'La plantilla base ya está cargada; no se crearon duplicados.', 'ok');
      return;
    }

    const confirmar = confirm(
      'Se cargarán ' + faltantes.length + ' gastos base faltantes con fecha de inicio ' + fechaInicio + '.\n\n' +
      'Los registros existentes NO serán sobrescritos. ¿Continuar?'
    );
    if(!confirmar) return;

    finSetBoton('btnCargarBaseGastosFinanzas', true, 'Cargando...');
    finSetMsg('finanzasGastosMsg', 'Cargando plantilla base sin sobrescribir registros...', 'info');

    let creados = 0;
    const errores = [];
    try{
      for(const base of faltantes){
        const mensual = finPeriodicidadMensual(base.valor, base.periodicidad);
        try{
          const r = await window.apiPost('guardarGastoFijoFinanciero', {
            nombre_gasto: base.nombre_gasto,
            categoria: base.categoria,
            valor: base.valor,
            periodicidad: base.periodicidad,
            valor_mensual_prorrateado: mensual,
            fecha_inicio: fechaInicio,
            fecha_fin: '',
            estado: 'Activo',
            observaciones: 'Carga inicial desde modelo financiero base IASYN'
          });
          if(!r || r.success !== true) throw new Error((r && r.message) || 'Error no especificado');
          creados++;
        }catch(e){
          errores.push(base.nombre_gasto + ': ' + finTexto(e.message || e));
        }
      }

      iasynFinanzasGastosCargados = false;
      await cargarGastosFijosFinanzas(true);
      finSetMsg(
        'finanzasGastosMsg',
        errores.length
          ? ('Carga parcial: ' + creados + ' creados; ' + errores.length + ' con error.')
          : ('Plantilla base cargada correctamente: ' + creados + ' gastos creados sin duplicados.'),
        errores.length ? 'error' : 'ok'
      );
      if(errores.length) console.warn('IASYN Finanzas - errores carga base:', errores);
    }finally{
      finSetBoton('btnCargarBaseGastosFinanzas', false);
    }
  }

  function cargarGastoEnFormularioFinanzas(idGasto){
    const id = finTexto(idGasto);
    const gasto = iasynFinanzasGastos.find(function(g){
      return finTexto(g.id_gasto) === id;
    });

    if(!gasto){
      finSetMsg('finanzasGastosMsg', 'No se encontró el gasto seleccionado para editar.', 'error');
      return;
    }

    finAsignarValor('finGastoId', gasto.id_gasto);
    asignarNombreGastoFinanzas(gasto.nombre_gasto);
    asignarCategoriaGastoFinanzas(gasto.categoria);
    finAsignarValor('finGastoValor', gasto.valor);
    finAsignarValor('finGastoPeriodicidad', gasto.periodicidad || 'Mensual');
    finAsignarValor('finGastoValorMensual', gasto.valor_mensual_prorrateado);
    finAsignarValor('finGastoFechaInicio', normalizarFechaInputFinanzas(gasto.fecha_inicio));
    finAsignarValor('finGastoFechaFin', normalizarFechaInputFinanzas(gasto.fecha_fin));
    finAsignarValor('finGastoObservaciones', gasto.observaciones);

    /* FASE 1A: hacer visible la edición sin alterar persistencia ni cálculos. */
    finActualizarModoEdicionGastoFinanzas(gasto);
    finSetMsg(
      'finanzasGastosMsg',
      'Editando gasto: ' + finTexto(gasto.nombre_gasto) + '. Revise los datos y pulse “Guardar cambios”.',
      'info'
    );
    finMostrarFormularioGastoFinanzas();
  }

  async function guardarGastoFijoFinanzas(){
    finValidarApi();

    const idGasto = finTexto(finEl('finGastoId')?.value);
    const nombre = obtenerNombreGastoFinanzas();
    const categoria = obtenerCategoriaGastoFinanzas();
    const valor = finNumero(finEl('finGastoValor')?.value);
    const periodicidad = finTexto(finEl('finGastoPeriodicidad')?.value || 'Mensual');
    const fechaInicio = finTexto(finEl('finGastoFechaInicio')?.value);
    const mensual = finPeriodicidadMensual(valor, periodicidad);

    if(!nombre){
      alert('Seleccione o escriba el nombre del gasto.');
      return;
    }
    if(!categoria){
      alert('Seleccione o escriba la categoría del gasto.');
      return;
    }
    if(!(valor > 0)){
      alert('El valor del gasto debe ser mayor que cero.');
      return;
    }
    if(!fechaInicio){
      alert('La fecha de inicio es obligatoria.');
      return;
    }

    if(!idGasto){
      const duplicadoActivo = finBuscarGastoActivoDuplicado(nombre, '');
      if(duplicadoActivo){
        cargarGastoEnFormularioFinanzas(duplicadoActivo.id_gasto);
        finSetMsg('finanzasGastosMsg', 'Ese gasto ya existe activo. Se cargó el registro existente para editarlo y evitar duplicados.', 'info');
        alert('Ya existe un gasto activo con ese nombre. Se cargó para edición en lugar de crear un duplicado.');
        return;
      }
    }

    const data = {
      nombre_gasto: nombre,
      categoria: categoria,
      valor: valor,
      periodicidad: periodicidad,
      valor_mensual_prorrateado: mensual,
      fecha_inicio: fechaInicio,
      fecha_fin: finTexto(finEl('finGastoFechaFin')?.value),
      estado: 'Activo',
      observaciones: finTexto(finEl('finGastoObservaciones')?.value)
    };

    finSetBoton('btnGuardarGastoFinanzas', true, 'Guardando...');
    finSetMsg('finanzasGastosMsg', 'Guardando gasto fijo...', 'info');

    try{
      let respuesta;

      if(idGasto){
        respuesta = await window.apiPost('editarGastoFijoFinanciero', {
          id_gasto: idGasto,
          data: data
        });
      }else{
        respuesta = await window.apiPost('guardarGastoFijoFinanciero', data);
      }

      if(!respuesta || respuesta.success !== true){
        throw new Error((respuesta && respuesta.message) || 'No se pudo guardar el gasto fijo.');
      }

      limpiarFormularioGastoFinanzas();
      iasynFinanzasGastosCargados = false;
      await cargarGastosFijosFinanzas(true);
      finSetMsg('finanzasGastosMsg', 'Gasto fijo guardado correctamente.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - guardar gasto:', e);
      finSetMsg('finanzasGastosMsg',
        'Error guardando gasto fijo: ' + finTexto(e.message || e),
        'error');
      alert('Error al guardar gasto fijo: ' + finTexto(e.message || e));
    }finally{
      finSetBoton('btnGuardarGastoFinanzas', false);
    }
  }


  /* ---------------- CONFIGURACIÓN ECONÓMICA DE MÉDICOS ----------------
     Usa únicamente:
     - listarMedicos() para lectura del catálogo existente.
     - configuracion_medicos_financiera para condiciones económicas.
     Nunca modifica la hoja medicos.
     ------------------------------------------------------------------- */

  function finNombreMedico(m){
    const nombre = finTexto(m?.nombre_completo || m?.nombre || m?.nombres);
    const apellido = finTexto(m?.apellido || m?.apellidos);
    return finTexto((nombre + ' ' + apellido).trim()) || finTexto(m?.id_medico);
  }

  async function cargarMedicosFinanzas(forzar){
    if(iasynFinanzasMedicosCargados && !forzar){
      renderConfiguracionMedicosFinanzas();
      return;
    }

    finValidarApi();
    finSetMsg('finanzasMedicosMsg', 'Cargando configuración económica de médicos...', 'info');

    try{
      const resultados = await Promise.all([
        window.apiGet('listarMedicos'),
        window.apiGet('listarConfiguracionMedicosFinanciera')
      ]);

      iasynFinanzasCatalogoMedicos = Array.isArray(resultados[0]) ? resultados[0] : [];
      iasynFinanzasConfigMedicos = Array.isArray(resultados[1]) ? resultados[1] : [];
      iasynFinanzasMedicosCargados = true;

      renderSelectMedicosFinanzas();
      renderConfiguracionMedicosFinanzas();
      finSetMsg('finanzasMedicosMsg', 'Configuración económica de médicos cargada.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - cargar médicos:', e);
      iasynFinanzasCatalogoMedicos = [];
      iasynFinanzasConfigMedicos = [];
      renderSelectMedicosFinanzas();
      renderConfiguracionMedicosFinanzas();
      finSetMsg(
        'finanzasMedicosMsg',
        'No se pudo cargar la configuración económica de médicos: ' + finTexto(e.message || e),
        'error'
      );
    }
  }

  function renderSelectMedicosFinanzas(){
    const select = finEl('finMedicoId');
    if(!select) return;

    const actual = finTexto(select.value);
    select.innerHTML = '<option value="">Seleccione médico...</option>' +
      iasynFinanzasCatalogoMedicos.map(function(m){
        const id = finTexto(m.id_medico);
        return '<option value="' + finEscape(id) + '">' +
          finEscape(finNombreMedico(m)) +
        '</option>';
      }).join('');

    if(actual) select.value = actual;
  }

  function finBuscarNombreMedico(idMedico){
    const id = finTexto(idMedico);
    const medico = iasynFinanzasCatalogoMedicos.find(function(m){
      return finTexto(m.id_medico) === id;
    });
    return medico ? finNombreMedico(medico) : id;
  }

  function renderConfiguracionMedicosFinanzas(){
    const tbody = finEl('finMedicosTbody');
    const mobile = finEl('finMedicosMobile');

    if(!iasynFinanzasConfigMedicos.length){
      if(tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Sin configuraciones económicas de médicos registradas.</td></tr>';
      if(mobile) mobile.innerHTML = '<div class="text-muted text-center py-3">Sin configuraciones económicas de médicos registradas.</div>';
      return;
    }

    if(tbody){
      tbody.innerHTML = iasynFinanzasConfigMedicos.map(function(c){
        return '<tr>' +
          '<td>' + finEscape(finBuscarNombreMedico(c.id_medico)) + '</td>' +
          '<td>' + finEscape(c.tipo_pago) + '</td>' +
          '<td>' + finEscape(c.porcentaje) + '</td>' +
          '<td>' + finEscape(c.valor_fijo) + '</td>' +
          '<td>' + finEscape(c.valor_hora) + '</td>' +
          '<td>' + finEscape(normalizarFechaInputFinanzas(c.vigencia_desde)) + '</td>' +
          '<td>' + finEscape(c.estado) + '</td>' +
          '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-primary" data-fin-editar-medico="' + finEscape(c.id_config_medico) + '"><i class="bi bi-pencil"></i></button></td>' +
        '</tr>';
      }).join('');
    }

    if(mobile){
      mobile.innerHTML = iasynFinanzasConfigMedicos.map(function(c){
        const activo = finEstadoActivo(c.estado);
        return '<article class="fin-mobile-card">' +
          '<div class="fin-mobile-title"><strong>' + finEscape(finBuscarNombreMedico(c.id_medico)) + '</strong><span class="' + (activo ? 'fin-state-active' : 'fin-state-inactive') + '">' + finEscape(c.estado || 'Activo') + '</span></div>' +
          '<div class="fin-mobile-grid">' +
            '<span>Tipo de pago</span><b>' + finEscape(c.tipo_pago || '—') + '</b>' +
            '<span>Porcentaje</span><b>' + finEscape(c.porcentaje || '—') + '</b>' +
            '<span>Valor fijo</span><b>' + finEscape(c.valor_fijo || '—') + '</b>' +
            '<span>Valor hora</span><b>' + finEscape(c.valor_hora || '—') + '</b>' +
            '<span>Vigencia desde</span><b>' + finEscape(normalizarFechaInputFinanzas(c.vigencia_desde) || '—') + '</b>' +
          '</div>' +
          '<div class="fin-mobile-actions"><button type="button" class="btn btn-outline-primary" data-fin-editar-medico="' + finEscape(c.id_config_medico) + '"><i class="bi bi-pencil me-1"></i> Editar</button></div>' +
        '</article>';
      }).join('');
    }
  }

  function actualizarCamposTipoPagoMedicoFinanzas(){
    const tipo = finTexto(finEl('finMedicoTipoPago')?.value).toLowerCase();

    const porcentaje = finEl('finMedicoPorcentaje');
    const fijo = finEl('finMedicoValorFijo');
    const hora = finEl('finMedicoValorHora');

    if(porcentaje) porcentaje.disabled = tipo !== 'porcentaje';
    if(fijo) fijo.disabled = tipo !== 'fijo';
    if(hora) hora.disabled = tipo !== 'hora' && tipo !== 'por hora' && tipo !== 'por_hora';
  }

  function limpiarFormularioMedicoFinanzas(){
    [
      'finMedicoConfigId',
      'finMedicoId',
      'finMedicoPorcentaje',
      'finMedicoValorFijo',
      'finMedicoValorHora',
      'finMedicoVigenciaDesde',
      'finMedicoVigenciaHasta',
      'finMedicoObservaciones'
    ].forEach(function(id){
      const el = finEl(id);
      if(el) el.value = '';
    });

    const tipo = finEl('finMedicoTipoPago');
    if(tipo) tipo.value = 'Porcentaje';

    const estado = finEl('finMedicoEstado');
    if(estado) estado.value = 'Activo';

    actualizarCamposTipoPagoMedicoFinanzas();
  }

  function cargarMedicoEnFormularioFinanzas(idConfig){
    const id = finTexto(idConfig);
    const config = iasynFinanzasConfigMedicos.find(function(c){
      return finTexto(c.id_config_medico) === id;
    });
    if(!config) return;

    finAsignarValor('finMedicoConfigId', config.id_config_medico);
    finAsignarValor('finMedicoId', config.id_medico);
    finAsignarValor('finMedicoTipoPago', config.tipo_pago || 'Porcentaje');
    finAsignarValor('finMedicoPorcentaje', config.porcentaje);
    finAsignarValor('finMedicoValorFijo', config.valor_fijo);
    finAsignarValor('finMedicoValorHora', config.valor_hora);
    finAsignarValor('finMedicoVigenciaDesde', config.vigencia_desde);
    finAsignarValor('finMedicoVigenciaHasta', config.vigencia_hasta);
    finAsignarValor('finMedicoEstado', config.estado || 'Activo');
    finAsignarValor('finMedicoObservaciones', config.observaciones);

    actualizarCamposTipoPagoMedicoFinanzas();
  }

  async function guardarConfiguracionMedicoFinanzas(){
    finValidarApi();

    const idConfig = finTexto(finEl('finMedicoConfigId')?.value);
    const idMedico = finTexto(finEl('finMedicoId')?.value);
    const tipoPago = finTexto(finEl('finMedicoTipoPago')?.value);
    const porcentaje = finNumeroOpcional(finEl('finMedicoPorcentaje')?.value);
    const valorFijo = finNumeroOpcional(finEl('finMedicoValorFijo')?.value);
    const valorHora = finNumeroOpcional(finEl('finMedicoValorHora')?.value);

    if(!idMedico){
      alert('Seleccione un médico.');
      return;
    }
    if(!tipoPago){
      alert('Seleccione el tipo de pago.');
      return;
    }
    if(porcentaje !== '' && (porcentaje < 0 || porcentaje > 100)){
      alert('El porcentaje del médico debe estar entre 0 y 100.');
      return;
    }
    if(valorFijo !== '' && valorFijo < 0){
      alert('El valor fijo no puede ser negativo.');
      return;
    }
    if(valorHora !== '' && valorHora < 0){
      alert('El valor por hora no puede ser negativo.');
      return;
    }

    const data = {
      id_medico: idMedico,
      tipo_pago: tipoPago,
      porcentaje: porcentaje,
      valor_fijo: valorFijo,
      valor_hora: valorHora,
      vigencia_desde: finTexto(finEl('finMedicoVigenciaDesde')?.value),
      vigencia_hasta: finTexto(finEl('finMedicoVigenciaHasta')?.value),
      estado: finTexto(finEl('finMedicoEstado')?.value || 'Activo'),
      observaciones: finTexto(finEl('finMedicoObservaciones')?.value)
    };

    finSetBoton('btnGuardarMedicoFinanzas', true, 'Guardando...');
    finSetMsg('finanzasMedicosMsg', 'Guardando configuración económica del médico...', 'info');

    try{
      let respuesta;

      if(idConfig){
        respuesta = await window.apiPost('editarConfiguracionMedicoFinanciera', {
          id_config_medico: idConfig,
          data: data
        });
      }else{
        respuesta = await window.apiPost('guardarConfiguracionMedicoFinanciera', data);
      }

      if(!respuesta || respuesta.success !== true){
        throw new Error(
          (respuesta && respuesta.message) ||
          'No se pudo guardar la configuración económica del médico.'
        );
      }

      limpiarFormularioMedicoFinanzas();
      iasynFinanzasMedicosCargados = false;
      await cargarMedicosFinanzas(true);
      finSetMsg('finanzasMedicosMsg', 'Configuración económica del médico guardada correctamente.', 'ok');
    }catch(e){
      console.error('IASYN Finanzas - guardar médico:', e);
      finSetMsg(
        'finanzasMedicosMsg',
        'Error guardando configuración económica del médico: ' + finTexto(e.message || e),
        'error'
      );
      alert('Error al guardar configuración del médico: ' + finTexto(e.message || e));
    }finally{
      finSetBoton('btnGuardarMedicoFinanzas', false);
    }
  }

  async function inicializarConfiguracionFinanzas(){
    /* Solo lectura. Nunca guarda por inicialización o navegación. */
    await Promise.allSettled([
      cargarConfiguracionFinanzas(false),
      cargarGastosFijosFinanzas(false),
      cargarMedicosFinanzas(false),
      cargarResumenMensualFinanzas(false)
    ]);
  }

  function enlazarEventosConfigFinanzas(){
    const btnConfig = finEl('btnGuardarConfigFinanzas');
    if(btnConfig && btnConfig.dataset.iasynFinInit !== '1'){
      btnConfig.dataset.iasynFinInit = '1';
      btnConfig.addEventListener('click', guardarConfiguracionFinanzas);
    }

    const selectorNombreGasto = finEl('finGastoNombre');
    if(selectorNombreGasto && selectorNombreGasto.dataset.iasynFinNombreInit !== '1'){
      selectorNombreGasto.dataset.iasynFinNombreInit = '1';
      selectorNombreGasto.addEventListener('change', function(){
        actualizarNombreOtroGastoFinanzas();
        aplicarSugerenciasGastoFinanzas();
      });
      actualizarNombreOtroGastoFinanzas();
    }

    const selectorCategoriaGasto = finEl('finGastoCategoria');
    if(selectorCategoriaGasto && selectorCategoriaGasto.dataset.iasynFinCategoriaInit !== '1'){
      selectorCategoriaGasto.dataset.iasynFinCategoriaInit = '1';
      selectorCategoriaGasto.addEventListener('change', actualizarCategoriaOtroGastoFinanzas);
      actualizarCategoriaOtroGastoFinanzas();
    }

    const btnGasto = finEl('btnGuardarGastoFinanzas');
    if(btnGasto && btnGasto.dataset.iasynFinInit !== '1'){
      btnGasto.dataset.iasynFinInit = '1';
      btnGasto.addEventListener('click', guardarGastoFijoFinanzas);
    }

    const btnLimpiar = finEl('btnLimpiarGastoFinanzas');
    if(btnLimpiar && btnLimpiar.dataset.iasynFinInit !== '1'){
      btnLimpiar.dataset.iasynFinInit = '1';
      btnLimpiar.addEventListener('click', limpiarFormularioGastoFinanzas);
    }

    ['finGastoValor', 'finGastoPeriodicidad'].forEach(function(id){
      const el = finEl(id);
      if(el && el.dataset.iasynFinInit !== '1'){
        el.dataset.iasynFinInit = '1';
        el.addEventListener('input', actualizarProrrateoGastoFinanzas);
        el.addEventListener('change', actualizarProrrateoGastoFinanzas);
      }
    });

    function enlazarAccionesGastos_(contenedor){
      if(!contenedor || contenedor.dataset.iasynFinAccionesInit === '1') return;
      contenedor.dataset.iasynFinAccionesInit = '1';
      contenedor.addEventListener('click', function(ev){
        const btnEditar = ev.target.closest('[data-fin-editar-gasto]');
        if(btnEditar){
          cargarGastoEnFormularioFinanzas(btnEditar.getAttribute('data-fin-editar-gasto'));
          return;
        }

        const btnEstado = ev.target.closest('[data-fin-estado-gasto]');
        if(btnEstado){
          cambiarEstadoGastoFinanzas(
            btnEstado.getAttribute('data-fin-estado-gasto'),
            btnEstado.getAttribute('data-fin-nuevo-estado')
          );
          return;
        }

        const btnEliminar = ev.target.closest('[data-fin-eliminar-gasto]');
        if(btnEliminar){
          eliminarGastoFinanzas(btnEliminar.getAttribute('data-fin-eliminar-gasto'));
        }
      });
    }

    enlazarAccionesGastos_(finEl('finGastosTbody'));
    enlazarAccionesGastos_(finEl('finGastosMobile'));

    const btnBase = finEl('btnCargarBaseGastosFinanzas');
    if(btnBase && btnBase.dataset.iasynFinInit !== '1'){
      btnBase.dataset.iasynFinInit = '1';
      btnBase.addEventListener('click', cargarGastosBaseIasynFinanzas);
    }

    const btnMedico = finEl('btnGuardarMedicoFinanzas');
    if(btnMedico && btnMedico.dataset.iasynFinInit !== '1'){
      btnMedico.dataset.iasynFinInit = '1';
      btnMedico.addEventListener('click', guardarConfiguracionMedicoFinanzas);
    }

    const btnLimpiarMedico = finEl('btnLimpiarMedicoFinanzas');
    if(btnLimpiarMedico && btnLimpiarMedico.dataset.iasynFinInit !== '1'){
      btnLimpiarMedico.dataset.iasynFinInit = '1';
      btnLimpiarMedico.addEventListener('click', limpiarFormularioMedicoFinanzas);
    }

    const tipoPagoMedico = finEl('finMedicoTipoPago');
    if(tipoPagoMedico && tipoPagoMedico.dataset.iasynFinInit !== '1'){
      tipoPagoMedico.dataset.iasynFinInit = '1';
      tipoPagoMedico.addEventListener('change', actualizarCamposTipoPagoMedicoFinanzas);
      actualizarCamposTipoPagoMedicoFinanzas();
    }

    function enlazarEdicionMedicos_(contenedor){
      if(!contenedor || contenedor.dataset.iasynFinMedInit === '1') return;
      contenedor.dataset.iasynFinMedInit = '1';
      contenedor.addEventListener('click', function(ev){
        const btn = ev.target.closest('[data-fin-editar-medico]');
        if(!btn) return;
        cargarMedicoEnFormularioFinanzas(btn.getAttribute('data-fin-editar-medico'));
      });
    }
    enlazarEdicionMedicos_(finEl('finMedicosTbody'));
    enlazarEdicionMedicos_(finEl('finMedicosMobile'));

    /* Resumen mensual recuperado: solo lectura / actualización manual. */
    const resumenPeriodo = finEl('finResumenPeriodo');
    if(resumenPeriodo && resumenPeriodo.dataset.iasynFinInit !== '1'){
      resumenPeriodo.dataset.iasynFinInit = '1';
      if(!resumenPeriodo.value) resumenPeriodo.value = finMesActual();
      resumenPeriodo.addEventListener('change', function(){ cargarResumenMensualFinanzas(true); });
    }

    const btnResumen = finEl('btnActualizarResumenFinanzas');
    if(btnResumen && btnResumen.dataset.iasynFinInit !== '1'){
      btnResumen.dataset.iasynFinInit = '1';
      btnResumen.addEventListener('click', function(){ cargarResumenMensualFinanzas(true); });
    }
  }

  function prepararConfigFinanzas(){
    enlazarEventosConfigFinanzas();

    const idGasto = finTexto(finEl('finGastoId')?.value);
    const fechaInicio = finEl('finGastoFechaInicio');
    if(!idGasto && fechaInicio && !finTexto(fechaInicio.value)){
      fechaInicio.value = fechaHoyFinanzas();
    }
  }

  /* API pública mínima para configuracion.html.
     No redefine funciones globales existentes. */
  const IASYN_CONFIG_FINANZAS_API = Object.freeze({
    inicializar: inicializarConfiguracionFinanzas,
    cargarConfiguracion: function(){ return cargarConfiguracionFinanzas(true); },
    cargarGastos: function(){ return cargarGastosFijosFinanzas(true); },
    cargarMedicos: function(){ return cargarMedicosFinanzas(true); },
    guardarConfiguracion: guardarConfiguracionFinanzas,
    guardarGasto: guardarGastoFijoFinanzas,
    limpiarGasto: limpiarFormularioGastoFinanzas,
    cambiarEstadoGasto: cambiarEstadoGastoFinanzas,
    eliminarGasto: eliminarGastoFinanzas,
    cargarGastosBase: cargarGastosBaseIasynFinanzas,
    cargarResumen: function(){ return cargarResumenMensualFinanzas(true); },
    guardarMedico: guardarConfiguracionMedicoFinanzas,
    limpiarMedico: limpiarFormularioMedicoFinanzas,
    preparar: prepararConfigFinanzas
  });

  window.IASYN_CONFIG_FINANZAS = IASYN_CONFIG_FINANZAS_API;
  /* Compatibilidad temporal con configuracion.html heredado. */
  window.auroConfigFinanzas = IASYN_CONFIG_FINANZAS_API;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', prepararConfigFinanzas, {once:true});
  }else{
    prepararConfigFinanzas();
  }

})();
