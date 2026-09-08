/****************************************************************
 IASYN CLINICAL ERP
 Archivo: apoyoIA.js
 Versión: 1.2.2
 Responsabilidad: lógica funcional del módulo Apoyo Cognitivo con IA.
 Fecha/hora clínica: America/Guayaquil.

 ANTIRREGRESIÓN / COMPATIBILIDAD
 - IASYN usa claves nuevas como contrato principal del módulo.
 - Las claves AUROSANAX se conservan únicamente como compatibilidad temporal
   para leer contextos/borradores históricos y para no romper consumidores
   que todavía dependan de los nombres anteriores.
 - No modifica Google Sheets, Apps Script, pacientes, historias ni atenciones.
****************************************************************/
(() => {
  "use strict";

  const STORAGE_KEY_BASE = "iasyn_apoyoIA_borrador_v2";
  const STORAGE_KEY_BASE_LEGACY = "aurosanax_apoyoIA_borrador_v2";
  const LIMITE_SINTESIS = 2000;

  const SESSION_INPUT_KEYS = [
    "iasyn_apoyoIA_contexto",
    "aurosanax_apoyoIA_contexto",
    "apoyoIA_contexto",
    "diagnostico_apoyoIA",
    "iasyn_diagnostico_actual",
    "aurosanax_diagnostico_actual"
  ];

  const SESSION_OUTPUT_KEY = "iasyn_apoyoIA_resultado";
  const SESSION_OUTPUT_KEY_LEGACY = "aurosanax_apoyoIA_resultado";

  const MODULO_ABRIR_KEY = "iasyn_abrir_modulo";
  const MODULO_ABRIR_KEY_LEGACY = "aurosanax_abrir_modulo";
  const URL_DIAGNOSTICO_KEY = "iasyn_url_diagnostico";
  const URL_DIAGNOSTICO_KEY_LEGACY = "aurosanax_url_diagnostico";
  const URL_PLAN_KEY = "iasyn_url_plan";
  const URL_PLAN_KEY_LEGACY = "aurosanax_url_plan";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const refs = {};
  let promptBaseGenerado = "";
  let toastInstance = null;
  let modalDatosInstance = null;
  let autosaveTimer = null;
  let contextoEntradaActual = {};

  function obtenerIdAtencionActual() {
    return normalizarTexto(
      contextoEntradaActual.id_atencion ||
      contextoEntradaActual.identificacionRegistro?.id_atencion ||
      contextoEntradaActual.consulta?.id_atencion
    );
  }

  function obtenerClaveBorrador(base = STORAGE_KEY_BASE) {
    const idAtencion = obtenerIdAtencionActual();
    return idAtencion
      ? `${base}_${idAtencion}`
      : `${base}_sin_atencion`;
  }

  function obtenerClavesBorradorCompat() {
    return [
      obtenerClaveBorrador(STORAGE_KEY_BASE),
      obtenerClaveBorrador(STORAGE_KEY_BASE_LEGACY)
    ];
  }

  function leerBorradorCompat() {
    for (const clave of obtenerClavesBorradorCompat()) {
      const bruto = localStorage.getItem(clave);
      if (bruto) return { clave, bruto };
    }

    return { clave: "", bruto: "" };
  }

  function leerSesionCompat(claveNueva, claveLegacy) {
    return (
      sessionStorage.getItem(claveNueva) ||
      sessionStorage.getItem(claveLegacy) ||
      ""
    );
  }

  function escribirSesionCompat(claveNueva, claveLegacy, valor) {
    sessionStorage.setItem(claveNueva, valor);
    sessionStorage.setItem(claveLegacy, valor);
  }

  function normalizarTexto(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor).trim();
  }

  function escaparTextoPlano(valor) {
    return normalizarTexto(valor)
      .replace(/\u0000/g, "")
      .replace(/\r\n/g, "\n");
  }

  function ahoraEcuador() {
    const fecha = new Date();

    const fechaTexto = new Intl.DateTimeFormat("es-EC", {
      timeZone: "America/Guayaquil",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(fecha);

    const horaTexto = new Intl.DateTimeFormat("es-EC", {
      timeZone: "America/Guayaquil",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(fecha);

    const isoLocal = obtenerIsoEcuador(fecha);

    return {
      fecha: fechaTexto,
      hora: horaTexto,
      iso: isoLocal
    };
  }

  function obtenerIsoEcuador(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(fecha);

    const mapa = {};
    for (const parte of partes) {
      if (parte.type !== "literal") mapa[parte.type] = parte.value;
    }

    return `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}-05:00`;
  }

  function actualizarReloj() {
    const ahora = ahoraEcuador();

    if (refs.fechaActual) refs.fechaActual.textContent = ahora.fecha;
    if (refs.horaActual) refs.horaActual.textContent = ahora.hora.slice(0, 5);
  }

  function mostrarToast(mensaje, tipo = "info") {
    if (!refs.toastApp || !window.bootstrap) return;

    const icono = $(".toast-header > i", refs.toastApp);
    const mapaClase = {
      success: "text-success",
      danger: "text-danger",
      warning: "text-warning",
      info: "text-primary"
    };

    icono.className = `bi bi-heart-pulse-fill me-2 ${mapaClase[tipo] || mapaClase.info}`;
    refs.toastMensaje.textContent = mensaje;
    refs.toastHora.textContent = ahoraEcuador().hora.slice(0, 5);

    if (!toastInstance) {
      toastInstance = new bootstrap.Toast(refs.toastApp, {
        delay: 3400,
        autohide: true
      });
    }

    toastInstance.show();
  }

  function parsearJsonSeguro(texto) {
    try {
      return JSON.parse(texto);
    } catch (_error) {
      return null;
    }
  }

  function primerValor(objeto, rutas, defecto = "") {
    for (const ruta of rutas) {
      const partes = ruta.split(".");
      let valor = objeto;

      for (const parte of partes) {
        if (valor === null || valor === undefined || typeof valor !== "object") {
          valor = undefined;
          break;
        }
        valor = valor[parte];
      }

      const texto = normalizarTexto(valor);
      if (texto) return texto;
    }

    return defecto;
  }

  function leerContextoSesion() {
    for (const clave of SESSION_INPUT_KEYS) {
      const bruto = sessionStorage.getItem(clave);
      if (!bruto) continue;

      const json = parsearJsonSeguro(bruto);

      if (json && typeof json === "object") {
        return {
          clave,
          datos: json
        };
      }
    }

    return {
      clave: "",
      datos: {}
    };
  }

  function asignarTextoResumen(elemento, valor) {
    if (!elemento) return;

    const texto = normalizarTexto(valor);

    elemento.textContent = texto || "No disponible";
    elemento.classList.toggle("empty-value", !texto);
  }

  function hidratarDesdeContexto() {
    const contexto = leerContextoSesion();
    const datos = contexto.datos || {};
    contextoEntradaActual = datos;

    const paciente = datos.paciente || datos.patient || {};
    const profesional = datos.profesional || datos.medico || datos.doctor || {};
    const diagnostico = datos.diagnostico || datos.diagnosis || {};
    const consulta = datos.consulta || datos.atencion || {};

    asignarTextoResumen(
      refs.pacienteNombre,
      primerValor(
        { datos, paciente },
        [
          "paciente.nombreCompleto",
          "paciente.nombre",
          "paciente.nombres",
          "datos.nombrePaciente",
          "datos.pacienteNombre"
        ]
      )
    );

    asignarTextoResumen(
      refs.pacienteIdentificacion,
      primerValor(
        { datos, paciente },
        [
          "paciente.identificacion",
          "paciente.cedula",
          "paciente.documento",
          "datos.identificacionPaciente"
        ]
      )
    );

    asignarTextoResumen(
      refs.pacienteEdad,
      primerValor(
        { datos, paciente },
        [
          "paciente.edad",
          "datos.edadPaciente"
        ]
      )
    );

    asignarTextoResumen(
      refs.pacienteSexo,
      primerValor(
        { datos, paciente },
        [
          "paciente.sexo",
          "paciente.genero",
          "datos.sexoPaciente"
        ]
      )
    );

    asignarTextoResumen(
      refs.pacienteHistoria,
      primerValor(
        { datos, paciente },
        [
          "paciente.historiaClinica",
          "paciente.numeroHistoria",
          "datos.historiaClinica"
        ]
      )
    );

    asignarTextoResumen(
      refs.profesionalNombre,
      primerValor(
        { datos, profesional },
        [
          "profesional.nombreCompleto",
          "profesional.nombre",
          "datos.nombreProfesional"
        ]
      )
    );

    const especialidad = primerValor(
      { datos, profesional, consulta },
      [
        "profesional.especialidad",
        "consulta.especialidad",
        "datos.especialidad"
      ]
    );

    if (especialidad) {
      const opcionExiste = Array.from(refs.especialidad.options)
        .some((opcion) => opcion.value === especialidad);

      if (opcionExiste) {
        refs.especialidad.value = especialidad;
      } else {
        refs.especialidad.value = "Otra";
      }
    }

    refs.tipoConsulta.value = primerValor(
      { datos, consulta },
      [
        "consulta.tipo",
        "datos.tipoConsulta"
      ]
    );

    refs.motivoConsulta.value = primerValor(
      { datos, consulta },
      [
        "consulta.motivo",
        "datos.motivoConsulta",
        "datos.motivo"
      ]
    );

    refs.resumenClinico.value = primerValor(
      { datos, consulta },
      [
        "consulta.resumenClinico",
        "datos.resumenClinico",
        "datos.resumen",
        "datos.integracionClinica.resumen",
        "datos.integracionClinica",
        "consulta.analisisClinico"
      ]
    );

    refs.diagnosticoPrincipal.value = primerValor(
      { datos, diagnostico },
      [
        "diagnostico.principal",
        "diagnostico.descripcion",
        "datos.diagnosticoPrincipal",
        "datos.diagnostico"
      ]
    );

    refs.diagnosticosDiferenciales.value = primerValor(
      { datos, diagnostico },
      [
        "diagnostico.diferenciales",
        "datos.diagnosticosDiferenciales"
      ]
    );

    refs.codigoCie10.value = primerValor(
      { datos, diagnostico },
      [
        "diagnostico.cie10",
        "diagnostico.codigoCie10",
        "datos.cie10",
        "datos.codigoCie10"
      ]
    );

    refs.alertasClinicas.value = primerValor(
      { datos, paciente, consulta },
      [
        "paciente.alertas",
        "paciente.alergias",
        "consulta.alertas",
        "datos.alertasClinicas",
        "datos.alergias"
      ]
    );

    const hayDatos = Boolean(
      refs.motivoConsulta.value ||
      refs.resumenClinico.value ||
      refs.diagnosticoPrincipal.value ||
      contexto.clave
    );

    actualizarEstadoContexto(hayDatos);
    actualizarContadores();
  }

  function actualizarEstadoContexto(hayDatos) {
    refs.estadoContextoTexto.textContent = hayDatos ? "Datos cargados" : "Sin datos";
    refs.estadoContextoPunto.classList.toggle("is-ready", hayDatos);
  }

  function obtenerObjetivosSeleccionados() {
    return $$("#objetivosGrupo input[type='checkbox']:checked")
      .map((input) => input.value)
      .filter(Boolean);
  }

  function construirPrompt() {
    const objetivos = obtenerObjetivosSeleccionados();
    const objetivoExtra = normalizarTexto(refs.objetivoPersonalizado.value);

    if (objetivoExtra) objetivos.push(objetivoExtra);

    const lineas = [
      "ACTÚA COMO APOYO COGNITIVO CLÍNICO PARA UN PROFESIONAL DE LA SALUD.",
      "",
      "IMPORTANTE:",
      "- No reemplaces el juicio clínico ni emitas una decisión médica autónoma.",
      "- No inventes datos, resultados, antecedentes, dosis ni diagnósticos.",
      "- Señala de forma explícita la incertidumbre y la información faltante.",
      "- Prioriza la seguridad del paciente y las banderas rojas.",
      "- Distingue con claridad entre hechos del caso, inferencias y recomendaciones generales.",
      "- La respuesta será revisada y validada por un profesional de la salud.",
      "",
      "CONFIGURACIÓN DEL ANÁLISIS:",
      `- Especialidad: ${normalizarTexto(refs.especialidad.value) || "No especificada"}`,
      `- Tipo de consulta: ${normalizarTexto(refs.tipoConsulta.value) || "No especificado"}`,
      `- Profundidad: ${normalizarTexto(refs.nivelProfundidad.value)}`,
      `- Lenguaje: ${normalizarTexto(refs.tipoLenguaje.value)}`,
      `- Marco de referencia: ${normalizarTexto(refs.marcoReferencia.value)}`,
      "",
      "CONTEXTO CLÍNICO:",
      `- Motivo de consulta: ${normalizarTexto(refs.motivoConsulta.value) || "No informado"}`,
      `- Resumen clínico integrado: ${normalizarTexto(refs.resumenClinico.value) || "No informado"}`,
      `- Diagnóstico principal o impresión diagnóstica: ${normalizarTexto(refs.diagnosticoPrincipal.value) || "No informado"}`,
      `- Diagnósticos diferenciales considerados: ${normalizarTexto(refs.diagnosticosDiferenciales.value) || "No informados"}`,
      `- Código(s) CIE-10: ${normalizarTexto(refs.codigoCie10.value) || "No informado"}`,
      `- Alergias, alertas o contraindicaciones: ${normalizarTexto(refs.alertasClinicas.value) || "No informadas"}`,
      "",
      "OBJETIVOS SOLICITADOS:",
      objetivos.length
        ? objetivos.map((objetivo, indice) => `${indice + 1}. ${objetivo}`).join("\n")
        : "1. Realizar una integración clínica estructurada del caso.",
      "",
      "ESTRUCTURA DE RESPUESTA:",
      "1. Resumen clínico relevante.",
      "2. Análisis razonado del problema principal.",
      "3. Diagnósticos diferenciales priorizados y argumentos a favor/en contra.",
      "4. Información clínica faltante que podría cambiar la interpretación.",
      "5. Banderas rojas, riesgos o criterios de derivación urgente.",
      "6. Exámenes o evaluaciones complementarias a considerar, con su finalidad.",
      "7. Opciones generales de manejo o seguimiento que el profesional podría valorar.",
      "8. Limitaciones, incertidumbres y puntos que requieren verificación.",
      "9. Conclusión clínica breve y accionable para revisión médica."
    ];

    if (refs.incluirBanderasRojas.checked === false) {
      const indice = lineas.findIndex((linea) =>
        linea.startsWith("5. Banderas rojas")
      );
      if (indice >= 0) lineas.splice(indice, 1);
    }

    if (refs.incluirLimitaciones.checked === false) {
      const indice = lineas.findIndex((linea) =>
        linea.startsWith("8. Limitaciones")
      );
      if (indice >= 0) lineas.splice(indice, 1);
    }

    if (refs.incluirFuentes.checked) {
      lineas.push(
        "",
        "REFERENCIAS:",
        "Cuando sea posible, menciona guías clínicas, consensos o fuentes de alta calidad,",
        "sin fabricar citas y aclarando cuando no puedas verificar una referencia."
      );
    }

    return lineas.join("\n");
  }

  function generarPrompt() {
    const prompt = construirPrompt();
    refs.promptClinico.value = prompt;
    promptBaseGenerado = prompt;
    actualizarContadores();
    programarAutoguardado();
    mostrarToast("Prompt clínico generado correctamente.", "success");
  }

  async function copiarAlPortapapeles(texto, mensajeExito) {
    const contenido = normalizarTexto(texto);

    if (!contenido) {
      mostrarToast("No hay contenido para copiar.", "warning");
      return false;
    }

    try {
      await navigator.clipboard.writeText(contenido);
      mostrarToast(mensajeExito, "success");
      return true;
    } catch (_error) {
      const auxiliar = document.createElement("textarea");
      auxiliar.value = contenido;
      auxiliar.setAttribute("readonly", "");
      auxiliar.style.position = "fixed";
      auxiliar.style.opacity = "0";
      document.body.appendChild(auxiliar);
      auxiliar.select();

      try {
        document.execCommand("copy");
        mostrarToast(mensajeExito, "success");
        return true;
      } catch (_errorSecundario) {
        mostrarToast("No fue posible copiar automáticamente.", "danger");
        return false;
      } finally {
        auxiliar.remove();
      }
    }
  }

  async function pegarDesdePortapapeles() {
    if (!navigator.clipboard?.readText) {
      mostrarToast(
        "El navegador no permite pegar automáticamente. Use el pegado manual.",
        "warning"
      );
      refs.respuestaIA.focus();
      return;
    }

    try {
      const texto = await navigator.clipboard.readText();

      if (!normalizarTexto(texto)) {
        mostrarToast("El portapapeles está vacío.", "warning");
        return;
      }

      refs.respuestaIA.value = texto;
      actualizarContadores();
      programarAutoguardado();
      mostrarToast("Respuesta pegada correctamente.", "success");
    } catch (_error) {
      mostrarToast(
        "No se concedió permiso para leer el portapapeles. Pegue manualmente.",
        "warning"
      );
      refs.respuestaIA.focus();
    }
  }


  function construirPromptSintesis() {
    const respuesta = normalizarTexto(refs.respuestaIA?.value);

    if (!respuesta) {
      return "";
    }

    return [
      "ACTÚA COMO ASISTENTE DE REDACCIÓN CLÍNICA PARA UN PROFESIONAL DE LA SALUD.",
      "",
      "A partir de la respuesta clínica incluida al final, redacta una síntesis breve para revisión profesional.",
      "",
      "REGLAS OBLIGATORIAS:",
      "- Máximo 2.000 caracteres, incluyendo espacios.",
      "- Extensión aproximada máxima de media página.",
      "- No inventes datos, resultados, antecedentes, diagnósticos ni tratamientos.",
      "- No conviertas sugerencias en decisiones definitivas.",
      "- Conserva únicamente la información clínicamente relevante.",
      "- Diferencia los datos del caso de las inferencias.",
      "- Incluye incertidumbres, información faltante y banderas rojas solo cuando sean pertinentes.",
      "- No incluyas nombres, cédulas ni otros datos identificativos.",
      "- Redacta en lenguaje técnico, claro, continuo y listo para ser revisado y editado por el profesional.",
      "",
      "ESTRUCTURA SUGERIDA:",
      "1. Síntesis clínica del problema.",
      "2. Impresión o diagnósticos diferenciales prioritarios.",
      "3. Riesgos, datos faltantes o puntos por verificar.",
      "4. Consideraciones generales para la decisión profesional.",
      "",
      "RESPUESTA CLÍNICA A SINTETIZAR:",
      respuesta
    ].join("\n");
  }

  function crearPromptSintesis() {
    const prompt = construirPromptSintesis();

    if (!prompt) {
      mostrarToast(
        "Pegue primero la respuesta completa de la IA para crear el prompt de síntesis.",
        "warning"
      );
      refs.respuestaIA?.focus();
      return "";
    }

    mostrarToast("Prompt de síntesis preparado.", "success");
    return prompt;
  }

  async function copiarPromptSintesis() {
    const prompt = crearPromptSintesis();
    if (!prompt) return false;

    return copiarAlPortapapeles(
      prompt,
      "Prompt de síntesis copiado al portapapeles."
    );
  }

  async function pegarSintesisDesdePortapapeles() {
    try {
      const texto = await navigator.clipboard.readText();
      const limpio = escaparTextoPlano(texto);

      if (!limpio) {
        mostrarToast("El portapapeles está vacío.", "warning");
        return;
      }

      refs.sintesisValidada.value = limpio.slice(0, LIMITE_SINTESIS);
      actualizarContadores();
      programarAutoguardado();

      if (limpio.length > LIMITE_SINTESIS) {
        mostrarToast(
          "La síntesis fue recortada al límite de 2.000 caracteres.",
          "warning"
        );
      } else {
        mostrarToast("Síntesis pegada correctamente.", "success");
      }
    } catch (_error) {
      mostrarToast(
        "No se concedió permiso para leer el portapapeles. Pegue manualmente.",
        "warning"
      );
      refs.sintesisValidada?.focus();
    }
  }

  function limitarSintesis() {
    if (!refs.sintesisValidada) return;

    if (refs.sintesisValidada.value.length > LIMITE_SINTESIS) {
      refs.sintesisValidada.value =
        refs.sintesisValidada.value.slice(0, LIMITE_SINTESIS);

      mostrarToast(
        "La síntesis admite un máximo de 2.000 caracteres.",
        "warning"
      );
    }
  }

  function recopilarDatos() {
    const ahora = ahoraEcuador();

    return {
      version: "1.0.0",
      modulo: "Apoyo Cognitivo con IA",
      zonaHoraria: "America/Guayaquil",
      actualizadoEn: ahora.iso,
      identificacionRegistro: {
        id_atencion: normalizarTexto(
          contextoEntradaActual.id_atencion ||
          contextoEntradaActual.consulta?.id_atencion
        ),
        id_paciente: normalizarTexto(
          contextoEntradaActual.id_paciente ||
          contextoEntradaActual.paciente?.id_paciente
        ),
        numero_consulta: normalizarTexto(
          contextoEntradaActual.numero_consulta ||
          contextoEntradaActual.consulta?.numero
        ),
        estado: "borrador",
        guardadoBaseDatos: false
      },
      paciente: {
        nombre: refs.pacienteNombre.textContent === "No disponible"
          ? ""
          : refs.pacienteNombre.textContent,
        identificacion: refs.pacienteIdentificacion.textContent === "No disponible"
          ? ""
          : refs.pacienteIdentificacion.textContent,
        edad: refs.pacienteEdad.textContent === "No disponible"
          ? ""
          : refs.pacienteEdad.textContent,
        sexo: refs.pacienteSexo.textContent === "No disponible"
          ? ""
          : refs.pacienteSexo.textContent,
        historiaClinica: refs.pacienteHistoria.textContent === "No disponible"
          ? ""
          : refs.pacienteHistoria.textContent
      },
      profesional: {
        nombre: refs.profesionalNombre.textContent === "No disponible"
          ? ""
          : refs.profesionalNombre.textContent
      },
      consulta: {
        especialidad: refs.especialidad.value,
        tipo: refs.tipoConsulta.value,
        motivo: escaparTextoPlano(refs.motivoConsulta.value),
        resumenClinico: escaparTextoPlano(refs.resumenClinico.value),
        analisisClinico: escaparTextoPlano(
          contextoEntradaActual.consulta?.analisisClinico ||
          contextoEntradaActual.integracionClinica?.analisis
        ),
        conducta: escaparTextoPlano(
          contextoEntradaActual.consulta?.conducta ||
          contextoEntradaActual.integracionClinica?.conducta
        ),
        alertasClinicas: escaparTextoPlano(refs.alertasClinicas.value)
      },
      diagnostico: {
        principal: escaparTextoPlano(refs.diagnosticoPrincipal.value),
        diferenciales: escaparTextoPlano(refs.diagnosticosDiferenciales.value),
        cie10: escaparTextoPlano(refs.codigoCie10.value)
      },
      configuracion: {
        objetivos: obtenerObjetivosSeleccionados(),
        objetivoPersonalizado: escaparTextoPlano(refs.objetivoPersonalizado.value),
        profundidad: refs.nivelProfundidad.value,
        lenguaje: refs.tipoLenguaje.value,
        marcoReferencia: refs.marcoReferencia.value,
        incluirLimitaciones: refs.incluirLimitaciones.checked,
        incluirBanderasRojas: refs.incluirBanderasRojas.checked,
        incluirFuentes: refs.incluirFuentes.checked
      },
      contenido: {
        prompt: escaparTextoPlano(refs.promptClinico.value),
        respuestaIA: escaparTextoPlano(refs.respuestaIA.value),
        sintesisValidada: escaparTextoPlano(refs.sintesisValidada.value).slice(
          0,
          LIMITE_SINTESIS
        ),
        observacionesMedicas: escaparTextoPlano(refs.observacionesMedicas.value)
      },
      controlCalidad: {
        datosMinimosRevisados: refs.checkDatosMinimos.checked,
        privacidadRevisada: refs.checkPrivacidad.checked,
        respuestaSeraVerificada: refs.checkVerificacion.checked,
        responsabilidadProfesionalAceptada: refs.checkResponsabilidad.checked
      },
      auditoria: {
        zonaHoraria: "America/Guayaquil",
        creadoEn: normalizarTexto(
          contextoEntradaActual.creadoEn ||
          contextoEntradaActual.auditoria?.creadoEn
        ) || ahora.iso,
        actualizadoEn: ahora.iso,
        origen: normalizarTexto(contextoEntradaActual.origen) || "apoyoIA.html",
        versionEsquema: "1.0.0"
      }
    };
  }

  function aplicarDatos(datos) {
    if (!datos || typeof datos !== "object") return false;

    const consulta = datos.consulta || {};
    const diagnostico = datos.diagnostico || {};
    const configuracion = datos.configuracion || {};
    const contenido = datos.contenido || {};
    const control = datos.controlCalidad || {};

    if (consulta.especialidad !== undefined) {
      refs.especialidad.value = consulta.especialidad;
    }

    if (consulta.tipo !== undefined) {
      refs.tipoConsulta.value = consulta.tipo;
    }

    refs.motivoConsulta.value = consulta.motivo || "";
    refs.resumenClinico.value = consulta.resumenClinico || "";
    refs.alertasClinicas.value = consulta.alertasClinicas || "";

    refs.diagnosticoPrincipal.value = diagnostico.principal || "";
    refs.diagnosticosDiferenciales.value = diagnostico.diferenciales || "";
    refs.codigoCie10.value = diagnostico.cie10 || "";

    $$("#objetivosGrupo input[type='checkbox']").forEach((input) => {
      input.checked = Array.isArray(configuracion.objetivos)
        ? configuracion.objetivos.includes(input.value)
        : false;
    });

    refs.objetivoPersonalizado.value = configuracion.objetivoPersonalizado || "";
    refs.nivelProfundidad.value =
      configuracion.profundidad || "Clínico estructurado";
    refs.tipoLenguaje.value =
      configuracion.lenguaje || "Técnico para profesional de salud";
    refs.marcoReferencia.value =
      configuracion.marcoReferencia || "Guías clínicas y evidencia disponible";

    refs.incluirLimitaciones.checked =
      configuracion.incluirLimitaciones !== false;
    refs.incluirBanderasRojas.checked =
      configuracion.incluirBanderasRojas !== false;
    refs.incluirFuentes.checked =
      configuracion.incluirFuentes === true;

    refs.promptClinico.value = contenido.prompt || "";
    refs.respuestaIA.value = contenido.respuestaIA || "";
    refs.sintesisValidada.value = normalizarTexto(
      contenido.sintesisValidada
    ).slice(0, LIMITE_SINTESIS);
    refs.observacionesMedicas.value = contenido.observacionesMedicas || "";

    refs.checkDatosMinimos.checked = control.datosMinimosRevisados === true;
    refs.checkPrivacidad.checked = control.privacidadRevisada === true;
    refs.checkVerificacion.checked = control.respuestaSeraVerificada === true;
    refs.checkResponsabilidad.checked =
      control.responsabilidadProfesionalAceptada === true;

    promptBaseGenerado = refs.promptClinico.value;
    actualizarContadores();
    return true;
  }

  function guardarBorrador(mostrarConfirmacion = true) {
    try {
      const datos = recopilarDatos();
      localStorage.setItem(obtenerClaveBorrador(), JSON.stringify(datos));

      refs.estadoBorrador.innerHTML =
        '<i class="bi bi-cloud-check"></i> Guardado ' +
        ahoraEcuador().hora.slice(0, 5);

      if (mostrarConfirmacion) {
        mostrarToast(
          "Borrador temporal guardado para esta atención.",
          "success"
        );
      }

      return true;
    } catch (_error) {
      if (mostrarConfirmacion) {
        mostrarToast("No fue posible guardar el borrador local.", "danger");
      }
      return false;
    }
  }

  function aplicarBorradorSobreContexto(datos) {
    if (!datos || typeof datos !== "object") return false;

    const configuracion = datos.configuracion || {};
    const contenido = datos.contenido || {};
    const control = datos.controlCalidad || {};

    $$("#objetivosGrupo input[type='checkbox']").forEach((input) => {
      input.checked = Array.isArray(configuracion.objetivos)
        ? configuracion.objetivos.includes(input.value)
        : input.checked;
    });

    if (configuracion.objetivoPersonalizado !== undefined) {
      refs.objetivoPersonalizado.value =
        configuracion.objetivoPersonalizado || "";
    }

    if (configuracion.profundidad) {
      refs.nivelProfundidad.value = configuracion.profundidad;
    }

    if (configuracion.lenguaje) {
      refs.tipoLenguaje.value = configuracion.lenguaje;
    }

    if (configuracion.marcoReferencia) {
      refs.marcoReferencia.value = configuracion.marcoReferencia;
    }

    if (configuracion.incluirLimitaciones !== undefined) {
      refs.incluirLimitaciones.checked =
        configuracion.incluirLimitaciones !== false;
    }

    if (configuracion.incluirBanderasRojas !== undefined) {
      refs.incluirBanderasRojas.checked =
        configuracion.incluirBanderasRojas !== false;
    }

    if (configuracion.incluirFuentes !== undefined) {
      refs.incluirFuentes.checked =
        configuracion.incluirFuentes === true;
    }

    refs.promptClinico.value = contenido.prompt || "";
    refs.respuestaIA.value = contenido.respuestaIA || "";
    refs.sintesisValidada.value = normalizarTexto(
      contenido.sintesisValidada
    ).slice(0, LIMITE_SINTESIS);
    refs.observacionesMedicas.value =
      contenido.observacionesMedicas || "";

    refs.checkDatosMinimos.checked =
      control.datosMinimosRevisados === true;
    refs.checkPrivacidad.checked =
      control.privacidadRevisada === true;
    refs.checkVerificacion.checked =
      control.respuestaSeraVerificada === true;
    refs.checkResponsabilidad.checked =
      control.responsabilidadProfesionalAceptada === true;

    promptBaseGenerado = refs.promptClinico.value;
    actualizarContadores();
    return true;
  }

  function cargarBorrador(mostrarConfirmacion = true) {
    const borrador = leerBorradorCompat();
    const bruto = borrador.bruto;

    if (!bruto) {
      if (mostrarConfirmacion) {
        mostrarToast(
          "No existe un borrador para esta atención.",
          "warning"
        );
      }
      return false;
    }

    const datos = parsearJsonSeguro(bruto);

    if (!datos) {
      if (mostrarConfirmacion) {
        mostrarToast("El borrador guardado no es válido.", "danger");
      }
      return false;
    }

    const idBorrador = normalizarTexto(
      datos.identificacionRegistro?.id_atencion
    );
    const idActual = obtenerIdAtencionActual();

    if (idActual && idBorrador && idActual !== idBorrador) {
      if (mostrarConfirmacion) {
        mostrarToast(
          "El borrador pertenece a otra atención y no fue cargado.",
          "warning"
        );
      }
      return false;
    }

    aplicarBorradorSobreContexto(datos);

    if (mostrarConfirmacion) {
      mostrarToast(
        "Borrador de esta atención cargado correctamente.",
        "success"
      );
    }

    return true;
  }

  function eliminarBorrador() {
    const confirmar = window.confirm(
      "¿Desea eliminar el borrador temporal de esta atención?"
    );

    if (!confirmar) return;

    obtenerClavesBorradorCompat().forEach((clave) => {
      localStorage.removeItem(clave);
    });
    refs.estadoBorrador.innerHTML =
      '<i class="bi bi-cloud-slash"></i> Sin borrador';
    mostrarToast("Borrador de esta atención eliminado.", "success");
  }

  function programarAutoguardado() {
    clearTimeout(autosaveTimer);

    refs.estadoBorrador.innerHTML =
      '<i class="bi bi-cloud-arrow-up"></i> Cambios pendientes';

    autosaveTimer = setTimeout(() => {
      guardarBorrador(false);
    }, 900);
  }

  function actualizarContador(elemento, contador) {
    if (!elemento || !contador) return;
    contador.textContent = String(elemento.value.length);
  }

  function actualizarContadores() {
    actualizarContador(refs.motivoConsulta, refs.contadorMotivo);
    actualizarContador(refs.resumenClinico, refs.contadorResumen);
    actualizarContador(refs.promptClinico, refs.contadorPrompt);
    actualizarContador(refs.respuestaIA, refs.contadorRespuesta);
    actualizarContador(refs.sintesisValidada, refs.contadorSintesis);
  }

  function exportarJson() {
    const datos = recopilarDatos();
    const contenido = JSON.stringify(datos, null, 2);
    const blob = new Blob([contenido], {
      type: "application/json;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    const fechaArchivo = ahoraEcuador().iso
      .replace(/[:]/g, "-")
      .replace("T", "_")
      .replace("-05-00", "");

    enlace.href = url;
    enlace.download = `IASYN_ApoyoIA_${fechaArchivo}.json`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);

    mostrarToast("Archivo JSON exportado.", "success");
  }

  function mostrarVistaJson() {
    const datos = recopilarDatos();
    refs.vistaJson.textContent = JSON.stringify(datos, null, 2);

    if (!modalDatosInstance) {
      modalDatosInstance = new bootstrap.Modal(refs.modalDatos);
    }

    modalDatosInstance.show();
  }

  function guardarEnSesion() {
    try {
      const ahora = ahoraEcuador();
      const datos = {
        version: "2.0.0",
        modulo: "Apoyo Cognitivo con IA",
        id_atencion: obtenerIdAtencionActual(),
        id_paciente: normalizarTexto(
          contextoEntradaActual.id_paciente ||
          contextoEntradaActual.paciente?.id_paciente
        ),
        sintesis_validada: escaparTextoPlano(
          refs.sintesisValidada.value
        ).slice(0, LIMITE_SINTESIS),
        criterio_profesional: escaparTextoPlano(
          refs.observacionesMedicas.value
        ),
        validado_por_profesional:
          refs.checkVerificacion.checked === true &&
          refs.checkResponsabilidad.checked === true,
        temporal: true,
        guardadoBaseDatos: false,
        actualizadoEn: ahora.iso,
        origen: "apoyoIA.html"
      };

      const payloadSesion = JSON.stringify(datos);
      escribirSesionCompat(
        SESSION_OUTPUT_KEY,
        SESSION_OUTPUT_KEY_LEGACY,
        payloadSesion
      );
      mostrarToast(
        "Síntesis y criterio profesional guardados temporalmente en sesión.",
        "success"
      );
      return true;
    } catch (_error) {
      mostrarToast("No fue posible guardar los datos en sesión.", "danger");
      return false;
    }
  }

  function volverADiagnostico() {
    guardarEnSesion();

    /*
     IASYN FIX QUIRÚRGICO:
     Se conserva la clave legacy únicamente como puente de compatibilidad
     mientras el ERP principal completa la migración de contratos de sesión.
     Historia clínica > Diagnóstico conserva la atención activa.
    */
    escribirSesionCompat(
      MODULO_ABRIR_KEY,
      MODULO_ABRIR_KEY_LEGACY,
      "diagnostico"
    );

    const destino =
      document.body.dataset.diagnosticoUrl ||
      leerSesionCompat(URL_DIAGNOSTICO_KEY, URL_DIAGNOSTICO_KEY_LEGACY) ||
      "index.html";

    window.location.href = destino;
  }

  function continuarAlPlan() {
    const sintesis = normalizarTexto(refs.sintesisValidada.value);

    if (!sintesis) {
      const continuarSinSintesis = window.confirm(
        "La síntesis clínica está vacía. ¿Desea continuar al Plan sin transferir contenido de apoyo?"
      );

      if (!continuarSinSintesis) {
        refs.sintesisValidada.focus();
        return;
      }
    }

    guardarEnSesion();

    const destino =
      document.body.dataset.planUrl ||
      leerSesionCompat(URL_PLAN_KEY, URL_PLAN_KEY_LEGACY) ||
      "index.html";

    escribirSesionCompat(
      MODULO_ABRIR_KEY,
      MODULO_ABRIR_KEY_LEGACY,
      "plan"
    );
    window.location.href = destino;
  }

  function limpiarFormularioCompleto() {
    const confirmar = window.confirm(
      "¿Desea limpiar el contenido generado y la respuesta de IA?"
    );

    if (!confirmar) return;

    refs.promptClinico.value = "";
    refs.respuestaIA.value = "";
    refs.sintesisValidada.value = "";
    refs.observacionesMedicas.value = "";
    promptBaseGenerado = "";
    actualizarContadores();
    programarAutoguardado();
    mostrarToast("Contenido de IA limpiado.", "success");
  }

  function restaurarPrompt() {
    if (promptBaseGenerado) {
      refs.promptClinico.value = promptBaseGenerado;
      actualizarContadores();
      programarAutoguardado();
      mostrarToast("Prompt restaurado a la última versión generada.", "success");
      return;
    }

    generarPrompt();
  }

  function registrarEventos() {
    refs.btnGenerarPrompt.addEventListener("click", generarPrompt);

    refs.btnCopiarPrompt.addEventListener("click", () => {
      copiarAlPortapapeles(
        refs.promptClinico.value,
        "Prompt copiado al portapapeles."
      );
    });

    refs.btnRestaurarPrompt.addEventListener("click", restaurarPrompt);

    refs.btnLimpiarPrompt.addEventListener("click", () => {
      const confirmar = window.confirm("¿Desea limpiar el prompt actual?");
      if (!confirmar) return;

      refs.promptClinico.value = "";
      actualizarContadores();
      programarAutoguardado();
      mostrarToast("Prompt limpiado.", "success");
    });

    refs.btnPegarRespuesta.addEventListener("click", pegarDesdePortapapeles);

    refs.btnCopiarRespuesta.addEventListener("click", () => {
      copiarAlPortapapeles(
        refs.respuestaIA.value,
        "Respuesta copiada al portapapeles."
      );
    });

    refs.btnLimpiarRespuesta.addEventListener("click", () => {
      const confirmar = window.confirm(
        "¿Desea limpiar la respuesta y las observaciones médicas?"
      );
      if (!confirmar) return;

      refs.respuestaIA.value = "";
      refs.observacionesMedicas.value = "";
      actualizarContadores();
      programarAutoguardado();
      mostrarToast("Respuesta limpiada.", "success");
    });

    refs.btnCrearPromptSintesis.addEventListener(
      "click",
      copiarPromptSintesis
    );

    refs.btnCopiarPromptSintesis.addEventListener(
      "click",
      copiarPromptSintesis
    );

    refs.btnPegarSintesis.addEventListener(
      "click",
      pegarSintesisDesdePortapapeles
    );

    refs.btnLimpiarSintesis.addEventListener("click", () => {
      const confirmar = window.confirm(
        "¿Desea limpiar la síntesis clínica validada?"
      );
      if (!confirmar) return;

      refs.sintesisValidada.value = "";
      actualizarContadores();
      programarAutoguardado();
      mostrarToast("Síntesis limpiada.", "success");
    });

    refs.btnGuardarBorrador.addEventListener("click", () => guardarBorrador(true));
    refs.btnCargarBorrador.addEventListener("click", () => cargarBorrador(true));
    refs.btnEliminarBorrador.addEventListener("click", eliminarBorrador);
    refs.btnExportarJson.addEventListener("click", exportarJson);
    refs.btnVistaDatos.addEventListener("click", mostrarVistaJson);

    refs.btnCopiarJson.addEventListener("click", () => {
      copiarAlPortapapeles(
        refs.vistaJson.textContent,
        "JSON copiado al portapapeles."
      );
    });

    refs.btnVolverSuperior.addEventListener("click", volverADiagnostico);
    refs.btnVolverInferior.addEventListener("click", volverADiagnostico);
    refs.btnGuardarSesion.addEventListener("click", guardarEnSesion);
    refs.btnContinuarPlan.addEventListener("click", continuarAlPlan);
    refs.btnImprimir.addEventListener("click", () => window.print());

    [refs.abrirChatGPT, refs.abrirGemini, refs.abrirCopilot].forEach((enlace) => {
      enlace.addEventListener("click", async () => {
        if (normalizarTexto(refs.promptClinico.value)) {
          await copiarAlPortapapeles(
            refs.promptClinico.value,
            "Prompt copiado. La plataforma se abrirá en una pestaña nueva."
          );
        }
      });
    });

    const elementosConAutoguardado = [
      refs.especialidad,
      refs.tipoConsulta,
      refs.motivoConsulta,
      refs.resumenClinico,
      refs.diagnosticoPrincipal,
      refs.diagnosticosDiferenciales,
      refs.codigoCie10,
      refs.alertasClinicas,
      refs.objetivoPersonalizado,
      refs.nivelProfundidad,
      refs.tipoLenguaje,
      refs.marcoReferencia,
      refs.incluirLimitaciones,
      refs.incluirBanderasRojas,
      refs.incluirFuentes,
      refs.promptClinico,
      refs.respuestaIA,
      refs.sintesisValidada,
      refs.observacionesMedicas,
      refs.checkDatosMinimos,
      refs.checkPrivacidad,
      refs.checkVerificacion,
      refs.checkResponsabilidad,
      ...$$("#objetivosGrupo input[type='checkbox']")
    ];

    elementosConAutoguardado.forEach((elemento) => {
      if (!elemento) return;

      elemento.addEventListener("input", () => {
        if (elemento === refs.sintesisValidada) {
          limitarSintesis();
        }
        actualizarContadores();
        programarAutoguardado();
      });

      elemento.addEventListener("change", programarAutoguardado);
    });

    window.addEventListener("beforeunload", () => {
      guardarBorrador(false);
    });

    window.addEventListener("keydown", (evento) => {
      const esGuardar =
        (evento.ctrlKey || evento.metaKey) &&
        evento.key.toLowerCase() === "s";

      if (esGuardar) {
        evento.preventDefault();
        guardarBorrador(true);
      }

      const esGenerar =
        (evento.ctrlKey || evento.metaKey) &&
        evento.key === "Enter";

      if (esGenerar) {
        evento.preventDefault();
        generarPrompt();
      }
    });
  }

  function capturarReferencias() {
    const ids = [
      "fechaActual",
      "horaActual",
      "btnVistaDatos",
      "btnVolverSuperior",
      "btnVolverInferior",
      "btnContinuarPlan",
      "btnGuardarSesion",
      "btnImprimir",
      "estadoContexto",
      "estadoContextoPunto",
      "estadoContextoTexto",
      "pacienteNombre",
      "pacienteIdentificacion",
      "pacienteEdad",
      "pacienteSexo",
      "pacienteHistoria",
      "profesionalNombre",
      "especialidad",
      "tipoConsulta",
      "motivoConsulta",
      "resumenClinico",
      "diagnosticoPrincipal",
      "diagnosticosDiferenciales",
      "codigoCie10",
      "alertasClinicas",
      "objetivoPersonalizado",
      "nivelProfundidad",
      "tipoLenguaje",
      "marcoReferencia",
      "incluirLimitaciones",
      "incluirBanderasRojas",
      "incluirFuentes",
      "promptClinico",
      "respuestaIA",
      "sintesisValidada",
      "observacionesMedicas",
      "checkDatosMinimos",
      "checkPrivacidad",
      "checkVerificacion",
      "checkResponsabilidad",
      "btnGenerarPrompt",
      "btnCopiarPrompt",
      "btnRestaurarPrompt",
      "btnLimpiarPrompt",
      "btnPegarRespuesta",
      "btnCopiarRespuesta",
      "btnLimpiarRespuesta",
      "btnCrearPromptSintesis",
      "btnCopiarPromptSintesis",
      "btnPegarSintesis",
      "btnLimpiarSintesis",
      "btnGuardarBorrador",
      "btnCargarBorrador",
      "btnExportarJson",
      "btnEliminarBorrador",
      "abrirChatGPT",
      "abrirGemini",
      "abrirCopilot",
      "estadoBorrador",
      "contadorMotivo",
      "contadorResumen",
      "contadorPrompt",
      "contadorRespuesta",
      "contadorSintesis",
      "modalDatos",
      "vistaJson",
      "btnCopiarJson",
      "toastApp",
      "toastMensaje",
      "toastHora"
    ];

    ids.forEach((id) => {
      refs[id] = document.getElementById(id);
    });
  }

  function inicializarRespaldo() {
    capturarReferencias();
    actualizarReloj();
    setInterval(actualizarReloj, 30000);

    hidratarDesdeContexto();
    cargarBorrador(false);
    registrarEventos();
    actualizarContadores();

    if (!normalizarTexto(refs.promptClinico.value)) {
      refs.estadoBorrador.innerHTML =
        '<i class="bi bi-cloud-check"></i> Borrador local';
    }
  }

  let moduloInicializado = false;

  function init() {
    if (moduloInicializado) return;
    moduloInicializado = true;
    inicializarRespaldo();
  }

  const IASYN_APOYOIA_API = {
    version: "1.2.2",
    init,
    recopilarDatos,
    aplicarDatos,
    generarPrompt,
    guardarEnSesion,
    guardarBorrador,
    cargarBorrador,
    limpiarFormularioCompleto
  };

  // Contrato canónico IASYN.
  window.IASYN_APOYOIA = IASYN_APOYOIA_API;

  // Aliases temporales: conservar hasta verificar que no tengan consumidores.
  window.AurosanaxApoyoIA = IASYN_APOYOIA_API;
  window.AurosanaxApoyoIABridge = IASYN_APOYOIA_API;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
