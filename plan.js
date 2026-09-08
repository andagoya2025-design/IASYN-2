/****************************************************************
 IASYN ERP
 plan.js
 ACTUALIZACIÓN QUIRÚRGICA: CONTEXTO UNIFICADO POR ATENCIÓN v20.1
 MODULACIÓN PLAN - FASE 5 EVALUACIONES / NAVEGACIÓN SEGURA
 ---------------------------------------------------------------
 OBJETIVO:
 - Mantener Fase 3 estable.
 - Agregar módulo de Evaluaciones y mantener utilidades:
   auroPlanSetValue()
   auroPlanGetValue()
 - Integrar EVALUACIONES sin romper medicamentos, órdenes ni interconsultas.
 - NO tocar botón Guardar historia / Actualizar plan.
 - NO usar MutationObserver.
 - NO interceptar navegación.
 - NO tocar Dashboard, Pacientes, Agenda, Atenciones ni Recetas emitidas.

 CONTIENE:
 - Estado temporal por id_atencion.
 - Limpieza del Plan al cambiar consulta.
 - Medicamentos del Plan.
 - Órdenes médicas.
 - Interconsulta:
   * agregar interconsulta temporal
   * eliminar interconsulta temporal
   * recopilar interconsulta desde campos visibles
   * limpiar interconsulta
   * guardar/restaurar por consulta
 - Responsive móvil Android/teléfono.
 - Persistencia JSON uniforme para medicamentos, órdenes, interconsultas y evaluaciones.
 - Captura automática de interconsulta al actualizar el Plan.
 - Edición segura de medicamentos sin alterar persistencia por id_atencion.
 - Vías visibles con nombre completo, conservando valores internos compatibles.
 - Ayudas rápidas para frecuencia, duración e indicaciones.
 - Ampliación controlada de la tabla solo en escritorio.
****************************************************************/


/* ============================================================
   IASYN - NOTA DE AISLAMIENTO / COMPATIBILIDAD
   ------------------------------------------------------------
   Este módulo no contiene URLs directas a AUROSANAX, Google Drive
   ni Apps Script. El backend se obtiene desde API_URL, cuya fuente
   autoritativa debe ser index.html de IASYN.

   Se conservan temporalmente eventos `aurosanax:*`, aliases globales
   de Diagnóstico/Seguridad y la clave `aurosanax_recetas_emitidas_v1`
   porque siguen siendo contratos internos compartidos entre módulos.
   Renombrarlos solo en plan.js rompería la sincronización clínica.
   No representan una conexión activa con AUROSANAX PRUEBA.
============================================================ */


/* ============================================================
   UTILIDADES SEGURAS
============================================================ */

function auroPlanSetValue(id, value){
    const el = document.getElementById(id);
    if(el) el.value = value || '';
}

function auroPlanGetValue(id){
    const el = document.getElementById(id);
    return el ? String(el.value || '') : '';
}

function escapeHtmlPlan(txt){
    return String(txt || '').replace(/[&<>'"]/g, c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        "'":'&#39;',
        '"':'&quot;'
    }[c]));
}

function escapeHtmlMed(txt){
    return escapeHtmlPlan(txt);
}

function normalizarTextoPlan(t){
    return String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .trim();
}


/* ============================================================
   IASYN PLAN - COMPATIBILIDAD TEXTO / JSON COMPACTO
   Intervención quirúrgica para receta_medica e indicaciones_paciente.
   - Los registros nuevos se guardan como arreglos JSON compactos.
   - Los registros antiguos en texto continúan siendo compatibles.
   - La interfaz siempre recibe texto legible; nunca muestra JSON bruto.
============================================================ */

function auroPlanListaClinicaDesdeValor(valor){
    const raw = String(valor ?? '').trim();
    if(!raw) return [];

    if(raw.startsWith('[') || raw.startsWith('{')){
        try{
            let datos = JSON.parse(raw);
            if(!Array.isArray(datos)) datos = [datos];

            const lista = datos.map(function(item){
                if(typeof item === 'string') return item.trim();
                if(!item || typeof item !== 'object') return '';

                if(item.texto) return String(item.texto).trim();
                if(item.descripcion) return String(item.descripcion).trim();
                if(item.indicacion) return String(item.indicacion).trim();
                if(item.recomendacion) return String(item.recomendacion).trim();

                /* Compatibilidad defensiva si alguna versión guardó medicamentos estructurados. */
                const med = String(item.med || item.medicamento || item.nombre || '').trim();
                if(med){
                    const partes = [
                        med,
                        item.pres || item.presentacion || '',
                        item.via || '',
                        item.frec || item.frecuencia || '',
                        (item.dur || item.duracion) ? 'por ' + (item.dur || item.duracion) : '',
                        item.ind || item.indicaciones || ''
                    ].map(function(x){ return String(x || '').trim(); }).filter(Boolean);
                    return partes.join(' - ');
                }

                return '';
            }).filter(Boolean);

            if(lista.length) return lista;
        }catch(e){
            /* Si no es JSON válido, se conserva como texto histórico. */
        }
    }

    return raw
        .split(/\r?\n+/)
        .map(function(linea){ return String(linea || '').trim(); })
        .filter(Boolean);
}

function auroPlanValorClinicoATexto(valor){
    return auroPlanListaClinicaDesdeValor(valor).join('\n');
}

function auroPlanTextoClinicoAJSON(valor){
    const lista = auroPlanListaClinicaDesdeValor(valor);
    return lista.length ? JSON.stringify(lista) : '';
}

/* ============================================================
   IASYN PLAN 29 - FECHA CLÍNICA LOCAL SEGURA
   - Usa fecha local del navegador, no UTC.
   - Formato estable para fecha_plan: YYYY-MM-DD.
   - No modifica creado_en ni actualizado_en.
============================================================ */
function auroPlanFechaClinicaLocal(){
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}


/* ============================================================
   UX CLÍNICA SEGURA PARA MEDICAMENTOS
   - No modifica nombres de propiedades ni estructura JSON.
   - Mantiene compatibilidad con protocolos, Plan y Recetas.
============================================================ */

window.auroPlanMedicamentoEditandoIndice =
    Number.isInteger(window.auroPlanMedicamentoEditandoIndice)
        ? window.auroPlanMedicamentoEditandoIndice
        : null;
const AURO_PLAN_VIAS_COMPLETAS = {
    'VO': 'Vía oral',
    'ORAL': 'Vía oral',
    'VÍA ORAL': 'Vía oral',
    'VIA ORAL': 'Vía oral',
    'IM': 'Vía intramuscular',
    'INTRAMUSCULAR': 'Vía intramuscular',
    'VÍA INTRAMUSCULAR': 'Vía intramuscular',
    'VIA INTRAMUSCULAR': 'Vía intramuscular',
    'IV': 'Vía intravenosa',
    'INTRAVENOSA': 'Vía intravenosa',
    'VÍA INTRAVENOSA': 'Vía intravenosa',
    'VIA INTRAVENOSA': 'Vía intravenosa',
    'SC': 'Vía subcutánea',
    'SUBCUTÁNEA': 'Vía subcutánea',
    'SUBCUTANEA': 'Vía subcutánea',
    'VÍA SUBCUTÁNEA': 'Vía subcutánea',
    'VIA SUBCUTANEA': 'Vía subcutánea',
    'VAGINAL': 'Vía vaginal',
    'VÍA VAGINAL': 'Vía vaginal',
    'VIA VAGINAL': 'Vía vaginal',
    'TÓPICA': 'Vía tópica',
    'TOPICA': 'Vía tópica',
    'VÍA TÓPICA': 'Vía tópica',
    'VIA TOPICA': 'Vía tópica',
    'SUBLINGUAL': 'Vía sublingual',
    'VÍA SUBLINGUAL': 'Vía sublingual',
    'VIA SUBLINGUAL': 'Vía sublingual',
    'OFTÁLMICA': 'Vía oftálmica',
    'OFTALMICA': 'Vía oftálmica',
    'VÍA OFTÁLMICA': 'Vía oftálmica',
    'VIA OFTALMICA': 'Vía oftálmica',
    'ÓTICA': 'Vía ótica',
    'OTICA': 'Vía ótica',
    'VÍA ÓTICA': 'Vía ótica',
    'VIA OTICA': 'Vía ótica',
    'INHALATORIA': 'Vía inhalatoria',
    'VÍA INHALATORIA': 'Vía inhalatoria',
    'VIA INHALATORIA': 'Vía inhalatoria',
    'RECTAL': 'Vía rectal',
    'VÍA RECTAL': 'Vía rectal',
    'VIA RECTAL': 'Vía rectal',
    'NASAL': 'Vía nasal',
    'VÍA NASAL': 'Vía nasal',
    'VIA NASAL': 'Vía nasal'
};

const AURO_PLAN_FRECUENCIAS_RAPIDAS = [
    'Dosis única',
    'Cada 4 horas',
    'Cada 6 horas',
    'Cada 8 horas',
    'Cada 12 horas',
    'Cada 24 horas',
    'Cada mañana',
    'Cada noche',
    'Dos veces al día',
    'Tres veces al día',
    'Según necesidad',
    'Según esquema médico'
];

const AURO_PLAN_DURACIONES_RAPIDAS = [
    '1 día',
    '2 días',
    '3 días',
    '5 días',
    '7 días',
    '10 días',
    '14 días',
    '21 días',
    '30 días',
    '3 a 5 días',
    '5 a 7 días',
    '7 noches',
    'Tratamiento continuo',
    'Según evolución',
    'Según indicación médica'
];

const AURO_PLAN_INDICACIONES_RAPIDAS = [
    'Tomar después de alimentos.',
    'Tomar antes de alimentos.',
    'Tomar con alimentos.',
    'Aplicar antes de dormir.',
    'Aplicar por la noche.',
    'Aplicar una capa fina.',
    'Agitar antes de usar.',
    'Uso externo.',
    'Completar el tratamiento.',
    'No suspender aunque mejoren los síntomas.',
    'Según necesidad.',
    'Según indicación médica.'
];

function auroPlanNombreViaCompleta(valor){
    const original = String(valor || '').trim();
    if(!original) return '';

    const clave = original
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .trim();

    const coincidencia = Object.keys(AURO_PLAN_VIAS_COMPLETAS).find(k =>
        k.normalize('NFD').replace(/[\u0300-\u036f]/g,'') === clave
    );

    return coincidencia
        ? AURO_PLAN_VIAS_COMPLETAS[coincidencia]
        : original;
}

function auroPlanInstalarDatalist(idCampo, idLista, opciones, placeholder){
    const campo = document.getElementById(idCampo);
    if(!campo) return;

    if(placeholder && !String(campo.getAttribute('placeholder') || '').trim()){
        campo.setAttribute('placeholder', placeholder);
    }

    if(campo.tagName === 'INPUT'){
        let lista = document.getElementById(idLista);

        if(!lista){
            lista = document.createElement('datalist');
            lista.id = idLista;
            document.body.appendChild(lista);
        }

        lista.innerHTML = (opciones || [])
            .map(op => `<option value="${escapeHtmlPlan(op)}"></option>`)
            .join('');

        campo.setAttribute('list', idLista);
        campo.setAttribute('autocomplete', 'off');
    }
}

function auroPlanInstalarAyudaIndicaciones(){
    const campo = document.getElementById('hcMedIndicaciones');
    if(!campo || document.getElementById('auroPlanIndicacionRapida')) return;

    const selector = document.createElement('select');
    selector.id = 'auroPlanIndicacionRapida';
    selector.className = 'form-select form-select-sm auro-plan-ayuda-select';
    selector.setAttribute('aria-label', 'Sugerencias rápidas de indicaciones');
    selector.innerHTML =
        '<option value="">Elegir indicación rápida...</option>' +
        AURO_PLAN_INDICACIONES_RAPIDAS
            .map(op => `<option value="${escapeHtmlPlan(op)}">${escapeHtmlPlan(op)}</option>`)
            .join('');

    selector.addEventListener('change', function(){
        const valor = String(selector.value || '').trim();
        if(!valor) return;

        const actual = String(campo.value || '').trim();

        if(!actual){
            campo.value = valor;
        }else if(!normalizarTextoPlan(actual).includes(normalizarTextoPlan(valor))){
            campo.value = actual.replace(/\s+$/,'') + '\n' + valor;
        }

        campo.dispatchEvent(new Event('input', {bubbles:true}));
        selector.value = '';
        campo.focus();
    });

    campo.insertAdjacentElement('afterend', selector);
}

function auroPlanActualizarOpcionesVia(){
    const campo = document.getElementById('hcMedVia');
    if(!campo) return;

    if(campo.tagName === 'SELECT'){
        Array.from(campo.options || []).forEach(op => {
            const valor = String(op.value || '').trim();
            if(!valor) return;
            op.textContent = auroPlanNombreViaCompleta(valor);
        });
    }else if(campo.tagName === 'INPUT'){
        auroPlanInstalarDatalist(
            'hcMedVia',
            'auroPlanViasLista',
            [
                'Vía oral',
                'Vía intramuscular',
                'Vía intravenosa',
                'Vía subcutánea',
                'Vía vaginal',
                'Vía tópica',
                'Vía sublingual',
                'Vía oftálmica',
                'Vía ótica',
                'Vía inhalatoria',
                'Vía rectal',
                'Vía nasal'
            ],
            'Ej.: Vía oral'
        );
    }
}

function auroPlanInstalarAyudasMedicamentos(){
    auroPlanActualizarOpcionesVia();

    auroPlanInstalarDatalist(
        'hcMedFrecuencia',
        'auroPlanFrecuenciasLista',
        AURO_PLAN_FRECUENCIAS_RAPIDAS,
        'Ej.: Cada 12 horas'
    );

    auroPlanInstalarDatalist(
        'hcMedDuracion',
        'auroPlanDuracionesLista',
        AURO_PLAN_DURACIONES_RAPIDAS,
        'Ej.: 7 días'
    );

    auroPlanInstalarAyudaIndicaciones();
    auroPlanPrepararControlesEdicionMedicamento();
    auroPlanActualizarEncabezadosTablaMedicamentos();
}

function auroPlanBuscarBotonAgregarMedicamento(){
    const botones = Array.from(
        document.querySelectorAll('#hc_plan button, button')
    );

    return botones.find(btn =>
        String(btn.getAttribute('onclick') || '')
            .includes('agregarMedicamentoDesdeFormulario')
    ) || null;
}

function auroPlanPrepararControlesEdicionMedicamento(){
    const boton = auroPlanBuscarBotonAgregarMedicamento();
    if(!boton) return;

    boton.id = boton.id || 'auroPlanBtnAgregarMedicamento';
    boton.classList.add('auro-plan-btn-medicamento-principal');

    let cancelar = document.getElementById('auroPlanBtnCancelarEdicionMedicamento');

    if(!cancelar){
        cancelar = document.createElement('button');
        cancelar.type = 'button';
        cancelar.id = 'auroPlanBtnCancelarEdicionMedicamento';
        cancelar.className = 'btn btn-sm btn-outline-secondary ms-2 d-none';
        cancelar.innerHTML = '<i class="bi bi-x-circle me-1"></i> Cancelar edición';
        cancelar.addEventListener('click', cancelarEdicionMedicamentoPlan);
        boton.insertAdjacentElement('afterend', cancelar);
    }

    let aviso = document.getElementById('auroPlanAvisoEdicionMedicamento');

    if(!aviso){
        aviso = document.createElement('div');
        aviso.id = 'auroPlanAvisoEdicionMedicamento';
        aviso.className = 'auro-plan-aviso-edicion d-none';
        aviso.setAttribute('role', 'status');

        const contenedor = boton.parentElement || boton;
        contenedor.insertAdjacentElement('beforebegin', aviso);
    }

    auroPlanActualizarEstadoEdicionMedicamento();
}

function auroPlanActualizarEstadoEdicionMedicamento(){
    const boton = auroPlanBuscarBotonAgregarMedicamento();
    const cancelar = document.getElementById('auroPlanBtnCancelarEdicionMedicamento');
    const aviso = document.getElementById('auroPlanAvisoEdicionMedicamento');
    const indice = window.auroPlanMedicamentoEditandoIndice;
    const editando = Number.isInteger(indice) &&
        indice >= 0 &&
        indice < (window.medicamentosPlanSeleccionados || []).length;

    if(boton){
        boton.innerHTML = editando
            ? '<i class="bi bi-check-circle me-1"></i> Actualizar medicamento'
            : '<i class="bi bi-plus-circle me-1"></i> Agregar medicamento';
    }

    if(cancelar){
        cancelar.classList.toggle('d-none', !editando);
    }

    if(aviso){
        aviso.classList.toggle('d-none', !editando);
        aviso.innerHTML = editando
            ? '<i class="bi bi-pencil-square me-1"></i> Editando medicamento ' + (indice + 1) + '. Revise los datos y presione “Actualizar medicamento”.'
            : '';
    }
}

function auroPlanActualizarEncabezadosTablaMedicamentos(){
    const tbody = document.getElementById('hcMedicamentosTableBody');
    const tabla = tbody?.closest('table');
    if(!tabla) return;

    tabla.classList.add('auro-plan-tabla-medicamentos');

    const encabezados = tabla.querySelectorAll('thead th');

    if(encabezados[2]) encabezados[2].textContent = 'Vía';
    if(encabezados[7]) encabezados[7].textContent = 'Trat. continuo';
    if(encabezados[8]) encabezados[8].textContent = 'Acciones';
}


/* ============================================================
   UTILIDADES JSON SEGURAS DEL PLAN
   - Mantienen la interfaz actual.
   - Evitan duplicados antes de guardar.
   - Permiten cargar JSON sin afectar Recetas.
============================================================ */

function auroPlanParseJSONSeguro(valor, fallback){
    if(valor === null || valor === undefined || valor === ''){
        return fallback;
    }

    if(typeof valor === 'object'){
        return valor;
    }

    const texto = String(valor || '').trim();

    if(!texto){
        return fallback;
    }

    try{
        return JSON.parse(texto);
    }catch(e){
        return fallback;
    }
}

function auroPlanClaveUnica(partes){
    return (partes || [])
        .map(v => normalizarTextoPlan(v))        .join('|');
}

function auroPlanOrdenesUnicas(lista){
    const mapa = new Map();

    (Array.isArray(lista) ? lista : []).forEach(item => {
        const orden = String(item?.orden || '').trim();
        if(!orden) return;

        const normalizada = {
            ...(item && typeof item === 'object' ? item : {}),
            orden: orden,
            cat: String(item?.cat || item?.categoria || 'OTROS').trim() || 'OTROS',
            obs: String(item?.obs || item?.observacion || '').trim()
        };

        const clave = auroPlanClaveUnica([
            normalizada.orden,
            normalizada.cat,
            normalizada.obs
        ]);

        if(!mapa.has(clave)){
            mapa.set(clave, normalizada);
        }
    });

    return Array.from(mapa.values());
}

/* ============================================================
   IASYN FIX QUIRÚRGICO INTERCONSULTA 2026-08-22
   - Una misma interconsulta no se duplica al completar motivo/observaciones.
   - Conserva datos clínicos existentes ante campos vacíos/default.
   - Mantiene separadas interconsultas con profesionales explícitamente distintos.
   - No cambia estructura JSON, id_atencion ni contratos de persistencia.
============================================================ */
function auroPlanInterconsultasUnicas(lista){
    const resultado = [];

    function normalizarItem(item){
        return {
            tipo: String(item?.tipo || '').trim(),
            especialidad: String(item?.especialidad || '').trim(),
            prioridad: String(item?.prioridad || 'Normal').trim() || 'Normal',
            profesional: String(item?.profesional || '').trim(),
            estado: String(item?.estado || 'Pendiente').trim() || 'Pendiente',
            motivo: String(item?.motivo || '').trim(),
            observaciones: String(item?.observaciones || item?.observacion || '').trim()
        };
    }

    function tieneContenido(item){
        return !!(
            item.tipo ||
            item.especialidad ||
            item.profesional ||
            item.motivo ||
            item.observaciones
        );
    }

    function mismaInterconsulta(a, b){
        const tipoA = normalizarTextoPlan(a?.tipo);
        const tipoB = normalizarTextoPlan(b?.tipo);
        const espA = normalizarTextoPlan(a?.especialidad);
        const espB = normalizarTextoPlan(b?.especialidad);
        const profA = normalizarTextoPlan(a?.profesional);
        const profB = normalizarTextoPlan(b?.profesional);

        if(tipoA !== tipoB) return false;
        if(espA !== espB) return false;

        /*
          Profesional forma parte de la identidad solo cuando ambos
          registros lo tienen explícitamente informado. Esto permite
          completar después una interconsulta sin crear un duplicado.
        */
        if(profA && profB && profA !== profB) return false;

        return true;
    }

    function fusionar(existing, incoming){
        const salida = {...existing};

        if(incoming.tipo) salida.tipo = incoming.tipo;
        if(incoming.especialidad) salida.especialidad = incoming.especialidad;
        if(incoming.profesional) salida.profesional = incoming.profesional;

        /*
          "Normal" es el valor inicial del formulario y no debe degradar
          una prioridad clínica ya más específica.
        */
        const prioridadExistente = normalizarTextoPlan(salida.prioridad);
        const prioridadNueva = normalizarTextoPlan(incoming.prioridad);

        if(
            incoming.prioridad &&
            (
                !salida.prioridad ||
                prioridadNueva !== 'normal' ||
                prioridadExistente === 'normal'
            )
        ){
            salida.prioridad = incoming.prioridad;
        }

        /*
          "Pendiente" es el estado inicial y no debe sobrescribir
          un estado posterior ya registrado.
        */
        const estadoExistente = normalizarTextoPlan(salida.estado);
        const estadoNuevo = normalizarTextoPlan(incoming.estado);

        if(
            incoming.estado &&
            (
                !salida.estado ||
                estadoNuevo !== 'pendiente' ||
                estadoExistente === 'pendiente'
            )
        ){
            salida.estado = incoming.estado;
        }

        /*
          Motivo y observaciones son datos clínicos editables:
          un valor nuevo no vacío completa/actualiza; un campo vacío
          nunca borra información ya registrada.
        */
        if(incoming.motivo) salida.motivo = incoming.motivo;
        if(incoming.observaciones) salida.observaciones = incoming.observaciones;

        salida.prioridad = String(salida.prioridad || 'Normal').trim() || 'Normal';
        salida.estado = String(salida.estado || 'Pendiente').trim() || 'Pendiente';

        return salida;
    }

    (Array.isArray(lista) ? lista : []).forEach(item => {
        const normalizada = normalizarItem(item);
        if(!tieneContenido(normalizada)) return;

        const indice = resultado.findIndex(actual =>
            mismaInterconsulta(actual, normalizada)
        );

        if(indice === -1){
            resultado.push(normalizada);
            return;
        }

        resultado[indice] = fusionar(resultado[indice], normalizada);
    });

    return resultado;
}

