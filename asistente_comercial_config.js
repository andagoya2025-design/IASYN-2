/**
 * ============================================================
 * ASISTENTE COMERCIAL
 * Archivo: asistente_comercial_config.js
 * Versión: 1.0.0
 * Tipo: Configuración independiente / reutilizable
 * ============================================================
 *
 * OBJETIVO
 * Centralizar toda la configuración editable del Asistente Comercial
 * sin acoplar el motor al ERP, a módulos clínicos ni a un negocio concreto.
 *
 * REGLAS DE DISEÑO
 * - No contiene lógica clínica.
 * - No modifica pacientes, historia clínica, atenciones, agenda, caja o seguridad.
 * - No realiza peticiones remotas.
 * - No guarda mensajes pegados.
 * - Puede reutilizarse en otros negocios cambiando esta configuración.
 * - Las plantillas iniciales sirven como fallback/local bootstrap.
 * - La base persistente futura podrá vivir en una sola hoja:
 *   ASISTENTE_COMERCIAL
 *
 * FECHAS
 * - Zona oficial: America/Guayaquil
 * - Persistencia futura recomendada: ISO 8601 con offset -05:00
 *
 * ============================================================
 */

(function (global) {
  "use strict";

  const CONFIG = {
    schemaVersion: 1,
    appVersion: "1.0.0",

    app: {
      id: "asistente_comercial",
      name: "Asistente Comercial",
      shortName: "Asistente",
      description:
        "Generador rápido de respuestas comerciales mediante plantillas reutilizables.",
      locale: "es-EC",
      timezone: "America/Guayaquil",
      defaultDateDisplay: "DD/MM/YYYY HH:mm",
      defaultDateStorage: "ISO8601_OFFSET",
      mode: "LOCAL_FIRST",
      persistPastedMessages: false,
      enableAI: false,
      enableCRM: false,
      enableAutomaticMessaging: false
    },

    business: {
      /**
       * Esta sección es específica del cliente.
       * El motor NO debe depender de estos valores.
       */
      businessType: "CONSULTORIO_MEDICO",
      displayName: "",
      publicBrandName: "",
      city: "Guayaquil",
      country: "Ecuador",
      address:
        "Edificio Ágora 21, sector Mall del Sol, Guayaquil, Ecuador.",
      neverMentionCities: ["Quito"],
      appointmentUrl: "https://iasyn.fyi/formulariocitas.html",
      defaultChannel: "GENERAL"
    },

    ui: {
      title: "Asistente Comercial",
      subtitle: "Respuestas rápidas, claras y listas para copiar.",
      pastePlaceholder: "Pega aquí el mensaje recibido...",
      searchPlaceholder: "Buscar plantilla...",
      responsePlaceholder: "La respuesta sugerida aparecerá aquí...",
      copyLabel: "Copiar respuesta",
      clearLabel: "Limpiar",
      newTemplateLabel: "Nueva plantilla",
      editTemplateLabel: "Editar plantilla",
      favoriteLabel: "Favoritos",
      mostUsedLabel: "Más usadas",
      emptyMessage:
        "Pega un mensaje o selecciona una categoría para comenzar.",
      noMatchMessage:
        "No encontré una coincidencia clara. Selecciona una categoría manualmente.",
      copySuccessMessage: "Respuesta copiada.",
      copyErrorMessage:
        "No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente."
    },

    behavior: {
      defaultScope: "PROSPECTO",
      defaultStatus: "ACTIVO",
      defaultChannel: "GENERAL",
      maxSuggestions: 5,
      minKeywordLength: 2,
      normalizeAccents: true,
      caseInsensitive: true,
      trimInput: true,
      preferExactCategory: true,
      preferHigherPriority: true,
      allowManualCategoryOverride: true,
      allowResponseEditBeforeCopy: true,
      clearInputAfterCopy: false,
      loadTemplatesOnce: true,
      localSearch: true,
      remoteSearchPerKeystroke: false
    },

    scopes: [
      {
        id: "PROSPECTO",
        label: "Prospectos",
        enabled: true,
        order: 10
      },
      {
        id: "PACIENTE",
        label: "Pacientes",
        enabled: false,
        order: 20
      },
      {
        id: "MARKETING",
        label: "Marketing",
        enabled: false,
        order: 30
      },
      {
        id: "INTERNO",
        label: "Interno",
        enabled: false,
        order: 40
      }
    ],

    templateTypes: [
      "RESPUESTA",
      "RECORDATORIO",
      "SEGUIMIENTO",
      "MARKETING",
      "INTERNO"
    ],

    channels: [
      "GENERAL",
      "WHATSAPP",
      "INSTAGRAM",
      "FACEBOOK",
      "TIKTOK",
      "EMAIL"
    ],

    statuses: ["ACTIVO", "INACTIVO"],

    placeholders: {
      supported: [
        "{{nombre}}",
        "{{fecha}}",
        "{{hora}}",
        "{{medico}}",
        "{{servicio}}",
        "{{enlace}}",
        "{{ubicacion}}"
      ],
      unresolvedBehavior: "KEEP"
    },

    categories: [
      {
        id: "AGENDAMIENTO",
        label: "Agendamiento",
        icon: "calendar-check",
        order: 10,
        enabled: true,
        keywords: [
          "cita",
          "agendar",
          "agenda",
          "turno",
          "disponibilidad",
          "reservar",
          "reserva",
          "quiero una cita",
          "sacar cita"
        ]
      },
      {
        id: "UBICACION",
        label: "Ubicación",
        icon: "geo-alt",
        order: 20,
        enabled: true,
        keywords: [
          "ubicacion",
          "ubicación",
          "direccion",
          "dirección",
          "donde estan",
          "dónde están",
          "donde queda",
          "cómo llegar",
          "como llegar",
          "mall del sol",
          "agora",
          "ágora"
        ]
      },
      {
        id: "HORARIOS",
        label: "Horarios",
        icon: "clock",
        order: 30,
        enabled: true,
        keywords: [
          "horario",
          "horarios",
          "atienden",
          "atencion",
          "atención",
          "domingo",
          "sabado",
          "sábado",
          "fin de semana"
        ]
      },
      {
        id: "CONSULTA_GINECOLOGICA",
        label: "Consulta ginecológica",
        icon: "heart-pulse",
        order: 40,
        enabled: true,
        keywords: [
          "consulta ginecologica",
          "consulta ginecológica",
          "ginecologia",
          "ginecología",
          "control ginecologico",
          "control ginecológico",
          "chequeo",
          "consulta"
        ]
      },
      {
        id: "PAPANICOLAOU",
        label: "Papanicolaou",
        icon: "clipboard2-pulse",
        order: 50,
        enabled: true,
        keywords: [
          "papanicolaou",
          "pap",
          "citologia",
          "citología",
          "citologia cervical",
          "citología cervical"
        ]
      },
      {
        id: "VPH",
        label: "VPH",
        icon: "shield-check",
        order: 60,
        enabled: true,
        keywords: [
          "vph",
          "papiloma",
          "virus del papiloma",
          "hpv",
          "prueba vph",
          "pcr vph"
        ]
      },
      {
        id: "COLPOSCOPIA",
        label: "Colposcopía",
        icon: "search-heart",
        order: 70,
        enabled: true,
        keywords: [
          "colposcopia",
          "colposcopía",
          "colposcopio"
        ]
      },
      {
        id: "LASER",
        label: "Láser",
        icon: "stars",
        order: 80,
        enabled: true,
        keywords: [
          "laser",
          "láser",
          "rejuvenecimiento",
          "laser vaginal",
          "láser vaginal",
          "ginecoestetica",
          "ginecoestética",
          "estetica intima",
          "estética íntima"
        ]
      },
      {
        id: "MENOPAUSIA",
        label: "Menopausia",
        icon: "flower1",
        order: 90,
        enabled: true,
        keywords: [
          "menopausia",
          "climaterio",
          "sofocos",
          "cambios hormonales",
          "hormonas"
        ]
      },
      {
        id: "RESULTADOS",
        label: "Resultados / revisión médica",
        icon: "file-earmark-medical",
        order: 100,
        enabled: true,
        keywords: [
          "resultado",
          "resultados",
          "examen",
          "examenes",
          "exámenes",
          "informe",
          "informes",
          "revisar",
          "revise",
          "que dijo la doctora",
          "qué dijo la doctora",
          "indicaciones"
        ]
      },
      {
        id: "PRECIOS",
        label: "Precios",
        icon: "cash-coin",
        order: 110,
        enabled: true,
        keywords: [
          "precio",
          "precios",
          "valor",
          "cuanto cuesta",
          "cuánto cuesta",
          "costo",
          "tarifa"
        ]
      },
      {
        id: "SERVICIOS",
        label: "Servicios",
        icon: "grid",
        order: 120,
        enabled: true,
        keywords: [
          "servicios",
          "que hacen",
          "qué hacen",
          "que ofrecen",
          "qué ofrecen",
          "especialidades",
          "tratamientos"
        ]
      }
    ],

    /**
     * Plantillas locales iniciales.
     *
     * ESTRUCTURA FINAL COMPATIBLE CON LA FUTURA HOJA:
     * ID | AMBITO | CATEGORIA | TITULO | RESPUESTA |
     * META_JSON | ESTADO | FECHA_CREACION | FECHA_ACTUALIZACION
     *
     * Los campos createdAt/updatedAt se dejan vacíos porque estas son
     * plantillas bootstrap incluidas en configuración y no registros de BD.
     */
    templates: [
      {
        id: "TPL-0001",
        scope: "PROSPECTO",
        category: "AGENDAMIENTO",
        title: "Agendar cita",
        response:
          "Claro. Haz clic en el enlace y agenda tu cita en el formulario:\n{{enlace}}",
        meta: {
          keywords: [
            "cita",
            "agendar",
            "turno",
            "disponibilidad",
            "reservar"
          ],
          priority: 100,
          favorite: true,
          tags: ["agenda", "conversion"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0002",
        scope: "PROSPECTO",
        category: "UBICACION",
        title: "Ubicación",
        response:
          "Estamos en el Edificio Ágora 21, sector Mall del Sol, en Guayaquil. Si deseas, te comparto la ubicación.",
        meta: {
          keywords: [
            "ubicación",
            "ubicacion",
            "dirección",
            "direccion",
            "dónde",
            "donde"
          ],
          priority: 100,
          favorite: true,
          tags: ["ubicacion"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0003",
        scope: "PROSPECTO",
        category: "RESULTADOS",
        title: "Pendiente de revisión médica",
        response:
          "Tu mensaje quedó pendiente de revisión. La doctora te responderá personalmente apenas tenga disponibilidad.",
        meta: {
          keywords: [
            "resultado",
            "resultados",
            "examen",
            "informe",
            "indicaciones",
            "revisión",
            "revision"
          ],
          priority: 100,
          favorite: true,
          tags: ["revision_medica", "seguridad"],
          type: "RESPUESTA",
          channel: "GENERAL",
          medicalReviewRequired: true
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0004",
        scope: "PROSPECTO",
        category: "CONSULTA_GINECOLOGICA",
        title: "Consulta ginecológica",
        response:
          "La consulta ginecológica permite valorar antecedentes, síntomas y necesidades para orientar el control o los estudios que correspondan según valoración profesional.",
        meta: {
          keywords: [
            "consulta ginecológica",
            "consulta ginecologica",
            "ginecología",
            "ginecologia",
            "control"
          ],
          priority: 80,
          favorite: false,
          tags: ["consulta", "ginecologia"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0005",
        scope: "PROSPECTO",
        category: "PAPANICOLAOU",
        title: "Papanicolaou",
        response:
          "Sí, realizamos Papanicolaou como parte de la prevención y detección temprana ginecológica. La indicación adecuada depende de la valoración profesional.",
        meta: {
          keywords: ["papanicolaou", "pap", "citología", "citologia"],
          priority: 90,
          favorite: false,
          tags: ["prevencion", "papanicolaou"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0006",
        scope: "PROSPECTO",
        category: "VPH",
        title: "Prueba de VPH",
        response:
          "Sí, contamos con evaluación y pruebas relacionadas con VPH, incluyendo PCR de VPH, según valoración profesional.",
        meta: {
          keywords: [
            "vph",
            "papiloma",
            "virus del papiloma",
            "pcr vph",
            "hpv"
          ],
          priority: 90,
          favorite: false,
          tags: ["vph", "prevencion"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0007",
        scope: "PROSPECTO",
        category: "COLPOSCOPIA",
        title: "Colposcopía",
        response:
          "Sí, realizamos colposcopía como parte de la evaluación ginecológica cuando está indicada. La necesidad del estudio se define según valoración profesional.",
        meta: {
          keywords: ["colposcopía", "colposcopia"],
          priority: 85,
          favorite: false,
          tags: ["colposcopia", "prevencion"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0008",
        scope: "PROSPECTO",
        category: "LASER",
        title: "Tratamientos con láser",
        response:
          "Contamos con tratamientos con láser para salud íntima femenina. El tipo de procedimiento y las sesiones necesarias se determinan después de una valoración profesional.",
        meta: {
          keywords: [
            "láser",
            "laser",
            "rejuvenecimiento",
            "ginecoestética",
            "ginecoestetica"
          ],
          priority: 90,
          favorite: false,
          tags: ["laser", "salud_intima"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0009",
        scope: "PROSPECTO",
        category: "MENOPAUSIA",
        title: "Menopausia y climaterio",
        response:
          "Sí, ofrecemos atención para menopausia, climaterio y cambios hormonales, con valoración individual según cada caso.",
        meta: {
          keywords: [
            "menopausia",
            "climaterio",
            "cambios hormonales",
            "hormonas"
          ],
          priority: 85,
          favorite: false,
          tags: ["menopausia", "hormonal"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0010",
        scope: "PROSPECTO",
        category: "PRECIOS",
        title: "Consulta de precio sin valor confirmado",
        response:
          "El valor depende del servicio que necesites. Indícame cuál te interesa y te orientamos con la información confirmada.",
        meta: {
          keywords: [
            "precio",
            "valor",
            "costo",
            "cuánto cuesta",
            "cuanto cuesta"
          ],
          priority: 95,
          favorite: false,
          tags: ["precio", "seguridad"],
          type: "RESPUESTA",
          channel: "GENERAL",
          doNotInventPrice: true
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0011",
        scope: "PROSPECTO",
        category: "SERVICIOS",
        title: "Servicios principales",
        response:
          "Ofrecemos atención ginecológica, prevención y control, Papanicolaou, colposcopía, evaluación de VPH, menopausia y servicios de salud íntima femenina, entre otros.",
        meta: {
          keywords: [
            "servicios",
            "qué hacen",
            "que hacen",
            "qué ofrecen",
            "que ofrecen"
          ],
          priority: 80,
          favorite: false,
          tags: ["servicios"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "TPL-0012",
        scope: "PROSPECTO",
        category: "HORARIOS",
        title: "Horarios y disponibilidad",
        response:
          "La atención es con cita previa y depende de la disponibilidad. Puedes revisar y agendar directamente aquí:\n{{enlace}}",
        meta: {
          keywords: [
            "horario",
            "horarios",
            "atienden",
            "domingo",
            "sábado",
            "sabado",
            "disponibilidad"
          ],
          priority: 90,
          favorite: false,
          tags: ["horario", "agenda"],
          type: "RESPUESTA",
          channel: "GENERAL"
        },
        status: "ACTIVO",
        createdAt: "",
        updatedAt: ""
      }
    ],

    safety: {
      medical: {
        enabled: true,
        doNotDiagnose: true,
        doNotPrescribe: true,
        doNotGuaranteeResults: true,
        doNotInventPrices: true,
        doNotInventAvailability: true,
        doNotInventPromotions: true,
        requireHumanReviewForClinicalResults: true
      },
      privacy: {
        persistPastedMessages: false,
        storeClinicalContentByDefault: false,
        storeConversationHistoryByDefault: false
      }
    },

    futureContext: {
      enabled: false,
      optionalFields: [
        "ID_HISTORIA",
        "ID_ATENCION",
        "ID_PACIENTE",
        "NOMBRE_PACIENTE",
        "ID_MEDICO",
        "NOMBRE_MEDICO",
        "NUMERO_CONSULTA"
      ],
      rules: {
        requiredForCore: false,
        writeBackToClinicalModules: false,
        modifyClinicalRecord: false,
        mixAttentionContexts: false
      }
    },

    storage: {
      futureSheetName: "ASISTENTE_COMERCIAL",
      oneRowPerTemplate: true,
      futureColumns: [
        "ID",
        "AMBITO",
        "CATEGORIA",
        "TITULO",
        "RESPUESTA",
        "META_JSON",
        "ESTADO",
        "FECHA_CREACION",
        "FECHA_ACTUALIZACION"
      ]
    },

    integration: {
      standaloneFirst: true,
      indexIntegrationLater: true,
      indexEntryLabel: "Asistente Comercial",
      indexTarget: "asistente_comercial.html",
      openMode: "SAME_TAB",
      dependsOnERPModules: false
    }
  };

  /**
   * Resuelve placeholders básicos usando solo configuración.
   * El motor principal podrá extender esta función sin modificar el CONFIG.
   */
  CONFIG.runtimeDefaults = {
    enlace: CONFIG.business.appointmentUrl,
    ubicacion: CONFIG.business.address
  };

  // Exposición controlada y compatible con navegador tradicional.
  global.ASISTENTE_COMERCIAL_CONFIG = Object.freeze(CONFIG);

})(window);
