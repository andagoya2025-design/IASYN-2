/* ============================================================================
 * IASYN2 | resultados_firma.js | V4.0.0-SESION-IASYN2-Y-CARGA-ANTIRREGRESIVA
 * Base: IASYN-2/main/resultados_firma.js (consultado 2026-10-27).
 * PROPOSITO: recuperar TODOS los PDF firmados de la atencion/paciente activo.
 * Solo lectura: no altera motor de firmas, PDFs, Drive, Sheets ni tokens.
 * Preserva ventana.auroResultadosFirma: cargar/obtenerSnapshot/limpiar/estado.
 * NUNCA expone a Resultados drive_file_id, URL, hash, base64 ni credenciales.
 * Backend debe validar autorizacion real al emitir enlaces y al descargar.
 * ========================================================================== */
(function iasyn2ResultadosFirmaV4() {
  'use strict';

  const NOMBRE = 'IASYN2_RESULTADOS_FIRMA';
  const VERSION = '3.0.0-IASYN2-CONSULTA-UNIFICADA';
  const TIPOS = Object.freeze([
    'RECETA', 'RECOMENDACION', 'CERTIFICADO', 'ORDEN_MEDICA'
  ]);
  const texto = v => String(v == null ? '' : v).trim();
  const estado = {
    atencion: '', paciente: '', documentos: [],
    listo: false, cargando: false, error: '', secuencia: 0
  };

  if (window.auroResultadosFirma) {
    console.warn(NOMBRE + ': adaptador ya cargado; no se sobrescribe.');
    return;
  }

  function normalizarContexto(contexto) {
    const c = contexto && typeof contexto === 'object' ? contexto : {};
    return {
      atencion: texto(c.id_atencion || c.idAtencion),
      paciente: texto(c.id_paciente || c.idPaciente)
    };
  }

  function contextoActual() {
    try {
      const modulo = window.auroDocumentos;
      if (!modulo || typeof modulo.obtenerContexto !== 'function') return null;
      const c = modulo.obtenerContexto();
      if (!c || c.valido !== true || c.bloqueada) return null;
      const atencion = texto(c.id);
      const paciente = texto(c.idPaciente);
      return atencion && paciente ? {atencion, paciente} : null;
    } catch (_) {
      return null;
    }
  }

  function contextoCoincide(atencion, paciente) {
    const actual = contextoActual();
    return !!actual && actual.atencion === atencion && actual.paciente === paciente;
  }

  function vaciar() {
    estado.secuencia += 1;
    estado.atencion = '';
    estado.paciente = '';
    estado.documentos = [];
    estado.listo = false;
    estado.cargando = false;
    estado.error = '';
  }

  function respuestaDocumentos(respuesta) {
    const candidatos = [respuesta, respuesta?.data, respuesta?.resultado];
    const salida = [];
    const vistos = new Set();
    for (const candidato of candidatos) {
      if (!candidato || typeof candidato !== 'object') continue;
      for (const grupo of [candidato.documentos, candidato.registros, candidato.documento]) {
        const lista = Array.isArray(grupo) ? grupo :
          (grupo && typeof grupo === 'object' ? [grupo] : []);
        for (const registro of lista) {
          if (!registro || typeof registro !== 'object') continue;
          const id = texto(registro.id_firma_documento);
          if (!id || vistos.has(id)) continue;
          vistos.add(id);
          salida.push(registro);
        }
      }
    }
    return salida;
  }

  function documentoSeguro(registro, tipoConsultado, atencion, paciente) {
    const id = texto(registro.id_firma_documento);
    const tipo = texto(registro.tipo_documento).toUpperCase();
    const firma = texto(registro.estado_firma).toUpperCase();
    const idAtencion = texto(registro.id_atencion);
    const idPaciente = texto(registro.id_paciente);
    const mime = texto(registro.mime_type || registro.mime).toLowerCase();

    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    if ((tipoConsultado && tipo !== tipoConsultado) || !TIPOS.includes(tipo)) return null;
    if (firma !== 'FIRMADO') return null;
    if (idAtencion !== atencion || idPaciente !== paciente) return null;
    if (mime && mime !== 'application/pdf') return null;
    const nombre = texto(registro.nombre_archivo || registro.nombre_documento) ||
      (tipo.replace(/_/g, ' ') + ' firmado.pdf');
    const tamano = Number(registro.tamano_bytes);
    return Object.freeze({
      fuente: 'FIRMADOS',
      id_firma_documento: id,
      id_documento: 'FIRMA:' + id,
      id_atencion: atencion,
      id_paciente: paciente,
      tipo_documento: tipo,
      nombre_documento: nombre,
      mime_type: 'application/pdf',
      extension: 'pdf',
      tamano_bytes: Number.isFinite(tamano) && tamano >= 0 ? tamano : 0,
      estado_firma: 'FIRMADO'
    });
  }

  function snapshot() {
    if (!estado.listo || !contextoCoincide(estado.atencion, estado.paciente)) {
      return {listo: false, id_atencion: '', id_paciente: '', documentos: []};
    }
    return {
      listo: true,
      id_atencion: estado.atencion,
      id_paciente: estado.paciente,
      documentos: estado.documentos.map(d => ({...d}))
    };
  }

  /* Consulta directa SOLO LECTURA: el contrato del Apps Script IASYN2 permite
   * filtrar por id_atencion + id_paciente SIN imponer tipo_documento=RECETA.
   * Evita pasar por los wrappers de firma, que por compatibilidad histórica
   * predeterminan RECETA cuando el tipo está vacío.
   * Se limita a la URL ya configurada en el ERP y a la sesión vigente.
   */
  function urlServidor() {
    try {
      if (typeof API_URL !== 'undefined' && API_URL) return texto(API_URL);
    } catch (_) {}
    if (window.API_URL) return texto(window.API_URL);
    return texto(document.getElementById('appsScriptUrl')?.value);
  }

  /* IASYN2 conserva la sesion principal con prefijo iasyn_.
   * La clave aurosanax_ es exclusivamente retrocompatibilidad.
   * Nunca se envia un token que figure como expirado.
   * Compatible con el contrato de sesion del modulo resultados.js.
   */
  function tokenSesion() {
    const claves = [
      ['iasyn_seguridad_token', 'iasyn_seguridad_expira_en'],
      ['aurosanax_seguridad_token', 'aurosanax_seguridad_expira_en']
    ];
    try {
      for (const [claveToken, claveVence] of claves) {
        const token = texto(window.sessionStorage.getItem(claveToken));
        if (!token) continue;
        const vencimiento = texto(window.sessionStorage.getItem(claveVence));
        if (vencimiento) {
          const expira = Number(vencimiento);
          if (!Number.isFinite(expira) || expira <= 0 || Date.now() >= expira) {
            throw new Error('La sesion IASYN2 expiro. Inicie sesion nuevamente.');
          }
        }
        return token;
      }
      return '';
    } catch (error) {
      if (texto(error?.message).includes('expiro')) throw error;
      return '';
    }
  }

  async function consultarTodosPorAtencion(c) {
    const url = urlServidor();
    const token = tokenSesion();
    if (!url) throw new Error('No existe el endpoint configurado del ERP.');
    if (!token) throw new Error('La sesión del ERP no está disponible.');
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({
        accion: 'consultarDocumentosFirmados',
        data: {token, id_atencion: c.atencion, id_paciente: c.paciente}
      }),
      cache: 'no-store'
    });
    if (!respuesta.ok) {
      throw new Error('HTTP ' + respuesta.status + ' al consultar documentos firmados.');
    }
    const json = await respuesta.json();
    if (!json || json.success !== true) {
      throw new Error(texto(json?.message || 'El servidor rechazó la consulta unificada.'));
    }
    return json;
  }

  // Compatibilidad: si una instalación aún no admite el camino unificado,
  // conservar la lectura anterior por categorías y sus resultados parciales.
  async function consultarPorTipos(api, c) {
    const respuestas = await Promise.allSettled(TIPOS.map(tipo =>
      api.consultarDocumentosFirmados({
        tipo_documento: tipo,
        id_atencion: c.atencion,
        id_paciente: c.paciente
      })
    ));
    const documentos = [];
    const errores = [];
    let correctas = 0;
    for (let i = 0; i < TIPOS.length; i++) {
      const r = respuestas[i];
      if (r.status !== 'fulfilled') {
        errores.push(TIPOS[i] + ': ' + texto(r.reason?.message || r.reason));
        continue;
      }
      const respuesta = r.value;
      if (!respuesta || typeof respuesta !== 'object' ||
          respuesta.success === false || respuesta.ok === false) {
        errores.push(TIPOS[i] + ': respuesta inválida');
        continue;
      }
      correctas++;
      for (const doc of respuestaDocumentos(respuesta)) {
        const seguro = documentoSeguro(doc, TIPOS[i], c.atencion, c.paciente);
        if (seguro) documentos.push(seguro);
      }
    }
    if (!correctas) throw new Error('Fallaron todas las categorías: ' + errores.join(' | '));
    return {documentos, errores};
  }

  async function cargar(contexto) {
    const c = normalizarContexto(contexto);
    if (!c.atencion || !c.paciente || !contextoCoincide(c.atencion, c.paciente)) {
      vaciar();
      throw new Error('Seleccione una atención válida del mismo paciente en Documentos.');
    }
    const api = window.auroFirmaElectronica;
    if (!api || typeof api.consultarDocumentosFirmados !== 'function') {
      vaciar();
      throw new Error('La consulta persistente de firma electrónica no está disponible.');
    }

    const secuencia = ++estado.secuencia;
    estado.atencion = c.atencion;
    estado.paciente = c.paciente;
    estado.documentos = [];
    estado.listo = false;
    estado.cargando = true;
    estado.error = '';

    try {
      let documentos = [];
      const errores = [];
      try {
        const respuesta = await consultarTodosPorAtencion(c);
        for (const registro of respuestaDocumentos(respuesta)) {
          const seguro = documentoSeguro(registro, '', c.atencion, c.paciente);
          if (seguro) documentos.push(seguro);
        }
      } catch (errUnificada) {
        errores.push('Consulta por atención: ' + texto(errUnificada?.message || errUnificada));
        const respaldo = await consultarPorTipos(api, c);
        documentos = respaldo.documentos;
        errores.push(...respaldo.errores);
      }

      if (secuencia !== estado.secuencia || !contextoCoincide(c.atencion, c.paciente)) {
        if (secuencia === estado.secuencia) vaciar();
        return snapshot();
      }
      const unicos = new Map();
      for (const doc of documentos) {
        if (!unicos.has(doc.id_firma_documento)) unicos.set(doc.id_firma_documento, doc);
      }
      estado.documentos = [...unicos.values()];
      estado.error = errores.length ? 'Consulta parcial: ' + errores.join(' | ') : '';
      if (errores.length) console.warn(NOMBRE + ': ' + estado.error);
      estado.listo = true;
      return snapshot();
    } catch (error) {
      if (secuencia === estado.secuencia) {
        estado.documentos = [];
        estado.listo = false;
        estado.error = texto(error?.message || error);
      }
      if (secuencia !== estado.secuencia) return snapshot();
      throw error;
    } finally {
      if (secuencia === estado.secuencia) estado.cargando = false;
    }
  }

  function estadoPublico() {
    const s = snapshot();
    return Object.freeze({
      version: VERSION,
      listo: s.listo,
      cargando: estado.cargando && contextoCoincide(estado.atencion, estado.paciente),
      cantidad: s.documentos.length,
      error: estado.error,
      modo: 'SOLO_LECTURA',
      integracion_enlaces: 'REQUIERE_BACKEND_IASYN2_VALIDADO'
    });
  }

  window.auroResultadosFirma = Object.freeze({
    version: VERSION,
    tipos: TIPOS,
    cargar,
    obtenerSnapshot: snapshot,
    limpiar: vaciar,
    estado: estadoPublico
  });
})();