function auroPlanEvaluacionesSeleccionadasJSON(){
    return AURO_PLAN_EVALUACIONES
        .filter(item => {
            const el = document.getElementById(item.id);
            return !!(el && el.checked);
        })
        .map(item => ({
            id: item.id,
            texto: item.texto,
            seleccionado: true
        }));
}


/* ============================================================
   ESTADO TEMPORAL DEL PLAN POR ATENCIÓN
============================================================ */

window.planState = window.planState || {
    atencionActual: '',
    cache: {}
};

window.medicamentosPlanSeleccionados = Array.isArray(window.medicamentosPlanSeleccionados)
    ? window.medicamentosPlanSeleccionados
    : [];

window.ordenesMedicasPlanSeleccionadas = Array.isArray(window.ordenesMedicasPlanSeleccionadas)
    ? window.ordenesMedicasPlanSeleccionadas
    : [];

window.interconsultasPlanSeleccionadas = Array.isArray(window.interconsultasPlanSeleccionadas)
    ? window.interconsultasPlanSeleccionadas
    : [];


/* ============================================================
   CATÁLOGO BASE DE MEDICAMENTOS
============================================================ */

window.MEDICAMENTOS_IASYN_BASE = window.MEDICAMENTOS_IASYN_BASE || [
    {cat:'GINECOLOGÍA', med:'Tinidazol', pres:'500 mg tableta', via:'VO', frec:'según esquema médico', dur:'según indicación', ind:'Tomar después de alimentos'},
    {cat:'GINECOLOGÍA', med:'Metronidazol', pres:'500 mg tableta', via:'VO', frec:'cada 12 horas', dur:'7 días', ind:'Tomar después de alimentos'},
    {cat:'GINECOLOGÍA', med:'Clotrimazol', pres:'óvulo vaginal', via:'Vaginal', frec:'cada noche', dur:'7 noches', ind:'Aplicar antes de dormir'},
    {cat:'GINECOLOGÍA', med:'Fluconazol', pres:'150 mg cápsula', via:'VO', frec:'dosis única', dur:'1 día', ind:'Según indicación médica'},
    {cat:'GINECOLOGÍA', med:'Secnidazol', pres:'1 g tableta', via:'VO', frec:'dosis única', dur:'1 día', ind:'Tomar después de alimentos'},
    {cat:'DOLOR / INFLAMACIÓN', med:'Ibuprofeno', pres:'400 mg tableta', via:'VO', frec:'cada 8 horas', dur:'3 a 5 días', ind:'Tomar después de alimentos'},
    {cat:'DOLOR / INFLAMACIÓN', med:'Paracetamol', pres:'500 mg tableta', via:'VO', frec:'cada 8 horas', dur:'3 a 5 días', ind:'Si dolor o fiebre'},
    {cat:'DOLOR / INFLAMACIÓN', med:'Ketorolaco', pres:'10 mg tableta', via:'VO', frec:'cada 8 horas', dur:'máximo 3 días', ind:'Tomar después de alimentos'},
    {cat:'MEDICINA GENERAL', med:'Amoxicilina + ácido clavulánico', pres:'875/125 mg tableta', via:'VO', frec:'cada 12 horas', dur:'7 días', ind:'Tomar con alimentos'},
    {cat:'MEDICINA GENERAL', med:'Cefalexina', pres:'500 mg cápsula', via:'VO', frec:'cada 6 horas', dur:'7 días', ind:''},
    {cat:'DERMATOLOGÍA / ESTÉTICA', med:'Mupirocina', pres:'ungüento', via:'Tópica', frec:'cada 8 horas', dur:'5 a 7 días', ind:'Aplicar capa fina'},
    {cat:'DERMATOLOGÍA / ESTÉTICA', med:'Ácido fusídico', pres:'crema', via:'Tópica', frec:'cada 8 horas', dur:'7 días', ind:'Aplicar capa fina'},
    {cat:'DERMATOLOGÍA / ESTÉTICA', med:'Hidrocortisona', pres:'1% crema', via:'Tópica', frec:'cada 12 horas', dur:'3 a 5 días', ind:'Aplicar capa fina'},
    {cat:'UROLOGÍA', med:'Fenazopiridina', pres:'100 mg tableta', via:'VO', frec:'cada 8 horas', dur:'2 días', ind:'Uso sintomático según indicación'},
    {cat:'OTROS', med:'Probióticos', pres:'cápsula/sobre', via:'VO', frec:'cada día', dur:'10 a 30 días', ind:''}
];

/* Compatibilidad temporal con módulos heredados que aún consulten el nombre anterior. */
window.MEDICAMENTOS_AUROSANAX_BASE = window.MEDICAMENTOS_IASYN_BASE;


/* ============================================================
   CATÁLOGO BASE DE ÓRDENES MÉDICAS
============================================================ */

window.ORDENES_MEDICAS_IASYN_BASE = window.ORDENES_MEDICAS_IASYN_BASE || [
    {cat:'LABORATORIOS', orden:'Biometría hemática completa'},
    {cat:'LABORATORIOS', orden:'Glucosa en ayunas'},
    {cat:'LABORATORIOS', orden:'Insulina basal'},
    {cat:'LABORATORIOS', orden:'Hemoglobina glicosilada HbA1c'},
    {cat:'LABORATORIOS', orden:'Perfil lipídico'},
    {cat:'LABORATORIOS', orden:'Perfil hepático'},
    {cat:'LABORATORIOS', orden:'Perfil renal'},
    {cat:'LABORATORIOS', orden:'TSH'},
    {cat:'LABORATORIOS', orden:'T4 libre'},
    {cat:'LABORATORIOS', orden:'Vitamina D'},
    {cat:'LABORATORIOS', orden:'Ferritina'},
    {cat:'LABORATORIOS', orden:'Uroanálisis'},
    {cat:'LABORATORIOS', orden:'Urocultivo + antibiograma'},
    {cat:'GINECOLOGÍA', orden:'Papanicolaou'},
    {cat:'GINECOLOGÍA', orden:'Colposcopia'},
    {cat:'GINECOLOGÍA', orden:'Biopsia cervical'},
    {cat:'GINECOLOGÍA', orden:'Cultivo vaginal'},
    {cat:'GINECOLOGÍA', orden:'Examen fresco de secreción vaginal'},
    {cat:'GINECOLOGÍA', orden:'Prueba HPV'},
    {cat:'IMÁGENES', orden:'Ecografía transvaginal'},
    {cat:'IMÁGENES', orden:'Ecografía pélvica'},
    {cat:'IMÁGENES', orden:'Ecografía mamaria'},
    {cat:'IMÁGENES', orden:'Mamografía bilateral'},
    {cat:'IMÁGENES', orden:'Densitometría ósea'},
    {cat:'OBSTETRICIA', orden:'Ecografía obstétrica'},
    {cat:'OBSTETRICIA', orden:'Ecografía morfológica'},
    {cat:'OBSTETRICIA', orden:'Doppler obstétrico'},
    {cat:'OBSTETRICIA', orden:'Monitoreo fetal'},
    {cat:'MATERNO FETAL', orden:'Valoración materno fetal'},
    {cat:'CARDIOLOGÍA', orden:'Electrocardiograma'},
    {cat:'CARDIOLOGÍA', orden:'Ecocardiograma'},
    {cat:'PROCEDIMIENTOS', orden:'Láser CO2 fraccionado'},
    {cat:'PROCEDIMIENTOS', orden:'Depilación láser diodo'},
    {cat:'PROCEDIMIENTOS', orden:'HIFU'},
    {cat:'PROCEDIMIENTOS', orden:'PRP'},
    {cat:'OTROS', orden:'Control médico'}
];

/* Compatibilidad temporal con módulos heredados que aún consulten el nombre anterior. */
window.ORDENES_MEDICAS_AUROSANAX_BASE = window.ORDENES_MEDICAS_IASYN_BASE;


/* ============================================================
   INICIALIZACIÓN
============================================================ */

function inicializarPlan(){

    if(!Array.isArray(window.medicamentosPlanSeleccionados)){
        window.medicamentosPlanSeleccionados = [];
    }

    if(!Array.isArray(window.ordenesMedicasPlanSeleccionadas)){
        window.ordenesMedicasPlanSeleccionadas = [];
    }

    if(!Array.isArray(window.interconsultasPlanSeleccionadas)){
        window.interconsultasPlanSeleccionadas = [];
    }

    if(!window.planState){
        window.planState = {
            atencionActual:'',
            cache:{}
        };
    }

    instalarResponsivePlanAndroid();
    instalarEventosMedicamentosPlan();
    instalarEventosOrdenesMedicasPlan();
    instalarEventosEvaluacionesPlan();
    auroPlanInstalarAyudasMedicamentos();
    auroPlanInstalarVisorSugerenciasDiagnosticas();
    auroPlanRenderSugerenciasDiagnosticas();
    auroPlanRefrescarVistas();
}


/* ============================================================
   CAMBIO DE CONSULTA / ATENCIÓN
============================================================ */

async function cambiarPlanPorAtencion(idAtencion){

    inicializarPlan();
    cancelarEdicionMedicamentoPlan({limpiarFormulario:false});

    idAtencion = String(
        idAtencion ||
        auroPlanObtenerIdAtencionActivaSeguro() ||
        ''
    ).trim();

    if(!idAtencion) return;

    /*
      FUENTE REAL DEL PLAN VISIBLE:
      No se usa planState.atencionActual para decidir si cambió la consulta,
      porque Atenciones puede actualizar ese valor antes de llamar esta función.
      __auroPlanAtencionRenderizada representa la consulta que realmente está
      dibujada actualmente en el módulo Plan.
    */
    const atencionAnteriorRenderizada = String(
        window.__auroPlanAtencionRenderizada || ''
    ).trim();

    /*
      Solo se conserva el Plan temporal cuando realmente existe otra consulta
      dibujada. Se guarda usando su id original, nunca bajo la nueva atención.
    */
    if(
        atencionAnteriorRenderizada &&
        atencionAnteriorRenderizada !== idAtencion
    ){
        const idTemporalActual = String(
            window.planState?.atencionActual || ''
        ).trim();

        window.planState.atencionActual = atencionAnteriorRenderizada;
        guardarPlanTemporal();
        window.planState.atencionActual = idTemporalActual;
    }

    /*
      Si la consulta realmente dibujada ya es la misma, no se limpia.
      Esto protege cambios temporales al navegar entre pestañas de una misma
      atención, pero no confunde una atención nueva con la anterior.
    */
    if(
        atencionAnteriorRenderizada &&
        atencionAnteriorRenderizada === idAtencion
    ){
        window.planState.atencionActual = idAtencion;

        /*
          IASYN FIX QUIRÚRGICO:
          - En una atención abierta se conservan los cambios temporales al navegar
            entre pestañas de la misma consulta.
          - En una atención finalizada, al pulsar Ver se fuerza la recarga desde
            Sheets para mostrar exactamente el Plan guardado, incluidos
            medicamentos, protocolos aplicados y receta.
        */
        let atencionFinalizada = false;

        try{
            const atencionActiva = typeof window.getAtencionActiva === 'function'
                ? window.getAtencionActiva()
                : null;

            const estadoAtencion = normalizarTextoPlan(
                atencionActiva?.estado_atencion ||
                atencionActiva?.estado ||
                ''
            );

            atencionFinalizada = [
                'finalizada',
                'finalizado',
                'cerrada',
                'cerrado',
                'completada',
                'completado'
            ].includes(estadoAtencion);
        }catch(error){
            atencionFinalizada = false;
        }

        if(!atencionFinalizada){
            auroPlanRefrescarVistas();
            return null;
        }
    }

    window.planState.atencionActual = idAtencion;
    window.__auroPlanAtencionRenderizada = idAtencion;

    /*
      Primero se limpia completamente la pantalla.
      Después se restaura solo el cache propio de la atención solicitada,
      si realmente existe.
    */
    limpiarPlanTemporal();

    if(window.planState.cache[idAtencion]){
        cargarPlanTemporal(idAtencion);
    }else{
        auroPlanRefrescarVistas();
    }

    if(typeof window.cargarPlanClinicoDesdeSheets === 'function'){
        if(
            String(window.__auroPlanAtencionRenderizada || '').trim() !== idAtencion ||
            String(window.planState?.atencionActual || '').trim() !== idAtencion
        ){
            return null;
        }

        try{
            const planCargado = await window.cargarPlanClinicoDesdeSheets(idAtencion);

            if(
                String(window.__auroPlanAtencionRenderizada || '').trim() !== idAtencion ||
                String(window.planState?.atencionActual || '').trim() !== idAtencion
            ){
                return null;
            }

            window.dispatchEvent(new CustomEvent('aurosanax:plan-cargado', {
                detail:{
                    id_atencion:idAtencion,
                    tiene_plan:!!planCargado,
                    medicamentos:Array.isArray(window.medicamentosPlanSeleccionados)
                        ? window.medicamentosPlanSeleccionados.length
                        : 0
                }
            }));

            return planCargado;
        }catch(error){
            console.warn('IASYN PLAN: no se pudo cargar Plan desde Sheets.', error);
            return null;
        }
    }

    return null;
}


/* ============================================================
   GUARDAR PLAN TEMPORAL EN MEMORIA
============================================================ */

function guardarPlanTemporal(){

    if(!window.planState){
        window.planState = { atencionActual:'', cache:{} };
    }

    if(!window.planState.atencionActual) return;

    window.planState.cache[window.planState.atencionActual] = {

        medicamentos: JSON.parse(
            JSON.stringify(window.medicamentosPlanSeleccionados || [])
        ),

        ordenes: JSON.parse(
            JSON.stringify(window.ordenesMedicasPlanSeleccionadas || [])
        ),

        interconsultas: JSON.parse(
            JSON.stringify(window.interconsultasPlanSeleccionadas || [])
        ),

        plan:
            document.getElementById('hcPlanTratamiento')?.value || '',

        indicaciones:
            document.getElementById('hcIndicacionesPaciente')?.value || '',

        ordenesTexto:
            document.getElementById('hcExamenesSolicitados')?.value || '',

        interconsultaTexto:
            document.getElementById('hcInterconsultaResumen')?.value || '',
        evaluaciones:
            document.getElementById('hcEvaluacionesResumen')?.value || '',

        evaluacionesChecks:
            auroPlanCapturarEvaluaciones(),

        receta:
            document.getElementById('hcRecetaMedicamentos')?.value || ''
    };
}


/* ============================================================
   CARGAR PLAN TEMPORAL POR ATENCIÓN
============================================================ */

function cargarPlanTemporal(idAtencion){

    idAtencion = String(idAtencion || '').trim();

    limpiarPlanTemporal();

    const data = window.planState.cache[idAtencion];

    if(!data){
        auroPlanRefrescarVistas();
        return;
    }

    window.medicamentosPlanSeleccionados =
        JSON.parse(JSON.stringify(data.medicamentos || []));

    window.ordenesMedicasPlanSeleccionadas =
        JSON.parse(JSON.stringify(data.ordenes || []));

    window.interconsultasPlanSeleccionadas =
        JSON.parse(JSON.stringify(data.interconsultas || []));

    auroPlanSetValue('hcPlanTratamiento', data.plan || '');
    auroPlanSetValue('hcIndicacionesPaciente', auroPlanValorClinicoATexto(data.indicaciones || ''));
    auroPlanSetValue('hcExamenesSolicitados', data.ordenesTexto || '');
    auroPlanSetValue('hcInterconsultaResumen', data.interconsultaTexto || '');
    auroPlanRestaurarFormularioInterconsultaDesdeLista();
    auroPlanSetValue('hcEvaluacionesResumen', data.evaluaciones || '');
    auroPlanRestaurarEvaluaciones(data.evaluacionesChecks || {});
    auroPlanSetValue('hcRecetaMedicamentos', auroPlanValorClinicoATexto(data.receta || ''));

    auroPlanRefrescarVistas();
}


/* ============================================================
   LIMPIAR PLAN TEMPORAL
============================================================ */

function limpiarPlanTemporal(){

    window.auroPlanMedicamentoEditandoIndice = null;
    window.medicamentosPlanSeleccionados = [];
    window.ordenesMedicasPlanSeleccionadas = [];
    window.interconsultasPlanSeleccionadas = [];

    const campos = [
        'hcPlanTratamiento',
        'hcIndicacionesPaciente',
        'hcRecetaMedicamentos',
        'hcExamenesSolicitados',
        'hcInterconsultaResumen',
        'hcEvaluacionesResumen',
        'hcInterconsultaTipo',
        'hcInterconsultaEspecialidad',
        'hcInterconsultaProfesional',
        'hcInterconsultaMotivo',
        'hcInterconsultaObservaciones'
    ];

    campos.forEach(id => auroPlanSetValue(id, ''));

    auroPlanSetValue('hcInterconsultaPrioridad', 'Normal');
    auroPlanSetValue('hcInterconsultaEstado', 'Pendiente');

    /*
      Campos de Receta alimentados por Plan.
      Deben quedar vacíos al cambiar de atención para evitar arrastre.
    */
    auroPlanSetValue('recMedicamento', '');
    auroPlanSetValue('recIndicaciones', '');
    auroPlanSetValue('recRecomendaciones', '');

    limpiarEvaluacionesCamposPlan();

    auroPlanRefrescarVistas();
}


/* ============================================================
   SUGERENCIAS TERAPÉUTICAS AGRUPADAS POR DIAGNÓSTICO CIE-10
   IASYN PLAN 28 - TARJETAS COMPACTAS + REACTIVACIÓN CONTROLADA
   ------------------------------------------------------------
   OBJETIVO
   - Mantener las tarjetas por cada diagnóstico de la atención.
   - Mostrar medicamentos, órdenes/estudios, indicaciones, controles y alertas.
   - Permitir seleccionar SOLO los elementos que el médico decide incorporar.
   - Transferir únicamente lo seleccionado al Plan real inferior.
   - NO guardar automáticamente en Google Sheets.
   - NO modificar Diagnóstico, Recetas, backend ni la atención.
   - Mantener id_atencion como aislamiento clínico.
   ============================================================ */

function auroPlanNormalizarCodigoCie(valor){
    return String(valor || '')
        .replace(/\./g,'')
        .trim()
        .toUpperCase();
}

function auroPlanTextoSugerenciaMedicamento(item){
    if(typeof item === 'string'){
        return String(item || '').trim();
    }

    if(!item || typeof item !== 'object') return '';

    return String(
        item.med ||
        item.medicamento ||
        item.nombre ||
        item.nombre_medicamento ||
        item.principio_activo ||
        item.farmaco ||
        ''
    ).trim();
}

function auroPlanTextoSugerenciaGenerica(item, campos){
    if(typeof item === 'string') return String(item || '').trim();
    if(!item || typeof item !== 'object') return '';

    for(const campo of (campos || [])){
        const valor = String(item?.[campo] || '').trim();
        if(valor) return valor;
    }

    return Object.values(item)
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .join(' - ');
}

