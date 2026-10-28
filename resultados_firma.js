/* ============================================================================
 * IASYN-2 | resultados_firma.js | V2.0.0-CANDIDATO-ANTIRREGRESIVO
 * Referencia funcional: Aurosanax Prueba, resultados_firma.js V1.0.0.
 * ADAPTADOR DE ÍNDICE DE DOCUMENTOS FIRMADOS — SOLO LECTURA.
 *
 * CONTRATO PÚBLICO CONSERVADO:
 * window.auroResultadosFirma.cargar({id_atencion,id_paciente})
 * window.auroResultadosFirma.obtenerSnapshot()
 * window.auroResultadosFirma.limpiar()
 * window.auroResultadosFirma.estado()
 *
 * RESTRICCIONES:
 * - No modifica resultados.js, documentos.js ni firma_electronica.js.
 * - No escribe en Google Sheets, Drive, firmas, PDFs ni auditorías.
 * - No genera enlaces, tokens, permisos ni autoriza descargas.
 * - Nunca expone drive_file_id, URL, base64, SHA256 o credenciales.
 * - Solo admite documentos FIRMADOS, PDF, de la atención y paciente activos.
 * - La autorización definitiva se valida en el backend, al emitir y descargar.
 * - El ID lógico FIRMA: requiere resolución segura en el backend IASYN-2.
 * - Cargar este módulo antes de resultados.js y después de firma_electronica.js.
 * - La integración visual con resultados.js se realiza en un paso separado.
 * ========================================================================== */
(function iasyn2ResultadosFirmaV2() {
  'use strict';

  const NOMBRE = 'IASYN2_RESULTADOS_FIRMA';
  const VERSION = '2.0.0-IASYN2-CANDIDATO';
  const TIPOS = Object.freeze([
    'RECETA', 'RECOMENDACION', 'CERTIFICADO', 'ORDEN_MEDICA'
  ]);
  const texto = v => String(v == null ? '' : v).trim();
  const estado = {
    atencion: '', paciente: '', documentos: [],
    listo: false, cargando: false, error: '', secuencia: 0
  };

  // No reemplazar módulos previos ni duplicar escuchas o consultas.
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
    estado.secuencia += 1; // Invalida respuestas asíncronas anteriores.
    estado.atencion = '';
    estado.paciente = '';
    estado.documentos = [];
    estado.listo = false;
    estado.cargando = false;
    estado.error = '';
  }

  // Acepta envolturas de respuesta existentes, sin inventar registros.
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

    // Fallar cerrado: la pertenencia no se deduce del filtro de consulta.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    if (tipo !== tipoConsultado || !TIPOS.includes(tipo)) return null;
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
      // El contrato de firma utiliza RECETA como filtro por defecto.
      // Por ello se consultan los cuatro tipos de manera explícita.
      const respuestas = await Promise.all(TIPOS.map(tipo =>
        api.consultarDocumentosFirmados({
          tipo_documento: tipo,
          id_atencion: c.atencion,
          id_paciente: c.paciente
        })
      ));

      // Evitar contaminar la atención actual con una respuesta antigua.
      if (secuencia !== estado.secuencia ||
          !contextoCoincide(c.atencion, c.paciente)) {
        if (secuencia === estado.secuencia) vaciar();
        return snapshot();
      }

      const unicos = new Map();
      for (let i = 0; i < TIPOS.length; i++) {
        const respuesta = respuestas[i];
        if (!respuesta || typeof respuesta !== 'object' ||
            respuesta.success === false || respuesta.ok === false) {
          throw new Error('El servidor no confirmó la consulta de ' + TIPOS[i] + '.');
        }
        for (const registro of respuestaDocumentos(respuesta)) {
          const seguro = documentoSeguro(registro, TIPOS[i], c.atencion, c.paciente);
          if (seguro && !unicos.has(seguro.id_firma_documento)) {
            unicos.set(seguro.id_firma_documento, seguro);
          }
        }
      }

      estado.documentos = [...unicos.values()];
      estado.listo = true;
      return snapshot();
    } catch (error) {
      if (secuencia === estado.secuencia) {
        estado.documentos = [];
        estado.listo = false;
        estado.error = texto(error?.message || error);
      }
      // Si la consulta antigua falló después de un cambio de contexto,
      // no transmitir el error antiguo al nuevo contexto.
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
