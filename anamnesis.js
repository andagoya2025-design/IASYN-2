/*
IASYN ERP - MOTOR DINÁMICO DE ANAMNESIS SINDRÓMICA
Archivo: anamnesis.js
Versión: 3.6.3

Función:
- Consultar las plantillas activas desde plantillas_anamnesis.
- Detectar la plantilla por palabras_clave y especialidad.
- Construir el formulario desde preguntas_json.
- Generar la enfermedad actual desde estructura_narrativa_json.
- No contiene enfermedades ni síndromes programados de forma fija.
- No modifica el guardado general ni otros módulos del ERP.
*/
(function () {
  'use strict';

  const VERSION = '3.6.18-R2';
  const state = {
    inicializado: false,
    cargando: false,
    cargado: false,
    plantillas: [],
    plantillaActiva: null,
    preguntas: [],
    respuestas: {},
    narrativa: '',
    idAtencionActual: '',
    idPacienteActual: '',
    idHistoriaActual: '',
    cacheAtenciones: {},
    restaurandoAtencion: false,
    guardadoPendiente: null,
    contextoAtencion: {},
    guardadosRemotosEnCurso: {},
    guardadosRemotosPendientes: {},
    /*
      IASYN 3.6.15 - protección quirúrgica contra guardados fantasma.
      Solo una edición clínica real marca una atención como pendiente.
      Abrir, cargar, visualizar o sincronizar la cabecera NO debe marcarla.
    */
    cambiosUsuarioPorAtencion: {},

    /*
      IASYN 3.6.16 - CONTEXTO TRANSACCIONAL ESTRICTO
      --------------------------------------------------
      contextoEpoch:
        cambia en cada transición real de atención y vuelve obsoletos
        temporizadores, cargas, confirmaciones y reintentos anteriores.

      contextoInvalidado:
        bloquea cualquier guardado remoto durante el pequeño intervalo
        en que una atención deja de ser válida y la nueva aún se establece.

      solicitudCarga:
        impide que una lectura asíncrona antigua vuelva a pintar datos
        después de que el usuario ya cambió de consulta.
    */
    contextoEpoch: 0,
    contextoInvalidado: false,
    solicitudCarga: 0,

    /*
      3.6.17:
      Firma clínica confirmada por atención. El autosave no vuelve a enviar
      un registro si un evento programático no cambió realmente su contenido.
    */
    firmaPersistidaPorAtencion: {},

    /*
      IASYN 3.6.18-R1 - CAPA RÁPIDA NO AUTORITATIVA
      -------------------------------------------------
      firmaRemotaEnCursoPorAtencion evita duplicar el mismo POST cuando
      autosave y botón coinciden sobre exactamente la misma firma clínica.

      guardadoVisualPorAtencion vive solo en RAM y sirve para respuesta
      inmediata del dispositivo. Google Sheets sigue siendo la autoridad.
    */
    firmaRemotaEnCursoPorAtencion: {},
    guardadoVisualPorAtencion: {}
  };

  const $ = id => document.getElementById(id);
  const texto = valor => String(valor ?? '').trim();

  function normalizar(valor) {
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function humanizarClave(valor) {
    const limpio = texto(valor)
      .replace(/[_-]+/g, ' ')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();

    if (!limpio) return '';
    return limpio.charAt(0).toUpperCase() + limpio.slice(1);
  }

  function esCampoMotivoAutomatico(id) {
    const clave = normalizar(id).replace(/\s+/g, '_');
    return [
      'motivo',
      'motivo_consulta',
      'motivo_de_consulta',
      'razon_consulta',
      'razon_de_consulta'
    ].includes(clave);
  }

  function escaparHtml(valor) {
    return texto(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parsearJsonSeguro(valor, defecto) {
    if (valor == null || valor === '') return defecto;
    if (typeof valor === 'object') return valor;
    try {
      return JSON.parse(valor);
    } catch (error) {
      console.warn('IASYN Anamnesis: JSON inválido.', error);
      return defecto;
    }
  }

  function convertirArray(valor) {
    if (Array.isArray(valor)) return valor;
    if (valor == null || valor === '') return [];

    if (typeof valor === 'string') {
      const json = parsearJsonSeguro(valor, null);
      if (Array.isArray(json)) return json;
      return valor.split(/[,;|\n]/).map(texto).filter(Boolean);
    }

    if (typeof valor === 'object') return Object.values(valor);
    return [valor];
  }

  function obtenerApiUrl() {
    if (typeof window.auroApiUrlGlobal === 'function') {
      const url = texto(window.auroApiUrlGlobal());
      if (url) return url;
    }

    return texto(
      window.API_URL ||
      window.APP_SCRIPT_URL ||
      localStorage.getItem('IASYN_API_URL')
    );
  }

  async function consultarAccion(accion, parametros = {}) {
    const api = obtenerApiUrl();
    if (!api) throw new Error('No se encontró la URL pública de Apps Script.');

    const url = new URL(api);
    url.searchParams.set('accion', accion);
    url.searchParams.set('action', accion);

    Object.entries(parametros).forEach(([clave, valor]) => {
      if (valor != null && valor !== '') url.searchParams.set(clave, valor);
    });

    const respuesta = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!respuesta.ok) {
      throw new Error(`Apps Script respondió HTTP ${respuesta.status}.`);
    }

    const contenido = await respuesta.text();
    const json = parsearJsonSeguro(contenido, null);

    if (json == null) {
      throw new Error('Apps Script no devolvió un JSON válido.');
    }

    return json;
  }

  function normalizarRespuesta(respuesta) {
    let valor = respuesta;
    if (typeof valor === 'string') valor = parsearJsonSeguro(valor, []);

    if (Array.isArray(valor)) return valor;
    if (!valor || typeof valor !== 'object') return [];

    const candidatos = [
      valor.data,
      valor.datos,
      valor.resultado,
      valor.result,
      valor.registros,
      valor.plantillas,
      valor.items
    ];

    for (const candidato of candidatos) {
      if (Array.isArray(candidato)) return candidato;
      if (typeof candidato === 'string') {
        const convertido = parsearJsonSeguro(candidato, []);
        if (Array.isArray(convertido)) return convertido;
      }
    }

    return [];
  }

  function idPlantilla(plantilla) {
    return texto(
      plantilla.id_plantilla_anamnesis ||
      plantilla.id_plantilla ||
      plantilla.id ||
      plantilla.codigo
    );
  }

  function nombrePlantilla(plantilla) {
    return texto(
      plantilla.nombre_plantilla ||
      plantilla.nombre ||
      plantilla.titulo ||
      plantilla.categoria_sindromica ||
      'Plantilla de anamnesis'
    );
  }

  function plantillaActiva(plantilla) {
    const estado = normalizar(plantilla.estado ?? plantilla.activo ?? 'activo');
    return !['inactivo', '0', 'false', 'archivado', 'eliminado'].includes(estado);
  }

  function palabrasClave(plantilla) {
    return convertirArray(
      plantilla.palabras_clave ||
      plantilla.keywords ||
      plantilla.sinonimos ||
      ''
    )
      .flatMap(item => typeof item === 'string' ? item.split(/[,;|\n]/) : [item])
      .map(normalizar)
      .filter(Boolean);
  }

  function especialidadActual() {
    const selectores = [...document.querySelectorAll('#hc_anamnesis select')];
    const selector = selectores.find(item => {
      const bloque = item.closest('.col-md-3, .col-md-4, .form-group');
      return normalizar(bloque?.querySelector('label')?.textContent) === 'especialidad';
    });
    return texto(selector?.value);
  }

  /* ============================================================
     IASYN ANAMNESIS v3.6.8
     CABECERA SINCRONIZADA CON LA ATENCIÓN ACTIVA
     ------------------------------------------------------------
     Fecha, médico, especialidad y tipo se visualizan desde el
     núcleo de la atención. No forman parte del contenido clínico
     que determina si existe anamnesis registrada.
     No modifica buscador, narrativa, guardado clínico ni otros módulos.
  ============================================================ */

  const AURO_CAMPOS_CONTEXTO_ATENCION = {
    fecha: ['fecha atencion', 'fecha de atencion', 'fecha consulta'],
    medico: ['medico', 'profesional'],
    especialidad: ['especialidad'],
    tipo: ['tipo', 'tipo de consulta', 'tipo atencion']
  };

  function auroBuscarControlCabeceraAnamnesis(alias) {
    const panel = $('hc_anamnesis');
    if (!panel) return null;

    const esperados = (AURO_CAMPOS_CONTEXTO_ATENCION[alias] || [])
      .map(normalizar)
      .filter(Boolean);

    const labels = [...panel.querySelectorAll('label')];
    const label = labels.find(item => {
      const contenido = normalizar(item.textContent).replace(/\s*\*\s*$/, '');
      return esperados.includes(contenido);
    });

    if (!label) return null;

    if (label.htmlFor) {
      const vinculado = $(label.htmlFor);
      if (vinculado) return vinculado;
    }

    const bloque = label.closest(
      '.col-md-2, .col-md-3, .col-md-4, .col-md-6, .col-12, .form-group'
    ) || label.parentElement;

    return bloque?.querySelector('input, select, textarea') || null;
  }

  function auroPrimerValor(objetos, claves) {
    for (const objeto of objetos) {
      if (!objeto || typeof objeto !== 'object') continue;

      for (const clave of claves) {
        const valor = objeto[clave];
        if (valor && typeof valor === 'object') {
          const interno = texto(
            valor.nombre || valor.name || valor.descripcion || valor.label || valor.id
          );
          if (interno) return interno;
        }

        const limpio = texto(valor);
        if (limpio) return limpio;
      }
    }

    return '';
  }

  function auroObjetosContextoAtencion(detalle = {}) {
    const objetos = [
      detalle,
      detalle?.atencion,
      detalle?.data,
      detalle?.datos,
      window.atencionActiva,
      window.atencionActual,
      window.auroAtencionActiva,
      window.planState?.atencionActiva,
      window.planState?.atencionActualData,
      window.examenFisicoState?.atencionActiva
    ];

    /*
      IASYN 3.6.9 - CONTEXTO CENTRAL DE ATENCIÓN
      Prioriza el contexto maestro enriquecido de atenciones.js.
      Se conservan las fuentes anteriores únicamente como compatibilidad.
    */
    try {
      if (typeof window.getContextoAtencionActual === 'function') {
        objetos.unshift(window.getContextoAtencionActual());
      } else if (typeof window.obtenerContextoAtencionActual === 'function') {
        objetos.unshift(window.obtenerContextoAtencionActual());
      }
    } catch (error) {
      console.warn('IASYN Anamnesis: no se pudo leer el contexto central de la atención.', error);
    }

    try {
      if (typeof window.obtenerAtencionActiva === 'function') {
        objetos.push(window.obtenerAtencionActiva());
      } else if (typeof window.getAtencionActiva === 'function') {
        objetos.push(window.getAtencionActiva());
      }
    } catch (error) {
      console.warn('IASYN Anamnesis: no se pudo leer la atención activa.', error);
    }

    return objetos.filter(Boolean);
  }

  function auroNormalizarFechaAtencion(valor) {
    const fecha = texto(valor);
    if (!fecha) return '';

    const iso = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const local = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (local) return `${local[3]}-${local[2]}-${local[1]}`;

    return fecha;
  }

  function auroExtraerContextoAtencion(detalle = {}) {
    const objetos = auroObjetosContextoAtencion(detalle);

    return {
      id_atencion: auroPrimerValor(objetos, ['id_atencion', 'idAtencion', 'atencion_id']),
      fecha: auroPrimerValor(objetos, [
        'fecha_atencion', 'fechaAtencion', 'fecha_consulta', 'fechaConsulta', 'fecha'
      ]),
      id_medico: auroPrimerValor(objetos, [
        'id_medico', 'idMedico', 'medico_id', 'profesional_id'
      ]),
      medico: auroPrimerValor(objetos, [
        'nombre_medico', 'nombreMedico', 'medico_nombre', 'medico',
        'profesional_nombre', 'profesional'
      ]),
      especialidad: auroPrimerValor(objetos, [
        'especialidad_atencion',
        'especialidad_servicio_solicitado',
        'especialidad_medico',
        'especialidad', 'nombre_especialidad', 'nombreEspecialidad',
        'especialidad_nombre'
      ]),
      tipo: auroPrimerValor(objetos, [
        'tipo_atencion', 'tipoAtencion', 'tipo_consulta', 'tipoConsulta', 'tipo'
      ])
    };
  }

  /*
    IASYN 3.6.11 - CABECERA CLÍNICA SEGURA
    Fecha, médico y especialidad permanecen sincronizados y bloqueados.
    Únicamente el tipo de atención es editable mediante catálogo controlado.
  */
  const AURO_TIPOS_ATENCION = [
    'Primera vez',
    'Control',
    'Procedimiento',
    'Seguimiento',
    'Urgencia',
    'Valoración'
  ];

  function auroAsegurarOpcionesSelector(control, opciones) {
    if (!control || control.tagName !== 'SELECT') return;

    convertirArray(opciones).map(texto).filter(Boolean).forEach(valor => {
      const existe = [...control.options].some(item =>
        normalizar(item.value) === normalizar(valor) ||
        normalizar(item.textContent) === normalizar(valor)
      );

      if (!existe) {
        const opcion = document.createElement('option');
        opcion.value = valor;
        opcion.textContent = valor;
        opcion.dataset.auroOpcionTemporal = 'true';
        control.appendChild(opcion);
      }
    });
  }

  function auroPrepararControlCabeceraEditable(control, alias) {
    if (!control) return;

    control.dataset.auroContextoAtencion = 'true';
    control.dataset.auroCabeceraContexto = 'true';
    control.dataset.auroCabeceraAlias = alias;

    if (control.dataset.auroEdicionCabeceraInstalada !== 'true') {
      control.dataset.auroEdicionCabeceraInstalada = 'true';
      control.addEventListener('change', function () {
        if (control.dataset.auroAsignandoContexto === 'true') return;
        control.dataset.auroValorConfirmadoAtencion = 'true';
      });
    }
  }

  function auroAsignarValorContexto(
    control,
    valores,
    esFecha = false,
    permitirOpcionContexto = false,
    editable = false,
    alias = ''
  ) {
    if (!control) return false;

    const candidatos = convertirArray(valores).map(texto).filter(Boolean);
    if (!candidatos.length) return false;

    auroPrepararControlCabeceraEditable(control, alias);

    if (control.tagName === 'SELECT') {
      if (alias === 'tipo') {
        auroAsegurarOpcionesSelector(control, [...candidatos, ...AURO_TIPOS_ATENCION]);
      }

      let opcion = [...control.options].find(item => candidatos.some(valor => {
        const buscado = normalizar(valor);
        return normalizar(item.value) === buscado || normalizar(item.textContent) === buscado;
      }));

      if (!opcion && permitirOpcionContexto) {
        const visible = candidatos.find(valor => !/^MED[-_]/i.test(valor)) || candidatos.at(-1);
        if (visible) {
          opcion = document.createElement('option');
          opcion.value = visible;
          opcion.textContent = visible;
          opcion.dataset.auroOpcionContexto = 'true';
          control.appendChild(opcion);
        }
      }

      if (!opcion) return false;

      if (!(editable && control.dataset.auroValorConfirmadoAtencion === 'true')) {
        control.dataset.auroAsignandoContexto = 'true';
        control.value = opcion.value;
      }
    } else if (!(editable && control.dataset.auroValorConfirmadoAtencion === 'true')) {
      control.dataset.auroAsignandoContexto = 'true';
      control.value = esFecha ? auroNormalizarFechaAtencion(candidatos[0]) : candidatos[0];
    }

    control.disabled = !editable;

    if (editable) {
      control.removeAttribute('aria-readonly');
      control.title = 'Tipo de atención. Puede confirmarlo o cambiarlo.';
    } else {
      control.setAttribute('aria-readonly', 'true');
      control.title = 'Dato sincronizado desde la atención activa';
    }

    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    delete control.dataset.auroAsignandoContexto;
    return true;
  }

  function auroLimpiarCabeceraAtencion() {
    Object.keys(AURO_CAMPOS_CONTEXTO_ATENCION).forEach(alias => {
      const control = auroBuscarControlCabeceraAnamnesis(alias);
      if (!control) return;
      control.disabled = false;
      control.removeAttribute('aria-readonly');
      delete control.dataset.auroContextoAtencion;
      delete control.dataset.auroCabeceraContexto;
      delete control.dataset.auroCabeceraAlias;
      delete control.dataset.auroValorConfirmadoAtencion;
      delete control.dataset.auroAsignandoContexto;
      control.title = '';
      control.value = '';
    });
  }

  function auroSincronizarCabeceraAtencion(detalle = {}) {
    const contexto = {
      ...state.contextoAtencion,
      ...auroExtraerContextoAtencion(detalle)
    };

    state.contextoAtencion = contexto;

    const fecha = auroBuscarControlCabeceraAnamnesis('fecha');
    const medico = auroBuscarControlCabeceraAnamnesis('medico');
    const especialidad = auroBuscarControlCabeceraAnamnesis('especialidad');
    const tipo = auroBuscarControlCabeceraAnamnesis('tipo');

    auroAsignarValorContexto(fecha, contexto.fecha, true, false, false, 'fecha');
    auroAsignarValorContexto(
      medico,
      [contexto.id_medico, contexto.medico],
      false,
      true,
      false,
      'medico'
    );
    auroAsignarValorContexto(
      especialidad,
      contexto.especialidad,
      false,
      true,
      false,
      'especialidad'
    );
    auroAsignarValorContexto(
      tipo,
      contexto.tipo,
      false,
      true,
      true,
      'tipo'
    );

    return contexto;
  }

  /*
    IASYN 3.6.7 - EQUIVALENCIAS CLÍNICAS GLOBALES
    -------------------------------------------------
    Capa compacta para reconocer expresiones frecuentes sin llenar el código
    con diagnósticos ni duplicar todas las palabras_clave de las plantillas.
    Se aplica tanto al motivo como al contenido indexable de cada plantilla.
  */
  const AURO_EQUIVALENCIAS_CLINICAS = [
    { canonico: 'sangrado', terminos: ['hemorragia', 'hemorragico', 'hemorragica', 'manchado', 'sangra', 'sangrando', 'sangre', 'metrorragia'] },
    { canonico: 'embarazo', terminos: ['embarazada', 'gestacion', 'gestante', 'prenatal', 'obstetrico', 'obstetrica'] },
    { canonico: 'movimientos fetales disminuidos', terminos: ['no siento al bebe', 'bebe no se mueve', 'menos movimientos del bebe', 'disminucion de movimientos', 'ausencia de movimientos fetales'] },
    { canonico: 'disuria', terminos: ['ardor al orinar', 'dolor al orinar', 'quemazon al orinar', 'molestia al orinar'] },
    { canonico: 'polaquiuria', terminos: ['orina frecuente', 'orinar muchas veces', 'voy mucho al bano', 'miccion frecuente'] },
    { canonico: 'urgencia miccional', terminos: ['urgencia para orinar', 'ganas urgentes de orinar', 'no aguanta la orina'] },
    { canonico: 'flujo vaginal leucorrea', terminos: ['flujo', 'secrecion vaginal', 'descarga vaginal', 'leucorrea'] },
    { canonico: 'prurito picazon', terminos: ['picazon', 'comezon', 'prurito'] },
    { canonico: 'fiebre', terminos: ['calentura', 'temperatura alta', 'febril'] },
    { canonico: 'vomitos', terminos: ['vomito', 'vomitando', 'emesis'] },
    { canonico: 'diarrea', terminos: ['deposiciones liquidas', 'heces liquidas', 'evacuaciones liquidas'] },
    { canonico: 'tos', terminos: ['tose', 'tosiendo'] },
    { canonico: 'dificultad respiratoria disnea', terminos: ['falta de aire', 'le cuesta respirar', 'respira con dificultad', 'ahogo'] },
    { canonico: 'dolor pelvico', terminos: ['dolor de vientre', 'dolor bajo vientre', 'dolor en pelvis', 'dolor abdominal bajo'] },
    { canonico: 'menstruacion regla', terminos: ['regla', 'periodo', 'menstruacion', 'mestruacion'] },
    { canonico: 'amenorrea', terminos: ['no me viene la regla', 'no llega la menstruacion', 'retraso menstrual', 'falta de menstruacion'] },
    { canonico: 'menopausia climaterio', terminos: ['sofocos', 'bochornos', 'calores menopausia', 'climaterio'] },
    { canonico: 'incontinencia urinaria', terminos: ['se me sale la orina', 'escape de orina', 'perdida involuntaria de orina'] },
    { canonico: 'nutricion peso', terminos: ['bajar de peso', 'subir de peso', 'sobrepeso', 'obesidad', 'dieta', 'alimentacion'] },
    { canonico: 'hipertension presion alta', terminos: ['presion alta', 'tension alta', 'hipertension'] }
  ];

  function enriquecerTextoClinico(valor) {
    const base = normalizar(valor);
    if (!base) return '';

    const agregados = [];

    AURO_EQUIVALENCIAS_CLINICAS.forEach(grupo => {
      const coincide = grupo.terminos.some(termino => {
        const patron = normalizar(termino);
        return patron && (base === patron || base.includes(patron));
      });

      if (coincide) agregados.push(normalizar(grupo.canonico));
    });

    return normalizar([base, ...agregados].join(' '));
  }

  function puntuarPlantilla(plantilla, motivo) {
    const consultaOriginal = normalizar(motivo);
    const consulta = enriquecerTextoClinico(motivo);
    if (!consulta) return 0;

    /*
      IASYN 3.6.6 - MOTOR GLOBAL DE SELECCIÓN DE PLANTILLAS
      Intervención quirúrgica limitada al reconocimiento del motivo.
      No modifica formularios, redacción clínica, guardado ni restauración.
    */
    const palabrasVacias = new Set([
      'a', 'al', 'con', 'de', 'del', 'durante', 'el', 'en', 'la', 'las',
      'lo', 'los', 'me', 'mi', 'para', 'por', 'que', 'se', 'sin', 'un',
      'una', 'y'
    ]);

    const tokens = valor => normalizar(valor)
      .split(' ')
      .filter(token => token.length >= 2 && !palabrasVacias.has(token));

    const unicos = lista => [...new Set(lista)];
    const tokensConsulta = unicos(tokens(consulta));
    const consultaCompacta = tokensConsulta.join(' ');

    const nombre = normalizar(nombrePlantilla(plantilla));
    const categoria = normalizar(plantilla.categoria_sindromica || '');
    const especialidad = normalizar(plantilla.especialidad || '');
    const especialidadSeleccionada = normalizar(especialidadActual());
    const claves = palabrasClave(plantilla);

    let puntos = 0;
    let mejorCoincidenciaFrase = 0;
    let maxTokensCoincidentes = 0;

    const puntuarFrase = (frase, pesoExacto, pesoContenida, pesoTokens) => {
      const fraseOriginal = normalizar(frase);
      frase = enriquecerTextoClinico(frase);
      if (!frase) return 0;

      const tokensFrase = unicos(tokens(frase));
      const fraseCompacta = tokensFrase.join(' ');
      const coincidencias = tokensConsulta.filter(token => tokensFrase.includes(token));
      const coberturaConsulta = tokensConsulta.length
        ? coincidencias.length / tokensConsulta.length
        : 0;
      const coberturaFrase = tokensFrase.length
        ? coincidencias.length / tokensFrase.length
        : 0;

      maxTokensCoincidentes = Math.max(maxTokensCoincidentes, coincidencias.length);

      let subtotal = 0;

      if (consultaOriginal === fraseOriginal || consulta === frase) {
        subtotal += pesoExacto + frase.length;
      } else if (consultaCompacta && consultaCompacta === fraseCompacta) {
        /* Igualdad clínica aunque cambien artículos o preposiciones. */
        subtotal += pesoExacto - 40 + frase.length;
      } else if (consulta.includes(frase)) {
        subtotal += pesoContenida + frase.length * 2;
      } else if (frase.includes(consulta) && tokensConsulta.length >= 2) {
        subtotal += Math.round(pesoContenida * 0.65) + consulta.length;
      }

      if (coincidencias.length >= 2) {
        subtotal += Math.round(
          pesoTokens * coincidencias.length * coberturaConsulta * (0.5 + coberturaFrase)
        );
      }

      if (
        tokensConsulta.length >= 2 &&
        coincidencias.length === tokensConsulta.length
      ) {
        /* Todos los conceptos del motivo aparecen juntos en la misma frase. */
        subtotal += 700 + tokensConsulta.length * 80;
      }

      mejorCoincidenciaFrase = Math.max(mejorCoincidenciaFrase, subtotal);
      return subtotal;
    };

    puntos += puntuarFrase(nombre, 2200, 1250, 130);
    puntos += puntuarFrase(categoria, 1500, 850, 90);

    claves.forEach(clave => {
      puntos += puntuarFrase(clave, 2000, 1150, 120);
    });

    /* Coincidencia general del motivo contra todo el contenido indexable. */
    const contenidoPlantilla = enriquecerTextoClinico([
      nombre,
      categoria,
      especialidad,
      ...claves
    ].join(' '));
    const tokensContenido = new Set(tokens(contenidoPlantilla));
    const coincidenciasGlobales = tokensConsulta.filter(token => tokensContenido.has(token));

    if (coincidenciasGlobales.length >= 2) {
      puntos += coincidenciasGlobales.length * 70;
    }

    /* Bonificación contextual: combina conceptos clínicos específicos. */
    const contextoEmbarazo = consulta.includes('embarazo');
    const contenidoEmbarazo = contenidoPlantilla.includes('embarazo');
    const contextoPediatrico = /\b(nino|nina|bebe|pediatr|infantil)\b/.test(consulta);
    const contenidoPediatrico = /\b(pediatr|infantil|nino sano)\b/.test(contenidoPlantilla);

    if (contextoEmbarazo && contenidoEmbarazo) puntos += 650;
    if (contextoEmbarazo && !contenidoEmbarazo && especialidad.includes('ginecologia')) puntos -= 220;
    if (contextoPediatrico && contenidoPediatrico) puntos += 500;

    /* La especialidad ayuda a desempatar, pero no anula una frase clínica exacta. */
    if (especialidadSeleccionada && especialidad) {
      if (especialidadSeleccionada === especialidad) puntos += 140;
      else if (
        especialidadSeleccionada.includes(especialidad) ||
        especialidad.includes(especialidadSeleccionada)
      ) puntos += 70;
      else puntos -= 20;
    }

    /* Evita que una plantilla general gane por una sola palabra aislada. */
    if (
      tokensConsulta.length >= 2 &&
      maxTokensCoincidentes < 2 &&
      mejorCoincidenciaFrase < 500
    ) {
      puntos -= 300;
    }

    return Math.max(0, Math.round(puntos));
  }

  function buscarPlantilla(motivo) {
    const resultados = state.plantillas
      .map(plantilla => ({
        plantilla,
        puntaje: puntuarPlantilla(plantilla, motivo)
      }))
      .filter(resultado => resultado.puntaje > 0)
      .sort((a, b) => {
        if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;

        /* En empate, prioriza la plantilla con nombre más específico. */
        return nombrePlantilla(b.plantilla).length - nombrePlantilla(a.plantilla).length;
      });

    const mejor = resultados[0] || null;
    const segundo = resultados[1] || null;

    if (!mejor || mejor.puntaje < 180) return null;

    /*
      Si dos opciones quedan prácticamente empatadas y el puntaje es bajo,
      se conserva la selección manual para evitar una asignación insegura.
    */
    if (
      segundo &&
      mejor.puntaje < 700 &&
      mejor.puntaje - segundo.puntaje < 60
    ) {
      return null;
    }

    return mejor.plantilla;
  }

  function estado(mensaje, tipo = 'info') {
    const elemento = $('auroAnamnesisEstado');
    if (!elemento) return;
    elemento.className = `auro-anamnesis-estado ${tipo}`;
    elemento.textContent = mensaje;
  }

  function ocultarCamposDuplicados() {
    ['hcRevisionSistemas', 'hcSintomasAlarma'].forEach(id => {
      const campo = $(id);
      if (!campo) return;
      const bloque = campo.closest('.col-md-6, .col-md-12') || campo.parentElement;
      if (bloque) {
        bloque.style.display = 'none';
        bloque.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function instalarEstilos() {
    if ($('auroAnamnesisStylesV3')) return;

    const style = document.createElement('style');
    style.id = 'auroAnamnesisStylesV3';
    style.textContent = `
      .auro-anamnesis-box{border:1px solid #fbcfe8;background:linear-gradient(135deg,#fff,#fff7fb);border-radius:18px;padding:14px;margin-top:10px;box-shadow:0 8px 24px rgba(139,30,90,.06)}
      .auro-anamnesis-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      .auro-anamnesis-title{font-weight:900;color:#7a174f;display:flex;align-items:center;gap:8px}
      .auro-anamnesis-subtitle{color:#6b7280;font-size:13px;margin-top:3px}
      .auro-anamnesis-btn{border:1px solid #fbcfe8;background:#fdf2f8;color:#8b1e5a;border-radius:12px;padding:8px 11px;font-weight:800;font-size:13px;cursor:pointer}
      .auro-anamnesis-btn.primary{border:0;background:linear-gradient(135deg,#8b1e5a,#c23b83);color:#fff}
      .auro-anamnesis-btn.danger{background:#fff;color:#991b1b;border-color:#fecaca}
      .auro-anamnesis-btn:disabled{opacity:.55;cursor:not-allowed}
      .auro-anamnesis-estado{margin-top:10px;border-radius:12px;padding:8px 10px;font-size:12.5px;font-weight:700}
      .auro-anamnesis-estado.info{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}
      .auro-anamnesis-estado.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
      .auro-anamnesis-estado.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}
      .auro-dyn-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;margin-top:12px}
      .auro-dyn-toolbar label{display:block;font-size:12px;font-weight:850;color:#374151;margin-bottom:5px}
      .auro-dyn-toolbar select{width:100%;border:1px solid #d1d5db;border-radius:12px;padding:9px 10px;background:#fff;color:#111827;font:inherit;font-size:13px}
      .auro-dyn-panel{display:none;margin-top:14px;border-top:1px solid #f1d5e6;padding-top:14px}
      .auro-dyn-panel.show{display:block}
      .auro-dyn-title{font-weight:900;color:#7a174f;margin-bottom:4px}
      .auro-dyn-meta{font-size:12px;color:#6b7280;margin-bottom:12px}
      .auro-dyn-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .auro-dyn-field{min-width:0}
      .auro-dyn-field.span-2{grid-column:span 2}
      .auro-dyn-field.span-4{grid-column:1/-1}
      .auro-dyn-field>label{display:block;font-size:12px;font-weight:850;color:#374151;margin-bottom:5px}
      .auro-dyn-field input,.auro-dyn-field select,.auro-dyn-field textarea{width:100%;border:1px solid #d1d5db;border-radius:12px;padding:8px 10px;background:#fff;color:#111827;font:inherit;font-size:13px}
      .auro-dyn-field textarea{min-height:74px;resize:vertical}
      .auro-dyn-options{display:flex;flex-wrap:wrap;gap:7px}
      .auro-dyn-option{display:inline-flex;align-items:center;gap:5px;border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:6px 9px;font-size:12px;color:#374151;cursor:pointer}
      .auro-dyn-option input{width:15px;height:15px;accent-color:#8b1e5a}
      .auro-dyn-section{grid-column:1/-1;font-weight:900;color:#7a174f;border-bottom:1px solid #f3d8e7;padding:5px 0 3px;margin-top:4px}
      .auro-dyn-footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}
      .auro-clinical-warning{margin-top:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:9px 10px;font-size:12px}
      @media(max-width:980px){.auro-dyn-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.auro-dyn-toolbar{grid-template-columns:1fr}.auro-dyn-grid{grid-template-columns:1fr}.auro-dyn-field.span-2,.auro-dyn-field.span-4{grid-column:auto}.auro-anamnesis-btn{width:100%}}

      /* Secciones clínicas preexistentes que deben conservarse */
      #hc_anamnesis .gin-panel,
      #hc_anamnesis .obs-panel{
        border:1px solid #e5e7eb;
        border-radius:20px;
        padding:16px;
        background:#fff;
        margin-top:16px;
      }
      #hc_anamnesis .gin-panel-title,
      #hc_anamnesis .obs-panel-title{
        font-weight:900;
        color:#111827;
        margin-bottom:12px;
        display:flex;
        align-items:center;
        gap:8px;
      }
      #hc_anamnesis .gin-panel-title i,
      #hc_anamnesis .obs-panel-title i{color:#8b1e5a}
      #hc_anamnesis .gin-check-grid,
      #hc_anamnesis .obs-check-grid{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px;
      }
      #hc_anamnesis .gin-check,
      #hc_anamnesis .obs-check{
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:9px 10px;
        display:flex;
        align-items:center;
        gap:8px;
        background:#fff;
        cursor:pointer;
        min-width:0;
      }
      #hc_anamnesis .gin-check:hover,
      #hc_anamnesis .obs-check:hover{
        border-color:#f9a8d4;
        background:#fff7fb;
      }
      #hc_anamnesis .gin-check input,
      #hc_anamnesis .obs-check input{
        width:17px;
        height:17px;
        accent-color:#8b1e5a;
        flex:0 0 auto;
      }
      #hc_anamnesis .gin-check span,
      #hc_anamnesis .obs-check span{
        min-width:0;
        line-height:1.25;
      }
      @media(max-width:1100px){
        #hc_anamnesis .gin-check-grid,
        #hc_anamnesis .obs-check-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      @media(max-width:760px){
        #hc_anamnesis .gin-check-grid,
        #hc_anamnesis .obs-check-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:460px){
        #hc_anamnesis .gin-check-grid,
        #hc_anamnesis .obs-check-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }


  function checkSintomaActual(id, etiqueta) {
    return `<label class="gin-check"><input id="${id}" type="checkbox"><span>${etiqueta}</span></label>`;
  }

  function crearBloqueSintomasActuales() {
    /*
      Esta sección formaba parte del módulo clínico original.
      Se conserva de manera independiente del motor de plantillas.
    */
    if ($('auroAnamnesisSintomasActuales')) return;

    const enfermedad = $('hcEnfermedadActual');
    if (!enfermedad) return;

    const bloqueEnfermedad =
      enfermedad.closest('.col-md-12, .col-12, .form-group') ||
      enfermedad.parentElement;

    if (!bloqueEnfermedad) return;

    const bloque = document.createElement('div');
    bloque.id = 'auroAnamnesisSintomasActuales';
    bloque.className = 'gin-panel';
    bloque.innerHTML = `
      <div class="gin-panel-title">
        <i class="bi bi-activity"></i>
        Síntomas ginecológicos
      </div>

      <div class="gin-check-grid mb-3">
        ${checkSintomaActual('ginSintDolorPelvico','Dolor pélvico')}
        ${checkSintomaActual('ginSintSangrado','Sangrado anormal')}
        ${checkSintomaActual('ginSintLeucorrea','Leucorrea')}
        ${checkSintomaActual('ginSintPrurito','Prurito')}
        ${checkSintomaActual('ginSintDisuria','Disuria')}
        ${checkSintomaActual('ginSintDispareunia','Dispareunia')}
        ${checkSintomaActual('ginSintAmenorrea','Amenorrea')}
        ${checkSintomaActual('ginSintDismenorrea','Dismenorrea')}
        ${checkSintomaActual('ginSintMasa','Sensación de masa')}
        ${checkSintomaActual('ginSintSequedad','Sequedad vaginal')}
        ${checkSintomaActual('ginSintIncontinencia','Incontinencia')}
        ${checkSintomaActual('ginSintMenopausia','Síntomas menopáusicos')}
      </div>

      <label class="form-label fw-bold" for="ginSintDescripcion">
        Descripción, evolución y características
      </label>
      <textarea id="ginSintDescripcion" class="form-control" rows="3"></textarea>
    `;

    bloqueEnfermedad.insertAdjacentElement('afterend', bloque);
  }

  function checkSintomaObstetrico(id, etiqueta) {
    return `<label class="obs-check"><input id="${id}" type="checkbox"><span>${etiqueta}</span></label>`;
  }

  function crearBloqueSintomasObstetricos() {
    /*
      Esta sección también se conserva de manera independiente.
      El motor dinámico no debe borrarla ni sustituirla.
    */
    if ($('auroAnamnesisSintomasObstetricos')) return;

    const referencia = $('auroAnamnesisSintomasActuales');
    const enfermedad = $('hcEnfermedadActual');
    if (!referencia && !enfermedad) return;

    const bloque = document.createElement('div');
    bloque.id = 'auroAnamnesisSintomasObstetricos';
    bloque.className = 'obs-panel';
    bloque.innerHTML = `
      <div class="obs-panel-title">
        <i class="bi bi-activity"></i>
        Síntomas obstétricos
      </div>

      <div class="obs-check-grid mb-3">
        ${checkSintomaObstetrico('obsSintSangrado','Sangrado vaginal')}
        ${checkSintomaObstetrico('obsSintPerdidaLiquido','Pérdida de líquido')}
        ${checkSintomaObstetrico('obsSintDolorPelvico','Dolor pélvico')}
        ${checkSintomaObstetrico('obsSintContracciones','Contracciones')}
        ${checkSintomaObstetrico('obsSintCefalea','Cefalea')}
        ${checkSintomaObstetrico('obsSintFosfenos','Fosfenos')}
        ${checkSintomaObstetrico('obsSintTinnitus','Tinnitus')}
        ${checkSintomaObstetrico('obsSintEpigastralgia','Epigastralgia')}
        ${checkSintomaObstetrico('obsSintDisuria','Disuria')}
      </div>

      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label fw-bold" for="obsSintOtros">Otros síntomas</label>
          <input id="obsSintOtros" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label fw-bold" for="obsSintDescripcion">Descripción y evolución</label>
          <textarea id="obsSintDescripcion" rows="2" class="form-control"></textarea>
        </div>
      </div>
    `;

    if (referencia) {
      referencia.insertAdjacentElement('afterend', bloque);
    } else {
      const contenedor =
        enfermedad.closest('.col-md-12, .col-12, .form-group') ||
        enfermedad.parentElement;
      contenedor?.insertAdjacentElement('afterend', bloque);
    }
  }

  function crearInterfaz() {
    if ($('auroAnamnesisAsistente')) return;

    const motivo = $('hcMotivoConsulta');
    if (!motivo) return;

    const contenedor = motivo.closest('.col-md-12') || motivo.parentElement;
    if (!contenedor) return;

    const caja = document.createElement('div');
    caja.id = 'auroAnamnesisAsistente';
    caja.className = 'auro-anamnesis-box';
    caja.innerHTML = `
      <div class="auro-anamnesis-head">
        <div>
          <div class="auro-anamnesis-title"><i class="bi bi-clipboard2-pulse"></i> Asistente de anamnesis sindrómica</div>
          <div class="auro-anamnesis-subtitle">Selecciona la plantilla según el motivo y genera una redacción clínica editable.</div>
        </div>
        <button type="button" class="auro-anamnesis-btn primary" id="auroAbrirAnamnesis" disabled>
          <i class="bi bi-clipboard2-check"></i> Completar anamnesis
        </button>
      </div>

      <div id="auroAnamnesisEstado" class="auro-anamnesis-estado info">
        Cargando catálogo de plantillas…
      </div>

      <div class="auro-dyn-toolbar">
        <div>
          <label for="auroPlantillaAnamnesisSelect">Plantilla sindrómica</label>
          <select id="auroPlantillaAnamnesisSelect" disabled>
            <option value="">Cargando plantillas…</option>
          </select>
        </div>
        <button type="button" class="auro-anamnesis-btn" id="auroRecargarPlantillas">
          <i class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
      </div>

      <div id="auroDynamicAnamnesisPanel" class="auro-dyn-panel">
        <div id="auroDynamicAnamnesisTitle" class="auro-dyn-title"></div>
        <div id="auroDynamicAnamnesisMeta" class="auro-dyn-meta"></div>
        <div id="auroDynamicAnamnesisFields" class="auro-dyn-grid"></div>

        <div class="auro-clinical-warning">
          La redacción generada debe ser revisada por el profesional antes de guardar.
        </div>

        <div class="auro-dyn-footer">
          <button type="button" class="auro-anamnesis-btn danger" id="auroDynamicLimpiar">Limpiar</button>
          <button type="button" class="auro-anamnesis-btn" id="auroDynamicCerrar">Cerrar</button>
          <button type="button" class="auro-anamnesis-btn primary" id="auroDynamicGenerar">
            <i class="bi bi-magic"></i> Generar enfermedad actual
          </button>
        </div>
      </div>
    `;

    contenedor.appendChild(caja);

    $('auroPlantillaAnamnesisSelect')?.addEventListener('change', evento => {
      seleccionarPlantilla(evento.target.value, true);
    });
    $('auroRecargarPlantillas')?.addEventListener('click', () => cargarPlantillas(true));
    $('auroAbrirAnamnesis')?.addEventListener('click', abrir);
    $('auroDynamicLimpiar')?.addEventListener('click', limpiar);
    $('auroDynamicCerrar')?.addEventListener('click', cerrar);
    $('auroDynamicGenerar')?.addEventListener('click', generar);
    motivo.addEventListener('input', detectar);
  }


  function opcionesRapidasPorCampo(id) {
    const clave = normalizar(id).replace(/\s+/g, '_');

    const catalogo = {
      inicio: ['Súbito', 'Gradual', 'Insidioso'],
      evolucion: ['Estable', 'Progresiva', 'Intermitente', 'Recurrente', 'En mejoría'],
      color: ['Blanco', 'Transparente', 'Amarillo', 'Verdoso', 'Grisáceo', 'Marrón', 'Sanguinolento'],
      olor: ['Sin olor', 'Leve', 'Fétido', 'A pescado', 'Otro'],
      cantidad: ['Escasa', 'Moderada', 'Abundante'],
      consistencia: ['Acuosa', 'Cremosa', 'Espesa', 'Grumosa', 'Mucosa', 'Espumosa'],
      patron: ['Continuo', 'Intermitente', 'Cíclico', 'Irregular'],
      caracter: ['Cólico', 'Punzante', 'Opresivo', 'Urente', 'Sordo', 'Pulsátil'],
      intensidad_0_10: Array.from({ length: 11 }, (_, i) => String(i)),
      prurito: ['No', 'Sí'],
      ardor: ['No', 'Sí'],
      disuria: ['No', 'Sí'],
      fiebre: ['No', 'Sí'],
      dolor_pelvico: ['No', 'Sí'],
      sangrado_vaginal: ['No', 'Sí'],
      sangrado_postcoital: ['No', 'Sí'],
      relaciones_sin_proteccion: ['No', 'Sí'],
      nueva_pareja: ['No', 'Sí'],
      tratamientos_previos: ['No', 'Sí'],
      embarazo_posible: ['No', 'Sí', 'Por confirmar'],
      posibilidad_embarazo: ['No', 'Sí', 'Por confirmar'],
      coágulos: ['No', 'Sí'],
      mareo_o_sincope: ['No', 'Sí'],
      palpitaciones: ['No', 'Sí'],
      anticoncepcion: ['No', 'Sí'],
      medicacion_anticoagulante: ['No', 'Sí'],
      movimientos_fetales: ['Presentes', 'Disminuidos', 'No percibidos', 'No aplica'],
      perdida_liquido: ['No', 'Sí'],
      contracciones: ['No', 'Sí'],
      cefalea: ['No', 'Sí'],
      fosfenos: ['No', 'Sí'],
      epigastralgia: ['No', 'Sí'],
      edema: ['No', 'Sí'],
      adherencia_suplementos: ['Adecuada', 'Parcial', 'No cumple'],
      laxitud_percibida: ['Leve', 'Moderada', 'Severa'],
      sequedad: ['No', 'Sí'],
      dolor_relaciones: ['No', 'Sí'],
      incontinencia: ['No', 'Sí'],
      infecciones_recurrentes: ['No', 'Sí'],
      contraindicaciones: ['No', 'Sí']
    };

    return (catalogo[clave] || []).map(valor => ({ value: valor, label: valor }));
  }

  function tipoRapidoPorCampo(id) {
    const opciones = opcionesRapidasPorCampo(id);
    if (opciones.length) return 'select';

    const clave = normalizar(id).replace(/\s+/g, '_');
    if (clave.includes('fecha') || clave === 'fum' || clave === 'fpp') return 'date';
    if (clave.includes('descripcion') || clave.includes('observacion') || clave.includes('antecedentes')) return 'textarea';
    return 'text';
  }

  function placeholderRapidoPorCampo(id) {
    const clave = normalizar(id).replace(/\s+/g, '_');
    const ayudas = {
      tiempo_evolucion: 'Ej. 3 días',
      duracion: 'Ej. horas o días',
      frecuencia: 'Ej. diaria o intermitente',
      localizacion: 'Especifique localización',
      irradiacion: 'Especifique o indique sin irradiación',
      factores_agravantes: 'Ej. actividad, menstruación, relaciones',
      factores_aliviantes: 'Ej. reposo, analgésicos',
      medicacion_actual: 'Medicamento, dosis y frecuencia',
      tratamientos_previos: 'Especifique tratamiento y respuesta',
      signos_de_alarma: 'Describa signos de alarma presentes',
      sintomas_asociados: 'Describa síntomas asociados'
    };
    return ayudas[clave] || '';
  }

  function aplicarSugerenciasPregunta(pregunta) {
    if (pregunta.options?.length) return pregunta;

    const opciones = opcionesRapidasPorCampo(pregunta.id);
    if (opciones.length) {
      pregunta.type = 'select';
      pregunta.options = opciones;
    } else if (!pregunta.placeholder) {
      pregunta.placeholder = placeholderRapidoPorCampo(pregunta.id);
    }

    return pregunta;
  }

  function normalizarPregunta(valor, indice, seccion = '') {
    if (typeof valor === 'string') {
      const idTexto = normalizar(valor).replace(/\s+/g, '_') || `pregunta_${indice}`;
      return {
        id: idTexto,
        label: humanizarClave(valor),
        type: tipoRapidoPorCampo(idTexto),
        required: false,
        options: opcionesRapidasPorCampo(idTexto),
        placeholder: placeholderRapidoPorCampo(idTexto),
        span: 1,
        section: seccion
      };
    }

    const pregunta = valor && typeof valor === 'object' ? valor : {};
    const idBase = texto(
      pregunta.id ||
      pregunta.campo ||
      pregunta.key ||
      pregunta.codigo ||
      pregunta.nombre ||
      `pregunta_${indice}`
    );

    const tipoBase = normalizar(
      pregunta.tipo ||
      pregunta.type ||
      pregunta.control ||
      pregunta.componente ||
      'text'
    );

    const mapaTipos = {
      texto: 'text',
      text: 'text',
      numero: 'number',
      number: 'number',
      fecha: 'date',
      date: 'date',
      hora: 'time',
      time: 'time',
      textarea: 'textarea',
      parrafo: 'textarea',
      select: 'select',
      lista: 'select',
      dropdown: 'select',
      checkbox: 'checkbox',
      multiple: 'checkbox',
      multiseleccion: 'checkbox',
      radio: 'radio',
      boolean: 'boolean',
      si_no: 'boolean',
      escala: 'scale',
      eva: 'scale',
      titulo: 'section',
      seccion: 'section'
    };

    const opciones = convertirArray(
      pregunta.opciones ||
      pregunta.options ||
      pregunta.valores ||
      pregunta.respuestas ||
      []
    ).map(opcion => {
      if (opcion && typeof opcion === 'object') {
        return {
          value: texto(opcion.value ?? opcion.valor ?? opcion.id ?? opcion.label ?? opcion.etiqueta),
          label: texto(opcion.label ?? opcion.etiqueta ?? opcion.nombre ?? opcion.value ?? opcion.valor)
        };
      }
      return { value: texto(opcion), label: texto(opcion) };
    }).filter(opcion => opcion.value || opcion.label);

    const columnas = Number(pregunta.span || pregunta.columnas || pregunta.cols || 1);
    const span = columnas >= 4 ? 4 : columnas >= 2 ? 2 : 1;

    return aplicarSugerenciasPregunta({
      id: normalizar(idBase).replace(/\s+/g, '_') || `pregunta_${indice}`,
      label: texto(
        pregunta.label ||
        pregunta.etiqueta ||
        pregunta.pregunta ||
        pregunta.titulo ||
        pregunta.nombre ||
        humanizarClave(idBase)
      ),
      type: mapaTipos[tipoBase] || 'text',
      required: Boolean(
        pregunta.required ??
        pregunta.requerido ??
        pregunta.obligatorio ??
        false
      ),
      options: opciones,
      placeholder: texto(pregunta.placeholder || pregunta.ayuda || pregunta.ejemplo || ''),
      span,
      section: texto(pregunta.seccion || pregunta.grupo || seccion),
      min: pregunta.min ?? pregunta.minimo ?? '',
      max: pregunta.max ?? pregunta.maximo ?? '',
      step: pregunta.step ?? pregunta.paso ?? '',
      suffix: texto(pregunta.sufijo || ''),
      narrative: texto(pregunta.narrativa || pregunta.plantilla_narrativa || '')
    });
  }

  function extraerPreguntas(plantilla) {
    const origen = parsearJsonSeguro(
      plantilla.preguntas_json ||
      plantilla.preguntas ||
      plantilla.campos_json ||
      plantilla.campos,
      []
    );

    const preguntas = [];
    let indice = 0;

    function recorrer(valor, seccion = '') {
      if (Array.isArray(valor)) {
        valor.forEach(item => recorrer(item, seccion));
        return;
      }

      if (!valor || typeof valor !== 'object') {
        if (texto(valor)) preguntas.push(normalizarPregunta(valor, ++indice, seccion));
        return;
      }

      const lista = valor.preguntas || valor.campos || valor.items;
      if (Array.isArray(lista)) {
        const titulo = texto(valor.titulo || valor.nombre || valor.seccion || seccion);
        if (titulo) {
          preguntas.push({
            id: `seccion_${++indice}`,
            label: titulo,
            type: 'section',
            options: [],
            span: 4
          });
        }
        recorrer(lista, titulo);
        return;
      }

      const parecePregunta =
        valor.pregunta ||
        valor.label ||
        valor.etiqueta ||
        valor.tipo ||
        valor.type ||
        valor.campo ||
        valor.id;

      if (parecePregunta) {
        preguntas.push(normalizarPregunta(valor, ++indice, seccion));
        return;
      }

      Object.entries(valor).forEach(([clave, item]) => {
        if (Array.isArray(item) || (item && typeof item === 'object')) {
          recorrer(item, clave);
        } else {
          preguntas.push(
            normalizarPregunta(
              { id: clave, label: clave, type: 'text' },
              ++indice,
              seccion
            )
          );
        }
      });
    }

    recorrer(origen);
    return preguntas;
  }

  function renderizarPregunta(pregunta) {
    if (pregunta.type === 'section') {
      return `<div class="auro-dyn-section">${escaparHtml(pregunta.label)}</div>`;
    }

    const id = `auroDyn_${pregunta.id}`;
    const clase = `auro-dyn-field${pregunta.span === 4 ? ' span-4' : pregunta.span === 2 ? ' span-2' : ''}`;
    const requerido = pregunta.required ? ' required' : '';
    const marca = pregunta.required ? ' *' : '';
    const esMotivoAutomatico = esCampoMotivoAutomatico(pregunta.id);
    const valorMotivo = esMotivoAutomatico ? texto($('hcMotivoConsulta')?.value) : '';
    const placeholder = pregunta.placeholder ? ` placeholder="${escaparHtml(pregunta.placeholder)}"` : '';
    const min = pregunta.min !== '' ? ` min="${escaparHtml(pregunta.min)}"` : '';
    const max = pregunta.max !== '' ? ` max="${escaparHtml(pregunta.max)}"` : '';
    const step = pregunta.step !== '' ? ` step="${escaparHtml(pregunta.step)}"` : '';

    let control = '';

    if (esMotivoAutomatico) {
      control = `<input id="${id}" type="hidden" data-auro-question="${escaparHtml(pregunta.id)}" value="${escaparHtml(valorMotivo)}">`;
      return '';
    } else if (pregunta.type === 'textarea') {
      control = `<textarea id="${id}" data-auro-question="${escaparHtml(pregunta.id)}"${placeholder}${requerido}></textarea>`;
    } else if (pregunta.type === 'select') {
      control = `
        <select id="${id}" data-auro-question="${escaparHtml(pregunta.id)}"${requerido}>
          <option value="">Seleccione</option>
          ${pregunta.options.map(opcion =>
            `<option value="${escaparHtml(opcion.value)}">${escaparHtml(opcion.label)}</option>`
          ).join('')}
        </select>`;
    } else if (pregunta.type === 'checkbox' || pregunta.type === 'radio') {
      const tipo = pregunta.type;
      const nombre = `auroDynGroup_${pregunta.id}`;
      control = `
        <div class="auro-dyn-options">
          ${pregunta.options.map(opcion => `
            <label class="auro-dyn-option">
              <input type="${tipo}" name="${escaparHtml(nombre)}"
                data-auro-question="${escaparHtml(pregunta.id)}"
                value="${escaparHtml(opcion.value)}">
              ${escaparHtml(opcion.label)}
            </label>
          `).join('')}
        </div>`;
    } else if (pregunta.type === 'boolean') {
      control = `
        <select id="${id}" data-auro-question="${escaparHtml(pregunta.id)}"${requerido}>
          <option value="">Seleccione</option>
          <option value="Sí">Sí</option>
          <option value="No">No</option>
        </select>`;
    } else if (pregunta.type === 'scale') {
      const inicio = Number(pregunta.min !== '' ? pregunta.min : 0);
      const fin = Number(pregunta.max !== '' ? pregunta.max : 10);
      const opciones = [];
      for (let valor = inicio; valor <= fin && opciones.length < 101; valor++) {
        opciones.push(
          `<option value="${valor}">${valor}${pregunta.suffix ? ' ' + escaparHtml(pregunta.suffix) : ''}</option>`
        );
      }
      control = `
        <select id="${id}" data-auro-question="${escaparHtml(pregunta.id)}"${requerido}>
          <option value="">Seleccione</option>
          ${opciones.join('')}
        </select>`;
    } else {
      const tipo = ['number', 'date', 'time'].includes(pregunta.type)
        ? pregunta.type
        : 'text';
      control = `<input id="${id}" type="${tipo}" data-auro-question="${escaparHtml(pregunta.id)}"${placeholder}${min}${max}${step}${requerido}>`;
    }

    return `
      <div class="${clase}">
        <label for="${id}">${escaparHtml(pregunta.label)}${marca}</label>
        ${control}
      </div>`;
  }

  function llenarSelector() {
    const selector = $('auroPlantillaAnamnesisSelect');
    if (!selector) return;

    selector.disabled = false;
    selector.innerHTML = `
      <option value="">Seleccione una plantilla</option>
      ${state.plantillas.map(plantilla =>
        `<option value="${escaparHtml(idPlantilla(plantilla))}">${escaparHtml(nombrePlantilla(plantilla))}</option>`
      ).join('')}
    `;
  }

  function seleccionarPlantilla(id, abrirPanel = false) {
    const plantilla = state.plantillas.find(item => idPlantilla(item) === texto(id)) || null;
    state.plantillaActiva = plantilla;
    state.respuestas = {};
    state.preguntas = plantilla ? extraerPreguntas(plantilla) : [];

    const panel = $('auroDynamicAnamnesisPanel');
    const titulo = $('auroDynamicAnamnesisTitle');
    const meta = $('auroDynamicAnamnesisMeta');
    const campos = $('auroDynamicAnamnesisFields');
    const boton = $('auroAbrirAnamnesis');

    if (!plantilla) {
      if (titulo) titulo.textContent = '';
      if (meta) meta.textContent = '';
      if (campos) campos.innerHTML = '';
      panel?.classList.remove('show');
      if (boton) boton.disabled = true;
      return;
    }

    if (titulo) titulo.textContent = nombrePlantilla(plantilla);

    if (meta) {
      meta.textContent = [
        plantilla.especialidad,
        plantilla.categoria_sindromica,
        plantilla.version_plantilla ? `Versión ${plantilla.version_plantilla}` : ''
      ].map(texto).filter(Boolean).join(' · ');
    }

    if (campos) {
      campos.innerHTML = state.preguntas.length
        ? state.preguntas.map(renderizarPregunta).join('')
        : '<div class="auro-dyn-field span-4"><div class="auro-anamnesis-estado warn">Esta plantilla no contiene preguntas válidas en preguntas_json.</div></div>';

      state.preguntas
        .filter(pregunta => pregunta.type !== 'section' && esCampoMotivoAutomatico(pregunta.id))
        .forEach(pregunta => {
          const oculto = document.createElement('input');
          oculto.type = 'hidden';
          oculto.dataset.auroQuestion = pregunta.id;
          oculto.value = texto($('hcMotivoConsulta')?.value);
          campos.appendChild(oculto);
        });
    }

    if (boton) boton.disabled = false;
    if (abrirPanel) panel?.classList.add('show');
  }

  function detectar() {
    if (!state.cargado) return;

    const motivo = texto($('hcMotivoConsulta')?.value);

    document.querySelectorAll('[data-auro-question]').forEach(control => {
      if (esCampoMotivoAutomatico(control.dataset.auroQuestion)) {
        control.value = motivo;
      }
    });
    const selector = $('auroPlantillaAnamnesisSelect');

    if (!motivo) {
      estado(`Escriba el motivo de consulta o seleccione una de las ${state.plantillas.length} plantillas disponibles.`, 'info');
      return;
    }

    const coincidencia = buscarPlantilla(motivo);

    if (!coincidencia) {
      if (selector) selector.value = '';
      seleccionarPlantilla('', false);
      estado('No se encontró una plantilla compatible. Seleccione una manualmente.', 'warn');
      return;
    }

    const id = idPlantilla(coincidencia);
    if (selector) selector.value = id;
    seleccionarPlantilla(id, false);
    estado(`Motivo reconocido: ${nombrePlantilla(coincidencia)}.`, 'ok');
  }

  function abrir() {
    if (!state.plantillaActiva) {
      detectar();
    }

    if (!state.plantillaActiva) {
      estado('Seleccione primero una plantilla de anamnesis.', 'warn');
      $('auroPlantillaAnamnesisSelect')?.focus();
      return;
    }

    $('auroDynamicAnamnesisPanel')?.classList.add('show');
    estado(`Complete la plantilla ${nombrePlantilla(state.plantillaActiva)}.`, 'info');
  }

  function cerrar() {
    $('auroDynamicAnamnesisPanel')?.classList.remove('show');
  }

  function leerRespuestas() {
    const respuestas = {};

    state.preguntas.forEach(pregunta => {
      if (pregunta.type === 'section') return;

      const selector = `[data-auro-question="${CSS.escape(pregunta.id)}"]`;
      const controles = [...document.querySelectorAll(selector)];
      if (!controles.length) return;

      if (pregunta.type === 'checkbox') {
        respuestas[pregunta.id] = controles
          .filter(control => control.checked)
          .map(control => texto(control.value))
          .filter(Boolean);
      } else if (pregunta.type === 'radio') {
        respuestas[pregunta.id] = texto(controles.find(control => control.checked)?.value);
      } else {
        respuestas[pregunta.id] = texto(controles[0].value);
      }
    });

    state.respuestas = respuestas;
    return respuestas;
  }

  function validarObligatorios(respuestas) {
    return state.preguntas.filter(pregunta => {
      if (!pregunta.required || pregunta.type === 'section') return false;
      const valor = respuestas[pregunta.id];
      return Array.isArray(valor) ? valor.length === 0 : !texto(valor);
    });
  }

  function unirNatural(lista) {
    const elementos = lista.map(texto).filter(Boolean);
    if (!elementos.length) return '';
    if (elementos.length === 1) return elementos[0];
    if (elementos.length === 2) return `${elementos[0]} y ${elementos[1]}`;
    return `${elementos.slice(0, -1).join(', ')} y ${elementos.at(-1)}`;
  }

  function reemplazarVariables(plantillaTexto, respuestas) {
    let resultado = texto(plantillaTexto);

    Object.entries(respuestas).forEach(([clave, valor]) => {
      const contenido = Array.isArray(valor) ? unirNatural(valor) : texto(valor);
      const expresion = new RegExp(`\\{\\{?\\s*${clave}\\s*\\}?\\}`, 'gi');
      resultado = resultado.replace(expresion, contenido);
    });

    return resultado
      .replace(/\{\{?[^{}]+\}?\}/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  function estructuraNarrativa(plantilla) {
    return parsearJsonSeguro(
      plantilla.estructura_narrativa_json ||
      plantilla.estructura_narrativa ||
      plantilla.narrativa_json ||
      '',
      null
    );
  }

  function generarNarrativa(plantilla, respuestas) {
    const estructura = estructuraNarrativa(plantilla);

    if (typeof estructura === 'string' && texto(estructura)) {
      return reemplazarVariables(estructura, respuestas);
    }

    if (Array.isArray(estructura)) {
      const narrativaExplicita = estructura
        .map(item => {
          if (typeof item === 'string') return reemplazarVariables(item, respuestas);
          if (item && typeof item === 'object') {
            return reemplazarVariables(
              item.texto || item.plantilla || item.narrativa || '',
              respuestas
            );
          }
          return '';
        })
        .map(texto)
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (narrativaExplicita) return narrativaExplicita;
    }

    if (estructura && typeof estructura === 'object') {
      const base = texto(
        estructura.plantilla ||
        estructura.texto ||
        estructura.narrativa ||
        estructura.formato ||
        estructura.template ||
        ''
      );
      if (base) return reemplazarVariables(base, respuestas);
    }

    const motivo = texto($('hcMotivoConsulta')?.value) || nombrePlantilla(plantilla).toLowerCase();
    const valores = {};

    state.preguntas
      .filter(pregunta => pregunta.type !== 'section')
      .forEach(pregunta => {
        const valor = respuestas[pregunta.id];
        valores[pregunta.id] = Array.isArray(valor) ? unirNatural(valor) : texto(valor);
      });

    const partes = [`Paciente consulta por ${motivo}.`];

    const cronologia = [];
    if (valores.inicio) cronologia.push(`inicio ${valores.inicio.toLowerCase()}`);
    if (valores.tiempo_evolucion) cronologia.push(`${valores.tiempo_evolucion} de evolución`);
    if (valores.evolucion) cronologia.push(`curso ${valores.evolucion.toLowerCase()}`);
    if (cronologia.length) partes.push(`Cuadro de ${unirNatural(cronologia)}.`);

    /* IASYN 3.6.3: pulido final del motor narrativo, sin alterar guardado, navegación ni vínculos. */
    const dolor = [];
    if (valores.localizacion) dolor.push(`localizado en ${valores.localizacion.toLowerCase()}`);
    /* IASYN 3.6.5: evita generar intensidad undefined/10 en plantillas sin campo de dolor. */
    const intensidadDolor = texto(valores.intensidad_0_10);
    if (intensidadDolor !== '') {
      const n = Number(intensidadDolor);
      let grado = '';

      if (!Number.isNaN(n) && n >= 0 && n <= 10) {
        if (n <= 3) grado = 'leve';
        else if (n <= 6) grado = 'moderada';
        else grado = 'intensa';
      }

      dolor.push(
        grado
          ? `de intensidad ${grado} (${n}/10)`
          : `de intensidad ${intensidadDolor}/10`
      );
    }
    if (valores.caracter) dolor.push(`de carácter ${valores.caracter.toLowerCase()}`);
    if (valores.irradiacion) dolor.push(`con irradiación a ${valores.irradiacion}`);
    if (valores.duracion_episodios) dolor.push(`con episodios de ${valores.duracion_episodios}`);
    if (valores.frecuencia) dolor.push(`de presentación ${valores.frecuencia.toLowerCase()}`);
    if (dolor.length) partes.push(`Dolor ${unirNatural(dolor)}.`);

    const factores = [];
    if (valores.factores_agravantes) factores.push(`se exacerba con ${valores.factores_agravantes}`);
    if (valores.factores_aliviantes) factores.push(`mejora con ${valores.factores_aliviantes}`);
    if (factores.length) partes.push(`${unirNatural(factores)}.`);

    if (valores.relacion_menstruacion) {
      const relacion = normalizar(valores.relacion_menstruacion);
      const frasesMenstruales = {
        antes: 'El dolor presenta predominio premenstrual.',
        'antes de la menstruacion': 'El dolor presenta predominio premenstrual.',
        durante: 'El dolor se presenta durante la menstruación.',
        'durante la menstruacion': 'El dolor se presenta durante la menstruación.',
        despues: 'El dolor se presenta posterior a la menstruación.',
        'despues de la menstruacion': 'El dolor se presenta posterior a la menstruación.'
      };

      if (relacion === 'sin relacion') partes.push('Sin relación con el ciclo menstrual.');
      else if (relacion === 'no puede precisar') partes.push('No puede precisar relación con la menstruación.');
      else if (frasesMenstruales[relacion]) partes.push(frasesMenstruales[relacion]);
      else partes.push(`Refiere relación con la menstruación: ${valores.relacion_menstruacion.toLowerCase()}.`);
    }

    if (valores.relacion_sexual) {
      const relacion = normalizar(valores.relacion_sexual);
      if (relacion === 'sin relacion') partes.push('Sin relación aparente con las relaciones sexuales.');
      else if (!['no aplica', 'no puede precisar'].includes(relacion)) partes.push(`Refiere relación con las relaciones sexuales: ${valores.relacion_sexual.toLowerCase()}.`);
    }

    const caracteristicas = [];
    const color = normalizar(valores.color);
    const coloresClinicos = {
      blanco: 'blanquecino',
      transparente: 'transparente',
      amarillo: 'amarillento',
      verdoso: 'verdoso',
      grisaceo: 'grisáceo',
      marron: 'marronáceo',
      sanguinolento: 'sanguinolento'
    };

    if (valores.color) caracteristicas.push(`flujo ${coloresClinicos[color] || valores.color.toLowerCase()}`);
    if (valores.cantidad) caracteristicas.push(`de ${valores.cantidad.toLowerCase()} cantidad`);
    if (valores.consistencia) caracteristicas.push(`de consistencia ${valores.consistencia.toLowerCase()}`);
    if (valores.olor) {
      const olor = normalizar(valores.olor);
      caracteristicas.push(olor === 'sin olor' ? 'sin olor' : `de olor ${valores.olor.toLowerCase()}`);
    }
    if (caracteristicas.length) partes.push(`Refiere ${caracteristicas.join(', ')}.`);

    if (valores.sintomas_asociados) {
      const asociados = normalizar(valores.sintomas_asociados);
      const niegaAsociados = [
        'no',
        'ninguno',
        'ninguna',
        'niega',
        'niega asociados',
        'niega sintomas asociados',
        'sin asociados',
        'sin sintomas asociados'
      ].includes(asociados);

      if (niegaAsociados) partes.push('Niega síntomas asociados relevantes.');
      else partes.push(`Refiere como síntomas asociados ${valores.sintomas_asociados}.`);
    }

    const etiquetasClinicas = {
      prurito: 'prurito vulvovaginal',
      ardor: 'ardor vulvovaginal',
      disuria: 'disuria',
      dolor_pelvico: 'dolor pélvico',
      flujo_vaginal: 'flujo vaginal anormal',
      sangrado_vaginal: 'sangrado vaginal',
      sangrado_postcoital: 'sangrado postcoital',
      fiebre: 'fiebre',
      mareo_sincope: 'mareo intenso o síncope',
      relaciones_sin_proteccion: 'relaciones sexuales sin protección',
      nueva_pareja: 'nueva pareja sexual'
    };

    const positivos = [];
    const negativos = [];

    Object.entries(etiquetasClinicas).forEach(([id, etiqueta]) => {
      const valor = normalizar(valores[id]);
      if (['si', 'presente', 'presentes', 'positivo'].includes(valor)) positivos.push(etiqueta);
      if (['no', 'ausente', 'ausentes', 'negativo'].includes(valor)) negativos.push(etiqueta);
    });

    if (positivos.length) partes.push(`Asocia ${unirNatural(positivos)}.`);
    if (negativos.length) partes.push(`Niega ${unirNatural(negativos)}.`);

    const embarazoValor = valores.posibilidad_embarazo || valores.embarazo_posible;
    if (embarazoValor) {
      const embarazo = normalizar(embarazoValor);
      if (embarazo === 'si') partes.push('Refiere posibilidad de embarazo.');
      else if (['por confirmar', 'no sabe', 'desconoce'].includes(embarazo)) partes.push('Posibilidad de embarazo no definida, pendiente de confirmación.');
      else if (embarazo === 'no') partes.push('Niega posibilidad de embarazo.');
    }

    if (valores.fecha_ultima_menstruacion) {
      partes.push(`Fecha de última menstruación: ${valores.fecha_ultima_menstruacion}.`);
    }

    if (valores.tratamientos_previos) {
      const tratamiento = normalizar(valores.tratamientos_previos);
      if (['no', 'ninguno', 'ninguna', 'sin tratamiento', 'sin tratamientos'].includes(tratamiento)) {
        partes.push('Niega tratamientos previos.');
      } else if (['si', 'presente', 'presentes'].includes(tratamiento)) {
        partes.push('Ha recibido tratamiento previo, sin detalle consignado.');
      } else {
        partes.push(`Refiere tratamiento previo: ${valores.tratamientos_previos}.`);
      }
    }

    return partes
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\.\./g, '.')
      .replace(/\s+\./g, '.')
      .trim();
  }

  /* ============================================================
     IASYN 3.6.14 - SÍNTOMAS COMPLEMENTARIOS DE ANAMNESIS
     Intervención localizada:
     - Convierte los controles ginSint* y obsSint* en narrativa clínica.
     - No cambia sus IDs, almacenamiento ni relación por id_atencion.
     - No modifica plantillas, backend, botones ni otros módulos.
     ============================================================ */
  function auroUnirSintomasClinicos(lista) {
    const valores = [...new Set((lista || []).map(texto).filter(Boolean))];
    if (!valores.length) return '';
    if (valores.length === 1) return valores[0];
    if (valores.length === 2) return `${valores[0]} y ${valores[1]}`;
    return `${valores.slice(0, -1).join(', ')} y ${valores.at(-1)}`;
  }

  function auroGenerarNarrativaSintomasComplementarios() {
    const ginecologicos = [];
    const obstetricos = [];

    const mapaGinecologico = {
      ginSintDolorPelvico: 'dolor pélvico',
      ginSintSangrado: 'sangrado anormal',
      ginSintLeucorrea: 'leucorrea',
      ginSintPrurito: 'prurito',
      ginSintDisuria: 'disuria',
      ginSintDispareunia: 'dispareunia',
      ginSintAmenorrea: 'amenorrea',
      ginSintDismenorrea: 'dismenorrea',
      ginSintMasa: 'sensación de masa',
      ginSintSequedad: 'sequedad vaginal',
      ginSintIncontinencia: 'incontinencia',
      ginSintMenopausia: 'síntomas menopáusicos'
    };

    const mapaObstetrico = {
      obsSintSangrado: 'sangrado vaginal',
      obsSintPerdidaLiquido: 'pérdida de líquido',
      obsSintDolorPelvico: 'dolor pélvico',
      obsSintContracciones: 'contracciones',
      obsSintCefalea: 'cefalea',
      obsSintFosfenos: 'fosfenos',
      obsSintTinnitus: 'tinnitus',
      obsSintEpigastralgia: 'epigastralgia',
      obsSintDisuria: 'disuria'
    };

    Object.entries(mapaGinecologico).forEach(([id, etiqueta]) => {
      if ($(id)?.checked) ginecologicos.push(etiqueta);
    });

    Object.entries(mapaObstetrico).forEach(([id, etiqueta]) => {
      if ($(id)?.checked) obstetricos.push(etiqueta);
    });

    const partes = [];

    if (ginecologicos.length) {
      partes.push(
        `Como síntomas ginecológicos refiere ${auroUnirSintomasClinicos(ginecologicos)}.`
      );
    }

    const descripcionGinecologica = texto($('ginSintDescripcion')?.value);
    if (descripcionGinecologica) {
      partes.push(`Descripción ginecológica: ${descripcionGinecologica}.`);
    }

    if (obstetricos.length) {
      partes.push(
        `Como síntomas obstétricos refiere ${auroUnirSintomasClinicos(obstetricos)}.`
      );
    }

    const otrosObstetricos = texto($('obsSintOtros')?.value);
    if (otrosObstetricos) {
      partes.push(`Otros síntomas obstétricos: ${otrosObstetricos}.`);
    }

    const descripcionObstetrica = texto($('obsSintDescripcion')?.value);
    if (descripcionObstetrica) {
      partes.push(`Descripción obstétrica: ${descripcionObstetrica}.`);
    }

    return partes
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\.\./g, '.')
      .replace(/\s+\./g, '.')
      .trim();
  }

  function generar() {
    if (!state.plantillaActiva) {
      estado('Seleccione primero una plantilla.', 'warn');
      return;
    }

    const respuestas = leerRespuestas();
    const faltantes = validarObligatorios(respuestas);

    if (faltantes.length) {
      estado(
        `Complete los campos obligatorios: ${faltantes.map(item => item.label).join(', ')}.`,
        'warn'
      );
      return;
    }

    const narrativaBase = generarNarrativa(state.plantillaActiva, respuestas);
    const narrativaComplementaria = auroGenerarNarrativaSintomasComplementarios();
    const narrativa = [narrativaBase, narrativaComplementaria]
      .map(texto)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const enfermedad = $('hcEnfermedadActual');

    if (!enfermedad) {
      estado('No se encontró el campo Enfermedad actual.', 'warn');
      return;
    }

    if (texto(enfermedad.value) && texto(enfermedad.value) !== narrativa) {
      const reemplazar = confirm('Enfermedad actual ya contiene información. ¿Desea reemplazarla?');
      if (!reemplazar) {
        estado('Se conservó el texto existente.', 'warn');
        return;
      }
    }

    enfermedad.value = narrativa;
    enfermedad.dispatchEvent(new Event('input', { bubbles: true }));
    enfermedad.dispatchEvent(new Event('change', { bubbles: true }));

    state.narrativa = narrativa;

    estado('Enfermedad actual generada. Revise el texto antes de guardar.', 'ok');
    enfermedad.focus();
    enfermedad.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.dispatchEvent(new CustomEvent('auro:anamnesis-generada', {
      detail: {
        tipo: 'plantilla_dinamica',
        version: VERSION,
        id_plantilla_anamnesis: idPlantilla(state.plantillaActiva),
        nombre_plantilla: nombrePlantilla(state.plantillaActiva),
        respuestas,
        narrativa
      }
    }));
  }

  function limpiar() {
    $('auroDynamicAnamnesisFields')
      ?.querySelectorAll('input, select, textarea')
      .forEach(control => {
        if (control.type === 'checkbox' || control.type === 'radio') {
          control.checked = false;
        } else {
          control.value = '';
        }
      });

    state.respuestas = {};
    estado('Formulario limpio.', 'info');
  }

  async function cargarPlantillas(forzar = false) {
    if (state.cargando) return;
    if (state.cargado && !forzar) return;

    state.cargando = true;
    estado('Cargando catálogo de plantillas…', 'info');

    const selector = $('auroPlantillaAnamnesisSelect');
    if (selector) {
      selector.disabled = true;
      selector.innerHTML = '<option value="">Cargando plantillas…</option>';
    }

    try {
      let respuesta;

      try {
        respuesta = await consultarAccion('listarPlantillasAnamnesisActivas');
      } catch (errorActivas) {
        console.warn('IASYN Anamnesis: listado activo no disponible.', errorActivas);
        respuesta = await consultarAccion('listarPlantillasAnamnesis');
      }

      const plantillas = normalizarRespuesta(respuesta)
        .filter(item => item && typeof item === 'object')
        .filter(plantillaActiva)
        .filter(item => idPlantilla(item));

      if (!plantillas.length) {
        throw new Error('El backend no devolvió plantillas activas.');
      }

      state.plantillas = plantillas;
      state.cargado = true;
      state.plantillaActiva = null;
      state.preguntas = [];

      llenarSelector();
      estado(
        `${plantillas.length} plantillas activas disponibles. Escriba el motivo o seleccione una plantilla.`,
        'ok'
      );

      detectar();
      console.info(`IASYN Anamnesis v${VERSION}: ${plantillas.length} plantillas cargadas.`);
    } catch (error) {
      state.cargado = false;
      state.plantillas = [];
      state.plantillaActiva = null;
      state.preguntas = [];

      if (selector) {
        selector.disabled = true;
        selector.innerHTML = '<option value="">No se pudieron cargar las plantillas</option>';
      }

      $('auroAbrirAnamnesis').disabled = true;
      $('auroDynamicAnamnesisPanel')?.classList.remove('show');

      estado(
        'No se pudo cargar plantillas_anamnesis. Revise la publicación de Apps Script y vuelva a actualizar.',
        'warn'
      );
      console.error('IASYN Anamnesis: error al cargar plantillas.', error);
    } finally {
      state.cargando = false;
    }
  }


  /* ============================================================
     IASYN ANAMNESIS v3.6.0
     CONEXIÓN QUIRÚRGICA POR id_atencion
     ------------------------------------------------------------
     Este bloque agrega aislamiento, guardado y restauración por
     consulta sin modificar:
     - el asistente sindrómico;
     - el buscador y reconocimiento del motivo;
     - las plantillas dinámicas;
     - generarNarrativa();
     - crearBloqueSintomasActuales();
     - crearBloqueSintomasObstetricos();
     - botones, diseño o funcionamiento clínico ya existente.
  ============================================================ */

  const AURO_ANAMNESIS_STORAGE_KEY = 'iasyn_anamnesis_por_atencion_v1';

  function auroClonarAnamnesis(valor) {
    try {
      return JSON.parse(JSON.stringify(valor));
    } catch (error) {
      return valor;
    }
  }

  function auroLeerCacheAnamnesisLocal() {
    try {
      const raw = localStorage.getItem(AURO_ANAMNESIS_STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (error) {
      console.warn('IASYN Anamnesis: no se pudo leer el respaldo local.', error);
      return {};
    }
  }

  function auroGuardarCacheAnamnesisLocal(cache) {
    try {
      localStorage.setItem(
        AURO_ANAMNESIS_STORAGE_KEY,
        JSON.stringify(cache && typeof cache === 'object' ? cache : {})
      );
    } catch (error) {
      console.warn('IASYN Anamnesis: no se pudo guardar el respaldo local.', error);
    }
  }

  function auroLeerContextoMaestroAnamnesis() {
    let contexto = null;

    try {
      if (typeof window.getContextoAtencionActual === 'function') {
        contexto = window.getContextoAtencionActual();
      } else if (typeof window.obtenerContextoAtencionActual === 'function') {
        contexto = window.obtenerContextoAtencionActual();
      }
    } catch (error) {
      console.warn('IASYN Anamnesis: no se pudo leer el contexto maestro.', error);
    }

    if (!contexto || typeof contexto !== 'object') {
      try {
        if (typeof window.getAtencionActiva === 'function') {
          contexto = window.getAtencionActiva();
        } else if (typeof window.obtenerAtencionActiva === 'function') {
          contexto = window.obtenerAtencionActiva();
        }
      } catch (error) {
        console.warn('IASYN Anamnesis: no se pudo leer la atención activa.', error);
      }
    }

    return contexto && typeof contexto === 'object' ? contexto : {};
  }

  function auroObtenerIdAtencionAnamnesis() {
    /*
      3.6.16:
      La fuente maestra externa tiene prioridad sobre referencias internas
      antiguas. El estado interno solo se usa como respaldo cuando el núcleo
      todavía no expone un contexto utilizable.
    */
    const maestro = auroLeerContextoMaestroAnamnesis();
    const idMaestro = texto(
      maestro.id_atencion || maestro.idAtencion || maestro.atencion_id
    );

    if (idMaestro) return idMaestro;
    if (state.contextoInvalidado) return '';

    return texto(state.idAtencionActual);
  }

  function auroCrearTokenContextoAnamnesis() {
    return Object.freeze({
      id_atencion: texto(state.idAtencionActual),
      id_paciente: texto(state.idPacienteActual),
      id_historia: texto(state.idHistoriaActual),
      epoch: Number(state.contextoEpoch || 0)
    });
  }

  function auroTokenContextoValido(token, exigirMaestro = true) {
    if (!token || state.contextoInvalidado) return false;

    const idAtencion = texto(token.id_atencion);
    if (!idAtencion) return false;

    if (Number(token.epoch) !== Number(state.contextoEpoch || 0)) return false;
    if (idAtencion !== texto(state.idAtencionActual)) return false;

    const pacienteToken = texto(token.id_paciente);
    const historiaToken = texto(token.id_historia);

    if (pacienteToken && texto(state.idPacienteActual) &&
        pacienteToken !== texto(state.idPacienteActual)) {
      return false;
    }

    if (historiaToken && texto(state.idHistoriaActual) &&
        historiaToken !== texto(state.idHistoriaActual)) {
      return false;
    }

    if (!exigirMaestro) return true;

    const maestro = auroLeerContextoMaestroAnamnesis();
    const idMaestro = texto(
      maestro.id_atencion || maestro.idAtencion || maestro.atencion_id
    );
    const pacienteMaestro = texto(
      maestro.id_paciente || maestro.idPaciente || maestro.paciente_id
    );
    const historiaMaestra = texto(
      maestro.id_historia || maestro.idHistoria || maestro.historia_id
    );

    /*
      Si el núcleo ya expone un id_atencion, debe ser exactamente el mismo.
      No se permite que un estado viejo de Anamnesis "reconstruya" el contexto.
    */
    /*
      3.6.17 - CANDADO MAESTRO:
      Para autorizar un guardado remoto, Atenciones debe confirmar
      explícitamente la misma id_atencion. Un contexto maestro vacío ya no
      permite reutilizar silenciosamente el estado interno de Anamnesis.
    */
    if (!idMaestro || idMaestro !== idAtencion) return false;
    if (pacienteToken && pacienteMaestro && pacienteToken !== pacienteMaestro) return false;
    if (historiaToken && historiaMaestra && historiaToken !== historiaMaestra) return false;

    return true;
  }


  /* ============================================================
     IASYN ANAMNESIS v3.6.12
     REVALIDACIÓN NO BLOQUEANTE DE LA ATENCIÓN ACTIVA
     ------------------------------------------------------------
     - Solo exige id_atencion para guardar por consulta.
     - Completa id_paciente e id_historia cuando están disponibles.
     - No impide el guardado si esos datos descriptivos tardan en llegar.
     - No modifica Apps Script, Atenciones, Index ni Google Sheets.
  ============================================================ */

  function auroDormirContextoAnamnesis(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function auroRefrescarContextoAnamnesis() {
    const contexto = auroLeerContextoMaestroAnamnesis();

    const idAtencion = texto(
      contexto.id_atencion || contexto.idAtencion || contexto.atencion_id
    );
    const idPaciente = texto(
      contexto.id_paciente || contexto.idPaciente || contexto.paciente_id
    );
    const idHistoria = texto(
      contexto.id_historia || contexto.idHistoria || contexto.historia_id
    );

    /*
      3.6.16:
      Nunca se rellena un contexto maestro vacío con state.idAtencionActual.
      Esa realimentación era capaz de resucitar una atención vieja.
    */
    if (!idAtencion) {
      return state.contextoInvalidado ? '' : texto(state.idAtencionActual);
    }

    /*
      Si el núcleo ya cambió de atención pero todavía no llegó el evento de
      selección a Anamnesis, no mutamos el estado silenciosamente.
      El evento de transición es quien establece el nuevo contexto.
    */
    if (state.idAtencionActual && idAtencion !== state.idAtencionActual) {
      return idAtencion;
    }

    if (!state.idAtencionActual) state.idAtencionActual = idAtencion;
    if (idPaciente) state.idPacienteActual = idPaciente;
    if (idHistoria) state.idHistoriaActual = idHistoria;

    state.contextoAtencion = {
      ...state.contextoAtencion,
      ...contexto,
      id_atencion: idAtencion,
      id_paciente: idPaciente || state.idPacienteActual,
      id_historia: idHistoria || state.idHistoriaActual
    };

    return idAtencion;
  }

  async function auroEsperarIdAtencionAnamnesis(intentos = 5, esperaMs = 250) {
    for (let intento = 1; intento <= intentos; intento += 1) {
      const idAtencion = auroRefrescarContextoAnamnesis();
      if (idAtencion) return idAtencion;
      if (intento < intentos) await auroDormirContextoAnamnesis(esperaMs);
    }
    return '';
  }

  function auroClaveControlAnamnesis(control, indice) {
    if (!control) return '';
    if (control.id) return 'id:' + control.id;
    if (control.dataset?.auroQuestion) {
      const valor = control.type === 'radio' || control.type === 'checkbox'
        ? ':' + texto(control.value)
        : '';
      return 'question:' + control.dataset.auroQuestion + valor;
    }
    if (control.name) {
      const valor = control.type === 'radio' || control.type === 'checkbox'
        ? ':' + texto(control.value)
        : '';
      return 'name:' + control.name + valor;
    }
    return 'index:' + indice;
  }

  function auroCapturarControlesAnamnesis() {
    const panel = $('hc_anamnesis');
    if (!panel) return {};

    const salida = {};

    /*
      IASYN FIX QUIRÚRGICO - CONTROLES_JSON COMPACTO
      --------------------------------------------------
      Objetivo:
      - Mantener una sola fila por id_atencion.
      - No duplicar Motivo ni Enfermedad actual dentro de controles_json,
        porque ya tienen columnas propias en anamnesis_atenciones.
      - No guardar controles vacíos ni checkbox/radio desmarcados.
      - Conservar controles con contenido real necesarios para restauración.
      - Mantener compatibilidad de lectura con controles_json antiguos.
      - No modifica IDs, backend, Apps Script, fechas ni generador.
    */
    [...panel.querySelectorAll('input, select, textarea')].forEach((control, indice) => {
      if (!control || control.disabled || control.type === 'button' ||
          control.type === 'submit' || control.type === 'reset') return;

      if ([
        'hcMotivoConsulta',
        'hcEnfermedadActual',
        'auroPlantillaAnamnesisSelect'
      ].includes(control.id)) return;

      const clave = auroClaveControlAnamnesis(control, indice);
      if (!clave) return;

      const tipoControl = (control.type || control.tagName.toLowerCase()).toLowerCase();
      const esSeleccion = tipoControl === 'checkbox' || tipoControl === 'radio';

      if (esSeleccion && !control.checked) return;

      const valorControl = texto(control.value);
      if (!esSeleccion && !valorControl) return;

      salida[clave] = {
        tipo: control.type || control.tagName.toLowerCase(),
        valor: valorControl,
        checked: esSeleccion ? true : !!control.checked,
        cabecera_contexto: control.dataset?.auroCabeceraContexto === 'true'
      };
    });

    return salida;
  }

  function auroAplicarControlesAnamnesis(controles, dispararEventos = true) {
    const panel = $('hc_anamnesis');
    if (!panel || !controles || typeof controles !== 'object') return;

    [...panel.querySelectorAll('input, select, textarea')].forEach((control, indice) => {
      const clave = auroClaveControlAnamnesis(control, indice);
      const dato = controles[clave];
      if (!dato) return;

      if (control.type === 'checkbox' || control.type === 'radio') {
        control.checked = !!dato.checked;
      } else {
        control.value = dato.valor ?? '';
      }

      if (dato.cabecera_contexto === true) {
        control.dataset.auroValorConfirmadoAtencion = 'true';
      }

      if (dispararEventos) {
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function auroCapturarAnamnesisActual() {
    const idAtencion = texto(state.idAtencionActual);
    const usoGenerador = !!texto(state.narrativa);

    return {
      id_atencion: idAtencion,
      id_paciente: texto(state.idPacienteActual),
      id_historia: texto(state.idHistoriaActual),
      motivo_consulta: texto($('hcMotivoConsulta')?.value),
      enfermedad_actual: texto($('hcEnfermedadActual')?.value),
      id_plantilla_anamnesis: usoGenerador && state.plantillaActiva
        ? idPlantilla(state.plantillaActiva)
        : '',
      nombre_plantilla: usoGenerador && state.plantillaActiva
        ? nombrePlantilla(state.plantillaActiva)
        : '',
      respuestas_json: usoGenerador && state.plantillaActiva
        ? leerRespuestas()
        : { _modo_captura: 'manual' },
      narrativa_generada: usoGenerador ? texto(state.narrativa) : '',
      controles_json: auroCapturarControlesAnamnesis(),
      panel_abierto: !!$('auroDynamicAnamnesisPanel')?.classList.contains('show'),
      modulo_version: VERSION,
      actualizado_en: new Date().toISOString()
    };
  }

  function auroTieneContenidoAnamnesis(data) {
    if (!data) return false;

    const controlesConContenido = Object.values(data.controles_json || {}).some(item => {
      if (!item || typeof item !== 'object') return false;

      const tipo = texto(item.tipo).toLowerCase();

      /*
        IASYN 3.6.10:
        La cabecera editable (especialidad y tipo) se conserva por atención,
        pero no constituye contenido clínico para Diagnóstico o Integración.
      */
      if (item.cabecera_contexto === true) return false;

      /*
        CORRECCIÓN QUIRÚRGICA IASYN:
        Los checkbox y radio desmarcados conservan el valor técnico "on".
        Ese valor no representa información clínica y no debe provocar
        el guardado o restauración de una anamnesis vacía.
      */
      if (tipo === 'checkbox' || tipo === 'radio') {
        return item.checked === true;
      }

      return !!texto(item.valor);
    });

    return !!(
      texto(data.motivo_consulta) ||
      texto(data.enfermedad_actual) ||
      texto(data.id_plantilla_anamnesis) ||
      Object.keys(data.respuestas_json || {}).length ||
      controlesConContenido
    );
  }

  function guardarAnamnesisTemporal() {
    const idAtencion = texto(state.idAtencionActual);
    if (!idAtencion || state.restaurandoAtencion || state.contextoInvalidado) return null;

    const data = auroCapturarAnamnesisActual();
    data.id_atencion = idAtencion;

    state.cacheAtenciones[idAtencion] = auroClonarAnamnesis(data);

    const cacheLocal = auroLeerCacheAnamnesisLocal();
    cacheLocal[idAtencion] = auroClonarAnamnesis(data);
    auroGuardarCacheAnamnesisLocal(cacheLocal);

    return data;
  }

  function limpiarAnamnesisTemporal() {
    state.restaurandoAtencion = true;

    try {
      const motivo = $('hcMotivoConsulta');
      const enfermedad = $('hcEnfermedadActual');

      if (motivo) motivo.value = '';
      if (enfermedad) enfermedad.value = '';

      $('auroPlantillaAnamnesisSelect') && ($('auroPlantillaAnamnesisSelect').value = '');
      seleccionarPlantilla('', false);

      /*
        Se limpian únicamente controles dentro de Anamnesis.
        No se elimina, reemplaza ni reconstruye ningún bloque visual.
      */
      $('hc_anamnesis')
        ?.querySelectorAll('input, select, textarea')
        .forEach(control => {
          if (control.id === 'auroPlantillaAnamnesisSelect') return;
          if (control.type === 'button' || control.type === 'submit') return;
          if (control.dataset?.auroContextoAtencion === 'true') return;

          if (control.type === 'checkbox' || control.type === 'radio') {
            control.checked = false;
          } else {
            control.value = '';
          }
        });

      state.respuestas = {};
      state.narrativa = '';
      $('auroDynamicAnamnesisPanel')?.classList.remove('show');
      auroSincronizarCabeceraAtencion();
    } finally {
      state.restaurandoAtencion = false;
    }
  }

  async function auroEnviarAnamnesisSheets(data, token) {
    const api = obtenerApiUrl();

    if (!api || !data?.id_atencion || !auroTieneContenidoAnamnesis(data)) {
      return { success: false, omitido: true };
    }

    if (!auroTokenContextoValido(token, true)) {
      return {
        success: false,
        omitido: true,
        cancelado_contexto: true,
        id_atencion: texto(data.id_atencion)
      };
    }

    if (texto(data.id_atencion) !== texto(token.id_atencion)) {
      return {
        success: false,
        omitido: true,
        cancelado_contexto: true,
        id_atencion: texto(data.id_atencion)
      };
    }

    if (texto(token.id_paciente) &&
        texto(data.id_paciente) &&
        texto(token.id_paciente) !== texto(data.id_paciente)) {
      return { success: false, omitido: true, cancelado_contexto: true };
    }

    if (texto(token.id_historia) &&
        texto(data.id_historia) &&
        texto(token.id_historia) !== texto(data.id_historia)) {
      return { success: false, omitido: true, cancelado_contexto: true };
    }

    try {
      /*
        VALIDACIÓN INMEDIATA PRE-POST.
        Si el usuario cambió de consulta mientras se preparaba el payload,
        esta operación termina aquí y nunca llega a Apps Script.
      */
      if (!auroTokenContextoValido(token, true)) {
        return { success: false, omitido: true, cancelado_contexto: true };
      }

      await fetch(api, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          accion: 'guardarAnamnesisAtencion',
          data: {
            ...data,
            respuestas_json: JSON.stringify(data.respuestas_json || {}),
            controles_json: JSON.stringify(data.controles_json || {})
          }
        })
      });

      return { success: true };
    } catch (error) {
      console.warn('IASYN Anamnesis: respaldo remoto no disponible.', error);
      return { success: false, error };
    }
  }

  function auroOrdenarJsonAnamnesis(valor) {
    if (Array.isArray(valor)) {
      return valor.map(auroOrdenarJsonAnamnesis);
    }

    if (valor && typeof valor === 'object') {
      return Object.keys(valor)
        .sort()
        .reduce((salida, clave) => {
          salida[clave] = auroOrdenarJsonAnamnesis(valor[clave]);
          return salida;
        }, {});
    }

    return valor;
  }

  function auroFirmaAnamnesis(data) {
    data = data || {};

    return JSON.stringify(auroOrdenarJsonAnamnesis({
      id_atencion: texto(data.id_atencion),
      motivo_consulta: texto(data.motivo_consulta),
      enfermedad_actual: texto(data.enfermedad_actual),
      id_plantilla_anamnesis: texto(data.id_plantilla_anamnesis),
      narrativa_generada: texto(data.narrativa_generada),
      respuestas_json: data.respuestas_json || {},
      controles_json: data.controles_json || {}
    }));
  }

  async function auroConfirmarAnamnesisSheets(data, token, intentos = 4) {
    const idAtencion = texto(data?.id_atencion);
    if (!idAtencion || !auroTokenContextoValido(token, true)) return null;

    const firmaEsperada = auroFirmaAnamnesis(data);

    /*
      Confirmación remota real, pero desacoplada de la respuesta visual.
      Primera lectura inmediata y luego tres lecturas cortas, todas frescas.
    */
    const esperas = [0, 180, 450, 900];

    for (let intento = 0; intento < intentos; intento += 1) {
      if (!auroTokenContextoValido(token, true)) return null;

      const espera = esperas[intento] ?? 900;
      if (espera > 0) await auroDormirContextoAnamnesis(espera);

      if (!auroTokenContextoValido(token, true)) return null;

      const remoto = await auroBuscarAnamnesisSheets(idAtencion);
      if (remoto && auroFirmaAnamnesis(remoto) === firmaEsperada) {
        return remoto;
      }
    }

    return null;
  }

  async function auroProcesarGuardadoConfirmadoAnamnesis(idAtencion, mostrarEstado) {
    let ultimoResultado = { success: false, confirmado: false, id_atencion: idAtencion };

    while (state.guardadosRemotosPendientes[idAtencion]) {
      const pendiente = state.guardadosRemotosPendientes[idAtencion];
      delete state.guardadosRemotosPendientes[idAtencion];

      const data = auroClonarAnamnesis(pendiente?.data || {});
      const token = pendiente?.token || null;

      if (!auroTokenContextoValido(token, true) ||
          texto(data.id_atencion) !== texto(token?.id_atencion)) {
        ultimoResultado = {
          success: false, confirmado: false, cancelado_contexto: true, id_atencion: idAtencion
        };
        continue;
      }

      const firmaObjetivo = auroFirmaAnamnesis(data);
      state.firmaRemotaEnCursoPorAtencion[idAtencion] = firmaObjetivo;

      if (mostrarEstado) estado('Sincronizando anamnesis con Google Sheets…', 'info');

      /* Un cambio clínico real = un POST. La confirmación posterior solo lee. */
      /*
        IASYN 3.6.18-R2 - SEÑAL VISUAL, SIN PERSISTENCIA
        ---------------------------------------------------
        Informa al INDEX que YA comenzó el guardado real de esta firma.
        No escribe, no lee, no altera la cola, no modifica timestamps y
        no participa en la decisión clínica de guardar/no guardar.
      */
      try {
        window.dispatchEvent(new CustomEvent('aurosanax:anamnesis-sincronizando', {
          detail: {
            id_atencion: idAtencion,
            id_paciente: texto(token.id_paciente),
            id_historia: texto(token.id_historia),
            firma: firmaObjetivo
          }
        }));
      } catch (_) {}

      const envio = await auroEnviarAnamnesisSheets(data, token);
      const confirmado = envio?.success === true && auroTokenContextoValido(token, true)
        ? await auroConfirmarAnamnesisSheets(data, token, 4)
        : null;

      delete state.firmaRemotaEnCursoPorAtencion[idAtencion];

      ultimoResultado = {
        success: !!confirmado,
        confirmado: !!confirmado,
        cancelado_contexto: !auroTokenContextoValido(token, false),
        id_atencion: idAtencion,
        data,
        remoto: confirmado || envio
      };

      if (confirmado) {
        const confirmadoLocal = {
          ...data,
          actualizado_en: confirmado.actualizado_en || data.actualizado_en
        };

        state.cacheAtenciones[idAtencion] = auroClonarAnamnesis(confirmadoLocal);
        state.firmaPersistidaPorAtencion[idAtencion] = firmaObjetivo;
        state.cambiosUsuarioPorAtencion[idAtencion] = false;

        const cacheLocal = auroLeerCacheAnamnesisLocal();
        cacheLocal[idAtencion] = auroClonarAnamnesis(confirmadoLocal);
        auroGuardarCacheAnamnesisLocal(cacheLocal);

        if (state.guardadoVisualPorAtencion[idAtencion]) {
          state.guardadoVisualPorAtencion[idAtencion] = {
            ...state.guardadoVisualPorAtencion[idAtencion],
            confirmado: true,
            pendiente: false,
            actualizado_en_remoto: texto(confirmado.actualizado_en)
          };
        }

        try {
          window.dispatchEvent(new CustomEvent('aurosanax:anamnesis-confirmada', {
            detail: {
              id_atencion: idAtencion,
              id_paciente: texto(token.id_paciente),
              id_historia: texto(token.id_historia),
              firma: firmaObjetivo,
              actualizado_en: texto(confirmado.actualizado_en)
            }
          }));
        } catch (_) {}

        if (mostrarEstado && auroTokenContextoValido(token, false)) {
          estado('Anamnesis confirmada en Google Sheets.', 'ok');
        }
      } else if (auroTokenContextoValido(token, false)) {
        if (state.guardadoVisualPorAtencion[idAtencion]) {
          state.guardadoVisualPorAtencion[idAtencion] = {
            ...state.guardadoVisualPorAtencion[idAtencion],
            confirmado: false,
            pendiente: true
          };
        }

        try {
          window.dispatchEvent(new CustomEvent('aurosanax:anamnesis-sincronizacion-pendiente', {
            detail: {
              id_atencion: idAtencion,
              id_paciente: texto(token.id_paciente),
              id_historia: texto(token.id_historia),
              firma: firmaObjetivo
            }
          }));
        } catch (_) {}

        if (mostrarEstado) {
          estado('El contenido quedó en memoria local; la confirmación remota sigue pendiente.', 'warn');
        }
      }
    }

    return ultimoResultado;
  }

  async function auroGuardarDatosAnamnesisConfirmados(data, opciones = {}) {
    data = auroClonarAnamnesis(data || {});
    const idAtencion = texto(data.id_atencion);
    const token = opciones.token || auroCrearTokenContextoAnamnesis();

    if (!idAtencion || !auroTieneContenidoAnamnesis(data)) {
      return { success: false, omitido: true, id_atencion: idAtencion };
    }

    if (!auroTokenContextoValido(token, true) ||
        idAtencion !== texto(token.id_atencion)) {
      return {
        success: false,
        omitido: true,
        cancelado_contexto: true,
        id_atencion: idAtencion
      };
    }

    data.id_paciente = texto(token.id_paciente || data.id_paciente);
    data.id_historia = texto(token.id_historia || data.id_historia);

    const firmaSolicitada = auroFirmaAnamnesis(data);
    const firmaEnCurso = texto(state.firmaRemotaEnCursoPorAtencion[idAtencion]);
    const firmaPendiente = state.guardadosRemotosPendientes[idAtencion]
      ? auroFirmaAnamnesis(state.guardadosRemotosPendientes[idAtencion].data)
      : '';

    if (state.guardadosRemotosEnCurso[idAtencion] &&
        (firmaSolicitada === firmaEnCurso || firmaSolicitada === firmaPendiente)) {
      return state.guardadosRemotosEnCurso[idAtencion];
    }

    state.guardadosRemotosPendientes[idAtencion] = { data, token };

    if (state.guardadosRemotosEnCurso[idAtencion]) {
      return state.guardadosRemotosEnCurso[idAtencion];
    }

    const proceso = auroProcesarGuardadoConfirmadoAnamnesis(
      idAtencion,
      opciones.mostrarEstado === true
    ).finally(() => {
      delete state.guardadosRemotosEnCurso[idAtencion];
    });

    state.guardadosRemotosEnCurso[idAtencion] = proceso;
    return proceso;
  }

  async function guardarAnamnesisPorAtencion() {
    clearTimeout(state.guardadoPendiente);
    state.guardadoPendiente = null;

    if (state.contextoInvalidado) {
      return { success: false, message: 'La atención está cambiando. Los datos permanecen en pantalla.' };
    }

    const idAtencion = texto(state.idAtencionActual);
    const token = auroCrearTokenContextoAnamnesis();

    if (!idAtencion || !auroTokenContextoValido(token, true)) {
      return { success: false, message: 'No existe una atención activa sincronizada. Los datos permanecen en pantalla.' };
    }

    const data = guardarAnamnesisTemporal();
    if (!data) return { success: false, message: 'No existe una atención activa.' };

    data.id_atencion = idAtencion;
    data.id_paciente = texto(token.id_paciente);
    data.id_historia = texto(token.id_historia);

    const firmaActual = auroFirmaAnamnesis(data);
    const firmaPersistida = texto(state.firmaPersistidaPorAtencion[idAtencion]);
    const firmaEnCurso = texto(state.firmaRemotaEnCursoPorAtencion[idAtencion]);
    const firmaPendiente = state.guardadosRemotosPendientes[idAtencion]
      ? auroFirmaAnamnesis(state.guardadosRemotosPendientes[idAtencion].data)
      : '';

    /* Sin cambios reales: no POST y no movimiento de timestamp remoto. */
    if (firmaPersistida && firmaActual === firmaPersistida) {
      state.cambiosUsuarioPorAtencion[idAtencion] = false;
      estado('No hay cambios nuevos en Anamnesis.', 'ok');
      return {
        success: true, confirmado: true, sin_cambios: true, omitido: true, id_atencion: idAtencion
      };
    }

    const ahora = new Date().toISOString();

    state.guardadoVisualPorAtencion[idAtencion] = {
      firma: firmaActual,
      actualizado_en_local: ahora,
      confirmado: false,
      pendiente: true
    };

    try {
      window.dispatchEvent(new CustomEvent('aurosanax:anamnesis-guardado-local', {
        detail: {
          id_atencion: idAtencion,
          id_paciente: texto(token.id_paciente),
          id_historia: texto(token.id_historia),
          firma: firmaActual,
          actualizado_en: ahora,
          compartiendo_sincronizacion: firmaActual === firmaEnCurso || firmaActual === firmaPendiente
        }
      }));
    } catch (_) {}

    estado('Anamnesis guardada en memoria. Sincronizando con Google Sheets…', 'ok');

    /*
      Si el autosave ya sincroniza la misma firma, no se duplica el POST.
      Si no, se inicia la sincronización remota. En ambos casos el botón
      recibe respuesta inmediata porque no espera la latencia de Sheets.
    */
    if (!(firmaActual === firmaEnCurso || firmaActual === firmaPendiente)) {
      auroGuardarDatosAnamnesisConfirmados(
        data,
        { mostrarEstado: false, token }
      ).catch(error => {
        console.warn('IASYN Anamnesis: sincronización remota pendiente.', error);
      });
    }

    return {
      success: true,
      aceptado_localmente: true,
      pendiente_confirmacion: true,
      compartiendo_sincronizacion: firmaActual === firmaEnCurso || firmaActual === firmaPendiente,
      id_atencion: idAtencion,
      actualizado_en_local: ahora
    };
  }

  async function auroBuscarAnamnesisSheets(idAtencion) {
    try {
      const respuesta = await consultarAccion(
        'buscarAnamnesisPorAtencion',
        { id_atencion: idAtencion, _: Date.now() }
      );

      const registro = respuesta?.data || respuesta?.anamnesis || respuesta;
      if (!registro || Array.isArray(registro) || !texto(registro.id_atencion)) {
        return null;
      }

      return {
        ...registro,
        respuestas_json: parsearJsonSeguro(registro.respuestas_json, {}),
        controles_json: parsearJsonSeguro(registro.controles_json, {})
      };
    } catch (error) {
      console.warn('IASYN Anamnesis: se usará respaldo local.', error);
      return null;
    }
  }

  async function cargarAnamnesisTemporal(idAtencion, tokenContexto = null) {
    idAtencion = texto(idAtencion);
    if (!idAtencion) return false;

    const token = tokenContexto || auroCrearTokenContextoAnamnesis();
    if (texto(token.id_atencion) !== idAtencion ||
        !auroTokenContextoValido(token, false)) {
      return false;
    }

    const solicitud = ++state.solicitudCarga;

    let data = state.cacheAtenciones[idAtencion] || null;

    if (!data) {
      const cacheLocal = auroLeerCacheAnamnesisLocal();
      data = cacheLocal[idAtencion] || null;
    }

    const remoto = await auroBuscarAnamnesisSheets(idAtencion);

    if (solicitud !== state.solicitudCarga ||
        !auroTokenContextoValido(token, false)) {
      return false;
    }

    if (remoto) data = remoto;

    if (!data || !auroTieneContenidoAnamnesis(data)) {
      state.firmaPersistidaPorAtencion[idAtencion] = '';
      return false;
    }

    state.restaurandoAtencion = true;

    try {
      if (!state.cargado) {
        await cargarPlantillas(false);
      }

      if (solicitud !== state.solicitudCarga ||
          !auroTokenContextoValido(token, false)) {
        return false;
      }

      const idPlantillaGuardada = texto(data.id_plantilla_anamnesis);

      if (idPlantillaGuardada) {
        const selector = $('auroPlantillaAnamnesisSelect');
        if (selector) selector.value = idPlantillaGuardada;
        seleccionarPlantilla(idPlantillaGuardada, !!data.panel_abierto);
      } else {
        seleccionarPlantilla('', false);
      }

      if ($('hcMotivoConsulta')) $('hcMotivoConsulta').value = texto(data.motivo_consulta);
      if ($('hcEnfermedadActual')) $('hcEnfermedadActual').value = texto(data.enfermedad_actual);

      crearBloqueSintomasActuales();
      crearBloqueSintomasObstetricos();

      const controlesGuardados = data.controles_json || {};
      auroAplicarControlesAnamnesis(controlesGuardados, false);

      requestAnimationFrame(() => {
        if (solicitud !== state.solicitudCarga ||
            !auroTokenContextoValido(token, false)) return;

        crearBloqueSintomasActuales();
        crearBloqueSintomasObstetricos();
        auroAplicarControlesAnamnesis(controlesGuardados, false);
      });

      setTimeout(() => {
        if (solicitud !== state.solicitudCarga ||
            !auroTokenContextoValido(token, false)) return;

        crearBloqueSintomasActuales();
        crearBloqueSintomasObstetricos();
        auroAplicarControlesAnamnesis(controlesGuardados, false);
      }, 120);

      state.respuestas = auroClonarAnamnesis(data.respuestas_json || {});
      state.narrativa = texto(data.narrativa_generada);

      if (data.panel_abierto) {
        $('auroDynamicAnamnesisPanel')?.classList.add('show');
      }

      state.cacheAtenciones[idAtencion] = auroClonarAnamnesis(data);
      state.firmaPersistidaPorAtencion[idAtencion] = auroFirmaAnamnesis(data);

      const cacheLocal = auroLeerCacheAnamnesisLocal();
      cacheLocal[idAtencion] = auroClonarAnamnesis(data);
      auroGuardarCacheAnamnesisLocal(cacheLocal);

      state.cambiosUsuarioPorAtencion[idAtencion] = false;

      return true;
    } finally {
      state.restaurandoAtencion = false;
    }
  }

  async function cambiarAnamnesisPorAtencion(idAtencion, detalle = {}) {
    idAtencion = texto(idAtencion || detalle.id_atencion);
    if (!idAtencion) return false;

    const anterior = texto(state.idAtencionActual);

    /*
      Mismo id: no existe transición clínica.
      Solo refresca la cabecera, sin limpiar, sin guardar y sin alterar epoch.
    */
    if (anterior === idAtencion && !state.contextoInvalidado) {
      auroSincronizarCabeceraAtencion(detalle);
      return true;
    }

    /*
      TRANSICIÓN REAL A -> B
      ----------------------------------------------------------
      1. Cancela autosave programado de A.
      2. Invalida inmediatamente todos los tokens/callbacks de A.
      3. NO ejecuta ningún POST de A por cambiar de consulta.
      4. Establece B y recién entonces permite nuevos guardados.
    */
    clearTimeout(state.guardadoPendiente);
    state.guardadoPendiente = null;

    state.contextoInvalidado = true;
    state.contextoEpoch += 1;
    state.solicitudCarga += 1;

    if (anterior) {
      delete state.guardadosRemotosPendientes[anterior];
      delete state.firmaRemotaEnCursoPorAtencion[anterior];
      state.cambiosUsuarioPorAtencion[anterior] = false;
    }

    const contextoMaestro = auroLeerContextoMaestroAnamnesis();

    const pacienteNuevo = texto(
      detalle.id_paciente ||
      detalle.idPaciente ||
      (
        texto(contextoMaestro.id_atencion || contextoMaestro.idAtencion || contextoMaestro.atencion_id) === idAtencion
          ? (contextoMaestro.id_paciente || contextoMaestro.idPaciente || contextoMaestro.paciente_id)
          : ''
      )
    );

    const historiaNueva = texto(
      detalle.id_historia ||
      detalle.idHistoria ||
      (
        texto(contextoMaestro.id_atencion || contextoMaestro.idAtencion || contextoMaestro.atencion_id) === idAtencion
          ? (contextoMaestro.id_historia || contextoMaestro.idHistoria || contextoMaestro.historia_id)
          : ''
      )
    );

    state.idAtencionActual = idAtencion;
    state.idPacienteActual = pacienteNuevo;
    state.idHistoriaActual = historiaNueva;
    state.contextoAtencion = {};

    window.auroAtencionSeleccionadaId = idAtencion;

    auroLimpiarCabeceraAtencion();

    state.contextoAtencion = auroExtraerContextoAtencion({
      ...detalle,
      id_atencion: idAtencion,
      id_paciente: pacienteNuevo,
      id_historia: historiaNueva
    });

    /*
      Desde aquí el nuevo contexto ya es válido.
      El token de B tendrá un epoch distinto a cualquier trabajo previo.
    */
    state.contextoInvalidado = false;
    const tokenNuevo = auroCrearTokenContextoAnamnesis();

    auroSincronizarCabeceraAtencion(detalle);
    limpiarAnamnesisTemporal();

    if (!auroTokenContextoValido(tokenNuevo, false)) return false;

    const cargada = await cargarAnamnesisTemporal(idAtencion, tokenNuevo);

    if (!auroTokenContextoValido(tokenNuevo, false)) {
      return false;
    }

    if (!cargada) {
      state.cambiosUsuarioPorAtencion[idAtencion] = false;
      state.firmaPersistidaPorAtencion[idAtencion] = '';
    }

    auroSincronizarCabeceraAtencion(detalle);

    estado(
      cargada
        ? 'Anamnesis restaurada para la atención seleccionada.'
        : 'Nueva atención: anamnesis lista para registrar.',
      cargada ? 'ok' : 'info'
    );

    return cargada;
  }

  function auroProgramarGuardadoAnamnesis(evento) {
    if (state.restaurandoAtencion || state.contextoInvalidado) return;

    const objetivo = evento?.target || null;
    if (objetivo?.dataset?.auroAsignandoContexto === 'true') return;

    /*
      Fecha, médico, especialidad y tipo son contexto de la atención.
      Su sincronización no constituye una edición clínica de Anamnesis.
    */
    if (objetivo?.dataset?.auroCabeceraContexto === 'true') return;

    const token = auroCrearTokenContextoAnamnesis();
    const idAtencionActual = texto(token.id_atencion);

    if (!idAtencionActual || !auroTokenContextoValido(token, true)) return;

    state.cambiosUsuarioPorAtencion[idAtencionActual] = true;

    clearTimeout(state.guardadoPendiente);
    state.guardadoPendiente = setTimeout(async () => {
      /*
        El token nació con la edición. Si el usuario ya cambió de consulta,
        el epoch o los ids dejan de coincidir y el callback muere aquí.
      */
      if (!auroTokenContextoValido(token, true)) return;
      if (state.cambiosUsuarioPorAtencion[idAtencionActual] !== true) return;

      const data = guardarAnamnesisTemporal();
      if (!data || !auroTieneContenidoAnamnesis(data)) return;

      data.id_atencion = idAtencionActual;
      data.id_paciente = texto(token.id_paciente);
      data.id_historia = texto(token.id_historia);

      /*
        3.6.17:
        Un input/change programático que no alteró realmente el contenido
        clínico no genera POST ni modifica actualizado_en.
      */
      const firmaActual = auroFirmaAnamnesis(data);
      const firmaPersistida = texto(
        state.firmaPersistidaPorAtencion[idAtencionActual]
      );

      if (firmaPersistida && firmaActual === firmaPersistida) {
        state.cambiosUsuarioPorAtencion[idAtencionActual] = false;
        return;
      }

      if (!auroTokenContextoValido(token, true)) return;

      const resultado = await auroGuardarDatosAnamnesisConfirmados(
        data,
        { mostrarEstado: false, token }
      );

      if (resultado && resultado.success &&
          auroTokenContextoValido(token, false)) {
        state.cambiosUsuarioPorAtencion[idAtencionActual] = false;
      }
    }, 700);
  }

  /*
    COMPATIBILIDAD TEMPORAL IASYN:
    Los eventos literales "aurosanax:*" se conservan como contrato interno entre
    módulos ya existentes. No son URLs, endpoints, IDs ni conexiones con
    AUROSANAX PRUEBA. No deben renombrarse aisladamente hasta migrar también
    todos sus emisores y receptores.
  */

  function auroInstalarSincronizacionAtencion() {
    if (window.__auroAnamnesisEventosAtencionInstalados) return;
    window.__auroAnamnesisEventosAtencionInstalados = true;

    const manejar = evento => {
      const detalle = evento?.detail || {};
      cambiarAnamnesisPorAtencion(detalle.id_atencion, detalle)
        .catch(error => {
          console.error('IASYN Anamnesis: error al cambiar de atención.', error);
        });
    };

    window.addEventListener('aurosanax:atencion-iniciada', manejar);
    window.addEventListener('aurosanax:atencion-seleccionada', manejar);

    window.addEventListener('aurosanax:atencion-limpiada', () => {
      clearTimeout(state.guardadoPendiente);
      state.guardadoPendiente = null;

      state.contextoInvalidado = true;
      state.contextoEpoch += 1;
      state.solicitudCarga += 1;

      const anterior = texto(state.idAtencionActual);
      if (anterior) {
        delete state.guardadosRemotosPendientes[anterior];
        delete state.firmaRemotaEnCursoPorAtencion[anterior];
        state.cambiosUsuarioPorAtencion[anterior] = false;
      }

      /*
        También se eliminan pendientes huérfanos de cualquier atención.
        Un cambio de contexto no debe permitir que una cola antigua sobreviva.
      */
      state.guardadosRemotosPendientes = {};

      state.idAtencionActual = '';
      state.idPacienteActual = '';
      state.idHistoriaActual = '';
      state.contextoAtencion = {};
      window.auroAtencionSeleccionadaId = '';
    });

    const sincronizarContexto = evento => {
      auroSincronizarCabeceraAtencion(evento?.detail || {});
    };

    window.addEventListener('aurosanax:atencion-actualizada', sincronizarContexto);
    window.addEventListener('aurosanax:datos-generales-actualizados', sincronizarContexto);

    $('hc_anamnesis')?.addEventListener('input', auroProgramarGuardadoAnamnesis);
    $('hc_anamnesis')?.addEventListener('change', auroProgramarGuardadoAnamnesis);

    window.addEventListener('beforeunload', () => {
      guardarAnamnesisTemporal();
    });
  }

  function obtenerDatosAnamnesis() {
    const usoGenerador = !!texto(state.narrativa);

    return {
      id_atencion: auroObtenerIdAtencionAnamnesis(),
      id_paciente: texto(state.idPacienteActual),
      id_historia: texto(state.idHistoriaActual),
      motivo_consulta: texto($('hcMotivoConsulta')?.value),
      enfermedad_actual: texto($('hcEnfermedadActual')?.value),
      revision_sistemas: '',
      sintomas_alarma: '',
      id_plantilla_anamnesis: usoGenerador && state.plantillaActiva
        ? idPlantilla(state.plantillaActiva)
        : '',
      nombre_plantilla: usoGenerador && state.plantillaActiva
        ? nombrePlantilla(state.plantillaActiva)
        : '',
      respuestas_json: usoGenerador && state.plantillaActiva
        ? leerRespuestas()
        : { _modo_captura: 'manual' },
      narrativa_generada: usoGenerador ? texto(state.narrativa) : '',
      modulo_version: VERSION
    };
  }

  function inicializar() {
    if (state.inicializado) return true;

    if (
      !$('hc_anamnesis') ||
      !$('hcMotivoConsulta') ||
      !$('hcEnfermedadActual')
    ) {
      return false;
    }

    instalarEstilos();
    ocultarCamposDuplicados();
    crearInterfaz();
    crearBloqueSintomasActuales();
    crearBloqueSintomasObstetricos();

    state.inicializado = true;
    auroInstalarSincronizacionAtencion();
    auroSincronizarCabeceraAtencion();
    cargarPlantillas(false);

    console.info(`IASYN Anamnesis v${VERSION}: inicializado.`);
    return true;
  }

  window.auroAnamnesis = {
    version: VERSION,
    inicializar,
    cargarPlantillas,
    detectar,
    seleccionarPlantilla,
    abrir,
    cerrar,
    generar,
    limpiar,
    crearBloqueSintomasActuales,
    crearBloqueSintomasObstetricos,
    obtenerDatosAnamnesis,
    cambiarAnamnesisPorAtencion,
    guardarAnamnesisTemporal,
    cargarAnamnesisTemporal,
    limpiarAnamnesisTemporal,
    guardarAnamnesisPorAtencion,
    sincronizarCabeceraAtencion: auroSincronizarCabeceraAtencion,
    obtenerContextoSeguro: () => {
      const maestro = auroLeerContextoMaestroAnamnesis();
      return {
        id_atencion: texto(state.idAtencionActual),
        id_paciente: texto(state.idPacienteActual),
        id_historia: texto(state.idHistoriaActual),
        epoch: Number(state.contextoEpoch || 0),
        invalidado: !!state.contextoInvalidado,
        id_atencion_maestra: texto(
          maestro?.id_atencion || maestro?.idAtencion || maestro?.atencion_id
        ),
        firma_persistida: texto(
          state.firmaPersistidaPorAtencion[state.idAtencionActual]
        ),
        guardado_visual: auroClonarAnamnesis(
          state.guardadoVisualPorAtencion[state.idAtencionActual] || null
        )
      };
    }
  };

  window.inicializarAnamnesis = inicializar;
  window.auroObtenerDatosAnamnesis = obtenerDatosAnamnesis;
  window.cambiarAnamnesisPorAtencion = cambiarAnamnesisPorAtencion;
  window.guardarAnamnesisPorAtencion = guardarAnamnesisPorAtencion;

  if (!inicializar()) {
    let intentos = 0;
    const temporizador = setInterval(() => {
      intentos += 1;
      if (inicializar() || intentos >= 20) {
        clearInterval(temporizador);
      }
    }, 300);
  }
})();