function auroPlanProtocolosDiagnosticosActuales(){
    try{
        if(
            window.auroDiagnosticos &&
            typeof window.auroDiagnosticos.obtenerProtocolos === 'function'
        ){
            const lista = window.auroDiagnosticos.obtenerProtocolos();
            if(Array.isArray(lista)) return lista;
        }
    }catch(error){
        console.warn('IASYN PLAN: no se pudieron leer protocolos desde Diagnóstico.', error);
    }

    const lista = window.auroDiagnosticosState?.protocolos;
    return Array.isArray(lista) ? lista : [];
}

function auroPlanDiagnosticosActuales(){
    try{
        if(
            window.auroDiagnosticos &&
            typeof window.auroDiagnosticos.obtenerDiagnosticos === 'function'
        ){
            const lista = window.auroDiagnosticos.obtenerDiagnosticos();
            if(Array.isArray(lista)) return lista;
        }
    }catch(error){
        console.warn('IASYN PLAN: no se pudieron leer diagnósticos.', error);
    }

    const lista = window.auroDiagnosticosState?.diagnosticos;
    return Array.isArray(lista) ? lista : [];
}

function auroPlanMedicamentoYaEnPlan(nombre){
    const objetivo = normalizarTextoPlan(nombre);
    if(!objetivo) return false;

    return (window.medicamentosPlanSeleccionados || []).some(function(m){
        const actual = normalizarTextoPlan(m?.med || m?.medicamento || m?.nombre || '');
        if(!actual) return false;
        return actual === objetivo ||
            (actual.length >= 6 && objetivo.includes(actual)) ||
            (objetivo.length >= 6 && actual.includes(objetivo));
    });
}

function auroPlanOrdenYaEnPlan(textoOrden){
    const objetivo = normalizarTextoPlan(textoOrden);
    if(!objetivo) return false;

    return (window.ordenesMedicasPlanSeleccionadas || []).some(function(o){        return normalizarTextoPlan(o?.orden || o?.nombre || '') === objetivo;
    });
}

function auroPlanLineaYaEnCampo(idCampo, textoLinea){
    const objetivo = normalizarTextoPlan(textoLinea);
    if(!objetivo) return false;

    return auroPlanListaClinicaDesdeValor(auroPlanGetValue(idCampo))
        .some(linea => normalizarTextoPlan(linea) === objetivo);
}

function auroPlanEsNotaNoFarmacologica(textoItem){
    const n = normalizarTextoPlan(textoItem);
    if(!n) return true;

    return (
        n.includes('no sugerir tratamiento automatico') ||
        n.includes('no sugerir medicamentos automaticos') ||
        n.includes('no aplicar automaticamente') ||
        n.startsWith('manejo hemostatico') ||
        n.startsWith('manejo hormonal')
    );
}

function auroPlanClaveSugerencia(codigo, tipo, textoItem){
    return [
        auroPlanNormalizarCodigoCie(codigo),
        String(tipo || '').trim().toLowerCase(),
        normalizarTextoPlan(textoItem)
    ].join('|');
}

window.__auroPlanSeleccionSugerenciasDx =
    window.__auroPlanSeleccionSugerenciasDx instanceof Set
        ? window.__auroPlanSeleccionSugerenciasDx
        : new Set();

/*
   IASYN PLAN 28 - ESTADO VISUAL COMPACTO
   Solo controla qué tarjeta diagnóstica está desplegada.
   No se persiste, no modifica Plan, Diagnóstico ni Google Sheets.
*/
window.__auroPlanDxExpandidoCodigo = String(window.__auroPlanDxExpandidoCodigo || '').trim();

function auroPlanAgruparSugerenciasPorDiagnostico(){
    const diagnosticos = auroPlanDiagnosticosActuales();
    const protocolos = auroPlanProtocolosDiagnosticosActuales();

    const ordenados = [...diagnosticos].sort(function(a,b){
        const ap = a?.principal === true || String(a?.principal || '').toUpperCase() === 'SI';
        const bp = b?.principal === true || String(b?.principal || '').toUpperCase() === 'SI';
        return Number(bp) - Number(ap);
    });

    return ordenados.map(function(dx){
        const codigo = auroPlanNormalizarCodigoCie(
            dx?.codigo_cie10 || dx?.codigo || dx?.cie10
        );

        const protocolosDx = protocolos.filter(function(p){
            return auroPlanNormalizarCodigoCie(p?.codigo_cie10) === codigo;
        });

        const medicamentos = new Map();
        const ordenes = new Map();
        const indicaciones = new Map();
        const controles = new Map();
        const alertas = new Map();
        const notas = new Map();

        function guardarUnico(mapa, textoItem, datos){
            const textoLimpio = String(textoItem || '').trim();
            const clave = normalizarTextoPlan(textoLimpio);
            if(!textoLimpio || !clave || mapa.has(clave)) return;
            mapa.set(clave, Object.assign({texto:textoLimpio}, datos || {}));
        }

        protocolosDx.forEach(function(p){
            const idProtocolo = String(p?.id_protocolo || '').trim();

            (Array.isArray(p?.medicamentos) ? p.medicamentos : []).forEach(function(item){
                const nombre = auroPlanTextoSugerenciaMedicamento(item);
                if(!nombre) return;

                if(auroPlanEsNotaNoFarmacologica(nombre)){
                    guardarUnico(notas, nombre, {id_protocolo:idProtocolo});
                    return;
                }

                guardarUnico(medicamentos, nombre, {
                    item:item,
                    nombre:nombre,
                    id_protocolo:idProtocolo,
                    enPlan:auroPlanMedicamentoYaEnPlan(nombre)
                });
            });

            const gruposOrden = [
                {lista:p?.ordenes, categoria:'OTROS'},
                {lista:p?.imagenes, categoria:'IMÁGENES'},
                {lista:p?.procedimientos, categoria:'PROCEDIMIENTOS'}
            ];

            gruposOrden.forEach(function(grupoOrden){
                (Array.isArray(grupoOrden.lista) ? grupoOrden.lista : []).forEach(function(item){
                    const nombre = auroPlanTextoSugerenciaGenerica(
                        item,
                        ['orden','nombre','descripcion','texto']
                    );
                    guardarUnico(ordenes, nombre, {
                        item:item,
                        id_protocolo:idProtocolo,
                        categoria: String(
                            item?.cat || item?.categoria || grupoOrden.categoria || 'OTROS'
                        ).trim() || 'OTROS',
                        enPlan:auroPlanOrdenYaEnPlan(nombre)
                    });
                });
            });

            (Array.isArray(p?.indicaciones) ? p.indicaciones : []).forEach(function(item){
                const textoItem = auroPlanTextoSugerenciaGenerica(
                    item,
                    ['indicacion','recomendacion','descripcion','texto','nombre']
                );
                guardarUnico(indicaciones, textoItem, {
                    item:item,
                    id_protocolo:idProtocolo,
                    enPlan:auroPlanLineaYaEnCampo('hcIndicacionesPaciente', textoItem)
                });
            });

            (Array.isArray(p?.controles) ? p.controles : []).forEach(function(item){
                const textoItem = auroPlanTextoSugerenciaGenerica(
                    item,
                    ['control','seguimiento','descripcion','texto','nombre']
                );
                guardarUnico(controles, textoItem, {id_protocolo:idProtocolo});
            });

            (Array.isArray(p?.alertas) ? p.alertas : []).forEach(function(item){
                const textoItem = auroPlanTextoSugerenciaGenerica(
                    item,
                    ['alerta','descripcion','texto','nombre']
                );
                guardarUnico(alertas, textoItem, {id_protocolo:idProtocolo});
            });

            const conducta = String(p?.conducta || '').trim();
            if(conducta) guardarUnico(notas, conducta, {id_protocolo:idProtocolo});
        });

        return {
            id_diagnostico:String(dx?.id_diagnostico || '').trim(),
            codigo:codigo,
            descripcion:String(dx?.descripcion || dx?.nombre || dx?.diagnostico || '').trim(),
            principal:dx?.principal === true || String(dx?.principal || '').toUpperCase() === 'SI',
            tipo:String(dx?.tipo_diagnostico || dx?.tipo || '').trim(),
            protocolos:protocolosDx,
            medicamentos:Array.from(medicamentos.values()),
            ordenes:Array.from(ordenes.values()),
            indicaciones:Array.from(indicaciones.values()),
            controles:Array.from(controles.values()),
            alertas:Array.from(alertas.values()),
            notas:Array.from(notas.values())
        };
    }).filter(function(grupo){
        return grupo.codigo || grupo.descripcion;
    });
}

function auroPlanInstalarEstilosSugerenciasDiagnosticas(){
    if(document.getElementById('auroPlanSugerenciasDxStyles')) return;

    const style = document.createElement('style');
    style.id = 'auroPlanSugerenciasDxStyles';
    style.textContent = `
      #auroPlanSugerenciasDx{
        width:100%;margin:0 0 14px;border:1px solid #ead7e2;border-radius:16px;
        background:#fff;box-shadow:0 7px 20px rgba(139,30,90,.045);overflow:hidden;
      }
      #auroPlanSugerenciasDx .auro-plan-dx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #f0e1e9;background:linear-gradient(135deg,#fff,#fffafd)}
      #auroPlanSugerenciasDx .auro-plan-dx-head-main{min-width:0}
      #auroPlanSugerenciasDx .auro-plan-dx-kicker{color:#8b1e5a;font-size:9px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
      #auroPlanSugerenciasDx .auro-plan-dx-title{margin-top:1px;color:#1f2937;font-size:13px;line-height:1.2;font-weight:950}
      #auroPlanSugerenciasDx .auro-plan-dx-help{margin-top:3px;color:#64748b;font-size:10.5px;line-height:1.35}
      #auroPlanSugerenciasDx .auro-plan-dx-head-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      #auroPlanSugerenciasDx .auro-plan-dx-badge{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:#fdf2f8;color:#8b1e5a;border:1px solid #fbcfe8;font-size:9px;font-weight:900;white-space:nowrap}
      #auroPlanSugerenciasDx .auro-plan-dx-grid{display:grid;grid-template-columns:1fr;gap:7px;padding:9px}
      #auroPlanSugerenciasDx .auro-plan-dx-card{min-width:0;border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:9px 10px;transition:border-color .15s ease,box-shadow .15s ease}
      #auroPlanSugerenciasDx .auro-plan-dx-card.principal{border-color:#efc7dd;box-shadow:inset 3px 0 0 #8b1e5a}
      #auroPlanSugerenciasDx .auro-plan-dx-card.expandida{box-shadow:0 8px 20px rgba(15,23,42,.055),inset 3px 0 0 #8b1e5a}
      #auroPlanSugerenciasDx .auro-plan-dx-card-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start}
      #auroPlanSugerenciasDx .auro-plan-dx-code-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      #auroPlanSugerenciasDx .auro-plan-dx-code{color:#8b1e5a;font-size:12px;font-weight:950}
      #auroPlanSugerenciasDx .auro-plan-dx-name{color:#1f2937;font-size:11px;line-height:1.25;font-weight:850;overflow-wrap:anywhere}
      #auroPlanSugerenciasDx .auro-plan-dx-kind{flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:8.5px;font-weight:900;white-space:nowrap}
      #auroPlanSugerenciasDx .auro-plan-dx-card.principal .auro-plan-dx-kind{background:#fdf2f8;color:#8b1e5a}
      #auroPlanSugerenciasDx .auro-plan-dx-med-resumen{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}      #auroPlanSugerenciasDx .auro-plan-dx-med-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 7px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#334155;font-size:9.5px;font-weight:800;line-height:1.15}
      #auroPlanSugerenciasDx .auro-plan-dx-med-chip.en-plan{border-color:#bbf7d0;background:#f0fdf4;color:#166534}
      #auroPlanSugerenciasDx .auro-plan-dx-med-chip input{margin:0;accent-color:#8b1e5a}
      #auroPlanSugerenciasDx .auro-plan-dx-med-chip small{font-size:7.8px;font-weight:950}
      #auroPlanSugerenciasDx .auro-plan-dx-mini-info{margin-top:6px;color:#64748b;font-size:9px;line-height:1.25}
      #auroPlanSugerenciasDx .auro-plan-dx-actions-row{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:7px;flex-wrap:wrap}
      #auroPlanSugerenciasDx .auro-plan-dx-toggle{border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:9px;padding:5px 8px;font-size:9px;font-weight:900;cursor:pointer}
      #auroPlanSugerenciasDx .auro-plan-dx-toggle:hover{background:#f8fafc}
      #auroPlanSugerenciasDx .auro-plan-dx-apply-card{border:1px solid #8b1e5a;background:#8b1e5a;color:#fff;border-radius:9px;padding:5px 8px;font-size:9px;font-weight:900;cursor:pointer}
      #auroPlanSugerenciasDx .auro-plan-dx-apply-card:disabled{opacity:.42;cursor:not-allowed}
      #auroPlanSugerenciasDx .auro-plan-dx-details{display:none;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9}
      #auroPlanSugerenciasDx .auro-plan-dx-card.expandida .auro-plan-dx-details{display:block}
      #auroPlanSugerenciasDx .auro-plan-dx-section{margin-top:8px;padding-top:7px;border-top:1px solid #f1f5f9}
      #auroPlanSugerenciasDx .auro-plan-dx-section:first-child{margin-top:0;padding-top:0;border-top:0}
      #auroPlanSugerenciasDx .auro-plan-dx-section-title{display:flex;align-items:center;gap:6px;margin-bottom:5px;color:#475569;font-size:8.7px;font-weight:950;letter-spacing:.03em;text-transform:uppercase}
      #auroPlanSugerenciasDx .auro-plan-dx-options{display:grid;gap:4px}
      #auroPlanSugerenciasDx .auro-plan-dx-option{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px;align-items:flex-start;padding:5px 6px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc;color:#334155;font-size:10px;font-weight:750;line-height:1.25;cursor:pointer}
      #auroPlanSugerenciasDx .auro-plan-dx-option input{margin-top:2px;accent-color:#8b1e5a}
      #auroPlanSugerenciasDx .auro-plan-dx-option.en-plan{border-color:#bbf7d0;background:#f0fdf4;color:#166534;cursor:default}
      #auroPlanSugerenciasDx .auro-plan-dx-option small{font-size:8px;font-weight:950;white-space:nowrap}
      #auroPlanSugerenciasDx .auro-plan-dx-readonly{display:grid;gap:4px}
      #auroPlanSugerenciasDx .auro-plan-dx-note{padding:5px 6px;border-radius:8px;background:#f8fafc;color:#475569;font-size:9.5px;line-height:1.3}
      #auroPlanSugerenciasDx .auro-plan-dx-alert{background:#fff7ed;color:#9a3412}
      #auroPlanSugerenciasDx .auro-plan-dx-empty{padding:6px 0;color:#64748b;font-size:9.5px;line-height:1.3}
      #auroPlanSugerenciasDx .auro-plan-dx-status{display:none;margin:7px 9px 0;padding:6px 8px;border-radius:9px;background:#ecfdf5;color:#166534;font-size:9.5px;font-weight:850}
      #auroPlanSugerenciasDx .auro-plan-dx-status.show{display:block}
      #auroPlanSugerenciasDx .auro-plan-dx-foot{padding:7px 10px;border-top:1px solid #f0e1e9;background:#fff;color:#64748b;font-size:9px;line-height:1.35}
      @media(max-width:560px){
        #auroPlanSugerenciasDx{border-radius:14px}
        #auroPlanSugerenciasDx .auro-plan-dx-head{display:block;padding:9px 10px}
        #auroPlanSugerenciasDx .auro-plan-dx-head-actions{justify-content:flex-start;margin-top:6px}
        #auroPlanSugerenciasDx .auro-plan-dx-grid{padding:7px;gap:6px}
        #auroPlanSugerenciasDx .auro-plan-dx-card{padding:8px}
        #auroPlanSugerenciasDx .auro-plan-dx-card-top{grid-template-columns:1fr}
        #auroPlanSugerenciasDx .auro-plan-dx-kind{justify-self:start}
        #auroPlanSugerenciasDx .auro-plan-dx-med-chip{border-radius:9px}
        #auroPlanSugerenciasDx .auro-plan-dx-actions-row{justify-content:stretch}
        #auroPlanSugerenciasDx .auro-plan-dx-toggle,
        #auroPlanSugerenciasDx .auro-plan-dx-apply-card{flex:1 1 auto}
      }
    `;

    document.head.appendChild(style);
}

function auroPlanInstalarVisorSugerenciasDiagnosticas(){
    auroPlanInstalarEstilosSugerenciasDiagnosticas();

    if(document.getElementById('auroPlanSugerenciasDx')) return true;

    const busqueda = document.getElementById('hcMedBusqueda');
    const cajaMedicamentos = busqueda?.closest('.receta-medicamentos-box');

    if(!cajaMedicamentos) return false;

    const visor = document.createElement('div');
    visor.id = 'auroPlanSugerenciasDx';
    visor.setAttribute('aria-live','polite');

    cajaMedicamentos.insertAdjacentElement('beforebegin', visor);
    return true;
}

function auroPlanSeccionSeleccionableDx(titulo, icono, tipo, items, grupoIndex, codigoGrupo){
    const lista = Array.isArray(items) ? items : [];
    if(!lista.length) return '';

    return `
      <div class="auro-plan-dx-section">
        <div class="auro-plan-dx-section-title"><i class="bi ${icono}"></i> ${escapeHtmlPlan(titulo)}</div>
        <div class="auro-plan-dx-options">
          ${lista.map(function(item, itemIndex){
              const textoItem = String(item?.nombre || item?.texto || '').trim();
              const enPlan = !!item?.enPlan;
              const clave = auroPlanClaveSugerencia(codigoGrupo, tipo, textoItem);
              const seleccionada = !enPlan && window.__auroPlanSeleccionSugerenciasDx.has(clave);
              return `
                <label class="auro-plan-dx-option ${enPlan ? 'en-plan' : ''}">
                  <input type="checkbox"
                         data-auro-dx-select="1"
                         data-grupo-index="${grupoIndex}"
                         data-tipo="${escapeHtmlPlan(tipo)}"
                         data-item-index="${itemIndex}"
                         ${enPlan ? 'checked disabled' : (seleccionada ? 'checked' : '')}>
                  <span>${escapeHtmlPlan(textoItem)}</span>
                  ${enPlan ? '<small>EN PLAN</small>' : '<small>Seleccionar</small>'}
                </label>`;
          }).join('')}
        </div>
      </div>`;
}

function auroPlanSeccionLecturaDx(titulo, icono, items, alerta){
    const lista = Array.isArray(items) ? items : [];
    if(!lista.length) return '';

    return `
      <div class="auro-plan-dx-section">
        <div class="auro-plan-dx-section-title"><i class="bi ${icono}"></i> ${escapeHtmlPlan(titulo)}</div>
        <div class="auro-plan-dx-readonly">
          ${lista.map(item => `<div class="auro-plan-dx-note ${alerta ? 'auro-plan-dx-alert' : ''}">${escapeHtmlPlan(item?.texto || '')}</div>`).join('')}
        </div>
      </div>`;
}

function auroPlanMedicamentosResumenCompactoDx(grupo, grupoIndex){
    const lista = Array.isArray(grupo?.medicamentos) ? grupo.medicamentos : [];
    if(!lista.length){
        return '<div class="auro-plan-dx-mini-info">Sin medicamentos automáticos sugeridos.</div>';
    }

    return `<div class="auro-plan-dx-med-resumen">${lista.map(function(item, itemIndex){
        const textoItem = String(item?.nombre || item?.texto || '').trim();
        const enPlan = !!item?.enPlan;
        const clave = auroPlanClaveSugerencia(grupo?.codigo, 'medicamento', textoItem);
        const seleccionada = !enPlan && window.__auroPlanSeleccionSugerenciasDx.has(clave);
        return `<label class="auro-plan-dx-med-chip ${enPlan ? 'en-plan' : ''}">
          <input type="checkbox"
                 data-auro-dx-select="1"
                 data-grupo-index="${grupoIndex}"
                 data-tipo="medicamento"
                 data-item-index="${itemIndex}"
                 ${enPlan ? 'checked disabled' : (seleccionada ? 'checked' : '')}>
          <span>${escapeHtmlPlan(textoItem)}</span>
          ${enPlan ? '<small>EN PLAN</small>' : ''}
        </label>`;
    }).join('')}</div>`;
}

function auroPlanRenderSugerenciasDiagnosticas(){
    if(!auroPlanInstalarVisorSugerenciasDiagnosticas()) return;

    const visor = document.getElementById('auroPlanSugerenciasDx');
    if(!visor) return;

    const grupos = auroPlanAgruparSugerenciasPorDiagnostico();
    const conProtocolo = grupos.filter(function(g){ return g.protocolos.length > 0; }).length;

    if(!grupos.length){
        visor.innerHTML = `
          <div class="auro-plan-dx-head">
            <div class="auro-plan-dx-head-main">
              <div class="auro-plan-dx-kicker">Apoyo clínico CIE-10</div>
              <div class="auro-plan-dx-title">Sugerencias terapéuticas por diagnóstico</div>
              <div class="auro-plan-dx-help">Aún no hay diagnósticos sincronizados para esta atención.</div>
            </div>
            <span class="auro-plan-dx-badge">Sin diagnósticos</span>
          </div>`;
        return;
    }

    visor.innerHTML = `
      <div class="auro-plan-dx-head">
        <div class="auro-plan-dx-head-main">
          <div class="auro-plan-dx-kicker">Apoyo clínico CIE-10</div>
          <div class="auro-plan-dx-title">Sugerencias terapéuticas por diagnóstico</div>
          <div class="auro-plan-dx-help">Seleccione medicamentos directamente. Use “Ver más” solo para órdenes, indicaciones, seguimiento y alertas.</div>
        </div>
        <div class="auro-plan-dx-head-actions">
          <span class="auro-plan-dx-badge">${grupos.length} diagnóstico(s) · ${conProtocolo} con protocolo</span>
        </div>
      </div>

      <div class="auro-plan-dx-status" id="auroPlanSugerenciasDxStatus"></div>

      <div class="auro-plan-dx-grid">
        ${grupos.map(function(g, grupoIndex){
            const codigo = String(g.codigo || '').trim();
            const expandida = !!codigo && window.__auroPlanDxExpandidoCodigo === codigo;
            const pendientes =
              (g.medicamentos || []).filter(x => !x.enPlan).length +
              (g.ordenes || []).filter(x => !x.enPlan).length +
              (g.indicaciones || []).filter(x => !x.enPlan).length;

            const detalles = [
              auroPlanSeccionSeleccionableDx('Órdenes / estudios / procedimientos','bi-file-earmark-medical','orden',g.ordenes,grupoIndex,g.codigo),
              auroPlanSeccionSeleccionableDx('Indicaciones para el paciente','bi-clipboard-check','indicacion',g.indicaciones,grupoIndex,g.codigo),
              auroPlanSeccionLecturaDx('Seguimiento sugerido','bi-calendar-check',g.controles,false),
              auroPlanSeccionLecturaDx('Alertas clínicas','bi-exclamation-triangle',g.alertas,true),
              auroPlanSeccionLecturaDx('Notas del protocolo','bi-info-circle',g.notas,false)
            ].filter(Boolean).join('');

            const cantidadAdicional =
              (g.ordenes || []).length +
              (g.indicaciones || []).length +
              (g.controles || []).length +
              (g.alertas || []).length +
              (g.notas || []).length;

            return `
              <div class="auro-plan-dx-card ${g.principal ? 'principal' : ''} ${expandida ? 'expandida' : ''}" data-auro-dx-card-index="${grupoIndex}">
                <div class="auro-plan-dx-card-top">
                  <div>
                    <div class="auro-plan-dx-code-line">
                      <span class="auro-plan-dx-code">${escapeHtmlPlan(g.codigo || 'S/C')}</span>
                      <span class="auro-plan-dx-name">${escapeHtmlPlan(g.descripcion || 'Sin descripción')}</span>
                    </div>
                  </div>
                  <span class="auro-plan-dx-kind">${g.principal ? 'Principal' : 'Asociado'}${g.tipo ? ' · ' + escapeHtmlPlan(g.tipo) : ''}</span>
                </div>
                ${!g.protocolos.length
                    ? '<div class="auro-plan-dx-empty">No hay protocolo clínico configurado para este CIE-10.</div>'
                    : auroPlanMedicamentosResumenCompactoDx(g, grupoIndex)}

                ${g.protocolos.length ? `
                  <div class="auro-plan-dx-actions-row">
                    ${cantidadAdicional ? `<button type="button" class="auro-plan-dx-toggle" data-auro-dx-toggle="${grupoIndex}" aria-expanded="${expandida ? 'true' : 'false'}">
                      <i class="bi ${expandida ? 'bi-chevron-up' : 'bi-chevron-down'} me-1"></i>${expandida ? 'Ocultar detalles' : 'Ver más'}
                    </button>` : ''}
                    <button type="button" class="auro-plan-dx-apply-card" data-auro-dx-aplicar-card="${grupoIndex}" ${pendientes ? '' : 'disabled'}>
                      <i class="bi bi-arrow-down-circle me-1"></i>${pendientes ? 'Añadir seleccionados' : 'En Plan'}
                    </button>
                  </div>
                  <div class="auro-plan-dx-details">
                    ${detalles || '<div class="auro-plan-dx-empty">No hay información adicional configurada.</div>'}
                  </div>` : ''}
              </div>`;
        }).join('')}
      </div>

      <div class="auro-plan-dx-foot">
        Las tarjetas son sugerencias clínicas. Solo pasa al Plan lo que el médico seleccione expresamente.
      </div>`;
}

function auroPlanBuscarMedicamentoBaseSugerido(nombre){
    const objetivo = normalizarTextoPlan(nombre);
    if(!objetivo) return null;

    const base = Array.isArray(window.MEDICAMENTOS_IASYN_BASE)
        ? window.MEDICAMENTOS_IASYN_BASE
        : [];

    let exacto = base.find(item =>
        normalizarTextoPlan(item?.med || item?.medicamento || item?.nombre || '') === objetivo
    );
    if(exacto) return exacto;

    return base.find(item => {
        const actual = normalizarTextoPlan(item?.med || item?.medicamento || item?.nombre || '');
        return actual && actual.length >= 5 &&
            (objetivo.includes(actual) || actual.includes(objetivo));
    }) || null;
}

function auroPlanConstruirMedicamentoDesdeSugerencia(itemSugerido, grupo){
    const original = itemSugerido?.item;
    const obj = original && typeof original === 'object' && !Array.isArray(original)
        ? original
        : {};
    const nombre = String(itemSugerido?.nombre || itemSugerido?.texto || '').trim();
    const base = auroPlanBuscarMedicamentoBaseSugerido(nombre) || {};

    return {
        med:String(obj.med || obj.medicamento || obj.nombre || base.med || nombre || '').trim(),
        pres:String(obj.pres || obj.presentacion || base.pres || '').trim(),
        via:String(obj.via || base.via || '').trim(),
        cantidad:String(obj.cantidad || obj.cant || base.cantidad || '').trim(),
        frec:String(obj.frec || obj.frecuencia || base.frec || '').trim(),
        dur:String(obj.dur || obj.duracion || base.dur || '').trim(),
        ind:String(obj.ind || obj.indicaciones || base.ind || '').trim(),
        continuo:String(obj.continuo || 'No').trim() || 'No',
        codigo_cie10:String(grupo?.codigo || '').trim(),
        id_diagnostico:String(grupo?.id_diagnostico || '').trim(),
        id_protocolo:String(itemSugerido?.id_protocolo || '').trim(),
        origen:'PROTOCOLO'
    };
}

function auroPlanAgregarLineaClinicaUnica(idCampo, textoLinea){
    const linea = String(textoLinea || '').trim();
    if(!linea) return false;

    const lista = auroPlanListaClinicaDesdeValor(auroPlanGetValue(idCampo));
    const clave = normalizarTextoPlan(linea);
    if(lista.some(x => normalizarTextoPlan(x) === clave)) return false;

    auroPlanSetValue(idCampo, [...lista, linea].join('\n'));
    const campo = document.getElementById(idCampo);
    if(campo){
        campo.dispatchEvent(new Event('input',{bubbles:true}));
        campo.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return true;
}

function auroPlanSugerenciasSeleccionadasDesdeDOM(grupoLimitado){
    const visor = document.getElementById('auroPlanSugerenciasDx');
    if(!visor) return [];

    const grupos = auroPlanAgruparSugerenciasPorDiagnostico();
    const selector = grupoLimitado === null || grupoLimitado === undefined
        ? 'input[data-auro-dx-select="1"]:checked:not(:disabled)'
        : `[data-auro-dx-card-index="${grupoLimitado}"] input[data-auro-dx-select="1"]:checked:not(:disabled)`;

    return Array.from(visor.querySelectorAll(selector)).map(input => {
        const grupoIndex = Number(input.dataset.grupoIndex);
        const itemIndex = Number(input.dataset.itemIndex);
        const tipo = String(input.dataset.tipo || '');
        const grupo = grupos[grupoIndex];
        if(!grupo) return null;

        const coleccion = tipo === 'medicamento'
            ? grupo.medicamentos
            : (tipo === 'orden' ? grupo.ordenes : grupo.indicaciones);
        const item = Array.isArray(coleccion) ? coleccion[itemIndex] : null;
        if(!item) return null;

        return {grupoIndex, tipo, grupo, item, input};
    }).filter(Boolean);
}

function auroPlanAplicarSeleccionadosSugerenciasDx(grupoLimitado){
    const idAtencionActiva = String(
        typeof auroPlanObtenerIdAtencionActivaSeguro === 'function'
            ? auroPlanObtenerIdAtencionActivaSeguro()
            : ''
    ).trim();
    const idPlan = String(window.planState?.atencionActual || '').trim();

    if(idAtencionActiva && idPlan && idAtencionActiva !== idPlan){
        alert('El Plan visible pertenece a otra atención. Abra nuevamente la consulta correcta antes de incorporar sugerencias.');
        return;
    }

    const seleccionados = auroPlanSugerenciasSeleccionadasDesdeDOM(grupoLimitado);
    if(!seleccionados.length){
        alert('Seleccione al menos una sugerencia antes de añadirla al Plan.');
        return;
    }

    window.medicamentosPlanSeleccionados = Array.isArray(window.medicamentosPlanSeleccionados)
        ? window.medicamentosPlanSeleccionados
        : [];
    window.ordenesMedicasPlanSeleccionadas = Array.isArray(window.ordenesMedicasPlanSeleccionadas)
        ? window.ordenesMedicasPlanSeleccionadas
        : [];

    let medsAgregados = 0;
    let ordenesAgregadas = 0;
    let indicacionesAgregadas = 0;

    seleccionados.forEach(sel => {
        if(sel.tipo === 'medicamento'){
            const nuevo = auroPlanConstruirMedicamentoDesdeSugerencia(sel.item, sel.grupo);
            if(!nuevo.med || auroPlanMedicamentoYaEnPlan(nuevo.med)) return;
            window.medicamentosPlanSeleccionados.push(nuevo);
            medsAgregados++;
        }

        if(sel.tipo === 'orden'){
            const nombreOrden = String(sel.item?.texto || '').trim();
            if(!nombreOrden || auroPlanOrdenYaEnPlan(nombreOrden)) return;

            window.ordenesMedicasPlanSeleccionadas = auroPlanOrdenesUnicas([
                ...(window.ordenesMedicasPlanSeleccionadas || []),
                {
                    orden:nombreOrden,
                    cat:String(sel.item?.categoria || 'OTROS').trim() || 'OTROS',
                    obs:'',
                    codigo_cie10:String(sel.grupo?.codigo || '').trim(),
                    id_diagnostico:String(sel.grupo?.id_diagnostico || '').trim(),
                    id_protocolo:String(sel.item?.id_protocolo || '').trim(),
                    origen:'PROTOCOLO'
                }
            ]);
            ordenesAgregadas++;
        }

        if(sel.tipo === 'indicacion'){
            if(auroPlanAgregarLineaClinicaUnica('hcIndicacionesPaciente', sel.item?.texto || '')){
                indicacionesAgregadas++;
            }
        }

        const textoItem = String(sel.item?.nombre || sel.item?.texto || '').trim();
        window.__auroPlanSeleccionSugerenciasDx.delete(
            auroPlanClaveSugerencia(sel.grupo?.codigo, sel.tipo, textoItem)
        );
    });

    renderMedicamentosPlanTabla();
    renderOrdenesMedicasTabla();
    recopilarOrdenesMedicasPlan();
    sincronizarPlanConReceta();
    guardarPlanTemporal();
    auroPlanRenderSugerenciasDiagnosticas();

    const status = document.getElementById('auroPlanSugerenciasDxStatus');
    if(status){
        status.textContent = [
            medsAgregados ? medsAgregados + ' medicamento(s)' : '',
            ordenesAgregadas ? ordenesAgregadas + ' orden(es)' : '',
            indicacionesAgregadas ? indicacionesAgregadas + ' indicación(es)' : ''
        ].filter(Boolean).join(' · ') || 'Los elementos seleccionados ya estaban incorporados.';
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 4500);
    }
}
function auroPlanInstalarEventosSugerenciasDiagnosticas(){
    if(window.__auroPlanEventosSugerenciasDxInstalados) return;
    window.__auroPlanEventosSugerenciasDxInstalados = true;

    document.addEventListener('aurosanax:protocolos-diagnostico-listos', function(){
        auroPlanRenderSugerenciasDiagnosticas();
    });

    document.addEventListener('aurosanax:diagnosticos-actualizados', function(){
        setTimeout(auroPlanRenderSugerenciasDiagnosticas, 0);
    });

    document.addEventListener('aurosanax:diagnostico-aplicado-plan', function(){
        setTimeout(auroPlanRenderSugerenciasDiagnosticas, 0);
    });

    document.addEventListener('aurosanax:atencion-cambiada', function(){
        window.__auroPlanSeleccionSugerenciasDx.clear();
        window.__auroPlanDxExpandidoCodigo = '';
        setTimeout(auroPlanRenderSugerenciasDiagnosticas, 40);
    });

    document.addEventListener('change', function(evento){
        const input = evento.target?.closest?.('#auroPlanSugerenciasDx input[data-auro-dx-select="1"]');
        if(!input || input.disabled) return;

        const grupos = auroPlanAgruparSugerenciasPorDiagnostico();
        const grupo = grupos[Number(input.dataset.grupoIndex)];
        const tipo = String(input.dataset.tipo || '');
        if(!grupo) return;

        const coleccion = tipo === 'medicamento'
            ? grupo.medicamentos
            : (tipo === 'orden' ? grupo.ordenes : grupo.indicaciones);
        const item = Array.isArray(coleccion) ? coleccion[Number(input.dataset.itemIndex)] : null;
        if(!item) return;

        const clave = auroPlanClaveSugerencia(
            grupo.codigo,
            tipo,
            item.nombre || item.texto || ''
        );

        if(input.checked) window.__auroPlanSeleccionSugerenciasDx.add(clave);
        else window.__auroPlanSeleccionSugerenciasDx.delete(clave);
    });

    document.addEventListener('input', function(evento){
        if(evento.target?.id !== 'hcIndicacionesPaciente') return;
        clearTimeout(window.__auroPlanDxIndicacionesRenderTimer);
        window.__auroPlanDxIndicacionesRenderTimer = setTimeout(function(){
            auroPlanRenderSugerenciasDiagnosticas();
        }, 120);
    });

    document.addEventListener('click', function(evento){
        const toggle = evento.target?.closest?.('#auroPlanSugerenciasDx [data-auro-dx-toggle]');
        if(toggle){
            const grupos = auroPlanAgruparSugerenciasPorDiagnostico();
            const grupo = grupos[Number(toggle.dataset.auroDxToggle)];
            const codigo = String(grupo?.codigo || '').trim();
            window.__auroPlanDxExpandidoCodigo = window.__auroPlanDxExpandidoCodigo === codigo ? '' : codigo;
            auroPlanRenderSugerenciasDiagnosticas();
            return;
        }

        const card = evento.target?.closest?.('#auroPlanSugerenciasDx [data-auro-dx-aplicar-card]');
        if(card){
            auroPlanAplicarSeleccionadosSugerenciasDx(Number(card.dataset.auroDxAplicarCard));
        }
    });
}

auroPlanInstalarEventosSugerenciasDiagnosticas();


/* ============================================================
   MEDICAMENTOS DEL PLAN
============================================================ */

function normalizarMedTexto(t){
    return normalizarTextoPlan(t);
}

function renderMedicamentoSugerencias(){

    const input = document.getElementById('hcMedBusqueda');
    const box = document.getElementById('hcMedSugerencias');

    if(!input || !box) return;

    const q = normalizarMedTexto(input.value);

    const base = Array.isArray(window.MEDICAMENTOS_IASYN_BASE)
        ? window.MEDICAMENTOS_IASYN_BASE
        : [];

    const res = base
        .filter(m => !q || normalizarMedTexto(
            (m.med || '') + ' ' + (m.pres || '') + ' ' + (m.cat || '')
        ).includes(q))
        .slice(0,40);

    if(!res.length){
        box.innerHTML =
            '<div class="med-sug-item text-muted">Sin coincidencias. Puede escribirlo manualmente y agregar.</div>';
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = res.map(m => `
        <div class="med-sug-item"
             data-med="${escapeHtmlPlan(m.med)}"
             data-pres="${escapeHtmlPlan(m.pres)}"
             data-via="${escapeHtmlPlan(m.via)}"
             data-frec="${escapeHtmlPlan(m.frec)}"
             data-dur="${escapeHtmlPlan(m.dur)}"
             data-ind="${escapeHtmlPlan(m.ind)}">
          <div>• ${escapeHtmlPlan(m.med)} <span class="text-muted">${escapeHtmlPlan(m.pres)}</span></div>
          <div class="med-sug-cat">${escapeHtmlPlan(m.cat)}</div>
        </div>
    `).join('');

    box.classList.remove('d-none');
}

function seleccionarMedicamentoSugerido(el){

    if(!el) return;

    auroPlanSetValue('hcMedBusqueda', el.dataset.med || '');
    auroPlanSetValue('hcMedPresentacion', el.dataset.pres || '');
    auroPlanSetValue('hcMedVia', el.dataset.via || '');
    auroPlanSetValue('hcMedFrecuencia', el.dataset.frec || '');
    auroPlanSetValue('hcMedDuracion', el.dataset.dur || '');
    auroPlanSetValue('hcMedIndicaciones', el.dataset.ind || '');

    const box = document.getElementById('hcMedSugerencias');
    if(box) box.classList.add('d-none');
}

function limpiarFormularioMedicamento(opciones){

    opciones = opciones || {};

    [
        'hcMedBusqueda',
        'hcMedPresentacion',
        'hcMedCantidad',
        'hcMedFrecuencia',
        'hcMedDuracion',
        'hcMedIndicaciones'
    ].forEach(id => auroPlanSetValue(id, ''));

    auroPlanSetValue('hcMedVia', '');
    auroPlanSetValue('hcMedContinuo', 'No');

    const selectorIndicacion = document.getElementById('auroPlanIndicacionRapida');
    if(selectorIndicacion) selectorIndicacion.value = '';

    const box = document.getElementById('hcMedSugerencias');
    if(box) box.classList.add('d-none');

    if(opciones.conservarEdicion !== true){
        window.auroPlanMedicamentoEditandoIndice = null;
    }

    auroPlanActualizarEstadoEdicionMedicamento();
}

function auroPlanMedicamentoDesdeFormulario(){
    return {
        med: (auroPlanGetValue('hcMedBusqueda') || '').trim(),
        pres: auroPlanGetValue('hcMedPresentacion'),
        via: auroPlanGetValue('hcMedVia'),
        cantidad: auroPlanGetValue('hcMedCantidad'),
        frec: auroPlanGetValue('hcMedFrecuencia'),
        dur: auroPlanGetValue('hcMedDuracion'),
        ind: auroPlanGetValue('hcMedIndicaciones'),
        continuo: auroPlanGetValue('hcMedContinuo') || 'No'
    };
}

function agregarMedicamentoDesdeFormulario(){

    const nuevo = auroPlanMedicamentoDesdeFormulario();

    if(!nuevo.med){
        alert('Ingrese o seleccione un medicamento.');
        return;
    }

    const indice = window.auroPlanMedicamentoEditandoIndice;
    const editando = Number.isInteger(indice) &&
        indice >= 0 &&
        indice < (window.medicamentosPlanSeleccionados || []).length;

    if(editando){
        const anterior = window.medicamentosPlanSeleccionados[indice] || {};
        /*
          Conserva cualquier propiedad adicional proveniente de protocolos
          inteligentes, pero actualiza únicamente los campos visibles del Plan.
        */
        window.medicamentosPlanSeleccionados[indice] = {
            ...anterior,
            ...nuevo
        };
    }else{
        window.medicamentosPlanSeleccionados.push(nuevo);
    }

    limpiarFormularioMedicamento();
    renderMedicamentosPlanTabla();
    sincronizarPlanConReceta();
    guardarPlanTemporal();
    auroPlanRenderSugerenciasDiagnosticas();
}

function editarMedicamentoPlan(i){

    i = Number(i);

    if(
        Number.isNaN(i) ||
        i < 0 ||
        i >= (window.medicamentosPlanSeleccionados || []).length
    ){
        return;
    }

    const m = window.medicamentosPlanSeleccionados[i] || {};

    window.auroPlanMedicamentoEditandoIndice = i;

    auroPlanSetValue('hcMedBusqueda', m.med || '');
    auroPlanSetValue('hcMedPresentacion', m.pres || '');
    auroPlanSetValue('hcMedVia', m.via || '');
    auroPlanSetValue('hcMedCantidad', m.cantidad || '');
    auroPlanSetValue('hcMedFrecuencia', m.frec || '');
    auroPlanSetValue('hcMedDuracion', m.dur || '');
    auroPlanSetValue('hcMedIndicaciones', m.ind || '');
    auroPlanSetValue('hcMedContinuo', m.continuo || 'No');

    auroPlanActualizarEstadoEdicionMedicamento();

    const formulario = document.getElementById('hcMedBusqueda');
    if(formulario){
        formulario.focus();
        formulario.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}

function cancelarEdicionMedicamentoPlan(opciones){

    opciones = opciones || {};
    window.auroPlanMedicamentoEditandoIndice = null;

    if(opciones.limpiarFormulario !== false){
        limpiarFormularioMedicamento();
    }else{
        auroPlanActualizarEstadoEdicionMedicamento();
    }
}

function eliminarMedicamentoPlan(i){

    i = Number(i);

    if(Number.isNaN(i)) return;

    const indiceEditando = window.auroPlanMedicamentoEditandoIndice;

    window.medicamentosPlanSeleccionados.splice(i,1);

    if(Number.isInteger(indiceEditando)){
        if(indiceEditando === i){
            cancelarEdicionMedicamentoPlan();
        }else if(indiceEditando > i){
            window.auroPlanMedicamentoEditandoIndice = indiceEditando - 1;
        }
    }

    renderMedicamentosPlanTabla();
    sincronizarPlanConReceta();
    guardarPlanTemporal();
    auroPlanRenderSugerenciasDiagnosticas();
}

function textoRecetaMedicamentosPlan(){

    return (window.medicamentosPlanSeleccionados || []).map((m,i) => {

        const linea = [
            `${i + 1}. ${m.med || ''}`,
            m.pres || '',
            auroPlanNombreViaCompleta(m.via) || '',
            m.cantidad ? `Cantidad: ${m.cantidad}` : '',
            m.frec || '',
            m.dur ? `por ${m.dur}` : '',
            m.ind || ''
        ].filter(Boolean).join(' - ');

        return m.continuo === 'Sí'
            ? linea + ' - Tratamiento continuo'
            : linea;

    }).join('\n');
}

function renderMedicamentosPlanTabla(){

    const tbody = document.getElementById('hcMedicamentosTableBody');
    const hidden = document.getElementById('hcRecetaMedicamentos');

    if(!tbody) return;

    const meds = window.medicamentosPlanSeleccionados || [];

    if(!meds.length){

        tbody.innerHTML = `
            <tr id="hcMedicamentosEmpty">
              <td colspan="9" class="text-center text-muted py-3">
                <i class="bi bi-capsule me-1"></i> Sin medicamentos agregados
              </td>
            </tr>
        `;

    }else{

        tbody.innerHTML = meds.map((m,i) => `
            <tr>
              <td>${escapeHtmlPlan(m.med)}</td>
              <td>${escapeHtmlPlan(m.pres)}</td>
              <td>${escapeHtmlPlan(auroPlanNombreViaCompleta(m.via))}</td>
              <td>${
                  String(m.cantidad || '').trim()
                      ? escapeHtmlPlan(m.cantidad)
                      : '<span class="auro-plan-pendiente" title="Complete la cantidad antes de emitir la receta">Pendiente</span>'
              }</td>
              <td>${escapeHtmlPlan(m.frec)}</td>
              <td>${escapeHtmlPlan(m.dur)}</td>
              <td>${escapeHtmlPlan(m.ind)}</td>
              <td>${escapeHtmlPlan(m.continuo)}</td>
              <td>
                <div class="auro-plan-acciones-medicamento">
                  <button type="button"
                          class="btn btn-sm btn-outline-primary"
                          title="Editar medicamento"
                          aria-label="Editar medicamento ${i + 1}"
                          onclick="editarMedicamentoPlan(${i})">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button type="button"
                          class="btn btn-sm btn-outline-danger"
                          title="Eliminar medicamento"
                          aria-label="Eliminar medicamento ${i + 1}"
                          onclick="eliminarMedicamentoPlan(${i})">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
        `).join('');
    }

    if(hidden){
        hidden.value = textoRecetaMedicamentosPlan();
    }

    auroPlanActualizarEncabezadosTablaMedicamentos();
    auroPlanActualizarEstadoEdicionMedicamento();

    if(typeof updateClinicalSummary === 'function'){
        updateClinicalSummary();
    }
}

function sincronizarPlanConReceta(){

    const txt = auroPlanGetValue('hcRecetaMedicamentos');

    /*
      Siempre sincronizar, incluso cuando está vacío.
      Así una consulta nueva no conserva medicamentos de la receta anterior.
    */
    auroPlanSetValue('recMedicamento', txt);

    const ind = auroPlanGetValue('hcIndicacionesPaciente');
    if(ind && !auroPlanGetValue('recIndicaciones')){
        auroPlanSetValue('recIndicaciones', ind);
    }

    const plan = auroPlanGetValue('hcPlanTratamiento');
    if(plan && !auroPlanGetValue('recRecomendaciones')){
        auroPlanSetValue('recRecomendaciones', plan);
    }

    const cie = auroPlanGetValue('hcCie10Principal');
    if(cie && !auroPlanGetValue('recCie10')){
        auroPlanSetValue('recCie10', cie);
    }

    const dx = auroPlanGetValue('hcDiagnosticoPrincipal');
    if(dx && !auroPlanGetValue('recDiagnostico')){
        auroPlanSetValue('recDiagnostico', dx);
    }

    const recFecha = document.getElementById('recFecha');
    if(recFecha && !recFecha.value && typeof fechaHoyISO === 'function'){
        recFecha.value = fechaHoyISO();
    }
}

function limpiarMedicamentosPlan(){

    window.auroPlanMedicamentoEditandoIndice = null;
    window.medicamentosPlanSeleccionados = [];

    renderMedicamentosPlanTabla();
    sincronizarPlanConReceta();
    guardarPlanTemporal();
}


/* ============================================================
   ÓRDENES MÉDICAS DEL PLAN
============================================================ */

function normalizarOrdenTexto(t){
    return normalizarTextoPlan(t);
}

function renderOrdenesSugerencias(){

    const input = document.getElementById('hcOrdenBusqueda');
    const box = document.getElementById('hcOrdenSugerencias');

    if(!input || !box) return;

    const q = normalizarOrdenTexto(input.value);
    const tipoFiltro = normalizarOrdenTexto(auroPlanGetValue('hcOrdenTipo'));

    const base = Array.isArray(window.ORDENES_MEDICAS_IASYN_BASE)
        ? window.ORDENES_MEDICAS_IASYN_BASE
        : [];

    const res = base
        .filter(o => {
            const texto = normalizarOrdenTexto((o.orden || '') + ' ' + (o.cat || ''));
            const coincideTexto = !q || texto.includes(q);
            const coincideTipo = !tipoFiltro || normalizarOrdenTexto(o.cat || '').includes(tipoFiltro);
            return coincideTexto && coincideTipo;
        })
        .slice(0,40);

    if(!res.length){
        box.innerHTML =
            '<div class="orden-sug-item text-muted">Sin coincidencias. Puede escribirlo manualmente y agregar.</div>';
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = res.map(o => `
        <div class="orden-sug-item"
             data-orden="${escapeHtmlPlan(o.orden)}"
             data-cat="${escapeHtmlPlan(o.cat)}">
          <div>• ${escapeHtmlPlan(o.orden)}</div>
          <div class="orden-sug-cat">${escapeHtmlPlan(o.cat)}</div>
        </div>
    `).join('');

    box.classList.remove('d-none');
}

function seleccionarOrdenSugerida(el){

    if(!el) return;

    auroPlanSetValue('hcOrdenBusqueda', el.dataset.orden || '');
    auroPlanSetValue('hcOrdenTipo', el.dataset.cat || '');

    const box = document.getElementById('hcOrdenSugerencias');
    if(box) box.classList.add('d-none');
}

function limpiarFormularioOrdenMedica(){

    auroPlanSetValue('hcOrdenTipo', '');
    auroPlanSetValue('hcOrdenBusqueda', '');
    auroPlanSetValue('hcOrdenObservacion', '');

    const box = document.getElementById('hcOrdenSugerencias');
    if(box) box.classList.add('d-none');
}

function agregarOrdenMedicaDesdeFormulario(){

    const orden = (auroPlanGetValue('hcOrdenBusqueda') || '').trim();

    if(!orden){
        alert('Ingrese o seleccione una orden médica.');
        return;
    }

    window.ordenesMedicasPlanSeleccionadas = auroPlanOrdenesUnicas([
        ...(window.ordenesMedicasPlanSeleccionadas || []),
        {
            orden,
            cat: auroPlanGetValue('hcOrdenTipo') || 'OTROS',
            obs: auroPlanGetValue('hcOrdenObservacion')
        }
    ]);

    limpiarFormularioOrdenMedica();
    renderOrdenesMedicasTabla();
    recopilarOrdenesMedicasPlan();
    guardarPlanTemporal();
}

function eliminarOrdenMedica(i){

    i = Number(i);

    if(Number.isNaN(i)) return;

    window.ordenesMedicasPlanSeleccionadas.splice(i,1);

    renderOrdenesMedicasTabla();
    recopilarOrdenesMedicasPlan();
    guardarPlanTemporal();

    /* IASYN PLAN 28: al retirar una orden del Plan, vuelve a quedar seleccionable en su tarjeta. */
    auroPlanRenderSugerenciasDiagnosticas();
}

function renderOrdenesMedicasTabla(){

    const tbody = document.getElementById('hcOrdenesTableBody');

    if(!tbody) return;

    const ordenes = window.ordenesMedicasPlanSeleccionadas || [];

    if(!ordenes.length){

        tbody.innerHTML = `
            <tr id="hcOrdenesEmpty">
              <td colspan="4" class="text-center text-muted py-3">
                <i class="bi bi-file-earmark-medical me-1"></i> Sin registros
              </td>
            </tr>
        `;

        auroPlanSetValue('hcExamenesSolicitados', '');
        return;
    }

    tbody.innerHTML = ordenes.map((o,i) => `
        <tr>
          <td>${escapeHtmlPlan(o.orden)}</td>
          <td>${escapeHtmlPlan(o.cat)}</td>
          <td>${escapeHtmlPlan(o.obs)}</td>
          <td>
            <button type="button"
                    class="btn btn-sm btn-outline-danger"
                    onclick="eliminarOrdenMedica(${i})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
    `).join('');

    recopilarOrdenesMedicasPlan();
}

function textoOrdenesMedicasPlan(){

    return (window.ordenesMedicasPlanSeleccionadas || []).map((o,i) => {
        return [
            `${i + 1}. ${o.orden || ''}`,
            o.cat ? `Categoría: ${o.cat}` : '',
            o.obs ? `Observación: ${o.obs}` : ''
        ].filter(Boolean).join(' - ');
    }).join('\n');
}

function recopilarOrdenesMedicasPlan(){

    auroPlanSetValue('hcExamenesSolicitados', textoOrdenesMedicasPlan());

    return auroPlanGetValue('hcExamenesSolicitados');
}

function limpiarOrdenesMedicasPlan(){
    window.ordenesMedicasPlanSeleccionadas = [];

    renderOrdenesMedicasTabla();
    recopilarOrdenesMedicasPlan();
    guardarPlanTemporal();
}


/* ============================================================
   IASYN PLAN - FIX QUIRÚRGICO INTERCONSULTA v29
   PERSISTENCIA + RECARGA VISIBLE
   - Restaura los campos del formulario desde la interconsulta real
     de la atención cargada.
   - No crea registros, no guarda automáticamente y no toca id_atencion.
   - Si existen varias interconsultas, prioriza la más completa y reciente
     del arreglo ya cargado, sin eliminar las demás.
============================================================ */

function auroPlanRestaurarFormularioInterconsultaDesdeLista(){
    const lista = Array.isArray(window.interconsultasPlanSeleccionadas)
        ? window.interconsultasPlanSeleccionadas
        : [];

    if(!lista.length){
        limpiarFormularioInterconsulta();
        return null;
    }

    const puntuar = function(item){
        let puntos = 0;
        if(String(item?.tipo || '').trim()) puntos += 1;
        if(String(item?.especialidad || '').trim()) puntos += 2;
        if(String(item?.profesional || '').trim()) puntos += 2;
        if(String(item?.motivo || '').trim()) puntos += 4;
        if(String(item?.observaciones || item?.observacion || '').trim()) puntos += 4;

        const prioridad = normalizarTextoPlan(item?.prioridad);
        const estado = normalizarTextoPlan(item?.estado);

        if(prioridad && prioridad !== 'normal') puntos += 1;
        if(estado && estado !== 'pendiente') puntos += 1;

        return puntos;
    };

    /*
      En empate se prefiere el registro situado más adelante.
      Esto es compatible con datos históricos donde una versión más
      completa se agregó después de una versión incompleta.
    */
    let indiceElegido = 0;
    let mejorPuntaje = -1;

    lista.forEach(function(item, index){
        const puntaje = puntuar(item);
        if(puntaje >= mejorPuntaje){
            mejorPuntaje = puntaje;
            indiceElegido = index;
        }
    });

    const item = lista[indiceElegido] || {};

    auroPlanSetValue('hcInterconsultaTipo', item.tipo || '');
    auroPlanSetValue('hcInterconsultaEspecialidad', item.especialidad || '');
    auroPlanSetValue('hcInterconsultaPrioridad', item.prioridad || 'Normal');
    auroPlanSetValue('hcInterconsultaProfesional', item.profesional || '');
    auroPlanSetValue('hcInterconsultaEstado', item.estado || 'Pendiente');
    auroPlanSetValue('hcInterconsultaMotivo', item.motivo || '');
    auroPlanSetValue(
        'hcInterconsultaObservaciones',
        item.observaciones || item.observacion || ''
    );

    return item;
}

/* ============================================================
   INTERCONSULTAS DEL PLAN
============================================================ */

function recopilarInterconsultaPlan(){

    const tipo = auroPlanGetValue('hcInterconsultaTipo');
    const especialidad = auroPlanGetValue('hcInterconsultaEspecialidad');
    const prioridad = auroPlanGetValue('hcInterconsultaPrioridad') || 'Normal';
    const profesional = auroPlanGetValue('hcInterconsultaProfesional');
    const estado = auroPlanGetValue('hcInterconsultaEstado') || 'Pendiente';
    const motivo = auroPlanGetValue('hcInterconsultaMotivo');
    const observaciones = auroPlanGetValue('hcInterconsultaObservaciones');

    const partes = [];

    if(tipo) partes.push('Tipo: ' + tipo);
    if(especialidad) partes.push('Especialidad: ' + especialidad);
    if(prioridad) partes.push('Prioridad: ' + prioridad);
    if(profesional) partes.push('Profesional: ' + profesional);
    if(estado) partes.push('Estado: ' + estado);
    if(motivo) partes.push('Motivo: ' + motivo);
    if(observaciones) partes.push('Observaciones: ' + observaciones);

    const formularioTieneContenido = !!(
        tipo ||
        especialidad ||
        profesional ||
        motivo ||
        observaciones
    );

    const textoFormulario = formularioTieneContenido
        ? partes.join('\n')
        : '';

    if(textoFormulario){
        auroPlanSetValue('hcInterconsultaResumen', textoFormulario);
        return textoFormulario;
    }

    const textoLista = (window.interconsultasPlanSeleccionadas || [])
        .map((it,i) => {
            return [
                `${i + 1}. ${it.especialidad || ''}`,
                it.tipo ? `Tipo: ${it.tipo}` : '',
                it.prioridad ? `Prioridad: ${it.prioridad}` : '',
                it.profesional ? `Profesional: ${it.profesional}` : '',
                it.estado ? `Estado: ${it.estado}` : '',
                it.motivo ? `Motivo: ${it.motivo}` : '',
                it.observaciones ? `Observaciones: ${it.observaciones}` : ''
            ].filter(Boolean).join(' - ');
        }).join('\n');

    auroPlanSetValue('hcInterconsultaResumen', textoLista);

    return textoLista;
}

function agregarInterconsultaPlan(){

    const especialidad = (auroPlanGetValue('hcInterconsultaEspecialidad') || '').trim();

    if(!especialidad){
        alert('Seleccione una especialidad.');
        return;
    }

    window.interconsultasPlanSeleccionadas = auroPlanInterconsultasUnicas([
        ...(window.interconsultasPlanSeleccionadas || []),
        {
            tipo: auroPlanGetValue('hcInterconsultaTipo'),
            especialidad,
            prioridad: auroPlanGetValue('hcInterconsultaPrioridad') || 'Normal',
            profesional: auroPlanGetValue('hcInterconsultaProfesional'),
            estado: auroPlanGetValue('hcInterconsultaEstado') || 'Pendiente',
            motivo: auroPlanGetValue('hcInterconsultaMotivo'),
            observaciones: auroPlanGetValue('hcInterconsultaObservaciones')
        }
    ]);

    renderInterconsultasTabla();
    recopilarInterconsultaPlan();
    guardarPlanTemporal();
}

function eliminarInterconsultaPlan(index){

    index = Number(index);

    if(Number.isNaN(index)) return;

    window.interconsultasPlanSeleccionadas.splice(index,1);

    renderInterconsultasTabla();
    recopilarInterconsultaPlan();
    guardarPlanTemporal();
}

function limpiarFormularioInterconsulta(){

    auroPlanSetValue('hcInterconsultaTipo','');
    auroPlanSetValue('hcInterconsultaEspecialidad','');
    auroPlanSetValue('hcInterconsultaProfesional','');
    auroPlanSetValue('hcInterconsultaMotivo','');
    auroPlanSetValue('hcInterconsultaObservaciones','');
    auroPlanSetValue('hcInterconsultaPrioridad','Normal');
    auroPlanSetValue('hcInterconsultaEstado','Pendiente');
}

function renderInterconsultasTabla(){

    const tbody = document.getElementById('hcInterconsultasTableBody');

    if(!tbody) return;

    const lista = window.interconsultasPlanSeleccionadas || [];

    if(!lista.length){
        tbody.innerHTML = `
            <tr>
              <td colspan="7" class="text-center text-muted py-3">
                Sin interconsultas registradas
              </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lista.map((it,i) => `
        <tr>
          <td>${escapeHtmlPlan(it.tipo)}</td>
          <td>${escapeHtmlPlan(it.especialidad)}</td>
          <td>${escapeHtmlPlan(it.prioridad)}</td>
          <td>${escapeHtmlPlan(it.profesional)}</td>
          <td>${escapeHtmlPlan(it.estado)}</td>
          <td>${escapeHtmlPlan(it.motivo)}</td>
          <td>
            <button type="button"
                    class="btn btn-sm btn-outline-danger"
                    onclick="eliminarInterconsultaPlan(${i})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
    `).join('');
}

function limpiarInterconsultaPlan(){

    window.interconsultasPlanSeleccionadas = [];

    limpiarFormularioInterconsulta();
    renderInterconsultasTabla();
    auroPlanSetValue('hcInterconsultaResumen','');
    guardarPlanTemporal();
}



/* ============================================================
   EVALUACIONES DEL PLAN
============================================================ */

const AURO_PLAN_EVALUACIONES = [
    {
        id: 'hcEvalMalaActitud',
        texto: 'Denota mala actitud ante el examinador.'
    },
    {
        id: 'hcEvalAnimo',
        texto: 'Alteraciones del estado de ánimo.'
    },
    {
        id: 'hcEvalAbusoNegligencia',
        texto: 'Sospecha psicológica: paciente víctima de abuso o negligencia.'
    },
    {
        id: 'hcEvalAnomaliasMotoras',
        texto: 'Evidencia actividades y anomalías motoras.'
    },
    {
        id: 'hcEvalOdontologica',
        texto: 'Requiere evaluación odontológica.'
    }
];

function auroPlanCapturarEvaluaciones(){

    const data = {};

    AURO_PLAN_EVALUACIONES.forEach(item => {
        const el = document.getElementById(item.id);
        data[item.id] = !!(el && el.checked);
    });

    return data;
}

function auroPlanRestaurarEvaluaciones(data){

    data = data || {};

    AURO_PLAN_EVALUACIONES.forEach(item => {
        const el = document.getElementById(item.id);
        if(el) el.checked = !!data[item.id];
    });

    recopilarEvaluacionesPlan();
}

function recopilarEvaluacionesPlan(){

    const seleccionadas = [];

    AURO_PLAN_EVALUACIONES.forEach(item => {
        const el = document.getElementById(item.id);
        if(el && el.checked){
            seleccionadas.push(item.texto);
        }
    });

    const texto = seleccionadas.join('\n');

    auroPlanSetValue('hcEvaluacionesResumen', texto);

    return texto;
}

function limpiarEvaluacionesCamposPlan(){

    AURO_PLAN_EVALUACIONES.forEach(item => {
        const el = document.getElementById(item.id);
        if(el) el.checked = false;
    });

    auroPlanSetValue('hcEvaluacionesResumen', '');
}

function limpiarEvaluacionesPlan(){

    limpiarEvaluacionesCamposPlan();
    guardarPlanTemporal();
}

/* ============================================================
   EVENTOS EVALUACIONES PLAN
============================================================ */

function instalarEventosEvaluacionesPlan(){

    if(window.auroPlanEvaluacionesEventosInstalados) return;
    window.auroPlanEvaluacionesEventosInstalados = true;

    document.addEventListener('change', function(e){

        const id = e.target?.id || '';

        if(AURO_PLAN_EVALUACIONES.some(item => item.id === id)){
            recopilarEvaluacionesPlan();
            guardarPlanTemporal();
        }
    });
}


/* ============================================================
   EVENTOS MEDICAMENTOS PLAN
============================================================ */

function instalarEventosMedicamentosPlan(){

    if(window.auroPlanMedicamentosEventosInstalados) return;
    window.auroPlanMedicamentosEventosInstalados = true;

    document.addEventListener('input', function(e){
        if(e.target && e.target.id === 'hcMedBusqueda'){
            renderMedicamentoSugerencias();
        }
    });

    document.addEventListener('focusin', function(e){
        if(e.target && e.target.id === 'hcMedBusqueda'){
            renderMedicamentoSugerencias();
        }
    });

    document.addEventListener('click', function(e){

        const item = e.target.closest('.med-sug-item[data-med]');

        if(item){
            seleccionarMedicamentoSugerido(item);
            return;
        }

        const box = document.getElementById('hcMedSugerencias');

        if(
            box &&
            !e.target.closest('#hcMedSugerencias') &&
            e.target.id !== 'hcMedBusqueda'
        ){
            box.classList.add('d-none');
        }
    });

    document.addEventListener('change', function(e){

        const ids = [
            'hcMedPresentacion',
            'hcMedVia',
            'hcMedCantidad',
            'hcMedFrecuencia',
            'hcMedDuracion',
            'hcMedIndicaciones',
            'hcMedContinuo'
        ];

        if(ids.includes(e.target?.id || '')){
            renderMedicamentosPlanTabla();
            guardarPlanTemporal();
        }
    });
}


/* ============================================================
   EVENTOS ÓRDENES MÉDICAS PLAN
============================================================ */

function instalarEventosOrdenesMedicasPlan(){

    if(window.auroPlanOrdenesEventosInstalados) return;
    window.auroPlanOrdenesEventosInstalados = true;

    document.addEventListener('input', function(e){
        if(e.target && e.target.id === 'hcOrdenBusqueda'){
            renderOrdenesSugerencias();
        }
    });

    document.addEventListener('focusin', function(e){
        if(e.target && e.target.id === 'hcOrdenBusqueda'){
            renderOrdenesSugerencias();
        }
    });

    document.addEventListener('change', function(e){
        if(e.target && e.target.id === 'hcOrdenTipo'){
            renderOrdenesSugerencias();
        }
    });

    document.addEventListener('click', function(e){

        const item = e.target.closest('.orden-sug-item[data-orden]');

        if(item){
            seleccionarOrdenSugerida(item);
            return;
        }

        const box = document.getElementById('hcOrdenSugerencias');

        if(
            box &&
            !e.target.closest('#hcOrdenSugerencias') &&
            e.target.id !== 'hcOrdenBusqueda'
        ){
            box.classList.add('d-none');
        }
    });
}


/* ============================================================
   SINCRONIZACIÓN AUXILIAR ANTES DE GUARDAR
============================================================ */

function auroSincronizarPlanAntesGuardar(){

    window.ordenesMedicasPlanSeleccionadas =
        auroPlanOrdenesUnicas(window.ordenesMedicasPlanSeleccionadas || []);

    const interconsultaFormulario = {
        tipo: auroPlanGetValue('hcInterconsultaTipo'),
        especialidad: auroPlanGetValue('hcInterconsultaEspecialidad'),
        prioridad: auroPlanGetValue('hcInterconsultaPrioridad') || 'Normal',
        profesional: auroPlanGetValue('hcInterconsultaProfesional'),
        estado: auroPlanGetValue('hcInterconsultaEstado') || 'Pendiente',
        motivo: auroPlanGetValue('hcInterconsultaMotivo'),
        observaciones: auroPlanGetValue('hcInterconsultaObservaciones')
    };

    const formularioInterconsultaTieneContenido = !!(
        String(interconsultaFormulario.tipo || '').trim() ||
        String(interconsultaFormulario.especialidad || '').trim() ||
        String(interconsultaFormulario.profesional || '').trim() ||
        String(interconsultaFormulario.motivo || '').trim() ||
        String(interconsultaFormulario.observaciones || '').trim()
    );

    window.interconsultasPlanSeleccionadas =
        auroPlanInterconsultasUnicas([
            ...(window.interconsultasPlanSeleccionadas || []),
            ...(formularioInterconsultaTieneContenido
                ? [interconsultaFormulario]
                : [])
        ]);

    if(typeof recopilarEvaluacionesPlan === 'function'){
        recopilarEvaluacionesPlan();
    }

    recopilarInterconsultaPlan();
    recopilarOrdenesMedicasPlan();

    renderMedicamentosPlanTabla();
    renderOrdenesMedicasTabla();
    renderInterconsultasTabla();

    sincronizarPlanConReceta();
    guardarPlanTemporal();
}


/* ============================================================
   REFRESCAR VISTAS DEL PLAN
============================================================ */

function auroPlanRefrescarVistas(){

    renderMedicamentosPlanTabla();
    sincronizarPlanConReceta();

    renderOrdenesMedicasTabla();
    recopilarOrdenesMedicasPlan();

    renderInterconsultasTabla();
    recopilarInterconsultaPlan();

    if(typeof recopilarEvaluacionesPlan === 'function'){
        recopilarEvaluacionesPlan();
    }

    auroPlanRenderSugerenciasDiagnosticas();
}


/* ============================================================
   RESPONSIVE PLAN ANDROID / TELÉFONO
============================================================ */

function instalarResponsivePlanAndroid(){

    if(document.getElementById('auroPlanResponsiveAndroidStyle')) return;

    const style = document.createElement('style');
    style.id = 'auroPlanResponsiveAndroidStyle';

    style.textContent = `
      #hc_plan .auro-plan-ayuda-select{
        margin-top:7px;
        max-width:420px;
        border-radius:12px;
        color:#475569;
      }

      #hc_plan .auro-plan-aviso-edicion{
        margin:8px 0 10px;
        padding:9px 12px;
        border:1px solid #bfdbfe;
        border-radius:12px;
        background:#eff6ff;
        color:#1e40af;
        font-size:13px;
        font-weight:700;
      }

      #hc_plan .auro-plan-pendiente{
        display:inline-block;
        padding:4px 8px;
        border-radius:999px;
        background:#fef3c7;
        color:#92400e;
        font-size:11px;
        font-weight:800;
        white-space:nowrap;
      }
      #hc_plan .auro-plan-acciones-medicamento{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        white-space:nowrap;
      }

      #hc_plan .auro-plan-tabla-medicamentos th:nth-child(3),
      #hc_plan .auro-plan-tabla-medicamentos td:nth-child(3){
        min-width:135px;
      }

      #hc_plan .auro-plan-tabla-medicamentos th:nth-child(7),
      #hc_plan .auro-plan-tabla-medicamentos td:nth-child(7){
        min-width:190px;
      }

      @media(min-width:981px){
        /*
          IASYN PLAN - ENSANCHAMIENTO PROFESIONAL SOLO ESCRITORIO
          - Extiende únicamente la caja de medicamentos hacia la derecha.
          - Mantiene alineado el borde izquierdo original.
          - No usa transformaciones, centrados forzados ni porcentajes rígidos.
          - La tabla conserva distribución automática y texto ajustable.
          - No afecta otras tablas ni el responsive móvil.
        */
        #hc_plan .receta-medicamentos-box.hc-plan-narrow,
        #hc_plan .receta-medicamentos-box{
          width:min(1180px, calc(100vw - 365px))!important;
          max-width:none!important;
          margin-left:0!important;
          margin-right:0!important;
        }

        #hc_plan .receta-medicamentos-box .table-responsive{
          display:block!important;
          width:100%!important;
          max-width:100%!important;
          overflow-x:hidden!important;
        }

        #hc_plan .auro-plan-tabla-medicamentos{
          width:100%!important;
          min-width:0!important;
          max-width:100%!important;
          table-layout:auto!important;
        }

        #hc_plan .auro-plan-tabla-medicamentos th,
        #hc_plan .auro-plan-tabla-medicamentos td{
          padding:9px 8px!important;
          vertical-align:middle!important;
          white-space:normal!important;
          word-break:normal!important;
          overflow-wrap:anywhere!important;
          line-height:1.35!important;
        }

        #hc_plan .auro-plan-tabla-medicamentos th{
          font-size:12px!important;
          letter-spacing:.01em!important;
        }

        #hc_plan .auro-plan-tabla-medicamentos td{
          font-size:12.5px!important;
        }

        #hc_plan .auro-plan-tabla-medicamentos th:nth-child(4),
        #hc_plan .auro-plan-tabla-medicamentos td:nth-child(4),
        #hc_plan .auro-plan-tabla-medicamentos th:nth-child(8),
        #hc_plan .auro-plan-tabla-medicamentos td:nth-child(8),
        #hc_plan .auro-plan-tabla-medicamentos th:nth-child(9),
        #hc_plan .auro-plan-tabla-medicamentos td:nth-child(9){
          white-space:nowrap!important;
        }

        #hc_plan .auro-plan-acciones-medicamento{
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          gap:6px!important;
        }

        #hc_plan .auro-plan-acciones-medicamento .btn{
          width:34px!important;
          height:34px!important;
          min-height:34px!important;
          padding:5px!important;
          border-radius:9px!important;
        }

        #hc_plan .auro-plan-ayuda-select{
          border:1px solid #d8b4fe!important;
          background:linear-gradient(180deg,#ffffff 0%,#faf5ff 100%)!important;
          box-shadow:0 4px 14px rgba(126,34,206,.08)!important;
          font-weight:600!important;
        }
      }

      @media(max-width:980px){
        #hc_plan .receta-medicamentos-box .table-responsive{
          display:block!important;
          overflow-x:auto!important;
          -webkit-overflow-scrolling:touch!important;
        }
      }

      @media(max-width:760px){

        #hc_plan .hc-plan-narrow,
        #hc_plan .hc-plan-row-small{
          width:100%!important;
          max-width:none!important;
        }

        #hc_plan .receta-medicamentos-box,
        #hc_plan .ordenes-medicas-box,
        #hc_plan .interconsulta-box,
        #hc_plan .evaluaciones-box{
          padding:12px!important;
          border-radius:14px!important;
        }

        #hc_plan .table-responsive{
          display:block!important;
          overflow-x:auto!important;
          -webkit-overflow-scrolling:touch!important;
        }

        #hc_plan table{
          min-width:920px!important;
        }

        #hc_plan button{
          min-height:42px!important;
          white-space:normal!important;
        }

        #hc_plan .auro-plan-acciones-medicamento button{
          min-width:42px!important;
          padding:8px!important;
        }

        #hc_plan .auro-plan-ayuda-select{
          width:100%;
          max-width:none;
          font-size:14px!important;
        }

        #hc_plan .row.g-3{
          row-gap:12px!important;
        }

        #hc_plan textarea,
        #hc_plan input,
        #hc_plan select{
          font-size:14px!important;
        }
      }
    `;

    document.head.appendChild(style);
}




/* ============================================================
   PERSISTENCIA DEFINITIVA PLAN → GOOGLE SHEETS
   Pestaña: planes_clinicos
   Requiere Apps Script con acciones:
   - guardarPlanClinico
   - editarPlanClinico
   - buscarPlanPorAtencion
============================================================ */

function auroPlanApiUrl(){
    try{
        if(typeof API_URL !== 'undefined' && API_URL) return API_URL;
    }catch(e){}

    if(window.API_URL) return window.API_URL;

    const input = document.getElementById('appsScriptUrl');
    if(input && input.value) return input.value.trim();

    return '';
}

async function auroPlanApiGet(accion, params){

    const urlBase = auroPlanApiUrl();

    if(!urlBase){
        throw new Error('No se encontró API_URL para conectar con Apps Script.');
    }

    const query = new URLSearchParams({
        accion: accion,
        _: String(Date.now())
    });

    Object.keys(params || {}).forEach(k => {
        if(params[k] !== undefined && params[k] !== null){
            query.append(k, params[k]);
        }
    });

    const res = await fetch(urlBase + '?' + query.toString(), {
        method: 'GET',
        cache: 'no-store'
    });

    return await res.json();
}

async function auroPlanApiPost(accion, data){

    const urlBase = auroPlanApiUrl();

    if(!urlBase){
        throw new Error('No se encontró API_URL para conectar con Apps Script.');
    }

    const res = await fetch(urlBase, {
        method: 'POST',
        body: JSON.stringify({
            accion: accion,
            data: data || {}
        })
    });

    return await res.json();
}


/* ============================================================
   IASYN PLAN 26 - CONTROL DE CORRECCIÓN CLÍNICA
   - Atención abierta: guardado normal sin preguntas.
   - Atención finalizada: el backend solicita justificativo.
   - Fuera de plazo: enmienda excepcional si Configuración la permite.
   - La decisión temporal pertenece al servidor.
============================================================ */
function auroPlanTokenControlClinico(){
    /*
      IASYN: se intenta primero el contrato propio.
      Los nombres AUROSANAX se conservan solo como compatibilidad temporal
      mientras Seguridad e index terminan su migración coordinada.
    */
    try{
        if(window.IASYN_SEGURIDAD && typeof window.IASYN_SEGURIDAD.obtenerToken === 'function'){
            return String(window.IASYN_SEGURIDAD.obtenerToken() || '').trim();
        }
    }catch(e){}
    try{
        if(window.AUROSANAX_SEGURIDAD && typeof window.AUROSANAX_SEGURIDAD.obtenerToken === 'function'){
            return String(window.AUROSANAX_SEGURIDAD.obtenerToken() || '').trim();
        }
    }catch(e){}
    try{
        const tokenIASYN = String(sessionStorage.getItem('iasyn_seguridad_token') || '').trim();
        if(tokenIASYN) return tokenIASYN;
    }catch(e){}
    try{ return String(sessionStorage.getItem('aurosanax_seguridad_token') || '').trim(); }catch(e){}
    return '';
}

if(typeof window.auroSolicitarMotivoCorreccionClinica !== 'function'){
    window.auroSolicitarMotivoCorreccionClinica = function(opciones){
        opciones = opciones || {};
        const excepcional = !!opciones.excepcional;
        const titulo = excepcional
            ? 'ENMIENDA EXCEPCIONAL - JUSTIFICATIVO OBLIGATORIO'
            : 'CORRECCIÓN CLÍNICA - MOTIVO OBLIGATORIO';
        const entrada = window.prompt(
            titulo + '\n\n' +
            '1. Error de digitación\n' +
            '2. Omisión\n' +
            '3. Fallo del sistema\n' +
            '4. Emergencia\n' +
            '5. Corrección clínica\n' +
            '6. Otro\n\n' +
            'Escriba el número del motivo:'
        );
        if(entrada === null) return null;

        const mapa = {
            '1':'Error de digitación',
            '2':'Omisión',
            '3':'Fallo del sistema',
            '4':'Emergencia',
            '5':'Corrección clínica',
            '6':'Otro'
        };
        const tipo = mapa[String(entrada || '').trim()];
        if(!tipo){
            window.alert('Seleccione un motivo válido del 1 al 6.');
            return null;
        }

        let detalle = '';
        if(tipo === 'Otro'){
            const otro = window.prompt('Escriba un justificativo breve:');
            if(otro === null) return null;
            detalle = String(otro || '').trim();
            if(detalle.length < 3){
                window.alert('El justificativo es obligatorio.');
                return null;
            }
        }

        return {
            motivo_correccion_tipo: tipo,            motivo_correccion_detalle: detalle,
            motivo_correccion: detalle ? (tipo + ': ' + detalle) : tipo,
            correccion_excepcional: excepcional ? 'SI' : 'NO'
        };
    };
}

async function auroPlanApiPostConControlClinico(accion, data){
    const payload = Object.assign({}, data || {}, {
        token: auroPlanTokenControlClinico()
    });

    let resultado = await auroPlanApiPost(accion, payload);

    if(
        resultado && resultado.success === false &&
        ['AURO_MOTIVO_REQUERIDO','AURO_EXCEPCION_REQUERIDA'].includes(String(resultado.code || ''))
    ){
        const motivo = await window.auroSolicitarMotivoCorreccionClinica({
            excepcional: resultado.code === 'AURO_EXCEPCION_REQUERIDA' || resultado.requiere_excepcion === true
        });
        if(!motivo) return resultado;

        Object.assign(payload, motivo);
        resultado = await auroPlanApiPost(accion, payload);
    }

    return resultado;
}

function auroPlanObtenerContextoAtencionSeguro(){
    /*
      IASYN - integración quirúrgica con atenciones.js
      Fuente preferente: obtenerContextoAtencionActual().
      Mantiene compatibilidad total con la lógica anterior.
    */
    try{
        if(typeof window.obtenerContextoAtencionActual === 'function'){
            const contexto = window.obtenerContextoAtencionActual();
            if(contexto && contexto.id_atencion){
                return contexto;
            }
        }
    }catch(error){
        console.warn('IASYN PLAN: no se pudo leer el contexto unificado de la atención.', error);
    }

    try{
        if(typeof window.getContextoAtencionActual === 'function'){
            const contexto = window.getContextoAtencionActual();
            if(contexto && contexto.id_atencion){
                return contexto;
            }
        }
    }catch(error){}

    try{
        if(typeof window.getAtencionActiva === 'function'){
            const atencion = window.getAtencionActiva();
            if(atencion && atencion.id_atencion){
                return {
                    id_atencion: String(atencion.id_atencion || '').trim(),
                    id_paciente: String(atencion.id_paciente || '').trim(),
                    id_historia: String(atencion.id_historia || '').trim(),
                    id_cita: String(atencion.id_cita || '').trim(),
                    id_medico: String(atencion.id_medico || '').trim(),
                    numero_consulta: String(atencion.numero_consulta || '').trim(),
                    origen_atencion: String(atencion.id_cita || '').trim() ? 'agenda' : 'manual'
                };
            }
        }
    }catch(error){}

    return null;
}

function auroPlanObtenerIdAtencionActivaSeguro(){
    let idReal = '';

    const contexto = auroPlanObtenerContextoAtencionSeguro();
    if(contexto && contexto.id_atencion){
        idReal = String(contexto.id_atencion || '').trim();
    }

    try{
        if(typeof window.getAtencionActiva === 'function'){
            const atencion = window.getAtencionActiva();
            idReal = String(atencion?.id_atencion || '').trim();
        }
    }catch(e){}

    if(!idReal){
        try{
            if(typeof getAtencionActiva === 'function'){
                const atencion = getAtencionActiva();
                idReal = String(atencion?.id_atencion || '').trim();
            }
        }catch(e){}
    }

    if(!idReal){
        idReal = String(
            document.getElementById('hcIdAtencion')?.value ||
            document.getElementById('idAtencionActiva')?.value ||
            ''
        ).trim();
    }

    if(!idReal){
        idReal = String(window.planState?.atencionActual || '').trim();
    }

    return idReal;
}

function auroPlanSincronizarAtencionActiva(){
    const idReal = auroPlanObtenerIdAtencionActivaSeguro();

    if(!idReal) return '';

    window.planState = window.planState || {
        atencionActual: '',
        cache: {}
    };

    window.planState.atencionActual = idReal;
    return idReal;
}

function auroPlanObtenerPacienteActivoSeguro(){

    try{
        if(typeof getPacienteActivo === 'function'){
            const p = getPacienteActivo();
            if(p) return p;
        }
    }catch(e){}

    const idSelect = document.getElementById('hcPacienteSelect')?.value || '';

    try{
        if(Array.isArray(patients)){
            return patients.find(p =>
                String(p.id_paciente || '') === String(idSelect || '')
            ) || null;
        }
    }catch(e){}

    return null;
}

function auroPlanObtenerHistoriaIdSeguro(){

    const contexto = auroPlanObtenerContextoAtencionSeguro();
    if(contexto && contexto.id_historia){
        return String(contexto.id_historia || '').trim();
    }

    try{
        if(typeof editingHistoryId !== 'undefined' && editingHistoryId){
            return editingHistoryId;
        }
    }catch(e){}

    const h = document.getElementById('hcIdHistoria')?.value || '';
    return h || '';
}

function auroPlanObtenerMedicoIdSeguro(){

    const contexto = auroPlanObtenerContextoAtencionSeguro();
    if(contexto && contexto.id_medico){
        return String(contexto.id_medico || '').trim();
    }

    try{
        if(typeof obtenerIdMedicoReal === 'function'){
            const id = obtenerIdMedicoReal();
            if(id) return id;
        }
    }catch(e){}

    const el = document.getElementById('hcIdMedico');
    if(el && el.value) return el.value;

    return 'MED-IASYN';
}

function auroPlanPrepararDatosSheets(){

    const idAtencionReal = auroPlanSincronizarAtencionActiva();

    auroSincronizarPlanAntesGuardar();

    /*
      IASYN v29 - refuerzo defensivo de persistencia.
      Si existe información escrita en Interconsulta, se vuelve a fusionar
      justo antes de construir el payload. No guarda por sí solo: únicamente
      protege el contenido del botón Guardar plan clínico.
    */
    const interconsultaVisibleAntesDeGuardar = {
        tipo: auroPlanGetValue('hcInterconsultaTipo'),
        especialidad: auroPlanGetValue('hcInterconsultaEspecialidad'),
        prioridad: auroPlanGetValue('hcInterconsultaPrioridad') || 'Normal',
        profesional: auroPlanGetValue('hcInterconsultaProfesional'),
        estado: auroPlanGetValue('hcInterconsultaEstado') || 'Pendiente',
        motivo: auroPlanGetValue('hcInterconsultaMotivo'),
        observaciones: auroPlanGetValue('hcInterconsultaObservaciones')
    };

    const hayInterconsultaVisible = !!(
        String(interconsultaVisibleAntesDeGuardar.tipo || '').trim() ||
        String(interconsultaVisibleAntesDeGuardar.especialidad || '').trim() ||
        String(interconsultaVisibleAntesDeGuardar.profesional || '').trim() ||
        String(interconsultaVisibleAntesDeGuardar.motivo || '').trim() ||
        String(interconsultaVisibleAntesDeGuardar.observaciones || '').trim()
    );

    if(hayInterconsultaVisible){
        window.interconsultasPlanSeleccionadas = auroPlanInterconsultasUnicas([
            ...(window.interconsultasPlanSeleccionadas || []),
            interconsultaVisibleAntesDeGuardar
        ]);
    }

    const contexto = auroPlanObtenerContextoAtencionSeguro();
    const paciente = auroPlanObtenerPacienteActivoSeguro();

    return {
        id_atencion:
            idAtencionReal,

        id_paciente:
            String(contexto?.id_paciente || '').trim() ||
            paciente?.id_paciente ||
            document.getElementById('hcPacienteSelect')?.value ||
            '',

        id_historia:
            String(contexto?.id_historia || '').trim() ||
            auroPlanObtenerHistoriaIdSeguro(),

        id_medico:
            String(contexto?.id_medico || '').trim() ||
            auroPlanObtenerMedicoIdSeguro(),

        id_cita:
            String(contexto?.id_cita || '').trim(),

        fecha_plan:
            auroPlanFechaClinicaLocal(),

        plan_terapeutico:
            auroPlanTextoClinicoAJSON(
                auroPlanGetValue('hcPlanTratamiento')
            ),

        medicamentos_plan:
            JSON.stringify(window.medicamentosPlanSeleccionados || []),

        receta_medica:
            auroPlanTextoClinicoAJSON(
                auroPlanGetValue('hcRecetaMedicamentos')
            ),

        ordenes_medicas:
            JSON.stringify(
                auroPlanOrdenesUnicas(
                    window.ordenesMedicasPlanSeleccionadas || []
                )
            ),

        interconsulta:
            JSON.stringify(
                auroPlanInterconsultasUnicas(
                    window.interconsultasPlanSeleccionadas || []
                )
            ),

        evaluaciones_plan:
            JSON.stringify(
                auroPlanEvaluacionesSeleccionadasJSON()
            ),

        indicaciones_paciente:
            auroPlanTextoClinicoAJSON(
                auroPlanGetValue('hcIndicacionesPaciente')
            ),

        proximo_control:
            auroPlanGetValue('hcControl'),

        estado_plan:
            auroPlanGetValue('hcEstadoHistoria') || 'Activo'
    };
}

async function buscarPlanClinicoPorAtencionDesdeSheets(idAtencion){

    idAtencion = String(idAtencion || window.planState?.atencionActual || '').trim();

    if(!idAtencion) return null;

    const data = await auroPlanApiGet(
        'buscarPlanPorAtencion',
        { id_atencion: idAtencion }
    );

    return data || null;
}

async function guardarPlanClinicoDesdeSheets(){

    const idAtencionVisible = auroPlanObtenerIdAtencionActivaSeguro();
    const idAtencionInterna = String(window.planState?.atencionActual || '').trim();

    if(
        idAtencionVisible &&
        idAtencionInterna &&
        idAtencionVisible !== idAtencionInterna
    ){
        window.planState.atencionActual = idAtencionVisible;
    }

    const data = auroPlanPrepararDatosSheets();

    if(!data.id_atencion){
        console.warn('Plan no guardado: no existe id_atencion actual.');
        return {
            success: false,
            message: 'No existe id_atencion actual para guardar el Plan.'
        };
    }
    const existente = await buscarPlanClinicoPorAtencionDesdeSheets(
        data.id_atencion
    );

    let resultado;

    if(existente && existente.id_plan){
        data.id_plan = existente.id_plan;
        resultado = await auroPlanApiPostConControlClinico('editarPlanClinico', data);
    }else{
        resultado = await auroPlanApiPostConControlClinico('guardarPlanClinico', data);
    }

    if(resultado && resultado.success !== false){
        guardarPlanTemporal();
    }

    return resultado;
}


function auroPlanTextoAOrdenes(texto){
    texto = String(texto || '').trim();
    if(!texto) return [];

    return texto.split(/\n+/).map(linea => {
        let limpia = String(linea || '').replace(/^\s*\d+\.\s*/, '').trim();
        const partes = limpia.split(' - ').map(x => x.trim()).filter(Boolean);

        const orden = partes[0] || limpia;
        let cat = '';
        let obs = '';

        partes.slice(1).forEach(p => {
            if(/^Categoría:/i.test(p)) cat = p.replace(/^Categoría:\s*/i, '').trim();
            else if(/^Observación:/i.test(p)) obs = p.replace(/^Observación:\s*/i, '').trim();
        });

        return {
            orden: orden,
            cat: cat || 'OTROS',
            obs: obs
        };
    }).filter(o => o.orden);
}

function auroPlanTextoAInterconsultas(texto){
    texto = String(texto || '').trim();
    if(!texto) return [];

    const bloques = texto
        .split(/\n(?=\s*\d+\.\s*)/)
        .map(x => x.trim())
        .filter(Boolean);

    const origen = bloques.length > 1 ? bloques : [texto];

    return origen.map(bloque => {
        const limpio = bloque.replace(/^\s*\d+\.\s*/, '').trim();
        const partes = limpio
            .split(/\s+-\s+|\n+/)
            .map(x => x.trim())
            .filter(Boolean);

        const item = {
            tipo: '',
            especialidad: '',
            prioridad: 'Normal',
            profesional: '',
            estado: 'Pendiente',
            motivo: '',
            observaciones: ''
        };

        partes.forEach((parte, index) => {
            if(/^Tipo:/i.test(parte)){
                item.tipo = parte.replace(/^Tipo:\s*/i, '').trim();
            }else if(/^Especialidad:/i.test(parte)){
                item.especialidad = parte.replace(/^Especialidad:\s*/i, '').trim();
            }else if(/^Prioridad:/i.test(parte)){
                item.prioridad = parte.replace(/^Prioridad:\s*/i, '').trim() || 'Normal';
            }else if(/^Profesional:/i.test(parte)){
                item.profesional = parte.replace(/^Profesional:\s*/i, '').trim();
            }else if(/^Estado:/i.test(parte)){
                item.estado = parte.replace(/^Estado:\s*/i, '').trim() || 'Pendiente';
            }else if(/^Motivo:/i.test(parte)){
                item.motivo = parte.replace(/^Motivo:\s*/i, '').trim();
            }else if(/^Observaciones:/i.test(parte)){
                item.observaciones = parte.replace(/^Observaciones:\s*/i, '').trim();
            }else if(index === 0 && parte){
                item.especialidad = parte;
            }
        });

        return item;
    }).filter(item =>
        item.tipo ||
        item.especialidad ||
        item.profesional ||
        item.motivo ||
        item.observaciones
    );
}

function auroPlanCargarEvaluacionesDesdeTexto(texto){
    texto = String(texto || '').trim();

    limpiarEvaluacionesCamposPlan();

    if(!texto) return;

    AURO_PLAN_EVALUACIONES.forEach(item => {
        const el = document.getElementById(item.id);
        if(el && texto.includes(item.texto)){
            el.checked = true;
        }
    });

    auroPlanSetValue('hcEvaluacionesResumen', texto);
}

function auroPlanCargarEvaluacionesDesdeValor(valor){
    limpiarEvaluacionesCamposPlan();

    const data = auroPlanParseJSONSeguro(valor, null);

    if(Array.isArray(data)){
        const ids = new Set();
        const textos = new Set();

        data.forEach(item => {
            if(typeof item === 'string'){
                textos.add(item);
                return;
            }

            if(item && item.seleccionado !== false){
                if(item.id) ids.add(String(item.id));
                if(item.texto) textos.add(String(item.texto));
            }
        });

        AURO_PLAN_EVALUACIONES.forEach(item => {
            const el = document.getElementById(item.id);
            if(el){
                el.checked = ids.has(item.id) || textos.has(item.texto);
            }
        });

        recopilarEvaluacionesPlan();
        return;
    }

    if(data && typeof data === 'object'){
        AURO_PLAN_EVALUACIONES.forEach(item => {
            const el = document.getElementById(item.id);
            if(el) el.checked = !!data[item.id];
        });

        recopilarEvaluacionesPlan();
        return;
    }

    auroPlanCargarEvaluacionesDesdeTexto(valor);
}

function auroPlanEstadoSeguro(valor){
    valor = String(valor || '').trim();
    return valor || 'Control';
}

async function cargarPlanClinicoDesdeSheets(idAtencion){

    idAtencion = String(
        idAtencion ||
        auroPlanObtenerIdAtencionActivaSeguro() ||
        window.planState?.atencionActual ||
        ''
    ).trim();

    if(!idAtencion) return null;

    window.__auroPlanCargasActivas = window.__auroPlanCargasActivas || {};

    if(window.__auroPlanCargasActivas[idAtencion]){
        return window.__auroPlanCargasActivas[idAtencion];
    }

    const promesaCarga = (async function(){

    const plan = await buscarPlanClinicoPorAtencionDesdeSheets(idAtencion);

    const idAtencionActual = auroPlanObtenerIdAtencionActivaSeguro();
    const idAtencionRenderizada = String(
        window.__auroPlanAtencionRenderizada ||
        window.planState?.atencionActual ||
        ''
    ).trim();

    if(
        (idAtencionRenderizada && idAtencionRenderizada !== idAtencion) ||
        (idAtencionActual && idAtencionActual !== idAtencion)
    ){
        console.warn(
            'IASYN PLAN: se descartó una respuesta tardía de otra atención.',
            {
                solicitada: idAtencion,
                actual: idAtencionActual,
                renderizada: idAtencionRenderizada
            }
        );
        return null;
    }

    /*
      IASYN FIX:
      Si la consulta no tiene Plan guardado en planes_clinicos,
      se deja el Plan limpio. No se arrastra información de otra consulta.
    */
    if(!plan || !plan.id_plan){
        limpiarPlanTemporal();
        window.planState.atencionActual = idAtencion;
        window.planState.cache[idAtencion] = {
            medicamentos: [],
            ordenes: [],
            interconsultas: [],
            plan: '',
            indicaciones: '',
            ordenesTexto: '',
            interconsultaTexto: '',
            evaluaciones: '',
            evaluacionesChecks: {},
            receta: ''
        };
        auroPlanRefrescarVistas();
        console.log('IASYN PLAN: atención sin plan guardado, pantalla limpia:', idAtencion);
        return null;
    }

    window.planState = window.planState || {
        atencionActual: idAtencion,
        cache: {}
    };

    window.planState.atencionActual = idAtencion;

    function valorPlan(){
        for(const k of arguments){
            if(plan[k] !== undefined && plan[k] !== null && String(plan[k]).trim() !== ''){
                return plan[k];
            }
        }
        return '';
    }

    try{
        window.medicamentosPlanSeleccionados =
            JSON.parse(valorPlan('medicamentos_plan','medicamentos','medicamentosPlan') || '[]');
    }catch(e){
        window.medicamentosPlanSeleccionados = [];
    }

    const ordenesValor = valorPlan('ordenes_medicas','ordenes','examenes_solicitados');
    const ordenesJSON = auroPlanParseJSONSeguro(ordenesValor, null);

    window.ordenesMedicasPlanSeleccionadas = auroPlanOrdenesUnicas(
        Array.isArray(ordenesJSON)
            ? ordenesJSON
            : auroPlanTextoAOrdenes(ordenesValor)
    );

    const interconsultaValor = valorPlan(
        'interconsulta',
        'interconsultas',
        'interconsulta_plan'
    );

    const interconsultaJSON = auroPlanParseJSONSeguro(
        interconsultaValor,
        null
    );

    window.interconsultasPlanSeleccionadas = auroPlanInterconsultasUnicas(
        Array.isArray(interconsultaJSON)
            ? interconsultaJSON
            : auroPlanTextoAInterconsultas(interconsultaValor)
    );

    auroPlanRestaurarFormularioInterconsultaDesdeLista();

    auroPlanSetValue('hcPlanTratamiento',
        auroPlanValorClinicoATexto(
            valorPlan('plan_terapeutico','planTratamiento','plan_tratamiento')
        )
    );

    auroPlanSetValue('hcRecetaMedicamentos',
        auroPlanValorClinicoATexto(
            valorPlan('receta_medica','receta','recetaMedicamentos')
        )
    );

    auroPlanSetValue('hcExamenesSolicitados', '');
    auroPlanSetValue('hcInterconsultaResumen', '');

    const evaluacionesValor = valorPlan(
        'evaluaciones_plan',
        'evaluaciones',
        'evaluacion_plan'
    );

    auroPlanCargarEvaluacionesDesdeValor(evaluacionesValor);

    auroPlanSetValue('hcIndicacionesPaciente',
        auroPlanValorClinicoATexto(
            valorPlan('indicaciones_paciente','indicaciones','indicacionesPaciente')
        )
    );

    auroPlanSetValue('hcControl',
        valorPlan('proximo_control','control','proximoControl')
    );

    auroPlanSetValue('hcEstadoHistoria',
        auroPlanEstadoSeguro(valorPlan('estado_plan','estado','estadoHistoria'))
    );

    renderMedicamentosPlanTabla();
    renderOrdenesMedicasTabla();
    renderInterconsultasTabla();

    auroPlanRestaurarFormularioInterconsultaDesdeLista();
    recopilarOrdenesMedicasPlan();
    recopilarInterconsultaPlan();
    recopilarEvaluacionesPlan();

    sincronizarPlanConReceta();
    guardarPlanTemporal();

    console.log('IASYN PLAN: plan cargado desde Sheets para atención:', idAtencion, plan);

    return plan;

    })();

    window.__auroPlanCargasActivas[idAtencion] = promesaCarga;

    try{
        return await promesaCarga;
    }finally{
        delete window.__auroPlanCargasActivas[idAtencion];
    }
}

window.editarMedicamentoPlan = editarMedicamentoPlan;
window.cancelarEdicionMedicamentoPlan = cancelarEdicionMedicamentoPlan;
window.auroPlanNombreViaCompleta = auroPlanNombreViaCompleta;

window.guardarPlanClinicoDesdeSheets = guardarPlanClinicoDesdeSheets;
window.buscarPlanClinicoPorAtencionDesdeSheets = buscarPlanClinicoPorAtencionDesdeSheets;
window.cargarPlanClinicoDesdeSheets = cargarPlanClinicoDesdeSheets;


/* ============================================================
   INICIO SEGURO
============================================================ */

document.addEventListener('DOMContentLoaded', function(){
    inicializarPlan();
    auroPlanInstalarAyudasMedicamentos();
});

/* ============================================================
   AUTO-CARGA AL CAMBIAR CONSULTA / ATENCIÓN
   IASYN FIX QUIRÚRGICO v22:
   - Plan escucha directamente los eventos maestros de Atenciones.
   - La nueva atención se considera fuente autoritativa inmediata.
   - Limpia el Plan anterior antes de cualquier carga asíncrona.
   - Evita depender de que el usuario pulse el botón Ver.
============================================================ */
(function instalarSincronizacionInmediataPlanPorAtencion(){
    if(window.__auroPlanEventosAtencionV22Instalados) return;
    window.__auroPlanEventosAtencionV22Instalados = true;

    async function aplicarContextoPlanDesdeEvento(evento){
        const detalle = evento && evento.detail && typeof evento.detail === 'object'
            ? evento.detail
            : {};

        const idAtencion = String(
            detalle.id_atencion ||
            detalle.idAtencion ||
            ''
        ).trim();

        if(!idAtencion) return;

        window.planState = window.planState || { atencionActual:'', cache:{} };

        /* La atención emitida por Atenciones manda sobre cualquier estado previo. */
        window.planState.atencionActual = idAtencion;

        /* Fuerza a cambiarPlanPorAtencion a reconocer el cambio real de pantalla. */
        if(String(window.__auroPlanAtencionRenderizada || '').trim() !== idAtencion){
            limpiarPlanTemporal();
        }

        await cambiarPlanPorAtencion(idAtencion);

        if(typeof window.auroHistoriaRefrescarEstadoConsultaActiva === 'function'){
            setTimeout(function(){
                try{ window.auroHistoriaRefrescarEstadoConsultaActiva('hc_plan'); }catch(e){}
            }, 0);
        }
    }

    window.addEventListener('aurosanax:atencion-iniciada', aplicarContextoPlanDesdeEvento);
    window.addEventListener('aurosanax:atencion-seleccionada', aplicarContextoPlanDesdeEvento);
    window.addEventListener('aurosanax:atencion-cambiada', aplicarContextoPlanDesdeEvento);
})();

/* ============================================================
   ESTADO VISUAL BOTÓN GUARDAR PLAN
   IASYN FIX:
   Esta función queda como dueña del botón Actualizar Plan Clínico.
   Evita doble clic y actualiza el panel premium al finalizar.
============================================================ */
window.auroPlanGuardando = false;

function auroPlanUXFechaHoraAhora(){
    try{
        return new Date().toLocaleString('es-EC', {
            year:'numeric',
            month:'2-digit',
            day:'2-digit',
            hour:'2-digit',
            minute:'2-digit',
            hour12:false
        });
    }catch(e){
        return new Date().toLocaleString('es-EC', {
            hour12:false
        });
    }
}

function auroPlanUXEscape(txt){
    return String(txt || '').replace(/[&<>'"]/g, c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        "'":'&#39;',
        '"':'&quot;'
    }[c]));
}

function auroPlanUXAtencionResumen(){
    try{
        if(typeof window.getAtencionActiva === 'function'){
            const a = window.getAtencionActiva();
            if(a){
                return {
                    id: String(a.id_atencion || ''),
                    consulta: a.numero_consulta ? ('#' + a.numero_consulta) : 'activa'
                };
            }
        }
    }catch(e){}

    const id = auroPlanObtenerIdAtencionActivaSeguro();
    return {
        id: id,
        consulta: id ? 'activa' : 'sin atención activa'
    };
}

function auroPlanUXGuardarFechaLocal(idAtencion, fechaHora){
    try{
        if(!idAtencion) return;
        const key = 'iasyn_plan_ultimas_actualizaciones_v1';
        const raw = localStorage.getItem(key);
        const mapa = raw ? JSON.parse(raw) : {};
        mapa[idAtencion] = fechaHora;
        localStorage.setItem(key, JSON.stringify(mapa));
    }catch(e){
        console.warn('IASYN PLAN UX: no se pudo guardar fecha local del Plan.', e);
    }
}

function auroPlanUXRecetaTexto(idAtencion){
    try{
        const raw = localStorage.getItem('aurosanax_recetas_emitidas_v1');
        const arr = raw ? JSON.parse(raw) : [];
        if(!Array.isArray(arr)) return 'Receta pendiente';

        const recetas = arr
            .filter(r => String(r.id_atencion || '').trim() === String(idAtencion || '').trim())
            .sort((a,b) => String(b.actualizado_en || b.creado_en || b.fecha_receta || '').localeCompare(String(a.actualizado_en || a.creado_en || a.fecha_receta || '')));

        const r = recetas[0];
        if(!r) return 'Receta pendiente';

        const f = r.actualizado_en || r.creado_en || r.fecha_receta || '';
        return 'Receta guardada: ' + String(f);
    }catch(e){
        return 'Receta pendiente';
    }
}

function auroPlanUXPintarPanelPlanGuardado(fechaHora){
    const box = document.getElementById('auroPlanMiniStatus');
    if(!box) return;

    const atn = auroPlanUXAtencionResumen();
    const recetaTexto = auroPlanUXRecetaTexto(atn.id);

    box.innerHTML =
        '<span><i class="bi bi-journal-medical"></i> Consulta ' + auroPlanUXEscape(atn.consulta) + '</span>' +
        '<span class="ok"><i class="bi bi-list-check"></i> Plan actualizado: ' + auroPlanUXEscape(fechaHora) + '</span>' +
        '<span class="' + (recetaTexto.includes('guardada') ? 'ok' : 'muted') + '"><i class="bi bi-capsule"></i> ' + auroPlanUXEscape(recetaTexto) + '</span>';
}

async function guardarPlanClinicoConUX(btn){

    if(window.auroPlanGuardando){
        return {success:false,message:'Guardado en progreso'};
    }

    window.auroPlanGuardando = true;

    const textoOriginal = btn ? btn.innerHTML : '';

    try{
        if(btn){
            btn.disabled = true;
            btn.style.opacity = '0.65';
            btn.style.cursor = 'not-allowed';
            btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Guardando plan...';
        }

        const r = await guardarPlanClinicoDesdeSheets();

        if(r && r.success === false){
            throw new Error(r.message || 'No se pudo guardar el Plan clínico.');
        }

        const atn = auroPlanUXAtencionResumen();
        const fechaHora = auroPlanUXFechaHoraAhora();

        auroPlanUXGuardarFechaLocal(atn.id, fechaHora);
        auroPlanUXPintarPanelPlanGuardado(fechaHora);

        if(typeof window.auroPlanActualizarMiniStatus === 'function'){
            setTimeout(function(){
                auroPlanUXPintarPanelPlanGuardado(fechaHora);
            }, 300);
        }

        if(typeof window.auroPlanMostrarEstadoGuardado === 'function'){
            window.auroPlanMostrarEstadoGuardado(
                'Plan clínico guardado correctamente. Última actualización del Plan: ' + fechaHora + '.'
            );
        }

        if(btn){
            btn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Plan actualizado ✓';
            setTimeout(function(){
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.innerHTML = textoOriginal || '<i class="bi bi-list-check me-1"></i> Actualizar Plan Clínico';
            },2500);
        }

        return r || {success:true};

    }catch(e){

        console.error('IASYN PLAN: error guardando plan clínico.', e);
        alert('No se pudo guardar el Plan clínico.\n\n' + (e && e.message ? e.message : 'Revise el control de correcciones.'));

        if(btn){
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.innerHTML = textoOriginal || '<i class="bi bi-list-check me-1"></i> Actualizar Plan Clínico';
        }

        return {success:false,message:e.message || String(e)};

    }finally{
        setTimeout(()=>window.auroPlanGuardando=false,500);
    }
}

window.guardarPlanClinicoConUX = guardarPlanClinicoConUX;
window.auroPlanGuardarPlanClinicoConUXPlanJS = guardarPlanClinicoConUX;

/* ============================================================
   IASYN PLAN - CORRECCIÓN NAVEGACIÓN MISMA ATENCIÓN
   - No limpia el Plan al volver a la misma consulta
   - No recarga Sheets sobre cambios temporales de la misma atención
   - Verifica la atención activa antes de una carga diferida============================================================ */

/* ============================================================
   IASYN PLAN - FIX SINCRONIZACIÓN ID_ATENCION
   - Fuente oficial: getAtencionActiva()
   - planState se usa como cache, no como autoridad clínica
   - Bloquea mezcla entre consultas
   - Descarta respuestas tardías
   - No modifica JSON, Apps Script ni estructura de datos
============================================================ */

/* ============================================================
   IASYN PLAN - CORRECCIÓN DEFINITIVA CAMBIO DE CONSULTA
   - Diferencia atención interna de atención realmente renderizada
   - Evita guardar datos viejos bajo una atención nueva
   - Limpia medicamentos y campos de receta al cambiar consulta
   - Conserva cache temporal únicamente por id_atencion correcto
============================================================ */

/* ============================================================
   IASYN PLAN - RESTABLECIMIENTO AISLADO Y SEGURO v25
   BASE: PLAN 22 ESTABLE
   REGLAS:
   - No reemplaza, envuelve ni modifica Aplicar plan.
   - No reemplaza, envuelve ni modifica Actualizar plan clínico.
   - No realiza llamadas automáticas a Sheets ni Apps Script.
   - Limpia solo el estado visual/temporal de la atención activa.
   - El guardado se confirma exclusivamente con el botón original.
   - Bloquea el restablecimiento en atenciones finalizadas.
============================================================ */

(function auroPlanModuloRestablecimientoAislado(){
    'use strict';

    if(window.__AURO_PLAN_RESET_AISLADO_V25__) return;
    window.__AURO_PLAN_RESET_AISLADO_V25__ = true;

    function clonarSeguro(valor){
        try{
            return JSON.parse(JSON.stringify(valor));
        }catch(e){
            return valor;
        }
    }

    function obtenerAtencionActivaCompleta(){
        try{
            if(typeof window.getAtencionActiva === 'function'){
                return window.getAtencionActiva() || null;
            }
        }catch(e){}
        return null;
    }

    function obtenerIdAtencionActiva(){
        const atencion = obtenerAtencionActivaCompleta();
        return String(
            atencion?.id_atencion ||
            (typeof window.auroPlanObtenerIdAtencionActivaSeguro === 'function'
                ? window.auroPlanObtenerIdAtencionActivaSeguro()
                : '') ||
            window.planState?.atencionActual ||
            ''
        ).trim();
    }

    function atencionEstaFinalizada(){
        const atencion = obtenerAtencionActivaCompleta();
        const estado = normalizarTextoPlan(
            atencion?.estado_atencion ||
            atencion?.estado ||
            ''
        );

        return [
            'finalizada',
            'finalizado',
            'cerrada',
            'cerrado',
            'completada',
            'completado'
        ].includes(estado);
    }

    function validarContexto(){
        const idActivo = obtenerIdAtencionActiva();
        const idInterno = String(window.planState?.atencionActual || '').trim();
        const idVisible = String(window.__auroPlanAtencionRenderizada || '').trim();

        if(!idActivo){
            return {ok:false, mensaje:'No existe una atención activa.'};
        }

        if(idInterno && idInterno !== idActivo){
            return {ok:false, mensaje:'El Plan interno pertenece a otra atención.'};
        }

        if(idVisible && idVisible !== idActivo){
            return {ok:false, mensaje:'El Plan visible pertenece a otra atención.'};
        }

        if(atencionEstaFinalizada()){
            return {
                ok:false,
                finalizada:true,
                mensaje:'Esta atención está finalizada. El Plan no puede restablecerse.'
            };
        }

        return {ok:true, idAtencion:idActivo};
    }

    function capturarEstado(){
        return {
            medicamentos:clonarSeguro(window.medicamentosPlanSeleccionados || []),
            ordenes:clonarSeguro(window.ordenesMedicasPlanSeleccionadas || []),
            interconsultas:clonarSeguro(window.interconsultasPlanSeleccionadas || []),
            plan:auroPlanGetValue('hcPlanTratamiento'),
            indicaciones:auroPlanGetValue('hcIndicacionesPaciente'),
            receta:auroPlanGetValue('hcRecetaMedicamentos'),
            ordenesTexto:auroPlanGetValue('hcExamenesSolicitados'),
            interconsultaTexto:auroPlanGetValue('hcInterconsultaResumen'),
            evaluaciones:auroPlanGetValue('hcEvaluacionesResumen'),
            evaluacionesChecks:typeof auroPlanCapturarEvaluaciones === 'function'
                ? auroPlanCapturarEvaluaciones()
                : {},
            control:auroPlanGetValue('hcControl'),
            estadoHistoria:auroPlanGetValue('hcEstadoHistoria')
        };
    }

    function estadoTieneContenido(data){
        return !!(
            (data.medicamentos || []).length ||
            (data.ordenes || []).length ||
            (data.interconsultas || []).length ||
            String(data.plan || '').trim() ||
            String(data.indicaciones || '').trim() ||
            String(data.receta || '').trim() ||
            String(data.ordenesTexto || '').trim() ||
            String(data.interconsultaTexto || '').trim() ||
            String(data.evaluaciones || '').trim() ||
            String(data.control || '').trim() ||
            Object.values(data.evaluacionesChecks || {}).some(Boolean)
        );
    }

    function limpiarSoloPantallaYCache(idAtencion){
        window.auroPlanMedicamentoEditandoIndice = null;
        window.medicamentosPlanSeleccionados = [];
        window.ordenesMedicasPlanSeleccionadas = [];
        window.interconsultasPlanSeleccionadas = [];

        [
            'hcPlanTratamiento',
            'hcIndicacionesPaciente',
            'hcRecetaMedicamentos',
            'hcExamenesSolicitados',
            'hcInterconsultaResumen',
            'hcEvaluacionesResumen',
            'hcControl'
        ].forEach(function(id){ auroPlanSetValue(id, ''); });

        if(typeof limpiarFormularioMedicamento === 'function') limpiarFormularioMedicamento();
        if(typeof limpiarFormularioOrdenMedica === 'function') limpiarFormularioOrdenMedica();
        if(typeof limpiarFormularioInterconsulta === 'function') limpiarFormularioInterconsulta();
        if(typeof limpiarEvaluacionesCamposPlan === 'function') limpiarEvaluacionesCamposPlan();

        /* Solo limpia la preparación proveniente del Plan; no elimina una receta emitida. */
        auroPlanSetValue('recMedicamento', '');
        auroPlanSetValue('recIndicaciones', '');
        auroPlanSetValue('recRecomendaciones', '');

        window.planState = window.planState || {atencionActual:idAtencion, cache:{}};
        window.planState.atencionActual = idAtencion;
        window.planState.cache = window.planState.cache || {};
        window.planState.cache[idAtencion] = {
            medicamentos:[],
            ordenes:[],
            interconsultas:[],
            plan:'',
            indicaciones:'',
            ordenesTexto:'',
            interconsultaTexto:'',
            evaluaciones:'',
            evaluacionesChecks:{},
            receta:''
        };

        if(typeof auroPlanRefrescarVistas === 'function') auroPlanRefrescarVistas();
        if(typeof guardarPlanTemporal === 'function') guardarPlanTemporal();
    }

    function restaurarEstado(idAtencion, data){
        window.auroPlanMedicamentoEditandoIndice = null;
        window.medicamentosPlanSeleccionados = clonarSeguro(data.medicamentos || []);
        window.ordenesMedicasPlanSeleccionadas = clonarSeguro(data.ordenes || []);
        window.interconsultasPlanSeleccionadas = clonarSeguro(data.interconsultas || []);

        auroPlanSetValue('hcPlanTratamiento', data.plan || '');
        auroPlanSetValue('hcIndicacionesPaciente', auroPlanValorClinicoATexto(data.indicaciones || ''));
        auroPlanSetValue('hcRecetaMedicamentos', auroPlanValorClinicoATexto(data.receta || ''));
        auroPlanSetValue('hcExamenesSolicitados', data.ordenesTexto || '');
        auroPlanSetValue('hcInterconsultaResumen', data.interconsultaTexto || '');
        auroPlanSetValue('hcEvaluacionesResumen', data.evaluaciones || '');
        auroPlanSetValue('hcControl', data.control || '');
        auroPlanSetValue('hcEstadoHistoria', data.estadoHistoria || 'Activo');

        if(typeof auroPlanRestaurarEvaluaciones === 'function'){
            auroPlanRestaurarEvaluaciones(data.evaluacionesChecks || {});
        }

        window.planState = window.planState || {atencionActual:idAtencion, cache:{}};
        window.planState.atencionActual = idAtencion;
        window.planState.cache = window.planState.cache || {};
        window.planState.cache[idAtencion] = {
            medicamentos:clonarSeguro(data.medicamentos || []),
            ordenes:clonarSeguro(data.ordenes || []),
            interconsultas:clonarSeguro(data.interconsultas || []),
            plan:data.plan || '',
            indicaciones:data.indicaciones || '',
            ordenesTexto:data.ordenesTexto || '',
            interconsultaTexto:data.interconsultaTexto || '',
            evaluaciones:data.evaluaciones || '',
            evaluacionesChecks:clonarSeguro(data.evaluacionesChecks || {}),
            receta:data.receta || ''
        };

        if(typeof auroPlanRefrescarVistas === 'function') auroPlanRefrescarVistas();
        if(typeof sincronizarPlanConReceta === 'function') sincronizarPlanConReceta();
        if(typeof guardarPlanTemporal === 'function') guardarPlanTemporal();
    }

    function cerrarModal(valor){
        document.getElementById('auroPlanResetModalV25')?.remove();
        const resolver = window.__auroPlanResetResolverV25;
        window.__auroPlanResetResolverV25 = null;
        if(typeof resolver === 'function') resolver(valor);
    }

    function confirmarLimpieza(idAtencion){
        return new Promise(function(resolve){
            document.getElementById('auroPlanResetModalV25')?.remove();
            window.__auroPlanResetResolverV25 = resolve;

            const modal = document.createElement('div');
            modal.id = 'auroPlanResetModalV25';
            modal.className = 'auro-plan-reset-modal-v25';
            modal.innerHTML = `
              <div class="auro-plan-reset-panel-v25" role="dialog" aria-modal="true">
                <h5>Limpiar plan clínico</h5>
                <p>Se limpiará solo el Plan de esta atención.</p>
                <div class="auro-plan-reset-warning-v25">
                  La receta guardada no se eliminará; deberá actualizarla manualmente.
                </div>
                <small>Atención protegida: ${escapeHtmlPlan(idAtencion)}</small>
                <div class="auro-plan-reset-buttons-v25">
                  <button type="button" class="btn btn-outline-secondary" data-action="cancelar">Cancelar</button>
                  <button type="button" class="btn btn-danger" data-action="limpiar">
                    <i class="bi bi-trash3 me-1"></i> Limpiar plan
                  </button>
                </div>
              </div>`;

            document.body.appendChild(modal);
            modal.querySelector('[data-action="cancelar"]')?.addEventListener('click', function(){ cerrarModal('cancelar'); });
            modal.querySelector('[data-action="limpiar"]')?.addEventListener('click', function(){ cerrarModal('limpiar'); });
            modal.addEventListener('click', function(e){ if(e.target === modal) cerrarModal('cancelar'); });
        });
    }

    async function restablecerPlan(){
        const validacion = validarContexto();
        if(!validacion.ok){
            alert(validacion.mensaje);
            actualizarEstadoBoton();
            return;
        }

        const anterior = capturarEstado();
        if(!estadoTieneContenido(anterior)){
            alert('El Plan de esta atención ya está vacío.');
            return;
        }

        const decision = await confirmarLimpieza(validacion.idAtencion);
        if(decision !== 'limpiar') return;

        const revalidacion = validarContexto();
        if(!revalidacion.ok || revalidacion.idAtencion !== validacion.idAtencion){
            alert('La atención activa cambió. No se realizó la limpieza.');
            return;
        }

        window.__auroPlanUltimaLimpiezaV25 = {
            idAtencion:validacion.idAtencion,
            data:clonarSeguro(anterior)
        };

        limpiarSoloPantallaYCache(validacion.idAtencion);        actualizarEstadoBoton();
    }

    function deshacerLimpieza(){
        const respaldo = window.__auroPlanUltimaLimpiezaV25;
        const validacion = validarContexto();

        if(!respaldo || !validacion.ok || respaldo.idAtencion !== validacion.idAtencion){
            alert('No existe una limpieza disponible para deshacer en esta atención.');
            actualizarEstadoBoton();
            return;
        }

        restaurarEstado(validacion.idAtencion, clonarSeguro(respaldo.data));
        window.__auroPlanUltimaLimpiezaV25 = null;
        actualizarEstadoBoton();
    }

    function buscarBotonActualizarOriginal(){
        return Array.from(document.querySelectorAll('#hc_plan button, button')).find(function(btn){
            const onclick = String(btn.getAttribute('onclick') || '');
            const texto = normalizarTextoPlan(btn.textContent || '');
            return onclick.includes('guardarPlanClinicoConUX') ||
                   onclick.includes('guardarPlanClinicoDesdeSheets') ||
                   texto.includes('actualizar plan clinico');
        }) || null;
    }

    function actualizarEstadoBoton(){
        const reset = document.getElementById('auroPlanBtnRestablecerV25');
        const undo = document.getElementById('auroPlanBtnDeshacerV25');
        if(!reset || !undo) return;

        const finalizada = atencionEstaFinalizada();
        reset.disabled = finalizada || !obtenerIdAtencionActiva();
        reset.title = finalizada
            ? 'No disponible en atenciones finalizadas'
            : 'Limpiar únicamente el Plan de la atención activa';

        const respaldo = window.__auroPlanUltimaLimpiezaV25;
        undo.classList.toggle(
            'd-none',
            !respaldo || respaldo.idAtencion !== obtenerIdAtencionActiva() || finalizada
        );
    }

    function instalarEstilos(){
        if(document.getElementById('auroPlanResetStylesV25')) return;
        const style = document.createElement('style');
        style.id = 'auroPlanResetStylesV25';
        style.textContent = `
          .auro-plan-reset-inline-v25{display:inline-flex;align-items:center;gap:8px;margin-left:8px;vertical-align:middle}
          .auro-plan-reset-inline-v25 .btn{min-height:42px;white-space:nowrap}
          .auro-plan-reset-modal-v25{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.58)}
          .auro-plan-reset-panel-v25{width:min(500px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:22px;box-shadow:0 28px 80px rgba(15,23,42,.30)}
          .auro-plan-reset-panel-v25 h5{margin:0 0 8px;font-weight:850;color:#111827}
          .auro-plan-reset-panel-v25 p{margin:0 0 10px;color:#475569}
          .auro-plan-reset-warning-v25{padding:10px 12px;margin-bottom:10px;border-radius:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;font-size:13px}
          .auro-plan-reset-panel-v25 small{display:block;color:#64748b;word-break:break-all}
          .auro-plan-reset-buttons-v25{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}
          @media(max-width:768px){
            .auro-plan-reset-inline-v25{display:flex;width:100%;margin:8px 0 0;flex-wrap:wrap}
            .auro-plan-reset-inline-v25 .btn{flex:1 1 165px}
            .auro-plan-reset-buttons-v25{display:grid;grid-template-columns:1fr}
            .auro-plan-reset-buttons-v25 .btn{width:100%}
          }
        `;
        document.head.appendChild(style);
    }

    function instalarBotones(){
        instalarEstilos();

        if(document.getElementById('auroPlanResetGrupoV25')){
            actualizarEstadoBoton();
            return true;
        }

        const original = buscarBotonActualizarOriginal();
        if(!original) return false;

        const grupo = document.createElement('span');
        grupo.id = 'auroPlanResetGrupoV25';
        grupo.className = 'auro-plan-reset-inline-v25';

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.id = 'auroPlanBtnRestablecerV25';
        reset.className = 'btn btn-outline-secondary';
        reset.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i> Limpiar plan';
        reset.addEventListener('click', restablecerPlan);

        const undo = document.createElement('button');
        undo.type = 'button';
        undo.id = 'auroPlanBtnDeshacerV25';
        undo.className = 'btn btn-outline-secondary d-none';
        undo.innerHTML = '<i class="bi bi-arrow-90deg-left me-1"></i> Deshacer limpieza';
        undo.addEventListener('click', deshacerLimpieza);

        grupo.appendChild(reset);
        grupo.appendChild(undo);

        /* Inserción aditiva: el botón original no se mueve, clona, reemplaza ni envuelve. */
        original.insertAdjacentElement('afterend', grupo);
        actualizarEstadoBoton();
        return true;
    }

    let intentos = 0;
    const instalador = setInterval(function(){
        intentos += 1;
        if(instalarBotones() || intentos >= 40){
            clearInterval(instalador);
        }
    }, 250);

    /* Solo actualiza habilitación visual; no carga, guarda ni sincroniza datos. */
    window.__auroPlanResetEstadoTimerV25 = setInterval(actualizarEstadoBoton, 1200);
})();

/* ============================================================
   IASYN PLAN - CORRECCIÓN QUIRÚRGICA DE CARGA ESTABLE v26
   - cambiarPlanPorAtencion espera la carga real desde Sheets.
   - Se elimina únicamente el retraso artificial de 80 ms.
   - Las consultas GET del Plan usan cache:no-store y parámetro temporal.
   - Se emite aurosanax:plan-cargado al terminar la atención correcta.
   - No modifica JSON, Apps Script, Google Sheets, medicamentos,
     protocolos, botones, responsive, guardado ni estructura de datos.
============================================================ */

/* ============================================================
   IASYN PLAN - RECARGA SEGURA DE ATENCIÓN FINALIZADA v27
   - Al pulsar Ver sobre una atención finalizada, recarga el Plan desde Sheets
     aunque el id_atencion coincida con la atención ya renderizada.
   - Conserva el comportamiento anterior para atenciones abiertas:
     no pierde cambios temporales al navegar entre pestañas.
   - No modifica JSON, Apps Script, Google Sheets, protocolos,
     medicamentos, botones, responsive ni guardado.
============================================================ */
